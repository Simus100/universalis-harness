/**
 * TEST DEI VIDEO — interfaccia (browser vero).
 *
 * Copre ciò che i test statici non possono dimostrare:
 *  - un blocco ```video in un messaggio diventa un PLAYER, non un percorso: la card mostra nome,
 *    durata, risoluzione, formato e peso VERI (letti dai metadati del file decodificato);
 *  - il video NON parte da solo (una chat che si mette a suonare da sola è un difetto);
 *  - il player legge davvero i byte serviti dalla rotta, richieste parziali comprese: dopo un
 *    seek il tempo si sposta e il frame si DECODIFICA (pixel diversi su canvas — è la prova che
 *    il file arriva, che uno screenshot headless non può dare: il layer video non si compone);
 *  - i casi che devono fallire in modo comprensibile: percorso inesistente, file che non è un
 *    video, formato non riproducibile (.mkv), blocco mai chiuso;
 *  - gli alias (`mp4`, `filmato`) funzionano e la non-regressione tiene: ```img resta immagine,
 *    ```svg resta disegno, un ```js che cita ```video non produce nessun player;
 *  - schermo piccolo (390×844): nessun trabocco orizzontale;
 *  - nessun errore JavaScript non gestito.
 *
 * Avvia da sé un'istanza isolata + proxy di autenticazione e una sessione browser dedicata.
 *
 * Uso: node media/test-video-ui.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = "/root/pi-harness";
const PORT = 8486;
const PROXY = 8487;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-video-ui-"));
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "vidtest";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, extra = "") => (c ? ok(d) : ko(`${d}${extra ? " — " + extra : ""}`));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    ...opts,
  });

const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  let v;
  try {
    v = JSON.parse(out);
  } catch {
    return { raw: out };
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "true") return true;
    if (t === "false") return false;
    if (/^[[{-]|^\d/.test(t)) {
      try { return JSON.parse(t); } catch { return v; }
    }
    return v;
  }
  return v;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const evalUntil = async (expr, { timeout = 10000, step = 250 } = {}) => {
  const scadenza = Date.now() + timeout;
  let ultimo;
  while (Date.now() < scadenza) {
    ultimo = evalJs(expr);
    if (ultimo === true) return true;
    await wait(step);
  }
  return ultimo;
};

const FENCE = "\u0060\u0060\u0060";

/* ---------------- materiale di prova ---------------- */
const MEDIA = path.join(TMP, "media");
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(path.join(TMP, "sessions"), { recursive: true });
fs.mkdirSync(path.join(TMP, "skills"), { recursive: true });

const VIDEO = path.join(MEDIA, "video.mp4");
let ffmpeg = true;
try {
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2", "-pix_fmt", "yuv420p", "-y", VIDEO], { timeout: 120_000 });
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1", "-c:v", "libvpx-vp9", "-b:v", "150k", "-an", "-y", path.join(MEDIA, "clip.webm")], { timeout: 120_000 });
} catch {
  console.log("  (ffmpeg assente: i test di riproduzione saranno dichiarati non eseguibili)");
  ffmpeg = false;
  fs.writeFileSync(VIDEO, Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypisom", "latin1"),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from("isomiso2avc1mp41", "latin1"),
    Buffer.alloc(4096),
  ]));
}
fs.writeFileSync(path.join(MEDIA, "finto.mp4"), "<!doctype html><html>non sono un video</html>");
fs.writeFileSync(path.join(MEDIA, "nota.txt"), "solo testo\n");
fs.writeFileSync(path.join(MEDIA, "filmato.mkv"), Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from("matroska"), Buffer.alloc(512)]));
fs.writeFileSync(path.join(MEDIA, "foto.png"), Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII=",
  "base64",
));
const PESO = fs.statSync(VIDEO).size;

/* ---------------- messaggi di prova ---------------- */
const MSG_OK = [
  "Ecco il video che ho renderizzato.",
  `${FENCE}video\nmedia/video.mp4\nIl video di prova, due secondi\n${FENCE}`,
  "Sopra: 160×120 px, generato per il test.",
].join("\n");

