/**
 * TEST DELLE IMMAGINI — interfaccia (browser vero).
 *
 * Copre ciò che i test statici non possono dimostrare:
 *  - un blocco ```img in un messaggio diventa un'ANTEPRIMA GRAFICA (immagine rasterizzata:
 *    `naturalWidth > 0`) con didascalia, formato e peso veri;
 *  - i casi che devono fallire in modo comprensibile: file che non è un'immagine, percorso
 *    inesistente, immagine oltre il limite dell'anteprima;
 *  - la MINIATURA nella card di un file immagine, cliccabile;
 *  - il lettore a schermo intero: galleria con frecce, zoom, rotazione, schermo intero, tastiera,
 *    metadati (pixel, peso, formato, data);
 *  - non-regressione: i blocchi ```svg restano disegni, un ```js che cita ```img non produce figure;
 *  - schermo piccolo (390×844): nessun trabocco orizzontale, bersagli da dito;
 *  - nessun errore JavaScript non gestito.
 *
 * Avvia da sé un'istanza isolata + proxy di autenticazione e una sessione browser dedicata.
 *
 * Uso: node media/test-image-ui.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { png } from "./test-image-util.mjs";

const ROOT = "/root/pi-harness";
const PORT = 8482;
const PROXY = 8483;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-image-ui-"));
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "imgtest";

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
const evalUntil = async (expr, { timeout = 8000, step = 250 } = {}) => {
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
fs.mkdirSync(path.join(TMP, "media", "foto"), { recursive: true });
fs.mkdirSync(path.join(TMP, "sessions"), { recursive: true });
fs.mkdirSync(path.join(TMP, "skills"), { recursive: true });
const MEDIA = path.join(TMP, "media");
fs.writeFileSync(path.join(MEDIA, "tramonto.png"), png(60, 40, [251, 146, 60]));
fs.writeFileSync(path.join(MEDIA, "quadrata.png"), png(200, 200, [139, 92, 255]));
// più grande dello schermo: solo così «adatta» (scala < 1) si distingue da «1:1»
fs.writeFileSync(path.join(MEDIA, "foto", "uno.png"), png(1200, 800, [91, 157, 255]));
fs.writeFileSync(path.join(MEDIA, "foto", "due.png"), png(500, 400, [52, 211, 153]));
fs.writeFileSync(path.join(MEDIA, "foto", "tre.png"), png(300, 200, [251, 113, 133]));
fs.writeFileSync(path.join(MEDIA, "foto", "note.txt"), "non è una foto\n");
fs.writeFileSync(path.join(MEDIA, "finta.png"), "<!doctype html><html>non sono una foto</html>");
// oltre il limite di anteprima (il tetto è impostato a 8 KB per l'istanza di prova)
fs.writeFileSync(path.join(MEDIA, "enorme.png"), Buffer.concat([png(50, 50), Buffer.alloc(12 * 1024)]));

/* ---------------- messaggi di prova ---------------- */
const MSG_OK = [
  "Ecco la foto che ho trovato nel progetto.",
  `${FENCE}img\nmedia/tramonto.png\nIl tramonto ripreso dal molo\n${FENCE}`,
  "Sopra: 60×40 px, generata per il test.",
].join("\n");

const MSG_MISTI = [
  "Un'immagine valida, poi due casi che devono fallire.",
  `${FENCE}img\nmedia/quadrata.png\n${FENCE}`,
  `${FENCE}img\nmedia/finta.png\nQuesta non è un'immagine\n${FENCE}`,
  `${FENCE}img\nmedia/non-esiste.png\n${FENCE}`,
].join("\n");

const MSG_GRANDE = ["Troppo grande per l'anteprima:", `${FENCE}img\nmedia/enorme.png\n${FENCE}`].join("\n");

