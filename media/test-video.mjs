#!/usr/bin/env node
/**
 * TEST DEI VIDEO — lato server (rotta /api/video).
 *
 * Verifica quello che rende guardabile un video dentro la chat:
 *  - il formato è riconosciuto dai MAGIC NUMBER, non dall'estensione (un HTML rinominato .mp4
 *    viene rifiutato con un motivo, non servito; un AVIF — che usa lo stesso contenitore `ftyp`
 *    dei video — non passa per video);
 *  - le richieste PARZIALI (Range) sono servite davvero: 206 con la fascia giusta, la coda con
 *    `bytes=-N`, 416 fuori dalla fine. Senza queste la barra del tempo non funziona;
 *  - i byte serviti sono IDENTICI all'originale (confronto sha256 sull'intero file);
 *  - `?meta=1` non scarica nulla e dice formato, peso e se il browser può riprodurlo;
 *  - i percorsi fuori dalla root e i file inesistenti sono respinti con messaggi parlanti;
 *  - il tetto per l'anteprima (DASH_VIDEO_MAX_BYTES) dà 413 con l'indicazione di scaricarlo.
 *
 * Istanza isolata (porta dedicata, root e media temporanei), nessuna rete, nessun modello.
 * I video di prova veri nascono con ffmpeg; se ffmpeg non c'è, i test che richiedono un file
 * davvero riproducibile lo dichiarano e si appoggiano a un MP4 sintetico con header valido.
 *
 * Uso: node media/test-video.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const ROOTDIR = "/root/pi-harness";
const PORT = 8498;
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = "Basic " + Buffer.from("vt:vt").toString("base64");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-video-api-"));
// media/ sta DENTRO la root, come in produzione (ROOT=/root, MEDIA=/root/pi-harness/media):
// i percorsi che l'agente scrive nei blocchi sono relativi alla root o alla cartella di lavoro.
const ROOT = TMP;
const MEDIA = path.join(TMP, "media");
const LIMITE = 60 * 1024; // tetto di prova per l'anteprima (byte)

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, extra = "") => (c ? ok(d) : ko(`${d}${extra ? ` — ${extra}` : ""}`));

/* ---------------- materiale di prova ---------------- */
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(path.join(MEDIA, "cartella"), { recursive: true });
fs.mkdirSync(path.join(TMP, "sessions"), { recursive: true });
fs.mkdirSync(path.join(TMP, "skills"), { recursive: true });

const PROVA = path.join(MEDIA, "prova.mp4");
let ffmpeg = true;

/** MP4 sintetico: header `ftyp` valido e poi zeri. Basta allo sniffing, non alla riproduzione. */
function mp4Sintetico(file, byte = 8192) {
  const ftyp = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftyp", "latin1"),
    Buffer.from("isom", "latin1"),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from("isomiso2avc1mp41", "latin1"),
  ]);
  fs.writeFileSync(file, Buffer.concat([ftyp, Buffer.alloc(byte)]));
}

function ffmpegFile(file, args) {
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", ...args, "-y", file], { timeout: 120_000 });
}

