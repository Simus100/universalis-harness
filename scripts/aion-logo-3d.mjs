/**
 * aion-logo-3d.mjs — il marchio di Aion come SOLIDO, non come disegno piatto.
 *
 * Prende la A da scripts/aion-mark.mjs (unica fonte del marchio), la taglia a 45° come nel logo
 * ufficiale e ne estrude due blocchi distinti (blu sopra, viola sotto) separati dalla fessura.
 * Poi: smusso sugli spigoli, shading per faccia con tre luci, pareti laterali, riflesso sul piano,
 * alone e la sfera verde «online». Nessun filtro SVG (librsvg li regge male): path, gradienti e
 * painter's algorithm.
 *
 * Uso:
 *   node scripts/aion-logo-3d.mjs --out media/aion-logo-3d --yaw -16 --pitch 9
 *
 * Opzioni: --yaw --pitch --roll (gradi, posa) · --depth (metà spessore) · --bevel · --gap (fessura, px)
 *          --size (lato in px) · --flat (senza riflesso) · --transparent (senza fondo)
 */
import { writeFileSync } from 'node:fs';
import { MARK_PATH } from './aion-mark.mjs';

// ─────────────────────────────────────────────── argomenti
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  if (i < 0) return d;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const OUT = arg('out', 'media/aion-logo-3d');
const YAW = parseFloat(arg('yaw', '-16')) * Math.PI / 180;
const PITCH = parseFloat(arg('pitch', '9')) * Math.PI / 180;
const ROLL = parseFloat(arg('roll', '0')) * Math.PI / 180;
const HALF_DEPTH = parseFloat(arg('depth', '0.115'));
const BEVEL = parseFloat(arg('bevel', '0.022'));
const GAP = parseFloat(arg('gap', '22')) / 540;
const SHIFT = parseFloat(arg('shift', '0.045'));   // sfalsamento delle due lastre in z
const SIZE = parseInt(arg('size', '1024'), 10);
const REFLECT = !arg('flat', false);
const TRANSPARENT = !!arg('transparent', false);

// ─────────────────────────────────────────────── 1. geometria 2D (unità: 1 = altezza della A)
function parseRings(d) {
  const rings = [];
  let cur = null;
  const toks = d.match(/[MLZmlz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?/g) || [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/[MLZmlz]/.test(t)) {                 // comando: M apre un anello, Z lo chiude, L continua
      if (t === 'M' || t === 'm') { cur = []; rings.push(cur); }
      else if (t === 'Z' || t === 'z') cur = null;
      continue;
    }
    if (!cur) continue;
    cur.push([(parseFloat(t) - 512) / 540, (520 - parseFloat(toks[++i])) / 540]);
  }
  return rings;
}

/** Sutherland–Hodgman: tiene i punti con f(p) >= 0. */
function clipRing(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    const fa = f(A), fb = f(B);
    if (fa >= 0) out.push(A);
    if ((fa >= 0) !== (fb >= 0)) {
      const t = fa / (fa - fb);
      out.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])]);
    }
  }
  return out;
}

const inPoly = (poly, p) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** materiale = dentro il contorno esterno e fuori dai fori (evenodd). */
const inMaterial = (rings, p) => { let c = false; for (const r of rings) if (inPoly(r, p)) c = !c; return c; };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const norm2 = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };

/** per ogni lato di ogni anello: normale che punta NEL materiale. */
function sideNormals(rings) {
  return rings.map((pts) => pts.map((_, i) => {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const d = sub(b, a);
    let n = norm2([-d[1], d[0]]);
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const eps = 0.012;
    if (!inMaterial(rings, [m[0] + n[0] * eps, m[1] + n[1] * eps])) n = [-n[0], -n[1]];
    return { n, i, a, b };
  }));
}

/** anello spostato verso l'interno di `dist` (miter con clamp sugli spigoli acuti). */
function offsetInward(pts, sn, dist) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = sn[(i - 1 + sn.length) % sn.length].n;
    const next = sn[i].n;
    const bis = norm2([prev[0] + next[0], prev[1] + next[1]]);
    const cos = Math.max(bis[0] * next[0] + bis[1] * next[1], 0.70);   // spigoli acuti: niente punte lunghe
    out.push([pts[i][0] + (bis[0] * dist) / cos, pts[i][1] + (bis[1] * dist) / cos]);
  }
  return out;
}

