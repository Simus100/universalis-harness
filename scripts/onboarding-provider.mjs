#!/usr/bin/env node
/**
 * Onboarding dei provider — quello che deve fare chi scarica l'harness.
 *
 *   node scripts/onboarding-provider.mjs            # stato: cosa c'è, cosa manca, cosa fare
 *   node scripts/onboarding-provider.mjs --google   # scrive il provider Google in models.json
 *   node scripts/onboarding-provider.mjs --tutto    # tutti i provider del catalogo
 *   node scripts/onboarding-provider.mjs --verifica # chiama i provider e dice se la chiave va
 *
 * Perché esiste: le scelte su QUALI modelli mostrare sono codice (`media/providers.mjs`), ma il
 * runtime le legge da `~/.pi/agent/models.json`, che è configurazione della macchina. Questo
 * script è il ponte: idempotente, non distruttivo (aggiunge/aggiorna solo le proprie voci) e
 * SENZA segreti (nel file va `apiKey: "$GEMINI_API_KEY"`, cioè un riferimento all'ambiente).
 *
 * La chiave si mette in `.env` (una riga, `GEMINI_API_KEY=...`) oppure dal pannello «chiavi»
 * della dashboard. Qui non si chiede e non si scrive nessuna chiave.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { configGoogle, PROVIDER_GESTITI } from "../media/providers.mjs";

const argv = process.argv.slice(2);
const ha = (f) => argv.includes(`--${f}`);

// Chi lancia lo script a mano (senza systemd) non ha le variabili del .env: qui si caricano
// le righe `CHIAVE=valore` che mancano nell'ambiente. Non si SOVRASCRIVE mai l'ambiente.
function caricaEnv() {
  const file = join(dirname(new URL(import.meta.url).pathname), "..", ".env");
  let testo = "";
  try {
    testo = readFileSync(file, "utf8");
  } catch {
    return 0;
  }
  let n = 0;
  for (const riga of testo.split(/\r?\n/)) {
    const m = riga.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, nome, valoreGrezzo] = m;
    if (process.env[nome] !== undefined) continue;
    const valore = valoreGrezzo.replace(/^["']|["']$/g, "").trim();
    if (valore) {
      process.env[nome] = valore;
      n += 1;
    }
  }
  return n;
}
caricaEnv();

const AGENT_DIR = process.env.PI_AGENT_DIR || join(homedir(), ".pi", "agent");
const MODELS = join(AGENT_DIR, "models.json");

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
};

function leggiConfig() {
  try {
    return JSON.parse(readFileSync(MODELS, "utf8"));
  } catch {
    return { providers: {} };
  }
}

function scriviConfig(cfg) {
  mkdirSync(AGENT_DIR, { recursive: true });
  if (existsSync(MODELS)) copyFileSync(MODELS, `${MODELS}.bak-${Date.now()}`);
  const tmp = `${MODELS}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  // rinomina atomica: un models.json troncato a metà romperebbe l'avvio dell'harness
  renameSync(tmp, MODELS);
  try {
    unlinkSync(tmp);
  } catch {
    /* il rename l'ha già portato via */
  }
  console.log(c.g(`scritto ${MODELS}`));
}

/** Le chiavi le legge il runtime, non questo script: qui si guarda solo se ci sono. */
function statoChiavi() {
  const env = (n) => String(process.env[n] || "").trim().length > 0;
  let auth = {};
  try {
    auth = JSON.parse(readFileSync(join(AGENT_DIR, "auth.json"), "utf8"));
  } catch {
    auth = {};
  }
  return PROVIDER_GESTITI.map((p) => {
    const daEnv = env(p.envVar);
    const daFile = !!auth[p.id];
    return { ...p, configurata: daEnv || daFile, fonte: daEnv ? "env" : daFile ? "auth.json" : "" };
  });
}

function stato() {
  console.log(c.b("\nProvider dell'harness\n"));
  const cfg = leggiConfig();
  for (const p of statoChiavi()) {
    const inModels = !!cfg.providers?.[p.id];
    const chiave = p.configurata ? c.g(`chiave presente (${p.fonte})`) : c.r(`chiave MANCANTE`);
    console.log(`  ${p.id.padEnd(9)} ${p.label}`);
    console.log(`            ${chiave} · ${inModels ? c.g("configurato in models.json") : c.y("non in models.json")}`);
    console.log(c.d(`            chiave: ${p.envVar} (in .env) · dove: ${p.dove}`));
    console.log(c.d(`            ${p.nota}`));
  }
  console.log(
    "\n" +
      c.b("Cosa fare:") +
      "\n  1. metti la tua chiave in " +
      c.y(".env") +
      " (es. `GEMINI_API_KEY=…`) oppure nel pannello «chiavi» della dashboard\n" +
      "  2. `node scripts/onboarding-provider.mjs --google`  → scrive il provider in models.json\n" +
      "  3. `node scripts/onboarding-provider.mjs --verifica` → controlla che la chiave risponda\n" +
      "  4. riavvia la dashboard: `scripts/restart-dashboard.sh`\n",
  );
}

function applica(quali) {
  const cfg = leggiConfig();
  cfg.providers = cfg.providers || {};
  let toccato = 0;
  if (quali.includes("google")) {
    cfg.providers.google = { ...(cfg.providers.google || {}), ...configGoogle() };
    toccato += 1;
  }
  if (quali.includes("deepseek")) {
    // DeepSeek è già gestito dal catalogo del runtime: qui si garantisce solo il riferimento
    // alla chiave, senza toccare baseUrl/modelli (che sono del runtime).
    cfg.providers.deepseek = { ...(cfg.providers.deepseek || {}), apiKey: "$DEEPSEEK_API_KEY" };
    toccato += 1;
  }
  if (!toccato) {
    console.log(c.y("niente da fare: --google, --deepseek oppure --tutto"));
    return;
  }
  scriviConfig(cfg);
}

async function verifica() {
  const { verificaChiave, chiaveGoogle, disponibile } = await import("../media/gemini-client.mjs");
  if (!disponibile()) {
    console.log(c.y("Google: nessuna chiave configurata (GEMINI_API_KEY o auth.json)"));
  } else {
    try {
      const r = await verificaChiave(chiaveGoogle());
      console.log(c.g(`Google: chiave valida (${r.modelli} modelli visibili)`));
    } catch (e) {
      console.log(c.r(`Google: chiave NON valida — ${e?.message || e}`));
    }
  }
  const dk = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!dk) {
    console.log(c.y("DeepSeek: nessuna chiave in DEEPSEEK_API_KEY"));
    return;
  }
  try {
    const res = await fetch("https://api.deepseek.com/models", { headers: { Authorization: `Bearer ${dk}` } });
    console.log(res.ok ? c.g(`DeepSeek: chiave valida (HTTP ${res.status})`) : c.r(`DeepSeek: HTTP ${res.status}`));
  } catch (e) {
    console.log(c.r(`DeepSeek: non raggiungibile — ${e?.message || e}`));
  }
}

if (ha("google")) applica(["google"]);
else if (ha("deepseek")) applica(["deepseek"]);
else if (ha("tutto")) applica(["google", "deepseek"]);
if (ha("verifica")) await verifica();
if (!argv.length) stato();
