/**
 * Timestral — client verso il servizio locale di previsione, condiviso da tutte le istanze.
 *
 * Il servizio (media/timestral-service.py) gira su 127.0.0.1:8018 e tiene in RAM UN solo
 * modello, scaricandolo quando nessuno lo usa (misurato: 471 MB col 28M carico, 35 MB a
 * vuoto). Qui non si gestisce nessun processo: quello è un'unità systemd (`timestral.service`),
 * perché la RAM va pagata una volta per la macchina, non una per istanza dell'harness.
 *
 * Confine del modulo: rete, preferenze su disco, lettura delle serie (demo e CSV). Nessuna
 * formattazione per il modello e nessun tool: quello sta in media/timestral-tool.mjs.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve } from "node:path";

const DEFAULT_PORT = Number(process.env.TIMESTRAL_PORT) || 8018;
const TOKEN_FILE = process.env.TIMESTRAL_TOKEN_FILE || "/etc/timestral/token";
/** Taglie disponibili con la RAM MISURATA su questa VPS (RSS di picco, vedi docs/TIMESTRAL.md). */
export const SIZES = {
  "5M": { rss_picco_mb: 281, load_s: 0.35, nota: "istantaneo, la meno precisa" },
  "28M": { rss_picco_mb: 471, load_s: 0.64, nota: "predefinita: il miglior rapporto qui" },
  "123M": { rss_picco_mb: 1199, load_s: 15.9, nota: "via di mezzo, caricamento lento" },
  "209M": { rss_picco_mb: 1901, load_s: 27.0, nota: "la più precisa, costa 1,9 GB" },
};

