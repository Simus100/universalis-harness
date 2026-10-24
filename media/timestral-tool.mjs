/**
 * Tool `timestral_forecast` e `timestral_series` — previsione probabilistica su serie
 * temporali con Timestral (Mistral), servita dal processo locale condiviso.
 *
 * Che cosa è e che cosa NON è (la stessa cosa che la descrizione dice al modello, perché è
 * lì che viene letta davvero): Timestral è un modello pre-addestrato che prevede la
 * continuazione statistica di una serie, con un'incertezza dichiarata (21 quantili). Non
 * conosce notizie, decisioni di banca centrale, ordinativi o guasti: se il futuro dipende da
 * un evento noto, la previsione non lo sa. Sul cambio misurato qui il valore mediano non batte
 * nemmeno il naive («domani come oggi»), mentre la distribuzione è informativa: va detto.
 *
 * Confine del modulo: qui c'è il contratto verso il modello, la formattazione della risposta e
 * la scrittura del file con la previsione. Rete, preferenze e lettura delle serie stanno in
 * media/timestral-client.mjs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { analizza } from "./timestral-client.mjs";
import { join } from "node:path";

const RAM = "471 MB con il modello da 28M caricato, 35 MB a vuoto";
const LATENZA = "~0,1 s per una serie da 1000 punti; la prima richiesta dopo lo scarico ~3 s";

const FORECAST_DESCRIPTION = [
  "Previsione probabilistica di una o più serie temporali con Timestral (time-series foundation model di Mistral, locale su CPU): restituisce mediana e quantili per ogni passo futuro, più le statistiche che servono a decidere.",
  "",
  "Quando usarlo: quando la risposta dipende da «cosa succederà» in una serie numerica ordinata nel tempo — valori giornalieri (cambi, prezzi, incassi, consumi), orari (carichi, traffico), settimanali (vendite). Anche su dati dell'utente, se ha un CSV con una colonna di date e una di valori.",
  `Costo: nessun costo in denaro, nessuna attesa; il servizio è condiviso e leggero (${RAM}, ${LATENZA}). Non serve chiedere permesso per usarlo.`,
  "Quando NON usarlo: (a) serie più corte di ~50 punti, o con buchi enormi; (b) quando il futuro dipende da un evento noto e datato (un aumento di prezzo annunciato, uno sciopero, un lancio) — il modello non lo sa e va detto all'utente; (c) per una decisione finanziaria: qui si produce una STIMA probabilistica, e va presentata come tale, mai come una previsione certa o un consiglio di investimento.",
  "Come leggerlo: la mediana è il centro; la banda 80% (q10–q90) e 95% (q05–q95) dicono quanto è larga l'incertezza; `p_rise_end` è la probabilità che il valore finale superi l'ultimo osservato, calcolata dai quantili (non calibrata: buona per ordinare, non come frequenza esatta). Se la banda è più larga della differenza che interessa, la risposta onesta è «non si può dire».",
  "Sorgenti: `demo` (serie incluse, vedi timestral_series), `csv` (un file caricato in media/previsioni/dati/), `series` (valori già in mano tua).",
].join("\n");

const FORECAST_PARAMETERS = {
  type: "object",
  properties: {
    demo: {
      description: "Id di una o più serie incluse (es. \"cambio-usd-eur\"). L'elenco si ottiene con timestral_series.",
      type: "array",
      items: { type: "string" },
    },
    csv: { type: "string", description: "Nome (o percorso) di un CSV caricato: colonna data + colonna numerica." },
    series: {
      description: "Valori passati direttamente: lista di numeri, oppure lista di { name, values }.",
      type: "array",
      items: {},
    },
    prediction_length: {
      type: "integer",
      minimum: 1,
      maximum: 4096,
      description: "Quanti passi prevedere, nell'unità della serie (giorni, ore...). Default 30.",
    },
    congiunta: {
      type: "boolean",
      description:
        "Solo con più serie: true le tratta come variate di UN sistema (previsione congiunta, il modello usa le dipendenze); false (default) le prevede separatamente. Usa true solo se le serie sono davvero legate (stesso impianto, stesso portafoglio).",
    },
    column: { type: "string", description: "Solo CSV: nome della colonna delle date/etichette." },
    value_column: { type: "string", description: "Solo CSV: nome della colonna dei valori." },
  },
  required: [],
};

const IMPORT_DESCRIPTION = [
  "Importa una serie temporale nella cartella delle previsioni (media/previsioni/dati/) con la sua provenienza, così che diventi disponibile a timestral_forecast e alla vista «Previsioni».",
  "",
  "Quando usarlo: quando i dati li hai TROVATI TU — una ricerca sul web, una tabella dentro un documento o un PDF, un CSV letto da un file — e vuoi poterli prevedere e rivedere nella dashboard senza ricostruirli ogni volta.",
  "La FONTE è obbligatoria e va scritta in modo verificabile (ente o sito, nome della serie, frequenza, data di estrazione). Se non sai da dove viene un numero, non importarlo: una serie senza provenienza è indistinguibile da un numero inventato.",
  "Regole: importa solo valori che hai VISTO (mai interpolati, mai «stimati a memoria»); dichiara se una serie è destagionalizzata, nominale o reale; se i dati sono mensili dillo (`frequenza: \"1 mese\"`), così l'orizzonte si legge nell'unità giusta.",
  "Dopo l'importazione: `timestral_forecast` con `csv: \"<nome>.csv\"`, oppure l'utente la trova già nell'elenco della vista «Previsioni».",
].join("\n");

const IMPORT_PARAMETERS = {
  type: "object",
  properties: {
    nome: { type: "string", description: "Nome breve della serie, senza estensione (es. \"inflazione-italia-nic\"). Diventa il nome del file." },
    punti: {
      type: "array",
      description: "I dati, in ordine di tempo: [{ data, valore }] oppure [[data, valore]]. Almeno 8 punti.",
      items: {},
    },
    fonte: { type: "string", description: "Provenienza verificabile: ente/sito, nome della serie, frequenza, data di estrazione. È mostrata all'utente accanto alla serie." },
    fonte_url: { type: "string", description: "URL della pagina o del file da cui vengono i numeri." },
    unita: { type: "string", description: "Unità di misura (es. «%», «EUR», «indice 2015=100»)." },
    frequenza: { type: "string", description: "Distanza fra due punti: «1 giorno», «1 mese», «1 ora»." },
    nota: { type: "string", description: "Avvertenza utile: serie destagionalizzata, valori provvisori, cambio di metodologia…" },
  },
  required: ["nome", "punti", "fonte"],
};

const SERIES_DESCRIPTION = [
  "Elenca cosa si può prevedere adesso: le serie incluse, i CSV caricati in media/previsioni/dati/ e lo stato del servizio Timestral.",
  "Usalo prima di timestral_forecast quando non sai quali serie esistono, o quando l'utente chiede «cosa posso prevedere?». Costa nulla.",
].join("\n");

const SERIES_PARAMETERS = {
  type: "object",
  properties: {
    azione: { type: "string", enum: ["elenco", "stato"], description: "elenco (default): serie disponibili. stato: servizio, taglia, RAM, ultima attività." },
  },
  required: [],
};

/** Numeri leggibili senza mentire sulla precisione: 0,88511 non diventa 0,9. */
function num(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
  const n = Number(v);
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a < 0.001) return n.toPrecision(3);
  if (a < 1) return n.toFixed(4);
  if (a < 100) return n.toFixed(2);
  if (a < 100000) return n.toFixed(1);
  return n.toLocaleString("it-IT", { maximumFractionDigits: 0 });
}

