---
format: 1920x1080
duration: 60s
message: "Scrivi una richiesta in italiano e l'harness la esegue sui tuoi file — dentro una dashboard che sta sul tuo server"
arc: Demo Loop → question → product intro → demo cycle 1 → demo cycle 2 → demo cycle 3 → trust → brand outro
audience: "un potenziale cliente che non conosce il prodotto e non e' del mestiere"
mode: autonomous
music: none
---

# Demo di introduzione — Universalis Harness

Sei frame, un'idea per frame. Il filo: qualcuno scrive in italiano, l'agente esegue, il risultato
appare nella stessa conversazione. I tre casi d'uso sono le tre cose che un cliente capisce subito
(cartelle di documenti, un sito da controllare, un file da produrre). La chiusura dichiara che il
video e' stato prodotto con l'harness stesso.

## Frame 1 — La richiesta

- status: animated
- type: hook
- blueprint: typewriter-reveal (Reproduce)
- src: compositions/frames/01-richiesta.html
- duration: 6.5s
- poster: 4.5s
- transition_in: cut
- scene: "Schermo nero, una casella vuota al centro: il testo si scrive da sola, carattere per carattere"
- voiceover: "Qualcuno scrive una richiesta, in italiano, come la scriverebbe a un collega. Nessun comando da imparare."
- focal: composer simulato
- roles: composer = focal · cursore = supporting · wordmark = supporting
- persuasion: promessa mostrata, non dichiarata
- beat: curiosita'
- asset_candidates: composer simulato (casella del prompt), cursore lampeggiante, riga di esempio
- handoff_out: composer a x=480 y=470, scala 1.0, opacita' 1, immobile

La richiesta si scrive a schermo: «Ho una cartella di fatture da sistemare, me le metti in tabella?».
Niente logo all'inizio, niente presentazione aziendale: si parte dall'azione. Il nome del prodotto
compare solo in coda al frame, piccolo, come firma di chi sta ascoltando.

Sequenza (ancorata alla voce):

Scene 1 (0.0–0.8s): fondo nero pieno; la casella del prompt si posa al centro (centered, ~46% della larghezza, un solo livello di profondità: ombra smorzata sotto), cursore che lampeggia. Niente altro sul quadro.
Scene 2 (0.8–4.2s): il testo si scrive a strappi, come una persona — «Ho una cartella di fatture da sistemare, me le metti in tabella?» — mentre la voce dice «qualcuno scrive una richiesta». La casella cresce in altezza di una riga quando il testo va a capo.
Scene 3 (4.2–5.6s): il cursore si ferma; a sinistra in basso appare il nome «Universalis Harness» in mono, piccolo, con un fade breve — entra mentre la voce dice «nessun comando da imparare». Nessun logo, nessuno slogan.
Scene 4 (5.6–6.5s): tenuta ferma (solo il cursore che lampeggia): è la richiesta, deve leggersi.


## Frame 2 — Cos'e'

- status: animated
- type: product_intro
- blueprint: zoom-out-workspace-reveal (Adapt)
- src: compositions/frames/02-cose.html
- duration: 9s
- poster: 6s
- transition_in: crossfade
- scene: "Un unico allontanamento: dalla casella si scopre la dashboard intera, con le sezioni e la barra di stato"
- voiceover: "Questa e' l'harness. Una dashboard sul tuo server, con dentro un agente che lavora sui tuoi file. I tuoi file, non quelli di qualcun altro."
- focal: interfaccia ricostruita (dashboard)
- roles: dashboard = focal · barra laterale = supporting · barra di stato = supporting
- persuasion: il prodotto diventa un luogo
- beat: orientamento
- asset_candidates: interfaccia ricostruita (barra laterale con chat, file, obiettivi, memoria, skill), barra di stato con costo e contesto
- handoff_in: composer a x=480 y=470, scala 1.0, opacita' 1, immobile
- handoff_out: pannello della dashboard centrato, scala 1.0, opacita' 1, immobile

Il pannello si apre attorno alla casella: a sinistra le sezioni (conversazione, file, obiettivi,
memoria, competenze), in alto il nome della sessione, in basso la barra di stato con quanto sta
costando la conversazione. Le etichette arrivano a gruppi, non tutte insieme.

Sequenza (ancorata alla voce):

Scene 1 (0.0–1.0s): riquadro stretto sulla stessa casella, nella stessa posizione del frame precedente — continuita' di posizione, non un taglio che ricomincia.
Scene 2 (1.0–5.0s): un unico allontanamento continuo e decelerante: attorno alla casella si materializzano la barra laterale (conversazione, file, obiettivi, memoria, competenze) e l'intestazione con il nome della sessione. Le etichette arrivano in due gruppi, non tutte insieme. La voce: «questa e' l'harness».
Scene 3 (5.0–7.4s): la barra di stato in basso entra con uno slide-up (contesto usato, costo della conversazione) mentre la voce dice «una dashboard sul tuo server».
Scene 4 (7.4–9.0s): tenuta; nessun movimento di camera, solo il cursore che lampeggia. La dashboard e' leggibile: chi guarda deve poterla riconoscere quando la vede dal vivo.


