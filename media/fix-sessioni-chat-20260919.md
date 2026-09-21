# Fix visualizzazione chat e gestione sessioni — 19/09/2026

Intervento su `dashboard.html` (solo lato client) + aggiornamento dei test.
**Nessuna modifica a `dashboard.mjs`, nessun riavvio del servizio**: i fix si attivano ricaricando la pagina (il service worker è network-first per il documento).

Backup: `media/dashboard.html.pre-chatfix-20260919-152854.bak` (rollback: copiarlo su `dashboard.html`).

## 1. Il difetto principale trovato (non era nella lista iniziale)

**La risposta dell'agente veniva salvata nel file di sessione ma SPARIVA dalla schermata a fine generazione.**

Catena del difetto:
1. durante lo streaming la risposta è scritta nella bolla del DOM, ma `currentMessages` resta la lista dell'ultimo caricamento (non contiene né il messaggio appena inviato né la risposta);
2. a fine generazione il server manda un evento `state` (leggero, senza messaggi);
3. l'handler faceva `renderMessages(currentMessages)` → ricostruiva la chat con la lista vecchia, cancellando dal DOM la bolla dell'utente e la risposta appena arrivata.

Prova reale (istanza di prova, prompt "rispondi con PONGZETA2"):

| | prima del fix | dopo il fix |
|---|---|---|
| messaggi a schermo | 62 → **62** (invariato) | 64 → **66** |
| parola spia visibile in chat | **false** | **true** (ultima bolla assistant) |
| parola spia nel file di sessione | true | true |
| pulsanti copia/rigenera sull'ultima risposta | — | **2** |

Correzione: contatore `localMsgs` (bolle presenti solo nel DOM) + `refreshTailActions()` che aggiunge i pulsanti all'ultima bolla senza ridisegnare la conversazione. Se il DOM è più avanti della lista nota, il render non viene più eseguito.

## 2. Gli interventi pianificati (P1, P2, P3, P5)

### P1 — Percezione "il cambio chat non funziona"
- `showChatLoading()`: al click la vista entra subito nello stato "carico la conversazione…" (`aria-busy`, spinner CSS, rispetta `prefers-reduced-motion`), quindi la conversazione precedente **non resta più a schermo**.
- Gli stessi accorgimenti su "nuova chat" e su ogni cambio di sessione arrivato via SSE.
- Se il cambio non riesce (es. 409 "risposta in corso") la vista torna a mostrare la chat attiva invece di restare in caricamento.

Prova: nei campioni misurati dopo il click, i casi con contenuto della chat **precedente** a schermo sono passati da 1-2 a **0**.

### P2 — Doppio download dello stesso payload
Richieste HTTP per un singolo cambio chat:

| prima | dopo |
|---|---|
| `POST /api/sessions/open` | `POST /api/sessions/open` |
| `GET /api/state` (1,6 MB) ← da SSE | `GET /api/state` (1,6 MB) |
| `GET /api/sessions` ← refetch inutile | — |
| `GET /api/state` (1,6 MB) ← da openSessionById | — |

Correzione: `reloadMessages()` riusa la richiesta già in volo per la stessa sessione e non richiede nulla se i messaggi di quella sessione sono già a schermo (`loadedSessionId`); l'evento di stato iniziale (che **porta** i messaggi) viene usato direttamente, senza una seconda richiesta; niente più refetch della lista (`renderSessions()` invece di `loadSessions()`).
Per un cambio chat si passa quindi da **2 × 1,6 MB a 1 × 1,6 MB** (e da 4 richieste API a 2).

### P3 — Corse e risposte obsolete
- `chatEpoch`: ogni caricamento cattura una versione e applica il risultato solo se è ancora la più recente; una risposta in volo per una sessione diversa da quella attiva viene scartata.
- `currentSessionId` non può più essere sovrascritto da un payload obsoleto.

Prova (test con doppio click ravvicinato grande→piccola): vista **e** badge coerenti con la sessione attiva sul server → 4/4 controlli ok (prima 3/4, con badge sbagliato).

### P5 — Badge "● attiva" disallineato
- `renderSessions()` calcola la chat attiva da `sessionsData.current` (non dal campo `current` dell'ultimo payload) e viene ridisegnata anche a drawer chiuso.

### In più (piccolo, incluso perché a rischio nullo)
- **Scroll**: `renderMessages()` non forza più lo scroll in fondo (`autoscroll(false)`); si scende solo se si era già in fondo. Il cambio chat continua a posizionarsi in fondo.

## 3. Verifiche eseguite

| Test | Esito |
|---|---|
| `node media/test-static.mjs` (controlli statici, +3 nuovi sui fix) | 134 ok, 0 falliti |
| `node media/check-html-js.mjs` | sintassi OK |
| `node media/test-ui.mjs` | 89 ok, 0 falliti |
| `node media/test-chat-switch.mjs` (cambio chat e coerenza) | 10 ok, 0 ko |
| `node media/test-chat-switch-race.mjs` (cambi ravvicinati) | 4 ok, 0 ko |
| `node media/test-chat-switch-timing.mjs` (tempi e nodi DOM) | contenuto nuovo senza chat vecchia a schermo |
| prova "risposta che resta a schermo" (istanza di prova, modello reale) | +2 messaggi, spia visibile |
| conteggio richieste HTTP per cambio chat | 2 invece di 4 |
| **`bash media/test-all.sh` (suite completa)** | **✅ TUTTI I TEST PASSATI** (134/1/3/89/38/76/32/24/33) |

Nota: la suite aveva 2 controlli rossi nella sezione 9 **preesistenti** e non correlati: verificavano l'interruttore dei tool "goal", rimosso dal server il 18/09 (`media/dashboard.mjs.pre-remove-goal-*`). Aggiornati al contratto attuale (`POST /api/goals` senza titolo → 400; `GET /api/goals` → lista) **senza** creare goal di prova, perché l'istanza di prova non isola `DASH_GOALS_FILE` e toccherebbe i goal reali.

## 4. Cosa resta aperto

| # | Problema | Note |
|---|---|---|
| P4 | Rendering pesante: chat da 705 messaggi = 5428 nodi DOM, `renderMessages` = 520-710 ms per chiamata | serve render incrementale + `content-visibility`; ora non si perde più la risposta e non salta più lo scroll |
| P6 | `GET /api/sessions` rilegge per intero tutti i `.jsonl` (costruisce `allMessagesText` di tutte le sessioni) a ogni `agent_end` | richiede modifica a `dashboard.mjs` → **riavvio del servizio**; cache su mtime |
| P7 | Cambio chat rifiutato (409) mentre l'agente lavora, con solo un `alert()` | UX da rifinire: item disabilitati con spiegazione o apertura in sola lettura |
| P8 | La sessione attiva è globale di processo: due tab/dispositivi condividono la stessa chat | scelta di design, va decisa |
| — | Password della dashboard stampata in chiaro nei log di sistema a ogni avvio | `journalctl -u pi-dashboard` |

## 5. Cosa deve fare l'utente

Ricaricare la pagina della dashboard (o chiudere e riaprire la PWA): i fix sono nel client e non serve riavviare il servizio.
