/**
 * Il grafo della memoria: struttura, non testo.
 *
 * PERCHÉ UN GRAFO, E PERCHÉ PROPRIO QUESTO. Il modo più economico di rispondere a «cosa c'è
 * intorno a questo?» non è restituire testo: è restituire pochi nomi e le loro relazioni.
 * Trenta nodi in forma testuale costano ~300 token: nessuna ricerca, nessun `read`, nessun
 * file intero li batte. È l'unico accesso alla memoria che costa quasi zero, ed è il motivo
 * per cui il grafo si consulta PRIMA di aprire qualunque cosa.
 *
 * ARCHI SOLO DA FATTI VERIFICABILI. Ogni arco nasce da qualcosa che è successo davvero: un
 * file scritto in quella sessione, una decisione registrata, un percorso citato in un
 * documento. Nessun arco per somiglianza, nessuna inferenza. Una memoria che inventa
 * collegamenti è credibile e falsa — il difetto peggiore possibile — e le relazioni esplicite
 * hanno il vantaggio di potersi spiegare una per una.
 *
 * L'ATLANTE non è un caso a parte: legge questo stesso file. I suoi assi sono domande a cui
 * la geometria risponde — l'altezza è il livello della memoria (cosa è successo → cosa si è
 * deciso → cosa si è prodotto), l'angolo è il progetto, il raggio è la centralità. Se un asse
 * non significasse niente, la vista sarebbe un gomitolo.
 */
import { join } from "node:path";
import {
  ROOT, GRAFO_FILE, elencaFile, leggiTesto, leggiJson, scriviJson, meta, relativo,
  normalizza, stimaToken, adesso,
} from "./memoria-core.mjs";
import { elencaEpisodi } from "./memoria-episodio.mjs";

/** I livelli della memoria, dal basso in alto: è l'asse Y dell'atlante. */
export const STRATI = {
  episodio: { label: "Episodio", ordine: 1, colore: "#5b9dff" },
  decisione: { label: "Decisione", ordine: 2, colore: "#8b5cff" },
  obiettivo: { label: "Obiettivo", ordine: 3, colore: "#fbbf24" },
  artefatto: { label: "Artefatto", ordine: 4, colore: "#34d399" },
};

/** Relazioni e colori: poche e con un verso chiaro. */
export const RELAZIONI = {
  "ha-deciso": { label: "ha deciso", inversa: "è stato deciso in", colore: "#8b5cff" },
  "ha-toccato": { label: "ha toccato", inversa: "è stato toccato da", colore: "#34d399" },
  "riguarda": { label: "riguarda", inversa: "è riguardato da", colore: "#38bdf8" },
  "serve": { label: "serve", inversa: "serve a", colore: "#fbbf24" },
  "segue": { label: "segue", inversa: "precede", colore: "#8b97ac" },
  "cita": { label: "cita", inversa: "è citato da", colore: "#5b9dff" },
};

const COLORI_AREA = ["#5b9dff", "#8b5cff", "#34d399", "#fbbf24", "#38bdf8", "#fb7185", "#a78bfa", "#2dd4bf"];
const EST_ARTEFATTO = /\.(mjs|js|json|md|sh|py|html|txt|yml|yaml|toml|sql|svg|css)$/i;
/**
 * Cartelle che non diventano MAI nodi della memoria: sono lavoro in corso o archivi.
 * `backups/` e `backup_export/` contengono copie di tutto (e dati vecchi: il grafo si
 * riempirebbe di nodi doppi), `sessions/` sono le sessioni grezze — già rappresentate
 * dall'episodio — e `node_modules/` è codice altrui.
 */
const PREFISSI_ESCLUSI = ["backups/", "backup_export/", "sessions/", "node_modules/", ".git/", "download/"];
/** Ordine di lettura delle relazioni: prima ciò che spiega, poi ciò che elenca. */
const ORDINE_REL = ["ha-deciso", "serve", "riguarda", "ha-toccato", "cita", "segue"];

