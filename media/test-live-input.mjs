/**
 * SCRIVERE NEL BROWSER DALLA LIVE VIEW: «scrivi qui» e «⇩ incolla».
 *
 * Perché questo test esiste. I tasti sono un canale per così dire fisico: senza tastiera
 * fisica (telefono) nel browser non si scriveva nulla, e un testo lungo andava digitato per
 * intero. Qui si verifica quello che è stato aggiunto per risolverlo, con una prova che
 * ARRIVA DAVVERO A DESTINAZIONE: il testo deve comparire nel campo della pagina, non basta
 * che la richiesta HTTP risponda 200.
 *
 * Cosa copre
 *   1. l'endpoint `/api/browser/inserttext` esiste, è riservato a chi ha il controllo e
 *      rifiuta testo vuoto, troppo lungo e con caratteri di controllo (senza eseguire nulla)
 *   2. il testo inserito arriva INTEGRO nel campo attivo, accenti compresi
 *   3. la riga «scrivi qui / incolla» compare solo con il controllo in mano all'utente
 *   4. digitare nel riquadro → i caratteri finiscono nel campo del sito (è la tastiera da
 *      telefono)
 *   5. incollare nel riquadro (evento paste) → il testo va al sito e NON resta nel riquadro
 *   6. ⌫ cancella nel sito
 *   7. la pagina non registra errori JavaScript
 *
 * Sessioni browser: due, e distinte di proposito. `liveinput` è il browser che la dashboard
 * pilotata mostra e comanda (via wrapper con --session forzata); `liveinput-ui` è il browser
 * in cui si apre la dashboard. Se fossero la stessa, la live view mostrerebbe sé stessa.
 *
 * Uso: node media/test-live-input.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8494;       // dashboard isolata
const PROXY = 8495;      // proxy di autenticazione per il browser
const SITE = 8497;       // pagina di prova servita via http (il tool accetta solo http/https)
const TMP = "/tmp/pi-liveinput";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "liveinput";          // browser pilotato (sito + live view)
const SESSION_UI = "liveinput-ui";    // browser che guarda la dashboard
const AUTH = "Basic " + Buffer.from("li:li").toString("base64");
const BASE = `http://127.0.0.1:${PROXY}`;
const WRAPPER = path.join(TMP, "pb-liveinput");

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8", timeout: 90_000, ...opts,
  });
const abUi = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION_UI, ...args], {
    encoding: "utf8", timeout: 90_000, ...opts,
  });
const ui = (expr) => {
  const out = abUi(["eval", `(async () => { ${expr} })()`]).trim();
  const p1 = (() => { try { return JSON.parse(out); } catch { return undefined; } })();
  if (p1 === undefined) return out;
  if (typeof p1 === "string") { try { return JSON.parse(p1); } catch { return p1; } }
  return p1;
};
const api = (p, opts = {}) =>
  fetch(BASE + p, {
    ...opts,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
const apiJson = async (p, opts) => {
  const r = await api(p, opts);
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const valoreCampo = () => ab(["get", "value", "#campo"]).trim();

/* ---------------- preparazione ---------------- */
fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root", "skills", "site"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });
// il log della dashboard di prova resta su file: senza, un difetto del ponte della live view
// si vede solo come «il testo non arriva» senza dire perché
const LOG_FD = fs.openSync(path.join(TMP, "dash.log"), "a");
fs.writeFileSync(
  path.join(TMP, "site", "index.html"),
  `<!doctype html><meta charset="utf-8"><title>pagina di prova</title>
   <h1>pagina di prova</h1>
   <p>Un campo di testo, per verificare che quello che si scrive nella live view arrivi qui.</p>
   <input id="campo" type="text" size="60">
   <textarea id="area" rows="3" cols="60"></textarea>`,
);
// wrapper: forza la sessione, così sia il tool `browser` sia il ponte della live view
// dell'istanza isolata lavorano sul browser di prova e non su quello dell'utente
fs.writeFileSync(WRAPPER, `#!/bin/sh\nexec ${PBROWSER} --session ${SESSION} "$@"\n`);
fs.chmodSync(WRAPPER, 0o755);

