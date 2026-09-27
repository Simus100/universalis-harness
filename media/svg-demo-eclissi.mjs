/**
 * DIMOSTRAZIONE: il modello risponde con uno schema SVG.
 *
 * Manda all'istanza di prova la richiesta
 *   «Spiegami un'eclissi di Sole con uno schema SVG etichettato in italiano, indicando che
 *    dimensioni e distanze non sono in scala.»
 * e verifica che la risposta contenga un blocco ```svg conforme al contratto della skill
 * `visual-representation` (documento completo, viewBox, <title>/<desc>, etichette in italiano,
 * dichiarazione di non-scala) e che passi il sanitizzatore — cioè che la chat possa davvero
 * mostrarlo come anteprima.
 *
 * La skill viene presa dall'istanza reale (`skills/`), il resto è isolato in /tmp.
 * Uso: node media/svg-demo-eclissi.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { sanitizeSvg } from "./svg-sanitize.mjs";

const ROOT = "/root/pi-harness";
const PORT = 8501;
const TMP = "/tmp/pi-svg-demo";
const MEDIA_OUT = path.join(ROOT, "media");
const RICHIESTA =
  "Spiegami un'eclissi di Sole con uno schema SVG etichettato in italiano, indicando che dimensioni e distanze non sono in scala.";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (d, c, e = "") => (c ? ok(d) : ko(`${d}${e ? " — " + e : ""}`));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = { Authorization: "Basic " + Buffer.from("demo:demo").toString("base64") };
const api = (p, init = {}) => fetch(`http://127.0.0.1:${PORT}${p}`, { headers: auth, ...init });

const state = async () => (await api("/api/state")).json();

fs.rmSync(TMP, { recursive: true, force: true });
for (const d of ["sessions", "media", "root"]) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const dash = spawn(
  process.execPath,
  ["dashboard.mjs", "--port", String(PORT), "--model", "deepseek-flash", "--think", "medium"],
  {
    cwd: ROOT,
    env: {
      ...process.env,
      DASH_SESSION_DIR: path.join(TMP, "sessions"),
      DASH_MEDIA_DIR: path.join(TMP, "media"),
      // le skill sono quelle VERE: la skill visual-representation deve essere attiva
      DASH_SKILLS_DIR: path.join(ROOT, "skills"),
      DASH_ROOT: path.join(TMP, "root"),
      DASH_GOALS_FILE: path.join(TMP, "goals.json"),
      DASH_SCHEDULES_FILE: path.join(TMP, "schedules.json"),
      DASH_ASK: "off",
      DASH_BROWSER_PREFS_FILE: path.join(TMP, "prefs.json"),
      DASH_USER: "demo",
      DASH_PASSWORD: "demo",
      DASH_HOST: "127.0.0.1",
    },
    stdio: "ignore",
  },
);
process.on("exit", () => {
  try { dash.kill("SIGKILL"); } catch {}
});

let up = false;
for (let i = 0; i < 40; i++) {
  try { if ((await api("/api/state")).status === 200) { up = true; break; } } catch {}
  await wait(1000);
}
if (!up) {
  console.log("✘ istanza di prova non partita");
  process.exit(1);
}

// la skill deve essere visibile al modello (system prompt) prima di chiedere
const skills = await (await api("/api/skills")).json();
check(
  "la skill visual-representation è attiva nell'istanza",
  (skills.skills || []).some((s) => s.name === "visual-representation"),
  JSON.stringify((skills.skills || []).map((s) => s.name)),
);
check(
  "il sanitizzatore è servito al browser (/svg-sanitize.mjs)",
  (await api("/svg-sanitize.mjs")).status === 200,
);

console.log(`\nrichiesta: «${RICHIESTA}»\n`);
await api("/api/prompt", {
  method: "POST",
  headers: { ...auth, "Content-Type": "application/json" },
  body: JSON.stringify({ text: RICHIESTA }),
});

let idle = false;
const deadline = Date.now() + 6 * 60 * 1000;
while (Date.now() < deadline) {
  const s = await state();
  if (!s.streaming && (s.messages || []).some((m) => m.role === "assistant")) { idle = true; break; }
  await wait(2000);
}
check("la risposta del modello è arrivata", idle);

const s = await state();
const risposta = [...(s.messages || [])].reverse().find((m) => m.role === "assistant");
const testo = risposta?.text || "";
const blocchi = [...testo.matchAll(/(?:^|\n)```svg[ \t]*\n([\s\S]*?)\n```/g)].map((m) => m[1]);
check("la risposta contiene un blocco ```svg", blocchi.length >= 1, `blocchi: ${blocchi.length}`);
// la non-scala può essere dichiarata nel testo, nel <desc> o come etichetta dentro il disegno:
// tutte e tre le forme vanno bene
const dichiarazione = `${testo}\n${blocchi.join("\n")}`;
check(
  "la risposta dichiara che dimensioni e distanze non sono in scala",
  /non (?:sono|è|e')?\s*in scala|fuori scala/i.test(dichiarazione),
);

const svg = blocchi[0] || "";
const res = sanitizeSvg(svg);
check("il disegno prodotto supera il sanitizzatore", res.ok, res.ok ? "" : res.error);
if (res.ok) {
  check("ha <title> e <desc>", res.title.length > 0 && res.desc.length > 0);
  check("usa viewBox e namespace SVG", res.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && res.svg.includes("viewBox="));
  const etichette = ["sole", "luna", "terra", "eclissi"];
  const trovate = etichette.filter((e) => res.svg.toLowerCase().includes(e));
  check("le etichette sono in italiano (Sole/Luna/Terra/eclissi)", trovate.length >= 2, trovate.join(", "));
  check("il disegno contiene testo (elementi <text>)", /<text\b/.test(res.svg));
  check("non contiene script né risorse esterne", !/<script|on\w+\s*=|foreignObject|https?:|javascript:/i.test(res.svg.replace("http://www.w3.org/2000/svg", "")));
  fs.writeFileSync(path.join(MEDIA_OUT, "eclissi-sole.svg"), res.svg + "\n");
  ok(`disegno sanitizzato salvato in media/eclissi-sole.svg (${res.stats.bytes} byte, ${res.stats.elements} elementi)`);
  if (res.warnings.length) console.log("     avvisi del sanitizzatore:", res.warnings.join("; "));
}

// log leggibile della dimostrazione (per la consegna)
const log = [
  `# Dimostrazione — schema SVG di un'eclissi di Sole`,
  ``,
  `- richiesta: «${RICHIESTA}»`,
  `- modello: deepseek-flash (istantanea del ${new Date().toISOString()})`,
  `- blocchi \`svg\` nella risposta: ${blocchi.length}`,
  `- esito del sanitizzatore: ${res.ok ? "accettato" : "rifiutato: " + res.error}`,
  res.ok ? `- <title>: ${res.title}` : "",
  res.ok ? `- <desc>: ${res.desc}` : "",
  res.warnings?.length ? `- avvisi: ${res.warnings.join("; ")}` : "",
  ``,
  `## Testo della risposta (estratto)`,
  ``,
  testo.slice(0, 1200),
  ``,
].filter(Boolean).join("\n");
fs.writeFileSync(path.join(MEDIA_OUT, "eclissi-sole-demo.md"), log);
console.log("\ntesto della risposta (primi 400 caratteri):\n" + testo.slice(0, 400).replace(/\n/g, " | "));
console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
try { dash.kill("SIGKILL"); } catch {}
process.exit(fail ? 1 : 0);
