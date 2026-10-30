/**
 * Test del bilancio del contesto, dello spreco di cache e delle classi di errore.
 *
 * Sono test PURi: non avviano la dashboard, non chiamano il modello, non toccano il disco.
 * Girano in ~50 ms e sono il motivo per cui `media/contesto.mjs` esiste separato da
 * dashboard.mjs: la logica che si vuole verificare non deve stare dentro un monolite che
 * parte solo con un server e un modello.
 *
 * Uso: node media/test-contesto.mjs
 */
import assert from "node:assert/strict";
import { stimaToken, bilancioContesto, sprecoCache, classeErrore, impronta, TOKEN_PER_IMMAGINE } from "./contesto.mjs";

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

console.log("contesto.mjs — stima dei token");
prova("stringa vuota e valori non testuali valgono 0", () => {
  assert.equal(stimaToken(""), 0);
  assert.equal(stimaToken(null), 0);
  assert.equal(stimaToken(undefined), 0);
  assert.equal(stimaToken(42), 0);
});
prova("3600 caratteri ≈ 1000 token", () => {
  assert.equal(stimaToken("a".repeat(3600)), 1000);
});

console.log("\ncontesto.mjs — bilancio del contesto");
const messaggi = [
  { role: "user", content: "a".repeat(360) },
  { role: "assistant", content: [{ type: "text", text: "b".repeat(720) }, { type: "thinking", thinking: "c".repeat(180) }] },
  { role: "toolResult", content: [{ type: "tool_result", content: "d".repeat(3600) }] },
  { role: "user", content: [{ type: "text", text: "e".repeat(720) }, { type: "image" }] },
];

prova("separa conversazione, ragionamento, risultati e immagini", () => {
  const b = bilancioContesto({ messaggi, finestra: 100000 });
  const per = Object.fromEntries(b.sezioni.map((s) => [s.nome, s.token]));
  assert.equal(per["conversazione"], 500, "360+720+720 caratteri = 1800 / 3.6");
  assert.equal(per["ragionamento"], 50, "180 caratteri = 50 token");
  assert.equal(per["risultati dei tool"], 1000, "3600 caratteri = 1000 token");
  assert.equal(per["immagini"], TOKEN_PER_IMMAGINE);
  assert.equal(b.totale, 500 + 50 + 1000 + TOKEN_PER_IMMAGINE);
  assert.equal(b.messaggi, 4);
});
prova("il prefisso fisso entra nel totale e la percentuale è calcolata sulla finestra", () => {
  const b = bilancioContesto({ messaggi: [], fissi: [{ nome: "istruzioni e skill", caratteri: 3600 }], finestra: 10000 });
  assert.equal(b.sezioni[0].nome, "istruzioni e skill");
  assert.equal(b.totale, 1000);
  assert.equal(b.percento, 10);
});
prova("senza finestra la percentuale è null, non zero (un dato mancante non è un dato)", () => {
  assert.equal(bilancioContesto({ messaggi, finestra: 0 }).percento, null);
});
prova("un content sconosciuto non fa esplodere il bilancio", () => {
  const b = bilancioContesto({ messaggi: [{ role: "user", content: { strano: true } }, { role: "x", content: 42 }] });
  assert.ok(b.totale >= 0);
  assert.equal(b.messaggi, 2);
});

console.log("\ncontesto.mjs — spreco di prompt-cache");
prova("il primo turno non è uno spreco", () => {
  const s = sprecoCache([{ promptTokens: 10000, cacheRead: 0 }], 0.00000027);
  assert.equal(s.missedTokens, 0);
  assert.equal(s.missCount, 0);
});
prova("prefisso identico e tutto in cache = zero spreco", () => {
  const s = sprecoCache([
    { promptTokens: 10000, cacheRead: 9000 },
    { promptTokens: 10200, cacheRead: 10000 },
  ], 0.000001);
  assert.equal(s.missedTokens, 0);
});
prova("prefisso ricostruito (cacheRead 0) = spreco misurato e costato", () => {
  const s = sprecoCache([
    { promptTokens: 10000, cacheRead: 9000 },
    { promptTokens: 10100, cacheRead: 0 },
    { promptTokens: 10200, cacheRead: 9500 },
  ], 0.000001);
  assert.ok(s.missedTokens > 9000, `atteso > 9000, trovato ${s.missedTokens}`);
  // due turni sprecano: quello a cacheRead 0 e quello dopo, che ritrova 600 token non in cache
  assert.equal(s.missCount, 2);
  assert.ok(s.missedCost > 0);
});
prova("il rumore sotto i 200 token non viene contato come difetto", () => {
  const s = sprecoCache([
    { promptTokens: 10000, cacheRead: 5000 },
    { promptTokens: 10050, cacheRead: 9900 },
  ], 0.000001);
  assert.equal(s.missCount, 0);
});
prova("hit rate complessivo calcolato sul totale dei prompt", () => {
  const s = sprecoCache([
    { promptTokens: 1000, cacheRead: 0 },
    { promptTokens: 1000, cacheRead: 500 },
  ], 0.000001);
  assert.equal(s.hitRate, 0.25);
});

console.log("\ncontesto.mjs — classe di un errore");
const casiErrore = [
  [{ toolName: "bash", testo: "connect ECONNREFUSED 127.0.0.1:8018" }, "rete"],
  [{ toolName: "fetch_content", testo: "request timed out after 30s" }, "timeout"],
  [{ toolName: "write", testo: "EACCES: permission denied, open '/etc/x'" }, "permesso"],
  [{ toolName: "timestral_forecast", testo: "il servizio non è in ascolto su 8018" }, "servizio-giu"],
  [{ toolName: "x", testo: "invalid json: Unexpected token } in JSON" }, "schema"],
  [{ toolName: "read", testo: "ENOENT: no such file or directory" }, "non-trovato"],
  [{ toolName: "timestral_forecast", testo: "missing required argument series" }, "argomenti"],
  [{ toolName: "bash", testo: "operazione annullata" }, "interrotto"],
  [{ toolName: "bash", testo: "qualcosa di mai visto" }, "sconosciuta"],
  [{ toolName: "", testo: "" }, "nessuna"],
];
for (const [input, atteso] of casiErrore) {
  prova(`«${String(input.testo || "(vuoto)").slice(0, 42)}» → ${atteso}`, () => {
    const r = classeErrore(input);
    assert.equal(r.classe, atteso);
    if (atteso !== "nessuna") assert.ok(r.suggerimento.length > 10, "ogni classe deve portare una reazione");
  });
}

console.log("\ncontesto.mjs — impronta del prefisso");
prova("stessa stringa → stessa impronta", () => {
  assert.equal(impronta("prefisso stabile"), impronta("prefisso stabile"));
});
prova("un carattere diverso → impronta diversa (è il senso del test)", () => {
  assert.notEqual(impronta("prefisso stabile"), impronta("prefisso stabile."));
});

console.log("\n────────────────────────────────────────");
console.log(`  ${passati} prove superate, ${falliti.length} fallite`);
if (falliti.length) {
  for (const f of falliti) console.error(`\n✘ ${f.nome}\n${f.err.stack}`);
  process.exit(1);
}
console.log("  ✓ media/contesto.mjs è coerente con i suoi test");
