# Interfaccia: il sistema visivo della dashboard

Questo documento è la fonte unica delle decisioni visive di `dashboard.html`: si legge prima di
toccare colori, spaziature o il comportamento su telefono. Le scelte sono espresse **una volta** nei
token in `:root` e poi usate: nessun colore «a mano» dentro le regole.

## 1. Sfondo nero pieno

| token | valore | ruolo |
|---|---|---|
| `--bg` | `#000000` | sfondo dell'app e area della conversazione (nero puro, nessun gradiente) |
| `--bg-soft` | `#07080b` | superfici appoggiate sul nero (footer, editor file) |
| `--panel` | `#0f131a` | card e bolle |
| `--panel-2` | `#171c26` | controlli (pill, select, input) |
| `--panel-3` | `#1d2230` | interno dei controlli (scrollbar, barre) |
| `--panel-4` | `#2a3140` | bordo attivo / hover |
| `--border` | `#2b3240` | contorno delle card |
| `--border-soft` | `#1c222b` | separatori interni |
| `--glass` / `--glass-soft` | `rgba(7,8,11,.78)` / `.62` | barre in vetro (header, footer, toolbar, fascia statistiche) |

Il nero puro non è «gratis»: due superfici scure non si distinguono per il riempimento, quindi la
separazione la fanno **il bordo** e la scala dei pannelli, appena più chiara di prima. Le ombre, su
fondo nero, non si vedono: non contano nella gerarchia (restano solo su drawer, toast e modali).

## 2. Testo e contrasto

`--text` `#eef2f9` · `--text-soft` `#c6cfdd` · `--dim` `#a3adc0` (etichette di servizio) ·
`--faint` `#8a93a6` (micro-testo). Le quattro gradazioni restano ognuna sopra **4,5:1** su tutte le
superfici di testo (`--panel`, `--panel-2`, `--panel-3`): è il minimo WCAG AA per il testo piccolo.
Chi cambia un token di testo deve rimisurare il contrasto su `--panel-3`, il pannello più chiaro.

## 3. Una sola densità

La densità «comoda / compatta» è stata **rimossa** (pulsante, icona `i-dens`, blocco
`html[data-densita]` e il relativo JavaScript): due rese quasi identiche non giustificavano un
comando in più nella barra, che su telefono è affollata. C'è una sola resa, curata. Se un giorno
servisse un controllo di leggibilità, la casella giusta è la **dimensione del testo**, non la
densità: cambierebbe qualcosa di percepibile.

## 3-bis. La stella del progetto e la vista 📦

Nel file manager ogni cartella ha una **stella**: ☆ la segna come cartella del progetto, ★ la
toglie (il click non entra nella cartella: `stopPropagation` nella riga, perché segnare non è
navigare). Le cartelle segnate si vedono nella vista **📦 progetto**, con file, dimensione e
ultima modifica, una è **attiva**, e l'agente le riceve nel contesto (vedi `docs/MANUALE.md`).
Regole visive: la stella ha bersaglio 40px (44 su telefono) e sta a destra della riga; l'elenco
dei file dentro una card usa righe sottili (32px, 40 su telefono) con il nome cliccabile in
colore d'accento e le azioni a destra, per non trasformare la card in un muro di pulsanti.

## 4. Telefono (≤ 760px)

Misure prese con emulazione iPhone 12 (viewport 390×844), pagina servita e contenuti veri:

| elemento | prima | ora |
|---|---|---|
| header | 4 righe, ~190px | 2 righe, **119px** |
| composer (campo vuoto) | 2 righe di suggerimento, ~150px | **58px** |

Come:
- il **logo** sparisce sotto i 760px (resta l'icona dell'app nella home screen e nella scheda):
  occupava una riga intera senza dire nulla di utile;
- la prima riga tiene insieme ☰, le linguette, lo stato e il pulsante statistiche; la riga dei
  **tools** è forzata a capo (`flex: 1 1 100%`) e scorre in orizzontale, con il tasto «features»
  sempre come primo elemento;
- se lo schermo è troppo stretto, il wrap riporta un elemento a capo invece di tagliarlo: mai
  `overflow: hidden` sull'header;
- il **suggerimento del campo di scrittura** si accorcia a «Scrivi un prompt…» quando il campo è
  stretto (restano ~180px fra le icone e il pulsante) e torna lungo su schermo grande. È una riga
  di JavaScript che reagisce a `matchMedia`, non un secondo testo nel markup;
- i bersagli tattili restano ≥ 44px (`@media (pointer: coarse), (max-width: 860px)`).

## 5. Fascia statistiche