const pc = (v) => (Number.isFinite(Number(v)) ? `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2)}%` : "—");

/** Almeno una differenza fra i numeri, senza rumore: tabella con 6-10 righe. */
function tabella(serie, passi = 8) {
  const h = serie.median.length;
  const ogni = Math.max(1, Math.ceil(h / passi));
  const righe = ["| passo | mediana | q05 | q95 |", "|---|---|---|---|"];
  const indici = [];
  for (let i = ogni - 1; i < h; i += ogni) indici.push(i);
  if (indici[indici.length - 1] !== h - 1) indici.push(h - 1); // l'ultimo passo c'è sempre
  for (const i of indici) {
    righe.push(`| ${i + 1} | ${num(serie.median[i])} | ${num(serie.q05[i])} | ${num(serie.q95[i])} |`);
  }
  return righe.join("\n");
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "serie";
}

/** Scrive la previsione in CSV (e restituisce il percorso relativo al media dir). */
function salvaCsv({ mediaDir, nome, out }) {
  const dir = join(mediaDir, "previsioni");
  mkdirSync(dir, { recursive: true });
  const oggi = new Date().toISOString().slice(0, 10);
  const file = join(dir, `${oggi}-${slug(nome)}-${out.prediction_length}p.csv`);
  const righe = ["passo,mediana,q05,q25,q75,q95"];
  for (let i = 0; i < out.prediction_length; i += 1) {
    const s = out.series[0];
    righe.push([i + 1, s.median[i], s.q05[i], s.q25[i], s.q75[i], s.q95[i]].join(","));
  }
  writeFileSync(file, righe.join("\n") + "\n");
  return file.startsWith(mediaDir) ? file.slice(mediaDir.length).replace(/^\/+/, "") : file;
}

