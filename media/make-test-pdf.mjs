#!/usr/bin/env node
/**
 * Generatore di PDF minimi per i test. Nessuna dipendenza: struttura PDF scritta a mano
 * (catalogo, pagine, font Helvetica standard, stream di testo) con tabella xref e offset
 * calcolati sui byte reali, così `pdfinfo` e `pdftotext` li leggono senza avvisi.
 *
 * Uso da riga di comando:
 *   node media/make-test-pdf.mjs <file.pdf> [testo|scansione] [pagine...]
 *   node media/make-test-pdf.mjs /tmp/prova.pdf testo "Prima pagina" "Seconda pagina"
 */

import { writeFileSync } from "node:fs";

/** Testo → operatore PDF, con escape dei caratteri che romperebbero la stringa. */
function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Costruisce un PDF con una pagina per ogni voce di `pagine`.
 * `scansione: true` produce pagine SENZA testo (come un documento scansionato):
 * serve a verificare che l'harness se ne accorga e lo dica, invece di restituire una pagina vuota.
 */
export function makePdf({ pagine = ["Pagina 1"], scansione = false } = {}) {
  const oggetti = [];
  const add = (corpo) => {
    oggetti.push(corpo);
    return oggetti.length; // numero oggetto (1-based)
  };

  // 1 catalogo, 2 albero delle pagine, 3 font; poi una coppia (pagina, contenuto) per pagina
  const catalogNum = add(null);
  const pagesNum = add(null);
  const fontNum = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const pagineNum = [];
  for (const testo of pagine) {
    const contenuto = scansione
      ? "" // nessun operatore di testo: un documento di sole immagini
      : `BT /F1 14 Tf 60 780 Td (${esc(testo)}) Tj ET\n`;
    const streamNum = add(`<< /Length ${Buffer.byteLength(contenuto, "latin1")} >>\nstream\n${contenuto}endstream`);
    const pageNum = add(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 595 842] ` +
        `/Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${streamNum} 0 R >>`,
    );
    pagineNum.push(pageNum);
  }

  oggetti[catalogNum - 1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  oggetti[pagesNum - 1] = `<< /Type /Pages /Kids [${pagineNum.map((n) => `${n} 0 R`).join(" ")}] /Count ${pagineNum.length} >>`;

  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offset = [];
  for (let i = 0; i < oggetti.length; i++) {
    offset[i] = Buffer.byteLength(out, "latin1");
    out += `${i + 1} 0 obj\n${oggetti[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${oggetti.length + 1}\n0000000000 65535 f \n`;
  for (const off of offset) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${oggetti.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(out, "latin1");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , file, modo = "testo", ...righe] = process.argv;
  if (!file) {
    console.error("uso: node media/make-test-pdf.mjs <file.pdf> [testo|scansione] [righe di testo...]");
    process.exit(2);
  }
  const pagine = righe.length ? righe : ["Fattura di prova numero 2026-001", "Totale dovuto: 1.234,56 EUR", "Scadenza 31/12/2026"];
  writeFileSync(file, makePdf({ pagine, scansione: modo === "scansione" }));
  console.log(`scritto ${file} (${pagine.length} pagine, modo ${modo})`);
}
