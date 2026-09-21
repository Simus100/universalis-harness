/**
 * MATRICE FUNZIONALE IN BROWSER VERO (FASE 2 del goal).
 *
 * La suite esistente verifica quasi tutto via API; qui si verifica ciò che l'utente FA
 * davvero nella pagina: inviare, fermare, lo storico, gli snippet, il drawer delle chat,
 * il file manager (apri/modifica/salva), la ricerca nei file e la palette dei comandi slash.
 * Raccoglie anche gli errori JavaScript della pagina: se il frontend lancia eccezioni, il
 * test lo dice invece di limitarsi a "la vista si apre".
 *
 * Avvia da sé un'istanza isolata + proxy di autenticazione e una sessione browser dedicata.
 * Uso: node media/test-funzionalita-browser.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8492;
const PROXY = 8493;
const TMP = "/tmp/pi-funz";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "functest";
const AUTH = "Basic " + Buffer.from("ft:ft").toString("base64");
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 90_000,
    ...opts,
  });
const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  const parse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  const primo = parse(out);
  // una stringa vuota è un risultato valido e non deve diventare { raw: ... }:
  // altrimenti i controlli su "nessun avviso di connessione" e sui testi falliscono
  if (primo === undefined) return { raw: out };
  if (typeof primo === "string") {
    const secondo = parse(primo);
    return secondo === undefined ? primo : secondo;
  }
  return primo;
};
const ui = (expr) => evalJs(`(async () => { ${expr} })()`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, opts = {}) =>
  fetch(BASE + p, { ...opts, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) } });

/* ---------------- setup: istanza isolata + proxy ---------------- */
fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root", "skills"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });
fs.writeFileSync(path.join(TMP, "root", "documento-di-prova.txt"), "contenuto originale con la parola cercabile\n");

const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_ASK: "off", // istanza NON presidiata: nessuno risponderebbe a una domanda
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_USER: "ft",
  DASH_PASSWORD: "ft",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], { cwd: ROOT, env, stdio: "ignore" });
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "ft", "ft"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => {
  try { ab(["close"], { stdio: "ignore" }); } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PROXY}/api/state`, { headers: { Authorization: AUTH } });
    if (r.status === 200) { up = true; break; }
  } catch {}
  await wait(1000);
}
if (!up) { console.log("✘ istanza di prova non partita"); process.exit(1); }
console.log(`istanza ${PORT} + proxy ${PROXY} attivi\n`);

/* sessione browser pulita */
const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;
try { ab(["close"]); } catch {}
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" }); } catch {}
await wait(1200);
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try { ab(["open", `http://127.0.0.1:${PROXY}/`]); aperto = true; } catch { await wait(2500); }
}
if (!aperto) { console.log("✘ non riesco ad avviare il browser di test"); cleanup(); process.exit(1); }
try { ab(["set", "viewport", "1280", "900"]); } catch {}
try { ab(["open", `http://127.0.0.1:${PROXY}/`]); } catch {}
await wait(2000);

/* il modello risponde più in fretta e il test misura il FRONTEND, non il ragionamento */
await api("/api/thinking", { method: "POST", body: JSON.stringify({ level: "low" }) });

/* errori JavaScript della pagina: si registrano, non si ignorano */
ui(`if (!window.__errs) { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason))); } return 1;`);
/* i dialog nativi bloccherebbero il browser headless: si risponde in modo controllato */
ui(`window.prompt = () => "nome-di-prova"; window.confirm = () => true; return 1;`);

const txt = (sel) => ui(`const n = document.querySelector(${JSON.stringify(sel)}); return n ? n.textContent : null;`);
const esiste = (sel) => ui(`return !!document.querySelector(${JSON.stringify(sel)});`);

// ---------------- 1. struttura della pagina ----------------
console.log("== 1. la pagina è quella giusta e non ha errori ==");
check("barra di stato con lo stato della connessione", await esiste("#connTxt"));
check("all'avvio non c'è alcun avviso di connessione", (await txt("#connTxt")) === "", JSON.stringify(await txt("#connTxt")));
check("casella di scrittura, invio e stop presenti", (await esiste("#input")) && (await esiste("#send")) && (await esiste("#stop")));

