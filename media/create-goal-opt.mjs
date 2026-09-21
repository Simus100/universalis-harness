/** Crea il goal di ottimizzazione completa della dashboard, in fasi. */
import fs from "node:fs";

const description = [
  "Analisi completa della dashboard, ottimizzazione, correzione dei bug e verifica funzionale di ogni elemento delle features, con priorità sulla live view del browser (segnalata lenta e con incertezze nell'uso reale).",
  "Il lavoro procede A FASI, ognuna verificabile da sola: si parte dalla live view (il punto dolente), poi si estende la verifica funzionale a tutte le feature, poi le ottimizzazioni di performance e la UX mobile, infine il deploy e la verifica finale.",
  "Già fatto negli scorsi interventi (base di partenza, non da rifare): strumento di audit media/audit.mjs (0 problemi su endpoint/comandi/viste/id/codice morto/file), test funzionale media/test-functions.mjs (55 verifiche), suite media/test-all.sh a 8 passi, documentazione API completa (46/46), correzioni a skill YAML, aggiornamento goal, preferenza browser sincrona, gate dei tool sul percorso ufficiale di pi e rivalutato prima di ogni prompt.",
  "VINCOLI: (1) nessuna misura deve limitare l'accesso del proprietario, che resta libero su dashboard/file/editor/sessioni; (2) nessun endpoint esistente va rotto; (3) ogni modifica si prova su istanza isolata prima del deploy; (4) il deploy va programmato con systemd-run perché interrompe la sessione agente.",
].join(" ");

const payload = {
  title: "Ottimizzazione completa della dashboard (priorità: live view del browser)",
  description,
  status: "active",
  steps: [
    { id: "backup", title: "Backup ripristinabile con sha256 (dashboard.mjs, dashboard.html, README, media/*.mjs) prima di ogni modifica", done: false },
    { id: "audit-base", title: "Audit di base e test funzionali già presenti (media/audit.mjs e media/test-functions.mjs): verificarli verdi prima di partire", done: true },
    { id: "live-diagnosi", title: "FASE 1a — Diagnosi della live view: misurare la latenza dei frame (età), catalogare le incertezze (vista vuota senza spiegazione, stallo su pagina ferma, riconnessione assente, feedback del controllo confuso)", done: false },
    { id: "live-reconnect", title: "FASE 1b — Riconnessione automatica: se il daemon/lo stream si riavvia o cambia porta, il bridge della live view deve riconnettersi da solo (oggi resta staccato e la vista sembra rotta)", done: false },
    { id: "live-autowatch", title: "FASE 1c — Auto-avvio del flusso: aprire la vista live deve avviare/riattivare il flusso da solo (niente pulsante guarda obbligatorio), e va spiegato quando non ci sono frame", done: false },
    { id: "live-fluidita", title: "FASE 1d — Fluidità durante il controllo umano: alzare il frame rate quando l'utente guida, feedback immediato del click, nessuna latenza percepita inutile", done: false },
    { id: "live-forzaframe", title: "FASE 1e — Aggiornare una pagina ferma: un modo per richiedere un frame nuovo (es. reload) senza che la vista sembri bloccata", done: false },
    { id: "features-verify", title: "FASE 2 — Verifica funzionale di OGNI feature (chat, file, goal, cron, skill, viste, browser, allegati, ricerca, export): estendere media/test-functions.mjs e correggere ciò che non è come da aspettativa", done: false },
    { id: "perf", title: "FASE 3 — Ottimizzazioni di performance: payload dello stato, latenza SSE, peso dei file serviti, eventuale codice ridondante", done: false },
    { id: "mobile", title: "FASE 4 — UX mobile: dimensioni, spaziature, elementi nascosti/visibili, ergonomia della live view su schermo piccolo", done: false },
    { id: "deploy-finale", title: "FASE 5 — Deploy finale con systemd-run + verifica post-riavvio (audit, test funzionali, prova reale della live view)", done: false },
  ],
  checklist: [
    { id: "c1", text: "VINCOLO: nessuna misura limita l'accesso del proprietario (dashboard, file, editor, sessioni restano liberi)", done: false },
    { id: "c2", text: "Nessun endpoint esistente rotto: audit a 0 problemi e test statici verdi dopo ogni fase", done: false },
    { id: "c3", text: "Live view: il frame arriva entro una soglia misurata e documentata (età del frame)", done: false },
    { id: "c4", text: "Il bridge della live view sopravvive a un riavvio del daemon (riconnessione automatica verificata)", done: false },
    { id: "c5", text: "La vista live non è mai vuota senza spiegazione: ogni stato ha un messaggio chiaro", done: false },
    { id: "c6", text: "Il controllo umano ha feedback immediato (click, tastiera, stato) e nessuna latenza percepita inutile", done: false },
    { id: "c7", text: "Ogni feature è verificata da test-functions e si comporta come da aspettativa", done: false },
    { id: "c8", text: "Nessuna regressione su web_search, fetch_content, skill e subagent", done: false },
    { id: "c9", text: "RAM e banda sotto controllo (frame rate, dimensioni frame, sessioni browser)", done: false },
    { id: "c10", text: "Documentazione aggiornata (README) con i comportamenti e i limiti reali", done: false },
  ],
};

fs.writeFileSync("/tmp/goal-opt.json", JSON.stringify(payload));
console.log("payload:", payload.steps.length, "step /", payload.checklist.length, "controlli /", description.length, "caratteri");

const env = fs.readFileSync("/root/pi-harness/.env", "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const auth = Buffer.from(`${val("DASH_USER")}:${val("DASH_PASSWORD")}`).toString("base64");
const r = await fetch("http://127.0.0.1:8420/api/goals", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
  body: JSON.stringify(payload),
});
const out = await r.json();
console.log("goal creato:", out.ok ? "id " + out.goal.id : "FALLITO", JSON.stringify(out).slice(0, 120));
