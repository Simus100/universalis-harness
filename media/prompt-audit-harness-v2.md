# Prompt «Audit Harness» v2 — versione migliorata e pronta all'uso

> Cosa c'è in questo file: (1) diagnosi del prompt originale, (2) il prompt v2 da copiare,
> (3) due varianti (audit rapido, harness di terzi), (4) come usarlo su questo harness.
> Ancore di default compilate per l'harness di `/root/pi-harness` (dashboard.mjs ~6.600 righe,
> dashboard.html ~12.900 righe, `skills/`, `scripts/`, `sessions/`, `media/`, `docs/`):
> per usarlo su un altro sistema basta cambiare il blocco «0. ANCORE».

---

## 1. Perché il prompt originale produceva un report generico

| # | Difetto del prompt | Effetto in pratica |
|---|---|---|
| 1 | «Analizza il codice/sistema attuale» senza dire **dove** sta né **come** accedervi | il modello inventa o resta sul generico; metà del report non riguarda il tuo sistema |
| 2 | Nessun obbligo di **ancorare le affermazioni** (`file:riga`) | affermazioni plausibili e false: costano più di un buco dichiarato |
| 3 | Nessuna regola sul **divieto di inventare numeri** (token, latenze, costi) | tabelle con percentuali decorative indistinguibili da misure |
| 4 | Tre consegne pesanti (report + dashboard + summary) **senza budget né formato** | terzo deliverable sempre debole: la dashboard diventa un mockup statico |
| 5 | «Dashboard interattiva» **senza contratto** (single-file? offline? dati reali? dove si salva?) | dipendenze CDN, dati finti non dichiarati, file nel posto sbagliato |
| 6 | Ricerca web «sulle best practice» **non informata dalla diagnosi** | si cercano mode del momento invece dei colli di bottiglia trovati |
| 7 | Nessuna richiesta di **URL + data** per ogni fonte | repo citati a memoria, alcuni inesistenti o archiviati |
| 8 | I tre livelli (Prompt/Context/Harness) sono uno **slogan**, non una griglia | i contenuti si sovrappongono e il report ripete tre volte le stesse cose |
| 9 | Manca la **fase di misura**: nessuna metrica, nessun «come sapremo che è meglio» | il To-Be non è verificabile né difendibile |
| 10 | Manca il **cosa NON fare** e la **Definition of Done** | refactor non richiesti, oppure lavoro che non finisce mai |
| 11 | Manca l'ordine di esecuzione e la **dichiarazione di copertura** | su un sistema grande il modello legge il 5% e generalizza al 100% |
| 12 | Nessuna richiesta di dire **cosa funziona già bene** | lista di criticità generica e demolitoria, poco utile a chi deve decidere |

---

## 2. Il prompt v2 (incolla questo)

