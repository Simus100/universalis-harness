/**
 * Lettura ad alta voce — motore TTS locale del server.
 *
 * Perché un modulo e non quattro righe dentro dashboard.mjs: la lettura di un capitolo è un
 * lavoro LUNGO (minuti) e va spezzata, misurata e messa in cache; tenerla separata la rende
 * provabile da riga di comando, che è come è stata messa a punto.
 *
 * Motore: **piper** (voci neurali ONNX, CPU, offline) dentro il venv /opt/piper/venv.
 * Perché non edge-tts (le voci neurali di Azure, le stesse citate nella conversazione di
 * partenza): da QUESTO server risponde 403 al WebSocket di sintesi (IP di datacenter), come già
 * succede ai motori di ricerca. Il backend c'è, è disattivato di default e si prova con
 * `--prova-edge`: se un giorno l'IP cambia, torna disponibile senza riscrivere nulla.
 *
 * Catena di lavorazione, per non far sentire al browser 100 file uno dietro l'altro:
 *   markdown → testo parlato → segmenti (paragrafi) → un WAV per segmento (in parallelo)
 *   → UNA traccia MP3 concatenata + le durate dei segmenti (per l'evidenziazione)
 *
 * La velocità d'ascolto NON si cuoce nell'audio: la fa il browser con playbackRate, così la
 * stessa cache serve 0,75× come 2×. Le voci sono in /opt/piper/voices (vedi VOCI).
 */

import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------- posizioni
const PIPER_BIN = process.env.DASH_TTS_PIPER || "/opt/piper/venv/bin/piper";
const EDGE_BIN = process.env.DASH_TTS_EDGE || "/opt/piper/venv/bin/edge-tts";
const VOCI_DIR = process.env.DASH_TTS_VOICES || "/opt/piper/voices";
// Cache e file esportati seguono la media dir dell'istanza: così un'istanza di prova non scrive
// nella cache della produzione (i test girano con DASH_MEDIA_DIR=/tmp/pi-test/media).
const MEDIA_BASE = process.env.DASH_MEDIA_DIR || "/root/pi-harness/media";
const CACHE_DIR = process.env.DASH_TTS_CACHE || join(MEDIA_BASE, "tts");
const AUDIO_DIR = process.env.DASH_TTS_AUDIO || join(MEDIA_BASE, "audio");
/** Testa della cache: se cambio la lavorazione del testo, i lavori vecchi non vanno riusati. */
const CACHE_V = "1";
/** Oltre questa soglia la cache si pota (le tracce vecchie si possono rigenerare). */
const CACHE_MAX_BYTES = Number(process.env.DASH_TTS_CACHE_MAX || 800 * 1024 * 1024);
/** Processi piper in parallelo: la sintesi è CPU-bound, la macchina ha 6 vCPU. */
const PARALLEL = Number(process.env.DASH_TTS_PARALLEL || 3);
/** Segmenti più corti di così si uniscono al vicino: una traccia da 0,6 s suona spezzata. */
const MIN_SEG_CHARS = 60;
/** Oltre così un segmento si spezza alle frasi (intonazione più stabile). */
const MAX_SEG_CHARS = 480;

// ---------------------------------------------------------------- catalogo voci
/**
 * Voci disponibili. `sesso` serve solo a descriverle; `nota` dice da dove vengono, perché una
 * voce è un dato con una licenza, non un dettaglio tecnico.
 */
export const VOCI = [
  {
    id: "serena",
    nome: "serena (alta qualità)",
    file: "it_IT-serena-high.onnx",
    sesso: "F",
    campione: "22050 Hz",
    motore: "piper",
    velocita: "≈1× realtime",
    nota: "voce italiana piper, modello «high» 114 MB — la più curata, la più lenta da generare",
  },
  {
    id: "paola",
    nome: "paola (media qualità)",
    file: "it_IT-paola-medium.onnx",
    sesso: "F",
    campione: "22050 Hz",
    motore: "piper",
    velocita: "≈3× realtime",
    nota: "voce italiana piper, modello «medium» 63 MB — buon compromesso",
  },
  {
    id: "riccardo",
    nome: "riccardo (maschile, leggera)",
    file: "it_IT-riccardo-x_low.onnx",
    sesso: "M",
    campione: "16000 Hz",
    motore: "piper",
    velocita: "≈11× realtime",
    nota: "unica voce MASCHILE italiana con licenza libera: modello «x_low», timbro più povero",
  },
  {
    id: "diego",
    nome: "diego (neurale Azure)",
    file: null,
    voceEdge: "it-IT-DiegoNeural",
    sesso: "M",
    campione: "24 kHz",
    motore: "edge",
    velocita: "≈5× realtime",
    nota: "la più naturale, ma richiede la rete e da questo IP Azure risponde 403: opzione di riserva",
  },
];

