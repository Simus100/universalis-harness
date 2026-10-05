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
 *     NIENTE rotazione: la posizione di un nodo non cambia mai fra un'apertura e l'altra.
 *     PAN e ZOOM: ci si muove come in una mappa geografica (trascina, rotella, pizzico),
 *             con i pulsanti −/＋/adatta sempre a portata di dito.
 *     ETICHETTE: i nomi si vedono; quando due si sovrapporrebbero vince il più rilevante
 *             (selezionato, poi i suoi vicini, poi i risultati della ricerca, poi il grado).
 *     EVIDENZIAZIONE: selezioni un nodo e il resto si attenua — si legge il vicinato, non il
 *             rumore. La ricerca accende un alone sui nodi trovati.
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

const FONT = "12px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_GRANDE = "13px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Crea l'atlante su un canvas.
 * @param {object} opzioni
 * @param {HTMLCanvasElement} opzioni.canvas
 * @param {object} opzioni.dati  {nodi:[{id,s,n,f,a,g,d,t}], archi:[{a,b,r}], aree, strati, colori}
 * @param {(nodo:object)=>void} opzioni.onSelect
 * @param {(nodo:object|null)=>void} opzioni.onHover
 * @param {boolean} opzioni.rotante  rotazione automatica dell'orbita (spenta: si legge meglio)
 * @param {"mappa"|"orbita"} opzioni.modo
 */
