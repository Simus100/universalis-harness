/**
 * TEST DEI GRUPPI DI SKILL — interfaccia (browser vero).
 *
 * La vista 🧩 accorpa le skill di uno stesso pacchetto (oggi le 13 di HyperFrames) in una
 * «cartella» richiudibile. Qui si verifica quello che i controlli statici non possono dire:
 *  - la cartella c'è, è CHIUSA all'apertura e mostra titolo, conteggio e nota;
 *  - aprendola compaiono davvero le skill di quel pacchetto (tutte, nessuna persa);
 *  - le skill dell'harness restano in elenco semplice (il raggruppamento non le assorbe);
 *  - il raggruppamento è di SOLA VISUALIZZAZIONE: l'elenco che il modello vede (le skill del
 *    payload, quindi il system prompt) non cambia — è il punto da non rompere;
 *  - ricliccando la cartella si richiude;
 *  - nessun errore JavaScript.
 *
 * Usa le skill VERE dell'istanza (`skills/`), non una cartella finta: il gruppo si riconosce dai
 * nomi, quindi va provato su quelli veri.
 *
 * Uso: node media/test-skill-groups-ui.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = "/root/pi-harness";
const PORT = 8488;
const PROXY = 8489;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-skillgroup-ui-"));
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "skgrptest";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, extra = "") => (c ? ok(d) : ko(`${d}${extra ? " — " + extra : ""}`));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    ...opts,
  });

const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  let v;
  try {
    v = JSON.parse(out);
  } catch {
    return { raw: out };
  }
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "true") return true;
    if (t === "false") return false;
    if (/^[[{-]|^\d/.test(t)) {
      try { return JSON.parse(t); } catch { return v; }
    }
    return v;
  }
  return v;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- setup istanza + proxy + browser ---------------- */
fs.mkdirSync(path.join(TMP, "media"), { recursive: true });
fs.mkdirSync(path.join(TMP, "sessions"), { recursive: true });

const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  // le skill VERE dell'istanza: il gruppo si riconosce dai nomi
  DASH_SKILLS_DIR: path.join(ROOT, "skills"),
  DASH_ROOT: TMP,
  DASH_ASK: "off",
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_USER: "sg",
  DASH_PASSWORD: "sg",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "ignore", "pipe"],
});
dash.stderr.on("data", (d) => process.stderr.write("[istanza] " + d));
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "sg", "sg"], {
  cwd: ROOT,
  stdio: "ignore",
});
const cleanup = () => {
  try { ab(["close"], { stdio: "ignore" }); } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
  fs.rmSync(TMP, { recursive: true, force: true });
};
process.on("exit", cleanup);

let BASE = `http://127.0.0.1:${PROXY}`;
for (let i = 0; i < 80; i++) {
  try {
    const r = await fetch(`${BASE}/api/state`);
    if (r.ok) break;
  } catch {
    /* non ancora pronto */
  }
  await wait(500);
}

// Il payload del server: è quello che alimenta il system prompt. Serve per verificare che il
// raggruppamento NON tocchi i dati (gruppo è un campo in più, le skill restano tutte lì).
let payload = null;
try {
  const r = await fetch(`${BASE}/api/skills`);
  payload = await r.json();
} catch (e) {
  console.log("  (payload non leggibile: " + String(e.message) + ")");
}