// ─────────────────────────────────────────────── 2. il taglio a 45° (stesse rette del marchio piatto)
// svg: metà alta y < x - 3 → unità marchio: v > u - 0.0204 ; metà bassa y > x + 19 → v < -u - 0.0204
const CUT = 3 / 540;
// v > -u - CUT  →  metà alta ;  v < -u - CUT - gap  →  metà bassa
const isTop = (p) => p[0] + p[1] - CUT;        // >= 0 → metà alta
const isBottom = (p) => -p[0] - p[1] - CUT;    // >= 0 → metà bassa

const MARK = parseRings(MARK_PATH);
const halvesRings = [
  { color: [0.357, 0.616, 1.0], rings: null },  // #5b9dff — metà alta
  { color: [0.545, 0.361, 1.0], rings: null },  // #8b5cff — metà bassa
];
halvesRings[0].rings = MARK.map((r) => clipRing(r, isTop)).filter((r) => r.length >= 3);
halvesRings[1].rings = MARK.map((r) => clipRing(r, isBottom)).filter((r) => r.length >= 3);

// ─────────────────────────────────────────────── 3. solido: fronte, smusso, pareti
const zF = HALF_DEPTH, zB = -HALF_DEPTH, zBev = zF - BEVEL;

function buildSolid(rings, base, zShift) {
  const faces = [];
  if (!rings.length || rings[0].length < 3) return faces;
  const sn = sideNormals(rings);
  const front = rings.map((r, ri) => offsetInward(r, sn[ri], BEVEL));

  // primo anello = contorno (riempito), gli altri sono fori (mascherati)
  faces.push({ kind: 'front', rings: front, z: zF + zShift, base });
  faces.push({ kind: 'back', rings, z: zB + zShift, base });

  rings.forEach((pts, ri) => {
    const normals = sn[ri];
    normals.forEach(({ n }, i) => {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const qa = front[ri][i], qb = front[ri][(i + 1) % pts.length];
      const outN = [-n[0], -n[1], 0];                      // verso l'esterno del materiale
      faces.push({                                             // smusso
        kind: 'bevel', base,
        quad3: [[qa[0], qa[1], zF + zShift], [qb[0], qb[1], zF + zShift],
                [b[0], b[1], zBev + zShift], [a[0], a[1], zBev + zShift]],
        hint: [outN[0], outN[1], 1.7],
      });
      faces.push({                                             // parete laterale
        kind: 'wall', base,
        quad3: [[a[0], a[1], zB + zShift], [b[0], b[1], zB + zShift],
                [b[0], b[1], zBev + zShift], [a[0], a[1], zBev + zShift]],
        hint: outN,
      });
    });
  });
  return faces;
}

const FACES = [];
FACES.push(...buildSolid(halvesRings[0].rings, halvesRings[0].color, +SHIFT).map((f) => ({ ...f, block: 0 })));
FACES.push(...buildSolid(halvesRings[1].rings, halvesRings[1].color, -SHIFT).map((f) => ({ ...f, block: 1 })));

// ─────────────────────────────────────────────── 4. camera, luci
const CAM = 4.2, FOC = 4.2;
const norm3 = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function rot(p) {
  const [x, y, z] = p;
  const x1 = x * Math.cos(YAW) + z * Math.sin(YAW);
  const z1 = -x * Math.sin(YAW) + z * Math.cos(YAW);
  const y2 = y * Math.cos(PITCH) - z1 * Math.sin(PITCH);
  const z2 = y * Math.sin(PITCH) + z1 * Math.cos(PITCH);
  return [x1 * Math.cos(ROLL) - y2 * Math.sin(ROLL), x1 * Math.sin(ROLL) + y2 * Math.cos(ROLL), z2];
}
const project = (p) => { const s = FOC / (CAM - p[2]); return [p[0] * s, p[1] * s]; };

const LIGHTS = [
  { d: norm3([-0.45, 0.72, 0.62]), i: 1.00, c: [1.0, 1.0, 1.0] },
  { d: norm3([0.85, -0.10, 0.40]), i: 0.40, c: [0.66, 0.80, 1.0] },
  { d: norm3([0.10, 0.45, -0.88]), i: 0.50, c: [0.80, 0.88, 1.0] },
];
const AMB = 0.30;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const hex = (col) => '#' + col.map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')).join('');

function shade(N, base, specK = 1) {
  let d = AMB;
  for (const L of LIGHTS) d += Math.max(0, dot3(N, L.d)) * L.i;
  const H = norm3([LIGHTS[0].d[0], LIGHTS[0].d[1], LIGHTS[0].d[2] + 1]);
  const spec = Math.pow(Math.max(0, dot3(N, H)), 46) * 0.75 * specK;
  return base.map((v) => clamp01(v * d * 0.92 + spec));
}

