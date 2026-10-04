# Audit: decisore tipizzato locale (Rizzo Flow) — efficienza e risparmio token

**Data:** 4 ottobre 2026 · **Macchina:** VPS senza GPU, 6 vCPU Intel Broadwell (AVX2, no AVX-512), 11,7 GiB di RAM, zero swap
**Modello:** Spark-X2.5-4B + LoRA *flow* in GGUF Q4_K_M (2,5 GB), llama.cpp b11081, backend CPU, 6 thread
**Batteria:** `media/rizzo-batteria.json` — 12 casi, 36 decisioni tipizzate · **esiti grezzi:** `media/rizzo-batteria-esiti.json`
**Strumenti:** `media/rizzo-batteria.mjs` (esecuzione), `media/rizzo-caso.mjs` (caso singolo), `media/test-rizzo.mjs` (ciclo del servizio)

---

## 1. I 12 casi, e da dove vengono

Il modello di programmazione testato è quello documentato pubblicamente per i modelli *System One*
(Jev di TypeSafe): uno stato, domande tipizzate, risposte probabilistiche, decisione nel codice.
Le categorie e i pattern vengono dal catalogo pubblico dei casi d'uso
(<https://systemonemodels.org/use-cases/> e le ricette collegate).

| # | Caso | Categoria | Pattern di riferimento |
|---|---|---|---|
| 1 | `support-triage` | workflow control | [Support inbox triage](https://systemonemodels.org/use-cases/workflow-control/support-inbox-triage/) — una chiamata, tutte le domande |
| 2 | `confidence-gated-refund` | workflow control | [Confidence-gated actions](https://systemonemodels.org/use-cases/workflow-control/confidence-gated-actions/) — azione irreversibile, soglia alta |
| 3 | `intent-router` | workflow control | [Intent and model routing](https://systemonemodels.org/use-cases/workflow-control/intent-and-model-routing/) — etichetta + difficoltà |
| 4 | `tool-dispatch` | workflow control | [Typed tool dispatch](https://systemonemodels.org/use-cases/workflow-control/typed-tool-dispatch/) — strumento e argomenti a insieme chiuso |
| 5 | `rag-filtering` | safety and quality | [RAG passage filtering](https://systemonemodels.org/use-cases/safety-and-quality/rag-passage-filtering/) — il testo recuperato è dato, mai istruzioni |
| 6 | `reranking` | retrieval | [Semantic reranking](https://systemonemodels.org/use-cases/retrieval-and-knowledge/semantic-reranking/) — la probabilità di un sì/no è il punteggio |
| 7 | `citation-verification` | retrieval | [Citation verification](https://systemonemodels.org/use-cases/retrieval-and-knowledge/citation-verification/) — la fonte sostiene il claim? |
| 8 | `guardrail-input` | safety and quality | [LLM guardrails](https://systemonemodels.org/use-cases/safety-and-quality/llm-guardrails/) — injection, danno, azione |
| 9 | `compliance-checklist` | safety and quality | [Compliance verification](https://systemonemodels.org/use-cases/safety-and-quality/compliance-verification/) — checklist fissa su documento variabile |
| 10 | `composite-scoring` | data and operations | [Composite scoring](https://systemonemodels.org/use-cases/data-and-operations/composite-scoring/) — dimensioni separate, pesi nel codice |
| 11 | `agent-skill-selection` | agenti | [Agent routing and skill selection](https://systemonemodels.org/use-cases/real-time-and-agents/agent-routing-and-skill-selection/) — roster, con via d'uscita «nessuna» |
| 12 | `realtime-control` | agenti | [Real-time control](https://systemonemodels.org/use-cases/real-time-and-agents/real-time-control/) — decisione dentro un ciclo |

Tutti gli stati sono brevi (318–489 caratteri): è il vincolo pratico di questo hardware, non una
scelta estetica.

---

## 2. Efficienza misurata

| caso | categoria | dom | token in | token **out** | s | esito |
|---|---|---:|---:|---:|---:|---|
| `support-triage` | workflow control | 4 | 480 | 0 | 22,3 | `coda=billing(92%)` `gravita=1,86/3` `rimborso=SI(0,99)` `frustrazione=1,32/3` |
| `confidence-gated-refund` | workflow control | 3 | 406 | 0 | 16,4 | `agire_senza_umano=no(0,17)` `rischio=1,64/2` `eccezione=no(0,15)` |
| `intent-router` | workflow control | 3 | 402 | 0 | 16,3 | `intento=analisi(76%)` `difficolta=1,34/3` `dati_esterni=SI(0,67)` |
| `tool-dispatch` | workflow control | 3 | 425 | 0 | 16,5 | `strumento=read_file(93%)` `percorso_esplicito=no(0,27)` `serve_conferma=SI(0,90)` |
| `rag-filtering` | safety | 3 | 413 | 0 | 19,2 | `utile=SI(0,88)` `istruzioni_ostili=SI(0,82)` `contraddice_policy=no(0,48)` ✘ |
| `reranking` | retrieval | 3 | 450 | 0 | 18,1 | `A=SI(0,97)` `B=no(0,01)` `C=SI(0,96)` |
| `citation-verification` | retrieval | 3 | 411 | 0 | 16,9 | `rapporto=contraddice(99%)` `serve_correzione=no(0,01)` ✘ incoerente |
| `guardrail-input` | safety | 3 | 406 | 0 | 21,1 | `injection=SI(0,56)` `danno=1,74/3` `azione=bloccare(64%)` |
| `compliance-checklist` | safety | 4 | 489 | 0 | 22,5 | `finalità=SI(0,98)` `base_giuridica=SI(0,63)` `trasferimenti=no(0,00)` ✘ `esito=conforme(83%)` |
| `composite-scoring` | data/ops | 3 | 369 | 0 | 17,1 | `gravità=1,41/3` `tono=2,01/3` `azione_attesa=SI(0,86)` |
| `agent-skill-selection` | agenti | 2 | 392 | 0 | 18,9 | `skill=bookforge(42%)` ✘ `manca_strumento=SI(0,53)` |
| `realtime-control` | agenti | 2 | 318 | 0 | 14,8 | `azione=continua(65%)` `pericolo=no(0,35)` (non giudicabile senza le costanti del gioco) |

**Aggregati**

| metrica | valore |
|---|---|
| casi / decisioni | 12 / **36** |
| token in ingresso (totali) | **4.961** (137,8 per decisione) |
| token generati (totali) | **0** |
| secondi totali | **220,1** |
| secondi per decisione | **6,1** (mediana per caso 18,1; min 14,8 · max 22,5) |
| decisioni al secondo | **0,164** → 591/ora |
| di cui prefill | 112,5 s (**51%**) |
| RAM del servizio | ~5,6 GB residenti |
| errori / timeout | **0** |

Il costo non è il numero di domande: passare da 2 a 4 domande sullo stesso stato ha aggiunto
pochi token (318 → 489) e ~7 s. **Il costo è la lunghezza dello stato** (misure precedenti: 4.923
token = 236,8 s).

---

## 3. Risparmio token: confronto mele contro mele

Stesso GGUF, stessa macchina, stesso modello — ma in **modalità generativa** (`llama-server`,
chat template, richiesta di un JSON in una riga). È l'unico confronto onesto: non stiamo
paragonando a un modello frontier.

| | decisore tipizzato | generativo |
|---|---|---|
| token in ingresso per decisione | 127 | 45* |
| **token generati per decisione** | **0** | **~101** (707 su 7 decisioni riuscite) |
| token totali per decisione | **127** | 146 |
| secondi per decisione | **6,2** | 16,1 |
| decisioni riuscite su 4 richieste | 14/14 | **7/14** (2 richieste su 4 troncate a 600 token, zero risposta) |
| token sprecati dalle richieste fallite | 0 | **1.380** generati + 185 s per zero decisioni |

\* il prompt generativo era più compatto: senza l'elenco verboso delle opzioni che il decisore
invece deve ricevere.

**Su 1.000 decisioni** (proiezione lineare dalle misure):

| | decisore | generativo |
|---|---|---|
| token generati | **0** | ~101.000 |
| token totali | ~127.000 | ~146.000 |
| tempo su questa CPU | **~1,7 ore** | ~4,5 ore |
| costo per token | **0 €** (nessuna API) | dipende dal fornitore |

Il risparmio vero non è l'input: è che **non esiste output**. In ogni listino i token generati
costano 3–5 volte quelli letti, e qui sono zero per costruzione — non perché il modello sia
conciso, ma perché la risposta è il softmax su poche lettere di risposta.

Il rovescio della medaglia è nel tempo: **6,1 s per decisione** significa che questo approccio non
regge un volume alto. 10.000 decisioni = ~17 ore di CPU. Il guadagno in denaro è trascurabile;
il guadagno è in privacy (nulla esce dalla macchina), indipendenza (nessun fornitore, nessuna
rete) e prevedibilità del formato (impossibile ricevere prosa da interpretare).

---

## 4. Qualità: dove ha sbagliato

Su 36 decisioni, con giudizio esplicito sui casi che hanno una risposta attesa:

- **3 errori netti** — `rag-filtering` (`contraddice_policy` no con 0,48: il passaggio parla di 30 giorni contro una policy di 14); `compliance-checklist` (`trasferimenti` no con **0,00**, mentre il testo dichiara esplicitamente che i dati non escono dall'UE); `agent-skill-selection` (`bookforge` 42% invece di «nessuna»: il roster non copre trascrizione e verbali)
- **1 incoerenza interna** — `citation-verification`: riconosce che la fonte *contraddice* l'affermazione (99%) ma risponde che **non** serve correggerla. TypeSafe documenta che il modello non garantisce coerenza fra domande correlate: **la coerenza va imposta dal codice**, non chiesta al modello.
- **1 non giudicabile** — `realtime-control` (dipende dalle costanti fisiche del gioco)
- accuratezza grezza: **32/36 = 89%** — coerente con il 90% misurato sulla fixture ufficiale `smoke-v1`

Da notare per l'uso pratico:

- gli errori **con confidenza bassa** (0,48; 42%) erano **segnalati dalla distribuzione**: la via di mezzo nelle soglie funziona;
- l'errore **peggiore** (0,00 su un fatto scritto nero su bianco) aveva la confidenza **più alta di tutte** → l'overconfidence esiste e non si corregge con la soglia. Serve la calibrazione sui propri dati (`rizzo calibrate`) o un controllo nel codice.

---

## 5. Quando NON usarlo

- **Volumi alti**: 591 decisioni/ora con il servizio serializzato. Oltre, serve una GPU o un approccio diverso.
- **Stati lunghi**: 4.923 token = 236,8 s. Va estratto ciò che conta prima di chiamare il decisore.
- **Cicli in tempo reale**: 14,8 s contro i ~70–500 ms dichiarati per un servizio dedicato. Su questo hardware è fuori discussione.
- **Testo**: non genera nulla, e non è un difetto da aggirare: è il motivo per cui costa zero token.
- **Verità fattuali critiche** senza controprova: come mostra `compliance-checklist`, una probabilità alta non è una garanzia.

## 6. Dove vince

- **Privacy e indipendenza**: nessun dato esce, nessuna API, nessun fornitore — e il formato è impossibile da sbagliare perché non è testo.
- **Triage, instradamento, guardie, ordinamento, punteggi compositi**: tutti i 12 casi hanno girato con 0 errori tecnici e formati sempre validi.
- **Più domande sullo stesso stato**: costo marginale quasi nullo — è la leva più conveniente (4 decisioni in 22 s).
- **Costo in denaro nullo** e token generati sempre zero: la voce più cara di qualunque listino.

## 7. Velocità: cosa si può fare davvero su questa macchina

Misure aggiunte dopo l'audit, per capire se la latenza (~6,1 s/decisione, ~18 s/caso) sia migliorabile.

### Le due leve gratuite sono già esaurite

| leva | misura | verdetto |
|---|---|---|
| Variante CPU di ggml | il runtime carica `libggml-cpu-haswell.so` (AVX2+FMA) | **già ottimale**: per Broadwell non esiste una build migliore disponibile |
| Numero di thread (`pp512`) | 4 → 17,56 tok/s · 5 → 22,58 · **6 → 26,27** | **già ottimale**: 6 thread, come configurato |

(Lo scaling non è lineare: 4→6 thread dà +50%, segno che il limite è la banda di memoria, non il numero di core.)

### La leva grossa: il modello piccolo (1.7B Q8, 1,8 GB)

| | 4B Q4_K_M | 1.7B Q8_0 |
|---|---:|---:|
| prompt processing (pp512, 6 thread) | 26,27 tok/s | **40,74 tok/s** (+55%) |
| `support-triage` (480 token) | 22,3 s | **11,8 s** |
| `compliance-checklist` (489 token) | 22,5 s | **11,1 s** |
| `guardrail-input` (406 token) | 21,1 s | **9,3 s** |
| esito su `guardrail-input` | `azione=bloccare(64%)` ✅ | **`azione=passare(71%)`** ✘ |
| esito su `compliance-checklist` | `trasferimenti=no(0,00)` ✘ | `trasferimenti=no(0,00)` ✘ |

**Il 1.7B raddoppia la velocità e dimezza la sicurezza.** Sul messaggio che chiedeva il file `.env`
il modello piccolo risponde di **eseguire** la richiesta (71%), dove il 4B diceva di bloccarla.
Su un caso di guardia questo non è un compromesso accettabile: è il caso in cui l'errore costa di più.
Coerente con le misure degli autori (0,546 contro 0,648 di accuratezza).

### Le leve residue, in ordine di convenienza

1. **Stato più corto** — gratis, effetto lineare. Il prefill è il **51%** del tempo: dimezzare lo stato
   toglie circa un quarto della latenza totale. È la leva più conveniente e l'unica che migliori
   anche la qualità (meno rumore nel contesto).
2. **Opzioni e descrizioni brevi** — le descrizioni delle scelte si pagano nel prefill.
3. **Cache delle risposte** — stesso stato e stesse domande ripetuti non devono costare una seconda volta
   (oggi non c'è: si può aggiungere nell'harness).
4. **Pre-filtro deterministico** — i casi banali (parole chiave, soglie su numeri) si risolvono in codice:
   la decisione più veloce è quella che non viene chiesta.
5. **Hardware**: una CPU con **AVX-512 e VNNI** e più core dà tipicamente 1,5–2,5×; più core sulla stessa
   architettura rendono poco (4→6 thread = +50%, quindi 6→8 sarà molto meno). È l'unica leva che si compra.
6. **KV cache quantizzata** (`--kv-type q8_0`) — non velocizza: riduce la RAM e permette contesti più lunghi.

**Conclusione.** Su questa macchina non c'è un interruttore magico: le configurazioni sono già quelle
buone. Il tempo si compra in tre modi — stato corto (gratis), qualità (1.7B, da evitare sulle guardie),
hardware (AVX-512/più core) — oppure non si compra e si accetta la latenza.

## 8. Limiti di questo audit (detti chiaramente)

1. **Un solo giro** per caso, 12 casi: non è un benchmark, è una misura di fattibilità con numeri veri. Niente intervalli di confidenza.
2. La correttezza è giudicata a mano da chi scrive, sui casi con risposta attesa.
3. Il confronto generativo ha prompt **più compatti** del decisore (che riceve opzioni e descrizioni formattate): i token di input del generativo sono quindi sottostimati, quelli di uscita sono misurati.
4. La variante misurata è **4b Q4_K_M**: con Q8_0 i numeri cambiano (più RAM, più lento, un po' più accurato); con 1.7B Q8 si dimezza il tempo e si perdono ~10 punti di accuratezza.
5. Le probabilità non sono calibrate: le soglie vanno validate sui propri dati prima di usarle in produzione.
