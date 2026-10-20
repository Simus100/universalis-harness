# 20 — Stile visivo

## Il marchio

Una **A geometrica attraversata da un taglio netto a 45°**: la metà alta è blu, la bassa è viola.
In alto a destra un **punto verde**: lo stato «online». È l'unico elemento che dice «questo è vivo».

- Il taglio non è decorazione: è il segno distintivo. Non va addolcito, non va spostato.
- La silhouette conta più del dettaglio: a 40 px si deve leggere «A», e si legge.
- Sorgente unica: `scripts/aion-mark.mjs` (`MARK_PATH`, `markGroup`, `onlineDot`).
  Logo, copertina e card importano da lì: cambiare il marchio = cambiare quel file.
- Nel marchio, l'equilibrio da non rompere: se si aumentano i contrasti tra le due metà,
  il segno si sporca a piccole dimensioni. I due gradienti devono restare vicini di tono.

## Colori

| Ruolo | Valore | Uso |
|---|---|---|
| Fondo | `#05070c` → `#0b1120` | sfondo di ogni immagine |
| Testo | `#f6f9ff` | titoli |
| Testo secondario | `#96a9c4` | sottotitoli |
| Accento base | `#5b9dff` | modelli, piattaforme |
| Accento 2 | `#8b5cff` | Meta, ricerca |
| Positivo | `#34d399` | regole, gergo, «ok» |
| Attenzione | `#fbbf24` | numeri, prezzi, avvertenze |

L'accento racconta la categoria del post, e resta costante nel tempo: lo stesso tema ha sempre
lo stesso colore. È questo che rende un profilo riconoscibile in mezzo al feed.

## Tipografia

- Un solo carattere: **DejaVu Sans** (l'unico affidabile su questa macchina). Titoli in Bold.
- Mai più di due corpi per immagine.
- Mai testo sotto i 16 px nell'immagine 1200×630: sul telefono sparisce.
- Il titolo di una card: massimo due righe, e il corpo si calcola **misurando** il testo, non
  stimando i caratteri.
- Nella copertina: nome della testata in maiuscoletto con spaziatura larga (tracking 8-9),
  titolo grande in Bold, promessa in una riga sola.

## Regole delle immagini

1. **Nessuna finta fotografia.** Niente immagini che sembrano scatti reali: card tipografiche,
   schemi, grafici con numeri veri.
2. **Una sola informazione per card.** Kicker (categoria) + titolo. Il resto va nel testo del post.
3. **La fascia centrale è sacra.** 640×312 al centro della copertina: quello che sta lì si vede sul
   telefono, il resto è per il desktop.
4. **Sempre il @2x.** Mai caricare il file a 1x: Facebook lo ammorbidisce su schermi retina.
5. **Il marchio in ogni immagine**, in alto o nel lockup. È la continuità.

## Formati

| Pezzo | Dimensioni logiche | File da caricare |
|---|---|---|
| Profilo | 1024×1024 | `aion-logo@2x.png` (2048) |
| Copertina | 1640×624 | `aion-copertina@2x.png` (3280×1248) |
| Card post | 1200×630 | `card-*@2x.png` (2400×1260) |

## Generatori

```bash
# marchio + copertina: modificare scripts/aion-mark.mjs, poi
rsvg-convert -w 2048  -h 2048 -o media/aion-logo@2x.png      media/aion-logo.svg
rsvg-convert -w 3280  -h 1248 -o media/aion-copertina@2x.png media/aion-copertina.svg

# card di un post
node scripts/card-aion.mjs --kicker "Modelli · Google" \
  --titolo "Gemini 4 Argon, e il|prezzo «introduttivo»" \
  --accento "#5b9dff" --out media/card-gemini
```
