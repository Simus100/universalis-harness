/** Chiude nel goal gli step delle viste e della skill. */
import fs from "node:fs";

const goalsFile = "/root/pi-harness/media/goals.json";
const goals = JSON.parse(fs.readFileSync(goalsFile, "utf8"));
const g = goals.find((x) => x.id === "7af1695f7d3f5f6f");
if (!g) process.exit(console.error("goal non trovato"));

const step = (id, done, title) => {
  const s = g.steps.find((x) => x.id === id);
  if (!s) return console.error("step non trovato:", id);
  s.done = done;
  if (title) s.title = title;
};
const chk = (id, done, text) => {
  const c = g.checklist.find((x) => x.id === id);
  if (!c) return console.error("check non trovato:", id);
  c.done = done;
  if (text) c.text = text;
};

step("vista-progetto", true,
  "G4 COMPLETATA E VERIFICATA A SCHERMO: vista \u201cprogetto\u201d (menu features) che elenca gli artefatti di media/ ordinati per data, con dimensione, tempo trascorso, apri nell'editor, scarica e apertura delle cartelle nel file manager. Provata con il browser reale: 67 artefatti e 5 cartelle mostrati correttamente. Riusa endpoint esistenti, nessun privilegio nuovo");

step("agenda", true,
  "G5 COMPLETATA E VERIFICATA A SCHERMO: vista \u201cagenda\u201d = timeline unica con pianificazioni cron (prossima esecuzione, ultimo esito, numero di esecuzioni) e goal attivi con avanzamento di passi e controlli. Provata con il browser reale: dati reali letti e resi correttamente");

step("skill-browser", true,
  "A2+A6 COMPLETATA: skill skills/browser/SKILL.md che mappa le AZIONI DEL TOOL (non la CLI) e rimanda al bundle nativo sempre aggiornato (agent-browser skills get core). Documenta la regola dei ref, il fatto che il tool \u00e8 spento di default e i limiti operativi");

chk("c20", true,
  "La skill e la description del tool impongono di usare i ref della pagina corrente e di rifare lo snapshot dopo ogni navigazione, precisando che i ref non partono sempre da e1 e che tra snapshot della stessa pagina restano validi (formulazione corretta dopo aver consultato il bundle nativo)");

chk("c21", true,
  "Le 9 skill native bundle di agent-browser sono collegate: la skill skills/browser/SKILL.md rimanda a \u201cagent-browser skills get core\u201d invece di duplicare istruzioni che andrebbero fuori sincrono con la versione della CLI, ed elenca le altre skill disponibili (dogfood, derive-client, slack, electron, agentcore, vercel-sandbox, webmcp-gen, protected-vercel-deployments)");

chk("c5", true,
  "Nessun endpoint esistente rotto: 57 test statici, 89 test UI e 38 test API tutti verdi (erano 43+89+30 con 2 fallimenti PREESISTENTI, ora quei 2 sono diventati 8 controlli piu' robusti: versione confrontata col codice invece che hardcoded, funzioni chiave invece del conteggio). Le due viste nuove non aggiungono endpoint");

chk("c13", true,
  "Nessuna porta nuova su 0.0.0.0: verificato dopo ogni passo (stream e DevTools su 127.0.0.1, istanze di prova sempre su loopback). Le uniche porte esposte restano 22/80/443 dietro ufw");

step("test", false,
  "Test su istanza isolata, test-static.mjs (57), test-ui.mjs (89) e test-api.sh (38) estesi e tutti verdi; viste provate A SCHERMO con il browser reale. Restano da fare: prova da iPhone (voce e approvazioni) dopo il deploy");

g.updatedAt = Date.now();
fs.writeFileSync(goalsFile, JSON.stringify(goals, null, 2));

const env = fs.readFileSync("/root/pi-harness/.env", "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const auth = Buffer.from(`${val("DASH_USER")}:${val("DASH_PASSWORD")}`).toString("base64");
const r = await fetch("http://127.0.0.1:8420/api/goals", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
  body: JSON.stringify({ ...g, id: g.id }),
});
console.log("aggiornamento:", (await r.json()).ok ? "OK" : "FALLITO");
console.log("step chiusi:", g.steps.filter((s) => s.done).map((s) => s.id).join(", "));
console.log("aperti:", g.steps.filter((s) => !s.done).map((s) => s.id).join(", "));
console.log("controlli chiusi:", g.checklist.filter((c) => c.done).length + "/" + g.checklist.length);