// facce proiettate (coordinate schermo, prima del fit)
const PROJECTED = [];
for (const f of FACES) {
  if (f.kind === 'front' || f.kind === 'back') {
    const rings = f.rings.map((r) => r.map((p) => project(rot([p[0], p[1], f.z]))));
    const zs = f.rings.flatMap((r) => r.map((p) => rot([p[0], p[1], f.z])[2]));
    PROJECTED.push({ kind: f.kind, rings, z: Math.max(...zs), base: f.base, N: rot([0, 0, 1]), block: f.block, id: 'h' + PROJECTED.length });
    continue;
  }
  const P3 = f.quad3.map(rot);
  let N = norm3(cross3(sub3(P3[1], P3[0]), sub3(P3[3], P3[0])));
  if (dot3(N, rot(norm3(f.hint))) < 0) N = [-N[0], -N[1], -N[2]];
  PROJECTED.push({ kind: f.kind, pts: P3.map(project), z: P3.reduce((s, p) => s + p[2], 0) / 4, base: f.base, N, block: f.block });
}

// il punto «online» è una sfera in rilievo, ancorata al piano frontale
const dotP3 = rot([(806 - 512) / 540, (520 - 296) / 540, zF + 0.05]);
const dotP = project(dotP3);
const dotR = (36 / 540) * (FOC / (CAM - dotP3[2]));

// ─────────────────────────────────────────────── 5. fit nel quadrato
const allPts = PROJECTED.flatMap((f) => (f.rings ? f.rings.flat() : f.pts)).concat([dotP]);
const minX = Math.min(...allPts.map((p) => p[0])), maxX = Math.max(...allPts.map((p) => p[0]));
const minY = Math.min(...allPts.map((p) => p[1])), maxY = Math.max(...allPts.map((p) => p[1]));
const W = SIZE, H = SIZE;
const padX = 0.21 * W, padTop = 0.20 * H, padBot = 0.17 * H;
const sc = Math.min((W - 2 * padX) / (maxX - minX), (H - padTop - padBot) / (maxY - minY));
const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
const TX = (p) => [W / 2 + (p[0] - cx) * sc, H / 2 - (p[1] - cy) * sc];
const fmt = (p) => `${TX(p)[0].toFixed(2)},${TX(p)[1].toFixed(2)}`;
const pathScreen = (pts) => 'M' + pts.map(fmt).join(' L') + ' Z';

// ─────────────────────────────────────────────── 6. disegno
const gidReg = [];

// riflesso (prima: sta dietro a tutto il resto del solido)
let reflectMarkup = '';
if (REFLECT) {
  const baseY = Math.max(...allPts.map((p) => TX(p)[1])) + 4;
  const flip = (p) => [TX(p)[0], baseY * 2 - TX(p)[1]];
  const inner = PROJECTED.slice().sort((a, b) => a.z - b.z).map((f) => {
    const col = hex(f.base.map((v) => v * 0.45 + 0.05));
    if (f.rings) {
      const d = f.rings.map((r) => 'M' + r.map((p) => { const q = flip(p); return `${q[0].toFixed(2)},${q[1].toFixed(2)}`; }).join(' L') + ' Z').join(' ');
      return `<path d="${d}" fill="${col}" fill-rule="evenodd"/>`;
    }
    return `<path d="M${f.pts.map((p) => { const q = flip(p); return `${q[0].toFixed(2)},${q[1].toFixed(2)}`; }).join(' L')} Z" fill="${col}"/>`;
  }).join('');
  reflectMarkup = `<g mask="url(#fadeReflect)">${inner}</g>`;
}

// profondità dei blocchi (media delle loro facce frontali) e ordine: prima il blocco lontano,
// dentro il blocco prima pareti e smussi, poi la faccia frontale — così il foro triangolare
// mostra le sue pareti interne invece di nasconderle.
const blockZ = [0, 1].map((b) => {
  const fs = PROJECTED.filter((f) => f.block === b && f.kind === 'front');
  return fs.reduce((s, f) => s + f.z, 0) / (fs.length || 1);
});
const blockRank = blockZ[0] <= blockZ[1] ? { 0: 0, 1: 1 } : { 0: 1, 1: 0 };
const layerOf = (f) => (f.kind === 'front' ? 2 : 1);
const sorted = PROJECTED.slice().sort((a, b) =>
  blockRank[a.block] - blockRank[b.block] ||
  layerOf(a) - layerOf(b) ||
  a.z - b.z);
