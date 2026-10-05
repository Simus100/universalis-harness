/**
 * Universalis Harness — chat con streaming + file manager.
 *
 * Uso:
 *   node dashboard.mjs --model deepseek-flash --think high --port 8420 --root /root
 *
 * Poi apri http://localhost:8420 nel browser.
 *
 * Chat: streaming testo + thinking + tool.
 * Files: sfoglia, apri, modifica, salva, crea, rinomina, cancella, carica, scarica.
 *        Tutto confinato nella root (default $DASH_ROOT o cwd).
 */

import http from "node:http";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, createReadStream, existsSync, readdirSync, statSync, watch as watchFs } from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, basename, extname, sep } from "node:path";
import { argv, cwd } from "node:process";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  COMMANDS,
  COMMAND_GROUPS,
  findCommand,
  parseCommandLine,
  searchCommands,
} from "./media/commands.mjs";
import { createBrowserExtension } from "./media/browser-tool.mjs";
import { createBrowserLive } from "./media/browser-live.mjs";
import { extractZip, safeEntryPath } from "./media/unzip.mjs";
import { zipDirectory } from "./media/zip-write.mjs";
import { AskError, createAskBroker, normalizeQuestions, sanitizeText } from "./media/ask-broker.mjs";
import { createAskExtension } from "./media/ask-tool.mjs";
import { createDecisionMExtension, normalizeQuestions as normalizeDecisionMQuestions } from "./media/decision-m-tool.mjs";
import { createMemoriaExtension } from "./media/memoria/memoria-tool.mjs";
import { datiVista as memoriaVista, graphQuery as memoriaGraphQuery, schedaNodo as memoriaScheda } from "./media/memoria/memoria-graph.mjs";
import { leggiWiki as memoriaWiki, linkRotti as memoriaLinkRotti } from "./media/memoria/memoria-wiki.mjs";
import { ricostruisci as memoriaRicostruisci } from "./media/memoria/memoria-build.mjs";
import { pacchetto as memoriaPacchetto, statoMemoria as memoriaStato } from "./media/memoria/memoria-index.mjs";
import { createDecisionMService } from "./media/decision-m-service.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- fuso orario ---------------------------------------------------------
// Le pianificazioni (cron) e gli orari mostrati dalla dashboard sono in ORA
// ITALIANA. Se il server non ha un fuso configurato lo fissiamo qui, così il
// comportamento non dipende dall'host (su Linux Node rilegge process.env.TZ).
// Override: DASH_TZ, altrimenti TZ, altrimenti Europe/Rome.
const TZ_NAME = process.env.DASH_TZ || process.env.TZ || "Europe/Rome";
process.env.TZ = TZ_NAME;

function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

const wantModel = arg("model", "deepseek-flash");
const startThinking = arg("think", "high");
const PORT = Number(arg("port", "8420"));
const HOST = arg("host", process.env.DASH_HOST || "0.0.0.0");

// ---- autenticazione -----------------------------------------------------
// Password da --password o $DASH_PASSWORD; se assente, ne genera una casuale.
//
// Si accede in due modi, accettati sulle stesse rotte:
//   1. HTTP Basic (script, curl, client API): header `Authorization: Basic …`;
//   2. cookie di sessione firmato, emesso dalla pagina di login HTML (`/login`).
// Il secondo esiste perché il riquadro nativo di Basic Auth NON è affidabile: non compare
// per le richieste fatte dal JavaScript della pagina, in un'app installata in modalità
// standalone, e il browser smette di riproporlo dopo qualche "annulla" restando poi su una
// pagina di testo "Autenticazione richiesta" senza alcun campo da compilare.
const AUTH_USER = arg("user", process.env.DASH_USER || "pi");
const AUTH_PASS =
  arg("password", process.env.DASH_PASSWORD || "") || randomBytes(12).toString("base64url");

const SESSION_COOKIE = "pi_session";
const SESSION_TTL_MS = Math.max(60_000, Number(process.env.DASH_SESSION_TTL_MS) || 30 * 24 * 60 * 60 * 1000);
const SESSION_SECRET_FILE = process.env.DASH_SESSION_SECRET_FILE || join(__dirname, ".session-secret");

/** Segreto di firma dei cookie: persistente (0600), altrimenti i login cadrebbero a ogni
 *  riavvio del servizio. Se il file non è scrivibile si ripiega su un segreto di processo. */
function loadSessionSecret() {
  try {
    const existing = readFileSync(SESSION_SECRET_FILE, "utf8").trim();
    if (existing.length >= 32) return existing;
  } catch {
    /* non esiste ancora: si crea sotto */
  }
  const fresh = randomBytes(32).toString("base64url");
  try {
    writeFileSync(SESSION_SECRET_FILE, `${fresh}\n`, { mode: 0o600 });
  } catch (e) {
    console.warn(`[dashboard] sessione: ${SESSION_SECRET_FILE} non scrivibile (${e.message}); il segreto vale solo per questo processo`);
  }
  return fresh;
}
const SESSION_SECRET = loadSessionSecret();

/** Confronto a tempo costante fra due stringhe. */
function safeEq(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const signSession = (payload) => createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");

/** Token di sessione: `payload.firma`, payload = { u, iat, exp }. */
function issueSession() {
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({ u: AUTH_USER, iat: now, exp: now + SESSION_TTL_MS })).toString("base64url");
  return `${payload}.${signSession(payload)}`;
}

/** Sessione valida se firma integra, non scaduta e per l'utente giusto. */
function readSession(req) {
  const raw = String(req.headers.cookie || "");
  const hit = raw
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`));
  if (!hit) return null;
  let value;
  try {
    value = decodeURIComponent(hit.slice(SESSION_COOKIE.length + 1));
  } catch {
    return null;
  }
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = value.slice(0, dot);
  if (!safeEq(signSession(payload), value.slice(dot + 1))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.exp || data.exp < Date.now() || !safeEq(data.u, AUTH_USER)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Esito del controllo di accesso.
 *
 * `present: true` = la richiesta porta un **tentativo** vero (header `Authorization`): solo
 * questi alimentano l'anti brute-force. Le richieste senza credenziali non sono tentativi, e
 * contarle era il difetto che bloccava l'utente legittimo: una sola apertura della pagina
 * (documento + asset PWA + una fetch) generava otto 401, cioè il blocco pieno, pur non
 * avendo compilato nessun campo.
 */
function checkAuth(req) {
  const header = req.headers["authorization"] || "";
  if (header) {
    if (!header.startsWith("Basic ")) return { present: true, valid: false, why: "schema" };
    let decoded;
    try {
      decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    } catch {
      return { present: true, valid: false, why: "base64" };
    }
    const idx = decoded.indexOf(":");
    if (idx < 0) return { present: true, valid: false, why: "malformato" };
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    const ok = safeEq(`${user}\u0000${pass}`, `${AUTH_USER}\u0000${AUTH_PASS}`);
    return { present: true, valid: ok, why: "basic" };
  }
  if (readSession(req)) return { present: false, valid: true, why: "cookie" };
  return { present: false, valid: false, why: "assente" };
}

const isAuthorized = (req) => checkAuth(req).valid;

/** Rotta API/stream: la risposta d'errore dev'essere JSON, mai una pagina HTML. */
const isApiPath = (pathname) => pathname.startsWith("/api/") || pathname === "/events";

/** Navigazione del browser (accetta HTML)? Solo in quel caso ha senso rimandare al form. */
function wantsHtml(req) {
  const m = String(req.method || "GET").toUpperCase();
  if (m !== "GET" && m !== "HEAD") return false;
  return String(req.headers.accept || "").includes("text/html");
}

/**
 * Nessuna credenziale valida.
 * - navigazione HTML → redirect alla pagina di login (il form c'è sempre);
 * - API/altro → 401 con corpo JSON.
 *
 * NIENTE header `WWW-Authenticate`: da quando esiste la pagina di login non serve più a nessuno
 * (gli script mandano l'header in modo proattivo, il browser viene rimandato al form) e sulle
 * richieste fatte dal JavaScript della pagina il challenge è dannoso: il browser le mette in
 * attesa dell'autenticazione interattiva e in headless la risposta non arriva mai — la UI
 * resta appesa come se il server fosse morto (verificato con una XHR: timeout, mentre curl
 * sulla stessa richiesta risponde in 2 ms).
 */
function unauthorized(req, res, url) {
  if (wantsHtml(req) && !isApiPath(url.pathname)) {
    const next = `${url.pathname}${url.search}`;
    const to = next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
    res.writeHead(302, { Location: to, "Cache-Control": "no-store" });
    res.end();
    return;
  }
  if (isApiPath(url.pathname)) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "autenticazione richiesta", login: "/login" }));
    return;
  }
  res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end("Autenticazione richiesta: apri /login");
}

// ---- anti brute-force (progressivo) --------------------------------------
// Si contano SOLO i tentativi con credenziali presentate e sbagliate. Superata la soglia
// l'IP attende il gradino corrente della scala e poi la scala SALE (15s → 30s → 1m → 2m →
// 5m → 10m → 15m di tetto): la penalità è proporzionata al numero di blocchi già subiti,
// non fissa a 15 minuti dal primo errore. Un accesso riuscito azzera tutto; il gradino si
// dimentica anche dopo AUTH_FORGET_MS di quiete.
const AUTH_MAX_FAILS = Math.max(1, Number(process.env.DASH_AUTH_MAX_FAILS) || 8);
const AUTH_WINDOW_MS = Math.max(1000, Number(process.env.DASH_AUTH_WINDOW_MS) || 5 * 60 * 1000);
const AUTH_BLOCK_MS = Math.max(1000, Number(process.env.DASH_AUTH_BLOCK_MS) || 15 * 60 * 1000); // tetto
const AUTH_FORGET_MS = Math.max(60_000, Number(process.env.DASH_AUTH_FORGET_MS) || 30 * 60 * 1000);

/** Scala delle attese in secondi: `DASH_AUTH_BACKOFF="15,30,60"`, altrimenti ricavata dal tetto. */
function parseBackoff() {
  const custom = String(process.env.DASH_AUTH_BACKOFF || "")
    .split(",")
    .map((s) => Math.round(Number(String(s).trim())))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (custom.length) return [...new Set(custom)].sort((a, b) => a - b);
  const cap = Math.round(AUTH_BLOCK_MS / 1000);
  return [...new Set([15, 30, 60, 120, 300, 600, cap].filter((s) => s <= cap))];
}
const AUTH_BACKOFF = parseBackoff();

const authFails = new Map(); // ip -> { count, first, lastFail, level, blockedUntil }
let authBlockedTotal = 0;

/** Attesa del gradino `level` (l'ultimo gradino resta valido per sempre). */
const backoffFor = (level) => AUTH_BACKOFF[Math.min(Math.max(0, level), AUTH_BACKOFF.length - 1)] * 1000;

/** Normalizza un IP: toglie porta, parentesi IPv6 e prefisso ::ffff:. */
function normalizeIp(value) {
  let s = String(value || "").trim();
  if (!s) return "";
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end > 0) s = s.slice(1, end);
  }
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(s);
  if (withPort) s = withPort[1];
  if (s.startsWith("::ffff:")) s = s.slice(7);
  return s;
}

/** Indirizzo del peer immediato: l'unico dato che il client non può falsificare. */
function peerIp(req) {
  return normalizeIp(req.socket?.remoteAddress || "");
}

// Caddy ci parla da loopback: solo in quel caso l'header può essere creduto.
const TRUSTED_PROXIES = new Set(["127.0.0.1", "::1"]);

/**
 * Chiave dell'anti brute-force.
 * X-Forwarded-For è controllabile dal client: se il peer non è il proxy locale
 * lo ignoriamo del tutto. Se lo è, usiamo l'ULTIMO hop — quello aggiunto da Caddy —
 * perché i valori precedenti sono quelli che il client può inventare.
 */
function clientIp(req) {
  const peer = peerIp(req);
  if (!TRUSTED_PROXIES.has(peer)) return peer || "unknown";
  const hops = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map(normalizeIp)
    .filter(Boolean);
  return hops.length ? hops[hops.length - 1] : peer || "unknown";
}

/** Millisecondi di blocco residui per questo IP (0 = non bloccato).
 *  Il GRADINO di escalation non si perde quando il blocco scade: la prossima volta l'attesa
 *  è più lunga. Si azzera solo con un accesso riuscito o dopo AUTH_FORGET_MS di quiete. */
function authBlockMsLeft(req) {
  const ip = clientIp(req);
  const st = authFails.get(ip);
  if (!st || !st.blockedUntil) return 0;
  if (st.blockedUntil <= Date.now()) {
    st.blockedUntil = 0;
    st.count = 0;
    st.first = Date.now();
    return 0;
  }
  return st.blockedUntil - Date.now();
}

/** Registra un tentativo fallito con credenziali; ritorna i ms di blocco appena inflitti. */
function noteAuthFail(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let st = authFails.get(ip);
  if (!st) st = { count: 0, first: now, lastFail: now, level: 0, blockedUntil: 0 };
  if (now - st.first > AUTH_WINDOW_MS) {
    st.count = 0;
    st.first = now;
  }
  st.count += 1;
  st.lastFail = now;
  let blockedMs = 0;
  if (st.count >= AUTH_MAX_FAILS) {
    blockedMs = backoffFor(st.level);
    st.blockedUntil = now + blockedMs;
    st.count = 0;
    st.first = now;
    st.level = Math.min(st.level + 1, AUTH_BACKOFF.length - 1);
    authBlockedTotal += 1;
    console.warn(
      `[dashboard] auth: ${ip} bloccato ${Math.round(blockedMs / 1000)}s dopo ${AUTH_MAX_FAILS} tentativi falliti ` +
        `(gradino ${st.level}/${AUTH_BACKOFF.length}; il prossimo sarà ${Math.round(backoffFor(st.level) / 1000)}s)`,
    );
  }
  authFails.set(ip, st);
  return blockedMs;
}

function clearAuthFails(req) {
  const ip = clientIp(req);
  if (authFails.has(ip)) authFails.delete(ip);
}

/** Millisecondi di blocco residui per un IP qualsiasi (usato dalla pagina di login). */
function blockMsForIp(ip) {
  const st = authFails.get(ip);
  const left = st?.blockedUntil ? st.blockedUntil - Date.now() : 0;
  return left > 0 ? left : 0;
}

/** Prossima attesa che scatterebbe per questo IP (informativa, per il form). */
function nextBackoffSecForIp(ip) {
  const st = authFails.get(ip);
  return Math.round(backoffFor(st?.level ?? 0) / 1000);
}

/**
 * 429: troppi tentativi falliti.
 * - API → JSON con `retryAfter` (i client non devono rompersi);
 * - navigazione/pagina di login → pagina leggibile con il conto alla rovescia, che si ricarica
 *   da sola quando il blocco finisce. Prima era una riga di testo senza `WWW-Authenticate`,
 *   quindi il browser non poteva in alcun modo mostrare i campi di accesso.
 */
function tooManyRequests(req, res, msLeft, url = { pathname: "/" }, extra = {}) {
  const secs = Math.max(1, Math.ceil(msLeft / 1000));
  const head = { "Retry-After": String(secs), "Cache-Control": "no-store" };
  if (isApiPath(url.pathname)) {
    res.writeHead(429, { ...head, "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: `troppi tentativi falliti: riprova tra ${secs}s`, retryAfter: secs, login: "/login" }));
    return;
  }
  const ip = clientIp(req);
  res.writeHead(429, { ...head, "Content-Type": "text/html; charset=utf-8" });
  res.end(
    loginPageHtml({
      blockedSec: secs,
      next: extra.next,
      note: `Accesso temporaneamente sospeso: ${AUTH_MAX_FAILS} tentativi falliti da questo indirizzo. ` +
        `La prossima attesa sarà di ${nextBackoffSecForIp(ip)}s.`,
    }),
  );
}

// pulizia periodica: blocchi scaduti e gradini dimenticati dopo la quiete
const authJanitor = setInterval(() => {
  const now = Date.now();
  for (const [ip, st] of authFails) {
    if (st.blockedUntil && st.blockedUntil > now) continue;
    if (now - (st.lastFail || st.first) > AUTH_FORGET_MS) authFails.delete(ip);
    else if (st.blockedUntil) {
      st.blockedUntil = 0;
      st.count = 0;
    }
  }
}, 60_000);

// ---- pagina di accesso ---------------------------------------------------
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Destinazione del redirect post-login: solo percorsi interni (niente open redirect). */
function safeNext(value) {
  const s = String(value || "");
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/login") ? s : "/";
}

function loginPageHtml({ error = "", blockedSec = 0, next = "/", note = "" } = {}) {
  const dest = safeNext(next);
  const msg = error
    ? `<p class="err">${escapeHtml(error)}</p>`
    : note
      ? `<p class="warn">${escapeHtml(note)}</p>`
      : "";
  const form = `
  <form method="post" action="/login" autocomplete="on"${blockedSec > 0 ? " data-blocked=\"1\"" : ""}>
    <input type="hidden" name="next" value="${escapeHtml(dest)}" />
    <label for="u">Utente</label>
    <input id="u" name="user" autocomplete="username" autocapitalize="off" spellcheck="false" ${blockedSec > 0 ? "disabled" : "autofocus required"} />
    <label for="p">Password</label>
    <input id="p" name="password" type="password" autocomplete="current-password" ${blockedSec > 0 ? "disabled" : "required"} />
    <button type="submit"${blockedSec > 0 ? " disabled" : ""}>Accedi</button>
  </form>`;
  const wait =
    blockedSec > 0
      ? `<p class="wait">Potrai riprovare tra <strong id="cd">${Math.floor(blockedSec / 60)}:${String(blockedSec % 60).padStart(2, "0")}</strong></p>
  <script>(function(){var left=${blockedSec};var el=document.getElementById("cd");
  function tick(){if(left<=0){var u=new URL(location.href);u.searchParams.delete("retry");location.replace(u.toString());return;}
  el.textContent=Math.floor(left/60)+":"+String(left%60).padStart(2,"0");left-=1;}
  tick();setInterval(tick,1000);})();<\/script>`
      : "";
  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<title>Accedi · Universalis Harness</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #000;
         color: #e6edf7; font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; }
  main { width: 100%; max-width: 360px; }
  h1 { margin: 0 0 4px; font-size: 19px; letter-spacing: .2px; }
  .sub { margin: 0 0 22px; color: #8b9bb4; font-size: 13px; }
  form { display: grid; gap: 6px; background: #0f131a; border: 1px solid #2b3240; border-radius: 14px; padding: 18px; }
  label { color: #8b9bb4; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; margin-top: 6px; }
  input { background: #000; border: 1px solid #2b3240; border-radius: 9px; color: inherit; padding: 11px 12px; font: inherit; }
  input:focus { outline: 2px solid #2563eb; outline-offset: 1px; }
  input:disabled { opacity: .5; }
  button { margin-top: 14px; background: #2563eb; border: 0; border-radius: 9px; color: #fff; font: inherit; font-weight: 600; padding: 11px 12px; cursor: pointer; }
  button:hover { background: #1d4ed8; }
  button:disabled { background: #1d2230; color: #8b9bb4; cursor: not-allowed; }
  .err, .warn, .wait { margin: 0 0 14px; padding: 10px 12px; border-radius: 9px; font-size: 13.5px; }
  .err { background: #2a1116; border: 1px solid #7f1d1d; color: #fecaca; }
  .warn { background: #2a1f0b; border: 1px solid #78350f; color: #fde68a; }
  .wait { background: #0f131a; border: 1px solid #2b3240; color: #cbd5e1; text-align: center; margin: 0; }
  .wait strong { font-variant-numeric: tabular-nums; color: #e6edf7; }
  h1 .beta { display: inline-block; vertical-align: 2px; margin-left: 7px; padding: 1px 7px; border-radius: 999px;
             background: #10233f; border: 1px solid #2563eb; color: #93c5fd; font-size: 10.5px; font-weight: 700;
             letter-spacing: 1.1px; text-transform: uppercase; }
  .copy { margin: 20px 0 0; text-align: center; color: #64748b; font-size: 12px; line-height: 1.6; }
  .copy strong { color: #8b9bb4; font-weight: 600; }
</style>
</head><body><main>
  <h1>Universalis Harness<span class="beta">beta</span></h1>
  <p class="sub">Accesso riservato</p>
  ${msg}${form}${wait}
  <p class="copy">© ${new Date().getFullYear()} <strong>Universalis Produzioni</strong><br />tutti i diritti riservati</p>
</main></body></html>`;
}

/** Legge il corpo di un form (x-www-form-urlencoded, `--data` di curl o JSON). */
function readForm(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "corpo troppo grande"));
        req.destroy();
        return;
      }
      data += c;
    });
    req.on("end", () => {
      const out = {};
      if (data.trim().startsWith("{")) {
        try {
          Object.assign(out, JSON.parse(data));
        } catch {
          /* form malformato: resta vuoto */
        }
        return resolve(out);
      }
      for (const [k, v] of new URLSearchParams(data)) out[k] = v;
      resolve(out);
    });
    req.on("error", reject);
  });
}

const sessionCookieHeader = (req, value, maxAgeSec) => {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (proto === "https" || req.socket.encrypted) parts.push("Secure");
  return parts.join("; ");
};

/** GET /login (form) e POST /login (verifica + cookie di sessione). Rotte pubbliche. */
async function handleLogin(req, res, url) {
  const ip = clientIp(req);
  const next = safeNext(url.searchParams.get("next") || "/");

  if (req.method === "GET" || req.method === "HEAD") {
    if (checkAuth(req).valid) {
      res.writeHead(302, { Location: next, "Cache-Control": "no-store" });
      return res.end();
    }
    const blocked = blockMsForIp(ip);
    const head = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
    if (blocked > 0) head["Retry-After"] = String(Math.max(1, Math.ceil(blocked / 1000)));
    res.writeHead(blocked > 0 ? 429 : 200, head);
    return res.end(
      loginPageHtml({
        blockedSec: blocked > 0 ? Math.max(1, Math.ceil(blocked / 1000)) : 0,
        next,
        error: url.searchParams.get("e") === "1" ? "Nome utente o password non corretti." : "",
      }),
    );
  }

  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "GET, POST", "Content-Type": "text/plain; charset=utf-8" });
    return res.end("metodo non consentito");
  }

  const blocked = blockMsForIp(ip);
  if (blocked > 0) return tooManyRequests(req, res, blocked, { pathname: "/login" }, { next });

  let form = {};
  try {
    form = await readForm(req);
  } catch (e) {
    return errorResponse(res, e);
  }
  const dest = safeNext(form.next);
  const user = String(form.user ?? form.username ?? "");
  const pass = String(form.password ?? "");
  if (safeEq(`${user}\u0000${pass}`, `${AUTH_USER}\u0000${AUTH_PASS}`)) {
    clearAuthFails(req);
    res.setHeader("Set-Cookie", sessionCookieHeader(req, issueSession(), Math.floor(SESSION_TTL_MS / 1000)));
    res.writeHead(303, { Location: dest, "Cache-Control": "no-store" });
    return res.end();
  }
  const blockedMs = noteAuthFail(req);
  if (blockedMs > 0) return tooManyRequests(req, res, blockedMs, { pathname: "/login" }, { next: dest });
  res.writeHead(401, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(loginPageHtml({ error: "Nome utente o password non corretti.", next: dest }));
}

/** GET/POST /logout: cancella il cookie di sessione. */
function handleLogout(req, res) {
  res.setHeader("Set-Cookie", sessionCookieHeader(req, "", 0));
  res.writeHead(302, { Location: "/login", "Cache-Control": "no-store" });
  res.end();
}

/** Difesa CSRF: se il browser dichiara un'origine, dev'essere la nostra. */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl, script, app native: nessun Origin dichiarato
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
if (typeof authJanitor.unref === "function") authJanitor.unref();

const ALL_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const startedAt = Date.now();

// Versione del codice caricato in QUESTO processo: cambia ad ogni aggiornamento di
// dashboard.mjs. Serve a distinguere un 404 "rotta assente" (processo vecchio non
// riavviato) da un 404 applicativo, ed è esposta da GET /api/health.
//
// ⚠️ La versione da sola NON dice se il processo in esecuzione ha il codice nuovo: il test
// `media/test-api.sh` la confrontava con sé stessa (stessa costante nel file) e passava anche
// con un processo fermo a una revisione vecchia — verificato avviando il codice di HEAD su
// un'altra porta: stessa stringa, funzioni diverse. Per questo /api/health espone anche
// `codeHash` e `codeMtime`, calcolati sul file che questo processo ha davvero caricato.
const VERSION = "dashboard-2026-09-27.1";
const SELF_PATH = fileURLToPath(import.meta.url);
const CODE_FINGERPRINT = (() => {
  try {
    const buf = readFileSync(SELF_PATH);
    return {
      codeHash: createHash("sha256").update(buf).digest("hex").slice(0, 16),
      codeBytes: buf.length,
      codeMtime: statSync(SELF_PATH).mtimeMs,
    };
  } catch {
    return { codeHash: null, codeBytes: null, codeMtime: null };
  }
})();

// ---- file manager: root e sicurezza -------------------------------------
let ROOT = resolve(arg("root", process.env.DASH_ROOT || cwd()));
try {
  ROOT = await fs.realpath(ROOT);
} catch {
  /* root non esistente: resta il path risolto */
}
const MAX_READ = 2 * 1024 * 1024; // 2 MB per la lettura nell'editor
const MAX_UPLOAD = 64 * 1024 * 1024; // 64 MB per l'upload
// Tetti per lo scarico di una CARTELLA: l'archivio si costruisce in memoria.
const MAX_ZIP_FILES = 3000;
const MAX_ZIP_BYTES = 128 * 1024 * 1024; // 128 MB non compressi
const MAX_ATTACH = 32 * 1024 * 1024; // 32 MB per allegato in chat

// cartella predefinita di TUTTI i file generati
const MEDIA_DIR = resolve(process.env.DASH_MEDIA_DIR || "/root/pi-harness/media");
await fs.mkdir(MEDIA_DIR, { recursive: true }).catch(() => {});

// cartella delle skill (standard Agent Skills: una sottocartella con SKILL.md
// per ogni skill). Claude Code e OpenAI/Codex usano lo stesso formato.
// Le skill NON stanno in media/: vivono in `<codice>/skills` (come i backup, che vanno in
// `<codice>/backups`). La cartella media/ resta solo per i file generati e per i template.
const SKILLS_DIR = resolve(process.env.DASH_SKILLS_DIR || join(__dirname, "skills"));
await fs.mkdir(SKILLS_DIR, { recursive: true }).catch(() => {});

// allegati di chat (dentro media, così il modello può leggerli)
const UPLOADS = join(MEDIA_DIR, "uploads");
await fs.mkdir(UPLOADS, { recursive: true }).catch(() => {});

function isUnder(abs, dir) {
  return abs === dir || abs.startsWith(dir + sep);
}

