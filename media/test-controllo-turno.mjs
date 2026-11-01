/**
 * Test di integrazione dell'estensione «controllo-turno» con un motore FINTO.
 *
 * Verifica il collegamento, non la logica (già coperta da test-turno-guardia e
 * test-tool-result-limite): che gli handler si registrino con i nomi giusti, che il risultato
 * troncato venga restituito nella forma che il motore si aspetta (`{content}`), che onFerma sia
 * chiamata UNA volta per turno, che un turno nuovo azzeri i contatori e che nessun errore
 * interno possa mai propagarsi e rompere un turno.
 *
 * Nessuna rete, nessun modello, nessun filesystem.
 * Uso: node media/test-controllo-turno.mjs
 */
import assert from "node:assert/strict";
import { createControlloTurnoExtension } from "./controllo-turno.mjs";
import { MARCATORE } from "./tool-result-limite.mjs";

let passati = 0;
const falliti = [];
function prova(nome, fn) {
  try {
    fn();
    passati++;
    console.log(`  ✓ ${nome}`);
  } catch (err) {
    falliti.push({ nome, err });
    console.log(`  ✘ ${nome}`);
    console.log(`      ${err.message.split("\n")[0]}`);
  }
}

/** Motore finto: registra gli handler come fa pi. */
function motoreFinto() {
  const handlers = new Map();
  return {
    handlers,
    on(evento, fn) {
      if (!handlers.has(evento)) handlers.set(evento, []);
      handlers.get(evento).push(fn);
    },
    async emetti(evento, payload) {
      const out = [];
      for (const fn of handlers.get(evento) || []) out.push(await fn(payload));
      return out;
    },
  };
}

async function provaAsync(nome, fn) {
  try {
    await fn();
    passati++;
    console.log(`  ✓ ${nome}`);
  } catch (err) {
    falliti.push({ nome, err });
    console.log(`  ✘ ${nome}`);
    console.log(`      ${err.message.split("\n")[0]}`);
  }
}

const log = [];
function nuova(opt = {}) {
  const fermate = [];
  const ext = createControlloTurnoExtension({
    log: (m) => log.push(m),
    onFerma: (info) => fermate.push(info),
    ...opt,
  });
  const pi = motoreFinto();
  ext.factory(pi);
  return { ext, pi, fermate };
}

const T = (n) => [{ type: "text", text: "t".repeat(n) }];

console.log("controllo-turno — registrazione");
const base = nuova();
prova("registra tool_result e agent_start", () => {
  assert.ok(base.pi.handlers.get("tool_result")?.length === 1, "un handler tool_result");
  assert.ok(base.pi.handlers.get("agent_start")?.length === 1, "un handler agent_start");
});
prova("l'estensione si chiama «controllo-turno»", () => {
  assert.equal(base.ext.name, "controllo-turno");
});

console.log("\ncontrollo-turno — taglio del risultato");
await provaAsync("risultato piccolo: handler restituisce undefined (nessuna modifica)", async () => {
  const r = await base.pi.emetti("tool_result", { toolName: "read", input: { path: "/a" }, content: T(500) });
  assert.equal(r[0], undefined);
});
await provaAsync("risultato enorme: restituisce {content} troncato", async () => {
  const r = await base.pi.emetti("tool_result", { toolName: "read", input: { path: "/a" }, content: T(200000) });
  assert.ok(r[0] && Array.isArray(r[0].content), "deve restituire content");
  assert.ok(r[0].content[0].text.includes(MARCATORE));
  assert.ok(r[0].content[0].text.length < 30000);
});
await provaAsync("i contatori dell'estensione riportano il lavoro fatto", async () => {
  const n = base.ext.numeri();
  assert.ok(n.ridotti >= 1, "almeno un risultato ridotto");
  assert.ok(n.caratteriTolti > 100000, `caratteri tolti: ${n.caratteriTolti}`);
  assert.ok(n.passi >= 2);
});