try {
  ab(["open", `${BASE}/`]);
  await wait(1500);
  evalJs(`(() => { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("unhandled: " + String(e.reason && e.reason.message || e.reason))); return true; })()`);

  console.log("== 1. il payload: il raggruppamento è solo di visualizzazione ==");
  const tot = payload && Array.isArray(payload.skills) ? payload.skills.length : 0;
  const inGruppo = payload && Array.isArray(payload.skills) ? payload.skills.filter((s) => s.gruppo === "hyperframes").length : 0;
  check("il payload continua a elencare TUTTE le skill, una per voce", tot >= 20, String(tot));
  check("le skill di HyperFrames hanno il campo `gruppo` (campo in più, niente di tolto)", inGruppo >= 13, String(inGruppo));
  check("ogni skill del gruppo ha nome e descrizione come prima", (payload?.skills || []).filter((s) => s.gruppo).every((s) => s.name && s.description));
  check("i gruppi sono descritti nel payload (titolo e nota)", Array.isArray(payload?.gruppi) && /HyperFrames \(HeyGen\)/.test(payload.gruppi[0]?.titolo || ""), JSON.stringify(payload?.gruppi?.[0]?.titolo));

  console.log("== 2. la cartella nella vista skill ==");
  evalJs(`$("featSkills").click(); true`);
  await wait(700);
  const vista = evalJs(`(() => { const g = document.querySelector(".skillgroup"); return JSON.stringify({
    cè: !!g,
    titolo: g ? g.querySelector(".skillgroup-titolo").textContent : null,
    conteggio: g ? g.querySelector(".goal-badge").textContent : null,
    nota: g ? (g.querySelector(".skillgroup-nota") || {}).textContent : null,
    aperto: g ? g.querySelector(".skillgroup-head").getAttribute("aria-expanded") : null,
    schedeDentro: g ? g.querySelectorAll(".goal-card").length : 0,
    schedeTotali: document.querySelectorAll("#skillsList .goal-card").length,
  }); })()`);
  const v = typeof vista === "string" ? JSON.parse(vista) : vista;
  check("la cartella del pacchetto esiste", v.cè === true);
  check("ha il titolo del pacchetto", v.titolo === "HyperFrames (HeyGen)", String(v.titolo));
  check("mostra quante skill contiene", /^\d+ skill$/.test(String(v.conteggio)), String(v.conteggio));
  check("spiega cos'è (nota visibile)", /terzi/i.test(String(v.nota)), String(v.nota).slice(0, 60));
  check("è CHIUSA all'apertura (accorpata, non in mezzo ai piedi)", v.aperto === "false" && v.schedeDentro === 0, `aperto=${v.aperto} dentro=${v.schedeDentro}`);
  check("le schede in elenco sono più di zero anche a cartella chiusa", v.schedeTotali > 0, String(v.schedeTotali));

  console.log("== 3. aprendo la cartella ci sono davvero tutte ==");
  evalJs(`(() => { document.querySelector(".skillgroup-head").click(); return true; })()`);
  await wait(500);
  const aperta = evalJs(`(() => { const g = document.querySelector(".skillgroup"); return JSON.stringify({
    aperto: g.querySelector(".skillgroup-head").getAttribute("aria-expanded"),
    schedeDentro: g.querySelectorAll(".goal-card").length,
    nomi: [...g.querySelectorAll(".goal-title")].map(t => t.textContent),
  }); })()`);
  const a = typeof aperta === "string" ? JSON.parse(aperta) : aperta;
  check("la cartella risulta aperta", a.aperto === "true", String(a.aperto));
  check("contiene tutte le skill del gruppo", a.schedeDentro === inGruppo, `${a.schedeDentro} vs ${inGruppo}`);
  check("ci sono le skill attese (router e workflow)", a.nomi.some((n) => n === "/hyperframes") && a.nomi.some((n) => n === "/media-use"), JSON.stringify(a.nomi.slice(0, 4)));
  check("nessuna skill dell'harness è finita dentro il gruppo", !a.nomi.some((n) => ["/bookforge", "/browser", "/immagini", "/video"].includes(n)), JSON.stringify(a.nomi));

  console.log("== 4. e si richiude ==");
  evalJs(`(() => { document.querySelector(".skillgroup-head").click(); return true; })()`);
  await wait(500);
  check("richiusa: nessuna scheda dentro", evalJs(`document.querySelector(".skillgroup").querySelectorAll(".goal-card").length`) === 0);
  check("le skill dell'harness restano sempre visibili", evalJs(`[...document.querySelectorAll("#skillsList .goal-title")].some(t => t.textContent === "/video")`) === true);

  console.log("== 5. salute del frontend ==");
  check("nessun errore JavaScript non gestito", evalJs(`window.__errs.length`) === 0, JSON.stringify(evalJs(`window.__errs`)));
} finally {
  cleanup();
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
