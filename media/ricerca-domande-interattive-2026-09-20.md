# Domande e questionari interattivi in chat — ricerca e decisioni di progetto

Data: **2026-09-20** · Ambito: **Universalis Harness** (dashboard chat su pi)

Obiettivo dell'utente:

> «vorrei aggiungere la capacità di porre domande e questionari all'utente direttamente in chat
> e se possibile in modo interattivo. Quando riconosci che l'utente invia messaggi ambigui o
> poco dettagliati dovresti essere in grado di chiedere specifiche.»

Questo documento raccoglie le best practice trovate (con fonti) e le **decisioni concrete** che
ne derivano per questa implementazione. È il riferimento usato dall'implementazione
(`media/ask-tool.mjs`, `media/ask-broker.mjs`, `dashboard.mjs`, `dashboard.html`).

---

## 0. Sintesi operativa (le regole che adottiamo)

1. **Chiedere è un'eccezione, non la norma.** L'agente deve chiedere solo quando l'ambiguità
   *cambia l'esito* dell'azione successiva (bersaglio, autorità, evidenza, conseguenza) e non
   quando può risolverla da solo leggendo file/contesto o scegliendo un default sensato.
2. **Una chiamata = poche domande.** Massimo **4 domande** per chiamata (tipico: 1). Ogni
   domanda in più è una tassa sull'utente: il rischio è l'interrogatorio («delegation collapses
   into supervision»).
3. **Opzioni concrete, sempre.** 2–6 opzioni brevi con descrizione di cosa cambia; la scelta
   consigliata per prima, marcata *(consigliata)*. Mai opzioni solo dentro la prosa.
4. **Scampatoia sempre presente.** Il client aggiunge da sé **「Altro / rispondi a parole tue」**
   e **「Salta / decidi tu」**: il modello **non** deve scrivere un'opzione "Altro".
5. **Un rifiuto è un esito valido.** Declino, salto, tempo scaduto, turno interrotto: il tool
   restituisce un esito esplicito al modello, che **prosegue con il proprio miglior giudizio**
   dichiarando le assunzioni — non resta bloccato.
6. **Niente segreti nei questionari.** Password, API key, token, dati di carta: la spec MCP
   vieta la raccolta in *form mode*. Il tool rifiuta la richiesta e indirizza altrove.
7. **La domanda vive nel turno.** Mostrata **nel punto esatto** del messaggio in corso (come le
   card dei tool), non in fondo; alla risoluzione resta nel transcript come riepilogo
   domanda+risposta, con lo stato (risposto / declinato / scaduto / annullato).
8. **Deve sopravvivere a reload e riconnessione.** La domanda in attesa è ripubblicata dal
   server allo stato iniziale e agli eventi SSE; il riallineamento è idempotente (stesso id).
9. **Time-out obbligatorio** (default 900 s, limitato a 30–3600 s) con conto alla rovescia
   visibile: nessun turno deve poter restare appeso all'infinito.
10. **Interruzione = annullamento.** ⏹ stop (o un errore del turno) chiude le domande pendenti,
    così il tool ritorna subito invece di restare in attesa di un turno che non esiste più.
11. **Validazione stretta.** Argomenti fuori dai limiti → errore leggibile al modello (retry di
    validazione), risposta del client non conforme → 400. Nessun campo extra accettato.
12. **Input dell'utente = input non fidato.** Lunghezze limitate, niente HTML (rendering via
    `textContent`), niente caratteri di controllo/sequenze ANSI, solo id pendenti validi.

---

## 1. Quando l'agente deve chiedere (e quando no)

### 1.1 L'euristica dei quattro criteri

