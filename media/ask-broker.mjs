/**
 * Broker delle domande all'utente (`ask_user`).
 *
 * Perché un modulo a parte: è la parte con più invarianti (stati, timeout, idempotenza,
 * validazione, sicurezza dell'input) e va provata SENZA server, senza browser e senza modello.
 * Non importa nulla dalla dashboard: riceve `broadcast` e le opzioni dall'esterno.
 *
 * Modello degli stati (dalla spec MCP `elicitation`: accept / decline / cancel):
 *
 *   pending ──► answered   (l'utente ha inviato le risposte)
 *           ├─► declined   (rifiuto esplicito: «salta / decidi tu»)
 *           ├─► cancelled  (turno interrotto, oppure nuova domanda che sostituisce questa)
 *           └─► expired    (timeout scaduto, o domanda rimasta orfana dopo un riavvio)
 *
 * Nessuno stato resta implicito: il tool riceve SEMPRE un esito esplicito, così il modello non
 * può credere a una risposta che nessuno ha dato.
 *
 * Sicurezza:
 *  - il testo che scrive l'utente è input non fidato → limiti di lunghezza, niente caratteri di
 *    controllo (le stringhe finiscono in chat e su terminale: una sequenza di escape è un attacco),
 *    e le risposte sono valide solo se appartengono alle opzioni offerte;
 *  - i segreti non si chiedono in un form: la spec MCP lo VIETA in form mode. Chi chiede password o
 *    API key riceve un rifiuto motivato (fallimento rumoroso, non silenzioso);
 *  - si accettano risposte solo per domande pendenti con lo stesso id (idempotenza: la seconda
 *    risposta è «già risolta», non un secondo esito).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

// ---- limiti (dalle best practice: OpenClaw, Pydantic, Claude Code, spec MCP) ----
export const LIMITS = {
  maxQuestions: 4,
  maxOptions: 6,
  minOptions: 2,
  headerMax: 24,
  questionMax: 400,
  labelMax: 60,
  descriptionMax: 240,
  contextMax: 240,
  otherMax: 2000,
  answerTotalMax: 8000,
  defaultTimeoutMs: 900_000, // 900 s
  minTimeoutMs: 30_000,
  maxTimeoutMs: 3_600_000,
  resolvedKept: 30, // quante risoluzioni restano in memoria (per il riallineamento del client)
};

/** Errore "di merito": ha un codice HTTP e un messaggio leggibile (al modello o al client). */
export class AskError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Normalizza una stringa proveniente dall'esterno: via i caratteri di controllo (tranne il
 * newline), spazi compressi, lunghezza limitata. Non fidarsi MAI di quello che arriva.
 */
export function sanitizeText(value, max = 400) {
  let s = String(value ?? "");
  // niente NUL né caratteri di controllo: su un terminale sono sequenze di escape
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, " ");
  s = s.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n");
  s = s.trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + "…";
  return s;
}

/** Chiave in snake_case per correlare le risposte (deriva dall'header se non fornita). */
export function slugId(value, fallback = "domanda") {
  const s = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return s || fallback;
}

/**
 * Le domande di un form non devono raccogliere credenziali (spec MCP, form mode).
 * Un rifiuto esplicito è meglio di un fallimento silenzioso: il modello riceve
 * l'istruzione corretta (file, variabile d'ambiente, gestore di segreti).
 */
const SECRET_RE = new RegExp(
  [
    "password", "passwd", "\\bpwd\\b", "api[\\s_-]?key", "apikey", "client[\\s_-]?secret",
    "secret[\\s_-]?key", "private[\\s_-]?key", "access[\\s_-]?token", "refresh[\\s_-]?token",
    "bearer[\\s_-]?token", "codice otp", "\\botp\\b", "\\bcvv\\b", "\\bcvc\\b",
    "carta di credito", "numero di carta", "seed phrase", "frase di recupero",
    "credenzial", "\\biban\\b", "\\bpin\\b",
  ].join("|"),
  "i",
);

