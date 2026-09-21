# Ripristino di Universalis Harness (pi dashboard) da backup

Guida per ricostruire **da zero** una o entrambe le istanze a partire dall'archivio
`pi-dashboard-backup-<AAAAMMGG-HHMMSS>.tar.gz` creato da `media/backup-completo.sh`.

> L'archivio contiene **credenziali** (`.env`, `sistema/pi-config/auth.json`) e le **chat**:
> conservalo in un luogo sicuro e non condividerlo.

---

## 1. Cosa contiene l'archivio

```
pi-dashboard-backup-<ts>.tar.gz
├── MANIFEST.txt                  versione, data, elenco, hash dei file chiave, dimensioni
├── RESTORE.md                    questo documento
├── istanza/                      copia di /root/pi-harness (codice + dati)
│   ├── dashboard.mjs dashboard.html sw.js harness.mjs backup.mjs package.json
│   ├── assets/ node_modules/ .pi/ sw.js manifest.webmanifest
│   ├── skills/                   skill Agent Skills (bookforge, browser…)
│   ├── media/                    file generati, uploads/, goals.json, schedules.json
│   ├── sessions/                 chat persistenti (JSONL)
│   ├── download/
│   └── .env                      credenziali della dashboard + percorsi
├── clone-tester01/               copia di /root/tester_01 (se presente al momento del backup)
└── sistema/
    ├── systemd/                  pi-dashboard.service, pi-tester01.service,
    │                             pi-backup.service, pi-backup.timer
    ├── caddy/Caddyfile           reverse proxy con HTTPS
    └── pi-config/agent/          auth.json, settings.json, models-store.json (chiavi del modello)
```

**Non** è incluso `backups/` (gli archivi storici restano dove sono), né la cache npm di pi
(83 MB, opzionale: vedi §6).

## 2. Prerequisiti

| componente | versione usata qui | note |
|---|---|---|
| Ubuntu | 24.04 LTS | va bene qualunque Linux con systemd |
| Node.js | **v26.8.2** (`/home/linuxbrew/.linuxbrew/bin/node`) | se usi un altro percorso, aggiorna `ExecStart` |
| Caddy | 2.6.2 (`/usr/bin/caddy`) | solo se esponi su Internet con HTTPS |
| agent-browser | 0.38.1 (`/usr/bin/agent-browser`) + `pbrowser` (`/usr/local/bin/pbrowser`) | solo per il tool `browser` |
| utente di sistema | `pi-browser` (uid 997) | usato da agent-browser, non da root |
| python3 | 3.x | serve agli script della skill `bookforge` (`stylometry.py`, `validate_state.py`) |
| tar, rsync, sha256sum | — | già presenti |

Ricreare l'utente del browser, se manca:

```bash
useradd --system --create-home --shell /usr/sbin/nologin pi-browser
# agent-browser: reinstalla la CLI e pbrowser come da tua procedura di deploy
```

## 3. Ripristino completo dell'istanza principale

```bash
# 1) estrazione in una cartella di lavoro
mkdir -p /root/restore && tar xzf pi-dashboard-backup-<ts>.tar.gz -C /root/restore
sha256sum -c pi-dashboard-backup-<ts>.tar.gz.sha256      # integrità dell'archivio

# 2) messa in posizione del progetto (i dati vecchi, se ci sono, vanno spostati prima)
mv /root/pi-harness /root/pi-harness.pre-restore 2>/dev/null || true
mv /root/restore/istanza /root/pi-harness

# 3) permessi
chown -R root:root /root/pi-harness
chmod 600 /root/pi-harness/.env

# 4) unit systemd
cp /root/restore/sistema/systemd/*.service /root/restore/sistema/systemd/*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pi-dashboard
systemctl enable --now pi-backup.timer        # backup automatico giornaliero

# 5) verifica in locale (prima di esporre)
U=$(grep -oP '^DASH_USER=\K.*' /root/pi-harness/.env | tr -d '"')
P=$(grep -oP '^DASH_PASSWORD=\K.*' /root/pi-harness/.env | tr -d '"')
curl -s -o /dev/null -w '%{http_code}\n' -u "$U:$P" http://127.0.0.1:8420/api/state      # atteso: 200
curl -s -u "$U:$P" http://127.0.0.1:8420/api/skills | python3 -m json.tool | head -20
```

Se `ExecStart` punta a un node diverso:

```bash
systemctl edit pi-dashboard     # oppure modifica /etc/systemd/system/pi-dashboard.service
# ExecStart=/usr/bin/node /root/pi-harness/dashboard.mjs --port 8420
systemctl daemon-reload && systemctl restart pi-dashboard
```

