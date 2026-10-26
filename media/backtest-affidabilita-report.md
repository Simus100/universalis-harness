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

**Ma la banda non vale più di una formula di tre righe**: nel test contro una banda costruita dalla
volatilità storica (sezione in fondo) sui prezzi reali Timestral è **3.0 % peggiore** della
migliore baseline probabilistica. Quindi sui prezzi non è utile né per il centro né per
l'incertezza; resta utile dove la serie ha stagionalità (cassa, carichi, consumi): lì è
**85.8 % migliore** di qualunque banda da volatilità.

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

---

# Secondo test: contro una banda da volatilità storica (il confronto che conta sui prezzi)

Strumento: `media/timestral-backtest-volatilita.py`. Risultati: `media/backtest-volatilita-28M-60f.json`.
19 casi su serie di prezzo reali + 4 casi di controllo su serie sintetiche, 60 finestre, passo 1.

Perché serviva: nel test generale il pinball di Timestral batteva quello di un **naive senza
incertezza** (distribuzione degenere), il che è facile. Il confronto onesto è contro una banda
costruita come si deve: random walk gaussiano con sigma dei rendimenti logaritmici del contesto,
allargato con sqrt(passo) — nella versione semplice (`vol`), con la deriva media (`vol+deriva`) e
con sigma EWMA stile RiskMetrics (`ewma`). Stessi livelli quantili (0.05…0.95), stesso contesto.

## Esito, prezzi reali (19 casi)

| | pinball | banda 80 % coperta | ampiezza media banda 80 % |
|---|---|---|---|
| Timestral 28M | 161.54 | 81.4 % | 6.95 % del prezzo |
| vol storica | **159.74** | **85.0 %** | 7.30 % |
| vol + deriva | 165.9 | — | — |
| EWMA (λ 0.94) | 166.5 | 79.4 % | — |

**Timestral è 3.0 % peggiore della migliore baseline probabilistica.** Batte la `vol` semplice in
13 casi su 19, ma sempre di 1-3 %, cioè dentro il rumore, e perde nettamente dove conta:

| caso | Timestral vs migliore baseline |
|---|---|
| oro mensile h=12 | **−30.0 %** (vince `vol+deriva`: portare la deriva batte il modello) |
| oro mensile h=3 | −7.7 % |
| Bitcoin h=20 | −5.5 % |
| oro mensile h=1 | −4.2 % |
| oro 15 min h=16 | −3.7 % |
| cassa / carico elettrico (controllo) | **+83.7 / +90.0 / +78.3 / +91.2 %** |

La banda di Timestral è anche **più stretta** di quella da volatilità (6.95 % contro 7.30 %) e
per questo copre meno (81.4 % contro 85.0 %): non è più prudente, è solo più ottimista.

## Il controllo che valida il banco di prova

Sulle due serie sintetiche — stagionalità settimanale e giornaliera pulita — Timestral vince di
**85.8 %** in pinball con una banda 10 volte più stretta (15 % del valore contro 154 %). Quindi il
test discrimina: quando nella serie c'è struttura da imparare, il modello la trova. **Sui prezzi
non c'è**, e infatti il modello finisce dietro a una formula.

## Conclusione operativa

- **Prezzo puntuale**: inutile (pari al naive, già misurato).
- **Incertezza sul prezzo**: inutile anche quella — non batte la volatilità storica, e su un
  orizzonte lungo perde del 30 % contro la stessa formula più la deriva.
- **Serie con stagionalità** (incassi, consumi, carichi, presenze): qui il modello **è** utile, e di
  molto. È l'unico terreno su cui i numeri lo sostengono.
- Se una previsione di prezzo serve comunque, la strada giusta è la banda da volatilità (o EWMA),
  non questo modello.

---

# Terzo test: si può renderlo utile in finanza? Tre strade, misurate

Strumento: `media/timestral-test-finanza.py`. Risultati: `media/test-finanza-30f.json`.
30 finestre per caso, rolling origin, solo passato, stesso metro (pinball sugli stessi 7 livelli).

## A. Più contesto — non funziona

Stessa serie, stesso modello, contesto da 60 a 480 punti (h=5):

