/**
 * Genera l'atlante come file HTML autonomo.
 *
 * PERCHÉ UN FILE E NON SOLO LA VISTA DELLA DASHBOARD: questo file si apre da `file://`, si
 * scarica, si manda a qualcuno e funziona senza server — e resta la fotografia di un momento
 * preciso della memoria (i dati sono incorporati). Il codice del disegno però è UNO SOLO: si
 * legge `atlante.mjs` da disco e lo si incorpora. Se il disegno cambia, cambia in un punto.
 *
 * La dashboard fa la stessa cosa via modulo: `import("/memoria/atlante.mjs")`. Quindi la vista
 * integrata e quella scaricabile mostrano la stessa geometria, con le stesse regole.
 */
import { join } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { MEM_DIR, scriviAtomico, ROOT, oggi } from "./memoria-core.mjs";
import { caricaGrafo } from "./memoria-graph.mjs";

const ATLANTE_HTML = join(MEM_DIR, "atlante.html");

const PAGINA = (dati, codice, meta) => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlante della memoria · Universalis Harness</title>
<meta name="description" content="Il grafo della memoria a lungo termine dell'harness: episodi, decisioni, obiettivi e artefatti, esplorabili in 3D.">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #05070c; color: #e2e8f0;
         font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  header { padding: 18px 20px 12px; border-bottom: 1px solid rgba(148,163,184,.16); }
  h1 { margin: 0; font-size: 19px; letter-spacing: -.01em; }
  .sotto { color: #94a3b8; font-size: 13px; margin-top: 4px; }
  .numeri { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; color: #cbd5e1; }
  .numeri b { color: #fff; font-variant-numeric: tabular-nums; }
  .cieca { color: #fb7185; }
  .cieca.ok { color: #34d399; }
  main { display: flex; height: calc(100vh - 108px); min-height: 420px; }
  #tela { flex: 1; min-width: 0; display: block; touch-action: none; cursor: grab; }
  aside { width: 306px; flex: 0 0 306px; overflow-y: auto; padding: 14px 16px 24px;
          border-left: 1px solid rgba(148,163,184,.16); background: #0a0f18; }
  aside h2 { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #64748b; margin: 16px 0 8px; }
  aside h2:first-child { margin-top: 0; }
  input[type=search] { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(148,163,184,.28);
                       background: #0e1420; color: #e2e8f0; font-size: 13px; }
  input[type=search]:focus-visible { outline: 2px solid #5b9dff; outline-offset: 1px; }
  .pill { display: inline-flex; align-items: center; gap: 6px; margin: 0 6px 6px 0; padding: 5px 10px;
          border-radius: 999px; border: 1px solid rgba(148,163,184,.28); background: #0e1420;
          color: #cbd5e1; font-size: 12px; cursor: pointer; }
  .pill[aria-pressed=true] { border-color: currentColor; color: #fff; background: #14203340; }
  .pill .led { width: 8px; height: 8px; border-radius: 50%; background: currentColor; opacity: .85; }
  .pill[aria-pressed=false] { opacity: .45; }
  .legenda { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: #94a3b8; }
  .legenda i { display: inline-block; width: 18px; height: 2px; border-radius: 2px; margin-right: 7px; vertical-align: middle; }
  #dettaglio { font-size: 12.5px; color: #cbd5e1; }
  #dettaglio .titolo { font-size: 14px; color: #fff; font-weight: 600; margin-bottom: 2px; }
  #dettaglio .dove { color: #64748b; font-size: 11.5px; margin-bottom: 8px; }
  #dettaglio .testo { color: #94a3b8; margin-bottom: 10px; }
  #dettaglio ul { margin: 4px 0 0; padding-left: 16px; color: #94a3b8; }
  #dettaglio li { margin-bottom: 3px; }
  #dettaglio code { background: rgba(148,163,184,.14); border-radius: 4px; padding: 1px 5px; font-size: 11.5px; color: #cbd5e1; }
  .vuoto { color: #64748b; font-style: italic; }
  footer { padding: 10px 20px 14px; color: #64748b; font-size: 11.5px; border-top: 1px solid rgba(148,163,184,.14); }
  footer code { background: rgba(148,163,184,.12); border-radius: 4px; padding: 1px 6px; color: #cbd5e1; }
  @media (max-width: 860px) {
    main { flex-direction: column; height: auto; }
    #tela { height: 60vh; }
    aside { width: auto; flex: none; border-left: 0; border-top: 1px solid rgba(148,163,184,.16); }
  }
</style>
</head>
<body>
<header>
  <h1>Atlante della memoria</h1>
  <div class="sotto">Grafo dell'harness generato il ${meta.generato} · lo stesso file letto dalla dashboard</div>
  <div class="numeri">
    <span><b>${meta.nodi}</b> nodi</span>
    <span><b>${meta.archi}</b> relazioni</span>
    <span><b>${meta.aree}</b> aree</span>
    <span><b>${meta.episodi}</b> episodi</span>
    <span class="${meta.cieca ? "cieca" : "cieca ok"}">${meta.cieca ? `${meta.senza_decisione} episodi senza decisione · ${meta.isolati} nodi isolati` : "nessun buco rilevato"}</span>
  </div>
</header>
<main>
  <canvas id="tela"></canvas>
  <aside>
    <h2>Cerca un nodo</h2>
    <input id="cerca" type="search" placeholder="es. sync, browser, memoria…" autocomplete="off">
    <h2>Livelli</h2>
    <div id="fStrati"></div>
    <h2>Aree</h2>
    <div id="fAree"></div>
    <h2>Relazioni</h2>
    <div class="legenda" id="legenda"></div>
    <h2>Nodo selezionato</h2>
    <div id="dettaglio" class="vuoto">Nessun nodo selezionato. Clicca un punto: confronta il suo vicinato con L.</div>
  </aside>
</main>
<footer>
  Trascina per ruotare · rotella o pizzico per avvicinare · <code>L</code> lente a 2 passi · <code>R</code> rotazione automatica.
  Il disegno è deterministico: lo stesso grafo produce sempre lo stesso atlante.
</footer>
<script type="module">
${codice}
${"const D = " + JSON.stringify(dati) + ";"}
const tela = document.getElementById("tela");
const dettaglio = document.getElementById("dettaglio");
const esc = (s) => String(s == null ? "" : s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));

const atlante = createAtlante({
  canvas: tela,
  dati: D,
  onSelect(n) {
    const collegati = (atlante.vicini[n.i] || []).slice(0, 14).map((v) => {
      const altro = atlante.nodi[v.verso];
      return "<li><b>" + esc((D.colori[v.r] || {}).label || v.r) + "</b> " + esc(altro.n) + (altro.s === "artefatto" ? "" : " <em>(" + esc((D.strati[altro.s] || {}).label || altro.s) + ")</em>") + "</li>";
    }).join("");
    dettaglio.className = "";
    dettaglio.innerHTML =
      '<div class="titolo">' + esc(n.n) + "</div>" +
      '<div class="dove">' + esc((D.aree[n.a] || {}).label || n.a) + " · " + esc((D.strati[n.s] || {}).label || n.s) + (n.d ? " · " + esc(n.d) : "") + " · " + (n.g || 0) + " collegamenti</div>" +
      (n.t ? '<div class="testo">' + esc(n.t.slice(0, 420)) + "</div>" : "") +
      (n.f ? '<div class="dove"><code>' + esc(n.f) + "</code></div>" : "") +
      (collegati ? "<ul>" + collegati + "</ul>" : '<div class="vuoto">Nodo isolato: nella memoria non ha collegamenti. È un buco da riempire (o un episodio mancante).</div>');
  },
});

// Filtri: gli stessi assi del disegno, azionabili.
for (const [id, st] of Object.entries(D.strati)) {
  const b = document.createElement("button");
  b.className = "pill";
  b.type = "button";
  b.setAttribute("aria-pressed", "true");
  b.innerHTML = '<span class="led"></span>' + esc(st.label);
  b.style.color = st.colore;
  b.onclick = () => {
    atlante.toggleStrato(id);
    b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
  };
  document.getElementById("fStrati").appendChild(b);
}
const quante = (a) => (D.nodi.filter((n) => n.a === a).length);
for (const [id, ar] of Object.entries(D.aree)) {
  const b = document.createElement("button");
  b.className = "pill";
  b.type = "button";
  b.setAttribute("aria-pressed", "true");
  b.innerHTML = '<span class="led"></span>' + esc(ar.label) + " <em>" + quante(id) + "</em>";
  b.style.color = ar.colore;
  b.onclick = () => {
    atlante.toggleArea(id);
    b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
  };
  document.getElementById("fAree").appendChild(b);
}
document.getElementById("legenda").innerHTML = Object.entries(D.colori)
  .map(([, r]) => '<span><i style="background:' + r.colore + '"></i>' + esc(r.label) + "</span>").join("");

document.getElementById("cerca").addEventListener("input", (e) => {
  atlante.cerca(e.target.value.trim());
  const trovato = e.target.value.trim().length >= 3 ? atlante.nodi.find((n) => (n.n + " " + n.f).toLowerCase().includes(e.target.value.trim().toLowerCase())) : null;
  if (trovato) atlante.seleziona(trovato.i);
});
</script>
</body>
</html>
`;

/** Scrive `media/memoria/atlante.html`: dati incorporati, codice incorporato, zero rete. */
export async function scriviAtlante({ silenzioso = true } = {}) {
  const grafo = await caricaGrafo();
  if (!grafo) return { ok: false, motivo: "grafo assente: esegui prima la ricostruzione" };
  const codice = await readFile(join(MEM_DIR, "atlante.mjs"), "utf8");
  const st = grafo.statistica || {};
  const meta = {
    generato: String(grafo.generato || "").slice(0, 16).replace("T", " "),
    nodi: grafo.nodi.length,
    archi: grafo.archi.length,
    aree: Object.keys(grafo.aree || {}).length,
    episodi: (st.per_strato || {}).episodio || 0,
    senza_decisione: st.episodi_senza_decisione ?? 0,
    isolati: st.isolati ?? 0,
    cieca: (st.episodi_senza_decisione ?? 0) > 0 || (st.isolati ?? 0) > 0,
  };
  const html = PAGINA(grafo, codice.trim(), meta);
  await scriviAtomico(ATLANTE_HTML, html);
  const info = await stat(ATLANTE_HTML);
  const esito = { ok: true, file: "media/memoria/atlante.html", kb: Math.round(info.size / 1024), nodi: grafo.nodi.length, generato: meta.generato };
  if (!silenzioso) console.log(`[memoria] atlante: ${esito.file} (${esito.kb} KB, ${esito.nodi} nodi)`);
  return esito;
}

export { ROOT, oggi };
