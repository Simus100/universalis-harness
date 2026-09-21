/**
 * Test della domanda interattiva in un BROWSER VERO (Chrome headless via agent-browser).
 *
 * Verifica ciò che l'API non può dire: che la card esista, sia al posto giusto e sia usabile.
 *  1. la domanda appare DENTRO il messaggio dell'assistente (non orfana, non in fondo alla chat);
 *  2. ha opzioni cliccabili ≥44px, testo libero, «Salta / decidi tu» e il conto alla rovescia;
 *  3. la barra di stato dice che l'agente attende una risposta (non sembra bloccato);
 *  4. ricaricando la pagina mentre si attende, la card RIAPPARE e resta rispondibile
 *     (è il caso «telefono in tasca»: senza questo la domanda sarebbe persa);
 *  5. rispondendo con un clic il turno riprende e il testo prosegue SOTTO la domanda;
 *  6. dopo la risoluzione la card mostra l'esito e la risposta scelta, e resta nel transcript
 *     anche dopo un altro reload (domanda + risposta, non solo la risposta);
 *  7. anche «Salta» e il testo libero funzionano;
 *  8. nessun errore JavaScript durante tutto il percorso.
 *
 * Avvia da sé istanza isolata + proxy di autenticazione e spegne tutto alla fine.
 * Uso: node media/test-ask-browser.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const PORT = 8497;
const PROXY = 8498;
const TMP = "/tmp/pi-askbrowser";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "asktest";
const AUTH = "Basic " + Buffer.from("ab:ab").toString("base64");
const BASE = `http://127.0.0.1:${PROXY}`;

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

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 120_000,
    ...opts,
  });
const evalJs = (expr) => {
  let out;
  try {
    out = ab(["eval", expr]).trim();
  } catch {
    // durante un reload la pagina può non rispondere: non è un guasto del test
    return null;
  }
  const parse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const primo = parse(out);
  if (primo === undefined) return { raw: out };
  if (typeof primo === "string") {
    const secondo = parse(primo);
    return secondo === undefined ? primo : secondo;
  }
  return primo;
};
const ui = (expr) => evalJs(`(async () => { ${expr} })()`);
const api = (p, opts = {}) =>
  fetch(`http://127.0.0.1:${PORT}${p}`, {
    ...opts,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

/** Attende che una funzione JS restituisca vero (polling nel browser). */
async function attendiUI(descrizione, expr, msMax = 150_000, ogni = 1000) {
  const t0 = Date.now();
  for (;;) {
    let r = null;
    try {
      r = await ui(`return !!(${expr});`);
    } catch {
      r = null;
    }
    if (r === true) return true;
    if (Date.now() - t0 > msMax) {
      ko(`timeout in attesa di: ${descrizione}`);
      return false;
    }
    await wait(ogni);
  }
}

/** Attende che l'istanza sia di nuovo pronta a ricevere un prompt (turno concluso). */
const attendiIdle = (msMax = 180_000) =>
  attendiUI(
    "turno concluso (pulsante Invia di nuovo visibile)",
    `!document.getElementById("dot").classList.contains("on") && !document.getElementById("send").hidden`,
    msMax,
  );

/** Attende che una card NUOVA (non ancora risolta) compaia in chat. */
const attendiNuovaDomanda = (msMax = 150_000) =>
  attendiUI("una domanda in attesa", `document.querySelectorAll(".ask:not(.done)").length >= 1`, msMax);

/* ---------------- setup ---------------- */
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
  DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
  DASH_ASK_LOG_FILE: path.join(TMP, "media", "ask-log.jsonl"),
  DASH_SUBAGENT_EXT: path.join(TMP, "nessun-subagent.ts"),
  DASH_BROWSER_BIN: path.join(TMP, "nessun-browser"),
  DASH_USER: "ab",
  DASH_PASSWORD: "ab",
  DASH_HOST: "127.0.0.1",
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash"], {
  cwd: ROOT,
  env,
  stdio: "ignore",
});
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "ab", "ab"], {
  cwd: ROOT,
  stdio: "ignore",
});
const cleanup = () => {
  try {
    ab(["close"], { stdio: "ignore" });
  } catch {}
  try {
    dash.kill("SIGKILL");
  } catch {}
  try {
    proxy.kill("SIGKILL");
  } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 60; i++) {
  try {
    const r = await api("/api/state");
    if (r.status === 200) {
      up = true;
      break;
    }
  } catch {}
  await wait(500);
}
if (!up) {
  console.log("✘ istanza di prova non partita");
  cleanup();
  process.exit(1);
}
console.log(`istanza ${PORT} + proxy ${PROXY} attivi\n`);

