/**
 * DIMOSTRAZIONE NELL'ISTANZA DI PRODUZIONE (riavvio + richiesta in chat + verifica visiva).
 *
 * Fa, in ordine:
 *  1. attende che l'istanza sia ferma (nessuna risposta in corso) — il riavvio non deve
 *     interrompere un turno;
 *  2. riavvia `pi-dashboard`, perché servono il nuovo `dashboard.mjs` (nota nel system prompt,
 *     rotta `/svg-sanitize.mjs`) e la skill appena creata;
 *  3. manda in chat la richiesta concordata sull'eclissi di Sole;
 *  4. verifica la risposta (blocco ```svg conforme, sanitizzabile) e salva il disegno in media/;
 *  5. apre la dashboard in un browser headless e verifica che in chat ci sia davvero
 *     l'ANTEPRIMA caricata (immagine rasterizzata), con screenshot di prova.
 *
 * Il passo 2 uccide il servizio: questo processo DEVE girare fuori dal suo cgroup, cioè come
 * unità transitoria systemd:
 *
 *   systemd-run --unit=svg-demo --collect --quiet \
 *     /home/linuxbrew/.linuxbrew/bin/node /root/pi-harness/media/svg-demo-produzione.mjs
 *
 * (Ed è anche il motivo per cui non va lanciato a mano mentre un turno è in corso.)
 * Log completo in media/svg-demo-produzione.log (lo script reindirizza lì il proprio output).
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sanitizeSvg } from "./svg-sanitize.mjs";

const ROOT = "/root/pi-harness";
const MEDIA = path.join(ROOT, "media");
const LOG = path.join(MEDIA, "svg-demo-produzione.log");
const RICHIESTA =
  "Spiegami un'eclissi di Sole con uno schema SVG etichettato in italiano, indicando che dimensioni e distanze non sono in scala.";
const PROXY_PORT = 8502;
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "svgdemo";

// log su file: l'unità transitoria può restare senza terminale
const logStream = fs.createWriteStream(LOG, { flags: "a" });
const log = (...a) => {
  const line = a.join(" ");
  console.log(line);
  logStream.write(line + "\n");
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- credenziali: dal .env dell'istanza, mai scritte qui ---- */
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const HOST = env.DASH_HOST || "127.0.0.1";
const PORT = 8420;
const BASE = `http://${HOST}:${PORT}`;
const AUTH = { Authorization: "Basic " + Buffer.from(`${env.DASH_USER}:${env.DASH_PASSWORD}`).toString("base64") };
const api = (p, init = {}) => fetch(`${BASE}${p}`, { headers: AUTH, ...init, signal: AbortSignal.timeout(15000) });

const state = async () => (await api("/api/state")).json();
const streaming = async () => {
  try {
    return (await state()).streaming === true;
  } catch {
    return null; // servizio non raggiungibile (riavvio in corso)
  }
};

log(`\n== ${new Date().toISOString()} dimostrazione in produzione ==`);

/* ---- 1. attesa che l'istanza sia ferma ---- */
log("attendo che non ci siano risposte in corso…");
let quieto = false;
for (let i = 0; i < 300; i++) {
  const s = await streaming();
  if (s === false) { quieto = true; break; }
  await wait(5000);
}
if (!quieto) {
  log("✘ un turno è ancora in corso da troppo tempo: dimostrazione RINVIATA (nessun riavvio).");
  log("  rilancia questo script quando la chat è ferma.");
  process.exit(1);
}
log("istanza ferma.");

/* ---- 2. riavvio del servizio ---- */
log("riavvio pi-dashboard…");
try {
  execFileSync("systemctl", ["restart", "pi-dashboard"], { stdio: "inherit" });
} catch (e) {
  log("✘ restart fallito: " + String(e.message).slice(0, 200));
  process.exit(1);
}
let vivo = false;
for (let i = 0; i < 60; i++) {
  await wait(2000);
  try {
    const r = await api("/svg-sanitize.mjs");
    if (r.status === 200) { vivo = true; break; }
  } catch {}
}
if (!vivo) {
  log("✘ la dashboard non risponde con il nuovo codice");
  process.exit(1);
}
log("dashboard riavviata: /svg-sanitize.mjs è servito (nuovo codice attivo).");

const skills = await (await api("/api/skills")).json().catch(() => ({}));
log(`skill attive: ${(skills.skills || []).map((s) => s.name).join(", ") || "?"}`);

