---
name: report-dataviz
description: "Progetta report, dashboard, KPI e grafici di qualità professionale: sceglie la forma visiva dall'intento comunicativo, imposta layout, colore, titoli-rivendicazione e annotazioni, e verifica onestà grafica e accessibilità. Usala quando devi produrre o migliorare un report, una dashboard, un pannello di KPI, un grafico (SVG, HTML, immagine) o valutare una visualizzazione esistente; per diagrammi concettuali e schemi basta la skill visual-representation."
---

# Report, dashboard e grafici

Una visualizzazione è un **argomento con le prove**: qualcuno deve capire in pochi secondi cosa è
successo e cosa farne. Il resto — estetica, tecnologia, decorazione — viene dopo.

Regola di partenza: **prima la frase, poi il grafico**. Se non sai scrivere in una riga cosa deve
capire il lettore, non sai ancora quale grafico disegnare.

## Quando usare questa skill

- devi produrre o migliorare un **report** (Markdown, HTML, PDF), una **dashboard**, un pannello di
  KPI, un grafico o una tabella di dati;
- devi **giudicare** una visualizzazione esistente («è chiara?» «cosa non funziona?»);
- devi rappresentare **dati** (numeri, serie temporali, confronti, parti di un totale, flussi).

Non serve per schemi concettuali, mappe mentali, timeline di processo o piantine: per quelli c'è la
skill `visual-representation`, che definisce il contratto dell'SVG in chat. Le due si combinano: qui
si decide *cosa* mostrare e *come*, là *come disegnarlo* tecnicamente.

## Le sette regole non negoziabili

1. **Un intento per visualizzazione.** Ogni grafico risponde a una domanda sola.
2. **La forma segue l'intento**, non il gusto e non la libreria disponibile (vedi *Scelta della forma*).
3. **Il titolo è una rivendicazione**, non un'etichetta: «Il fatturato cala del 12% dopo il cambio di
   fornitore» batte «Fatturato per mese».
4. **Zero decorazione che non porta informazione**: via griglie pesanti, 3D, ombre, sfondi, bordi,
   icone riempitive, assi ridondanti.
5. **Un solo asse verticale per volta**: mai doppio asse; se due grandezze non condividono la scala,
   due pannelli impilati.
6. **Integrità grafica**: barre da zero, proporzioni rispettate, nessuna scala troncata o gonfiata.
   Il grafico non deve esagerare ciò che i dati dicono.
7. **Accessibile per default**: il colore non è mai l'unico veicolo di significato, il contrasto del
   testo è sufficiente, ogni grafico ha titolo, descrizione e — quando i numeri contano — una tabella
   di dati leggibile come alternativa testuale.

## 1. Partire dall'intento, non dai dati

Prima di disegnare, rispondi per iscritto a queste cinque domande (bastano tre righe):

| Domanda | Perché conta |
|---|---|
| **Chi** legge? (esperto, dirigente, pubblico) | decide il livello di astrazione e il gergo |
| **Cosa deve capire o decidere** dopo? | decide la selezione dei dati, non il grafico |
| **Qual è il messaggio?** una frase, con il numero dentro | diventa il titolo |
| **Che tipo di confronto** è? (nel tempo, fra categorie, parte-tutto, relazione, distribuzione, spazio, flusso) | decide la forma |
| **Cosa faccio se il dato manca o è incerto?** | decide annotazioni, disclaimer, campi vuoti |

Se il committente chiede «una dashboard con tutto», la risposta professionale è una **gerarchia**:
un livello 1 di 4-7 indicatori decisionali, poi il dettaglio su richiesta. Non un muro di grafici.

## 2. Scelta della forma

Il riferimento operativo è il **vocabolario visivo del Financial Times**: si parte dalla
*relazione* che interessa e si sceglie dentro quella famiglia.

