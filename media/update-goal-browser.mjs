/**
 * Aggiorna il goal con i risultati del lavoro sul tool browser.
 * Uso: node media/update-goal-browser.mjs
 */
import fs from "node:fs";

const goalsFile = "/root/pi-harness/media/goals.json";
const goals = JSON.parse(fs.readFileSync(goalsFile, "utf8"));
const g = goals.find((x) => x.id === "7af1695f7d3f5f6f");
if (!g) {
  console.error("goal non trovato");
  process.exit(1);
}

const mark = (list, id, done, text) => {
  const item = list.find((x) => x.id === id);
  if (!item) return console.error("non trovato:", id);
  item.done = done;
  if (text) {
    if ("title" in item) item.title = text;
    else item.text = text;
  }
};

mark(g.steps, "tool", true,
  "Tool browser IMPLEMENTATO E TESTATO: media/browser-tool.mjs (modulo separato, non nel monolite) + patch minima e idempotente applicata a dashboard.mjs e media/commands.mjs. Il modello ha usato il tool end-to-end su istanza isolata (aperto example.com, snapshot, riportato heading e ref e1/e2, chiuso). Invoca SEMPRE sudo -u pi-browser, verifica la sandbox e RIFIUTA se non è adeguata, nessuna shell (array di argomenti), ref e URL validati, file generati confinati in media/");

mark(g.steps, "limiti", true,
  "Limiti operativi COMPLETATI prima di qualsiasi autenticazione: timeout 60s per comando, maxBuffer 4MB, chiusura con close --all, chiusura del browser di servizio usato per il check sandbox (verificato: 0 processi Chrome residui dopo l'uso, prima ne restavano 16). agent-browser usa una sola sessione default per utente, quindi non si moltiplicano le istanze");

mark(g.checklist, "c7", true,
  "Il browser non resta appeso: verificato che dopo l'uso i processi Chrome tornano a 0 (il check di sandbox chiude il browser di servizio) e che i comandi hanno timeout");

mark(g.checklist, "c8", true,
  "Chrome gira con sandbox ATTIVA e il tool lo GARANTISCE: utente pi-browser senza sudo + profilo AppArmor. Verificato a runtime dal tool: layer Namespace, PID/Network namespaces Yes, Seccomp-BPF Yes, 'You are adequately sandboxed'. MAI --no-sandbox e mai come root: se la sandbox non è adeguata il tool rifiuta l'azione");

mark(g.checklist, "c11", true,
  "Consumo RAM misurato: ~1,7 GB per una sessione headless (19 processi Chrome); a riposo 0 processi e ~10,6 GB liberi. Il tool non moltiplica le sessioni (una sessione default per utente)");

mark(g.checklist, "c19", true,
  "IMPLEMENTATO E VERIFICATO: il tool verifica lo stato della sandbox (chrome://sandbox deve dire 'adequately sandboxed') prima di ogni azione e RIFIUTA di operare altrimenti, citando la causa (CLI avviata come root = sandbox disattivata in silenzio). Provato: action=status riporta sandbox OK + utente pi-browser");

mark(g.checklist, "c22", true,
  "Costo RAM documentato (report, commenti nel codice, README) e verificato con ps/free dopo l'uso del tool");

// promemoria: il deploy non è ancora fatto
mark(g.steps, "deploy", false,
  "Deploy in produzione: patch GIÀ applicata su disco (dashboard.mjs, media/commands.mjs) e validata (43+89+38 test verdi, zero falliti), ma il SERVIZIO in esecuzione usa ancora il codice vecchio. Serve il riavvio, che interrompe la sessione agente: farlo con systemd-run + media/verify-and-restart.sh, poi verificare con post-restart-check.sh");

g.updatedAt = Date.now();
fs.writeFileSync(goalsFile, JSON.stringify(goals, null, 2));

const env = fs.readFileSync("/root/pi-harness/.env", "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const auth = Buffer.from(`${val("DASH_USER")}:${val("DASH_PASSWORD")}`).toString("base64");
const res = await fetch("http://127.0.0.1:8420/api/goals", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
  body: JSON.stringify({ ...g, id: g.id }),
});
const out = await res.json();
console.log("aggiornamento:", out.ok ? "OK" : "FALLITO");
console.log("step chiusi:", g.steps.filter((s) => s.done).map((s) => s.id).join(", "));
console.log("controlli chiusi:", g.checklist.filter((c) => c.done).map((c) => c.id).join(", "));
console.log("aperti:", g.steps.filter((s) => !s.done).length, "step /", g.checklist.filter((c) => !c.done).length, "controlli");
