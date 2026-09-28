---
name: design-craft
description: "Governa la qualità visiva di interfacce, pagine e artefatti: gerarchia, griglia e spaziatura, tipografia, colore e contrasto, superfici, stati, più il metodo per criticare un design esistente in modo utile. Usala quando devi progettare o rifinire una schermata, una pagina HTML, una relazione visiva o un componente, quando qualcosa «non si legge bene» o «sembra fatto dall'IA», e quando devi dare una critica di design; per grafici e report di dati la skill di riferimento è report-dataviz."
---

# Design visivo

Progettare è **decidere cosa conta**: quale elemento guida l'occhio, cosa è secondo, cosa è
contorno. Il resto (fonte, colore, spaziatura) sono strumenti per rendere evidente quella
decisione. Un design brutto è quasi sempre un design **indeciso**.

## Quando usarla

- devi creare o rifinire una schermata, una pagina, un componente, un artefatto visivo;
- qualcosa «non si legge bene», «sembra affollato», «sembra generico / fatto dall'IA» e non sai
  perché;
- devi valutare un design e dare una critica utile invece di un'opinione;
- stai definendo uno stile coerente (token, scala tipografica, palette) da riusare.

Grafici, dashboard e report di dati → `report-dataviz`. Schemi, diagrammi, mappe concettuali →
`visual-representation`.

## L'ordine delle decisioni

Saltare l'ordine è la causa numero uno dei design confusi.

1. **Contenuto e intento**: cosa deve fare chi guarda, in che contesto, per quanto tempo.
2. **Gerarchia**: cosa è primo, secondo, terzo. Si decide qui, non con il colore.
3. **Struttura**: griglia, zone, raggruppamenti, flusso di lettura.
4. **Scala tipografica e spaziatura**: i due sistemi che rendono visibile la gerarchia.
5. **Colore e contrasto**: rinforza la gerarchia, non la crea.
6. **Dettagli e stati**: focus, hover, vuoti, errori, caricamento.
7. **Rifinitura**: allineamenti, bordi, raggi, ombre, micro-spaziature.

Se il passo 2 è debole, nessuna rifinitura lo salva.

## 1. Gerarchia

- **Un elemento guida per schermata.** Se tutto è importante, niente lo è. Se ti serve
  competizione, deve essere *voluta* e simmetrica.
- Costruisci la gerarchia con **almeno due strumenti** tra: **scala** (dimensioni), **peso**
  (spessore), **contrasto** (chiaro/scuro), **colore** (solo l'accento avanza), **spazio** (più
  aria = più importanza), **posizione** (in alto a sinistra si guarda per primo, in basso a destra
  si ignora).
- Il peso visivo deve corrispondere alla priorità del contenuto. Una navigazione più rumorosa del
  contenuto che serve è un errore di gerarchia.
- **Prova pratica**: copri metà schermo. Si capisce ancora cosa conta di più? Se no, la gerarchia è
  troppo debole o troppo diffusa.
- Anti-pattern: usare solo la dimensione (layout monotono), mettere tutto in grassetto (il grassetto
  smette di funzionare), due inviti all'azione di pari forza nella stessa schermata.

## 2. Griglia e spaziatura

Lo spazio non è ciò che resta: è materiale di progetto. Separa, raggruppa, dà enfasi.

- **Scala di spaziatura fissa**: 4, 8, 12, 16, 24, 32, 48, 64 (passo 4 o 8). Nessun valore
  fuori scala: `15px` accanto a `16px` è un difetto visibile anche a chi non sa nominarlo.
- **Prossimità = relazione**: elementi correlati vicini, elementi estranei lontani. La distanza
  *dichiara* la struttura. Spaziatura uniforme fra tutto appiattisce le relazioni.
- **Quattro modi per raggruppare**, dal più forte al più debole: contenitore (bordo/sfondo),
  prossimità, somiglianza, allineamento in linea continua. Se usi due modi insieme, spesso puoi
  togliere il contenitore.
- **Densità coerente con l'uso**: strumenti di dati possono essere densi; contenuti da leggere
  respirano. Non applicare una sola densità a tutto il prodotto.
- **Ritmo**: regolare (spaziature e dimensioni costanti) per dati, tabelle, liste; sincopato
  (regolare con rotture intenzionali) per pagine editoriali. Il ritmo deve corrispondere al
  contenuto.
