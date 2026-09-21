/**
 * PROVA END-TO-END del difetto segnalato dal proprietario:
 *
 *   «ad un certo punto vedo solo scritte bash bash bash ripetute ogni linea, ma non vedo la
 *    catena di pensiero, i file, il testo di intermezzo … si blocca la dashboard; se faccio
 *    refresh sulla pagina tutto ritorna a visualizzarsi normalmente».
 *
 * Causa: durante lo streaming i tool non erano resi DENTRO il messaggio in corso ma appesi
 * in fondo alla chat (`chat.appendChild`), fuori dal messaggio. In un turno con molte chiamate
 * `bash` il testo/pensiero restava sopra (fuori vista) e in fondo si accumulavano solo le card
 * dei tool; il refresh ricostruiva tutto dalla sessione salvata, quindi «si sistemava».
 *
 * Qui si guida il VERO browser su un turno che usa il tool `bash` più volte e si verifica:
 *  - che nessuna card di tool sia figlia diretta della chat (cioè orfana del messaggio);
 *  - che le card stiano dentro il messaggio assistant, prima del testo finale;
 *  - che l'SSE porti `toolCallId` e `summary` (progressi leggibili, non solo il nome);
 *  - che alla riconnessione lo `stream_snapshot` contenga i SEGMENTI in ordine, tool incluso.
 *
 * Avvia da sé un'istanza isolata + proxy di autenticazione e la spegne alla fine.
 * Uso: node media/test-stream-tools-browser.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8494;
const PROXY = 8495;
const TMP = "/tmp/pi-tools";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "tooltest";
const AUTH = "Basic " + Buffer.from("tt:tt").toString("base64");
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 90_000,
    ...opts,
  });
const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  const parse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  const primo = parse(out);
  if (primo === undefined) return { raw: out };
  if (typeof primo === "string") {
    const secondo = parse(primo);
    return secondo === undefined ? primo : secondo;
  }
  return primo;
};
const ui = (expr) => evalJs(`(async () => { ${expr} })()`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, opts = {}) =>
  fetch(BASE + p, { ...opts, headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) } });

/* -------- lettore SSE con riconnessione (Last-Event-ID) -------- */
async function leggiSSE({ lastEventId = null, msMax = 30000, finche = null, taglioDopo = null }) {
  const ctrl = new AbortController();
  const res = await fetch(`http://127.0.0.1:${PROXY}/events`, {
    headers: { Authorization: AUTH, ...(lastEventId ? { "Last-Event-ID": String(lastEventId) } : {}) },
    signal: ctrl.signal,
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const eventi = [];
  let buf = "";
  const scadenza = setTimeout(() => ctrl.abort(), msMax);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const blocco = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let id = null, event = "message", data = "";
        for (const riga of blocco.split("\n")) {
          if (riga.startsWith("id: ")) id = Number(riga.slice(4));
          else if (riga.startsWith("event: ")) event = riga.slice(7);
          else if (riga.startsWith("data: ")) data += riga.slice(6);
        }
        if (event === "message" && !data) continue;
        eventi.push({ id, event, data });
        if (taglioDopo && taglioDopo(eventi)) { ctrl.abort(); break; }
        if (finche && finche(eventi)) { ctrl.abort(); break; }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  } finally {
    clearTimeout(scadenza);
    try { ctrl.abort(); } catch {}
  }
  const ids = eventi.filter((e) => e.id !== null).map((e) => e.id);
  return { eventi, ultimoId: ids.length ? Math.max(...ids) : 0 };
}

/* ---------------- setup: istanza isolata + proxy ---------------- */
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
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_USER: "tt",
  DASH_PASSWORD: "tt",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], { cwd: ROOT, env, stdio: "ignore" });
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "tt", "tt"], { cwd: ROOT, stdio: "ignore" });
const cleanup = () => {
  try { ab(["close"], { stdio: "ignore" }); } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PROXY}/api/state`, { headers: { Authorization: AUTH } });
    if (r.status === 200) { up = true; break; }
  } catch {}
  await wait(1000);
}
if (!up) { console.log("✘ istanza di prova non partita"); process.exit(1); }
console.log(`istanza ${PORT} + proxy ${PROXY} attivi\n`);

/* sessione browser pulita */
const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;
try { ab(["close"]); } catch {}
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" }); } catch {}
await wait(1200);
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try { ab(["open", `http://127.0.0.1:${PROXY}/`]); aperto = true; } catch { await wait(2500); }
}
if (!aperto) { console.log("✘ non riesco ad avviare il browser di test"); cleanup(); process.exit(1); }
try { ab(["set", "viewport", "1280", "900"]); } catch {}
await wait(2000);

await api("/api/thinking", { method: "POST", body: JSON.stringify({ level: "low" }) });
ui(`if (!window.__errs) { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason))); } return 1;`);

// ---------------- 1. turno con più chiamate bash ----------------
console.log("== 1. turno con più tool: card dentro il messaggio, niente «bash» orfane ==");
const primaSSE = leggiSSE({
  msMax: 120000,
  taglioDopo: (ev) => ev.filter((e) => e.event === "tool_start").length >= 1,
});
await ui(`const i = document.getElementById("input");
  i.value = "Usa il tool bash tre volte, una chiamata per volta: esegui 'sleep 3; echo ALPHA', poi 'sleep 3; echo BETA', poi 'sleep 3; echo GAMMA'. Dopo l'ultima chiamata rispondi esattamente con: TOOL-TEST-FINE";
  i.dispatchEvent(new Event("input")); document.getElementById("send").click(); return 1;`);

