/**
 * Test della domanda interattiva nell'HARNESS DA TERMINALE (`harness.mjs`), con il MODELLO VERO.
 *
 * Un terminale vero serve: `harness.mjs` risponde alle domande con readline, e con un input già
 * chiuso (EOF) l'interfaccia si chiude e la domanda non si può raccogliere. Qui si usa uno pseudo
 * terminale (`script`) e si scrive la risposta SOLO quando la domanda è comparsa: è esattamente
 * il comportamento di una persona davanti alla tastiera.
 *
 * Verifica:
 *  1. il tool `ask_user` è registrato nell'harness da terminale;
 *  2. la domanda appare con opzioni numerate e, digitando un numero, la risposta arriva al modello;
 *  3. il modello prosegue usando la scelta fatta;
 *  4. con un invio a vuoto la domanda risulta «saltata» e il turno NON si blocca;
 *  5. il REPL esce pulito con /exit (nessun errore, nessun processo appeso).
 *
 * Uso: node media/test-ask-cli.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const TMP = "/tmp/pi-askcli";
const LOG = path.join(TMP, "ask-log.jsonl");

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
const pulisci = (s) => String(s).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const env = { ...process.env, DASH_ASK_LOG_FILE: LOG };
const proc = spawn("script", ["-qec", "node harness.mjs --think low", "/dev/null"], {
  cwd: ROOT,
  env,
  stdio: ["pipe", "pipe", "pipe"],
});
let out = "";
proc.stdout.on("data", (b) => (out += b.toString("utf8")));
proc.stderr.on("data", (b) => (out += b.toString("utf8")));
const cleanup = () => {
  try {
    proc.kill("SIGKILL");
  } catch {}
};
process.on("exit", cleanup);

/** Attende che nell'output compaia qualcosa (o fallisce senza bloccare il test). */
async function attendiOutput(descrizione, regex, msMax = 180_000) {
  const t0 = Date.now();
  for (;;) {
    if (regex.test(pulisci(out))) return true;
    if (Date.now() - t0 > msMax) {
      ko(`timeout in attesa di: ${descrizione}`);
      console.log("--- ultime righe ---\n" + pulisci(out).split("\n").slice(-12).join("\n"));
      return false;
    }
    await wait(500);
  }
}
/** Attende l'ennesima occorrenza di un testo (per non scrivere prima che il prompt sia aperto). */
async function attendiOccorrenze(descrizione, regex, n = 1, msMax = 120_000) {
  const t0 = Date.now();
  for (;;) {
    const testo = pulisci(out);
    const quante = (testo.match(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g")) || []).length;
    if (quante >= n) return true;
    if (Date.now() - t0 > msMax) {
      ko(`timeout in attesa di: ${descrizione} (occorrenza ${n} di ${regex})`);
      return false;
    }
    await wait(300);
  }
}

const PROMPT_RISPOSTA = /\(numero, testo libero, o invio per saltare\)/;
const scrivi = (s) => proc.stdin.write(s + "\n");

/* ---------------- 1. registrazione del tool ---------------- */
check("il tool è registrato nell'harness da terminale", await attendiOutput("registrazione", /tool «ask_user» registrato/, 30_000));

/* ---------------- 2. domanda con risposta numerata ---------------- */
console.log("\n== domanda e risposta nell'harness da terminale ==");
scrivi('Usa il tool ask_user per chiedermi il colore preferito, con opzioni "Rosso" e "Blu". Poi scrivi una riga che ripete la mia scelta.');
const comparsa = await attendiOutput("domanda nel terminale", /Colore preferito[\s\S]*1\) Rosso[\s\S]*2\) Blu/);
check("la domanda appare con le opzioni numerate", comparsa === true);
check("l'attesa della risposta è annunciata", /invio per saltare/.test(pulisci(out)));
check("il prompt della domanda è distinto da quello della chat", /> \(numero/.test(pulisci(out)));

// si scrive SOLO quando il prompt della risposta è aperto: scrivere prima che readline sia in
// ascolto perde la riga (è il comportamento reale di una persona, che aspetta il prompt)
check("il prompt della risposta è aperto (prima occorrenza)", await attendiOccorrenze("prompt risposta", PROMPT_RISPOSTA, 1, 30_000));
await wait(400);
scrivi("2");
const risposto = await attendiOutput("risposta registrata", /→ answered/, 120_000);
check("la risposta numerata arriva al modello (esito «answered»)", risposto === true);
const usata = await attendiOutput("il modello usa la scelta", /[Bb]lu/, 120_000);
check("il modello prosegue usando la scelta fatta", usata === true);

/* ---------------- 3. invio a vuoto = salto, senza blocco ---------------- */
console.log("\n== invio a vuoto: la domanda si salta e il turno prosegue ==");
await attendiOutput("prompt di nuovo disponibile", /you> \s*$/m, 60_000);
scrivi('Usa il tool ask_user per chiedermi quale nome dare al file, con opzioni "Alfa" e "Beta". Poi scrivi una riga.');
const comparsa2 = await attendiOutput("seconda domanda", /Alfa[\s\S]*Beta/);
check("seconda domanda posta", comparsa2 === true);
check("il prompt della risposta è aperto (seconda occorrenza)", await attendiOccorrenze("secondo prompt risposta", PROMPT_RISPOSTA, 2, 30_000));
await wait(400);
scrivi(""); // invio a vuoto = salta
const saltata = await attendiOutput("salto registrato", /→ declined/, 120_000);
check("l'invio a vuoto salta la domanda (esito «declined»)", saltata === true);
check("il modello prosegue comunque (nessun blocco)", await attendiOutput("testo finale", /you> \s*$/m, 120_000));

/* ---------------- 4. uscita pulita ---------------- */
console.log("\n== uscita ==");
scrivi("/exit");
const chiuso = await new Promise((resolve) => {
  const t = setTimeout(() => resolve("timeout"), 20_000);
  proc.on("exit", (code) => {
    clearTimeout(t);
    resolve(code ?? 0);
  });
});
check("il REPL esce con /exit (nessun processo appeso)", chiuso !== "timeout" && chiuso === 0, `uscita: ${chiuso}`);
check("il saluto finale è presente", /bye/.test(pulisci(out)));
check("nessun errore non gestito nell'output", !/Unhandled|TypeError|ReferenceError/.test(pulisci(out)), pulisci(out).slice(-200));

/* ---------------- 5. log ---------------- */
console.log("\n== tracciabilità ==");
const righe = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
check("il log registra le domande e gli esiti anche da terminale", righe.some((r) => r.t === "ask") && righe.some((r) => r.t === "resolved" && r.status === "answered"));

cleanup();
console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
