/**
 * Decision_M: il decisore tipizzato locale come SERVIZIO A RICHIESTA.
 * Motore: Rizzo Flow (progetto aperto a monte).
 *
 * Il motore (github.com/Rizzo-AI-Academy/rizzo-flow) risponde a domande tipizzate
 * (`noul` / `choice` / `score`) con probabilità, senza generare un solo token: è la stessa
 * forma di decisione di una System One API, servita in locale da un modello Spark-X2.5-4B
 * su llama.cpp. Il modello non sta in una GPU ma sulla CPU, e questo ha un prezzo preciso:
 *
 *   ~5,7 GB di RAM residenti e ~12 s per richiesta su uno stato breve (misurato su questa
 *   VPS: 6 vCPU Broadwell, Q4_K_M, 6 thread; ~21 token/s di prefill, quindi uno stato lungo
 *   da 5.000 token costa ~4 minuti).
 *
 * Per questo il servizio non sta acceso sempre: si accende quando serve e si spegne quando
 * non serve, liberando RAM e CPU. Questo modulo è l'unico posto che conosce il processo:
 * avvio, salute, memoria occupata, arresto — e un file di preferenze su disco perché la
 * scelta sopravviva al riavvio della dashboard.
 *
 * Confine del modulo: qui NON si sa nulla dell'agente, dei tool o della UI. Riceve
 * `mediaDir`, un `log` e un `onChange` da chiamare quando lo stato cambia.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { availableParallelism, cpus } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_DIR = process.env.DASH_DECISION_M_DIR || "/root/rizzo-flow";
const DEFAULT_PORT = Number(process.env.DASH_DECISION_M_PORT) || 8017;
/** File GGUF attesi per ogni variante: servono a dire "non installato" PRIMA di provare ad avviare. */
const GGUF = {
  "4b q4_k_m": "spark-x2.5-4b-rizzo-flow-lora-q4_k_m.gguf",
  "4b q8_0": "spark-x2.5-4b-rizzo-flow-lora-q8_0.gguf",
  "1.7b q8_0": "spark-x2.5-1.7b-rizzo-flow-lora-q8_0.gguf",
};
const SIZES = ["4b", "1.7b"];
const QUANTS = ["q8_0", "q4_k_m", "bf16"];
const WEIGHTS = ["flow", "base"];
/** Quanto si aspetta il caricamento del modello. Misurato: ~25 s a caldo, oltre 60 s se il
 *  disco è freddo e i 2,5 GB di pesi vanno letti la prima volta. */
const READY_TIMEOUT_MS = Number(process.env.DASH_DECISION_M_READY_MS) || 180_000,
  STOP_TIMEOUT_MS = 15_000;

function defaultThreads() {
  try {
    return Math.max(1, Number(availableParallelism?.() ?? cpus().length) || 6);
  } catch {
    return 6;
  }
}

/** Un numero intero entro i limiti, altrimenti il valore di ripiego. */
function clampInt(value, min, max, fallback) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

