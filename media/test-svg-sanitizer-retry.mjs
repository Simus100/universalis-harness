/**
 * TEST: il caricamento del sanitizzatore SVG non deve restare fallito.
 *
 * Il guasto osservato in produzione: «anteprima non disponibile: sanitizzatore non disponibile
 * (modulo /svg-sanitize.mjs non caricato)» comparso su un diagramma e poi su TUTTI i successivi,
 * perché la promessa del caricamento veniva messa in cache con il fallimento dentro. Bastava una
 * sessione scaduta (o un momento di rete assente) per restare senza anteprime finché non si
 * ricaricava la pagina.
 *
 * Qui si esegue il VERO codice di dashboard.html (estratto dal file, non una copia) in un modulo
 * Node con un `import()` pilotato: si simula il fallimento, il successo, il modulo senza
 * `sanitizeSvg` e l'evento «online».
 *
 * Uso: node --experimental-vm-modules media/test-svg-sanitizer-retry.mjs
 */
import fs from "node:fs";
import vm from "node:vm";

const HTML = "/root/pi-harness/dashboard.html";
const html = fs.readFileSync(HTML, "utf8");

/* --- estrazione del blocco vero dal file (fallisce se il codice cambia forma) --- */
const inizio = html.indexOf("/* ---- caricamento pigro del sanitizzatore");
const fineMark = 'window.addEventListener("online", () => {';
const fine = html.indexOf(fineMark);
if (inizio < 0 || fine < 0) {
  console.error("✘ blocco del caricamento del sanitizzatore non trovato in dashboard.html");
  process.exit(1);
}
const chiusura = html.indexOf("});", html.indexOf("svgSanitizerPromise = null;", fine)) + 3;
const blocco = html.slice(inizio, chiusura) + "\nexport { loadSvgSanitizer as __load, svgSanitizerPromise as __promise };\n";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c) => (c ? ok(d) : ko(d));

/** Esegue il blocco vero con un import pilotato da `piano`: elenco di esiti, uno per tentativo. */
async function esegui(piano) {
  const stato = { tentativi: 0, handlerOnline: null };
  const listeners = {};
  const contesto = vm.createContext({
    window: {
      addEventListener: (tipo, fn) => {
        listeners[tipo] = fn;
        if (tipo === "online") stato.handlerOnline = fn;
      },
    },
    navigator: { onLine: true },
    console,
  });
  const mod = new vm.SourceTextModule(blocco, {
    context: contesto,
    identifier: "sanitizzatore.js",
    importModuleDynamically: async () => {
      const esito = piano[Math.min(stato.tentativi, piano.length - 1)];
      stato.tentativi++;
      if (esito === "errore") throw new Error("simulazione: modulo non raggiungibile");
      const sorgente =
        esito === "senza-funzione"
          ? "export const altraCosa = 1;"
          : "export const sanitizeSvg = (raw) => ({ ok: true, svg: '<svg/>', raw });";
      const m = new vm.SourceTextModule(sorgente, { context: contesto });
      await m.link(() => {});
      await m.evaluate(); // senza la valutazione i binding restano non inizializzati (TDZ)
      return m;
    },
  });
  await mod.link(() => {});
  await mod.evaluate();
  return { mod, stato, listeners };
}

console.log("== 1. fallimento, poi successo: il disegno dopo NON eredita l'errore ==");
{
  const { mod, stato } = await esegui(["errore", "ok"]);
  const primo = await mod.namespace.__load();
  check("il primo tentativo fallito restituisce l'assenza del modulo", primo === null);
  const secondo = await mod.namespace.__load();
  check("il secondo tentativo riesce davvero (non resta in cache il fallimento)", !!secondo && typeof secondo.sanitizeSvg === "function");
  check(`sono stati fatti 2 tentativi di caricamento (fatti: ${stato.tentativi})`, stato.tentativi === 2);
}

console.log("== 2. successo: il modulo resta in cache, un solo caricamento ==");
{
  const { mod, stato } = await esegui(["ok"]);
  const a = await mod.namespace.__load();
  const b = await mod.namespace.__load();
  check("il modulo caricato è lo stesso oggetto alle chiamate successive", a === b && !!a);
  check(`un solo tentativo per più chiamate (fatti: ${stato.tentativi})`, stato.tentativi === 1);
}

console.log("== 3. modulo presente ma senza sanitizeSvg: conta come fallito e non si memorizza ==");
{
  const { mod, stato } = await esegui(["senza-funzione", "ok"]);
  const primo = await mod.namespace.__load();
  check("un modulo inutilizzabile non viene dato per buono", primo === null);
  const secondo = await mod.namespace.__load();
  check("al giro dopo si riprova e arriva il modulo buono", !!secondo && typeof secondo.sanitizeSvg === "function");
  check(`tentativi: ${stato.tentativi}`, stato.tentativi === 2);
}

console.log("== 4. evento «online»: la cache del fallimento viene azzerata ==");
{
  const { mod, stato } = await esegui(["errore", "ok"]);
  await mod.namespace.__load();
  check("dopo il fallimento non c'è modulo", mod.namespace.__promise === null);
  await mod.namespace.__load();
  check("e il tentativo successivo riesce", !!mod.namespace.__promise);
  // la rete torna: il modulo già caricato resta valido, l'azzeramento è innocuo
  const { mod: m2, stato: s2 } = await esegui(["errore", "ok"]);
  await m2.namespace.__load();
  s2.handlerOnline();
  check("l'ascoltatore di «online» azzera la promessa (nuovo tentativo al prossimo disegno)", m2.namespace.__promise === null);
}

console.log("== 5. il messaggio d'errore dice il motivo giusto ==");
{
  check("il codice distingue «sei offline» dal caso generico", /sei offline/.test(html) && /sessione scaduta o server non raggiungibile/.test(html));
  check("la card d'errore offre un pulsante «riprova»", /svgretry/.test(html) && /↻ riprova/.test(html));
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
