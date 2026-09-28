# Istanze dell'harness — stato al 2026-09-27

Tre istanze **separate** sullo stesso server (processo, cartelle dati e credenziali distinti).
La codebase è una copia per istanza: nessuna condivisione di file, quindi una rottura o un
esperimento su una non tocca le altre — e **una correzione non si propaga da sola**: va portata
istanza per istanza (vedi *Revisione del codice* in fondo).

| | **principale** | **tester_01** | **tester_07** (sottocliente limitato) |
|---|---|---|---|
| scopo | produzione, utente `pi` | prove tecniche | utente esterno con limiti |
| cartella | `/root/pi-harness` | `/root/tester_01` | `/home/tester07` (disco dedicato) |
| utente di sistema | `root` | `root` | **`tester07`** (uid 1002, non privilegiato) |
| utente dashboard | `pi` | `tester_01` | `tester_07` |
| porta locale | 8420 | 8421 | 8422 |
| servizio | `pi-dashboard.service` | `pi-tester01.service` | `pi-tester07.service` |
| host pubblico | `harness.universalisproduzioni.it` | `tester01.89-117-59-173.sslip.io` | `tester07.89-117-59-173.sslip.io`, `htester.universalisproduzioni.it` |
| `DASH_ROOT` (file manager) | `/root` | `/root/tester_01` | `/home/tester07` |
| modello | scelto dall'utente | scelto dall'utente | **fisso** `deepseek-flash` (`DASH_LOCK_MODEL=1`) |
| thinking | libero | libero | `low`/`high`; `max` mostrato ma non selezionabile |
| quota disco | nessuna | nessuna | **300 MB** soft su disco loop da 360 MB |
| tool browser | attivo | attivo | presente ma **non attivo** (niente sudo, vedi sotto) |
| sandbox | nessuna | nessuna | `ProtectSystem=strict`, `NoNewPrivileges=true` |
| config agente pi | `/root/.pi/agent` (condivisa) | `/root/.pi/agent` (condivisa) | `/var/lib/tester07/agent` (isolata) |

Accesso: pagina `/login` con cookie di sessione (30 giorni) **oppure** Basic Auth
(`curl -u "$DASH_USER:$DASH_PASSWORD"`). Le password stanno in `.env` di ciascuna istanza.

## Piattaforma

| voce | valore |
|---|---|
| sistema | Ubuntu 24.04.5 LTS, IP 89.117.59.173 |
| Node | v26.8.2 — `/home/linuxbrew/.linuxbrew/bin/node` (linuxbrew) |
| agente pi | `@earendil-works/pi-coding-agent` 0.85.1 in `node_modules/` di ogni istanza |
| pacchetti agente | `pi-observability`, `pi-web-access`, `pi-subagents` (via `DASH_SUBAGENT_EXT`) |
| reverse proxy | Caddy 2.6.2, config `/etc/caddy/Caddyfile`, HTTPS automatico |
| browser | `agent-browser` 0.38.1 globale + wrapper `/usr/local/bin/pbrowser`, utente `pi-browser` |
| backup istanze | `pi-backup.service` + `pi-backup.timer` (04:15, `backup.mjs`, destinazione `DASH_BACKUP_DIR`) |

## Revisione del codice per istanza (2026-09-27)

Le correzioni del 2026-09-27 (crash SSE, zip che usciva dalla root, screenshot del tool browser,
aggiornamento parziale dei goal, rinomina che sovrascriveva, anteprima SVG con fence indentate o
CRLF, `Content-Disposition` non sanificato, `/api/health` non verificabile, selettore modello
cablato, `/tab progetto|agenda|live`, numerazione doppia nei passi dei goal) sono state portate a
**tutte e tre** le istanze. Metodo: fusione a tre vie con base = codice di `HEAD`, così le
personalizzazioni locali restano; verifica per istanza (impronta servita = impronta su disco,
stato leggibile, zip senza file fuori root, rinomina → 409, SSE che non cambia il pid) più un giro
nel browser.

| file | principale | tester_01 | tester_07 |
|---|---|---|---|
| `dashboard.mjs` | `561165ab7df34ace` | `fcd41742ad3d5b3a` | `06e7a084d0a2eb49` |
| `dashboard.html` | `397bb30b` | `397bb30b` (identico) | `a252f611` (ha i blocchi del modello e del thinking) |
| `media/commands.mjs`, `media/zip-write.mjs`, `media/browser-tool.mjs` | **identici nelle tre istanze** | | |

