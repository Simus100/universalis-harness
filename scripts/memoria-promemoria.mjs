#!/usr/bin/env node
/**
 * Promemoria della memoria: l'ultimo episodio ha una decisione registrata?
 *
 * PERCHÉ ESISTE. Il pezzo più prezioso della memoria — la DECISIONE e il PERCHÉ — è l'unico
 * che non si scrive da sé: lo registra l'agente con `memoria_episodio` quando una scelta vale
 * la pena di essere ricordata. Il resto dell'episodio (date, richieste, file toccati, costo)
 * arriva da solo dagli hook di fine turno e di compattazione.
 *
 * Risultato misurato prima di questo promemoria: 29 episodi su 31 con la nota vuota, e un
 * grafo con 2 soli nodi Decisione. Non è un guasto tecnico: è la cosa che si dimentica nel
 * momento in cui si è presi dal lavoro, cioè sempre.
 *
 * PERCHÉ QUI E NON ALTROVE. È invocato da `scripts/sync-fine-lavoro.sh`, cioè nel punto in cui
 * la sessione di lavoro si chiude — l'ultimo momento utile per scrivere il perché prima che il
 * contesto sparisca. Avvisa e NON blocca: una decisione è soggettiva, e un gate che si può
 * aggirare per fatica è peggio di un promemoria che si può ignorare.
 *
 * Uso:   node scripts/memoria-promemoria.mjs [--json]
 * Esce con 0 se c'è una decisione (o non c'è nulla da annotare), 1 se manca: così lo script
 * chiamante può mostrare un riquadro senza dipendere dal testo.
 */
import { elencaEpisodi } from "../media/memoria/memoria-episodio.mjs";

const json = process.argv.includes("--json");
const episodi = await elencaEpisodi().catch(() => []);

// L'ultimo episodio TOCCATO (aggiornato), non l'ultimo per data: un episodio vecchio
// aggiornato adesso è comunque la sessione su cui si sta lavorando.
const ultimo = episodi
  .slice()
  .sort((a, b) => String(a.dati.aggiornato || a.dati.data || "").localeCompare(String(b.dati.aggiornato || b.dati.data || "")))
  .pop() || null;

const conDecisione = episodi.filter((e) => String(e.dati.decisione || "").trim()).length;
const esito = {
  ok: true,
  episodi: episodi.length,
  con_decisione: conDecisione,
  file: ultimo?.file ?? null,
  ha_decisione: !!(ultimo && String(ultimo.dati.decisione || "").trim()),
};

if (json) {
  console.log(JSON.stringify(esito));
  process.exit(esito.ha_decisione ? 0 : 1);
}

if (!ultimo) {
  console.log("  memoria: nessun episodio registrato per questa sessione (niente da annotare)");
  process.exit(0);
}

if (esito.ha_decisione) {
  console.log(`  ✓ memoria: l'episodio di questa sessione ha la decisione registrata (${conDecisione}/${episodi.length} episodi)`);
  process.exit(0);
}

console.log("  ⚠ memoria: l'episodio di questa sessione NON ha una decisione registrata");
console.log(`    ${ultimo.file}`);
console.log(`    (${conDecisione} episodi su ${episodi.length} hanno una decisione: è la parte che i file non contengono)`);
console.log("    Se questa sessione ha prodotto una scelta che vale la pena ricordare — un vincolo");
console.log("    scoperto, una strada scartata — chiama il tool memoria_episodio con { decisione, perche, esito }.");
console.log("    Non è un obbligo: se non c'è nulla da annotare, ignora questo promemoria.");
process.exit(1);
