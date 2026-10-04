#!/usr/bin/env node
/**
 * Esegue la batteria di casi (media/rizzo-batteria.json) sul decisore locale e produce i
 * numeri dell'audit: per ogni caso token in ingresso, token GENERATI, latenza, esiti; in
 * fondo gli aggregati.
 *
 *   node media/rizzo-batteria.mjs            # tabella + salva media/rizzo-batteria-esiti.json
 *   node media/rizzo-batteria.mjs --json     # scarica l'intera risposta di ogni caso
 *   node media/rizzo-batteria.mjs --solo id1,id2
 *
 * Il punto dell'audit è il confronto fra due modi di ottenere la stessa decisione: qui il
 * modello NON genera token (output_tokens = 0), quindi il costo in uscita è zero per
 * costruzione — non perché il modello sia bravo a essere conciso.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const QUI = dirname(fileURLToPath(import.meta.url));
const URL_SERVIZIO = process.env.RIZZO_URL || "http://127.0.0.1:8017";
const args = process.argv.slice(2);
const comeJson = args.includes("--json");
// --out FILE: dove salvare gli esiti (serve per confrontare due modelli senza sovrascriversi)
const iOut = args.indexOf("--out");
const fileOut = iOut >= 0 && args[iOut + 1] ? args[iOut + 1] : null;
const filtro = (() => {
  const i = args.indexOf("--solo");
  return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(",").map((s) => s.trim())) : null;
})();

const batteria = JSON.parse(readFileSync(join(QUI, "rizzo-batteria.json"), "utf8"));
const casi = batteria.casi.filter((c) => !filtro || filtro.has(c.id));

/** Forma comoda → wire TypeSafe. */
function normalizza(questions) {
  const out = {};
  for (const [id, q] of Object.entries(questions)) {
    if (q.type === "choice" || q.type === "score") out[id] = { type: q.type, instructions: q.instructions, criteria: q.criteria };
    else out[id] = { type: "noul", instructions: q.instructions };
  }
  return out;
}

/** In che modo si allinea il numero (indice dello stato) per essere sicuri che risponda a QUELLO stato. */
function stato_numero(tipo, i, criteri) {
  if (tipo === 0) return Math.floor(i) + 1;
  if (tipo === 2) return "s" + (Math.floor(i) + 1);
  const n = Math.floor(i);
  if (Array.isArray(criteri)) return criteri[n] ?? String(n);
  return Object.keys(criteri)[n] ?? String(n);
}
void stato_numero;

async function salute() {
  try {
    const r = await fetch(`${URL_SERVIZIO}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const h = await salute();
if (!h) {
  console.error(`Il decisore non risponde su ${URL_SERVIZIO}. Accendilo dal menu features della dashboard (interruttore «rizzo»).`);
  process.exit(1);
}
console.log(`\nmodello: ${h.model?.gguf_source || "?"} · ${h.model?.precision} · device ${h.model?.device} · ${casi.length} casi\n`);

const esiti = [];
let totIn = 0;
let totOut = 0;
let totSec = 0;
let totPrefill = 0;
let totDecisioni = 0;
let errori = 0;

for (const caso of casi) {
  const questions = normalizza(caso.questions);
  const t0 = Date.now();
  let d;
  try {
    const r = await fetch(`${URL_SERVIZIO}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "rizzo-latest", state: caso.state, questions }),
      signal: AbortSignal.timeout(600_000),
    });
    const testo = await r.text();
    if (!r.ok) throw new Error(`${r.status}: ${testo.slice(0, 200)}`);
    d = JSON.parse(testo);
  } catch (e) {
    errori++;
    console.log(`  ✘ ${caso.id.padEnd(24)} ERRORE ${e.message}`);
    esiti.push({ id: caso.id, categoria: caso.categoria, errore: e.message });
    continue;
  }
  const secs = (Date.now() - t0) / 1000;
  const inTok = d.usage?.input_tokens ?? 0;
  const outTok = d.usage?.output_tokens ?? 0;
  const prefill = Number(d.x_rizzo?.timing?.prefill_seconds) || 0;
  const decisioni = Object.keys(questions).length;
  totIn += inTok;
  totOut += outTok;
  totSec += secs;
  totPrefill += prefill;
  totDecisioni += decisioni;

  // riassunto leggibile: la risposta più probabile per ogni domanda
  const lettura = Object.entries(d.answers).map(([id, a]) => {
    if (a.type === "noul") return `${id}=${a.noul >= 0.5 ? "SI" : "no"}(${a.noul.toFixed(2)})`;
    if (a.type === "choice") return `${id}=${a.choice}(${(a.probabilities[a.choice] * 100).toFixed(0)}%)`;
    return `${id}=${a.score.toFixed(2)}/${Object.keys(a.probabilities || {}).length - 1}`;
  });
  console.log(
    `  ${caso.id.padEnd(24)} ${String(decisioni).padStart(2)} dom · ${String(inTok).padStart(4)} token in · ${outTok} out · ${secs.toFixed(1).padStart(5)} s  →  ${lettura.join("  ")}`,
  );
  esiti.push({
    id: caso.id,
    categoria: caso.categoria,
    decisioni,
    input_tokens: inTok,
    output_tokens: outTok,
    secondi: Number(secs.toFixed(2)),
    prefill_secondi: Number(prefill.toFixed(2)),
    caratteri_stato: typeof caso.state === "string" ? caso.state.length : JSON.stringify(caso.state).length,
    risposte: d.answers,
    lettura: lettura.join(" · "),
  });
}

const ordinati = esiti.filter((e) => !e.errore).map((e) => e.secondi).sort((a, b) => a - b);
const mediana = ordinati.length ? ordinati[Math.floor(ordinati.length / 2)] : 0;
const righe = [
  ["casi", casi.length - errori],
  ["decisioni totali", totDecisioni],
  ["token in ingresso (totali)", totIn],
  ["token generati (totali)", totOut],
  ["token in ingresso per decisione", (totIn / (totDecisioni || 1)).toFixed(1)],
  ["secondi totali", totSec.toFixed(1)],
  ["secondi per decisione (media)", (totSec / (totDecisioni || 1)).toFixed(1)],
  ["secondi per caso — mediana", mediana.toFixed(1)],
  ["secondi per caso — min/max", ordinati.length ? `${ordinati[0].toFixed(1)} / ${ordinati[ordinati.length - 1].toFixed(1)}` : "-"],
  ["decisioni al secondo", (totDecisioni / (totSec || 1)).toFixed(3)],
  ["di cui prefill", `${totPrefill.toFixed(1)} s (${((totPrefill / (totSec || 1)) * 100).toFixed(0)}%)`],
  ["errori", errori],
];
console.log("\n— aggregati —");
for (const [k, v] of righe) console.log(`  ${String(k).padEnd(34)} ${v}`);

const uscita = {
  quando: new Date().toISOString(),
  servizio: URL_SERVIZIO,
  modello: h.model,
  aggregati: Object.fromEntries(righe),
  esiti,
};
const file = fileOut ? (fileOut.startsWith("/") ? fileOut : join(QUI, fileOut)) : join(QUI, "rizzo-batteria-esiti.json");
writeFileSync(file, JSON.stringify(uscita, null, 2));
console.log(`\nesiti salvati in ${file}\n`);
if (comeJson) console.log(JSON.stringify(uscita, null, 2));
