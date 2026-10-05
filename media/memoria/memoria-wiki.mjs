/**
 * La wiki: la memoria leggibile, generata dal grafo (non scritta a mano).
 *
 * IL VERSO È INVERTITO rispetto a un wiki tradizionale. In altair-brain il wiki è la fonte
 * (curato a mano o generato da un modello) e il grafo si estrae dalle sue `[[relazioni]]`.
 * Qui è il contrario e costa zero: il grafo nasce da fatti verificabili (file scritti,
 * decisioni registrate, percorsi citati) e la wiki è la sua RESA LEGGIBILE. Niente da
 * mantenere a mano, niente che possa divergere: si rigenera.
 *
 * A COSA SERVE, SE IL GRAFO GIÀ C'È. A due cose diverse:
 *   - all'agente, quando il grafo ha già indicato QUALE nodo serve: una pagina è il dettaglio
 *     di uno solo, e si legge in ~300 token invece di aprire tre file;
 *   - a te, per navigare: dal disegno 3D (o dalla vista) si apre la pagina, e la pagina linka
 *     i vicini. La wiki è il piano terra del grafo, non una seconda copia della memoria.
 *
 * SU UNA COSA ALTair-brain HA RAGIONE E VA COPIATA: un link a una pagina che non esiste viene
 * scartato IN SILENZIO dall'estrattore, quindi la relazione resta «intesa ma rotta» — un grafo
 * che sembra completo e mente. Da qui `linkRotti()`, che si esegue a ogni rigenerazione.
 */
import { join } from "node:path";
import { createHash } from "node:crypto";
import { readdir, unlink } from "node:fs/promises";
import { ROOT, WIKI_DIR, scriviAtomico, leggiTesto, elencaFile, relativo, slug, adesso } from "./memoria-core.mjs";
import { caricaGrafo, vicinato } from "./memoria-graph.mjs";
import { parseFrontmatter, serializzaFrontmatter } from "./memoria-episodio.mjs";

/**
 * Identificatore di un nodo NEL wiki: stabile nel tempo e senza collisioni.
 *
 * Lo slug da solo NON basta: `media/x.md` e `media-x.md` producono lo stesso nome file, e due
 * nodi diversi scriverebbero sulla stessa pagina (una sparirebbe in silenzio). Un hash breve
 * dell'id — che è unico per costruzione — chiude il caso, e resta identico fra una
 * rigenerazione e l'altra, quindi i `[[link]]` non si rompono mai.
 */
export function idWiki(nodo) {
  const impronta = createHash("sha1").update(String(nodo.id)).digest("hex").slice(0, 6);
  return `${slug(nodo.s, 12)}--${slug(String(nodo.f || nodo.id).replace(/[:/]/g, "-"), 52)}-${impronta}`;
}

/** Le pagine si generano per i nodi che hanno testo proprio; per gli artefatti una scheda. */
function daGenerare(grafo) {
  return grafo.nodi.map((n, i) => ({ nodo: n, indice: i }));
}

