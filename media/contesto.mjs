/**
 * Il bilancio del contesto, lo spreco di cache, la classe di un errore.
 *
 * Tutto qui dentro è PURO: nessun filesystem, nessuna rete, nessuna sessione. Serve perché
 * queste tre cose sono le uniche del piano di audit che si possono verificare con un test
 * vero — e perché una dashboard che dice "contesto 43%" senza dire *cosa* occupa quei token
 * non permette di decidere niente.
 *
 * La stima dei token è dichiaratamente approssimata: caratteri / 3.6 (italiano e codice misti,
 * rapporto misurato a mano sui prompt di questo harness). Non è il tokenizer del modello e non
 * pretende di esserlo: serve a ORDINARE le sezioni e a vedere se una crescita è fisiologica o
 * patologica. Quando il conteggio vero è disponibile (l'usage dell'API), vince quello.
 */

/** Rapporto caratteri/token usato per le stime. Dichiarato in chiaro: chi legge sa quanto vale. */
export const CARATTERI_PER_TOKEN = 3.6;

/** Costo di un'immagine in token, convenzione dei provider (stima prudente). */
export const TOKEN_PER_IMMAGINE = 1600;

/** Stima i token di un testo. `null`/`undefined`/non-stringa → 0. */
export function stimaToken(testo) {
  if (typeof testo !== "string" || !testo) return 0;
  return Math.ceil(testo.length / CARATTERI_PER_TOKEN);
}

/**
 * Estrae da un contenuto di messaggio (stringa o array di parti) le lunghezze per categoria.
 * Tollerante per costruzione: un content che non conosciamo finisce in `altro`, non in un'eccezione.
 */
function misuraContenuto(content) {
  const out = { testo: 0, ragionamento: 0, risultati: 0, immagini: 0, altro: 0 };
  if (typeof content === "string") {
    out.testo += content.length;
    return out;
  }
  if (!Array.isArray(content)) {
    if (content && typeof content === "object") out.altro += JSON.stringify(content).length;
    return out;
  }
  for (const parte of content) {
    if (!parte || typeof parte !== "object") {
      if (typeof parte === "string") out.testo += parte.length;
      continue;
    }
    const tipo = String(parte.type || "");
    if (tipo === "text" || tipo === "input_text" || tipo === "output_text") {
      out.testo += String(parte.text ?? "").length;
    } else if (tipo === "thinking" || tipo === "reasoning" || tipo === "redacted_thinking") {
      out.ragionamento += String(parte.thinking ?? parte.text ?? "").length;
    } else if (tipo === "tool_result" || tipo === "tool_response") {
      const c = parte.content;
      out.risultati += typeof c === "string" ? c.length : JSON.stringify(c ?? "").length;
    } else if (tipo === "image" || tipo === "input_image") {
      out.immagini += 1;
    } else if (tipo === "tool_use" || tipo === "tool_call") {
      // la chiamata è piccola: la conto come conversazione, non come risultato
      out.testo += JSON.stringify(parte.input ?? parte.args ?? {}).length;
    } else {
      out.altro += JSON.stringify(parte).length;
    }
  }
  return out;
}

/**
 * Il bilancio del contesto, per sezione.
 *
 * @param {object} o
 * @param {Array} o.messaggi  messaggi della sessione (`{role, content}`), nell'ordine
 * @param {Array} [o.fissi]   sezioni sempre presenti: `[{nome, caratteri}]`
 * @param {number} [o.finestra] finestra del modello
 * @returns {{sezioni: Array<{nome,token,caratteri}>, totale:number, percento:number|null,
 *            conversazione:number, risultati:number, ragionamento:number}}
 */
export function bilancioContesto({ messaggi = [], fissi = [], finestra = 0 } = {}) {
  const acc = { fissi: 0, conversazione: 0, risultati: 0, ragionamento: 0, immagini: 0, altro: 0 };
  const caratteriFissi = new Map();
  for (const s of fissi) {
    const n = String(s?.caratteri ?? 0) | 0;
    caratteriFissi.set(String(s?.nome ?? "prefisso"), n);
    acc.fissi += n;
  }
  const lista = Array.isArray(messaggi) ? messaggi : [];
  for (const m of lista) {
    if (!m) continue;
    const parti = misuraContenuto(m.content);
    const ruolo = String(m.role || "");
    if (ruolo === "toolResult" || ruolo === "tool") {
      // il risultato di un tool è la voce che cresce di più: va isolata, non mescolata al testo
      acc.risultati += parti.testo + parti.risultati + parti.altro;
    } else {
      acc.conversazione += parti.testo + parti.altro;
      acc.risultati += parti.risultati;
    }
    acc.ragionamento += parti.ragionamento;
    acc.immagini += parti.immagini;
  }

  const sezioni = [];
  for (const [nome, caratteri] of caratteriFissi) {
    if (caratteri > 0) sezioni.push({ nome, token: stimaToken("x".repeat(caratteri)), caratteri });
  }
  const push = (nome, caratteri, extra = 0) => {
    if (caratteri > 0 || extra > 0) sezioni.push({ nome, token: stimaToken("x".repeat(caratteri)) + extra, caratteri });
  };
  push("conversazione", acc.conversazione);
  push("risultati dei tool", acc.risultati);
  push("ragionamento", acc.ragionamento);
  push("immagini", 0, acc.immagini * TOKEN_PER_IMMAGINE);
  push("altro", acc.altro);

  const totale = sezioni.reduce((a, s) => a + s.token, 0);
  return {
    sezioni,
    totale,
    percento: finestra > 0 ? Math.round((totale / finestra) * 1000) / 10 : null,
    conversazione: sezioni.find((s) => s.nome === "conversazione")?.token ?? 0,
    risultati: sezioni.find((s) => s.nome === "risultati dei tool")?.token ?? 0,
    ragionamento: sezioni.find((s) => s.nome === "ragionamento")?.token ?? 0,
    messaggi: lista.length,
  };
}

