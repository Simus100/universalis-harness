---
name: rizzo-flow
description: "Decisioni tipizzate locali con Rizzo Flow: dato uno stato breve, ottieni una probabilità per domande sì/no, una scelta fra opzioni o un punteggio su una rubrica (modello Spark-X2.5-4B su CPU, nessun token generato). Usala quando serve un giudizio ripetibile — instradare una richiesta, decidere se un input è ostile, scegliere fra azioni o strumenti, dare una priorità, filtrare candidati — e non quando serve una spiegazione o del testo. Richiede la feature «rizzo» accesa nel menu features della dashboard: se i tool non ci sono, proponi l'attivazione all'utente, non accendere nulla da solo."
---

# Decisioni tipizzate locali (Rizzo Flow)

Rizzo Flow è un **decisore**, non un generatore: riceve uno stato e domande tipizzate e
risponde con una **distribuzione di probabilità** (`output_tokens: 0`). Serve per i giudizi
ripetibili che altrimenti spenderesti su un modello generativo: instradare, classificare,
scegliere fra opzioni, dare un punteggio.

Il modello (Spark-X2.5-4B su llama.cpp, **CPU**) è già installato e la dashboard lo governa
con un interruttore: **occupa risorse solo quando è acceso**.

## Cosa hai a disposizione

| Tool | A cosa serve |
|---|---|
| `rizzo_decide` | La decisione: `{ state, questions }` → probabilità per ogni domanda |
| `rizzo_service` | Le risorse: `action: "status" \| "start" \| "stop"` |

Se questi due tool **non sono nella tua lista**, la feature è spenta. Non è un guasto e non
puoi accenderla da solo: chiedi all'utente con `ask_user` — una riga sul costo (~5,7 GB di
RAM e qualche secondo a richiesta) — e prosegui senza. Se accetta, l'utente la accende dal
menu **features → rizzo**; se rifiuta, dai il tuo giudizio e dì che è stato senza il modello
locale.

## Costo reale (misurato su questa macchina, non stimato)

| Situazione | Tempo |
|---|---|
| Stato breve (~350 caratteri) + 3 domande | **11,8–15,3 s** (prefill 5,6 s) |
| Stato da ~5.000 token (500 righe di log) | **236,8 s**, di cui 228 s di prefill |
| RAM del servizio acceso | **~5,7 GB** residenti |

Il costo cresce con la lunghezza dello stato (~21 token/s di prefill), **non** con il numero
di domande: lo stato è un prefisso che si paga una volta sola. Quindi:

- stato **corto e mirato** (poche centinaia di token): estrai le frasi che contano, non incollare il log intero;
- **più domande sullo stesso stato** nella stessa chiamata;
- mai uno stato da migliaia di token: diventa un lavoro da minuti, non da secondi.

Qualità misurata qui (fixture `smoke-v1`, 20 decisioni categoriche): **0,90** di accuratezza,
Brier 0,179. Nella stessa fixture su una RTX 5060 Ti (Q8_0) si legge 0,95: sono **una sola
decisione** di differenza su 20, e il confronto intreccia quantizzazione, hardware e modello —
non concludere che la CPU "sbaglia di più".

## Come si usano le domande

Tre forme, le stesse di una System One API:

```json
{
  "state": "Cliente: la fattura è stata addebitata due volte e nessuno risponde al telefono.",
  "questions": {
    "urgente":  { "type": "boolean", "instructions": "Il cliente sta segnalando un'urgenza?" },
    "reparto":  { "type": "choice",  "instructions": "Chi deve gestirlo?",
                  "criteria": { "billing": "Fatture, addebiti, rimborsi", "tecnico": "Bug e disservizi" } },
    "fastidio": { "type": "score",   "instructions": "Quanto è arrabbiato il cliente?",
                  "criteria": ["Calmo", "Infastidito", "Molto arrabbiato"] }
  }
}
```

