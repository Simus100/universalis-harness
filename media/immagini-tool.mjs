/**
 * Tool `genera_immagine` — generazione di immagini con i modelli Google (Nano Banana).
 *
 * Perché un tool e non solo la vista della dashboard: metà del lavoro con le immagini nasce
 * dentro una conversazione («mi serve una copertina per questo post»), e lì l'agente deve
 * poter generare, SALVARE in media/ e mostrare l'anteprima con il blocco ```img```.
 *
 * Regole di costo scritte nella descrizione del tool (è quello che il modello legge davvero):
 *   - il default è il modello ECONOMICO (`gemini-3.1-flash-lite-image`, ~$0,034 per immagine);
 *   - il modello più caro si usa solo se l'utente chiede qualità o dettaglio;
 *   - UNA immagine per chiamata: non si fanno 4 varianti «per scegliere» senza che l'utente
 *     le abbia chieste, perché ogni variante è denaro speso.
 */
import { generaImmagine, disponibile } from "./gemini-client.mjs";
import {
  FORMATI_IMMAGINE,
  MODELLI_IMMAGINE,
  MODELLO_IMMAGINE_DEFAULT,
  modelloImmagine,
  stimaCostoImmagine,
} from "./providers.mjs";
import { leggiRiferimento, leggiPrefs, registra, salvaImmagine } from "./immagini.mjs";

const CATALOGO = MODELLI_IMMAGINE.map((m) => `\`${m.id}\` (${m.nome}: ${m.nota})`).join("; ");

const DESCRIPTION = [
  "Genera un'immagine con un modello Google (Nano Banana) e la salva in `media/immagini/`, pronta da mostrare in chat con un blocco ```img.",
  "",
  `Modelli: ${CATALOGO}.`,
  `DEFAULT: \`${MODELLO_IMMAGINE_DEFAULT}\` — il più economico (~$0,034 per immagine). Usalo per tutto ciò che è illustrativo. ` +
    "Passa a un modello più caro SOLO se l'utente chiede qualità, dettaglio, testo leggibile dentro l'immagine o alta risoluzione: il costo per immagine sale (fino a ~$0,13–0,24).",
  "Il modello economico produce solo 1K; 2K e 4K esistono sugli altri modelli e si scelgono con `dimensione`.",
  "Una chiamata = una immagine. Non generare varianti multiple «per far scegliere» se l'utente non le ha chieste: ogni immagine è pagata.",
  "",
  "Scrivi il prompt in modo concreto (soggetto, stile, luce, inquadratura, cosa NON deve esserci) e in italiano se l'utente parla italiano; il testo DENTRO l'immagine va scritto tra virgolette nel prompt e va tenuto corto.",
  "Per modificare un'immagine esistente passa i percorsi in `riferimento` (relativi alla root) e descrivi la modifica: non serve rigenerare da zero.",
  "Dopo la generazione riporta il percorso e la stima di costo, e mostra l'anteprima col blocco ```img``` (percorso nella prima riga, didascalia nelle righe successive). Le immagini generate contengono un watermark SynthID: se l'utente deve sapere che è sintetica, dillo.",
  "Se la chiave Google manca o la quota è esaurita il tool risponde con un errore ISTRUTTIVO: non riprovare a vuoto né cambiare prompt a caso — riporta il motivo all'utente.",
].join("\n");

const PARAMETERS = {
  type: "object",
  properties: {
    prompt: { type: "string", description: "Cosa disegnare, in modo concreto. Il testo da scrivere dentro l'immagine va tra virgolette." },
    modello: {
      type: "string",
      enum: MODELLI_IMMAGINE.map((m) => m.id),
      description: `Modello. Default (e consigliato): ${MODELLO_IMMAGINE_DEFAULT} (economico).`,
    },
    formato: { type: "string", enum: FORMATI_IMMAGINE, description: "Proporzioni dell'immagine. Default 1:1." },
    dimensione: {
      type: "string",
      enum: ["1K", "2K", "4K"],
      description: "Risoluzione. 1K è il default e basta quasi sempre; 2K/4K solo su richiesta esplicita (e non su Lite).",
    },
    riferimento: {
      type: "array",
      items: { type: "string" },
      description: "Percorsi di immagini esistenti da usare come riferimento o da modificare (relativi alla root, es. media/foto.png).",
    },
  },
  required: ["prompt"],
};