/**
 * Lo spreco di prompt-cache.
 *
 * Definizione operativa (la stessa di Manus, applicata a ciò che l'usage delle API permette di
 * vedere): un turno ha "sprecato" i token che erano già nel prompt del turno precedente e che il
 * provider ha ri-fatturato a prezzo pieno invece di servirli dalla cache.
 *
 * @param {Array<{promptTokens:number, cacheRead:number}>} turni in ordine cronologico
 * @param {number} prezzoUnitario dollari per token (prezzo input pieno)
 * @param {number} [scontoCache=0.1] quanto costa un token letto da cache rispetto al pieno
 * @returns {{missedTokens:number, missedCost:number, missCount:number, hitRate:number|null}}
 */
export function sprecoCache(turni = [], prezzoUnitario = 0, scontoCache = 0.1) {
  const lista = (Array.isArray(turni) ? turni : []).filter(
    (t) => t && Number.isFinite(t.promptTokens) && t.promptTokens > 0,
  );
  let missedTokens = 0;
  let missCount = 0;
  let promptTot = 0;
  let cacheTot = 0;
  for (let i = 0; i < lista.length; i++) {
    const t = lista[i];
    promptTot += t.promptTokens;
    cacheTot += Math.max(0, Math.min(t.cacheRead || 0, t.promptTokens));
    if (i === 0) continue; // il primo turno non può riusare niente: non è uno spreco
    const precedente = lista[i - 1].promptTokens;
    // i token del prompt precedente che ancora esistono in questo prompt
    const riusabili = Math.max(0, Math.min(precedente, t.promptTokens));
    const letti = Math.max(0, t.cacheRead || 0);
    const persi = Math.max(0, riusabili - letti);
    // soglia di rumore: sotto i 200 token non è un difetto, è arrotondamento del provider
    if (persi > 200) {
      missedTokens += persi;
      missCount++;
    }
  }
  const missedCost = missedTokens * prezzoUnitario * (1 - scontoCache);
  return {
    missedTokens,
    missedCost,
    missCount,
    hitRate: promptTot > 0 ? cacheTot / promptTot : null,
  };
}

/**
 * La classe di un errore di tool. Le classi sono quelle che cambiano la REAZIONE giusta:
 * riprovare ha senso per `rete` e `timeout`, non per `permesso` o `servizio-giu`.
 * Basata sulle evidenze di SHIELDA (arXiv 2508.07935) e sui guasti visti in questo harness.
 */
export function classeErrore({ toolName = "", testo = "" } = {}) {
  const s = String(testo || "").toLowerCase();
  const tool = String(toolName || "");

  if (/econnrefused|fetch failed|enotfound|eai_again|socket hang up|network|dns/.test(s))
    return { classe: "rete", suggerimento: "Riprova una volta; se persiste, dichiara che la rete non risponde." };
  if (/etimedout|timed out|timeout|time out|deadline exceeded/.test(s))
    return { classe: "timeout", suggerimento: "Riprova con meno dati o un lavoro più piccolo; non ripetere identico." };
  if (/eacces|eperm|permission denied|not permitted|operazione non permessa|403/.test(s))
    return { classe: "permesso", suggerimento: "Non riprovare: cambia percorso o chiedi all'utente." };
  if (/systemctl|service .* not|connection refused.*8018|modello non caricato|non (?:è )?in ascolto|servizio .*fermo/.test(s))
    return { classe: "servizio-giu", suggerimento: "Non riprovare: il servizio è fermo. Dillo e indica come avviarlo." };
  if (/schema|unexpected token|invalid json|jsonschema|required property|expected .* but got/.test(s))
    return { classe: "schema", suggerimento: "Riformula gli argomenti una volta rispettando lo schema, poi fermati." };
  if (/enoent|no such file|not found|404|non esiste/.test(s))
    return { classe: "non-trovato", suggerimento: "Verifica il percorso con una ricerca prima di riprovare." };
  if (/invalid argument|missing required|argument|parametro|must be/.test(s))
    return { classe: "argomenti", suggerimento: "Correggi l'argomento sbagliato, non ripetere la stessa chiamata." };
  if (/aborted|cancellat|interrotto|annullat/.test(s))
    return { classe: "interrotto", suggerimento: "Il turno è stato interrotto dall'utente: non c'è niente da riparare." };
  if (tool && s) return { classe: "sconosciuta", suggerimento: "Leggi il messaggio: se non è chiaro, cambia strada invece di ripetere." };
  return { classe: "nessuna", suggerimento: "" };
}

/**
 * Impronta breve di una stringa, per verificare che il prefisso NON cambi fra due costruzioni.
 * Non è crittografia: è un confronto fra due stati dello stesso processo.
 * (FNV-1a a 32 bit: due righe, zero dipendenze, sufficiente per un test di stabilità.)
 */
export function impronta(testo) {
  let h = 0x811c9dc5;
  const s = String(testo ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