```text
RUOLO
Agisci come Senior AI Systems Architect e revisore critico di harness agentici.
Non sei un consulente compiacente: se un pezzo non regge lo dici, e se non hai potuto
verificarlo lo dichiari invece di riempire il buco. Scrivi in italiano.

OBIETTIVO
Produrre un audit verificabile del ciclo di funzionamento del sistema indicato nelle ANCORE,
mappato su tre livelli — PROMPT ENGINEERING → CONTEXT ENGINEERING → HARNESS ENGINEERING —
seguito da una ricerca web mirata sullo stato dell'arte e da una proposta To-Be implementabile,
più due artefatti: una dashboard interattiva con simulatore e una sintesi esecutiva.

0. ANCORE (input)
- Sistema: /root/pi-harness — harness agentico self-hosted.
- Codice: dashboard.mjs (~6.600 righe, server + logica), dashboard.html (~12.900 righe, UI),
  harness.mjs, scripts/, skills/ (28 skill in Markdown), docs/, README.md.
- Stato e dati: sessions/ (trascrizioni), media/ (artefatti), memoria dell'harness (episodi/indice/grafo/wiki).
- Runtime: Node su Linux, nessuna GPU; feature locali opzionali (decisore tipizzato, modello di previsione).
- Vincoli: NON modificare codice in questa fase (audit read-only). Nessun dato personale finisca nei deliverable.
- Se un file non è leggibile: scrivi «NON ACCESSIBILE» e prosegui. Non dedurre il contenuto.

1. REGOLE DI INGAGGIO (non negoziabili)
R1. Ogni affermazione sullo stato attuale porta un'ancora: `path:riga` oppure `[NON VERIFICATO]`.
R2. Distingui sempre e visivamente: FATTO (ancorato) / INFERENZA (motivata) / RACCOMANDAZIONE.
R3. Nessun numero inventato. Ogni metrica è MISURATA (con lo strumento e il comando usato) oppure STIMATA
    (con l'assunzione esplicita). Mai una percentuale senza una delle due etichette.
R4. Dichiarazione di copertura in testa al report: cosa hai letto per intero, cosa hai campionato,
    cosa hai escluso e perché.
R5. Fonti web: URL + titolo + data di consultazione. Se non riesci a verificare una fonte, la togli
    invece di citarla a memoria. Preferisci doc ufficiali, repo con attività recente, paper; scarta i blog SEO.
R6. Prima di iniziare, fai al massimo 3 domande, solo se una risposta cambierebbe l'esito.
    Altrimenti procedi e dichiara le assunzioni in una riga ciascuna.
R7. Il report deve stare nel budget indicato: denso, non lungo. Meglio una tabella che tre paragrafi.

2. GRIGLIA DEI TRE LIVELLI (usala per assegnare, non per fare poesia)
Test di assegnazione — a parità degli altri due livelli:
- PROMPT: cambia ciò che il modello deve fare. System prompt, template, few-shot, schemi di output,
  delimitatori, versionamento delle istruzioni, resistenza al prompt injection contenutistico.
- CONTEXT: cambia ciò che il modello vede, a parità di istruzione. Raccolta e filtro dello stato,
  memoria, RAG, output dei tool, compressione/riassunto, ordinamento, budget di token, caching,
  isolamento del contesto nei sub-agent, «lost in the middle».
- HARNESS: cambia come il sistema si comporta attorno al modello, a parità di prompt e contesto.
  Loop di esecuzione, routing, retry/fallback, validazione e parsing dell'output, guardrail,
  gestione dello stato, sandboxing, osservabilità/telemetria, valutazione, controllo di costo, umano nel loop.
Se una cosa sta in due livelli, mettila dove la sua rimozione ha l'effetto maggiore e dillo.

3. FASE A — MAPPA DEL CICLO REALE (as-is)
Scegli UNA richiesta realmente avvenuta (dai log o da una sessione in sessions/) e tracciala end-to-end.
Elenca i passi in una tabella: n° | azione | cosa entra nel contesto | token stimati cumulati |
chiamate al modello | decisioni | esiti/errori possibili | ancora.
Poi disegna il flusso (mermaid o ASCII) e, per OGNI pilastro, compila schede omogenee:
Meccanismo com'è oggi · Evidenza (path:riga) · Cosa funziona bene · Fragilità · Severità S1-S4.
Chiudi con «cosa il sistema fa già bene» (minimo 3 voci): serve a non demolire ciò che va tenuto.

4. FASE B — REGISTRO DELLE CRITICITÀ
Tabella con ID: tipo (collo di bottiglia / single point of failure / spreco di contesto /
limite architetturale / rischio sicurezza / debito di osservabilità / costo) · sintomo osservabile ·
causa · conseguenza se non risolta · costo di fix S/M/L · confidenza alta/media/bassa · ancora.
Ordina per rapporto impatto/costo. Le S1/S2 diventano l'agenda della ricerca web.

5. FASE C — RICERCA WEB (informata dalla diagnosi, non generica)
Per ogni criticità S1/S2 cerca soluzioni reali. Copertura minima delle piste, poi aggiungi quelle che trovi:
context compaction e summarization gerarchica · prompt caching e riuso del prefisso/KV ·
isolamento del contesto nei sub-agent · structured output e decoding vincolato ·
routing deterministico vs autonomia · loop auto-correttivi (verifier/critic, self-healing) ·
sandboxing dell'esecuzione · eval harness e regression gating · osservabilità con standard aperti ·
memoria a livelli (working/episodica/semantica) · design dei tool e protocolli di tool-use ·
guardrail e difesa dalla prompt injection (anche indiretta, via contenuti e tool).
Per ogni soluzione una scheda breve: cosa fa · evidenza che funziona · costo di adozione ·
maturità/licenza · alternativa più semplice · a quale criticità risponde · URL + data.
Regola: se il problema si risolve con 20 righe di codice, non proporre un framework.

6. FASE D — TO-BE
Architettura target a diff minimo: cosa si sostituisce, cosa si aggiunge, cosa si elimina.
Per ogni intervento: criticità risolta · file toccati · pattern concreto con pseudocodice o diff ·
metrica di successo e come misurarla oggi · rischio di regressione.
Metriche minime da coprire: token per richiesta · passi per task · tasso di successo ·
latenza p50/p95 · costo per task · tasso di errori di formato · retry rate · tempo di recupero da errore.

7. FASE E — DELIVERABLE
D1 REPORT TECNICO (max 2.500 parole + tabelle), sezioni fisse:
copertura · mappa as-is · tre pilastri · criticità · evidenze dalla ricerca · architettura To-Be ·
metriche e piano di misura · rischi · cosa NON cambiare.
D2 DASHBOARD INTERATTIVA — un SINGOLO file HTML autonomo, nessuna CDN e nessuna rete,
funziona aperto da file://, nessun dato personale. Deve contenere:
  a) la mappa dell'architettura ricavata dall'audit reale (nodi, archi, etichette dei tre livelli);
  b) un SIMULATORE del ciclo: si sceglie uno scenario (richiesta semplice / tool call /
     errore con retry e auto-correzione / contesto quasi saturo), si sceglie il profilo
     Attuale oppure Ottimizzato, e si avanza passo-passo o in play;
     a schermo in tempo reale: timeline dei passi, cosa è stato aggiunto al contesto,
     barra di saturazione del contesto, contatore token/costi/chiamate, log eventi, esito finale;
  c) i parametri dei due profili in un JSON visibile e modificabile (context budget, politica di
     compressione, retry, cache, validazione): il confronto deve essere trasparente, non magico;
  d) pannello di confronto Attuale vs Ottimizzato con le metriche affiancate
     e la scritta esplicita «valori simulati con queste assunzioni, non misure».
  Salva in /root/pi-harness/media/ e dimmi il percorso e come aprirla.
D3 EXECUTIVE SUMMARY (una schermata): tabella Criticità attuale → Soluzione SOTA individuata →
Impatto atteso (con confidenza) · roadmap a 3 orizzonti (lunedì / questa settimana / questo mese)
con dipendenze e costo · «le 3 cose da fare per prime» · «cosa NON fare adesso».

8. DEFINITION OF DONE (verifica tu stesso prima di rispondere)
[ ] ogni riga dell'as-is ha un'ancora o un [NON VERIFICATO]
[ ] copertura dichiarata e onesta
[ ] ogni metrica è MISURATA o STIMATA con assunzione
[ ] ogni criticità ha severità, costo di fix e confidenza
[ ] ogni soluzione proposta ha URL verificato e risponde a una criticità con ID
[ ] il To-Be tocca file reali e indica i file toccati
[ ] la dashboard si apre offline e la simulazione cambia davvero risultato fra i due profili
[ ] la summary sta in una schermata e contiene una priorità, non un elenco
[ ] nessun segreto, nessun dato personale nei deliverable

9. ORDINE DI ESECUZIONE
leggi → mappa il ciclo reale → diagnosi → ricerca (guidata dagli S1/S2) → To-Be →
fissa i parametri dei due profili → dashboard → summary.
Scrivi «CHECKPOINT n: …» dopo ogni fase, in una riga. Non produrre la dashboard prima della diagnosi.

10. COSA NON FARE
- non riscrivere il sistema: proponi il diff minimo
- non inventare metriche, file, righe, repo o date
- non proporre un framework dove basta una funzione
- non toccare codice di produzione in questa fase
- non usare immagini decorative o «AI slop» visivo: la dashboard deve informare, non abbellire
- non ripetere gli stessi contenuti nei tre livelli
```