Le differenze di `dashboard.mjs`/`dashboard.html` sono **solo le personalizzazioni**: in
`tester_07` il modello bloccato (`DASH_LOCK_MODEL=1`, la select è nascosta e `POST /api/model`
rifiuta), i livelli di thinking mostrati ma non selezionabili (`DASH_THINKING_DISABLED=max`) e la
quota disco (`DASH_QUOTA_MB=300`). Verificato dopo il riavvio: `locked.model=true`, `thinking.disabled=['max']`,
`quota.enabled=true` (300 MB), modello non cambiabile.

*Impronte:* `curl -s -u "$DASH_USER:$DASH_PASSWORD" http://127.0.0.1:<porta>/api/health | python3 -m json.tool`
(il campo `codeHash` è l'impronta del file di codice **in esecuzione**: se non coincide con
`sha256sum dashboard.mjs`, il processo è fermo a una revisione vecchia).

### Aggiornamento del 2026-09-28 — watcher sulle skill (tutte e tre le istanze)

Cosa è cambiato: la dashboard osserva **`skills/`** e ricarica da sola quando una skill viene
creata o modificata **fuori** dalla dashboard (shell, `git`, un'altra sessione), con un controllo
periodico di sicurezza (ogni 60 s) per i casi in cui il watcher perde un evento, più
`scripts/restart-dashboard.sh` per riavviare l'istanza **da dentro** un turno dell'agente senza che
il riavvio uccida chi l'ha chiesto (il processo vive nel cgroup del servizio).

Metodo, istanza per istanza: **fusione a tre vie** con base = `658e21b` (ultima versione allineata),
`ours` = codice dell'istanza, `theirs` = principale. Esito: **0 conflitti** su `dashboard.mjs` e
`dashboard.html`; le personalizzazioni dell'ospite restano presenti e attive
(`DASH_LOCK_MODEL=1`, `DASH_THINKING_DISABLED=max`, `DASH_QUOTA_MB=300`). Backup dei file
preesistenti dell'ospite in `/root/updates/20260928-205057-tester07/`.

| file | principale | tester_01 | tester_07 |
|---|---|---|---|
| `dashboard.mjs` | `5a2867521770a5f7` | `5a2867521770a5f7` (identico) | `d6dfe46e5a69259d` (personalizzazioni) |
| `dashboard.html` | `397bb30bfaa8296f` | `397bb30bfaa8296f` (identico) | `a252f6115361dbd4` (personalizzazioni) |
| `media/*.mjs` | **identici nelle tre istanze** | | |

Verifiche eseguite il 2026-09-28: impronta in esecuzione = impronta su disco
(`/api/health.codeHash`) in **tutte e tre**; watcher e controllo periodico presenti nel journal di
ciascuna; creazione e rimozione di una skill da shell rilevate **senza riavvio** su principale,
tester_01 e tester_07; nell'ospite i limiti sono intatti (`POST /api/model` → **403**,
`thinking.disabled = ['max']`, quota 300 MB).

Skill presenti (sono **per istanza**, non si propagano: vanno copiate a mano): **le stesse 5 in
tutte e tre** — `bookforge`, `browser`, `visual-representation`, `report-dataviz`, `design-craft`
(copia del 2026-09-28 verso `tester_01` e `tester_07`, con `chown tester07:tester07` sull'ospite;
rilevate dal watcher **senza riavvio** in tutte le istanze). Nell'ospite la cartella `skills/` occupa
poche decine di KB a fronte di ~313 MB liberi.

### Aggiornamento del 2026-09-28 (secondo) — grafica della dashboard, tutte le istanze

Cosa è cambiato (solo presentazione, nessuna funzione tolta): sistema tipografico a token (16 misure
→ 9), spaziature su griglia 4/8/12/16/24/32, contrasti a norma su etichette e autore dei messaggi,
riga di testo limitata a 74 caratteri, barra di stato su una riga con numeri leggibili
(`291k/1M · 29%`, `↑ 255k · ↓ 178k`, `$0,425`), icona disegnate al posto delle emoji, pensiero
collassato con riga di sintesi, card dei tool con nome, esito e durata, bersagli tattili 32-44px,
raggi ridotti a quattro valori, avviso quando il contesto supera l'85%, costo dell'ultimo turno,
densità comoda/compatta ricordata dal browser.

