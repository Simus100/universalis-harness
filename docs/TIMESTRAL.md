# Timestral nell'harness — previsioni su serie temporali

Stato al **2026-10-24**. Questo documento dice cosa è stato misurato, cosa è stato deciso e
cosa manca. I numeri vengono da misure fatte su questa VPS, non da stime.

**Fatto:** motore e servizio (unità `timestral.service`), tool in chat (`timestral_forecast`,
`timestral_series`) con interruttore nel menu «servizi», endpoint `/api/timestral`,
`/api/timestral/forecast`, `/api/timestral/backtest`, upload CSV, 4 serie demo, skill
`timestral`, e la **vista «Previsioni»** (grafico a ventaglio, statistiche, tabella, verifica
storica, export CSV/SVG).
**Fatto anche:** deploy sulle quattro istanze (patch a tre vie, backup dei file toccati, verifica
per istanza) e **permessi selettivi** (`DASH_TIMESTRAL`, `_DEFAULT`, `_LOCK`, `_MAX_UPLOAD_MB`).
**Manca:** niente, salvo il riavvio dell'istanza principale per attivare il codice nei tool
(`bash scripts/restart-dashboard.sh`).

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
| `POST /forecast` | `{series:[{name,values}], prediction_length, mode:"separate"\|"joint", past_covariates?, known_covariates?}` → mediana, quantili **5/10/25/50/75/90/95** (sette livelli: le fasce 80% e 95% della vista si leggono da qui), statistiche per serie (`stats`: mediana finale, q05/q95 finali, ampiezza della banda 80%, P(fine > ultimo), variazione attesa). `prediction_length` è obbligatorio nell'intervallo 1…4096 e vale 30 solo se **assente**: un valore fuori intervallo è un errore, non un default silenzioso. `separate` (default) = una previsione per serie; `joint` = variate di un unico sistema, il modello usa le dipendenze (le covariate valgono solo qui) |
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
2. **Tool in chat** — `timestral_forecast` e `timestral_series` dietro feature nel menu
   «features», con descrizione che dichiara costo, natura di stima e quando *non* usarlo. *(fatto)*
3. **Endpoint dashboard** — `/api/timestral` e `/api/timestral/forecast` dentro
   l'autenticazione esistente; nessuna porta nuova esposta da Caddy. *(fatto)*
4. **Vista «Previsioni»** — ventaglio dei quantili, statistiche, tabella, export CSV/SVG. *(fatto)*
5. **Backtest nella vista** — errore storico contro il naive, così la fiducia si vede prima di
   decidere.
6. **Serie** — 4 demo incluse + CSV caricati dall'utente (la prima versione non chiama API
   esterne: Yahoo risponde 429, Stooq chiede JavaScript). *(fatto)*
7. **Deploy** — unità `timestral.service` *(fatto)* + codice nelle quattro istanze con backup e
   verifica per istanza *(fatto 2026-10-24)* + permessi selettivi per istanza *(fatto)*.
8. **Skill `timestral`** *(fatto)* **+ questo documento** *(fatto)* **+ pubblicazione** *(bloccata:
   il token in `.github-access` risponde 401 — serve un token nuovo)*.

## Permessi per istanza (selettivo)

Sullo stesso server convivono quattro istanze con utenti diversi: la stessa funzione non può
avere gli stessi poteri ovunque. Quattro variabili nel `.env` di **ogni** istanza, lette
all'avvio (cambiarle = riavviare l'istanza):

| variabile | effetto |
|---|---|
| `DASH_TIMESTRAL=off` | feature **assente**: nessun tool, nessuna vista, nessuna rotta (404/400) |
| `DASH_TIMESTRAL_DEFAULT=off` | presente ma **spenta** all'inizio: la accende l'utente |
| `DASH_TIMESTRAL_LOCK=on` | interruttore e taglia **decisi dall'amministratore**: `POST /api/timestral` risponde **403** e la preferenza salvata su disco non conta |
| `DASH_TIMESTRAL_MAX_UPLOAD_MB=n` | tetto per i CSV caricati (**413** oltre): i sottoclienti hanno 2 GB di disco |

