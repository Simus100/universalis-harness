/**
 * Test: le skill caricate dall'harness non devono avere collisioni di nome,
 * né copie globali divergenti, né symlink rotti.
 *
 * Perché esiste. pi (il motore) scopre le skill in più cartelle: quelle globali
 * (`~/.agents/skills`, `~/.pi/agent/skills`) e quelle indicate dal loader: la
 * dashboard passa `additionalSkillPaths: [skills/]`. Se la stessa skill compare
 * in due posti come copia REALE, pi carica la PRIMA e segnala la seconda come
 * `collision`: non è un guasto grave, ma riempie di avvisi la scheda «Skill» e —
 * peggio — nasconde una divergenza (se i contenuti differiscono, vince in
 * silenzio quella caricata per prima).
 *
 * È già successo: le 10 skill HyperFrames/HeyGen erano in `skills/` (11/10) e in
 * `~/.agents/skills` (12/10, più corrette), con `hyperframes-audio` DIVERSA fra
 * le due.
 *
 * Stato voluto: una sola copia FISICA, in `skills/`, e nelle cartelle globali un
 * symlink che la rende raggiungibile alle altre istanze dell'harness
 * (tester_01, tester08 le ottengono solo da lì). pi non vede collisione perché
 * canonicalizza i percorsi con realpathSync: stesso file reale = una sola skill.
 *
 * Attenzione: `npx hyperframes skills update` reinstallа nelle cartelle GLOBALI
 * creando copie reali. Dopo un aggiornamento:
 *     bash scripts/skills-globali-ripulisci.sh --allinea
 *
 * Uso:  node media/test-skill-collisioni.mjs   (esce 1 se trova problemi)
 *
 * Verifica l'istanza corrente; per un'altra istanza dell'harness passane le variabili:
 *   DASH_SKILLS_DIR=/home/tester08/skills HOME=/home/tester08 \
 *   PI_CODING_AGENT_DIR=/var/lib/tester08/agent node media/test-skill-collisioni.mjs
 */

import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { cwd, env } from "node:process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Parametrizzato: verifica l'istanza corrente, oppure un'altra passandone le variabili.
//   DASH_SKILLS_DIR=/home/tester08/skills HOME=/home/tester08 \
//   PI_CODING_AGENT_DIR=/var/lib/tester08/agent node media/test-skill-collisioni.mjs
const SKILLS_DIR = realpathSync(env.DASH_SKILLS_DIR || join(__dirname, "..", "skills"));
// Le cartelle globali dipendono da HOME e dall'agentDir: due istanze con HOME
// diverso NON condividono le globali (è il motivo per cui le skill non sono
// automaticamente disponibili su tutte le istanze).
const GLOBAL_DIRS = [join(homedir(), ".agents", "skills"), join(getAgentDir(), "skills")];

const problemi = [];

// ---- 1) cosa carica davvero pi, con la stessa config della dashboard --------
const loader = new DefaultResourceLoader({
  cwd: cwd(),
  agentDir: getAgentDir(),
  additionalSkillPaths: [SKILLS_DIR],
});
await loader.reload();

const { skills, diagnostics } = loader.getSkills();
const collisioni = diagnostics.filter((d) => d.type === "collision");
const altriAvvisi = diagnostics.filter((d) => d.type !== "collision");

const origine = (filePath) => {
  let reale = filePath;
  try {
    reale = realpathSync(filePath);
  } catch {
    /* percorso non risolvibile: lo dico sotto */
  }
  if (reale.startsWith(SKILLS_DIR)) {
    return filePath === reale ? "[harness]" : "[globale → skills]";
  }
  return "[globale]";
};

console.log(`istanza: ${SKILLS_DIR}`);
console.log(`globali: ${GLOBAL_DIRS.join(", ")}`);
console.log(`skill caricate: ${skills.length}`);
for (const s of skills) console.log(`  ${origine(s.filePath).padEnd(18)} ${s.name}`);

