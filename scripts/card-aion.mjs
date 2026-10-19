#!/usr/bin/env node
/**
 * card-aion.mjs — genera una card 1200x630 per un post di «Aion · AI News».
 * Uso:
 *   node scripts/card-aion.mjs --kicker "REGole · UE" --titolo "La prima norma|dell'AI Act è in Gazzetta" \
 *        --accento "#34d399" --out media/card-en18286
 * Le righe del titolo si separano con «|». Produce <out>.svg e <out>.png (rsvg-convert).
 */
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => {
    if (v.startsWith('--')) acc.push([v.slice(2), a[i + 1]]);
    return acc;
  }, [])
);

const kicker = args.kicker || 'NOTIZIA';
const titolo = args.titolo || 'Titolo';
const accento = args.accento || '#5b9dff';
const out = args.out || 'media/card';
const righe = titolo.split('|');

const W = 1200, H = 630;
const pad = 84;
const yKicker = 250;
const yPrima = 330;
const interlinea = 84;
const size = righe.join(' ').length > 42 ? 58 : 68;

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const testo = righe
  .map((r, i) => `    <text x="${pad + 34}" y="${yPrima + i * interlinea}" font-size="${size}" font-weight="bold" fill="#f2f6ff">${escape(r)}</text>`)
  .join('\n');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>${escape(kicker)} — ${escape(righe.join(' '))}</title>
  <desc>Card per un post di Aion · AI News: categoria in alto, titolo grande, marchio in basso.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080b13"/>
      <stop offset="0.6" stop-color="#060810"/>
      <stop offset="1" stop-color="#0b1020"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.18" cy="0.35" r="0.7">
      <stop offset="0" stop-color="${accento}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g stroke="#151d2b" stroke-width="2">
    <line x1="${pad}" y1="${H - 150}" x2="${W - pad}" y2="${H - 150}"/>
  </g>
  <rect x="${pad}" y="88" width="10" height="10" rx="2" fill="${accento}"/>
  <text x="${pad + 22}" y="99" font-family="DejaVu Sans" font-size="17" letter-spacing="6" fill="#7f93b4">AION · AI NEWS</text>
  <text x="${pad + 34}" y="${yKicker}" font-family="DejaVu Sans" font-size="20" letter-spacing="4" fill="${accento}">${escape(kicker.toUpperCase())}</text>
  <rect x="${pad}" y="${yPrima - 52}" width="8" height="${righe.length * interlinea + 8}" rx="4" fill="${accento}"/>
  <g font-family="DejaVu Sans">
${testo}
  </g>
  <text x="${pad + 34}" y="${H - 100}" font-family="DejaVu Sans" font-size="18" letter-spacing="3" fill="#5f7396">Cosa è successo · perché conta · cosa puoi farci</text>
</svg>
`;

writeFileSync(`${out}.svg`, svg);
execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', `${out}.png`, `${out}.svg`]);
console.log(`${out}.svg + ${out}.png`);
