/**
 * TEST DI TENUTA (hardening): i difetti trovati nell'analisi del 2026-09-27 non devono tornare.
 *
 * Copre, con comportamenti verificabili:
 *  1. una sessione non standard (risposta senza `usage`) NON rende lo stato incalcolabile e una
 *     connessione SSE non uccide più il processo;
 *  2. la guardia di `json()` dopo l'invio degli header (nessuna ERR_HTTP_HEADERS_SENT);
 *  3. lo zip di una cartella non esce dalla root seguendo i link simbolici;
 *  4. l'aggiornamento parziale di un goal non cancella descrizione, passi e checklist;
 *  5. la rinomina non sovrascrive in silenzio una destinazione esistente;
 *  6. il nome del file nello zip è sanificato (Content-Disposition valido);
 *  7. /api/health dichiara qualcosa che dipende davvero dal file in esecuzione;
 *  8. il download di una cartella grande resta possibile quando i file fuori root non contano.
 *
 * Avvia da sé un'istanza isolata (porta 8480, cartelle in /tmp) e la spegne alla fine:
 * non tocca la produzione né le chat reali.
 *
 * Uso: node media/test-hardening.mjs
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8480;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = "/tmp/pi-hardening";
const AUTH = "Basic " + Buffer.from("test:test").toString("base64");

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (desc, cond, extra = "") => (cond ? ok(desc) : ko(`${desc}${extra ? " — " + extra : ""}`));
const section = (t) => console.log(`\n== ${t} ==`);

/* ─────────────── 2. guardia di json() dopo l'invio degli header ───────────────
 * In vitro: si estrae la funzione VERA dal sorgente del server e la si guida con due
 * risposte finte (headers non inviati / già inviati). È il caso che faceva morire il
 * processo: una writeHead dopo l'apertura dello stream.                        */
function loadJsonFn() {
  const src = fs.readFileSync(path.join(ROOT, "dashboard.mjs"), "utf8");
  const start = src.indexOf("function json(res, code, obj) {");
  if (start < 0) throw new Error("funzione json non trovata in dashboard.mjs");
  let depth = 0, end = start;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const code = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${code}; return json;`)();
}

function fakeRes({ headersSent = false } = {}) {
  const calls = { writeHead: 0, end: 0, headers: null };
  return {
    calls,
    headersSent,
    writeHead(code, headers) { calls.writeHead++; calls.headers = { code, headers }; this.headersSent = true; },
    end() { calls.end++; },
  };
}

const json = loadJsonFn();

/* ───────────────────── avvio dell'istanza isolata ───────────────────── */
fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root", "skills"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });

/** Sessione sintetica: l'ultima risposta NON ha il campo `usage` (sessione importata/scritta a mano). */
function writeBrokenSession() {
  const id = "01a0dead-0000-7000-aaaa-00000000000b";
  const ts = "2026-09-27T09:00:00.000Z";
  const lines = [
    { type: "session", version: 3, id, timestamp: ts, cwd: ROOT },
    { type: "model_change", id: "c1", parentId: null, timestamp: ts, provider: "deepseek", modelId: "deepseek-flash" },
    { type: "message", id: "c2", parentId: "c1", timestamp: ts, message: { role: "user", content: [{ type: "text", text: "ciao" }], timestamp: 0 } },
    // niente `usage`: è l'innesco del guasto
    { type: "message", id: "c3", parentId: "c2", timestamp: ts, message: { role: "assistant", content: [{ type: "text", text: "ciao a te" }], timestamp: 0 } },
  ];
  fs.writeFileSync(path.join(TMP, "sessions", `2026-09-27T09-00-00.000Z_${id}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

/** Cartella con un link simbolico che punta FUORI dalla root + molti file finti. */
function writeRootWithEscape() {
  const outside = path.join(TMP, "fuori-root");
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "riservato.txt"), "SEGRETO\n");

  const proj = path.join(TMP, "root", "proj");
  fs.mkdirSync(path.join(proj, "sub"), { recursive: true });
  fs.writeFileSync(path.join(proj, "a.txt"), "ciao\n");
  fs.writeFileSync(path.join(proj, "sub", "b.txt"), "annidato\n");
  fs.symlinkSync(outside, path.join(proj, "segreti"));            // dir fuori root
  fs.symlinkSync(path.join(outside, "riservato.txt"), path.join(proj, "passwd.txt")); // file fuori root

  // una cartella "grande" ma tutta interna: 3100 file (oltre MAX_ZIP_FILES=3000)
  const big = path.join(TMP, "root", "grande");
  fs.mkdirSync(big, { recursive: true });
  for (let i = 0; i < 3100; i++) fs.writeFileSync(path.join(big, `f${i}.txt`), "x");
}

writeBrokenSession();
writeRootWithEscape();

