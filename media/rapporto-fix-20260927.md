# Correzione dei difetti dell'analisi del 2026-09-27

Rapporto del lavoro fatto. Riferimenti: l'analisi ha prodotto 11 difetti; qui c'è cosa è stato
corretto, come è stato verificato e cosa resta da sapere. Backup eseguiti **prima** di toccare il
codice:

| archivio | contenuto | verifica |
|---|---|---|
| `backups/pi-harness-2026-09-27_1354.tar.gz` | `sessions/` + `media/` (stato dell'istanza) | `tar -tzf` eseguito da `backup.mjs`, 252 voci |
| `backups/codice-pre-fix-20260927-135407.tar.gz` + `.sha256` | sorgenti (`dashboard.mjs`, `dashboard.html`, `media/*.mjs`, `skills/`, `README.md`, …) | 170 voci, sha256 `48d8c5ef…926a86` |

## 1. Difetti corretti

### 1.1 Una connessione SSE poteva uccidere il processo (critico)
- `media/…` no: `dashboard.mjs`
  - `json()`: se `res.headersSent` chiude la risposta senza riscrivere gli header (era
    `ERR_HTTP_HEADERS_SENT` dentro il `catch` → rejection non gestito → il processo Node usciva).
  - `/events`: lo stato iniziale si calcola **prima** di aprire lo stream; se fallisce risponde
    con un 500 JSON leggibile invece di propagare l'eccezione.
  - `getState()`: statistiche di sessione e uso del contesto sono protetti; una sessione con una
    risposta senza `usage` non rende più lo stato incalcolabile. Accessi difensivi a
    `session.state.messages` e `session.agent.state.tools`.
- **Verifica**: `media/test-hardening.mjs` §1-2 (guardia provata in vitro + istanza con sessione
  senza `usage`: `/api/state` 200, `/events` 200, processo vivo). In esercizio reale il guasto si
  è ripresentato da solo durante il lavoro (`statistiche di sessione non calcolabili` nel log,
  dashboard utilizzabile, nessun riavvio).

### 1.2 Lo zip di una cartella usciva dalla root (alto)
- `media/zip-write.mjs`: `lstat` invece di `stat`, i link simbolici si **saltano sempre**, il
  percorso reale di ogni file dev'essere dentro l'albero richiesto.
- **Verifica**: `media/test-hardening.mjs` §3 (cartella con link a file e cartella fuori root: i
  file esterni non entrano, il tetto dei 3000 file continua a valere per i file interni).
  In produzione, `GET /api/download?path=pi-harness`: prima **413** ("troppi file"), ora **200**
  con 866 voci, nessun file dal pacchetto globale (859 file reali contro 14.515 seguendo i link).

### 1.3 Screenshot e PDF del tool `browser` non erano scrivibili (alto)
- `media/browser-tool.mjs`: la CLI scrive in `/tmp/pi-browser-out/pi-browser` (sottocartella
  dell'utente dedicato, 0700) e la dashboard, che è root, sposta il file in `media/`; il percorso
  nel testo restituito al modello è quello finale; se lo spostamento non riesce l'errore è
  esplicito. Nessuna chiamata bloccante (`execFileAsync` anche per `id`).
- **Verifica**: `media/test-browser-tool-output.mjs` (16 controlli, browser vero, `media/`
  `root:root 0755` come in produzione: prima *Permission denied*, ora il PNG/PDF arriva in
  `media/`). `media/test-static.mjs` continua a garantire l'assenza di `execFileSync`.

### 1.4 Aggiornamento parziale di un goal (perdita di dati)
- `normalizeGoal`: chiave **assente** = «non toccare», chiave presente (anche vuota) =
  «sostituisci»; vale per `description`, `steps`, `checklist`.
- **Verifica**: `media/test-hardening.mjs` §4.

### 1.5 «rinomina» sovrascriveva in silenzio (perdita di dati)
- `POST /api/file/rename`: se la destinazione esiste risponde **409** con un messaggio chiaro; la
  sovrascrittura avviene solo con `overwrite: true`. L'editor chiede conferma esplicita.
- **Verifica**: `media/test-hardening.mjs` §5 + prova in browser reale (prompt del nome → 409 →
  conferma → sovrascrittura; il file di destinazione resta intatto se si annulla).

### 1.6 Anteprima SVG: fence indentate e chiusure CRLF
- `dashboard.html`: l'apertura tollera fino a 3 spazi di indentazione (fence dentro un elenco,
  Markdown valido), la chiusura tollera il `\r` di un testo CRLF. Prima la chiusura non veniva
  riconosciuta e la scansione inghiottiva i paragrafi e i disegni successivi dentro la card.
- **Verifica**: `media/test-svg-stream.mjs` (6 scenari nuovi: indentata, 4 spazi = codice, CRLF,
  CRLF con secondo disegno) + prova in browser vero su un messaggio con entrambi i casi
  (2 anteprime rasterizzate, il testo seguente resta visibile).

### 1.7 `/api/health` non permetteva di verificare un deploy
- `dashboard.mjs`: `codeHash` (sha256 dei primi 16 hex) e `codeMtime` del file **caricato** dal
  processo, più l'elenco funzioni aggiornato (`zip-folders`, `svg-preview`, `download-cards`,
  `browser-output-staging`, `state-safe`). `VERSION` → `dashboard-2026-09-27.1`.
