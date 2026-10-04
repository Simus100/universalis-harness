/**
 * Test del rendering dell'interruttore Decision_M nel menu «features» di dashboard.html.
 *
 * Perché esiste: la logica di quella riga (LED acceso, etichetta, stato testuale, pulsante
 * disabilitato) non è coperta da nessun test, e un errore lì si vede solo a occhio — cioè
 * quando l'utente guarda il pannello e non capisce se il servizio è acceso o no. Qui le
 * funzioni `renderDecisionM` e `setPill` vengono ESTRATTE dal file reale e fatte girare con un
 * DOM finto: nessuna copia del codice, nessun browser, nessuna interferenza con la live view.
 *
 * Uso:  node media/test-decision-m-ui.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../dashboard.html", import.meta.url), "utf8");

/** Estrae una funzione dichiarata con `function nome(...) { ... }` contando le graffe. */
function extract(name) {
  const start = html.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`funzione ${name} non trovata in dashboard.html`);
  let i = html.indexOf("{", start);
  let depth = 0;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return html.slice(start, i + 1);
}

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ✔" : "  ✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

// DOM finto: abbastanza per `setPill` (dataset, classList, disabled, innerHTML) e per
// `renderDecisionM` (textContent, title). `$` restituisce sempre lo stesso oggetto per id.
const code = `
let decisionMReady = false;
const __els = {};
function $(id) {
  if (!__els[id]) {
    const cls = new Set();
    __els[id] = {
      dataset: {}, disabled: false, textContent: "", title: "", innerHTML: "",
      classList: { toggle(c, v) { if (v) cls.add(c); else cls.delete(c); }, contains: (c) => cls.has(c), add: (c) => cls.add(c) },
    };
  }
  return __els[id];
}
${extract("setPill")}
${extract("renderDecisionM")}
return { renderDecisionM, els: () => __els, ready: () => decisionMReady };
`;
const ui = new Function(code)();

const el = () => ui.els().decisionMToggle;
const info = () => ui.els().decisionMInfo;

console.log("\ncasi di stato del pannello «features»");

ui.renderDecisionM({ decision_m: { available: true, installed: true, enabled: false, size: "4b", quant: "q4_k_m", port: 8017 } });
check("spento: pulsante attivo (non disabilitato)", el().disabled === false);
check("spento: LED spento", el().classList.contains("on") === false);
check("spento: etichetta «Decision_M»", el().innerHTML.includes("Decision_M") && !el().innerHTML.includes("ON"));
check("spento: costo dichiarato", info().textContent.includes("5,7 GB"), info().textContent);
check("spento: decisionMReady false", ui.ready() === false);

ui.renderDecisionM({ decision_m: { available: true, installed: true, enabled: true, port: 8019, process: { running: true, ready: false } } });
check("in avvio: etichetta con i puntini", el().innerHTML.includes("Decision_M…"), el().innerHTML);
check("in avvio: messaggio di caricamento", info().textContent.includes("caricamento"), info().textContent);
check("in avvio: LED spento (non è pronto)", el().classList.contains("on") === false);

ui.renderDecisionM({ decision_m: { available: true, installed: true, enabled: true, size: "4b", quant: "q4_k_m", port: 8019, process: { running: true, ready: true, rssMb: 5617 } } });
check("pronto: LED acceso", el().classList.contains("on") === true);
check("pronto: etichetta «Decision_M ON»", el().innerHTML.includes("Decision_M ON"), el().innerHTML);
check("pronto: modello, porta e RAM nel testo", /4b q4_k_m · :8019 · 5[.,]5 GB/.test(info().textContent), info().textContent);
check("pronto: decisionMReady true", ui.ready() === true);

ui.renderDecisionM({ decision_m: { available: true, installed: false, enabled: false, missing: ["/root/rizzo-flow/.venv (venv)"] } });
check("non installata: pulsante disabilitato", el().disabled === true);
check("non installata: motivo nel testo", info().textContent.includes("non installata"), info().textContent);
check("non installata: il title dice cosa manca", el().title.includes("manca"), el().title);

ui.renderDecisionM({ decision_m: { available: false, enabled: false } });
check("disattivata all'avvio: pulsante disabilitato", el().disabled === true);
check("disattivata all'avvio: testo esplicito", info().textContent.includes("disattivata"), info().textContent);

ui.renderDecisionM({}); // nessuna informazione (primo render prima dello stato): non deve rompersi
check("stato assente: nessuna eccezione e pulsante spento", el().disabled === false && ui.ready() === false);

console.log(`\nesito: ${failures ? `${failures} CONTROLLI FALLITI` : "tutti i controlli passati"}\n`);
process.exit(failures ? 1 : 0);
