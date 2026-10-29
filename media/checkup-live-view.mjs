/**
 * CHECKUP DELLA LIVE VIEW DEL BROWSER — misure, non impressioni.
 *
 * Cosa fa: avvia una dashboard ISOLATA (porta 8494, dati in /tmp), un proxy che inietta
 * l'autenticazione (8495) e un sito di prova (8497) che REGISTRA gli eventi che riceve.
 * Poi apre la dashboard in un browser (sessione `checkup-ui`) e la pagina di prova in un
 * altro (sessione `checkup-live`), e verifica cosa arriva davvero al sito quando si usa
 * il riquadro: click, doppio click, trascinamento, passaggio del mouse, rotella, tasti.
 *
 * Perché due sessioni: la live view mostra il browser della sessione che la dashboard
 * pilota. Se la dashboard fosse aperta in quello stesso browser, la vista mostrerebbe sé
 * stessa (ricorsione) e non si misurerebbe niente.
 *
 * Uso: node media/checkup-live-view.mjs [--solo=click,dblclick] [--tieni]
 *   --solo=<lista>  esegue solo i gruppi indicati (per iterare in fretta)
 *   --tieni         non chiude l'istanza alla fine (per guardare a mano)
 * Nessun effetto sull'istanza vera: porte e cartelle sono separate.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8494;
const PROXY = 8495;
const SITE = 8497;
const TMP = "/tmp/pi-checkup-live";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "checkup-live";     // browser pilotato (mostra il sito)
const SESSION_UI = "checkup-ui";    // browser che guarda la dashboard
const AUTH = "Basic " + Buffer.from("ck:ck").toString("base64");
const BASE = `http://127.0.0.1:${PROXY}`;
const WRAPPER = path.join(TMP, "pb-checkup");
const OUT = path.join(ROOT, "media", "checkup");

const args = process.argv.slice(2);
const solo = (args.find((a) => a.startsWith("--solo=")) || "").slice(7).split(",").filter(Boolean);
const tieni = args.includes("--tieni");
const vuoi = (g) => !solo.length || solo.includes(g);

let pass = 0, fail = 0, noti = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
/** Un controllo che oggi si SA rotto: si dichiara invece di nasconderlo. */
const noto = (m) => { console.log("  ○ " + m + "  (difetto noto)"); noti++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ab = (a, o = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...a], {
    encoding: "utf8", timeout: 90_000, ...o,
  });
const abUi = (a, o = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION_UI, ...a], {
    encoding: "utf8", timeout: 90_000, ...o,
  });
const ui = (expr) => {
  const out = abUi(["eval", `(async () => { ${expr} })()`]).trim();
  const p1 = (() => { try { return JSON.parse(out); } catch { return undefined; } })();
  if (p1 === undefined) return out;
  if (typeof p1 === "string") { try { return JSON.parse(p1); } catch { return p1; } }
  return p1;
};
const sito = (expr) => {
  const out = ab(["eval", `(async () => { ${expr} })()`]).trim();
  const p1 = (() => { try { return JSON.parse(out); } catch { return undefined; } })();
  if (p1 === undefined) return out;
  if (typeof p1 === "string") { try { return JSON.parse(p1); } catch { return p1; } }
  return p1;
};
/** Lo screenshot lo scrive il browser (utente pi-browser), che non può scrivere in
 *  media/: si salva in /tmp e poi si copia dove serve guardarli. */
const scatta = (nome) => {
  const tmp = path.join(TMP, "shot", nome);
  try { abUi(["screenshot", tmp]); fs.copyFileSync(tmp, path.join(OUT, nome)); } catch (e) { console.log("  (screenshot non riuscito: " + String(e.message).split("\n")[0] + ")"); }
};
const api = (p, o = {}) =>
  fetch(BASE + p, { ...o, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(o.headers || {}) } });
const apiJson = async (p, o) => { const r = await api(p, o); return { status: r.status, body: await r.json().catch(() => ({})) }; };

