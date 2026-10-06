---
name: ai-native-sdlc
description: "Conduce un cambiamento dalla richiesta alla pubblicazione con artefatti versionati e gate espliciti: intent, spec, piano approvato, implementazione con prove, eval, rilascio dietro gate, monitoraggio che rientra come nuovo intent. Usala quando un lavoro è abbastanza grande da meritare un piano scritto e approvato prima del codice, quando serve decidere a che punto è un cambiamento e cosa manca, quando si progetta una suite di eval o si misura la maturità del processo. Per una richiesta piccola o una domanda basta l'assistenza normale."
---

# AI-Native SDLC

Adattamento per questo harness del *AI-Native SDLC Playbook* di Anthropic (vedi `README.md` per
cosa è stato tolto e perché). L'idea di fondo: **la scrittura del codice non è più il collo di
bottiglia**; lo sono pianificazione, revisione, test e rilascio, che vanno ridisegnati.

## 0. I tre principi che contano

1. **Ogni fase finisce con un artefatto committato che la fase successiva legge.** Si passa da una
   fase all'altra per file in Git, non per riassunti in chat: se l'artefatto non esiste, la fase
   non è finita.
2. **La catena dei commit è l'audit trail.** Il messaggio del commit dice chi ha chiesto cosa, cosa
   è stato prodotto e chi l'ha approvato (trailer `Approvato-da:`).
3. **Le persone restano responsabili.** L'agente esegue dentro i guardrail; non approva mai il
   proprio lavoro, non pubblica da solo, non chiude un gate che spetta a una persona.

E la distinzione che decide dove far finire una regola:

| Dove | Cosa ci va | Che garanzia dà |
|---|---|---|
| `README.md`, `docs/` | conoscenza del repo: comandi, convenzioni, trappole | nessuna: è letto, non imposto |
| `skills/*/SKILL.md` | policy e metodo da applicare con coerenza | **consultiva**: rende probabile il rispetto |
| script, test, `.gitignore` | ciò che deve valere **sempre** | **deterministica**: lo garantisce, o si rompe |

## 1. Quando usarla

- un cambiamento non banale dell'harness o di un prodotto gestito da qui (più file, dati, sicurezza,
  interfaccia): merita intent, piano approvato e prove;
- ti chiedono «a che punto siamo?» su un lavoro aperto → comando `stato`;
- devi creare o rivedere una suite di eval, o decidere se un cambiamento di skill/prompt ha
  regredito qualcosa → `eval`;
- devi misurare quanto il processo è maturo e qual è il prossimo passo → `audit`.

**Non usarla** per: una domanda, una lettura di file, una modifica banale (typo, rinomina locale,
un testo in chat), l'esplorazione libera. In quei casi l'intento è già chiaro e il piano è una riga.

## 2. Comandi

| Comando | Quando | Dove sta il metodo |
|---|---|---|
| `avvia` | repository o cartella non ancora predisposta | §5 + `references/fasi.md` |
| `intent` | nasce una richiesta non banale | `references/fasi.md` §1 |
| `spec` | c'è un intent accettato, manca il progetto | `references/fasi.md` §2 |
| `piano` | c'è una spec approvata, manca il piano | `references/fasi.md` §3 |
| `build` | c'è un piano approvato | `references/fasi.md` §3–4 |
| `test` | implementazione da verificare, eval da creare | `references/eval.md` |
| `rilascio` | il lavoro è pronto, si pubblica o si riavvia il servizio | `references/gate.md` |
| `manutenzione` | anomalia, incidente, scansione | `references/manutenzione.md` |
| `stato` | «a che punto siamo?» | §3 |
| `audit` | maturità del processo | §6 |
| `metriche` | latenze fra artefatti, rework, pass rate | `references/metriche.md` |

### 2.1 Trovare il comando e lo stato da soli

Se l'utente non nomina il comando, ricavalo dallo stato del repository:

