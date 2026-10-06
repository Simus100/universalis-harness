# Manutenzione: chiudere il ciclo

Il difetto più comune di un processo come questo è che impara solo dagli errori che qualcuno si
ricorda. Qui la manutenzione serve a far rientrare i problemi come **nuovi intent**, e a trasformare
ogni incidente in una prova permanente.

## 1. Bande di controllo

Una metrica con una baseline mobile, e livelli di reazione crescenti. Il rilevatore è
**deterministico, senza modello**: la stessa serie di numeri produce sempre lo stesso livello, e
questo va tenuto separato dal giudizio (che invece è dell'agente).

`scripts/detect.py` legge da stdin una serie `timestamp,valore` in ordine cronologico e restituisce
`{livello, z, regole, media, dev_std, ultimo}`:

| Livello | Significato | Reazione |
|---|---|---|
| 0 | normale | nulla |
| 1 | oltre 1σ | log, nessuna azione |
| 2 | oltre 2σ o deriva (regole di Western Electric) | diagnosi in sola lettura |
| 3 | oltre 3σ | diagnosi + proposta, tramite un percorso già approvato |

Le regole minime di Western Electric, usate per cogliere anche le derive lente (non solo i picchi):
un punto oltre 3σ; due punti su tre oltre 2σ dallo stesso lato; quattro su cinque oltre 1σ; otto
punti consecutivi dallo stesso lato della media.

**Metriche candidate in questo harness** (una per volta, non tutte insieme):

- durata o costo per sessione/giorno (deriva = qualcosa è cambiato sotto);
- esito di `media/test-all.sh` nel tempo (un guasto ricorrente è una suite fragile, non sfortuna);
- tempo fra apertura e chiusura di un goal;
- quota di sessioni che finiscono senza decisione registrata in memoria.

**Il rilevatore non ripara**: sopra 2σ scrive una **diagnosi** e la propone come `intent.md` con
`Origine: monitoraggio`, contenente l'anomalia con le evidenze, l'esito proposto e le domande aperte.
Il triage umano decide: correggere subito, pianificare, o scartare. Gli scarti servono a ritarare le
bande.

Senza una serie storica, le bande non si possono calcolare: finché i dati non ci sono, questo play è
❌, e va dichiarato come tale invece di simulare un monitoraggio.

## 2. Incidenti

Un incidente è qualcosa che si è rotto in uso reale: la dashboard che non risponde, uno stream
interrotto, un riavvio andato male, un dato pubblicato per sbaglio, un lavoro perso per contesto
esploso.

**Procedura.**

1. **Fermare l'emorragia** con il percorso più provato che esiste (riavvio, ripristino, revert).
   Il runbook va scritto *prima*, non improvvisato durante.
2. **Registrare** mentre accade: sintomo osservato, comandi eseguiti, output, ipotesi scartate.
   Se lo si ricostruisce il giorno dopo, metà delle informazioni è persa.
3. **Diagnosi**: causa probabile e, soprattutto, **quale segnale l'avrebbe anticipata**.
4. **Decisione**: correzione piccola → fix; problema di prodotto → `intent.md` (fase 1).
5. **Post-mortem breve** in `LESSONS.md` (modello in `templates/LESSONS.md`), senza colpevoli: cosa
   è successo, cosa lo avrebbe anticipato, cosa è cambiato dopo.
6. **Dalla lezione alla prova**: se l'incidente è verificabile a macchina, diventa un test o un caso
   di eval (`eval.md`). Una lezione che resta solo scritta si ripete.

`LESSONS.md` è versionato e **si legge prima di ogni indagine**: è il modo più economico per non
ripetere una diagnosi già fatta.

## 3. Scansioni periodiche

Ogni tanto, un giro di lettura critica su ciò che è già in produzione, in un contesto diverso da
quello che ha scritto il codice:

- **segreti e dati riservati**: che nulla di personale sia finito in un file versionato, compreso
  nella storia (un dato pubblicato resta pubblico anche dopo un revert);
- **superficie esposta**: autenticazione, file serviti, header, endpoint che non dovrebbero essere
  raggiungibili;
- **dipendenze** ferme e configurazioni di default rimaste tali;
- **coerenza fra documentato e reale**: il `README` e `docs/` descrivono ciò che il codice fa
  davvero? Le istruzioni sbagliate sono un difetto, non una svista.

Un finding circoscritto si corregge e passa dal gate di pubblicazione; un finding ampio o ripetuto
diventa un `intent.md` con `Origine: sicurezza` e riparte dalla fase 1. A fix rilasciato, si aggiunge
la verifica che intercetta quella classe di problema.

## 4. Il ciclo si chiude

L'anomalia e l'incidente rientrano come intent, e l'intent ripercorre le sei fasi. Il segno che il
ciclo funziona non è «nessun incidente», è: **lo stesso incidente non succede due volte**, e la
seconda volta che una cosa va storta c'è già una prova che la intercetta.
