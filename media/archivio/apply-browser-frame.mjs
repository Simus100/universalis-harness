/**
 * Patch: mostra subito l'ultimo frame disponibile aprendo la vista live.
 * Idempotente. Uso:
 *   node media/apply-browser-frame.mjs --root .            (produzione)
 *   node media/apply-browser-frame.mjs --root media/spike  (test)
 *
 * Perché: i frame arrivano solo quando la pagina CAMBIA, quindi aprendo la vista live su
 * una pagina ferma non si vedrebbe nulla finché non succede qualcosa. Il bridge conserva
 * l'ultimo frame (5 minuti) e il client lo carica all'apertura.
 *
 * Modifiche:
 *  1. endpoint GET /api/browser/live/frame
 *  2. openLive() nel frontend carica l'ultimo frame
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const DASH = path.join(ROOT, "dashboard.mjs");
const HTML = path.join(ROOT, "dashboard.html");
const MARKER = "/api/browser/live/frame";

const EDITS_DASH = [
  {
    label: "endpoint ultimo frame",
    from: `    // apre/chiude il flusso dei frame verso i client (consuma banda: si attiva a richiesta)`,
    to: `    // ultimo frame disponibile: serve a mostrare subito la pagina aprendo la vista live
    // (i frame arrivano solo ai cambi di pagina, quindi su una pagina ferma non ne arriverebbero)
    if (req.method === "GET" && url.pathname === "/api/browser/live/frame") {
      const f = browserLive.lastFrame();
      if (!f) return json(res, 204, {});
      return json(res, 200, { frame: f });
    }

    // apre/chiude il flusso dei frame verso i client (consuma banda: si attiva a richiesta)`,
  },
];

const EDITS_HTML = [
  {
    label: "openLive carica l'ultimo frame",
    from: `async function openLive() {
  try {
    const r = await (await fetch("/api/browser/live")).json();
    applyLive(r.live, r.control);
  } catch {
    /* niente */
  }
}`,
    to: `async function openLive() {
  try {
    const r = await (await fetch("/api/browser/live")).json();
    applyLive(r.live, r.control);
    await loadLastFrame();
  } catch {
    /* niente */
  }
}

/** Disegna l'ultimo frame disponibile, così la vista non è vuota su una pagina ferma. */
async function loadLastFrame() {
  try {
    const r = await fetch("/api/browser/live/frame");
    if (r.status !== 200) return;
    const f = (await r.json()).frame;
    if (!f || !f.data) return;
    if (liveLastFrame && f.seq && liveLastSeq >= (f.seq || 0)) return; // c'è già uno più recente
    liveRenderFrame(f);
  } catch {
    /* niente */
  }
}

/** Unico punto in cui il frame viene disegnato (usato dai frame SSE e dall'ultimo frame). */
function liveRenderFrame(f) {
  $("liveImg").src = "data:image/jpeg;base64," + f.data;
  liveLastFrame = Date.now();
  liveLastSeq = f.seq || liveLastSeq;
  const kb = Math.round((f.data.length * 0.75) / 1024);
  const age = f.ageNowMs != null ? f.ageNowMs : f.ageMs;
  $("liveStats").textContent =
    \`\${f.width}×\${f.height} · \${kb} KB\` + (age != null ? \` · età \${age}ms\` : "");
  $("liveEmpty").style.display = "none";
}`,
  },
  {
    label: "usa il renderer unico per i frame SSE",
    from: `es.addEventListener("browser_frame", (e) => {
  if (document.body.dataset.tab !== "live") return; // non renderizzare se non si sta guardando
  try {
    const j = JSON.parse(e.data);
    $("liveImg").src = "data:image/jpeg;base64," + j.data;
    liveLastFrame = Date.now();
    $("liveStats").textContent =
      \`\${j.width}×\${j.height} · \${Math.round((j.data.length * 0.75) / 1024)} KB · età \${j.ageMs}ms\`;
    $("liveEmpty").style.display = "none";
  } catch {}
});`,
    to: `es.addEventListener("browser_frame", (e) => {
  if (document.body.dataset.tab !== "live") return; // non renderizzare se non si sta guardando
  try {
    liveRenderFrame(JSON.parse(e.data));
  } catch {}
});`,
  },
  {
    label: "variabile liveLastSeq",
    from: `let liveLastFrame = 0;`,
    to: `let liveLastFrame = 0;
let liveLastSeq = 0;`,
  },
];

function applyFile(file, edits, { dryRun }) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(MARKER) && file === DASH) {
    console.log(`• ${path.relative(ROOT, file)}: già applicata (salto)`);
    return true;
  }
  if (src.includes("loadLastFrame") && file === HTML) {
    console.log(`• ${path.relative(ROOT, file)}: già applicata (salto)`);
    return true;
  }
  for (const e of edits) {
    const count = src.split(e.from).length - 1;
    if (count !== 1) {
      console.error(`✘ ${path.basename(file)} → ancora "${e.label}": trovata ${count} volte (attesa 1)`);
      return false;
    }
    src = src.replace(e.from, e.to);
  }
  if (dryRun) {
    console.log(`✓ ${path.relative(ROOT, file)}: ${edits.length} modifiche validate (dry-run)`);
    return true;
  }
  fs.writeFileSync(file, src);
  console.log(`✓ ${path.relative(ROOT, file)}: ${edits.length} modifiche applicate`);
  return true;
}

const dry = args.includes("--dry-run");
const ok1 = applyFile(DASH, EDITS_DASH, { dryRun: dry });
const ok2 = applyFile(HTML, EDITS_HTML, { dryRun: dry });
process.exit(ok1 && ok2 ? 0 : 1);
