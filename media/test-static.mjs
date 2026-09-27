/**
 * Controlli statici di coerenza tra dashboard.html e dashboard.mjs:
 *  - ogni id usato da $("id") esiste nell'HTML
 *  - ogni endpoint chiamato dal browser esiste nel server
 *  - i nuovi elementi (stop, ricerca, export, storico, notifiche) sono cablati
 * Uso: node media/test-static.mjs
 */
import { readFileSync } from "node:fs";

const html = readFileSync("/root/pi-harness/dashboard.html", "utf8");
const mjs = readFileSync("/root/pi-harness/dashboard.mjs", "utf8");
const commands = readFileSync("/root/pi-harness/media/commands.mjs", "utf8");
const readme = readFileSync("/root/pi-harness/README.md", "utf8");
const browserTool = readFileSync("/root/pi-harness/media/browser-tool.mjs", "utf8");
let browserSkill = "";
try {
  browserSkill = readFileSync("/root/pi-harness/skills/browser/SKILL.md", "utf8");
} catch {
  browserSkill = "";
}
const liveMod = readFileSync("/root/pi-harness/media/browser-live.mjs", "utf8");
const askTool = readFileSync("/root/pi-harness/media/ask-tool.mjs", "utf8");
const askBroker = readFileSync("/root/pi-harness/media/ask-broker.mjs", "utf8");
const unzipMod = readFileSync("/root/pi-harness/media/unzip.mjs", "utf8");
let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (desc, cond, extra = "") => (cond ? ok(desc) : ko(`${desc} ${extra}`));

// --- 1. id richiesti dal JS vs id presenti nel DOM -------------------------
const idsInHtml = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
const idsUsed = new Set([...html.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]));
const missing = [...idsUsed].filter((i) => !idsInHtml.has(i));
check(`tutti i ${idsUsed.size} id usati dal JS esistono nell'HTML`, missing.length === 0, missing.join(", "));

