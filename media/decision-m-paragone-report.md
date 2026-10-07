# Decision_M: quanto risparmia in token davvero — confronto misurato

**Data:** 7 ottobre 2026 · **Macchina:** VPS senza GPU, 6 vCPU Intel Broadwell, 11,7 GiB di RAM, zero swap
**Modello (entrambi i bracci):** `spark-x2.5-4b-rizzo-flow-lora-q4_k_m.gguf` — stesso GGUF, stessa macchina
**Batteria:** `media/decision-m-batteria.json` — 12 casi, **36 decisioni tipizzate**
**Esiti grezzi:** `media/decision-m-paragone-esiti-decisore.json` · `media/decision-m-paragone-esiti-generativo.json`
**Strumenti:** `media/decision-m-batteria.mjs` (braccio decisore) · `media/decision-m-paragone-generativo.mjs` (braccio generativo, nuovo)
**Versione HTML (grafici inline, si apre offline):** `media/decision-m-paragone-report.html`

---

## Sintesi

Sugli stessi 36 task il decisore ha generato **0 token contro 1.022** del modello generativo — ma ha letto
**817 token in ingresso in più** (4.961 contro 4.144). Il risparmio totale è quindi solo del **4%** in token:
il vantaggio vero non è "meno token", è **zero token in uscita**, la voce che ogni listino fa pagare 3–5 volte.
Il prezzo è il tempo: **6,2 s per decisione** contro 8,3 s, e una qualità che su questa batteria è risultata
**leggermente peggiore** del generativo (5 errori contro 7, su 30 punti giudicabili — differenza non significativa).

**La raccomandazione:** usare il decisore dove il volume è alto, il rischio basso e il **formato** deve essere
garantito (instradamento, triage, punteggi, guardie). Non aspettarsi un risparmio di token in ingresso: quello
lo paga comunque, e pure un po' di più — perché il wire tipizzato costa qualche token di struttura in più
di un JSON chiesto in prosa.

---

## 1. La domanda

Far decidere 36 task allo stesso modello, una volta come **decisore tipizzato** (Decision_M / Rizzo Flow) e una
volta come **modello generativo** (llama-server con lo stesso GGUF): quanti token costa ciascuna strada, e
quanto tempo?

Il confronto è volutamente **mele contro mele**: stesso modello, stessa quantizzazione, stessa macchina, stessa
batteria. L'unica variabile è la forma della risposta — probabilità (`output_tokens = 0`) contro testo JSON.

---

## 2. Metodo (e cosa NON è stato confrontato)

| | braccio A — decisore | braccio B — generativo |
|---|---|---|
| runtime | `rizzo serve --device cpu --port 8017` (llama.cpp b11081, 6 thread) | `llama-server --port 8018 -c 2048 -t 6 --jinja` |
| richiesta | `POST /v1/systemone` — stato + domande tipizzate | `POST /v1/chat/completions` — stato + domande in prosa, `response_format: json_object`, `temperature 0`, `max_tokens 320` |
| risposta | probabilità per domanda | un oggetto JSON con le etichette |
| token misurati | `usage.input_tokens` / `usage.output_tokens` del servizio | `usage.prompt_tokens` / `usage.completion_tokens` di llama.cpp |
| RAM del servizio | 5,6 GB | ~2,0 GB |

Note di onestà:

- il prompt del braccio generativo **contiene le stesse opzioni** che riceve il decisore (elenco delle etichette,
  con le descrizioni per le scelte): non è il prompt "compatto" che favorirebbe il generativo sui token di input;
- i due bracci **non sono girati insieme**: Decision_M è stato spento prima di avviare il generativo (la RAM non
  tiene 5,6 + 2,0 GB). Nessuna contesa di CPU fra i due;
- **un giro solo**, 12 casi: è una misura di fattibilità con numeri veri, non un benchmark con intervalli di
  confidenza. La stessa batteria girata due volte sul decisore ha dato 236,0 s e 221,8 s (6,6 e 6,2 s per
  decisione): la variabilità di questa macchina è di quest'ordine, ~6%;
- **non** è stato confrontato un modello frontier via API: qui entrambi i modelli sono locali, quindi il
  confronto **non** misura un risparmio in denaro (che localmente è zero comunque), ma un risparmio in *token
  generati* e in *tempo*.

---

## 3. Il paragone dei token

| metrica (36 decisioni) | decisore | generativo | differenza |
|---|---:|---:|---:|
| token in ingresso | **4.961** | 4.144 | +817 (+19,7%) per il decisore |
| token generati | **0** | **1.022** | −1.022 (−100%) per il decisore |
| **token totali** | **4.961** | **5.166** | **−205 (−4,0%)** per il decisore |
| token in ingresso per decisione | 137,8 | 115,1 | +22,7 |
| token generati per decisione | **0** | **28,4** | −28,4 |
| token totali per decisione | 137,8 | 143,5 | −5,7 |
| secondi totali | **221,8** | 299,2 | −77,4 (−25,9%) |
| secondi per decisione | **6,2** | 8,3 | −2,1 (−25,0%) |
| di cui prefill | 108,3 s (49%) | ~150 s (stimato) | — |
| casi con risposta inutilizzabile | **0/12** | 0/12 | pari |