- L'aria bianca in un prodotto ben progettato è circa il **40-60%** dell'area. Non è spazio
  sprecato: separa e dà autorevolezza.
- Allineamento: tutto su una griglia, pochi assi (2-3 per schermata bastano). Elementi
  *quasi* allineati sono peggio di elementi non allineati.

## 3. Tipografia

- **Scala matematica**, non numeri a caso: rapporto 1.25 (compatta), 1.333 (equilibrata), 1.5
  (editoriale). Esempio con 1.25 da 16: 16 · 20 · 25 · 31 · 39 · 49.
- **Massimo 4-6 misure per schermata**, ognuna con un ruolo dichiarabile («titolo di pagina»,
  «intestazione di pannello», «testo», «etichetta», «nota»). Se una misura non ha un ruolo, è
  rumore.
- **Pesi**: 1-2 pesi = disciplina (la gerarchia viene da scala e spazio); 3 = intervallo normale;
  4 o più = di solito nessuna decisione presa.
- **Interlinea in rapporto al ruolo**: testo corrente 1.5-1.7; titoli 1.1-1.3; etichette 1.2-1.4.
  La stessa interlinea per tutto è un errore.
- **Spaziatura fra lettere**: nel testo corrente non si tocca; sulle maiuscole corte aggiungi
  il 2-5%; sui titoli molto grandi si può stringere leggermente.
- **Larghezza di riga 45-75 caratteri** (ideale ~66). Riga troppo lunga e l'occhio perde il ritorno;
  testo centrato solo fino a 3 righe, mai per paragrafi.
- **Per dati e numeri**: cifre tabellari, allineamento a destra per le quantità, monospaziato o
  font con cifre larghe uguali quando i numeri vanno confrontati in colonna.
- **Una sans funzionale** è la scelta più sicura per le interfacce: lettere ben distinguibili
  (`I` maiuscola, `l` minuscola, `1` devono differire), altezza della x ampia, pesi robusti
  (niente pesi sottili per testo piccolo), caratteri progettati per l'interfaccia.
- Un secondo carattere solo per i titoli, se serve un tono (serif = autorevole, arrotondato =
  amichevole). Oltre due famiglie è quasi sempre troppo.

## 4. Colore

- **Ogni colore ha un ruolo**, e i ruoli non si mescolano: *strutturale* (sfondi, bordi, superfici),
  *semantico* (errore, avviso, successo), *accento* (azione principale, evidenza), *decorativo*
  (da usare con estrema parsimonia).
- I **neutri fanno l'80-90% del lavoro**. Una palette di 2-3 colori usata con intenzione batte una
  di 7 colori usata a caso. Prima di aggiungere un colore: *si può togliere senza perdere
  informazione?*
- Un colore semantico significa sempre la stessa cosa in tutto il prodotto. Rosso per l'errore e
  anche per "in evidenza" è un conflitto.
- **Contrasto**: WCAG 2.2 AA → 4.5:1 per testo piccolo, 3:1 per testo grande (≥ 24px o ≥ 18,66px
  in grassetto) e per i confini di elementi interattivi. Le soglie più delicate sono il testo
  secondario, il segnaposto degli input, le icone piccole, i bordi dei campi.
  Per un giudizio più fedele alla percezione usa **APCA**: ≥ 90 è preferibile per il testo
  corrente, 75 minimo per testo ≥ 18px, 60 per testo secondario, 45 per testo grande.
- **Scale di colore**: costruiscile in **OKLCH** (o comunque con luminosità percettivamente
  uniforme) invece che schiarendo/scurendo in RGB: le tinte restano equidistanti e i contrasti
  reggono.
- **Tema scuro non è il tema chiaro invertito**: riduci la saturazione, evita testo bianco puro su
  fondo nero (usa un bianco leggermente attenuato), sostituisci le ombre con variazioni di
  superficie (elevazione = superficie più chiara), dichiara `color-scheme` così i controlli nativi
  seguono il tema.
- Il colore **non è mai l'unico portatore di significato**: aggiungi icona, sottolineatura, bordo,
  tratteggio o etichetta. Vale per errori, link, stati, serie di dati.

## 5. Superfici e contenitori

