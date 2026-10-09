# Fabbrica di asset (Blender headless + strumenti CLI)

Questa macchina **non ha GPU**. Non è un ostacolo: Blender renderizza su **CPU** (6 core) e in
misurazioni fatte qui produce **un frame 512px in ~6 secondi** e **8 rotazioni a 256px in 9 secondi**.
Da qui si fabbricano asset di gioco veri, non rettangoli disegnati a mano.

## Il ciclo, in pratica

```bash
cd media/giochi/asset/script

# un singolo render (fondo trasparente, luci da gioco, camera ortografica isometrica)
blender --background --factory-startup --python cristallo.py -- \
  --outdir ../renders/ --lato 512 --campioni 64

# una SEQUENZA di rotazioni → sprite sheet (una sola invocazione di Blender)
blender --background --factory-startup --python cristallo.py -- \
  --outdir ../renders/ --sequenza 8 --passo 45 --lato 256 --campioni 48

# il foglio finale
cd ../ && montage renders/cristallo-0[0-7].png -tile 4x2 -geometry +4+4 -background none sprite-cristallo.png
```

Risultato: `renders/cristallo-00.png … -07.png` e `sprite-cristallo.png` (4x2).

## La tecnica che alza la qualità: 2.5D

Modello **3D** → render **ortografico** da angoli fissi → **sprite 2D** per il motore.
È quello che usano molti giochi indie: modelli veri (anche CC0), inquadratura fissa, quindi
illuminazione, ombre e materiali di qualità, impacchettati come immagini 2D.

Nel `cristallo.py` i pezzi riutilizzabili sono:

- `materiale(...)`: Principled BSDF con colore, ruvidità, metallo, trasmissione, emissione.
- `costruisci()`: fondo trasparente (`film_transparent`), camera **ortografica** con `TRACK_TO`,
  tre luci (key calda, fill freddo), mondo scuro.
- `--sequenza N --passo G`: N frame ruotando l'oggetto di G gradi — è il ciclo dello sprite sheet.
- `--lato` e `--campioni`: il costo del render. Più campioni = meno rumore.

**Attenzione a due cose dell'ambiente** (verificate qui):

- il pacchetto Blender di Ubuntu è compilato **senza OpenImageDenoise**: accendere il denoise fa
  fallire il render (`Build without OpenImageDenoiser`). Si compensa con più campioni.
- il view transform filmico schiarisce e desatura: per sprite di gioco conviene `Standard`.

## Gli altri strumenti guidabili da riga di comando

| Strumento | A cosa serve | Comando tipico |
|---|---|---|
| **Blender** | modelli, render, sprite sheet, texture procedurali, animazioni | `blender --background --python <script>` |
| **ImageMagick** | composizione, sprite sheet, ritagli, ridimensionamenti, prove di colore | `montage`, `convert`, `identify` |
| **Inkscape** | grafica vettoriale (UI, icone, mappe, personaggi vettoriali) → PNG ad alta risoluzione | `inkscape --export-type=png --export-dpi=300 file.svg` |
| **GIMP** | immagine raster di qualità: texture, filtri, normal map da heightmap, batch | `gimp -i -b '(script-fu …)'` |
| **Tiled** | mappe a tile in formato testuale (TMX/JSON), esportabili da CLI | `tiled --export-map` |
| **SuperCollider / Csound** | sintesi audio algoritmica (musica e suoni generati, offline) | `sclang script.scd` |
| **FluidSynth** | MIDI → WAV con soundfont (musica scritta come spartito testuale) | `fluidsynth -F out.wav soundfont.sf2 brano.mid` |
| **ffmpeg** | conversione audio/video, montaggio di sequenze di frame | `ffmpeg -i %02d.png video.mp4` |
| **Audacity** | elaborazione audio batch (mod-script-pipe) | pipe script |

## Materiali di partenza (licenze libere, niente da inventare)

- **Kenney** (CC0): set completi 2D, 3D, UI e audio.
- **Poly Haven** e **ambientCG** (CC0): materiali PBR, texture, HDRI — da usare dentro Blender.
- **Quaternius** (CC0): personaggi e oggetti 3D low-poly, pronti da animare.
- **LPC / Liberated Pixel Cup** (CC-BY-SA/GPL): personaggi 2D per giochi di ruolo.
- **Google Fonts** (OFL) per il testo, **Freesound** (licenze varie) per gli effetti.

Con un modello CC0 + Blender headless si ottiene uno sprite di qualità commerciale **senza
disegnare nulla a mano**: questa è la differenza fra "grafica elementare" e "grafica da gioco".

## Limiti da tenere presenti

- Il render **software** costa tempo: 1-6 s per frame qui. Una scena complessa o 4K sale a minuti;
  per un personaggio animato (8 direzioni × 8 frame) si parla di qualche minuto, non di ore.
- **Niente EEVEE** in modo affidabile senza display: si usa **Cycles su CPU**.
- I **file `.blend`** sono binari: si versionano, ma la verità del progetto deve stare negli script
  Python (parametrici, leggibili, diffabili), non nel file binario.
