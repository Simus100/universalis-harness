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
 *
 * Credenziali (mai in chat, mai nel repository): in /root/pi-harness/.env
 *   FB_PAGE_ID=<id della Pagina>
 *   FB_PAGE_TOKEN=<token di Pagina, non dell'utente>
 *   FB_API_VERSION=v23.0        (la versione corrente indicata dalla documentazione Meta)
 */
import { readFileSync, existsSync, statSync } from "node:fs";
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
const PAGE_ID = env.FB_PAGE_ID;
const TOKEN = env.FB_PAGE_TOKEN;
const VERSION = env.FB_API_VERSION || "v23.0";
const API = `https://graph.facebook.com/${VERSION}`;

const mask = (s) => (s ? `${String(s).slice(0, 4)}…${String(s).slice(-3)} (${String(s).length} caratteri)` : "(assente)");

function needConfig() {
  const mancanti = [];
  if (!PAGE_ID) mancanti.push("FB_PAGE_ID");
  if (!TOKEN) mancanti.push("FB_PAGE_TOKEN");
  if (!mancanti.length) return true;
  console.error(`configurazione incompleta: manca ${mancanti.join(", ")} in ${ENV_FILE}`);
  console.error("vedi media/pagina-facebook-api.md per generare il token di Pagina.");
  console.error("(per provare la costruzione della richiesta senza credenziali: aggiungi --dry-run)");
  return false;
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

  --dry-run   mostra cosa verrebbe inviato, senza contattare Meta

Credenziali in ${ENV_FILE}: FB_PAGE_ID, FB_PAGE_TOKEN, FB_API_VERSION`;

if (!cmd || !["check", "post", "help"].includes(cmd)) {
  console.log(HELP);
  process.exit(cmd ? 2 : 0);
}
if (cmd === "help") {
  console.log(HELP);
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