Il grafico: `media/decision-m-paragone-grafico.svg`.

**La lettura in una riga:** il decisore non risparmia token, risparmia *token generati*. Sul totale sono il 20%
(1.022 su 5.166); in ingresso paga 817 token in più, perché il wire tipizzato porta con sé struttura e opzioni
formattate che un JSON chiesto in prosa non ripete.

### Il risparmio sta tutto in uscita (e in uscita cambia il prezzo)

Sui listini dei modelli generativi i token **generati** costano tipicamente 3–5 volte quelli letti. Riportando i
numeri di questa batteria a 1.000 decisioni (proiezione lineare, non una misura):

| | decisore | generativo |
|---|---:|---:|
| token in ingresso | 137.800 | 115.100 |
| **token generati** | **0** | **28.400** |
| totale token | 137.800 | 143.500 |
| costo in "unità di input" (ipotesi: output = 4× input) | **137.800** | 228.700 (**+66%**) |
| tempo su questa CPU | **1,7 h** | 2,3 h |

L'ultima riga è dichiaratamente un'**ipotesi di prezzo**, non un dato misurato: serve solo a mostrare che con
l'output a 4× il confronto cambia segno. Se il modello è locale, quella colonna vale zero per entrambi: il
risparmio diventa **tempo** (26% in meno) e **certezza del formato** (nessun JSON da interpretare, nessuna prosa).

### Dettaglio per caso

| caso | dom | token in — decisore | token in — generativo | token gen. — decisore | token gen. — generativo | s decisore | s generativo |
|---|---:|---:|---:|---:|---:|---:|---:|
| `support-triage` | 4 | 480 | 418 | 0 | 96 | 21,9 | 28,7 |
| `confidence-gated-refund` | 3 | 406 | 334 | 0 | 62 | 18,7 | 20,6 |
| `intent-router` | 3 | 402 | 353 | 0 | 64 | 18,1 | 22,7 |
| `tool-dispatch` | 3 | 425 | 348 | 0 | 72 | 19,0 | 23,3 |
| `rag-filtering` | 3 | 413 | 306 | 0 | **234** | 22,5 | **42,2** |
| `reranking` | 3 | 450 | 340 | 0 | 44 | 21,0 | 19,5 |
| `citation-verification` | 3 | 411 | 361 | 0 | 54 | 17,6 | 21,2 |
| `guardrail-input` | 3 | 406 | 356 | 0 | 56 | 17,7 | 22,1 |
| `compliance-checklist` | 4 | 489 | 371 | 0 | 94 | 19,7 | 28,9 |
| `composite-scoring` | 3 | 369 | 317 | 0 | 72 | 15,5 | 22,3 |
| `agent-skill-selection` | 2 | 392 | 354 | 0 | **136** | 16,8 | 31,2 |
| `realtime-control` | 2 | 318 | 286 | 0 | 38 | 13,2 | 16,6 |
| **totale** | **36** | **4.961** | **4.144** | **0** | **1.022** | **221,8** | **299,2** |

Due casi spiegano metà dei token generati: `rag-filtering` (234 token per 3 decisioni) e
`agent-skill-selection` (136 per 2) — sono i due casi in cui il generativo "ragiona" prima di rispondere.
È esattamente il comportamento che il decisore non può avere: **non ha un posto dove mettere il ragionamento**,
e questo è insieme il suo risparmio e il suo limite.

### Il tempo

Il decisore è più veloce del **26%** per caso (6,2 s contro 8,3 s per decisione), ma resta lento in assoluto:
591 decisioni/ora (4B su CPU). Il generativo, oltre a essere più lento, non scala meglio: paga lo stesso prefill
**più** la generazione vera e propria. Su stati più lunghi la distanza si allarga per entrambi (un audit
precedente: 4.923 token di stato = 236,8 s per una sola chiamata al decisore).

---

## 4. Il prezzo in qualità: chi ha deciso meglio

Giudizio sui punti con risposta attesa desumibile dallo stato (**30 punti**, esclusi gli ambigui e i
non giudicabili; è un giudizio soggettivo, dichiarato):