- Le **card** non sono un contenitore universale: servono per collezioni di contenuti eterogenei da
  sfogliare, dove ogni voce è un ingresso a un dettaglio. **Mai card dentro card.**
- Alternative, dalla più leggera alla più pesante: spazio bianco → riga di separazione → intestazione
  → sfondo attenuato → bordo → card → pannello → dialogo. Scegli la più leggera che comunica il
  raggruppamento.
- Non usare card per: elenchi di testo omogenei (una lista si scorre più in fretta), una singola
  sezione (basta un titolo e spazio), campi di un modulo (usa `fieldset` e spaziatura), dati
  tabellari (una tabella).
- Ombre, raggi e bordi: **pochi valori, ripetuti con coerenza** (2-3 livelli di elevazione, 2-3
  raggi). Un raggio diverso per ogni riquadro si vede e sembra sciatto.
- Evita i segnali di "generato in serie": gradiente viola-blu su tutto, riquadri identici in griglia
  senza gerarchia, paste di icone a caso, interlinee sospette, scala tipografica piatta, testo
  centrato ovunque.

## 6. Stati e dettagli interattivi

Un design è finito solo quando ha tutti i suoi stati.

- Stati da prevedere, sempre: **riposo, passaggio del puntatore, focus da tastiera, attivo,
  disabilitato, selezionato, errore, caricamento, vuoto** (il vuoto va progettato con un testo che
  spiega cosa fare, non con una schermata bianca).
- **Focus visibile** per chi naviga da tastiera: bordo o anello evidente, con contrasto ≥ 3:1.
- Bersagli cliccabili di almeno 24×24 px (meglio 44×44 su mobile), con area di rispetto.
- Transizioni brevi (150-250 ms) e con una funzione di andamento naturale: servono a spiegare un
  cambiamento, non a intrattenere. Rispetta `prefers-reduced-motion`.
- Il testo dei pulsanti descrive l'azione («Salva la bozza»), non l'intenzione vaga («Ok»).
- L'errore dice cosa è successo, dove e come rimediare, accanto al campo che l'ha causato.

## 7. Come si critica un design

Il metodo conta più dell'opinione. Segui questo ordine e non salti passi.

1. **Dichiara l'intento apparente** del progetto: cosa sta cercando di fare, per chi.
2. **Dai la prima occhiata cronometrata**: dove va l'occhio nei primi 3 secondi? Era l'elemento
   previsto?
3. **Tre osservazioni specifiche in dieci secondi**, mai impressioni: «il titolo e la navigazione
   hanno lo stesso peso», non «sembra confuso».
4. **Distingui ciò che funziona** (decisioni concrete, non estetica) **da ciò che non funziona**
   (con il motivo).
5. **Indica l'unica modifica a maggior impatto**, in ordine di priorità: prima struttura e
   gerarchia, poi spaziatura, poi tipografia, poi colore, infine decorazione.
6. **Vietato il vocabolario vago**: pulito, bello, moderno, elegante, minimale, audace, "wow".
   Ogni volta, sostituiscilo con un'osservazione su gerarchia, peso, ritmo, densità o contrasto.

Le otto dimensioni da valutare (dalla rubrica anti-slop), ognuna forte/debole:

| Dimensione | Forte | Debole |
|---|---|---|
| Identità visiva | punto di vista riconoscibile | sembra un modello predefinito |
| Gerarchia | priorità ovvia fra titolo, contenuto, azioni | tutto compete alla pari |
| Tipografia | scala, pesi e ritmo intenzionali | piatta, di sola utilità |
| Spazio e struttura | la spaziatura costruisce la struttura | arbitraria, stretta o gonfia ovunque |
| Colore e contrasto | sostiene significato e identità | gradiente generico, grigi a basso contrasto |
| Dettaglio interattivo | stati e transizioni curati | funziona solo lo stato di riposo |
| Coerenza di sistema | i componenti sono una famiglia | ogni sezione sembra nata a parte |
| Specificità | la forma corrisponde al prodotto e all'uso | lo stesso layout andrebbe bene per qualsiasi cosa |

Sette-otto voci forti = lavoro solido. Tre-quattro = mediocre, va ripreso dalla gerarchia.

## 8. Applicazione a questo ambiente

