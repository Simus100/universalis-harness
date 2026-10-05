/**
 * Test della memoria a lungo termine.
 *
 * Due livelli, perché i guasti sono di due tipi diversi:
 *   - UNITÀ: le funzioni che sbagliano in modo silenzioso (la potatura che sfora il budget, il
 *     front-matter che si corrompe su una virgoletta, il chunking che perde un pezzo di testo).
 *   - SISTEMA: gli stessi pezzi sul corpus vero, più le rotte della dashboard. Un motore che
 *     funziona su un corpus finto e rompe su quello reale non è un motore testato.
 *
 * E una prova che non è tecnica ma di sicurezza: nell'indice non deve esserci NESSUN file che
 * corrisponda ai pattern riservati (.env, secret, sessioni, backup). Se un giorno qualcuno
 * cambia le sorgenti, questo test lo blocca prima che i dati personali finiscano in un indice
 * che qualcuno potrebbe pubblicare.
 *
 * Uso:  node media/test-memoria.mjs [--solo-sistema] [--lento]
 */
import { join } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { mkdir, rm } from "node:fs/promises";
import { normalizza, tokenizza, slug, stimaToken, potare, CHAR_PER_TOKEN } from "./memoria/memoria-core.mjs";
import { spezza, cerca, cercaBM25, diagnosi, pacchetto, statoMemoria, caricaIndice, indiceDaAggiornare, chunksDiEpisodio, sintesiCodice, tipoDiAmbito } from "./memoria/memoria-index.mjs";
import { buildGrafo, graphQuery, schedaNodo, caricaGrafo, datiVista } from "./memoria/memoria-graph.mjs";
import { buildWiki, leggiWiki, linkRotti } from "./memoria/memoria-wiki.mjs";
import { componiEpisodio, parseFrontmatter, serializzaFrontmatter, leggiSessione, elencaEpisodi, percorsoEpisodio } from "./memoria/memoria-episodio.mjs";
import { ricostruisci } from "./memoria/memoria-build.mjs";

const argv = process.argv.slice(2);
const soloSistema = argv.includes("--solo-sistema");

let passati = 0;
let falliti = 0;
const fallimenti = [];

async function prova(nome, fn) {
  try {
    const risultato = await fn();
    if (risultato === false) throw new Error("ha restituito false");
    passati++;
    console.log(`  ✓ ${nome}${typeof risultato === "string" ? ` — ${risultato}` : ""}`);
  } catch (e) {
    falliti++;
    fallimenti.push(`${nome}: ${e?.message || e}`);
    console.log(`  ✗ ${nome}`);
    console.log(`      ${e?.message || e}`);
  }
}

function assert(condizione, messaggio) {
  if (!condizione) throw new Error(messaggio || "condizione falsa");
}

// ---------------------------------------------------------------- unità

