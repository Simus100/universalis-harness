# Audit della dashboard — 2026-09-18 18:40 CEST

Metodo: verifica **in sola lettura** in produzione (nessuna modifica al codice), più test non distruttivi sulle API
(input non validi per non mutare nulla) e un test end-to-end su un'istanza temporanea per la funzione nuova.

## Verdetto in una riga

La dashboard **funziona**: tutte le route di lettura rispondono, le sessioni sono integre, i backup girano,
il DOM è coerente, le prestazioni su richiesta singola sono ottime. **Ma ci sono due difetti gravi** —
uno di sicurezza (l'anti-bruteforce è aggirabile e può escludere utenti legittimi) e uno distruttivo
(`/api/file/rename` senza protezione della root) — più un problema di deploy e uno di efficienza.

## Cosa funziona (verificato)

| area | esito |
|---|---|
| servizio | `pi-dashboard` active da 18h (PID 46788), RSS 278 MB (picco 686 MB), CPU 5m28s |
| rete | node in ascolto **solo** su `127.0.0.1:8420`; Caddy su 80/443 |
| TLS/Caddy | config valida, certificati per `harness.`, `pi.`, `sslip.io` |
| DNS | `harness.universalisproduzioni.it` → 89.117.59.173 ✓ |
| API GET | 15/15 come atteso (health, state, sessions, sessions/search, search/files, sessions/export, files, manifest, sw.js, icon-192, favicon, pagina) |
| auth | 401 senza credenziali · 200 con credenziali · `WWW-Authenticate` presente · 429 + `Retry-After: 900` quando bloccato |
| guardie | thinking 400 · model 404 · file 400 · prompt 400 · sessions/open 404 · file/delete 404 su path inesistente |
| concorrenza | 409 "risposta in corso" su open/delete/messages mentre l'agente lavora → corretto |
| dati | 4 sessioni · 534 righe JSONL · **0 righe corrotte** · 2,1 MB |
| backup | timer attivo (ultimo 04:16, prossimo domani 04:23) · archivio 420 KB **integro** (verificato con `tar -tzf`) |
| permessi | `.env` 600 · `auth.json` 600 · `sessions/`, `media/` 755 |
| disco | 8,3 GB su 193 GB (5%) |
| sintassi | `dashboard.mjs`, `harness.mjs`, `backup.mjs` OK · JS nell'HTML OK |
| DOM | 84 id, **nessun duplicato**, 83 referenziati dal JS e **tutti presenti** |
| prestazioni | `/api/state` 867 KB in **62 ms** · `/api/sessions` 1,6 KB in 45 ms |

## Difetti trovati

### 1. ALTO — Anti-bruteforce basato su un IP che il client può forgiare
`clientIp()` usa il **primo** valore di `X-Forwarded-For`, header controllato dal client, senza validare la sorgente.

Prove:
```
9 tentativi falliti, XFF forgiato 192.0.2.5   → 429 al 9° (blocco attivo) ✓
9 tentativi falliti, XFF diversi 198.51.100.1..9 → 9× 401 → LIMITE AGGIRATO
```
Ruotando l'header si fanno tentativi **illimitati**. Inoltre il blocco è **pre-autenticazione**:
```
IP bloccato + credenziali CORRETTE → 429
```
Quindi un attaccante può **escludere un IP arbitrario** (per 15 minuti) forgiando l'header — cioè colpire
proprio l'utente legittimo. È la violazione diretta del requisito "non deve bloccare le richieste legittime".
Attraverso Caddy i miei test hanno dato esiti incoerenti (una serie non ha attivato il blocco, un'altra l'ha
attivato su `127.0.0.1`): il comportamento va reso deterministico.

**Rimedio**: non fidarsi dell'XFF in arrivo — usare l'ultimo hop o l'indirizzo del socket, oppure far
sovrascrivere l'header da Caddy (`header_up X-Forwarded-For {http.request.remote.host}`); e non rispondere 429
a credenziali corrette.

### 2. ALTO — `/api/file/rename` non protegge la root
`/api/file/delete` ha la guardia `if (abs === ROOT) return 400`, **`/api/file/rename` no**.
```
POST /api/file/rename {} → 200   (ha eseguito rename(ROOT, ROOT): no-op, oggi nessun danno)
```
Con `from` vuoto e `to` valorizzato si **sposta l'intera `/root`**: la dashboard si autodistrugge in una chiamata.

### 3. MEDIO — `/api/sessions/rename` accetta nome vuoto
`POST {}` → 200 e il nome della sessione diventa `""` (accaduto durante il probe). Manca la validazione.

### 4. MEDIO — Deploy disallineato: codice nuovo, processo vecchio
`dashboard.mjs` modificato alle **18:29**, processo avviato alle **00:01** → la route nuova
`/api/compact` risponde **404** in produzione (verificato). Non esiste un meccanismo di ricarica: ogni modifica
al server richiede `systemctl restart pi-dashboard`. HTML/CSS/icone/manifest invece sono letti da disco a ogni
richiesta, quindi sono già aggiornati.

### 5. MEDIO — Efficienza: lo stato trasporta tutta la conversazione
`/api/state` = 867 KB per 207 messaggi (contesto 330k token) e **~98% del payload sono i messaggi**.
Lo stesso payload viene rimandato a ogni evento SSE `state` (a fine run, a ogni modifica):
```
/events → 867.867 byte nei primi 2 secondi
```
Su sessioni lunghe è banda e lavoro di rendering sprecati, e cresce linearmente con la conversazione.
**Rimedio**: negli eventi di stato mandare solo contabilità (modello/contesto/token/costo) e i messaggi su
richiesta o come delta.

### 6. BASSO — Residui in `assets/`
6 file temporanei rimasti dalle anteprime che ti avevo linkato: `icon-900, 901, 902, 903, 905, 906.png`.
Sono serviti pubblicamente da `/icon-<numero>.png` e non servono più.

### 7. BASSO — Validazione dei percorsi incoerente
`/api/file/mkdir` con path vuoto punta alla ROOT (no-op), `/api/file/rename` risponde 200 su un'operazione
no-op: manca una validazione esplicita di path/nomi vuoti in questa famiglia di route.

### Note sui miei test
Ho usato solo IP di test (TEST-NET e simili) e non ho toccato dati. Restano nel contatore due IP finti
"bloccati" fino a scadenza (15 min, si azzerano da soli). Il blocco su `127.0.0.1` causato dai test **non
riguarda il tuo browser**, che arriva dal tuo IP.

## Non verificato (per onestà)
- matrice POST interrotta dopo `/api/file/delete`: non provati `/api/upload`, `/api/chat/upload`,
  `/api/sessions/new` (mutanti, saltati di proposito), `/api/messages/regenerate` (avrebbe bruciato token).
- nessun test visivo nel browser: ho verificato integrità statica del DOM e i percorsi dati, non i clic reali.

## Priorità suggerite
1. **Anti-bruteforce**: IP non forgiabile + nessun 429 su credenziali corrette. *(P1)*
2. **`file/rename`**: guardia sulla root e rifiuto di path vuoti. *(P1)*
3. Validazione nomi/path vuoti su `sessions/rename`, `file/mkdir`. *(P2)*
4. Procedura di deploy con riavvio + smoke test, e payload di stato alleggerito. *(P2)*
5. Pulizia dei file temporanei in `assets/`. *(P3)*
