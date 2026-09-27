/**
 * TEST END-TO-END DELL'ANTEPRIMA SVG NELLA CHAT (browser reale, Chrome headless).
 *
 * Copre ciò che nessun test statico può dimostrare:
 *  - il blocco ```svg diventa un'ANTEPRIMA GRAFICA nel punto giusto del messaggio (forme, testo,
 *    gradienti davvero rasterizzati dal browser: naturalWidth > 0);
 *  - l'SVG con script, attributi evento e risorse esterne NON viene mai eseguito né caricato;
 *  - il Blob URL contiene solo la versione sanificata, ed è revocato quando non serve più;
 *  - i blocchi di codice NON svg restano testo, identici a prima;
 *  - streaming incompleto, SVG invalido e più blocchi nello stesso messaggio;
 *  - ridisegno/ricaricamento della conversazione (idempotenza, nessun blob orfano);
 *  - vista ingrandita, «mostra codice», copia, download;
 *  - schermo piccolo: nessun trabocco orizzontale.
 *
 * Avvia da sé un'istanza isolata + un proxy per l'autenticazione, usa una sessione browser
 * dedicata ("svgtest") e spegne tutto alla fine.
 *
 * Uso: node media/test-svg-preview.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8494;
const PROXY = 8495;
const TMP = "/tmp/pi-svg-preview";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "svgtest";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));

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
    // agent-browser può restituire il valore quotato due volte: si riprova quando il contenuto
    // è un altro valore JSON, altrimenti si perderebbe il testo (per esempio il codice SVG).
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

/** Ripete una valutazione finché il risultato non è "verde" (o scade il tempo). */
const evalUntil = async (expr, { timeout = 8000, step = 250 } = {}) => {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = evalJs(expr);
    if (last === true || (last && last.ok === true)) return last;
    await wait(step);
  }
  return last;
};

/* ---------------- materiale di prova ---------------- */

const FLUSSO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 180">
  <title>Flusso di pubblicazione</title>
  <desc>Tre passaggi in sequenza. Non in scala.</desc>
  <rect x="20" y="60" width="130" height="60" rx="10" fill="#172033" stroke="#5b9dff" stroke-width="2"/>
  <text x="85" y="95" text-anchor="middle" font-size="15" fill="#eef2f9">bozza</text>
  <polygon points="152,90 170,82 170,98" fill="#8b97ac"/>
  <rect x="185" y="60" width="130" height="60" rx="10" fill="#172033" stroke="#5b9dff" stroke-width="2"/>
  <text x="250" y="95" text-anchor="middle" font-size="15" fill="#eef2f9">revisione</text>
  <polygon points="317,90 335,82 335,98" fill="#8b97ac"/>
  <rect x="350" y="60" width="130" height="60" rx="10" fill="#1d293d" stroke="#34d399" stroke-width="2"/>
  <text x="415" y="95" text-anchor="middle" font-size="15" fill="#eef2f9">pubblicazione</text>
</svg>`;

const GRADIENTE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 120">
  <title>Sfumatura</title>
  <desc>Rettangolo con gradiente lineare e cerchio con gradiente radiale.</desc>
  <defs>
    <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5b9dff"/><stop offset="1" stop-color="#8b5cff"/>
    </linearGradient>
    <radialGradient id="rg">
      <stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#172033"/>
    </radialGradient>
  </defs>
  <rect x="10" y="20" width="160" height="80" rx="12" fill="url(#lg)"/>
  <circle cx="240" cy="60" r="45" fill="url(#rg)" stroke="#eef2f9" stroke-width="2"/>
  <text x="160" y="112" text-anchor="middle" font-size="13" fill="#c6cfdd">gradienti locali</text>
</svg>`;

// parti pericolose: script + evento (rifiuto totale) e risorse esterne (rimozione)
const MALEVOLO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <title>Malevolo</title>
  <desc>Contiene script e un attributo evento.</desc>
  <script>window.__pwned = 1;</script>
  <rect x="10" y="10" width="80" height="40" onclick="window.__pwned = 2" fill="#fb7185"/>
  <image href="https://example.invalid/tracker.png" width="10" height="10"/>
</svg>`;

const RIPULIBILE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <title>Ripulibile</title>
  <desc>Riferimento di rete e attributo sconosciuto: vengono rimossi, il disegno resta.</desc>
  <rect x="10" y="10" width="120" height="60" rx="8" fill="url(http://evil.example/x)" data-track="1" stroke="#38bdf8" stroke-width="2"/>
  <text x="10" y="92" font-size="12" fill="#eef2f9">ripulito</text>
</svg>`;

