/**
 * Prova end-to-end del RIALLINEAMENTO della chat dopo una caduta dello stream SSE.
 *
 * Difetto protetto (segnalato dal proprietario): se lo stream cade mentre la risposta è in
 * corso e il turno finisce durante la disconnessione, l'ultimo pezzo della risposta non arriva
 * più, l'indicatore resta «working…» col pulsante ⏹ stop a schermo — «rimane come se pensasse» —
 * e l'unico rimedio è ricaricare la pagina (che ricostruisce dalla sessione salvata).
 *
 * Cause verificate e coperte qui:
 *   A. CADUTA VERA (errore di trasporto): il client deve accorgersene (`streamLost`) e
 *      riallinearsi quando la connessione torna, senza ricaricare la pagina.
 *   B. MORTE SILENZIOSA (half-open: socket aperto, nessun dato, nessun evento `error`): il
 *      watchdog deve accorgersene dal silenzio (il server manda un battito ogni 20 s),
 *      riallineare la chat E ricreare la connessione, altrimenti il turno successivo non
 *      arriverebbe più.
 *
 * In entrambi i casi il criterio è lo stesso, e non è estetico: il testo a schermo deve
 * coincidere con quello salvato nella sessione, e l'indicatore non deve restare «working…».
 *
 * Avvia da sé istanza isolata + proxy di autenticazione e spegne tutto alla fine.
 * Uso: node media/test-chat-resync-browser.mjs [modello]     (default: deepseek-flash)
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";

const ROOT = "/root/pi-harness";
const PORT = 8491;
const PROXY = 8492;
const TMP = "/tmp/pi-chatresync";
const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "resynctest";
const AUTH = "Basic " + Buffer.from("ab:ab").toString("base64");
const BASE = `http://127.0.0.1:${PROXY}`;   // percorso del BROWSER (proxy con auth iniettata)
const API = `http://127.0.0.1:${PORT}`;     // percorso del TEST: diretto, così il taglio TCP
                                            // sul proxy colpisce solo le connessioni del browser
const MODEL = process.argv[2] || "deepseek-flash";

const SOGLIA_WATCHDOG_MS = 75_000; // il watchdog scatta a 45 s di silenzio: margine ampio
const PROMPT_LUNGO =
  "Scrivi un elenco numerato di 18 consigli pratici per organizzare un piccolo orto, una frase per punto. Rispondi solo con l elenco.";

let pass = 0,
  fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const ab = (args) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 120_000,
  });
const evalJs = (expr) => {
  let out;
  try {
    out = ab(["eval", expr]).trim();
  } catch {
    return null; // durante un reload la pagina può non rispondere: non è un guasto del test
  }
  for (let i = 0; i < 2; i++) {
    try { out = JSON.parse(out); } catch { return out; }
  }
  return out;
};
const api = async (p) => {
  try {
    const r = await fetch(API + p, { headers: { authorization: AUTH } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null; // connessione interrotta o istanza che riparte: decide il chiamante
  }
};
/** Ciò che l'utente vede: indicatore, caratteri dell'ultima risposta, avviso, stato connessione. */
const vista = () =>
  evalJs(`JSON.stringify({
    dot: document.getElementById('dot').classList.contains('on'),
    stop: !document.getElementById('stop').hidden,
    char: (()=>{const b=[...document.querySelectorAll('.msg.assistant .bubble')]; return b.length? b[b.length-1].textContent.length:0})(),
    conn: document.getElementById('connTxt').textContent,
    ready: es.readyState
  })`);

const salvatoChar = async () => {
  const st = await api("/api/state");
  const a = ((st && st.messages) || []).filter((m) => m.role === "assistant");
  return (a.length ? a[a.length - 1].text || "" : "").length;
};

/** Attende che la chat sia pronta (il composer esiste): l'istanza appena avviata è più lenta. */
async function attendiComposer(maxMs = 25_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    if (evalJs("!!document.getElementById('input')") === true) return true;
    await wait(500);
  }
  return false;
}

/** Invia un prompt dal composer e attende che il turno sia davvero partito.
 *  Il primo turno di un'istanza appena avviata è più lento (cold start del provider): si ritenta. */
async function avviaTurno(prompt, tentativi = 3) {
  for (let t = 0; t < tentativi; t++) {
    if (!(await attendiComposer())) { await wait(2000); continue; }
    try {
      ab(["type", "#input", prompt]);
      ab(["press", "Enter"]);
    } catch {
      await wait(2000);
      continue;
    }
    for (let i = 0; i < 30; i++) {
      await wait(500);
      const st = await api("/api/state");
      if (st && st.streaming) return true;
    }
  }
  return false;
}

/** Attende la fine del turno LATO SERVER (è la verità: il client può essere disconnesso). */
async function attendiFineTurno(maxMs = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const st = await api("/api/state");
    if (st && !st.streaming) return true;
    await wait(500);
  }
  return false;
}

/* ---------------------------------------------------------------- avvio */
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(`${TMP}/root`, { recursive: true });
fs.mkdirSync(`${TMP}/skills`, { recursive: true });
fs.mkdirSync(`${TMP}/sessions`, { recursive: true });

