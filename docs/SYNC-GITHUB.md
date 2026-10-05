# Sincronizzazione con GitHub

Il codice di questo harness è versionato in un repository GitHub **pubblico**
(`universalis-harness`). Questo documento spiega cosa viene pubblicato, cosa resta fuori e come
aggiornare il repository.

## 0. Stato del collegamento

| | |
|---|---|
| repository | https://github.com/Simus100/universalis-harness — **pubblico dal 2026-09-27** |
| cosa implica | tutto ciò che è committato (e tutto ciò che è già nella **storia**, anche se poi rimosso) è leggibile da chiunque: mai dati personali o di terzi, mai segreti; il controllo di `scripts/sync-fine-lavoro.sh` esiste per questo |
| proprietario | `Simus100` |
| primo caricamento | 2026-09-21, branch `main` (246 file) |
| ultimo aggiornamento | **2026-09-27**, poi reso **pubblico** lo stesso giorno su richiesta del proprietario |
| remote locale | `origin` → `https://github.com/Simus100/universalis-harness.git` |
| verifica rapida | `scripts/github-sync.sh --stato` · `curl -sH "Authorization: Bearer $TOKEN" https://api.github.com/repos/Simus100/universalis-harness/commits/main` |

Nel repository **non** sono presenti `.env`, `.session-secret`, `sessions/`, `backups/`,
`node_modules/`, upload, log né il pacchetto `backup_export/` (verificato via API: tutti `404`).
Anche con il repository pubblico questi file restano esclusi: sono in `.gitignore`.
Dal 2026-09-27 sono esclusi anche, per scelta esplicita, i **documenti con dati personali di
terzi** (nel `media/` di questa istanza: un estratto di Certificazione Unica con codice fiscale,
escluso con il pattern `media/CU2026_*_estratto.txt`) e gli esiti di errore delle API di
generazione immagini (`media/out_gemini-*.json`).
Il documento è escluso anche dalla **memoria** (`media/memoria/`), perché il motore legge il
`.gitignore` e lo applica: una sola dichiarazione di cosa non deve uscire, per il repository e
per il contesto che finisce nel modello.
Quei file restano solo sul server: una volta in un commit resterebbero nella storia del
repository anche dopo una rimozione.

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
| **classico** (https://github.com/settings/tokens/new) | scope **`repo`** | percorso più semplice: crea il repository **e** pubblica; consente anche di cambiare la visibilità (`PATCH /repos` con `{"private": false}`) |
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

### In coda a una sessione di lavoro (modo consigliato)

Il timer di sincronizzazione **non è attivo**: la pubblicazione è manuale. Perché non dipenda
dal fatto che qualcuno si ricordi, una sessione di lavoro che ha modificato codice o
documentazione **si chiude con**:

```bash
bash scripts/sync-fine-lavoro.sh "messaggio breve del lavoro"
bash scripts/sync-fine-lavoro.sh --anteprima "messaggio"     # solo controllo + anteprima
```

Cosa fa, nell'ordine:

1. **controllo di sicurezza**: se nell'elenco di ciò che verrebbe pubblicato compare qualcosa di
   riservato (`.env`, segreti, `sessions/`, `backups/`, upload, `CU2026…`, `out_gemini-*.json`)
   **aborta con codice 2 senza committare** — un controllo che fallisce deve fermare tutto, non
   pubblicare a metà (una volta in un commit, un file resta nella storia);
2. anteprima (numero di file e dimensione);
3. registra e pubblica, delegando il push a `scripts/github-sync.sh`;
4. **verifica** che locale e remoto coincidano, leggendo l'ultimo commit da GitHub.

Se un file finisce nell'elenco pur essendo legittimo, la strada è una riga in `.gitignore` **col
motivo** (esempio: i documenti con dati personali di terzi). `--forza` salta il controllo ed è
esplicitamente sconsigliato.

La stessa indicazione è nella **nota di sistema dell'agente** (`SYSTEM_MEDIA_NOTE` in
`dashboard.mjs`): la sessione la legge, quindi il sync a fine lavoro non dipende dalla memoria di
chi scrive. Le istanze `tester_01`/`tester_07` hanno copie **non versionate**: lì il sync non si
applica (il loro codice si allinea con il metodo descritto in `docs/ISTANZE.md`).

Non serve per lavori che non hanno toccato file versionati (domande, analisi, sola lettura): in
quel caso lo script stesso risponde «niente da pubblicare».

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
