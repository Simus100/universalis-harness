#!/usr/bin/env python3
"""
fix_audit.py — applica i fix dell'audit del 2026-09-18 a dashboard.mjs / dashboard.html.

Ogni sostituzione è verificata con un conteggio atteso: se il file non è quello
che ci si aspetta, lo script si ferma senza scrivere nulla (nessuna patch a metà).

Uso:
    python3 fix_audit.py --dry    # mostra cosa farebbe e verifica i conteggi
    python3 fix_audit.py          # applica
"""

import sys
from pathlib import Path

ROOT = Path("/root/pi-harness")
MJS = ROOT / "dashboard.mjs"
HTML = ROOT / "dashboard.html"
DRY = "--dry" in sys.argv


def patch(path: Path, edits, dry=DRY):
    """edits: lista di (descrizione, old, new, conteggio_atteso)."""
    s = path.read_text(encoding="utf-8")
    orig = s
    for desc, old, new, expect in edits:
        n = s.count(old)
        if n != expect:
            raise SystemExit(f"STOP [{path.name}] '{desc}': trovate {n} occorrenze, attese {expect}")
        s = s.replace(old, new)
        print(f"  ok  [{path.name}] {desc} ({n}x)")
    if s == orig:
        print(f"  --  [{path.name}] nessuna modifica")
    elif not dry:
        path.write_text(s, encoding="utf-8")
    return s


# ---------------------------------------------------------------- dashboard.mjs
MJS_EDITS = []

# --- 1. costanti: cap di memoria per la mappa dei tentativi
MJS_EDITS.append((
    "costante cap mappa auth",
    'const AUTH_BLOCK_MS = Math.max(1000, Number(process.env.DASH_AUTH_BLOCK_MS) || 15 * 60 * 1000);',
    'const AUTH_BLOCK_MS = Math.max(1000, Number(process.env.DASH_AUTH_BLOCK_MS) || 15 * 60 * 1000);\n'
    '// La chiave può essere falsificata: la mappa non deve poter crescere senza limite.\n'
    'const AUTH_MAX_ENTRIES = Math.max(16, Number(process.env.DASH_AUTH_MAX_ENTRIES) || 2000);',
    1,
))

# --- 2. clientIp: ultimo hop + fiducia solo nel proxy locale
MJS_EDITS.append((
    "clientIp non forgiabile",
    '''/** IP del client: dietro Caddy usiamo X-Forwarded-For (ascoltiamo solo in locale). */
function clientIp(req) {
  const xff = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xff || req.socket?.remoteAddress || "unknown";
}''',
    '''/** Normalizza un IP: toglie porta, parentesi IPv6 e prefisso ::ffff:. */
function normalizeIp(value) {
  let s = String(value || "").trim();
  if (!s) return "";
  if (s.startsWith("[")) {
    const end = s.indexOf("]");
    if (end > 0) s = s.slice(1, end);
  }
  const withPort = /^(\\d{1,3}(?:\\.\\d{1,3}){3}):\\d+$/.exec(s);
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
}''',
    1,
))

# --- 3. cap effettivo quando si registra un fallimento
MJS_EDITS.append((
    "cap mappa in noteAuthFail",
    '''  authFails.set(ip, st);
}''',
    '''  // Sfratto FIFO: la mappa resta limitata anche sotto rotazione di IP falsi.
  if (!authFails.has(ip) && authFails.size >= AUTH_MAX_ENTRIES) {
    const oldest = authFails.keys().next().value;
    if (oldest !== undefined) authFails.delete(oldest);
  }
  authFails.set(ip, st);
}''',
    1,
))

# --- 4. gate: credenziali PRIMA del blocco (un utente legittimo non prende 429)
MJS_EDITS.append((
    "credenziali prima del blocco",
    '''    // ---- autenticazione con anti brute-force ----
    const blockedLeft = authBlockMsLeft(req);
    if (blockedLeft > 0) return tooManyRequests(res, blockedLeft);
    if (!isAuthorized(req)) {
      noteAuthFail(req);
      return unauthorized(res);
    }
    clearAuthFails(req);''',
    '''    // ---- autenticazione con anti brute-force ----
    // Le credenziali si controllano PRIMA del blocco: una richiesta legittima non
    // deve mai ricevere 429 (altrimenti si può escludere un IP forgiando l'header).
    if (!isAuthorized(req)) {
      const blockedLeft = authBlockMsLeft(req);
      if (blockedLeft > 0) return tooManyRequests(res, blockedLeft);
      noteAuthFail(req);
      return unauthorized(res);
    }
    clearAuthFails(req);''',
    1,
))

