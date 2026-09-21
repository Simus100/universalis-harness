#!/usr/bin/env bash
# backup-export.sh — genera il pacchetto di export/ripristino in /root/pi-harness/backup_export
#
# Cosa fa:
#   1. fotografia le tre istanze presenti sul server (principale, tester_01, tester_07);
#   2. copia codice, configurazioni, unit systemd, blocco Caddy e guide di ricostruzione;
#   3. esclude chat (sessions/), backup (/), node_modules, upload e log;
#   4. mette i file riservati (*.env, config agente) in CONFIG-RISERVATA/ con permessi 600;
#   5. calcola i checksum (MANIFEST.sha256) per verificare l'integrità del pacchetto.
#
# Uso:
#   scripts/backup-export.sh                    # pacchetto completo (con dati riservati)
#   scripts/backup-export.sh --senza-riservati  # pacchetto condivisibile, senza *.env
#   scripts/backup-export.sh --dest /percorso   # destinazione alternativa
set -euo pipefail

DEST="/root/pi-harness/backup_export"
RISERVATI=1
SRC_MAIN="/root/pi-harness"
SRC_T01="/root/tester_01"
SRC_T07="/home/tester07"
SRC_OSPITI="/root/pi-harness-ospiti"
IMGDIR="/var/lib/tester07"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --senza-riservati) RISERVATI=0; shift ;;
    --dest) DEST="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "opzione sconosciuta: $1" >&2; exit 2 ;;
  esac
done

log() { printf '  %s\n' "$*"; }
title() { printf '\n\033[1m%s\033[0m\n' "$*"; }

# Copia una cartella escludendo stato, chat, pesi morti e riservati.
copia() { # copia <sorgente> <destinazione> [esclusioni extra...]
  local src="$1" dst="$2"; shift 2
  mkdir -p "$dst"
  rsync -a --delete \
    --exclude 'sessions/' \
    --exclude 'backups/' \
    --exclude 'node_modules/' \
    --exclude 'lost+found/' \
    --exclude 'download/' \
    --exclude '*.log' \
    --exclude '*.tmp' \
    --exclude 'uploads/' \
    --exclude 'backup_export/' \
    --exclude '.git/' \
    --exclude '.env' \
    --exclude '.session-secret' \
    --exclude '.pi/' \
    "$@" \
    "$src/" "$dst/"
}

copia_riservati() { # copia <file...> <destinazione>
  local dst="${!#}"
  mkdir -p "$dst"
  chmod 700 "$dst"
  for f in "${@:1:$#-1}"; do
    [[ -e "$f" ]] || continue
    install -m 600 "$f" "$dst/$(basename "$f")"
  done
}

title "Pacchetto di export dell'harness → $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"/{dashboard/{principale,utente-limitato},infra/systemd,infra/caddy,scripts,docs}

# ---------------------------------------------------------------- dashboard
title "1/6  dashboard (le due versioni del codice)"
copia "$SRC_MAIN" "$DEST/dashboard/principale" \
  --include 'dashboard.mjs' --include 'dashboard.html' --include 'sw.js' \
  --include 'manifest.webmanifest' --include 'assets/' \
  --exclude '*'
copia "$SRC_T07" "$DEST/dashboard/utente-limitato" \
  --include 'dashboard.mjs' --include 'dashboard.html' --include 'sw.js' \
  --include 'manifest.webmanifest' --include 'assets/' \
  --exclude '*'
log "principale: $(du -sh "$DEST/dashboard/principale" | cut -f1)  ·  utente limitato: $(du -sh "$DEST/dashboard/utente-limitato" | cut -f1)"
if ! diff -q "$DEST/dashboard/principale/dashboard.mjs" "$DEST/dashboard/utente-limitato/dashboard.mjs" >/dev/null; then
  diff -u "$DEST/dashboard/principale/dashboard.mjs" "$DEST/dashboard/utente-limitato/dashboard.mjs" \
    > "$DEST/dashboard/DIFF-principale-vs-utente-limitato.patch" || true
  log "differenze fra le due versioni salvate in dashboard/DIFF-principale-vs-utente-limitato.patch"
fi

