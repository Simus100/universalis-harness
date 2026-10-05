/**
 * I tool della memoria per l'agente — e gli hook che la fanno nascere.
 *
 * TRE ACCESSI, TRE COSTI DIVERSI. È il cuore dell'efficienza, non un dettaglio di interfaccia:
 *
 *   memoria_cerca   → «dove se ne parla»   ~800-1200 token  (testo: frammenti)
 *   memoria_grafo   → «cosa c'è intorno»   ~200-400 token   (struttura: nomi e relazioni)
 *   memoria_wiki    → «dettaglio di uno»   ~300-600 token   (una pagina, non tre file)
 *
 * La sequenza economica è: cerca (o grafo) per individuare, poi UNA pagina. Il grafo si
 * consulta per primo quando la domanda è «cosa esiste su…», perché costa un quarto del testo
 * e spesso basta: se dice che l'episodio giusto esiste ed è collegato a tre file, spesso non
 * serve aprire nulla.
 *
 * PERCHÉ GLI HOOK STANNO QUI: la memoria muore se la si deve ricordare. L'episodio si aggiorna
 * da solo a fine turno di lavoro (agent_settled) e alla compattazione del contesto
 * (session_compact) — quest'ultima è la più preziosa, perché porta con sé il riassunto che il
 * modello ha GIÀ pagato per produrre. Tutto in background, con debounce: mai bloccare una
 * risposta, mai due ricostruzioni insieme.
 *
 * Il costo fisso di questi tool è la loro descrizione nel system prompt: per questo sono tre e
 * non cinque, e per questo la procedura lunga sta nella skill `memoria`, non qui.
 */
import { join } from "node:path";
import { ROOT, MEM_DIR, leggiJson, adesso, oggi } from "./memoria-core.mjs";
import { pacchetto, statoMemoria, indiceDaAggiornare } from "./memoria-index.mjs";
import { graphQuery, schedaNodo, datiVista, caricaGrafo } from "./memoria-graph.mjs";
import { leggiWiki } from "./memoria-wiki.mjs";
import { annotaEpisodio, elencaEpisodi } from "./memoria-episodio.mjs";
import { ricostruisci, aggiornaDopoSessione } from "./memoria-build.mjs";

const DEBOUNCE_MS = 4000;

const CERCA_DESCRIPTION = [
  "Cerca nella MEMORIA dell'harness (episodi passati, decisioni, documenti, obiettivi): frammenti pertinenti + giudizio di confidenza.",
  "Per «cosa è già stato fatto o deciso su X» e per trovare file o note di cui non ricordi il nome. NON per leggere un file che conosci (`read` costa meno).",
  "Confidenza bassa = la memoria non lo sa: dillo, non dedurlo.",
].join("\n");

const CERCA_PARAMETERS = {
  type: "object",
  properties: {
    query: { type: "string", description: "Cosa cerchi (termini tecnici compresi)." },
    budget: { type: "integer", description: "Tetto di token stimati (200-4000, default 1200)." },
    ambito: { type: "string", description: "Filtra la fonte: episodio, harness, skill, media, obiettivo." },
  },
  required: ["query"],
};

const GRAFO_DESCRIPTION = [
  "Naviga il GRAFO della memoria: struttura (nomi e relazioni), non testo — circa un quarto del costo di una ricerca. È il primo accesso da provare.",
  "Per orientarsi: catena episodio → decisione → file, quali episodi toccano un file, quali obiettivi hanno episodi.",
  "azioni: cerca (default), nodo, stato (gratis), ricostruisci.",
].join("\n");

const GRAFO_PARAMETERS = {
  type: "object",
  properties: {
    azione: { type: "string", enum: ["cerca", "nodo", "stato", "ricostruisci"], description: "Default: cerca." },
    query: { type: "string", description: "Per azione=cerca: i termini della domanda." },
    nodo: { type: "string", description: "Per azione=nodo: id, titolo o percorso del nodo." },
    passi: { type: "integer", description: "Livelli di espansione (1-3, default 2)." },
    budget: { type: "integer", description: "Tetto di token stimati (200-2000, default 600)." },
  },
};

const WIKI_DESCRIPTION = [
  "La pagina di UN nodo: cos'è e i collegamenti nei due versi (~300-600 token).",
  "Usala DOPO che il grafo ha detto quale nodo serve, non come primo passo.",
].join("\n");

