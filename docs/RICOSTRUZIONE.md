# Installazione, clonazione e ripristino dell'harness

Guida operativa per ricostruire da zero (server nuovo, o dopo un guasto) le tre istanze:
**principale**, clone di prova **tester_01** e sottocliente limitato **tester_07**.
Lo stato corrente delle istanze è in `docs/ISTANZE.md`.

Tutti i comandi vanno eseguiti da root sul server, salvo dove indicato.
Percorsi alternativi per gli stessi dati sono nell'archivio `backup_export/` (vedi `LEGGIMI.md`).

---

## 1. Prerequisiti

```bash
apt-get update && apt-get install -y caddy git rsync curl sudo
# Node (nel server attuale è installato via linuxbrew, non quello di apt)
/home/linuxbrew/.linuxbrew/bin/node -v          # v26.8.2
npm install -g agent-browser                    # per il tool browser
```

Utente dedicato al browser (profilo Chrome persistente, mai come root):

```bash
adduser --system --group --home /home/pi-browser pi-browser
install -o root -g root -m 755 /dev/stdin /usr/local/bin/pbrowser <<'EOF'
#!/bin/sh
BASE="${PBROWSER_PROFILE_BASE:-/home/pi-browser/.agent-browser}"
SESSION=default; prev=""
for a in "$@"; do [ "$prev" = "--session" ] && { SESSION="$a"; break; }; prev="$a"; done
if [ "$SESSION" = "default" ]; then : "${AGENT_BROWSER_PROFILE:=$BASE/profile}"
else CLEAN=$(printf '%s' "$SESSION" | tr -c 'A-Za-z0-9_-' '-'); AGENT_BROWSER_PROFILE="$BASE/profile-$CLEAN"; fi
export AGENT_BROWSER_PROFILE
exec /usr/bin/agent-browser "$@"
EOF
```

---

## 2. Istanza principale (`/root/pi-harness`, porta 8420)

```bash
mkdir -p /root/pi-harness && cd /root/pi-harness
# codice: dashboard.mjs, dashboard.html, sw.js, manifest.webmanifest, harness.mjs,
#        backup.mjs, package.json, assets/, skills/, media/, download/
npm install                       # installa @earendil-works/pi-coding-agent
```

`.env` dell'istanza (la password: `DASH_PASSWORD`, generata a caso e conservata qui):

```env
DASH_USER=pi
DASH_PASSWORD=<password>
DASH_HOST=127.0.0.1              # NON esporre 0.0.0.0: l'unica porta pubblica è Caddy
DASH_ROOT=/root
DASH_MEDIA_DIR=/root/pi-harness/media
DASH_SKILLS_DIR=/root/pi-harness/skills
DASH_SESSION_DIR=/root/pi-harness/sessions
DASH_BACKUP_DIR=/root/pi-harness/backups
```

Unit systemd (`/etc/systemd/system/pi-dashboard.service`, copia identica in `infra/systemd/`):

```ini
[Unit]
Description=pi web dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/root/pi-harness
EnvironmentFile=/root/pi-harness/.env
ExecStart=/home/linuxbrew/.linuxbrew/bin/node /root/pi-harness/dashboard.mjs --port 8420
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now pi-dashboard
```

Configurazione dell'agente pi (chiavi API dei provider, modello, estensioni):
`/root/.pi/agent/` — contiene `auth.json` (chiave per provider), `settings.json`
(modello predefinito, pacchetti `pi-observability`, `pi-web-access`), `models-store.json`.
Va **ricreata a mano** (o ripristinata dai propri archivi): non è mai inclusa nel repository.

Caddy (`/etc/caddy/Caddyfile`):

```
harness.universalisproduzioni.it {
	@noStream not path /events
	encode @noStream zstd gzip
	reverse_proxy 127.0.0.1:8420
}
```

```bash
systemctl reload caddy && systemctl status caddy
```

