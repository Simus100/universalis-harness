# Dimostrazione — schema SVG di un'eclissi di Sole
- richiesta: «Spiegami un'eclissi di Sole con uno schema SVG etichettato in italiano, indicando che dimensioni e distanze non sono in scala.»
- modello: deepseek-flash (istantanea del 2026-09-24T20:32:02.384Z)
- blocchi `svg` nella risposta: 1
- esito del sanitizzatore: accettato
- <title>: Come avviene un'eclissi di Sole
- <desc>: Schema didattico: il Sole a sinistra, la Luna al centro allineata con Sole e Terra, la Terra a destra. Dalla Luna si proiettano un cono d'ombra (umbra) che si chiude a punta sul suolo terrestre e un cono di penombra che si allarga. Dimensioni e distanze non sono in scala.
## Testo della risposta (estratto)
Ecco lo schema, e sotto una lettura breve di cosa succede.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" role="img" aria-label="Schema di un'eclissi di Sole">
  <title>Come avviene un'eclissi di Sole</title>
  <desc>Schema didattico: il Sole a sinistra, la Luna al centro allineata con Sole e Terra, la Terra a destra. Dalla Luna si proiettano un cono d'ombra (umbra) che si chiude a punta sul suolo terrestre e un cono di penombra che si allarga. Dimensioni e distanze non sono in scala.</desc>
  <defs>
    <radialGradient id="sole" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff6cf"/>
      <stop offset="1" stop-color="#fbbf24"/>
    </radialGradient>
  </defs>

  <rect x="0" y="0" width="800" height="420" fill="#0f172a"/>

  <!-- raggi che delimitano i due coni -->
  <line x1="70" y1="132" x2="545" y2="235.5" stroke="#5b6b8a" stroke-width="1"/>
  <line x1="70" y1="218" x2="545" y2="114.5" stroke="#5b6b8a" stroke-width="1"/>
  <line x1="70" y1="132" x2="350" y2="157" stroke="#5b6b8a" stroke-width="1"/>
  <line x1="70" y1="218" x2="350" y2="193" stroke="#5b6b8a" stroke-width="1"/>

  <!-- penombra -->
  <polygon points="267,175 545,114.5 545,2