| Intento | Come si riconosce | Forme tipiche | Cave da rispettare |
|---|---|---|---|
| **Deviazione** | scostamento da un riferimento (target, media, zero) | barre divergenti, stacked divergente, spine chart | sempre riferimento esplicito e linea di zero in evidenza |
| **Correlazione** | due variabili insieme | scatter, connected scatter, bubble, heatmap XY | mai suggerire causalità; non usare il colore per ridondare una delle due variabili |
| **Classifica** | ordine, testa-coda | barre ordinate, slope, lollipop, dot strip | ordina per valore, evidenzia i pochi che contano |
| **Distribuzione** | come si sparpagliano i valori | istogramma, boxplot, violin, piramide, dot plot | barre quasi attaccate nell'istogramma; dichiara la granularità dei bin |
| **Evoluzione nel tempo** | serie temporali | linea, colonne, area, fan chart, heatmap calendario | scegli il periodo che dà contesto; colonne per una serie sola; area solo per il totale |
| **Parte-tutto** | composizione | stacked 100%, pie/donut (≤4 fette), treemap, waterfall | il pie non confronta bene: se contano le dimensioni, passa a un grafico di magnitudine |
| **Magnitudine** | quanto è grande rispetto a… | barre/colonne, paired, simboli proporzionali, isotype | **barre e colonne sempre da zero**; isotype solo con numeri interi |
| **Spazio** | dove | choropleth (sempre tassi, non totali), simboli proporzionali (totali), mappa di flusso, dot density | mappe solo se la geografia è il punto; annota il pattern da vedere |
| **Flusso** | da dove a dove, quanto | Sankey, waterfall, chord, rete | leggibile solo con pochi nodi; etichetta i flussi maggiori |

Criteri di efficacia (Cleveland & McGill, Perceptual Edge): per confronti di valori usa **posizione e
lunghezza**; l'angolo e l'area si leggono peggio; il colore come *quantità* si legge peggio di tutto.
Quindi: barre per confrontare, linee per il tempo, scatter per le relazioni, colore per *categorie* o
*giudizi*, non per misure fini.

Prima di disegnare, prova due forme diverse e tieni la più leggibile: è più economico che rifare.

## 3. Struttura di un report

Un report è una **sequenza**: ogni sezione prepara la successiva e ognuna ha una sola idea.

1. **Sintesi (in cima, sempre)** — la conclusione per prima: 3-5 righe con il numero decisivo e la
   raccomandazione. Molti lettori si fermano qui: deve reggersi da sola.
2. **Domanda** — «perché i clienti nuovi se ne vanno?», non «abbiamo eseguito una regressione».
3. **Metodo e limiti in breve** — da dove vengono i dati, periodo, cosa è escluso, quanto è
   affidabile. Serve fiducia, non erudizione.
4. **Prove, una per sezione** — titolo-rivendicazione + grafico + 2-3 righe di lettura («la discesa
   inizia a marzo, quando cambia il fornitore di spedizioni»). Un grafico per affermazione.
5. **Raccomandazioni azionabili** — verbo, oggetto, responsabile, scadenza se possibile.
6. **Appendice** — dati completi, tabelle, note metodologiche.

Ordine di scrittura: **leggi la sequenza dei soli titoli**. Se i titoli, da soli, raccontano
l'argomento completo, il report è fatto bene. Se no, riscrivi i titoli (non i grafici).

## 4. Struttura di una dashboard

La dashboard è per il **monitoraggio e l'esplorazione**, non per la narrazione: deve rispondere a
«sta andando bene?» e «dove guardo?».

- **Screense**: in alto 4-7 indicatori decisionali con valore, unità e confronto (vs periodo
  precedente, vs target). Sotto, il dettaglio. Tutto il livello 1 visibile senza scroll, se possibile.
- **Gerarchia delle pagine**: una pagina sola se basta; altrimenti struttura *gerarchica* (panoramica
  → drill-down) per il monitoraggio operativo, *parallela* (schede per facet: area, prodotto) quando i
  domini sono indipendenti. Non mescolare i due criteri senza motivo.
- **Layout**: griglia a 12 colonne con spaziature uniformi; griglia "a schede" (bento) con pannelli di
  dimensioni *diverse* in base all'importanza — mai una matrice di riquadri identici, che appiattisce
  ogni priorità. Raggruppa con spazio bianco o sfondo, non con bordi.
- **Una domanda per pannello**, con un titolo che la dichiara. Il pannello che *guida* (l'andamento
  principale) prende più spazio.
- **Contesto obbligatorio**: fonte del dato, ultimo aggiornamento, unità di misura, definizione degli
  indicatori, eventuali esclusioni o dati mancanti. Una dashboard senza fonti non è credibile.
- **Densità informativa**: meglio un grafico ricco e leggibile che tre grafici vuoti; ma se un pannello
  ha meno di 5-6 punti dati, un numero puntuale o una tabella comunica meglio di un grafico.