// cartelle "istituzionali" dell'istanza: qui l'agente può scrivere senza che il guard
// sposti il file in media/ (media resta la destinazione dei file generati, ma skills/,
// backups/ e sessions/ sono parte della struttura dell'istanza e restano dove sono).
const INSTANCE_DIRS = [
  __dirname, // codice dell'istanza, skills/, backups/, sessions/, assets/…
  SKILLS_DIR,
  resolve(process.env.DASH_BACKUP_DIR || join(__dirname, "backups")),
  MEDIA_DIR,
];

/** Vero se il percorso appartiene alla struttura dell'istanza (non va reindirizzato). */
function isInstancePath(abs) {
  return INSTANCE_DIRS.some((d) => isUnder(abs, d));
}

/** Riscrive i reindirizzamenti `> /path` / `>> /path` verso file NUOVI fuori da media. */
function redirectBashPaths(cmd) {
  if (typeof cmd !== "string" || !cmd.includes(">")) return cmd;
  return cmd.replace(/(>>?)(\s*)(["']?)(\/[^\s"'`|&;<>()]+)\3/g, (m, op, sp, q, p) => {
    try {
      if (p.startsWith("/dev/") || p.startsWith("/proc/") || p.startsWith("/tmp/") || p.startsWith("/sys/"))
        return m;
      const abs = resolve(p);
      if (!withinRoot(abs) || isInstancePath(abs)) return m;
      if (existsSync(abs)) return m; // non toccare file esistenti
      return `${op}${sp}${q}${join(MEDIA_DIR, basename(abs))}${q}`;
    } catch {
      return m;
    }
  });
}

/**
 * Estensione inline: muta gli argomenti dei tool PRIMA dell'esecuzione.
 * - `write` verso un file NUOVO fuori da media → reindirizza in media
 * - `bash` con `> /path` verso un file NUOVO fuori da media → reindirizza in media
 * Le modifiche a file esistenti restano dove sono, e così i file dentro la struttura
 * dell'istanza (cartella del codice, `skills/`, `backups/`, `sessions/`, `media/`).
 */
const MEDIA_GUARD_EXT = {
  name: "media-guard",
  factory: (pi) => {
    pi.on("tool_call", (event) => {
      try {
        const input = event?.input;
        if (!input || typeof input !== "object") return;
        if (
          event.toolName === "write" &&
          typeof input.path === "string" &&
          input.path &&
          !input.path.endsWith("/")
        ) {
          const abs = resolve(cwd(), input.path);
          if (!isInstancePath(abs) && !existsSync(abs)) {
            input.path = join(MEDIA_DIR, basename(abs) || "file");
          }
        } else if (event.toolName === "bash" && typeof input.command === "string") {
          const rewritten = redirectBashPaths(input.command);
          if (rewritten !== input.command) input.command = rewritten;
        }
      } catch {
        /* in caso di dubbio, non toccare */
      }
    });
  },
};

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".bmp": "image/bmp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json",
  ".js": "text/javascript", ".mjs": "text/javascript", ".ts": "text/typescript",
  ".py": "text/x-python", ".html": "text/html", ".css": "text/css", ".csv": "text/csv",
  ".xml": "application/xml", ".yaml": "text/yaml", ".yml": "text/yaml", ".sh": "text/x-shellscript",
  ".pdf": "application/pdf", ".zip": "application/zip", ".log": "text/plain",
};
const mimeOf = (p) => MIME[extname(p).toLowerCase()] || "application/octet-stream";
const isImageMime = (m) => m.startsWith("image/");

class HttpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function withinRoot(abs) {
  return abs === ROOT || abs.startsWith(ROOT + sep);
}

/** Risolve un path relativo alla root e blocca escape via `..` o symlink. */
async function safeResolve(rel, { allowMissing = false } = {}) {
  const abs = resolve(ROOT, rel || ".");
  if (!withinRoot(abs)) throw new HttpError(403, "percorso fuori dalla root");
  // risolve i symlink sulla porzione esistente
  let existing = abs;
  const tail = [];
  for (;;) {
    try {
      const rp = await fs.realpath(existing);
      if (!withinRoot(rp)) throw new HttpError(403, "percorso fuori dalla root (symlink)");
      return tail.length ? join(rp, ...tail.reverse()) : rp;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (err.code !== "ENOENT") throw err;
      if (!allowMissing) throw new HttpError(404, "non trovato");
      const parent = dirname(existing);
      if (parent === existing) throw new HttpError(400, "percorso non valido");
      tail.push(basename(existing));
      existing = parent;
    }
  }
}

/**
 * Risolve un percorso CITATO (nel testo dell'agente o negli argomenti di un tool) nel file
 * reale a cui si riferisce. I modelli citano gli stessi file in tre modi diversi — assoluto
 * (`/root/pi-harness/media/x.md`), relativo alla cartella di lavoro (`media/x.md`), relativo
 * alla cartella dei file generati (`x.md`) — e la dashboard ha per root `/root`, non la
 * cartella di lavoro. Qui si provano tutti i candidati, dal più letterale al più permissivo:
 * senza questo il tasto «scarica» di una citazione finiva su un percorso inesistente.
 */
async function resolveCitedPath(input) {
  const rel = String(input || "").trim();
  if (!rel || /[*?{}]/.test(rel)) return null; // glob o segnaposto: non è un file
  const candidates = [];
  const add = (abs) => {
    if (abs && withinRoot(abs) && !candidates.includes(abs)) candidates.push(abs);
  };
  if (rel.startsWith("/") || rel.startsWith("~")) {
    add(resolve(rel));
  } else {
    // ordine = come scrive l'agente: prima la cartella di lavoro (dove cita `media/x`,
    // `skills/…`), poi la cartella dei file generati (dove cita `x.md`), infine la root
    const workdir = cwd();
    if (withinRoot(workdir)) add(resolve(workdir, rel));
    add(resolve(MEDIA_DIR, rel));
    add(resolve(MEDIA_DIR, basename(rel)));
    add(resolve(ROOT, rel));
  }
  for (const abs of candidates) {
    let st;
    try {
      const rp = await fs.realpath(abs);
      if (!withinRoot(rp)) continue;
      st = await fs.stat(abs);
    } catch {
      continue;
    }
    return {
      path: relative(ROOT, abs),
      name: basename(abs),
      type: st.isDirectory() ? "dir" : "file",
      size: st.size,
      mtime: st.mtimeMs,
    };
  }
  return null;
}

async function listDir(rel) {
  const abs = await safeResolve(rel);
  const st = await fs.stat(abs);
  if (!st.isDirectory()) throw new HttpError(400, "non è una cartella");
  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const entries = [];
  for (const d of dirents) {
    let s;
    try {
      s = await fs.lstat(join(abs, d.name));
    } catch {
      continue;
    }
    entries.push({
      name: d.name,
      type: s.isDirectory() ? "dir" : s.isSymbolicLink() ? "link" : "file",
      size: s.size,
      mtime: s.mtimeMs,
      hidden: d.name.startsWith("."),
    });
  }
  entries.sort(
    (a, b) =>
      (b.type === "dir") - (a.type === "dir") ||
      a.name.localeCompare(b.name, "it", { numeric: true }),
  );
  const relPath = relative(ROOT, abs);
  return {
    root: ROOT,
    path: relPath,
    parent: relPath ? dirname(relPath) : null,
    entries,
  };
}

async function readFileSafe(rel) {
  const abs = await safeResolve(rel);
  const st = await fs.stat(abs);
  if (!st.isFile()) throw new HttpError(400, "non è un file");
  const buf = await fs.readFile(abs);
  const truncated = buf.length > MAX_READ;
  const slice = truncated ? buf.subarray(0, MAX_READ) : buf;
  const sample = slice.subarray(0, Math.min(8000, slice.length));
  const binary = sample.includes(0);
  return {
    path: relative(ROOT, abs),
    size: st.size,
    mtime: st.mtimeMs,
    truncated,
    binary,
    content: binary ? null : slice.toString("utf8"),
  };
}

async function writeFileSafe(rel, content) {
  const abs = await safeResolve(rel, { allowMissing: true });
  await fs.mkdir(dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  return { path: relative(ROOT, abs), size: Buffer.byteLength(content) };
}

// ---- runtime & sessione -------------------------------------------------
const modelRuntime = await ModelRuntime.create({ allowModelNetwork: true });

let model =
  modelRuntime.getModel("deepseek", wantModel) ??
  modelRuntime.getModel(wantModel.split("/")[0], wantModel.split("/").slice(1).join("/"));
if (!model) {
  console.error(`Modello non trovato: ${wantModel}`);
  process.exit(1);
}

// I subagent sono caricati SOLO qui (non nelle sessioni CLI globali),
// via `additionalExtensionPaths`, così non partono mai per conto loro altrove.
const SUBAGENT_EXT =
  process.env.DASH_SUBAGENT_EXT || "/root/.pi/agent/npm/node_modules/pi-subagents/index.ts";
const additionalExtensionPaths = existsSync(SUBAGENT_EXT) ? [SUBAGENT_EXT] : [];
const GOALS_FILE = process.env.DASH_GOALS_FILE || join(MEDIA_DIR, "goals.json");
const SYSTEM_MEDIA_NOTE =
  `\n\n## Domande all'utente (tool \`ask_user\`)\n` +
  `Quando una richiesta è ambigua o incompleta e l'informazione che manca CAMBIA l'esito del ` +
  `lavoro (quale bersaglio/file/servizio, quale formato, quale vincolo, un'azione non reversibile), ` +
  `NON tirare a indovinare: usa il tool \`ask_user\` per porre la domanda in chat (1-4 domande, ` +
  `2-6 opzioni concrete ciascuna, la consigliata per prima con «(consigliata)»). Prima indaga da solo ` +
  `(file, contesto, cronologia) e chiedi solo ciò che resta. Non usarlo per farti approvare il piano ` +
  `o per chiedere il permesso di procedere. Se l'utente salta la domanda, non risponde o il tempo ` +
  `scade, prosegui con il tuo miglior giudizio dichiarando l'assunzione in una riga. Mai chiedere ` +
  `credenziali con \`ask_user\`: indica un file o una variabile d'ambiente e leggila tu.\n` +
  `\n## Lingua\n` +
  `Pensa, ragiona e rispondi SEMPRE in italiano: valgono per il ragionamento interno ` +
  `(thinking), per i piani e i goal, per i riassunti e per le risposte finali. ` +
  `Non usare l'inglese per il thinking. Restano in inglese solo codice, comandi, ` +
  `nomi di file/funzioni/API e testi citati.\n\n` +
  `## Cartella dei file generati\n` +
  `Salva SEMPRE i file che generi o produci per l'utente in ${MEDIA_DIR}. ` +
  `Non crearli altrove. Puoi invece modificare file esistenti dove si trovano.\n\n` +
  `## Fine di una sessione di lavoro: pubblica il codice\n` +
  `Il repository GitHub di questo harness e' PUBBLICO (dal 2026-09-27) e NON si aggiorna da solo ` +
  `(il timer di sincronizzazione e' spento): la pubblicazione e' manuale e va fatta a FINE lavoro, ` +
  `non a meta'. Tutto cio' che viene pubblicato — compreso cio' che e' gia' nella storia — e' ` +
  `leggibile da chiunque: mai dati personali o di terzi, mai segreti. ` +
  `Quando la sessione modifica file versionati (dashboard.mjs, dashboard.html, media/*.mjs, i test, ` +
  `docs/, skills/, README.md), CHIUDILA con:\n` +
  `    bash scripts/sync-fine-lavoro.sh \"messaggio breve del lavoro\"\n` +
  `Lo script conta i file interessati, ABORTA senza pubblicare se nell'elenco compare qualcosa di ` +
  `riservato (.env, segreti, sessions/, backups/, documenti con dati personali di terzi), poi pubblica ` +
  `e verifica che locale e remoto coincidano. Non aggirarlo con --forza: se un file e' legittimo metti ` +
  `una riga in .gitignore col motivo. Non serve se la sessione non ha modificato nulla di versionato ` +
  `(domande, analisi, sola lettura).\n\n` +
  `## Goal della dashboard\n` +
  `La scheda "Goal" della dashboard salva i goal in ${GOALS_FILE}. ` +
  `Struttura: { id, title, description, status, steps:[{id,title,done}], checklist:[{id,text,done}], createdAt, updatedAt }. ` +
  `Se in chat ti viene chiesto di vedere, aggiornare o completare i goal, leggi (e se serve riscrivi) quel file, ` +
  `mettendo "done": true sui passi e sui controlli completati.` +
  `\n\n## Rappresentazioni visive (skill \`visual-representation\`)\n` +
  `Quando un disegno aiuta davvero a capire (flusso di processo, timeline, mappa concettuale, ` +
  `schema illustrato, piantina, figura geometrica), disegnalo in SVG dentro un blocco Markdown ` +
  `con linguaggio \`svg\`: documento COMPLETO (elemento radice <svg>, namespace ` +
  `xmlns="http://www.w3.org/2000/svg", attributo viewBox, <title> e <desc>), autonomo, senza ` +
  `script né risorse esterne. La dashboard riconosce il blocco e mostra il DISEGNO come anteprima ` +
  `nel punto esatto del messaggio, con vista ingrandita, copia e download. Il codice viene ` +
  `sanitizzato come contenuto non attendibile: \`style\`/\`<style>\`, \`<foreignObject>\`, ` +
  `\`<image>\`, \`<use>\`, \`<marker>\`, filtri, animazioni, \`href\` e riferimenti di rete ` +
  `vengono rifiutati o rimossi (le punte delle frecce si disegnano con un \`<polygon>\`). ` +
  `Contratto completo, paletta, limiti e tre esempi pronti stanno nella skill ` +
  `\`visual-representation\`: leggila prima di disegnare. Per tutto il resto basta una breve ` +
  `spiegazione testuale: non aggiungere immagini decorative e non inventare dati, proporzioni ` +
  `o relazioni (se lo schema non è in scala, dichiaralo). \`ascii\` a parte, i blocchi di codice ` +
  `di altro linguaggio restano invariati.` +
  `\n\n## Decisore tipizzato locale (feature «Decision_M», skill \`rizzo-flow\`)\n` +
  `L'harness può accendere un decisore locale Decision_M (motore: Rizzo Flow) che risponde a domande tipizzate ` +
  `(sì/no, scelta, punteggio) con **probabilità**, senza generare un solo token: serve per i ` +
  `giudizi ripetibili — instradare, scegliere fra azioni, dare un punteggio su una rubrica — ` +
  `non per spiegare o scrivere. Si accende dal menu «features» della dashboard (interruttore ` +
  `\`rizzo\`) e occupa ~5,7 GB di RAM e la CPU per ~12 s a richiesta su uno stato breve: per ` +
  `questo non è sempre accesa.\n` +
  `Quando è accesa hai i tool \`decision_m\` (la decisione) e \`decision_m_service\` (accendi, ` +
  `spegni, ispeziona): leggi la skill \`rizzo-flow\` prima di usarli. Quando è spenta i due ` +
  `tool NON sono nella tua lista, e non è un guasto: la risorsa la accende l'utente. Se una ` +
  `decisione tipizzata servirebbe davvero, proponi l'attivazione con \`ask_user\` (una riga ` +
  `sul costo in RAM) e, se rifiuta, procedi con il tuo giudizio dichiarando che è stato senza ` +
  `il modello locale.`;

// Tool browser (estensione inline definita in media/browser-tool.mjs).
// Invoca SEMPRE agent-browser come utente dedicato: come root la CLI partirebbe
// senza errori ma SENZA sandbox (fallimento silenzioso).
// Modalità di controllo del browser: "agent" (normale) o "human" (l'utente ha preso
// il controllo dalla live view). In modalità human il tool rifiuta di agire, così
// agente e persona non litigano sullo stesso browser.
let browserControlMode = "agent";

// ---- domande interattive all'utente (`ask_user`) -------------------------
// Il broker tiene le domande pendenti e le risolve da `/api/ask/respond`; il tool resta in
// attesa dentro la chiamata, quindi il turno riprende da solo quando l'utente risponde.
//
// `DASH_ASK=off` toglie il tool dalla lista inviata al modello: serve agli usi NON presidiati
// (test automatici, istanze di servizio) dove nessuno può rispondere e un'attesa di 15 minuti
// sarebbe solo tempo perso. Nella dashboard resta acceso: è la funzione per cui esiste.
const ASK_ENABLED = String(process.env.DASH_ASK ?? "on").trim().toLowerCase() !== "off";
const ASK_LOG_FILE = process.env.DASH_ASK_LOG_FILE || join(MEDIA_DIR, "ask-log.jsonl");
const askBroker = createAskBroker({
  broadcast: (event, data) => broadcast(event, data),
  logFile: ASK_LOG_FILE,
  hasClients: () => clients.size,
  sessionId: () => session?.sessionId ?? null,
  log: (m) => console.log(m),
});

const ASK_EXT = ASK_ENABLED ? createAskExtension({ broker: askBroker, log: (m) => console.log(m) }) : null;
if (!ASK_ENABLED) console.log("[ask] tool «ask_user» NON registrato (DASH_ASK=off)");

// ---- Decision_M: decisore tipizzato locale, acceso a richiesta ------------
// Decision_M risponde a domande tipizzate (motore: Rizzo Flow, progetto a monte) (`boolean`/`choice`/`score`) con probabilità,
// senza generare un token: un giudizio ripetibile invece di una frase. Il modello gira su
// CPU, quindi il costo non è il denaro ma la RISORSA: ~5,7 GB di RAM residenti e ~12 s per
// richiesta su uno stato breve (misurato su questa VPS). Per questo è una FEATURE con un
// interruttore: acceso il processo parte, il modello carica e i due tool entrano nella
// lista inviata al modello; spento il processo muore e la RAM torna libera. La preferenza
// vive su disco (media/decision-m-prefs.json), quindi sopravvive al riavvio della dashboard.
const decisionMService = createDecisionMService({
  mediaDir: MEDIA_DIR,
  log: (m) => console.log(m),
  onChange: () => decisionMChanged(),
});
const DECISION_M_AVAILABLE = decisionMService.available;
const DECISION_M_TOOL_NAMES = new Set(["decision_m", "decision_m_service"]);
// L'estensione si registra SEMPRE (quando la feature è attivabile): è il gate dei tool,
// non l'ambiente, a decidere se il modello li vede.
const DECISION_M_EXT = DECISION_M_AVAILABLE
  ? createDecisionMExtension({ service: decisionMService, log: (m) => console.log(m) })
  : null;
if (!DECISION_M_AVAILABLE) console.log("[Decision_M] feature disattivata all'avvio (DASH_DECISION_M=off)");

/** Vero se i tool di Decision_M vanno nella lista inviata al modello (feature accesa). */
function decisionMToolEnabled() {
  return DECISION_M_AVAILABLE && !!decisionMService.prefs.enabled;
}

/**
 * Lo stato del servizio è cambiato (avvio, pronto, arresto, errore): si riallinea il gate
 * dei tool e si aggiorna la UI. Dichiarata come function perché il servizio può chiamarla
 * mentre il modulo si sta ancora caricando; la guardia su `session` copre la fase di avvio.
 */
function decisionMChanged() {
  try {
    if (!session) return;
    applyToolGate();
    broadcast("state", getState());
  } catch (err) {
    console.error("[Decision_M] aggiornamento di stato non riuscito:", err?.message ?? err);
  }
}

/** Ultima firma dello stato vista dal ciclo: evita broadcast inutili ogni pochi secondi. */
let decisionMSignature = "";
/**
 * Il caricamento del modello dura decine di secondi e la RAM cambia mentre è acceso: senza
 * questo ciclo la UI mostrerebbe "in avvio" per sempre e una RAM vecchia. Un solo punto di
 * verità (`status()`), un broadcast solo quando qualcosa cambia davvero.
 */
async function refreshDecisionMStatus() {
  if (!DECISION_M_AVAILABLE) return;
  try {
    const s = await decisionMService.status();
    const sig = JSON.stringify([
      s.enabled,
      s.process.running,
      s.process.ready,
      s.process.starting,
      s.process.rssMb,
      s.error,
    ]);
    if (sig !== decisionMSignature) {
      decisionMSignature = sig;
      decisionMChanged();
    }
  } catch (err) {
    // Il guasto del servizio non deve mai far cadere la dashboard: si registra e basta.
    console.error("[Decision_M] stato non leggibile:", err?.message ?? err);
  }
}

/**
 * Stato per l'API: lo snapshot del servizio PIÙ la prova che il gate ha agito (`toolsActive`).
 * `enabled` dice la preferenza, `toolsActive` dice cosa il modello vede davvero adesso: sono
 * due cose diverse durante l'avvio e dopo un errore, ed è utile vederle entrambe.
 */
async function decisionMApiState() {
  if (!DECISION_M_AVAILABLE) return { available: false, enabled: false, toolsActive: false };
  const stato = await decisionMService.status();
  const attivi = session?.getActiveToolNames?.() || [];
  stato.toolsActive = attivi.some((n) => DECISION_M_TOOL_NAMES.has(n));
  return stato;
}

// ---- interruttore delle domande (come subagent/browser) ------------------
// La scelta sta su disco, così non si perde a ogni riavvio: se spegni le domande restano spente
// finché non le riaccendi. Togliere il tool lo fa sparire dalla lista inviata al modello
// (risparmia contesto) e rende impossibile una domanda che nessuno risponderebbe.
const ASK_PREFS_FILE = process.env.DASH_ASK_PREFS_FILE || join(MEDIA_DIR, "ask-prefs.json");
let askToolOn = true;
try {
  const pref = JSON.parse(readFileSync(ASK_PREFS_FILE, "utf8"));
  if (typeof pref?.enabled === "boolean") askToolOn = pref.enabled;
} catch {
  /* nessuna preferenza salvata: default acceso */
}
function saveAskPrefs() {
  try {
    writeFileSync(ASK_PREFS_FILE, JSON.stringify({ enabled: askToolOn }, null, 2));
  } catch (err) {
    console.error("[ask] preferenza non salvata:", err?.message ?? err);
  }
}
// Il file esiste da subito, anche col default: lo stato dell'interruttore è ispezionabile
// da disco senza doverlo prima cambiare dalla dashboard.
if (!existsSync(ASK_PREFS_FILE)) saveAskPrefs();
/** Vero se il tool è davvero disponibile per il modello (env + interruttore). */
function askToolEnabled() {
  return ASK_ENABLED && askToolOn;
}

// Dopo un riavvio le domande rimaste senza esito (la promessa del tool è morta col processo)
// vengono marcate come scadute nel log: nessuna card resta "in attesa" per sempre.
askBroker.markOrphansExpired();

const BROWSER_EXT = createBrowserExtension({
  mediaDir: MEDIA_DIR,
  isHumanControlled: () => browserControlMode === "human",
  onActivity: () => {
    browserLastActivity = Date.now();
  },
});

// Memoria a lungo termine: i quattro tool dell'agente (memoria_cerca, memoria_grafo,
// memoria_wiki, memoria_episodio) e i due hook che la fanno nascere da sé — fine turno di
// lavoro e compattazione del contesto. Il motore è in media/memoria/ (Node, zero dipendenze).
const MEMORIA_EXT = createMemoriaExtension({ log: (m) => console.log(m) });

// Frame rate della live view: contenuto di base per non saturare la banda, più alto quando
// guida l'utente (un click deve vedere subito l'effetto). Il tetto è per-client.
const BROWSER_FPS_BASE = Number(process.env.DASH_BROWSER_STREAM_FPS) || 3;
const BROWSER_FPS_HUMAN = Number(process.env.DASH_BROWSER_STREAM_FPS_HUMAN) || 10;

// Ponte verso lo stream di agent-browser: la live view passa da qui, quindi eredita
// l'autenticazione della dashboard e non richiede porte nuove né modifiche a Caddy.
// ---- progetto: cartelle scelte dall'utente -------------------------------
// Sta QUI, prima della creazione del resourceLoader: `systemPromptOverride` (più sotto) chiama
// `progettoPromptNote()`, e in JavaScript una `let` dichiarata dopo non è ancora accessibile
// quando quella callback viene eseguita (ReferenceError: Cannot access 'progetto' before
// initialization). Lo stesso blocco, se spostato dopo, rompe l'avvio del servizio.
// L'utente marca alcune cartelle (dalla vista File con ☆, o dalla vista Progetto) e quelle
// diventano «il progetto»: si vedono nella vista 📦 e l'agente le riceve nel contesto, così
// quando gli si dice «lavora sul progetto» sa di quali cartelle si parla e cosa contengono.
// Percorsi RELATIVI alla root della dashboard (gli stessi del file manager), una cartella
// attiva alla volta. Lo stato sta in media/, quindi sopravvive ai riavvii.
const PROGETTO_FILE = process.env.DASH_PROGETTO_FILE || join(MEDIA_DIR, "progetto.json");
const PROGETTO_MAX_CARTELLE = 12;
/** Quanti nomi di file entrano nel contesto per cartella (e quanti se ne elencano nella vista). */
const PROGETTO_FILE_PROMPT = 8;
const PROGETTO_FILE_VISTA = 60;
let progetto = { cartelle: [], attiva: "" };

async function loadProgetto() {
  try {
    const parsed = JSON.parse(await fs.readFile(PROGETTO_FILE, "utf8"));
    const cartelle = Array.isArray(parsed?.cartelle)
      ? parsed.cartelle
          .map((c) => ({ path: String(c?.path || "").replace(/^[./]+/, "").replace(/\/+$/, ""), label: String(c?.label || "").slice(0, 80) }))
          .filter((c) => c.path)
          .slice(0, PROGETTO_MAX_CARTELLE)
      : [];
    progetto = { cartelle, attiva: String(parsed?.attiva || cartelle[0]?.path || "") };
    if (!cartelle.some((c) => c.path === progetto.attiva)) progetto.attiva = cartelle[0]?.path || "";
  } catch {
    progetto = { cartelle: [], attiva: "" };
  }
}

async function saveProgetto() {
  const tmp = PROGETTO_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(progetto, null, 2), "utf8");
  await fs.rename(tmp, PROGETTO_FILE);
}

/** Contenuto di una cartella del progetto: file diretti (niente ricorsione: il progetto può
 *  essere grande e al contesto servono i nomi di primo livello). Segue i symlink se restano
 *  dentro la root. */
async function schedaCartella(rel, { maxFile = PROGETTO_FILE_VISTA } = {}) {
  try {
    const abs = await safeResolve(rel);
    const st = await fs.stat(abs);
    if (!st.isDirectory()) return { path: rel, esiste: false, motivo: "non è una cartella" };
    const dirents = await fs.readdir(abs, { withFileTypes: true });
    const file = [];
    let totale = 0;
    let cartelle = 0;
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue;
      let s;
      try {
        s = await fs.lstat(join(abs, d.name));
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        cartelle++;
        continue;
      }
      file.push({ name: d.name, size: s.size, mtime: s.mtimeMs });
      totale += s.size;
    }
    file.sort((a, b) => b.mtime - a.mtime);
    return {
      path: rel,
      esiste: true,
      file: file.length,
      cartelle,
      dimensione: totale,
      ultimaModifica: st.mtimeMs,
      elenco: file.slice(0, maxFile),
      troncato: Math.max(0, file.length - maxFile),
    };
  } catch (e) {
    return { path: rel, esiste: false, motivo: e?.message || String(e) };
  }
}

