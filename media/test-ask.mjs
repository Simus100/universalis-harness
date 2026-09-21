/**
 * Test UNITARI delle domande interattive (`ask_user`) — senza server, senza browser, senza modello.
 *
 * Copre le invarianti che si romperebbero in silenzio:
 *  - sanificazione e limiti (input non fidato: caratteri di controllo, lunghezze, HTML);
 *  - validazione degli argomenti del modello (numero domande/opzioni, etichette duplicate,
 *    opzione "Altro" autorata, id normalizzati);
 *  - rifiuto delle domande che chiedono CREDENZIALI (spec MCP: vietato in form mode);
 *  - ciclo di vita: answered / declined / cancelled / expired, con esito SEMPRE esplicito;
 *  - idempotenza (seconda risposta = già risolta), id ignoto = 404;
 *  - annullamento (abort del turno, nuova domanda che sostituisce la precedente);
 *  - log append-only e marcatura delle domande orfane dopo un riavvio;
 *  - il tool registrato nell'estensione: id = toolCallId, errori leggibili al modello.
 *
 * Uso: node media/test-ask.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  AskError,
  LIMITS,
  createAskBroker,
  normalizeQuestions,
  sanitizeText,
  slugId,
} from "./ask-broker.mjs";
import { createAskExtension } from "./ask-tool.mjs";

let pass = 0,
  fail = 0;
const ok = (m) => {
  console.log("  ✔ " + m);
  pass++;
};
const ko = (m) => {
  console.log("  ✘ " + m);
  fail++;
};
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));
const eq = (d, a, b) => check(d, JSON.stringify(a) === JSON.stringify(b), `atteso ${JSON.stringify(b)}, ricevuto ${JSON.stringify(a)}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const Q2 = {
  context: "il progetto esiste in due versioni",
  questions: [
    {
      id: "ambiente",
      header: "Ambiente",
      question: "Su quale ambiente pubblico?",
      options: [
        { label: "Staging (consigliata)", description: "prova, reversibile" },
        { label: "Produzione", description: "va online subito" },
      ],
    },
    {
      header: "Formato",
      question: "In che formato?",
      options: [{ label: "Markdown" }, { label: "PDF" }],
      multiSelect: true,
    },
  ],
};

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ask-test-"));
const LOG = path.join(TMP, "ask-log.jsonl");
const events = [];
const brokerOpts = (extra = {}) => ({
  broadcast: (event, data) => events.push({ event, data }),
  logFile: LOG,
  hasClients: () => 1,
  sessionId: () => "sess-test",
  ...extra,
});
/** Limiti rapidi: i timeout dei test non devono far attendere 15 minuti. */
const FAST = { ...LIMITS, defaultTimeoutMs: 80, minTimeoutMs: 40, maxTimeoutMs: 300 };

/* ---------------------------------------------------------------- 1. sanificazione */
console.log("\n== 1. sanificazione dell'input non fidato ==");
check(
  "i caratteri di controllo spariscono (sequenze di escape = attacco)",
  sanitizeText("ciao\x1b[31mrosso\x07 e\x00 fine") === "ciao [31mrosso e fine" &&
    !/[\u0000-\u001F\u007F]/.test(sanitizeText("a\x1bb\x00c\x7fd")),
);
check("CRLF normalizzato", sanitizeText("a\r\nb") === "a\nb");
check("spazi compressi e trim", sanitizeText("  a   b  ") === "a b");
check("troncamento con ellissi", sanitizeText("x".repeat(50), 10).endsWith("…") && sanitizeText("x".repeat(50), 10).length === 10);
check("valori non stringa non esplodono", sanitizeText(null) === "" && sanitizeText(42) === "42");
check("slug da header accentato", slugId("Qualità percepita") === "qualita_percepita");
check("slug vuoto → fallback", slugId("!!!", "q3") === "q3");

/* ---------------------------------------------------------------- 2. validazione */
console.log("\n== 2. validazione degli argomenti del modello ==");
const norm = normalizeQuestions(Q2.questions);
eq("2 domande normalizzate", norm.length, 2);
check("id esplicito mantenuto, ricavato dall'header quando manca", norm[0].id === "ambiente" && norm[1].id === "formato");
check("multiSelect rispettato (false di default, true se chiesto)", norm[0].multiSelect === false && norm[1].multiSelect === true);
check("descrizione opzionale ammessa", norm[0].options[0].description === "prova, reversibile" && norm[1].options[0].description === "");

