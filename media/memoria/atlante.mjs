/**
 * Atlante della memoria: due letture dello stesso grafo, e la prima è quella leggibile.
 *
 * IL PROBLEMA. La prima versione disegnava il grafo solo in 3D prospettico. Era bella e
 * inservibile: in prospettiva due nodi lontani si sovrappongono sullo schermo, le etichette si
 * accavallano, la rotazione automatica muove le cose mentre le leggi, e per sapere *chi è*
 * un punto devi cliccarlo. Un grafo di 150 nodi letto così è un gomitolo — e una memoria
 * illeggibile non è una memoria.
 *
 * LA SOLUZIONE: DUE MODI, con ruoli diversi.
 *
 *   MAPPA (predefinita) — 2D, ortogonale, leggibile.
 *     RIGHE = strati della memoria (Episodio → Decisione → Obiettivo → Artefatto): la catena
 *             «cosa è successo → cosa si è deciso → cosa si è prodotto» si legge dall'alto in
 *             basso, senza prospettiva che la deformi.
 *     COLONNE = aree (le cartelle del progetto), intestate e sempre visibili.
 *     NIENTE rotazione e POSIZIONI ANCORATE: la posizione di un nodo non cambia né fra
 *             un'apertura e l'altra né quando la memoria cresce — la forma del mondo si
 *             congela al primo disegno, i nodi nuovi prendono le celle libere.
 *     ZOOM SEMANTICO: sotto una certa soglia di zoom un'area grande diventa un cerchio con il
 *             suo conteggio, e si apre con un clic: si riduce il dettaglio, non tutto insieme.
 *     PAN e ZOOM: ci si muove come in una mappa geografica (trascina, rotella, pizzico),
 *             con i pulsanti −/＋/adatta sempre a portata di dito.
 *     ETICHETTE: i nomi si vedono; quando due si sovrapporrebbero vince il più rilevante
 *             (selezionato, poi i suoi vicini, poi i risultati della ricerca, poi il grado).
 *     EVIDENZIAZIONE: selezioni un nodo e il resto si attenua — si legge il vicinato, non il
 *             rumore. La ricerca accende un alone sui nodi trovati.
 *     ARCHI: «ha toccato» (episodio → file) è spenta all'apertura. Misurato: 425 archi di quel
 *             tipo facevano ~165.000 incroci su 1019; senza, ~41.000 (−75%). Si riaccende con un
 *             clic in legenda, e non si ri-spegne da sola al primo aggiornamento dei dati.
 *
 * LE TRE LETTURE CHE NON SONO IL GRAFO (funzioni pure, SVG, senza canvas): `timelineSVG` — come
 * cresce, giorno per giorno; `matriceSVG` — chi tocca cosa, senza linee che si incrociano;
 * e i buchi (episodi senza decisione, hub, isolati) che la dashboard rende come elenco.
 *
 *   ORBITA — il 3D prospettico di prima, migliorato (etichette con contorno, rotazione spenta
 *     all'apertura, etichette contate in base allo spazio): serve per la vista d'insieme e per
 *     il piacere di guardarla, non per cercare qualcosa.
 *
 * L'ANGOLO/IL RAGGIO nell'orbita restano quello che erano: gli archi verticali sono la catena
 * dei livelli, il raggio è la centralità. La mappa invece rinuncia alla centralità radiale in
 * cambio di una griglia stabile: è il compromesso giusto, perché una griglia si impara.
 *
 * DETERMINISMO. Stesso grafo → stesso disegno, byte per byte, in entrambi i modi. Per una
 * memoria è un requisito: una mappa che si ridisegna diversa a ogni apertura non si impara.
 *
 * QUESTO FILE NON IMPORTA NULLA, e non può farlo: gira nel browser. È anche l'unica fonte del
 * disegno — `memoria-atlante.mjs` ne incorpora il testo nell'HTML generato (così il file si
 * apre anche da `file://`) e la dashboard lo serve come modulo. Una sola copia del disegno.
 */

/** Hash deterministico in [0,1) — FNV-1a, puro JS: separa i nodi che condividono la cella. */
export function hash01(testo) {
  let h = 0x811c9dc5;
  const s = String(testo);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0xffffffff;
}

/**
 * Relazioni che nascono SPENTE.
 *
 * Misura sul grafo vero (1/11/2026): 1019 archi producono ~165.000 incroci nel layout a strati;
 * togliendo «ha toccato» (425 archi, episodio → file) scendono a ~41.000 (−75%), e restando solo
 * la struttura (ha deciso · segue · riguarda) a ~21.000 (−87%). Gli incroci sono il fattore che
 * pesa di più sulla comprensione di un grafo (Purchase 1997), e «ha toccato» è la relazione con
 * meno informazione per unità di inchiostro: la maggior parte delle volte dice «quella sessione
 * ha letto quel file», che è già nel nodo episodio.
 *
 * Non si perde niente: l'arco si accende con un clic sulla legenda (o si vede al passaggio del
 * mouse, che accende il vicinato). Una relazione spenta di default è una scelta di lettura, non
 * una cancellazione: `acceso()` la conosce e i test la verificano.
 */
const RELAZIONI_SPENTE_DI_DEFAULT = new Set(["ha-toccato"]);

/**
 * ZOOM SEMANTICO — quando un'area diventa un nodo solo.
 *
 * PERCHÉ: con 433 nodi su 1400 px il fit porta k≈0,28: i nodi sono puntini e le etichette sono
 * metà di quelle che servirebbero. Ridurre il *dettaglio* invece di ridurre tutto (è quello che
 * fa il semantic zoom nei grafi di ontologie) tiene la mappa d'insieme leggibile: sotto la soglia
 * di zoom, un'area con più di MIN_NODI_AGGREGATI nodi diventa un cerchio con il suo conteggio, e
 * si apre con un clic (o zoomando). Non si perde niente: i nodi restano nel modello — ricerca,
 * filtri, matricola e piede continuano a vederli — e non si aggrega mai mentre stai leggendo un
 * nodo (selezione, lente o ricerca attive): lì il contesto è il vicinato, non l'insieme.
 */
const SOGLIA_ZOOM_APERTA = 0.55;
const MIN_NODI_AGGREGATI = 50;

