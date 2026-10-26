---
name: timestral
description: "Previsioni probabilistiche su serie temporali con Timestral (time-series foundation model di Mistral, locale su CPU): dato il passato di una serie (cambi, prezzi, incassi, consumi, carichi orari) ottieni mediana e quantili dei prossimi passi, con l'incertezza dichiarata. Usala quando la risposta dipende da «cosa succederà» e i dati sono numeri ordinati nel tempo; non quando il futuro dipende da un evento noto e datato (il modello non conosce notizie) né per dare consigli finanziari. Motore: servizio locale condiviso (servizio «Timestral» nel menu «servizi», taglia 28M, 471 MB, si scarica da solo)."
---

# Previsioni su serie temporali (Timestral)

Timestral è una famiglia di **time-series foundation model** di Mistral: modelli
pre-addestrati che prevedono la **continuazione statistica** di una serie, **zero-shot** —
nessun addestramento sui dati dell'utente. Output **probabilistico**: 21 quantili per passo,
più la mediana. Gira su **CPU**, quindi qui non costa denaro e non costa contesto: costa RAM,
e la RAM è condivisa da tutte le istanze dell'harness.

## Come si usa in questa istanza

Tre tool, accesi dall'interruttore `timestral` nel menu «servizi»:

| tool | quando |
|---|---|
| `timestral_series` | prima di tutto: quali serie esistono (demo incluse, CSV caricati), il loro passo, le granularità possibili, lo stato del servizio |
| `timestral_forecast` | la previsione vera: `demo` (id), `csv` (file in `media/previsioni/dati/`) o `series` (valori in mano tua); con `granularita` (`15m…1Y`) e `agg` (`media`/`ultimo`/`somma`) raggruppa i dati **prima** del modello |

Il servizio è `timestral.service` (systemd), in ascolto su `127.0.0.1:8018`. Non è un processo
dell'istanza: la stessa copia dei pesi serve tutte le istanze. Si scarica da solo dopo 15
minuti di inattività (35 MB a vuoto, 366 MB con il 28M caricato) e si ricarica alla prima
richiesta. **Non serve il consenso dell'utente per usarlo**: non accende nulla di pesante.

Se il tool risponde che il servizio non è in ascolto: `systemctl start timestral`. Non è la
feature spenta, è il processo fermo.

## Le taglie, con le misure di questa macchina

| taglia | RAM di picco | caricamento | 1000 punti → 30 | nota |
|---|---|---|---|---|
| 5M | 281 MB | 0,35 s | 0,03 s | istantaneo, il meno preciso |
| **28M** | **471 MB** | **0,64 s** | **0,06 s** | predefinita: miglior rapporto qui |
| 123M | 1199 MB | 15,9 s | 0,28 s | via di mezzo, caricamento lento |
| 209M | 1901 MB | 27,0 s | 0,28 s | il più preciso, costa 1,9 GB |

Si cambia dalla dashboard (menu «servizi» → tendina accanto a Timestral) o con
`POST /api/timestral {"size":"209M"}`.

## Regole di onestà (non negoziabili)

1. **È una stima, non un fatto.** Presenta sempre mediana **e** intervallo (banda 80% e 95%),
   e dì che viene da un modello pre-addestrato.
2. **Il modello non conosce notizie.** Un aumento di prezzo annunciato, uno sciopero, un
   lancio, una decisione di banca centrale: non sono nella serie, quindi non sono nella
   previsione. Se il futuro dipende da un evento noto, va detto esplicitamente.
3. **Se la banda è larga, la risposta è «non si può dire».** Confronta l'ampiezza della banda
   con la differenza che interessa all'utente: se la banda è più grande, il numero non serve.
4. **Le probabilità non sono calibrate.** `p_rise_end` viene dai quantili marginali del
   modello: buona per ordinare e per soglie prudenti, non come frequenza esatta.