Backup automatico dell'istanza:

```bash
install -m 644 infra/systemd/pi-backup.service infra/systemd/pi-backup.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now pi-backup.timer
```

---

## 3. Clone di prova (`/root/tester_01`, porta 8421)

Copia completa e isolata dell'istanza principale: stessa utenza di sistema (`root`),
cartelle dati proprie, credenziali proprie.

```bash
cp -a /root/pi-harness /root/tester_01        # poi ripulisci sessions/ e backups/
cd /root/tester_01
# .env: DASH_USER=tester_01, DASH_ROOT=/root/tester_01 e tutte le cartelle sotto /root/tester_01
install -m 644 infra/systemd/pi-tester01.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now pi-tester01
```

Caddy:

```
tester01.89-117-59-173.sslip.io {
	@noStream not path /events
	encode @noStream zstd gzip
	reverse_proxy 127.0.0.1:8421
}
```

---

## 4. Sottocliente limitato (`/home/tester07`, porta 8422)

Quattro differenze rispetto a un clone normale: **utente non privilegiato**, **disco separato
con tetto fisico**, **quota soft**, **modello e thinking parzialmente bloccati**.

### 4.1 Utente di sistema non privilegiato

```bash
adduser --disabled-password --gecos "pi harness istanza limitata (clone isolato)" tester07
usermod -s /bin/bash tester07
```

### 4.2 Disco dedicato (tetto fisico ~360 MB)

```bash
mkdir -p /var/lib/tester07
truncate -s 360M /var/lib/tester07/disk.img
mkfs.ext4 -q -F -L tester07 /var/lib/tester07/disk.img
mkdir -p /home/tester07
echo '/var/lib/tester07/disk.img /home/tester07 ext4 loop,nofail,defaults 0 2' >> /etc/fstab
mount /home/tester07 && mount | grep tester07
chown tester07:tester07 /home/tester07
```

Quando il disco si riempie, il kernel blocca le scritture con `ENOSPC`: è il limite duro.

### 4.3 Codice e dipendenze

```bash
rsync -a --exclude sessions/ --exclude backups/ /root/pi-harness/ /home/tester07/
cp /home/tester07/media/browser-tool.mjs /home/tester07/media/ 2>/dev/null || true
ln -s /root/pi-harness/node_modules /home/tester07/node_modules   # oppure: npm install
```

⚠️ Nei dati attuali `node_modules` è un **symlink** al pacchetto globale: con
`ProtectHome=read-only` un symlink verso `/root` non sarebbe leggibile. Se ricostruisci la
sandbox, fai `npm install` dentro `/home/tester07` (consuma ~12 MB dei 300) oppure monta il
pacchetto in sola lettura.

### 4.4 Configurazione agente isolata (fuori dal disco limitato)

```bash
mkdir -p /var/lib/tester07/agent
chown -R tester07:tester07 /var/lib/tester07/agent
# copia qui la config di pi (auth.json con la chiave del provider, settings.json) e installa
# le estensioni usate: la cartella cresce fino a ~92 MB, per questo sta fuori dal disco da 360 MB.
```

### 4.5 `.env` dell'utente limitato

```env
DASH_USER=tester_07
DASH_PASSWORD=<password>
DASH_HOST=127.0.0.1
DASH_ROOT=/home/tester07
DASH_MEDIA_DIR=/home/tester07/media
DASH_SKILLS_DIR=/home/tester07/skills
DASH_SESSION_DIR=/home/tester07/sessions
DASH_BACKUP_DIR=/home/tester07/backups
DASH_TZ=Europe/Rome

# limiti dell'istanza
DASH_QUOTA_MB=300
PI_CODING_AGENT_DIR=/var/lib/tester07/agent
DASH_SUBAGENT_EXT=/var/lib/tester07/agent/npm/node_modules/pi-subagents/index.ts

# utente limitato: modello fisso e thinking parzialmente bloccato
DASH_LOCK_MODEL=1
DASH_THINKING_DISABLED=max
```