const VALIDO_SEMPLICE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
  <title>Quadrato</title><desc>Un quadrato blu.</desc>
  <rect x="10" y="10" width="40" height="40" fill="#5b9dff"/>
</svg>`;

const NON_DISEGNO = `questo blocco non contiene un disegno`;

const FENCE = "\u0060\u0060\u0060"; // ```
const BLOCCO_JS = FENCE + 'js\nconsole.log("ciao");\n// dentro un blocco js la sequenza ' + FENCE + 'svg non è un disegno\n' + FENCE;

/** Testo "normale" senza disegni: serve alla verifica di non-regressione. */
const TESTO_CON_JS = `una risposta normale\nsu due righe con *markdown* e ${FENCE}js\nconst a = 1;\n${FENCE}\nfine`;
/** Streaming: prima metà (blocco aperto) e chiusura. */
const STREAM_META = `Ecco il disegno in arrivo:\n${FENCE}svg\n<svg viewBox="0 0 60 40"><rect width="60" height="40" fill="#172033"/><circle cx="30" cy="20" r="10" fill="#5b9dff"/></svg>`;
const STREAM_CHIUSURA = `\n${FENCE}`;
const STREAM_TRONCO = `${FENCE}svg\n<svg viewBox="0 0 10 10">`;

const TESTO_INTRO = "Ecco lo schema richiesto, con tre parti: flusso, gradienti e un caso di prova.";
const TESTO_META = "Il disegno non è in scala: le lunghezze indicano solo l'ordine dei passaggi.";

/** Messaggio "salvato": 6 blocchi svg (4 anteprime valide, 2 rifiutati) + 1 blocco js. */
const MESSAGGIO = [
  TESTO_INTRO,
  "```svg\n" + FLUSSO + "\n```",
  TESTO_META,
  "```svg\n" + GRADIENTE + "\n```",
  BLOCCO_JS,
  "```svg\n" + RIPULIBILE + "\n```",
  "```svg\n" + MALEVOLO + "\n```",
  "```svg\n" + NON_DISEGNO + "\n```",
  "```svg\n" + VALIDO_SEMPLICE + "\n```",
  "Fine.",
].join("\n");

/* ---------------- setup ---------------- */
fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root", "skills"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_ASK: "off",
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_USER: "st",
  DASH_PASSWORD: "st",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT, env, stdio: "ignore",
});
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "st", "st"], {
  cwd: ROOT, stdio: "ignore",
});
const cleanup = () => {
  try { ab(["close"], { stdio: "ignore" }); } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PROXY}/api/state`, {
      headers: { Authorization: "Basic " + Buffer.from("st:st").toString("base64") },
    });
    if (r.status === 200) { up = true; break; }
  } catch {}
  await wait(1000);
}
if (!up) {
  console.log("✘ istanza di prova non partita");
  process.exit(1);
}
console.log(`istanza ${PORT} + proxy ${PROXY} attivi\n`);

/* pulizia robusta del profilo del browser (come negli altri test E2E del progetto) */
const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;
try { ab(["close"]); } catch {}
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" }); } catch {}
await wait(1200);
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try { ab(["open", `http://127.0.0.1:${PROXY}/`]); aperto = true; } catch { await wait(2500); }
}
if (!aperto) {
  console.log("✘ non riesco ad avviare il browser di test");
  cleanup();
  process.exit(1);
}
await wait(1500);
try { ab(["set", "viewport", "1280", "900"]); } catch {}
try { ab(["open", `http://127.0.0.1:${PROXY}/`]); } catch {}
await wait(1200);

// raccoglitore di errori JS non gestiti durante tutto il test
evalJs(`(() => { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("unhandled: " + String(e.reason && e.reason.message || e.reason))); return true; })()`);

const RENDER = (testo) =>
  `(() => { const T = ${JSON.stringify(testo)}; renderMessages([{ role: "assistant", ts: Date.now(), text: T, blocks: [{ type: "text", text: T }] }]); return true; })()`;