if (altriAvvisi.length) {
  console.log(`\navvisi non di collisione: ${altriAvvisi.length}`);
  for (const d of altriAvvisi) console.log(`  ${d.type}: ${d.message} — ${d.path ?? ""}`);
}

// ---- 2) collisioni ----------------------------------------------------------
if (collisioni.length) {
  problemi.push(`${collisioni.length} collisioni di nome`);
  console.log(`\n✗ ${collisioni.length} collisioni di nome:`);
  for (const c of collisioni) {
    const info = c.collision ?? {};
    console.log(`  ${c.message}`);
    console.log(`    vince:  ${info.winnerPath ?? "?"}`);
    console.log(`    perde:  ${info.loserPath ?? c.path ?? "?"}`);
  }
}

// ---- 3) stato delle cartelle globali ---------------------------------------
for (const gdir of GLOBAL_DIRS) {
  if (!existsSync(gdir)) continue;
  for (const voce of readdirSync(gdir)) {
    const gpath = join(gdir, voce);
    const lpath = join(SKILLS_DIR, voce);
    let lstat;
    try {
      lstat = lstatSync(gpath);
    } catch {
      continue;
    }

    if (lstat.isSymbolicLink()) {
      // symlink: deve puntare a una skill reale (con SKILL.md). La destinazione può
      // stare in un'altra istanza dell'harness: le altre istanze leggono le globali
      // condivise di root e il symlink è il modo con cui vedono le skill di pi-harness.
      try {
        const target = realpathSync(gpath);
        if (!existsSync(join(target, "SKILL.md"))) {
          problemi.push(`symlink senza SKILL.md: ${gpath}`);
          console.log(`\n⚠ ${gpath} → ${target} (senza SKILL.md)`);
        } else {
          const dove = target.startsWith(SKILLS_DIR) ? "questa istanza" : "altra istanza";
          console.log(`\n  symlink ok (${dove}): ${gpath} → ${readlinkSync(gpath)}`);
        }
      } catch {
        problemi.push(`symlink rotto: ${gpath}`);
        console.log(`\n✗ SYMLINK ROTTO: ${gpath}`);
      }
      continue;
    }

    if (!existsSync(lpath) || !statSync(lpath).isDirectory()) continue; // globale senza omonimo: ok

    // copia reale duplicata: divergenza possibile
    const diverge = (() => {
      const a = join(SKILLS_DIR, voce);
      const b = gpath;
      const fileA = readdirSync(a, { withFileTypes: true }).map((d) => d.name).sort();
      const fileB = readdirSync(b, { withFileTypes: true }).map((d) => d.name).sort();
      if (fileA.join() !== fileB.join()) return true;
      for (const f of fileA) {
        const fa = join(a, f);
        const fb = join(b, f);
        if (!statSync(fa).isFile()) continue;
        try {
          if (!statSync(fa).isFile() || !statSync(fb).isFile()) return true;
          if (readFileSync(fa).compare(readFileSync(fb)) !== 0) return true;
        } catch {
          return true;
        }
      }
      return false;
    })();

    if (diverge) {
      problemi.push(`copia globale DIVERSA da skills/: ${voce}`);
      console.log(`\n✗ copia reale globale DIVERSA da skills/: ${gpath}`);
    } else {
      problemi.push(`copia reale duplicata (identica): ${voce}`);
      console.log(`\n⚠ copia reale duplicata (identica): ${gpath} — sostituibile con symlink`);
    }
  }
}

// ---- esito -----------------------------------------------------------------
if (!problemi.length) {
  console.log("\n✓ nessuna collisione, nessuna copia globale duplicata, symlink ok");
  process.exit(0);
}

console.log(`\n✗ problemi: ${problemi.length}`);
for (const p of problemi) console.log(`  - ${p}`);
console.log(
  "\nRimedio: bash scripts/skills-globali-ripulisci.sh --allinea " +
    "(backup, allinea skills/, sostituisce le copie globali con symlink).",
);
process.exit(1);