const WIKI_PARAMETERS = {
  type: "object",
  properties: {
    nodo: { type: "string", description: "Id, titolo o percorso del nodo (es. «sync fine lavoro», «dashboard.mjs»)." },
  },
  required: ["nodo"],
};

const EPISODIO_DESCRIPTION = [
  "Registra nella memoria la DECISIONE e il PERCHE': l'unica cosa che i file non contengono (il resto dell'episodio è automatico).",
  "Quando: una scelta, un vincolo scoperto, una soluzione non ovvia — e prima di chiudere un lavoro lungo. NON per riassumere la conversazione e non a ogni turno.",
].join("\n");

const EPISODIO_PARAMETERS = {
  type: "object",
  properties: {
    decisione: { type: "string", description: "La decisione in una riga (max ~110 caratteri: diventa il titolo del nodo)." },
    perche: { type: "string", description: "Il motivo: vincolo, trade-off, ciò che è stato scartato." },
    esito: { type: "string", enum: ["confermato", "aperto", "vicolo-cieco", "da-verificare"], description: "«vicolo-cieco» risparmia il tentativo a chi verrà dopo." },
    obiettivo: { type: "string", description: "Id di un goal della dashboard (opzionale): crea il collegamento nel grafo." },
    note: { type: "string", description: "Cosa resta aperto (max ~10 righe)." },
    sessione: { type: "string", description: "Sessione da annotare; default: quella corrente." },
  },
  required: ["decisione"],
};

/** Legge il progetto attivo dalla dashboard (stesso file, una sola verità). */
async function progettoAttivo() {
  const p = await leggiJson(join(MEM_DIR, "..", "progetto.json"), {});
  return String(p?.attiva || "");
}