| Nel repository trovi | Comando | Prossima azione |
|---|---|---|
| nulla di tutto questo | `intent` (o `avvia` se manca l'ossatura) | intervistare chi chiede, scrivere `intent.md` |
| `intent/<id>/intent.md` in `bozza`/`pronto` | **gate 1** | fermarsi e chiedere l'accettazione |
| intent accettato, nessuna `spec.md` | `spec` | scrivere la spec e le criticità |
| `spec.md` in `bozza`/`in revisione` | **gate 2** | risolvere le criticità, poi chiedere l'approvazione |
| spec approvata, nessun `plan.md` | `piano` | scrivere il piano, senza toccare il codice |
| `plan.md` approvato, lavoro in corso | `build` | implementare nell'ordine del piano, col feedback loop |
| lavoro completato, non pubblicato | `rilascio` | prove, poi gate di pubblicazione |
| pubblicato | `manutenzione` | bande, incidenti, eval |

Riporta lo stato come tabella (cambiamento, fase, prossima azione, chi deve agire) e **proponi una
sola** azione successiva.

## 3. Regole ferree

- **Mai saltare un gate.** A fine fase ti fermi, chiedi l'approvazione in chat alla persona giusta e
  registri la decisione nell'artefatto e nel commit. Non «chiedere il permesso di procedere»: il
  gate è una decisione su un artefatto (accetto / respingo / correggi così).
- **Mai auto-approvarsi.** Non scrivi `Stato: accettato` o `Approvato-da:` senza una conferma umana
  esplicita in questa conversazione.
- **Mai implementare senza un piano approvato**, tranne le modifiche banali, dichiarate come tali.
- **Mai toccare un test per far passare un fix**: si corregge il codice. Se il test è sbagliato lo
  dici, non lo aggiusti di nascosto.
- **Sempre prove, mai affermazioni.** Prima di dichiarare finito qualcosa, incolli l'output reale:
  `bash media/test-all.sh`, il log, il diff, lo screenshot.
- **Il repository è pubblico.** Nessun dato personale, credenziale, estratto di documento o
  informazione di terzi entra in un file versionato — nemmeno in un artefatto di questa skill.
  In dubbio, chiedi prima di scrivere, non dopo.
- **Il `plan.md` segue il codice**: se l'implementazione devia dal piano, aggiorni il piano nello
  stesso commit, e se cambia il perimetro torni al gate.
- **Regola del due**: se sbagli due volte la stessa cosa, la correzione entra nel `README.md` o in
  una skill, non solo nella risposta.
- **La decisione va in memoria**: a fine lavoro, `memoria_episodio` con decisione, perché ed esito.
- Gli artefatti si scrivono in italiano, con le parole di chi ha chiesto il lavoro.

## 4. Profilo: solo

Il playbook distingue tre profili (solo, team, enterprise). Qui il profilo è **solo**, e non va
chiesto: cambia solo *chi* copre i ruoli, mai gli artefatti né i gate.

| Ruolo | Chi è qui |
|---|---|
| Originatore (scrive l'intent) | l'utente |
| Product owner (gate su intent e spec) | l'utente |
| Tech lead (piani ad alto rischio) | l'utente, con un secondo parere dell'agente in contesto pulito |
| Code owner (approva il lavoro) | l'utente |
| Release manager (gate di pubblicazione) | l'utente: il lavoro si pubblica solo su sua richiesta esplicita |

La separazione dei compiti non si può avere davvero, quindi si sostituisce con quattro cose: una
pausa esplicita a ogni gate, una rilettura in contesto pulito (sessione nuova, mai quella che ha
scritto il codice), le prove allegate, il trailer `Approvato-da:` nel commit.

## 5. Struttura, quando serve

Si crea solo ciò che si usa: all'inizio bastano `intent/` e il piano nel messaggio. La struttura
completa:

```
intent/
  AAAA-MM-GG-<slug>/
    intent.md          # fase 1
    spec.md            # fase 2, solo se il lavoro non è banale
    plan.md            # fase 3
    prove.md           # output di test, log, screenshot (facoltativo)
evals/
  cases/*.json         # casi di eval: prompt + verifiche
  run.sh  check.sh     # esecuzione e soglia
LESSONS.md             # lezioni dei post-mortem, lette prima di ogni indagine
```

Nell'harness i «ruoli» hanno un posto preciso: `skills/` è il controllo consultivo,
`media/test-all.sh` è il feedback loop deterministico, `scripts/sync-fine-lavoro.sh` è il gate di
pubblicazione, `media/goals.json` è dove il piano può diventare un goal con i suoi passi, la
memoria è dove finiscono le decisioni. Dettagli in `references/gate.md`.

## 6. `audit`: a che punto è il processo

Per ogni play: ✅ presente, ◐ parziale, ❌ assente. Poi **un solo** prossimo passo, rispettando le
dipendenze (prima le fondamenta: intent, `README` operativo, skill, feedback loop, piano; poi eval,
review, automazione del rilascio, monitoraggio). La tabella con le evidenze da cercare sta in
`references/gate.md` §5.

## 7. File di questa skill

| File | Contenuto |
|---|---|
| `references/fasi.md` | le sei fasi: procedure, criteri di rischio, anti-pattern |
| `references/eval.md` | feedback loop, protocollo dei bug, suite di eval |
| `references/gate.md` | gate umani, controlli deterministici, pubblicazione, audit |
| `references/manutenzione.md` | bande di controllo, incidenti, lezioni |
| `references/metriche.md` | leading e lagging, cosa si può misurare qui |
| `references/anti-pattern.md` | i modi tipici di sbagliare |
| `templates/` | modelli di `intent.md`, `spec.md`, `plan.md`, `REVIEW.md`, `LESSONS.md` |
| `scripts/` | `sdlc-metriche.sh` (latenze e rework dal log di Git), `detect.py` (bande di controllo). Percorsi relativi a questa cartella: dalla radice del repository sono `skills/ai-native-sdlc/scripts/…` |

Fonte: <https://academy.claude.com/courses/ai-native-sdlc-playbook> e
<https://claude.com/blog/the-ai-native-sdlc-playbook>.