- L'interfaccia dell'harness è **scura**: sfondo `#08111f`, superfici `#172033` e `#1d2634`, testo
  `#eef2f9`, testo secondario `#c6cfdd`, attenuato `#8b97ac`; accenti blu `#5b9dff`, azzurro
  `#38bdf8`, viola `#8b5cff`, verde `#34d399`, giallo `#fbbf24`, rosso `#fb7185`.
  Nuovi elementi devono usare questi valori (o derivarne in OKLCH), non inventarne di nuovi.
- Le tab della dashboard sono molte: la regola utile è che **una sola è "prima"**, e ogni schermata
  deve avere un elemento dominante. Se due pannelli hanno lo stesso peso, va corretto là.
- Niente `style` inline dove esistono già i fogli di stile; niente dipendenze esterne nei file
  generati (devono funzionare offline).
- File generati: in `media/`. Niente dati personali o riservati in ciò che entra nel repository
  pubblico.

## 9. Checklist prima di consegnare

- [ ] C'è un elemento dominante evidente, e lo è anche coprendo metà schermata.
- [ ] La gerarchia usa almeno due strumenti (non solo la dimensione).
- [ ] Ogni spaziatura è sulla scala; nessun valore fuori griglia.
- [ ] La prossimità riflette le relazioni; i gruppi si capiscono senza bordi.
- [ ] Massimo 4-6 misure tipografiche, ognuna con un ruolo.
- [ ] Interlinea differenziata per ruolo; righe entro 75 caratteri.
- [ ] Pesi tipografici ≤ 3, ognuno con una funzione.
- [ ] Neutri dominanti; ogni colore ha un ruolo dichiarabile; nessun conflitto semantico.
- [ ] Contrasto: 4.5:1 testo piccolo, 3:1 testo grande e controlli; verificato, non stimato.
- [ ] Nessun significato affidato al solo colore.
- [ ] Card usate solo dove servono, nessuna card dentro un'altra.
- [ ] Raggi, bordi ed elevazioni sono pochi e coerenti.
- [ ] Stati presenti: hover, focus, attivo, disabilitato, errore, caricamento, vuoto.
- [ ] Focus da tastiera visibile e ordine di tabulazione sensato.
- [ ] Niente segnali di "generato in serie" (gradiente universale, griglie identiche, tutto centrato).
- [ ] Se il design deve reggere dati, il testo usa cifre tabellari e gli assi sono allineati.

## 10. Fonti

- **Taste-Skills** (Dragoon0x) — la raccolta più organica di "giudizio visivo" per agenti:
  `hierarchy-principles`, `spatial-rhythm`, `type-systems`, `type-selection`, `color-systems`,
  `visual-audit`, `written-critique`, `design-critique`:
  <https://github.com/Dragoon0x/taste-skills>
- **Effective UI Design** (sebastian-software) — regole concrete di UI: contrasto WCAG e APCA,
  palette OKLCH, griglia di spaziatura, tipografia funzionale, tema scuro:
  <https://github.com/sebastian-software/effective-ui-design-skill>
- **Awesome Design Agent Skills** (frankxai) — mappa ragionata delle skill di design e **rubriche**
  di valutazione (anti-slop, qualità UI, gate "premium"); da qui viene la struttura di critica a otto
  dimensioni: <https://github.com/frankxai/awesome-design-agent-skills>
- **Critica visiva** (Owl-Listener, `critique-visual-hierarchy`, `critique-screen`) — revisione per
  gerarchia, composizione, tipografia, colore, affordance, densità:
  <https://claudeskills.info/skills/Owl-Listener/designer-skills/critique-visual-hierarchy/>
- **WCAG 2.2** — contrasto minimo (1.4.3) e uso del colore (1.4.1):
  <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html> ·
  <https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html>
- **APCA** (Accessible Perceptual Contrast Algorithm), base del contrasto in WCAG 3:
  <https://git.apcacontrast.com/>
- **OKLCH e scale percettivamente uniformi** — <https://oklch.com/> ·
  **`color-scheme`** — <https://web.dev/articles/color-scheme>
- Materiale sulla tipografia di sistema e sul raggruppamento visivo: principi della Gestalt
  (prossimità, somiglianza, continuità) e le linee guida di leggibilità (45-75 caratteri, interlinea
  1.5-1.7 nel testo corrente) riprese da *Butterick's Practical Typography* e dalle guide di
  accessibilità dei contenuti: <https://practicaltypography.com/>
