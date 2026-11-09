---
name: design-pack
description: "Pacchetto di mestiere per il design di interfacce e pagine web, raccolto dalle skill Impeccable, emilkowalski, jakubkrehel, genjutsu, GreenSock, CloudAI-X, blader e petergyang. Copre direzione visiva, revisione critica con punteggio, rifinitura di tipografia, spazi, colore, stati e dettagli, animazioni e micro-interazioni, gesture, mobile, scene 3D con Three.js, icone vere da libreria, e copy che non sappia di AI. Usa quando l'utente chiede di disegnare, rifare, rifinire, revisionare o far sembrare professionale una interfaccia, una landing, una dashboard, un componente o un'animazione, quando chiede «controlla che sia a posto prima di consegnare», quando serve un'icona, un effetto in movimento o una scena 3D, o quando un testo sa di generato. Non serve per guardare un'immagine o un PDF (immagini), documenti Word/Excel/PDF (documenti), video renderizzati (video, hyperframes), grafici e report di dati (report-dataviz) né schemi disegnati in chat (visual-representation)."
---

# Design pack

Questa è la porta. Il materiale sta in `references/`: circa 100 schede, quasi 20.000 righe di
mestiere scritto da persone che lo fanno di lavoro. **Non si legge in blocco.** Si apre la scheda
che serve al pezzo che si sta facendo, una o due, e si torna al codice.

La mappa completa, scheda per scheda, è [references/indice.md](references/indice.md). Apri quella
quando sai *cosa* ti serve ma non *dove* sta.

## La catena, in ordine