/* ---------------- 1. anteprima nel messaggio ---------------- */
console.log("== 1. il blocco ```svg diventa anteprima grafica ==");
evalJs(RENDER(MESSAGGIO));
const caricate = await evalUntil(
  `(() => { const imgs = [...document.querySelectorAll(".svgfig img")]; return imgs.length === 4 && imgs.every((i) => i.complete && i.naturalWidth > 0); })()`,
);
check("tutte le anteprime valide sono immagine caricate (naturalWidth > 0)", caricate === true);
check("6 blocchi svg: 4 resi come anteprima, 2 rifiutati con errore",
  evalJs(`document.querySelectorAll(".svgfig").length`) === 6 &&
  evalJs(`document.querySelectorAll(".svgfig.err").length`) === 2,
  `fig=${evalJs(`document.querySelectorAll(".svgfig").length`)} err=${evalJs(`document.querySelectorAll(".svgfig.err").length`)}`);
check("le anteprime usano Blob URL (nessun innerHTML, nessun data:)",
  evalJs(`[...document.querySelectorAll(".svgfig img")].every((i) => i.src.startsWith("blob:"))`) === true);
check("nessun SVG è finito nel DOM come markup",
  evalJs(`document.querySelectorAll("svg.svgfig, .bubble > svg, figure svg").length`) === 0);
check("ogni anteprima ha <title>/<desc> usati come alt accessibile",
  evalJs(`[...document.querySelectorAll(".svgfig img")].every((i) => (i.alt || "").length > 0)`) === true);

const posizionata = evalJs(`(() => {
  const b = document.querySelector(".msg.assistant .bubble");
  const kids = [...b.children];
  const iFig = kids.findIndex((k) => k.classList.contains("svgfig"));
  const iPrima = kids.findIndex((k) => k.classList.contains("mdtext") && k.textContent.includes("Ecco lo schema"));
  return iPrima === 0 && iFig === 1 && kids.length >= 5;
})()`);
check("il disegno sta nel punto esatto del messaggio, in ordine con il testo", posizionata === true);

/* ---------------- 1b. disegni verticali: altezza contenuta ---------------- */
console.log("\n== 1b. disegno verticale (timeline alta) ==");
const VERTICALE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 1400">
  <title>Timeline verticale</title><desc>Quattro tappe su un asse verticale, non in scala.</desc>
  <line x1="80" y1="60" x2="80" y2="1340" stroke="#5b9dff" stroke-width="4"/>
  ${[0, 1, 2, 3].map((i) => `<circle cx="80" cy="${120 + i * 400}" r="14" fill="#5b9dff"/><text x="120" y="${126 + i * 400}" font-size="34" fill="#eef2f9">tappa ${i + 1}</text>`).join("")}
