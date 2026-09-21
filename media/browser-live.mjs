/**
 * Live view del browser per Universalis Harness.
 *
 * La dashboard (server, su 127.0.0.1) fa da PONTE verso lo stream di agent-browser:
 * si connette come client WebSocket a ws://127.0.0.1:<porta> e ripubblica frame, URL
 * e stato sulla SSE della dashboard. Gli input dell'utente (mouse/tastiera) tornano
 * indietro sullo stesso canale.
 *
 * Perché un ponte e non una connessione diretta dal browser:
 *   lo stream accetta solo client con origin localhost/127.0.0.1/::1/file://, e comunque
 *   ascolta su loopback. Un browser che apre https://harness... prenderebbe 403.
 *   Passando dalla dashboard, la live view eredita l'autenticazione esistente (Basic),
 *   non serve nessuna porta nuova e nessuna modifica a Caddy.
 *
 * Il protocollo (verificato il 18/09/2026, vedi media/probe-stream.mjs):
 *   server -> client: {type:"frame", seq, data:<base64 jpeg>, metadata:{deviceWidth,...}}
 *                     {type:"url"|"status"|"tabs"|"console", ...}
 *   client -> server: {type:"input_mouse", eventType, x, y, button, clickCount}
 *                     {type:"input_keyboard", eventType, key, text}
 *                     {type:"config", maxFps|pacing} · {type:"ack", seq}
 *   I frame arrivano solo quando la pagina CAMBIA (delta), non a intervalli fissi.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_FPS = 3;

export function createBrowserLive({
  bin = "/usr/bin/agent-browser",
  user = "pi-browser",
  maxFps = DEFAULT_MAX_FPS,
  onEvent = () => {},
  onLog = () => {},
} = {}) {
  let ws = null;
  let port = null;
  let startedAt = null;
  let frames = 0;
  let lastError = null;
  let idleTimer = null;
  /** Timer di auto-riparazione: lo stream può restare in stato incoerente
   *  (connesso ma senza frame) dopo che le sessioni del browser vengono chiuse. */
  let healTimer = null;
  let healedOnce = false;
  /** Riconnessione automatica: quando il daemon/lo stream si riavvia o cambia porta,
   *  il bridge deve riattaccarsi da solo. Prima restava staccato e la vista sembrava rotta. */
  let autoReconnect = false;
  let reconnectTimer = null;
  let reconnectDelay = 2000;
  /** Ultimo frame ricevuto: permette di mostrare subito la pagina quando si apre la
   *  vista live, senza aspettare che la pagina cambi (i frame arrivano solo ai cambi). */
  let lastFrame = null;
  const FRAME_KEEP_MS = 5 * 60 * 1000;
  const state = { url: "", tabs: [], viewport: null, connected: false, screencasting: false };

  // Esecuzione ASINCRONA della CLI: con execFileSync l'event loop del server resterebbe
  // bloccato per tutta la durata del comando (avvio dello stream, reload…), fermando
  // nel frattempo risposte HTTP e frame della live view.
  const cli = async (args) => {
    const { stdout } = await execFileAsync("sudo", ["-n", "-u", user, "-H", bin, ...args], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  };

  /** La porta dello stream cambia a ogni daemon: va sempre riletta. */
  async function readPort() {
    const st = JSON.parse(await cli(["stream", "status", "--json"]));
    port = st?.data?.port ?? null;
    return port;
  }

  function send(msg) {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(msg));
        return true;
      } catch (e) {
        lastError = String(e?.message || e);
      }
    }
    return false;
  }

  function armIdleTimeout(ms = 15 * 60 * 1000) {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      onLog("[browser-live] chiusura per inattività");
      stop();
    }, ms);
  }

  /** Riprogramma un tentativo di riconnessione con backoff (2s → 3s → … → 15s).
   *  Si ferma solo con uno stop() esplicito, non quando il daemon è momentaneamente giù. */
  function scheduleReconnect(reason) {
    if (!autoReconnect) return;
    if (reconnectTimer) return; // ce n'è già uno in coda
    const d = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
    onLog(`[browser-live] riconnessione tra ${Math.round(d)}ms (${reason})`);
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      if (!autoReconnect) return;
      await start();
    }, d);
  }

  async function start() {
    if (ws) return snapshot();
    autoReconnect = true; // finché non c'è uno stop() esplicito, si vuole restare collegati
    let p;
    try {
      p = await readPort();
    } catch (e) {
      lastError = "impossibile leggere la porta dello stream: " + String(e?.message || e).slice(0, 200);
      onEvent({ type: "error", message: lastError });
      scheduleReconnect("porta non leggibile");
      return snapshot();
    }
    if (!p) {
      lastError = "nessuna porta di streaming disponibile";
      onEvent({ type: "error", message: lastError });
      scheduleReconnect("nessuna porta");
      return snapshot();
    }

    lastError = null;
    // pacing=ack + maxFps: un solo frame in volo e tetto di frequenza, per non
    // saturare la banda su mobile (il tetto è per-client, non tocca gli altri).
    ws = new WebSocket(`ws://127.0.0.1:${p}/?pacing=ack&maxFps=${maxFps}`);
    startedAt = Date.now();
    frames = 0;

    ws.addEventListener("open", () => {
      onLog(`[browser-live] connesso a ws://127.0.0.1:${p}`);
      reconnectDelay = 2000; // connessione riuscita: si azzera il backoff
      send({ type: "config", maxFps });
      state.connected = true;
      onEvent({ type: "live", state: snapshot() });
      armIdleTimeout();

      // Auto-riparazione: se in pochi secondi non arriva NESSUN frame, lo stream è
      // probabilmente in stato incoerente (succede dopo la chiusura delle sessioni:
      // "screencasting: true" ma nessun frame). Si riavvia lo stream una volta sola.
      if (healTimer) clearTimeout(healTimer);
      healTimer = setTimeout(async () => {
        healTimer = null;
        if (frames > 0 || healedOnce) return;
        healedOnce = true;
        onLog("[browser-live] nessun frame ricevuto: riavvio dello stream");
        try {
          await cli(["stream", "disable"]);
          await cli(["stream", "enable"]);
        } catch (e) {
          lastError = "riavvio dello stream fallito: " + String(e?.message || e).slice(0, 160);
          onEvent({ type: "error", message: lastError });
          return;
        }
        try {
          ws?.close();
        } catch {
          /* niente */
        }
        ws = null;
        setTimeout(() => start(), 1500);
      }, 7000);
    });

    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      armIdleTimeout();
      switch (msg.type) {
        case "frame": {
          frames++;
          const m = msg.metadata || {};
          lastFrame = {
            seq: msg.seq,
            data: msg.data,
            width: m.deviceWidth || null,
            height: m.deviceHeight || null,
            ts: m.timestamp || null,
            ageMs: m.timestamp ? Date.now() - m.timestamp : null,
            savedAt: Date.now(),
          };
          state.viewport = {
            width: m.deviceWidth || null,
            height: m.deviceHeight || null,
            scale: m.pageScaleFactor || 1,
            scrollY: m.scrollOffsetY || 0,
            ts: m.timestamp || null,
          };
          onEvent({
            type: "frame",
            seq: msg.seq,
            data: msg.data,
            width: m.deviceWidth || null,
            height: m.deviceHeight || null,
            ts: m.timestamp || null,
            ageMs: m.timestamp ? Date.now() - m.timestamp : null,
          });
          // ack cumulativo: copre anche i frame precedenti
          send({ type: "ack", seq: msg.seq });
          break;
        }
        case "url":
          state.url = msg.url || "";
          onEvent({ type: "url", url: state.url });
          break;
        case "tabs": {
          state.tabs = Array.isArray(msg.tabs) ? msg.tabs : [];
          // il messaggio `url` arriva solo ai CAMBI di navigazione: se la pagina era già
          // aperta quando ci siamo agganciati, l'URL va recuperato dai tab.
          const active = state.tabs.find((t) => t.active) || state.tabs[0];
          if (active && active.url && active.url !== state.url) {
            state.url = active.url;
            onEvent({ type: "url", url: state.url });
          }
          onEvent({ type: "tabs", tabs: state.tabs });
          break;
        }
        case "status":
          state.connected = !!msg.connected;
          state.screencasting = !!msg.screencasting;
          if (msg.viewportWidth) state.viewport = { ...(state.viewport || {}), width: msg.viewportWidth, height: msg.viewportHeight };
          onEvent({ type: "live", state: snapshot() });
          break;
        default:
          break;
      }
    });

    ws.addEventListener("close", () => {
      onLog("[browser-live] connessione chiusa");
      ws = null;
      state.connected = false;
      if (idleTimer) clearTimeout(idleTimer);
      if (healTimer) {
        clearTimeout(healTimer);
        healTimer = null;
      }
      onEvent({ type: "live", state: snapshot() });
      // chiusura non richiesta (daemon riavviato, errore): si riprova da soli
      if (autoReconnect) scheduleReconnect("connessione caduta");
    });

    ws.addEventListener("error", (e) => {
      lastError = String(e?.message || "errore WebSocket").slice(0, 300);
      onLog("[browser-live] errore: " + lastError);
      onEvent({ type: "error", message: lastError });
    });

    return snapshot();
  }

  function stop() {
    autoReconnect = false; // stop esplicito: non si riconnette
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    if (healTimer) {
      clearTimeout(healTimer);
      healTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        /* niente */
      }
      ws = null;
    }
    state.connected = false;
    onEvent({ type: "live", state: snapshot() });
    return snapshot();
  }

  /** Inoltra un input (mouse/tastiera/touch) dal browser dell'utente. */
  function input(payload) {
    const allowed = new Set(["input_mouse", "input_keyboard", "input_touch"]);
    const type = String(payload?.type || "");
    if (!allowed.has(type)) throw new Error(`tipo di input non ammesso: "${type}"`);
    const out = { ...payload, type };
    if (type === "input_mouse") {
      for (const k of ["x", "y"]) {
        if (!Number.isFinite(Number(out[k]))) throw new Error(`coordinata ${k} mancante o non numerica`);
        out[k] = Number(out[k]);
      }
      out.eventType = String(out.eventType || "mouseMoved");
      out.button = String(out.button || "left");
      out.clickCount = Number(out.clickCount || 1);
    }
    if (type === "input_keyboard") {
      out.eventType = String(out.eventType || "keyDown");
      out.key = String(out.key ?? "");
      if (out.text !== undefined) out.text = String(out.text);
    }
    const sent = send(out);
    if (!sent) throw new Error("live view non attiva: apri prima la vista del browser");
    return { ok: true, sent: out.type, eventType: out.eventType };
  }

  /** Cambia il tetto di frame al volo. Serve più fluidità quando guida l'utente:
   *  il tetto è per-client, quindi non tocca altri eventuali osservatori. */
  function setMaxFps(n) {
    const v = Math.max(1, Math.min(30, Math.round(Number(n) || maxFps)));
    maxFps = v;
    send({ type: "config", maxFps: v });
    onLog(`[browser-live] frame rate -> ${v}/s`);
    return v;
  }

  /** Ricarica la pagina attiva. I frame arrivano solo ai cambiamenti: su una pagina
   *  ferma questo è il modo per ottenere un'immagine nuova. */
  async function reload() {
    await cli(["reload"]);
    return true;
  }

  /**
   * Naviga a un URL (barra indirizzi della live view). Validato: solo http/https.
   */
  async function open(url) {
    const u = String(url || "").trim();
    if (!/^https?:\/\/[^\s]+$/i.test(u)) throw new Error("serve un URL http(s) valido");
    if (u.length > 2048) throw new Error("URL troppo lungo");
    await cli(["open", u]);
    return u;
  }

  /**
   * Preme un tasto o una combinazione tramite la CLI.
   *
   * Serve perché il protocollo di streaming accetta solo `key` e `text`: senza un testo da
   * inserire il browser non riceve l'evento giusto, quindi Backspace, Tab, le frecce e le
   * scorciatoie (Control+a, Control+c…) NON funzionavano. La CLI `press` invece li invia
   * correttamente (verificato: Backspace cancella, Control+a seleziona).
   */
  async function press(keys) {
    const k = String(keys || "").trim();
    // whitelist rigida: solo nomi di tasto e modificatori, niente altro
    if (!/^(?:(?:Control|Alt|Meta|Shift)\+){0,3}(?:F[0-9]{1,2}|[A-Za-z0-9]|Enter|Tab|Backspace|Delete|Escape|Arrow(?:Up|Down|Left|Right)|Home|End|PageUp|PageDown|Insert|Space)$/.test(k)) {
      throw new Error(`combinazione di tasti non ammessa: "${k}"`);
    }
    await cli(["press", k]);
    return k;
  }

  function snapshot() {
    return {
      watching: !!ws,
      port,
      frames,      url: state.url,
      tabs: state.tabs.map((t) => ({ title: t.title, url: t.url, active: !!t.active })),
      viewport: state.viewport,
      connected: state.connected,
      screencasting: state.screencasting,
      startedAt,
      maxFps,
      error: lastError,
    };
  }

  /** Ultimo frame disponibile (o null se troppo vecchio / mai ricevuto). */
  function lastFrameNow() {
    if (!lastFrame) return null;
    if (Date.now() - lastFrame.savedAt > FRAME_KEEP_MS) return null;
    return { ...lastFrame, ageNowMs: lastFrame.ts ? Date.now() - lastFrame.ts : null };
  }

  return { start, stop, input, snapshot, send, lastFrame: lastFrameNow, setMaxFps, reload, press, open };
}
