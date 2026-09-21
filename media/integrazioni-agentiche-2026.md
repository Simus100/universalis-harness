# Capacità agentiche da integrare in Universalis Harness

Ricerca sulle tendenze a settembre 2026 + mappatura sui punti di aggancio che il vostro
harness già possiede. Ogni voce ha: **cosa**, **perché ora**, **come agganciarla qui**,
**sforzo**, **rischio**.

---

## 0. Punto di partenza (foto dell'harness oggi)

| Area | Stato attuale |
|------|----------------|
| Tool LLM | `read`, `bash`, `edit`, `write` + `web_search`, `source_check`, `fetch_content`, `get_search_content` |
| Tool opzionali | `subagent`, `bg_wait` dietro interruttore (OFF di default, max 3) |
| Estensioni | `pi-observability`, `pi-web-access`, `pi-subagents` (solo dashboard) |
| Skill | standard Agent Skills in `skills/`, caricate nel system prompt, `/skill:nome` |
| Comandi slash | definiti in `media/commands.mjs`, eseguiti da `POST /api/command` |
| Pianificazioni | mini-cron proprio (`media/schedules.json` + `media/schedule-logs/`) |
| Goal | `media/goals.json` con steps + checklist |
| Safety attuale | `media-guard` (hook `tool_call` che riscrive i path), Basic auth + rate-limit, root confinata |
| Risorse host | 12 GB RAM (10 liberi), 6 vCPU, 185 GB disco liberi, Node v24.21.0, **nessun browser installato** |

L'infrastruttura è già quella giusta: avete un hook `tool_call` (intercettazione **e blocco**),
la registrazione di tool custom, un sistema di comandi, uno scheduler e un SSE. La maggior parte
delle voci sotto è "agganciare una capability ai ganci che ci sono già", non riscrivere l'harness.

---

## 1. Tendenze rilevate (settembre 2026)

1. **Browser agent = voce di roadmap, non più demo.** Browser Use ha toccato lo SOTA su
   WebVoyager (89,1% su 586 task); Anthropic Computer Use è in produzione (BCG, Asana);
   OpenAI ha piegato Operator dentro ChatGPT Atlas/agent mode. Il fallimento tipico non è più
   "non capisce la pagina" ma **anti-bot, 2FA, UI aziendali sconosciute e task lunghi aperti**.
   → Conseguenza pratica: progettare per *task-bounded*, non per "fai tutto da solo".
2. **Shift da MCP a CLI + Skill per il browser.** Il README di Playwright MCP lo dice
   esplicitamente: gli agenti di coding preferiscono **CLI esposte come SKILL** perché le
   invocazioni CLI sono molto più token-efficient (niente schemi di tool enormi né alberi di
   accessibilità verbosi). Nasce una generazione di **CLI browser native per agenti**
   (`agent-browser` di Vercel Labs, `kuri`, `gsd-browser`, `moli`, `phantom-engine`), quasi tutte
   in Rust/Zig, basate su **CDP + snapshot di accessibilità con ref** invece che screenshot.
   Claim tipico: ~93% di contesto in meno rispetto a un approccio screenshot-based.
3. **MCP 2026-07-28: core stateless + hardening.** Quinta release dello spec: MCP diventa
   stateless (per scalare oltre il singolo client), autorizzazione irrobustita, estensioni
   ufficiali graduate. Numeri: ~4-500M download/mese degli SDK Tier 1; le tool call MCP da
   utenti ChatGPT sono cresciute 98x nel 2026. **Roots e Sampling deprecati** (SEP-2577),
   **Elicitation resta** con un nuovo URL mode. **MCP Apps** è l'estensione stabile che fa
   renderizzare UI reali dentro l'host (`ui://`).
