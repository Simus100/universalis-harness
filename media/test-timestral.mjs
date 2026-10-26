/**
 * TEST + AUDIT del sistema previsionale (Timestral): motore, client, interfaccia, documentazione.
 *
 * Perché esiste: la vista «Previsioni» dichiara numeri (mediana, quantili, copertura, skill) su
 * cui una persona decide. Un errore qui non è un difetto grafico: è una decisione presa su un
 * numero sbagliato. Questo test verifica il CONTRATTO e la COERENZA, non la presenza delle cose:
 *
 *   1. client:  lettura CSV (separatori, numeri all'italiana, righe rotte) e analisi descrittiva
 *   2. servizio: contratto delle rotte, monotonia dei quantili, determinismo, casi limite
 *   3. backtest:  nessun look-ahead (il futuro non deve entrare nel contesto), coperture sensate
 *   4. coerenza: UI ↔ API ↔ documentazione (campi letti che esistono, pulsanti citati che esistono)
 *
 * Uso:   node media/test-timestral.mjs            (tutto; il servizio deve essere acceso)
 *        node media/test-timestral.mjs --senza-servizio   (solo parti 1 e 4)
 * Esce con codice 1 se un controllo fallisce.
 */
import { readFileSync } from "node:fs";
import { parseCsv, analizza } from "./timestral-client.mjs";

const ROOT = "/root/pi-harness";
const BASE = `http://127.0.0.1:${process.env.TIMESTRAL_PORT || 8018}`;
const SENZA_SERVIZIO = process.argv.includes("--senza-servizio");

let pass = 0, fail = 0, saltati = 0;
const ok = (m) => { console.log("  ✔ " + m); pass += 1; };
const ko = (m) => { console.log("  ✘ " + m); fail += 1; };
const salta = (m) => { console.log("  · " + m + " (saltato)"); saltati += 1; };
const check = (desc, cond, extra = "") => (cond ? ok(desc) : ko(`${desc}${extra ? " — " + extra : ""}`));
const section = (t) => console.log(`\n== ${t} ==`);
const num = (x) => Number(x);

function leggiToken() {
  if (process.env.TIMESTRAL_TOKEN) return process.env.TIMESTRAL_TOKEN.trim();
  try { return readFileSync("/etc/timestral/token", "utf8").trim(); } catch { return ""; }
}