5. **Sul cambio il centro non batte il naive.** Misurato qui: MAE 0,0131 (28M) contro 0,0118
   del «domani come oggi»; il vantaggio è nella distribuzione (pinball +29%). Non vendere
   come capacità predittiva ciò che è gestione dell'incertezza.
6. **Mai consigli finanziari.** Se l'utente chiede «compro o vendo?», la risposta è la stima
   con la sua incertezza, più il fatto che la decisione non spetta al modello.

## Sorgenti dati

- **Demo incluse** (`media/timestral-demo.json`): `cambio-usd-eur` e `btc-usd` sono dati
  pubblici (BCE via frankfurter.dev, CoinGecko) con la fonte dichiarata; `cassa-giornaliera` e
  `carico-energia` sono **sintetiche** e lo dichiarano nel campo `sintetica`.
- **CSV dell'utente**: `media/previsioni/dati/`, una colonna di date e una di valori,
  separatore `,` `;` o tab, con o senza intestazione. I numeri all'italiana (`1.234,56`) sono
  riconosciuti; le righe non valide si contano e si dichiarano.
- **Connettori online**: non nella prima versione (Yahoo risponde 429, Stooq chiede
  JavaScript). Fase 2.

## Quando l'utente chiede «a parole» (il caso normale in finanza)

«Prevedi l'inflazione italiana dei prossimi 6 mesi» non è una richiesta di spiegazione: è un
incarico. Non rispondere che servono i dati e non chiedere all'utente di trovarli. Fai tu:

1. **cerca** la serie (ISTAT, BCE, Banca d'Italia, Eurostat hanno API o CSV pubblici che si
   aprono da qui; per i prezzi di mercato valuta una fonte dichiarata e la sua data);
2. **importa** con `timestral_importa` (nome breve, unità, frequenza, fonte e URL);
3. **prevedi** con `timestral_forecast`, scegliendo l'orizzonte nell'unità giusta (6 mesi = 6);
4. **spiega in parole semplici**: stima centrale, fascia probabile, probabilità di salire e
   quanto fidarsi (dall'affidabilità). Chiudi dicendo che la serie è ora nella vista
   «Previsioni» con il suo nome, così la ritrova.

Se la fonte non è accessibile o i numeri non sono verificabili, dillo con chiarezza e proponi
un'alternativa (un CSV che l'utente ha in casa, una serie già importata). Mai numeri inventati.

Dalla vista «Previsioni» lo stesso incarico si dà con il campo **«oppure chiedi a parole»**:
quel testo arriva in chat come richiesta, e vale la procedura qui sopra.

## Importare dati che hai trovato tu (ricerca web, PDF, file)

Quando i numeri li trova l'agente — una serie ISTAT, un prezzo da un sito, una tabella in un
PDF — si importano con **`timestral_importa`**, che li salva in `media/previsioni/dati/` e
scrive accanto un file di metadati con la provenienza. Da lì la serie è prevedibile
(`timestral_forecast {csv: "…csv"}`) e compare nella vista «Previsioni» con la sua fonte.

Sedici righe di procedura, sempre uguali:

1. **cerca** la serie con lo strumento giusto (`web_search`, `fetch_content`) e apri la pagina
   o l'API che la contiene;
2. **estrai** le coppie (data, valore) così come sono scritte;
3. **chiama `timestral_importa`** con `nome` breve, `punti`, `fonte` verificabile, `fonte_url`,
   `unita`, `frequenza`;
4. **prevedi** con `timestral_forecast`, e nel testo cita la fonte e la data di estrazione.

Regole che non si negoziano:

- **mai valori inventati o interpolati**: se una fonte ha buchi, si dichiarano nel campo `nota`;
- **la fonte è obbligatoria**: una serie senza provenienza è indistinguibile da numeri inventati;
- **la frequenza va dichiarata** («1 mese», «1 giorno»): con quella l'orizzonte si legge in mesi
  o in giorni, e i preset della vista si adattano;
- **sotto 50 punti** la previsione è indicativa: va detto all'utente;
- se la fonte non è affidabile o i numeri non tornano, **non importare**: dillo.

