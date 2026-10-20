/**
 * aion-mark.mjs — il marchio di Aion in un solo posto.
 * Chi disegna (logo, copertina, card) importa da qui: cambiare il marchio = cambiare questo file.
 *
 * Il segno: una A geometrica attraversata da un taglio netto a 45°. La metà alta è blu,
 * la bassa è viola: due strati, come un segnale che arriva su due bande. Il punto verde
 * in alto a destra è lo stato «online».
 */

// Profilo della lettera A: contorno esterno + foro (fill-rule evenodd).
export const MARK_PATH =
  'M466,250 L558,250 L810,790 L720,790 L664.2,664 L359.8,664 L304,790 L214,790 Z ' +
  'M512,320 L626.2,578 L397.8,578 Z';

// Taglio a 45° (retta y = x + 8) con una fessura di 22 unità: sopra y < x - 3, sotto y > x + 19.
const CUT_TOP = '-800,-900 1700,-900 1700,1697 -800,-803';
const CUT_BOTTOM = '-800,-781 1700,1719 1700,1900 -800,1900';

// Gradienti del marchio: vanno definiti nel documento che lo usa.
export const MARK_DEFS = `
    <linearGradient id="markTop" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bcd8ff"/><stop offset="1" stop-color="#6f9fe8"/>
    </linearGradient>
    <linearGradient id="markBot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8168e6"/><stop offset="1" stop-color="#6b52d8"/>
    </linearGradient>`;

/**
 * Gruppo SVG del marchio, già dimensionato e posizionato.
 * @param {number} x centro orizzontale
 * @param {number} y centro verticale
 * @param {number} size altezza del marchio in px
 * @param {string} id prefisso univoco per i clipPath
 */
export function markGroup(x, y, size, id = 'mk') {
  const s = size / 540;
  return `<g transform="translate(${x},${y}) scale(${s}) translate(-512,-520)">
    <defs>
      <clipPath id="${id}-t"><polygon points="${CUT_TOP}"/></clipPath>
      <clipPath id="${id}-b"><polygon points="${CUT_BOTTOM}"/></clipPath>
    </defs>
    <g clip-path="url(#${id}-t)"><path fill="url(#markTop)" fill-rule="evenodd" d="${MARK_PATH}"/></g>
    <g clip-path="url(#${id}-b)"><path fill="url(#markBot)" fill-rule="evenodd" d="${MARK_PATH}"/></g>
  </g>`;
}

/** Il pallino verde «online» in coordinate assolute. */
export function onlineDot(cx, cy, r = 34) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#signal)"/>
  <circle cx="${cx}" cy="${cy}" r="${r * 1.65}" fill="none" stroke="#34d399" stroke-opacity="0.22" stroke-width="${r * 0.26}"/>`;
}
