---
name: giochi
description: "Crea e verifica videogiochi come artefatti eseguibili: un gioco in un file HTML autonomo (browser) oppure un progetto LÖVE 2D con logica pura, banco di prova a sceneggiatura e screenshot su display virtuale. Usala quando l'utente chiede di fare, proseguire, provare o correggere un gioco, o quando serve il ciclo chiuso «scrivo → eseguo headless → guardo → correggo» su una macchina Linux senza GPU."
---

# Fare videogiochi (e provarli davvero)

Su questa macchina **non c'è editor grafico** e **non c'è GPU**: c'è `llvmpipe` (OpenGL software),
`Xvfb` (display virtuale), `lua5.4`, `love` 11.5, `ffmpeg`, `blender --background`. Quindi la
regola è: **giochi come file di testo eseguibili**, verificati con un ciclo automatico.

RPG Maker e GameMaker sono inadatti non perché siano poveri, ma perché **pretendono un umano davanti
a una GUI** a un certo punto (creare il progetto, esportare, collaudare). Qui non c'è nessun
passaggio manuale, e questo è il punto.

## Due strade, scegli in base alla domanda

| Vuoi… | Strada | Dove |
|---|---|---|
| un gioco **subito giocabile in browser**, un file, zero dipendenze | HTML + canvas, tutto procedurale | `media/giochi/radura-delle-lanterne.html` come modello |
| un **sistema di creazione** con contenuto strutturato, prove automatiche, molte mappe/dialoghi | LÖVE 2D + logica pura + banco di prova | `media/giochi/love/` (leggi il suo `README.md`) |

Godot 4 è la fase 2 (motore completo, editor per l'utente sul proprio PC): si aggiungerà come
**secondo runtime dello stesso formato**, non come sostituto.

## Il contratto: cosa rende un gioco verificabile da me

1. **Logica separata dalla grafica.** Tutto ciò che decide (collisioni, quest, dialoghi, punteggi)
   sta in un modulo che non chiama mai l'API grafica: si prova con l'interprete nudo, in
   millisecondi. In LÖVE: `logica.lua` senza `love.*`; in HTML: un blocco di logica senza `canvas`.
2. **Un gancio per l'esterno** (`window.__game` nel browser, il banco in LÖVE) che espone stato,
   teletrasporto, tasti simulati e avanzamento del tempo.
3. **Passi di tempo fissi** (1/60) e nessuna dipendenza dal frame rate: la stessa sceneggiatura dà
   sempre lo stesso risultato.
4. **Screenshot nei momenti che contano** e **asserzioni** su ciò che dev'essere vero lì: le une
   senza le altre non bastano (un test logico non vede un personaggio invisibile, uno screenshot non
   dice se la porta si è aperta).
5. **Nessun asset di terzi non tracciato**: la grafica procedurale evita del tutto il problema delle
   licenze (le linee guida RPG Maker vietano l'addestramento su asset e core script ufficiali).

## Verifica visiva nel browser (HTML)

```bash
cd media/giochi && python3 -m http.server 8123 --bind 127.0.0.1 &
sudo -u pi-browser agent-browser --session gioco open "http://127.0.0.1:8123/<file>.html"
sudo -u pi-browser agent-browser --session gioco eval "JSON.stringify(window.__game.state())"
sudo -u pi-browser agent-browser --session gioco screenshot /tmp/shot.png   # poi copia in media/
sudo -u pi-browser agent-browser --session gioco errors
sudo -u pi-browser agent-browser --session gioco close
```

`agent-browser` va invocato come `pi-browser` e scrive in `/tmp`: gli screenshot si copiano in
`media/`. Un file HTML autonomo funziona anche da `file://` (nessun `fetch`, nessun asset esterno).

## Verifica visiva in LÖVE (display virtuale)

```bash
cd media/giochi/love
./prova-logica.sh          # regole di gioco, Lua puro
./prova-sceneggiatura.sh   # la partita completa senza grafica
./prova-headless.sh        # la partita su schermo virtuale: schermate/ + report.json
```

Il progetto è in `media/giochi/love/prototipo/`; il `README.md` accanto spiega formato della
sceneggiatura, comandi e insidie (durate in **tile**, `leggi = true` per i dialoghi, screenshot dopo
che il testo è scritto).

## Regole che ho imparato (e che vale la pena non ripetere)

- **Il difetto va riprodotto prima di correggerlo.** Nel banco: far fallire la prova con lo stato
  sbagliato stampato, poi correggere.
- **I tempi calcolati a mano sbagliano sempre**: esprimi le distanze in unità di gioco (tile) e
  convertile nel codice.
- **Non usare i tempi nei test di logica**: muovi a tappe verso un tile bersaglio (`vaiX`/`vaiY`) e
  centra il personaggio (`centra`) — un test incastrato in un corridoio stretto non dice nulla sul
  gioco.
- **Un corridoio largo un tile con movimento libero incastra il giocatore** (hitbox 18 px in 32):
  allargalo. È level design, non un bug di codice.
- **Coordinate di tile e coordinate di pixel non si mescolano mai** nella stessa formula: è l'errore
  che ha tenuto chiusa una porta per sempre.
- **Il banco esegue un effetto per frame**: un tocco chiude il frame, la verifica si fa dopo.
- **Gli screenshot dei dialoghi** vanno scattati dopo che il testo si è scritto.
- Prima di dire «fatto»: guardare lo screenshot (le cose invisibili non le vede nessun test) e
  controllare che la pagina non abbia errori JavaScript.

## Dove mettere i file

Giochi e artefatti in `media/giochi/`. I progetti con codice riutilizzabile (logica, banco, prove)
stanno lì con il loro `README.md`. A fine sessione, se ho toccato file versionati:
`bash scripts/github-sync.sh --messaggio "…"` (controllando prima l'elenco con `--stato`).