# --- 5. getState: conversazione opzionale + campo esplicito
MJS_EDITS.append((
    "getState(includeMessages)",
    '''function getState() {
  const stats = session.getSessionStats();''',
    '''function getState(includeMessages = true) {
  const stats = session.getSessionStats();''',
    1,
))

MJS_EDITS.append((
    "proiezione messaggi condizionale",
    '''  const supported = supportedLevels(model);
  const messages = [];

  for (const msg of session.state.messages) {
    const ui = toUiMessage(msg);
    if (ui) messages.push(ui);
  }''',
    '''  const supported = supportedLevels(model);
  const messages = [];

  // La conversazione è ~98% del payload: la si costruisce solo quando serve
  // davvero (evento `messages`), non a ogni aggiornamento di stato.
  if (includeMessages) {
    for (const msg of session.state.messages) {
      const ui = toUiMessage(msg);
      if (ui) messages.push(ui);
    }
  }''',
    1,
))

# --- 6. auth nello state: visibilità sulla mappa
MJS_EDITS.append((
    "trackedIps nello state",
    '''    auth: {
      maxFails: AUTH_MAX_FAILS,
      blockedIps: [...authFails.values()].filter((s) => s.blockedUntil > Date.now()).length,
      blockedTotal: authBlockedTotal,
    },''',
    '''    auth: {
      maxFails: AUTH_MAX_FAILS,
      blockedIps: [...authFails.values()].filter((s) => s.blockedUntil > Date.now()).length,
      blockedTotal: authBlockedTotal,
      trackedIps: authFails.size,
      maxEntries: AUTH_MAX_ENTRIES,
    },''',
    1,
))

# --- 7. il campo messagesIncluded nel ritorno di getState
MJS_EDITS.append((
    "messagesIncluded nel payload",
    '''    messages,
  };''',
    '''    messagesIncluded: includeMessages,
    messages,
  };''',
    1,
))

# --- 8. helper broadcastState + tutti i punti di invio
MJS_EDITS.append((
    "definizione broadcastState",
    '''// ---- SSE clients --------------------------------------------------------
const clients = new Set();''',
    '''/**
 * Invia lo stato e — solo se la conversazione è cambiata — anche i messaggi.
 * Prima ogni evento `state` rimandava tutta la chat (centinaia di KB per volta).
 */
function broadcastState({ messages = true } = {}) {
  const st = getState(messages);
  if (messages) broadcast("messages", { messages: st.messages });
  delete st.messages;
  broadcast("state", st);
}

// ---- SSE clients --------------------------------------------------------
const clients = new Set();''',
    1,
))

MJS_EDITS.append((
    "tutti i broadcast di stato",
    'broadcast("state", getState());',
    "broadcastState();",
    12,
))

# --- 9. cinque invii che NON cambiano la conversazione: stato leggero
for desc, ctx in (
    ("thinking → stato leggero", "session.setThinkingLevel(level);"),
    ("subagents → stato leggero", "applySubagentLimit();\n      applyToolGate();"),
    ("goals → stato leggero", "applyToolGate();"),
    ("model → stato leggero", "await session.setModel(m);"),
    ("sessions/rename → stato leggero", "session.sessionManager.appendSessionInfo(name);"),
):
    MJS_EDITS.append((
        desc,
        f"{ctx}\n      broadcastState();",
        f"{ctx}\n      broadcastState({{ messages: false }});",
        1,
    ))

# --- 10. validazione e guardie sulle route dei file
MJS_EDITS.append((
    "mkdir: path obbligatorio",
    '''    if (req.method === "POST" && url.pathname === "/api/file/mkdir") {
      const body = await readBody(req);
      const abs = await safeResolve(String(body.path || ""), { allowMissing: true });''',
    '''    if (req.method === "POST" && url.pathname === "/api/file/mkdir") {
      const body = await readBody(req);
      const p = String(body.path || "").trim();
      if (!p) return json(res, 400, { error: "path mancante" });
      const abs = await safeResolve(p, { allowMissing: true });''',
    1,
))

