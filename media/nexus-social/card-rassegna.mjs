#!/usr/bin/env node
/**
 * card-rassegna.mjs — la card editoriale della «Rassegna del giorno» di Altair Nexus.
 *
 * Non è una card di notizia: è la copertina della rassegna. Porta la data, il segnale
 * dominante, il tema, i tre titoli del giorno e la firma del publisher. Serve come
 * immagine del post Facebook (1200x630, più la versione @2x).
 *
 * Palette e carattere vengono dal sito (nexus.universalis.it): sfondo #09111b,
 * testo #edf3fb, accenti cyan/violet, display serif per il titolo.
 *
 * Uso da riga di comando (prova):
 *   node media/nexus-social/card-rassegna.mjs --out /tmp/card-prova \
 *        --giorno "giovedì 22 ottobre 2026" --segnale "Tecnologia" --tema "Riposizionamento competitivo" \
 *        --titoli "PHP, vulnerabilità scoperte con l'IA|Israele, i partiti arabi decisivi|Legora, 550 milioni"
 *
 * Come modulo: `import { generaCard } from "./card-rassegna.mjs"`.
 */
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/* Colori per categoria, dalla palette del sito. */
export const COLORI = {
  "intelligenza artificiale": "#6adfff",
  tecnologia: "#6adfff",
  geopolitica: "#9c85ff",
  finanza: "#7de0a8",
  mercati: "#f0bf72",
  startup: "#ef7bc0",
  scienza: "#f39a61",
  "curiosità / futuro": "#71ebd5",
  default: "#8db7ff",
};

export const colorePer = (categoria) => COLORI[String(categoria || "").toLowerCase().trim()] || COLORI.default;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Spezza in righe entro un numero di caratteri, senza tagliare le parole a metà. */
export function aCapo(testo, maxCar) {
  const parole = String(testo).replace(/\s+/g, " ").trim().split(" ");
  const righe = [];
  let riga = "";
  for (const p of parole) {
    if (!riga) riga = p;
    else if ((riga + " " + p).length <= maxCar) riga += " " + p;
    else { righe.push(riga); riga = p; }
  }
  if (riga) righe.push(riga);
  return righe;
}

/** Accorcia una stringa su confine di parola, con il carattere di ellissi. */
export function accorcia(testo, maxCar) {
  const t = String(testo).replace(/\s+/g, " ").trim();
  if (t.length <= maxCar) return t;
  const tagliato = t.slice(0, maxCar);
  const spazio = tagliato.lastIndexOf(" ");
  return (spazio > maxCar * 0.6 ? tagliato.slice(0, spazio) : tagliato).replace(/[,;:.\s]+$/, "") + "…";
}

