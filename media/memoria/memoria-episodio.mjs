/**
 * Episodi: il momento in cui la memoria NASCE.
 *
 * Divisione del lavoro, ed è la scelta centrale del progetto:
 *   - la STRUTTURA è deterministica (qui): date, richieste, file toccati, comandi, esiti,
 *     durata e costo. Zero token, zero interpretazione, e nessuna possibilità di inventare.
 *   - il PERCHÉ lo scrive l'agente (tool `memoria_episodio`): una riga di decisione e una di
 *     motivazione. È l'unico testo generato in tutta la memoria, ed è quello che l'indice
 *     non potrebbe mai dedurre leggendo i file.
 *
 * UPSERT, NON ACCODAMENTO: un episodio per sessione, riscritto a ogni aggiornamento. Così non
 * serve indovinare quando una sessione «finisce» — il file si aggiorna e resta sempre quello
 * vero. Le due parti non si pestano i piedi: i campi macchina stanno nel front-matter, i
 * blocchi automatici fra marcatori, e la prosa dell'agente fuori dai marcatori (sopravvive
 * alle rigenerazioni).
 *
 * Il parser delle sessioni legge il formato di pi (JSONL) e ne trae solo fatti: i percorsi
 * dei file, i comandi, le richieste. Non legge i risultati dei tool: 26 MB di output finirebbero
 * in memoria, e sarebbe esattamente il «rileggere tutto» che questa memoria esiste per evitare.
 */
import { join, isAbsolute, basename } from "node:path";
import {
  ROOT, EPISODI_DIR, MEM_DIR, scriviAtomico, leggiTesto, leggiJson, elencaFile, meta,
  relativo, slug, oggi, adesso, nomeEpisodio, stimaToken,
} from "./memoria-core.mjs";

const MAX_RICHIESTE = 12;
const MAX_FILE = 40;
const MAX_COMANDI = 25;
const LUNG_RICHIESTA = 200;

// ---------------------------------------------------------------- front-matter minimale
// JSON inline per liste e stringhe quotate: è un sottoinsieme valido di YAML, quindi i file
// restano leggibili e compatibili con qualunque strumento, senza tirare dentro un parser.

export function serializzaFrontmatter(obj) {
  const righe = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) righe.push(`${k}: ${JSON.stringify(v)}`);
    else if (typeof v === "boolean" || typeof v === "number") righe.push(`${k}: ${v}`);
    else righe.push(`${k}: ${JSON.stringify(String(v))}`);
  }
  return righe.join("\n");
}

export function parseFrontmatter(testo) {
  const m = String(testo ?? "").match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { dati: {}, corpo: String(testo ?? "") };
  const dati = {};
  for (const riga of m[1].split("\n")) {
    const i = riga.indexOf(":");
    if (i < 0) continue;
    const chiave = riga.slice(0, i).trim();
    const grezzo = riga.slice(i + 1).trim();
    if (!chiave) continue;
    if (grezzo.startsWith("[") || grezzo.startsWith('"')) {
      try {
        dati[chiave] = JSON.parse(grezzo);
        continue;
      } catch {
        /* valore non JSON: lo si prende grezzo */
      }
    }
    if (grezzo === "true" || grezzo === "false") dati[chiave] = grezzo === "true";
    else if (/^-?\d+(\.\d+)?$/.test(grezzo)) dati[chiave] = Number(grezzo);
    else dati[chiave] = grezzo;
  }
  return { dati, corpo: String(testo ?? "").slice(m[0].length) };
}

// ---------------------------------------------------------------- lettura delle sessioni

function testoDi(blocchi) {
  return (blocchi || [])
    .filter((b) => b && (b.type === "text" || typeof b === "string"))
    .map((b) => (typeof b === "string" ? b : b.text || ""))
    .join("\n")
    .trim();
}

function percorsoDi(a) {
  const p = a?.path ?? a?.file_path ?? a?.filePath ?? null;
  return typeof p === "string" && p.trim() ? p.trim() : null;
}

