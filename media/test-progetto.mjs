/**
 * TEST DEL PROGETTO (cartelle scelte dall'utente).
 *
 * La feature: l'utente segna alcune cartelle come «il progetto» (stella ☆ nella vista File),
 * una è attiva; la vista 📦 le mostra con i loro file e l'agente le riceve nel contesto.
 *
 * Qui si verifica il BACKEND su un'istanza isolata (porta dedicata, root e media temporanei):
 * aggiunta, rimozione, cambio di attiva, persistenza al riavvio, errori parlanti e limiti.
 * La parte di contesto (system prompt) e la UI sono coperte dai test in browser.
 *
 * Uso: node media/test-progetto.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOTDIR = "/root/pi-harness";
const PORT = 8496;
const BASE = `http://127.0.0.1:${PORT}`;
const AUTH = "Basic " + Buffer.from("pt:pt").toString("base64");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pi-progetto-"));
const FIXTURE = path.join(TMP, "albero");
const MEDIA = path.join(TMP, "media");
const SESSIONS = path.join(TMP, "sessions");
const SKILLS = path.join(TMP, "skills");

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, extra = "") => (c ? ok(d) : ko(`${d}${extra ? " — " + extra : ""}`));

/** Richiesta all'istanza di prova. */
async function api(metodo, percorso, corpo) {
  const r = await fetch(BASE + percorso, {
    method: metodo,
    headers: { Authorization: AUTH, ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let json = null;
  try {
    json = await r.json();
  } catch {
    /* risposta senza JSON */
  }
  return { status: r.status, json };
}

let proc = null;
async function avvia() {
  proc = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--user", "pt", "--password", "pt", "--root", FIXTURE], {
    cwd: ROOTDIR,
    env: {
      ...process.env,
      DASH_ASK: "off",
      DASH_SESSION_DIR: SESSIONS,
      DASH_MEDIA_DIR: MEDIA,
      DASH_SKILLS_DIR: SKILLS,
      DASH_SESSION_SECRET_FILE: path.join(TMP, ".secret"),
      DASH_BROWSER_PREFS_FILE: path.join(TMP, "browser-prefs.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stderr.on("data", (d) => process.stderr.write("[istanza] " + d));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/state`, { headers: { Authorization: AUTH } });
      if (r.ok) return true;
    } catch {
      /* non ancora in ascolto */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}
async function ferma() {
  if (!proc) return;
  proc.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 800));
  proc = null;
}

/* --- albero di prova --------------------------------------------------- */
fs.mkdirSync(path.join(FIXTURE, "progetti", "sito-web"), { recursive: true });
fs.mkdirSync(path.join(FIXTURE, "progetti", "vuota"), { recursive: true });
fs.mkdirSync(path.join(FIXTURE, "documenti"), { recursive: true });
fs.mkdirSync(MEDIA, { recursive: true });
fs.mkdirSync(SESSIONS, { recursive: true });
fs.mkdirSync(SKILLS, { recursive: true });
fs.writeFileSync(path.join(FIXTURE, "progetti", "sito-web", "logo.svg"), "<svg/>");
fs.writeFileSync(path.join(FIXTURE, "progetti", "sito-web", "stile.css"), "body{}");
fs.writeFileSync(path.join(FIXTURE, "progetti", "sito-web", ".nascosto"), "x");
fs.writeFileSync(path.join(FIXTURE, "documenti", "nota.md"), "# nota\n");

console.log("== avvio dell'istanza di prova ==");
if (!(await avvia())) {
  console.error("✘ l'istanza non è partita");
  process.exit(1);
}
ok(`istanza in ascolto su :${PORT} (root ${FIXTURE})`);

try {
  console.log("\n== 1. progetto vuoto all'inizio ==");
  {
    const r = await api("GET", "/api/progetto");
    check("GET /api/progetto risponde 200", r.status === 200);
    check("nessuna cartella all'inizio", Array.isArray(r.json?.cartelle) && r.json.cartelle.length === 0, JSON.stringify(r.json));
  }

  console.log("\n== 2. errori parlanti ==");
  {
    const vuoto = await api("POST", "/api/progetto", { azione: "aggiungi", path: "" });
    check("path vuoto → 400", vuoto.status === 400, JSON.stringify(vuoto.json));
    const inesistente = await api("POST", "/api/progetto", { azione: "aggiungi", path: "non-esiste" });
    check("cartella inesistente → 404", inesistente.status === 404);
    check(
      "il messaggio dice quale percorso e rispetto a cosa",
      /non-esiste/.test(inesistente.json?.error || "") && /relative|relativi/.test(inesistente.json?.error || ""),
      inesistente.json?.error,
    );
    const file = await api("POST", "/api/progetto", { azione: "aggiungi", path: "documenti/nota.md" });
    check("un file (non cartella) → 400", file.status === 400, JSON.stringify(file.json));
    const fuori = await api("POST", "/api/progetto", { azione: "aggiungi", path: "../.." });
    check(
      "percorso con «..» → rifiutato con spiegazione",
      fuori.status === 400 && /senza «\.\.»/.test(fuori.json?.error || ""),
      `${fuori.status} ${fuori.json?.error || ""}`,
    );
    const ignota = await api("POST", "/api/progetto", { azione: "boh", path: "documenti" });
    check("azione sconosciuta → 400", ignota.status === 400);
  }

  console.log("\n== 3. aggiunta e scheda della cartella ==");
  {
    const r = await api("POST", "/api/progetto", { azione: "aggiungi", path: "progetti/sito-web" });
    check("aggiunta riuscita", r.status === 200 && r.json?.ok === true);
    const c = r.json.cartelle[0];
    check("la prima cartella aggiunta diventa ATTIVA", c.attiva === true && r.json.attiva === "progetti/sito-web");
    check("la scheda conta i file (i nascosti no)", c.file === 2, `file=${c.file}`);
    check("la scheda riporta i nomi", c.elenco.map((f) => f.name).sort().join(",") === "logo.svg,stile.css", JSON.stringify(c.elenco));
    check("la scheda riporta la dimensione totale", c.dimensione === 6 + 6, `dimensione=${c.dimensione}`);
    const doppia = await api("POST", "/api/progetto", { azione: "aggiungi", path: "progetti/sito-web" });
    check("aggiungere due volte non duplica", doppia.json.cartelle.length === 1);
    const vuota = await api("POST", "/api/progetto", { azione: "aggiungi", path: "progetti/vuota" });
    check("una cartella vuota entra lo stesso", vuota.status === 200 && vuota.json.cartelle.length === 2);
    const doc = await api("POST", "/api/progetto", { azione: "aggiungi", path: "documenti" });
    check("terza cartella aggiunta", doc.json.cartelle.length === 3);
  }

  console.log("\n== 4. cartella attiva ==");
  {
    const r = await api("POST", "/api/progetto", { azione: "attiva", path: "documenti" });
    check("si può cambiare l'attiva", r.json.attiva === "documenti");
    check(
      "una sola cartella è attiva",
      r.json.cartelle.filter((c) => c.attiva).length === 1,
      JSON.stringify(r.json.cartelle.map((c) => [c.path, c.attiva])),
    );
    const non = await api("POST", "/api/progetto", { azione: "attiva", path: "progetti/vuota2" });
    check("attivare una cartella non nel progetto → 404", non.status === 404);
  }

  console.log("\n== 5. stato condiviso con la dashboard ==");
  {
    const st = await api("GET", "/api/state");
    const p = st.json?.progetto;
    check("lo stato espone l'elenco dei percorsi (serve alle stelle nel file manager)", Array.isArray(p?.cartelle) && p.cartelle.includes("documenti"));
    check("lo stato espone quale è attiva", p?.attiva === "documenti");
  }

  console.log("\n== 6. rimozione ==");
  {
    const r = await api("POST", "/api/progetto", { azione: "rimuovi", path: "documenti" });
    check("rimozione riuscita", r.json.cartelle.length === 2 && !r.json.cartelle.some((c) => c.path === "documenti"));
    check("togliendo l'attiva, l'attiva passa a un'altra cartella", !!r.json.attiva && r.json.attiva !== "documenti", r.json.attiva);
  }

  console.log("\n== 7. persistenza al riavvio ==");
  {
    await ferma();
    if (!(await avvia())) {
      ko("l'istanza non è ripartita");
    } else {
      const r = await api("GET", "/api/progetto");
      check("le cartelle sono rimaste dopo il riavvio", r.json?.cartelle?.length === 2, JSON.stringify(r.json?.cartelle?.map((c) => c.path)));
      check("l'attiva è rimasta", r.json?.attiva === "progetti/sito-web", r.json?.attiva);
      const f = JSON.parse(fs.readFileSync(path.join(MEDIA, "progetto.json"), "utf8"));
      check("il file di stato è leggibile e coerente", Array.isArray(f.cartelle) && f.cartelle.length === 2);
    }
  }

  console.log("\n== 8. limite e svuotamento ==");
  {
    for (let i = 0; i < 20; i++) {
      fs.mkdirSync(path.join(FIXTURE, `c${i}`), { recursive: true });
      await api("POST", "/api/progetto", { azione: "aggiungi", path: `c${i}` });
    }
    const r = await api("GET", "/api/progetto");
    check("il numero di cartelle è limitato (12)", r.json.cartelle.length === 12, `cartelle=${r.json.cartelle.length}`);
    const svuota = await api("POST", "/api/progetto", { azione: "svuota" });
    check("svuotare azzera tutto", svuota.json.cartelle.length === 0 && svuota.json.attiva === "");
  }
} finally {
  await ferma();
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
