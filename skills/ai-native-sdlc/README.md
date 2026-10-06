# ai-native-sdlc — note di adattamento

Questa skill è l'adattamento per questo harness del *AI-Native SDLC Playbook* di Anthropic
([corso](https://academy.claude.com/courses/ai-native-sdlc-playbook) ·
[post](https://claude.com/blog/the-ai-native-sdlc-playbook)), arrivato come file `ai-native-sdlc.skill`
(carica del 6 ottobre 2026: un archivio con dentro un solo `SKILL.md` di 1.246 righe e 9.832 parole).

L'originale è un manuale valido ma scritto per un'organizzazione che usa Claude Code: metà dei suoi
comandi (`.claude/settings.json`, hook `PreToolUse`, `claude -p`, worktree, managed settings, Code
Review gestito) qui non esiste. Lasciarlo com'era avrebbe significato, a ogni attivazione, spendere
~20.000 token per istruzioni in parte ineseguibili. Da qui il lavoro: **tenere il metodo, cambiare i
meccanismi.**

## Cosa è stato tolto, e perché

| Tolto dall'originale | Perché |
|---|---|
| Managed settings, `allowManagedHooksOnly`, sandbox, marketplace privati | profilo aziendale con IT centrale: qui il profilo è *solo* |
| Claude Security, Claude Tag, Code Review gestito, `claude-code-action` | servizi che non sono in uso qui |
| Sessioni parallele con `git worktree`, subagent `.claude/agents/*` | una persona, una sessione; il sostituto è la rilettura in contesto pulito |
| GitHub Actions (eval, generazione spec, triage, monitoraggio) | qui non c'è CI: i workflow sono diventati script eseguibili a mano |
| Scelta del profilo (tre tabelle di confronto) | il profilo è sempre *solo*: precompilato |
| Sistemi legacy e doppia fonte di verità (Jira, ServiceNow) | non ci sono sistemi esterni da riconciliare |
| Elenco delle risorse esterne e dei piani commerciali | invecchia in fretta; resta il link alle due fonti |

## Cosa è cambiato nel contenuto

| Nell'originale | Qui |
|---|---|
| «hook `PreToolUse` che bloccano» | `scripts/sync-fine-lavoro.sh`, `media/test-all.sh`, `.gitignore`: gli unici controlli che *garantiscono* qualcosa, con l'elenco di ciò che **non** coprono |
| «gate in PR, `CODEOWNERS`, branch protection» | gate in chat + trailer `Approvato-da:` nel commit + decisione in memoria |
| «eval in CI, obbligatori sul merge» | casi e verifiche restano gli stessi; l'esecuzione è preparata dall'agente e lanciata in una **sessione nuova**, perché qui la separazione dei compiti non esiste |
| «rischio alto: pagamenti, dati personali, più servizi» | criteri riscritti per questo repository: dati personali in un repo **pubblico**, file riservati, riavvio del servizio, memoria a lungo termine, aree senza test |
| «`CLAUDE.md`, conoscenza di istituto» | `README.md` + `docs/` |
| «metriche dagli export OpenTelemetry» | `git log` (`scripts/sdlc-metriche.sh`), `media/goals.json`, memoria, `evals/out/` |

## Com'è organizzata

| File | Contenuto |
|---|---|
| `SKILL.md` | i tre principi, i comandi, la ricerca dello stato, le regole ferree, il profilo, l'indice |
| `references/fasi.md` | le sei fasi: procedure, quando la spec serve davvero, criteri di rischio, esempi |
| `references/eval.md` | feedback loop, protocollo dei bug, suite di eval, da incidente a prova |
| `references/gate.md` | i cinque gate, i controlli automatici e i loro limiti, la pubblicazione, l'audit di maturità |
| `references/manutenzione.md` | bande di controllo, incidenti, `LESSONS.md`, scansioni periodiche |
| `references/metriche.md` | leading e lagging, come leggerle con volumi piccoli |
| `references/anti-pattern.md` | i modi tipici di guastare il processo, compresi quelli specifici di qui |
| `templates/` | `intent.md`, `spec.md`, `plan.md`, `REVIEW.md`, `LESSONS.md` |
| `scripts/sdlc-metriche.sh` | latenze fra artefatti e rework dal log di Git; senza `intent/`, attività e quota di correzioni |
| `scripts/detect.py` | rilevatore deterministico a bande di controllo (1σ/2σ/3σ + regole di Western Electric) |

## Verifica

```bash
node media/check-skills.mjs                                  # frontmatter della skill
bash skills/ai-native-sdlc/scripts/sdlc-metriche.sh 100      # metriche dal log di Git
printf '2026-01-01,10\n2026-01-02,11\n' | python3 skills/ai-native-sdlc/scripts/detect.py
bash media/test-all.sh                                       # suite completa
```

Stato al momento dell'installazione (6 ottobre 2026): `audit` del processo al 2 ✅ / 5 ◐ / 6 ❌ —
tabella completa in `references/gate.md` §5. Il primo passo suggerito è la cattura dell'intent.