Esempio di fonte strutturata che funziona da qui (nessuna chiave, nessun login): l'API della
Banca centrale europea, `https://data-api.ecb.europa.eu/service/data/<dataset>?format=csvdata`,
da cui si prendono serie come l'inflazione HICP mensile.

## Fidarsi: cosa dicono i numeri veri (misurati qui)

Backtest di confronto (`media/timestral-backtest.py`, rolling origin, contesto solo passato):

| serie | orizzonte | MAE modello | naive | deriva | copertura 80% |
|---|---|---|---|---|---|
| Nasdaq | 1 giorno | 306,8 | **303,4** | 317,8 | 62,5% |
| Nasdaq | 5 giorni | 347,9 (209M: **343,0**) | 346,1 | 343,8 | 86,7% |
| Inflazione area euro | 3 mesi | 0,34 | 0,24 | 0,27 | 100% |
| Inflazione area euro | 12 mesi | 2,05 | 1,98 | **1,90** | 58,3% |

Quindi, quando presenti una previsione: **non dire che il modello «prevede meglio»**. Su queste
serie non batte i baseline semplici; su orizzonti brevi è calibrato (banda 80% che contiene il vero
l'86,7% delle volte), su orizzonti lunghi no (58%). Il valore aggiunto è l'intervallo, e va detto.

## Interpretare la richiesta

«Settimana prossima» = 5 sedute; «prossimi 4 mesi» = 4 passi su serie mensile (≈120 su una
giornaliera); «domani» = 1. Scegli la serie per sinonimi e nome, e se non esiste dillo: meglio
nessuna serie che quella sbagliata.

## Togliere una serie che non serve più

Se l'utente dice che una serie importata non gli serve più (o che ha sbagliato i dati), in vista
Previsioni c'è **elimina serie**: cancella il CSV e i metadati. Non serve chiederglielo di fare a
mano. Il tool `timestral_importa` non elimina (di proposito: importare e distruggere sono due
azioni diverse, e la seconda va fatta da chi guarda l'elenco).

## La vista «Previsioni» (dashboard)

Menu **features → 📈 previsioni**: grafico a ventaglio dei quantili, numeri (mediana, variazione
attesa, banda 80/95%, P di rialzo), tabella dei passi, **verifica storica** e caricamento CSV.
Il grafico ha le leve che servono a leggere un trend invece di indovinarlo: **quanta storia**
disegnare (30/90/180/365 o tutto, nell'unità della serie), **scala logaritmica** (indispensabile
su serie che crescono in percentuale: su scala lineare sembrano sempre accelerare), **intervalli**
on/off, **media mobile** per togliere il rumore, **il valore esatto sotto il puntatore** (data,
valore osservato, oppure stima e intervallo nel futuro), **schermo intero**. Sotto il grafico una
riga dice cosa si è mosso nella finestra: variazione %, se l'ultimo valore è sopra o sotto la media.

**esporta pdf** produce il **report completo** (A4, colori chiari per la carta): intestazione con serie,
orizzonte, granularità, fonte e data; avviso che è una stima; indice; «in parole semplici»; i numeri;
i due grafici in vettoriale; i tre orizzonti; l'affidabilità; «cosa dicono i dati»; la tabella
completa; il glossario. Il PDF lo fa il browser (si apre la stampa: destinazione «Salva come PDF»).
Se l'utente chiede «un report da presentare», questo è il pulsante — non serve altro, e non va
promesso un PDF generato dal server: la via headless qui non funziona (documentata in `docs/TIMESTRAL.md`).

Entrambi i grafici (**la previsione** e l'**andamento realistico** ricampionato dai dati) sono
navigabili allo stesso modo: rotella o pizzico = zoom sul puntatore, trascinamento = ci si sposta
nel tempo, **reset** (o doppio clic, o tasto `0`) = si torna alla vista di partenza, **tutto**
(tasto `9`) = tutto lo storico e tutta la previsione, frecce = un passo, `+`/`−` = zoom.
Sotto ogni grafico c'è una **striscia-posizione** con tutto il disegno in miniatura e il riquadro
di ciò che si sta guardando: con lo zoom profondo è la bussola (e il modo per tornare indietro
senza ripartire da capo). La scala verticale si ricalcola sui valori visibili, quindi la linea
non esce mai dal riquadro per quanto si zoomi.

### Granularità (prima del calcolo)

Sopra il grafico si sceglie con che passo prevedere: `15 minuti · 30 minuti · 1 ora · 4 ore ·
1 giorno · 1 settimana · 1 mese · 3 mesi · 1 anno`. È un raggruppamento dei dati PRIMA del modello,
quindi cambia di cosa si parla: una serie a 15 minuti aggregata a un giorno risponde a «domani»,
non a «fra un quarto d'ora». Regole che l'agente deve rispettare quando lo propone all'utente:

- si va **solo verso il grosso** (dai giornalieri non si ricava un orario): le opzioni impossibili
  sono disabilitate e il motore rifiuta la richiesta con un messaggio chiaro;
- il punto di un periodo è la **media** (default), l'**ultimo valore** o la **somma** (per i flussi:
  incassi, consumi, pezzi) — e l'aggregazione va **dichiarata** insieme al risultato;
- orizzonte e preset seguono la granularità («30» = 30 settimane, se hai scelto le settimane);
- con meno di ~40 punti la stima è debole e va detto; la vista lo scrive nel verdetto.
- In chat, se i dati sono grezzi a 15 minuti e la domanda è settimanale, chiedi prima la serie
  intera e aggrega tu (o proponi la granularità nella vista): non chiedere al modello 2.880 passi.
Il tool `timestral_forecast` ha gli stessi parametri: `granularita` (`"15m". "30m". "1h". "4h". "1g". "1w". "1M". "3M". "1Y"`)
e `agg` (`"media"` | `"ultimo"` | `"somma"`). Usalo quando la domanda è su un passo diverso dai
dati, e nella risposta scrivi a quale passo hai raggruppato e con quale regola: senza quel dato
«12» non si sa se sono ore o settimane. `prediction_length` si esprime nel passo scelto.

Accanto alla previsione c'è **«Cosa dicono i dati»**: variazione su 1/7/30 passi, tendenza con
R², volatilità, rumore, ciclicità (con la quota di variabilità che spiega), anomalie con la data,
qualità della serie. Sono numeri calcolati sulla serie, non opinioni del modello: se citi una
tendenza, cita il suo R²; se una serie ha un ciclo forte, dillo invece di chiamarla «rumorosa».

La verifica storica è il pezzo da guardare prima di fidarsi: dice se la mediana batte il naive
e se la banda dichiarata contiene davvero il valore reale. Su USD/EUR qui: mediana −2,3% contro
il naive e copertura 80% reale 67,8% → bande leggermente strette. Se l'utente chiede «quanto è
affidabile», questo è il numero da citare.

## Cosa produce

- Risposta in chat: mediana, banda 80%, variazione attesa, `P(rialzo)`, tabella dei passi
  principali.
- File: `media/previsioni/<data>-<serie>-<passi>p.csv` con tutti i passi e i quantili.
- Endpoint per la vista: `POST /api/timestral/forecast` (stessa forma, con le date quando la
  fonte le ha — nessuna data inventata).

## Dettagli tecnici utili

- `congiunta: true` (solo con più serie) le tratta come **variate di un unico sistema**: il
  modello usa le dipendenze. Sensato per lo stesso impianto o lo stesso portafoglio, dannoso
  fra serie non legate (default: separate).
- Serie più corte di ~50 punti: la previsione è indicativa, va detto.
- Contesto massimo 32.768 passi (il modello tiene i più recenti), orizzonte massimo 4.096.
- Riferimenti: `docs/TIMESTRAL.md` (misure, architettura, limiti) e
  `media/timestral-bench.py` (il banco di prova).
