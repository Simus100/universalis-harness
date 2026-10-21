#!/usr/bin/env node
/**
 * make-assets.mjs — overlay di testo e keyframe del reel «Il filtro» per Aion.
 *
 * Produce, in media/aion-reel-filtro/:
 *   overlay/beat1..4.png   testi 1080x1920 in trasparenza (quelli che si vedono sopra il footage)
 *   overlay/scrim.png      velo scuro morbido che rende leggibile il testo su qualunque footage
 *   keyframe/key1..3.png   frame 0 (senza testo) da dare a Veo come immagine di partenza
 *
 * Uso: node media/aion-reel-filtro/make-assets.mjs
 * Il marchio viene da scripts/aion-mark.mjs: cambiare il marchio = cambiare quel file, non questo.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { markGroup, MARK_DEFS } from '../../scripts/aion-mark.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const W = 1080, H = 1920;

// Palette della testata (media/aion-knowledge/20-stile-visivo.md)
const C = {
  testo: '#f6f9ff',
  secondario: '#96a9c4',
  blu: '#5b9dff',
  viola: '#8b5cff',
  verde: '#34d399',
  fondo0: '#05070c',
  fondo1: '#0b1120',
};

const FONT = 'DejaVu Sans';

/** Larghezza reale del testo, misurata con ImageMagick (non stimata a caratteri). */
function misura(testo, pt, grassetto) {
  try {
    return Number(execFileSync('convert', [
      '-font', grassetto ? 'DejaVu-Sans-Bold' : 'DejaVu-Sans',
      '-pointsize', String(pt), `label:${testo}`, '-format', '%w', 'info:',
    ], { encoding: 'utf8' }));
  } catch {
    return testo.length * pt * (grassetto ? 0.66 : 0.6);
  }
}

/** Riduce il corpo finché la riga più larga sta in `maxW`. */
function adatta(righe, ptMax, maxW, grassetto = true) {
  let pt = ptMax;
  while (pt > 28 && Math.max(...righe.map((r) => misura(r, pt, grassetto))) > maxW) pt -= 2;
  return pt;
}

const righeSvg = (righe, x, yTop, pt, colore, grassetto = true, lineHeight = 1.1) =>
  righe.map((r, i) =>
    `<text x="${x}" y="${yTop + (i + 1) * pt * lineHeight}" font-family="${FONT}" ` +
    `font-size="${pt}" font-weight="${grassetto ? 'bold' : 'normal'}" fill="${colore}" ` +
    `letter-spacing="${grassetto ? -1 : 0}">${esc(r)}</text>`).join('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const misuraSvg = (righe, pt, lineHeight = 1.1) => righe.length * pt * lineHeight;

function svgCorpo(contenuto) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${MARK_DEFS}
  <radialGradient id="signal" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#5ff0bd"/><stop offset="1" stop-color="#34d399"/>
  </radialGradient>
</defs>
${contenuto}
</svg>`;
}

function scrivi(nome, svg) {
  const svgPath = join(QUI, nome.replace(/\.png$/, '.svg'));
  const pngPath = join(QUI, nome);
  writeFileSync(svgPath, svg);
  execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', pngPath, svgPath]);
  return pngPath;
}

// ─── Beat 1-3: kicker + titolo, allineati a sinistra, dentro la safe zone ────────────────
const MARGINE = 96;
const LARG_UTILE = W - MARGINE * 2;      // 888
const CENTRO_Y = 900;                     // centro ottico del blocco (sopra la UI del reel)

function overlayTesto({ kicker, righe, accento }) {
  const kickerPt = 33, kickerLH = 46, accH = 6, gapA = 38, gapK = 36;
  const pt = adatta(righe, 104, LARG_UTILE, true);
  const totH = (kicker ? accH + gapA + kickerLH + gapK : 0) + misuraSvg(righe, pt);
  let y = CENTRO_Y - totH / 2;

  let out = '';
  if (kicker) {
    out += `<rect x="${MARGINE}" y="${y}" width="66" height="${accH}" fill="${accento}" rx="3"/>\n`;
    y += accH + gapA;
    out += `<text x="${MARGINE}" y="${y + kickerPt}" font-family="${FONT}" font-size="${kickerPt}" ` +
      `font-weight="bold" fill="${C.secondario}" letter-spacing="9">${esc(kicker)}</text>\n`;
    y += kickerLH + gapK;
  }
  out += righeSvg(righe, MARGINE, y, pt, C.testo, true);
  return svgCorpo(out);
}

// ─── Beat 4: coda con marchio, promessa e firma ─────────────────────────────────────────
function overlayCoda() {
  const righe = ['L’AI spiegata', 'in tre righe.'];
  const pt = adatta(righe, 112, LARG_UTILE, true);
  const blocco = misuraSvg(righe, pt);
  const marchioY = 610, marchioH = 268;
  const yTitolo = marchioY + marchioH / 2 + 110;

  const out = `
${markGroup(W / 2, marchioY, marchioH, 'coda')}
${onlineDot(640, 490, 17)}
${righeSvg(righe, MARGINE, yTitolo, pt, C.testo, true)}
<rect x="${MARGINE}" y="${yTitolo + blocco + 56}" width="88" height="5" fill="${C.blu}" rx="2.5"/>
<text x="${MARGINE}" y="${yTitolo + blocco + 132}" font-family="${FONT}" font-size="38"
      fill="${C.secondario}" letter-spacing="0.5">Aion · AI News — ogni giorno, con la fonte</text>`;
  return svgCorpo(out);
}

const onlineDot = (cx, cy, r) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#signal)"/>
   <circle cx="${cx}" cy="${cy}" r="${r * 1.9}" fill="none" stroke="${C.verde}" stroke-opacity="0.22" stroke-width="4"/>`;

// ─── Scrim: velo scuro morbido per la leggibilità ────────────────────────────────────────
function scrim() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0.00" stop-color="#05070c" stop-opacity="0"/>
    <stop offset="0.22" stop-color="#05070c" stop-opacity="0.62"/>
    <stop offset="0.55" stop-color="#05070c" stop-opacity="0.52"/>
    <stop offset="0.78" stop-color="#05070c" stop-opacity="0.30"/>
    <stop offset="1.00" stop-color="#05070c" stop-opacity="0"/>
  </linearGradient>
</defs>
<rect x="0" y="330" width="${W}" height="1000" fill="url(#v)"/>
</svg>`;
}

// ─── Keyframe per Veo: fondo della tavolozza, nessun testo ──────────────────────────────

/** generatore deterministico: i keyframe devono essere riproducibili, non casuali */
function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function fondo(polvere = 0, seed = 7) {
  const rnd = prng(seed);
  let puntini = '';
  for (let i = 0; i < polvere; i++) {
    const x = rnd() * W, y = rnd() * H;
    const r = 1.2 + rnd() * 5.2;
    // densità in alto e ai bordi, centro-basso più libero: ci va il testo
    const centro = Math.abs(x - W / 2) / (W / 2);
    const basso = y > H * 0.55;
    if (basso && centro < 0.45 && rnd() < 0.75) continue;
    const op = 0.10 + rnd() * 0.55;
    const col = rnd() < 0.5 ? C.blu : C.viola;
    puntini += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="${op.toFixed(2)}"/>\n`;
  }
  return `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="${C.fondo1}"/><stop offset="1" stop-color="${C.fondo0}"/>
  </linearGradient>
  <filter id="soft"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g filter="url(#soft)">${puntini}</g>`;
}

