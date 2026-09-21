/**
 * Test della CORSA sul cambio chat: la risposta della GET /api/state della chat
 * precedente può arrivare DOPO quella della chat nuova (il payload della chat grande
 * pesa 1,6 MB, quello della chat piccola 15 KB) e sovrascrivere la vista.
 *
 * Sequenza riprodotta: partendo dalla chat PICCOLA, si clicca la GRANDE e subito dopo
 * la PICCOLA. La chat attiva sul server è la piccola: la vista deve mostrare "ciao".
 *
 * Uso: node media/test-chat-switch-race.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "racetest";
const PROXY = "http://127.0.0.1:8598/";
const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8", timeout: 90_000, ...opts,
  });
const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  const p = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = p(out);
  if (typeof v === "string") v = p(v);
  return v ?? { raw: out };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* pulizia */
try { ab(["close"], { stdio: "ignore" }); } catch {}
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" }); } catch {}
await wait(1200);
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}

let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try { ab(["open", PROXY]); aperto = true; } catch { await wait(2500); }
}
if (!aperto) { console.log("✘ browser di test non parte"); process.exit(1); }
await wait(1500);
try { ab(["set", "viewport", "1280", "900"]); } catch {}
try { ab(["open", PROXY]); } catch {}
for (let i = 0; i < 20; i++) {
  const n = evalJs("document.querySelectorAll('#chatView .msg').length");
  if (typeof n === "number" && n > 0) break;
  await wait(500);
}

const stato = () =>
  evalJs(`(() => {
    const msgs = [...document.querySelectorAll('#chatView .msg')];
    return JSON.stringify({
      msgs: msgs.length,
      primo: msgs[0] ? (msgs[0].querySelector('.bubble')?.textContent || '').slice(0, 40) : null,
      badge: document.querySelector('#sessionList .sitem.current .txt')?.textContent || null,
    });
  })()`);

const apriDrawer = async () => { evalJs("document.getElementById('chatsBtn').click(); 'ok'"); await wait(900); };
const lista = async () =>
  evalJs(`(() => JSON.stringify([...document.querySelectorAll('#sessionList .sitem')].map((it, i) => ({
    i, titolo: it.querySelector('.txt')?.textContent || '', meta: it.querySelector('.smeta')?.textContent || '',
  }))))()`);
const clickItem = (i) =>
  evalJs(`document.querySelectorAll('#sessionList .sitem')[${i}].querySelector('.smain').click(); 'ok'`);

/* ---------- preparazione: porta la vista sulla chat PICCOLA ---------- */
await apriDrawer();
let L = await lista();
const iPiccola = L.findIndex((c) => c.titolo.startsWith("ciao"));
const iGrande = L.findIndex((c) => c.titolo.startsWith("web search"));
if (iPiccola < 0 || iGrande < 0) { console.log("✘ chat di prova mancanti:", JSON.stringify(L)); process.exit(1); }
clickItem(iPiccola);
await wait(4000);
let s = await stato();
console.log("partenza (deve essere la piccola):", JSON.stringify(s));
check("partenza sulla chat piccola", (s.primo || "").startsWith("ciao"), `primo=${s.primo}`);

/* ---------- corsa: clic sulla GRANDE e subito dopo sulla PICCOLA ---------- */
console.log("\n--- corsa: click GRANDE, poi click PICCOLA dopo 300 ms ---");
await apriDrawer();
clickItem(iGrande);
await wait(300);
evalJs("document.getElementById('chatsBtn').click(); 'ok'");   // riapre il drawer
await wait(500);
clickItem(iPiccola);
await wait(9000);

const finale = await stato();
const srv = await (await fetch("http://127.0.0.1:8598/api/sessions")).json();
const attesaPiccola = srv.current === "01a0b9c9-789a-7048-aa89-77b0bc8879a5";
console.log("stato finale vista:", JSON.stringify(finale));
console.log("chat attiva sul server:", srv.current, attesaPiccola ? "(piccola)" : "(grande)");

check("il server ha la chat piccola attiva", attesaPiccola);
check(
  "la vista mostra i messaggi della chat ATTIVA (piccola)",
  (finale.primo || "").startsWith("ciao"),
  `la vista mostra: "${finale.primo}" (${finale.msgs} messaggi) → ${(finale.primo || "").startsWith("web search") ? "CONTENUTO DELLA CHAT PRECEDENTE (race condition)" : "contenuto inatteso"}`,
);
check("il badge 'attiva' è coerente con la vista", (finale.badge || "").startsWith("ciao"), `badge=${finale.badge}`);

console.log(`\nRISULTATO: ${pass} ok, ${fail} ko`);
try { ab(["close"], { stdio: "ignore" }); } catch {}
process.exit(fail ? 1 : 0);
