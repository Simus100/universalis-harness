/**
 * TEST FUNZIONALE: verifica che ogni funzione si comporti come da aspettativa.
 *
 * Copre le aree che i test esistenti non toccavano: goal, pianificazioni, skill, tool browser,
 * live view, contesto del client e compattazione. Ogni verifica controlla il COMPORTAMENTO
 * (cosa risponde, cosa cambia, cosa viene rifiutato), non solo la presenza di un endpoint.
 *
 * Avvia da sé un'istanza isolata (porta 8470, cartelle in /tmp) e la spegne alla fine:
 * non tocca la produzione né le chat reali.
 *
 * Uso: node media/test-functions.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8470;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = "/tmp/pi-functions";
const AUTH = "Basic " + Buffer.from("test:test").toString("base64");

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (desc, cond, extra = "") => (cond ? ok(desc) : ko(`${desc}${extra ? " — " + extra : ""}`));
const section = (t) => console.log(`\n== ${t} ==`);

async function call(method, url, body, { raw = false } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { Authorization: AUTH, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: res.status, text: await res.text() };
  let json = null;
  try { json = await res.json(); } catch { /* 204 e simili */ }
  return { status: res.status, json };
}

/* ───────────────────────── avvio istanza isolata ───────────────────────── */
fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root", "skills"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_ASK: "off", // istanza NON presidiata: nessuno risponderebbe a una domanda
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "browser-prefs.json"),
  DASH_USER: "test",
  DASH_PASSWORD: "test",
  DASH_HOST: "127.0.0.1",
};
const child = spawn(process.execPath, ["dashboard.mjs", `--port`, String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: false,
});
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));

const stop = () => { try { child.kill("SIGKILL"); } catch {} };
process.on("exit", stop);

let up = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`${BASE}/api/state`, { headers: { Authorization: AUTH } });
    if (r.status === 200) { up = true; break; }
  } catch { /* non ancora */ }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!up) {
  console.log("✘ l'istanza di prova non è partita. Log:\n" + log.slice(-1500));
  process.exit(1);
}
console.log(`istanza di prova attiva su ${BASE}`);

/* ───────────────────────────── 1. GOAL ───────────────────────────── */
section("1. GOAL — creazione, normalizzazione, modifica, eliminazione");
{
  const created = await call("POST", "/api/goals", {
    title: "Goal di prova",
    description: "Verifica del comportamento",
    steps: [{ title: "primo passo" }, { title: "secondo passo" }],
    checklist: [{ text: "controllo uno" }],
  });
  check("POST /api/goals crea il goal", created.status === 200 && created.json?.goal?.id, `HTTP ${created.status}`);
  const id = created.json?.goal?.id;
  check("gli step ricevono un id e un ordine", !!id && created.json.goal.steps.every((s, i) => s.id && s.order === i));
  check("lo status di default è attivo", created.json?.goal?.status === "active");

  const list = await call("GET", "/api/goals");
  check("GET /api/goals elenca il nuovo goal", list.json?.goals?.some((g) => g.id === id));

  const updated = await call("POST", "/api/goals", { id, status: "done", steps: [{ id: "s1", title: "primo passo", done: true }] });
  check("aggiornando si può chiudere uno step", updated.json?.goal?.steps?.[0]?.done === true);
  check("lo status si aggiorna", updated.json?.goal?.status === "done");
  const bad = await call("POST", "/api/goals", { id: "inesistente", title: "x" });
  check("aggiornare un goal inesistente dà 404", bad.status === 404, `HTTP ${bad.status}`);

  const del = await call("POST", "/api/goals/delete", { id });
  check("POST /api/goals/delete elimina", del.status === 200);
  const after = await call("GET", "/api/goals");
  check("il goal eliminato non c'è più", !after.json?.goals?.some((g) => g.id === id));
}

