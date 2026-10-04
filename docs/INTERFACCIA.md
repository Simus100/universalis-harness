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

## 5-bis. Live view su telefono

La barra dei comandi della vista live sta su **una riga** (`#liveView .gtoolbar .ghost` con padding
ridotto e corpo 12px) e l'intestazione del log pure (l'hint `.gcount` sparisce). Il **log parte
nascosto** su schermo stretto: lo riapre `▸ log`, che porta un pallino ● quando arrivano messaggi a
log chiuso (`#liveLogToggle.nuovo`). Il campo indirizzi è alto 44px come gli altri bersagli da dito.
Ingrandimento (`⤢ adatta → 1:1 → 2×`) e schermo intero (`⛶`) sono classi sul riquadro
(`.livestage.zoom-1x`, `.livewrap.full`), non trasformazioni inline. In schermo intero la barra dei
comandi resta **sopra** l'overlay (`z-index: 90`): senza quello, su un telefono senza Esc, il
riquadro diventerebbe una trappola da cui si esce solo ricaricando la pagina.

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

**Costo e sicurezza.** Nessuna miniatura generata sul server (non ci sono ImageMagick né ffmpeg su
questa macchina): si serve l'originale. Il prezzo è che una foto da 8 MB si scarica tutta per essere
guardata in chat: per questo l'anteprima ha un tetto di 40 MB e mostra il percorso utile
(«aprila dai file») invece di scaricare. Il formato è sempre verificato dal server sui magic number.