/** Le due o tre cose che l'analisi dice meglio di una frase generica. */
function righeInsight(a) {
  if (!a) return "";
  const pct = (v) => (Number.isFinite(Number(v)) ? `${Number(v) > 0 ? "+" : ""}${Number(v).toFixed(2).replace(".", ",")}%` : "—");
  const r = [];
  const t = Number(a.tendenza_r2);
  const tipo = t >= 0.7 ? "netta" : t >= 0.3 ? "moderata" : "assente o quasi";
  r.push(`- tendenza lineare: ${tipo} (R² ${t.toFixed(2).replace(".", ",")}, ${a.tendenza_per_passo > 0 ? "+" : ""}${a.tendenza_per_passo} per ${a.unita.replace(/i$/, "o")})`);
  if (Number.isFinite(Number(a.rumore))) {
    const q = a.rumore < 0.4 ? "movimento leggibile" : a.rumore < 0.7 ? "abbastanza rumorosa" : "dominata dal rumore: la linea del modello dirà poco";
    r.push(`- rumore: ${String(a.rumore).replace(".", ",")} dei movimenti (${q})`);
  }
  if (Number.isFinite(Number(a.volatilita_pct))) r.push(`- variazione tipica per passo: ${String(a.volatilita_pct).replace(".", ",")}%`);
  if (a.ciclo) r.push(`- ciclicità: si ripete ogni ${a.ciclo.ogni} ${a.unita} (autocorrelazione ${String(a.ciclo.autocorrelazione).replace(".", ",")}${a.ciclo.autocorrelazione < 0 ? ", in controfase" : ""})`);
  else r.push(`- ciclicità: non emerge ai lag controllati`);
  if (a.anomalie && a.anomalie.length) r.push(`- valori anomali: ${a.anomalie.slice(-2).map((x) => `${x.data || x.posizione} (${x.valore})`).join(", ")}`);
  if (a.mancanti) r.push(`- dati mancanti: ${a.mancanti} punti`);
  r.push(`- periodo: ${a.dal || "?"} → ${a.al || "?"}, ${a.punti} punti (variazione ${pct(a.variazione_finestra)})`);
  return r.join("\n");
}

