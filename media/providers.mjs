/**
 * Catalogo dei provider NON-segreto e regole di presentazione dei modelli.
 *
 * Perché esiste questo file: il catalogo dei modelli Google (nomi, costi, limiti di contesto)
 * vive DENTRO il runtime (`@earendil-works/pi-coding-agent`), ma non contiene le scelte di
 * QUESTA installazione: quali modelli mostrare nel selettore, quali servono a generare
 * immagini, quale sia il default economico, come si chiamano gli errori. Queste scelte sono
 * codice, quindi stanno nel repository; le CHIAVI stanno fuori (`.env` o `~/.pi/agent/auth.json`).
 *
 * Nessun segreto qui dentro: solo id, nomi, prezzi pubblici e regole.
 */

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Il modello decisionale (Decisions API): probabilità calibrate, zero token di output. */
export const MODELLO_DECISIONE = "gemini-decision-1";

/**
 * Modelli di generazione immagini, dal più economico al più capace.
 *
 * `costo_usd` = prezzo PUBBLICO di UNA immagine 1K (listino Google, novembre 2026), usato solo
 * per la stima mostrata nella dashboard: le immagini si pagano a token di output immagine, non
 * a immagine, quindi il numero è una stima e nella UI è dichiarata come tale. `null` = prezzo
 * non verificato: la UI scrive «n.d.» invece di inventare una cifra.
 */
export const MODELLI_IMMAGINE = [
  {
    id: "gemini-3.1-flash-lite-image",
    nome: "Nano Banana 2 Lite",
    costo_usd: 0.0336,
    dimensioni: ["1K"],
    nota: "il più economico: ~$0,034 per immagine, solo 1K, fino a 14 immagini di riferimento",
  },
  {
    id: "gemini-3.1-flash-image",
    nome: "Nano Banana 2",
    costo_usd: 0.067,
    dimensioni: ["1K", "2K", "4K"],
    nota: "via di mezzo: ~$0,067 a 1K, accetta 2K e 4K",
  },
  {
    id: "gemini-3-pro-image",
    nome: "Nano Banana Pro",
    costo_usd: 0.134,
    dimensioni: ["1K", "2K", "4K"],
    nota: "qualità massima: ~$0,134 a 1K/2K, ~$0,24 a 4K. Usalo solo se serve davvero",
  },
];

/** Il default: la richiesta dell'utente è «modelli economici salvo richiesta particolare». */
export const MODELLO_IMMAGINE_DEFAULT = MODELLI_IMMAGINE[0].id;

/** Formati offerti nella UI. Sono il sottoinsieme comune a tutti i modelli immagine. */
export const FORMATI_IMMAGINE = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "4:5", "5:4", "21:9"];

export function modelloImmagine(id) {
  return MODELLI_IMMAGINE.find((m) => m.id === id) || null;
}

/** Stima in dollari di una generazione, oppure null se il prezzo non è verificato. */
export function stimaCostoImmagine(id, quante = 1) {
  const m = modelloImmagine(id);
  if (!m || m.costo_usd == null) return null;
  return m.costo_usd * Math.max(1, Number(quante) || 1);
}

/**
 * Un modello è «da chat»? Il catalogo del runtime mescola chat, immagini, TTS, embedding,
 * live e ricerca: nel selettore in alto devono comparire SOLO i modelli con cui si può
 * davvero conversare, altrimenti scegliere `gemini-3.1-flash-lite-image` rompe la sessione.
 */
const NON_CHAT = /(?:^|[-_.])(image|tts|live|transcribe|embedding|computer-use|deep-research|robotics|lyria|genie|omni|aqa)(?:$|[-_.])/i;
/** Varianti che esistono ma non hanno senso nel selettore: rumore, non scelta. */
const NASCOSTI = new Set(["gemini-3.1-pro-preview-customtools"]);

/**
 * I modelli Google che si vedono nel selettore, e basta.
 *
 * Perché una lista bianca invece di «tutti quelli disponibili»: Google ne pubblica più di
 * venti (2.5 legacy, preview, varianti, gemma), e un selettore con venti voci non è una scelta —
 * è un elenco in cui si sbaglia. Qui ci sono i due Gemini 4 (hydrogen: equilibrato; neon:
 * il più capace dei due) e i due Flash-Lite (il più economico della generazione 3.5 e della 3.1),
 * più Gemma 4 che sul piano gratuito costa zero. Per usarne un altro basta aggiungerlo a questa
 * lista: è codice, non configurazione nascosta.
 */
export const GOOGLE_CHAT_VISIBILI = [
  "gemini-4-hydrogen",
  "gemini-4-neon",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemma-4-31b-it",
];