// ---------------- 2. invio di un messaggio e streaming ----------------
console.log("\n== 2. invio di un messaggio: risposta in streaming ==");
await ui(`const i = document.getElementById("input"); i.value = "Rispondi esattamente con: PROVA-OK"; i.dispatchEvent(new Event("input")); document.getElementById("send").click(); return 1;`);
// lo stato «working» è sincrono al click: se lo si verifica 1,5 s dopo, una risposta breve
// (come «PROVA-OK») è già finita e il controllo fallisce per un motivo che non è un difetto.
const stopAlClick = await ui(`return document.getElementById("stop").hidden === false && document.getElementById("send").hidden === true;`);
await wait(1500);
check("il messaggio dell'utente compare in chat", (await ui(`return document.querySelectorAll(".msg.user .bubble").length;`)) >= 1);
check("durante la generazione lo stop sostituisce l'invio", stopAlClick);
let risposta = "";
for (let i = 0; i < 60; i++) {
  risposta = await ui(`return [...document.querySelectorAll(".msg.assistant .bubble")].map(b => b.textContent).join("");`);
  if (risposta && risposta.includes("PROVA-OK")) break;
  await wait(1500);
}
check("la risposta arriva in chat senza ricaricare la pagina", risposta.includes("PROVA-OK"), JSON.stringify(risposta.slice(0, 60)));
for (let i = 0; i < 40; i++) { if (!(await ui(`return document.getElementById("dot").classList.contains("on");`))) break; await wait(1000); }
check("a fine risposta la UI torna in idle", !(await ui(`return document.getElementById("dot").classList.contains("on");`)));
check("il testo resta in una sola bolla (nessuna risposta spezzata)", (await ui(`return document.querySelectorAll(".msg.assistant .bubble").length;`)) === 1);

// ---------------- 3. stop dalla UI ----------------
console.log("\n== 3. stop: la generazione si interrompe davvero ==");
await ui(`const i = document.getElementById("input"); i.value = "Scrivi una lista numerata da 1 a 500, una parola per riga."; i.dispatchEvent(new Event("input")); document.getElementById("send").click(); return 1;`);
let partito = false;
for (let i = 0; i < 40; i++) { if (await ui(`return document.getElementById("dot").classList.contains("on");`)) { partito = true; break; } await wait(1000); }
check("la seconda generazione è partita", partito);
await ui(`document.getElementById("stop").click(); return 1;`);
let fermato = false;
for (let i = 0; i < 30; i++) { if (!(await ui(`return document.getElementById("dot").classList.contains("on");`))) { fermato = true; break; } await wait(1000); }
check("⏹ ferma la generazione", fermato);
check("il testo già arrivato resta a schermo", (await ui(`return [...document.querySelectorAll(".msg.assistant .bubble")].map(b => b.textContent).join("").length;`)) > 0);

// ---------------- 4. storico prompt ----------------
console.log("\n== 4. storico prompt (frecce) ==");
await ui(`const i = document.getElementById("input"); i.value = ""; i.dispatchEvent(new Event("input")); i.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); return 1;`);
const storico = await ui(`return document.getElementById("input").value;`);
check("↑ recupera l'ultimo prompt inviato", storico.includes("lista numerata"), JSON.stringify(storico.slice(0, 40)));

// ---------------- 5. snippet ----------------
console.log("\n== 5. snippet riutilizzabili ==");
await ui(`const i = document.getElementById("input"); i.value = "testo dello snippet di prova"; i.dispatchEvent(new Event("input")); document.getElementById("snipSave").click(); return 1;`);
const snips = await ui(`return JSON.parse(localStorage.getItem("pi.promptSnippets") || "[]");`);
check("★ snippet salva lo snippet", Array.isArray(snips) && snips.some((s) => s.text === "testo dello snippet di prova"), JSON.stringify(snips).slice(0, 80));
await ui(`document.getElementById("input").value = ""; document.getElementById("histBtn").click(); return 1;`);
check("il pannello storico/snippet si apre", await ui(`return getComputedStyle(document.getElementById("histPanel")).display !== "none";`));
await ui(`document.getElementById("histClose").click(); return 1;`);

// ---------------- 6. drawer delle chat ----------------
console.log("\n== 6. drawer: nuova chat, rinomina, elimina ==");
await ui(`document.getElementById("chatsBtn").click(); return 1;`);
await wait(400);
check("il drawer si apre con l'elenco delle chat", await ui(`return getComputedStyle(document.getElementById("drawer")).display !== "none" && document.querySelectorAll("#sessionList .sitem").length > 0;`));
const idPrima = (await (await api("/api/state")).json()).sessionId;
await ui(`document.getElementById("newChat").click(); return 1;`);
await wait(2500);
const idDopo = (await (await api("/api/state")).json()).sessionId;
check("«Nuova chat» crea davvero una chat nuova", idDopo !== idPrima, `${idPrima} → ${idDopo}`);
check("la chat nuova non mostra i messaggi della precedente", (await ui(`return document.querySelectorAll(".msg").length;`)) === 0);

// rinomina (il dialog è sostituito dallo stub)
await ui(`
  const ren = [...document.querySelectorAll("#sessionList .sact")].filter(b => (b.textContent || "").includes("rinomina"));
  if (!ren.length) return 0;
  ren[0].click();
  return 1;
`);
await wait(2000);
const elenco = await (await api("/api/sessions")).json();
check("✎ rinomina la chat attiva", elenco.sessions.some((s) => s.name === "nome-di-prova"), JSON.stringify(elenco.sessions.map((s) => s.name)));

