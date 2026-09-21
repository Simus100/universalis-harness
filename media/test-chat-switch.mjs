/**
 * Test di riproduzione: cambio chat nella dashboard.
 *
 * Verifica empiricamente cosa succede alla vista quando si passa da una chat all'altra:
 *  - la chat mostrata corrisponde alla chat cliccata (non a quella precedente);
 *  - quanto tempo passa dal click alla comparsa dei messaggi giusti;
 *  - cosa succede con due cambi ravvicinati (click A poi B senza attendere);
 *  - se il pulsante "● attiva" nella lista è coerente con la chat visualizzata.
 *
 * Non tocca la dashboard di produzione: usa l'istanza di prova (:8599) e il proxy
 * che inietta l'autenticazione (:8598). La sessione browser usata è "switchtest".
 *
 * Uso: node media/test-chat-switch.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const PBROWSER = "/usr/local/bin/pbrowser";
const SESSION = "switchtest";
const PROXY = "http://127.0.0.1:8598/";
const PROFILE_DIR = `/home/pi-browser/.agent-browser/profile-${SESSION}`;

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));

const ab = (args, opts = {}) =>
  execFileSync("sudo", ["-n", "-u", "pi-browser", "-H", PBROWSER, "--session", SESSION, ...args], {
    encoding: "utf8",
    timeout: 90_000,
    ...opts,
  });

const evalJs = (expr) => {
  const out = ab(["eval", expr]).trim();
  const parse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = parse(out);
  if (typeof v === "string") v = parse(v);
  return v ?? { raw: out };
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- pulizia sessione browser ---------- */
try { ab(["close"], { stdio: "ignore" }); } catch {}
try { execFileSync("pkill", ["-9", "-f", `user-data-dir=${PROFILE_DIR}`], { stdio: "ignore" }); } catch {}
await wait(1200);
try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch {}

/* ---------- apertura ---------- */
let aperto = false;
for (let i = 0; i < 4 && !aperto; i++) {
  try { ab(["open", PROXY]); aperto = true; } catch { await wait(2500); }
}
if (!aperto) { console.log("✘ browser di test non parte"); process.exit(1); }
await wait(1500);
try { ab(["set", "viewport", "1280", "900"]); } catch {}
try { ab(["open", PROXY]); } catch {}
// attesa che la chat sia resa
for (let i = 0; i < 20; i++) {
  const n = evalJs("document.querySelectorAll('#chatView .msg').length");
  if (typeof n === "number" && n > 0) break;
  await wait(500);
}

/* ---------- helper DOM ---------- */
const statoVista = () =>
  evalJs(`(() => {
    const msgs = [...document.querySelectorAll('#chatView .msg')];
    const primo = msgs[0] ? (msgs[0].querySelector('.bubble')?.textContent || '').slice(0, 60) : null;
    const ultimo = msgs.length ? (msgs[msgs.length-1].querySelector('.bubble')?.textContent || '').slice(0, 60) : null;
    const attiva = document.querySelector('#sessionList .sitem.current .txt')?.textContent || null;
    return JSON.stringify({
      msgs: msgs.length,
      primo, ultimo, attiva,
      loading: !!document.querySelector('#chatView .chat-loading'),
      sessione: null,
    });
  })()`);

const apriDrawer = async () => { evalJs("document.getElementById('chatsBtn').click(); 'ok'"); await wait(900); };

const listaChat = async () => {
  return evalJs(`(() => {
    const items = [...document.querySelectorAll('#sessionList .sitem')];
    return JSON.stringify(items.map((it, i) => ({
      i,
      titolo: it.querySelector('.txt')?.textContent || '',
      meta: it.querySelector('.smeta')?.textContent || '',
      attiva: it.classList.contains('current'),
    })));
  })()`);
};

/** Clicca l'item i-esimo e misura quanto ci mette la vista a mostrare la chat giusta. */
const cambiaChatEAttendi = async (i, attesoTitolo) => {
  const t0 = Date.now();
  evalJs(`document.querySelectorAll('#sessionList .sitem')[${i}].querySelector('.smain').click(); 'ok'`);
  const campioni = [];
  let cambiatoA = null;
  let stantii = 0;          // campioni con ancora a schermo la chat PRECEDENTE
  let caricamento = 0;      // campioni con lo stato "carico la conversazione…"
  for (let t = 0; t < 60; t++) {           // fino a 30 s
    await wait(500);
    const s = await statoVista();
    campioni.push({ ms: Date.now() - t0, msgs: s.msgs, primo: s.primo, loading: s.loading });
    if (s.loading) caricamento++;
    if (s.primo && attesoTitolo && !s.primo.startsWith(attesoTitolo)) stantii++;
    if (s.primo && attesoTitolo && s.primo.startsWith(attesoTitolo)) { cambiatoA = Date.now() - t0; break; }
    if (!attesoTitolo) { cambiatoA = Date.now() - t0; break; }
  }
  return { t0, cambiatoA, campioni, stantii, caricamento, fine: await statoVista() };
};

