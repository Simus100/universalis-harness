/**
 * Timestral — client verso il servizio locale di previsione, condiviso da tutte le istanze.
 *
 * Il servizio (media/timestral-service.py) gira su 127.0.0.1:8018 e tiene in RAM UN solo
 * modello, scaricandolo quando nessuno lo usa (misurato: 471 MB col 28M carico, 35 MB a
 * vuoto). Qui non si gestisce nessun processo: quello è un'unità systemd (`timestral.service`),
 * perché la RAM va pagata una volta per la macchina, non una per istanza dell'harness.
 *
 * Confine del modulo: rete, preferenze su disco, lettura delle serie (demo e CSV). Nessuna
 * formattazione per il modello e nessun tool: quello sta in media/timestral-tool.mjs.
 */
import { existsSync, mkdirSync as fsMkdir, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, normalize, relative, resolve } from "node:path";

const DEFAULT_PORT = Number(process.env.TIMESTRAL_PORT) || 8018;
const TOKEN_FILE = process.env.TIMESTRAL_TOKEN_FILE || "/etc/timestral/token";
/** Taglie disponibili con la RAM MISURATA su questa VPS (RSS di picco, vedi docs/TIMESTRAL.md). */
export const SIZES = {
  "5M": { rss_picco_mb: 281, load_s: 0.35, nota: "istantaneo, la meno precisa" },
  "28M": { rss_picco_mb: 471, load_s: 0.64, nota: "predefinita: il miglior rapporto qui" },
  "123M": { rss_picco_mb: 1199, load_s: 15.9, nota: "via di mezzo, caricamento lento" },
  "209M": { rss_picco_mb: 1901, load_s: 27.0, nota: "la più precisa, costa 1,9 GB" },
};

