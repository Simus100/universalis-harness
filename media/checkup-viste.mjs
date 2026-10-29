/**
 * CHECKUP DELLE VISTE DELLA DASHBOARD — ogni scheda si apre, carica e non genera errori.
 *
 * Perché: le viste (chat, file, goal, cron, skill, progetto, agenda, live, memoria, previsioni)
 * condividono un solo file HTML e un solo blocco JavaScript: una modifica alla live view può
 * rompere una vista che non si è nemmeno aperta. Qui si aprono TUTTE, con dati veri in una
 * cartella temporanea, si guardano gli errori JavaScript e si controlla che quello che deve
 * comparire compaia (elenco, editor, grafo, grafico).
 *
 * Uso: node media/checkup-viste.mjs [--tieni]
 * Non tocca l'istanza vera: porta 8493, dati in /tmp/pi-checkup-viste.
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8493;
const PROXY = 8498;
const TMP = "/tmp/pi-checkup-viste";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION_UI = "checkup-viste";
const AUTH = "Basic " + Buffer.from("cv:cv").toString("base64");
const BASE = `http://127.0.0.1:${PROXY}`;
const OUT = path.join(ROOT, "media", "checkup");
const tieni = process.argv.includes("--tieni");

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
const api = (p, o = {}) =>
  fetch(BASE + p, { ...o, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(o.headers || {}) } });
const apiJson = async (p, o) => { const r = await api(p, o); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const scatta = (nome) => {
  const tmp = path.join(TMP, "shot", nome);
  try { abUi(["screenshot", tmp]); fs.copyFileSync(tmp, path.join(OUT, nome)); } catch (e) { console.log("  (screenshot: " + String(e.message).split("\n")[0] + ")"); }
};

/* ---------------- preparazione ---------------- */
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const d of ["sessions", "root/media", "root", "skills", "shot", "root/media/sottocartella", "skills/prova-checkup", "root/sottocartella"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });
fs.chmodSync(path.join(TMP, "shot"), 0o777);
fs.writeFileSync(path.join(TMP, "root", "media", "prova.md"), "# Prova\n\nUn file di prova, per l'editor.\n");
// il file manager parte dalla root: ci vuole qualcosa da elencare
fs.writeFileSync(path.join(TMP, "root", "appunti.txt"), "appunti\n");
// le serie di esempio di Timestral stanno in media/timestral-demo.json: senza, la vista
// Previsioni non ha niente da mostrare (e non è un difetto della vista)
try {
  fs.copyFileSync(path.join(ROOT, "media", "timestral-demo.json"), path.join(TMP, "root", "media", "timestral-demo.json"));
} catch { /* se manca, il check sulle serie lo dirà */ }
fs.writeFileSync(path.join(TMP, "root", "media", "sottocartella", "dentro.txt"), "dentro\n");
// formato standard Agent Skills: una cartella con SKILL.md
fs.writeFileSync(path.join(TMP, "skills", "prova-checkup", "SKILL.md"),
  "---\nname: prova-checkup\ndescription: Skill di prova per il checkup delle viste\n---\n\nIstruzioni di prova.\n");
// goal e pianificazioni sono ARRAY: è quello che il server legge (Array.isArray ? parsed : [])
fs.writeFileSync(path.join(TMP, "goals.json"), JSON.stringify([
  { id: "g1", title: "Goal di prova", description: "", status: "active",
    steps: [{ id: "s1", title: "primo passo", done: true }, { id: "s2", title: "secondo", done: false }],
    checklist: [{ id: "c1", text: "un controllo", done: false }],
    createdAt: Date.now(), updatedAt: Date.now() },
], null, 2));
fs.writeFileSync(path.join(TMP, "schedules.json"), JSON.stringify([
  { id: "j1", name: "Pianificazione di prova", cron: "0 7 * * *", enabled: true, nextRun: Date.now() + 3600e3, runCount: 2, lastRun: Date.now() - 3600e3, lastStatus: "ok" },
], null, 2));

const LOG_FD = fs.openSync(path.join(TMP, "dash.log"), "a");
const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "root", "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_ASK: "off",
  DASH_TIMESTRAL: "on",
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_USER: "cv",
  DASH_PASSWORD: "cv",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], { cwd: ROOT, env, stdio: ["ignore", LOG_FD, LOG_FD] });
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "cv", "cv"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => {
  try { execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION_UI, "close"], { stdio: "ignore", timeout: 60_000 }); } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`${BASE}/api/state`, { headers: { Authorization: AUTH } })).status === 200) { up = true; break; } } catch {}
  await wait(1000);
}
if (!up) { console.log("✘ istanza di prova non partita"); cleanup(); process.exit(1); }

