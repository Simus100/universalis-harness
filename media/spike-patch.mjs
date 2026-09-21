/**
 * Prepara l'istanza di spike (isolata) per verificare:
 *  1. pi.registerTool() da estensione INLINE (extensionFactories)
 *  2. schema parametri: TypeBox (via createRequire) VS JSON Schema puro
 *  3. esecuzione di una CLI esterna da dentro un tool custom (pattern agent-browser)
 *  4. il gate applyToolGate() applicato a un tool nuovo (interruttore ON/OFF)
 *  5. convivenza con web_search dopo il reload della sessione
 *
 * Non tocca la produzione: porta 8455, root/sessioni/media/skill separati.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = "/root/pi-harness";
const DST = path.join(SRC, "media/spike");

fs.mkdirSync(path.join(DST, "media"), { recursive: true });
fs.copyFileSync(path.join(SRC, "dashboard.html"), path.join(DST, "dashboard.html"));
fs.copyFileSync(path.join(SRC, "media/commands.mjs"), path.join(DST, "media/commands.mjs"));

let mjs = fs.readFileSync(path.join(SRC, "dashboard.mjs"), "utf8");
const original = mjs;
const applied = [];
const must = (label, from, to) => {
  if (!mjs.includes(from)) {
    console.error(`PATCH FALLITA su: ${label}`);
    process.exit(1);
  }
  mjs = mjs.replace(from, to);
  applied.push(label);
};

// 0. createRequire per raggiungere typebox dal contesto di pi-coding-agent
must(
  "import createRequire",
  "import { fileURLToPath } from \"node:url\";",
  "import { fileURLToPath } from \"node:url\";\nimport { createRequire } from \"node:module\";"
);

must(
  "bootstrap typebox",
  "const __dirname = dirname(fileURLToPath(import.meta.url));",
  `const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== SPIKE: typebox e' una dipendenza ANNIDATA di pi-coding-agent.
// Lo risolviamo dal contesto di pi, senza aggiungere dipendenze al progetto.
let Type = null;
let typeboxVia = "assente";
try {
  const piRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
  Type = piRequire("typebox").Type;
  typeboxVia = "createRequire(pi)";
} catch (e) {
  typeboxVia = "fallito: " + (e?.message || e);
}
console.log("[spike] typebox:", typeboxVia);`
);

// 1. estensione inline con due tool custom
must(
  "estensione SPIKE_EXT",
  "const MEDIA_GUARD_EXT = {",
  `// ===== SPIKE: estensione inline con tool custom =====
const SPIKE_EXT = {
  name: "spike-tools",
  factory: (pi) => {
    // (a) schema JSON puro, senza typebox
    pi.registerTool({
      name: "ping",
      label: "Ping",
      description:
        "Tool di prova senza effetti collaterali: restituisce il testo ricevuto. Usalo SEMPRE quando l'utente chiede PINGTEST.",
      parameters: {
        type: "object",
        properties: { text: { type: "string", description: "testo da rimandare indietro" } },
        required: ["text"],
      },
      async execute(toolCallId, params) {
        return {
          content: [{ type: "text", text: "pong:" + params.text }],
          details: { spike: true },
        };
      },
    });

    // (b) schema TypeBox + esecuzione di una CLI esterna (pattern agent-browser)
    const cliSchema = Type
      ? Type.Object({ arg: Type.String({ description: "argomento da passare alla CLI" }) })
      : {
          type: "object",
          properties: { arg: { type: "string", description: "argomento da passare alla CLI" } },
          required: ["arg"],
        };
    pi.registerTool({
      name: "cli_probe",
      label: "CLI probe",
      description:
        "Esegue una CLI esterna e ne restituisce l'output. Usalo SEMPRE quando l'utente chiede CLITEST.",
      parameters: cliSchema,
      async execute(toolCallId, params) {
        try {
          const out = execFileSync("sh", ["-c", \`printf 'cli-ok:%s' "\${params.arg}"\`], {
            encoding: "utf8",
            timeout: 5000,
          });
          return { content: [{ type: "text", text: String(out) }], details: { exit: 0 } };
        } catch (e) {
          return {
            content: [{ type: "text", text: "cli-errore:" + (e?.message || e) }],
            details: { exit: 1 },
            isError: true,
          };
        }
      },
    });
  },
};

const MEDIA_GUARD_EXT = {`
);

// 2. registra l'estensione inline accanto a media-guard
must(
  "registrazione factories",
  "extensionFactories: [MEDIA_GUARD_EXT],",
  "extensionFactories: [MEDIA_GUARD_EXT, SPIKE_EXT],"
);

// 3. gate: i tool dello spike si accendono con DASH_SPIKE_TOOLS=on
must(
  "gate spike",
  'function applyToolGate() {\n  if (!session) return;\n  let tools = ALL_TOOLS.slice();\n  if (!subagentsEnabled) tools = tools.filter((t) => !SUBAGENT_TOOL_NAMES.has(t.name));',
  'const SPIKE_TOOL_NAMES = new Set(["ping", "cli_probe"]);\nconst spikeEnabled = process.env.DASH_SPIKE_TOOLS === "on";\n\nfunction applyToolGate() {\n  if (!session) return;\n  let tools = ALL_TOOLS.slice();\n  if (!subagentsEnabled) tools = tools.filter((t) => !SUBAGENT_TOOL_NAMES.has(t.name));\n  if (!spikeEnabled) tools = tools.filter((t) => !SPIKE_TOOL_NAMES.has(t.name));'
);

// 4. log dei tool effettivi (per verificare registrazione e gate)
must(
  "log dei tool in attachSession",
  "  applyToolGate();\n  sessionStartedAt = Date.now();",
  '  applyToolGate();\n  console.log("[spike] tool effettivi:", session.agent.state.tools.map((t) => t.name).join(", "));\n  sessionStartedAt = Date.now();'
);

fs.writeFileSync(path.join(DST, "dashboard.mjs"), mjs);
console.log("patch applicata:");
for (const a of applied) console.log("  ✔ " + a);
