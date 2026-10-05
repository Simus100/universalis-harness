# Memoria a lungo termine

Come l'harness ricorda il lavoro fatto — e perché non deve rileggere tutto per farlo.

## Cos'è

La memoria è il **contesto storico** dell'harness: episodi (cosa è successo in ogni sessione),
decisioni (il perché), artefatti (i file toccati), obiettivi (i goal della dashboard). Vive in
`media/memoria/` e **non si pubblica mai** (vedi *Privacy*, sotto).

Si consulta in tre modi, con costi diversi — è la scelta che rende utile il sistema:

| Modo | Risponde a | Costo | Forma |
|---|---|---|---|
| **grafo** | «cosa c'è intorno a X?» | ~200-400 token | struttura: nomi e relazioni, nessun testo |
| **wiki** | «dammi il dettaglio di questo nodo» | ~300-600 token | una pagina, con i collegamenti nei due versi |
| **ricerca** | «dove se ne parla?» | ~800-1200 token | frammenti di testo + giudizio di confidenza |

La regola d'uso: **grafo → wiki → ricerca**, dal più economico al più ricco. Il grafo spesso basta:
se dice che l'episodio giusto esiste ed è collegato a tre file, non serve aprire nulla.

## Come si usa dall'agente

Quattro tool, registrati dall'estensione `media/memoria/memoria-tool.mjs`:

- `memoria_grafo` — `azione: cerca | nodo | stato | ricostruisci`. Il primo da provare.
- `memoria_wiki` — la pagina di un nodo (episodio o artefatto).
- `memoria_cerca` — frammenti pertinenti con `alta|media|bassa|nessuna` di confidenza.
- `memoria_episodio` — registra la decisione e il perché (l'unica cosa che i file non contengono).

La procedura completa, con i casi in cui **non** usarli, sta nella skill `skills/memoria/SKILL.md`.

Lo strato Decisione del grafo è vuoto finché non si registra qualcosa: non è un difetto, è la
misura di quanto lavoro si sta facendo **senza scrivere il perché**.

## Come nasce la memoria (da sé)

La memoria non si costruisce a mano e non dipende dal fatto che qualcuno si ricordi:

1. **Fine turno di lavoro** (`agent_settled`): l'episodio della sessione viene riscritto con i
   dati veri — richieste, file scritti, comandi, errori, durata, costo — e indice/grafo/wiki si
   aggiornano in background (mai durante una risposta, mai due ricostruzioni insieme).
2. **Compattazione del contesto** (`session_compact`): il riassunto che pi ha appena prodotto —
   quindi **già pagato** — entra nell'episodio invece di sparire con la sessione.
3. **Decisione registrata** (tool `memoria_episodio`): una riga di decisione e una di motivo.
4. **A mano**: `node media/memoria/memoria-build.mjs [--forza] [--atlante]`, o il pulsante
   «ricostruisci» nella scheda **Memoria**.

Le 29 sessioni già presenti sul disco sono state importate in episodi **senza spendere un token**:
sono dati, non interpretazioni.

## Cosa c'è dentro, esattamente

```
media/memoria/
  indice.json      frammenti + BM25 (k1=1.5, b=0.75), chiave di validità per file: mtime+size
  grafo.json       nodi {id,s,n,f,a,g,d,t} + archi {a,b,r} + aree + strati + colori
  wiki/            una pagina per nodo + index.md (l'indice che dichiara i buchi)
  episodi/         un file per sessione, riscritto (upsert), non accodato
  atlante.html     la vista 3D autonoma (dati e codice incorporati, funziona da file://)
  dialogo.jsonl    (facoltativo) domande e risposte della memoria, per la diagnostica
```

**Frammenti, non file**: si indicizza per titolo markdown, da 60 a 1800 caratteri. Un file intero
è un pagliaio — BM25 normalizza sulla lunghezza e i termini rari si diluiscono. Ogni frammento
porta con sé il titolo più vicino, che è il suo contesto.

**Archivio escluso**: `sessions/` (26 MB di JSONL: rumore e dati personali), `backups/`,
`backup_export/`, `node_modules/`, `media/memoria/wiki` (derivata: indicizzarla sarebbe
duplicazione). E nessun file che corrisponda a `.env`, `secret`, `password`, `token`, `*.key`:
escluso per costruzione, e c'è un test che lo verifica.

## Il grafo e l'atlante

Il grafo ha **solo archi da fatti verificabili**: un file scritto in quella sessione, una decisione
registrata, un percorso citato in un documento. Nessun arco per somiglianza: una memoria che inventa
collegamenti è credibile e falsa.

| Relazione | Da dove nasce |
|---|---|
| `ha-deciso` | episodio → decisione (dal campo `decisione` dell'episodio) |
| `ha-toccato` | episodio → artefatto (i file **scritti**, non quelli letti) |
| `riguarda` | decisione → artefatto |
| `serve` | decisione → obiettivo (dal campo `obiettivo`) |
| `segue` | episodio → episodio, stessa area, in ordine di data |
| `cita` | documento → artefatto (percorso fra backtick) |

L'**atlante** (scheda **Memoria**, accanto a Chat e File; oppure `/memoria` come pagina autonoma)
disegna il grafo in 3D con
canvas 2D e proiezione prospettica scritta a mano — nessuna libreria, nessuna CDN, e **deterministico**:
lo stesso grafo produce sempre lo stesso disegno. Gli assi sono la lettura:

- **altezza** = livello della memoria: episodio → decisione → obiettivo → artefatto;
- **angolo** = progetto (le aree, cioè le cartelle di progetto se ne hai dichiarate);
- **raggio** = centralità: gli hub al centro, le foglie in periferia;
- `L` = lente: mostra solo il vicinato del nodo scelto (2 passi).

Serve a **vedere i buchi**: strato Decisione vuoto = si lavora senza registrare il perché;
spicchio vuoto = un progetto che non produce memoria; nodi isolati = artefatti senza contesto.

## Privacy (la regola non negoziabile)

Il repository è **pubblico** e ogni pubblicazione è permanente. La memoria **non si pubblica mai**:

- `media/memoria/indice.json`, `grafo.json`, `atlante.html`, `wiki/`, `episodi/`, `stato.json`,
  `dialogo.jsonl`, `sorgenti.json` sono in `.gitignore`;
- il gate di `scripts/sync-fine-lavoro.sh` li blocca **anche con `--forza`**;
- il **codice** della memoria (`media/memoria/*.mjs`) si pubblica normalmente: è prodotto.

Il motivo è concreto, non formale: l'indice concentra gli estratti di ogni documento e di ogni
episodio in un file solo, e l'atlante è una mappa del lavoro leggibile a colpo d'occhio. Pubblicarli
sarebbe come pubblicare l'intero archivio in un file.

## Comandi

```bash
node media/memoria/memoria-build.mjs            # indice + grafo + wiki (incrementale)
node media/memoria/memoria-build.mjs --forza --atlante --json
node media/test-memoria.mjs                     # tutti i test (unità + sistema + rotte)
node media/test-memoria.mjs --solo-sistema      # salta le unità
```

## Limiti dichiarati

- **Confidenza ≠ correttezza.** `alta` significa che i termini della domanda sono coperti dal
  corpus, non che quello che c'è scritto sia vero o aggiornato: la fonte e la sua data vanno guardate.
- **Il lessicale non è semantico.** BM25 trova i termini esatti; «come valuto un dato sporco» non
  trova «controlli di qualità». Il livello semantico (embedding) è un'aggiunta possibile, con
  fusione RRF: si farà **dopo** aver misurato quanto il lessicale basta, non prima.
- **La memoria non è onnisciente**: se una decisione non è stata registrata, non c'è. Il sistema lo
  dice (strato vuoto, nodi isolati) invece di riempire il vuoto.
- **Costo fisso dei tool**: ~900 token di descrizioni nel system prompt, per quattro tool.
  È il prezzo perché il modello sappia *quando* usarli e *quando no*.