- **Confronto sempre presente**: un valore da solo non dice nulla. Aggiungi periodo precedente, target
  o media storica — è il pezzo che trasforma un numero in una decisione.
- **Interazione solo se serve**: tooltip per il dettaglio, filtri per i segmenti, brush & link tra
  viste correlate. Ogni controllo deve essere raggiungibile da tastiera e avere un'etichetta.

## 5. Colore

Il colore ha cinque ruoli distinti, e vanno scelti consapevolmente:
**distinto** (colori diversi per elementi diversi), **condiviso** (palette unica dell'organizzazione),
**codifica** (mappa su categorie o scale), **semantico** (verde/rosso per bene/male, con il significato
dichiarato in legenda), **emotivo** (enfasi estetica, da usare con parsimonia).

Regole operative:

- **Ordine di codifica**: prima la posizione, poi la lunghezza, poi la forma/testo, **infine** il
  colore. Un colore in più di quelli necessari è rumore.
- **Enfasi, non arcobaleno**: una serie è l'eroe (colore acceso), tutto il resto in grigio neutro. Le
  altre serie si distinguono per posizione, non per colore.
- **Categorie**: massimo 6-8 colori, senza ridondanza cromatica (due azzurri vicini non si
  distinguono). Usa una palette qualitativa sicura per i daltonici (Okabe-Ito o equivalente).
- **Quantità**: scala sequenziale monocromatica (chiaro→scuro) per grandezze, **divergente**
  (due tonalità + neutro al centro) per scostamenti da un riferimento. Mai giudizio e quantità nella
  stessa scala.
- **Giudizio**: verde/ambra/rosso solo per soglie dichiarate, e sempre accompagnati da simbolo o
  etichetta testuale: chi non distingue il rosso deve comunque capire.
- **Contrasto**: testo ≥ 4.5:1 sullo sfondo; linee e simboli dati sufficiente contrasto reciproco;
  su fondo scuro evita colori spenti e saturazioni medie.

## 6. Testo dentro la visualizzazione

- **Titolo = rivendicazione** con il numero, quando c'è («latenza al 95° percentile raddoppia a
  novembre»). **Sottotitolo = unità, perimetro e fonte** («ms, servizio checkout, media oraria»).
- **Etichette dirette** invece della legenda, quando le serie sono poche: l'occhio non deve rimbalzare
  tra grafico e legenda. Le etichette stanno accanto alla fine della linea o sopra la barra.
- **Annotazioni** sui punti che contano: un evento, un cambio, un'impennata. È la parte che i grafici
  automatici non fanno e che rende un report utile.
- **Unità sempre esplicite** (%, €, ms, pezzi) e stessa unità lungo tutto il documento.
- **Numeri leggibili**: 1.2 M invece di 1.234.567 quando la precisione non serve; separatore delle
  migliaia coerente; decimali solo se significativi.
- **Testo minimo**: niente paragrafi dentro i grafici, niente etichette ruotate a 90° se si può
  evitare (accorcia le voci o passa a barre orizzontali).

## 7. Onestà grafica (il controllo che salva la reputazione)

- **Lie factor**: la dimensione grafica deve essere proporzionale al dato. Barre lunghe il doppio per
  un valore doppio; nessuna prospettiva, nessun 3D.
- **Barre e colonne da zero.** L'asse troncato su una barra mente sempre. Per le linee è ammesso un
  intervallo che non parte da zero *solo* se dichiarato e se il punto è la variazione, non il livello.
- **Nessun doppio asse verticale.** Se serve, due pannelli con lo stesso asse temporale.
- **Dati incompleti dichiarati**: buchi, periodi parziali, cambi di definizione, perimetri che
  cambiano. Un grafico che nasconde un cambio di metodologia è un grafico sbagliato.
- **Previsione ≠ misura**: tratteggio, tratteggio chiaro o banda di incertezza per i valori previsti;
  non spendere un colore pieno per una proiezione.
- **Denominatori e campioni**: percentuali su basi piccole vanno annotate («n=12»).
- **Non inventare mai un dato, una proporzione o una relazione.** Se manca, si dichiara l'assenza: un
  buco onesto vale più di una curva plausibile e falsa.