MJS_EDITS.append((
    "rename: guardie root e path vuoti",
    '''    if (req.method === "POST" && url.pathname === "/api/file/rename") {
      const body = await readBody(req);
      const from = await safeResolve(String(body.from || ""));
      const to = await safeResolve(String(body.to || ""), { allowMissing: true });
      await fs.rename(from, to);
      return json(res, 200, { ok: true, path: relative(ROOT, to) });
    }''',
    '''    if (req.method === "POST" && url.pathname === "/api/file/rename") {
      const body = await readBody(req);
      const fromRaw = String(body.from || "").trim();
      const toRaw = String(body.to || "").trim();
      if (!fromRaw || !toRaw) return json(res, 400, { error: "from e to sono obbligatori" });
      const from = await safeResolve(fromRaw);
      const to = await safeResolve(toRaw, { allowMissing: true });
      if (from === ROOT) return json(res, 400, { error: "non puoi spostare la root" });
      if (to === ROOT) return json(res, 400, { error: "destinazione non valida" });
      if (to === from) return json(res, 400, { error: "origine e destinazione coincidono" });
      if (to.startsWith(from + sep)) return json(res, 400, { error: "non puoi spostare una cartella dentro se stessa" });
      await fs.rename(from, to);
      return json(res, 200, { ok: true, path: relative(ROOT, to) });
    }''',
    1,
))

MJS_EDITS.append((
    "delete: path obbligatorio",
    '''    if (req.method === "POST" && url.pathname === "/api/file/delete") {
      const body = await readBody(req);
      const abs = await safeResolve(String(body.path || ""));''',
    '''    if (req.method === "POST" && url.pathname === "/api/file/delete") {
      const body = await readBody(req);
      const p = String(body.path || "").trim();
      if (!p) return json(res, 400, { error: "path mancante" });
      const abs = await safeResolve(p);''',
    1,
))

MJS_EDITS.append((
    "sessions/rename: nome obbligatorio",
    '''      const name = String(body.name || "").trim().slice(0, 80);
      if (!session) return json(res, 400, { error: "nessuna sessione" });''',
    '''      const name = String(body.name || "").trim().slice(0, 80);
      if (!name) return json(res, 400, { error: "nome mancante" });
      if (!session) return json(res, 400, { error: "nessuna sessione" });''',
    1,
))

# --- 11. versione + elenco funzioni esposte da /api/health
MJS_EDITS.append((
    "bump VERSION",
    'const VERSION = "dashboard-2026-09-17.2";',
    'const VERSION = "dashboard-2026-09-18.3";',
    1,
))

MJS_EDITS.append((
    "features in /api/health",
    '''          "pwa-assets",
          "backup-timer",
        ],''',
    '''          "pwa-assets",
          "backup-timer",
          "compact-endpoint",
          "state-messages-event",
          "auth-bruteforce-last-hop",
          "auth-credentials-before-block",
          "file-rename-root-guard",
        ],''',
    1,
))

# --------------------------------------------------------------- dashboard.html
HTML_EDITS = []

HTML_EDITS.append((
    "client: messaggi solo quando presenti",
    '''  renderStats(st);
  renderMessages(st.messages || []);
  if (drawer.classList.contains("open")) loadSessions();
});''',
    '''  renderStats(st);
  // Lo stato arriva leggero: la conversazione la manda l'evento `messages`,
  // solo quando cambia davvero.
  if (st.messagesIncluded) renderMessages(st.messages || []);
  if (drawer.classList.contains("open")) loadSessions();
});
es.addEventListener("messages", (e) => {
  try {
    renderMessages((JSON.parse(e.data).messages) || []);
  } catch {}
});''',
    1,
))


def main():
    print(f"{'DRY RUN' if DRY else 'APPLICO'} — {MJS.name}")
    patch(MJS, MJS_EDITS)
    print(f"{'DRY RUN' if DRY else 'APPLICO'} — {HTML.name}")
    patch(HTML, HTML_EDITS)
    print("fatto." + ("  (nessuna scrittura: dry run)" if DRY else ""))


if __name__ == "__main__":
    main()