try {
  ffmpegFile(PROVA, ["-i", "testsrc=size=160x120:rate=10:duration=2", "-pix_fmt", "yuv420p"]);
  ffmpegFile(path.join(MEDIA, "clip.webm"), ["-i", "testsrc=size=160x120:rate=10:duration=1", "-c:v", "libvpx-vp9", "-b:v", "150k", "-an"]);
  ffmpegFile(path.join(MEDIA, "clip.mov"), ["-i", "testsrc=size=160x120:rate=10:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
} catch (e) {
  console.log(`  (ffmpeg non disponibile o fallito: uso MP4 sintetici — ${String(e.message).slice(0, 80)})`);
  ffmpeg = false;
  mp4Sintetico(PROVA);
  mp4Sintetico(path.join(MEDIA, "clip.webm"));
  mp4Sintetico(path.join(MEDIA, "clip.mov"));
}

// trappole
fs.writeFileSync(path.join(MEDIA, "finto.mp4"), "<!doctype html><html><body>non sono un video</body></html>");
fs.writeFileSync(path.join(MEDIA, "nota.txt"), "solo testo\n");
// AVIF: contenitore ISO-BMFF come i video, ma immagine → non deve passare per video
fs.writeFileSync(
  path.join(MEDIA, "immagine.mp4"),
  Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from("ftypavif", "latin1"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("avifmif1", "latin1"),
    Buffer.alloc(1024),
  ]),
);
// Matroska: firma EBML + DocType, con "matroska" dentro i primi byte
fs.writeFileSync(
  path.join(MEDIA, "filmato.mkv"),
  Buffer.concat([
    Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
    Buffer.from("matroska", "latin1"),
    Buffer.alloc(512),
  ]),
);
// oltre il tetto di prova: il video vero più coda di zeri (resta un file video valido)
if (ffmpeg) {
  fs.writeFileSync(path.join(MEDIA, "grande.mp4"), Buffer.concat([fs.readFileSync(PROVA), Buffer.alloc(LIMITE + 4096)]));
} else {
  mp4Sintetico(path.join(MEDIA, "grande.mp4"), LIMITE + 4096);
}

/* ---------------- istanza ---------------- */
const proc = spawn(
  process.execPath,
  ["dashboard.mjs", "--port", String(PORT), "--user", "vt", "--password", "vt", "--root", ROOT],
  {
    cwd: ROOTDIR,
    env: {
      ...process.env,
      DASH_ASK: "off",
      DASH_SESSION_DIR: path.join(TMP, "sessions"),
      DASH_MEDIA_DIR: MEDIA,
      DASH_SKILLS_DIR: path.join(TMP, "skills"),
      DASH_SESSION_SECRET_FILE: path.join(TMP, ".secret"),
      DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
      DASH_VIDEO_MAX_BYTES: String(LIMITE),
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
proc.stderr.on("data", (d) => process.env.VIDEO_TEST_VERBOSE && process.stderr.write("[istanza] " + d));

const cleanup = () => {
  try { proc.kill("SIGKILL"); } catch {}
  fs.rmSync(TMP, { recursive: true, force: true });
};
process.on("exit", cleanup);

const get = (q, opts = {}) => fetch(`${BASE}/api/video?${q}`, { headers: { Authorization: AUTH }, ...opts });
const getNudo = (q, opts = {}) => fetch(`${BASE}/api/video?${q}`, opts);
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

try {
  let pronto = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/api/state`, { headers: { Authorization: AUTH } });
      if (r.ok) { pronto = true; break; }
    } catch { /* non ancora pronto */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!pronto) throw new Error(`istanza su :${PORT} non pronta`);

  console.log("== 1. autenticazione ==");
  check("senza credenziali → 401", (await getNudo("path=media/prova.mp4")).status === 401);

  console.log("== 2. metadati (?meta=1): non scaricano byte ==");
  const m = await (await get("meta=1&path=media/prova.mp4")).json();
  check("ok e formato riconosciuto", m.ok === true && m.mime === "video/mp4", JSON.stringify(m));
  check("il peso è quello del file su disco", m.size === fs.statSync(PROVA).size, String(m.size));
  check("playable vero per un mp4", m.playable === true);
  check("il percorso torna normalizzato rispetto alla root", m.path === "media/prova.mp4", m.path);
  check("niente corpo binario nel meta (Content-Length piccolo)", Number((await get("meta=1&path=media/prova.mp4")).headers.get("content-length") || 0) < 2048);
  const mWebm = await (await get("meta=1&path=media/clip.webm")).json();
  check("webm riconosciuto", mWebm.ok === true && mWebm.mime === "video/webm", JSON.stringify(mWebm));
  const mMov = await (await get("meta=1&path=media/clip.mov")).json();
  check("mov riconosciuto come quicktime (con la nota per il player)", mMov.mime === "video/quicktime" && /QuickTime/.test(mMov.nota || ""), JSON.stringify(mMov));
  const mMkv = await (await get("meta=1&path=media/filmato.mkv")).json();
  check("mkv dichiarato NON riproducibile (invece di un riquadro nero)", mMkv.ok === true && mMkv.playable === false, JSON.stringify(mMkv));

  console.log("== 3. i byte serviti per l'anteprima ==");
  const r1 = await get("path=media/prova.mp4");
  const corpo = Buffer.from(await r1.arrayBuffer());
  check("200 con Content-Type del video", r1.status === 200 && r1.headers.get("content-type") === "video/mp4", String(r1.status));
  check("`Accept-Ranges: bytes` (senza, niente seek)", r1.headers.get("accept-ranges") === "bytes");
  check("`inline` e `nosniff`", r1.headers.get("content-disposition") === "inline" && r1.headers.get("x-content-type-options") === "nosniff");
  check("`Content-Length` = peso del file", Number(r1.headers.get("content-length")) === fs.statSync(PROVA).size);
  check("i byte sono IDENTICI all'originale (sha256)", sha(corpo) === sha(fs.readFileSync(PROVA)));

  console.log("== 4. richieste parziali (Range): è ciò che fa funzionare la barra del tempo ==");
  const r2 = await get("path=media/prova.mp4", { headers: { Authorization: AUTH, Range: "bytes=0-99" } });
  const c2 = Buffer.from(await r2.arrayBuffer());
  check("206 Partial Content", r2.status === 206, String(r2.status));
  check("`Content-Range` della fascia chiesta", r2.headers.get("content-range") === `bytes 0-99/${fs.statSync(PROVA).size}`, String(r2.headers.get("content-range")));
  check("`Content-Length` = 100", Number(r2.headers.get("content-length")) === 100, String(r2.headers.get("content-length")));
  check("i primi 100 byte sono quelli del file", c2.equals(fs.readFileSync(PROVA).subarray(0, 100)));
  const r3 = await get("path=media/prova.mp4", { headers: { Authorization: AUTH, Range: "bytes=-100" } });
  const c3 = Buffer.from(await r3.arrayBuffer());
  const dimProva = fs.statSync(PROVA).size;
  check("`bytes=-100` porta gli ULTIMI 100 byte (indice in coda)", r3.status === 206 && c3.equals(fs.readFileSync(PROVA).subarray(dimProva - 100)), String(r3.headers.get("content-range")));
  const r4 = await get("path=media/prova.mp4", { headers: { Authorization: AUTH, Range: "bytes=100-" } });
  const c4 = Buffer.from(await r4.arrayBuffer());
  check("`bytes=100-` porta dalla posizione alla fine", r4.status === 206 && c4.length === dimProva - 100 && r4.headers.get("content-range") === `bytes 100-${dimProva - 1}/${dimProva}`);
  const r5 = await get("path=media/prova.mp4", { headers: { Authorization: AUTH, Range: `bytes=${dimProva + 10}-` } });
  check("fuori dalla fine → 416 con la dimensione reale", r5.status === 416 && r5.headers.get("content-range") === `bytes */${dimProva}`, String(r5.status));
  const r6 = await get("path=media/prova.mp4", { headers: { Authorization: AUTH, Range: "bytes=abc" } });
  check("un Range malformato non rompe niente (200 con il file intero)", r6.status === 200, String(r6.status));
  await r6.arrayBuffer();

  console.log("== 5. le trappole (magic number, non estensione) ==");
  const r7 = await get("path=media/finto.mp4");
  const j7 = await r7.json();
  check("un HTML rinominato .mp4 → 415 con il motivo", r7.status === 415 && /non è un video/.test(j7.error), JSON.stringify(j7).slice(0, 120));
  const r8 = await get("path=media/immagine.mp4");
  check("un AVIF (stesso contenitore `ftyp`) → 415, non servito come video", r8.status === 415, String(r8.status));
  await r8.arrayBuffer();
  const r9 = await get("path=media/nota.txt");
  check("un file di testo → 415", r9.status === 415, String(r9.status));
  await r9.arrayBuffer();

  console.log("== 6. percorsi ==");
  const r10 = await get("path=media/non-esiste.mp4");
  check("file inesistente → 404 con il percorso citato", r10.status === 404 && /non-esiste\.mp4/.test(JSON.stringify(await r10.json())));
  const r11 = await get("path=/etc/passwd");
  check("percorso fuori dalla root → 404 (non 403: non si conferma nemmeno l'esistenza)", r11.status === 404, String(r11.status));
  await r11.arrayBuffer();
  const r12 = await get("path=media/cartella");
  check("una cartella → 400", r12.status === 400, String(r12.status));
  await r12.arrayBuffer();
  const r13 = await get("meta=1&path=media/prova.mp4");
  check("percorso relativo alla root/media (come lo scrive l'agente) risolto", r13.status === 200);
  await r13.arrayBuffer();
  if (ffmpeg) {
    const r14 = await get("meta=1&path=" + encodeURIComponent("/" + path.relative("/", PROVA)));
    check("percorso assoluto risolto", r14.status === 200, String(r14.status));
    await r14.arrayBuffer();
  }

  console.log("== 7. il tetto per l'anteprima ==");
  const m15 = await (await get("meta=1&path=media/grande.mp4")).json();
  check("il meta dichiara tooBig (senza servire i byte)", m15.ok === true && m15.tooBig === true && m15.size > LIMITE, JSON.stringify(m15).slice(0, 120));
  const r15 = await get("path=media/grande.mp4");
  const j15 = await r15.json();
  check("il GET rifiuta con 413 e dice di scaricarlo", r15.status === 413 && /scaric/.test(j15.error), String(r15.status));
  const r16 = await get("path=media/grande.mp4", { headers: { Authorization: AUTH, Range: "bytes=0-99" } });
  check("il tetto vale anche per una richiesta parziale", r16.status === 413, String(r16.status));
  await r16.arrayBuffer();
} finally {
  cleanup();
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti${ffmpeg ? "" : "  (ffmpeg assente: alcuni test sono degradati)"}`);
process.exit(fail ? 1 : 0);
