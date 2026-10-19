#!/usr/bin/env node
/**
 * Pubblica su una Pagina Facebook tramite la Pages API ufficiale di Meta.
 *
 * Non crea Pagine: la creazione non esiste come API pubblica (si fa dall'interfaccia, da una
 * persona — vedi media/pagina-facebook-api.md). Questo strumento fa il passo successivo:
 * pubblicare sulla Pagina che già esiste.
 *
 * Uso (dalla radice dell'istanza):
 *   node skills/social-publish/publish.mjs check
 *   node skills/social-publish/publish.mjs post --text "testo del post"
 *   node skills/social-publish/publish.mjs post --text "..." --image media/foto.png
 *   node skills/social-publish/publish.mjs --dry-run post --text "prova"     (non invia nulla)
 *   node skills/social-publish/publish.mjs accounts          (pagine gestite dal token utente)
 *   node skills/social-publish/publish.mjs use <id|nome>     (scrive quella Pagina in .env)
 *
 * Credenziali (mai in chat, mai nel repository): in /root/pi-harness/.env
 *   FB_PAGE_ID=<id della Pagina>
 *   FB_PAGE_TOKEN=<token di Pagina, non dell'utente>
 *   FB_API_VERSION=v26.0        (la versione corrente indicata dalla documentazione Meta)
 *   FB_USER_TOKEN=<token utente, facoltativo>  serve solo ad `accounts` e `use`
 */
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const ENV_FILE = process.env.SOCIAL_ENV_FILE || resolve(ROOT, ".env");

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(ENV_FILE), ...process.env };
let PAGE_ID = env.FB_PAGE_ID;
const TOKEN = env.FB_PAGE_TOKEN;
// token UTENTE (non di Pagina): serve solo per elencare le Pagine e sceglierne una.
// Con un token utente si ricava il token di Pagina di ciascuna; poi quello va in FB_PAGE_TOKEN.
const USER_TOKEN = env.FB_USER_TOKEN;
const VERSION = env.FB_API_VERSION || "v26.0";
const API = `https://graph.facebook.com/${VERSION}`;

const mask = (s) => (s ? `${String(s).slice(0, 4)}…${String(s).slice(-3)} (${String(s).length} caratteri)` : "(assente)");

function needConfig() {
  if (TOKEN) return true;
  console.error(`configurazione incompleta: manca FB_PAGE_TOKEN in ${ENV_FILE}`);
  console.error("vedi media/pagina-facebook-api.md per generare il token di Pagina.");
  console.error("(per provare la costruzione della richiesta senza credenziali: aggiungi --dry-run)");
  return false;
}

/**
 * L'id della Pagina NON è indispensabile: con un token di Pagina, `GET /me` risolve alla
 * Pagina stessa, quindi l'id si ricava dalla credenziale. Resta preferibile averlo in .env
 * (una chiamata in meno e si vede subito su quale Pagina si sta scrivendo).
 */
async function resolvePageId() {
  if (PAGE_ID) return PAGE_ID;
  const me = await callApi(`${API}/me?fields=id,name&access_token=${encodeURIComponent(TOKEN)}`);
  if (!me?.id) {
    console.error("il token non identifica una Pagina: serve un token di PAGINA (vedi me/accounts)");
    process.exit(1);
  }
  PAGE_ID = me.id;
  console.log(`id della Pagina ricavato dal token: ${me.id} («${me.name}»)`);
  return PAGE_ID;
}

/** Riga `KEY=valore` in .env: sostituisce quella esistente o la aggiunge in fondo. */
function upsertEnv(key, value) {
  let righe = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  const re = new RegExp(`^\\s*${key}\\s*=`);
  const i = righe.findIndex((r) => re.test(r));
  if (i === -1) {
    while (righe.length && righe[righe.length - 1].trim() === "") righe.pop();
    righe.push(`${key}=${value}`, "");
  } else {
    righe[i] = `${key}=${value}`;
  }
  writeFileSync(ENV_FILE, righe.join("\n"), { mode: 0o600 });
}