const MSG_ALIAS = [
  "Con gli altri due linguaggi ammessi:",
  `${FENCE}mp4\nmedia/video.mp4\nAlias mp4\n${FENCE}`,
  `${FENCE}filmato\nmedia/clip.webm\nAlias filmato, un webm\n${FENCE}`,
].join("\n");

const MSG_ERRORI = [
  "Tre casi che devono fallire con un motivo:",
  `${FENCE}video\nmedia/non-esiste.mp4\nIl file non c'è\n${FENCE}`,
  `${FENCE}video\nmedia/nota.txt\nNon è un video\n${FENCE}`,
  `${FENCE}video\nmedia/filmato.mkv\nFormato non riproducibile\n${FENCE}`,
].join("\n");

const MSG_NONCHIUSO = ["Un blocco senza fence di chiusura:", `${FENCE}video\nmedia/video.mp4\n`].join("\n");

const MSG_NONREGRESSIONE = [
  "Un blocco js che cita video, poi una foto e un disegno.",
  `${FENCE}js\n// si cita così: ${FENCE}video per mostrare un filmato dal disco\nconst a = 1;\n${FENCE}`,
  `${FENCE}img\nmedia/foto.png\nUna foto\n${FENCE}`,
  `${FENCE}svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><title>Scheda</title><desc>Rettangolo.</desc><rect x="5" y="5" width="90" height="30" fill="#5b9dff"/></svg>\n${FENCE}`,
].join("\n");

/* ---------------- setup istanza + proxy + browser ---------------- */
const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: MEDIA,
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: TMP,
  DASH_ASK: "off",
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_VIDEO_MAX_BYTES: String(8 * 1024 * 1024),
  DASH_USER: "vd",
  DASH_PASSWORD: "vd",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "ignore", "pipe"],
});
dash.stderr.on("data", (d) => process.stderr.write("[istanza] " + d));
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "vd", "vd"], {
  cwd: ROOT,
  stdio: "ignore",
});
const cleanup = () => {
  try { ab(["close"], { stdio: "ignore" }); } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
  fs.rmSync(TMP, { recursive: true, force: true });
};
process.on("exit", cleanup);

