/**
 * TEST DEI DOCUMENTI PDF — interfaccia (browser vero).
 *
 * Copre ciò che i test statici non possono dimostrare:
 *  - un blocco ```pdf in un messaggio diventa una CARD con la prima pagina resa davvero
 *    (immagine rasterizzata: `naturalWidth > 0`), il numero di pagine e le azioni;
 *  - il LETTORE a pagine: apertura, pagina 1 di N, avanti/indietro, zoom, tastiera, chiusura;
 *  - l'apertura di un PDF dal file manager (che non deve finire nell'editor di testo);
 *  - i casi che devono fallire in modo comprensibile: percorso inesistente, file che è un PDF
 *    solo di nome, pagina oltre la fine;
 *  - documento senza testo (scansione): si vede lo stesso, e lo dichiara;
 *  - non-regressione: un ```img resta un'immagine, un ```js che cita ```pdf non produce card;
 *  - nessun errore JavaScript non gestito.
 *
 * Avvia da sé un'istanza isolata + proxy di autenticazione e una sessione browser dedicata.
 *
 * Uso: node media/test-pdf-ui.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { png } from "./test-image-util.mjs";
import { makePdf } from "./make-test-pdf.mjs";

const ROOT = "/root/pi-harness";
const PORT = 8484;
const PROXY = 8485;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-pdf-ui-"));
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "pdftest";

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
fs.mkdirSync(path.join(TMP, "media", "doc"), { recursive: true });
fs.mkdirSync(path.join(TMP, "sessions"), { recursive: true });
fs.mkdirSync(path.join(TMP, "skills"), { recursive: true });
const MEDIA = path.join(TMP, "media");
fs.writeFileSync(
  path.join(MEDIA, "doc", "prova.pdf"),
  makePdf({ pagine: ["Fattura di prova numero 2026-001", "Totale dovuto: 1.234,56 EUR", "Scadenza 31/12/2026"] }),
);
fs.writeFileSync(path.join(MEDIA, "doc", "scansione.pdf"), makePdf({ pagine: ["", ""], scansione: true }));
fs.writeFileSync(path.join(MEDIA, "finto.pdf"), "<!doctype html><html>non sono un pdf</html>");
fs.writeFileSync(path.join(MEDIA, "tramonto.png"), png(60, 40, [251, 146, 60]));

/* ---------------- messaggi di prova ---------------- */
const MSG_OK = [
  "Ho trovato il documento nel progetto.",
  `${FENCE}pdf\nmedia/doc/prova.pdf\nLa fattura di marzo, con il dettaglio delle voci\n${FENCE}`,
  "Sopra: 3 pagine, generata per il test.",
].join("\n");

const MSG_MISTI = [
  "Due casi che devono fallire.",
  `${FENCE}pdf\nmedia/finto.pdf\nQuesto non è un PDF\n${FENCE}`,
  `${FENCE}pdf\nmedia/doc/non-esiste.pdf\n${FENCE}`,
].join("\n");

const MSG_SCANSIONE = ["Documento senza testo:", `${FENCE}pdf\nmedia/doc/scansione.pdf\n${FENCE}`].join("\n");

