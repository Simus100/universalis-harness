/** Chiude lo step ui-live nel goal, con l'esito verificato. */
import fs from "node:fs";

const goalsFile = "/root/pi-harness/media/goals.json";
const goals = JSON.parse(fs.readFileSync(goalsFile, "utf8"));
const g = goals.find((x) => x.id === "7af1695f7d3f5f6f");
if (!g) process.exit(console.error("goal non trovato"));

const s = g.steps.find((x) => x.id === "ui-live");
if (s) {
  s.done = true;
  s.title =
    "G2 COMPLETATA E VERIFICATA: vista live del browser (menu features, /tab live) con guarda/ferma, " +
    "prendi/restituisci il controllo, click nell'immagine (coordinate scalate sul frame reale) e tastiera. " +
    "Lo stream di agent-browser ascolta su 127.0.0.1 e accetta solo origin locali, quindi la dashboard fa da " +
    "PONTE e ripubblica i frame sulla sua SSE: nessuna porta nuova, nessuna modifica a Caddy, autenticazione " +
    "ereditata (c13 soddisfatto). Lock anti-conflitto verificato in entrambe le direzioni. " +
    "Provato end-to-end: click sull'immagine -> il browser osservato ha navigato. " +
    "Aggiunto l'ultimo frame in memoria per non mostrare una vista vuota su pagina ferma";
}
const c = g.checklist.find((x) => x.id === "c13");
if (c) {
  c.done = true;
  c.text =
    "Nessuna porta nuova su 0.0.0.0 (verificato con ss -tlnp a ogni passo) e live view che passa SOLO dalla " +
    "dashboard: lo stream resta su loopback e i frame viaggiano sulla SSE già autenticata. Nessuna modifica a Caddy";
}
g.updatedAt = Date.now();
fs.writeFileSync(goalsFile, JSON.stringify(goals, null, 2));

const env = fs.readFileSync("/root/pi-harness/.env", "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const auth = Buffer.from(`${val("DASH_USER")}:${val("DASH_PASSWORD")}`).toString("base64");
const r = await fetch("http://127.0.0.1:8420/api/goals", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
  body: JSON.stringify({ ...g, id: g.id }),
});
console.log("goal:", (await r.json()).ok ? "aggiornato" : "FALLITO");
console.log("step:", g.steps.filter((x) => x.done).length + "/" + g.steps.length, "| controlli:", g.checklist.filter((x) => x.done).length + "/" + g.checklist.length);
console.log("aperti:", g.steps.filter((x) => !x.done).map((x) => x.id).join(", "));