for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PROXY}/api/state`);
    if (r.ok) break;
  } catch {
    /* non ancora pronto */
  }
  await wait(500);
}

const RENDER = (testo) =>
  `(() => { const T = ${JSON.stringify(testo)}; renderMessages([{ role: "assistant", ts: Date.now(), text: T, blocks: [{ type: "text", text: T }] }]); return true; })()`;

const SPAZIA = `(() => { const f = document.querySelector(".vidfig"); if (f) f.scrollIntoView({ block: "center" }); return true; })()`;

try {
  ab(["open", `http://127.0.0.1:${PROXY}/`]);
  await wait(1500);
  evalJs(`(() => { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("unhandled: " + String(e.reason && e.reason.message || e.reason))); return true; })()`);

  console.log("== 1. un blocco ```video diventa un player ==");
  evalJs(RENDER(MSG_OK));
  evalJs(SPAZIA);
  const pronto = await evalUntil(
    `(() => { const v = document.querySelector(".vidfig video"); return v && v.readyState >= 1 ? true : false; })()`,
    { timeout: 15000 },
  );
  check("i metadati del video arrivano (readyState ≥ 1)", pronto === true, JSON.stringify(pronto));
  check("una sola card, nessuna in errore", evalJs(`document.querySelectorAll(".vidfig").length`) === 1 && evalJs(`document.querySelectorAll(".vidfig.err").length`) === 0);
  const testa = evalJs(`(() => { const f = document.querySelector(".vidfig"); const v = f.querySelector("video"); return JSON.stringify({
    nome: f.querySelector(".imgnome").textContent,
    meta: f.querySelector(".imgmeta").textContent,
    cap: f.querySelector(".imgcap").textContent,
    etichetta: f.querySelector(".imgbox").getAttribute("aria-label"),
    bottoni: [...f.querySelectorAll(".imgacts button")].map(b => b.textContent.trim()),
    disabilitati: [...f.querySelectorAll(".imgacts button")].filter(b => b.disabled).length,
    pixel: v.videoWidth + "x" + v.videoHeight,
    durata: Math.round(v.duration * 10) / 10,
    controlli: v.controls,
    autoplay: v.autoplay,
    inPlay: !v.paused,
    preload: v.preload,
    attesa: !!f.querySelector(".imgwait"),
    src: v.currentSrc,
  }); })()`);
  const t = typeof testa === "string" ? JSON.parse(testa) : testa;
  check("il nome del file è in testa", t.nome === "video.mp4", String(t.nome));
  if (ffmpeg) {
    check("durata reale nei metadati (0:02)", /0:02/.test(t.meta), t.meta);
    check("risoluzione reale nei metadati (160×120 px)", /160×120 px/.test(t.meta), t.meta);
    check("il video è decodificato (pixel veri)", t.pixel === "160x120" && Math.abs(t.durata - 2) < 0.5, `${t.pixel} ${t.durata}`);
  }
  // il peso lo formatta `fmtSize` in KB/MB con un decimale: si confronta con lo stesso criterio
  const pesoAtteso = PESO < 1024 * 1024 ? (PESO / 1024).toFixed(1) : (PESO / 1024 / 1024).toFixed(1);
  check("formato e peso nei metadati", /mp4/.test(t.meta) && new RegExp(pesoAtteso.replace(".", "\\.")).test(t.meta), `${t.meta} (atteso ${pesoAtteso})`);
  check("la didascalia è sotto il player", t.cap.includes("video di prova"), t.cap);
  check("la didascalia è anche l'etichetta accessibile", t.etichetta === t.cap, String(t.etichetta));
  check("le azioni sono schermo pieno / scarica / copia percorso", t.bottoni.length === 3 && /schermo pieno/.test(t.bottoni[0]), JSON.stringify(t.bottoni));
  check("le azioni si attivano solo a video pronto", t.disabilitati === 0, String(t.disabilitati));
  check("i controlli nativi ci sono (barra del tempo, volume)", t.controlli === true);
  check("il testo di attesa è sparito", t.attesa === false);
  check("solo i metadati in preload, non i byte", t.preload === "metadata", String(t.preload));
  check("il player chiede i byte alla rotta /api/video", /\/api\/video\?path=/.test(String(t.src)), String(t.src));
  check("il video NON parte da solo", t.autoplay === false && t.inPlay === false, `autoplay=${t.autoplay} inPlay=${t.inPlay}`);

  console.log("\n== 2. il player legge davvero il file (richieste parziali comprese) ==");
  if (ffmpeg) {
    evalJs(`(() => { const v = document.querySelector(".vidfig video"); v.currentTime = 1.5; return true; })()`);
    const cercato = await evalUntil(
      `(() => { const v = document.querySelector(".vidfig video"); return v.currentTime >= 1.4 && v.readyState >= 2 ? true : false; })()`,
      { timeout: 10000 },
    );
    check("il seek a 1,5 s si applica davvero (il server ha servito la fascia)", cercato === true, JSON.stringify(cercato));
    const frame = evalJs(`(() => { const v = document.querySelector(".vidfig video"); const c = document.createElement("canvas"); c.width = 96; c.height = 72; const ctx = c.getContext("2d"); ctx.drawImage(v, 0, 0, 96, 72); const d = ctx.getImageData(0, 0, 96, 72).data; let min = 255, max = 0; for (let i = 0; i < d.length; i += 4) { const g = (d[i] + d[i+1] + d[i+2]) / 3; if (g < min) min = g; if (g > max) max = g; } return JSON.stringify({ min: Math.round(min), max: Math.round(max) }); })()`);
    const f = typeof frame === "string" ? JSON.parse(frame) : frame;
    check("il frame è DECODIFICATO (pixel diversi su canvas)", f.max - f.min > 5, JSON.stringify(f));
  } else {
    console.log("  (saltati: ffmpeg non disponibile)");
  }

  console.log("\n== 3. gli alias `mp4` e `filmato` ==");
  evalJs(RENDER(MSG_ALIAS));
  await evalUntil(`document.querySelectorAll(".vidfig").length === 2 && document.querySelectorAll(".vidfig.err").length === 0`, { timeout: 10000 });
  check("due card, nessuna in errore", evalJs(`document.querySelectorAll(".vidfig").length`) === 2 && evalJs(`document.querySelectorAll(".vidfig.err").length`) === 0);
  const aliasMeta = evalJs(`[...document.querySelectorAll(".vidfig .imgmeta")].map(e => e.textContent).join(" || ")`);
  check("il webm è riconosciuto come webm", /webm/.test(String(aliasMeta)), String(aliasMeta));

  console.log("\n== 4. i casi che devono fallire, con un motivo comprensibile ==");
  evalJs(RENDER(MSG_ERRORI));
  await evalUntil(`document.querySelectorAll(".vidfig.err").length === 3`, { timeout: 10000 });
  check("tutte e tre in errore", evalJs(`document.querySelectorAll(".vidfig.err").length`) === 3, String(evalJs(`document.querySelectorAll(".vidfig.err").length`)));
  const errori = evalJs(`[...document.querySelectorAll(".vidfig.err .imgerr")].map(e => e.textContent).join(" || ")`);
  check("il percorso inesistente è citato", /non-esiste\.mp4/.test(String(errori)), String(errori));
  check("un file non-video dice che non è un video", /non è un video/.test(String(errori)), String(errori));
  check("il mkv dichiara che il formato non si riproduce", /non si riproduce/.test(String(errori)), String(errori));
  check("nessun player lasciato a metà nei casi falliti", evalJs(`document.querySelectorAll(".vidfig.err video").length`) === 0);

  console.log("\n== 5. un blocco mai chiuso non resta appeso ==");
  evalJs(RENDER(MSG_NONCHIUSO));
  await wait(800);
  check("diventa una card con il motivo, non un player vuoto", /blocco video non chiuso/.test(String(evalJs(`document.querySelector(".vidfig.err .imgerr").textContent`))), String(evalJs(`document.querySelector(".vidfig.err .imgerr").textContent`)));

  console.log("\n== 6. non-regressione: img, svg e i blocchi js ==");
  evalJs(`renderMessages([])`);
  await wait(300);
  evalJs(RENDER(MSG_NONREGRESSIONE));
  await evalUntil(`document.querySelectorAll(".imgfig").length >= 2`, { timeout: 10000 });
  check("nessun player dove c'è un blocco js (citazione, non blocco)", evalJs(`document.querySelectorAll(".vidfig").length`) === 0, String(evalJs(`document.querySelectorAll(".vidfig").length`)));
  check("l'immagine resta una card immagine", evalJs(`document.querySelectorAll(".imgfig:not(.vidfig)").length`) === 1);
  check("il disegno SVG resta un disegno", evalJs(`document.querySelectorAll(".mdsvg, .svgfig, svg[viewBox]").length`) >= 1, String(evalJs(`document.querySelectorAll(".mdsvg, .svgfig, svg[viewBox]").length`)));

  console.log("\n== 7. schermo piccolo (390×844) ==");
  ab(["set", "device", "iPhone 12"]);
  await wait(500);
  ab(["open", `http://127.0.0.1:${PROXY}/`]);
  await wait(1500);
  evalJs(`(() => { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("unhandled: " + String(e.reason && e.reason.message || e.reason))); return true; })()`);
  evalJs(RENDER(MSG_OK));
  await evalUntil(`(() => { const v = document.querySelector(".vidfig video"); return v && v.readyState >= 1 ? true : false; })()`, { timeout: 12000 });
  evalJs(SPAZIA);
  check("il player sta nella larghezza dello schermo", evalJs(`(() => { const v = document.querySelector(".vidfig video"); return v.getBoundingClientRect().width <= window.innerWidth; })()`) === true);
  check("nessun trabocco orizzontale", evalJs(`document.documentElement.scrollWidth - window.innerWidth`) <= 0, String(evalJs(`document.documentElement.scrollWidth - window.innerWidth`)));
  const piccoli = evalJs(`[...document.querySelectorAll(".vidfig .imgacts button")].filter(b => b.getBoundingClientRect().height < 40).map(b => b.textContent.trim())`);
  check("i comandi sono bersagli da dito (≥40px)", Array.isArray(piccoli) && piccoli.length === 0, JSON.stringify(piccoli));

  console.log("\n== 8. salute del frontend ==");
  check("nessun errore JavaScript non gestito", evalJs(`window.__errs.length`) === 0, JSON.stringify(evalJs(`window.__errs`)));
} finally {
  cleanup();
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
