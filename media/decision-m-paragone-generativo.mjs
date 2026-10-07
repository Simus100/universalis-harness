#!/usr/bin/env node
/**
 * Braccio B del confronto sui token: gli STESSI casi della batteria (media/decision-m-batteria.json)
 * risolti dallo STESSO modello (rizzo-flow 4B Q4_K_M) ma in modalità GENERATIVA, via llama-server.
 *
 * Serve a rispondere a una domanda sola: quanto costa in token (e in secondi) ottenere la stessa
 * decisione chiedendola come TESTO invece che come probabilità.
 *
 *   # 1) avvia il generativo (Decision_M spento: la RAM non basta per entrambi)
 *   /root/rizzo-flow/runtimes/llama-b11081-linux-x64-cpu/llama-server \
 *     -m /root/rizzo-flow/models/rizzo-flow/spark-x2.5-4b-rizzo-flow-lora-q4_k_m.gguf \
 *     --host 127.0.0.1 --port 8018 -t 6 -c 2048 --jinja
 *   # 2) esegui
 *   node media/decision-m-paragone-generativo.mjs --out media/decision-m-paragone-esiti-generativo.json
 *
 * Il prompt è costruito per essere EQUIVALENTE in informazione al wire TypeSafe del decisore:
 * stato identico, stesse domande, stessa formulazione delle opzioni (per le scelte, con le
 * descrizioni). Non è quindi un prompt "compatto" che favorirebbe il generativo sui token di input.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const QUI = dirname(fileURLToPath(import.meta.url));
const URL_SERVER = process.env.LLAMA_URL || "http://127.0.0.1:8018";
const args = process.argv.slice(2);
const leggiOpzione = (nome, def) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const MAX_TOKENS = Number(leggiOpzione("--max-tokens", "320"));
const fileOut = leggiOpzione("--out", "decision-m-paragone-esiti-generativo.json");
const filtro = (() => {
  const s = leggiOpzione("--solo", null);
  return s ? new Set(s.split(",").map((x) => x.trim())) : null;
})();

const batteria = JSON.parse(readFileSync(join(QUI, "decision-m-batteria.json"), "utf8"));
const casi = batteria.casi.filter((c) => !filtro || filtro.has(c.id));

const SISTEMA =
  "Sei un classificatore. Ricevi uno STATO e alcune DOMANDE: rispondi SOLO con un oggetto JSON " +
  "con una chiave per ogni domanda. Nessun testo fuori dal JSON, nessuna spiegazione, nessun " +
  "commento. Per le domande booleane rispondi true o false; per le domande a scelta rispondi con " +
  "una delle etichette ammesse, scritta esattamente come è scritta.";

/** Elenco delle domande, con le stesse opzioni che riceve il decisore. */
function elenco(questions) {
  const righe = [];
  for (const [id, q] of Object.entries(questions)) {
    let forma;
    if (q.type === "boolean" || q.type === "noul") forma = "→ true oppure false";
    else if (Array.isArray(q.criteria)) forma = `→ una etichetta fra ${q.criteria.map((x) => `"${x}"`).join(", ")}`;
    else {
      const opzioni = Object.entries(q.criteria || {}).map(([k, v]) => `"${k}" (${v})`).join(", ");
      forma = `→ una etichetta fra ${opzioni}`;
    }
    righe.push(`- "${id}": ${q.instructions} ${forma}`);
  }
  return righe.join("\n");
}

function promptUtente(caso) {
  const stato = typeof caso.state === "string" ? caso.state : JSON.stringify(caso.state, null, 2);
  return `STATO:\n${stato}\n\nDOMANDE:\n${elenco(caso.questions)}`;
}

