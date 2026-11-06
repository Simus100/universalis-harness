/**
 * Test di ROUTING delle skill: la descrizione basta a far scattare la skill giusta?
 *
 * Perché esiste. Il blocco <available_skills> entra in ogni system prompt con name+description:
 * la descrizione è l'UNICO aggancio che il modello ha per decidere se caricare il corpo di una
 * skill. `check-skills.mjs` controlla il formato (YAML, name, «quando usarla»); qui si controlla
 * il contenuto del routing, che è la cosa che si rompe in silenzio: una descrizione riscritta
 * bene ma senza le parole che l'utente pronuncia non attiva più niente, e nessun test se ne
 * accorge. Il caso vero da cui nasce: 15 descrizioni in inglese in un harness che parla
 * italiano, e due skill che si contendevano la stessa richiesta.
 *
 * Quattro verifiche, tutte deterministiche (nessun token, nessun modello):
 *   A) CASI  — una richiesta realistica in italiano deve trovare nella descrizione della skill
 *              attesa i termini che l'utente ha usato (o un loro prefisso).
 *   B) CONFINI — dove due skill si somigliano, la descrizione deve CITARE la sorella e dire
 *              cosa non è: senza confine la scelta la decide il punteggio, non il progetto.
 *   C) CONTRATTO — formula di attivazione presente, italiano, nessun tag <…>, budget di caratteri.
 *   D) RIFERIMENTI — ogni skill citata nel system prompt («skill `x`») deve esistere davvero.
 *
 * Uso: node media/test-skill-routing.mjs
 *      DASH_SKILLS_DIR=/istanza/skills node media/test-skill-routing.mjs
 *
 * Nota: le skill di terzi (hyperframes*, media-use, …) stanno in .gitignore e possono mancare su
 * un'istanza: i casi che le riguardano vengono SALTATI, non falliti. E attenzione: `npx
 * hyperframes skills update` riscrive quelle descrizioni in inglese — se succede, questo test
 * riporta i casi rossi e il rimedio è rifare le descrizioni (il perché sta in
 * media/skill-routing-audit-2026-11-06.md).
 */
import { readFileSync } from "node:fs";
import { cwd, env } from "node:process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SKILLS_DIR = env.DASH_SKILLS_DIR || join(ROOT, "skills");

const rl = new DefaultResourceLoader({
  cwd: cwd(),
  agentDir: getAgentDir(),
  additionalSkillPaths: [SKILLS_DIR],
});
await rl.reload();
const { skills } = rl.getSkills();
const perNome = new Map(skills.map((s) => [s.name, s]));
const visibili = skills.filter((s) => !s.disableModelInvocation);

let pass = 0;
let fail = 0;
let saltati = 0;
const ok = (m) => { console.log("  ✔ " + m); pass++; };
const ko = (m) => { console.log("  ✘ " + m); fail++; };
const salta = (m) => { console.log("  ○ " + m); saltati++; };

if (!skills.length) {
  console.log(`nessuna skill caricata da ${SKILLS_DIR}`);
  process.exit(1);
}

