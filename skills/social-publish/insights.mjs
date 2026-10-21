#!/usr/bin/env node
/**
 * Legge gli insight di una Pagina Facebook e ne conserva la STORIA.
 *
 * Perché esiste: la Pagina ha pochi follower, quindi i numeri assoluti non dicono nulla e ogni
 * scelta (formato, orario, quanto pubblicare) fatta «a naso» è una scommessa. Questo strumento non
 * aumenta la reach: rende misurabile quello che succede, così la decisione si prende su un tasso e
 * non su un'impressione.
 *
 * COSA META CONCEDE OGGI (verificato sulla Pagina Aion il 21/10/2026, Graph API v26.0):
 *   metriche di Pagina   page_media_view, page_post_engagements, page_follows   (period=day)
 *   metrica per post     post_media_view  (lifetime)  + reazioni, commenti, condivisioni
 *   NON più disponibili  page_impressions, page_impressions_unique, post_impressions_unique:
 *                        deprecate da Meta. Chiedendole l'API risponde «must be a valid insights
 *                        metric», non «permesso mancante» — è utile saperlo prima di cercare
 *                        permessi che non c'entrano.
 *
 * Uso (dalla radice dell'istanza):
 *   node skills/social-publish/insights.mjs raccogli           # scarica e salva (idempotente)
 *   node skills/social-publish/insights.mjs report             # ultimi 7 giorni, a schermo
 *   node skills/social-publish/insights.mjs report --giorni 14 --scrivi   # e salva un .md
 *   node skills/social-publish/insights.mjs storico            # la serie salvata, in breve
 *   --profilo <nome>   usa social/<nome>.env invece di .env
 *
 * Dove finisce: media/social-insights/<id-pagina>.json — dati di performance, NON pubblicati
 * (esclusi da .gitignore). Le credenziali si leggono da .env / social/<nome>.env e non vengono
 * mai stampate.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT_DIR = resolve(ROOT, "media/social-insights");

// Un campione sotto questa soglia non autorizza conclusioni: si dichiara invece di concludere.
const MIN_CAMPIONE = 20;

const argv = process.argv.slice(2);
const iProf = argv.indexOf("--profilo");
const PROFILO = ((iProf === -1 ? "" : argv[iProf + 1]) || process.env.SOCIAL_PROFILE || "").trim();
if (PROFILO && !/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(PROFILO)) {
  console.error(`nome di profilo non valido: «${PROFILO}»`);
  process.exit(2);
}
const ENV_FILE =
  process.env.SOCIAL_ENV_FILE ||
  (PROFILO ? resolve(ROOT, "social", `${PROFILO}.env`) : resolve(ROOT, ".env"));

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
const TOKEN = env.FB_PAGE_TOKEN;
const VERSION = env.FB_API_VERSION || "v26.0";
const API = `https://graph.facebook.com/${VERSION}`;

if (!TOKEN) {
  console.error(`configurazione incompleta: manca FB_PAGE_TOKEN in ${ENV_FILE}`);
  process.exit(2);
}

async function api(path, params) {
  const qs = new URLSearchParams(params || {});
  const r = await fetch(`${API}${path}${qs.toString() ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const j = await r.json();
  if (j.error) {
    throw new Error(`Graph API ${j.error.code}: ${j.error.message}`);
  }
  return j;
}

// ── dati ────────────────────────────────────────────────────────────────────────────────────────

async function pagina() {
  const j = await api("/me", { fields: "id,name,followers_count,fan_count" });
  if (!j.id) throw new Error("il token non identifica una Pagina");
  return j;
}

/** Serie giornaliera delle tre metriche che Meta concede ancora. */
async function seriePagina(giorni) {
  const j = await api(`/${await pageId()}/insights`, {
    metric: "page_media_view,page_post_engagements,page_follows",
    period: "day",
    date_preset: `last_${Math.min(giorni, 90)}d`,
  });
  const perGiorno = new Map();
  const riga = (d) => {
    if (!perGiorno.has(d)) perGiorno.set(d, { data: d, mediaView: 0, engagements: 0, follower: null });
    return perGiorno.get(d);
  };
  for (const m of j.data || []) {
    for (const v of m.values || []) {
      const d = String(v.end_time).slice(0, 10);
      const r = riga(d);
      if (m.name === "page_media_view") r.mediaView = Number(v.value) || 0;
      if (m.name === "page_post_engagements") r.engagements = Number(v.value) || 0;
      if (m.name === "page_follows") r.follower = Number(v.value) || 0;
    }
  }
  return [...perGiorno.values()].sort((a, b) => a.data.localeCompare(b.data));
}

let _pageId = null;
async function pageId() {
  if (_pageId) return _pageId;
  _pageId = env.FB_PAGE_ID || (await pagina()).id;
  return _pageId;
}

