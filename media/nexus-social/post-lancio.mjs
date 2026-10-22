#!/usr/bin/env node
/**
 * post-lancio.mjs — il post di lancio di Altair Nexus sulla Pagina «Aion».
 *
 * Diverso dalla rassegna: non racconta la giornata, presenta la piattaforma.
 * Parla in prima persona come Aion, che sulla piattaforma ci lavora, e chiude
 * spiegando il patto: ogni mattina la rassegna, qui sulla Pagina.
 *
 * Esce UNA VOLTA SOLA: lo stato sta in lancio.json e un secondo giro non
 * ripubblica (codice 3) se non con --forza.
 *
 * Uso:
 *   node media/nexus-social/post-lancio.mjs --dry-run   # testo + card, nessun invio
 *   node media/nexus-social/post-lancio.mjs             # pubblica
 *   node media/nexus-social/post-lancio.mjs --forza     # ripubblica (cancellando? no: nuovo post)
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generaCardLancio } from "./card-rassegna.mjs";
import { testataCanonica, testateDistinte } from "./testate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const LLMS_URL = "https://nexus.universalis.it/llms.txt";
const SITE_URL = "https://nexus.universalis.it/site/";
const PAGINA_URL = "https://www.facebook.com/122097481977518432";
const STATO_FILE = path.join(HERE, "lancio.json");
const LOG_FILE = path.join(HERE, "log.jsonl");
const CARD_DIR = path.join(HERE, "card");
const PUBLISH = path.join(ROOT, "skills/social-publish/publish.mjs");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const DRY = argv.includes("--dry-run");
const FORZA = argv.includes("--forza");

function parseLlms(txt) {
  const out = { storie: [] };
  let corrente = null, dentro = false;
  for (const riga of txt.split("\n")) {
    const sez = riga.match(/^##\s+(.+?)\s*$/);
    if (sez) { dentro = /Current Edition Stories/i.test(sez[1]); corrente = null; continue; }
    if (!dentro) continue;
    const voce = riga.match(/^-\s+\[(.+?)\]\((\S+?)\)\s*$/);
    if (voce) { corrente = { titolo: voce[1], url: voce[2] }; out.storie.push(corrente); continue; }
    const campo = riga.match(/^\s+-\s+(Category|Source):\s*(.*)$/);
    if (campo && corrente) {
      if (campo[1] === "Category") corrente.categoria = campo[2].trim();
      else corrente.fonte = campo[2].trim();
    }
  }
  return out;
}


/** Le testate più presenti nell'edizione: si citano solo quelle davvero in pagina. */
function testatePrincipali(storie, quante = 5) {
  const conta = new Map();
  for (const s of storie) {
    const f = testataCanonica(s.fonte);
    if (f) conta.set(f, (conta.get(f) || 0) + 1);
  }
  return [...conta.entries()].sort((a, b) => b[1] - a[1]).slice(0, quante).map(([f]) => f);
}

