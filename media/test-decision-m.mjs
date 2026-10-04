/**
 * Test del servizio Decision_M (media/decision-m-service.mjs) sul percorso che la dashboard usa
 * davvero: accensione → attesa della readiness → una decisione vera → spegnimento → RAM
 * liberata. Non passa dalla dashboard (niente HTTP autenticato) e non tocca le preferenze
 * reali: stato, pid e log finiscono in /tmp.
 *
 * Uso:  node media/test-decision-m.mjs
 * Esce 0 se tutto passa, 1 al primo controllo fallito.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";

// Configurazione isolata PRIMA di creare il servizio (il modulo legge l'ambiente qui).
const TMP = "/tmp/decision-m-test";
await fs.mkdir(TMP, { recursive: true });
await fs.rm(`${TMP}/prefs.json`, { force: true });
await fs.rm(`${TMP}/pid`, { force: true });
await fs.rm(`${TMP}/serve.log`, { force: true });
process.env.DASH_DECISION_M_PREFS_FILE = `${TMP}/prefs.json`;
process.env.DASH_DECISION_M_PID_FILE = `${TMP}/pid`;
process.env.DASH_DECISION_M_LOG_FILE = `${TMP}/serve.log`;
process.env.DASH_DECISION_M_PORT = "8019"; // porta diversa dal servizio in uso: nessuna collisione

const { createDecisionMService } = await import("./decision-m-service.mjs");

let failures = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "  ✔" : "  ✘"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const service = createDecisionMService({
  mediaDir: TMP,
  log: (m) => console.log(`     [servizio] ${m}`),
});

console.log("\n1) stato iniziale (nessuna risorsa occupata)");
let s = await service.status();
check("feature disponibile", s.available === true);
check("installazione completa (venv + pesi)", s.installed === true, (s.missing || []).join(", "));
check("spento all'inizio", s.enabled === false && s.process.running === false);
check("nessun modello caricato", s.model === null);

console.log("\n2) accensione: il processo parte e il modello si carica");
const tStart = Date.now();
await service.setEnabled(true);
const startSecs = ((Date.now() - tStart) / 1000).toFixed(1);
s = await service.status();
check("il processo è vivo", s.process.running === true, `pid ${s.process.pid}`);
check("pronto su /health", s.process.ready === true, `in ${startSecs} s`);
check("modello dichiarato", s.model?.precision === "q4_k_m", JSON.stringify(s.model));
check("device = cpu", s.model?.device === "cpu");
check("RAM occupata > 4 GB", (s.process.rssMb || 0) > 4000, `${s.process.rssMb} MB`);
check("preferenza salvata su disco", JSON.parse(await fs.readFile(`${TMP}/prefs.json`, "utf8")).enabled === true);

console.log("\n3) una decisione vera (stato breve, 3 domande)");
const tDec = Date.now();
const out = await service.decide({
  state: "Cliente: la fattura è stata addebitata due volte e nessuno risponde al telefono.",
  questions: {
    urgente: { type: "noul", instructions: "Il cliente segnala un'urgenza?" },
    reparto: {
      type: "choice",
      instructions: "Chi deve gestirlo?",
      criteria: { billing: "Fatture, addebiti, rimborsi", tecnico: "Bug e disservizi" },
    },
    fastidio: { type: "score", instructions: "Quanto è arrabbiato?", criteria: ["Calmo", "Infastidito", "Molto arrabbiato"] },
  },
});
const decSecs = ((Date.now() - tDec) / 1000).toFixed(1);
check("risposta con le tre domande", Object.keys(out.answers || {}).length === 3);
check("reparto = billing", out.answers?.reparto?.choice === "billing", String(out.answers?.reparto?.choice));
check("probabilità di scelta sensata (> 0.5)", (out.answers?.reparto?.probabilities?.billing ?? 0) > 0.5);
check("urgenza è una probabilità", typeof out.answers?.urgente?.noul === "number", String(out.answers?.urgente?.noul));
check("punteggio numerico", typeof out.answers?.fastidio?.score === "number", String(out.answers?.fastidio?.score));
check("nessun token generato", out.usage?.output_tokens === 0);
check("modello locale dichiarato nella risposta", String(out.model || "").startsWith("rizzo-"), String(out.model));
console.log(`     latenza della decisione: ${decSecs} s (${out.usage?.input_tokens} token in ingresso)`);

console.log("\n4) spegnimento: processo terminato e RAM liberata");
const before = (await service.status()).process.rssMb;
await service.setEnabled(false);
s = await service.status();
check("processo non più vivo", s.process.running === false);
check("nessun modello in memoria", s.model === null);
check("stato dichiarato spento", s.enabled === false);
check("pid file rimosso", !(await fs.access(`${TMP}/pid`).then(() => true, () => false)));
const health = await fetch("http://127.0.0.1:8019/health").then(() => true, () => false);
check("porta non più in ascolto", health === false);
// Il processo può essere in uscita quando la porta è già libera: si attende un momento
// invece di fotografare un istante (un vero orfano resta, e a quel punto lo si stampa).
async function attesaNessunOrfano(ms = 10_000) {
  const scadenza = Date.now() + ms;
  for (;;) {
    let uscita = "";
    try {
      uscita = execFileSync("pgrep", ["-af", "rizzo[ ]serve"], { encoding: "utf8" }).trim();
    } catch {
      return { ok: true };
    }
    if (Date.now() > scadenza) return { ok: false, dettaglio: uscita };
    await new Promise((r) => setTimeout(r, 500));
  }
}
const orfani = await attesaNessunOrfano();
check("nessun processo orfano di Decision_M", orfani.ok, orfani.dettaglio || "");
console.log(`     RAM prima dell'arresto: ${before} MB`);

console.log("\n5) riaccensione dopo lo spegnimento (la preferenza sopravvive)");
await service.setEnabled(true);
s = await service.status();
check("riparte e torna pronto", s.process.ready === true);
await service.setEnabled(false);
check("e si spegne di nuovo", (await service.status()).process.running === false);

console.log(`\nesito: ${failures ? `${failures} CONTROLLI FALLITI` : "tutti i controlli passati"}\n`);
process.exit(failures ? 1 : 0);