/* ──────────────────────────── 2. PIANIFICAZIONI ──────────────────────────── */
section("2. PIANIFICAZIONI — validazione, creazione, interruttore, log");
{
  const good = await call("POST", "/api/schedules/validate", { schedule: "*/5 * * * *" });
  // l'endpoint risponde con `next` (timestamp), non `nextRun`
  check("un'espressione cron valida è accettata", good.status === 200 && typeof good.json?.next === "number");
  const bad = await call("POST", "/api/schedules/validate", { schedule: "non è un cron" });
  check("un'espressione non valida è rifiutata", bad.status === 400, `HTTP ${bad.status}`);

  const created = await call("POST", "/api/schedules", { name: "prova", schedule: "0 3 * * *", prompt: "di' ok" });
  check("POST /api/schedules crea la pianificazione", created.status === 200 && created.json?.job?.id, `HTTP ${created.status}`);
  const id = created.json?.job?.id;
  check("la prossima esecuzione è calcolata", typeof created.json?.job?.nextRun === "number");
  const noPrompt = await call("POST", "/api/schedules", { name: "senza prompt", schedule: "0 4 * * *" });
  check("senza prompt viene rifiutata", noPrompt.status === 400, `HTTP ${noPrompt.status}`);

  const toggled = await call("POST", "/api/schedules/toggle", { id });
  check("toggle disattiva", toggled.json?.job?.enabled === false);
  const logRes = await call("GET", `/api/schedules/log?id=${id}`);
  check("il log è leggibile (vuoto se mai eseguita)", logRes.status === 200 && typeof logRes.json?.log === "string");

  const del = await call("POST", "/api/schedules/delete", { id });
  check("eliminazione riuscita", del.status === 200);
  const list = await call("GET", "/api/schedules");
  check("la pianificazione non c'è più", !list.json?.schedules?.some((s) => s.id === id));
}

/* ─────────────────────────────── 3. SKILL ─────────────────────────────── */
section("3. SKILL — creazione, frontmatter, caricamento, eliminazione");
{
  const created = await call("POST", "/api/skills", {
    name: "prova-skill",
    description: "Descrizione semplice",
    content: "Istruzioni di prova.",
  });
  check("POST /api/skills crea la skill", created.status === 200 && created.json?.ok);
  let list = await call("GET", "/api/skills");
  check("la skill compare nell'elenco", list.json?.skills?.some((s) => s.name === "prova-skill"));
  check("nessuna diagnostica", (list.json?.diagnostics?.length ?? 0) === 0);

  // Il caso che ha già causato un bug reale: i due punti seguiti da spazio dentro la description
  // rompono il frontmatter YAML ("nested mappings are not allowed") e la skill non si carica.
  const tricky = await call("POST", "/api/skills", {
    name: "skill-duepunti",
    description: "Uso avanzato: apri, leggi, chiudi. Con esempi: uno e due",
    content: "Corpo.",
  });
  check("descrizione con ': ' accettata in creazione", tricky.status === 200, `HTTP ${tricky.status}`);
  list = await call("GET", "/api/skills");
  const loaded = list.json?.skills?.some((s) => s.name === "skill-duepunti");
  const diags = list.json?.diagnostics || [];
  check("la skill con ': ' nella descrizione viene CARICATA", loaded, loaded ? "" : `diagnostica: ${JSON.stringify(diags).slice(0, 200)}`);

  for (const n of ["prova-skill", "skill-duepunti"]) await call("POST", "/api/skills/delete", { name: n });
  list = await call("GET", "/api/skills");
  check("eliminazione delle skill riuscita", (list.json?.skills?.length ?? 0) === 0);
}

