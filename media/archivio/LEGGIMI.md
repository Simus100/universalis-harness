# Archivio degli script una-tantum

Qui stanno gli script che hanno già fatto il loro lavoro: modifiche applicate al codice nei mesi
scorsi (`apply-*`), prove isolate (`spike-*`, `probe-*`), script che hanno popolato i goal della
dashboard (`create-goal-*`, `build-goal`, `update-goal-*`).

**Non servono al funzionamento dell'harness**: niente in `dashboard.mjs`, in `dashboard.html`, nei
test del gate o nelle skill li importa o li esegue. Sono stati spostati il 2026-11-05, durante
l'audit, perché `media/` mescolava tre cose diverse — moduli vivi, test e residui — e 110 file
senza distinzione rendono difficile capire cosa si può toccare senza rischi.

Restano perché sono la traccia di *come* è stata fatta una modifica: se un giorno serve capire
perché una certa funzione esiste, il suo `apply-*.mjs` è spesso la spiegazione più diretta.

## Attenzione

- Gli episodi della memoria e alcune pagine di `docs/MANUALE.md` citano questi file con il **vecchio
  percorso** `media/<nome>.mjs`. Il contenuto è qui, il percorso è cambiato: è documentazione
  storica, non un collegamento da seguire alla lettera.
- Non sono nel gate: `npm test` non li esegue, e non si devono rieseguire alla cieca (alcuni
  riscrivono parti di `dashboard.mjs` o di `dashboard.html`, e quei file nel frattempo sono
  cambiati).
- Se uno di questi script serve di nuovo: si legge prima, si confronta con il codice attuale e si
  adatta. Non si lancia così com'è.
