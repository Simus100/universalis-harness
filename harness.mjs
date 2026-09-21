/**
 * pi harness con livello di thinking selezionabile.
 *
 * Uso:
 *   node harness.mjs --model deepseek-flash --think high
 *   node harness.mjs --think max                 # solo livello
 *   node harness.mjs                             # default: deepseek-flash, high
 *
 * Comandi interattivi (durante l'input):
 *   /think <off|minimal|low|medium|high|xhigh|max>   cambia livello al volo
 *   /think                                            mostra il livello attuale e i supportati
 *   /think next                                       cicla al livello supportato successivo
 *   /model <id>                                       cambia modello
 *   /exit                                             esce
 *
 * Domande interattive: l'agente può chiedere all'utente con il tool `ask_user` (stesso broker
 * della dashboard). Qui la domanda appare nel terminale con opzioni numerate e si risponde
 * digitando il numero, l'etichetta, un testo libero o vuoto per saltare.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output, argv, cwd, exit } from "node:process";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { createAskBroker } from "./media/ask-broker.mjs";
import { createAskExtension } from "./media/ask-tool.mjs";

// ---- argomenti CLI -----------------------------------------------------
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

const ALL_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const wantModel = arg("model", "deepseek-flash");
let thinkingLevel = arg("think", "high");

// ---- runtime & sessione -------------------------------------------------
const modelRuntime = await ModelRuntime.create({ allowModelNetwork: true });

const [provider, ...rest] = wantModel.includes("/") ? wantModel.split("/") : ["deepseek", wantModel];
const modelId = rest.length ? rest.join("/") : provider;

let model = modelRuntime.getModel(provider, modelId) ?? modelRuntime.getModel("deepseek", wantModel);
if (!model) {
  console.error(`Modello non trovato: ${wantModel}`);
  exit(1);
}

// ---- broker delle domande (condiviso con la dashboard: media/ask-broker.mjs) ----
const askBroker = createAskBroker({
  broadcast: (event, data) => terminalAsk(event, data),
  logFile: process.env.DASH_ASK_LOG_FILE || "/root/pi-harness/media/ask-log.jsonl",
  hasClients: () => (input.isTTY ? 1 : 0),
  sessionId: () => session?.sessionId ?? null,
  log: (m) => console.log(m),
});
const ASK_EXT_CLI = createAskExtension({ broker: askBroker, log: (m) => console.log(m) });

// Le estensioni inline NON si passano a createAgentSession: le carica il ResourceLoader.
// (Passarle direttamente viene ignorato in silenzio: il tool non compare e sembra che il
// modello «non voglia» usarlo. Lezione già annotata per la dashboard, vale anche qui.)
const resourceLoader = new DefaultResourceLoader({
  cwd: cwd(),
  agentDir: getAgentDir(),
  extensionFactories: [ASK_EXT_CLI],
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  model,
  thinkingLevel,
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  resourceLoader,
});

/**
 * Domande all'utente nel terminale.
 *
 * Il broker è lo stesso della dashboard (`media/ask-broker.mjs`): qui cambia solo chi mette la
 * domanda davanti a una persona. Senza terminale interattivo (stdin non TTY, es. piping) non si
 * resta in attesa: si risponde «decline», così il turno non si blocca mai aspettando un umano
 * che non c'è.
 */
let rl = null; // creato sotto, prima del REPL

function terminalAsk(event, data) {
  if (event === "ask_request") void answerInTerminal(data);
  else if (event === "ask_resolved" && data.status !== "answered") {
    console.log(`\n[domanda] ${data.status === "declined" ? "saltata" : data.status === "expired" ? "tempo scaduto" : "annullata"} — l'agente prosegue da solo.\n`);
  }
}

