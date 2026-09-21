# Istanze dell'harness — stato al 2026-09-21

Tre istanze **separate** sullo stesso server (processo, cartelle dati e credenziali distinti).
La codebase è una copia per istanza: nessuna condivisione di file, quindi una rottura o un
esperimento su una non tocca le altre.

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
