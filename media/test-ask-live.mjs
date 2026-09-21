/**
 * Test END-TO-END delle domande interattive, con il MODELLO VERO.
 *
 * Verifica che la catena completa regga su un turno reale:
 *   prompt → il modello chiama `ask_user` → il server manda `ask_request` sulla SSE →
 *   il client risponde da `/api/ask/respond` → il tool riprende → il modello USA la risposta.
 *
 * E poi i casi che in uso reale rompono i sistemi "a promessa appesa":
 *   - risposta non valida → 400 e la domanda resta pendente;
 *   - secondo prompt mentre si attende → 409 con messaggio utile (non un doppio turno);
 *   - ⏹ stop mentre si attende → la domanda si chiude (cancelled) e il turno finisce;
 *   - salto (decline) → il modello prosegue da solo, dichiarando l'assunzione;
 *   - lo stato espone la domanda pendente (è ciò che la fa riapparire al reload).
 *
 * Avvia da sé un'istanza isolata (porta 8496, cartelle in /tmp) e la spegne alla fine.
 * Uso: node media/test-ask-live.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8496;
const TMP = "/tmp/pi-asklive";
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = "Basic " + Buffer.from("ak:ak").toString("base64");

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
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, opts = {}) =>
  fetch(BASE + p, {
    ...opts,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

/* ---------------- raccoglitore SSE ---------------- */
const eventi = [];
let readerAbort = null;
async function leggiSSE() {
  const ctrl = new AbortController();
  readerAbort = ctrl;
  const res = await fetch(BASE + "/events", { headers: { Authorization: AUTH }, signal: ctrl.signal });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1];
          const data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (ev) {
            let parsed = null;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }
            eventi.push({ event: ev, data: parsed, at: Date.now() });
          }
        }
      }
    } catch {
      /* chiusura voluta */
    }
  })();
}

/** Attende un evento che soddisfi il predicato (o fallisce). */
async function attendi(descrizione, predicate, msMax = 120_000) {
  const t0 = Date.now();
  for (;;) {
    const trovato = eventi.find(predicate);
    if (trovato) return trovato;
    if (Date.now() - t0 > msMax) {
      ko(`timeout in attesa di: ${descrizione}`);
      return null;
    }
    await wait(250);
  }
}
const chiedi = (predicato, msMax = 120_000) =>
  attendi("evento", predicato, msMax);
const ultimoIndice = () => eventi.length;

/**
 * Invia un prompt e attende che sia ACCETTATO: subito dopo la fine di un turno la sessione può
 * risultare ancora occupata per qualche istante (409), quindi si ritenta invece di dichiarare
 * un guasto che non esiste.
 */
async function promptAccettato(testo, tentativi = 20) {
  for (let i = 0; i < tentativi; i++) {
    const r = await api("/api/prompt", { method: "POST", body: JSON.stringify({ text: testo }) });
    if (r.status === 202) return true;
    if (r.status !== 409) {
      ko(`prompt rifiutato con ${r.status}`);
      return false;
    }
    await wait(500);
  }
  ko("il prompt non è mai stato accettato (sessione sempre occupata)");
  return false;
}

/* ---------------- setup ---------------- */
fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root", "skills"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_ASK_LOG_FILE: path.join(TMP, "media", "ask-log.jsonl"),
  DASH_SUBAGENT_EXT: path.join(TMP, "nessun-subagent.ts"),
  DASH_BROWSER_BIN: path.join(TMP, "nessun-browser"),
  DASH_USER: "ak",
  DASH_PASSWORD: "ak",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "ignore"],
});
let logServer = "";
dash.stdout.on("data", (b) => (logServer += b.toString("utf8")));
const cleanup = () => {
  try {
    readerAbort?.abort();
  } catch {}
  try {
    dash.kill("SIGKILL");
  } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await api("/api/state");
    if (r.status === 200) {
      up = true;
      break;
    }
  } catch {}
  await wait(500);
}
if (!up) {
  console.log("✘ istanza di prova non partita\n" + logServer);
  cleanup();
  process.exit(1);
}
check("l'istanza di prova espone il tool delle domande", /ask\] tool «ask_user» registrato/.test(logServer));
const st0 = await (await api("/api/state")).json();
check("lo stato iniziale dichiara la sezione ask (nessuna domanda pendente)", st0.ask && Array.isArray(st0.ask.pending) && st0.ask.pending.length === 0);
await api("/api/thinking", { method: "POST", body: JSON.stringify({ level: "low" }) });
await leggiSSE();
await wait(300);

