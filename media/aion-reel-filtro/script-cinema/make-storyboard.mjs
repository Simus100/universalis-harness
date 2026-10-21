#!/usr/bin/env node
/**
 * make-storyboard.mjs — tavola di regia del reel «Il filtro» (Aion).
 *
 * Sei pannelli 9:16, disegnati (non generati): servono a vedere la progressione organico →
 * geometrico, i timecode e i testi, prima di spendere le generazioni. Non è un mockup del
 * footage: è l'intenzione.
 *
 * Uso: node media/aion-reel-filtro/script-cinema/make-storyboard.mjs → storyboard.png
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { markGroup, MARK_DEFS } from '../../../scripts/aion-mark.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const PW = 300, PH = 533;          // pannello 9:16
const GAP = 22, PAD = 34;
const COLS = 8;   // un pannello per movimento: S1 S2 S3 S4 S5 F1 F2 S6
const W = PAD * 2 + COLS * PW + (COLS - 1) * GAP;
const H = 168 + PH + 210;

const C = {
  testo: '#f6f9ff', secondario: '#96a9c4', blu: '#5b9dff', viola: '#8b5cff',
  verde: '#34d399', fondo: '#05070c',
};

// ── i sei movimenti ─────────────────────────────────────────────────────────────────────
const SHOT = [
  { id: 'S1', tc: '0,00 – 3,00', nome: 'INK', nota: 'macro · 100mm f/2.8 · push-in\nsilenzio tipografico', testo: '' },
  { id: 'S2', tc: '3,00 – 6,40', nome: 'ORIENT', nota: 'la corrente allinea · tilt 2°\nentra il primo testo', testo: 'Ogni giorno: annunci, demo, benchmark.' },
  { id: 'S3', tc: '6,40 – 10,00', nome: 'THE CUT', nota: 'la lama a 45° · camera FISSA\nil fotogramma chiave', testo: 'Quasi niente ti cambia la giornata.' },
  { id: 'S4', tc: '10,00 – 13,60', nome: 'THREE LINES', nota: 'l’inchiostro cade · tre rette\nnel terzo inferiore', testo: 'Ne restano poche. Le scegliamo noi.' },
  { id: 'S5', tc: '13,60 – 16,40', nome: 'ALIVE', nota: 'si spengono in ordine\nresta il punto verde', testo: '' },
  { id: 'F1', tc: '16,40 – 20,00', nome: 'HORIZON', nota: 'ATTO II · il punto diventa orizzonte\ndolly laterale lentissimo', testo: 'Il futuro non arriva tutto insieme.' },
  { id: 'F2', tc: '20,00 – 23,80', nome: 'PASSAGE', nota: 'qualcosa di enorme passa sopra\nnon si vede mai per intero', testo: 'Ogni salto è cominciato come una notizia.' },
  { id: 'S6', tc: '23,80 – 28,00', nome: 'FIRMA', nota: 'coda tipografica, in post\ninvito alla Pagina', testo: 'L’AI spiegata in tre righe.' },
];

const clip = (id) => `<clipPath id="clip-${id}"><rect x="0" y="0" width="${PW}" height="${PH}" rx="10"/></clipPath>`;
const defs = `
  ${MARK_DEFS}
  <radialGradient id="signal" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#5ff0bd"/><stop offset="1" stop-color="#34d399"/>
  </radialGradient>
  <linearGradient id="bgPanel" x1="0" y1="0" x2="0.4" y2="1">
    <stop offset="0" stop-color="#0d1526"/><stop offset="1" stop-color="#05070c"/>
  </linearGradient>
  <linearGradient id="lama" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.15"/>
    <stop offset="0.5" stop-color="#ffffff" stop-opacity="0.95"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0.2"/>
  </linearGradient>
  <filter id="blur18"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="glow"><feGaussianBlur stdDeviation="4"/></filter>
  ${SHOT.map((s) => clip(s.id)).join('\n  ')}`;

/** nuvola d'inchiostro: cerchi sfocati, deterministici */
function inchiostro(n, x0, y0, spread, raggio, opacita) {
  let s = 0, out = '';
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const x = x0 + (rnd() - 0.5) * spread;
    const y = y0 + (rnd() - 0.5) * spread * 0.8;
    const r = raggio * (0.5 + rnd());
    out += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(0)}" ` +
      `fill="${rnd() < 0.5 ? C.blu : C.viola}" fill-opacity="${(opacita * (0.35 + rnd() * 0.65)).toFixed(2)}"/>\n`;
  }
  return out;
}