export function createImmaginiExtension({ mediaDir, rootDir, prefs, log = (m) => console.log(m) }) {
  const GENERA = {
    name: "genera_immagine",
    label: "Genera un'immagine (Google Nano Banana)",
    description: DESCRIPTION,
    promptSnippet:
      "genera_immagine: crea un'immagine con Google Nano Banana e la salva in media/immagini/. Default economico; " +
      "una sola immagine per chiamata; mostrala con il blocco ```img e dichiara che è generata.",
    promptGuidelines: [
      "Usa il modello di default (economico) salvo richiesta esplicita di qualità o dettaglio.",
      "Non generare serie di varianti non richieste: ogni immagine costa.",
      "Mostra sempre il risultato con il blocco ```img e riporta il percorso del file.",
    ],
    parameters: PARAMETERS,
    async execute(_id, params) {
      const t0 = Date.now();
      const root = rootDir();
      const prompt = String(params?.prompt || "").trim();
      const p = prefs();
      const scelto = String(params?.modello || p.modello || MODELLO_IMMAGINE_DEFAULT);
      const formato = String(params?.formato || p.formato || "1:1");
      const dimensione = String(params?.dimensione || "1K").toUpperCase();
      try {
        if (!p.attivo) {
          return {
            content: [{ type: "text", text: "Generazione immagini disattivata su questa istanza (interruttore «immagini» nel menu «servizi»)." }],
            details: { off: true },
            isError: true,
          };
        }
        if (!disponibile()) {
          return {
            content: [
              {
                type: "text",
                text:
                  "IMMAGINE NON GENERATA — nessuna chiave Google configurata. Serve una chiave di Google AI Studio in " +
                  "`GEMINI_API_KEY` (.env) oppure nel pannello «chiavi» della dashboard: senza, il modello non è raggiungibile. " +
                  "Non è un guasto dell'harness.",
              },
            ],
            details: { noKey: true },
            isError: true,
          };
        }
        if (!prompt) throw new Error("prompt mancante");
        const meta = modelloImmagine(scelto) || modelloImmagine(MODELLO_IMMAGINE_DEFAULT);
        const dim = meta.dimensioni.includes(dimensione) ? dimensione : meta.dimensioni[0];
        const rif = Array.isArray(params?.riferimento)
          ? params.riferimento.map((x) => leggiRiferimento(root, x))
          : [];
        const out = await generaImmagine({ prompt, model: meta.id, formato, dimensione: dim, riferimenti: rif });
        const file = await salvaImmagine({ dati: out.dati, mime: out.mime, prompt, mediaDir, rootDir: root });
        const costo = stimaCostoImmagine(meta.id);
        await registra(mediaDir, {
          esito: "ok",
          modello: meta.id,
          formato,
          dimensione: dim,
          file: file.relativo,
          byte: file.byte,
          ms: Date.now() - t0,
          costo_usd: costo,
          riferimento: rif.length,
          prompt: prompt.slice(0, 240),
          origine: "tool",
        });
        const righe = [
          `Immagine generata con **${meta.nome}** (${meta.id}), ${formato}, ${dim}.`,
          `File: \`${file.relativo}\` (${Math.round(file.byte / 1024)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s).`,
          costo != null ? `Costo stimato: ~$${costo.toFixed(4)} (listino Google, stima).` : "Costo: prezzo non verificato per questo modello.",
          "",
          "```img",
          file.relativo,
          // una riga sola: un a capo dentro il prompt spezzerebbe il blocco e la didascalia
          // diventerebbe un secondo "percorso" (la card lo rifiuterebbe)
          String(prompt).replace(/\s+/g, " ").slice(0, 160),
          "```",
          "",
          "È un'immagine generata da un modello (contiene il watermark SynthID): se serve dichiararlo a chi la vedrà, fallo.",
        ];
        if (out.testo) righe.splice(1, 0, `Nota del modello: ${out.testo.slice(0, 300)}`);
        return {
          content: [{ type: "text", text: righe.join("\n") }],
          details: { file: file.relativo, modello: meta.id, formato, dimensione: dim, byte: file.byte, costo_usd: costo, ms: Date.now() - t0 },
        };
      } catch (err) {
        const msg = String(err?.message ?? err);
        log(`[immagini] generazione non riuscita: ${msg}`);
        try {
          await registra(mediaDir, { esito: "errore", modello: scelto, formato, dimensione, errore: msg.slice(0, 300), prompt: prompt.slice(0, 240), origine: "tool" });
        } catch {
          /* il registro non deve mai nascondere l'errore vero */
        }
        return { content: [{ type: "text", text: `IMMAGINE NON GENERATA — ${msg}` }], details: { error: msg }, isError: true };
      }
    },
  };

  return {
    name: "immagini-tool",
    toolNames: [GENERA.name],
    // esposto per i test: la factory registra, ma la logica si prova senza un turno agente
    tools: [GENERA],
    factory: (pi) => {
      pi.registerTool(GENERA);
      log("[immagini] tool «genera_immagine» registrato");
    },
  };
}

