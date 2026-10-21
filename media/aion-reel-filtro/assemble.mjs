#!/usr/bin/env node
/**
 * assemble.mjs — monta il reel «Il filtro» di Aion.
 *
 * Due modi:
 *   node media/aion-reel-filtro/assemble.mjs --animatic
 *       montaggio di prova con i keyframe (lento zoom) al posto del footage: serve a controllare
 *       ritmo, testi e leggibilità PRIMA di spendere i render di Veo. → animatic.mp4
 *
 *   node media/aion-reel-filtro/assemble.mjs
 *       montaggio vero: usa clip/shotA.mp4, clip/shotB.mp4, clip/shotC.mp4 (9:16, ~8 s).
 *       Le clip più lunghe del beat vengono tagliate, le più corte congelate sull'ultimo frame
 *       (così un render da 6 s non manda a monte tutto il montaggio). → aion-reel-filtro.mp4
 *
 * Opzioni: --out <file>  --musica <file.wav> (sostituisce il letto sintetizzato)
 */
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const QUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argomento = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : null; };
const ANIMATIC = args.includes('--animatic');

const W = 1080, H = 1920, FPS = 30;

// La timeline del brief (00-brief.md). offset = da dove si entra nella clip generata.
const BEAT = [
  { id: 'A', dur: 5.0, clip: 'clip/shotA.mp4', key: 'keyframe/key1.png', ovl: 'overlay/beat1.png', offset: 1.0, fi: 0.25, fo: 0.45, scrim: true },
  { id: 'B', dur: 5.0, clip: 'clip/shotB.mp4', key: 'keyframe/key2.png', ovl: 'overlay/beat2.png', offset: 1.0, fi: 0.30, fo: 0.45, scrim: true },
  { id: 'C', dur: 3.4, clip: 'clip/shotC.mp4', key: 'keyframe/key3.png', ovl: 'overlay/beat3.png', offset: 1.2, fi: 0.30, fo: 0.40, scrim: true },
  { id: 'D', dur: 3.8, clip: null, key: null, ovl: 'overlay/beat4.png', offset: 0, fi: 0.35, fo: 0.0, scrim: false },
];
const TOT = BEAT.reduce((s, b) => s + b.dur, 0);

const p = (f) => join(QUI, f);
const esegui = (cmd, argv) => {
  try { return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { console.error(`\n${cmd} è fallito:\n${e.stderr || e.message}`); process.exit(1); }
};

mkdirSync(p('animatic'), { recursive: true });

// ── 1. sfondi dell'animatic: il keyframe con un lentissimo zoom in avanti ────────────────
function sfondoAnimatic(beat) {
  const out = p(`animatic/bg-${beat.id}.mp4`);
  const frames = Math.round((beat.dur + beat.offset + 0.5) * FPS);
  const zoom = `zoompan=z='min(1.0+0.0009*on,1.14)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS}`;
  esegui('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-t', '30', '-i', p(beat.key),
    '-vf', `${zoom},format=yuv420p`, '-frames:v', String(frames), '-c:v', 'libx264',
    '-preset', 'veryfast', '-crf', '20', out]);
  return out;
}

// ── 2. audio: letto sintetizzato (nessun diritto di terzi) ───────────────────────────────
// Pad basso in due voci, un soffio a ogni cambio scena, un tonfo sul taglio.
function audio() {
  const out = p('animatic/audio.wav');
  const w = (t) => Math.round(t * 1000); // adelay vuole millisecondi
  const fg = [
    `[0:a]volume=0.17,afade=t=in:st=0:d=1.8,afade=t=out:st=${TOT - 1.6}:d=1.6[pad1]`,
    `[1:a]volume=0.07,afade=t=in:st=0:d=2.4,afade=t=out:st=${TOT - 1.6}:d=1.6[pad2]`,
    // soffio: rumore filtrato con inviluppo breve, tre volte
    `[2:a]highpass=f=280,lowpass=f=5200,afade=t=in:st=0:d=0.04,afade=t=out:st=0.30:d=0.60,volume=0.30[wf]`,
    `[wf]asplit=3[w1][w2][w3]`,
    `[w1]adelay=${w(4.60)}|${w(4.60)}[s1]`,
    `[w2]adelay=${w(9.55)}|${w(9.55)}[s2]`,
    `[w3]adelay=${w(13.00)}|${w(13.00)}[s3]`,
    // tonfo sul taglio: sinusoide che decade
    `[3:a]afade=t=in:st=0:d=0.02,afade=t=out:st=0.06:d=0.85,volume=0.42[bf]`,
    `[bf]adelay=${w(7.20)}|${w(7.20)}[boom]`,
    `[pad1][pad2][s1][s2][s3][boom]amix=inputs=6:normalize=0:duration=longest,` +
      `aformat=sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.9,` +
      `afade=t=out:st=${TOT - 0.5}:d=0.5[out]`,
  ].join(';');
  esegui('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-t', String(TOT), '-i', 'sine=frequency=55:sample_rate=48000',
    '-f', 'lavfi', '-t', String(TOT), '-i', 'sine=frequency=82.5:sample_rate=48000',
    '-f', 'lavfi', '-t', '1.2', '-i', 'anoisesrc=color=pink:sample_rate=48000',
    '-f', 'lavfi', '-t', '1.2', '-i', 'sine=frequency=48:sample_rate=48000',
    '-filter_complex', fg, '-map', '[out]', '-c:a', 'pcm_s16le', out]);
  return out;
}

