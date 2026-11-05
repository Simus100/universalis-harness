/**
 * Crea (via API) il goal "funzionalità verificate in uso reale" della dashboard.
 * Uso: node media/create-goal-funzionalita.mjs
 * Si usa l'API perché la dashboard tiene i goal in memoria e riscrive il file
 * dal suo array: scrivere goals.json a mano verrebbe sovrascritto.
 */
import fs from "node:fs";

const description = [
  "Portare Universalis Harness a una v1 che funziona DAVVERO nell'uso quotidiano: ogni funzione verificata in uso reale (non solo dalla suite automatica), i difetti riprodotti e chiusi con evidenza, nessun comportamento che costringa a ricaricare la pagina o a indovinare cosa sta succedendo.",
  "DIFETTO APERTO N.1 (segnalato dal proprietario, causa individuata) — «talvolta non vedo la pagina scorrere e devo fare io il refresh; vedo solo i comandi e non vedo la catena di pensiero né nulla, a meno che non faccia refresh». Meccanismo trovato in dashboard.html riga 1747: il listener dell'evento applicativo «error» è registrato con lo stesso nome dell'evento NATIVO di errore di EventSource, quindi si attiva anche quando cade la connessione SSE. In quel caso e.data è undefined, il try/catch lo assorbe ma setStatus(false) è FUORI dal try ed esegue SEMPRE: la UI torna in idle (sparisce lo stop), e setStatus(false) azzera cur.assistant e cur.thinking, cioè il riferimento alla bolla in corso. Le card dei tool continuano a comparire (tool_start fa chat.appendChild, non dipende da cur.assistant) mentre testo e thinking no: è esattamente il sintomo riportato. Al refresh la GET /api/state ricarica la sessione con la risposta ormai salvata, quindi «si sistema». Aggravante: il server non manda id: né buffer di replay (/events scrive solo retry: 2000), quindi i delta emessi nei ~2 s di riconnessione di EventSource sono persi per sempre e il testo successivo finisce in una bolla nuova, spezzando la risposta. Non c'è nessun indicatore in interfaccia che dica che lo stream è caduto.",
  "CONTESTO DELL'AUDIT (2026-09-19, media/audit-progetto-20260919.md): la suite automatica è tutta verde (~397 verifiche: test-static 134, test-ui 89, test-api 38, test-functions 76, test-views 32, test-chat 24), ma il difetto n.1 NON era coperto da nessun test: nessuno simula la caduta della connessione a metà risposta. Il divario tra «test verdi» e «uso reale» è il tema del goal.",
  "ALTRI DIFETTI FUNZIONALI DA VERIFICARE E CHIUDERE — (a) nessuno stato di connessione in UI: l'utente non sa se lo stream è vivo, se sta riconnettendo o se la risposta è finita; (b) alla riconnessione non c'è riallineamento automatico della chat (serve reloadMessages/GET /api/state e la ripresa dell'append sulla bolla giusta); (c) perdita di delta senza id:/Last-Event-ID o buffer di replay lato server; (d) goal e pianificazioni letti solo all'avvio: memoria e file possono disallinearsi; (e) live view: errori WebSocket ricorrenti nel bridge (nei log «[browser-live] errore: errore WebSocket» → «connessione chiusa») senza riconnessione automatica né spiegazione in interfaccia; (f) da verificare in uso reale, non solo nei test: allegati, card dei file, ricerca chat/file, export, drawer sessioni, tutti i comandi slash, file manager, viste progetto/agenda/skills/cron, notifiche PWA, comportamento su mobile.",
  "METODO — per ogni funzione: riprodurre il caso d'uso reale, osservare, correggere, e aggiungere il test di regressione che avrebbe intercettato il difetto. Le correzioni si provano su istanza isolata (:8430) prima della produzione, con copia di sicurezza dei due file di lavoro (dashboard.mjs, dashboard.html) prima di ogni modifica; il deploy passa da systemd-run perché interrompe la sessione agente. Nessun endpoint esistente va rotto: dopo ogni intervento la suite completa deve restare verde.",
].join(" ");

