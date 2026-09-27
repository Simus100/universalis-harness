/**
 * Sanitizzatore SVG — modulo ISOMORFO (Node e browser).
 *
 * Serve alla dashboard per mostrare in chat i disegni SVG prodotti dal modello, che vanno
 * SEMPRE trattati come contenuto non attendibile: un SVG è un documento XML con un modello
 * di scripting (script, attributi evento, foreignObject, riferimenti di rete, DTD/entità).
 *
 * Perché un modulo e non una libreria: il progetto non ha dipendenze npm proprie e il file
 * viene servito anche al browser dalla rotta `/media/…`, così cliente e server usano lo
 * STESSO codice (una sola implementazione da testare, nessuna logica duplicata).
 *
 * Strategia (difesa in profondità, fail-closed):
 *  1) tokenizzatore XML rigoroso scritto a mano: NON si limita a "rimuovere le cose
 *     pericolose" da un testo che passa, ma RICOSTRUISCE un documento nuovo a partire dai
 *     soli costrutti riconosciuti; tutto ciò che non capisce è un ERRORE (mai una tolleranza
 *     silenziosa). Le espressioni regolari sono usate solo per validare valori di attributo
 *     già isolati dal parser, mai come difesa principale.
 *  2) whitelist rigida di elementi e attributi (niente script, foreignObject, style, image,
 *     use, href, filtri, animazioni, CSS).
 *  3) limiti di dimensione e complessità (byte, elementi, profondità, attributi, testo).
 *  4) il risultato, nel client, viene comunque passato a DOMParser e reso in un elemento
 *     <img> con Blob URL: un SVG caricato come immagine non esegue script e non scarica
 *     risorse esterne, quindi anche un ipotetico buco del sanitizzatore non ha effetto.
 *
 * Uso:
 *   import { sanitizeSvg, SVG_LIMITS } from "./svg-sanitize.mjs";
 *   const out = sanitizeSvg(raw);
 *   if (out.ok) mostra(out.svg); else mostraErrore(out.error);
 */

/** Limiti di default (sovrascrivibili per singola chiamata). */
export const SVG_LIMITS = {
  /** Byte massimi del documento di partenza. */
  maxBytes: 200_000,
  /** Byte massimi del documento prodotto. */
  maxOutBytes: 260_000,
  /** Elementi massimi (nodi, non attributi). */
  maxElements: 3000,
  /** Profondità massima di annidamento. */
  maxDepth: 32,
  /** Attributi massimi per elemento. */
  maxAttrsPerElement: 64,
  /** Lunghezza massima di un valore di attributo. */
  maxAttrValue: 20_000,
  /** Lunghezza massima di un singolo nodo di testo. */
  maxTextNode: 8_000,
  /** Lunghezza massima del testo complessivo. */
  maxTotalText: 60_000,
  /** Numero massimo di fermate di gradiente (offsets). */
  maxStops: 64,
};

/**
 * Elementi consentiti. Sono le forme, i gruppi, il testo, i gradienti e le clip: quanto
 * basta per diagrammi, timeline, mappe concettuali e piccole illustrazioni.
 * Fuori da questa lista restano (fra gli altri): script, foreignObject, style, image, use,
 * a, filter, animate, set, symbol, marker, pattern, switch.
 */
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
]);

/** Attributi di presentazione comuni a più elementi. */
const PRESENTATION_ATTRS = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity",
  "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "stroke-dashoffset",
  "stroke-miterlimit", "opacity", "color", "paint-order", "vector-effect",
  "clip-path", "clip-rule", "transform",
];