const bokeh = (n, seed = 5) => {
  let s = seed, out = '';
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const x = rnd() * PW, y = rnd() * PH * 0.9, r = 2 + rnd() * 9;
    out += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${r.toFixed(0)}" ry="${(r * 1.4).toFixed(0)}" ` +
      `fill="${rnd() < 0.5 ? C.blu : '#cfe0ff'}" fill-opacity="${(0.05 + rnd() * 0.2).toFixed(2)}" filter="url(#blur3)"/>\n`;
  }
  return out;
};

const testoMini = (t, y, pt = 17, col = C.testo) => `<text x="22" y="${y}" font-family="DejaVu Sans"
  font-size="${pt}" font-weight="bold" fill="${col}">${t}</text>`;

function pannello(s) {
  let corpo = '';
  if (s.id === 'S1') {
    corpo = `<rect width="${PW}" height="${PH}" fill="url(#bgPanel)"/>
      <g filter="url(#blur18)">${inchiostro(9, PW * 0.6, PH * 0.3, 210, 62, 0.5)}</g>
      ${bokeh(26)}`;
  } else if (s.id === 'S2') {
    const strie = Array.from({ length: 9 }, (_, i) =>
      `<path d="M${-40 + i * 6},${70 + i * 34} Q${PW * 0.5},${40 + i * 30} ${PW + 40},${20 + i * 22}"
         stroke="${i % 2 ? C.blu : '#cfe0ff'}" stroke-opacity="0.28" stroke-width="2.5" fill="none" filter="url(#blur3)"/>`).join('\n');
    corpo = `<rect width="${PW}" height="${PH}" fill="url(#bgPanel)"/>
      ${strie}
      <ellipse cx="${PW * 0.88}" cy="58" rx="90" ry="46" fill="#eaf3ff" fill-opacity="0.30" filter="url(#blur18)"/>
      ${testoMini('Ogni giorno:', 330, 19)}${testoMini('annunci, demo,', 354, 19)}${testoMini('benchmark.', 378, 19)}`;
  } else if (s.id === 'S3') {
    // il taglio: due campi separati dalla diagonale a 45°, con la fessura scura
    corpo = `<rect width="${PW}" height="${PH}" fill="#070a12"/>
      <polygon points="0,0 ${PW},0 ${PW},${PH * 0.34} 0,${PH * 0.9}" fill="${C.blu}" fill-opacity="0.22"/>
      <polygon points="0,${PH * 0.9} ${PW},${PH * 0.34} ${PW},${PH} 0,${PH}" fill="${C.viola}" fill-opacity="0.26"/>
      ${inchiostro(6, PW * 0.35, PH * 0.2, 160, 40, 0.35)}
      <polygon points="0,${PH * 0.905} ${PW},${PH * 0.345} ${PW},${PH * 0.375} 0,${PH * 0.935}" fill="${C.fondo}" fill-opacity="0.95"/>
      <polygon points="0,${PH * 0.885} ${PW},${PH * 0.325} ${PW},${PH * 0.335} 0,${PH * 0.895}" fill="url(#lama)" filter="url(#glow)"/>
      <polygon points="0,${PH * 0.888} ${PW},${PH * 0.328} ${PW},${PH * 0.332} 0,${PH * 0.892}" fill="#ffffff" fill-opacity="0.9"/>
      ${testoMini('Quasi niente', 330, 19)}${testoMini('ti cambia la', 354, 19)}${testoMini('giornata.', 378, 19)}`;
  } else if (s.id === 'S4') {
    const righe = [0, 1, 2].map((i) => {
      const y = 405 + i * 26;
      return `<rect x="40" y="${y}" width="${PW - 80}" height="3" rx="1.5" fill="#eaf3ff" opacity="0.9" filter="url(#glow)"/>
              <rect x="40" y="${y}" width="${PW - 80}" height="1.5" rx="0.75" fill="#ffffff"/>`;
    }).join('\n');
    corpo = `<rect width="${PW}" height="${PH}" fill="url(#bgPanel)"/>
      <g filter="url(#blur18)">${inchiostro(5, PW * 0.5, PH * 0.55, 250, 48, 0.22)}</g>
      ${testoMini('Ne restano poche.', 330, 19)}${testoMini('Le scegliamo noi.', 354, 19)}
      ${righe}`;
  } else if (s.id === 'F1') {
    // orizzonte: la lama di luce + la distesa di linee che convergono
    const orizz = PH * 0.60;
    const linee = Array.from({ length: 17 }, (_, i) => {
      const y = orizz + 6 + Math.pow(i / 16, 1.7) * (PH - orizz - 10);
      const op = 0.55 - (i / 16) * 0.42;
      return `<line x1="0" y1="${y.toFixed(0)}" x2="${PW}" y2="${y.toFixed(0)}" stroke="#cfe0ff" stroke-opacity="${op.toFixed(2)}" stroke-width="${(0.7 + (1 - i / 16) * 1.6).toFixed(1)}"/>`;
    }).join('\n');
    const raggi = Array.from({ length: 12 }, (_, i) => {
      const x = (i / 11) * PW;
      return `<line x1="${(PW / 2 + (x - PW / 2) * 0.12).toFixed(0)}" y1="${orizz.toFixed(0)}" x2="${x}" y2="${PH}" stroke="${i % 2 ? C.blu : C.viola}" stroke-opacity="0.10" stroke-width="1"/>`;
    }).join('\n');
    corpo = `<rect width="${PW}" height="${PH}" fill="#04060a"/>
      ${raggi}
      ${linee}
      <ellipse cx="${PW / 2}" cy="${orizz}" rx="${PW * 0.55}" ry="26" fill="#cfe0ff" fill-opacity="0.30" filter="url(#blur18)"/>
      <rect x="0" y="${orizz - 1}" width="${PW}" height="2" fill="#ffffff" fill-opacity="0.95"/>
      <text x="22" y="${orizz + 62}" font-family="DejaVu Sans" font-size="15" font-weight="bold" fill="${C.testo}">Il futuro non arriva</text>
      <text x="22" y="${orizz + 82}" font-family="DejaVu Sans" font-size="15" font-weight="bold" fill="${C.testo}">tutto insieme.</text>`;
  } else if (s.id === 'F2') {
    // il passaggio: una massa nera di cui si vede solo il bordo illuminato
    corpo = `<rect width="${PW}" height="${PH}" fill="#04060a"/>
      <polygon points="-20,-20 ${PW + 20},-20 ${PW + 20},${PH * 0.30} -20,${PH * 0.52}" fill="#000000"/>
      <polygon points="-20,${PH * 0.52} ${PW + 20},${PH * 0.30} ${PW + 20},${PH * 0.325} -20,${PH * 0.545}" fill="url(#lama)" filter="url(#glow)"/>
      <polygon points="-20,${PH * 0.523} ${PW + 20},${PH * 0.303} ${PW + 20},${PH * 0.309} -20,${PH * 0.529}" fill="#ffffff" fill-opacity="0.92"/>
      <ellipse cx="${PW * 0.62}" cy="${PH * 0.88}" rx="150" ry="46" fill="#cfe0ff" fill-opacity="0.13" filter="url(#blur18)"/>
      ${bokeh(14, 91)}
      <text x="22" y="${PH * 0.74}" font-family="DejaVu Sans" font-size="15" font-weight="bold" fill="${C.testo}">Ogni salto è cominciato</text>
      <text x="22" y="${PH * 0.74 + 20}" font-family="DejaVu Sans" font-size="15" font-weight="bold" fill="${C.testo}">come una notizia.</text>`;
  } else if (s.id === 'S5') {
    corpo = `<rect width="${PW}" height="${PH}" fill="#04060a"/>
      <rect x="40" y="405" width="${PW - 80}" height="2" fill="#eaf3ff" opacity="0.30"/>
      <rect x="40" y="431" width="${PW - 80}" height="2" fill="#eaf3ff" opacity="0.16"/>
      <rect x="40" y="457" width="${PW - 80}" height="2" fill="#eaf3ff" opacity="0.06"/>
      <circle cx="${PW - 40}" cy="405" r="4.5" fill="url(#signal)" filter="url(#glow)"/>`;
  } else {
    corpo = `<rect width="${PW}" height="${PH}" fill="${C.fondo}"/>
      ${markGroup(PW / 2, 150, 96, 'sb')}
      <circle cx="${PW / 2 + 58}" cy="108" r="7" fill="url(#signal)"/>
      <text x="${PW / 2}" y="330" text-anchor="middle" font-family="DejaVu Sans" font-size="25"
        font-weight="bold" fill="${C.testo}">L’AI spiegata</text>
      <text x="${PW / 2}" y="360" text-anchor="middle" font-family="DejaVu Sans" font-size="25"
        font-weight="bold" fill="${C.testo}">in tre righe.</text>
      <rect x="${PW / 2 - 60}" y="384" width="60" height="3" rx="1.5" fill="${C.blu}"/>
      <text x="${PW / 2}" y="412" text-anchor="middle" font-family="DejaVu Sans" font-size="12"
        fill="${C.secondario}">ogni giorno, con la fonte</text>`;
  }
  return `<g clip-path="url(#clip-${s.id})"><g>${corpo}</g></g>`;
}

