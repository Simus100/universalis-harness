/**
 * Backup di sessions/ e media/ con retention.
 *
 * Uso:
 *   node backup.mjs                 # crea l'archivio e applica la retention
 *   node backup.mjs --dry-run       # dice cosa farebbe, senza scrivere
 *   node backup.mjs --keep-days 30  # retention diversa da quella dell'ambiente
 *
 * Env:
 *   DASH_SESSION_DIR    (default: <script>/sessions)
 *   DASH_MEDIA_DIR      (default: /root/pi-harness/media)
 *   DASH_BACKUP_DIR     (default: <script>/backups)
 *   DASH_BACKUP_KEEP_DAYS  (default: 14)  giorni di retention
 *   DASH_BACKUP_KEEP_MIN   (default: 5)   archivi minimi mai cancellati
 *   DASH_BACKUP_MIRROR     (opzionale) copia l'archivio anche qui (es. disco/disco esterno)
 *
 * Gira come servizio+ timer systemd (pi-backup.service / pi-backup.timer).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const DRY = argv.includes("--dry-run") || argv.includes("-n");

const SESSION_DIR = resolve(process.env.DASH_SESSION_DIR || join(__dirname, "sessions"));
const MEDIA_DIR = resolve(process.env.DASH_MEDIA_DIR || join(__dirname, "media"));
const BACKUP_DIR = resolve(process.env.DASH_BACKUP_DIR || join(__dirname, "backups"));
const KEEP_DAYS = Number(flag("keep-days", process.env.DASH_BACKUP_KEEP_DAYS || 14));
const KEEP_MIN = Number(process.env.DASH_BACKUP_KEEP_MIN || 5);
const MIRROR = process.env.DASH_BACKUP_MIRROR ? resolve(process.env.DASH_BACKUP_MIRROR) : null;

const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);
const human = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function tar(args, opts = {}) {
  return execFileSync("tar", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
}

async function dirSize(dir) {
  let total = 0;
  let files = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents;
    try {
      ents = await fs.readdir(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (e.isSymbolicLink()) continue;
      const abs = join(d, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile()) {
        try {
          total += (await fs.stat(abs)).size;
          files++;
        } catch {
          /* ignore */
        }
      }
    }
  }
  return { total, files };
}

async function main() {
  const present = [];
  for (const [label, dir] of [["sessions", SESSION_DIR], ["media", MEDIA_DIR]]) {
    if (existsSync(dir)) present.push(label);
    else log(`attenzione: ${label} non esiste (${dir}), salto`);
  }
  if (!present.length) {
    log("niente da salvare: esco");
    return;
  }

  const dirs = present.map((l) => (l === "sessions" ? SESSION_DIR : MEDIA_DIR));
  const sizes = await Promise.all(dirs.map(dirSize));
  present.forEach((l, i) => log(`${l}: ${sizes[i].files} file, ${human(sizes[i].total)}`));

  const now = new Date();
  const stamp = `${now.toISOString().slice(0, 10)}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const name = `pi-harness-${stamp}.tar.gz`;
  const out = join(BACKUP_DIR, name);

  if (DRY) {
    log(`--dry-run: avrei creato ${out}`);
  } else {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    // archivio: percorsi relativi alla cartella del progetto, così è ripristinabile
    // con `tar -xzf ... -C /root/pi-harness`
    const args = ["-czf", out, "-C", __dirname, ...present];
    try {
      tar(args);
    } catch (err) {
      // tar moderna avvisa ("file changed as we read it") ma esce con 1: non è un errore fatale
      const code = err.status;
      if (code !== 1) throw err;
      log("tar ha riportato un avviso (file cambiato durante la lettura): archivio comunque creato");
    }
    const st = await fs.stat(out);
    // verifica: l'archivio si apre e contiene qualcosa?
    let entries = 0;
    try {
      entries = tar(["-tzf", out]).split("\n").filter(Boolean).length;
    } catch (err) {
      throw new Error(`verifica fallita: ${err.message}`);
    }
    log(`creato ${out} (${human(st.size)}, ${entries} voci) ✔ verificato`);
    if (MIRROR) {
      try {
        await fs.mkdir(MIRROR, { recursive: true });
        await fs.copyFile(out, join(MIRROR, name));
        log(`copiato anche in ${join(MIRROR, name)}`);
      } catch (err) {
        log(`mirror non riuscito: ${err?.message ?? err}`);
      }
    }
  }

  // ---- retention ----
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  let files;
  try {
    files = (await fs.readdir(BACKUP_DIR)).filter((f) => /^pi-harness-.*\.tar\.gz$/.test(f)).sort();
  } catch {
    files = [];
  }
  const withStat = [];
  for (const f of files) {
    try {
      withStat.push({ f, path: join(BACKUP_DIR, f), st: await fs.stat(join(BACKUP_DIR, f)) });
    } catch {
      /* ignore */
    }
  }
  const old = withStat.filter((x) => x.st.mtimeMs < cutoff).sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);
  const removable = Math.max(0, withStat.length - KEEP_MIN);
  const toDelete = old.slice(0, removable);
  if (!toDelete.length) {
    log(`retention: nessun archivio da cancellare (${withStat.length} archivi, mantengo ${KEEP_DAYS} giorni)`);
  }
  for (const x of toDelete) {
    if (DRY) log(`--dry-run: avrei cancellato ${x.path}`);
    else {
      await fs.unlink(x.path).catch((err) => log(`non riesco a cancellare ${x.path}: ${err.message}`));
      log(`cancellato ${x.path}`);
    }
  }
  log(`fine: ${withStat.length - toDelete.length} archivi in ${BACKUP_DIR}`);
}

main().catch(async (err) => {
  console.error(`[${new Date().toISOString()}] BACKUP FALLITO:`, err?.stack ?? err);
  // ultima spiaggia: se un archivio parziale è rimasto, non lasciarlo lì a finta di essere valido
  try {
    const files = (await fs.readdir(BACKUP_DIR)).filter((f) => f.endsWith(".tar.gz"));
    for (const f of files) {
      const st = await fs.stat(join(BACKUP_DIR, f));
      if (st.size < 1024) await fs.unlink(join(BACKUP_DIR, f)).catch(() => {});
    }
  } catch {
    /* ignore */
  }
  process.exit(1);
});