# ------------------------------------------------------- istanza principale
title "2/6  istanza principale (/root/pi-harness, utente pi)"
copia "$SRC_MAIN" "$DEST/istanza-principale"
if [[ $RISERVATI -eq 1 ]]; then
  copia_riservati "$SRC_MAIN/.env" "$DEST/istanza-principale/CONFIG-RISERVATA"
  log "config riservata: .env (permessi 600)"
fi
log "dimensione: $(du -sh "$DEST/istanza-principale" | cut -f1)"

# -------------------------------------------------------- istanza tester_07
title "3/6  sottocliente tester_07 (/home/tester07, utente limitato non-root)"
copia "$SRC_T07" "$DEST/istanza-tester_07" --exclude 'piccolo.bin'
if [[ $RISERVATI -eq 1 ]]; then
  copia_riservati "$SRC_T07/.env" "$SRC_T07/.password-provvisoria" \
    "$IMGDIR/agent/settings.json" "$IMGDIR/agent/auth.json" \
    "$DEST/istanza-tester_07/CONFIG-RISERVATA"
  log "config riservata: .env, password provvisoria, settings.json, auth.json"
fi
# config agente fuori dal disco da 300 MB (senza i 92 MB di bin/npm/cache)
mkdir -p "$DEST/istanza-tester_07/agent-config-esterna"
for f in settings.json models-store.json; do
  [[ -f "$IMGDIR/agent/$f" ]] && install -m 600 "$IMGDIR/agent/$f" "$DEST/istanza-tester_07/agent-config-esterna/$f"
done
log "dimensione: $(du -sh "$DEST/istanza-tester_07" | cut -f1)"

# -------------------------------------------------------- istanza tester_01
title "4/6  clone di prova tester_01 (/root/tester_01)"
copia "$SRC_T01" "$DEST/istanza-tester_01" --exclude 'media/'
[[ -d "$SRC_T01/media" ]] && mkdir -p "$DEST/istanza-tester_01/media" && \
  rsync -a --exclude 'uploads/' --exclude '*.log' \
    "$SRC_T01/media/goals.json" "$SRC_T01/media/schedules.json" \
    "$SRC_T01/media/ask-prefs.json" "$SRC_T01/media/browser-prefs.json" \
    "$DEST/istanza-tester_01/media/" 2>/dev/null || true
if [[ $RISERVATI -eq 1 ]]; then
  copia_riservati "$SRC_T01/.env" "$DEST/istanza-tester_01/CONFIG-RISERVATA"
fi
log "dimensione: $(du -sh "$DEST/istanza-tester_01" | cut -f1)"

# ------------------------------------------------------------------- infra
title "5/6  infrastruttura (systemd, Caddy, fstab, istanza ospiti non attiva)"
for u in pi-dashboard.service pi-tester01.service pi-tester07.service pi-backup.service pi-backup.timer; do
  [[ -f "/etc/systemd/system/$u" ]] && install -m 644 "/etc/systemd/system/$u" "$DEST/infra/systemd/$u"
done
[[ -f /etc/caddy/Caddyfile ]] && install -m 644 /etc/caddy/Caddyfile "$DEST/infra/caddy/Caddyfile"
grep -h 'tester07' /etc/fstab > "$DEST/infra/fstab.tester07.txt" 2>/dev/null || true
if [[ -d "$SRC_OSPITI" ]]; then
  copia "$SRC_OSPITI" "$DEST/infra/ospiti-non-attiva"
  log "inclusa la cartella ospiti (scheletro, non attiva)"
