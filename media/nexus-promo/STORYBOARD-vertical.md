---
format: 1080x1920
duration: 40s
message: "Il rumore non è informazione: Altair Nexus riduce 151 fonti a 9 storie che contano."
arc: Hook (rumore) → Promise (il filtro) → Proof ×4 (sintesi, dossier, storia, numeri) → CTA
audience: "professionisti informati italiani (25-55) che seguono AI, tecnologia, geopolitica, finanza"
mode: collaborative
music: none
---

## Video direction

- **Palette (da `frame.md`)** — fondo `bg-primary #0C1119`; testo `text-primary #EDF1F5`;
  secondario `text-secondary #AEB8C5`; accento primario `accent #78D8EE` (dati, etichette, il 9);
  hairline `rgba(174,199,228,0.24)` come **unico** dispositivo strutturale. Nessun riempimento pieno,
  nessuna ombra, nessun angolo arrotondato oltre 12px.
- **Tipografia** — display serif P052 (ruolo display, 700) per titoli e numeri; Nimbus Sans per
  etichette e testi di servizio; etichette sempre maiuscole con tracking ampio. Entrambi i font sono
  spediti come file locali in `assets/fonts/`.
- **Grammatica di movimento** — eases a coda lunga (`power2`/`power3`), nessuna molla, nessun bounce.
  **Modello di rivelazione guidato dalla voce**: a t=0 entra solo ciò che la voce sta dicendo; ogni
  elemento successivo appare quando la voce lo nomina, e le rivelazioni si distribuiscono anche nella
  seconda metà del frame. Ogni frame chiude su **lettura tenuta**: fermo, al massimo un jitter sub-pixel.
- **Ritmo / frame tenuti** — frame 02 e frame 07 sono i respiri: nel 02 il numero si posa e resta;
  nel 07 non si muove nulla di proposito. I frame 01, 03, 04 e 06 sono i più densi di movimento.
  Cambio di quadro ogni 2–3 s: il primo taglio arriva a 5,9 s, non a 7,5 come nella v1.
- **Voce e musica** — narrazione piper `it_IT-serena-high` (una traccia voce per frame, montata su
  track 10); bed musicale costruito in ffmpeg: rumore filtrato per i primi 5,8 s, colpo secco sul
  taglio, poi pad con battito ogni 2 s e crescendo negli ultimi 4 s — il suono fa lo stesso percorso
  dell'immagine. Bed a `data-volume 0.30`.
- **Disegno sonoro (v2)** — dodici effetti sintetizzati in ffmpeg e montati sulle giunzioni:
  `impact` sul taglio del rumore e sull'ingresso della chiusura, `whoosh` sulle entrate in campo
  (sintesi, dossier, storia), `tick` sul count-up del 9 e su ogni card della cascata metrica,
  `riser` di 2 s che sale nell'ultimo frame di prova e scarica nell'impatto finale. Volume per
  effetto in `audio_meta2.json`: nessun effetto sopra la voce.
- **Lista negativa** — mai: glow, ombre colorate, bordi spessi, gradienti viola/blu alla "AI",
  immagini stock, facce generate, dati inventati, cursori o chrome di browser. Mai i due modi di
  fallire il montaggio: **presentazione a schede** (tutto dentro al primo 25% e poi congelato) e
  **salvaschermo** (elementi che fluttuano senza dire niente).
- **Banda sottotitoli** — l'ultimo 17% dell'altezza (sotto y=896 a 1080p) resta libero in ogni frame.
- **Materiali reali** — catture del sito: `assets/hero-plate.png`, `assets/brief-plate.png`,
  `assets/story-1920.png`, `assets/metrics-plate.png` (non usata: le card sono ricostruite in HTML
  perché la cascata le anima una per una), più la firma `assets/universalis.png`.
  **Novità v2**: l'area Report entra nel video con tre ritagli reali — `assets/report-hero.png`
  (testata del dossier *Caso Iran 2026*), `assets/report-map.png` (mappa 3D del rischio e lettura
  Altair), `assets/report-scenari.png` (le tre traiettorie plausibili). Era il materiale più forte
  del sito e nella prima versione non c'era.

---

## Frame 1 — Il rumore