/* ---------------- 1. turno con domanda e risposta ---------------- */
console.log("\n== 1. l'agente chiede, l'utente risponde, il turno riprende ==");
let mark = ultimoIndice();
const r1 = await api("/api/prompt", {
  method: "POST",
  body: JSON.stringify({
    text:
      "Ho bisogno di pubblicare il sito. Usa il tool ask_user per chiedermi su quale ambiente pubblicare, " +
      "con due opzioni: «Staging» (prova, reversibile) e «Produzione» (va online). Poi, dopo la mia risposta, " +
      "rispondi in una riga sola ripetendo l'ambiente che ho scelto.",
  }),
});
check("il prompt è accettato", r1.status === 202, `status ${r1.status}`);

const req = await attendi("ask_request (la domanda all'utente)", (e, i) => e.event === "ask_request" && i >= mark, 150_000);
if (!req) {
  console.log("eventi ricevuti: " + eventi.slice(-12).map((e) => e.event).join(", "));
  cleanup();
  process.exit(1);
}
const q = req.data;
check("la domanda descrive l'ambiente", /ambient/i.test(JSON.stringify(q.questions)), JSON.stringify(q.questions).slice(0, 160));
check("la domanda offre le due opzioni chieste", q.questions[0]?.options?.length >= 2);
check("la domanda ha una scadenza (nessuna attesa infinita)", typeof q.timeoutAt === "number" && q.timeoutAt > Date.now());
check("l'id della domanda è il toolCallId (si aggancia alla card giusta)", typeof q.id === "string" && q.id.length > 4);

// il turno è sospeso: lo stato lo dice
const stPending = await (await api("/api/state")).json();
check("lo stato mostra la domanda pendente (sparisce/riappare senza perdere nulla)", stPending.ask.pending.some((p) => p.id === q.id));
check("il turno risulta in corso (la UI mostra ⏹, non «idle»)", stPending.streaming === true);

// un secondo prompt mentre si attende → 409 parlante, non un doppio turno
const r409 = await api("/api/prompt", { method: "POST", body: JSON.stringify({ text: "ci sei?" }) });
const d409 = await r409.json();
check("un secondo prompt durante l'attesa è rifiutato con spiegazione", r409.status === 409 && /domanda in attesa/i.test(d409.error));

// risposta non valida → 400 e la domanda resta pendente
const rBad = await api("/api/ask/respond", {
  method: "POST",
  body: JSON.stringify({ id: q.id, action: "accept", answers: [{ id: q.questions[0].id, selected: ["Ambiente Inesistente"] }] }),
});
check("una risposta con opzione non offerta è rifiutata (400)", rBad.status === 400);
const stAfterBad = await (await api("/api/state")).json();
check("dopo il rifiuto la domanda è ANCORA in attesa", stAfterBad.ask.pending.some((p) => p.id === q.id));

// risposta vera: scelgo Produzione (o l'etichetta equivalente)
const etichetta = q.questions[0].options.map((o) => o.label).find((l) => /produz/i.test(l)) || q.questions[0].options[1].label;
const rOk = await api("/api/ask/respond", {
  method: "POST",
  body: JSON.stringify({ id: q.id, action: "accept", answers: [{ id: q.questions[0].id, selected: [etichetta] }] }),
});
check("la risposta viene accettata", rOk.status === 200 && (await rOk.json()).status === "answered");

const resolved = await chiedi((e) => e.event === "ask_resolved" && e.data.id === q.id, 30_000);
check("il client riceve l'esito della domanda", resolved?.data.status === "answered");
check("la risposta scelta è nell'esito", JSON.stringify(resolved?.data.answers).includes(etichetta));