// ── composizione della tavola ───────────────────────────────────────────────────────────
let pannelli = '';
SHOT.forEach((s, i) => {
  const x = PAD + i * (PW + GAP);
  const y = 128;
  pannelli += `
  <g transform="translate(${x},${y})">
    <rect x="-1" y="-1" width="${PW + 2}" height="${PH + 2}" rx="11" fill="none" stroke="#1e2a42" stroke-width="1.5"/>
    ${pannello(s)}
    <text x="0" y="${PH + 26}" font-family="DejaVu Sans" font-size="15" font-weight="bold" fill="${C.blu}">${s.id}</text>
    <text x="34" y="${PH + 26}" font-family="DejaVu Sans" font-size="14" fill="${C.secondario}">${s.tc}</text>
    <text x="0" y="${PH + 48}" font-family="DejaVu Sans" font-size="15" font-weight="bold" fill="${C.testo}">${s.nome}</text>
    ${s.nota.split('\n').map((r, j) =>
      `<text x="0" y="${PH + 70 + j * 17}" font-family="DejaVu Sans" font-size="12.5" fill="${C.secondario}">${r}</text>`).join('')}
  </g>`;
});

// barra dei timecode: la curva del ritmo (lenta → lunga → stretta)
const dur = [3.0, 3.4, 3.6, 3.6, 2.8, 3.6, 3.8, 4.2];
const tot = dur.reduce((a, b) => a + b, 0);
const scala = (COLS * PW + (COLS - 1) * GAP) / tot;
let xb = PAD, barra = '';
dur.forEach((d, i) => {
  barra += `<rect x="${xb.toFixed(1)}" y="${H - 62}" width="${(d * scala - 2).toFixed(1)}" height="16" rx="3"
    fill="${i === 2 ? C.blu : i === 6 ? C.viola : i === 7 ? C.verde : '#20304d'}"/>
  <text x="${(xb + 6).toFixed(1)}" y="${H - 48}" font-family="DejaVu Sans" font-size="10.5" fill="${i === 2 || i === 6 || i === 7 ? '#05070c' : C.secondario}">${d.toFixed(1)}s</text>`;
  xb += d * scala;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${defs}</defs>
<rect width="${W}" height="${H}" fill="#080b12"/>
<text x="${PAD}" y="62" font-family="DejaVu Sans" font-size="30" font-weight="bold" fill="${C.testo}">Aion · «Il filtro» — tavola di regia</text>
<text x="${PAD}" y="92" font-family="DejaVu Sans" font-size="16" fill="${C.secondario}">Reel verticale 9:16 · 28 s · 24 fps · sette generazioni + coda tipografica · il filtro → il futuro</text>
<text x="${W - PAD}" y="62" text-anchor="end" font-family="DejaVu Sans" font-size="14" fill="${C.secondario}">storyboard disegnato, non generato</text>
${pannelli}
${barra}
<text x="${PAD}" y="${H - 80}" font-family="DejaVu Sans" font-size="13" fill="${C.secondario}">Atto I: organico → geometrico (0–16,4) · ponte: il punto verde diventa orizzonte · Atto II: scala e ombra (16,4–23,8) · firma</text>
</svg>`;

writeFileSync(join(QUI, 'storyboard.svg'), svg);
execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', join(QUI, 'storyboard.png'), join(QUI, 'storyboard.svg')]);
console.log(`storyboard scritto: ${join(QUI, 'storyboard.png')} (${W}×${H})`);
