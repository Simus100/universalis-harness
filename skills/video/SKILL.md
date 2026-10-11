---
name: video
description: "Usala quando l'utente chiede un video, un filmato, una presentazione animata, uno slideshow, un'animazione o una motion graphic — e anche quando in una pagina, in una dashboard o in un report serve una parte in movimento (un grafico che si anima, un titolo che entra, una sequenza di schermate). Decide se serve un file video da renderizzare con HyperFrames o solo un'animazione da scrivere nel file, dice quanto tempo di macchina costa il render e come si mostra il risultato in chat."
---

# Video e animazioni: prima scegliere la strada

Tre situazioni diverse si presentano con le stesse parole («fammi un video», «animiamo la
dashboard»). Sbagliare strada costa tempo di macchina e non serve nessuno.

| Cosa serve davvero | Strada | Perché |
|---|---|---|
| Un **file video** (MP4/WebM) da guardare, mandare, mettere in una presentazione | **HyperFrames** (skill `hyperframes`, `hyperframes-cli`, `hyperframes-core`) | È l'unico modo per ottenere un file: HTML → Chrome headless → FFmpeg |
| Una **pagina o dashboard viva**, che si anima nel browser e su cui l'utente interagisce | **CSS/JS nel file**, nessun render | Un MP4 non è animato: è una registrazione. Renderizzare qui è tempo buttato |
| Una **schermata** di qualcosa che esiste già (un sito, una dashboard) | Tool `browser` (`screenshot`) | Serve l'immagine di ciò che c'è, non una ricostruzione |
| Un **deck navigabile** (slideshow da presentare) | Skill `hyperframes` → workflow slideshow | L'output è un deck, non un video: si compone, non si renderizza |

Se la strada è HyperFrames, **leggi `hyperframes` prima di scrivere una composizione**: è il router
del pacchetto e smista verso i workflow (video da un sito, spiegazione, motion graphic, musica).
Qui sotto restano solo le cose che sbagliano tutti alla prima volta.

## Quanto costa, e va detto prima

Misurato su questa macchina (6 core, nessuna GPU): **10 s di video a 1080p in 33,5 s**, **8 s in
29,3 s**, e **21,2 s in 131 s** per un montaggio con griglia animata, grana e audio. La regola da
tenere a mente è **~3,5 secondi di macchina per ogni secondo** su contenuto semplice, e **fino a ~6**
quando ci sono grana, particelle o texture animate — sono i pixel che cambiano a ogni fotogramma, e
è lì che il capture paga (e il file cresce).

- Un video di 30 s ≈ 2 minuti (≈ 3 con grana e particelle); un minuto di video ≈ 3 minuti e mezzo.
- **Dillo all'utente prima di lanciarlo.** Un render non è una risposta: è un lavoro che occupa la
  macchina. Annunciare «ci vogliono due minuti» è parte del lavoro, non una scusa.
- Per provare, `npx hyperframes render --quality draft` (o `--fps 15`): la bozza si vede subito, la
  versione buona si fa quando il contenuto è deciso.
- **Il file può essere pesante**: 21 s con grana sono ~46 MB a qualità `looks` (CRF 16) e ~15 MB
  ricompresso a CRF 23. Per farlo vedere in chat basta il secondo:
  `ffmpeg -i master.mp4 -c:v libx264 -crf 23 -preset slow -c:a aac -b:a 128k -movflags +faststart out.mp4`.
  `+faststart` mette l'indice in testa: con `/api/video` il player parte subito.

```bash
npx hyperframes init mio-video --non-interactive   # progetto nuovo
cd mio-video && npx hyperframes lint               # 0 errori PRIMA di renderizzare
npx hyperframes check                              # lint + runtime + layout + contrasto
npx hyperframes render --quality draft             # MP4 in renders/
npx hyperframes doctor                             # ffmpeg, Chrome, unzip: se manca qualcosa lo dice
```

## Le trappole che fanno fallire il primo tentativo

- **I clip li posiziona il framework.** Un `<div class="clip">` non partecipa al layout flex come
  credi: due clip «in colonna» finiscono sovrapposti. Dai a ognuno la sua fascia
  (`position: absolute` + `top`), e lascia che `check` verifichi il layout a ogni frame.
- **Niente testo dentro un clip** (`lint`: `nested_structure_needs_subcomposition`): il clip è la
  riga della timeline, il testo va dentro un fratello non temporizzato.