async function chiama(percorso, corpo, { token = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-Timestral-Token"] = leggiToken();
  const res = await fetch(BASE + percorso, { method: "POST", headers, body: JSON.stringify(corpo) });
  let json = null;
  try { json = await res.json(); } catch { /* corpo non JSON */ }
  return { status: res.status, json };
}

/* serie sintetiche: il punto è che il risultato ATTESO si sa prima di guardarlo */
const rumore = (n, centro = 100, ampiezza = 1, seme = 7) => {
  let s = seme;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  return Array.from({ length: n }, () => centro + (rnd() - 0.5) * 2 * ampiezza);
};

/* ───────────────────────── 1. CLIENT: CSV e analisi ───────────────────────── */
section("1. client — lettura CSV");
{
  const a = parseCsv("data,valore\n2026-01-01,10\n2026-01-02,11.5\n");
  check("virgola con intestazione: 2 punti", a.punti.length === 2, JSON.stringify(a.punti));
  check("valore decimale con punto", num(a.punti[1][1]) === 11.5, JSON.stringify(a.punti[1]));

  const b = parseCsv("2026-01-01;10\n2026-01-02;12\n");
  check("punto e virgola senza intestazione: 2 punti", b.punti.length === 2);
  check("separatore riconosciuto", b.separatore === ";");

  const c = parseCsv("data\tvalore\n2026-01-01\t10\n2026-01-02\t12\n");
  check("tab riconosciuto", c.separatore === "tab" && c.punti.length === 2);

  const d = parseCsv("data,valore\n2026-01-01,\"1.234,56\"\n2026-01-02,1235.5\n");
  check("numero all'italiana 1.234,56 → 1234.56", num(d.punti[0][1]) === 1234.56, String(d.punti[0][1]));

  const e = parseCsv("data,valore\n2026-01-01,10\nnon-una-data,abc\n2026-01-03,12\n");
  check("riga non numerica CONTATA, non ignorata in silenzio", e.scartate === 1, `scartate=${e.scartate}`);
  check("i punti validi restano 2", e.punti.length === 2);

  let erroreVuoto = null;
  try { parseCsv(""); } catch (x) { erroreVuoto = x.message; }
  check("CSV vuoto → errore esplicito", !!erroreVuoto, erroreVuoto || "nessun errore");

  let erroreCol = null;
  try { parseCsv("data,valore\n2026-01-01,10\n", { valueColumn: "prezzo" }); } catch (x) { erroreCol = x.message; }
  check("colonna inesistente → errore che dice il nome", !!erroreCol && /prezzo/.test(erroreCol), erroreCol || "");

  const ord = parseCsv("data,valore\n2026-01-03,3\n2026-01-01,1\n2026-01-02,2\n");
  check("ordine delle righe preservato (nessun riordino nascosto)", ord.punti.map((p) => p[1]).join(",") === "3,1,2");
}

section("1b. client — analisi descrittiva");
{
  const retta = Array.from({ length: 60 }, (_, i) => 2 * i + 1);
  const a = analizza({ values: retta });
  check("retta y=2i+1: pendenza 2", Math.abs(a.tendenza_per_passo - 2) < 1e-6, String(a.tendenza_per_passo));
  check("retta: R² = 1", num(a.tendenza_r2) > 0.999, String(a.tendenza_r2));
  check("retta: nessuna anomalia inventata", a.anomalie.length === 0, `${a.anomalie.length} anomalie`);

  const costante = analizza({ values: Array(40).fill(5) });
  check("serie costante: pendenza 0 e nessun crash", Math.abs(costante.tendenza_per_passo) < 1e-9);
  check("serie costante: variazione tipica 0", num(costante.escursione_media_pct) === 0, String(costante.escursione_media_pct));

  // sinusoidale con periodo 24 dichiarata in ore: il ciclo deve essere TROVATO
  const seno = Array.from({ length: 240 }, (_, i) => 50 + 10 * Math.sin((2 * Math.PI * i) / 24));
  const s = analizza({ values: seno, unita: "ore" });
  const periodiTrovati = [s.decomp && s.decomp.periodo_1, s.ciclo && s.ciclo.lag].filter((x) => x);
  check("sinusoide 24 ore: il ciclo 24 viene trovato", periodiTrovati.includes(24), JSON.stringify(periodiTrovati));
  check("sinusoide: il ciclo spiega quasi tutta la varianza", num(s.decomp.forze.stagionale_1_pct) > 80, `${s.decomp.forze.stagionale_1_pct}%`);

  // ciclo VERO: settimanale dentro il rumore. Deve trovarlo, con la quota spiegata alta.
  let seme2 = 3;
  const rnd2 = () => { seme2 = (seme2 * 1103515245 + 12345) % 2147483648; return seme2 / 2147483648; };
  const settimanale = Array.from({ length: 210 }, (_, i) => 100 + 8 * Math.sin((2 * Math.PI * i) / 7) + (rnd2() - 0.5) * 4);
  const cw = analizza({ values: settimanale, unita: "giorni" });
  check("ciclo settimanale dentro il rumore: periodo 7 trovato", cw.ciclo && cw.ciclo.ogni === 7, JSON.stringify(cw.ciclo));
  check("ciclo trovato: la quota spiegata è alta", num(cw.ciclo.spiegato_pct) > 80, String(cw.ciclo.spiegato_pct));

  // PREZZO (random walk): NON ha stagionalità. Prima questa era la svista: l'autocorrelazione
  // della serie grezza è alta a ogni lag corto e la vista dichiarava «si ripete ogni 7».
  let seme3 = 5;
  const rnd3 = () => { seme3 = (seme3 * 1103515245 + 12345) % 2147483648; return seme3 / 2147483648; };
  const cammino = [];
  let v3 = 100;
  for (let i = 0; i < 260; i += 1) { v3 += (rnd3() - 0.5) * 2; cammino.push(v3); }
  const ck = analizza({ values: cammino, unita: "giorni" });
  check("prezzo senza stagionalità: nessun ciclo inventato", ck.ciclo === null, JSON.stringify(ck.ciclo));

  const conBuchi = analizza({ values: [1, 2, null, 4, 5, 6, 7, 8, "", 10] });
  check("valori mancanti: contati, non inventati", conBuchi.mancanti === 2, String(conBuchi.mancanti));

  let erroreCorto = null;
  try { analizza({ values: [1, 2, 3] }); } catch (x) { erroreCorto = x.message; }
  check("meno di 8 punti → errore esplicito", !!erroreCorto, erroreCorto || "");
}

/* ───────────────────────── 2. SERVIZIO: contratto ───────────────────────── */
section("2. servizio — contratto delle rotte");
let servizioUp = false;
try {
  const h = await fetch(BASE + "/health", { signal: AbortSignal.timeout(3000) });
  const st = await h.json();
  servizioUp = !!(st && st.ok);
  if (servizioUp) {
    check("GET /health risponde", true);
    check("dichiara la taglia del modello", typeof st.taglia === "string", st.taglia);
    check("dichiara quanti thread usa", Number.isFinite(Number(st.thread)), String(st.thread));
    check("dichiara il tempo di scarico per inattività", Number(st.idle_unload_s) > 0, String(st.idle_unload_s));
  }
} catch { servizioUp = false; }

if (!servizioUp || SENZA_SERVIZIO) {
  salta(SENZA_SERVIZIO ? "servizio: sezioni 2 e 3" : `servizio non raggiungibile su ${BASE}: sezioni 2 e 3`);
} else {
  const serie = rumore(120);

  const senzaToken = await fetch(BASE + "/forecast", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ series: [serie], prediction_length: 5 }),
  });
  check("senza token → 401", senzaToken.status === 401, String(senzaToken.status));

  const tokenSbagliato = await fetch(BASE + "/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Timestral-Token": "sbagliato" },
    body: JSON.stringify({ series: [serie], prediction_length: 5 }),
  });
  check("token errato → 401", tokenSbagliato.status === 401, String(tokenSbagliato.status));

  const senzaSeries = await chiama("/forecast", { prediction_length: 5 });
  check("forecast senza `series` → 400 con messaggio", senzaSeries.status === 400 && /series/.test(senzaSeries.json?.error || ""), senzaSeries.json?.error);

  const corta = await chiama("/forecast", { series: [serie.slice(0, 7)], prediction_length: 3 });
  check("serie da 7 punti → 400 (minimo 8 dichiarato)", corta.status === 400 && /almeno 8/.test(corta.json?.error || ""), corta.json?.error);

  const hZero = await chiama("/forecast", { series: [serie], prediction_length: 0 });
  check("orizzonte 0 → 400", hZero.status === 400, String(hZero.status));
  const hEnorme = await chiama("/forecast", { series: [serie], prediction_length: 5000 });
  check("orizzonte oltre il massimo → 400", hEnorme.status === 400, String(hEnorme.status));

  const senzaH = await chiama("/forecast", { series: [serie] });
  check("orizzonte ASSENTE → default 30 dichiarato", senzaH.status === 200 && senzaH.json?.series?.[0]?.median?.length === 30, String(senzaH.json?.series?.[0]?.median?.length));
  const hNonNum = await chiama("/forecast", { series: [serie], prediction_length: "abc" });
  check("orizzonte non numerico → 400 (non un default silenzioso)", hNonNum.status === 400, String(hNonNum.status));

  const uno = await chiama("/forecast", { series: [serie], prediction_length: 1 });
  check("orizzonte 1 funziona", uno.status === 200 && uno.json?.series?.[0]?.median?.length === 1);

  const h = 12;
  const a = await chiama("/forecast", { series: [{ name: "sintetica", values: serie }], prediction_length: h });
  const s = a.json?.series?.[0];
  check("forecast valido → 200 e una serie", a.status === 200 && !!s);
  const chiavi = ["median", "q05", "q10", "q25", "q75", "q90", "q95"];
  check("tutti i quantili tornano, alla lunghezza dell'orizzonte", chiavi.every((k) => Array.isArray(s[k]) && s[k].length === h), chiavi.map((k) => `${k}:${s?.[k]?.length}`).join(" "));

  // MONOTONIA: è l'invariante che rende leggibile un ventaglio. Il "quantile crossing" è un
  // difetto reale dei modelli quantilici: se compare, la fascia 80% può risultare più larga
  // della 95% e il grafico dice il falso.
  const ordini = { 0: 0.05, 1: 0.10, 2: 0.25, 3: 0.5, 4: 0.75, 5: 0.90, 6: 0.95 };
  const k = ["q05", "q10", "q25", "median", "q75", "q90", "q95"];
  let incroci = 0;
  for (let i = 0; i < h; i += 1) {
    for (let j = 1; j < k.length; j += 1) if (!(s[k[j - 1]][i] <= s[k[j]][i])) incroci += 1;
  }
  check("quantili monotoni a ogni passo (nessun quantile crossing)", incroci === 0, `${incroci} incroci`);

  const tuttiFiniti = k.every((kk) => s[kk].every((x) => Number.isFinite(x)));
  check("nessun valore NaN/Infinity nei quantili", tuttiFiniti);

  check("`last_observed` è davvero l'ultimo valore della serie", Math.abs(num(s.last_observed) - serie[serie.length - 1]) < 1e-9, `${s.last_observed} vs ${serie[serie.length - 1]}`);

  const st = s.stats || {};
  check("stats.median_end coincide con l'ultimo passo della mediana", Math.abs(num(st.median_end) - num(s.median[h - 1])) < 1e-6);
  check("stats.q05_end / q95_end coincidono con i quantili", Math.abs(num(st.q05_end) - num(s.q05[h - 1])) < 1e-6 && Math.abs(num(st.q95_end) - num(s.q95[h - 1])) < 1e-6);
  check("P(rialzo) dentro [0,1]", num(st.p_rise_end) >= 0 && num(st.p_rise_end) <= 1, String(st.p_rise_end));
  check("ampiezza della banda 80% non negativa", num(st.band80_width_pct) >= 0, String(st.band80_width_pct));
  check("variazione attesa coerente con mediana − ultimo", Math.abs(num(st.expected_change_end) - (num(st.median_end) - num(s.last_observed))) < 1e-4);

  const b = await chiama("/forecast", { series: [{ name: "sintetica", values: serie }], prediction_length: h });
  const s2 = b.json?.series?.[0];
  check("stessa richiesta → stessi numeri (determinismo, il grafico non balla)", JSON.stringify(s2?.median) === JSON.stringify(s.median) && JSON.stringify(s2?.q95) === JSON.stringify(s.q95));

  const joint = await chiama("/forecast", { series: [{ name: "a", values: serie }, { name: "b", values: serie.map((x) => x * 2) }], prediction_length: 6, mode: "joint" });
  check("due serie in modalità congiunta → 200 con due risultati", joint.status === 200 && joint.json?.series?.length === 2, JSON.stringify(joint.json?.error || ""));

  const conNaN = serie.map((x, i) => (i === 40 || i === 41 ? null : x));
  const nanRes = await chiama("/forecast", { series: [conNaN], prediction_length: 4 });
  check("buchi nella serie: nessun crash, ultimo osservato corretto", nanRes.status === 200 && Math.abs(num(nanRes.json?.series?.[0]?.last_observed) - serie[serie.length - 1]) < 1e-9, nanRes.json?.error || String(nanRes.status));

  /* ───────────────────── 3. BACKTEST: nessun look-ahead ───────────────────── */
  section("3. backtest — verifica storica");
  const base = rumore(200, 100, 1, 11);
  const rt = await chiama("/backtest", { values: base, prediction_length: 10, folds: 1 });
  check("backtest valido → 200", rt.status === 200, rt.json?.error || String(rt.status));
  const r = rt.json || {};
  check("dichiara quante prove ha fatto e il contesto usato", Number(r.folds) >= 1 && Number(r.contesto) >= 16, `folds=${r.folds} contesto=${r.contesto}`);
  const skillAtteso = r.mae_naive ? 100 * (1 - r.mae_modello / r.mae_naive) : null;
  check("skill coerente con MAE modello e naive", skillAtteso === null || Math.abs(skillAtteso - r.skill_mae_pct) < 0.02, `${r.skill_mae_pct} vs ${skillAtteso}`);
  check("copertura 80% dichiarata dentro [0,100]", num(r.copertura80_pct) >= 0 && num(r.copertura80_pct) <= 100, String(r.copertura80_pct));
  check("copertura 95% ≥ copertura 80%", num(r.copertura95_pct) >= num(r.copertura80_pct), `${r.copertura95_pct} vs ${r.copertura80_pct}`);

  // Il test che conta: gli ultimi `h` valori (il "futuro" della prima prova) vengono stravolti.
  // Se il modello li vedesse, non sbaglierebbe di più. Se il contesto è davvero solo passato,
  // l'errore deve esplodere.
  const h2 = 10;
  const futuroPazzo = base.map((x, i) => (i >= base.length - h2 ? 400 : x));
  const rt2 = await chiama("/backtest", { values: futuroPazzo, prediction_length: h2, folds: 1 });
  const salto = num(rt2.json?.mae_modello) / Math.max(1e-9, num(r.mae_modello));
  check("nessun look-ahead: stravolgendo il futuro l'errore esplode", salto > 10, `rapporto ${salto.toFixed(1)}×`);

  const corto = await chiama("/backtest", { values: base.slice(0, 30), prediction_length: 10, folds: 2 });
  check("backtest su serie troppo corta → 400 con messaggio", corto.status === 400 && !!corto.json?.error, corto.json?.error || String(corto.status));
}

