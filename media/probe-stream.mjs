/**
 * Diagnostica del protocollo di streaming di agent-browser.
 * Verifica sperimentalmente, senza toccare la dashboard:
 *   1. lettura della porta dal comando stream status --json
 *   2. connessione WebSocket e ricezione dei frame (formato, dimensioni, età)
 *   3. invio di config (maxFps) e ack (pacing)
 *   4. invio di INPUT remoti (click) e verifica che il browser navighi davvero
 *
 * Uso: node media/probe-stream.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const AB = "/usr/bin/agent-browser";
const cli = (args) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", AB, ...args], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const cliJson = (args) => JSON.parse(cli(args));

console.log("1. stato dello stream");
const st = cliJson(["stream", "status", "--json"]);
const port = st.data?.port;
console.log("   porta:", port, "| enabled:", st.data?.enabled, "| connected:", st.data?.connected);
if (!port) process.exit(1);

console.log("2. coordinate del primo link della pagina");
let box;
try {
  box = cliJson(["get", "box", "a", "--json"]);
} catch (e) {
  console.log("   get box fallito:", String(e.message).slice(0, 120));
}
const b = box?.data || box || {};
const x = Math.round((b.x ?? 100) + (b.width ?? 20) / 2);
const y = Math.round((b.y ?? 100) + (b.height ?? 20) / 2);
console.log("   box:", JSON.stringify(b).slice(0, 160));
console.log("   punto di click:", { x, y });

console.log("3. connessione WebSocket");
const ws = new WebSocket(`ws://127.0.0.1:${port}/?pacing=ack&maxFps=3`);
let frames = 0;
let clicked = false;
const kinds = {};

const done = (code) => {
  try { ws.close(); } catch {}
  process.exit(code);
};
const globalTimeout = setTimeout(() => {
  console.log(`\nESITO: timeout (frame ricevuti: ${frames}, click inviato: ${clicked})`);
  done(frames > 0 ? 0 : 1);
}, 30_000);

ws.addEventListener("open", () => {
  console.log("   ✔ connesso a ws://127.0.0.1:" + port);
  ws.send(JSON.stringify({ type: "config", maxFps: 3 }));
});

ws.addEventListener("message", (ev) => {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch {
    return;
  }
  kinds[msg.type] = (kinds[msg.type] || 0) + 1;

  if (msg.type === "frame") {
    frames++;
    const bytes = Buffer.from(msg.data, "base64").length;
    const m = msg.metadata || {};
    console.log(
      `   frame seq=${msg.seq} ${bytes} B ${m.deviceWidth}x${m.deviceHeight} età=${Date.now() - (m.timestamp || 0)}ms`,
    );
    if (frames === 1) {
      fs.writeFileSync("/tmp/stream-frame.jpg", Buffer.from(msg.data, "base64"));
      console.log("   frame salvato in /tmp/stream-frame.jpg");
    }
    ws.send(JSON.stringify({ type: "ack", seq: msg.seq }));

    // I frame arrivano quando la pagina CAMBIA (delta): su una pagina statica ne arriva uno solo.
    // Quindi il click si invia dopo il primo frame, non dopo il secondo.
    if (frames === 1 && !clicked) {
      clicked = true;
      setTimeout(() => {
        const urlBefore = cli(["get", "url"]).trim();
        console.log("4. invio input remoti (click su " + x + "," + y + ") — url prima:", urlBefore);
        ws.send(JSON.stringify({ type: "input_mouse", eventType: "mouseMoved", x, y }));
        ws.send(JSON.stringify({ type: "input_mouse", eventType: "mousePressed", x, y, button: "left", clickCount: 1 }));
        ws.send(JSON.stringify({ type: "input_mouse", eventType: "mouseReleased", x, y, button: "left", clickCount: 1 }));
        console.log("   click inviato, attendo la reazione della pagina…");
      }, 1200);
      setTimeout(() => {
        const urlAfter = cli(["get", "url"]).trim();
        console.log("   url dopo:", urlAfter);
        console.log(
          urlAfter !== urlBefore
            ? "   ✔ INPUT REMOTO FUNZIONANTE: il browser ha navigato"
            : "   ⚠ nessuna navigazione (il click potrebbe non aver colpito il link)",
        );
        console.log("   tipi di messaggio ricevuti:", JSON.stringify(kinds));
        clearTimeout(globalTimeout);
        console.log(`\nESITO: ${frames} frame ricevuti, input ${urlAfter !== urlBefore ? "funzionante" : "da verificare"}`);
        done(0);
      }, 3000);
    }
  } else {
    console.log(`   messaggio "${msg.type}":`, JSON.stringify(msg).slice(0, 200));
  }
});

ws.addEventListener("error", (e) => {
  console.log("   ✘ errore WS:", e?.message || e);
  clearTimeout(globalTimeout);
  done(1);
});