// ── 3. che sorgente video usa ogni beat ────────────────────────────────────────────────
const sorgenti = BEAT.map((b) => {
  if (!b.clip) return null;
  if (ANIMATIC) return sfondoAnimatic(b);
  const f = p(b.clip);
  if (!existsSync(f)) {
    console.error(`manca ${b.clip}.\nPer vedere i tempi senza le clip: --animatic`);
    process.exit(2);
  }
  return f;
});

// ── 4. grafo di montaggio ──────────────────────────────────────────────────────────────
const input = [], fg = [];
let k = 0;

// ogni beat con footage: [clip] [scrim] [testo]
BEAT.forEach((b, i) => {
  const clip = sorgenti[i];
  if (!clip) {
    fg.push(`color=c=0x05070c:s=${W}x${H}:r=${FPS}:d=${b.dur}[base${i}]`);
  } else {
    input.push('-i', clip);
    const ic = k++;
    fg.push(
      `[${ic}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,` +
      `fps=${FPS},trim=start=${b.offset},setpts=PTS-STARTPTS,` +
      // se la clip è più corta del beat si congela, se è più lunga si taglia
      `tpad=stop_mode=clone:stop_duration=2,trim=duration=${b.dur},setpts=PTS-STARTPTS[base${i}]`
    );
    if (b.scrim) {
      input.push('-loop', '1', '-t', String(b.dur), '-i', p('overlay/scrim.png'));
      const is = k++;
      fg.push(`[${is}:v]scale=${W}:${H},fps=${FPS},format=rgba,trim=duration=${b.dur},setpts=PTS-STARTPTS[scrim${i}]`);
      fg.push(`[base${i}][scrim${i}]overlay=0:0:format=auto[bs${i}]`);
    }
  }
});

// il nome del ramo base dopo lo scrim (o senza, per la coda)
const baseName = (i) => (BEAT[i].scrim && sorgenti[i] ? `bs${i}` : `base${i}`);

// testi: un input per beat, con fade alfa in entrata e in uscita
BEAT.forEach((b, i) => {
  input.push('-loop', '1', '-t', String(b.dur), '-i', p(b.ovl));
  const it = k++;
  const fOut = b.fo > 0 ? `,fade=t=out:st=${(b.dur - b.fo).toFixed(2)}:d=${b.fo}:alpha=1` : '';
  fg.push(
    `[${it}:v]fps=${FPS},format=rgba,` +
    `fade=t=in:st=0:d=${b.fi}:alpha=1${fOut},trim=duration=${b.dur},setpts=PTS-STARTPTS[txt${i}]`
  );
  fg.push(`[${baseName(i)}][txt${i}]overlay=0:0:format=auto[v${i}]`);
});

const wav = argomento('--musica') || audio();
input.push('-i', wav);
k++;

fg.push(`${BEAT.map((_, i) => `[v${i}]`).join('')}concat=n=${BEAT.length}:v=1:a=0[vc]`);
fg.push(`[vc]fade=t=out:st=${(TOT - 0.32).toFixed(2)}:d=0.32,format=yuv420p[vout]`);
fg.push(`[${k - 1}:a]aformat=sample_rates=48000:channel_layouts=stereo[aout]`);

const out = argomento('--out') || p(ANIMATIC ? 'animatic.mp4' : 'aion-reel-filtro.mp4');
esegui('ffmpeg', ['-y', '-loglevel', 'error', ...input,
  '-filter_complex', fg.join(';'),
  '-map', '[vout]', '-map', '[aout]', '-t', String(TOT),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);

console.log(`${ANIMATIC ? 'animatic' : 'reel'} scritto: ${out}  (${TOT.toFixed(1)} s, ${W}×${H}, ${FPS} fps)`);