</svg>`;
evalJs(`(() => { const T = ${JSON.stringify("blocco verticale:\n" + FENCE + "svg\n" + VERTICALE + "\n" + FENCE)}; renderMessages([{ role: "assistant", ts: Date.now(), text: T, blocks: [{ type: "text", text: T }] }]); return true; })()`);
const verticaleOk = await evalUntil(`(() => { const i = document.querySelector(".svgfig img"); return !!i && i.complete && i.naturalWidth > 0; })()`);
check("l'anteprima del disegno alto è caricata", verticaleOk === true);
const misure = evalJs(`(() => {
  const i = document.querySelector(".svgfig img");
  const r = i.getBoundingClientRect();
  return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), vh: window.innerHeight, vw: window.innerWidth });
})()`);
check("altezza contenuta (≤ ~60% della finestra) e larghezza pari alla chat",
  misure && misure.h <= misure.vh * 0.62 && misure.w <= misure.vw, JSON.stringify(misure));
evalJs(`document.querySelector('.svgfig button[data-act="zoom"]').click()`);
await wait(500);
const zoomAlto = evalJs(`(() => { const r = document.querySelector("#svgZoom img").getBoundingClientRect(); return JSON.stringify({ h: Math.round(r.height), vh: window.innerHeight }); })()`);
check("ingrandito, il disegno alto usa lo spazio disponibile senza traboccare",
  zoomAlto && zoomAlto.h <= zoomAlto.vh && zoomAlto.h > misure.h, JSON.stringify(zoomAlto));
evalJs(`document.getElementById("svgZoom").click()`);
await wait(200);

/* ---------------- 2. sicurezza ---------------- */
console.log("\n== 2. script, eventi, risorse esterne: bloccati ==");
evalJs(RENDER(MESSAGGIO)); // si torna al messaggio completo per le verifiche di sicurezza
await evalUntil(`document.querySelectorAll(".svgfig img").length === 4 && [...document.querySelectorAll(".svgfig img")].every((i) => i.complete)`);
await wait(500);
check("nessuno script dell'SVG è stato eseguito", evalJs(`window.__pwned === undefined`) === true);
const blob = await evalUntil(`(() => {
  if (window.__blobText !== undefined) return true;
  const img = [...document.querySelectorAll(".svgfig img")][2]; // il disegno «ripulibile»
  if (!img) return false;
  fetch(img.src).then((r) => r.text()).then((t) => { window.__blobText = t; }).catch((e) => { window.__blobText = "ERRORE " + e.message; });
  return false;
})()`);
check("il Blob URL del disegno «ripulito» è leggibile", blob === true);
const blobText = evalJs(`window.__blobText`);
{
  // il namespace SVG contiene "http://www.w3.org/2000/svg": si controlla tutto il resto
  const senzaNamespace = typeof blobText === "string" ? blobText.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "") : "";
  check("nel blob non c'è nessun riferimento di rete (né evil.example né altri URL)",
    senzaNamespace.length > 0 && !/evil\.example|https?:|\/\//i.test(senzaNamespace), senzaNamespace.slice(0, 140));
}
check("nel blob non ci sono attributi sconosciuti (data-track)", typeof blobText === "string" && !blobText.includes("data-track"));
check("nel blob non c'è mai <script>, onload/onclick, foreignObject, javascript:",
  typeof blobText === "string" && !/<script|on\w+\s*=|foreignObject|javascript:/i.test(blobText));
const errText = evalJs(`[...document.querySelectorAll(".svgfig.err .svgerr")].map((e) => e.textContent).join(" || ")`);
check("il rifiuto è spiegato e il codice resta leggibile come testo",
  typeof errText === "string" && errText.includes("anteprima non disponibile") && errText.length > 30, String(errText).slice(0, 160));
check("i blocchi rifiutati mostrano il codice in un <pre> (testo, non markup)",
  evalJs(`[...document.querySelectorAll(".svgfig.err pre")].length === 2 && [...document.querySelectorAll(".svgfig.err pre")].every((p) => !p.hidden && p.children.length === 0 && p.textContent.trim().length > 0)`) === true);
check("nessun errore JavaScript non gestito", evalJs(`window.__errs.length`) === 0, JSON.stringify(evalJs(`window.__errs`)));

/* ---------------- 3. non-regressione del resto del testo ---------------- */
console.log("\n== 3. blocchi di codice non-svg: comportamento invariato ==");
const jsBlocco = evalJs(`(() => {
  const b = document.querySelector(".msg.assistant .bubble");
  const testo = [...b.querySelectorAll(".mdtext")].map((x) => x.textContent).join("");
  return JSON.stringify(testo.includes(${JSON.stringify(BLOCCO_JS)}));
})()`);
check("il blocco ```js resta testo IDENTICO all'originale (fence comprese)", jsBlocco === true);
check("il ```svg citato dentro il blocco js non è diventato un disegno",
  evalJs(`document.querySelectorAll(".svgfig").length`) === 6);
const soloTesto = evalJs(`(() => {
  const T = ${JSON.stringify(TESTO_CON_JS)};
  renderMessages([{ role: "assistant", ts: Date.now(), text: T, blocks: [{ type: "text", text: T }] }]);
  const b = document.querySelector(".msg.assistant .bubble");
  return JSON.stringify(bubbleText(b) === T);
})()`);
check("senza blocchi svg il testo è identico a prima, carattere per carattere", soloTesto === true);
check("nessuna anteprima creata quando non c'è un blocco svg",
  evalJs(`document.querySelectorAll(".svgfig").length`) === 0);

/* ---------------- 4. streaming ---------------- */
console.log("\n== 4. streaming: si attende il blocco completo ==");
evalJs(`(() => { renderMessages([]); newAssistantBubble(); appendText(${JSON.stringify(STREAM_META)}); return true; })()`);
await wait(400);
check("blocco incompleto: nessuna anteprima, il codice è ancora testo",
  evalJs(`document.querySelectorAll(".svgfig").length`) === 0 &&
  evalJs(`document.querySelector('.msg.assistant .bubble').textContent.includes(${JSON.stringify(FENCE + "svg")})`) === true);
evalJs(`appendText(${JSON.stringify(STREAM_CHIUSURA)})`);
const streamOk = await evalUntil(`(() => { const i = document.querySelector(".svgfig img"); return !!i && i.complete && i.naturalWidth > 0; })()`);
check("alla chiusura della fence compare l'anteprima (senza interrompere lo stream)", streamOk === true);
check("il testo prima del disegno è rimasto nel messaggio",
  evalJs(`document.querySelector('.msg.assistant .bubble').textContent.includes("Ecco il disegno in arrivo")`) === true);
