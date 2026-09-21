/**
 * Verifica il REPLAY degli eventi SSE (id: + Last-Event-ID) su un'istanza della dashboard.
 *
 * Scenario: una connessione cade mentre succedono cose; EventSource si riconnette e rimanda
 * Last-Event-ID. Senza replay quegli eventi sarebbero persi (è la metà server del difetto n.1:
 * i delta emessi durante la disconnessione sparivano per sempre).
 *
 * Uso: node media/test-stream-replay.mjs [base-url] [user] [password]
 *      node media/test-stream-replay.mjs http://127.0.0.1:8430 pi testpass
 */
const BASE = (process.argv[2] || "http://127.0.0.1:8430").replace(/\/$/, "");
const USER = process.argv[3] || process.env.DASH_USER || "pi";
const PASS = process.argv[4] || process.env.DASH_PASSWORD || "testpass";
const AUTH = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " → " + e : ""}`));

const api = (path, opts = {}) =>
  fetch(BASE + path, { ...opts, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) } });

/** Apre /events, raccoglie eventi per `ms` millisecondi, poi chiude. */
async function raccogli({ lastEventId = null, ms = 1500, fermatiDopo = null, durante = null } = {}) {
  const ctrl = new AbortController();
  const res = await fetch(BASE + "/events", {
    headers: { Authorization: AUTH, ...(lastEventId ? { "Last-Event-ID": String(lastEventId) } : {}) },
    signal: ctrl.signal,
  });
  if (!res.ok) throw new Error("apertura /events fallita: HTTP " + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const eventi = [];
  let azioneFatta = false;
  const scadenza = setTimeout(() => ctrl.abort(), ms);
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
        if (!azioneFatta && durante) {
          azioneFatta = true;
          Promise.resolve().then(durante).catch(() => {});
        }
        eventi.push({ id, event, data });
        if (fermatiDopo && eventi.some((e) => e.event === fermatiDopo)) { ctrl.abort(); }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  } finally {
    clearTimeout(scadenza);
    try { ctrl.abort(); } catch {}
  }
  return eventi;
}

const creaGoal = async (titolo) => {
  const r = await api("/api/goals", {
    method: "POST",
    body: JSON.stringify({ title: titolo, status: "active", steps: [], checklist: [] }),
  });
  const j = await r.json();
  return j?.goal?.id || null;
};

console.log("== 1. gli eventi hanno un id progressivo ==");
let goalAperto = null;
const primaLettura = await raccogli({
  ms: 2000,
  fermatiDopo: "goals",
  durante: async () => { goalAperto = await creaGoal("prova replay - evento a connessione aperta"); },
});
const conId = primaLettura.filter((e) => e.id !== null);
check("gli eventi applicativi portano un id: (replay possibile)", conId.length > 0, "eventi=" + primaLettura.map((e) => e.event).join(","));
check("lo stato iniziale e' il primo evento della connessione", primaLettura[0]?.event === "state", primaLettura[0]?.event);
check("l'evento prodotto a connessione aperta e' arrivato in diretta", primaLettura.some((e) => e.event === "goals"));
const ultimoId = conId.length ? Math.max(...conId.map((e) => e.id)) : 0;

console.log("\n== 2. eventi prodotti a connessione chiusa vengono rispediti ==");
const goalId = await creaGoal("prova replay - evento a connessione CHIUSA");
check("secondo goal di prova creato a connessione chiusa", !!goalId);
const secondaLettura = await raccogli({ lastEventId: ultimoId, ms: 1500 });
const goalsReplay = secondaLettura.filter((e) => e.event === "goals");
check("alla riconnessione l'evento perso viene rispedito (replay)", goalsReplay.length >= 1, "eventi=" + secondaLettura.map((e) => e.event).join(","));
check("il replay porta lo stato corrente dei goal", goalsReplay.length ? JSON.parse(goalsReplay[0].data).goals.some((g) => g.id === goalId) : false);
check("gli eventi rispediti hanno id successivi all'ultimo ricevuto", goalsReplay.every((e) => e.id > ultimoId), JSON.stringify(goalsReplay.map((e) => e.id)));
check("lo stato completo arriva comunque, insieme al replay", secondaLettura.some((e) => e.event === "state"));

console.log("\n== 3. senza Last-Event-ID non si rispedisce nulla di vecchio ==");
const terzaLettura = await raccogli({ ms: 800 });
check("una connessione nuova parte dallo stato, senza replay", terzaLettura[0]?.event === "state" && !terzaLettura.some((e) => e.event === "goals"), terzaLettura.map((e) => e.event).join(","));

console.log("\n== 4. limite del buffer: un id troppo vecchio non rompe nulla ==");
const quartaLettura = await raccogli({ lastEventId: 1, ms: 800 });
check("un Last-Event-ID fuori buffer non genera errori e porta comunque lo stato", quartaLettura.some((e) => e.event === "state"));

console.log("\n== 5. pulizia ==");
for (const id of [goalId, goalAperto]) {
  if (!id) continue;
  const del = await (await api("/api/goals/delete", { method: "POST", body: JSON.stringify({ id }) })).json();
  check("goal di prova rimosso (" + id.slice(0, 6) + ")", del.ok === true);
}

console.log();
console.log(`risultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
