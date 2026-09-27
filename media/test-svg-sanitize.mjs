/**
 * Test del sanitizzatore SVG (media/svg-sanitize.mjs).
 *
 * Il sanitizzatore è l'unico punto che decide se un disegno prodotto dal modello può
 * diventare un'anteprima: qui si verifica che accetti ciò che serve (forme, testo, gradienti,
 * riferimenti locali) e che RIFIUTI tutto ciò che può eseguire codice o uscire in rete.
 *
 * Uso: node media/test-svg-sanitize.mjs
 */
import { readFileSync } from "node:fs";
import { sanitizeSvg, SVG_LIMITS } from "./svg-sanitize.mjs";

let pass = 0;
let fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const check = (desc, cond, extra = "") => (cond ? ok(desc) : ko(`${desc}${extra ? " → " + extra : ""}`));

/** Rifiuto atteso: il sanitizzatore non deve produrre nulla di mostrabile. */
const rifiuta = (desc, svg) => {
  const r = sanitizeSvg(svg);
  if (r.ok) ko(`${desc}: NON rifiutato → ${r.svg.slice(0, 120)}`);
  else ok(`${desc} (${r.error})`);
};

/** Accettazione attesa, con eventuale controllo sul risultato. */
const accetta = (desc, svg, verify) => {
  const r = sanitizeSvg(svg);
  if (!r.ok) return ko(`${desc}: rifiutato → ${r.error}`);
  if (verify && !verify(r)) return ko(`${desc}: risultato inatteso → ${r.svg.slice(0, 200)}`);
  ok(desc);
};

console.log("== forme, testo, gradienti: accettati e normalizzati ==");
const BUONO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">
  <title>Processo</title><desc>Diagramma di flusso in tre passi</desc>
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5b9dff"/><stop offset="1" stop-color="#8b5cff"/>
    </linearGradient>
    <clipPath id="clip"><rect x="0" y="0" width="100" height="50" rx="6"/></clipPath>
  </defs>
  <g transform="translate(10,10)" clip-path="url(#clip)">
    <rect x="0" y="0" width="80" height="40" rx="8" fill="url(#grad)" stroke="#eef2f9" stroke-width="1.5"/>
    <circle cx="40" cy="60" r="12" fill="none" stroke="#34d399"/>
    <path d="M0 0 L20 20 L40 0 Z" fill="#fbbf24" fill-opacity="0.9"/>
    <polyline points="0,0 10,10 20,0" fill="none" stroke="#fff"/>
    <polygon points="0,0 10,10 20,0"/>
    <ellipse cx="10" cy="10" rx="4" ry="2"/>
    <line x1="0" y1="0" x2="10" y2="10"/>
    <text x="40" y="100" text-anchor="middle" font-size="12" font-family="sans-serif">Etichetta &amp; testo</text>
    <tspan x="0" dy="14">seconda riga</tspan>
  </g>