evalJs(`finalizeSvgStreaming()`);
evalJs(`(() => { renderMessages([]); newAssistantBubble(); appendText(${JSON.stringify(STREAM_TRONCO)}); finalizeSvgStreaming(); return true; })()`);
await wait(600);
check("streaming interrotto a metà blocco: codice + indicazione dell'errore",
  evalJs(`document.querySelectorAll(".svgfig.err").length`) === 1 &&
  evalJs(`document.querySelector(".svgfig.err .svgerr").textContent.includes("non chiuso")`) === true);

/* Il caso che ha prodotto il difetto segnalato («l'SVG non appare, vedo solo il codice scritto»):
 * i delta del modello sono lunghi POCHI caratteri, quindi la fence di apertura arriva a pezzi
 * («``» e poi «`svg»). Il cursore di scansione che saltava oltre i backtick già letti rendeva il
 * blocco irriconoscibile: l'anteprima compariva solo ricaricando la pagina.
 * I due controlli qui sotto usano delta da UN carattere, come lo streaming vero. */
const STREAM_A_CARATTERI = `Ecco il disegno in arrivo:\n${FENCE}svg\n${VALIDO_SEMPLICE}\n${FENCE}\nfine`;
evalJs(`(() => { renderMessages([]); newAssistantBubble(); const t = ${JSON.stringify(STREAM_A_CARATTERI)}; for (const ch of t) appendText(ch); return true; })()`);
const aCaratteriOk = await evalUntil(`(() => { const i = document.querySelector(".svgfig img"); return !!i && i.complete && i.naturalWidth > 0; })()`);
check("delta da un carattere (fence spezzata): l'anteprima compare senza ricaricare la pagina",
  aCaratteriOk === true);
check("con l'anteprima disegnata il codice SVG non resta a schermo",
  evalJs(`document.querySelector('.msg.assistant .bubble').textContent.includes(${JSON.stringify(FENCE + "svg")})`) === false);
evalJs(`finalizeSvgStreaming()`);

/* ---------------- 5. ridisegno e ricaricamento ---------------- */
console.log("\n== 5. ridisegno della conversazione e Blob URL ==");
evalJs(RENDER(MESSAGGIO));
await evalUntil(`document.querySelectorAll(".svgfig img").length === 4 && [...document.querySelectorAll(".svgfig img")].every((i) => i.complete)`);
const urlPrima = evalJs(`[...document.querySelectorAll(".svgfig img")].map((i) => i.src)`);
check("primo disegno: 4 anteprime con Blob URL distinti",
  Array.isArray(urlPrima) && urlPrima.length === 4 && new Set(urlPrima).size === 4);
evalJs(RENDER(MESSAGGIO)); // secondo giro: come ricaricare la conversazione
await evalUntil(`document.querySelectorAll(".svgfig img").length === 4 && [...document.querySelectorAll(".svgfig img")].every((i) => i.complete)`);
check("dopo il ridisegno le anteprime ci sono ancora tutte",
  evalJs(`document.querySelectorAll(".svgfig").length`) === 6 && evalJs(`document.querySelectorAll(".svgfig.err").length`) === 2);
check("i Blob URL del giro precedente sono stati revocati (nessuna fuga)",
  evalJs(`svgBlobUrls.size`) === 4, `registrati: ${evalJs(`svgBlobUrls.size`)}`);
const revocato = await evalUntil(`(() => {
  if (window.__revoked !== undefined) return true;
  fetch(${JSON.stringify(urlPrima[0])}).then(() => { window.__revoked = "ancora valido"; }).catch(() => { window.__revoked = "revocato"; });
  return false;
})()`);
check("un vecchio Blob URL non è più raggiungibile", revocato === true && evalJs(`window.__revoked`) === "revocato", String(evalJs(`window.__revoked`)));

/* ---------------- 6. vista ingrandita, codice, copia, download ---------------- */
console.log("\n== 6. vista ingrandita, mostra codice, copia, download ==");
check("la vista ingrandita è chiusa all'avvio", evalJs(`document.getElementById("svgZoom").hidden`) === true);
evalJs(`document.querySelector('.svgfig button[data-act="zoom"]').click()`);
await wait(400);
check("«ingrandisci» apre la vista a schermo intero con lo stesso contenuto sanitizzato",
  evalJs(`document.getElementById("svgZoom").hidden`) === false &&
  evalJs(`document.querySelector("#svgZoom img").src.startsWith("blob:")`) === true);
