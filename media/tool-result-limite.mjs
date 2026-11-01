/**
 * Limite al risultato di un tool, applicato PRIMA che il risultato entri nel contesto.
 *
 * Perché così e non «svuotare dopo» (audit 2026-11-01, criticità C4):
 * - il turno reale del 30/10 ha speso 207.339 token di input non in cache (57% del costo), cioè
 *   soprattutto risultati di tool: è lì che si risparmia;
 * - togliere un risultato dalla storia DOPO averlo mandato al provider cambia i messaggi già
 *   inviati e invalida la parte di prefisso in cache (input 0,3 $/Mtok invece di cacheRead
 *   0,006 $/Mtok): su questo modello costa 50 volte tanto, e si ripaga solo dopo decine di
 *   chiamate. Tagliare all'ingresso, invece, non tocca nulla che sia già stato messo in cache.
 *
 * Il taglio conserva l'inizio, la fine e un marcatore che dice come rileggere la parte omessa:
 * il modello può sempre tornare sulla fonte con `read` (offset/limit) o `grep`.
 *
 * Modulo PURO: nessun filesystem, nessuna sessione.
 */
import { stimaToken } from "./contesto.mjs";

export const MARCATORE = "[…risultato ridotto";
export const MAX_CHAR_DEFAULT = 25000;
export const TESTA_DEFAULT = 7000;
export const CODA_DEFAULT = 5000;

/**
 * @param {Array} content parti del risultato ({type:"text", text} o altro: immagini, ecc.)
 * @param {{maxChar?: number, testa?: number, coda?: number}} opts
 * @returns {{content: Array, ridotto: boolean, tolto: number, prima: number, dopo: number}}
 */
export function limitaContenuto(content, opts = {}) {
  const maxChar = Number.isFinite(opts.maxChar) ? opts.maxChar : MAX_CHAR_DEFAULT;
  const testa = Number.isFinite(opts.testa) ? opts.testa : TESTA_DEFAULT;
  const coda = Number.isFinite(opts.coda) ? opts.coda : CODA_DEFAULT;
  const invariato = { content, ridotto: false, tolto: 0, prima: 0, dopo: 0 };

  if (!Array.isArray(content) || content.length === 0) return invariato;

  let testo = "";
  const altreParti = [];
  for (const parte of content) {
    if (parte && typeof parte === "object" && parte.type === "text" && typeof parte.text === "string") {
      testo += parte.text;
    } else {
      altreParti.push(parte);
    }
  }
  if (!testo) return invariato;

  const prima = testo.length;
  // già ridotto (secondo giro, o un risultato che conteneva il nostro marcatore): non si tocca
  if (prima <= maxChar || testo.includes(MARCATORE)) {
    return { ...invariato, prima, dopo: prima };
  }

  const nota =
    `\n\n${MARCATORE}: era ${prima} caratteri (~${stimaToken(testo)} token). ` +
    `Mostrati i primi ${testa} e gli ultimi ${coda}. La parte omessa NON è persa: ` +
    `si rilegge dalla fonte con read (offset/limit), con grep, o rilanciando il comando con un filtro.]\n\n`;
  const nuovo = testo.slice(0, testa) + nota + testo.slice(-coda);
  const content2 = [{ type: "text", text: nuovo }, ...altreParti];
  return { content: content2, ridotto: true, tolto: prima - nuovo.length, prima, dopo: nuovo.length };
}