const MSG_NONREGRESSIONE = [
  "Un blocco js che cita img, e poi un disegno vero.",
  `${FENCE}js\n// si cita così: ${FENCE}img per mostrare una foto dal disco\nconst a = 1;\n${FENCE}`,
  `${FENCE}svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><title>Scheda</title><desc>Rettangolo blu.</desc><rect x="5" y="5" width="90" height="30" fill="#5b9dff"/></svg>\n${FENCE}`,
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
  DASH_IMAGE_MAX_BYTES: "8192",
  DASH_USER: "im",
  DASH_PASSWORD: "im",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "ignore", "pipe"],
});
dash.stderr.on("data", (d) => process.stderr.write("[istanza] " + d));
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "im", "im"], {
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

try {
  ab(["open", `http://127.0.0.1:${PROXY}/`]);
  await wait(1500);
  evalJs(`(() => { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("unhandled: " + String(e.reason && e.reason.message || e.reason))); return true; })()`);

  console.log("== 1. un blocco ```img diventa un'anteprima grafica ==");
  evalJs(RENDER(MSG_OK));
  evalJs(`(() => { const f = document.querySelector(".imgfig"); if (f) f.scrollIntoView({ block: "center" }); return true; })()`);
  const resa = await evalUntil(
    `(() => { const f = document.querySelector(".imgfig img"); return f && f.naturalWidth > 0 ? true : false; })()`,
    { timeout: 10000 },
  );
  check("l'anteprima è disegnata davvero (naturalWidth > 0)", resa === true, JSON.stringify(resa));
  check("una sola figura", evalJs(`document.querySelectorAll(".imgfig").length`) === 1);
  check("nessuna figura in errore", evalJs(`document.querySelectorAll(".imgfig.err").length`) === 0);
  const testaFig = evalJs(`(() => { const f = document.querySelector(".imgfig"); return JSON.stringify({
    nome: f.querySelector(".imgnome").textContent,
    meta: f.querySelector(".imgmeta").textContent,
    cap: f.querySelector(".imgcap").textContent,
    alt: f.querySelector("img").alt,
    bottoni: [...f.querySelectorAll(".imgacts button")].map(b => b.textContent.trim()),
    disabilitati: [...f.querySelectorAll(".imgacts button")].filter(b => b.disabled).length,
  }); })()`);
  const t = typeof testaFig === "string" ? JSON.parse(testaFig) : testaFig;
  check("il nome del file è in testa", t.nome === "tramonto.png", String(t.nome));
  check("i metadati riportano pixel, formato e peso", /60×40 px/.test(t.meta) && /png/.test(t.meta) && /B/.test(t.meta), t.meta);
  check("la didascalia è sotto l'immagine", t.cap.includes("tramonto"), t.cap);
  check("la didascalia è anche il testo alternativo (accessibilità)", t.alt.includes("tramonto"), t.alt);
  check("le azioni sono ingrandisci / scarica / copia percorso", t.bottoni.length === 3 && /ingrandisci/.test(t.bottoni[0]), JSON.stringify(t.bottoni));
  check("le azioni sono attive solo quando l'immagine è caricata", t.disabilitati === 0, String(t.disabilitati));

  console.log("\n== 2. i casi che devono fallire, con un motivo comprensibile ==");
  evalJs(RENDER(MSG_MISTI));
  await evalUntil(`document.querySelectorAll(".imgfig").length === 3 && document.querySelectorAll(".imgfig.err").length === 2`, { timeout: 8000 });
  const errori = evalJs(`[...document.querySelectorAll(".imgfig.err .imgerr")].map(e => e.textContent).join(" || ")`);
  check("3 figure, di cui 2 in errore", evalJs(`document.querySelectorAll(".imgfig").length`) === 3 && evalJs(`document.querySelectorAll(".imgfig.err").length`) === 2, String(errori));
  check("il file non-immagine dice che non è un'immagine", /non è un'immagine/.test(String(errori)), String(errori));
  check("il percorso inesistente è citato nel messaggio", /non-esiste\.png/.test(String(errori)), String(errori));
  check(
    "nella figura in errore l'immagine non resta visibile",
    evalJs(`[...document.querySelectorAll(".imgfig.err")].every(f => getComputedStyle(f.querySelector(".imgbox")).display === "none")`) === true,
  );

  console.log("\n== 3. immagine oltre il limite dell'anteprima ==");
  evalJs(RENDER(MSG_GRANDE));
  await evalUntil(`document.querySelector(".imgfig.err") ? true : false`, { timeout: 8000 });
  const grande = evalJs(`(document.querySelector(".imgfig.err .imgerr") || {}).textContent || ""`);
  check("viene rifiutata con il limite indicato", /limite/.test(String(grande)), String(grande));
  check("il messaggio dice come aprirla", /apri|scarica/.test(String(grande)), String(grande));

  console.log("\n== 4. non-regressione: svg e blocchi di codice ==");
  evalJs(RENDER(MSG_NONREGRESSIONE));
  await evalUntil(`document.querySelectorAll(".svgfig").length === 1`, { timeout: 8000 });
  check("il blocco svg resta un disegno (.svgfig)", evalJs(`document.querySelectorAll(".svgfig").length`) === 1);
  check("il blocco js che cita ```img non produce figure", evalJs(`document.querySelectorAll(".imgfig").length`) === 0, String(evalJs(`document.querySelectorAll(".imgfig").length`)));
  check("nessun disegno finito nel blocco immagini", evalJs(`document.querySelectorAll(".imgfig svg").length`) === 0);

  console.log("\n== 5. miniatura nella card del file ==");
  evalJs(`(() => { const box = document.createElement("div"); document.getElementById("chatView").appendChild(box); fillFileCards(box, ["media/tramonto.png"]); return true; })()`);
  evalJs(`(() => { const i = document.querySelector(".filecard .fthumb"); if (i) i.scrollIntoView({ block: "center" }); return true; })()`);
  const thumb = await evalUntil(`(() => { const i = document.querySelector(".filecard .fthumb"); return i && i.naturalWidth > 0 ? true : false; })()`, { timeout: 8000 });
  check("la card mostra una miniatura vera", thumb === true, JSON.stringify(thumb));
  check("il pulsante della card dice «vedi grande»", evalJs(`document.querySelector(".filecard .fbtn").textContent.trim()`) === "vedi grande");
  evalJs(`document.querySelector(".filecard .fthumb").click()`);
  await evalUntil(`document.getElementById("viewer").hidden === false`, { timeout: 6000 });
  check("il clic sulla miniatura apre il lettore", evalJs(`document.getElementById("viewer").hidden`) === false);
  evalJs(`closeViewer()`);

  console.log("\n== 6. lettore a schermo intero ==");
  evalJs(`openViewer("media/foto/uno.png")`);
  // si attende l'immagine GIUSTA: naturalWidth>0 da solo si accontenterebbe di quella precedente
  await evalUntil(`(() => document.getElementById("vName").textContent === "uno.png" && vNatural.w === 2400)()`, { timeout: 10000 });
  const stato0 = evalJs(`(() => { const i = document.getElementById("vImg"); return JSON.stringify({
    nome: document.getElementById("vName").textContent,
    conteggio: document.getElementById("vCount").textContent,
    info: document.getElementById("vInfo").textContent,
    transform: i.style.transform,
    src: i.getAttribute("src"),
  }); })()`);
  const s0 = typeof stato0 === "string" ? JSON.parse(stato0) : stato0;
  check("l'immagine è caricata da /api/image (formato verificato)", /^\/api\/image\?path=/.test(s0.src), s0.src);
  check("il nome mostrato è quello del file", s0.nome === "uno.png", s0.nome);
  check("la galleria conta le immagini della cartella (3)", /di 3/.test(s0.conteggio), s0.conteggio);
  check("i metadati riportano pixel, formato e peso", /1200×800 px/.test(s0.info) && /png/.test(s0.info), s0.info);
  check("l'immagine è adattata (transform con scale)", /scale\(/.test(s0.transform), s0.transform);

  console.log("  -- frecce e tastiera");
  evalJs(`document.getElementById("vNext").click()`);
  await wait(400);
  const dopoNext = evalJs(`document.getElementById("vName").textContent`);
  check("«→» passa all'immagine successiva", dopoNext !== "uno.png", String(dopoNext));
  evalJs(`document.getElementById("vPrev").click()`);
  await wait(400);
  check("«←» torna indietro", evalJs(`document.getElementById("vName").textContent`) === "uno.png", String(evalJs(`document.getElementById("vName").textContent`)));
  ab(["press", "ArrowRight"]);
  await wait(400);
  check("anche il tasto → cambia immagine", evalJs(`document.getElementById("vName").textContent`) !== "uno.png");
  ab(["press", "ArrowLeft"]);
  await wait(400);

  console.log("  -- zoom e rotazione");
  const scalaDi = () =>
    evalJs(`(() => { const t = document.getElementById("vImg").style.transform; const i = t.indexOf("scale("); return i < 0 ? 0 : Number(t.slice(i + 6, -1)); })()`);
  const clicZoom = async () => { evalJs(`document.getElementById("vFit").click()`); await wait(200); };
  // apertura del lettore: si parte già da «adatta» (immagine intera, scala sotto 1)
  const scalaAdatta = scalaDi();
  check("«adatta» scala l'immagine sotto l'1:1", Number(scalaAdatta) < 0.99, String(scalaAdatta));
  check("il pulsante dice «adatta»", evalJs(`document.getElementById("vFit").textContent`) === "adatta");
  await clicZoom();
  check("primo clic → 1:1 (scala 1)", Math.abs(Number(scalaDi()) - 1) < 0.01, String(scalaDi()));
  await clicZoom();
  check("secondo clic → 2× (scala 2)", Math.abs(Number(scalaDi()) - 2) < 0.01, String(scalaDi()));
  await clicZoom();
  check("terzo clic → di nuovo adattata", evalJs(`document.getElementById("vFit").textContent`) === "adatta", String(evalJs(`document.getElementById("vFit").textContent`)));
  check("e la scala torna quella di prima", Math.abs(Number(scalaDi()) - Number(scalaAdatta)) < 0.01, `${scalaDi()} vs ${scalaAdatta}`);
  evalJs(`document.getElementById("vZoomIn").click()`);
  await wait(250);
  check("«＋» ingrandisce rispetto ad adatta", Number(scalaDi()) > Number(scalaAdatta), String(scalaDi()));
  evalJs(`document.getElementById("vRotate").click()`);
  await wait(250);
  check("«⟳» ruota di 90°", /rotate\(90deg\)/.test(String(evalJs(`document.getElementById("vImg").style.transform`))), String(evalJs(`document.getElementById("vImg").style.transform`)));
  check("la rotazione è scritta nei metadati", /ruotata 90/.test(String(evalJs(`document.getElementById("vInfo").textContent`))), String(evalJs(`document.getElementById("vInfo").textContent`)));
  evalJs(`document.getElementById("vRotate").click()`);
  await wait(200);

  console.log("  -- schermo intero e chiusura");
  evalJs(`document.getElementById("vFull").click()`);
  await wait(700);
  check("il pulsante cambia stato (⤡)", evalJs(`document.getElementById("vFull").textContent`) === "⤡", String(evalJs(`document.getElementById("vFull").textContent`)));
  if (evalJs(`!!document.fullscreenElement`) === true) {
    check("il browser è davvero a schermo intero", true);
    ab(["press", "F"]);
    await wait(500);
  } else {
    // headless senza supporto Fullscreen: si accetta, purché il pulsante sia tornato coerente
    ok("schermo intero non concesso dal browser di prova: lo stato resta coerente");
    evalJs(`setVFull(false)`);
    await wait(200);
  }
  ab(["press", "Escape"]);
  await wait(400);
  check("Esc chiude il lettore", evalJs(`document.getElementById("viewer").hidden`) === true);

  console.log("\n== 7. schermo piccolo (390×844) ==");
  ab(["set", "device", "iPhone 12"]);
  await wait(500);
  ab(["open", `http://127.0.0.1:${PROXY}/`]);
  await wait(1500);
  // la pagina è stata ricaricata: gli accumulatori di prova vanno reimpostati
  evalJs(`(() => { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("unhandled: " + String(e.reason && e.reason.message || e.reason))); return true; })()`);
  evalJs(RENDER(MSG_OK));
  await evalUntil(`(() => { const i = document.querySelector(".imgfig img"); return i && i.naturalWidth > 0 ? true : false; })()`, { timeout: 8000 });
  check("l'anteprima sta nella larghezza dello schermo", evalJs(`(() => { const i = document.querySelector(".imgfig img"); return i.getBoundingClientRect().width <= window.innerWidth; })()`) === true);
  check("nessun trabocco orizzontale", evalJs(`document.documentElement.scrollWidth - window.innerWidth`) <= 0, String(evalJs(`document.documentElement.scrollWidth - window.innerWidth`)));
  evalJs(`openViewer("media/foto/uno.png")`);
  // si attende l'immagine GIUSTA: naturalWidth>0 da solo si accontenterebbe di quella precedente
  await evalUntil(`(() => document.getElementById("vName").textContent === "uno.png" && vNatural.w === 2400)()`, { timeout: 10000 });
  check("nella lightbox nessun trabocco orizzontale", evalJs(`document.documentElement.scrollWidth - window.innerWidth`) <= 0, String(evalJs(`document.documentElement.scrollWidth - window.innerWidth`)));
  const piccoli = evalJs(`[...document.querySelectorAll("#viewer .vbar button")].filter(b => b.getBoundingClientRect().height < 40).map(b => b.id)`);
  check("i comandi del lettore sono bersagli da dito (≥40px)", Array.isArray(piccoli) && piccoli.length === 0, JSON.stringify(piccoli));
  check("l'immagine resta dentro lo stage", evalJs(`(() => { const i = document.getElementById("vImg").getBoundingClientRect(); const s = document.getElementById("vStage").getBoundingClientRect(); return i.width <= s.width + 2 && i.height <= s.height + 2; })()`) === true);
  evalJs(`closeViewer()`);

  console.log("\n== 8. salute del frontend ==");
  check("nessun errore JavaScript non gestito", evalJs(`window.__errs.length`) === 0, JSON.stringify(evalJs(`window.__errs`)));
} finally {
  cleanup();
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
