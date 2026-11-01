#!/usr/bin/env node
/**
 * IL runner dei test dell'harness: un comando, un esito.
 *
 * Perché non «lancia tutti i media/test-*.mjs» (audit 2026-11-01, criticità C1): dei 44 file,
 * 30 richiedono modello, browser o rete e altri 4 sono oggi invecchiati o dipendono
 * dall'ambiente. Un runner che è sempre rosso viene ignorato dopo tre volte — e allora non
 * protegge niente. Qui si distinguono tre casi, e solo il primo può far fallire il comando:
 *
 *   VERDI   — deterministici, offline, veloci: DEVONO passare (exit code 1 se uno fallisce)
 *   NOTI    — oggi rossi, con il motivo scritto accanto; si eseguono con --tutti e restano rossi
 *   ESCLUSI — richiedono modello, browser o rete: non sono test di regressione, sono prove manuali
 *
 * Uso:
 *   npm test                     i test verdi (il gate da usare prima di ogni modifica)
 *   node media/test-locali.mjs --tutti        include anche i «noti rossi»
 *   node media/test-locali.mjs --json         esito leggibile da una macchina
 *   node media/test-locali.mjs --filtro svg   solo i test il cui nome contiene «svg»
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(QUI, "..");
const argv = process.argv.slice(2);
const opz = (nome) => argv.includes(`--${nome}`);
const valore = (nome, def = "") => {
  const i = argv.indexOf(`--${nome}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : def;
};

/** Test che devono passare. `flag` per quelli che vogliono un flag di node. */
const VERDI = [
  { file: "test-ask.mjs", cosa: "domande: sanificazione e validazione degli argomenti" },
  { file: "test-contesto.mjs", cosa: "bilancio del contesto, spreco di cache, classi di errore" },
  { file: "test-turno-guardia.mjs", cosa: "guardia anti-loop: soglie e ripetizioni" },
  { file: "test-tool-result-limite.mjs", cosa: "limite ai risultati dei tool: taglio e idempotenza" },
  { file: "test-controllo-turno.mjs", cosa: "estensione controllo-turno agganciata al motore" },
  { file: "test-decision-m-ui.mjs", cosa: "interruttore Decision_M nel menu features" },
  { file: "test-image-util.mjs", cosa: "immagini: riconoscimento dei formati" },
  { file: "test-md-render.mjs", cosa: "markdown della chat: escape e tabelle" },
  { file: "test-svg-sanitize.mjs", cosa: "sanitizzatore SVG: accetta il disegno, rifiuta il codice" },
  { file: "test-svg-sanitizer-retry.mjs", cosa: "sanitizzatore SVG: il fallimento non resta in cache", flag: "--experimental-vm-modules" },
  { file: "test-ui.mjs", cosa: "frontend: notifiche e storico prompt, senza browser" }
];

/** Rossi oggi, con il motivo. Restano fuori dal gate finché non si riparano. */
const NOTI = [
  { file: "test-skill-collisioni.mjs", cosa: "skill globali divergenti da skills/", perche: "ambiente: skills/ e le copie globali non sono allineate (rimedio: scripts/skills-globali-ripulisci.sh --allinea)" },
  { file: "test-social-publish.mjs", cosa: "publisher social", perche: "5 casi su perms/check/dry-run video falliscono senza profili configurati" },
  { file: "test-stream-resilience.mjs", cosa: "resilienza dello streaming", perche: "invecchiato: lo stub DOM non copre più dashboard.html" },
  { file: "test-svg-stream.mjs", cosa: "SVG durante lo streaming", perche: "invecchiato: lo stub DOM non copre più dashboard.html" }
];

/** Prove manuali: richiedono cose che in un gate non devono entrare. */
const ESCLUSI = [
  { file: "test-ask-cli.mjs", perche: "avvia un pty e chiama il modello vero" },
  { file: "test-browser-tool-output.mjs", perche: "avvia il browser reale come utente dedicato" },
  { file: "verifica-catena-turno.mjs", perche: "integrazione col motore vero (crea una sessione pi): veloce, ma resta manuale perché dipende dal catalogo dei modelli" },
  { file: "*(altri 30 test di rete/modello/browser)", perche: "non deterministici: non sono regressioni, sono dimostrazioni" }
];

function esegui(t, { timeout = 120000 } = {}) {
  const percorso = join(RADICE, "media", t.file);
  if (!existsSync(percorso)) return { stato: "mancante", ms: 0, coda: "file non trovato" };
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [...(t.flag ? [t.flag] : []), percorso], {
    cwd: RADICE,
    encoding: "utf8",
    timeout,
    env: { ...process.env, NODE_OPTIONS: "" }
  });
  const ms = Date.now() - t0;
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  const righe = out.split("\n").filter(Boolean);
  const coda = righe.length ? righe[righe.length - 1].slice(0, 120) : "";
  if (r.error && r.error.code === "ETIMEDOUT") return { stato: "timeout", ms, coda: `oltre ${timeout / 1000}s` };
  return { stato: r.status === 0 ? "ok" : "ko", ms, coda, codice: r.status };
}

