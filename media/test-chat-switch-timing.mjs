/**
 * Misura strumentata del cambio chat (istanza di prova :8599, proxy :8598).
 *
 * Cosa misura:
 *  - quanto resta a schermo la chat PRECEDENTE dopo il click (tempo reale, campionato
 *    da un MutationObserver dentro la pagina);
 *  - il costo di rete+parse della GET /api/state della chat grande (1,6 MB);
 *  - il costo del solo renderMessages() con la conversazione grande;
 *  - quanti nodi DOM produce la chat grande.
 *
 * Uso: node media/test-chat-switch-timing.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "timingtest";
const PROXY = "http://127.0.0.1:8598/";
const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8", timeout: 120_000, ...opts,
  });
const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  const p = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = p(out);
  if (typeof v === "string") v = p(v);
  return v ?? { raw: out };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try { ab(["close"], { stdio: "ignore" }); } catch {}
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" }); } catch {}
await wait(1200);
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try { ab(["open", PROXY]); aperto = true; } catch { await wait(2500); }
}
if (!aperto) { console.log("✘ browser non parte"); process.exit(1); }
await wait(1500);
try { ab(["set", "viewport", "1280", "900"]); } catch {}
try { ab(["open", PROXY]); } catch {}
for (let i = 0; i < 20; i++) {
  if (typeof evalJs("document.querySelectorAll('#chatView .msg').length") === "number") break;
  await wait(500);
}
await wait(2000);

const lista = () => evalJs(`(() => JSON.stringify([...document.querySelectorAll('#sessionList .sitem')].map((it,i)=>({
  i, titolo: it.querySelector('.txt')?.textContent||'' }))))()`);
const apriDrawer = async () => { evalJs("document.getElementById('chatsBtn').click(); 'ok'"); await wait(900); };
const clickItem = (i) => evalJs(`document.querySelectorAll('#sessionList .sitem')[${i}].querySelector('.smain').click(); 'ok'`);

await apriDrawer();
const L = await lista();
const iPiccola = L.findIndex((c) => c.titolo.startsWith("ciao"));
const iGrande = L.findIndex((c) => c.titolo.startsWith("web search"));
console.log("chat:", JSON.stringify(L));

/* --- 1) baseline sulla chat piccola --- */
clickItem(iPiccola);
await wait(4000);
console.log("\n[1] chat piccola attiva → nodi DOM:", evalJs("document.querySelectorAll('*').length"));

/* --- osservatore: registra quando il primo messaggio in chat cambia --- */
evalJs(`(() => {
  const target = document.getElementById('chatView');
  window.__ev = [];
  window.__t0 = performance.now();
  const primo = () => { const b = target.querySelector('.msg .bubble'); return b ? b.textContent.slice(0,25) : null; };
  window.__primoIniziale = primo();
  window.__obs = new MutationObserver(() => {
    window.__ev.push({ t: Math.round(performance.now() - window.__t0), primo: primo() });
  });
  window.__obs.observe(target, { childList: true });
  return JSON.stringify({ ok: true, primoIniziale: window.__primoIniziale });
})()`);

/* --- 2) click sulla chat GRANDE: quanto resta a schermo la precedente --- */
console.log("\n[2] click sulla chat GRANDE (1350 messaggi, /api/state = 1,6 MB)");
await apriDrawer();
clickItem(iGrande);
await wait(8000);
const ev = evalJs("JSON.stringify(window.__ev.slice(0, 12))");
const tutti = evalJs("JSON.stringify(window.__ev.length)");
console.log("    mutazioni osservate:", JSON.stringify(tutti));
if (Array.isArray(ev)) {
  for (const e of ev) console.log(`    t=${e.t} ms · primo messaggio: ${JSON.stringify(e.primo)}`);
  const cambio = ev.find((e) => e.primo && e.primo.startsWith("web search"));
  if (cambio) console.log(`    ⇒ contenuto corretto visibile dopo ${cambio.t} ms dal click`);
  else console.log("    ⇒ contenuto corretto NON comparso nei campioni");
}
const nodiGrande = evalJs("document.querySelectorAll('*').length");
const nodiChat = evalJs("document.querySelectorAll('#chatView *').length");
console.log(`    nodi DOM pagina: ${JSON.stringify(nodiGrande)} · dentro la chat: ${JSON.stringify(nodiChat)}`);

/* --- 3) costo di rete + parse della GET /api/state grande --- */
console.log("\n[3] costo rete+parse di /api/state (chat grande)");
const net = evalJs(`(async () => {
  const t0 = performance.now();
  const r = await fetch('/api/state');
  const txt = await r.text();
  const t1 = performance.now();
  const j = JSON.parse(txt);
  const t2 = performance.now();
  window.__m = j.messages || [];
  return JSON.stringify({ byte: txt.length, reteMs: Math.round(t1 - t0), parseMs: Math.round(t2 - t1), messaggi: window.__m.length });
})()`);
console.log("   ", JSON.stringify(net));

/* --- 4) costo del solo rendering --- */
console.log("\n[4] costo del solo renderMessages() con la conversazione grande");
const rend = evalJs(`(() => {
  const t0 = performance.now();
  window.renderMessages(window.__m);
  const t1 = performance.now();
  return JSON.stringify({ renderMs: Math.round(t1 - t0), nodiDopo: document.querySelectorAll('#chatView *').length });
})()`);
console.log("   ", JSON.stringify(rend));

/* --- 5) secondo render a caldo (come a ogni evento di stato) --- */
const rend2 = evalJs(`(() => {
  const t0 = performance.now(); window.renderMessages(window.__m); const t1 = performance.now();
  const t2 = performance.now(); window.renderMessages(window.__m); const t3 = performance.now();
  return JSON.stringify({ primoMs: Math.round(t1-t0), secondoMs: Math.round(t3-t2) });
})()`);
console.log("    render consecutivi:", JSON.stringify(rend2));

console.log("\n[5] nota: renderMessages() usa chat.innerHTML='' e ricostruisce tutto, poi autoscroll(true) → la posizione di lettura va persa a ogni evento di stato");
try { ab(["close"], { stdio: "ignore" }); } catch {}