function keyframe1() {
  return svgCorpo(fondo(420, 11));
}

function keyframe2() {
  // il taglio a 45°: sopra blu, sotto viola, con la fessura scura in mezzo
  const righe = [
    `<polygon points="0,0 ${W},0 ${W},${H * 0.42} 0,${H * 0.86} " fill="${C.blu}" fill-opacity="0.13"/>`,
    `<polygon points="0,${H * 0.86} ${W},${H * 0.42} ${W},${H} 0,${H}" fill="${C.viola}" fill-opacity="0.15"/>`,
    `<polygon points="0,${H * 0.865} ${W},${H * 0.425} ${W},${H * 0.435} 0,${H * 0.875} " fill="${C.fondo0}" fill-opacity="0.9"/>`,
    `<polygon points="0,${H * 0.862} ${W},${H * 0.422} ${W},${H * 0.426} 0,${H * 0.866} " fill="#eaf3ff" fill-opacity="0.55"/>`,
  ];
  return svgCorpo(fondo(300, 23) + righe.join('\n'));
}

function keyframe3() {
  const righe = [0, 1, 2].map((i) => {
    const y = 1150 + i * 92;
    return `<rect x="200" y="${y}" width="680" height="6" rx="3" fill="${C.blu}" filter="url(#soft2)" opacity="0.95"/>
<rect x="200" y="${y}" width="680" height="2" rx="1" fill="#eaf3ff" opacity="0.85"/>`;
  }).join('\n');
  const defs = `<defs><filter id="soft2"><feGaussianBlur stdDeviation="12"/></filter></defs>`;
  return svgCorpo(fondo(240, 41) + defs + righe +
    `<circle cx="900" cy="1147" r="9" fill="${C.verde}" opacity="0.95"/>`);
}

// ─── Esecuzione ─────────────────────────────────────────────────────────────────────────
mkdirSync(join(QUI, 'overlay'), { recursive: true });
mkdirSync(join(QUI, 'keyframe'), { recursive: true });

const beat = [
  { nome: 'overlay/beat1.png', kicker: 'AION · AI NEWS', righe: ['Ogni giorno: annunci,', 'demo, benchmark.'], accento: C.blu },
  { nome: 'overlay/beat2.png', kicker: '', righe: ['Quasi niente', 'ti cambia la giornata.'], accento: C.blu },
  { nome: 'overlay/beat3.png', kicker: '', righe: ['Ne restano poche.', 'Le scegliamo noi.'], accento: C.viola },
];

for (const b of beat) console.log('scritto', scrivi(b.nome, overlayTesto(b)));
console.log('scritto', scrivi('overlay/beat4.png', overlayCoda()));
console.log('scritto', scrivi('overlay/scrim.png', scrim()));
console.log('scritto', scrivi('keyframe/key1.png', keyframe1()));
console.log('scritto', scrivi('keyframe/key2.png', keyframe2()));
console.log('scritto', scrivi('keyframe/key3.png', keyframe3()));