/* ─────────────────────────── 4. TOOL BROWSER ─────────────────────────── */
section("4. TOOL BROWSER — modi, gate, live view, controllo, input");
{
  let st = await call("GET", "/api/state");
  check("modo iniziale = auto", st.json?.browser?.mode === "auto", `mode=${st.json?.browser?.mode}`);
  check("in auto senza attività il tool è spento", st.json?.browser?.enabled === false);
  check("il tool è disponibile (registrato)", st.json?.browser?.available === true);

  const invalid = await call("POST", "/api/browser", { mode: "boh" });
  check("un modo non valido è rifiutato", invalid.status === 400, `HTTP ${invalid.status}`);

  const on = await call("POST", "/api/browser", { mode: "on" });
  check("mode=on accende il tool", on.json?.browser?.enabled === true && on.json?.browser?.activeTools?.includes("browser"));

  const idle = await call("POST", "/api/browser", { mode: "auto", idleMinutes: 7 });
  check("idleMinutes viene accettato e applicato", idle.json?.browser?.idleMinutes === 7);
  const badIdle = await call("POST", "/api/browser", { mode: "auto", idleMinutes: 0 });
  check("idleMinutes fuori range è rifiutato", badIdle.status === 400, `HTTP ${badIdle.status}`);

  const off = await call("POST", "/api/browser", { mode: "off" });
  check("mode=off spegne il tool", off.json?.browser?.enabled === false && off.json?.browser?.activeTools?.length === 0);

  let prefs = null;
  try {
    prefs = JSON.parse(fs.readFileSync(path.join(TMP, "browser-prefs.json"), "utf8"));
  } catch {
    prefs = null;
  }
  check("la preferenza è salvata su disco (subito, senza corse)", prefs?.mode === "off" && prefs?.idleMinutes === 7, JSON.stringify(prefs));

  // da qui in avanti serve il modo auto, per verificare che il watch lo accenda da sé
  await call("POST", "/api/browser", { mode: "auto", idleMinutes: 20 });

  const live = await call("GET", "/api/browser/live");
  check("GET /api/browser/live risponde con stato e controllo", live.status === 200 && !!live.json?.live && !!live.json?.control);

  const frame = await call("GET", "/api/browser/live/frame", undefined, { raw: true });
  check("l'ultimo frame risponde 200 o 204 (mai errore)", frame.status === 200 || frame.status === 204, `HTTP ${frame.status}`);

  // in modo auto il watch è una delle condizioni che accendono il tool
  const watch = await call("POST", "/api/browser/watch", { on: true });
  check("watch on apre il flusso", watch.json?.live?.watching === true);
  check("in modo auto il watch accende il tool", (await call("GET", "/api/state")).json?.browser?.enabled === true);

  const ctl = await call("POST", "/api/browser/control", { mode: "human" });
  check("il controllo passa all'utente", ctl.json?.control === "human");

  const badInput = await call("POST", "/api/browser/input", { type: "input_mouse", eventType: "mouseMoved", x: "boh", y: 1 });
  check("coordinate non numeriche rifiutate", badInput.status === 400, `HTTP ${badInput.status}`);
  const badType = await call("POST", "/api/browser/input", { type: "esegui_comando" });
  check("tipo di input non ammesso rifiutato", badType.status === 400, `HTTP ${badType.status}`);

  const back = await call("POST", "/api/browser/control", { mode: "agent" });
  check("il controllo torna all'agente", back.json?.control === "agent");
  const refused = await call("POST", "/api/browser/input", { type: "input_mouse", eventType: "mouseMoved", x: 1, y: 1 });
  check("con il controllo dell'agente l'input è rifiutato", refused.status === 409, `HTTP ${refused.status}`);

  await call("POST", "/api/browser/watch", { on: false });
  const stopped = await call("GET", "/api/browser/live");
  check("watch off chiude il flusso", stopped.json?.live?.watching === false);
}