/** Valida e normalizza gli argomenti del modello. Fuori dai limiti → errore leggibile (retry). */
export function normalizeQuestions(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (!list.length) {
    throw new AskError(400, "`questions` è obbligatorio: serve almeno una domanda (1-4).");
  }
  if (list.length > LIMITS.maxQuestions) {
    throw new AskError(
      400,
      `troppe domande (${list.length}): il massimo è ${LIMITS.maxQuestions}. Raggruppa le domande correlate o fai più chiamate.`,
    );
  }
  const seen = new Set();
  const out = [];
  for (const [i, q] of list.entries()) {
    if (!q || typeof q !== "object") throw new AskError(400, `la domanda #${i + 1} non è un oggetto.`);
    const question = sanitizeText(q.question ?? q.text ?? "", LIMITS.questionMax);
    if (!question) throw new AskError(400, `la domanda #${i + 1} non ha testo (\`question\`).`);
    const header = sanitizeText(q.header ?? q.label ?? "", LIMITS.headerMax) || `Domanda ${i + 1}`;

    const opts = Array.isArray(q.options) ? q.options : [];
    if (opts.length < LIMITS.minOptions) {
      throw new AskError(
        400,
        `la domanda «${header}» ha ${opts.length} opzioni: servono almeno ${LIMITS.minOptions}. ` +
          `Metti le scelte in \`options\` (etichetta + descrizione), non nella prosa.`,
      );
    }
    if (opts.length > LIMITS.maxOptions) {
      throw new AskError(400, `la domanda «${header}» ha ${opts.length} opzioni: il massimo è ${LIMITS.maxOptions}.`);
    }
    const options = [];
    for (const [j, o] of opts.entries()) {
      const label = sanitizeText(typeof o === "string" ? o : (o?.label ?? ""), LIMITS.labelMax);
      if (!label) throw new AskError(400, `l'opzione #${j + 1} della domanda «${header}» non ha etichetta.`);
      if (/^\s*altro\b|^\s*other\b/i.test(label)) {
        throw new AskError(
          400,
          `la domanda «${header}» contiene un'opzione «${label}»: NON aggiungere mai l'opzione "Altro"/"Other", ` +
            `la interfaccia la mostra da sé. Togli quell'opzione (e usa il testo libero dell'utente come risposta).`,
        );
      }
      if (options.some((x) => x.label === label)) {
        throw new AskError(400, `la domanda «${header}» ha due opzioni identiche («${label}»).`);
      }
      options.push({
        label,
        description: sanitizeText(typeof o === "string" ? "" : (o?.description ?? ""), LIMITS.descriptionMax),
      });
    }

    let id = sanitizeText(q.id ?? "", 40);
    id = slugId(id || header, `q${i + 1}`);
    if (id === "altro" || id === "other") id = `q${i + 1}`;
    if (seen.has(id)) id = `${id}_${i + 1}`;
    seen.add(id);

    out.push({ id, header, question, options, multiSelect: q.multiSelect === true });
  }

  const blob = out.map((q) => `${q.header} ${q.question} ${q.options.map((o) => `${o.label} ${o.description}`).join(" ")}`).join(" ");
  if (SECRET_RE.test(blob)) {
    throw new AskError(
      400,
      "RIFIUTATO: le credenziali (password, API key, token, dati di carta) non si chiedono in un form in chat — " +
        "la specifica MCP lo vieta per il form mode. Chiedi all'utente di metterle in un file o in una variabile " +
        "d'ambiente (es. .env) e poi leggile da lì con il tool `read`; oppure lascia che le inserisca dove serve.",
    );
  }
  return out;
}

/** Valida la risposta del client contro la domanda. Ignora ciò che non era stato offerto. */
function validateAnswers(questions, raw) {
  const list = Array.isArray(raw) ? raw : [];
  const byId = new Map(list.map((a) => [String(a?.id ?? ""), a]));
  const answers = [];
  let total = 0;
  for (const q of questions) {
    const a = byId.get(q.id) ?? null;
    if (byId.size && !a && list.length) {
      // la domanda non compare nella risposta: contala come saltata (parziale ammesso)
    }
    const offered = new Set(q.options.map((o) => o.label));
    let selected = [];
    if (a) {
      const rawSel = Array.isArray(a.selected) ? a.selected : a.selected == null ? [] : [a.selected];
      for (const s of rawSel) {
        const label = sanitizeText(s, LIMITS.labelMax);
        if (!offered.has(label)) {
          throw new AskError(400, `risposta non valida per «${q.header}»: «${label}» non è fra le opzioni offerte.`);
        }
        if (!selected.includes(label)) selected.push(label);
      }
      if (!q.multiSelect && selected.length > 1) {
        throw new AskError(400, `risposta non valida per «${q.header}»: è a scelta singola, ne sono arrivate ${selected.length}.`);
      }
    }
    const other = sanitizeText(a?.other ?? "", LIMITS.otherMax) || null;
    const skipped = selected.length === 0 && !other;
    total += selected.join("").length + (other?.length ?? 0);
    if (total > LIMITS.answerTotalMax) throw new AskError(400, "risposte troppo lunghe: riduci il testo libero.");
    answers.push({ id: q.id, header: q.header, selected, other, skipped });
  }
  return answers;
}

