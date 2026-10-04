/**
 * TEST UI DELLE VISTE: verifica end-to-end che ogni voce dei menu apra davvero la vista
 * corrispondente e che le altre siano nascoste. È il test che copre il "cablaggio" fra
 * markup, showTab e menu: nessun controllo statico può dimostrarlo.
 *
 * Avvia da sé un'istanza isolata + un proxy per l'autenticazione, usa una sessione browser
 * dedicata ("viewtest") e spegne tutto alla fine.
 *
 * Uso: node media/test-views.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8490;
const PROXY = 8491;
const TMP = "/tmp/pi-views";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "viewtest";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 60_000,
    ...opts,
  });
const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  const parse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  // agent-browser può restituire la stringa JSON già quotata: se il primo parse dà una
  // stringa, la si interpreta di nuovo (altrimenti si otterrebbe una stringa, non un oggetto).
  let v = parse(out);
  if (typeof v === "string") v = parse(v);
  return v ?? { raw: out };
};

/* setup */
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
  DASH_USER: "vt",
  DASH_PASSWORD: "vt",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT, env, stdio: "ignore",
});
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "vt", "vt"], {
  cwd: ROOT, stdio: "ignore",
});
const cleanup = () => {
  // chiude SOLO la sessione del test (un close --all chiuderebbe anche quelle dell'utente)
  try { ab(["close"], { stdio: "ignore" }); } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let up = false;
for (let i = 0; i < 40; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PROXY}/api/state`, { headers: { Authorization: "Basic " + Buffer.from("vt:vt").toString("base64") } });
    if (r.status === 200) { up = true; break; }
  } catch {}
  await wait(1000);
}
if (!up) {
  console.log("✘ istanza di prova non partita");
  process.exit(1);
}
console.log(`istanza ${PORT} + proxy ${PROXY} attivi\n`);

/* Pulizia robusta prima di iniziare: una istanza Chrome orfana con lo stesso profilo lascia
   un SingletonLock e i tentativi successivi falliscono con
   "Failed to create .../SingletonLock: File exists". Si chiude la sessione, si uccidono
   eventuali Chrome rimasti con QUEL profilo e si rimuove il profilo del test. */
const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;
try { ab(["close"]); } catch { /* non c'era */ }
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" }); } catch { /* nessuno */ }
await new Promise((r) => setTimeout(r, 1500));
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch { /* niente */ }

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try {
    ab(["open", `http://127.0.0.1:${PROXY}/`]);
    aperto = true;
  } catch {
    await new Promise((r) => setTimeout(r, 2500));
  }
}
if (!aperto) {
  console.log("✘ non riesco ad avviare il browser di test");
  cleanup();
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 1500));
try { ab(["set", "viewport", "1280", "900"]); } catch {}
// il viewport si applica al caricamento successivo
try { ab(["open", `http://127.0.0.1:${PROXY}/`]); } catch {}

/** Stato di visibilità di tutte le viste. */
const viewsState = () =>
  evalJs(`(() => {
    const ids = ["chatView","filesView","goalsView","cronView","skillsView","progettoView","agendaView","liveView"];
    const out = { tab: document.body.dataset.tab };
    for (const id of ids) {
      const el = document.getElementById(id);
      // visibilità REALE: le viste non-chat usano l'attributo hidden, la chat è nascosta
      // dalle regole CSS body[data-tab=...]: il solo attributo non basta.
      out[id] = el ? getComputedStyle(el).display !== "none" : null;
    }
    return JSON.stringify(out);
  })()`);

