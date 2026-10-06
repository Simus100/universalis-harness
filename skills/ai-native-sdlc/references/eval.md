# Verifica: feedback loop ed eval

Due cose diverse, spesso confuse:

- il **feedback loop** gira *durante* il lavoro, in questa sessione, molte volte: è ciò che permette
  all'agente di correggersi da solo prima che una persona guardi;
- l'**eval** gira *fuori* dal lavoro, in un contesto pulito, su casi conservati: è ciò che dice se
  una modifica a una skill, a un prompt o al modello ha peggiorato le cose.

Il feedback loop non sostituisce l'eval: chi ha scritto il codice dà per scontate troppe cose.

## 1. Il feedback loop

**Qui esiste già:** `bash media/test-all.sh` è il comando unico — esce con codice diverso da zero se
qualcosa fallisce, e al suo interno conta dieci blocchi (statici, sintassi, frontmatter delle skill,
UI, stream, domande, API, runtime, non-regressione). Va usato così:

1. **un solo comando**, senza dover conoscere l'ambiente (`bash media/test-all.sh`);
2. **obiettivo misurabile**, non «controlla se funziona»: «tutte le suite verdi», «la suite 3 conta
   una skill in più», «il test nuovo fallisce prima della correzione e passa dopo»;
3. **dopo ogni passo** del piano, non alla fine del lavoro;
4. **prove incollate**: l'output reale, non un riassunto.

Se la zona che stai toccando non è coperta da nessuna suite, quello è il primo lavoro da fare: non
si «verifica a occhio».

### Protocollo dei bug

L'ordine conta: senza il primo passo, la correzione è una scommessa.

1. **Riproduci**: comando e input che manifestano il difetto.
2. **Scrivi prima il test** che lo riproduce, e spiega perché fallisce.
3. **Conferma che fallisce per il motivo giusto** (non per un errore di sintassi del test).
4. Da qui in avanti, **il test è congelato**: si corregge il codice, non il test. Vale la regola
   ferrea della skill: mai toccare un test per far passare un fix. Se il test era sbagliato lo dici
   e lo si corregge *prima*, con il motivo.
5. Correggi finché passa.
6. La prova che il bug è sparito è **un test che prima falliva e ora passa**, più la suite intera
   verde.

### Interfaccia e resa visiva

Per l'interfaccia il ciclo è: implementa → guarda → confronta → correggi, di solito in due o tre
giri. Qui si usano il tool `browser` (Chrome headless) per lo screenshot e `media/test-ui.mjs` per
la logica senza browser. Il confronto è con un riferimento, non con un ricordo: uno screenshot
precedente, un mockup, o la regola scritta nella skill `design-craft`.

### Definizione di «fatto»

Un lavoro è finito quando: il piano è rispettato (o il piano è stato aggiornato), `media/test-all.sh`
è verde e l'output è allegato, le prove sono nel commit o nel messaggio, le decisioni sono in
memoria, e il diff non contiene dati riservati.

## 2. Eval: casi conservati, contesto pulito

Serve a rispondere a una domanda sola: *la modifica che ho appena fatto alla configurazione
dell'agente (skill, README operativo, prompt, guardrail) ha peggiorato il comportamento su casi che
prima andavano bene?*

**Com'è fatta una suite.**

1. **20–50 casi reali** già risolti con esito accettato (all'inizio bastano 5–10). Non inventati:
   presi da lavori veri, con il prompt vero.
2. Ogni caso è un file in `evals/cases/`: il **prompt** × le **verifiche**, cioè condizioni
   controllabili a macchina.

```json
{
  "nome": "costo-cumulato-sessione",
  "origine": "2026-10-06",
  "prompt": "Nella barra di stato mostra il costo cumulato della sessione.",
  "verifiche": [
    "bash media/test-all.sh",
    "git diff --quiet HEAD -- sessions/ backups/",
    "! grep -rInE 'sk-[A-Za-z0-9]{16,}' --exclude-dir=node_modules ."
  ]
}
```

3. **Verifiche meccaniche**: un comando con exit code, non un giudizio. `test-all.sh`, l'assenza di
   file riservati nel diff, il conteggio delle suite, l'esistenza di un artefatto, il fatto che il
   piano sia stato aggiornato quando il codice devia.
4. **Soglia**: `evals/threshold` contiene il pass rate minimo accettato (parti da `0.8`). Se una
   modifica lo fa scendere sotto, si rivede la modifica *prima* di tenerla.
5. **Quando gira**: a ogni modifica di `skills/**`, `README.md` (sezioni operative) o degli script di
   verifica; e a calendario, perché il modello cambia sotto i piedi.

**Come gira qui, senza una CI.** L'agente non può avviare da sé una sessione nuova e pulita — ed è
esattamente la separazione che serve. Quindi il ciclo è:

1. **preparazione automatica**: `bash evals/prepare.sh` mette da parte lo stato, elenca i casi e
   stampa il prompt da usare (l'agente prepara, non esegue);
2. **esecuzione in contesto pulito**: l'utente apre una **sessione nuova** e incolla il prompt del
   caso; nessun suggerimento, nessuna memoria della conversazione precedente;
3. **verifica automatica**: `bash evals/check.sh <caso.json>` esegue le verifiche e dice
   PASS/FAIL;
4. **registrazione**: il risultato entra in `evals/out/` con la data, così il pass rate è una serie
   storica e non un ricordo.

Quando lo streaming di una sessione non interattiva diventerà disponibile, il passo 2 si automatizza
e il resto resta identico: per questo i casi e le verifiche sono già separati dall'esecuzione.

**Da un incidente a un eval.** Ogni volta che qualcosa si rompe in uso reale (un errore che ha
richiesto un riavvio, una skill che ha fatto perdere contesto, un dato pubblicato per sbaglio), il
fix da solo non è la fine: si scrive un caso che avrebbe intercettato quel difetto, e lo si aggiunge
alla suite. È l'unico modo perché la stessa classe di errore non torni.

**Manutenzione.** I casi che li passa qualsiasi cosa non discriminano più: si sostituiscono. Un eval
troppo facile è peggio di nessun eval, perché dà una falsa sicurezza.

## 3. Cosa si verifica in questo repository

| Oggetto | Come si verifica |
|---|---|
| codice (dashboard, moduli in `media/`) | `bash media/test-all.sh` |
| interfaccia e interazione | `media/test-ui.mjs` + screenshot con il tool `browser` |
| skill | `media/check-skills.mjs` (frontmatter valido) + una lettura umana dei riferimenti rotti |
| guardrail di pubblicazione | prova deliberata: un file riservato deve far **abortire** `sync-fine-lavoro.sh` |
| memoria | una ricerca su un fatto noto deve ritrovarlo |
| artefatti di questa skill | `plan.md` esiste, è approvato e i file cambiati corrispondono all'elenco |

**Anti-pattern.** Loop non eseguibile; obiettivi vaghi («verifica che funzioni»); test indeboliti o
saltati per far passare una modifica; verifiche meccaniche lasciate a occhio; casi tarati sul
comportamento sbagliato; incidenti che restano senza eval.
