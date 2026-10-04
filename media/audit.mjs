/**
 * AUDIT della dashboard: confronta codice, frontend e documentazione.
 *
 * Serve a rispondere alla domanda "tutto si comporta come da aspettativa?" in modo
 * verificabile: ogni funzione dichiarata (nel README, nel catalogo dei comandi, nei menu)
 * deve esistere nel codice e viceversa.
 *
 * Controlla:
 *  1. ENDPOINT      server ↔ frontend ↔ README
 *  2. COMANDI       catalogo ↔ handler ↔ README
 *  3. VISTE         markup ↔ showTab ↔ CSS ↔ menu features ↔ comando /tab
 *  4. ID            usati dal JS ↔ presenti nell'HTML
 *  5. CODICE MORTO  funzioni definite e mai referenziate
 *  6. FILE          script citati nel README che non esistono
 *
 * Uso: node media/audit.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/root/pi-harness";
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const mjs = read("dashboard.mjs");
const html = read("dashboard.html");
const readme = read("docs/MANUALE.md");   // la guida operativa (il README è la vetrina del prodotto)
const commands = read("media/commands.mjs");

const problems = [];
const notes = [];
const section = (t) => console.log(`\n${"─".repeat(72)}\n${t}\n${"─".repeat(72)}`);
const bad = (m) => { problems.push(m); console.log("  ✘ " + m); };
const warn = (m) => { notes.push(m); console.log("  ⚠ " + m); };
const ok = (m) => console.log("  ✔ " + m);

const uniq = (a) => [...new Set(a)];
const has = (hay, needle) => hay.includes(needle);

/* ─────────────────────────── 1. ENDPOINT ─────────────────────────── */
section("1. ENDPOINT — server / frontend / documentazione");

const serverRoutes = uniq([...mjs.matchAll(/url\.pathname === "(\/api\/[^"]+)"/g)].map((m) => m[1])).sort();
const feRoutes = uniq([
  ...[...html.matchAll(/fetch\(\s*"(\/api\/[^"?]*)/g)].map((m) => m[1]),
  ...[...html.matchAll(/window\.location = "(\/api\/[^"?]*)/g)].map((m) => m[1]),
  ...[...html.matchAll(/"(?:\/api\/[a-z][^"]*)"/g)].map((m) => m[0].slice(1, -1).split("?")[0]),
]).filter((u) => u && !u.includes("${")).sort();
// Il percorso va catturato fino al primo carattere non valido (? per la query, ` per la fine):
// richiedere il backtick subito dopo faceva perdere tutti gli endpoint con query string.
const readmeRoutes = uniq([...readme.matchAll(/`(\/api\/[a-z][\w/-]*)/g)].map((m) => m[1])).sort();

console.log(`server: ${serverRoutes.length} · frontend: ${feRoutes.length} · README: ${readmeRoutes.length}`);

const feMissing = feRoutes.filter((u) => !serverRoutes.includes(u));
feMissing.length ? bad(`usati dal frontend ma ASSENTI nel server: ${feMissing.join(", ")}`) : ok("ogni endpoint usato dal frontend esiste nel server");

const docMissing = serverRoutes.filter((u) => !readmeRoutes.includes(u));
if (docMissing.length) warn(`esistono nel server ma NON documentati nel README: ${docMissing.join(", ")}`);
else ok("tutti gli endpoint sono documentati");

const docStale = readmeRoutes.filter((u) => !serverRoutes.includes(u));
if (docStale.length) bad(`documentati nel README ma ASSENTI nel server: ${docStale.join(", ")}`);
else ok("nessun endpoint documentato è scomparso dal server");

/* ─────────────────────────── 2. COMANDI ─────────────────────────── */
section("2. COMANDI SLASH — catalogo / handler / README");

const cmdNames = uniq([...commands.matchAll(/^\s{4}name: "([a-z-]+)",/gm)].map((m) => m[1])).sort();
const handlerBlock = mjs.slice(mjs.indexOf("const COMMAND_HANDLERS"));
const handlerNames = uniq(
  [...handlerBlock.matchAll(/^\s{2}"?([a-z][a-z-]*)"?:\s*(?:async\s*)?\(/gm)].map((m) => m[1]),
).sort();
// I comandi sono quelli tra backtick che cominciano con /; si escludono i percorsi API
// (che iniziano con /api) e si cercano in tutto il README, non solo a inizio cella:
// nella tabella comandi più comandi convivono nella stessa cella.
// Falsi positivi noti: nei backtick del README compaiono anche percorsi e file, non comandi.
const NON_COMMANDS = new Set(["etc", "root", "obs", "exit", "sw", "icon-", "manifest"]);
const readmeCmds = uniq(
  [...readme.matchAll(/`(\/[a-z][a-z-]*)/g)]
    .filter((m) => !m[1].startsWith("/api") && !NON_COMMANDS.has(m[1].slice(1)))
    .map((m) => m[1].slice(1)),
).sort();

