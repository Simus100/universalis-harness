/**
 * Test di logica del frontend SENZA browser: esegue lo script vero di
 * dashboard.html dentro node:vm con stub minimi di DOM/localStorage/Notification
 * e verifica i comportamenti degli item 6 (notifiche a fine risposta) e
 * 7 (storico prompt con frecce + snippet).
 *
 * Uso: node media/test-ui.mjs
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("/root/pi-harness/dashboard.html", "utf8");
const code = html.split("<script>")[1].split("</script>")[0];

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (desc, cond, extra = "") => (cond ? ok(desc) : ko(`${desc}${extra ? " → " + extra : ""}`));

// ---------------- stub DOM ----------------
const mkEl = (id = "el") => ({
  id, tagName: "DIV", _h: {}, children: [],
  classList: {
    _s: new Set(),
    add(...c) { c.forEach((x) => this._s.add(x)); },
    remove(...c) { c.forEach((x) => this._s.delete(x)); },
    toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; },
    contains(c) { return this._s.has(c); },
  },
  style: {}, dataset: {},
  value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, title: "", tabIndex: 0, scrollTop: 0, scrollHeight: 100, clientHeight: 100,
  appendChild(c) { this.children.push(c); return c; },
  removeChild(c) { this.children = this.children.filter((x) => x !== c); },
  remove() {},
  addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); },
  removeEventListener() {},
  setSelectionRange() {}, focus() {}, blur() {}, click() {},
  querySelector(sel) {
    // finto DOM: cerca nei figli, poi (per gli elementi creati via innerHTML,
    // che non vengono analizzati) sintetizza l'elemento dall'id nel markup.
    const matches = (n) =>
      sel.startsWith("#") ? n.id === sel.slice(1)
        : sel.startsWith(".") ? String(n.className || "").split(/\s+/).includes(sel.slice(1))
        : false;
    const walk = (n) => {
      for (const c of n.children || []) {
        if (matches(c)) return c;
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    const hit = walk(this);
    if (hit) return hit;
    if (sel.startsWith("#") && String(this.innerHTML || "").includes(`id="${sel.slice(1)}"`)) return mkEl(sel.slice(1));
    return null;
  },
  querySelectorAll() { return []; },
  setAttribute() {}, getAttribute() { return null; },
  getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
  closest() { return null; },
});

const els = new Map();
const el = (id) => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); };
for (const m of html.matchAll(/id="([\w-]+)"/g)) el(m[1]);

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

const swCalls = [];
const swReg = { showNotification: async (title, opts) => { swCalls.push({ title, opts }); }, addEventListener() {} };
const notifCalls = [];
class Notification {
  static permission = "granted";
  static async requestPermission() { return Notification.permission; }
  constructor(title, opts) { notifCalls.push({ title, opts }); }
}

const docHandlers = {};
const document = {
  getElementById: el,
  createElement: (tag) => mkEl("new-" + tag),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: (t, f) => { (docHandlers[t] = docHandlers[t] || []).push(f); },
  body: { dataset: {}, classList: mkEl("body").classList },
  hidden: false,
  activeElement: null,
};
const winHandlers = {};
const window = {
  addEventListener: (t, f) => { (winHandlers[t] = winHandlers[t] || []).push(f); },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  innerHeight: 800,
  location: { href: "/" },
};
// nei browser Notification/URL/localStorage sono proprietà di window: lo stub
// deve rispettarlo, altrimenti i controlli `"Notification" in window` falliscono
window.Notification = Notification;
window.localStorage = localStorage;
const navigator = {
  clipboard: { writeText: async () => {} },
  serviceWorker: { register: async () => swReg, getRegistration: async () => swReg, addEventListener() {} },
};
const prompts = [];
const sandbox = {
  console, document, window, navigator, localStorage, Notification,
  EventSource: class { constructor() {} addEventListener() {} close() {} },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  // nel browser `addEventListener(...)` globale equivale a window.addEventListener
  addEventListener: (t, f) => { (winHandlers[t] = winHandlers[t] || []).push(f); },
  removeEventListener: () => {},
  alert: (m) => prompts.push(["alert", m]),
  confirm: () => true,
  prompt: (_m, d) => (prompts.push(["prompt"]), "etichetta-test"),
  fetch: async () => ({ ok: true, json: async () => ({}), text: async () => "" }),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  Date, Math, JSON, Object, Array, String, Number, Boolean, Promise, Set, Map, RegExp, Error, Intl,
  parseFloat, parseInt, isNaN, encodeURIComponent, decodeURIComponent, getComputedStyle: () => ({ lineHeight: "20px" }),
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

// accessori per leggere le variabili lessicali dello script
const accessors = `
;globalThis.__t = {
  pushHist, histArrows, notifyDone, notifyPref, renderSnips, renderNotifyToggle, escHtml, fmtDur,
  input: input, keydown: (e) => (input._h.keydown || []).forEach((f) => f(e)),
  getHist: () => hist, getHistPos: () => histPos, getSnips: () => snips,
  escAttr, goalProgress, goalCard, renderGoals, loadGoals,
  getGoals: () => goals, setGoals: (v) => { goals = v; }, setEditing: (v) => { goalEditing = v; },
  goalList: () => document.getElementById("goalsList"),
  fmtRel, cronCard, renderCrons, loadCrons, CRON_QUICK, toast, setFeatPanel,
  cronFromTime, timeFromCron, fmtWhenIT, CRON_DAYS, tzLabel, renderHist, cronForm,
  featPanel: () => document.getElementById("featPanel"), featBtn: () => document.getElementById("featBtn"),
  getCrons: () => crons, setCrons: (v) => { crons = v; }, setCronEditing: (v) => { cronEditing = v; },
  cronList: () => document.getElementById("cronList"),
};`;
vm.runInContext(code + accessors, sandbox, { filename: "dashboard-html-script.js" });
const T = sandbox.__t;
ok("lo script della dashboard si esegue in un contesto DOM simulato senza errori");

// ---------------- 7. storico prompt con frecce ----------------
T.pushHist("prompt uno");
T.pushHist("prompt due");
check("pushHist salva in localStorage", JSON.parse(store.get("pi.promptHistory")).length === 2);
T.input.value = "";
T.keydown({ key: "ArrowUp", shiftKey: false, preventDefault() {} });
check("↑ recupera l'ultimo prompt", T.input.value === "prompt due", JSON.stringify(T.input.value));
T.keydown({ key: "ArrowUp", shiftKey: false, preventDefault() {} });
check("↑↑ va a quello precedente", T.input.value === "prompt uno", JSON.stringify(T.input.value));
T.keydown({ key: "ArrowDown", shiftKey: false, preventDefault() {} });
check("↓ torna avanti", T.input.value === "prompt due", JSON.stringify(T.input.value));
T.keydown({ key: "ArrowDown", shiftKey: false, preventDefault() {} });
check("↓ oltre la fine svuota l'input", T.input.value === "", JSON.stringify(T.input.value));
T.input.value = "prima riga\nseconda riga";
T.keydown({ key: "ArrowUp", shiftKey: false, preventDefault() {} });
check("con più righe le frecce NON vengono intercettate", T.input.value === "prima riga\nseconda riga");
T.input.value = "";
T.pushHist("prompt uno"); // duplicato consecutivo: non va aggiunto
check("i duplicati consecutivi non si accumulano", T.getHist().length === 3, "len=" + T.getHist().length);
check("lo storico non supera 50 voci", (() => { for (let i = 0; i < 60; i++) T.pushHist("p" + i); return T.getHist().length === 50; })());

// ---------------- 7b. snippet rapidi ----------------
T.input.value = "testo dello snippet";
el("snipSave").onclick();
check("★ snippet salva lo snippet", T.getSnips().length === 1 && T.getSnips()[0].text === "testo dello snippet");
check("lo snippet è in localStorage", JSON.parse(store.get("pi.promptSnippets"))[0].label === "etichetta-test");
const row = el("snipRow");
check("lo snippet compare come chip", row.children.length === 1);
T.input.value = "";
row.children[0].children[0].onclick();
check("cliccando lo snippet il testo torna nell'input", T.input.value === "testo dello snippet");
row.children[0].children[1].onclick();
check("la ✕ rimuove lo snippet", T.getSnips().length === 0 && JSON.parse(store.get("pi.promptSnippets")).length === 0);

// ---------------- 6. notifiche a fine risposta ----------------
check("notifiche attive di default", T.notifyPref() === true);
store.set("pi.notify", "off");
check("preferenza OFF rispettata", T.notifyPref() === false);
store.set("pi.notify", "on");
document.hidden = false;
swCalls.length = 0;
await T.notifyDone("risposta di prova");
check("con la scheda in primo piano NON notifica", swCalls.length === 0);
document.hidden = true;
await T.notifyDone("risposta di prova completata");
check("con la scheda in background notifica", swCalls.length === 1, JSON.stringify(swCalls));
check("la notifica ha titolo e anteprima della risposta", swCalls[0]?.title === "Universalis Harness · risposta pronta" && swCalls[0]?.opts?.body.includes("risposta di prova"), JSON.stringify(swCalls[0]));
check("la notifica ha un'icona", swCalls[0]?.opts?.icon === "/icon-192.png");
swCalls.length = 0;
Notification.permission = "default";
await T.notifyDone("altra risposta");
check("senza permesso concesso non notifica (né lo chiede)", swCalls.length === 0);
Notification.permission = "granted";
store.set("pi.notify", "off");
swCalls.length = 0;
await T.notifyDone("risposta con notifiche spente");
check("con le notifiche spente non notifica", swCalls.length === 0);
store.set("pi.notify", "on");
document.hidden = true;
swCalls.length = 0;
await T.notifyDone("");
check("risposta vuota: messaggio di default", swCalls[0]?.opts?.body === "Risposta completata", JSON.stringify(swCalls[0]));

// toggle
// l'handler è async (chiede il permesso): va atteso, come farebbe il browser
await el("notifyToggle").onclick();
await new Promise((r) => setTimeout(r, 0));
check("il pulsante notifiche spegne e salva la preferenza", T.notifyPref() === false && store.get("pi.notify") === "off");
await el("notifyToggle").onclick();
await new Promise((r) => setTimeout(r, 0));
check("il pulsante notifiche riaccende", T.notifyPref() === true && store.get("pi.notify") === "on");
check("lo stato del pulsante è riflesso nell'etichetta", el("notifyToggle").innerHTML.includes("notifiche ON"), el("notifyToggle").innerHTML);
check("il pannello dello storico si apre col pulsante 🕘", (() => { el("histPanel").hidden = true; el("histBtn").onclick(); return el("histPanel").hidden === false; })());
check("la lista dello storico mostra le voci", el("histList").children.length > 0);

// ---------------- 8. goal: pianificazione / catena / checklist ----------------
const cls = (n) => String(n.className || "");
const collect = (n, out = []) => { for (const c of n.children || []) { out.push(c); collect(c, out); } return out; };
const freshList = () => { const l = T.goalList(); l.children = []; l.innerHTML = ""; return l; };

check("escAttr neutralizza virgolette e parentesi angolari", T.escAttr('a"b<c') === "a&quot;b&lt;c", T.escAttr('a"b<c'));

const g1 = {
  id: "g1", title: "Goal di prova", description: "descrizione", status: "active", updatedAt: Date.now(),
  steps: [{ id: "s1", title: "Passo 1", done: true }, { id: "s2", title: "Passo 2", done: false }],
  checklist: [{ id: "c1", text: "Controllo 1", done: false }],
};
const p1 = T.goalProgress(g1);
check("progress: 1 su 3 = 33%", p1.done === 1 && p1.total === 3 && p1.pct === 33, JSON.stringify(p1));
check("goal senza voci = 0%", (() => { const p = T.goalProgress({ steps: [], checklist: [] }); return p.done === 0 && p.total === 0 && p.pct === 0; })());

const card = T.goalCard(g1);
check("la card del goal ha la classe giusta", cls(card).includes("goal-card"));
check("la card contiene head/progress/azioni", (card.children || []).length >= 4, "figli: " + (card.children || []).length);
check("sono presenti 3 checkbox (2 passi + 1 controllo)", collect(card).filter((n) => n.type === "checkbox").length === 3);
check("il passo completato ha la classe 'step done'", collect(card).some((n) => cls(n).includes("step") && cls(n).includes("done")));

T.setGoals([g1]); T.setEditing(null); freshList(); T.renderGoals();
check("renderGoals mostra 1 card", collect(T.goalList()).filter((n) => cls(n).includes("goal-card")).length === 1);
check("il contatore mostra 1 goal", el("goalCount").textContent === "1 goal", el("goalCount").textContent);
check("il badge nel menu features mostra 1", el("featGoalCount").textContent === " 1", JSON.stringify(el("featGoalCount").textContent));

T.setEditing({}); freshList(); T.renderGoals();
const forms = collect(T.goalList()).filter((n) => cls(n).includes("goal-form"));
check("in modifica compare il form del goal", forms.length === 1);
check("il form ha i campi obiettivo / passi / checklist",
  !!forms[0] && forms[0].innerHTML.includes('id="gTitle"') && forms[0].innerHTML.includes('id="gSteps"') && forms[0].innerHTML.includes('id="gChecklist"'));

T.setGoals([]); T.setEditing(null); freshList(); T.renderGoals();
const empty = T.goalList().children[0];
check("stato vuoto: testo + icona U, nessun bersaglio",
  !!empty && String(empty.innerHTML).includes("Nessun goal salvato") && String(empty.innerHTML).includes("empty-ico") && !String(empty.innerHTML).includes("🎯"));
check("il contatore a vuoto dice 'nessun goal'", el("goalCount").textContent === "nessun goal", el("goalCount").textContent);

// ---------------- 9. operazioni pianificate (cron) ----------------
const freshCronList = () => { const l = T.cronList(); l.children = []; l.innerHTML = ""; return l; };

check("fmtRel futuro dice 'tra'", /^tra /.test(T.fmtRel(Date.now() + 120000)), T.fmtRel(Date.now() + 120000));
check("fmtRel passato dice 'in ritardo'", /^in ritardo di /.test(T.fmtRel(Date.now() - 120000)), T.fmtRel(Date.now() - 120000));
check("fmtRel null -> –", T.fmtRel(null) === "–");
check("ci sono scorciatoie cron pronte", T.CRON_QUICK.length >= 4);

const cron1 = {
  id: "c1", name: "Backup check", schedule: "@every 30m", action: "prompt",
  prompt: "Controlla il disco.", enabled: true, timeoutSec: 600,
  nextRun: Date.now() + 600000, lastRun: Date.now() - 60000, lastStatus: "ok",
  runCount: 3, durationMs: 4200, createdAt: Date.now() - 86400000, updatedAt: Date.now(),
};
const ccard = T.cronCard(cron1);
check("la card del cron ha la classe goal-card", cls(ccard).includes("goal-card"));
check("il titolo mostra l'orologio", collect(ccard).some((n) => String(n.textContent).includes("⏰")));
check("badge esito 'done' quando l'ultima è ok", collect(ccard).some((n) => cls(n).includes("goal-badge") && cls(n).includes("done")));
check("la card ha 5 azioni (esegui/pausa/log/modifica/elimina)", collect(ccard).filter((n) => cls(n) === "ghost" || cls(n) === "pill").length >= 5);
check("la card mostra la pianificazione", collect(ccard).some((n) => String(n.innerHTML).includes("@every 30m")));

const cron2 = Object.assign({}, cron1, { id: "c2", enabled: false });
check("job in pausa -> classe cron-off", cls(T.cronCard(cron2)).includes("cron-off"));

T.setCrons([cron1]); T.setCronEditing(null); freshCronList(); T.renderCrons();
check("renderCrons mostra 1 card", collect(T.cronList()).filter((n) => cls(n).includes("goal-card")).length === 1);
check("il contatore dice '1 pianificazione'", el("cronCount").textContent === "1 pianificazione", el("cronCount").textContent);
check("il badge nel menu features mostra 1", el("featCronCount").textContent === " 1", JSON.stringify(el("featCronCount").textContent));

T.setCronEditing({}); freshCronList(); T.renderCrons();
const cforms = collect(T.cronList()).filter((n) => cls(n).includes("goal-form"));
check("in creazione compare il form del cron", cforms.length === 1);
check("il form ha nome / pianificazione / prompt",
  !!cforms[0] && cforms[0].innerHTML.includes('id="cName"') && cforms[0].innerHTML.includes('id="cSchedule"') && cforms[0].innerHTML.includes('id="cPrompt"'));
check("il form permette di scegliere prompt o goal", !!cforms[0] && cforms[0].innerHTML.includes('value="goal"'));

T.setCrons([]); T.setCronEditing(null); freshCronList(); T.renderCrons();
const cempty = T.cronList().children[0];
check("stato vuoto cron con icona U e senza bersaglio",
  !!cempty && String(cempty.innerHTML).includes("Nessuna operazione pianificata") && String(cempty.innerHTML).includes("empty-ico") && !String(cempty.innerHTML).includes("🎯"));
check("contatore cron a vuoto", el("cronCount").textContent === "nessuna pianificazione", el("cronCount").textContent);

// ---------------- 10. pannello "features" su mobile ----------------
const mqlOrig = window.matchMedia;
window.matchMedia = () => ({ matches: true, addEventListener() {} });
el("featBtn").getBoundingClientRect = () => ({ width: 96, height: 36, top: 100, left: 8, bottom: 136 });
T.setFeatPanel(true);
const fp = el("featPanel");
check("su mobile il pannello è 'fixed'", fp.style.position === "fixed", JSON.stringify(fp.style));
check("su mobile si apre SOTTO il tasto (top = bottom + 8)", fp.style.top === "144px", fp.style.top);
check("il pannello non copre il tasto (top > bottom)", parseInt(fp.style.top, 10) > 136);
check("altezza limitata allo schermo", /^\d+px$/.test(fp.style.maxHeight || ""), fp.style.maxHeight);
check("scrollabile se il contenuto è lungo", fp.style.overflowY === "auto");
check("il pannello è visibile", fp.hidden === false);
T.setFeatPanel(false);
check("alla chiusura il pannello è nascosto", fp.hidden === true);
check("alla chiusura gli stili inline sono azzerati", fp.style.position === "" && fp.style.top === "" && fp.style.maxHeight === "");
window.matchMedia = () => ({ matches: false, addEventListener() {} });
T.setFeatPanel(true);
check("su desktop resta il posizionamento CSS (nessuno stile inline)", fp.style.position === "" && fp.style.top === "");
T.setFeatPanel(false);
window.matchMedia = mqlOrig;

// ---------------- 11. orario italiano nei cron ----------------
check("cronFromTime 08:30 tutti i giorni", T.cronFromTime("08:30", "*") === "30 8 * * *", T.cronFromTime("08:30", "*"));
check("cronFromTime 08:30 lun-ven", T.cronFromTime("08:30", "1-5") === "30 8 * * 1-5", T.cronFromTime("08:30", "1-5"));
check("cronFromTime 00:05 (zeri significativi)", T.cronFromTime("00:05", "0") === "5 0 * * 0", T.cronFromTime("00:05", "0"));
check("cronFromTime orario vuoto -> null", T.cronFromTime("", "*") === null);
check("cronFromTime 25:00 -> null", T.cronFromTime("25:00", "*") === null);

const t1 = T.timeFromCron("30 8 * * 1-5");
check("timeFromCron legge orario e giorni", !!t1 && t1.time === "08:30" && t1.days === "1-5", JSON.stringify(t1));
const t2 = T.timeFromCron("0 8 * * *");
check("timeFromCron 0 8 * * * -> 08:00 tutti i giorni", !!t2 && t2.time === "08:00" && t2.days === "*", JSON.stringify(t2));
check("timeFromCron ignora @every", T.timeFromCron("@every 30m") === null);
check("timeFromCron ignora i cron con minuti step", T.timeFromCron("*/15 * * * *") === null);
check("andata e ritorno coerente", (() => { const p = T.timeFromCron("5 7 * * 3"); return T.cronFromTime(p.time, p.days) === "5 7 * * 3"; })());
check("ci sono i giorni in italiano", T.CRON_DAYS.some(([, l]) => l.includes("lun") && l.includes("ven")));