**Metodo e una lezione.** `tester_01` ha ricevuto una copia diretta (era identico alla base).
Per `tester_07` la fusione a tre vie su `dashboard.html` ha prodotto **2 conflitti reali**: le sue
personalizzazioni non sono solo nel `.env`/`.mjs`, ma anche nel markup — la voce **«spazio»** (quota
disco) nella barra, la funzione `applyLocks(st)` che nasconde il selettore del modello, lo stile
`.select option:disabled` e le opzioni di thinking disabilitate. Il file con i marcatori di conflitto
è stato **scartato subito** (ripristino dal backup fatto prima dell'intervento) e le sei
personalizzazioni sono state **riapplicate a mano** sul file nuovo, adattate ai token
(la voce «spazio» ha ora una sua icona SVG `#i-quota`).

| file | principale | tester_01 | tester_07 |
|---|---|---|---|
| `dashboard.html` | `f4fd99451501bb55` | `f4fd99451501bb55` (identico) | `c2e939881e0bba73` (con personalizzazioni) |
| `dashboard.mjs` | `5a2867521770a5f7` | `5a2867521770a5f7` (identico) | `d6dfe46e5a69259d` |
| `scripts/restart-dashboard.sh` | presente | copiato | copiato (`tester07:tester07`) |

**Non** copiato `scripts/sync-fine-lavoro.sh`: pubblicherebbe sul repository partendo da un clone di
prova, con rischio di commit indesiderati.

Verifiche eseguite nel browser su ogni istanza: 9 voci di barra tutte con icona disegnata, nessun
`<use>` senza simbolo, pensieri collassati con intestazione, card dei tool con nome, pulsante densità
presente, bersaglio più piccolo ≥ 32px, nessuno scorrimento orizzontale; in `tester_07` il modello
resta nascosto e non modificabile (`POST /api/model` → 403) e la voce «spazio» mostra la quota
(`1.5 MB / 300 MB`); impronta del codice in esecuzione = impronta su disco in entrambe.

### Nota sui backup

Il timer automatico `pi-backup.timer` (04:15) è **solo della principale**: `tester_01` e `tester_07`
non hanno un timer di backup, quindi i loro archivi vanno creati a mano (`node backup.mjs` nella
loro cartella, con le loro variabili `DASH_*` — attenzione: eseguirlo dalla sessione della
principale eredita `DASH_*` sbagliate).

## Cosa condividono (attenzione)

1. **Configurazione dell'agente pi** — le istanze `root` (principale e tester_01) leggono
   `/root/.pi/agent`: cambiare modello o chiavi lì cambia entrambe. Solo tester_07 è isolata
   (`PI_CODING_AGENT_DIR=/var/lib/tester07/agent`).
2. **Tool browser** — un solo utente `pi-browser` e un profilo Chrome per sessione: due istanze
   che usano il browser insieme si contendono le sessioni. Una per volta.
3. **Processo Node** — ogni istanza è un processo separato: dopo aver modificato il codice serve
   il riavvio dell'unit (il codice viene caricato all'avvio, non a caldo).

## Perché tester_07 non ha il browser

Il tool invoca `sudo -u pi-browser`, ma l'utente `tester07` non ha regole sudoers: l'attivazione
fallirebbe. Per abilitarlo servirebbe una regola mirata in `/etc/sudoers.d/`, con l'utente
`tester07` limitato al solo wrapper `/usr/local/bin/pbrowser` con `-H` (home di `pi-browser`).
Scelta non fatta di proposito: tiene il sottocliente dentro limiti rigidi.

## Limiti accettati di tester_07

Non è una chroot completa: l'agente può **leggere** file pubblici di sistema (`/etc/hostname`,
`ls /`, `df /`) e vede il disco del server. Non può però leggere le altre istanze (le loro
cartelle sono `700`/`drwx------`), non può scrivere fuori da `/home/tester07` e non può eseguire
comandi di sistema (`systemctl`, `su`, `sudo` assenti dai suoi permessi).