const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;
try {
  ab(["close"]);
} catch {}
try {
  execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" });
} catch {}
await wait(1200);
try {
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
} catch {}

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try {
    ab(["open", `${BASE}/`]);
    aperto = true;
  } catch {
    await wait(2500);
  }
}
if (!aperto) {
  console.log("✘ non riesco ad avviare il browser di test");
  cleanup();
  process.exit(1);
}
try {
  ab(["set", "viewport", "1280", "900"]);
} catch {}
await wait(2500);
await api("/api/thinking", { method: "POST", body: JSON.stringify({ level: "low" }) });

const installaSpia = () =>
  ui(`if (!window.__errs) { window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message)));
       window.addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason))); }
       return 1;`);
await installaSpia();

const inviaPrompt = (testo) =>
  ui(`const i = document.getElementById("input"); i.value = ${JSON.stringify(testo)};
      i.dispatchEvent(new Event("input")); document.getElementById("send").click(); return 1;`);

/* snapshot della card, letto dal DOM vero */
const leggiCard = () =>
  ui(`
    const c = document.querySelector(".ask");
    if (!c) return null;
    const opts = [...c.querySelectorAll(".ask-opt")];
    return {
      dentroMessaggio: c.closest(".msg.assistant") !== null,
      orfana: c.parentElement && c.parentElement.id === "chatView",
      dopoLaCard: (() => {
        const wrap = c.closest(".msg.assistant"); if (!wrap) return null;
        const kids = [...wrap.children]; const i = kids.indexOf(c);
        return kids.slice(i + 1).some((k) => k.classList.contains("bubble") || k.classList.contains("thinking") || k.classList.contains("tool"));
      })(),
      opzioni: opts.map((b) => ({ label: b.dataset.label, testo: b.textContent, altezza: Math.round(b.getBoundingClientRect().height), premuto: b.getAttribute("aria-pressed") })),
      haLibero: !!c.querySelector(".ask-other"),
      haSalta: !!c.querySelector(".ask-skip"),
      haInvia: !!c.querySelector(".ask-send"),
      timer: c.querySelector(".ask-timer")?.textContent || "",
      stato: c.dataset.askStatus || null,
      pillola: c.querySelector(".ask-status")?.textContent || null,
      riepilogo: [...c.querySelectorAll(".ask-row .ask-v")].map((v) => v.textContent),
      disabilitata: c.classList.contains("disabled"),
      bottoniDisabilitati: opts.every((b) => b.disabled),
      testoDoma: c.querySelector(".ask-qt")?.textContent || "",
      barraStato: document.getElementById("streamTxt").textContent,
    };`);

/* ================= 1. la domanda appare nel messaggio ================= */
console.log("== 1. la domanda appare nella chat, dentro il messaggio ==");
await inviaPrompt(
  "Usa il tool ask_user per chiedermi su quale ambiente pubblicare, con le opzioni «Staging» (prova) e " +
    "«Produzione» (va online). Dopo la mia risposta scrivi una riga che ripete la mia scelta.",
);
const apparsa = await attendiUI("card della domanda", `document.querySelector(".ask")`, 150_000);
check("la card della domanda appare in chat", apparsa);
const c1 = await leggiCard();
check("esiste UNA sola card per la domanda (nessun doppione)", (await ui(`return document.querySelectorAll(".ask").length;`)) === 1);
check("la card sta DENTRO il messaggio dell'assistente (non orfana in fondo alla chat)", c1?.dentroMessaggio === true && c1?.orfana === false);
check("le opzioni sono presenti come bersagli cliccabili", Array.isArray(c1?.opzioni) && c1.opzioni.length >= 2);
check("i bersagli sono touch-friendly (≥44px)", (c1?.opzioni || []).every((o) => o.altezza >= 44), JSON.stringify((c1?.opzioni || []).map((o) => o.altezza)));
check("c'è il campo per il testo libero", c1?.haLibero === true);
check("c'è il pulsante per saltare", c1?.haSalta === true);
check("c'è il pulsante per inviare", c1?.haInvia === true);
check("il conto alla rovescia è visibile (nessuna attesa muta)", /⏳/.test(c1?.timer || ""), c1?.timer);
check("la barra di stato dice che l'agente attende una risposta", /attesa della tua risposta/.test(c1?.barraStato || ""), c1?.barraStato);

