# Audit dell'harness `pi-harness` — Prompt → Context → Harness

**Oggetto**: questa istanza (`/root/pi-harness`), `dashboard.mjs` 6.306 righe / 283 KB, `dashboard.html` 668 KB (12.931 righe), motore `@earendil-works/pi-coding-agent` 0.85.1, 29 skill, memoria proprietaria in `media/memoria/` (3.964 righe).
**Data**: 2026-10-30 · **Metodo**: lettura del codice reale + misure eseguite sulla macchina + ricerca sulle fonti primarie.

> Dati misurati in questa sessione, non stimati a memoria: prefisso di sistema 6.876 caratteri di stringhe letterali (`SYSTEM_MEDIA_NOTE`) ≈ 1.900 token; indice delle 29 skill 15.175 caratteri di descrizioni ≈ 4.200 token; 60 sessioni in `sessions/`; 43 file `media/test-*.mjs`; **zero** valutazioni di qualità.

---

## 1. As-Is: il ciclo reale, pilastro per pilastro

### 1.1 Prompt Engineering

**Come nasce il prompt di sistema.** Non c'è un file di prompt: c'è una funzione (`dashboard.mjs:1407`).

```js
systemPromptOverride: (base) => `${base ?? ""}${SYSTEM_MEDIA_NOTE}${progettoPromptNote()}`,
```

Tre strati con nature diverse finiscono concatenati in un'unica stringa:

| Strato | Origine | Natura | Peso |
|---|---|---|---|
| `base` | SDK pi: istruzioni + schemi dei tool + indice skill | stabile, rigenerato quando cambia il set di tool | ~2–3k token + 4,2k di skill |
| `SYSTEM_MEDIA_NOTE` (`:894`) | stringa letterale di ~6.900 caratteri nel sorgente | **statico ma scritto in italiano e mescolato** (policy tool, regole UI, filosofia, sync git) | ~1,9k token |
| `progettoPromptNote()` (`:1336`) | legge il **filesystem** ad ogni chiamata | dinamico | variabile |

**Cosa funziona.** Il testo è in italiano, il che è coerente con la regola di lingua del sistema; c'è una gerarchia interna reale (## per sezione) e le istruzioni sono scritte come *regole decisionali* («quando X, fai Y; non usarlo per Z»), non come desiderata. Il caso dei PDF (`buildPromptPayload`, `:4124`) è prompt engineering fatto bene: invece di incollare il documento nel contesto, si dichiara quante pagine ha e **come** leggerle (`?testo=3`), con la prima pagina come immagine. È il pattern «disclosure progressiva» documentato da Anthropic, applicato senza saperlo.

**Dove si rompe.**

1. **Un solo blob per sei responsabilità diverse.** `SYSTEM_MEDIA_NOTE` contiene: politica di `ask_user`, lingua, dove salvare i file, procedura di fine lavoro (sync git), memoria a lungo termine, goal, contratto SVG, Decision_M, Timestral. Sono **sei contratti** con cicli di vita diversi: il contratto SVG cambia quando cambia il sanitizzatore frontend, la procedura di sync cambia quando cambia lo script, ma per cambiarne uno si ricompila tutto il blocco. Inoltre solo due dei sei sono iniettabili a richiesta: il resto è sempre nel contesto, anche per una domanda da due parole.
2. **Nessun contratto di output.** Gli unici output vincolati sono i tool. Il testo libero non passa da nessun controllo: la funzione che dovrebbe verificare «ha davvero completato il lavoro?» non esiste. Le uniche eccezioni strutturate sono `goalExecutionPrompt` (`:1901`) e il prompt dei cron, che sono template testuali senza schema.
3. **Nessuna versione, nessuna prova.** Non esiste un identificativo del prompt, né un set di casi che dica se una modifica al blocco ha migliorato o peggiorato qualcosa. Il commento in `:926` («lezione già annotata», «difetto visto con una richiesta vera») documenta che le regressioni vengono scoperte **in produzione**, una per una.
4. **Il prefisso viene riscritto ogni volta che cambia il set di tool.** `applyToolGate()` (`:1510`) ricalcola la lista e chiama `setActiveToolsByName`, che ricostruisce il prompt di sistema: ogni cambio di gate invalida il prefisso (vedi §1.3).

### 1.2 Context Engineering

