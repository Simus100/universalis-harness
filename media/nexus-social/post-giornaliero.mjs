#!/usr/bin/env node
/**
 * post-giornaliero.mjs — la «Rassegna del giorno» di Altair Nexus, pubblicata ogni mattina
 * sulla Pagina Facebook «Aion».
 *
 * Cosa legge (tutto dal sito, niente inventato):
 *   - https://nexus.universalis.it/llms.txt         → edizione corrente: titoli, link canonici,
 *                                                     categoria, fonte, orario, sommario
 *   - https://nexus.universalis.it/site/aion-brief.html → sintesi del giorno di Aion,
 *                                                     segnale dominante, tema principale,
 *                                                     «cosa osservare»
 *
 * Cosa produce:
 *   - la card editoriale della rassegna (card-rassegna.mjs → PNG 1200x630 + @2x)
 *   - il testo del post in stile publisher: testata, occhiello, introduzione del sito,
 *     tre storie raccontate, la storia che non ti aspetti, cosa osservare, invito a seguire
 *     la Pagina, firma Aion
 *   - la pubblicazione con skills/social-publish/publish.mjs (Pages API ufficiale)
 *
 * Guardie:
 *   - un solo post al giorno (chiave = data dell'edizione in Europe/Rome);
 *   - se l'edizione disponibile non è di oggi non pubblica «l'edizione di ieri»: codice 4;
 *   - la card si rigenera ogni giorno in media/nexus-social/card/.
 *
 * Uso:
 *   node media/nexus-social/post-giornaliero.mjs --dry-run     # mostra testo e card, non invia
 *   node media/nexus-social/post-giornaliero.mjs               # pubblica se non già fatto
 *   node media/nexus-social/post-giornaliero.mjs --forza       # ripubblica anche se oggi è già uscito
 *   node media/nexus-social/post-giornaliero.mjs --storie 2    # quanti link nel corpo (default 3)
 *   node media/nexus-social/post-giornaliero.mjs --sorgente /tmp/x.txt   # edizione da un file (prove)
 *   node media/nexus-social/post-giornaliero.mjs --anche-se-vecchia      # manda l'edizione di ieri (raro)
 *   node media/nexus-social/post-giornaliero.mjs --senza-card  # solo testo, lascia l'anteprima del link
 *
 * Codici di uscita: 0 fatto o niente da fare · 1 errore · 2 uso · 3 già pubblicato oggi
 *                   4 edizione non ancora aggiornata a oggi · 5 pubblicazione fallita
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generaCard } from "./card-rassegna.mjs";
import { testateDistinte } from "./testate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const LLMS_URL = "https://nexus.universalis.it/llms.txt";
const BRIEF_URL = "https://nexus.universalis.it/site/aion-brief.html";
const SITE_URL = "https://nexus.universalis.it/site/";
const PAGINA_URL = "https://www.facebook.com/122097481977518432";
const STATE_FILE = path.join(HERE, "pubblicati.json");
const LOG_FILE = path.join(HERE, "log.jsonl");
const CARD_DIR = path.join(HERE, "card");
const PUBLISH = path.join(ROOT, "skills/social-publish/publish.mjs");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const DRY = flag("--dry-run");
const FORZA = flag("--forza");            // ripubblica anche se oggi è già stato pubblicato
const VECCHIA = flag("--anche-se-vecchia"); // sblocca l'invio di un'edizione non aggiornata a oggi
const SENZA_CARD = flag("--senza-card");
const N_STORIE = Math.max(1, Math.min(5, Number(opt("--storie", "3")) || 3));

const TZ = "Europe/Rome";

/* ---------------------------------------------------------------- utilità */

const giornoRoma = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const dataLunga = (iso) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(iso));

const leggiStato = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return { pubblicati: [] }; } };