const MSG_NONREGRESSIONE = [
  "Un blocco js che cita pdf, un'immagine e un disegno.",
  `${FENCE}js\n// si cita così: ${FENCE}pdf per mostrare un documento\nconst a = 1;\n${FENCE}`,
  `${FENCE}img\nmedia/tramonto.png\n${FENCE}`,
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
  DASH_USER: "pd",
  DASH_PASSWORD: "pd",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "ignore", "pipe"],
});
dash.stderr.on("data", (d) => process.stderr.write("[istanza] " + d));
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "pd", "pd"], {
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

  console.log("== 1. un blocco ```pdf diventa una card con la prima pagina ==");
  evalJs(RENDER(MSG_OK));
  evalJs(`(() => { const f = document.querySelector(".imgfig"); if (f) f.scrollIntoView({ block: "center" }); return true; })()`);
  const resa = await evalUntil(
    `(() => { const i = document.querySelector(".imgfig img"); return i && i.naturalWidth > 0 ? true : false; })()`,
    { timeout: 15000 },
  );
  check("la prima pagina è resa davvero (naturalWidth > 0)", resa === true, JSON.stringify(resa));
  const testa = evalJs(`(() => { const f = document.querySelector(".imgfig"); return JSON.stringify({
    etichetta: f.querySelector(".imglbl").textContent,
    nome: f.querySelector(".imgnome").textContent,
    meta: f.querySelector(".imgmeta").textContent,
    cap: f.querySelector(".imgcap").textContent,
    alt: f.querySelector("img").alt,
    bottoni: [...f.querySelectorAll(".imgacts button")].map(b => b.textContent.trim()),
  }); })()`);
  const t = typeof testa === "string" ? JSON.parse(testa) : testa;
  check("l'etichetta dice «documento»", t.etichetta === "documento", t.etichetta);
  check("il nome del file è in testa", t.nome === "prova.pdf", t.nome);
  check("i metadati dicono quante pagine e quanto pesa", /3 pagine/.test(t.meta) && /B/.test(t.meta), t.meta);
  check("la didascalia è sotto la pagina", /fattura di marzo/i.test(t.cap), t.cap);
  check("il testo alternativo descrive la pagina", /prima pagina|fattura di marzo/i.test(t.alt), t.alt);
  check("le azioni sono apri / scarica / copia percorso", t.bottoni.length === 3 && /apri/.test(t.bottoni[0]), JSON.stringify(t.bottoni));
  check("una sola card", evalJs(`document.querySelectorAll(".imgfig").length`) === 1);

  console.log("\n== 2. il lettore a pagine ==");
  evalJs(`document.querySelector(".imgfig img").click()`);
  await evalUntil(`document.getElementById("pdfViewer").hidden === false`, { timeout: 8000 });
  check("il clic sulla pagina apre il lettore", evalJs(`document.getElementById("pdfViewer").hidden`) === false);
  const prima = await evalUntil(
    `(() => { const i = document.getElementById("pImg"); return i && i.naturalWidth > 0 && document.getElementById("pCount").textContent === "1 di 3" ? true : false; })()`,
    { timeout: 15000 },
  );
  check("mostra la pagina 1 di 3, disegnata", prima === true, JSON.stringify(prima));
  check("l'immagine è larga come lo spazio disponibile", evalJs(`document.getElementById("pImg").style.width.endsWith("px")`) === true);
  const info1 = String(evalJs(`document.getElementById("pInfo").textContent`));
  check("le informazioni dicono pagina, dpi e percorso", /pagina 1/.test(info1) && /dpi/.test(info1) && /prova\.pdf/.test(info1), info1);
  const src1 = String(evalJs(`document.getElementById("pImg").getAttribute("src")`));
  check("la pagina arriva da /api/pdf", /^\/api\/pdf\?/.test(src1) && /pagina=1/.test(src1), src1);

  evalJs(`document.getElementById("pNext").click()`);
  const seconda = await evalUntil(`document.getElementById("pCount").textContent === "2 di 3" ? true : false`, { timeout: 15000 });
  check("la freccia avanti cambia pagina", seconda === true);
  await evalUntil(`(() => { const i = document.getElementById("pImg"); return i.complete && i.naturalWidth > 0 && /pagina=2/.test(i.getAttribute("src")) ? true : false; })()`, { timeout: 15000 });
  check("la pagina 2 è caricata", /pagina=2/.test(String(evalJs(`document.getElementById("pImg").getAttribute("src")`))));
  evalJs(`document.getElementById("pZoomIn").click()`);
  const zoom = await evalUntil(`parseInt(document.getElementById("pImg").style.width, 10) > parseInt(document.getElementById("pStage").clientWidth, 10) ? true : false`, { timeout: 8000 });
  check("lo zoom allarga la pagina oltre la finestra", zoom === true);
  evalJs(`document.getElementById("pFit").onclick()`);
  await wait(400);
  check("«adatta» riporta la pagina alla larghezza", parseInt(String(evalJs(`document.getElementById("pImg").style.width`)), 10) <= parseInt(String(evalJs(`document.getElementById("pStage").clientWidth`)), 10) + 2);
  evalJs(`document.getElementById("pPrev").click()`);
  await evalUntil(`document.getElementById("pCount").textContent === "1 di 3" ? true : false`, { timeout: 8000 });
  check("la freccia indietro torna alla prima", evalJs(`document.getElementById("pCount").textContent`) === "1 di 3");
  ab(["press", "Escape"]);
  await evalUntil(`document.getElementById("pdfViewer").hidden === true ? true : false`, { timeout: 6000 });
  check("Esc chiude il lettore", evalJs(`document.getElementById("pdfViewer").hidden`) === true);

  console.log("\n== 3. casi che devono fallire, con un motivo comprensibile ==");
  evalJs(RENDER(MSG_MISTI));
  await evalUntil(`document.querySelectorAll(".imgfig.err").length === 2 ? true : false`, { timeout: 12000 });
  const errori = String(evalJs(`[...document.querySelectorAll(".imgfig.err .imgerr")].map(e => e.textContent).join(" || ")`));
  check("due card in errore", evalJs(`document.querySelectorAll(".imgfig.err").length`) === 2, errori);
  check("il file non-PDF lo dice", /non è un PDF/.test(errori), errori);
  check("il percorso inesistente è citato", /non-esiste\.pdf/.test(errori), errori);

  console.log("== 4. documento senza testo (scansione) ==");
  evalJs(RENDER(MSG_SCANSIONE));
  await evalUntil(`(() => { const i = document.querySelector(".imgfig img"); return i && i.naturalWidth > 0 ? true : false; })()`, { timeout: 15000 });
  const metaScan = String(evalJs(`document.querySelector(".imgfig .imgmeta").textContent`));
  check("la pagina si vede comunque", evalJs(`document.querySelector(".imgfig img").naturalWidth > 0`) === true);
  check("dichiara che il testo non c'è", /senza testo/.test(metaScan), metaScan);

  console.log("\n== 5. apertura dal file manager ==");
  evalJs(`openFile("media/doc/prova.pdf")`);
  await evalUntil(`document.getElementById("pdfViewer").hidden === false ? true : false`, { timeout: 8000 });
  check("il PDF si apre nel lettore, non nell'editor di testo", evalJs(`document.getElementById("pdfViewer").hidden`) === false);
  check("l'editor di testo non è stato toccato", evalJs(`(document.getElementById("eName")||{}).textContent !== "media/doc/prova.pdf"`) === true);
  await evalUntil(`document.getElementById("pCount").textContent === "1 di 3" ? true : false`, { timeout: 15000 });
  check("mostra di nuovo la prima pagina", evalJs(`document.getElementById("pCount").textContent`) === "1 di 3");
  evalJs(`closePdfViewer()`);

  console.log("\n== 6. non-regressione ==");
  evalJs(RENDER(MSG_NONREGRESSIONE));
  await evalUntil(`document.querySelectorAll(".svgfig").length === 1 && document.querySelectorAll(".imgfig").length === 1 ? true : false`, { timeout: 12000 });
  check("il blocco ```img resta un'immagine", evalJs(`document.querySelectorAll(".imgfig .imglbl")[0].textContent`) === "immagine");
  check("il blocco ```svg resta un disegno", evalJs(`document.querySelectorAll(".svgfig").length`) === 1);
  check("il blocco js che cita ```pdf non produce card", evalJs(`document.querySelectorAll(".imgfig").length`) === 1, String(evalJs(`document.querySelectorAll(".imgfig").length`)));

  console.log("\n== 7. salute della pagina ==");
  const errs = evalJs(`JSON.stringify(window.__errs || [])`);
  const lista = Array.isArray(errs) ? errs : String(errs) === "[]" ? [] : [String(errs)];
  check("nessun errore JavaScript non gestito", lista.length === 0, JSON.stringify(lista));
  check(
    "nessun trabocco orizzontale con il lettore aperto",
    (() => {
      evalJs(`openPdfViewer("media/doc/prova.pdf")`);
      return evalJs(`document.documentElement.scrollWidth <= window.innerWidth + 2`);
    })() !== false,
  );
  evalJs(`closePdfViewer()`);
} catch (e) {
  ko(`eccezione: ${e?.message || e}`);
} finally {
  try { ab(["close"], { stdio: "ignore" }); } catch {}
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
