import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager } from "@earendil-works/pi-coding-agent";

const CWD = "/root/pi-harness";
const SESDIR = "/tmp/pi-test-sessions";

// estensione di prova: registra un tool esattamente come fa pi-web-access
const probeExt = (pi) => {
  pi.registerTool({
    name: "probe",
    label: "probe",
    description: "probe",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    async execute() { return { content: [{ type: "text", text: "probe-ok" }] }; },
  });
};

const modelRuntime = await ModelRuntime.create({ allowModelNetwork: true });
const model = modelRuntime.getModel("deepseek", "deepseek-flash");

async function makeLoader() {
  const l = new DefaultResourceLoader({ cwd: CWD, agentDir: "/root/.pi/agent", extensionFactories: [probeExt] });
  await l.reload();
  return l;
}
async function newSession(loader) {
  const { session } = await createAgentSession({
    model, modelRuntime, resourceLoader: loader,
    sessionManager: SessionManager.create(CWD, SESDIR),
  });
  return session;
}
async function runProbe(session) {
  const probe = session.agent.state.tools.find((t) => t.name === "probe");
  if (!probe) return { toolAssente: true, tools: session.agent.state.tools.map((t) => t.name).slice(0, 12) };
  try {
    const res = await probe.execute("call-1", {}, undefined, undefined);
    return { esito: "OK", testo: res?.content?.[0]?.text };
  } catch (e) {
    return { esito: "ERRORE", messaggio: e.message.slice(0, 70) + "..." };
  }
}

// ---------- scenario 1: logica ATTUALE di switchSession ----------
let loader = await makeLoader();
const A = await newSession(loader);
const B = await newSession(loader);   // stessa loader => stesso runtime di A
A.dispose();                          // come fa switchSession: dispose della vecchia
console.log("ATTUALE  A.dispose() dopo la creazione di B -> probe(B):", JSON.stringify(await runProbe(B)));
B.dispose();

// ---------- scenario 2: logica CORRETTA ----------
loader = await makeLoader();
const A2 = await newSession(loader);
await loader.reload();                // runtime fresco: B2 non condivide il runtime di A2
const B2 = await newSession(loader);
A2.dispose();                         // invalida solo il runtime della vecchia
console.log("CORRETTO A2.dispose() dopo reload()    -> probe(B2):", JSON.stringify(await runProbe(B2)));
B2.dispose();
process.exit(0);