- **Asse temporale onesto**: intervalli regolari, nessun salto implicito.
- **Non in scala**: dichiaralo (in didascalia o nel `<desc>`), sempre.

## 8. Accessibilità

- SVG con `role="img"` e `aria-label`, più `<title>` e `<desc>` descrittivi come primi figli;
  i testi restano `<text>` scalabile, non tracciati né incisi in un'immagine.
- **La tabella dati è l'alternativa testuale vera**: quando i numeri contano, mettila nel report o in
  un blocco dati richiudibile. La descrizione non sostituisce i numeri.
- Il significato non dipende **mai** dal solo colore (WCAG 1.4.1): aggiungi forma, tratteggio,
  etichetta o valore scritto.
- Contrasto del testo ≥ 4.5:1 (WCAG 1.4.3); ordine di lettura coerente per chi usa screen reader.
- Strumenti interattivi (filtri, tab, tooltip) raggiungibili da tastiera, con focus visibile e nome
  accessibile.

## 9. Vincoli di questo ambiente

- **In chat l'SVG è sanitizzato**: niente `style`/`<style>`, `class`, filtri, `<foreignObject>`,
  `<image>`, `<use>`, `<marker>`, animazioni, `href`. Le punte delle frecce si disegnano con
  `<polygon>`/`<path>`. Il contratto completo è nella skill `visual-representation`: leggila prima di
  disegnare. Per grafici con molti elementi conviene comunque produrre un **file** in `media/` e non
  un blocco in chat.
- **Tema scuro**: sfondo `#08111f`, pannelli `#172033`/`#1d2634`, testo `#eef2f9`, testo secondario
  `#c6cfdd`, neutro attenuato `#8b97ac`. Palette dati coerente con l'interfaccia: blu `#5b9dff`,
  azzurro `#38bdf8`, viola `#8b5cff`, verde `#34d399`, giallo `#fbbf24`, rosso `#fb7185`. Per un solo
  accento: l'eroe prende il colore, il resto va in grigio.
- **La scheda dashboard di questo harness** usa di fatto il vocabolario "magnitudine + evoluzione nel
  tempo": numeri grandi per i KPI in alto, serie sotto, colore per lo stato. Vale la pena tenerla
  coerente con questi principi (nessun grafico decorativo, KPI sempre con confronto, unità visibili).
- **File generati**: vanno in `media/`. Un report autonomo = un file HTML singolo, senza CDN né
  dipendenze: si apre offline e si archivia.
- **Nessun dato personale o riservato** in ciò che finisce nel repository pubblico.

## 10. Checklist prima di consegnare

Scorri la lista; se una voce è "no" e non sai perché, correggi o dichiara l'eccezione.

- [ ] So dire in una frase cosa deve capire chi legge, ed è il titolo della prima sezione.
- [ ] I titoli dei grafici, letti in sequenza, raccontano da soli il messaggio.
- [ ] Ogni grafico ha una sola domanda, e la forma è quella giusta per il tipo di confronto.
- [ ] Unità di misura, perimetro e fonte sono scritti (e la data di aggiornamento).
- [ ] I KPI hanno un confronto (periodo precedente, target o media).
- [ ] Barre da zero, nessun doppio asse, nessuna scala troncata non dichiarata.
- [ ] Previsioni distinguibili dalle misure; dati mancanti e cambi di metodo dichiarati.
- [ ] Colore: accento unico per l'eroe, ≤ 8 categorie, significato non affidato al solo colore.
- [ ] Contrasto del testo ≥ 4.5:1; etichette leggibili senza zoom.
- [ ] Annotati gli eventi che spiegano i salti; eliminata ogni decorazione inutile.
- [ ] La tabella dati è disponibile per i numeri che contano.
- [ ] Verifica dei numeri: totale delle parti = totale dichiarato, percentuali sommano a 100, ordini
      di grandezza plausibili. Un grafico giusto con un numero sbagliato è peggio di nessun grafico.
- [ ] Nessun dato personale o riservato, nessuna credenziale nei file prodotti.
- [ ] Se il disegno non è in scala, è dichiarato.

## 11. Anti-pattern: se vedi X, fai Y