/** Post pubblicati, con reach lifetime e le interazioni che il post porta con sé. */
async function postPubblicati(limite = 50) {
  const j = await api(`/${await pageId()}/posts`, {
    fields:
      "id,created_time,permalink_url,message,attachments{media_type}" +
      ",shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)" +
      ",insights.metric(post_media_view)",
    limit: String(limite),
  });
  return (j.data || []).map((p) => {
    const ins = (p.insights?.data || []).find((d) => d.name === "post_media_view");
    return {
      id: p.id,
      creato: p.created_time,
      testo: (p.message || "").slice(0, 120),
      tipo: p.attachments?.data?.[0]?.media_type || "testo",
      permalink: p.permalink_url || "",
      reach: ins ? Number(ins.values?.[0]?.value) || 0 : null,
      reazioni: p.reactions?.summary?.total_count || 0,
      commenti: p.comments?.summary?.total_count || 0,
      condivisioni: p.shares?.count || 0,
    };
  });
}

function fileDati(id) {
  return resolve(OUT_DIR, `${id}.json`);
}

function leggi(id) {
  const f = fileDati(id);
  if (!existsSync(f)) return { pagina: {}, raccolte: [], post: {} };
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    console.error(`il file ${f} non è JSON valido: lo tratto come vuoto (${e.message})`);
    return { pagina: {}, raccolte: [], post: {} };
  }
}

function scrivi(id, dati) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(fileDati(id), JSON.stringify(dati, null, 2) + "\n");
}

// ── comandi ────────────────────────────────────────────────────────────────────────────────────

async function raccogli() {
  const p = await pagina();
  const dati = leggi(p.id);
  const oggi = new Date().toISOString().slice(0, 10);

  dati.pagina = { id: p.id, nome: p.name, follower: p.followers_count ?? null, fan: p.fan_count ?? null };

  const serie = await seriePagina(14);
  // una voce per giorno: la più recente sostituisce quella di oggi, le altre restano com'erano
  for (const r of serie) {
    const i = dati.raccolte.findIndex((x) => x.data === r.data);
    const voce = {
      data: r.data,
      mediaView: r.mediaView,
      engagements: r.engagements,
      follower: r.follower,
      aggiornato: r.data === oggi ? new Date().toISOString() : dati.raccolte[i]?.aggiornato || null,
    };
    if (i === -1) dati.raccolte.push(voce);
    else dati.raccolte[i] = { ...dati.raccolte[i], ...voce };
  }
  dati.raccolte.sort((a, b) => a.data.localeCompare(b.data));
  // la serie della Pagina dà i follower come totale del giorno; il dato puntuale è più fresco
  if (dati.pagina.follower == null) dati.pagina.follower = serie.at(-1)?.follower ?? null;

  const post = await postPubblicati();
  // i nuovi si contano PRIMA di sovrascrivere, altrimenti risultano sempre zero
  const nuovi = post.filter((q) => !dati.post[q.id]?.creato).length;
  for (const q of post) {
    const prima = dati.post[q.id] || {};
    dati.post[q.id] = { ...prima, ...q, ultimo: new Date().toISOString() };
  }

  scrivi(p.id, dati);
  console.log(`✓ raccolto: ${p.name} (${p.id})`);
  console.log(`  serie: ${serie.length} giorni (dal ${serie[0]?.data ?? "?"} al ${serie.at(-1)?.data ?? "?"})`);
  console.log(`  post conosciuti: ${Object.keys(dati.post).length} (nuovi in questa raccolta: ${nuovi})`);
  console.log(`  salvato in: ${fileDati(p.id)}`);
}

function mmgg(iso) {
  return String(iso).slice(5, 10);
}

