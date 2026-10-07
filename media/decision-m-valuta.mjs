#!/usr/bin/env node
/**
 * Valuta gli esiti di un braccio contro le RISPOSTE ATTESE scritte in media/decision-m-batteria.json.
 * Niente giudizio umano a posteriori: ogni domanda porta con se' il valore atteso, la certezza e il motivo.
 *
 *   node media/decision-m-valuta.mjs media/decision-m-paragone-esiti-decisore.json
 *   node media/decision-m-valuta.mjs media/decision-m-paragone-esiti-decisore.json media/decision-m-paragone-esiti-generativo.json
 *   node media/decision-m-valuta.mjs <esiti.json> --json --out media/decision-m-valutazione.json
 *
 * Regole (dichiarate nel report, non nascoste qui):
 *   - boolean / choice  -> corretta se il valore coincide (le etichette si confrontano senza maiuscole);
 *   - score             -> il modello risponde con un livello ATTESO (numero frazionario), il generativo con
 *                          un'etichetta: si confrontano come distanza dal livello atteso.
 *                          distanza <= 0,5 = corretta · <= 1,0 = quasi · > 1,0 = sbagliata;
 *   - attesa null       -> non giudicabile, esclusa dai conteggi (e dichiarata);
 *   - le attese con certezza "alta" si contano anche da sole: il resto e' opinabile.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const QUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const iOut = args.indexOf("--out");
const fileOut = iOut >= 0 ? args[iOut + 1] : null;
// i file di esiti sono gli argomenti .json, escluso il valore di --out
const fileEsiti = args.filter((a, i) => !a.startsWith("--") && a.endsWith(".json") && (iOut < 0 || i !== iOut + 1));
if (!fileEsiti.length) {
  console.error("Uso: node media/decision-m-valuta.mjs <esiti.json> [altri esiti.json] [--json] [--out file.json]");
  process.exit(1);
}

const batteria = JSON.parse(readFileSync(join(QUI, "decision-m-batteria.json"), "utf8"));
const attese = {};
for (const c of batteria.casi) {
  for (const [id, q] of Object.entries(c.questions)) {
    attese[`${c.id}.${id}`] = { ...q.attesa, tipo: q.type, criterio: q.criteria, caso: c.id, domanda: id };
  }
}

/** Porta la risposta di un braccio a un valore confrontabile, o a null se non c'e'. */
function valoreRisposta(esito, id, tipo) {
  // braccio decisore: esito.risposte[id] = { type:"noul"|"choice", noul, choice, score }
  const r = esito?.risposte?.[id];
  if (r) {
    if (r.type === "noul") return { valore: r.noul >= 0.5, grezzo: r.noul, certo: true };
    if (r.type === "choice") return { valore: r.choice, grezzo: r.choice, certo: true };
    if (typeof r.score === "number") return { valore: r.score, grezzo: r.score, certo: true };
  }
  // braccio generativo: esito.risposta[id] = true | "etichetta"
  const g = esito?.risposta?.[id];
  if (g === undefined || g === null) return null;
  if (typeof g === "boolean") return { valore: g, grezzo: g, certo: true };
  if (typeof g === "number") return { valore: g, grezzo: g, certo: true };
  const testo = String(g).trim();
  if (tipo === "boolean" || tipo === "noul") {
    const t = testo.toLowerCase();
    if (["true", "sì", "si", "vero", "yes", "1"].includes(t)) return { valore: true, grezzo: g, certo: true };
    if (["false", "no", "falso", "0"].includes(t)) return { valore: false, grezzo: g, certo: true };
    return { valore: null, grezzo: g, certo: false };
  }
  if (tipo === "score") {
    // il livello si risolve in confronta(), dove si conoscono i criteri della domanda
    return { valore: testo, grezzo: g, certo: true };
  }
  return { valore: testo, grezzo: g, certo: true };
}

