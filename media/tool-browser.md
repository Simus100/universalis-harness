# Tool `browser` — implementazione e attivazione

Data: 18/09/2026 · Goal: `7af1695f7d3f5f6f` (step `tool` e `limiti` chiusi)
Stato: **implementato, testato e su disco — NON ancora attivo in produzione** (manca il riavvio).

---

## 1. Cosa è stato fatto

| File | Ruolo |
|------|-------|
| `media/browser-tool.mjs` | **nuovo**: il tool `browser` come modulo separato (non nel monolite) |
| `dashboard.mjs` | 8 modifiche minime: import, `BROWSER_EXT`, registrazione, flag + gate, stato, endpoint, comando |
| `media/commands.mjs` | voce `/browser` nel catalogo della palette |
| `media/apply-browser-tool.mjs` | **nuovo**: la patch, idempotente e verificata ancòra per ancòra |
| `media/test-static.mjs` | +14 controlli (aggancio **e** vincoli di sicurezza) |
| `media/test-api.sh` | 2 asserzioni fragili (versione e conteggio funzioni hardcoded) sostituite con 8 controlli robusti |
| `media/update-goal*.mjs` | script di aggiornamento del goal |

Un solo tool con `action` enum: `open`, `snapshot`, `read`, `click`, `fill`, `type`, `press`,
`scroll`, `get`, `screenshot`, `pdf`, `eval`, `back`, `close`, `status`.

## 2. Vincoli di sicurezza (tutti verificati, non dichiarati)

| Vincolo | Come è garantito |
|---------|------------------|
| Mai come root | invoca **sempre** `sudo -n -u pi-browser -H agent-browser` |
| Sandbox adeguata | verifica `chrome://sandbox` prima di operare e **rifiuta** l'azione altrimenti, spiegando la causa |
| Nessuna shell | `execFileSync` con array di argomenti (`sh -c` assente): nessuna superficie di injection |
| Ref validati | regex `^@?e\d+$` prima dell'uso |
| URL validati | solo `http://` / `https://` |
| File generati | `screenshot`/`pdf` confinati in `media/` |
| Niente processi appesi | timeout 60 s per comando, `close --all`, e il check di sandbox chiude il browser di servizio |
| Costo zero quando spento | OFF di default: con il gate OFF il tool viene **rimosso** dalla lista inviata al modello |

## 3. Test eseguiti (tutti verdi)

| Test | Esito |
|------|-------|
| `node media/test-static.mjs` | **43 ok, 0 falliti** |
| `node media/test-ui.mjs` | **89 ok, 0 falliti** |
| `bash media/test-api.sh` | **38 ok, 0 falliti** |
| End-to-end su istanza isolata | il modello ha aperto `example.com`, letto lo snapshot, riportato `Example Domain` + ref `e1`/`e2`, chiuso il browser |
| Gate ON/OFF | OFF → `activeTools: []`; ON → `["browser"]` |
| Verifica sandbox dal tool | `sandbox OK` + *adequately sandboxed* + utente `pi-browser` |
| Processi residui dopo l'uso | **0** (prima della correzione: 16) |

## 4. Come attivarlo (manca solo questo)

Il servizio in esecuzione usa ancora il codice vecchio: verificato, `POST /api/browser` risponde
**404** e `/api/state` non ha il campo `browser`. Per attivare:

```bash
# 1. riavvio: DEVE girare come unità transitoria, perché il riavvio uccide il processo
#    della dashboard (e la sessione agente che lo ha chiesto)
cd /root/pi-harness
systemd-run --collect --unit=pi-deploy-$(date +%s) /root/pi-harness/media/verify-and-restart.sh

# 2. al ritorno, leggere l'esito (lo script è sopravvissuto al riavvio):
cat media/last-restart.log
cat media/restart-verified.txt
```

Attivare il tool (resta **OFF** di default anche dopo il riavvio):

```
/browser on          ← dalla chat
/browser             ← stato
/browser status      ← come verificarlo
```
oppure `POST /api/browser {"enabled":true}`.

Verifica che la sandbox sia adeguata:
> «Usa il tool browser con action=status e riportami il verdetto sulla sandbox.»

Deve rispondere `sandbox OK` + *You are adequately sandboxed* + `utente: pi-browser`.

## 5. Come disfarlo (rollback)

```bash
cd /root/pi-harness
tar -xzf backups/pi-harness-pre-browser-20260918-222731.tar.gz -C /root/pi-harness
systemd-run --collect --unit=pi-rollback-$(date +%s) /root/pi-harness/media/rollback-restart.sh
```
(oppure: `node media/apply-browser-tool.mjs --root . --dry-run` per controllare lo stato della patch)

## 6. Note operative per chi usa il tool

- **I ref non sono stabili.** Vanno presi dallo snapshot corrente e lo snapshot va rifatto dopo
  ogni navigazione: `e1` di una pagina non è `e1` di un'altra. Il tool lo dichiara nella propria
  description e nelle guideline.
- **Preferire `snapshot` a `screenshot`**: l'albero di accessibilità costa molto meno contesto.
- **Una sessione alla volta**: una sessione headless pesa ~1,7 GB; chiudere con `close` quando
  si ha finito.
- **Il tool resta OFF** dopo ogni riavvio: è una scelta, per non consumare RAM e contesto a sorpresa.
