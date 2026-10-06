# Le sei fasi, in pratica

Metodo completo per `intent`, `spec`, `piano`, `build`, `test`, `rilascio`. I gate (chi approva,
come si registra) stanno in `gate.md`; gli eval in `eval.md`.

## 1. Catturare l'idea in `intent.md`

**Cosa cambia.** Niente passaggi di consegne che distorcono la richiesta: l'idea si scrive subito,
con le parole di chi l'ha avuta, in un proto-progetto leggibile e usabile dalla fase successiva. Un
intent nasce da una persona, da un ticket, da un'anomalia di monitoraggio, da un finding di
sicurezza o da un incidente.

**Procedura.**

1. **Intervista.** Lascia descrivere il problema con parole proprie, poi chiedi solo quello che
   manca, una o due domande per volta:
   - chi non riesce a fare cosa oggi, e con quale effetto concreto;
   - come si presenta il successo: quale numero o quale comportamento cambia;
   - quali utenti, file, servizi, dati sono coinvolti;
   - quali vincoli esistono (tempo, privacy, compatibilità, costo di token, hardware);
   - cosa resta aperto.
2. **Scrivi** `intent/AAAA-MM-GG-<slug>/intent.md` con il modello `templates/intent.md`, `Stato:
   pronto`.
3. **Fai correggere** i tuoi fraintendimenti a chi ha chiesto il lavoro. Si corregge solo quello:
   l'intent non si riscrive in linguaggio formale.
4. **Committa.** In una cartella senza Git, crei comunque l'artefatto e dichiari che l'audit trail è
   incompleto.
5. **Gate 1.** Chi ha il ruolo di product owner accetta o respinge (§`gate.md`). Accettato →
   `Stato: accettato` + commit con `Approvato-da:`. Respinto → `Stato: respinto` con il motivo.

**Esempio (con questo harness).**

> **Intent: la dashboard deve dirmi quanto è costata la sessione**
> Autore: M. (utente) · Origine: persona
> **Problema:** vedo modello, token e costo solo della conversazione in corso; per capire quanto è
> costata una sessione di lavoro devo leggere i log a mano. Con l'uso giornaliero non ho più idea di
> dove va la spesa.
> **Esito proposto:** nella barra di stato compare il costo cumulato della sessione, con il totale
> del giorno visibile nella scheda.
> **Vincoli:** i dati arrivano dallo stream già esistente, nessuna nuova chiamata di rete.
> **Domande aperte:** serve anche un tetto giornaliero con avviso?

**Anti-pattern.**

- trattare l'intent come un documento di progetto (viene prima del progetto);
- pretendere linguaggio formale o riassunti «puliti» che perdono la richiesta;
- lasciare che il product owner *riscriva* l'intent invece di correggerne gli errori;
- tenere più «case» per gli intent: serve una sola fonte di verità.

**Metriche.** *Leading:* tempo dalla richiesta all'intent committato (ore, non settimane).
*Lagging:* tasso di intent accettati; quante volte l'intent va modificato dopo che esiste la spec
(dovrebbero essere poche).

## 2. Dall'intent alla `spec.md`

**Cosa cambia.** Requisiti e progetto si fanno in un'unica sessione, e i vincoli (accessibilità,
privacy, coerenza visiva, costo) si applicano **mentre** si scrive, non settimane dopo in review. I
conflitti fra vincoli si segnalano prima di costruire.

**Quando la spec serve davvero.** Non sempre: se il cambiamento è di una riga, la spec è il piano
stesso. Serve quando c'è almeno una di queste condizioni:

- più di un file o più di un componente coinvolto;
- interfacce condivise (API, schema dei dati, formato di un file letto da più parti);
- dati personali, credenziali, o qualsiasi cosa tocchi il confine del repository pubblico;
- un comportamento che l'utente dovrà poter riconoscere come «fatto» (interfaccia, messaggio, numero);
- un dubbio su *cosa* va costruito, non solo su come.

**Procedura.**