/** Attributi consentiti per singolo elemento (oltre a `id` e a quelli di presentazione). */
const ELEMENT_ATTRS = {
  svg: ["xmlns", "viewBox", "width", "height", "preserveAspectRatio", "role", "aria-label", "aria-labelledby", "version"],
  g: [],
  defs: [],
  title: [],
  desc: [],
  path: ["d", "pathLength"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
  text: ["x", "y", "dx", "dy", "font-family", "font-size", "font-weight", "font-style", "font-variant", "text-anchor", "dominant-baseline", "letter-spacing", "word-spacing", "text-decoration", "textLength", "lengthAdjust", "xml:space"],
  tspan: ["x", "y", "dx", "dy", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing"],
  linearGradient: ["x1", "y1", "x2", "y2", "gradientUnits", "gradientTransform", "spreadMethod"],
  radialGradient: ["cx", "cy", "r", "fx", "fy", "fr", "gradientUnits", "gradientTransform", "spreadMethod"],
  stop: ["offset", "stop-color", "stop-opacity"],
  clipPath: ["clipPathUnits", "transform"],
};

/** Attributi che possono contenere riferimenti `url(#id)`: solo locali e solo se l'id esiste. */
const PAINT_ATTRS = new Set(["fill", "stroke", "clip-path", "stop-color", "color"]);

/** Elementi che non possono contenere figli (si serializzano come auto-chiusi). */
const VOID_ELEMENTS = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "stop"]);

/** Elementi che accettano solo testo (title/desc) o solo testo per i gradienti… */
const TEXT_ONLY_ELEMENTS = new Set(["title", "desc"]);

const SVG_NS = "http://www.w3.org/2000/svg";

/** Indice case-insensitive dei nomi canonici (il modello può sbagliare una maiuscola). */
const ELEMENT_CANON = new Map([...ALLOWED_ELEMENTS].map((n) => [n.toLowerCase(), n]));
const ATTR_CANON = new Map();
for (const [element, list] of Object.entries(ELEMENT_ATTRS))
  for (const a of [...list, "id", ...PRESENTATION_ATTRS]) {
    ATTR_CANON.set(`${element}\u0000${a.toLowerCase()}`, a);
    ATTR_CANON.set(`*\u0000${a.toLowerCase()}`, a);
  }

/** Nome canonico di un elemento, oppure null se non consentito. */
function canonicalElement(name) {
  if (ALLOWED_ELEMENTS.has(name)) return name;
  return ELEMENT_CANON.get(String(name).toLowerCase()) || null;
}