export function createAtlante({ canvas, dati, onSelect = () => {}, onHover = () => {}, rotante = false, modo = "mappa" }) {
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

  function geometria() {
    strati = Object.entries(dati.strati || {}).sort((a, b) => a[1].ordine - b[1].ordine);
    aree = Object.keys(dati.aree || {});
    const indiceStrato = new Map(strati.map(([id], i) => [id, i]));
    const indiceArea = new Map(aree.map((a, i) => [a, i]));
    gradoMax = Math.max(1, ...(dati.nodi || []).map((n) => n.g || 0));
    vista.stratiAttivi = new Set(strati.map(([id]) => id));
    vista.areeAttive = new Set(aree);
    vista.relazioniAttive = new Set(Object.keys(dati.colori || {}));
    vista.selezionato = null;
    vista.hover = null;
    vista.dentroLente = null;

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
        // ORBITA: gli strati sono impilati con l'episodio IN ALTO, come nella mappa: la stessa
        // informazione non deve cambiare verso da una lettura all'altra (prima la catena
        // saliva dal basso e la si leggeva al contrario).
        p: [x, (strati.length - 1 - is) * ALTEZZA_STRATO + (hash01(n.id + "y") - 0.5) * 0.9, z],
        posM: [0, 0], // mappa (2D), riempito da geometriaMappa
        colore: (dati.strati[n.s] || {}).colore || "#8b97ac",
      };
    });

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
    const elenchi = aree.map((a) => perArea.get(a) || []);
    const perStrato = elenchi.map((l) => {
      const conto = new Map();
      for (const n of l) {
        const is = indiceStrato.get(n.s) ?? 0;
        conto.set(is, (conto.get(is) || 0) + 1);
      }
      return conto;
    });
    // Il nodo più affollato dell'area in un singolo strato: è lui a decidere quante colonne
    // servono, perché è la fascia più piena a determinare l'altezza.
    const massimoPerStrato = elenchi.map((l, i) => Math.max(1, ...perStrato[i].values()));

    const misura = (L) => {
      const colonne = massimoPerStrato.map((m) => Math.max(1, Math.ceil(m / L)));
      const larghezze = colonne.map((c) => c * M.passoX);
      const fasce = [];
      let y = 0;
      strati.forEach(([id], is) => {
        let righe = 0;
        let qualche = false;
        elenchi.forEach((l, i) => {
          const quanti = perStrato[i].get(is) || 0;
          if (!quanti) return;
          qualche = true;
          righe = Math.max(righe, Math.ceil(quanti / colonne[i]));
        });
        // Fascia senza nodi: resta la sola testata (il buco si vede, senza rubare schermata).
        const h = M.fascia + (qualche ? Math.max(1, righe) * M.passoY + M.margine : 8);
        fasce.push({ strato: id, y, h, vuota: !qualche });
        y += h;
      });
      return { L, colonne, larghezze, fasce, altezza: y, larghezza: larghezze.reduce((a, b) => a + b, 0) };
    };

    // Bisezione su L: cresce L → meno colonne (mappa stretta) e più righe (mappa alta).
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

    const x0 = -scelta.larghezza / 2;
    mondo.colonne = [];
    let cursoreX = x0;
    aree.forEach((a, i) => {
      mondo.colonne.push({ area: a, x: cursoreX, w: scelta.larghezze[i], colonne: scelta.colonne[i] });
      cursoreX += scelta.larghezze[i];
    });
    mondo.fasce = scelta.fasce;
    mondo.h = scelta.altezza;
    mondo.w = scelta.larghezza;

    // Posizione: dentro la cella (strato × area), in righe di `colonne` nodi, i più connessi
    // per primi (in alto: la catena episodio → artefatto resta corta).
    for (const a of aree) {
      const col = mondo.colonne.find((c) => c.area === a);
      const quanti = Math.max(1, col.colonne);
      const passo = col.w / quanti;
      strati.forEach(([id], is) => {
        const fascia = mondo.fasce[is];
        const dentro = (perArea.get(a) || [])
          .filter((n) => (indiceStrato.get(n.s) ?? 0) === is)
          .sort((x, y2) => (y2.g || 0) - (x.g || 0) || String(x.id).localeCompare(String(y2.id)) || x.i - y2.i);
        dentro.forEach((n, k) => {
          const c = k % quanti;
          const r = Math.floor(k / quanti);
          const jx = (hash01(n.id + "mx") - 0.5) * 12;
          const jy = (hash01(n.id + "my") - 0.5) * 6;
          n.posM = [
            col.x + (c + 0.5) * passo + jx,
            fascia.y + M.fascia + (r + 0.5) * M.passoY + jy,
          ];
        });
      });
    }
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
  function inquadraMappa() {
    const larghezza = Math.max(1, canvas.clientWidth);
    const altezza = Math.max(1, canvas.clientHeight);
    if (!mondo.w || !mondo.h) return;
    const k = Math.max(0.12, Math.min(2.4, Math.min((larghezza * 0.94) / mondo.w, (altezza * 0.9) / mondo.h)));
    vista.k = k;
    // Il grafo è centrato sul mondo: l'origine è il bordo sinistro, il centro in x è 0.
    vista.tx = larghezza / 2 - 0 * k;
    vista.ty = Math.max(28, altezza / 2 - (mondo.h / 2) * k);
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

    // Archi: prima i non evidenziati, poi quelli del nodo scelto (sopra tutto).
    const archiOrdinati = [];
    for (let i = 0; i < (dati.archi || []).length; i++) {
      const a = dati.archi[i];
      const na = nodi[a.a], nb = nodi[a.b];
      if (!na || !nb || !acceso(na) || !acceso(nb)) continue;
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

    // Nodi: prima quelli spenti (contesto, molto tenui), poi gli accesi, poi gli evidenziati.
    const visibili = nodi.filter(nodoVisibile);
    const spenti = nodi.filter((n) => acceso(n) && !nodoVisibile(n));
    const raggio = (n, scelto) => Math.max(2.6, raggioNodo(n.g)) * (scelto ? 1.45 : 1);
    for (const n of spenti) {
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
    const base = `rgba(148,163,184,0.62)`;
    const striscia = () => {
      ctx.fillStyle = "rgba(5,7,12,0.72)";
      ctx.fillRect(0, canvas.clientHeight - 24, W, 24);
    };
    striscia();
    if (vista.selezionato !== null) {
      const n = nodi[vista.selezionato];
      testoConBordo(`${accorcia(n.n, W < 620 ? 30 : 60)} · ${stratoLabel(n.s)} · ${n.g || 0} collegamenti${vista.dentroLente ? " · lente attiva" : ""}`, 12, canvas.clientHeight - 8, "rgba(226,232,240,0.94)", "rgba(5,7,12,0.95)", 3.4);
      return;
    }
    const testo = vista.modo === "mappa"
      ? (W < 620
        ? `${visibili}/${totale} nodi · trascina · pizzico · doppio tocco = adatta`
        : `${visibili} di ${totale} nodi visibili · trascina o rotella per esplorare · doppio clic o «adatta» per rivedere tutto · L lente · ${Math.round(vista.k * 100)}%`)
      : (W < 620
        ? `${visibili}/${totale} nodi · trascina per ruotare · L lente`
        : `${visibili} di ${totale} nodi visibili · trascina per ruotare · rotella per avvicinare · L lente a 2 passi · R rotazione`);
    testoConBordo(testo, 12, canvas.clientHeight - 8, base, "rgba(5,7,12,0.95)", 3.4);
  }

  // ------------------------------------------------------------------ ciclo

  function disegna() {
    // Vista nascosta (altra scheda della dashboard) o finestra in secondo piano: non si
    // disegna. Il ciclo resta attivo ma non costa: un canvas in una scheda chiusa che
    // brucia CPU è il modo classico per rovinare una dashboard su telefono.
    if (!canvas.clientWidth || !canvas.clientHeight || document.hidden) return;
    if (vista.modo === "orbita" && vista.rotante && vista.selezionato === null) vista.ang += 0.0016;
    calcolaLente();
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.floor(canvas.clientWidth * dpr)) {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      vista.tx = cx - prima.x * vista.k;
      vista.ty = cy - prima.y * vista.k;
    } else {
      vista.dist = Math.max(16, Math.min(70, vista.dist - (fattore - 1) * 14));
    }
    sporca();
  }

  return {
    vista,
    nodi,
    vicini,
    m2s,
    proietta: proiettaOrbita,
    ridisegna: () => { sporca(); disegna(); sporco = false; },
    aggiorna(d) {
      dati = d;
      vista.adattata = false;
      geometria();
      if (vista.modo === "mappa") inquadraMappa();
      else inquadraOrbita();
      sporca();
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