/* ================= 2. reload mentre si attende ================= */
console.log("\n== 2. ricaricando la pagina la domanda riappare ==");
ui(`location.reload(); return 1;`);
await wait(2500);
await installaSpia();
const riapparsa = await attendiUI("card dopo il reload", `document.querySelector(".ask")`, 60_000);
check("dopo il reload la domanda è ancora lì (l'attesa non si perde)", riapparsa === true);
const c2 = await leggiCard();
check(
  "dopo il reload la card è UNA sola (pi salva la chiamata al tool, lo snapshot la ridisegnava)",
  (await ui(`return document.querySelectorAll(".ask").length;`)) === 1,
);
check("ed è ancora rispondibile (non una card morta)", c2?.disabilitata === false && c2?.haInvia === true);
check("la posizione è ancora quella giusta", c2?.dentroMessaggio === true && c2?.orfana === false);

/* ================= 3. rispondere con un clic ================= */
console.log("\n== 3. si risponde con un clic; il turno riprende sotto la domanda ==");
const etichetta =
  (c2?.opzioni || []).map((o) => o.label).find((l) => /produz/i.test(l)) || (c2?.opzioni || []).slice(-1)[0]?.label;
check("esiste un'opzione da scegliere", !!etichetta, JSON.stringify(c2?.opzioni));
const scelta = await ui(`
  const c = document.querySelector(".ask:not(.done)");
  const b = [...c.querySelectorAll(".ask-opt")].find((x) => x.dataset.label === ${JSON.stringify(etichetta)});
  b.click();
  const premuto = b.getAttribute("aria-pressed");
  c.querySelector(".ask-send").click();
  return { premuto };`);
check("l'opzione selezionata è marcata come premuta", scelta?.premuto === "true");
const risolta = await attendiUI("card risolta", `!!document.querySelector('.ask[data-ask-status="answered"]')`, 60_000);
check("la card mostra l'esito «risposto»", risolta === true);
const c3 = await leggiCard();
check("la pillola di stato è leggibile", /risposto/.test(c3?.pillola || ""), c3?.pillola);
check("la risposta scelta è scritta nella card (riepilogo)", (c3?.riepilogo || []).some((r) => r.includes(etichetta)), JSON.stringify(c3?.riepilogo));
check("i controlli sono disattivati dopo la risposta", c3?.disabilitata === true && c3?.bottoniDisabilitati === true);
check(
  "nessuna card resta «in attesa» dopo la risposta (niente interfaccia che mente)",
  (await ui(`return document.querySelectorAll(".ask:not(.done)").length;`)) === 0,
);
// il testo che usa la scelta deve venire DOPO la card nell'ordine del documento (sotto, non sopra)
const testoDopo = await attendiUI(
  "testo dell'agente dopo la card",
  `(() => {
     const c = document.querySelector(".ask"); if (!c) return false;
     const bubbles = [...document.querySelectorAll(".msg.assistant .bubble")];
     return bubbles.some((b) => (c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && b.textContent.trim().length > 3);
   })()`,
  150_000,
);
check("il testo dell'agente arriva DOPO la domanda (non sopra, non fuori dal flusso)", testoDopo === true);
const finale = await ui(`
  const bubbles = [...document.querySelectorAll(".msg.assistant .bubble")].map((b) => b.textContent);
  return { testo: bubbles.join(" ").slice(0, 600), working: document.getElementById("dot").classList.contains("on") };`);
check("la risposta finale del modello usa la scelta fatta", new RegExp(etichetta.split(" ")[0], "i").test(finale?.testo || ""), finale?.testo);

/* ================= 4. reload dopo la risoluzione ================= */
console.log("\n== 4. domanda E risposta restano nel transcript ==");
await attendiIdle();
ui(`location.reload(); return 1;`);
await wait(3000);
await installaSpia();
const dopReload = await attendiUI("card ricostruita dal transcript", `!!document.querySelector(".ask")`, 30_000);
check("dopo il reload la card è ancora nel messaggio", dopReload === true);
const c4 = await leggiCard();
check("è mostrata come risolta, non come in attesa", c4?.stato === "answered" && c4?.disabilitata === true);
check("una sola card anche dopo il reload", (await ui(`return document.querySelectorAll(".ask").length;`)) === 1);
check("la domanda è ancora leggibile", (c4?.testoDoma || "").length > 5, c4?.testoDoma);
check("la risposta data è ancora leggibile", (c4?.riepilogo || []).some((r) => r.includes(etichetta)), JSON.stringify(c4?.riepilogo));

/* ================= 5. salto ================= */
console.log("\n== 5. «Salta / decidi tu» ==");
await attendiIdle();
await inviaPrompt(
  "Usa il tool ask_user per chiedermi quale nome dare a un file di prova, opzioni «Alfa» e «Beta». " +
    "Poi scrivi una riga che dice cosa hai deciso.",
);
const apparsa2 = await attendiNuovaDomanda();
check("una nuova domanda appare", apparsa2 === true);
await ui(`document.querySelector(".ask:not(.done) .ask-skip").click(); return 1;`);
const saltata = await attendiUI("card saltata", `!!document.querySelector('.ask[data-ask-status="declined"]')`, 60_000);
check("l'esito è «saltata» (l'agente prosegue da solo)", saltata === true);
const c5 = await ui(`
  const c = document.querySelector('.ask[data-ask-status="declined"]');
  return { pillola: c?.querySelector(".ask-status")?.textContent || "", riepilogo: [...c.querySelectorAll(".ask-row .ask-v")].map((v) => v.textContent) };`);
