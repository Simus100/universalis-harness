/**
 * Diagnostica: l'input di TASTIERA passato dallo STREAM (quello che usa la live view della
 * dashboard per i caratteri stampabili) arriva davvero al campo attivo del browser?
 *
 * Perché serve: la live view manda i caratteri singoli dal canale di streaming
 * (`input_keyboard` con key+text) e i tasti speciali dalla CLI (`press`). Se il primo canale
 * perde o altera caratteri, una password digitata a mano diventa sbagliata e il login fallisce
 * con un messaggio del sito che sembra "credenziali errate" — mentre il guasto è nostro.
 *
 * Uso: node media/probe-live-input.mjs [url] [--session nome] [--sel css]
 *   default: url = https://www.facebook.com, session = probe-input
 * Non fa submit di nessun form: clicca un campo, digita un campione, rilegge il valore.
 */
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const URL_PAGINA = argv.find((a) => /^https?:\/\//.test(a)) || "https://www.facebook.com";
const SESSION = opt("--session", "probe-input");
const SEL = opt("--sel", 'input[type="text"], input[name="email"], input[type="email"]');
const CAMPIONE = opt("--testo", "Prova!42 az");

const cli = (args, { json = false } = {}) => {
  const out = execFileSync(
    "sudo",
    ["-n", "-u", "pi-browser", "-H", "/usr/local/bin/pbrowser", "--session", SESSION, ...args],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  return json ? JSON.parse(out) : out.trim();
};

console.log(`sessione: ${SESSION}`);
console.log(`1. apro ${URL_PAGINA}`);
cli(["open", URL_PAGINA]);

console.log("2. abilito lo stream e leggo la porta");
try { cli(["stream", "enable"]); } catch { /* già abilitato: va bene lo stesso */ }
const porta = JSON.parse(cli(["stream", "status", "--json"])).data?.port;
if (!porta) {
  console.log("   ✗ nessuna porta di streaming: esco");
  process.exit(1);
}
console.log("   porta:", porta);

console.log("3. coordinate del campo e svuotamento");
const boxRaw = cli(["get", "box", SEL, "--json"], { json: true });
const b = boxRaw?.data || boxRaw;
if (b?.x === undefined) {
  console.log("   ✗ campo non trovato:", JSON.stringify(boxRaw).slice(0, 200));
  process.exit(1);
}
const x = Math.round(b.x + b.width / 2);
const y = Math.round(b.y + b.height / 2);
console.log("   box:", JSON.stringify(b), "→ click su", x, y);

const ws = new WebSocket(`ws://127.0.0.1:${porta}/?pacing=ack&maxFps=2`);
let ackSeq = 0;
let frames = 0;
ws.addEventListener("message", (ev) => {
  let msg;
  try { msg = JSON.parse(ev.data); } catch { return; }
  if (msg.type === "frame") { frames++; if (msg.seq) ws.send(JSON.stringify({ type: "ack", seq: msg.seq })); ackSeq = msg.seq ?? ackSeq; }
});

const invia = (obj) => ws.send(JSON.stringify(obj));

ws.addEventListener("open", () => {
  // click sul campo, come fa il frontend della live view
  invia({ type: "input_mouse", eventType: "mouseMoved", x, y });
  invia({ type: "input_mouse", eventType: "mousePressed", x, y, button: "left", clickCount: 1 });
  invia({ type: "input_mouse", eventType: "mouseReleased", x, y, button: "left", clickCount: 1 });
  // selezione tutto + cancellazione via CLI (per partire da campo vuoto)
  setTimeout(() => {
    execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", "/usr/local/bin/pbrowser", "--session", SESSION, "fill", SEL, ""], { encoding: "utf8" });
    console.log(`4. digito via stream: "${CAMPIONE}"`);
    for (const ch of CAMPIONE) {
      invia({ type: "input_keyboard", eventType: "keyDown", key: ch, text: ch });
      invia({ type: "input_keyboard", eventType: "keyUp", key: ch });
    }
    setTimeout(() => {
      ws.close();
      const valore = cli(["get", "value", SEL]);
      console.log("5. valore letto nel campo:", JSON.stringify(valore));
      console.log("   frame ricevuti:", frames, "| ultimo ack:", ackSeq);
      console.log(valore === CAMPIONE ? "ESITO: ✔ la tastiera dello stream ARRIVA integra" : "ESITO: ✗ la tastiera dello stream PERDE/ALTERA caratteri");
      process.exit(0);
    }, 1200);
  }, 800);
});
ws.addEventListener("error", (e) => {
  console.log("   ✗ errore WebSocket:", String(e?.message || e));
  process.exit(1);
});
