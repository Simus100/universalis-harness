/**
 * Immagini generate: nomi, salvataggio, registro dei costi, galleria.
 *
 * Confine: qui c'è solo il disco (e le regole per non uscirne). La rete sta in
 * media/gemini-client.mjs, il contratto verso il modello in media/immagini-tool.mjs,
 * la vista nella dashboard.html.
 *
 * Dove finiscono i file: `<MEDIA_DIR>/immagini/AAAA-MM/`. La cartella è sotto la root della
 * dashboard, quindi il blocco ```img con un percorso relativo la mostra in chat senza
 * copiare byte; la galleria della vista legge la stessa cartella.
 */
import fs from "node:fs/promises";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const MAX_RIFERIMENTO_BYTE = 12 * 1024 * 1024;

/** Estensione dal mime VERO (magic number), non dal nome del file. */
export function mimeImmagine(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  const testa = buf.subarray(0, 32).toString("latin1");
  if (testa.includes("ftyp")) {
    if (testa.includes("avif")) return "image/avif";
    if (testa.includes("heic") || testa.includes("heix")) return "image/heic";
  }
  return null;
}

export function estensionePer(mime) {
  return { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif" }[mime] || ".png";
}

/**
 * Nome file leggibile dal prompt: le prime parole utili, SENZA accenti né simboli, più un
 * suffisso casuale. Un prompt intero in un nome file è illeggibile e può superare i 255 byte.
 */
export function slug(prompt, { max = 48 } = {}) {
  const base = String(prompt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return base || "immagine";
}

function dataCartella(quando = new Date()) {
  const iso = quando.toISOString();
  return iso.slice(0, 7); // AAAA-MM
}

/** Percorso relativo alla root, con separatori POSIX (è quello che si scrive nei blocchi img). */
function rel(rootDir, abs) {
  return relative(rootDir, abs).split(sep).join("/");
}

/**
 * Salva l'immagine generata. Restituisce { assoluto, relativo, byte }.
 * Il nome non sovrascrive mai un file esistente: due generazioni uguali restano due file.
 */
export async function salvaImmagine({ dati, mime, prompt, mediaDir, rootDir, quando = new Date() }) {
  const buf = Buffer.from(String(dati || ""), "base64");
  if (!buf.length) throw new Error("immagine vuota");
  const vero = mimeImmagine(buf);
  if (!vero) throw new Error("i byte ricevuti non sono un'immagine riconoscibile");
  const cartella = join(mediaDir, "immagini", dataCartella(quando));
  await fs.mkdir(cartella, { recursive: true });
  const suffisso = Math.random().toString(36).slice(2, 6);
  const nome = `${quando.toISOString().slice(0, 10)}-${slug(prompt)}-${suffisso}${estensionePer(vero)}`;
  const assoluto = join(cartella, nome);
  await fs.writeFile(assoluto, buf);
  return { assoluto, relativo: rel(rootDir, assoluto), byte: buf.length, mime: vero };
}

/**
 * Registro delle generazioni (JSONL): una riga per richiesta, esito compreso.
 * Sta fuori dal flusso dei token perché un'immagine non si paga a token di testo: senza un
 * registro separato il costo delle immagini non comparirebbe da nessuna parte.
 */
export async function registra(mediaDir, voce) {
  const file = join(mediaDir, "immagini", "registro.jsonl");
  await fs.mkdir(join(mediaDir, "immagini"), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify({ quando: new Date().toISOString(), ...voce })}\n`, "utf8");
}

/** Ultime righe del registro, senza far esplodere la memoria su un file grande. */
export async function ultimeGenerazioni(mediaDir, n = 40) {
  const file = join(mediaDir, "immagini", "registro.jsonl");
  let testo = "";
  try {
    const st = statSync(file);
    const inizio = Math.max(0, st.size - 256 * 1024);
    testo = await new Promise((ok, ko) => {
      const parti = [];
      createReadStream(file, { start: inizio })
        .on("data", (c) => parti.push(c))
        .on("end", () => ok(Buffer.concat(parti).toString("utf8")))
        .on("error", ko);
    });
  } catch {
    return [];
  }
  return testo
    .split("\n")
    .filter((r) => r.trim())
    .map((r) => {
      try {
        return JSON.parse(r);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .slice(-n)
    .reverse();
}

/**
 * Galleria: le immagini della cartella, dalla più recente. Solo file veri (non link), solo
 * dentro `media/immagini`: la vista non deve poter elencare il resto della macchina.
 */
export async function elencoImmagini({ mediaDir, rootDir, max = 60 }) {
  const base = join(mediaDir, "immagini");
  const out = [];
  async function scorri(dir, profondita) {
    if (profondita > 2) return;
    let voci;
    try {
      voci = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const v of voci) {
      const abs = join(dir, v.name);
      if (v.isDirectory()) {
        await scorri(abs, profondita + 1);
        continue;
      }
      if (!v.isFile()) continue;
      if (!/\.(png|jpe?g|webp|gif|avif)$/i.test(v.name)) continue;
      try {
        const st = await fs.stat(abs);
        out.push({ file: rel(rootDir, abs), byte: st.size, mtime: st.mtimeMs });
      } catch {
        /* file sparito mentre si leggeva: pazienza */
      }
    }
  }
  await scorri(base, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, max);
}

/**
 * Immagine di riferimento (editing): legge un file DENTRO la root, con limiti.
 * Restituisce { mime, dati } pronti per `inlineData`.
 */
export function leggiRiferimento(rootDir, percorso) {
  const radice = resolve(rootDir);
  const assoluto = resolve(radice, String(percorso || ""));
  if (assoluto !== radice && !assoluto.startsWith(radice + sep)) {
    throw new Error("percorso fuori dalla cartella di lavoro");
  }
  if (!existsSync(assoluto)) throw new Error(`file non trovato: ${percorso}`);
  const st = statSync(assoluto);
  if (!st.isFile()) throw new Error(`non è un file: ${percorso}`);
  if (st.size > MAX_RIFERIMENTO_BYTE) {
    throw new Error(`immagine troppo grande (${Math.round(st.size / 1048576)} MB, limite ${MAX_RIFERIMENTO_BYTE / 1048576} MB)`);
  }
  const buf = readFileSync(assoluto);
  const mime = mimeImmagine(buf);
  if (!mime) throw new Error(`non è un'immagine: ${percorso}`);
  return { mime, dati: buf.toString("base64") };
}

/**
 * Preferenze della generazione immagini (una per istanza): interruttore e modello scelto.
 * Il default è l'ECONOMICO: la richiesta era «modelli economici salvo richiesta particolare».
 * File su disco e non in memoria: sopravvive al riavvio come le altre preferenze.
 */
const PREFS_FILE = "immagini-prefs.json";
export const PREFS_DEFAULT = { attivo: true, modello: null, formato: "1:1", dimensione: "1K" };

export function leggiPrefs(mediaDir) {
  try {
    const j = JSON.parse(readFileSync(join(mediaDir, PREFS_FILE), "utf8"));
    return { ...PREFS_DEFAULT, ...j };
  } catch {
    return { ...PREFS_DEFAULT };
  }
}

export async function salvaPrefs(mediaDir, patch) {
  const attuali = leggiPrefs(mediaDir);
  const nuove = { ...attuali, ...patch };
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.writeFile(join(mediaDir, PREFS_FILE), `${JSON.stringify(nuove, null, 2)}\n`, "utf8");
  return nuove;
}

export { MAX_RIFERIMENTO_BYTE, extname };