- `media/test-api.sh`: il controllo sulla versione (che confrontava la costante con sé stessa) è
  affiancato dal confronto **hash servito = hash del file su disco**.
- **Verifica**: `media/test-hardening.mjs` §7; prova diretta: l'istanza con il codice di `HEAD`
  riportava la stessa versione di quella nuova, ma hash diversi.

### 1.8 Selettore del modello cablato
- `getState` espone `models` (i modelli usabili adesso); `applyState` popola la select e ricade
  sui due modelli noti finché lo stato non arriva (nessuna regressione con un server vecchio).
- **Verifica**: prova in browser (4 modelli, `deepseek-v4-flash-vision-exp` compreso) e
  `media/test-views.mjs`.

### 1.9 `/tab progetto|agenda|live`
- `dashboard.html`: `TAB_NAMES` è l'unica fonte per il comando, il messaggio d'errore e i test;
  `media/commands.mjs` allineato.
- **Verifica**: `media/test-ui.mjs` (8 controlli) + prova in browser (`/tab progetto`,
  `/tab live` aprono la vista giusta) + `media/test-palette.mjs`.

### 1.10 `Content-Disposition` non sanificato per lo zip
- `contentDisposition()`: niente virgolette/caratteri di controllo, `filename*=` RFC 5987 per i
  nomi non ASCII; usata per cartelle, file e export Markdown.
- **Verifica**: `media/test-hardening.mjs` §6.

### 1.11 Numerazione doppia nei passi del goal
- `goalLines()` toglie la numerazione o il trattino iniziale dalle righe del form (i passi sono
  già numerati dalla scheda); il placeholder non suggerisce più la numerazione.
- **Verifica**: `media/test-ui.mjs` (7 controlli) + prova in browser (`1. primo passo` → titolo
  `primo passo`).

## 2. Test

| test | esito |
|---|---|
| `media/test-static.mjs` | 168 ok |
| `media/test-ui.mjs` | 105 ok (15 nuovi) |
| `media/test-functions.mjs` | 76 ok |
| `media/test-svg-sanitize.mjs` | 77 ok |
| `media/test-svg-stream.mjs` | 13 scenari, tutti resi |
| `media/test-ask.mjs` | 74 ok |
| `media/test-hardening.mjs` (nuovo) | 35 ok |
| `media/test-browser-tool-output.mjs` (nuovo) | 16 ok |
| `bash media/test-api.sh` | 60 ok |
| `media/test-views.mjs` | 32 ok |
| `media/test-svg-preview.mjs` | 45 ok |
| `media/test-funzionalita-browser.mjs` | 28 ok |
| `media/test-palette.mjs` | tutti i controlli superati (lo stub del test non definiva `currentMessages`: difetto del test, non del prodotto) |

## 3. Propagazione alle altre istanze (tester_01 e tester_07)

Le istanze hanno una **copia propria** del codice (`docs/ISTANZE.md`), quindi i fix non si
propagano da soli. Portati a entrambe i cinque file che li contengono, con fusione a tre vie
(base = codice di `HEAD`) per non perdere le personalizzazioni locali:

| istanza | backup prima delle modifiche | esito |
|---|---|---|
| `tester_01` | `pi-harness-2026-09-27_1655.tar.gz` (sessions+media) e `backups/codice-pre-fix-20260927-165539.tar.gz` | 5 file applicati, unit riavviata, verifiche OK |
| `tester_07` | `pi-harness-2026-09-27_1655.tar.gz` (sessions+media) e `backups/codice-pre-fix-20260927-165539.tar.gz` | 5 file applicati, unit riavviata, verifiche OK **e personalizzazioni intatte** |

Cosa *non* è stato toccato: `.env`, unit systemd, `skills/`, `assets/`, `manifest`, `sw.js`,
dati e sessioni di ciascuna istanza.

Verifiche per istanza (tutte superate):

| verifica | tester_01 (:8421) | tester_07 (:8422) |
|---|---|---|
| impronta servita = impronta su disco | `fcd41742ad3d5b3a` | `06e7a084d0a2eb49` |
| versione dichiarata | `dashboard-2026-09-27.1` | `dashboard-2026-09-27.1` |
| funzioni nuove in `/api/health` | presenti | presenti |
| zip di una cartella con link fuori root | link **non** seguiti (con un link verso le sessioni della principale: nessun file estraneo nell'archivio) | link verso `/etc` **non** seguito |
| rinomina su destinazione esistente | `409`, destinazione intatta | `409`, destinazione intatta |
| connessione SSE | pid invariato, processo vivo | pid invariato, processo vivo |
| pagina nel browser | 4 modelli nel selettore, `/tab goals` e titoli dei passi senza numerazione | selettore modello **nascosto** (blocco), `/tab progetto` attivo, nessun errore JS |
| personalizzazioni | nessuna da preservare (identico a prima) | `locked.model=true`, `thinking.disabled=['max']`, `quota` 300 MB attiva, `POST /api/model` rifiutato |

Nota: `tester_07` impiega ~20 s ad avviarsi (ricostruzione delle estensioni), quindi la verifica va
fatta dopo che l'unit è davvero in ascolto.

## 4. Riavvio e verifica post-riavvio (istanza principale)

Il riavvio del servizio interrompe la sessione dell'agente che lo chiede (la chat vive in quel
processo), quindi è programmato con un'unità transitoria e seguito da una verifica automatica:

```bash
systemd-run --unit=pi-fix-restart --collect --on-active=360 \
  /bin/bash -lc 'cd /root/pi-harness && bash media/verifica-post-riavvio.sh'
```

Lo script `media/verifica-post-riavvio.sh` riavvia il servizio e poi controlla, scrivendo l'esito
in **`media/post-fix-verifica.txt`**: impronta del codice servita = impronta su disco, stato e
pagina leggibili, connessione SSE che non cambia il pid, zip di `pi-harness` senza file fuori
root, `Content-Disposition` sanificato, rinomina su destinazione esistente → 409.

Per rileggere l'esito:

```bash
cat /root/pi-harness/media/post-fix-verifica.txt
curl -s -u "$(grep -oP '(?<=^DASH_USER=).*' /root/pi-harness/.env):$(grep -oP '(?<=^DASH_PASSWORD=).*' /root/pi-harness/.env)" \
  http://127.0.0.1:8420/api/health | python3 -m json.tool
```

## 5. Note operative

- **Le modifiche al frontend sono già attive** appena si ricarica la pagina: la dashboard legge
  `dashboard.html` dal disco a ogni richiesta. Le modifiche al **server** (`dashboard.mjs`)
  richiedono il riavvio programmato.
- **Nessuna funzione è stata tolta**: le uniche differenze visibili sono la conferma sulla
  rinomina, il selettore dei modelli con tutte le voci, le schede `/tab` in più e i titoli dei
  passi senza doppia numerazione.
- Un riscontro durante il lavoro: una risposta dell'assistente rimasta **senza `usage`** (turno
  interrotto) ha fatto scattare la protezione di `getState` senza conseguenze — prima avrebbe
  reso illeggibile `/api/state` e reso possibile il crash del processo.