console.log("\ncontrollo-turno — guardia anti-loop");
const g = nuova({ guardia: { maxPassiSenzaProgresso: 5, maxRipetizioni: 2, maxPassiAssoluti: 999 } });
await provaAsync("sotto soglia non ferma niente", async () => {
  for (let i = 0; i < 4; i++) {
    await g.pi.emetti("tool_result", { toolName: "read", input: { path: `/f${i}` }, content: T(100) });
  }
  assert.equal(g.fermate.length, 0);
});
await provaAsync("oltre soglia ferma e chiama onFerma UNA volta sola", async () => {
  const comando = { command: "node -e 1" };
  await g.pi.emetti("tool_result", { toolName: "bash", input: comando, content: T(50) });
  await g.pi.emetti("tool_result", { toolName: "bash", input: comando, content: T(50) });
  await g.pi.emetti("tool_result", { toolName: "read", input: { path: "/x" }, content: T(50) });
  await g.pi.emetti("tool_result", { toolName: "read", input: { path: "/y" }, content: T(50) });
  assert.equal(g.fermate.length, 1, "una sola fermata");
  assert.match(g.fermate[0].motivo, /nessun progresso/i);
  // altre 10 chiamate non devono produrre altre fermate nello stesso turno
  for (let i = 0; i < 10; i++) {
    await g.pi.emetti("tool_result", { toolName: "read", input: { path: `/z${i}` }, content: T(20) });
  }
  assert.equal(g.fermate.length, 1, "non deve ripetere la fermata nello stesso turno");
});
await provaAsync("agent_start azzera: il turno successivo non eredita il conteggio né lo stato «fermato»", async () => {
  await g.pi.emetti("agent_start", {});
  assert.deepEqual(g.ext.numeri().passi, 0);
  const comando = { command: "ls" };
  await g.pi.emetti("tool_result", { toolName: "bash", input: comando, content: T(10) });
  await g.pi.emetti("tool_result", { toolName: "read", input: { path: "/a" }, content: T(10) });
  assert.equal(g.fermate.length, 1, "non deve fermare al primo passo del turno nuovo");
});

console.log("\ncontrollo-turno — robustezza");
await provaAsync("un evento senza content non lancia e non modifica niente", async () => {
  const z = nuova();
  const r = await z.pi.emetti("tool_result", {});
  assert.equal(r[0], undefined);
});
await provaAsync("un onFerma che lancia non propaga l'errore al turno", async () => {
  const h = nuova({
    guardia: { maxPassiSenzaProgresso: 2, maxRipetizioni: 2, maxPassiAssoluti: 999 },
    onFerma: () => {
      throw new Error("boom");
    },
  });
  const cmd = { command: "x" };
  await h.pi.emetti("tool_result", { toolName: "bash", input: cmd, content: T(10) });
  await h.pi.emetti("tool_result", { toolName: "bash", input: cmd, content: T(10) });
  await h.pi.emetti("tool_result", { toolName: "read", input: { path: "/q" }, content: T(10) });
  assert.ok(log.some((m) => /onFerma ha fallito/.test(m)), "l'errore va solo loggato");
});
await provaAsync("content con cicli o tipi strani non fa esplodere l'estensione", async () => {
  const z = nuova();
  const strano = [{ type: "text", text: "ok" }, { type: "image" }, null, 42];
  const r = await z.pi.emetti("tool_result", { toolName: "read", input: { path: "/a" }, content: strano });
  assert.equal(r[0], undefined);
});

console.log("\n────────────────────────────────────────");
console.log(`  ${passati} prove superate, ${falliti.length} fallite`);
if (falliti.length) {
  for (const f of falliti) console.error(`\n✘ ${f.nome}\n${f.err.stack}`);
  process.exit(1);
}
console.log("  ✓ media/controllo-turno.mjs è coerente con i suoi test");
