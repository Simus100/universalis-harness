/**
 * Memoria a lungo termine dell'harness — fondamenta.
 *
 * Questo modulo non contiene logica di memoria: contiene solo le decisioni che, se prese
 * in un punto solo, non possono divergere fra i pezzi (l'indice, il grafo, la wiki, la
 * vista). Le tre che contano:
 *
 *  1. DOVE vive la memoria: `media/memoria/`. Fuori dal versionamento, sempre: il repo è
 *     PUBBLICO e l'indice concentra estratti di tutto il lavoro in un file solo. La
 *     memoria non si pubblica mai; si pubblicano il codice e le skill che la usano.
 *  2. COME si scrive un file: sempre su `.tmp` + rename atomico. Un indice scritto a metà
 *     (processo ucciso, disco pieno) è peggio di un indice assente: la ricerca risponderebbe
 *     con un corpus troncato senza accorgersene.
 *  3. COME si normalizza il testo e come si stima il costo: una sola implementazione, così
 *     indicizzazione e ricerca non possono divergere sui termini (è il difetto classico:
 *     si indicizza con una tokenizzazione e si cerca con un'altra).
 *
 * La stima dei token è deliberatamente grossolana (~4 caratteri per token): serve a
 * DECIDERE COSA TAGLIARE, non a fatturare. Loro hanno misurato 982 token reali contro 730
 * stimati: per questo il budget si verifica sempre sul testo renderizzato (vedi `potare`).
 */
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, extname, basename, sep } from "node:path";

/** Radice dell'harness: `media/memoria/` → su due livelli. */
export const ROOT = dirname(dirname(dirname(new URL(import.meta.url).pathname)));
/** Dove vivono i file della memoria (mai versionati). */
export const MEM_DIR = join(ROOT, "media", "memoria");
export const EPISODI_DIR = join(MEM_DIR, "episodi");
export const WIKI_DIR = join(MEM_DIR, "wiki");
export const INDICE_FILE = join(MEM_DIR, "indice.json");
export const GRAFO_FILE = join(MEM_DIR, "grafo.json");
export const STATO_FILE = join(MEM_DIR, "stato.json");
export const DIALOGO_FILE = join(MEM_DIR, "dialogo.jsonl");

/** Approssimazione dichiarata: non è un tokenizzatore, è un metro per tagliare. */
export const CHAR_PER_TOKEN = 4;

export function stimaToken(testo) {
  return Math.max(1, Math.ceil(String(testo ?? "").length / CHAR_PER_TOKEN));
}

// ---------------------------------------------------------------- normalizzazione

/**
 * Minuscolo senza accenti: «Analisi» e «analisí» devono coincidere. La stessa funzione
 * serve l'indice, la ricerca e i nomi dei nodi del grafo.
 */
export function normalizza(testo) {
  return String(testo ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Stopword italiane + inglesi essenziali: tolgono rumore senza toccare i termini tecnici. */
export const STOPWORD = new Set(
  `a ai al alla alle allo agli anche ancora avere aveva avevano c che chi ci cio coi col come con
cosa cui da dal dalla dalle dallo dagli dei del della delle dello degli di do dopo dove due e ed
essere fa fare fino fra gli ha hanno ho i il in io la le le lei li lo loro ma me mi mia mie mio miei
ne negli nei nel nella nelle nello no noi non nostra nostro o od ogni oltre per perche piu po
qual quale quali quando quanto quel quella quelle quelli quello questa queste questi questo qui
se sei senza si sia siamo sono sta stata stato su sua sue sui sul sulla sulle sullo suo suoi ti
tra tu tua tue tuo tuoi tutti tutto un una uno vi voi
a an and are as at be by for from has have in is it its of on or that the this to was were will with`
    .split(/\s+/)
    .filter(Boolean),
);

/** Token significativi: ≥3 caratteri, senza stopword. Una sola implementazione per tutti. */
export function tokenizza(testo) {
  return normalizza(testo)
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 3 && !STOPWORD.has(t));
}

/** Identificatore stabile per un nodo: usabile come nome di file. */
export function slug(testo, max = 60) {
  const s = normalizza(testo)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
  return s || "nodo";
}

/** Percorso relativo alla radice, con separatori `/` (schema stabile, indipendente dall'OS). */
export function normalizzaRel(p) {
  return String(p ?? "").split(sep).join("/");
}

export function relativo(p) {
  return relative(ROOT, p).split(sep).join("/");
}


// ---------------------------------------------------------------- scrittura sicura

/** Scrittura atomica: `.tmp` e rename. Un file a metà è un guasto silenzioso. */
export async function scriviAtomico(path, contenuto) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  await writeFile(tmp, contenuto, "utf8");
  await rename(tmp, path);
}

