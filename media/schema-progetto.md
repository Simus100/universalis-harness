# Universalis Harness — schema del progetto

Data: 2026-09-18 · stato: **versione iniziale minima** (funzionante in produzione su `harness.universalisproduzioni.it`)

## 1. Cos'è

Dashboard web per pi (chat con streaming + file manager), servita dietro **Caddy** (HTTPS automatico) come servizio systemd `pi-dashboard`. Brandizzata **Universalis Harness**.

- Frontend: HTML/CSS/JS vanilla (nessun framework, nessun build).
- Backend: Node.js **ESM** (`"type": "module"`), solo moduli standard, **nessuna dipendenza npm** (il pacchetto `@earendil-works/pi-coding-agent` è il runtime di pi, non una dipendenza del progetto).

## 2. Struttura file

```
/root/pi-harness/
├── dashboard.mjs        # server HTTP (SSE per streaming), auth Basic, API, file manager
├── dashboard.html       # tutta la UI: CSS inline + JS inline (no build)
├── harness.mjs          # interfaccia da terminale (chat REPL per pi)
├── backup.mjs           # backup sessions/ + media/ con retention + timer systemd
├── manifest.webmanifest # PWA (name/short_name/icone)
├── sw.js                # service worker (cache icone, notifiche, installabile)
├── package.json         # scripts: harness / dashboard
├── .env                 # DASH_USER, DASH_PASSWORD, DASH_ROOT, DASH_HOST
├── assets/              # icon-192/512.png, apple-touch-icon.png, favicon.ico
├── sessions/            # chat JSONL persistenti (formato nativo di pi)
├── media/               # file generati dall'agente + upload + output UI
├── backups/             # destinazione dei backup automatici
├── download/            # download temporanei
├── node_modules/        # runtime pi (non una dipendenza npm del progetto)
└── README.md            # documentazione
```

## 3. Variabili d'ambiente (tutte opzionali, con default)

| Variabile | Default | Ruolo |
|---|---|---|
| `DASH_HOST` | `0.0.0.0` | interfaccia di ascolto (in produzione Caddy punta a `127.0.0.1:8420`) |
| `DASH_PORT` | `8420` (arg `--port`) | porta HTTP interna |
| `DASH_USER` / `DASH_PASSWORD` | `pi` / casuale | credenziali HTTP Basic |
| `DASH_ROOT` | `cwd` | root del file manager |
| `DASH_MEDIA_DIR` | `/root/pi-harness/media` | cartella dei file generati |
| `DASH_SKILLS_DIR` | `<script>/skills` | skill Agent Skills (fuori da media/) |
| `DASH_SESSION_DIR` | `<script>/sessions` | chat persistenti |
| `DASH_BACKUP_DIR` | `<script>/backups` | backup (usato da `backup.mjs`) |
| `DASH_AUTH_MAX_FAILS` / `_WINDOW_MS` / `_BLOCK_MS` | 8 / 5 min / 15 min | anti brute-force Basic |
| `DASH_SEARCH_LIMIT` | 200 | righe trovate nella ricerca file |
| `DASH_BACKUP_KEEP_DAYS` / `_KEEP_MIN` / `_MIRROR` | 14 / 5 / — | retention e mirror backup |

Punti chiave: `sessions/`, `media/`, `skills/` e `backups/` **si possono spostare con le variabili** → è questo che permette di duplicare l'istanza senza toccare il codice.

## 4. Runtime / deploy

```
systemd: pi-dashboard.service
  WorkingDirectory=/root/pi-harness
  EnvironmentFile=/root/pi-harness/.env
  ExecStart=node dashboard.mjs --port 8420

Caddy (/etc/caddy/Caddyfile):
  harness.universalisproduzioni.it  → 127.0.0.1:8420   (principale, cert Let's Encrypt)
  pi.universalisproduzioni.it       → 127.0.0.1:8420   (vecchio, record DNS rimosso il 18/09)
  89-117-59-173.sslip.io            → 127.0.0.1:8420   (fallback)

backup: pi-backup.service + pi-backup.timer (giornaliero 04:15, retention 14gg)
```

L'HTML/CSS/icone/manifest/sw sono letti da disco **a ogni richiesta** → le modifiche alla UI sono immediate (basta ricaricare). Le modifiche a `dashboard.mjs` richiedono `systemctl restart pi-dashboard`.

## 5. Branding

- Nome: **Universalis Harness** (title, header, notifiche, manifest, README).
- Logo: allegato dell'utente convertito in PNG trasparente/icone con `media/universalis-brand/universalis_brand.py` (decoder JPEG + encoder PNG in Python puro, nessuna dipendenza).
- Il logo è **inline** nell'HTML come data-URI (variabile CSS `--brand-logo`); le icone PWA stanno in `assets/`.

## 6. Piano istanza "ospiti" (clone)

Vedi anche `media/piano-istanza-ospiti.md`. Riepilogo: **una sola codebase** (`/root/pi-harness`), **data dir separata** per l'ospite (`/root/pi-harness-ospiti/`), porta interna diversa (8421), vhost `ospiti.universalisproduzioni.it`, Basic auth con credenziali distinte.

Cartella di duplicazione creata: `/root/pi-harness-ospiti/` (struttura pronta, **non ancora attivata**).