export async function buildWiki({ silenzioso = true } = {}) {
  const grafo = await caricaGrafo();
  if (!grafo) return { ok: false, motivo: "grafo assente" };
  const mappa = vicinato(grafo);
  const perIndice = new Map(grafo.nodi.map((n, i) => [i, n]));
  const idPerIndice = new Map(grafo.nodi.map((n, i) => [i, idWiki(n)]));

  // La cartella si rigenera da zero: le pagine di nodi non più esistenti (o con id vecchi)
  // resterebbero lì come memoria fantasma, e i link rotti sarebbero attribuiti all'agente.
  try {
    for (const voce of await readdir(WIKI_DIR)) {
      if (voce.endsWith(".md")) await unlink(join(WIKI_DIR, voce));
    }
  } catch {
    /* cartella appena creata */
  }

  const scritte = [];
  for (const { nodo, indice } of daGenerare(grafo)) {
    const collegati = (mappa.get(indice) || []).slice(0, 40);
    const uscite = collegati.filter((c) => c.uscente).map((c) => ({ ...c, nodo: perIndice.get(c.verso), id: idPerIndice.get(c.verso) }));
    const entrate = collegati.filter((c) => !c.uscente).map((c) => ({ ...c, nodo: perIndice.get(c.verso), id: idPerIndice.get(c.verso) }));

    const front = serializzaFrontmatter({
      nodo: nodo.id,
      strato: nodo.s,
      area: nodo.a,
      label: grafo.aree[nodo.a]?.label || nodo.a,
      file: nodo.f || "",
      grado: nodo.g,
      data: nodo.d || "",
      generato: adesso(),
    });

    const righe = [
      "---",
      front,
      "---",
      "",
      `# ${nodo.n}`,
      `_${grafo.strati[nodo.s]?.label || nodo.s} · ${grafo.aree[nodo.a]?.label || nodo.a}${nodo.d ? " · " + nodo.d : ""} · ${nodo.g} collegamenti_`,
      "",
    ];
    if (nodo.t) righe.push(nodo.t, "");
    if (uscite.length) {
      righe.push("## Da qui si va a");
      for (const c of uscite) righe.push(`- [[${c.id}]] — _${c.r}_`);
      righe.push("");
    }
    if (entrate.length) {
      righe.push("## Qui si arriva da");
      for (const c of entrate) righe.push(`- [[${c.id}]] — _${c.r}_`);
      righe.push("");
    }
    if (!uscite.length && !entrate.length) {
      righe.push("_Nessun collegamento: questo nodo è isolato nella memoria. Un nodo isolato è un buco: o è stato registrato senza contesto, o manca l'episodio che lo collega._", "");
    }
    await scriviAtomico(join(WIKI_DIR, `${idWiki(nodo)}.md`), righe.join("\n"));
    scritte.push(idWiki(nodo));
  }

  // Indice generale = il «digest» della memoria: cosa c'è, e dove NON c'è.
  const st = grafo.statistica || {};
  const perArea = Object.entries(st.per_area || {}).map(([id, v]) => ({ id, label: grafo.aree[id]?.label || id, ...v }));
  const episodi = grafo.nodi.filter((n) => n.s === "episodio").sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const righeIndice = [
    "# Memoria dell'harness — indice",
    `_${grafo.nodi.length} nodi, ${grafo.archi.length} relazioni, ${Object.keys(grafo.aree).length} aree · generato il ${grafo.generato.slice(0, 16).replace("T", " ")}_`,
    "",
    "## Dove la memoria è cieca",
    `- episodi senza decisione registrata: **${st.episodi_senza_decisione ?? 0}** (il «perché» non è stato scritto)`,
    `- nodi isolati: **${st.isolati ?? 0}**`,
    `- aree senza episodi: ${perArea.filter((a) => !a.episodi).map((a) => a.label).join(", ") || "nessuna"}`,
    "",
    "## Aree (i progetti)",
    ...perArea.sort((a, b) => b.episodi - a.episodi).map((a) => `- **${a.label}** — ${a.episodi} episodi, ${a.decisioni} decisioni, ${a.artefatti} artefatti`),
    "",
    "## Episodi recenti",
    ...episodi.slice(0, 25).map((n) => `- [[${idWiki(n)}]] — ${n.n} _(${n.d})_`),
    "",
  ];
  await scriviAtomico(join(WIKI_DIR, "index.md"), righeIndice.join("\n"));

  const rotti = await linkRotti();
  const esito = { ok: true, pagine: scritte.length, link_rotti: rotti.length, generato: grafo.generato };
  if (!silenzioso) console.log(`[memoria] wiki: ${esito.pagine} pagine, ${rotti.length} link rotti`);
  return esito;
}

/** Link `[[...]]` che non risolvono a nessuna pagina: relazioni intese ma rotte. */
export async function linkRotti() {
  const file = await elencaFile(WIKI_DIR, { est: [".md"] });
  const noti = new Set(file.map((f) => f.split("/").pop().replace(/\.md$/, "")));
  const rotti = [];
  for (const f of file) {
    const testo = await leggiTesto(f);
    if (!testo) continue;
    for (const m of testo.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const id = m[1].trim();
      if (id === "index") continue;
      if (!noti.has(id)) rotti.push({ da: relativo(f), verso: id });
    }
  }
  return rotti;
}

/** La pagina di un nodo, cercata per id, per titolo o per file. */
export async function leggiWiki(rif) {
  const grafo = await caricaGrafo();
  if (!grafo) return { ok: false, testo: "Il grafo non esiste ancora: chiama la ricostruzione della memoria." };
  const q = String(rif || "").trim();
  const perId = new Map(grafo.nodi.map((n) => [idWiki(n), n]));
  let nodo = perId.get(q) || perId.get(slug(q, 80));
  if (!nodo) {
    nodo = grafo.nodi.find((n) => n.id === q) || grafo.nodi.find((n) => n.f === q);
  }
  if (!nodo) {
    // Ricerca per termini, non per sottostringa intera: «sync fine lavoro» deve trovare la
    // pagina di un episodio il cui titolo non contiene quella frase esatta.
    const termini = slug(q, 80).split("-").filter((t) => t.length >= 3);
    if (termini.length) {
      let migliore = null;
      let puntiMigliori = 0;
      for (const n of grafo.nodi) {
        const testo = `${n.n} ${n.f} ${n.t || ""}`.toLowerCase();
        const punti = termini.filter((t) => testo.includes(t)).length;
        if (punti > puntiMigliori) {
          migliore = n;
          puntiMigliori = punti;
        }
      }
      // Serve la maggioranza dei termini: cercare una parola comune non deve aprire una pagina a caso.
      if (migliore && puntiMigliori >= Math.max(1, Math.ceil(termini.length / 2))) nodo = migliore;
    }
  }
  if (!nodo) {
    return { ok: false, testo: `Nessuna pagina per «${rif}». Usa memoria_grafo (azione "cerca") per i nomi esatti dei nodi.` };
  }
  const testo = await leggiTesto(join(WIKI_DIR, `${idWiki(nodo)}.md`));
  return { ok: true, nodo, id: idWiki(nodo), testo: testo || "Pagina non ancora generata: esegui la ricostruzione della memoria." };
}