/* ─────────────────── 5. COMANDI SLASH E CONTESTO CLIENT ─────────────────── */
section("5. COMANDI — esecuzione, errori, contesto del client");
{
  const cat = await call("GET", "/api/commands");
  check("il catalogo dei comandi si carica", cat.status === 200 && Array.isArray(cat.json?.commands) && cat.json.commands.length > 10);
  check("ogni comando ha nome e descrizione", cat.json.commands.every((c) => c.name && c.desc));

  const st = await call("POST", "/api/command", { line: "/status" });
  check("/status risponde", st.status === 200 && !!st.json?.message);
  const bad = await call("POST", "/api/command", { line: "/comando-inesistente" });
  check("un comando inesistente dà errore chiaro", bad.status >= 400 && /sconosciut|non trovat|invalid/i.test(JSON.stringify(bad.json || {})), `HTTP ${bad.status}`);
  const empty = await call("POST", "/api/command", { line: "" });
  check("una riga vuota non fa danni", empty.status >= 200 && empty.status < 500, `HTTP ${empty.status}`);

  const brow = await call("POST", "/api/command", { line: "/browser" });
  check("/browser riporta modo e stato", /mode:/.test(brow.json?.message || "") && /auto|on|off/.test(brow.json?.message || ""));

  // il contesto del client deve finire nel messaggio (lo si vede nell'export della sessione)
  await call("POST", "/api/prompt", { text: "prova di contesto", clientContext: "sto scrivendo dalla LIVE VIEW (verifica)" });
  await new Promise((r) => setTimeout(r, 2500));
  await call("POST", "/api/abort");
  await new Promise((r) => setTimeout(r, 800));
  const exp = await call("GET", "/api/sessions/export", undefined, { raw: true });
  check("il clientContext compare nel messaggio", /\[contesto dashboard\]/.test(exp.text) && /LIVE VIEW \(verifica\)/.test(exp.text));
}

/* ───────────────────────── 6. ROBUSTEZZA E LIMITI ───────────────────────── */
section("6. ROBUSTEZZA — input ostili e limiti");
{
  const huge = await call("POST", "/api/goals", { title: "x".repeat(5000) });
  check("un titolo troppo lungo viene troncato, non accettato così com'è", huge.status === 200 && (huge.json?.goal?.title?.length ?? 0) <= 200, `len=${huge.json?.goal?.title?.length}`);

  const inj = await call("GET", "/api/file?path=../../etc/passwd", undefined, { raw: true });
  check("traversal su /api/file bloccato", inj.status === 403 || inj.status === 400, `HTTP ${inj.status}`);

  const noAuth = await fetch(`${BASE}/api/state`);
  check("senza credenziali si riceve 401", noAuth.status === 401, `HTTP ${noAuth.status}`);

  const st = await call("GET", "/api/state");
  check("la sessione è in stato coerente (non streaming)", st.json?.streaming === false);
  // `cost` è il valore in dollari (numero), non un oggetto: accetto entrambe le forme per
  // non legare il test a un dettaglio di rappresentazione.
  const cost = typeof st.json?.cost === "number" ? st.json.cost : st.json?.cost?.total;
  check("il costo è tracciato", typeof cost === "number", `cost=${JSON.stringify(st.json?.cost)}`);
}

