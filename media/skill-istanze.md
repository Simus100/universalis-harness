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
bash scripts/skills-sync-istanze.sh --applica  # backup, copia, chown, verifica per istanza
bash scripts/skills-sync-istanze.sh --applica /home/tester07   # una sola istanza
```

**Prudenza incorporata:** lo script si astiene dalle istanze con `HOME=/root` (`pi-harness`,
`tester_01`). Lì le stesse skill sono già raggiungibili via symlink da `/root/.agents/skills` e
una copia reale in `skills/` produrrebbe una **collisione di nome** (è il problema risolto in
`media/tool-skill-collisioni.md`).

Va rilanciato dopo aver modificato o aggiunto una skill in `pi-harness`, perché le altre istanze
non la vedono da sole.

## Limite aperto: REA non è utilizzabile dagli utenti non-root

`rea-cli` è stata copiata anche a `tester07`/`tester08`, e il comando `rea` è eseguibile da tutti
(`/usr/local/bin/rea`), ma **gli engine di analisi stanno sotto `/root`**
(`/root/rea-tools/ghidra_12.1.4_PUBLIC`, il venv di pwntools, WABT) e `/root` non è leggibile dagli
utenti: per loro `rea` funziona solo per le parti che non richiedono un engine (per esempio
l'analisi statica JavaScript/Electron), mentre pseudocodice e layout binario falliscono col
provider non disponibile. Per renderlo pienamente utilizzabile servirebbe spostare gli engine in
una posizione leggibile (per esempio `/opt/rea-tools`) e aggiornare di conseguenza il wrapper
`/usr/local/bin/rea` — decisione rimandata all'utente, perché espone Ghidra a tutti gli account
della macchina.
