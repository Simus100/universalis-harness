/**
 * Indice della memoria: frammenti + BM25, in puro Node.
 *
 * PERCHÉ BM25 E NON UN EMBEDDING: qui la memoria è fatta di nomi di file, comandi, errori,
 * decisioni e termini tecnici. Su questo materiale il match lessicale è più preciso del
 * semantico e costa zero: nessun modello, nessuna GPU, nessuna rete — e nessun risultato
 * «plausibile ma sbagliato». Il semantico resta possibile in seguito (fusione RRF, come fa
 * altair-brain), ma si aggiunge DOPO aver misurato quanto il lessicale basta.
 *
 * GRANULARITÀ (la scelta che decide la qualità del recupero): si indicizzano FRAMMENTI,
 * non file. Un file intero è un pagliaio — BM25 normalizza sulla lunghezza, quindi i
 * termini rari che cercavi si diluiscono. I frammenti seguono i titoli markdown (min 60,
 * max 1800 caratteri) e ognuno porta con sé il titolo più vicino, che è il suo contesto.
 *
 * INVALIDAZIONE SU EVENTO, MAI SU ORARIO: la chiave di un file è `mtime+size`. Finché non
 * cambia, i suoi frammenti si riusano (nessun ri-chunking). È il difetto che altair-brain ha
 * già pagato in produzione: la sua cache viveva nel processo e non si invalidava mai,
 * servendo per settimane un corpus vecchio e dichiarando «confidenza alta» su dati stantii.
 * Qui la chiave sta DENTRO il file dell'indice, quindi sopravvive anche al riavvio.
 */
import { join } from "node:path";
import {
  MEM_DIR, INDICE_FILE, ROOT, EPISODI_DIR, CHAR_PER_TOKEN, STOPWORD,
  tokenizza, stimaToken, elencaFile, leggiTesto, leggiJson, scriviJson, meta, relativo, potare, oggi, eCartella,
} from "./memoria-core.mjs";
import { parseFrontmatter } from "./memoria-episodio.mjs";

const K1 = 1.5;
const B = 0.75;
const MIN_CHUNK = 60;
const MAX_CHUNK = 1800;
/** Tetto della scheda di un file di codice: abbastanza per scopo e nomi, non per il codice. */
const MAX_CODICE = 1400;
const VERSIONE = 2;

/** Estensioni indicizzabili: qualunque configurazione venga dal di fuori, non si scavalca. */
const INDICIZZABILI = [".md", ".txt", ".json"];

/**
 * Estensioni del CODICE. Non si indicizza il contenuto (una funzione non si cerca per prosa):
 * si indicizza una scheda — percorso, righe, commento di testa, nomi definiti. Serve a
 * rispondere a «dove sta la logica del browser» senza aprire venti file, e a portare una
 * domanda al file giusto.
 */
const EST_CODICE = [".mjs", ".js", ".sh", ".html", ".css", ".py"];

/**
 * Nomi che non entrano MAI nell'indice, qualunque cosa dica la configurazione: la memoria
 * non deve contenere segreti. È una regola, non un'euristica.
 */
const NOMI_VIETATI = [/(^|\/)\.env/, /secret/i, /\.key$/i, /\.pem$/i, /credential/i, /password/i, /token/i, /\.session-secret/];

/**
 * Cosa sta fuori è importante quasi quanto cosa sta dentro: `sessions/` (26 MB di JSONL
 * con dati personali e di terzi), `backups/`, `backup_export/`, `node_modules/`, `assets/`,
 * `download/`, e `media/memoria/wiki` (derivata dal grafo: indicizzarla sarebbe
 * duplicazione e la ricerca restituirebbe due volte la stessa cosa).
 */
export const SORGENTI_DEFAULT = [
  { path: "README.md", ambito: "harness" },
  { path: "todo.md", ambito: "harness" },
  { path: "docs", est: [".md"], ambito: "harness" },
  { path: "skills", est: [".md"], ambito: "skill" },
  { path: "media", est: [".md", ".txt"], ambito: "media", ricorsivo: false },
  { path: "media/memoria/episodi", est: [".md"], ambito: "episodio" },
  { path: "media/goals.json", est: [".json"], ambito: "obiettivo", jsonArray: true },
  // Codice: schede sintetiche, non il contenuto. Il commento di testa di questi file è scritto
  // per spiegare PERCHÉ il file esiste — è la cosa più vicina a una decisione che il codice
  // contenga, e finora non era cercabile da nessuna parte.
  { path: ".", tipo: "codice", ambito: "codice", ricorsivo: false },
  { path: "media", tipo: "codice", ambito: "codice", ricorsivo: false },
  { path: "media/memoria", tipo: "codice", ambito: "codice" },
  { path: "scripts", tipo: "codice", ambito: "codice" },
];

