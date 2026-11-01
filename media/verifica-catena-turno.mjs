// Verifica manuale (non è nel gate: crea un modello del catalogo, senza rete) — catena REALE: estensione → runner di pi → agent.afterToolCall. Nessuna chiamata al modello.
import { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";
import { createControlloTurnoExtension } from "./controllo-turno.mjs";
import { MARCATORE } from "./tool-result-limite.mjs";

const log = [];
const fermate = [];
const ext = createControlloTurnoExtension({
  log: (m) => log.push(m),
  onFerma: (i) => fermate.push(i),
  guardia: { maxPassiSenzaProgresso: 4, maxRipetizioni: 2, maxPassiAssoluti: 999 },
});

const runtime = await ModelRuntime.create({ allowModelNetwork: false }).catch(async (e) => {
  console.log("ModelRuntime offline non disponibile:", e?.message);
  return ModelRuntime.create({ allowModelNetwork: true });
});
const model = runtime.getModel("deepseek", "deepseek-flash") ?? runtime.getModel("deepseek", "deepseek-v4-pro");
console.log("modello:", model?.id, "· finestra:", model?.contextWindow);

const loader = new DefaultResourceLoader({
  cwd: "/root/pi-harness",
  agentDir: getAgentDir(),
  additionalSkillPaths: [],
  extensionFactories: [ext],
  systemPromptOverride: (b) => b ?? "",
});
await loader.reload();

const { session } = await createAgentSession({
  model, modelRuntime: runtime, sessionManager: SessionManager.inMemory(), resourceLoader: loader,
});
console.log("sessione creata · afterToolCall esposto:", typeof session.agent?.afterToolCall === "function");

const grande = "x".repeat(200000);
const r1 = await session.agent.afterToolCall({
  toolCall: { name: "read", id: "t1" },
  args: { path: "/root/pi-harness/dashboard.mjs" },
  result: { content: [{ type: "text", text: grande }], details: { righe: 6569 } },
  isError: false,
});
console.log("1) content 200.000 char → restituito:", r1 ? `${r1.content[0].text.length} char, marcatore=${r1.content[0].text.includes(MARCATORE)}, details=${JSON.stringify(r1.details)}` : "undefined (NON ridotto)");

const r2 = await session.agent.afterToolCall({
  toolCall: { name: "read", id: "t2" }, args: { path: "/tmp/piccolo" },
  result: { content: [{ type: "text", text: "riga breve" }], details: {} }, isError: false,
});
console.log("2) content piccolo → restituito:", r2 === undefined ? "undefined (invariato: corretto)" : "modificato (SBAGLIATO)");

for (let i = 0; i < 5; i++) {
  await session.agent.afterToolCall({
    toolCall: { name: "bash", id: "b" + i }, args: { command: "node -e 1" },
    result: { content: [{ type: "text", text: "ok" }], details: {} }, isError: false,
  });
}
console.log("3) 5 chiamate identiche senza scritture → onFerma chiamata:", fermate.length, "volte ·", fermate[0]?.motivo ?? "nessun motivo");
console.log("4) numeri dell'estensione:", JSON.stringify(ext.numeri()));
console.log("5) log:", log.slice(0, 4));
console.log("ESITO:", r1 && r1.content[0].text.length < 30000 && r2 === undefined && fermate.length === 1 ? "CATENA REALE OK" : "PROBLEMA");
await session.dispose?.();
process.exit(0);
