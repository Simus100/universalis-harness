/**
 * TEST del markdown della chat: il convertitore deve rendere leggibile una tabella e non deve
 * lasciar passare niente che non sia stato costruito da lui.
 *
 * Perché è un test e non una prova a occhio: il testo dei messaggi arriva dall'esterno (modello,
 * file, web). Un convertitore che sbaglia l'escape è una falla; uno che spezza le pipe dentro il
 * codice rende illeggibile un comando. Qui si controlla il comportamento su casi che si sbagliano
 * sempre: escape, link pericolosi, pipe dentro `code`, celle vuote, tabelle senza separatore.
 *
 * Uso: node media/test-md-render.mjs
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync("/root/pi-harness/dashboard.html", "utf8");
const estrai = (nome) => {
  const i = html.indexOf(`function ${nome}(`);
  if (i < 0) throw new Error("non trovata: " + nome);
  let d = 0;
  for (let k = html.indexOf("{", i); k < html.length; k += 1) {
    if (html[k] === "{") d += 1;
    else if (html[k] === "}") { d -= 1; if (!d) return html.slice(i, k + 1); }
  }
  throw new Error("graffe sbilanciate: " + nome);
};
const riga = (pref) => { const i = html.indexOf(pref); return html.slice(i, html.indexOf("\n", i)); };

const pezzi = [
  riga("const MD_ESC = "),
  riga("const mdEsc = "),
  estrai("sembraMarkdown"),
  estrai("mdInline"),
  estrai("mdCelle"),
  estrai("mdAllinea"),
  estrai("mdRender"),
  "globalThis.__md = { mdRender, sembraMarkdown, mdCelle };",
].join("\n");
const ctx = { console, String, Math, Array, Object, RegExp };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(pezzi, ctx);
const { mdRender, sembraMarkdown, mdCelle } = ctx.__md;

let pass = 0, fail = 0;
const ok = (m) => { console.log("  ✔ " + m); pass += 1; };
const ko = (m) => { console.log("  ✘ " + m); fail += 1; };
const check = (d, c, extra = "") => (c ? ok(d) : ko(`${d}${extra ? " — " + extra : ""}`));
const section = (t) => console.log(`\n== ${t} ==`);

section("tabella: la richiesta dell'utente");
{
  const md = [
    "| dove | difetto | effetto |",
    "|---|---|---|",
    "| servizio | `prediction_length or 30` | un orizzonte **0** diventava 30 |",
    "| client CSV | campi quotati | `\"1.234,56\"` letto come 1.234 |",
  ].join("\n");
  const h = mdRender(md);
  check("diventa una vera <table>", h.includes("<table class=\"md-table\"") && h.includes("<thead>"));
  check("avvolta in un riquadro che scorre da solo", h.includes("md-table-wrap"));
  check("una riga per riga di dati (2)", (h.match(/<tr>/g) || []).length === 3, String((h.match(/<tr>/g) || []).length));
  check("ogni cella porta l'etichetta della colonna (per il layout a schede su telefono)", (h.match(/data-label="/g) || []).length === 6, String((h.match(/data-label="/g) || []).length));
  check("il grassetto dentro la cella viene reso", h.includes("<strong>0</strong>"));
  check("il codice in linea viene reso", h.includes("<code>prediction_length or 30</code>"));
  check("|dentro il codice| non spezza la cella", (h.match(/<td/g) || []).length === 6, String((h.match(/<td/g) || []).length));
}

section("testo normale e costrutti");
{
  check("paragrafo semplice", mdRender("Ciao, come va?").includes("<p>Ciao, come va?</p>"));
  check("titolo ##", mdRender("## Titolo").includes("<h2 class=\"md-h\">Titolo</h2>"));
  check("elenco puntato", /<ul class="md-list"><li>uno<\/li><li>due<\/li><\/ul>/.test(mdRender("- uno\n- due")));
  check("elenco numerato", mdRender("1. primo\n2. secondo").includes("<ol class=\"md-list\">"));
  check("citazione", mdRender("> citazione").includes("<blockquote class=\"md-quote\">citazione</blockquote>"));
  check("riga orizzontale", mdRender("---").includes("<hr"));
  check("lista dentro un paragrafo non si fonde", mdRender("testo\n- voce").includes("</p>") && mdRender("testo\n- voce").includes("<ul"));
  check("corsivo con asterischi", mdRender("un *enfasi* qui").includes("<em>enfasi</em>"));
  check("barrato", mdRender("~~via~~").includes("<del>via</del>"));
  check("link web diventa un collegamento sicuro", mdRender("[sito](https://example.org/x)").includes('rel="noopener noreferrer"'));
}

section("sicurezza: niente HTML di terzi");
{
  const script = mdRender('<script>alert(1)</script>');
  check("tag script neutralizzato", !script.includes("<script") && script.includes("&lt;script&gt;"), script.slice(0, 80));
  const img = mdRender('<img src=x onerror="alert(1)">');
  check("tag img non passa", !img.includes("<img"), img.slice(0, 80));
  const js = mdRender("[clicca](javascript:alert(1))");
  check("link javascript: rifiutato", !js.includes("<a ") && js.includes("javascript:alert(1)"), js.slice(0, 90));
  const quote = mdRender('| a | b |\n|---|---|\n| <b>x</b> | y |');
  check("HTML dentro le celle escapato", !quote.includes("<b>") && quote.includes("&lt;b&gt;"));
  const attr = mdRender('| a"onmouseover="x | b |\n|---|---|\n| 1 | 2 |');
  check("virgolette nell'intestazione non rompono l'attributo", !/"\s*onmouseover/.test(attr), attr.slice(0, 140));
}

section("casi che sbagliano spesso");
{
  check("una pipe isolata non è una tabella", !mdRender("a | b").includes("<table"));
  check("tabella con celle vuote: nessun buco di colonna", (mdRender("| a | b | c |\n|---|---|---|\n| 1 |  | 3 |").match(/<td/g) || []).length === 3);
  check("allineamento a destra rispettato", mdRender("| n |\n|---:|\n| 12 |").includes('text-align:right'));
  check("pipe dentro il codice NON divide la cella", mdCelle("| `a|b` | c |").length === 2, JSON.stringify(mdCelle("| `a|b` | c |")));
  check("testo senza markdown non viene toccato", sembraMarkdown("Ciao, 3 mele e 2 pere.") === false);
  check("una tabella viene riconosciuta come markdown", sembraMarkdown("| a | b |\n|---|---|") === true);
  check("testo con pipe sparse MA senza separatore resta testo", mdRender("uso a | b nel testo").includes("a | b"));
}

console.log(`\n${"─".repeat(60)}\ncontrolli: ${pass + fail} · passati ${pass} · falliti ${fail}`);
process.exit(fail ? 1 : 0);