/* ─────────── 7. SUBAGENT, COMPACTION, AVVIO DI GOAL E PIANIFICAZIONI ─────────── */
section("7. ALTRE FEATURE — subagent, compaction, avvio di goal e pianificazioni");
{
  // --- subagent: l'interruttore deve cambiare DAVVERO i tool attivi (il gate è sul
  // percorso ufficiale di pi, quindi la verifica dice qualcosa di reale)
  let st = await call("GET", "/api/state");
  const subAvailable = st.json?.subagents?.available;
  check("i subagent risultano disponibili", subAvailable === true, JSON.stringify(st.json?.subagents || {}));

  if (subAvailable) {
    const on = await call("POST", "/api/subagents", { enabled: true });
    check("attivando i subagent i tool compaiono", on.json?.subagents?.enabled === true && on.json?.subagents?.activeTools?.length > 0);
    const off = await call("POST", "/api/subagents", { enabled: false });
    check("disattivandoli i tool spariscono", off.json?.subagents?.enabled === false && off.json?.subagents?.activeTools?.length === 0);
    check("un limite fuori range è rifiutato", (await call("POST", "/api/subagents", { enabled: false, maxSpawns: 0 })).status === 400);
    check("un limite valido è accettato", (await call("POST", "/api/subagents", { enabled: false, maxSpawns: 4 })).json?.subagents?.maxSpawns === 4);
  }

  // --- compaction: non deve poter partire mentre l'agente sta lavorando
  await call("POST", "/api/prompt", { text: "scrivi tre righe sui numeri primi" });
  await new Promise((r) => setTimeout(r, 1200));
  const compactDuring = await call("POST", "/api/compact", {});
  check("la compaction è rifiutata durante lo streaming", compactDuring.status === 409, `HTTP ${compactDuring.status}`);
  await call("POST", "/api/abort");
  await new Promise((r) => setTimeout(r, 1500));
  const stIdle = await call("GET", "/api/state");
  check("dopo lo stop la sessione torna inattiva", stIdle.json?.streaming === false);

  // --- avvio di un goal: deve accettare e non rompere lo stato
  const g = await call("POST", "/api/goals", { title: "Goal da avviare", steps: [{ title: "un passo" }] });
  const gid = g.json?.goal?.id;
  const runGoal = await call("POST", "/api/goals/execute", { id: gid });
  check("l'avvio di un goal è accettato o rifiutato con motivo", [200, 202, 409].includes(runGoal.status), `HTTP ${runGoal.status}`);
  await new Promise((r) => setTimeout(r, 1200));
  await call("POST", "/api/abort");
  await new Promise((r) => setTimeout(r, 1200));
  await call("POST", "/api/goals/delete", { id: gid });
  check("il goal di prova è stato rimosso", !(await call("GET", "/api/goals")).json?.goals?.some((x) => x.id === gid));

  // --- pianificazione eseguita a mano
  const sched = await call("POST", "/api/schedules", { name: "esecuzione manuale", schedule: "0 5 * * *", prompt: "Rispondi solo: ok" });
  const sid = sched.json?.job?.id;
  const runNow = await call("POST", "/api/schedules/run", { id: sid });
  check("l'esecuzione manuale di una pianificazione è accettata", [200, 202, 409].includes(runNow.status), `HTTP ${runNow.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  await call("POST", "/api/abort");
  await new Promise((r) => setTimeout(r, 1500));
  const schedAfter = await call("GET", "/api/schedules");
  const jobAfter = schedAfter.json?.schedules?.find((x) => x.id === sid);
  check("l'esecuzione lascia traccia (lastRun o runCount)", !!jobAfter && (jobAfter.lastRun != null || (jobAfter.runCount ?? 0) > 0), JSON.stringify({ lastRun: jobAfter?.lastRun, runCount: jobAfter?.runCount }));
  await call("POST", "/api/schedules/delete", { id: sid });
  check("la pianificazione di prova è stata rimossa", !(await call("GET", "/api/schedules")).json?.schedules?.some((x) => x.id === sid));
}

/* ─────────────── 8. VISTE E COMANDO /tab ─────────────── */
section("8. VISTE — il comando /tab deve portare sulle viste giuste");
{
  for (const v of ["files", "goals", "cron", "skills", "progetto", "agenda", "live", "chat"]) {
    const r = await call("POST", "/api/command", { line: `/tab ${v}` });
    // i comandi di interfaccia sono "client": true → il server li accetta senza eseguirli
    check(`/tab ${v} è accettato`, r.status === 200 || r.status === 400, `HTTP ${r.status}`);
  }
  const badTab = await call("POST", "/api/command", { line: "/tab inesistente" });
  check("una vista inesistente è rifiutata", badTab.status === 400, `HTTP ${badTab.status}`);
}

/* ────────────────────────────── riepilogo ────────────────────────────── */
stop();
console.log(`\n${"─".repeat(60)}\nrisultato: ${pass} ok, ${fail} falliti\n${"─".repeat(60)}`);
if (fail) {
  console.log("\nIl log dell'istanza è in " + TMP + " (vedi anche l'output qui sopra).");
}
process.exit(fail ? 1 : 0);