**Come è montato il contesto, in ordine di come il modello lo vede:** istruzioni SDK → indice delle 29 skill → `SYSTEM_MEDIA_NOTE` → nota progetto (cartelle + primi file) → cronologia messaggi → risultati dei tool.

**Cosa c'è di buono, ed è molto.**

- **Memoria just-in-time, non pre-caricata.** `memoria_cerca`, `memoria_grafo`, `memoria_wiki`, `memoria_episodio` sono *tool* (`media/memoria/memoria-tool.mjs`): il modello paga i token della memoria solo quando la interroga. È esattamente la strategia «just in time» e «filesystem as context» che Anthropic e Manus indicano come superiore al RAG precaricato.
- **Memoria scritta da sé.** L'archiviazione parte a fine sessione e al cambio chat (`archiviaSessione`, `:1617`), in **coda seriale** per non avere due scritture concorrenti su indice/grafo/atlante; se fallisce, la chat nuova si apre lo stesso e il guasto è **dichiarato** (`stato.da_aggiornare`). È una scelta di affidabilità corretta.
- **Compaction già presente nel motore**, non nella dashboard: soglia `contextTokens > contextWindow - reserveTokens` con riserva 16.384 token (`dist/core/compaction/compaction.js:76,163`), summary strutturata in sezioni.
- **Ripresa dopo la compaction gestita a mano** (`compactEstimate`, `:1427` e `:2466`): quando pi restituisce `tokens: null`, la UI mostra la stima invece di una barra vuota. Piccolo hack, ma è la differenza fra un indicatore che mente e uno che dichiara.

**Dove si rompe.**

1. **Il contesto non ha un bilancio.** `getState()` espone `tokens/window/percent`, cioè il *totale*. Nessuno sa **quanto** costano le istruzioni, l'indice skill, la nota progetto o i risultati dei tool. Senza quel bilancio non si può decidere cosa tagliare: si può solo compattare tutto insieme quando è tardi. Il costo fisso (~6,1k token di prefisso prima di qualsiasi contenuto) è invisibile in UI.
2. **Le osservazioni entrano intere.** Un `read` su un file da 2.000 righe, un `browser snapshot`, un `fetch_content`: il risultato finisce nel contesto per intero e resta lì. Non esiste offload su file con riferimento (Manus: «le strategie di compressione devono essere **ripristinabili**»). La compaction a ~95% arriva quando il danno (contesto saturo, context rot) è già avvenuto.
3. **Nessuna recitation.** La ricerca Manus è netta: riscrivere l'obiettivo in coda al contesto ogni N passi riduce la deriva meglio di qualsiasi istruzione iniziale. Qui i goal esistono (`media/goals.json`) ma entrano nel contesto **solo** quando l'utente lancia «esegui goal». In un turno lungo da 40 tool call, l'obiettivo iniziale è a 30k token di distanza dall'attenzione.
4. **Il prefisso non è stabile, e la cache si paga.** Vedi §1.3: è il punto in cui i tre pilastri si toccano.

### 1.3 Harness Engineering

**Il loop.** `POST /api/prompt` (`:4899`) → `session.prompt()` → eventi (`handleSessionEvent`, `:2584`) → broadcast SSE ai client (`:4548`, con `retry: 2000` e `Last-Event-ID` per la riconnessione). Un solo turno attivo per volta (`409 già in streaming`).

**Cosa c'è di buono.**

- **L'osservabilità dello stream è seria**: riconnessione con replay dal `Last-Event-ID`, snapshot dei segmenti in corso ricostruibile, thinking separato dal testo, stato del turno (`turnActive`) allineato fra server e UI.
- **I guardrail sono veri, non dichiarati**: `MEDIA_GUARD_EXT` (`:695`) riscrive gli argomenti *prima* dell'esecuzione (write fuori da `media` → dirottato, `bash` con redirect → riscritto), autenticazione con backoff progressivo per IP, sanitizzazione dell'SVG lato client, `preflight-sicurezza.sh` e pattern dei segreti. Sono controlli che **non dipendono dal fatto che il modello sia obbediente**.
- **Degradazione esplicita per le feature esterne**: Decision_M e Timestral sono gate nei tool; quando il servizio è spento i tool **spariscono dalla lista**, il modello non li chiama a vuoto e la UI dice perché.
- **Affidabilità dell'archivio** (coda, non blocco, errore dichiarato) come sopra.
- **Retry delegato al motore**: pi ha `maxRetries` (default 3, `settings-manager.js:595`) e `abortRetry`; la dashboard non duplica la logica — scelta giusta.

