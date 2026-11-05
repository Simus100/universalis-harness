/**
 * CORREZIONE DEL GATE DEI TOOL.
 *
 * Problema trovato con una prova reale: il gate scriveva `session.agent.state.tools`, che è
 * solo la VISTA dei tool attivi (la si legge con /api/state, quindi sembrava funzionare).
 * Il percorso che determina ciò che il modello riceve è `session.setActiveToolsByName()`,
 * che costruisce la lista dal REGISTRY interno e ricostruisce anche il system prompt:
 *
 *   "Set active tools by name. Only tools in the registry can be enabled. Unknown tool names
 *    are ignored. Also rebuilds the system prompt... Changes take effect on the next agent turn."
 *
 * Conseguenza: il tool `browser` non arrivava al modello anche con enabled=true, e per lo
 * stesso motivo l'interruttore dei subagent non bloccava davvero nulla.
 *
 * Idempotente. Uso: node media/apply-gate-fix.mjs --root . [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const DASH = path.join(ROOT, "dashboard.mjs");
const MARKER = "setActiveToolsByName";

const EDITS = [
  {
    label: "helper: lista completa dal registry",
    from: `function applyToolGate() {`,
    to: `/**
 * Lista COMPLETA dei tool dal registry di pi. Non si usa state.tools, che è la vista dei
 * tool ATTIVI: scriverci direttamente non cambia quello che il modello riceve.
 */
function allToolsOf(s) {
  try {
    if (s && typeof s.getAllTools === "function") return s.getAllTools();
  } catch {
    /* si ricade sulla vista */
  }
  return s?.agent?.state?.tools?.slice?.() || [];
}

function applyToolGate() {`,
  },
  {
    label: "gate sul percorso ufficiale",
    from: `  // in modo "auto" lo stato del tool è una conseguenza delle condizioni, non un flag fisso
  browserEnabled = browserShouldBeEnabled();
  let tools = ALL_TOOLS.slice();
  if (!subagentsEnabled) tools = tools.filter((t) => !SUBAGENT_TOOL_NAMES.has(t.name));
  if (!browserEnabled) tools = tools.filter((t) => !BROWSER_TOOL_NAMES.has(t.name));
  session.agent.state.tools = tools;
}`,
    to: `  // in modo "auto" lo stato del tool è una conseguenza delle condizioni, non un flag fisso
  browserEnabled = browserShouldBeEnabled();
  const all = allToolsOf(session);
  let names = all.map((t) => t.name);
  if (!subagentsEnabled) names = names.filter((n) => !SUBAGENT_TOOL_NAMES.has(n));
  if (!browserEnabled) names = names.filter((n) => !BROWSER_TOOL_NAMES.has(n));
  // percorso ufficiale: abilita per nome dal registry e ricostruisce il system prompt
  if (typeof session.setActiveToolsByName === "function") session.setActiveToolsByName(names);
  else session.agent.state.tools = all.filter((t) => names.includes(t.name));
}`,
  },
  {
    label: "ALL_TOOLS dal registry (attachSession)",
    from: `  session = created.session;
  ALL_TOOLS = session.agent.state.tools.slice();`,
    to: `  session = created.session;
  ALL_TOOLS = allToolsOf(session);`,
  },
  {
    label: "ALL_TOOLS dal registry (reloadSkills)",
    from: `    await session.reload();
    // il reload ricostruisce i tool: risincronizza i flag locali e riapplica il gate
    ALL_TOOLS = session.agent.state.tools.slice();`,
    to: `    await session.reload();
    // il reload ricostruisce i tool: risincronizza i flag locali e riapplica il gate
    ALL_TOOLS = allToolsOf(session);`,
  },
  {
    label: "disponibilità letta dal registry",
    from: `      activeTools: session.agent.state.tools
        .map((t) => t.name)
        .filter((n) => BROWSER_TOOL_NAMES.has(n)),`,
    to: `      activeTools: (session?.getActiveToolNames?.() || session?.agent?.state?.tools?.map?.((t) => t.name) || [])
        .filter((n) => BROWSER_TOOL_NAMES.has(n)),`,
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
console.log(`✓ dashboard.mjs: ${EDITS.length} modifiche applicate (gate sul percorso ufficiale di pi)`);
