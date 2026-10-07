#!/usr/bin/env node
/**
 * IL PORTIERE — la policy che sta FRA il modello e la decisione.
 *
 * Il decisore tipizzato risponde con probabilità; la decisione operativa resta al codice
 * (è la tesi della skill `decision-m`). Questo modulo è quella policy, in tre mosse:
 *
 *   1. PRE-FILTRO   — se la risposta sta già nel testo (una regex, un confronto con una
 *                     costante di dominio), NON si chiede al modello: si calcola.
 *   2. DEDUZIONE    — se la risposta è una funzione di un'altra risposta
 *                     («contraddice» ⇒ «serve correzione»), NON si chiede: si deriva.
 *                     È il rimedio all'errore che il modello faceva con confidenza 0,01.
 *   3. COERENZA     — se il modello contraddice i propri dati su domande correlate
 *                     (rischio alto ma «agisci senza umano»), il vincolo impone il valore.
 *
 * Il modello resta quello che è: in più, ogni probabilità viene letta a FASCE
 * (sicuro_sì / dubbio / sicuro_no) invece che trattata come un sì/no.
 *
 *   node media/decision-m-portiere.mjs --out media/decision-m-paragone-esiti-portiere.json [--solo id]
 *   node media/decision-m-portiere.mjs --fascia 0.72     # prova la lettura a fasce, senza servizio
 *
 * La policy sta QUI, nel codice, ed è leggibile: se una regola è sbagliata si vede e si
 * corregge; se il modello sbaglia con confidenza 0,00 non si vede e non si corregge.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { normalizeQuestions, SOGLIE, fascia } from "./decision-m-tool.mjs";

const QUI = dirname(fileURLToPath(import.meta.url));
const URL_SERVIZIO = process.env.DECISION_M_URL || "http://127.0.0.1:8017";
const args = process.argv.slice(2);
const leggi = (nome, def = null) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const fileOut = leggi("--out");
const filtro = (() => {
  const s = leggi("--solo");
  return s ? new Set(s.split(",").map((x) => x.trim())) : null;
})();

// ── SOGLIE ───────────────────────────────────────────────────────────────────────
// Vivono in media/decision-m-tool.mjs (un posto solo, condivise col tool in chat):
// fra `no` e `si` il portiere NON decide — la via di mezzo non e' un si'.

/** Due righe leggibili sulle fasce di una risposta (`--fascia` senza servizio). */
if (args.includes("--fascia")) {
  const p = Number(leggi("--fascia", "0.5"));
  console.log(`P(vero) = ${p} → ${fascia(p)}   (soglie: sicuro_si >= ${SOGLIE.si} · sicuro_no <= ${SOGLIE.no} · in mezzo: dubbio)`);
  process.exit(0);
}

// ── COSTANTI DI DOMINIO ──────────────────────────────────────────────────────────
const GIORNI_RIMBORSO = 14; // la policy dell'azienda, non una variabile del modello