| Anti-pattern | Sostituzione |
|---|---|
| Pie con 7 fette | barre ordinate (o donut con ≤ 4 fette se il totale è il punto) |
| Due assi verticali (fatturato + margine) | due pannelli impilati con lo stesso asse temporale |
| Barre che partono da 80 | barre da zero, oppure punti/linee per la variazione dichiarando la scala |
| Serie temporale a torta per anno | linee o colonne, con l'evoluzione come asse |
| Arcobaleno di 12 categorie | grigio + accento per le 2-3 categorie che contano, resto etichettato |
| Titolo «Dati Q3» | «Le vendite Q3 salgono del 9%, trainate dal canale diretto» |
| Mappa coropletica con totali | tassi/quote (per abitante), altrimenti simboli proporzionali |
| Gauge semicircolari in griglia | un numero grande con delta e sparkline (le gauge sprecano spazio) |
| Griglia 3×3 di pannelli identici | pannello guida più grande + pannelli di supporto più piccoli |
| Semáforo verde/rosso senza testo | colore + etichetta o simbolo («sopra soglia», «▼») |
| Tooltip che contiene l'unica informazione | valore visibile nel grafico; tooltip solo per approfondire |
| Grafico con 1 punto dati | numero puntuale o tabella |
| 3D, ombre, sfumature decorative | piatto, due dimensioni, contrasto |
| Asse Y tagliato per "far vedere meglio" | scala onesta, oppure evidenzia il punto con un'annotazione |
| Grafico senza fonti né data | riga di metadati: fonte, perimetro, aggiornamento |

## 12. Fonti

Pratiche e standard da cui questa skill è derivata (verificate a settembre 2026):

- **FT Visual Vocabulary** (Financial Times, chart-doctor) — nove intenti comunicativi e famiglie di
  grafici con le relative avvertenze: <https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary>
- **Dashboard Design Patterns** (Bach, Freeman, Abdul-Rahman, Turkay, Khan, Fan, Chen — IEEE VIS
  2022, arXiv:2205.00757) — otto gruppi di pattern per componenti e composizione delle dashboard:
  <https://dashboarddesignpatterns.github.io/patterns.html>
- **IBCS, SUCCESS formula** (International Business Communication Standards, allineato a ISO 24896) —
  Say, Unify, Condense, Check, Express, Simplify, Structure: <https://www.ibcs.com/ibcs-version-2-0/>
- **Storytelling with Data** (Cole Nussbaumer Knaflic) — contesto, declutter, focus, checklist
  pre-pubblicazione: <https://www.storytellingwithdata.com/blog/my-pre-publication-checklist-for-an-effective-graph>
- **From Data to Viz** — albero decisionale per formato dei dati, con errori tipici per ogni grafico:
  <https://www.data-to-viz.com/>
- **Graph Selection Matrix** (Stephen Few, Perceptual Edge) — efficacia comparata delle codifiche
  visive: <https://www.perceptualedge.com/articles/misc/Graph_Selection_Matrix.pdf>
- **Edward Tufte**, *The Visual Display of Quantitative Information* — data-ink ratio, chartjunk, lie
  factor.
- **Okabe & Ito**, *Color Universal Design* (2008) — palette qualitativa sicura per i daltonici:
  <https://jfly.uni-koeln.de/color/>
- **WCAG 2.2**, criteri 1.4.1 (Uso del colore) e 1.4.3 (Contrasto minimo):
  <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>
- **Grafana, dashboard best practices** — gerarchia, drill-down, riuso, evitare lo sprawl di pannelli:
  <https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/>
- **Data Visualization Design Guidelines** (Carnegie Mellon University) — coerenza di stile,
  accessibilità e branding nelle visualizzazioni istituzionali:
  <https://www.cmu.edu/brand/brand-guidelines/data-viz.html>
- **Skill di agenti valutate** (settembre 2026): `chart-dashboard` di raghuramsirigiri (il più completo:
  scelta del grafico, layout bento, titoli-rivendicazione, tratteggio per le previsioni, audit
  automatico delle pagine), `chart-honesty` (controllo dell'integrità grafica),
  `kpi-dashboard-design` di aiagentskills (gerarchia dei KPI), `data-viz` di aladicf/better-web-ui
  (grafici e tabelle accessibili), `ux-ui-agent-skills` di plugin87 (design token e contrasto).
  Da queste è ripresa l'idea dei **titoli-rivendicazione**, del tratteggio per le previsioni e della
  separazione fra "grafico che dice" e "grafico che fa esplorare".
