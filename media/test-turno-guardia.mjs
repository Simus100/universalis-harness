/**
 * Test della guardia anti-loop (`media/turno-guardia.mjs`).
 *
 * Nessun server, nessun modello, nessun disco: la guardia è logica pura, e le sue soglie
 * sbagliano in due modi opposti — troppo bassa taglia il lavoro legittimo (un audit di sola
 * lettura fa 20 passi senza scrivere), troppo alta non serve a niente. I casi qui sotto
 * bloccano entrambi gli errori.
 *
 * Uso: node media/test-turno-guardia.mjs
 */
import assert from "node:assert/strict";
import { creaGuardia, chiave } from "./turno-guardia.mjs";

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

console.log("turno-guardia — chiave di una chiamata");
prova("stesso tool e stessi argomenti in ordine diverso → stessa chiave", () => {
  assert.equal(chiave("bash", { command: "ls", cwd: "/tmp" }), chiave("bash", { cwd: "/tmp", command: "ls" }));
});
prova("argomenti diversi → chiavi diverse", () => {
  assert.notEqual(chiave("bash", { command: "ls" }), chiave("bash", { command: "ls -la" }));
});
prova("input enorme non gonfia la chiave", () => {
  const grande = chiave("write", { path: "/tmp/a", content: "x".repeat(100000) });
  assert.ok(grande.length < 500, `chiave lunga ${grande.length}`);
});

console.log("\nturno-guardia — lavoro legittimo non viene fermato");
prova("20 letture diverse senza scrivere: non ferma", () => {
  const g = creaGuardia();
  let fermato = false;
  for (let i = 0; i < 20; i++) fermato = g.osserva({ toolName: "read", input: { path: `/tmp/f${i}.txt` } }).ferma || fermato;
  assert.equal(fermato, false);
});
prova("18 passi senza scrittura MA nessuna ripetizione: non ferma", () => {
  const g = creaGuardia();
  let fermato = false;
  for (let i = 0; i < 18; i++) {
    fermato = g.osserva({ toolName: "bash", input: { command: `grep -n "pat${i}" file.mjs` } }).ferma || fermato;
  }
  assert.equal(fermato, false);
});
prova("una scrittura riporta a zero i passi senza progresso", () => {
  const g = creaGuardia();
  for (let i = 0; i < 14; i++) g.osserva({ toolName: "read", input: { path: `/tmp/f${i}` } });
  g.osserva({ toolName: "write", input: { path: "/tmp/out.md", content: "x" } });
  let fermato = false;
  for (let i = 0; i < 14; i++) fermato = g.osserva({ toolName: "read", input: { path: `/tmp/g${i}` } }).ferma || fermato;
  assert.equal(fermato, false, "dopo la scrittura servono di nuovo 15 passi");
});

console.log("\nturno-guardia — il loop viene fermato");
prova("15 passi senza scrivere e un comando ripetuto 3 volte → ferma", () => {
  const g = creaGuardia();
  const stesso = { toolName: "bash", input: { command: "node -e 'console.log(1)'" } };
  g.osserva(stesso);
  g.osserva(stesso);
  g.osserva(stesso);
  let esito = null;
  for (let i = 4; i <= 15; i++) esito = g.osserva({ toolName: "read", input: { path: `/tmp/f${i}` } });
  assert.equal(esito.ferma, true);
  assert.match(esito.motivo, /nessun progresso/);
  assert.match(esito.motivo, /15 chiamate/);
});
prova("la ripetizione conta anche se le altre chiamate sono diverse (15 passi, comando x3 all'inizio)", () => {
  const g = creaGuardia({ maxPassiSenzaProgresso: 6, maxRipetizioni: 3 });
  for (let i = 0; i < 3; i++) g.osserva({ toolName: "bash", input: { command: "npm test" } });
  let esito = null;
  for (let i = 0; i < 3; i++) esito = g.osserva({ toolName: "read", input: { path: `/tmp/z${i}` } });
  assert.equal(esito.ferma, true);
});
prova("tetto assoluto: ferma anche se scrive sempre", () => {
  const g = creaGuardia({ maxPassiAssoluti: 10 });
  let esito = null;
  for (let i = 0; i < 10; i++) esito = g.osserva({ toolName: "write", input: { path: `/tmp/f${i}`, content: String(i) } });
  assert.equal(esito.ferma, true);
  assert.match(esito.motivo, /tetto assoluto/);
});
prova("il motivo dice cosa è successo (serve all'utente, non al log)", () => {
  const g = creaGuardia({ maxPassiSenzaProgresso: 4, maxRipetizioni: 2, maxPassiAssoluti: 999 });
  g.osserva({ toolName: "bash", input: { command: "ls" } });
  g.osserva({ toolName: "bash", input: { command: "ls" } });
  const e = g.osserva({ toolName: "read", input: { path: "/tmp/a" } });
  const quarto = g.osserva({ toolName: "read", input: { path: "/tmp/b" } });
  assert.equal(e.ferma, false, "al 3° passo non è ancora oltre la soglia (4)");
  assert.equal(quarto.ferma, true, "al 4° passo la soglia è raggiunta");
  assert.match(quarto.motivo, /4 chiamate consecutive senza scrivere/);
});

console.log("\nturno-guardia — azzeramento fra turni");
prova("azzera() riporta tutto a zero (un turno nuovo non eredita il conteggio)", () => {
  const g = creaGuardia({ maxPassiSenzaProgresso: 3, maxRipetizioni: 2, maxPassiAssoluti: 999 });
  g.osserva({ toolName: "bash", input: { command: "ls" } });
  g.osserva({ toolName: "bash", input: { command: "ls" } });
  g.osserva({ toolName: "read", input: { path: "/a" } });
  g.osserva({ toolName: "read", input: { path: "/b" } });
  g.azzera();
  const e = g.osserva({ toolName: "read", input: { path: "/a" } });
  assert.equal(e.ferma, false);
  assert.deepEqual(g.stato(), { passi: 1, senzaProgresso: 1, ripetizioni: 1 });
});
prova("osserva() senza argomenti non lancia", () => {
  const g = creaGuardia();
  assert.equal(g.osserva().ferma, false);
});

console.log("\n────────────────────────────────────────");
console.log(`  ${passati} prove superate, ${falliti.length} fallite`);
if (falliti.length) {
  for (const f of falliti) console.error(`\n✘ ${f.nome}\n${f.err.stack}`);
  process.exit(1);
}
console.log("  ✓ media/turno-guardia.mjs è coerente con i suoi test");