</svg>`;
accetta("disegno completo (forme, testo, gradienti, clip, transform)", BUONO, (r) => {
  const s = r.svg;
  return (
    s.startsWith("<svg xmlns=\"http://www.w3.org/2000/svg\"") &&
    s.includes('viewBox="0 0 240 120"') &&
    s.includes('fill="url(#grad)"') &&
    s.includes('clip-path="url(#clip)"') &&
    s.includes("<title>Processo</title>") &&
    s.includes("Etichetta &amp; testo") &&
    s.includes("<tspan") &&
    // niente entità doppie o markup non normalizzato
    !s.includes("&amp;amp;")
  );
});

accetta("nomi con maiuscole sbagliate dal modello (Viewbox, Stop-Color)", `<svg Viewbox="0 0 20 20"><Rect Width="5" Height="5" Fill="#fff"/><linearGradient ID="g"><stop Offset="0" Stop-Color="#000"/></linearGradient></svg>`, (r) =>
  r.svg.includes('viewBox="0 0 20 20"') && r.svg.includes('fill="#fff"') && r.svg.includes('stop-color="#000"') && r.svg.includes('id="g"'),
);

accetta("viewBox derivato da width/height", `<svg width="400" height="200"><rect width="10" height="10"/></svg>`, (r) => {
  return r.svg.includes('viewBox="0 0 400 200"') && r.warnings.some((w) => w.includes("viewBox assente"));
});

accetta("composizione semplice senza xmlns (lo si aggiunge)", `<svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg>`, (r) =>
  r.svg.includes('xmlns="http://www.w3.org/2000/svg"'),
);

console.log("\n== codice eseguibile e vettori XSS: rifiutati ==");
rifiuta("elemento <script>", `<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>`);
rifiuta("script con namespace", `<svg viewBox="0 0 10 10"><svg:script xmlns:svg="http://www.w3.org/2000/svg">alert(1)</svg:script></svg>`);
rifiuta("attributo evento onload sul root", `<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="1" height="1"/></svg>`);
rifiuta("attributo evento onclick", `<svg viewBox="0 0 10 10"><rect width="1" height="1" onclick="alert(1)"/></svg>`);
rifiuta("attributo evento in maiuscolo (ONMOUSEOVER)", `<svg viewBox="0 0 10 10"><rect width="1" height="1" ONMOUSEOVER="alert(1)"/></svg>`);
rifiuta("foreignObject", `<svg viewBox="0 0 10 10"><foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>`);
rifiuta("elemento <style>", `<svg viewBox="0 0 10 10"><style>rect{fill:red}</style><rect width="1" height="1"/></svg>`);
rifiuta("attributo style", `<svg viewBox="0 0 10 10"><rect width="1" height="1" style="fill:red"/></svg>`);
rifiuta("elemento <image> con URL remoto", `<svg viewBox="0 0 10 10"><image href="https://example.invalid/x.png" width="10" height="10"/></svg>`);
rifiuta("elemento <use> con riferimento remoto", `<svg viewBox="0 0 10 10"><use href="https://example.invalid/x.svg#a"/></svg>`);
rifiuta("elemento <a> (link)", `<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><rect width="1" height="1"/></a></svg>`);
rifiuta("attributo href (anche locale)", `<svg viewBox="0 0 10 10"><rect width="1" height="1" href="#a"/></svg>`);
rifiuta("attributo xlink:href", `<svg viewBox="0 0 10 10"><rect width="1" height="1" xlink:href="javascript:alert(1)"/></svg>`);
rifiuta("DTD/DOCTYPE", `<!DOCTYPE svg><svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>`);
rifiuta("entità esterna (XXE)", `<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 10 10"><text>&xxe;</text></svg>`);
rifiuta("CDATA", `<svg viewBox="0 0 10 10"><text><![CDATA[<script>alert(1)</script>]]></text></svg>`);
rifiuta("istruzione di elaborazione", `<svg viewBox="0 0 10 10"><?php echo 1; ?><rect width="1" height="1"/></svg>`);
rifiuta("entità sconosciuta", `<svg viewBox="0 0 10 10"><text>&nope;</text></svg>`);
rifiuta("elemento <animate> (animazione)", `<svg viewBox="0 0 10 10"><rect width="1" height="1"><animate attributeName="x" to="9" dur="1s"/></rect></svg>`);
rifiuta("elemento <filter>", `<svg viewBox="0 0 10 10"><filter id="f"><feGaussianBlur stdDeviation="2"/></filter><rect width="1" height="1" filter="url(#f)"/></svg>`);
rifiuta("elemento <symbol> + <use>", `<svg viewBox="0 0 10 10"><symbol id="s"><rect width="1" height="1"/></symbol><use href="#s"/></svg>`);
rifiuta("carattere NUL nel testo", `<svg viewBox="0 0 10 10"><text>a\u0000b</text></svg>`);

console.log("\n== URL e riferimenti: solo locali e solo se esistono ==");
accetta("fill url(https://…) → attributo rimosso, disegno conservato", `<svg viewBox="0 0 10 10"><rect width="4" height="4" fill="url(https://example.invalid/x)"/></svg>`, (r) => {
  return !r.svg.includes("example.invalid") && r.warnings.some((w) => w.includes("fill"));
});
accetta("url(#inesistente) → attributo rimosso", `<svg viewBox="0 0 10 10"><rect width="4" height="4" fill="url(#nope)"/></svg>`, (r) =>
  !r.svg.includes("url(#nope)"),
);
accetta("javascript: in fill → attributo rimosso", `<svg viewBox="0 0 10 10"><rect width="4" height="4" fill="javascript:alert(1)"/></svg>`, (r) =>
  !r.svg.toLowerCase().includes("javascript"),
);
accetta("clip-path verso un gradiente → attributo rimosso", `<svg viewBox="0 0 10 10"><linearGradient id="g"/><rect width="4" height="4" clip-path="url(#g)"/></svg>`, (r) =>
  !r.svg.includes("clip-path"),
);
accetta("fill verso un clipPath → attributo rimosso", `<svg viewBox="0 0 10 10"><clipPath id="c"><rect width="1" height="1"/></clipPath><rect width="4" height="4" fill="url(#c)"/></svg>`, (r) =>
  !r.svg.includes('fill="url(#c)"'),
);
accetta("riferimento a gradiente locale valido è conservato", `<svg viewBox="0 0 10 10"><radialGradient id="rg"><stop offset="0" stop-color="#fff"/></radialGradient><circle cx="5" cy="5" r="4" fill="url(#rg)"/></svg>`, (r) =>
  r.svg.includes('fill="url(#rg)"'),
);