// ── LA POLICY ────────────────────────────────────────────────────────────────────
// prefiltri:  { domanda: ({state}) => {valore, regola} | null }   null = non decidibile, si chiede
// deduzioni:  { domanda: ({risposte}) => {valore, regola} }       funzione TOTALE
// coerenza:   [{domanda, quando({risposte}), imponi, perche}]      vincolo fra domande correlate
export const POLICY = {
  "tool-dispatch": {
    prefiltri: {
      percorso_esplicito: ({ state }) => {
        const m = String(state).match(/\b[\w./-]+\.(md|txt|json|csv|ya?ml|pdf|docx?|xlsx?)\b/i);
        return m
          ? { valore: true, regola: `il messaggio nomina il file «${m[0]}»` }
          : { valore: false, regola: "nessun nome di file nel messaggio" };
      },
    },
  },
  "rag-filtering": {
    prefiltri: {
      contraddice_policy: ({ state }) => {
        const m = String(state).match(/(\d+)\s*giorni/);
        if (!m) return null; // senza un numero nel testo non c'è nulla da calcolare: si chiede
        const g = Number(m[1]);
        return { valore: g > GIORNI_RIMBORSO, regola: `il passaggio dice ${g} giorni, la policy ${GIORNI_RIMBORSO}` };
      },
    },
  },
  "compliance-checklist": {
    prefiltri: {
      trasferimenti: ({ state }) => {
        const s = String(state);
        if (/non\s+sono\s+trasferit[ie]\s+fuori\s+dall['’]?\s*(unione|ue)/i.test(s))
          return { valore: true, regola: "il testo dichiara esplicitamente che i dati non escono dall'UE" };
        if (/trasferit[ie]\s+(verso|fuori)\s+(l['’]?\s*)?(unione|ue|paesi)/i.test(s))
          return { valore: true, regola: "il testo parla di trasferimenti" };
        return null;
      },
    },
    deduzioni: {
      esito: ({ risposte }) => {
        const vero = (k) => risposte?.[k]?.noul >= 0.5;
        if (vero("base_giuridica") === false) return { valore: "non_conforme", regola: "manca la base giuridica, elemento obbligatorio" };
        if (vero("finalita_dichiarata") && vero("base_giuridica") && vero("trasferimenti"))
          return { valore: "conforme", regola: "finalità, base giuridica e trasferimenti risultano tutti dichiarati" };
        return { valore: "da_rivedere", regola: "qualcosa manca o è ambiguo" };
      },
    },
  },
  "citation-verification": {
    deduzioni: {
      serve_correzione: ({ risposte }) => {
        const r = risposte?.rapporto?.choice;
        if (r === "contraddice") return { valore: true, regola: "se la fonte contraddice, l'affermazione va corretta" };
        if (r === "sostiene") return { valore: false, regola: "se la fonte sostiene, non c'è nulla da correggere" };
        return { valore: true, regola: "fonte non pertinente: l'affermazione resta non verificata" };
      },
    },
  },
  "agent-skill-selection": {
    deduzioni: {
      manca_strumento: ({ risposte }) => {
        const s = risposte?.skill?.choice;
        return s === "nessuna"
          ? { valore: true, regola: "nessuna voce del roster copre il compito" }
          : { valore: false, regola: "una voce del roster copre il compito" };
      },
    },
  },
  "confidence-gated-refund": {
    coerenza: [
      {
        domanda: "agire_senza_umano",
        quando: ({ risposte }) => risposte?.rischio?.score >= 1.5,
        imponi: false,
        perche: "rischio alto ⇒ il rimborso non si esegue senza una persona",
      },
    ],
  },
  "guardrail-input": {
    coerenza: [
      {
        domanda: "azione",
        quando: ({ risposte }) => risposte?.injection?.noul >= 0.5 && risposte?.danno_se_obbedisce?.score >= 1.5,
        imponi: "bloccare",
        perche: "iniezione riuscita e danno grave ⇒ si rifiuta e si registra",
      },
    ],
  },
};

// ── IL CICLO ─────────────────────────────────────────────────────────────────────
const batteria = JSON.parse(readFileSync(join(QUI, "decision-m-batteria.json"), "utf8"));
const casi = batteria.casi.filter((c) => !filtro || filtro.has(c.id));

/** Risposta derivata o imposta, nella stessa forma delle risposte del servizio. */
function comeRisposta(tipo, valore, extra = {}) {
  if (tipo === "boolean" || tipo === "noul") return { type: "noul", noul: valore ? 1 : 0, ...extra };
  return { type: "choice", choice: valore, probabilities: { [valore]: 1 }, ...extra };
}

async function salute() {
  try {
    const r = await fetch(`${URL_SERVIZIO}/health`, { signal: AbortSignal.timeout(2500) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

const h = await salute();
if (!h) {
  console.error(`Il decisore non risponde su ${URL_SERVIZIO}: accendilo (menu features → Decision_M, oppure decision_m_service action="start").`);
  process.exit(1);
}
console.log(`\nportiere attivo · ${h.model?.gguf_source || "?"} ${h.model?.precision || ""} · ${casi.length} casi · soglie sì>=${SOGLIE.si} no<=${SOGLIE.no}\n`);

const esiti = [];
let totIn = 0,
  totOut = 0,
  totSec = 0,
  chieste = 0,
  derivate = 0,
  imposte = 0,
  decisioni = 0,
  errori = 0;

for (const caso of casi) {
  const policy = POLICY[caso.id] || {};
  const ids = Object.keys(caso.questions);
  decisioni += ids.length;

  // 1. pre-filtri
  const risposte = {};
  const daCalcolo = {};
  for (const [id, f] of Object.entries(policy.prefiltri || {})) {
    const r = f({ caso, state: caso.state });
    if (r) {
      risposte[id] = comeRisposta(caso.questions[id].type, r.valore, { calcolata: true, regola: r.regola });
      daCalcolo[id] = r.regola;
    }
  }

  // 2. domande da chiedere davvero (fuori quelle calcolate e quelle deducibili)
  const deducibili = Object.keys(policy.deduzioni || {});
  const daChiedere = ids.filter((id) => !risposte[id] && !deducibili.includes(id));

  const t0 = Date.now();
  let input_tokens = 0,
    output_tokens = 0;
  if (daChiedere.length) {
    const questions = {};
    for (const id of daChiedere) questions[id] = caso.questions[id];
    try {
      const r = await fetch(`${URL_SERVIZIO}/v1/systemone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "rizzo-latest", state: caso.state, questions: normalizeQuestions(questions) }),
        signal: AbortSignal.timeout(600_000),
      });
      const testo = await r.text();
      if (!r.ok) throw new Error(`${r.status}: ${testo.slice(0, 160)}`);
      const d = JSON.parse(testo);
      input_tokens = d.usage?.input_tokens ?? 0;
      output_tokens = d.usage?.output_tokens ?? 0;
      for (const id of daChiedere) risposte[id] = d.answers?.[id];
    } catch (e) {
      errori++;
      console.log(`  ✘ ${caso.id.padEnd(24)} ERRORE ${String(e.message).split("\n")[0]}`);
      esiti.push({ id: caso.id, categoria: caso.categoria, errore: String(e.message) });
      continue;
    }
  } else {
    // nessuna domanda da porre: nessuna chiamata, nessun token, nessun secondo di CPU
    console.log(`  · ${caso.id.padEnd(24)} tutte le decisioni risolte dal codice`);
  }
  const secondi = (Date.now() - t0) / 1000;
  chieste += daChiedere.length;
  totIn += input_tokens;
  totOut += output_tokens;
  totSec += secondi;

  // 3. deduzioni (dalle risposte appena ottenute)
  const derivateId = {};
  for (const [id, f] of Object.entries(policy.deduzioni || {})) {
    const r = f({ risposte, caso });
    risposte[id] = comeRisposta(caso.questions[id].type, r.valore, { derivata: true, regola: r.regola });
    derivateId[id] = r.regola;
    derivate++;
  }

  // 4. coerenza: il codice impone il valore quando il modello si contraddice
  const imposteId = [];
  for (const vincolo of policy.coerenza || []) {
    if (!vincolo.quando({ risposte, caso })) continue;
    const attuale = risposte[vincolo.domanda];
    const valoreAttuale = attuale?.type === "noul" ? attuale.noul >= 0.5 : attuale?.choice;
    if (valoreAttuale === vincolo.imponi) continue; // già coerente
    risposte[vincolo.domanda] = comeRisposta(caso.questions[vincolo.domanda].type, vincolo.imponi, {
      imposta: true,
      regola: vincolo.perche,
      era: valoreAttuale,
    });
    imposteId.push(vincolo.domanda);
    imposte++;
  }

  // 5. lettura a fasce (per il modello: nessuna probabilità va letta come sì/no)
  const fasce = {};
  for (const id of ids) {
    const a = risposte[id];
    if (a?.type === "noul") fasce[id] = fascia(a.noul);
    else if (a?.type === "choice" && a.confidence !== undefined) fasce[id] = a.confidence >= SOGLIE.scelta_netta ? "SCELTA_NETTA" : "SCELTA_INCERTA";
  }

  const lettura = ids.map((id) => {
    const a = risposte[id];
    const tag = a?.calcolata ? "⟨codice⟩" : a?.derivata ? "⟨dedotta⟩" : a?.imposta ? "⟨imposta⟩" : "";
    if (a?.type === "noul") return `${id}=${a.noul >= 0.5 ? "SI" : "no"}(${Number(a.noul).toFixed(2)})${tag}`;
    if (a?.type === "choice") return `${id}=${a.choice}${tag}`;
    return `${id}=${Number(a?.score).toFixed(2)}${tag}`;
  });

  console.log(
    `  ${caso.id.padEnd(24)} chieste ${String(daChiedere.length).padStart(2)}/${String(ids.length).padStart(2)} · ${String(input_tokens).padStart(4)} token in · ${secondi.toFixed(1).padStart(5)} s  →  ${lettura.join("  ")}`,
  );

  esiti.push({
    id: caso.id,
    categoria: caso.categoria,
    decisioni: ids.length,
    chieste: daChiedere.length,
    calcolate: Object.keys(daCalcolo).length,
    derivate: Object.keys(derivateId).length,
    imposte: imposteId.length,
    input_tokens,
    output_tokens,
    secondi: Number(secondi.toFixed(2)),
    risposte,
    fasce,
    regole: { calcolate: daCalcolo, derivate: derivateId, imposte: imposteId },
    lettura: lettura.join(" · "),
  });
}

const aggregati = {
  "casi": casi.length - errori,
  "decisioni totali": decisioni,
  "domande poste al modello": chieste,
  "risposte calcolate dal codice (pre-filtro)": decisioni - chieste - derivate - imposte,
  "risposte dedotte da altre risposte": derivate,
  "risposte imposte dalla coerenza": imposte,
  "token in ingresso": totIn,
  "token generati": totOut,
  "token in ingresso per domanda posta": Number((totIn / (chieste || 1)).toFixed(1)),
  "secondi totali": Number(totSec.toFixed(1)),
  "secondi per decisione": Number((totSec / (decisioni || 1)).toFixed(2)),
  "errori": errori,
};
console.log("\n— aggregati portiere —");
for (const [k, v] of Object.entries(aggregati)) console.log(`  ${k.padEnd(44)} ${v}`);

if (fileOut) {
  // il percorso puo' arrivare come "media/x.json", "x.json" o assoluto
  const destinazione = fileOut.startsWith("/") ? fileOut : existsSync(dirname(fileOut)) ? fileOut : join(QUI, fileOut);
  writeFileSync(
    destinazione,
    JSON.stringify({ quando: new Date().toISOString(), servizio: URL_SERVIZIO, soglie: SOGLIE, modello: h.model, aggregati, esiti }, null, 2),
  );
  console.log(`\nesiti salvati in ${destinazione}\n`);
}
