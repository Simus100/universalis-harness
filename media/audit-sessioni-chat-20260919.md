# Controllo generale — visualizzazione chat e gestione sessioni

Data: 19/09/2026 · Produzione: `pi-dashboard.service` su 127.0.0.1:8420 dietro Caddy (`harness.universalisproduzioni.it`)
**Nessuna modifica è stata fatta alla produzione**: tutti i test sono girati su un'istanza isolata.

## 1. Metodo

- Lettura del codice: `dashboard.mjs` (3068 righe), `dashboard.html` (4432 righe), `sessions/*.jsonl`, unit systemd, Caddyfile.
- **Istanza isolata**: seconda copia della dashboard su `:8599` con `DASH_SESSION_DIR=/tmp/testsessions` (copia delle sessioni reali) + proxy `media/ui-proxy-test.mjs` su `:8598` per iniettare l'autenticazione, browser headless `pbrowser`/`agent-browser` con sessioni dedicate. La dashboard di produzione non è mai stata toccata.
- Misure strumentate dentro la pagina (MutationObserver + `performance.now()`).
- Script di test nuovi e ripetibili (in `media/`):
  - `test-chat-switch.mjs` — cambio chat e coerenza vista/lista/badge
  - `test-chat-switch-race.mjs` — cambio ravvicinato (corsa sulle risposte)
  - `test-chat-switch-timing.mjs` — tempi di rete, parse e rendering

## 2. Stato generale: sano

| Controllo | Esito |
|---|---|
| Servizio | `pi-dashboard` active, `/api/health` → 200 |
| `sessions/` | 2 sessioni, JSONL integri: 0 righe corrotte, file terminati con newline |
| Sessione grande | 2023 righe, 1350 messaggi, 3,8 MB (tipo: 1 session, 1350 message, 669 custom) |
| Sessione corrente | 127 righe, 89 messaggi |
| API sessioni | `GET /api/sessions` → 200 in ~98 ms, payload 654 byte (corretto) |
| Cambio chat (funzionalità) | Funziona: i messaggi giusti arrivano e la sessione sul server cambia correttamente |
| Il problema non è (solo) "rotto" | È **lentezza percettiva + incoerenza temporanea fra vista e lista**, non perdita di dati |

## 3. Problemi trovati (per impatto)

### P1 — Il cambio chat mostra la chat precedente per ~1,7 s (contenuto corretto a ~2,3 s)
Misura sulla chat da 1350 messaggi (desktop headless, rete locale — quindi caso OTTIMALE):
```
t=1686 ms · primo messaggio a schermo: "ciao"        ← chat vecchia, ancora visibile
t=2262 ms · primo messaggio a schermo: "web search…"  ← contenuto corretto
```
Nessun indicatore di caricamento e nessuno svuotamento della vista: per quasi 2 secondi sembra che il click non abbia funzionato.
Composizione del ritardo: ~0,7 s di switch lato server (`refreshExtensionRuntime()` + `attachSession`, misurato 0,69 s sul POST `/api/sessions/open`), ~0,1 s rete+parse del payload (locale), 0,5–0,7 s di rendering. Su rete reale (mobile) il payload da 1,6 MB domina e il tempo può diventare di molti secondi.

### P2 — Un solo cambio chat scarica DUE volte lo stesso payload (2 × 1,6 MB)
Richieste registrate durante un singolo cambio:
```
GET  /api/sessions         (apertura drawer)
POST /api/sessions/open
GET  /api/state            ← ricarica innescata dall'evento SSE "state"
GET  /api/sessions         ← loadSessions() dall'handler "state" (drawer ancora aperto)
GET  /api/state            ← ricarica di openSessionById(), dopo il POST
```
Causa: `reloadMessages()` viene chiamato sia dall'handler SSE `state` (dashboard.html ~1608) sia alla fine di `openSessionById()` (~2263), senza deduplicazione.
Effetto: banda doppia e due parsing/render concorrenti proprio nel momento critico.