const throws = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
};
check("zero domande → errore", throws(() => normalizeQuestions([])) instanceof AskError);
check("5 domande → errore con spiegazione", /il massimo è 4/.test(throws(() => normalizeQuestions([...Array(5)].map(() => Q2.questions[0])))?.message ?? ""));
check("una sola opzione → errore (servono scelte concrete)", /almeno 2/.test(throws(() => normalizeQuestions([{ header: "H", question: "Q?", options: [{ label: "solo" }] }]))?.message ?? ""));
check(
  "7 opzioni → errore",
  /il massimo è 6/.test(throws(() => normalizeQuestions([{ header: "H", question: "Q?", options: [...Array(7)].map((_, i) => ({ label: "o" + i })) }]))?.message ?? ""),
);
check("domanda senza testo → errore", throws(() => normalizeQuestions([{ header: "H", options: [{ label: "a" }, { label: "b" }] }])) instanceof AskError);
check(
  "opzioni identiche → errore",
  /due opzioni identiche/.test(throws(() => normalizeQuestions([{ header: "H", question: "Q?", options: [{ label: "a" }, { label: "a" }] }]))?.message ?? ""),
);
const alt = throws(() => normalizeQuestions([{ header: "H", question: "Q?", options: [{ label: "Altro" }, { label: "b" }] }]));
check("opzione «Altro» autorata → errore che spiega che la aggiunge l'interfaccia", alt instanceof AskError && /NON aggiungere mai l'opzione/.test(alt.message));
check("id duplicati resi unici", new Set(normalizeQuestions([Q2.questions[1], Q2.questions[1]]).map((q) => q.id)).size === 2);
check("argomenti non-array → errore", throws(() => normalizeQuestions({})) instanceof AskError);

/* ---------------------------------------------------------------- 3. segreti */
console.log("\n== 3. nessuna credenziale in un questionario ==");
const secret = throws(() =>
  normalizeQuestions([
    { header: "API key", question: "Incolla la tua API key di Stripe", options: [{ label: "sk_live…" }, { label: "sk_test…" }] },
  ]),
);
check("domanda con API key → rifiuto motivato", secret instanceof AskError && /RIFIUTATO/.test(secret.message) && /form mode/.test(secret.message));
check("il rifiuto indica la strada corretta (.env / file)", /variabile d'ambiente|\.env/.test(secret.message));
const tokenOk = throws(() =>
  normalizeQuestions([
    { header: "Budget", question: "Quanti token di contesto posso usare?", options: [{ label: "Pochi" }, { label: "Tutti" }] },
  ]),
);
check("una domanda legittima sui token NON viene bloccata (nessun falso positivo)", tokenOk === null);

/* ---------------------------------------------------------------- 4. ciclo di vita */
console.log("\n== 4. ciclo di vita: answered / declined / cancelled ==");
{
  events.length = 0;
  const b = createAskBroker(brokerOpts());
  const p = b.ask({ id: "call_1", params: Q2, reason: "test" });
  const snap = b.snapshot({ withResolved: true });
  check("la domanda è pendente e visibile allo stato", snap.pending.length === 1 && snap.waitingFor === true && snap.pending[0].id === "call_1");
  check("l'evento SSE ask_request porta domande, contesto e scadenza", events[0]?.event === "ask_request" && events[0].data.questions.length === 2 && events[0].data.timeoutAt > Date.now());
  const r = b.respond("call_1", {
    action: "accept",
    answers: [
      { id: "ambiente", selected: ["Produzione"] },
      { id: "formato", selected: ["Markdown", "PDF"], other: "anche HTML" },
    ],
  });
  eq("la risposta viene accettata", r.status, "answered");
  const out = await p;
  eq("il tool riceve esito esplicito", out.status, "answered");
  eq("le opzioni scelte tornano come dato", out.details.answers[0].selected, ["Produzione"]);
  eq("il testo libero accanto alle opzioni è conservato", out.details.answers[1].other, "anche HTML");
  check("il testo per il modello elenca le risposte", /Ambiente: Produzione/.test(out.text) && /anche HTML/.test(out.text));
  check("dopo la risposta non ci sono pendenti e l'esito è in snapshot", b.snapshot().pending.length === 0 && b.snapshot({ withResolved: true }).resolved.some((x) => x.id === "call_1" && x.status === "answered"));
  check("l'evento ask_resolved è stato emesso", events.some((e) => e.event === "ask_resolved" && e.data.id === "call_1"));
  const again = throws(() => b.respond("call_1", { action: "accept", answers: [] }));
  check("seconda risposta → 409 (idempotenza, non un secondo esito)", again instanceof AskError && again.code === 409);
  const unknown = throws(() => b.respond("mai_vista", { action: "accept", answers: [] }));
  check("id sconosciuto → 404", unknown instanceof AskError && unknown.code === 404);
}
{
  const b = createAskBroker(brokerOpts());
  const p = b.ask({ id: "call_d", params: Q2 });
  b.respond("call_d", { action: "decline" });
  const out = await p;
  check("declino → esito «declined»", out.status === "declined");
  check("il testo dice di proseguire con il proprio giudizio", /miglior giudizio/.test(out.text) && /assunzione/.test(out.text));
  check("nessuna risposta inventata nel risultato", out.answers.length === 0 && out.details.answers.length === 0);
}
{
  const b = createAskBroker(brokerOpts());
  const p = b.ask({ id: "call_c", params: Q2 });
  b.respond("call_c", { action: "cancel" });
  check("annullamento → «cancelled»", (await p).status === "cancelled");
}
{
  const b = createAskBroker(brokerOpts());
  const p = b.ask({ id: "call_skip", params: Q2 });
  b.respond("call_skip", { action: "accept", answers: [] });
  check("«accetta» senza nessuna risposta → trattato come declino", (await p).status === "declined");
}
{
  const b = createAskBroker(brokerOpts());
  const p = b.ask({ id: "call_part", params: Q2 });
  b.respond("call_part", { action: "accept", answers: [{ id: "ambiente", selected: ["Staging (consigliata)"] }] });
  const out = await p;
  eq("risposta parziale ammessa", out.status, "answered");
  check("la domanda non risposta è marcata «skipped»", out.details.answers[1].skipped === true);
  check("il testo segnala le domande saltate", /Saltate: Formato/.test(out.text));
}

/* ---------------------------------------------------------------- 5. validazione risposte */
console.log("\n== 5. risposte non conformi rifiutate (400) ==");
{
  const b = createAskBroker(brokerOpts());
  const p = b.ask({ id: "call_v", params: Q2 });
  const bad = throws(() => b.respond("call_v", { action: "accept", answers: [{ id: "ambiente", selected: ["Ambiente inesistente"] }] }));
  check("etichetta non offerta → 400", bad instanceof AskError && bad.code === 400 && /non è fra le opzioni/.test(bad.message));
  const multi = throws(() => b.respond("call_v", { action: "accept", answers: [{ id: "ambiente", selected: ["Produzione", "Staging (consigliata)"] }] }));
  check("scelta singola con più voci → 400", multi instanceof AskError && /scelta singola/.test(multi.message));
  const act = throws(() => b.respond("call_v", { action: "boh", answers: [] }));
  check("azione sconosciuta → 400", act instanceof AskError && /azione non valida/.test(act.message));
  check("dopo le richieste non valide la domanda è ANCORA pendente", b.snapshot().pending.length === 1);
  b.respond("call_v", { action: "accept", answers: [{ id: "ambiente", other: "un altro ambiente" }] });
  const out = await p;
  check("testo libero dell'utente accettato come risposta", out.status === "answered" && out.details.answers[0].other === "un altro ambiente");
  check("le risposte troppo lunghe sono troncate", out.details.answers[0].other.length <= LIMITS.otherMax);
}

/* ---------------------------------------------------------------- 6. timeout, abort, sostituzione */
console.log("\n== 6. timeout, interruzione, sostituzione ==");
{
  const b = createAskBroker(brokerOpts({ limits: FAST }));
  const p = b.ask({ id: "call_t", params: Q2, });
  const out = await p;
  check("nessuna risposta entro il tempo → «expired»", out.status === "expired");
  check("il testo spiega che si prosegue con il miglior giudizio", /tempo massimo/.test(out.text));
  check("la card viene avvisata (ask_resolved expired)", b.snapshot({ withResolved: true }).resolved.some((r) => r.id === "call_t" && r.status === "expired"));
}
{
  const b = createAskBroker(brokerOpts());
  const ctrl = new AbortController();
  const p = b.ask({ id: "call_a", params: Q2, signal: ctrl.signal });
  ctrl.abort();
  check("interruzione del turno → «cancelled»", (await p).status === "cancelled");
}
{
  const b = createAskBroker(brokerOpts());
  const first = b.ask({ id: "call_1a", params: Q2 });
  await wait(5);
  const second = b.ask({ id: "call_1b", params: Q2 });
  check("una nuova domanda chiude la precedente (una sola attesa alla volta)", (await first).status === "cancelled" && b.snapshot().pending.length === 1 && b.snapshot().pending[0].id === "call_1b");
  b.cancelAll("test cancelAll");
  check("cancelAll chiude tutte le pendenti", (await second).status === "cancelled" && b.snapshot().pending.length === 0);
}

/* ---------------------------------------------------------------- 7. log e orfani */
console.log("\n== 7. log append-only e domande orfane (riavvio) ==");
{
  const lines = fs
    .readFileSync(LOG, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  const asks = lines.filter((l) => l.t === "ask");
  const resolvedRec = lines.filter((l) => l.t === "resolved");
  check("ogni domanda è registrata nel log", asks.length >= 8);
  check("ogni esito è registrato con stato e durata", resolvedRec.some((r) => r.status === "answered" && typeof r.ms === "number"));
  check("il log registra anche le domande poste (per l'audit)", asks.every((a) => Array.isArray(a.questions) && a.questions.length > 0));

  const log2 = path.join(TMP, "ask-log-orphan.jsonl");
  fs.writeFileSync(log2, JSON.stringify({ t: "ask", pending: true, id: "orfana_1", sessionId: "s", questions: [], ts: new Date().toISOString() }) + "\n");
  const b2 = createAskBroker(brokerOpts({ logFile: log2, limits: FAST }));
  const marked = b2.markOrphansExpired();
  check("domanda rimasta aperta al riavvio → marcata scaduta", marked === 1);
  const after = fs
    .readFileSync(log2, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  check("nel log c'è l'esito «expired» con la causa", after.some((l) => l.t === "resolved" && l.id === "orfana_1" && l.status === "expired" && /riavvio/.test(l.reason)));
  check("una domanda già risolta non viene rimarcata", b2.markOrphansExpired() === 0);
}

/* ---------------------------------------------------------------- 8. tool dell'estensione */
console.log("\n== 8. il tool registrato parla con il broker ==");
{
  const b = createAskBroker(brokerOpts());
  const ext = createAskExtension({ broker: b });
  let registered = null;
  ext.factory({ registerTool: (t) => (registered = t) });
  check("l'estensione registra il tool", registered !== null && registered.name === "ask_user");
  check("lo schema dichiara il minimo indispensabile", registered.parameters.required.includes("questions") && registered.parameters.properties.questions.maxItems === 4);
  check("ci sono le linee guida per il modello", Array.isArray(registered.promptGuidelines) && registered.promptGuidelines.length >= 3);

  const pending = registered.execute("call_zz", Q2, null, null, {});
  await wait(5);
  check("l'id della domanda è il toolCallId (correlazione con la card)", b.snapshot().pending.some((p) => p.id === "call_zz"));
  b.respond("call_zz", { action: "accept", answers: [{ id: "ambiente", selected: ["Produzione"] }, { id: "formato", selected: ["Markdown"] }] });
  const res = await pending;
  check("il risultato è testo per il modello + dati strutturati", res.content[0].text.includes("Produzione") && res.details.status === "answered");
  check("nessun errore segnalato su una domanda valida", res.isError !== true);

  const bad = await registered.execute("call_bad", { questions: [] }, null, null, {});
  check("argomenti non validi → isError con la spiegazione (il modello può correggere)", bad.isError === true && /DOMANDA NON POSTA/.test(bad.content[0].text));

  const secret = await registered.execute("call_sec", { questions: [{ header: "Password", question: "Dimmi la password", options: [{ label: "a" }, { label: "b" }] }] }, null, null, {});
  check("richiesta di credenziali → rifiuto, nessuna domanda creata", secret.isError === true && b.snapshot().pending.length === 0);
}

/* ---------------------------------------------------------------- 9. stato esposto al client */
console.log("\n== 9. stato per il client ==");
{
  const b = createAskBroker(brokerOpts());
  const snap = b.snapshot({ withResolved: true });
  check("lo snapshot dichiara i limiti (la UI non li inventa)", snap.limits.maxQuestions === 4 && snap.limits.defaultTimeoutSeconds === 900);
  check("nessuna pendente all'avvio", snap.pending.length === 0 && snap.waitingFor === false);
  const leggero = b.snapshot();
  check(
    "lo snapshot leggero (usato nei broadcast) NON porta gli esiti: solo le pendenti",
    leggero.resolved === undefined && Array.isArray(leggero.pending) && leggero.waitingFor === false,
  );
  const p = b.ask({ id: "call_s", params: Q2 });
  const pend = b.snapshot().pending[0];
  check("la pendente porta le domande in forma pubblica", Array.isArray(pend.questions) && pend.questions[0].options.length === 2);
  b.respond("call_s", { action: "decline" });
  await p;
  check("gli esiti restano consultabili (per ricostruire le card al reload)", b.snapshot({ withResolved: true }).resolved.some((r) => r.id === "call_s" && r.status === "declined"));
  b.dispose();
  const after = await b.ask({ id: "call_dopo_dispose", params: Q2 }).catch(() => ({ status: "errore" }));
  check("dopo dispose non si aprono nuove attese (chiusura pulita)", after.status === "cancelled");
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