- type: hook
- blueprint: kinetic-type-beats (Adapt)
- src: compositions/vertical/v01-rumore.html
- status: animated
- duration: 5.9s
- poster: 4s
- transition_in: cut
- scene: Titoli reali del sito che scorrono velocissimi in tre colonne; stop secco sul nero.
- voiceover: "Geopolitica. Startup. Mercati. Scienza. Ogni giorno, oltre centocinquanta fonti."
- focal: i titoli reali dell'edizione (testo, non immagine)
- roles: i titoli delle storie = cutout (il vero soggetto) · fondo = background (nero pieno)
- asset_candidates: capture/screenshots/full-page.png, capture/screenshots/scroll-008.png

Adapt: tengo la firma del blueprint (il movimento È il testo), ma il canvas non è una riga centrata:
è una parete di titoli su tre colonne, con lo swap in-place sostituito dal flusso verticale.

Scene 1 (0.0–3.4s): tre colonne full-bleed di titoli reali dell'edizione scorrono verso l'alto a tre
velocità diverse (0,55x / 0,8x / 1,0x) già in movimento a t<0,2s; ogni titolo porta la sua categoria in
maiuscolo; un velo a gradiente orizzontale tiene leggibili i bordi. Framing full-width strip, densità alta,
3 piani di profondità dati da opacità decrescente verso i bordi. Alla parola "Geopolitica" la colonna
sinistra accelera di scatto.
Scene 2 (3.4–6.9s): con "ogni giorno, centocinquantuno fonti" le tre colonne accelerano e la densità
cresce, il velo si chiude ai lati; entra in basso a sinistra la riga serif "151 fonti. Ogni giorno."
che si compone parola per parola sulla voce.
Scene 3 (6.9–7.5s): taglio al nero: le colonne escono verso l'alto con un'accelerazione secca e il
quadro resta vuoto — è la giunzione, non una dissolvenza.

## Frame 2 — Il filtro

- type: product_intro
- blueprint: dataviz-countup (Adapt)
- src: compositions/vertical/v02-filtro.html
- status: animated
- duration: 5.0s
- poster: 4s
- transition_in: cut
- scene: 151 fonti ridotte a 9 storie: il numero trema come rumore, poi si compone e il 9 conta su.
- voiceover: "Il rumore non è informazione. Altair Nexus ne tiene nove."
- focal: il numero (nessun asset: il dato è il soggetto)
- roles: hairline = struttura · numero = cutout (il soggetto)
- asset_candidates: capture/assets/visual-editoriale-generato-dalla-sintesi.jpg

Adapt: la firma resta il count-up che il pubblico legge mentre la voce lo dice; il soggetto non è una
card ma una cifra nuda, e l'argomento è una sottrazione (151 → 9), non una crescita.

Scene 1 (0.25–1.9s): fondo nero, hairline orizzontali. La frase-tesi "Il rumore non è informazione."
entra centrata in alto; il 151 è già grande (serif, 300 px) ma **instabile**: oscilla di 3 px in su e in
giù, come rumore.
Scene 2 (1.9–2.4s): la frase esce verso l'alto; il numero smette di tremare e si allinea; entra il nome
"Altair Nexus" con la sua hairline che si disegna da sinistra.
Scene 3 (2.7–3.6s): la freccia si disegna verso destra (signature move del count-up: il movimento è il
numero, non la decorazione) e l'etichetta "fonti analizzate" appare sotto il 151.
Scene 4 (5.55–6.5s): alla parola "nove" il 9 conta su da 0 e si accende in accento, con l'etichetta
"storie in edizione". Lettura tenuta fino alla fine: numero, freccia e firma fermi.

## Frame 3 — La sintesi del giorno

- type: feature_showcase
- blueprint: zoom-out-workspace-reveal (Adapt)
- src: compositions/vertical/v03-sintesi.html
- status: animated
- duration: 5.0s
- poster: 5s
- transition_in: crossfade
- scene: Zoom-out da una riga del brief alla sezione Aion Brief intera, con il visual editoriale.
- voiceover: "Una sintesi: il segnale dominante, il tema del giorno, cosa osservare."
- focal: assets/brief-plate.png
- roles: brief-plate = cutout (la prova) · fondo = background
- asset_candidates: capture/screenshots/scroll-016.png, capture/assets/visual-editoriale-generato-dalla-sintesi.jpg