// elimina (confirm sostituito dallo stub)
const idDaEliminare = elenco.current;
await ui(`
  const voci = [...document.querySelectorAll("#sessionList .sitem")];
  const idx = voci.findIndex(e => (e.textContent || "").includes("nome-di-prova"));
  const scelta = voci[idx >= 0 ? idx : 0];
  const del = scelta && scelta.querySelector(".sact.danger");
  if (!del) return 0;
  del.click();
  return 1;
`);
await wait(2000);
const dopoElimina = await (await api("/api/sessions")).json();
check("🗑 elimina la chat", !dopoElimina.sessions.some((s) => s.id === idDaEliminare), JSON.stringify(dopoElimina.sessions.map((s) => s.name)));
await ui(`if (getComputedStyle(document.getElementById("drawer")).display !== "none") document.getElementById("drawerClose").click(); return 1;`);

// ---------------- 7. file manager: apri, modifica, salva ----------------
console.log("\n== 7. file manager: apri, modifica e salva dall'editor ==");
await ui(`document.getElementById("tabFiles").click(); return 1;`);
await wait(800);
check("la vista file si apre", await ui(`return getComputedStyle(document.getElementById("filesView")).display !== "none";`));
await ui(`document.getElementById("fRefresh").click(); return 1;`);
await wait(1200);
check("la cartella radice elenca il file di prova", (await txt("#fileList") || "").includes("documento-di-prova.txt"), JSON.stringify((await txt("#fileList") || "").slice(0, 80)));
await ui(`
  const voce = [...document.querySelectorAll("#fileList *")].find(el => (el.textContent || "").trim() === "documento-di-prova.txt");
  if (voce) { voce.click(); return 1; }
  return 0;
`);
await wait(1500);
const contenuto = await ui(`return document.getElementById("eContent") ? document.getElementById("eContent").value : "";`);
check("il file si apre nell'editor con il suo contenuto", contenuto.includes("contenuto originale"), JSON.stringify(contenuto.slice(0, 60)));
await ui(`document.getElementById("eContent").value = "modificato dalla UI: parola-cercabile-2\\n"; document.getElementById("eSave").click(); return 1;`);
await wait(1500);
const salvato = await (await api("/api/file?path=" + encodeURIComponent("documento-di-prova.txt"))).json();
check("💾 salva davvero il file (verificato rileggendolo dal server)", (salvato.content || "").includes("parola-cercabile-2"), JSON.stringify((salvato.content || "").slice(0, 60)));

// ---------------- 8. ricerca nel contenuto dei file ----------------
console.log("\n== 8. ricerca nel contenuto dei file ==");
await ui(`document.getElementById("fSearch").click(); return 1;`);
await wait(400);
await ui(`const s = document.getElementById("fSearchInput"); s.value = "parola-cercabile-2"; s.dispatchEvent(new Event("input")); return 1;`);
await ui(`document.getElementById("fSearch").click(); return 1;`);
let risultati = "";
for (let i = 0; i < 15; i++) {
  risultati = (await txt("#fResults")) || "";
  if (risultati.includes("documento-di-prova")) break;
  await wait(1000);
}
check("la ricerca trova il contenuto appena salvato", risultati.includes("documento-di-prova"), JSON.stringify(risultati.slice(0, 80)));
await ui(`if (document.getElementById("fSearchClose")) document.getElementById("fSearchClose").click(); return 1;`);

// ---------------- 9. palette dei comandi slash ----------------
console.log("\n== 9. palette dei comandi slash ==");
await ui(`document.getElementById("tabChat").click(); return 1;`);
await wait(600);
await ui(`const i = document.getElementById("input"); i.value = "/"; i.dispatchEvent(new Event("input")); return 1;`);
await wait(500);
check("digitando «/» compare la palette", await ui(`return getComputedStyle(document.getElementById("cmdPanel")).display !== "none";`));
const vociPalette = await txt("#cmdList");
check("la palette elenca i comandi", (vociPalette || "").includes("/status") || (vociPalette || "").includes("/help"), JSON.stringify((vociPalette || "").slice(0, 80)));
await ui(`const i = document.getElementById("input"); i.value = "/status"; i.dispatchEvent(new Event("input")); i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); return 1;`);
await wait(2500);
const riga = await ui(`return [...document.querySelectorAll(".msg.cmd .who, .msg.cmd .bubble")].map(b => b.textContent).join("\\n").slice(-600);`);
check("il comando viene eseguito e la riga $ /status compare in chat", riga.includes("/status"), JSON.stringify(riga.slice(-120)));

// ---------------- 10. nessun errore JavaScript ----------------
console.log("\n== 10. salute del frontend ==");
const errs = await ui(`return window.__errs || [];`);
check("nessun errore JavaScript durante tutto il percorso", Array.isArray(errs) && errs.length === 0, JSON.stringify(errs).slice(0, 200));

console.log();
console.log(`risultato: ${pass} ok, ${fail} falliti`);
cleanup();
process.exit(fail ? 1 : 0);
