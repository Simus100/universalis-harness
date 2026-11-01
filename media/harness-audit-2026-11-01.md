# Audit dell'harness — prompt → context → harness engineering
**Istanza**: `/root/pi-harness` · **Data**: 2026-11-01 · **Metodo**: audit read-only, ogni affermazione ancorata a `file:riga` o marcata.

## 0. Copertura

| Area | Come è stata letta |
|---|---|
| `dashboard.mjs` (6.569 righe) | **campionato**: blocchi scelti per domanda (system prompt 895-1000, prefisso 1377-1450, gate tool 1553-1600, ledger 2519-2720, guard 696-745, comando compact 3146-3160). ~900 righe su 6.569 (14%) |
| `dashboard.html` (12.941 righe) | **non letto**: ridondante per l'audit del ciclo (è la UI). Escluso dichiaratamente |
| `harness.mjs` (243) | letto 1-80 (bootstrap CLI) |
| motore `@earendil-works/pi-coding-agent` (dist 19 MB) | **campionato**: `core/agent-session.js` (grep + 6 punti), `core/compaction/compaction.js` (shouldCompact), `core/settings-manager.js` (soglie) |
| `media/contesto.mjs`, `media/misura.mjs`, `media/memoria/*` | letti in parte (intestazioni + funzioni chiave) |
| `media/turni.jsonl` | **letto integralmente** (3 righe): è l'unica telemetria per-turno disponibile |
| `media/report-harness-costo-contesto.html` | letto (misura del 13/10/2026, 41 sessioni) |
| `sessions/` (61 file) | non analizzati uno per uno: usato l'aggregato in `turni.jsonl` |

Assunzioni dichiarate: (a) il modello in uso è `deepseek-flash` con prezzi `input 0,3 · output 1,2 · cacheRead 0,006` $/Mtok e finestra `1.000.000` (`/root/.pi/agent/models-store.json`); (b) il "costo" qui è denaro di API, non CPU.

---

## 1. Mappa del ciclo (as-is)

Richiesta reale tracciata: il turno del 2026-10-30 19:45 (`media/turni.jsonl:1`) — 20 tool call, 770 s, 4 tool diversi, 0 errori.

| n | Passo | Cosa entra nel contesto | Token cumulati (misurati) | Chiamate | Ancora |
|---|---|---|---|---|---|
| 1 | Il processo carica il prefisso (istruzioni + schemi tool + indice skill) | 13.184 tok di pedaggio, invariabile | 13.184 | 0 | `report-harness-costo-contesto.html` (misura provider 13/10) |
| 2 | L'utente scrive; `conNotaProgetto` accoda la nota del progetto **al messaggio**, non al sistema | ~300-800 tok | ~13.900 | 0 | `dashboard.mjs:1384` |
| 3 | Chiamata al modello | prefisso + storia | input non-cached 207.339 totali sul turno | 1 | `turni.jsonl:1` |
| 4 | Il modello chiede un tool; il risultato torna nel contesto | risultato grezzo, nessun clearing | cresce di ~10.400 tok/passo (media misurata) | +1 per passo | `turni.jsonl:1` (`input/20`) |
| 5 | Tool gate: set di tool **congelato** per tutto il turno | evita di rompere il prefisso | — | — | `dashboard.mjs:1553-1574` |
| 6 | Guardrail `media-guard`: riscrive `write`/`bash >` fuori dalle cartelle protette | — | — | — | `dashboard.mjs:697-729` |
| 7 | Fine turno: telemetria in `turni.jsonl` + archiviazione memoria | — | cache miss 199.989 tok | — | `dashboard.mjs:2540-2565`, `memoria-tool.mjs:281` |
| 8 | Auto-compaction: soglia `contextWindow − 16.384` = **983.616 tok** | non raggiunta né qui né realisticamente | 0 | 0 | `settings-manager.js:560`, `compaction.js:163` |

