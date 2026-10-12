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

## 1bis. Componenti esterni installati sulla macchina (fuori dal repository)

**Regola.** Nel repository entrano solo testi, script e file piccoli (oggi: ~13 MB in totale, il
file più grande è una PNG da 1,2 MB). Binari, motori, browser e modelli **non si versionano**: si
scaricano sulla macchina che installa. Questo documento dice cosa serve, da dove arriva e come si
verifica. Chi ricostruisce da zero deve eseguire questa sezione **dopo** i prerequisiti e **prima**
di avviare le istanze.

**Perché in `/opt` e non nelle home.** `/root` è `drwx------` (le istanze dei tester non lo leggono) e
le home dei tester sono filesystem piccoli (2 GB) con una soglia: sotto 1 GB libero HyperFrames non
renderizza. Tutto ciò che è condiviso e pesante sta quindi in `/opt`, leggibile da tutti
(`chmod -R a+rX`), con **symlink per utente** dove la CLI si aspetta di trovarlo.

| Componente | Perché serve | Dove va | Link / comando | Verifica |
|---|---|---|---|---|
| Node.js ≥ 22 | dashboard, CLI HyperFrames, REA | `$PATH` (via linuxbrew) | vedi prerequisiti | `node --version` |
| FFmpeg + FFprobe | render video (HyperFrames) | `/usr/bin` | `apt-get install -y ffmpeg` | `ffmpeg -version` |
| patchelf | corregge l'RPATH di `whisper-cli` (senza, la trascrizione funziona solo per root) | `/usr/bin` | `apt-get install -y patchelf` | `patchelf --version` |
| OpenJDK 21 (headless) | requisito di Ghidra | `/usr/lib/jvm/java-21-openjdk-amd64` | `apt-get install -y openjdk-21-jdk-headless` | `java -version` |
| **Ghidra 12.1.x** | pseudocodice/assembly/xrefs dei binari (motore di REA) | `/opt/rea-tools/ghidra_12.1.4_PUBLIC` | zip da <https://github.com/NationalSecurityAgency/ghidra/releases> (`ghidra_12.1.4_PUBLIC_*.zip`, ~570 MB) | `rea doctor --json` → 8 check Ghidra `ok` |
| **REA** (`rea-agents` 6.4.0) | CLI di reverse engineering | `/usr/bin/rea` (npm globale) | `npm install -g rea-agents` — <https://github.com/morluto/rea> | `rea --version` |
| pwntools 4.15.0 + pyelftools 0.33 + unicorn 2.1.2 | layout ELF (`inspect-binary-layout`) | venv `/opt/rea-tools/venv` | `python3 -m venv /opt/rea-tools/venv && /opt/rea-tools/venv/bin/pip install pwntools==4.15.0 pyelftools==0.33 unicorn==2.1.2` | `rea inspect-binary-layout <elf> --json` |
| WABT 1.0.42 | strumenti WASM (`wasm2wat`, `wasm-objdump`) | `/opt/rea-tools/wabt/bin` | <https://github.com/WebAssembly/wabt/releases> (`wabt-1.0.42-linux-x64.tar.gz`) | `wasm2wat --version` |
| wrapper **`/usr/local/bin/rea`** | esporta i percorsi di engine e toolchain a ogni invocazione | `/usr/local/bin` | script in [`media/tool-rea.md`](../media/tool-rea.md) | `rea doctor --json` |
| **HyperFrames CLI** 0.8.150 | composizione e render dei video | `/usr/bin/hyperframes` (npm globale) | `npm install -g hyperframes` | `hyperframes --version` |
| Chrome Headless Shell | render dei video | `/opt/hyperframes-chrome` + symlink `~/.cache/hyperframes/chrome` | `npx hyperframes browser ensure` (oppure copia dalla cache di un'istanza) | `hyperframes doctor --json` → `Chrome: ok` |
| **Kokoro TTS** (`kokoro-onnx` + `soundfile`) | voce fuori campo on-device | venv `/opt/hyperframes-models/kokoro-venv` | `python3 -m venv` + `pip install kokoro-onnx soundfile` | `hyperframes doctor` → `TTS (Kokoro): ok` |
| Modello Kokoro + voci (336 MB) | sintesi vocale | `/opt/hyperframes-models/tts/{models,voices}` + symlink `~/.cache/hyperframes/tts` | `kokoro-v1.0.onnx` e `voices-v1.0.bin` da <https://github.com/thewh1teagle/kokoro-onnx/releases> (`model-files-v1.0`) | `hyperframes tts "prova" -v if_sara --lang it -o /tmp/p.wav` |
| **Whisper** (runtime + modello) | trascrizione con timestamp parola per parola | `/opt/hyperframes-models/whisper` + symlink `~/.cache/hyperframes/whisper` | primo uso: `hyperframes transcribe <audio> --model small` (compila whisper.cpp da <https://github.com/ggml-org/whisper.cpp>, scarica `ggml-small.bin` 488 MB da <https://huggingface.co/ggerganov/whisper.cpp>); poi `patchelf --set-rpath /opt/hyperframes-models/whisper/whisper.cpp/build/bin` su `whisper-cli` e `lib*` | `hyperframes doctor` → `whisper-cpp: ok` |
| wrapper **`/usr/local/bin/hyperframes`** | dice alla CLI quale Python usare per Kokoro | `/usr/local/bin` | `export HYPERFRAMES_PYTHON=/opt/hyperframes-models/kokoro-venv/bin/python` | `hyperframes tts …` funziona da utente non-root |
| Skill di terzi (HyperFrames, HeyGen, media-use) | guidano composizione e media | `skills/` di ogni istanza | `npx hyperframes skills update`, poi `bash scripts/skills-sync-istanze.sh --applica` | `node media/test-skill-collisioni.mjs` |
| Skill ufficiale di REA | metodo investigativo + riferimenti | `~/.agents/skills/reverse-engineer-anything` | copia da `/usr/lib/node_modules/rea-agents/skills/` (oppure `rea setup`) | `rea doctor --json` → `skill: aligned` |

**Non installate, per scelta:** Docker (serve solo a `render --docker`) e la musica locale
MusicGen (~3 GB di PyTorch, generazione lenta su CPU senza GPU: la musica si prende dal provider
hosted). Dettagli e prove in [`media/hyperframes-opzionali.md`](../media/hyperframes-opzionali.md).

### Istruzioni per un'AI che installa da questo repository

1. **Leggi prima** `docs/RICOSTRUZIONE.md` (questo file), `media/tool-rea.md`,
   `media/hyperframes-opzionali.md`, `media/skill-istanze.md`, `media/skill-collisioni.md`.
2. **Non aggiungere al repository** binari, modelli, video o archivi: scarica tutto **sulla
   macchina** (in `/opt` se è condiviso fra istanze) e aggiorna solo i testi di questi documenti.
3. Esegui i prerequisiti di sistema (sezione 1), poi la tabella qui sopra nell'ordine dato:
   `ffmpeg` e `patchelf` → JDK → Ghidra → REA → venv pwntools → WABT → i due wrapper →
   HyperFrames CLI → Chrome → Kokoro (venv, modelli) → Whisper (primo uso, poi `patchelf`).
4. Dopo ogni componente esegui la sua **verifica**: non procedere se un `doctor` segnala un
   problema (i messaggi sono in italiano solo se lo sono qui: la CLI parla inglese).
5. **Permessi**: `chmod -R a+rX` su ciò che sta in `/opt`; i symlink nelle home vanno creati con
   `ln -sfn` e resi dell'utente giusto con `chown -h`.
6. **Ripeti la verifica finale**: `rea doctor --json`, `hyperframes doctor --json`,
   `node media/test-skill-collisioni.mjs` per ogni istanza, `bash scripts/spazio-tester.sh`.
7. Le istanze dei tester vedono i componenti condivisi in `/opt` e scrivono **solo** nella loro home:
   non installare nulla nelle loro cartelle (riempirebbero lo spazio e bloccherebbero i render).

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

### 4.2 Disco dedicato (tetto fisico, oggi 2 GB)

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
# le estensioni usate: la cartella cresce fino a ~92 MB, per questo sta fuori dal disco limitato.
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
DASH_QUOTA_MB=1700
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

## 4bis. Seconda istanza limitata (`tester_08`, porta 8423) — creata il 2026-10-05

Ricetta usata per una **seconda** istanza identica a `tester_07` ma separata (dati vuoti, chiave
API la stessa). Vale come modello per `tester_09`, …: cambiare `08` → `09` e la porta → `8424`.

```bash
# 1. utente di sistema
adduser --disabled-password --gecos "pi harness istanza limitata (clone isolato)" tester08
usermod -s /bin/bash tester08

# 2. disco dedicato (oggi 2 GB; per la creazione minima iniziale erano 360 MB) + quota soft nel .env
mkdir -p /var/lib/tester08
truncate -s 2G /var/lib/tester08/disk.img
mkfs.ext4 -q -F -L tester08 /var/lib/tester08/disk.img
echo '/var/lib/tester08/disk.img /home/tester08 ext4 loop,nofail,defaults 0 2' >> /etc/fstab
mkdir -p /home/tester08 && mount /home/tester08 && chown tester08:tester08 /home/tester08

# 3. codice e configurazione dalla 07, SENZA i suoi dati (- vedi esclusioni sotto)
rsync -a --exclude 'sessions/' --exclude 'backups/' --exclude 'download/' \
  --exclude '.env' --exclude '.session-secret' --exclude '.password-provvisoria' \
  --exclude '.pi/' --exclude '.cache/' --exclude '.config/' --exclude '.local/' --exclude '.npm/' \
  --exclude '.agent-browser' --exclude 'lost+found/' --exclude 'piccolo.bin' --exclude 'ISTANZA.md' \
  --exclude 'media/ask-log.jsonl' --exclude 'media/uploads/' \
  --exclude 'media/memoria/indice.json' --exclude 'media/memoria/grafo.json' \
  --exclude 'media/memoria/episodi/' --exclude 'media/memoria/atlante.html' --exclude 'media/memoria/wiki/' \
  --exclude 'media/*-prefs.json' --exclude 'media/features-tester07.md' --exclude 'media/test-token-report.md' \
  /home/tester07/ /home/tester08/
mkdir -p /home/tester08/{sessions,download,backups} /home/tester08/media/uploads /home/tester08/media/memoria/episodi
chown -R tester08:tester08 /home/tester08

# 4. config agente isolata: auth.json è la CHIAVE API (la stessa della 07)
mkdir -p /var/lib/tester08/agent && rsync -a /var/lib/tester07/agent/ /var/lib/tester08/agent/
chown -R tester08:tester08 /var/lib/tester08/agent        # ~92 MB, sta FUORI dal disco limitato

# 5. .env (percorsi 08, credenziali proprie) — vedi §4.5, più PI_CODING_AGENT_DIR=/var/lib/tester08/agent
#    e DASH_SUBAGENT_EXT=/var/lib/tester08/agent/npm/node_modules/pi-subagents/index.ts

# 6. unit (da pi-tester07.service, con sed): porta 8423, User/Group tester08,
#    RequiresMountsFor=/home/tester08, ReadWritePaths=/home/tester08 /var/lib/tester08/agent
systemctl daemon-reload && systemctl enable --now pi-tester08

# 7. Caddy: blocco tester08.89-117-59-173.sslip.io -> 127.0.0.1:8423, poi `caddy validate` + reload

# 8. prima memoria dell'istanza (i suoi dati; senza, /memoria risponde 404)
sudo -u tester08 -H sh -c 'cd /home/tester08 && /home/linuxbrew/.linuxbrew/bin/node media/memoria/memoria-build.mjs --atlante'
```

**Permessi: il passo che non si può saltare.** I permessi di default di `adduser` **non isolano** le
istanze sotto `/home`: con `755` e file `644`, `tester08` leggeva le sessioni di `tester07`
(verificato). Dopo la copia:

```bash
chmod 700 /home/tester07 /home/tester08                 # nessuno attraversa l'home dell'altro
chown root:tester07 /var/lib/tester07; chmod 770 /var/lib/tester07
chown root:tester08 /var/lib/tester08; chmod 770 /var/lib/tester08
chmod 600 /var/lib/tester07/disk.img /var/lib/tester08/disk.img
systemctl restart pi-tester07 pi-tester08               # e rileggere /login su 8422 e 8423
```

Il servizio impiega ~30 s ad aprire la porta (disco loop più lento): attendere prima di dichiararlo
ko. Verifica minima: `codeHash` di `/api/health` = `sha256sum dashboard.mjs`, `POST /api/model` →
`403`, quota mostrata in `/api/state`, `sudo -u tester08 ls /home/tester07` → *Permission denied*.

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

- **File grandi mai nel repository.** Binari, modelli, video e browser si scaricano sulla macchina
  (vedi sezione 1bis); nel repo restano solo testi e script. Regola già attiva in `.gitignore`
  (`node_modules/`, `media/*.mp4`, skill di terzi).
- **Componenti condivisi in `/opt`**: Ghidra e toolchain REA, Chrome Headless Shell, modelli Kokoro
  e Whisper. Le home dei tester hanno 2 GB e una soglia di render: sotto 1 GB libero i video non
  partono (`bash scripts/spazio-tester.sh` lo segnala).
- **Segreti fuori dal repository**: `.env` (password), `.session-secret`, `/root/.pi/agent/auth.json`,
  `/var/lib/tester07/agent/auth.json`. Mai committarli: sono in `.gitignore`, il pacchetto di
  export li tiene in `CONFIG-RISERVATA/` con permessi `600`.
- **`DASH_ROOT` è il confine, non una chroot**: l'istanza principale ha `DASH_ROOT=/root`, quindi
  l'agente che ci gira può leggere tutte le altre cartelle sotto `/root`, incluse le chiavi API.
- **Caddy**: i blocchi senza `@noStream` comprimono anche `/events` e rompono lo streaming della chat.
- **Una istanza, un processo**: `Restart=always`; dopo ogni modifica serve `systemctl restart`.
- **Nome utente dashboard diverso dal nome di sistema**: `tester_07` (dashboard) è `tester07` (sistema).
