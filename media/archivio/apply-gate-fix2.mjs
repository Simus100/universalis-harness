/**
 * Gate, parte 2: abilitare SOLO i tool giusti.
 *
 * Il passaggio al percorso ufficiale (setActiveToolsByName) ha fatto emergere un secondo
 * problema: costruendo la lista da getAllTools() si abilitavano TUTTI i tool del registry,
 * compresi powershell, grep, find, ls che pi non attiva di default (il modello li ha visti
 * comparire). Qui il gate parte dalla lista di default di pi e aggiunge solo i tool delle
 * estensioni che ci interessano (subagent, browser), quando abilitati.
 *
 * Idempotente. Uso: node media/apply-gate-fix2.mjs --root . [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const DASH = path.join(ROOT, "dashboard.mjs");
const MARKER = "DEFAULT_TOOL_NAMES";

const EDITS = [
  {
    label: "variabile dei tool di default",
    from: `let ALL_TOOLS = [];`,
    to: `let ALL_TOOLS = [];
/** Tool attivati da pi all'avvio della sessione: è la base del gate, così non si allarga
 *  la superficie abilitando per errore tool che pi tiene spenti (powershell, grep, ls…). */
let DEFAULT_TOOL_NAMES = [];`,
  },
  {
    label: "cattura dei default all'attach",
    from: `  session = created.session;
  ALL_TOOLS = allToolsOf(session);`,
    to: `  session = created.session;
  ALL_TOOLS = allToolsOf(session);
  // la lista scelta da pi PRIMA di applicare il gate
  DEFAULT_TOOL_NAMES = (session.agent?.state?.tools || []).map((t) => t.name);`,
  },
  {
    label: "gate: default + estensioni abilitabili",
    from: `  const all = allToolsOf(session);
  let names = all.map((t) => t.name);
  if (!subagentsEnabled) names = names.filter((n) => !SUBAGENT_TOOL_NAMES.has(n));
  if (!browserEnabled) names = names.filter((n) => !BROWSER_TOOL_NAMES.has(n));`,
    to: `  const registered = new Set(allToolsOf(session).map((t) => t.name));
  // base: i tool che pi attiva di suo; in più i tool delle estensioni gestibili a interruttore
  let names = DEFAULT_TOOL_NAMES.slice();
  for (const n of BROWSER_TOOL_NAMES) if (registered.has(n) && !names.includes(n)) names.push(n);
  for (const n of SUBAGENT_TOOL_NAMES) if (registered.has(n) && !names.includes(n)) names.push(n);
  if (!subagentsEnabled) names = names.filter((n) => !SUBAGENT_TOOL_NAMES.has(n));
  if (!browserEnabled) names = names.filter((n) => !BROWSER_TOOL_NAMES.has(n));`,
  },
];

let src = fs.readFileSync(DASH, "utf8");
if (src.includes(MARKER)) {
  console.log("• già applicata");
  process.exit(0);
}
for (const e of EDITS) {
  const count = src.split(e.from).length - 1;
  if (count !== 1) {
    console.error(`✘ ancora "${e.label}": trovata ${count} volte (attesa 1)`);
    process.exit(1);
  }
  src = src.replace(e.from, e.to);
}
if (args.includes("--dry-run")) {
  console.log(`✓ ${EDITS.length} modifiche validate (dry-run)`);
  process.exit(0);
}
fs.writeFileSync(DASH, src);
console.log(`✓ dashboard.mjs: ${EDITS.length} modifiche applicate (gate preciso)`);
