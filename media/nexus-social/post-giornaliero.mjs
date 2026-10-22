#!/usr/bin/env node
/**
 * Post giornaliero di Altair Nexus sulla Pagina Facebook «Aion».
 *
 * Legge l'edizione corrente da https://nexus.universalis.it/llms.txt (sorgente dati
 * ufficiale del sito: titoli, link canonici, categoria, fonte, orario, sommario),
 * compone il post con un template fisso — nessun testo inventato: si citano solo
 * titoli, fonti e link che stanno nell'edizione — e lo pubblica con
 * skills/social-publish/publish.mjs (Pages API ufficiale).
 *
 * Regole:
 *  - un solo post al giorno (chiave = data dell'edizione in Europe/Rome);
 *  - se l'edizione disponibile non è di oggi non pubblica "l'edizione di ieri":
 *    esce con codice 4, così il timer ritenta più tardi;
 *  - firma Aion sul testo: la Pagina dichiara che il commento è scritto da un'IA;
 *  - ogni esecuzione lascia una riga in log.jsonl.
 *
 * Uso:
 *   node media/nexus-social/post-giornaliero.mjs --dry-run     # mostra il post, non invia
 *   node media/nexus-social/post-giornaliero.mjs               # pubblica se non già fatto
 *   node media/nexus-social/post-giornaliero.mjs --forza       # ripubblica anche se oggi è già stato fatto
 *   node media/nexus-social/post-giornaliero.mjs --sorgente /tmp/x.txt   # edizione da un file (prove)
 *   node media/nexus-social/post-giornaliero.mjs --anche-se-vecchia       # manda l'edizione di ieri (raro)
 *   node media/nexus-social/post-giornaliero.mjs --storie 4    # quanti link nel post (default 3)
 *
 * Codici di uscita: 0 fatto o niente da fare · 1 errore · 2 uso · 3 già pubblicato oggi
 *                   4 edizione non ancora aggiornata a oggi · 5 pubblicazione fallita
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const LLMS_URL = "https://nexus.universalis.it/llms.txt";
const SITE_URL = "https://nexus.universalis.it/site/";
const STATE_DIR = HERE;
const STATE_FILE = path.join(STATE_DIR, "pubblicati.json");
const LOG_FILE = path.join(STATE_DIR, "log.jsonl");
const PUBLISH = path.join(ROOT, "skills/social-publish/publish.mjs");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const DRY = flag("--dry-run");
const FORZA = flag("--forza");   // ripubblica anche se oggi è già stato pubblicato
const VECCHIA = flag("--anche-se-vecchia"); // sblocca l'invio di un'edizione non aggiornata a oggi
const SORGENTE = opt("--sorgente", LLMS_URL); // URL o percorso locale (per le prove)
const N_STORIE = Math.max(1, Math.min(6, Number(opt("--storie", "3")) || 3));

const TZ = "Europe/Rome";

/* ---------------------------------------------------------------- utilità */

function giornoRoma(d = new Date()) {
  // YYYY-MM-DD nella zona del sito (il timer può girare in UTC)
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function dataLunga(iso) {
  return new Intl.DateTimeFormat("it-IT", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function leggiStato() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { pubblicati: [] }; }
}

function scriviStato(s) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

function registra(riga) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ quando: new Date().toISOString(), ...riga }) + "\n");
}

/* ------------------------------------------------------- lettura edizione */