| | decisore | generativo |
|---|---:|---:|
| errori netti | **5** | 7 |
| errori che il decisore fa e il generativo no | `contraddice_policy` su `rag-filtering` (no, 0,48 — la policy è a 14 giorni e il testo dice 30); coerenza su `citation-verification` (contraddice ✅ ma «non serve correggere») | — |
| errori che il generativo fa e il decisore no | — | `azione_attesa=no` su `composite-scoring` (il cliente ha un pannello graffiato: una sostituzione la chiede); `manca_strumento=no` su `agent-skill-selection` (nel roster non c'è nulla per una trascrizione); `base_giuridica=false` su `compliance-checklist` (il testo la indica: esecuzione del contratto) |
| errori comuni | `trasferimenti=no` su `compliance-checklist` (il testo dice esplicitamente che i dati non escono dall'UE: il decisore lo nega con 0,00, il generativo con false); `skill=bookforge` su `agent-skill-selection` (doveva essere «nessuna») | idem |

Il generativo vince su due punti in cui il decisore era risultato **internamente incoerente** (riconosce la
contraddizione ma non la correzione): è il difetto noto del decisore, documentato nell'audit del 4 ottobre — *la
coerenza fra domande correlate va imposta dal codice, non chiesta al modello*. Sui casi di **ragionamento
composito** (recensione con tono misto, roster di skill) il generativo ha invece sbagliato più spesso.

L'altra differenza non è nei numeri ma nella forma: il generativo, con `temperature 0` e
`response_format: json_object`, ha risposto **12/12 volte con JSON valido e tutte le chiavi** — più affidabile di
quanto un audit precedente suggerisse (là 2 richieste su 4 erano state troncate). Quindi, su questo modello e con
questo vincolo di formato, il generativo locale è un'alternativa **legittima**, non un ripiego: costa 1.022 token
e 77 secondi in più.

---

## 5. L'ordine di grandezza che conta davvero

Questa stessa sessione di lavoro — ricerca, scrittura dei due script, esecuzione dei due bracci, report — è
stata condotta dall'assistente in chat (`deepseek-flash`) e il registro dell'harness la conta così:

| | token in | token out | costo |
|---|---:|---:|---:|
| il lavoro di preparazione e scrittura (chat) | 53.867 | 16.661 | $ 0,0398 |
| le 36 decisioni del braccio generativo | 4.144 | 1.022 | — (locale) |
| le 36 decisioni del braccio decisore | 4.961 | **0** | 0 € |

Il punto non è che il decisore costa meno del lavoro umano/assistito: è che **sposta il costo delle decisioni
ripetitive fuori dal modello generativo**. In un flusso reale (un agente che instrada 10.000 richieste al giorno)
la voce che cresce è quella delle decisioni, non quella della preparazione: è lì che 0 token in uscita conta.

---

## 6. Raccomandazioni

1. **Usare il decisore come filtro/instradatore, non come oracolo**: il risparmio è reale e strutturale in uscita,
   ma la qualità non è superiore al generativo su questa batteria.
2. **Non aspettarsi risparmi in ingresso**: il wire tipizzato costa ~20% di token in più di un JSON in prosa.
   Il guadagno è (a) zero output, (b) formato impossibile da sbagliare, (c) dato che non esce dalla macchina.
3. **Soglie, non decisioni secche** — e la coerenza fra domande correlate va imposta nel codice (i due errori del
   decisore erano di coerenza, non di lettura).
4. **Stato corto**: metà del tempo del decisore è prefill. È la leva gratuita che migliora anche la qualità.
5. **Se il volume è basso e serve ragionamento, il generativo locale va benissimo**: con `json_object` e
   `max_tokens` ragionevoli ha risposto 12/12. Il decisore conviene quando le decisioni sono tante, brevi e
   ripetitive.
6. **Con un modello via API**, la convenienza del decisore cresce (i token generati sono la voce cara): il
   confronto va rifatto con i prezzi del fornitore, non con questa proiezione.

---

## 7. Riproducibilità e limiti

```bash
# braccio A — decisore (Decision_M acceso)
node media/decision-m-batteria.mjs --out media/decision-m-paragone-esiti-decisore.json

# braccio B — generativo (Decision_M SPENTO: la RAM non tiene entrambi)
/root/rizzo-flow/runtimes/llama-b11081-linux-x64-cpu/llama-server \
  -m /root/rizzo-flow/models/rizzo-flow/spark-x2.5-4b-rizzo-flow-lora-q4_k_m.gguf \
  --host 127.0.0.1 --port 8018 -t 6 -c 2048 --jinja
node media/decision-m-paragone-generativo.mjs --out media/decision-m-paragone-esiti-generativo.json
```

**Limiti dichiarati:** un solo giro per braccio (variabilità della macchina ~6% sul tempo, non stimata sui token);
giudizio di qualità manuale su 30 dei 36 punti; confronto fra due runtime diversi (l'unica variabile
volutamente cambiata è la forma della risposta); proiezioni lineari a 1.000 decisioni, non misurate; nessun
modello frontier né listino API coinvolti.