/**
 * Controllo di collegamento: i moduli nuovi devono essere davvero agganciati alla dashboard.
 * Senza questo, i test possono essere tutti verdi e la funzione non essere in funzione.
 */
function controlloCollegamento() {
  const esiti = [];
  const sorgente = join(RADICE, "dashboard.mjs");
  let s = "";
  try {
    s = readFileSync(sorgente, "utf8");
  } catch {
    return [{ nome: "dashboard.mjs leggibile", ok: false, nota: "non leggibile" }];
  }
  const haImport = /from "\.\/media\/controllo-turno\.mjs"/.test(s);
  const haFactory = /CONTROLLO_TURNO\.factory/.test(s) || /CONTROLLO_TURNO\b/.test(s);
  // il blocco dell'elenco contiene parentesi quadre annidate (`...(X ? [X] : [])`), quindi si
  // ritaglia dal nome del campo fino a `systemPromptOverride` e si cerca dentro quel tratto
  const da = s.indexOf("extensionFactories:");
  const a = s.indexOf("systemPromptOverride", da === -1 ? 0 : da);
  const elenco = da === -1 ? "" : s.slice(da, a === -1 ? da + 2000 : a);
  const inElenco = /CONTROLLO_TURNO/.test(elenco);
  esiti.push({ nome: "controllo-turno importato in dashboard.mjs", ok: haImport });
  esiti.push({ nome: "controllo-turno creato (CONTROLLO_TURNO)", ok: haFactory });
  esiti.push({ nome: "controllo-turno fra le extensionFactories", ok: inElenco, nota: inElenco ? "" : "l'estensione non sarebbe attiva" });
  return esiti;
}

// ---- esecuzione ----
const filtro = valore("filtro");
const lista = (opz("tutti") ? [...VERDI, ...NOTI.map((n) => ({ ...n, noto: true }))] : VERDI).filter(
  (t) => !filtro || t.file.includes(filtro),
);

const risultati = [];
for (const t of lista) {
  process.stdout.write(`  … ${t.file.padEnd(32)}`);
  const r = esegui(t);
  const etichetta = t.noto ? (r.stato === "ok" ? "ok (rientrato)" : "noto rosso") : r.stato === "ok" ? "ok" : r.stato.toUpperCase();
  risultati.push({ ...t, ...r, etichetta });
  process.stdout.write(
    `${etichetta.padEnd(15)} ${String(r.ms).padStart(6)} ms  ${r.stato === "ok" ? "" : r.coda}\n`,
  );
}

const collegamento = controlloCollegamento();
const verdiKo = risultati.filter((r) => !r.noto && r.stato !== "ok");
const collegamentoKo = collegamento.filter((c) => !c.ok);
const notiRossi = risultati.filter((r) => r.noto && r.stato !== "ok");
const rientrati = risultati.filter((r) => r.noto && r.stato === "ok");
const totaleMs = risultati.reduce((a, r) => a + r.ms, 0);

if (opz("json")) {
  console.log(
    JSON.stringify(
      {
        ok: verdiKo.length === 0 && collegamentoKo.length === 0,
        verdi: risultati.filter((r) => !r.noto).map((r) => ({ file: r.file, stato: r.stato, ms: r.ms })),
        notiRossi: notiRossi.map((r) => ({ file: r.file, perche: r.perche })),
        rientrati: rientrati.map((r) => r.file),
        collegamento: collegamento.filter((c) => !c.ok),
        ms: totaleMs
      },
      null,
      2,
    ),
  );
} else {
  console.log("\n  collegamento con la dashboard");
  for (const c of collegamento) console.log(`    ${c.ok ? "✓" : "✘"} ${c.nome}${c.ok ? "" : " — " + (c.nota || "da sistemare")}`);
  if (notiRossi.length) {
    console.log("\n  noti rossi (fuori dal gate, con motivo):");
    for (const n of notiRossi) console.log(`    · ${n.file} — ${n.perche}`);
  }
  if (rientrati.length) {
    console.log("\n  rientrati (prima rossi, ora verdi — si possono promuovere fra i VERDI):");
    for (const r of rientrati) console.log(`    · ${r.file}`);
  }
  console.log("\n  esclusi dal gate (prove manuali):");
  for (const e of ESCLUSI) console.log(`    · ${e.file} — ${e.perche}`);
  console.log("\n────────────────────────────────────────");
  const nVerdi = risultati.filter((r) => !r.noto).length;
  console.log(
    `  ${nVerdi - verdiKo.length}/${nVerdi} verdi · ${notiRossi.length} noti rossi · ` +
      `${collegamentoKo.length} problemi di collegamento · ${(totaleMs / 1000).toFixed(1)} s`,
  );
  console.log(verdiKo.length === 0 && collegamentoKo.length === 0 ? "  ✓ gate verde" : "  ✘ gate rosso");
}

process.exit(verdiKo.length === 0 && collegamentoKo.length === 0 ? 0 : 1);
