import fs from "node:fs";

const description = [
  "Rendere l'agente capace di usare un browser vero e di essere pilotato come strumento di lavoro quotidiano. Copre la sezione A (BROWSER & COMPUTER USE) e la sezione G (INTERFACCIA E MODALITÀ D'USO) di media/integrazioni-agentiche-2026.md.",
  "Strumento scelto: agent-browser (CLI Rust su Chrome DevTools Protocol, snapshot a11y con ref @eN), esposto come UN SOLO tool browser con action enum, più skill in skills/ (snapshot-first).",
  "VERIFICHE DEL 18/09/2026, entrambe verbalizzate in media/verifica-integrabilita-browser-ui.md (analisi statica del codice) e media/verifica-empirica-browser.md (esecuzione reale, 4 spike su 4 superati).",
  "CONFERMATO DAI TEST: il tool custom da estensione INLINE funziona e il modello lo chiama davvero (ping -> pong:ciao); un tool che esegue una CLI esterna funziona (cli_probe -> cli-ok:abc); il gate ON/OFF come l'interruttore subagent rimuove i tool dalla lista; dopo session.reload() il tool custom e web_search convivono; open/snapshot/click/close funzionano end-to-end; lo stream WebSocket e la porta DevTools restano su 127.0.0.1.",
  "TRE VINCOLI OPERATIVI SCOPERTI E RECEPITI: (V1) come root agent-browser parte e funziona SENZA errori ma con la sandbox DISATTIVATA in silenzio (verificato con chrome://sandbox: Layer None, PID/Network namespaces No, Seccomp-BPF No, 'You are NOT adequately sandboxed'), mentre come utente pi-browser con profilo AppArmor la sandbox è completa (Namespace, Yes, Yes, 'adequately sandboxed'): il tool deve quindi invocare sempre sudo -u pi-browser e rifiutarsi di girare come root. (V2) i ref dello snapshot NON sono stabili e non ripartono da e1 (osservati e1/e2, e18/e19, e3/e4): la skill deve imporre di usare i ref dello snapshot corrente e di rifare lo snapshot dopo ogni navigazione. (V3) una sessione headless costa ~1,7 GB di RAM (19 processi Chrome): limite pratico 1-2 sessioni concorrenti.",
  "SCOPERTA CHE RIDUCE IL LAVORO: registerTool richiede formalmente TypeBox ma a runtime basta uno schema JSON puro (nessuna dipendenza nuova), e agent-browser include 9 skill native bundle (core, dogfood, derive-client, slack, electron, agentcore, vercel-sandbox, webmcp-gen, protected-vercel-deployments) utilizzabili con 'skills get'.",
  "VINCOLO ASSOLUTO: nessuna misura di sicurezza introdotta da questo goal deve impedire o ostacolare l'accesso del proprietario. I gate valgono esclusivamente per le AZIONI DELL'AGENTE, mai per l'accesso umano: dalla dashboard, dal file manager, dall'editor e dalle sessioni il proprietario continua a leggere e modificare qualsiasi file della root (.env, .ssh, .pi inclusi) senza prompt di approvazione né accesso negato che prima non esistevano. Verificato per architettura: gli hook sui tool vivono nella sessione dell'agente, l'accesso umano passa da endpoint HTTP che non transitano da nessun hook.",
].join(" ");