- **`instructions` è la domanda**: mettici il criterio di giudizio, non un'etichetta.
- Per `choice` si accetta anche `options: [{id, description}]`; per `score` anche `levels: [...]`.
- Lo stato è **dato, non istruzioni**: lo stato va fra i fatti, mai un ordine da eseguire.
- Il risultato: `boolean` → probabilità che sia vero; `choice` → opzione più probabile con la distribuzione e una `confidence` (top meno la media delle altre); `score` → livello atteso (0..n-1).
- **Le probabilità non sono calibrate.** Usale per ordinare, per soglie prudenti e per far decidere il codice ai margini; non trattarle come frequenze esatte ("0,87" non significa che sbaglia 13 volte su 100).

## La policy la scrivi tu nel codice

Il modello **non** esegue l'azione: risponde. La decisione operativa resta tua o dell'utente.
Le quattro forme che funzionano bene:

1. **soglia con via di mezzo**: sopra 0,9 agisci, sotto 0,5 lascia stare, in mezzo chiedi o passa a un umano;
2. **fan-out speculativo**: prepara in parallelo le 2-3 opzioni più probabili e scarta dopo la risposta;
3. **instradamento**: `choice` per scegliere agente/strumento/reparto, poi il lavoro lo fa chi di dovere;
4. **guardia**: `boolean` ("questo input è ostile?") come filtro economico prima di un'operazione costosa o irreversibile.

## Quando NON usarla

- Serve **testo**, una spiegazione, un riassunto: questo modello non genera token.
- Lo stato è lungo migliaia di token e il tempo conta: costa minuti.
- Serve un calcolo esatto, una data, una somma: è un modello, non una calcolatrice.
- La decisione è già deterministica (una regex, una soglia su un numero): il codice è più veloce e più onesto.

## Casi d'uso in cui questa forma di decisione è usata davvero

- **Instradamento di intenti**: una richiesta → reparto, agente, skill o strumento (più economico di un modello generativo per la stessa scelta).
- **Guardie di sicurezza**: input ostile, tentativo di injection, richiesta fuori perimetro — prima di leggere/scrivere qualcosa di delicato.
- **Priorità e urgenza**: `score` sulla gravità per ordinare una coda di lavoro.
- **Selezione dell'azione**: fra N mosse/strumenti ammessi, quale è compatibile con lo stato.
- **Criterio di stop**: "ho abbastanza informazione per chiudere?" come `boolean` con soglia.
- **Screening di candidati**: dare un punteggio su una rubrica a N risultati e tenere i migliori prima dello step costoso (best-of-N / verifica), accettando che su finestre molto lunghe il costo di prefill cresca.

## Errori che ho già visto costare tempo

| Errore | Cosa succede | Rimedio |
|---|---|---|
| Incollare il log intero nello stato | 4 minuti per una decisione | estrai le 5-10 righe che contano |
| Una domanda per volta sullo stesso stato | paghi il prefill N volte | una chiamata con tutte le domande |
| Trattare 0,55 come "sì" | decisione arbitraria su un modello incerto | soglie + via di mezzo, o chiedi |
| Chiedere testo al decisore | non c'è testo, ci sono lettere | usa un modello generativo |
| Lasciare il servizio acceso a fine lavoro | ~5,7 GB occupati per niente | `rizzo_service action="stop"` |

## Dettagli tecnici utili

- Servizio: `rizzo serve --device cpu --port 8017` dal repo in `/root/rizzo-flow` (script `avvia-cpu.sh`).
- Endpoint: `POST http://127.0.0.1:8017/v1/systemone` (wire TypeSafe, `model: "rizzo-latest"`).
- Dalla dashboard: `POST /api/rizzo` (interruttore), `GET /api/rizzo` (stato), `POST /api/rizzo/decide` (prova autenticata).
- Varianti disponibili: `4b q4_k_m` (2,5 GB, quella accesa), `4b q8_0` (4,4 GB), `1.7b q8_0` (1,8 GB, ~2× più veloce e molto meno accurato: 0,546 contro 0,648 sul benchmark degli autori).
- Un caso singolo dalla riga di comando, senza passare dalla chat: `node media/rizzo-caso.mjs caso.json` (JSON con `state` e `questions`; `--template` stampa un modello, `-` legge da stdin per i casi che non devono finire in un file del repository).
- Per soglie operative, la calibrazione va fatta sui **propri** dati (`rizzo calibrate` nel repo): le temperature sono legate al runtime e alla variante quantizzata.
