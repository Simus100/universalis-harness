#!/usr/bin/env node
/**
 * card-numero.mjs — card «un numero» per un post di «Aion · AI News».
 * Uso:
 *   node scripts/card-numero.mjs --numero "95%" --etichetta "Cache di ingresso · Gemini 4 Argon" \
 *        --contesto "quello che paghi per il contesto che rileggi|non è quello che paghi per chiederlo" \
 *        --accento "#fbbf24" --out media/card-numero-95
 *
 * Produce <out>.svg, <out>.png (1200x630) e <out>@2x.png (2400x1260).
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { markGroup, MARK_DEFS } from './aion-mark.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => {
    if (v.startsWith('--')) acc.push([v.slice(2), a[i + 1]]);
    return acc;
  }, [])
);

const numero = args.numero || '0';
const etichetta = args.etichetta || '';
const contesto = (args.contesto || '').split('|');
const accento = args.accento || '#fbbf24';
const out = args.out || 'media/card-numero';

const W = 1200, H = 630, pad = 80;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Il numero si adatta alla larghezza utile (misurato, non stimato).
function larghezza(t, pt) {
  try {
    return Number(execFileSync('convert', ['-font', 'DejaVu-Sans-Bold', '-pointsize', String(pt),
      `label:${t}`, '-format', '%w', 'info:'], { encoding: 'utf8' }));
  } catch {
    return t.length * pt * 0.62;
  }
}
const utile = W - 2 * pad;
const sizeNum = Math.max(96, Math.min(200, Math.floor((utile * 100) / larghezza(numero, 100))));

const righe = contesto
  .map((r, i) => `<text x="${pad}" y="${470 + i * 42}" font-size="28" fill="#a7b8d0">${esc(r)}</text>`)
  .join('\n    ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>${esc(numero)} — ${esc(etichetta)}</title>
  <desc>Card «un numero»: la cifra grande al centro del discorso, con il contesto sotto.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080b13"/><stop offset="0.6" stop-color="#060810"/><stop offset="1" stop-color="#0b1020"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.2" cy="0.42" r="0.8">
      <stop offset="0" stop-color="${accento}" stop-opacity="0.20"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="38" height="38" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#141d2c"/>
    </pattern>
    ${MARK_DEFS}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.5"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${markGroup(pad + 13, 104, 30, 'cm')}
  <text x="${pad + 44}" y="110" font-family="DejaVu Sans" font-size="16" letter-spacing="6" fill="#8ea2bf">AION · AI NEWS</text>
  <text x="${pad}" y="205" font-family="DejaVu Sans" font-size="19" letter-spacing="3" fill="${accento}">${esc(etichetta.toUpperCase())}</text>
  <text x="${pad - 6}" y="400" font-family="DejaVu Sans" font-size="${sizeNum}" font-weight="bold" fill="#f6f9ff">${esc(numero)}</text>
  <g font-family="DejaVu Sans">
    ${righe}
  </g>
  <line x1="${pad}" y1="${H - 82}" x2="${W - pad}" y2="${H - 82}" stroke="#151d2b" stroke-width="2"/>
  <text x="${pad}" y="${H - 42}" font-family="DejaVu Sans" font-size="17" letter-spacing="3" fill="#6c80a0">Cosa è successo · perché conta · cosa puoi farci</text>
</svg>
`;

writeFileSync(`${out}.svg`, svg);
execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', `${out}.png`, `${out}.svg`]);
execFileSync('rsvg-convert', ['-w', String(W * 2), '-h', String(H * 2), '-o', `${out}@2x.png`, `${out}.svg`]);
console.log(`${out}.svg + ${out}.png + ${out}@2x.png`);