/** Il primo oggetto JSON nel testo (i modelli aggiungono spesso prosa attorno). */
function estraiJson(testo) {
  try {
    return JSON.parse(testo);
  } catch {
    /* continua */
  }
  const i = testo.indexOf("{");
  const j = testo.lastIndexOf("}");
  if (i >= 0 && j > i) {
    try {
      return JSON.parse(testo.slice(i, j + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/** L'etichetta rispettata esiste fra quelle ammesse? (case-insensitive, tollera spazi) */
function etichettaValida(tipo, criteria, valore) {
  if (tipo === "boolean" || tipo === "noul") return typeof valore === "boolean" || valore === "SI" || valore === "no" || valore === "sì";
  const ammesse = Array.isArray(criteria) ? criteria : Object.keys(criteria || {});
  const v = String(valore).trim().toLowerCase();
  return ammesse.some((a) => String(a).trim().toLowerCase() === v);
}

async function chiama(caso) {
  const corpo = {
    messages: [
      { role: "system", content: SISTEMA },
      { role: "user", content: promptUtente(caso) },
    ],
    max_tokens: MAX_TOKENS,
    temperature: 0,
    seed: 1,
    cache_prompt: false,
    response_format: { type: "json_object" },
  };
  const t0 = Date.now();
  let r = await fetch(`${URL_SERVER}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(600_000),
  });
  if (r.status === 400) {
    // qualche build non accetta response_format: si riprova senza
    delete corpo.response_format;
    r = await fetch(`${URL_SERVER}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(600_000),
    });
  }
  const testo = await r.text();
  const secondi = (Date.now() - t0) / 1000;
  if (!r.ok) throw new Error(`${r.status}: ${testo.slice(0, 300)}`);
  const d = JSON.parse(testo);
  const scelta = d.choices?.[0];
  const contenuto = scelta?.message?.content ?? "";
  const json = estraiJson(contenuto);
  const usage = d.usage || {};
  const chiavi = json && typeof json === "object" ? Object.keys(json) : [];
  const attese = Object.keys(caso.questions);
  const mancanti = attese.filter((k) => !chiavi.includes(k));
  const sbagliate = attese.filter((k) => json && k in json && !etichettaValida(caso.questions[k].type, caso.questions[k].criteria, json[k]));
  return {
    caso: caso.id,
    categoria: caso.categoria,
    decisioni: attese.length,
    prompt_tokens: usage.prompt_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    secondi: Number(secondi.toFixed(2)),
    prompt_ms: d.timings?.prompt_ms ?? null,
    predicted_ms: d.timings?.predicted_ms ?? null,
    troncato: scelta?.finish_reason === "length",
    json_valido: !!json,
    mancanti,
    etichette_fuori_elenco: sbagliate,
    risposta: json ?? contenuto.slice(0, 300),
    testo_grezzo: contenuto,
  };
}

try {
  const h = await (await fetch(`${URL_SERVER}/health`, { signal: AbortSignal.timeout(3000) })).json();
  console.log(`\ngenerativo su ${URL_SERVER} · ${casi.length} casi · max_tokens ${MAX_TOKENS}\n`);
  void h;
} catch {
  console.error(
    `Il generativo non risponde su ${URL_SERVER}. Avvia llama-server (vedi l'intestazione di questo file) e spegni Decision_M: la RAM non basta per entrambi.`,
  );
  process.exit(1);
}

const esiti = [];
let totIn = 0;
let totOut = 0;
let totSec = 0;
let decisioni = 0;
let ko = 0;

for (const caso of casi) {
  let e;
  try {
    e = await chiama(caso);
  } catch (err) {
    ko++;
    console.log(`  ✘ ${caso.id.padEnd(24)} ERRORE ${err.message.split("\n")[0]}`);
    esiti.push({ caso: caso.id, categoria: caso.categoria, errore: err.message });
    continue;
  }
  totIn += e.prompt_tokens;
  totOut += e.completion_tokens;
  totSec += e.secondi;
  decisioni += e.decisioni;
  const problemi = [
    e.json_valido ? null : "JSON non valido",
    e.troncato ? "TRONCATO" : null,
    e.mancanti.length ? `mancano ${e.mancanti.join(",")}` : null,
    e.etichette_fuori_elenco.length ? `fuori elenco: ${e.etichette_fuori_elenco.join(",")}` : null,
  ].filter(Boolean);
  if (problemi.length) ko++;
  console.log(
    `  ${caso.id.padEnd(24)} ${String(e.decisioni).padStart(2)} dom · ${String(e.prompt_tokens).padStart(4)} tok in · ${String(e.completion_tokens).padStart(3)} generati · ${e.secondi.toFixed(1).padStart(5)} s` +
      (problemi.length ? `  ✘ ${problemi.join(" · ")}` : "  ✔"),
  );
  esiti.push(e);
}

const aggregati = {
  casi: casi.length,
  casi_con_problemi: ko,
  decisioni,
  prompt_tokens_totali: totIn,
  completion_tokens_totali: totOut,
  token_totali: totIn + totOut,
  prompt_tokens_per_decisione: Number((totIn / (decisioni || 1)).toFixed(1)),
  completion_tokens_per_decisione: Number((totOut / (decisioni || 1)).toFixed(1)),
  secondi_totali: Number(totSec.toFixed(1)),
  secondi_per_decisione: Number((totSec / (decisioni || 1)).toFixed(1)),
};
console.log("\n— aggregati generativo —");
for (const [k, v] of Object.entries(aggregati)) console.log(`  ${k.padEnd(34)} ${v}`);

writeFileSync(
  fileOut.startsWith("/") ? fileOut : join(QUI, fileOut),
  JSON.stringify({ quando: new Date().toISOString(), servizio: URL_SERVER, max_tokens: MAX_TOKENS, aggregati, esiti }, null, 2),
);
console.log(`\nesiti salvati in ${fileOut.startsWith("/") ? fileOut : join(QUI, fileOut)}\n`);