mark = ultimoIndice();
const fine1 = await chiedi((e) => e.event === "status" && e.data.streaming === false, 180_000);
check("il turno riprende e si conclude", fine1 !== null);
await wait(600);
const st1 = await (await api("/api/state")).json();
const messaggi = JSON.stringify(st1.messages || []);
check("il modello ha usato la risposta scelta", new RegExp(etichetta.split(" ")[0], "i").test(messaggi));
const toolBlock = (st1.messages || [])
  .filter((m) => m.role === "assistant")
  .flatMap((m) => m.blocks || [])
  .find((b) => b.ask);
check("il messaggio conserva la domanda con l'esito (ricostruibile al reload)", toolBlock?.ask?.result?.status === "answered");
check(
  "la risposta dell'utente è nel risultato salvato (non solo a schermo)",
  JSON.stringify(toolBlock?.ask?.result?.answers || []).includes(etichetta),
);

/* ---------------- 2. salto: l'agente prosegue da solo ---------------- */
console.log("\n== 2. l'utente salta: l'agente prosegue con il proprio giudizio ==");
mark = ultimoIndice();
await promptAccettato(
  "Usa il tool ask_user per chiedermi quale nome dare a un file di prova (opzioni: «Alfa», «Beta»). " +
    "Poi scrivi una riga che spiega cosa hai deciso.",
);
const req2 = await attendi("seconda domanda", (e, i) => e.event === "ask_request" && i >= mark, 150_000);
check("seconda domanda posta", req2 !== null);
mark = ultimoIndice();
if (req2) {
  const rDecl = await api("/api/ask/respond", { method: "POST", body: JSON.stringify({ id: req2.data.id, action: "decline" }) });
  check("il salto è accettato", rDecl.status === 200 && (await rDecl.json()).status === "declined");
  const res2 = await chiedi((e) => e.event === "ask_resolved" && e.data.id === req2.data.id, 20_000);
  check("esito «declined» comunicato alla UI", res2?.data.status === "declined");
  const fine2 = await chiedi((e) => e.event === "status" && e.data.streaming === false, 180_000);
  check("il turno prosegue comunque (nessun blocco)", fine2 !== null);
}

/* ---------------- 3. stop durante l'attesa ---------------- */
console.log("\n== 3. ⏹ stop mentre la domanda è in attesa ==");
mark = ultimoIndice();
await promptAccettato(
  "Usa il tool ask_user per chiedermi un colore preferito (opzioni: «Rosso», «Blu»). Non fare altro.",
);
const req3 = await attendi("terza domanda", (e, i) => e.event === "ask_request" && i >= mark, 150_000);
check("terza domanda posta", req3 !== null);
if (req3) {
  const stPending3 = await (await api("/api/state")).json();
  check("la domanda è in attesa", stPending3.ask.pending.length === 1);
  const rAbort = await api("/api/abort", { method: "POST" });
  check("lo stop è accettato", rAbort.status === 200);
  const res3 = await chiedi((e) => e.event === "ask_resolved" && e.data.id === req3.data.id, 20_000);
  check("la domanda viene annullata dallo stop (nessuna promessa appesa)", res3?.data.status === "cancelled");
  const stStop = await (await api("/api/state")).json();
  check("nessuna domanda resta pendente dopo lo stop", stStop.ask.pending.length === 0);
  check("il turno è fermo", stStop.streaming === false);
  await wait(800);
  const stStop2 = await (await api("/api/state")).json();
  check("non si riapre da solo (turno concluso)", stStop2.ask.pending.length === 0 && stStop2.streaming === false);
}

/* ---------------- 4. log di audit ---------------- */
console.log("\n== 4. tracciabilità ==");
const logFile = path.join(TMP, "media", "ask-log.jsonl");
const righe = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
check("il log registra le domande poste", righe.filter((r) => r.t === "ask").length >= 3);
check("il log registra gli esiti (answered, declined, cancelled)", ["answered", "declined", "cancelled"].every((s) => righe.some((r) => r.t === "resolved" && r.status === s)));

/* ---------------- 5. nessun errore nel log del server ---------------- */
const errori = (logServer.match(/\[errore\]|Unhandled|TypeError|ReferenceError/g) || []).length;
check("nessun errore/eccezione nel log del server", errori === 0, logServer.slice(-400));

cleanup();
console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
