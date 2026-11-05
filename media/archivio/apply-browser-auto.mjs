/**
 * Patch: accensione INTELLIGENTE del tool browser.
 *
 * Problema: il tool tornava sempre OFF dopo un riavvio, quindi bisognava riaccenderlo a mano.
 * Soluzione: una preferenza persistita con tre modi.
 *
 *   auto (default) — acceso quando SERVE: live view attiva, controllo passato all'utente,
 *                    oppure browser usato negli ultimi N minuti (default 20). Altrimenti spento,
 *                    così non consuma contesto quando non serve.
 *   on             — sempre acceso (scelta esplicita, sopravvive ai riavvii)
 *   off            — sempre spento
 *
 * La scelta è salvata in media/browser-prefs.json e riapplicata all'avvio.
 *
 * Idempotente. Uso: node media/apply-browser-auto.mjs --root . [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const DASH = path.join(ROOT, "dashboard.mjs");
const MARKER = "browser-prefs.json";

const EDITS = [
  {
    label: "preferenza persistita + attività",
    from: `let browserEnabled = false;
const BROWSER_TOOL_NAMES = new Set(["browser"]);`,
    to: `let browserEnabled = false;
const BROWSER_TOOL_NAMES = new Set(["browser"]);

// ---- accensione intelligente del tool browser ----
// La scelta sta su disco, così sopravvive ai riavvii (prima tornava sempre OFF).
const BROWSER_PREFS_FILE =
  process.env.DASH_BROWSER_PREFS_FILE || join(MEDIA_DIR, "browser-prefs.json");
let browserMode = "auto"; // "auto" | "on" | "off"
let browserIdleMinutes = 20;
let browserLastActivity = 0; // ultima azione del tool (o watch attivo)
try {
  const pref = JSON.parse(readFileSync(BROWSER_PREFS_FILE, "utf8"));
  if (["auto", "on", "off"].includes(pref?.mode)) browserMode = pref.mode;
  if (Number.isFinite(pref?.idleMinutes) && pref.idleMinutes > 0) browserIdleMinutes = pref.idleMinutes;
} catch {
  /* nessuna preferenza salvata: si usa il default */
}
function saveBrowserPrefs() {
  fs.writeFile(
    BROWSER_PREFS_FILE,
    JSON.stringify({ mode: browserMode, idleMinutes: browserIdleMinutes }, null, 2),
  ).catch(() => {});
}

/**
 * Il tool deve essere acceso adesso? In modo "auto" si accende quando serve davvero e si
 * spegne da solo quando non serve più, senza che l'utente debba pensarci.
 */
