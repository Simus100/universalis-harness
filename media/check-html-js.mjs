/** Verifica la sintassi di tutto il JavaScript incorporato in dashboard.html. */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const html = fs.readFileSync("/root/pi-harness/dashboard.html", "utf8");
const blocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
if (!blocks.length) {
  console.error("✘ nessun blocco <script> trovato");
  process.exit(1);
}
let fail = 0;
blocks.forEach((b, i) => {
  const code = b[1];
  const tmp = `/tmp/dash-script-${i}.js`;
  fs.writeFileSync(tmp, code);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    console.log(`  ✔ blocco <script> #${i + 1}: ${code.length} caratteri, sintassi OK`);
  } catch (e) {
    fail++;
    console.error(`  ✘ blocco <script> #${i + 1}: ERRORE di sintassi`);
    console.error(String(e.stderr || e.message).split("\n").slice(0, 6).join("\n"));
  }
  fs.unlinkSync(tmp);
});
console.log(`\nrisultato: ${blocks.length - fail}/${blocks.length} blocchi validi`);
process.exit(fail ? 1 : 0);