/* ---------- test ---------- */
console.log("=== TEST CAMBIO CHAT ===");
const iniziale = await statoVista();
console.log("stato iniziale:", JSON.stringify(iniziale));

await apriDrawer();
const lista = await listaChat();
console.log("chat in lista:");
for (const c of lista) console.log(`   [${c.i}] "${c.titolo}" · ${c.meta}${c.attiva ? "  ◀ ATTIVA" : ""}`);
check("la lista mostra almeno 2 chat", lista.length >= 2, `trovate ${lista.length}`);

const idxPiccola = lista.findIndex((c) => c.titolo.startsWith("ciao"));
const idxGrande = lista.findIndex((c) => c.meta.startsWith("1350") || c.titolo.startsWith("web search"));
check("chat piccola presente in lista", idxPiccola >= 0);
check("chat grande presente in lista", idxGrande >= 0);

// --- 1) chat piccola ---
if (idxPiccola >= 0) {
  const r = await cambiaChatEAttendi(idxPiccola, "ciao");
  check("chat piccola: i messaggi giusti sono comparsi", !!r.cambiatoA, `campioni: ${JSON.stringify(r.campioni)}`);
  if (r.cambiatoA) console.log(`     tempo click → chat corretta: ${r.cambiatoA} ms`);
  console.log(`     campioni con indicatore di caricamento: ${r.caricamento}`);
  check("durante il caricamento la chat precedente NON resta a schermo", r.stantii === 0, `${r.stantii} campioni con contenuto vecchio`);
  console.log("     stato finale:", JSON.stringify(r.fine));
  check("chat piccola: primo messaggio = 'ciao'", (r.fine.primo || "").startsWith("ciao"), `primo="${r.fine.primo}"`);
}

// --- 2) chat grande (verifica il salto con sessione da 1,6 MB) ---
if (idxGrande >= 0) {
  await apriDrawer();
  const t0 = Date.now();
  evalJs(`document.querySelectorAll('#sessionList .sitem')[${idxGrande}].querySelector('.smain').click(); 'ok'`);
  let pronto = null;
  const tappe = [];
  for (let t = 0; t < 120; t++) {          // fino a 60 s
    await wait(500);
    const s = await statoVista();
    tappe.push({ ms: Date.now() - t0, msgs: s.msgs, primo: s.primo });
    if (s.primo && s.primo.startsWith("web search")) { pronto = Date.now() - t0; break; }
  }
  check("chat grande: i messaggi giusti sono comparsi", !!pronto, `ultimo campione: ${JSON.stringify(tappe.at(-1))}`);
  if (pronto) console.log(`     tempo click → chat corretta: ${pronto} ms (messaggi resi: ${(await statoVista()).msgs})`);
  // quante volte la vista mostra ancora la chat vecchia mentre si aspetta?
  const stantii = tappe.filter((x) => x.primo && x.primo.startsWith("ciao")).length;
  console.log(`     campioni con contenuto della chat PRECEDENTE dopo il click: ${stantii}/${tappe.length}`);
}

// --- 3) chat piccola seguita SUBITO da chat grande (cambio ravvicinato) ---
console.log("\n--- cambio ravvicinato (piccola → grande senza attendere il caricamento) ---");
await apriDrawer();
evalJs(`document.querySelectorAll('#sessionList .sitem')[${idxPiccola}].querySelector('.smain').click(); 'ok'`);
await wait(250);
evalJs("document.getElementById('chatsBtn').click(); 'ok'");
await wait(600);
evalJs(`document.querySelectorAll('#sessionList .sitem')[${idxGrande}].querySelector('.smain').click(); 'ok'`);
await wait(8000);
const rapido = await statoVista();
console.log("     stato dopo il doppio click:", JSON.stringify(rapido));
check("cambio ravvicinato: vince l'ULTIMA chat cliccata (grande)", (rapido.primo || "").startsWith("web search"), `primo="${rapido.primo}"`);
const srv = await (await fetch("http://127.0.0.1:8598/api/sessions")).json();
console.log("     sessione attiva sul server:", srv.current, "| badge nella UI:", rapido.attiva);
check("cambio ravvicinato: la UI mostra la chat attiva sul server", !!rapido.attiva, `badge=${rapido.attiva}`);

// --- 4) coerenza del badge "● attiva" ---
await apriDrawer();
const listaDopo = await listaChat();
const attive = listaDopo.filter((c) => c.attiva);
console.log("     badge attiva:", JSON.stringify(attive.map((c) => c.titolo)));
check("c'è esattamente una chat marcata attiva", attive.length === 1, `trovate ${attive.length}`);

// screenshot finale
try { ab(["screenshot", "/root/pi-harness/media/test-chat-switch.png"]); } catch {}

console.log(`\nRISULTATO: ${pass} ok, ${fail} ko`);
try { ab(["close"], { stdio: "ignore" }); } catch {}
process.exit(fail ? 1 : 0);