function browserShouldBeEnabled() {
  if (browserMode === "off") return false;
  if (browserMode === "on") return true;
  if (browserControlMode === "human") return true; // l'utente sta guidando: gli serve
  try {
    if (browserLive.snapshot().watching) return true; // live view aperta
  } catch {
    /* niente */
  }
  return browserLastActivity > 0 && Date.now() - browserLastActivity < browserIdleMinutes * 60_000;
}`,
  },
  {
    label: "attività dal tool e dal controllo",
    from: `const BROWSER_EXT = createBrowserExtension({
  mediaDir: MEDIA_DIR,
  isHumanControlled: () => browserControlMode === "human",
});`,
    to: `const BROWSER_EXT = createBrowserExtension({
  mediaDir: MEDIA_DIR,
  isHumanControlled: () => browserControlMode === "human",
  onActivity: () => {
    browserLastActivity = Date.now();
  },
});`,
  },
  {
    label: "gate ricalcolato dalle condizioni",
    from: `function applyToolGate() {
  if (!session) return;
  let tools = ALL_TOOLS.slice();`,
    to: `function applyToolGate() {
  if (!session) return;
  // in modo "auto" lo stato del tool è una conseguenza delle condizioni, non un flag fisso
  browserEnabled = browserShouldBeEnabled();
  let tools = ALL_TOOLS.slice();`,
  },
  {
    label: "rivalutazione periodica",
    from: `const newSessionManager = () => SessionManager.create(cwd(), SESSION_DIR);`,
    to: `// Rivaluta l'accensione del browser: senza questo, in modo "auto" resterebbe nello stato
// deciso al momento della richiesta precedente.
setInterval(() => {
  try {
    if (browserMode !== "auto") return;
    const want = browserShouldBeEnabled();
    if (want !== browserEnabled) {
      applyToolGate();
      broadcast("state", getState());
    }
  } catch {
    /* niente */
  }
}, 60_000).unref?.();

const newSessionManager = () => SessionManager.create(cwd(), SESSION_DIR);`,
  },
  {
    label: "watch: rivaluta subito il gate",
    from: `      const body = await readBody(req);
      if (body.on === false) browserLive.stop();
      else browserLive.start();
      broadcast("state", getState());`,
    to: `      const body = await readBody(req);
      if (body.on === false) browserLive.stop();
      else browserLive.start();
      // la live view è un motivo per avere il tool acceso: in modo "auto" rivaluta subito
      applyToolGate();
      broadcast("state", getState());`,
  },
  {
    label: "control: rivaluta subito il gate",
    from: `      browserControlMode = mode;
      broadcast("browser_control", { mode });
      broadcast("state", getState());`,
    to: `      browserControlMode = mode;
      applyToolGate();
      broadcast("browser_control", { mode });
      broadcast("state", getState());`,
  },
  {
    label: "stato del modo in /api/state",
    from: `      user: process.env.DASH_BROWSER_USER || "pi-browser",
      control: browserControlMode,`,
    to: `      user: process.env.DASH_BROWSER_USER || "pi-browser",
      mode: browserMode,
      idleMinutes: browserIdleMinutes,
      lastActivity: browserLastActivity || null,
      control: browserControlMode,`,
  },
  {
    label: "endpoint: accetta il modo",
    from: `    if (req.method === "POST" && url.pathname === "/api/browser") {
      const body = await readBody(req);
      const available = ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name));
      if (!available) return json(res, 400, { error: "tool browser non disponibile" });
      if (typeof body.enabled === "boolean") browserEnabled = body.enabled;
      applyToolGate();`,
    to: `    if (req.method === "POST" && url.pathname === "/api/browser") {
      const body = await readBody(req);
      const available = ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name));
      if (!available) return json(res, 400, { error: "tool browser non disponibile" });
      // "mode" è la forma nuova; "enabled" resta accettato per compatibilità
      if (typeof body.mode === "string") {
        if (!["auto", "on", "off"].includes(body.mode))
          return json(res, 400, { error: "mode deve essere auto, on oppure off" });
        browserMode = body.mode;
      } else if (typeof body.enabled === "boolean") {
        browserMode = body.enabled ? "on" : "off";
      }
      if (body.idleMinutes !== undefined) {
        const n = Number(body.idleMinutes);
        if (!Number.isFinite(n) || n < 1 || n > 1440)
          return json(res, 400, { error: "idleMinutes deve essere tra 1 e 1440" });
        browserIdleMinutes = Math.round(n);
      }
      saveBrowserPrefs();
      applyToolGate();`,
  },
  {
    label: "comando /browser con auto",
    from: `  browser: async ({ arg }) => {
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
  },`,
    to: `  browser: async ({ arg }) => {
    const available = ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name));
    if (!available) throw new HttpError(400, "tool browser non disponibile (agent-browser non registrato)");
    const val = String(arg || "").trim().toLowerCase();
    const who = process.env.DASH_BROWSER_USER || "pi-browser";
    const descr = () =>
      \`\\nmode: \${browserMode} (auto = acceso quando serve, si spegne da sé dopo \${browserIdleMinutes} min di inattività)\\n\` +
      \`tool adesso: \${browserEnabled ? "ACCESO" : "spento"} · utente \${who}\` +
      (browserLastActivity ? \`\\nultima attività: \${new Date(browserLastActivity).toLocaleTimeString("it-IT")}\` : "");
    if (!val) return { message: \`browser: \${browserEnabled ? "ON" : "off"}\${descr()}\` };
    if (!["on", "off", "auto", "status"].includes(val))
      throw new HttpError(400, "usa /browser on, /browser off, /browser auto oppure /browser status");
    if (val === "status") return { message: \`browser: \${browserEnabled ? "ON" : "off"}\${descr()}\` };
    browserMode = val === "status" ? browserMode : val;
    saveBrowserPrefs();
    applyToolGate();
    return {
      message: \`browser -> modo "\${browserMode}" · tool \${browserEnabled ? "ACCESO" : "spento"}\`,
      state: true,
      refresh: true,
    };
  },`,
  },
];

let src = fs.readFileSync(DASH, "utf8");
if (src.includes(MARKER)) {
  console.log(`• ${path.relative(ROOT, DASH)}: patch auto già applicata`);
  process.exit(0);
}
for (const e of EDITS) {
  const count = src.split(e.from).length - 1;
  if (count !== 1) {
    console.error(`✘ ancora "${e.label}": trovata ${count} volte (attesa 1). Interrompo.`);
    process.exit(1);
  }
  src = src.replace(e.from, e.to);
}
if (args.includes("--dry-run")) {
  console.log(`✓ ${EDITS.length} modifiche validate (dry-run, non scritto)`);
  process.exit(0);
}
fs.writeFileSync(DASH, src);
console.log(`✓ ${path.relative(ROOT, DASH)}: ${EDITS.length} modifiche applicate (accensione intelligente)`);

// le opzioni del comando nel catalogo condiviso
const CMD = path.join(ROOT, "media/commands.mjs");
let c = fs.readFileSync(CMD, "utf8");
const from = `    desc: "Attiva o disattiva il tool browser (naviga siti reali; consuma RAM)",
    usage: "/browser <on|off|status>",
    client: false,
    params: [{ name: "stato", label: "stato", kind: "enum", values: ["on", "off", "status"], hint: "on, off o status" }],`;
const to = `    desc: "Tool browser: auto (si accende quando serve), on, off",
    usage: "/browser <auto|on|off|status>",
    client: false,
    params: [{ name: "modo", label: "modo", kind: "enum", values: ["auto", "on", "off", "status"], hint: "auto, on, off o status" }],`;
if (c.includes(from)) {
  fs.writeFileSync(CMD, c.replace(from, to));
  console.log("✓ media/commands.mjs: opzioni di /browser aggiornate");
} else if (!c.includes('values: ["auto", "on", "off", "status"]')) {
  console.error("✘ catalogo comandi: ancora di /browser non trovata");
  process.exit(1);
}
