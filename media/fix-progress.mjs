/**
 * Utilità per il lavoro di correzione: aggiorna i goal della scheda Goal tramite l'API
 * (mai a mano sul file: la dashboard tiene la lista in memoria e riscrivere `goals.json`
 * mentre gira disallinea memoria e disco — vedi la nota nel README).
 *
 * Uso:
 *   node media/fix-progress.mjs show
 *   node media/fix-progress.mjs done "testo (anche solo un pezzo) del passo"
 *   node media/fix-progress.mjs check "testo (anche solo un pezzo) del controllo"
 *   node media/fix-progress.mjs checkall "testo"                # tutte le voci corrispondenti
 *   node media/fix-progress.mjs undone "testo del passo"        # riapre un passo
 *   node media/fix-progress.mjs list                           # solo id e titoli dei goal
 *
 * `checkall` serve alle voci TRASVERSALI (backup, test verdi, riavvio verificato), che stanno
 * in più goal di proposito.
 *
 * L'oggetto del goal si manda SEMPRE completo: fino alla correzione del difetto sugli
 * aggiornamenti parziali, un payload incompleto cancellerebbe descrizione, passi e checklist.
 */
import { readFileSync } from "node:fs";

const env = readFileSync("/root/pi-harness/.env", "utf8");
const password = env.match(/^DASH_PASSWORD=(.*)$/m)?.[1] ?? "";
const user = env.match(/^DASH_USER=(.*)$/m)?.[1] ?? "pi";
const base = process.env.DASH_BASE || "http://127.0.0.1:8420";
const auth = "Basic " + Buffer.from(`${user}:${password}`).toString("base64");

const [cmd, ...rest] = process.argv.slice(2);
const needle = rest.join(" ").trim().toLowerCase();

const api = async (path, init) => {
  const res = await fetch(base + path, {
    ...init,
    headers: { Authorization: auth, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(json)}`);
  return json;
};

const { goals } = await api("/api/goals");

const pick = (list, text, label) => {
  const hits = list.filter((x) => String(x.title ?? x.text ?? "").toLowerCase().includes(text));
  if (hits.length !== 1) throw new Error(`${hits.length} ${label} corrispondono a «${text}»: serve un pezzo di testo non ambiguo`);
  return hits[0];
};

if (cmd === "list" || !cmd) {
  for (const g of goals) {
    console.log(`\n${g.id} · ${g.title} [${g.status}]`);
    for (const s of g.steps) console.log(`   ${s.done ? "✔" : "·"} ${s.title}`);
    for (const c of g.checklist) console.log(`     ${c.done ? "☑" : "☐"} ${c.text}`);
  }
} else if (cmd === "show") {
  for (const g of goals) {
    const tot = g.steps.length + g.checklist.length;
    const done = g.steps.filter((s) => s.done).length + g.checklist.filter((c) => c.done).length;
    console.log(`${g.title}: ${done}/${tot}`);
    for (const s of g.steps) console.log(`  ${s.done ? "✔" : "·"} ${s.title}`);
    for (const c of g.checklist) console.log(`  ${c.done ? "☑" : "☐"} ${c.text}`);
  }
} else if (cmd === "done" || cmd === "undone" || cmd === "check" || cmd === "checkall") {
  if (!needle) throw new Error("serve il testo (anche parziale) della voce");
  const field = cmd === "check" || cmd === "checkall" ? "checklist" : "steps";
  const matches = (g) => (g[field] || []).filter((x) => String(x.title ?? x.text).toLowerCase().includes(needle));
  const targets = goals.filter((g) => matches(g).length);
  if (!targets.length) throw new Error(`nessuna voce corrisponde a «${needle}»`);
  // `checkall` serve alle voci TRASVERSALI (backup, test verdi, riavvio verificato), presenti
  // in più goal di proposito; le altre forme pretendono una corrispondenza sola.
  if (cmd !== "checkall" && targets.length !== 1) {
    throw new Error(`${targets.length} goal contengono «${needle}»: usa checkall per segnarli tutti`);
  }
  const touched = [];
  for (const goal of targets) {
    for (const item of cmd === "checkall" ? matches(goal) : goal[field]) item.done = cmd !== "undone";
    const updated = await api("/api/goals", { method: "POST", body: JSON.stringify(goal) });
    const g2 = updated.goal;
    touched.push(`${g2.title} → ${g2.steps.filter((s) => s.done).length}/${g2.steps.length} passi, ${g2.checklist.filter((c) => c.done).length}/${g2.checklist.length} controlli`);
  }
  console.log(`${cmd === "undone" ? "riaperto" : "segnato"}: ${touched.join(" | ")}`);
} else {
  throw new Error(`comando sconosciuto: ${cmd} (usa show | list | done | undone | check | checkall)`);
}