function leggiToken() {
  if (process.env.TIMESTRAL_TOKEN) return process.env.TIMESTRAL_TOKEN.trim();
  try {
    return readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

/** Percorso dentro una radice: niente `..`, niente percorsi assoluti fuori casa. */
export function dentroRadice(rootDir, p) {
  const radice = resolve(rootDir);
  const assoluto = isAbsolute(p) ? normalize(p) : resolve(radice, p);
  const rel = relative(radice, assoluto);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return assoluto;
}

/**
 * CSV → serie numerica. Accetta `,` o `;` o tab, con o senza intestazione: la colonna della
 * data è quella che contiene date riconoscibili, il valore è la prima colonna numerica
 * (o quella indicata da `column`). Righe non valide si saltano e si contano: il chiamante
 * deve poter dire quante ne ha perse, invece di far finta che il file fosse pulito.
 */
export function parseCsv(text, { column = null, valueColumn = null } = {}) {
  const righe = text.split(/\r?\n/).filter((r) => r.trim());
  if (!righe.length) throw new Error("CSV vuoto");
  const sep = [",", ";", "\t"].sort((a, b) => righe[0].split(b).length - righe[0].split(a).length)[0];
  const prima = righe[0].split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const num = (c) => {
    const v = String(c).trim().replace(/^"|"$/g, "").replace(/\s/g, "");
    if (!v) return NaN;
    // 1.234,56 → 1234.56 · 1,234.56 → 1234.56 · 1234.5 → 1234.5
    const it = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(v) || /^-?\d+,\d+$/.test(v);
    const pulito = it ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
    return Number(pulito);
  };
  const numericamente = (r) => r.map(num).filter((x) => Number.isFinite(x)).length;
  const header = numericamente(prima) < Math.max(1, prima.length - 1);
  const idxData = (() => {
    if (column) {
      const i = prima.findIndex((c) => c.toLowerCase() === String(column).toLowerCase());
      if (i < 0) throw new Error(`colonna «${column}» non trovata (intestazione: ${prima.join(", ")})`);
      return i;
    }
    return 0;
  })();
  const idxValore = (() => {
    if (valueColumn) {
      const i = prima.findIndex((c) => c.toLowerCase() === String(valueColumn).toLowerCase());
      if (i < 0) throw new Error(`colonna «${valueColumn}» non trovata (intestazione: ${prima.join(", ")})`);
      return i;
    }
    for (let i = 0; i < prima.length; i += 1) if (i !== idxData && Number.isFinite(num(prima[i]))) return i;
    return prima.findIndex((_, i) => i !== idxData);
  })();
  const punti = [];
  let scartate = 0;
  for (const r of (header ? righe.slice(1) : righe)) {
    const celle = r.split(sep);
    const v = num(celle[idxValore]);
    if (!Number.isFinite(v)) {
      scartate += 1;
      continue;
    }
    punti.push([String(celle[idxData] ?? "").trim().replace(/^"|"$/g, ""), v]);
  }
  if (!punti.length) throw new Error("nessun valore numerico riconosciuto nel CSV");
  return { punti, scartate, separatore: sep === "\t" ? "tab" : sep, colonne: prima };
}

/**
 * Analisi descrittiva di una serie: quello che si può DIRE dei dati senza chiedere niente al
 * modello. Ogni numero ha un metodo esplicito e nessuno è inventato:
 *
 *  - variazione su 1/7/30 passi: (ultimo − valore di N passi fa) / |quello| · 100
 *  - tendenza: regressione lineare ai minimi quadrati sui valori (pendenza per passo) con R²,
 *    cioè quanta parte del movimento spiega una retta
 *  - volatilità: deviazione standard delle variazioni percentuali passo-passo
 *  - rumore: deviazione standard dei residui rispetto a una media mobile → rapporto col totale:
 *    basso = tendenza leggibile, alto = serie dominata dal rumore
 *  - ciclicità: autocorrelazione ai lag candidati (7/12/24/30, scelti dall'unità); si segnala
 *    solo se |r| ≥ 0,3, altrimenti «non emerge»
 *  - anomalie: |valore − media mobile| > 3 deviazioni standard dei residui, con la data
 *  - qualità: punti, dal/al, valori mancanti, valori identici ripetuti (serie piatta)
 */
export function analizza({ values, dates = null, unita = "passi" }) {
  const v = (values || []).map((x) => (x === null || x === "" ? NaN : Number(x)));
  const n = v.length;
  if (n < 8) throw new Error("servono almeno 8 punti per un'analisi");
  const idx = [];
  for (let i = 0; i < n; i += 1) if (Number.isFinite(v[i])) idx.push(i);
  const mancanti = n - idx.length;
  if (idx.length < 8) throw new Error("meno di 8 valori validi: non c'è abbastanza per analizzare");
  const y = idx.map((i) => v[i]);
  const d = idx.map((i) => (dates && dates[i] !== undefined ? String(dates[i]).slice(0, 10) : null));
  const N = y.length;
  const ultimo = y[N - 1];
  const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const mediana = (a) => {
    const b = [...a].sort((x, z) => x - z);
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
  };
  const std = (a) => {
    if (a.length < 2) return 0;
    const m = media(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  };
  const pct = (a, b) => (a === 0 || !Number.isFinite(a) ? null : (100 * (b - a)) / Math.abs(a));

  const variazione = (passi) => (N > passi ? pct(y[N - 1 - passi], ultimo) : null);

  // tendenza lineare
  const xs = y.map((_, i) => i);
  const mx = media(xs), my = media(y);
  let num = 0, den = 0;
  for (let i = 0; i < N; i += 1) { num += (xs[i] - mx) * (y[i] - my); den += (xs[i] - mx) ** 2; }
  const pendenza = den ? num / den : 0;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < N; i += 1) { const fit = my + pendenza * (xs[i] - mx); ssRes += (y[i] - fit) ** 2; ssTot += (y[i] - my) ** 2; }
  const r2 = ssTot ? 1 - ssRes / ssTot : 0;

  // variazioni passo-passo e volatilità
  const variazioni = [];
  for (let i = 1; i < N; i += 1) { const p = pct(y[i - 1], y[i]); if (p !== null && Number.isFinite(p)) variazioni.push(p); }
  const volatilita = variazioni.length > 1 ? std(variazioni) : null;
  const escursione = variazioni.length ? media(variazioni.map(Math.abs)) : null;

  // rumore rispetto a una media mobile
  const w = Math.max(3, Math.round(N / 12));
  const mm = y.map((_, i) => media(y.slice(Math.max(0, i - w + 1), i + 1)));
  const residui = y.map((val, i) => val - mm[i]);
  const sdResidui = std(residui);
  const sdTot = std(y);
  const rumore = sdTot ? sdResidui / sdTot : null;

  // ciclicità: autocorrelazione sui lag tipici dell'unità
  const lagCand = /mese|mensil/.test(unita) ? [12, 6, 24] : /ora/.test(unita) ? [24, 168, 12] : /settiman/.test(unita) ? [52, 4, 12] : [7, 30, 12];
  const acf = (lag) => {
    if (N <= lag + 2) return null;
    const m = media(y);
    let num2 = 0, den2 = 0;
    for (let i = 0; i < N; i += 1) den2 += (y[i] - m) ** 2;
    for (let i = lag; i < N; i += 1) num2 += (y[i] - m) * (y[i - lag] - m);
    return den2 ? num2 / den2 : null;
  };
  const cicli = lagCand.map((lag) => ({ lag, r: acf(lag) })).filter((c) => c.r !== null);
  const cicloForte = cicli.filter((c) => Math.abs(c.r) >= 0.3).sort((x, z) => Math.abs(z.r) - Math.abs(x.r))[0] || null;

  // Quanta parte della variabilità è SPIEGATA dal ciclo: senza questo, una serie con weekend
  // forti (cassa, carichi) verrebbe descritta come «rumorosa», che è falso — è stagionale.
  let cicloSpiegato = null;
  if (cicloForte && cicloForte.lag >= 2 && N > cicloForte.lag * 2) {
    const per = cicloForte.lag;
    const medie = new Array(per).fill(0), conteggi = new Array(per).fill(0);
    for (let i = 0; i < N; i += 1) { medie[i % per] += y[i]; conteggi[i % per] += 1; }
    for (let k = 0; k < per; k += 1) medie[k] = conteggi[k] ? medie[k] / conteggi[k] : 0;
    let ssResid = 0;
    for (let i = 0; i < N; i += 1) ssResid += (y[i] - medie[i % per]) ** 2;
    const varTot = ssTot;
    if (varTot > 0) cicloSpiegato = Number((100 * (1 - ssResid / varTot)).toFixed(1));
  }

  // anomalie: scostamenti oltre 3 deviazioni standard dei residui
  const soglia = sdResidui > 0 ? 3 * sdResidui : Infinity;
  const anomalie = [];
  for (let i = 0; i < N; i += 1) {
    if (Math.abs(residui[i]) > soglia) {
      anomalie.push({ data: d[i], valore: Number(y[i].toFixed(6)), scostamento: Number(residui[i].toFixed(6)), posizione: i === N - 1 ? "ultimo" : `${N - i} fa` });
    }
  }

  const maxI = y.indexOf(Math.max(...y));
  const minI = y.indexOf(Math.min(...y));
  const piatti = N > 1 ? variazioni.filter((x) => x === 0).length : 0;

  // ---- decomposizione: trend + DUE stagionalità + residuo (stile STL) ------------------
  // Serve a rispondere a «quali cicli ci sono» con numeri separati: quanto è trend, quanto è
  // stagionale (e su quali periodi), quanto è residuo. Una serie può avere due ritmi insieme
  // (settimanale e annuale su dati giornalieri; giornaliero e settimanale su dati orari).
  const zMedia = (a) => (a.length ? a.reduce((x2, y2) => x2 + y2, 0) / a.length : 0);
  const varianza = (a) => { const m = zMedia(a); return a.reduce((x2, y2) => x2 + (y2 - m) ** 2, 0) / Math.max(1, a.length); };
  const perFase = (residui, p) => {
    const somme = new Array(p).fill(0), conti = new Array(p).fill(0);
    for (let i = 0; i < residui.length; i += 1) { somme[i % p] += residui[i]; conti[i % p] += 1; }
    const medie = somme.map((v2, k) => (conti[k] ? v2 / conti[k] : 0));
    const m = zMedia(medie);
    return { valori: medie.map((v2) => v2 - m), medie };   // centrata: non sposta il livello
  };
  // spettro su un segnale (DFT), per trovare i periodi candidati
  const spettro = (segnale, escludi = []) => {
    const out = [];
    const maxP = Math.max(2, Math.floor(segnale.length / 3));
    for (let p = 2; p <= maxP; p += 1) {
      if (escludi.some((e) => p === e || (e > 1 && (p % e === 0 || e % p === 0)))) continue;
      let re = 0, im = 0;
      for (let i = 0; i < segnale.length; i += 1) {
        const ang = (2 * Math.PI * i) / p;
        re += segnale[i] * Math.cos(ang);
        im += segnale[i] * Math.sin(ang);
      }
      out.push({ periodo: p, ampiezza: (2 * Math.sqrt(re * re + im * im)) / segnale.length });
    }
    out.sort((a2, b2) => b2.ampiezza - a2.ampiezza);
    return out;
  };

  const specY = spettro(y);
  // Un segnale con due picchi al giorno produce un massimo a 12 ore, ma il periodo VERO è 24:
  // se il doppio del periodo ha ampiezza paragonabile, si prende quello.
  let p1 = specY[0] ? specY[0].periodo : null;
  if (p1) {
    const amp1 = specY[0].ampiezza;
    const multipli = specY.filter((x) => x.periodo > p1 && x.periodo <= p1 * 4);
    if (multipli.length) {
      const migliore = multipli.reduce((a2, b2) => (b2.ampiezza > a2.ampiezza ? b2 : a2));
      if (migliore.ampiezza >= amp1 * 0.5) p1 = migliore.periodo;
    }
  }
  const larghezzaTrend = Math.max(3, Math.min(Math.floor(N / 3), (p1 || 7) * 2 + 1));
  const meta = Math.floor(larghezzaTrend / 2);
  const trendArr = y.map((_, i) => zMedia(y.slice(Math.max(0, i - meta), Math.min(N, i + meta + 1))));
  const detrendC = y.map((v, i) => v - trendArr[i]);
  const st1 = p1 ? perFase(detrendC, p1) : null;
  const residuo1 = st1 ? detrendC.map((v, i) => v - st1.valori[i % p1]) : detrendC;
  const spec2 = spettro(residuo1, p1 ? [p1] : []);
  const p2 = spec2[0] && spec2[0].ampiezza > (specY[0] ? specY[0].ampiezza * 0.12 : 0) ? spec2[0].periodo : null;
  let st2 = p2 ? perFase(residuo1, p2) : null;
  let p2eff = p2;
  if (st2) {
    const quota = (varianza(residuo1) - varianza(residuo1.map((v, i) => v - st2.valori[i % p2]))) / (varianza(y) || 1);
    if (quota < 0.05) { st2 = null; p2eff = null; }   // meno del 5%: non è un ciclo, è rumore
  }
  const residuo = st2 ? residuo1.map((v, i) => v - st2.valori[i % p2]) : residuo1;
  const varY = varianza(y) || 1;
  const r6 = (v) => Number(v.toFixed(6));
  const decomp = {
    trend: trendArr.map(r6),
    stagionale: y.map((_, i) => r6((st1 ? st1.valori[i % p1] : 0) + (st2 ? st2.valori[i % p2] : 0))),
    stagionale_1: st1 ? st1.valori.map(r6) : null,
    stagionale_2: st2 ? st2.valori.map(r6) : null,
    periodo_1: p1,
    periodo_2: p2eff,
    residuo: residuo.map(r6),
    forze: {
      trend_pct: Number((100 * (1 - varianza(detrendC) / varY)).toFixed(1)),
      stagionale_1_pct: st1 ? Number((100 * (varianza(detrendC) - varianza(residuo1)) / varY).toFixed(1)) : 0,
      stagionale_2_pct: st2 ? Number((100 * (varianza(residuo1) - varianza(residuo)) / varY).toFixed(1)) : 0,
      residuo_pct: Number((100 * varianza(residuo) / varY).toFixed(1)),
    },
    nota: "trend = media mobile centrata; stagionalità = media per fase di ciascun periodo, centrata; residuo = ciò che resta. Le forze sono quote della varianza totale.",
  };

  // ---- matrix profile: i pattern che si RIPETONO (non solo l'ultimo) -------------------
  // Per ogni finestra, la distanza dalla finestra più simile: i minimi sono i motif (forme che
  // tornano), i massimi sono i «discord», cioè i pezzi che non somigliano a nient'altro.
  const wM = Math.max(4, Math.min(14, Math.floor(N / 8)));
  const M = N - wM + 1;
  const zs = [];
  const zn = (a) => { const m = zMedia(a); const sd = Math.sqrt(varianza(a)) || 1; return a.map((v) => (v - m) / sd); };
  for (let i = 0; i < M; i += 1) zs.push(zn(y.slice(i, i + wM)));
  const profilo = new Array(M).fill(Infinity);
  const vicino = new Array(M).fill(-1);
  for (let i = 0; i < M; i += 1) {
    for (let j = 0; j < M; j += 1) {
      if (Math.abs(i - j) < Math.max(2, Math.floor(wM / 2))) continue;
      let d2 = 0;
      for (let k = 0; k < wM; k += 1) d2 += (zs[i][k] - zs[j][k]) ** 2;
      const d = Math.sqrt(d2 / wM);
      if (d < profilo[i]) { profilo[i] = d; vicino[i] = j; }
    }
  }
  const coppie = [];
  const usati = new Set();
  for (let giro = 0; giro < 3; giro += 1) {
    let miglioreI = -1, miglioreD = Infinity;
    for (let i = 0; i < M; i += 1) {
      if (usati.has(i) || !Number.isFinite(profilo[i])) continue;
      if (profilo[i] < miglioreD) { miglioreD = profilo[i]; miglioreI = i; }
    }
    if (miglioreI < 0) break;
    const j = vicino[miglioreI];
    usati.add(miglioreI);
    usati.add(j);
    for (let k = Math.max(0, miglioreI - wM); k <= Math.min(M - 1, miglioreI + wM); k += 1) usati.add(k);
    for (let k = Math.max(0, j - wM); k <= Math.min(M - 1, j + wM); k += 1) usati.add(k);
    coppie.push({
      a: d[miglioreI + wM - 1],
      b: d[j + wM - 1],
      distanza: Number(miglioreD.toFixed(3)),
      // cosa è successo dopo ciascuna delle due occorrenze
      dopo_a: y[miglioreI + wM] !== undefined && y[miglioreI + wM - 1] ? Number((100 * (y[miglioreI + wM] - y[miglioreI + wM - 1]) / Math.abs(y[miglioreI + wM - 1])).toFixed(2)) : null,
      dopo_b: y[j + wM] !== undefined && y[j + wM - 1] ? Number((100 * (y[j + wM] - y[j + wM - 1]) / Math.abs(y[j + wM - 1])).toFixed(2)) : null,
    });
  }
  let discord = null;
  if (M > 4) {
    let massimoI = 0;
    for (let i = 1; i < M; i += 1) if (profilo[i] > profilo[massimoI]) massimoI = i;
    discord = { data: d[massimoI + wM - 1], distanza: Number(profilo[massimoI].toFixed(3)) };
  }

  // ---- ciclicità e pattern ------------------------------------------------------------
  // Il modello NON fa questo: qui si misura la struttura della serie (cicli, periodi,
  // configurazioni già viste e cosa è successo dopo). È aritmetica, e serve a decidere se una
  // previsione ha senso guardarla.
  const detrend = y.map((v, i) => v - mm[i]);           // tolgo il movimento lento
  const varDetrend = (() => { const m = media(detrend); return media(detrend.map((v) => (v - m) ** 2)); })();

  // spettro: ampiezza per periodo (DFT sui residui), periodi da 2 a N/3
  const maxPeriodo = Math.max(2, Math.floor(N / 3));
  let periodoDominante = null;
  for (let p = 2; p <= maxPeriodo; p += 1) {
    let re = 0, im = 0;
    for (let i = 0; i < N; i += 1) {
      const ang = (2 * Math.PI * i) / p;
      re += detrend[i] * Math.cos(ang);
      im += detrend[i] * Math.sin(ang);
    }
    const ampiezza = (2 * Math.sqrt(re * re + im * im)) / N;
    if (!periodoDominante || ampiezza > periodoDominante.ampiezza) periodoDominante = { periodo: p, ampiezza };
  }
  // quota di variabilità che quel periodo spiega davvero (media per fase).
  // Un picco spettrale senza questa verifica è solo rumore ben disegnato.
  let forzaStagionale = null;
  if (periodoDominante && varDetrend > 0) {
    const p = periodoDominante.periodo;
    const somme = new Array(p).fill(0), conti = new Array(p).fill(0);
    for (let i = 0; i < N; i += 1) { somme[i % p] += detrend[i]; conti[i % p] += 1; }
    const medie = somme.map((v2, k) => (conti[k] ? v2 / conti[k] : 0));
    let ssRes = 0;
    for (let i = 0; i < N; i += 1) ssRes += (detrend[i] - medie[i % p]) ** 2;
    forzaStagionale = Number((100 * (1 - ssRes / (varDetrend * N))).toFixed(1));
  }
  // autocorrelazione significativa: |r| > 1,96/√n (intervallo classico al 95%)
  const sogliaAcf = 1.96 / Math.sqrt(N);
  const acfSignificative = cicli.filter((c) => Math.abs(c.r) > sogliaAcf).map((c) => ({ lag: c.lag, r: Number(c.r.toFixed(2)) }));

  // pattern: l'ultima configurazione (w punti) contro tutte quelle precedenti
  const wPat = Math.max(4, Math.min(14, Math.floor(N / 8)));
  const hPat = Math.max(1, Math.min(10, Math.floor(N / 20)));
  const z = (a) => {
    const m = media(a), sd = std(a) || 1;
    return a.map((v) => (v - m) / sd);
  };
  const ultima = z(y.slice(N - wPat));
  const simili = [];
  for (let i = 0; i + wPat + hPat <= N - wPat; i += 1) {
    const fin = z(y.slice(i, i + wPat));
    let d2 = 0;
    for (let k = 0; k < wPat; k += 1) d2 += (fin[k] - ultima[k]) ** 2;
    const dopo = y[i + wPat + hPat - 1];
    const prima = y[i + wPat - 1];
    simili.push({ distanza: Math.sqrt(d2), indice: i + wPat - 1, data: d[i + wPat - 1], variazione_pct: prima !== 0 ? (100 * (dopo - prima)) / Math.abs(prima) : null });
  }
  simili.sort((x2, z2) => x2.distanza - z2.distanza);
  const migliori = simili.slice(0, 3).filter((x2) => Number.isFinite(x2.variazione_pct));
  const dopoSimili = migliori.length ? Number(media(migliori.map((x2) => x2.variazione_pct)).toFixed(2)) : null;

  return {
    punti: N,
    dal: d[0],
    al: d[N - 1],
    mancanti,
    unita,
    ultimo: Number(ultimo.toFixed(6)),
    variazione_1: variazione(1),
    variazione_7: variazione(7),
    variazione_30: variazione(30),
    variazione_finestra: pct(y[0], ultimo),
    minimo: { valore: Number(Math.min(...y).toFixed(6)), data: d[minI] },
    massimo: { valore: Number(Math.max(...y).toFixed(6)), data: d[maxI] },
    media: Number(media(y).toFixed(6)),
    mediana: Number(mediana(y).toFixed(6)),
    deviazione_std: Number(sdTot.toFixed(6)),
    volatilita_pct: volatilita === null ? null : Number(volatilita.toFixed(3)),
    escursione_media_pct: escursione === null ? null : Number(escursione.toFixed(3)),
    tendenza_per_passo: Number(pendenza.toFixed(6)),
    tendenza_r2: Number(r2.toFixed(3)),
    rumore: rumore === null ? null : Number(rumore.toFixed(2)),
    ciclo: cicloForte ? { ogni: cicloForte.lag, autocorrelazione: Number(cicloForte.r.toFixed(2)), spiegato_pct: cicloSpiegato } : null,
    anomalie: anomalie.slice(-5),
    valori_fermi_pct: variazioni.length ? Number(((100 * piatti) / variazioni.length).toFixed(1)) : null,
    pattern: {
      periodo_dominante: periodoDominante ? periodoDominante.periodo : null,
      ampiezza_spettrale: periodoDominante ? Number(periodoDominante.ampiezza.toFixed(4)) : null,
      forza_stagionale_pct: forzaStagionale,
      acf_significative: acfSignificative,
      soglia_acf: Number(sogliaAcf.toFixed(3)),
      finestra: wPat,
      passi_dopo: hPat,
      simili: migliori.map((x2) => ({ data: x2.data, distanza: Number(x2.distanza.toFixed(2)), variazione_pct: Number(x2.variazione_pct.toFixed(2)) })),
      variazione_media_dopo_simili_pct: dopoSimili,
      // matrix profile: forme che si ripetono e pezzo più «strano» della serie
      finestra_motif: wM,
      motif: coppie,
      discord,
    },
    decomp,
    metodo: "variazioni e volatilità sulle variazioni percentuali passo-passo; tendenza = regressione lineare ai minimi quadrati con R²; rumore = dev.st dei residui / dev.st dei valori; ciclicità = autocorrelazione ai lag tipici dell'unità (soglia |r| ≥ 0,3); anomalie = |residuo| > 3 dev.st dei residui.",
  };
}

export function createTimestralClient({ mediaDir, rootDir = mediaDir, log = (m) => console.log(m) }) {
  const prefsFile = process.env.DASH_TIMESTRAL_PREFS_FILE || join(mediaDir, "timestral-prefs.json");
  const demoFile = join(mediaDir, "timestral-demo.json");
  const datiDir = join(mediaDir, "previsioni", "dati");
  const available = String(process.env.DASH_TIMESTRAL ?? "on").trim().toLowerCase() !== "off";
  /**
   * Permessi per ISTANZA. Ogni istanza è un utente diverso e sullo stesso server convivono
   * un titolare e due sottoclienti: la stessa funzione non può essere uguale per tutti.
   *   DASH_TIMESTRAL=off        → feature assente (nessun tool, nessuna vista, nessuna rotta)
   *   DASH_TIMESTRAL_DEFAULT=off → presente ma SPENTA all'inizio: la accende l'utente
   *   DASH_TIMESTRAL_LOCK=on     → interruttore e taglia decisi da chi amministra: l'utente
   *                                non li cambia (come DASH_LOCK_MODEL per il modello)
   *   DASH_TIMESTRAL_MAX_UPLOAD_MB → tetto per i CSV caricati (disco dei sottoclienti: 2 GB)
   * Il servizio è condiviso, quindi la RAM e la CPU sono di tutti: l'interruttore limita
   * l'USO (i tool e la vista), il lock limita il POTERE di chi usa l'istanza.
   */
  const defaultOn = !/^(off|0|no|false)$/i.test(String(process.env.DASH_TIMESTRAL_DEFAULT ?? "on").trim());
  const locked = /^(on|1|yes|true)$/i.test(String(process.env.DASH_TIMESTRAL_LOCK ?? "").trim());
  const maxUploadMb = Number(process.env.DASH_TIMESTRAL_MAX_UPLOAD_MB) > 0 ? Number(process.env.DASH_TIMESTRAL_MAX_UPLOAD_MB) : 8;

  const prefs = { enabled: defaultOn, size: "28M", port: DEFAULT_PORT, prediction_length: 30 };
  try {
    const raw = JSON.parse(readFileSync(prefsFile, "utf8"));
    // la feature è ACCESA di default (richiesta: per tutti gli utenti); il file serve a
    // ricordare una scelta diversa, non a imporre un default spento
    // con il lock attivo la preferenza salvata non conta: comanda l'amministratore, e il
    // valore resta quello dell'ambiente (un file vecchio non deve riaccendere una feature
    // che è stata chiusa dall'alto)
    if (typeof raw?.enabled === "boolean" && !locked) prefs.enabled = raw.enabled;
    if (SIZES[raw?.size]) prefs.size = raw.size;
    if (Number.isFinite(Number(raw?.port))) prefs.port = Number(raw.port);
    if (Number.isFinite(Number(raw?.prediction_length))) prefs.prediction_length = Number(raw.prediction_length);
  } catch {
    /* nessuna preferenza: default sopra */
  }

  function savePrefs() {
    try {
      writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
    } catch (err) {
      log(`[Timestral] preferenze non salvate: ${err?.message ?? err}`);
    }
  }

  const baseUrl = () => `http://127.0.0.1:${prefs.port}`;

  async function chiama(percorso, { method = "GET", body = null, timeoutMs = 60_000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(baseUrl() + percorso, {
        method,
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Timestral-Token": leggiToken(),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const testo = await res.text();
      let dati = null;
      try {
        dati = JSON.parse(testo);
      } catch {
        dati = { raw: testo.slice(0, 400) };
      }
      if (!res.ok) throw new Error(dati?.error || `HTTP ${res.status}`);
      return dati;
    } finally {
      clearTimeout(t);
    }
  }

  /** Stato del servizio. Non solleva: "spento" è uno stato, non un'eccezione. */
  async function status({ timeoutMs = 1500 } = {}) {
    if (!available) return { available: false, up: false, enabled: false, motivo: "feature disattivata (DASH_TIMESTRAL=off)" };
    try {
      const s = await chiama("/health", { timeoutMs });
      return { available: true, up: true, enabled: prefs.enabled, port: prefs.port, ...s };
    } catch (err) {
      return {
        available: true,
        up: false,
        enabled: prefs.enabled,
        port: prefs.port,
        motivo: String(err?.message ?? err),
      };
    }
  }

  /** Snapshot SINCRONO per getState (niente rete: viene chiamato a ogni broadcast). */
  function snapshot() {
    return {
      available,
      enabled: prefs.enabled,
      size: prefs.size,
      port: prefs.port,
      prediction_length: prefs.prediction_length,
      // permessi: la UI mostra la mano dell'amministratore invece di un interruttore che mente
      locked,
      max_upload_mb: maxUploadMb,
      taglie: SIZES,
      demo: demoIds(),
    };
  }

  function backtest(req, opts = {}) {
    return chiama("/backtest", { method: "POST", body: req, timeoutMs: opts.timeoutMs ?? 300_000 });
  }

  function prevedi(req, opts = {}) {
    return chiama("/forecast", { method: "POST", body: req, timeoutMs: opts.timeoutMs ?? 120_000 });
  }

  function impostaTaglia(size) {
    if (!SIZES[size]) throw new Error(`taglia sconosciuta: ${size}`);
    if (locked) {
      // la taglia decide quanta RAM della MACCHINA si occupa: un utente limitato non la cambia
      const err = new Error("la taglia del modello è decisa da chi amministra (DASH_TIMESTRAL_LOCK=on)");
      err.status = 403;
      throw err;
    }
    return chiama("/model", { method: "POST", body: { size }, timeoutMs: 180_000 }).then((s) => {
      prefs.size = size;
      savePrefs();
      return s;
    });
  }

  function scarica() {
    return chiama("/unload", { method: "POST", body: {}, timeoutMs: 20_000 });
  }

  function setEnabled(on) {
    if (locked) {
      const err = new Error(
        "l'uso di Timestral su questa istanza è deciso da chi amministra (DASH_TIMESTRAL_LOCK=on): l'interruttore non è modificabile da qui",
      );
      err.status = 403;
      throw err;
    }
    prefs.enabled = !!on;
    savePrefs();
    return snapshot();
  }

  // ---- serie ----
  let demoCache = null;
  function demo() {
    if (demoCache) return demoCache;
    try {
      const raw = JSON.parse(readFileSync(demoFile, "utf8"));
      demoCache = Array.isArray(raw?.serie) ? raw.serie : [];
    } catch {
      demoCache = [];
    }
    return demoCache;
  }
  const demoIds = () => demo().map((s) => s.id);

  /**
   * Salva una serie IMPORTATA (dall'agente, che l'ha cercata sul web o ricostruita da un
   * documento) in media/previsioni/dati/, con un file di metadati accanto.
   *
   * Perché i metadati: una serie senza provenienza è indistinguibile da un numero inventato.
   * Accanto al CSV si scrive `<nome>.meta.json` con fonte, URL, unità, frequenza, istante di
   * importazione; la vista lo mostra accanto alla serie, e chi riprende il lavoro mesi dopo sa
   * da dove viene ogni numero.
   */
  function salvaSerie({ nome, punti, fonte, fonteUrl, unita, frequenza, nota }) {
    const pulito = String(nome || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    if (!pulito) throw new Error("serve un nome per la serie (lettere, numeri, - e _)");
    if (!Array.isArray(punti) || punti.length < 8) throw new Error("servono almeno 8 punti per una serie utile");
    const righe = [];
    let scartate = 0;
    for (const p of punti) {
      const d = Array.isArray(p) ? p[0] : p?.data ?? p?.date;
      const v = Array.isArray(p) ? p[1] : p?.valore ?? p?.value;
      // numeri ita o internazionali: "1.234,5" e "1,234.5" devono valere lo stesso
      const t = String(v ?? "").replace(/\s/g, "");
      const n = Number(/\.\d{1,2}$/.test(t) && t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
      if (d === undefined || d === null || !String(d).trim() || !Number.isFinite(n)) {
        scartate += 1;
        continue;
      }
      righe.push(`${String(d).trim()},${n}`);
    }
    if (righe.length < 8) throw new Error(`solo ${righe.length} punti validi: controlla date e valori (${scartate} righe scartate)`);
    const dir = join(mediaDir, "previsioni", "dati");
    fsMkdir(dir, { recursive: true });
    writeFileSync(join(dir, `${pulito}.csv`), "data,valore\n" + righe.join("\n") + "\n");
    const meta = {
      nome: pulito,
      titolo: fonte ? String(fonte).slice(0, 120) : pulito,
      fonte: fonte ? String(fonte).slice(0, 300) : null,
      fonte_url: fonteUrl ? String(fonteUrl).slice(0, 500) : null,
      unita: unita ? String(unita).slice(0, 40) : null,
      frequenza: frequenza ? String(frequenza).slice(0, 40) : null,
      nota: nota ? String(nota).slice(0, 500) : null,
      punti: righe.length,
      scartate,
      importata_il: new Date().toISOString(),
      da: "agente",
    };
    writeFileSync(join(dir, `${pulito}.meta.json`), JSON.stringify(meta, null, 2));
    return { nome: pulito, percorso: `previsioni/dati/${pulito}.csv`, punti: righe.length, scartate, meta };
  }

  /**
   * Elimina una serie importata o caricata: il CSV e i suoi metadati. Serve perché la cartella
   * dei dati è anche la memoria di ciò che si è provato: dopo dieci esperimenti l'elenco diventa
   * illeggibile, e chi ha importato una serie sbagliata deve poterla togliere.
   * Il nome è validato (solo file dentro media/previsioni/dati, niente percorsi).
   */
  function eliminaSerie(nome) {
    const soloNome = String(nome || "").split(/[\\/]/).pop();
    if (!/^[A-Za-z0-9._-]+\.(csv|txt)$/i.test(soloNome)) {
      const err = new Error("nome non valido: serve un file .csv o .txt della cartella dati");
      err.status = 400;
      throw err;
    }
    const file = dentroRadice(join(mediaDir, "previsioni", "dati"), soloNome);
    if (!file || !existsSync(file)) {
      const err = new Error(`serie non trovata: ${soloNome}`);
      err.status = 404;
      throw err;
    }
    const meta = file.replace(/\.(csv|txt)$/i, ".meta.json");
    unlinkSync(file);
    let metaRimosso = false;
    if (existsSync(meta)) {
      unlinkSync(meta);
      metaRimosso = true;
    }
    return { nome: soloNome, metaRimosso };
  }

  /** CSV caricati (dall'utente o dall'agente): elenco con metadati di provenienza. */
  function csvDisponibili() {
    try {
      if (!existsSync(datiDir)) return [];
      return readdirSync(datiDir)
        // `.csv`/`.txt` sì, ma non il LEGGIMI che spiega il formato: non è una serie
        .filter((f) => /\.(csv|txt)$/i.test(f) && !/^leggimi/i.test(f))
        .map((f) => {
          const p = join(datiDir, f);
          let kb = null;
          try {
            kb = Math.round(statSync(p).size / 102.4) / 10;
          } catch {
            /* file sparito nel frattempo */
          }
          let meta = null;
          try {
            meta = JSON.parse(readFileSync(join(datiDir, f.replace(/\.(csv|txt)$/i, ".meta.json")), "utf8"));
          } catch {
            meta = null;
          }
          return { nome: f, kb, percorso: `previsioni/dati/${f}`, meta };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome));
    } catch {
      return [];
    }
  }

  /**
   * Prepara le serie da mandare al servizio, da una delle tre sorgenti:
   *  - `demo`: una o più serie incluse (id di media/timestral-demo.json)
   *  - `csv`: un file caricato in media/previsioni/dati/
   *  - `series`: valori già in mano al chiamante
   * Ritorna { nomi, valori[], meta } — oppure solleva con un messaggio utile.
   */
  function preparaSerie({ demo: ids, csv, series, column, valueColumn }) {
    const fonti = [];
    if (Array.isArray(ids) && ids.length) {
      for (const id of ids) {
        const s = demo().find((d) => d.id === id);
        if (!s) throw new Error(`serie demo «${id}» inesistente (disponibili: ${demoIds().join(", ")})`);
        fonti.push({ nome: s.nome, valori: s.punti.map((p) => p[1]), meta: s, date: s.punti.map((p) => p[0]) });
      }
    }
    if (csv) {
      // Cercato prima dove il caricamento li mette davvero (media/previsioni/dati, che può
      // stare fuori dalla root dell'istanza), poi dentro la root: due candidati, nessun "..".
      const soloNome = basename(String(csv));
      const candidati = [
        dentroRadice(mediaDir, join("previsioni/dati", soloNome)),
        dentroRadice(rootDir, String(csv)),
        dentroRadice(rootDir, join("media/previsioni/dati", soloNome)),
      ].filter(Boolean);
      const file = candidati.find((c) => existsSync(c));
      if (!file || !existsSync(file)) throw new Error(`CSV non trovato: cerca in media/previsioni/dati/ (${csvDisponibili().map((c) => c.nome).join(", ") || "nessun CSV caricato"})`);
      const { punti, scartate, separatore, colonne } = parseCsv(readFileSync(file, "utf8"), { column, valueColumn });
      let sidecar = null;
      try {
        sidecar = JSON.parse(readFileSync(file.replace(/\.(csv|txt)$/i, ".meta.json"), "utf8"));
      } catch {
        sidecar = null;
      }
      fonti.push({
        // il nome della serie è il nome breve (es. «inflazione-area-euro»): la fonte lunga
        // vive in meta.fonte e si mostra dove serve, non nel titolo del grafico
        nome: sidecar && sidecar.nome ? sidecar.nome : basename(file).replace(/\.(csv|txt)$/i, ""),
        valori: punti.map((p) => p[1]),
        date: punti.map((p) => p[0]),
        meta: {
          id: basename(file),
          nome: basename(file),
          unita: (sidecar && sidecar.unita) || "",
          frequenza: (sidecar && sidecar.frequenza) || "",
          sintetica: false,
          fonte: (sidecar && sidecar.fonte) || `file caricato (${separatore}; colonne: ${colonne.join(" · ")})`,
          fonte_url: (sidecar && sidecar.fonte_url) || null,
          importata_il: (sidecar && sidecar.importata_il) || null,
          scartate,
        },
      });
    }
    if (Array.isArray(series) && series.length) {
      // `[1, 2, 3]` = una serie sola; `[{name, values}, ...]` = più serie
      const soloNumeri = series.every((v) => v === null || typeof v === "number" || (typeof v === "string" && v.trim() !== ""));
      if (soloNumeri) series = [{ name: "serie 1", values: series }];
      for (const [i, s] of series.entries()) {
        const vals = Array.isArray(s) ? s : s?.values;
        if (!Array.isArray(vals)) throw new Error("`series` deve essere una lista di valori o di {name, values}");
        fonti.push({
          nome: (Array.isArray(s) ? null : s?.name) || `serie ${i + 1}`,
          valori: vals.map((v) => (v === null || v === "" ? null : Number(v))),
          meta: { id: `inline-${i + 1}`, nome: `serie ${i + 1}`, unita: "", frequenza: "", sintetica: null, fonte: "valori passati dal chiamante" },
        });
      }
    }
    if (!fonti.length) throw new Error("nessuna serie: indica `demo`, `csv` oppure `series`");
    return fonti;
  }

  // il lock e il tetto sono proprietà del client (li legge anche il tool e la rotta): una sola
  // fonte di verità, così UI, API e tool non possono dire cose diverse
  prefs.locked = locked;
  prefs.max_upload_mb = maxUploadMb;
  prefs.default_enabled = defaultOn;

  return {
    available,
    prefs,
    snapshot,
    status,
    prevedi,
    backtest,
    impostaTaglia,
    scarica,
    setEnabled,
    demo,
    demoIds,
    csvDisponibili,
    preparaSerie,
    salvaSerie,
    eliminaSerie,
    datiDir,
    TOKEN_FILE,
    token: leggiToken,
  };
}
