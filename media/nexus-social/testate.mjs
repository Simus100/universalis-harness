/**
 * testate.mjs — nomi canonici delle testate.
 *
 * L'edizione scrive la stessa testata in due modi («NYT» nelle classifiche,
 * «New York Times» nel sommario). Senza normalizzare, il conteggio delle testate
 * nel post è gonfiato e le citazioni sembrano doppioni.
 */
export const SINONIMI = {
  nyt: "New York Times", "new york times": "New York Times", nytimes: "New York Times",
  wsj: "Wall Street Journal", "wall street journal": "Wall Street Journal",
  ft: "Financial Times", "financial times": "Financial Times",
  bbc: "BBC", "bbc news": "BBC", reuters: "Reuters", bloomberg: "Bloomberg",
  techcrunch: "TechCrunch", marketwatch: "MarketWatch",
  guardian: "The Guardian", "the guardian": "The Guardian",
  cnbc: "CNBC", "il sole 24 ore": "Il Sole 24 Ore", ansa: "ANSA",
  bce: "BCE", ecb: "BCE", google: "Google", wired: "Wired",
  verge: "The Verge", "the verge": "The Verge", "associated press": "Associated Press", ap: "Associated Press",
};

export const testataCanonica = (f) => SINONIMI[String(f || "").toLowerCase().trim()] || String(f || "").trim();

/** Insieme delle testate distinte, con i nomi canonici. */
export function testateDistinte(storie) {
  return new Set(storie.map((s) => testataCanonica(s.fonte)).filter(Boolean));
}
