# Timestral nell'harness — previsioni su serie temporali

Stato al **2026-10-24**. Questo documento dice cosa è stato misurato, cosa è stato deciso e
cosa manca. I numeri vengono da misure fatte su questa VPS, non da stime.

## Cos'è

**Timestral** è la famiglia di *time-series foundation model* di Mistral: modelli
pre-addestrati che prevedono serie temporali **zero-shot**, cioè senza addestramento sui
dati dell'utente. Previsione **probabilistica** (21 quantili per passo), **multivariata**
(le variate di una serie previste insieme) e con **covariate** (passate e note nel futuro).
Sito: <https://mistral.ai/news/timestral/> · codice: <https://github.com/mistralai/timestral>
· pesi: <https://huggingface.co/collections/mistralai/timestral>.

- Codice (`timestral`): licenza **Apache 2.0**.
- Pesi (`mistralai/Timestral-*`): licenza **Modified MIT**, con il vincolo di non usarli in
  modo da violare diritti di terzi. I pesi non si ridistribuiscono: si scaricano dall'Hub.
- Gira su **CPU**: nessuna GPU necessaria, ed è la ragione per cui è adatto a questa VPS.

## La taglia scelta (misurata, non stimata)

Banco di prova: `media/timestral-bench.py` su 6 vCPU Broadwell, nessuna GPU, 11 GB di RAM,
`OMP_NUM_THREADS=4`. Latenza con 4 thread; RSS = memoria residente del processo.

| taglia | pesi | RSS di picco | caricamento | giornaliero 1000→30 | 15 min 2016×5→96 | pinball vs naive (USD/EUR) |
|---|---|---|---|---|---|---|
| 5M | 21 MB | 281 MB | 0,35 s | 0,03 s | 0,23 s | **+33,4 %** |
| **28M** | 111 MB | **471 MB** | **0,64 s** | **0,06 s** | **0,37 s** | +29,3 % |
| 123M | 490 MB | 1199 MB | 15,9 s | 0,28 s | 1,23 s | +23,2 % |
| 209M | 837 MB | 1901 MB | 27,0 s | 0,28 s | 1,81 s | +28,3 % |

**Decisione: `28M` come taglia predefinita del servizio**, con `5M` per risposte istantanee e
`209M` selezionabile quando una singola previsione vale 1,9 GB e 27 s di caricamento.

Perché 28M e non 209M: su quattro istanze + Decision_M (5,7 GB quando è accesa) la RAM è la
risorsa scarsa, non la latenza. 28M costa **471 MB** e 60 ms; 209M costa **1,9 GB** e 280 ms
per un guadagno che, sulle due serie reali provate qui, non si vede (anzi: nelle 5 finestre di
backtest il 28M ha fatto meglio del 209M). I benchmark ufficiali dicono il contrario su dati
eterogenei e con contesti lunghi: la conclusione onesta è che **su serie finanziarie singole e
brevi la taglia grande non paga**, e che la scelta va rifatta quando si prevedono molte serie
o serie con covariate.

### Cosa i numeri NON dicono

- Il backtest gira su **5 finestre** di una serie (USD/EUR giornaliero, 2020-2026) e poche di
  BTC: è un'indicazione, non una misura di qualità statistica.
- Sul cambio, il **MAE puntuale del modello è peggiore del naive** (0,0131 contro 0,0118 per il
  28M): il vantaggio è nella *distribuzione* (pinball), non nel centro. Tradotto: il valore
  mediano non batte «domani come oggi», ma l'incertezza dichiarata è più informativa.
- I quantili del modello **non sono calibrati** come frequenze: servono a ordinare e a fissare
  soglie prudenti, non a dire «c'è esattamente il 90 % di probabilità».

## Architettura

