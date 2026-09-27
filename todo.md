# Piano — spiegare l'eclissi di Sole con uno schema SVG

Richiesta: «Spiegami un'eclissi di Sole con uno schema SVG etichettato in italiano, indicando che
dimensioni e distanze non sono in scala.»

- [x] Controllo dello stato del sistema (servizio `pi-dashboard` attivo, nuova rotta
      `/svg-sanitize.mjs`, skill `visual-representation` caricata)
- [x] Testo divulgativo: cosa succede, umbra e penombra, perché non a ogni novilunio,
      perché la Luna copre il Sole, eclissi anulare, durata e moto dell'ombra, sicurezza
- [x] Schema SVG: Sole–Luna–Terra allineati, coni d'ombra e di penombra, fascia di totalità,
      etichette brevi in italiano, `viewBox`, `<title>` e `<desc>`
- [x] Dichiarazione di non-scala (`<desc>` + nota visibile nel disegno)
- [x] Verifica visiva: reso nel browser headless e controllato a video (proporzioni, etichette
      dentro i margini, nessuna sovrapposizione)
- [x] Verifica di conformità: `sanitizeSvg` accetta il documento senza avvisi
      (nessuno script, nessuno stile, solo forme/testo/gradienti/clip)
- [x] Risposta in chat: spiegazione + blocco `svg` (anteprima grafica automatica)