Adapt: la firma è il pull-back unico e continuo; qui non rivela un "workspace" ma il salto di scala
fra una riga di testo e l'edizione intera che la contiene.

Scene 1 (0.05–2.5s): la cattura reale della sezione entra già zoomata (~1,95x) sul riquadro "cosa
osservare" — si legge "Capacità di trasformare annuncio in adozione reale" — mentre la voce dice "ogni
mattina, una sintesi". Il contesto fuori dal riquadro resta scuro, il bordo hairline è visibile.
Scene 2 (2.5–3.9s): un unico zoom-out decelerante scopre la sezione intera: l'immagine generata dalla
sintesi al centro, il bordo del riquadro che si allarga fino a contenerla.
Scene 3 (3.9–5.5s): le tre etichette si accendono una per una sulle loro voci — "il segnale dominante"
(Startup), "il tema del giorno" (Riposizionamento competitivo) — ciascuna con l'etichetta che passa da
grigio ad accento.
Scene 4 (5.5–6.7s): alla voce "e cosa osservare" si accende la terza etichetta, quella che era il punto
di partenza: la camera è già ferma, nessun drift residuo.

## Frame 4 — Il dossier

- type: feature_showcase
- blueprint: camera-journey (Adapt)
- src: compositions/vertical/v04-dossier.html
- status: animated
- duration: 7.5s
- poster: 5s
- transition_in: cut
- scene: Dalla testata del report alla mappa 3D alle tre traiettorie: un unico campo, la camera viaggia.
- voiceover: "Quando una storia merita di più, diventa un dossier: sei assi di rischio, tre scenari, e i limiti dichiarati."
- focal: assets/report-map.png
- roles: report-hero = cutout nella prima scena · report-map = cutout (il soggetto che resta) · report-scenari = supporting in chiusura
- asset_candidates: capture/assets/visual-editoriale-generato-dalla-sintesi.jpg

Adapt: la firma del blueprint è la camera che viaggia dentro lo stesso mondo invece di cambiare quadro;
qui il "mondo" è il dossier e le sue tre superfici (testata, mappa, traiettorie) sono la stessa pagina.

Scene 1 (0.05–2.1s): la testata del report entra spingendo dentro (scala 1,06 → 1,0) mentre la voce dice
"quando una storia merita di più"; l'occhiello "Report AI · dossier a sei assi" è già in alto, e il dato
"6 assi di rischio" entra da destra con il suo hairline.
Scene 2 (2.1–4.8s): la testata si ritira (scala 0,42, opacità 0,35) e **lascia il campo alla mappa 3D**,
che entra spingendo (1,18 → 1,0) con un pan lentissimo sul campo di nodi: un unico movimento continuo,
non un taglio. La voce nomina i sei assi mentre la mappa è in campo.
Scene 3 (4.8–7.5s): la mappa si abbassa di opacità e **le tre traiettorie salgono dal basso** e si posano
sul bordo inferiore: de-escalation, attrito negoziale, nuova escalation — con i limiti dichiarati che la
voce nomina per ultimi. Un velo leggerissimo chiude il quadro, che resta leggibile e fermo.

## Frame 5 — La storia smontata

- type: feature_showcase
- blueprint: transcript-scroll-artifact-reveal (Adapt)
- src: compositions/vertical/v05-storia.html
- status: animated
- duration: 6.9s
- poster: 6s
- transition_in: cut
- scene: La pagina della storia scorre a sinistra mentre a destra si accendono opinione, perché conta e fonte.
- voiceover: "Per ogni storia: cosa è successo, perché conta, e la lettura di Aion. Con la fonte dichiarata."
- focal: assets/story-1920.png
- roles: story-1920 = cutout (la pagina reale che scorre) · le due card di lettura = supporting evidenziate
- asset_candidates: capture/screenshots/scroll-024.png, capture/screenshots/scroll-032.png

Adapt: la firma resta la traversata verticale del documento come prova; la pagina reale scorre invece
di essere ricostruita, e la "pivot interaction" è l'accensione di tre elementi già presenti (le due
card e il pill della fonte, testi presi parola per parola dal sito).