---

## 3. Varianti

**V-A · Audit rapido (30-45 min, sola diagnosi).** Tieni RUOLO, ANCORE, REGOLE R1-R4, GRIGLIA e FASE A-B.
Sostituisci FASE C-E con: «per le 5 criticità S1/S2 cerca SOLO la soluzione SOTA più adottata e cita 2 fonti
verificate; niente dashboard. Output: una tabella di 5 righe + le 3 cose da fare per prime».

**V-B · Harness di terzi (repo pubblico, nessun runtime).** Togli la richiesta di tracciare una richiesta reale
(dai log) e sostituisci la FASE A con: «ricostruisci il ciclo leggendo entry point, loop agentico e gestione
del contesto; dichiara esplicitamente che il comportamento a runtime non è osservato e che le inferenze sono
inferenze». Aggiungi: «misura la maturità del repo: ultimo commit, attività, licenza, test presenti» con URL.

**V-C · Solo la dashboard, a partire da un audit già fatto.** Incolla il report come input e tieni solo
FASE E/D2 + la DoD: la simulazione deve usare i parametri e le criticità del report, non inventarne altri.

---

## 4. Come usarlo su questo harness

1. Incolla il prompt così com'è: il blocco ANCORE è già compilato per `/root/pi-harness`.
2. Se vuoi limitare il costo, aggiungi dopo ANCORE: «leggi prima README.md, todo.md, docs/ e l'indice delle
   skill; poi scendi nel codice solo dove serve a rispondere a una domanda dell'audit».
3. Il file della dashboard chiedilo in `media/` (nome consigliato `media/harness-audit-dashboard.html`).
4. Se ti serve anche un ordine di grandezza dei costi reali, chiedi esplicitamente che i token per richiesta
   siano MISURATI su una sessione in `sessions/`, altrimenti resteranno stime dichiarate.
