/**
 * TEST DEL TOOL BROWSER: screenshot e pdf devono arrivare in media/.
 *
 * Difetto corretto il 2026-09-27: la CLI gira come utente dedicato (`pi-browser`) e NON può
 * scrivere in `media/` (che sta sotto la root della dashboard, `root:root 0755`), quindi
 * l'azione `screenshot`/`pdf` falliva con «Permission denied (os error 13)». Ora la CLI scrive
 * in una cartella di transito dell'utente dedicato e la dashboard (root) sposta il file in
 * `media/`, correggendo il percorso nel testo restituito al modello.
 *
 * Il test riproduce ESATTAMENTE le condizioni di produzione: media/ di proprietà di root e non
 * scrivibile dall'utente dedicato, cartella di transito configurabile, browser vero.
 *
 * Uso: node media/test-browser-tool-output.mjs     (richiede un browser: ~30 s, ~1,7 GB di RAM)
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const TMP = "/tmp/pi-bt";
const MEDIA = path.join(TMP, "media");
const TRANSITO = path.join(TMP, "transito");
const USER = process.env.DASH_BROWSER_USER || "pi-browser";

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(MEDIA, { recursive: true, mode: 0o755 });
fs.mkdirSync(TRANSITO, { recursive: true, mode: 0o755 });
// media/ come in produzione: di root, non scrivibile dall'utente dedicato
fs.chmodSync(MEDIA, 0o755);

// una pagina da fotografare
const pagina = "<!DOCTYPE html><html lang='it'><head><meta charset='utf-8'><title>Prova screenshot</title></head>"
  + "<body style='font-family:sans-serif'><h1>Pagina di prova</h1><p>Screenshot del tool browser.</p></body></html>";
fs.writeFileSync(path.join(TMP, "pagina.html"), pagina);

const srv = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(pagina);
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${srv.address().port}/`;

process.env.DASH_BROWSER_OUT_DIR = TRANSITO;
const { createBrowserExtension } = await import("./browser-tool.mjs");

let tool = null;
const ext = createBrowserExtension({
  mediaDir: MEDIA,
  isHumanControlled: () => false,
  onActivity: () => {},
});
ext.factory({ registerTool: (t) => { tool = t; } });

const text = (r) => (r?.content || []).map((c) => c.text).join("\n");
const listMedia = () => (fs.existsSync(MEDIA) ? fs.readdirSync(MEDIA) : []);
const listTransito = (dir) => {
  const root = path.join(TRANSITO, USER);
  return fs.existsSync(root) ? fs.readdirSync(root) : [];
};

try {
  check("il tool è registrato", !!tool);

  console.log("\n== precondizione: media/ non è scrivibile dall'utente dedicato ==");
  {
    const st = fs.statSync(MEDIA);
    const writableByOthers = (st.mode & 0o002) !== 0;
    check("media/ esiste ed è di root (come in produzione)", !writableByOthers, `mode ${st.mode.toString(8)}`);
    // prova diretta: l'utente dedicato non può scrivere lì
    const { execFileSync } = await import("node:child_process");
    let scrivibile = true;
    try {
      execFileSync("sudo", ["-n", "-u", USER, "-H", "sh", "-c", `test -w ${MEDIA}`]);
    } catch {
      scrivibile = false;
    }
    check("l'utente dedicato NON può scrivere in media/ (è l'innesco del difetto)", !scrivibile);
  }

  console.log("\n== apertura pagina ==");
  {
    const r = await tool.execute("t1", { action: "open", url });
    check("open riesce", !r.isError, text(r).slice(0, 200));
  }

  console.log("\n== screenshot ==");
  {
    const r = await tool.execute("t2", { action: "screenshot", path: "prova-screenshot.png" });
    check("screenshot riesce (prima falliva con EACCES)", !r.isError, text(r).slice(0, 300));
    const target = path.join(MEDIA, "prova-screenshot.png");
    check("il file è arrivato in media/", fs.existsSync(target));
    if (fs.existsSync(target)) {
      const st = fs.statSync(target);
      check("il file non è vuoto ed è un PNG", st.size > 1000 && fs.readFileSync(target).subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${st.size} byte`);
    }
    check("il testo restituito indica il percorso in media/ (non quello temporaneo)", text(r).includes(target), text(r).slice(0, 300));
    check("il testo NON cita la cartella di transito", !text(r).includes(TRANSITO), text(r).slice(0, 300));
    check("nessun residuo nella cartella di transito", listTransito(TRANSITO).length === 0, listTransito(TRANSITO).join(","));
  }

  console.log("\n== pdf ==");
  {
    const r = await tool.execute("t3", { action: "pdf", path: "prova-pagina.pdf" });
    check("pdf riesce", !r.isError, text(r).slice(0, 300));
    const target = path.join(MEDIA, "prova-pagina.pdf");
    check("il pdf è arrivato in media/", fs.existsSync(target) && fs.statSync(target).size > 500, fs.existsSync(target) ? `${fs.statSync(target).size} byte` : "assente");
    check("nessun residuo nella cartella di transito", listTransito(TRANSITO).length === 0, listTransito(TRANSITO).join(","));
  }

  console.log("\n== il percorso richiesto resta confinato in media/ ==");
  {
    const r = await tool.execute("t4", { action: "screenshot", path: "../../etc/tentativo.png" });
    check("un percorso con .. non scrive fuori da media/", !fs.existsSync(path.join(TMP, "tentativo.png")) && !fs.existsSync("/etc/tentativo.png"));
    check("l'esito è comunque un file in media/ oppure un errore esplicito", !r.isError || /errore|non/i.test(text(r)), text(r).slice(0, 200));
    check("in media/ non compaiono file fuori posto", listMedia().every((n) => !n.includes("..")), listMedia().join(","));
  }
} catch (e) {
  ko("eccezione nel test: " + (e?.stack || e));
} finally {
  try { await tool?.execute("t9", { action: "close" }); } catch { /* niente da fare */ }
  srv.close();
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
