#!/usr/bin/env node
/**
 * Test OFFLINE dell'integrazione Google: le regole che, se sbagliate, rompono il selettore o
 * fanno spendere denaro. Nessuna rete: le chiamate vere sono provate a mano (docs/PROVIDER-GOOGLE.md).
 *
 * Cosa deve restare vero:
 *  - un modello di immagine/TTS/live NON deve comparire nel selettore di chat;
 *  - il provider che sta lavorando deve venire per primo;
 *  - il default immagine è il più economico;
 *  - le forme comode (`boolean`) diventano `noul` con `true_description`, come vuole Google;
 *  - un prompt con accenti o simboli produce un nome file valido e una sola riga di didascalia.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMATI_IMMAGINE,
  MODELLI_IMMAGINE,
  MODELLO_IMMAGINE_DEFAULT,
  etichettaModello,
  isChatModel,
  modelloImmagine,
  ordinaModelli,
  stimaCostoImmagine,
  configGoogle,
} from "./providers.mjs";
import { perGoogle, costruisciInput } from "./gemini-decision-tool.mjs";
import { estensionePer, mimeImmagine, slug } from "./immagini.mjs";

test("il selettore di chat esclude i modelli che non conversano", () => {
  assert.equal(isChatModel({ id: "gemini-3.8-flash" }), true);
  assert.equal(isChatModel({ id: "deepseek-flash" }), true);
  assert.equal(isChatModel({ id: "gemma-4-31b-it" }), true);
  assert.equal(isChatModel({ id: "gemini-3.1-flash-lite-image" }), false);
  assert.equal(isChatModel({ id: "gemini-3.8-flash-tts" }), false);
  assert.equal(isChatModel({ id: "gemini-3.8-live" }), false);
  assert.equal(isChatModel({ id: "gemini-embedding-2" }), false);
  assert.equal(isChatModel({ id: "gemini-2.5-computer-use-preview-10-2025" }), false);
  assert.equal(isChatModel({ id: "deep-research-preview-04-2026" }), false);
  assert.equal(isChatModel({ id: "gemini-3.1-pro-preview-customtools" }), false);
  // un modello con type dichiarato non-chat resta fuori anche se il nome non lo dice
  assert.equal(isChatModel({ id: "qualcosa", type: "image" }), false);
});

test("il provider attivo viene per primo, poi i consigliati", () => {
  const lista = [
    { id: "gemini-2.5-pro", provider: "google" },
    { id: "deepseek-flash", provider: "deepseek" },
    { id: "gemini-3.8-flash", provider: "google" },
  ];
  const google = ordinaModelli(lista, "google").map((m) => m.id);
  assert.deepEqual(google, ["gemini-3.8-flash", "gemini-2.5-pro", "deepseek-flash"]);
  const deep = ordinaModelli(lista, "deepseek").map((m) => m.id);
  assert.deepEqual(deep, ["deepseek-flash", "gemini-3.8-flash", "gemini-2.5-pro"]);
});

test("l'etichetta è il nome commerciale, non l'id", () => {
  assert.equal(etichettaModello({ id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" }), "Gemini 3.8 Flash");
  assert.equal(etichettaModello({ id: "strano" }), "strano");
});

test("il default immagine è il più economico del catalogo", () => {
  assert.equal(MODELLO_IMMAGINE_DEFAULT, MODELLI_IMMAGINE[0].id);
  const prezzi = MODELLI_IMMAGINE.map((m) => m.costo_usd).filter((x) => x != null);
  assert.equal(Math.min(...prezzi), MODELLI_IMMAGINE[0].costo_usd);
  assert.ok(modelloImmagine(MODELLO_IMMAGINE_DEFAULT));
  // il Lite non offre 2K/4K: la UI deve leggere le dimensioni dal catalogo, non indovinarle
  assert.deepEqual(modelloImmagine("gemini-3.1-flash-lite-image").dimensioni, ["1K"]);
  assert.ok(FORMATI_IMMAGINE.includes("16:9"));
});

test("la stima di costo è una moltiplicazione onesta", () => {
  assert.equal(stimaCostoImmagine("gemini-3.1-flash-lite-image"), 0.0336);
  assert.equal(stimaCostoImmagine("gemini-3.1-flash-lite-image", 2), 0.0672);
  assert.equal(stimaCostoImmagine("modello-inesistente"), null);
});

test("il riferimento alla chiave non è una chiave", () => {
  const cfg = configGoogle();
  assert.equal(cfg.apiKey, "$GEMINI_API_KEY");
  assert.ok(!/^[A-Za-z0-9._-]{30,}$/.test(cfg.apiKey));
});

test("boolean -> noul con true_description/false_description", () => {
  const q = perGoogle({
    a: { type: "noul", instructions: "è rotto?", criteria: { true: "parla di danno", false: "altro" } },
    b: { type: "noul", instructions: "senza criteri" },
    c: { type: "choice", instructions: "chi?", criteria: { x: "uno", y: "due" } },
    d: { type: "score", instructions: "quanto?", criteria: ["basso", "alto"] },
  });
  assert.deepEqual(q.a.criteria, { true_description: "parla di danno", false_description: "altro" });
  assert.equal(q.b.criteria, undefined);
  assert.deepEqual(q.c.criteria, { x: "uno", y: "due" });
  assert.deepEqual(q.d.criteria, ["basso", "alto"]);
});

test("l'input condiviso diventa testo se è solo testo", () => {
  assert.equal(costruisciInput("ciao", [], "/root"), "ciao");
  assert.deepEqual(costruisciInput({ a: 1 }, [], "/root"), JSON.stringify({ a: 1 }, null, 2));
  assert.throws(() => costruisciInput("", [], "/root"), /state/);
});

test("il nome del file è leggibile e il blocco img resta su una riga", () => {
  assert.equal(slug("Un cerchio ROSSO su fondo bianco!"), "un-cerchio-rosso-su-fondo-bianco");
  assert.equal(slug("   ...   "), "immagine");
  assert.ok(slug("à".repeat(200)).length <= 48);
  const didascalia = "prima riga\nseconda riga".replace(/\s+/g, " ");
  assert.equal(didascalia, "prima riga seconda riga");
});

test("il formato si riconosce dai byte, non dall'estensione", () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(mimeImmagine(png), "image/png");
  assert.equal(mimeImmagine(jpg), "image/jpeg");
  assert.equal(mimeImmagine(Buffer.from("non è un'immagine")), null);
  assert.equal(estensionePer("image/jpeg"), ".jpg");
  assert.equal(estensionePer("sconosciuto"), ".png");
});