/** Larghezza reale del testo in punti, misurata con ImageMagick (fallback: stima). */
function misura(testo, pt, grassetto = true, serif = false) {
  try {
    const font = serif ? (grassetto ? "DejaVu-Serif-Bold" : "DejaVu-Serif") : (grassetto ? "DejaVu-Sans-Bold" : "DejaVu-Sans");
    const w = execFileSync("convert", ["-font", font, "-pointsize", String(pt), `label:${testo}`, "-format", "%w", "info:"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Number(w);
  } catch { return testo.length * pt * (serif ? 0.58 : 0.6); }
}

/** Corpo che fa stare il testo nella larghezza utile, entro un minimo leggibile. */
function corpoAdatto(testo, ptMax, ptMin, larghezza, grassetto = true, serif = true) {
  let pt = ptMax;
  while (pt > ptMin && misura(testo, pt, grassetto, serif) > larghezza) pt -= 2;
  return pt;
}

/**
 * generaCard({ giorno, segnale, tema, titoli:[{titolo, etichetta}], out, firma })
 * → { svg, png, png2x }
 */
export function generaCard({ giorno, segnale, tema, titoli = [], out, firma = "nexus.universalis.it" }) {
  const W = 1200, H = 630, pad = 64;
  const accento = colorePer(segnale);
  const utile = W - pad * 2;

  const segnaleTesto = String(segnale || "Il quadro di oggi");
  const temaTesto = accorcia(tema || "", 62);

  // Titoli: tre voci, ognuna su una riga (accorciata), con etichetta categoria · fonte
  const voci = titoli.slice(0, 3).map((t) => ({
    numero: String(titoli.indexOf(t) + 1).padStart(2, "0"),
    titolo: accorcia(t.titolo, 74),
    etichetta: accorcia(t.etichetta || "", 46).toUpperCase(),
  }));

  const yLista = 402;
  const passo = 56;

  const lista = voci
    .map((v, i) => {
      const y = yLista + i * passo;
      return `  <text x="${pad}" y="${y}" font-family="DejaVu Sans" font-size="17" font-weight="bold" letter-spacing="1" fill="${accento}" opacity="0.9">${esc(v.numero)}</text>
  <text x="${pad + 44}" y="${y}" font-family="DejaVu Sans" font-size="23" fill="#eef4f8">${esc(v.titolo)}</text>
  <text x="${pad + 44}" y="${y + 21}" font-family="DejaVu Sans" font-size="13" letter-spacing="2" fill="#7f92ab">${esc(v.etichetta)}</text>`;
    })
    .join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Altair Nexus — Rassegna del giorno, ${esc(giorno)}</title>
  <desc>Copertina della rassegna quotidiana: data, segnale dominante "${esc(segnaleTesto)}", tema, tre titoli del giorno e firma del publisher.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#09111b"/>
      <stop offset="0.55" stop-color="#080e17"/>
      <stop offset="1" stop-color="#060914"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.1" cy="0.12" r="0.85">
      <stop offset="0" stop-color="${accento}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="#16202f"/>
    </pattern>
    <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bcd8ff"/><stop offset="1" stop-color="#8db7ff"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.55"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="5" fill="${accento}"/>

  <!-- testata -->
  <text x="${pad}" y="74" font-family="DejaVu Sans" font-size="17" font-weight="bold" letter-spacing="7" fill="#eef4f8">ALTAIR NEXUS</text>
  <text x="${pad}" y="100" font-family="DejaVu Sans" font-size="13" letter-spacing="3" fill="#7f92ab">RASSEGNA DEL GIORNO</text>
  <text x="${W - pad}" y="74" text-anchor="end" font-family="DejaVu Sans" font-size="16" letter-spacing="1" fill="#a5b4ca">${esc(giorno)}</text>
  <line x1="${pad}" y1="126" x2="${W - pad}" y2="126" stroke="#1c2736" stroke-width="2"/>

  <!-- il segnale -->
  <text x="${pad}" y="176" font-family="DejaVu Sans" font-size="14" letter-spacing="5" fill="${accento}">IL SEGNALE DI OGGI</text>
  <text x="${pad}" y="248" font-family="DejaVu Serif" font-size="64" font-weight="bold" fill="#fbfcf7">${esc(accorcia(segnaleTesto, 30))}</text>
  ${temaTesto ? `<text x="${pad}" y="288" font-family="DejaVu Serif" font-size="24" fill="#a5b4ca">${esc(temaTesto)}</text>` : ""}

  <line x1="${pad}" y1="336" x2="${W - pad}" y2="336" stroke="#1c2736" stroke-width="2"/>
  <text x="${pad}" y="372" font-family="DejaVu Sans" font-size="13" letter-spacing="4" fill="#7f92ab">TRE STORIE, TRE SEGNALI</text>

  <!-- i tre titoli -->
${lista}

  <!-- firma -->
  <rect x="0" y="${H - 64}" width="${W}" height="64" fill="#050810" opacity="0.85"/>
  <text x="${pad}" y="${H - 26}" font-family="DejaVu Sans" font-size="15" letter-spacing="1" fill="#8da1b8">${esc(firma)}</text>
  <text x="${W - pad}" y="${H - 26}" text-anchor="end" font-family="DejaVu Sans" font-size="13" letter-spacing="2" fill="#5f7288">UNIVERSALIS PRODUZIONI</text>
</svg>
`;

  const base = out || "/tmp/card-rassegna";
  writeFileSync(`${base}.svg`, svg);
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", `${base}.png`, `${base}.svg`]);
  execFileSync("rsvg-convert", ["-w", String(W * 2), "-h", String(H * 2), "-o", `${base}@2x.png`, `${base}.svg`]);
  return { svg: `${base}.svg`, png: `${base}.png`, png2x: `${base}@2x.png` };
}

/* ------------------------------------------------------------ riga di comando */
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
  const r = generaCard({
    giorno: opt("--giorno", "oggi"),
    segnale: opt("--segnale", "Tecnologia"),
    tema: opt("--tema", ""),
    titoli: String(opt("--titoli", "Primo titolo|Secondo titolo|Terzo titolo")).split("|").map((t) => ({ titolo: t, etichetta: "Tecnologia · Fonte" })),
    out: opt("--out", "/tmp/card-rassegna"),
  });
  console.log(r.png2x);
}

/* ============================================================================
 * Card del LANCIO: il manifesto della piattaforma, non la copertina del giorno.
 * Usata una volta sola da post-lancio.mjs; sta qui per condividere palette e
 * disegno con la card della rassegna.
 * ========================================================================== */
export function generaCardLancio({ giorno, titolo, sottotitolo, punti = [], out, firma = "nexus.universalis.it" }) {
  const W = 1200, H = 630, pad = 64;
  const accento = "#6adfff";
  const yTitolo = 268;

  // il titolo si accorcia solo se, al corpo minimo, non ci starebbe comunque
  const utile = W - pad * 2;
  let titoloAccorciato = String(titolo || "");
  let corpoTitolo = corpoAdatto(titoloAccorciato, 56, 34, utile, true, true);
  if (corpoTitolo <= 34 && misura(titoloAccorciato, 34, true, true) > utile) {
    titoloAccorciato = accorcia(titoloAccorciato, 44);
    corpoTitolo = corpoAdatto(titoloAccorciato, 56, 34, utile, true, true);
  }
  const sottotitoloAccorciato = accorcia(sottotitolo || "", 64);

  const pill = punti.slice(0, 3).map((p, i) => {
    const x = pad + i * 356;
    return `  <rect x="${x}" y="452" width="332" height="76" rx="14" fill="#0d1726" stroke="#1b2a3c" stroke-width="2"/>
  <text x="${x + 22}" y="486" font-family="DejaVu Sans" font-size="13" letter-spacing="3" fill="${accento}">${esc((p.etichetta || "").toUpperCase())}</text>
  <text x="${x + 22}" y="512" font-family="DejaVu Sans" font-size="19" fill="#dbe6f2">${esc(accorcia(p.testo, 30))}</text>`;
  }).join("\n");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <title>Altair Nexus — ${esc(titolo)}</title>
  <desc>Card di lancio: titolo del manifesto, sottotitolo e tre dati della piattaforma.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#09111b"/><stop offset="0.5" stop-color="#080e17"/><stop offset="1" stop-color="#050810"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.18" r="0.9">
      <stop offset="0" stop-color="#6adfff" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#9c85ff" stop-opacity="0.10"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#16202f"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#dots)" opacity="0.5"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="5" fill="${accento}"/>

  <text x="${pad}" y="74" font-family="DejaVu Sans" font-size="17" font-weight="bold" letter-spacing="7" fill="#eef4f8">ALTAIR NEXUS</text>
  <text x="${pad}" y="100" font-family="DejaVu Sans" font-size="13" letter-spacing="3" fill="#7f92ab">BRIEFING EDITORIALE INDIPENDENTE</text>
  <text x="${W - pad}" y="74" text-anchor="end" font-family="DejaVu Sans" font-size="15" letter-spacing="3" fill="${accento}">OGNI ORA, IN ITALIANO</text>
  <line x1="${pad}" y1="126" x2="${W - pad}" y2="126" stroke="#1c2736" stroke-width="2"/>

  <text x="${pad}" y="196" font-family="DejaVu Sans" font-size="14" letter-spacing="5" fill="${accento}">CI LAVORA AION</text>
  <text x="${pad}" y="${yTitolo}" font-family="DejaVu Serif" font-size="${corpoTitolo}" font-weight="bold" fill="#fbfcf7">${esc(titoloAccorciato)}</text>
  <text x="${pad}" y="${yTitolo + 52}" font-family="DejaVu Serif" font-size="26" fill="#a5b4ca">${esc(sottotitoloAccorciato)}</text>
  <line x1="${pad}" y1="396" x2="${W - pad}" y2="396" stroke="#1c2736" stroke-width="2"/>

${pill}

  <rect x="0" y="${H - 64}" width="${W}" height="64" fill="#050810" opacity="0.85"/>
  <text x="${pad}" y="${H - 26}" font-family="DejaVu Sans" font-size="15" letter-spacing="1" fill="#8da1b8">${esc(firma)}</text>
  <text x="${W - pad}" y="${H - 26}" text-anchor="end" font-family="DejaVu Sans" font-size="13" letter-spacing="2" fill="#5f7288">UNIVERSALIS PRODUZIONI</text>
</svg>
`;
  const base = out || "/tmp/card-lancio";
  writeFileSync(`${base}.svg`, svg);
  execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", `${base}.png`, `${base}.svg`]);
  execFileSync("rsvg-convert", ["-w", String(W * 2), "-h", String(H * 2), "-o", `${base}@2x.png`, `${base}.svg`]);
  return { svg: `${base}.svg`, png: `${base}.png`, png2x: `${base}@2x.png` };
}
