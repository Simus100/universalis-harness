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
import { chmodSync, chownSync, copyFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);

const BROWSER_USER = process.env.DASH_BROWSER_USER || "pi-browser";
// Si usa il wrapper /usr/local/bin/pbrowser, che impone un profilo Chrome PERSISTENTE
// (senza, agent-browser userebbe un profilo temporaneo in /tmp e i login andrebbero persi
// alla chiusura del daemon). Vedi media/pbrowser.
const BROWSER_BIN = process.env.DASH_BROWSER_BIN || "/usr/local/bin/pbrowser";
const TIMEOUT_MS = Number(process.env.DASH_BROWSER_TIMEOUT_MS) || 60_000;
const MAX_OUTPUT = 4 * 1024 * 1024;
// Cartella di transito per screenshot e pdf. La CLI gira come utente dedicato e NON può
// scrivere in media/ (che sta sotto la root della dashboard, di proprietà di root: verificato
// «Permission denied, os error 13»). Lì scrive; il processo della dashboard, che è root,
// sposta il file in media/. La sottocartella è dell'utente dedicato, con permessi 0700.
const BROWSER_OUT_ROOT = process.env.DASH_BROWSER_OUT_DIR || join(tmpdir(), "pi-browser-out");

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

  /** Cartella di transito dell'utente dedicato (creata una volta sola, in modo ASINCRONO :
   *  nessuna chiamata bloccante, l'event loop non si ferma). */
  let outDirPromise = null;
  async function ensureOutDir() {
    if (!outDirPromise) {
      outDirPromise = (async () => {
        const dir = join(BROWSER_OUT_ROOT, BROWSER_USER);
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        try {
          const { stdout: uidOut } = await execFileAsync("id", ["-u", BROWSER_USER], { encoding: "utf8" });
          const { stdout: gidOut } = await execFileAsync("id", ["-g", BROWSER_USER], { encoding: "utf8" });
          const uid = Number(String(uidOut).trim());
          const gid = Number(String(gidOut).trim());
          if (Number.isInteger(uid) && Number.isInteger(gid)) {
            chownSync(dir, uid, gid);
            chmodSync(dir, 0o700);
          } else {
            chmodSync(dir, 0o777);
          }
        } catch {
          // utente non risolvibile (ambiente di prova): cartella comunque scrivibile
          try { chmodSync(dir, 0o777); } catch { /* niente da fare */ }
        }
        return dir;
      })();
    }
    return outDirPromise;
  }

  /** Percorso di destinazione di un file generato, confinato in media/. */
  function mediaPath(p, fallbackName) {
    const name = basename(String(p || "")) || fallbackName;
    return resolve(join(mediaDir, name));
  }

  /** Percorso TEMPORANEO (scrivibile dall'utente dedicato) in cui la CLI salva il file. */
  async function stagedPath(p, fallbackName) {
    const name = basename(String(p || "")) || fallbackName;
    return join(await ensureOutDir(), name);
  }

  /** Sposta in media/ il file prodotto fuori root (lo fa il processo della dashboard, root). */
  function moveIntoMedia(staged, target) {
    mkdirSync(dirname(target), { recursive: true });
    try {
      renameSync(staged, target);
    } catch (e) {
      if (e?.code === "EXDEV") {
        copyFileSync(staged, target);
        unlinkSync(staged);
      } else {
        throw e;
      }
    }
    try { chmodSync(target, 0o644); } catch { /* permessi non modificabili: non è un errore */ }
    return target;
  }

  /**
   * Traduce l'azione in ordine di esecuzione: `{ args, out }`.
   * `out`, quando c'è, dice dove la CLI scrive (`staged`) e dove il file deve finire (`target`):
   * screenshot e pdf passano dalla cartella di transito perché l'utente dedicato non può
   * scrivere in media/. Tutto il resto ha `out: null`.
   */
  function buildArgs(params, stagedFile = null) {
    const a = String(params?.action || "");
    const ref = params?.ref ? normalizeRef(params.ref) : null;
    const need = (v, what) => {
      if (!v) throw new Error(`parametro "${what}" obbligatorio per action=${a}`);
      return v;
    };
    const outFor = (p, fallbackName) => {
      if (!stagedFile) throw new Error("percorso temporaneo non preparato per questa azione");
      return { staged: stagedFile, target: mediaPath(p, fallbackName) };
    };
    switch (a) {
      case "open": {
        const url = need(params?.url, "url");
        if (!/^https?:\/\//i.test(url)) throw new Error("url deve iniziare con http:// o https://");
        return { args: ["open", url], out: null };
      }
      case "snapshot": return { args: ["snapshot"], out: null };
      case "read": return { args: ["read"], out: null };
      case "back": return { args: ["back"], out: null };
      case "reload": return { args: ["reload"], out: null };
      case "status": return { args: null, out: null }; // gestita a parte
      case "click": {
        const r = need(ref, "ref");
        if (!REF_RE.test(r)) throw new Error(`ref non valido: "${r}" (atteso un ref dello snapshot, es. @e12)`);
        return { args: ["click", r], out: null };
      }
      case "fill":
      case "type": {
        const r = need(ref, "ref");
        if (!REF_RE.test(r)) throw new Error(`ref non valido: "${r}"`);
        return { args: [a, r, need(params?.text, "text")], out: null };
      }
      case "press": return { args: ["press", need(params?.key, "key")], out: null };
      case "scroll": return { args: ["scroll", params?.direction || "down", String(params?.px ?? 500)], out: null };
      case "get": {
        const what = String(params?.what || "text");
        // url e title non riguardano un elemento: pretendere un ref qui è un attrito inutile
        if (what === "url" || what === "title") return { args: ["get", what], out: null };
        const r = need(ref, "ref");
        if (!REF_RE.test(r)) throw new Error(`ref non valido: "${r}"`);
        return { args: ["get", what, r], out: null };
      }
      case "screenshot": {
        const o = outFor(params?.path, "screenshot.png");
        return { args: ["screenshot", o.staged], out: o };
      }
      case "pdf": {
        const o = outFor(params?.path, "pagina.pdf");
        return { args: ["pdf", o.staged], out: o };
      }
      case "eval": return { args: ["eval", need(params?.code, "code")], out: null };
      // chiude SOLO la sessione dell'agente: `close --all` chiuderebbe anche le sessioni
      // dell'utente (per esempio il browser che sta guardando nella live view)
      case "close": return { args: ["close"], out: null };
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

      let plan;
      try {
        // screenshot e pdf passano da una cartella di transito scrivibile dall'utente dedicato
        const staged = action === "screenshot" || action === "pdf"
          ? await stagedPath(params?.path, action === "pdf" ? "pagina.pdf" : "screenshot.png")
          : null;
        plan = buildArgs(params, staged);
      } catch (e) {
        return { content: [{ type: "text", text: String(e.message || e) }], details: {}, isError: true };
      }
      const args = plan.args;

      try {
        onActivity(); // segnala l'uso: serve all'accensione "auto" del tool
        const out = await runCli(args);
        let text = out.trim() || "(nessun output)";
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
        // screenshot/pdf: la CLI ha scritto nella cartella di transito (l'utente dedicato non
        // può scrivere in media/). Il processo della dashboard, che è root, sposta il file e
        // corregge il percorso nel testo restituito al modello.
        if (plan.out) {
          const { staged, target } = plan.out;
          try {
            if (!existsSync(staged) || !statSync(staged).isFile()) {
              throw new Error(`la CLI non ha prodotto il file atteso (${staged})`);
            }
            const finalPath = moveIntoMedia(staged, target);
            text = text.split(staged).join(finalPath);
            if (!text.includes(finalPath)) text += `\n(file salvato in ${finalPath})`;
          } catch (e) {
            return {
              content: [{
                type: "text",
                text:
                  `il file generato (${basename(staged)}) è rimasto fuori da media/ e non è stato ` +
                  `possibile spostarlo: ${e?.message ?? e}`,
              }],
              details: { args, staged, target },
              isError: true,
            };
          }
        }
        return {
          content: [{ type: "text", text: text + extra }],
          details: { args, exit: 0, ...(plan.out ? { file: plan.out.target } : {}) },
        };
      } catch (e) {
        // la CLI ha fallito: nessun file da spostare, si ripulisce l'eventuale residuo
        if (plan.out) {
          try {
            if (existsSync(plan.out.staged)) unlinkSync(plan.out.staged);
          } catch {
            /* niente da fare */
          }
        }
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