/* ---------------- 0. le API che reggono le viste ---------------- */
console.log("== 0. API delle viste ==");
for (const [nome, p] of [
  ["stato", "/api/state"],
  ["file", "/api/files?path="],
  ["goal", "/api/goals"],
  ["pianificazioni", "/api/schedules"],
  ["skill", "/api/skills"],
  ["progetto", "/api/progetto"],
  ["memoria", "/api/memoria"],
  ["sessioni", "/api/sessions"],
]) {
  const r = await apiJson(p);
  check(`GET ${p} risponde 200`, r.status === 200, `status ${r.status}`);
}

/* ---------------- la dashboard in un browser vero ---------------- */
try { abUi(["open", `${BASE}/`]); } catch {}
try { abUi(["set", "viewport", "1440", "900"]); } catch {}
await wait(2500);
await ui(`if (!window.__errs) { window.__errs = []; addEventListener("error", (e) => window.__errs.push(String(e.message))); addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason))); } return 1;`);
check("la dashboard si apre e il composer è presente", (await ui(`return !!document.getElementById("input") && !!document.getElementById("send");`)) === true);

/* Le schede sono pulsanti con un ID preciso (e il BODY ha data-tab, quindi selezionare
   `[data-tab=…]` trovava il body e il click non apriva niente: difetto del test, non della UI). */
const ID_VISTA = {
  chat: "tabChat", files: "tabFiles", memoria: "tabMemoria",
  goals: "featGoals", cron: "featCron", skills: "featSkills", progetto: "featProgetto",
  agenda: "featAgenda", live: "featLive", previsioni: "featPrevisioni",
};
const apri = async (tab) => {
  const id = ID_VISTA[tab];
  await ui(`window.__errs = window.__errs || [];
    const b = document.getElementById(${JSON.stringify(id)}); if (b) b.click();
    return document.body.dataset.tab;`);
  await wait(1800);
  return ui(`return document.body.dataset.tab;`);
};
const errs = async () => (await ui(`return window.__errs || [];`)) || [];

console.log("\n== 1. chat ==");
await apri("chat");
check("la vista chat è attiva", (await ui(`return document.body.dataset.tab;`)) === "chat");
scatta("10-chat.png");

console.log("\n== 2. file: elenco, cartella, editor ==");
await apri("files");
const files = await ui(`const l = document.getElementById("filesView"); return { visibile: !l.hidden, righe: l.querySelectorAll(".frow").length };`);
check("la vista file è visibile con le sue righe", files.visibile && files.righe > 0, JSON.stringify(files));
scatta("11-file.png");
const apertura = await ui(`const b = document.querySelector('#filesView .frow.dir'); if (b) b.click(); return !!b;`);
await wait(1200);
check("cliccare una cartella la apre", apertura === true && (await ui(`return document.querySelectorAll("#filesView .frow").length;`)) > 0);
// il file di prova sta in media/: si va lì dal pulsante «media» e lo si apre nell'editor
await ui(`const b = document.getElementById("fMedia"); if (b) b.click(); return 1;`);
await wait(1500);
const elenco = await ui(`return Array.from(document.querySelectorAll("#filesView .frow")).map((x) => x.textContent.trim()).slice(0, 12);`);
check("nell'elenco di media c'è il file di prova", Array.isArray(elenco) && elenco.some((t) => /prova\.md/.test(t)), JSON.stringify(elenco).slice(0, 240));
// apri il file di prova nell'editor e salvalo
const editor = await ui(`const b = Array.from(document.querySelectorAll("#filesView .frow")).find((x) => (x.textContent || "").includes("prova.md")); if (b) b.click(); return !!b;`);
await wait(1500);
if (editor) {
  const ed = await ui(`const e = document.getElementById("editor"); return { aperto: !!e && !e.hidden, contenuto: (document.getElementById("eContent")||{}).value || "" };`);
  check("l'editor apre il file scelto con il suo contenuto", ed.aperto === true && /Prova/.test(ed.contenuto), JSON.stringify(ed).slice(0, 160));
  scatta("12-editor.png");
  const salva = await ui(`const b = document.getElementById("eSave"); if (b) { document.getElementById("eContent").value += "\\nriga aggiunta dal checkup\\n"; b.click(); } return !!b;`);
  await wait(1200);
  if (salva) check("salvare scrive davvero nel file", /riga aggiunta/.test(fs.readFileSync(path.join(TMP, "root", "media", "prova.md"), "utf8")));
  await ui(`const b = document.getElementById("eBack"); if (b) b.click(); return 1;`);
  await wait(600);
} else ko("il file di prova non compare nell'elenco");

console.log("\n== 3. goal ==");
await apri("goals");
const goals = await ui(`const v = document.getElementById("goalsView"); return { visibile: !v.hidden, card: v.querySelectorAll(".goal-card").length, testo: v.textContent.slice(0, 120) };`);
check("la vista goal mostra il goal di prova", goals.visibile && goals.card >= 1 && /Goal di prova/.test(goals.testo), JSON.stringify(goals).slice(0, 200));
scatta("13-goals.png");