/** Riga leggibile per il modello (il JSON strutturato viaggia accanto, in `details`). */
function resultText(status, context, answers) {
  if (status === "answered") {
    const lines = answers
      .filter((a) => !a.skipped)
      .map((a) => `- ${a.header}: ${[...a.selected, a.other].filter(Boolean).join(" | ")}`);
    const skipped = answers.filter((a) => a.skipped).map((a) => a.header);
    return (
      `Risposta dell'utente${context ? ` (${context})` : ""}:\n${lines.join("\n") || "- (nessuna)"}` +
      (skipped.length ? `\nSaltate: ${skipped.join(", ")}` : "") +
      "\nProsegui usando queste risposte come dati, senza richiederle di nuovo."
    );
  }
  if (status === "declined") {
    return (
      "L'utente ha scelto di non rispondere (ha saltato la domanda). " +
      "Prosegui con il tuo miglior giudizio: dichiara in una riga l'assunzione che stai facendo " +
      "e non riproporre la stessa domanda."
    );
  }
  if (status === "expired") {
    return (
      "Nessuna risposta dall'utente entro il tempo massimo (domanda scaduta; può darsi che non fosse " +
      "davanti allo schermo). Prosegui con il tuo miglior giudizio, dichiarando in una riga l'assunzione " +
      "fatta; se serve, chiedi di nuovo più tardi con una domanda più mirata."
    );
  }
  return (
    "Domanda annullata (turno interrotto o sostituito) — nessuna risposta. " +
    "Se il lavoro deve continuare, riproponi la domanda nel prossimo turno."
  );
}

/**
 * Crea il broker.
 *
 * @param {object} opts
 * @param {(event: string, data: any) => void} opts.broadcast  invio SSE verso i client
 * @param {string} [opts.logFile]                    log append-only (audit + orfani)
 * @param {() => number} [opts.hasClients]           quanti client SSE sono collegati (0 = nessuno guarda)
 * @param {() => string|null} [opts.sessionId]       sessione corrente (per il log)
 */