export async function leggiTesto(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function leggiJson(path, fallback = null) {
  const t = await leggiTesto(path);
  if (t === null) return fallback;
  try {
    return JSON.parse(t);
  } catch {
    return fallback;
  }
}

export async function scriviJson(path, valore) {
  await scriviAtomico(path, JSON.stringify(valore, null, 1) + "\n");
}

/**
 * Elenco di file sotto `dir`, con estensioni ammesse ed esclusioni.
 * `ricorsivo: false` serve alle sorgenti "solo primo livello" (media/): senza, si
 * scandirebbe l'intero sottoalbero per poi buttarlo via.
 */
export async function elencaFile(dir, { est = [".md", ".txt", ".json"], escludi = [], max = 20000, ricorsivo = true } = {}) {
  const fuori = [];
  const coda = [dir];
  while (coda.length && fuori.length < max) {
    const d = coda.shift();
    let voci;
    try {
      voci = await readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const v of voci) {
      const p = join(d, v.name);
      const rel = normalizzaRel(relativo(p));
      if (escludi.some((e) => rel === e || rel.startsWith(e + "/") || rel.includes(`/${e}/`))) continue;
      if (v.isDirectory()) {
        if (ricorsivo) coda.push(p);
      } else if (v.isFile() && est.includes(extname(v.name))) fuori.push(p);
    }
  }
  return fuori;
}

export async function meta(path) {
  try {
    const s = await stat(path);
    return { mtime: Math.round(s.mtimeMs), size: s.size, cartella: s.isDirectory() };
  } catch {
    return null;
  }
}

/** Un percorso è una cartella? (decide se una sorgente va scandita o solo letta) */
export async function eCartella(path) {
  const m = await meta(path);
  return !!m?.cartella;
}

export async function rimuovi(path) {
  try {
    await unlink(path);
  } catch {
    /* già assente */
  }
}

// ---------------------------------------------------------------- budget

/**
 * Pota una struttura il cui peso è dato dal suo `render`, finché rientra nel budget.
 *
 * PERCHÉ COSÌ: sommare il costo dei singoli pezzi ignora l'impalcatura (titoli, percorsi,
 * intestazioni) e sfora sempre. Si misura il testo che verrà davvero consegnato al modello
 * e si toglie dalla CODA — che è la parte meno pertinente — un elemento per volta.
 */
export function potare(budget, render, liste) {
  let testo = render();
  let costoTok = stimaToken(testo);
  while (costoTok > budget) {
    const piena = [...liste].reverse().find((l) => l.array.length > l.minimo);
    if (!piena) break;
    piena.array.pop();
    testo = render();
    costoTok = stimaToken(testo);
  }
  return costoTok;
}

export function oggi() {
  return new Date().toISOString().slice(0, 10);
}

export function adesso() {
  return new Date().toISOString();
}

/** Nome file leggibile e stabile da una data e da un titolo. */
export function nomeEpisodio(data, titolo, id) {
  const breve = id ? String(id).slice(0, 8) : "";
  return `${data}-${slug(titolo, 40)}${breve ? "-" + breve : ""}.md`;
}

export { existsSync };