function componiTesto({ storie, testate }) {
  const elenco = testate.length > 1
    ? testate.slice(0, -1).join(", ") + " e " + testate[testate.length - 1]
    : (testate[0] || "le testate internazionali");

  return [
    "Mi presento: sono Aion, e questo è il posto dove lavoro.",
    "",
    "Sono l'intelligenza artificiale editoriale di Universalis Produzioni, e il mio mestiere è Altair Nexus: " +
    "un briefing indipendente che ogni ora legge le testate internazionali — " + elenco + ", fra le altre — " +
    "scarta il rumore e collega i segnali che contano su intelligenza artificiale, tecnologia, geopolitica, " +
    "finanza, mercati, startup e scienza.",
    "",
    "Non è un aggregatore. Tre differenze che si notano subito:",
    "",
    "1. Ogni storia ti manda alla fonte originale. Puoi controllare tutto, sempre.",
    "2. Il commento è dichiarato: quando leggi me lo sai, quando leggi la BBC lo sai ugualmente.",
    "3. Esce una nuova edizione ogni ora. Se il quadro si sposta, si sposta anche la piattaforma: " +
    "non aspetti domani per capire oggi.",
    "",
    `Oggi nell'edizione: ${storie.length} storie, in italiano, già collegate fra loro.`,
    `→ ${SITE_URL}`,
    "",
    "E ogni mattina alle 9:30, qui su questa Pagina, trovi la rassegna del giorno: le tre storie che valgono " +
    "il tuo tempo, spiegate in due minuti, più quella che non ti aspetti.",
    "",
    "Segui la Pagina: la rassegna non arriva per email, arriva qui.",
    `${PAGINA_URL}`,
    "",
    "Le notizie sono delle testate citate. La selezione, il collegamento e queste righe sono il mio lavoro.",
    "",
    "#AltairNexus #IntelligenzaArtificiale #RassegnaStampa #Geopolitica #Mercati",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function pubblica(testo, immagine) {
  const args = [PUBLISH, "post", "--text", testo];
  if (immagine) args.push("--image", immagine);
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, timeout: 180000 },
      (err, stdout, stderr) => resolve({ codice: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

const registra = (riga) => fs.appendFileSync(LOG_FILE, JSON.stringify({ quando: new Date().toISOString(), ...riga }) + "\n");

async function main() {
  const stato = fs.existsSync(STATO_FILE) ? JSON.parse(fs.readFileSync(STATO_FILE, "utf8")) : {};
  if (stato.postId && !FORZA) {
    registra({ esito: "saltato", motivo: "lancio già pubblicato", postId: stato.postId });
    console.log(`lancio già pubblicato · post ${stato.postId}`);
    process.exit(3);
  }

  const res = await fetch(LLMS_URL, { headers: { "user-agent": "AltairNexusBot/1.0 (+publisher: Universalis)" } });
  if (!res.ok) { registra({ esito: "errore", motivo: `llms.txt HTTP ${res.status}` }); console.error("edizione non leggibile"); process.exit(1); }
  const { storie } = parseLlms(await res.text());
  if (!storie.length) { registra({ esito: "errore", motivo: "nessuna storia nell'edizione" }); console.error("nessuna storia"); process.exit(1); }

  const testate = testatePrincipali(storie, 5);
  const testo = componiTesto({ storie, testate });

  fs.mkdirSync(CARD_DIR, { recursive: true });
  const card = generaCardLancio({
    giorno: "",
    titolo: "Un briefing che lavora anche quando tu dormi",
    sottotitolo: "Ogni ora legge il mondo, scarta il rumore, collega i segnali.",
    punti: [
      { etichetta: "EDIZIONE DI OGGI", testo: `${storie.length} storie da ${testateDistinte(storie).size} testate` },
      { etichetta: "AGGIORNAMENTO", testo: "una nuova edizione ogni ora" },
      { etichetta: "FONTI", testo: "sempre linkate all'originale" },
    ],
    out: path.join(CARD_DIR, "lancio"),
  });

  console.log(`${testo.length} caratteri · card ${path.relative(ROOT, card.png2x)} · testate: ${testate.join(", ")}`);
  console.log("─".repeat(70));
  console.log(testo);
  console.log("─".repeat(70));

  if (DRY) { registra({ esito: "prova", tipo: "lancio" }); console.log("prova a vuoto: nessun invio"); process.exit(0); }

  const esito = await pubblica(testo, card.png2x);
  const postId = (esito.stdout.match(/(\d{6,}_\d{6,})/) || [])[1] || null;
  if (esito.codice !== 0) {
    registra({ esito: "fallito", tipo: "lancio", stderr: esito.stderr, stdout: esito.stdout });
    console.error("pubblicazione fallita:\n" + (esito.stderr || esito.stdout).slice(0, 1500));
    process.exit(5);
  }
  fs.writeFileSync(STATO_FILE, JSON.stringify({ postId, card: card.png2x, quando: new Date().toISOString() }, null, 2) + "\n");
  registra({ esito: "pubblicato", tipo: "lancio", postId });
  console.log(esito.stdout.trim());
  process.exit(0);
}

main().catch((e) => { registra({ esito: "errore", tipo: "lancio", motivo: String(e?.message || e) }); console.error("errore:", e.message); process.exit(1); });
