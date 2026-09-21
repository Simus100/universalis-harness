#!/usr/bin/env node
/**
 * apply-media-static-route.mjs
 *
 * Aggiunge alla dashboard la rotta GET /media/<percorso> che serve i file della
 * cartella /root/pi-harness/media (report HTML inclusi) come pagina web, dietro
 * la stessa autenticazione Basic della dashboard.
 *
 * Uso:
 *   node media/apply-media-static-route.mjs            -> dry run (mostra la patch)
 *   node media/apply-media-static-route.mjs --apply    -> scrive la patch + backup
 *
 * Dopo --apply serve un riavvio della dashboard:
 *   systemctl restart pi-dashboard
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const TARGET = path.join(ROOT, "dashboard.mjs");
const APPLY = process.argv.includes("--apply");

const src = fs.readFileSync(TARGET, "utf8");

if (src.includes('url.pathname.startsWith("/media/")')) {
  console.log("rotta /media/ già presente: nessuna modifica necessaria.");
  process.exit(0);
}

const anchor = `    if (req.method === "GET" && url.pathname === "/api/state")`;
if (!src.includes(anchor)) {
  console.error("ancora non trovata in dashboard.mjs: patch annullata.");
  process.exit(1);
}

const block = `    // ---- file generati in media/ serviti come pagina (report HTML, ecc.) ----
    if (req.method === "GET" && url.pathname.startsWith("/media/")) {
      let rel;
      try {
        rel = decodeURIComponent(url.pathname.slice("/media/".length));
      } catch {
        return json(res, 400, { error: "percorso non valido" });
      }
      const abs = resolve(MEDIA_DIR, rel);
      if (abs !== MEDIA_DIR && !abs.startsWith(MEDIA_DIR + sep)) {
        return json(res, 403, { error: "percorso fuori da media" });
      }
      let st = null;
      try { st = await fs.stat(abs); } catch { /* file assente */ }
      if (!st || !st.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("file non trovato in media/");
        return;
      }
      // solo file generati: niente esecuzione, solo lettura del contenuto
      return sendFile(res, abs, { mime: mimeOf(abs), noStore: true, headers: { "X-Content-Type-Options": "nosniff" } });
    }

`;

const out = src.replace(anchor, block + anchor);

if (!APPLY) {
  console.log("DRY RUN — la patch inserirebbe questo blocco prima di", anchor.trim());
  console.log("-".repeat(70));
  console.log(block);
  console.log("-".repeat(70));
  console.log("esegui con --apply per scrivere (crea un backup .pre-media-route).");
  process.exit(0);
}

const backup = `${TARGET}.pre-media-route`;
fs.copyFileSync(TARGET, backup);
fs.writeFileSync(TARGET, out);
console.log("patch applicata:", TARGET);
console.log("backup:", backup);
console.log("ora esegui: systemctl restart pi-dashboard");