// ---- A) casi di richiesta: le parole dell'utente devono stare nella descrizione attesa ----
// I termini sono cercati come sottostringa (minuscola): «grafic» prende grafico/grafici.
const CASI = [
  { chiede: "fammi un video di 10 secondi", attesa: "video", termini: ["video", "render"] },
  { chiede: "questo video è troppo scuro, sistemalo", attesa: "media-use", termini: ["scuro"] },
  { chiede: "guarda questa foto e dimmi cosa c'è", attesa: "immagini", termini: ["foto"] },
  { chiede: "mostrami cosa c'è in questo pdf", attesa: "immagini", termini: ["pdf"] },
  { chiede: "leggi questa fattura che ti ho caricato", attesa: "documenti", termini: ["fattura"] },
  { chiede: "preparami un preventivo in word", attesa: "documenti", termini: ["preventivo"] },
  { chiede: "estraiamo i dati da quel sito, compila il form", attesa: "browser", termini: ["sito", "form"] },
  { chiede: "pubblica un post sulla pagina facebook", attesa: "social-publish", termini: ["pubblica", "post"] },
  { chiede: "collega il mio account instagram", attesa: "social-connect", termini: ["collega"] },
  { chiede: "cosa avevamo deciso su quel file?", attesa: "memoria", termini: ["decis"] },
  { chiede: "ricordati che ho scelto il font B", attesa: "memoria", termini: ["ricordati"] },
  { chiede: "voglio un obiettivo con i passi", attesa: "obiettivi", termini: ["obiettivo"] },
  { chiede: "crea una skill nuova", attesa: "creare-skill", termini: ["skill"] },
  { chiede: "prevedi le vendite del mese prossimo", attesa: "timestral", termini: ["preved", "vendite"] },
  { chiede: "secondo te conviene procedere?", attesa: "decision-m", termini: ["conviene"] },
  { chiede: "disegnami come funziona il processo", attesa: "visual-representation", termini: ["disegna"] },
  { chiede: "fammi un report con i grafici delle vendite", attesa: "report-dataviz", termini: ["report", "grafic"] },
  { chiede: "valuta questa schermata, non si legge bene", attesa: "design-craft", termini: ["schermata"] },
  { chiede: "fammi un gioco in html", attesa: "giochi", termini: ["gioco"] },
  { chiede: "scrivi il prossimo capitolo del libro", attesa: "bookforge", termini: ["capitolo"] },
  { chiede: "smonta questo binario e dimmi cosa fa", attesa: "rea-cli", termini: ["binario"] },
  { chiede: "quanto spazio ho sul disco", attesa: "spazio-di-lavoro", termini: ["spazio"] },
  { chiede: "spiega questo articolo in un video", attesa: "faceless-explainer", termini: ["articolo"] },
  { chiede: "fammi una promo del nostro prodotto", attesa: "product-launch-video", termini: ["promo", "prodotto"] },
  { chiede: "fammi un titolo animato di 5 secondi", attesa: "motion-graphics", termini: ["titolo"] },
  { chiede: "renderizza di nuovo il video", attesa: "hyperframes", termini: ["render"] },
  { chiede: "la musica copre la voce, abbassala", attesa: "hyperframes-audio", termini: ["voce"] },
  { chiede: "il check di hyperframes non passa", attesa: "hyperframes-cli", termini: ["check"] },
  { chiede: "esiste già un blocco per il glitch?", attesa: "hyperframes-registry", termini: ["glitch"] },
  { chiede: "come si struttura una composizione?", attesa: "hyperframes-core", termini: ["composizione"] },
  { chiede: "devo animare questa scena", attesa: "hyperframes-animation", termini: ["animare"] },
  { chiede: "serve uno zoom sulla scena finale", attesa: "hyperframes-keyframes", termini: ["zoom"] },
  { chiede: "lavoriamo in studio sul progetto", attesa: "hyperframes-studio", termini: ["studio"] },
  { chiede: "che palette e che tipografia usiamo?", attesa: "hyperframes-creative", termini: ["palette"] },
  { chiede: "fammi un montaggio di più scene", attesa: "general-video", termini: ["montagg"] },
];

console.log("A) casi di richiesta (la descrizione contiene le parole dell'utente)");
for (const c of CASI) {
  const s = perNome.get(c.attesa);
  if (!s) { salta(`«${c.chiede}» → ${c.attesa}: skill non presente in questa istanza`); continue; }
  const d = s.description.toLowerCase();
  if (s.disableModelInvocation) {
    ko(`«${c.chiede}» → ${c.attesa}: la skill è nascosta al modello (disable-model-invocation), non può attivarsi`);
    continue;
  }
  const manca = c.termini.filter((t) => !d.includes(t.toLowerCase()));
  if (manca.length) ko(`«${c.chiede}» → ${c.attesa}: la descrizione non contiene ${manca.map((t) => `«${t}»`).join(", ")}`);
  else ok(`«${c.chiede}» → ${c.attesa}`);
}

// ---- B) confini: dove due skill si somigliano, ognuna deve nominare l'altra --------------
// Il modello sceglie meglio se la descrizione dice anche cosa NON è.
const CONFINI = [
  { skill: "video", cita: ["hyperframes", "immagini"], nota: "porta del video vs contratto tecnico vs guardare un video" },
  { skill: "hyperframes", cita: ["video"], nota: "il contratto tecnico non è la porta della richiesta" },
  { skill: "immagini", cita: ["documenti", "video"], nota: "guardare vs creare un documento o un video" },
  { skill: "documenti", cita: ["immagini"], nota: "modificare un documento vs guardare un PDF" },
  { skill: "browser", cita: ["immagini", "documenti"], nota: "guidare una pagina vs leggere un file caricato" },
  { skill: "media-use", cita: ["hyperframes-audio", "video"], nota: "trovare un asset vs mixare vs decidere il video" },
  { skill: "rea-cli", cita: ["reverse-engineer-anything"], nota: "porta operativa vs metodologia" },
  { skill: "motion-graphics", cita: ["general-video"], nota: "pezzo breve vs pezzo lungo" },
  { skill: "creare-skill", cita: ["documento"], nota: "una skill non è un documento" },
  { skill: "obiettivi", cita: ["pianificazioni"], nota: "goal vs pianificazioni a orario" },
];
console.log("\nB) confini fra skill vicine (ognuna nomina la sorella)");
for (const c of CONFINI) {
  const s = perNome.get(c.skill);
  if (!s) { salta(`${c.skill}: non presente in questa istanza`); continue; }
  const manca = c.cita.filter((x) => !s.description.toLowerCase().includes(x.toLowerCase()));
  if (manca.length) ko(`${c.skill} non nomina ${manca.join(", ")} — ${c.nota}`);
  else ok(`${c.skill} confina con ${c.cita.join(", ")}`);
}