/** Distanza fra risposta e attesa, secondo il tipo. */
function confronta(att, q, risp, esitiBatteria) {
  if (risp === null) return { classe: "assente", dettaglio: "nessuna risposta" };
  if (!risp.certo) return { classe: "non-interpretabile", dettaglio: `valore "${risp.grezzo}" non riconosciuto fra le opzioni` };
  if (q.type === "boolean" || q.type === "noul") {
    if (typeof risp.valore !== "boolean") return { classe: "sbagliata", dettaglio: `atteso ${att.valore}, risposto "${risp.grezzo}"` };
    return risp.valore === att.valore
      ? { classe: "corretta", dettaglio: `${risp.grezzo}` }
      : { classe: "sbagliata", dettaglio: `atteso ${att.valore}, risposto ${risp.grezzo}` };
  }
  if (q.type === "choice") {
    const a = String(att.valore).toLowerCase();
    const v = String(risp.valore).toLowerCase();
    return a === v
      ? { classe: "corretta", dettaglio: `${risp.grezzo}` }
      : { classe: "sbagliata", dettaglio: `atteso "${att.valore}", risposto "${risp.grezzo}"` };
  }
  // score: distanza dal livello atteso
  let valore = risp.valore;
  if (typeof valore === "string") {
    const livelli = Array.isArray(q.criteria) ? q.criteria : [];
    const i = livelli.findIndex((l) => String(l).trim().toLowerCase() === valore.trim().toLowerCase());
    if (i < 0) return { classe: "non-interpretabile", dettaglio: `"${valore}" non e' uno dei livelli ${JSON.stringify(livelli)}` };
    valore = i;
  }
  const d = Math.abs(Number(valore) - Number(att.valore));
  if (Number.isNaN(d)) return { classe: "assente", dettaglio: "valore non numerico" };
  const classe = d <= 0.5 ? "corretta" : d <= 1.0 ? "quasi" : "sbagliata";
  return { classe, dettaglio: `atteso ${att.valore}, risposto ${typeof risp.grezzo === "number" ? risp.grezzo.toFixed(2) : risp.grezzo} (distanza ${d.toFixed(2)})` };
}