// --- 2. endpoint chiamati dal browser vs rotte del server -----------------
const urls = new Set();
for (const m of html.matchAll(/fetch\(\s*"(\/api\/[^"?]*)/g)) urls.add(m[1]);
for (const m of html.matchAll(/fetch\(\s*"(\/api\/[^"?]*)\?/g)) urls.add(m[1]);
for (const m of html.matchAll(/fetch\(\s*(?:\/\*[^]*?\*\/)?\s*url/g)) urls.add("(dinamico)");
for (const m of html.matchAll(/"(?:\/api\/[a-z/]+)"/g)) urls.add(m[0].slice(1, -1));
for (const m of html.matchAll(/window\.location = "(\/api\/[^"?]*)/g)) urls.add(m[1]);
const routes = new Set([...mjs.matchAll(/url\.pathname === "(\/api\/[^"]+)"/g)].map((m) => m[1]));
const missingRoutes = [...urls].filter((u) => u.startsWith("/api/") && !routes.has(u));
check(`tutti gli endpoint usati dal browser esistono (${[...urls].filter((u) => u.startsWith("/api/")).length} controllati)`, missingRoutes.length === 0, missingRoutes.join(", "));
check("il client usa l'endpoint dinamico per edit/regenerate", /\/api\/messages\/edit/.test(html) && /\/api\/messages\/regenerate/.test(html));
check("il server espone /api/messages/edit e /api/messages/regenerate", routes.has("/api/messages/edit") && routes.has("/api/messages/regenerate"));

// --- 3. funzioni dei nuovi item presenti e collegate ----------------------
const need = [
  ["stop → /api/abort", /\$\("stop"\)\.onclick = stopStream/],
  ["stopStream fa POST /api/abort", /fetch\("\/api\/abort", \{ method: "POST" \}\)/],
  ["bolla della risposta interrotta", /function appendAbortedPartial/],
  ["modifica messaggio", /function startEditMessage/],
  ["rigenera risposta", /async function regenerateLast/],
  ["barra azioni messaggio (copia/modifica/rigenera)", /function msgActions/],
  ["copia negli appunti", /navigator\.clipboard\.writeText/],
  ["export chat in markdown", /\/api\/sessions\/export\?id=/],
  ["ricerca nelle chat (UI)", /\/api\/sessions\/search\?q=/],
  ["ricerca nei file (UI)", /\/api\/search\/files\?q=/],
  ["salto alla riga trovata", /function jumpToLine/],
  ["storico prompt con frecce", /function histArrows/],
  ["storico salvato in localStorage", /localStorage\.setItem\(HKEY/],
  ["snippet rapidi", /function renderSnips/],
  ["notifica a fine risposta", /async function notifyDone/],
  ["service worker registrato", /serviceWorker\.register\("\/sw\.js"\)/],
  ["manifest collegato", /rel="manifest" href="\/manifest\.webmanifest"/],
  ["icone apple-touch", /rel="apple-touch-icon"/],
];
for (const [desc, re] of need) check(desc, re.test(html));

// --- 4. il server usa navigateTree per modifica/rigenera ------------------
check("il server usa navigateTree (rewind della conversazione)", /await session\.navigateTree\(last\.entryId\)/.test(mjs));
check("l'abort lato server chiama session.abort()", /await session\.abort\(\)/.test(mjs));
check("export markdown lato server", /function messagesToMarkdown/.test(mjs));
check("ricerca chat lato server", /async function searchSessions/.test(mjs));
check("ricerca file lato server", /async function searchFiles/.test(mjs));
check("rate-limit agganciato all'handler HTTP", /const blockedLeft = authBlockMsLeft\(req\)/.test(mjs));
check("le icone PWA sono servite dal server", /iconMatch/.test(mjs));

// --- 5. tool browser: aggancio e vincoli di sicurezza --------------------
check("dashboard.mjs importa l'estensione del tool browser", /from "\.\/media\/browser-tool\.mjs"/.test(mjs));
check("BROWSER_EXT è registrata in extensionFactories", /extensionFactories: \[[^\]]*BROWSER_EXT[^\]]*\]/.test(mjs));
check("il tool browser è OFF di default", /let browserEnabled = false;/.test(mjs));
check(
  "applyToolGate rimuove il tool browser quando è OFF",
  /if \(!browserEnabled\) names = names\.filter\(\(n\) => !BROWSER_TOOL_NAMES\.has\(n\)\)/.test(mjs),
);
check("il server espone /api/browser", routes.has("/api/browser"));
check("il comando /browser è nel catalogo", /name: "browser"/.test(commands));
check("/api/state riporta lo stato del browser", /browser: \{\s+available: ALL_TOOLS\.some\(/.test(mjs));

// vincoli verificati empiricamente il 18/09/2026 (media/verifica-empirica-browser.md)
check("il browser è invocato SEMPRE come utente dedicato (sudo -u)", /\["-n", "-u", BROWSER_USER/.test(browserTool));
check("il tool browser non passa da una shell (array di argomenti)", !/execFileSync\(\s*"sh"/.test(browserTool));
check("il tool rifiuta l'azione se la sandbox non è adeguata", /NOT adequately sandboxed/.test(browserTool));
check(
  "il check sandbox usa una sessione dedicata (non tocca le sessioni dell'utente)",
  /SANDBOX_SESSION = "sandbox-check"/.test(browserTool),
);
check(
  "il tool chiude solo la sessione di servizio del check, mai `close --all`",
  /"--session", SANDBOX_SESSION, "close"/.test(browserTool) && !/close", "--all"/.test(browserTool),
);
check("i file generati dal browser restano in media/", /function mediaPath/.test(browserTool));
check("i ref sono validati prima dell'uso", /REF_RE\.test/.test(browserTool));
check("l'URL è validato (solo http/https)", /\^https\?:/.test(browserTool));

// --- 6. viste progetto (artefatti) e agenda ------------------------------
check("esiste la vista progetto", /id="progettoView"/.test(html));
check("esiste la vista agenda", /id="agendaView"/.test(html));
check("la vista progetto nasconde chat e statistiche", /body\[data-tab="progetto"\] #chatView/.test(html));
check("la vista agenda nasconde chat e statistiche", /body\[data-tab="agenda"\] #chatView/.test(html));
check("showTab gestisce progetto", /\$\("progettoView"\)\.hidden = name !== "progetto"/.test(html));
check("showTab gestisce agenda", /\$\("agendaView"\)\.hidden = name !== "agenda"/.test(html));
check(
  "i pulsanti features aprono le nuove viste",
  /\$\("featProgetto"\)\.onclick/.test(html) && /\$\("featAgenda"\)\.onclick/.test(html),
);
check("la vista progetto elenca gli artefatti di media/", /async function loadProgetto/.test(html) && /mediaRel/.test(html));
check(
  "la vista agenda unisce cron e goal",
  /async function loadAgenda/.test(html) && /\/api\/schedules/.test(html) && /\/api\/goals/.test(html),
);
check(
  "le nuove viste tornano alla chat",
  /\$\("progettoBack"\)\.onclick/.test(html) && /\$\("agendaBack"\)\.onclick/.test(html),
);

// --- 7. skill del browser ------------------------------------------------
check("la skill browser ha il frontmatter Agent Skills (name+description)", /^---[\s\S]*?name: browser[\s\S]*?description:[\s\S]*?---/.test(browserSkill));
check("la skill rimanda al bundle nativo della CLI", /agent-browser skills get core/.test(browserSkill));
check("la skill documenta la regola dei ref", /snapshot/i.test(browserSkill) && /ref/i.test(browserSkill));
check("la skill dice che il tool è spento di default", /spento di default/i.test(browserSkill));

// --- 8. live view del browser --------------------------------------------
check("esiste la vista live", /id="liveView"/.test(html));
check("la vista live nasconde chat e statistiche", /body\[data-tab="live"\] #chatView/.test(html));
check("showTab gestisce la live view", /\$\("liveView"\)\.hidden = name !== "live"/.test(html));
check("il pulsante features apre la live view", /\$\("featLive"\)\.onclick/.test(html));
check(
  "la live view si ferma quando si lascia la vista (non consuma banda inutilmente)",
  /if \(name !== "live" && liveWatching\) stopWatch\(\)/.test(html),
);
check("il click sull'immagine invia input al browser", /\$\("liveImg"\)\.addEventListener\("click"/.test(html));
check(
  "le coordinate del click sono scalate sulla dimensione reale del frame",
  /img\.naturalWidth \/ r\.width/.test(html),
);
check("la tastiera \u00e8 inoltrata solo in modalit\u00e0 controllo", /liveControl !== "human"\) return/.test(html));
check("il server espone /api/browser/live", routes.has("/api/browser/live"));
check("il server espone /api/browser/watch", routes.has("/api/browser/watch"));
check("il server espone /api/browser/input", routes.has("/api/browser/input"));
check("il server espone /api/browser/control", routes.has("/api/browser/control"));
check("lo stream passa dalla dashboard (nessuna porta diretta esposta)", /createBrowserLive\(/.test(mjs));
check("l'input \u00e8 rifiutato se il controllo \u00e8 dell'agente", /il controllo \u00e8 dell'agente/.test(mjs));
check(
  "il bridge ammette solo input mouse/tastiera/touch",
  /allowed = new Set\(\["input_mouse", "input_keyboard", "input_touch"\]\)/.test(liveMod),
);
check("il bridge limita la banda (pacing ack + maxFps)", /pacing=ack&maxFps=/.test(liveMod));

// --- 9. correzioni emerse dall'uso reale del tool -------------------------
check("get url/title non pretende pi\u00f9 un ref", /what === "url" \|\| what === "title"/.test(browserTool));
check(
  "dopo open attende il caricamento del DOM (evita di leggere about:blank)",
  /wait", "--load", "domcontentloaded"/.test(browserTool),
);
check(
  "il tool rifiuta di agire quando il controllo \u00e8 dell'utente (lock anti-conflitto)",
  /isHumanControlled\(\)/.test(browserTool) && /controllo del browser \u00e8 passato all'utente/.test(browserTool),
);

// --- 10. gate dei tool sul percorso ufficiale di pi -----------------------
// Scoperto con una prova reale: scrivere `session.agent.state.tools` NON cambia ciò che il
// modello riceve (si vedeva in /api/state, quindi sembrava funzionare). Il percorso giusto è
// setActiveToolsByName(), che lavora sul registry e ricostruisce il system prompt.
check(
  "il gate usa il percorso ufficiale setActiveToolsByName",
  /session\.setActiveToolsByName\(/.test(mjs),
);
check("la base del gate sono i tool di default di pi", /DEFAULT_TOOL_NAMES = /.test(mjs));
check(
  "la disponibilità è letta dal registry, non dalla vista",
  /allToolsOf\(session\)/.test(mjs) && /function allToolsOf/.test(mjs),
);

// --- 11. accensione intelligente del tool browser -------------------------
check("il modo del browser è persistito su disco", /browser-prefs\.json/.test(mjs));
check("esiste la logica di accensione condizionale", /function browserShouldBeEnabled/.test(mjs));
check(
  "in modo auto si spegne dopo inattività",
  /browserIdleMinutes \* 60_000/.test(mjs) && /browserLastActivity/.test(mjs),
);
check("la live view accende il tool (modo auto)", /applyToolGate\(\);\n      broadcast\("state", getState\(\)\);/.test(mjs));
check("il comando /browser accetta auto", /\["on", "off", "auto", "status"\]/.test(mjs));
check("lo stato espone modo e inattività", /mode: browserMode/.test(mjs) && /idleMinutes: browserIdleMinutes/.test(mjs));

// --- 12. correzioni di comportamento (guardrail di regressione) ----------
// Bug trovati con il test funzionale: ognuno di questi, se tornasse, romperebbe una funzione
// in modo silenzioso.
check(
  "la description della skill è quotata nel frontmatter (YAML valido con ': ')",
  /description: \$\{JSON\.stringify\(cleanDesc\)\}/.test(mjs),
);
check(
  "aggiornare un goal non obbliga a rimandare il titolo",
  /input\?\.title \?\? existing\?\.title/.test(mjs),
);
check(
  "la preferenza del browser è scritta in modo sincrono (niente corse)",
  /writeFileSync\(\s*\n?\s*BROWSER_PREFS_FILE/.test(mjs),
);
check(
  "il gate usa il percorso ufficiale di pi e non la vista state.tools",
  /session\.setActiveToolsByName\(names\)/.test(mjs),
);
check(
  "la live view non chiude le sessioni dell'utente (nessun close --all nel tool)",
  !/close", "--all"/.test(browserTool),
);

// --- 13. adattamento a mobile -------------------------------------------
// Lo storico prompt (🕘) resta una funzione da desktop: su mobile il pulsante non compare,
// ma il pannello e i listener restano nel DOM (nessuna funzione rimossa dal codice).
check(
  "lo storico prompt è nascosto su mobile",
  /@media \(max-width: 760px\) \{\s*#histBtn \{ display: none !important; \}/.test(html),
);
check("il pulsante dello storico esiste ancora su desktop", /id="histBtn"/.test(html));
check("il pannello dello storico è collegato", /id="histPanel"/.test(html) && /\$\("histBtn"\)\.onclick/.test(html));

check(
  "la live view si riconnette da sola quando cade la connessione",
  /scheduleReconnect\(/.test(liveMod) && /autoReconnect = true/.test(liveMod),
);
check(
  "aprire la vista live avvia il flusso da solo",
  /if \(!liveWatching\) \{[\s\S]{0,80}await startWatch\(\)/.test(html),
);

check(
  "la fluidità aumenta quando guida l'utente (3 → 10 fps)",
  /BROWSER_FPS_HUMAN/.test(mjs) && /setMaxFps\(mode === "human" \? BROWSER_FPS_HUMAN : BROWSER_FPS_BASE\)/.test(mjs),
);
check("esiste l'endpoint di ricarica della pagina", /url\.pathname === "\/api\/browser\/reload"/.test(mjs));
check("il tool browser supporta l'azione reload", /case "reload": return \{[\s\S]{0,40}\["reload"\]/.test(browserTool));
check(
  "bridge e tool usano lo STESSO binario (profilo persistente)",
  /DASH_BROWSER_BIN \|\| "\/usr\/local\/bin\/pbrowser"/.test(mjs) &&
    /DASH_BROWSER_BIN \|\| "\/usr\/local\/bin\/pbrowser"/.test(browserTool),
);
check("il frontend ha il pulsante di ricarica della pagina", /id="liveReload"/.test(html));

// --- 14. coerenza delle viste ------------------------------------------
// Bug trovato dal test UI: la vista File era l'unica senza il pulsante di ritorno alla chat.
check(
  "ogni vista ha il pulsante di ritorno alla chat",
  ["filesBack", "goalsBack", "cronBack", "skillsBack", "progettoBack", "agendaBack", "liveBack"].every((id) =>
    new RegExp(`id="${id}"`).test(html),
  ),
);
check(
  "ogni pulsante di ritorno è collegato a showTab('chat')",
  /\$\("filesBack"\)\.onclick = \(\) => showTab\("chat"\);/.test(html),
);

// --- 15. performance (guardrail) ---------------------------------------
// Lo stato NON deve contenere i messaggi se non richiesti: pesano oltre 1 MB e vengono
// trasmessi a ogni evento SSE (20 punti di broadcast).
check(
  "lo stato esclude i messaggi se non richiesti",
  /function getState\(\{ withMessages = false \} = \{\}\)/.test(mjs) && /withMessages \? \{ messages \}/.test(mjs),
);
check("la GET /api/state chiede i messaggi", /getState\(\{ withMessages: true \}\)/.test(mjs));
check(
  "il frontend conserva i messaggi quando lo stato non li include",
  /if \(Array\.isArray\(st\.messages\)\) currentMessages = st\.messages/.test(html),
);
// execFileSync blocca l'event loop del server per tutta la durata del comando.
check(
  "la CLI del browser è eseguita in modo asincrono (niente blocco dell'event loop)",
  !/execFileSync\(/.test(browserTool) && !/execFileSync\(/.test(liveMod),
);
// La compressione non deve toccare lo stream SSE (causerebbe buffering dei frame).
let caddy = "";
try {
  caddy = readFileSync("/etc/caddy/Caddyfile", "utf8");
} catch {
  caddy = "";
}
if (caddy) {
  check("Caddy comprime le risposte", /encode @noStream zstd gzip/.test(caddy));
  check("lo stream SSE è escluso dalla compressione", /@noStream not path \/events/.test(caddy));
}

// --- 16. adattamento a mobile ------------------------------------------
// I touch target sotto i 44px si mancano col dito: verificato con emulazione iPhone 12.
check(
  "su mobile i touch target sono portati ad almeno 44px",
  /@media \(max-width: 760px\) \{\s*\.tab \{ min-height: 44px; \}/.test(html) &&
    /\.mobile-stats \{ width: 44px; height: 44px; \}/.test(html),
);
check("l'input della live view è comodo su mobile", /#liveInput,\s*\n?\s*\.livechatin input \{ min-height: 44px; \}/.test(html));

// --- 17. statistiche mostrabili/nascondibili ---------------------------------
check(
  "il pulsante delle statistiche è disponibile anche su desktop",
  /\.mobile-stats \{\s*\n?\s*display: inline-flex;/.test(html),
);
check(
  "la scelta sulle statistiche è ricordata tra i caricamenti",
  /pi\.statsHidden/.test(html) && /localStorage\.setItem\(STATS_KEY/.test(html) && /applyStatsHidden\(\);/.test(html),
);

// --- 18. cambio di conversazione ---------------------------------------
// Bug segnalato dall'utente: cambiando conversazione restava visibile il log della precedente.
// Causa: gli aggiornamenti di stato non contengono i messaggi, quindi al cambio di sessione
// vanno RICHIESTI esplicitamente (la sessione cambiava, ma la chat restava vecchia).
check(
  "al cambio di sessione i messaggi vengono richiesti di nuovo",
  /function reloadMessages/.test(html) && /reloadMessages\(\);/.test(html),
);
check(
  "anche aprendo una conversazione dal drawer i messaggi vengono riletti",
  /await postJSON\("\/api\/sessions\/open", \{ id \}\);[\s\S]{0,900}await reloadMessages\(\)/.test(html),
);
// Bug segnalato dall'utente: la conversazione precedente restava a schermo e sembrava che il
// cambio non funzionasse; il payload veniva scaricato due volte e una risposta in ritardo
// poteva sovrascrivere la vista.
check(
  "al cambio chat la vista entra subito in stato di caricamento",
  /function showChatLoading/.test(html) &&
    /cambiata\) \{[\s\S]{0,600}showChatLoading\(\)/.test(html) &&
    /openSessionById[\s\S]{0,600}showChatLoading\(\)/.test(html),
);
check(
  "una sola richiesta di messaggi per volta (niente doppio download)",
  /loadingPromise && loadingSession === wanted/.test(html),
);
check(
  "le risposte di stato superate vengono scartate (nessuna sovrascrittura)",
  /epoch !== chatEpoch\) return/.test(html) && /st\.sessionId !== currentSessionId\) return/.test(html),
);
check(
  "il badge della lista segue la sessione corrente, non l'ultimo payload",
  /const isCurrent = !!s\.current \|\| s\.id === sessionsData\.current/.test(html),
);
check(
  "la lista si ridisegna anche a drawer chiuso (badge 'attiva' mai stantio)",
  /addEventListener\("sessions", \(e\) => \{[\s\S]{0,300}renderSessions\(\);/.test(html),
);
check(
  "il ridisegno della chat non forza più lo scroll in fondo",
  /if \(cmdNotices\.length\)[\s\S]{0,600}autoscroll\(false\)/.test(html),
);
// Difetto verificato dal vivo: la risposta veniva SALVATA nel file di sessione ma spariva
// dalla schermata a fine generazione, perché l'evento di stato ridisegnava la chat con la
// lista dei messaggi nota (che non conteneva ancora la risposta appena arrivata).
check(
  "la risposta appena generata non viene cancellata dal ridisegno di stato",
  /let localMsgs = 0/.test(html) &&
    /localMsgs\+\+/.test(html) &&
    /if \(localMsgs > 0\)[\s\S]{0,140}refreshTailActions\(\)/.test(html),
);
// Difetto segnalato dal proprietario: durante un turno con molte chiamate `bash` si vedevano
// solo le card dei tool accumulate in fondo («bash bash bash») mentre testo e pensiero
// restavano sopra, fuori vista; il refresh ricostruiva tutto. Le card devono stare DENTRO il
// messaggio assistant, in ordine, e ricevere l'esito da tool_end.
check(
  "le card dei tool stanno dentro il messaggio in corso (non appese alla chat)",
    /function appendToolCard/.test(html) &&
    /cur\.wrap\.appendChild\(card\)/.test(html) &&
    !/chat\.appendChild\(d\); autoscroll\(false\);/.test(html),
);
check(
  "il testo dopo un tool riapre una bolla sotto la card",
  /function lastBlockKind/.test(html) && /if \(lastBlockKind\(\) !== "text"\) cur\.assistant = null/.test(html),
);
check(
  "tool_end aggiorna l'esito della card (✓ / ✗)",
  /addEventListener\("tool_end"/.test(html) && /function endToolCard/.test(html),
);
check(
  "lo snapshot a segmenti ricostruisce il messaggio in ordine",
  /function renderStreamSegments/.test(html) && /Array\.isArray\(d\.segments\)/.test(html),
);
check(
  "i pulsanti dell'ultima risposta vengono aggiunti senza ridisegnare la chat",
  /function refreshTailActions/.test(html) && /appendChild\([\s\S]{0,200}msgActions\(/.test(html),
);
check(
  "lo stato iniziale porta i messaggi: nessuna seconda richiesta inutile",
  /const conMessaggi = Array\.isArray\(st\.messages\)/.test(html) &&
    /loadedSessionId === wanted\) return Promise\.resolve\(\)/.test(html),
);

// --- 19. tastiera completa nella live view ---------------------------------
// Lo stream accetta solo key+text: senza testo il browser non riceve l'evento, quindi
// Backspace, Tab, le frecce e le scorciatoie (Control+a) non funzionavano.
check(
  "tasti speciali e scorciatoie passano dalla CLI (endpoint dedicato)",
  /url\.pathname === "\/api\/browser\/press"/.test(mjs) && /async function press\(keys\)/.test(liveMod),
);
check(
  "le combinazioni di tasti sono validate con una whitelist",
  /combinazione di tasti non ammessa/.test(liveMod) && /Control\|Alt\|Meta\|Shift/.test(liveMod),
);
check(
  "il frontend distingue caratteri (stream) da tasti speciali (CLI)",
  /conModificatore/.test(html) && /pressKeys\(combo\)/.test(html),
);

// --- 20. barra indirizzi e scorrimento nella live view ---------------------
check(
  "la live view ha la barra indirizzi (URL o ricerca)",
  /id="liveUrlBar"/.test(html) && /async function liveNavigate/.test(html),
);
check(
  "la navigazione dalla barra passa da un endpoint validato",
  /url\.pathname === "\/api\/browser\/open"/.test(mjs) && /serve un URL http\(s\) valido/.test(liveMod),
);
check(
  "la pagina si scorre con rotellina e pulsanti",
  /eventType: "mouseWheel"/.test(html) && /id="liveScrollUp"/.test(html) && /id="liveScrollDown"/.test(html),
);

// --- 21. importazione di skill complete da .zip -----------------------------
check(
  "si può importare una skill completa da un archivio .zip",
  /url\.pathname === "\/api\/skills\/upload-zip"/.test(mjs) && /function sanitizeSkillFrontmatter/.test(mjs),
);
check(
  "l'estrazione degli archivi rifiuta i percorsi pericolosi",
  /safeEntryPath/.test(mjs) && /parts\.some\(\(s\) => s === "\.\."\)/.test(unzipMod),
);
check(
  "l'interfaccia accetta .md e .zip",
  // l'elenco è cresciuto (`.skill`): il controllo non deve fissare la stringa esatta
  /accept="[^"]*\.md,\.zip[^"]*text\/markdown/.test(html) && /\/api\/skills\/upload-zip\?name=/.test(html),
);
check(
  "il frontmatter importato viene reso tollerante (description con ': ')",
  /sanitizeSkillFrontmatter\(entry\.data\.toString/.test(mjs),
);

// --- 12. domande interattive all'utente (tool `ask_user`) ----------------
check("dashboard.mjs importa l'estensione delle domande", /from "\.\/media\/ask-tool\.mjs"/.test(mjs));
check("dashboard.mjs importa il broker delle domande", /from "\.\/media\/ask-broker\.mjs"/.test(mjs));
check("ASK_EXT è registrata in extensionFactories", /extensionFactories: \[[^\]]*ASK_EXT[^\]]*\]/.test(mjs));
check("il tool si chiama ask_user ed è registrato", /toolName = "ask_user"/.test(askTool) && /pi\.registerTool\(TOOL\)/.test(askTool));
check(
  "la descrizione del tool dice quando chiedere e quando no",
  /Non usarlo per cose che puoi scoprire da solo/.test(askTool) && /interrogatorio/.test(askTool),
);
check(
  "la descrizione vieta di scrivere l'opzione Altro",
  /NON aggiungere un'opzione/.test(askTool) && /il testo libero l'interfaccia lo offre sempre/.test(askTool),
);
check(
  "il system prompt ha la nota sulle domande all'utente",
  /## Domande all'utente \(tool/.test(mjs),
);
check(
  "il server espone /api/ask/respond e /api/ask",
  /url\.pathname === "\/api\/ask\/respond"/.test(mjs) && /url\.pathname === "\/api\/ask"/.test(mjs),
);
check(
  "il browser risponde con id + azione + risposte",
  /fetch\("\/api\/ask\/respond"/.test(html) && /\{ id, action: "accept", answers \}/.test(html),
);
check(
  "lo stato include pendenti ed esiti (riallineamento al reload)",
  /ask: \{[\s\S]{0,400}?\.\.\.askBroker\.snapshot\(\{ withResolved: withMessages \}\)/.test(mjs) && /applyAskState\(st\.ask\)/.test(html),
);
check(
  "la card interattiva è renderizzata anche nello streaming e nei messaggi",
  /if \(bl\.ask\)/.test(html) && /if \(s\.ask\)/.test(html) && /appendAskCard\(d\)/.test(html),
);
check(
  "la card ha invio, salto, testo libero e conto alla rovescia",
  /ask-send/.test(html) && /ask-skip/.test(html) && /Altro \/ rispondi a parole tue/.test(html) && /function startAskTimer/.test(html),
);
check(
  "le domande e le risposte restano nel transcript (riepilogo, non rimozione)",
  /function askSummaryRow/.test(html) && /ask-sum/.test(html),
);
check(
  "l'interruzione annulla le domande pendenti",
  /askBroker\.cancelAll\("turno interrotto"\)/.test(mjs),
);
check(
  "le domande orfane di un riavvio vengono marcate scadute",
  /markOrphansExpired\(\)/.test(mjs) && /riavvio del processo/.test(askBroker),
);
check(
  "il broker limita numero e lunghezza (difesa da abuso e prompt injection)",
  /maxQuestions: 4/.test(askBroker) && /headerMax: 24/.test(askBroker) && /sanitizeText/.test(askBroker),
);
check(
  "il broker vieta di raccogliere credenziali nel form",
  /SECRET_RE/.test(askBroker) && /le credenziali \(password, API key, token, dati di carta\)/.test(askBroker),
);
check(
  "nessun uso di innerHTML per le domande e le risposte dell'utente",
  !/innerHTML/.test(askTool) && !/\.innerHTML = .*(question|selected|other)/.test(html),
);
check(
  "il tool in attesa è visibile come tale nella card dei tool",
  /attende una risposta/.test(mjs),
);
check(
  "l'interruttore DASH_ASK=off toglie il tool alle istanze non presidiate",
  /DASH_ASK/.test(mjs) && /ASK_EXT \? \[ASK_EXT\] : \[\]/.test(mjs),
);
check(
  "i test automatici girano con le domande spente (nessuna attesa a vuoto)",
  /DASH_ASK=off/.test(readFileSync("/root/pi-harness/media/test-api.sh", "utf8")) &&
    /DASH_ASK: "off"/.test(readFileSync("/root/pi-harness/media/test-stream-tools-browser.mjs", "utf8")),
);
check(
  "anche l'harness da terminale ha il tool (via DefaultResourceLoader)",
  /import \{ createAskBroker \} from "\.\/media\/ask-broker\.mjs"/.test(readFileSync("/root/pi-harness/harness.mjs", "utf8")) &&
    /resourceLoader/.test(readFileSync("/root/pi-harness/harness.mjs", "utf8")),
);
// --- interruttore delle domande (pulsante + /ask + persistenza) ---
check("il pulsante delle domande esiste nella barra delle feature", /id="askToggle"/.test(html) && /\$\("askToggle"\)\.addEventListener\("click"/.test(html));
check("lo stato del pulsante segue il server (acceso/spento)", /function renderAskToggle/.test(html) && /renderAskToggle\(st\)/.test(html));
check(
  "il server espone POST /api/ask { enabled } e il client lo usa",
  /req\.method === "POST" && url\.pathname === "\/api\/ask"/.test(mjs) && /postJSON\("\/api\/ask", \{ enabled: on \}\)/.test(html),
);
check(
  "spegnendo le domande il tool viene tolto dal gate (non solo ignorato)",
  /ASK_TOOL_NAMES = new Set\(\["ask_user"\]\)/.test(mjs) && /if \(!askToolEnabled\(\)\) names = names\.filter/.test(mjs),
);
check("la scelta dell'interruttore è persistita su disco", /ASK_PREFS_FILE/.test(mjs) && /function saveAskPrefs/.test(mjs));
check("le domande in attesa si chiudono quando si spegne", /askBroker\.cancelAll\("domande disattivate"\)/.test(mjs));
check(
  "c'è il comando /ask (catalogo + esecuzione nel server)",
  /name: "ask"/.test(commands) && /ask: async \(\{ arg \}\)/.test(mjs),
);
check(
  "il README documenta l'interruttore e il comando /ask",
  // il README scrive la tabella con le pipe protette (`/ask <on\|off\|status>`): si normalizza
  /DASH_ASK=off/.test(readme) && /\/ask (?:<)?on\|off(?:\|status)?/.test(readme.replace(/\\\|/g, "|")),
);

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
