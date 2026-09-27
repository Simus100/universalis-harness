/**
 * Test di regressione: un blocco ```svg deve diventare anteprima DURANTE lo streaming,
 * anche quando i delta del modello spezzano la fence di apertura (caso normale: i delta
 * sono lunghi pochi caratteri) e senza dover ricaricare la pagina.
 *
 * Il test non replica la logica: ESTRAE dal codice reale di dashboard.html le funzioni
 * newTextSpan/makeTextTail/findOpenFence/findCloseFence/flushSvgBlocks/appendBubbleText/
 * finalizeSvgStreaming e le esegue su un DOM finto minimale.
 */
import fs from "node:fs";

const HTML = "/root/pi-harness/dashboard.html";
const html = fs.readFileSync(HTML, "utf8");

const start = html.indexOf("/** Linguaggio del blocco Markdown che contiene un disegno. */");
const end = html.indexOf("/* ---- Blob URL");
if (start < 0 || end < 0 || end <= start) {
  console.error("✘ non trovo il frammento del rendering SVG in dashboard.html (marker spostati?)");
  process.exit(1);
}
const src = html.slice(start, end);

/* ---------- DOM finto minimale ---------- */
function mkEl(tag = "div") {
  const el = {
    tagName: tag,
    className: "",
    children: [],
    hidden: false,
    dataset: {},
    _text: "",
    get textContent() { return this._text; },
    set textContent(v) { this._text = String(v); this.children = []; },
    appendChild(c) { this.children.push(c); return c; },
    get isConnected() { return true; },
    querySelectorAll(sel) {
      const cls = sel.replace(/^\./, "");
      return this.children.filter((c) => String(c.className).split(/\s+/).includes(cls));
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
  };
  return el;
}
const document = { createElement: (tag) => mkEl(tag) };
function stubCard() { const f = mkEl("figure"); f.className = "svgfig"; return f; }
let cur = { wrap: null };

const factory = new Function(
  "document", "makeSvgCard", "cur",
  src + "\nreturn { makeTextTail, appendBubbleText, finalizeSvgStreaming, flushSvgBlocks, SVG_FENCE_LANG };",
);
const api = factory(document, stubCard, cur);

/** Testo visibile di un elemento finto (i figli SOSTITUISCONO il proprio textContent). */
function testo(el) {
  if (!el.children.length) return el._text;
  return el.children.map((c) => (c.className === "svgfig" ? "«anteprima»" : testo(c))).join("");
}
const cards = (bubble) => bubble.querySelectorAll(".svgfig").length;

function scenario(nome, testo_da_inviare, chunk, finalize = true) {
  const bubble = mkEl("div");
  bubble.className = "bubble";
  cur.wrap = { querySelectorAll: (sel) => (sel === ".bubble" ? [bubble] : []) };
  api.makeTextTail(bubble, "");
  for (let i = 0; i < testo_da_inviare.length; i += chunk) {
    api.appendBubbleText(bubble, testo_da_inviare.slice(i, i + chunk));
  }
  if (finalize) api.finalizeSvgStreaming();
  return { nome, card: cards(bubble), visibile: testo(bubble) };
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>t</title><circle cx="5" cy="5" r="4"/></svg>';

const prove = [
  { nome: "delta da 1 carattere (streaming reale)", testo: "Ecco:\n\n```svg\n" + SVG + "\n```\nfine.\n", chunk: 1, card: 1, contiene: "fine." },
  { nome: "delta da 4 caratteri", testo: "Ecco:\n\n```svg\n" + SVG + "\n```\nfine.\n", chunk: 4, card: 1, contiene: "fine." },
  { nome: "delta interi (un solo delta)", testo: "Ecco:\n\n```svg\n" + SVG + "\n```\nfine.\n", chunk: 10000, card: 1, contiene: "fine." },
  { nome: "due disegni di fila, delta da 1", testo: "```svg\n" + SVG + "\n```\ntra\n```svg\n" + SVG + "\n```\n", chunk: 1, card: 2, contiene: "tra" },
  { nome: "chiusura con 4 backtick, delta da 1", testo: "```svg\n" + SVG + "\n````\nfine\n", chunk: 1, card: 1, contiene: "fine" },
  { nome: "blocco ```js chiuso + ```svg, delta da 1", testo: "```js\nlet a = 1;\n```\n```svg\n" + SVG + "\n```\n", chunk: 1, card: 1, contiene: "let a = 1;" },
  { nome: "blocco svg MAI chiuso (fine turno)", testo: "```svg\n" + SVG + "\n", chunk: 1, card: 1, contiene: "" },
  // --- difetti corretti il 2026-09-27 ---
  {
    nome: "fence indentata di 3 spazi (Markdown valido: disegno dentro un elenco)",
    testo: "Ecco:\n\n   ```svg\n" + SVG + "\n   ```\ndopo.\n",
    chunk: 1, card: 1, contiene: "dopo.",
  },
  {
    nome: "fence indentata di 3 spazi, delta interi",
    testo: "   ```svg\n" + SVG + "\n   ```\ndopo\n",
    chunk: 10000, card: 1, contiene: "dopo",
  },
  {
    nome: "blocco indentato di 4 spazi NON è una fence (Markdown: è codice indentato)",
    testo: "    ```svg\n" + SVG + "\n    ```\n",
    chunk: 1, card: 0, contiene: "circle",
  },
  {
    nome: "chiusura con fine riga CRLF: il testo seguente NON finisce dentro il blocco",
    testo: "```svg\r\n" + SVG + "\r\n```\r\n\r\ndopo il disegno.\r\n",
    chunk: 1, card: 1, contiene: "dopo il disegno.",
  },
  {
    nome: "apertura e chiusura con CRLF, delta interi",
    testo: "prima\r\n\r\n```svg\r\n" + SVG + "\r\n```\r\n\r\ndopo\r\n",
    chunk: 10000, card: 1, contiene: "dopo",
  },
  {
    nome: "CRLF + un secondo disegno dopo: il secondo non viene inghiottito",
    testo: "```svg\r\n" + SVG + "\r\n```\r\n\ntra\r\n\r\n```svg\r\n" + SVG + "\r\n```\r\nfine\r\n",
    chunk: 3, card: 2, contiene: "fine",
  },
];

console.log("fence cercata:", JSON.stringify(api.SVG_FENCE_LANG), "\n");
let fail = 0;
for (const p of prove) {
  const r = scenario(p.nome, p.testo, p.chunk);
  const ok = r.card === p.card && (p.contiene === "" || r.visibile.includes(p.contiene));
  if (!ok) fail++;
  console.log(`${ok ? "✔" : "✘"} ${r.nome}: anteprime=${r.card} (attese ${p.card})`);
  if (!ok) console.log(`     visibile: ${JSON.stringify(r.visibile.slice(0, 120))}`);
}
console.log(fail ? `\n${fail} scenario/i ancora difettosi` : "\ntutti gli scenari resi come anteprima durante lo streaming");
process.exit(fail ? 1 : 0);