// ---- C) contratto delle descrizioni visibili: attivazione, lingua, budget -----------------
console.log("\nC) contratto e budget delle descrizioni");
const TRIGGER = /(usala quando|usa quando|serve quando|usala per|usa quando|use when|use for)/i;
const ITALIANO = /\b(la|le|di|che|per|una|un|del|della|quando|non|serve|usa)\b/gi;
const TAG = /<[^>]+>/;
const BUDGET_TOTALE = 17500; // caratteri di descrizione visibili: oltre, il blocco pesa più delle informazioni che dà
let senzaTrigger = [];
let nonItaliane = [];
let conTag = [];
let lunghe = [];
for (const s of visibili) {
  if (!TRIGGER.test(s.description)) senzaTrigger.push(s.name);
  if ((s.description.match(ITALIANO) || []).length < 3) nonItaliane.push(s.name);
  if (TAG.test(s.description)) conTag.push(s.name);
  if (s.description.length > 1100) lunghe.push(`${s.name} (${s.description.length})`);
}
if (senzaTrigger.length) ko(`senza formula di attivazione (es. «Usala quando»): ${senzaTrigger.join(", ")}`);
else ok("tutte le descrizioni dicono quando attivarsi");
if (nonItaliane.length) ko(`descrizioni non in italiano (l'utente parla italiano): ${nonItaliane.join(", ")}`);
else ok("tutte le descrizioni sono in italiano");
if (conTag.length) ko(`descrizione con tag <…> (alcuni host lo rimuovono): ${conTag.join(", ")}`);
else ok("nessuna descrizione contiene tag <…>");
if (lunghe.length) ko(`descrizioni troppo lunghe: ${lunghe.join(", ")}`);
else ok("nessuna descrizione oltre 1.100 caratteri");
const totale = visibili.reduce((a, s) => a + s.description.length, 0);
if (totale > BUDGET_TOTALE) ko(`descrizioni visibili: ${totale} caratteri, sopra il budget di ${BUDGET_TOTALE}`);
else ok(`descrizioni visibili: ${totale} caratteri (budget ${BUDGET_TOTALE}), ${visibili.length} skill`);

// ---- D) riferimenti incrociati: il system prompt non deve mandare a skill inesistenti ------
// Il caso reale: il prompt diceva «leggi la skill `rizzo-flow`», che non esiste (è `decision-m`).
console.log("\nD) riferimenti del system prompt a skill esistenti");
const mjs = readFileSync(join(ROOT, "dashboard.mjs"), "utf8");
const citati = [...new Set([...mjs.matchAll(/skill \\`([a-z0-9-]+)\\`/g)].map((m) => m[1]))];
if (!citati.length) ko("nessuna skill citata nel prompt: la regex non ha trovato niente (sorgente cambiato?)");
for (const nome of citati) {
  if (perNome.has(nome)) ok(`il prompt cita \`${nome}\`: esiste`);
  else ko(`il prompt cita \`${nome}\`: NON esiste fra le skill caricate (riferimento rotto)`);
}


// ---- E) nomi di skill citati nelle descrizioni: niente nomi troncati o inesistenti --------
// Un «`-animation`» (nome abbreviato) o un ``hyperframes-foo`` non esistente è un vicolo cieco:
// il modello prova a leggerlo e non trova niente.
console.log("\nE) nomi di skill citati nelle descrizioni");
const troncati = [];
const inesistenti = [];
for (const s of visibili) {
  for (const m of s.description.matchAll(/`([^`]+)`/g)) {
    const t = m[1];
    if (/^-[a-z]/.test(t)) troncati.push(`${s.name} → \`${t}\``);
    else if (/^hyperframes(-[a-z]+)*$/.test(t) && !perNome.has(t)) inesistenti.push(`${s.name} → \`${t}\``);
  }
}
if (troncati.length) ko(`nomi abbreviati, non risolvibili: ${troncati.join(", ")}`);
else ok("nessun nome di skill abbreviato (`-animation`)");
if (inesistenti.length) ko(`riferimenti a skill inesistenti: ${inesistenti.join(", ")}`);
else ok("ogni `hyperframes…` citato in una descrizione esiste");

console.log(`\nrisultato: ${pass} ok, ${fail} falliti${saltati ? `, ${saltati} saltati` : ""}`);
process.exit(fail ? 1 : 0);
