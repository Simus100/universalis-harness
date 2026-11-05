/**
 * Crea (via API, come da note operative) il goal "v1 stabile" della dashboard.
 * Uso: node media/create-goal-stabilita.mjs
 * L'API è l'unico modo sicuro: la dashboard tiene i goal in memoria e riscrive
 * il file dal suo array, quindi scrivere goals.json a mano verrebbe sovrascritto.
 */
import fs from "node:fs";

const description = [
  "Rendere Universalis Harness la prima versione utilizzabile, completa e STABILE: tutte le funzionalità verificate end-to-end, comportamento prevedibile sotto errore, configurazione senza ambiguità, modifiche reversibili. L'audit del 2026-09-19 (media/audit-progetto-20260919.md) è il perimetro di partenza.",
  "ESITO DELL'AUDIT — le funzionalità NON sono rotte: ~397 verifiche verdi (test-static 134, test-ui 89, test-api 38, test-functions 76, test-views 32, test-chat 24, check-html-js/check-skills/audit ok), servizio attivo con NRestarts=0, backup funzionante. I problemi sono di robustezza, configurazione e processo, non di funzionamento.",
  "RISCHI APERTI — P1 nessun versionamento: nessun repo git, nessuna storia/diff/rollback selettivo, solo tar.gz giornalieri e 21 copie .bak sparse (rischio più alto in una fase di stabilizzazione). P2 goal letti solo all'avvio: memoria e file possono disallinearsi. P3 errori WebSocket ricorrenti nel bridge della live view con riconnessioni a porte diverse, senza riconnessione automatica documentata. P4 configurazione ambigua: DASH_ROOT=/root mentre il progetto è /root/pi-harness, quindi /api/files?path=media restituisce 0 voci mentre path=pi-harness/media ne restituisce 107. P5 due runtime Node diversi: servizio su v26.8.2 (linuxbrew), test e CLI su v24.21.0 (/usr/bin/node). P6 dipendenza non pinnata: node_modules/@earendil-works/pi-coding-agent è un symlink al pacchetto globale 0.85.1, un update globale cambia il motore senza review. P7 nessun monitoraggio attivo: systemd riavvia solo se il processo muore, non se l'event loop si blocca; nessun restore da backup mai provato. P8 igiene: residui (.tail-fix.tmp, nuovo_file.txt, tre.txt, media/w2.txt, media/prova-scrittura.txt, uploads di prova) e 21 file .bak/pre-* per 1,7 MB. P9 processo come root con DASH_ROOT=/root e tool bash: raggio d'azione massimo, documentato ma non mitigato. P10 manca il concetto di release: VERSION è un'etichetta, niente changelog né rollback provato, deploy diretto in produzione con systemd-run.",
  "PIANO — il lavoro procede a fasi, ognuna verificabile da sola con la suite esistente: FASE 0 rete di sicurezza (git + baseline taggata + restore provato), FASE 1 configurazione a una sola verità (root/media incluse le viste e i comandi, runtime Node pinnato, pi pinnato), FASE 2 robustezza runtime (healthcheck che verifica /api/state e non solo la porta, watchdog su blocco logico, unhandled rejection gestite, log strutturato), FASE 3 live view solida (riconnessione automatica, stati sempre spiegati, pagina ferma), FASE 4 coerenza goal/cron (niente più disallineamento memoria-file), FASE 5 igiene e copertura (pulizia con politica unica, test del restore e delle aree scoperte), FASE 6 release v1 (freeze, changelog, deploy verificato, rollback documentato e provato).",
  "VINCOLI: (1) nessuna modifica peggiora l'accesso del proprietario a dashboard, file, editor e sessioni; (2) nessun endpoint esistente si rompe — dopo ogni fase la suite completa deve restare verde; (3) ogni modifica si prova su istanza isolata (:8430/:8499) prima di toccare la produzione; (4) i deploy passano da systemd-run perché interrompono la sessione agente; (5) ogni fase ha un backup/commit ripristinabile prima di iniziare.",
].join(" ");

