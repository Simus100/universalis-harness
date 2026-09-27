// Test della palette comandi: estrae il blocco JS "COMANDI SLASH" da dashboard.html,
// lo esegue con uno stub DOM minimale e verifica il comportamento contro il server
// di prova (porta 8499). Non fa parte del progetto: serve solo a validare la logica.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("/root/pi-harness/dashboard.html", "utf8");
const start = html.indexOf("/* ============================ COMANDI SLASH");
const end = html.indexOf("// Carica il catalogo appena possibile");
if (start < 0 || end < 0) throw new Error("blocco COMANDI SLASH non trovato");
const block = html.slice(start, end);

function fakeEl(tag = "div") {
  const el = {
    tagName: tag.toUpperCase(),
    className: "", textContent: "", hidden: false, value: "", type: "",
    dataset: {}, style: {}, children: [], onclick: null, onmousedown: null,
    appendChild(c) { this.children.push(c); return c; },
    setAttribute() {}, removeAttribute() {}, focus() {}, remove() {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    querySelector: () => null,
  };
  // innerHTML = "" deve svuotare i figli, come nel DOM vero
  let html = "";
  Object.defineProperty(el, "innerHTML", {
    get: () => html,
    set: (v) => { html = String(v); if (html === "") el.children.length = 0; },
  });
  return el;
}

const els = {};
for (const id of ["cmdPanel", "cmdList", "cmdTitle", "cmdHint", "cmdCount"]) els[id] = fakeEl();

const calls = { showTab: [], openDrawer: 0, openInEditor: [], exports: 0, renderMessages: 0 };

const sandbox = {
  console,
  Date,
  Math,
  JSON,
  setTimeout,
  Promise,
  input: { value: "", style: {}, addEventListener() {} },
  $: (id) => els[id] ?? (els[id] = fakeEl()),
  document: { createElement: (t) => fakeEl(t), querySelector: () => null },
  autosize() {},
  renderMessages() { calls.renderMessages++; },
  // `cmdNotice` ridisegna la conversazione con la lista dei messaggi correnti: nello stub la
  // lista è vuota (senza questa variabile il test si fermava con ReferenceError, non il prodotto)
  currentMessages: [],
  showTab: (n) => calls.showTab.push(n),
  openDrawer: () => calls.openDrawer++,
  openInEditor: (p) => calls.openInEditor.push(p),
  fetch: (url, opts) => {
    const o = opts ? { ...opts } : {};
    o.headers = { ...(o.headers || {}), Authorization: "Basic " + Buffer.from("pi:test").toString("base64") };
    return fetch("http://127.0.0.1:8499" + url, o);
  },
};
sandbox.globalThis = sandbox;
sandbox.$("exportChat").onclick = () => calls.exports++;

vm.createContext(sandbox);
vm.runInContext(block, sandbox, { filename: "palette.js" });

const q = (f, label) => { if (!f) throw new Error("FALLITO: " + label); console.log("  ok " + label); };
const items = () => els.cmdList.children.filter((c) => (c.className || "").startsWith("cmditem"));
const type = (v) => { sandbox.input.value = v; sandbox.cmdOnInput(); };
const key = (k) => sandbox.cmdKeydown({ key: k, preventDefault() {} });

// le `let` di uno script vm non finiscono nel global object: le leggo dal contesto
const ctxVar = (name) => vm.runInContext(name, sandbox);
await sandbox.loadCommandCatalog();
console.log("catalogo:", ctxVar("cmdCatalog").commands.length, "comandi");

// 1. "/" apre la palette con l'elenco completo
type("/");
q(!els.cmdPanel.hidden, "digitando / la palette si apre");
q(items().length > 3, `la palette mostra ${items().length} voci`);

// 2. filtro
type("/th");
q(items()[0]?.children[0].textContent === "/think", "filtro /th -> primo risultato /think (" + items().map((i) => i.children[0].textContent).join(", ") + ")");

// 3. Invio completa il nome (parametro opzionale)
key("Enter");
q(sandbox.input.value === "/think", `Invio su /th completa in "${sandbox.input.value}"`);
q(ctxVar("cmdNotices").length === 0, "non ha ancora eseguito nulla");

// 4. Invio su comando esatto esegue davvero (server-side)
key("Enter");
await new Promise((r) => setTimeout(r, 400));
q(ctxVar("cmdNotices").at(-1)?.line === "/think" && /thinking attuale/.test(ctxVar("cmdNotices").at(-1)?.text || ""), "Invio esegue /think sull'harness: " + JSON.stringify((ctxVar("cmdNotices").at(-1)?.text || "").split("\n")[0]));
q(sandbox.input.value === "", "l'input si svuota dopo l'esecuzione");

// 5. comando con parametro obbligatorio: completa, non esegue
type("/go");
key("Enter");
q(sandbox.input.value === "/goal ", `Invio su /go completa in "${sandbox.input.value}"`);
type("/goal Preparare il report");
key("Enter");
await new Promise((r) => setTimeout(r, 400));
q(/goal creato/.test(ctxVar("cmdNotices").at(-1)?.text || ""), "goal creato via comando: " + ctxVar("cmdNotices").at(-1)?.text);

// 6. enum: completa il valore e poi esegue nell'interfaccia
type("/tab cr");
q(items().length === 1 && items()[0].children[0].textContent === "cron", "opzioni filtrate per /tab cr");
key("Tab");
q(sandbox.input.value === "/tab cron " || sandbox.input.value === "/tab cron", `Tab completa il valore in "${sandbox.input.value}"`);
key("Enter");
await new Promise((r) => setTimeout(r, 200));
q(calls.showTab.at(-1) === "cron", "showTab('cron') chiamato dal comando client");

// 7. comando client /files con percorso
type("/files media/goals.json");
key("Enter");
await new Promise((r) => setTimeout(r, 200));
q(calls.showTab.at(-1) === "files" && calls.openInEditor.at(-1) === "media/goals.json", "files apre la scheda sul percorso");

// 8. /export inoltra al bottone esistente
type("/export");
key("Enter");
await new Promise((r) => setTimeout(r, 100));
q(calls.exports === 1, "/export usa il download esistente");

// 9. /think con valore: parametro opzionale completato dall'enum
type("/think h");
q(items().some((i) => i.children[0].textContent === "high"), "opzioni thinking contengono high");
key("Enter");
await new Promise((r) => setTimeout(r, 300));
q(/thinking -> high/.test(ctxVar("cmdNotices").at(-1)?.text || ""), "thinking impostato: " + ctxVar("cmdNotices").at(-1)?.text);

// 10. errore server mostrato in rosso
type("/cron solo-due");
key("Enter");
await new Promise((r) => setTimeout(r, 300));
q(ctxVar("cmdNotices").at(-1)?.ok === false && /uso: \/cron/.test(ctxVar("cmdNotices").at(-1)?.text || ""), "errore d'uso mostrato: " + (ctxVar("cmdNotices").at(-1)?.text || "").slice(0, 60));
type("/nonEsiste");
key("Enter");
await new Promise((r) => setTimeout(r, 200));
q(ctxVar("cmdNotices").at(-1)?.ok === false, "comando sconosciuto segnalato");

// 11. Esc chiude e non riapre finche' il testo non cambia
type("/");
q(!els.cmdPanel.hidden, "palette aperta");
key("Escape");
q(els.cmdPanel.hidden, "Esc chiude la palette");
sandbox.cmdOnInput();
q(els.cmdPanel.hidden, "non si riapre subito dopo Esc");
type("/clear");
q(!els.cmdPanel.hidden, "riapre quando il testo cambia");
key("Enter");
await new Promise((r) => setTimeout(r, 100));
q(ctxVar("cmdNotices").length === 0, "/clear svuota gli esiti mostrati in chat");

// 12. il testo normale (senza /) non apre la palette
type("ciao, come stai?");
q(els.cmdPanel.hidden, "prompt normale: palette chiusa");
console.log("\nTUTTI I CONTROLLI SUPERATI");
