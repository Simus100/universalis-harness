/**
 * Il disegno dell'atlante CRESCE quando la memoria cresce? Misura, non impressione.
 *
 * Prende il grafo vero, ne fa un atlante, poi lo aggiorna con il grafo com'era N episodi fa
 * (rimuovendo gli episodi più recenti e i loro archi) e guarda cosa cambia: numero di nodi,
 * etichette disegnate, inquadratura (k), estensione del mondo e SPOSTAMENTO delle posizioni
 * dei nodi che esistevano in entrambe le versioni. Se fosse "sempre uguale", k e le posizioni
 * non si muoverebbero.
 */
import { readFile } from "node:fs/promises";

const grafo = JSON.parse(await readFile(new URL("./memoria/grafo.json", import.meta.url), "utf8"));

function canvasFinto(w = 1440, h = 620) {
  const testi = [];
  const gradiente = { addColorStop() {} };
  const ctx = {
    font: "", lineWidth: 1, lineJoin: "", strokeStyle: "", fillStyle: "", globalAlpha: 1, textAlign: "left",
    createRadialGradient: () => gradiente,
    measureText: (t) => ({ width: String(t).length * 6.2 }),
    fillText: (t, x, y) => testi.push({ t: String(t), x, y }),
    strokeText() {}, fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, arc() {}, rect() {}, roundRect() {}, fill() {}, stroke() {},
    setLineDash() {}, setTransform() {},
  };
  const canvas = {
    clientWidth: w, clientHeight: h, width: w, height: h, style: {},
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    toDataURL: () => "",
  };
  canvas.testi = testi;
  return canvas;
}

globalThis.devicePixelRatio = 1;
globalThis.document = { hidden: false };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const { createAtlante } = await import("./memoria/atlante.mjs");

/** Estensione del disegno: quanto mondo occupano i nodi (in coordinate mappa). */
function estensione(at) {
  const xs = at.nodi.map((n) => n.posM[0]);
  const ys = at.nodi.map((n) => n.posM[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return { w: Math.round(w), h: Math.round(h), aspetto: +(w / Math.max(1, h)).toFixed(2) };
}

const canvas = canvasFinto(1440, 620);
const at = createAtlante({ canvas, dati: grafo });
at.ridisegna();
const base = {
  nodi: at.nodi.length,
  visibili: at.contaVisibili(),
  etichette: at.vista.etichetteDisegnate,
  k: +at.vista.k.toFixed(4),
  ...estensione(at),
  posizioni: new Map(at.nodi.map((n) => [n.id, n.posM.slice()])),
};

// Il grafo com'era 20 episodi fa: si tolgono gli episodi con data più recente e ogni arco che
// li tocca. È una riduzione onesta: gli altri nodi (artefatti, decisioni) restano dove sono.
const date = [...new Set(grafo.nodi.filter((n) => n.s === "episodio" && n.d).map((n) => n.d))].sort();
const taglio = date[date.length - 20];
const tolti = new Set(grafo.nodi.map((n, i) => (n.s === "episodio" && n.d && n.d >= taglio ? i : -1)).filter((i) => i >= 0));
const vecchio = {
  ...grafo,
  nodi: grafo.nodi.filter((_, i) => !tolti.has(i)),
  archi: grafo.archi.filter((a) => !tolti.has(a.a) && !tolti.has(a.b)),
};

at.aggiorna(vecchio);
at.ridisegna();
const indietro = {
  nodi: at.nodi.length,
  visibili: at.contaVisibili(),
  etichette: at.vista.etichetteDisegnate,
  k: +at.vista.k.toFixed(4),
  ...estensione(at),
};

// Quanto si sono spostati i nodi che ci sono in entrambe le versioni?
let mossi = 0, somma = 0, massimo = 0;
for (const n of at.nodi) {
  const prima = base.posizioni.get(n.id);
  if (!prima) continue;
  const d = Math.hypot(n.posM[0] - prima[0], n.posM[1] - prima[1]);
  if (d > 0.5) mossi++;
  somma += d;
  massimo = Math.max(massimo, d);
}

console.log("grafo:", grafo.nodi.length, "nodi ·", grafo.archi.length, "archi · episodi fino al", date[date.length - 1]);
console.log("taglio:", taglio, "→ tolti", tolti.size, "nodi episodio, restano", vecchio.nodi.length, "nodi /", vecchio.archi.length, "archi");
console.log("\nORA   ", JSON.stringify(base), "etichette:", base.etichette);
console.log("20 ep fa", JSON.stringify(indietro), "etichette:", indietro.etichette);
const comuni = at.nodi.filter((n) => base.posizioni.has(n.id)).length;
console.log(`\nnodi comuni: ${comuni} · spostati: ${mossi} (${Math.round((mossi / Math.max(1, comuni)) * 100)}%) · spostamento medio ${(somma / Math.max(1, comuni)).toFixed(1)} px · massimo ${massimo.toFixed(1)} px`);
console.log(`inquadratura: k ${base.k} → ${indietro.k} (${(((base.k - indietro.k) / indietro.k) * 100).toFixed(1)}%)`);
console.log(`mondo: ${base.w}×${base.h} (aspetto ${base.aspetto}) → ${indietro.w}×${indietro.h} (aspetto ${indietro.aspetto})`);
