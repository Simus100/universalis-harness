# Catena di creazione giochi — LÖVE 2D (fase 1)

Un **sistema di creazione** per giochi 2D che gira interamente su Linux, senza GPU e senza editor
grafico: io lavoro sui file (testo), il motore gira su display virtuale, le prove sono automatiche.
RPG Maker e GameMaker non lo permettono perché a un certo punto pretendono un umano davanti a una
GUI; qui non c'è nessun passaggio manuale.

## Come è fatto il prototipo (`prototipo/`)

| File | Che cos'è | Dipende da LÖVE? |
|---|---|---|
| `logica.lua` | il mondo: mappa, collisioni, quest, dialoghi, porte, vittoria | **no** — Lua puro |
| `main.lua` | la presentazione: disegno, input da tastiera, ciclo del motore | sì |
| `harness.lua` | il banco di prova: esegue una sceneggiatura a passi fissi, salva screenshot e report | no |
| `sceneggiatura.lua` | una partita completa scritta come sequenza di comandi | no |
| `test_logica.lua` | prove delle regole di gioco (collisioni, quest, dialoghi, determinismo) | **no** — Lua puro |
| `esegui_sceneggiatura.lua` | esegue la sceneggiatura senza grafica (verifica rapida) | **no** |
| `conf.lua` | finestra 800x600, vsync spento | sì |

Il principio: **tutto ciò che decide sta in `logica.lua`**, che non chiama mai `love.*`. Così le
regole si provano in millisecondi e senza display, mentre la grafica resta in `main.lua`.

## I tre comandi

```bash
./prova-logica.sh          # regole di gioco, Lua puro, millisecondi
./prova-sceneggiatura.sh   # la partita completa senza grafica (verifica rapida delle regressioni)
./prova-headless.sh        # la partita completa SU SCHERMO VIRTUALE: produce schermate/ + report.json
```

Il terzo è quello che dà il feedback visivo: `xvfb-run` crea un display virtuale, Mesa (llvmpipe)
renderizza via software, LÖVE disegna, e il banco salva un PNG nei momenti scelti. Il report JSON
contiene gli esiti di ogni verifica e lo stato finale della partita.

## Formato della sceneggiatura

```lua
return {
  { nota = "vado da Nilo" },                                  -- commento
  { tasti = { giu = true }, tile = 3 },                       -- tieni premuto per 3 tile
  { tasti = { giu = false, destra = true }, tile = 2 },
  { interagisci = true, secondi = 0.4 },                      -- tocca E alla fine dei 0,4 s
  { leggi = true },                                           -- legge il dialogo fino in fondo
  { screenshot = "02-nilo.png" },                             -- scatta QUI
  { atteso = { ["quest.hint"] = true, ["dialogo.aperto"] = false } },
}
```

Regole che contano:

- **`tile` invece di `secondi`** per i movimenti: il banco converte con la velocità e il lato dei
  tile letti dalla logica, quindi la sceneggiatura non ha tempi calcolati a mano (che si sbagliano
  sempre).
- **`leggi = true`** per i dialoghi: legge fino alla chiusura senza il tocco di troppo che li
  riaprirebbe. Con un numero fisso di tocchi, cambiare una battuta romperebbe la prova.
- Un comando che produce un **effetto** (un tocco) chiude il frame: verifiche e letture avvengono al
  frame successivo, altrimenti si guarderebbe uno stato che il mondo non ha ancora ricevuto.
- Gli **screenshot** vengono dopo che il testo si è scritto (`{ secondi = 0.58, screenshot = ... }`),
  altrimenti si fotografa un dialogo vuoto.

## Verifica visiva e diagnosi

- Il report JSON (`schermate/report.json`) è la memoria della prova: esiti, note e stato finale.
- `H.depura = true` in `esegui_sceneggiatura.lua` stampa ogni comando eseguito con posizione e
  stato: dice **dove** si blocca una sceneggiatura, senza guardare screenshot.
- Le prove hanno già trovato due bug veri: la porta che non si apriva mai (le porte sono salvate con
  coordinate di *tile*, la ricerca di prossimità confrontava *pixel*) e il corridoio di un solo tile
  che incastrava il personaggio (corretto allargandolo a due: era un problema di level design).

## Come si estende

1. **Nuovo contenuto**: si tocca `logica.lua` (mappa, quest, dialoghi) e si aggiungono i comandi
   corrispondenti in `sceneggiatura.lua`, con le asserzioni su ciò che dev'essere vero.
2. **Nuova grafica**: `main.lua` (disegno procedurale: nessun asset esterno, nessun problema di
   licenza).
3. **Regole di gioco**: si provano in `test_logica.lua` con i movimenti a tappe (`vaiX` / `vaiY`) e il
   centraggio (`centra`), non con tempi a mano.
4. **Fase 2 (Godot)**: il formato della sceneggiatura e il principio «logica pura + banco di prova»
   sono portabili; Godot si aggiungerà come secondo runtime, con l'editor a disposizione dell'utente
   sul proprio PC quando serve fisica, UI complessa, effetti o 3D.

## Note d'ambiente

- `SDL_AUDIODRIVER=dummy` nello script headless: la macchina non ha scheda sonora e LÖVE altrimenti
  non parte.
- Installati dai repository Ubuntu: `love` 11.5, `xvfb`, Mesa (`llvmpipe`, OpenGL 4.5 software),
  `lua5.4`. Nessuna GPU necessaria.