## Frame 3 — Primo caso: i documenti

- status: animated
- type: feature_showcase
- blueprint: prompt-type-submit-generate (Reproduce)
- src: compositions/frames/03-documenti.html
- duration: 12.5s
- poster: 11s
- transition_in: cut
- scene: "Il prompt si scrive, l'agente dichiara cosa sta leggendo, poi la tabella si compone riga per riga"
- voiceover: "Primo caso: legge i documenti. PDF, scansioni, foto. Prende i dati che servono e li mette in tabella. Dodici fatture, in un colpo solo."
- focal: tabella dati
- roles: composer = supporting · anteprima fattura = supporting · tabella = focal
- persuasion: prova (il lavoro si vede)
- beat: soddisfazione
- asset_candidates: composer attivo, riga di stato "leggo 12 fatture", anteprima della prima pagina PDF, tabella con 4 colonne che si riempie
- handoff_out: bordo della tabella a x=960 y=540, scala 1.0, opacita' 1, immobile

Il prompt e' quello della prima scena, completato: «leggi le fatture in media/fatture e fammi la
tabella». Sotto, la fila dei file letti si accende uno a uno; poi compare l'anteprima della fattura
e la tabella prende forma riga per riga: data, fornitore, numero, importo. Il totale compare per
ultimo e resta.

Sequenza (ancorata alla voce):

Scene 1 (0.0–2.4s): la casella torna in primo piano al centro; il testo si completa carattere per carattere: «leggi le fatture in media/fatture e fammi la tabella». La voce nomina i documenti.
Scene 2 (2.4–4.4s): invio — la casella si ritira in alto e al suo posto scende la riga di lavoro: «leggo 12 file…». Sotto, dodici pastiglie di file si accendono a gruppi di tre (stagger corto, non tutte insieme).
Scene 3 (4.4–8.0s): due pannelli affiancati (asymmetric 60/40): a sinistra l'anteprima della prima pagina della fattura con il riquadro sull'importo, a destra la tabella che si compone riga per riga (data, fornitore, numero, importo). Tre righe visibili, le altre scorrono dentro mentre la voce dice «li mette in tabella».
Scene 4 (8.0–10.5s): la riga del totale entra in fondo alla tabella e l'importo si accende in accento mentre la voce dice «dodici fatture, in un colpo solo».
Scene 5 (10.5–12.5s): tenuta ferma sulla tabella completa.


## Frame 4 — Secondo caso: un sito

- status: animated
- type: feature_showcase
- blueprint: prompt-type-submit-generate (Adapt: la finestra di browser sostituisce la tabella)
- src: compositions/frames/04-sito.html
- duration: 11.5s
- poster: 10s
- transition_in: cut
- scene: "Il prompt chiede il confronto del listino; una finestra di browser scorre la pagina; due dati si evidenziano"
- voiceover: "Secondo caso: va sui siti che gli indichi, legge le pagine e ti dice cos'e' cambiato. Anche quando il sito non offre nessun file da scaricare."
- focal: confronto listino
- roles: composer = supporting · finestra browser = supporting · confronto = focal
- persuasion: prova (non serve scaricare nulla)
- beat: sorpresa trattenuta
- asset_candidates: composer con il nuovo prompt, finestra di browser simulata con indirizzo e pagina, due righe di confronto (prima / adesso)

La finestra del browser si apre dentro la conversazione e scorre la pagina reale del fornitore; il
numero vecchio e il numero nuovo si posano uno accanto all'altro con una riga di differenza. Chi
guarda deve capire che non e' stato l'utente ad aprire quella pagina.

Sequenza (ancorata alla voce):

Scene 1 (0.0–2.2s): la casella, in alto, si svuota e si riscrive: «controlla sul sito del fornitore se il listino e' cambiato».
Scene 2 (2.2–5.6s): dentro la conversazione si apre una finestra con la barra dell'indirizzo e la pagina del fornitore visibile che scorre verso il basso e si ferma sul listino; il cursore dell'agente evidenzia la tabella dei prezzi. La voce: «va sui siti che gli indichi».
Scene 3 (5.6–8.4s): la pagina si scosta e due schede di confronto entrano da lati opposti (split-screen): «marzo 42,00 €» e «aprile 48,50 €»; tra loro una pastiglia in accento con «+15%».
Scene 4 (8.4–11.5s): tenuta sul confronto, con il solo micro-movimento della pastiglia. La voce chiude il caso.


## Frame 5 — Terzo caso: produrre

