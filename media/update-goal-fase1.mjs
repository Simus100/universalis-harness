/**
 * Aggiorna il goal delle funzionalità segnando la FASE 1 (difetto n.1) come completata.
 * Uso: node media/update-goal-fase1.mjs
 * Passa dall'API e rimanda il goal INTERO: normalizeGoal non conserva la description se non
 * viene inviata, quindi un aggiornamento parziale la cancellerebbe.
 */
import fs from "node:fs";

const env = fs.readFileSync("/root/pi-harness/.env", "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const auth = Buffer.from(`${val("DASH_USER")}:${val("DASH_PASSWORD")}`).toString("base64");
const H = { "Content-Type": "application/json", Authorization: `Basic ${auth}` };

const { goals } = await (await fetch("http://127.0.0.1:8420/api/goals", { headers: H })).json();
const goal = goals.find((g) => g.steps.some((s) => s.id === "f1-replay")) || goals[0];
if (!goal) {
  console.error("nessun goal da aggiornare");
  process.exit(1);
}

const noteFase1 = [
  "FASE 1 COMPLETATA (difetto n.1 — chat che si sganciava durante la risposta).",
  "Causa: in dashboard.html il listener di 'error' di EventSource serviva sia l'errore applicativo sia il guasto di trasporto, e chiamava setStatus(false) SEMPRE (era fuori dal try), azzerando il riferimento alla bolla in corso: le card dei tool continuavano ad arrivare (chat.appendChild) mentre testo e thinking no, fino al refresh.",
  "Correzioni: (1) errore di trasporto distinto da quello applicativo — e.data === undefined non spegne più lo stato né azzera la bolla; (2) stato della connessione visibile in barra di stato (⚠ riconnessione…, che si azzera alla riconnessione); (3) il server assegna id: agli eventi e conserva un buffer di replay, e alla riconnessione rispedisce quelli persi (Last-Event-ID); (4) se il turno è ancora in corso il server manda lo snapshot integrale del testo già generato, applicato dal client in sovrascrittura (idempotente: nessun taglio e nessuna duplicazione); (5) lo stato del server riallinea il dot se durante la caduta la risposta è finita.",
  "Verifiche: media/test-stream-resilience.mjs (20 controlli, senza browser né rete: sul codice precedente ne fallisce 11, sul nuovo 0), media/test-stream-replay.mjs (12 controlli su id/Last-Event-ID/replay su istanza di prova), media/test-stream-reconnect-live.mjs (19 controlli con il modello: scenario A con riconnessione durante il turno → snapshot integrabile; scenario B con turno concluso durante la caduta → testo ricostruito dal replay identico a quello salvato in sessione). Suite completa media/test-all.sh: 12 gruppi, tutti verdi (481 verifiche).",
  "Resta da fare (fasi 2-8): matrice funzionale in uso reale, viste, comandi slash, live view, coerenza goal/cron memoria-file, mobile e PWA.",
].join(" ");

goal.steps = goal.steps.map((s) => (s.id.startsWith("f1-") ? { ...s, done: true } : s));
goal.checklist = goal.checklist.map((c) =>
  ["c2", "c3", "c5"].includes(c.id) ? { ...c, done: true } : c,
);
goal.description = goal.description + "\n\n[aggiornamento] " + noteFase1;

const r = await fetch("http://127.0.0.1:8420/api/goals", { method: "POST", headers: H, body: JSON.stringify(goal) });
const out = await r.json();
const g = out.goal;
console.log("HTTP", r.status);
console.log("passi:", g.steps.filter((s) => s.done).length + "/" + g.steps.length, "·", g.steps.filter((s) => s.done).map((s) => s.id).join(", "));
console.log("controlli:", g.checklist.filter((c) => c.done).length + "/" + g.checklist.length);
