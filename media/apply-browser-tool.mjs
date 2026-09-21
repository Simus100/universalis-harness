/**
 * Applica la patch del tool `browser` a dashboard.mjs e media/commands.mjs.
 *
 *  - ogni sostituzione verifica che l'ancora esista ESATTAMENTE UNA VOLTA
 *  - idempotente: se la patch è già applicata, non fa nulla
 *  - usabile sia sull'istanza di test sia sulla produzione:
 *        node media/apply-browser-tool.mjs --root media/spike     (test)
 *        node media/apply-browser-tool.mjs --root .               (produzione)
 *
 * Modifiche:
 *  1. import dell'estensione
 *  2. istanza BROWSER_EXT accanto a MEDIA_GUARD_EXT
 *  3. registrazione in extensionFactories
 *  4. flag browserEnabled + BROWSER_TOOL_NAMES (OFF di default)
 *  5. filtro in applyToolGate() (come per i subagent)
 *  6. blocco `browser` in /api/state
 *  7. endpoint POST /api/browser
 *  8. comando slash /browser
 *  9. voce nel catalogo media/commands.mjs
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const rootArg = args.includes("--root") ? args[args.indexOf("--root") + 1] : ".";
const ROOT = path.resolve(rootArg);
const DASH = path.join(ROOT, "dashboard.mjs");
const COMMANDS = path.join(ROOT, "media/commands.mjs");

const MARKER = "media/browser-tool.mjs";

const EDITS_DASH = [
  {
    label: "import dell'estensione",
    from: `} from "./media/commands.mjs";`,
    to: `} from "./media/commands.mjs";
import { createBrowserExtension } from "./media/browser-tool.mjs";`,
  },
  {
    label: "istanza BROWSER_EXT",
    from: `const resourceLoader = new DefaultResourceLoader({`,
    to: `// Tool browser (estensione inline definita in media/browser-tool.mjs).
// Invoca SEMPRE agent-browser come utente dedicato: come root la CLI partirebbe
// senza errori ma SENZA sandbox (fallimento silenzioso).
const BROWSER_EXT = createBrowserExtension({ mediaDir: MEDIA_DIR });

const resourceLoader = new DefaultResourceLoader({`,
  },
  {
    label: "registrazione in extensionFactories",
    from: `  extensionFactories: [MEDIA_GUARD_EXT],`,
    to: `  extensionFactories: [MEDIA_GUARD_EXT, BROWSER_EXT],`,
  },
  {
    label: "flag browserEnabled",
    from: `let subagentsEnabled = false;`,
    to: `let subagentsEnabled = false;
// Tool browser: spento di default (naviga il web e consuma ~1,7 GB di RAM per sessione).
// Si accende con /browser on o POST /api/browser; quando è OFF i tool vengono rimossi
// dalla lista inviata al modello, quindi il modello non può nemmeno tentare di usarli.
let browserEnabled = false;
const BROWSER_TOOL_NAMES = new Set(["browser"]);`,
  },
  {
    label: "filtro in applyToolGate",
    from: `  if (!subagentsEnabled) tools = tools.filter((t) => !SUBAGENT_TOOL_NAMES.has(t.name));`,
    to: `  if (!subagentsEnabled) tools = tools.filter((t) => !SUBAGENT_TOOL_NAMES.has(t.name));
  if (!browserEnabled) tools = tools.filter((t) => !BROWSER_TOOL_NAMES.has(t.name));`,
  },
  {
    label: "blocco browser in /api/state",
    from: `    auth: {
      maxFails: AUTH_MAX_FAILS,`,
    to: `    browser: {
      available: ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name)),
      enabled: browserEnabled,
      activeTools: session.agent.state.tools
        .map((t) => t.name)
        .filter((n) => BROWSER_TOOL_NAMES.has(n)),
      user: process.env.DASH_BROWSER_USER || "pi-browser",
    },
    auth: {
      maxFails: AUTH_MAX_FAILS,`,
  },
  {
    label: "endpoint POST /api/browser",
    from: `    // Compaction manuale del contesto (equivalente a /compact della TUI di pi).`,
    to: `    if (req.method === "POST" && url.pathname === "/api/browser") {
      const body = await readBody(req);
      const available = ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name));
      if (!available) return json(res, 400, { error: "tool browser non disponibile" });
      if (typeof body.enabled === "boolean") browserEnabled = body.enabled;
      applyToolGate();
      broadcast("state", getState());
      return json(res, 200, getState());
    }

    // Compaction manuale del contesto (equivalente a /compact della TUI di pi).`,
  },
  {
    label: "handler del comando /browser",
    from: `  stop: async () => {
    if (!session.isStreaming) return { message: "nessuna risposta in corso" };`,
    to: `  browser: async ({ arg }) => {
    const available = ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name));
    if (!available) throw new HttpError(400, "tool browser non disponibile (agent-browser non registrato)");
    const val = String(arg || "").trim().toLowerCase();
    if (!val) {
      return {
        message: \`browser: \${browserEnabled ? "ON" : "off"} · utente \${process.env.DASH_BROWSER_USER || "pi-browser"}\${browserEnabled ? " (naviga il web, ~1,7 GB di RAM per sessione)" : ""}\`,
      };
    }
    if (!["on", "off", "status"].includes(val)) throw new HttpError(400, "usa /browser on, /browser off oppure /browser status");
    if (val === "status") {
      const bs = process.env.DASH_BROWSER_USER || "pi-browser";
      return { message: \`browser: \${browserEnabled ? "ON" : "off"} · utente \${bs} · verifica sandbox con il tool: action=status\` };
    }
    browserEnabled = val === "on";
    applyToolGate();
    return { message: \`browser -> \${browserEnabled ? "ON" : "off"}\`, state: true, refresh: true };
  },

  stop: async () => {
    if (!session.isStreaming) return { message: "nessuna risposta in corso" };`,
  },
];

const EDITS_COMMANDS = [
  {
    label: "voce /browser nel catalogo",
    from: `    name: "subagents-max",
    aliases: ["subagent-max"],
    group: "agente",
    desc: "Numero massimo di subagent per richiesta (1-64)",
    usage: "/subagents-max <n>",
    client: false,
    params: [{ name: "n", label: "n", kind: "number", hint: "1-64" }],
  },`,
    to: `    name: "subagents-max",
    aliases: ["subagent-max"],
    group: "agente",
    desc: "Numero massimo di subagent per richiesta (1-64)",
    usage: "/subagents-max <n>",
    client: false,
    params: [{ name: "n", label: "n", kind: "number", hint: "1-64" }],
  },
  {
    name: "browser",
    aliases: ["naviga"],
    group: "agente",
    desc: "Attiva o disattiva il tool browser (naviga siti reali; consuma RAM)",
    usage: "/browser <on|off|status>",
    client: false,
    params: [{ name: "stato", label: "stato", kind: "enum", values: ["on", "off", "status"], hint: "on, off o status" }],
  },`,
  },
];

function apply(file, edits, { dryRun = false } = {}) {
  if (!fs.existsSync(file)) {
    console.error(`✘ file non trovato: ${file}`);
    return false;
  }
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(MARKER)) {
    console.log(`• ${path.relative(ROOT, file)}: patch già applicata (salto)`);
    return true;
  }
  for (const e of edits) {
    const count = src.split(e.from).length - 1;
    if (count !== 1) {
      console.error(`✘ ${path.relative(ROOT, file)} → ancora "${e.label}": trovata ${count} volte (attesa 1). Interrompo.`);
      return false;
    }
    src = src.replace(e.from, e.to);
  }
  if (dryRun) {
    console.log(`✓ ${path.relative(ROOT, file)}: ${edits.length} modifiche validate (dry-run, non scritto)`);
    return true;
  }
  fs.writeFileSync(file, src);
  console.log(`✓ ${path.relative(ROOT, file)}: ${edits.length} modifiche applicate`);
  return true;
}

console.log(`root: ${ROOT}`);
const ok1 = apply(DASH, EDITS_DASH, { dryRun: args.includes("--dry-run") });
const ok2 = apply(COMMANDS, EDITS_COMMANDS, { dryRun: args.includes("--dry-run") });
process.exit(ok1 && ok2 ? 0 : 1);