async function answerInTerminal(req) {
  const tty = Boolean(input.isTTY) && rl;
  if (!tty) {
    console.log(`\n[domanda] nessun terminale interattivo: rispondo «salta» per non bloccare il turno.\n`);
    askBroker.respond(req.id, { action: "decline", reason: "stdin non interattivo" });
    return;
  }
  console.log(`\n\u001b[35m? ${req.questions.length > 1 ? "domande" : "domanda"} dall'agente\u001b[0m${req.context ? ` \u001b[2m(${req.context})\u001b[0m` : ""}`);
  const answers = [];
  try {
    for (const q of req.questions) {
      console.log(`\u001b[1m${q.header}\u001b[0m — ${q.question}`);
      q.options.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}${o.description ? ` \u001b[2m— ${o.description}\u001b[0m` : ""}`));
      const hint = q.multiSelect ? "numeri separati da virgola, testo libero, o invio per saltare" : "numero, testo libero, o invio per saltare";
      const raw = (await rl.question(`  > (${hint}) `)).trim();
      if (!raw) {
        answers.push({ id: q.id, selected: [], other: null, skipped: true });
        continue;
      }
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      const selected = parts
        .map((p) => (/^\d+$/.test(p) ? q.options[Number(p) - 1]?.label : q.options.find((o) => o.label.toLowerCase() === p.toLowerCase())?.label))
        .filter(Boolean);
      if (selected.length) answers.push({ id: q.id, selected: q.multiSelect ? selected : selected.slice(0, 1), other: null, skipped: false });
      else answers.push({ id: q.id, selected: [], other: raw, skipped: false });
    }
    askBroker.respond(req.id, { action: "accept", answers });
  } catch (err) {
    console.log(`[domanda] non ho potuto raccogliere la risposta (${err?.message ?? err}): l'agente prosegue da solo.`);
    try {
      askBroker.respond(req.id, { action: "decline", reason: "errore nel terminale" });
    } catch {
      /* già risolta (timeout/scadenza): niente da fare */
    }
  }
}

// livelli supportati per il modello corrente
function supportedLevels(m) {
  const map = m?.thinkingLevelMap;
  if (!map) return ALL_LEVELS;
  return ALL_LEVELS.filter((l) => map[l] !== null && map[l] !== undefined);
}

function printThinkingInfo() {
  const supported = supportedLevels(model);
  console.log(`\n[thinking] livello attuale: ${session.thinkingLevel}`);
  console.log(`[thinking] supportati da ${model.id}: ${supported.join(", ")}\n`);
}

// ---- streaming eventi ---------------------------------------------------
session.subscribe((event) => {
  if (event.type !== "message_update") return;
  const ev = event.assistantMessageEvent;
  if (ev.type === "thinking_delta") {
    output.write(`\x1b[2m${ev.delta}\x1b[0m`); // grigio = thinking
  } else if (ev.type === "text_delta") {
    output.write(ev.delta);
  }
});

// ---- REPL ---------------------------------------------------------------
const rlCli = createInterface({ input, output });
rl = rlCli;

console.log(`pi harness — modello: ${model.id} — thinking: ${session.thinkingLevel}`);
printThinkingInfo();
console.log("Scrivi un prompt. Comandi: /think <livello>, /think next, /model <id>, /exit\n");

while (true) {
  let line;
  try {
    line = await rl.question("you> ");
  } catch {
    break;
  }
  const text = line.trim();
  if (!text) continue;

  if (text === "/exit" || text === "/quit") break;

  if (text.startsWith("/think")) {
    const parts = text.split(/\s+/);
    const val = parts[1];
    if (!val) {
      printThinkingInfo();
    } else if (val === "next") {
      const supported = supportedLevels(model);
      if (!supported.length) {
        console.log(`Nessun livello supportato da ${model.id}\n`);
      } else {
        const cur = supported.indexOf(session.thinkingLevel);
        const next = supported[(cur + 1) % supported.length];
        session.setThinkingLevel(next);
        console.log(`[thinking] -> ${next}\n`);
      }
    } else if (!ALL_LEVELS.includes(val)) {
      console.log(`Livello non valido. Usa: ${ALL_LEVELS.join(", ")}\n`);
    } else if (!supportedLevels(model).includes(val)) {
      console.log(`Livello non supportato dal modello ${model.id}. Supportati: ${supportedLevels(model).join(", ")}\n`);
    } else {
      session.setThinkingLevel(val);
      console.log(`[thinking] -> ${val}\n`);
    }
    continue;
  }

  if (text.startsWith("/model")) {
    const id = text.split(/\s+/)[1];
    if (!id) {
      console.log(`Modello attuale: ${model.id} (provider: ${model.provider})\n`);
      continue;
    }
    const m =
      modelRuntime.getModel("deepseek", id) ??
      modelRuntime.getModel(id.split("/")[0], id.split("/").slice(1).join("/"));
    if (!m) {
      console.log(`Modello non trovato: ${id}\n`);
      continue;
    }
    model = m;
    await session.setModel(m);
    // se il livello corrente non è supportato dal nuovo modello, torna al primo supportato
    const sup = supportedLevels(m);
    if (sup.length && !sup.includes(session.thinkingLevel)) {
      session.setThinkingLevel(sup[0]);
    }
    console.log(`[model] -> ${m.id} (provider: ${m.provider})`);
    printThinkingInfo();
    continue;
  }

  try {
    output.write("pi> ");
    await session.prompt(text);
    output.write("\n\n");
  } catch (err) {
    console.error(`\n[errore] ${err?.message ?? err}\n`);
  }
}

rl.close();
session.dispose();
console.log("bye");
