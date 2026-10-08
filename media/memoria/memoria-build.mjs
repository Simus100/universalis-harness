/**
 * Ricostruzione della memoria: indice → grafo → wiki → atlante.
 *
 * L'ORDINE NON È CASUALE: l'indice non dipende dal grafo, il grafo non dipende dalla wiki,
 * la wiki non dipende dall'atlante. Se un passo fallisce, i precedenti restano validi e
 * utilizzabili — degradazione controllata, mai «esplode tutto». Qui però l'errore si
 * RIPORTA: un guasto inghiottito in silenzio produrrebbe una memoria incompleta che sembra
 * completa, che è peggio del guasto.
 *
 * È anche il punto d'ingresso dei tre momenti in cui la memoria si aggiorna:
 *   1. a fine sessione (upsert dell'episodio, poi indice e grafo incrementali);
 *   2. alla compattazione del contesto (l'episodio porta il riassunto già pagato);
 *   3. a mano, o al primo avvio se l'indice non esiste.
 *
 * Uso:  node media/memoria/memoria-build.mjs [--forza] [--atlante] [--json]
 */
import { buildIndice, statoMemoria } from "./memoria-index.mjs";
import { buildGrafo } from "./memoria-graph.mjs";
import { buildWiki } from "./memoria-wiki.mjs";

/**
 * Ricostruisce la memoria. Ogni passo è isolato: un errore non impedisce gli altri e finisce
 * nel campo `errori` del risultato (che il chiamante deve mostrare, non ignorare).
 */
export async function ricostruisci({ forza = false, silenzioso = true, atlante = false, passi = {} } = {}) {
  const esito = { iniziato: new Date().toISOString(), indice: null, grafo: null, wiki: null, atlante: null, errori: [] };
  const fare = { indice: true, grafo: true, wiki: true, ...passi };

  if (fare.indice) {
    try {
      esito.indice = await buildIndice({ forza, silenzioso });
    } catch (e) {
      esito.errori.push(`indice: ${e?.message || e}`);
    }
  }
  if (fare.grafo) {
    try {
      esito.grafo = await buildGrafo({ silenzioso });
    } catch (e) {
      esito.errori.push(`grafo: ${e?.message || e}`);
    }
  }
  if (fare.wiki) {
    try {
      esito.wiki = await buildWiki({ silenzioso });
    } catch (e) {
      esito.errori.push(`wiki: ${e?.message || e}`);
    }
  }
  if (atlante) {
    try {
      const { scriviAtlante } = await import("./memoria-atlante.mjs");
      esito.atlante = await scriviAtlante({ silenzioso });
    } catch (e) {
      esito.errori.push(`atlante: ${e?.message || e}`);
    }
  }
  esito.finito = new Date().toISOString();
  esito.stato = await statoMemoria().catch(() => null);
  return esito;
}

/**
 * Il lavoro di archiviazione di una sessione: prima l'episodio (i dati), poi indice/grafo/wiki
 * incrementali — e, su richiesta, anche l'atlante.
 *
 * `atlante: true` serve ai due momenti in cui la vista deve restare al passo con i dati: la
 * CHIUSURA di una chat (il grafo cambia perché nasce un episodio — vedi `switchSession` in
 * dashboard.mjs) e il giro periodico della dashboard. Senza, atlante.html resta com'era: ha i
 * dati INCORPORATI, quindi non è una vista che si aggiorna da sé — è uno snapshot, e uno snapshot
 * che invecchia in silenzio è peggio di uno assente, perché dichiara una data che nessuno guarda.
 * Il costo è una manciata di millisecondi su ~120 KB (misurato: nessun impatto percepibile).
 *
 * Le sessioni SENZA richieste non producono episodio: una chat aperta e mai usata non entra
 * nella memoria (nessun rumore) e la funzione lo dichiara con `episodi: 0`.
 */
export async function aggiornaDopoSessione({ sessioneFile = null, progetto = "", silenzioso = true, atlante = false } = {}) {
  const { episodiDaSessioni } = await import("./memoria-episodio.mjs");
  const episodi = await episodiDaSessioni({ sessioneFile, progetto }).catch((e) => [{ errore: String(e?.message || e) }]);
  const esito = await ricostruisci({ silenzioso, passi: { indice: true, grafo: true, wiki: true }, atlante });
  return { episodi: episodi.length, ...esito };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const forza = argv.includes("--forza");
  const json = argv.includes("--json");
  const atlante = argv.includes("--atlante");
  const t0 = Date.now();
  const esito = await ricostruisci({ forza, silenzioso: true, atlante });
  if (json) {
    console.log(JSON.stringify(esito, null, 2));
  } else {
    const i = esito.indice;
    const g = esito.grafo;
    const w = esito.wiki;
    console.log(`memoria ricostruita in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (i) console.log(`  indice: ${i.n_file} file, ${i.n_frammenti} frammenti, ${i.riletti} riletti / ${i.riusati} riusati (${i.kb} KB)`);
    if (g) console.log(`  grafo:  ${g.nodi} nodi, ${g.archi} archi, ${g.aree} aree (${g.kb} KB)`);
    if (w) console.log(`  wiki:   ${w.pagine} pagine, ${w.link_rotti} link rotti`);
    if (esito.atlante) console.log(`  atlante: ${esito.atlante.file} (${esito.atlante.kb} KB)`);
    if (esito.errori.length) console.log("  ERRORI:", esito.errori.join(" | "));
  }
  process.exit(esito.errori.length ? 1 : 0);
}
