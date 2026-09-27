/**
 * Creazione di archivi ZIP senza dipendenze esterne.
 *
 * Serve perché il tasto «scarica» non deve mai puntare a una cartella: `/api/download` su una
 * directory comprime al volo il contenuto e restituisce un `.zip`. Sul sistema non c'è `zip`,
 * e Node ha già `zlib.deflateRawSync`, che copre il metodo "deflate" (i file che non
 * guadagnano nulla vengono messi in chiaro, metodo "store").
 *
 * Limiti: dimensione totale e numero di file (un archivio costruito in memoria non può
 * crescere senza controllo) e un tetto sui file giganteschi, che restano in "store".
 * L'archivio restituito è deterministico nell'ordine (percorsi ordinati, come `find`).
 */
import { deflateRawSync } from "node:zlib";
import fs from "node:fs/promises";
import path from "node:path";

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
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Data/ora in formato MS-DOS (clamp agli anni rappresentabili: 1980–2107). */
function dosDateTime(date) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = Math.min(2107, Math.max(1980, d.getFullYear()));
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const day = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, day };
}

/**
 * Percorsi di tutti i file regolari dentro `absDir`, relativi alla cartella stessa.
 * Le cartelle vuote si perdono (irrilevante per uno scarico) e **i link simbolici si saltano
 * sempre**: `fs.stat` li seguiva, quindi un link che punta fuori dall'albero faceva finire
 * nell'archivio file estranei (il pacchetto globale raggiunto da `node_modules/…`, 13.647 file)
 * oppure faceva superare il tetto di file su una cartella del tutto normale
 * («troppi file (massimo 3000)» scaricando la cartella del progetto). È la stessa regola che
 * usa la ricerca nei file: nessun symlink, da nessuna parte. `.git` si salta: non è materiale
 * da scaricare.
 */
async function collectFiles(absDir, { maxFiles, maxTotal, root }) {
  const out = [];
  let total = 0;
  const walk = async (dir, prefix) => {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name, "it", { numeric: true }));
    for (const d of dirents) {
      if (d.name === ".git") continue;
      if (d.isSymbolicLink()) continue; // mai seguire: è la via d'uscita dall'albero
      const abs = path.join(dir, d.name);
      const rel = prefix ? `${prefix}/${d.name}` : d.name;
      let st;
      try {
        st = await fs.lstat(abs); // lstat: nessuna risoluzione dei link (difesa in profondità)
      } catch {
        continue; // permessi o file sparito: si salta, l'archivio resta valido
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        await walk(abs, rel);
        continue;
      }
      if (!st.isFile()) continue;
      // il percorso REALE deve stare dentro l'albero richiesto: `abs.startsWith(root)` da solo
      // non basta, perché `abs` è costruito unendo i nomi ed è sempre "dentro" per costruzione
      let real;
      try {
        real = await fs.realpath(abs);
      } catch {
        continue;
      }
      if (real !== root && !real.startsWith(root)) continue;
      if (out.length >= maxFiles) throw new Error(`troppi file (massimo ${maxFiles}): scarica una sottocartella`);
      total += st.size;
      if (total > maxTotal) throw new Error(`cartella troppo grande (oltre ${Math.round(maxTotal / 1048576)} MB): scarica una sottocartella`);
      out.push({ abs, rel, size: st.size, mtime: st.mtime });
    }
  };
  await walk(absDir, "");
  return out;
}

/**
 * Comprime una cartella in un archivio ZIP.
 * @param {string} absDir cartella da comprimere
 * @param {{maxFiles?:number, maxTotal?:number, maxDeflate?:number}} limiti
 * @returns {Promise<{buffer:Buffer, files:number, bytes:number}>}
 */
export async function zipDirectory(absDir, { maxFiles = 3000, maxTotal = 128 * 1024 * 1024, maxDeflate = 8 * 1024 * 1024 } = {}) {
  // il confronto sul confine si fa sul percorso REALE della cartella richiesta (il chiamante lo
  // ha già validato con safeResolve, questo copre anche gli usi diretti del modulo)
  let realDir = absDir;
  try {
    realDir = await fs.realpath(absDir);
  } catch {
    /* cartella sparita: collectFiles restituirà zero file */
  }
  const root = realDir.endsWith(path.sep) ? realDir : realDir + path.sep;
  const entries = await collectFiles(realDir, { maxFiles, maxTotal, root });
  if (!entries.length) return { buffer: Buffer.alloc(0), files: 0, bytes: 0 };

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const name = Buffer.from(e.rel.split(path.sep).join("/"), "utf8");
    const data = await fs.readFile(e.abs);
    // i file già compressi (o enormi) non guadagnano dal deflate: si mettono in chiaro
    let method = 0;
    let payload = data;
    if (data.length <= maxDeflate && data.length > 0) {
      const deflated = deflateRawSync(data, { level: 6 });
      if (deflated.length < data.length) {
        method = 8;
        payload = deflated;
      }
    }
    const crc = crc32(data);
    const { time, day } = dosDateTime(e.mtime);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versione necessaria
    local.writeUInt16LE(0x0800, 6); // nomi in UTF-8
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // nessun campo extra
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // versione del software
    central.writeUInt16LE(20, 6); // versione necessaria
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // commento
    central.writeUInt16LE(0, 34); // disco di partenza
    central.writeUInt16LE(0, 36); // attributi interni
    central.writeUInt32LE(0, 38); // attributi esterni
    central.writeUInt32LE(offset, 42); // posizione dell'header locale
    centrals.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return {
    buffer: Buffer.concat([...locals, centralBuf, eocd]),
    files: entries.length,
    bytes: entries.reduce((n, e) => n + e.size, 0),
  };
}