/* ---------------- preparazione ---------------- */
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(TMP, "shot"), { recursive: true });
fs.chmodSync(path.join(TMP, "shot"), 0o777); // ci scrive il browser (utente pi-browser)
for (const d of ["sessions", "media", "root", "skills", "site"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const PAGINA = `<!doctype html><meta charset="utf-8"><title>banco di prova</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; }
  #bersaglio { width: 600px; height: 300px; background: #1a2233; color: #cfe; margin: 20px; display: grid; place-items: center; }
  #hover { width: 600px; height: 60px; background: #333; margin: 20px; }
  #hover.sopra { background: #3a6; }
  #slider { width: 400px; margin: 20px; }
  #alto { height: 1800px; background: linear-gradient(#000,#123); margin: 20px; }
  #campo { width: 500px; margin: 20px; font-size: 20px; }
</style>
<div id="bersaglio">bersaglio (600×300)</div>
<div id="hover">passa il mouse qui</div>
<input id="slider" type="range" min="0" max="100" value="0">
<input id="campo" type="text">
<div id="alto">zona alta</div>
<script>
  window.__log = [];
  const L = (tipo, e) => window.__log.push({ tipo, x: e && e.clientX, y: e && e.clientY, btn: e && e.button, det: e && e.detail, t: Date.now(), sy: window.scrollY });
  for (const t of ["mousedown", "mouseup", "click", "dblclick", "contextmenu", "mousemove", "mouseover", "wheel"]) {
    document.addEventListener(t, (e) => { if (t === "mousemove" && !e.buttons) { window.__mosse = (window.__mosse || 0) + 1; } L(t, e); }, true);
  }
  document.addEventListener("keydown", (e) => window.__log.push({ tipo: "keydown", key: e.key }));
  window.__mosse = 0;
  document.getElementById("hover").addEventListener("mouseover", (e) => e.currentTarget.classList.add("sopra"));
  window.__stato = () => ({
    log: window.__log.slice(-40), mosse: window.__mosse || 0,
    scrollY: window.scrollY, slider: document.getElementById("slider").value,
    campo: document.getElementById("campo").value, hover: document.getElementById("hover").className,
    url: location.href,
  });
</script>`;
fs.writeFileSync(path.join(TMP, "site", "index.html"), PAGINA);
fs.writeFileSync(path.join(TMP, "site", "seconda.html"), "<!doctype html><title>seconda</title><h1>seconda pagina</h1>");
fs.writeFileSync(WRAPPER, `#!/bin/sh\nexec ${PBROWSER} --session ${SESSION} "$@"\n`);
fs.chmodSync(WRAPPER, 0o755);

const LOG_FD = fs.openSync(path.join(TMP, "dash.log"), "a");
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
  DASH_USER: "ck",
  DASH_PASSWORD: "ck",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], { cwd: ROOT, env, stdio: ["ignore", LOG_FD, LOG_FD] });
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "ck", "ck"], { cwd: ROOT, stdio: "ignore" });
const site = spawn("python3", ["-m", "http.server", String(SITE), "--bind", "127.0.0.1", "--directory", path.join(TMP, "site")], { stdio: "ignore" });

