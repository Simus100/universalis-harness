# Sicurezza dei controlli (non dell'applicazione)

Questo documento riguarda i **controlli** che impediscono a un dato riservato di finire dove non
deve, e i limiti che quei controlli hanno. La sicurezza dell'applicazione (login, CSRF, perimetro
dei file, sanitizzazione) è nella tabella del `README.md`.

## Due domande diverse, due script

| Domanda | Strumento | Guarda |
|---|---|---|
| «che cosa sto per pubblicare **adesso**?» | `scripts/sync-fine-lavoro.sh` | `git status --porcelain -uall`: anche i file mai committati |
| «che cosa è **già** nella storia?» e «com'è messa la macchina?» | `scripts/preflight-sicurezza.sh` | `git ls-files`, `.gitignore`, permessi, contenuto dei file versionati |

Servono tutte e due: un segreto committato ieri non compare più in `git status`, ma è nel
repository e chi clona lo prende.

```bash
bash scripts/preflight-sicurezza.sh          # esito 0 = nessun problema, 1 = problemi
bash scripts/test-gate-sicurezza.sh          # collauda i due controlli, 9 casi, nessun effetto reale
```

Il collaudo costruisce un repository di prova con lo **stato di lavoro attuale** (versionati +
modifiche non committate, senza cartelle ignorate) in una cartella temporanea e lancia i controlli
veri su quella radice (`PI_HARNESS_ROOT`). Non committa né pubblica nulla nel repository reale.

## Tre regole che valgono più dei pattern

1. **Un solo posto per le regole.** I percorsi riservati stanno in `scripts/riservati.pattern`, i
   segreti riconoscibili in `scripts/segreti.pattern`. Li leggono entrambi gli script. Due copie
   divergono sempre, e quella che resta indietro è quella che credi attiva.
2. **Fail-closed.** Se l'elenco dei riservati manca o è vuoto, `sync-fine-lavoro.sh` esce con 3 e
   non pubblica. Un controllo che, non riuscendo a leggere le proprie regole, concludesse «nessun
   file riservato» direbbe di sì senza aver guardato.
3. **Un controllo che non si è mai visto scattare non è un controllo.** `test-gate-sicurezza.sh`
   include il *test del test*: toglie `-uall` a una copia del gate e pretende che il caso poi
   **non** scatti, dimostrando che il caso passa grazie a `-uall` e non per caso.

## Cosa un esito verde NON dice

Un preflight superato significa «non è comparso nessuno dei pattern noti», **non** «non ci sono
segreti». Una password, una stringa di connessione, un IBAN non hanno un prefisso riconoscibile e
passano. Il controllo toglie la distrazione; il giudizio resta a chi pubblica.

Per lo stesso motivo i pattern non cercano le parole `password`, `token`, `secret`: compaiono in
`.gitignore`, nei nomi dei file e nei commenti (il `.gitignore` di questa istanza contiene
letteralmente `*password*`), e un gate che grida al lupo si aggira e poi non lo guarda più nessuno.
Si cercano solo forme con un prefisso riconoscibile (`EAA…`, `sk-…`, `ghp_…`, `AKIA…`).

Il confine a sinistra `(^|[^A-Za-z0-9])` in quei pattern non è pedanteria: il primo giorno di vita
di `segreti.pattern`, senza confine, il pattern Meta ha prodotto quattro falsi positivi dentro i
font woff2 incorporati in base64 (`data:font/woff2;base64,d09GMgABAAAAA…`).

## Perimetro: i file che governano la sicurezza non si modificano da soli

`sync-fine-lavoro.sh`, `preflight-sicurezza.sh`, `test-gate-sicurezza.sh`, i due `.pattern`,
`.gitignore` e `skills/social-*` **non sono oggetto di modifica autonoma da parte dell'agente**:
si cambiano con una richiesta esplicita della persona. Il motivo non è la sfiducia, è il gradiente:
in un ciclo che ottimizza «portare a termine il compito», la via più corta per arrivare alla fine
è indebolire il controllo che costa. Una regola che si può riscrivere da sola prima o poi lo fa.

## Segreti già in chiaro: cosa si fa

Mascherarli non basta, e il mascheramento non è una rotazione:

1. il valore va **ruotato** dal servizio che lo ha emesso (un token mascherato in un file è ancora
   un token valido per chi lo ha già letto, copiato o messo in un backup);
2. se è in un commit, va tolto dal tracciamento (`git rm --cached`) e la storia va riscritta;
3. `scripts/memoria-rimuovi-segreti.sh --applica` ripulisce la memoria a lungo termine, gli episodi
   e l'indice — ma è una pulizia, non una revoca.
