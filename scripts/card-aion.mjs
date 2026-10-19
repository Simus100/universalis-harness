#!/usr/bin/env node
/**
 * card-aion.mjs — genera una card per un post di «Aion · AI News».
 * Uso:
 *   node scripts/card-aion.mjs --kicker "Regole · UE" \
 *        --titolo "La prima norma armonizzata|dell'AI Act è in Gazzetta" \
 *        --accento "#34d399" --out media/card-en18286
 *
 * Le righe del titolo si separano con «|». Produce <out>.svg, <out>.png (1200x630)
 * e <out>@2x.png (2400x1260, quello da caricare su Facebook).
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
const righe = (args.titolo || 'Titolo').split('|');
const accento = args.accento || '#5b9dff';
const out = args.out || 'media/card';

const W = 1200, H = 630;
const pad = 80;

// Il titolo si adatta misurando il testo vero (ImageMagick), non stimando i caratteri:
// si misura a 100pt e si scala per stare nella larghezza utile.
function larghezza(testo, pt) {
  try {
    const w = execFileSync('convert', ['-font', 'DejaVu-Sans-Bold', '-pointsize', String(pt),
      `label:${testo}`, '-format', '%w', 'info:'], { encoding: 'utf8' });
    return Number(w);
  } catch {
    return testo.length * pt * 0.66; // stima prudente se ImageMagick non c'è
  }
}
const utile = W - (pad + 36) - 28;
const max100 = Math.max(...righe.map((r) => larghezza(r, 100)));
const size = Math.max(38, Math.min(68, Math.floor((utile * 0.94 * 100) / max100)));
const interlinea = Math.round(size * 1.2);
const altezzaBlocco = (righe.length - 1) * interlinea + size;
const yPrima = Math.round(360 - altezzaBlocco / 2 + size * 0.76);
const yKicker = yPrima - size - 46;
const yBarTop = yPrima - size * 0.86;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const testo = righe
  .map((r, i) => `    <text x="${pad + 36}" y="${yPrima + i * interlinea}" font-size="${size}" font-weight="bold" fill="#f6f9ff">${esc(r)}</text>`)
  .join('\n');

const ICONA = 'M466,250 L558,250 L810,790 L720,790 L664.2,664 L359.8,664 L304,790 L214,790 Z M512,320 L626.2,578 L397.8,578 Z';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>${esc(kicker)} — ${esc(righe.join(' '))}</title>
  <desc>Card per un post di Aion · AI News: categoria in alto, titolo grande, marchio in basso.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#080b13"/>
      <stop offset="0.6" stop-color="#060810"/>
      <stop offset="1" stop-color="#0b1020"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.16" cy="0.34" r="0.75">
      <stop offset="0" stop-color="${accento}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="mark" x1="0.12" y1="0" x2="0.88" y2="1">
      <stop offset="0" stop-color="#c2dcff"/>
      <stop offset="0.38" stop-color="#6aa8ff"/>
      <stop offset="1" stop-color="#8f5fff"/>
    </linearGradient>
    <pattern id="dots" width="38" height="38" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#141d2c"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.5"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(${pad},96) scale(0.052) translate(-512,-520)">
    <path fill="url(#mark)" fill-rule="evenodd" d="${ICONA}"/>
  </g>
  <text x="${pad + 44}" y="${110}" font-family="DejaVu Sans" font-size="16" letter-spacing="6" fill="#8ea2bf">AION · AI NEWS</text>
  <text x="${pad + 36}" y="${yKicker}" font-family="DejaVu Sans" font-size="19" letter-spacing="4" fill="${accento}">${esc(kicker.toUpperCase())}</text>
  <rect x="${pad}" y="${yBarTop}" width="7" height="${altezzaBlocco + 16}" rx="3.5" fill="${accento}"/>
  <g font-family="DejaVu Sans">
${testo}
  </g>
  <line x1="${pad}" y1="${H - 128}" x2="${W - pad}" y2="${H - 128}" stroke="#151d2b" stroke-width="2"/>
  <text x="${pad + 36}" y="${H - 82}" font-family="DejaVu Sans" font-size="17" letter-spacing="3" fill="#6c80a0">Cosa è successo · perché conta · cosa puoi farci</text>
</svg>
`;

writeFileSync(`${out}.svg`, svg);
execFileSync('rsvg-convert', ['-w', String(W), '-h', String(H), '-o', `${out}.png`, `${out}.svg`]);
execFileSync('rsvg-convert', ['-w', String(W * 2), '-h', String(H * 2), '-o', `${out}@2x.png`, `${out}.svg`]);
console.log(`${out}.svg + ${out}.png + ${out}@2x.png`);