/** Nome canonico di un attributo per quell'elemento, oppure null. */
function canonicalAttr(element, name) {
  const key = String(name).toLowerCase();
  return ATTR_CANON.get(`${element}\u0000${key}`) || ATTR_CANON.get(`*\u0000${key}`) || null;
}
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const NUMBER_LIST_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:\s*[, ]\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)*$/;
const PERCENT_OR_NUMBER_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?:%|px|pt|mm|cm|in|em|ex)?$/;
const TRANSFORM_RE = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\(\s*[-+0-9.eE,\s]*\)\s*)+$/;
const PATH_D_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9eE,.\s+-]*$/;
const COLOR_NAME_RE = /^[A-Za-z]{3,24}$/;
const COLOR_FUNC_RE = /^(?:rgb|rgba|hsl|hsla)\(\s*[-+0-9.%,\s]*\)$/;
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONT_FAMILY_RE = /^[A-Za-z0-9 ,'"_-]{1,120}$/;
const URL_FUNC_RE = /^url\(\s*#([A-Za-z][A-Za-z0-9_-]{0,63})\s*\)$/;
/** Un valore di attributo non deve contenere costrutti che cambiano il significato del markup. */
const FORBIDDEN_IN_VALUE_RE = /[<>]|&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

class SvgError extends Error {
  constructor(message) {
    super(message);
    this.name = "SvgError";
  }
}

/** Errore di sanitizzazione, in forma serializzabile. */
function fail(message) {
  throw new SvgError(message);
}

/** Lunghezza in byte indipendente dall'ambiente (browser senza Buffer, Node senza TextEncoder? no). */
function byteLength(str) {
  if (typeof TextEncoder === "function") return new TextEncoder().encode(str).length;
  return unescape(encodeURIComponent(str)).length;
}

/** Un nome di elemento/attributo è accettabile come "parola" XML? */
function readName(src, i) {
  const start = i;
  while (i < src.length && /[A-Za-z0-9_.:\-]/.test(src[i])) i++;
  if (i === start) fail("marchio XML senza nome");
  return { name: src.slice(start, i), next: i };
}

/** Decodifica un'entità XML; solo le cinque predefinite e i riferimenti numerici. */
function decodeEntity(src, i) {
  // src[i] è "&": cerca il ";" entro un limite ragionevole
  const semi = src.indexOf(";", i + 1);
  if (semi === -1 || semi - i > 12) fail("entità non terminata o non consentita");
  const body = src.slice(i + 1, semi);
  if (body === "amp") return { value: "&", next: semi + 1 };
  if (body === "lt") return { value: "<", next: semi + 1 };
  if (body === "gt") return { value: ">", next: semi + 1 };
  if (body === "quot") return { value: '"', next: semi + 1 };
  if (body === "apos") return { value: "'", next: semi + 1 };
  if (/^#\d{1,7}$/.test(body)) {
    const code = Number(body.slice(1));
    // niente riferimenti a caratteri di controllo o surrogati solitari
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd))
      return { value: String.fromCodePoint(code), next: semi + 1 };
    fail("riferimento a carattere non consentito");
  }
  if (/^#x[0-9a-fA-F]{1,6}$/.test(body)) {
    const code = parseInt(body.slice(2), 16);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd))
      return { value: String.fromCodePoint(code), next: semi + 1 };
    fail("riferimento a carattere non consentito");
  }
  fail(`entità "${body}" non consentita (solo le entità XML predefinite e i riferimenti numerici)`);
}

/** Scarta un commento XML, senza conservarne il contenuto. */
function skipComment(src, i) {
  const end = src.indexOf("-->", i + 4);
  if (end === -1) fail("commento XML non chiuso");
  return end + 3;
}

/**
 * Sanitizza un documento SVG.
 * @param {string} raw contenuto del blocco ```svg
 * @param {object} [options] override dei limiti (vedi SVG_LIMITS)
 * @returns {{ok:true, svg:string, warnings:string[], stats:{elements:number,bytes:number}}
 *          |{ok:false, error:string}}
 */
export function sanitizeSvg(raw, options = {}) {
  const limits = { ...SVG_LIMITS, ...options };
  const warnings = [];
  try {
    if (typeof raw !== "string") fail("contenuto non testuale");
    let src = raw.replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
    // L'eventuale dichiarazione XML all'inizio è inutile per noi (l'output è normalizzato)
    // e viene scartata: qualunque altra istruzione di elaborazione è un errore.
    let body = src;
    const decl = body.match(/^\s*<\?xml[^>]*\?>/);
    if (decl) body = body.slice(decl[0].length);
    if (byteLength(src) > limits.maxBytes) fail(`documento troppo grande (limite ${Math.round(limits.maxBytes / 1024)} KB)`);

    const parsed = parseDocument(body, limits, warnings);
    const usedIds = collectIds(parsed.root);
    const painted = checkReferences(parsed.root, usedIds);
    for (const p of painted) warnings.push(p);
    for (const w of parsed.warnings) warnings.push(w);
    const svg = serialize(parsed.root);
    if (byteLength(svg) > limits.maxOutBytes) fail("documento risultante troppo grande");
    return {
      ok: true,
      svg,
      // title/desc servono al client per l'etichetta accessibile dell'immagine.
      title: textOf(parsed.root, "title"),
      desc: textOf(parsed.root, "desc"),
      warnings,
      stats: { elements: parsed.count, bytes: byteLength(svg) },
    };
  } catch (err) {
    const msg = err instanceof SvgError ? err.message : `documento SVG non valido (${err && err.message ? err.message : err})`;
    return { ok: false, error: msg };
  }
}

