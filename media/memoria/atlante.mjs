/**
 * Atlante della memoria: il grafo esplorabile in 3D.
 *
 * TECNICA, E PERCHÉ QUESTA. Canvas 2D con proiezione prospettica scritta a mano: nessuna
 * libreria, nessuna CDN, nessun WebGL obbligatorio, funziona offline e da mobile. Il modello
 * è lo stesso di altair-brain, che su questo ha un documento da manuale: una vista
 * force-directed con mille nodi è un GOMITOLO — la posizione è solo l'equilibrio di una
 * simulazione, non significa nulla, e trovare qualcosa è impossibile. Qui la geometria È
 * l'informazione:
 *
 *   ALTEZZA (Y)  il livello della memoria: episodio → decisione → obiettivo → artefatto.
 *                La catena «cosa è successo → cosa si è deciso → cosa si è prodotto» si legge
 *                come un arco verticale, senza spiegazioni.
 *   ANGOLO       il progetto (le aree). Spicchi di uguale ampiezza: un'area di cui non si
 *                registra nulla resta uno spicchio VUOTO, e il buco si vede a colpo d'occhio.
 *   RAGGIO       la centralità: gli hub vicino all'asse, le foglie in periferia.
 *   DETERMINISMO stesso grafo → stesso disegno, byte per byte. Per una memoria è un requisito,
 *                non un vezzo: una mappa che si ridisegna diversa a ogni apertura non si impara.
 *
 * La LENTE (tasto L) spegne tutto tranne il vicinato del nodo scelto: è il modo per essere
 * chiari e profondi insieme senza tornare al gomitolo.
 *
 * QUESTO FILE NON IMPORTA NULLA, e non può farlo: gira nel browser. È anche l'unica fonte del
 * disegno — `memoria-atlante.mjs` ne incorpora il testo nell'HTML generato (così il file si
 * apre anche da `file://`) e la dashboard lo serve come modulo. Una sola copia del disegno.
 */

/** Hash deterministico in [0,1) — FNV-1a, puro JS: separa i nodi che condividono angolo e raggio. */
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
 * Crea l'atlante su un canvas.
 * @param {object} opzioni
 * @param {HTMLCanvasElement} opzioni.canvas
 * @param {object} opzioni.dati  {nodi:[{id,s,n,f,a,g,d,t}], archi:[{a,b,r}], aree, strati, colori}
 * @param {(nodo:object)=>void} opzioni.onSelect
 */
