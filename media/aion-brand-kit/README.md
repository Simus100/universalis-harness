# Aion · AI News — kit di brand

Tutti i file di questa cartella nascono da **un solo sorgente del marchio**:
`scripts/aion-mark.mjs` (`MARK_PATH`, `markGroup`, `onlineDot`). Se il marchio cambia, si cambia quel
file e si rilancia `node media/aion-brand-kit/make-brand-kit.mjs`: logo, lockup, palette e guide si
rigenerano identici. **Nessuno di questi file va ridisegnato a mano.**

## Il marchio

Una **A geometrica attraversata da un taglio netto a 45°**: la metà alta è blu, la bassa è viola. In
alto a destra un **punto verde**: lo stato «online», l'unico elemento che dice che è vivo.

- Il taglio non è decorazione: è il segno distintivo. Non va addolcito, non spostato, non ammorbidito.
- La silhouette conta più del dettaglio: a 40 px si deve leggere «A», e si legge.
- Tenere i due gradienti vicini di tono: aumentando il contrasto fra le metà, il segno si sporca a
  piccole dimensioni.

## Inventario

| File | Cosa è | Quando si usa |
|---|---|---|
| `marchio/marchio-colore-2048.png` | marchio su **trasparente**, 2048² | apertura/chiusura, overlay su footage |
| `marchio/marchio-colore-1024.png` | idem, 1024² | uso generale, web |
| `marchio/marchio-colore-512.png` | idem, 512² | favicon, avatar piccoli |
| `marchio/marchio-bianco-1024.png` | **monocromo bianco**, trasparente | timbro su foto/footage, watermark, bassorilievo |
| `marchio/marchio-su-nero-2048.png` | marchio su fondo `#05070c` | card, diapositive, schermata di chiusura |
| `lockup/lockup-orizzontale-980x500.png` | marchio + «AION» + «AI NEWS» | intestazione, descrizioni, banner |
| `lockup/lockup-verticale-700x820.png` | impaginazione centrata | coda video, locandina, immagine condivisa |
| `profilo/aion-profilo-2048.png` | immagine del profilo (cerchiata, fondo scuro) | immagine profilo Facebook/Instagram |
| `profilo/aion-profilo.svg` | vettoriale del profilo | se serve un'altra misura |
| `copertina/aion-copertina-3280x1248.png` | copertina Pagina | copertina Facebook |
| `copertina/aion-copertina.svg` | vettoriale | se serve un'altra misura |
| `palette/palette.png` | tavola dei colori con hex | riferimento rapido |
| `palette/palette.json` | gli stessi colori, per il codice | generazione automatica |
| `guide/safe-zone-9x16.png` | zone sicure del reel | prima di impaginare qualsiasi verticale |
| `guide/safe-zone-1x1.png` | margini del post quadrato | card e post |
| `tipografia/DejaVuSans-Bold.ttf` · `DejaVuSans.ttf` | il carattere del marchio | montaggio, card, overlay |
| `tipografia/LICENZA.txt` | licenza Bitstream Vera / DejaVu | libera, uso commerciale consentito |
| `testi-overlay/beat1…beat6.png` | i testi del film, 1080×1920 in trasparenza | montaggio del reel |
| `testi-overlay/beat4-cta.png` | la coda con l'invito alla Pagina | versione con call to action |

## Colori

| Ruolo | Hex | Uso |
|---|---|---|
| Fondo 0 | `#05070c` | sfondo di ogni immagine |
| Fondo 1 | `#0b1120` | secondo stop del gradiente |
| Testo | `#f6f9ff` | titoli |
| Secondario | `#96a9c4` | sottotitoli, firma |
| Blu | `#5b9dff` | modelli, piattaforme, orizzonte |
| Viola | `#8b5cff` | Meta, ricerca, futuro |
| Verde | `#34d399` | «online», stato, ok |
| Giallo | `#fbbf24` | numeri, prezzi, avvertenze |

Un solo accento per categoria, costante nel tempo: è questo che rende il profilo riconoscibile in
mezzo al feed. **Nessun arancione, in nessun caso**: i generatori di immagini tendono ad aggiungerne
nei riflessi, e va corretto in post.

## Tipografia

Un solo carattere, **DejaVu Sans**. Titoli in Bold. Mai più di due corpi per immagine. Mai testo sotto
i 16 px in un'immagine 1200×630: sul telefono sparisce. Titolo di una card: massimo due righe, con il
corpo **calcolato misurando il testo**, non stimando i caratteri.

