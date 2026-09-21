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
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti (${files.length} skill controllate)`);
process.exit(fail ? 1 : 0);