/** Payload per la dashboard: cartelle con la loro scheda e quale è attiva. */
async function progettoPayload() {
  const cartelle = [];
  for (const c of progetto.cartelle) {
    cartelle.push({ ...c, attiva: c.path === progetto.attiva, ...(await schedaCartella(c.path)) });
  }
  return { cartelle, attiva: progetto.attiva, root: ROOT, media: MEDIA_DIR };
}

/**
 * Blocco di contesto per l'agente. Si calcola a ogni ricostruzione del system prompt (che
 * avviene al reload delle risorse, quindi anche quando l'utente cambia il progetto: vedi
 * `ricaricaContestoProgetto`), e legge i nomi dei file direttamente da disco.
 */
function progettoPromptNote() {
  if (!progetto.cartelle.length) return "";
  const righe = [];
  for (const c of progetto.cartelle) {
    let file = [];
    try {
      // `readdirSync` arriva da node:fs (import in testa); `fs` qui è node:fs/promises e non ha
      // la variante sincrona: usando `fs.readdirSync` la lettura lanciava sempre, e il contesto
      // diceva all'agente «cartella non leggibile» (difetto visto con una richiesta vera).
      const nomi = readdirSync(resolve(ROOT, c.path), { withFileTypes: true })
        .filter((d) => !d.name.startsWith("."))
        .map((d) => ({ name: d.name, dir: d.isDirectory() }));
      const dirs = nomi.filter((n) => n.dir).map((n) => n.name + "/");
      const files = nomi.filter((n) => !n.dir).map((n) => n.name);
      file = [...dirs.slice(0, 4), ...files.slice(0, PROGETTO_FILE_PROMPT)];
      const resto = dirs.length + files.length - file.length;
      if (resto > 0) file.push(`…e altri ${resto}`);
    } catch {
      file = ["(cartella non leggibile)"];
    }
    righe.push(
      `- \`${c.path}\`${c.path === progetto.attiva ? "  ← ATTIVA (è qui che si sta lavorando)" : ""}` +
        (file.length ? `\n  contiene: ${file.join(", ")}` : "\n  (vuota)"),
    );
  }
  return (
    `\n\n## Progetto (cartelle scelte dall'utente)\n` +
    `L'utente ha segnato queste cartelle come «il progetto» (percorsi relativi alla root ` +
    `\`${ROOT}\`). Quando dice «il progetto», «il sito», «qui» o chiede di continuare un lavoro ` +
    `già iniziato, si riferisce a queste cartelle — e in particolare a quella ATTIVA. Guarda lì ` +
    `prima di cercare altrove e non chiedere dove sono i file: sono elencati qui sotto.\n` +
    righe.join("\n") +
    `\nSe il lavoro riguarda davvero un'altra cartella, dillo e proponi di aggiungerla al progetto.`
  );
}

/** Rende subito effettivo il nuovo progetto nel contesto dell'agente. */
async function ricaricaContestoProgetto() {
  try {
    if (session?.isIdle) await session.reload();
    else progettoReloadPending = true;
  } catch (e) {
    console.error("[dashboard] reload per il progetto:", e?.message || e);
  }
  broadcast("progetto", await progettoPayload());
}
let progettoReloadPending = false;

const browserLive = createBrowserLive({
  user: process.env.DASH_BROWSER_USER || "pi-browser",
  // wrapper col profilo PERSISTENTE: se il bridge riavvia il daemon deve usare lo stesso
  // profilo del tool, altrimenti i login andrebbero persi (v. media/pbrowser)
  bin: process.env.DASH_BROWSER_BIN || "/usr/local/bin/pbrowser",
  maxFps: BROWSER_FPS_BASE,
  onLog: (m) => console.log(m),
  onEvent: (ev) => {
    // il frame non va nel log (è grande): va solo ai client
    if (ev.type === "frame") broadcast("browser_frame", ev);
    else if (ev.type === "url") broadcast("browser_url", ev);
    else if (ev.type === "tabs") broadcast("browser_tabs", ev);
    else if (ev.type === "error") broadcast("browser_live_error", ev);
    else broadcast("browser_live", ev);
  },
});

const resourceLoader = new DefaultResourceLoader({
  cwd: cwd(),
  agentDir: getAgentDir(),
  additionalExtensionPaths,
  additionalSkillPaths: [SKILLS_DIR],
  extensionFactories: [MEDIA_GUARD_EXT, BROWSER_EXT, MEMORIA_EXT, ...(ASK_EXT ? [ASK_EXT] : []), ...(DECISION_M_EXT ? [DECISION_M_EXT] : [])],
  systemPromptOverride: (base) => `${base ?? ""}${SYSTEM_MEDIA_NOTE}${progettoPromptNote()}`,
});
await resourceLoader.reload();

// ---- gestione sessioni chat (persistenti) -------------------------------
const SESSION_DIR = process.env.DASH_SESSION_DIR || join(__dirname, "sessions");
await fs.mkdir(SESSION_DIR, { recursive: true }).catch(() => {});

const SUBAGENT_TOOL_NAMES = new Set(["subagent", "bg_wait"]);

let session = null;
// Stato del watcher sulle skill (funzioni in "skill modificate da fuori"): dichiarato qui
// perché gli eventi di sessione possono arrivare prima del resto dell'inizializzazione.
let skillsWatchTimer = null;
let skillsReloadPending = false;
let skillsReloading = false;
let skillsSignatureNota = null;
const skillsWatchers = [];
/** Stima post-compaction: pi non conosce il nuovo conteggio finche' non arriva
 *  una risposta successiva alla compaction, quindi lo teniamo noi finche' dura. */
let compactEstimate = null;
let unsubscribeSession = null;
let sessionStartedAt = Date.now();
let ALL_TOOLS = [];
/** Tool attivati da pi all'avvio della sessione: è la base del gate, così non si allarga
 *  la superficie abilitando per errore tool che pi tiene spenti (powershell, grep, ls…). */
let DEFAULT_TOOL_NAMES = [];
let hasSubagentExt = false;
let subagentsEnabled = false;
// Tool browser: spento di default (naviga il web e consuma ~1,7 GB di RAM per sessione).
// Si accende con /browser on o POST /api/browser; quando è OFF i tool vengono rimossi
// dalla lista inviata al modello, quindi il modello non può nemmeno tentare di usarli.
let browserEnabled = false;
const BROWSER_TOOL_NAMES = new Set(["browser"]);
/** Tool delle domande all'utente: spento → rimosso dalla lista inviata al modello. */
const ASK_TOOL_NAMES = new Set(["ask_user"]);

// ---- accensione intelligente del tool browser ----
// La scelta sta su disco, così sopravvive ai riavvii (prima tornava sempre OFF).
const BROWSER_PREFS_FILE =
  process.env.DASH_BROWSER_PREFS_FILE || join(MEDIA_DIR, "browser-prefs.json");
let browserMode = "auto"; // "auto" | "on" | "off"
let browserIdleMinutes = 20;
let browserLastActivity = 0; // ultima azione del tool (o watch attivo)
try {
  const pref = JSON.parse(readFileSync(BROWSER_PREFS_FILE, "utf8"));
  if (["auto", "on", "off"].includes(pref?.mode)) browserMode = pref.mode;
  if (Number.isFinite(pref?.idleMinutes) && pref.idleMinutes > 0) browserIdleMinutes = pref.idleMinutes;
} catch {
  /* nessuna preferenza salvata: si usa il default */
}
function saveBrowserPrefs() {
  // Scrittura SINCRONA: è un file minuscolo, scritto raramente, e così la preferenza è già
  // su disco quando l'API risponde (niente corsa con chi la rilegge subito dopo, come fa
  // il test funzionale o uno script di deploy).
  try {
    writeFileSync(
      BROWSER_PREFS_FILE,
      JSON.stringify({ mode: browserMode, idleMinutes: browserIdleMinutes }, null, 2),
    );
  } catch {
    /* se non si può scrivere, la preferenza resta valida in memoria */
  }
}

/**
 * Il tool deve essere acceso adesso? In modo "auto" si accende quando serve davvero e si
 * spegne da solo quando non serve più, senza che l'utente debba pensarci.
 */
function browserShouldBeEnabled() {
  if (browserMode === "off") return false;
  if (browserMode === "on") return true;
  if (browserControlMode === "human") return true; // l'utente sta guidando: gli serve
  try {
    if (browserLive.snapshot().watching) return true; // live view aperta
  } catch {
    /* niente */
  }
  return browserLastActivity > 0 && Date.now() - browserLastActivity < browserIdleMinutes * 60_000;
}

// Limite massimo di agenti per richiesta (default 3), letto dall'estensione
// via PI_SUBAGENT_MAX_SPAWNS_PER_RUN ad ogni esecuzione.
const initialMax = Number(process.env.PI_SUBAGENT_MAX_SPAWNS_PER_RUN);
let maxSubagentSpawns = Number.isInteger(initialMax) && initialMax > 0 ? initialMax : 3;
function applySubagentLimit() {
  process.env.PI_SUBAGENT_MAX_SPAWNS_PER_RUN = String(maxSubagentSpawns);
}
applySubagentLimit();

/**
 * Lista COMPLETA dei tool dal registry di pi. Non si usa state.tools, che è la vista dei
 * tool ATTIVI: scriverci direttamente non cambia quello che il modello riceve.
 */
function allToolsOf(s) {
  try {
    if (s && typeof s.getAllTools === "function") return s.getAllTools();
  } catch {
    /* si ricade sulla vista */
  }
  return s?.agent?.state?.tools?.slice?.() || [];
}

function applyToolGate() {
  if (!session) return;
  // in modo "auto" lo stato del tool è una conseguenza delle condizioni, non un flag fisso
  browserEnabled = browserShouldBeEnabled();
  const registered = new Set(allToolsOf(session).map((t) => t.name));
  // base: i tool che pi attiva di suo; in più i tool delle estensioni gestibili a interruttore
  let names = DEFAULT_TOOL_NAMES.slice();
  for (const n of BROWSER_TOOL_NAMES) if (registered.has(n) && !names.includes(n)) names.push(n);
  for (const n of SUBAGENT_TOOL_NAMES) if (registered.has(n) && !names.includes(n)) names.push(n);
  for (const n of ASK_TOOL_NAMES) if (registered.has(n) && !names.includes(n)) names.push(n);
  for (const n of DECISION_M_TOOL_NAMES) if (registered.has(n) && !names.includes(n)) names.push(n);
  if (!subagentsEnabled) names = names.filter((n) => !SUBAGENT_TOOL_NAMES.has(n));
  if (!browserEnabled) names = names.filter((n) => !BROWSER_TOOL_NAMES.has(n));
  if (!askToolEnabled()) names = names.filter((n) => !ASK_TOOL_NAMES.has(n));
  // spenta la feature, i tool di Decision_M spariscono dalla lista: il modello non prova
  // nemmeno a chiamarli, e intanto il processo non occupa RAM
  if (!decisionMToolEnabled()) names = names.filter((n) => !DECISION_M_TOOL_NAMES.has(n));
  // percorso ufficiale: abilita per nome dal registry e ricostruisce il system prompt
  if (typeof session.setActiveToolsByName === "function") session.setActiveToolsByName(names);
  else session.agent.state.tools = all.filter((t) => names.includes(t.name));
}

// Rivaluta l'accensione del browser: senza questo, in modo "auto" resterebbe nello stato
// deciso al momento della richiesta precedente.
setInterval(() => {
  try {
    if (browserMode !== "auto") return;
    const want = browserShouldBeEnabled();
    if (want !== browserEnabled) {
      applyToolGate();
      broadcast("state", getState());
    }
  } catch {
    /* niente */
  }
}, 60_000).unref?.();

const newSessionManager = () => SessionManager.create(cwd(), SESSION_DIR);

/** Crea la sessione agente per un SessionManager e vi si aggancia. */
async function attachSession(sessionManager) {
  const created = await createAgentSession({
    model,
    thinkingLevel: startThinking,
    modelRuntime,
    resourceLoader,
    sessionManager,
  });
  session = created.session;
  ALL_TOOLS = allToolsOf(session);
  // la lista scelta da pi PRIMA di applicare il gate
  DEFAULT_TOOL_NAMES = (session.agent?.state?.tools || []).map((t) => t.name);
  hasSubagentExt = ALL_TOOLS.some((t) => SUBAGENT_TOOL_NAMES.has(t.name));
  applyToolGate();
  sessionStartedAt = Date.now();
  unsubscribeSession = session.subscribe(handleSessionEvent);
  return session;
}

/**
 * Le estensioni (pi-web-access, pi-subagents, ...) vivono in UN SOLO runtime
 * condiviso per cwd, preso dal resourceLoader via la cache globale delle estensioni
 * di pi. AgentSession.dispose() chiama runner.invalidate() -> runtime.invalidate(),
 * che marca quel runtime "stale" in modo PERMANENTE (non esiste un reset).
 *
 * Conseguenza: se creiamo una sessione e POI disponiamo quella vecchia, la sessione
 * nuova eredita il runtime avvelenato e ogni tool di estensione (web_search,
 * fetch_content, source_check, subagent...) fallisce all'istante con
 * "This extension ctx is stale after session replacement or reload".
 *
 * Fix: resourceLoader.reload() azzera la cache delle estensioni e produce un runtime
 * NUOVO. Va chiamato PRIMA di costruire la sessione che deve restare viva, così il
 * dispose() della sessione precedente invalida solo il runtime vecchio, ormai isolato.
 * Costo misurato: ~0.4-0.5 s.
 */
async function refreshExtensionRuntime() {
  try {
    await resourceLoader.reload();
  } catch (e) {
    console.error("[dashboard] reload resourceLoader fallito:", e?.message || e);
  }
}

/** Passa a un'altra sessione (nuova o esistente). */
async function switchSession(sessionManager) {
  const old = session;
  if (unsubscribeSession) {
    try {
      unsubscribeSession();
    } catch {
      /* ignore */
    }
    unsubscribeSession = null;
  }
  // Runtime nuovo per la sessione entrante, poi dispose della vecchia: senza il
  // reload la nuova sessione resterebbe con il runtime invalidato dal dispose.
  await refreshExtensionRuntime();
  await attachSession(sessionManager);
  if (old && old !== session) {
    try {
      old.dispose();
    } catch {
      /* ignore */
    }
  }
}

async function getSessionsPayload() {
  const list = await SessionManager.list(cwd(), SESSION_DIR);
  const current = session?.sessionId ?? null;
  return {
    current,
    sessions: list
      .filter((s) => s.messageCount > 0 || s.id === current)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified))
      .map((s) => ({
        id: s.id,
        name: s.name || null,
        file: s.path,
        created: s.created,
        modified: s.modified,
        messageCount: s.messageCount,
        preview: (s.firstMessage || "").slice(0, 140),
        current: s.id === current,
      })),
  };
}

// All'avvio riprende l'ultima chat con contenuto, altrimenti ne crea una nuova.
const existing = (await SessionManager.list(cwd(), SESSION_DIR))
  .filter((s) => s.messageCount > 0)
  .sort((a, b) => new Date(b.modified) - new Date(a.modified));
await attachSession(
  existing.length ? SessionManager.open(existing[0].path, SESSION_DIR, cwd()) : newSessionManager(),
);

// ---- SSE clients --------------------------------------------------------
const clients = new Set();

/**
 * Buffer di replay degli eventi SSE.
 *
 * Quando la connessione cade (rete mobile, cambio Wi-Fi, scheda in background, riavvio del
 * proxy) `EventSource` si riconnette da solo e rimanda l'header `Last-Event-ID`. Senza replay
 * i delta emessi nel frattempo andrebbero persi per sempre e la risposta in chat risulterebbe
 * tagliata a metà: è il difetto segnalato («vedo solo i comandi … a meno che non faccia
 * refresh»). Gli eventi della live view sono esclusi: sono grandi e frequenti, non servono.
 */
const SSE_REPLAY_MAX = 500; // numero massimo di eventi conservati
const SSE_REPLAY_MAX_BYTES = 256 * 1024; // tetto di RAM per il buffer
const SSE_NO_REPLAY = new Set(["browser_frame"]);
let sseSeq = 0;
let sseReplayBytes = 0;
const sseReplay = []; // [{ id, size, payload }]

