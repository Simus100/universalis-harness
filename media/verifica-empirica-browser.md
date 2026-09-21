# Verifica EMPIRICA — browser (A) + interfaccia (G)

Data: 18/09/2026 · Segue: `verifica-integrabilita-browser-ui.md` (analisi statica del codice)
Metodo: esecuzione reale su istanza isolata + installazione reale di `agent-browser`

**Esito complessivo: 4 spike su 4 superati.** L'integrazione non è solo progettabile: è stata
provata end-to-end. Sono emersi 3 vincoli operativi che il piano non prevedeva e che ora
sono recepiti nel goal.

---

## 1. Spike 1 — tool custom da estensione INLINE ✅ SUPERATO

| Prova | Esito |
|-------|-------|
| `pi.registerTool()` dentro `extensionFactories` (inline, come `media-guard`) | ✅ il tool compare in `session.agent.state.tools` |
| Il **modello chiama davvero** il tool custom | ✅ `ping` → restituito `pong:ciao` |
| Tool custom che **esegue una CLI esterna** (pattern agent-browser) | ✅ `cli_probe` → `cli-exec` → `cli-ok:abc` |
| Gate ON/OFF come l'interruttore subagent | ✅ con `DASH_SPIKE_TOOLS` assente i tool **spariscono** dalla lista inviata |
| `session.reload()` (innescato creando una skill) | ✅ dopo il reload `ping` → `pong:dopo-reload` **e** `web_search` → Lisbona + 5 fonti: **convivono** |

Tool effettivi con gate ON:
```
read, bash, edit, write, web_search, source_check, fetch_content, get_search_content, ping, cli_probe
```
Con gate OFF:
```
read, bash, edit, write, web_search, source_check, fetch_content, get_search_content
```

### Scoperta 1a — `typebox` non serve
`registerTool` richiede formalmente `parameters: TSchema` (TypeBox). A runtime però TypeBox
produce **JSON Schema puro** (`{"type":"object","required":["text"],"properties":{...}}`, zero
symbol). Verificato: uno **schema JSON scritto a mano funziona identicamente** — il modello ha
passato i parametri e la validazione è passata.
→ Conclusione: **nessuna dipendenza nuova** per il tool `browser`.
(Se si volesse TypeBox per i tipi TS, `createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"))("typebox")` lo risolve dal contesto di pi — verificato — perché è una dipendenza **annidata**.)

### Scoperta 1b — `reloadSkills()` è già pronto per il gate
`dashboard.mjs` (in `reloadSkills`) fa già: `ALL_TOOLS = session.agent.state.tools.slice()` →
`applyToolGate()`. Quindi un tool nuovo viene **ri-gestito automaticamente** dopo ogni reload.

---

## 2. Spike 2 — sandbox di Chrome ✅ SUPERATO (con procedura nuova)

Installazione: `npm i -g agent-browser@0.38.1` (pinnato) → il `postinstall` è bloccato dalle
policy npm, va completato con `--allow-scripts=agent-browser`; poi `agent-browser install`
(Chrome for Testing **153.0.8010.52**, 187 MB) e `--with-deps` per le librerie di sistema.

### Il problema (confermato, non ipotizzato)
Con **utente non privilegiato** e Ubuntu 24.04:
```
FATAL:zygote_host_impl_linux.cc:129] No usable sandbox!
If you are running on Ubuntu 23.10+ ... disabled unprivileged user namespaces with AppArmor
```
Causa: `kernel.apparmor_restrict_unprivileged_userns = 1`.

### La soluzione (provata)
Utente dedicato senza sudo + **profilo AppArmor**:
```
/etc/apparmor.d/agent-browser-chrome
────────────────────────────────────
abi <abi/4.0>,
include <tunables/global>
profile agent-browser-chrome /home/pi-browser/.agent-browser/browsers/chrome-*/chrome flags=(unconfined) {
  userns,
  include if exists <local/agent-browser-chrome>
}
```
`apparmor_parser -r /etc/apparmor.d/agent-browser-chrome` → Chrome parte **senza `--no-sandbox`**.

### ⚠️ Scoperta 2a — IL RISCHIO R1 È UN FALLIMENTO **SILENZIOSO**
`chrome://sandbox`, confronto diretto fra le due modalità:

| | come **root** | come **pi-browser** |
|---|---|---|
| Layer 1 Sandbox | **None** | **Namespace** |
| PID namespaces | **No** | **Yes** |
| Network namespaces | **No** | **Yes** |
| Seccomp-BPF sandbox | **No** | **Yes** |
| Verdetto del browser | **"You are NOT adequately sandboxed"** | **"You are adequately sandboxed"** |

La modalità root **non emette alcun errore**: stampa `[agent-browser] launched browser` e
funziona apparentemente bene. Chi non controlla `chrome://sandbox` non se ne accorge.
Su un host che ospita il sito in produzione, la dashboard con il `.env` e l'istanza ospiti,
questo significa: un exploit del renderer (innescabile da una pagina web qualsiasi) → **root sull'host**.

→ **Conseguenza per il tool**: deve invocare **sempre** `sudo -u pi-browser` e **rifiutarsi di
girare come root**. Non basta "usare un utente dedicato": serve la verifica attiva.

---

## 3. Spike 3 — bind dello stream ✅ SUPERATO

`agent-browser` avvia lo streaming automaticamente. Porte osservate con `ss -tlnp`:
```
LISTEN  127.0.0.1:42433   agent-browser-l   (stream WebSocket)
LISTEN  127.0.0.1:33411   chrome            (DevTools)
```
**Loopback, nessuna porta su `0.0.0.0`.** Confermato anche dal `--help`: *"If `--port` is omitted,
agent-browser binds an available localhost port automatically"*. Il rischio 3.5 è chiuso —
`c13` è soddisfatto by design, resta da riverificare a ogni aggiornamento.

