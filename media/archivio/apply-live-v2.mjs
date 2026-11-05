/**
 * Miglioramenti della vista live (v2).
 *
 *  1. CONTESTO: i comandi scritti nella live view partono con un contesto esplicito, così
 *     l'agente sa già che si sta operando SUL browser mostrato (pagina corrente inclusa).
 *  2. LAYOUT: il riquadro del browser ha una dimensione GARANTITA (griglia con minimo) e il
 *     log ha altezza fissa con scroll: aggiungere messaggi non comprime più il browser.
 *  3. ERGONOMIA: log espandibile/comprimibile, pulsante "tastiera → browser", e aprire la
 *     live view + scrivere accende da sé il flusso (e quindi il tool, in modo auto).
 *
 * Idempotente. Uso: node media/apply-live-v2.mjs --root . [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const HTML = path.join(ROOT, "dashboard.html");
const DASH = path.join(ROOT, "dashboard.mjs");
const MARKER = "liveLogToggle";

const EDITS_HTML = [
  {
    label: "layout a griglia (browser con dimensione garantita)",
    from: `.livewrap { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0 8px; }
.livestage { position: relative; flex: 1; min-height: 200px; display: flex; align-items: center;`,
    to: `/* Griglia: la prima riga è il browser e ha un minimo garantito, così il log crescente
   non lo comprime mai. Il log ha altezza FISSA con scroll interno. */
.livewrap { flex: 1; min-height: 0; display: grid; grid-template-rows: minmax(240px, 1fr) auto auto auto;
  gap: 6px; padding: 0 8px 6px; }