export function createTimestralExtension({ client, mediaDir, log = (m) => console.log(m) }) {
  const FORECAST = {
    name: "timestral_forecast",
    label: "Previsioni su serie temporali (Timestral)",
    description: FORECAST_DESCRIPTION,
    promptSnippet:
      "timestral_forecast: previsione probabilistica (mediana + quantili) di serie temporali con il modello locale Timestral. " +
      "È una STIMA: dichiaralo sempre, insieme all'ampiezza della banda di incertezza.",
    promptGuidelines: [
      "Presenta il risultato come stima probabilistica: mediana + intervallo, non un numero secco. Se la banda 80% è larga rispetto a ciò che interessa all'utente, la risposta onesta è che il modello non lo sa.",
      "Non omettere `p_rise_end` quando c'è: è la probabilità (dai quantili, non calibrata) che il valore finale superi l'ultimo osservato.",
      "Se il futuro dipende da un evento noto e datato, dillo: il modello non conosce notizie, e la previsione è la continuazione statistica della serie.",
      "Per una serie troppo corta o troppo irregolare, il tool risponde con un errore istruttivo: non insistere con altri parametri, spiega il limite.",
      "Se il servizio non risponde non è un guasto della feature: è il processo `timestral.service` spento. Dillo all'utente con il comando per accenderlo, e non riprovare a vuoto.",
    ],
    parameters: FORECAST_PARAMETERS,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const t0 = Date.now();
      try {
        if (!client.prefs.enabled) {
          return {
            content: [{ type: "text", text: "Previsioni disattivate su questa istanza (interruttore `timestral` nel menu «servizi»)." }],
            details: { off: true },
            isError: true,
          };
        }
        const fonti = client.preparaSerie({
          demo: Array.isArray(params?.demo) ? params.demo : params?.demo ? [params.demo] : undefined,
          csv: params?.csv,
          series: params?.series,
          column: params?.column,
          valueColumn: params?.value_column,
        });
        const h = Math.max(1, Math.min(4096, Number(params?.prediction_length) || client.prefs.prediction_length));
        const congiunta = params?.congiunta === true && fonti.length > 1;
        const st = await client.status();
        if (!st.up) {
          return {
            content: [
              {
                type: "text",
                text:
                  `Il servizio Timestral non risponde su 127.0.0.1:${st.port} (${st.motivo}).\n` +
                  "Non è la feature: è il processo condiviso `timestral.service` che è fermo. Per accenderlo: `systemctl start timestral` " +
                  "(o chiedi a chi amministra la macchina). Non riprovare a vuoto.",
              },
            ],
            details: { down: true, stato: st },
            isError: true,
          };
        }
        const out = await client.prevedi({
          series: fonti.map((f) => ({ name: f.nome, values: f.valori })),
          prediction_length: h,
          mode: congiunta ? "joint" : "separate",
        });
        const ms = Date.now() - t0;
        // l'unità dell'orizzonte si deduce dalla frequenza dichiarata della serie: «12 passi»
        // non dice niente, «12 mesi» sì
        const freq = (fonti[0]?.meta?.frequenza || "").toLowerCase();
        const unita = /mese/.test(freq) ? "mesi" : /settiman/.test(freq) ? "settimane" : /ora/.test(freq) ? "ore" : /giorn/.test(freq) ? "giorni" : "passi";
        const blocchi = [
          `**Timestral ${out.taglia}** — ${fonti.length === 1 ? `serie «${fonti[0].nome}»` : `${fonti.length} serie${congiunta ? " (previsione congiunta)" : " (separate)"}`}, ${h} ${unita} (${out.latency_s}s di calcolo, ${(ms / 1000).toFixed(1)}s totali).`,
        ];
        const dettagli = [];
        for (const [i, s] of out.series.entries()) {
          const meta = fonti[i]?.meta || {};
          const st2 = s.stats || {};
          blocchi.push(
            [
              `\n**${s.name}**${meta.sintetica === true ? " _(serie sintetica di esempio)_" : ""}`,
              `- ultimo osservato: ${num(s.last_observed)}${meta.unita ? ` ${meta.unita}` : ""}`,
              // l'ampiezza in percentuale ha senso solo su serie positive: su valori che
              // attraversano lo zero diventa un numero enorme e inutile
              `- fine orizzonte: mediana **${num(st2.median_end)}** · intervallo 80% ${num(s.q10[s.median.length - 1])}–${num(s.q90[s.median.length - 1])} · intervallo 95% ${num(s.q05[s.median.length - 1])}–${num(s.q95[s.median.length - 1])}` +
                (Number.isFinite(Number(st2.band80_width_pct)) && (s.last_observed ?? 0) > 0 ? ` · ampiezza ${st2.band80_width_pct}%` : ""),
              `- variazione attesa alla fine: ${st2.expected_change_end == null ? "—" : num(st2.expected_change_end)} (${pc(st2.expected_change_end_pct)}) · P(rialzo) = ${st2.p_rise_end == null ? "—" : Number(st2.p_rise_end).toFixed(2)}`,
              tabella(s),
            ].join("\n"),
          );
          dettagli.push({ nome: s.name, ultimo: s.last_observed, stats: st2, meta });
        }
        let percorso = null;
        if (out.series.length === 1) {
          try {
            percorso = salvaCsv({ mediaDir, nome: out.series[0].name, out });
          } catch (err) {
            log(`[Timestral] CSV non scritto: ${err?.message ?? err}`);
          }
        }
        // Cosa dicono i DATI (aritmetica sul passato), distinto da cosa dice il modello:
        // serve a non attribuire al modello una tendenza che si vede già nella serie.
        let bloccoInsight = "";
        try {
          const unitaIns = /mese/.test(fonti[0]?.meta?.frequenza || "") ? "mesi" : /ora/.test(fonti[0]?.meta?.frequenza || "") ? "ore" : /giorn/.test(fonti[0]?.meta?.frequenza || "") ? "giorni" : "passi";
          const an = analizza({ values: fonti[0].valori, dates: fonti[0].date || null, unita: unitaIns });
          bloccoInsight = `\n**Cosa dicono i dati** (calcolato sulla serie, non dal modello)\n${righeInsight(an)}`;
        } catch (err) {
          log(`[Timestral] analisi non riuscita: ${err?.message ?? err}`);
        }
        const corte = fonti.filter((f) => f.valori.length < 50);
        if (corte.length) {
          blocchi.push(
            `\n⚠ ${corte.length === 1 ? `La serie «${corte[0].nome}» ha` : `${corte.length} serie hanno`} meno di 50 punti: ` +
              "con così poco storico la previsione è **indicativa** (il modello ha visto poco di questa serie).",
          );
        }
        blocchi.push(
          [
            percorso ? `\nFile con tutti i passi e i quantili: \`${percorso}\` (nella cartella media).` : "",
            bloccoInsight,
            "Questa è una **stima probabilistica** di un modello pre-addestrato (zero-shot): mediana e quantili, non un fatto. " +
              "Il modello non conosce notizie né eventi annunciati; le probabilità vengono dai quantili e non sono calibrate.",
          ]
            .filter(Boolean)
            .join("\n"),
        );
        return {
          content: [{ type: "text", text: blocchi.join("\n") }],
          details: { taglia: out.taglia, prediction_length: h, latenza_s: out.latency_s, serie: dettagli, file: percorso },
        };
      } catch (err) {
        const msg = String(err?.message ?? err);
        log(`[Timestral] previsione non riuscita: ${msg}`);
        return {
          content: [{ type: "text", text: `PREVISIONE NON ESEGUITA — ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
    },
  };

  const IMPORT = {
    name: "timestral_importa",
    label: "Importa una serie trovata sul web o in un documento",
    description: IMPORT_DESCRIPTION,
    promptSnippet:
      "timestral_importa: salva nei dati delle previsioni una serie che hai trovato tu (web, PDF, CSV), con la fonte: " +
      "da lì diventa prevedibile e visibile nella vista «Previsioni».",
    promptGuidelines: [
      "Non inventare mai i valori: importa solo numeri che hai letto in una fonte, e dichiara la fonte in modo che si possa ricontrollare (ente, serie, URL, data di estrazione).",
      "Se la fonte ha buchi o periodi mancanti, dillo nel campo `nota` invece di riempirli: il modello tratta i buchi come valori mancanti, ma l'utente deve saperlo.",
      "Dichiarare la frequenza non è un dettaglio: con «1 mese» la previsione si legge in mesi e l'orizzonte va scelto di conseguenza.",
      "Se i punti sono meno di ~50, avvisa l'utente che la previsione sarà indicativa; se sono meno di 8, non importare e chiedi altri dati.",
    ],
    parameters: IMPORT_PARAMETERS,
    async execute(_id, params) {
      try {
        if (!client.prefs.enabled) {
          return { content: [{ type: "text", text: "Previsioni disattivate su questa istanza: l'importazione è bloccata dallo stesso interruttore." }], details: { off: true }, isError: true };
        }
        const r = client.salvaSerie({
          nome: params?.nome,
          punti: params?.punti,
          fonte: params?.fonte,
          fonteUrl: params?.fonte_url,
          unita: params?.unita,
          frequenza: params?.frequenza,
          nota: params?.nota,
        });
        const avviso = r.punti < 50 ? `\n⚠ Solo ${r.punti} punti: con così poco storico la previsione è **indicativa**.` : "";
        return {
          content: [
            {
              type: "text",
              text:
                `Serie importata: **${r.nome}** — ${r.punti} punti` +
                (r.scartate ? ` (${r.scartate} righe scartate)` : "") +
                `, file \`${r.percorso}\`, provenienza: ${params.fonte}.\n` +
                `Ora è prevedibile con \`timestral_forecast\` usando \`csv: "${r.nome}.csv"\`, e la trovi nella vista «Previsioni» con la sua fonte.${avviso}`,
            },
          ],
          details: { serie: r },
        };
      } catch (err) {
        const msg = String(err?.message ?? err);
        log(`[Timestral] importazione non riuscita: ${msg}`);
        return { content: [{ type: "text", text: `IMPORTAZIONE NON ESEGUITA — ${msg}` }], details: { error: msg }, isError: true };
      }
    },
  };

  const SERIES = {
    name: "timestral_series",
    label: "Serie disponibili per le previsioni",
    description: SERIES_DESCRIPTION,
    promptSnippet: "timestral_series: elenca le serie prevendibili (demo incluse e CSV caricati) e lo stato del servizio Timestral.",
    promptGuidelines: [
      "Chiamalo prima di timestral_forecast se non sai quali serie esistono; non inventare id di serie.",
      "Se l'utente vuole prevedere dati propri e non c'è nessun CSV, dirgli di caricarlo in media/previsioni/dati/ (colonna data + colonna valore) oppure passare i valori direttamente.",
    ],
    parameters: SERIES_PARAMETERS,
    async execute(_id, params, _ctx) {
      const azione = String(params?.azione || "elenco").toLowerCase();
      const st = await client.status();
      if (azione === "stato") {
        const riga = st.up
          ? `Timestral: acceso — taglia ${st.taglia}, modello ${st.caricato ? `caricato (${st.ram_processo_mb} MB)` : "non caricato (si carica alla prima richiesta)"}, ${st.richieste} previsioni servite, porta ${st.port}.`
          : `Timestral: NON in ascolto su 127.0.0.1:${st.port} (${st.motivo}). Il processo si accende con \`systemctl start timestral\`.`;
        return { content: [{ type: "text", text: riga }], details: { stato: st } };
      }
      const demo = client.demo();
      const csv = client.csvDisponibili();
      const righe = ["**Serie incluse (demo):**"];
      for (const s of demo) {
        righe.push(
          `- \`${s.id}\` — ${s.nome}, ${s.punti.length} punti${s.unita ? `, unità ${s.unita}` : ""}${s.frequenza ? `, passo ${s.frequenza}` : ""}${s.sintetica ? " — **sintetica**" : ""} · fonte: ${s.fonte}`,
        );
      }
      righe.push("\n**CSV caricati** (`media/previsioni/dati/`):");
      if (!csv.length) righe.push("- nessuno: per usarne uno, carica un CSV con una colonna di date e una di valori.");
      for (const c of csv) righe.push(`- \`${c.nome}\`${c.kb ? ` (${c.kb} KB)` : ""}`);
      righe.push(
        `\n**Servizio:** ${st.up ? `acceso, taglia ${st.taglia}${st.caricato ? `, modello caricato (${st.ram_processo_mb} MB)` : ", modello non caricato"}` : `non in ascolto su 127.0.0.1:${st.port}`}.`,
      );
      return {
        content: [{ type: "text", text: righe.join("\n") }],
        details: { demo: demo.map((s) => s.id), csv, stato: st },
      };
    },
  };

  return {
    name: "timestral-tool",
    toolNames: [FORECAST.name, SERIES.name, IMPORT.name],
    factory: (pi) => {
      pi.registerTool(FORECAST);
      pi.registerTool(SERIES);
      pi.registerTool(IMPORT);
      log("[Timestral] tool «timestral_forecast», «timestral_series» e «timestral_importa» registrati");
    },
  };
}
