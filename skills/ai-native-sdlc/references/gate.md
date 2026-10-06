# Gate: dove la decisione smette di essere dell'agente

Un **gate** è una decisione che non può essere presa dall'agente: si ferma, espone l'artefatto e
chiede. Nel profilo *solo* il gate è sempre la stessa persona, quindi non c'è separazione dei compiti
reale: si sostituisce con quattro cose — pausa esplicita, rilettura in contesto pulito, prove
allegate, decisione registrata.

## 1. I cinque gate

| # | Gate | Cosa si decide | Cosa guarda chi approva |
|---|---|---|---|
| 1 | **Intent** | accetto o respingo la richiesta | il problema è quello vero? l'esito proposto è riconoscibile? |
| 2 | **Spec** | approvo il progetto | le criticità sono risolte; i criteri di successo sono verificabili |
| 3 | **Piano** | approvo il piano | i file elencati, i rischi, la prova; e per il rischio alto: secondo parere |
| 4 | **Verifica** | il lavoro è fatto | output di `media/test-all.sh`, screenshot, prove; il diff corrisponde al piano |
| 5 | **Pubblicazione** | si pubblica / si riavvia il servizio | prove allegate, nessun dato riservato, richiesta esplicita |

**Cosa non è un gate:** chiedere il permesso di procedere. Un gate porta sempre una decisione su un
artefatto, con tre esiti possibili: accetto, respingo (con il motivo), correggi così. Non si usa il
tool `ask_user` per farsi approvare il lavoro: le regole di questo harness lo riservano alle
richieste in cui manca un'informazione che cambia l'esito. Il gate è un'altra cosa: è un fermarsi e
un decidere, e si comunica in chat.

**Alla fine di un gate:**

- `Stato:` nell'artefatto aggiornato (`accettato`, `approvata`, `approvato`);
- la decisione nel commit: trailer `Approvato-da: <Nome> (ruolo)`;
- se qualcosa è stato respinto, il motivo scritto — serve più dei consensi;
- la decisione nella memoria (`memoria_episodio`), se cambia il modo di lavorare.

Qui i commit arrivano spesso da `bash scripts/sync-fine-lavoro.sh "messaggio"`: quando un lavoro
chiude un gate, **il trailer va nel messaggio che gli passi**.

## 2. Da gate umano a controllo automatico

Un gate ripetitivo va trasformato in un controllo che non dipende dalla buona volontà. Qui i
controlli automatici disponibili sono pochi e vanno conosciuti per quello che coprono davvero.

| Controllo | Cosa garantisce | Cosa **non** copre |
|---|---|---|
| `scripts/sync-fine-lavoro.sh` | aborta la pubblicazione se nell'elenco compare un file riservato (`.env`, segreti, `sessions/`, `backups/`, documenti con dati di terzi) e verifica che locale e remoto coincidano | non guarda il *contenuto* di un file legittimo: un dato personale dentro un `.md` versionato passa |
| `media/test-all.sh` | il comportamento coperto dalle suite non regredisce | ciò che nessuna suite tocca |
| `.gitignore` | i file riservati non entrano in Git | un file già tracciato in precedenza resta nella storia |
| il repository è pubblico | ogni pubblicazione è irreversibile | niente: questo è il vincolo da tenere in testa **prima** di scrivere |

**Conseguenza operativa:** qui il rischio «dato personale o segreto» non è un caso di scuola, è il
rischio principale. Un file nuovo va classificato prima di essere creato (*pubblicabile* /
*riservato*), e in dubbio si chiede. La regola è la stessa della skill: in dubbio, chiedi prima di
scrivere.

Dove aggiungere un controllo nuovo, in ordine di preferenza:

1. un test in una delle suite di `media/` (se è verificabile a macchina);
2. un controllo in `scripts/sync-fine-lavoro.sh` (se riguarda la pubblicazione);
3. una riga in `.gitignore` col motivo (se è un file da non versionare);
4. una skill (solo se non è verificabile a macchina: allora è conoscenza, non garanzia).

