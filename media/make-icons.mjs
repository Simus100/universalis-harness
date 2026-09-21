/**
 * Genera le icone PWA (PNG + ICO) senza dipendenze: PNG scritto a mano con zlib.
 * Uso: node media/make-icons.mjs [outDir]
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/root/pi-harness/assets";
mkdirSync(OUT, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filtro none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const A = [0x5b, 0x9d, 0xff]; // accento blu
const B = [0x8b, 0x5c, 0xff]; // accento viola
const GLYPH = [0x08, 0x11, 0x1f];

function isPi(x, y, s) {
  const fx = x / s, fy = y / s;
  if (fy >= 0.26 && fy <= 0.36 && fx >= 0.20 && fx <= 0.80) return true; // barra
  if (fy > 0.36 && fy <= 0.76 && fx >= 0.30 && fx <= 0.40) return true; // gamba sx
  if (fy > 0.36 && fy <= 0.76 && fx >= 0.60 && fx <= 0.70) return true; // gamba dx
  return false;
}

function drawIcon(size) {
  const SS = 4; // supersampling
  const big = size * SS;
  const buf = Buffer.alloc(size * size * 4);
  const radius = big * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx, py = y * SS + sy;
          // angoli arrotondati
          let inside = true;
          const cx = Math.min(Math.max(px, radius), big - radius);
          const cy = Math.min(Math.max(py, radius), big - radius);
          const dx = px - cx, dy = py - cy;
          if (dx * dx + dy * dy > radius * radius) inside = false;
          if (!inside) continue;
          let col;
          if (isPi(px, py, big)) col = GLYPH;
          else {
            const t = (px / big) * 0.55 + (py / big) * 0.45;
            col = [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t));
          }
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(r / n);
      buf[i + 1] = Math.round(g / n);
      buf[i + 2] = Math.round(b / n);
      buf[i + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, buf);
}

function ico(pngBuf, size) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir[0] = size >= 256 ? 0 : size;
  dir[1] = size >= 256 ? 0 : size;
  dir[2] = 0;
  dir[3] = 0;
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(pngBuf.length, 8);
  dir.writeUInt32LE(22, 12);
  return Buffer.concat([head, dir, pngBuf]);
}

const targets = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
];
for (const [name, size] of targets) {
  writeFileSync(`${OUT}/${name}`, drawIcon(size));
  console.log("scritto", `${OUT}/${name}`);
}
writeFileSync(`${OUT}/favicon.ico`, ico(drawIcon(32), 32));
console.log("scritto", `${OUT}/favicon.ico`);