/* ---- 3. la richiesta in chat ---- */
log(`richiesta: «${RICHIESTA}»`);
const pr = await api("/api/prompt", {
  method: "POST",
  headers: { ...AUTH, "Content-Type": "application/json" },
  body: JSON.stringify({ text: RICHIESTA }),
});
log(`POST /api/prompt → ${pr.status}`);

let finita = false;
for (let i = 0; i < 240; i++) {
  await wait(3000);
  if ((await streaming()) === false) { finita = true; break; }
}
if (!finita) {
  log("✘ la risposta non è terminata entro il tempo previsto");
  process.exit(1);
}

/* ---- 4. verifica del contenuto ---- */
const s = await state();
const risposta = [...(s.messages || [])].reverse().find((m) => m.role === "assistant" && (m.text || "").includes("svg"));
const testo = risposta?.text || "";
const blocchi = [...testo.matchAll(/(?:^|\n)```svg[ \t]*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
const res = sanitizeSvg(blocchi[0] || "");
log(`blocchi svg nella risposta: ${blocchi.length}`);
log(`sanitizzatore: ${res.ok ? `accettato (${res.stats.bytes} byte, ${res.stats.elements} elementi)` : "RIFIUTATO: " + res.error}`);
if (res.ok) {
  fs.writeFileSync(path.join(MEDIA, "eclissi-sole-produzione.svg"), res.svg + "\n");
  log(`titolo: ${res.title}`);
  log(`descrizione: ${res.desc}`);
}

/* ---- 5. verifica visiva nel browser headless ---- */
const cleanupBrowser = () => { try { ab(["close"], { stdio: "ignore" }); } catch {} };
function ab(args, opts = {}) {
  return execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    ...opts,
  });
}
const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  let v;
  try { v = JSON.parse(out); } catch { return { raw: out }; }
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "true") return true;
    if (t === "false") return false;
    if (/^[[{-]|^\d/.test(t)) { try { return JSON.parse(t); } catch { return v; } }
    return v;
  }
  return v;
};

const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY_PORT), String(PORT), env.DASH_USER, env.DASH_PASSWORD], {
  cwd: ROOT,
  stdio: "ignore",
});
process.on("exit", () => { cleanupBrowser(); try { proxy.kill("SIGKILL"); } catch {} });

await wait(1500);
const PROFILE = `/home/pi-browser/.agent-browser/profile-${SESSION}`;
try { ab(["close"]); } catch {}
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE}`], { stdio: "ignore" }); } catch {}
await wait(1000);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try { ab(["open", `http://127.0.0.1:${PROXY_PORT}/`]); aperto = true; } catch { await wait(2500); }
}
if (!aperto) {
  log("✘ non riesco ad aprire la dashboard nel browser di prova");
  process.exit(1);
}
try { ab(["set", "viewport", "1280", "900"]); } catch {}
try { ab(["open", `http://127.0.0.1:${PROXY_PORT}/`]); } catch {}

let visibile = false;
let dettaglio = "";
for (let i = 0; i < 60; i++) {
  await wait(1000);
  const r = evalJs(`(() => {
    const msgs = [...document.querySelectorAll(".msg.assistant")];
    const ultimo = msgs[msgs.length - 1];
    if (!ultimo) return JSON.stringify({ ok: false, motivo: "nessun messaggio" });
    const imgs = [...ultimo.querySelectorAll(".svgfig img")];
    const testo = ultimo.textContent || "";
    return JSON.stringify({
      ok: imgs.length > 0 && imgs.some((i) => i.complete && i.naturalWidth > 0),
      anteprime: imgs.length,
      caricate: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
      larghezza: imgs[0] ? Math.round(imgs[0].getBoundingClientRect().width) : 0,
      altezza: imgs[0] ? Math.round(imgs[0].getBoundingClientRect().height) : 0,
      eclissi: /eclissi/i.test(testo),
      fig: ultimo.querySelectorAll(".svgfig").length,
    });
  })()`);
  dettaglio = JSON.stringify(r);
  if (r && r.ok === true) { visibile = true; break; }
}
log(`anteprima nell'ultimo messaggio: ${visibile ? "VISIBILE e rasterizzata" : "NON visibile"} — ${dettaglio}`);

try {
  const png = path.join(MEDIA, "eclissi-anteprima-chat.png");
  ab(["screenshot", png]);
  if (fs.existsSync(png)) log(`screenshot salvato: ${png}`);
} catch (e) {
  log("screenshot non riuscito: " + String(e.message).slice(0, 120));
}
cleanupBrowser();

log(visibile ? "== ESITO: dimostrazione completata ==" : "== ESITO: anteprima non rilevata ==");
process.exit(visibile ? 0 : 1);
