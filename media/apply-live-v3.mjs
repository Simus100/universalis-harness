/**
 * Live view v3: regola di layout mancante per #liveView (le altre viste specializzate
 * hanno `padding: 0; gap: 0`, la live no: così il riquadro del browser perdeva ~60px di
 * spazio utile). Idempotente.
 *   node media/apply-live-v3.mjs --root . [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const HTML = path.join(ROOT, "dashboard.html");
const MARKER = "#liveView { padding: 0;";

const EDITS = [
  {
    label: "regola #liveView (pieno spazio al browser)",
    from: `#filesView { padding: 0; gap: 0; }`,
    to: `#filesView { padding: 0; gap: 0; }
/* la live view gestisce da sé spazi e scroll: il riquadro del browser deve prendersi tutto
   lo spazio disponibile, e il log (altezza fissa) non deve comprimerlo */
#liveView { padding: 0; gap: 0; overflow: hidden; }`,
  },
  {
    label: "log leggermente più compatto di default",
    from: `.livechatlog { height: 116px; overflow-y: auto; font-size: 13px; line-height: 1.45;`,
    to: `.livechatlog { height: 100px; overflow-y: auto; font-size: 13px; line-height: 1.45;`,
  },
];

let src = fs.readFileSync(HTML, "utf8");
if (src.includes(MARKER)) {
  console.log("• già applicata");
  process.exit(0);
}
for (const e of EDITS) {
  const count = src.split(e.from).length - 1;
  if (count !== 1) {
    console.error(`✘ ancora "${e.label}": trovata ${count} volte (attesa 1)`);
    process.exit(1);
  }
  src = src.replace(e.from, e.to);
}
if (args.includes("--dry-run")) {
  console.log(`✓ ${EDITS.length} modifiche validate (dry-run)`);
  process.exit(0);
}
fs.writeFileSync(HTML, src);
console.log(`✓ dashboard.html: ${EDITS.length} modifiche applicate (layout live)`);