**Conto del turno reale** (verificato riga per riga sui prezzi del catalogo, torna al centesimo): 207.339 tok input × 0,3 + 21.017 output × 1,2 + 3.456.384 cacheRead × 0,006 = **0,10816 $** = `cost` registrato.
Ripartizione: **57% input non-cached · 23% output · 19% cache read**. Il pedaggio fisso di 13.184 token, pagato a prezzo cache, vale 0,00008 $ per chiamata: **non è un problema di denaro**.

---

## 2. I tre pilastri

### 2.1 Prompt engineering

| Voce | Evidenza | Esito |
|---|---|---|
| Nota d'istanza monolitica `SYSTEM_MEDIA_NOTE` | `dashboard.mjs:895-1000` — **8.013 caratteri ≈ 2.226 tok** | È la parte che cresce: il report del 13/10 misurava "note dell'istanza 1.681 tok" → **+32% in 19 giorni** |
| Duplicazione prompt↔skill | la nota spiega Decision_M (1.138 char) e Timestral (1.517 char) **e** esistono `skills/decision-m/SKILL.md`, `skills/timestral/SKILL.md` | Pagata a ogni richiesta una spiegazione che serve solo quando la feature si usa |
| Descrizioni delle skill nell'indice | 29 skill, **10.872 char di sole `description` ≈ 3.020 tok**; 22 su 29 oltre 250 char, max 892 | Metà del risparmio possibile sta qui: le descrizioni sono scritte come abstract, non come trigger |
| Istruzioni statiche, nessuna versione | nessun campo versione/impronta nel prompt; `prefissoStato.impronta` misura il testo ma non ne traccia la storia | Non si può dire "questo peggioramento viene dal prompt del 24/10" |
| Lingua e formato | italiano imposto, blocchi `svg`/`img`/`pdf` definiti con contratto | **Funziona bene**: regole verificabili, non aggettivi |
| Resistenza all'injection | nessuna clausola sulle fonti non fidate (contenuti web, PDF, output di tool) | le regole ci sono per i *file* (`media-guard`), non per i *testi letti* |

### 2.2 Context engineering