const VIS = [
  // le linguette hanno ICONE SVG (non più emoji): il nome accessibile è il testo, senza simboli
  { nome: "chat", atteso: "chatView", come: "tab", label: "Chat", esatto: true },
    { nome: "files", atteso: "filesView", come: "tab", label: "File", esatto: true },
  { nome: "goals", atteso: "goalsView", come: "menu", label: "goal" },
  { nome: "cron", atteso: "cronView", come: "menu", label: "cron" },
  { nome: "skills", atteso: "skillsView", come: "menu", label: "skill" },
  { nome: "progetto", atteso: "progettoView", come: "menu", label: "progetto" },
  { nome: "agenda", atteso: "agendaView", come: "menu", label: "agenda" },
  { nome: "live", atteso: "liveView", come: "menu", label: "live" },
];
/** Apre il menu delle funzioni e sceglie una voce (il menu è un interruttore: si riprova). */
const apriVoce = async (voce) => {
  for (let i = 0; i < 3; i++) {
    try {
      ab(["find", "role", "button", "click", "--name", "features"]);
      await new Promise((r) => setTimeout(r, 500));
      ab(["find", "role", "button", "click", "--name", voce]);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  return false;
};

console.log("== Apertura di ogni vista dal menu ==");
for (const v of VIS) {
  try {
    if (v.come === "tab") {
      // Il nome accessibile va confrontato per intero: cercando «Chat» come sottostringa si trovava
      // anche «Le tue chat» (il pulsante ☰), che apre il drawer e copre le linguette — l'intera
      // sezione falliva per un test che cliccava l'elemento sbagliato.
      ab(["find", "role", "button", "click", "--name", v.label, ...(v.esatto ? ["--exact"] : [])]);
    } else {
      if (!(await apriVoce(v.label))) throw new Error(`voce «${v.label}» non trovata nel menu`);
    }
    await wait(1200);
    const s = viewsState();
    const altriVisibili = Object.keys(s).filter((k) => k.endsWith("View") && k !== v.atteso && s[k]);
    check(`cliccando «${v.label}» si apre la vista ${v.nome}`, s[v.atteso] === true && s.tab === v.nome, `tab=${s.tab} altre visibili=${altriVisibili.join(",") || "nessuna"}`);
    check(`  e le altre viste restano nascoste`, altriVisibili.length === 0, altriVisibili.join(", "));
  } catch (e) {
    ko(`cliccando «${v.label}» → errore: ${String(e.message).slice(0, 120)}`);
  }
}

console.log("\n== Ritorno alla chat dai pulsanti delle viste ==");
for (const v of ["files", "goals", "cron", "skills", "progetto", "agenda", "live"]) {
  try {
    // chiude eventuali pannelli aperti (drawer delle chat, palette): possono coprire i pulsanti
    try { ab(["press", "Escape"]); } catch {}
    await wait(300);
    if (v === "files") {
      ab(["find", "role", "button", "click", "--name", "File", "--exact"]);
    } else {
      const voce = VIS.find((x) => x.nome === v);
      if (!(await apriVoce(voce.label))) throw new Error(`voce «${voce.label}» non trovata`);
    }
    await wait(900);
    const s1 = viewsState();
    if (s1.tab !== v) throw new Error(`la vista ${v} non si è aperta (tab=${s1.tab})`);
    // il ritorno: si riprova, perché un pannello può comparire sopra il pulsante
    let tornato = false;
    for (let i = 0; i < 3 && !tornato; i++) {
      try {
        ab(["find", "role", "button", "click", "--name", "← chat"]);
        await wait(700);
        tornato = viewsState().tab === "chat";
      } catch {
        try { ab(["press", "Escape"]); } catch {}
        await wait(400);
      }
    }
    check(`da ${v} si torna alla chat`, tornato, `tab=${viewsState().tab}`);
  } catch (e) {
    ko(`ritorno da ${v} → errore: ${String(e.message).slice(0, 110)}`);
  }
}

console.log("\n== Elementi presenti nella chat ==");
{
  const el = evalJs(`(() => JSON.stringify({
    input: !!document.getElementById("input"),
    invia: !!document.getElementById("send"),
    stop: !!document.getElementById("stop"),
    storico: !!document.getElementById("histBtn"),
    allegati: !!document.getElementById("fileBtn") || !!document.querySelector("input[type=file]"),
    stats: !!document.getElementById("stats"),
  }))()`);
  check("la casella di scrittura c'è", el.input === true);
  check("il pulsante di invio c'è", el.invia === true);
  check("il pulsante di stop c'è", el.stop === true);
  check("le statistiche ci sono", el.stats === true);
}

console.log("\n== Adattamento a mobile (viewport 390x844) ==");
{
  try {
    ab(["set", "viewport", "390", "844"]);
    ab(["open", `http://127.0.0.1:${PROXY}/`]);
    await wait(2000);
    const m = evalJs(`(() => {
      const ids = ["tabChat", "tabFiles", "statsToggle", "featBtn", "send"];
      const out = { overflow: document.documentElement.scrollWidth > window.innerWidth, viewport: window.innerWidth };
      for (const id of ids) {
        const e = document.getElementById(id);
        if (!e) { out[id] = null; continue; }
        out[id] = Math.round(e.getBoundingClientRect().height);
      }
      const h = document.getElementById("histBtn");
      out.histBtn = h ? getComputedStyle(h).display : "assente";
      return JSON.stringify(out);
    })()`);
    check("su mobile non c'è scorrimento orizzontale", m.overflow === false, JSON.stringify(m));
    const piccoli = ["tabChat", "tabFiles", "statsToggle", "featBtn"].filter((k) => m[k] != null && m[k] < 44);
    check(
      "i touch target su mobile sono almeno 44px",
      piccoli.length === 0,
      piccoli.map((k) => `${k}=${m[k]}px`).join(", "),
    );
    check("su mobile lo storico prompt è nascosto", m.histBtn === "none", String(m.histBtn));

    // nella vista live, l'input deve essere comodo da toccare e il riquadro ampio
    try { ab(["find", "role", "button", "click", "--name", "features"]); } catch {}
    await wait(500);
    try { ab(["find", "role", "button", "click", "--name", "live"]); } catch {}
    await wait(1500);
    const lv = evalJs(`(() => {
      const i = document.getElementById("liveInput");
      const s = document.getElementById("liveStage");
      return JSON.stringify({ input: i ? Math.round(i.getBoundingClientRect().height) : 0, stage: s ? Math.round(s.getBoundingClientRect().height) : 0 });
    })()`);
    check("l'input della live view è comodo da toccare (>=40px)", lv.input >= 40, `${lv.input}px`);
    check("il riquadro del browser resta ampio anche su mobile (>=250px)", lv.stage >= 250, `${lv.stage}px`);
    ab(["set", "viewport", "1280", "900"]);
  } catch (e) {
    ko("sezione mobile → errore: " + String(e.message).slice(0, 120));
  }
}

cleanup();
console.log(`\n${"─".repeat(60)}\nrisultato: ${pass} ok, ${fail} falliti\n${"─".repeat(60)}`);
process.exit(fail ? 1 : 0);
