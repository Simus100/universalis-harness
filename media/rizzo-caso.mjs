#!/usr/bin/env node
/**
 * Un caso singolo al decisore Rizzo Flow, dalla riga di comando.
 *
 * Serve per provare una decisione VERA su un caso proprio, senza costruire a mano un curl e
 * senza passare per la chat: si scrive un file JSON con `state` e `questions`, si lancia
 * questo script e si legge la risposta con le probabilità e la latenza misurata.
 *
 *   node media/rizzo-caso.mjs caso.json          # tabella leggibile
 *   node media/rizzo-caso.mjs caso.json --json   # risposta completa (per salvare/elaborare)
 *   node media/rizzo-caso.mjs --template         # stampa un modello da compilare
 *   node media/rizzo-caso.mjs caso.json -         # legge il JSON da stdin
 *
 * Il servizio si interroga direttamente su 127.0.0.1:8017 (`RIZZO_URL` per cambiarlo), quindi
 * nessuna credenziale: quello che scrivi nel caso NON esce dalla macchina.
 *
 * Regola pratica: stato corto (poche centinaia di token) e più domande insieme. Il costo
 * cresce con la lunghezza dello stato (~21 token/s di prefill su questa CPU), non con il
 * numero di domande.
 */
import { readFileSync } from "node:fs";

const URL_SERVIZIO = process.env.RIZZO_URL || "http://127.0.0.1:8017";

const TEMPLATE = {
  state: "Cliente: la fattura è stata addebitata due volte e nessuno risponde al telefono.",
  questions: {
    urgente: { type: "boolean", instructions: "Il cliente sta segnalando un'urgenza?" },
    reparto: {
      type: "choice",
      instructions: "Chi deve gestirlo?",
      criteria: { billing: "Fatture, addebiti, rimborsi", tecnico: "Bug e disservizi" },
    },
    fastidio: {
      type: "score",
      instructions: "Quanto è arrabbiato il cliente?",
      criteria: ["Calmo", "Infastidito", "Molto arrabbiato"],
    },
  },
};

const args = process.argv.slice(2);
if (args.includes("--template") || args.includes("-t")) {
  console.log(JSON.stringify(TEMPLATE, null, 2));
  process.exit(0);
}
const file = args.find((a) => !a.startsWith("-"));
const comeJson = args.includes("--json");
if (!file && !process.stdin.isTTY) {
  // nessun file: si legge da stdin, così un caso sensibile si può passare con una pipe
  const testo = readFileSync(0, "utf8");
  run(JSON.parse(testo));
} else if (!file) {
  console.error("uso: node media/rizzo-caso.mjs caso.json [--json]   (oppure --template)\n");
  console.error("Il file è un JSON con questa forma:\n");
  console.error(JSON.stringify(TEMPLATE, null, 2));
  process.exit(2);
} else {
  run(JSON.parse(readFileSync(file, "utf8")));
}

/** Forma comoda → wire TypeSafe (le stesse tre forme accettate dal tool dell'agente). */
function normalizza(questions) {
  const out = {};
  for (const [id, q] of Object.entries(questions || {})) {
    const tipo = String(q?.type || "").toLowerCase();
    const instructions = String(q?.instructions ?? "").trim();
    if (!instructions) throw new Error(`domanda ${id}: manca «instructions»`);
    if (tipo === "boolean" || tipo === "noul") {
      out[id] = { type: "noul", instructions };
    } else if (tipo === "choice") {
      const crit = q.criteria || Object.fromEntries((q.options || []).map((o) => [o.id, o.description]));
      if (!crit || Object.keys(crit).length < 2) throw new Error(`domanda ${id}: una scelta vuole almeno due opzioni`);
      out[id] = { type: "choice", instructions, criteria: crit };
    } else if (tipo === "score") {
      const liv = Array.isArray(q.criteria) ? q.criteria : q.levels;
      if (!Array.isArray(liv) || liv.length < 2) throw new Error(`domanda ${id}: uno score vuole almeno due livelli`);
      out[id] = { type: "score", instructions, criteria: liv.map(String) };
    } else {
      throw new Error(`domanda ${id}: type deve essere boolean, choice o score (ricevuto «${q?.type ?? "niente"}»)`);
    }
  }
  if (!Object.keys(out).length) throw new Error("serve almeno una domanda");
  return out;
}

async function run(caso) {
  const questions = normalizza(caso.questions);
  if (caso.state === undefined || caso.state === null) throw new Error("manca «state»");
  const caratteri = typeof caso.state === "string" ? caso.state.length : JSON.stringify(caso.state).length;
  const t0 = Date.now();
  const r = await fetch(`${URL_SERVIZIO}/v1/systemone`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "rizzo-latest", state: caso.state, questions }),
    signal: AbortSignal.timeout(600_000),
  });
  const testo = await r.text();
  const secs = (Date.now() - t0) / 1000;
  if (!r.ok) {
    console.error(`il servizio ha risposto ${r.status}: ${testo.slice(0, 400)}`);
    if (r.status === 503 || /ECONNREFUSED|fetch failed/i.test(testo)) {
      console.error("Il decisore è spento: accendilo dal menu features della dashboard (interruttore «rizzo»).");
    }
    process.exit(1);
  }
  const d = JSON.parse(testo);
  if (comeJson) {
    console.log(JSON.stringify(d, null, 2));
    return;
  }
  const t = d.x_rizzo?.timing || {};
  console.log(
    `\n${d.model} · ${Object.keys(questions).length} domande · stato ${caratteri} caratteri\n` +
      `${d.usage.input_tokens} token in ingresso · ${d.usage.output_tokens} generati · ${secs.toFixed(1)} s` +
      (t.prefill_seconds ? ` (prefill ${Number(t.prefill_seconds).toFixed(1)} s)` : "") +
      "\n",
  );
  for (const [id, a] of Object.entries(d.answers)) {
    const domanda = questions[id].instructions;
    console.log(`  ${id} — ${domanda}`);
    if (a.type === "noul") {
      console.log(`     sì/no: P(vero) = ${a.noul.toFixed(4)}\n`);
    } else if (a.type === "choice") {
      const righe = Object.entries(a.probabilities)
        .sort((x, y) => y[1] - x[1])
        .map(([k, v]) => `        ${k} ${(v * 100).toFixed(1)}% ${"▉".repeat(Math.max(1, Math.round(v * 20)))}`)
        .join("\n");
      console.log(`     scelta: «${a.choice}»  (confidence ${(a.confidence ?? 0).toFixed(3)})\n${righe}\n`);
    } else {
      const liv = Object.values(a.legend || {});
      console.log(`     punteggio: ${a.score.toFixed(4)} su 0..${liv.length - 1}  (${liv.join(" / ")})`);
      const righe = Object.entries(a.probabilities || {})
        .map(([k, v]) => `        ${liv[k] ?? k} ${(v * 100).toFixed(1)}%`)
        .join("\n");
      console.log(`${righe}\n`);
    }
  }
  console.log("Probabilità non calibrate: vanno bene per ordinare e per soglie prudenti.\n");
}