.livestage { position: relative; min-height: 240px; display: flex; align-items: center;`,
  },
  {
    label: "log ad altezza fissa + testata con controlli",
    from: `.livechatlog { max-height: 24vh; overflow-y: auto; font-size: 13px; line-height: 1.45;
  display: flex; flex-direction: column; gap: 4px; }`,
    to: `.livechathead { display: flex; align-items: center; gap: 6px; padding: 4px 2px 0; }
.livechathead .gcount { font-size: 11.5px; opacity: .75; }
.livechatlog { height: 116px; overflow-y: auto; font-size: 13px; line-height: 1.45;
  display: flex; flex-direction: column; gap: 4px; }
.livechatlog.expanded { height: 40vh; }`,
  },
  {
    label: "markup: testata del log + pulsanti",
    from: `    <div class="livechat">
      <div class="livechatlog" id="liveChatLog"></div>
      <div class="livechatin">`,
    to: `    <div class="livechat">
      <div class="livechathead">
        <button class="ghost" id="liveLogToggle" type="button" title="Espandi o comprimi il log">▴ log</button>
        <span class="gcount" id="liveHint">i comandi scritti qui riguardano il browser mostrato</span>
        <span style="flex:1"></span>
        <button class="ghost" id="liveFocusBtn" type="button" title="Porta i tasti al browser invece che alla chat">⌨ → browser</button>
      </div>
      <div class="livechatlog" id="liveChatLog"></div>
      <div class="livechatin">`,
  },
  {
    label: "funzione: attiva il flusso se serve",
    from: `async function liveChatSend() {
  const inp = $("liveInput");
  const text = (inp.value || "").trim();
  if (!text) return;
  inp.value = "";
  liveAgentMsg = null;
  liveChatPush("you", text);
  liveSetStreaming(true);
  try {
    const r = await fetch("/api/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });`,
    to: `/** Contesto che accompagna i comandi scritti nella live view: l'agente sa già che
 *  si sta operando sul browser mostrato, e su quale pagina. */
function liveContextNow() {
  const url = ($("liveUrl") && $("liveUrl").textContent) || "";
  const pagina = url && url !== "—" ? \` (pagina: \${url})\` : "";
  return (
    "l'utente sta scrivendo dalla LIVE VIEW del browser" + pagina + ". " +
    "Le sue richieste riguardano l'operatività su quella pagina: usa il tool browser per agire su di essa " +
    "(snapshot prima di interagire, snapshot dopo ogni navigazione). Se il tool non è disponibile, segnalalo."
  );
}

async function liveChatSend() {
  const inp = $("liveInput");
  const text = (inp.value || "").trim();
  if (!text) return;
  inp.value = "";
  liveAgentMsg = null;
  liveChatPush("you", text);
  liveSetStreaming(true);
  // se il flusso non è attivo, chi scrive qui vuole operare sul browser: accendilo
  if (!liveWatching) {
    try {
      await startWatch();
    } catch {
      /* niente */
    }
  }
  try {
    const r = await fetch("/api/prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, clientContext: liveContextNow() }),
    });`,
  },
  {
    label: "listener: log espandibile e tasto verso il browser",
    from: `$("liveSend").onclick = () => liveChatSend();
$("liveStopBtn").onclick = () => liveStop();`,
    to: `$("liveSend").onclick = () => liveChatSend();
$("liveStopBtn").onclick = () => liveStop();
$("liveLogToggle").onclick = () => {
  const el = $("liveChatLog");
  const on = el.classList.toggle("expanded");
  $("liveLogToggle").textContent = on ? "▾ log" : "▴ log";
};
$("liveFocusBtn").onclick = () => {
  // toglie il focus dalla chat: da qui in poi i tasti vanno al browser (modalità controllo)
  $("liveInput").blur();
  if (liveControl !== "human") {
    liveChatPush("tool", "prima premi «prendi il controllo», poi i tasti andranno al browser");
    return;
  }
  liveChatPush("tool", "tastiera verso il browser attiva: clicca nel riquadro e scrivi");
};`,
  },
  {
    label: "suggerimento quando si prende il controllo",
    from: `$("liveControl").onclick = () => setControl(liveControl === "human" ? "agent" : "human");`,
    to: `$("liveControl").onclick = async () => {
  await setControl(liveControl === "human" ? "agent" : "human");
  if (liveControl === "human") {
    $("liveInput").blur();
    liveChatPush("tool", "controllo tuo: clicca nel riquadro per cliccare, «⌨ → browser» per digitare");
  }
};`,
  },
];

const EDITS_DASH = [
  {
    label: "clientContext nel prompt",
    from: `      const { promptText, images } = await buildPromptPayload(text, atts);`,
    to: `      // Contesto dichiarato dal client (es. i comandi scritti dalla live view del browser):
      // viene accodato in un blocco riconoscibile, così resta trasparente nella cronologia.
      const clientContext = String(body.clientContext || "").trim().slice(0, 700);
      const withCtx = clientContext ? \`\${text}\\n\\n[contesto dashboard] \${clientContext}\` : text;
      const { promptText, images } = await buildPromptPayload(withCtx, atts);`,
  },
];

function applyFile(file, edits, marker, { dryRun }) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes(marker)) {
    console.log(`• ${path.relative(ROOT, file)}: già applicata (salto)`);
    return true;
  }
  for (const e of edits) {
    const count = src.split(e.from).length - 1;
    if (count !== 1) {
      console.error(`✘ ${path.basename(file)} → ancora "${e.label}": trovata ${count} volte (attesa 1)`);
      return false;
    }
    src = src.replace(e.from, e.to);
  }
  if (dryRun) {
    console.log(`✓ ${path.relative(ROOT, file)}: ${edits.length} modifiche validate (dry-run)`);
    return true;
  }
  fs.writeFileSync(file, src);
  console.log(`✓ ${path.relative(ROOT, file)}: ${edits.length} modifiche applicate`);
  return true;
}

const dry = args.includes("--dry-run");
const ok1 = applyFile(HTML, EDITS_HTML, MARKER, { dryRun: dry });
const ok2 = applyFile(DASH, EDITS_DASH, "clientContext", { dryRun: dry });
process.exit(ok1 && ok2 ? 0 : 1);