function report({ giorni = 7, scrivi: salvaFile = false } = {}) {
  // l'id si ricava dal file più recente se non c'è in .env
  const id = env.FB_PAGE_ID || elencoFile()[0];
  if (!id) {
    console.error("nessun dato salvato: lancia prima `raccogli`");
    process.exit(1);
  }
  const dati = leggi(id);
  const taglio = new Date(Date.now() - giorni * 86400_000).toISOString().slice(0, 10);
  const serie = (dati.raccolte || []).filter((r) => r.data >= taglio);
  const post = Object.values(dati.post || {}).filter((p) => String(p.creato).slice(0, 10) >= taglio);

  const somma = (a, k) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const mediaView = somma(serie, "mediaView");
  const engagements = somma(serie, "engagements");
  const tasso = mediaView ? (engagements / mediaView) * 100 : null;
  const followerInizio = serie.find((r) => r.follower != null)?.follower ?? null;
  const followerFine = dati.pagina?.follower ?? serie.at(-1)?.follower ?? null;

  const righe = [];
  const p = (s = "") => righe.push(s);

  p(`# ${dati.pagina?.nome || "Pagina"} — ultimi ${giorni} giorni`);
  p();
  p("| Misura | Valore |");
  p("|---|---|");
  p(`| Visualizzazioni del contenuto | ${mediaView} |`);
  p(`| Interazioni | ${engagements} |`);
  p(`| Tasso interazioni / visualizzazioni | ${tasso == null ? "n/d" : tasso.toFixed(2) + "%"} |`);
  p(`| Follower: da → a | ${followerInizio ?? "?"} → ${followerFine ?? "?"} (${followerFine != null && followerInizio != null ? (followerFine - followerInizio >= 0 ? "+" : "") + (followerFine - followerInizio) : "n/d"}) |`);
  p(`| Post pubblicati | ${post.length} |`);
  p();

  const conReach = post.filter((q) => q.reach != null);
  if (conReach.length) {
    const perInterazione = conReach.map((q) => ({
      ...q,
      interazioni: q.reazioni + q.commenti + q.condivisioni,
    }));
    const ordinati = [...perInterazione].sort((a, b) => b.reach - a.reach);
    p("## Post per reach");
    p();
    p("| Post | Tipo | Reach | Reaz. | Comm. | Cond. | Interaz./reach |");
    p("|---|---|---|---|---|---|---|");
    for (const q of ordinati) {
      const t = q.reach ? ((q.interazioni / q.reach) * 100).toFixed(1) + "%" : "n/d";
      p(`| ${mmgg(q.creato)} ${String(q.testo).slice(0, 42).replace(/\|/g, "/")} | ${q.tipo} | ${q.reach} | ${q.reazioni} | ${q.commenti} | ${q.condivisioni} | ${t} |`);
    }
    p();

    // fasce orarie: è la domanda «3 al giorno servono?» ridotta a un numero
    const perOra = new Map();
    for (const q of perInterazione) {
      const ora = new Date(q.creato).toISOString().slice(11, 16);
      const b = perOra.get(ora) || { n: 0, reach: 0, inter: 0 };
      b.n += 1;
      b.reach += q.reach || 0;
      b.inter += q.interazioni;
      perOra.set(ora, b);
    }
    p("## Per orario di pubblicazione (UTC)");
    p();
    p("| Ora | Post | Reach medio | Interazioni |");
    p("|---|---|---|---|");
    for (const [ora, b] of [...perOra.entries()].sort()) {
      p(`| ${ora} | ${b.n} | ${Math.round(b.reach / b.n)} | ${b.inter} |`);
    }
    p();
    const senzaReach = perInterazione.filter((q) => !q.reach).length;
    if (senzaReach) p(`⚠ ${senzaReach} post con reach 0: non sono stati consegnati a nessuno, non «hanno reso poco».`);
    if (conReach.length < MIN_CAMPIONE) {
      p();
      p(`Campione piccolo (${conReach.length} post): questi numeri servono a decidere cosa PROVARE, non a concludere cosa funziona. Sotto i ${MIN_CAMPIONE} post la differenza fra due formati è indistinguibile dal caso.`);
    }
  } else {
    p("Nessun post con reach nella finestra: lancia `raccogli` dopo aver pubblicato qualcosa.");
  }

  const testo = righe.join("\n") + "\n";
  console.log(testo);
  if (salvaFile) {
    mkdirSync(OUT_DIR, { recursive: true });
    const f = resolve(OUT_DIR, `report-${new Date().toISOString().slice(0, 10)}.md`);
    writeFileSync(f, testo);
    console.log(`salvato in: ${f}`);
  }
}

function elencoFile() {
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

function storico() {
  const id = env.FB_PAGE_ID || elencoFile()[0];
  if (!id) {
    console.error("nessun dato salvato: lancia prima `raccogli`");
    process.exit(1);
  }
  const dati = leggi(id);
  console.log(`${dati.pagina?.nome || id} · follower ${dati.pagina?.follower ?? "?"} · ${Object.keys(dati.post || {}).length} post · ${(dati.raccolte || []).length} giorni`);
  for (const r of (dati.raccolte || []).slice(-14)) {
    console.log(`  ${r.data}  visualizzazioni ${String(r.mediaView).padStart(4)}  interazioni ${String(r.engagements).padStart(3)}  follower ${r.follower ?? "?"}`);
  }
}

// ── avvio ──────────────────────────────────────────────────────────────────────────────────────

const comando = argv.find((a) => !a.startsWith("--") && a !== PROFILO);
const num = (nome, def) => {
  const i = argv.indexOf(nome);
  return i === -1 ? def : Number(argv[i + 1]) || def;
};

try {
  if (comando === "raccogli") await raccogli();
  else if (comando === "report") report({ giorni: num("--giorni", 7), scrivi: argv.includes("--scrivi") });
  else if (comando === "storico") storico();
  else {
    console.log(`uso:
  node skills/social-publish/insights.mjs raccogli        scarica e salva (idempotente: si può lanciare più volte al giorno)
  node skills/social-publish/insights.mjs report          ultimi 7 giorni a schermo (--giorni N, --scrivi)
  node skills/social-publish/insights.mjs storico         la serie salvata, in breve
  --profilo <nome>  usa social/<nome>.env invece di .env`);
  }
} catch (e) {
  console.error(`✘ ${e.message}`);
  process.exit(1);
}