if (!soloSistema) {
  console.log("\n[unità] testo e misure");

  await prova("normalizza toglie accenti e maiuscole", () => {
    assert(normalizza("Analisí ÀÈÌ") === "analisi aei", normalizza("Analisí ÀÈÌ"));
  });

  await prova("tokenizza scarta stopword e parole corte", () => {
    const t = tokenizza("il come memoria a di 12 dashboard.mjs");
    assert(!t.includes("come") && !t.includes("il") && !t.includes("di"), JSON.stringify(t));
    assert(t.includes("memoria") && t.includes("dashboard") && t.includes("mjs"), JSON.stringify(t));
  });

  await prova("slug è stabile e usabile come nome file", () => {
    assert(slug("Memoria a lungo termine!") === "memoria-a-lungo-termine", slug("Memoria a lungo termine!"));
    assert(!slug("..//..//").includes("/"), "slash nel nome file");
  });

  await prova("stimaToken è coerente con ~4 caratteri per token", () => {
    assert(stimaToken("abcd".repeat(100)) === 100, String(stimaToken("abcd".repeat(100))));
    assert(stimaToken("") >= 1, "stringa vuota deve valere almeno 1");
    assert(CHAR_PER_TOKEN === 4);
  });

  console.log("\n[unità] chunking (le due soglie che decidono la qualità del recupero)");

  await prova("spezza divide per titolo markdown", () => {
    const pezzi = spezza("# Titolo\n\n" + "testo primo paragrafo ".repeat(6) + "\n\n## Secondo\n\n" + "altro testo qui ".repeat(8));
    assert(pezzi.length >= 2, `attesi 2+ frammenti, trovati ${pezzi.length}`);
    assert(pezzi.some((p) => p.titolo === "Secondo"), "titolo non conservato: " + JSON.stringify(pezzi.map((p) => p.titolo)));
  });

  await prova("spezza non produce frammenti sopra il tetto di 1800 caratteri", () => {
    const lungo = "parola ".repeat(2000); // ~14.000 caratteri senza titoli
    const pezzi = spezza(lungo);
    const massimo = Math.max(...pezzi.map((p) => p.testo.length));
    assert(massimo <= 1800, `frammento di ${massimo} caratteri`);
    assert(pezzi.length > 5, `attesi più frammenti, trovati ${pezzi.length}`);
  });

  await prova("spezza non perde testo (la somma dei frammenti copre l'originale)", () => {
    const testo = "# A\n\n" + "alfa ".repeat(40) + "\n\n## B\n\n" + "beta ".repeat(40);
    const pezzi = spezza(testo);
    const uniti = pezzi.map((p) => p.testo).join("\n");
    for (const parola of ["alfa", "beta"]) assert(uniti.includes(parola), `perso «${parola}»`);
    const lettereOriginali = testo.replace(/\s/g, "").length;
    const letterePezzi = uniti.replace(/\s/g, "").length;
    assert(letterePezzi >= lettereOriginali * 0.95, `perso troppo testo: ${letterePezzi} su ${lettereOriginali}`);
  });

  await prova("spezza ignora il front-matter (è metadato, non contenuto)", () => {
    const pezzi = spezza('---\ntitolo: "x"\nchiave: valore\n---\n\n' + "contenuto vero ".repeat(8));
    assert(!pezzi.some((p) => p.testo.includes("chiave:")), "il front-matter è finito nei frammenti");
  });

  console.log("\n[unità] BM25 e diagnosi di confidenza");

  const indiceFinto = (() => {
    // `ambito` non è decorazione: la diagnosi lo usa per dire se la risposta è un fatto
    // registrato o un manuale. Questi tre frammenti sono di memoria (episodi/artefatti).
    const testi = [
      { file: "a.md", ambito: "media", titolo: "indice bm25", testo: "indice bm25 frammenti ricerca lessicale pesi inversi documenti frequenza" },
      { file: "b.md", ambito: "media", titolo: "atlante", testo: "atlante grafo proiezione prospettica canvas determinismo" },
      { file: "c.md", ambito: "episodio", titolo: "episodi", testo: "episodio decisione motivazione registrazione memoria" },
    ];
    const frammenti = testi.map((t, i) => ({ id: i, file: t.file, ambito: t.ambito, titolo: t.titolo, testo: t.testo, n_token: 20, n_token_bm25: tokenizza(t.titolo + " " + t.testo).length }));
    const df = new Map();
    const postings = new Map();
    for (const f of frammenti) {
      const tf = new Map();
      for (const t of tokenizza(f.titolo + " " + f.testo)) tf.set(t, (tf.get(t) || 0) + 1);
      for (const [t, n] of tf) {
        if (!postings.has(t)) postings.set(t, []);
        postings.get(t).push([f.id, n]);
        df.set(t, (df.get(t) || 0) + 1);
      }
    }
    const idf = {};
    for (const [t, d] of df) idf[t] = Math.log(1 + (frammenti.length - d + 0.5) / (d + 0.5));
    return { parametri: { k1: 1.5, b: 0.75 }, avgdl: 20, frammenti, postings: Object.fromEntries(postings), idf };
  })();

  await prova("BM25 trova il frammento giusto e non gli altri", () => {
    const c = cercaBM25(indiceFinto, "proiezione prospettica", 5);
    assert(c.length === 1, `atteso 1 risultato, trovati ${c.length}`);
    assert(indiceFinto.frammenti[c[0][0]].file === "b.md", indiceFinto.frammenti[c[0][0]].file);
  });

  await prova("la diagnosi dice «nessuna» quando il corpus non ha i termini", () => {
    const d = diagnosi(indiceFinto, "entanglement quantistico", []);
    assert(d.confidenza === "nessuna", d.confidenza);
  });

  await prova("la diagnosi dice «alta» su un match pieno e ben separato", () => {
    // I frammenti di questo corpus finto sono di MEMORIA: con l'ambito di documentazione la
    // confidenza verrebbe (giustamente) abbassata, e questo test non misurerebbe più la
    // separazione. Il caso «solo documentazione» ha una sua prova, più sotto.
    const c = cercaBM25(indiceFinto, "proiezione prospettica canvas", 5);
    const d = diagnosi(indiceFinto, "proiezione prospettica canvas", c);
    assert(d.confidenza === "alta", `${d.confidenza} (copertura ${d.copertura})`);
    assert(d.fonte === "memoria", `fonte ${d.fonte}`);
    assert(typeof d.copertura === "number" && !Number.isNaN(d.copertura), "copertura NaN");
  });

  console.log("\n[unità] budget: la potatura deve valere sul TESTO, non sui pezzi");

  await prova("potare toglie dalla coda finché il testo renderizzato rientra", () => {
    const lista = Array.from({ length: 20 }, (_, i) => ({ testo: "x".repeat(200), i }));
    const usati = [...lista];
    const render = () => usati.map((v) => v.testo).join("\n") + "intestazione";
    const costo = potare(100, render, [{ array: usati, minimo: 1 }]);
    assert(costo <= 100, `costo finale ${costo} > budget 100`);
    assert(usati.length < lista.length, "non ha potato nulla");
    assert(usati[0].i === 0, "ha potato dalla testa invece che dalla coda");
  });

  console.log("\n[unità] front-matter ed episodi");

  await prova("il front-matter sopravvive a virgolette, due punti e a capo", () => {
    const originale = { titolo: 'con "virgolette" e: due punti', nota: "prima\nseconda", lista: ["a/b", 'c"d'], numero: 12, vero: true };
    const { dati } = parseFrontmatter(`---\n${serializzaFrontmatter(originale)}\n---\ncorpo`);
    assert(dati.titolo === originale.titolo, dati.titolo);
    assert(dati.nota === originale.nota, String(dati.nota));
    assert(JSON.stringify(dati.lista) === JSON.stringify(originale.lista), JSON.stringify(dati.lista));
    assert(dati.numero === 12 && dati.vero === true);
  });

  await prova("l'episodio conserva la prosa e i campi scritti dall'agente a ogni riscrittura", () => {
    const dati = { sessione: "abc", inizio: "2026-10-05T10:00:00Z", fine: "2026-10-05T11:00:00Z", richieste: ["fai una cosa"], scritture: new Map([["media/x.mjs", { n: 2, tipi: new Set(["write"]) }]]), letture: new Set(), comandi: ["git status"], strumenti: new Map([["bash", 3]]), compatti: [], modelli: new Set(["deepseek-flash"]) };
    const primo = componiEpisodio(dati);
    assert(primo.includes("media/x.mjs"), "artefatto mancante");
    const annotato = primo.replace("_Nessuna nota scritta dall'agente._", "Nota scritta: resta aperto il sync.");
    const annotato2 = annotato.replace('esito: "aperto"', 'esito: "confermato"').replace("## Note\n", '## Note\ndecisione importante\n');
    const secondo = componiEpisodio(dati, annotato2);
    assert(secondo.includes("resta aperto il sync"), "la nota dell'agente è stata persa");
    assert(secondo.includes('esito: "confermato"'), "l'esito precedente è stato perso");
    assert(secondo.includes("media/x.mjs"), "gli artefatti non si sono rigenerati");
  });

  await prova("percorsoEpisodio è stabile (upsert, non accodamento)", () => {
    const dati = { sessione: "01a10c10-02bc-701b-93b5-48b4cd957675", inizio: "2026-10-05T12:00:00Z", richieste: ["una richiesta"] };
    assert(percorsoEpisodio(dati) === percorsoEpisodio({ ...dati }), "percorso diverso a parità di dati");
    assert(percorsoEpisodio(dati).includes("2026-10-05"), percorsoEpisodio(dati));
  });

  await prova("leggiSessione estrae fatti e ignora i risultati dei tool", async () => {
    const dir = join(tmpdir(), "prova-memoria");
    await mkdir(dir, { recursive: true });
    const f = join(dir, "sessione.jsonl");
    const righe = [
      { type: "session", id: "s1", cwd: "/root/pi-harness", timestamp: "2026-10-05T10:00:00Z" },
      { type: "custom", customType: "obs-turn", data: { cost: 0.01, inputTokens: 100, outputTokens: 50, durationMs: 1000 } },
      { type: "message", timestamp: "2026-10-05T10:01:00Z", message: { role: "user", content: [{ type: "text", text: "sistema  " + "x".repeat(300) }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "write", arguments: { path: "/root/pi-harness/media/y.mjs" } }, { type: "toolCall", name: "read", arguments: { path: "/root/pi-harness/README.md" } }, { type: "toolCall", name: "bash", arguments: { command: "git status\nseconda riga" } }] } },
      { type: "message", message: { role: "toolResult", toolName: "bash", isError: true, content: [{ type: "text", text: "output enorme ".repeat(500) }] } },
    ];
    const { writeFileSync } = await import("node:fs");
    writeFileSync(f, righe.map((r) => JSON.stringify(r)).join("\n"));
    const d = await leggiSessione(f);
    assert(d.richieste.length === 1, String(d.richieste.length));
    assert(d.richieste[0].length <= 200, "richiesta non troncata: " + d.richieste[0].length);
    assert(d.scritture.has("media/y.mjs"), [...d.scritture.keys()].join(","));
    assert(d.letture.has("README.md"), [...d.letture].join(","));
    assert(d.comandi[0] === "git status", d.comandi[0]);
    assert(d.errori === 1, String(d.errori));
    assert(d.costo > 0 && d.token_in === 100, `${d.costo} ${d.token_in}`);
    // Il test che conta: l'output dei tool NON entra nell'episodio.
    assert(!JSON.stringify(d).includes("output enorme"), "l'output dei tool è finito nell'episodio");
    await rm(dir, { recursive: true, force: true });
  });
}