console.log(`catalogo: ${cmdNames.length} · handler: ${handlerNames.length} · README: ${readmeCmds.length}`);

const noHandler = cmdNames.filter((c) => !handlerNames.includes(c) && c !== "help" && c !== "status");
if (noHandler.length) warn(`nel catalogo senza handler dedicato (potrebbero essere gestiti altrove): ${noHandler.join(", ")}`);
else ok("ogni comando del catalogo ha un handler");

const undocumented = cmdNames.filter((c) => !readmeCmds.includes(c));
if (undocumented.length) warn(`comandi non citati nel README: ${undocumented.join(", ")}`);
else ok("tutti i comandi sono documentati");

const missingCmd = readmeCmds.filter((c) => !cmdNames.includes(c) && !["api", "browser", "events", "skill", "skills"].includes(c));
if (missingCmd.length) warn(`citati nel README ma non nel catalogo: ${missingCmd.join(", ")}`);
else ok("nessun comando documentato è assente dal catalogo");
/* ─────────────────────────── 3. VISTE ─────────────────────────── */
section("3. VISTE — markup / showTab / CSS / menu / comando /tab");

const viewIds = uniq([...html.matchAll(/<main id="(\w+View)"/g)].map((m) => m[1])).sort();
const tabs = uniq([...html.matchAll(/body\[data-tab="(\w+)"\]/g)].map((m) => m[1])).sort();
const showTabBlock = html.slice(html.indexOf("function showTab("), html.indexOf("function showTab(") + 2000);
const shown = uniq([...showTabBlock.matchAll(/\$\("(\w+View)"\)\.hidden/g)].map((m) => m[1])).sort();
const tabCmd = (readme.match(/`\/tab <([^>]+)>`/) || [, ""])[1];

console.log(`viste nel markup: ${viewIds.join(", ")}`);
console.log(`tab nel CSS: ${tabs.join(", ")}`);

const notShown = viewIds.filter((v) => !shown.includes(v) && v !== "chatView"); // chatView è la vista di default: non si nasconde mai
notShown.length ? bad(`viste non gestite da showTab: ${notShown.join(", ")}`) : ok("ogni vista è gestita da showTab");

const viewTabs = viewIds.map((v) => v.replace(/View$/, "").toLowerCase());
const noCss = viewTabs.filter((t) => t !== "chat" && !tabs.includes(t));
noCss.length ? bad(`viste senza regola CSS body[data-tab]: ${noCss.join(", ")}`) : ok("ogni vista ha la regola CSS per nascondere la chat");

