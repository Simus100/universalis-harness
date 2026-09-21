# Verifica di integrabilità — browser (A) + interfaccia (G)

Data: 18/09/2026 · Goal: `7af1695f7d3f5f6f`
Metodo: ispezione del codice reale (`dashboard.mjs`, `dashboard.html`, `sw.js`, `media/commands.mjs`,
`media/test-static.mjs`) + verifica dell'ambiente (OS, kernel, porte, firewall, utenti, pacchetto npm).
Nessuna modifica al servizio in produzione durante la verifica.

---

## 1. Quadro delle evidenze

| # | Componente del piano | Punto di aggancio trovato | Evidenza | Verdetto |
|---|----------------------|---------------------------|----------|----------|
| 1 | Tool `browser` (A1b) | Estensioni inline con `extensionFactories` | `dashboard.mjs:424` `extensionFactories: [MEDIA_GUARD_EXT]`; `MEDIA_GUARD_EXT` a `:251` con `factory: (pi) => { pi.on("tool_call", ...) }` | ✅ aggancio pronto · ⚠️ `registerTool` da estensione **inline** da verificare empiricamente |
| 2 | Interruttore + controllo costi (spento di default) | `applyToolGate()` filtra i tool per nome | `dashboard.mjs:455-459`: `if (!subagentsEnabled) tools = tools.filter((t) => !SUBAGENT_TOOL_NAMES.has(t.name)); session.agent.state.tools = tools` | ✅ replicabile 1:1 per il tool `browser` |
| 3 | Approvazioni / domande in chat (G3) | `broadcast(event, data)` con evento arbitrario | `dashboard.mjs:561` + dispatcher client su `ev.type` (`dashboard.html:~1490`) | ✅ pronto: basta un evento nuovo |
| 4 | Vista progetto/artefatti (G4), Agenda (G5) | Pattern `showTab` + `body[data-tab=…]` | `dashboard.html:399-410` (CSS), `:1011-1055` (`#chatView/#filesView/#goalsView/#cronView/#skillsView`), `:2064` `showTab()` | ✅ pattern consolidato · ⚠️ ogni vista si aggiunge in **3 punti** (CSS, HTML, `showTab`) + voce nel menu "features" |
| 5 | Notifiche con approvazione (G3, iOS) | `notificationclick` senza `event.action` | `sw.js`: `for (const c of list) { if ("focus" in c) return c.focus(); } ... openWindow("/")` | ✅ il design deep-link si aggancia al codice esistente (`event.notification.data`) |
| 6 | Comandi slash nuovi (`/browser`, `/eval`) | Registro dichiarativo con gruppi e params dinamici | `media/commands.mjs`: `COMMAND_GROUPS`, `params[].dynamic`, `client: true/false` | ✅ banale da estendere |
| 7 | Aggiornare la sessione senza cambiare chat | `session.reload()` e `resourceLoader.reload()` | `dashboard.mjs:1646`, `:499`, nota di fix a `:492` sulla cache estensioni | ✅ esiste · ⚠️ va ritestato con il nuovo tool |
| 8 | Guardrail contro le regressioni | `test-static.mjs` verifica id JS↔HTML, endpoint client↔server, cablaggio | `media/test-static.mjs:1-45` | ✅ perfetto per questo lavoro: va **esteso**, non riscritto |

---

## 2. Il vincolo dell'accesso del proprietario: rispettato **by design**

Verifica architetturale, non promessa: un gate sui tool dell'agente **non può** toccare il vostro
accesso, perché sono due percorsi separati.

- Gli hook (`pi.on("tool_call")`) vivono dentro la sessione dell'agente: riguardano solo le
  chiamate che **l'agente** fa ai suoi tool (`bash`, `read`, `write`, `browser`, …).
- Il vostro accesso passa da endpoint HTTP della dashboard (`/api/file`, `/api/file/delete`,
  `/api/download`, `/api/sessions/…`) che non transitano da nessun hook di pi.

Conseguenza: c2 e c3 del goal sono soddisfacibili **strutturalmente**, senza contorsioni. L'unica
cosa da non fare è aggiungere un controllo *dentro* gli handler di `/api/file` — cioè esattamente
quello che il piano non prevede.

---

## 3. Rischi di integrazione specifici (emersi dall'ispezione, non generici)

### 3.1 `applyToolGate` può cancellare il tool `browser`
`applyToolGate()` **sovrascrive** `session.agent.state.tools`. Se il tool `browser` non viene
registrato in `ALL_TOOLS` e gestito nel gate, al primo cambio dell'interruttore subagent sparisce
(o non entra mai). Va trattato come cittadino di prima classe del gate, con la sua variabile
(`browserEnabled`) accanto a `subagentsEnabled`.

### 3.2 `registerTool` da estensione inline: documentato per le estensioni da file
Le doc di pi descrivono `pi.registerTool()` per estensioni caricate da `~/.pi/agent/extensions/`.
Il vostro `media-guard` è **inline** (`extensionFactories`) e usa solo `pi.on`. È molto probabile
che l'oggetto `pi` sia lo stesso e che `registerTool` funzioni, ma **non è verificato**.
→ **Spike 1** (10 minuti, nessun privilegio nuovo, nessuna installazione).

### 3.3 Effetti collaterali di `media-guard` sul nuovo tool
`media-guard` intercetta `tool_call` per `write` e `bash`. Il tool `browser` ha un nome diverso,
quindi **non viene toccato** → nessun conflitto. Ma il gate di approvazione (c18) dovrà gestire
esplicitamente anche `browser`, altrimenti le azioni di scrittura su siti autenticati restano
non gated.