const env = {
  ...process.env,
  DASH_ROOT: `${TMP}/root`,
  DASH_SKILLS_DIR: `${TMP}/skills`,
  DASH_SESSION_DIR: `${TMP}/sessions`,
  DASH_USER: "ab",
  DASH_PASSWORD: "ab",
  DASH_BROWSER_BIN: `${TMP}/nessun-browser`,
};
const dash = spawn(process.execPath, ["dashboard.mjs", "--port", String(PORT), "--model", MODEL], {
  cwd: ROOT, env, stdio: "ignore",
});
const proxy = spawn(process.execPath, ["media/ui-proxy-test.mjs", String(PROXY), String(PORT), "ab", "ab"], {
  cwd: ROOT, stdio: "ignore",
});
const cleanup = () => {
  try {
    execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, "close"], {
      stdio: "ignore",
      timeout: 20_000,
    });
  } catch {}
  try { dash.kill("SIGKILL"); } catch {}
  try { proxy.kill("SIGKILL"); } catch {}
};
process.on("exit", cleanup);

let up = false;
for (let i = 0; i < 60; i++) {
  try { await api("/api/state"); up = true; break; } catch { await wait(500); }
}
if (!up) { console.log("✘ istanza di prova non partita"); cleanup(); process.exit(1); }
console.log(`istanza :${PORT} + proxy :${PROXY} attive (modello ${MODEL})\n`);

try {
  await wait(1500);
  try {
    execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, "close"], {
      stdio: "ignore",
      timeout: 20_000,
    });
  } catch {}

  /* ------------------------------------------------ A. caduta vera (taglio TCP) */
  console.log("A. caduta vera: lo stream viene tagliato mentre la risposta è in corso");
  ab(["open", BASE + "/"]);
  await wait(2500);
  if (!(await avviaTurno(PROMPT_LUNGO))) { ko("il turno non è partito"); }
  else {
    await wait(2000);
    try { execFileSync("ss", ["-K", "-t", "dst", "127.0.0.1", "dport", "=", `:${PROXY}`]); } catch {}
    const subito = vista();
    check("il client si accorge della caduta (avviso «riconnessione…»)", /riconn/i.test(subito?.conn || ""), `conn=${subito?.conn}`);
    await attendiFineTurno();
    let riallineato = null;
    for (let i = 0; i < 12; i++) {
      await wait(1500);
      const v = vista();
      const s = await salvatoChar();
      if (v && !v.dot && v.char === s && s > 0) { riallineato = { v, s, attesa: (i + 1) * 1.5 }; break; }
    }
    if (!riallineato) {
      const v = vista();
      ko(`la chat non si è riallineata da sola (a schermo ${v?.char} caratteri, salvati ${await salvatoChar()})`);
    } else {
      check(`testo riallineato senza ricaricare (${riallineato.s} caratteri) in ~${riallineato.attesa} s`, true);
      check("indicatore non resta «working…»", !riallineato.v.dot && !riallineato.v.stop);
    }
  }

  /* --------------------------------------- B. morte silenziosa (close, nessun errore) */
  console.log("\nB. morte silenziosa: la connessione si chiude senza dare errore (half-open)");
  ab(["open", BASE + "/"]);
  await wait(2500);
  if (!(await avviaTurno(PROMPT_LUNGO))) { ko("il turno non è partito"); }
  else {
    await wait(1500);
    evalJs(`es.close(); 'chiuso'`);
    // il difetto: il turno finisce sul server, il client non lo sa più e resta «working…»
    await attendiFineTurno();
    const prima = vista();
    const salvatoPrima = await salvatoChar();
    check(
      "il difetto è riprodotto (testo tagliato e indicatore acceso)",
      !!prima && prima.dot && prima.char < salvatoPrima,
      `a schermo ${prima?.char}, salvati ${salvatoPrima}`,
    );
    let dopo = null;
    const t0 = Date.now();
    while (Date.now() - t0 < SOGLIA_WATCHDOG_MS) {
      await wait(2500);
      const v = vista();
      const s = await salvatoChar();
      if (v && !v.dot && v.char === s && s > 0) { dopo = v; break; }
    }
    if (!dopo) {
      const v = vista();
      ko(`il watchdog non ha riallineato (a schermo ${v?.char} caratteri, salvati ${await salvatoChar()})`);
    } else {
      check(`il watchdog riallinea da solo entro ${SOGLIA_WATCHDOG_MS / 1000} s (${dopo.char} caratteri)`, true);
      check("indicatore spento e nessun avviso residuo", !dopo.dot && !dopo.stop && dopo.conn === "");
      check("connessione RICREATA (altrimenti il turno successivo non arriverebbe)", dopo.ready === 1, `readyState=${dopo.ready}`);
      // la prova che serve davvero: un altro turno, senza ricaricare la pagina
      const nuovo = await avviaTurno("Rispondi solo: ok, funziona.");
      const t1 = Date.now();
      let arrivato = false;
      while (Date.now() - t1 < 30_000) {
        await wait(1000);
        const st = await api("/api/state");
        if (st && !st.streaming) {
          const a = (st.messages || []).filter((m) => m.role === "assistant");
          const testo = a.length ? a[a.length - 1].text || "" : "";
          if (testo.trim().length) { arrivato = true; check(`turno successivo ricevuto: ${JSON.stringify(testo.trim().slice(0, 30))}`, true); }
          break;
        }
      }
      if (!arrivato && nuovo) ko("il turno successivo non ha prodotto testo");
    }
  }

  /* ---------------------------------------------------------- errori JS */
  console.log("\nC. errori JavaScript nella pagina");
  let errori = "";
  try { errori = ab(["errors"]).trim(); } catch {}
  const vuoto = !errori || /nessun|no error|^$/i.test(errori);
  check("nessun errore JavaScript durante il percorso", vuoto, errori.slice(0, 200));
} finally {
  cleanup();
}

console.log(`\n${fail === 0 ? "✔ prova superata" : "✘ prova fallita"}: ${pass} controlli ok, ${fail} falliti`);
process.exit(fail === 0 ? 0 : 1);