function broadcast(event, data) {
  const replayable = !SSE_NO_REPLAY.has(event);
  const id = replayable ? ++sseSeq : null;
  const body = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const payload = id === null ? body : `id: ${id}\n${body}`;
  if (replayable) {
    sseReplay.push({ id, size: payload.length, payload });
    sseReplayBytes += payload.length;
    while (sseReplay.length > SSE_REPLAY_MAX || sseReplayBytes > SSE_REPLAY_MAX_BYTES) {
      sseReplayBytes -= sseReplay.shift().size;
    }
  }
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Turno in corso, tenuto lato server per il riallineamento: i SEGMENTI in ordine.
 *
 * La sessione di pi salva la risposta solo a fine turno: senza questo snapshot una
 * riconnessione a metà risposta non avrebbe modo di ricostruire ciò che è già stato
 * generato, e il testo rimasto a schermo sarebbe l'unica copia (destinata a rompersi).
 *
 * Non basta il solo testo concatenato: durante un turno agentico il modello alterna
 * pensiero, testo e chiamate ai tool (`bash`, `read`, …). Se lo snapshot fosse solo
 * `{text, thinking}` il client, dopo una riconnessione, non saprebbe più DOVE cadono i
 * tool e mostrerebbe una risposta diversa da quella che si vede ricaricando la pagina.
 * I segmenti (`{kind:'thinking'|'text'|'tool'}`) conservano l'ordine reale e rendono il
 * riallineamento idempotente.
 */
let streamSnapshot = { segments: [], active: false };

/** Testo complessivo del turno in corso (compatibilità: test e client vecchi). */
function snapshotText() {
  return streamSnapshot.segments.filter((s) => s.kind === "text").map((s) => s.text).join("");
}
function snapshotThinking() {
  return streamSnapshot.segments.filter((s) => s.kind === "thinking").map((s) => s.text).join("");
}

/** Accoda un delta al segmento coerente, aprendone uno nuovo quando cambia il tipo. */
function pushSegment(kind, delta) {
  const last = streamSnapshot.segments[streamSnapshot.segments.length - 1];
  if (last && last.kind === kind) last.text += delta;
  else streamSnapshot.segments.push({ kind, text: delta });
}

/** Riassunto leggibile degli argomenti di un tool (niente payload giganteschi in SSE). */
function toolSummary(args) {
  const a = args && typeof args === "object" ? args : {};
  // `ask_user`: il riassunto sono le domande poste (l'agente è in attesa di una risposta umana)
  if (Array.isArray(a.questions) && a.questions.length) {
    const labels = a.questions.map((q) => sanitizeText(q?.header || q?.question || "", 40)).filter(Boolean);
    const some = (a.questions.length === 1 ? "" : `${a.questions.length} domande: `) + labels.join(", ");
    return `attende una risposta — ${some}`.slice(0, 200);
  }
  const raw = a.command ?? a.path ?? a.file_path ?? a.filePath ?? a.url ?? a.query ?? a.pattern ?? "";
  return String(raw).replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Il turno dell'agente è in corso?
 *
 * NON si può usare `session.isStreaming` per dirlo alla UI: alla fine del turno pi emette
 * `agent_end` mentre `isStreaming` è ancora `true`, quindi lo stato trasmesso subito dopo
 * diceva «sto ancora lavorando» e la chat restava con il pallino acceso e il pulsante ⏹ al
 * posto di Invia (difetto visto con il test in browser vero). `turnActive` segue gli eventi
 * del turno ed è quindi coerente nel momento in cui lo si comunica.
 */
let turnActive = false;

// ---- goal / pianificazione / checklist -----------------------------------
// Persistenza in media (sopravvive ai riavvii) + stato in memoria.
let goals = [];

/** Carica i goal dal disco. */
async function loadGoals() {
  try {
    const raw = await fs.readFile(GOALS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    goals = Array.isArray(parsed) ? parsed : [];
  } catch {
    goals = [];
  }
}

/** Salva i goal su disco in modo atomico. */
async function saveGoals() {
  const tmp = GOALS_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(goals, null, 2), "utf8");
  await fs.rename(tmp, GOALS_FILE);
}

const GOAL_STATUSES = new Set(["active", "done", "archived"]);


/** Valida e normalizza un goal in ingresso (creazione o aggiornamento). */
function normalizeGoal(input, existing = null) {
  const now = Date.now();
  // Un aggiornamento PARZIALE non deve cancellare ciò che non viene inviato: la chiave ASSENTE
  // significa «non toccare», la chiave presente (anche vuota) significa «sostituisci».
  // Prima `POST /api/goals { id, status }` azzerava descrizione, passi e checklist — proprio
  // il caso che il commento qui sopra dichiarava di voler sostenere, e che l'API è il modo
  // consigliato per aggiornare i goal (vedi la nota nel README).
  const given = (k) => input != null && input[k] !== undefined;
  const title = String(input?.title ?? existing?.title ?? "").trim().slice(0, 200);
  if (!title) throw new HttpError(400, "titolo del goal mancante");

  // Passi e checklist accettano anche la forma breve `["fare questo", "poi quello"]`: l'API è
  // usata anche dall'agente e da script, e prima gli elementi stringa venivano SVUOTATI in
  // silenzio (nessun errore, goal senza passi: il chiamante credeva di averli creati).
  const steps = (given("steps") ? (Array.isArray(input.steps) ? input.steps : []) : existing?.steps ?? [])
    .map((s, i) => ({
      id: String((typeof s === "string" ? "" : s?.id) || randomBytes(6).toString("hex")),
      title: String(typeof s === "string" ? s : s?.title || "").trim().slice(0, 300),
      done: typeof s === "string" ? false : !!s?.done,
      order: i,
    }))
    .filter((s) => s.title);

  const checklist = (given("checklist") ? (Array.isArray(input.checklist) ? input.checklist : []) : existing?.checklist ?? [])
    .map((c) => ({
      id: String((typeof c === "string" ? "" : c?.id) || randomBytes(6).toString("hex")),
      text: String(typeof c === "string" ? c : c?.text || "").trim().slice(0, 300),
      done: typeof c === "string" ? false : !!c?.done,
    }))
    .filter((c) => c.text);

  const status = GOAL_STATUSES.has(input?.status) ? input.status : (existing?.status || "active");

  return {
    id: existing?.id || randomBytes(8).toString("hex"),
    title,
    description: (given("description") ? String(input.description || "") : existing?.description ?? "")
      .trim()
      .slice(0, 4000),
    status,
    steps,
    checklist,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/** Prompt che chiede all'agente di eseguire la catena di passaggi del goal. */
function goalExecutionPrompt(g, mode) {
  const remaining = (g.steps || []).filter((s) => !s.done);
  const pending = (g.checklist || []).filter((c) => !c.done);
  const next = mode === "next" ? remaining.slice(0, 1) : remaining;

  const lines = ["Esegui la pianificazione salvata nella dashboard (goal).", ""];
  lines.push(`Obiettivo: ${g.title}`);
  if (g.description) lines.push(`Descrizione: ${g.description}`);
  if (next.length) {
    lines.push("");
    lines.push("Catena di passaggi (in ordine):");
    next.forEach((s, i) => lines.push(`${i + 1}. ${s.title}`));
  }
  if (pending.length) {
    lines.push("");
    lines.push("Checklist da completare:");
    pending.forEach((c) => lines.push(`- [ ] ${c.text}`));
  }
  lines.push("");
  lines.push(
    "Esegui i passaggi uno alla volta, in ordine, usando gli strumenti disponibili dove servono. " +
    "Alla fine riassumi cosa è stato fatto e cosa resta ancora da fare.",
  );
  return lines.join("\n");
}

await loadGoals();
await loadProgetto();

// ---- operazioni pianificate (cron) ---------------------------------------
// Job salvati in un JSON (sopravvivono ai riavvii) + esecuzione autonoma.
const SCHEDULES_FILE = process.env.DASH_SCHEDULES_FILE || join(MEDIA_DIR, "schedules.json");
const SCHEDULE_LOG_DIR = join(MEDIA_DIR, "schedule-logs");
const SCHEDULE_MAX_TIMEOUT = 3600; // secondi
const TICK_MS = Math.max(5000, Number(process.env.DASH_SCHEDULE_TICK_MS) || 20000);
let schedules = [];
let schedulerRunning = null; // id del job in corso

async function loadSchedules() {
  try {
    const parsed = JSON.parse(await fs.readFile(SCHEDULES_FILE, "utf8"));
    schedules = Array.isArray(parsed) ? parsed : [];
  } catch {
    schedules = [];
  }
}

async function saveSchedules() {
  const tmp = SCHEDULES_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(schedules, null, 2), "utf8");
  await fs.rename(tmp, SCHEDULES_FILE);
}

// --- mini-cron: 5 campi (min ora giorno mese giornosettimana) o @every/@daily ---
const CRON_ALIASES = {
  "@hourly": "0 * * * *", "@daily": "0 0 * * *", "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0", "@monthly": "0 0 1 * *", "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *",
};

function parseCronField(field, min, max) {
  const out = new Set();
  for (const part of String(field).split(",")) {
    const p = part.trim();
    if (!p) throw new HttpError(400, "campo cron vuoto");
    let step = 1;
    let range = p;
    const slash = p.split("/");
    if (slash.length === 2) {
      range = slash[0];
      step = Number(slash[1]);
      if (!Number.isInteger(step) || step < 1) throw new HttpError(400, `passo non valido: ${p}`);
    } else if (slash.length > 2) throw new HttpError(400, `sintassi non valida: ${p}`);
    let lo;
    let hi;
    if (range === "*") {
      lo = min;
      hi = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-").map(Number);
      if (!Number.isInteger(a) || !Number.isInteger(b)) throw new HttpError(400, `intervallo non valido: ${p}`);
      lo = a;
      hi = b;
    } else {
      const v = Number(range);
      if (!Number.isInteger(v)) throw new HttpError(400, `valore non valido: ${p}`);
      lo = hi = v;
    }
    if (lo < min || hi > max || lo > hi) throw new HttpError(400, `fuori intervallo (${min}-${max}): ${p}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

function parseCron(expr) {
  const raw = String(expr || "").trim();
  if (!raw) throw new HttpError(400, "specifica della pianificazione mancante o vuota (campo `schedule`, 5 campi: minuto ora giorno mese giorno-settimana, es. «0 3 * * *»)");
  const lower = raw.toLowerCase();
  if (lower.startsWith("@every")) {
    const m = lower.match(/^@every\s+(\d+)\s*(m|h|d)$/);
    if (!m) throw new HttpError(400, "formato @every non valido (es. @every 30m)");
    const unit = { m: 60000, h: 3600000, d: 86400000 }[m[2]];
    const ms = Number(m[1]) * unit;
    if (ms < 60000) throw new HttpError(400, "@every minimo 1m");
    return { kind: "every", ms, text: `@every ${Number(m[1])}${m[2]}` };
  }
  if (lower === "@reboot") return { kind: "every", ms: null, text: "@reboot" };
  const expanded = CRON_ALIASES[lower] || raw;
  const parts = expanded.split(/\s+/);
  if (parts.length !== 5)
    throw new HttpError(400, "servono 5 campi: minuto ora giorno mese giorno-settimana");
  const [mi, ho, dom, mo, dw] = parts;
  return {
    kind: "cron",
    minutes: parseCronField(mi, 0, 59),
    hours: parseCronField(ho, 0, 23),
    doms: parseCronField(dom, 1, 31),
    months: parseCronField(mo, 1, 12),
    dows: new Set([...parseCronField(dw, 0, 7)].map((v) => (v === 7 ? 0 : v))),
    domStar: dom.trim() === "*",
    dowStar: dw.trim() === "*",
    text: expanded,
  };
}

/** Prossima esecuzione (ms epoch) o null se mai raggiungibile. */
function nextCronTime(spec, from = new Date()) {
  if (spec.kind === "every") return spec.ms ? from.getTime() + spec.ms : null;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let day = 0; day < 1500; day++) {
    if (spec.months.has(d.getMonth() + 1)) {
      const domOk = spec.doms.has(d.getDate());
      const dowOk = spec.dows.has(d.getDay());
      const dayOk = !spec.domStar && !spec.dowStar ? domOk || dowOk : domOk && dowOk;
      if (dayOk) {
        const curHour = d.getHours();
        const curMin = d.getMinutes();
        for (let h = curHour; h < 24; h++) {
          if (!spec.hours.has(h)) continue;
          for (let mi = h === curHour ? curMin : 0; mi < 60; mi++) {
            if (!spec.minutes.has(mi)) continue;
            const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi, 0, 0);
            if (out.getTime() > from.getTime()) return out.getTime();
          }
        }
      }
    }
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
  }
  return null;
}

const computeNextRun = (job, from = new Date()) => nextCronTime(parseCron(job.schedule), from);

function normalizeSchedule(input, existing = null) {
  const now = Date.now();
  const name = String(input?.name || "").trim().slice(0, 120);
  if (!name) throw new HttpError(400, "nome mancante");
  const spec = parseCron(String(input?.schedule || ""));
  const action = input?.action === "goal" ? "goal" : "prompt";
  const goalId = action === "goal" ? String(input?.goalId || "") : "";
  if (action === "goal" && !goalId) throw new HttpError(400, "seleziona un goal");
  const prompt = String(input?.prompt || "").slice(0, 20000);
  if (action === "prompt" && !prompt.trim()) throw new HttpError(400, "prompt mancante");
  const nextRun = nextCronTime(spec, new Date(now));
  if (nextRun == null) throw new HttpError(400, "pianificazione mai raggiungibile");
  return {
    id: existing?.id || randomBytes(8).toString("hex"),
    name,
    schedule: spec.text,
    action,
    goalId,
    prompt,
    timeoutSec: Math.max(30, Math.min(SCHEDULE_MAX_TIMEOUT, Number(input?.timeoutSec) || existing?.timeoutSec || 600)),
    enabled: input?.enabled === undefined ? existing?.enabled ?? true : !!input.enabled,
    nextRun,
    lastRun: existing?.lastRun ?? null,
    lastStatus: existing?.lastStatus ?? null,
    lastError: existing?.lastError ?? null,
    lastResult: existing?.lastResult ?? null,
    lastSessionFile: existing?.lastSessionFile ?? null,
    runCount: existing?.runCount ?? 0,
    durationMs: existing?.durationMs ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

/** Testo dell'ultima risposta dell'assistente in una sessione. */
function lastAssistantText(s) {
  try {
    const msgs = s?.state?.messages || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "assistant") continue;
      const t = (m.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (t) return t;
    }
  } catch {
    /* ignore */
  }
  return "";
}

async function appendScheduleLog(id, block) {
  try {
    await fs.mkdir(SCHEDULE_LOG_DIR, { recursive: true });
    const f = join(SCHEDULE_LOG_DIR, `${String(id).replace(/[^\w.-]/g, "_")}.log`);
    await fs.appendFile(f, block + "\n", "utf8");
    const st = await fs.stat(f);
    if (st.size > 512 * 1024) {
      const raw = await fs.readFile(f, "utf8");
      await fs.writeFile(f, raw.slice(-128 * 1024), "utf8");
    }
  } catch {
    /* ignore */
  }
}

/** Esegue una pianificazione in una sessione DEDICATA (non tocca la chat attiva). */
async function runSchedule(job, { manual = false } = {}) {
  if (schedulerRunning) throw new HttpError(409, "un'altra pianificazione è già in esecuzione");
  schedulerRunning = job.id;
  const startedAt = Date.now();
  broadcast("schedule", { schedules, running: schedulerRunning });
  broadcast("schedule_run", { id: job.id, name: job.name, status: "start", at: startedAt });
  let text = "";
  let error = null;
  let sessionFile = null;
  let s = null;
  try {
    let promptText;
    if (job.action === "goal" && job.goalId) {
      const g = goals.find((x) => x.id === job.goalId);
      if (!g) throw new Error("goal non trovato");
      promptText = goalExecutionPrompt(g, "all");
    } else {
      promptText = String(job.prompt || "").trim();
    }
    if (!promptText) throw new Error("nessun prompt da eseguire");

    // riusa la chat del job se esiste, altrimenti ne crea una nuova
    let sm;
    try {
      if (job.lastSessionFile && existsSync(job.lastSessionFile)) {
        sm = SessionManager.open(job.lastSessionFile, SESSION_DIR, cwd());
      }
    } catch {
      sm = null;
    }
    if (!sm) sm = SessionManager.create(cwd(), SESSION_DIR);

    // Runtime estensioni isolato anche per i job: la sessione temporanea viene
    // disposta nel finally e quel dispose() invaliderebbe il runtime condiviso,
    // spegnendo la web search (e ogni altro tool di estensione) della sessione
    // principale. Vedi la nota su refreshExtensionRuntime().
    await refreshExtensionRuntime();
    const created = await createAgentSession({
      model,
      thinkingLevel: startThinking,
      modelRuntime,
      resourceLoader,
      sessionManager: sm,
    });
    s = created.session;
    const timeoutMs = Math.max(30, Math.min(SCHEDULE_MAX_TIMEOUT, Number(job.timeoutSec) || 600)) * 1000;
    let timer = null;
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(() => rej(new Error(`timeout dopo ${timeoutMs / 1000}s`)), timeoutMs);
    });
    try {
      await Promise.race([s.prompt(promptText), timeout]);
    } catch (e) {
      try {
        await s.abort?.();
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
    text = lastAssistantText(s);
    sessionFile = s.sessionFile || null;
    try {
      s.sessionManager.appendSessionInfo(`⏰ ${job.name}`);
    } catch {
      /* ignore */
    }
  } catch (e) {
    error = e?.message || String(e);
  } finally {
    try {
      s?.dispose?.();
    } catch {
      /* ignore */
    }
  }
  const endedAt = Date.now();
  const rec = schedules.find((x) => x.id === job.id);
  if (rec) {
    rec.lastRun = endedAt;
    rec.lastStatus = error ? "error" : "ok";
    rec.lastError = error;
    rec.lastResult = (text || "").slice(0, 4000);
    if (sessionFile) rec.lastSessionFile = sessionFile;
    rec.runCount = (Number(rec.runCount) || 0) + 1;
    rec.durationMs = endedAt - startedAt;
    rec.updatedAt = endedAt;
    try {
      rec.nextRun = computeNextRun(rec, new Date(endedAt + 1000));
    } catch {
      rec.nextRun = null;
    }
    await saveSchedules().catch(() => {});
  }
  await appendScheduleLog(
    job.id,
    [
      `[${new Date(startedAt).toISOString()}] ${error ? "ERRORE" : "OK"}${manual ? " (manuale)" : ""} — ${job.name}`,
      error
        ? `  errore: ${error}`
        : `  durata: ${Math.round((endedAt - startedAt) / 1000)}s${sessionFile ? ` — chat: ${sessionFile}` : ""}`,
      text ? text.split("\n").map((l) => "  " + l).join("\n") : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  schedulerRunning = null;
  broadcast("schedule", { schedules, running: null });
  broadcast("schedule_run", {
    id: job.id,
    name: job.name,
    status: error ? "error" : "ok",
    error,
    text: (text || "").slice(0, 2000),
    durationMs: endedAt - startedAt,
    at: endedAt,
  });
  return { ok: !error, error, text, sessionFile, durationMs: endedAt - startedAt };
}

/** Un tick: esegue al massimo una pianificazione scaduta. */
async function schedulerTick() {
  try {
    if (schedulerRunning) return;
    if (session?.isStreaming) return; // non compete con la chat dell'utente
    const now = Date.now();
    const due = schedules
      .filter((j) => j.enabled && typeof j.nextRun === "number" && j.nextRun <= now)
      .sort((a, b) => a.nextRun - b.nextRun)[0];
    if (!due) return;
    console.log(`[dashboard] scheduler: eseguo "${due.name}" (${due.schedule})`);
    await runSchedule(due);
  } catch (e) {
    console.error("[dashboard] scheduler:", e?.message ?? e);
  }
}

await loadSchedules();
// al riavvio NON recuperiamo le esecuzioni perse: ricalcoliamo il prossimo slot
{
  const now = new Date();
  let touched = false;
  for (const j of schedules) {
    try {
      j.nextRun = computeNextRun(j, now);
      j.scheduleError = null;
    } catch (e) {
      j.scheduleError = e?.message || String(e);
      j.nextRun = null;
    }
    touched = true;
  }
  if (touched && schedules.length) await saveSchedules().catch(() => {});
}
const schedulerTimer = setInterval(schedulerTick, TICK_MS);
if (typeof schedulerTimer.unref === "function") schedulerTimer.unref();

// ---- stats --------------------------------------------------------------
function supportedLevels(m) {
  const map = m?.thinkingLevelMap;
  if (!map) return ALL_LEVELS;
  return ALL_LEVELS.filter((l) => map[l] !== null && map[l] !== undefined);
}

function getGitBranch() {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Specifica della card `ask_user` da mostrare nel messaggio (anche dopo un reload).
 * `result` viene dal `details` del risultato del tool: senza, la vista ricaricata mostrerebbe
 * una domanda "in attesa" per sempre, cioè un pezzo di conversazione che mente.
 */
function askSpecFromArgs(args, toolResult) {
  const a = args && typeof args === "object" ? args : {};
  let questions = [];
  try {
    questions = normalizeQuestions(a.questions);
  } catch {
    // argomenti non validi (la chiamata è stata rifiutata): si mostra quel che c'è, senza card
    return null;
  }
  const d = toolResult?.details ?? null;
  const answered = d && typeof d === "object" && typeof d.status === "string" ? d : null;
  return {
    questions,
    context: sanitizeText(a.context ?? "", 240) || null,
    timeoutSeconds: Number.isFinite(Number(a.timeoutSeconds)) ? Math.round(Number(a.timeoutSeconds)) : null,
    result: answered
      ? {
          status: answered.status,
          answers: Array.isArray(answered.answers) ? answered.answers : null,
          reason: null,
          ms: null,
        }
      : null,
  };
}

/** Percorso toccato da una chiamata di tool (`write`, `edit`, `read`…), se c'è. */
function toolPathFromArgs(a) {
  const p = a?.path ?? a?.file_path ?? a?.filePath ?? null;
  return typeof p === "string" && p ? p : null;
}

/** Converte un messaggio della sessione nel formato usato dalla UI. */
function toUiMessage(msg, toolResults = null) {
  if (msg.role === "user") {
      const parts = msg.content || [];
      const rawText = parts.filter((b) => b.type === "text").map((b) => b.text).join("");
      const images = parts
        .filter((b) => b.type === "image")
        .map((b) => ({ mime: b.mimeType || b.source?.mediaType || "image/png", data: b.data || b.source?.data || "" }))
        .filter((x) => x.data && x.data.length < 4_000_000);
      let text = rawText;
      let attachments = [];
      const m = rawText.match(/^<<ALLEGATI>>\n([\s\S]*?)\n<<\/ALLEGATI>>\n?/);
      if (m) {
        attachments = m[1]
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const mm = l.match(/^- (.*?): (.*)$/);
            return { name: mm?.[1] ?? l, path: mm?.[2] ?? null };
          });
        text = rawText.slice(m[0].length);
      }
      return { role: "user", text, images, attachments, ts: msg.timestamp ?? null };
    }

  if (msg.role === "assistant") {
      let text = "";
      let thinking = "";
      const tools = [];
      // `blocks` conserva l'ORDINE reale dei blocchi (pensiero, testo, tool, testo…):
      // serve a rendere la vista ricaricata identica a quella in streaming. `text`,
      // `thinking` e `tools` restano per compatibilità con il resto della dashboard.
      const blocks = [];
      for (const b of msg.content || []) {
        if (b.type === "text") {
          text += b.text;
          blocks.push({ type: "text", text: b.text });
        } else if (b.type === "thinking") {
          thinking += b.thinking;
          blocks.push({ type: "thinking", text: b.thinking });
        } else if (b.type === "toolCall") {
          const a = b.arguments || {};
          const t = {
            name: b.name,
            path: toolPathFromArgs(a),
            command: typeof a.command === "string" ? a.command : null,
          };
          tools.push(t);
          const block = {
            type: "tool",
            id: b.id ?? null,
            name: t.name,
            path: t.path,
            command: t.command,
          };
          // le domande interattive si ricostruiscono con le risposte già date
          if (b.name === "ask_user") {
            const ask = askSpecFromArgs(a, toolResults?.get(b.id));
            if (ask) block.ask = ask;
          }
          blocks.push(block);
        }
      }
      return { role: "assistant", text, thinking, tools, blocks, error: msg.errorMessage || null, ts: msg.timestamp ?? null };
    }

  return null;
}

/**
 * Stato della dashboard.
 *
 * `withMessages` (default false) controlla l'inclusione della conversazione completa: quella
 * lista pesa oltre un megabyte nelle sessioni lunghe e veniva costruita e trasmessa a OGNI
 * broadcast di stato (20 punti del codice), molti dei quali avvengono più volte per richiesta.
 * Ora la chiede solo la GET /api/state iniziale; gli aggiornamenti in streaming restano leggeri
 * e il client conserva i messaggi che ha già.
 */
/**
 * Statistiche di sessione con rete di sicurezza.
 *
 * `session.getSessionStats()` scandisce i messaggi e assume che ogni risposta dell'assistente
 * abbia il campo `usage`: una sessione importata, scritta a mano o troncata (anche una sola
 * risposta senza `usage`) faceva sollevare l'eccezione dentro `getState`, quindi `/api/state`
 * rispondeva 500 e — prima della guardia in `json()` — una connessione SSE poteva spegnere il
 * processo. Le statistiche sono un'informazione di contorno: se non si possono calcolare si
 * mostrano a zero e il motivo resta nel log.
 */
function sessionStatsSafe() {
  try {
    const s = session?.getSessionStats?.() || null;
    return {
      tokens: s?.tokens ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      cost: s?.cost ?? 0,
      userMessages: s?.userMessages ?? 0,
      assistantMessages: s?.assistantMessages ?? 0,
      toolCalls: s?.toolCalls ?? 0,
    };
  } catch (err) {
    console.error("[dashboard] statistiche di sessione non calcolabili:", err?.message ?? err);
    return {
      tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      cost: 0,
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
    };
  }
}

function getState({ withMessages = false } = {}) {
  const stats = sessionStatsSafe();
  // Anche la stima del contesto è di contorno: se la sessione è incoerente non deve
  // impedire che lo stato (e quindi l'intera dashboard) si possa leggere.
  let ctxUsage = null;
  try {
    ctxUsage = session.getContextUsage();
  } catch (err) {
    console.error("[dashboard] uso del contesto non calcolabile:", err?.message ?? err);
  }
  // Dopo una compaction pi restituisce tokens: null finche' non risponde un
  // assistant successivo: in quella finestra mostriamo la stima del riassunto,
  // cosi' la barra del contesto si aggiorna subito.
  let ctxEstimated = false;
  if (compactEstimate) {
    if (ctxUsage && ctxUsage.tokens != null) {
      compactEstimate = null;
    } else {
      const win = ctxUsage?.contextWindow ?? model.contextWindow ?? null;
      compactEstimate = { ...compactEstimate, window: win };
      ctxUsage = {
        tokens: compactEstimate.tokens,
        contextWindow: win,
        percent: win ? (compactEstimate.tokens / win) * 100 : null,
      };
      ctxEstimated = true;
    }
  }
  const supported = supportedLevels(model);
  // La lista dei messaggi si costruisce solo se richiesta: anche il solo ciclo ha un costo
  // proporzionale alla lunghezza della conversazione, e va evitato nei broadcast frequenti.
  const messages = [];
  if (withMessages) {
    // I risultati dei tool servono a ricostruire le card delle domande con la risposta già data
    // (e, in generale, l'esito): senza, una domanda risolta tornerebbe "in attesa" al reload.
    const all = session?.state?.messages ?? [];
    const toolResults = new Map();
    for (const msg of all) {
      if (msg.role === "toolResult" && msg.toolCallId) {
        toolResults.set(msg.toolCallId, { details: msg.details ?? null, isError: !!msg.isError });
      }
    }
    for (const msg of all) {
      const ui = toUiMessage(msg, toolResults);
      if (ui) messages.push(ui);
    }
  }

  return {
    model: { id: model.id, provider: model.provider, name: model.name },
    // elenco dei modelli USABILI adesso: alimenta il selettore in barra, che prima era cablato
    // con due voci e non offriva i modelli disponibili in più (es. quello con vision)
    models: availableModels(),
    thinking: { level: session.thinkingLevel, supported },
    context: {
      tokens: ctxUsage?.tokens ?? null,
      window: ctxUsage?.contextWindow ?? model.contextWindow ?? null,
      percent: ctxUsage?.percent ?? null,
      estimated: ctxEstimated,
    },
    tokens: stats.tokens,
    cost: stats.cost,
    counts: {
      user: stats.userMessages,
      assistant: stats.assistantMessages,
      toolCalls: stats.toolCalls,
    },
    cwd: cwd(),
    root: ROOT,
    mediaDir: MEDIA_DIR,
    mediaRel: relative(ROOT, MEDIA_DIR),
    // Il file manager disegna la stella sulle cartelle già nel progetto: gli serve solo
    // l'elenco dei percorsi, non le schede complete (quelle arrivano da /api/progetto).
    progetto: { cartelle: progetto.cartelle.map((c) => c.path), attiva: progetto.attiva },
    subagents: {
      available: hasSubagentExt,
      enabled: hasSubagentExt && subagentsEnabled,
      maxSpawns: maxSubagentSpawns,
      activeTools: (session?.agent?.state?.tools || [])
        .map((t) => t.name)
        .filter((n) => SUBAGENT_TOOL_NAMES.has(n)),
    },
    browser: {
      available: ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name)),
      enabled: browserEnabled,
      activeTools: (session?.getActiveToolNames?.() || session?.agent?.state?.tools?.map?.((t) => t.name) || [])
        .filter((n) => BROWSER_TOOL_NAMES.has(n)),
      user: process.env.DASH_BROWSER_USER || "pi-browser",
      mode: browserMode,
      idleMinutes: browserIdleMinutes,
      lastActivity: browserLastActivity || null,
      control: browserControlMode,
      live: browserLive.snapshot(),
    },
    auth: {
      maxFails: AUTH_MAX_FAILS,
      blockedIps: [...authFails.values()].filter((s) => s.blockedUntil > Date.now()).length,
      blockedTotal: authBlockedTotal,
      // il blocco è progressivo: questi sono i gradini di attesa in secondi (l'ultimo è il tetto)
      backoffSec: AUTH_BACKOFF,
      windowSec: Math.round(AUTH_WINDOW_MS / 1000),
      forgetSec: Math.round(AUTH_FORGET_MS / 1000),
      sessionTtlSec: Math.round(SESSION_TTL_MS / 1000),
      modes: "basic+cookie",
    },
    gitBranch: getGitBranch(),
    // gli esiti solo dove servono davvero (con la conversazione completa), non nei broadcast leggeri
    ask: {
      enabled: askToolEnabled(),
      available: ASK_ENABLED,
      // il tool è davvero nella lista attiva? (è la vista su cui agisce il gate)
      toolActive: (session?.getActiveToolNames?.() || []).includes("ask_user"),
      ...askBroker.snapshot({ withResolved: withMessages }),
    },
    // Decision_M: snapshot SINCRONO, senza /health — `getState` gira anche nei broadcast
    // frequenti e non deve fare chiamate di rete. La versione completa sta su /api/decision_m.
    decision_m: DECISION_M_AVAILABLE ? decisionMService.snapshot() : { available: false, enabled: false },
    startedAt: sessionStartedAt,
    elapsedMs: Date.now() - sessionStartedAt,
    streaming: turnActive,
    sessionId: session.sessionId,
    sessionName: session.sessionManager.getSessionName?.() || null,
    sessionFile: session.sessionFile || null,
    ...(withMessages ? { messages } : {}),
  };
}

// ---- eventi sessione -> browser ----------------------------------------
function handleSessionEvent(event) {
  if (event.type === "message_update") {
    const ev = event.assistantMessageEvent;
    if (ev.type === "thinking_delta") {
      streamSnapshot.active = true;
      pushSegment("thinking", ev.delta);
      broadcast("thinking_delta", { delta: ev.delta });
    } else if (ev.type === "text_delta") {
      streamSnapshot.active = true;
      pushSegment("text", ev.delta);
      broadcast("text_delta", { delta: ev.delta });
    }
    return;
  }
  if (event.type === "tool_execution_start") {
    const seg = {
      kind: "tool",
      id: event.toolCallId || null,
      name: event.toolName,
      summary: toolSummary(event.args),
      status: "running",
      // il file toccato viaggia con il segmento: in streaming la card «scarica» compare
      // subito, senza aspettare un ricaricamento della pagina
      path: toolPathFromArgs(event.args),
    };
    // Le domande si portano DENTRO il segmento: dopo una riconnessione il messaggio in corso
    // viene ricostruito dai segmenti, e senza la specifica la card interattiva sparirebbe
    // (resterebbe solo «🔧 ask_user»), proprio mentre l'agente attende la risposta.
    if (event.toolName === "ask_user") {
      try {
        seg.ask = {
          questions: normalizeQuestions(event.args?.questions),
          context: sanitizeText(event.args?.context ?? "", 240) || null,
        };
      } catch {
        /* argomenti non validi: il tool li rifiuterà e il modello correggerà */
      }
    }
    streamSnapshot.segments.push(seg);
    broadcast("tool_start", { toolCallId: seg.id, toolName: seg.name, summary: seg.summary, path: seg.path });
    return;
  }
  if (event.type === "tool_execution_end") {
    // il tool può terminare anche se il segmento non c'è (nessun client collegato
    // all'inizio, id assente): si ripiega sull'ultimo tool ancora in corso.
    const seg =
      [...streamSnapshot.segments].reverse().find((s) => s.kind === "tool" && s.id && s.id === event.toolCallId) ||
      [...streamSnapshot.segments].reverse().find((s) => s.kind === "tool" && s.status === "running" && s.name === event.toolName);
    if (seg) seg.status = event.isError ? "error" : "ok";
    broadcast("tool_end", {
      toolCallId: event.toolCallId || null,
      toolName: event.toolName,
      isError: event.isError,
      path: seg?.path ?? null,
    });
    broadcast("files_touch", { toolName: event.toolName });
    return;
  }
  if (event.type === "agent_start") {
    // il turno (anche con più passi) accumula un solo snapshot: si azzera solo all'inizio
    if (!streamSnapshot.active) streamSnapshot = { segments: [], active: true };
    // Il buffer di replay copre UN turno: senza questo azzeramento gli eventi dei turni
    // precedenti restano in memoria e una riconnessione con un Last-Event-ID vecchio
    // rispedirebbe alla chat delta e tool del passato (testo duplicato), oltre a far
    // crescere il buffer senza limite. La fine del turno resta in buffer per il replay.
    sseReplay.length = 0;
    sseReplayBytes = 0;
    turnActive = true;
    broadcast("status", { streaming: true });
    return;
  }
  if (event.type === "agent_end") {
    turnActive = false;
    // Skill cambiate mentre l'agente lavorava: la ricarica era stata rinviata.
    if (skillsReloadPending) {
      skillsReloadPending = false;
      scheduleSkillsReload("cambio durante la risposta");
    }
    // Progetto cambiato mentre l'agente lavorava: il contesto si ricostruisce ora.
    if (progettoReloadPending) {
      progettoReloadPending = false;
      ricaricaContestoProgetto().catch(() => {});
    }
    // Rete di sicurezza: se il turno è finito (per errore del provider) mentre una domanda era
    // in attesa, la si chiude. Non può accadere a turno normale: il tool blocca il turno.
    askBroker.cancelAll("turno concluso senza risposta");
    broadcast("status", { streaming: false });
    broadcast("state", getState());
    streamSnapshot = { segments: [], active: false };
    getSessionsPayload()
      .then((p) => broadcast("sessions", p))
      .catch(() => {});
    return;
  }
}

// ---- comandi slash ------------------------------------------------------
// I comandi arrivano dal browser (palette con "/") e agiscono QUI, sul processo
// harness: sono gli stessi cambi di stato che si farebbero da TUI (modello,
// thinking, stop, nuova chat, compaction, goal, pianificazioni). Le azioni sono
// riscritte come funzioni riusabili e i comandi le richiamano: nessuna shell
// arbitraria, nessun riavvio del servizio.

/** Elenco modelli utilizzabili adesso (credenziali configurate). */
function availableModels() {
  try {
    const snap = modelRuntime.getAvailableSnapshot?.() || [];
    if (snap.length) return snap.map((m) => ({ id: m.id, provider: m.provider, label: `${m.id} · ${m.provider}` }));
  } catch {
    /* fallback sotto */
  }
  return [{ id: model.id, provider: model.provider, label: `${model.id} · ${model.provider}` }];
}

/**
 * Catalogo per la palette del browser: metadati dei comandi + valori ammessi
 * risolti adesso (i livelli di thinking dipendono dal modello attivo, i goal e
 * le pianificazioni dal loro stato corrente).
 */
function buildCommandCatalog() {
  const values = {
    thinking: supportedLevels(model),
    models: availableModels(),
    tabs: ["chat", "files", "goals", "cron"],
    goals: goals.map((g) => ({ id: g.id, label: `${g.title}${g.status === "done" ? " (fatto)" : ""}` })),
    crons: schedules.map((s) => ({ id: s.id, label: `${s.name} — ${s.schedule}${s.enabled ? "" : " (sospesa)"}` })),
  };
  const tag = (v) => (typeof v === "string" ? { id: v, label: v } : v);
  const commands = COMMANDS.map((c) => ({
    ...c,
    argsHint: c.params.map((p) => (p.optional || p.rest ? `[${p.name}]` : `<${p.name}>`)).join(" "),
    params: c.params.map((p) => {
      const dyn = p.dynamic ? (values[p.dynamic] || []).map(tag) : null;
      const vals = dyn || (p.values || []).map(tag);
      const extra = (p.extraValues || []).map(tag);
      return vals.length || extra.length ? { ...p, options: [...vals, ...extra] } : { ...p };
    }),
  }));
  return { commands, groups: COMMAND_GROUPS, tz: TZ_NAME };
}

/** Riga di stato leggibile per /status. */
function statusNotice() {
  const st = getState();
  const c = st.context || {};
  const pct = c.percent != null ? String(Math.round(c.percent)) : "–";
  return [
    `modello ${st.model.id} (${st.model.provider}) · thinking ${st.thinking.level}`,
    `contesto ${c.tokens != null ? c.tokens : "–"} / ${c.window || "–"} (${pct}%) · messaggi ${getState({ withMessages: true }).messages.length}`,
    `token ↑${st.tokens.input} ↓${st.tokens.output} · costo $${(st.cost || 0).toFixed(4)}`,
    `chat ${String(st.sessionId).slice(0, 8)}${st.sessionName ? ` “${st.sessionName}”` : ""} · subagent ${st.subagents.enabled ? `ON (max ${st.subagents.maxSpawns})` : "off"}`,
  ].join("\n");
}

/** Descrizione compatta di un goal per l'elenco di /goals. */
function goalLine(g) {
  const tot = (g.steps || []).length;
  const done = (g.steps || []).filter((s) => s.done).length;
  const ck = (g.checklist || []).length;
  const ckDone = (g.checklist || []).filter((c) => c.done).length;
  const bits = [`step ${done}/${tot}`];
  if (ck) bits.push(`checklist ${ckDone}/${ck}`);
  const mark = g.status === "done" ? "✅" : g.status === "archived" ? "🗄" : "•";
  return `${mark} [${g.id.slice(0, 8)}] ${g.title} — ${bits.join(", ")}`;
}

function scheduleLine(s, now = Date.now()) {
  const when = s.enabled && typeof s.nextRun === "number"
    ? `prossima ${new Date(s.nextRun).toLocaleString("it-IT", { timeZone: TZ_NAME })}`
    : s.enabled ? "prossima –" : "sospesa";
  const last = s.lastStatus ? ` · ultima ${s.lastStatus === "ok" ? "ok" : `errore (${s.lastError || "?"})`}` : "";
  return `• [${s.id.slice(0, 8)}] ${s.name} — \`${s.schedule}\` (${s.action}) — ${when}${last}`;
}

/** Id breve -> id completo, per evitare di dover copiare 16 caratteri. */
function resolveShortId(list, value, what = "elemento") {
  const v = String(value || "".trim());
  if (!v) throw new HttpError(400, `serve l'id del ${what}`);
  const exact = list.find((x) => x.id === v);
  if (exact) return exact.id;
  const matches = list.filter((x) => x.id.startsWith(v));
  if (matches.length === 1) return matches[0].id;
  if (!matches.length) throw new HttpError(404, `${what} non trovato: ${v}`);
  throw new HttpError(400, `id ambiguo: ${v} corrisponde a ${matches.length} ${what}`);
}

/**
 * Mappa comando -> azione reale sull'harness.
 * Ogni handler ritorna { message } (testo mostrato in chat) e opzionalmente
 * `state: true` per far ricalcolare lo stato al browser.
 */
const COMMAND_HANDLERS = {
  status: async () => ({ message: statusNotice(), refresh: true }),

  model: async ({ arg, report }) => {
    const id = String(arg || "").trim();
    if (!id) {
      const list = availableModels();
      return { message: `modello attuale: ${model.id} (${model.provider})\nmodelli usabili:\n${list.map((m) => `• ${m.id} · ${m.provider}`).join("\n")}` };
    }
    const match = availableModels().find((x) => x.id === id);
    const found =
      (match ? modelRuntime.getModel(match.provider, id) : undefined) ||
      modelRuntime.getModel("deepseek", id) ||
      modelRuntime.getModel(id.split("/")[0], id.split("/").slice(1).join("/"));
    if (!found) throw new HttpError(404, `modello non trovato: ${id}`);
    model = found;
    await session.setModel(found);
    const sup = supportedLevels(found);
    let extra = "";
    if (sup.length && !sup.includes(session.thinkingLevel)) {
      session.setThinkingLevel(sup[0]);
      extra = ` (thinking riportato a ${sup[0]})`;
    }
    report?.(`[model] -> ${found.id}`);
    return { message: `modello -> ${found.id} · ${found.provider}${extra}\nthinking supportati: ${sup.join(", ")}`, state: true, refresh: true };
  },

  think: async ({ arg }) => {
    const val = String(arg || "").trim();
    const supported = supportedLevels(model);
    if (!val) return { message: `thinking attuale: ${session.thinkingLevel}\nsupportati da ${model.id}: ${supported.join(", ")}` };
    if (val === "next") {
      if (!supported.length) return { message: `nessun livello supportato da ${model.id}` };
      const cur = supported.indexOf(session.thinkingLevel);
      const next = supported[(cur + 1) % supported.length];
      session.setThinkingLevel(next);
      return { message: `thinking -> ${next}`, state: true, refresh: true };
    }
    if (!ALL_LEVELS.includes(val)) throw new HttpError(400, `livello non valido. Usa: ${ALL_LEVELS.join(", ")} oppure next`);
    if (!supported.includes(val)) throw new HttpError(400, `livello non supportato da ${model.id}. Supportati: ${supported.join(", ")}`);
    session.setThinkingLevel(val);
    return { message: `thinking -> ${val}`, state: true, refresh: true };
  },

  subagents: async ({ arg, tokens }) => {
    if (!hasSubagentExt) throw new HttpError(400, "estensione subagent non disponibile");
    const val = String(arg || "").trim().toLowerCase();
    if (!val) return { message: `subagent: ${subagentsEnabled ? "ON" : "off"} · max ${maxSubagentSpawns} per richiesta${subagentsEnabled ? " (consumano token)" : ""}` };
    if (!["on", "off"].includes(val)) throw new HttpError(400, "usa /subagents on oppure /subagents off");
    subagentsEnabled = val === "on";
    applyToolGate();
    return { message: `subagent -> ${subagentsEnabled ? `ON (max ${maxSubagentSpawns})` : "off"}`, state: true, refresh: true };
  },

  "subagents-max": async ({ arg }) => {
    if (!hasSubagentExt) throw new HttpError(400, "estensione subagent non disponibile");
    const n = Number(String(arg || "").trim());
    if (!Number.isInteger(n) || n < 1 || n > 64) throw new HttpError(400, "il numero deve essere un intero tra 1 e 64");
    maxSubagentSpawns = n;
    applySubagentLimit();
    return { message: `subagent max -> ${n} per richiesta`, state: true, refresh: true };
  },

  browser: async ({ arg }) => {
    const available = ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name));
    if (!available) throw new HttpError(400, "tool browser non disponibile (agent-browser non registrato)");
    const val = String(arg || "").trim().toLowerCase();
    const who = process.env.DASH_BROWSER_USER || "pi-browser";
    const descr = () =>
      `\nmode: ${browserMode} (auto = acceso quando serve, si spegne da sé dopo ${browserIdleMinutes} min di inattività)\n` +
      `tool adesso: ${browserEnabled ? "ACCESO" : "spento"} · utente ${who}` +
      (browserLastActivity ? `\nultima attività: ${new Date(browserLastActivity).toLocaleTimeString("it-IT")}` : "");
    if (!val) return { message: `browser: ${browserEnabled ? "ON" : "off"}${descr()}` };
    if (!["on", "off", "auto", "status"].includes(val))
      throw new HttpError(400, "usa /browser on, /browser off, /browser auto oppure /browser status");
    if (val === "status") return { message: `browser: ${browserEnabled ? "ON" : "off"}${descr()}` };
    browserMode = val === "status" ? browserMode : val;
    saveBrowserPrefs();
    applyToolGate();
    return {
      message: `browser -> modo "${browserMode}" · tool ${browserEnabled ? "ACCESO" : "spento"}`,
      state: true,
      refresh: true,
    };
  },

  ask: async ({ arg }) => {
    if (!ASK_ENABLED) throw new HttpError(400, "le domande sono disattivate all'avvio (DASH_ASK=off)");
    const val = String(arg || "").trim().toLowerCase();
    const descr = () =>
      `\ntool: ${askToolEnabled() ? "ACCESO" : "spento"} · attesa massima 900 s (30-3600) · log: ${relative(ROOT, ASK_LOG_FILE)}` +
      (askBroker.snapshot().pending.length ? `\n⚠ ${askBroker.snapshot().pending.length} domanda in attesa di risposta` : "");
    if (!val || val === "status") {
      return { message: `domande all'utente: ${askToolEnabled() ? "ON" : "off"}${descr()}` };
    }
    if (!["on", "off"].includes(val)) throw new HttpError(400, "usa /ask on, /ask off oppure /ask status");
    askToolOn = val === "on";
    saveAskPrefs();
    if (!askToolOn) askBroker.cancelAll("domande disattivate");
    applyToolGate();
    return { message: `domande all'utente -> ${askToolEnabled() ? "ON" : "spento"}${descr()}`, state: true, refresh: true };
  },

  stop: async () => {
    if (!session.isStreaming) return { message: "nessuna risposta in corso" };
    try {
      session.abortRetry?.();
      session.abortBash?.();
      await session.abort();
    } catch (err) {
      throw new HttpError(500, `stop fallito: ${err?.message ?? err}`);
    }
    broadcast("status", { streaming: false, aborted: true });
    broadcast("state", getState());
    return { message: "⏹ generazione interrotta", refresh: true };
  },

  new: async ({ arg }) => {
    if (session?.isStreaming) throw new HttpError(409, "risposta in corso: usa /stop prima di aprire una nuova chat");
    await switchSession(newSessionManager());
    const title = String(arg || "").trim();
    if (title) session.sessionManager.appendSessionInfo(title.slice(0, 80));
    broadcast("state", getState());
    broadcast("sessions", await getSessionsPayload());
    return { message: `nuova chat${title ? ` “${title}”` : ""} aperta (${String(session.sessionId).slice(0, 8)})`, state: true, refresh: true };
  },

  rename: async ({ arg }) => {
    const name = String(arg || "").trim();
    if (!name) throw new HttpError(400, "serve un nome: /rename <nome>");
    session.sessionManager.appendSessionInfo(name.slice(0, 80));
    broadcast("state", getState());
    broadcast("sessions", await getSessionsPayload());
    return { message: `chat rinominata in “${name.slice(0, 80)}”`, state: true, refresh: true };
  },

  compact: async ({ arg }) => {
    if (session.isCompacting) throw new HttpError(409, "compattazione già in corso");
    if (!session.isIdle) throw new HttpError(409, "l'agente sta lavorando: attendi o usa /stop");
    const instructions = String(arg || "").trim();
    broadcast("status", { compacting: true });
    try {
      const out = await session.compact(instructions || undefined);
      const win = model.contextWindow ?? null;
      const tokensAfter = out?.estimatedTokensAfter ?? null;
      if (tokensAfter != null) compactEstimate = { tokens: tokensAfter, window: win, at: Date.now() };
      broadcast("state", getState());
      broadcast("sessions", await getSessionsPayload());
      broadcast("status", { compacting: false });
      return {
        message: `contesto compattato: ${out?.tokensBefore ?? "?"} -> ${tokensAfter ?? "?"} token stimati`,
        state: true,
        refresh: true,
      };
    } catch (err) {
      broadcast("status", { compacting: false });
      const msg = err?.message || String(err);
      const precondition = /nothing to compact|too small|not enough|too few/i.test(msg);
      throw new HttpError(precondition ? 400 : 500, msg);
    }
  },

  goals: async () => ({
    message: goals.length
      ? `goal (${goals.length}):\n${goals.map(goalLine).join("\n")}`
      : "nessun goal salvato: creane uno con /goal <testo>",
  }),

  goal: async ({ arg }) => {
    const title = String(arg || "").trim();
    if (!title) throw new HttpError(400, "serve il testo del goal: /goal <testo>");
    const goal = normalizeGoal({ title });
    goals.push(goal);
    await saveGoals();
    broadcast("goals", { goals });
    return { message: `goal creato [${goal.id.slice(0, 8)}] ${goal.title}`, state: true, refresh: true };
  },

  "goal-run": async ({ arg }) => {
    const id = resolveShortId(goals, arg, "goal");
    const g = goals.find((x) => x.id === id);
    if (session.isStreaming) throw new HttpError(409, "già in streaming: attendi o usa /stop");
    const prompt = goalExecutionPrompt(g, "all");
    session.prompt(prompt).catch((err) => {
      broadcast("error", { message: err?.message ?? String(err) });
      broadcast("status", { streaming: false });
    });
    return { message: `goal “${g.title}” passato all'agente`, refresh: true };
  },

  "goal-done": async ({ arg }) => {
    const id = resolveShortId(goals, arg, "goal");
    const idx = goals.findIndex((x) => x.id === id);
    const g = { ...goals[idx], status: "done", updatedAt: Date.now() };
    g.steps = (g.steps || []).map((s) => ({ ...s, done: true }));
    g.checklist = (g.checklist || []).map((c) => ({ ...c, done: true }));
    goals[idx] = g;
    await saveGoals();
    broadcast("goals", { goals });
    return { message: `goal “${g.title}” segnato come completato`, state: true, refresh: true };
  },

  crons: async () => ({
    message: schedules.length
      ? `pianificazioni (${schedules.length}, fuso ${TZ_NAME}):\n${schedules.map((s) => scheduleLine(s)).join("\n")}`
      : "nessuna pianificazione: creane una con /cron \"<expr>\" <nome> <prompt>",
  }),

  cron: async ({ tokens }) => {
    // Sintassi: /cron "<min ora giorno mese dow>" <nome> <prompt>
    // Tolleranza: accettiamo anche l'espressione senza virgolette (5 campi cron).
    let toks = (tokens || []).slice();
    let expr = toks.shift();
    const candidate = [expr, ...toks].slice(0, 5).join(" ");
    if (expr && toks.length >= 4) {
      try {
        parseCron(candidate);
        toks = toks.slice(4);
        expr = candidate;
      } catch {
        /* resta l'interpretazione con virgolette */
      }
    }
    const [name, ...rest] = toks;
    if (!expr || !name || !rest.length)
      throw new HttpError(400, 'uso: /cron "<min ora giorno mese dow>" <nome> <prompt>  — es. /cron "0 8 * * 1-5" buongiorno riassumi le novità');
    const job = normalizeSchedule({ name, schedule: expr, action: "prompt", prompt: rest.join(" ") });
    schedules.push(job);
    await saveSchedules();
    broadcast("schedule", { schedules, running: schedulerRunning });
    return {
      message: `pianificazione creata [${job.id.slice(0, 8)}] ${job.name} — \`${job.schedule}\` — prossima ${new Date(job.nextRun).toLocaleString("it-IT", { timeZone: TZ_NAME })}`,
      state: true,
      refresh: true,
    };
  },

  "cron-run": async ({ arg }) => {
    const id = resolveShortId(schedules, arg, "pianificazione");
    const job = schedules.find((x) => x.id === id);
    if (schedulerRunning) throw new HttpError(409, "una pianificazione è già in esecuzione");
    if (session.isStreaming) throw new HttpError(409, "risposta in corso nella chat: attendi o usa /stop");
    runSchedule(job, { manual: true }).catch((e) => broadcast("error", { message: e?.message ?? String(e) }));
    return { message: `pianificazione “${job.name}” avviata… (esito in chat e nella scheda Cron)`, refresh: true };
  },

  "cron-toggle": async ({ arg }) => {
    const id = resolveShortId(schedules, arg, "pianificazione");
    const job = schedules.find((x) => x.id === id);
    job.enabled = !job.enabled;
    job.updatedAt = Date.now();
    if (job.enabled) {
      try {
        job.nextRun = computeNextRun(job, new Date());
      } catch (e) {
        job.enabled = false;
        throw new HttpError(400, `impossibile attivare: ${e?.message || e}`);
      }
    }
    await saveSchedules();
    broadcast("schedule", { schedules, running: schedulerRunning });
    return { message: `pianificazione “${job.name}” -> ${job.enabled ? "attiva" : "sospesa"}`, state: true, refresh: true };
  },

  "cron-del": async ({ arg }) => {
    const id = resolveShortId(schedules, arg, "pianificazione");
    const job = schedules.find((x) => x.id === id);
    schedules = schedules.filter((s) => s.id !== id);
    await saveSchedules();
    await fs.rm(join(SCHEDULE_LOG_DIR, `${id.replace(/[^\w.-]/g, "_")}.log`), { force: true }).catch(() => {});
    broadcast("schedule", { schedules, running: schedulerRunning });
    return { message: `pianificazione “${job.name}” eliminata`, state: true, refresh: true };
  },
};

/** Normalizza il nome del comando (alias -> nome canonico). */
function canonicalCommand(name) {
  const cmd = findCommand(name);
  return cmd ? cmd.name : null;
}

/**
 * Esegue un comando server-side e ritorna un oggetto serializzabile.
 * I comandi client non arrivano qui (li esegue il browser).
 */
async function executeCommand(line) {
  const parsed = parseCommandLine(line);
  if (!parsed) throw new HttpError(400, "la riga non è un comando (deve iniziare con /)");
  const spec = findCommand(parsed.name);
  if (!spec) throw new HttpError(404, `comando sconosciuto: /${parsed.name} — usa /help`);
  if (spec.client) throw new HttpError(400, `/${spec.name} è un comando dell'interfaccia: eseguilo dal browser`);
  const handler = COMMAND_HANDLERS[spec.name];
  if (!handler) throw new HttpError(501, `comando non implementato: /${spec.name}`);
  const notes = [];
  const out = (await handler({ arg: parsed.arg, tokens: parsed.tokens, report: (m) => notes.push(m) })) || {};
  return { name: spec.name, ok: true, message: String(out.message || "fatto"), notes, state: !!out.state };
}

// ---- skill (Agent Skills: Claude Code e OpenAI/Codex) --------------------
// Ogni skill è una sottocartella di SKILLS_DIR con un SKILL.md (frontmatter
// YAML: name + description obbligatori). Il motore di pi le carica, le elenca
// nel system prompt e le espande con /skill:nome. Qui aggiungiamo solo la
// gestione (crea/carica/elimina) e l'aggiornamento a caldo della sessione.

const SKILL_NAME_RE = /^[a-z0-9-]+$/;
const SKILL_MAX_NAME = 64;
const SKILL_MAX_DESC = 1024;
/** Limite dell'archivio .zip per importare una skill completa. */
const ZIP_MAX = 8 * 1024 * 1024;

/** Normalizza un nome skill in forma valida (minuscolo, trattini). */
function slugifySkillName(raw) {
  return String(raw || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, SKILL_MAX_NAME);
}

/** Errori di validazione del nome (vuoto se ok). */
function skillNameErrors(name) {
  const errs = [];
  if (!name) errs.push("nome mancante");
  else if (name.length > SKILL_MAX_NAME) errs.push(`nome oltre ${SKILL_MAX_NAME} caratteri`);
  else if (!SKILL_NAME_RE.test(name)) errs.push("solo minuscole, numeri e trattini");
  else if (name.startsWith("-") || name.endsWith("-")) errs.push("non può iniziare/finire con un trattino");
  else if (name.includes("--")) errs.push("non può contenere trattini consecutivi");
  return errs;
}

/** Estrae nome/descrizione dal contenuto di un SKILL.md (frontmatter tollerante). */
function extractSkillMeta(content, fallbackName) {
  const text = String(content || "").replace(/^\uFEFF/, "");
  let body = text;
  let fm = "";
  if (/^---[ \t]*\r?\n/.test(text)) {
    const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
    if (m) {
      fm = m[1];
      body = text.slice(m[0].length);
    }
  }
  const meta = {};
  for (const rawLine of fm.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const kv = /^([\w-]+)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    meta[kv[1].trim().toLowerCase()] = kv[2].trim();
  }
  const name = meta.name || meta.title || "";
  let description = meta.description || meta.summary || "";
  if (!description.trim()) {
    // fallback: prima riga non vuota del corpo
    const first = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#"));
    if (first) description = first;
  }
  return {
    name: slugifySkillName(name || fallbackName),
    description: description.trim().slice(0, SKILL_MAX_DESC),
    body: body.trim(),
  };
}

/**
 * Rende tollerante il frontmatter di una skill importata.
 *
 * Le skill scritte a mano (o esportate da altri strumenti) hanno spesso la description NON
 * quotata: se contiene ": " il frontmatter diventa YAML invalido
 * ("nested mappings are not allowed in compact mappings") e la skill non viene caricata,
 * senza un errore evidente. Qui si quota solo quando serve, senza toccare i valori
 * già quotati o i blocchi multilinea.
 */
function sanitizeSkillFrontmatter(content) {
  const m = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return content;
  // Nota: la regex cattura il valore DOPO averlo trimmato. Un vecchio lookahead
  // `(?!(?:"|'|\||>))` seguito da [ \t]* faceva backtracking sullo spazio e
  // riquotava anche i valori già quotati ("a: b" → "\"a: b\""), con le
  // virgolette che poi finivano dentro la description letta da pi.
  const fixed = m[1].replace(/^([A-Za-z_-]+):[ \t]*([\s\S]*?)[ \t]*$/gm, (all, key, val) => {
    if (!/^(name|description)$/i.test(key)) return all;
    const v = val.trim();
    if (!v) return all;
    if (/^["'|>]/.test(v)) return all; // già quotato o block scalar: non toccare
    if (/:\s/.test(v) || /\s#/.test(v) || /^[\[{]/.test(v)) return `${key}: ${JSON.stringify(v)}`;
    return all;
  });
  return content.replace(m[1], fixed);
}

/** Genera il contenuto di un SKILL.md da nome/descrizione/istruzioni. */
function buildSkillFile(name, description, body) {
  const cleanDesc = String(description || "").trim().slice(0, SKILL_MAX_DESC).replace(/\r\n/g, "\n");
  // La descrizione va QUOTATA. Senza virgolette, una descrizione che contiene ": " rende il
  // frontmatter YAML invalido ("nested mappings are not allowed in compact mappings") e la
  // skill NON viene caricata: un guasto silenzioso, visibile solo come warning.
  // JSON.stringify produce una stringa con doppi apici già correttamente escaperata, che è
  // YAML valido a tutti gli effetti.
  return `---\nname: ${name}\ndescription: ${JSON.stringify(cleanDesc)}\n---\n\n${String(body || "").trim()}\n`;
}

/** Errore con codice HTTP, per le rotte che rispondono { error }. */function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * Vero se il buffer sembra testo (nessun NUL e UTF-8 che si rilegge identico).
 * Serve a non scrivere un archivio binario dentro SKILL.md: succedeva caricando
 * una skill esportata con estensione .skill/.zip dall'upload dei file singoli,
 * con il risultato di una skill illeggibile (warning "description is required").
 */
function isProbablyText(buf) {
  const b = buf.length > 1024 * 1024 ? buf.subarray(0, 1024 * 1024) : buf;
  if (b.includes(0)) return false;
  return Buffer.compare(Buffer.from(b.toString("utf8"), "utf8"), b) === 0;
}

/** Vero se il buffer è un archivio ZIP (o un .skill esportato, che è uno ZIP). */
function isZipBuffer(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07);
}

/**
 * Importa una skill COMPLETA da un archivio ZIP (.zip oppure .skill, che è lo
 * stesso formato): cartella con SKILL.md più file di supporto (references/,
 * scripts/, esempi). Usata sia da /api/skills/upload-zip sia dall'upload dei
 * file singoli quando il file caricato è un archivio.
 */
async function importSkillZip(buffer, requested) {
  let entries;
  try {
    entries = extractZip(buffer);
  } catch (e) {
    throw httpError(400, String(e?.message || e));
  }
  // percorsi sanificati: fuori restano "..", percorsi assoluti, .git, strutture troppo profonde
  const files = [];
  for (const e of entries) {
    const safe = safeEntryPath(e.name);
    if (safe) files.push({ name: safe, data: e.data });
  }
  if (!files.length) throw httpError(400, "nessun file utilizzabile nell'archivio");

  // Se l'archivio ha una sola cartella radice (es. mia-skill/SKILL.md) la si toglie,
  // perché è il modo in cui vengono confezionate le skill esportate.
  const primi = new Set(files.map((f) => f.name.split("/")[0]));
  const unaCartella =
    primi.size === 1 && files.every((f) => f.name.includes("/")) && !files.some((f) => f.name === "SKILL.md");
  const norm = files.map((f) => ({ ...f, name: unaCartella ? f.name.split("/").slice(1).join("/") : f.name }));

  const entry = norm.find((f) => f.name.toLowerCase() === "skill.md");
  if (!entry) throw httpError(400, "nella cartella non c'è SKILL.md");
  // frontmatter reso tollerante: una description con ": " non deve rendere la skill invisibile
  const content = sanitizeSkillFrontmatter(entry.data.toString("utf8"));
  entry.data = Buffer.from(content, "utf8");
  const fallback = requested || (unaCartella ? [...primi][0] : "skill");
  const meta = extractSkillMeta(content, fallback);
  if (!meta.description) {
    throw httpError(400, "manca la description nel frontmatter di SKILL.md (o una prima riga di testo)");
  }
  const nameErrs = skillNameErrors(meta.name);
  if (nameErrs.length) throw httpError(400, `nome skill non valido "${meta.name}": ${nameErrs.join("; ")}`);

  const dir = join(SKILLS_DIR, meta.name);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  let scritti = 0;
  for (const f of norm) {
    const dest = join(dir, f.name);
    // cintura e bretelle: il percorso finale deve restare dentro la cartella della skill
    if (!isUnder(dest, dir)) continue;
    await fs.mkdir(dirname(dest), { recursive: true });
    await fs.writeFile(dest, f.data);
    scritti++;
  }
  await reloadSkills();
  return { name: meta.name, files: scritti, ...skillsPayload() };
}

/**
 * Statistiche leggere di una cartella (numero file e byte totali).
 * Serve alla card della skill: "apri" mostra solo SKILL.md, il conteggio fa capire
 * subito che la skill ha anche references/, scripts/, esempi, ecc.
 */
function dirStats(dir, { maxFiles = 5000 } = {}) {
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (files >= maxFiles) return;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        files++;
        try {
          bytes += statSync(p).size;
        } catch {
          /* file sparito nel frattempo */
        }
      }
    }
  };
  walk(dir);
  return { files, bytes };
}

/** Elenco skill (dalla cache del resource loader) + diagnostica + dir. */
/**
 * Consigli sulle regole delle Agent Skills (https://agentskills.io/specification e le guide di
 * Claude Code / Codex): `name` e `description` sono ciò che il modello vede SEMPRE, il corpo
 * viene letto solo quando la skill serve. Una descrizione senza «quando usarla» rischia di non
 * attivare mai la skill; un corpo lunghissimo costa contesto a ogni uso.
 * Restituisce un elenco di avvisi leggibili (vuoto = tutto a posto); gli stessi controlli stanno
 * in `media/check-skills.mjs`, così restano verificati a ogni suite.
 */
function consigliSkill(raw) {
  const avvisi = [];
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const fm = m ? m[1] : "";
  const corpo = m ? raw.slice(m[0].length) : raw;
  const dm = fm.match(/^description:\s*([\s\S]*?)(?=\n[a-zA-Z-]+:|\s*$)/m);
  const desc = dm ? dm[1].trim() : "";
  if (desc && !/(usa quando|usala quando|usa per|serve a|use when|attiva quando|ogni volta che|quando\b)/i.test(desc))
    avvisi.push("descrizione senza «quando usarla»: il modello potrebbe non attivarla mai");
  if (/<[^>]+>/.test(desc)) avvisi.push("la descrizione non deve contenere tag < >");
  const righe = corpo.split("\n").filter((r) => r.trim()).length;
  if (righe > 400) avvisi.push(`corpo lungo (${righe} righe): valuta di spostare i dettagli in references/`);
  if (!/^\s*#\s+\S/m.test(corpo)) avvisi.push("manca un titolo (# …) all'inizio del corpo");
  // i riferimenti a file inesistenti li controlla il test, che conosce la cartella della skill
  return { avvisi, righe, descrizioneCaratteri: desc.length };
}

function skillsPayload() {
  const loaded = resourceLoader.getSkills();
  return {
    dir: SKILLS_DIR,
    skills: loaded.skills.map((s) => {
      // la "cartella della skill" è quella che contiene il suo SKILL.md
      const dir = dirname(s.filePath);
      const inside = s.filePath.startsWith(SKILLS_DIR + sep);
      const stats = inside ? dirStats(dir) : null;
      // gli avvisi si calcolano leggendo il file: poche righe, una volta per richiesta
      let info = { avvisi: [], righe: null, descrizioneCaratteri: String(s.description || "").length };
      try {
        info = consigliSkill(readFileSync(s.filePath, "utf8"));
      } catch {
        /* file non leggibile: nessun avviso inventato */
      }
      return {
        name: s.name,
        description: s.description,
        filePath: s.filePath,
        baseDir: s.baseDir,
        rel: relative(SKILLS_DIR, s.filePath),
        rootRel: relative(ROOT, s.filePath),
        // utili alla scheda skill: quanti file compongono la skill e dove stanno
        dirRootRel: inside ? relative(ROOT, dir) : null,
        fileCount: stats ? stats.files : null,
        sizeBytes: stats ? stats.bytes : null,
        writable: s.filePath.startsWith(SKILLS_DIR + sep),
        disableModelInvocation: !!s.disableModelInvocation,
        // regole delle Agent Skills applicate alla scheda
        righeCorpo: info.righe,
        descrizioneCaratteri: info.descrizioneCaratteri,
        avvisi: info.avvisi,
      };
    }),
    diagnostics: loaded.diagnostics || [],
  };
}

/**
 * Rende effettive le skill appena modificate: aggiorna la lista (per
 * /skill:nome) e ricostruisce il system prompt della sessione attiva senza
 * cambiare chat. session.reload() mantiene la storia e ricostruisce il runtime
 * delle estensioni in modo pulito.
 */
async function reloadSkills() {
  resourceLoader.extendResources({
    skillPaths: [
      { path: SKILLS_DIR, metadata: { source: "dashboard", scope: "project", origin: "top-level", baseDir: SKILLS_DIR } },
    ],
  });
  if (session?.isIdle) {
    await session.reload();
    // il reload ricostruisce i tool: risincronizza i flag locali e riapplica il gate
    ALL_TOOLS = allToolsOf(session);
    hasSubagentExt = ALL_TOOLS.some((t) => SUBAGENT_TOOL_NAMES.has(t.name));
    applyToolGate();
  }
  broadcast("skills", skillsPayload());
  broadcast("state", getState());
}

// ---- skill modificate da fuori -------------------------------------------
// Le skill si leggono UNA volta all'avvio (resourceLoader.reload() più sopra) e restano in
// cache: una skill creata da shell, da git o da un'altra sessione restava invisibile nella
// scheda Skill e fuori dal system prompt fino al riavvio del servizio o al cambio di chat.
// `reloadSkills()` (dall'editor) non basta: rifonde i percorsi già noti e non riscansiona la
// cartella, quindi non vede una skill NUOVA. Qui un watcher su skills/ applica la ricarica
// completa, con debounce e mai a metà di una risposta: `resourceLoader.reload()` azzera la
// cache delle estensioni, e applicarlo mentre l'agente lavora invaliderebbe i tool della
// sessione viva.
// `DASH_SKILLS_WATCH_MS=0` spegne il watcher (resta il controllo periodico).
const rawSkillsWatch = Number(process.env.DASH_SKILLS_WATCH_MS ?? 700);
const SKILLS_WATCH_MS =
  Number.isFinite(rawSkillsWatch) && rawSkillsWatch <= 0 ? 0 : Math.max(150, rawSkillsWatch || 700);

/**
 * Firma della cartella skills/: percorsi, mtime e dimensioni. Serve al controllo periodico,
 * che interviene quando `fs.watch` ha perso un evento (filesystem di rete, coda di eventi
 * in overflow, scritture esotiche): senza di esso una skill resterebbe invisibile fino al
 * riavvio. Costo: una camminata della cartella (poche decine di file), trascurabile.
 */
function skillsSignature() {
  const voci = [];
  const cammina = (dir, prefisso) => {
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // cartella assente o illeggibile: la firma resta quella che è
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefisso ? `${prefisso}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        voci.push(`${rel}/`); // la cartella conta: crearla o rimuoverla cambia la firma
        cammina(join(dir, e.name), rel);
      } else if (e.isFile()) {
        try {
          const st = statSync(join(dir, e.name));
          voci.push(`${rel}:${Math.round(st.mtimeMs)}:${st.size}`);
        } catch {
          /* file sparito nel frattempo */
        }
      }
    }
  };
  cammina(SKILLS_DIR, "");
  return voci.join("|");
}

/** Ricarica completa delle skill: la cartella viene riletta, non rifusa. */
async function reloadSkillsFromDisk(motivo = "cambio su disco") {
  if (skillsReloading) return;
  if (turnActive) {
    // Mai a metà risposta: si applica appena il turno finisce (vedi agent_end).
    skillsReloadPending = true;
    return;
  }
  skillsReloading = true;
  try {
    await refreshExtensionRuntime(); // resourceLoader.reload(): rilegge anche skills/
    if (session?.isIdle) {
      await session.reload();
      ALL_TOOLS = allToolsOf(session);
      hasSubagentExt = ALL_TOOLS.some((t) => SUBAGENT_TOOL_NAMES.has(t.name));
      applyToolGate();
    }
    broadcast("skills", skillsPayload());
    skillsSignatureNota = skillsSignature();
    const nomi = resourceLoader.getSkills().skills.map((s) => s.name);
    console.log(`[skills] ricaricate (${motivo}): ${nomi.join(", ") || "(nessuna)"}`);
  } catch (e) {
    console.error("[skills] ricarica fallita:", e?.message || e);
  } finally {
    skillsReloading = false;
  }
}

/** Accumula i cambiamenti ravvicinati (un salvataggio genera più eventi) in una sola ricarica. */
function scheduleSkillsReload(motivo = "cambio su disco") {
  if (skillsWatchTimer) clearTimeout(skillsWatchTimer);
  skillsWatchTimer = setTimeout(() => {
    skillsWatchTimer = null;
    void reloadSkillsFromDisk(motivo);
  }, SKILLS_WATCH_MS);
  skillsWatchTimer.unref?.();
}

/** Osserva skills/ e ricarica quando qualcosa cambia (formato di ogni skill: cartella + SKILL.md). */
function startSkillsWatcher() {
  if (SKILLS_WATCH_MS <= 0) {
    console.log("[skills] watcher disattivato (DASH_SKILLS_WATCH_MS=0)");
    return;
  }
  const onError = (e) => console.error("[skills] watcher:", e?.message || e);
  try {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  } catch {
    /* verrà creata al primo salvataggio */
  }
  // Nota: `fs` qui è node:fs/promises, il cui watch() non è un EventEmitter (non ha .on):
  // serve watch() da node:fs, importato come watchFs.
  const osserva = (dir, options) => {
    try {
      const w = watchFs(dir, options, () => scheduleSkillsReload());
      w.on("error", onError);
      skillsWatchers.push(w);
      return true;
    } catch (e) {
      console.error(`[skills] watcher non attivabile su ${dir}:`, e?.message || e);
      return false;
    }
  };
  // Ricorsivo dove la piattaforma lo supporta (Linux da Node 20); altrimenti radice +
  // sottocartelle di primo livello, che bastano per creare/rimuovere una skill.
  if (!osserva(SKILLS_DIR, { recursive: true, persistent: false })) {
    osserva(SKILLS_DIR, { persistent: false });
    try {
      for (const d of fs.readdirSync(SKILLS_DIR, { withFileTypes: true })) {
        if (d.isDirectory()) osserva(join(SKILLS_DIR, d.name), { persistent: false });
      }
    } catch {
      /* niente */
    }
  }
  console.log(`[skills] watcher attivo su ${SKILLS_DIR}`);
}

/**
 * Rete di sicurezza: confronta la firma della cartella a intervalli regolari e ricarica se
 * qualcosa è cambiato senza che il watcher lo abbia segnalato. La firma viene aggiornata
 * solo quando una ricarica è davvero avvenuta, quindi un tentativo rinviato (turno aperto)
 * viene ritentato al giro successivo.
 */
function startSkillsPoll() {
  const ogni = Number(process.env.DASH_SKILLS_POLL_MS ?? 60_000);
  if (!Number.isFinite(ogni) || ogni <= 0) {
    console.log("[skills] controllo periodico disattivato (DASH_SKILLS_POLL_MS=0)");
    return;
  }
  const passo = Math.max(5000, ogni);
  skillsSignatureNota ??= skillsSignature();
  const timer = setInterval(() => {
    const ora = skillsSignature();
    if (ora === skillsSignatureNota) return;
    scheduleSkillsReload("differenza rilevata dal controllo periodico");
  }, passo);
  timer.unref?.();
  console.log(`[skills] controllo periodico di sicurezza ogni ${Math.round(passo / 1000)}s`);
}

// ---- ricerca, export, file statici --------------------------------------
const SEARCH_LIMIT = Number(process.env.DASH_SEARCH_LIMIT) || 200; // righe trovate nei file
const SEARCH_MAX_FILE = 2 * 1024 * 1024; // file piu' grandi di cosi' non vengono scansionati
const SEARCH_MAX_FILES = 4000; // tetto di file scansionati per ricerca
const SEARCH_TIME_MS = 8000; // budget di tempo per ricerca
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".cache", ".npm", ".venv", "venv", "__pycache__",
  "dist", "build", ".next", "vendor", "backups",
]);

/** Invia un file statico (con guardia: deve stare nella root o in assets/). */
function sendFile(res, absPath, { mime, download, noStore = false, headers = {} } = {}) {
  let st;
  try {
    st = require_statSync(absPath);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const head = {
    "Content-Type": mime || mimeOf(absPath),
    "Content-Length": st.size,
    "Cache-Control": noStore ? "no-store" : "public, max-age=3600",
    ...headers,
  };
  if (download) head["Content-Disposition"] = `attachment; filename="${basename(absPath).replace(/"/g, "")}"`;
  res.writeHead(200, head);
  createReadStream(absPath).pipe(res);
}

/**
 * Formato di un'immagine dai PRIMI BYTE del file (magic number), non dall'estensione.
 * Serve a due cose: non far scaricare al browser un file che finge di essere una foto (un HTML
 * rinominato .png), e dare il Content-Type giusto all'anteprima. L'SVG è escluso di proposito:
 * è un documento con scripting, e passa dalla via sanificata del blocco ```svg.
 */
function sniffImageMime(buf) {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && (buf.subarray(0, 6).toString("latin1") === "GIF87a" || buf.subarray(0, 6).toString("latin1") === "GIF89a")) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.length >= 2 && buf.subarray(0, 2).toString("latin1") === "BM") return "image/bmp";
  // AVIF/HEIC: contenitore ISO-BMFF, "ftyp" al byte 4 con brand avif/heic
  if (buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (brand.startsWith("avif")) return "image/avif";
    if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("mif1")) return "image/heic";
  }
  return null;
}