const markup = sorted.map((f, idx) => {
  if (f.kind === 'back') return '';
  if (f.kind === 'front') {
    const pts = f.rings.flat().map(TX);
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const top = f.base.map((v) => v + (1 - v) * 0.40);
    const bot = f.base.map((v) => v * 0.70);
    const gid = 'fg' + idx;
    gidReg.push(`<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${(x0 + (x1 - x0) * 0.62).toFixed(1)}" y2="${y1.toFixed(1)}">
      <stop offset="0" stop-color="${hex(top)}"/><stop offset="0.50" stop-color="${hex(f.base)}"/><stop offset="1" stop-color="${hex(bot)}"/></linearGradient>`);
    const outer = pathScreen(f.rings[0]);
    const holes = f.rings.slice(1).map(pathScreen).join(' ');
    if (!holes) return `<path d="${outer}" fill="url(#${gid})"/>`;
    // il foro è una MASCHERA (nero = trasparente): l'evenodd si romperebbe dove il taglio tocca il buco
    const mid = 'm' + (f.id || idx);
    gidReg.push(`<mask id="${mid}"><rect width="${W}" height="${H}" fill="#ffffff"/><path d="${holes}" fill="#000000"/></mask>`);
    return `<path d="${outer}" fill="url(#${gid})" mask="url(#${mid})"/>`;
  }
  if (dot3(f.N, norm3([0, 0, 1])) <= 0.01) return '';            // backface culling
  const col = hex(shade(f.N, f.base, f.kind === 'bevel' ? 0.35 : 1).map((v) => v * (f.kind === 'bevel' ? 0.86 : 1)));
  return `<path d="${pathScreen(f.pts)}" fill="${col}" stroke="${col}" stroke-width="0.9"/>`;
}).filter(Boolean);

const dp = TX(dotP);
const bg = TRANSPARENT ? '' : `
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="${(SIZE * 0.441).toFixed(1)}" fill="none" stroke="#1b2434" stroke-width="${(SIZE * 0.003).toFixed(1)}"/>
  <circle cx="${W / 2}" cy="${H / 2}" r="${(SIZE * 0.40).toFixed(1)}" fill="url(#halo)"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Aion · AI News — marchio in rilievo 3D</title>
  <desc>La A del marchio estrusa: due blocchi con smusso — blu la metà alta, viola la bassa — separati dal taglio a 45 gradi, con luci, pareti laterali e riflesso. La sfera verde «online» è in rilievo sul piano frontale.</desc>
  <defs>
    <radialGradient id="bgGrad" cx="0.5" cy="0.44" r="0.78">
      <stop offset="0" stop-color="#0d1730"/><stop offset="0.55" stop-color="#070b16"/><stop offset="1" stop-color="#04060c"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#4f7bd6" stop-opacity="0.24"/>
      <stop offset="0.55" stop-color="#7a5cff" stop-opacity="0.09"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="dotG" cx="0.35" cy="0.28" r="0.80">
      <stop offset="0" stop-color="#dcfff2"/><stop offset="0.40" stop-color="#5ff0bb"/><stop offset="1" stop-color="#0f9d72"/>
    </radialGradient>
    <radialGradient id="dotHalo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0.42" stop-color="#34d399" stop-opacity="0.26"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fadeReflect" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.80"/>
      <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <mask id="fadeReflect"><rect width="${W}" height="${H}" fill="url(#fadeReflect)"/></mask>
    ${gidReg.join('\n    ')}
  </defs>
  ${bg}
  <g opacity="${REFLECT ? 0.26 : 1}">${reflectMarkup}</g>
  ${markup.join('\n  ')}
  <circle cx="${dp[0].toFixed(1)}" cy="${dp[1].toFixed(1)}" r="${(dotR * sc * 2.6).toFixed(1)}" fill="url(#dotHalo)"/>
  <circle cx="${dp[0].toFixed(1)}" cy="${dp[1].toFixed(1)}" r="${(dotR * sc * 1.00).toFixed(1)}" fill="url(#dotG)"/>
  <circle cx="${dp[0].toFixed(1)}" cy="${dp[1].toFixed(1)}" r="${(dotR * sc * 1.62).toFixed(1)}" fill="none" stroke="#34d399" stroke-opacity="0.18" stroke-width="${(dotR * sc * 0.24).toFixed(1)}"/>
</svg>`;

writeFileSync(OUT + '.svg', svg);
console.log('scritto', OUT + '.svg', (svg.length / 1024).toFixed(1) + ' KB');
