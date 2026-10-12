# Skill e istanze dell'harness: chi vede cosa

Data: **2026-10-12** · Stato: **allineate e verificate su quattro istanze**

---

## La domanda da cui nasce questo documento

«Queste skill sono accessibili da tutte le istanze?» — **No, e non lo erano nemmeno
prima.** Ogni istanza ha la **propria** cartella `skills/` e la **propria** `HOME`, e pi carica le
skill globali da `$HOME/.agents/skills` e da `$agentDir/skills`: due istanze con `HOME` diverso
**non condividono nessuna cartella di skill**.

## La mappa reale (verificata su `/proc/<pid>/environ` e sui servizi systemd)

| Istanza | servizio | utente | `HOME` | `agentDir` | cartella skill | skill caricate |
|---|---|---|---|---|---|---|
| `pi-harness` (:8420) | `pi-dashboard` | root | `/root` | `/root/.pi/agent` | `/root/pi-harness/skills` | **26** |
| `tester_01` (:8421) | `pi-tester01` | root | `/root` | `/root/.pi/agent` | `/root/tester_01/skills` | **19** |
| `tester07` | `pi-tester07` | tester07 | `/home/tester07` | `/var/lib/tester07/agent` | `/home/tester07/skills` | **25** |
| `tester08` (:8423) | `pi-tester08` | tester08 | `/home/tester08` | `/var/lib/tester08/agent` | `/home/tester08/skills` | **25** |

Perché i numeri differiscono: `pi-harness` ha le 25 skill in `skills/` più
`reverse-engineer-anything` (di REA) che sta solo nella sua globale. `tester_01` ha 19 = le sue 8
locali più 10 HyperFrames/HeyGen raggiunte via **symlink** da `/root/.agents/skills` più la sua
globale. `tester07`/`tester08` hanno 25 = le loro copie locali, nessuna globale.

## Perché a tester07/tester08 non bastava un symlink

Girano come utenti non-root e `/root` è `drwx------`: **non possono leggere**
`/root/pi-harness/skills` (verificato: permesso negato). Un symlink verso la mia copia sarebbe
stato invisibile per loro. L'unica strada è una copia dentro la loro cartella.

## Cosa è stato fatto

1. **Copiate** le 18 skill mancanti in ciascuna delle due istanze (i 9 `hyperframes*`,
   `media-use`, `video`, `rea-cli`, `giochi`, `decision-m`, `motion-graphics`,
   `faceless-explainer`, `general-video`, `product-launch-video`).