/**
 * Da dove viene un frammento: dalla **memoria** (cose successe: episodi, obiettivi, file di
 * lavoro, codice) o dalla **documentazione** (skill e manuali, scritti per spiegare).
 *
 * La distinzione esiste per un errore osservato: alla domanda «ricetta della carbonara» la
 * memoria rispondeva con tre frammenti fuori tema presi dalle skill, con «confidenza media».
 * I termini c'erano, il fatto no. Sapere da quale dei due lati arriva la risposta è ciò che
 * permette di dire «non lo so» invece di sembrare sicura.
 */
export const AMBITI_MEMORIA = new Set(["episodio", "obiettivo", "media", "codice"]);
export function tipoDiAmbito(ambito) {
  return AMBITI_MEMORIA.has(ambito) ? "memoria" : "documentazione";
}

const SEMPRE_ESCLUSI = [
  "node_modules", ".git", "sessions", "backups", "backup_export", ".pi",
  "assets", "download", "media/memoria/wiki",
];

export async function sorgenti() {
  const custom = await leggiJson(join(MEM_DIR, "sorgenti.json"));
  const base = Array.isArray(custom?.sorgenti) && custom.sorgenti.length ? custom.sorgenti : SORGENTI_DEFAULT;
  return { lista: base, esclusi: [...SEMPRE_ESCLUSI, ...(custom?.escludi || [])] };
}

/** Le estensioni che una sorgente accetta: dichiarate, oppure quelle del suo tipo. Una sola
 *  funzione, perché l'indicizzazione e il controllo «c'è da aggiornare?» devono guardare la
 *  stessa lista: se divergono, l'indice risulta da aggiornare per sempre. */
function estDiSorgente(s) {
  if (Array.isArray(s?.est) && s.est.length) return s.est;
  return s?.tipo === "codice" ? EST_CODICE : INDICIZZABILI;
}

/** Tutti i file che le sorgenti configurate producono, già filtrati dalle regole. */
async function filesDiSorgente(s) {
  const assoluto = join(ROOT, s.path);
  const est = estDiSorgente(s);
  const info = await meta(assoluto);
  if (!info) return [];
  if (!info.cartella) return [assoluto];
  const { esclusi } = await sorgenti();
  return elencaFile(assoluto, { est, escludi: esclusi, ricorsivo: s.ricorsivo !== false });
}

/**
 * Il `.gitignore` è la dichiarazione esplicita di cosa non deve uscire da questa macchina:
 * la memoria la rispetta. È il caso che l'ha reso necessario — un documento con dati personali
 * di terzi, tenuto fuori dal repository a mano, era entrato nell'indice perché la sorgente
 * `media/*.txt` lo comprendeva. Non era una fuga (l'indice non si pubblica), ma quei dati
 * sarebbero finiti nelle risposte del modello: una regola, un posto.
 *
 * ECCEZIONE, ed è importante: gli EPISODI si gestiscono a parte. Sono in .gitignore (non si
 * pubblicano) ma devono essere indicizzati: sono il cuore della memoria. L'eccezione è però
 * RISTRETTA a `media/memoria/episodi/`, non a tutta `media/memoria/`: con l'eccezione larga
 * entrava nell'indice anche `atlante.html`, il file generato che contiene i dati dell'intera
 * memoria — e, rigenerandosi a ogni ricostruzione, teneva l'indice per sempre «da aggiornare»
 * (misurato: 1 file riletto a ogni giro senza che nulla fosse cambiato).
 */
const ECCEZIONI_GITIGNORE = ["media/memoria/episodi/"];
let cacheGitignore = null;

export async function matcherGitignore() {
  if (cacheGitignore) return cacheGitignore;
  const testo = await leggiTesto(join(ROOT, ".gitignore"));
  const esatti = new Set();
  const regex = [];
  const prefissi = [];
  for (const rigaGrezza of String(testo || "").split("\n")) {
    const riga = rigaGrezza.trim();
    if (!riga || riga.startsWith("#") || riga.startsWith("!")) continue; // le negazioni non servono qui
    const ancorato = riga.startsWith("/");
    const p2 = riga.replace(/^\//, "");
    if (p2.endsWith("/")) {
      prefissi.push(p2.slice(0, -1));
      continue;
    }
    if (!/[*?]/.test(p2)) {
      esatti.add(p2);
      continue;
    }
    const corpo = p2
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "\u0000")
      .replace(/\*/g, "[^/]*")
      .replace(/\u0000/g, ".*")
      .replace(/\?/g, ".");
    try {
      regex.push(new RegExp((ancorato ? "^" : "(^|/)") + corpo + "$"));
    } catch {
      /* pattern non traducibile: si ignora invece di far fallire l'indicizzazione */
    }
  }
  cacheGitignore = { esatti, regex, prefissi };
  return cacheGitignore;
}