const env = {
  ...process.env,
  DASH_SESSION_DIR: path.join(TMP, "sessions"),
  DASH_MEDIA_DIR: path.join(TMP, "media"),
  DASH_SKILLS_DIR: path.join(TMP, "skills"),
  DASH_ROOT: path.join(TMP, "root"),
  DASH_GOALS_FILE: path.join(TMP, "goals.json"),
  DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
  DASH_ASK: "off",
  DASH_USER: "test",
  DASH_PASSWORD: "test",
  DASH_HOST: "127.0.0.1",
};
const child = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
child.stdout.on("data", (d) => (serverLog += d.toString()));
child.stderr.on("data", (d) => (serverLog += d.toString()));

async function call(method, url, body, { raw = false } = {}) {
  return fetch(BASE + url, {
    method,
    headers: { Authorization: AUTH, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => (raw ? { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) } : { status: res.status, json: await res.json().catch(() => null) }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUp(ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(BASE + "/api/health", { headers: { Authorization: AUTH } });
      if (r.ok) return true;
    } catch { /* non ancora in ascolto */ }
    await sleep(300);
  }
  return false;
}
const isAlive = () => {
  try { process.kill(child.pid, 0); return true; } catch { return false; }
};

async function run() {
  section("0. l'istanza di prova è in ascolto");
  if (!(await waitUp())) {
    ko("istanza non avviata");
    console.log(serverLog.slice(-1500));
    return;
  }
  ok(`istanza su :${PORT}`);

  section("1. guardia post-header: nessuna ERR_HTTP_HEADERS_SENT");
  {
    const r1 = fakeRes({ headersSent: false });
    json(r1, 200, { ok: true });
    check("header non ancora inviati: json scrive la risposta", r1.calls.writeHead === 1 && r1.calls.end === 1);
    const r2 = fakeRes({ headersSent: true });
    let threw = null;
    try { json(r2, 500, { error: "x" }); } catch (e) { threw = e; }
    check("header già inviati: json NON lancia (è il caso che uccideva il processo)", threw === null, threw ? String(threw) : "");
    check("header già inviati: nessuna seconda writeHead", r2.calls.writeHead === 0);
    check("header già inviati: la risposta viene comunque chiusa", r2.calls.end === 1);
  }

  section("2. sessione non standard (senza usage): stato leggibile e processo vivo");
  {
    const st = await call("GET", "/api/state");
    check("GET /api/state → 200 (non più 500)", st.status === 200, `status ${st.status}`);
    check("lo stato porta le statistiche a zero invece di fallire", st.json?.tokens?.input === 0 && st.json?.cost === 0);
    check("i messaggi della sessione sono comunque serviti", (st.json?.messages || []).length === 2, `messages ${(st.json?.messages || []).length}`);

    // il vero innesco del guasto: la pagina apre lo stream SSE
    const ctrl = new AbortController();
    let sseText = "";
    const sse = fetch(BASE + "/events", { headers: { Authorization: AUTH }, signal: ctrl.signal })
      .then(async (r) => {
        check("GET /events risponde 200 (stream aperto)", r.status === 200, `status ${r.status}`);
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        const t0 = Date.now();
        while (Date.now() - t0 < 3000) {
          const { value, done } = await reader.read();
          if (done) break;
          sseText += dec.decode(value, { stream: true });
          if (sseText.includes("event: state")) break;
        }
      })
      .catch(() => {});
    await sse;
    ctrl.abort();
    check("lo stream porta l'evento `state` iniziale", sseText.includes("event: state"));
    await sleep(500);
    check("il processo è ANCORA VIVO dopo la connessione SSE", isAlive());
    const health = await call("GET", "/api/health");
    check("il servizio risponde ancora (nessun crash-loop)", health.status === 200);
  }

  section("3. zip di una cartella: nessun file fuori dalla root");
  {
    const z = await call("GET", "/api/download?path=proj", null, { raw: true });
    check("il download della cartella riesce", z.status === 200, `status ${z.status}`);
    const names = zipEntries(z.buffer);
    check("i file interni ci sono", names.includes("a.txt") && names.includes("sub/b.txt"), names.join(","));
    check("il link a una cartella fuori root NON viene seguito", !names.some((n) => n.includes("riservato")) && !names.some((n) => n.startsWith("segreti/")), names.join(","));
    check("il link a un file fuori root NON viene incluso", !names.includes("passwd.txt"), names.join(","));
    const empty = await call("GET", "/api/download?path=grande");
    check("una cartella con troppi file INTERNI resta rifiutata (tetto rispettato)", empty.status === 413, `status ${empty.status}`);
  }

  section("4. aggiornamento parziale di un goal");
  {
    const created = await call("POST", "/api/goals", {
      title: "Goal di prova",
      description: "descrizione da non perdere",
      steps: [{ title: "passo uno" }, { title: "passo due" }],
      checklist: [{ text: "controllo uno" }],
    });
    const id = created.json?.goal?.id;
    check("goal creato", !!id);
    const upd = await call("POST", "/api/goals", { id, status: "done" });
    const g = upd.json?.goal;
    check("stato aggiornato", g?.status === "done");
    check("aggiornare il solo stato NON cancella la descrizione", g?.description === "descrizione da non perdere", JSON.stringify(g?.description));
    check("aggiornare il solo stato NON cancella i passi", (g?.steps || []).length === 2, `${(g?.steps || []).length}`);
    check("aggiornare il solo stato NON cancella la checklist", (g?.checklist || []).length === 1, `${(g?.checklist || []).length}`);
    const upd2 = await call("POST", "/api/goals", { id, steps: [{ title: "passo uno", done: true }, { title: "passo due" }] });
    check("aggiornare i passi NON cancella la checklist", (upd2.json?.goal?.checklist || []).length === 1);
    check("una modifica esplicita della descrizione funziona", (await call("POST", "/api/goals", { id, description: "nuova" })).json?.goal?.description === "nuova");
  }

  section("5. rinomina: nessuna sovrascrittura silenziosa");
  {
    fs.writeFileSync(path.join(TMP, "root", "r1.txt"), "contenuto A\n");
    fs.writeFileSync(path.join(TMP, "root", "r2.txt"), "contenuto B importante\n");
    const r = await call("POST", "/api/file/rename", { from: "r1.txt", to: "r2.txt" });
    check("rinomina su destinazione esistente → 409", r.status === 409, `status ${r.status}`);
    check("il file di destinazione è intatto", fs.readFileSync(path.join(TMP, "root", "r2.txt"), "utf8").includes("importante"));
    check("il file di partenza esiste ancora", fs.existsSync(path.join(TMP, "root", "r1.txt")));
    const r2 = await call("POST", "/api/file/rename", { from: "r1.txt", to: "r3.txt" });
    check("rinomina su destinazione libera → 200", r2.status === 200 && fs.existsSync(path.join(TMP, "root", "r3.txt")));
    const r3 = await call("POST", "/api/file/rename", { from: "r3.txt", to: "r2.txt", overwrite: true });
    check("la sovrascrittura esplicita resta possibile (overwrite: true)", r3.status === 200);
  }

  section("6. Content-Disposition dello zip sanificato");
  {
    fs.mkdirSync(path.join(TMP, "root", 'cart"ella'), { recursive: true });
    fs.writeFileSync(path.join(TMP, "root", 'cart"ella', "f.txt"), "x");
    const res = await fetch(BASE + "/api/download?path=" + encodeURIComponent('cart"ella'), { headers: { Authorization: AUTH } });
    const cd = res.headers.get("content-disposition") || "";
    check("il download riesce", res.status === 200);
    check("il nome file non contiene virgolette non protette", !/filename="[^"]*"[^"]*"/.test(cd), cd);
    check("il nome file è leggibile", /filename/i.test(cd), cd);
    await res.arrayBuffer();
  }

  section("7. /api/health dipende dal file in esecuzione");
  {
    const h = await call("GET", "/api/health");
    check("health include l'impronta del codice in esecuzione", typeof h.json?.codeHash === "string" && h.json.codeHash.length >= 8, JSON.stringify(h.json?.codeHash));
    check("l'impronta corrisponde al file su disco letto adesso", h.json?.codeHash === codeHashOf(path.join(ROOT, "dashboard.mjs")), `${h.json?.codeHash} vs ${codeHashOf(path.join(ROOT, "dashboard.mjs"))}`);
    check("health elenca le funzioni nuove (zip cartelle, anteprima SVG, card di download)", ["zip-folders", "svg-preview", "download-cards"].every((f) => (h.json?.features || []).includes(f)), (h.json?.features || []).join(","));
  }
}

function zipEntries(buf) {
  // lettura minimale del central directory di uno zip (stessa logica usata nei test del repo)
  const names = [];
  const sig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let i = 0;
  while ((i = buf.indexOf(sig, i)) >= 0) {
    const nameLen = buf.readUInt16LE(i + 28);
    names.push(buf.slice(i + 46, i + 46 + nameLen).toString("utf8"));
    i += 46 + nameLen;
  }
  return names;
}

function codeHashOf(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 16);
}

try {
  await run();
} catch (e) {
  ko("eccezione nel test: " + (e?.stack || e));
  console.log("--- log del servizio (ultime righe) ---\n" + serverLog.slice(-2000));
} finally {
  child.kill("SIGTERM");
  await sleep(300);
  if (isAlive()) child.kill("SIGKILL");
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
