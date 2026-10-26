# Audit del sistema previsionale — 26 ottobre 2026

Oggetto: la catena che porta un numero di previsione davanti a una persona —
`media/timestral-service.py` (motore) → `media/timestral-client.mjs` (dati e analisi) →
`/api/timestral*` (dashboard) → vista «Previsioni» (`dashboard.html`) → `docs/TIMESTRAL.md`.

Scopo dell'audit: verificare che il sistema **calcoli bene** (contratto, invarianti statistici,
nessuna frode di dati) e che **si capisca** (etichette, unità, coerenza fra ciò che la vista
promette e ciò che l'API restituisce). Non è una recensione del modello: è un controllo del
sistema che lo circonda.

## Come si riesegue (una riga)

```
node media/test-timestral.mjs --integrazione
```

74 controlli in 5 sezioni; esce con codice 1 se uno fallisce. `--integrazione` avvia anche
un'istanza isolata della dashboard (porta 8498) per provare la catena completa come la usa la
vista. Senza `--integrazione` non tocca nulla e non serve autenticazione.

Esito di oggi: **74 controlli, 74 passati, 0 falliti** (alcuni controlli corrispondono a difetti
trovati e corretti durante l'audit: prima delle correzioni il test dava 10 fallimenti).

| sezione | cosa verifica | controlli |
|---|---|---|
| 1 · client: CSV | separatori `,` `;` tab, campi quotati, numeri all'italiana, righe rotte contate, ordine preservato | 12 |
| 1b · client: analisi | pendenza e R² su una retta, cicli veri e falsi, anomalie, valori mancanti, serie troppo corte | 12 |
| 2 · servizio | token, rotte, casi limite, monotonia dei quantili, determinismo, `stats` | 30 |
| 3 · backtest | struttura, `skill` coerente, coperture, **nessun look-ahead** | 7 |
| 4 · coerenza | UI ↔ API ↔ documentazione (campi, rotte, pulsanti citati, glossario, limiti) | 9 |
| 5 · integrazione | dashboard reale → servizio: forecast e backtest con storico, date, `q10/q90`, `stats` | 9 |

## Difetti trovati e corretti

| # | dove | difetto | effetto concreto | gravità |
|---|---|---|---|---|
| 1 | `timestral-service.py` | `prediction_length` letto con `or 30`: uno **0** (o stringa vuota) diventava 30 | una richiesta con orizzonte 0 riceveva 30 passi: numeri che non corrispondevano a quanto chiesto, senza errore | media |
| 2 | `timestral-client.mjs` (parseCsv) | i campi **quotati** venivano spezzati sul separatore | un CSV con `"1.234,56"` dava **1.234** invece di 1234,56 — mille volte più piccolo, in silenzio | alta |
| 3 | `timestral-client.mjs` (spettro) | la DFT non toglieva il **livello** della serie | su una sinusoide di periodo 24 il periodo trovato era **69**; la stagionalità finiva attribuita al periodo sbagliato | alta |
| 4 | `timestral-client.mjs` (ciclo) | autocorrelazione **negativa** (mezzo ciclo) letta come periodo intero | «si ripete ogni 12» su una serie che si ripete ogni 24 (a 12 è rovesciata) | media |
| 5 | `timestral-client.mjs` (ciclo) | autocorrelazione calcolata sulla **serie grezza** | su un prezzo (random walk) risultava «si ripete ogni 7 giorni» con r=0,82: **falso**, era il trend | alta |
| 6 | `timestral-client.mjs` (anomalie) | media mobile sbilanciata + soglia senza tolleranza | su una **retta perfetta** comparivano 5 «valori anomali»: rumore di virgola mobile presentato come anomalia | media |
| 7 | `dashboard.html` (verdetto) | `Number.isFinite(errBasso)` dove `errBasso` è un oggetto | il semaforo di affidabilità **non si accendeva mai**, nemmeno dopo la verifica storica | alta |
| 8 | `dashboard.html` (pulsante) | «affidabilità» rinominato «confronto» senza aggiornare i testi che lo citavano | il pulsante sembrava sparito; i testi mandavano a cercare un nome inesistente | media |
| 9 | `docs/TIMESTRAL.md` | dichiarava «quantili 5/25/75/95» | il servizio ne restituisce **sette** (5/10/25/50/75/90/95): la doc descriveva un'altra API | bassa |
| 10 | `dashboard.html` (grafico) | il ventaglio non era ancorato all'ultimo dato; tre fasce dello stesso verde; attributo SVG non valido | la fascia sembrava nascere dal nulla e le tre fasce erano indistinguibili | media |

Le correzioni 7-10 sono di questa sessione ma successive al primo giro di audit; sono qui perché
riguardano la stessa catena e devono restare coperte dai test.

## Cosa è risultato corretto (verificato, non modificato)

- **Quantili monotoni** a ogni passo, su 120 punti sintetici × 12 passi: 0 incroci. È
  l'invariante che rende leggibile il ventaglio (un *quantile crossing* farebbe sembrare l'80%
  più largo del 95%).
- **Nessun look-ahead nel backtest.** Il test non guarda il codice: stravolge gli ultimi `h`
  valori della serie (il «futuro» della prima prova) e verifica che l'errore del modello
  esploda (osservato: oltre 40×). Se il contesto includesse il futuro, non succederebbe.
- **Determinismo**: la stessa richiesta due volte dà gli stessi numeri. Il grafico non balla al
  ridisegno, e i valori mostrati sono riproducibili.
- **`last_observed`, `stats.median_end`, `q05_end`, `q95_end`, `p_change`, ampiezza banda**:
  coerenti con i quantili da cui derivano (verificato numericamente, non a occhio).
- **Casi limite con messaggio**: serie < 8 punti, orizzonte fuori intervallo, orizzonte non
  numerico, serie con buchi (`null`), token assente o errato (401), corpo mancante.
- **Unità e frequenza**: giorni, ore, mesi, **minuti** (barre da 15 minuti riconosciute come
  tali, finestre «ultimi N passi», etichette `26/10 14:15`).
- **Coerenza UI ↔ API**: tutte le rotte timestral chiamate dal frontend esistono nel server;
  tutti i campi `stats.*` letti dalla vista sono prodotti dal servizio; tutti i pulsanti citati
  nei testi esistono con quel nome; il glossario copre i termini usati.
- **Integrazione completa** (sezione 5): la dashboard restituisce storico, date, `q10/q90`,
  `stats` e i metadati di unità — cioè tutto ciò che il grafico e le card consumano.

## Limiti noti (non sono difetti: sono cose che il sistema non sa)

1. **I quantili non sono calibrati** come frequenze: servono a ordinare gli scenari e a fissare
   soglie prudenti, non a dire «c'è esattamente il 90% di probabilità».
2. **La stima centrale spesso non batte «domani come oggi».** Misurato qui: oro giornaliero
   −10,1% di skill MAE (28M, 3 finestre), oro a 15 minuti −6,6%. Dove il modello è utile è
   l'ampiezza dell'incertezza, non il punto.
3. **La copertura va misurata, non creduta.** Nelle prove di oggi: 80% dichiarato → 77,3%
   osservato sull'oro giornaliero (onesto); 95% dichiarato → 86,4% (coda sottostimata); a 15
   minuti 80% dichiarato → 95,8% (banda troppo larga).
4. **Poche finestre di verifica** (3-5): l'affidabilità è un'indicazione, non una misura. Il
   pulsante «affidabilità» usa 5 fold; servono più origini per stringere il giudizio.
5. **Modello zero-shot da 28M**: non conosce notizie, eventi annunciati, decisioni di politica
   economica. Nessuna delle sue uscite è un consiglio finanziario.

## Le verifiche periodiche

La schedulazione (cosa, con che cadenza, con quale criterio di accettazione) sta nel goal
`previsioni-qualita-statistica` della dashboard: sette verifiche, dal test completo prima di
ogni pubblicazione al riesame trimestrale dei limiti dichiarati.
