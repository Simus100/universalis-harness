# Giochi

Piccoli videogiochi come **un solo file HTML autonomo**: nessuna dipendenza, nessuna build,
nessun asset esterno (tutto disegnato con le primitive di canvas). Si aprono con un doppio clic
nel browser, anche da `file://`, e girano su qualunque macchina.

## `radura-delle-lanterne.html`

Mini avventura top-down (dimostrazione del ciclo di lavoro): mappa a tile definita da stringhe,
collisioni, due NPC con dialoghi condizionati, un oggetto da raccogliere, una porta che si apre,
particelle, audio sintetico (WebAudio, nessun file audio), HUD e schermata di vittoria.

Comandi: frecce o WASD per muoversi, `E` per interagire, `M` audio, `R` ricomincia.

## Come è verificato

Il gioco espone `window.__game` (stato, teleport, tasti simulati, `tick()`, mappa): il collaudo
automatico si fa da fuori, con il browser headless, senza giocare a mano.

```bash
cd media/giochi && python3 -m http.server 8123 --bind 127.0.0.1 &
sudo -u pi-browser agent-browser --session radura open "http://127.0.0.1:8123/radura-delle-lanterne.html"
sudo -u pi-browser agent-browser --session radura eval "$(cat test.js)"      # stato e logica
sudo -u pi-browser agent-browser --session radura screenshot /tmp/shot.png   # resa visiva
sudo -u pi-browser agent-browser --session radura errors                     # errori JS
sudo -u pi-browser agent-browser --session radura close
```

Il collaudo copre l'intera catena (dialogo → chiave → porta → vittoria) e le collisioni contro
acqua, muri, porta chiusa e bordi, con la posizione finale in unità di tile: se un blocco cede,
il numero lo dice.

## Nota

`agent-browser` va invocato come utente `pi-browser` (sandbox) e scrive in `/tmp`: gli screenshot
si copiano poi in `media/`. Un gioco di questa taglia si scrive e si verifica in un passaggio solo.