export function createAskBroker({
  broadcast = () => {},
  logFile = null,
  log = () => {},
  hasClients = () => 1,
  sessionId = () => null,
  now = () => Date.now(),
  limits = LIMITS,
} = {}) {
  /** id -> richiesta pendente */
  const pending = new Map();
  /** id -> esito (le ultime `resolvedKept`, per il riallineamento del client) */
  const resolved = new Map();
  let counter = 0;
  let disposed = false;

  function persist(record) {
    if (!logFile) return;
    try {
      mkdirSync(dirname(logFile), { recursive: true });
      appendFileSync(logFile, JSON.stringify({ ...record, ts: new Date(now()).toISOString() }) + "\n");
    } catch (err) {
      log(`[ask] log non scritto: ${err?.message ?? err}`);
    }
  }

  function remember(id, outcome) {
    resolved.set(id, outcome);
    while (resolved.size > limits.resolvedKept) resolved.delete(resolved.keys().next().value);
  }

  /**
   * Marca come scadute le domande rimaste senza esito nel log: dopo un riavvio del processo
   * la promessa del tool non esiste più, quindi una card «in attesa» resterebbe tale per sempre.
   */
  function markOrphansExpired() {
    if (!logFile || !existsSync(logFile)) return 0;
    let lines = [];
    try {
      if (statSync(logFile).size > 4 * 1024 * 1024) {
        renameSync(logFile, `${logFile}.1`);
        writeFileSync(logFile, "");
      }
      lines = readFileSync(logFile, "utf8").split("\n").filter(Boolean);
    } catch {
      return 0;
    }
    const open = new Map();
    for (const line of lines) {
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      if (rec.t === "ask" && !rec.pending && !rec.id) continue;
      if (rec.t === "ask" && rec.pending) open.set(rec.id, rec);
      else if (rec.t === "resolved") open.delete(rec.id);
    }
    for (const [id, rec] of open) {
      persist({ t: "resolved", id, status: "expired", reason: "riavvio del processo", answers: null, ms: null, sessionId: rec.sessionId ?? null });
    }
    if (open.size) log(`[ask] ${open.size} domanda/e pendenti marcate come scadute (riavvio del processo)`);
    return open.size;
  }

  /** Apre una domanda e attende l'esito. Ritorna SEMPRE un esito esplicito. */
  function ask({ id, params, signal, reason = "ask" } = {}) {
    if (disposed) {
      return Promise.resolve({
        status: "cancelled",
        answers: [],
        text: "Domanda non posta: il servizio è in chiusura.",
      });
    }
    let questions;
    try {
      questions = normalizeQuestions(params?.questions);
    } catch (err) {
      return Promise.reject(err);
    }
    const context = sanitizeText(params?.context ?? params?.why ?? "", limits.contextMax);
    let timeoutMs = Number(params?.timeoutSeconds ? Number(params.timeoutSeconds) * 1000 : limits.defaultTimeoutMs);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) timeoutMs = limits.defaultTimeoutMs;
    timeoutMs = Math.min(Math.max(timeoutMs, limits.minTimeoutMs), limits.maxTimeoutMs);

    const askId = String(id || `ask_${now().toString(36)}_${(counter++).toString(36)}_${randomBytes(3).toString("hex")}`);

    // Una sola domanda in attesa per volta: due card aperte contemporaneamente confondono,
    // e con una sola sessione l'agente è comunque in un turno alla volta. La precedente viene
    // chiusa come "cancelled" (sostituita), con esito esplicito.
    for (const [oldId, old] of pending) {
      settle(oldId, "cancelled", null, { reason: "sostituita da una nuova domanda" });
      log(`[ask] domanda ${oldId} annullata: sostituita da ${askId} (${old.questions.length} domande in attesa)`);
    }

    const req = {
      id: askId,
      questions,
      context: context || null,
      createdAt: now(),
      timeoutAt: now() + timeoutMs,
      timeoutMs,
      sessionId: sessionId() ?? null,
      watchers: hasClients(),
      resolve: null,
    };

    return new Promise((resolve) => {
      req.resolve = resolve;
      pending.set(askId, req);

      const timer = setTimeout(() => {
        settle(askId, "expired", null, { reason: `nessuna risposta entro ${Math.round(timeoutMs / 1000)} s` });
      }, timeoutMs);
      req.timer = timer;

      if (signal && typeof signal.addEventListener === "function") {
        if (signal.aborted) settle(askId, "cancelled", null, { reason: "turno interrotto" });
        else
          signal.addEventListener(
            "abort",
            () => settle(askId, "cancelled", null, { reason: "turno interrotto" }),
            { once: true },
          );
      }

      persist({
        t: "ask",
        pending: true,
        id: askId,
        sessionId: req.sessionId,
        context: req.context,
        questions,
        timeoutSeconds: Math.round(timeoutMs / 1000),
        watchers: req.watchers,
        reason,
      });

      // Il client riceve la domanda: id = toolCallId, così la card si applica al punto giusto
      // del messaggio e il riallineamento dopo un reload è idempotente.
      broadcast("ask_request", publicRequest(req));
    });
  }

  /** Forma pubblica della richiesta (identica a quella che il client deve poter ricostruire). */
  function publicRequest(req) {
    return {
      id: req.id,
      questions: req.questions,
      context: req.context,
      createdAt: req.createdAt,
      timeoutAt: req.timeoutAt,
      timeoutSeconds: Math.round(req.timeoutMs / 1000),
      sessionId: req.sessionId,
      watchers: req.watchers,
    };
  }

  /** Conclude una richiesta (una sola volta): risolve la promessa, avvisa il client, scrive il log. */
  function settle(id, status, answers, extra = {}) {
    const req = pending.get(id);
    if (!req) return false;
    pending.delete(id);
    if (req.timer) clearTimeout(req.timer);
    const ms = now() - req.createdAt;
    const outcome = {
      id,
      status,
      answers: status === "answered" ? answers : null,
      answeredAt: now(),
      ms,
      reason: extra.reason ?? null,
    };
    remember(id, outcome);
    persist({
      t: "resolved",
      id,
      sessionId: req.sessionId,
      status,
      answers: outcome.answers,
      ms,
      reason: outcome.reason,
      questions: req.questions,
      context: req.context,
    });
    broadcast("ask_resolved", {
      id,
      status,
      answers: outcome.answers,
      ms,
      reason: outcome.reason,
    });
    req.resolve({
      status,
      answers: status === "answered" ? answers : [],
      ms,
      reason: outcome.reason,
      text: resultText(status, req.context, status === "answered" ? answers : []),
      details: {
        askId: id,
        status,
        answers: status === "answered" ? answers : [],
        timeoutSeconds: Math.round(req.timeoutMs / 1000),
      },
    });
    log(`[ask] ${id} → ${status}${ms ? ` (${Math.round(ms / 1000)} s)` : ""}${outcome.reason ? ` — ${outcome.reason}` : ""}`);
    return true;
  }

  /**
   * Risposta del client. Lancia AskError (codice HTTP) quando non è valida.
   * `action`: accept | decline | cancel.
   */
  function respond(id, payload = {}) {
    const req = pending.get(String(id ?? ""));
    if (!req) {
      if (resolved.has(String(id ?? ""))) {
        throw new AskError(409, `la domanda ${id} è già stata risolta (${resolved.get(String(id)).status}).`);
      }
      throw new AskError(404, `nessuna domanda in attesa con id ${id}.`);
    }
    const action = String(payload.action ?? "accept").toLowerCase();
    if (action === "cancel") {
      settle(req.id, "cancelled", null, { reason: sanitizeText(payload.reason ?? "chiusa dall'utente", 120) });
      return { ok: true, id: req.id, status: "cancelled" };
    }
    if (action === "decline") {
      settle(req.id, "declined", null, { reason: "rifiuto esplicito dell'utente" });
      return { ok: true, id: req.id, status: "declined" };
    }
    if (action !== "accept") {
      throw new AskError(400, `azione non valida: «${action}» (usa accept, decline o cancel).`);
    }
    const answers = validateAnswers(req.questions, payload.answers);
    if (answers.every((a) => a.skipped)) {
      settle(req.id, "declined", null, { reason: "nessuna risposta selezionata" });
      return { ok: true, id: req.id, status: "declined" };
    }
    settle(req.id, "answered", answers, { reason: "risposta dell'utente" });
    return { ok: true, id: req.id, status: "answered" };
  }

  /** Annulla tutte le pendenti (abort del turno, nuovo turno, chiusura del servizio). */
  function cancelAll(reason = "annullata") {
    let n = 0;
    for (const id of [...pending.keys()]) if (settle(id, "cancelled", null, { reason })) n++;
    return n;
  }

  /**
   * Stato per il client.
   *
   * `withResolved` è legato a `withMessages` lato dashboard: gli esiti servono alla ricostruzione
   * iniziale (apertura pagina, prima connessione SSE). Nei broadcast frequenti basta sapere se c'è
   * una domanda in attesa: portarsi dietro fino a 30 esiti a ogni evento di stato è lo stesso
   * errore che è già costato 1,3 MB per evento con la conversazione completa.
   */
  function snapshot({ withResolved = false } = {}) {
    return {
      pending: [...pending.values()].map(publicRequest),
      waitingFor: pending.size > 0,
      watchers: hasClients(),
      ...(withResolved
        ? {
            resolved: [...resolved.values()].map((r) => ({
              id: r.id,
              status: r.status,
              answers: r.answers
                ? r.answers.map((a) => ({ id: a.id, header: a.header, selected: a.selected, other: a.other, skipped: a.skipped }))
                : null,
              reason: r.reason,
              ms: r.ms,
            })),
            limits: {
              maxQuestions: limits.maxQuestions,
              maxOptions: limits.maxOptions,
              defaultTimeoutSeconds: Math.round(limits.defaultTimeoutMs / 1000),
              minTimeoutSeconds: Math.round(limits.minTimeoutMs / 1000),
              maxTimeoutSeconds: Math.round(limits.maxTimeoutMs / 1000),
            },
          }
        : {}),
    };
  }

  function dispose() {
    disposed = true;
    cancelAll("servizio in chiusura");
  }

  return { ask, respond, cancelAll, snapshot, dispose, markOrphansExpired, pending, resolved, publicRequest };
}