// ---------------------------------------------------------------- sistema (sul corpus vero)

console.log("\n[sistema] indice sul corpus reale");

await prova("l'indice esiste ed è utilizzabile", async () => {
  const indice = await caricaIndice();
  assert(indice, "indice assente: esegui node media/memoria/memoria-build.mjs");
  assert(indice.frammenti.length > 100, `solo ${indice.frammenti.length} frammenti`);
  return `${indice.files.length} file, ${indice.frammenti.length} frammenti`;
});

await prova("nessun file riservato nell'indice (privacy)", async () => {
  const indice = await caricaIndice();
  const vietati = [/(^|\/)\.env/, /secret/i, /\.key$/i, /\.pem$/i, /credential/i, /password/i, /token/i, /^sessions\//, /^backups\//, /^backup_export\//, /node_modules/];
  const colpevoli = indice.files.map((f) => f.rel).filter((rel) => vietati.some((r) => r.test(rel)));
  assert(colpevoli.length === 0, `trovati: ${colpevoli.join(", ")}`);
  return `${indice.files.length} file controllati`;
});

await prova("i file esclusi dal versionamento non entrano nell'indice (una sola dichiarazione)", async () => {
  // Il caso concreto: un documento con dati personali di terzi, tenuto fuori dal repository a
  // mano, era finito nell'indice perché la sorgente comprendeva i .txt di media/. Ora il
  // .gitignore è la regola, con UNA eccezione: media/memoria/ (gli episodi sono la memoria e
  // devono essere indicizzati anche se non si pubblicano).
  const indice = await caricaIndice();
  const rel = indice.files.map((f) => f.rel);
  const personali = rel.filter((r) => /CU2026/.test(r));
  assert(personali.length === 0, `documento con dati personali nell'indice: ${personali.join(", ")}`);
  const esclusi = rel.filter((r) => /(^|\/)tre\.txt$|\.log$|nuovo_file/.test(r));
  assert(esclusi.length === 0, `file escluso dal repo presente nell'indice: ${esclusi.join(", ")}`);
  const episodi = rel.filter((r) => r.startsWith("media/memoria/episodi/"));
  assert(episodi.length > 0, "gli episodi non sono indicizzati: l'eccezione è troppo larga");
  return `${personali.length} documenti personali esclusi, ${episodi.length} episodi inclusi`;
});

await prova("la ricerca risponde in meno di 300 ms", async () => {
  const t0 = Date.now();
  await cerca("memoria grafo atlante", { limite: 5 });
  const ms = Date.now() - t0;
  assert(ms < 300, `${ms} ms`);
  return `${ms} ms`;
});

await prova("la ricerca trova l'episodio giusto per il lavoro di memoria", async () => {
  const r = await cerca("memoria a lungo termine indice bm25", { limite: 6 });
  assert(r.risultati.length > 0, "nessun risultato");
  assert(r.diagnosi.confidenza !== "nessuna", "confidenza nessuna");
  return `${r.risultati.length} risultati, confidenza ${r.diagnosi.confidenza}`;
});

await prova("il pacchetto resta entro il budget dichiarato", async () => {
  for (const budget of [300, 800, 2000]) {
    const p = await pacchetto("decisione memoria indice", { budget });
    assert(p.token_stimati <= budget, `budget ${budget}: ${p.token_stimati} token`);
  }
  return "300 / 800 / 2000 rispettati";
});

await prova("l'indice si invalida su file cambiato, non su orario", async () => {
  // Si ricostruisce e si controlla SUBITO dopo. Nota sul perché non basta un controllo secco:
  // durante una sessione viva la dashboard riscrive l'episodio corrente a ogni turno, quindi
  // l'indice «da aggiornare» può essere la verità, non un difetto. Qui si verifica la proprietà
  // che conta — dopo una build, senza scritture, l'indice è considerato pulito.
  const { buildIndice } = await import("./memoria/memoria-index.mjs");
  await buildIndice({ silenzioso: true });
  const daAggiornare = await indiceDaAggiornare();
  assert(daAggiornare === false, "dopo una ricostruzione l'indice risulta ancora da aggiornare");
  return "pulito subito dopo la build";
});

console.log("\n[sistema] grafo");

await prova("il grafo si costruisce e ha tutti gli strati dichiarati", async () => {
  const esito = await buildGrafo({ silenzioso: true });
  assert(esito.nodi > 10, `solo ${esito.nodi} nodi`);
  assert(esito.statistica.per_strato.episodio > 0, "nessun episodio nel grafo");
  return `${esito.nodi} nodi, ${esito.archi} archi, ${esito.aree} aree`;
});

await prova("ogni arco punta a nodi esistenti (nessun riferimento rotto)", async () => {
  const g = await caricaGrafo();
  assert(g, "grafo assente");
  for (const a of g.archi) {
    assert(g.nodi[a.a] && g.nodi[a.b], `arco ${a.a}→${a.b} fuori intervallo`);
    assert(g.colori[a.r], `relazione sconosciuta: ${a.r}`);
  }
  return `${g.archi.length} archi verificati`;
});

await prova("graphQuery rispetta il budget anche con 3 passi", async () => {
  const r = await graphQuery("memoria", { passi: 3, budget: 400, massimo: 60 });
  assert(r.token_stimati <= 400, `${r.token_stimati} token su 400`);
  assert(r.testo.length > 0, "testo vuoto");
  return `${r.nodi.length} nodi, ${r.token_stimati} token`;
});

await prova("graphQuery restituisce STRUTTURA, non testo dei file", async () => {
  const r = await graphQuery("dashboard", { passi: 2, budget: 500 });
  const righe = r.testo.split("\n").filter((l) => l.startsWith("  ") || l.startsWith("- "));
  assert(righe.length > 3, "nessun nodo elencato");
  // Nessuna riga deve essere un pezzo di contenuto: sono nomi, percorsi e relazioni.
  assert(righe.every((l) => l.length < 160), "una riga sembra contenuto: " + righe.find((l) => l.length >= 160));
  return `${righe.length} righe di struttura`;
});

await prova("la scheda di un nodo esistente si legge, e uno inesistente è dichiarato tale", async () => {
  const g = await caricaGrafo();
  const nodo = g.nodi.find((n) => n.s === "artefatto") || g.nodi[0];
  const s = await schedaNodo(nodo.f || nodo.id);
  assert(s.ok === true, s.testo);
  const manca = await schedaNodo("nodo-che-non-esiste-xyz");
  assert(manca.ok === false, "un nodo inesistente è stato trovato");
  return s.testo.split("\n")[0];
});

console.log("\n[sistema] wiki e vista");

await prova("la wiki si rigenera senza link rotti", async () => {
  const e = await buildWiki({ silenzioso: true });
  assert(e.ok, "wiki non generata");
  const rotti = await linkRotti();
  assert(rotti.length === 0, `${rotti.length} link rotti: ${JSON.stringify(rotti.slice(0, 3))}`);
  return `${e.pagine} pagine`;
});

await prova("l'indice generale della wiki dichiara dove la memoria è cieca", async () => {
  const { readFileSync: leggi } = await import("node:fs");
  const testo = leggi(join("media", "memoria", "wiki", "index.md"), "utf8");
  assert(testo.includes("Dove la memoria è cieca"), "manca la sezione dei buchi");
  assert(/episodi senza decisione/.test(testo), "manca il conteggio delle decisioni");
  return "sezione presente";
});

await prova("leggiWiki trova una pagina per id, per percorso e per parole del titolo", async () => {
  const g = await caricaGrafo();
  const artefatto = g.nodi.find((n) => n.s === "artefatto");
  const perPercorso = await leggiWiki(artefatto.f);
  assert(perPercorso.ok, perPercorso.testo);
  const episodio = g.nodi.find((n) => n.s === "episodio");
  const perTitolo = await leggiWiki(String(episodio.n).split(" ").slice(0, 3).join(" "));
  assert(perTitolo.ok, perTitolo.testo);
  return "3 modalità di ricerca";
});

await prova("datiVista è completo per l'atlante", async () => {
  const v = await datiVista();
  assert(v.esiste, "vista assente");
  for (const campo of ["nodi", "archi", "aree", "strati", "colori", "statistica", "per_area"]) assert(v[campo], `manca ${campo}`);
  assert(v.strati.episodio.ordine === 1, "ordine degli strati incoerente");
  return `${v.nodi.length} nodi pronti per il disegno`;
});

await prova("la scheda di un episodio porta decisione e perché nell'indice", () => {
  // Il difetto che questo test blocca: decisione e perché stanno nel front-matter, che
  // l'indicizzazione scarta — quindi la memoria non ritrovava le proprie decisioni.
  const testo = [
    "---",
    'tipo: "episodio"',
    'titolo: "il grafo non si legge"',
    'data: "2026-10-05"',
    'esito: "confermato"',
    'decisione: "mappa 2D predefinita, orbita come seconda vista"',
    'perche: "in prospettiva due nodi lontani si sovrappongono e le etichette si accavallano"',
    "---",
    "",
    "## Richieste",
    "1. il grafo non è leggibile, servono delle etichette che si leggano e una posizione stabile dei nodi fra un'apertura e l'altra della vista",
    "2. aggiungi anche lo zoom e il trascinamento, perché su mobile non si riesce a esplorare niente così",
  ].join("\n");
  const chunks = chunksDiEpisodio("media/memoria/episodi/x.md", testo);
  const scheda = chunks.find((c) => c.titolo === "Scheda dell'episodio");
  assert(scheda, "manca la scheda dell'episodio");
  assert(scheda.testo.includes("DECISIONE: mappa 2D predefinita"), "la decisione non è nella scheda");
  assert(scheda.testo.includes("PERCHÉ: in prospettiva"), "il perché non è nella scheda");
  assert(chunks.length > 1 && chunks.some((c) => c.titolo === "Richieste"), "il corpo non è stato indicizzato");
  return `${chunks.length} frammenti, scheda con decisione e perché`;
});

await prova("la scheda di codice dice scopo e nomi, senza lo shebang", () => {
  const codice = [
    "#!/usr/bin/env bash",
    "# Pubblica il lavoro della sessione su GitHub.",
    "# Perché esiste: il timer è spento per scelta, la pubblicazione resta manuale.",
    "set -euo pipefail",
    "echo ciao",
  ].join("\n");
  const [scheda] = sintesiCodice("scripts/esempio.sh", codice);
  assert(scheda.testo.includes("Pubblica il lavoro della sessione"), "manca lo scopo dichiarato");
  assert(!scheda.testo.includes("usr/bin/env bash"), "lo shebang è finito nella scheda");

  const modulo = [
    "/**",
    " * Tool browser: pilota Chrome headless con un utente dedicato.",
    " * Decide di rifiutarsi se la sandbox non è adeguata.",
    " */",
    "export function createBrowserTool() {}",
    "export const VERSIONE = 3;",
  ].join("\n");
  const [due] = sintesiCodice("media/browser-tool.mjs", modulo);
  assert(/browser/i.test(due.testo) && due.testo.includes("sandbox"), "lo scopo del modulo non è nella scheda");
  assert(due.testo.includes("createBrowserTool") && due.testo.includes("VERSIONE"), "i nomi esportati non sono nella scheda");
  assert(due.testo.includes("media/browser-tool.mjs"), "la scheda non dice dove sta il file");
  return "scopo, nomi e percorso; shebang escluso";
});

await prova("l'ambito dice se la risposta è memoria o documentazione", () => {
  assert(tipoDiAmbito("episodio") === "memoria" && tipoDiAmbito("codice") === "memoria", "un ambito di memoria è classificato male");
  assert(tipoDiAmbito("skill") === "documentazione" && tipoDiAmbito("harness") === "documentazione", "un ambito di documentazione è classificato male");
  return "4 ambiti di memoria, 2 di documentazione";
});

await prova("solo documentazione = confidenza bassa, e la fonte è dichiarata", () => {
  // Indice finto: un manuale e un episodio che NON parlano della domanda.
  const indice = {
    parametri: { k1: 1.5, b: 0.75 },
    avgdl: 20,
    idf: { ricetta: 1.5, dosi: 1.5, carbonara: 2 },
    postings: { ricetta: [[0, 2]], dosi: [[0, 2]], carbonara: [[0, 2]] },
    frammenti: [
      { id: 0, file: "skills/cucina/SKILL.md", ambito: "skill", titolo: "Ricetta", testo: "ricetta dosi carbonara", n_token_bm25: 20 },
      { id: 1, file: "media/memoria/episodi/x.md", ambito: "episodio", titolo: "Scheda", testo: "altro argomento", n_token_bm25: 20 },
    ],
  };
  const classifica = [[0, 9]];
  const d = diagnosi(indice, "ricetta dosi carbonara", classifica);
  assert(d.fonte === "documentazione", `fonte ${d.fonte}`);
  assert(d.confidenza === "bassa", `confidenza ${d.confidenza}: la documentazione non è una risposta su cosa è successo`);
  assert(/documentazione/i.test(d.motivo), "il motivo non spiega da dove viene");
  return d.motivo.slice(0, 60) + "…";
});

console.log("\n[sistema] ricostruzione e stato");

await prova("la ricostruzione completa non produce errori", async () => {
  const e = await ricostruisci({ silenzioso: true, atlante: true });
  assert(e.errori.length === 0, e.errori.join(" | "));
  assert(e.indice && e.grafo && e.wiki && e.atlante, "un passo non è stato eseguito");
  return `indice ${e.indice.n_frammenti} frammenti · grafo ${e.grafo.nodi} nodi · wiki ${e.wiki.pagine} pagine · atlante ${e.atlante.kb} KB`;
});

await prova("la ricostruzione è incrementale (la seconda non rilegge nulla)", async () => {
  const e = await ricostruisci({ silenzioso: true, passi: { indice: true, grafo: false, wiki: false } });
  assert(e.indice.riletti === 0, `${e.indice.riletti} file riletti`);
  return `${e.indice.riusati} frammenti riusati`;
});

await prova("statoMemoria riporta numeri coerenti con i file su disco", async () => {
  const st = await statoMemoria();
  assert(st.indice && st.indice.frammenti > 0, "indice mancante nello stato");
  const episodi = await elencaEpisodi();
  assert(st.episodi === episodi.length, `stato ${st.episodi} vs file ${episodi.length}`);
  return `${st.episodi} episodi, ${st.indice.file} file indicizzati`;
});

await prova("l'indice contiene le schede del codice e quelle degli episodi", async () => {
  const indice = await caricaIndice();
  assert(indice, "indice assente");
  const codici = indice.frammenti.filter((f) => f.ambito === "codice");
  const schede = indice.frammenti.filter((f) => f.titolo === "Scheda dell'episodio");
  assert(codici.length > 50, `solo ${codici.length} schede di codice: i file di codice non sono indicizzati`);
  assert(schede.length > 20, `solo ${schede.length} schede di episodio`);
  assert(codici.some((f) => f.testo.includes("scopo dichiarato")), "le schede di codice non riportano lo scopo del file");
  return `${codici.length} schede di codice, ${schede.length} schede di episodio su ${indice.n_frammenti} frammenti`;
});

await prova("una decisione registrata si ritrova, e si vede da quale lato arriva", async () => {
  const p = await pacchetto("perché la memoria non si pubblica su git", { budget: 700 });
  assert(p.frammenti.some((f) => f.tipo === "memoria"), `nessun frammento di memoria: ${p.diagnosi.motivo}`);
  assert(p.frammenti.some((f) => f.ambito === "episodio"), "la decisione registrata in un episodio non emerge");
  assert(/\[[a-z]+\]/.test(p.testo), "i frammenti non dichiarano il proprio ambito");
  return `${p.frammenti.length} frammenti · confidenza ${p.diagnosi.confidenza} · fonte ${p.diagnosi.fonte}`;
});

await prova("una domanda fuori dalla memoria non riceve una risposta sicura", async () => {
  // Termini tecnici che nessun documento di questo progetto contiene (il corpus è quello vero).
  // Scelta volutamente lontana: una domanda con parole comuni («ricetta», «dosi») può matchare
  // un documento che le usa in un altro senso, ed è il limite noto del match lessicale — qui si
  // verifica che almeno NON venga dichiarata una confidenza alta.
  const p = await pacchetto("altimetro barometrico per droni agricoli calibrazione", { budget: 500 });
  assert(p.diagnosi.confidenza !== "alta", `confidenza ${p.diagnosi.confidenza} su una domanda fuori dalla memoria`);
  if (p.diagnosi.fonte === "documentazione") {
    assert(p.testo.includes("DOCUMENTAZIONE"), "il pacchetto non avverte che sta consegnando documentazione");
  }
  return `confidenza ${p.diagnosi.confidenza}, fonte ${p.diagnosi.fonte}`;
});

await prova("l'episodio si aggiorna a ogni riscrittura e resta cercabile", async () => {
  const src = readFileSync("media/memoria/memoria-tool.mjs", "utf8");
  // Il difetto: dopo aver annotato una decisione si ricostruivano grafo e wiki ma NON l'indice,
  // quindi la scheda dell'episodio appena scritto non era cercabile fino al turno successivo.
  assert(/passi: \{ grafo: true, wiki: true, indice: true \}/.test(src), "la decisione annotata non entra subito nell'indice");
  return "grafo + wiki + indice aggiornati alla registrazione";
});

await prova("il promemoria della memoria avvisa senza bloccare", async () => {
  const { execFileSync } = await import("node:child_process");
  let uscita = "";
  let stato = 0;
  try {
    uscita = execFileSync("node", ["scripts/memoria-promemoria.mjs", "--json"], { encoding: "utf8", cwd: process.cwd() });
  } catch (e) {
    stato = e.status;
    uscita = String(e.stdout || "");
  }
  const d = JSON.parse(uscita.trim().split("\n").pop());
  assert(d.episodi > 0, "nessun episodio letto");
  assert(typeof d.ha_decisione === "boolean", "manca il verdetto");
  assert((stato === 0) === d.ha_decisione, `uscita ${stato} incoerente con ha_decisione=${d.ha_decisione}`);
  return `${d.con_decisione}/${d.episodi} episodi con decisione (uscita ${stato}, zero = ha la decisione)`;
});

await prova("il file dell'atlante è autonomo (nessuna risorsa esterna)", async () => {
  const f = join("media", "memoria", "atlante.html");
  assert(existsSync(f), "atlante assente");
  const h = readFileSync(f, "utf8");
  for (const vietato of ["<script src=", "http://", "https://cdn", "unpkg", "jsdelivr"]) {
    assert(!h.includes(vietato), `l'atlante carica qualcosa dall'esterno: ${vietato}`);
  }
  assert(h.includes("createAtlante"), "il codice del disegno non è incorporato");
  assert(h.includes('const D = {'), "i dati non sono incorporati");
  return `${Math.round(h.length / 1024)} KB, zero risorse esterne`;
});

// ---------------------------------------------------------------- sistema: integrazione nell'interfaccia

console.log("\n[sistema] vista Memoria nella dashboard (coerenza statica, senza browser)");

await prova("ogni elemento che la vista Memoria usa esiste nel markup", async () => {
  const html = readFileSync("dashboard.html", "utf8");
  const sezione = html.slice(html.indexOf("function caricaMemoria"), html.indexOf("function openInEditor"));
  assert(sezione.length > 2000, "sezione della memoria non trovata in dashboard.html");
  const ids = [...new Set([...sezione.matchAll(/\$\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]))];
  const mancanti = ids.filter((id) => !html.includes(`id="${id}"`));
  assert(mancanti.length === 0, `elementi mancanti nel markup: ${mancanti.join(", ")}`);
  return `${ids.length} elementi verificati`;
});

await prova("la vista è una scheda accanto a Chat e File, con ritorno alla chat", async () => {
  const html = readFileSync("dashboard.html", "utf8");
  assert(html.includes('id="memoriaView"'), "manca il contenitore della vista");
  assert(/\$\("memoriaView"\)\.hidden = name !== "memoria"/.test(html), "showTab non gestisce la vista memoria");
  assert(html.includes('id="tabMemoria"'), "manca la scheda nel menu in alto");
  assert(/\$\("tabMemoria"\)\.onclick = \(\) => showTab\("memoria"\)/.test(html), "la scheda non è collegata");
  assert(html.includes('id="memoriaBack"'), "manca il ritorno alla chat");
  assert(/\$\("memoriaBack"\)\.onclick = \(\) => showTab\("chat"\)/.test(html), "il ritorno alla chat non è collegato");
  assert(html.includes('import("/memoria/atlante.mjs")'), "la vista non carica il modulo del disegno");
  return "6 punti di aggancio verificati";
});

await prova("header mobile: due righe snelle, niente testo fuori dalle pill", async () => {
  const html = readFileSync("dashboard.html", "utf8");
  // Misurato a 430/390/375/360 px: header 117 px, 2 righe, nessun overflow.
  //   riga 1  ☰ · Chat | File | Memoria · 📊
  //   riga 2  modello · features · pallino di stato
  assert(html.includes('class="hrow hrow-1"') && html.includes('class="hrow hrow-2"'), "l'header non ha le due righe");
  assert(/\.hrow \{ display: contents; \}/.test(html), "su desktop le due righe non si dissolvono");
  // Il difetto segnalato: la parola usciva dal rettangolo della pill.
  const tab = html.match(/\.tab \{[\s\S]*?\}/);
  assert(tab && /white-space: nowrap/.test(tab[0]) && /flex: 0 0 auto/.test(tab[0]), "le pill dei tab possono ancora comprimersi e far uscire il testo");
  // Il difetto precedente, che non deve tornare: statistiche nascoste su qualche larghezza.
  assert(!/mobile-stats[^}]*display: none/.test(html) && !/#statsToggle[^}]*display: none/.test(html), "il pulsante delle statistiche viene nascosto");
  // Il thinking esce dalla barra mobile di proposito: si cambia con /think.
  assert(/#thinkSel \{ display: none; \}/.test(html), "il thinking occupa ancora la barra mobile");
  assert(/\/think/.test(readFileSync("media/commands.mjs", "utf8")), "il thinking non è più raggiungibile: manca il comando /think");
  assert(html.indexOf('class="statusbar"') > html.indexOf('class="hrow hrow-2"'), "il pallino di stato non è nella riga dei controlli");
  assert(/@media \(max-width: 350px\) \{\s*\.tab-txt \{ display: none/.test(html), "manca l'ultimo risparmio (solo icone) per schermi molto stretti");
  // Riga 2 allineata al CENTRO: modello, features e stato formano un gruppo centrato sotto la
  // navigazione (margini 49 px a sinistra e 49 a destra misurati a 390, 0 di scarto fra loro).
  // Serve anche annullare il `.tools { width: 100% }` preesistente, che altrimenti teneva il
  // gruppo incollato a sinistra dentro un contenitore largo tutta la riga.
  assert(/\.hrow-2 \{ justify-content: center; \}/.test(html), "la riga 2 non è allineata al centro");
  assert(/\.hrow-2 \.tools \{ flex: 0 1 auto; width: auto/.test(html), "il contenitore dei tools non è stato liberato dalla larghezza 100%");
  return "2 righe · pill integre · statistiche visibili · riga 2 centrata · thinking su /think";
});

await prova("il canvas della memoria non collassa su mobile (flex-basis, non solo height)", async () => {
  const html = readFileSync("dashboard.html", "utf8");
  // Il difetto misurato: `flex: 1 1 auto` ignora `height: 58vh` in un contenitore in colonna,
  // e il canvas restava a 360 px (il suo min-height) invece di 490.
  assert(/#memCanvas \{ flex: 0 0 auto; height: 58vh/.test(html), "il canvas mobile non dichiara la base flessibile");
  const atlante = readFileSync("media/memoria/memoria-atlante.mjs", "utf8");
  assert(/#tela \{ flex: 0 0 auto; height: 60vh/.test(atlante), "l'atlante autonomo ha lo stesso difetto su mobile");
  return "vista e atlante corretti";
});

await prova("la memoria si prende tutto lo spazio al posto della chat", async () => {
  const html = readFileSync("dashboard.html", "utf8");
  // Il difetto segnalato dall'utente: la chat (con statistiche e barra di scrittura) restava
  // visibile sopra la vista, che finiva schiacciata in una finestrella in fondo alla pagina.
  const regola = html.match(/body\[data-tab="memoria"\][^{]*\{[^}]*\}/);
  assert(regola, "manca la regola che nasconde la chat sulla scheda memoria");
  for (const pezzo of ["#stats", "#chatFooter", "#chatView"]) {
    assert(regola[0].includes(pezzo), `la regola non nasconde ${pezzo}`);
  }
  assert(/#memCanvas[^}]*height: 100%/.test(html), "il canvas non prende tutta l'altezza disponibile");
  return "statistiche, barra di scrittura e chat nascoste; canvas a tutta altezza";
});

await prova("la vista Memoria non è nel percorso critico di avvio (si carica solo quando si apre)", async () => {
  const html = readFileSync("dashboard.html", "utf8");
  assert(!/window\.onload[^]*caricaMemoria/.test(html), "la memoria si carica all'avvio: rallenta la dashboard");
  assert(/if \(name === "memoria"\) \{[\s\S]{0,200}caricaMemoria\(\)/.test(html), "la vista non si carica quando la si apre");
  return "caricamento pigro confermato";
});

await prova("la memoria si aggiorna da sé anche quando nessun hook è scattato", async () => {
  const src = readFileSync("dashboard.mjs", "utf8");
  assert(/MEMORIA_REFRESH_MS/.test(src) && /memoriaIndiceDaAggiornare/.test(src), "manca il ciclo di aggiornamento periodico");
  assert(/setInterval\(\(\) => void memoriaTick\(\), MEMORIA_REFRESH_MS\)/.test(src), "il ciclo non è collegato all'intervallo");
  assert(/await memoriaIndiceDaAggiornare\(\)/.test(src), "il ciclo non controlla se c'è qualcosa di nuovo: ricostruirebbe a vuoto");
  assert(/setTimeout\(\(\) => void memoriaTick\(\), 2 \* 60 \* 1000\)/.test(src), "manca il controllo dopo un riavvio");
  return "controllo ogni 20 minuti + uno due minuti dopo l'avvio";
});

await prova("il sync di fine lavoro ricorda la decisione, senza imporla", async () => {
  const sh = readFileSync("scripts/sync-fine-lavoro.sh", "utf8");
  assert(/memoria-promemoria\.mjs/.test(sh), "lo script di sync non chiama il promemoria");
  assert(/DECISIONE_MANCANTE=1/.test(sh), "l'esito del promemoria non viene registrato");
  assert(/non ha una decisione in memoria/.test(sh), "manca il richiamo finale quando la decisione non c'è");
  const dp = readFileSync("dashboard.mjs", "utf8");
  assert(/il «perché» lo scrivi tu/.test(dp), "il system prompt non parla della memoria");
  assert(/memoria_episodio/.test(dp) && /confidenza bassa/.test(dp), "il system prompt non dice di registrare la decisione e di dichiarare la cecità");
  return "promemoria nel sync + regola nel system prompt";
});

await prova("i controlli del disegno sono nel markup e collegati", async () => {
  const html = readFileSync("dashboard.html", "utf8");
  for (const id of ["memoriaModo", "memoriaAdatta", "memoriaZoomIn", "memoriaZoomOut"]) {
    assert(html.includes(`id="${id}"`), `manca il pulsante ${id}`);
  }
  assert(/\$\("memoriaModo"\)\.onclick = \(\) => \{ memoriaAtlante\?\.toggleModo/.test(html), "il pulsante mappa/orbita non è collegato");
  assert(/memoriaAtlante\?\.zoom\(1\.25\)/.test(html) && /memoriaAtlante\?\.zoom\(0\.8\)/.test(html), "i pulsanti di zoom non sono collegati");
  assert(/memoriaAtlante\?\.adatta\(\)/.test(html), "il pulsante «adatta» non è collegato");
  assert(/toggleRelazione\(id\)/.test(html), "la legenda delle relazioni non è cliccabile");
  return "modo, adatta, −, ＋ e legenda cliccabile";
});

await prova("il modulo del disegno offre due letture e i loro controlli", async () => {
  const src = readFileSync("media/memoria/atlante.mjs", "utf8");
  for (const nome of ["geometriaMappa", "toggleModo", "impostaModo", "adatta", "zoom", "toggleRelazione", "contaVisibili"]) {
    assert(src.includes(nome), `manca ${nome} nel modulo del disegno`);
  }
  assert(/modo = "mappa"/.test(src), "la mappa non è la lettura predefinita");
  assert(/pointerdown/.test(src) && /pointermove/.test(src), "il disegno non risponde al puntatore");
  return "mappa/orbita, adatta, zoom, relazioni, lente";
});

// ---------------------------------------------------------------- sistema: il disegno del grafo

console.log("\n[sistema] disegno del grafo (mappa 2D e orbita, senza browser)");

/**
 * Canvas finto: il modulo del disegno gira nel browser, quindi qui si simula il minimo che gli
 * serve (contesto 2D, misura del testo, ciclo di animazione fermo) e si guarda COSA disegna.
 * Serve a verificare le due promesse che a occhio si vedono solo con uno screenshot: stesso
 * grafo → stesso disegno, e nessuna etichetta sopra un'altra.
 */
function canvasFinto(w = 1440, h = 620) {
  const testi = [];
  const gradiente = { addColorStop() {} };
  const ctx = {
    font: "", lineWidth: 1, lineJoin: "", strokeStyle: "", fillStyle: "", globalAlpha: 1, textAlign: "left",
    createRadialGradient: () => gradiente,
    measureText: (t) => ({ width: String(t).length * 6.2 }),
    fillText: (t, x, y) => testi.push({ t: String(t), x, y }),
    strokeText() {}, fillRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, arc() {}, rect() {}, roundRect() {}, fill() {}, stroke() {},
    setLineDash() {}, setTransform() {},
  };
  const canvas = {
    clientWidth: w, clientHeight: h, width: w, height: h, style: {},
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    toDataURL: () => "data:image/png;base64,",
  };
  canvas.testi = testi;
  return canvas;
}

function apriAmbienteBrowser() {
  const prima = {
    devicePixelRatio: globalThis.devicePixelRatio,
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
  };
  globalThis.devicePixelRatio = 1;
  globalThis.document = { hidden: false };
  globalThis.requestAnimationFrame = () => 0; // il ciclo non gira: un disegno, poi stop
  globalThis.cancelAnimationFrame = () => {};
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  return () => {
    for (const [k, v] of Object.entries(prima)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  };
}

await prova("la mappa è la lettura predefinita e non cambia con lo schermo", async () => {
  const chiudi = apriAmbienteBrowser();
  try {
    const { createAtlante } = await import("./memoria/atlante.mjs");
    const v = await datiVista();
    assert(v.esiste, "grafo assente: niente da disegnare");
    const a = createAtlante({ canvas: canvasFinto(1600, 900), dati: v });
    const b = createAtlante({ canvas: canvasFinto(390, 506), dati: v });
    assert(a.vista.modo === "mappa" && b.vista.modo === "mappa", "la vista non parte in mappa");
    const posizioni = (at) => at.nodi.map((n) => n.posM.join(",")).join("|");
    assert(posizioni(a) === posizioni(b), "la mappa cambia con lo schermo: non è deterministica");
    const c = createAtlante({ canvas: canvasFinto(1600, 900), dati: v });
    assert(posizioni(c) === posizioni(a), "due aperture danno due disegni diversi");
    assert(/^mappa$/.test(a.vista.modo) && typeof a.toggleModo === "function", "i controlli non sono esposti");
    a.toggleModo();
    assert(a.vista.modo === "orbita", "non si passa all'orbita");
    a.toggleModo();
    assert(a.vista.modo === "mappa", "non si torna alla mappa");
    return `${a.nodi.length} nodi: stessa mappa su 1600×900 e 390×506`;
  } finally {
    chiudi();
  }
});

await prova("nella mappa nessun nodo si sovrappone e nessuna etichetta sta sopra un'altra", async () => {
  const chiudi = apriAmbienteBrowser();
  try {
    const { createAtlante } = await import("./memoria/atlante.mjs");
    const v = await datiVista();
    const canvas = canvasFinto(1440, 620);
    const at = createAtlante({ canvas, dati: v });

    let minima = Infinity;
    for (let i = 0; i < at.nodi.length; i++) {
      for (let j = i + 1; j < at.nodi.length; j++) {
        const [x1, y1] = at.nodi[i].posM;
        const [x2, y2] = at.nodi[j].posM;
        minima = Math.min(minima, Math.hypot(x1 - x2, y1 - y2));
      }
    }
    assert(minima > 8, `due nodi a ${minima.toFixed(1)} px: si toccano`);

    // Etichette dei nodi: fuori restano le intestazioni (in alto, a sinistra) e il piede.
    const etichette = canvas.testi.filter((t) => t.y > 30 && t.y < 590 && t.x > 80);
    assert(etichette.length > 5, `solo ${etichette.length} etichette disegnate: la mappa è muta`);
    const box = (t) => ({ x: t.x - 2, y: t.y - 10, w: t.t.length * 6.2 + 8, h: 15 });
    for (let i = 0; i < etichette.length; i++) {
      for (let j = i + 1; j < etichette.length; j++) {
        const a = box(etichette[i]);
        const b = box(etichette[j]);
        const sopra = !(a.x > b.x + b.w || a.x + a.w < b.x || a.y > b.y + b.h || a.y + a.h < b.y);
        assert(!sopra, `«${etichette[i].t}» finisce sopra «${etichette[j].t}»`);
      }
    }

    // Ricerca e zoom: le stesse leve della dashboard.
    const totale = at.contaVisibili();
    at.cerca("memoria");
    assert(at.contaVisibili() < totale && at.contaVisibili() > 0, "la ricerca non filtra nulla");
    at.cerca("");
    const prima = at.vista.k;
    at.zoom(1.25);
    assert(at.vista.k > prima, "lo zoom non cambia la scala");
    at.adatta();
    at.seleziona(0);
    assert(at.vista.selezionato === 0, "la selezione non è registrata");
    return `${etichette.length} etichette senza sovrapposizioni, nodi a ≥${minima.toFixed(0)} px`;
  } finally {
    chiudi();
  }
});

// ---------------------------------------------------------------- sistema: dashboard

console.log("\n[sistema] dashboard (le rotte devono esserci e non rompersi)");

function credenziali() {
  try {
    const env = readFileSync(join(process.cwd(), ".env"), "utf8");
    const u = env.match(/^DASH_USER=(.*)$/m)?.[1]?.replace(/^"|"$/g, "");
    const p = env.match(/^DASH_PASSWORD=(.*)$/m)?.[1]?.replace(/^"|"$/g, "");
    if (u && p) return `${u}:${p}`;
  } catch {
    /* niente .env: si prova senza autenticazione */
  }
  return null;
}

const BASE = process.env.MEMORIA_TEST_BASE || "http://127.0.0.1:8420";

async function get(percorso, opzioni = {}) {
  const c = credenziali();
  const headers = { ...(opzioni.headers || {}) };
  if (c) headers.Authorization = "Basic " + Buffer.from(c).toString("base64");
  return fetch(BASE + percorso, { ...opzioni, headers });
}

await prova("la dashboard risponde (servizio attivo)", async () => {
  const r = await get("/api/state");
  assert(r.ok, `HTTP ${r.status}`);
  return `HTTP ${r.status}`;
});

await prova("GET /api/memoria restituisce stato, vista e link", async () => {
  const r = await get("/api/memoria");
  assert(r.ok, `HTTP ${r.status}`);
  const d = await r.json();
  assert(d.stato && d.vista?.esiste, "stato o vista mancanti");
  assert(Array.isArray(d.link_rotti), "link_rotti non è una lista");
  return `${d.vista.nodi.length} nodi, ${d.link_rotti.length} link rotti`;
});

await prova("GET /memoria serve l'atlante", async () => {
  const r = await get("/memoria");
  assert(r.ok, `HTTP ${r.status}`);
  const t = await r.text();
  assert(t.includes("createAtlante"), "l'atlante non contiene il codice del disegno");
  return `${Math.round(t.length / 1024)} KB`;
});

await prova("GET /memoria/atlante.mjs serve il modulo del disegno con il tipo giusto", async () => {
  const r = await get("/memoria/atlante.mjs");
  assert(r.ok, `HTTP ${r.status}`);
  assert(String(r.headers.get("content-type")).includes("javascript"), r.headers.get("content-type"));
  const t = await r.text();
  assert(t.includes("export function createAtlante"), "manca l'esportazione");
  return r.headers.get("content-type");
});

await prova("GET /api/memoria/cerca risponde con un pacchetto entro budget", async () => {
  const r = await get("/api/memoria/cerca?q=memoria%20grafo&budget=400");
  assert(r.ok, `HTTP ${r.status}`);
  const d = await r.json();
  assert(d.token_stimati <= 400, `${d.token_stimati} token`);
  assert(d.diagnosi?.confidenza, "diagnosi mancante");
  return `${d.token_stimati} token, confidenza ${d.diagnosi.confidenza}`;
});

await prova("GET /api/memoria/cerca senza query è un 400, non un 500", async () => {
  const r = await get("/api/memoria/cerca?q=");
  assert(r.status === 400, `HTTP ${r.status}`);
  return "400";
});

await prova("GET /api/memoria/grafo risponde alla query", async () => {
  const r = await get("/api/memoria/grafo?q=dashboard&passi=1&budget=300");
  assert(r.ok, `HTTP ${r.status}`);
  const d = await r.json();
  assert(d.ok && d.testo.length > 0, "risposta vuota");
  return `${d.nodi.length} nodi, ${d.token_stimati} token`;
});

await prova("GET /api/memoria/nodo restituisce scheda e pagina", async () => {
  const r = await get("/api/memoria/nodo?nodo=dashboard.mjs");
  assert(r.ok, `HTTP ${r.status}`);
  const d = await r.json();
  assert(d.scheda?.ok, d.scheda?.testo);
  return d.scheda.testo.split("\n")[0];
});

await prova("le rotte della memoria non sono aperte senza autenticazione", async () => {
  const r = await fetch(BASE + "/api/memoria");
  assert(r.status === 401 || r.status === 403, `HTTP ${r.status}: la memoria è leggibile senza credenziali`);
  return `HTTP ${r.status}`;
});

console.log("\n[sistema] integrazione nel runtime dell'agente (senza chiamare il modello)");

await prova("i quattro tool compaiono nel registro dei tool dell'SDK", async () => {
  const { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager } = await import("@earendil-works/pi-coding-agent");
  const { createMemoriaExtension } = await import("./memoria/memoria-tool.mjs");
  const modelRuntime = await ModelRuntime.create({ allowModelNetwork: true });
  const loader = new DefaultResourceLoader({ cwd: process.cwd(), agentDir: getAgentDir(), extensionFactories: [createMemoriaExtension({ log: () => {} })] });
  await loader.reload();
  const { session } = await createAgentSession({
    modelRuntime,
    model: modelRuntime.getModel("deepseek", "deepseek-flash"),
    sessionManager: SessionManager.inMemory(),
    resourceLoader: loader,
    thinkingLevel: "off",
  });
  const tools = session.getAllTools().map((t) => t.name);
  const attesi = ["memoria_cerca", "memoria_grafo", "memoria_wiki", "memoria_episodio"];
  const mancanti = attesi.filter((n) => !tools.includes(n));
  assert(mancanti.length === 0, `tool non registrati: ${mancanti.join(", ")}`);
  return `${tools.length} tool totali, tutti e 4 quelli di memoria presenti`;
});

// ---------------------------------------------------------------- esito

console.log("");
if (fallimenti.length) {
  console.log(`✘ ${falliti} test falliti su ${passati + falliti}:`);
  for (const f of fallimenti) console.log(`   - ${f}`);
  process.exit(1);
}
console.log(`✓ tutti i ${passati} test passati`);
