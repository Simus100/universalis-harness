# Anti-pattern

I modi tipici in cui un processo AI-native si guasta. Ognuno è già costato tempo a qualcuno.

## Generali

- **Accelerare solo la scrittura del codice.** Se pianificazione, verifica e rilascio restano come
  prima, il collo di bottiglia si sposta e basta: si produce più codice da revisionare.
- **Gate tenuti a voce.** Una decisione non registrata, il mese dopo, non è mai avvenuta.
- **Fonti di verità divise.** Lo stesso fatto scritto in due posti: il secondo a essere aggiornato
  mente.
- **Regole che «devono valere sempre» affidate a una raccomandazione.** Se non c'è un controllo che
  si rompe, non vale sempre.
- **Review dell'agente fatta dall'agente che ha scritto il codice.** Condivide gli stessi punti
  ciechi: dà conferme, non verifiche.
- **Approvazioni umane nel mezzo del lavoro**, che obbligano a fermarsi a ogni passo: spostano
  l'attesa, non la riducono.
- **Artefatti gonfiati.** Un `plan.md` di tre pagine per un lavoro da un'ora è cerimonia: la
  dimensione dell'artefatto deve seguire il rischio, non il contrario.
- **Lavoro senza artefatto.** «Abbiamo discusso e ci siamo capiti» non è una fase conclusa.

## Per fase

| Fase | Anti-pattern |
|---|---|
| Intent | trattarlo come progetto; linguaggio formale imposto; chi approva riscrive la richiesta; nessun criterio di successo riconoscibile |
| Spec | scriverla al posto di chi ha chiesto il lavoro; rimandare i vincoli; criticità trattate come suggerimenti; criteri di successo non verificabili («funziona bene») |
| Piano | approvarlo vago; elencare file «indicativi»; saltare l'interrogatorio sui rischi; nessun percorso di ritorno se va male a metà |
| Build | accumulare modifiche non verificate; deviare dal piano senza aggiornarlo; toccare il test invece del codice |
| Verifica | prove sostituite da affermazioni; suite indebolite o saltate; verifiche lasciate a occhio; «l'ho guardato e mi sembra a posto» |
| Rilascio | pubblicare senza aver guardato il diff; credenziali o dati di terzi in un file versionato; usare `--forza` per aggirare il controllo; riavviare il servizio senza avvisare |
| Manutenzione | incidenti senza post-mortem; lezioni che non entrano in `LESSONS.md`; eval scritti mesi dopo; bande mai ritarate; stessa classe di errore due volte |

## Specifici di questo harness

- **Mettere dati personali in un file versionato.** Il repository è pubblico: il commit è
  irreversibile. È il modo più rapido per fare un danno vero.
- **Far entrare l'agente nella decisione che spetta all'utente** (pubblicare, riavviare, cancellare
  dati, decidere un costo): sono gate, non iniziative.
- **Memoria usata come riassunto** invece che come decisioni e perché: gli episodi senza decisione
  non risparmiano lavoro a nessuno.
- **Skill scritte per un altro ambiente** (riferimenti a comandi, file o servizi che qui non
  esistono): l'agente o li ignora, o — peggio — li simula. Prima di installare una skill esterna, si
  controlla che i comandi citati qui esistano.
- **Confondere la documentazione con i fatti**: `[skill]` e `[harness]` sono manuali, gli episodi sono
  cose successe.
