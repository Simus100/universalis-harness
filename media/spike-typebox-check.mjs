/**
 * Come si ottiene `typebox` (richiesto da registerTool) da codice applicativo
 * che non lo ha tra le proprie dipendenze?
 * Verifica le strade possibili, in ordine di robustezza.
 */
import { createRequire } from "node:module";

const PI_DIST = "/home/linuxbrew/.linuxbrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js";

// Strada A: createRequire ancorato al bundle di pi-coding-agent
try {
  const cr = createRequire(PI_DIST);
  const resolved = cr.resolve("typebox");
  const tb = cr("typebox");
  console.log("A) createRequire su pi-coding-agent  → RISOLTO");
  console.log("   path:", resolved);
  console.log("   Type:", typeof tb.Type, "| Type.Object:", typeof tb.Type?.Object);
  const schema = tb.Type.Object({ text: tb.Type.String() });
  console.log("   schema generato:", JSON.stringify(schema));
  console.log("   ha il Kind symbol di typebox:", Object.getOwnPropertySymbols(schema).length > 0);
} catch (e) {
  console.log("A) createRequire fallita:", e.message);
}

// Strada B: import dinamico dal path assoluto annidato
try {
  const m = await import(PI_DIST.replace("dist/index.js", "node_modules/typebox/build/index.mjs")).catch(() => null);
  console.log("B) import da path annidato  →", m?.Type ? "RISOLTO" : "non risolto (path/entry diverso)");
} catch (e) {
  console.log("B) import annidato fallito:", e.message);
}

// Strada C: uno schema JSON puro ha la stessa forma?
const pure = { type: "object", properties: { text: { type: "string" } }, required: ["text"] };
console.log("C) JSON Schema puro (senza typebox):", JSON.stringify(pure));
