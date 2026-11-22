/**
 * Client Google AI Studio (Gemini API) — un solo posto per rete, chiave ed errori.
 *
 * Serve a tre superfici diverse, che hanno TRE formati di risposta:
 *   generateContent  → chat e immagini (`candidates[0].content.parts`)
 *   decisions        → probabilità calibrate (`answers`), zero token di output
 *   models           → elenco dei modelli, usato per verificare che una chiave funzioni
 *
 * Regole che stanno qui e non nei chiamanti:
 *   - la chiave si legge da `GEMINI_API_KEY` (o `GOOGLE_API_KEY`), altrimenti da
 *     `~/.pi/agent/auth.json`; non viene MAI scritta nei log né nelle risposte;
 *   - ogni chiamata ha un timeout vero (le immagini possono metterci minuti, le decisioni
 *     millisecondi) e l'errore dice COSA fare: chiave da rinnovare, quota esaurita, prompt
 *     rifiutato, servizio giù;
 *   - nessun retry automatico: un'immagine ritentata è una seconda immagine pagata.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { GEMINI_BASE } from "./providers.mjs";

const TIMEOUT_DECISIONE_MS = 20_000;
const TIMEOUT_IMMAGINE_MS = 180_000;

/** Dove cercare la chiave: prima l'ambiente (systemd), poi il file dell'agente. */
function percorsiAuth() {
  const out = [];
  if (process.env.PI_AGENT_DIR) out.push(join(process.env.PI_AGENT_DIR, "auth.json"));
  out.push(join(homedir(), ".pi", "agent", "auth.json"));
  return out;
}

let ultimoAvviso = 0;

/** Chiave Google, oppure stringa vuota. Non logga mai il valore. */
export function chiaveGoogle() {
  const env = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (env) return env;
  for (const file of percorsiAuth()) {
    try {
      if (!existsSync(file)) continue;
      const j = JSON.parse(readFileSync(file, "utf8"));
      const k = typeof j?.google === "string" ? j.google : j?.google?.key;
      const v = String(k || "").trim();
      // una chiave "salvata" come riferimento all'ambiente non è una chiave
      if (v && !v.startsWith("$") && !v.startsWith("!")) return v;
    } catch {
      /* file illeggibile: si prosegue, la chiave manca e lo diremo con un errore chiaro */
    }
  }
  return "";
}

export function disponibile() {
  return chiaveGoogle().length > 0;
}

/** Ultimi 4 caratteri: serve a riconoscere una chiave in UI senza mostrarla. */
export function improntaChiave(k = chiaveGoogle()) {
  if (!k) return "";
  return `…${k.slice(-4)}`;
}

export class ErroreGoogle extends Error {
  constructor(code, message, { status = "", quota = false } = {}) {
    super(message);
    this.name = "ErroreGoogle";
    this.code = code;
    this.status = status;
    this.quota = quota;
  }
}

function messaggioHttp(httpStatus, corpo) {
  const g = corpo?.error || {};
  const dettaglio = String(g.message || "").slice(0, 400);
  const status = String(g.status || "");
  if (httpStatus === 400 && /api key not valid|API_KEY_INVALID|API key not valid/i.test(dettaglio)) {
    return new ErroreGoogle(401, "la chiave Google non è valida: controllala in Google AI Studio e reinseriscila", { status });
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return new ErroreGoogle(401, `Google rifiuta la chiave (${dettaglio || httpStatus}): verifica che sia attiva e che l'API Generative Language sia abilitata`, { status });
  }
  if (httpStatus === 429) {
    return new ErroreGoogle(429, `quota Google esaurita o modello non incluso nel piano (${dettaglio || "429"}). Le immagini non hanno piano gratuito: serve un progetto con fatturazione`, { status, quota: true });
  }
  if (httpStatus === 404) {
    return new ErroreGoogle(404, `modello o endpoint inesistente (${dettaglio || "404"})`, { status });
  }
  if (httpStatus >= 500) {
    return new ErroreGoogle(502, `Google ha risposto ${httpStatus} (${dettaglio || "errore del servizio"}): riprova più tardi`, { status });
  }
  return new ErroreGoogle(httpStatus || 500, dettaglio || `errore Google (${httpStatus})`, { status });
}

/**
 * Chiamata JSON alla Gemini API con timeout. Restituisce il corpo già decodificato.
 * `key` opzionale: serve al pannello che verifica una chiave PRIMA di salvarla.
 */