| serie | ctx 60 | ctx 120 | ctx 250 | ctx 480 |
|---|---|---|---|---|
| cambio USD/EUR | +3.7 % | −0.8 % | −0.3 % | **+6.9 %** |
| Bitcoin USD | −0.8 % | −0.3 % | **+10.8 %** | — |
| oro COMEX | −6.3 % | −4.5 % | **+7.4 %** | — |
| Nasdaq Composite | −1.4 % | −0.6 % | — | — |

(guadagno in pinball contro la banda da volatilità calcolata sullo **stesso** contesto: più storia
aiuta anche la baseline, quindi il confronto è onesto). Non c'è monotonia: si passa da −6 % a
+7 % cambiando il contesto, cioè l'effetto è dentro il rumore. **Più storia non dà al modello
un'informazione che non c'è.** E il centro resta ≥ 1 rispetto al naive (1.01–1.10 su BTC e oro).

## B. Previsione congiunta (le dipendenze fra serie) — non funziona

Pannello allineato sulle date comuni (231 giorni, 2025-10-27 → 2026-10-01) di EUR/USD, Bitcoin e
oro COMEX, previsto in `mode=joint` contro le stesse serie previste separatamente:

| serie | joint vs separate | joint vs banda da volatilità |
|---|---|---|
| cambio USD/EUR | +2.1 % | 0.0 % |
| Bitcoin USD | −4.3 % | −6.8 % |
| oro COMEX | −1.0 % | −5.8 % |

Le dipendenze cross-asset non aggiungono nulla di misurabile. (Nota: `oro-comex-usd-toz-giornaliero`
e `xauusd-comex-giornaliero` contengono gli **stessi** valori — differenza media 0.0 su 181 date:
nel pannello entra una serie sola, altrimenti si conterebbe due volte la stessa variata.)

## C. Cambiare bersaglio — qui c'è qualcosa

### C1. Rendimenti logaritmici: nessun segnale
Guadagno in pinball contro il naive «rendimento zero» con banda da volatilità: −4.4 % … +3.9 %,
MAE del centro 0.98–1.10. **La direzione del prezzo non è prevedibile**, come da manuale.

### C2. Volatilità realizzata (√ della somma dei quadrati dei rendimenti su 5 giorni)
Contro «volatilità come ieri» e contro EWMA (λ 0.94), con bande calibrate sui **propri** residui
in-sample: Timestral vince in **7 casi su 8**, da +7.5 % a +30.2 % in pinball. Il centro batte la
EWMA ovunque (rapporto 0.39–0.90).

### C3. Contro HAR-RV, il benchmark accademico della volatilità (multi-orizzonte, OLS sul contesto)

| serie | h | Timestral vs HAR (pinball) | centro vs HAR (MAE) |
|---|---|---|---|
| cambio USD/EUR | **1** | **+24.2 %** | 0.90 |
| Bitcoin USD | **1** | **+19.7 %** | 0.80 |
| Nasdaq Composite | **1** | **+5.0 %** | 0.88 |
| oro COMEX | **1** | **+6.1 %** | 1.00 |
| cambio USD/EUR | 5 | −14.7 % | 1.29 |
| Bitcoin USD | 5 | +4.3 % | 0.79 |
| Nasdaq Composite | 5 | +5.2 % | 0.86 |
| oro COMEX | 5 | −11.9 % | 1.04 |

**A un passo Timestral batte HAR-RV su tutte e quattro le serie** (5–24 % in pinball, centro
migliore in tre su quattro). A cinque passi il risultato è misto e quindi non lo si afferma.

## Conclusione

- **Prezzo**: no. Né centro né incertezza, e non si recupera con più contesto o con le dipendenze
  fra serie (misurate entrambe, negative).
- **Volatilità a un giorno**: **sì, e per la prima volta contro un benchmark serio**. È l'unico
  uso finanziario che i numeri sostengono: prevedere *quanto* si muoverà il mercato, non *dove*.
- Cautela da dichiarare: quattro serie, trenta finestre, HAR stimato su 150 punti. È un segnale
  da confermare su più serie e più lungo storico, non una legge. E serve a dimensionare il rischio
  (VaR, sizing, margini), non a guadagnare dalla direzione.
