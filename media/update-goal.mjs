/** Aggiorna il goal: chiude gli step verificati senza riscrivere tutto. */
import fs from "node:fs";
import { createRequire } from "node:module";

const goalsFile = "/root/pi-harness/media/goals.json";
const goals = JSON.parse(fs.readFileSync(goalsFile, "utf8"));
const g = goals.find((x) => x.id === "7af1695f7d3f5f6f");
if (!g) {
  console.error("goal non trovato");
  process.exit(1);
}

const setStep = (id, done, title) => {
  const s = g.steps.find((x) => x.id === id);
  if (!s) return console.error("step non trovato:", id);
  s.done = done;
  if (title) s.title = title;
};
const setCheck = (id, done, text) => {
  const c = g.checklist.find((x) => x.id === id);
  if (!c) return console.error("check non trovato:", id);
  c.done = done;
  if (text) c.text = text;
};

setStep(
  "firewall-utente",
  true,
  "STEP 0 COMPLETATO: ufw attivo (default deny in ingresso) con 22/80/443 consentite su v4 e v6, verificato DALL'ESTERNO (check-host.net: 9999 non consentita = timeout da Milano e Bucarest; 443 = risposta in 46ms; 22 = aperta da Germania, Slovenia e USA, quindi l'accesso SSH del proprietario è confermato). Utente pi-browser (uid 997, senza sudo) e profilo AppArmor attivi"
);
setCheck(
  "c14",
  true,
  "Firewall ATTIVO E VERIFICATO: ufw default deny in ingresso con 22/80/443 su v4+v6; prova esterna indipendente (non locale, perché il traffico verso il proprio IP passa da 'lo' e non attraversa ufw): porta non consentita bloccata, 443 e 22 raggiungibili, SSH del proprietario confermato aperto"
);

g.updatedAt = Date.now();
fs.writeFileSync(goalsFile, JSON.stringify(goals, null, 2));

// POST all'API per allineare memoria e file
const env = fs.readFileSync("/root/pi-harness/.env", "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, "m")) || [])[1]?.trim().replace(/^"|"$/g, "");
const auth = Buffer.from(`${val("DASH_USER")}:${val("DASH_PASSWORD")}`).toString("base64");

const res = await fetch("http://127.0.0.1:8420/api/goals", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
  body: JSON.stringify({ ...g, id: g.id }),
});
const out = await res.json();
console.log("aggiornamento:", out.ok ? "OK" : "FALLITO");
console.log("step chiusi:", g.steps.filter((s) => s.done).map((s) => s.id).join(", "));
console.log("controlli chiusi:", g.checklist.filter((c) => c.done).map((c) => c.id).join(", "));
