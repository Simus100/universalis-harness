---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Il rumore non è informazione: Altair Nexus riduce 151 fonti a 9 storie che contano."
destination: social vertical (Reels/TikTok/Shorts) + YouTube e sito
aspect: 1920x1080 master + 1080x1920 ricomposto
language: it
length: 35-40s
audience: "professionisti informati italiani (25-55) che seguono AI, tecnologia, geopolitica, finanza: leggono molto, hanno poco tempo, diffidano dell'ennesimo aggregatore"
angle: "A+B — caos che si acquieta, poi la riduzione 151 -> 9"
voice: piper it_IT-serena-high (offline)
style_preset: pending
---

## Intent

Video promozionale di **Altair Nexus** (https://nexus.universalis.it/site/), briefing editoriale pubblico
di Universalis Produzioni: 151 fonti analizzate diventano 9 storie in edizione, ognuna con sintesi,
"l'opinione di Aion", "perché conta" e la fonte dichiarata. L'obiettivo dichiarato dall'utente è
portare visualizzazioni al sito, quindi il video deve funzionare da fermo, nei primi due secondi,
in un feed verticale.

Taglio scelto (A + B): si apre sul rumore — titoli che scorrono incomprensibili, il mondo che urla
addosso — poi tutto si ferma e i numeri dell'edizione scorrono all'indietro: 151 fonti, 9 storie,
una linea di forza. Chiude su *Le notizie che contano.* Tono: editoriale, sobrio, sicuro di sé;
nessuna arroganza da startup, nessuna emoji, zero claim non verificabili.

## Assets

- Catture reali del sito (Step 1): hero, Aion Brief, metriche dell'edizione, una pagina storia, area Report.

## Customizations

- **Due formati**: master orizzontale 1920x1080 (sito, YouTube) e versione verticale 1080x1920
  **ricomposta a mano** (blocchi di interfaccia ingranditi uno alla volta), non ritagliata.
- **Voce narrante italiana + testo a schermo sempre presente** (la maggior parte guarda senza audio).
- Apertura con hook nei primi 2 secondi; chiusura con invito (URL + "Apri Altair Nexus").

## Notes

- Offline: HeyGen non autenticato (nessuna richiesta di credenziali all'utente), voce con **piper**
  `it_IT-serena-high`, musica sintetizzata con **ffmpeg** (come nel progetto `media/nimbo-intro`).
- Brand tokens presi dal CSS del sito: fondo `#09111b`, testo `#edf3fb`, accenti `#6adfff`,
  `#9c85ff`, `#71ebd5`; titoli serif (Iowan Old Style / Palatino / Georgia), testo Inter.
- Il contatore di utilizzo della CLI risponde `status: unknown (unsupported_harness)`: la quota di
  render non è nota e va verificata al primo render.
- Da evitare: immagini stock, facce generate, claim tipo "rivoluziona", dati inventati.