### 4.6 Unit con sandbox (`infra/systemd/pi-tester07.service`)

```ini
[Unit]
Description=tester_07 — harness limitato (clone isolato, utente dedicato)
After=network-online.target
Wants=network-online.target
RequiresMountsFor=/home/tester07

[Service]
Type=simple
WorkingDirectory=/home/tester07
EnvironmentFile=/home/tester07/.env
ExecStart=/home/linuxbrew/.linuxbrew/bin/node /home/tester07/dashboard.mjs --port 8422
Restart=always
RestartSec=3
User=tester07
Group=tester07
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/tester07 /var/lib/tester07/agent
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

`ReadWritePaths` deve restare **allineato** a `PI_CODING_AGENT_DIR`: se sposti la config agente,
aggiungi il nuovo percorso, altrimenti l'agente gira ma non può scrivere la sua cache.

```bash
install -m 644 infra/systemd/pi-tester07.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now pi-tester07
```

### 4.7 Codice specifico dell'utente limitato

La copia in `/home/tester07/dashboard.mjs` contiene **due funzionalità che non esistono** nella
versione di produzione (diff completo in `dashboard/DIFF-principale-vs-utente-limitato.patch`):

1. **quota** (`DASH_QUOTA_MB`): `refreshQuota` misura `du` di `DASH_ROOT` (esclude `node_modules`,
   `.pi`, `lost+found`), la espone nella scheda **stato** (voce "spazio") e rifiuta upload e
   scritture con `HTTP 507 spazio esaurito` **prima** del tetto fisico;
2. **blocco modello/thinking** (`DASH_LOCK_MODEL`, `DASH_THINKING_DISABLED`): il selettore del
   modello sparisce e `POST /api/model` risponde `403`; i livelli elencati in
   `DASH_THINKING_DISABLED` restano visibili ma non selezionabili (`403` anche via API e comandi
   `/model`, `/think max`).

Aggiornando la copia da monte, questi pezzi vanno **riportati a mano**: non sono nel codice di
produzione. Differenza di versione: produzione `dashboard-2026-09-21.2`.

---

## 5. Variabili d'ambiente riconosciute da `dashboard.mjs`

| variabile | significato |
|---|---|
| `DASH_USER`, `DASH_PASSWORD` | credenziali (Basic Auth e pagina `/login`) |
| `DASH_HOST` | indirizzo di ascolto (`127.0.0.1` in produzione) |
| `DASH_ROOT` | radice del file manager = confine visibile all'agente |
| `DASH_MEDIA_DIR`, `DASH_SKILLS_DIR`, `DASH_SESSION_DIR`, `DASH_BACKUP_DIR` | cartelle dati |
| `DASH_TZ` | fuso usato dalle pianificazioni |
| `DASH_SESSION_TTL_MS`, `DASH_SESSION_SECRET_FILE` | durata del cookie e file del segreto |
| `DASH_AUTH_MAX_FAILS`, `DASH_AUTH_WINDOW_MS`, `DASH_AUTH_BLOCK_MS`, `DASH_AUTH_BACKOFF`, `DASH_AUTH_FORGET_MS` | anti brute-force |
| `DASH_ASK`, `DASH_ASK_LOG_FILE`, `DASH_ASK_PREFS_FILE` | domande interattive (`off` rimuove il tool) |
| `DASH_BROWSER_USER`, `DASH_BROWSER_BIN`, `DASH_BROWSER_STREAM_FPS(_HUMAN)`, `DASH_BROWSER_PREFS_FILE` | tool browser e flusso video |
| `DASH_SUBAGENT_EXT`, `PI_SUBAGENT_MAX_SPAWNS_PER_RUN` | subagent |
| `DASH_GOALS_FILE`, `DASH_SCHEDULES_FILE`, `DASH_SCHEDULE_TICK_MS` | goal e pianificazioni |
| `DASH_SEARCH_LIMIT` | risultati di ricerca |
| `DASH_QUOTA_MB`, `DASH_LOCK_MODEL`, `DASH_THINKING_DISABLED` | **solo versione limitata** |
| `PI_CODING_AGENT_DIR` | cartella di configurazione dell'agente pi (isolamento per istanza) |
| `TZ` | fuso orario del processo |

Argomenti CLI: `--port`, `--host`, `--user`, `--password`, `--root`, `--model`, `--think`.

---

## 6. Verifica dopo il ripristino (smoke test)

```bash
# 1. i tre servizi attivi
systemctl is-active pi-dashboard pi-tester01 pi-tester07