Scene 1 (0.05–2.9s): la pagina storia entra in una cornice hairline a sinistra e scorre verso l'alto a
velocità costante; a destra le due card di lettura sono già presenti a bassa opacità (non entrano dal
nulla). La voce legge "per ogni storia: cosa è successo".
Scene 2 (2.9–4.15s): alla voce "perché conta" la card "Perché conta" si accende — bordo e etichetta in
accento, sfondo appena illuminato, opacità piena; lo scorrimento rallenta.
Scene 3 (4.15–5.7s): alla voce "e la lettura di Aion" si accende la card "L'opinione di Aion" con lo
stesso gesto, un gradino più in basso.
Scene 4 (5.7–7.6s): alla voce "con la fonte, sempre dichiarata" si accende il pill "Fonte: TechCrunch",
ultimo elemento del frame — è il punto che distingue il prodotto. La traversata si esaurisce e il quadro
resta leggibile e fermo.

## Frame 6 — Lo stato dell'edizione

- type: benefit_highlight
- blueprint: grid-card-assemble (Adapt)
- src: compositions/vertical/v06-metriche.html
- status: animated
- duration: 5.2s
- poster: 4s
- transition_in: cut
- scene: Le sei card delle metriche reali si assemblano in griglia sotto la voce.
- voiceover: "Nove storie. La categoria più calda, l'intensità della giornata."
- focal: le card metriche (dati reali del sito, ricostruite in HTML)
- roles: le card = cutout · hairline = struttura · fondo = background
- asset_candidates: capture/screenshots/scroll-065.png

Adapt: la firma è la cascata sfalsata che costruisce la griglia; le card non sono inventate — portano
i valori reali dell'edizione del 12 ottobre, e ognuna entra sulla sua voce.

Scene 1 (0.05–2.7s): fondo nero, titolo serif "Stato dell'edizione" e la sua hairline che si disegna
da sinistra; alla voce "nove storie" entra la card **9** (solleva di 22 px e si posa), alla voce
"centocinquantuno fonti" la card **151** con la sua hairline che si disegna.
Scene 2 (3.05–6.0s): alla voce "la categoria più calda" entra **Geopolitica**; alla voce "l'intensità
della giornata" entra **Alta**; poi, nella coda della frase, entrano le due metriche che la voce non
legge — **3/8** e **12 ott, 17:04** — così la griglia si completa senza che nulla sia stato versato in
blocco all'inizio.
Scene 3 (6.0–6.5s): tenuta: la griglia completa è ferma e leggibile.

## Frame 7 — Le notizie che contano

- type: cta
- blueprint: titlecard-reveal (Reproduce)
- src: compositions/vertical/v07-chiusura.html
- status: animated
- duration: 4.5s
- poster: 3s
- transition_in: cut
- scene: La testata reale a sinistra, a destra nome, indirizzo e firma; il quadro si ferma e tiene.
- voiceover: "Le notizie che contano. Nexus punto universalis punto it."
- focal: assets/hero-plate.png
- roles: hero-plate = cutout (la testata reale) · universalis.png = supporting (la firma) · fondo = background
- asset_candidates: capture/screenshots/scroll-000.png, capture/assets/universalis-produzioni.png

Reproduce: due rivelazioni, una per frase: prima la testata, poi nome, indirizzo e firma; e un solo
movimento ciascuna. Il testo a destra è cambiato rispetto al foglio degli schizzi — che prevedeva di
ripetere "Le notizie che contano." — perché il titolo è già dentro la testata a sinistra: ripeterlo
sarebbe stato ridondante, e la chiusura guadagna mettendo invece nome, indirizzo e firma.

Scene 1 (0.05–1.7s): la cattura della testata entra in dissolvenza con un alzarsi di 34 px, e una maschera
a gradiente chiude il bordo destro verso il blocco di testo; alla fine della frase il quadro è fermo.
Scene 2 (2.05–3.6s): alla voce "Altair Nexus" entra il nome con la sua hairline; alla voce "nexus punto
universalis punto it" entra l'indirizzo in accento, grande e leggibile; subito dopo la firma Universalis
Produzioni con il ruolo. Da qui **non si muove più nulla**: è il frame tenuto che chiude il video e
produce il click.
