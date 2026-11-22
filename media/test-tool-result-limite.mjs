/**
 * Test del limite ai risultati dei tool (`media/tool-result-limite.mjs`).
 *
 * Il taglio deve essere: (a) conservativo — sotto la soglia non tocca niente e restituisce lo
 * stesso riferimento; (b) onesto — dice quanto ha tolto e come rileggere; (c) idempotente — un
 * secondo passaggio non riduce di nuovo; (d) non distruttivo per le parti non testuali.
 *
 * Uso: node media/test-tool-result-limite.mjs
 */
import assert from "node:assert/strict";
import { limitaContenuto, MARCATORE, MAX_CHAR_DEFAULT } from "./tool-result-limite.mjs";

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

const testo = (n) => [{ type: "text", text: "a".repeat(n) }];

console.log("tool-result-limite — sotto soglia non si tocca niente");
prova("risultato piccolo: invariato e stesso riferimento", () => {
  const c = testo(1000);
  const r = limitaContenuto(c);
  assert.equal(r.ridotto, false);
  assert.equal(r.content, c, "deve restituire lo stesso array, non una copia");
});
prova("esattamente alla soglia: invariato", () => {
  const r = limitaContenuto(testo(MAX_CHAR_DEFAULT));
  assert.equal(r.ridotto, false);
});
prova("content non array o vuoto: invariato senza lanciare", () => {
  assert.equal(limitaContenuto(null).ridotto, false);
  assert.equal(limitaContenuto([]).ridotto, false);
  assert.equal(limitaContenuto([{ type: "image", data: "xxx" }]).ridotto, false);
});

console.log("\ntool-result-limite — sopra soglia si taglia e lo si dichiara");
const grande = testo(80000);
const rid = limitaContenuto(grande);
prova("un risultato da 80.000 caratteri viene ridotto", () => {
  assert.equal(rid.ridotto, true);
  assert.ok(rid.dopo < rid.prima);
  assert.equal(rid.tolto, rid.prima - rid.dopo);
});
prova("il testo ridotto sta sotto la soglia (nota compresa)", () => {
  assert.ok(rid.content[0].text.length <= MAX_CHAR_DEFAULT, `lunghezza ${rid.content[0].text.length}`);
});
prova("contiene il marcatore con il conteggio e la via per rileggere", () => {
  const t = rid.content[0].text;
  assert.ok(t.includes(MARCATORE));
  assert.match(t, /80000 caratteri/);
  assert.match(t, /read/);
  assert.match(t, /grep/);
});
prova("conserva l'inizio e la fine del risultato (non un taglio cieco)", () => {
  const c = [{ type: "text", text: "INIZIO" + "m".repeat(80000) + "FINE" }];
  const r = limitaContenuto(c);
  const t = r.content[0].text;
  assert.ok(t.startsWith("INIZIO"));
  assert.ok(t.endsWith("FINE"));
});

console.log("\ntool-result-limite — idempotenza e altre parti");
prova("applicarlo due volte non riduce di nuovo", () => {
  const r2 = limitaContenuto(rid.content);
  assert.equal(r2.ridotto, false);
  assert.equal(r2.content, rid.content);
});
prova("un'immagine accanto al testo resta al suo posto", () => {
  const c = [{ type: "text", text: "b".repeat(60000) }, { type: "image", data: "base64..." }];
  const r = limitaContenuto(c);
  assert.equal(r.ridotto, true);
  const img = r.content.find((p) => p.type === "image");
  assert.ok(img, "l'immagine deve sopravvivere al taglio");
  assert.equal(img.data, "base64...");
});
prova("più blocchi di testo vengono fusi e tagliati insieme", () => {
  const c = [{ type: "text", text: "x".repeat(30000) }, { type: "text", text: "y".repeat(30000) }];
  const r = limitaContenuto(c);
  assert.equal(r.ridotto, true);
  assert.equal(r.prima, 60000);
  assert.ok(r.content[0].text.length <= MAX_CHAR_DEFAULT);
});

console.log("\ntool-result-limite — tetto piccolo (10.000, default dal 2026-11-22)");
prova("con tetto 10.000 il testo ridotto sta DENTRO il tetto (nota compresa)", () => {
  const r = limitaContenuto(testo(80000), { maxChar: 10000 });
  assert.equal(r.ridotto, true);
  assert.ok(
    r.content[0].text.length <= 10000,
    `il risultato ridotto non deve superare il tetto: ${r.content[0].text.length}`,
  );
});
prova("con tetto 10.000 conserva inizio, fine e la via per rileggere", () => {
  const r = limitaContenuto([{ type: "text", text: "INIZIO" + "m".repeat(80000) + "FINE" }], { maxChar: 10000 });
  const t = r.content[0].text;
  assert.ok(t.startsWith("INIZIO"));
  assert.ok(t.endsWith("FINE"));
  assert.ok(t.includes(MARCATORE));
  assert.match(t, /read/);
});
prova("sotto i 10.000 caratteri non si taglia niente", () => {
  const c = testo(9500);
  const r = limitaContenuto(c, { maxChar: 10000 });
  assert.equal(r.ridotto, false);
  assert.equal(r.content, c);
});
prova("con tetto 25.000 il comportamento storico è identico (testa 7000 + coda 5000)", () => {
  const r = limitaContenuto([{ type: "text", text: "A".repeat(10000) + "C".repeat(70000) + "B".repeat(10000) }], { maxChar: 25000 });
  const t = r.content[0].text;
  assert.ok(t.slice(0, 7000).startsWith("A"), "la testa resta 7000");
  assert.ok(t.endsWith("B".repeat(5000)), "la coda resta 5000");
});
prova("parametri espliciti rispettati quando ci stanno nel tetto", () => {
  const r = limitaContenuto(testo(80000), { maxChar: 25000, testa: 8000, coda: 6000 });
  assert.ok(r.content[0].text.length <= 25000);
  assert.ok(r.content[0].text.startsWith("a".repeat(100)), "la testa richiesta è rispettata");
});

console.log("\n────────────────────────────────────────");
console.log(`  ${passati} prove superate, ${falliti.length} fallite`);
if (falliti.length) {
  for (const f of falliti) console.error(`\n✘ ${f.nome}\n${f.err.stack}`);
  process.exit(1);
}
console.log("  ✓ media/tool-result-limite.mjs è coerente con i suoi test");