const payload = {
  title: "Universalis Harness v1 — stabile, completa, verificata",
  description,
  status: "active",
  steps: [
    { id: "f0-git", title: "FASE 0a — rete di sicurezza: inizializzare il repo git del progetto con .gitignore (node_modules, backups, sessions, media/uploads), primo commit dello stato attuale e tag baseline-2026-09-19", done: false },
    { id: "f0-restore", title: "FASE 0b — provare un ripristino vero: estrarre un backup in una cartella temporanea, confrontare con lo stato corrente e documentare la procedura di rollback", done: false },
    { id: "f1-root", title: "FASE 1a — configurazione a una sola verità: decidere e documentare DASH_ROOT, allineare MEDIA_DIR e i percorsi relativi, eliminare l'ambiguità media vs pi-harness/media in api, comandi e viste", done: false },
    { id: "f1-runtime", title: "FASE 1b — pinnare l'ambiente: un solo runtime Node per servizio e test (engines/.nvmrc o symlink esplicito) e versione di pi fissata in package.json con lockfile", done: false },
    { id: "f2-health", title: "FASE 2a — sorveglianza reale: healthcheck che verifica /api/state e /events in tempi utili (non solo la porta), con riavvio automatico su blocco logico e log strutturato", done: false },
    { id: "f2-errors", title: "FASE 2b — errori gestiti: unhandled rejection e uncaught exception non silenziose, messaggi d'errore leggibili in chat e in /api/health", done: false },
    { id: "f3-live", title: "FASE 3 — live view solida: riconnessione automatica del bridge al cambio porta o riavvio del daemon, stato sempre spiegato in interfaccia (nessun frame, in attesa, disconnesso, sotto controllo umano), comportamento verificato su pagina ferma", done: false },
    { id: "f4-goals", title: "FASE 4 — coerenza goal e cron: eliminare il disallineamento memoria-file (rilettura o watcher su goals.json e schedules.json) con test che li modifica mentre la dashboard gira", done: false },
    { id: "f5-hygiene", title: "FASE 5a — igiene: rimuovere i residui e le 21 copie .bak, definire una politica unica di backup dei file di lavoro", done: false },
    { id: "f5-tests", title: "FASE 5b — copertura: test del restore da backup, watcher di goal e cron, riconnessione del bridge, PWA offline; estendere test-functions.mjs alle aree scoperte", done: false },
    { id: "f6-release", title: "FASE 6 — release v1: congelare la versione, changelog, deploy con systemd-run e verifica post-riavvio automatica, procedura di rollback documentata", done: false },
  ],
  checklist: [
    { id: "c1", text: "git log racconta le modifiche e un rollback è stato eseguito davvero almeno una volta", done: false },
    { id: "c2", text: "La suite completa è verde SUL RUNTIME DI PRODUZIONE (non solo su /usr/bin/node)", done: false },
    { id: "c3", text: "Configurazione senza ambiguità: un solo DASH_ROOT dichiarato, percorsi coerenti in api, comandi e viste", done: false },
    { id: "c4", text: "Runtime Node e versione di pi pinnati: un aggiornamento globale non cambia il motore senza che sia una scelta", done: false },
    { id: "c5", text: "Un blocco logico del servizio viene rilevato e recuperato senza intervento manuale (provato)", done: false },
    { id: "c6", text: "La live view si riconnette da sola dopo un riavvio del daemon e spiega sempre il proprio stato", done: false },
    { id: "c7", text: "Nessun disallineamento tra memoria e goals.json/schedules.json (test che modifica i file a dashboard accesa)", done: false },
    { id: "c8", text: "Un ripristino da backup è stato provato end-to-end e documentato", done: false },
    { id: "c9", text: "Nessuna regressione su chat, allegati, ricerca, export, skill, subagent, web_search e tool browser", done: false },
    { id: "c10", text: "Deploy e rollback sono procedure ripetibili e documentate nel README, con versione e changelog identificabili", done: false },
  ],
};

const env = fs.readFileSync("/root/pi-harness/.env", "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const auth = Buffer.from(`${val("DASH_USER")}:${val("DASH_PASSWORD")}`).toString("base64");
const r = await fetch("http://127.0.0.1:8420/api/goals", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
  body: JSON.stringify(payload),
});
const out = await r.json();
console.log("POST /api/goals ->", r.status);
console.log(out.ok ? `goal creato: id ${out.goal.id} — ${payload.steps.length} passi / ${payload.checklist.length} controlli` : JSON.stringify(out).slice(0, 200));