---

## 4. Flusso funzionale completo ✅ SUPERATO

| Passo | Comando | Esito |
|-------|---------|-------|
| Apri | `open https://example.com` | ✅ |
| Snapshot a11y | `snapshot` | ✅ `heading "Example Domain" [level=1, ref=e1]`, `link "Learn more" [ref=e2]` |
| Leggi | `read` | ✅ testo pulito |
| Azione | `click @e21` → poi `get url` | ✅ navigato a `https://www.iana.org/help/example-domains` |
| Chiudi | `close --all` | ✅ 0 processi Chrome residui |

### ⚠️ Scoperta 4a — i ref NON sono stabili
Dopo `open`, i ref erano `e18`/`e19`; in un'altra sessione `e1`/`e2`; su `chrome://sandbox` `e3`/`e4`.
**Non ripartono da `e1` e non sono prevedibili.** Un modello che indovina `@e1` fallisce
(`✗ Unknown ref: e2`). La skill **deve** dire: *usa i ref dello snapshot corrente, rifai lo
snapshot dopo ogni navigazione*. Senza questa istruzione il tool è inutilizzabile di fatto.

### ⚠️ Scoperta 4b — costo in RAM alto
Una sessione headless = **19 processi Chrome ≈ 1,7 GB RSS**. Con 12 GB totali (10,5 GB liberi)
il limite sensato è **1–2 sessioni concorrenti**, non 3.

---

## 5. Scoperta bonus — 9 skill native già incluse

`agent-browser skills list` espone skill **bundle, sempre allineate alla versione della CLI**:
`core`, `dogfood` (esplora e testa una web app per trovare bug), `derive-client`
(reverse-engineer di API interne), `slack`, `electron`, `agentcore`, `vercel-sandbox`,
`webmcp-gen`, `protected-vercel-deployments`.

→ **A6 si semplifica molto**: invece di scrivere `browser-*` da zero, si può esporre il
contenuto delle skill native (`agent-browser skills get core`) e aggiungere solo le regole
specifiche (sudo -u, snapshot-first, ref non stabili). Il contenuto resta **in sincrono con la CLI**.

Altri comandi utili emersi: `mcp` (server MCP stdio pronto), `auth save/list` (profili auth
integrati, con `--password-stdin`), `record start` (video), `profiler start`, `network`,
`cookies get|set|clear`, `connect <port|url>` (agganciarsi a un Chrome esistente).

---

## 6. Modifiche fatte al sistema (da sapere)

| Modifica | Reversibile con |
|----------|-----------------|
| `agent-browser@0.38.1` globale (`/usr/lib/node_modules`) | `npm uninstall -g agent-browser` |
| Dipendenze di sistema Chrome (`apt`, via `install --with-deps`) | `apt autoremove` mirato (elenco non tracciato) |
| Utente `pi-browser` (uid 997, **senza sudo**) | `userdel -r pi-browser` |
| Profilo `/etc/apparmor.d/agent-browser-chrome` | `apparmor_parser -R <file>` + `rm` |
| Chrome for Testing 153 (187 MB × 2: in `/home/pi-browser` e `/root`) | `rm -rf ~/.agent-browser` |

Nessuna modifica a `dashboard.mjs`, `dashboard.html`, `media/` di produzione, `ufw` o servizi.
L'istanza di spike (porta 8455, `/tmp/pi-spike`) è stata spenta: **porte 8420 e produzione intatte
(HTTP 200)**.

---

## 7. Cosa NON è stato verificato (onestà)

| Elemento | Stato |
|----------|-------|
| G4/G5 (viste progetto e agenda) | Solo **ispezione del codice**: il pattern `showTab` + `body[data-tab]` è ripetuto 5 volte, rischio basso. Non provato a schermo. |
| G3 approvazioni su iPhone | Solo letteratura: Safari scarta le `notification actions`. Non provato su dispositivo. |
| G1 voce su iPhone | Solo letteratura (supporto parziale + bug WebKit con l'audio). Non provato. |
| `ufw` | **Non attivato di proposito**: attivarlo senza regole SSH corrette significa perdere l'accesso. Richiede i comandi espliciti dello step 0. |
| Live view / takeover (`connect`, G2) | Non provato: richiede di cablare il proxy Caddy. Il bind è verificato, l'integrazione UI no. |
| Disinstallazione completa | Non provata (procedura indicata in tabella). |
| Tetto di spesa (c15) | Non implementato: nessun meccanismo esiste oggi. |

---

## 8. Verdetto

| Domanda | Risposta |
|---------|----------|
| L'integrazione è **implementabile**? | ✅ **Sì, provato**: tool custom inline + esecuzione CLI + azioni browser + gate + reload, tutto funzionante end-to-end. |
| Il browser funziona **su questo host**? | ✅ **Sì**, con utente dedicato + profilo AppArmor: sandbox completa (Namespace + Seccomp-BPF). |
| Ci sono **sorprese**? | Sì, tre, tutte gestibili: (1) come root la sandbox è disattivata **in silenzio**, (2) i ref non sono stabili, (3) 1,7 GB di RAM per sessione. |
| Serve altro lavoro imprevisto? | Solo lo **step 0** (già parzialmente eseguito): resta `ufw` e il cablaggio del gate nel tool. |

**Prossimo passo concreto**: lo step 0 è ora una procedura provata, non una stima. L'ordine
naturale è: gate del tool `browser` con `sudo -u` obbligatorio + controllo automatico della
sandbox (le fondamenta), poi `ufw`, poi la skill basata sui bundle nativi.