/** Vero se il file ha l'aria di un documento SVG (per rimandare al blocco dedicato). */
function looksLikeSvg(buf) {
  const testa = buf.subarray(0, 300).toString("utf8").toLowerCase();
  return testa.includes("<svg") || (testa.includes("<?xml") && testa.includes("svg"));
}

/** Tetto per l'anteprima di un'immagine in chat: oltre, si mostra il percorso come testo. */
const IMAGE_MAX_BYTES =
  Number(process.env.DASH_IMAGE_MAX_BYTES) > 0 ? Number(process.env.DASH_IMAGE_MAX_BYTES) : 40 * 1024 * 1024;

import { statSync as require_statSync } from "node:fs";

/** Legge un file JSONL di sessione e restituisce gli entry del ramo attivo. */
async function readSessionBranch(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const entries = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* riga corrotta: ignora */
    }
  }
  const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e]));
  const chain = [];
  let cur = entries[entries.length - 1];
  const guard = new Set();
  while (cur && cur.id && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
  chain.reverse();
  return { entries: chain, all: entries };
}

/** Meta di una sessione (nome, data, percorso file) dato il suo id. */
async function findSessionById(id) {
  const list = await SessionManager.list(cwd(), SESSION_DIR);
  return list.find((s) => s.id === String(id)) || null;
}