/* ─────────────── 4. COERENZA: interfaccia ↔ API ↔ documentazione ─────────────── */
section("4. coerenza interfaccia ↔ API ↔ documentazione");
{
  const html = readFileSync(ROOT + "/dashboard.html", "utf8");
  const mjs = readFileSync(ROOT + "/dashboard.mjs", "utf8");
  const doc = readFileSync(ROOT + "/docs/TIMESTRAL.md", "utf8");

  // 4a. ogni rotta timestral usata dal frontend deve esistere nel server
  const rotteFront = [...new Set([...html.matchAll(/["'`](\/api\/timestral[^"'`?\s]*)/g)].map((m) => m[1]))];
  const rotteServer = [...new Set([...mjs.matchAll(/url\.pathname === "(\/api\/timestral[^"]*)"/g)].map((m) => m[1]))];
  const mancanti = rotteFront.filter((x) => !rotteServer.includes(x));
  check("ogni rotta timestral chiamata dal frontend esiste nel server", mancanti.length === 0, `mancano ${mancanti.join(", ")}`);
  check("la vista usa almeno forecast e backtest", rotteFront.includes("/api/timestral/forecast") && rotteFront.includes("/api/timestral/backtest"), rotteFront.join(" "));

  // 4b. i campi «stats.*» letti dalla UI devono esistere davvero nell'output del servizio
  // il perimetro conta: `st.` compare in tutto il file (memoria, contesto, sessione). Qui si
  // leggono solo le funzioni della vista Previsioni che usano gli stats del modello.
  const funzioniVista = ["prevVerdettoHtml", "prevNumeri"].map((nome) => {
    const i = html.indexOf(`function ${nome}(`);
    let d = 0;
    for (let k = html.indexOf("{", i); k < html.length; k += 1) {
      if (html[k] === "{") d += 1; else if (html[k] === "}") { d -= 1; if (!d) return html.slice(i, k + 1); }
    }
    return "";
  }).join("\n");
  const campiStats = [...new Set([...funzioniVista.matchAll(/\bst\.([a-z0-9_]+)/g)].map((m) => m[1]))];
  const statsServizio = ["median_end", "q05_end", "q95_end", "band80_width_pct", "p_rise_end", "expected_change_end", "expected_change_end_pct"];
  const statsSconosciuti = campiStats.filter((c) => !statsServizio.includes(c));
  check("ogni campo stats.* letto dalla UI è prodotto dal servizio", statsSconosciuti.length === 0, `sconosciuti: ${statsSconosciuti.join(", ")}`);

  // 4c. la UI non deve citare pulsanti che non esistono (il caso «affidabilità» rinominato)
  const citati = [...new Set([...html.matchAll(/premi «([^»]+)»/g)].map((m) => m[1]))];
  // Il testo di un pulsante può contenere markup (icona + <span>), quindi si prende il contenuto
  // del tag e si spogliano i tag interni: «⟳ ricostruisci rigenera» è un'etichetta valida.
  const etichette = [...new Set([...html.matchAll(/<button\b[^>]*>([\s\S]{0,160}?)<\/button>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))];
  // alcuni pulsanti non stanno nell'HTML: si creano via JS (`document.createElement("button")`
  // + textContent). Quindi vale anche la presenza del nome come stringa nel codice.
  const citatiMancanti = citati.filter((c) => {
    const cerco = c.toLowerCase();
    // il confronto è «contiene»: l'etichetta di un pulsante può avere un'icona davanti, o essere
    // composta da più pezzi di markup («⟳ ricostruisci»). E conta anche la stringa nel codice,
    // perché alcuni testi si assegnano via JS (textContent).
    if (etichette.some((e) => e.toLowerCase().includes(cerco))) return false;
    if (html.toLowerCase().includes(`"${cerco}"`) || html.toLowerCase().includes(`>${cerco}`)) return false;
    return true;
  });
  check("ogni pulsante citato nei testi esiste con quel nome", citatiMancanti.length === 0, `citati e assenti: ${citatiMancanti.join(", ")}`);
  check("il pulsante «affidabilità» c'è", etichette.includes("affidabilità"), etichette.filter((e) => /affid|confront/.test(e)).join(" "));

  // 4d. il glossario copre i termini usati
  const termini = ["stima centrale", "intervallo 80%", "fascia 95%", "probabilità", "affidabilità"];
  const glossarioMancante = termini.filter((t) => !new RegExp(t, "i").test(html));
  check("i termini tecnici usati hanno una spiegazione nella vista", glossarioMancante.length === 0, glossarioMancante.join(", "));

  // 4e. documentazione ↔ codice: le rotte del servizio devono essere elencate
  const rotteServizio = ["/health", "/forecast", "/model", "/unload", "/backtest"];
  const nonDoc = rotteServizio.filter((r) => !doc.includes("`" + r) && !doc.includes(r));
  check("tutte le rotte del servizio sono documentate", nonDoc.length === 0, nonDoc.join(", "));

  // 4f. la doc dichiara i quantili restituiti: devono corrispondere a quelli veri
  check("la doc elenca i sette quantili restituiti dal servizio", /5\/10\/25\/50\/75\/90\/95/.test(doc) || (/q10/.test(doc) && /q90/.test(doc)), "la doc non elenca 10 e 90");

  // 4g. i limiti dichiarati devono coincidere con quelli applicati
  const py = readFileSync(ROOT + "/media/timestral-service.py", "utf8");
  const MAX_HORIZON = Number((py.match(/MAX_HORIZON = (\d+)/) || [])[1]);
  check("orizzonte massimo coerente: servizio 4096 e UI non lo supera", MAX_HORIZON === 4096 && /max="366"/.test(html), `servizio ${MAX_HORIZON} · UI ${(html.match(/id="prevOrizzonte"[^>]*max="(\d+)"/) || [])[1]}`);
}

/* ─────── 5. INTEGRAZIONE: la catena dashboard → servizio, come la usa la vista ─────── */
if (process.argv.includes("--integrazione")) {
  section("5. integrazione dashboard → servizio (istanza isolata)");
  const { spawn } = await import("node:child_process");
  const PORT_INT = 8498;
  const proc = spawn("node", ["dashboard.mjs", "--port", String(PORT_INT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      DASH_USER: "prova", DASH_PASSWORD: "provaprovaprova", DASH_ROOT: "/root",
      DASH_MEDIA_DIR: ROOT + "/media", DASH_SESSION_DIR: "/tmp/pi-timestral-sessions",
      DASH_TIMESTRAL: "on",
    },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${PORT_INT}`;
  try {
    let pronto = false;
    for (let i = 0; i < 40 && !pronto; i += 1) {
      await new Promise((r) => setTimeout(r, 250));
      try { pronto = (await fetch(base + "/login", { signal: AbortSignal.timeout(700) })).ok; } catch { /* non ancora */ }
    }
    check("istanza di prova avviata sulla porta " + PORT_INT, pronto);
    if (pronto) {
      const login = await fetch(base + "/login", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "user=prova&password=provaprovaprova", redirect: "manual",
      });
      const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
      check("login: risposta 303 con cookie", login.status === 303 && !!cookie, String(login.status));
      const H = { cookie, "Content-Type": "application/json" };

      const st = await (await fetch(base + "/api/timestral", { headers: H })).json();
      check("GET /api/timestral: stato con elenco serie", !!st && (Array.isArray(st.csv) || Array.isArray(st.demo)), JSON.stringify(Object.keys(st || {})).slice(0, 120));

      const fc = await fetch(base + "/api/timestral/forecast", {
        method: "POST", headers: H, body: JSON.stringify({ csv: "oro-comex-usd-toz-giornaliero.csv", prediction_length: 8 }),
      });
      const j = await fc.json();
      check("POST forecast via dashboard → 200", fc.status === 200, JSON.stringify(j).slice(0, 160));
      const s0 = j.series && j.series[0];
      check("la risposta contiene storico e date (il grafico li usa)", Array.isArray(j.storico) && j.storico.length > 0 && Array.isArray(j.date), `storico=${Array.isArray(j.storico) ? j.storico.length : "assente"}`);
      check("i quantili servono anche la fascia 80% (q10/q90)", !!s0 && Array.isArray(s0.q10) && Array.isArray(s0.q90), s0 ? Object.keys(s0).join(",") : "nessuna serie");
      check("stats presenti per la card «in parole semplici»", !!s0?.stats && Number.isFinite(Number(s0.stats.p_rise_end)), JSON.stringify(s0?.stats || {}).slice(0, 120));
      check("unità dichiarata nei metadati", !!(j.meta && j.meta[0] && (j.meta[0].unita || j.meta[0].frequenza)), JSON.stringify(j.meta || {}).slice(0, 120));

      const bt = await fetch(base + "/api/timestral/backtest", {
        method: "POST", headers: H, body: JSON.stringify({ csv: "oro-comex-usd-toz-giornaliero.csv", prediction_length: 8, folds: 3 }),
      });
      const jb = await bt.json();
      check("POST backtest via dashboard → 200 con skill", bt.status === 200 && jb.skill_mae_pct !== undefined, JSON.stringify(jb).slice(0, 160));
    }
  } finally {
    proc.kill();
  }
}

/* ─────────────────────────────── riepilogo ─────────────────────────────── */
console.log(`\n${"─".repeat(64)}`);
console.log(`controlli: ${pass + fail} · passati ${pass} · falliti ${fail} · sezioni saltate ${saltati}`);
if (!servizioUp) console.log("nota: il servizio non era raggiungibile, le sezioni 2 e 3 non sono state eseguite");
process.exit(fail ? 1 : 0);