function leggiToken() {
  if (process.env.TIMESTRAL_TOKEN) return process.env.TIMESTRAL_TOKEN.trim();
  try {
    return readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

/** Percorso dentro una radice: niente `..`, niente percorsi assoluti fuori casa. */
export function dentroRadice(rootDir, p) {
  const radice = resolve(rootDir);
  const assoluto = isAbsolute(p) ? normalize(p) : resolve(radice, p);
  const rel = relative(radice, assoluto);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return assoluto;
}

/**
 * CSV → serie numerica. Accetta `,` o `;` o tab, con o senza intestazione: la colonna della
 * data è quella che contiene date riconoscibili, il valore è la prima colonna numerica
 * (o quella indicata da `column`). Righe non valide si saltano e si contano: il chiamante
 * deve poter dire quante ne ha perse, invece di far finta che il file fosse pulito.
 */
export function parseCsv(text, { column = null, valueColumn = null } = {}) {
  const righe = text.split(/\r?\n/).filter((r) => r.trim());
  if (!righe.length) throw new Error("CSV vuoto");
  const sep = [",", ";", "\t"].sort((a, b) => righe[0].split(b).length - righe[0].split(a).length)[0];
  const prima = righe[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const num = (c) => {
    const v = String(c).trim().replace(/^"|"$/g, "").replace(/\s/g, "");
    if (!v) return NaN;
    // 1.234,56 → 1234.56 · 1,234.56 → 1234.56 · 1234.5 → 1234.5
    const it = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) || /^-?\d+,\d+$/.test(v);
    const pulito = it ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
    return Number(pulito);
  };
  const numericamente = (r) => r.map(num).filter((x) => Number.isFinite(x)).length;
  const header = numericamente(prima) < Math.max(1, prima.length - 1);
  const idxData = (() => {
    if (column) {
      const i = prima.findIndex((c) => c.toLowerCase() === String(column).toLowerCase());
      if (i < 0) throw new Error(`colonna «${column}» non trovata (intestazione: ${prima.join(", ")})`);
      return i;
    }
    return 0;
  })();
  const idxValore = (() => {
    if (valueColumn) {
      const i = prima.findIndex((c) => c.toLowerCase() === String(valueColumn).toLowerCase());
      if (i < 0) throw new Error(`colonna «${valueColumn}» non trovata (intestazione: ${prima.join(", ")})`);
      return i;
    }
    for (let i = 0; i < prima.length; i += 1) if (i !== idxData && Number.isFinite(num(prima[i]))) return i;
    return prima.findIndex((_, i) => i !== idxData);
  })();
  const punti = [];
  let scartate = 0;
  for (const r of (header ? righe.slice(1) : righe)) {
    const celle = r.split(sep);
    const v = num(celle[idxValore]);
    if (!Number.isFinite(v)) {
      scartate += 1;
      continue;
    }
    punti.push([String(celle[idxData] ?? "").trim().replace(/^"|"$/g, ""), v]);
  }
  if (!punti.length) throw new Error("nessun valore numerico riconosciuto nel CSV");
  return { punti, scartate, separatore: sep === "\t" ? "tab" : sep, colonne: prima };
}

export function createTimestralClient({ mediaDir, rootDir = mediaDir, log = (m) => console.log(m) }) {
  const prefsFile = process.env.DASH_TIMESTRAL_PREFS_FILE || join(mediaDir, "timestral-prefs.json");
  const demoFile = join(mediaDir, "timestral-demo.json");
  const datiDir = join(mediaDir, "previsioni", "dati");
  const available = String(process.env.DASH_TIMESTRAL ?? "on").trim().toLowerCase() !== "off";

  const prefs = { enabled: true, size: "28M", port: DEFAULT_PORT, prediction_length: 30 };
  try {
    const raw = JSON.parse(readFileSync(prefsFile, "utf8"));
    // la feature è ACCESA di default (richiesta: per tutti gli utenti); il file serve a
    // ricordare una scelta diversa, non a imporre un default spento
    if (typeof raw?.enabled === "boolean") prefs.enabled = raw.enabled;
    if (SIZES[raw?.size]) prefs.size = raw.size;
    if (Number.isFinite(Number(raw?.port))) prefs.port = Number(raw.port);
    if (Number.isFinite(Number(raw?.prediction_length))) prefs.prediction_length = Number(raw.prediction_length);
  } catch {
    /* nessuna preferenza: default sopra */
  }

  function savePrefs() {
    try {
      writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
    } catch (err) {
      log(`[Timestral] preferenze non salvate: ${err?.message ?? err}`);
    }
  }

  const baseUrl = () => `http://127.0.0.1:${prefs.port}`;

  async function chiama(percorso, { method = "GET", body = null, timeoutMs = 60_000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(baseUrl() + percorso, {
        method,
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Timestral-Token": leggiToken(),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const testo = await res.text();
      let dati = null;
      try {
        dati = JSON.parse(testo);
      } catch {
        dati = { raw: testo.slice(0, 400) };
      }
      if (!res.ok) throw new Error(dati?.error || `HTTP ${res.status}`);
      return dati;
    } finally {
      clearTimeout(t);
    }
  }

  /** Stato del servizio. Non solleva: "spento" è uno stato, non un'eccezione. */
  async function status({ timeoutMs = 1500 } = {}) {
    if (!available) return { available: false, up: false, enabled: false, motivo: "feature disattivata (DASH_TIMESTRAL=off)" };
    try {
      const s = await chiama("/health", { timeoutMs });
      return { available: true, up: true, enabled: prefs.enabled, port: prefs.port, ...s };
    } catch (err) {
      return {
        available: true,
        up: false,
        enabled: prefs.enabled,
        port: prefs.port,
        motivo: String(err?.message ?? err),
      };
    }
  }

  /** Snapshot SINCRONO per getState (niente rete: viene chiamato a ogni broadcast). */
  function snapshot() {
    return {
      available,
      enabled: prefs.enabled,
      size: prefs.size,
      port: prefs.port,
      prediction_length: prefs.prediction_length,
      demo: demoIds(),
    };
  }

  function backtest(req, opts = {}) {
    return chiama("/backtest", { method: "POST", body: req, timeoutMs: opts.timeoutMs ?? 300_000 });
  }

  function prevedi(req, opts = {}) {
    return chiama("/forecast", { method: "POST", body: req, timeoutMs: opts.timeoutMs ?? 120_000 });
  }

  function impostaTaglia(size) {
    if (!SIZES[size]) throw new Error(`taglia sconosciuta: ${size}`);
    return chiama("/model", { method: "POST", body: { size }, timeoutMs: 180_000 }).then((s) => {
      prefs.size = size;
      savePrefs();
      return s;
    });
  }

  function scarica() {
    return chiama("/unload", { method: "POST", body: {}, timeoutMs: 20_000 });
  }

  function setEnabled(on) {
    prefs.enabled = !!on;
    savePrefs();
    return snapshot();
  }

  // ---- serie ----
  let demoCache = null;
  function demo() {
    if (demoCache) return demoCache;
    try {
      const raw = JSON.parse(readFileSync(demoFile, "utf8"));
      demoCache = Array.isArray(raw?.serie) ? raw.serie : [];
    } catch {
      demoCache = [];
    }
    return demoCache;
  }
  const demoIds = () => demo().map((s) => s.id);

  /** CSV caricati dall'utente (nella cartella dati): elenco con dimensione. */
  function csvDisponibili() {
    try {
      if (!existsSync(datiDir)) return [];
      return readdirSync(datiDir)
        // `.csv`/`.txt` sì, ma non il LEGGIMI che spiega il formato: non è una serie
        .filter((f) => /\.(csv|txt)$/i.test(f) && !/^leggimi/i.test(f))
        .map((f) => {
          const p = join(datiDir, f);
          let kb = null;
          try {
            kb = Math.round(statSync(p).size / 102.4) / 10;
          } catch {
            /* file sparito nel frattempo */
          }
          return { nome: f, kb, percorso: `previsioni/dati/${f}` };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome));
    } catch {
      return [];
    }
  }

  /**
   * Prepara le serie da mandare al servizio, da una delle tre sorgenti:
   *  - `demo`: una o più serie incluse (id di media/timestral-demo.json)
   *  - `csv`: un file caricato in media/previsioni/dati/
   *  - `series`: valori già in mano al chiamante
   * Ritorna { nomi, valori[], meta } — oppure solleva con un messaggio utile.
   */
  function preparaSerie({ demo: ids, csv, series, column, valueColumn }) {
    const fonti = [];
    if (Array.isArray(ids) && ids.length) {
      for (const id of ids) {
        const s = demo().find((d) => d.id === id);
        if (!s) throw new Error(`serie demo «${id}» inesistente (disponibili: ${demoIds().join(", ")})`);
        fonti.push({ nome: s.nome, valori: s.punti.map((p) => p[1]), meta: s, date: s.punti.map((p) => p[0]) });
      }
    }
    if (csv) {
      // Cercato prima dove il caricamento li mette davvero (media/previsioni/dati, che può
      // stare fuori dalla root dell'istanza), poi dentro la root: due candidati, nessun "..".
      const soloNome = basename(String(csv));
      const candidati = [
        dentroRadice(mediaDir, join("previsioni/dati", soloNome)),
        dentroRadice(rootDir, String(csv)),
        dentroRadice(rootDir, join("media/previsioni/dati", soloNome)),
      ].filter(Boolean);
      const file = candidati.find((c) => existsSync(c));
      if (!file || !existsSync(file)) throw new Error(`CSV non trovato: cerca in media/previsioni/dati/ (${csvDisponibili().map((c) => c.nome).join(", ") || "nessun CSV caricato"})`);
      const { punti, scartate, separatore, colonne } = parseCsv(readFileSync(file, "utf8"), { column, valueColumn });
      fonti.push({
        nome: basename(file),
        valori: punti.map((p) => p[1]),
        date: punti.map((p) => p[0]),
        meta: { id: basename(file), nome: basename(file), unita: "", frequenza: "", sintetica: false, fonte: `file caricato (${separatore}; colonne: ${colonne.join(" · ")})`, scartate },
      });
    }
    if (Array.isArray(series) && series.length) {
      // `[1, 2, 3]` = una serie sola; `[{name, values}, ...]` = più serie
      const soloNumeri = series.every((v) => v === null || typeof v === "number" || (typeof v === "string" && v.trim() !== ""));
      if (soloNumeri) series = [{ name: "serie 1", values: series }];
      for (const [i, s] of series.entries()) {
        const vals = Array.isArray(s) ? s : s?.values;
        if (!Array.isArray(vals)) throw new Error("`series` deve essere una lista di valori o di {name, values}");
        fonti.push({
          nome: (Array.isArray(s) ? null : s?.name) || `serie ${i + 1}`,
          valori: vals.map((v) => (v === null || v === "" ? null : Number(v))),
          meta: { id: `inline-${i + 1}`, nome: `serie ${i + 1}`, unita: "", frequenza: "", sintetica: null, fonte: "valori passati dal chiamante" },
        });
      }
    }
    if (!fonti.length) throw new Error("nessuna serie: indica `demo`, `csv` oppure `series`");
    return fonti;
  }

  return {
    available,
    prefs,
    snapshot,
    status,
    prevedi,
    backtest,
    impostaTaglia,
    scarica,
    setEnabled,
    demo,
    demoIds,
    csvDisponibili,
    preparaSerie,
    datiDir,
    TOKEN_FILE,
    token: leggiToken,
  };
}
