#!/usr/bin/env node
/**
 * make-brand-kit.mjs — genera il kit di brand di Aion in media/aion-brand-kit/.
 *
 * Tutto nasce da scripts/aion-mark.mjs (sorgente unico del marchio): cambiare il marchio là
 * e rilanciare questo script aggiorna logo, lockup, palette e guide.
 *
 * Uso: node media/aion-brand-kit/make-brand-kit.mjs
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { markGroup, MARK_DEFS, MARK_PATH } from '../../scripts/aion-mark.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const ROOT = join(QUI, '../..');
const FONT = 'DejaVu Sans';

const C = {
  testo: '#f6f9ff', secondario: '#96a9c4', blu: '#5b9dff', viola: '#8b5cff',
  verde: '#34d399', giallo: '#fbbf24', fondo0: '#05070c', fondo1: '#0b1120',
};

for (const d of ['marchio', 'lockup', 'palette', 'guide', 'tipografia', 'profilo', 'copertina']) {
  mkdirSync(join(QUI, d), { recursive: true });
}

function svg(nome, w, h, corpo, defsExtra = '') {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>${MARK_DEFS}
  <radialGradient id="signal" cx="0.5" cy="0.45" r="0.6">
    <stop offset="0" stop-color="#5ff0bb"/><stop offset="1" stop-color="#22b98a"/>
  </radialGradient>
  ${defsExtra}
</defs>
${corpo}
</svg>`;
  const p = join(QUI, nome);
  writeFileSync(p.replace(/\.png$/, '.svg'), doc);
  const [w2, h2] = nome.endsWith('.png') ? nome.match(/(\d+)$/) ? [0, 0] : [w, h] : [w, h];
  execFileSync('rsvg-convert', ['-w', String(w2 || w), '-h', String(h2 || h), '-o', p, p.replace(/\.png$/, '.svg')]);
  return p;
}

const png = (nome, w, h, corpo, defs = '') => {
  const svgPath = join(QUI, nome.replace(/\.png$/, '.svg'));
  writeFileSync(svgPath, corpo);
  execFileSync('rsvg-convert', ['-w', String(w), '-h', String(h), '-o', join(QUI, nome), svgPath]);
  console.log('  ', nome, `${w}×${h}`);
};

const online = (cx, cy, r) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#signal)"/>
   <circle cx="${cx}" cy="${cy}" r="${r * 1.65}" fill="none" stroke="${C.verde}" stroke-opacity="0.22" stroke-width="${r * 0.26}"/>`;

const MARK_WHITE = `<path fill="#ffffff" fill-rule="evenodd" d="${MARK_PATH}"/>`;

// ─── 1. marchio su trasparente, tre misure + versione monocroma ─────────────────────────
console.log('marchio/');
const marchioColore = (size) => svg(`marchio/marchio-colore-${size}.png`, size, size,
  `${markGroup(size / 2, size / 2 - size * 0.02, size * 0.62, 'm' + size)}
   ${online(size / 2 + size * 0.205, size / 2 - size * 0.175, size * 0.028)}`);

for (const s of [2048, 1024, 512]) marchioColore(s);

png('marchio/marchio-bianco-1024.png', 1024, 1024,
`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<g transform="translate(512,492) scale(1.18) translate(-512,-520)">${MARK_WHITE}</g></svg>`);

png('marchio/marchio-su-nero-2048.png', 2048, 2048,
`<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048">
<defs>${MARK_DEFS}<radialGradient id="signal" cx="0.5" cy="0.45" r="0.6">
  <stop offset="0" stop-color="#5ff0bb"/><stop offset="1" stop-color="#22b98a"/></radialGradient></defs>
<rect width="2048" height="2048" fill="${C.fondo0}"/>
${markGroup(1024, 980, 1240, 'sn')}
${online(1442, 660, 58)}</svg>`);

// ─── 2. lockup ──────────────────────────────────────────────────────────────────────────
console.log('lockup/');
png('lockup/lockup-orizzontale-980x500.png', 980, 500,
`<svg xmlns="http://www.w3.org/2000/svg" width="980" height="500" viewBox="0 0 980 500">
<defs>${MARK_DEFS}<radialGradient id="signal" cx="0.5" cy="0.45" r="0.6">
  <stop offset="0" stop-color="#5ff0bb"/><stop offset="1" stop-color="#22b98a"/></radialGradient></defs>
${markGroup(192, 250, 300, 'lo')}
${online(305, 140, 14)}
<text x="376" y="288" font-family="${FONT}" font-size="166" font-weight="bold" fill="${C.testo}" letter-spacing="7">AION</text>
<text x="382" y="362" font-family="${FONT}" font-size="44" font-weight="bold" fill="${C.blu}" letter-spacing="18">AI NEWS</text></svg>`);

png('lockup/lockup-verticale-700x820.png', 700, 820,
`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="820" viewBox="0 0 700 820">
<defs>${MARK_DEFS}<radialGradient id="signal" cx="0.5" cy="0.45" r="0.6">
  <stop offset="0" stop-color="#5ff0bb"/><stop offset="1" stop-color="#22b98a"/></radialGradient></defs>
${markGroup(350, 270, 300, 'lv')}
${online(456, 156, 14)}
<text x="350" y="600" text-anchor="middle" font-family="${FONT}" font-size="128" font-weight="bold" fill="${C.testo}" letter-spacing="6">AION</text>
<text x="350" y="674" text-anchor="middle" font-family="${FONT}" font-size="36" font-weight="bold" fill="${C.blu}" letter-spacing="16">AI NEWS</text></svg>`);

// ─── 3. palette ─────────────────────────────────────────────────────────────────────────
console.log('palette/');
const COLORI = [
  ['Fondo 0', C.fondo0, 'sfondo di ogni immagine'],
  ['Fondo 1', C.fondo1, 'secondo stop del gradiente'],
  ['Testo', C.testo, 'titoli'],
  ['Secondario', C.secondario, 'sottotitoli, firma'],
  ['Blu', C.blu, 'modelli, piattaforme, orizzonte'],
  ['Viola', C.viola, 'Meta, ricerca, futuro'],
  ['Verde', C.verde, '«online», stato, ok'],
  ['Giallo', C.giallo, 'numeri, prezzi, avvertenze'],
];
const SW = 220, SH = 300, PAD = 60;
const pw = PAD * 2 + COLORI.length * SW + (COLORI.length - 1) * 16;
png('palette/palette.png', pw, 520,
`<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="520" viewBox="0 0 ${pw} 520">
<rect width="${pw}" height="520" fill="#080b12"/>
<text x="${PAD}" y="58" font-family="${FONT}" font-size="30" font-weight="bold" fill="${C.testo}">Aion · palette</text>
<text x="${PAD}" y="88" font-family="${FONT}" font-size="16" fill="${C.secondario}">Un solo accento per categoria, costante nel tempo. Nessun arancione, in nessun caso.</text>
${COLORI.map(([nome, hex, uso], i) => {
  const x = PAD + i * (SW + 16);
  const chiaro = ['#f6f9ff', '#96a9c4', '#5b9dff', '#8b5cff', '#34d399', '#fbbf24'].includes(hex);
  return `<rect x="${x}" y="130" width="${SW}" height="${SH}" rx="10" fill="${hex}" stroke="#1e2a42" stroke-width="1"/>
  <text x="${x + 18}" y="${130 + SH - 60}" font-family="${FONT}" font-size="22" font-weight="bold" fill="${chiaro ? '#05070c' : C.testo}">${hex}</text>
  <text x="${x + 18}" y="${130 + SH - 32}" font-family="${FONT}" font-size="14" fill="${chiaro ? '#05070c' : C.secondario}">${nome}</text>
  <text x="${x}" y="${130 + SH + 30}" font-family="${FONT}" font-size="13" fill="${C.secondario}">${uso}</text>`;
}).join('\n')}</svg>`);

writeFileSync(join(QUI, 'palette/palette.json'), JSON.stringify({
  brand: 'Aion · AI News',
  nota: 'Un solo accento per categoria, costante nel tempo. Nessun arancione.',
  colori: Object.fromEntries(COLORI.map(([nome, hex, uso]) => [nome.toLowerCase().replace(' ', '-'), { hex, uso }])),
  tipografia: { famiglia: 'DejaVu Sans', pesi: ['Regular', 'Bold'], nota: 'titoli in Bold, mai più di due corpi per immagine' },
}, null, 2) + '\n');

// ─── 4. guide: zone sicure ───────────────────────────────────────────────────────────────
console.log('guide/');
png('guide/safe-zone-9x16.png', 1080, 1920,
`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<rect width="1080" height="1920" fill="${C.fondo0}"/>
<rect x="0" y="1500" width="1080" height="420" fill="#ff5c5c" fill-opacity="0.16"/>
<rect x="900" y="0" width="180" height="1500" fill="#ff5c5c" fill-opacity="0.12"/>
<rect x="96" y="330" width="888" height="1170" fill="none" stroke="${C.verde}" stroke-width="3" stroke-dasharray="14 10"/>
<line x1="0" y1="640" x2="1080" y2="640" stroke="#ffffff" stroke-opacity="0.10"/>
<line x1="0" y1="1280" x2="1080" y2="1280" stroke="#ffffff" stroke-opacity="0.10"/>
<line x1="360" y1="0" x2="360" y2="1920" stroke="#ffffff" stroke-opacity="0.10"/>
<line x1="720" y1="0" x2="720" y2="1920" stroke="#ffffff" stroke-opacity="0.10"/>
<text x="96" y="300" font-family="${FONT}" font-size="30" font-weight="bold" fill="${C.testo}">Reel 9:16 · zona sicura</text>
<text x="96" y="1560" font-family="${FONT}" font-size="26" font-weight="bold" fill="${C.testo}">UI di Facebook (comandi, didascalia)</text>
<text x="96" y="1596" font-family="${FONT}" font-size="20" fill="${C.secondario}">nessun testo né elemento del marchio qui sotto</text>
<text x="470" y="120" font-family="${FONT}" font-size="20" fill="${C.secondario}">colonna icone →</text>
<text x="96" y="1830" font-family="${FONT}" font-size="18" fill="${C.secondario}">testi fra y=560 e y=1300 · margine sinistro 96 px · larghezza utile 888 px</text></svg>`);

png('guide/safe-zone-1x1.png', 1080, 1080,
`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
<rect width="1080" height="1080" fill="${C.fondo0}"/>
<rect x="80" y="80" width="920" height="920" fill="none" stroke="${C.verde}" stroke-width="3" stroke-dasharray="12 9"/>
<circle cx="540" cy="540" r="460" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
<text x="80" y="60" font-family="${FONT}" font-size="26" font-weight="bold" fill="${C.testo}">Post 1:1 · margine 80 px</text>
<text x="80" y="1030" font-family="${FONT}" font-size="18" fill="${C.secondario}">il marchio resta riconoscibile da 40 px: non aggiungere dettagli</text></svg>`);

// ─── 5. copie (profilo, copertina, testi overlay) ───────────────────────────────────────
console.log('copie/');
for (const [da, a] of [
  ['media/aion-logo@2x.png', 'profilo/aion-profilo-2048.png'],
  ['media/aion-copertina@2x.png', 'copertina/aion-copertina-3280x1248.png'],
  ['media/aion-logo.svg', 'profilo/aion-profilo.svg'],
  ['media/aion-copertina.svg', 'copertina/aion-copertina.svg'],
]) {
  const src = join(ROOT, da);
  if (existsSync(src)) { copyFileSync(src, join(QUI, a)); console.log('  ', a); }
}
for (const f of ['beat1', 'beat2', 'beat3', 'beat4', 'beat4-cta', 'beat5', 'beat6']) {
  const src = join(ROOT, 'media/aion-reel-filtro/overlay', `${f}.png`);
  if (existsSync(src)) { mkdirSync(join(QUI, 'testi-overlay'), { recursive: true }); copyFileSync(src, join(QUI, 'testi-overlay', `${f}.png`)); }
}
console.log('   testi-overlay/ (7 PNG)');

// ─── 6. tipografia ──────────────────────────────────────────────────────────────────────
console.log('tipografia/');
for (const f of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  const src = `/usr/share/fonts/truetype/dejavu/${f}`;
  if (existsSync(src)) copyFileSync(src, join(QUI, 'tipografia', f));
}
writeFileSync(join(QUI, 'tipografia/LICENZA.txt'),
`DejaVu Fonts — licenza Bitstream Vera / DejaVu (libera, uso commerciale consentito).
Fonte: https://dejavu-fonts.github.io/License.html
In questo kit: DejaVuSans.ttf e DejaVuSans-Bold.ttf, gli stessi usati per card, overlay e video.
Regola: un solo carattere; titoli in Bold; mai più di due corpi per immagine.
`);

console.log('\nkit scritto in media/aion-brand-kit/');