Il permesso non vive solo nella UI: con la feature spenta, `/api/timestral/forecast`,
`/api/timestral/backtest` e l'upload rispondono **403** anche a chi chiama l'API direttamente.
Un permesso che si aggira con `curl` non è un permesso.

Configurazione attuale (2026-10-24):

| istanza | utente | stato | perché |
|---|---|---|---|
| principale | `pi` | libera, **accesa** | titolare: decide lui |
| tester_01 | `tester_01` | libera, **accesa** | istanza di prove tecniche, nessun limite |
| tester_07 | `tester_07` | **bloccata e spenta**, CSV ≤ 2 MB | sottocliente: non decide le risorse di tutti |
| tester_08 | `tester_08` | **bloccata e spenta**, CSV ≤ 2 MB | sottocliente, come tester_07 |

Per concederla a un sottocliente: `DASH_TIMESTRAL_DEFAULT=on` nel suo `.env` (lasciando
`DASH_TIMESTRAL_LOCK=on` se non deve poter cambiare taglia), poi `systemctl restart pi-testerNN`.
Per toglierla del tutto: `DASH_TIMESTRAL=off`.

## In esercizio: comandi e percorsi

| cosa | dove |
|---|---|
| servizio | `systemctl {status,restart,stop} timestral` · unità versionata in `scripts/timestral.service` |
| porte | `127.0.0.1:8018` (solo loopback: nessuna esposizione su Caddy) |
| token | `/etc/timestral/token` (creato al primo avvio, `0644`: leggibile anche dalle istanze non privilegiate) |
| pesi | `/root/.cache/huggingface/hub/models--mistralai--Timestral-*` (5M/28M/123M/209M scaricati) |
| venv | `/opt/timestral-venv` (torch 2.14.1+cpu, numpy, safetensors, `timestral` 1.0.0) |
| serie demo | `media/timestral-demo.json` (2 reali con fonte, 2 sintetiche dichiarate) |
| CSV dell'utente | `media/previsioni/dati/` — **escluso da git**, possono contenere dati riservate |
| previsioni generate | `media/previsioni/*.csv` — anch'esse escluse da git |
| preferenze per istanza | `media/timestral-prefs.json` (`enabled`, `size`, `prediction_length`) |

