# Sincronizzazione con GitHub

Il codice di questo harness è versionato in un repository GitHub **privato**
(`universalis-harness`). Questo documento spiega cosa viene pubblicato, cosa resta fuori e come
aggiornare il repository.

## 0. Stato del collegamento

| | |
|---|---|
| repository | https://github.com/Simus100/universalis-harness — **privato** |
| proprietario | `Simus100` |
| primo caricamento | 2026-09-21, branch `main` (246 file) |
| remote locale | `origin` → `https://github.com/Simus100/universalis-harness.git` |
| verifica rapida | `scripts/github-sync.sh --stato` |

Nel repository **non** sono presenti `.env`, `.session-secret`, `sessions/`, `backups/`,
`node_modules/`, upload, log né il pacchetto `backup_export/` (verificato via API: tutti `404`).

---

## 1. Configurazione di accesso (una volta sola)

Proprietario del repository: **`Simus100`** (https://github.com/Simus100).
La configurazione di accesso sta in `/root/pi-harness/.github-access`, permessi `600`, **fuori dal
versionamento** (è in `.gitignore`). Formato:

```
GITHUB_TOKEN=<dato di accesso personale, con permesso di scrittura sui contenuti>
GITHUB_OWNER=Simus100                                    # opzionale
GITHUB_REPO=universalis-harness                          # opzionale (default)
GITHUB_PRIVATE=true                                      # opzionale (default)
```

Un solo valore su una riga sola è accettato come alternativa. Il valore viene letto dallo script
solo al momento del push, non viene mai copiato nel repository, non viene stampato nei log e non
viene salvato in `.git/config`.

### Quale permesso serve

| tipo di accesso | permessi | quando conviene |
|---|---|---|
| **classico** (https://github.com/settings/tokens/new) | scope **`repo`** | percorso più semplice: crea il repository privato **e** pubblica. Consigliato. |
| **fine-grained** (https://github.com/settings/personal-access-tokens/new) | *Repository access*: **All repositories**; permessi **Administration: Read and write** (serve a `POST /user/repos`), **Contents: Read and write** (push), **Metadata: Read** (obbligatorio) | più restrittivo, ma con *Only select repositories* **non** può creare il repository |
| **fine-grained senza creazione repo** | *Contents: Read and write* + *Metadata: Read* sul repository già esistente | se crei il repository a mano: lo script fa solo il push |

Il permesso richiesto da GitHub per `POST /user/repos` è documentato come *«Administration»
repository permissions (write)* per i token fine-grained e scope `repo` per i classici.

Impostare una **scadenza** (90 giorni o 1 anno) è consigliato: alla scadenza il push smette di
funzionare e il file va aggiornato. GitHub mostra il valore **una sola volta**, al momento della
creazione.

Verifica:

```bash
chmod 600 /root/pi-harness/.github-access
/root/pi-harness/scripts/github-sync.sh --stato
```

---

## 2. Primo caricamento

```bash
/root/pi-harness/scripts/github-sync.sh --crea-repo     # crea il repo privato e fa il primo push
```

Se il repository è già stato creato a mano su GitHub, basta annotare l'URL in
`/root/pi-harness/.github-remote` e lanciare:

```bash
/root/pi-harness/scripts/github-sync.sh
```

---

## 3. Aggiornamenti successivi

```bash
scripts/github-sync.sh                          # registra tutto e pubblica
scripts/github-sync.sh --messaggio "fix streaming chat"
scripts/github-sync.sh --stato                  # situazione locale e remota, senza modifiche
scripts/github-sync.sh --dry-run                # mostra cosa verrebbe pubblicato
```

Il push usa l'header di autorizzazione in modo temporaneo (`http.extraHeader`): il remote resta
l'URL pulito, senza dati di accesso dentro il repository.

### Sincronizzazione automatica (opzionale)

Per pubblicare le modifiche da solo ogni 6 ore:

```bash
install -m 644 scripts/github-sync.service scripts/github-sync.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now github-sync.timer
systemctl list-timers github-sync.timer
```

Per fermarla: `systemctl disable --now github-sync.timer`.
Il timer non è attivo al momento dell'installazione: va abilitato solo se la pubblicazione
automatica è desiderata.

---

## 4. Cosa finisce nel repository

Versionati:

| percorso | contenuto |
|---|---|
| `dashboard.mjs`, `dashboard.html`, `sw.js`, `manifest.webmanifest` | interfaccia web |
| `harness.mjs`, `backup.mjs`, `package.json` | harness da terminale, backup, dipendenze |
| `assets/` | icone e favicon (PWA) |
| `skills/` | skill `bookforge` e `browser` |
| `media/` | script di verifica, documenti di progetto, artefatti prodotti (esclusi upload e log) |
| `docs/` | `ISTANZE.md`, `RICOSTRUZIONE.md`, `SYNC-GITHUB.md` |
| `scripts/` | `backup-export.sh`, `github-sync.sh`, unit del timer |
| `README.md`, `.gitignore` | descrizione generale e regole di esclusione |

**Esclusi** (in `.gitignore`, restano solo sul server):

| percorso | perché |
|---|---|
| `.env`, `.session-secret`, `.github-access`, `.github-remote` | dati riservati |
| `sessions/` | conversazioni con l'agente |
| `backups/` | archivi di `backup.mjs` |
| `media/uploads/`, `media/schedule-logs/`, `*.log` | file caricati e log |
| `node_modules/` | dipendenze reinstallabili con `npm install` |
| `backup_export/` | pacchetto di esportazione locale, contiene copie e `.env` |
| `download/`, `*.tmp`, file di prova | temporanei |

Prima di ogni push il pacchetto di esportazione viene **rigenerato a parte** con
`scripts/backup-export.sh` (non è versionato di proposito: contiene configurazioni riservate).

---

## 5. Rimozione dell'accesso

```bash
rm /root/pi-harness/.github-access     # revoca immediata delle pubblicazioni automatiche
```

La revoca definitiva si fa dal lato GitHub (impostazioni del profilo → revoca del permesso usato).