function daGitignore(rel, m) {
  if (!m) return false;
  if (ECCEZIONI_GITIGNORE.some((e) => rel.startsWith(e))) return false;
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (m.esatti.has(rel) || m.esatti.has(base)) return true;
  if (m.prefissi.some((prefix) => rel === prefix || rel.startsWith(prefix + "/") || rel.includes("/" + prefix + "/"))) return true;
  return m.regex.some((r) => r.test(rel));
}

function ammesso(rel, matcher = null, est = INDICIZZABILI) {
  if (daGitignore(rel, matcher)) return false;
  if (NOMI_VIETATI.some((r) => r.test(rel))) return false;
  return est.includes(rel.slice(rel.lastIndexOf(".")));
}

// ---------------------------------------------------------------- chunking

/**
 * Spezza un testo in frammenti: per titolo markdown quando ci sono titoli, per blocchi
 * separati da righe vuote altrimenti (molte note sono prosa senza titoli: spezzarle per
 * titolo le lascerebbe in un blocco unico, e BM25 penalizza i documenti lunghi).
 */
export function spezza(testo) {
  const corpo = String(testo ?? "").replace(/\r\n/g, "\n");
  // Il front-matter è metadato: non deve inquinare il ranking né finire negli estratti.
  const senzaFront = corpo.replace(/^---\n[\s\S]*?\n---\n/, "");
  const pezzi = [];

  if (/^#{1,6}\s/m.test(senzaFront)) {
    let titolo = "";
    let buffer = [];
    const chiudi = () => {
      if (buffer.some((r) => r.trim())) pezzi.push({ titolo, testo: buffer.join("\n").trim() });
      buffer = [];
    };
    for (const riga of senzaFront.split("\n")) {
      if (/^#{1,6}\s/.test(riga)) {
        chiudi();
        titolo = riga.replace(/^#{1,6}\s*/, "").trim();
      } else buffer.push(riga);
    }
    chiudi();
  } else {
    let blocco = [];
    for (const riga of senzaFront.split("\n")) {
      if (riga.trim()) blocco.push(riga);
      else if (blocco.length) {
        pezzi.push({ titolo: "", testo: blocco.join("\n").trim() });
        blocco = [];
      }
    }
    if (blocco.length) pezzi.push({ titolo: "", testo: blocco.join("\n").trim() });
  }

  // Frammenti troppo corti non sono informativi: si fondono col vicino. Quelli troppo
  // lunghi si tagliano su confini di paragrafo (oltre una certa lunghezza il match si diluisce).
  const fusi = [];
  for (const p of pezzi) {
    if (!p.testo) continue;
    const ultimo = fusi[fusi.length - 1];
    if (ultimo && ultimo.testo.length < MIN_CHUNK && ultimo.testo.length + p.testo.length < MIN_CHUNK * 3) {
      ultimo.testo = `${ultimo.testo}\n${p.testo}`.trim();
      continue;
    }
    fusi.push({ ...p });
  }

  const fuori = [];
  for (const p of fusi) {
    if (p.testo.length < MIN_CHUNK) {
      if (fuori.length) fuori[fuori.length - 1].testo += `\n${p.testo}`;
      continue;
    }
    let resto = p.testo;
    let prima = true;
    while (resto.length > MAX_CHUNK) {
      let taglio = resto.lastIndexOf("\n\n", MAX_CHUNK);
      if (taglio < MAX_CHUNK * 0.5) taglio = resto.lastIndexOf("\n", MAX_CHUNK);
      if (taglio < MAX_CHUNK * 0.5) taglio = MAX_CHUNK;
      fuori.push({ titolo: prima ? p.titolo : `${p.titolo} (segue)`, testo: resto.slice(0, taglio).trim() });
      resto = resto.slice(taglio).trim();
      prima = false;
    }
    if (resto.length) fuori.push({ titolo: prima ? p.titolo : `${p.titolo} (segue)`, testo: resto });
  }
  return fuori.filter((f) => f.testo.length >= MIN_CHUNK || fuori.length === 1);
}

/** Frammenti di un file: i JSON con un array diventano un frammento per elemento (i goal). */
/**
 * Il commento di testa: le prime righe di commento del file, unite in un paragrafo. È il posto
 * dove il codice di questo progetto dice PERCHÉ esiste (spesso con il difetto che ha risolto e
 * la misura che lo prova). Vale più di qualunque elenco di funzioni.
 */
function commentoDiTesta(testo) {
  const righe = String(testo || "").split("\n").slice(0, 70);
  const fuori = [];
  let dentroBlocco = false;
  for (const riga of righe) {
    const r = riga.trim();
    if (dentroBlocco) {
      fuori.push(r.replace(/^\*\s?/, "").replace(/\*\/$/, "").trim());
      if (r.includes("*/")) break;
      continue;
    }
    if (!r) {
      if (fuori.length) break; // il paragrafo di testa è finito
      continue; // righe vuote prima del commento
    }
    if (r.startsWith("/*")) {
      dentroBlocco = !r.includes("*/");
      fuori.push(r.replace(/^\/\*+/, "").replace(/\*\/$/, "").trim());
      if (!dentroBlocco) break;
      continue;
    }
    if (r.startsWith("#!")) continue; // shebang: non dice nulla sul perché del file
    if (r.startsWith("//") || r.startsWith("#")) {
      fuori.push(r.replace(/^(\/\/|#)\s?/, "").trim());
      continue;
    }
    break; // primo costrutto: il commento di testa è finito
  }
  const paragrafo = fuori.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return paragrafo.length >= 40 ? paragrafo.slice(0, 900) : "";
}

/**
 * La scheda di un file di codice: dove sta, quanto è grande, che cosa dice di sé, che cosa
 * espone. Non è il codice — è la sua carta d'identità. Con ~130 file costa ~30 KB di indice
 * (meno dell'1% del totale) e rende cercabile ciò che prima si trovava solo aprendo i file.
 */
export function sintesiCodice(rel, testo) {
  const corpo = String(testo ?? "");
  const righe = corpo.split("\n").length;
  const nome = rel.slice(rel.lastIndexOf("/") + 1);
  const testa = corpo.slice(0, 6000);
  const parti = [`${rel} — ${righe} righe di codice (${Math.max(1, Math.round(corpo.length / 1024))} KB)`];

  const titoloHtml = testa.match(/<title>([^<]{3,140})<\/title>/i)?.[1];
  if (titoloHtml) parti.push(`titolo della pagina: ${titoloHtml.trim()}`);

  const commento = commentoDiTesta(testa) || testa.match(/<!--([\s\S]{60,600}?)-->/)?.[1]?.replace(/\s+/g, " ").trim();
  if (commento) parti.push(`scopo dichiarato nel file: ${commento.slice(0, 900)}`);

  const esporta = [...testa.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|let)\s+([A-Za-z0-9_$]{2,40})/gm)].map((m) => m[1]);
  const definisce = [...testa.matchAll(/^(?:async\s+)?function\s+([A-Za-z0-9_$]{2,40})/gm)].map((m) => m[1]);
  const nomi = [...new Set([...esporta, ...definisce])].slice(0, 15);
  if (nomi.length) parti.push(`definisce: ${nomi.join(", ")}`);
  if (!commento && !titoloHtml && !nomi.length) parti.push(`nessuna intestazione: file di dati o di configurazione`);

  const testoFinale = parti.join("\n").slice(0, MAX_CODICE);
  return [{ titolo: nome, testo: testoFinale }];
}

/**
 * I frammenti di un EPISODIO. Il primo non viene dal corpo ma dal front-matter, e non è un
 * dettaglio: la decisione e il perché di una sessione vivono LÍ, e il front-matter è metadato
 * che `spezza` scarta di proposito (non deve inquinare il ranking del corpo). Il risultato era
 * paradossale e l'ho verificato dal vivo: alla domanda «perché la memoria non si pubblica su
 * git» la memoria rispondeva citando il manuale, mentre la decisione registrata — che dice
 * esattamente quella cosa — non veniva trovata.
 *
 * Ora ogni episodio ha una SCHEDA in testa: data, esito, decisione, perché, obiettivo. È la
 * parte della memoria che vale di più, e finalmente è cercabile.
 */
export function chunksDiEpisodio(rel, testo) {
  const { dati, corpo } = parseFrontmatter(testo);
  const righe = [];
  const taglia = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  if (dati.titolo) righe.push(`episodio: ${taglia(dati.titolo, 200)}`);
  if (dati.data) righe.push(`data: ${taglia(dati.data, 20)}`);
  if (dati.esito) righe.push(`esito: ${taglia(dati.esito, 40)}`);
  if (dati.decisione) righe.push(`DECISIONE: ${taglia(dati.decisione, 300)}`);
  if (dati.perche) righe.push(`PERCHÉ: ${taglia(dati.perche, 700)}`);
  if (dati.obiettivo) righe.push(`obiettivo: ${taglia(dati.obiettivo, 60)}`);
  if (dati.note) righe.push(`note: ${taglia(dati.note, 600)}`);
  const fuori = righe.length ? [{ titolo: "Scheda dell'episodio", testo: righe.join("\n") }] : [];
  return [...fuori, ...spezza(corpo)];
}

/** I frammenti di un file: uno solo per il codice (la scheda), dal corpo per il resto. */
function chunksDiCodice(rel, testo) {
  return sintesiCodice(rel, testo);
}

function chunksDiFile(rel, testo, jsonArray) {
  if (jsonArray) {
    let dati = null;
    try {
      dati = JSON.parse(testo);
    } catch {
      dati = null;
    }
    const voci = Array.isArray(dati) ? dati : Array.isArray(dati?.items) ? dati.items : null;
    if (voci) {
      return voci
        .map((v) => {
          const titolo = String(v?.title || v?.id || "voce").slice(0, 140);
          const corpo = [
            v?.title,
            v?.description,
            v?.status ? `stato: ${v.status}` : "",
            ...(v?.steps || []).map((s) => `${s?.done ? "[fatto]" : "[aperto]"} ${s?.title || ""}`),
            ...(v?.checklist || []).map((c) => `${c?.done ? "[fatto]" : "[aperto]"} ${c?.text || ""}`),
          ]
            .filter(Boolean)
            .join("\n")
            .trim();
          return corpo.length >= MIN_CHUNK ? { titolo, testo: corpo } : null;
        })
        .filter(Boolean);
    }
  }
  return spezza(testo);
}

// ---------------------------------------------------------------- costruzione

/**
 * Costruisce o aggiorna l'indice. Incrementale per file: i frammenti dei file con
 * `mtime+size` invariati si riusano (niente ri-chunking). df/postings si ricalcolano da
 * tutti i frammenti, che è O(frammenti) e resta veloce.
 */
export async function buildIndice({ forza = false, silenzioso = true } = {}) {
  const { lista } = await sorgenti();
  const precedenteGrezzo = forza ? null : await leggiJson(INDICE_FILE);
  // Se cambia il MODO in cui si frammenta, i frammenti vecchi non valgono più: senza questo
  // confronto il riuso per mtime li terrebbe per sempre (è successo: le schede degli episodi
  // non comparivano perché il file dell'episodio non era cambiato, ma il chunking sí).
  const precedente = precedenteGrezzo && precedenteGrezzo.versione === VERSIONE ? precedenteGrezzo : null;
  const perFilePrec = new Map();
  if (precedente?.files) for (const f of precedente.files) perFilePrec.set(f.rel, f);

  const matcher = await matcherGitignore();
  const raccolti = [];
  let riusati = 0;
  let riletti = 0;

  for (const s of lista) {
    const files = await filesDiSorgente(s);
    const est = estDiSorgente(s);
    for (const f of files) {
      const rel = relativo(f);
      if (!ammesso(rel, matcher, est)) continue;
      const info = await meta(f);
      if (!info) continue;
      const prec = perFilePrec.get(rel);
      if (prec && prec.mtime === info.mtime && prec.size === info.size && Array.isArray(prec.chunks) && prec.chunks.length) {
        raccolti.push({ rel, ambito: s.ambito || "altro", chunks: prec.chunks, mtime: info.mtime, size: info.size });
        riusati++;
        continue;
      }
      const testo = await leggiTesto(f);
      if (testo === null) continue;
      const chunks = s.tipo === "codice"
        ? chunksDiCodice(rel, testo)
        : s.ambito === "episodio"
          ? chunksDiEpisodio(rel, testo)
          : chunksDiFile(rel, testo, s.jsonArray);
      // Anche i file senza frammenti (troppo corti) si REGISTRANO: senza, l'invalidazione
      // li vedrebbe per sempre come «nuovi» e l'indice risulterebbe da aggiornare a ogni
      // controllo. Costano una riga e chiudono un falso allarme perpetuo.
      raccolti.push({ rel, ambito: s.ambito || "altro", chunks, mtime: info.mtime, size: info.size });
      if (chunks.length) riletti++;
    }
  }

  const frammenti = [];
  for (const f of raccolti) {
    f.chunks.forEach((c, i) => {
      frammenti.push({
        id: frammenti.length,
        file: f.rel,
        ambito: f.ambito,
        titolo: c.titolo || "",
        testo: c.testo,
        n_token: Math.max(1, Math.ceil(c.testo.length / CHAR_PER_TOKEN)),
        pos: i,
        n_token_bm25: 0,
      });
    });
  }

  const df = new Map();
  const postings = new Map();
  let totLunghezza = 0;
  for (const fr of frammenti) {
    const termini = tokenizza(`${fr.titolo} ${fr.testo}`);
    const tf = new Map();
    for (const t of termini) tf.set(t, (tf.get(t) || 0) + 1);
    fr.n_token_bm25 = termini.length || 1;
    totLunghezza += fr.n_token_bm25;
    for (const [t, n] of tf) {
      if (!postings.has(t)) postings.set(t, []);
      postings.get(t).push([fr.id, n]);
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const n = frammenti.length || 1;
  const idf = {};
  for (const [t, d] of df) idf[t] = Math.log(1 + (n - d + 0.5) / (d + 0.5));

  const indice = {
    versione: VERSIONE,
    generato: new Date().toISOString(),
    parametri: { k1: K1, b: B },
    avgdl: frammenti.length ? totLunghezza / frammenti.length : 0,
    n_frammenti: frammenti.length,
    stopword: [...STOPWORD].slice(0, 50),
    idf,
    postings: Object.fromEntries(postings),
    frammenti: frammenti.map(({ id, file, ambito, titolo, testo, n_token, n_token_bm25 }) => ({ id, file, ambito, titolo, testo, n_token, n_token_bm25 })),
    files: raccolti.map((f) => ({ rel: f.rel, ambito: f.ambito, mtime: f.mtime, size: f.size, chunks: f.chunks })),
  };
  await scriviJson(INDICE_FILE, indice);
  cache = null;
  const scritto = await meta(INDICE_FILE);
  const esito = {
    n_file: raccolti.length,
    n_frammenti: frammenti.length,
    riusati,
    riletti,
    kb: scritto ? Math.round(scritto.size / 1024) : null,
    generato: indice.generato,
  };
  if (!silenzioso) {
    console.log(`[memoria] indice: ${esito.n_file} file, ${esito.n_frammenti} frammenti, ${esito.riletti} riletti / ${esito.riusati} riusati (${esito.kb} KB)`);
  }
  return esito;
}

// ---------------------------------------------------------------- lettura e ricerca

let cache = null;

/** Indice in memoria, ricaricato quando il file su disco cambia (mtime). */
export async function caricaIndice({ forza = false } = {}) {
  const info = await meta(INDICE_FILE);
  if (!info) return null;
  if (!forza && cache && cache.mtime === info.mtime) return cache.indice;
  const indice = await leggiJson(INDICE_FILE);
  if (!indice?.frammenti) return null;
  cache = { mtime: info.mtime, indice };
  return indice;
}

/** C'è qualcosa di nuovo da indicizzare? (indice assente o più vecchio di una sorgente) */
export async function indiceDaAggiornare() {
  const info = await meta(INDICE_FILE);
  if (!info) return true;
  const indice = await caricaIndice();
  if (!indice?.files) return true;
  const noti = new Map(indice.files.map((f) => [f.rel, f]));
  const matcher = await matcherGitignore();
  const { lista } = await sorgenti();
  for (const s of lista) {
    const est = estDiSorgente(s);
    for (const f of await filesDiSorgente(s)) {
      const rel = relativo(f);
      if (!ammesso(rel, matcher, est)) continue;
      const info2 = await meta(f);
      const vecchio = noti.get(rel);
      if (!vecchio || vecchio.mtime !== info2?.mtime || vecchio.size !== info2?.size) return true;
    }
  }
  return false;
}

export function cercaBM25(indice, query, limite = 40) {
  const k1 = indice.parametri?.k1 ?? K1;
  const b = indice.parametri?.b ?? B;
  const avgdl = indice.avgdl || 1;
  const docs = indice.frammenti;
  const punteggi = new Map();
  for (const termine of tokenizza(query)) {
    const posting = indice.postings[termine];
    if (!posting) continue;
    const peso = indice.idf[termine] ?? 0;
    for (const [docId, tf] of posting) {
      const dl = docs[docId]?.n_token_bm25 || avgdl;
      const num = tf * (k1 + 1);
      const den = tf + k1 * (1 - b + (b * dl) / avgdl);
      punteggi.set(docId, (punteggi.get(docId) || 0) + (peso * num) / den);
    }
  }
  return [...punteggi.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, limite);
}

/**
 * Quanto fidarsi di questo recupero. Deterministico, spiegabile, e nato per DIRE DI NO:
 * un sistema che risponde sempre con sicurezza non ha una misura di sé.
 *
 *   copertura   = quota dei termini della domanda coperti dai frammenti in TESTA (non dal
 *                 solo primo: i frammenti sono brevi e il migliore può citare poche parole
 *                 della domanda — misurare sul solo primo produce falsi allarmi, verificato).
 *   separazione = quanto il primo stacca il quinto. Se valgono tutti uguale, nessuno spicca:
 *                 la domanda è diffusa, o fuori dal corpus.
 */
export function diagnosi(indice, query, classifica) {
  const termini = tokenizza(query);
  const misura = "copertura lessicale dei termini nel corpus — non correttezza, non aggiornamento: verificare la fonte e la sua data";
  if (!classifica?.length || !termini.length) {
    return { confidenza: "nessuna", fonte: "nessuna", copertura: 0, separazione: 0, motivo: "nessun risultato: la memoria non contiene questi termini", misura };
  }
  const coperti = new Set();
  const inTesta = [];
  for (const [docId] of classifica.slice(0, 3)) {
    const doc = indice.frammenti[docId];
    if (!doc) continue;
    inTesta.push(doc);
    const presenti = new Set(tokenizza(`${doc.titolo} ${doc.testo}`));
    for (const t of termini) if (presenti.has(t)) coperti.add(t);
  }
  const copertura = coperti.size / termini.length;
  const punteggi = classifica.slice(0, 5).map(([, p]) => p);
  const separazione = punteggi.length > 1 && punteggi[0] > 0 ? (punteggi[0] - punteggi[punteggi.length - 1]) / punteggi[0] : 1;

  // Da dove arriva la risposta: fatti registrati (memoria) o manuali (documentazione)?
  const tipi = new Set(inTesta.map((f) => tipoDiAmbito(f.ambito)));
  const fonte = tipi.size > 1 ? "mista" : (tipi.values().next().value ?? "nessuna");

  let confidenza;
  let motivo;
  if (copertura < 0.34) {
    confidenza = "bassa";
    motivo = `solo ${Math.round(copertura * 100)}% dei termini della domanda è coperto: probabilmente la memoria non ha questa conoscenza`;
  } else if (fonte === "documentazione") {
    // Il caso che ha reso necessaria questa regola: i termini ci sono, ma solo in skill e
    // manuali. Il manuale parla dell'argomento, la memoria non ha il fatto: per chi chiede
    // «cosa è successo / cosa si è deciso» questa è una non-risposta, e va detta.
    confidenza = "bassa";
    motivo = `i termini compaiono solo in DOCUMENTAZIONE (skill e manuali), non in episodi, obiettivi o file di lavoro: la memoria non ha il fatto, ha il testo che ne parla`;
  } else if (copertura >= 0.6 && separazione >= 0.15) {
    confidenza = "alta";
    motivo = `${Math.round(copertura * 100)}% dei termini trovati e un frammento stacca gli altri`;
  } else {
    confidenza = "media";
    motivo = `${Math.round(copertura * 100)}% dei termini trovati${separazione < 0.15 ? "; nessun frammento spicca sugli altri" : ""}`;
  }
  if (fonte === "mista" && confidenza !== "bassa") motivo += "; parte dei frammenti è documentazione";
  return { confidenza, fonte, copertura: Math.round(copertura * 100) / 100, separazione: Math.round(separazione * 100) / 100, motivo, misura };
}

/** Ricerca, deduplicata per file (il secondo frammento dello stesso file aggiunge poco). */
export async function cerca(query, { limite = 12, ambito = null, perFileUnico = true } = {}) {
  const indice = await caricaIndice();
  if (!indice) return { risultati: [], diagnosi: null, indice_assente: true };
  const grezza = cercaBM25(indice, query, 60);
  const diag = diagnosi(indice, query, grezza);
  const visti = new Set();
  const risultati = [];
  for (const [docId, punteggio] of grezza) {
    const f = indice.frammenti[docId];
    if (!f) continue;
    if (ambito && f.ambito !== ambito) continue;
    if (perFileUnico && visti.has(f.file)) continue;
    visti.add(f.file);
    risultati.push({
      file: f.file,
      ambito: f.ambito,
      tipo: tipoDiAmbito(f.ambito),
      titolo: f.titolo,
      testo: f.testo,
      punteggio: Math.round(punteggio * 1000) / 1000,
      token: f.n_token,
    });
    if (risultati.length >= limite) break;
  }
  return { risultati, diagnosi: diag, indice_assente: false, generato: indice.generato, n_frammenti: indice.n_frammenti };
}

/**
 * Il pacchetto di contesto: il formato con cui la memoria entra nella conversazione.
 *
 * Due scelte che non sono estetiche:
 *  - SOGLIA DI PERTINENZA: si scarta ciò che vale meno del 45% del frammento migliore.
 *    Riempire il budget fino all'orlo con risultati mediocri peggiora la risposta — il
 *    degrado da contesto lungo è misurato ed è silenzioso. Meglio tre frammenti buoni che
 *    dieci tiepidi.
 *  - POTATURA SUL TESTO RENDERIZZATO: il budget si verifica sull'output, non sui pezzi
 *    (sommare i pezzi ignora l'impalcatura e sfora sempre).
 */
export async function pacchetto(query, { budget = 1200, limite = 8, ambito = null } = {}) {
  const esito = await cerca(query, { limite: 20, ambito });
  if (esito.indice_assente) {
    return {
      query,
      indice_assente: true,
      testo: "La memoria non è ancora indicizzata. Esegui «node media/memoria/memoria-build.mjs», oppure chiama memoria_grafo con azione \"ricostruisci\".",
    };
  }
  const migliore = esito.risultati[0]?.punteggio ?? 0;
  const soglia = migliore * 0.45;
  const frammenti = esito.risultati.filter((r) => r.punteggio >= soglia).slice(0, limite);

  const costruisci = (frs) => {
    const righe = [
      `MEMORIA — ${frs.length} frammenti per «${query}»`,
      `confidenza ${esito.diagnosi.confidenza.toUpperCase()}: ${esito.diagnosi.motivo}`,
    ];
    // Se la risposta è solo documentazione, lo si dice PRIMA dei frammenti: chi legge deve
    // sapere subito che sta leggendo un manuale, non un fatto registrato.
    if (esito.diagnosi.fonte === "documentazione") {
      righe.push(`_quello che segue è DOCUMENTAZIONE (scritta per spiegare), non un episodio o una decisione registrata._`);
    }
    for (const f of frs) righe.push("", `### ${f.titolo || f.file}  _([${f.ambito}] ${f.file})_`, f.testo);
    righe.push("", `_indice aggiornato al ${String(esito.generato).slice(0, 16).replace("T", " ")} · ${esito.n_frammenti} frammenti in memoria_`);
    return righe.join("\n");
  };

  const costo = potare(budget, () => costruisci(frammenti), [{ array: frammenti, minimo: 1 }]);

  // IL BUDGET È UN TETTO, non un consiglio. Il test l'ha dimostrato: con budget 300 token il
  // pacchetto ne restituiva 752, perché la potatura si ferma quando resta un frammento e un
  // frammento può valere 450 token da solo. Un tetto che si può sforare del 150% è peggio di
  // nessun tetto: chi lo usa calcola male il costo. Qui, se serve, si TRONCA il testo dei
  // frammenti rimasti (dal più lungo) finché il pacchetto rientra.
  let testoFinale = costruisci(frammenti);
  if (stimaToken(testoFinale) > budget && frammenti.length) {
    const lunghezzaMinima = 200; // sotto, un frammento non è più informativo di un titolo
    let guardia = 0;
    while (stimaToken(costruisci(frammenti)) > budget && guardia++ < 60) {
      frammenti.sort((a, b) => b.testo.length - a.testo.length);
      const lungo = frammenti[0];
      if (lungo.testo.length <= lunghezzaMinima) break;
      const taglio = Math.max(lunghezzaMinima, Math.floor(lungo.testo.length * 0.75));
      lungo.testo = lungo.testo.slice(0, taglio).replace(/\s+\S*$/, "") + " […]";
      testoFinale = costruisci(frammenti);
    }
    frammenti.sort((a, b) => b.punteggio - a.punteggio);
    testoFinale = costruisci(frammenti);
  }
  return { query, budget, token_stimati: stimaToken(testoFinale), diagnosi: esito.diagnosi, frammenti, testo: testoFinale };
}

/** Stato della memoria: per la vista, per il tool e per la diagnostica. */
export async function statoMemoria() {
  const indice = await caricaIndice();
  const info = await meta(INDICE_FILE);
  let daAggiornare = false;
  try {
    daAggiornare = await indiceDaAggiornare();
  } catch {
    daAggiornare = false;
  }
  let episodi = [];
  try {
    episodi = await elencaFile(EPISODI_DIR, { est: [".md"] });
  } catch {
    episodi = [];
  }
  return {
    indice: indice
      ? { generato: indice.generato, file: indice.files?.length ?? 0, frammenti: indice.n_frammenti, kb: info ? Math.round(info.size / 1024) : null }
      : null,
    da_aggiornare: daAggiornare,
    episodi: episodi.length,
    oggi: oggi(),
  };
}