2. **Aggiornate** le 2 skill che avevano versioni più vecchie: `immagini` (a loro mancava tutta la
   parte sui documenti PDF) e `memoria` (una frase in meno sull'archiviazione delle chat). Le
   versioni sostituite sono nel backup.
3. **Proprietà** assegnata agli utenti (`tester07:tester07`, `tester08:tester08`): la loro
   dashboard deve poter modificare le proprie skill.
4. Backup in `/root/harness-skills-backup-20261012-211750/`.

## Verifica

`node media/test-skill-collisioni.mjs` è ora **parametrico** (legge `DASH_SKILLS_DIR`, `HOME` e
l'agentDir correnti), quindi verifica qualsiasi istanza:

```bash
# istanza corrente
node media/test-skill-collisioni.mjs

# un'altra istanza, con il suo ambiente reale
HOME=/home/tester08 PI_CODING_AGENT_DIR=/var/lib/tester08/agent \
DASH_SKILLS_DIR=/home/tester08/skills node media/test-skill-collisioni.mjs
```

Esito sulle quattro istanze: **26 / 19 / 25 / 25 skill, zero collisioni**. Il test è stato
corretto durante il lavoro: segnalava i symlink di `/root/.agents/skills` come «fuori da skills/»
quando a controllare era `tester_01` (per cui quei symlink puntano a un'altra istanza): la regola
giusta è che un symlink è valido se porta a una skill con `SKILL.md`, ovunque sia.

Le istanze ricaricano da sole: la dashboard osserva con un watcher la propria `skills/` e ricarica
quando cambia, quindi le nuove skill diventano attive senza riavvio (entro il controllo periodico,
60 s).

## Manutenzione: `scripts/skills-sync-istanze.sh`

```bash
bash scripts/skills-sync-istanze.sh            # anteprima: mancanti e diverse per ogni istanza
bash scripts/skills-sync-istanze.sh --applica  # backup, copia, chown, relink, verifica
bash scripts/skills-sync-istanze.sh --applica /home/tester07   # una sola istanza
```

Oltre a copiare le skill mancanti e aggiornare quelle vecchie, `--applica` **riporta a symlink**
le copie reali che stanno nelle cartelle globali dell'istanza (`~/.agents/skills`,
`~/.claude/skills`): servono, perché `npx hyperframes init` e `skills update` le reinstallano lì e
una copia reale con lo stesso nome di quella in `skills/` produce una collisione.

**Prudenza incorporata:** lo script si astiene dalle istanze con `HOME=/root` (`pi-harness`,
`tester_01`). Lì le stesse skill sono già raggiungibili via symlink da `/root/.agents/skills` e
una copia reale in `skills/` produrrebbe una **collisione di nome** (è il problema risolto in
`media/tool-skill-collisioni.md`).

Va rilanciato dopo aver modificato o aggiunto una skill in `pi-harness`, perché le altre istanze
non la vedono da sole.

## Risorse condivise: cosa serve perché HyperFrames e REA funzionino su tutte le istanze

Le skill da sole non bastano: servono la CLI, gli engine e il browser. Stato attuale
(verificato su `tester07` e `tester08` come utenti reali):

| Risorsa | Dove | Perché è condivisa |
|---|---|---|
| CLI HyperFrames | `/usr/bin/hyperframes` (0.8.150, npm globale) | accessibile a tutti, nessun `npx` che riscarica |
| FFmpeg / FFprobe | `/usr/bin/ffmpeg`, `/usr/bin/ffprobe` | pacchetti di sistema |
| Chrome Headless Shell | `/opt/hyperframes-chrome` | 261 MB; ogni utente ha un **symlink** in `~/.cache/hyperframes/chrome` |
| Engine di REA (Ghidra 12.1.4, pwntools, WABT) | `/opt/rea-tools` | leggibili da tutti; il wrapper `/usr/local/bin/rea` li imposta |
| Skill | `skills/` di ogni istanza (+ symlink nelle sue globali) | una copia fisica per istanza |

**Perché `/opt` e non `/root`.** `/root` è `drwx------`: gli utenti non-root non possono
attraversarlo, quindi né Ghidra né il Chrome dell'istanza di root erano utilizzabili da loro.
Spostare gli engine in `/opt` e il Chrome in `/opt/hyperframes-chrome` (con symlink per utente) è
ciò che li rende disponibili a tutti.

**Prove eseguite come utente reale** (`sudo -u tester08` / `tester07`, con `HOME` e `PATH` loro):

- REA: `rea decompile /opt/rea-tools/targets/native/pwcheck validate_token --json` → pseudocodice
  con `s3cr3t-token-value`; `inspect-binary-layout` → provider `pwntools-elf` attivo.
- HyperFrames: `hyperframes init hf-test --non-interactive` + `hyperframes render --quality draft`
  → MP4 di 10 s (300 frame) prodotto in ~29-31 s, con Chrome Headless Shell e FFmpeg di sistema.

## Le home degli utenti: filesystem limitati, e come si ingrandiscono

`/home/tester07` e `/home/tester08` **non stanno sulla partizione grande**: sono due filesystem
ext4 dentro file immagine (`/var/lib/tester07/disk.img`, `/var/lib/tester08/disk.img`), montati
come `/dev/loop0` e `/dev/loop1`. Erano da **322 MB** — e la copia del Chrome (261 MB) li aveva
portati al 100%, bloccando il primo render tentato dentro la home (`Low disk space — 0.0 GB free`).

**Stato attuale (2026-10-12): 948 MB per home**, 924 MB e 875 MB liberi. Ingrandimento eseguito con
backup preventivo in `/root/home-backup-20261012-213220/`, senza riavviare le istanze:

```bash
truncate -s 1G /var/lib/testerXX/disk.img   # cresce il file immagine
losetup -c /dev/loopX                       # il loop device riconosce la nuova dimensione
resize2fs /dev/loopX                        # ext4 cresce ONLINE, a filesystem montato
```

È un'operazione di **sola crescita**: non tocca i dati, non richiede unmount né riavvio, e lo spazio
su disco lo occupano solo i blocchi effettivamente scritti (i file immagine sono sparsi). Lo spazio
reale disponibile è quello di `/` (193 GB, 170 GB liberi). Per ingrandire ancora: ripetere gli
stessi tre comandi con la nuova dimensione (nel file immagine e nel loop device).

Restano valide le prassi che tengono fuori dalla home ciò che è grosso:

- **Il GB della home è lo spazio di lavoro dei tester e deve bastare.** I risultati dei lavori
  (video, export, dataset) si producono lì, non nella cartella tecnica `/var/lib/testerXX/agent`
  (che è del motore: cache npm, credenziali, binari) e **non** in `/var/tmp`, che nel loro servizio
  con `PrivateTmp=yes` è una cartella privata ed effimera.
- **Quando lo spazio finisce non si cancella nulla da soli.** L'agente controlla lo spazio prima di
  un lavoro pesante; sopra l'85% di occupazione si ferma, avvisa l'utente con i numeri e la lista
  dei candidati (rigenerabili: `renders/`, `node_modules/`, `.cache/`, `*.log`, cartelle di prova) e
  attende la sua decisione. Mai toccati: chat/`sessions/`, `media/`, `backups/`, `skills/`,
  `dashboard.*`, `.env`, i file caricati dall'utente. Diagnosi e pulizia su richiesta:
  `bash scripts/spazio-tester.sh` (e `--pulisci`, che rimuove solo i rigenerabili).
- La regola per gli agenti è nella skill **`spazio-di-lavoro`** (sincronizzata su tutte le istanze);
- **cache e browser condivisi restano in `/opt`**: engine di REA e Chrome Headless Shell sono in
  sola lettura per gli utenti, che li usano ma non li modificano;
- quando si crea un progetto con `hyperframes init` conviene `HYPERFRAMES_SKIP_SKILLS=1` per non
  reinstallare le skill in `~/.agents/skills` (altrimenti: `bash scripts/skills-sync-istanze.sh
  --applica` rimette i symlink).

## Cosa possono vedere e dove possono scrivere i tester

Le due istanze dei tester girano con un servizio systemd **confinato**: `User=testerXX`,
`ProtectSystem=strict` (tutto il sistema in sola lettura), `ProtectHome=read-only`,
`ReadWritePaths=/home/testerXX /var/lib/testerXX/agent`, `PrivateTmp=yes`, `NoNewPrivileges=yes`.

| | tester07 / tester08 |
|---|---|
| **Scrivono** | solo la loro home (948 MB, il loro spazio di lavoro) e `/var/lib/testerXX/agent` (area tecnica del motore, non per i risultati) |
| **Leggono** | la loro home, `/usr`, `/etc`, `/opt` (Chrome e Ghidra condivisi) |
| **Non vedono** | `/root` (né il codice di pi-harness), la home dell'altro tester, `/usr/bin` e `/etc` in scrittura |
| **File manager della dashboard** | confinato in `DASH_ROOT=/home/testerXX`: ogni percorso fuori risponde 403, anche attraverso un symlink |

Le cartelle dei loro dati sono tutte dentro la home (`DASH_MEDIA_DIR`, `DASH_SESSION_DIR`,
`DASH_BACKUP_DIR`, `DASH_SKILLS_DIR` = `/home/testerXX/...`), quindi ciò che l'utente vede dalla
dashboard è esattamente il suo spazio; la cartella grande serve per i lavori che non devono
consumare quell'armadietto.

## Nota di percorso

Le istanze che girano con `HOME=/root` (`pi-harness`, `tester_01`) **condividono** le globali di
root: per loro vale la soluzione a symlink descritta in `media/tool-skill-collisioni.md`. Le
istanze con home propria (`tester07`, `tester08`) hanno invece una copia fisica ciascuna in
`skills/` e i symlink solo nelle **loro** globali.
