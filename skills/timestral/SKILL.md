---
name: timestral
description: "Previsioni probabilistiche su serie temporali con Timestral (time-series foundation model di Mistral, locale su CPU): dato il passato di una serie (cambi, prezzi, incassi, consumi, carichi orari) ottieni mediana e quantili dei prossimi passi, con l'incertezza dichiarata. Usala quando la risposta dipende da «cosa succederà» e i dati sono numeri ordinati nel tempo; non quando il futuro dipende da un evento noto e datato (il modello non conosce notizie) né per dare consigli finanziari. Motore: servizio locale condiviso (feature «timestral» nel menu features, taglia 28M, 471 MB, si scarica da solo)."
---

# Previsioni su serie temporali (Timestral)

Timestral è una famiglia di **time-series foundation model** di Mistral: modelli
pre-addestrati che prevedono la **continuazione statistica** di una serie, **zero-shot** —
nessun addestramento sui dati dell'utente. Output **probabilistico**: 21 quantili per passo,
più la mediana. Gira su **CPU**, quindi qui non costa denaro e non costa contesto: costa RAM,
e la RAM è condivisa da tutte le istanze dell'harness.

## Come si usa in questa istanza

Due tool, entrambi accesi dall'interruttore `timestral` nel menu «features»:

| tool | quando |
|---|---|
| `timestral_series` | prima di tutto: quali serie esistono (demo incluse, CSV caricati), stato del servizio |
| `timestral_forecast` | la previsione vera: `demo` (id), `csv` (file in `media/previsioni/dati/`) o `series` (valori in mano tua) |

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

Si cambia dalla dashboard (menu features → tendina accanto a Timestral) o con
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