export function createMemoriaExtension({ log = () => {}, radice = ROOT } = {}) {
  // Stato interno: una sola ricostruzione in corso, e non più di una ogni DEBOUNCE_MS.
  const stato = { buildInCorso: Promise.resolve(), ultima: 0, ultimoEsito: null, errori: [] };

  function inBackground(motivo, fn) {
    const ora = Date.now();
    if (ora - stato.ultima < DEBOUNCE_MS) return;
    stato.ultima = ora;
    stato.buildInCorso = stato.buildInCorso
      .then(fn)
      .then((esito) => {
        stato.ultimoEsito = { motivo, quando: adesso(), esito };
        if (esito?.errori?.length) {
          stato.errori.push({ motivo, quando: adesso(), errori: esito.errori });
          log(`[memoria] ${motivo}: ${esito.errori.join(" | ")}`);
        }
      })
      .catch((e) => {
        stato.errori.push({ motivo, quando: adesso(), errori: [String(e?.message || e)] });
        log(`[memoria] ${motivo} non riuscito: ${e?.message || e}`);
      });
  }

  /** Aggiorna l'episodio della sessione corrente leggendo il suo file JSONL. */
  async function aggiornaEpisodioSessione(ctx, { forza = false } = {}) {
    const file = ctx?.sessionManager?.getSessionFile?.() || null;
    if (!file) return { aggiornato: false, motivo: "nessuna sessione su disco" };
    const progetto = await progettoAttivo();
    const esiti = await aggiornaDopoSessione({ sessioneFile: file, progetto });
    return esiti;
  }

  return {
    name: "memoria",
    toolNames: ["memoria_cerca", "memoria_grafo", "memoria_wiki", "memoria_episodio"],
    factory: (pi) => {
      pi.registerTool({
        name: "memoria_cerca",
        label: "Cerca nella memoria",
        description: CERCA_DESCRIPTION,
        promptSnippet: "memoria_cerca: frammenti pertinenti dalla memoria (episodi, decisioni, documenti) con giudizio di confidenza.",
        promptGuidelines: ["Gli episodi passati non sono nei file: prima di dire che qualcosa non esiste, cerca qui."],
        parameters: CERCA_PARAMETERS,
        async execute(_id, params) {
          const query = String(params?.query || "").trim();
          if (!query) return errore("manca la query da cercare");
          const budget = Math.min(4000, Math.max(200, Number(params?.budget) || 1200));
          const p = await pacchetto(query, { budget, ambito: params?.ambito ? String(params.ambito) : null });
          return {
            content: [{ type: "text", text: p.testo }],
            details: { token_stimati: p.token_stimati, confidenza: p.diagnosi?.confidenza, frammenti: p.frammenti?.length },
          };
        },
      });

      pi.registerTool({
        name: "memoria_grafo",
        label: "Grafo della memoria (struttura)",
        description: GRAFO_DESCRIPTION,
        promptSnippet: "memoria_grafo: naviga la memoria come grafo (struttura, non testo). L'accesso più economico: usalo per primo.",
        promptGuidelines: ["Usalo per primo: orientarsi sul grafo costa un quarto di una ricerca, e spesso basta."],
        parameters: GRAFO_PARAMETERS,
        async execute(_id, params) {
          const azione = String(params?.azione || "cerca").toLowerCase();
          try {
            if (azione === "stato") {
              const st = await statoMemoria();
              const vista = await datiVista();
              const righe = [
                `MEMORIA — ${st.indice ? `${st.indice.file} file, ${st.indice.frammenti} frammenti (${st.indice.kb} KB), indice del ${st.indice.generato.slice(0, 16).replace("T", " ")}` : "indice assente"}`,
                `episodi: ${st.episodi}${st.da_aggiornare ? " · ATTENZIONE: ci sono file modificati dopo l'ultima indicizzazione" : ""}`,
              ];
              if (vista.esiste) {
                const s = vista.statistica;
                righe.push(`grafo: ${vista.nodi.length} nodi, ${vista.archi.length} relazioni, ${Object.keys(vista.aree).length} aree (generato ${vista.generato.slice(0, 16).replace("T", " ")})`);
                righe.push(`strati: ${Object.entries(s.per_strato).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
                righe.push(`dove è cieca: ${s.episodi_senza_decisione} episodi senza decisione · ${s.isolati} nodi isolati · aree senza episodi: ${vista.per_area.filter((a) => !a.episodi).map((a) => a.label).join(", ") || "nessuna"}`);
              } else righe.push("grafo: assente (usa azione=\"ricostruisci\")");
              return { content: [{ type: "text", text: righe.join("\n") }], details: { stato: st } };
            }
            if (azione === "ricostruisci") {
              const esito = await ricostruisci({ silenzioso: true, passi: {} });
              const righe = [
                "MEMORIA RICOSTRUITA",
                esito.indice ? `indice: ${esito.indice.n_file} file, ${esito.indice.n_frammenti} frammenti` : "indice: non ricostruito",
                esito.grafo ? `grafo: ${esito.grafo.nodi} nodi, ${esito.grafo.archi} archi` : "grafo: non ricostruito",
                esito.wiki ? `wiki: ${esito.wiki.pagine} pagine, ${esito.wiki.link_rotti} link rotti` : "wiki: non rigenerata",
              ];
              if (esito.errori.length) righe.push("ERRORI: " + esito.errori.join(" | "));
              return { content: [{ type: "text", text: righe.join("\n") }], details: esito };
            }
            if (azione === "nodo") {
              const rif = String(params?.nodo || params?.query || "").trim();
              if (!rif) return errore("per azione=\"nodo\" serve `nodo`");
              const s = await schedaNodo(rif, {});
              return { content: [{ type: "text", text: s.testo }], details: { ok: s.ok } };
            }
            const query = String(params?.query || "").trim();
            if (!query) return errore("manca la query");
            const passi = Math.min(3, Math.max(1, Number(params?.passi) || 2));
            const budget = Math.min(2000, Math.max(200, Number(params?.budget) || 600));
            const r = await graphQuery(query, { passi, budget });
            return { content: [{ type: "text", text: r.testo }], details: { token_stimati: r.token_stimati, nodi: r.nodi.length } };
          } catch (e) {
            return errore(`grafo non consultabile: ${e?.message || e}`);
          }
        },
      });

      pi.registerTool({
        name: "memoria_wiki",
        label: "Pagina di un nodo della memoria",
        description: WIKI_DESCRIPTION,
        promptSnippet: "memoria_wiki: la pagina di UN nodo (episodio o artefatto) con i suoi collegamenti. Dopo aver individuato il nodo col grafo.",
        promptGuidelines: ["Una pagina sola, dopo che il grafo ha detto quale: aprire a caso costa più di quanto renda."],
        parameters: WIKI_PARAMETERS,
        async execute(_id, params) {
          const rif = String(params?.nodo || "").trim();
          if (!rif) return errore("manca il nodo");
          const p = await leggiWiki(rif);
          return { content: [{ type: "text", text: p.testo }], details: { ok: p.ok, id: p.id || null } };
        },
      });

      pi.registerTool({
        name: "memoria_episodio",
        label: "Registra decisione nell'episodio",
        description: EPISODIO_DESCRIPTION,
        promptSnippet: "memoria_episodio: registra nella memoria la decisione presa e il perché (una riga). Il resto dell'episodio è automatico.",
        promptGuidelines: ["Il perché è la parte che nessun file contiene: scrivila. Una strada inutile si registra con esito=\"vicolo-cieco\"."],
        parameters: EPISODIO_PARAMETERS,
        async execute(_id, params, _signal, _onUpdate, ctx) {
          const decisione = String(params?.decisione || "").trim();
          if (!decisione) return errore("manca la decisione");
          // L'episodio della sessione corrente deve esistere prima di annotarlo: se manca, lo
          // si crea dai dati della sessione (deterministici), così l'annotazione non si perde.
          let sessione = params?.sessione ? String(params.sessione) : null;
          if (!sessione && ctx?.sessionManager?.getSessionId) sessione = String(ctx.sessionManager.getSessionId());
          const episodi = await elencaEpisodi();
          const esiste = episodi.some((e) => String(e.dati.sessione) === sessione);
          if (!esiste && ctx) {
            await aggiornaEpisodioSessione(ctx).catch(() => null);
          }
          const esito = await annotaEpisodio({
            sessione,
            decisione,
            perche: params?.perche ? String(params.perche) : undefined,
            esito: params?.esito ? String(params.esito) : undefined,
            obiettivo: params?.obiettivo ? String(params.obiettivo) : undefined,
            note: params?.note ? String(params.note) : undefined,
          });
          if (!esito.aggiornato) return errore(esito.motivo || "episodio non trovato");
          // La memoria si aggiorna subito: la decisione appena scritta deve essere trovabile
          // nella stessa sessione, non domani.
          const ric = await ricostruisci({ silenzioso: true, passi: { grafo: true, wiki: true, indice: false } }).catch((e) => ({ errori: [String(e?.message || e)] }));
          return {
            content: [
              {
                type: "text",
                text: `DECISIONE REGISTRATA in ${esito.file}\n"${decisione}"${ric.errori?.length ? `\n(la memoria NON è stata ricostruita: ${ric.errori.join(" | ")})` : ""}`,
              },
            ],
            details: { ...esito, ricostruzione: ric },
          };
        },
      });

      // --- hook: la memoria nasce da sé ---------------------------------------------
      pi.on("agent_settled", async (_event, ctx) => {
        // Fine del lavoro di un turno: si aggiorna l'episodio (upsert) e si ricostruisce in
        // background. Debounce: durante un lavoro lungo non si ricostruisce a ogni turno.
        inBackground("fine turno", () => aggiornaEpisodioSessione(ctx));
      });

      pi.on("session_compact", async (event, ctx) => {
        // Il momento più prezioso: il riassunto della compattazione è già stato pagato e
        // andrebbe perso con la sessione. Entra nell'episodio, quindi nella memoria durevole.
        try {
          const file = ctx?.sessionManager?.getSessionFile?.() || null;
          if (!file) return;
          const progetto = await progettoAttivo();
          const esito = await aggiornaDopoSessione({ sessioneFile: file, progetto });
          log(`[memoria] episodio aggiornato dopo la compattazione (${event?.compactionEntry?.summary ? "con riassunto" : "senza riassunto"})`);
          return esito;
        } catch (e) {
          log(`[memoria] compattazione non registrata: ${e?.message || e}`);
        }
      });

      log("[memoria] tool memoria_cerca / memoria_grafo / memoria_wiki / memoria_episodio registrati");
    },
    /** Esposti per la dashboard: stato e diagnostica senza passare dal modello. */
    stato,
  };
}

function errore(testo) {
  return { content: [{ type: "text", text: `MEMORIA NON CONSULTATA — ${testo}` }], details: { error: testo }, isError: true };
}