// appena arriva il primo tool_start si RICONNETTE (i comandi hanno `sleep`, quindi il turno è
// ancora in corso), poi si campiona il DOM mentre la seconda connessione raccoglie in background.
const primo = await primaSSE;
const secondaSSE = leggiSSE({
  lastEventId: primo.ultimoId,
  msMax: 60000,
  finche: (ev) => ev.some((e) => e.event === "stream_snapshot"),
});

// durante lo streaming si campiona il DOM: nessuna card deve mai essere figlia diretta di #chatView
let maxOrfane = 0;
let vistoWorking = false;
for (let i = 0; i < 60; i++) {
  const stato = await ui(`return {
    orfane: document.querySelectorAll("#chatView > .tool").length,
    working: document.getElementById("dot").classList.contains("on"),
    dentro: document.querySelectorAll(".msg.assistant .tool").length,
  };`);
  if (stato && typeof stato === "object") {
    maxOrfane = Math.max(maxOrfane, Number(stato.orfane) || 0);
    if (stato.working) vistoWorking = true;
    if (!stato.working && Number(stato.dentro) > 0) break;
  }
  await wait(1000);
}
check("durante il turno non compaiono card di tool orfane (fuori dal messaggio)", maxOrfane === 0, "max orfane=" + maxOrfane);

const toolStart = primo.eventi.filter((e) => e.event === "tool_start").map((e) => JSON.parse(e.data));
check("il turno ha davvero usato il tool bash", toolStart.length >= 1, "tool_start=" + toolStart.length);
check("tool_start porta l'id della chiamata (correlazione con tool_end)", toolStart.every((t) => typeof t.toolCallId === "string" && t.toolCallId.length > 0), JSON.stringify(toolStart[0] || {}));
check("tool_start porta un riassunto leggibile (non solo «bash»)", toolStart.every((t) => typeof t.summary === "string" && t.summary.length > 0), JSON.stringify(toolStart[0] || {}));

// ---------------- 2. riconnessione a metà turno: snapshot a segmenti ----------------
console.log("\n== 2. riconnessione: lo snapshot conserva i segmenti (i tool al loro posto) ==");
const secondo = await secondaSSE;
const snapEv = secondo.eventi.find((e) => e.event === "stream_snapshot");
const snap = snapEv ? JSON.parse(snapEv.data) : null;
check("alla riconnessione arriva lo snapshot del turno", !!snap, secondo.eventi.map((e) => e.event).join(","));
check("lo snapshot contiene i segmenti in ordine", !!snap && Array.isArray(snap.segments) && snap.segments.length > 0, JSON.stringify(snap?.segments?.map((s) => s.kind)));
check("lo snapshot include il tool con il suo stato", !!snap && snap.segments.some((s) => s.kind === "tool" && s.name), JSON.stringify(snap?.segments));
check("lo snapshot mantiene i campi text/thinking per compatibilità", !!snap && typeof snap.text === "string" && typeof snap.thinking === "string");

// lascia finire il turno
for (let i = 0; i < 90; i++) {
  const st = await api("/api/state").then((r) => r.json()).catch(() => null);
  if (st && !st.streaming) break;
  await wait(1000);
}

// ---------------- 3. struttura finale del messaggio ----------------
console.log("\n== 3. a turno finito: struttura del messaggio fedele ==");
const finale = await ui(`return {
  orfane: document.querySelectorAll("#chatView > .tool").length,
  dentro: document.querySelectorAll(".msg.assistant .tool").length,
  testo: [...document.querySelectorAll(".msg.assistant .bubble")].map((b) => b.textContent).join(""),
  ordine: [...document.querySelectorAll(".msg.assistant")].slice(-1)[0]
    ? [...[...document.querySelectorAll(".msg.assistant")].slice(-1)[0].children].map((c) => c.className)
    : [],
};`);
check("nessuna card di tool è orfana nella chat", finale.orfane === 0, JSON.stringify(finale));
check("le card dei tool sono DENTRO il messaggio assistant", Number(finale.dentro) >= 1, "dentro=" + finale.dentro);
check("la risposta finale è in chat", /TOOL-TEST-FINE/i.test(String(finale.testo)), JSON.stringify(String(finale.testo).slice(-120)));
const ordine = Array.isArray(finale.ordine) ? finale.ordine : [];
const iPrimoTool = ordine.findIndex((c) => /(^|\s)tool(\s|$)/.test(String(c)));
const iUltimoTesto = ordine.map((c) => /(^|\s)bubble(\s|$)/.test(String(c))).lastIndexOf(true);
check("il testo di risposta viene DOPO le card dei tool (niente testo nascosto sopra)", iPrimoTool > -1 && iUltimoTesto > iPrimoTool, JSON.stringify(ordine));

// ---------------- 4. nessun errore JavaScript ----------------
const errs = await ui(`return window.__errs || [];`);
check("nessun errore JavaScript durante tutto il percorso", Array.isArray(errs) && errs.length === 0, JSON.stringify(errs).slice(0, 200));

console.log();
console.log(`risultato: ${pass} ok, ${fail} falliti`);
cleanup();
process.exit(fail ? 1 : 0);
