# Piano — PDF come cittadino di prima classe

Scopo: caricare, vedere, leggere e **interrogare** un PDF dalla dashboard, senza incollare 40 pagine
nel contesto e senza nuove dipendenze npm.

## Vincoli di progetto
- Niente nuove dipendenze npm (il prodotto si installa on-premise, anche a rete chiusa).
- Estrattori di sistema (`pdftotext`, `pdfinfo`, `pdftoppm` di poppler-utils) **opzionali**: se
  mancano, la feature si dichiara assente con un messaggio chiaro, non si rompe nulla.
- Il PDF è contenuto **non attendibile**: mai eseguire JavaScript contenuto, mai seguire link, il
  testo estratto è materiale da leggere, non istruzioni.
- Tutto confinato nella root (`safeResolve`), comandi invocati **senza shell** (`execFile` + array),
  con timeout e limiti di dimensione/pagine.

## File che cambiano
- `dashboard.mjs` — `sniffPdf`, rilevazione strumenti, rotta `GET /api/pdf`, allegati PDF nel prompt
- `dashboard.html` — blocco `pdf`, card, lettore a pagine, apertura dal file manager
- `media/test-pdf.mjs` (nuovo) — suite, con PDF di prova generati al volo
- `media/make-test-pdf.mjs` (nuovo) — generatore di PDF minimi di prova
- `media/test-all.sh` — nuovo blocco della suite
- `skills/immagini/SKILL.md` — sezione PDF + blocco `pdf` documentato
- `README.md`, `docs/MANUALE.md` — requisito opzionale, API, limiti

## Ordine di lavoro
1. generatore di PDF di prova + PDF senza testo (dipende da: —)
2. server: sniff, strumenti, `/api/pdf` (meta | pagina | testo | cerca) (dipende da: 1)
3. suite `media/test-pdf.mjs` e correzione dei difetti trovati (dipende da: 2)
4. allegati PDF nel prompt: prime N pagine come immagine + riga informativa (dipende da: 2)
5. frontend: card in chat, lettore a pagine, apertura dal file manager (dipende da: 2)
6. skill e documentazione (dipende da: 5)
7. suite completa `media/test-all.sh` e pubblicazione (dipende da: 3, 5)

## Rischi
| Rischio | Gravità | Mitigazione |
|---|---|---|
| PDF ostile (enorme, migliaia di pagine) che satura CPU/RAM | alta | limiti di byte, pagine, dpi; timeout sui comandi; una pagina per richiesta |
| injection via nome file | alta | `safeResolve` + path assoluti + `execFile` senza shell |
| render ripetuto della stessa pagina (costo) | media | cache in memoria per (path, mtime, pagina, dpi), max 40 voci |
| poppler assente sul server del cliente | media | rilevazione all'avvio + messaggio che spiega cosa installare; `DASH_PDF=off` per disattivare |
| il modello riceve un PDF enorme come immagine | media | `DASH_PDF_IMAGE_PAGES` (default 1), limite massimo 3, dichiarato nel prompt |

## Prova
- `node media/test-pdf.mjs` — 11 casi (meta, testo, ricerca, pagina PNG, fuori intervallo, non-PDF,
  path traversal, PDF senza testo, dpi, testo completo, disabilitazione)
- `bash media/test-all.sh` — nessuna regressione sulle altre suite
- A mano: i due PDF veri in `media/uploads/` (dati personali: restano fuori da Git, mai citati)