**Dove si rompe.**

1. **`applyToolGate` rimuove i tool, non li maschera.** È il difetto più costoso del sistema, e non è un'opinione: le definizioni dei tool stanno **in testa** al contesto, quindi ogni cambio di lista invalida la cache KV per tutti i token successivi; e i messaggi precedenti continuano a riferirsi a tool che non esistono più — il modello «si confonde», esattamente come documentato da Manus. Accade in tre casi normali: in modalità `auto` il browser si accende/spegne da solo (`setInterval` ogni 60s, `:1525`), il turno dopo una domanda, il cambio di preferenza. In un turno con 30 passi, un singolo cambio di gate a metà costa il prefisso intero, non solo i pochi token del tool.
2. **Nessuna tassonomia degli errori.** Un fallimento di tool arriva come `event.isError` (`:2632`) e diventa una stringa in chat. Non si distingue: timeout di rete, schema violato, permesso negato, servizio spento, argomenti sbagliati. Quindi la reazione è sempre la stessa (il modello «riprova»), mentre la letteratura recente (SHIELDA, arXiv 2508.07935) mostra che il guadagno sta nel **classificare** l'eccezione e applicare un pattern diverso per classe. Il caso più evidente è già scritto nel prompt: «se Timestral non risponde è il servizio fermo, non la feature spenta» — una diagnosi corretta affidata al testo, non al codice.
3. **Nessuna telemetria per turno.** Ci sono token e costo *cumulati* di sessione (`sessionStatsSafe`, `:2430`) e la coppia `cacheRead · cacheWrite` in barra (`dashboard.html:2784`). Non c'è: costo sprecato per cache miss (l'SDK lo calcola già — `computeCacheWaste` in `dist/core/cache-stats.js`), durata per turno, tasso di successo dei tool, numero di retry, token per sezione del contesto. `pi-observability` scrive `history.jsonl` con una riga per sessione, ma la dashboard non lo legge: il dato esiste e non viene usato.
4. **Nessuna valutazione.** 43 file `media/test-*.mjs` misurano che l'**interfaccia** funzioni (PDF, SVG, browser, riconnessione, TTS…). Nessuno misura se l'**agente** ha fatto bene il lavoro. Non c'è un set di richieste con esito atteso, quindi ogni modifica al prompt (§1.1) è un azzardo.
5. **Due monoliti come punto unico di guasto.** `dashboard.mjs` 6.306 righe e `dashboard.html` 668 KB in un unico `<script>` non sono un problema di stile: sono ciò che rende costoso ogni intervento di §1.1–§1.3 (nessuna parte si può testare in isolamento) e fragile il riavvio (un errore di sintassi in qualsiasi punto = istanza giù).
6. **Un solo modello, nessun instradamento.** Il modello si sceglie a mano in barra; se il provider è lento o giù, il turno è lento o giù. E ogni richiesta — «quanti file ci sono in media?» e un audit come questo — paga lo stesso prefisso e lo stesso modello.

---

## 2. Stato dell'arte: cosa dice la letteratura (e cosa è già qui)

Fonti primarie lette per intero in questa sessione, non citate di seconda mano.

**Anthropic — *Effective context engineering for AI agents*.** Tre affermazioni che riguardano direttamente questo codice: (a) il contesto è una **risorsa finita con rendimenti decrescenti** («context rot»): più token, meno precisione nel recupero; (b) la strategia vincente è la **più piccola serie di token ad alto segnale**, non la più grande; (c) per gli agenti a lungo orizzonte valgono *compaction*, *structured note-taking* e **architetture con sub-agenti** che isolano il contesto. Il puntatore operativo è il pattern **just-in-time**: conservare riferimenti leggeri (percorsi, query, URL) e caricare il contenuto con i tool — che è ciò che qui fa già la memoria.

