/**
 * Carica le skill con lo STESSO resource loader di pi (come fa dashboard.mjs) per
 * verificare che il file sia valido davvero, senza toccare la sessione in produzione.
 *
 * Serve perché /api/skills legge dalla cache del loader: se la sessione non è idle,
 * reloadSkills() salta il reload e la dashboard continua a mostrare la diagnostica
 * precedente. Questo script fa una lettura pulita da zero.
 *
 * Uso: node media/check-skills-loader.mjs
 */
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";

const SKILLS_DIR = process.env.DASH_SKILLS_DIR || "/root/pi-harness/skills";
const CWD = "/root/pi-harness";

const rl = new DefaultResourceLoader({
  cwd: CWD,
  agentDir: getAgentDir(),
  additionalSkillPaths: [SKILLS_DIR],
});
await rl.reload();

const { skills, diagnostics } = rl.getSkills();
console.log(`cartella: ${SKILLS_DIR}`);
console.log(`skill caricate: ${skills.length ? skills.map((s) => s.name).join(", ") : "nessuna"}`);
for (const s of skills) {
  console.log(`  • ${s.name}`);
  console.log(`      descrizione: ${(s.description || "").slice(0, 90)}${(s.description || "").length > 90 ? "…" : ""}`);
  console.log(`      file: ${s.filePath}`);
}
console.log(`diagnostica: ${diagnostics.length}`);
for (const d of diagnostics) console.log(`  ⚠ ${d.type}: ${String(d.message).split("\n")[0]} (${d.path})`);

const wanted = process.argv[2] || "browser";
const found = skills.some((s) => s.name === wanted);
console.log(`\nesito: la skill "${wanted}" è ${found ? "CARICATA correttamente" : "NON caricata"}`);
process.exit(found ? 0 : 1);