fi
cp -a /root/pi-harness/scripts/*.sh "$DEST/scripts/" 2>/dev/null || true
cp -a /root/pi-harness/docs/. "$DEST/docs/" 2>/dev/null || true
log "unit: $(ls "$DEST/infra/systemd" | tr '\n' ' ')"

# -------------------------------------------------------------- inventario
title "6/6  inventario, guida del pacchetto e checksum"

cat > "$DEST/LEGGIMI.md" <<'GUIDA'
# Pacchetto di esportazione dell'harness (backup_export)

Copia completa e ricostruibile delle tre istanze dell'harness pi presenti sul server, più le
istruzioni per rimetterle in piedi. Generato da `scripts/backup-export.sh`: non modificare a mano,
rigeneralo con quello script.

## Cosa contiene

| cartella | contenuto |
|---|---|
| `dashboard/principale/` | dashboard di produzione (`dashboard.mjs`, `dashboard.html`, PWA, assets) |
| `dashboard/utente-limitato/` | variante per l'utente esterno, con quota disco e blocco modello/thinking |
| `dashboard/DIFF-*.patch` | differenze fra le due versioni del codice |
| `istanza-principale/` | istanza di produzione: codice, skills, media, configurazioni |
| `istanza-tester_07/` | sottocliente limitato: istanza, unit, config agente esterna |
| `istanza-tester_01/` | clone di prova (senza la cartella `media/`) |
| `infra/` | unit systemd, blocco Caddy, riga di fstab, scheletro dell'istanza ospiti |
| `docs/` | `RICOSTRUZIONE.md` (guida passo-passo), `ISTANZE.md`, `SYNC-GITHUB.md` |
| `scripts/` | `backup-export.sh`, `github-sync.sh` e le unit del timer di sincronizzazione |
| `CONFIG-RISERVATA/` | (in ogni istanza) `.env` e configurazione agente, permessi `600` |
| `INVENTARIO.md` | dimensioni e data di generazione |
| `MANIFEST.sha256` | impronta di ogni file, per verificare l'integrità |

Esclusi di proposito: `sessions/` (conversazioni), `backups/`, `node_modules/`,
`media/uploads/`, i log e i file temporanei.

## Verificare l'integrità

```bash
tar -tzf backup_export.tar.gz >/dev/null && echo archivio leggibile
cd backup_export && sha256sum -c MANIFEST.sha256 --quiet && echo OK
```

## Ricostruire un'istanza su un server nuovo

1. leggi `docs/RICOSTRUZIONE.md` (prerequisiti, unit systemd, Caddy, sandbox, quota);
2. copia la cartella dell'istanza che serve (es. `istanza-tester_07/`) nella destinazione finale;
3. ripristina `CONFIG-RISERVATA/.env` come `.env` nella radice dell'istanza (`chmod 600`);
4. installa le unit da `infra/systemd/` e il blocco Caddy da `infra/caddy/Caddyfile`;
5. per tester_07: ricrea utente di sistema, disco loop (`infra/fstab.tester07.txt`) e config
   agente esterna, come descritto nei paragrafi 4.1-4.6 della guida;
6. `npm install` per le dipendenze, poi `systemctl enable --now <unit>`;
7. verifica con gli smoke test del paragrafo 6 della guida.

## Dati riservati

I file in `CONFIG-RISERVATA/` contengono password delle istanze e chiavi dei provider:
tengono permessi `600`, non vanno pubblicati né copiati in un repository. Il codice va invece
nel repository git (`docs/SYNC-GITHUB.md`); questo pacchetto è escluso dal versionamento.

Per generare una variante condivisibile, senza dati riservati:

```bash
scripts/backup-export.sh --senza-riservati --dest /root/export-condivisibile
```
GUIDA

{
  echo "# Contenuto del pacchetto"
  echo
  echo "Generato: $(date -Iseconds) — host: $(hostname) — kernel: $(uname -r)"
  echo
  echo "| percorso | dimensione |"
  echo "|---|---|"
  for d in dashboard istanza-principale istanza-tester_07 istanza-tester_01 infra scripts docs; do
    [[ -e "$DEST/$d" ]] && echo "| $d/ | $(du -sh "$DEST/$d" | cut -f1) |"
  done
  echo
  echo "Nessun contenuto di: sessions/ (chat), backups/, node_modules/, media/uploads/, log."
} > "$DEST/INVENTARIO.md"

( cd "$DEST" && find . -type f ! -name MANIFEST.sha256 -print0 \
  | sort -z | xargs -0 sha256sum > MANIFEST.sha256 )
log "$(wc -l < "$DEST/MANIFEST.sha256") file con checksum in MANIFEST.sha256"

printf '\n\033[1mFatto.\033[0m Totale: %s — %s file\n' \
  "$(du -sh "$DEST" | cut -f1)" "$(find "$DEST" -type f | wc -l)"
echo "Verifica integrità:  cd $DEST && sha256sum -c MANIFEST.sha256 --quiet && echo OK"
[[ $RISERVATI -eq 1 ]] && echo "Contiene dati riservati (*.env, config agente): NON pubblicarlo e NON copiarlo nel repo git."