**Manus — *Context Engineering for AI Agents* (lezione empirica, 4 rifacimenti del framework).** Cinque punti, in ordine di utilità per questo harness:
1. **Il KV-cache hit rate è la metrica numero uno** di un agente in produzione (ratio input/output ~100:1; con Sonnet il token cachato costa 10 volte meno). Si difende con: prefisso stabile, contesto **solo append**, serializzazione deterministica.
2. **«Mask, don't remove»**: non aggiungere o togliere tool a metà iterazione; si maschera la scelta. È il rimedio esatto al difetto §1.3.1.
3. **Il filesystem come contesto**: memoria esterna illimitata e persistente; ogni compressione deve essere **ripristinabile** (si scarta il contenuto, si conserva il riferimento). Rimedio a §1.2.2.
4. **Recitation**: riscrivere l'obiettivo in coda al contesto per combattere la deriva. Rimedio a §1.2.3.
5. **«Keep the wrong stuff in»**: gli errori non vanno nascosti, sono evidenza; la capacità di recupero è l'indicatore più chiaro di comportamento agentico.

**LangChain — *Context Engineering for agents*.** Le quattro operazioni: **write** (memoria fuori dalla finestra), **select** (recupero al momento giusto), **compress** (riassunto/trim), **isolate** (sub-agenti, sandbox, stato con schema). Utile come griglia di verifica: questo harness fa bene *write* e *select*, non fa *isolate*, e fa *compress* solo quando è troppo tardi.

**Affidabilità — SHIELDA (arXiv 2508.07935), *Failure Makes the Agent Stronger* (2509.18847), PALADIN (2509.25238), *Reliability Patterns for LLM-Based Multi-Agent Systems*.** Convergono su: tassonomia delle eccezioni per *artefatto* (36 tipi in 12 categorie), **classificatore → pattern di gestione** invece di retry generico, riflessione **strutturata** sul fallimento (non «pensa di più»), verifica delle post-condizioni come primitiva deterministica accanto alla generazione stocastica.

**Instradamento — RouteLLM (arXiv 2406.18665), rassegna ACL sul routing, benchmark SLM front-door.** Un router economico taglia le chiamate al modello grande del 20–40% con perdita di qualità contenuta; i classificatori a 1–4B bastano per il «front-door». Questo harness ha già un decisore locale (Decision_M) — la materia prima c'è, manca il collegamento.

**Strumenti di riferimento, verificati sui repository:** `promptfoo` (eval e red-team di prompt in configurazione dichiarativa), `inspect_ai` (framework di valutazione per agenti), `langfuse` (tracciamento e osservabilità LLM), Semantic Conventions **GenAI** di OpenTelemetry (nomi standard per span e attributi).

### Cosa l'harness ha già, senza saperlo
| Pratica SOTA | Dove è già qui |
|---|---|
| Memoria just-in-time | i 4 tool di `media/memoria/` |
| Disclosure progressiva | PDF a pagina (`?testo=N`, `:4124`) |
| Compaction automatica | motore pi, riserva 16k |
| Guardrail indipendenti dal modello | `MEDIA_GUARD_EXT`, auth+backoff, sanitizzazione SVG |
| Degradazione dichiarata | gate Decision_M / Timestral |
| Serializzazione delle scritture | code di archivio e atlante |
| Retry con budget | `maxRetries` del motore |

Il divario non è «manca tutto»: è che le pratiche presenti sono **locali e non misurate**, e le tre più costose (prefisso stabile, offload ripristinabile, tassonomia errori) mancano del tutto.

---

## 3. To-Be: interventi implementabili, in ordine di rapporto impatto/costo

Ogni voce dice **dove** si tocca e **come si verifica**.

### P0 — Prefisso stabile e cache difesa (mezza giornata, nessun cambio di comportamento)
- **`applyToolGate` (`:1510`)**: non togliere i tool dal set; calcola il set **una volta per turno** e mantieni costante l'ordine. Per le feature spente, sostituisci la rimozione con un *deny* nell'esecuzione (`MEDIA_GUARD_EXT` già sa intercettare `tool_call`): il modello vede il tool, l'harness rifiuta con un motivo parlante. Se il vincolo è risparmiare token, allora **congela** la lista all'inizio del turno e non ricostruire il prompt a metà.
- **`progettoPromptNote()` (`:1336`)**: sposta la nota progetto **in coda** al contesto (ultimo blocco prima dei messaggi) o mettila in un tool `progetto`. Oggi è dentro il prefisso e legge il filesystem: ogni file nuovo cambiato = cache fredda.
- **Verifica**: `computeCacheWaste` dell'SDK (già disponibile) esposto in `getState()` e in barra: token sprecati e dollari sprecati per turno. Prima misura, poi si dichiara il guadagno.