### 3.4 Permessi incrociati CLI ↔ dashboard
Se la CLI gira come utente dedicato (`sudo -u pi-browser`), il profilo e i suoi file sono di
`pi-browser` con permessi 700. La dashboard gira come **root**, quindi può leggere lo stream;
ma il binario deve essere raggiungibile e la regola `sudoers` dev'essere **stretta** (un solo
comando, non `ALL`). Da progettare insieme allo step 0.

### 3.5 Bind address dello stream del browser: **non verificato**
Il README di `agent-browser` documenta `stream enable [--port <port>]` ma **non specifica su quale
interfaccia** ascolti. Dato che `ufw` è inattivo, se ascoltasse su `0.0.0.0` avreste il browser
(con le vostre sessioni) raggiungibile da internet **senza Basic auth**: c13 non è soddisfatto
finché non lo si verifica con `ss -tlnp` a servizio avviato.
→ **Spike 3** (dopo lo step 0).

### 3.6 `session.reload()` e cache delle estensioni
Il commento a `dashboard.mjs:492` segnala che `resourceLoader.reload()` **azzera la cache delle
estensioni** e che c'è già stato un fix su questo. Aggiungere un'estensione inline e poi ricaricare
la sessione (necessario perché il modello veda il nuovo tool) rientra in quella zona delicata:
va testato che dopo `reload()` il tool `browser` e `web_search` convivano, come già verificato per
il subagent (era il controllo c3 del goal precedente).

### 3.7 Viste: aggiunta in tre punti, non in uno
`showTab()` elenca esplicitamente ogni vista (`$("filesView").hidden = ...`) e le voci nel menu
"features" sono cablate a mano. G4 e G5 = 3 modifiche ciascuna + 1 voce di menu. Non è un problema,
ma è un punto in cui è facile dimenticare un pezzo: **`test-static.mjs` lo becca**, a patto di
estenderlo con i nuovi id ed endpoint.

### 3.8 Ambiente: la sandbox di Chrome è il vero ostacolo
- Ubuntu **24.04.5**, kernel 6.8, dashboard eseguita come **root**.
- `kernel.apparmor_restrict_unprivileged_userns = 1` → i processi non privilegiati non possono
  creare user namespace senza profilo AppArmor → **la sandbox di Chrome non parte nemmeno con
  utente dedicato** senza profilo AppArmor.
- `ufw` **inattivo**; in ascolto: `22` (pubblico), `80/443` (Caddy), `127.0.0.1:8420` (dashboard),
  `127.0.0.1:2019` (admin Caddy), `127.0.0.1:18789` (altro node, non nostro).
- Utenti: `root`, `ubuntu` (1000, sudo), `admin` (1001, sudo) → un utente dedicato **senza sudo**
  va creato da zero.
- Pacchetto npm verificato: `agent-browser@0.38.1`, publisher `vercel-release-bot` / `zeit-bot`,
  repo `vercel-labs/agent-browser` → **autentico**, ma **0.x** = API instabili → pinnare.

---

## 4. Spike da fare prima di impegnare il piano

| Spike | Cosa verifica | Costo | Rischio se non fatto |
|-------|---------------|-------|----------------------|
| **1** | `pi.registerTool()` da `extensionFactories` inline: un'estensione di prova registra un tool `ping`, con gate in `applyToolGate` | ~10 min, **nessun privilegio nuovo, nessuna installazione** | scoprire a metà lavoro che il tool va registrato come estensione da file → riprogettare lo step 7 |
| **2** | Profilo AppArmor per Chrome + utente dedicato senza sudo: Chrome parte **con sandbox** e con `--no-sandbox` assente | ~30 min, tocca il sistema (step 0) | installare Chrome e scoprire che serve `--no-sandbox` → root esposto su un host di produzione |
| **3** | Bind address reale dello stream: `ss -tlnp` con `agent-browser stream enable` attivo | ~15 min, **dopo lo step 0** | esporre il controllo del browser (e delle sessioni autenticate) su internet senza auth |

**Spike 1 va fatto adesso**: è l'unico che non tocca privilegi né installa nulla, e sblocca la
fattibilità dello step 7. Gli spike 2 e 3 richiedono lo step 0 (firewall + utente dedicato).

---

## 5. Conclusione

**Integrabilità: alta.** 8 agganci su 8 verificati come esistenti nel codice; il pattern per il
tool opzionale con interruttore (`applyToolGate`) è già scritto e va solo replicato; il pattern
delle viste è collaudato (5 viste esistenti); SSE, comandi e service worker sono pronti.

**Il vincolo sull'accesso del proprietario è rispettato per architettura**, non per promessa:
tool dell'agente e accesso umano sono percorsi separati.

**I rischi veri non sono nel codice ma nell'ambiente**: Chrome come root su Ubuntu 24.04 con la
sandbox bloccata da AppArmor, e l'assenza di firewall davanti a uno stream che potrebbe ascoltare
su tutte le interfacce. Sono entrambi risolvibili, ma **lo step 0 non è opzionale**.

**Ordine consigliato, confermato dall'ispezione:**
1. **Spike 1** ora (nessun rischio) → conferma il tool `browser`.
2. **G4 + G5** ora (UI pura: nessun privilegio nuovo, valore immediato, `test-static` a protezione).
3. **Step 0** (firewall + utente dedicato + AppArmor) → poi **spike 2 e 3**.
4. Solo dopo: installazione, tool, limiti, sola lettura, live view.
5. Il profilo autenticato per ultimo, dopo budget e gate di approvazione.