## 3. Gate di pubblicazione: la procedura

1. `bash media/test-all.sh` — verde, con l'output allegato.
2. `git status` e `git diff --stat`: il diff corrisponde all'elenco dei file del piano? Se no, il
   piano si aggiorna o si spiega la deviazione.
3. Classificazione dei file nuovi: pubblicabile o riservato. I riservati vanno in `.gitignore` con
   una riga di motivo.
4. Richiesta esplicita di pubblicazione (è il gate 5).
5. `bash scripts/sync-fine-lavoro.sh "messaggio"` → pubblica e verifica che locale e remoto
   coincidano. **Non aggirarlo con `--forza`**: se un file è legittimo, la strada è `.gitignore`.
6. Se il servizio va riavviato, il riavvio è un'azione a sé: si annuncia l'interruzione e si
   verifica il ritorno con `media/post-restart-check.sh`.

## 4. Pubblicazione e riavvio: perché un gate a parte

Un riavvio interrompe il lavoro in corso (comprese le sessioni in streaming): è un effetto visibile
all'utente e non reversibile «silenziosamente». Stessa cosa la pubblicazione su un repository
pubblico: il commit è leggibile da chiunque e resta nella storia. Entrambe richiedono una richiesta
esplicita, non un'iniziativa.

## 5. `audit`: maturità del processo

Per ogni play: ✅ presente, ◐ parziale, ❌ assente. La colonna destra riporta lo stato rilevato al
momento dell'installazione (6 ottobre 2026) — **va rimisurato**, noncitato come se fosse attuale.

| Play | Evidenza da cercare | al 2026-10-06 |
|---|---|---|
| Cattura dell'intent | `intent/*/intent.md` con `Stato:` e gate nella storia di Git | ❌ |
| Requisiti e progetto | `spec.md` accanto agli intent, criticità elencate | ❌ |
| Piano prima del codice | `plan.md` approvato prima dei commit di codice | ◐ (piano in chat, non versionato) |
| Conoscenza operativa | `README.md`/`docs/` con comandi, verifica, trappole; tenuti corti | ◐ |
| Skill | `skills/*/SKILL.md` con owner e frontmatter valido | ✅ (8 skill) |
| Feedback loop | comando unico di verifica + definizione di fatto | ✅ (`media/test-all.sh`) |
| Guardrail deterministici | controlli che bloccano davvero, non solo raccomandazioni | ◐ (solo a fine lavoro) |
| Eval | `evals/` con almeno 5 casi e una soglia | ❌ |
| Rilettura indipendente | qualcuno che guarda il risultato con occhi nuovi | ◐ (l'utente) |
| Gate di approvazione registrati | trailer `Approvato-da:`, decisioni in memoria | ◐ |
| Rilascio | pubblicazione e riavvio dietro gate, rollback provato | ◐ (rollback esiste, gate informale) |
| Manutenzione | bande di controllo, incidenti che diventano eval | ◐ (memoria episodi, non eval) |
| Chiusura del ciclo | anomalia → nuovo `intent.md` | ❌ |

**Ordine di adozione** (dipende dalle fondamenta, non si salta):

1. cattura dell'intent, conoscenza operativa, skill, feedback loop, piano prima del codice;
2. guardrail deterministici e rilettura indipendente;
3. eval continui;
4. rilascio automatizzato dietro gate;
5. bande di controllo e chiusura del ciclo.

**Un solo prossimo passo per volta.** Dire «manca tutto» è inutile: si sceglie la voce più a monte
fra quelle assenti, si fa quella, si rimisura.

*Nota:* questo `audit` è il controllo di maturità **del processo**. Non va confuso con
`media/audit.mjs`, che è il controllo di coerenza del codice e dei contenuti dell'harness.