### P0 — Bilancio del contesto visibile (una giornata)
- Nuova funzione `contextLedger()` chiamata da `getState()`: token per sezione (istruzioni, indice skill, nota progetto, cronologia, risultati tool, memoria). Stima con il tokenizer del modello se esposto, altrimenti rapporto caratteri/token dichiarato in UI.
- In `dashboard.html`, la barra del contesto si scompone in **fasce colorate** con la legenda: si vede a colpo d'occhio che 6,1k token sono fissi e che l'ultimo `read` da 40k domina tutto.
- **Verifica**: la somma delle fasce deve coincidere con `tokens` di `getContextUsage()` a meno del 5%.

### P1 — Offload ripristinabile delle osservazioni (due giorni)
- Hook su `tool_execution_end` (`:2626`): se il risultato supera una soglia (proposta: 8k caratteri), scrivilo in `media/ctx/<sessionId>/<toolCallId>.txt`, e sostituisci nel contesto un blocco da ~150 token: prime 20 righe + hash + percorso + «rileggi con `read` o `grep`».
- Regola di ripristino (Manus): si può scartare il contenuto **solo se** il riferimento è sufficiente a riottenerlo. Per `fetch_content` conserva l'URL, per `browser` l'URL e lo snapshot id.
- **Verifica**: a parità di task, token di picco nel turno −30% e nessun aumento dei fallimenti (serve P1-eval, sotto).

### P1 — Compaction guidata + recitation (due giorni)
- Abbassa la soglia: compattare a **70–75%** della finestra costa meno di compattare al 95%, perché il summary è più corto e il contesto degradato non ha già degradato il ragionamento.
- Aggiungi al summary le sezioni che oggi mancano e che il canale memoria sa già leggere: **decisioni prese**, **errori incontrati e come sono stati risolti**, **file toccati**. Il prompt del motore ha già goal/progress/decision (`compaction.js:387-421`): basta allineare il formato a `memoria_episodio`.
- **Recitation**: inietta in coda, ogni N passi (N=5) o dopo ogni errore, un blocco di 150–250 token con: obiettivo attivo, ultimo errore, prossimo passo dichiarato. Ricavalo da `goals.json` + ultimo tool fallito. È il rimedio a costo quasi zero contro la deriva.

### P1 — Valutazione (il moltiplicatore di tutto il resto, due giorni)
- Set iniziale di **20–30 casi reali** presi da `sessions/`: richiesta, esito atteso verificabile (file creato, comando eseguito, risposta contiene i numeri giusti), budget di costo.
- Runner: `promptfoo` (dichiarativo, ottimo per confrontare due versioni di prompt) o `inspect_ai` se serve controllo del loop. Misure: successo, turni, token, costo, cache miss, numero di retry.
- **Senza questo, P0–P1 sono opinioni.** Con questo, ogni voce successiva diventa una riga di tabella con un delta.

### P2 — Tassonomia degli errori e riparazione (tre giorni)
- Classificatore a regole sull'errore del tool: `network|timeout`, `schema`, `permission`, `not_found`, `service_down`, `bad_args`. (Decision_M, quando accesa, può dare la classe come giudizio tipizzato: è esattamente il caso d'uso per cui esiste.)
- Pattern per classe: timeout → retry con backoff e budget; schema → riformula l'argomento una volta, poi chiedi; permission → fermati e chiedi all'utente; service_down → non riprovare, dichiara e proponi l'avvio (`systemctl start timestral` è già la diagnosi scritta nel prompt: spostala nel codice); bad_args → rileggi lo schema e correggi.
- **«Keep the wrong stuff in»**: la traccia dell'errore resta nel contesto con la sua classe; solo il retry viene contato e limitato.
- **Verifica**: tasso di recupero su errori indotti (test che fa fallire un tool apposta, come già si fa per browser e PDF).