const FONT = "12px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_GRANDE = "13px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Quali nodi sono «nuovi»: episodi e decisioni di OGGI e di IERI.
 *
 * PERCHÉ SERVE UN SEGNO. La mappa si adatta allo schermo: quando la memoria cresce di due nodi
 * al giorno, il disegno non diventa più grande, diventa appena più fitto — e la differenza non
 * si vede. Senza un segno esplicito l'atlante di una memoria che lavora e quello di una ferma
 * sono la stessa immagine. Gli ARTEFATTI non hanno una data (`d` manca): non possono essere
 * «nuovi», e non lo si finge.
 *
 * Il confronto è per giorno di calendario in ora LOCALE (due giorni: oggi e ieri), perché `d`
 * è «YYYY-MM-DD» senza fuso. Con `Math.abs` un nodo datato domani — capita se l'orologio o il
 * fuso di chi scrive non è questo — resta comunque visibile come nuovo invece di sparire.
 *
 * @param {Array<object>} nodi
 * @param {Date|string|number} [oggi]  istante di riferimento (nei test si fissa: è l'unica cosa
 *   del disegno che dipende dall'orologio)
 * @returns {(nodo:object)=>boolean}
 */
export function nodoERecente(oggi = new Date()) {
  const giorno = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
    if (isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const base = new Date(oggi);
  if (isNaN(base)) return () => false;
  base.setHours(0, 0, 0, 0);
  const oggiMs = base.getTime();
  const UN_GIORNO = 24 * 3600 * 1000;
  return (n) => {
    const g = giorno(n?.d);
    return g !== null && Math.abs(oggiMs - g) <= UN_GIORNO;
  };
}

/**
 * RIGA DEL TEMPO — quanti episodi e decisioni per giorno, ultimi `giorni`.
 *
 * PERCHÉ UNA FUNZIONE PURA CHE RESTITUISCE SVG: serve in due posti (la vista della dashboard e
 * l'atlante autonomo), e un grafico di trenta barre non vale un secondo disegnatore. Così la
 * forma è una sola, si prova senza browser e non c'è nessun canvas in più da dimensionare.
 *
 * Perché serve: la mappa si adatta allo schermo, quindi la crescita non ha una forma — e una
 * memoria che lavora sembra ferma quanto una che dorme. Qui la crescita è una forma da leggere
 * (e senza animazioni: non muove nulla mentre la guardi).
 *
 * @param {Array<object>} nodi
 * @param {{giorni?:number, larghezza?:number, altezza?:number, oggi?:Date|string}} [opzioni]
 * @returns {string} SVG autonomo
 */
export function timelineSVG(nodi, { giorni = 30, larghezza = 320, altezza = 52, oggi = new Date() } = {}) {
  const perGiorno = new Map();
  for (const n of nodi || []) {
    if (n?.s !== "episodio" && n?.s !== "decisione") continue; // solo chi ha una data
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(n.d || ""));
    if (!m) continue;
    const chiave = `${m[1]}-${m[2]}-${m[3]}`;
    const v = perGiorno.get(chiave) || { episodi: 0, decisioni: 0 };
    if (n.s === "episodio") v.episodi++;
    else v.decisioni++;
    perGiorno.set(chiave, v);
  }
  const base = new Date(oggi);
  const serie = [];
  if (!isNaN(base)) {
    base.setHours(0, 0, 0, 0);
    for (let i = giorni - 1; i >= 0; i--) {
      const d = new Date(base.getTime() - i * 86400000);
      const chiave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const v = perGiorno.get(chiave) || { episodi: 0, decisioni: 0 };
      serie.push({ chiave, d, ...v });
    }
  }
  const massimo = Math.max(1, ...serie.map((g) => g.episodi + g.decisioni));
  const passo = larghezza / Math.max(1, serie.length);
  const largBarra = Math.max(1.4, passo - 1.4);
  const hBarre = Math.max(6, altezza - 22);
  const n = ++contatoreGrafici;
  const totaleEp = serie.reduce((a, g) => a + g.episodi, 0);
  const totaleDec = serie.reduce((a, g) => a + g.decisioni, 0);
  const primo = serie[0], ultimo = serie[serie.length - 1];
  const etichetta = (d) => `${d.getDate()}/${d.getMonth() + 1}`;
  // Il plurale conta: «1 decisioni» è il genere di dettaglio che fa sembrare il grafico
  // generato da una macchina che non ha guardato il risultato.
  const pl = (n, uno, molti) => `${n} ${n === 1 ? uno : molti}`;
  let barre = "";
  serie.forEach((g, i) => {
    const x = i * passo;
    const tot = g.episodi + g.decisioni;
    const hEp = (g.episodi / massimo) * hBarre;
    const hDec = (g.decisioni / massimo) * hBarre;
    const yBase = 4 + hBarre;
    const quando = `${etichetta(g.d)}: ${pl(g.episodi, "episodio", "episodi")}, ${pl(g.decisioni, "decisione", "decisioni")}`;
    if (g.episodi) barre += `<rect x="${x.toFixed(1)}" y="${(yBase - hEp).toFixed(1)}" width="${largBarra.toFixed(1)}" height="${hEp.toFixed(1)}" fill="#5b9dff" rx="1"><title>${quando}</title></rect>`;
    if (g.decisioni) barre += `<rect x="${x.toFixed(1)}" y="${(yBase - hEp - hDec).toFixed(1)}" width="${largBarra.toFixed(1)}" height="${hDec.toFixed(1)}" fill="#8b5cff" rx="1"><title>${quando}</title></rect>`;
    if (tot === 0) barre += `<rect x="${x.toFixed(1)}" y="${(yBase - 1).toFixed(1)}" width="${largBarra.toFixed(1)}" height="1" fill="#243043"><title>${quando}</title></rect>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${larghezza} ${altezza}" role="img" aria-labelledby="tl${n}t tl${n}d" class="grafico-tempo">`
    + `<title id="tl${n}t">Episodi e decisioni per giorno, ultimi ${giorni} giorni</title>`
    + `<desc id="tl${n}d">${pl(totaleEp, "episodio", "episodi")} e ${pl(totaleDec, "decisione", "decisioni")} dal ${etichetta(primo.d)} al ${etichetta(ultimo.d)}. Le barre azzurre sono episodi, quelle viola decisioni, impilate giorno per giorno.</desc>`
    + `<line x1="0" y1="${4 + hBarre}" x2="${larghezza}" y2="${4 + hBarre}" stroke="#243043" stroke-width="1"/>`
    + barre
    + `<text x="0" y="${altezza - 4}" fill="#64748b" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9">${etichetta(primo.d)}</text>`
    + `<text x="${larghezza}" y="${altezza - 4}" fill="#64748b" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" text-anchor="end">${etichetta(ultimo.d)}</text>`
    + `<text x="${larghezza}" y="10" fill="#94a3b8" font-family="ui-sans-serif, system-ui, sans-serif" font-size="9" text-anchor="end">${pl(totaleEp, "episodio", "episodi")} · ${pl(totaleDec, "decisione", "decisioni")}</text>`
    + `</svg>`;
}

/** Contatore per gli id interni degli SVG generati (più grafici nella stessa pagina). */
let contatoreGrafici = 0;

/**
 * MATRICE DI ADIACENZA dei nodi più connessi.
 *
 * PERCHÉ ESISTE, se la mappa è più bella: sono due risposte diverse. Il node-link serve a seguire
 * un percorso; la matrice serve ai task topologici — «chi tocca cosa», «quale file è conteso» —
 * dove il node-link diventa un gomitolo. Studio controllato (Ghoniem, Fekete & Castagliola 2004):
 * i due metodi sono complementari, il node-link è adatto ai grafi piccoli, la matrice ai grafi
 * grandi o densi; i task di percorso restano difficili in entrambi.
 *
 * La matrice non compete con la mappa: mostra i primi `limite` nodi per collegamenti, ordinati per
 * area (i blocchi si vedono), e ogni cella dice nel titolo quale relazione c'è. Senza sovrapporre
 * niente: una cella è un incrocio riga×colonna, non una linea che passa sopra le altre.
 *
 * @param {Array<object>} nodi
 * @param {Array<object>} archi
 * @param {{limite?:number, cella?:number, larghezzaEtichette?:number}} [opzioni]
 * @returns {{svg:string, nodi:Array<object>}}
 */
export function matriceSVG(nodi, archi, { limite = 24, cella = 8, larghezzaEtichette = 92 } = {}) {
  const ordinati = (nodi || [])
    .filter((n) => (n.g || 0) > 0)
    .slice()
    .sort((a, b) => (a.a || "").localeCompare(b.a || "") || (b.g || 0) - (a.g || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, limite);
  const posizione = new Map(ordinati.map((n, i) => [n.i ?? n.id, i]));
  const chiave = (n) => (n.i ?? n.id);
  const perCella = new Map();
  for (const a of archi || []) {
    const i = posizione.get(a.a), j = posizione.get(a.b);
    if (i === undefined || j === undefined) continue;
    for (const [r, c] of [[i, j], [j, i]]) {
      const k = r * ordinati.length + c;
      if (!perCella.has(k)) perCella.set(k, a.r);
    }
  }
  const colori = {
    "ha-deciso": "#8b5cff", "ha-toccato": "#2f6f5e", riguarda: "#5b9dff",
    segue: "#fbbf24", cita: "#94a3b8", serve: "#fb7185",
  };
  const etichettaRel = { "ha-deciso": "ha deciso", "ha-toccato": "ha toccato", riguarda: "riguarda", segue: "segue", cita: "cita", serve: "serve" };
  // I nomi dei nodi sono titoli di episodi: possono contenere `<`, `&`, virgolette. Dentro un
  // SVG fanno saltare il parsing (o peggio), quindi si escapan sempre — anche nel <title>.
  const esc = (t) => String(t == null ? "" : t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const n = ordinati.length;
  const lato = n * cella;
  const larghezza = larghezzaEtichette + lato + 2;
  const altezza = lato + 12;
  const id = ++contatoreGrafici;
  let celle = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const rel = perCella.get(r * n + c);
      if (!rel) continue;
      const nomeR = esc(String(ordinati[r].n || "").slice(0, 18));
      const nomeC = esc(String(ordinati[c].n || "").slice(0, 18));
      const x = larghezzaEtichette + c * cella;
      const y = r * cella;
      celle += `<rect data-r="${r}" x="${x}" y="${y}" width="${cella - 0.5}" height="${cella - 0.5}" fill="${colori[rel] || "#64748b"}"><title>${nomeR} → ${nomeC}: ${etichettaRel[rel] || rel}</title></rect>`;
    }
  }
  let nomi = "";
  ordinati.forEach((nodo, i) => {
    const y = i * cella + cella - 1.5;
    nomi += `<text data-r="${i}" x="${larghezzaEtichette - 4}" y="${y}" text-anchor="end" fill="${nodo.s === "artefatto" ? "#6ee7b7" : nodo.s === "decisione" ? "#c4b5fd" : "#7dd3fc"}" font-family="ui-sans-serif, system-ui, sans-serif" font-size="7.5">${esc(String(nodo.n || "").slice(0, 24))}</text>`;
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${larghezza} ${altezza}" role="img" aria-labelledby="mx${id}t mx${id}d" class="grafico-matrice">`
    + `<title id="mx${id}t">Matrice di adiacenza dei ${n} nodi più connessi</title>`
    + `<desc id="mx${id}d">Righe e colonne sono gli stessi ${n} nodi, ordinati per area e poi per numero di collegamenti; una cella colorata dice che fra la riga e la colonna c'è una relazione, e il colore indica quale. Serve a rispondere a «chi tocca cosa» senza incroci di linee.</desc>`
    + nomi + celle
    + `<text x="${larghezzaEtichette}" y="${altezza - 2}" fill="#64748b" font-family="ui-sans-serif, system-ui, sans-serif" font-size="8">colonne: gli stessi ${n} nodi</text>`
    + `</svg>`;
  return { svg, nodi: ordinati };
}

/**
 * Crea l'atlante su un canvas.
 * @param {object} opzioni
 * @param {HTMLCanvasElement} opzioni.canvas
 * @param {object} opzioni.dati  {nodi:[{id,s,n,f,a,g,d,t}], archi:[{a,b,r}], aree, strati, colori}
 * @param {(nodo:object)=>void} opzioni.onSelect
 * @param {(nodo:object|null)=>void} opzioni.onHover
 * @param {boolean} opzioni.rotante  rotazione automatica dell'orbita (spenta: si legge meglio)
 * @param {"mappa"|"orbita"} opzioni.modo
 * @param {Date|string|number} [opzioni.oggi]  giorno di riferimento per il segno dei nodi nuovi
 */
export function createAtlante({ canvas, dati, onSelect = () => {}, onHover = () => {}, rotante = false, modo = "mappa", oggi = new Date() }) {
  const eRecente = nodoERecente(oggi);
  const ctx = canvas.getContext("2d");

  // ---- orbita (3D) ----
  const RAGGIO_DISCO = 10;
  const ALTEZZA_STRATO = 9;

  // ---- mappa (2D) ----
  // Unità del "mondo": pixel del disegno prima dello zoom. Le misure sono tarate perché
  // un'etichetta da ~24 caratteri stia nella cella senza toccare quella accanto.
  const M = {
    passoX: 152, // distanza fra due colonne di nodi (e larghezza di una colonna)
    passoY: 30, // distanza fra due righe di nodi (ci sta un'etichetta da 12 px)
    margine: 18, // respiro dentro la cella
    fascia: 30, // altezza della testata di strato
    // Forma del mondo: larghezza/altezza. Una mappa larga si legge meglio di una a torre
    // (che è quello che veniva fuori lasciando la larghezza al caso: 300 px per 3000).
    aspetto: 1.35,
  };

  let strati = [];
  let aree = [];
  let nodi = [];
  let vicini = [];
  let gradoMax = 1;
  // Centro verticale della pila di strati (orbita): senza, la memoria si disegna tutta nella
  // metà alta dello schermo e metà del canvas resta vuoto (verificato sullo screenshot).
  let centroY = 0;
  // Inquadratura dell'orbita: baricentro e scala calcolati sui nodi, così il grafo riempie il
  // canvas invece di stare in un angolo.
  const inquadratura = { bx: 0, by: 0, fit: 1 };
  // Mondo della mappa: dimensioni e intestazioni, calcolate da `geometriaMappa`.
  const mondo = { w: 0, h: 0, colonne: [], fasce: [] };
  // Aree rese come un nodo solo (zoom semantico) e aree che l'utente ha aperto con un clic.
  const aggregati = new Map();
  // Aree rese a cerchio. La decisione NON si prende nel ciclo di disegno (k dipende
  // dall'inquadratura, e l'inquadratura dal numero di cerchi: si morderebbe la coda). La prende
  // `inquadraMappa`, che è l'unico punto che sa quanto spazio serve; poi resta ferma finché
  // l'utente non apre un'area o non zooma dentro.
  let areeChiuse = new Set();
  // Forma congelata della mappa (`formaDaZero`) e cella di ogni nodo: sono la memoria che rende
  // stabile il disegno fra un aggiornamento e l'altro. Vivono quanto la vista.
  let schema = null;
  const celle = new Map(); // id → {a, s, r, c, vivo}
  const RIGHE_MAX = 80;

  const vista = {
    modo,
    // orbita
    ang: 0.6,
    tilt: 0.72,
    dist: 26,
    // mappa: pan in pixel schermo, zoom assoluto
    tx: 0,
    ty: 0,
    k: 1,
    adattata: false,
    // L'utente ha spostato o ingrandito la mappa con le sue mani: da quel momento il riquadro
    // che cambia (rotazione del telefono, finestra ridimensionata) non gli strappa l'inquadratura.
    // Il pulsante ⤢ (adatta) è lì per tornare a vedere tutto, ed è lui a rimetterlo a false.
    manuale: false,
    // comuni
    selezionato: null,
    hover: null,
    lente: 0,
    stratiAttivi: new Set(),
    areeAttive: new Set(),
    relazioniAttive: new Set(),
    filtro: "",
    rotante,
    dentroLente: null,
    // quante etichette sono state disegnate nell'ultimo fotogramma (per il piede e i test)
    etichetteDisegnate: 0,
  };

  // ------------------------------------------------------------------ geometria

  const colore = (rel) => (dati.colori?.[rel] || {}).colore || "rgba(139,151,172,0.55)";
  const areaLabel = (id) => (dati.aree?.[id] || {}).label || id;
  const stratoLabel = (id) => (dati.strati?.[id] || {}).label || id;
  const raggioNodo = (g) => Math.min(9, 3 + Math.sqrt(g || 0) * 1.5);

  /**
   * `precedente` è lo stato della vista PRIMA di un aggiornamento dei dati: filtri spenti, nodo
   * scelto e lente. La memoria si muove da sé (fine turno, chat chiusa, giro periodico) e la
   * vista aperta si rilegge: senza questo, ogni aggiornamento riaccendeva gli strati che
   * l'utente aveva spento e gli toglieva il nodo che stava leggendo.
   */
  function geometria(precedente = null) {
    strati = Object.entries(dati.strati || {}).sort((a, b) => a[1].ordine - b[1].ordine);
    aree = Object.keys(dati.aree || {});
    const indiceStrato = new Map(strati.map(([id], i) => [id, i]));
    const indiceArea = new Map(aree.map((a, i) => [a, i]));
    gradoMax = Math.max(1, ...(dati.nodi || []).map((n) => n.g || 0));
    // Si conservano gli SPENTI, non gli accesi: strati, aree e relazioni che compaiono adesso
    // nascono accesi (una memoria che cresce non deve crescere invisibile).
    const accesi = (tutti, spentiPrima) => new Set(tutti.filter((id) => !spentiPrima.has(id)));
    const spenti = precedente?.spenti || {};
    vista.stratiAttivi = accesi(strati.map(([id]) => id), spenti.strati || new Set());
    vista.areeAttive = accesi(aree.slice(), spenti.aree || new Set());
    // I default valgono alla PRIMA geometria di questa vista. Dopo, conta quello che l'utente ha
    // scelto: se accende «ha toccato» e il grafo si aggiorna, resta accesa (i `spenti` sono quelli
    // del grafo precedente). Applicare il default a ogni giro gliela rispegnerebbe sotto le mani.
    const relazioniSpente = spenti.relazioni || new Set();
    vista.relazioniAttive = new Set(
      Object.keys(dati.colori || {}).filter((id) => !relazioniSpente.has(id) && !(precedente === null && RELAZIONI_SPENTE_DI_DEFAULT.has(id))),
    );
    if (precedente) vista.lente = precedente.lente || 0;
    vista.selezionato = null;
    vista.hover = null;
    vista.dentroLente = null;
    // Grafo nuovo, aree chiuse: l'insieme si rilegge dalle aree, altrimenti resterebbero aperte
    // quelle aperte prima di un aggiornamento automatico dei dati.
    areeChiuse = new Set();
    aggregati.clear();

    // ---- ORBITA: distribuzione a spirale di Fermat dentro lo spicchio dell'area ----
    // Il primo tentativo (tutti i nodi sull'anello del proprio settore) produceva un grappolo
    // illeggibile: i nodi con lo stesso grado finivano sullo stesso raggio, e le aree numerose
    // si ammazzavano su un arco sottile. Qui ogni area riempie il suo spicchio come un DISCO:
    // r ∝ √i, ordinati per centralità, così la densità è uniforme, gli hub stanno vicino
    // all'asse e le foglie vanno in periferia.
    const settore = (Math.PI * 2) / Math.max(1, aree.length);
    const perAreaOrbita = new Map();
    (dati.nodi || []).forEach((n, i) => {
      if (!perAreaOrbita.has(n.a)) perAreaOrbita.set(n.a, []);
      perAreaOrbita.get(n.a).push(i);
    });
    const posizione = new Array((dati.nodi || []).length);
    for (const [area, indici] of perAreaOrbita) {
      const ia = indiceArea.has(area) ? indiceArea.get(area) : 0;
      const quanti = indici.length;
      const ordinati = indici.slice().sort((x, y) => (dati.nodi[y].g || 0) - (dati.nodi[x].g || 0) || String(dati.nodi[x].id).localeCompare(String(dati.nodi[y].id)));
      ordinati.forEach((idx, k) => {
        const frazione = Math.sqrt((k + 0.5) / Math.max(1, quanti));
        const raggio = RAGGIO_DISCO * (0.12 + 0.88 * frazione);
        const jitter = (hash01(dati.nodi[idx].id + "a") - 0.5) * settore * 0.9;
        const ang = ia * settore + settore / 2 + jitter;
        posizione[idx] = [Math.cos(ang) * raggio, Math.sin(ang) * raggio];
      });
    }
    centroY = ((strati.length - 1) * ALTEZZA_STRATO) / 2;

    nodi = (dati.nodi || []).map((n, i) => {
      const is = indiceStrato.get(n.s) ?? 0;
      const [x, z] = posizione[i] || [0, 0];
      return {
        ...n,
        i,
        // Segno della crescita: episodio o decisione di oggi/ieri (vedi `nodoERecente`).
        nuovo: eRecente(n),
        // ORBITA: gli strati sono impilati con l'episodio IN ALTO, come nella mappa: la stessa
        // informazione non deve cambiare verso da una lettura all'altra (prima la catena
        // saliva dal basso e la si leggeva al contrario).
        p: [x, (strati.length - 1 - is) * ALTEZZA_STRATO + (hash01(n.id + "y") - 0.5) * 0.9, z],
        posM: [0, 0], // mappa (2D), riempito da geometriaMappa
        colore: (dati.strati[n.s] || {}).colore || "#8b97ac",
      };
    });

    // Il nodo che si stava leggendo torna al suo posto, ritrovato per ID: dopo un aggiornamento
    // gli indici cambiano (i nodi nuovi possono entrare in mezzo), l'identità no.
    if (precedente?.selezionatoId) {
      const ritrovato = nodi.findIndex((n) => n.id === precedente.selezionatoId);
      if (ritrovato >= 0) vista.selezionato = ritrovato;
    }

    // `inverso` dice il VERSO dell'arco rispetto al nodo che lo guarda: serve a scrivere
    // l'etichetta giusta accanto al vicino («ha toccato» vs «è stato toccato da»).
    vicini = nodi.map(() => []);
    for (const a of dati.archi || []) {
      if (!nodi[a.a] || !nodi[a.b]) continue;
      vicini[a.a].push({ verso: a.b, r: a.r, inverso: false });
      vicini[a.b].push({ verso: a.a, r: a.r, inverso: true });
    }

    geometriaMappa(indiceStrato, indiceArea);
  }

  /**
   * MAPPA: griglia deterministica.
   *
   * La larghezza delle aree NON è un numero fisso: la decidono i nodi. Ogni nodo vale una cella
   * di 152×30 px (un'etichetta ci sta accanto); dato un numero di righe `L` per area, servono
   * ceil(nodi / L) colonne, e da lì vengono fuori larghezza e altezza del mondo. `L` si cerca
   * per bisezione finché la mappa ha la forma voluta (più larga che alta): una mappa a torre —
   * colonne strette e lunghissime — era illeggibile anche a schermo grande, con tutte le
   * etichette accavallate sulla stessa verticale.
   *
   * Il risultato NON dipende dallo schermo: la mappa è identica su desktop e su telefono, e
   * cambia solo l'inquadratura. Una mappa che si ridisegna diversa non si impara.
   */
  function geometriaMappa(indiceStrato, indiceArea) {
    const perArea = new Map(aree.map((a) => [a, []]));
    for (const n of nodi) {
      if (!perArea.has(n.a)) perArea.set(n.a, []);
      perArea.get(n.a).push(n);
    }

    /**
     * LA FORMA DEL MONDO SI SCEGLIE UNA VOLTA.
     *
     * Prima: a ogni aggiornamento la bisezione cercava le righe per colonna che danno l'aspetto
     * voluto. Il risultato era una mappa corretta e *instabile*: misurato sul grafo vero, dopo
     * 68 episodi in più si spostavano **tutti** i 362 nodi già presenti (spostamento medio 360 px).
     * Una mappa che si ridisegna diversa non si impara, e ogni sessione la ridisegnava.
     *
     * Adesso la forma si decide al primo disegno e poi resta: stesse colonne per area, passo
     * fisso, righe che crescono verso il basso, e ogni nodo che tiene la sua cella. I nuovi
     * prendono le celle libere. Conseguenza accettata: nel tempo la mappa può diventare più alta
     * che larga (per questo `RIGHE_MAX` la ricompatta quando esagera) e un nodo che guadagna
     * collegamenti non sale più in alto — la posizione racconta la storia, non il grado di oggi.
     */
    if (!schema) schema = formaDaZero(perArea);
    // Un'area mai vista (raro: le aree sono le cartelle del progetto) entra con le colonne che
    // servono a stare nella stessa altezza media delle altre.
    for (const a of aree) {
      if (!schema.quanti.has(a)) schema.quanti.set(a, Math.max(1, Math.ceil((perArea.get(a) || []).length / Math.max(1, schema.L))));
    }

    const passo = M.passoX;
    const quantiDi = (a) => Math.max(1, schema.quanti.get(a) || 1);

    // 1) celle: chi ce l'ha la tiene, chi è nuovo prende la prima libera (riga per riga).
    const occupate = new Map(); // "area|strato" -> Set("r,c")
    const chiaveCella = (a, is) => a + "|" + is;
    const libera = (a, is, r, c) => {
      const set = occupate.get(chiaveCella(a, is));
      return !set || !set.has(r + "," + c);
    };
    const occupa = (a, is, r, c) => {
      const k = chiaveCella(a, is);
      if (!occupate.has(k)) occupate.set(k, new Set());
      occupate.get(k).add(r + "," + c);
    };
    // prima le celle già assegnate (in ordine di riga/colonna: due aperture danno lo stesso esito)
    const ancorati = [...celle.entries()].sort((x, y) => x[1].r - y[1].r || x[1].c - y[1].c);
    const idNodi = new Set(nodi.map((n) => n.id));
    for (const [id, cella] of ancorati) {
      if (!idNodi.has(id)) continue; // il nodo non c'è più: la cella torna libera
      const n = nodi.find((x) => x.id === id);
      const is = indiceStrato.get(n.s) ?? 0;
      if (cella.a !== n.a || cella.s !== is) continue; // ha cambiato area o strato: si riassegna
      if (!libera(n.a, is, cella.r, cella.c)) continue;
      occupa(n.a, is, cella.r, cella.c);
      cella.vivo = true;
    }
    const righeMax = new Map(); // indice strato -> righe
    for (const a of aree) {
      const quanti = quantiDi(a);
      strati.forEach(([id], is) => {
        const dentro = (perArea.get(a) || [])
          .filter((n) => (indiceStrato.get(n.s) ?? 0) === is)
          .sort((x, y2) => {
            const cx = celle.get(x.id), cy = celle.get(y2.id);
            // chi è ancorato viene prima (tiene la cella), poi i nuovi per grado
            const ax = cx && cx.vivo ? 0 : 1, ay = cy && cy.vivo ? 0 : 1;
            return ax - ay || (y2.g || 0) - (x.g || 0) || String(x.id).localeCompare(String(y2.id));
          });
        for (const n of dentro) {
          const cella = celle.get(n.id);
          if (cella && cella.vivo && cella.a === n.a && cella.s === is) continue;
          // prima cella libera: riga per riga, così i nuovi stanno in basso e non spostano nessuno
          let r = 0, c = 0, trovata = false;
          for (; r < 5000 && !trovata; r++) {
            for (c = 0; c < quanti; c++) {
              if (libera(n.a, is, r, c)) {
                trovata = true;
                break;
              }
            }
            if (trovata) {
              r = r;
              break;
            }
          }
          const cellaN = { a: n.a, s: is, r, c, vivo: true };
          celle.set(n.id, cellaN);
          occupa(n.a, is, r, c);
        }
        // righe occupate in questa (area, strato)
        const righe = dentro.reduce((m, n) => {
          const cel = celle.get(n.id);
          return cel && cel.a === n.a && cel.s === is ? Math.max(m, cel.r + 1) : m;
        }, 1);
        righeMax.set(is, Math.max(righeMax.get(is) || 1, righe));
      });
    }

    // 2) fasce: alte quanto basta al massimo fra le aree (come prima, ma con le righe vere)
    mondo.fasce = [];
    let y = 0;
    strati.forEach(([id], is) => {
      const righe = righeMax.get(is) || 0;
      const h = M.fascia + (righe ? righe * M.passoY + M.margine : 8);
      mondo.fasce.push({ strato: id, y, h, vuota: !righe });
      y += h;
    });
    mondo.h = y;

    // 3) colonne: passo FISSO (le aree non si allargano né si stringono più)
    const larghezze = aree.map((a) => quantiDi(a) * passo);
    mondo.w = larghezze.reduce((a, b) => a + b, 0);
    mondo.colonne = [];
    let cursoreX = -mondo.w / 2;
    aree.forEach((a, i) => {
      mondo.colonne.push({ area: a, x: cursoreX, w: larghezze[i], colonne: quantiDi(a) });
      cursoreX += larghezze[i];
    });

    // 4) posizione: cella → pixel. Il jitter è deterministico dall'id (non dal tempo).
    for (const a of aree) {
      const col = mondo.colonne.find((c) => c.area === a);
      const quanti = Math.max(1, col.colonne);
      const passoArea = col.w / quanti;
      for (const n of perArea.get(a) || []) {
        const is = indiceStrato.get(n.s) ?? 0;
        const cel = celle.get(n.id);
        const fascia = mondo.fasce[is];
        if (!cel || cel.a !== a || cel.s !== is) {
          // non dovrebbe capitare: nodo senza cella (area/strato cambiati durante il giro)
          n.posM = [col.x + passoArea / 2, fascia.y + M.fascia + M.passoY / 2];
          continue;
        }
        const jx = (hash01(n.id + "mx") - 0.5) * 12;
        const jy = (hash01(n.id + "my") - 0.5) * 6;
        n.posM = [col.x + (cel.c + 0.5) * passoArea + jx, fascia.y + M.fascia + (cel.r + 0.5) * M.passoY + jy];
      }
    }

    // 5) Guardia: una mappa a torre non si legge. Se un'area ha troppe righe (nessuno spazio
    //    laterale nel suo passato), si ricompatta da zero — un evento raro, non un'abitudine.
    const righeTotali = Math.max(0, ...righeMax.values());
    if (righeTotali > RIGHE_MAX) {
      schema = null;
      celle.clear();
      geometriaMappa(indiceStrato, indiceArea);
    }
  }

  /**
   * La forma cercata con la bisezione (quella di prima), usata UNA VOLTA per fissare la griglia:
   * righe per colonna che danno alla mappa l'aspetto voluto. Da qui in poi la forma è congelata.
   */
  function formaDaZero(perArea) {
    const elenchi = aree.map((a) => perArea.get(a) || []);
    const perStrato = elenchi.map((l) => {
      const conto = new Map();
      for (const n of l) {
        const is = strati.findIndex(([id]) => id === n.s);
        conto.set(is < 0 ? 0 : is, (conto.get(is < 0 ? 0 : is) || 0) + 1);
      }
      return conto;
    });
    const massimoPerStrato = elenchi.map((l, i) => Math.max(1, ...perStrato[i].values()));
    const misura = (L) => {
      const colonne = massimoPerStrato.map((m) => Math.max(1, Math.ceil(m / L)));
      const larghezze = colonne.map((c) => c * M.passoX);
      let altezza = 0;
      strati.forEach(([id], is) => {
        let righe = 0;
        elenchi.forEach((l, i) => {
          const quanti = perStrato[i].get(is) || 0;
          if (quanti) righe = Math.max(righe, Math.ceil(quanti / colonne[i]));
        });
        altezza += M.fascia + (righe ? righe * M.passoY + M.margine : 8);
      });
      return { L, colonne, larghezza: larghezze.reduce((a, b) => a + b, 0), altezza };
    };
    let lo = 1;
    let hi = Math.max(4, nodi.length);
    let scelta = misura(hi);
    let scarto = Infinity;
    for (let passo = 0; passo < 16; passo++) {
      const mid = (lo + hi) / 2;
      const m = misura(mid);
      const aspetto = m.larghezza / Math.max(1, m.altezza);
      if (Math.abs(aspetto - M.aspetto) < scarto) {
        scarto = Math.abs(aspetto - M.aspetto);
        scelta = m;
      }
      if (aspetto > M.aspetto) lo = mid;
      else hi = mid;
    }
    return { L: scelta.L, quanti: new Map(aree.map((a, i) => [a, Math.max(1, scelta.colonne[i])])) };
  }

  // ------------------------------------------------------------------ filtri e accessibilità

  function acceso(n) {
    if (!vista.stratiAttivi.has(n.s)) return false;
    if (aree.length > 1 && !vista.areeAttive.has(n.a)) return false;
    if (vista.dentroLente && !vista.dentroLente.has(n.i)) return false;
    if (vista.filtro && !(n.n + " " + (n.f || "")).toLowerCase().includes(vista.filtro)) return false;
    return true;
  }

  /** Corrisponde al testo cercato? (usato per l'alone: il filtro ATTENUA, non nasconde) */
  function trovato(n) {
    return !!vista.filtro && (n.n + " " + (n.f || "")).toLowerCase().includes(vista.filtro);
  }

  function calcolaLente() {
    if (!vista.lente || vista.selezionato === null) {
      vista.dentroLente = null;
      return;
    }
    const dentro = new Set([vista.selezionato]);
    let frontiera = [vista.selezionato];
    for (let passo = 0; passo < vista.lente; passo++) {
      const nuova = [];
      for (const i of frontiera) {
        for (const v of vicini[i] || []) {
          if (dentro.has(v.verso)) continue;
          dentro.add(v.verso);
          nuova.push(v.verso);
        }
      }
      frontiera = nuova;
    }
    vista.dentroLente = dentro;
  }

  /** Il nodo è nel vicinato diretto del selezionato? (o è il selezionato stesso) */
  function inEvidenza(n) {
    if (vista.selezionato === null) return false;
    if (n.i === vista.selezionato) return true;
    return (vicini[vista.selezionato] || []).some((v) => v.verso === n.i);
  }

  function nodoVisibile(n) {
    return acceso(n) && (!vista.filtro || trovato(n));
  }

  // ------------------------------------------------------------------ proiezioni

  /** ORBITA: proiezione grezza (senza inquadratura): serve a calcolare baricentro e scala. */
  function grezzo(p) {
    const ca = Math.cos(vista.ang), sa = Math.sin(vista.ang);
    const x1 = p[0] * ca - p[2] * sa;
    const z1 = p[0] * sa + p[2] * ca;
    const ct = Math.cos(vista.tilt), st = Math.sin(vista.tilt);
    const yc = p[1] - centroY;
    const y2 = yc * ct - z1 * st;
    const z2 = yc * st + z1 * ct;
    const prof = vista.dist + z2;
    const scala = prof > 1 ? 22 / prof : 22;
    return { x: x1 * scala * 22, y: -y2 * scala * 22, z: prof, s: scala };
  }

  function proiettaOrbita(p) {
    const g = grezzo(p);
    return {
      x: canvas.clientWidth / 2 + (g.x - inquadratura.bx) * inquadratura.fit,
      y: canvas.clientHeight / 2 + (g.y - inquadratura.by) * inquadratura.fit,
      z: g.z,
      s: g.s * inquadratura.fit,
    };
  }

  /** Baricentro e scala dell'orbita perché il disegno riempia il canvas (margine 12%). */
  function inquadraOrbita() {
    const larghezza = Math.max(1, canvas.clientWidth);
    const altezza = Math.max(1, canvas.clientHeight);
    if (!nodi.length) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const n of nodi) {
      const g = grezzo(n.p);
      if (g.x < x0) x0 = g.x;
      if (g.x > x1) x1 = g.x;
      if (g.y < y0) y0 = g.y;
      if (g.y > y1) y1 = g.y;
    }
    inquadratura.bx = (x0 + x1) / 2;
    inquadratura.by = (y0 + y1) / 2;
    inquadratura.fit = Math.max(0.35, Math.min(1.5, Math.min((larghezza * 0.88) / (x1 - x0 || 1), (altezza * 0.88) / (y1 - y0 || 1))));
  }

  /** MAPPA: mondo → schermo. `k` è lo zoom, `tx/ty` dove finisce l'origine del mondo. */
  const m2s = (p) => ({ x: vista.tx + p[0] * vista.k, y: vista.ty + p[1] * vista.k });
  const s2m = (x, y) => ({ x: (x - vista.tx) / vista.k, y: (y - vista.ty) / vista.k });

  /** MAPPA: adatta il grafo al canvas (margine 6%) e centra.
   *  L'inquadratura dipende dallo schermo (è quello che vuol dire «adatta»), il DISEGNO no:
   *  le posizioni dei nodi sono le stesse su desktop e su telefono. Su uno schermo stretto si
   *  vede quindi una struttura più fitta: i nomi arrivano con lo zoom, che è a un pizzico di
   *  distanza — ed è meglio di un ingrandimento forzato che mostrerebbe solo un angolo. */
  /** Le aree che, in vista d'insieme, valgono un cerchio invece di qualche centinaio di punti. */
  function areeAggregabili() {
    const conta = new Map();
    for (const n of nodi) {
      if (!nodoVisibile(n)) continue;
      conta.set(n.a, (conta.get(n.a) || 0) + 1);
    }
    return new Set([...conta.entries()].filter(([, q]) => q >= MIN_NODI_AGGREGATI).map(([a]) => a));
  }

  /**
   * Il rettangolo da inquadrare: quello dei nodi visibili, tranne quelli delle aree chiuse il cui
   * spazio è occupato dal cerchio (che sta al centro della colonna). Inquadrare il mondo intero
   * lasciava mezzo schermo di vuoto: le colonne di un'area chiusa restano larghe anche quando i
   * suoi nodi non si vedono.
   */
  function rettangoloVisibile(chiuse) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const aggiungi = (x, y) => {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    };
    for (const n of nodi) {
      if (!nodoVisibile(n) || chiuse.has(n.a)) continue;
      aggiungi(n.posM[0], n.posM[1]);
    }
    for (const area of chiuse) {
      const dentro = nodi.filter((n) => n.a === area && nodoVisibile(n));
      if (!dentro.length) continue;
      const xs = dentro.map((n) => n.posM[0]);
      const ys = dentro.map((n) => n.posM[1]);
      aggiungi(Math.min(...xs) - 14, Math.min(...ys) - 12);
      aggiungi(Math.max(...xs) + 14, Math.max(...ys) + 12);
    }
    if (!Number.isFinite(x0)) return null;
    return { x0, x1, y0, y1 };
  }

  function inquadraMappa() {
    // Riquadro non ancora disposto (vista appena mostrata, canvas a 0×0): non si inquadra un
    // mondo dentro zero pixel, si aspetta il primo fotogramma utile. Segnare «adattata» qui
    // lasciava il grafo minuscolo per sempre.
    if (canvas.clientWidth < 40 || canvas.clientHeight < 40) return;
    const larghezza = canvas.clientWidth;
    const altezza = canvas.clientHeight;
    if (!mondo.w || !mondo.h) return;
    vista.manuale = false;
    // Decisione d'insieme: se ci sono aree grandi, si chiudono in un cerchio e ci si inquadra
    // su ciò che resta. Poi resta ferma (la cambia solo «adatta», un clic o lo zoom dentro).
    areeChiuse = areeAggregabili();
    const r = rettangoloVisibile(areeChiuse) || { x0: -mondo.w / 2, x1: mondo.w / 2, y0: 0, y1: mondo.h };
    const larg = Math.max(1, r.x1 - r.x0 + 240); // margine per le etichette a destra dei nodi
    const alt = Math.max(1, r.y1 - r.y0 + 100);
    const k = Math.max(0.12, Math.min(2.4, Math.min((larghezza * 0.94) / larg, (altezza * 0.9) / alt)));
    vista.k = k;
    vista.tx = larghezza / 2 - ((r.x0 + r.x1) / 2) * k;
    vista.ty = Math.max(28, altezza / 2 - ((r.y0 + r.y1) / 2) * k);
    vista.adattata = true;
  }

  // ------------------------------------------------------------------ disegno: comune

  function fondoSfumato() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "#0d1626");
    g.addColorStop(1, "#05070c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /** Etichetta leggibile su qualunque sfondo: contorno scuro + riempimento. */
  function testoConBordo(testo, x, y, coloreTesto, bordo = "rgba(5,7,12,0.92)", spessore = 3.4) {
    ctx.lineJoin = "round";
    ctx.lineWidth = spessore;
    ctx.strokeStyle = bordo;
    ctx.strokeText(testo, x, y);
    ctx.fillStyle = coloreTesto;
    ctx.fillText(testo, x, y);
  }

  function accorcia(testo, massimo) {
    const t = String(testo || "");
    return t.length > massimo ? t.slice(0, massimo - 1).replace(/[-–—\s]\S*$/, "") + "…" : t;
  }

  /**
   * ETICHETTE SENZA SOVRAPPOSIZIONI, in ordine di rilevanza.
   * La prima versione stampava tutte le etichette per grado: sullo schermo diventava una
   * macchia di testo — lo stesso errore del gomitolo, spostato dal segno al nome. Qui si
   * disegnano in ordine di priorità e si SCARTA quella che finirebbe sopra un'altra, con un
   * tetto che dipende dallo spazio. Le eccezioni sono il nodo scelto e i suoi vicini: quelli
   * si mostrano comunque, e per ultimi (cioè sopra tutto).
   */
  /** Dove va il testo: a destra del nodo, ma se uscirebbe dallo schermo si rovescia a
   *  sinistra. Su un telefono metà delle etichette finiva tagliata dal bordo. */
  function posizionaEtichetta(e, larghezza) {
    const W = canvas.clientWidth;
    if (e.x + larghezza > W - 6) return Math.max(6, (e.ancora === undefined ? e.x : e.ancora) - larghezza - 6);
    return e.x;
  }

  function disegnaEtichette(candidati, massimo) {
    ctx.font = FONT;
    const occupati = [];
    let disegnate = 0;
    const forzate = candidati.filter((e) => e.forzata).sort((a, b) => b.priorita - a.priorita);
    const normali = candidati.filter((e) => !e.forzata).sort((a, b) => b.priorita - a.priorita);
    const colliso = (box) => occupati.some((o) => !(box.x > o.x + o.w || box.x + box.w < o.x || box.y > o.y + o.h || box.y + box.h < o.y));
    const disegna = (e) => {
      ctx.font = e.forte ? FONT_GRANDE : FONT;
      const testo = accorcia(e.testo, e.massimo || 26);
      const larghezza = ctx.measureText(testo).width + 8;
      const x = posizionaEtichetta(e, larghezza);
      occupati.push({ x: x - 2, y: e.y - 10, w: larghezza, h: 15 });
      testoConBordo(testo, x, e.y, e.colore || "rgba(203,213,225,0.88)", e.bordo);
      disegnate++;
    };
    for (const e of forzate) disegna(e);
    for (const e of normali) {
      if (disegnate >= massimo) break;
      const testo = accorcia(e.testo, e.massimo || 26);
      const larghezza = ctx.measureText(testo).width + 8;
      const x = posizionaEtichetta(e, larghezza);
      if (colliso({ x: x - 2, y: e.y - 10, w: larghezza, h: 15 })) continue;
      disegna(e);
    }
    vista.etichetteDisegnate = disegnate;
    return disegnate;
  }

  /** Arco con colore/alpha coerenti con selezione e relazioni attive.
   *  Con un nodo scelto il disegno fa una cosa sola: gli archi del suo vicinato restano accesi
   *  e tutto il resto si spegne. È la differenza fra «vedo un gomitolo» e «vedo le relazioni
   *  di questo nodo» — ed è la ragione per cui la mappa è leggibile. */
  function stileArco(rel, da, a) {
    if (!vista.relazioniAttive.has(rel)) return null;
    const col = colore(rel);
    if (vista.selezionato === null) return { col, alpha: 0.3, spessore: 1 };
    const dentro = da === vista.selezionato || a === vista.selezionato;
    return dentro ? { col, alpha: 0.95, spessore: 1.7 } : { col, alpha: 0.06, spessore: 1 };
  }

  // ------------------------------------------------------------------ disegno: MAPPA

  /**
   * Decide quali aree diventano un nodo solo. Dipende da tre cose: il dettaglio che lo zoom
   * permette (k), quante schede si stanno leggendo (nessuna), e la volontà dell'utente
   * (`areeAperte`, popolato dal clic sul cerchio).
   */
  function calcolaAggregazione() {
    aggregati.clear();
    if (vista.modo !== "mappa") return;
    if (vista.filtro || vista.selezionato !== null || vista.dentroLente) return;
    if (vista.k >= SOGLIA_ZOOM_APERTA) return;
    const perArea = new Map();
    for (const n of nodi) {
      if (!nodoVisibile(n)) continue;
      const c = perArea.get(n.a) || [];
      c.push(n);
      perArea.set(n.a, c);
    }
    for (const [area, lista] of perArea) {
      if (lista.length < MIN_NODI_AGGREGATI || !areeChiuse.has(area)) continue;
      const col = mondo.colonne.find((c) => c.area === area);
      if (!col) continue;
      const ys = lista.map((n) => n.posM[1]);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      const xs = lista.map((n) => n.posM[0]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      aggregati.set(area, {
        area,
        quanti: lista.length,
        x: (x0 + x1) / 2,
        y: (y0 + y1) / 2,
        // Il rettangolo che i nodi occupavano: disegnarlo (invece di un cerchio al centro di una
        // colonna larga) fa sì che il vuoto non sembri vuoto — quella regione *è* l'area.
        x0, x1, y0, y1,
        r: Math.max(16, Math.min(col.w * 0.42, 12 + Math.sqrt(lista.length) * 5)),
      });
    }
  }

  /** Il cerchio di un'area sotto il puntatore (per aprirla con un clic). */
  function aggregatoSotto(sx, sy) {
    for (const a of aggregati.values()) {
      const p0 = m2s([a.x0, a.y0]);
      const p1 = m2s([a.x1, a.y1]);
      if (sx >= p0.x - 14 && sx <= p1.x + 14 && sy >= p0.y - 12 && sy <= p1.y + 12) return a;
    }
    return null;
  }

  /**
   * Apre un'area: la toglie dall'aggregazione e ci porta dentro l'inquadratura. Non spegne le
   * altre aree (il contesto intorno serve a orientarsi) e non tocca le posizioni dei nodi.
   */
  function apriArea(area) {
    const col = mondo.colonne.find((c) => c.area === area);
    if (!col) return false;
    areeChiuse.delete(area);
    // Si inquadra il rettangolo dei NODI di quell'area, non l'intera altezza del mondo: un'area
    // può stare tutta nello strato artefatti, e inquadrare «mondo.h» la lascerebbe minuscola
    // (misurato: k=0,41 aprendo «media», cioè ancora illeggibile).
    const dentro = nodi.filter((n) => n.a === area && nodoVisibile(n));
    const W = Math.max(1, canvas.clientWidth);
    const H = Math.max(1, canvas.clientHeight);
    if (!dentro.length) return false;
    const xs = dentro.map((n) => n.posM[0]);
    const ys = dentro.map((n) => n.posM[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const larghezza = Math.max(1, x1 - x0 + 260); // margine per le etichette a destra dei nodi
    const altezza = Math.max(1, y1 - y0 + 120);
    const k = Math.max(0.12, Math.min(4, Math.min((W * 0.92) / larghezza, (H * 0.92) / altezza)));
    vista.k = k;
    vista.tx = W / 2 - ((x0 + x1) / 2) * k;
    vista.ty = H / 2 - ((y0 + y1) / 2) * k;
    vista.manuale = true;
    vista.adattata = true;
    sporca();
    return true;
  }

  /**
   * I collegamenti fra le regioni e fra regioni e nodi.
   *
   * Senza questo, la vista d'insieme mostra le aree e quasi nessun arco (i nodi interni non ci
   * sono): si vede la *forma* della memoria ma non dove passa il lavoro. Qui gli archi che
   * toccano un'area chiusa diventano un solo collegamento fra due zone, con lo spessore
   * proporzionale a quanti sono: è la stessa informazione, alla scala della vista.
   */
  function archiTraRegioni() {
    const per = new Map();
    for (const ar of dati.archi || []) {
      if (!vista.relazioniAttive.has(ar.r)) continue;
      const na = nodi[ar.a], nb = nodi[ar.b];
      if (!na || !nb || !nodoVisibile(na) || !nodoVisibile(nb)) continue;
      const ca = aggregati.get(na.a);
      const cb = aggregati.get(nb.a);
      if (!ca && !cb) continue; // dentro una sola regione o fra nodi visibili: già disegnato
      const da = ca ? { tipo: "regione", chiave: ca.area, area: ca.area } : { tipo: "nodo", chiave: na.id, i: na.i };
      const a = cb ? { tipo: "regione", chiave: cb.area, area: cb.area } : { tipo: "nodo", chiave: nb.id, i: nb.i };
      const chiave = [da.chiave, a.chiave].sort().join("→");
      const voce = per.get(chiave) || { da, a, n: 0, rel: ar.r };
      voce.n++;
      per.set(chiave, voce);
    }
    return [...per.values()];
  }

  function disegnaArchiRegioni() {
    if (!aggregati.size) return;
    const posizione = (estremo) => {
      if (estremo.tipo === "regione") {
        const a = aggregati.get(estremo.area);
        return a ? m2s([a.x, a.y]) : null;
      }
      const n = nodi[estremo.i];
      return n ? m2s(n.posM) : null;
    };
    ctx.font = FONT;
    for (const v of archiTraRegioni()) {
      const p0 = posizione(v.da);
      const p1 = posizione(v.a);
      if (!p0 || !p1) continue;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 - 18, p1.x, p1.y);
      ctx.strokeStyle = "rgba(139,151,172,0.35)";
      ctx.lineWidth = Math.min(7, 1 + Math.log2(v.n + 1));
      ctx.stroke();
      if (v.n >= 8) {
        // Il numero sul collegamento: quante relazioni passano di lì. Senza, lo spessore è un
        // indizio; con, è un dato.
        const mx = (p0.x + p1.x) / 2;
        const my = (p0.y + p1.y) / 2 - 18;
        testoConBordo(String(v.n), mx, my - 4, "rgba(203,213,225,0.95)", "rgba(5,7,12,0.95)", 3.2);
      }
    }
  }

  function disegnaAggregati() {
    if (!aggregati.size) return;
    ctx.font = FONT_GRANDE;
    for (const a of aggregati.values()) {
      const p0 = m2s([a.x0, a.y0]);
      const p1 = m2s([a.x1, a.y1]);
      const x = p0.x - 14, y = p0.y - 12, w = Math.max(30, p1.x - p0.x + 28), h = Math.max(26, p1.y - p0.y + 24);
      const colore = (dati.aree?.[a.area] || {}).colore || "#8b97ac";
      // La REGIONE, non un cerchio: lo spazio che i nodi occupavano resta occupato da una lastra
      // colorata con il conteggio. Un cerchio al centro di una colonna larga lasciava mezzo
      // schermo di vuoto e sembrava un errore di disegno.
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, 14);
      else ctx.rect(x, y, w, h);
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = colore;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = colore;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.textAlign = "center";
      testoConBordo(`${areaLabel(a.area)} · ${a.quanti}`, cx, cy, "rgba(226,232,240,0.96)", "rgba(5,7,12,0.95)", 3.6);
      if (h > 60) testoConBordo("clic per aprire", cx, cy + 18, "rgba(148,163,184,0.9)", "rgba(5,7,12,0.9)", 3);
      ctx.textAlign = "left";
    }
  }

  function disegnaMappa() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const k = vista.k;
    fondoSfumato();

    // Bande degli strati: alternanza appena percettibile, così le righe si distinguono senza
    // linee pesanti che competono con gli archi.
    mondo.fasce.forEach((f, is) => {
      if (!vista.stratiAttivi.has(f.strato)) return;
      const y0 = vista.ty + f.y * k;
      const h = f.h * k;
      if (y0 > H || y0 + h < 0) return;
      ctx.fillStyle = is % 2 ? "rgba(148,163,184,0.045)" : "rgba(148,163,184,0.02)";
      ctx.fillRect(0, y0, W, h);
      ctx.strokeStyle = "rgba(148,163,184,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y0) + 0.5);
      ctx.lineTo(W, Math.round(y0) + 0.5);
      ctx.stroke();
    });

    // Separatori delle colonne (aree): tenui, verticali.
    ctx.setLineDash([3, 6]);
    ctx.strokeStyle = "rgba(148,163,184,0.16)";
    for (let i = 1; i < mondo.colonne.length; i++) {
      const c = mondo.colonne[i];
      const x = vista.tx + c.x * k;
      if (x < -20 || x > W + 20) continue;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Zoom semantico: si decide QUI perché prima degli archi servono le aree da saltare, e i
    // nodi visibili devono essere gli stessi per archi, punti ed etichette.
    calcolaAggregazione();
    // Archi: prima i non evidenziati, poi quelli del nodo scelto (sopra tutto).
    const archiOrdinati = [];
    for (let i = 0; i < (dati.archi || []).length; i++) {
      const a = dati.archi[i];
      const na = nodi[a.a], nb = nodi[a.b];
      if (!na || !nb || !acceso(na) || !acceso(nb)) continue;
      if (aggregati.has(na.a) || aggregati.has(nb.a)) continue; // dentro un'area aggregata non si disegna
      const evidenziato = vista.selezionato !== null && (a.a === vista.selezionato || a.b === vista.selezionato);
      archiOrdinati.push({ a, na, nb, evidenziato });
    }
    archiOrdinati.sort((x, y) => Number(x.evidenziato) - Number(y.evidenziato));
    for (const { a, na, nb } of archiOrdinati) {
      const st = stileArco(a.r, a.a, a.b);
      if (!st) continue;
      const p0 = m2s(na.posM);
      const p1 = m2s(nb.posM);
      // Curva verticale: fra nodi di strati diversi si scende diritti (è la catena); fra nodi
      // dello stesso strato si arco sopra, per non tagliare i nodi in mezzo.
      const dy = p1.y - p0.y;
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2 - (Math.abs(dy) < 14 ? 26 : 0);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(cx, cy, p1.x, p1.y);
      ctx.strokeStyle = st.col;
      ctx.globalAlpha = st.alpha;
      ctx.lineWidth = st.spessore;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Zoom semantico: si decide QUI perché prima degli archi servono le aree da saltare, e i
    // nodi visibili devono essere gli stessi per archi, punti ed etichette.
    // Nodi: prima quelli spenti (contesto, molto tenui), poi gli accesi, poi gli evidenziati.
    const visibili = nodi.filter(nodoVisibile);
    const spenti = nodi.filter((n) => acceso(n) && !nodoVisibile(n));
    const raggio = (n, scelto) => Math.max(2.6, raggioNodo(n.g)) * (scelto ? 1.45 : 1);
    for (const n of spenti) {
      if (aggregati.has(n.a)) continue;
      const p = m2s(n.posM);
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, raggio(n, false) * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = n.colore;
      ctx.globalAlpha = 0.1;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const ordinaPerPriorita = (a, b) => {
      const pa = (a.i === vista.selezionato ? 3 : 0) + (inEvidenza(a) ? 2 : 0) + (trovato(a) ? 1 : 0);
      const pb = (b.i === vista.selezionato ? 3 : 0) + (inEvidenza(b) ? 2 : 0) + (trovato(b) ? 1 : 0);
      return pa - pb || (a.g || 0) - (b.g || 0);
    };
    const candidatiEtichette = [];
    for (const n of visibili.slice().sort(ordinaPerPriorita)) {
      if (aggregati.has(n.a)) continue;
      const p = m2s(n.posM);
      const fuori = p.x < -40 || p.x > W + 40 || p.y < -30 || p.y > H + 30;
      const scelto = n.i === vista.selezionato;
      const vicino = inEvidenza(n) && !scelto;
      const match = trovato(n);
      const attenuato = vista.selezionato !== null && !scelto && !vicino;
      if (!fuori) {
        const r = raggio(n, scelto);
        // Alone per i risultati della ricerca: si vedono anche a vista d'insieme.
        if (match) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 7, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(251,191,36,0.85)";
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = scelto ? "#fbbf24" : n.colore;
        ctx.globalAlpha = scelto ? 1 : attenuato ? 0.35 : 0.95;
        ctx.fill();
        // Anello dei nodi NUOVI: è l'unico segno che dice «la memoria si è mossa» — senza,
        // una memoria che cresce di due nodi al giorno è indistinguibile da una ferma.
        if (n.nuovo && !scelto) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3.4, 0, Math.PI * 2);
          ctx.strokeStyle = attenuato ? "rgba(226,232,240,0.3)" : "rgba(244,247,255,0.85)";
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }
        if (scelto || vicino) {
          ctx.lineWidth = scelto ? 2 : 1.2;
          ctx.strokeStyle = scelto ? "rgba(251,191,36,0.95)" : "rgba(226,232,240,0.5)";
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      // Etichette: i nomi si disegnano dove c'è spazio. A zoom basso (tutto il grafo in una
      // schermata) le celle sono più fitte dei caratteri: la collisione scarta da sola quasi
      // tutti i nomi e restano quelli più distanziati — meglio di un disegno completamente
      // muto, che lascia l'utente davanti a puntini senza nome.
      const forzata = scelto || vicino || match;
      if (fuori) continue;
      candidatiEtichette.push({
        testo: n.n + (vicino ? " " + frecciaRelazione(n) : ""),
        x: p.x + raggio(n, scelto) + 6,
        ancora: p.x,
        y: p.y + 4,
        priorita: (scelto ? 1e6 : 0) + (vicino ? 1e5 : 0) + (match ? 1e4 : 0) + (n.g || 0),
        forzata,
        forte: scelto,
        massimo: 30,
        colore: scelto ? "#fde68a" : vicino ? "#e2e8f0" : match ? "#fcd34d" : "rgba(203,213,225,0.85)",
      });
    }
    // Quante etichette entrano: stima per area disponibile, poi la collisione fa il resto.
    const massimoEtichette = Math.max(6, Math.min(150, Math.round((W * H) / 5200)));
    disegnaEtichette(candidatiEtichette, massimoEtichette);
    disegnaArchiRegioni();
    disegnaAggregati();

    intestazioniMappa();
    piede();
    tooltip(hoverSchermo ? proiettaHover() : null);
  }

  /** Etichetta breve con la relazione verso il nodo scelto (per il vicinato evidenziato). */
  function frecciaRelazione(n) {
    if (vista.selezionato === null) return "";
    const v = (vicini[vista.selezionato] || []).find((x) => x.verso === n.i);
    if (!v) return "";
    const r = dati.colori?.[v.r] || {};
    return "· " + ((v.inverso ? r.inversa : r.label) || v.r);
  }

  /** Nome delle aree sopra le colonne e nome degli strati a sinistra: RESTANO visibili
   *  durante il pan, come le intestazioni di un foglio di calcolo. Senza, zoomando fuori
   *  dal centro non sapresti più in che colonna ti trovi. */
  function intestazioniMappa() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const ALT = 22;
    ctx.font = FONT_GRANDE;
    // barra in alto
    ctx.fillStyle = "rgba(5,7,12,0.86)";
    ctx.fillRect(0, 0, W, ALT + 8);
    // Le intestazioni si spostano col pan e si fermano ai bordi; quando due finiscono vicine
    // (zoom basso, colonne strette) la seconda si tace: meglio tre nomi leggibili che cinque
    // sovrapposti. L'ordine di arrivo è di sinistra, quindi vince la colonna più a sinistra.
    const scritte = [];
    for (const c of mondo.colonne) {
      if (!vista.areeAttive.has(c.area)) continue;
      const sinistra = vista.tx + c.x * vista.k;
      const destra = vista.tx + (c.x + c.w) * vista.k;
      // Solo le colonne che si vedono: un nome fermo al bordo per una colonna fuori campo
      // inganna (diceva «docs · 7» mentre i docs erano a due schermate di distanza).
      if (destra < 0 || sinistra > W) continue;
      const xc = vista.tx + (c.x + c.w / 2) * vista.k;
      const x = Math.max(46, Math.min(W - 46, xc));
      const etichetta = areaLabel(c.area);
      const quanti = nodi.filter((n) => n.a === c.area && acceso(n)).length;
      const testo = etichetta + " · " + quanti;
      const mezza = ctx.measureText(testo).width / 2 + 8;
      scritte.push({ x, testo, mezza, colore: (dati.aree?.[c.area] || {}).colore || "#cbd5e1" });
    }
    scritte.sort((a, b) => a.x - b.x);
    let ultimaFine = -Infinity;
    for (const s of scritte) {
      if (s.x - s.mezza < ultimaFine) continue;
      ultimaFine = s.x + s.mezza;
      ctx.textAlign = "center";
      testoConBordo(s.testo, s.x, ALT - 6, s.colore, "rgba(5,7,12,0.95)", 3);
      ctx.textAlign = "left";
    }
    // colonna a sinistra con gli strati
    ctx.fillStyle = "rgba(5,7,12,0.8)";
    ctx.fillRect(0, ALT + 8, 78, H - ALT - 8);
    mondo.fasce.forEach((f) => {
      if (!vista.stratiAttivi.has(f.strato)) return;
      const yc = vista.ty + (f.y + 14) * vista.k;
      if (yc < ALT + 16 || yc > H + 40) return;
      const etichetta = stratoLabel(f.strato);
      testoConBordo(etichetta, 10, Math.max(ALT + 22, Math.min(H - 8, yc)), (dati.strati?.[f.strato] || {}).colore || "#cbd5e1", "rgba(5,7,12,0.95)", 3);
    });
  }

  // ------------------------------------------------------------------ disegno: ORBITA

  function anelli() {
    ctx.lineWidth = 1;
    strati.forEach(([id, st], i) => {
      if (!vista.stratiAttivi.has(id)) return;
      const punti = [];
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const p = proiettaOrbita([Math.cos(ang) * RAGGIO_DISCO, i * ALTEZZA_STRATO, Math.sin(ang) * RAGGIO_DISCO]);
        punti.push([p.x, p.y]);
      }
      ctx.beginPath();
      ctx.moveTo(punti[0][0], punti[0][1]);
      for (const [x, y] of punti.slice(1)) ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(148,163,184,0.18)";
      ctx.stroke();
      const t = proiettaOrbita([RAGGIO_DISCO * 1.05, i * ALTEZZA_STRATO, 0]);
      testoConBordo(st.label, t.x + 6, t.y + 4, "rgba(203,213,225,0.78)");
    });
  }

  function spicchi() {
    if (aree.length < 2 || aree.length > 12) return;
    const settore = (Math.PI * 2) / aree.length;
    ctx.setLineDash([3, 5]);
    aree.forEach((a, i) => {
      if (!vista.areeAttive.has(a)) return;
      const ang = i * settore + settore / 2;
      const p1 = proiettaOrbita([Math.cos(ang) * RAGGIO_DISCO * 0.35, 0, Math.sin(ang) * RAGGIO_DISCO * 0.35]);
      const p2 = proiettaOrbita([Math.cos(ang) * RAGGIO_DISCO * 1.18, 0, Math.sin(ang) * RAGGIO_DISCO * 1.18]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.stroke();
      const t = proiettaOrbita([Math.cos(ang) * RAGGIO_DISCO * 1.3, 0.4, Math.sin(ang) * RAGGIO_DISCO * 1.3]);
      ctx.font = FONT;
      ctx.textAlign = "center";
      testoConBordo(areaLabel(a), t.x, t.y + 4, (dati.aree?.[a] || {}).colore || "rgba(203,213,225,0.7)");
      ctx.textAlign = "left";
    });
    ctx.setLineDash([]);
  }

  function disegnaOrbita() {
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    fondoSfumato();
    anelli();
    spicchi();

    const archi = (dati.archi || []).map((a, i) => i).filter((i) => {
      const a = dati.archi[i];
      const na = nodi[a.a], nb = nodi[a.b];
      return na && nb && acceso(na) && acceso(nb) && vista.relazioniAttive.has(a.r);
    });
    archi.sort((x, y) => proiettaOrbita(nodi[dati.archi[y].a]?.p || [0, 0, 0]).z - proiettaOrbita(nodi[dati.archi[x].a]?.p || [0, 0, 0]).z);
    for (const i of archi) {
      const a = dati.archi[i];
      const na = nodi[a.a], nb = nodi[a.b];
      const st = stileArco(a.r, a.a, a.b);
      if (!st) continue;
      const p0 = proiettaOrbita(na.p), p1 = proiettaOrbita(nb.p);
      // Curva, non retta: in prospettiva due linee dritte si confondono con lo sfondo.
      const medio = proiettaOrbita([(na.p[0] + nb.p[0]) / 2, Math.max(na.p[1], nb.p[1]) + 1.1, (na.p[2] + nb.p[2]) / 2]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(medio.x, medio.y, p1.x, p1.y);
      ctx.strokeStyle = st.col;
      ctx.globalAlpha = st.alpha;
      ctx.lineWidth = st.spessore;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const candidati = [];
    const ordinati = nodi.filter(acceso).sort((a, b) => proiettaOrbita(b.p).z - proiettaOrbita(a.p).z);
    for (const n of ordinati) {
      const p = proiettaOrbita(n.p);
      const scelto = n.i === vista.selezionato;
      const vicino = inEvidenza(n) && !scelto;
      const attenuato = vista.selezionato !== null && !scelto && !vicino;
      const r = raggioNodo(n.g) * (scelto ? 1.5 : 1) * (0.7 + p.s * 0.5);
      if (trovato(n)) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3, r) + 7, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(251,191,36,0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.6, r), 0, Math.PI * 2);
      ctx.fillStyle = scelto ? "#fbbf24" : n.colore;
      ctx.globalAlpha = scelto ? 1 : attenuato ? 0.28 : 0.92;
      ctx.fill();
      // Anello dei nodi nuovi, come nella mappa (stessa informazione, stessa forma).
      if (n.nuovo && !scelto) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.6, r) + 3.4, 0, Math.PI * 2);
        ctx.strokeStyle = attenuato ? "rgba(226,232,240,0.3)" : "rgba(244,247,255,0.85)";
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      if (scelto) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(251,191,36,0.9)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3, r) + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      candidati.push({
        testo: n.n,
        x: p.x + Math.max(3, r) + 6,
        ancora: p.x,
        y: p.y + 4,
        priorita: (scelto ? 1e6 : 0) + (vicino ? 1e5 : 0) + (trovato(n) ? 1e4 : 0) + (n.g || 0),
        forzata: scelto || vicino || trovato(n),
        forte: scelto,
        massimo: 24,
        colore: scelto ? "#fde68a" : vicino ? "#e2e8f0" : trovato(n) ? "#fcd34d" : "rgba(203,213,225,0.8)",
      });
    }
    // Su schermo stretto (telefono) le etichette si accavallano al disegno e fra loro: se ne
    // mostrano la metà. Verificato su 390 px: con 16 etichette il grafo diventava una macchia
    // di testo proprio dove serviva leggere i nodi.
    const massimo = canvas.clientWidth < 520 ? 8 : 16;
    disegnaEtichette(candidati, massimo);
    piede();
    tooltip(hoverSchermo ? proiettaHover() : null);
  }

  // ------------------------------------------------------------------ hover e piede

  let hoverSchermo = null; // {x,y} del puntatore, per il tooltip
  function proiettaHover() {
    const n = vista.hover === null ? null : nodi[vista.hover];
    if (!n) return null;
    const p = vista.modo === "mappa" ? m2s(n.posM) : proiettaOrbita(n.p);
    return { n, p };
  }

  /** Scheda minima sotto il puntatore: chi è questo punto, senza doverlo cliccare. */
  function tooltip(dato) {
    if (!dato || !hoverSchermo) return;
    const { n, p } = dato;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const righe = [
      accorcia(n.n, 42),
      stratoLabel(n.s) + " · " + areaLabel(n.a) + " · " + (n.g || 0) + " collegamenti",
    ];
    ctx.font = FONT;
    const larghezza = Math.min(300, Math.max(...righe.map((r) => ctx.measureText(r).width)) + 16);
    const altezza = righe.length * 15 + 10;
    let x = p.x + 12;
    let y = p.y + 12;
    if (x + larghezza > W - 6) x = Math.max(6, p.x - larghezza - 12);
    if (y + altezza > H - 6) y = Math.max(6, p.y - altezza - 12);
    ctx.fillStyle = "rgba(9,13,22,0.94)";
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, larghezza, altezza, 6) : ctx.rect(x, y, larghezza, altezza);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(righe[0], x + 8, y + 17);
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.fillText(righe[1], x + 8, y + 32);
  }

  function piede() {
    ctx.font = FONT;
    const W = canvas.clientWidth;
    const visibili = nodi.filter(nodoVisibile).length;
    const totale = nodi.length;
    // I nodi nuovi VISIBILI (i filtri possono nasconderli): il numero deve sempre descrivere
    // quello che si sta guardando. `contaNuovi()` dice invece quanti sono nel grafo.
    const nuovi = nodi.filter((n) => n.nuovo && nodoVisibile(n)).length;
    const codaNuovi = nuovi ? ` · +${nuovi} nuov${nuovi === 1 ? "o" : "i"}` : "";
    // Le aree chiuse si contano su quelle VISIBILI: dopo aver spento un livello il numero deve
    // descrivere la mappa che si sta guardando.
    const chiuse = aggregati.size;
    const codaAggregati = chiuse ? ` · ${chiuse} are${chiuse === 1 ? "a" : "e"} chius${chiuse === 1 ? "a" : "e"} (clic per aprire)` : "";
    const base = `rgba(148,163,184,0.62)`;
    const striscia = () => {
      ctx.fillStyle = "rgba(5,7,12,0.72)";
      ctx.fillRect(0, canvas.clientHeight - 24, W, 24);
    };
    striscia();
    if (vista.selezionato !== null) {
      const n = nodi[vista.selezionato];
      testoConBordo(`${accorcia(n.n, W < 620 ? 30 : 60)} · ${stratoLabel(n.s)} · ${n.g || 0} collegamenti${n.nuovo ? " · nuovo" : ""}${vista.dentroLente ? " · lente attiva" : ""}`, 12, canvas.clientHeight - 8, "rgba(226,232,240,0.94)", "rgba(5,7,12,0.95)", 3.4);
      return;
    }
    const testo = vista.modo === "mappa"
      ? (W < 620
        ? `${visibili}/${totale} nodi${codaNuovi}${codaAggregati} · trascina · pizzico · doppio tocco = adatta`
        : `${visibili} di ${totale} nodi visibili${codaNuovi}${codaAggregati} · trascina o rotella per esplorare · doppio clic o «adatta» per rivedere tutto · L lente · ${Math.round(vista.k * 100)}%`)
      : (W < 620
        ? `${visibili}/${totale} nodi${codaNuovi} · trascina per ruotare · L lente`
        : `${visibili} di ${totale} nodi visibili${codaNuovi} · trascina per ruotare · rotella per avvicinare · L lente a 2 passi · R rotazione`);
    testoConBordo(testo, 12, canvas.clientHeight - 8, base, "rgba(5,7,12,0.95)", 3.4);
  }

  // ------------------------------------------------------------------ ciclo

  // Ultima dimensione del riquadro per cui il canvas e l'inquadratura sono stati calcolati.
  // Senza questo confronto una rotazione del telefono, una finestra ridimensionata o il pannello
  // laterale che si chiude lasciavano il grafo con lo zoom e lo spostamento del riquadro
  // precedente: disegnato «correttamente» ma in un angolo, con mezzo schermo vuoto.
  let ultimaDim = "";

  function disegna() {
    // Vista nascosta (altra scheda della dashboard) o finestra in secondo piano: non si
    // disegna. Il ciclo resta attivo ma non costa: un canvas in una scheda chiusa che
    // brucia CPU è il modo classico per rovinare una dashboard su telefono.
    if (!canvas.clientWidth || !canvas.clientHeight || document.hidden) { ultimaDim = ""; return; }
    if (vista.modo === "orbita" && vista.rotante && vista.selezionato === null) vista.ang += 0.0016;
    calcolaLente();
    const dpr = Math.min(2, devicePixelRatio || 1);
    // Il riquadro si misura su ENTRAMBE le dimensioni: guardando solo la larghezza, una finestra
    // che cambia solo in altezza (barra del browser che sparisce, tastiera che si apre) lasciava
    // il disegno stirato, perché il fondo scala del canvas era rimasto quello di prima.
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      ultimaDim = ""; // il cambio di fondo scala vale come cambio di riquadro
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dim = canvas.clientWidth + "×" + canvas.clientHeight;
    if (dim !== ultimaDim) {
      ultimaDim = dim;
      // Riquadro nuovo: l'inquadratura va rifatta. Ma chi ha già spostato o ingrandito la mappa
      // con le mani non se la vede strappare — torna a vedere tutto con ⤢ (o il tasto 0).
      if (vista.modo === "mappa") {
        if (!vista.manuale) inquadraMappa();
      } else {
        inquadraOrbita();
      }
    }
    if (vista.modo === "mappa") {
      if (!vista.adattata) inquadraMappa();
      disegnaMappa();
    } else {
      disegnaOrbita();
    }
  }

  let sporco = true;
  const sporca = () => { sporco = true; };
  let raf = null;
  let ultimoInquadra = 0;
  function anima() {
    // Con la rotazione attiva il baricentro proiettato si sposta: si rinquadra di rado (4 volte
    // al secondo), non a ogni frame, altrimenti la scena "respira" e dà fastidio.
    if (vista.modo === "orbita" && vista.rotante) {
      const ora = performance.now();
      if (ora - ultimoInquadra > 250) {
        ultimoInquadra = ora;
        inquadraOrbita();
      }
      sporco = true;
    }
    // Disegno solo quando serve: la mappa è statica fra un gesto e l'altro, e ridisegnarla 60
    // volte al secondo è CPU sprecata (su telefono si sente).
    if (sporco) {
      disegna();
      sporco = false;
    }
    raf = requestAnimationFrame(anima);
  }

  // ------------------------------------------------------------------ interazione

  function nodoSotto(mx, my) {
    let migliore = null;
    let distanza = 16;
    for (const n of nodi) {
      if (!acceso(n)) continue;
      const p = vista.modo === "mappa" ? m2s(n.posM) : proiettaOrbita(n.p);
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < distanza) {
        distanza = d;
        migliore = n;
      }
    }
    return migliore;
  }

  const puntatori = new Map();
  let gesto = null; // {x,y,tx,ty,mosso} per il pan; `pizzico` per due dita
  let pizzico = null;

  function posizione(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  const onDown = (e) => {
    const p = posizione(e);
    puntatori.set(e.pointerId, p);
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    if (puntatori.size === 1) {
      gesto = { x: p.x, y: p.y, tx: vista.tx, ty: vista.ty, ang: vista.ang, tilt: vista.tilt, dist: vista.dist, mosso: false };
    } else if (puntatori.size === 2) {
      const [a, b] = [...puntatori.values()];
      pizzico = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vista.k, dist: vista.dist };
      gesto = null;
    }
  };

  const onMove = (e) => {
    const p = posizione(e);
    hoverSchermo = p;
    if (!puntatori.has(e.pointerId)) {
      // solo passaggio del mouse (nessun tasto premuto)
      if (aggregatoSotto(p.x, p.y)) {
        vista.hover = null;
        canvas.style.cursor = "pointer";
        onHover(null);
        sporca();
        return;
      }
      const n = nodoSotto(p.x, p.y);
      vista.hover = n ? n.i : null;
      canvas.style.cursor = n ? "pointer" : "grab";
      if (n) onHover(n); else onHover(null);
      sporca();
      return;
    }
    puntatori.set(e.pointerId, p);
    if (puntatori.size >= 2 && pizzico) {
      const [a, b] = [...puntatori.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pizzico.d > 8) {
        if (vista.modo === "mappa") {
          const fattore = d / pizzico.d;
          vista.k = Math.max(0.12, Math.min(4, pizzico.k * fattore));
          vista.manuale = true;
        } else {
          vista.dist = Math.max(16, Math.min(70, pizzico.dist - (d - pizzico.d) * 0.12));
        }
      }
      sporca();
      return;
    }
    if (!gesto) return;
    const dx = p.x - gesto.x;
    const dy = p.y - gesto.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) gesto.mosso = true;
    if (vista.modo === "mappa") {
      vista.tx = gesto.tx + dx;
      vista.ty = gesto.ty + dy;
      vista.manuale = true;
    } else {
      vista.rotante = false;
      vista.ang = gesto.ang + dx * 0.008;
      vista.tilt = Math.max(-0.2, Math.min(1.35, gesto.tilt + dy * 0.006));
    }
    sporca();
  };

  let ultimoTap = 0;
  let ultimoTapPunto = null;
  const onUp = (e) => {
    const p = posizione(e);
    puntatori.delete(e.pointerId);
    if (puntatori.size < 2) pizzico = null;
    const mosso = gesto?.mosso;
    if (puntatori.size === 0) gesto = null;
    if (mosso) return;
    const area = aggregatoSotto(p.x, p.y);
    if (area) {
      // Clic su un'area chiusa: si apre. Il resto della mappa resta dov'è.
      apriArea(area.area);
      onSelect(null);
      return;
    }
    const n = nodoSotto(p.x, p.y);
    // DOPPIO TOCCO = adatta. Su un telefono `dblclick` non arriva, quindi il gesto si
    // riconosce qui: due tocchi a vuoto ravvicinati nel tempo e nello spazio.
    const ora = performance.now();
    const rapido = ora - ultimoTap < 320 && ultimoTapPunto && Math.hypot(p.x - ultimoTapPunto.x, p.y - ultimoTapPunto.y) < 30;
    if (!n && rapido) {
      ultimoTap = 0;
      ultimoTapPunto = null;
      adatta();
      return;
    }
    ultimoTap = ora;
    ultimoTapPunto = p;
    if (n) {
      vista.selezionato = n.i;
      onSelect(n);
    } else {
      vista.selezionato = null;
    }
    sporca();
  };

  const onWheel = (e) => {
    e.preventDefault();
    const p = posizione(e);
    if (vista.modo === "mappa") {
      // Zoom sulla posizione del puntatore: il punto che stai guardando resta dov'è.
      const prima = s2m(p.x, p.y);
      const fattore = Math.exp(-e.deltaY * 0.0016);
      vista.k = Math.max(0.12, Math.min(4, vista.k * fattore));
      vista.tx = p.x - prima.x * vista.k;
      vista.ty = p.y - prima.y * vista.k;
      vista.manuale = true;
    } else {
      vista.dist = Math.max(16, Math.min(70, vista.dist + e.deltaY * 0.03));
    }
    sporca();
  };

  const onDblClick = (e) => {
    const p = posizione(e);
    if (vista.modo === "mappa") {
      const n = nodoSotto(p.x, p.y);
      if (!n) adatta();
    } else {
      inquadraOrbita();
      sporca();
    }
  };

  const onKey = (e) => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "l" || e.key === "L") toggleLente();
    if (e.key === "r" || e.key === "R") toggleRotazione();
    if (e.key === "m" || e.key === "M") toggleModo();
    if (e.key === "0") adatta();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", () => { hoverSchermo = null; vista.hover = null; sporca(); });
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDblClick);
  addEventListener("keydown", onKey);

  // ------------------------------------------------------------------ avvio

  geometria();
  inquadraOrbita();
  sporca();
  anima();

  /** Adatta la vista al contenuto (mappa: rivedere tutto; orbita: reinquadrare). */
  function adatta() {
    // «Adatta» = l'insieme: inquadraMappa rimette le aree grandi a cerchio.
    areeChiuse = new Set();
    vista.manuale = false;
    if (vista.modo === "mappa") inquadraMappa();
    else inquadraOrbita();
    sporca();
  }

  function toggleLente() {
    vista.lente = vista.lente ? 0 : 2;
    sporca();
  }

  function toggleRotazione() {
    vista.rotante = !vista.rotante;
    sporca();
  }

  function impostaModo(m) {
    const nuovo = m === "orbita" ? "orbita" : "mappa";
    if (nuovo === vista.modo) return vista.modo;
    vista.modo = nuovo;
    if (nuovo === "mappa") inquadraMappa();
    else inquadraOrbita();
    sporca();
    return vista.modo;
  }

  function toggleModo() {
    return impostaModo(vista.modo === "mappa" ? "orbita" : "mappa");
  }

  /** Zoom per i pulsanti, ancorato al centro del canvas (dove si guarda). */
  function zoom(fattore) {
    if (vista.modo === "mappa") {
      const cx = canvas.clientWidth / 2;
      const cy = canvas.clientHeight / 2;
      const prima = s2m(cx, cy);
      vista.k = Math.max(0.12, Math.min(4, vista.k * fattore));
      // Si sta entrando: i cerchi si aprono (l'aggregazione è una lettura d'insieme).
      if (vista.k >= SOGLIA_ZOOM_APERTA) areeChiuse = new Set();
      vista.tx = cx - prima.x * vista.k;
      vista.ty = cy - prima.y * vista.k;
      vista.manuale = true;
    } else {
      vista.dist = Math.max(16, Math.min(70, vista.dist - (fattore - 1) * 14));
    }
    sporca();
  }

  /**
   * Sostituisce i dati conservando lo stato della vista (filtri spenti, nodo scelto, lente) e la
   * forma del mondo (`schema`, `celle`): è quello che rende il disegno STABILE quando la memoria
   * cresce. Usata da `aggiorna()` e da `ricompatta()` (che azzera prima la forma).
   */
  function applicaGrafo(d) {
    const spenti = {
      strati: new Set(strati.map(([id]) => id).filter((id) => !vista.stratiAttivi.has(id))),
      aree: new Set(aree.filter((a) => !vista.areeAttive.has(a))),
      relazioni: new Set(Object.keys(dati.colori || {}).filter((r) => !vista.relazioniAttive.has(r))),
    };
    const precedente = {
      spenti,
      selezionatoId: vista.selezionato === null ? null : nodi[vista.selezionato]?.id ?? null,
      lente: vista.lente,
    };
    dati = d;
    vista.adattata = false;
    vista.manuale = false; // il grafo è cambiato: la vecchia inquadratura non vale più
    geometria(precedente);
    if (vista.modo === "mappa") inquadraMappa();
    else inquadraOrbita();
    sporca();
  }

  return {
    vista,
    // `nodi` e `vicini` sono riassegnati a ogni `geometria()`: esposti per valore restavano
    // quelli del PRIMO grafo, e chi li legge da fuori (il pannello dei collegamenti della
    // dashboard, l'atlante autonomo) mostrava nodi vecchi o `undefined` dopo un aggiornamento.
    // Con il getter si legge sempre il grafo che si sta disegnando.
    get nodi() { return nodi; },
    get vicini() { return vicini; },
    m2s,
    proietta: proiettaOrbita,
    ridisegna: () => { sporca(); disegna(); sporco = false; },
    aggiorna(d) {
      applicaGrafo(d);
    },
    seleziona(indice) {
      vista.selezionato = indice;
      vista.dentroLente = null;
      sporca();
    },
    selezionaPerId(id) {
      const n = nodi.find((x) => x.id === id || x.f === id);
      if (n) {
        vista.selezionato = n.i;
        sporca();
        return n;
      }
      return null;
    },
    cerca(testo) {
      vista.filtro = String(testo || "").toLowerCase();
      sporca();
    },
    toggleStrato(id) {
      if (vista.stratiAttivi.has(id)) vista.stratiAttivi.delete(id);
      else vista.stratiAttivi.add(id);
      sporca();
    },
    toggleArea(id) {
      if (vista.areeAttive.has(id)) vista.areeAttive.delete(id);
      else vista.areeAttive.add(id);
      sporca();
    },
    toggleRelazione(id) {
      if (vista.relazioniAttive.has(id)) vista.relazioniAttive.delete(id);
      else vista.relazioniAttive.add(id);
      sporca();
    },
    toggleLente,
    toggleRotazione,
    toggleModo,
    impostaModo,
    adatta,
    zoom,
    /** Quanti nodi passano i filtri correnti (strati, aree, lente, ricerca). */
    contaVisibili() {
      return nodi.filter(nodoVisibile).length;
    },
    /** Quanti nodi del grafo sono «nuovi» (episodio o decisione di oggi o di ieri). */
    contaNuovi() {
      return nodi.filter((n) => n.nuovo).length;
    },
    /** I collegamenti aggregati fra regioni e nodi (per i test e per il piede). */
    contaArchiRegioni() {
      return archiTraRegioni().length;
    },
    /** Quante aree sono chiuse in un cerchio solo (zoom semantico). */
    contaAggregati() {
      return aggregati.size;
    },
    /** Le aree chiuse, con il loro conteggio: `[{area, quanti}]`. */
    areeAggregate() {
      return [...aggregati.values()].map((a) => ({ area: a.area, quanti: a.quanti }));
    },
    apriArea,
    /** Dimentica la forma congelata e ridispone la mappa da zero (le posizioni tornano «belle»). */
    ricompatta() {
      schema = null;
      celle.clear();
      applicaGrafo(dati);
    },
    /** Fotografia in PNG: la vista si può salvare e mostrare senza screenshot. */
    png() {
      return canvas.toDataURL("image/png");
    },
    distruggi() {
      if (raf) cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDblClick);
      removeEventListener("keydown", onKey);
    },
  };
}