**1. Che cosa è questa superficie.** Prima di toccare pixel, una riga di risposta a tre domande
(se la risposta non c'è nella richiesta, la si ricava dal progetto o si chiede una volta sola):
chi la guarda, cosa deve succedere, in che condizione la guarda. Da qui discende il modo, e il modo
decide tutto il resto:

| Modo | Il visitatore | Esempi | Scheda |
|---|---|---|---|
| Persuade | decide e agisce | landing, marketing, prezzi, campagne | [mode-persuade](references/impeccable/mode-persuade.md) |
| Operate | completa un compito | app, dashboard, editor, impostazioni | [mode-operate](references/impeccable/mode-operate.md) |
| Read | capisce qualcosa | documentazione, articoli, guide | [mode-read](references/impeccable/mode-read.md) |
| Experience | è dentro l'opera | portfolio, galleria, showcase | [mode-persuade](references/impeccable/mode-persuade.md) |

Superficie nuova (o sostituzione del mondo visivo esistente): [new-work](references/impeccable/new-work.md).
Rifinitura di codice che esiste già: si va avanti su quello, senza rifare l'identità.

**2. Il pavimento di qualità.** Subito prima di scrivere o modificare UI, apri
[craft-floor](references/impeccable/craft-floor.md): contrasto, profondità, ritmo di spazi,
tipografia, stati, superfici del browser (selezione, caret, scrollbar, focus), copy. È l'unica
scheda che si legge **sempre**, anche per una modifica da tre righe.

**3. Costruire.** Qui si apre una scheda sola, quella del problema che hai davanti:
[layout](references/impeccable/layout.md) se è la spaziatura,
[typeset](references/impeccable/typeset.md) se è la tipografia,
[colorize](references/impeccable/colorize.md) se è il colore,
[emil/make-interfaces/guida.md](references/emil/make-interfaces/guida.md) se è il "non so cosa, ma
non sembra finito". Per il movimento:
[emil/animate.md](references/emil/animate.md) per costruirlo,
[genjutsu/motion-principles.md](references/genjutsu/motion-principles.md) per le fondamenta,
[gsap/*](references/gsap/gsap-core.md) solo se la pagina usa GSAP davvero. Per le icone:
[references/icone.md](references/icone.md) **sempre**, perché un'icona non si inventa.

**4. Guardare il risultato.** Il lavoro non è finito perché il codice gira: è finito perché l'hai
visto renderizzato, alle dimensioni in cui uscirà. Revisione secondo il caso:
[critique](references/impeccable/critique.md) per la UX con punteggio,
[audit](references/impeccable/audit.md) per accessibilità, performance, responsive,
[polish](references/impeccable/polish.md) per l'ultimo passaggio,
[break-ui](references/emil/break-ui.md) per romperla con i dati peggiori,
[review-animations](references/emil/review-animations.md) se c'è motion.

**5. Le parole.** Etichette, messaggi di errore, testi di marketing: se suonano da modello, si passa
da [copy-tell-italiani](references/copy-tell-italiani.md) (italiano) o
[copy/no-ai-slop.md](references/copy/no-ai-slop.md) (inglese).

## I divieti che non si negoziano

Sono la parte di questo pacchetto che vale anche quando tutto il resto non si apre.

- **Niente icone inventate.** Nessun SVG disegnato a memoria, nessuna emoji al posto di un'icona,
  nessun glifo Unicode (→ ✓ ✕). Si cerca in Iconify con `scripts/icone.sh` e si usa una libreria
  sola per tutto il progetto.
- **Niente dati inventati.** Numeri, nomi, loghi, testimonianze, statistiche, loghi di clienti: se
  non li ha dati l'utente, o sono chiaramente segnaposto etichettati come tali, non esistono.
  Riempire con dati finti è il difetto più grave di un'interfaccia generata.
- **Niente testo di riempimento spacciato per contenuto.** "Lorem ipsum" va bene come segnaposto
  dichiarato; la frase plausibile ma vuota no.
- **Niente decorazione al posto del contenuto**: gradient text, glassmorphism di default, strisce
  colorate ai bordi delle card, ombre dure, card dentro card, numero gigante con etichetta piccola
  come hero, occhiello sopra ogni titolo, emoji come sistema di icone.
- **Niente "non solo X, ma anche Y"** e le altre formule fisse elencate in
  [copy-tell-italiani](references/copy-tell-italiani.md).
- **Il brief vince sul gusto.** Se l'utente ha fissato estetica, palette, font o epoca, quelle
  restano anche se contraddicono una regola di gusto. Le regole servono dove l'asse è libero.
- **Rifinitura ≠ rifacimento.** Migliorare un'interfaccia esistente conserva identità, copy e
  comportamento; cambiare il mondo visivo è una decisione da dichiarare, non un effetto collaterale.

## Come si lavora

- **Verifica guardando, non immaginando**: apri la pagina, guardala alle dimensioni reali (mobile
  compreso), corregge in un colpo ciò che un solo sguardo mostra, poi guarda di nuovo. Non uno
  screenshot per ogni ritocco.
- **Consegna finita**: nessun "TODO", nessun controllo che appare rotto, stati hover/disabled/
  focus/loading/errore/vuoto presenti, contenuto vero, tastiera utilizzabile.
- **Una decisione, una riga**: quando scegli una direzione (modo, palette, famiglia tipografica,
  libreria di icone), scrivila. Nel progetto, se esiste un `DESIGN.md` o una nota di stile; altrimenti
  nel messaggio finale.
- **Dichiara i segnaposto**: ciò che l'utente deve fornire (foto, loghi, testi legali, dati reali)
  va elencato come tale, non simulato.

## Cosa qui non c'è (e come si aggira)

- **Il launcher di Impeccable** (`scripts/impeccable`, che scarica un eseguibile e carica
  `PRODUCT.md`/`DESIGN.md` con un comando) **non è incluso**: quando una scheda dice «esegui
  `impeccable context`», leggi direttamente `PRODUCT.md` e `DESIGN.md` se esistono nel progetto, e se
  non esistono chiedi il contesto all'utente invece di inventarlo. Vale lo stesso per gli hook, il
  comando `doctor`, `pin` e la modalità `live`.
- **`better-icons` non è installato**: [references/icone.md](references/icone.md) fa lo stesso con
  `curl` sull'API pubblica di Iconify.
- Le schede `genjutsu/*` presuppongono a volte un host con sotto-agenti: qui il lavoro lo fai tu, in
  sequenza.
- I testi importati sono in inglese e presuppongono il loro host (Claude Code, Cursor, Codex). Se
  una scheda inizia con «Initial Response — when this skill is first invoked…», quella parte non si
  applica: non c'è nessun comando con menu da mostrare.

## Prima di chiudere

- [ ] l'ho guardato renderizzato, alle dimensioni in cui uscirà
- [ ] hover, focus, disabled, loading, errore, vuoto: ci sono tutti
- [ ] icone da una libreria sola, nessuna emoji né glifo al posto di un'icona
- [ ] nessun dato, logo, testimonianza o numero inventato
- [ ] testi di interfaccia chiari, senza formule da modello
- [ ] contrasto ≥ 4,5:1 sul testo corrente, tastiera utilizzabile, `prefers-reduced-motion` rispettato

Le fonti, le licenze e ciò che è stato escluso: [references/attribuzione.md](references/attribuzione.md).