### P3 — Nessuna versione/ordine sulle risposte: incoerenza sui cambi ravvicinati
Riprodotto 2 volte su 2: dopo due cambi ravvicinati la **vista** mostrava la chat corretta mentre il badge "● attiva" della lista indicava l'altra chat.
```
stato finale vista: {"primo":"ciao","msgs":17,"badge":"web search funziona?"}
chat attiva sul server: 01a0b9c9-… (piccola)   ← la vista è giusta, il badge no
```
Cause: (a) `reloadMessages()` riscrive `currentSessionId` con il `sessionId` del payload ricevuto, senza verificare che sia ancora la sessione attesa → una risposta in ritardo può sovrascrivere vista e stato (rischio non riprodotto nei test per i tempi locali, ma strutturale); (b) `renderSessions()` usa il campo `current` di ogni item, non `sessionsData.current`, e viene richiamata solo a drawer aperto.
Le risposte fuori ordine sono tanto più probabili quanto più è grande la differenza di peso: piccola ≈ 15 KB vs grande ≈ 1,6 MB.

### P4 — Rendering pesante e scroll che salta
- Chat grande: 705 messaggi resi → **5428 nodi DOM** solo dentro la chat.
- `renderMessages()` = **523 / 712 / 540 ms** per chiamata (misurato).
- `renderMessages()` fa `chat.innerHTML = ""` e ricostruisce tutto, poi `autoscroll(true)` → **forza lo scroll in fondo**. È chiamata a ogni evento `state` (fine risposta, cambi tool, comandi): ogni volta ~0,5 s di blocco del thread UI e la posizione di lettura viene persa.

### P5 — Lista chat disallineata e aggiornata solo a drawer aperto
`renderSessions()` viene richiamata solo se `drawer.classList.contains("open")`: con il drawer chiuso la lista resta quella vecchia e il badge "● attiva" è stantio. L'utente che riapre subito la lista vede l'indicatore sbagliato.

### P6 — `GET /api/sessions` rilegge per intero tutte le sessioni a ogni aggiornamento
`getSessionsPayload()` chiama `SessionManager.list()`, che legge **tutto** ogni `.jsonl` e costruisce `allMessagesText` (join di tutti i testi) per ogni sessione, pur servendo solo `messageCount` + anteprima. E viene invocata a ogni `agent_end` e a ogni operazione di sessione (10+ punti).
Costo attuale: ~98 ms per 2 sessioni; con la sessione da 3,8 MB sono decine di MB di allocazioni temporanee per mostrare 4 numeri e una stringa. Cresce linearmente con lo storico.

### P7 — Non si può cambiare chat mentre l'agente lavora (409)
`/api/sessions/open`, `/new`, `/delete` rispondono `409 "risposta in corso"`. Lato UI compare solo un `alert()`. Con risposte lunghe (o tool browser attivi) l'utente resta bloccato nella chat corrente senza capire perché.

### P8 — La "sessione attiva" è globale di processo
`session` è una variabile unica del processo e lo stato viene trasmesso a tutti i client SSE: due schede/dispositivi condividono la stessa chat attiva; cambiarla in una la cambia nell'altra. È il modello "single-tenant" attuale, ma è un vincolo che va conosciuto (spiega parte della sensazione di "cambio che non resta").

### Note minori
- **Sicurezza**: la password della dashboard è stampata in chiaro nei log di sistema a ogni avvio (`journalctl -u pi-dashboard` → `auth -> utente: pi password: …`).
- `postJSON()` avvisa gli errori solo se la risposta è JSON con campo `error`; su errore di rete/HTML non c'è feedback.
- Nessuna paginazione/virtualizzazione: sessioni ancora più lunghe porteranno a payload di decine di MB.

## 4. Priorità di intervento proposta

| # | Intervento | Problemi coperti | Rischio |
|---|---|---|---|
| 1 | Indicatore di caricamento + svuotamento immediato della vista al click; una sola ricarica dei messaggi (dedup) | P1, P2 | basso |
| 2 | Guardia di versione (epoch/sessionId atteso) sulle risposte + badge lista derivato da `sessionsData.current` | P3, P5 | basso |
| 3 | Render incrementale + `content-visibility` + autoscroll solo se si è già in fondo | P4 | medio |
| 4 | Cache della lista sessioni (mtime) o conteggio leggero senza `allMessagesText` | P6 | basso |
| 5 | UX durante lo streaming: apertura in sola lettura o item disabilitati con spiegazione | P7 | medio |
| 6 | Sessione attiva per-client / avviso multi-tab | P8 | alto (design) |
| 7 | Togliere la password dai log | nota sicurezza | basso |

Tutti gli interventi 1–4 sono localizzati: `dashboard.html` (handler `state`, `reloadMessages`, `openSessionById`, `renderSessions`, `renderMessages`) e `getSessionsPayload()` in `dashboard.mjs`. Con backup + test di regressione (`media/test-regression.sh`, `test-views.mjs`) e riavvio del servizio.