/** Mostra l'errore di Meta in modo leggibile: il codice dice quasi sempre cosa manca. */
async function callApi(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  if (!res.ok || data?.error) {
    const e = data?.error || {};
    console.error(`errore HTTP ${res.status} · tipo ${e.type || "?"} · codice ${e.code ?? "?"}${e.error_subcode ? ` / ${e.error_subcode}` : ""}`);
    console.error(`messaggio: ${e.message || JSON.stringify(data).slice(0, 400)}`);
    process.exit(1);
  }
  return data;
}

// ---- argomenti ----
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");
const args = argv.filter((a) => a !== "--dry-run");
const cmd = args[0];
const get = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const HELP = `publish.mjs — pubblica su una Pagina Facebook (Pages API ufficiale)

  check                                  verifica che il token di Pagina funzioni
  post --text "..." [--image file.png]   pubblica un post
  accounts                               elenca le Pagine del token utente (token mascherati)
  use <id|nome>                          sceglie una Pagina e la scrive in .env

  --dry-run   mostra cosa verrebbe inviato, senza contattare Meta

Credenziali in ${ENV_FILE}: FB_PAGE_TOKEN (obbligatorio), FB_PAGE_ID (facoltativo:
si ricava dal token), FB_API_VERSION, FB_USER_TOKEN (solo per accounts/use)`;

if (!cmd || !["check", "post", "accounts", "use", "help"].includes(cmd)) {
  console.log(HELP);
  process.exit(cmd ? 2 : 0);
}
if (cmd === "help") {
  console.log(HELP);
  process.exit(0);
}

/** Token utente per gli elenchi: FB_USER_TOKEN, oppure FB_PAGE_TOKEN se è in realtà utente. */
function tokenUtente() {
  const t = USER_TOKEN || TOKEN;
  if (!t) {
    console.error(`serve un token UTENTE in ${ENV_FILE}: FB_USER_TOKEN=<token utente>`);
    console.error("un token di Pagina identifica una sola Pagina: per elencarle serve quello dell'utente.");
    console.error("(l'id della Pagina però NON serve: con un token di Pagina `check` lo ricava da s\u00e9)");
    process.exit(1);
  }
  return t;
}

/** Le Pagine su cui il token utente può agire, con i task e il token di ciascuna (mascherato). */
async function elencaPagine() {
  const t = tokenUtente();
  const data = await callApi(
    `${API}/me/accounts?fields=id,name,tasks,access_token&limit=100&access_token=${encodeURIComponent(t)}`,
  );
  return data.data || [];
}

if (cmd === "accounts") {
  const pagine = await elencaPagine();
  if (!pagine.length) {
    console.log("nessuna Pagina: il token utente non amministra Pagine (controlla i ruoli su facebook.com).");
    process.exit(0);
  }
  console.log(`${pagine.length} ${pagine.length === 1 ? "Pagina" : "Pagine"} gestite dal token utente:\n`);
  for (const p of pagine) {
    const puoPubblicare = (p.tasks || []).includes("CREATE_CONTENT") ? "può pubblicare" : "NON può pubblicare";
    console.log(`- ${p.name}`);
    console.log(`    id          : ${p.id}`);
    console.log(`    permessi    : ${(p.tasks || []).join(", ") || "(nessuno)"} → ${puoPubblicare}`);
    console.log(`    token Pagina: ${mask(p.access_token)}`);
  }
  console.log("\nPer usarne una: node skills/social-publish/publish.mjs use <id>");
  process.exit(0);
}

