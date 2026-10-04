---
name: immagini
description: Legge e mostra immagini — foto dell'utente, screenshot, scansioni, grafici in immagine, immagini trovate sul web. Usala quando l'utente chiede di guardare o descrivere una foto, di leggere il testo dentro un'immagine, di mostrare un'immagine in chat, o quando trovi un'immagine navigando il web e vuoi farla vedere. Copre anche il blocco ```img per l'anteprima in chat e i limiti di formato e dimensione.
---

# Immagini: guardarle e mostrarle

Due mestieri diversi, spesso confusi: **guardare** un'immagine (per rispondere su quello che contiene) e **mostrarla** (perché la veda l'utente). Qui c'è come fare l'uno e l'altro, con i limiti reali di questo harness.

## 1. Guardare un'immagine (visione)

Il modello attivo **vede** le immagini: il tool `read` su un file `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` o `.bmp` le manda come immagine, non come testo.

```
read /root/pi-harness/media/foto.jpg
```

Regole pratiche:
- **Non** convertire in base64, non incollare byte, non chiamare OCR esterni: se serve leggere un testo dentro l'immagine, guarda l'immagine.
- Se il file è grande, il tool lo ridimensiona da sé. Non serve prepararlo.
- Se la risposta del tool è `[Current model does not support images…]`, il modello attivo è senza visione: dillo all'utente, proponi di passare a un modello che le supporta (selettore in barra) **oppure** limitati a mostrare l'immagine con il blocco qui sotto, senza descriverla.
- Descrivi **quello che vedi**, distinguendo ciò che è certo (testo letto, forme, colori) da ciò che deduci. Se l'immagine è sfocata o tagliata, dillo: è un'informazione utile, non una scusa.

## 2. Mostrare un'immagine in chat (blocco `img`)

Un blocco con linguaggio `img` (anche `image` o `foto`) diventa un'anteprima nella risposta, nel punto esatto del messaggio:

````
```img
media/foto.jpg
La facciata del palazzo, ripresa da sud
```
````

- **Prima riga**: il percorso del file, **relativo alla root della dashboard** (`media/foto.jpg`, `progetti/sito-web/logo.png`). Solo file locali: gli URL remoti non vengono caricati.
- **Righe successive** (facoltative): la didascalia, che diventa anche il testo alternativo. Una riga breve e concreta.
- Un'immagine per blocco. Per due immagini, due blocchi.
- Formati ammessi: png, jpeg, gif, webp, bmp, avif. Fino a **40 MB**: oltre, la card dice di aprirla dai file e non scarica i byte.
- Per un **disegno vettoriale** usa il blocco ```` ```svg ```` (passa dal sanitizzatore): il blocco `img` rifiuta gli SVG, di proposito.
- Se il file non esiste, è troppo grande o non è un'immagine, la card lo dice con il motivo: la chat non si rompe e l'utente capisce cosa manca.

Il clic sull'anteprima apre il **lettore a schermo intero** (galleria con le altre immagini della stessa cartella, zoom, rotazione, schermo intero, scarica).

## 3. Immagini trovate sul web

Non linkare l'immagine di un sito dentro il blocco `img` (non verrebbe caricata). La strada è **scaricarla nella media**, darle un nome parlante e mostrarla da lì:

```bash
curl -L --fail --max-time 20 -o /root/pi-harness/media/cupola-duomo-milano.jpg "https://…/cupola.jpg"
```

Poi nel messaggio: il blocco `img` con il percorso in `media/` **e la fonte** nel testo (URL della pagina, non solo del file).

- Cita sempre la fonte e lo scopo d'uso. Se l'immagine è di un'agenzia, protetta o non necessaria, **descrivila a parole e linka la pagina**: mostrarla va bene quando serve a capire (una mappa, un prodotto concordato, una foto dell'utente), non per riempire.
- Verifica che il download sia andato a buon fine: un file HTML salvato come `.jpg` viene rifiutato dal server con un motivo chiaro — se accade, la fonte non era quella giusta.
- Se serve una schermata di una pagina, usa il tool `browser` (`screenshot`) invece di scaricare l'immagine: è più fedele e finisce in `media/` da sé.

## 4. Cosa non fare

- **Non descrivere un'immagine che non hai letto.** Se non l'hai aperta, dillo.
- Non incollare base64 o dump binari in chat, mai.
- Non usare il blocco `img` per gli SVG (c'è `svg`, sanitizzato).
- Non mostrare immagini con **dati personali di terzi** senza motivo: la dashboard è privata, ma i file versionati del repository sono pubblici — una foto personale non va in `media/` se poi finisce in un commit (vedi la regola di pubblicazione nel contesto).
- Non promettere ciò che l'harness non fa: non c'è riconoscimento facciale, non c'è OCR dedicato, non c'è conversione di formato lato server (niente miniature: l'anteprima è il file originale).

## 5. File e cartelle utili

- Le immagini prodotte o scaricate stanno in `media/` (cartella dei file generati).
- Le foto del progetto possono stare nelle cartelle segnate come progetto: in quel caso mostra il percorso relativo alla root (`progetti/sito-web/logo.png`).
- Il lettore immagini si apre anche dalla vista **File** (clic su un'immagine) e dalle card dei file in chat.
