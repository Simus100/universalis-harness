/**
 * Live view v4: layout a flex (più prevedibile del grid su schermi piccoli) e log con tre
 * stati (compatto → espanso → nascosto), così il riquadro del browser può prendersi tutto
 * lo spazio disponibile quando serve.
 * Idempotente. Uso: node media/apply-live-v4.mjs --root . [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const HTML = path.join(ROOT, "dashboard.html");
const MARKER = "livechatlog.hidden";

const EDITS = [
  {
    label: "layout flex: il browser prende lo spazio rimanente",
    from: `.livewrap { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(240px, 1fr) auto auto auto;
  gap: 6px; padding: 0 8px 6px; }
.livestage { position: relative; min-height: 240px; display: flex; align-items: center;`,
    to: `/* Flex (non grid): su schermi piccoli il riquadro del browser prende TUTTO lo spazio
   rimanente e il log, che ha altezza fissa, non lo comprime mai. */
.livewrap { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; padding: 0 8px 6px; }
.livestage { position: relative; flex: 1 1 auto; min-height: 200px; display: flex; align-items: center;`,
  },
  {
    label: "log compatto e nascondibile",
    from: `.livechatlog { height: 100px; overflow-y: auto; font-size: 13px; line-height: 1.45;
  display: flex; flex-direction: column; gap: 4px; }
.livechatlog.expanded { height: 40vh; }`,
    to: `.livechatlog { height: 88px; flex: none; overflow-y: auto; font-size: 13px; line-height: 1.45;
  display: flex; flex-direction: column; gap: 4px; }
.livechatlog.expanded { height: 38vh; }
.livechatlog.hidden { display: none; }
.livebar { flex: none; }
.livechat { flex: none; }`,
  },
  {
    label: "toggle del log a tre stati",
    from: `$("liveLogToggle").onclick = () => {
  const el = $("liveChatLog");
  const on = el.classList.toggle("expanded");
  $("liveLogToggle").textContent = on ? "▾ log" : "▴ log";
};`,
    to: `// tre stati: compatto → espanso → nascosto (per dare tutto lo spazio al browser)
$("liveLogToggle").onclick = () => {
  const el = $("liveChatLog");
  const btn = $("liveLogToggle");
  if (el.classList.contains("hidden")) {
    el.classList.remove("hidden", "expanded");
    btn.textContent = "▴ log";
    btn.title = "Espandi il log";
  } else if (el.classList.contains("expanded")) {
    el.classList.remove("expanded");
    el.classList.add("hidden");
    btn.textContent = "▫ log";
    btn.title = "Mostra il log";
  } else {
    el.classList.add("expanded");
    btn.textContent = "▾ log";
    btn.title = "Comprimi il log";
  }
};`,
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
console.log(`✓ dashboard.html: ${EDITS.length} modifiche applicate (layout flex + log a 3 stati)`);