check("l'immagine ingrandita è caricata", evalJs(`document.querySelector("#svgZoom img").naturalWidth > 0`) === true);
evalJs(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`);
await wait(300);
check("Esc chiude la vista ingrandita", evalJs(`document.getElementById("svgZoom").hidden`) === true);

evalJs(`document.querySelector('.svgfig button[data-act="code"]').click()`);
await wait(250);
const codice = evalJs(`(() => {
  const pre = document.querySelector(".svgfig pre.mdsvgsrc");
  return JSON.stringify({ visibile: !pre.hidden, testo: pre.children.length === 0, inizio: pre.textContent.slice(0, 40) });
})()`);
check("«mostra codice» mostra il codice come testo (nessun elemento figlio)",
  codice && codice.visibile === true && codice.testo === true && String(codice.inizio).startsWith("<svg"), JSON.stringify(codice));
check("il codice mostrato è quello sanitizzato (niente attributi rimossi)",
  evalJs(`document.querySelector(".svgfig pre.mdsvgsrc").textContent.includes("data-track")`) === false);

evalJs(`(() => { const st = document.querySelector(".svgfig")._svg; window.__dl = downloadSvg(st); window.__slug = slugFromTitle(st.title); return true; })()`);
check("«scarica SVG» usa il file .svg derivato dal titolo",
  evalJs(`window.__dl`) === true && /^[a-z0-9-]+\.svg$/.test(String(evalJs(`window.__slug`))), String(evalJs(`window.__slug`)));
evalJs(`document.querySelector('.svgfig button[data-act="copy"]').click()`);
await wait(600);
const copiaLabel = evalJs(`document.querySelector('.svgfig button[data-act="copy"]').textContent`);
check("«copia SVG» dà un esito esplicito (copiato / non copiato)", /copiat/i.test(String(copiaLabel)), String(copiaLabel));
check("nessun errore JavaScript dopo i pulsanti", evalJs(`window.__errs.length`) === 0, JSON.stringify(evalJs(`window.__errs`)));

/* ---------------- 7. schermo piccolo ---------------- */
console.log("\n== 7. schermo piccolo ==");
try { ab(["set", "viewport", "390", "844"]); } catch {}
try { ab(["open", `http://127.0.0.1:${PROXY}/`]); } catch {}
await wait(1500);
evalJs(`(() => { window.__errs = []; return true; })()`);
evalJs(RENDER(MESSAGGIO));
await evalUntil(`document.querySelectorAll(".svgfig img").length === 4 && [...document.querySelectorAll(".svgfig img")].every((i) => i.complete)`);
const stretto = evalJs(`(() => {
  const large = [...document.querySelectorAll(".svgfig img")].map((i) => Math.round(i.getBoundingClientRect().width));
  const bubble = document.querySelector(".msg.assistant .bubble").getBoundingClientRect().width;
  return JSON.stringify({ scroll: document.documentElement.scrollWidth, view: window.innerWidth, bubble: Math.round(bubble), maximg: Math.max(...large) });
})()`);
check("nessun trabocco orizzontale a 390 px",
  stretto && stretto.scroll <= stretto.view + 1 && stretto.maximg <= Math.ceil(stretto.bubble) + 1, JSON.stringify(stretto));
check("l'anteprima mantiene le proporzioni (altezza non zero, rapporto plausibile)",
  evalJs(`(() => { const i = document.querySelector(".svgfig img"); const r = i.getBoundingClientRect(); return r.height > 20 && r.height < window.innerHeight; })()`) === true);
evalJs(`document.querySelector('.svgfig button[data-act="zoom"]').click()`);
await wait(400);
check("a schermo piccolo la vista ingrandita non supera la finestra",
  evalJs(`(() => { const r = document.querySelector("#svgZoom img").getBoundingClientRect(); return r.width <= window.innerWidth && r.height <= window.innerHeight; })()`) === true);
evalJs(`document.getElementById("svgZoom").click()`);
await wait(300);
check("il clic sullo sfondo chiude la vista ingrandita", evalJs(`document.getElementById("svgZoom").hidden`) === true);
check("nessun errore JavaScript a schermo piccolo", evalJs(`window.__errs.length`) === 0, JSON.stringify(evalJs(`window.__errs`)));

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
cleanup();
process.exit(fail ? 1 : 0);