export async function chiamaGoogle(percorso, { method = "POST", body, key, timeoutMs = 30_000, signal } = {}) {
  const k = (key || chiaveGoogle()).trim();
  if (!k) {
    throw new ErroreGoogle(
      400,
      "nessuna chiave Google configurata: mettila in GEMINI_API_KEY (.env) oppure nel pannello «chiavi» della dashboard",
    );
  }
  const url = `${GEMINI_BASE}${percorso.startsWith("/") ? "" : "/"}${percorso}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  if (signal) signal.addEventListener?.("abort", () => ctrl.abort(), { once: true });
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "x-goog-api-key": k, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    const timeout = e?.name === "AbortError";
    throw new ErroreGoogle(
      timeout ? 504 : 502,
      timeout
        ? `Google non ha risposto entro ${Math.round(timeoutMs / 1000)} s: la richiesta è stata interrotta (se era un'immagine, non dovrebbe esserti addebitata: verifica il registro)`
        : `rete verso Google non raggiungibile: ${e?.message || e}`,
    );
  } finally {
    clearTimeout(timer);
  }
  const testo = await res.text().catch(() => "");
  let corpo = null;
  try {
    corpo = testo ? JSON.parse(testo) : {};
  } catch {
    corpo = null;
  }
  if (!res.ok) throw messaggioHttp(res.status, corpo);
  if (!corpo) throw new ErroreGoogle(502, `risposta di Google non leggibile (${testo.slice(0, 200)})`);
  return corpo;
}

/** Verifica una chiave elencando i modelli: GET /models, nessun token consumato. */
export async function verificaChiave(key) {
  const corpo = await chiamaGoogle("/models?pageSize=1", { method: "GET", key, timeoutMs: 20_000 });
  const n = Array.isArray(corpo?.models) ? corpo.models.length : 0;
  if (!n) throw new ErroreGoogle(502, "Google ha risposto senza modelli: la chiave non sembra valida");
  return { ok: true, modelli: n };
}

/**
 * Decisions API: domande tipizzate su un input condiviso.
 * `questions` è già nel formato wire (`noul`/`choice`/`score`) — la traduzione dalle forme
 * comode la fa il tool, riusando il normalizzatore di Decision_M.
 */
export async function decisione({ input, questions, model = "gemini-decision-1", timeoutMs = TIMEOUT_DECISIONE_MS }) {
  return chiamaGoogle("/decisions", {
    body: { model, input, questions },
    timeoutMs,
  });
}

/**
 * Genera UNA immagine con un modello Gemini image (Nano Banana).
 * Restituisce { mime, dati(base64), testo, token } — `testo` è la didascalia che il modello
 * aggiunge quando responseModalities include TEXT, e va tenuta: a volte corregge il prompt.
 */
export async function generaImmagine({
  prompt,
  model,
  formato = "1:1",
  dimensione = "1K",
  riferimenti = [],
  timeoutMs = TIMEOUT_IMMAGINE_MS,
  key,
}) {
  const parti = [{ text: prompt }];
  for (const r of riferimenti) parti.push({ inlineData: { mimeType: r.mime, data: r.dati } });
  const body = {
    contents: [{ parts: parti }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: { aspectRatio: formato, imageSize: dimensione },
    },
  };
  const corpo = await chiamaGoogle(`/models/${encodeURIComponent(model)}:generateContent`, {
    body,
    timeoutMs,
    key,
  });
  const cand = corpo?.candidates?.[0];
  const motivo = cand?.finishReason;
  const parts = cand?.content?.parts || [];
  const img = parts.find((p) => p?.inlineData?.data);
  const txt = parts
    .filter((p) => typeof p?.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
  if (!img) {
    const perche =
      motivo === "IMAGE_SAFETY"
        ? "il filtro contenuti ha bloccato l'immagine: cambia il prompt"
        : motivo === "PROHIBITED_CONTENT"
          ? "contenuto proibito dalle regole di Google"
          : `nessuna immagine nella risposta${motivo ? ` (finishReason: ${motivo})` : ""}`;
    throw new ErroreGoogle(422, `Immagine non generata: ${perche}`);
  }
  return {
    mime: img.inlineData.mimeType || "image/png",
    dati: img.inlineData.data,
    testo: txt,
    token: corpo?.usageMetadata || null,
    modello: corpo?.modelVersion || model,
  };
}

/** Quante immagini ha generato il modello in questa risposta (per il registro dei costi). */
export function contaImmagini(corpo) {
  const parts = corpo?.candidates?.[0]?.content?.parts || [];
  return parts.filter((p) => p?.inlineData?.data).length;
}