export function normalizzaPercorso(p) {
  if (!p) return null;
  let rel = p;
  if (isAbsolute(rel)) {
    if (!rel.startsWith(ROOT)) return null; // fuori dalla root: non è un artefatto del progetto
    rel = rel.slice(ROOT.length).replace(/^\/+/, "");
  }
  rel = rel.replace(/^\.\//, "");
  if (rel.startsWith("../") || rel.includes("/../")) return null;
  return rel || null;
}

/** Legge una sessione JSONL e ne trae SOLO fatti. */
export async function leggiSessione(percorso) {
  const testo = await leggiTesto(percorso);
  if (testo === null) return null;
  const out = {
    sessione: null,
    cwd: null,
    inizio: null,
    fine: null,
    richieste: [],
    scritture: new Map(), // rel -> {n, tipi:Set}
    letture: new Set(),
    comandi: [],
    strumenti: new Map(),
    errori: 0,
    compattazioni: [],
    modelli: new Set(),
    costo: 0,
    token_in: 0,
    token_out: 0,
    durata_turni_ms: 0,
  };
  for (const riga of testo.split("\n")) {
    if (!riga.trim()) continue;
    let o;
    try {
      o = JSON.parse(riga);
    } catch {
      continue;
    }
    if (o.type === "session") {
      out.sessione = o.id || null;
      out.cwd = o.cwd || null;
      out.inizio = o.timestamp || null;
    } else if (o.type === "model_change") {
      if (o.modelId) out.modelli.add(o.modelId);
    } else if (o.type === "compaction" || o.compaction) {
      const s = o.summary || o.compaction?.summary;
      if (s) out.compattazioni.push(String(s).slice(0, 4000));
    } else if (o.type === "custom" && o.customType === "obs-turn" && o.data) {
      out.costo += Number(o.data.cost) || 0;
      out.token_in += Number(o.data.inputTokens) || 0;
      out.token_out += Number(o.data.outputTokens) || 0;
      out.durata_turni_ms += Number(o.data.durationMs) || 0;
    } else if (o.type === "message" && o.message) {
      const m = o.message;
      if (o.timestamp) out.fine = o.timestamp;
      if (m.role === "user") {
        const t = testoDi(m.content).replace(/^<<ALLEGATI>>[\s\S]*?<<\/ALLEGATI>>\n?/, "").trim();
        if (t) out.richieste.push(t.replace(/\s+/g, " ").slice(0, LUNG_RICHIESTA));
      } else if (m.role === "assistant") {
        for (const b of m.content || []) {
          if (!b || b.type !== "toolCall") continue;
          const nome = b.name || "?";
          out.strumenti.set(nome, (out.strumenti.get(nome) || 0) + 1);
          if (nome === "write" || nome === "edit" || nome === "read") {
            const rel = normalizzaPercorso(percorsoDi(b.arguments));
            if (!rel) continue;
            if (nome === "read") out.letture.add(rel);
            else {
              const v = out.scritture.get(rel) || { n: 0, tipi: new Set() };
              v.n++;
              v.tipi.add(nome);
              out.scritture.set(rel, v);
            }
          } else if (nome === "bash") {
            const cmd = String(b.arguments?.command || "").split("\n").find((r) => r.trim());
            if (cmd) out.comandi.push(cmd.trim().slice(0, 120));
          }
        }
      } else if (m.role === "toolResult" && m.isError) {
        out.errori++;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- composizione

const AUTO_INIZIO = "<!-- auto:inizio -->";
const AUTO_FINE = "<!-- auto:fine -->";

/**
 * Il titolo di un episodio è quello che si legge nel grafo e nell'atlante: deve stare in
 * una riga e dire qualcosa. La decisione, quando c'è, è il titolo migliore; altrimenti si
 * prende la prima frase della prima richiesta, senza le formule di cortesia iniziali.
 */
function titoloBreve(richiesta, decisione) {
  if (decisione) return String(decisione).replace(/\s+/g, " ").slice(0, 70);
  const t = String(richiesta || "").replace(/\s+/g, " ").trim();
  if (!t) return "sessione";
  const frase = t.split(/(?<=[.?!])\s/)[0] || t;
  const pulita = frase.replace(/^(vorrei|potresti|puoi|mi serve|devo|come|fammi|dimmi|aiutami a)\s+/i, "");
  return (pulita.length > 12 ? pulita : t).slice(0, 60);
}

/**
 * Compone il markdown di un episodio. `esistenti` è il contenuto precedente (se c'è): da lì
 * si preservano i campi scritti dall'agente e la prosa fuori dai marcatori.
 */
export function componiEpisodio(dati, esistenti = null) {
  const prev = esistenti ? parseFrontmatter(esistenti) : { dati: {}, corpo: "" };
  const agente = {
    decisione: prev.dati.decisione || dati.decisione || "",
    perche: prev.dati.perche || dati.perche || "",
    esito: prev.dati.esito || dati.esito || "aperto",
    obiettivo: prev.dati.obiettivo || dati.obiettivo || "",
    note_agente: prev.dati.note_agente || dati.note_agente || "",
  };

  // La prosa dell'agente è ciò che sta PRIMA del primo marcatore automatico.
  const primaDelMarker = esistenti ? String(esistenti).split(AUTO_INIZIO)[0] : "";
  const note = esistenti
    ? primaDelMarker.replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/^##\s*Note[^\n]*\n?/m, "").trim()
    : "";

  const inizio = dati.inizio ? new Date(dati.inizio) : null;
  const fine = dati.fine ? new Date(dati.fine) : null;
  const durata = inizio && fine ? Math.max(0, Math.round((fine - inizio) / 60000)) : null;
  const titolo = dati.titolo || titoloBreve(dati.richieste?.[0], agente.decisione);

  const front = {
    tipo: "episodio",
    titolo,
    sessione: dati.sessione || "",
    data: (inizio ? inizio.toISOString() : adesso()).slice(0, 10),
    inizio: (dati.inizio || "").slice(0, 19),
    fine: (dati.fine || "").slice(0, 19),
    durata_min: durata ?? "",
    progetto: dati.progetto || "",
    decisione: agente.decisione,
    perche: agente.perche,
    esito: agente.esito,
    obiettivo: agente.obiettivo,
    richieste: dati.richieste?.length ?? 0,
    artefatti: dati.scritture ? [...dati.scritture.keys()].length : 0,
    errori: dati.errori ?? 0,
    costo: dati.costo ? Math.round(dati.costo * 10000) / 10000 : "",
    token: (dati.token_in || dati.token_out) ? `${dati.token_in || 0}/${dati.token_out || 0}` : "",
    modello: dati.modelli ? [...dati.modelli].join(", ") : "",
    aggiornato: adesso(),
  };

  const righe = ["---", serializzaFrontmatter(front), "---", ""];
  righe.push("## Note", note || "_Nessuna nota scritta dall'agente._", "");

  righe.push(AUTO_INIZIO);
  if (dati.richieste?.length) {
    righe.push("## Richieste", ...dati.richieste.slice(0, MAX_RICHIESTE).map((r, i) => `${i + 1}. ${r}`), "");
  }
  if (dati.scritture?.size) {
    righe.push("## File toccati");
    const voci = [...dati.scritture.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, MAX_FILE);
    for (const [rel, v] of voci) righe.push(`- \`${rel}\` — ${[...v.tipi].join("/")}${v.n > 1 ? ` (${v.n}x)` : ""}`);
    righe.push("");
  }
  if (dati.letture?.size) {
    const altre = [...dati.letture].filter((l) => !dati.scritture?.has(l)).slice(0, 20);
    if (altre.length) righe.push("## File letti (senza modifiche)", ...altre.map((r) => `- \`${r}\``), "");
  }
  if (dati.comandi?.length) {
    righe.push("## Comandi");
    for (const c of [...new Set(dati.comandi)].slice(0, MAX_COMANDI)) righe.push(`- \`${c}\``);
    righe.push("");
  }
  if (dati.strumenti?.size) {
    const elenco = [...dati.strumenti.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ");
    righe.push("## Strumenti", elenco, "");
  }
  if (dati.compattazioni?.length) {
    righe.push("## Contesto compattato (riassunto già pagato)", "");
    for (const c of dati.compattazioni) righe.push(c, "");
  }
  righe.push(AUTO_FINE, "");
  return righe.join("\n");
}

/** Percorso dell'episodio di una sessione. Stabile: stesso id → stesso file (upsert). */
export function percorsoEpisodio(dati) {
  const id = dati.sessione || slug(dati.titolo || "sessione", 12);
  const data = (dati.inizio ? String(dati.inizio) : adesso()).slice(0, 10);
  return join(EPISODI_DIR, nomeEpisodio(data, dati.richieste?.[0] || "sessione", id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)));
}

/** Scrive (o riscrive) l'episodio di una sessione, preservando la parte scritta dall'agente. */
export async function salvaEpisodio(dati, { file = null } = {}) {
  const percorso = file || percorsoEpisodio(dati);
  const esistenti = await leggiTesto(percorso);
  const markdown = componiEpisodio(dati, esistenti);
  await scriviAtomico(percorso, markdown);
  return { file: relativo(percorso), nuovo: esistenti === null, token: stimaToken(markdown) };
}

/**
 * Importa (o aggiorna) gli episodi di tutte le sessioni presenti su disco. Serve due volte:
 * per popolare la memoria del lavoro GIÀ fatto (29 sessioni esistenti, zero token: sono dati,
 * non interpretazioni) e per riparare un episodio mancato.
 */
export async function episodiDaSessioni({ sessioneFile = null, progetto = "" } = {}) {
  const dir = join(ROOT, "sessions");
  const file = sessioneFile ? [sessioneFile] : (await elencaFile(dir, { est: [".jsonl"] })).sort();
  // L'elenco si legge UNA volta e si tiene aggiornato qui: dentro il ciclo sarebbe O(n²)
  // (ogni sessione rileggerebbe tutte le pagine già scritte).
  const esistenti = await elencaEpisodi();
  const perSessione = new Map(esistenti.map((e) => [String(e.dati.sessione), e]));
  const esiti = [];
  for (const f of file) {
    const dati = await leggiSessione(f);
    if (!dati?.richieste?.length) continue; // sessioni vuote: niente episodio
    const gia = perSessione.get(String(dati.sessione)) || null;
    const percorso = gia?.file ? join(ROOT, gia.file) : null;
    const esito = await salvaEpisodio({ ...dati, progetto: progetto || gia?.dati.progetto || "" }, { file: percorso });
    esiti.push({ ...esito, sessione: dati.sessione, richieste: dati.richieste.length });
  }
  return esiti;
}

/** Elenco degli episodi con front-matter già interpretato. */
export async function elencaEpisodi() {
  const files = await elencaFile(EPISODI_DIR, { est: [".md"] });
  const fuori = [];
  for (const f of files) {
    const testo = await leggiTesto(f);
    if (testo === null) continue;
    const { dati, corpo } = parseFrontmatter(testo);
    const info = await meta(f);
    fuori.push({ file: relativo(f), dati, corpo, mtime: info?.mtime ?? 0, markdown: testo });
  }
  return fuori.sort((a, b) => String(a.dati.data || "").localeCompare(String(b.dati.data || "")));
}

/**
 * Aggiorna i campi scritti dall'agente su un episodio (decisione, perché, esito, obiettivo,
 * note). Cerca l'episodio per sessione o per file; se non lo trova, lo crea dai dati passati.
 */
export async function annotaEpisodio({ file = null, sessione = null, decisione, perche, esito, obiettivo, note }) {
  const episodi = await elencaEpisodi();
  let scelto = null;
  if (file) {
    const rel = normalizzaPercorso(file) || file;
    scelto = episodi.find((e) => e.file === rel || e.file.endsWith("/" + basename(rel)));
  }
  if (!scelto && sessione) scelto = episodi.find((e) => String(e.dati.sessione).startsWith(sessione));
  if (!scelto) scelto = episodi[episodi.length - 1] || null;
  if (!scelto) return { aggiornato: false, motivo: "nessun episodio da annotare: passa la sessione o crea prima l'episodio" };

  const { dati, corpo } = parseFrontmatter(scelto.markdown);
  const nuovi = {
    ...dati,
    decisione: decisione ?? dati.decisione ?? "",
    perche: perche ?? dati.perche ?? "",
    esito: esito ?? dati.esito ?? "aperto",
    obiettivo: obiettivo ?? dati.obiettivo ?? "",
    note_agente: note ?? dati.note_agente ?? "",
  };
  let noteAttuali = corpo.split(AUTO_INIZIO)[0] || "";
  noteAttuali = noteAttuali.replace(/^##\s*Note[^\n]*\n?/m, "").trim();
  const noteFinali = [note ? String(note).trim() : noteAttuali].filter(Boolean).join("\n\n");

  const resto = scelto.markdown.includes(AUTO_INIZIO) ? AUTO_INIZIO + scelto.markdown.split(AUTO_INIZIO)[1] : `${AUTO_INIZIO}\n${AUTO_FINE}\n`;
  const front = serializzaFrontmatter({ ...nuovi, aggiornato: adesso() });
  const markdown = `---\n${front}\n---\n\n## Note\n${noteFinali || "_Nessuna nota scritta dall'agente._"}\n\n${resto}`;
  await scriviAtomico(join(ROOT, scelto.file), markdown);
  return { aggiornato: true, file: scelto.file, decisione: nuovi.decisione, esito: nuovi.esito };
}