/**
 * Modelli che il catalogo del runtime installato non conosce ancora e che vanno dichiarati in
 * `~/.pi/agent/models.json` (li scrive `scripts/onboarding-provider.mjs --google`).
 * Prezzi: listino Google, novembre 2026, per milione di token (input/output; cacheRead = 10%).
 * Sono dati pubblici, non misure: nel file la provenienza è dichiarata.
 */
export const GOOGLE_CHAT_EXTRA = [
  {
    id: "gemini-4-hydrogen",
    name: "Gemini 4 Hydrogen",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 1.5, output: 7.5, cacheRead: 0.15, cacheWrite: 0 },
    thinkingLevelMap: { low: "LOW", medium: "MEDIUM", high: "HIGH" },
  },
  {
    id: "gemini-4-neon",
    name: "Gemini 4 Neon",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1048576,
    maxTokens: 65536,
    cost: { input: 3, output: 15, cacheRead: 0.15, cacheWrite: 0 },
    thinkingLevelMap: { low: "LOW", medium: "MEDIUM", high: "HIGH" },
  },
];
export function isChatModel(m) {
  const id = String(m?.id || "");
  if (!id) return false;
  if (m?.type && m.type !== "chat") return false;
  if (NASCOSTI.has(id)) return false;
  // Per Google decide la lista bianca: è più stretta del filtro per nome, e un modello nuovo
  // di Google non entra nel selettore da solo (lo si sceglie qui).
  if (m?.provider === "google") return GOOGLE_CHAT_VISIBILI.includes(id);
  return !NON_CHAT.test(id);
}

/**
 * Ordine del selettore: prima i modelli del provider attivo (chi sta lavorando non deve
 * cercarsi il proprio modello), poi i provider in ordine di importanza, e dentro ogni
 * provider i modelli «consigliati» prima dei legacy.
 */
const PROVIDER_ORDINE = ["deepseek", "google"];
const CONSIGLIATI = ["deepseek-flash", ...GOOGLE_CHAT_VISIBILI];

function rango(m) {
  const i = CONSIGLIATI.indexOf(m.id);
  return i === -1 ? CONSIGLIATI.length + 1 : i;
}

export function ordinaModelli(list, providerAttivo = "") {
  // «Attivo prima» e POI il gruppo: senza `1 +` il provider attivo si prendeva -1 e gli altri
  // zero/uno, quindi i modelli Google non-attivi (rank 1) finivano dopo DeepSeek (rank 0) e lo
  // stesso fornitore compariva in due blocchi separati del selettore.
  const p = (m) => {
    if (m.provider === providerAttivo) return 0;
    const i = PROVIDER_ORDINE.indexOf(m.provider);
    return 1 + (i === -1 ? PROVIDER_ORDINE.length : i);
  };
  return [...list].sort(
    (a, b) => p(a) - p(b) || rango(a) - rango(b) || String(a.id).localeCompare(String(b.id)),
  );
}

/** Etichetta leggibile: il nome commerciale se c'è, altrimenti l'id. */
export function etichettaModello(m) {
  const nome = String(m?.name || "").trim();
  if (nome && nome !== m.id) return nome;
  return String(m?.id || "");
}

/**
 * Frammento di `~/.pi/agent/models.json` per Google AI Studio.
 *
 * `apiKey: "$GEMINI_API_KEY"` NON è una chiave: è un riferimento alla variabile d'ambiente,
 * così il file di configurazione si può copiare/versionare senza portarsi dietro il segreto.
 * Modelli e costi restano quelli del catalogo del runtime (nessun prezzo inventato qui).
 */
export function configGoogle() {
  return {
    apiKey: "$GEMINI_API_KEY",
    api: "google-generative-ai",
    baseUrl: GEMINI_BASE,
    // solo i modelli che il catalogo del runtime non ha: quelli built-in non si duplicano
    models: GOOGLE_CHAT_EXTRA.map((m) => ({ ...m })),
  };
}

/** I provider che il pannello «chiavi» sa gestire, con la verifica che sa fare davvero. */
export const PROVIDER_GESTITI = [
  {
    id: "google",
    label: "Google AI Studio (Gemini)",
    envVar: "GEMINI_API_KEY",
    dove: "https://aistudio.google.com/apikey",
    nota: "testo, classificatore (Gemini Decision 1) e immagini (Nano Banana)",
    verifica: "google",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    envVar: "DEEPSEEK_API_KEY",
    dove: "https://platform.deepseek.com/api_keys",
    nota: "modelli di chat DeepSeek",
    verifica: "openai",
    baseUrl: "https://api.deepseek.com",
  },
];