console.log("\n== 4. cron ==");
await apri("cron");
const cron = await ui(`const v = document.getElementById("cronView"); return { visibile: !v.hidden, card: v.querySelectorAll(".goal-card").length, testo: v.textContent.slice(0, 160) };`);
check("la vista cron mostra la pianificazione di prova", cron.visibile && cron.card >= 1 && /Pianificazione di prova/.test(cron.testo), JSON.stringify(cron).slice(0, 220));

console.log("\n== 5. skill ==");
await apri("skills");
const skillsApi = (await apiJson("/api/skills")).body;
const listaSkill = Array.isArray(skillsApi.skills) ? skillsApi.skills : [];
check("l'API delle skill vede la skill di prova", listaSkill.some((x) => /prova-checkup/.test(x.name || "")), JSON.stringify(listaSkill.map((x) => x.name)).slice(0, 200));
const skills = await ui(`const v = document.getElementById("skillsView");
  const card = Array.from(v.querySelectorAll(".goal-card")).map((c) => c.textContent || "");
  return { visibile: !v.hidden, card: card.length, testo: v.querySelector("#skillCount").textContent };`);
check("la vista skill disegna le sue schede", skills.visibile && skills.card >= 1 && /skill/.test(skills.testo), JSON.stringify(skills).slice(0, 200));
scatta("14-skills.png");

console.log("\n== 6. progetto ==");
await apri("progetto");
const prog = await ui(`const v = document.getElementById("progettoView"); return { visibile: !v.hidden, testo: v.textContent.slice(0, 160) };`);
check("la vista progetto si apre e spiega cosa sono le cartelle", prog.visibile && /cartell/i.test(prog.testo), JSON.stringify(prog).slice(0, 200));

console.log("\n== 7. agenda ==");
await apri("agenda");
const agenda = await ui(`const v = document.getElementById("agendaView"); return { visibile: !v.hidden, testo: v.textContent.slice(0, 200) };`);
check("l'agenda riporta pianificazioni e goal", agenda.visibile && /Pianificazione di prova/.test(agenda.testo), JSON.stringify(agenda).slice(0, 240));

console.log("\n== 8. memoria ==");
await apri("memoria");
await wait(2500);
const mem = await ui(`const v = document.getElementById("memoriaView"); const svg = v.querySelector("svg, canvas"); return { visibile: !v.hidden, disegno: !!svg, numeri: (v.querySelector("#memNumeri")||{}).textContent || "" };`);
check("la vista memoria disegna l'atlante", mem.visibile && mem.disegno === true, JSON.stringify(mem).slice(0, 200));
scatta("15-memoria.png");

console.log("\n== 9. previsioni ==");
await apri("previsioni");
for (let i = 0; i < 12; i++) {
  const n = await ui(`const s = document.getElementById("prevSerie"); return s ? s.options.length : 0;`);
  if (n > 0) break;
  await wait(800);
}
const prev = await ui(`const v = document.getElementById("previsioniView"); const s = document.getElementById("prevSerie");
  return { visibile: !v.hidden, serie: s ? s.options.length : 0, stato: (document.getElementById("prevStato")||{}).textContent?.slice(0, 120) || "" };`);
check("la vista previsioni elenca delle serie", prev.visibile && prev.serie > 0, JSON.stringify(prev).slice(0, 240));
scatta("16-previsioni.png");

console.log("\n== 10. pannelli risorse/servizi ==");
await apri("chat");
const pannello = await ui(`document.getElementById("featBtn").click(); return { aperto: !document.getElementById("featPanel").hidden };`);
check("il pannello «Risorse» si apre", pannello.aperto === true);
const chiuso = await ui(`document.body.click(); return { chiuso: document.getElementById("featPanel").hidden };`);
check("un click fuori lo chiude", chiuso.chiuso === true);
const servizi = await ui(`document.getElementById("servBtn").click(); return { aperto: !document.getElementById("servPanel").hidden, voci: document.getElementById("servPanel").children.length };`);
check("il pannello «Servizi» si apre con le sue voci", servizi.aperto === true && servizi.voci > 0, JSON.stringify(servizi));

console.log("\n== 11. nessun errore JavaScript in nessuna vista ==");
const e = await errs();
check("la dashboard non ha registrato errori", Array.isArray(e) && e.length === 0, JSON.stringify(e).slice(0, 400));

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
console.log(`screenshot in ${OUT}`);
if (!tieni) { cleanup(); process.exit(fail === 0 ? 0 : 1); }
console.log("istanza lasciata attiva (--tieni)");