function scriviStato(s) {
  fs.mkdirSync(HERE, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");
}

function registra(riga) {
  fs.mkdirSync(HERE, { recursive: true });
  fs.appendFileSync(LOG_FILE, JSON.stringify({ quando: new Date().toISOString(), ...riga }) + "\n");
}

const pulisci = (t) =>
  String(t).replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim();

/* ------------------------------------------------- spoglie dell'edizione */

function parseLlms(txt) {
  const out = { aggiornataIl: null, storie: [] };
  const m = txt.match(/^Last edition update:\s*(\S+)/m);
  if (m) out.aggiornataIl = m[1];

  let corrente = null;
  let dentroLeStorie = false; // fra «## Current Edition Stories» e la sezione successiva
  for (const riga of txt.split("\n")) {
    const sezione = riga.match(/^##\s+(.+?)\s*$/);
    if (sezione) {
      dentroLeStorie = /Current Edition Stories/i.test(sezione[1]);
      corrente = null;
      continue;
    }
    if (!dentroLeStorie) continue; // Reports, Topics, Crawling notes… non sono storie dell'edizione
    const voce = riga.match(/^-\s+\[(.+?)\]\((\S+?)\)\s*$/);
    if (voce) { corrente = { titolo: voce[1], url: voce[2] }; out.storie.push(corrente); continue; }
    const campo = riga.match(/^\s+-\s+([A-Za-z][A-Za-z /]*?):\s*(.*)$/);
    if (campo && corrente) {
      const k = campo[1].trim().toLowerCase(), v = campo[2].trim();
      if (k === "category") corrente.categoria = v;
      else if (k === "source") corrente.fonte = v;
      else if (k === "published/updated") corrente.pubblicata = v;
      else if (k === "summary") corrente.sommario = v;
    }
  }
  return out;
}

/** Estrae dalla pagina Aion Brief: sintesi, segnale dominante, tema, cosa osservare. */
function parseBrief(html) {
  const out = {};
  const pill = html.match(/Segnale dominante:\s*([^<]+)</i);
  if (pill) out.segnale = pulisci(pill[1]);

  const agg = html.match(/Aggiornato\s*([^<]+)</i);
  if (agg) out.aggiornato = pulisci(agg[1]);

  const sintesi = html.match(/class="[^"]*brief-summary[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (sintesi) out.sintesi = pulisci(sintesi[1]);

  const mini = [...html.matchAll(/class="brief-mini"><span>([^<]+)<\/span><strong>([^<]+)<\/strong>/gi)];
  for (const [, etichetta, valore] of mini) {
    const k = pulisci(etichetta).toLowerCase();
    if (k.includes("tema")) out.tema = pulisci(valore);
    else if (k.includes("osservare")) out.cosaOsservare = pulisci(valore);
    else if (k.includes("segnale") && !out.segnale) out.segnale = pulisci(valore);
  }
  return out;
}

/* ------------------------------------------------------------ selezione */

function selezionaStorie(storie, n) {
  const viste = new Set();
  return [...storie]
    .filter((s) => s.url && s.titolo)
    .filter((s) => { const k = s.titolo.toLowerCase(); if (viste.has(k)) return false; viste.add(k); return true; })
    .sort((a, b) => new Date(b.pubblicata || 0) - new Date(a.pubblicata || 0))
    .slice(0, n);
}

/** La storia defilata che fa sorridere: curiosità/futuro o scienza, se c'è. */
function storiaCuriosa(storie, giaScelte) {
  const escluse = new Set(giaScelte.map((s) => s.url));
  return storie.find((s) => !escluse.has(s.url) && /curiosit|futuro|scienza/i.test(s.categoria || "")) || null;
}

/** La sintesi di Aion, senza la parte che elenca i titoli (già raccontati sotto). */
function sintesiBreve(sintesi, max = 330) {
  if (!sintesi) return "";
  let t = sintesi.split(/\bLetti insieme\b/i)[0].trim();
  if (t.length < 60) t = sintesi;
  if (t.length > max) {
    const tagliato = t.slice(0, max);
    const fine = tagliato.lastIndexOf(". ");
    t = fine > 120 ? tagliato.slice(0, fine + 1) : tagliato.slice(0, tagliato.lastIndexOf(" ")) + "…";
  }
  return t;
}

const unaRiga = (testo, max = 165) => {
  const t = String(testo || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  const tagliato = t.slice(0, max);
  const fine = Math.max(tagliato.lastIndexOf(". "), tagliato.lastIndexOf("; "));
  return fine > 90 ? t.slice(0, fine + 1) : tagliato.slice(0, tagliato.lastIndexOf(" ")) + "…";
};

/* ------------------------------------------------------------ il testo */

const OCHIELLI = [
  "Buongiorno. Il mondo non si è fermato, e noi abbiamo preso appunti.",
  "Tre storie, un filo che le lega: è la nostra idea di rassegna stampa.",
  "Se hai tre minuti, questa è la parte della giornata che vale la pena sapere.",
  "Il rumore lo lasciamo agli altri: qui trovi i segnali.",
  "La giornata spiegata come si deve: cosa è successo, perché conta.",
  "Apri il caffè: il quadro di oggi sta in tre mosse.",
  "C'è chi legge tutto. Noi leggiamo, colleghiamo, e ti risparmiamo il resto.",
];

function componiTesto({ edizione, scelte, curiosa, brief, giorno }) {
  const fonti = testateDistinte(edizione.storie);
  const idx = Math.floor(new Date(edizione.aggiornataIl).getTime() / 86400000) % OCHIELLI.length;
  const L = [];

  /* testata */
  L.push("ALTAIR NEXUS · RASSEGNA DEL GIORNO");
  L.push(dataLunga(edizione.aggiornataIl));
  L.push("");
  L.push(OCHIELLI[idx]);
  L.push("");

  /* il segnale + la sintesi */
  if (brief.segnale) {
    L.push(`▸ IL SEGNALE DI OGGI · ${String(brief.segnale).toUpperCase()}`);
    if (brief.tema) L.push(`Tema: ${brief.tema}`);
    const sintesi = sintesiBreve(brief.sintesi);
    if (sintesi) L.push(sintesi);
    L.push("");
  }

  /* che cos'è Altair Nexus */
  L.push(
    "Altair Nexus è il briefing pubblico di Universalis Produzioni: ogni ora legge le testate " +
    "internazionali, scarta il rumore e collega i segnali che contano su intelligenza artificiale, " +
    "tecnologia, geopolitica, finanza, mercati, startup e scienza."
  );
  L.push(
    `Oggi nell'edizione: ${edizione.storie.length} storie da ${fonti.size} testate. ` +
    `Queste ${scelte.length} sono quelle che valgono il tuo tempo.`
  );
  L.push("");

  /* le storie */
  scelte.forEach((s, i) => {
    L.push(`${String(i + 1).padStart(2, "0")} ▸ ${[s.categoria, s.fonte].filter(Boolean).join(" · ")}`);
    L.push(s.titolo);
    const riga = unaRiga(s.sommario);
    if (riga) L.push(riga);
    L.push(`→ ${s.url}`);
    L.push("");
  });

  /* la storia che non ti aspetti */
  if (curiosa) {
    L.push("LA STORIA CHE NON TI ASPETTI");
    L.push(`${curiosa.titolo} (${[curiosa.categoria, curiosa.fonte].filter(Boolean).join(" · ")})`);
    L.push(`→ ${curiosa.url}`);
    L.push("");
  }

  /* cosa osservare */
  if (brief.cosaOsservare) {
    L.push("▸ DA TENERE D'OCCHIO");
    L.push(brief.cosaOsservare);
    L.push("");
  }

  /* invito */
  L.push("▬▬▬▬▬▬");
  L.push("L'edizione completa, ricostruita ogni ora:");
  L.push(SITE_URL);
  L.push("");
  L.push(
    "Ti serve il quadro in un minuto? Segui la Pagina Aion: la rassegna esce qui ogni mattina, " +
    `e non ti perdi un'edizione → ${PAGINA_URL}`
  );
  L.push("");
  L.push("Testo composto da Aion, l'IA editoriale di Universalis Produzioni. Le notizie sono delle testate citate.");
  L.push("#AltairNexus #RassegnaStampa #IntelligenzaArtificiale #Geopolitica #Mercati");

  return L.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ------------------------------------------------------------------ invio */

function pubblica(testo, immagine) {
  const args = [PUBLISH, "post", "--text", testo];
  if (immagine) args.push("--image", immagine);
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, timeout: 180000 },
      (err, stdout, stderr) => resolve({ codice: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

async function scarica(url) {
  const res = await fetch(url, { headers: { "user-agent": "AltairNexusBot/1.0 (+publisher: Universalis)" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

/* ------------------------------------------------------------------- main */

async function main() {
  let grezzo, briefHtml = "";
  try {
    grezzo = /^https?:\/\//i.test(opt("--sorgente", LLMS_URL)) ? await scarica(opt("--sorgente", LLMS_URL)) : fs.readFileSync(opt("--sorgente"), "utf8");
  } catch (e) {
    registra({ esito: "errore", motivo: e.message });
    console.error(`edizione non leggibile: ${e.message}`);
    process.exit(1);
  }
  try { briefHtml = await scarica(BRIEF_URL); } catch (e) { registra({ esito: "avviso", motivo: `brief non letto: ${e.message}` }); }

  const edizione = parseLlms(grezzo);
  const brief = briefHtml ? parseBrief(briefHtml) : {};
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
  const curiosa = storiaCuriosa(edizione.storie, scelte);
  const testo = componiTesto({ edizione, scelte, curiosa, brief, giorno: oggi });

  let card = null;
  if (!SENZA_CARD) {
    try {
      fs.mkdirSync(CARD_DIR, { recursive: true });
      const r = generaCard({
        giorno: dataLunga(edizione.aggiornataIl),
        segnale: brief.segnale || scelte[0]?.categoria || "Il quadro di oggi",
        tema: brief.tema || "",
        titoli: scelte.map((s) => ({ titolo: s.titolo, etichetta: [s.categoria, s.fonte].filter(Boolean).join(" · ") })),
        out: path.join(CARD_DIR, `${oggi}`),
      });
      card = r.png2x;
    } catch (e) {
      registra({ esito: "avviso", motivo: `card non generata: ${e.message}` });
      console.error(`card non generata (${e.message}): pubblico il solo testo`);
    }
  }

  console.log(`edizione ${edizione.aggiornataIl} · ${edizione.storie.length} storie · post da ${testo.length} caratteri` +
    (card ? ` · card ${path.relative(ROOT, card)}` : ""));
  console.log("─".repeat(70));
  console.log(testo);
  console.log("─".repeat(70));

  if (DRY) {
    registra({ esito: "prova", giorno: oggi, aggiornataIl: edizione.aggiornataIl, storie: scelte.map((s) => s.url), card });
    console.log(`prova a vuoto: nessun invio a Facebook${card ? ` · card pronta in ${card}` : ""}`);
    process.exit(0);
  }

  const esito = await pubblica(testo, card);
  const postId = (esito.stdout.match(/(\d{6,}_\d{6,})/) || [])[1] || null;

  if (esito.codice !== 0) {
    registra({ esito: "fallito", giorno: oggi, aggiornataIl: edizione.aggiornataIl, uscita: esito.codice, stdout: esito.stdout, stderr: esito.stderr });
    console.error("pubblicazione fallita:\n" + (esito.stderr || esito.stdout).slice(0, 2000));
    process.exit(5);
  }

  stato.pubblicati = stato.pubblicati.filter((p) => p.giorno !== oggi);
  stato.pubblicati.push({
    giorno: oggi, aggiornataIl: edizione.aggiornataIl, postId, card,
    storie: scelte.map((s) => s.url), quando: new Date().toISOString(),
  });
  scriviStato(stato);
  registra({ esito: "pubblicato", giorno: oggi, aggiornataIl: edizione.aggiornataIl, postId });
  console.log(esito.stdout.trim());
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    registra({ esito: "errore", motivo: String((e && e.message) || e) });
    console.error("errore:", e.message);
    process.exit(1);
  });
}