## Regole d'uso

1. **Spazio di rispetto**: attorno al marchio lasciare almeno il 30% della sua altezza. Niente
   scritte, bordi o altri elementi dentro quella fascia.
2. **Non** ruotare il marchio, non cambiare l'angolo del taglio, non colorare le due metà con colori
   diversi dalla palette, non togliere il punto verde (tranne nella versione monocroma).
3. Su fondo chiaro si usa la versione monocroma scura o si mette il marchio dentro un riquadro
   `#05070c`: il marchio non è pensato per stare su bianco.
4. **Nessuna finta fotografia.** Le immagini di Aion sono card tipografiche, schemi, grafici con numeri
   veri. Un'immagine realistica è fuori dalla testata, non solo fuori dal gusto.
5. Dimensione minima: 40 px di altezza (marchio), 120 px (lockup orizzontale). Sotto, si usa solo il
   segno.

## Come si rigenera

```bash
node media/aion-brand-kit/make-brand-kit.mjs
```

Serve `rsvg-convert` (per i PNG dai vettoriali) e i font DejaVu installati. Lo script scrive sia gli
SVG (modificabili) sia i PNG (da consegnare): se un PNG non convince, si corregge l'SVG o il sorgente
del marchio, **mai** il PNG.

## Variante in rilievo (3D) — ADOTTATA il 28 ottobre 2026

Il marchio esiste anche come **solido estruso** (`scripts/aion-logo-3d.mjs`), utile come immagine del
profilo «elaborata»: stesso profilo della A (letto da `aion-mark.mjs`), taglio a 45° rispettato,
smusso, tre luci, riflesso e la sfera verde in rilievo. Due pose pronte: `media/aion-logo-3d-a.*`
(calma, consigliata) e `media/aion-logo-3d-b.*` (due lastre staccate, più scenografica).

```bash
# A · rilievo calmo (spessore 14%, posa quasi frontale)
node scripts/aion-logo-3d.mjs --out media/aion-logo-3d-a --yaw -14 --pitch 8 --gap -4 --bevel 0.010 --depth 0.14
# B · più profondo (spessore 17%, prospettiva più marcata)
node scripts/aion-logo-3d.mjs --out media/aion-logo-3d-b --yaw -18 --pitch 9.5 --gap -4 --bevel 0.011 --depth 0.17
rsvg-convert -w 2048 -h 2048 -o media/aion-logo-3d-a@2x.png media/aion-logo-3d-a.svg
```

Quattro regole che il generatore rispetta e che vanno tenute se lo si modifica:

1. il taglio a 45° è un **bordo vivo**: mai smussato (altrimenti nasce un piano diagonale che
   attraversa la lettera);
2. lungo il taglio **non si disegna la faccia di taglio** (lo spessore interno): nel marchio piatto
   non c'è, e in 3D diventa una riga diagonale colorata che attraversa la A (`--cutface` la
   riaccende, ma non serve);
2b. le due metà **si sovrappongono** di pochi pixel (`--gap -4`): con una fessura, o anche con le
   metà solo accostate, tra i due colori resta una riga scura — il fondo che traspare. In
   sovrapposizione il confine è solo un cambio di colore, come nel piatto;
3. le due metà usano i **gradienti del marchio** (`markTop`/`markBot`), non i due accenti della
   palette, e i laterali stanno in una gamma chiusa perché quei colori sono già chiari;
4. gli smussi **interni** (bordo del foro) e quelli **di taglio** stanno in ombra: sono superfici
   incassate, e se prendono la luce chiave sembrano errori.

La variante **A** è l'immagine del profilo in uso sulla Pagina dal 28 ottobre 2026 (caricata via
Pages API, `POST /{page-id}/picture` con `no_feed_story=true`, e riletta da Graph per verifica). I file
piatti (`profilo/aion-profilo-2048.png`, `media/aion-logo@2x.png`) restano come ripiego: è lo stesso
segno, quindi si può tornare indietro senza toccare nient'altro.

## Cosa non c'è qui, di proposito

Nessun template di post «generico», nessun mockup, nessun carattere alternativo, nessuna variante di
colore: un marchio giovane si riconosce dalla ripetizione, non dalla ricchezza del kit.