/** Markdown della conversazione, pronto da scaricare/leggere. */
function messagesToMarkdown(messages, meta = {}) {
  const out = [];
  out.push(`# ${meta.title || "Conversazione pi"}`, "");
  const info = [];
  if (meta.date) info.push(`data: ${new Date(meta.date).toLocaleString("it-IT")}`);
  if (meta.model) info.push(`modello: ${meta.model}`);
  info.push(`${messages.length} messaggi`);
  out.push(`> _${info.join(" · ")}_`, "", "---", "");
  for (const m of messages) {
    if (!m) continue;
    if (m.role === "user") {
      out.push("### 👤 utente", "", m.text || "_(solo allegati)_", "");
      for (const a of m.attachments || []) out.push(`- 📎 allegato: \`${a.path || a.name}\``);
      if (m.images?.length) out.push(`- 🖼 ${m.images.length} immagine/i`);
      if (m.attachments?.length || m.images?.length) out.push("");
      continue;
    }
    out.push("### 🤖 pi", "");
    if (m.tools?.length) {
      for (const t of m.tools) {
        const bits = [`\`${t.name}\``];
        if (t.command) bits.push(`\`${String(t.command).slice(0, 200)}\``);
        if (t.path) bits.push(`\`${t.path}\``);
        out.push(`- 🔧 ${bits.join(" — ")}`);
      }
      out.push("");
    }
    if (m.error) out.push(`> ⚠️ ${m.error}`, "");
    out.push(m.text || "_(nessun testo)_", "");
  }
  return out.join("\n");
}

/** Cerca una stringa in tutte le chat salvate (JSONL). */
async function searchSessions(q) {
  const needle = q.toLowerCase();
  const list = await SessionManager.list(cwd(), SESSION_DIR);
  const out = [];
  for (const s of list) {
    if (!s.messageCount) continue;
    let raw;
    try {
      raw = await fs.readFile(s.path, "utf8");
    } catch {
      continue;
    }
    let hits = 0;
    const snippets = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      if (!line.toLowerCase().includes(needle)) continue;
      hits += 1;
      if (snippets.length >= 3) continue;
      let text = line;
      try {
        const o = JSON.parse(line);
        const c = o?.message?.content;
        text =
          typeof c === "string"
            ? c
            : Array.isArray(c)
              ? c.map((b) => b.text || b.thinking || "").filter(Boolean).join(" ")
              : o?.name || o?.type || line;
      } catch {
        /* riga non JSON: uso il testo grezzo */
      }
      text = String(text).replace(/\s+/g, " ").trim();
      const i = text.toLowerCase().indexOf(needle);
      if (i < 0) {
        snippets.push({ before: text.slice(0, 140), match: "", after: "" });
        continue;
      }
      snippets.push({
        before: text.slice(Math.max(0, i - 60), i),
        match: text.slice(i, i + needle.length),
        after: text.slice(i + needle.length, i + needle.length + 90),
      });
    }
    if (hits) {
      out.push({
        id: s.id,
        name: s.name || null,
        modified: s.modified,
        messageCount: s.messageCount,
        hits,
        snippets,
      });
    }
  }
  return out
    .sort((a, b) => b.hits - a.hits || new Date(b.modified) - new Date(a.modified))
    .slice(0, 40);
}

/** Cerca una stringa nei file sotto la root (esclusi node_modules, .git, binari…). */
async function searchFiles(q, startRel) {
  const needle = q.toLowerCase();
  const startAbs = await safeResolve(startRel || "");
  const results = [];
  const t0 = Date.now();
  let scanned = 0;
  let truncated = false;
  const stack = [startAbs];
  while (stack.length) {
    if (results.length >= SEARCH_LIMIT || scanned >= SEARCH_MAX_FILES || Date.now() - t0 > SEARCH_TIME_MS) {
      truncated = true;
      break;
    }
    const dir = stack.pop();
    let ents;
    try {
      ents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of ents) {
      if (results.length >= SEARCH_LIMIT) {
        truncated = true;
        break;
      }
      const abs = join(dir, d.name);
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name) && !d.name.startsWith(".")) stack.push(abs);
        continue;
      }
      if (!d.isFile()) continue;
      let st;
      try {
        st = await fs.stat(abs);
      } catch {
        continue;
      }
      if (st.size > SEARCH_MAX_FILE) continue;
      scanned += 1;
      let buf;
      try {
        buf = await fs.readFile(abs);
      } catch {
        continue;
      }
      if (buf.subarray(0, 4096).includes(0)) continue; // binario
      const text = buf.toString("utf8");
      if (!text.toLowerCase().includes(needle)) continue;
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const col = lines[i].toLowerCase().indexOf(needle);
        if (col < 0) continue;
        results.push({
          path: relative(ROOT, abs),
          line: i + 1,
          col,
          text: lines[i].trim().slice(0, 240),
        });
        if (results.length >= SEARCH_LIMIT) {
          truncated = true;
          break;
        }
      }
    }
  }
  return { results, scanned, truncated, ms: Date.now() - t0 };
}

// ---- HTTP helpers -------------------------------------------------------
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "corpo troppo grande"));
        req.destroy();
        return;
      }
      data += c;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

function json(res, code, obj) {
  // Se la risposta è GIÀ partita non si possono riscrivere gli header: `writeHead` solleverebbe
  // ERR_HTTP_HEADERS_SENT. Succede quando un errore nasce DOPO l'apertura di una risposta
  // (tipicamente lo stream SSE in /events) e finisce in errorResponse: senza questa guardia
  // l'eccezione nasceva dentro il `catch`, diventava un rejection non gestito e **il processo
  // Node terminava** (verificato: una sola connessione SSE con lo stato non calcolabile
  // spegneva il servizio; con systemd Restart=always si entrava in ciclo).
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* risposta già chiusa */
    }
    return;
  }
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function errorResponse(res, err) {
  const code = err instanceof HttpError ? err.code : 500;
  if (code === 500) console.error("[dashboard]", err);
  // L'errore si registra SEMPRE; se la risposta è già partita (stream aperto) `json` chiude
  // senza riscrivere gli header, invece di far morire il processo.
  json(res, code, { error: err?.message ?? String(err) });
}

/**
 * Header `Content-Disposition` per un nome di file arbitrario.
 *
 * Le virgolette e i caratteri di controllo non possono entrare in `filename="…"`: una cartella
 * chiamata `cart"ella` produceva l'header malformato `filename="cart"ella.zip"` (il ramo dei
 * file le toglieva, quello delle cartelle no). I nomi non ASCII vanno inoltre annunciati con la
 * forma RFC 5987 (`filename*`), che i browser moderni preferiscono.
 */