console.log("\n== entità e doppio escaping ==");
accetta("entità numerica non re-inietta markup", `<svg viewBox="0 0 10 10"><text>&#x26;#x3c;script&#x26;#x3e;alert(1)&#x26;#x3c;/script&#x26;#x3e;</text></svg>`, (r) =>
  !r.svg.includes("<script") && r.svg.includes("&amp;#x3c;"),
);
accetta("&amp; nel testo resta &amp; (non doppio)", `<svg viewBox="0 0 10 10"><text>a &amp; b</text></svg>`, (r) =>
  r.svg.includes("a &amp; b"),
);
accetta("virgolette nel testo sono innocue", `<svg viewBox="0 0 10 10"><text>x" onload="alert(1)</text></svg>`, (r) =>
  !r.svg.includes('onload="alert(1)"'),
);

console.log("\n== struttura malformata: fail closed ==");
rifiuta("elemento non chiuso", `<svg viewBox="0 0 10 10"><rect width="1" height="1">`);
rifiuta("chiusura sbagliata", `<svg viewBox="0 0 10 10"><g><rect width="1" height="1"/></svg></g>`);
rifiuta("chiusura mancante", `<svg viewBox="0 0 10 10"><g><rect width="1" height="1"/></g>`);
rifiuta("attributo senza virgolette", `<svg viewBox="0 0 10 10"><rect width=1 height="1"/></svg>`);
rifiuta("attributo senza valore", `<svg viewBox="0 0 10 10"><rect width height="1"/></svg>`);
rifiuta("radice diversa da <svg>", `<svg2 viewBox="0 0 10 10"><rect width="1" height="1"/></svg2>`);
rifiuta("contenuto dopo la radice", `<svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg><script>alert(1)</script>`);
rifiuta("secondo elemento radice", `<svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg><svg viewBox="0 0 1 1"/>`);
rifiuta("senza viewBox né dimensioni", `<svg><rect width="1" height="1"/></svg>`);
rifiuta("viewBox con 3 soli valori", `<svg viewBox="0 0 10"><rect width="1" height="1"/></svg>`);
rifiuta("viewBox con dimensioni non positive", `<svg viewBox="0 0 0 10"><rect width="1" height="1"/></svg>`);
rifiuta("id duplicato", `<svg viewBox="0 0 10 10"><linearGradient id="g"/><radialGradient id="g"/></svg>`);
rifiuta("d con caratteri non consentiti", `<svg viewBox="0 0 10 10"><path d="M0 0 L1 1&quot; onload=&quot;x"/></svg>`);
rifiuta("transform con una funzione non prevista", `<svg viewBox="0 0 10 10"><rect width="4" height="4" transform="rotate(10) expression(alert(1))"/></svg>`);
rifiuta("transform con url esterno", `<svg viewBox="0 0 10 10"><rect width="4" height="4" transform="url(https://example.invalid/x)"/></svg>`);
accetta("transform con le funzioni consentite", `<svg viewBox="0 0 10 10"><rect width="4" height="4" transform="translate(1,2) rotate(10) scale(2)"/></svg>`);

