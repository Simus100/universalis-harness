/**
 * Test di regressione del difetto n.1 — chat che si "sgancia" durante la risposta.
 *
 * Segnalazione: «talvolta non vedo la pagina scorrere e devo fare io il refresh; vedo solo i
 * comandi e non vedo la catena di pensiero né nulla, a meno che non faccia refresh».
 * Causa: l'errore NATIVO di EventSource (guasto di trasporto, e.data undefined) finiva nello
 * stesso handler dell'errore applicativo e chiamava setStatus(false), che azzerava il
 * riferimento alla bolla in corso; le card dei tool (tool_start) continuavano invece ad
 * arrivare, perché non dipendono da cur.assistant.
 *
 * Esegue il VERO script di dashboard.html in node:vm con un DOM simulato e un EventSource
 * pilotabile, senza browser e senza rete.
 *
 * Uso: node media/test-stream-resilience.mjs
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const htmlPath = process.argv[2] || "/root/pi-harness/dashboard.html";
const html = readFileSync(htmlPath, "utf8");
const code = html.split("<script>")[1].split("</script>")[0];

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (desc, cond, extra = "") => (cond ? ok(desc) : ko(`${desc}${extra ? " → " + extra : ""}`));

// ---------------- stub DOM ----------------
const mkEl = (id = "el") => ({
  id, tagName: "DIV", _h: {}, _synth: null, children: [], className: "",
  classList: {
    _s: new Set(),
    add(...c) { c.forEach((x) => this._s.add(x)); },
    remove(...c) { c.forEach((x) => this._s.delete(x)); },
    toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; on ? this._s.add(c) : this._s.delete(c); return on; },
    contains(c) { return this._s.has(c); },
  },
  style: {}, dataset: {},
  value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, title: "", tabIndex: 0,
  scrollTop: 0, scrollHeight: 100, clientHeight: 100, parentElement: null,
  appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
  removeChild(c) { this.children = this.children.filter((x) => x !== c); },
  remove() {},
  addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); },
  removeEventListener() {},
  setSelectionRange() {}, focus() {}, blur() {}, click() {},
  /**
   * I figli si cercano fra quelli reali; per gli elementi creati via innerHTML (che qui non
   * vengono analizzati) se ne sintetizza uno stabile: senza questo, cur.assistant resterebbe
   * null e non si potrebbe verificare l'accumulo del testo.
   */
  querySelector(sel) {
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
    const key = sel.replace(/^[.#]/, "");
    const marked = sel.startsWith("#")
      ? String(this.innerHTML || "").includes(`id="${key}"`)
      : new RegExp(`class="[^"]*\\b${key}\\b`).test(String(this.innerHTML || ""));
    if (marked) {
      this._synth = this._synth || new Map();
      if (!this._synth.has(sel)) {
        const child = mkEl(key);
        child.className = sel.startsWith(".") ? key : "";
        this._synth.set(sel, this.appendChild(child));
      }
      return this._synth.get(sel);
    }
    return null;
  },
  querySelectorAll(sel) {
    const out = [];
    const matches = (n) => (sel.startsWith(".") ? String(n.className || "").split(/\s+/).includes(sel.slice(1)) : false);
    const walk = (n) => { for (const c of n.children || []) { if (matches(c)) out.push(c); walk(c); } };
    walk(this);
    return out;
  },
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

const swReg = { showNotification: async () => {}, addEventListener() {} };
class Notification {
  static permission = "granted";
  static async requestPermission() { return "granted"; }
  constructor() {}
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
window.Notification = Notification;
window.localStorage = localStorage;
const navigator = {
  clipboard: { writeText: async () => {} },
  serviceWorker: { register: async () => swReg, getRegistration: async () => swReg, addEventListener() {} },
};

// ---------------- EventSource pilotabile ----------------
const esListeners = {};
class FakeEventSource {
  constructor(url) { this.url = url; this.readyState = 1; }
  addEventListener(type, fn) { (esListeners[type] = esListeners[type] || []).push(fn); }
  close() { this.readyState = 2; }
}
const emit = (type, data) => {
  for (const fn of esListeners[type] || []) fn({ data: data === undefined ? undefined : JSON.stringify(data) });
};
/** Guasto di TRASPORTO: è ciò che il browser genera quando la connessione SSE cade. */
const emitTransportError = () => { for (const fn of esListeners.error || []) fn({ data: undefined, type: "error" }); };

const sandbox = {
  console, document, window, navigator, localStorage, Notification,
  EventSource: FakeEventSource,
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  addEventListener: (t, f) => { (winHandlers[t] = winHandlers[t] || []).push(f); },
  removeEventListener: () => {},
  alert: () => {}, confirm: () => true, prompt: () => "x",
  fetch: async () => ({ ok: true, json: async () => ({}), text: async () => "" }),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
  Date, Math, JSON, Object, Array, String, Number, Boolean, Promise, Set, Map, RegExp, Error, Intl,
  parseFloat, parseInt, isNaN, encodeURIComponent, decodeURIComponent,
  getComputedStyle: () => ({ lineHeight: "20px" }),
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);

const accessors = `
;globalThis.__t = {
  chat: () => chat, cur: () => cur, input: input,
  dotOn: () => document.getElementById("dot").classList.contains("on"),
  conn: () => document.getElementById("connTxt").textContent,
  err: () => document.getElementById("err").textContent,
  bolle: () => chat.children.filter((c) => String(c.className).includes("msg") && String(c.className).includes("assistant")),
  setConnState: typeof setConnState === "function" ? setConnState : (() => {}),
  setStatus,
};`;
vm.runInContext(code + accessors, sandbox, { filename: "dashboard-html-script.js" });
const T = sandbox.__t;

ok("lo script della dashboard si esegue nel contesto simulato senza errori");
check("l'EventSource è stato aperto e i listener registrati", Object.keys(esListeners).length > 8, Object.keys(esListeners).join(","));

/** Stato minimo ma completo, come lo manda il server (senza messaggi). */
const stateBase = (over = {}) => ({
  model: { id: "deepseek-flash", provider: "deepseek", name: "deepseek-flash" },
  thinking: { level: "high", supported: ["low", "high", "max"] },
  context: { tokens: 1000, window: 200000, percent: 0.5 },
  tokens: { input: 10, output: 20, cacheRead: 0, cacheWrite: 0 },
  cost: 0.001, gitBranch: "-", cwd: "/root/pi-harness", root: "/root",
  subagents: { enabled: false, maxSpawns: 3 },
  browser: { enabled: false, mode: "auto" },
  auth: { blockedIps: 0 },
  streaming: true, sessionId: "sess-1", startedAt: Date.now(),
  ...over,
});

// ---------------- 1. risposta in corso, poi la connessione cade ----------------
emit("status", { streaming: true });
emit("text_delta", { delta: "Ciao" });
check("durante la generazione il dot è attivo", T.dotOn());
check("il testo del primo delta è nella bolla", T.cur().assistant?.textContent === "Ciao", JSON.stringify(T.cur().assistant?.textContent));

emitTransportError();
check("un guasto di trasporto NON spegne lo stato «working»", T.dotOn());
check("il guasto è dichiarato in barra di stato", T.conn().includes("riconnessione"), JSON.stringify(T.conn()));
check("il riferimento alla bolla in corso NON viene perso", !!T.cur().assistant);
check("il testo già ricevuto resta a schermo", T.cur().assistant?.textContent === "Ciao");

emit("open");
check("alla riconnessione l'avviso sparisce", T.conn() === "", JSON.stringify(T.conn()));

emit("text_delta", { delta: " mondo" });
check("il testo successivo si accoda alla stessa bolla (nessuna bolla spezzata)", T.cur().assistant?.textContent === "Ciao mondo", JSON.stringify(T.cur().assistant?.textContent));
check("la risposta resta una sola bolla", T.bolle().length === 1, "bolle=" + T.bolle().length);

// ---------------- 2. riallineamento con lo snapshot (delta persi) ----------------
emit("stream_snapshot", { text: "Ciao mondo, questa è la risposta completa", thinking: "sto ragionando", active: true });
check("lo snapshot riallinea il testo integrale", T.cur().assistant?.textContent === "Ciao mondo, questa è la risposta completa", JSON.stringify(T.cur().assistant?.textContent));
check("lo snapshot riporta anche il thinking", T.cur().thinking?.textContent === "sto ragionando" && T.cur().thinking?.style.display === "block");
check("lo snapshot non crea una seconda bolla", T.bolle().length === 1, "bolle=" + T.bolle().length);

// ---------------- 3. uno snapshot vuoto non cancella ciò che è a schermo ----------------
emit("stream_snapshot", { text: "", thinking: "", active: true });
check("uno snapshot senza testo non svuota la bolla", T.cur().assistant?.textContent === "Ciao mondo, questa è la risposta completa");

// ---------------- 4. errore APPLICATIVO: si comporta come prima ----------------
emit("error", { message: "provider non disponibile" });
check("l'errore applicativo è mostrato all'utente", T.err().includes("provider non disponibile"), JSON.stringify(T.err()));
check("un errore applicativo riporta la UI in idle", !T.dotOn());
check("un errore applicativo non finge un guasto di connessione", T.conn() === "", JSON.stringify(T.conn()));

// ---------------- 5. lo stato del server riallinea il dot ----------------
emit("status", { streaming: true });
emit("state", stateBase({ streaming: false }));
check("lo stato del server spegne il dot quando la risposta è finita", !T.dotOn());

// ---------------- 6. la caduta non deve toccare la chat della sessione ----------------
emit("status", { streaming: true });
emit("text_delta", { delta: "x" });
const prima = T.chat().children.length;
emitTransportError();
check("la caduta non ricostruisce né svuota la chat", T.chat().children.length === prima, `${prima} → ${T.chat().children.length}`);

// ---------------- 7. turno agentico: i tool restano DENTRO il messaggio, in ordine ----------------
// Difetto segnalato dal proprietario: «ad un certo punto vedo solo scritte bash bash bash
// ripetute ogni linea, ma non vedo la catena di pensiero, i file, il testo di intermezzo».
// Causa: tool_start faceva `chat.appendChild(...)`, cioè appendeva le card FUORI dal
// messaggio in corso. In un turno con molte chiamate il testo/pensiero restava sopra (fuori
// vista) e in fondo si accumulavano solo le card dei tool; il refresh ricostruiva tutto dalla
// sessione, quindi «si sistemava». Qui si verifica che la card entri nel messaggio, che il
// testo successivo riapra una bolla SOTTO la card e che tool_end ne aggiorni l'esito.
console.log("\n== 7. turno con tool: card dentro il messaggio e ordine fedele ==");
emit("status", { streaming: false }); // chiude il turno precedente: il nuovo parte pulito
emit("state", stateBase({ streaming: true }));
emit("status", { streaming: true });
emit("thinking_delta", { delta: "ragiono " });
emit("text_delta", { delta: "prima del tool" });
emit("tool_start", { toolCallId: "t1", toolName: "bash", summary: "ls -la" });
emit("tool_end", { toolCallId: "t1", toolName: "bash", isError: false });
emit("text_delta", { delta: "dopo il tool" });
emit("tool_start", { toolCallId: "t2", toolName: "bash", summary: "npm test" });
emit("tool_end", { toolCallId: "t2", toolName: "bash", isError: true });

const msgStream = T.bolle()[T.bolle().length - 1];
const figliStream = () => (msgStream.children || []).map((c) => String(c.className || ""));
const fuoriDalMessaggio = T.chat().children.filter((c) => /(^|\s)tool(\s|$)/.test(String(c.className || ""))).length;
check("nessuna card di tool orfana in fondo alla chat", fuoriDalMessaggio === 0, "orfane=" + fuoriDalMessaggio);
check("la card del tool è DENTRO il messaggio assistant", figliStream().some((c) => /(^|\s)tool(\s|$)/.test(c)), JSON.stringify(figliStream()));
check("il testo dopo il tool sta SOTTO la card (non nella bolla iniziale sopra)", (() => {
  const figli = figliStream();
  const isTesto = (c) => /(^|\s)bubble(\s|$)/.test(c);
  const isTool = (c) => /(^|\s)tool(\s|$)/.test(c);
  const iPrimoTool = figli.findIndex(isTool);
  return iPrimoTool > -1 && figli.slice(iPrimoTool + 1).some(isTesto);
})(), JSON.stringify(figliStream()));
const carte = [...(msgStream.children || [])].filter((c) => /(^|\s)tool(\s|$)/.test(String(c.className || "")));
const stati = carte.map((c) => c.querySelector(".tstate")?.textContent);
check("tool_end distingue successo (✓) da errore (✗)", stati.includes("✓") && stati.includes("✗"), JSON.stringify(stati));

// ---------------- 8. snapshot con SEGMENTI: ricostruzione idempotente ----------------
// Dopo una riconnessione il server manda i segmenti in ordine (pensiero, testo, tool, testo):
// il client ricostruisce l'intero messaggio invece di accodare, così il replay non duplica.
emit("stream_snapshot", {
  segments: [
    { kind: "thinking", text: "penso" },
    { kind: "text", text: "prima" },
    { kind: "tool", id: "t1", name: "bash", summary: "ls", status: "ok" },
    { kind: "text", text: "dopo" },
  ],
  text: "primadopo",
  thinking: "penso",
  active: true,
});
emit("stream_snapshot", {
  segments: [
    { kind: "thinking", text: "penso" },
    { kind: "text", text: "prima" },
    { kind: "tool", id: "t1", name: "bash", summary: "ls", status: "ok" },
    { kind: "text", text: "dopo" },
  ],
  text: "primadopo",
  thinking: "penso",
  active: true,
});
const msgSnap = T.bolle()[T.bolle().length - 1];
const figliSnap = (msgSnap.children || []).map((c) => String(c.className || ""));
const testiSnap = [...(msgSnap.children || [])].filter((c) => /(^|\s)bubble(\s|$)/.test(String(c.className || ""))).map((b) => b.textContent);
const toolSnap = [...(msgSnap.children || [])].filter((c) => /(^|\s)tool(\s|$)/.test(String(c.className || "")));
check("lo snapshot a segmenti ricostruisce pensiero, testo e tool in ordine",
  (/thinking/.test(figliSnap.join(" "))) && testiSnap.join("|") === "prima|dopo" && toolSnap.length === 1,
  JSON.stringify({ figli: figliSnap, testi: testiSnap }));
check("lo snapshot ripetuto non duplica testo né tool (idempotente)",
  testiSnap.length === 2 && toolSnap.length === 1 && testiSnap.join("") === "primadopo",
  JSON.stringify({ testi: testiSnap, tool: toolSnap.length }));
check("la stessa card conserva lo stato ok nello snapshot", toolSnap[0]?.querySelector(".tstate")?.textContent === "✓", toolSnap[0]?.textContent);

console.log();
console.log(`risultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