/** Parsing dell'intero documento: restituisce l'albero ripulito. */
function parseDocument(src, limits, warnings) {
  const root = { name: "#document", attrs: {}, children: [] };
  const stack = [root];
  let i = 0;
  let count = 0;
  let totalText = 0;
  let closed = false;
  const outWarnings = [];

  const top = () => stack[stack.length - 1];
  const pushText = (text) => {
    if (!text) return;
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) fail("carattere di controllo non consentito nel testo");
    totalText += text.length;
    if (text.length > limits.maxTextNode) fail("nodo di testo troppo lungo");
    if (totalText > limits.maxTotalText) fail("testo complessivo troppo lungo");
    const parent = top();
    if (TEXT_ONLY_ELEMENTS.has(parent.name) || parent.name === "#document" || isContainer(parent.name)) {
      parent.children.push(text);
    } else {
      // il testo dentro elementi grafici è consentito (es. <text> e <tspan>), altrove ignorato
      if (parent.name === "text" || parent.name === "tspan") parent.children.push(text);
      else if (text.trim()) fail(`testo non consentito dentro <${parent.name}>`);
    }
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) {
      // testo residuo: ammesso solo se il documento è già chiuso o se è spazzatura bianca
      const rest = src.slice(i);
      if (!closed) pushText(decodeText(rest));
      else if (rest.trim()) fail("contenuto dopo la chiusura dell'elemento radice");
      i = src.length;
      break;
    }
    if (lt > i) {
      const chunk = src.slice(i, lt);
      if (!closed) pushText(decodeText(chunk));
      else if (chunk.trim()) fail("contenuto dopo la chiusura dell'elemento radice");
    }
    i = lt;

    if (src.startsWith("<!--", i)) {
      i = skipComment(src, i);
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) fail("CDATA non consentito");
    if (src.startsWith("<!", i)) fail("DTD o dichiarazione di tipo non consentiti (DOCTYPE/ENTITY)");
    if (src.startsWith("<?", i)) fail("istruzioni di elaborazione non consentite");

    if (src.startsWith("</", i)) {
      const read = readName(src, i + 2);
      let j = read.next;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] !== ">") fail("elemento di chiusura malformato");
      const node = top();
      if (node.name === "#document") fail("elemento di chiusura senza apertura");
      if (node.name !== canonicalElement(read.name)) fail(`chiusura di <${read.name}> mentre è aperto <${node.name}>`);
      stack.pop();
      if (stack.length === 1) closed = true;
      i = j + 1;
      continue;
    }

    // apertura di elemento
    const read = readName(src, i + 1);
    const canonName = canonicalElement(read.name);
    if (!canonName) fail(`elemento <${read.name}> non consentito`);
    const name = canonName;
    // la chiusura deve usare lo stesso nome scritto nell'apertura (verificata a parte)
    const rawName = read.name;
    if (stack.length === 1) {
      if (closed) fail("secondo elemento radice nel documento");
      if (name !== "svg") fail("l'elemento radice deve essere <svg>");
    }
    if (stack.length - 1 >= limits.maxDepth) fail(`annidamento oltre il limite (${limits.maxDepth})`);
    if (stack.length === 1 && top().name !== "#document") fail("elemento radice dentro un altro elemento");
    const parent = top();
    if (TEXT_ONLY_ELEMENTS.has(parent.name)) fail(`<${parent.name}> può contenere solo testo`);

    const attrs = {};
    let attrCount = 0;
    let j = read.next;
    let selfClosing = false;
    for (;;) {
      while (j < src.length && /\s/.test(src[j])) j++;
      if (j >= src.length) fail(`elemento <${name}> non chiuso`);
      if (src[j] === "/") {
        if (src[j + 1] !== ">") fail("auto-chiusura malformata");
        selfClosing = true;
        j += 2;
        break;
      }
      if (src[j] === ">") {
        j += 1;
        break;
      }
      const attr = readName(src, j);
      let k = attr.next;
      while (k < src.length && /\s/.test(src[k])) k++;
      if (src[k] !== "=") fail(`attributo "${attr.name}" senza valore (o valore non fra virgolette)`);
      k++;
      while (k < src.length && /\s/.test(src[k])) k++;
      const quote = src[k];
      if (quote !== '"' && quote !== "'") fail(`valore dell'attributo "${attr.name}" non fra virgolette`);
      const endQuote = src.indexOf(quote, k + 1);
      if (endQuote === -1) fail(`valore dell'attributo "${attr.name}" non chiuso`);
      const rawValue = src.slice(k + 1, endQuote);
      if (rawValue.length > limits.maxAttrValue) fail(`valore troppo lungo per l'attributo "${attr.name}"`);
      if (FORBIDDEN_IN_VALUE_RE.test(rawValue)) fail(`valore non consentito per l'attributo "${attr.name}"`);
      const value = decodeText(rawValue);
      if (attrCount >= limits.maxAttrsPerElement) fail(`troppi attributi su <${name}>`);
      // Blocchi espliciti PRIMA della whitelist: un attributo evento, un foglio di stile o
      // un riferimento esterno sono motivi di rifiuto dell'intero disegno, non da tollerare.
      if (/^on/i.test(attr.name)) fail(`attributo evento "${attr.name}" non consentito`);
      if (attr.name.toLowerCase() === "style" || attr.name.toLowerCase() === "class")
        fail(`attributo "${attr.name}" non consentito (nessun CSS)`);
      if (/^[A-Za-z0-9_.-]*:?href$/i.test(attr.name)) fail(`attributo "${attr.name}" non consentito: nessun riferimento esterno`);
      const canon = canonicalAttr(name, attr.name);
      if (!canon) {
        warnings.push(`attributo "${attr.name}" su <${name}> rimosso (non consentito)`);
        attrCount++;
        j = endQuote + 1;
        continue;
      }
      const checked = checkAttribute(name, canon, value, warnings);
      if (checked !== null) attrs[canon] = checked;
      attrCount++;
      j = endQuote + 1;
    }

    count++;
    if (count > limits.maxElements) fail(`troppi elementi (limite ${limits.maxElements})`);
    if (VOID_ELEMENTS.has(name) && !selfClosing) {
      // <rect></rect> è accettabile; ma <rect> con figli dentro no
      outWarnings.push(`<${name}> con contenuto: il contenuto è stato ignorato`);
    }
    const node = { name, attrs, children: [] };
    parent.children.push(node);
    if (!selfClosing && !VOID_ELEMENTS.has(name)) stack.push(node);
    else if (VOID_ELEMENTS.has(name)) {
      // consuma un'eventuale chiusura immediata
      let m = j;
      while (m < src.length && /\s/.test(src[m])) m++;
      if (src.startsWith(`</${name}`, m)) {
        const closeName = readName(src, m + 2);
        let p = closeName.next;
        while (p < src.length && /\s/.test(src[p])) p++;
        if (src[p] === ">") j = p + 1;
      }
    }
    i = j;
  }

  if (stack.length !== 1) fail(`elemento <${stack[stack.length - 1].name}> non chiuso`);
  if (!closed && !root.children.some((c) => c && c.name === "svg")) fail("documento senza elemento <svg>");
  const svg = root.children.find((c) => c && c.name === "svg");
  if (!svg) fail("documento senza elemento <svg>");
  const stray = root.children.filter((c) => typeof c === "string" ? c.trim() : c !== svg);
  if (stray.length) fail("contenuto fuori dall'elemento <svg>");
  normalizeRoot(svg, warnings);
  return { root: svg, count, warnings: outWarnings };
}

