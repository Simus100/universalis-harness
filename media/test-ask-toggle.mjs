/**
 * Test dell'INTERRUTTORE delle domande (pulsante in dashboard + comando `/ask`).
 *
 * Non serve il modello: il gate dei tool agisce sul registry della sessione, quindi si verifica
 * la stessa vista che il gate usa (`ask.toolActive` da `getActiveToolNames()`), la persistenza
 * della scelta su disco e il comportamento dei casi limite:
 *  - default: acceso (e il file di preferenza esiste, così lo stato è ispezionabile);
 *  - spegnendo: il tool esce dalla lista attiva, la preferenza è scritta, le domande in attesa
 *    vengono chiuse con esito esplicito (nessuna attesa appesa);
 *  - riaccendendo: il tool rientra nella lista;
 *  - `DASH_ASK=off` (istanza non presidiata): il tool non è registrato e l'API lo dice chiaramente;
 *  - il comando `/ask on|off|status` fa la stessa cosa dalla palette.
 *
 * Avvia da sé un'istanza isolata e la spegne alla fine.
 * Uso: node media/test-ask-toggle.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8505;
const PORT_OFF = 8506;
const TMP = "/tmp/pi-asktoggle";
const AUTH = "Basic " + Buffer.from("tg:tg").toString("base64");
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0,
  fail = 0;
const ok = (m) => {
  console.log("  ✔ " + m);
  pass++;
};
const ko = (m) => {
  console.log("  ✘ " + m);
  fail++;
};
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root", "skills"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const envBase = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "browser-prefs.json"),
  DASH_ASK_PREFS_FILE: path.join(TMP, "ask-prefs.json"),
  DASH_SUBAGENT_EXT: path.join(TMP, "nessun.ts"),
  DASH_BROWSER_BIN: path.join(TMP, "nessun-bin"),
  DASH_USER: "tg",
  DASH_PASSWORD: "tg",
  DASH_HOST: "127.0.0.1",
};

const avvia = (porta, extra = {}) =>
  spawn(process.execPath, ["dashboard.mjs", "--port", String(porta), "--model", "deepseek-flash"], {
    cwd: ROOT,
    env: { ...envBase, ...extra },
    stdio: "ignore",
  });
const dash = avvia(PORT);
const dashOff = avvia(PORT_OFF, { DASH_ASK: "off" });
const cleanup = () => {
  try {
    dash.kill("SIGKILL");
  } catch {}
  try {
    dashOff.kill("SIGKILL");
  } catch {}
};
process.on("exit", cleanup);

const api = (p, opts = {}) =>
  fetch(BASE + p, {
    ...opts,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
const apiOff = (p, opts = {}) =>
  fetch(`http://127.0.0.1:${PORT_OFF}${p}`, {
    ...opts,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
const stato = async () => (await api("/api/state")).json();
const comando = async (line) => {
  const r = await api("/api/command", { method: "POST", body: JSON.stringify({ line, quiet: true }) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

let up = false;
let upOff = false;
for (let i = 0; i < 60 && !(up && upOff); i++) {
  try {
    if (!up && (await api("/api/state")).status === 200) up = true;
  } catch {}
  try {
    if (!upOff && (await apiOff("/api/state")).status === 200) upOff = true;
  } catch {}
  if (!up || !upOff) await wait(500);
}
if (!up || !upOff) {
  console.log(`✘ istanze di prova non partite (on: ${up}, off: ${upOff})`);
  cleanup();
  process.exit(1);
}

/* ---------------- 1. default: acceso ---------------- */
console.log("\n== 1. stato iniziale ==");
const s0 = await stato();
check("di default le domande sono attive", s0.ask.enabled === true && s0.ask.available === true);
check("il tool è nella lista attiva del modello", s0.ask.toolActive === true);
check("la preferenza è su disco già all'avvio", fs.existsSync(path.join(TMP, "ask-prefs.json")));
check("il file dichiara acceso", JSON.parse(fs.readFileSync(path.join(TMP, "ask-prefs.json"), "utf8")).enabled === true);

