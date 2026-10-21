# Reel «Il filtro» — storyboard e decisioni

Pagina: **Aion · AI News** (id `1444686848724804`). Formato: reel verticale **9:16, 17,2 s**.
Obiettivo: chi non conosce la Pagina deve capire in 17 secondi **cosa fa** (filtra, non riporta tutto)
e **perché seguirlo** (tre righe, con la fonte). Non è un post-notizia: è la carta d'identità.

## L'idea in una riga

Il rumore si separa in due metà con **un taglio netto a 45°** — che è il segno del marchio Aion —
e da quelle due metà restano **tre righe** di luce. Il video dice la promessa senza pronunciarla
fino all'ultimo secondo.

## La regola che ha deciso l'impianto

La testata (`media/aion-testata.md`, regola 3) vieta le finte fotografie. Un generatore video AI
produce per natura footage realistico: usato "bene" avrebbe prodotto il primo video **incoerente**
con la Pagina. Perciò:

- **Veo 3 fa solo la materia**: particelle di luce, un piano che taglia, tre filamenti. Nessuna
  persona, nessun oggetto riconoscibile, nessuna città, nessun ufficio, nessun volto.
- **Testi e marchio li mettiamo noi**, in overlay, con lo stesso DejaVu Sans e la stessa palette
  delle card. Così il testo è sempre scritto giusto (nessun generatore sa scrivere in italiano) e
  il marchio resta identico a quello del profilo.
- La coda finale (ultimo 3,8 s) è **tutta nostra**, non generata: fondo scuro, marchio, promessa.

## Timeline

| # | Tempo | Sorgente | Visual | Testo in overlay |
|---|---|---|---|---|
| 1 | 0,0 – 5,0 | Veo, clip A | Migliaia di frammenti di luce scorrono verso la camera, fuori fuoco | `AION · AI NEWS` / **Ogni giorno: annunci,<br>demo, benchmark.** |
| 2 | 5,0 – 10,0 | Veo, clip B | Un piano di luce attraversa la scena **a 45°** e divide il rumore: sopra blu, sotto viola | **Quasi niente<br>ti cambia la giornata.** |
| 3 | 10,0 – 13,4 | Veo, clip C | Dal caos emergono **tre filamenti orizzontali** che si allineano | **Ne restano poche.<br>Le scegliamo noi.** |
| 4 | 13,4 – 17,2 | nostro (SVG) | Fondo `#05070c`, marchio, punto verde «online» | **L'AI spiegata<br>in tre righe.** / Aion · AI News — ogni giorno, con la fonte |

Perché 4 colpi e non 6: a 17 secondi un colpo ogni ~4 s è il ritmo che si legge senza riavvolgere;
con sei colpi i testi scenderebbero sotto le 14 sillabe e il reel diventerebbe una lista.

Perché il 45° al centro: il taglio obliquo è l'unico elemento non negoziabile del marchio
(`media/aion-knowledge/20-stile-visivo.md`). È anche la metafora esatta del filtro: una linea che
divide. Nessun'altra scelta grafica diceva la stessa cosa con lo stesso segno.

## Come si guarda

- **Safe zone**: nel reel di Facebook la UI copre la fascia bassa (~420 px) e la colonna destra
  (~180 px). Tutti i testi stanno fra y=560 e y=1300, allineati a sinistra con margine 96 px.
- **Sul telefono, muto**: il video si deve capire senza audio. L'audio (nostro, sintetizzato) è un
  letto, non un contenuto.
- **Continuità**: stessa palette in tutte le clip (fondo `#05070c`→`#0b1120`, accenti `#5b9dff` e
  `#8b5cff`), stesso tipo di camera (macro, lenta, sempre in avanti), stesso "materiale" (luce e
  polvere, non oggetti).

## I file

| File | Cosa è |
|---|---|
| `00-brief.md` | questo documento |
| `10-prompt-veo3.md` | i tre prompt pronti da incollare in Veo 3, con negative prompt e parametri |
| `20-testi.md` | i testi esatti, i tempi, la caption del post e le note di pubblicazione |
| `overlay/beat*.png` | i testi in trasparenza, 1080×1920 (già pronti) |
| `keyframe/key*.png` | frame 0 facoltativi da dare a Veo come immagine di partenza |
| `make-assets.mjs` | rigenera overlay e keyframe (il marchio viene da `scripts/aion-mark.mjs`) |
| `assemble.mjs` | montaggio: `--animatic` (sfondi finti, per controllare i tempi) oppure con le clip vere |
| `animatic.mp4` | montaggio di prova: **guardalo prima di spendere i tre render** |

## Ordine di lavoro

1. Guarda `animatic.mp4` (già prodotto). Se il ritmo o un testo non tornano, si cambia qui: costa
   un minuto. Dopo i render, cambiare un testo costa un render.
2. Incolla i tre prompt di `10-prompt-veo3.md` in Veo 3, scarica gli mp4.
3. Mettili in `clip/shotA.mp4`, `clip/shotB.mp4`, `clip/shotC.mp4`.
4. `node media/aion-reel-filtro/assemble.mjs` → `media/aion-reel-filtro/aion-reel-filtro.mp4`.
5. Pubblicazione: `node skills/social-publish/publish.mjs post --video … --text "…"` (testo in
   `20-testi.md`). Il verticale viene classificato da Facebook come **reel**.

## Cosa questo video non fa (e va detto)

Non spiega una notizia: non porta un dato nuovo. Serve a convertire chi arriva già sulla Pagina o
chi vede il reel nel feed, non a essere citato. Se l'obiettivo è far crescere i follower da zero,
il collo di bottiglia non è questo video ma il ponte dal sito (`media/aion-seguici.html`, ancora da
incollare sul lato del sito) — il reel è il carburante giusto per quella miccia, non la miccia.