/** L'area di un percorso: il progetto dichiarato se c'è, altrimenti la sua prima cartella. */
export function areaDi(percorso, cartelleProgetto = []) {
  const rel = String(percorso || "").replace(/^\/+/, "");
  for (const c of cartelleProgetto) {
    const p = String(c?.path || "").replace(/^\/+|\/+$/g, "");
    if (p && (rel === p || rel.startsWith(p + "/"))) return { id: p, label: c.label || p };
  }
  const prima = rel.split("/")[0] || "";
  if (!prima || !rel.includes("/")) return { id: "radice", label: "radice" };
  return { id: prima, label: prima };
}

/** Gli artefatti di un episodio: i percorsi elencati nella sua sezione «File toccati». */
function artefattiDi(markdown) {
  const m = String(markdown || "").match(/## File toccati\n([\s\S]*?)(?:\n##|$)/);
  if (!m) return [];
  return [...new Set([...m[1].matchAll(/`([^`]+)`/g)].map((x) => x[1]))].filter(
    (r) => EST_ARTEFATTO.test(r) && !PREFISSI_ESCLUSI.some((p) => r.startsWith(p)),
  );
}

function richiesteDi(markdown) {
  const m = String(markdown || "").match(/## Richieste\n([\s\S]*?)(?:\n##|$)/);
  return m ? m[1].replace(/^\d+\.\s*/gm, "").replace(/\s+/g, " ").trim().slice(0, 300) : "";
}

const CITAZIONE = /`([A-Za-z0-9_][A-Za-z0-9_./-]+\.(?:mjs|js|json|md|sh|py|html|yml|yaml|sql|css))`/g;

/** Documenti che citano percorsi fra backtick: da lì nascono gli archi `cita`. */
async function citazioniNeiDocumenti() {
  const fuori = [];
  for (const [dir, ricorsivo] of [["docs", true], ["skills", true], ["media", false]]) {
    const assoluto = join(ROOT, dir);
    if (!(await meta(assoluto))) continue;
    for (const f of await elencaFile(assoluto, { est: [".md"], ricorsivo })) {
      const testo = await leggiTesto(f);
      if (!testo) continue;
      const citazioni = [...new Set([...testo.matchAll(CITAZIONE)].map((x) => x[1]))];
      if (citazioni.length) fuori.push({ rel: relativo(f), citazioni });
    }
  }
  return fuori;
}

/**
 * Costruisce il grafo da ciò che è già registrato: episodi (con le loro decisioni),
 * obiettivi, artefatti toccati o citati. Deterministico: stesso materiale → stesso grafo.
 */
export async function buildGrafo({ silenzioso = true } = {}) {
  const episodi = await elencaEpisodi();
  const goals = (await leggiJson(join(ROOT, "media", "goals.json"), [])) || [];
  const progetto = (await leggiJson(join(ROOT, "media", "progetto.json"), { cartelle: [] })) || { cartelle: [] };
  const cartelle = Array.isArray(progetto.cartelle) ? progetto.cartelle : [];

  const nodi = [];
  const archi = [];
  const perId = new Map();
  const chiaveArco = new Set();

  const aggiungi = (nodo) => {
    const id = `${nodo.s}:${nodo.chiave}`;
    if (perId.has(id)) return perId.get(id);
    const voce = { id, indice: nodi.length, grado: 0, ...nodo };
    nodi.push(voce);
    perId.set(id, voce);
    return voce;
  };
  const collega = (a, b, r) => {
    if (!a || !b || a === b) return;
    const k = `${a.indice}|${b.indice}|${r}`;
    if (chiaveArco.has(k)) return;
    chiaveArco.add(k);
    archi.push({ a: a.indice, b: b.indice, r });
  };

  // --- obiettivi (gli stessi goal della dashboard: una sola verità) -----------------
  const nodoGoal = new Map();
  for (const g of goals) {
    if (!g?.id) continue;
    nodoGoal.set(
      String(g.id),
      aggiungi({
        s: "obiettivo",
        chiave: String(g.id),
        n: String(g.title || g.id).slice(0, 90),
        f: "media/goals.json",
        a: "radice",
        testo: [g.title, g.description, g.status ? `stato: ${g.status}` : ""].filter(Boolean).join(" — ").slice(0, 400),
      }),
    );
  }

  // --- episodi, decisioni, artefatti ------------------------------------------------
  for (const ep of episodi) {
    const d = ep.dati;
    const titolo = String(d.titolo || d.sessione || "sessione");
    const area = areaDi(d.progetto || "", cartelle);
    const testoEp = [
      d.decisione ? `decisione: ${d.decisione}` : "",
      d.perche ? `perché: ${d.perche}` : "",
      d.esito ? `esito: ${d.esito}` : "",
      richiesteDi(ep.markdown),
    ]
      .filter(Boolean)
      .join(" · ");

    const nEp = aggiungi({
      s: "episodio",
      chiave: String(d.sessione || ep.file),
      n: titolo,
      f: ep.file,
      a: area.id,
      data: String(d.data || ""),
      testo: testoEp.slice(0, 600),
    });

    let nDec = null;
    if (d.decisione) {
      nDec = aggiungi({
        s: "decisione",
        chiave: `${d.sessione || ep.file}:dec`,
        n: String(d.decisione).slice(0, 110),
        f: ep.file,
        a: area.id,
        data: String(d.data || ""),
        testo: String(d.decisione).slice(0, 400),
      });
      collega(nEp, nDec, "ha-deciso");
      const goal = d.obiettivo && nodoGoal.get(String(d.obiettivo));
      if (goal) collega(nDec, goal, "serve");
    }

    for (const rel of artefattiDi(ep.markdown)) {
      const n = aggiungi({
        s: "artefatto",
        chiave: rel,
        n: rel.split("/").pop(),
        f: rel,
        a: areaDi(rel, cartelle).id,
        testo: "",
      });
      collega(nEp, n, "ha-toccato");
      if (nDec) collega(nDec, n, "riguarda");
    }
  }

  // --- catena temporale fra episodi dello stesso progetto ----------------------------
  const perArea = new Map();
  for (const n of nodi) {
    if (n.s !== "episodio") continue;
    if (!perArea.has(n.a)) perArea.set(n.a, []);
    perArea.get(n.a).push(n);
  }
  for (const [, gruppo] of perArea) {
    gruppo.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    for (let i = 1; i < gruppo.length; i++) collega(gruppo[i - 1], gruppo[i], "segue");
  }

  // --- citazioni: un documento che nomina un artefatto lo collega --------------------
  const perPercorso = new Map(nodi.filter((n) => n.s === "artefatto").map((n) => [n.f, n]));
  for (const doc of await citazioniNeiDocumenti()) {
    const nDoc = perPercorso.get(doc.rel);
    if (!nDoc) continue;
    for (const cit of doc.citazioni) {
      const nCit = perPercorso.get(cit);
      if (nCit && nCit !== nDoc) collega(nDoc, nCit, "cita");
    }
  }

  for (const a of archi) {
    nodi[a.a].grado++;
    nodi[a.b].grado++;
  }

  // --- aree e colori -----------------------------------------------------------------
  const aree = {};
  [...new Set(nodi.map((n) => n.a))].sort().forEach((id, i) => {
    const trovata = cartelle.find((c) => String(c?.path || "").replace(/^\/+|\/+$/g, "") === id);
    aree[id] = { label: trovata?.label || id, colore: COLORI_AREA[i % COLORI_AREA.length] };
  });

  const dati = {
    versione: 1,
    generato: adesso(),
    nodi: nodi.map((n) => ({
      id: n.id,
      s: n.s,
      n: n.n,
      f: n.f,
      a: n.a,
      g: n.grado,
      ...(n.data ? { d: n.data } : {}),
      ...(n.testo ? { t: n.testo } : {}),
    })),
    archi,
    aree,
    strati: STRATI,
    colori: RELAZIONI,
    statistica: statistica(nodi, archi),
  };
  await scriviJson(GRAFO_FILE, dati);
  cacheGrafo = null;
  const info = await meta(GRAFO_FILE);
  const esito = {
    nodi: nodi.length,
    archi: archi.length,
    aree: Object.keys(aree).length,
    kb: info ? Math.round(info.size / 1024) : null,
    generato: dati.generato,
    statistica: dati.statistica,
  };
  if (!silenzioso) console.log(`[memoria] grafo: ${esito.nodi} nodi, ${esito.archi} archi, ${esito.aree} aree (${esito.kb} KB)`);
  return esito;
}

function statistica(nodi, archi) {
  const perStrato = {};
  const perArea = {};
  for (const n of nodi) {
    perStrato[n.s] = (perStrato[n.s] || 0) + 1;
    perArea[n.a] = perArea[n.a] || { nodi: 0, episodi: 0, decisioni: 0, artefatti: 0 };
    perArea[n.a].nodi++;
    if (n.s === "episodio") perArea[n.a].episodi++;
    if (n.s === "decisione") perArea[n.a].decisioni++;
    if (n.s === "artefatto") perArea[n.a].artefatti++;
  }
  return {
    per_strato: perStrato,
    per_area: perArea,
    isolati: nodi.filter((n) => n.grado === 0).length,
    episodi_senza_decisione: Math.max(0, (perStrato.episodio || 0) - (perStrato.decisione || 0)),
    densita: nodi.length ? Math.round((archi.length / nodi.length) * 100) / 100 : 0,
  };
}

// ---------------------------------------------------------------- lettura

let cacheGrafo = null;

export async function caricaGrafo({ forza = false } = {}) {
  const info = await meta(GRAFO_FILE);
  if (!info) return null;
  if (!forza && cacheGrafo && cacheGrafo.mtime === info.mtime) return cacheGrafo.grafo;
  const grafo = await leggiJson(GRAFO_FILE);
  if (!grafo?.nodi) return null;
  cacheGrafo = { mtime: info.mtime, grafo };
  return grafo;
}

/** Nodi che rispondono alla domanda, con l'indice di posizione (non una copia). */
export function semi(grafo, query, massimo = 5) {
  const termini = normalizza(query).split(/[^a-z0-9_]+/).filter((t) => t.length >= 3);
  if (!termini.length) return [];
  const punteggi = [];
  grafo.nodi.forEach((n, i) => {
    const nome = normalizza(`${n.n} ${n.f}`);
    const testo = normalizza(n.t || "");
    let p = 0;
    let nelNome = 0;
    for (const t of termini) {
      if (nome.includes(t)) {
        p += 2;
        nelNome++;
      } else if (testo.includes(t)) p += 1;
    }
    // Un solo termine trovato solo nel testo è troppo debole: è così che una parola comune
    // («lavoro», «file») trascinerebbe dentro mezzo grafo. Serve almeno un termine nel NOME,
    // oppure due nel testo.
    if (nelNome === 0 && p < 2) return;
    if (nelNome > 0 || p >= 2) punteggi.push([i, p]);
  });
  return punteggi
    .sort((a, b) => b[1] - a[1] || (grafo.nodi[b[0]].g || 0) - (grafo.nodi[a[0]].g || 0))
    .slice(0, massimo)
    .map(([i]) => i);
}

/** Mappa dei vicini, con il verso della relazione. */
export function vicinato(grafo) {
  const mappa = new Map();
  grafo.archi.forEach((a, i) => {
    if (!mappa.has(a.a)) mappa.set(a.a, []);
    if (!mappa.has(a.b)) mappa.set(a.b, []);
    mappa.get(a.a).push({ verso: a.b, r: a.r, uscente: true, indice_arco: i });
    mappa.get(a.b).push({ verso: a.a, r: a.r, uscente: false, indice_arco: i });
  });
  for (const [, l] of mappa) l.sort((x, y) => ORDINE_REL.indexOf(x.r) - ORDINE_REL.indexOf(y.r));
  return mappa;
}

/**
 * Query sul grafo con budget: si parte dai nodi più pertinenti, si espande di `passi` livelli
 * e ci si ferma quando i token finiscono. Restituisce STRUTTURA (nomi + relazioni), non
 * contenuto — è la differenza fra un indice e una fotocopia.
 */
export async function graphQuery(query, { passi = 2, budget = 600, massimo = 45 } = {}) {
  const grafo = await caricaGrafo();
  if (!grafo) {
    return { ok: false, nodi: [], testo: "Il grafo non esiste ancora: chiama memoria_grafo con azione \"ricostruisci\"." };
  }
  const partenze = semi(grafo, query, 5);
  if (!partenze.length) {
    return {
      ok: true,
      query,
      nodi: [],
      testo: `NESSUN NODO per «${query}» (il grafo ha ${grafo.nodi.length} nodi). La memoria non ha episodi, decisioni o artefatti con questi termini: prova memoria_cerca per una ricerca libera nel testo.`,
    };
  }

  const mappa = vicinato(grafo);
  const visitati = new Map(); // indice -> {nodo, livello, da, rel}
  let usati = 0;
  const frontiera = [];
  for (const i of partenze) {
    const nodo = grafo.nodi[i];
    const costo = stimaToken(nodo.n) + 8;
    if (usati + costo > budget) break;
    visitati.set(i, { nodo, livello: 0, da: null, rel: null });
    usati += costo;
    frontiera.push(i);
  }

  let livelloCorrente = frontiera;
  for (let passo = 1; passo <= passi; passo++) {
    const prossimi = [];
    for (const idx of livelloCorrente) {
      for (const c of mappa.get(idx) || []) {
        if (visitati.has(c.verso) || visitati.size >= massimo) continue;
        const nodo = grafo.nodi[c.verso];
        const costo = stimaToken(nodo.n) + 8;
        if (usati + costo > budget) continue;
        visitati.set(c.verso, { nodo, livello: passo, da: idx, rel: c.r, uscente: c.uscente });
        usati += costo;
        prossimi.push(c.verso);
      }
    }
    if (!prossimi.length) break;
    livelloCorrente = prossimi;
  }

  const figli = new Map();
  for (const [idx, v] of visitati) {
    if (v.da === null) continue;
    if (!figli.has(v.da)) figli.set(v.da, []);
    figli.get(v.da).push(idx);
  }

  const render = (esclusi) => {
    const nodiVisibili = [...visitati.entries()].filter(([i]) => !esclusi.has(i));
    const perStrato = {};
    for (const [, v] of nodiVisibili) {
      const etichetta = grafo.strati[v.nodo.s]?.label || v.nodo.s;
      perStrato[etichetta] = (perStrato[etichetta] || 0) + 1;
    }
    const righe = [
      `GRAFO — ${nodiVisibili.length} nodi per «${query}»`,
      "strati: " + (Object.entries(perStrato).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"),
    ];
    const stampa = (idx, prefisso, profondita) => {
      const v = visitati.get(idx);
      if (!v) return;
      const etichetta = grafo.strati[v.nodo.s]?.label?.toLowerCase() || v.nodo.s;
      const dove = v.nodo.s === "artefatto" ? "" : ` _(${etichetta})_`;
      righe.push(`${prefisso}${v.nodo.n}${dove}`);
      if (profondita <= 0) return;
      for (const i2 of figli.get(idx) || []) {
        if (esclusi.has(i2)) continue;
        const v2 = visitati.get(i2);
        // La relazione si legge nel verso giusto: «ha toccato» in avanti, «è stato toccato
        // da» all'indietro. Senza il verso, un albero di sole frecce dice poco.
        const rel = grafo.colori?.[v2.rel] || RELAZIONI[v2.rel] || {};
        const nomeRel = (v2.uscente ? rel.label : rel.inversa) || v2.rel;
        stampa(i2, `${prefisso}  ${v2.uscente ? "→" : "←"} [${nomeRel}] `, profondita - 1);
      }
    };
    for (const [idx, v] of visitati) {
      if (v.livello === 0 && !esclusi.has(idx)) stampa(idx, "- ", passi);
    }
    return righe.join("\n");
  };

  // Potatura: si tolgono prima i nodi più periferici finché il testo rientra nel budget.
  const esclusi = new Set();
  const perLivello = [...visitati.entries()].sort((a, b) => b[1].livello - a[1].livello);
  let testo = render(esclusi);
  for (const [idx, v] of perLivello) {
    if (stimaToken(testo) <= budget) break;
    if (v.livello === 0) continue;
    esclusi.add(idx);
    testo = render(esclusi);
  }

  return {
    ok: true,
    query,
    budget,
    token_stimati: stimaToken(testo),
    nodi: [...visitati.entries()]
      .filter(([i]) => !esclusi.has(i))
      .map(([, v]) => ({ id: v.nodo.id, s: v.nodo.s, n: v.nodo.n, f: v.nodo.f, a: v.nodo.a, livello: v.livello, rel: v.rel || null })),
    testo,
  };
}

/** La scheda di un nodo: il dettaglio di UNO, quando il grafo ha già indicato quale. */
export async function schedaNodo(rif, { maxCollegati = 12 } = {}) {
  const grafo = await caricaGrafo();
  if (!grafo) return { ok: false, testo: "Il grafo non esiste ancora." };
  const q = normalizza(String(rif || ""));
  const trovato =
    grafo.nodi.find((n) => n.id === rif) ||
    grafo.nodi.find((n) => normalizza(n.f) === q) ||
    grafo.nodi.find((n) => normalizza(n.n) === q) ||
    grafo.nodi.find((n) => normalizza(n.n).includes(q) && q.length >= 4);
  if (!trovato) {
    return { ok: false, testo: `Nodo non trovato per «${rif}». Usa memoria_grafo per vedere i nomi esatti dei nodi.` };
  }
  const idx = grafo.nodi.indexOf(trovato);
  const mappa = vicinato(grafo);
  const collegati = (mappa.get(idx) || []).slice(0, maxCollegati).map((c) => ({
    rel: c.r,
    verso: c.uscente ? "→" : "←",
    nodo: grafo.nodi[c.verso],
  }));
  const righe = [
    `NODO ${trovato.id}`,
    `${trovato.n}   _(${grafo.strati[trovato.s]?.label || trovato.s} · area ${grafo.aree[trovato.a]?.label || trovato.a}${trovato.d ? " · " + trovato.d : ""})_`,
    trovato.f ? `file: ${trovato.f}` : "",
    trovato.t ? `\n${trovato.t}` : "",
    "",
    `collegamenti (${trovato.g}):`,
    ...collegati.map((c) => `  ${c.verso} [${c.rel}] ${c.nodo.n}${c.nodo.s === "artefatto" ? `  (${c.nodo.f})` : ""}`),
  ].filter((r) => r !== "");
  const testo = righe.join("\n");
  return { ok: true, nodo: trovato, collegati, testo };
}

/** Dati per la vista: il grafo intero, più gli elenchi pronti da mostrare. */
export async function datiVista() {
  const grafo = await caricaGrafo();
  if (!grafo) return { esiste: false };
  const perArea = Object.entries(grafo.statistica?.per_area || {})
    .map(([id, v]) => ({ id, label: grafo.aree[id]?.label || id, ...v }))
    .sort((a, b) => (b.episodi || 0) - (a.episodi || 0) || b.nodi - a.nodi);
  return {
    esiste: true,
    generato: grafo.generato,
    nodi: grafo.nodi,
    archi: grafo.archi,
    aree: grafo.aree,
    strati: grafo.strati,
    colori: grafo.colori,
    statistica: grafo.statistica,
    per_area: perArea,
  };
}