// 06:00 UTC in settembre = 08:00 in Italia (CEST, UTC+2)
const ora = T.fmtWhenIT(Date.UTC(2026, 8, 21, 6, 0));
check("fmtWhenIT converte in ora italiana (06:00Z -> 08:00)", ora.includes("08:00"), ora);
check("fmtWhenIT mostra il giorno della settimana in italiano", /lun/i.test(ora), ora);
check("fmtWhenIT(null) -> –", T.fmtWhenIT(null) === "–");
check("etichetta fuso = ora italiana", T.tzLabel() === "ora italiana", T.tzLabel());

const cform2 = T.cronForm({});
check("il form ha il selettore orario + giorni", cform2.innerHTML.includes('id="cTime"') && cform2.innerHTML.includes('id="cDays"'));
check("il selettore giorni elenca le opzioni italiane", cform2.innerHTML.includes("tutti i giorni") && cform2.innerHTML.includes("lunedì"));
check("il form dichiara l'ora italiana", /ora italiana/i.test(cform2.innerHTML));

// ---------------- 12. leggibilità dei prompt recenti ----------------
T.pushHist("LETTURA-" + "x".repeat(240));
el("histList").children = [];
T.renderHist();
const hitems = el("histList").children;
check("il prompt recente non è più tagliato a 120 caratteri", hitems.some((c) => String(c.textContent).length > 200), "max=" + Math.max(0, ...hitems.map((c) => String(c.textContent).length)));
check("il testo completo resta nel title", hitems.some((c) => String(c.title).length > 200));

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