export function createDecisionMService({ mediaDir, log = (m) => console.log(m), onChange = () => {} }) {
  const prefsFile = process.env.DASH_DECISION_M_PREFS_FILE || join(mediaDir, "decision-m-prefs.json");
  const logFile = process.env.DASH_DECISION_M_LOG_FILE || join(mediaDir, "decision-m-serve.log");
  const pidFile = process.env.DASH_DECISION_M_PID_FILE || join(mediaDir, "decision-m.pid");
  /** `DASH_DECISION_M=off` toglie del tutto la feature (istanze di servizio, test automatici). */
  const available = String(process.env.DASH_DECISION_M ?? "on").trim().toLowerCase() !== "off";

  const prefs = {
    enabled: false,
    dir: DEFAULT_DIR,
    port: DEFAULT_PORT,
    size: "4b",
    quant: "q4_k_m",
    weights: "flow",
    threads: defaultThreads(),
  };
  try {
    const raw = JSON.parse(readFileSync(prefsFile, "utf8"));
    if (typeof raw?.enabled === "boolean") prefs.enabled = raw.enabled;
    if (typeof raw?.dir === "string" && raw.dir.trim()) prefs.dir = raw.dir.trim();
    prefs.port = clampInt(raw?.port, 1024, 65535, prefs.port);
    if (SIZES.includes(raw?.size)) prefs.size = raw.size;
    if (QUANTS.includes(raw?.quant)) prefs.quant = raw.quant;
    if (WEIGHTS.includes(raw?.weights)) prefs.weights = raw.weights;
    prefs.threads = clampInt(raw?.threads, 1, 64, prefs.threads);
  } catch {
    /* nessuna preferenza salvata: si parte spento (nessuna risorsa occupata a sorpresa) */
  }

  function savePrefs() {
    // Scrittura sincrona: file minuscolo, scritto raramente, e così quando l'API risponde la
    // scelta è già su disco per chi la rilegge subito dopo (test, script di deploy, riavvio).
    try {
      writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
    } catch (err) {
      log(`[Decision_M] preferenze non salvate: ${err?.message ?? err}`);
    }
  }

  const pythonBin = () => join(prefs.dir, ".venv", "bin", "python");
  const rizzoCli = () => join(prefs.dir, ".venv", "bin", "rizzo");
  const ggufPath = () => join(prefs.dir, "models", "rizzo-flow", GGUF[`${prefs.size} ${prefs.quant}`] || "");

  /** L'installazione c'è? (venv + pesi della variante scelta). Se no, non si prova nemmeno. */
  function installState() {
    const missing = [];
    if (!existsSync(pythonBin())) missing.push(`${pythonBin()} (venv)`);
    if (!existsSync(rizzoCli())) missing.push(`${rizzoCli()} (CLI)`);
    if (!existsSync(ggufPath())) missing.push(`${ggufPath()} (pesi)`);
    return { ok: missing.length === 0, missing };
  }

  let pid = null;
  let startedAtMs = 0;
  let starting = false;
  let lastError = null;
  let metadata = null; // /health del servizio: fonte di verità su modello e device
  let lastReadyAt = 0;
  let waiters = []; // promesse in attesa della readiness (tool dell'agente, test)

  /** Il processo risponde ancora? `kill(pid, 0)` non manda nulla: verifica solo l'esistenza. */
  function alive(p) {
    if (!Number.isInteger(p) || p <= 0) return false;
    try {
      process.kill(p, 0);
      return true;
    } catch {
      return false;
    }
  }

  /** RAM residente del processo, in MB. È il numero che l'utente vuole vedere. */
  function rssMb(p) {
    try {
      const txt = readFileSync(`/proc/${p}/status`, "utf8");
      const m = txt.match(/^VmRSS:\s+(\d+)\s+kB/m);
      return m ? Math.round(Number(m[1]) / 1024) : null;
    } catch {
      return null;
    }
  }

  /** Ultime righe del log del servizio (per capire un avvio fallito dalla dashboard). */
  async function logTail(lines = 12) {
    try {
      const txt = await fs.readFile(logFile, "utf8");
      return txt.trimEnd().split("\n").slice(-lines);
    } catch {
      return [];
    }
  }

  const baseUrl = () => `http://127.0.0.1:${prefs.port}`;

  /** `/health` del servizio: risponde solo quando il modello è CARICATO e pronto a decidere. */
  async function fetchHealth(timeoutMs = 1500) {
    try {
      const r = await fetch(`${baseUrl()}/health`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function noteChange() {
    try {
      onChange(snapshot());
    } catch (err) {
      log(`[Decision_M] onChange fallita: ${err?.message ?? err}`);
    }
  }

  function snapshot() {
    const inst = installState();
    return {
      available,
      enabled: available && prefs.enabled,
      installed: inst.ok,
      missing: inst.missing,
      dir: prefs.dir,
      port: prefs.port,
      size: prefs.size,
      quant: prefs.quant,
      weights: prefs.weights,
      threads: prefs.threads,
      gguf: inst.ok ? ggufPath().split("/").pop() : null,
      process: {
        pid,
        running: alive(pid),
        starting,
        ready: !!metadata,
        sinceMs: startedAtMs || null,
        uptimeMs: startedAtMs ? Date.now() - startedAtMs : null,
        rssMb: alive(pid) ? rssMb(pid) : null,
      },
      model: metadata
        ? {
            // `rizzo-flow-4b-q4_k_m` per il fine-tune, `rizzo-spark-x2.5-4b-q4_k_m` per i pesi originali
            source: metadata.gguf_source || metadata.source || null,
            precision: metadata.precision || null,
            device: metadata.device || null,
            backend: metadata.backend || null,
          }
        : null,
      lastReadyAt: lastReadyAt || null,
      error: lastError,
    };
  }

  function resolveWaiters() {
    const list = waiters;
    waiters = [];
    for (const w of list) w();
  }

  /** Avvia il processo e attende che sia PRONTO. Ritorna lo snapshot finale. */
  async function start({ timeoutMs = READY_TIMEOUT_MS } = {}) {
    if (!available) throw new Error("feature Decision_M disattivata all'avvio (DASH_DECISION_M=off)");
    if (starting) throw new Error("avvio già in corso");
    const inst = installState();
    if (!inst.ok) throw new Error(`installazione incompleta: manca ${inst.missing.join(", ")}`);
    if (alive(pid) && (await fetchHealth())) return snapshot();

    starting = true;
    lastError = null;
    metadata = null;
    try {
      // Log in append: la coda di un avvio fallito resta leggibile dalla dashboard.
      const out = await fs.open(logFile, "a");
      const args = [
        rizzoCli(),
        "serve",
        "--device",
        "cpu",
        "--threads",
        String(prefs.threads),
        "--size",
        prefs.size,
        "--quant",
        prefs.quant,
        "--weights",
        prefs.weights,
        "--port",
        String(prefs.port),
      ];
      log(`[Decision_M] avvio: ${pythonBin()} ${args.join(" ")}`);
      const child = spawn(pythonBin(), args, {
        cwd: prefs.dir,
        detached: true, // gruppo di processi proprio: si arresta tutto il gruppo, non solo il figlio
        stdio: ["ignore", out.fd, out.fd],
        env: process.env,
      });
      child.on("error", (err) => {
        lastError = `avvio non riuscito: ${err?.message ?? err}`;
        log(`[Decision_M] ${lastError}`);
      });
      // `detached` + unref: il servizio sopravvive a chi lo ha avviato, ma muore col cgroup
      // del servizio (KillMode=control-group), quindi un riavvio della dashboard non lascia
      // mai un modello orfano da 5,7 GB.
      child.unref();
      // Il figlio ha ereditato il descrittore: il padre lo chiude subito, altrimenti ogni
      // avvio lascerebbe un file aperto nel processo della dashboard.
      await out.close().catch(() => {});
      pid = child.pid;
      startedAtMs = Date.now();
      try {
        writeFileSync(pidFile, `${pid}\n`);
      } catch {
        /* il pid resta in memoria */
      }
    } catch (err) {
      starting = false;
      lastError = String(err?.message ?? err);
      noteChange();
      throw err;
    }

    const deadline = Date.now() + timeoutMs;
    let health = await fetchHealth();
    while (!health && Date.now() < deadline) {
      if (!alive(pid)) {
        starting = false;
        lastError = "il processo è terminato durante l'avvio (vedi il log del servizio)";
        noteChange();
        throw new Error(lastError);
      }
      await new Promise((r) => setTimeout(r, 1000));
      health = await fetchHealth();
    }
    starting = false;
    if (!health) {
      lastError = `il servizio non è pronto entro ${Math.round(timeoutMs / 1000)} s`;
      noteChange();
      throw new Error(lastError);
    }
    metadata = health.model || {};
    lastReadyAt = Date.now();
    log(`[Decision_M] pronto su ${baseUrl()} (pid ${pid}, ${rssMb(pid) ?? "?"} MB)`);
    noteChange();
    resolveWaiters();
    return snapshot();
  }

  /** Arresta il servizio (gruppo di processi) e aspetta che la porta sia libera. */
  async function stop() {
    const target = alive(pid) ? pid : null;
    if (!target) {
      pid = null;
      metadata = null;
      starting = false;
      try {
        await fs.rm(pidFile, { force: true });
      } catch {
        /* niente */
      }
      noteChange();
      return snapshot();
    }
    starting = false;
    try {
      process.kill(-target, "SIGTERM"); // segno meno: tutto il gruppo (python + worker)
    } catch {
      try {
        process.kill(target, "SIGTERM");
      } catch {
        /* già morto */
      }
    }
    const deadline = Date.now() + STOP_TIMEOUT_MS;
    while (alive(target) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    if (alive(target)) {
      log(`[Decision_M] arresto forzato del processo ${target}`);
      try {
        process.kill(-target, "SIGKILL");
      } catch {
        try {
          process.kill(target, "SIGKILL");
        } catch {
          /* niente da fare */
        }
      }
      const hard = Date.now() + 5000;
      while (alive(target) && Date.now() < hard) await new Promise((r) => setTimeout(r, 100));
    }
    pid = null;
    metadata = null;
    startedAtMs = 0;
    try {
      await fs.rm(pidFile, { force: true });
    } catch {
      /* niente */
    }
    log("[Decision_M] fermato: RAM e CPU liberate");
    noteChange();
    return snapshot();
  }

  /**
   * Accende o spegne la feature. ON = preferenza salvata + servizio avviato e pronto;
   * OFF = preferenza salvata + processo terminato (nessuna risorsa occupata).
   */
  async function setEnabled(on) {
    prefs.enabled = !!on;
    savePrefs();
    if (prefs.enabled) await start();
    else await stop();
    noteChange();
    return snapshot();
  }

  /** Impostazioni della variante (porta, quantizzazione, thread): richiede un riavvio. */
  function configure(patch = {}) {
    let restart = false;
    if (patch.dir !== undefined) {
      const d = String(patch.dir).trim();
      if (!d) throw new Error("dir non può essere vuota");
      prefs.dir = resolve(d);
    }
    if (patch.port !== undefined) prefs.port = clampInt(patch.port, 1024, 65535, prefs.port);
    if (patch.size !== undefined) {
      if (!SIZES.includes(patch.size)) throw new Error(`size deve essere ${SIZES.join(" o ")}`);
      prefs.size = patch.size;
      restart = true;
    }
    if (patch.quant !== undefined) {
      if (!QUANTS.includes(patch.quant)) throw new Error(`quant deve essere ${QUANTS.join(", ")}`);
      prefs.quant = patch.quant;
      restart = true;
    }
    if (patch.weights !== undefined) {
      if (!WEIGHTS.includes(patch.weights)) throw new Error(`weights deve essere ${WEIGHTS.join(" o ")}`);
      prefs.weights = patch.weights;
      restart = true;
    }
    if (patch.threads !== undefined) {
      prefs.threads = clampInt(patch.threads, 1, 64, prefs.threads);
      restart = true;
    }
    savePrefs();
    noteChange();
    return { snapshot: snapshot(), restart };
  }

  /**
   * Stato consolidato per la UI: unisce preferenze, processo e `/health` quando è pronto.
   * È la sola chiamata che la dashboard e i tool devono usare per decidere cosa mostrare.
   */
  async function status() {
    const snap = snapshot();
    if (snap.process.running) {
      const health = await fetchHealth(3000);
      if (health) {
        metadata = health.model || {};
        snap.model = {
          source: metadata.gguf_source || metadata.source || null,
          precision: metadata.precision || null,
          device: metadata.device || null,
          backend: metadata.backend || null,
        };
        snap.process.ready = true;
        snap.process.rssMb = rssMb(pid);
      } else {
        // Il processo c'è ma non risponde: se sta caricando è normale, se è passato troppo
        // tempo è un avvio incagliato e va detto (con la coda del log).
        snap.process.ready = false;
        snap.error =
          starting || Date.now() - startedAtMs < READY_TIMEOUT_MS
            ? "caricamento del modello in corso"
            : "il processo è vivo ma non risponde su /health";
      }
    } else {
      metadata = null;
      snap.process.ready = false;
    }
    if (!snap.process.running) snap.logTail = await logTail();
    return snap;
  }

  /** Aspetta la readiness (per il tool dell'agente e per i test): risolve o lancia. */
  async function waitReady(timeoutMs = READY_TIMEOUT_MS) {
    if (await fetchHealth()) {
      metadata = metadata || (await fetchHealth())?.model || {};
      return snapshot();
    }
    if (!alive(pid) && !starting) throw new Error("servizio spento");
    await new Promise((resolve_, reject) => {
      const timer = setTimeout(() => {
        waiters = waiters.filter((w) => w !== done);
        reject(new Error(`il servizio non è pronto entro ${Math.round(timeoutMs / 1000)} s`));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve_();
      };
      waiters.push(done);
    });
    return snapshot();
  }

  /**
   * Una richiesta di decisioni al servizio (wire TypeSafe/System One). Non genera testo:
   * `output_tokens: 0`. Il timeout è generoso perché su CPU una richiesta è ~12 s e uno
   * stato lungo arriva a minuti.
   */
  async function decide(payload, { timeoutMs = 600_000 } = {}) {
    if (!alive(pid)) throw new Error("servizio spento");
    const r = await fetch(`${baseUrl()}/v1/systemone`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "rizzo-latest", ...payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 2000) };
    }
    if (!r.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body);
      throw new Error(`il servizio ha risposto ${r.status}: ${detail.slice(0, 500)}`);
    }
    return body;
  }

  /** All'avvio della dashboard: se la preferenza dice ACCESO, il servizio viene riacceso. */
  async function boot() {
    if (!available || !prefs.enabled) {
      noteChange();
      return snapshot();
    }
    const inst = installState();
    if (!inst.ok) {
      lastError = `installazione incompleta: manca ${inst.missing.join(", ")}`;
      prefs.enabled = false;
      savePrefs();
      noteChange();
      return snapshot();
    }
    try {
      await start();
    } catch (err) {
      lastError = String(err?.message ?? err);
      log(`[Decision_M] avvio automatico non riuscito: ${lastError}`);
    }
    return snapshot();
  }

  // Un pid salvato da un'esecuzione precedente (dashboard riavviata) non vale come stato:
  // si verifica che il processo esista davvero e che risponda, altrimenti si ripulisce.
  try {
    const saved = Number(readFileSync(pidFile, "utf8").trim());
    if (Number.isInteger(saved) && saved > 0 && alive(saved)) {
      pid = saved;
      startedAtMs = Date.now();
      log(`[Decision_M] processo ${saved} già in esecuzione (ripreso dal pid file)`);
    } else {
      void fs.rm(pidFile, { force: true });
    }
  } catch {
    /* nessun pid salvato */
  }

  if (!existsSync(prefsFile)) savePrefs();

  return {
    prefs,
    prefsFile,
    logFile,
    snapshot,
    status,
    start,
    stop,
    setEnabled,
    configure,
    waitReady,
    decide,
    boot,
    available,
    baseUrl,
    /** Il servizio è pronto a rispondere adesso? */
    isReady: async () => !!(await fetchHealth()),
    /** Solo per i test: dimensione del log su disco. */
    logSize: () => {
      try {
        return statSync(logFile).size;
      } catch {
        return 0;
      }
    },
  };
}
