/**
 * Misura quanto contesto "di default" l'harness manda al modello PRIMA di qualsiasi
 * messaggio utente: system prompt (base pi + note della dashboard) + definizioni dei tool.
 *
 * Replica la costruzione della sessione come fa dashboard.mjs, poi serializza i pezzi.
 * Output: /tmp/misura/pezzi.json con i testi e i conteggi.
 */
import { existsSync, writeFileSync } from "node:fs";
import { cwd } from "node:process";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { createBrowserExtension } from "/root/pi-harness/media/browser-tool.mjs";
import { createMemoriaExtension } from "/root/pi-harness/media/memoria/memoria-tool.mjs";
import { createAskExtension } from "/root/pi-harness/media/ask-tool.mjs";
import { createAskBroker } from "/root/pi-harness/media/ask-broker.mjs";

const SKILLS_DIR = "/root/pi-harness/skills";
const MEDIA_DIR = "/root/pi-harness/media";
const SUBAGENT_EXT =
  process.env.DASH_SUBAGENT_EXT || "/root/.pi/agent/npm/node_modules/pi-subagents/index.ts";

// La nota che la dashboard appende al system prompt: la ricaviamo dal sorgente per non
// duplicarla a mano (evita che la misura invecchi).
const HARNESS_SRC = await import("node:fs").then((fs) => fs.readFileSync("/root/pi-harness/dashboard.mjs", "utf8"));
function estraiCostante(nome) {
  const start = HARNESS_SRC.indexOf(`const ${nome} =`);
  if (start === -1) throw new Error(`costante ${nome} non trovata`);
  // dalla riga della dichiarazione fino alla riga che chiude con ";\n" alla prima colonna
  const rest = HARNESS_SRC.slice(start);
  const end = rest.indexOf("\n\n");
  const blocco = rest.slice(0, end === -1 ? rest.length : end);
  // eval controllato: è codice del progetto stesso (MEDIA_DIR/GOALS_FILE arrivano da fuori)
  const fn = new Function("MEDIA_DIR", "GOALS_FILE", `${blocco.replace(/^const /, "return ")}`);
  return fn(MEDIA_DIR, `${MEDIA_DIR}/goals.json`);
}

const SYSTEM_MEDIA_NOTE = estraiCostante("SYSTEM_MEDIA_NOTE");
console.error(`nota di sistema: ${SYSTEM_MEDIA_NOTE.length} caratteri`);

const MEDIA_GUARD_EXT = { name: "media-guard", factory: () => {} };

const askBroker = createAskBroker({
  broadcast: () => {},
  logFile: "/tmp/misura/ask-log.jsonl",
  hasClients: () => 0,
  sessionId: () => null,
  log: () => {},
});
const ASK_EXT = createAskExtension({ broker: askBroker, log: () => {} });
const BROWSER_EXT = createBrowserExtension({
  log: () => {},
  port: 0,
  host: "127.0.0.1",
});
const MEMORIA_EXT = createMemoriaExtension({ log: () => {} });

const additionalExtensionPaths = existsSync(SUBAGENT_EXT) ? [SUBAGENT_EXT] : [];

const resourceLoader = new DefaultResourceLoader({
  cwd: cwd(),
  agentDir: getAgentDir(),
  additionalExtensionPaths,
  additionalSkillPaths: [SKILLS_DIR],
  extensionFactories: [MEDIA_GUARD_EXT, BROWSER_EXT, MEMORIA_EXT, ASK_EXT],
  systemPromptOverride: (base) => `${base ?? ""}${SYSTEM_MEDIA_NOTE}`,
});
await resourceLoader.reload();

const modelRuntime = await ModelRuntime.create({ allowModelNetwork: false }).catch(() => null);
const anyModel = modelRuntime?.getModel?.("deepseek", "deepseek-flash") ?? null;

const { session } = await createAgentSession({
  model: anyModel,
  thinkingLevel: "high",
  modelRuntime,
  sessionManager: SessionManager.inMemory(),
  resourceLoader,
});

const sys = session._baseSystemPrompt ?? resourceLoader.getSystemPrompt?.() ?? "";
const toolDefs = (session.agent?.state?.tools ?? []).map((t) => ({
  name: t.name,
  description: t.description,
  parameters: t.parameters ?? t.inputSchema ?? null,
}));

const skills = resourceLoader.getSkills?.().skills ?? [];

const stima = (s) => Math.ceil(s.length / 4);
const toolsJson = JSON.stringify(toolDefs);
const toolsJsonComp = JSON.stringify(toolDefs.map((t) => ({ ...t, parameters: t.parameters })));

const out = {
  misuratoIl: new Date().toISOString(),
  cwd: cwd(),
  skillsPaths: [SKILLS_DIR, getAgentDir() + "/skills"],
  systemPrompt: sys,
  tools: toolDefs,
  conteggi: {
    systemPromptCaratteri: sys.length,
    systemPromptTokenStimati: stima(sys),
    numeroTool: toolDefs.length,
    toolNames: toolDefs.map((t) => t.name),
    toolDefsJsonCaratteri: toolsJson.length,
    toolDefsTokenStimati: stima(toolsJson),
    skillsCaricate: skills.map((s) => ({ name: s.name, descrizioneCar: (s.description || "").length })),
    totaleCaratteri: sys.length + toolsJson.length,
    totaleTokenStimati: stima(sys) + stima(toolsJson),
  },
};
writeFileSync("/tmp/misura/pezzi.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.conteggi, null, 2));