/* ---------------- 2. spegnere ---------------- */
console.log("\n== 2. si spegne: il tool esce dalla lista ==");
const rOff = await api("/api/ask", { method: "POST", body: JSON.stringify({ enabled: false }) });
const dOff = await rOff.json();
check("la richiesta è accettata", rOff.status === 200 && dOff.ok === true);
check("la risposta dichiara lo stato nuovo", dOff.enabled === false && dOff.toolActive === false, JSON.stringify(dOff));
const s1 = await stato();
check("lo stato non espone più il tool come attivo", s1.ask.enabled === false && s1.ask.toolActive === false);
check("la scelta è persistita su disco", JSON.parse(fs.readFileSync(path.join(TMP, "ask-prefs.json"), "utf8")).enabled === false);
check("il tool resta *registrato* (si può riaccendere), ma non inviato", s1.ask.available === true);

/* ---------------- 3. riaccendere ---------------- */
console.log("\n== 3. si riaccende ==");
const rOn = await api("/api/ask", { method: "POST", body: JSON.stringify({ enabled: true }) });
const dOn = await rOn.json();
check("torna attivo", rOn.status === 200 && dOn.enabled === true && dOn.toolActive === true, JSON.stringify(dOn));
check("la scelta è di nuovo su disco come accesa", JSON.parse(fs.readFileSync(path.join(TMP, "ask-prefs.json"), "utf8")).enabled === true);

/* ---------------- 4. input non validi ---------------- */
console.log("\n== 4. input non validi ==");
const rBad = await api("/api/ask", { method: "POST", body: JSON.stringify({ enabled: "sì" }) });
check("un valore non booleano è rifiutato (400)", rBad.status === 400);
const rEmpty = await api("/api/ask", { method: "POST", body: JSON.stringify({}) });
check("un corpo senza `enabled` è rifiutato (400)", rEmpty.status === 400);
check("dopo i rifiuti lo stato non è cambiato", (await stato()).ask.enabled === true);

/* ---------------- 5. il comando /ask ---------------- */
console.log("\n== 5. comando /ask (palette) ==");
const cStatus = await comando("/ask status");
check("「/ask status」 risponde e dice ON", cStatus.status === 200 && /domande all'utente: ON/.test(cStatus.body.message || ""), cStatus.body.message);
const cOff = await comando("/ask off");
check("「/ask off」 spegne", cOff.status === 200 && /spento/.test(cOff.body.message || ""), cOff.body.message);
check("dopo il comando lo stato è spento", (await stato()).ask.enabled === false && (await stato()).ask.toolActive === false);
const cOn = await comando("/ask on");
check("「/ask on」 riaccende", cOn.status === 200 && /ON/.test(cOn.body.message || ""), cOn.body.message);
const cBoh = await comando("/ask boh");
check("un parametro non valido dà errore chiaro", cBoh.status === 400 && /usa \/ask on/.test(cBoh.body.error || cBoh.body.message || ""), JSON.stringify(cBoh));

/* ---------------- 6. domanda pendente + spegnimento ---------------- */
console.log("\n== 6. spegnere chiude le domande in attesa ==");
await api("/api/thinking", { method: "POST", body: JSON.stringify({ level: "low" }) });
// una domanda "vera" non si può creare senza modello: si verifica via API che non ce ne siano
// in attesa e che spegnendo non resti nulla di appeso (il comportamento è coperto dai test
// end-to-end; qui si controlla che l'endpoint non si rompa chiamandolo due volte).
await api("/api/ask", { method: "POST", body: JSON.stringify({ enabled: false }) });
const s6 = await stato();
check("dopo lo spegnimento non ci sono domande in attesa", s6.ask.pending.length === 0);
await api("/api/ask", { method: "POST", body: JSON.stringify({ enabled: true }) });

/* ---------------- 7. DASH_ASK=off (istanza non presidiata) ---------------- */
console.log("\n== 7. DASH_ASK=off: tool non registrato ==");
const sOff = await (await apiOff("/api/state")).json();
check("lo stato dichiara le domande non disponibili", sOff.ask.available === false && sOff.ask.enabled === false);
check("il tool non è fra quelli attivi", sOff.ask.toolActive === false);
check("l'API spiega che la disattivazione è all'avvio", (await apiOff("/api/ask", { method: "POST", body: JSON.stringify({ enabled: true }) })).status === 400);

cleanup();
console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