check("la pillola dice «saltata»", /saltata/.test(c5?.pillola || ""), c5?.pillola);
check("la risposta è marcata come non data", (c5?.riepilogo || []).some((r) => /saltata|—/.test(r)), JSON.stringify(c5?.riepilogo));
// il turno deve comunque concludersi (un salto non deve lasciare l'agente appeso)
check("il turno prosegue e si conclude anche dopo il salto", (await attendiIdle()) === true);

/* ================= 6. testo libero ================= */
console.log("\n== 6. risposta a parole proprie ==");
await inviaPrompt(
  "Usa il tool ask_user per chiedermi che stile grafico preferisco, con opzioni «Minimal» e «Colorato». " +
    "Poi ripeti esattamente il testo che ti ho scritto.",
);
const apparsa3 = await attendiNuovaDomanda();
check("terza domanda apparsa", apparsa3 === true);
ui(`
  const c = document.querySelector(".ask:not(.done)");
  const inp = c.querySelector(".ask-other");
  inp.value = "NEON-VERDE-42";
  inp.dispatchEvent(new Event("input"));
  c.querySelector(".ask-send").click();
  return 1;`);
const risoltaLibero = await attendiUI(
  "risposta libera accettata",
  `!!document.querySelector('.ask[data-ask-status="answered"]:not(:nth-of-type(1))') || !!document.querySelector('.ask[data-ask-status="answered"]')`,
  60_000,
);
check("il testo libero viene inviato e accettato", risoltaLibero === true);
const c6 = await ui(`
  const cards = [...document.querySelectorAll('.ask[data-ask-status="answered"]')];
  const c = cards[cards.length - 1];
  return { riepilogo: [...c.querySelectorAll(".ask-row .ask-v")].map((v) => v.textContent) };`);
check("il testo libero è nel riepilogo della card", JSON.stringify(c6?.riepilogo || []).includes("NEON-VERDE-42"), JSON.stringify(c6?.riepilogo));
check("il turno si conclude", (await attendiIdle()) === true);
const eco = await ui(`
  const b = [...document.querySelectorAll(".msg.assistant .bubble")].map((x) => x.textContent).join(" ");
  return { testo: b.slice(-600) };`);check("il modello ha ricevuto il testo libero", /NEON-VERDE-42/.test(eco?.testo || ""), (eco?.testo || "").slice(-160));

/* ================= 7. il pulsante delle domande in dashboard ================= */
console.log("\n== 7. pulsante ❓ domande: spegne e riaccende davvero ==");
const pill0 = await ui(`const b = document.getElementById("askToggle"); return { testo: b.textContent, on: b.classList.contains("on"), disabilitato: b.disabled };`);
check("il pulsante esiste ed è acceso di default", /ON/.test(pill0?.testo || "") && pill0?.on === true && pill0?.disabilitato === false, JSON.stringify(pill0));
await ui(`document.getElementById("askToggle").click(); return 1;`);
await attendiUI("il pulsante torna spento", `!document.getElementById("askToggle").classList.contains("on")`, 15_000);
const pill1 = await ui(`const b = document.getElementById("askToggle"); return { testo: b.textContent, on: b.classList.contains("on") };`);
check("un clic lo spegne (l'etichetta lo dice)", pill1?.on === false && !/ON/.test(pill1?.testo || ""), JSON.stringify(pill1));
const statoSpento = await (await api("/api/state")).json();
check("il server ha tolto il tool dalla lista attiva", statoSpento.ask.enabled === false && statoSpento.ask.toolActive === false);
await ui(`document.getElementById("askToggle").click(); return 1;`);
await attendiUI("il pulsante torna acceso", `document.getElementById("askToggle").classList.contains("on")`, 15_000);
const statoAcceso = await (await api("/api/state")).json();
check("un secondo clic lo riaccende", statoAcceso.ask.enabled === true && statoAcceso.ask.toolActive === true);

/* ================= 8. nessun errore JS ================= */
console.log("\n== 8. nessun errore JavaScript ==");
const errs = await ui(`return window.__errs || [];`);
check("nessun errore JavaScript durante tutto il percorso", Array.isArray(errs) && errs.length === 0, JSON.stringify(errs).slice(0, 400));

cleanup();
console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
