/**
 * Tool `browser` per Universalis Harness — pilota agent-browser (CLI su Chrome DevTools Protocol).
 *
 * SICUREZZA (vincoli verificati il 18/09/2026, vedi media/verifica-empirica-browser.md):
 *
 *  V1. L'invocazione passa SEMPRE da `sudo -u <utente dedicato>`.
 *      Come root la CLI parte e funziona SENZA errori ma con la sandbox DISATTIVATA
 *      (chrome://sandbox: Layer None, PID/Network namespaces No, Seccomp-BPF No,
 *      "You are NOT adequately sandboxed"). È un fallimento silenzioso: per questo
 *      il tool verifica lo stato della sandbox e si RIFIUTA di operare se non è adeguata.
 *
 *  V2. I ref dello snapshot non sono stabili e non ripartono da e1: la description
 *      impone di usare i ref dello snapshot corrente e di rifare lo snapshot dopo
 *      ogni navigazione.
 *
 *  V3. Una sessione headless costa ~1,7 GB di RAM (19 processi Chrome, misurato).
 *      agent-browser usa una sola sessione "default" per utente, quindi il tool non
 *      moltiplica le istanze; l'azione close chiude tutto e la verifica di sandbox
 *      chiude il browser di servizio che ha usato (altrimenti resterebbe appeso).
 *
 * Nessuna shell arbitraria: si usa execFile con array di argomenti (niente `sh -c`),
 * quindi non esiste superficie di shell injection. I ref, gli URL e i percorsi sono
 * comunque validati prima di essere passati alla CLI.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";

const execFileAsync = promisify(execFile);

const BROWSER_USER = process.env.DASH_BROWSER_USER || "pi-browser";
// Si usa il wrapper /usr/local/bin/pbrowser, che impone un profilo Chrome PERSISTENTE
// (senza, agent-browser userebbe un profilo temporaneo in /tmp e i login andrebbero persi
// alla chiusura del daemon). Vedi media/pbrowser.
const BROWSER_BIN = process.env.DASH_BROWSER_BIN || "/usr/local/bin/pbrowser";
const TIMEOUT_MS = Number(process.env.DASH_BROWSER_TIMEOUT_MS) || 60_000;
const MAX_OUTPUT = 4 * 1024 * 1024;

const ACTIONS = [
  "open", "snapshot", "read", "click", "fill", "type", "press", "scroll",
  "get", "screenshot", "pdf", "eval", "back", "reload", "close", "status",
];

/** Sessione separata usata SOLO per la verifica della sandbox.
 *  Serve a non toccare le sessioni dell'utente: un `close --all` chiuderebbe anche il
 *  browser che sta guardando la live view (bug trovato con un test reale). */
const SANDBOX_SESSION = "sandbox-check";

const REF_RE = /^@?e\d+$/;

/** Esegue la CLI come utente dedicato, in modo ASINCRONO.
 *  Non si usa execFileSync: bloccherebbe l'event loop del server per tutta la durata del
 *  comando (fino a un minuto), fermando nel frattempo risposte HTTP e frame della live view. */
async function runCli(args, { timeout = TIMEOUT_MS } = {}) {
  const { stdout } = await execFileAsync(
    "sudo",
    ["-n", "-u", BROWSER_USER, "-H", BROWSER_BIN, ...args],
    { encoding: "utf8", timeout, maxBuffer: MAX_OUTPUT },
  );
  return stdout;
}

const normalizeRef = (ref) => (String(ref || "").startsWith("@") ? String(ref) : `@${ref}`);

/** Estrae un messaggio utile da un errore di esecuzione della CLI. */
function cliError(e) {
  const parts = [e?.message || String(e)];
  if (e?.stderr) parts.push(String(e.stderr).trim().slice(0, 800));
  if (e?.stdout) parts.push(String(e.stdout).trim().slice(0, 800));
  return parts.filter(Boolean).join(" | ");
}