export function parseLlms(txt) {
  const out = { aggiornataIl: null, storie: [], reports: [] };
  const m = txt.match(/^Last edition update:\s*(\S+)/m);
  if (m) out.aggiornataIl = m[1];

  const righe = txt.split("\n");
  let corrente = null;
  let inReports = false;
  for (const riga of righe) {
    if (/^##\s+Reports/i.test(riga)) { inReports = true; corrente = null; continue; }
    if (/^##\s+/.test(riga)) { inReports = false; corrente = null; continue; }

    const voce = riga.match(/^-\s+\[(.+?)\]\((\S+?)\)\s*$/);
    if (voce) {
      corrente = { titolo: voce[1], url: voce[2] };
      (inReports ? out.reports : out.storie).push(corrente);
      continue;
    }
    const campo = riga.match(/^\s+-\s+([A-Za-z][A-Za-z /]*?):\s*(.*)$/);
    if (campo && corrente) {
      const k = campo[1].trim().toLowerCase();
      const v = campo[2].trim();
      if (k === "category") corrente.categoria = v;
      else if (k === "source") corrente.fonte = v;
      else if (k === "original source url") corrente.fonteUrl = v;
      else if (k === "published/updated") corrente.pubblicata = v;
      else if (k === "summary") corrente.sommario = v;
    }
  }
  return out;
}

function selezionaStorie(storie, n) {
  // le più recenti, senza doppioni di titolo
  const viste = new Set();
  return [...storie]
    .filter((s) => s.url && s.titolo)
    .filter((s) => { const k = s.titolo.toLowerCase(); if (viste.has(k)) return false; viste.add(k); return true; })
    .sort((a, b) => new Date(b.pubblicata || 0) - new Date(a.pubblicata || 0))
    .slice(0, n);
}

/* ------------------------------------------------------------ composizione */

export function componiTesto(edizione, scelte, tutte) {
  const fonti = [...new Set(tutte.map((s) => s.fonte).filter(Boolean))];
  const righe = [];

  righe.push(`Altair Nexus — l'edizione del ${dataLunga(edizione.aggiornataIl)}`);
  righe.push("");
  righe.push(
    `Oggi nel briefing: ${tutte.length} storie da ${fonti.length} testate. ` +
    `Questi ${scelte.length === 1 ? "il segnale che vale" : `i ${scelte.length} segnali che valgono`} il tuo tempo:`
  );
  righe.push("");

  scelte.forEach((s, i) => {
    const etichetta = [s.categoria, s.fonte].filter(Boolean).join(" · ");
    righe.push(`${i + 1}. ${s.titolo}`);
    if (etichetta) righe.push(etichetta);
    if (s.sommario) righe.push(testaSommario(s.sommario));
    righe.push(s.url);
    righe.push("");
  });

  righe.push(`L'edizione completa, ricostruita ogni ora: ${SITE_URL}`);
  righe.push("");
  righe.push(
    "Altair Nexus seleziona e collega i segnali chiave su intelligenza artificiale, tecnologia, " +
    "geopolitica, finanza e scienza. Le notizie sono delle testate citate qui sopra; " +
    "la selezione e il collegamento sono nostri."
  );
  righe.push("");
  righe.push("Testo composto da Aion, l'IA editoriale di Universalis Produzioni.");
  righe.push("");
  righe.push("#AltairNexus #IntelligenzaArtificiale #Geopolitica #Mercati");

  return righe.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function testaSommario(testo, max = 180) {
  // tiene la prima frase utile senza tagliare a metà parola
  const pulito = testo.replace(/\s+/g, " ").trim();
  if (pulito.length <= max) return pulito;
  const tagliato = pulito.slice(0, max);
  const fine = Math.max(tagliato.lastIndexOf(". "), tagliato.lastIndexOf("; "));
  if (fine > 80) return pulito.slice(0, fine + 1);
  return tagliato.slice(0, tagliato.lastIndexOf(" ")) + "…";
}

/* ------------------------------------------------------------------ invio */

function pubblica(testo) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [PUBLISH, "post", "--text", testo],
      { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, timeout: 120000 },
      (err, stdout, stderr) => resolve({ codice: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
  });
}

/* ------------------------------------------------------------------- main */

async function leggiSorgente(sorgente) {
  if (!/^https?:\/\//i.test(sorgente)) return fs.readFileSync(sorgente, "utf8");
  const res = await fetch(sorgente, { headers: { "user-agent": "AltairNexusBot/1.0 (+publisher: Universalis)" } });
  if (!res.ok) throw Object.assign(new Error(`llms.txt HTTP ${res.status}`), { codice: 1 });
  return res.text();
}

async function main() {
  let grezzo;
  try {
    grezzo = await leggiSorgente(SORGENTE);
  } catch (e) {
    registra({ esito: "errore", motivo: e.message, sorgente: SORGENTE });
    console.error(`edizione non leggibile: ${e.message}`);
    process.exit(1);
  }
  const edizione = parseLlms(grezzo);
  if (!edizione.aggiornataIl || edizione.storie.length === 0) {
    registra({ esito: "errore", motivo: "llms.txt senza edizione o senza storie" });
    console.error("llms.txt senza edizione o senza storie");
    process.exit(1);
  }

  const oggi = giornoRoma();
  const giornoEdizione = giornoRoma(new Date(edizione.aggiornataIl));

  const stato = leggiStato();
  const gia = stato.pubblicati.find((p) => p.giorno === oggi);

  if (gia && !FORZA) {
    registra({ esito: "saltato", motivo: "già pubblicato oggi", giorno: oggi, postId: gia.postId });
    console.log(`già pubblicato oggi (${oggi}) · post ${gia.postId || "?"}`);
    process.exit(3);
  }

  if (giornoEdizione !== oggi && !VECCHIA) {
    registra({ esito: "rinviato", motivo: "edizione non aggiornata a oggi", aggiornataIl: edizione.aggiornataIl, oggi });
    console.log(`edizione ferma al ${giornoEdizione}: non pubblico un'edizione di ieri, riprovo dopo`);
    process.exit(4);
  }

  const scelte = selezionaStorie(edizione.storie, N_STORIE);
  const testo = componiTesto(edizione, scelte, edizione.storie);

  console.log(`edizione ${edizione.aggiornataIl} · ${edizione.storie.length} storie · post da ${testo.length} caratteri`);
  console.log("─".repeat(70));
  console.log(testo);
  console.log("─".repeat(70));

  if (DRY) {
    registra({ esito: "prova", giorno: oggi, aggiornataIl: edizione.aggiornataIl, storie: scelte.map((s) => s.url) });
    console.log("prova a vuoto: non ho inviato nulla a Facebook");
    process.exit(0);
  }

  const esito = await pubblica(testo);
  const postId = (esito.stdout.match(/\b\d{6,}_\d{6,}\b/) || esito.stdout.match(/\bid[:\s]+(\d{6,})/i) || [])[1]
    || (esito.stdout.match(/(\d{6,}_\d{6,})/) || [])[1] || null;

  if (esito.codice !== 0) {
    registra({ esito: "fallito", giorno: oggi, aggiornataIl: edizione.aggiornataIl, uscita: esito.codice, stdout: esito.stdout, stderr: esito.stderr });
    console.error("pubblicazione fallita:\n" + (esito.stderr || esito.stdout).slice(0, 2000));
    process.exit(5);
  }

  stato.pubblicati = stato.pubblicati.filter((p) => p.giorno !== oggi);
  stato.pubblicati.push({ giorno: oggi, aggiornataIl: edizione.aggiornataIl, postId, storie: scelte.map((s) => s.url), quando: new Date().toISOString() });
  scriviStato(stato);
  registra({ esito: "pubblicato", giorno: oggi, aggiornataIl: edizione.aggiornataIl, postId });
  console.log(esito.stdout.trim());
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    registra({ esito: "errore", motivo: String(e && e.message || e) });
    console.error("errore:", e.message);
    process.exit(1);
  });
}
