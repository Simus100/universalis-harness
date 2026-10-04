/**
 * Immagini di prova generate SENZA dipendenze esterne.
 *
 * I test delle immagini servono file veri: un PNG che il browser sa decodificare (il controllo è
 * `naturalWidth > 0`, quindi non basta una firma), più alcune "trappole" (file che fingono di essere
 * immagini) per verificare che il server riconosca il formato dai magic number.
 *
 * Non c'è ImageMagick né ffmpeg su questa macchina: il PNG si costruisce qui (zlib + CRC32),
 * gli altri formati bastano come intestazioni per il controllo dei magic number.
 */
import zlib from "node:zlib";

const TABELLA_CRC = (() => {
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
  for (let i = 0; i < buf.length; i++) c = TABELLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, dati) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dati.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dati]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([len, corpo, crc]);
}

/** PNG RGB vero, decodificabile da qualunque browser. `bande` dipinge righe alternate. */
export function png(w = 24, h = 16, colore = [91, 157, 255]) {
  const riga = Buffer.alloc(1 + w * 3); // byte di filtro (0) + pixel RGB
  for (let x = 0; x < w; x++) {
    riga[1 + x * 3] = colore[0];
    riga[1 + x * 3 + 1] = colore[1];
    riga[1 + x * 3 + 2] = colore[2];
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => riga));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit per canale
  ihdr[9] = 2; // colore: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** GIF: solo l'intestazione, basta al riconoscimento del formato. */
export const gif = () => Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(32)]);

/** JPEG: SOI + APP0 (JFIF), quanto serve per il magic number ffd8ff. */
export const jpeg = () =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
    Buffer.from("JFIF\0", "latin1"),
    Buffer.from([0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ]);

/** WEBP: contenitore RIFF con brand WEBP. */
export const webp = () =>
  Buffer.concat([
    Buffer.from("RIFF", "latin1"),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from("WEBPVP8 ", "latin1"),
    Buffer.alloc(24),
  ]);

/** BMP: firma "BM". */
export const bmp = () => Buffer.concat([Buffer.from("BM", "latin1"), Buffer.alloc(40)]);

/** La trappola: un HTML che finge di essere una foto (estensione .png). */
export const finto = (contenuto = "<!doctype html><html><body>non sono una foto</body></html>") =>
  Buffer.from(contenuto, "utf8");

/** SVG in un file .png: il server deve rimandare al blocco svg, non servirlo come immagine. */
export const svgCamuffato = () =>
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', "utf8");