Rotte della dashboard (dietro l'autenticazione esistente, nessuna porta nuova):

| rotta | cosa fa |
|---|---|
| `GET /api/health` | elenca `timestral-tool` e `timestral-service` fra le feature |
| `GET /api/timestral` | stato completo: servizio su/giù, taglia, RAM, demo, CSV, tool attivi |
| `POST /api/timestral` | `{enabled}` (interruttore dei tool) · `{size}` (cambia taglia) · `{action:"unload"}` |
| `POST /api/timestral/forecast` | previsione: `{demo|csv|series, prediction_length, congiunta}`, con le date e lo storico della fonte (per il grafico) |
| `POST /api/timestral/backtest` | verifica storica: `{demo|csv|series, prediction_length, folds}` → MAE modello/naive, copertura delle bande |
| `POST /api/timestral/dati?nome=x.csv` | carica un CSV (corpo = testo del file) previa validazione |

### Analisi descrittiva dei dati (`POST /api/timestral/insight`)

Quello che si può dire **dei dati** senza chiedere niente al modello. È aritmetica, non
inferenza, e ogni numero ha il suo metodo dichiarato in calce alla card:

| cifra | metodo |
|---|---|
| variazione 1 / 7 / 30 passi, e sull'intera serie | (ultimo − valore di N passi fa) / \|quello\| · 100 |
| tendenza (pendenza, R²) | regressione lineare ai minimi quadrati; R² dice quanta parte del movimento spiega una retta |
| volatilità | deviazione standard delle variazioni percentuali passo-passo |
| rumore | dev.st dei residui rispetto a una media mobile ÷ dev.st dei valori |
| ciclicità | autocorrelazione ai lag tipici dell'unità (mese→12, ora→24, giorno→7); si segnala sopra \|r\| ≥ 0,3 |
| **quota spiegata dal ciclo** | media per fase del ciclo, poi 1 − var(residui)/var(totale) |
| anomalie | residuo oltre 3 deviazioni standard, con data |
| qualità | punti, dal/al, mancanti, percentuale di passi senza variazione |

La distinzione **ciclicità vs rumore** è la parte che si sbaglia più facilmente: una cassa con
il weekend basso ha una volatilità del 50% per passo e un «rumore» alto, ma l'87,5% della
variabilità è spiegata dal ciclo settimanale. Chiamarlo rumore sarebbe falso; la card lo dice
per esteso («la variabilità viene soprattutto dalla ciclicità»).

### Importazione dei dati trovati dall'agente

`timestral_importa` salva una serie in `media/previsioni/dati/<nome>.csv` **e** un
`<nome>.meta.json` con fonte, URL, unità, frequenza, nota, istante di importazione. La vista
mostra la provenienza accanto alla serie («· importata»), e il forecast la riporta.

Perché i metadati: una serie senza provenienza è indistinguibile da numeri inventati, e chi
riprende il lavoro mesi dopo deve poter ricontrollare. La frequenza dichiarata decide anche
l'unità dell'orizzonte (mesi/giorni/ore) e quindi i preset dell'interfaccia.

Fonte strutturata provata qui (senza chiavi): API della BCE,
`https://data-api.ecb.europa.eu/service/data/ICP/M.U2.N.000000.4.ANR?format=csvdata`
— inflazione HICP dell'area euro, variazione annua mensile, 120 punti (2016-01 → 2025-12).

### Togliere una serie che non serve più

`elimina serie` (nella barra della vista) cancella **il CSV e i suoi metadati** dalla cartella
dati. Chiede conferma mostrando nome e fonte, perché non c'è un annulla. Le quattro serie di
esempio non si eliminano dalla vista: stanno in `media/timestral-demo.json`.

Rotta: `POST /api/timestral/dati/elimina { nome }` → `{ ok, nome, metaRimosso }`. Il nome è
validato (solo `.csv`/`.txt` dentro `media/previsioni/dati`, niente percorsi: `../` viene
rifiutato con 400, un file inesistente con 404). La cancellazione **non** richiede che la feature
sia accesa: è pulizia dei propri dati, e con `DASH_TIMESTRAL_LOCK=on` resta possibile — il lock
limita l'uso del modello, non la gestione dei file di chi lavora.

### Granularità: con che passo si prevede (scelta **prima** del calcolo)

Ogni serie ha il suo passo (15 minuti, un giorno, un mese). La barra in alto permette di
**raggruppare i dati prima del calcolo** — «un punto per settimana» invece di 672 quarti d'ora —
scegliendo la granularità: `15 minuti · 30 minuti · 1 ora · 4 ore · 1 giorno · 1 settimana ·
1 mese · 3 mesi · 1 anno`.

| regola | perché |
|---|---|
| si va **solo verso il grosso** | dai dati giornalieri non si ricava un dettaglio orario. Le granularità più fini del passo nativo sono disabilitate nella tendina («i dati sono più radi») e la richiesta viene **rifiutata** dal motore con un messaggio esplicito se arriva lo stesso dall'API |
| cosa rappresenta il punto | **media** del periodo (default: stessa unità di misura, livello non falsato dalla fase), **ultimo valore** (la chiusura, come una barra di mercato), **somma** (per i flussi: incassi, consumi, pezzi venduti) |
| periodi di calendario | settimane da lunedì, mesi e trimestri veri (un mese non è 30 giorni). Le date **senza fuso** sono lette come UTC: altrimenti un punto a mezzanotte slitta nel giorno prima |
| data del punto | è l'**ultima** osservazione del periodo (il punto racconta il periodo fino a lì) |
| unità dell'orizzonte | segue la granularità: scegliendo «1 settimana», «30» significa 30 settimane, i preset diventano 4/12/26/52 e l'etichetta accanto al numero cambia **prima** del calcolo |
| vale per tutto | previsione, verifica storica e analisi dei dati girano sulla **stessa** serie aggregata. Lo stato dichiara cosa è stato fatto: `serie raggruppata a 1 settimana (media del periodo): 53 punti da 365` |
| pochi punti | con meno di 40 punti il verdetto avvisa che la stima è debole; sotto i 30 lo scenario ricampionato sparisce **spiegando perché** (e suggerisce una granularità più fine) |

Il raggruppamento avviene nel client (`granulare`, `GRANULARITA` in `media/timestral-client.mjs`),
quindi vale anche per il tool in chat e per l'export: non è una decorazione della vista.

### Controlli del grafico (lettura del trend)

| leva | perché |
|---|---|
| finestra (7/14/30/90/180/365 o tutto, nell'unità della serie) | un trend su 7 punti e uno su 365 sono due affermazioni diverse |
| ◀ ▶ | sposta la finestra nel passato (Shift+clic = 10 finestre): con la finestra spostata la previsione non si disegna, perché non è più attaccata all'ultimo dato |
| confronto col periodo prima | sovrappone la finestra precedente allineata per posizione: mostra se il movimento attuale somiglia a quello di prima |
| scala logaritmica | su serie che crescono in percentuale la scala lineare fa sembrare accelerazione ciò che è crescita costante; disattivata se la serie ha valori ≤ 0 |
| intervalli on/off | toglie il ventaglio quando interessa solo la linea |
| media mobile | lisciato il rumore, la direzione si vede; la finestra è automatica (1/12 dei punti) oppure 7/20/50 a scelta |
| puntatore | data e valore osservato, oppure stima e intervallo 80% nel futuro |
| rotella / pizzico | zoom ancorato al puntatore (Shift = passi larghi, Ctrl = fini) |
| trascinamento | ci si sposta nel tempo; la scala verticale si ricalcola sui valori visibili, quindi la linea non esce dal riquadro |
| reset / tutto (tasti `0` e `9`) | `reset` torna alla vista di partenza (la finestra scelta, con la previsione); `tutto` mostra tutto lo storico e tutta la previsione. Doppio clic = reset |
| striscia sotto il grafico | minimappa con tutto il disegno e il riquadro di ciò che si sta guardando: clic o trascinamento per spostarsi. Serve a non perdere la rotta quando si è molto zoomati |
| confronto col periodo prima | sovrappone la finestra precedente allineata per posizione e riscalata (si confronta la **forma**, non il livello): mostra se il movimento attuale somiglia a quello di prima |
| schermo intero | per guardare una serie lunga senza il resto dell'interfaccia |
| riga «cosa si è mosso» | variazione % nella finestra, sopra/sotto la media, quanti punti disegnati |

### La vista «Previsioni»

Si apre dal menu **risorse → 📈 previsioni** (vista a sé, come File o Memoria).

| parte | cosa dice |
|---|---|
| grafico | storico in grigio, mediana in verde, ventaglio con tre livelli (50 / 80 / 95%), linea verticale sull'ultimo dato osservato. Le date compaiono solo se la fonte le ha; altrimenti l'asse x è «passi» |
| andamento realistico (secondo grafico) | scenario ricampionato dai rendimenti recenti (bootstrap): fasce 50/80/95%, mediana azzurra e media degli ultimi 20 passi. **Navigabile come il primo**: rotella/pizzico per lo zoom, trascinamento, `−` `+` `reset`, doppio clic e tasto `0`; ha la sua striscia-posizione |
| numeri | ultimo osservato, mediana a fine orizzonte, variazione attesa (con freccia), banda 80% e 95%, P(rialzo) con la lettura in parole |
| tabella | tutti i passi con mediana, q05, q95 (ogni *n*, più l'ultimo) |
| verifica storica | rolling-origin su quella serie: MAE del modello contro il naive, vantaggio in %, copertura empirica delle bande, e un **giudizio in chiaro** («il modello fa come il naive: qui aggiunge solo l'incertezza», «banda sottostimata», …) |
| ＋ csv | carica un CSV (una colonna date + una valori): validato dal server prima di salvarlo, righe scartate dichiarate, e la previsione parte da sola |
| ⬇ csv / ⬇ svg | esporta i passi con tutti i quantili, o il grafico come vettoriale |

Perché il backtest sta nella vista: un ventaglio disegnato bene sembra una promessa. Il giudizio
«la mediana non batte il naive» o «la banda dichiarata contiene il valore reale il 67,8% delle
volte invece dell'80%» è la parte che rende onesto tutto il resto.

Misura di riferimento (USD/EUR, 3 finestre da 30 passi): MAE 0,0114 contro 0,0112 del naive
(−2,3%), copertura 95% reale 81,1%, copertura 80% reale 67,8% → **le bande sono leggermente
strette**. Va detto all'utente, non nascosto.

### Verifica rapida (dopo un riavvio o un aggiornamento)

```bash
systemctl is-active timestral && curl -s 127.0.0.1:8018/health | python3 -m json.tool | head
curl -s -u "$DASH_USER:$DASH_PASSWORD" http://127.0.0.1:8420/api/timestral | python3 -m json.tool | head
```

**Il riavvio della dashboard è necessario** perché i tool entrino nella lista inviata al
modello: `bash scripts/restart-dashboard.sh` (interrompe la sessione in corso, come ogni
riavvio).

### Un errore da non rifare

`pkill -f "media/timestral-service.py"` **uccide la shell che lo esegue**, perché il pattern
compare nella sua stessa riga di comando: il comando successivo non parte e sembra che il
servizio «muoia da solo». Usare `pkill -f "[t]imestral-service.py"` o, meglio, `systemctl`.

## Verifica: il modello batte i baseline? (misura, non opinione)

Banco di prova: `media/timestral-backtest.py` — rolling origin, contesto solo passato, confronto con
naive (ultimo valore), media mobile a 7 punti e deriva (ultimo + pendenza media).

| serie | orizzonte | finestre | MAE modello | naive | media mobile | deriva | MASE | cop. 80% | cop. 95% |
|---|---|---|---|---|---|---|---|---|---|
| Nasdaq Composite | 1 giorno | 8 | 306,8 | **303,4** | 530,4 | 317,8 | 1,35 | 62,5% | 62,5% |
| Nasdaq Composite | 5 giorni | 6 | 347,9 | 346,1 | 471,8 | **343,8** | 1,55 | 86,7% | 90,0% |
| Nasdaq Composite (**209M**) | 5 giorni | 6 | **343,0** | 346,1 | 471,8 | 343,8 | 1,53 | 86,7% | 90,0% |
| Inflazione area euro | 3 mesi | 6 | 0,34 | 0,24 | **0,19** | 0,27 | 0,81 | 100% | 100% |
| Inflazione area euro | 12 mesi | 4 | 2,05 | 1,98 | 2,69 | **1,90** | 6,49 | 58,3% | 75,0% |

Cosa dicono, senza addolcire:

- **Il modello non batte i baseline semplici** su queste serie. Su Nasdaq a 1 giorno il naive vince
  (303,4 contro 306,8), MASE 1,35 (> 1 = peggio del naive in-sample). A 5 giorni la **209M** fa
  343,0 contro 346,1 del naive (meglio di 3 punti su 26.000: dentro il rumore, con 6 finestre), ma
  la **deriva** fa 343,8 — cioè la stessa cosa con una riga di aritmetica.
- Sull'inflazione il naive e la media mobile battono il modello: è una serie liscia e amministrata,
  il caso in cui un modello pre-addestrato ha meno da aggiungere.
- **Le bande**: ben calibrate a 5 giorni (86,7% reale su 80% dichiarato), **troppo strette** a 12
  mesi (58,3%) e a 1 giorno (62,5%). Dove la banda è stretta, va allargata a mente.
- Il **MASE non è un confronto con il naive out-of-sample**: divide per l'errore medio in-sample.
  Per questo sull'inflazione a 3 mesi vale 0,81 mentre il naive resta migliore: si legga insieme
  alle colonne MAE, non da solo.

Conclusione onesta: la **pipeline è corretta e riproducibile** (quantili ordinati, verifica
strumentale del disegno: scarto 0 fra valori e coordinate), ma il valore aggiunto del modello è
**l'incertezza quando è calibrata**, non il punto centrale. Su una serie finanziaria, la riga
«stima centrale» va letta come «il centro della distribuzione», non come «la previsione».

## Ciclicità e pattern (analisi, non modello)

Tre strumenti, tutti aritmetici e verificabili, nella card «Cosa dicono i dati»:

1. **Decomposizione in tre strisce** (stile STL): trend = media mobile centrata; stagionale =
   media per fase di **due** periodi (il dominante e un secondo, tenuto solo se spiega ≥ 5% della
   varianza); residuo = ciò che resta. Accanto a ogni riga la quota di variabilità spiegata, così
   si vede a colpo d'occhio se la serie è «trend + ciclo» o un groviglio.
2. **Periodo dominante e autocorrelazioni** sopra la soglia 1,96/√n. Attenzione alle armoniche:
   un segnale con due picchi al giorno dà un massimo a 12 ore, ma il periodo vero può essere 24 —
   per questo si controllano i multipli.
3. **Matrix profile**: per ogni finestra si calcola la distanza dalla finestra più simile. I minimi
   sono i **motif** (forme che tornano: «2025-03-08 ≈ 2026-01-10, distanza 0,08»), i massimi sono i
   **discord** (il pezzo che non somiglia a nient'altro). È il modo corretto di dire «ci sono
   pattern ricorrenti?», invece di guardare l'occhio. Costo: O(M²·w), misurato 20-80 ms su 400-670
   punti.

Misura sugli esempi inclusi: cassa giornaliera → trend 20,2%, stagionale (7 giorni) 76,4%,
residuo 3,4%; carico elettrico → trend 12,1%, stagionale 72,8%, residuo 15,1%; Bitcoin → trend
68,6%, stagionale 15,3% (periodi 106 e 86: rumore che passa la soglia, e la forza lo dice).

Il modello **non** fa questo: prevede. Queste tre cose dicono **se vale la pena prevedere**.

## Interpretare la richiesta (unità → orizzonte)

| come lo dice l'utente | orizzonte giusto | note |
|---|---|---|
| «domani» / «la prossima seduta» | 1 | su serie giornaliere |
| «settimana prossima» | 5 | sedute di borsa: se c'è un festivo sono 4 |
| «prossimi 4 mesi» | 4 | solo su serie mensili; su una giornaliera sono ~120 punti |
| «prossimo trimestre» | 3 (mensile) / 90 (giornaliero) | dichiarare la convenzione |
| «fine anno» | mesi che mancano a dicembre | calcolare, non indovinare |
| «la prossima settimana», con dati a 15 minuti | `granularita: "1w"` + 1–4 passi | non 672 quarti d'ora: si raggruppa prima del modello e si dichiara la regola (`media`/`ultimo`/`somma`) |
| «l'anno prossimo», con dati mensili | 12 passi | da dati mensili non si va più fini; con `granularita: "3M"` la stessa previsione si legge a trimestri |

### Granularità anche nel tool in chat (`timestral_forecast`)

Il tool ha gli stessi parametri della vista, perché il raggruppamento avviene nel client condiviso:

| parametro | valori | a cosa serve |
|---|---|---|
| `granularita` | `15m` `30m` `1h` `4h` `1g` `1w` `1M` `3M` `1Y` | passo della previsione; si va **solo verso il grosso** (rifiuto esplicito se più fine dei dati) |
| `agg` | `media` (default) `ultimo` `somma` | cosa rappresenta il punto di un periodo |

`prediction_length` si esprime **nel passo scelto** (`granularita: "1w"` + `prediction_length: 12`
sono dodici settimane). La risposta del tool dichiara sempre il raggruppamento
(«serie raggruppata a 1 settimana (media del periodo): 53 punti da 365 osservazioni»), e
`timestral_series` elenca le granularità disponibili perché il modello non debba inventarle.

La serie si riconosce per **sinonimi** (`PREV_SINONIMI` nella vista: cambio/valuta → cambio USD-EUR,
bitcoin/cripto, cassa/incassi/vendite, carico/energia) e poi per nome, con un punteggio pesato sulla
radice delle parole: «inflazione italiana» trova `inflazione-italia-ipca`, «inflazione area euro»
trova l'altra, «prezzo del petrolio» **non trova niente** e lo dice (meglio nessuna serie che quella
sbagliata).

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