const payload = {
  title: "Funzionalità verificate in uso reale — v1 utilizzabile",
  description,
  status: "active",
  steps: [
    { id: "f1-diagnosi", title: "FASE 1a — Caso apripista (difetto n.1): separare l'errore applicativo dall'errore nativo di connessione; gli errori di trasporto non devono azzerare la bolla in corso né spegnere lo stato «working»", done: false },
    { id: "f1-stato-connessione", title: "FASE 1b — Stato della connessione visibile e onesto in interfaccia: collegato / riconnessione in corso / risposta in corso / finita, senza che l'utente debba indovinare o ricaricare", done: false },
    { id: "f1-riallineamento", title: "FASE 1c — Riallineamento automatico alla riconnessione: la chat si riallinea da sola (stato + messaggi) e l'append riprende sulla bolla giusta, senza refresh manuale", done: false },
    { id: "f1-replay", title: "FASE 1d — Nessun delta perso: id:/Last-Event-ID con buffer di replay lato server (o equivalente) così una riconnessione non taglia la risposta a metà", done: false },
    { id: "f1-test", title: "FASE 1e — Test di regressione: simulare la caduta della connessione a metà risposta e verificare che la chat resti integra e completa", done: false },
    { id: "f2-matrimonio-uso-reale", title: "FASE 2 — Matrice funzionale in uso reale (una voce alla volta, in browser vero, anche su mobile): invio e streaming, thinking, card dei tool, stop, modifica, rigenera, copia, allegati e immagini, card dei file con apri/scarica, storico prompt, snippet", done: false },
    { id: "f3-viste", title: "FASE 3 — Matrice delle viste e della persistenza: chat, file manager (crea/rinomina/cancella/upload/download), goals, cron, skills (incl. zip), progetto, agenda, live; ricerca chat e file, export markdown, drawer sessioni con nuova/apri/rinomina/elimina", done: false },
    { id: "f4-comandi", title: "FASE 4 — Comandi slash: ognuno dei comandi del catalogo eseguito davvero e verificato (help, status, model, think, subagents, browser, stop, new, rename, sessions, export, compact, goals/goal-run/goal-done, crons/cron-run/cron-toggle/cron-del, tab, files, clear)", done: false },
    { id: "f5-live", title: "FASE 5 — Live view: frame che arrivano in modo affidabile, riconnessione automatica del bridge, ogni stato spiegato (nessun frame, in attesa, disconnesso, controllo umano), input e pagina ferma verificati", done: false },
    { id: "f6-coerenza", title: "FASE 6 — Coerenza dei dati: eliminare il disallineamento memoria-file di goals.json e schedules.json, con test che li modifica a dashboard accesa", done: false },
    { id: "f7-mobile-pwa", title: "FASE 7 — Mobile e PWA: ergonomia reale su telefono, notifiche quando la risposta finisce, comportamento con scheda in background e rete che cambia (Wi-Fi/dati), sospensione e ritorno", done: false },
    { id: "f8-chiusura", title: "FASE 8 — Chiusura: zero difetti aperti con evidenza, un test di regressione per ogni difetto chiuso, README aggiornato sul comportamento reale, versione v1 identificabile", done: false },
  ],
  checklist: [
    { id: "c1", text: "Nessuna funzione richiede più un refresh manuale della pagina per vedere lo stato reale", done: false },
    { id: "c2", text: "Se la connessione cade durante una risposta, la chat lo dice e si riallinea da sola, senza perdere il testo già generato", done: false },
    { id: "c3", text: "Una riconnessione non taglia né duplica la risposta (nessun delta perso, nessuna bolla spezzata)", done: false },
    { id: "c4", text: "Ogni difetto chiuso ha un test di regressione che fallirebbe se il difetto tornasse", done: false },
    { id: "c5", text: "Le card dei tool e il testo/thinking compaiono sempre insieme e in ordine, anche sotto rete instabile", done: false },
    { id: "c6", text: "La suite completa resta verde dopo ogni fase, provata sul runtime di produzione", done: false },
    { id: "c7", text: "Nessuna regressione su chat, allegati, ricerca, export, sessioni, skill, cron, goal e file manager", done: false },
    { id: "c8", text: "La live view spiega sempre il proprio stato e si riconnette da sola dopo un riavvio del daemon", done: false },
    { id: "c9", text: "Su telefono l'app si usa davvero: invio, allegati, viste e live view senza aree morte", done: false },
    { id: "c10", text: "README allineato al comportamento reale, con i limiti noti dichiarati invece che impliciti", done: false },
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
