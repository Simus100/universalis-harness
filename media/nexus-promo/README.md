# nexus-promo — come rifare questo video

Promo per **Altair Nexus** (`https://nexus.universalis.it/site/`) — **versione 2**.
Due formati, stesso audio e stesso montaggio: **16:9** (1920×1080) e **9:16** ricomposto a mano (1080×1920).
40,0 s · **7 frame** · voce piper `it_IT-serena-high` · sottotitoli · bed musicale + 12 effetti sonori,
tutto sintetizzato in ffmpeg.

## Differenze dalla v1 (perché è "di meglio")

1. **Il rumore dura 5,9 s invece di 7,5** e il claim arriva prima: il primo taglio è a 5,9 s, non a 7,5.
2. **Un frame nuovo: il dossier** (`04-dossier`). L'area Report — mappa 3D del rischio, sei assi,
   tre traiettorie plausibili — era il materiale più forte del sito e nella v1 non c'era. Ora è il
   momento centrale: la camera viaggia dentro la stessa pagina (testata → mappa 3D → traiettorie).
3. **Disegno sonoro**: 12 effetti (impact, whoosh, tick, riser) montati sulle giunzioni. Prima c'era
   solo il pad: il taglio al nero e la cascata delle metriche non avevano colpo.
4. **Ritmo**: cambio di quadro ogni 2–3 s, e le tre "cornici" statiche della v1 sono state accorciate
   (sintesi 5,0 s, storia 6,9 s, metriche 5,2 s, chiusura 4,5 s).

## File che contano

| Cosa | Dove |
| --- | --- |
| Brief confermato | `BRIEF.md` |
| Piano (orizzontale) | `STORYBOARD.md` |
| Piano (verticale) | `STORYBOARD-vertical.md` |
| Voce bloccata | `SCRIPT.md` |
| Design system | `frame.md` (preset `cartesian` rimappato sul brand) |
| Catture reali del sito | `capture/`, ritagli pronti in `assets/*.png` |
| Frame orizzontali | `compositions/frames/01..07-*.html` |
| Frame verticali | `compositions/vertical/v01..v07-*.html` |
| Audio (voci, bed, effetti) | `assets/voce2/`, `assets/sfx/`, `audio_meta2.json` |
| Video finiti | `renders/nexus-promo-v2-16x9.mp4`, `renders/nexus-promo-v2-9x16.mp4` |
| Video v1 (prima versione) | `renders/nexus-promo-16x9.mp4`, `renders/nexus-promo-9x16.mp4` |
| Fotogrammi di controllo | `snapshots/` |

`index.html` è la composizione **orizzontale** attiva (è quello che renderizza il CLI).
Il build verticale già pronto sta in `builds/index-9x16.html`.

## Rifare l'orizzontale

```bash
npx hyperframes preview --background        # guardare/​modificare in Studio
npx hyperframes lint && npx hyperframes check
npx hyperframes render --quality high --output renders/nexus-promo-16x9.mp4
```

## Rifare il verticale

Le caption sono per-canvas: vanno rigenerate sul formato giusto prima di ogni build.

```bash
node /root/pi-harness/skills/product-launch-video/scripts/captions.mjs build \
  --storyboard ./STORYBOARD-vertical.md --audio-meta ./audio_meta2.json --hyperframes . --out ./caption_groups-vertical.json
node /root/pi-harness/skills/product-launch-video/scripts/assemble-index.mjs \
  --storyboard ./STORYBOARD-vertical.md --hyperframes . --audio-meta ./audio_meta2.json
node /root/pi-harness/skills/product-launch-video/scripts/transitions.mjs inject \
  --storyboard ./STORYBOARD-vertical.md --hyperframes .
# i sottotitoli devono essere marcati come traccia caption nell'index appena scritto:
#   data-track-kind="captions" su <div id="el-captions">
npx hyperframes check
npx hyperframes render --quality high --output renders/nexus-promo-9x16.mp4
```

Dopo il render verticale, per tornare al master orizzontale: ripetere i comandi sopra con
`./STORYBOARD.md` (e rigenerare `compositions/captions.html` sul formato orizzontale).

## Trappole già pagate (non ripagarle)

- **Il frontmatter deve essere la prima cosa in `STORYBOARD-vertical.md`**: un titolo markdown prima di `---`
  fa ricadere il parser sul formato orizzontale, e ti ritrovi caption da 1920 dentro un canvas 1080.
- **`semanticColors`** ricava `ink`/`canvas` dai nomi delle chiavi: su un brand scuro va dichiarata a mano
  una chiave `ink` chiara, altrimenti testo e fondo dei sottotitoli diventano lo stesso colore.
- **Font**: Inter e Georgia non sono installati. Il video usa **P052** (Palatino, il serif dichiarato dal sito)
  e **Nimbus Sans**, spediti come file in `assets/fonts/` (`@font-face` è obbligatorio, il lint lo pretende).
- **Un solo `index.html` con `data-composition-id` per progetto**: i build extra vanno in `builds/`.
- Il contatore di utilizzo della CLI risponde `status: unknown (unsupported_harness)`: la quota non è nota.
- **I tempi parola di `audio_meta.json` sono relativi all'inizio del frame**, non assoluti: con offset
  assoluti si ottengono valori negativi e TUTTI i sottotitoli collassano nei primi secondi (e l'ultimo
  gruppo del file resta acceso fino alla fine, perché `captions.mjs` lo tratta come "ultimo").
  Sintomo in `check`: nessun errore, ma la stessa parola visibile in ogni frame.
- Il crop ordinato da `montage` è alfabetico: `o12.png` viene prima di `o3.png`. Per rivedere il
  montaggio in ordine, numerare i frame con lo zero davanti (`o03.png`).

## Costi misurati

Render 1080p/30fps, 40 s, 1200 fotogrammi: **2m27s** (16:9) e **2m20s** (9:16) su questa macchina
(capture software, ~1 worker) — circa **3,6 s di CPU per secondo di video**.