/** Elementi che possono contenere figli: tutto tranne quelli testuali e le fermate. */
function isContainer(name) {
  return !TEXT_ONLY_ELEMENTS.has(name) && name !== "stop";
}

/** Decodifica le entità di un frammento di testo (o valore) applicando i controlli. */
function decodeText(chunk) {
  if (!chunk.includes("&")) return chunk;
  let out = "";
  let i = 0;
  while (i < chunk.length) {
    const amp = chunk.indexOf("&", i);
    if (amp === -1) {
      out += chunk.slice(i);
      break;
    }
    out += chunk.slice(i, amp);
    const dec = decodeEntity(chunk, amp);
    out += dec.value;
    i = dec.next;
  }
  return out;
}

/**
 * Verifica un attributo già ricondotto al nome canonico. Restituisce il valore normalizzato
 * oppure null se l'attributo va rimosso (con un avviso).
 */
function checkAttribute(element, name, value, warnings) {
  const v = value.trim();
  if (!v) return null;

  if (name === "id") {
    if (!ID_RE.test(v)) fail(`id non valido: "${v}"`);
    return v;
  }

  if (PAINT_ATTRS.has(name)) {
    const paint = checkPaint(v);
    if (paint === null) {
      warnings.push(`valore non consentito per "${name}" (${v.slice(0, 24)}): attributo rimosso`);
      return null;
    }
    return paint;
  }

  switch (name) {
    case "d":
      if (!PATH_D_RE.test(v)) fail("tracciato (d) con caratteri non consentiti");
      return v;
    case "points":
      if (!NUMBER_LIST_RE.test(v)) fail("points con valori non consentiti");
      return v;
    case "transform":
      if (!TRANSFORM_RE.test(v)) fail("transform non valido");
      return v;
    case "gradientTransform":
      if (!TRANSFORM_RE.test(v)) fail("gradientTransform non valido");
      return v;
    case "viewBox": {
      const parts = v.split(/[\s,]+/).filter(Boolean);
      if (parts.length !== 4) fail("viewBox deve avere quattro numeri");
      const nums = parts.map(Number);
      if (nums.some((n) => !Number.isFinite(n))) fail("viewBox con valori non numerici");
      if (nums[2] <= 0 || nums[3] <= 0) fail("viewBox con larghezza o altezza non positive");
      return nums.join(" ");
    }
    case "preserveAspectRatio":
      if (!/^[A-Za-z ]{0,32}$/.test(v)) fail("preserveAspectRatio non valido");
      return v;
    case "font-family":
      if (!FONT_FAMILY_RE.test(v)) fail("font-family non valido");
      return v;
    case "font-size":
    case "font-weight":
    case "letter-spacing":
    case "word-spacing":
    case "textLength":
    case "stroke-width":
    case "stroke-dashoffset":
    case "stroke-miterlimit":
    case "pathLength":
    case "rx":
    case "ry":
    case "r":
    case "cx":
    case "cy":
    case "x":
    case "y":
    case "x1":
    case "y1":
    case "x2":
    case "y2":
    case "dx":
    case "dy":
    case "width":
    case "height":
    case "fx":
    case "fy":
    case "fr":
    case "offset": {
      let val = v;
      if (name === "offset" && val.endsWith("%")) val = val.slice(0, -1);
      if (name === "font-weight" && /^(normal|bold|bolder|lighter)$/i.test(val)) return val;
      if (!NUMBER_LIST_RE.test(val) && !PERCENT_OR_NUMBER_RE.test(val)) {
        if (name === "width" || name === "height") {
          // attributi di dimensione sul root: valori relativi sono accettabili, li togliamo
          warnings.push(`"${name}" rimosso (valore non numerico: ${v.slice(0, 16)})`);
          return null;
        }
        fail(`valore non valido per "${name}": ${v.slice(0, 24)}`);
      }
      return val;
    }
    case "stroke-dasharray":
      if (!/^[-+0-9.eE,\s]*$/.test(v)) fail("stroke-dasharray non valido");
      return v;
    case "spreadMethod":
      if (!/^(pad|reflect|repeat)$/.test(v)) fail("spreadMethod non valido");
      return v;
    case "gradientUnits":
    case "clipPathUnits":
      if (!/^(userSpaceOnUse|objectBoundingBox)$/.test(v)) fail(`${name} non valido`);
      return v;
    case "clip-rule":
    case "fill-rule":
      if (!/^(nonzero|evenodd|inherit)$/.test(v)) fail(`${name} non valido`);
      return v;
    case "stroke-linecap":
      if (!/^(butt|round|square|inherit)$/.test(v)) fail("stroke-linecap non valido");
      return v;
    case "stroke-linejoin":
      if (!/^(miter|round|bevel|arcs|miter-clip|inherit)$/.test(v)) fail("stroke-linejoin non valido");
      return v;
    case "text-anchor":
      if (!/^(start|middle|end|inherit)$/.test(v)) fail("text-anchor non valido");
      return v;
    case "dominant-baseline":
      if (!/^[a-zA-Z-]{1,24}$/.test(v)) fail("dominant-baseline non valido");
      return v;
    case "font-style":
      if (!/^(normal|italic|oblique|inherit)$/.test(v)) fail("font-style non valido");
      return v;
    case "text-decoration":
      if (!/^[a-zA-Z ]{0,24}$/.test(v)) fail("text-decoration non valido");
      return v;
    case "lengthAdjust":
      if (!/^(spacing|spacingAndGlyphs)$/.test(v)) fail("lengthAdjust non valido");
      return v;
    case "vector-effect":
      if (!/^(none|non-scaling-stroke|non-scaling-size|non-rotation|fixed-position)$/.test(v)) fail("vector-effect non valido");
      return v;
    case "paint-order":
      if (!/^[a-zA-Z ]{0,24}$/.test(v)) fail("paint-order non valido");
      return v;
    case "role":
      if (!/^[a-zA-Z-]{1,24}$/.test(v)) fail("role non valido");
      return v;
    case "aria-label":
    case "aria-labelledby":
      return v.length > 400 ? v.slice(0, 400) : v;
    case "version":
      if (!/^[0-9.]{1,8}$/.test(v)) return null;
      return v;
    case "xml:space":
      if (!/^(default|preserve)$/.test(v)) return null;
      return v;
    case "xmlns":
      if (v !== SVG_NS) fail("namespace SVG non riconosciuto");
      return null; // lo si riscrive comunque in testa all'output
    case "opacity":
    case "fill-opacity":
    case "stroke-opacity":
    case "stop-opacity":
      if (!PERCENT_OR_NUMBER_RE.test(v)) fail(`${name} non valido`);
      return v;
    default:
      return v;
  }
}