La fonte più utile ([Ginger Labs, *When Should an Agent Ask a Clarifying Question vs Proceed
Safely?*](https://gingerlabs.ai/blog/when-should-an-agent-ask-a-clarifying-question-vs-proceed-safely))
propone un test in quattro punti prima di procedere:

| Criterio | Domanda da farsi | Se manca |
|---|---|---|
| **Bersaglio unico** | so con certezza *quale* oggetto/record/file/date-range? | restringere i candidati e **far scegliere**, non indovinare |
| **Autorità / delega** | sono autorizzato a *questa* azione su *questi* dati? | chiedere conferma o escalation |
| **Evidenza** | ho fonti presenti, attribuibili e coerenti? | far vedere il conflitto, non scegliere la fonte "familiare" |
| **Conseguenza / reversibilità** | l'azione è recuperabile? | per azioni non recuperabili: mostrare bersaglio+modifica e chiedere approvazione |

La regola operativa che ne deriva: *«the agent may reduce uncertainty through safe
investigation, but it must not resolve uncertainty by taking a consequential action»*.

Lo stesso principio da più angolazioni: chiedere quando «an unresolved ambiguity could change
the record, authority, evidence, or consequence of its next action»; procedere quando «it can
take a useful, low-consequence step from verified context without making a material
assumption». Un agente che chiede a ogni frase vaga «becomes an expensive form»; uno che
riempie i buchi con ipotesi plausibili «may change the wrong record».

### 1.2 Chiarimento ≠ conferma ≠ escalation

Tre interazioni diverse, spesso confuse sotto l'etichetta "human in the loop":

- **chiarimento** → manca un'informazione («quale dei due account Northwind?»);
- **conferma** → autorizzare un'azione nota («applico queste tre modifiche al record scelto?»);
- **escalation** → instradare un caso che l'agente non può decidere (conflitto fra fonti).

«Choose the smallest interaction that closes the real gap»: una conferma non ripara un bersaglio
ambiguo, un chiarimento non risolve una disputa di competenza.

### 1.3 Regole di stop

- **Non chiedere ciò che si può scoprire**: file, cronologia, contesto della dashboard, default
  sensato. Il modello deve prima indagare (`read`, `bash`, `browser`) e **poi** chiedere ciò che
  resta. La formulazione efficace usata da OpenClaw/Pydantic: «ask when the task is ambiguous and
  the answer is not in the workspace».
- **Non chiedere il permesso di procedere** né farsi approvare il proprio piano con questo tool
  (Claude Code lo dice esplicitamente: quello è un'altra cosa, `ExitPlanMode`). Idem per
  conferme di routine.
- **Batchare le domande correlate** in una sola chiamata, invece di una raffica di turni
  domanda→risposta (Pydantic: «batch related questions»).
- **Dopo un rifiuto**: scegliere l'opzione più ragionevole e **dichiararla** nel testo; non
  riproporre la stessa domanda identica.

### 1.4 Prompting

Le guide OpenAI (GPT‑5.x) prescrivono esattamente il pattern che ci serve: davanti a una
richiesta ambigua, *«explicitly call this out and: ask up to 1–3 precise clarifying questions,
OR present 2–3 plausible interpretations»*. Nota la scelta: **poche** domande **precise**.
La stessa guida mette in guardia dal caso opposto: se si vuole autonomia si aumenta
`reasoning_effort` e si disincentivano le domande — quindi la soglia *deve* stare nel prompt
(qui: descrizione del tool + nota nel system prompt), non essere lasciata al caso.

---

## 2. Progetto del tool: schema, limiti, validazione

### 2.1 Confronto fra implementazioni reali

| | **MCP `elicitation/create`** | **Claude Code `AskUserQuestion`** | **OpenClaw `ask_user`** | **Pydantic `ask_user_question`** |
|---|---|---|---|---|
| Forma | JSON Schema *flat*, solo tipi primitivi (string/number/boolean/enum, single e multi-select) | 1–4 domande, 2–4 opzioni (label+description), `multiSelect` | 1–3 domande, 2–4 opzioni (label+description), `multiSelect`, `header` ≤12 char | 1–10 domande, 2–6 opzioni (label+description), `multi_select`, `header` ≤25 char |
| Testo libero | campi string dello schema | **sempre** disponibile come "Other" | **sempre** disponibile come "Other"; l'agente non deve scriverlo | il client decide; risposta validata contro le opzioni |
| Esiti | **accept / decline / cancel** (tre azioni) | selezione + Other | `answered` / `no_answer` (+skip) | risposta, oppure `cancelled=True` |
| Timeout | non specificato (è del client) | — | **900 s** di default, clamp 30–3600 | è del chiamante |
| Validazione | client SHOULD validare vs schema; server SHOULD verificare | schema strettamente tipizzato | — | **strict**: campi extra o fuori limite = retry di validazione, non arrivano all'utente |
| Sicurezza | **form mode MUST NOT** raccogliere dati sensibili (password/API key): per quelli esiste la modalità URL/out-of-band | — | «Never answer `ask_user` with a credential» → tool `secrets` dedicato | nessun carattere di controllo (le stringhe finiscono su un terminale: è un vettore di attacco) |
| Dove appare | dentro il client MCP | pannello a scelte, con preview opzionale (mockup/codice) | pannello sopra il composer; **una domanda alla volta** con stepper; su Telegram/Slack bottoni nativi; degrada a testo | qualunque front-end (menu TUI, form web) |

Fonti: [MCP — Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation),
[Claude Code — AskUserQuestion (anatomia del prompt)](https://ccprompts.info/prompts/tool/tool-ask-user),
[Claude Code — User input](https://code.claude.com/docs/en/agent-sdk/user-input),
[OpenClaw — Ask user](https://docs.openclaw.ai/tools/ask-user),
[Pydantic AI Harness — Ask User](https://pydantic.dev/docs/ai/harness/ask-user/).

### 2.2 Regole condivise che ne ricaviamo

1. **Opzioni, non prosa.** Ogni scelta selezionabile deve stare in `options`, non nel testo della
   domanda: così la risposta torna come *dato* e non va interpretata.
2. **Descrizione per opzione**: dice *cosa cambia* se la si sceglie (le label da sole sono ambigue).
3. **Consigliata per prima**, suffisso *(consigliata)*. Riduce il carico decisionale e rende
   esplicita la raccomandazione senza imporla.
4. **"Altro" e "Salta" li aggiunge il client**, sempre. Se l'agente scrivesse lui un'opzione
   "Altro" si otterrebbero due scampatoie e risposte ambigue.
5. **`header` corto** come chiave/etichetta della domanda (12–25 char), `id` stabile in snake_case
   per correlare le risposte.
6. **`multiSelect` solo se davvero si possono scegliere più voci**; altrimenti selezione singola
   (meno errori).
7. **Validazione stretta, con retry parlante**: argomenti fuori dai limiti tornano al modello come
   errore comprensibile, così può correggere la chiamata invece di far fallire il turno.
8. **Nessun dato sensibile in un form**: se servono credenziali, la strada è un file/`env`, non la chat.

---

## 3. Ciclo di vita di una domanda

Stati e transizioni (modello a tre azioni della spec MCP, adattato):

```
                    ┌──────────────► answered   (l'utente ha inviato le risposte)
pending ────────────┼──────────────► declined   (rifiuto esplicito: "salta / decidi tu")
 (in attesa)        ├──────────────► cancelled  (annullata: turno interrotto, dialog chiuso)
                    └──────────────► expired    (timeout scaduto)
```

- **accept** = «submit/OK» → le risposte tornano al modello come dato strutturato.
- **decline** = «rifiuto esplicito» → il modello prosegue con il proprio giudizio (Pydantic:
  «The user declined to answer. Continue without the answer, or ask differently if it is
  essential»).
- **cancel** = «dismissione senza scelta» (Esc, chiusura, turno interrotto) → per MCP il server
  «should prompt again later»; nella pratica qui vale come *nessuna risposta immediata*).
- **expired** = nessuno ha risposto entro il timeout → come `no_answer`: si prosegue con il
  miglior giudizio, **dichiarando l'assunzione**.

Ogni esito è **esplicito** nel risultato del tool: è ciò che evita il fallimento peggiore, cioè
un modello che crede di aver ricevuto una risposta che nessuno ha dato.

---

## 4. Timeout, assenza di risposta, assenza di client

- **Default 900 s**, con clamp **30–3600 s** e possibilità per il modello di chiedere un tempo
  diverso ([OpenClaw](https://docs.openclaw.ai/tools/ask-user)).
- «A pending question does not extend an explicit run budget»: l'attesa non allunga il budget del
  turno.
- Alla scadenza l'interfaccia **smette di proporre la domanda** e ne mostra l'esito; il tool
  ritorna `no_answer`.
- L'interruzione del turno (**abort**) **annulla** le domande pendenti: nessuna promessa appesa.
- Se non c'è alcun client collegato (nessuna scheda aperta) la domanda resta in attesa fino al
  timeout: è il caso reale "telefono in tasca", quindi il time-out non è un dettaglio ma la
  garanzia che il turno si concluda comunque.

---

## 5. UX della domanda in chat

Progettazione raccolta dalle fonti + dai vincoli della dashboard:

1. **Nel punto del turno, non in fondo.** Come per le card dei tool: il messaggio che sta
   scrivendo l'agente contiene la domanda *dove* è stata posta; il testo che segue si accoda sotto.
   (La dashboard ha già risolto questo problema per i tool: stesso meccanismo, nessuna vista nuova.)
2. **Una domanda alla volta vs form unico.** Le fonti di form design documentano entrambi i
   pattern: lo stepper riduce il carico cognitivo sui questionari lunghi, il form unico è più
   rapido per 1–3 domande. Decisione: **form unico compattissimo per 1–4 domande** (tutte visibili,
   ognuna con le sue opzioni), ognuna rispondibile in pochi tocchi; niente procedura a passi per
   questionari brevi, perché in chat la domanda è già "una schermata".
3. **Scelte rapide e touch-friendly**: opzioni come bersagli ≥44 px, selezionabili con un tocco,
   stato selezionato visibile, `multiSelect` con caselle, campo libero sempre disponibile.
4. **Composer libero**: mentre la domanda è in attesa l'utente può comunque scrivere (nella
   dashboard l'input resta; l'attesa non blocca l'interfaccia).
5. **Conto alla rovescia visibile** e stato «in attesa di te»: l'utente deve sapere che il turno
   è sospeso su di lui, non che la dashboard è bloccata (è il difetto tipico delle UI che
   "sembrano appese").
6. **Alla risoluzione si conserva il riepilogo**, non si cancella nulla: domanda + risposta
   scelta (in forma compatta) restano nel transcript. Anche gli esiti negativi conservano la
   formulazione della domanda: «Skipped or expired questions keep their wording alongside the
   outcome» ([OpenClaw](https://docs.openclaw.ai/tools/ask-user)).
7. **Reload / riconnessione / cambio scheda**: la domanda in attesa **riappare** — OpenClaw lo fa
   esplicitamente per la UI web e la TUI («restores pending questions for the selected session
   after reconnecting or switching sessions»). Da noi: la GET `/api/state` e lo snapshot iniziale
   SSE ripubblicano le domande pendenti, e gli eventi SSE usano lo stesso id, quindi la resa è
   idempotente.
8. **Degrado a testo**: se una superficie non ha UI ricca, la domanda si legge e si risponde a
   parole. Il nostro caso: il modello vede comunque il risultato strutturato; se la risposta
   arriva come testo libero viene accettata come "Altro".
9. **Niente schermate che rubano il focus**: la card appare dentro il flusso, non come dialog
   modale; nessun blocco della navigazione (l'utente può cambiare chat o guardare i file).

---

## 6. Robustezza: cosa si rompe davvero

Dalla pratica (segnalazioni di altri harness, e dai difetti già visti in questa dashboard):

| Guasto | Rimedio adottato |
|---|---|
| risposta persa per un reload mentre la domanda è in attesa | la domanda vive **sul server** (pendente in memoria + log su disco), il client la ricostruisce dallo stato |
| doppio invio (doppio clic, retry di rete) | idempotenza per id: la seconda risposta a una domanda già risolta è **409/«già risolta»**, non un doppio esito |
| turno interrotto mentre la domanda è in attesa | `/api/abort` annulla le pendenti → il tool ritorna `cancelled` |
| **modifica/rigenera** che riavvolge l'albero della sessione | la domanda pendente di quel turno viene annullata dal nuovo turno; il vecchio ramo resta nel JSONL |
| riavvio del servizio con domande pendenti | all'avvio le domande rimaste senza esito nel log vengono marcate **`expired` (riavvio del processo)**: nessuna card resta "in attesa" per sempre |
| revisore che vuole sapere cosa è stato chiesto | **log append-only** `ask-log.jsonl` (domanda, risposte, esito, durata, sessione) |
| risposta enorme incollata dall'utente | troncamento a lato server (limite per risposta e per campo) |
| domanda posta mentre nessuno guarda | timeout con esito `expired` e conto alla rovescia in UI |

---

## 7. Sicurezza

1. **Tutto ciò che scrive l'utente è non fidato.** Lunghezze massime, rimozione dei caratteri di
   controllo, rendering come **testo** (mai `innerHTML`): è la stessa lezione di Pydantic («an
   escape sequence in a prompt-injected call is an attack»).
2. **Anche la domanda è non fidata**: il testo che arriva dal modello viene sanificato prima di
   essere mostrato e prima di finire nel log.
3. **Niente segreti**: la spec MCP *vieta* la raccolta di password/API key in form mode. Il tool
   **rifiuta** le domande che chiedono credenziali, indicando la strada corretta (file `.env`,
   gestore di segreti) — un rifiuto esplicito è meglio di un fallimento silenzioso.
4. **Niente URL cliccabili** dentro i questionari (MCP: *SHOULD NOT*) né contenuti attivi: solo testo.
5. **Associazione allo stato giusto**: si accettano risposte **solo per id pendenti** di quella
   sessione; l'autenticazione è già quella della dashboard (Basic auth + HTTPS + rate-limit),
   quindi non si apre nessuna superficie nuova.
6. **Limiti come controllo di costo**: numero di domande/opzioni e lunghezze sono anche una difesa
   contro il *prompt injection* che tenta di far generare form enormi o di far raccogliere dati.

---

## 8. Anti-pattern da evitare (checklist)

- ❌ chiedere ciò che si può leggere da soli (file, contesto, cronologia);
- ❌ chiedere conferma di procedere / approvare il proprio piano con questo tool;
- ❌ più di 4 domande; domande aperte senza opzioni quando le opzioni esistono;
- ❌ opzione "Altro" scritta dall'agente (duplicata dal client);
- ❌ domanda in fondo alla chat, staccata dal turno, o in un dialog modale che blocca tutto;
- ❌ attesa infinita senza timeout né indicatore;
- ❌ far sparire la domanda e la risposta dopo la risoluzione (perdita di tracciabilità);
- ❌ credere a una risposta che non è arrivata (assenza di esito esplicito);
- ❌ raccogliere credenziali in un form in chat;
- ❌ rendere il testo dell'utente come HTML.

---

## 9. Decisioni concrete per Universalis Harness

### 9.1 Tool `ask_user`

Nome: **`ask_user`** (coerente con gli altri tool: `read`, `bash`, `write`, `browser`).
Registrato dall'estensione inline `media/ask-tool.mjs` accanto a `media-guard` e `browser-tool`.

Schema (argomenti):

```jsonc
{
  "context": "perché sto chiedendo (una riga, facoltativa)",
  "questions": [                       // 1..4
    {
      "id": "deploy_target",           // snake_case, facoltativo: default = header normalizzato
      "header": "Ambiente",            // ≤ 24 caratteri
      "question": "Su quale ambiente devo pubblicare?",   // ≤ 400 caratteri
      "options": [                     // 2..6
        { "label": "Staging (consigliata)", "description": "…" },
        { "label": "Produzione", "description": "…" }
      ],
      "multiSelect": false             // facoltativo
    }
  ],
  "timeoutSeconds": 900                // facoltativo, clamp 30..3600
}
```

Esito (JSON nel risultato del tool, più una riga leggibile):

```jsonc
{ "status": "answered",     // answered | declined | cancelled | expired
  "answers": [ { "id": "deploy_target", "header": "Ambiente",
                 "selected": ["Staging (consigliata)"], "other": null, "skipped": false } ] }
```

Regole: nessuna opzione "Altro" autorata (la aggiunge la UI); rifiuto motivato se la domanda
chiede credenziali; errore di validazione leggibile (retry) se fuori dai limiti.

### 9.2 Server

- **`media/ask-broker.mjs`** — nessuna dipendenza: registro delle domande pendenti, sanitizzazione
  e validazione, timeout, annullamento, log append-only `media/ask-log.jsonl` (in
  `DASH_MEDIA_DIR`), marcatura degli orfani all'avvio.
- **Endpoint**: `POST /api/ask/respond` `{ id, action: "accept"|"decline"|"cancel", answers? }`.
- **Stato**: `GET /api/state` e primo evento SSE includono `ask: { pending: […], resolved: […] }`.
- **Eventi SSE**: `ask_request` (domanda posta) e `ask_resolved` (esito), con lo stesso id del
  `toolCallId` → correlazione diretta con la card del messaggio.
- **`POST /api/abort`** annulla le pendenti; un nuovo turno chiude le eventuali pendenti residue.
- **`POST /api/prompt`** con domanda pendente → 409 con messaggio che indica di rispondere dalla card.

### 9.3 Interfaccia

- card `.ask` **dentro il messaggio in corso** (o dentro il blocco del tool, al reload);
- una sezione per domanda: header, testo, opzioni (radio/checkbox) con descrizione, campo
  「Altro」 sempre presente, pulsanti **Invia risposte** e **Salta / decidi tu**;
- conto alla rovescia; stato esplicito (`risposto`, `declinato`, `annullato`, `tempo scaduto`);
- a risoluzione: opzioni disabilitate, riepilogo compatto domanda → risposta;
- touch target ≥ 44 px, tastiera (Tab/frecce/Invio), nessun `innerHTML` sul testo dell'utente.

### 9.4 Prompting

- la **descrizione del tool** contiene la regola "quando chiedere / quando no" (è il canale più
  affidabile, perché vive accanto alla definizione del tool);
- una breve sezione **`## Domande all'utente`** nel system prompt della dashboard richiama la
  soglia e i divieti (niente domande di comodo, niente segreti, dopo un rifiuto si procede
  dichiarando le assunzioni).

### 9.5 Test previsti

| Test | Cosa verifica |
|---|---|
| `media/test-ask.mjs` (unità) | sanificazione e validazione, cicli accept/decline/cancel/expired, idempotenza, annullamento, orfani all'avvio, log |
| `media/test-ask-live.mjs` (end-to-end, richiede il modello) | turno reale: l'agente chiama `ask_user`, il client risponde via API, il turno riprende e usa la risposta |
| `media/test-ask-browser.mjs` (browser vero) | la card appare nel punto giusto, si risponde con clic reali, l'esito si vede, la chat riprende, il reload ricostruisce domanda+risposta |

---

## Fonti

| # | Fonte | Cosa se ne ricava |
|---|---|---|
| 1 | [MCP — Elicitation (spec 2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation) | modello a tre azioni accept/decline/cancel; schema *flat* di soli primitivi; `message` che spiega perché; divieto di dati sensibili in form mode; obbligo di gestire declino/annullamento; niente URL cliccabili nei form |
| 2 | [Claude Code — anatomia del prompt di `AskUserQuestion`](https://ccprompts.info/prompts/tool/tool-ask-user) | "Other" sempre disponibile e non autorato; `multiSelect` esplicito; opzione consigliata per prima con suffisso *(Recommended)*; preview opzionale per confronti visivi; non usarlo per approvare piani |
| 3 | [Claude Code — User input (Agent SDK)](https://code.claude.com/docs/en/agent-sdk/user-input) | il client presenta le domande generate dal modello e restituisce le selezioni (separazione modello/UI) |
| 4 | [OpenClaw — `ask_user`](https://docs.openclaw.ai/tools/ask-user) | schema 1–3 domande, header ≤12, 2–4 opzioni; timeout 900 s clamp 30–3600; esito `no_answer` → si prosegue con il miglior giudizio; "Other" automatico; skip; ripristino delle domande pendenti dopo riconnessione; riepilogo conservato anche per le domande saltate/scadute; niente credenziali |
| 5 | [Pydantic AI Harness — Ask User](https://pydantic.dev/docs/ai/harness/ask-user/) | 1–10 domande, 2–6 opzioni, header ≤25, label ≤50, description ≤200; validazione *strict* con retry di validazione; nessun carattere di controllo; `cancelled=True` come esito; batch di domande correlate; il run resta in attesa dentro la chiamata al tool |
| 6 | [Ginger Labs — When Should an Agent Ask a Clarifying Question vs Proceed Safely?](https://gingerlabs.ai/blog/when-should-an-agent-ask-a-clarifying-question-vs-proceed-safely) | euristica dei quattro criteri (bersaglio, autorità, evidenza, conseguenza); «reduce uncertainty through safe investigation, not by taking a consequential action»; chiarimento/conferma/escalation; regole di stop; stato durevole per riprendere dopo una domanda |
| 7 | [OpenAI — GPT‑5.2 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5-2_prompting_guide) | davanti all'ambiguità: dichiararla e fare **1–3** domande precise *oppure* presentare 2–3 interpretazioni |
| 8 | [OpenAI — GPT‑5 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/gpt-5_prompting_guide) | l'opposto: come *ridurre* le domande di chiarimento quando serve autonomia (utile per calibrare la soglia) |
| 9 | [FormGen — Conversational vs Traditional Forms](https://www.formgen.ai/blog/conversational-vs-traditional-forms) · [Promptly — Multi-Step Form Best Practices](https://promptlyforms.com/blog/multi-step-form-best-practices) | una domanda alla volta vs form unico: quando conviene ciascuno (questionari lunghi vs brevi) |
| 10 | [Jotform — Conversational form design](https://www.jotform.com/blog/conversational-form-design/) · [Chatbotscape — Multi-Turn Chatbot Forms](https://chatbotscape.com/academy/multi-turn-form-design) | linguaggio naturale, campi obbligatori minimi, progresso visibile, stato esplicito che non si perde fra i turni |
| 11 | [Ably — Resumable token streaming](https://ably.com/blog/token-streaming-for-ai-ux) · [Limerence — Durable streaming for AI chats](https://limerence.sh/blog/durable-streaming-for-ai-chats) | lo stream appartiene al *turno*, non alla connessione: reload/riconnessione non devono perdere né duplicare (qui: la domanda pendente ripubblicata dallo stato) |
| 12 | [Microsoft/Azure — Building AI Agents That Wait For Humans](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/building-ai-agents-that-wait-for-humans/4496310) · [Helix — Interrupt and Resume](https://agents.open-source.onhelix.ai/guide/interrupt-resume) | attese lunghe fra umano e agente: stato persistito, ripresa esplicita, interruzione che non perde il lavoro |
| 13 | [tianpan.co — The Interrupt UI That Taught Your Users to Never Interrupt the Agent](https://tianpan.co/blog/2026/06/02/the-interrupt-ui-that-taught-your-users-to-never-interrupt-the-agent) | l'interruzione deve essere innocua e trasparente: ⏹ non deve distruggere il contesto (qui: annulla la domanda e conserva il parziale) |