### P2 — Telemetria per turno e span (due giorni)
- Una riga JSONL per turno: `{ts, sessionId, turn, model, tokens{in,out,cacheRead,cacheWrite}, cost, cacheWaste, tools[], errors[{class}], durationMs, outcome}`. `pi-observability` ha già `history.jsonl`: estendilo invece di duplicarlo.
- Nomi e attributi secondo le Semantic Conventions **GenAI** di OpenTelemetry, così il file è importabile in Langfuse/altro senza riscrivere il modello dei dati.
- In UI: una vista «turni» con costo e cache-hiteness per turno, non solo il totale di sessione.

### P3 — Instradamento (quando P0–P2 hanno numeri)
- Front-door deterministico per i comandi (`/…`), che già esistono: zero token.
- Per il resto, Decision_M come router: classe della richiesta → modello (o livello di thinking) con una tabella di policy, non con un modello che «decide». Se la scelta è fra due e non c'è misura, la regola è la più semplice che funziona.
- **Verifica**: eval di P1 su due configurazioni; si adotta solo se il successo non cala oltre la soglia dichiarata.

### P3 — Riduzione dei monoliti (continuo, non un progetto)
- Estrai da `dashboard.mjs` almeno: (a) costruzione del prompt (`SYSTEM_MEDIA_NOTE` → file `media/prompt/*.md` versionati, letti all'avvio, con hash nel log), (b) `applyToolGate`, (c) ledger del contesto, (d) telemetria. Ogni estrazione va accompagnata da un test.
- Nel frontend, l'unico `<script>` da 12.931 righe: almeno separare il **simulatore** e le viste pesanti in moduli caricati a richiesta. Non riscrive l'esistente, riduce l'area di guasto.
- **Nota onesta**: questa è la voce con il rapporto impatto/costo peggiore a breve termine e il migliore a lungo. Non va fatta prima di P1-eval.

---

## 4. Architettura To-Be in una figura

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 520" width="880" height="520" font-family="ui-sans-serif, system-ui, sans-serif">
  <title>Ciclo dell'harness: da tre strati concatenati a tre strati con feedback misurato</title>
  <desc>Schema in tre colonne: Prompt, Context, Harness. Sopra lo stato attuale con i tre punti di rottura, sotto lo stato proposto con ledger, offload, recitation, tassonomia errori e valutazione.</desc>
  <rect width="880" height="520" fill="#08111f"/>
  <text x="24" y="34" fill="#eef2f9" font-size="17" font-weight="600">Ciclo dell'harness: attuale (sopra) e proposto (sotto)</text>
  <text x="24" y="56" fill="#8b97ac" font-size="12">Non è una figura in scala: mostra le relazioni, non i volumi.</text>

  <!-- ATTUALe -->
  <text x="24" y="92" fill="#fb7185" font-size="12" font-weight="600">ATTUALE — concatenazione senza misura</text>
  <rect x="24" y="104" width="260" height="120" rx="10" fill="#172033" stroke="#2a3448"/>
  <text x="40" y="128" fill="#eef2f9" font-size="13" font-weight="600">1 · Prompt</text>
  <text x="40" y="150" fill="#c6cfdd" font-size="11">blob unico di sei contratti</text>
  <text x="40" y="168" fill="#c6cfdd" font-size="11">~6,1k token fissi</text>
  <text x="40" y="186" fill="#fb7185" font-size="11">nessuna versione, nessuno schema</text>
  <text x="40" y="208" fill="#8b97ac" font-size="11">dashboard.mjs:894, :1407</text>

  <rect x="308" y="104" width="260" height="120" rx="10" fill="#172033" stroke="#2a3448"/>
  <text x="324" y="128" fill="#eef2f9" font-size="13" font-weight="600">2 · Context</text>
  <text x="324" y="150" fill="#34d399" font-size="11">memoria just-in-time ✓</text>
  <text x="324" y="168" fill="#fb7185" font-size="11">osservazioni intere, nessun offload</text>
  <text x="324" y="186" fill="#fb7185" font-size="11">compaction tardi (~95%)</text>
  <text x="324" y="208" fill="#8b97ac" font-size="11">bilancio del contesto assente</text>

  <rect x="592" y="104" width="264" height="120" rx="10" fill="#172033" stroke="#2a3448"/>
  <text x="608" y="128" fill="#eef2f9" font-size="13" font-weight="600">3 · Harness</text>
  <text x="608" y="150" fill="#34d399" font-size="11">guardrail reali ✓</text>
  <text x="608" y="168" fill="#fb7185" font-size="11">gate rimuove i tool → cache persa</text>
  <text x="608" y="186" fill="#fb7185" font-size="11">errori senza classe</text>
  <text x="608" y="208" fill="#8b97ac" font-size="11">43 test UI, 0 eval di qualità</text>

  <polygon points="284,164 302,158 302,170" fill="#8b97ac"/>
  <polygon points="568,164 586,158 586,170" fill="#8b97ac"/>

  <!-- separatore -->
  <line x1="24" y1="252" x2="856" y2="252" stroke="#2a3448" stroke-dasharray="4 6"/>

  <!-- TO-BE -->
  <text x="24" y="282" fill="#34d399" font-size="12" font-weight="600">PROPOSTO — stesso flusso, con tre anelli di feedback</text>

  <rect x="24" y="294" width="260" height="120" rx="10" fill="#172033" stroke="#34d399"/>
  <text x="40" y="318" fill="#eef2f9" font-size="13" font-weight="600">1 · Prompt</text>
  <text x="40" y="340" fill="#c6cfdd" font-size="11">sei file .md versionati + hash</text>
  <text x="40" y="358" fill="#c6cfdd" font-size="11">prefisso stabile, dinamico in coda</text>
  <text x="40" y="376" fill="#c6cfdd" font-size="11">schema validato sui comandi</text>
  <text x="40" y="398" fill="#8b97ac" font-size="11">casi d'oro per ogni modifica</text>

  <rect x="308" y="294" width="260" height="120" rx="10" fill="#172033" stroke="#34d399"/>
  <text x="324" y="318" fill="#eef2f9" font-size="13" font-weight="600">2 · Context</text>
  <text x="324" y="340" fill="#c6cfdd" font-size="11">ledger: token per sezione</text>
  <text x="324" y="358" fill="#c6cfdd" font-size="11">offload su file + riferimento</text>
  <text x="324" y="376" fill="#c6cfdd" font-size="11">compaction a 70% con decisioni</text>
  <text x="324" y="398" fill="#c6cfdd" font-size="11">recitation dell'obiettivo ogni 5 passi</text>

  <rect x="592" y="294" width="264" height="120" rx="10" fill="#172033" stroke="#34d399"/>
  <text x="608" y="318" fill="#eef2f9" font-size="13" font-weight="600">3 · Harness</text>
  <text x="608" y="340" fill="#c6cfdd" font-size="11">tool mascherati, set congelato</text>
  <text x="608" y="358" fill="#c6cfdd" font-size="11">errore → classe → riparazione</text>
  <text x="608" y="376" fill="#c6cfdd" font-size="11">un record per turno (OTel GenAI)</text>
  <text x="608" y="398" fill="#c6cfdd" font-size="11">eval: 20–30 casi, delta misurato</text>

  <polygon points="284,354 302,348 302,360" fill="#34d399"/>
  <polygon points="568,354 586,348 586,360" fill="#34d399"/>

  <rect x="24" y="430" width="832" height="34" rx="8" fill="#1d2634"/>
  <text x="40" y="452" fill="#c6cfdd" font-size="12">Misura che chiude l'anello: cache waste + token per turno + successo sui casi d'oro → decide cosa promuovere</text>

  <polygon points="430,430 424,414 436,414" fill="#5b9dff"/>
  <line x1="430" y1="414" x2="430" y2="416" stroke="#5b9dff" stroke-width="1"/>
  <polygon points="430,296 424,306 436,306" fill="#5b9dff"/>
</svg>
```

---

## 5. Come leggere il simulatore accluso

`dashboard.html` nella stessa cartella è autonomo (nessuna rete, nessuna risorsa esterna). Modella il ciclo con **parametri dichiarati** e mostra, fianco a fianco, il comportamento «attuale» e «ottimizzato». Non è strumentazione reale: è un modello a parametri, e serve a rendere visibili le conseguenze quantitative delle scelte di §3 — non a produrre numeri da citare come misura.

Parametri esposti: passi del turno, dimensione media della osservazione, cambi di gate (invalidazioni del prefisso), soglia di compaction, prezzo input e sconto cache read, tasso di errore dei tool. Le formule sono nella scheda «modello» del simulatore.
