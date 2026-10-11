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
29,3 s**. La regola da tenere a mente è **~3,5 secondi di macchina per ogni secondo di video**.

- Un video di 30 s ≈ 2 minuti; un minuto di video ≈ 3 minuti e mezzo.
- **Dillo all'utente prima di lanciarlo.** Un render non è una risposta: è un lavoro che occupa la
  macchina. Annunciare «ci vogliono due minuti» è parte del lavoro, non una scusa.
- Per provare, `npx hyperframes render --quality draft` (o `--fps 15`): la bozza si vede subito, la
  versione buona si fa quando il contenuto è deciso.

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
- **`window.__timelines["id"]` deve combaciare col `data-composition-id`** della radice, e la
  timeline è una sola, `paused: true`. La durata del video è il `data-duration` della radice, non la
  lunghezza della timeline.
- Mai `<br>` nei testi, mai `crossorigin` su `<video>`/`<audio>`, mai animare `display`,
  `visibility` o `autoAlpha` su un `.clip`.
- **`check` non mente:** se il contrasto o il layout hanno problemi lo dice prima del render. Il
  primo giro su una composizione nuova di solito non passa — meglio scoprirlo in dieci secondi che
  dopo trenta di cattura frame per frame.

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