function contentDisposition(name) {
  const clean = String(name || "download").replace(/[\u0000-\u001f\u007f"\\/]/g, "_").trim() || "download";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_") || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

// ---- prompt con allegati -------------------------------------------------
/**
 * Prepara il testo inviato al modello partendo dal testo utente + allegati:
 * i file diventano percorsi assoluti in un blocco <<ALLEGATI>>, le immagini
 * supportate dal modello vengono anche passate come input nativo.
 */
async function buildPromptPayload(text, atts) {
  const lines = [];
  const images = [];
  const supportsImages = Array.isArray(model.input) && model.input.includes("image");
  for (const a of atts || []) {
    let abs;
    try {
      abs = await safeResolve(String(a?.path || ""));
    } catch {
      continue;
    }
    const name = String(a?.name || basename(abs));
    const mime = String(a?.mime || mimeOf(abs));
    lines.push(`- ${name}: ${abs}`);
    if (supportsImages && isImageMime(mime)) {
      try {
        const buf = await fs.readFile(abs);
        images.push({ type: "image", data: buf.toString("base64"), mimeType: mime });
      } catch {
        /* ignora */
      }
    }
  }
  return {
    promptText: lines.length ? `<<ALLEGATI>>\n${lines.join("\n")}\n<</ALLEGATI>>\n${text}` : text,
    images,
    attachmentCount: lines.length,
  };
}

// ---- HTTP server --------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  try {
    // ---- autenticazione: pagina di login, blocco progressivo, credenziali ----
    // CSRF: una scrittura autenticata dal cookie deve arrivare dalla nostra origine.
    if (req.method !== "GET" && req.method !== "HEAD" && !sameOrigin(req)) {
      return json(res, 403, { error: "origine non consentita" });
    }
    if (url.pathname === "/login") return await handleLogin(req, res, url);
    if (url.pathname === "/logout") return handleLogout(req, res);

    const blockedLeft = authBlockMsLeft(req);
    if (blockedLeft > 0) return tooManyRequests(req, res, blockedLeft, url);
    const auth = checkAuth(req);
    if (!auth.valid) {
      // Solo un tentativo con credenziali presentate alimenta l'anti brute-force: una
      // richiesta senza credenziali è semplicemente "serve accedere", non un attacco.
      if (auth.present) noteAuthFail(req);
      return unauthorized(req, res, url);
    }
    clearAuthFails(req);

    if (req.method === "GET" && url.pathname === "/") {
      const html = readFileSync(join(__dirname, "dashboard.html"), "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") return json(res, 200, getState({ withMessages: true }));

    // ---------------- comandi slash ----------------
    // Il browser chiede il catalogo (nomi, parametri, valori ammessi adesso) e
    // poi esegue il singolo comando: l'effetto è quello di un comando da TUI.
    if (req.method === "GET" && url.pathname === "/api/commands") {
      const q = (url.searchParams.get("q") || "").trim();
      const catalog = buildCommandCatalog();
      if (!q) return json(res, 200, { ok: true, ...catalog });
      const allowed = new Set(searchCommands(q).map((c) => c.name));
      return json(res, 200, { ...catalog, commands: catalog.commands.filter((c) => allowed.has(c.name)) });
    }

    if (req.method === "POST" && url.pathname === "/api/command") {
      const body = await readBody(req, 64 * 1024);
      const line = String(body.line || (body.name ? `/${body.name}${body.arg ? ` ${body.arg}` : ""}` : "")).trim();
      if (!line) return json(res, 400, { error: "comando mancante" });
      try {
        const out = await executeCommand(line);
        return json(res, 200, { ok: true, ...out });
      } catch (err) {
        if (err instanceof HttpError) return json(res, err.code || 400, { error: err.message, name: canonicalCommand(parseCommandLine(line)?.name) });
        throw err;
      }
    }

    // ---------------- skill (Agent Skills) ----------------
    if (req.method === "GET" && url.pathname === "/api/skills") {
      return json(res, 200, { ok: true, ...skillsPayload() });
    }

    // Crea o aggiorna una skill: { name, description, content }
    if (req.method === "POST" && url.pathname === "/api/skills") {
      const body = await readBody(req, 1024 * 1024);
      const name = slugifySkillName(body.name);
      const nameErrs = skillNameErrors(name);
      if (nameErrs.length) return json(res, 400, { error: `nome skill non valido (${nameErrs.join("; ")})` });
      const description = String(body.description || "").trim();
      if (!description) return json(res, 400, { error: "la descrizione è obbligatoria (spiega cosa fa la skill e quando usarla)" });
      if (description.length > SKILL_MAX_DESC) return json(res, 400, { error: `descrizione oltre ${SKILL_MAX_DESC} caratteri` });
      if (session?.isStreaming) return json(res, 409, { error: "attendi che l'agente finisca prima di modificare le skill" });
      const dir = join(SKILLS_DIR, name);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(join(dir, "SKILL.md"), buildSkillFile(name, description, body.content || ""), "utf8");
      await reloadSkills();
      return json(res, 200, { ok: true, name, ...skillsPayload() });
    }

    // Carica un file .md (raw body). ?name=SKILL.md con frontmatter name -> cartella;
    // ?name=foo.md -> skill piatta in skills/foo.md
    if (req.method === "POST" && url.pathname === "/api/skills/upload") {
      const rawName = basename(url.searchParams.get("name") || "SKILL.md");
      const explicitDir = String(url.searchParams.get("dir") || "").trim();
      if (session?.isStreaming) return json(res, 409, { error: "attendi che l'agente finisca prima di modificare le skill" });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) return json(res, 413, { error: "skill troppo grande (max 1 MB)" });
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      // Una skill esportata è un archivio (.zip, oppure .skill): se arriva qui (per esempio
      // caricata con l'estensione .skill) va importata come skill completa, non scritta
      // dentro SKILL.md come binario — era proprio questo il caso della skill "muta".
      if (isZipBuffer(raw)) {
        try {
          const out = await importSkillZip(raw, explicitDir || rawName.replace(/\.[^.]+$/, ""));
          return json(res, 200, { ok: true, ...out });
        } catch (e) {
          return json(res, e?.status || 400, { error: String(e?.message || e) });
        }
      }
      const content = sanitizeSkillFrontmatter(raw.toString("utf8"));
      if (!content.trim()) return json(res, 400, { error: "file vuoto" });
      if (!isProbablyText(raw)) {
        return json(res, 400, {
          error:
            "il file non è testo: se è una skill esportata (archivio .zip o .skill) caricala come archivio " +
            "(rinominala .zip se serve), non come SKILL.md",
        });
      }
      const fallback = explicitDir ? explicitDir : rawName.replace(/\.md$/i, "");
      const meta = extractSkillMeta(content, fallback);
      if (!meta.description) return json(res, 400, { error: "manca la description nel frontmatter (o una prima riga di testo)" });
      const nameErrs = skillNameErrors(meta.name);
      if (nameErrs.length) return json(res, 400, { error: `nome skill non valido "${meta.name}": ${nameErrs.join("; ")}` });
      const asDir = explicitDir || /\.md$/i.test(rawName) === false || rawName.toLowerCase() === "skill.md";
      // si scrive il contenuto con il frontmatter reso tollerante: una description non
      // quotata che contiene ": " altrimenti rende la skill invisibile (YAML non valido)
      if (asDir) {
        const dir = join(SKILLS_DIR, meta.name);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(join(dir, "SKILL.md"), content, "utf8");
      } else {
        await fs.writeFile(join(SKILLS_DIR, `${meta.name}.md`), content, "utf8");
      }
      await reloadSkills();
      return json(res, 200, { ok: true, name: meta.name, ...skillsPayload() });
    }

    // Importa una SKILL COMPLETA da un archivio .zip: cartella con SKILL.md più file di
    // supporto (references/, scripts/, esempi), che l'upload di un singolo .md non consente.
    if (req.method === "POST" && url.pathname === "/api/skills/upload-zip") {
      const requested = String(url.searchParams.get("name") || "").trim();
      if (session?.isStreaming) return json(res, 409, { error: "attendi che l'agente finisca prima di modificare le skill" });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > ZIP_MAX) return json(res, 413, { error: `archivio troppo grande (max ${Math.round(ZIP_MAX / 1024 / 1024)} MB)` });
        chunks.push(chunk);
      }
      try {
        const out = await importSkillZip(Buffer.concat(chunks), requested);
        return json(res, 200, { ok: true, ...out });
      } catch (e) {
        return json(res, e?.status || 400, { error: String(e?.message || e) });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/skills/delete") {
      const body = await readBody(req);
      const name = String(body.name || "").trim();
      if (!SKILL_NAME_RE.test(name)) return json(res, 400, { error: "nome skill non valido" });
      if (session?.isStreaming) return json(res, 409, { error: "attendi che l'agente finisca prima di modificare le skill" });
      let removed = 0;
      const dir = join(SKILLS_DIR, name);
      const flat = join(SKILLS_DIR, `${name}.md`);
      for (const p of [dir, flat]) {
        try {
          const st = await fs.stat(p);
          if (st.isDirectory()) await fs.rm(p, { recursive: true, force: true });
          else await fs.rm(p, { force: true });
          removed++;
        } catch {
          /* non esiste */
        }
      }
      if (!removed) return json(res, 404, { error: `skill non trovata: ${name}` });
      await reloadSkills();
      return json(res, 200, { ok: true, name, ...skillsPayload() });
    }

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        version: VERSION,
        // impronta del file di codice CARICATO da questo processo: è ciò che permette di
        // distinguere "il servizio ha il codice nuovo" da "la costante nel file è la stessa"
        ...CODE_FINGERPRINT,
        pid: process.pid,
        node: process.version,
        startedAt,
        startedAtISO: new Date(startedAt).toISOString(),
        uptimeMs: Date.now() - startedAt,
        sessionId: session.sessionId,
        streaming: session.isStreaming,
        tz: TZ_NAME,
        features: [
          "auth-bruteforce-limit",
          "auth-progressive-backoff",
          "login-page-session",
          "abort",
          "messages-edit",
          "messages-regenerate",
          "sessions-search",
          "sessions-export",
          "files-search",
          "pwa-assets",
          "backup-timer",
          "goals-planning",
          "scheduler-cron",
          "slash-commands",
          "skills",
          "stream-replay",
          "stream-snapshot",
          "stream-segments",
          "zip-folders",
          "svg-preview",
          "download-cards",
          "browser-output-staging",
          "decision-m-feature",
          "decision-m-tool-gate",
          "state-safe",
        ],
      });
    }

    // ---- file statici PWA (manifest, service worker, icone) ----
    if (req.method === "GET" && url.pathname === "/manifest.webmanifest") {
      return sendFile(res, join(__dirname, "manifest.webmanifest"), {
        mime: "application/manifest+json; charset=utf-8",
        noStore: true,
      });
    }
    if (req.method === "GET" && url.pathname === "/sw.js") {
      return sendFile(res, join(__dirname, "sw.js"), {
        mime: "text/javascript; charset=utf-8",
        noStore: true,
        headers: { "Service-Worker-Allowed": "/" },
      });
    }

    // Sanitizzatore SVG: è un modulo del CODICE (media/svg-sanitize.mjs), servito al browser
    // dalla stessa origine perché l'anteprima in chat usi esattamente lo stesso codice del
    // server. Rotta mirata a un solo file: non si apre una cartella intera alla pubblicazione.
    if (req.method === "GET" && url.pathname === "/svg-sanitize.mjs") {
      return sendFile(res, join(__dirname, "media", "svg-sanitize.mjs"), {
        mime: "text/javascript; charset=utf-8",
        noStore: true,
        headers: { "X-Content-Type-Options": "nosniff" },
      });
    }

    // ---- memoria a lungo termine ------------------------------------------------
    // Il modulo del disegno 3D è codice (media/memoria/atlante.mjs), servito dalla stessa
    // origine perché la vista e il file scaricabile usino ESATTAMENTE lo stesso disegno.
    if (req.method === "GET" && url.pathname === "/memoria/atlante.mjs") {
      return sendFile(res, join(__dirname, "media", "memoria", "atlante.mjs"), {
        mime: "text/javascript; charset=utf-8",
        noStore: true,
        headers: { "X-Content-Type-Options": "nosniff" },
      });
    }

    // L'atlante come pagina autonoma: si apre in una scheda, si scarica, funziona offline
    // (dati e codice incorporati). Se non è mai stato generato, lo si genera adesso.
    if (req.method === "GET" && url.pathname === "/memoria") {
      const file = join(__dirname, "media", "memoria", "atlante.html");
      if (!existsSync(file)) {
        try {
          const { scriviAtlante } = await import("./media/memoria/memoria-atlante.mjs");
          await scriviAtlante({ silenzioso: true });
        } catch (e) {
          return json(res, 503, { error: `atlante non generabile: ${e?.message || e}` });
        }
      }
      return sendFile(res, file, { mime: "text/html; charset=utf-8", noStore: true });
    }

    if (req.method === "GET" && url.pathname === "/api/memoria") {
      const [stato, vista] = await Promise.all([
        memoriaStato().catch((e) => ({ errore: String(e?.message || e) })),
        memoriaVista().catch((e) => ({ esiste: false, errore: String(e?.message || e) })),
      ]);
      return json(res, 200, { stato, vista, link_rotti: vista?.esiste ? await memoriaLinkRotti().catch(() => []) : [] });
    }

    if (req.method === "GET" && url.pathname === "/api/memoria/cerca") {
      const q = url.searchParams.get("q") || "";
      if (!q.trim()) return json(res, 400, { error: "manca q" });
      const budget = Math.min(4000, Math.max(200, Number(url.searchParams.get("budget")) || 1200));
      const p = await memoriaPacchetto(q, { budget });
      return json(res, 200, { query: q, budget, token_stimati: p.token_stimati, diagnosi: p.diagnosi || null, frammenti: p.frammenti || [], testo: p.testo });
    }

    if (req.method === "GET" && url.pathname === "/api/memoria/grafo") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return json(res, 400, { error: "manca q" });
      const passi = Math.min(3, Math.max(1, Number(url.searchParams.get("passi")) || 2));
      const budget = Math.min(2000, Math.max(200, Number(url.searchParams.get("budget")) || 600));
      const r = await memoriaGraphQuery(q, { passi, budget });
      return json(res, 200, r);
    }

    if (req.method === "GET" && url.pathname === "/api/memoria/nodo") {
      const nodo = (url.searchParams.get("nodo") || "").trim();
      if (!nodo) return json(res, 400, { error: "manca nodo" });
      const [scheda, pagina] = await Promise.all([
        memoriaScheda(nodo).catch((e) => ({ ok: false, testo: String(e?.message || e) })),
        memoriaWiki(nodo).catch((e) => ({ ok: false, testo: String(e?.message || e) })),
      ]);
      return json(res, 200, { scheda, pagina: { ok: pagina.ok, id: pagina.id || null, testo: pagina.testo } });
    }

    if (req.method === "POST" && url.pathname === "/api/memoria/ricostruisci") {
      // La ricostruzione è dell'utente, non del modello: qui si può chiedere quella completa,
      // atlante incluso (costosa: qualche secondo su un corpus grande, mai durante una risposta).
      const esito = await memoriaRicostruisci({ silenzioso: true, atlante: true });
      return json(res, esito.errori?.length ? 500 : 200, esito);
    }
    const iconMatch = url.pathname.match(/^\/(icon-\d+\.png|apple-touch-icon\.png|favicon\.ico)$/);
    if (req.method === "GET" && iconMatch) {
      return sendFile(res, join(__dirname, "assets", iconMatch[1]));
    }

    if (req.method === "GET" && url.pathname === "/events") {
      // Lo stato iniziale si calcola PRIMA di aprire lo stream. Se il calcolo fallisce si può
      // ancora rispondere con un errore JSON pulito; al contrario una `writeHead` su header già
      // inviati solleva ERR_HTTP_HEADERS_SENT dentro il catch (vedi `json`).
      let initialState;
      try {
        initialState = getState({ withMessages: true });
      } catch (err) {
        console.error("[dashboard] stato iniziale non calcolabile:", err);
        return json(res, 500, { error: `stato non disponibile: ${err?.message ?? err}` });
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("retry: 2000\n\n");
      clients.add(res);
      // Replay: EventSource rimanda l'ultimo id ricevuto, quindi si rispediscono gli eventi
      // ancora in buffer dopo quell'id. Una riconnessione non deve tagliare la risposta.
      const lastId = Number(req.headers["last-event-id"] || 0);
      if (Number.isFinite(lastId) && lastId > 0) {
        for (const e of sseReplay) {
          if (e.id > lastId) {
            try {
              res.write(e.payload);
            } catch {
              /* ignore */
            }
          }
        }
      }
      // L'evento iniziale è ciò che popola la chat all'apertura: qui i messaggi SERVONO
      // (una volta per connessione), mentre gli aggiornamenti successivi restano leggeri.
      res.write(`event: state\ndata: ${JSON.stringify(initialState)}\n\n`);
      // Se una risposta è in corso, il testo già generato viene rimandato INTEGRALMENTE: è la
      // verità del turno e rende idempotente qualunque delta applicato dal replay.
      if (streamSnapshot.active) {
        res.write(
          `event: stream_snapshot\ndata: ${JSON.stringify({
            segments: streamSnapshot.segments,
            text: snapshotText(),
            thinking: snapshotThinking(),
            active: true,
          })}\n\n`,
        );
      }
      req.on("close", () => clients.delete(res));
      return;
    }

    // ---------------- domande interattive all'utente ----------------
    // Risposta alla card `ask_user`: risolve la promessa del tool, che è in attesa dentro
    // la chiamata. L'id è il toolCallId, quindi il client sa a quale card si riferisce.
    // ---- Decision_M: decisore tipizzato locale, acceso a richiesta --------------
    // GET  /api/decision_m          stato completo: preferenza, processo, modello, RAM, coda del log
    // POST /api/decision_m          { enabled } · { action: "start"|"stop" } · { port, size, quant, weights, threads }
    // POST /api/decision_m/decide   { state, questions } → inoltro autenticato al decisore
    if (req.method === "GET" && url.pathname === "/api/decision_m") {
      return json(res, 200, await decisionMApiState());
    }

    if (req.method === "POST" && url.pathname === "/api/decision_m") {
      if (!DECISION_M_AVAILABLE) return json(res, 400, { error: "feature Decision_M disattivata all'avvio (DASH_DECISION_M=off)" });
      const body = await readBody(req, 8 * 1024);
      let failure = null;
      try {
        if (typeof body.enabled === "boolean") {
          // L'attesa sarebbe lunga (avvio + caricamento del modello: decine di secondi). Si
          // attendono al massimo 30 s — così un test o uno script vede subito l'esito — poi
          // si risponde «in avvio» e la UI segue con il suo ciclo di aggiornamento stato.
          const pending = decisionMService.setEnabled(body.enabled).catch((e) => {
            failure = String(e?.message || e);
          });
          const done = await Promise.race([
            pending.then(() => true),
            new Promise((r) => setTimeout(() => r(false), 30_000)),
          ]);
          decisionMSignature = "";
          decisionMChanged();
          const stato = await decisionMApiState();
          if (failure) return json(res, 500, { error: failure, decision_m: stato });
          return json(res, done ? 200 : 202, { ...stato, pending: !done });
        }
        if (body.action === "start" || body.action === "stop") {
          return json(res, 202, { ...(await decisionMService.setEnabled(body.action === "start")), pending: true });
        }
        if (["port", "size", "quant", "weights", "threads", "dir"].some((k) => k in body)) {
          const { restart, snapshot } = decisionMService.configure(body);
          // Variante cambiata con il servizio acceso: si riavvia con le nuove impostazioni,
          // altrimenti resterebbe acceso un modello diverso da quello dichiarato in UI.
          if (restart && snapshot.enabled) {
            void decisionMService.start().catch((e) => console.error("[Decision_M]", e?.message ?? e));
          }
          decisionMSignature = "";
          decisionMChanged();
          return json(res, 200, await decisionMApiState());
        }
        return json(res, 400, {
          error: "serve { enabled } oppure { action: start|stop } oppure una configurazione (port, size, quant, weights, threads)",
        });
      } catch (e) {
        return json(res, e?.status || 400, { error: String(e?.message || e) });
      }
    }

    // Prova diretta dalla dashboard (o da uno script autenticato): stesso wire format
    // `POST /v1/systemone` del servizio, ma dietro l'autenticazione che la dashboard già ha.
    if (req.method === "POST" && url.pathname === "/api/decision_m/decide") {
      if (!DECISION_M_AVAILABLE) return json(res, 400, { error: "feature Decision_M disattivata (DASH_DECISION_M=off)" });
      const body = await readBody(req, 256 * 1024);
      if (body?.state === undefined || !body?.questions || typeof body.questions !== "object") {
        return json(res, 400, { error: "servono { state, questions }" });
      }
      try {
        // Stesse forme comode del tool (`boolean`/`options`/`levels`): la normalizzazione è
        // una sola funzione, così la rotta e il tool dell'agente non possono divergere.
        const questions = normalizeDecisionMQuestions(body.questions);
        const timeoutMs = Number(body.timeoutMs) > 0 ? Number(body.timeoutMs) : 600_000;
        return json(res, 200, await decisionMService.decide({ state: body.state, questions }, { timeoutMs }));
      } catch (e) {
        const msg = String(e?.message || e);
        const spento = /spento|non pronto|non è pronto|unreachable|ECONNREFUSED/i.test(msg);
        return json(res, spento ? 503 : 400, { error: msg });
      }
    }

    if (req.method === "GET" && url.pathname === "/api/ask") {
      return json(res, 200, askBroker.snapshot({ withResolved: true }));
    }

    // Interruttore delle domande (stesso schema di /api/subagents: POST { enabled }).
    if (req.method === "POST" && url.pathname === "/api/ask") {
      const body = await readBody(req, 8 * 1024);
      if (!ASK_ENABLED) {
        return json(res, 400, { error: "le domande sono disattivate all'avvio (DASH_ASK=off)" });
      }
      if (typeof body.enabled !== "boolean") return json(res, 400, { error: "serve { enabled: true|false }" });
      askToolOn = body.enabled;
      saveAskPrefs();
      // una domanda già in attesa non ha più chi la mostri: si chiude con esito esplicito
      if (!askToolOn) askBroker.cancelAll("domande disattivate");
      applyToolGate();
      broadcast("state", getState());
      return json(res, 200, { ok: true, enabled: askToolEnabled(), toolActive: (session?.getActiveToolNames?.() || []).includes("ask_user") });
    }

    if (req.method === "POST" && url.pathname === "/api/ask/respond") {
      const body = await readBody(req, 64 * 1024);
      const id = String(body.id || "").trim();
      if (!id) return json(res, 400, { error: "id mancante" });
      try {
        const out = askBroker.respond(id, {
          action: body.action,
          answers: body.answers,
          reason: body.reason,
        });
        return json(res, 200, out);
      } catch (err) {
        if (err instanceof AskError) return json(res, err.code, { error: err.message });
        throw err;
      }
    }

    if (req.method === "POST" && url.pathname === "/api/prompt") {
      const body = await readBody(req, MAX_ATTACH);
      const text = String(body.text || "").trim();
      const atts = Array.isArray(body.attachments) ? body.attachments : [];
      if (!text && !atts.length) return json(res, 400, { error: "testo vuoto" });
      if (session.isStreaming) {
        const waiting = askBroker.snapshot().pending.length > 0;
        return json(res, 409, {
          error: waiting
            ? "c'è una domanda in attesa di risposta: rispondi dalla card in chat (oppure premi Salta)"
            : "già in streaming",
        });
      }
      // Un nuovo turno chiude eventuali domande rimaste orfane dal turno precedente.
      askBroker.cancelAll("sostituita da un nuovo turno");

      // Il gate dei tool dipende da condizioni dinamiche (live view aperta, controllo passato
      // all'utente, attività recente del browser). Va rivalutato QUI, prima di partire: senza
      // questo, se la live view era già attiva nessuno ricalcolava il gate e il modello
      // riceveva una lista di tool vecchia (il tool browser non arrivava mai).
      try {
        applyToolGate();
      } catch {
        /* non bloccare la richiesta per un problema di gate */
      }

      // Contesto dichiarato dal client (es. i comandi scritti dalla live view del browser):
      // viene accodato in un blocco riconoscibile, così resta trasparente nella cronologia.
      const clientContext = String(body.clientContext || "").trim().slice(0, 700);
      const withCtx = clientContext ? `${text}\n\n[contesto dashboard] ${clientContext}` : text;
      const { promptText, images } = await buildPromptPayload(withCtx, atts);

      json(res, 202, { ok: true });
      // il turno è considerato attivo da subito: la UI mostra ⏹ senza aspettare agent_start
      turnActive = true;
      session
        .prompt(promptText, images.length ? { images } : undefined)
        .catch((err) => {
          turnActive = false;
          broadcast("error", { message: err?.message ?? String(err) });
          broadcast("status", { streaming: false });
        });
      return;
    }

    // ---------------- interruzione (stop) ----------------
    if (req.method === "POST" && url.pathname === "/api/abort") {
      if (!session.isStreaming) return json(res, 200, { ok: true, streaming: false });
      try {
        session.abortRetry?.();
        session.abortBash?.();
        await session.abort();
      } catch (err) {
        console.error("[dashboard] abort:", err?.message ?? err);
      }
      // Il turno è interrotto: le domande pendenti non hanno più nessuno che le attende.
      // Senza questo, la promessa del tool resterebbe appesa e la card "in attesa" per sempre.
      askBroker.cancelAll("turno interrotto");
      broadcast("status", { streaming: false, aborted: true });
      turnActive = false;
      broadcast("state", getState());
      return json(res, 200, { ok: true, streaming: false });
    }

    // -------- modifica / rigenera l'ultimo messaggio utente --------
    // navigateTree riporta la sessione al punto scelto: il ramo precedente
    // resta nel file (recuperabile), ma la conversazione riparte da lì.
    if (req.method === "POST" && (url.pathname === "/api/messages/edit" || url.pathname === "/api/messages/regenerate")) {
      const isEdit = url.pathname === "/api/messages/edit";
      const body = isEdit ? await readBody(req, MAX_ATTACH) : {};
      if (session.isStreaming) return json(res, 409, { error: "risposta in corso" });
      const users = session.getUserMessagesForForking();
      if (!users.length) return json(res, 404, { error: "nessun messaggio da modificare" });
      const last = users[users.length - 1];
      const text = isEdit ? String(body.text || "").trim() : last.text;
      if (!text) return json(res, 400, { error: "testo vuoto" });
      let payload = { promptText: text, images: [] };
      if (isEdit) {
        const atts = Array.isArray(body.attachments) ? body.attachments : [];
        payload = await buildPromptPayload(text, atts);
      }
      try {
        const nav = await session.navigateTree(last.entryId);
        if (nav?.cancelled) return json(res, 409, { error: "operazione annullata" });
      } catch (err) {
        return json(res, 400, { error: `impossibile tornare indietro: ${err?.message ?? err}` });
      }
      broadcast("state", getState());
      json(res, 202, { ok: true, mode: isEdit ? "edit" : "regenerate" });
      turnActive = true;
      session.sendUserMessage(payload.promptText, payload.images.length ? { images: payload.images } : undefined).catch((err) => {
        turnActive = false;
        broadcast("error", { message: err?.message ?? String(err) });
        broadcast("status", { streaming: false });
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/upload") {
      const rawName = basename(url.searchParams.get("name") || "file.bin");
      const name = rawName.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "file.bin";
      const target = join(UPLOADS, `${Date.now().toString(36)}-${name}`);
      const chunks = [];
      let size = 0;
      let tooBig = false;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_UPLOAD) {
          tooBig = true;
          break;
        }
        chunks.push(chunk);
      }
      if (tooBig) return json(res, 413, { error: "file troppo grande" });
      await fs.writeFile(target, Buffer.concat(chunks));
      const rel = relative(ROOT, target);
      const mime = mimeOf(name);
      return json(res, 200, { ok: true, path: rel, name, mime, size, image: isImageMime(mime) });
    }

    // ---------------- sessioni chat ----------------
    if (req.method === "GET" && url.pathname === "/api/sessions") {
      return json(res, 200, await getSessionsPayload());
    }

    // ---------------- ricerca ----------------
    if (req.method === "GET" && url.pathname === "/api/sessions/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return json(res, 200, { q, results: [] });
      return json(res, 200, { q, results: await searchSessions(q) });
    }

    if (req.method === "GET" && url.pathname === "/api/search/files") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length < 2) return json(res, 200, { q, results: [], truncated: false });
      const out = await searchFiles(q, url.searchParams.get("path") || "");
      return json(res, 200, { q, ...out });
    }

    // ---------------- export markdown ----------------
    if (req.method === "GET" && url.pathname === "/api/sessions/export") {
      const id = url.searchParams.get("id");
      let messages;
      let meta;
      if (!id || id === session.sessionId) {
        // i messaggi si chiedono ESPLICITAMENTE: lo stato "leggero" non li contiene più
        messages = getState({ withMessages: true }).messages;
        meta = {
          title: session.sessionManager.getSessionName?.() || `Chat ${session.sessionId.slice(0, 8)}`,
          date: sessionStartedAt,
          model: model.id,
        };
      } else {
        const found = await findSessionById(id);
        if (!found) return json(res, 404, { error: "sessione non trovata" });
        const branch = await readSessionBranch(found.path);
        messages = branch.entries
          .filter((e) => e.type === "message")
          .map((e) => toUiMessage(e.message))
          .filter(Boolean);
        meta = { title: found.name || found.firstMessage?.slice(0, 60) || `Chat ${id.slice(0, 8)}`, date: found.modified };
      }
      const md = messagesToMarkdown(messages, meta);
      const safeTitle = String(meta.title || "chat")
        .toLowerCase()
        .replace(/[^\w\-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "chat";
      const fname = `pi-${safeTitle}-${new Date().toISOString().slice(0, 10)}.md`;
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": contentDisposition(fname),
        "Cache-Control": "no-store",
      });
      res.end(md);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/sessions/new") {
      if (session?.isStreaming) return json(res, 409, { error: "risposta in corso" });
      await switchSession(newSessionManager());
      broadcast("state", getState());
      broadcast("sessions", await getSessionsPayload());
      return json(res, 200, getState());
    }

    if (req.method === "POST" && url.pathname === "/api/sessions/open") {
      const body = await readBody(req);
      if (session?.isStreaming) return json(res, 409, { error: "risposta in corso" });
      const list = await SessionManager.list(cwd(), SESSION_DIR);
      const found = list.find((s) => s.id === String(body.id || ""));
      if (!found) return json(res, 404, { error: "sessione non trovata" });
      await switchSession(SessionManager.open(found.path, SESSION_DIR, cwd()));
      broadcast("state", getState());
      broadcast("sessions", await getSessionsPayload());
      return json(res, 200, getState());
    }

    if (req.method === "POST" && url.pathname === "/api/sessions/rename") {
      const body = await readBody(req);
      const name = String(body.name || "").trim().slice(0, 80);
      if (!name) return json(res, 400, { error: "nome mancante" });
      const id = String(body.id || "").trim();
      // `id` permette di rinominare una chat del drawer che NON è quella attiva: prima il
      // campo veniva ignorato e la rinomina finiva sempre sulla sessione corrente, quindi
      // cliccando «rinomina» su un'altra chat si rinominava quella sbagliata.
      if (id && id !== session?.sessionId) {
        const list = await SessionManager.list(cwd(), SESSION_DIR);
        const found = list.find((s) => s.id === id);
        if (!found) return json(res, 404, { error: "sessione non trovata" });
        const sm = SessionManager.open(found.path, SESSION_DIR, cwd());
        await sm.appendSessionInfo(name);
      } else {
        if (!session) return json(res, 400, { error: "nessuna sessione" });
        await session.sessionManager.appendSessionInfo(name);
      }
      broadcast("state", getState());
      broadcast("sessions", await getSessionsPayload());
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && url.pathname === "/api/sessions/delete") {
      const body = await readBody(req);
      const id = String(body.id || "");
      if (session?.isStreaming) return json(res, 409, { error: "risposta in corso" });
      const list = await SessionManager.list(cwd(), SESSION_DIR);
      const found = list.find((s) => s.id === id);
      if (!found) return json(res, 404, { error: "sessione non trovata" });
      if (session?.sessionId === id) await switchSession(newSessionManager());
      await fs.unlink(found.path).catch(() => {});
      broadcast("state", getState());
      broadcast("sessions", await getSessionsPayload());
      return json(res, 200, { ok: true });
    }

    // ---------------- goal / pianificazione / checklist ----------------
    if (req.method === "GET" && url.pathname === "/api/goals") {
      return json(res, 200, { goals });
    }

    // Crea (senza id) o aggiorna (con id) un goal.
    if (req.method === "POST" && url.pathname === "/api/goals") {
      const body = await readBody(req, 512 * 1024);
      let goal;
      if (body.id) {
        const idx = goals.findIndex((g) => g.id === String(body.id));
        if (idx < 0) return json(res, 404, { error: "goal non trovato" });
        goal = normalizeGoal(body, goals[idx]);
        goals[idx] = goal;
      } else {
        goal = normalizeGoal(body);
        goals.push(goal);
      }
      await saveGoals();
      broadcast("goals", { goals });
      return json(res, 200, { ok: true, goal });
    }

    if (req.method === "POST" && url.pathname === "/api/goals/delete") {
      const body = await readBody(req);
      const id = String(body.id || "");
      const before = goals.length;
      goals = goals.filter((g) => g.id !== id);
      if (goals.length === before) return json(res, 404, { error: "goal non trovato" });
      await saveGoals();
      broadcast("goals", { goals });
      return json(res, 200, { ok: true });
    }

    // Esegue la catena di passaggi: invia all'agente il piano del goal.
    if (req.method === "POST" && url.pathname === "/api/goals/execute") {
      const body = await readBody(req);
      const id = String(body.id || "");
      const g = goals.find((x) => x.id === id);
      if (!g) return json(res, 404, { error: "goal non trovato" });
      if (session.isStreaming) return json(res, 409, { error: "già in streaming" });
      const prompt = goalExecutionPrompt(g, body.mode);
      json(res, 202, { ok: true });
      turnActive = true;
      session
        .prompt(prompt)
        .catch((err) => {
          turnActive = false;
          broadcast("error", { message: err?.message ?? String(err) });
          broadcast("status", { streaming: false });
        });
      return;
    }

    // ---------------- progetto: cartelle scelte dall'utente ----------------
    // L'agente vede le cartelle nel system prompt (vedi progettoPromptNote); queste rotte
    // servono alla vista 📦 e alla stella nel file manager.
    if (req.method === "GET" && url.pathname === "/api/progetto") {
      return json(res, 200, await progettoPayload());
    }

    if (req.method === "POST" && url.pathname === "/api/progetto") {
      const body = await readBody(req);
      const azione = String(body.azione || "aggiungi");
      const grezzo = String(body.path || "").trim();
      // Un percorso con «..» non viene "aggiustato in silenzio": si rifiuta, dicendo cosa fare.
      // (La normalizzazione sotto lo renderebbe comunque innocuo, ma un rifiuto esplicito evita
      // di far credere che una cartella fuori dalla root sia stata accettata.)
      if (/\.\./.test(grezzo)) {
        return json(res, 400, {
          error: `percorso non valido: «${grezzo}» — usa un percorso relativo alla root della dashboard, senza «..»`,
        });
      }
      const richiesto = grezzo.replace(/^[./]+/, "").replace(/\/+$/, "");
      const label = String(body.label || "").slice(0, 80);

      if (azione === "aggiungi") {
        if (!richiesto) return json(res, 400, { error: "path mancante" });
        let abs;
        try {
          abs = await safeResolve(richiesto);
        } catch (e) {
          const msg = String(e?.message || e);
          return json(res, e?.code === 403 ? 403 : 404, {
            error: msg === "non trovato" || msg === "percorso fuori dalla root"
              ? `cartella non trovata nella root della dashboard: «${richiesto}» (i percorsi sono relativi a ${ROOT})`
              : msg,
          });
        }
        const st = await fs.stat(abs);
        if (!st.isDirectory()) return json(res, 400, { error: `non è una cartella: «${richiesto}»` });
        if (!progetto.cartelle.some((c) => c.path === richiesto)) {
          if (progetto.cartelle.length >= PROGETTO_MAX_CARTELLE)
            return json(res, 400, { error: `massimo ${PROGETTO_MAX_CARTELLE} cartelle nel progetto` });
          progetto.cartelle.push({ path: richiesto, label });
        }
        if (!progetto.attiva) progetto.attiva = richiesto;
      } else if (azione === "rimuovi") {
        progetto.cartelle = progetto.cartelle.filter((c) => c.path !== richiesto);
        if (progetto.attiva === richiesto) progetto.attiva = progetto.cartelle[0]?.path || "";
      } else if (azione === "attiva") {
        if (!progetto.cartelle.some((c) => c.path === richiesto))
          return json(res, 404, { error: "cartella non nel progetto" });
        progetto.attiva = richiesto;
      } else if (azione === "svuota") {
        progetto = { cartelle: [], attiva: "" };
      } else {
        return json(res, 400, { error: `azione sconosciuta: ${azione}` });
      }

      await saveProgetto();
      await ricaricaContestoProgetto();
      return json(res, 200, { ok: true, ...(await progettoPayload()) });
    }

    // ---------------- operazioni pianificate (cron) ----------------
    if (req.method === "GET" && url.pathname === "/api/schedules") {
      return json(res, 200, { schedules, running: schedulerRunning, logsDir: SCHEDULE_LOG_DIR, tz: TZ_NAME });
    }

    // valida una pianificazione e dice quando sarà la prossima esecuzione
    if (req.method === "POST" && url.pathname === "/api/schedules/validate") {
      const body = await readBody(req);
      try {
        const spec = parseCron(String(body.schedule || ""));
        const next = nextCronTime(spec, new Date());
        if (next == null) throw new HttpError(400, "pianificazione mai raggiungibile");
        return json(res, 200, { ok: true, normalized: spec.text, next, tz: TZ_NAME });
      } catch (e) {
        return json(res, 400, { error: e?.message || String(e) });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/schedules") {
      const body = await readBody(req, 256 * 1024);
      let job;
      if (body.id) {
        const idx = schedules.findIndex((s) => s.id === String(body.id));
        if (idx < 0) return json(res, 404, { error: "pianificazione non trovata" });
        job = normalizeSchedule(body, schedules[idx]);
        schedules[idx] = job;
      } else {
        job = normalizeSchedule(body);
        schedules.push(job);
      }
      await saveSchedules();
      broadcast("schedule", { schedules, running: schedulerRunning });
      return json(res, 200, { ok: true, job });
    }

    if (req.method === "POST" && url.pathname === "/api/schedules/toggle") {
      const body = await readBody(req);
      const job = schedules.find((s) => s.id === String(body.id || ""));
      if (!job) return json(res, 404, { error: "pianificazione non trovata" });
      job.enabled = body.enabled === undefined ? !job.enabled : !!body.enabled;
      job.updatedAt = Date.now();
      if (job.enabled) {
        try {
          job.nextRun = computeNextRun(job, new Date());
        } catch (e) {
          job.enabled = false;
          return json(res, 400, { error: `impossibile attivare: ${e?.message || e}` });
        }
      }
      await saveSchedules();
      broadcast("schedule", { schedules, running: schedulerRunning });
      return json(res, 200, { ok: true, job });
    }

    if (req.method === "POST" && url.pathname === "/api/schedules/delete") {
      const body = await readBody(req);
      const id = String(body.id || "");
      const before = schedules.length;
      schedules = schedules.filter((s) => s.id !== id);
      if (schedules.length === before) return json(res, 404, { error: "pianificazione non trovata" });
      await saveSchedules();
      await fs.rm(join(SCHEDULE_LOG_DIR, `${id.replace(/[^\w.-]/g, "_")}.log`), { force: true }).catch(() => {});
      broadcast("schedule", { schedules, running: schedulerRunning });
      return json(res, 200, { ok: true });
    }

    // esecuzione immediata (non cambia la pianificazione)
    if (req.method === "POST" && url.pathname === "/api/schedules/run") {
      const body = await readBody(req);
      const job = schedules.find((s) => s.id === String(body.id || ""));
      if (!job) return json(res, 404, { error: "pianificazione non trovata" });
      if (schedulerRunning) return json(res, 409, { error: "una pianificazione è già in esecuzione" });
      if (session.isStreaming) return json(res, 409, { error: "risposta in corso nella chat: riprova" });
      json(res, 202, { ok: true });
      runSchedule(job, { manual: true }).catch((e) =>
        broadcast("error", { message: e?.message ?? String(e) }),
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/schedules/log") {
      const id = String(url.searchParams.get("id") || "").replace(/[^\w.-]/g, "_");
      try {
        const raw = await fs.readFile(join(SCHEDULE_LOG_DIR, `${id}.log`), "utf8");
        return json(res, 200, { id, log: raw.slice(-20000) });
      } catch {
        return json(res, 200, { id, log: "" });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/thinking") {
      const body = await readBody(req);
      const level = String(body.level || "");
      // valida sui livelli REALMENTE supportati dal modello corrente
      const allowed = supportedLevels(model);
      if (!allowed.includes(level))
        return json(res, 400, {
          error: `livello non supportato dal modello (supportati: ${allowed.join(", ")})`,
        });
      session.setThinkingLevel(level);
      broadcast("state", getState());
      return json(res, 200, getState());
    }

    if (req.method === "POST" && url.pathname === "/api/subagents") {
      const body = await readBody(req);
      if (!hasSubagentExt) return json(res, 400, { error: "estensione subagent non disponibile" });
      if (typeof body.enabled === "boolean") subagentsEnabled = body.enabled;
      if (body.maxSpawns !== undefined) {
        const n = Number(body.maxSpawns);
        if (!Number.isInteger(n) || n < 1 || n > 64)
          return json(res, 400, { error: "maxSpawns deve essere un intero tra 1 e 64" });
        maxSubagentSpawns = n;
      }
      applySubagentLimit();
      applyToolGate();
      broadcast("state", getState());
      return json(res, 200, getState());
    }

    if (req.method === "POST" && url.pathname === "/api/browser") {
      const body = await readBody(req);
      const available = ALL_TOOLS.some((t) => BROWSER_TOOL_NAMES.has(t.name));
      if (!available) return json(res, 400, { error: "tool browser non disponibile" });
      // "mode" è la forma nuova; "enabled" resta accettato per compatibilità
      if (typeof body.mode === "string") {
        if (!["auto", "on", "off"].includes(body.mode))
          return json(res, 400, { error: "mode deve essere auto, on oppure off" });
        browserMode = body.mode;
      } else if (typeof body.enabled === "boolean") {
        browserMode = body.enabled ? "on" : "off";
      }
      if (body.idleMinutes !== undefined) {
        const n = Number(body.idleMinutes);
        if (!Number.isFinite(n) || n < 1 || n > 1440)
          return json(res, 400, { error: "idleMinutes deve essere tra 1 e 1440" });
        browserIdleMinutes = Math.round(n);
      }
      saveBrowserPrefs();
      applyToolGate();
      broadcast("state", getState());
      return json(res, 200, getState());
    }

    // ---- live view del browser (ponte verso lo stream di agent-browser) ----
    if (req.method === "GET" && url.pathname === "/api/browser/live") {
      return json(res, 200, { live: browserLive.snapshot(), control: browserControlMode });
    }

    // ultimo frame disponibile: serve a mostrare subito la pagina aprendo la vista live
    // (i frame arrivano solo ai cambi di pagina, quindi su una pagina ferma non ne arriverebbero)
    if (req.method === "GET" && url.pathname === "/api/browser/live/frame") {
      const f = browserLive.lastFrame();
      if (!f) return json(res, 204, {});
      return json(res, 200, { frame: f });
    }

    // naviga a un URL digitato nella barra indirizzi della live view
    if (req.method === "POST" && url.pathname === "/api/browser/open") {
      const body = await readBody(req, 8192);
      try {
        const u = await browserLive.open(body.url);
        return json(res, 200, { ok: true, url: u });
      } catch (e) {
        return json(res, 400, { error: String(e?.message || e) });
      }
    }

    // tasti e combinazioni che lo stream NON copre (Backspace, Tab, frecce, Control+a…):
    // lo stream accetta solo key+text, quindi si passa dalla CLI che li invia correttamente
    if (req.method === "POST" && url.pathname === "/api/browser/press") {
      const body = await readBody(req, 4096);
      if (browserControlMode !== "human") {
        return json(res, 409, { error: "il controllo è dell'agente: premi 'prendi il controllo' per guidare tu il browser" });
      }
      try {
        const k = await browserLive.press(body.keys);
        return json(res, 200, { ok: true, keys: k });
      } catch (e) {
        return json(res, 400, { error: String(e?.message || e) });
      }
    }

    // ricarica la pagina attiva. I frame arrivano solo ai CAMBIAMENTI, quindi su una pagina
    // ferma questo è il modo per ottenere un'immagine nuova (e per non farla sembrare bloccata)
    if (req.method === "POST" && url.pathname === "/api/browser/reload") {
      try {
        await browserLive.reload();
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 400, { error: String(e?.message || e) });
      }
    }

    // apre/chiude il flusso dei frame verso i client (consuma banda: si attiva a richiesta)
    if (req.method === "POST" && url.pathname === "/api/browser/watch") {
      const body = await readBody(req);
      if (body.on === false) browserLive.stop();
      else await browserLive.start();
      // la live view è un motivo per avere il tool acceso: in modo "auto" rivaluta subito
      applyToolGate();
      broadcast("state", getState());
      return json(res, 200, { live: browserLive.snapshot(), control: browserControlMode });
    }

    // inoltro degli input dell'utente al browser (solo in modalità human)
    if (req.method === "POST" && url.pathname === "/api/browser/input") {
      const body = await readBody(req, 64 * 1024);
      if (browserControlMode !== "human") {
        return json(res, 409, { error: "il controllo è dell'agente: premi 'prendi il controllo' per guidare tu il browser" });
      }
      try {
        const out = browserLive.input(body);
        return json(res, 200, out);
      } catch (e) {
        return json(res, 400, { error: String(e?.message || e) });
      }
    }

    // prende/restituisce il controllo (lock anti-conflitto con l'agente)
    if (req.method === "POST" && url.pathname === "/api/browser/control") {
      const body = await readBody(req);
      const mode = body.mode === "human" ? "human" : "agent";
      browserControlMode = mode;
      // quando guidi tu serve più fluidità: si alza il frame rate (e si riabbassa tornando all'agente)
      try {
        browserLive.setMaxFps(mode === "human" ? BROWSER_FPS_HUMAN : BROWSER_FPS_BASE);
      } catch {
        /* non è critico */
      }
      applyToolGate();
      broadcast("browser_control", { mode });
      broadcast("state", getState());
      return json(res, 200, { control: browserControlMode, live: browserLive.snapshot() });
    }

    // Compaction manuale del contesto (equivalente a /compact della TUI di pi).
    // E' lossy per il contesto, ma la cronologia completa resta nel JSONL.
    if (req.method === "POST" && url.pathname === "/api/compact") {
      if (session.isCompacting) return json(res, 409, { error: "compattazione già in corso" });
      if (!session.isIdle) return json(res, 409, { error: "l'agente sta lavorando: attendi la fine o interrompi con stop" });
      let instructions = "";
      try {
        const body = await readBody(req, 64 * 1024);
        instructions = String(body?.instructions || "").trim();
      } catch {
        // corpo assente: compaction senza istruzioni personalizzate
      }
      try {
        broadcast("status", { compacting: true });
        const out = await session.compact(instructions || undefined);
        const win = model.contextWindow ?? null;
        const tokensAfter = out?.estimatedTokensAfter ?? null;
        if (tokensAfter != null) compactEstimate = { tokens: tokensAfter, window: win, at: Date.now() };
        broadcast("state", getState());
        broadcast("sessions", await getSessionsPayload());
        broadcast("status", { compacting: false });
        return json(res, 200, {
          ok: true,
          tokensBefore: out?.tokensBefore ?? null,
          tokensAfter,
          firstKeptEntryId: out?.firstKeptEntryId ?? null,
          summaryChars: (out?.summary || "").length,
        });
      } catch (err) {
        broadcast("status", { compacting: false });
        const msg = err?.message || String(err);
        // precondizione non soddisfatta (es. sessione troppo piccola) -> 400, non 500
        const precondition = /nothing to compact|too small|not enough|too few/i.test(msg);
        return json(res, precondition ? 400 : 500, { error: msg });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/model") {
      const body = await readBody(req);
      const id = String(body.id || "");
      const m =
        modelRuntime.getModel("deepseek", id) ??
        modelRuntime.getModel(id.split("/")[0], id.split("/").slice(1).join("/"));
      if (!m) return json(res, 404, { error: `modello non trovato: ${id}` });
      model = m;
      await session.setModel(m);
      broadcast("state", getState());
      return json(res, 200, getState());
    }

    // ---------------- files ----------------
    if (req.method === "GET" && url.pathname === "/api/files") {
      return json(res, 200, await listDir(url.searchParams.get("path") || ""));
    }

    if (req.method === "GET" && url.pathname === "/api/file") {
      return json(res, 200, await readFileSafe(url.searchParams.get("path") || ""));
    }

    if (req.method === "POST" && url.pathname === "/api/file") {
      const body = await readBody(req, 8 * 1024 * 1024);
      const p = String(body.path || "");
      if (!p) return json(res, 400, { error: "path mancante" });
      const abs = await safeResolve(p, { allowMissing: true });
      const out = await writeFileSafe(p, String(body.content ?? ""));
      // modificare un SKILL.md via editor deve rendere la skill subito attiva
      if (abs === SKILLS_DIR || abs.startsWith(SKILLS_DIR + sep)) {
        try {
          await reloadSkills();
        } catch (e) {
          console.error("[dashboard] reloadSkills da editor:", e?.message || e);
        }
      }
      return json(res, 200, out);
    }

    if (req.method === "POST" && url.pathname === "/api/file/mkdir") {
      const body = await readBody(req);
      const p = String(body.path || "").trim();
      if (!p) return json(res, 400, { error: "path mancante" });
      const abs = await safeResolve(p, { allowMissing: true });
      await fs.mkdir(abs, { recursive: true });
      return json(res, 200, { ok: true, path: relative(ROOT, abs) });
    }

    if (req.method === "POST" && url.pathname === "/api/file/rename") {
      const body = await readBody(req);
      const from = await safeResolve(String(body.from || ""));
      const to = await safeResolve(String(body.to || ""), { allowMissing: true });
      if (from === ROOT) return json(res, 400, { error: "non puoi rinominare la root" });
      if (to === ROOT) return json(res, 400, { error: "destinazione non valida" });
      // `fs.rename` SOVRASCRIVE in silenzio: un refuso nel nome di destinazione cancellava un
      // file esistente senza avviso (e la risposta era comunque `ok: true`). La sovrascrittura
      // ora si fa solo se richiesta esplicitamente (`overwrite: true`), altrimenti 409.
      if (!body.overwrite) {
        let occupied = false;
        try {
          await fs.lstat(to);
          occupied = true;
        } catch {
          /* destinazione libera */
        }
        if (occupied) {
          return json(res, 409, {
            error: `esiste già «${relative(ROOT, to)}»: conferma la sovrascrittura`,
            exists: true,
            path: relative(ROOT, to),
          });
        }
      }
      await fs.rename(from, to);
      return json(res, 200, { ok: true, path: relative(ROOT, to) });
    }

    if (req.method === "POST" && url.pathname === "/api/file/delete") {
      const body = await readBody(req);
      const abs = await safeResolve(String(body.path || ""));
      if (abs === ROOT) return json(res, 400, { error: "non puoi cancellare la root" });
      await fs.rm(abs, { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }

    // ---------------- resolve-files ----------------
    // La chat cita file e cartelle in forma libera: la risoluzione la fa il server, che sa
    // dove sono davvero (root, cartella di lavoro, media/). La UI disegna la card «scarica»
    // solo per ciò che qui risulta esistere, quindi nessun tasto può più puntare a vuoto.
    if (req.method === "POST" && url.pathname === "/api/resolve-files") {
      const body = await readBody(req);
      const inputs = Array.isArray(body?.paths) ? body.paths.slice(0, 60) : [];
      const items = [];
      for (const raw of inputs) {
        const input = String(raw ?? "");
        if (!input.trim() || /[*?{}]/.test(input)) {
          items.push({ input, ok: false, reason: "non è un percorso di file" });
          continue;
        }
        const found = await resolveCitedPath(input);
        items.push(found ? { input, ok: true, ...found } : { input, ok: false, reason: "non trovato" });
      }
      return json(res, 200, { root: ROOT, mediaRel: relative(ROOT, MEDIA_DIR), items });
    }

    if (req.method === "GET" && url.pathname === "/api/download") {
      const abs = await safeResolve(url.searchParams.get("path") || "");
      const st = await fs.stat(abs);
      // Una cartella si scarica come .zip: prima il tasto «scarica» su una cartella
      // restituiva un JSON d'errore, cioè un file inutile chiamato «media».
      if (st.isDirectory()) {
        let zipped;
        try {
          zipped = await zipDirectory(abs, { maxFiles: MAX_ZIP_FILES, maxTotal: MAX_ZIP_BYTES });
        } catch (err) {
          return json(res, 413, { error: String(err?.message || err) });
        }
        if (!zipped.files) return json(res, 400, { error: "cartella vuota" });
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Length": zipped.buffer.length,
          "Content-Disposition": contentDisposition(`${basename(abs)}.zip`),
        });
        res.end(zipped.buffer);
        return;
      }
      if (!st.isFile()) return json(res, 400, { error: "non è un file" });
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": st.size,
        "Content-Disposition": contentDisposition(basename(abs)),
      });
      createReadStream(abs).pipe(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/image") {
      // Anteprima di un'immagine VERA: la rotta serve i byte con il Content-Type ricavato dai
      // magic number e `inline`. `/api/download` resta per il salvataggio su disco (attachment),
      // perché un `<img src>` con disposition `attachment` non è affidabile in tutti i browser.
      // `?meta=1` non scarica nulla: dice solo se il file è un'immagine ammessa, con che formato e
      // quanto pesa — è quello che la chat usa per decidere se mostrare l'anteprima.
      const richiesto = url.searchParams.get("path") || "";
      const soloMeta = url.searchParams.get("meta") === "1";
      let abs;
      try {
        abs = await safeResolve(richiesto);
      } catch (e) {
        return json(res, e?.code === 403 ? 403 : 404, {
          error: e?.code === 403 ? "percorso fuori dalla root" : `file non trovato: «${richiesto}»`,
        });
      }
      let st;
      try {
        st = await fs.stat(abs);
      } catch {
        return json(res, 404, { error: `file non trovato: «${richiesto}»` });
      }
      if (!st.isFile()) return json(res, 400, { error: "non è un file" });
      let testa = Buffer.alloc(0);
      try {
        const fh = await fs.open(abs, "r");
        try {
          const buf = Buffer.alloc(512);
          const { bytesRead } = await fh.read(buf, 0, 512, 0);
          testa = buf.subarray(0, bytesRead);
        } finally {
          await fh.close();
        }
      } catch (e) {
        return json(res, 500, { error: `lettura non riuscita: ${e?.message || e}` });
      }
      const mime = sniffImageMime(testa);
      const rel = relative(ROOT, abs);
      if (!mime) {
        const perche = looksLikeSvg(testa)
          ? "è un disegno SVG: per mostrarlo usa il blocco ```svg della chat (passa dal sanitizzatore)"
          : "il file non è un'immagine (png, jpeg, gif, webp, bmp, avif)";
        return json(res, 415, { ok: false, error: perche, path: rel, size: st.size });
      }
      const troppoGrande = st.size > IMAGE_MAX_BYTES;
      if (soloMeta) {
        return json(res, 200, {
          ok: true,
          mime,
          path: rel,
          name: basename(abs),
          size: st.size,
          mtime: st.mtimeMs,
          tooBig: troppoGrande,
          maxBytes: IMAGE_MAX_BYTES,
        });
      }
      if (troppoGrande) {
        return json(res, 413, {
          ok: false,
          error: `immagine troppo grande per l'anteprima (${Math.round(st.size / 1024 / 1024)} MB, limite ${Math.round(
            IMAGE_MAX_BYTES / 1024 / 1024,
          )} MB): aprila dai file o scaricala`,
          path: rel,
          size: st.size,
        });
      }
      res.writeHead(200, {
        "Content-Type": mime,
        "Content-Length": st.size,
        // inline: è un'anteprima, non un download (il nome del file resta nel titolo della card)
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=60",
      });
      createReadStream(abs).pipe(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/upload") {
      const dir = url.searchParams.get("dir") || "";
      const name = basename(url.searchParams.get("name") || "upload.bin");
      const absDir = await safeResolve(dir);
      const target = join(absDir, name);
      if (!withinRoot(target)) return json(res, 403, { error: "percorso non valido" });
      const chunks = [];
      let size = 0;
      let tooBig = false;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_UPLOAD) {
          tooBig = true;
          break;
        }
        chunks.push(chunk);
      }
      if (tooBig) return json(res, 413, { error: "file troppo grande" });
      await fs.writeFile(target, Buffer.concat(chunks));
      return json(res, 200, { ok: true, path: relative(ROOT, target), size });
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  } catch (err) {
    errorResponse(res, err);
  }
});

