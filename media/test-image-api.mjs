/**
 * TEST DELLE IMMAGINI — lato server (rotta /api/image).
 *
 * Verifica quello che rende sicura l'anteprima di una foto in chat:
 *  - il formato è riconosciuto dai MAGIC NUMBER, non dall'estensione (un HTML rinominato .png
 *    viene rifiutato con un motivo, non servito);
 *  - l'SVG viene rimandato al blocco ```svg (che passa dal sanitizzatore), non servito qui;
 *  - i percorsi fuori dalla root e i file inesistenti sono respinti con messaggi parlanti;
 *  - `?meta=1` non scarica nulla e dice formato, peso e se è troppo grande per l'anteprima;
 *  - i byte si servono `inline` con Content-Type verificato e nosniff.
 *
 * Istanza isolata (porta dedicata, root e media temporanei), nessuna rete, nessun modello.
 *
 * Uso: node media/test-image-api.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { png, gif, jpeg, webp, bmp, finto, svgCamuffato } from "./test-image-util.mjs";

const ROOTDIR = "/root/pi-harness";
const PORT = 8497;
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = "Basic " + Buffer.from("it:it").toString("base64");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-image-api-"));
// media/ sta DENTRO la root (come in produzione: ROOT=/root, MEDIA=/root/pi-harness/media):
// il file manager e /api/image usano percorsi relativi alla root.
const ROOT = TMP;
const MEDIA = path.join(TMP, "media");
const LIMITE = 4096; // tetto di prova per l'anteprima (byte)

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, extra = "") => (c ? ok(d) : ko(`${d}${extra ? " — " + extra : ""}`));

let proc = null;
async function avvia() {
  proc = spawn(
    process.execPath,
    ["dashboard.mjs", "--port", String(PORT), "--user", "it", "--password", "it", "--root", ROOT],
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
        DASH_IMAGE_MAX_BYTES: String(LIMITE),
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  proc.stderr.on("data", (d) => process.stderr.write("[istanza] " + d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/state`, { headers: { Authorization: AUTH } });
      if (r.ok) return true;
    } catch {
      /* non ancora in ascolto */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/** Risposta grezza: status + header + primi byte. */
async function prendi(query, { auth = AUTH } = {}) {
  const r = await fetch(`${BASE}/api/image?${query}`, { headers: auth ? { Authorization: auth } : {} });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, buf, json: () => JSON.parse(buf.toString("utf8")) };
}

/* --- materiale di prova ------------------------------------------------- */
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(path.join(TMP, "sessions"), { recursive: true });
fs.mkdirSync(path.join(TMP, "skills"), { recursive: true });
fs.writeFileSync(path.join(MEDIA, "foto.png"), png(40, 24, [91, 157, 255]));
fs.writeFileSync(path.join(MEDIA, "quadrata.png"), png(200, 200, [139, 92, 255]));
fs.writeFileSync(path.join(MEDIA, "breve.gif"), gif());
fs.writeFileSync(path.join(MEDIA, "breve.jpg"), jpeg());
fs.writeFileSync(path.join(MEDIA, "breve.webp"), webp());
fs.writeFileSync(path.join(MEDIA, "breve.bmp"), bmp());
fs.writeFileSync(path.join(MEDIA, "finta.png"), finto());
fs.writeFileSync(path.join(MEDIA, "disegno.png"), svgCamuffato());
fs.writeFileSync(path.join(MEDIA, "appunti.txt"), "solo testo\n");
fs.writeFileSync(path.join(MEDIA, "grossa.png"), Buffer.concat([png(40, 24), Buffer.alloc(LIMITE + 512)]));
fs.mkdirSync(path.join(MEDIA, "cartella-immagini"), { recursive: true });
fs.writeFileSync(path.join(MEDIA, "cartella-immagini", "una.png"), png(20, 20));
fs.writeFileSync(path.join(MEDIA, "cartella-immagini", "due.png"), png(20, 20));
fs.writeFileSync(path.join(MEDIA, "cartella-immagini", "tre.png"), png(20, 20));
fs.writeFileSync(path.join(MEDIA, "cartella-immagini", "non-foto.txt"), "x");

console.log("== avvio dell'istanza di prova ==");
if (!(await avvia())) {
  console.error("✘ l'istanza non è partita");
  process.exit(1);
}
ok(`istanza in ascolto su :${PORT} (root ${ROOT}, limite anteprima ${LIMITE} byte)`);