/** Colori, parole chiave e riferimenti locali ammessi per un attributo di pittura. */
function checkPaint(value) {
  const v = value.trim();
  if (/^(none|currentColor|transparent|inherit)$/i.test(v)) return v;
  if (HEX_COLOR_RE.test(v)) return v;
  if (COLOR_NAME_RE.test(v)) return v;
  if (COLOR_FUNC_RE.test(v)) return v;
  if (URL_FUNC_RE.test(v)) return v;
  // un riempimento a due colori (con ripiego) è un uso comune: url(#g) nome-colore
  const parts = v.split(/\s+/);
  if (parts.length === 2 && URL_FUNC_RE.test(parts[0]) && (COLOR_NAME_RE.test(parts[1]) || HEX_COLOR_RE.test(parts[1]))) return v;
  return null;
}

/** Raccoglie gli id definiti nel documento. */
function collectIds(node, out = new Map()) {
  if (!node || typeof node === "string") return out;
  if (node.attrs && node.attrs.id) {
    if (out.has(node.attrs.id)) fail(`id duplicato: "${node.attrs.id}"`);
    out.set(node.attrs.id, node.name);
  }
  for (const child of node.children || []) collectIds(child, out);
  return out;
}

/** Verifica che i riferimenti `url(#id)` puntino a id esistenti (e li tenga solo se validi). */
function checkReferences(node, ids, warnings = []) {
  if (!node || typeof node === "string") return warnings;
  for (const [name, value] of Object.entries(node.attrs || {})) {
    if (typeof value !== "string") continue;
    const m = value.match(URL_FUNC_RE);
    if (!m) continue;
    const target = ids.get(m[1]);
    if (!target) {
      delete node.attrs[name];
      warnings.push(`riferimento "${value}" inesistente: attributo "${name}" rimosso`);
      continue;
    }
    if (name === "clip-path" && target !== "clipPath") {
      delete node.attrs[name];
      warnings.push(`clip-path deve puntare a un <clipPath>: attributo rimosso`);
    }
    if ((name === "fill" || name === "stroke" || name === "stop-color") && target !== "linearGradient" && target !== "radialGradient") {
      delete node.attrs[name];
      warnings.push(`"${name}" deve puntare a un gradiente: attributo rimosso`);
    }
  }
  for (const child of node.children || []) checkReferences(child, ids, warnings);
  return warnings;
}

