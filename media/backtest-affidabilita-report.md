# Backtest d'affidabilità di Timestral — cosa dicono i numeri

Misura fatta il 26/10/2026 su questa VPS, modello `28M` (confronto con `209M`), servizio
`timestral.service`. Strumento: `media/timestral-backtest-affidabilita.py`. Risultati grezzi:
`media/backtest-affidabilita-28M-60f.json` (60 finestre per caso), `…-28M-30f.json`,
`…-209M-30f.json`.

## Metodo (dichiarato, ricontrollabile)

- **Rolling origin**: contesto di `ctx` punti che precede l'origine, orizzonte `h`, poi l'origine
  avanza di **un passo**. Il modello vede solo il passato: non ha mai visto il punto da indovinare.
- **11 serie**: 9 reali (cambio USD/EUR, Bitcoin, Nasdaq Composite, oro COMEX giornaliero, XAU/USD,
  oro COMEX a 15 minuti, oro mensile, inflazione area euro mensile, inflazione Italia IPCA) e
  2 sintetiche dichiarate (cassa giornaliera, carico elettrico orario). **24 casi** serie × orizzonte.
- **Baseline**: naive («domani come oggi»), naive stagionale, deriva, media mobile 7.
- **Metriche**: MAE (centro), MASE, **pinball** (la loss probabilistica: misura anche l'incertezza),
  **copertura empirica** delle bande dichiarate 10…90 %, PIT, bias con segno, intervallo di
  confidenza 90 % del rapporto MAE ricampionando le finestre intere.
- Limite noto: le finestre si sovrappongono (passo 1), quindi gli errori non sono indipendenti.
  I conteggi servono a ordinare; la significatività va presa con le molle.

## Verdetto in breve

| domanda | risposta | numero |
|---|---|---|
| il **centro** (mediana) batte il naive sui dati reali? | **no, è un testa a testa** — a volte peggio | rapporto MAE 0.996 su 20 casi reali (0.92–1.13), CI che quasi sempre contiene 1 |
| il centro batte il naive sulle serie **con stagionalità pulita**? | **sì, di molto** | rapporto MAE 0.15: cinque-sette volte meglio |
| la **distribuzione** (bande) è più informativa del naive? | **sì, in modo netto** | pinball migliore del 28.7 % sui reali, 38.9 % su tutti |
| le bande dichiarate sono **oneste**? | **in media sì, per caso no** | banda «80 %» → contiene il vero il **79.8 %** delle volte; «95 %» → 88.3 % |
| le bande reggono su **orizzonti lunghi**? | **no** | h>5: 80 % → **73.0 %**, 95 % → **84.0 %**, e in un caso 49.7 % |

Una frase: **affidabile come macchina per dire l'incertezza, non come macchina per indovinare il
valore di domani.** Il centro è un random walk con qualche rifinitura; la banda è la parte che vale.

## Il dettaglio che conta (campione 60 finestre, 28M)

| serie | h | MAE mod./naive | bande 80 % | 95 % | pinball vs naive |
|---|---|---|---|---|---|
| cambio USD/EUR | 1 | 1.019 | 86.7 | 91.7 | +28.8 % |
| cambio USD/EUR | 20 | 0.983 | 83.6 | 92.5 | +32.6 % |
| Bitcoin USD | 5 | 1.014 | 90.0 | 94.7 | +25.9 % |
| Nasdaq Composite | 5 | 1.005 | 82.0 | 91.7 | +29.4 % |
| oro COMEX (15 min) | 16 | 0.995 | 84.5 | 95.5 | +28.2 % |
| oro mensile | 12 | 0.965 | **49.7** | 64.9 | +29.9 % |
| inflazione area euro | 3 | 0.955 | 76.6 | 86.5 | +32.0 % |
| inflazione area euro | 12 | 0.997 | **62.0** | 72.4 | +25.2 % |
| inflazione Italia IPCA | 12 | 1.089 | 70.4 | 83.6 | +21.8 % |
| cassa giornaliera (sintetica) | 7 | **0.145** | 81.4 | 89.8 | +90.0 % |
| carico elettrico (sintetica) | 24 | **0.095** | 79.4 | 89.0 | +93.5 % |
| *(tutti i 24 casi)* | — | **0.855** | **79.8** | **88.3** | **+38.9 %** |

## Dove il modello sbaglia (e perché va detto all'utente)

1. **Orizzonti lunghi su serie con trend**: oro mensile a 12 mesi, banda 80 % che copre il 49.7 % e
   bias di **+12.5 %** (la mediana sta sopra il vero: sottostima il rally). Nel blocco più recente
   la copertura scende al **20.8 %**. È il difetto classico: il modello estende il trend e sbaglia
   per eccesso o per difetto, e la banda è troppo stretta per contenere l'errore.
2. **Inversioni di regime**: inflazione IPCA a 12 mesi, bias **−36.4 %** (mediana molto sopra il
   vero: il modello prevedeva inflazione che poi non c'è stata). Non è un difetto di taratura, è
   il fatto che il futuro dipendeva da eventi che la serie non contiene.
3. **Copertura che crolla con l'orizzonte dentro la stessa previsione**: oro mensile h=12,
   copertura 80 % del 70.8 % al passo 1 e del **41.7 % al passo 9**. Chi legge il passo 12 crede di
   avere una banda all'80 % e ne ha una molto più stretta.
4. **Le serie reali senza struttura**: sul cambio il rapporto MAE al passo 1 è 1.000 — la mediana
   *è* l'ultimo valore. Non c'è capacità predittiva da rivendere.

## Cosa aggiunge il modello grande (209M contro 28M, 30 finestre)

| | MAE mod./naive (reali) | pinball vs naive | copertura 80 % | tempo |
|---|---|---|---|---|
| 28M | 1.002 | +27.9 % | 80.4 | 40 s |
| 209M | **0.981** | **+29.6 %** | 80.3 | 147 s |

Il 209M è **leggermente** meglio quasi ovunque (migliora anche i casi lunghi: oro mensile h=12 da
0.955 a 0.922) e costa 4 volte il tempo e 1.9 GB: su un orizzonte lungo, se la RAM c'è, vale la
pena; per l'uso normale no.

## Quanto è stabile il backtest stesso

Con 30 finestre il rapporto MAE dei casi reali veniva 1.15; con 60 finestre 0.996. Stessa serie,
stesso modello, stessa metrica: **la stima è rumorosa** e dipende da quali finestre capitano.
Questo è un avvertimento anche sui numeri qui sopra: servono a dire «il centro non batte il naive»
(netta, robusta), non a dire «batte il naive del 4 %» (fragile, non affermarlo).

## Regole d'uso che ne derivano

- Presenta sempre mediana **e** banda; non dire mai che il modello «prevede meglio».
- Su orizzonti lunghi (> ~5 passi) restringi la fiducia: la banda dichiarata copre meno di quanto
  promette. Se la decisione dipende dal passo lontano, dillo.
- Se la serie non ha stagionalità pulita (prezzi di mercato), il contributo è la distribuzione,
  non il centro: al centro basta il naive.
- Prima di fidarsi di una serie nuova, guarda la **verifica storica** della vista Previsioni: è la
  stessa misura, in piccolo.