export function createAtlante({ canvas, dati, onSelect = () => {}, onHover = () => {}, rotante = true }) {
  const ctx = canvas.getContext("2d");
  const RAGGIO_DISCO = 10;
  const ALTEZZA_STRATO = 9;

  let strati = [];
  let aree = [];
  let nodi = [];
  let vicini = [];
  let gradoMax = 1;
  // Centro verticale della pila di strati: senza, la memoria si disegna tutta nella metà alta
  // dello schermo e metà del canvas resta vuoto (verificato sullo screenshot).
  let centroY = 0;
  // Inquadratura: baricentro e scala calcolati sui nodi, così il grafo riempie il canvas invece
  // di stare in un angolo. Senza, la vista dipendeva da quanto era largo il disco in quel
  // momento: metà schermo vuoto e il gruppo spostato (verificato sullo screenshot).
  const inquadratura = { bx: 0, by: 0, fit: 1 };

  const vista = {
    ang: 0.6,
    tilt: 0.72,
    dist: 26,
    selezionato: null,
    lente: 0,
    stratiAttivi: new Set(),
    areeAttive: new Set(),
    filtro: "",
    rotante,
    dentroLente: null,
  };

  function geometria() {
    strati = Object.entries(dati.strati || {}).sort((a, b) => a[1].ordine - b[1].ordine);
    const indiceStrato = new Map(strati.map(([id], i) => [id, i]));
    aree = Object.keys(dati.aree || {});
    const perArea = new Map(aree.map((a, i) => [a, i]));
    gradoMax = Math.max(1, ...(dati.nodi || []).map((n) => n.g || 0));
    vista.stratiAttivi = new Set(strati.map(([id]) => id));
    vista.areeAttive = new Set(aree);
    vista.selezionato = null;
    vista.dentroLente = null;

    // DISTRIBUZIONE. Il primo tentativo (tutti i nodi sull'anello del proprio settore) produceva
    // un grappolo illeggibile: i nodi con lo stesso grado finivano sullo stesso raggio, e le aree
    // numerose si ammazzavano su un arco sottile. Qui ogni area riempie il suo spicchio come un
    // DISCO: i nodi si dispongono su una spirale di Fermat (r ∝ √i) ordinati per centralità, così
    // la densità è uniforme, gli hub restano vicini all'asse e le foglie vanno in periferia.
    const settore = (Math.PI * 2) / Math.max(1, aree.length);
    const perAreaNodi = new Map();
    (dati.nodi || []).forEach((n, i) => {
      const a = n.a;
      if (!perAreaNodi.has(a)) perAreaNodi.set(a, []);
      perAreaNodi.get(a).push(i);
    });
    const posizione = new Array((dati.nodi || []).length);
    for (const [area, indici] of perAreaNodi) {
      const ia = perArea.has(area) ? perArea.get(area) : 0;
      const quanti = indici.length;
      const ordinati = indici.slice().sort((x, y) => (dati.nodi[y].g || 0) - (dati.nodi[x].g || 0) || String(dati.nodi[x].id).localeCompare(String(dati.nodi[y].id)));
      ordinati.forEach((idx, k) => {
        const frazione = Math.sqrt((k + 0.5) / Math.max(1, quanti));
        const raggio = RAGGIO_DISCO * (0.12 + 0.88 * frazione);
        const jitter = (hash01(dati.nodi[idx].id + "a") - 0.5) * settore * 0.9;
        const ang = ia * settore + settore / 2 + jitter;
        posizione[idx] = [Math.cos(ang) * raggio, 0, Math.sin(ang) * raggio];
      });
    }

    centroY = ((strati.length - 1) * ALTEZZA_STRATO) / 2;

    nodi = (dati.nodi || []).map((n, i) => {
      const is = indiceStrato.get(n.s) ?? 0;
      const [x, , z] = posizione[i] || [0, 0, 0];
      return {
        ...n,
        i,
        p: [x, is * ALTEZZA_STRATO + (hash01(n.id + "y") - 0.5) * 0.9, z],
        colore: (dati.strati[n.s] || {}).colore || "#8b97ac",
      };
    });

    vicini = nodi.map(() => []);
    for (const a of dati.archi || []) {
      if (!nodi[a.a] || !nodi[a.b]) continue;
      vicini[a.a].push({ verso: a.b, r: a.r });
      vicini[a.b].push({ verso: a.a, r: a.r });
    }
  }

  const areaLabel = (id) => (dati.aree?.[id] || {}).label || id;

  /** Proiezione grezza (senza inquadratura): serve a calcolare baricentro e scala. */
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

  function proietta(p) {
    const g = grezzo(p);
    return {
      x: canvas.clientWidth / 2 + (g.x - inquadratura.bx) * inquadratura.fit,
      y: canvas.clientHeight / 2 + (g.y - inquadratura.by) * inquadratura.fit,
      z: g.z,
      s: g.s * inquadratura.fit,
    };
  }

  /** Baricentro e scala perché il disegno riempia il canvas (margine 12%). */
  function inquadra() {
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

  function acceso(n) {
    if (!vista.stratiAttivi.has(n.s)) return false;
    if (aree.length > 1 && !vista.areeAttive.has(n.a)) return false;
    if (vista.filtro && !(n.n + " " + n.f).toLowerCase().includes(vista.filtro)) return false;
    if (vista.dentroLente && !vista.dentroLente.has(n.i)) return false;
    return true;
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

  function fondoSfumato() {
    const g = ctx.createRadialGradient(
      canvas.clientWidth / 2, canvas.clientHeight / 2, 0,
      canvas.clientWidth / 2, canvas.clientHeight / 2,
      Math.max(canvas.clientWidth, canvas.clientHeight) * 0.7,
    );
    g.addColorStop(0, "#0d1626");
    g.addColorStop(1, "#05070c");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  }

  function anelli() {
    ctx.lineWidth = 1;
    strati.forEach(([id, st], i) => {
      if (!vista.stratiAttivi.has(id)) return;
      const punti = [];
      for (let a = 0; a <= 64; a++) {
        const ang = (a / 64) * Math.PI * 2;
        const p = proietta([Math.cos(ang) * RAGGIO_DISCO, i * ALTEZZA_STRATO, Math.sin(ang) * RAGGIO_DISCO]);
        punti.push([p.x, p.y]);
      }
      ctx.beginPath();
      ctx.moveTo(punti[0][0], punti[0][1]);
      for (const [x, y] of punti.slice(1)) ctx.lineTo(x, y);
      ctx.strokeStyle = "rgba(148,163,184,0.18)";
      ctx.stroke();
      const t = proietta([RAGGIO_DISCO * 1.05, i * ALTEZZA_STRATO, 0]);
      ctx.fillStyle = "rgba(203,213,225,0.75)";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(st.label, t.x + 6, t.y + 4);
    });
  }

  function spicchi() {
    if (aree.length < 2 || aree.length > 12) return;
    const settore = (Math.PI * 2) / aree.length;
    ctx.setLineDash([3, 5]);
    aree.forEach((a, i) => {
      if (!vista.areeAttive.has(a)) return;
      const ang = i * settore + settore / 2;
      const p1 = proietta([Math.cos(ang) * RAGGIO_DISCO * 0.35, 0, Math.sin(ang) * RAGGIO_DISCO * 0.35]);
      const p2 = proietta([Math.cos(ang) * RAGGIO_DISCO * 1.18, 0, Math.sin(ang) * RAGGIO_DISCO * 1.18]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = "rgba(148,163,184,0.22)";
      ctx.stroke();
      const t = proietta([Math.cos(ang) * RAGGIO_DISCO * 1.3, 0.4, Math.sin(ang) * RAGGIO_DISCO * 1.3]);
      ctx.fillStyle = (dati.aree[a] || {}).colore || "rgba(203,213,225,0.7)";
      ctx.fillText(areaLabel(a), t.x - 14, t.y + 4);
    });
    ctx.setLineDash([]);
  }

  function archi() {
    const ordine = (dati.archi || []).map((_, i) => i).sort((x, y) => {
      const pa = proietta(nodi[dati.archi[x].a]?.p || [0, 0, 0]);
      const pb = proietta(nodi[dati.archi[y].a]?.p || [0, 0, 0]);
      return pb.z - pa.z;
    });
    ctx.lineWidth = 1;
    for (const i of ordine) {
      const a = dati.archi[i];
      const na = nodi[a.a], nb = nodi[a.b];
      if (!na || !nb || !acceso(na) || !acceso(nb)) continue;
      const col = (dati.colori?.[a.r] || {}).colore || "rgba(139,151,172,0.5)";
      const p0 = proietta(na.p), p1 = proietta(nb.p);
      // Curva, non retta: in prospettiva due linee dritte si confondono con lo sfondo.
      const medio = proietta([(na.p[0] + nb.p[0]) / 2, Math.max(na.p[1], nb.p[1]) + 1.1, (na.p[2] + nb.p[2]) / 2]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(medio.x, medio.y, p1.x, p1.y);
      ctx.strokeStyle = col;
      const estraneo = vista.selezionato !== null && a.a !== vista.selezionato && a.b !== vista.selezionato;
      ctx.globalAlpha = estraneo ? 0.22 : 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function nodiDisegnati() {
    const etichette = [];
    const ordinati = nodi.filter(acceso).sort((a, b) => proietta(b.p).z - proietta(a.p).z);
    for (const n of ordinati) {
      const p = proietta(n.p);
      const scelto = n.i === vista.selezionato;
      const raggio = Math.min(9, 2.4 + Math.sqrt(n.g || 0) * 1.9) * (scelto ? 1.5 : 1) * (0.7 + p.s * 0.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.6, raggio), 0, Math.PI * 2);
      ctx.fillStyle = scelto ? "#fbbf24" : n.colore;
      ctx.globalAlpha = scelto ? 1 : 0.92;
      ctx.fill();
      if (scelto) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(251,191,36,0.9)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3, raggio) + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      const vicinoAlScelto = vista.selezionato !== null && (vicini[vista.selezionato] || []).some((v) => v.verso === n.i);
      etichette.push({ n, p, scelto, vicinoAlScelto, rilevanza: (scelto ? 1e6 : 0) + (vicinoAlScelto ? 1e5 : 0) + (n.g || 0) });
    }

    // ETICHETTE: poche e senza sovrapporsi. La prima versione le stampava tutte per grado,
    // e sullo schermo diventavano una macchia di testo: mille etichette sono lo stesso errore
    // del gomitolo, spostato sul testo. Qui si prendono le più rilevanti (il nodo scelto e i
    // suoi vicini prima di tutto) e si scarta quella che finirebbe sopra un'altra.
    ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
    const occupati = [];
    const MAX_ETICHETTE = 16;
    for (const e of etichette.sort((a, b) => b.rilevanza - a.rilevanza)) {
      if (occupati.length >= MAX_ETICHETTE && !e.scelto && !e.vicinoAlScelto) break;
      const testo = e.n.n.length > 22 ? e.n.n.slice(0, 21).replace(/[-–—\s]\S*$/, "") + "…" : e.n.n;
      const larghezza = ctx.measureText(testo).width + 6;
      const box = { x: e.p.x + 6, y: e.p.y - 9, w: larghezza, h: 14 };
      const colliso = occupati.some((o) => !(box.x > o.x + o.w || box.x + box.w < o.x || box.y > o.y + o.h || box.y + box.h < o.y));
      if (colliso) continue;
      occupati.push(box);
      ctx.fillStyle = e.scelto ? "#fde68a" : e.vicinoAlScelto ? "#e2e8f0" : "rgba(203,213,225,0.78)";
      ctx.fillText(testo, box.x, e.p.y + 4);
    }
  }

  function piede() {
    if (vista.selezionato === null) {
      ctx.fillStyle = "rgba(148,163,184,0.55)";
      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("trascina per ruotare · rotella o pizzico per avvicinare · L lente a 2 passi · R rotazione", 16, canvas.clientHeight - 14);
      return;
    }
    const n = nodi[vista.selezionato];
    ctx.fillStyle = "rgba(226,232,240,0.92)";
    ctx.font = "13px ui-sans-serif, system-ui, sans-serif";
    const stratoEtichetta = (dati.strati?.[n.s] || {}).label || n.s;
    ctx.fillText(`${areaLabel(n.a)} · ${stratoEtichetta} · ${n.g || 0} collegamenti${vista.dentroLente ? " · lente attiva" : ""}`, 16, canvas.clientHeight - 14);
  }

  function disegna() {
    // Vista nascosta (altra scheda della dashboard) o finestra in secondo piano: non si
    // disegna. Il ciclo resta attivo ma non costa: un canvas in una scheda chiusa che
    // brucia CPU è il modo classico per rovinare una dashboard su telefono.
    if (!canvas.clientWidth || !canvas.clientHeight || document.hidden) return;
    if (vista.rotante && vista.selezionato === null) vista.ang += 0.0016;
    calcolaLente();
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (canvas.width !== Math.floor(canvas.clientWidth * dpr)) {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fondoSfumato();
    anelli();
    spicchi();
    archi();
    nodiDisegnati();
    piede();
  }

  let raf = null;
  let ultimoInquadra = 0;
  function anima() {
    // Con la rotazione attiva il baricentro proiettato si sposta: si rinquadra di rado (4 volte
    // al secondo), non a ogni frame, altrimenti la scena "respira" e dà fastidio.
    const ora = performance.now();
    if (vista.rotante && ora - ultimoInquadra > 250) {
      ultimoInquadra = ora;
      inquadra();
    }
    disegna();
    raf = requestAnimationFrame(anima);
  }

  function nodoSotto(mx, my) {
    let migliore = null;
    let distanza = 22;
    for (const n of nodi) {
      if (!acceso(n)) continue;
      const p = proietta(n.p);
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < distanza) {
        distanza = d;
        migliore = n;
      }
    }
    return migliore;
  }

  let trascinando = null;
  const onDown = (e) => {
    trascinando = { x: e.clientX, y: e.clientY, ang: vista.ang, tilt: vista.tilt, mosso: false };
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!trascinando) {
      const n = nodoSotto(e.offsetX, e.offsetY);
      canvas.style.cursor = n ? "pointer" : "grab";
      if (n) onHover(n);
      return;
    }
    trascinando.mosso = true;
    vista.rotante = false;
    vista.ang = trascinando.ang + (e.clientX - trascinando.x) * 0.008;
    vista.tilt = Math.max(-0.2, Math.min(1.35, trascinando.tilt + (e.clientY - trascinando.y) * 0.006));
  };
  const onUp = (e) => {
    const mosso = trascinando?.mosso;
    trascinando = null;
    if (mosso) return;
    const n = nodoSotto(e.offsetX, e.offsetY);
    if (n) {
      vista.selezionato = n.i;
      onSelect(n);
    }
  };
  const onWheel = (e) => {
    e.preventDefault();
    vista.dist = Math.max(16, Math.min(70, vista.dist + e.deltaY * 0.03));
  };
  const onTouch = (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pizzico) vista.dist = Math.max(16, Math.min(70, vista.dist + (pizzico - d) * 0.12));
      pizzico = d;
    }
  };
  let pizzico = null;
  const onTouchEnd = () => {
    pizzico = null;
  };
  const onKey = (e) => {
    if (e.key === "l" || e.key === "L") vista.lente = vista.lente ? 0 : 2;
    if (e.key === "r" || e.key === "R") vista.rotante = !vista.rotante;
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchmove", onTouch, { passive: true });
  canvas.addEventListener("touchend", onTouchEnd);
  addEventListener("keydown", onKey);

  geometria();
  inquadra();
  anima();

  return {
    vista,
    nodi,
    vicini,
    proietta,
    ridisegna: disegna,
    aggiorna(d) {
      dati = d;
      geometria();
      disegna();
    },
    seleziona(indice) {
      vista.selezionato = indice;
      vista.dentroLente = null;
      disegna();
    },
    selezionaPerId(id) {
      const n = nodi.find((x) => x.id === id || x.f === id);
      if (n) {
        vista.selezionato = n.i;
        disegna();
        return n;
      }
      return null;
    },
    cerca(testo) {
      vista.filtro = String(testo || "").toLowerCase();
      disegna();
    },
    toggleStrato(id) {
      if (vista.stratiAttivi.has(id)) vista.stratiAttivi.delete(id);
      else vista.stratiAttivi.add(id);
      disegna();
    },
    toggleArea(id) {
      if (vista.areeAttive.has(id)) vista.areeAttive.delete(id);
      else vista.areeAttive.add(id);
      disegna();
    },
    toggleLente() {
      vista.lente = vista.lente ? 0 : 2;
      disegna();
    },
    toggleRotazione() {
      vista.rotante = !vista.rotante;
      disegna();
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
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchend", onTouchEnd);
      removeEventListener("keydown", onKey);
    },
  };
}
