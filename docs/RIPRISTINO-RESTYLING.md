# Ripristino: dashboard prima del restyling del 2026-10-04

Guida per tornare allo stato **precedente** al restyling estetico della dashboard (sfondo nero pieno,
rimozione del pulsante «comoda/compatta», header compatto su telefono, temperatura dei colori della
pagina di accesso).

## Dove sta la copia di sicurezza

La copia **non** è nel repository (sta in `/root/pi-harness/backups/`, cartella esclusa dal
versionamento perché contiene anche archivi pesanti). Questo documento è la versione versionata della
guida: se la cartella `backups/restyling-pre-20261004-184319/` non esistesse più, il tag git qui sotto
resta comunque valido.

Sul server:

```
/root/pi-harness/backups/restyling-pre-20261004-184319/
├── dashboard.html          copia esatta di prima dell'intervento
├── dashboard.mjs           copia esatta (solo i colori della pagina di accesso cambiano)
├── manifest.webmanifest    copia esatta
├── sw.js                   copia esatta (non è stato toccato)
├── IMPRONTE.sha256         impronte dei quattro file, per verificare l'integrità della copia
└── RIPRISTINO.md           questo documento
```

Verifica dell'integrità della copia:

```bash
cd /root/pi-harness/backups/restyling-pre-20261004-184319 && sha256sum -c IMPRONTE.sha256
```

## Ripristino completo (tornare esattamente a prima)

```bash
cd /root/pi-harness
cp -p backups/restyling-pre-20261004-184319/dashboard.html       dashboard.html
cp -p backups/restyling-pre-20261004-184319/dashboard.mjs        dashboard.mjs
cp -p backups/restyling-pre-20261004-184319/manifest.webmanifest manifest.webmanifest
bash scripts/restart-dashboard.sh
```

`dashboard.html` è letto da disco a ogni richiesta, quindi le modifiche visive si vedono ricaricando
la pagina; `dashboard.mjs` (che genera la **pagina di accesso**) richiede invece il riavvio del
servizio. Dopo il ripristino, ricarica la pagina nel browser: il service worker non mette in cache il
documento, quindi non serve svuotare nulla.

## Ripristino selettivo (annullare una sola scelta)

- **Solo lo sfondo nero** — in `:root` rimetti `--bg: #0a0e15`, `--bg-soft: #0d121b`,
  `--panel: #121827`, `--panel-2: #172033`, `--panel-3: #1d293d`, `--panel-4: #253349`,
  `--border: #28344a`, `--border-soft: #1b2434`, `--dim: #8b97ac`, `--faint: #7a8598`; rimetti su
  `body` la riga `background-image: linear-gradient(180deg, #0b0f17 0%, var(--bg) 100%)`; sostituisci
  `var(--glass)` / `var(--glass-soft)` con `rgba(13,18,27,.82)` (header), `.88` (footer), `.7`
  (`.ftoolbar`, `.gtoolbar`), `.6` (`.stats`).
- **Solo il pulsante «comoda/compatta»** — i pezzi sono quattro: il `<symbol id="i-dens">`, il
  `<button id="densBtn">` dentro `.tools`, le quattro regole `html[data-densita="compatto"]` e l'IIFE
  `(function densita(){…})()` prima della sezione «COMANDI SLASH». Nella copia di sicurezza sono già
  in posizione: si cercano con `grep -n densita dashboard.html`.
- **Solo l'header su telefono** — nel blocco `@media (max-width: 760px)` rimetti `.brand { order: 2 }`
  e `.logo { height: 30px }` al posto di `.brand { display: none }`.

## Altro appiglio: la storia del repository

Il commit pubblicato prima del restyling è taggato `restyling-pre-20261004` (`8e52832`):

```bash
git diff restyling-pre-20261004 -- dashboard.html     # l'intero intervento
git checkout restyling-pre-20261004 -- dashboard.html # ripristina il solo file
```

## Perché le scelte sono quelle

`docs/INTERFACCIA.md` documenta i token, le soglie di contrasto, le misure su telefono (header da
190px a 119px, composer da ~150px a 58px) e le media query coinvolte: è il punto da leggere prima di
rimettere mano al colore o agli spazi.