// Skill modificate da fuori (shell, git, un'altra sessione): watcher sulla cartella, più un
// controllo periodico come rete di sicurezza se il watcher perde un evento.
startSkillsWatcher();
startSkillsPoll();

server.listen(PORT, HOST, () => {
  console.log(`Universalis Harness: http://${HOST}:${PORT}`);
  console.log(`modello: ${model.id} | thinking: ${session.thinkingLevel} | cwd: ${cwd()}`);
  console.log(`file root: ${ROOT}`);
  console.log(`media (file generati): ${MEDIA_DIR}`);
  console.log(`sessioni: ${SESSION_DIR}`);
  console.log(`fuso orario (pianificazioni): ${TZ_NAME} — ora locale: ${new Date().toLocaleString("it-IT")}`);
  console.log(
    `subagent: ${hasSubagentExt ? `disponibile (OFF di default, max ${maxSubagentSpawns} per richiesta)` : "non disponibile"}`,
  );
  console.log(`auth -> utente: ${AUTH_USER}  password: ${AUTH_PASS ? "***" : "(assente!)"}`);
  console.log(
    `login: pagina /login + cookie di sessione (${Math.round(SESSION_TTL_MS / 3600000)}h) · Basic accettato · ` +
      `anti brute-force: ${AUTH_MAX_FAILS} tentativi → attese progressive ${AUTH_BACKOFF.join("s, ")}s`,
  );
  console.log(`segreto di sessione: ${SESSION_SECRET_FILE}`);
  // Decision_M: se la preferenza salvata dice ACCESO, il servizio viene riacceso adesso, in
  // background (il caricamento del modello non deve ritardare la messa in servizio dell'HTTP).
  // La UI lo vede passare da «in avvio» a «pronto» da sola.
  if (DECISION_M_AVAILABLE) {
    console.log(
      `Decision_M: feature disponibile (${decisionMService.prefs.enabled ? "accesa" : "spenta"}) · ` +
        `porta ${decisionMService.prefs.port} · ${decisionMService.prefs.size} ${decisionMService.prefs.quant} · ` +
        `${decisionMService.prefs.threads} thread`,
    );
    void decisionMService.boot().then(() => refreshDecisionMStatus());
    // Il modello si carica in decine di secondi e la RAM cambia mentre è acceso: il ciclo
    // tiene allineati il gate dei tool e la UI senza che nessuno ricarichi la pagina.
    setInterval(() => void refreshDecisionMStatus(), 5000).unref?.();
  } else {
    console.log("Decision_M: feature disattivata (DASH_DECISION_M=off)");
  }
});