/** Assicura xmlns e viewBox sul root (derivandolo da width/height se serve). */
function normalizeRoot(svg, warnings) {
  const attrs = svg.attrs;
  let viewBox = attrs.viewBox;
  if (!viewBox) {
    const w = Number.parseFloat(attrs.width ?? "");
    const h = Number.parseFloat(attrs.height ?? "");
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      viewBox = `0 0 ${w} ${h}`;
      warnings.push("viewBox assente: derivato da width/height");
    } else {
      fail("manca l'attributo viewBox su <svg>");
    }
  }
  attrs.viewBox = viewBox;
  // la larghezza/altezza assoluta non serve (il CSS adatta l'immagine alla chat): la si
  // conserva solo se numerica, per non imporre proporzioni sbagliate in <img>
  for (const k of ["width", "height"]) {
    if (attrs[k] !== undefined && !NUMBER_LIST_RE.test(String(attrs[k]))) delete attrs[k];
  }
  if (!attrs["preserveAspectRatio"]) attrs["preserveAspectRatio"] = "xMidYMid meet";
  const stops = countStops(svg);
  if (stops > SVG_LIMITS.maxStops) fail(`troppe fermate di gradiente (${stops})`);
}

/** Testo del primo <title>/<desc> figlio del root (per l'etichetta accessibile). */
function textOf(root, name) {
  const child = (root.children || []).find((c) => c && typeof c !== "string" && c.name === name);
  if (!child) return "";
  const text = (child.children || []).filter((c) => typeof c === "string").join(" ").replace(/\s+/g, " ").trim();
  return text.slice(0, 300);
}

function countStops(node, n = { v: 0 }) {
  if (!node || typeof node === "string") return n.v;
  if (node.name === "stop") n.v++;
  for (const child of node.children || []) countStops(child, n);
  return n.v;
}

/** Serializza l'albero ripulito, con escape corretto di testo e valori. */
function serialize(node) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const escAttr = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const walk = (n) => {
    const attrs = Object.entries(n.attrs || {})
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join("");
    const children = (n.children || []).map((c) => (typeof c === "string" ? esc(c) : walk(c))).join("");
    if (VOID_ELEMENTS.has(n.name) && !children) return `<${n.name}${attrs}/>`;
    return `<${n.name}${attrs}>${children}</${n.name}>`;
  };
  if (node.name === "svg") {
    // l'output è sempre nel namespace SVG, a prescindere da come l'input lo dichiarava
    if (node.attrs.xmlns === undefined) node.attrs = { xmlns: SVG_NS, ...node.attrs };
  }
  return walk(node);
}
