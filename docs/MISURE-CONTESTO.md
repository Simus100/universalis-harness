# Misurare il contesto di un agente (protocollo ripetibile)

Questo documento descrive **come** sono state ottenute le cifre di contesto citate nel README, così
che chiunque possa rifarle e contestarle. Le misure sono del **22 novembre 2026**, istanza principale
su `deepseek-flash` (finestra 1.000.000 di token).

Il principio: **il numero che conta è quello del provider**, non una stima a caratteri. Una stima
sbaglia di due volte: non conosce i token di formattazione dei messaggi e non vede gli schemi dei tool
che l'SDK aggiunge dopo il system prompt.

---

## 1. Che cosa si misura

| grandezza | da dove viene |
|---|---|
| **prefisso** (istruzioni + indice skill + schemi dei tool) | `usage` del provider al primo turno, meno i token del primo messaggio. Su una sessione nuova il residuo è trascurabile |
| **conversazione / risultati dei tool / ragionamento** | stima per sezione di `media/contesto.mjs` (caratteri / 3,6, rapporto misurato su questa istanza) |
| **spreco di cache** | `cache.missedTokens`: token già inviati nel turno precedente e ri-fatturati a prezzo pieno |
| **costo del turno** | differenza dei totali della sessione fra inizio e fine turno (`media/turni.jsonl`) |

**Trappola nota:** `GET /api/contesto` ricava il prefisso *per differenza* (`uso.tokens − somma delle
altre sezioni`). Con una conversazione lunga il residuo di formattazione dei messaggi finisce nel
prefisso, che risulta gonfiato (osservato: +1.450 token con 60 messaggi, oltre +13.000 con 200).
Su una sessione lunga quel campo va letto come «prefisso + rumore»: per il valore pulito serve una
sessione nuova o un'istanza isolata.

---

## 2. Protocollo (5 minuti, costo ~$0,01)

Serve una seconda istanza della dashboard: **non** si misura sull'istanza che sta servendo l'utente,
perché un turno vero aggiunge messaggi al contesto.

```bash
cd /root/pi-harness
set -a; . ./.env; set +a
T=/tmp/misura; rm -rf $T; mkdir -p $T/media $T/sessions

DASH_MEDIA_DIR=$T/media DASH_SESSION_DIR=$T/sessions \
DASH_PROGETTO_FILE=$T/progetto.json DASH_BROWSER_PREFS_FILE=$T/browser.json \
DASH_TIMESTRAL=off DASH_SUBAGENT=$MODALITA \
  nohup node dashboard.mjs --port 8451 --host 127.0.0.1 > $T/log 2>&1 &

# 1) un turno minimo: il prefisso è già tutto lì, il messaggio aggiunge ~17 token
curl -s -u "$DASH_USER:$DASH_PASSWORD" -X POST -H 'content-type: application/json' \
  -d '{"text":"Rispondi soltanto con la parola OK. Non usare nessun tool."}' \
  http://127.0.0.1:8451/api/prompt

# 2) lettura del conteggio del provider
curl -s -u "$DASH_USER:$DASH_PASSWORD" http://127.0.0.1:8451/api/contesto

# 3) chiusura
pkill -f "dashboard.mjs --port 8451"; rm -rf $T
```

`$MODALITA` vale `off` (prefisso di base) oppure `on` (prefisso con i subagent). La differenza fra i
due conteggi **è** il costo degli schemi di `subagent` e `bg_wait`.

---

## 3. Risultati del 22/11/2026

| configurazione | prefisso | note |
|---|---:|---|
| 15 tool, `DASH_SUBAGENT=off` | **17.773** | istruzioni 2.394 + indice skill 2.780 + schemi 12.599 |
| 17 tool, `DASH_SUBAGENT=on` | **23.458** | i due tool dei subagent costano **5.685** |

Verifiche di coerenza: la somma delle parti ricostruita dai caratteri (istruzioni 8.620 caratteri =
2.394 token; indice delle 35 skill 9.686 caratteri = 2.780 token) coincide con il residuo misurato per
differenza a meno dell'1%.

---

## 4. Quanto rende una delega, in contesto e in denaro

Caso vero: mappare le variabili `DASH_*` lette in `dashboard.mjs` e `media/*.mjs`.

| | fai da te | con `subagent` |
|---|---:|---:|
| materiale che entra nel contesto del padre | 88 righe, 9.178 caratteri → **2.549 token** | 25 righe, 2.048 caratteri → **570 token** |
| permanenza | tutti i turni successivi | solo la sintesi |
| costo del lavoro | $0,00076 + ~$0,000015 per turno successivo | **$0,0051** (turno del figlio: 6.528 input, 17.408 cache read, 2.558 output) |
| tempo | ~1 s | 13,4 s |

Su 20 turni di sessione il «fai da te» costa `Y × 0,414 $/Mtok` e il subagent `Y × 0,3 + 0,0056`:
il **pareggio è a ~49.000 token** di ricognizione (≈80 file medi), che scende a ~16.000 su una
sessione da 60 turni. Prezzi usati, ricavati dall'uso reale dell'istanza: input 0,3 $/Mtok, cache read
0,006 $/Mtok, output 1,2 $/Mtok.

Conclusione adottata nel progetto: **il subagent è una leva di contesto, non di denaro** — per questo
il gate lo accende per turno invece di tenerlo sempre accesso (vedi `SUBAGENT_AUTO` in
`dashboard.mjs`: 5 letture o 20.000 caratteri nel turno precedente, oppure una richiesta che annuncia
una ricognizione).

---

## 5. Limiti di queste misure

- **Un modello, un giorno.** I rapporti in denaro dipendono dai prezzi del provider: su un modello più
  caro il pareggio si sposta, e il vantaggio del subagent cresce.
- **Il prefisso dipende dalla configurazione.** Ogni feature accesa aggiunge schemi: `browser`,
  `timestral_*`, `decision_m` sono spenti e quindi non contano; accenderli cambia il totale.
- **Il conteggio del provider include i token di formattazione** dei messaggi: per questo il protocollo
  usa una sessione nuova con un solo messaggio.
- **La stima per sezione** (caratteri / 3,6) ha un errore di qualche punto percentuale: serve a
  decidere *che cosa* tagliare, non a fatturare.