const rapporti = [];
for (const file of fileEsiti) {
  // il percorso puo' arrivare come "media/x.json", "x.json" o assoluto: si prova nell'ordine
  const percorso = [file, join(QUI, file), join(QUI, file.replace(/^media\//, ""))].find((p) => existsSync(p));
  if (!percorso) {
    console.error(`File di esiti non trovato: ${file}`);
    process.exit(1);
  }
  const d = JSON.parse(readFileSync(percorso, "utf8"));
  const righe = [];
  for (const e of d.esiti) {
    if (e.errore) {
      righe.push({ chiave: `${e.caso ?? e.id}.—`, classe: "assente", dettaglio: `errore tecnico: ${e.errore}` });
      continue;
    }
    const casoId = e.caso ?? e.id;
    const caso = batteria.casi.find((c) => c.id === casoId);
    for (const [id, q] of Object.entries(caso.questions)) {
      const att = attese[`${casoId}.${id}`];
      if (att.valore === null) {
        righe.push({ chiave: `${casoId}.${id}`, classe: "non-giudicabile", dettaglio: att.perche || "", tipo: q.type, certezza: "—", caso: casoId, domanda: id });
        continue;
      }
      const risp = valoreRisposta(e, id, q.type);
      const esito = confronta(att, q, risp);
      righe.push({ ...esito, chiave: `${casoId}.${id}`, tipo: q.type, certezza: att.certezza, attesa: att.valore, perche: att.perche, grezzo: risp?.grezzo ?? null, caso: casoId, domanda: id });
    }
  }
  const conta = (f) => righe.filter(f).length;
  const tot = conta((r) => r.classe !== "non-giudicabile");
  const corrette = conta((r) => r.classe === "corretta");
  const quasi = conta((r) => r.classe === "quasi");
  const sbagliate = conta((r) => r.classe === "sbagliata" || r.classe === "assente" || r.classe === "non-interpretabile");
  const alta = righe.filter((r) => r.certezza === "alta");
  const altaOk = alta.filter((r) => r.classe === "corretta" || r.classe === "quasi").length;
  const perTipo = {};
  for (const t of ["boolean", "choice", "score"]) {
    const g = righe.filter((r) => r.tipo === t && r.classe !== "non-giudicabile");
    perTipo[t] = { tot: g.length, ok: g.filter((r) => r.classe === "corretta").length, quasi: g.filter((r) => r.classe === "quasi").length };
  }
  const rapporto = {
    file,
    quando: d.quando ?? null,
    etichetta: file.includes("generativo")
      ? "generativo"
      : file.includes("portiere")
        ? "portiere (codice + modello)"
        : file.includes("decisore")
          ? "decisore (modello nudo)"
          : "braccio sconosciuto",
    punti_giudicabili: tot,
    corrette,
    quasi,
    sbagliate,
    non_giudicabili: conta((r) => r.classe === "non-giudicabile"),
    accuratezza: tot ? Number(((corrette / tot) * 100).toFixed(1)) : null,
    accuratezza_con_quasi: tot ? Number((((corrette + quasi) / tot) * 100).toFixed(1)) : null,
    accuratezza_certezza_alta: alta.length ? Number(((altaOk / alta.length) * 100).toFixed(1)) : null,
    certezza_alta_n: alta.length,
    per_tipo: perTipo,
    errori: righe.filter((r) => ["sbagliata", "assente", "non-interpretabile"].includes(r.classe)),
    righe,
  };
  rapporti.push(rapporto);
}

for (const r of rapporti) {
  console.log(`\n══ ${r.etichetta}  (${r.file})`);
  console.log(`  giudicabili ${r.punti_giudicabili} · corrette ${r.corrette} · quasi ${r.quasi} · sbagliate ${r.sbagliate} · non giudicabili ${r.non_giudicabili}`);
  console.log(`  accuratezza ${r.accuratezza}%  ·  con le quasi corrette ${r.accuratezza_con_quasi}%  ·  solo certezza alta ${r.accuratezza_certezza_alta}% (${r.certezza_alta_n} punti)`);
  console.log(`  per tipo: ` + Object.entries(r.per_tipo).map(([t, v]) => `${t} ${v.ok}/${v.tot}${v.quasi ? ` (+${v.quasi} quasi)` : ""}`).join(" · "));
  if (r.errori.length) {
    console.log("  errori:");
    for (const e of r.errori) console.log(`    ✘ ${e.chiave.padEnd(34)} [${e.certezza}] ${e.dettaglio}`);
  }
}

if (rapporti.length === 2) {
  const [a, b] = rapporti;
  console.log(`\n══ confronto`);
  console.log(`  ${a.etichetta}: ${a.accuratezza}% (${a.corrette}/${a.punti_giudicabili}) · ${b.etichetta}: ${b.accuratezza}% (${b.corrette}/${b.punti_giudicabili})`);
  const ca = new Set(a.errori.map((e) => e.chiave));
  const cb = new Set(b.errori.map((e) => e.chiave));
  const soloA = [...ca].filter((x) => !cb.has(x));
  const soloB = [...cb].filter((x) => !ca.has(x));
  console.log(`  sbagliate solo da ${a.etichetta}: ${soloA.length ? soloA.join(", ") : "—"}`);
  console.log(`  sbagliate solo da ${b.etichetta}: ${soloB.length ? soloB.join(", ") : "—"}`);
}
console.log("");

if (fileOut) {
  // il percorso puo' arrivare come "media/x.json", "x.json" o assoluto
  const destinazione = fileOut.startsWith("/") ? fileOut : existsSync(dirname(fileOut)) ? fileOut : join(QUI, fileOut);
  writeFileSync(destinazione, JSON.stringify({ quando: new Date().toISOString(), rapporti }, null, 2));
  console.log(`valutazione salvata in ${destinazione}\n`);
}
if (args.includes("--json")) console.log(JSON.stringify(rapporti, null, 2));