| Voce | Evidenza | Esito |
|---|---|---|
| Prefisso stabile + nota in coda | `dashboard.mjs:1380-1388`, `1437-1443` | **La lezione più avanzata già applicata**: è esattamente il pattern "stable prefix / dynamic suffix" della letteratura sul prompt caching |
| Gate dei tool congelato per turno | `dashboard.mjs:1553-1574` (commento: «mask, don't remove») | Corretto: cambiare i tool a metà turno invalida la cache KV |
| Bilancio del contesto per sezione | `dashboard.mjs:2596-2645`, `media/contesto.mjs` | Raro e prezioso: dice *cosa* occupa i token, non solo il totale |
| Misura dello spreco di cache | `dashboard.mjs:2577-2594` (`cacheStats`) | Raro: trasforma "la cache si è rotta" in un numero |
| **Nessun clearing dei risultati dei tool** | nessuna occorrenza di troncamento/svuotamento risultati in `dashboard.mjs` | Il contesto è append-only: ~10.400 tok/passo, 207k in un turno |
| **Compaction di fatto inerte** | soglia 983.616 tok su finestra 1M (`compaction.js:163`, `settings-manager.js:560`) | Con `keepRecentTokens` 20.000 e `reserveTokens` 16.384, la soglia è tarata su finestre da 128-200k: su 1M **non scatta mai**. Il turno lungo non viene mai compattato né riassunto |
| Memoria in *pull*, non in *push* | 4 tool `memoria_*` (`memoria-tool.mjs`), budget 200-4000 tok dichiarato | **Scelta giusta**: nessun iniezione automatica, il costo lo decide il modello |
| Subagent spenti per default | `SUBAGENT_TOOL_NAMES` filtrabili (`dashboard.mjs:1556`, `1576`) | La leva di isolamento esiste ma non è usata dal flusso normale |

### 2.3 Harness engineering

| Voce | Evidenza | Esito |
|---|---|---|
| Retry provider | 3 tentativi, backoff base 2 s (`settings-manager.js:594-597`), eventi `auto_retry_*` (`agent-session.js:408-416`) | Presente e corretto |
| **Nessun turn cap né budget ceiling** | nessun `maxSteps`/limite di costo in `dashboard.mjs` (grep) | Un turno può girare 770 s e 20 tool call senza tetto: la letteratura 2025-26 considera il *budget ceiling in denaro* parte del contratto di stop |
| **Nessun gate di verifica finale** | la fine del turno è «il modello non chiama più tool» | «Fatto» è un'affermazione del modello, non uno stato del sistema verificato |
| Compaction senza istruzioni custom | `session.compact(instructions)` esiste e si può passare testo (`dashboard.mjs:3146-3152`) ma il percorso automatico non ne riceve | Il riassunto non sa cosa è un vincolo e cosa è rumore |
| Guardrail sui file | `media-guard` + `withinRoot`/`safeResolve` (403 su escape e symlink) | Solido per i path |
| **Esecuzione come root** | `/etc/systemd/system/pi-dashboard.service`: `User=root`; il tool `bash` gira nel processo | Il browser ha un utente dedicato (`dashboard.mjs:1415`), la shell no: non c'è sandbox per i comandi |
| Osservabilità | `media/turni.jsonl` (una riga per turno), `pi-observability` → `~/.pi/agent/observability/history.jsonl`, `ask-log.jsonl` | Buona base proprietaria; nessuno standard (span/trace) e **nessuna aggregazione**: i due file non si parlano |
| Valutazione | **44 file `media/test-*.mjs`**, nessun runner unico, nessuna CI (`.github` assente), `package.json` senza `test` | Il debito più grande: 44 test che nessuno esegue insieme non sono una regressione bloccante |
| Sicurezza API | auth a cookie, backoff per IP, same-origin, confronto a tempo costante (`dashboard.mjs:120-400`) | **Funziona bene** |

---

## 3. Registro delle criticità

| ID | Tipo | Sintomo | Causa | Conseguenza | Fix | Conf. |
|---|---|---|---|---|---|---|
| **C1** | eval | 44 test, 0 runner, 0 CI | non c'è un `npm test` che li aggreghi | ogni modifica al prompt/contesto è una scommessa: non esiste una regressione che blocchi | S | alta |
| **C2** | loop | turno da 770 s, 20 tool, nessun tetto | nessun turn cap né budget in denaro | un loop sbagliato consuma tempo e soldi senza freno | S | alta |
| **C3** | verifica | «fatto» = il modello smette di chiamare tool | nessun gate sullo stato del sistema | risultati non verificati presentati come completati | M | alta |
| **C4** | contesto | +10.400 tok/passo, append-only | nessun clearing dei risultati | contesto enorme, attenzione diluita, cache miss costosi | M | alta |
| **C5** | contesto | compaction mai attiva (soglia 983k) | soglie tarate su finestre piccole | sessioni lunghe senza riassunto né memoria aggiornata | S | alta |
| **C6** | prompt | nota 2.226 tok, +32% in 19 gg, duplicata con 2 skill | ogni feature aggiunge prosa al prefisso | crescita monotona del pedaggio e delle occasioni di conflitto | S | alta |
| **C7** | prompt | indice skill 3.020 tok, descrizioni-abstract | frontmatter scritto per umani | token pagati per skill che non si useranno | S | alta |
| **C8** | sicurezza | `bash` come root, senza sandbox | servizio `User=root` | un comando sbagliato (o iniettato) ha i permessi dell'host | M | alta |
| **C9** | osservabilità | due log non correlati, nessuno span | telemetria propria, non standard | non si ricostruisce *perché* un turno è costato: manca la traccia dei passi | M | media |
| **C10** | contesto | 199.989 tok ri-fatturati in un evento | prefisso rotto una volta (prima del fix del 30/10) | 0,054 $ = 50% del costo del turno, in un colpo | già mitigato, non misurato in regressione | alta |
| **C11** | memoria | l'episodio nasce a fine turno/compaction | gancio `session_compact` | se la compaction non scatta mai (C5), la memoria si aggiorna solo a fine chat | dipende da C5 | media |

**Cosa fa già bene (da non toccare)**: prefisso stabile con nota in coda · gate dei tool congelato · ledger del contesto per sezione · misura dello spreco di cache · memoria in pull con budget dichiarato · guardrail sui path con rifiuto dei symlink · auth con backoff.

---

## 4. Evidenze dalla ricerca (stato dell'arte, con URL al 2026-11-01)

| Pista | Cosa dice la fonte | Verificato su |
|---|---|---|
| Compaction e i suoi costi | comprimere è *lossy*, costa una chiamata e «che aiuti o peggiori dipende da quando gira» | Anthropic, *Effective context engineering* — anthropic.com/research/effective-context-engineering-for-ai-agents · arXiv 2610.25516 (Bud ContextCompact 2.0) |
| Le tre leve distinte | compaction ≠ tool-result clearing ≠ memoria: il clearing è la forma più leggera e conserva la struttura del messaggio | platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools |
| Tool-result clearing in produzione | «svuota il risultato, tieni la traccia della chiamata» | stessa fonte + newsletter.victordibia.com/p/context-engineering-101-how-agents |
| Prefisso stabile / suffisso dinamico | il prefisso in cache non può cambiare: **un timestamp nel prefisso azzera la cache a ogni chiamata**; tool riordinati = cache miss; metti un cache breakpoint sulla giuntura | agentpatternscatalog.github.io/patterns/patterns/prompt-caching.html · docs.vllm.ai (prefix caching) · aws.amazon.com (prompt caching patterns) |
| Il trade-off sparsity↔cache | potare il contesto *cambia il layout* e invalida il prefisso: la compressione va progettata insieme alla cache, non dopo | arXiv 2606.17016 (*TokenPilot*) |
| Contratto di stop moderno | non solo «nessuna tool call»: turn limit + **budget ceiling in denaro** + sottotipo di terminazione tipizzato | ghdaru.github.io/harness_engineering (02 — The Agent Loop) |
| Verifica prima dell'esecuzione | definisci i gate di completamento *prima*, e ricava il successo dallo stato del sistema, non dal riassunto del modello; l'autorità resta deterministica | arize.com/resources/harness-engineering/ · datadoghq.com/blog/ai/harness-first-agents/ |
| Eval mirate > benchmark | poche eval sui comportamenti che contano, con soglie che fanno fallire la build; niente «più eval = meglio» | langchain.com/blog/how-we-build-evals-for-deep-agents · fullsend-ai.github.io/agent-eval-harness/guides/ci/ |
| Osservabilità standard | span `gen_ai.*`: agent, execute tool, load skill, command execution — cioè esattamente i passi di questa dashboard | github.com/open-telemetry/semantic-conventions-genai |
| Isolamento del contesto | i subagent hanno finestra propria e restituiscono solo il risultato: la leva per il lavoro rumoroso | code.claude.com/docs/en/sub-agents · docs.langchain.com (subagents) |
| Harness come ciclo di miglioramento | l'analisi delle tracce diventa una skill ripetibile, non un'analisi una tantum | langchain.com/blog/improving-deep-agents-with-harness-engineering |

**Nota anti-mode**: nessuna di queste fonti suggerisce di riscrivere il loop. Le tre leve più citate (clearing, prefisso, verifica) costano ore, non settimane.

---

## 5. To-Be (diff minimo)

| # | Intervento | Risolve | File | Come | Metrica |
|---|---|---|---|---|---|
| 1 | `npm test` che esegue i 44 test con un esito unico + `scripts/preflight` come gate | C1 | `package.json`, `scripts/` | runner che itera `media/test-*.mjs`, exit≠0 se uno fallisce; 5 eval "di comportamento" (usa memoria, non inventa path, dichiara stima, rispetta il budget) | % test verdi prima di ogni commit |
| 2 | Turn cap + budget ceiling | C2 | `dashboard.mjs` (hook `turnoInizio/Fine`) | `maxPassi=25`, `maxCosto=0,25 $`: al superamento il turno si chiude con esito `budget_exceeded` dichiarato all'utente | passi/turno p95, costo/turno p95 |
| 3 | Gate di verifica finale | C3 | `dashboard.mjs` + una skill `verifica-finale` | prima di dichiarare fatto: o un comando che esce 0, o un elenco di controlli spuntati; l'esito entra in `turni.jsonl` | % turni con esito verificato |
| 4 | Clearing dei risultati dei tool | C4 | `dashboard.mjs` (hook `tool_result`) | oltre N caratteri, sostituisci il contenuto con `[risultato di 8.412 char, rileggibile con read:path]`; tieni la chiamata | tok/passo, tok/turno p50 |
| 5 | Soglie di compaction adattive | C5 | settings istanza | `reserveTokens = max(16.384, 8% finestra)`, `keepRecentTokens` 12.000, e compaction **con istruzioni**: «conserva vincoli, decisioni, path citati» | compaction/settimana, episodi memoria/settimana |
| 6 | Nota d'istanza → skill on-demand | C6 | `dashboard.mjs:895-1000` | le 2 sezioni feature (2.655 char) escono dal prefisso: restano in `skills/decision-m` e `skills/timestral`, che il modello carica quando il tool è acceso | prefisso: 13.184 → ~12.400 tok |
| 7 | Descrizioni delle skill = trigger | C7 | 22 `SKILL.md` | max 180 char, forma «quando…» + la descrizione lunga nel corpo | indice: 3.020 → ~1.500 tok |
| 8 | `bash` in sandbox | C8 | servizio + `dashboard.mjs` | utente dedicato + `--root` sulla cartella di lavoro; oppure `bwrap`/`nsjail` sulla sola shell | # comandi che toccano path fuori root |
| 9 | Span `gen_ai.*` al posto (o accanto) a `turni.jsonl` | C9 | `dashboard.mjs` + esportatore | una riga JSON per span: `execute_tool`, `load_skill`, `model.call` con `trace_id` = sessione; retro-compatibile con `jq` | tempo per ricostruire un turno (minuti → 1 query) |

**Metriche e strumenti già presenti**: `turni.jsonl` (costo, token, tool, errori), `contestoLedger()` (sezioni), `cacheStats()` (spreco). Mancano: p95 aggregato e la traccia dei passi.

**Le tre cose che rendono questo To-Be verificabile**: (a) il runner dei test, perché senza gate ogni altra riga è un'opinione; (b) il budget ceiling, perché è l'unica difesa contro un loop che "sembra funzionare"; (c) il clearing, perché il 57% del costo del turno reale è input non-cached, cioè risultati di tool.

---

## 6. Rischi

| Rischio | Probabilità | Impatto | Mitigazione |
|---|---|---|---|
| Il clearing toglie al modello un dato che gli serviva | media | medio | il segnaposto dice come rileggerlo; il clearing parte solo oltre 12.000 char e solo per risultati più vecchi di 6 passi |
| Il budget ceiling tronca un lavoro legittimo lungo | media | medio | soglia per-turno configurabile; al taglio l'utente vede il motivo e può proseguire in un turno nuovo |
| Le soglie adattive di compaction scattano troppo presto | bassa | alto (perdita di dettaglio) | compaction con istruzioni + episodio in memoria prima del taglio |
| Lo spostamento delle note feature nelle skill peggiora l'uso di Decision_M/Timestral | media | basso | il tool spento rende la skill irrilevante; misurare il tasso di uso della skill per 2 settimane |
| La sandbox rompe comandi che oggi funzionano (brew, npm globali) | alta | medio | applicarla al solo `bash` con una lista di path montati, non all'intero processo |

---

## 7. Cosa NON cambiare

- il **prefisso stabile**: è la ragione per cui la cache sta al 97-98% (`turni.jsonl`), non un dettaglio implementativo
- il **gate congelato** dei tool
- la **memoria in pull** con budget dichiarato: iniettarla a ogni turno sarebbe la regressione più costosa
- i **guardrail sui path** e l'auth con backoff
- il **ledger del contesto**: pochi harness sanno dire *da dove* vengono i token
