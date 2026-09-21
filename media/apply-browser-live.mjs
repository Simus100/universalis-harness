/**
 * Patch per la live view del browser (step `ui-live` del goal).
 * Idempotente, ancòra per ancòra, usabile su test e produzione:
 *   node media/apply-browser-live.mjs --root media/spike
 *   node media/apply-browser-live.mjs --root . --dry-run
 *
 * Modifiche a dashboard.mjs:
 *  1. import di createBrowserLive
 *  2. istanza browserLive (ponte verso lo stream, con broadcast sulla SSE)
 *  3. browserControlMode + lock passato a createBrowserExtension
 *  4. endpoint GET /api/browser/live, POST /api/browser/watch,
 *     POST /api/browser/input, POST /api/browser/control
 *  5. blocco `browser` in /api/state esteso con live e control
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const DASH = path.join(ROOT, "dashboard.mjs");
const MARKER = "media/browser-live.mjs";

const EDITS = [
  {
    label: "import di browser-live",
    from: `import { createBrowserExtension } from "./media/browser-tool.mjs";`,
    to: `import { createBrowserExtension } from "./media/browser-tool.mjs";
import { createBrowserLive } from "./media/browser-live.mjs";`,
  },
  {
    label: "istanza browserLive + modalità di controllo",
    from: `const BROWSER_EXT = createBrowserExtension({ mediaDir: MEDIA_DIR });`,
    to: `// Modalità di controllo del browser: "agent" (normale) o "human" (l'utente ha preso
// il controllo dalla live view). In modalità human il tool rifiuta di agire, così
// agente e persona non litigano sullo stesso browser.
let browserControlMode = "agent";

const BROWSER_EXT = createBrowserExtension({
  mediaDir: MEDIA_DIR,
  isHumanControlled: () => browserControlMode === "human",
});

// Ponte verso lo stream di agent-browser: la live view passa da qui, quindi eredita
// l'autenticazione della dashboard e non richiede porte nuove né modifiche a Caddy.
const browserLive = createBrowserLive({
  user: process.env.DASH_BROWSER_USER || "pi-browser",
  bin: process.env.DASH_BROWSER_BIN || "/usr/bin/agent-browser",
  maxFps: Number(process.env.DASH_BROWSER_STREAM_FPS) || 3,
  onLog: (m) => console.log(m),
  onEvent: (ev) => {
    // il frame non va nel log (è grande): va solo ai client
    if (ev.type === "frame") broadcast("browser_frame", ev);
    else if (ev.type === "url") broadcast("browser_url", ev);
    else if (ev.type === "tabs") broadcast("browser_tabs", ev);
    else if (ev.type === "error") broadcast("browser_live_error", ev);
    else broadcast("browser_live", ev);
  },
});`,
  },
  {
    label: "stato live/control in /api/state",
    from: `    browser: {
      available: ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name)),
      enabled: browserEnabled,
      activeTools: session.agent.state.tools
        .map((t) => t.name)
        .filter((n) => BROWSER_TOOL_NAMES.has(n)),
      user: process.env.DASH_BROWSER_USER || "pi-browser",
    },`,
    to: `    browser: {
      available: ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name)),
      enabled: browserEnabled,
      activeTools: session.agent.state.tools
        .map((t) => t.name)
        .filter((n) => BROWSER_TOOL_NAMES.has(n)),
      user: process.env.DASH_BROWSER_USER || "pi-browser",
      control: browserControlMode,
      live: browserLive.snapshot(),
    },`,
  },
  {
    label: "endpoint della live view",
    from: `    // Compaction manuale del contesto (equivalente a /compact della TUI di pi).`,
    to: `    // ---- live view del browser (ponte verso lo stream di agent-browser) ----
    if (req.method === "GET" && url.pathname === "/api/browser/live") {
      return json(res, 200, { live: browserLive.snapshot(), control: browserControlMode });
    }

    // apre/chiude il flusso dei frame verso i client (consuma banda: si attiva a richiesta)
    if (req.method === "POST" && url.pathname === "/api/browser/watch") {
      const body = await readBody(req);
      if (body.on === false) browserLive.stop();
      else browserLive.start();
      broadcast("state", getState());
      return json(res, 200, { live: browserLive.snapshot(), control: browserControlMode });
    }

    // inoltro degli input dell'utente al browser (solo in modalità human)
    if (req.method === "POST" && url.pathname === "/api/browser/input") {
      const body = await readBody(req, 64 * 1024);
      if (browserControlMode !== "human") {
        return json(res, 409, { error: "il controllo è dell'agente: premi 'prendi il controllo' per guidare tu il browser" });
      }
      try {
        const out = browserLive.input(body);
        return json(res, 200, out);
      } catch (e) {
        return json(res, 400, { error: String(e?.message || e) });
      }
    }

    // prende/restituisce il controllo (lock anti-conflitto con l'agente)
    if (req.method === "POST" && url.pathname === "/api/browser/control") {
      const body = await readBody(req);
      const mode = body.mode === "human" ? "human" : "agent";
      browserControlMode = mode;
      broadcast("browser_control", { mode });
      broadcast("state", getState());
      return json(res, 200, { control: browserControlMode, live: browserLive.snapshot() });
    }

    // Compaction manuale del contesto (equivalente a /compact della TUI di pi).`,
  },
];

let src = fs.readFileSync(DASH, "utf8");
if (src.includes(MARKER)) {
  console.log(`• ${path.relative(ROOT, DASH)}: patch live già applicata`);
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
console.log(`✓ ${path.relative(ROOT, DASH)}: ${EDITS.length} modifiche applicate (live view)`);
