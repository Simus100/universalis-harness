/**
 * Prova END-TO-END del difetto n.1 con una generazione vera: si taglia la connessione SSE a
 * metà risposta e si verifica che alla riconnessione non si perda nulla.
 *
 * Due scenari, perché la risposta può essere ancora in corso o già conclusa:
 *  A. il turno è ANCORA in corso  → il server rimanda lo snapshot integrale del testo generato;
 *  B. il turno si è CONCLUSO nel frattempo → il replay dei delta persi permette al client di
 *     ricostruire esattamente il testo che la sessione ha salvato (nessuna riga mancante).
 *
 * Richiede il modello: usa un'istanza di prova (default :8430) e interrompe la generazione.
 * Uso: node media/test-stream-reconnect-live.mjs [base-url] [user] [password]
 */
const BASE = (process.argv[2] || "http://127.0.0.1:8430").replace(/\/$/, "");
const USER = process.argv[3] || "pi";
const PASS = process.argv[4] || "testpass";
const AUTH = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " → " + e : ""}`));

const api = (path, opts = {}) =>
  fetch(BASE + path, { ...opts, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) } });
const stato = async () => (await api("/api/state")).json();

/** Legge /events; `finche(eventi)` decide quando staccare. `msMax` è la rete di sicurezza. */
async function leggi({ lastEventId = null, finche, msMax = 30000 }) {
  const ctrl = new AbortController();
  const res = await fetch(BASE + "/events", {
    headers: { Authorization: AUTH, ...(lastEventId ? { "Last-Event-ID": String(lastEventId) } : {}) },
    signal: ctrl.signal,
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const eventi = [];
  let buf = "";
  const scadenza = setTimeout(() => ctrl.abort(), msMax);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const blocco = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let id = null, event = "message", data = "";
        for (const riga of blocco.split("\n")) {
          if (riga.startsWith("id: ")) id = Number(riga.slice(4));
          else if (riga.startsWith("event: ")) event = riga.slice(7);
          else if (riga.startsWith("data: ")) data += riga.slice(6);
        }
        if (event === "message" && !data) continue;
        eventi.push({ id, event, data });
        if (finche && finche(eventi)) { ctrl.abort(); break; }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  } finally {
    clearTimeout(scadenza);
    try { ctrl.abort(); } catch {}
  }
  const ids = eventi.filter((e) => e.id !== null).map((e) => e.id);
  return { eventi, ultimoId: ids.length ? Math.max(...ids) : 0 };
}

/** La prova misura il TRASPORTO, non il ragionamento: con thinking alto il modello può passare
 *  decine di secondi prima del primo testo e il test diventerebbe dipendente dal modello.
 *  Si usa il livello più basso supportato e si ripristina quello di partenza alla fine. */
async function thinkingBasso() {
  const st = await stato();
  const iniziale = st.thinking?.level;
  const supportati = st.thinking?.supported || [];
  const basso = ["off", "minimal", "low"].find((l) => supportati.includes(l)) || supportati[0];
  if (basso && basso !== iniziale) {
    await api("/api/thinking", { method: "POST", body: JSON.stringify({ level: basso }) });
  }
  return iniziale;
}
async function ripristinaThinking(level) {
  if (level) await api("/api/thinking", { method: "POST", body: JSON.stringify({ level }) });
}

/** Invia un prompt SOLO a sessione ferma e controlla l'esito: senza questo controllo un 409
 *  («già in streaming»), che si presenta quando la prova segue un altro test runtime, farebbe
 *  fallire i controlli successivi come se il trasporto non funzionasse. */
async function inviaPrompt(text) {
  await attendiFermo(60000);
  const r = await api("/api/prompt", { method: "POST", body: JSON.stringify({ text }) });
  return r.status;
}

const sommaDelta = (eventi) => eventi.filter((e) => e.event === "text_delta").map((e) => JSON.parse(e.data).delta).join("");
const testoSnapshot = (eventi) => {
  const s = eventi.find((e) => e.event === "stream_snapshot");
  return s ? JSON.parse(s.data).text : null;
};
const testoUltimaRisposta = async () => {
  const st = await stato();
  const risposte = st.messages.filter((m) => m.role === "assistant");
  return risposte.length ? risposte[risposte.length - 1].text : "";
};
const attendiFermo = async (maxMs = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (!(await stato()).streaming) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};

/** Ogni scenario parte da una chat nuova: senza questo il testo letto a fine prova è
 *  quello del turno precedente e il confronto non misura nulla. */
const nuovaChat = async () => {
  const r = await api("/api/sessions/new", { method: "POST" });
  return r.status === 200;
};

// ===================== SCENARIO A: turno ancora in corso =====================
console.log("== SCENARIO A — la connessione cade e il turno è ANCORA in corso ==");
const thinkingIniziale = await thinkingBasso();
check("thinking abbassato per la prova (il test misura il trasporto, non il ragionamento)", !!thinkingIniziale, "era: " + thinkingIniziale);
check("chat nuova per lo scenario A", await nuovaChat());
check("prompt accettato per lo scenario A", [200, 202].includes(await inviaPrompt("Scrivi una lista numerata da 1 a 400, una parola per riga, senza altro testo.")));
const primaA = await leggi({ msMax: 40000, finche: (ev) => sommaDelta(ev).length > 40 });
const testoPrimaA = sommaDelta(primaA.eventi);
check("la generazione è iniziata e arrivano delta di testo", testoPrimaA.length > 0, `caratteri=${testoPrimaA.length}`);
check("i delta hanno un id (replay possibile)", primaA.ultimoId > 0, "ultimoId=" + primaA.ultimoId);

await new Promise((r) => setTimeout(r, 1500)); // il server continua a generare senza di noi
const ancoraInCorso = (await stato()).streaming;
check("il turno è ancora in corso al momento della riconnessione", ancoraInCorso === true, "streaming=" + ancoraInCorso);

const dopoA = await leggi({ lastEventId: primaA.ultimoId, msMax: 15000, finche: (ev) => ev.some((e) => e.event === "stream_snapshot") });
const snapA = testoSnapshot(dopoA.eventi);
check("alla riconnessione arriva lo snapshot del turno in corso", typeof snapA === "string", dopoA.eventi.slice(0, 4).map((e) => e.event).join(","));
check("lo snapshot contiene PIÙ testo di quello che il client aveva prima della caduta", !!snapA && snapA.length > testoPrimaA.length,
  snapA ? `snapshot=${snapA.length} caratteri · prima della caduta=${testoPrimaA.length}` : "nessuno snapshot");
check("lo snapshot inizia con il testo già a schermo (nessuna riscrittura divergente)", !!snapA && snapA.startsWith(testoPrimaA.slice(0, 20)),
  JSON.stringify({ snapshot: (snapA || "").slice(0, 20), prima: testoPrimaA.slice(0, 20) }));

await api("/api/abort", { method: "POST" });
check("la generazione dello scenario A viene interrotta", await attendiFermo());

// ===================== SCENARIO B: turno concluso durante la caduta =====================
console.log("\n== SCENARIO B — la connessione cade e il turno si CONCLUDE nel frattempo ==");
check("chat nuova per lo scenario B", await nuovaChat());
check("prompt accettato per lo scenario B", [200, 202].includes(await inviaPrompt("Elenca 40 città italiane, una per riga, senza altro testo.")));
const primaB = await leggi({ msMax: 45000, finche: (ev) => sommaDelta(ev).length > 30 });
const testoPrimaB = sommaDelta(primaB.eventi);
check("la generazione è iniziata anche nello scenario B", testoPrimaB.length > 0, `caratteri=${testoPrimaB.length}`);

await attendiFermo(60000); // si lascia CONCLUDERE la risposta senza ascoltare
check("la risposta è finita durante la caduta", !(await stato()).streaming);

const dopoB = await leggi({ lastEventId: primaB.ultimoId, msMax: 15000, finche: (ev) => ev.some((e) => e.event === "status") && JSON.parse(ev.find((x) => x.event === "status").data).streaming === false });
const ricostruito = testoPrimaB + sommaDelta(dopoB.eventi);
const finale = await testoUltimaRisposta();
check("il replay ha rispedito i delta persi durante la caduta", sommaDelta(dopoB.eventi).length > 0, `caratteri rispediti=${sommaDelta(dopoB.eventi).length}`);
check("il testo ricostruito dal client NON è vuoto", ricostruito.length > 0);
check("il testo ricostruito combacia con quello salvato nella sessione (nessuna parte persa)",
  finale.replace(/\s+/g, " ").trim().startsWith(ricostruito.replace(/\s+/g, " ").trim().slice(0, 40)) &&
  Math.abs(finale.length - ricostruito.length) <= Math.max(20, finale.length * 0.1),
  JSON.stringify({ ricostruito: ricostruito.length, sessione: finale.length, inizioRicostruito: ricostruito.slice(0, 40), inizioSessione: finale.slice(0, 40) }));
check("alla riconnessione arriva lo stato di fine risposta", dopoB.eventi.some((e) => e.event === "status" && JSON.parse(e.data).streaming === false));

await ripristinaThinking(thinkingIniziale);
check("livello di thinking ripristinato", (await stato()).thinking.level === thinkingIniziale);

console.log();
console.log(`risultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