const tabList = uniq(tabCmd.split("|").map((s) => s.replace(/[\\`<>]/g, "").trim()).filter(Boolean));
const noCmd = viewTabs.filter((t) => t !== "chat" && !tabList.includes(t));
if (noCmd.length) warn(`viste non elencate nel comando /tab del README: ${noCmd.join(", ")}`);
else ok("tutte le viste sono citate nel comando /tab");

/* ─────────────────────────── 4. ID ─────────────────────────── */
section("4. ID — usati dal JS vs presenti nell'HTML");

const idsInHtml = new Set([...html.matchAll(/id="([\w-]+)"/g)].map((m) => m[1]));
const idsUsed = uniq([...html.matchAll(/\$\("([\w-]+)"\)/g)].map((m) => m[1]));
const missingIds = idsUsed.filter((i) => !idsInHtml.has(i));
missingIds.length ? bad(`id usati dal JS ma assenti nell'HTML: ${missingIds.join(", ")}`) : ok(`tutti i ${idsUsed.length} id usati dal JS esistono`);
// Un id è "usato" se compare in uno di questi modi (la dashboard ha piú helper di accesso):
// $("id"), getElementById, querySelector/q("#id"), val("id") e le regole CSS (#id).
const idUsed = (i) =>
  new RegExp(
    `\\$\\(\"${i}\"\\)|getElementById\\(\"${i}\"\\)|(?:querySelector|q)\\(\"#${i}\"\\)|(?:val|checked)\\(\"${i}\"\\)|#${i}[^\\w-]`,
  ).test(html);
const unusedIds = [...idsInHtml].filter((i) => !idUsed(i));
if (unusedIds.length) warn(`id nell'HTML mai usati (né JS né CSS) (${unusedIds.length}): ${unusedIds.slice(0, 12).join(", ")}${unusedIds.length > 12 ? "…" : ""}`);
else ok(`tutti i ${idsInHtml.size} id del markup sono usati (JS o CSS)`);

/* ─────────────────────────── 5. CODICE MORTO ─────────────────────────── */
section("5. CODICE MORTO — funzioni definite e mai usate");

const jsBlocks = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((b) => b[1]).join("\n");
const fnNames = uniq([...jsBlocks.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]));
const dead = fnNames.filter((n) => {
  const uses = jsBlocks.split(`${n}(`).length - 1 + (jsBlocks.split(`${n}.`).length - 1);
  const asValue = new RegExp(`[^\\w]${n}[^\\w(]`).test(jsBlocks.replace(new RegExp(`function\\s+${n}\\s*\\(`, "g"), ""));
  return uses <= 0 && !asValue;
});
if (dead.length) warn(`funzioni del frontend mai chiamate (${dead.length}): ${dead.join(", ")}`);
else ok("nessuna funzione frontend inutilizzata");

// Una funzione è morta solo se il suo nome compare UNA volta sola nel file (la definizione):
// i callback passati come valore (session.subscribe(handleSessionEvent)) non hanno parentesi.
const countOccurrences = (hay, needle) => hay.split(needle).length - 1;
const mjsFns = uniq([...mjs.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]));
const mjsDead = mjsFns.filter((n) => countOccurrences(mjs, n) <= 1);
if (mjsDead.length) warn(`funzioni del server mai referenziate (${mjsDead.length}): ${mjsDead.join(", ")}`);
else ok("nessuna funzione server inutilizzata");

/* ─────────────────────────── 6. FILE CITATI ─────────────────────────── */
section("6. FILE — citati nel README e realmente presenti");

// `jsonl` prima di `json`: altrimenti «media/ask-log.jsonl» veniva letto come «...ask-log.json»
// (una cattura troncata) e il file risultava mancante.
// I percorsi citati come ESEMPIO (righe con «es.», «esempio», «indicativo») non sono file da
// verificare: illustrano il formato di un percorso, non riferiscono un file che deve esistere
// (falso positivo: l'esempio `media/report.md` nella sezione delle card di download).
const testoVerificabile = readme
  .split("\n")
  .filter((riga) => !/\bes\.|esempio|indicativo/i.test(riga))
  .join("\n");
const cited = uniq(
  [...testoVerificabile.matchAll(/`?(media\/[\w./-]+\.(?:jsonl|json|mjs|sh|md))`?/g)].map((m) => m[1]),
);
const missingFiles = cited.filter((f) => !fs.existsSync(path.join(ROOT, f)));
// Stati creati AL PRIMO USO: la guida li cita giustamente, ma su un'installazione nuova non
// esistono ancora. Sono eccezioni dichiarate, non file dimenticati.
const STATO_AL_BISOGNO = new Set(["media/progetto.json"]);
const mancantiVeri = missingFiles.filter((f) => !STATO_AL_BISOGNO.has(f));
mancantiVeri.length
  ? bad(`citati nel README ma inesistenti: ${mancantiVeri.join(", ")}`)
  : ok(`tutti i ${cited.length} file citati esistono (${missingFiles.length ? "creati al primo uso: " + missingFiles.join(", ") : "nessuna eccezione"})`);

/* ─────────────────────────── RIEPILOGO ─────────────────────────── */
section("RIEPILOGO");
console.log(`problemi: ${problems.length} · da valutare: ${notes.length}`);
if (problems.length) {
  console.log("\nDA SISTEMARE:");
  problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
}
process.exit(problems.length ? 1 : 0);
