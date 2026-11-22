---
name: genera-immagini
description: >-
  Genera o modifica un'immagine con i modelli Google Nano Banana dal tool `genera_immagine` (e dalla vista
  «🎨 immagini» della dashboard): il risultato viene salvato in media/ e mostrato in chat. Usala quando
  l'utente chiede una figura, una copertina, un'illustrazione, una variante di una foto esistente, o
  «mi fai un'immagine di…». Il default è il modello ECONOMICO (~$0,034 per immagine); i modelli cari si
  usano solo su richiesta esplicita. Non serve per guardare o descrivere un'immagine già esistente
  (skill `immagini`) né per un video (skill `video`).
---

# Generare immagini (e non spendere più del necessario)

Le immagini si pagano **a immagine**, non a token di chat: è l'unica cosa di questo harness in cui
una riga di prompt può costare quanto cento messaggi. Per questo il default è il modello economico e
la regola è una sola: **il modello più caro si sceglie, non si indovina**.

## Il gesto minimo

```
genera_immagine({ prompt: "una libreria di notte, luce calda alle finestre, inquadratura larga" })
```

Il tool:

1. genera **una** immagine (non quattro varianti «per scegliere»: ogni variante è denaro);
2. la salva in `media/immagini/AAAA-MM/` con un nome leggibile dal prompt;
3. risponde con percorso, tempo, costo stimato e un blocco ```` ```img ```` che la chat mostra come
   anteprima cliccabile;
4. scrive una riga nel registro `media/immagini/registro.jsonl` (anche quando fallisce: serve a
   capire *perché* è fallita).

## Quale modello

| Modello | Costo indicativo | Quando |
|---|---|---|
| `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) | ~$0,034 a 1K | **default**: tutto ciò che è illustrativo |
| `gemini-3.1-flash-image` (Nano Banana 2) | ~$0,067 a 1K | serve 2K o 4K, o più controllo |
| `gemini-3-pro-image` (Nano Banana Pro) | ~$0,134 a 1K/2K, ~$0,24 a 4K | l'utente chiede qualità, dettaglio, testo leggibile dentro l'immagine |

`dimensione`: 1K basta quasi sempre; 2K/4K solo su richiesta (e il Lite non li offre).
`formato`: le proporzioni (`16:9`, `9:16`, `4:5`…), non i pixel.

## Un prompt che funziona

- **Concreto**: soggetto, stile, luce, inquadratura, cosa NON deve esserci. «Una foto di prodotto»
  dà un risultato generico; «una bottiglia di vetro verde su fondo beige, luce laterale morbida,
  ombra lunga a destra, niente testo» dà quello che serve.
- **Testo dentro l'immagine**: mettilo tra virgolette e tienilo corto. Le scritte lunghe escono
  piene di errori soprattutto nei modelli piccoli.
- **Modifica invece di rigenerazione**: se esiste già un'immagine, passala in `riferimento` e
  descrivi solo il cambiamento. È più fedele e più economico.
- **Lingua**: se l'utente parla italiano, il prompt in italiano va bene; i soggetti ambigui
  conviene scriverli in inglese.

## Dopo la generazione

- Riporta **percorso e costo stimato**, e mostra l'anteprima col blocco `img`.
- Dì che è un'immagine **generata** (contiene il watermark SynthID): chi la pubblica deve saperlo.
- Se l'utente vuole ritocchi fini, non rigenerare da zero: usa `riferimento`.

## Errori tipici (e cosa dire)

| Errore | Significato | Cosa fare |
|---|---|---|
| «nessuna chiave Google configurata» | manca `GEMINI_API_KEY` o la chiave nel pannello «chiavi» | dirlo all'utente, non riprovare |
| «quota Google esaurita» (429) | le immagini **non hanno piano gratuito**: serve fatturazione sul progetto | non cambiare prompt a caso |
| «il filtro contenuti ha bloccato l'immagine» | prompt o riferimento rifiutato (IMAGE_SAFETY) | riformula il prompt, spiega perché |
| «formato/file non ammesso» su `riferimento` | il file non è un'immagine leggibile o è fuori dalla root | controlla il percorso |

La stessa generazione esiste nella dashboard, vista **«🎨 immagini»** (pannello «Risorse»): prompt,
modello, formato, galleria delle immagini fatte. La scelta del modello lì si salva e resta.