1. Leggi l'intent accettato, il codice pertinente, `README.md` e le skill che riguardano l'area
   (per l'interfaccia: `design-craft`; per un grafico: `report-dataviz`).
2. Scrivi `spec.md` accanto all'intent con `templates/spec.md`, `Stato: bozza`: requisiti funzionali
   e non funzionali numerati, progetto, **criticità segnalate**, domande aperte, componenti
   coinvolti e criteri di successo verificabili.
3. **Le criticità bloccano, non sono suggerimenti.** Ognuna va risolta o accettata esplicitamente,
   con il motivo scritto.
4. **Review di chi ha chiesto il lavoro.** Prima le criticità, poi il confronto con l'intent: il
   problema viene risolto? Le domande aperte hanno risposta?
5. **Gate 2:** approvata → `Stato: approvata` e commit con trailer. Registra nel commit quali
   vincoli erano in vigore (versione delle skill, se rilevante): è la prova di cosa è stato applicato.

**I criteri di successo sono la parte che rende utile il resto.** Devono essere verificabili, non
impressioni:

```markdown
## Criteri di successo (verificabili)
- [ ] `bash media/test-all.sh` esce con codice 0 e conta 6 suite
- [ ] la barra mostra il costo cumulato e si aggiorna a ogni turno
- [ ] con la sessione vuota la barra non mostra `NaN` né `€0.0000`
```

**Anti-pattern.**

- scrivere la spec *per* l'utente invece di farla revisionare;
- rimandare i vincoli a dopo;
- nascondere le criticità nel corpo del testo invece di elencarle;
- cambiare una skill di policy a metà lavoro senza rigenerare la spec.

**Metriche.** *Leading:* tempo fra intent e spec; quota di spec approvate al primo passaggio;
criticità emerse per spec (se sono zero, la spec non è stata letta con attenzione).
*Lagging:* commit su `spec.md` dopo l'inizio dell'implementazione (rework dei requisiti).

## 3. Il piano prima del codice

**Cosa cambia.** Prima il piano, poi il codice: la revisione avviene quando correggere costa un
documento, non una riscrittura. Durante il piano **non si modificano file**: se non hai una modalità
di sola pianificazione, dichiaralo esplicitamente e non toccare nulla finché il piano non è approvato.

**Procedura.**

1. Leggi `intent.md`, `spec.md`, `README.md` e il codice coinvolto.
2. Scrivi `plan.md` con `templates/plan.md`: **file che cambiano** (elenco esatto), ordine di
   lavoro con le dipendenze, rischi con la mitigazione, **Prova** (comando e risultato atteso),
   alternative considerate e perché sono state scartate.
3. **Interrogatorio**, prima di presentarlo. Rispondi da solo, poi invita a farne altre:
   - cosa può rompere questa modifica?
   - qual è il passo più rischioso?
   - quali alternative esistono, e perché le ho scartate?
   - cosa succede se va male a metà, e come torno indietro?
4. **Criterio di qualità:** una persona che non ha visto la conversazione deve poter eseguire il
   lavoro dal solo piano. Se serve una spiegazione a voce, il piano è incompleto.
5. **Gate 3.** Le modifiche di routine le approva chi ha chiesto il lavoro; quelle ad alto rischio
   richiedono un secondo parere in contesto pulito (§ criteri sotto). Approvato → `Stato: approvato`
   + commit con trailer.
6. Se l'implementazione devia dal piano, il piano si aggiorna **nello stesso commit**; se cambia il
   perimetro o il rischio, si torna al gate.

**Criteri di rischio alto** (servono per decidere chi approva; il playbook li lascia aperti, questi
sono i nostri, adattati a questo repository):

- dati personali, credenziali, o qualunque cosa possa finire in un commit pubblico;
- file elencati come riservati (`.gitignore`, `sessions/`, `backups/`, `.env*`): modificarne la
  gestione o il filtro di pubblicazione;
- migrazioni o riscritture di dati, formati di file che altre parti leggono;
- autenticazione, sessioni, token, esposizione di rete (dashboard, Caddy, porte);
- riavvio o interruzione del servizio in uso, deploy, rollback;
- memoria a lungo termine, indici e grafi: un errore qui degrada il lavoro di tutte le sessioni;
- più di ~10 file o più sottosistemi (dashboard, media, skills, scripts) in un colpo;
- area senza test: se non esiste una suite che copre la zona, la modifica è «alta» per definizione.

**Esempio di piano, ridotto all'osso.**

```markdown
# Piano: costo cumulato di sessione nella barra
Intent: intent/2026-10-06-costo-sessione/intent.md @ a1b2c3d
Spec:  intent/2026-10-06-costo-sessione/spec.md @ a1b2c3d
Stato: bozza · Rischio: routine

## File che cambiano
- dashboard.mjs            (accumulo del costo per sessione)
- dashboard.html           (elemento nella barra di stato)
- media/test-api.sh        (un caso sul cumulo)

## Ordine di lavoro
1. campo cumulato nella sessione (dipende da: —)
2. innesto nella barra (dipende da: 1)
3. test del cumulo (dipende da: 2)

## Rischi
| Rischio | Gravità | Mitigazione |
|---|---|---|
| doppio conteggio al resume | media | si conta per id di turno, non per evento |

## Prova
- Comando: `bash media/test-all.sh` — atteso: tutte le suite verdi, incluso il caso nuovo
- Criteri coperti: «si aggiorna a ogni turno» → test-api.sh; «sessione vuota» → caso a parte

## Alternative considerate
- ricalcolare dal log a ogni richiesta — scartata: legge un file a ogni turno
```

**Anti-pattern.** Approvare un piano vago («sistemiamo la barra»); approvare a voce senza registrare;
elencare i file «indicativi»; saltare il piano perché «tanto è poco» su un lavoro che poi tocca otto
file.

**Metriche.** *Leading:* quota di lavori che si chiudono al primo passaggio; tempo fra approvazione
e pubblicazione. *Lagging:* giri di rework; quanto il diff pubblicato corrisponde al piano.

## 4. Implementazione

- Si lavora nell'ordine del piano, un commit logico per passo, con messaggi leggibili (`feat|fix|docs
  (<slug>): ...`).
- Dopo ogni passo, il feedback loop (`eval.md`): non si accumulano modifiche non verificate.
- Se emerge qualcosa che il piano non prevedeva: fermarsi, aggiornare il piano, e se cambia il
  perimetro tornare al gate.
- **Autonomia.** Si può lavorare senza conferma passo per passo solo quando il feedback loop è
  solido (`media/test-all.sh` passa, la zona è coperta da test). La revisione passa allora dal
  guardare le azioni al validare gli artefatti a fine lavoro.
- **Regola del due:** due volte lo stesso errore → la correzione entra in `README.md` o in una skill.

## 5. Verifica

Il metodo completo (feedback loop, protocollo dei bug, eval) è in `eval.md`. In breve: la sessione
verifica il proprio lavoro **prima** che una persona lo veda, con un comando unico, e le prove sono
output reali allegati — non affermazioni.

## 6. Rilascio

Si pubblica o si riavvia **solo dietro gate esplicito** (`gate.md`): prove allegate, controllo del
diff per dati riservati, richiesta esplicita dell'utente, registrazione della decisione.