console.log("\n== limiti di dimensione e complessità ==");
rifiuta(`documento oltre ${SVG_LIMITS.maxBytes / 1000} KB`, `<svg viewBox="0 0 10 10"><desc>${"x".repeat(SVG_LIMITS.maxBytes + 10)}</desc></svg>`);
rifiuta("troppi elementi", `<svg viewBox="0 0 10 10">${'<rect width="1" height="1"/>'.repeat(SVG_LIMITS.maxElements + 5)}</svg>`);
rifiuta("annidamento eccessivo", `<svg viewBox="0 0 10 10">${"<g>".repeat(SVG_LIMITS.maxDepth + 2)}${"</g>".repeat(SVG_LIMITS.maxDepth + 2)}</svg>`);
rifiuta("valore di attributo troppo lungo", `<svg viewBox="0 0 10 10"><path d="M0 0 ${"L1 1 ".repeat(6000)}"/></svg>`);
rifiuta("attributi in eccesso su un solo elemento", `<svg viewBox="0 0 10 10"><rect width="1" height="1" ${Array.from({ length: 70 }, (_, i) => `id="a${i}"`).join(" ")}/></svg>`);
rifiuta("testo complessivo troppo lungo", `<svg viewBox="0 0 10 10">${Array.from({ length: 12 }, (_, i) => `<desc>${"y".repeat(7000)}${i}</desc>`).join("")}</svg>`);
rifiuta("troppe fermate di gradiente", `<svg viewBox="0 0 10 10"><linearGradient id="g">${'<stop offset="0" stop-color="#fff"/>'.repeat(SVG_LIMITS.maxStops + 2)}</linearGradient></svg>`);

console.log("\n== idempotenza (l'output è stabile e ben formato) ==");
{
  const r1 = sanitizeSvg(BUONO);
  const r2 = sanitizeSvg(r1.svg);
  check("sanitizzare un output già pulito non cambia nulla", r2.ok && r2.svg === r1.svg, r2.ok ? "diverso" : r2.error);
  check("nessuna entità esterna nell'output", !/<\?|<!|<\s*script|on\w+\s*=/i.test(r1.svg));
  const r3 = sanitizeSvg(`<svg viewBox="0 0 10 10"><title>a &lt; b &gt; c</title><text>x &amp; y</text></svg>`);
  check("l'escape di < e > nel testo è corretto", r3.ok && r3.svg.includes("a &lt; b &gt; c") && r3.svg.includes("x &amp; y"), r3.ok ? r3.svg : r3.error);
}

console.log("\n== casi limite di API ==");
check("input non testuale → rifiuto", sanitizeSvg(null).ok === false);
check("stringa vuota → rifiuto", sanitizeSvg("").ok === false);
check("solo testo → rifiuto", sanitizeSvg("ciao mondo").ok === false);
check("commenti XML scartati", sanitizeSvg(`<!-- c --><svg viewBox="0 0 5 5"><!-- x --><rect width="1" height="1"/></svg>`).ok === true);
check("dichiarazione XML iniziale accettata", sanitizeSvg(`<?xml version="1.0" encoding="UTF-8"?><svg viewBox="0 0 5 5"><rect width="1" height="1"/></svg>`).ok === true);
{
  const r = sanitizeSvg(`<svg viewBox="0 0 5 5"><title>t</title><desc>d</desc><rect width="1" height="1"/></svg>`);
  check("statistiche riportate", r.ok && r.stats.elements >= 4 && r.stats.bytes > 0, r.ok ? JSON.stringify(r.stats) : r.error);
}

console.log("\n== esempi della skill visual-representation ==");
{
  // Gli esempi dentro la skill sono il modello che il modello copia: se non passassero il
  // sanitizzatore, la skill insegnerebbe a produrre disegni che la chat non può mostrare.
  const skillPath = new URL("../skills/visual-representation/SKILL.md", import.meta.url);
  const md = readFileSync(skillPath, "utf8");
  const blocks = [...md.matchAll(/(?:^|\n)```svg\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  check("la skill contiene almeno tre esempi svg", blocks.length >= 3, `trovati ${blocks.length}`);
  blocks.forEach((code, i) => {
    const r = sanitizeSvg(code);
    if (!r.ok) return ko(`esempio ${i + 1} della skill: rifiutato → ${r.error}`);
    check(
      `esempio ${i + 1} conforme al contratto (${r.stats.bytes} byte, ${r.stats.elements} elementi)`,
      r.warnings.length === 0,
      r.warnings.join(" | "),
    );
    check(`esempio ${i + 1} ha <title> e <desc>`, r.title.length > 0 && r.desc.length > 0);
    check(
      `esempio ${i + 1} usa viewBox e namespace SVG`,
      r.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && r.svg.includes("viewBox="),
    );
  });
}

console.log(`\nrisultato: ${pass} ok, ${fail} falliti`);
process.exit(fail ? 1 : 0);