const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_ASK: "off",
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_BROWSER_BIN: WRAPPER,
  DASH_USER: "li",
  DASH_PASSWORD: "li",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], { cwd: ROOT, env, stdio: ["ignore", LOG_FD, LOG_FD] });
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "li", "li"], { cwd: ROOT, stdio: "ignore" });
const site = spawn("python3", ["-m", "http.server", String(SITE), "--bind", "127.0.0.1", "--directory", path.join(TMP, "site")], { stdio: "ignore" });

const chiudi = (sess) => { try { execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", sess, "close"], { stdio: "ignore", timeout: 60_000 }); } catch {} };
const cleanup = () => {
  chiudi(SESSION); chiudi(SESSION_UI);
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
  try { site.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`${BASE}/api/state`, { headers: { Authorization: AUTH } });
    if (r.status === 200) { up = true; break; }
  } catch {}
  await wait(1000);
}
if (!up) { console.log("✘ istanza di prova non partita"); cleanup(); process.exit(1); }
console.log(`istanza ${PORT} + proxy ${PROXY} + sito ${SITE} attivi\n`);

/* profili puliti: un profilo sporco nasconde i difetti veri */
for (const s of [SESSION, SESSION_UI]) {
  const dir = `/home/pi-browser/.agent-browser/profile-${s}`;
  try { execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", s, "close"], { stdio: "ignore" }); } catch {}
  try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${dir}`], { stdio: "ignore" }); } catch {}
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
await wait(1000);

console.log("== 0. il browser di prova apre la pagina con il campo ==");
let su = false;
for (let i = 0; i < 4 && !su; i++) {
  try { ab(["open", `http://127.0.0.1:${SITE}/`]); su = true; } catch { await wait(2500); }
}
if (!su) { console.log("✘ non riesco ad avviare il browser di prova"); cleanup(); process.exit(1); }
try { ab(["set", "viewport", "1280", "900"]); } catch {}
try { ab(["focus", "#campo"]); } catch {}
check("campo di prova presente e a fuoco", (await ab(["get", "value", "#campo"])).trim() === "", "valore non vuoto");

/* il ponte della live view deve essere attivo: i caratteri corti passano da lì */
const watch = await apiJson("/api/browser/watch", { method: "POST", body: JSON.stringify({ on: true }) });
check("flusso della live view attivo", watch.status === 200 && !!watch.body.live, JSON.stringify(watch.body).slice(0, 120));
// il ponte deve essere CONNESSO e ricevere frame: senza, i caratteri corti non hanno canale
let liveStato = {};
for (let i = 0; i < 20; i++) {
  liveStato = (await apiJson("/api/browser/live")).body.live || {};
  if (liveStato.connected && liveStato.frames > 0) break;
  await wait(1000);
}
check("il ponte della live view è connesso allo stream", liveStato.connected === true, JSON.stringify(liveStato));
check("arrivano frame dal browser", (liveStato.frames || 0) > 0, JSON.stringify(liveStato));

// ---------------- 1. l'endpoint è riservato a chi ha il controllo ----------------
console.log("\n== 1. inserttext: permessi e validazioni (senza toccare la pagina) ==");
const testo = "Ciao!42 àèì";
const prima = await valoreCampo();
const negato = await apiJson("/api/browser/inserttext", { method: "POST", body: JSON.stringify({ text: testo }) });
check("in modalità agente l'incolla è rifiutato con 409", negato.status === 409, `status ${negato.status}`);
check("il rifiuto spiega cosa fare", /prendi il controllo/.test(String(negato.body.error || "")), JSON.stringify(negato.body));
check("in modalità agente la pagina non è stata toccata", (await valoreCampo()) === prima);

const human = await apiJson("/api/browser/control", { method: "POST", body: JSON.stringify({ mode: "human" }) });
check("controllo passato all'utente", human.status === 200 && human.body.control === "human", JSON.stringify(human.body).slice(0, 80));

const vuoto = await apiJson("/api/browser/inserttext", { method: "POST", body: JSON.stringify({ text: "   " }) });
check("testo vuoto rifiutato con 400", vuoto.status === 400, `status ${vuoto.status}`);
const controllo = await apiJson("/api/browser/inserttext", { method: "POST", body: JSON.stringify({ text: "a\u0001b" }) });
check("caratteri di controllo rifiutati con 400", controllo.status === 400, `status ${controllo.status}`);
const lungo = await apiJson("/api/browser/inserttext", { method: "POST", body: JSON.stringify({ text: "a".repeat(8193) }) });
check("testo oltre il tetto rifiutato con 400", lungo.status === 400, `status ${lungo.status}`);
check("dopo i rifiuti la pagina è ancora intatta", (await valoreCampo()) === prima);

// ---------------- 2. il testo arriva davvero nel campo attivo ----------------
console.log("\n== 2. il testo incollato arriva nel campo attivo ==");
const esito = await apiJson("/api/browser/inserttext", { method: "POST", body: JSON.stringify({ text: testo }) });
check("inserimento accettato con 200", esito.status === 200, JSON.stringify(esito.body));
check("il server riporta il numero di caratteri", esito.body.chars === testo.length, JSON.stringify(esito.body));
await wait(500);
check("il campo del sito contiene il testo, accenti e simboli compresi", (await valoreCampo()) === testo, JSON.stringify(await valoreCampo()));

// ---------------- 3-6. la riga della live view, in browser vero ----------------
console.log("\n== 3. la riga «scrivi qui / incolla» nella pagina della dashboard ==");
try { abUi(["open", `${BASE}/`]); } catch {}
try { abUi(["set", "viewport", "1280", "900"]); } catch {}
await wait(2000);
const esiste = (sel) => ui(`return !!document.querySelector(${JSON.stringify(sel)});`);
check("i quattro elementi della riga esistono nel markup",
  (await esiste("#liveTypeBar")) && (await esiste("#liveTypeBox")) && (await esiste("#livePasteBtn")) &&
  (await esiste("#liveBackspaceBtn")) && (await esiste("#liveEnterBtn")));

/* la vista live: la si apre dalla UI, così il flusso parte come quando la apri tu */
await ui(`document.querySelector('[data-tab="live"], #featLive').click(); return 1;`);
await wait(2500);
await ui(`if (!window.__errs) { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason))); } return 1;`);

// la modalità la decide il server: qui la riporto all'agente per vedere che la riga sparisca
await apiJson("/api/browser/control", { method: "POST", body: JSON.stringify({ mode: "agent" }) });
await wait(1200);
check("in modalità agente la riga è nascosta (non toglie spazio al browser)", (await ui(`return document.getElementById("liveTypeBar").hidden;`)) === true);
await apiJson("/api/browser/control", { method: "POST", body: JSON.stringify({ mode: "human" }) });
let visibile = false;
for (let i = 0; i < 15; i++) {
  visibile = (await ui(`return document.getElementById("liveTypeBar").hidden === false;`)) === true;
  if (visibile) break;
  await wait(700);
}
check("con il controllo tuo la riga compare", visibile);

// i caratteri vanno dal riquadro al SITO: il bersaglio è la sessione liveinput
try { ab(["focus", "#campo"]); } catch {}
await abUi(["type", "#liveTypeBox", "xy"]);
await wait(900);
check("digitare nel riquadro scrive nel campo del sito (tastiera da telefono)", (await valoreCampo()) === `${testo}xy`, JSON.stringify(await valoreCampo()));
check("il riquadro non trattiene il testo (è una tastiera, non un secondo campo)", (await ui(`return document.getElementById("liveTypeBox").value;`)) === "");

console.log("\n== 3b. su telefono la riga non mangia il riquadro del browser ==");
try { abUi(["set", "viewport", "390", "844"]); } catch {}
await wait(1800);
const misure = await ui(`const s = document.getElementById("liveStage").getBoundingClientRect();
const b = document.getElementById("liveTypeBar").getBoundingClientRect();
const t = document.getElementById("liveTypeBox").getBoundingClientRect();
return { riquadro: Math.round(s.height), riga: Math.round(b.height), campo: Math.round(t.height) };`);
check("il riquadro resta ampio anche con la riga visibile (>=300px)", misure.riquadro >= 300, JSON.stringify(misure));
check("il campo della riga è un bersaglio da dito (>=44px)", misure.campo >= 44, JSON.stringify(misure));
try { abUi(["set", "viewport", "1280", "900"]); } catch {}
await wait(800);
try { ab(["focus", "#campo"]); } catch {}

console.log("\n== 4. incollare nel riquadro va al sito, non nel riquadro ==");
await ui(`const dt = new DataTransfer(); dt.setData("text", " incollato"); const el = document.getElementById("liveTypeBox"); el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); return 1;`);
await wait(1200);
check("il testo incollato arriva nel campo del sito", (await valoreCampo()) === `${testo}xy incollato`, JSON.stringify(await valoreCampo()));
check("il testo incollato non resta nel riquadro", (await ui(`return document.getElementById("liveTypeBox").value;`)) === "");

console.log("\n== 5. ⌫ cancella nel sito ==");
await ui(`document.getElementById("liveBackspaceBtn").click(); return 1;`);
await wait(1200);
check("⌫ toglie un carattere nel campo del sito", (await valoreCampo()) === `${testo}xy incollat`, JSON.stringify(await valoreCampo()));

console.log("\n== 6. i tasti speciali dal riquadro ==");
await abUi(["focus", "#liveTypeBox"]);
await abUi(["press", "Backspace"]);
await wait(1000);
check("Backspace dal riquadro cancella nel sito", (await valoreCampo()) === `${testo}xy incolla`, JSON.stringify(await valoreCampo()));

console.log("\n== 7. canale degli input giù: si vede, non fallisce in silenzio ==");
// Il difetto da non avere: si scrive, non succede niente e nessuno lo dice. Qui si spegne il
// flusso di proposito e si pretende che la vista lo dica.
const valorePrima = await valoreCampo();
await apiJson("/api/browser/watch", { method: "POST", body: JSON.stringify({ on: false }) });
await wait(1500);
await ui(`const el = document.getElementById("liveTypeBox"); el.value = "z"; el.dispatchEvent(new Event("input", { bubbles: true })); return 1;`);
await wait(1500);
const logView = String(await ui(`return document.getElementById("liveChatLog").textContent;`));
check("il log avvisa che i tasti non sono arrivati", /non sono arrivati al browser/.test(logView), JSON.stringify(logView.slice(-170)));
check("il carattere perso non è finito nella pagina", (await valoreCampo()) === valorePrima, JSON.stringify(await valoreCampo()));

await apiJson("/api/browser/watch", { method: "POST", body: JSON.stringify({ on: true }) });
let ripristinato = false;
for (let i = 0; i < 25; i++) {
  const l = (await apiJson("/api/browser/live")).body.live || {};
  if (l.connected && l.frames > 0) { ripristinato = true; break; }
  await wait(1000);
}
check("il ponte si riattacca da sé", ripristinato);
try { ab(["focus", "#campo"]); } catch {}
await ui(`const el = document.getElementById("liveTypeBox"); el.value = "q"; el.dispatchEvent(new Event("input", { bubbles: true })); return 1;`);
await wait(1500);
check("riattaccato il ponte, i tasti tornano ad arrivare", (await valoreCampo()) === `${valorePrima}q`, JSON.stringify(await valoreCampo()));

console.log("\n== 8. nessun errore JavaScript nella pagina ==");
const errs = await ui(`return window.__errs || [];`);
check("la dashboard non ha registrato errori", Array.isArray(errs) && errs.length === 0, JSON.stringify(errs).slice(0, 200));

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
cleanup();
process.exit(fail === 0 ? 0 : 1);