## 4. Esposizione HTTPS con Caddy

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-restore      # se esiste già
cp /root/restore/sistema/caddy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
```

Il file contiene i blocchi per `harness.universalisproduzioni.it`, il vecchio
`pi.universalisproduzioni.it` e il fallback `89-117-59-173.sslip.io`, più quello di
`tester01.89-117-59-173.sslip.io`.

**DNS**: `harness` (e `tester01`) devono puntare all'IP pubblico della macchina
(`89.117.59.173`). In alternativa, senza toccare il DNS, si usa l'host `sslip.io`
corrispondente all'IP. Caddy emette i certificati Let's Encrypt al primo avvio per ogni
hostname configurato: se un nome non risolve, quel blocco resta senza certificato e
conviene rimuoverlo.

## 5. Ripristino del clone `tester_01`

```bash
mv /root/tester_01 /root/tester_01.pre-restore 2>/dev/null || true
mv /root/restore/clone-tester01 /root/tester_01
chmod 600 /root/tester_01/.env
systemctl daemon-reload && systemctl enable --now pi-tester01
systemctl is-active pi-tester01
```

Il clone usa `DASH_ROOT=/root/tester_01` (file manager confinato lì) e la porta 8421.
Il blocco Caddy è già nel Caddyfile di sistema.

## 6. Configurazione di pi (modello e chiavi)

`auth.json`, `settings.json`, `models-store.json` sono in `sistema/pi-config/agent/`:

```bash
mkdir -p /root/.pi/agent
cp /root/restore/sistema/pi-config/agent/*.json /root/.pi/agent/
```

Senza questi file la dashboard parte ma il modello non risponde. Se preferisci non copiare
le chiavi, rifai il login/configurazione con gli strumenti di pi (`pi` / `/login`).

Se serve il **subagent** (estensioni npm di pi, ~83 MB, non incluse nell'archivio):

```bash
# su questa macchina l'albero è /root/.pi/agent/npm (node_modules + package-lock.json)
# ricrealo con il gestore di estensioni di pi, oppure copialo da un'istanza funzionante
```

## 7. Ripristino parziale (solo dati)

| cosa vuoi recuperare | comando |
|---|---|
| chat | `cp -a /root/restore/istanza/sessions/. /root/pi-harness/sessions/` |
| file generati | `cp -a /root/restore/istanza/media/. /root/pi-harness/media/` |
| skill | `cp -a /root/restore/istanza/skills/. /root/pi-harness/skills/` |
| goal e pianificazioni | `media/goals.json`, `media/schedules.json` |
| credenziali e percorsi | `istanza/.env` (poi `systemctl restart pi-dashboard`) |

Dopo un ripristino **parziale** delle skill, riavvia il servizio: le skill sono lette
all'avvio e ricaricate a caldo solo dalle rotte `/api/skills*`.

## 8. Verifiche finali

```bash
systemctl is-active pi-dashboard pi-tester01 caddy
node /root/pi-harness/media/check-skills.mjs                    # frontmatter di tutte le skill
curl -s -o /dev/null -w 'sito: %{http_code}\n' https://harness.universalisproduzioni.it/ -u "$U:$P"
tail -5 /root/pi-harness/media/last-restart.log                # log degli ultimi riavvii
```

Cosa aspettarsi: `200` su `/api/state`, la lista skill con `bookforge` e `browser`,
`diagnostics: []`, le chat precedenti visibili nella barra laterale.

## 9. Note operative

- **Percorsi**: ogni istanza tiene i propri `skills/`, `backups/`, `media/`, `sessions/`
  accanto al codice; i default nel codice sono `<istanza>/skills` e `<istanza>/backups`.
  Le variabili `DASH_*` in `.env` rendono tutto esplicito.
- **`media-guard`**: l'hook reindirizza in `media/` solo i file **nuovi** creati fuori
  dall'istanza; dentro l'istanza (codice, `skills/`, `backups/`, `sessions/`) i file
  restano dove sono richiesti.
- **Backup automatico**: `pi-backup.timer` esegue `backup.mjs` (archivi di `sessions/` e
  `media/` in `backups/`, con retention). Questo documento invece descrive il backup
  **completo** (codice + dati + configurazione di sistema), che va creato a mano con
  `bash media/backup-completo.sh`.
- **Credenziali**: `DASH_PASSWORD` è in chiaro in `.env` (HTTP Basic). Cambiala subito se
  l'archivio è circolato.