- **I veli e le vignette vanno DIETRO il testo**, nell'ordine del DOM. Un `inset: 0` con un
  gradiente messo dopo i testi non li copre davvero (il gradiente è trasparente al centro), ma per il
  controllo di layout è un elemento opaco sopra di loro: `check` fallisce con `text_occluded`. Metti
  fondo, griglia, vignetta **prima** dei testi, e lascia sopra solo la grana (che è ciò che deve
  stare sopra).
- **Non animare `letter-spacing`, `word-spacing`, `font-size`** né altre proprietà che riflussano il
  testo: ai pixel interi il testo «scatta» e sotto il capture si vede lo stutter
  (`lint`: `gsap_non_transform_motion`). Un tracking che si apre si fa con un carattere per volta
  (ognuno animato in `x`), oppure — quasi sempre meglio — con una scala.
- **`hyperframes snapshot` non compone le sotto-composizioni.** Con un blocchetto del catalogo
  montato via `data-composition-src`, lo snapshot può mostrare il vuoto dove il blocco vive: **non**
  è un guasto del montaggio. Per giudicare un montaggio con blocchi serve `render` (o il preview nel
  browser). Verificato: lo stesso file, allo stesso istante, ha il logo nel render e non nello snapshot.
- **`window.__timelines["id"]` deve combaciare col `data-composition-id`** della radice, e la
  timeline è una sola, `paused: true`. La durata del video è il `data-duration` della radice, non la
  lunghezza della timeline.
- **`check` non mente:** se il contrasto o il layout hanno problemi lo dice prima del render. Il
  primo giro su una composizione nuova di solito non passa — meglio scoprirlo in dieci secondi che
  dopo trenta di cattura frame per frame.

## L'audio

Un video muto per errore è il modo più stupido di buttare due minuti di render.

- **Ogni `<audio>` deve avere un `id`** (`lint`: `media_missing_id`): senza, il mixer non lo prende
  e il video esce **muto**. `data-start`, `data-duration`, `data-track-index`, `data-volume`.
- **La voce**: piper, offline, in `/opt/piper/venv/bin/piper` con le voci in `/opt/piper/voices`
  (`it_IT-serena-high.onnx` è la migliore). Una frase per file, così la puoi posizionare al secondo
  giusto:
  `echo "Nimbo." | /opt/piper/venv/bin/piper --model /opt/piper/voices/it_IT-serena-high.onnx --output_file voce1.wav`
- **La musica** si può costruire con ffmpeg (`sine`, `anoisesrc`, `aevalsrc` per uno sweep, più
  `amix`, `aecho`, `afade`): un pad di tre o quattro sinusoidi è già una base credibile per un'intro.
- **Normalizza la musica** (`loudnorm=I=-19:TP=-2`) e tienila bassa nella composizione
  (`data-volume="0.5"`): una traccia a -34 dB sotto una voce a -13 dB non si sente. Verifica per
  segmento, non a orecchio immaginato:
  `ffmpeg -ss 15.3 -t 1.2 -i out.mp4 -af volumedetect -f null -` (con voce ≈ -13 dB, solo musica ≈ -38 dB).

## Dove finisce il video, e come si mostra

- La composizione può stare dove serve (`/tmp/…` va benissimo: è un cantiere), ma **il video
  finito va in `media/`** — è la cartella dei file generati, l'unica che la chat sa mostrare.
- In chat si mostra con il blocco `video` (anche `mp4` o `filmato`): percorso in una riga,
  didascalia nelle righe successive. La card ha il player con la barra del tempo, e i byte li serve
  `/api/video` a pezzi (`Range`), quindi un video lungo si guarda senza scaricarlo tutto.

````
```video
media/presentazione.mp4
La presentazione, 12 secondi
```
````

## Cosa non fare

- **Non scrivere un blocco `video` per un file che non hai renderizzato**: se non esiste, la card
  mostra un errore — e il messaggio diventa una bugia.
- Non renderizzare un video per animare una pagina viva (né il contrario).
- Non promettere un video senza dire quanto ci mette: il tempo di macchina è parte della risposta.
- Non mettere in `media/` un video con dati personali o riconoscibili di terzi: il repository è
  pubblico e la storia non si cancella (i binari in `media/` sono già fuori dal versionamento, ma
  la regola vale per quello che ci finisce dentro).