export function createBrowserExtension({
  mediaDir = "/root/pi-harness/media",
  isHumanControlled = () => false,
  onActivity = () => {},
} = {}) {
  /** Stato della sandbox: null = non ancora verificata. */
  let sandboxState = null;

  /**
   * Verifica che Chrome giri con sandbox adeguata. Costoso: si esegue una volta
   * (il risultato è in cache). Alla fine chiude il browser di servizio usato per la
   * verifica, altrimenti resterebbero ~16 processi Chrome (~1,5 GB) appesi.
   */
  async function checkSandbox({ force = false } = {}) {
    if (sandboxState && !force) return sandboxState;
    try {
      await runCli(["--session", SANDBOX_SESSION, "open", "chrome://sandbox"]);
      const text = await runCli(["--session", SANDBOX_SESSION, "read"]);
      const notSandboxed = /NOT adequately sandboxed/i.test(text);
      const ok = /adequately sandboxed/i.test(text) && !notSandboxed;
      const namespaces = /PID namespaces\s*Yes/i.test(text) && /Network namespaces\s*Yes/i.test(text);
      const seccomp = /Seccomp-BPF sandbox\s*Yes/i.test(text);
      sandboxState = {
        ok: ok && namespaces && seccomp,
        text: text.replace(/\n{2,}/g, "\n").trim().slice(0, 1200),
        checks: { namespaces, seccomp },
      };
    } catch (e) {
      sandboxState = { ok: false, text: "verifica sandbox fallita: " + cliError(e), checks: {} };
    } finally {
      // chiude SOLO la sessione di servizio del check, mai le sessioni dell'utente
      try {
        await runCli(["--session", SANDBOX_SESSION, "close"], { timeout: 15_000 });
      } catch {
        /* niente da fare */
      }
    }
    return sandboxState;
  }

  /** Sceglie il percorso di un file generato, confinandolo in media/. */
  function mediaPath(p, fallbackName) {
    if (!p) return join(mediaDir, fallbackName);
    const name = basename(String(p));
    return resolve(join(mediaDir, name || fallbackName));
  }

  /** Traduce l'azione in argomenti CLI, con validazione. */
  function buildArgs(params) {
    const a = String(params?.action || "");
    const ref = params?.ref ? normalizeRef(params.ref) : null;
    const need = (v, what) => {
      if (!v) throw new Error(`parametro "${what}" obbligatorio per action=${a}`);
      return v;
    };
    switch (a) {
      case "open": {
        const url = need(params?.url, "url");
        if (!/^https?:\/\//i.test(url)) throw new Error("url deve iniziare con http:// o https://");
        return ["open", url];
      }
      case "snapshot": return ["snapshot"];
      case "read": return ["read"];
      case "back": return ["back"];
      case "reload": return ["reload"];
      case "status": return null; // gestita a parte
      case "click": {
        const r = need(ref, "ref");
        if (!REF_RE.test(r)) throw new Error(`ref non valido: "${r}" (atteso un ref dello snapshot, es. @e12)`);
        return ["click", r];
      }
      case "fill":
      case "type": {
        const r = need(ref, "ref");
        if (!REF_RE.test(r)) throw new Error(`ref non valido: "${r}"`);
        return [a, r, need(params?.text, "text")];
      }
      case "press": return ["press", need(params?.key, "key")];
      case "scroll": return ["scroll", params?.direction || "down", String(params?.px ?? 500)];
      case "get": {
        const what = String(params?.what || "text");
        // url e title non riguardano un elemento: pretendere un ref qui è un attrito inutile
        if (what === "url" || what === "title") return ["get", what];
        const r = need(ref, "ref");
        if (!REF_RE.test(r)) throw new Error(`ref non valido: "${r}"`);
        return ["get", what, r];
      }
      case "screenshot": return ["screenshot", mediaPath(params?.path, "screenshot.png")];
      case "pdf": return ["pdf", mediaPath(params?.path, "pagina.pdf")];
      case "eval": return ["eval", need(params?.code, "code")];
      // chiude SOLO la sessione dell'agente: `close --all` chiuderebbe anche le sessioni
      // dell'utente (per esempio il browser che sta guardando nella live view)
      case "close": return ["close"];
      default:
        throw new Error(`action sconosciuta: "${a}" (ammesse: ${ACTIONS.join(", ")})`);
    }
  }

  const TOOL = {
    name: "browser",
    label: "Browser",
    description:
      "Pilota un browser reale (Chrome headless via agent-browser) su siti web: apri pagine, " +
      "leggi il contenuto, clicca, compila form, fai screenshot. " +
      "IMPORTANTE SUI REF: `snapshot` restituisce un albero di accessibilità con riferimenti " +
      "tipo [ref=e12]. I ref appartengono alla PAGINA CORRENTE: usa quelli dell'ultimo snapshot " +
      "e rifai lo snapshot dopo ogni navigazione o cambiamento di pagina, perché dopo una " +
      "navigazione i ref cambiano. Non dare per scontato che i ref partano da e1 (in una sessione " +
      "già usata possono essere e18, e19, ...). Non inventare mai un ref: se un click fallisce " +
      "con \"Unknown ref\", rifai lo snapshot e usa i ref nuovi. " +
      "Azioni: open (url), snapshot, read, click (ref), fill (ref,text), type (ref,text), " +
      "press (key), scroll (direction,px), get (what,ref), screenshot (path), pdf (path), " +
      "eval (code), back, reload, close, status. Preferisci snapshot a screenshot: usa molto meno contesto.",
    promptSnippet:
      "browser: naviga siti reali (open/snapshot/click/fill). I ref valgono solo per lo snapshot corrente.",
    promptGuidelines: [
      "Quando usi `browser`, prendi i ref dall'ultimo snapshot e rifai lo snapshot dopo una navigazione: i ref cambiano da pagina a pagina e non partono sempre da e1.",
      "Per il browser preferisci `snapshot` (albero di accessibilità) a `screenshot`: costa molto meno contesto.",
      "Apri un solo browser alla volta e chiudilo con action=close quando hai finito, per non consumare RAM.",
      "Per il flusso completo (form, attesa dei contenuti, auth, più sessioni, errori ricorrenti) leggi la guida aggiornata con la skill `browser`, che rimanda al bundle della CLI.",
    ],
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ACTIONS, description: "azione da eseguire" },
        url: { type: "string", description: "URL assoluto per action=open" },
        ref: { type: "string", description: "riferimento dallo snapshot (es. @e12) per click/fill/type/get" },
        text: { type: "string", description: "testo da digitare (fill/type)" },
        key: { type: "string", description: "tasto da premere (es. Enter, Tab)" },
        what: { type: "string", description: "cosa leggere (es. text, url, title)" },
        direction: { type: "string", enum: ["up", "down", "left", "right"], description: "direzione per scroll" },
        px: { type: "number", description: "pixel per scroll (default 500)" },
        path: { type: "string", description: "nome file per screenshot/pdf (salvato in media/)" },
        code: { type: "string", description: "JavaScript da valutare nella pagina (action=eval)" },
      },
      required: ["action"],
    },
    async execute(_toolCallId, params) {
      const action = String(params?.action || "");

      // status: verifica esplicita della sandbox
      if (action === "status") {
        const s = await checkSandbox({ force: true });
        return {
          content: [{
            type: "text",
            text: (s.ok ? "sandbox OK" : "SANDBOX NON ADEGUATA — browser non utilizzabile") +
              `\nutente: ${BROWSER_USER}\n${s.text}`,
          }],
          details: { sandbox: s },
          isError: !s.ok,
        };
      }

      // lock anti-conflitto: se l'utente ha preso il controllo dalla live view,
      // l'agente non tocca il browser finché non lo restituisce.
      if (action !== "status" && isHumanControlled()) {
        return {
          content: [{
            type: "text",
            text:
              "RIFIUTATO: il controllo del browser è passato all'utente (live view in modalità controllo). " +
              "Non eseguo azioni per non interferire: attendi che l'utente restituisca il controllo.",
          }],
          details: { locked: true },
          isError: true,
        };
      }

      // ogni altra azione richiede una sandbox adeguata
      const s = await checkSandbox();
      if (!s.ok) {
        return {
          content: [{
            type: "text",
            text:
              "RIFIUTATO: il browser non ha una sandbox adeguata, quindi non eseguo l'azione.\n" +
              `utente: ${BROWSER_USER}\n${s.text}\n` +
              "Causa tipica: la CLI sta girando come root (parte senza errori ma senza sandbox). " +
              "Il tool deve invocarla come utente dedicato.",
          }],
          details: { sandbox: s },
          isError: true,
        };
      }

      let args;
      try {
        args = buildArgs(params);
      } catch (e) {
        return { content: [{ type: "text", text: String(e.message || e) }], details: {}, isError: true };
      }

      try {
        onActivity(); // segnala l'uso: serve all'accensione "auto" del tool
        const out = await runCli(args);
        let extra = "";
        // Dopo `open` la pagina può essere ancora about:blank: attendere il DOM evita
        // che le azioni successive leggano una pagina vuota (difetto trovato in uso reale).
        if (action === "open") {
          try {
            await runCli(["wait", "--load", "domcontentloaded"], { timeout: 15_000 });
          } catch {
            extra = "\n(nota: la pagina potrebbe non aver finito di caricarsi; se leggi about:blank, riprova l'azione)";
          }
        }
        return {
          content: [{ type: "text", text: (out.trim() || "(nessun output)") + extra }],
          details: { args, exit: 0 },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `errore eseguendo il browser: ${cliError(e)}` }],
          details: { args, exit: 1 },
          isError: true,
        };
      }
    },
  };

  return {
    name: "browser-tool",
    factory: (pi) => {
      if (!existsSync(BROWSER_BIN)) {
        console.error(`[browser] binario non trovato: ${BROWSER_BIN} — tool non registrato`);
        return;
      }
      pi.registerTool(TOOL);
      console.log(`[browser] tool registrato (utente: ${BROWSER_USER})`);
    },
  };
}