export function voce(id) {
  return VOCI.find((v) => v.id === id) || VOCI[0];
}

// ---------------------------------------------------------------- testo parlato

/** Toglie i blocchi che non si leggono ad alta voce (codice, tabelle, disegni, frontmatter). */
function testoParlato(md) {
  let t = String(md || "");
  // frontmatter YAML in testa
  t = t.replace(/^---\n[\s\S]*?\n---\n/, "");
  // blocchi di codice: quelli lunghi diventano un accenno, i brevi si leggono
  t = t.replace(/(^|\n)[ \t]{0,3}(`{3,})([^\n]*)\n([\s\S]*?)\n[ \t]{0,3}\2[ \t]*(?=\n|$)/g, (m, a, fence, lang, corpo) => {
    const righe = corpo.split("\n").filter((r) => r.trim()).length;
    const l = String(lang || "").trim().toLowerCase();
    if (l === "svg" || l === "html" || l === "css" || l === "js" || l === "mjs" || l === "json" || l === "bash" || l === "sh") {
      return a + "\n(blocco di codice)\n";
    }
    if (righe > 2) return a + "\n(blocco di codice)\n";
    return a + "\n" + corpo + "\n";
  });
  // blocchi mai chiusi (streaming interrotto): dal primo ``` in poi non si legge
  t = t.replace(/(^|\n)[ \t]{0,3}`{3,}[\s\S]*$/, "\n");
  // immagini: si annuncia che ci sono, non si legge l'URL
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, (m, alt) => (alt ? ` (immagine: ${alt}) ` : " (immagine) "));
  // link: resta il testo
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // tabelle (due o più righe di fila): non si leggono, si annunciano
  t = t.replace(/(^|\n)([ \t]*\|.*\|[ \t]*\n){2,}/g, "$1(tabella)\n");
  // righe di soli simboli (---, ***, ___) → pausa
  t = t.replace(/^[ \t]*([-*_=]\s*){3,}$/gm, "\n");
  // intestazioni, citazioni, elenchi: via i marcatori
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "");
  t = t.replace(/^[ \t]{0,3}>[ \t]?/gm, "");
  t = t.replace(/^[ \t]{0,3}([-*+]|\d{1,3}[.)])[ \t]+/gm, "");
  // enfasi e codice inline
  t = t.replace(/(\*\*|__|\*|_|`)/g, "");
  // emoji e simboli decorativi: espeak li salta o li storpia
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, " ");
  // entità HTML frequenti
  t = t.replace(/&nbsp;/g, " ").replace(/&amp;/g, "e").replace(/&lt;/g, "minore di ").replace(/&gt;/g, "maggiore di ");
  // spazi e righe vuote in eccesso
  t = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

/** Spezza un testo lungo alle frasi, senza superare `MAX_SEG_CHARS` quando si può. */
function spezzaFrasi(par) {
  if (par.length <= MAX_SEG_CHARS) return [par];
  const frasi = par.match(/[^.!?…]+[.!?…]+[»")]*\s*|[^.!?…]+$/g) || [par];
  const out = [];
  let cur = "";
  for (const f of frasi) {
    if (cur && (cur + f).length > MAX_SEG_CHARS) {
      out.push(cur.trim());
      cur = f;
    } else {
      cur += f;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Segmenta il testo: un segmento per paragrafo (spezzato se lunghissimo, unito al vicino se
 * troppo corto). I segmenti sono l'unità dell'evidenziazione a schermo E della sintesi.
 */
export function segmenta(testo) {
  const paragrafi = String(testo || "")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter((p) => p.length > 0);
  const grezzi = [];
  for (const p of paragrafi) for (const s of spezzaFrasi(p)) grezzi.push(s);
  // fusione dei frammenti corti: un dialogo di due parole non merita una traccia da 0,6 s
  const out = [];
  for (const s of grezzi) {
    const ultimo = out[out.length - 1];
    if (ultimo && (s.length < MIN_SEG_CHARS || ultimo.length < MIN_SEG_CHARS) && ultimo.length + s.length + 1 <= MAX_SEG_CHARS) {
      out[out.length - 1] = ultimo + " " + s;
    } else {
      out.push(s);
    }
  }
  return out;
}

// ---------------------------------------------------------------- WAV e MP3

/** Durata di un WAV PCM leggendo l'header (niente ffprobe per ogni segmento). */
function durataWav(buf) {
  if (buf.length < 44 || buf.subarray(0, 4).toString("latin1") !== "RIFF") return 0;
  let off = 12;
  let byteRate = 0;
  let dataSize = 0;
  while (off + 8 <= buf.length) {
    const id = buf.subarray(off, off + 4).toString("latin1");
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(off + 16);
    else if (id === "data") {
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!byteRate || !dataSize) return 0;
  return dataSize / byteRate;
}

/** Unisce più WAV PCM identici in un solo WAV (usato quando ffmpeg non c'è). */
function concatWav(buffers) {
  const primo = buffers[0];
  const parti = [];
  for (const b of buffers) {
    let off = 12;
    while (off + 8 <= b.length) {
      const id = b.subarray(off, off + 4).toString("latin1");
      const size = b.readUInt32LE(off + 4);
      if (id === "data") {
        parti.push(b.subarray(off + 8, off + 8 + size));
        break;
      }
      off += 8 + size + (size % 2);
    }
  }
  const dati = Buffer.concat(parti);
  const testa = Buffer.from(primo.subarray(0, 44));
  testa.writeUInt32LE(36 + dati.length, 4);
  testa.writeUInt32LE(dati.length, 40);
  return Buffer.concat([testa, dati]);
}

function esegui(bin, args, { timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = String(stderr || "").slice(-800);
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Pool di promesse con concorrenza fissa: `fatti` cresce per far vedere l'avanzamento. */
async function inParallelo(elementi, concorrenza, lavoro, onProgress) {
  let i = 0;
  let fatti = 0;
  const operai = Array.from({ length: Math.min(concorrenza, elementi.length) }, async () => {
    while (true) {
      const mio = i++;
      if (mio >= elementi.length) return;
      await lavoro(elementi[mio], mio);
      onProgress?.(++fatti);
    }
  });
  await Promise.all(operai);
}

// ---------------------------------------------------------------- sintesi

export function statoMotore() {
  const piperOk = existsSync(PIPER_BIN);
  let ffmpeg = null;
  try {
    ffmpeg = execFileSync("ffmpeg", ["-version"], { encoding: "utf8", timeout: 5000 }).split("\n")[0];
  } catch {
    ffmpeg = null;
  }
  return {
    piper: piperOk,
    piperBin: PIPER_BIN,
    vociDir: VOCI_DIR,
    ffmpeg: Boolean(ffmpeg),
    ffmpegVersione: ffmpeg,
    edge: existsSync(EDGE_BIN),
    cache: CACHE_DIR,
    parallelo: PARALLEL,
    voci: VOCI.map((v) => ({
      ...v,
      disponibile: v.motore === "piper" ? existsSync(join(VOCI_DIR, v.file)) : existsSync(EDGE_BIN),
    })),
  };
}

/** Chiave di cache: dipende da voce, lavorazione del testo e VERSIONE del testo parlato. */
function chiave(voceId, testo) {
  return createHash("sha256").update(`v${CACHE_V}|${voceId}|${testo}`).digest("hex").slice(0, 24);
}

/** Sintetizza UN segmento: ritorna il percorso del WAV (piper) o dell'MP3 (edge). */
async function sintetizzaSegmento(v, testo, dir, n) {
  if (v.motore === "edge") {
    const out = join(dir, `seg-${String(n).padStart(4, "0")}.mp3`);
    await esegui(EDGE_BIN, ["--voice", v.voceEdge, "--text", testo, "--write-media", out]);
    return out;
  }
  const modello = join(VOCI_DIR, v.file);
  const out = join(dir, `seg-${String(n).padStart(4, "0")}.wav`);
  const inp = join(dir, `seg-${String(n).padStart(4, "0")}.txt`);
  await fs.writeFile(inp, testo, "utf8");
  await esegui(PIPER_BIN, ["-m", modello, "-f", out, "-i", inp]);
  await fs.unlink(inp).catch(() => {});
  return out;
}

/**
 * Genera (o recupera dalla cache) la lettura di un testo.
 *
 * @param {{testo:string, voceId?:string, onProgress?:(fatti:number,totali:number)=>void}} op
 * @returns {Promise<{id:string, voce:string, audio:string, durata:number, segmenti:Array, cache:string}>}
 */
export async function sintetizza({ testo, voceId = "serena", onProgress } = {}) {
  const v = voce(voceId);
  const parlato = testoParlato(testo);
  if (!parlato) throw new Error("niente da leggere: il testo è vuoto o contiene solo codice");
  const segmenti = segmenta(parlato);
  if (!segmenti.length) throw new Error("niente da leggere");
  const id = chiave(v.id, parlato);
  const dir = join(CACHE_DIR, id);
  const metaFile = join(dir, "meta.json");

  // cache: se il lavoro è completo si riusa così com'è (la seconda volta è istantanea)
  if (existsSync(metaFile)) {
    try {
      const meta = JSON.parse(readFileSync(metaFile, "utf8"));
      if (meta.id === id && meta.testo === parlato && existsSync(join(dir, meta.audio))) {
        return { ...meta, cache: "riusata" };
      }
    } catch {
      /* cache illeggibile: si rigenera */
    }
  }

  await fs.mkdir(dir, { recursive: true });
  for (const f of await fs.readdir(dir).catch(() => [])) {
    if (/^seg-\d+\.(wav|mp3|txt)$/.test(f)) await fs.unlink(join(dir, f)).catch(() => {});
  }

  // 1. sintesi dei segmenti, in parallelo
  const file = [];
  await inParallelo(
    segmenti,
    PARALLEL,
    async (s, i) => {
      file[i] = await sintetizzaSegmento(v, s, dir, i);
    },
    (fatti) => onProgress?.(fatti, segmenti.length),
  );

  // 2. durate dei segmenti (per l'evidenziazione) e confine di ciascuno sulla traccia unita
  let durate = [];
  if (v.motore === "edge") {
    for (const f of file) {
      try {
        const out = await esegui("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]);
        durate.push(Number(String(out.stdout).trim()) || 0);
      } catch {
        durate.push(0);
      }
    }
  } else {
    for (const f of file) durate.push(durataWav(await fs.readFile(f)));
  }

  // 3. un'unica traccia: MP3 (piccolo, adatto al telefono) se c'è ffmpeg, altrimenti WAV
  let audio = "audio.mp3";
  let haFfmpeg = true;
  try {
    const lista = join(dir, "lista.txt");
    await fs.writeFile(lista, file.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
    if (v.motore === "edge") {
      await esegui("ffmpeg", ["-v", "error", "-f", "concat", "-safe", "0", "-i", lista, "-c:a", "libmp3lame", "-b:a", "48k", "-ar", "24000", "-ac", "1", join(dir, "audio.mp3"), "-y"]);
    } else {
      // `volume=-1.5dB`: piper normalizza a piena scala (picco a 0 dB) e il codificatore MP3, su
      // quel picco, può distorcere. Un dB e mezzo di margine non si sente e toglie il rischio.
      await esegui("ffmpeg", ["-v", "error", "-f", "concat", "-safe", "0", "-i", lista, "-af", "volume=-1.5dB", "-c:a", "libmp3lame", "-b:a", "48k", "-ar", "22050", "-ac", "1", join(dir, "audio.mp3"), "-y"]);
    }
    await fs.unlink(lista).catch(() => {});
  } catch {
    haFfmpeg = false;
    if (v.motore === "edge") throw new Error("ffmpeg non disponibile: le voci edge-tts sono MP3 e vanno concatenate con ffmpeg");
    audio = "audio.wav";
    const bufs = [];
    for (const f of file) bufs.push(await fs.readFile(f));
    await fs.writeFile(join(dir, audio), concatWav(bufs));
  }

  // 4. i segmenti non servono più: resta la traccia unita e il manifest con le durate
  for (const f of file) await fs.unlink(f).catch(() => {});

  const segmentiManifest = [];
  let t = 0;
  segmenti.forEach((s, i) => {
    const d = durate[i] || 0;
    segmentiManifest.push({ i, inizio: Number(t.toFixed(3)), fine: Number((t + d).toFixed(3)), testo: s });
    t += d;
  });
  const meta = {
    id,
    voce: v.id,
    voceNome: v.nome,
    motore: v.motore,
    rate: haFfmpeg ? "48k mono" : "PCM",
    audio,
    durata: Number(t.toFixed(3)),
    caratteri: parlato.length,
    segmenti: segmentiManifest,
    creato: new Date().toISOString(),
    testo: parlato,
  };
  await fs.writeFile(metaFile, JSON.stringify(meta), "utf8");
  podaCache().catch(() => {});
  return { ...meta, cache: "nuova" };
}

/** Traccia audio di un lavoro: percorso assoluto, o null se non c'è. */
export function percorsoAudio(id, fileAudio) {
  if (!/^[a-f0-9]{24}$/.test(String(id || ""))) return null;
  const p = join(CACHE_DIR, id, basename(fileAudio || "audio.mp3"));
  return existsSync(p) ? p : null;
}

/** Legge il manifest di un lavoro in cache (o null). */
export function leggiMeta(id) {
  if (!/^[a-f0-9]{24}$/.test(String(id || ""))) return null;
  const p = join(CACHE_DIR, id, "meta.json");
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** Copia la traccia in media/audio con un nome leggibile: è il file che si porta via. */
export async function esporta(id, nomeScelto, metaPassato) {
  const meta = metaPassato || leggiMeta(id);
  const sorgente = percorsoAudio(id, meta?.audio);
  if (!sorgente) throw new Error("traccia non trovata");
  const est = extname(sorgente) || ".mp3";
  const base = (nomeScelto ? basename(nomeScelto, extname(nomeScelto)) : `lettura-${id.slice(0, 8)}`)
    .replace(/[^\w\u00C0-\u024F .-]+/g, "")
    .trim() || `lettura-${id.slice(0, 8)}`;
  await fs.mkdir(AUDIO_DIR, { recursive: true });
  const dest = join(AUDIO_DIR, `${base}${est}`);
  await fs.copyFile(sorgente, dest);
  return dest;
}

/** Potatura della cache: per età, quando supera il tetto. */
export async function podaCache() {
  const voci = await fs.readdir(CACHE_DIR, { withFileTypes: true }).catch(() => []);
  const lavori = [];
  let totale = 0;
  for (const v of voci) {
    if (!v.isDirectory()) continue;
    const dir = join(CACHE_DIR, v.name);
    let peso = 0;
    let mtime = 0;
    for (const f of await fs.readdir(dir).catch(() => [])) {
      try {
        const st = statSync(join(dir, f));
        peso += st.size;
        mtime = Math.max(mtime, st.mtimeMs);
      } catch {}
    }
    lavori.push({ dir, peso, mtime });
    totale += peso;
  }
  if (totale <= CACHE_MAX_BYTES) return { totale, rimossi: 0 };
  lavori.sort((a, b) => a.mtime - b.mtime);
  let rimossi = 0;
  for (const l of lavori) {
    if (totale <= CACHE_MAX_BYTES * 0.8) break;
    await fs.rm(l.dir, { recursive: true, force: true }).catch(() => {});
    totale -= l.peso;
    rimossi++;
  }
  return { totale, rimossi };
}

/** Elenco dei lavori in cache, dal più recente. */
export async function elencoCache() {
  const voci = await fs.readdir(CACHE_DIR, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const v of voci) {
    if (!v.isDirectory()) continue;
    try {
      const m = JSON.parse(readFileSync(join(CACHE_DIR, v.name, "meta.json"), "utf8"));
      out.push({ id: m.id, voce: m.voce, durata: m.durata, caratteri: m.caratteri, creato: m.creato, estratto: m.segmenti?.[0]?.testo?.slice(0, 90) || "" });
    } catch {}
  }
  out.sort((a, b) => String(b.creato).localeCompare(String(a.creato)));
  return out;
}

/** Legge un file di testo dal disco e ne restituisce il contenuto (per la lettura da percorso). */
export async function leggiFile(percorso) {
  const testo = await fs.readFile(percorso, "utf8");
  return testo;
}

// ---------------------------------------------------------------- prova da CLI
if (process.argv[1] && process.argv[1].endsWith("tts.mjs")) {
  const args = process.argv.slice(2);
  const prendi = (nome, def) => {
    const i = args.indexOf("--" + nome);
    return i >= 0 ? args[i + 1] : def;
  };
  const fileTesto = prendi("file", null);
  const nome = prendi("nome", null);
  const voceId = prendi("voce", "serena");
  if (args.includes("--stato") || (!fileTesto && !nome)) {
    console.log(JSON.stringify(statoMotore(), null, 2));
    process.exit(0);
  }
  const md = fileTesto ? await fs.readFile(fileTesto, "utf8") : await fs.readFile(nome, "utf8");
  const t0 = Date.now();
  const base = basename(fileTesto || nome, extname(fileTesto || nome));
  const r = await sintetizza({ testo: md, voceId, onProgress: (f, t) => process.stderr.write(`\rsegmenti ${f}/${t}`) });
  process.stderr.write("\n");
  const dest = await esporta(r.id, base, r);
  console.log(JSON.stringify({ ...r, testo: undefined, file: dest, secondiGenerazione: Number(((Date.now() - t0) / 1000).toFixed(1)) }, null, 2));
}