Nove voci su una riga: sotto i 1500px i valori passano a 13px. La soglia era 1400px, ma la regola
di compattazione aveva **la stessa specificità** di quella generale più in basso nel foglio: vinceva
quest'ultima e i valori lunghi («38% · 74k / 195k», `/root/pi-harness`) restavano troncati. Ora la
regola dentro la media query usa il selettore `#stats .stat .value`. Chi aggiunge regole `#stats`
deve tenerne conto. Una decima voce (es. «spazio» su un'istanza con quota) entra nella stessa
griglia senza regole nuove.

## 5-bis. Live view: usarla come un browser

La vista live non è un riquadro da guardare ma **un browser da usare**: click, doppio click,
trascinamento, passaggio del mouse (hover e menu a comparsa), tasto destro, dito che scorre la
pagina, cronologia indietro/avanti, tastiera, schermo intero e ingrandimento.

**Il frame coincide con l'area.** Con la vista aperta il viewport del browser remoto viene portato
alla misura del riquadro (`POST /api/browser/viewport`, debounce 500ms, `ResizeObserver` sul
riquadro — non sulla finestra, perché l'area cambia anche aprendo il log o entrando in schermo
intero). Effetto: niente bande nere, e su un telefono la pagina è impaginata *per il telefono*
invece di essere un francobollo. All'uscita dalla vista il viewport torna com'era (1280×720),
perché quel browser è anche quello dell'agente.

**Le cromature non rubano spazio** (misure su 390×844):

| stato | riquadro | cosa cambia |
|---|---|---|
| log aperto | 375px | log 76px + campo comandi 44px |
| log chiuso | **507px** | a log chiuso sparisce anche il campo comandi (`.livechatlog.hidden ~ .livechatin`) |
| schermo intero | **681px** | il log si chiude da sé e torna com'era all'uscita; se lo riapri è un **pannello sopra** il riquadro |

La barra dei comandi sta su **una riga** con le sole icone: le etichette lunghe («prendi il
controllo», «ferma», «guarda») sono dentro `span.lbl-largo`, che sotto i 760px non si vede; lo stato
dell'ingrandimento resta perché è corto e informativo (`1:1`, `2×`). La **navigazione** (`◀ ▶ ↻`)
sta dentro la barra indirizzi, come in un browser, invece di occupare una riga propria; le frecce
`↑ ↓` si tolgono su telefono (col dito si scorre trascinando la pagina). Il campo indirizzi è alto
44px, i pulsanti della barra 40px, i tre della navigazione 44px.

**Ingrandimento** (`⤢ adatta → 1:1 → 2×`) e **schermo intero** (`⛶`) sono classi
(`.livestage.zoom-1x`, `.livewrap.full`) e non trasformazioni inline. Con l'ingrandimento attivo la
rotellina e il dito muovono il **riquadro** (pan locale: `overflow:auto`), non la pagina remota —
prima la rotella scorreva il sito sotto un'immagine ferma. A riquadro adattato vale il contrario, e
il tocco diventa click / lo swipe diventa scorrimento (`touch-action:none` solo in quello stato).

**Schermo intero** prova prima l'API Fullscreen sull'elemento della vista (schermo intero vero,
senza header della dashboard, con Esc gestito dal browser) e ripiega sull'overlay `position:fixed`
se il browser la nega. In entrambi i casi la barra dei comandi resta **sopra** (`z-index: 90`):
senza quello, su un telefono senza Esc, il riquadro diventerebbe una trappola da cui si esce solo
ricaricando la pagina. `fullscreenchange` riallinea la classe quando si esce da fuori.

**Riga «scrivi qui / incolla» (`#liveTypeBar`).** Compare **solo** con il controllo in mano
all'utente (`hidden` gestito in `applyLive`), perché nel caso normale deve togliere zero altezza al
riquadro del browser. Contiene il campo `#liveTypeBox` (classe `.liveurl`, quindi 44px da dito su
schermo stretto) e i pulsanti `⇩ incolla`, `⌫`, `⏎`, tutti a 44px su mobile. Il campo è una
**tastiera**, non un secondo campo di testo: `input` e `paste` inoltrano e svuotano, i tasti che non
producono testo (Backspace, Enter, frecce) passano dal listener `keydown` del campo verso la CLI.
Fino a 12 battute gli eventi partono in **un solo invio** (l'ordine è quello del testo); sopra le
12 l'inoltro passa da `POST /api/browser/inserttext` (un inserimento solo).

**Ordine degli eventi = una coda.** Un click è muovi+premi+rilascia e un trascinamento è una
raffica di movimenti: mandarli come richieste HTTP separate le fa arrivare in ordine qualsiasi (si è
visto il rilascio precedere la pressione, e allora il browser non sintetizza il click). `liveInvia`
accoda i gesti e manda ogni gesto in **un solo** `POST /api/browser/input` con `{events:[…]}`;
l'hover e i movimenti di trascinamento si **fondono** (coalescing) per non saturare il canale.

**Guasti visibili.** `avvisaInputKo` controlla la risposta: se il canale degli input non è pronto
(ponte caduto, flusso spento) lo dice nel log della vista, **una volta sola**
(`liveInputKoAvvisato`, azzerato al primo invio riuscito) per non riempire il log di righe
identiche. Il **pallino** accanto al badge ripete lo stato in un colpo d'occhio: verde = frame in
arrivo, giallo = collegamento in corso, rosso = errore, grigio = flusso fermo.

## 6. Movimento

`@media (prefers-reduced-motion: reduce)` spegne il fluttuare del logo nella schermata vuota e le
animazioni dell'effetto olografico del tasto «features»; gli stati (colore, bordo) restano. Nessuna
animazione è necessaria per capire lo stato dell'app.

## 7. Pagina di accesso

`loginPageHtml()` in `dashboard.mjs` ha una palette propria, allineata al nero pieno
(`background: #000`, card `#0f131a`, bordi `#2b3240`). Attenzione: quel HTML è generato dal modulo
Node, quindi le modifiche si vedono **dopo il riavvio** della dashboard (`scripts/restart-dashboard.sh`),
mentre `dashboard.html` è letto da disco a ogni richiesta.

## 8. Immagini: anteprima in chat e lettore a schermo intero

**Blocco `img` nella chat.** L'anteprima vive in una `figure.imgfig`: testata con nome del file
(monospaziato, troncato con i puntini), formato e pixel reali; corpo con l'immagine; didascalia
sotto; riga d'errore in rosso quando il file non è mostrabile. Altezza dell'anteprima limitata a
`min(62vh, 560px)` — una foto verticale da telefono non deve occupare tre schermate — e larghezza
tutta la colonna, in proporzione.

Due regole che sono costate un bug, da non dimenticare:

1. l'immagine **non** deve essere nascosta (`hidden` o `display:none`) mentre carica: il browser non
   scarica un'immagine invisibile, e con `loading="lazy"` il risultato è un vicolo cieco (non carica
   perché è invisibile, e diventa visibile solo quando ha caricato). Il testo «carico l'anteprima…»
   resta **sopra** l'immagine finché `onload` non lo toglie;
2. con `loading="lazy"`, un'anteprima fuori dallo schermo non viene scaricata: è il comportamento
   voluto (non si scaricano megabyte per foto che nessuno guarda), ma i test devono portare
   l'elemento nel viewport prima di verificarlo.

**Miniatura nelle card dei file.** Un'immagine al posto dell'icona: 38px (48 su telefono),
`object-fit: cover`, cliccabile per aprire il lettore, con ripiego sull'icona se il file non è
leggibile. Attenzione all'ordine: l'elemento va **scelto prima** di appenderlo alla card —
`ic.replaceWith(thumb)` su un nodo non ancora nel DOM non fa nulla (la miniatura spariva,
difetto trovato dal test).

**Lettore (lightbox).** `.vlightbox` è un overlay `position: fixed` con tre fasce: barra dei
comandi (✕, nome, contatore, frecce, ruota, zoom, schermo intero, nuova scheda, scarica, elimina),
stage, riga dei metadati. Geometria: l'immagine è posizionata con
`transform: translate(x,y) rotate(r) scale(s)` dentro uno stage `overflow: hidden`, quindi pan e
zoom seguono il dito senza muovere la pagina; `fit` calcola la scala che la contiene. La rotazione
avviene attorno all'angolo in alto a sinistra (`transform-origin: 0 0`) e per 90°/180°/270° serve
una **compensazione** nel translate, altrimenti l'immagine finisce fuori dallo stage. Su telefono la
barra scorre in orizzontale con bersagli ≥44px; i comandi restano sopra l'overlay.

**Costo e sicurezza.** Nessuna miniatura generata sul server: si serve l'originale. Il prezzo è che
una foto da 8 MB si scarica tutta per essere guardata in chat: per questo l'anteprima ha un tetto di
40 MB e mostra il percorso utile («aprila dai file») invece di scaricare. Il formato è sempre
verificato dal server sui magic number. (`ffmpeg` è comparso su questa macchina il 2026-10-11, ma
**solo** per la lettura ad alta voce: le immagini continuano a essere servite così come sono.)

## 9. Lettura ad alta voce: barra in chat e lettore a schermo intero

Due forme, **un solo motore** (piper sul server: vedi `docs/MANUALE.md`), e la stessa traccia MP3
con i tempi dei paragrafi. Il testo mostrato dal lettore è **quello che si sente**: i paragrafi
arrivano già ripuliti dal markdown (asterischi, tabelle e blocchi di codice non si leggono), così
non c'è differenza fra ciò che si vede e ciò che si ascolta.

**Barra in chat** (`.ttsbar`, sotto il messaggio): ▶/⏸, posizione, `tempo / durata`, voce,
velocità, e una riga di stato che **dice cosa sta succedendo** («⏳ sintetizzo: 12/48 paragrafi…»,
«riccardo (maschile, leggera) · 6:12 — premi ▶», «traccia salvata in …»). Un'attesa muta, su un
lavoro di minuti, sembra un guasto: la riga di stato è parte del progetto, non un dettaglio.

**Lettore dei capitoli** (`#ttsViewer`, stesso scheletro di `.vlightbox`): barra in alto (✕, nome,
contatore, ⏮ ▶ ⏭, −/velocità/＋, voce, ⬇ mp3, ⛶), stage con il testo, riga di servizio in basso.
Il paragrafo in ascolto prende `.ttspar.on` (fondo d'accento al 10% più bordo sinistro acceso): la
separazione sta nel **bordo**, non nel riempimento, perché su fondo nero due grigi vicini non si
distinguono (stessa regola della sezione 1). Il paragrafo è cliccabile e ha l'ora d'inizio
(`6 · 1:03`) in micro-testo, che è anche il modo per saltare a un punto senza cercarlo a orecchio.

Tre decisioni da non disfare:

1. **il primo ▶ lo preme una persona.** La generazione finisce da sola, ma la lettura non parte da
   sola: su iOS un `play()` che nasce da un timer viene rifiutato dal browser (`NotAllowedError`) e
   una lettura che non parte sembra rotta;
2. **la velocità è `playbackRate`, non una rigenerazione**: 0,75× e 2× usano la stessa traccia in
   cache, e cambiare velocità è istantaneo;
3. **l'evidenziazione segue senza strappare**: si scorre al paragrafo nuovo solo se è uscito dalla
   vista — chi sta rileggendo un passaggio sopra non se lo vede scappare sotto (stesso patto
   dell'autoscroll della chat, e per lo stesso motivo).

Un solo `<audio>` per tutta la dashboard (`#ttsAudio`): due letture insieme non si capiscono, e su
iOS un elemento nuovo per ogni clic perde l'autorizzazione al play. Aprire un lettore ferma il
precedente, il lavoro di sintesi invece prosegue (finirà in cache: la prossima volta è istantaneo).

Su telefono la barra del lettore scorre in orizzontale con bersagli ≥44px; i paragrafi restano a
tutta larghezza con testo a `--fs-md` e interlinea 1,7, perché la lettura a schermo qui dura minuti
e non deve affaticare.

## 10. Gruppi di skill nella vista 🧩

Le skill di uno stesso **pacchetto di terzi** (oggi HyperFrames, 13 voci) si mostrano accorpate in
una «cartella» richiudibile: senza, occupavano da sole tutte le schermate dell'elenco e nascondevano
le skill dell'harness — che sono quelle che si guardano più spesso.

| scelta | perché |
|---|---|
| **chiusa all'apertura** | «accorpate» vuol dire che non devono occupare spazio: chi cerca una skill di quel pacchetto la apre, gli altri vedono il resto |
| intestazione `▸ titolo · N skill` + nota | il conteggio evita di aprire per curiosità; la nota dice **di chi è** il pacchetto e come si aggiorna |
| badge **pacchetto** invece di *dashboard* | `dashboard` significa «scrivibile da qui», non «fatta qui»: su una skill di terzi che si riscrive da fuori quel badge diceva il falso |
| schede dentro a piena scheda, con `gap` 10px | indentazione e bordo superiore bastano a dire «siamo dentro»: niente scatole di scatole |
| bersaglio ≥44px sulla riga della cartella | è un comando come gli altri, e su telefono si tocca con il dito |
| stato in memoria (si riparte chiusi) | è una vista di consultazione rapida: ricordare un'apertura vecchia riporterebbe 13 schede in mezzo ai piedi |

Il raggruppamento è **di sola visualizzazione**: il caricamento delle skill, il system prompt e
`/skill:nome` restano un nome per skill. Se un gruppo non è più dichiarato, le sue skill **non
spariscono**: tornano in elenco semplice (una skill che scompare per una scelta di layout è un
guasto, non una preferenza).
