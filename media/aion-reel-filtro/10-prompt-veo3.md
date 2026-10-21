# Prompt per Veo 3 — tre clip, 9:16, 8 s

Tre clip da **8 secondi** ciascuna, montate a 5 / 5 / 3,4 s: il resto è margine per scegliere il
punto di taglio migliore. Genera in **9:16 (1080×1920)**, **8 s**, **senza testo nell'immagine**
(Veo non sa scrivere in italiano: ogni parola la mettiamo noi in overlay).

Le tre clip stanno o cadono insieme: se una cambia colore o "materiale", il montaggio si vede.
Per questo ogni prompt ripete la stessa tavolozza e lo stesso tipo di camera.

## Regole comuni (valgono per tutte e tre)

- **Materiale unico**: polvere di luce e filamenti luminosi, nitidi; sfondo quasi nero.
- **Niente**: persone, mani, volti, edifici, uffici, schermi di computer, robot, cervelli, circuiti
  stampati, grafici con numeri, testo, lettere, loghi, watermark.
- **Tavolozza**: fondo `#05070c` → `#0b1120`; accenti blu `#5b9dff` e viola `#8b5cff`; un solo
  punto verde `#34d399` ammesso solo nella clip C.
- **Camera**: macro, sempre in avanti, movimento lento e continuo (nessun taglio interno, nessuna
  carrellata laterale, nessun movimento di macchina a mano).
- **Composizione**: la parte centrale del fotogramma resta **relativamente libera** — ci va il
  testo. L'energia visiva sta in alto e ai bordi.
- **Audio**: nessuna voce, nessun dialogo. Un ronzio ambientale basso va bene; la musica la
  mettiamo noi in montaggio.

Negative prompt da usare per tutte e tre (campo `negativePrompt`, se il tuo accesso ce l'ha):

```
people, person, face, hands, human figure, crowd, office, city, building, computer screen,
laptop, robot, android, humanoid, brain, printed circuit board, wires, gears, charts, numbers,
text, letters, words, caption, subtitle, logo, watermark, signature, brand, stock footage look,
daylight, warm colors, orange, sepia, oversaturated, lens flare, fast motion, camera shake,
handheld, zoom snap, cuts, multiple shots, cartoon, anime, 3d render plastic
```

---

## Clip A — il rumore (0,0 – 5,0 s)

> Macro photography of countless tiny shards of light suspended in dark air, drifting toward the
> camera with slow parallax. Each fragment is a sliver of cold blue-white glow, some sharp, some
> thrown far out of focus into soft bokeh. The camera pushes forward very slowly and continuously,
> as if moving through a dense cloud of glowing dust. The background is near-black, a deep
> blue-black gradient (#05070c to #0b1120). Cool palette only: icy blue (#5b9dff) and violet
> (#8b5cff) highlights. Shallow depth of field, macro lens, high dynamic range, filmic grain.
> The center-lower area of the frame stays relatively empty and out of focus — the density is at the
> top and at the edges. No text, no letters, no people, no objects, no logos. Ambient hum only, no
> speech.
>
> Cinematography: macro, 100mm equivalent, f/2.0, slow steady dolly-in, no shake.
> Mood: overwhelming, quiet, cold. Duration 8s.

**Cosa deve succedere**: nessun evento. Solo densità che scorre. Se Veo mette un oggetto
riconoscibile, rigenera: è la clip che si taglia più facilmente, ma non deve introdurre "cose".

## Clip B — il taglio (5,0 – 10,0 s)

> A thin plane of brilliant light sweeps across the frame on a **45-degree diagonal**, passing
> through a cloud of glowing dust and cleanly dividing it in two: the particles above the diagonal
> turn icy blue (#5b9dff), the particles below turn violet (#8b5cff). The dividing line is razor
> sharp, perfectly straight, with a thin dark gap along it, and it stays at 45 degrees for the whole
> shot. Behind it, the dust drifts slowly; the camera pushes forward very slowly, keeping the
> diagonal fixed in frame. Near-black background, deep blue-black gradient. Macro lens, shallow
> depth of field, filmic grain, high dynamic range. The diagonal crosses the middle of the frame but
> the areas just left and right of center stay softly out of focus, leaving room for a caption.
> No text, no letters, no people, no objects, no logos. Ambient hum only, no speech.
>
> Cinematography: macro, 100mm equivalent, slow steady dolly-in, no camera shake, single continuous
> shot.
> Mood: decisive, surgical, calm. Duration 8s.

**Cosa deve succedere**: **un** passaggio del piano, netto. Il rischio è che Veo faccia un
"energy beam" da videogioco o un vortice: se il taglio ondeggia o si spezza, rigenera. Il 45° deve
restare fermo — è il marchio, non un effetto.

## Clip C — le tre righe (10,0 – 13,4 s)

> Out of a dark cloud of drifting glowing dust, three horizontal filaments of light emerge one
> after another and settle into three parallel lines, evenly spaced, perfectly straight, aligned
> with the horizon. The dust around them calms and falls away as the lines form. The three lines
> glow cold blue-white (#5b9dff) with a faint violet edge (#8b5cff), and a single small green point
> (#34d399) appears for a moment at the right end of the top line, then fades. Camera holds almost
> still with a very slow push in. Near-black background, deep blue-black gradient, macro lens,
> shallow depth of field, filmic grain. The three lines settle in the LOWER THIRD of the frame (roughly 60-70% of the way down),
> leaving the upper-center of the frame empty and softly out of focus. No text, no letters, no people, no objects, no logos.
> Ambient hum only, no speech.
>
> Cinematography: macro, 100mm equivalent, minimal movement, no camera shake, single shot.
> Mood: order out of noise, quiet confidence. Duration 8s.

**Cosa deve succedere**: da caos a **tre** righe, in 8 secondi. Se diventano cinque o se le righe
si incurvano, rifai: il numero tre è il messaggio (tre righe, tre cose).

---

## Se il tuo accesso a Veo ha l'immagine di partenza (image-to-video)

I tre `keyframe/key*.png` sono frame 0 già nella tavolozza giusta, senza testo. Usali come **first
frame** (o come reference) e la continuità cromatica fra le clip diventa quasi automatica.
Se invece generi da solo testo → ometti i keyframe: in questo caso l'immagine iniziale comanda più
del prompt e rischi che il movimento si blocchi (un fondo piatto che non si muove).

## Parametri da controllare

| Parametro | Valore | Perché |
|---|---|---|
| Aspect ratio | **9:16** | verticale = reel su Facebook |
| Durata | **8 s** | 5+5+3,4 montati: il margine serve al taglio |
| Person generation | **nessuna persona** | regola 3 della testata |
| Audio | spento o ambient | la musica è nostra (nessun diritto di terzi) |
| Numero di tentativi | 2-3 per clip | la clip A è la più permissiva, la B la più difficile |

## Cosa fare con le clip che non convincono

Non si "aggiustano" in montaggio: si rigenerano con **una variabile cambiata**. Se la clip B non
tiene il 45°, la variabile non è il testo — è il movimento: aggiungi `the diagonal line does not
move, only the dust moves, no rotation, no wobble`. Se Veo insiste col bagliore, togli la parola
`brilliant` e metti `matte, low-luminance, no glow bloom`.