const payload = {
  id: "7af1695f7d3f5f6f",
  title: "Capacità agentiche: browser reale (A) + interfaccia e modalità d'uso (G)",
  description,
  status: "active",
  steps: [
    { id: "backup", title: "Backup ripristinabile con sha256 (goals.json, dashboard.mjs, dashboard.html, README, .env di riferimento) + percorso di rollback scritto", done: false },
    { id: "ricognizione", title: "Ricognizione e verifica di integrabilità COMPLETATE: 8 agganci su 8 confermati nel codice; tool inline, esecuzione CLI, gate ON/OFF, convivenza tool custom + web_search dopo reload, e ciclo open/snapshot/click/close provati eseguendo davvero (vedi media/verifica-empirica-browser.md)", done: true },
    { id: "firewall-utente", title: "STEP 0: utente pi-browser (uid 997, senza sudo) e profilo AppArmor /etc/apparmor.d/agent-browser-chrome GIÀ creati e provati (Chrome con sandbox Namespace+Seccomp). RESTA: ufw default deny con 22/80/443 e prova di accesso senza chiudersi fuori dall'SSH", done: false },
    { id: "vista-progetto", title: "G4: vista progetto/artefatti — i file di media/ come output principale del lavoro e la chat come strumento (rischio tecnico basso, valore immediato, nessun privilegio nuovo)", done: false },
    { id: "agenda", title: "G5: agenda always-on — timeline unica con pianificazioni cron, goal attivi, run recenti e approvazioni in attesa", done: false },
    { id: "install", title: "agent-browser 0.38.1 PINNATO + Chrome for Testing 153 installati come utente dedicato (postinstall con --allow-scripts, dipendenze con --with-deps); RAM misurata ~1,7 GB per sessione e procedura di disinstallazione documentata", done: true },
    { id: "tool", title: "A1b: esporre il browser come UN SOLO tool (action: open|snapshot|click|fill|type|press|scroll|get|screenshot|pdf|eval|close) che invoca la CLI con 'sudo -u pi-browser' OBBLIGATORIO. Come root la CLI parte ma senza sandbox e senza errori (V1). Nessuna dipendenza nuova: lo schema JSON puro funziona", done: false },
    { id: "limiti", title: "Limiti operativi PRIMA di qualsiasi autenticazione: massimo 1-2 sessioni concorrenti (1,7 GB RAM ciascuna, misurato), timeout per comando, chiusura forzata delle sessioni orfane, pulizia del profilo", done: false },
    { id: "skill-browser", title: "A2+A6: usare le 9 SKILL NATIVE bundle di agent-browser (skills get core / dogfood) invece di riscrivere istruzioni che andrebbero fuori sincrono con la versione CLI, aggiungendo solo le regole specifiche: snapshot-first e ref validi solo per lo snapshot corrente (V2)", done: false },
    { id: "porte", title: "Verifica porte COMPLETATA: stream WebSocket e porta DevTools su 127.0.0.1 (loopback), nessuna porta nuova su 0.0.0.0 (confermato con ss -tlnp)", done: true },
    { id: "ui-live", title: "G2: live view esposta SOLO su 443 via Caddy con Basic auth (lo stream è già su loopback: resta da cablare il proxy) e pulsante prendi/restituisci il controllo con lock anti-conflitto", done: false },
    { id: "budget", title: "Tetto di spesa per run con hard-stop, dato che il browsing consuma molti token (snapshot lunghi, pagine grandi, loop)", done: false },
    { id: "profilo", title: "A4: profilo Chrome persistente + login assistito SOLO DOPO i limiti; la CLI offre già auth save/list/delete con --password-stdin, valutare quello invece di reinventarlo. Permessi 700, utente dedicato, mai il profilo personale", done: false },
    { id: "approvazioni", title: "G3 ridisegnato per iOS: Safari scarta le notification actions, quindi notifica con tap + deep link a un pannello di approvazione a un tap (o link firmato monouso a scadenza breve) invece di pulsanti nella notifica", done: false },
    { id: "voce", title: "G1: dettatura e sintesi vocale come due funzionalità separate e disattivabili, testate su iPhone all'inizio e non alla fine, con fallback di trascrizione lato server se la Web Speech API si conferma inaffidabile", done: false },
    { id: "test", title: "Test su istanza isolata (DASH_SESSION_DIR=/tmp/pi-test/sessions), aggiornamento di test-static.mjs, test-ui.mjs e test-api.sh alle nuove viste ed endpoint, più prova reale da iPhone", done: false },
    { id: "deploy", title: "Riavvio della produzione e verifica finale su https://harness.universalisproduzioni.it (browser, voce, approvazioni, agenda, accesso del proprietario invariato)", done: false },
  ],
  checklist: [
    { id: "c1", text: "Backup verificato con sha256 prima di ogni modifica, con percorso di rollback scritto", done: false },
    { id: "c2", text: "VINCOLO: nessuna protezione limita l'accesso del proprietario — i gate valgono solo per le azioni dell'agente, mai per l'accesso umano a dashboard, file manager, editor e sessioni", done: false },
    { id: "c3", text: "VINCOLO: il proprietario continua a leggere e modificare dalla dashboard qualsiasi file della root (.env, .ssh, .pi inclusi), senza prompt di approvazione né accesso negato che prima non esistevano", done: false },
    { id: "c4", text: "VINCOLO: se viene introdotta una deny-list, è documentata, elencata in un file visibile e disattivabile dal proprietario con un interruttore", done: false },
    { id: "c5", text: "Nessun endpoint esistente rotto (contratti invariati); ogni endpoint nuovo documentato nel README", done: false },
    { id: "c6", text: "Il profilo browser e i suoi cookie restano fuori dai backup oppure cifrati; permessi 700 e proprietà dell'utente dedicato", done: false },
    { id: "c7", text: "Il browser non resta mai appeso: limite di sessioni, timeout e chiusura delle sessioni orfane verificati", done: false },
    { id: "c8", text: "Chrome gira con sandbox ATTIVA: utente dedicato senza sudo più profilo AppArmor /etc/apparmor.d/agent-browser-chrome (PROVATO: Namespace+Seccomp=Yes come pi-browser, None come root). MAI --no-sandbox e mai come root: come root la CLI parte senza errori ma SENZA sandbox", done: false },
    { id: "c9", text: "Le richieste di approvazione e le domande dell'agente non congelano la chat: la risposta in corso resta interrompibile con il pulsante stop", done: false },
    { id: "c10", text: "Nessuna regressione su web_search, fetch_content, source_check, skill e subagent dopo le modifiche al system prompt e ai tool", done: false },
    { id: "c11", text: "Consumo RAM verificato con free -m sotto carico reale e limite documentato (misurato: ~1,7 GB per sessione, quindi max 1-2 sessioni concorrenti)", done: false },
    { id: "c12", text: "Funziona da iPhone con le limitazioni REALI verificate: G3 senza notification actions (Safari le scarta) e G1 con dettatura e TTS indipendenti; nessuna feature data per funzionante senza prova su dispositivo", done: false },
    { id: "c13", text: "Nessuna porta nuova in ascolto su 0.0.0.0 (VERIFICATO con ss -tlnp: stream e DevTools su 127.0.0.1); il live view del browser passa solo da Caddy 443 con Basic auth (cablaggio ancora da fare)", done: false },
    { id: "c14", text: "Firewall attivo: ufw default deny con 22/80/443 consentite e accesso verificato dopo l'attivazione (senza chiudersi fuori dall'SSH)", done: false },
    { id: "c15", text: "Tetto di spesa per run con hard-stop attivo e verificato", done: false },
    { id: "c16", text: "Versione di agent-browser pinnata (0.38.1, fatto) e procedura di disinstallazione documentata e provata", done: false },
    { id: "c17", text: "Nessun profilo personale usato dall'agente; il profilo autenticato non viene riutilizzato dopo operazioni sensibili", done: false },
    { id: "c18", text: "Le azioni di scrittura dell'agente su siti autenticati passano da un gate di approvazione, perché il profilo persistente è per definizione accessibile all'agente (compromesso strutturale, non un bug)", done: false },
    { id: "c19", text: "Il tool browser rifiuta di eseguire come root e verifica lo stato della sandbox (chrome://sandbox deve dire 'adequately sandboxed'): come root agent-browser parte e funziona senza errori ma la sandbox è disattivata in silenzio", done: false },
    { id: "c20", text: "La skill impone di usare i ref dello snapshot corrente e di rifare lo snapshot dopo ogni navigazione: i ref non ripartono da e1 e non sono stabili (verificato)", done: false },
    { id: "c21", text: "Le skill native bundle di agent-browser (skills get core / dogfood) sono collegate invece di duplicare istruzioni che andrebbero fuori sincrono con la versione della CLI", done: false },
    { id: "c22", text: "Il costo in RAM per sessione browser è documentato e il limite di sessioni concorrenti è rispettato e verificato con free -m", done: false },
  ],
};

fs.writeFileSync("/tmp/goal-update.json", JSON.stringify(payload));
console.log("payload:", payload.steps.length, "step /", payload.checklist.length, "controlli /", description.length, "caratteri");