```
   4 istanze dell'harness (principale, tester_01, tester_07, tester_08)
        │  HTTP 127.0.0.1:8018 + token condiviso
        ▼
   servizio unico  media/timestral-service.py  (venv /opt/timestral-venv)
        │  un solo modello in RAM per volta, scaricato dopo 15 min di inattività
        ▼
   pesi in cache: /root/.cache/huggingface/hub/models--mistralai--Timestral-*
```

Perché un servizio e non una chiamata per richiesta: i pesi si leggono dal disco e si portano
in RAM (0,64 s per il 28M, 27 s per il 209M). Un processo solo, condiviso, paga la RAM **una
volta** invece di una volta per istanza — e le istanze `tester_07`/`tester_08`, che hanno un
disco da 2 GB e una sandbox, non devono installare torch (886 MB di venv).

### API del servizio (`media/timestral-service.py`)

| rotta | cosa fa |
|---|---|
| `GET /health` | stato: taglia, se il modello è carico, RAM del processo, richieste, ultimo errore |
| `POST /forecast` | `{series:[{name,values}], prediction_length, past_covariates?, known_covariates?}` → mediana, quantili 5/25/75/95, statistiche per serie |
| `POST /model` | `{size:"5M"\|"28M"\|"123M"\|"209M"}` — cambia taglia (scarica e ricarica) |
| `POST /unload` | scarica subito il modello dalla RAM |

Token: `X-Timestral-Token`, letto da `/etc/timestral/token` (creato al primo avvio, `0644`,
perché anche le istanze non privilegiate devono poterlo leggere). Non è un segreto di rete: il
servizio ascolta **solo** su 127.0.0.1 e serve unicamente previsioni.

### Misure del servizio in esercizio

| situazione | RAM | latenza |
|---|---|---|
| processo vivo, modello non caricato | 35 MB | — |
| prima richiesta dopo lo scarico (28M) | 366 MB | 3,2 s (import torch + pesi) |
| richieste successive | 366 MB | 0,08–0,10 s |

Un dettaglio che è costato tempo: con la verifica di aggiornamento online di `huggingface_hub`
la prima richiesta impiegava **2 minuti e 15 s** (rete lenta verso l'Hub, con reset). Il
servizio carica prima con `local_files_only=True` e scende in rete **solo** se i pesi non sono
in cache.

## Piano (fasi)

1. **Motore** — misura taglie, servizio locale con token e scarico da inattività. *(fatto)*
2. **Tool in chat** — `timestral_forecast` dietro feature nel menu «features», con descrizione
   che dichiara costo, natura di stima e quando *non* usarlo. *(in corso)*
3. **Endpoint dashboard** — `/api/timestral` (stato, previsione, serie disponibili) dentro
   l'autenticazione esistente; niente porte nuove esposte da Caddy.
4. **Vista «Previsioni»** — ventaglio dei quantili, statistiche, tabella, export CSV/SVG.
5. **Backtest nella vista** — errore storico contro il naive, così la fiducia si vede prima di
   decidere.
6. **Serie** — 4 demo incluse + CSV caricati dall'utente (la prima versione non chiama API
   esterne: Yahoo risponde 429, Stooq chiede JavaScript).
7. **Deploy** — unità `timestral.service` + copia del codice nelle quattro istanze, verifica
   per istanza.
8. **Skill `timestral` + questo documento + pubblicazione.**

## Rischi e limiti dichiarati

- **Non è una sfera di cristallo.** Il modello non conosce notizie, decisioni di banca
  centrale, eventi: prevede la continuazione statistica della serie. Va scritto dove l'utente
  lo vede, non solo qui.
- **Serie troppo corte o troppo rumorose** (meno di ~50 punti) danno previsioni inutili: il
  tool deve dirlo invece di restituire numeri.
- **La RAM è condivisa** con quattro istanze e con Decision_M: il caricamento di 209M insieme a
  Decision_M porta l'occupazione vicino al tetto (1,9 + 5,7 GB). Lo scarico da inattività è la
  difesa.
- **Licenza dei pesi**: Modified MIT, nessuna ridistribuzione dei pesi nel repository pubblico.