- status: animated
- type: feature_showcase
- blueprint: agent-progress-theater (Reproduce)
- src: compositions/frames/05-produrre.html
- duration: 11s
- poster: 10s
- transition_in: cut
- scene: "L'agente lavora a vista: fasi che si accendono e si spuntano, barra di avanzamento, poi il video appare in chat"
- voiceover: "Terzo caso: produce. Report, immagini, video. Il risultato arriva qui, nella stessa conversazione. Non un link: il file."
- focal: player del video prodotto
- roles: fasi = supporting · barra = supporting · player = focal
- persuasion: prova (l'uscita e' un file)
- beat: climax
- asset_candidates: riga delle fasi (script, scene, voce, montaggio, render), barra di avanzamento, player del video dentro la chat

Qui il lavoro si vede: cinque fasi che si accendono e si spuntano una dopo l'altra, la barra che
avanza, e alla fine un video dentro la conversazione con il pulsante di riproduzione e la durata.
E' il caso che sorprende di piu': l'output e' un file, non una risposta.

Sequenza (ancorata alla voce):

Scene 1 (0.0–1.8s): la casella si riscrive: «prepara un video di 30 secondi con questi dati». Impatto secco all'invio.
Scene 2 (1.8–6.0s): il pannello del lavoro prende il centro: cinque fasi in fila (script, scene, voce, montaggio, render) si accendono e si spuntano una dopo l'altra, mentre la barra di avanzamento cresce in basso. La voce: «produce. Report, immagini, video».
Scene 3 (6.0–9.0s): le fasi si chiudono tutte insieme e il player entra dentro la conversazione: riquadro video 16:9 con il pulsante di riproduzione, la durata «0:30» e la riga «render completato». La voce: «il risultato arriva qui».
Scene 4 (9.0–11.0s): tenuta sul player, con un solo battito del puntino di stato. E' il punto piu' alto del video: deve stare fermo e leggersi.


## Frame 6 — Dove stanno i tuoi file

- status: animated
- type: branding
- blueprint: titlecard-reveal (Reproduce)
- src: compositions/frames/06-chiusura.html
- duration: 9.5s
- poster: 8s
- transition_in: crossfade
- scene: "Una riga sul server, poi la chiusura: nome del prodotto e la dichiarazione che il video e' stato fatto con l'harness"
- voiceover: "Gira sul tuo server, e i file restano tuoi. E questo video? L'ha prodotto lui."
- focal: wordmark
- roles: riga server = supporting · wordmark = focal · riga finale = supporting
- persuasion: fiducia + chiusura del cerchio
- beat: quiete
- asset_candidates: riga con icona del server e la frase sui dati, wordmark testuale, riga di chiusura

Prima la rassicurazione: gira sulla macchina di chi lo usa, i file non escono. Poi il nome del
prodotto e, sotto, la riga che chiude il cerchio: «Questo video e' stato prodotto con l'harness».
Movimento minimo: il frame e' calmo di proposito.

Sequenza (ancorata alla voce):

Scene 1 (0.0–2.0s): uno slide-up breve con dissolvenza: l'icona del server e la riga «gira sul tuo server, e i file restano tuoi». Un solo elemento sul quadro, molto spazio vuoto.
Scene 2 (2.0–5.0s): la riga sale e si fa piccola in alto; al centro si compone il nome «Universalis Harness» in grande, con una spinta minima di camera (impercettibile). La voce: «e questo video?».
Scene 3 (5.0–7.5s): sotto il nome appare la riga «Questo video e' stato prodotto con l'harness», con l'accento blu sulla parola «harness». La voce: «l'ha prodotto lui».
Scene 4 (7.5–9.5s): tenuta piena, nessun movimento: il video finisce qui, e l'ultima immagine e' la dichiarazione.


## Video direction

- **Ground**: nero pieno (`#000000`) su ogni frame, pannelli `#0f131a`, bordi `#2b3240`; l'accento blu
  `#5b9dff` e' riservato a cio' che sta lavorando o a cio' che porta il numero (barra di avanzamento,
  cursore, totale, fase attiva). Verde/ambra/rosso solo per gli stati reali di riuscita o attenzione.
- **Type**: `system-ui` per tutto, `ui-monospace` per prompt, nomi di file e numeri. Nessun titolo
  decorativo, nessun corsivo: questa e' una UI, non una locandina.
- **Camera**: si muove due volte in tutto il video (l'allontanamento del frame 2 e la spinta minima
  del frame 6). Negli altri frame la camera sta ferma e sono gli elementi a cambiare: e' quello che
  fa sembrare la demo una registrazione dello schermo e non una presentazione.
- **Cadence**: ogni elemento appare quando la voce lo nomina (prompt → lavoro → risultato). Nessun
  frame si riempie e poi si ferma: le rivelazioni sono distribuite su tutta la durata.
- **Interfaccia**: i testi della UI sono in italiano e veri (nomi di file, totali, fasi reali del
  lavoro dell'agente). Nessun testo segnaposto tipo «Lorem» o «esempio».