# 2. risposta HTTP locale (401 senza credenziali = auth attiva)
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8420/
curl -s -u "$DASH_USER:$DASH_PASSWORD" -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8420/api/state

# 3. HTTPS pubblico
curl -s -o /dev/null -w '%{http_code}\n' https://harness.universalisproduzioni.it/login

# 4. limite dell'utente (attesi 403 su modello, 403 su thinking max, 200 su high)
curl -s -u tester_07:PW -X POST -H 'content-type: application/json' \
     -d '{"model":"deepseek-flash"}' http://127.0.0.1:8422/api/model -o /dev/null -w '%{http_code}\n'

# 5. quota visibile nella scheda stato
curl -s -u tester_07:PW http://127.0.0.1:8422/api/state | grep -o '"quota":{[^}]*}'

# 6. sandbox: scrittura fuori dalla cartella negata
sudo -u tester07 touch /etc/prova        # atteso: Read-only file system
```

---

## 7. Aggiornare il codice di un'istanza dopo una modifica approvata

```bash
systemctl stop pi-tester07
cp /root/pi-harness/dashboard.mjs /root/pi-harness/dashboard.html /home/tester07/
chown tester07:tester07 /home/tester07/dashboard.{mjs,html}   # (con symlink node_modules: vedi 4.3)
systemctl start pi-tester07
```

Se il codice di monte introduce **nuovi file** in `media/` (moduli caricati a runtime), vanno
ricopiati anche quelli. Il riavvio è sempre necessario: il codice è letto all'avvio del processo.

---

## 8. Backup

| cosa | come |
|---|---|
| istanza principale | `pi-backup.timer` (04:15) → `node backup.mjs`, destinazione `DASH_BACKUP_DIR` |
| tester_01 | `node /root/tester_01/backup.mjs` |
| tester_07 | `sudo -u tester07 node /home/tester07/backup.mjs` |
| pacchetto di ricostruzione | `scripts/backup-export.sh` → `/root/pi-harness/backup_export/` |

Ripristino di un'istanza guasta: fermare l'unit, sostituire `sessions/` e `media/` con l'ultimo
archivio, riavviare l'unit. Il codice si ripristina dal repository git, non dagli archivi di
`backup.mjs` (che non contengono il codice).

---

## 9. Punti di attenzione

- **Segreti fuori dal repository**: `.env` (password), `.session-secret`, `/root/.pi/agent/auth.json`,
  `/var/lib/tester07/agent/auth.json`. Mai committarli: sono in `.gitignore`, il pacchetto di
  export li tiene in `CONFIG-RISERVATA/` con permessi `600`.
- **`DASH_ROOT` è il confine, non una chroot**: l'istanza principale ha `DASH_ROOT=/root`, quindi
  l'agente che ci gira può leggere tutte le altre cartelle sotto `/root`, incluse le chiavi API.
- **Caddy**: i blocchi senza `@noStream` comprimono anche `/events` e rompono lo streaming della chat.
- **Una istanza, un processo**: `Restart=always`; dopo ogni modifica serve `systemctl restart`.
- **Nome utente dashboard diverso dal nome di sistema**: `tester_07` (dashboard) è `tester07` (sistema).