try {
  console.log("\n== 1. autenticazione ==");
  {
    const senza = await prendi("meta=1&path=media/foto.png", { auth: null });
    check("senza credenziali → 401", senza.status === 401, String(senza.status));
  }

  console.log("\n== 2. metadati (?meta=1): non scaricano nulla ==");
  {
    const r = await prendi("meta=1&path=media/foto.png");
    const j = r.json();
    check("200 con ok:true", r.status === 200 && j.ok === true, JSON.stringify(j));
    check("formato riconosciuto dai magic number", j.mime === "image/png", j.mime);
    check("peso vero del file", j.size === fs.statSync(path.join(MEDIA, "foto.png")).size, String(j.size));
    check("percorso normalizzato nella risposta", j.path === "media/foto.png", j.path);
    check("niente byte dell'immagine nella risposta JSON", r.buf.length < 400, `${r.buf.length} byte`);
  }

  console.log("\n== 3. i byte serviti per l'anteprima ==");
  {
    const r = await prendi("path=media/foto.png");
    check("200", r.status === 200);
    check("Content-Type verificato", r.headers.get("content-type") === "image/png", r.headers.get("content-type"));
    check("inline (è un'anteprima, non un download)", (r.headers.get("content-disposition") || "") === "inline");
    check("nosniff", r.headers.get("x-content-type-options") === "nosniff");
    check("i byte sono quelli del file", r.buf.equals(fs.readFileSync(path.join(MEDIA, "foto.png"))));
  }

  console.log("\n== 4. formati riconosciuti (dai magic number) ==");
  {
    for (const [file, mime] of [
      ["media/breve.gif", "image/gif"],
      ["media/breve.jpg", "image/jpeg"],
      ["media/breve.webp", "image/webp"],
      ["media/breve.bmp", "image/bmp"],
    ]) {
      const j = (await prendi(`meta=1&path=${file}`)).json();
      check(`${file} → ${mime}`, j.mime === mime, String(j.mime));
    }
  }

  console.log("\n== 5. le trappole ==");
  {
    const html = await prendi("meta=1&path=media/finta.png");
    check("un HTML rinominato .png → 415", html.status === 415, String(html.status));
    check("il motivo lo dice chiaramente", /non è un'immagine/.test(html.json().error || ""), html.json().error);
    const svg = await prendi("meta=1&path=media/disegno.png");
    check("un SVG camuffato → 415", svg.status === 415, String(svg.status));
    check("il motivo rimanda al blocco svg", /blocco .*svg/.test(svg.json().error || ""), svg.json().error);
    const testo = await prendi("meta=1&path=media/appunti.txt");
    check("un file di testo → 415", testo.status === 415, String(testo.status));
    const byte = await prendi("path=media/finta.png");
    check("i byte di un file non-immagine NON vengono serviti", byte.status === 415 && byte.buf.length < 400, String(byte.status));
  }

  console.log("\n== 6. percorsi ==");
  {
    const fuori = await prendi("meta=1&path=../../etc/passwd");
    check("percorso fuori dalla root → 403", fuori.status === 403, `${fuori.status} ${fuori.json().error}`);
    const assente = await prendi("meta=1&path=media/non-esiste.png");
    check("file inesistente → 404", assente.status === 404, String(assente.status));
    check("il messaggio cita il percorso", /non-esiste\.png/.test(assente.json().error || ""), assente.json().error);
    const cartella = await prendi("meta=1&path=media/cartella-immagini");
    check("una cartella → 400 «non è un file»", cartella.status === 400, String(cartella.status));
  }

  console.log("\n== 7. immagini troppo grandi per l'anteprima ==");
  {
    const m = await prendi("meta=1&path=media/grossa.png");
    const j = m.json();
    check("i metadati arrivano lo stesso (ok:true)", m.status === 200 && j.ok === true);
    check("tooBig segnalato", j.tooBig === true);
    const b = await prendi("path=media/grossa.png");
    check("i byte vengono rifiutati con 413", b.status === 413, String(b.status));
    check("il motivo dice il limite e cosa fare", /limite/.test(b.json().error || "") && /apri|scarica/.test(b.json().error || ""), b.json().error);
  }

  console.log("\n== 8. la galleria (immagini di una cartella) ==");
  {
    const r = await fetch(`${BASE}/api/files?path=${encodeURIComponent("media/cartella-immagini")}`, {
      headers: { Authorization: AUTH },
    });
    const j = await r.json();
    const immagini = (j.entries || []).filter((e) => e.type === "file" && /\.png$/.test(e.name));
    check("la cartella di prova contiene 3 immagini", immagini.length === 3, String(immagini.length));
  }
} finally {
  try { proc.kill("SIGKILL"); } catch {}
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