4. **Approccio "harness + sandbox agent".** L'OpenAI Agents SDK introduce esplicitamente il
   concetto di **sandbox agents**: agenti preconfigurati per lavorare dentro un confine.
   Il 10/09/2026 OpenAI ha lanciato **Agents API** ("cloud agents con l'harness di Codex,
   fully managed") — segnale che il *harness* è il prodotto, non il modello.
5. **Multi-agente: due filosofie.** OpenAI Agents SDK = *handoffs* (controllo che si trasferisce);
   LangGraph = *grafo con stato esplicito e subgraph*; Google ADK = transfer gerarchico.
   Per i vostri subagent il pattern da copiare è quello *agents-as-tools* (il genitore resta
   proprietario della risposta), non l'handoff.
6. **HITL (human-in-the-loop) come enforcement point unico.** Il pattern maturo 2026: ogni
   azione conseguente passa da **un solo punto** che decide `allow` / `deny` / `approval_required`,
   con pausa e firma umana nominata. Regola chiave: **si gata solo ciò che è irreversibile o ha
   impatto pubblico**, altrimenti diventa un timbro a gomma. Policy di esempio dal web:
   tool autorizzato ≠ invocazione autorizzata *questa volta*, con *questi* argomenti.
7. **Sandboxing a 4 livelli.** Isolamento container, controllo filesystem, **egress di rete
   default-deny**, scoping delle credenziali. Container condivide il kernel → per codice
   generato si raccomandano microVM (Firecracker) o kernel userspace (gVisor) / E2B.
8. **Memoria = disciplina infrastrutturale.** Paper recenti (arXiv 2609.05510 "Memory as
   Infrastructure", 2608.21690 "Context as an Environment") trattano la memoria lunga come
   problema di *reliability engineering* per sessioni che durano mesi, non come prompt.
   Pattern: context window = RAM, store esterni = disco; compaction deve essere ispezionabile.
9. **Osservabilità: OpenTelemetry come lingua franca.** Convenzioni semantiche GenAI
   (`gen_ai.*`, v1.41 nel 2026) per trace di tool call/decisioni; Bedrock AgentCore Evaluations
   valuta *qualsiasi* framework purché spari telemetria OTel. Eval e tracing sono due gambe
   dello stesso problema.
10. **Governance con date reali, e già spostate.** EU AI Act: obblighi per sistemi high-risk
    (Annex III) **prorogati al 2 dicembre 2027** dal Digital Omnibus (Reg. UE 2026/1744, in
    vigore 27/07/2026); sistemi embedded Annex I al 2 agosto 2028. Restano: trasparenza
    Art. 50 dal 2/08/2026, marcatura machine-readable degli output sintetici entro il
    **2 dicembre 2026** per sistemi immessi sul mercato prima del 2/08/2026, log retention
    Art. 26(6) ≥ 6 mesi. ⚠️ Molte pagine online citano ancora "2 agosto 2026" per high-risk:
    è **disinformazione diffusa**, verificate sempre sulla pagina della Commissione.
11. **Agenti sempre attivi e multimodali.** Settimana del 17-18/09/2026: Anthropic rilancia
    **Claude Code Projects** (più agenti, memoria/goal/artefatti condivisi, "il manager del
    lavoro, non il lavoratore"), xAI attiva la **voce su Grok Bot**, Meta porta **Muse su Mac**
    (azioni su file, messaggi, calendario, mail nelle app native), Google lancia **CC** per le
    famiglie (email+calendario+chat+task, fino a 6 membri).
12. **A2A entra nella Agentic AI Foundation** (17/08/2026), v1.0 con **Agent Card firmate
    crittograficamente**, binding gRPC, deployment in Azure AI Foundry / Bedrock AgentCore /
    Google Agent Engine. Identità dell'agente che diventa *protocol-native*.

---

## 2. Liste delle cose da integrare

### 🅰️ BROWSER & COMPUTER USE (la richiesta principale)

**A1. `agent-browser` (Vercel Labs) come tool nativo — consigliato come prima mossa**
- **Cosa**: CLI Rust, daemon in background, 63+ comandi via CDP. Il cuore è
  `snapshot` → albero di accessibilità con **ref** (`@e2`), poi `click @e2`, `fill @e3 "..."`,
  `get text @e1`. Supporta anche selettori CSS, `screenshot --annotate`, `--if-changed`
  per saltare screenshot identici, `pdf`, `eval`, `upload`, `connect <port>` per attaccarsi a
  un Chrome già aperto, `webmcp list/invoke` (WebMCP sperimentale).
- **Perché**: è progettato per *agenti*, non per QA. Nessuna dipendenza Playwright/Puppeteer,
  Node 24 già presente. Il flusso snapshot+ref è il modo token-efficient di fare browsing oggi.
- **Come agganciarlo qui**: (1) `npm i -g agent-browser && agent-browser install --with-deps`
  (scarica Chrome for Testing); (2) **non** registrare 63 tool — esporre **un solo tool `browser`**
  con `action` enum (`open|snapshot|click|fill|press|scroll|screenshot|pdf|eval|close`),
  che internamente esegue la CLI; (3) in alternativa/nella stessa ottica: una **skill** in
  `skills/browser/SKILL.md` che documenta la CLI e lascia usare `bash` già esistente
  → zero nuovi tool, zero schemi in contesto, allineato alla tendenza "CLI as Skill".
- **Sforzo**: basso (skill) / medio (tool dedicato). **Impatto**: molto alto.
- **Rischio**: Chrome headless ≈ 300-600 MB RAM per sessione — con 10 GB liberi potete
  permettervi 2-3 sessioni concorrenti, mettete un limite. Serve `--no-sandbox` o un utente
  non-root per il profilo.

**A2. Snapshot di accessibilità invece di screenshot (decisione architetturale)**
- **Cosa**: usare l'albero a11y come interfaccia primaria e gli screenshot solo come fallback
  (elementi non testuali, canvas, verifica visiva).
- **Perché**: gli snapshot a11y sono deterministici e citabili; gli screenshot costano
  migliaia di token ciascuno e introducono non-determinismo. Il confronto 2026 tra Playwright MCP
  e Chrome DevTools MCP conclude che *entrambi* usano snapshot a11y di default: la differenza è
  l'albero custom vs albero formattato, non HTML vs a11y (correzione esplicita dell'autore).
- **Come**: se il modello attivo supporta immagini (deepseek-flash sì) tenete gli screenshot
  disponibili, ma il prompt della skill deve dire **snapshot-first**.

**A3. Chrome DevTools MCP o Playwright MCP (alternativa "standard")**
- **Cosa**: `chrome-devtools-mcp` (Puppeteer+CDP, ~26 tool, include lighthouse audit, trace di
  performance, heap snapshot/dominatore, screencast) o `playwright-mcp` (snapshot a11y + CLI).
- **Perché**: se vi interessa *debug e analisi di performance* di una pagina (non solo
  interazione), Chrome DevTools MCP è più ricco di agent-browser. Playwright MCP dà anche
  test generation e network mocking.
- **Come**: MCP non è la strada più naturale per il vostro harness (il vostro modello passa da
  pi, non da un client MCP). Due opzioni onesti: (a) usare la **CLI** di questi strumenti via
  `bash`, (b) se in futuro volete MCP in pi, valutate lo spec **2026-07-28** (stateless,
  auth hardening) e non la versione vecchia.
- **Sforzo**: basso se li usate come CLI. **Impatto**: medio-alto.

**A4. Profilo browser persistente + login umano assistito**
- **Cosa**: un profilo Chrome dedicato alla root del progetto (`--user-data-dir` in
  `media/browser-profile/`), così i cookie di sessione sopravvivono tra i task.
- **Perché**: il killer dei browser agent è 2FA/CAPTCHA/login. Il pattern che funziona:
  l'agente apre la pagina di login, **passa la palla all'umano** (voi cliccate), poi prosegue
  con la sessione autenticata. `agent-browser connect <port>` permette di agganciarsi a un
  Chrome che state già usando voi.
- **Come agganciarlo qui**: nuova vista **🖥 browser** nella dashboard con un *live view*
  (agent-browser ha `stream enable` con WebSocket runtime) e un pulsante **"prendi il controllo"**.
  Le credenziali nel profilo vanno **escluse dai backup** o cifrate.
- **Sforzo**: medio-alto. **Impatto**: alto (sblocca i casi d'uso reali).

**A5. Computer use su desktop (X11 virtuale) — solo se serve davvero**
- **Cosa**: `xvfb` + un modello con computer use (Gemini 3.5 Flash ha la capability integrata
  dal 24/06/2026; Anthropic ha reso GA computer use + browser use + Skills API + Files API il
  20/08/2026; l'explainer "computer use 2026" lo descrive come capability ormai diffusa).
- **Perché**: serve solo per app *non* web (GIMP, LibreOffice, app desktop legacy).
- **Come**: VNC/Xvfb + screenshot annotati, pilotato dallo stesso loop del browser.
- **Sforzo**: alto. **Impatto**: basso-medio, **priorità bassa** — il ritorno per voi è
  probabilmente basso rispetto al costo di manutenzione.

**A6. Capability browser esposte come skill, non come tool**
- **Cosa**: 3-4 skill specializzate (non una generica): `browser-webapp` (interazione),
  `browser-scrape` (estrazione + markdown), `browser-perf` (lighthouse/trace),
  `browser-test` (verifica di una UI generata).
- **Perché**: progressive disclosure — il modello vede solo nome+descrizione e legge il
  `SKILL.md` quando serve. È *letteralmente* il motivo per cui il settore si è spostato da MCP
  a Skill per il browser (risparmio di token sugli schemi).

---

### 🅱️ TOOL, MCP E INTEROPERABILITÀ

**B1. Gate di approvazione sui tool distruttivi (HITL) — il più urgente per sicurezza**
- **Cosa**: un punto unico che intercetta `tool_call`, classifica il rischio e risponde
  `allow` / `approval_required` / `deny`.
- **Perché**: leggendo il vostro README, la dashboard è già protetta bene (HTTPS, Basic auth,
  rate-limit, path confinati) **ma** "l'agente ha `bash` e accesso ai file della root
  (`DASH_ROOT=/root` → di fatto tutto l'host)" e il README stesso raccomanda di promuovere i
  comandi distruttivi a gate di approvazione **prima** di usarla con altri utenti. Con
  `media/piano-istanza-ospiti.md` in giro, questa è la lacuna numero uno.
- **Come agganciarlo qui**: estensione inline (accanto a `MEDIA_GUARD_EXT`) che su `tool_call`
  valuta una **policy dichiarativa** in `media/policy.json`:
  ```json
  { "deny": ["rm -rf /", "> /etc/*", "systemctl stop *", "dd * of=/dev/*"],
    "approval": ["rm *", "mv *", "chmod *", "git push*", "curl * | sh", "npm i -g *"],
    "allow": ["ls*", "cat*", "grep*"] }
  ```
  L'approvazione si chiede **in chat via SSE** (nuovo evento `approval_request` + endpoint
  `POST /api/approval {id, decision}`), non nel TUI: così il gate funziona anche da mobile,
  che è il vostro caso d'uso. Il hook `tool_call` di pi supporta esattamente
  `{ block: true, reason }` e la mutazione di `event.input` — e il vostro `media-guard` dimostra
  che il pattern gira già.
- **Dettaglio importante dai pattern 2026**: gata solo l'irreversibile. Se approvate anche
  `ls`, avete un timbro a gomma e l'utente smette di leggere. Aggiungete **fingerprint
  dell'azione** ("approva *questo* comando con *questi* argomenti ora") e una modalità
  "approva tutto per questa sessione" per non spezzare il flusso.
- **Sforzo**: medio. **Impatto**: altissimo.

**B2. Sandbox per l'esecuzione di codice generato**
- **Cosa**: contenere `bash` in un confine: filesystem in overlay su una dir di lavoro,
  **egress di rete default-deny con allowlist**, credenziali fuori dall'ambiente del comando.
- **Perché**: un prompt injection può pilotare ogni tool, `bash` incluso. I quattro livelli
  canonici (container, filesystem, egress, credenziali) vanno applicati **insieme**: indebolirne
  uno significa affidarsi agli altri.
- **Come**: i passi a costo/beneficio migliore per voi, in ordine: (1) **egress policy** via
  `nsjail`/`bubblewrap` o firewall per-utente; (2) eseguire `bash` come **utente non-root**
  dedicato con `DASH_ROOT` sua e sudoers ristretto; (3) se serve isolamento forte,
  systemd-run con `ProtectSystem=strict`, `PrivateTmp=yes`, `RestrictAddressFamilies=`;
  (4) microVM (Firecracker/gVisor/E2B) solo se aprite a ospiti esterni.
- **Nota**: il vostro `media-guard` riscrive i path ma **da solo non è un sandbox** — il README
  ammette che non copre percorsi relativi, `$VAR`, `cp`, `mv`, `dd`. È una policy *di cortesia*,
  non un confine di sicurezza.
- **Sforzo**: medio (systemd-run/user dedicato) → alto (microVM). **Impatto**: alto.

**B3. MCP come *client* (importare server MCP esterni) — valutare, non subito**
- **Cosa**: pi non ha un client MCP nativo; potreste scrivere un'estensione che si collega a
  server MCP e li espone come tool pi. Attenzione allo spec **2026-07-28**: core **stateless**,
  auth hardening, Roots e Sampling **deprecati** (migrazione: Roots → parametri di tool/URI di
  risorsa; Sampling → integrazione diretta col provider), **Elicitation** viva con URL mode.
- **Perché**: apre l'ecosistema (GitLab 19.4 governa le automazioni MCP, AWS MCP Server ha
  aggiunto il supporto serverless per Lambda, ecc.).
- **Contro**: ogni server MCP aggiunge **schemi di tool in contesto**, cioè costo fisso per
  turno. È esattamente il problema che ha spinto il settore verso "CLI as Skill".
- **Raccomandazione**: **non** farlo come integrazione generica. Se un server MCP serve, valutate
  prima se esiste una CLI equivalente da usare via `bash` o da impacchettare come skill.
- **Sforzo**: alto. **Impatto**: medio. **Priorità**: bassa.

**B4. Elicitation per le domande dell'agente**
- **Cosa**: quando l'agente ha bisogno di un dato, **chiederlo con un form strutturato**
  invece di indovinare o fare tre turni di conversazione.
- **Perché**: Elicitation è sopravvissuta alla potatura dello spec MCP 2026-07-28 mentre Roots e
  Sampling sono state deprecate: è la feature "il server chiede all'umano".
- **Come agganciarlo qui**: la dashboard ha **già** l'infrastruttura (SSE + UI + `ui_prompt_start`/
  `ui_prompt_end` a livello di estensione). Un nuovo evento `ask_user` con schema
  `{question, fields:[{name,type,options}], allow_freeform}` → la dashboard renderizza un form
  inline → risposta come risultato del tool. Riusate la stessa plumbing del gate di approvazione
  (B1). È la stessa primitiva: **SSE verso il browser, risposta come tool result**.
- **Sforzo**: medio (condiviso con B1). **Impatto**: alto sull'usabilità mobile.

**B5. Skill come libreria di procedure dell'utente**
- **Cosa**: oltre alle skill generiche, skill **personali** che codificano *come* voi lavorate:
  "come pubblico sul blog Universalisi", "come preparo una rassegna stampa", "convenzioni
  di montaggio video", ecc.
- **Perché**: il valore di un harness non è il modello, sono le procedure. Anthropic ha reso GA
  la **Skills API** il 20/08/2026: il "procedural knowledge" è trattato come asset di prima classe.
- **Come**: `skills/` è già pronto; manca solo il contenuto. Aggiungete un pulsante
  **"salva questa procedura come skill"** sotto le risposte riuscite → un clic trasforma una
  buona risposta in una skill. È il modo di far crescere la libreria senza lavoro manuale.
- **Sforzo**: basso. **Impatto**: alto nel tempo.

---

### 🅲 MEMORIA E CONTESTO

**C1. Memoria a lungo termine con store esterno (non nel prompt)**
- **Cosa**: un file di memoria curato (`media/MEMORY.md` o SQLite) con fatti stabili, decisioni,
  preferenze dell'utente — iniettato *parzialmente* e per rilevanza, non integralmente.
- **Perché**: il context window non è memoria, è RAM che evapora. Il paper "Memory as
  Infrastructure" (arXiv 2609.05510) studia sessioni che durano **mesi** attraverso *compaction
  ripetute*: la memoria persistente è un problema di affidabilità, non di prompt.
  Schema pratico: window = RAM, store esterni = disco.
- **Come agganciarlo qui**: avete già `goals.json`, `schedules.json`, le skill e le sessioni JSONL.
  Aggiungete: (a) `media/MEMORY.md` riscritto dall'agente con un tool `memory` (append/rewrite,
  con revisione umana facile); (b) un blocco nel system prompt via `before_agent_start`
  (quell'evento può iniettare messaggi e modificare il system prompt — perfetto).
  (c) **ricerca semantica** sopra le sessioni: oggi `/api/sessions/search` è full-text;
  con embedding locali diventerebbe "cerca il concetto", molto più utile su mesi di storico.
- **Sforzo**: basso (MEMORY.md) → medio (embedding). **Impatto**: alto.

**C2. Compaction ispezionabile e reversibile**
- **Cosa**: quando il contesto viene compattato, produrre un **artefatto leggibile** che dica
  cosa è stato perso, e permettere di recuperarlo.
- **Perché**: pi offre un evento per compaction personalizzata; il rischio documentato è che la
  compaction "committa a preservare qualcosa prima che i bisogni futuri siano noti"
  (arXiv 2608.21690 propone di trattare la sessione come *ambiente programmabile*).
- **Come**: `media/compactions/` con il testo completo pre-compaction + indice; la dashboard
  mostra in chat una card "compattato: N token → M, dettagli". Avete già sessioni JSONL e
  `navigateTree`, quindi il materiale c'è.
- **Sforzo**: basso. **Impatto**: medio-alto sulla fiducia.

**C3. State/memory per i subagent (contesto condiviso)**
- **Cosa**: i subagent oggi partono "freddi". Date loro un **blocco di contesto comune** (goal
  attivo, skill rilevanti, convenzioni) via `agents-as-tools`.
- **Perché**: Anthropic ha appena ricostruito Claude Projects attorno esattamente a questo:
  più agenti con **memoria, goal e libreria di artefatti condivisi**. È il segnale più forte di
  questa settimana sul fatto che il valore sta nell'*harness condiviso*, non nell'agente singolo.
- **Sforzo**: basso-medio.

---

### 🅳 ORCHESTRAZIONE

**D1. Goal eseguibili end-to-end (già a metà)**
- Avete `goals.json` con `steps` e `checklist`, e un comando `/goal-run`. Il passo successivo è
  un **motore di esecuzione**: il goal diventa un run ripartibile, dove ogni step produce
  evidenza (file, output, test) e la checklist si spunta **solo** con evidenza verificabile.
- Pattern da copiare: gli "eval + trace" (sezione F) chiudono il cerchio: un goal è "fatto"
  quando gli eval passano, non quando il modello dice "fatto".
- **Sforzo**: medio-alto. **Impatto**: molto alto (è la differenza tra assistente e lavoratore).

**D2. Durabilità dei run (crash-safe / resumable)**
- **Cosa**: se il processo muore a metà di un cron job di 40 minuti, alla ripartenza riprende da
  dove era, non da capo.
- **Perché**: LangGraph con Temporal-backed durability e OpenAI Agents API ("infrastructure that
  keeps them running") indicano che la **durabilità è il tema infrastrutturale del 2026**:
  gli agenti long-running sono il caso d'uso, e i long-running falliscono sempre.
- **Come agganciarlo qui**: `schedules.json` + `schedule-logs/` esistono già. Aggiungete uno
  **journal di run** (`media/runs/<id>.json` con stato per step + idempotency key) e fate sì che
  lo scheduler riprenda i run `running` orfani al boot.
- **Sforzo**: medio. **Impatto**: alto (oggi un riavvio uccide il lavoro in corso).

**D3. Subagent: verificatore e parallelismo**
- Oltre al subagent generico, due ruoli specifici con valore sproporzionato:
  **`verifier`** (riceve il lavoro di un altro agente e cerca di *falsificarlo*, non confermarlo)
  e **`scout`** (raccoglie informazioni in parallelo, economico).
- Confermate la scelta *agents-as-tools* (il genitore resta proprietario della risposta) invece
  del handoff: è più facile da tracciare e da debuggare.
- ⚠️ Attenzione al costo: tenete l'interruttore esistente, aggiungete un **budget di token per
  run** come tetto duro (kill del subagent oltre soglia), non solo un numero massimo di spawn.

**D4. Trigger oltre il cron**
- Avete il cron. Aggiungete trigger **reattivi**: webhook in ingresso
  (`POST /api/hooks/<nome>` che avvia un prompt/goal), **file watcher** (una cartella che,
  quando riceve file, fa partire una pipeline), e **coda di job** (più task in fila con priorità).
- **Perché**: il cron copre "ogni giorno alle 04:15"; il mondo reale è "quando arriva X".

**D5. Stanze/workspace multi-sessione**
- Pattern Claude Projects / CC di Google: uno spazio con più chat, memoria e file condivisi,
  più membri. Per voi: "progetto cliente" = un workspace con le sue sessioni, skill, goal e
  file. Ottimo anche in chiave `piano-istanza-ospiti.md` (un workspace per ospite, isolato).
- **Sforzo**: medio-alto, ma è l'evoluzione naturale della cartella `media/`.

---

### 🅴 SICUREZZA, GOVERNANCE, VERIFICABILITÀ

**E1. Scoping delle credenziali e dei segreti**
- **Cosa**: l'agente oggi può leggere `/root/pi-harness/.env` (password dashboard), il
  `.env` dei servizi, chiavi SSH. Regola: **default-deny sui percorsi sensibili** +
  credenziali per-task iniettate al bisogno.
- **Come**: estendete la deny-list di `media-guard` a `.env`, `*.pem`, `id_*`, `.ssh/`,
  `.pi/`, `credentials*`, e *fatelo bloccare*, non solo riscrivere. Attenzione: il `read` di pi
  legge i file, quindi serve il blocco nel `tool_call` (per `read` **e** `bash`).
- **Sforzo**: basso. **Impatto**: altissimo. **Fatelo per primo, è quasi gratis.**

**E2. Audit log firmato, a prova di manomissione**
- **Cosa**: registro append-only di ogni azione conseguente: chi, quando, quale tool, quali
  argomenti, quale esito, quale approvazione. Hash chain (ogni riga contiene l'hash della
  precedente) così la manomissione è rilevabile.
- **Perché**: l'Art. 26(6) dell'EU AI Act richiede **almeno 6 mesi** di log per sistemi high-risk;
  la "traceability per la regulated engineering org" è diventata una pratica diffusa.
  Le "quattro colonne" dell'agent observability: decisioni, retrieval, tool call, output.
- **Come**: `media/audit/YYYY-MM.jsonl` con hash chain; vista **🔒 audit** nella dashboard con
  ricerca e verifica della catena; includetelo in `backup.mjs` (⚠️ oggi il backup prende solo
  `sessions/` e `media/`, verificate che l'audit ci finisca).
- **Sforzo**: basso-medio. **Impatto**: alto.

**E3. Difesa da prompt injection**
- **Cosa**: oggi l'agente legge pagine web (`fetch_content`) e file caricati: entrambi sono
  **input attaccante-controllati** che finiscono nello stesso contesto dei vostri comandi.
- **Perché**: i browser agent falliscono su anti-bot e 2FA, ma il vettore sottovalutato è il
  *contenuto* ostile. Con `bash` disponibile, un injection in una pagina web = esecuzione di
  codice sul VPS.
- **Contromisure concrete**: (1) marcare il contenuto esterno come non fidato nel prompt
  (`<untrusted>...</untrusted>` + istruzione esplicita); (2) **wrapping del testo recuperato**
  in un'estensione `tool_result` che lo delimita e neutralizza le istruzioni imperative;
  (3) il gate di approvazione (B1) è la vera difesa in profondità: qualunque cosa dica la pagina,
  `rm` non parte senza un umano; (4) **egress allowlist** (B2) limita l'esfiltrazione.
- **Sforzo**: basso (wrapping) + dipende da B1/B2. **Impatto**: alto.

**E4. Scheda di conformità EU AI Act nel repo**
- **Cosa**: un file `media/compliance.md` con: se e dove il sistema ricade nell'Act, ruolo
  (provider/deployer), obblighi applicabili con **date verificate**, log retention, marcatura
  output sintetici, e il registro dei rischi.
- **Perché ora**: le date sono state **spostate** dal Digital Omnibus e il web è pieno di
  informazioni vecchie (il 2/08/2026 per gli high-risk è citato ovunque ma è superato:
  Annex III → 2/12/2027). Se lavorate con clienti, avere questo scritto è un vantaggio
  commerciale, non solo un obbligo.
- **Sforzo**: basso (scrittura) ma richiede verifica delle fonti primarie (pagina Commissione).
- **Nota**: dipende dal vostro caso d'uso (produzione video/marketing: probabilmente basso
  rischio, ma Art. 50 trasparenza e marcatura contenuti sintetici **contano** per la
  comunicazione pubblica).

**E5. Multi-tenant pronto (per `piano-istanza-ospiti.md`)**
- Se aprite a ospiti: **un processo, un utente, una root per ospite** (isolamento forte),
  quote di token/costo per ospite, e la coda job condivisa. Il gate di approvazione diventa
  ancora più importante: l'ospite non deve poter far eseguire comandi sul vostro host.
- Mettete un **tetto di spesa** per sessione/utente: oggi la dashboard mostra il costo ma non
  lo limita. Un `cost_cap` con abort automatico è probabilmente la feature di sicurezza
  economica più richiesta.

---

### 🅵 OSSERVABILITÀ ED EVAL

**F1. Trace OpenTelemetry per tool call e decisioni**
- **Cosa**: emettere span OTel per: prompt → chiamata LLM → tool call → risultato → turno,
  con le **convenzioni semantiche GenAI** (`gen_ai.*`, v1.41 nel 2026).
- **Perché**: è la lingua franca: "qualsiasi framework, purché spari telemetria OTel" è ciò che
  permette di usare servizi di eval (es. Bedrock AgentCore Evaluations) senza essere legati a
  un SDK. Vi dà trace riproducibili e replayability ("ricostruire esattamente cosa ha fatto
  l'agente e perché").
- **Come**: avete già `pi-observability` per il footer TUI. Il passo è un **export OTel**
  (span file-based se non volete un collector). Nota architetturale: `before_provider_request`,
  `after_provider_response`, `tool_execution_start/end` sono già emessi da pi — mappano 1:1
  sugli span. Costo di implementazione quasi nullo, è solo plumbing.
- **Sforzo**: basso-medio. **Impatto**: alto.

**F2. Eval suite (la gamba mancante)**
- **Cosa**: un set di task con criterio di successo **verificabile a macchina** (test che passano,
  file che esistono, output che corrisponde a uno schema) + una manciata di eval giudicate da un
  modello.
- **Perché**: "agent observability ed eval sono le due gambe" — i test tradizionali
  (unit/integration) non bastano perché la qualità di un agente non è un vero/falso.
  Senza eval, ogni cambio di prompt/modello/skill è una scommessa.
- **Come agganciarlo qui**: avete già 7 file di test e un'istanza isolata
  (`DASH_SESSION_DIR=/tmp/pi-test/sessions`). Estendete `media/test-all.sh` con una cartella
  `media/evals/` dove ogni eval è un caso YAML/JSON + checker. Poi **/eval** come comando slash
  e un badge in dashboard. Bonus: girare le eval **dopo ogni modifica di skill** prende
  automaticamente le regressioni di prompt.
- **Sforzo**: medio. **Impatto**: molto alto — è ciò che rende sicuro aggiungere tutto il resto.

**F3. Costi e budget in tempo reale con soglie**
- Avete già modello/token/cache/costo in barra. Aggiungete: costo **per goal/run/skill**,
  soglie con alert (`SSE` → notifica PWA, che già avete), e hard-stop.
- Un dato utile dal settore: le tool call MCP da ChatGPT sono cresciute 98x nel 2026 —
  l'esplosione dei costi per tool call è il nuovo rischio operativo. Misurate per-tool.

---

### 🅶 INTERFACCIA E MODALITÀ D'USO

**G1. Voce (input e output)**
- xAI ha attivato la **voce su Grok Bot** il 17-18/09/2026 e Meta ha portato Muse su Mac:
  la voce sta diventando il modo naturale di comandare un agente sempre attivo.
- Per voi: **dictation** nell'input della dashboard (Web Speech API, lato browser, zero costo
  server) + TTS per riascoltare le risposte lunghe. Il valore su mobile è immediato.
- **Sforzo**: basso (solo browser). **Impatto**: medio-alto su mobile.

**G2. Live view del browser in dashboard**
- Una vista che mostra *cosa sta facendo* l'agente nel browser (stream WebSocket di
  `agent-browser stream enable`), con pulsante **prendi il controllo** e **restituisci**.
- È la risposta al problema n.1 dei browser agent (2FA) e al problema di *fiducia*:
  vedere cosa fa è ciò che rende accettabile lasciarlo fare.
- **Sforzo**: medio-alto. **Impatto**: alto.

**G3. Notifiche bidirezionali (approvazioni da mobile)**
- Avete notifiche PWA in uscita. Aggiungete il flusso inverso: se l'agente chiede
  un'approvazione (B1) o ha una domanda (B4), arriva **una notifica con i pulsanti**
  ("Approva" / "Rifiuta"), e si risponde dal telefono senza aprire la chat completa.
- **Perché**: il valore del gate di approvazione crolla se per approvare dovete aprire la
  dashboard e cercare il messaggio.
- **Sforzo**: basso-medio (riusa SSE + service worker esistenti). **Impatto**: alto.

**G4. Artifact/canvas view**
- Una vista separata per l'oggetto del lavoro (il documento, il file HTML, il video, il sito)
  invece che solo la chat. Claude Projects e CC ruotano attorno a "artefatti condivisi".
- Per voi: `media/` ha già tutto — serve una vista "progetto" che mostri i file come output
  principale e la chat come strumento. Probabilmente è la modifica **più visibile** per chi usa
  la dashboard per lavoro reale.
- **Sforzo**: medio. **Impatto**: alto.

**G5. Modalità "always-on" con agenda**
- Pattern Grok Bot / CC / Muse: un agente che sta lì e sorveglia. Per voi: un pannello
  **agenda** che unisce cron, goal in corso, run recenti e approvazioni in attesa in un'unica
  timeline "cosa sta facendo / cosa aspetta da me".
- **Sforzo**: basso-medio. **Impatto**: medio-alto.

**G6. Interoperabilità A2A (se mai vi servisse)**
- A2A v1.0 con **Agent Card firmate** e ingresso nella **Agentic AI Foundation** (17/08/2026).
  Ha senso solo se volete che il vostro harness **collabori con agenti esterni** (o con l'agente
  di un cliente). Implementare una Agent Card per il vostro harness è relativamente poco lavoro
  e vi mette nel ecosistema standard. **Priorità bassa**, ma da tenere d'occhio: se vendete
  a terzi, "il nostro agente è A2A-compatibile" diventerà una riga di capitolato.

**G7. MCP Apps / UI renderizzata (sperimentale)**
- L'estensione MCP Apps fa renderizzare UI reali (`ui://`) dentro l'host. Nella vostra
  dashboard avete **già** la capacità di renderizzare HTML: quindi siete, di fatto, un host
  naturale per output interattivi. Idea a basso costo: quando l'agente genera un questionario,
  una tabella di dati o un grafico, renderizzatelo **come componente interattivo** invece che
  come markdown. Riusa la card dei file che avete già.

---

## 3. Roadmap consigliata

### Fase 1 — Fondamenta di sicurezza (prima di aggiungere potenza)
Sono cose piccole che rendono tutto il resto sicuro da aggiungere.

| # | Voce | Sforzo | Perché subito |
|---|------|--------|----------------|
| E1 | Deny-list su `.env`, `.ssh`, `*.pem` con **blocco** (non solo rewrite) | basso | oggi l'agente può leggere la vostra password |
| B1 | Gate di approvazione HITL con policy dichiarativa + SSE | medio | il README stesso lo chiede; serve per gli ospiti |
| E2 | Audit log con hash chain | basso | 6 mesi di retention, base per la compliance |
| E3 | Wrapping del contenuto esterno come non fidato | basso | difesa da prompt injection via web |
| F3 | Tetto di spesa per sessione con hard-stop | basso | costo = rischio operativo |

### Fase 2 — Browser (la richiesta principale)
| # | Voce |
|---|------|
| A1 | Installare `agent-browser` + skill `browser-*` (snapshot-first) |
| A2 | Convenzione: albero a11y primario, screenshot come fallback |
| G3 | Approvazioni e domande rispondibili da mobile |
| G2 | Live view del browser con "prendi il controllo" |
| A4 | Profilo persistente + login assistito dall'umano |

### Fase 3 — Memoria e orchestrazione
| # | Voce |
|---|------|
| C1 | `MEMORY.md` + iniezione via `before_agent_start` |
| C3 | Contesto condiviso per i subagent |
| D2 | Journal dei run, ripartenza dopo crash/riavvio |
| D3 | Subagent `verifier` e `scout` + budget di token |
| D1 | Goal con evidenza verificabile per step |
| D4 | Trigger reattivi (webhook, file watcher, coda job) |

### Fase 4 — Qualità, conformità, prodotto
| # | Voce |
|---|------|
| F1 | Export OpenTelemetry (span già disponibili in pi) |
| F2 | Suite di eval + comando `/eval` |
| G4 | Vista progetto/artefatti |
| G1 | Voce (dictation + TTS) |
| E4 | `media/compliance.md` con date verificate |
| E5 | Multi-tenant: isolamento per ospite + quote |
| B5 | "Salva come skill" dalle risposte riuscite |
| G5 | Agenda always-on |
| D5 | Workspace multi-progetto |
| A3/A5 | Chrome DevTools MCP per perf; computer use desktop (solo se serve) |
| B3/G6/G7 | Client MCP, A2A, MCP Apps — opportunità, non urgenze |

---

## 4. Il consiglio di fondo

Guardando le notizie di questa settimana (Claude Code Projects con memoria/goal/artefatti
condivisi, Agents API di OpenAI che vende **l'harness**, CC di Google, Muse di Meta, Grok Bot
con voce) emerge una cosa sola: **il 2026 non è l'anno del modello migliore, è l'anno
dell'harness migliore**. Tutti stanno convergendo sulle stesse quattro primitive:

1. **contesto gestito bene** (memoria + compaction ispezionabile)
2. **tool ad alta leva** (browser, shell, file) con **gate di approvazione**
3. **orchestrazione durevole** (goal, subagent, run che sopravvivono al riavvio)
4. **osservabilità + eval** (per sapere se ha davvero funzionato)

Il vostro harness ha **già** l'ossatura di tutti e quattro (estensioni con hook bloccanti,
media-guard, subagent dietro interruttore, cron, goal, skill, SSE). La mossa con il miglior
rapporto valore/rischio non è aggiungere il browser: è **mettere il gate di approvazione
(E1+B1) e poi aggiungere il browser (A1+A2)**, perché il browser moltiplica la superficie di
rischio e il gate è ciò che vi permette di usarlo con serenità — e con ospiti.

---

### Fonti principali consultate

**Browser agent**
- Computer Use and GUI Agents in 2026: State of the Art — https://zylos.ai/research/2026-02-08-computer-use-gui-agents/
- Browser-using AI agents in 2026: production patterns — https://www.reactify-solutions.com/articles/browser-agents-production-2026
- AI browser agents in 2026: what they can and can't do — https://www.managed-code.com/blog-post/ai-browser-agents-2026
- Wuying-Browser-Agent: Long-Horizon Browser Agents (arXiv 2608.17319) — https://arxiv.org/abs/2608.17319
- vercel-labs/agent-browser — https://github.com/vercel-labs/agent-browser
- microsoft/Playwright-MCP — https://github.com/microsoft/Playwright-MCP
- Chrome DevTools MCP vs Playwright MCP (2026) — https://www.trackingplan.com/blog/chrome-devtools-mcp-vs-playwright-mcp-digital-analysts

**Protocolli (MCP, A2A)**
- MCP 2026-07-28 spec: stateless core — https://claude.com/blog/bringing-mcp-2026-07-28-to-claude
- MCP client features: Elicitation in, Roots/Sampling deprecated — https://www.gptmap.org/en/posts/mcp-client-features
- MCP Apps Explained (2026) — https://www.ayautomate.com/blog/mcp-apps
- A2A v1.0 e ingresso nella Agentic AI Foundation — https://waxell.ai/blog/a2a-agentic-ai-foundation-agent-identity

**Memoria e contesto**
- Memory as Infrastructure (arXiv 2609.05510) — https://arxiv.org/abs/2609.05510
- Context as an Environment (arXiv 2608.21690) — https://arxiv.org/abs/2608.21690
- Context Engineering for Long-Running AI Agents — https://zylos.ai/research/2026-06-20-context-engineering-long-running-agents/

**Sicurezza, HITL, sandbox**
- Human-in-the-Loop Approval Flow Pattern (2026) — https://www.agentnative.dev/patterns/human-in-the-loop-approval-flow-pattern
- Human-in-the-Loop Tool Calling: Approval Gates — https://www.scalekit.com/blog/human-in-the-loop-tool-calling
- HITL Placement: Where and How to Supervise — https://agentpatterns.ai/workflows/human-in-the-loop/
- Sandboxing Agents That Can Write Code — https://tianpan.co/blog/2026/04/19/sandboxing-agents-least-privilege-tool-calling
- AI Agent Sandboxes: Secure Code Execution Guide 2026 — https://noqta.tn/en/blog/ai-agent-sandbox-secure-code-execution-2026

**Osservabilità ed eval**
- Agent Observability: OpenTelemetry Traces for Tool Calls — https://appropri8.com/blog/2026/01/19/agent-observability-opentelemetry-traces/
- Evaluate any agent framework with AgentCore Evaluations — https://aws.amazon.com/blogs/machine-learning/evaluate-any-agent-framework-with-amazon-bedrock-agentcore-evaluations/

**Governance**
- Implementation Guidance for the EU AI Act (Commissione) — https://futurium.ec.europa.eu/system/files/2026-07/Implementation-Guidance-EU-AI-Act_1.pdf
- EU AI Act for AI Agents in Production (date aggiornate) — https://www.aurorasre.ai/blog/eu-ai-act-ai-agents-production

**Novità prodotto settembre 2026**
- Claude Code Projects — https://www.theverge.com/ai-artificial-intelligence/997134/anthropic-claude-code-projects
- Introducing the Agents API (OpenAI, 10/09/2026) — https://openai.com/index/introducing-the-agents-api/
- Meta's Muse hits Mac (18/09/2026) — https://techcrunch.com/2026/09/18/metas-muse-hits-mac-letting-the-ai-take-actions-on-your-computer/
- Google Labs: CC per famiglie — https://blog.google/innovation-and-ai/models-and-research/google-labs/cc-expanding-to-groups/
- Computer use in Gemini 3.5 Flash — https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-computer-use-gemini-3-5-flash/
