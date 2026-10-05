# Memoria a lungo termine

Come l'harness ricorda il lavoro fatto — e perché non deve rileggere tutto per farlo.

## Cos'è

La memoria è il **contesto storico** dell'harness: episodi (cosa è successo in ogni sessione),
decisioni (il perché), artefatti (i file toccati), obiettivi (i goal della dashboard). Vive in
`media/memoria/` e **non si pubblica mai** (vedi *Privacy*, sotto).

**È per istanza.** Le istanze dell'harness sono copie separate del codice (`docs/ISTANZE.md`) e
ognuna indicizza i **propri** file: `ROOT` si ricava dal percorso del modulo
(`memoria-core.mjs`), non da una costante, quindi nessun dato attraversa le istanze. Il rovescio
della medaglia: un aggiornamento della memoria **non si propaga da solo**, va portato istanza per
istanza — l'ultima propagazione (5 ottobre 2026, tester_01 e tester_07) è documentata in
`docs/ISTANZE.md` con metodo, file copiati e verifiche.

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
- `memoria_cerca` — frammenti pertinenti con `alta|media|bassa|nessuna` di confidenza e la fonte
  (`memoria` o `documentazione`).
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
   Indice, grafo e wiki si aggiornano subito — la decisione è cercabile nella stessa sessione, e
   senza questo l'annotazione non si trovava fino al turno successivo (verificato dal vivo).
   È l'unico passo non automatico, ed è quello che si dimentica: per questo
   `scripts/sync-fine-lavoro.sh` lo ricorda a fine pubblicazione (avviso, non blocco).
4. **Ogni 20 minuti**, e una volta due minuti dopo l'avvio: la dashboard controlla se c'è
   qualcosa di nuovo (`mtime` + dimensione) e, solo allora, ricostruisce in modo incrementale.
   Copre i casi in cui nessun hook è scattato — server appena riavviato, sessione chiusa in
   fretta, lavoro fatto da un'altra istanza — che altrimenti lasciano la memoria indietro **in
   silenzio**, il modo peggiore di guastarsi perché sembra aggiornata.
5. **A mano**: `node media/memoria/memoria-build.mjs [--forza] [--atlante]`, o il pulsante
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
  atlante.html     la vista autonoma del grafo (dati e codice incorporati, funziona da file://)
  dialogo.jsonl    (facoltativo) domande e risposte della memoria, per la diagnostica
```

**Frammenti, non file**: si indicizza per titolo markdown, da 60 a 1800 caratteri. Un file intero
è un pagliaio — BM25 normalizza sulla lunghezza e i termini rari si diluiscono. Ogni frammento
porta con sé il titolo più vicino, che è il suo contesto.

**Quattro tipi di frammento**, perché cercare ha bisogno diversi:

| Tipo | Cosa contiene | Ambito |
|---|---|---|
| documento | il testo, per titolo markdown | `harness`, `skill`, `media` |
| scheda dell'episodio | data, esito, **decisione, perché**, obiettivo, note | `episodio` |
| scheda di codice | percorso, righe, scopo dichiarato nell'intestazione, nomi definiti | `codice` |
| obiettivo | i goal della dashboard | `obiettivo` |

Due di queste sono nate da difetti osservati, non da un piano:

- **La scheda dell'episodio.** Decisione e perché vivono nel front-matter, che l'indicizzazione
  scarta di proposito (è metadato, non deve inquinare il ranking). Il risultato era paradossale:
  alla domanda «perché la memoria non si pubblica su git» la memoria citava il manuale, mentre la
  decisione registrata — che dice esattamente quella cosa — non veniva trovata. Ora ogni episodio
  ha una scheda in testa, con quello che serve a ritrovarlo.
- **La scheda di codice.** I file di codice non si cercano per prosa, ma il loro commento di testa
  dice PERCHÉ esistono (spesso con il difetto che hanno risolto). Prima non era cercabile da nessuna
  parte: «dove sta la logica del browser» trovava il manuale, non `media/browser-tool.mjs`. Costa
  ~30 KB di indice, meno dell'1%. Il **contenuto** del codice non entra: quello si legge col tool
  `read`.

**Memoria o documentazione?** Ogni frammento ha un ambito, e gli ambiti si dividono in due famiglie:
`episodio`, `obiettivo`, `media`, `codice` sono **memoria** (cose successe); `skill` e `harness` sono
**documentazione** (testi scritti per spiegare). La ricerca dichiara quale delle due ha risposto, e
se ha trovato solo documentazione la confidenza scende a `bassa` con il motivo in chiaro. Serve a un
errore osservato: alla domanda «ricetta della carbonara» la memoria rispondeva con tre frammenti
fuori tema presi dalle skill, con «confidenza media» — i termini c'erano, il fatto no.

**La versione dell'indice invalida il riuso**: se cambia il modo di frammentare, i frammenti vecchi
non valgono più. Senza questo confronto il riuso per `mtime` li avrebbe tenuti per sempre — è
successo, con le schede degli episodi che non comparivano perché il file non era cambiato.

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
disegna il grafo in **due letture**, con lo stesso codice e gli stessi dati: canvas 2D, nessuna
libreria, nessuna CDN, e **deterministico** — lo stesso grafo produce sempre lo stesso disegno, in
entrambe.

**Mappa** (predefinita): ortogonale, pensata per leggere e per cercare.

- **righe** = livello della memoria: episodio → decisione → obiettivo → artefatto;
- **colonne** = progetto (le aree, cioè le cartelle dichiarate), con i nomi in testa;
- nessuna rotazione: la posizione di un nodo non cambia fra un'apertura e l'altra (una mappa che
  si ridisegna diversa non si impara);
- pan e zoom come in una mappa geografica (trascina, rotella, pizzico; pulsanti `−`, `＋`,
  «adatta»), e doppio tocco/clic per rivedere tutto;
- i **nomi si leggono**: le etichette che finirebbero una sopra l'altra si arrendono alla più
  rilevante (nodo scelto, suoi vicini, risultati della ricerca, poi il grado);
- con un nodo scelto il resto si attenua e si legge il suo **vicinato**, con la relazione scritta
  accanto al nome («ha toccato», «è citato da»…);
- la ricerca accende un **alone** sui nodi trovati, i filtri di strato/area/relazione si accendono
  e spengono dal pannello (una relazione per volta è il modo per capire una rete).

**Orbita**: la lettura 3D d'insieme — altezza = livello, angolo = progetto, raggio = centralità. Una
vista per guardare la forma della memoria, non per cercarci qualcosa dentro (in prospettiva due nodi
lontani si sovrappongono: è il limite di ogni grafo 3D).

Tasti, in entrambe: `M` mappa/orbita, `L` lente (solo il vicinato del nodo scelto, 2 passi),
`0` adatta, `R` rotazione automatica dell'orbita.

Serve a **vedere i buchi**: fascia Decisione vuota = si lavora senza registrare il perché; colonna
vuota = un progetto che non produce memoria; nodi isolati = artefatti senza contesto.

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