const chiudi = (s) => { try { execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", s, "close"], { stdio: "ignore", timeout: 60_000 }); } catch {} };
const cleanup = () => {
  chiudi(SESSION); chiudi(SESSION_UI);
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
  try { site.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${BASE}/api/state`, { headers: { Authorization: AUTH } })).status === 200) { up = true; break; } } catch {}
  await wait(1000);
}
if (!up) { console.log("✘ istanza di prova non partita"); cleanup(); process.exit(1); }
console.log(`istanza :${PORT} + proxy :${PROXY} + sito :${SITE} attivi\n`);

for (const s of [SESSION, SESSION_UI]) {
  const dir = `/home/pi-browser/.agent-browser/profile-${s}`;
  chiudi(s);
  try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${dir}`], { stdio: "ignore" }); } catch {}
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
await wait(800);

/* il browser pilotato apre il sito e prende il controllo */
let su = false;
for (let i = 0; i < 4 && !su; i++) {
  try { ab(["open", `http://127.0.0.1:${SITE}/`]); su = true; } catch { await wait(2500); }
}
if (!su) { console.log("✘ non riesco ad avviare il browser di prova"); cleanup(); process.exit(1); }
try { ab(["set", "viewport", "1280", "720"]); } catch {}

const livePronta = async () => {
  const r = await (await api("/api/browser/live")).json();
  return r;
};

/* --- la dashboard, vista da un altro browser --- */
if (vuoi("ui")) {
  console.log("== 0. la vista live si apre e riceve i frame ==");
  try { abUi(["open", `${BASE}/`]); } catch {}
  try { abUi(["set", "viewport", "1440", "900"]); } catch {}
  await wait(2000);
  await ui(`document.querySelector('[data-tab="live"], #featLive').click(); return 1;`);
  await wait(2500);
  await ui(`if (!window.__errs) { window.__errs = []; addEventListener("error", (e) => window.__errs.push(String(e.message))); addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason))); } return 1;`);
  let stato = {};
  for (let i = 0; i < 25; i++) {
    stato = (await livePronta()).live || {};
    if (stato.connected && stato.frames > 0) break;
    await wait(1000);
  }
  check("il ponte è connesso e arrivano frame", !!stato.connected && (stato.frames || 0) > 0, JSON.stringify(stato).slice(0, 160));
  const img = await ui(`const i = document.getElementById("liveImg"); return { w: i.naturalWidth, h: i.naturalHeight, vis: i.getBoundingClientRect().width };`);
  check("il frame è disegnato con dimensioni vere", img.w > 0 && img.h > 0, JSON.stringify(img));
  scatta("01-live-desktop.png");
}

/* --- modalità controllo: da qui in poi gli input sono dell'utente --- */
if (vuoi("ui") || vuoi("input")) {
  await apiJson("/api/browser/control", { method: "POST", body: JSON.stringify({ mode: "human" }) });
  await wait(800);
}
const stato = async () => sito(`return window.__stato();`);
const azzera = async () => sito(`window.__log = []; window.__mosse = 0; return 1;`);
/** centro di un elemento della pagina, in coordinate CSS del dispositivo */
const centro = async (sel) => {
  const b = await sito(`const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
  return { x: Math.round(b.x), y: Math.round(b.y) };
};
/** coordinate, sull'immagine della live view, che corrispondono a un punto del sito */
const puntoSullImmagine = async (sel) => {
  const c = await centro(sel);
  const box = await ui(`const i = document.getElementById("liveImg"); const r = i.getBoundingClientRect();
    return { left: r.left, top: r.top, w: r.width, h: r.height, nw: i.naturalWidth, nh: i.naturalHeight };`);
  return { x: Math.round(box.left + (c.x * box.w) / box.nw), y: Math.round(box.top + (c.y * box.h) / box.nh) };
};
const cliccaSulSito = async (sel) => {
  const p = await puntoSullImmagine(sel);
  await abUi(["mouse", "move", String(p.x), String(p.y)]);
  await abUi(["mouse", "down"]);
  await abUi(["mouse", "up"]);
};

if (vuoi("click")) {
  console.log("\n== 1. click sul riquadro → click nel sito ==");
  await azzera();
  await cliccaSulSito("#bersaglio");
  await wait(900);
  const s = await stato();
  const click = (s.log || []).filter((l) => l.tipo === "click");
  check("il sito ha ricevuto il click", click.length === 1, JSON.stringify(s.log));
  const c = await centro("#bersaglio");
  const q = click[0] || {};
  check("le coordinate arrivano al posto giusto (±4px)", Math.abs((q.x || 0) - c.x) <= 4 && Math.abs((q.y || 0) - c.y) <= 4, `atteso ${c.x},${c.y} — arrivato ${q.x},${q.y}`);
  scatta("02-dopo-click.png");
}

if (vuoi("dblclick")) {
  console.log("\n== 2. doppio click → dblclick nel sito ==");
  await azzera();
  const p = await puntoSullImmagine("#bersaglio");
  await abUi(["mouse", "move", String(p.x), String(p.y)]);
  for (let i = 0; i < 2; i++) { await abUi(["mouse", "down"]); await abUi(["mouse", "up"]); await wait(90); }
  await wait(900);
  const s = await stato();
  const dbl = (s.log || []).filter((l) => l.tipo === "dblclick");
  check("il sito ha ricevuto un dblclick (non due click separati)", dbl.length === 1, JSON.stringify((s.log || []).map((l) => l.tipo)));
}

if (vuoi("hover")) {
  console.log("\n== 3. passaggio del mouse → hover nel sito ==");
  await azzera();
  const p = await puntoSullImmagine("#hover");
  await abUi(["mouse", "move", String(p.x), String(p.y)]);
  await wait(900);
  const s = await stato();
  check("il sito ha ricevuto il passaggio (mouseover)", (s.log || []).some((l) => l.tipo === "mouseover"), JSON.stringify((s.log || []).map((l) => l.tipo)));
  check("l'effetto hover si vede (classe .sopra)", /sopra/.test(s.hover || ""), String(s.hover));
}

if (vuoi("drag")) {
  console.log("\n== 4. trascinamento → il cursore dello slider si muove ==");
  await azzera();
  const a = await puntoSullImmagine("#slider");
  const off = await ui(`const i = document.getElementById("liveImg"); const r = i.getBoundingClientRect(); return r.width / i.naturalWidth;`);
  await abUi(["mouse", "move", String(a.x - Math.round(150 * off)), String(a.y)]);
  await abUi(["mouse", "down"]);
  for (let i = 1; i <= 8; i++) { await abUi(["mouse", "move", String(a.x - Math.round(150 * off) + Math.round(i * 40 * off)), String(a.y)]); await wait(70); }
  await abUi(["mouse", "up"]);
  await wait(900);
  const s = await stato();
  const mosse = (s.log || []).filter((l) => l.tipo === "mousemove").length;
  check("i movimenti del trascinamento arrivano al sito", mosse >= 4, `${mosse} mousemove`);
  check("lo slider è stato trascinato (valore > 50)", Number(s.slider) > 50, `valore ${s.slider}, eventi ${JSON.stringify((s.log || []).map((l) => l.tipo))}`);
}

if (vuoi("wheel")) {
  console.log("\n== 5. rotella sul riquadro → la pagina del sito scorre ==");
  await sito(`window.scrollTo(0, 0); return 1;`);
  await wait(400);
  const p = await puntoSullImmagine("#bersaglio");
  await abUi(["mouse", "move", String(p.x), String(p.y)]);
  await ui(`document.getElementById("liveStage").dispatchEvent(new WheelEvent("wheel", { deltaY: 400, bubbles: true, cancelable: true })); return 1;`);
  await wait(1500);
  const s = await stato();
  check("la pagina del sito è scorsa", (s.scrollY || 0) > 0, `scrollY ${s.scrollY}`);
}

if (vuoi("tasti")) {
  console.log("\n== 6. tastiera fisica → il testo arriva nel campo, in ordine ==");
  try { ab(["focus", "#campo"]); } catch {}
  await sito(`document.getElementById("campo").value = ""; document.getElementById("campo").focus(); return 1;`);
  await wait(500);
  await ui(`document.getElementById("liveStage").focus && document.getElementById("liveStage").focus(); return 1;`);
  const testo = "abcdefghij";
  for (const ch of testo) { await abUi(["press", ch]); await wait(60); }
  await wait(1500);
  const s = await stato();
  check("tutti i caratteri sono arrivati", (s.campo || "").length === testo.length, `"${s.campo}" (${(s.campo || "").length}/${testo.length})`);
  check("sono arrivati nell'ordine giusto", s.campo === testo, `"${s.campo}"`);
}

if (vuoi("zoom")) {
  console.log("\n== 7. ingrandimento: con 2× la rotella muove il RIQUADRO, non la pagina del sito ==");
  await sito(`window.scrollTo(0, 0); return 1;`);
  await ui(`let n = 0; while (document.getElementById("liveZoom").textContent.indexOf("2×") < 0 && n++ < 5) document.getElementById("liveZoom").click(); return document.getElementById("liveZoom").textContent;`);
  await wait(1200);
  const p = await puntoSullImmagine("#bersaglio");
  await abUi(["mouse", "move", String(p.x), String(p.y)]);
  await ui(`document.getElementById("liveStage").dispatchEvent(new WheelEvent("wheel", { deltaY: 400, bubbles: true, cancelable: true })); return 1;`);
  await wait(1200);
  const s = await stato();
  const st = await ui(`const st = document.getElementById("liveStage"); return { scrollTop: st.scrollTop, zoom: st.className,
    scrollabile: st.scrollHeight > st.clientHeight, sh: st.scrollHeight, ch: st.clientHeight, overflow: getComputedStyle(st).overflow };`);
  check("con 2× la pagina del sito NON scorre da sola", (s.scrollY || 0) === 0, `scrollY ${s.scrollY}`);
  check("con 2× il riquadro è scorribile in locale (il pan è possibile)", st.scrollabile && st.overflow === "auto", JSON.stringify(st));
  const pan = await ui(`const st = document.getElementById("liveStage"); st.scrollTop = 120; return { scrollTop: st.scrollTop };`);
  check("con 2× il contenuto si sposta davvero (scrollTop)", pan.scrollTop > 0, JSON.stringify(pan));
  await ui(`let n = 0; while (document.getElementById("liveZoom").textContent.indexOf("adatta") < 0 && n++ < 5) document.getElementById("liveZoom").click(); return 1;`);
}

if (vuoi("full")) {
  console.log("\n== 8. schermo intero ==");
  const prima = await ui(`const w = document.querySelector(".livewrap").getBoundingClientRect(); return { h: Math.round(w.height), ih: innerHeight };`);
  await ui(`document.getElementById("liveFull").click(); return 1;`);
  await wait(900);
  const dopo = await ui(`const el = document.querySelector(".livewrap"); const w = el.getBoundingClientRect();
    const t = document.querySelector("#liveView > .gtoolbar").getBoundingClientRect();
    const st = document.getElementById("liveStage").getBoundingClientRect();
    return { full: el.classList.contains("full"), h: Math.round(w.height), ih: innerHeight, toolbarVisibile: t.bottom > 0 && t.height > 0,
             stage: Math.round(st.height), w: Math.round(st.width), body: document.body.className };`);
  check("il riquadro passa a schermo intero", dopo.full === true, JSON.stringify(dopo));
  check("occupa l'altezza della finestra", Math.abs(dopo.h - dopo.ih) <= 2, JSON.stringify({ prima, dopo }));
  check("la barra dei comandi resta raggiungibile", dopo.toolbarVisibile === true, JSON.stringify(dopo));
  check("il riquadro del browser si allarga (>=90% della larghezza)", dopo.w >= Math.round((await ui("return innerWidth;")) * 0.9), JSON.stringify(dopo));
  await wait(2800);
  const vp = (await (await api("/api/browser/live")).json()).live.viewport || {};
  const area = await ui(`const r = document.getElementById("liveStage").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };`);
  const rap = (w, h) => (w && h ? w / h : 0);
  check("il browser remoto si adatta all'area dello schermo intero",
    Math.abs(rap(vp.width, vp.height) - rap(area.w, area.h)) < 0.12 && Math.abs((vp.width || 0) - area.w) < 80,
    JSON.stringify({ viewport: vp, area }));
  scatta("03-fullscreen-desktop.png");
  await abUi(["press", "Escape"]);
  await wait(700);
  check("Esc esce dallo schermo intero", (await ui(`return document.querySelector(".livewrap").classList.contains("full");`)) === false);
}

if (vuoi("naviga")) {
  console.log("\n== 9. barra indirizzi, indietro e avanti ==");
  await ui(`const b = document.getElementById("liveUrlBar"); b.focus(); b.value = "http://127.0.0.1:${SITE}/seconda.html"; b.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return 1;`);
  await wait(2500);
  check("la navigazione arriva al sito", /seconda/.test(String(await ui(`return document.getElementById("liveUrlBar").value;`))), String(await ui(`return document.getElementById("liveUrlBar").value;`)));
  check("esiste il pulsante «indietro» della cronologia", (await ui(`return !!document.getElementById("liveHistoryBack");`)) === true);
  await ui(`document.getElementById("liveHistoryBack").click(); return 1;`);
  await wait(2500);
  check("«indietro» riporta alla pagina precedente", !/seconda/.test(String(await ui(`return document.getElementById("liveUrlBar").value;`))), String(await ui(`return document.getElementById("liveUrlBar").value;`)));
  await ui(`document.getElementById("liveHistoryFwd").click(); return 1;`);
  await wait(2500);
  check("«avanti» ci riporta", /seconda/.test(String(await ui(`return document.getElementById("liveUrlBar").value;`))), String(await ui(`return document.getElementById("liveUrlBar").value;`)));
}

if (vuoi("mobile")) {
  console.log("\n== 10. telefono (390×844) ==");
  try { abUi(["set", "viewport", "390", "844"]); } catch {}
  await wait(1500);
  // il cambio di viewport del browser di prova può ricaricare la dashboard: si riapre la vista
  await ui(`if (document.body.dataset.tab !== "live") { const b = document.querySelector('[data-tab="live"], #featLive'); if (b) b.click(); } return 1;`);
  await wait(2500);
  const m = await ui(`const s = document.getElementById("liveStage").getBoundingClientRect();
    const u = document.getElementById("liveUrlBar").getBoundingClientRect();
    const t = document.querySelector("#liveView > .gtoolbar").getBoundingClientRect();
    const figli = Array.from(document.querySelectorAll("#liveView > .gtoolbar > *")).filter((x) => x.offsetParent !== null || x.classList.contains("livedot"));
    const righe = new Set(figli.map((x) => Math.round(x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2))).size;
    const fuori = figli.filter((x) => x.getBoundingClientRect().right > innerWidth + 1).length;
    const b = Array.from(document.querySelectorAll("#liveView > .gtoolbar .ghost")).map((x) => Math.round(x.getBoundingClientRect().height));
    return { stage: Math.round(s.height), url: Math.round(u.height), toolbar: Math.round(t.height), righe, fuori, bottoni: b, ih: innerHeight };`);
  check("con il log aperto il riquadro resta ampio (>=340px su 844)", m.stage >= 340, JSON.stringify(m));
  check("nessun comando esce dallo schermo", m.fuori === 0, JSON.stringify(m));
  // log chiuso: è lo stato in cui si guarda la pagina
  await ui(`const log = document.getElementById("liveChatLog"); let n = 0;
    while (!log.classList.contains("hidden") && n++ < 5) document.getElementById("liveLogToggle").click();
    return 1;`);
  await wait(700);
  const mc = await ui(`const s = document.getElementById("liveStage").getBoundingClientRect();
    const c = document.getElementById("liveChatLog"); const in_ = document.querySelector(".livechatin");
    return { stage: Math.round(s.height), logNascosto: c.classList.contains("hidden"), comandoVisibile: in_.offsetParent !== null };`);
  check("con il log chiuso il riquadro prende lo spazio (>=460px)", mc.stage >= 460, JSON.stringify(mc));
  check("a log chiuso sparisce anche il campo comandi", mc.comandoVisibile === false, JSON.stringify(mc));
  await wait(2600);
  const vpm = (await (await api("/api/browser/live")).json()).live.viewport || {};
  const aream = await ui(`const r = document.getElementById("liveStage").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) };`);
  check("su telefono il browser remoto prende la misura del riquadro (frame verticale, leggibile)",
    Math.abs((vpm.width || 0) - aream.w) < 40 && Math.abs((vpm.height || 0) - aream.h) < 40,
    JSON.stringify({ viewport: vpm, area: aream }));
  check("il campo indirizzi è un bersaglio da dito (>=44px)", m.url >= 44, JSON.stringify(m));
  check("la barra dei comandi sta su una riga", m.righe <= 1, JSON.stringify(m));
  check("i pulsanti sono bersagli da dito (>=36px)", (m.bottoni || []).every((h) => h >= 36), JSON.stringify(m.bottoni));
  scatta("04-live-mobile.png");
  await ui(`document.getElementById("liveFull").click(); return 1;`);
  await wait(900);
  const mf = await ui(`const s = document.getElementById("liveStage").getBoundingClientRect();
    const t = document.querySelector("#liveView > .gtoolbar").getBoundingClientRect();
    return { stage: Math.round(s.height), toolbar: Math.round(t.height), ih: innerHeight, w: Math.round(s.width), out: !!document.getElementById("liveFull").offsetParent };`);
  console.log(`  misure telefono: riquadro ${m.stage}px (log aperto), ${mc.stage}px (log chiuso), ${mf.stage}px (schermo intero)`);
  check("a schermo intero su telefono il riquadro cresce", mf.stage > m.stage, JSON.stringify({ normale: m.stage, pieno: mf.stage }));
  check("su telefono resta un modo per uscire (pulsante visibile)", mf.out === true, JSON.stringify(mf));
  scatta("05-live-mobile-full.png");
  await ui(`document.getElementById("liveFull").click(); return 1;`);
  try { abUi(["set", "viewport", "1440", "900"]); } catch {}
  await wait(800);
}

if (vuoi("errori")) {
  console.log("\n== 11. nessun errore JavaScript ==");
  const errs = await ui(`return window.__errs || [];`);
  check("la dashboard non ha registrato errori", Array.isArray(errs) && errs.length === 0, JSON.stringify(errs).slice(0, 300));
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti, ${noti} difetti noti`);
console.log(`screenshot in ${OUT}`);
if (!tieni) { cleanup(); process.exit(fail === 0 ? 0 : 1); }
console.log("istanza lasciata attiva (--tieni): chiudila con Ctrl+C");
