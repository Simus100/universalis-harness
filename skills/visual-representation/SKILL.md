---
name: visual-representation
description: "Crea rappresentazioni visive nella chat usando SVG scritto come testo (diagrammi di flusso, mappe concettuali, timeline, schemi illustrati, piantine, piccole illustrazioni geometriche); usa ASCII solo per casi minimi o quando il disegno non è disponibile. Serve a scegliere la forma giusta e a produrre un blocco ```svg conforme al contratto; quando basta una spiegazione breve, resta sul testo."
---

# Rappresentazioni visive

Un disegno serve a far capire una struttura, un ordine o una relazione spaziale che a parole
richiederebbe un paragrafo. Non serve a decorare la risposta.

## Quando disegnare

Disegna quando la forma dell'informazione è spaziale o sequenziale e il testo la renderebbe lenta:

- **flusso di processo** → passaggi con un ordine e dei bivi;
- **timeline** → eventi in successione su un asse temporale;
- **mappa concettuale** → pochi concetti e le relazioni fra loro;
- **schema illustrato / piantina** → come sono disposte le parti di un sistema o di uno spazio;
- **illustrazione geometrica** → figure, misure, angoli, grandezze confrontate.

Resta sul testo quando:

- bastano una o due frasi per spiegare la stessa cosa;
- il contenuto è un elenco, una tabella di dati o un ragionamento lineare (lì elenco e tabelle
  Markdown sono più leggibili di un disegno);
- non hai elementi sufficienti per disegnare qualcosa di corretto (vedi *Onestà del disegno*);
- l'utente ha chiesto esplicitamente solo testo.

Un solo disegno chiaro batte tre disegni. Se la risposta contiene tre blocchi `svg` di cui due
decorativi, togli quelli decorativi.

## Forme consigliate

| Cosa devi mostrare | Forma | Confini |
|---|---|---|
| Passi con ordine, bivi | rettangoli + frecce | max 7-8 nodi, altrimenti dividi |
| Cronologia | asse orizzontale o verticale con tappe | max 6-7 tappe |
| Relazioni fra concetti | nodi + linee (senza troppi incroci) | max 8-10 nodi |
| Disposizione di parti/spazi | schema quotato, viste in pianta | dichiara se non è in scala |
| Grandezze, angoli, misure | figura geometrica con etichette | non alterare le proporzioni se conta il confronto |

## Contratto di output

Ogni rappresentazione è **un blocco Markdown con linguaggio `svg`**:

- il blocco contiene **un documento SVG completo**: elemento radice `<svg>`, namespace
  `xmlns="http://www.w3.org/2000/svg"` e attributo `viewBox` (obbligatorio);
- il documento è **autonomo**: niente `script`, risorse esterne, immagini incorporate,
  font scaricati o dipendenze di alcun tipo;
- sono consentiti **forme, tracciati, testo, gruppi, gradienti e altri elementi grafici
  sicuri** (`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `path`, `g`, `text`,
  `tspan`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`);
- inserisci `<title>` e `<desc>` descrittivi come primi figli dell'`<svg>`: servono a chi non
  vede il disegno e a dare un nome al file scaricato;
- **etichette brevi**, contrasto elevato, margini adeguati (20-30 unità), testi leggibili alla
  dimensione della chat (`font-size` 12-16);
- preferisci composizioni semplici e codice compatto: si legge e si corregge meglio;
- accompagna il disegno con **una breve spiegazione** quando aiuta a leggerlo (una o due frasi).

### Non consentito (il disegno verrebbe rifiutato o ripulito)

`<script>`, attributi evento (`onclick`, `onload`, …), `style` e `<style>`, `class`,
`<foreignObject>`, `<image>`, `<use>`, `<a>`, filtri, `<marker>`, `<animate>`/SMIL, `href`
(anche locale), `url(…)` verso l'esterno, DTD/entità. I riferimenti `url(#id)` sono ammessi
**solo** verso gradienti o `clipPath` definiti nello stesso documento.

Conseguenza pratica: le **punte delle frecce vanno disegnate** con un `<polygon>` o un `<path>`,
non con un `<marker>`.

### Igiene del codice

- `viewBox` tipici: `0 0 640 360`, `0 0 800 400`, `0 0 480 640` (verticale);
- non usare `width`/`height` assoluti: il disegno si adatta alla larghezza della chat;
- il fondo in chat è scuro: testo chiaro (`#eef2f9`, `#c6cfdd`) su forme scure, oppure testo
  scuro (`#0a0e15`) sopra forme chiare;
- tavolozza coerente con l'ambiente: blu `#5b9dff`, viola `#8b5cff`, azzurro `#38bdf8`,
  verde `#34d399`, giallo `#fbbf24`, rosso `#fb7185`;
- indentazione e una forma per riga: un blocco leggibile è anche più facile da correggere.

## ASCII, quando l'SVG non serve o non c'è

Usa un disegno ASCII (in un blocco di codice senza linguaggio) solo se:

- la figura è **molto piccola** (una freccia, un albero di 5 righe, un layout di caselle) e un
  blocco SVG sarebbe sproporzionato;
- l'ambiente dichiara di non poter mostrare l'SVG, o l'utente ha chiesto testo semplice.

In ASCII: larghezza massima ~70 caratteri, allineamento rigoroso, niente caratteri che si
rompono su schermi stretti.

## Onestà del disegno

Il disegno è una spiegazione, non una misura. Quindi:

- **non inventare** dati, proporzioni, distanze, date o relazioni che non ti sono state date o
  che non sai;
- se il disegno **non è in scala**, scrivilo: nel `<desc>` e, quando serve, con una nota breve
  accanto al disegno («dimensioni e distanze non in scala»);
- se una proporzione *è* il punto della spiegazione, allora tieni le proporzioni corrette e
  dillo;
- se un dato è incerto, rappresentalo come tale (etichetta «indicativo») oppure ometti la
  grandezza: meglio un disegno più povero che un disegno falso.

## Esempi

### 1. Flusso di processo

Richiesta: «come funziona la pubblicazione di un articolo?»

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 180" role="img" aria-label="Flusso di pubblicazione">
  <title>Flusso di pubblicazione di un articolo</title>
  <desc>Quattro passaggi in sequenza: bozza, revisione, approvazione, pubblicazione. I passaggi non sono in scala temporale.</desc>
  <rect x="20" y="60" width="130" height="60" rx="10" fill="#172033" stroke="#5b9dff" stroke-width="2"/>
  <text x="85" y="95" text-anchor="middle" font-size="15" fill="#eef2f9">bozza</text>
  <rect x="185" y="60" width="130" height="60" rx="10" fill="#172033" stroke="#5b9dff" stroke-width="2"/>
  <text x="250" y="95" text-anchor="middle" font-size="15" fill="#eef2f9">revisione</text>
  <rect x="350" y="60" width="130" height="60" rx="10" fill="#172033" stroke="#5b9dff" stroke-width="2"/>
  <text x="415" y="95" text-anchor="middle" font-size="15" fill="#eef2f9">approvazione</text>
  <rect x="515" y="60" width="130" height="60" rx="10" fill="#1d293d" stroke="#34d399" stroke-width="2"/>
  <text x="580" y="95" text-anchor="middle" font-size="15" fill="#eef2f9">pubblicazione</text>
  <polygon points="152,90 170,82 170,98" fill="#8b97ac"/>
  <polygon points="317,90 335,82 335,98" fill="#8b97ac"/>
  <polygon points="482,90 500,82 500,98" fill="#8b97ac"/>
  <text x="250" y="150" text-anchor="middle" font-size="12" fill="#8b97ac">una revisione non superata riporta alla bozza</text>
</svg>
```

### 2. Timeline

Richiesta: «le tappe del progetto»

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 200" role="img" aria-label="Timeline del progetto">
  <title>Timeline delle tappe di progetto</title>
  <desc>Quattro tappe su un asse temporale: avvio, prototipo, verifica, rilascio. Le distanze fra le tappe non sono in scala.</desc>
  <line x1="50" y1="110" x2="650" y2="110" stroke="#5b9dff" stroke-width="3"/>
  <circle cx="110" cy="110" r="9" fill="#5b9dff"/>
  <circle cx="290" cy="110" r="9" fill="#5b9dff"/>
  <circle cx="470" cy="110" r="9" fill="#5b9dff"/>
  <circle cx="620" cy="110" r="9" fill="#34d399"/>
  <text x="110" y="80" text-anchor="middle" font-size="14" fill="#eef2f9">avvio</text>
  <text x="110" y="145" text-anchor="middle" font-size="12" fill="#8b97ac">settembre</text>
  <text x="290" y="80" text-anchor="middle" font-size="14" fill="#eef2f9">prototipo</text>
  <text x="290" y="145" text-anchor="middle" font-size="12" fill="#8b97ac">ottobre</text>
  <text x="470" y="80" text-anchor="middle" font-size="14" fill="#eef2f9">verifica</text>
  <text x="470" y="145" text-anchor="middle" font-size="12" fill="#8b97ac">novembre</text>
  <text x="620" y="80" text-anchor="middle" font-size="14" fill="#34d399">rilascio</text>
  <text x="620" y="145" text-anchor="middle" font-size="12" fill="#8b97ac">dicembre</text>
</svg>
```

### 3. Illustrazione geometrica semplice

Richiesta: «spiega il teorema di Pitagora»

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 320" role="img" aria-label="Triangolo rettangolo con cateti e ipotenusa">
  <title>Triangolo rettangolo: cateti e ipotenusa</title>
  <desc>Triangolo rettangolo con i cateti etichettati a e b e l'ipotenusa etichettata c. La figura è una illustrazione: le lunghezze non sono in scala.</desc>
  <defs>
    <linearGradient id="ipotenusa" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#5b9dff"/>
      <stop offset="1" stop-color="#8b5cff"/>
    </linearGradient>
  </defs>
  <polygon points="60,260 340,260 340,60" fill="#172033" stroke="url(#ipotenusa)" stroke-width="3"/>
  <path d="M340 236 L316 236 L316 260" fill="none" stroke="#8b97ac" stroke-width="2"/>
  <text x="200" y="292" text-anchor="middle" font-size="16" fill="#38bdf8">cateto a</text>
  <text x="352" y="170" font-size="16" fill="#38bdf8">cateto b</text>
  <text x="150" y="140" text-anchor="middle" font-size="16" fill="#a78bfa">ipotenusa c</text>
  <text x="272" y="248" font-size="14" fill="#34d399">90°</text>
</svg>
```

Con i cateti lunghi `a` e `b` e l'ipotenusa `c` vale `a² + b² = c²`: l'area dei quadrati costruiti
sui cateti è uguale all'area del quadrato costruito sull'ipotenusa.
