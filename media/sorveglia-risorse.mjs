#!/usr/bin/env node
/**
 * Sorveglianza delle risorse delle istanze dell'harness per un periodo lungo.
 *
 * Perché esiste: un test di durata fatto di richieste sintetiche aggiunge carico a un servizio
 * che sta già lavorando e rischia di falsare ciò che misura. Qui si LEGGE soltanto: ogni
 * intervallo si prende RSS, CPU, file descriptor dei processi `dashboard.mjs`, lo spazio libero
 * del filesystem, la dimensione delle cartelle `media/` e l'impronta di `/api/health` (se cambia
 * senza un riavvio voluto, il processo è ripartito da solo: è il primo segnale di instabilità).
 *
 * Uso:
 *   node media/sorveglia-risorse.mjs                      # 24 ore, un campione al minuto
 *   node media/sorveglia-risorse.mjs --ore 2 --ogni 30
 *   node media/sorveglia-risorse.mjs --campioni 3 --ogni 2   # prova rapida
 *   node media/sorveglia-risorse.mjs --out /root/risorse.csv
 *
 * Esito: CSV (una riga per istanza per campione) + un riepilogo stampato alla fine con la
 * crescita di RSS e i riavvii inattesi. Non scrive nel repository: il CSV finisce in /root.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const arg = (nome, def) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const ORE = Number(arg("ore", 24));
const OGNI = Number(arg("ogni", 60));
const CAMPIONI = Number(arg("campioni", 0)) || Math.max(1, Math.round((ORE * 3600) / OGNI));
const OUT = arg("out", `/root/risorse-${new Date().toISOString().slice(0, 10)}.csv`);

const ISTANZE = [
  { nome: "principale", porta: 8420, radice: "/root/pi-harness" },
  { nome: "tester_01", porta: 8421, radice: "/root/tester_01" },
  { nome: "tester07", porta: 8422, radice: "/home/tester07" },
  { nome: "tester08", porta: 8423, radice: "/home/tester08" },
];

const leggi = (p, def = "") => {
  try { return fs.readFileSync(p, "utf8"); } catch { return def; }
};

/** PID del processo della dashboard di una certa porta (ps, non pgrep: più prevedibile). */
function pidDi(porta) {
  try {
    const out = execFileSync("ps", ["-eo", "pid,args"], { encoding: "utf8" });
    for (const riga of out.split("\n")) {
      if (riga.includes("dashboard.mjs") && new RegExp(`--port ${porta}\\b`).test(riga)) {
        return Number(riga.trim().split(/\s+/)[0]);
      }
    }
  } catch { /* ps non disponibile */ }
  return null;
}

function rssKB(pid) {
  const m = /VmRSS:\s+(\d+) kB/.exec(leggi(`/proc/${pid}/status`));
  return m ? Number(m[1]) : null;
}

/** CPU in centesimi di secondo accumulati (utime+stime dal /proc/<pid>/stat). */
function cpuTick(pid) {
  const st = leggi(`/proc/${pid}/stat`);
  const chiudi = st.lastIndexOf(")");
  if (!st || chiudi < 0) return null;
  const campi = st.slice(chiudi + 2).split(" ");
  // dopo ") " il campo 1 è lo stato: utime è il 14° campo del file → 12° di questo elenco
  return Number(campi[12]) + Number(campi[13]);
}

function fdCount(pid) {
  try { return fs.readdirSync(`/proc/${pid}/fd`).length; } catch { return null; }
}

function spazioGB(dir) {
  try {
    const st = fs.statfsSync(dir);
    return +((st.bavail * st.bsize) / 1024 ** 3).toFixed(1);
  } catch { return null; }
}

function dimMB(dir) {
  try {
    const out = execFileSync("du", ["-sm", dir], { encoding: "utf8", timeout: 20000 });
    return Number(out.split(/\s+/)[0]);
  } catch { return null; }
}

/** Credenziali dell'istanza, lette dal suo .env: servono per /api/health. Mai stampate. */
function credenziali(radice) {
  const env = leggi(`${radice}/.env`);
  const val = (k, def) => {
    const m = new RegExp(`^${k}=(.*)$`, "m").exec(env);
    return m ? m[1].trim().replace(/^"|"$/g, "") : def;
  };
  const u = val("DASH_USER", "pi"), p = val("DASH_PASSWORD", "");
  return p ? "Basic " + Buffer.from(`${u}:${p}`).toString("base64") : null;
}