if (cmd === "use") {
  const quale = args[1];
  if (!quale) {
    console.error("serve l'id (o il nome esatto) della Pagina: publish.mjs use 123456789");
    console.error("per l'elenco: publish.mjs accounts");
    process.exit(2);
  }
  const pagine = await elencaPagine();
  const p =
    pagine.find((x) => x.id === String(quale)) ||
    pagine.find((x) => String(x.name || "").toLowerCase() === String(quale).toLowerCase());
  if (!p) {
    console.error(`Pagina «${quale}» non trovata fra quelle del token. Disponibili:`);
    for (const x of pagine) console.error(`  ${x.id}  ${x.name}`);
    process.exit(1);
  }
  if (!p.access_token) {
    console.error(`«${p.name}» non ha restituito un token di Pagina: manca il task CREATE_CONTENT o il ruolo.`);
    process.exit(1);
  }
  if (dryRun) {
    console.log(`[dry-run] scriverei in ${ENV_FILE}: FB_PAGE_ID=${p.id}, FB_PAGE_TOKEN=${mask(p.access_token)}`);
    process.exit(0);
  }
  upsertEnv("FB_PAGE_ID", p.id);
  upsertEnv("FB_PAGE_TOKEN", p.access_token);
  console.log(`scritto in .env: Pagina «${p.name}» (id ${p.id}), token ${mask(p.access_token)}`);
  console.log("verifica: node skills/social-publish/publish.mjs check");
  process.exit(0);
}

if (cmd === "check") {
  if (dryRun) {
    console.log("[dry-run] verifica credenziali:");
    console.log(`  FB_PAGE_ID   : ${PAGE_ID || "(assente)"}`);
    console.log(`  FB_PAGE_TOKEN: ${mask(TOKEN)}`);
    console.log(`  versione API : ${VERSION}`);
    console.log(`  file .env    : ${ENV_FILE}`);
    process.exit(0);
  }
  if (!needConfig()) process.exit(1);
  await resolvePageId();
  const data = await callApi(`${API}/${PAGE_ID}?fields=id,name,fan_count&access_token=${encodeURIComponent(TOKEN)}`);
  console.log(`autenticato come Pagina: «${data.name}» (id ${data.id}, follower ${data.fan_count ?? "?"})`);
  console.log("il token di Pagina funziona: si può pubblicare.");
  process.exit(0);
}

if (cmd === "post") {
  const text = get("--text");
  const image = get("--image");
  if (!text && !image) { console.error("serve --text (e facoltativamente --image)"); process.exit(2); }
  if (image && !existsSync(image)) { console.error(`immagine non trovata: ${image}`); process.exit(2); }

  if (dryRun) {
    console.log("[dry-run] nessuna richiesta inviata a Meta.");
    console.log(`  destinazione : ${API}/${PAGE_ID || "<FB_PAGE_ID>"}/feed`);
    console.log(`  token        : ${mask(TOKEN)}`);
    console.log(`  testo        : ${text ? `${text.length} caratteri` : "(nessuno)"}`);
    if (image) {
      const b = statSync(image).size;
      console.log(`  immagine     : ${basename(image)} (${(b / 1024).toFixed(0)} KB) → caricata come non pubblicata, poi allegata al post`);
    }
    console.log(`  chiamate previste: ${image ? 2 : 1} (upload foto + pubblicazione)`);
    process.exit(0);
  }
  if (!needConfig()) process.exit(1);
  await resolvePageId();

  let mediaFbid;
  if (image) {
    const form = new FormData();
    form.append("published", "false");
    form.append("access_token", TOKEN);
    form.append("source", new Blob([readFileSync(image)]), basename(image));
    const up = await callApi(`${API}/${PAGE_ID}/photos`, { method: "POST", body: form });
    mediaFbid = up.id;
    if (!mediaFbid) { console.error("upload riuscito ma senza id: risposta inattesa", up); process.exit(1); }
    console.log(`foto caricata (media id ${mediaFbid}), ora la pubblico nel post`);
  }

  const body = new URLSearchParams();
  body.set("access_token", TOKEN);
  if (text) body.set("message", text);
  if (mediaFbid) body.set("attached_media", JSON.stringify([{ media_fbid: mediaFbid }]));
  const post = await callApi(`${API}/${PAGE_ID}/feed`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  console.log(`pubblicato. id del post: ${post.id}`);
  console.log(`indirizzo: https://www.facebook.com/${post.id}`);
  process.exit(0);
}
