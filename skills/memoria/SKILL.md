---
name: memoria
description: "Usa la memoria a lungo termine dell'harness: episodi passati, decisioni, artefatti e obiettivi, con grafo (struttura), ricerca (frammenti) e wiki (una pagina per nodo). Serve quando devi sapere «cosa è già stato fatto o deciso su X», ricostruire la storia di un file o di una feature, orientarti prima di lavorare su qualcosa di già toccato, o registrare una decisione perché resti. Non serve per leggere un file che conosci già (lì basta `read`) né per riassumere la conversazione corrente."
---

# Memoria a lungo termine

La memoria vive in `media/memoria/`: **episodi** (cosa è successo in ogni sessione), **decisioni**
(il perché), **artefatti** (i file toccati) e **obiettivi** (i goal della dashboard). È esclusa dal
versionamento: non si pubblica.

## I tre accessi, in ordine di costo

| Tool | Risponde a | Costo | Cosa torna |
|---|---|---|---|
| `memoria_grafo` | «cosa c'è intorno a X?» | ~200-400 token | nomi di nodi e relazioni, **nessun testo** |
| `memoria_wiki` | «dammi il dettaglio di questo nodo» | ~300-600 token | una pagina, con i collegamenti nei due versi |
| `memoria_cerca` | «dove se ne parla?» | ~800-1200 token | frammenti di testo + confidenza |

**L'ordine non è un consiglio, è l'economia del sistema.** Il grafo costa un quarto di una ricerca e
spesso basta: se dice che l'episodio giusto esiste ed è collegato a tre file, non serve aprire nulla.
Apri una pagina **dopo** che il grafo ha detto quale nodo serve. Usa la ricerca testuale quando la
domanda è semantica («come era stato risolto…») o quando non conosci i nomi.

```
memoria_grafo  "sync fine lavoro"          → 20 nodi, 300 token: vedi la catena episodio → file
memoria_wiki   "dashboard.mjs"             → in quali episodi è stato toccato e da chi è citato
memoria_cerca  "come si costruisce l'indice" → frammenti di docs e codice, con confidenza
```

## La confidenza: leggila prima di rispondere

`memoria_cerca` restituisce un giudizio (`alta` / `media` / `bassa` / `nessuna`).

- **bassa o nessuna**: la memoria non ha quella conoscenza. Dillo a chi ha chiesto, non dedurre una
  risposta plausibile. La misura è la **copertura lessicale dei termini**, non la correttezza: una
  confidenza alta significa che se ne parla, non che quello che c'è scritto sia vero o aggiornato.
- La fonte va sempre guardata: se il frammento è un documento vecchio, la data conta.

## Registrare una decisione

`memoria_episodio` è l'unica cosa che i file non contengono: **la decisione e il perché**. Il resto
dell'episodio (date, richieste, file toccati, comandi, costo, esito tecnico) è già registrato
automaticamente a fine turno e alla compattazione del contesto.

Quando chiamarlo:

- quando una scelta di progetto viene presa e vale la pena ricordarla;
- quando si scopre un vincolo (una cosa che non si può fare, e perché);
- quando una strada si rivela inutile → `esito: "vicolo-cieco"`: risparmia il tentativo a chi verrà
  dopo, ed è il valore più alto che una memoria può dare;
- prima di chiudere un lavoro lungo, così il lavoro non si perde con la sessione.

Quando **non** chiamarlo: a ogni turno, per riassumere la conversazione (lo fa la compattazione),
o per registrare cose già deducibili dai file (`git log` non ha bisogno di aiuto).

```json
{
  "decisione": "la memoria non si pubblica: indice, grafo e atlante restano fuori dal repo",
  "perche": "il repository è pubblico e l'indice concentra gli estratti di tutto il lavoro in un file solo",
  "esito": "confermato",
  "obiettivo": "06b453ea3fa32634"
}
```

## Guardare il grafo (per te, non per il modello)

La scheda **Memoria** della dashboard (accanto a Chat e File) disegna il grafo in 3D: altezza = livello (episodio →
decisione → obiettivo → artefatto), angolo = progetto, raggio = centralità. Serve a **vedere i buchi**:

- **strato Decisione vuoto** → si lavora ma non si registra il perché (chiama `memoria_episodio`);
- **spicchio di un progetto vuoto** → quel progetto non produce memoria (gli episodi nascono dalle
  sessioni: se ci si lavora, manca lo `switchSession` o il path non è nella root);
- **nodi isolati** → artefatti citati senza contesto: o manca l'episodio, o il file è comparso in
  una sessione senza essere stato scritto;
- `memoria_grafo` con `azione: "stato"` dà gli stessi numeri in forma testuale, ed è gratuito.

## Cosa non fare

- Non indicizzare `sessions/`, `backups/`, `.env`: la memoria non contiene segreti, e i percorsi
  riservati sono esclusi per costruzione (`media/memoria/memoria-index.mjs`).
- Non ricopiare il contenuto della memoria in chat: si cita, non si incolla. Il pacchetto si paga
  quando lo si chiede e quando lo si scrive nella risposta.
- Non chiedere il pacchetto «per sicurezza» a ogni turno: il guadagno si trasforma in un pedaggio.
- Non piegare un fatto per far quadrare la risposta: se la memoria non ha la decisione, la risposta
  è «non risulta registrata».