async function impronta(porta, auth) {
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/api/health`, { signal: AbortSignal.timeout(4000), headers: auth ? { Authorization: auth } : {} });
    if (!r.ok) return { stato: `HTTP ${r.status}` };
    const d = await r.json();
    return { stato: "ok", codeHash: d.codeHash, pid: d.pid, spazioMB: d.spazioLiberoMB };
  } catch (e) {
    return { stato: "irraggiungibile" };
  }
}

if (!fs.existsSync(OUT)) {
  fs.writeFileSync(OUT, "istante,istanza,pid,rss_mb,cpu_sec,fd,durata_s,stato,codehash,spazio_libero_gb,media_mb\n");
}

const t0 = Date.now();
let precedente = new Map();
const storico = new Map(ISTANZE.map((i) => [i.nome, { rss: [], riavvii: 0, ultimoPid: null, ultimoHash: null, errori: 0 }]));

console.log(`sorveglianza: ${CAMPIONI} campioni ogni ${OGNI}s → ${OUT}`);
for (let n = 1; n <= CAMPIONI; n++) {
  const istante = new Date().toISOString();
  for (const ist of ISTANZE) {
    const pid = pidDi(ist.porta);
    const s = storico.get(ist.nome);
    const h = await impronta(ist.porta, credenziali(ist.radice));
    if (h.stato !== "ok") s.errori++;
    if (pid) {
      const rss = rssKB(pid);
      const cpu = cpuTick(pid);
      const prec = precedente.get(pid);
      const cpuSec = cpu != null && prec != null ? +(((cpu - prec) / 100).toFixed(1)) : "";
      precedente.set(pid, cpu);
      if (rss != null) s.rss.push(rss / 1024);
      // riavvio inatteso: PID cambiato oppure impronta del codice cambiata
      if (s.ultimoPid != null && s.ultimoPid !== pid) s.riavvii++;
      if (s.ultimoHash && h.codeHash && s.ultimoHash !== h.codeHash) s.riavvii++;
      s.ultimoPid = pid;
      if (h.codeHash) s.ultimoHash = h.codeHash;
      const riga = [istante, ist.nome, pid, rss != null ? (rss / 1024).toFixed(0) : "", cpuSec,
        fdCount(pid), Math.round((Date.now() - t0) / 1000), h.stato, h.codeHash || "",
        spazioGB(ist.radice), n === 1 || n % 10 === 0 ? dimMB(ist.radice) : ""].join(",");
      fs.appendFileSync(OUT, riga + "\n");
      console.log(`  ${ist.nome.padEnd(11)} pid ${String(pid).padEnd(7)} RSS ${rss != null ? (rss / 1024).toFixed(0) : "?"} MB  cpu ${cpuSec}s  fd ${fdCount(pid)}  ${h.stato}`);
    } else {
      fs.appendFileSync(OUT, [istante, ist.nome, "", "", "", "", Math.round((Date.now() - t0) / 1000), "processo assente", "", spazioGB(ist.radice), ""].join(",") + "\n");
      console.log(`  ${ist.nome.padEnd(11)} PROCESSO ASSENTE`);
    }
  }
  if (n < CAMPIONI) await new Promise((r) => setTimeout(r, OGNI * 1000));
}

console.log("\n=== riepilogo ===");
for (const [nome, s] of storico) {
  const r = s.rss;
  if (!r.length) { console.log(`${nome}: nessun campione`); continue; }
  const primo = r[0], ultimo = r[r.length - 1];
  const max = Math.max(...r);
  const crescita = ultimo - primo;
  console.log(`${nome}: RSS ${primo.toFixed(0)} → ${ultimo.toFixed(0)} MB (max ${max.toFixed(0)}, crescita ${crescita >= 0 ? "+" : ""}${crescita.toFixed(0)} MB), riavvii inattesi ${s.riavvii}, campioni con servizio non raggiungibile ${s.errori}`);
}
console.log(`\nCSV: ${OUT}`);
