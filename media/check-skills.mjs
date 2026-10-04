/**
 * Valida il frontmatter di tutte le skill in skills/ (fuori da media/).
 *
 * Perché serve: un `: ` dentro il valore di `description` (per esempio
 * "... (Chrome headless): apri pagine ...") fa fallire il parser YAML con
 * "Nested mappings are not allowed in compact mappings" e la skill NON viene
 * caricata — con un semplice warning che è facile non notare.
 * Qui si usa la STESSA libreria YAML di pi, così l'esito coincide con quello reale.
 *
 * Uso: node media/check-skills.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const piRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const YAML = piRequire("yaml");

const DIR = process.env.DASH_SKILLS_DIR || "/root/pi-harness/skills";
const NAME_RE = /^[a-z0-9-]{1,64}$/;

let pass = 0;
let fail = 0;
let avvisi = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };

if (!fs.existsSync(DIR)) {
  console.log(`nessuna cartella skill in ${DIR}`);
  process.exit(0);
}

const files = [];
for (const entry of fs.readdirSync(DIR, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    const p = path.join(DIR, entry.name, "SKILL.md");
    if (fs.existsSync(p)) files.push({ p, expectedName: entry.name });
  } else if (entry.name.endsWith(".md")) {
    files.push({ p: path.join(DIR, entry.name), expectedName: entry.name.replace(/\.md$/, "") });
  }
}

if (!files.length) {
  console.log(`nessuna skill trovata in ${DIR}`);
  process.exit(0);
}

for (const { p, expectedName } of files) {
  const rel = path.relative(DIR, p);
  const raw = fs.readFileSync(p, "utf8");
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) {
    ko(`${rel}: frontmatter mancante (serve --- name: ... description: ... ---)`);
    continue;
  }
  let fm;
  try {
    fm = YAML.parse(m[1]);
    ok(`${rel}: frontmatter YAML valido`);
  } catch (e) {
    ko(`${rel}: YAML NON valido → la skill non verrebbe caricata\n      ${String(e.message).split("\n")[0]}`);
    continue;
  }
  if (!fm || typeof fm !== "object") {
    ko(`${rel}: frontmatter non è una mappatura`);
    continue;
  }
  const name = String(fm.name || "");
  const desc = String(fm.description || "");
  if (!name) ko(`${rel}: "name" mancante o vuoto`);
  else if (!NAME_RE.test(name)) ko(`${rel}: "name" non valido ("${name}"): minuscole, numeri e trattini, max 64`);
  else if (name !== expectedName)
    ko(`${rel}: "name" (${name}) diverso dal nome della cartella/file (${expectedName})`);
  else ok(`${rel}: name "${name}" coerente`);

  if (!desc) ko(`${rel}: "description" mancante o vuota`);
  else if (desc.length > 1024) ko(`${rel}: "description" troppo lunga (${desc.length} > 1024)`);
  else ok(`${rel}: description presente (${desc.length} caratteri)`);

  /* ---- regole delle Agent Skills (spec + guide Claude Code / Codex) ----
   * Alcune sono OBBLIGHI (errore): tag < > nella descrizione, name non valido.
   * Altre sono CONSIGLI (avviso, non fanno fallire la suite): la descrizione è l'unica cosa
   * che il modello vede per decidere se caricare la skill, e il corpo pesa a ogni uso. */
  if (desc && /<[^>]+>/.test(desc)) ko(`${rel}: la descrizione non può contenere tag < >`);
  if (desc && !/(usa quando|usala quando|usa per|serve a|use when|attiva quando|ogni volta che|quando\b)/i.test(desc)) {
    console.log(`  ⚠ ${rel}: la descrizione non dice «quando usarla» — è l'unico aggancio per l'attivazione`);
    avvisi++;
  }
  const corpo = raw.slice(m[0].length);
  const righeCorpo = corpo.split("\n").filter((r) => r.trim()).length;
  if (righeCorpo > 400) {
    console.log(`  ⚠ ${rel}: corpo di ${righeCorpo} righe — meglio spostare i dettagli in references/`);
    avvisi++;
  }
  if (!/^\s*#\s+\S/m.test(corpo)) {
    console.log(`  ⚠ ${rel}: manca un titolo (# …) all'inizio del corpo`);
    avvisi++;
  }
  // file citati nella skill che non esistono (link markdown con percorso relativo)
  const dir = path.dirname(p);
  const citati = new Set();
  for (const mm of corpo.matchAll(/\]\(([^)\s#]+)\)/g)) {
    const t = mm[1];
    if (/^([a-z]+:|\/|#)/i.test(t)) continue; // URL, percorsi assoluti, ancore
    citati.add(t);
  }
  for (const t of citati) {
    const pulito = t.split("?")[0];
    if (!fs.existsSync(path.resolve(dir, pulito))) {
      console.log(`  ⚠ ${rel}: cita un file che non esiste: ${pulito}`);
      avvisi++;
    }
  }
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti (${files.length} skill controllate)`);
if (avvisi) console.log(`avvisi sulle regole Agent Skills: ${avvisi} (non bloccanti — li vedi anche nella vista Skill)`);
process.exit(fail ? 1 : 0);
