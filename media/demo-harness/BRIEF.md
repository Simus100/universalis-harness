---
workflow: product-launch-video
flow: automation
storyboard: yes
mode: autonomous
message: "Scrivi una richiesta in italiano e l'harness la esegue sui tuoi file — dentro una dashboard che sta sul tuo server"
destination: mp4-web
aspect: 1920x1080
language: it
audience: "un potenziale cliente che non conosce il prodotto e non e' del mestiere: titolare o responsabile di una piccola struttura, da introdurre all'harness"
length: 70s
angle: "una giornata con l'harness: qualcuno scrive, l'agente esegue, il risultato appare — tre casi d'uso concreti in sequenza, chiusi dalla dichiarazione che il video stesso e' stato fatto con l'harness"
---

## Intent

Video di **introduzione e demo** per una persona che non ha mai visto il prodotto e non e' tecnica.
Non e' il promo commerciale gia' esistente (`media/promo-harness`, 32s, su capacita' e costi):
questo video **mostra il lavoro che succede** — una richiesta scritta in italiano e il risultato che
compare — con tre casi d'uso scelti perche' comprensibili a chiunque: leggere documenti, guardare un
sito, produrre un file. Chiude dichiarando che il video e' stato prodotto con l'harness stesso.

Richiesta dell'utente (14/10/2026): «far capire al cliente che non e' esperto cosa puo' fare ed
esempi... video simulativo di qualcuno che scrive un prompt e poi ottiene il risultato... diverso
esempi e casi d'uso... facile da comprendere».

Assunzioni prese perche' l'utente non ha risposto entro il tempo: angolo «una giornata con
l'harness», 16:9, voce narrata in italiano, lavoro in autonomia con il piano (copione e storyboard)
presentato come anteprima.

Revisione del 14/10/2026 (chiesta dall'utente): il video cita per nome le funzioni della dashboard,
non solo le lascia intuire. E' nato il **frame 3 — «Cosa c'e' dentro»**, una tavola dove obiettivi,
pianificazioni, memoria, competenze, file e costo del turno si accendono uno alla volta mentre la voce
li nomina; la durata passa da 60 a 71 secondi.

## Assets

- `capture/extracted/*` — percorso **no-capture**: la dashboard vive sul server ed e' dietro login,
  quindi niente cattura da sito. L'interfaccia e' **ricostruita in HTML** (simulazione fedele, non
  uno screenshot) con la palette reale del prodotto (`#000000`, pannelli `#0f131a`, bordi `#2b3240`,
  testo `#eef2f9`/`#c6cfdd`, accento `#5b9dff`).
- Contenuti dei casi d'uso: presi da funzioni reali e verificate dell'harness (lettura di un PDF con
  estrazione del testo, navigazione di un sito con confronto dei dati, produzione e render di un
  video, conteggio dei costi per turno). Nessun dato personale, nessun contenuto di sessione.
- Voce fuori campo italiana generata **offline con piper** (`it_IT-serena-high`, la stessa voce del
  promo precedente, gia' sentita e approvata dall'utente) tramite `genera-voce.sh`.
- Musica: nessuna. Non c'e' un catalogo BGM offline su questa macchina e il video e' parlato.

## Customizations

- `prompt-type-submit-generate` — la shape portante: tre casi d'uso sono «guarda me che chiedo,
  guarda lui che risponde», con il prompt che si scrive a schermo carattere per carattere.
- `zoom-out-workspace-reveal` — il passaggio da «una casella di testo» a «una dashboard intera»,
  con un unico allontanamento di camera.
- `agent-progress-theater` — la lavorazione visibile (fasi che si accendono, barra di avanzamento)
  nel caso in cui l'agente produce il video.
- `titlecard-reveal` — la chiusura calma, con la riga che dichiara che il video e' stato fatto con
  l'harness.

## Notes

- Design spec: `frame.md` dal preset **blue-professional**, rimappato sulla palette del prodotto
  (accento blu `#5b9dff`).
- Solo font di sistema (`system-ui`, `ui-monospace`): nessun `@font-face`, nessuna risorsa di rete,
  nessuna risorsa esterna nel video.
- Lessico controllato: niente «token», «skill», «SSE», «self-hosted» detti al cliente; le stesse cose
  in lingua comune («costo della conversazione», «quello che ha imparato a fare», «sul tuo server»).
- Ogni caso d'uso dichiara il proprio prompt: chi guarda deve poter ripetere la stessa richiesta.
- Il video dichiara il limite reale: il confine di sicurezza e' la macchina su cui gira.
