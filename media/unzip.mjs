/**
 * Estrazione di archivi ZIP senza dipendenze esterne.
 *
 * Serve per importare una SKILL COMPLETA (standard Agent Skills): una cartella con
 * `SKILL.md` più file di supporto (`references/`, `scripts/`, esempi), che l'upload di un
 * singolo `.md` non permetteva. Sul sistema non c'è `unzip`, e aggiungere una dipendenza
 * di sistema per questo sarebbe sproporzionato: Node ha già `zlib.inflateRawSync`, che è
 * tutto ciò che serve per il metodo "deflate".
 *
 * Sicurezza: si limita la dimensione di ogni file e del totale, il numero di file, e si
 * rifiutano i metodi di compressione non supportati. La sanificazione dei percorsi (niente
 * `..`, niente percorsi assoluti, niente symlink) la fa il chiamante sul nome restituito.
 */
import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/**
 * @param {Buffer} buf contenuto del file .zip
 * @param {{maxFiles?:number, maxTotal?:number, maxSingle?:number}} limiti
 * @returns {{name:string, data:Buffer}[]} voci regolari (le cartelle sono saltate)
 */
export function extractZip(buf, { maxFiles = 300, maxTotal = 12 * 1024 * 1024, maxSingle = 3 * 1024 * 1024 } = {}) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("archivio non valido (troppo piccolo)");

  // End Of Central Directory: si cerca dal fondo (può essere seguito da un commento)
  let eocd = -1;
  const from = Math.max(0, buf.length - 66000);
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("archivio zip non valido (indice finale non trovato)");

  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0) throw new Error("archivio vuoto");
  if (count > maxFiles) throw new Error(`archivio con troppi file (${count}, massimo ${maxFiles})`);
  if (cdOffset >= buf.length) throw new Error("archivio corrotto (indice fuori dal file)");

  const out = [];
  let total = 0;
  let p = cdOffset;

  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CD_SIG) throw new Error("archivio corrotto (elenco centrale)");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // cartella: le cartelle si creano dai percorsi dei file
    if (uncompSize > maxSingle) throw new Error(`file troppo grande nell'archivio: ${name}`);
    total += uncompSize;
    if (total > maxTotal) throw new Error("contenuto troppo grande una volta estratto");

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new Error(`archivio corrotto (intestazione di ${name})`);
    }
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = Buffer.from(comp); // memorizzato senza compressione
    } else if (method === 8) {
      data = inflateRawSync(comp); // deflate
    } else {
      throw new Error(`compressione non supportata (metodo ${method}) in ${name}`);
    }
    out.push({ name, data });
  }

  return out;
}

/**
 * Normalizza il percorso interno all'archivio e rifiuta quelli pericolosi.
 * Restituisce null per le voci da scartare.
 */
export function safeEntryPath(rawName) {
  const n = String(rawName).replace(/\\/g, "/").replace(/^\.\//, "");
  if (!n || n.endsWith("/")) return null;
  if (n.startsWith("/") || /^[a-zA-Z]:/.test(n)) return null; // percorso assoluto
  const parts = n.split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) return null; // risalita di cartella
  if (parts.includes(".git")) return null;
  if (parts.length > 6) return null; // struttura troppo profonda
  return parts.join("/");
}
