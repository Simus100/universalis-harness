/**
 * Patch: chat compatta dentro la vista live, per dare comandi all'agente mentre si guarda
 * il browser. Solo frontend: riusa POST /api/prompt (esistente) e gli eventi SSE (esistenti).
 * Idempotente. Uso:
 *   node media/apply-live-chat.mjs --root .            (produzione)
 *   node media/apply-live-chat.mjs --root media/spike  (test)
 *
 * Modifiche a dashboard.html:
 *  1. CSS della chat compatta
 *  2. markup (log + input + invia + stop)
 *  3. funzioni liveChat*
 *  4. listener di invio/stop e alimentazione del log dagli eventi SSE
 */
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const ROOT = path.resolve(args.includes("--root") ? args[args.indexOf("--root") + 1] : ".");
const HTML = path.join(ROOT, "dashboard.html");
const MARKER = "liveChatLog";

const EDITS = [
  {
    label: "CSS della chat live",
    from: `.livebadge.human { border-color: rgba(250,204,21,.6); color: #facc15; }`,
    to: `.livebadge.human { border-color: rgba(250,204,21,.6); color: #facc15; }

/* chat compatta dentro la vista live: dare comandi senza lasciare il browser */
.livechat { border-top: 1px solid rgba(255,255,255,.08); padding: 6px 10px 8px; display: flex;
  flex-direction: column; gap: 6px; }
.livechatlog { max-height: 24vh; overflow-y: auto; font-size: 13px; line-height: 1.45;
  display: flex; flex-direction: column; gap: 4px; }
.livechatlog .lm { padding: 3px 8px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; }
.livechatlog .lm.you { background: rgba(139,92,255,.16); align-self: flex-end; max-width: 86%; }
.livechatlog .lm.agent { background: rgba(255,255,255,.05); max-width: 96%; }
.livechatlog .lm.tool { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 11.5px; opacity: .85; }
.livechatlog .lm.err { background: rgba(248,113,113,.15); color: #fca5a5; }
.livechatlog:empty::before { content: "Scrivi qui per dare comandi all'agente mentre guardi il browser.";
  opacity: .45; font-size: 12.5px; }
.livechatin { display: flex; gap: 6px; align-items: center; }
.livechatin input { flex: 1; min-height: 34px; padding: 0 10px; border-radius: 8px;
  border: 1px solid rgba(255,255,255,.14); background: rgba(0,0,0,.25); color: inherit; font-size: 14px; }
.livechatin input:focus { outline: none; border-color: rgba(167,139,250,.6); }`,
  },
  {
    label: "markup della chat live",
    from: `    <div class="livebar">
      <span class="lu" id="liveUrl">—</span>
      <span style="flex:1"></span>
      <span id="liveStats"></span>
    </div>
  </div>
</main>`,
    to: `    <div class="livebar">
      <span class="lu" id="liveUrl">—</span>
      <span style="flex:1"></span>
      <span id="liveStats"></span>
    </div>
    <div class="livechat">
      <div class="livechatlog" id="liveChatLog"></div>
      <div class="livechatin">
        <input id="liveInput" type="text" placeholder="dai un comando all'agente… (Invio)" autocomplete="off" />
        <button class="ghost" id="liveSend" type="button">invia</button>
        <button class="ghost" id="liveStopBtn" type="button" hidden title="Interrompi la risposta">⏹</button>
      </div>
    </div>
  </div>
</main>`,
  },
  {
    label: "funzioni della chat live",
    from: `async function sendInput(payload) {
  if (liveControl !== "human") return;
  try {
    await fetch("/api/browser/input", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* niente */
  }
}`,
    to: `async function sendInput(payload) {
  if (liveControl !== "human") return;
  try {
    await fetch("/api/browser/input", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* niente */
  }
}

/* ---- chat dentro la vista live: comandi all'agente senza cambiare vista ---- */
let liveChatMsgs = [];
let liveAgentMsg = null;

function liveChatRender() {
  const el = $("liveChatLog");
  if (!el) return;
  el.innerHTML = liveChatMsgs
    .map((m) => \`<div class="lm \${m.role}">\${m.role === "tool" ? "🔧 " : ""}\${escHtml(m.text)}</div>\`)
    .join("");
  el.scrollTop = el.scrollHeight;
}

function liveChatPush(role, text) {
  liveChatMsgs.push({ role, text });
  if (liveChatMsgs.length > 60) liveChatMsgs = liveChatMsgs.slice(-60);
  liveChatRender();
  return liveChatMsgs[liveChatMsgs.length - 1];
}

function liveSetStreaming(on) {
  const b = $("liveStopBtn");
  if (!b) return;
  b.hidden = !on;
  if (!on) liveAgentMsg = null;
  liveChatRender();
}

async function liveChatSend() {
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
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      liveChatPush("err", j.error || \`errore HTTP \${r.status}\`);
      liveSetStreaming(false);
    }
  } catch (e) {
    liveChatPush("err", e.message);
    liveSetStreaming(false);
  }
  // togliere il focus: così, in modalità controllo, i tasti successivi vanno al browser
  inp.blur();
}

async function liveStop() {
  try {
    await fetch("/api/abort", { method: "POST" });
  } catch {
    /* niente */
  }
}`,
  },
  {
    label: "listener della chat live",
    from: `$("liveBack").onclick = () => showTab("chat");
$("liveWatch").onclick = () => (liveWatching ? stopWatch() : startWatch());
$("liveControl").onclick = () => setControl(liveControl === "human" ? "agent" : "human");`,
    to: `$("liveBack").onclick = () => showTab("chat");
$("liveWatch").onclick = () => (liveWatching ? stopWatch() : startWatch());
$("liveControl").onclick = () => setControl(liveControl === "human" ? "agent" : "human");
$("liveSend").onclick = () => liveChatSend();
$("liveStopBtn").onclick = () => liveStop();
$("liveInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    liveChatSend();
  }
});`,
  },
  {
    label: "alimentazione del log dagli eventi SSE",
    from: `es.addEventListener("browser_frame", (e) => {
  if (document.body.dataset.tab !== "live") return; // non renderizzare se non si sta guardando
  try {
    liveRenderFrame(JSON.parse(e.data));
  } catch {}
});`,
    to: `es.addEventListener("browser_frame", (e) => {
  if (document.body.dataset.tab !== "live") return; // non renderizzare se non si sta guardando
  try {
    liveRenderFrame(JSON.parse(e.data));
  } catch {}
});

/* la risposta dell'agente arriva anche nella chat live, così si capisce cosa sta facendo */
es.addEventListener("text_delta", (e) => {
  if (document.body.dataset.tab !== "live") return;
  try {
    const d = JSON.parse(e.data).delta;
    if (!liveAgentMsg) liveAgentMsg = liveChatPush("agent", "");
    liveAgentMsg.text += d;
    liveChatRender();
  } catch {}
});
es.addEventListener("tool_start", (e) => {
  if (document.body.dataset.tab !== "live") return;
  try {
    liveChatPush("tool", JSON.parse(e.data).toolName + "…");
  } catch {}
});
es.addEventListener("status", (e) => {
  if (document.body.dataset.tab !== "live") return;
  try {
    const st = JSON.parse(e.data);
    if (st.streaming) liveSetStreaming(true);
    else liveSetStreaming(false);
  } catch {}
});
es.addEventListener("error", (e) => {
  if (document.body.dataset.tab !== "live") return;
  try {
    liveChatPush("err", JSON.parse(e.data).message || "errore");
  } catch {}
});`,
  },
];

let src = fs.readFileSync(HTML, "utf8");
if (src.includes(MARKER)) {
  console.log(`• ${path.relative(ROOT, HTML)}: chat live già applicata`);
  process.exit(0);
}
for (const e of EDITS) {
  const count = src.split(e.from).length - 1;
  if (count !== 1) {
    console.error(`✘ ancora "${e.label}": trovata ${count} volte (attesa 1). Interrompo.`);
    process.exit(1);
  }
  src = src.replace(e.from, e.to);
}
if (args.includes("--dry-run")) {
  console.log(`✓ ${EDITS.length} modifiche validate (dry-run, non scritto)`);
  process.exit(0);
}
fs.writeFileSync(HTML, src);
console.log(`✓ ${path.relative(ROOT, HTML)}: ${EDITS.length} modifiche applicate (chat nella vista live)`);
