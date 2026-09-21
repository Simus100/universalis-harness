#!/usr/bin/env bash
# Backup RIPRISTINABILE di Universalis Harness:
#   istanza principale + clone tester_01 + configurazione di sistema (systemd, Caddy, config di pi).
# Uso:  bash media/backup-completo.sh
# Esito: backups/pi-dashboard-backup-<timestamp>.tar.gz (+ .sha256 e la guida RESTORE.md sciolta)
set -euo pipefail

SRC=/root/pi-harness
CLONE=/root/tester_01
DEST=$SRC/backups
GUIDA=$SRC/media/ripristino-dashboard.md
TS=$(date +%Y%m%d-%H%M%S)
OUT=$DEST/pi-dashboard-backup-$TS.tar.gz
STAGE=$(mktemp -d /tmp/pi-backup-$TS.XXXXXX)

mkdir -p "$DEST"
mkdir -p "$STAGE/istanza" "$STAGE/sistema/systemd" "$STAGE/sistema/caddy" "$STAGE/sistema/pi-config/agent"

echo "[1/6] copia dell'istanza principale ($SRC)"
rsync -a \
  --exclude '/backups/' \
  --exclude '.tail-fix.tmp' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  "$SRC"/ "$STAGE/istanza"/

if [ -d "$CLONE" ]; then
  echo "[2/6] copia del clone ($CLONE)"
  rsync -a --exclude '/backups/' --exclude '__pycache__' --exclude '*.pyc' "$CLONE"/ "$STAGE/clone-tester01"/
else
  echo "[2/6] clone assente: salto"
fi

echo "[3/6] configurazione di sistema (systemd, Caddy, config di pi)"
cp -a /etc/systemd/system/pi-dashboard.service /etc/systemd/system/pi-backup.service \
      /etc/systemd/system/pi-backup.timer "$STAGE/sistema/systemd/" 2>/dev/null || true
[ -f /etc/systemd/system/pi-tester01.service ] && cp -a /etc/systemd/system/pi-tester01.service "$STAGE/sistema/systemd/"
cp -a /etc/caddy/Caddyfile "$STAGE/sistema/caddy/" 2>/dev/null || true
for f in auth.json settings.json models-store.json; do
  [ -f "/root/.pi/agent/$f" ] && cp -a "/root/.pi/agent/$f" "$STAGE/sistema/pi-config/agent/"
done

echo "[4/6] guida di ripristino e manifest"
[ -f "$GUIDA" ] && cp -a "$GUIDA" "$STAGE/RESTORE.md"

{
  echo "Universalis Harness — backup completo"
  echo "creato:        $(date -Is)"
  echo "host:          $(hostname)"
  echo "sistema:       $(. /etc/os-release 2>/dev/null; echo "$PRETTY_NAME")"
  echo "node:          $(/home/linuxbrew/.linuxbrew/bin/node --version 2>/dev/null || node --version) (servizio: /home/linuxbrew/.linuxbrew/bin/node)"
  echo "caddy:         $(caddy version 2>/dev/null | head -1)"
  echo "agent-browser: $(agent-browser --version 2>/dev/null | head -1)"
  echo "python3:       $(python3 --version 2>&1)"
  echo
  echo "=== contenuto ==="
  echo "istanza:       $(find "$STAGE/istanza" -type f | wc -l) file, $(du -sh "$STAGE/istanza" | cut -f1)"
  [ -d "$STAGE/clone-tester01" ] && echo "clone:         $(find "$STAGE/clone-tester01" -type f | wc -l) file, $(du -sh "$STAGE/clone-tester01" | cut -f1)"
  echo "sistema:       $(find "$STAGE/sistema" -type f | wc -l) file"
  echo
  echo "=== file chiave (sha256) ==="
  ( cd "$STAGE" && sha256sum istanza/dashboard.mjs istanza/dashboard.html istanza/.env 2>/dev/null )
  ( cd "$STAGE" && find istanza/skills -name SKILL.md -exec sha256sum {} \; 2>/dev/null | head -20 )
  echo
  echo "=== skill presenti ==="
  find "$STAGE/istanza/skills" -mindepth 1 -maxdepth 1 -type d -printf '  %f\n' | sort
  if [ -d "$STAGE/clone-tester01/skills" ]; then
    printf '  clone: '
    find "$STAGE/clone-tester01/skills" -mindepth 1 -maxdepth 1 -type d -printf '%f '
    printf '\n'
  fi
  echo
  echo "=== chat incluse ==="
  find "$STAGE/istanza/sessions" -maxdepth 1 -name '*.jsonl' -printf '  %f (%s byte)\n' | sort
  echo
  echo "=== servizi systemd inclusi ==="
  ls -1 "$STAGE/sistema/systemd" | sed 's/^/  /'
  echo
  echo "=== ripristino ==="
  echo "  vedi RESTORE.md dentro l'archivio (o $SRC/backups/RESTORE-pi-harness.md)"
} > "$STAGE/MANIFEST.txt"

echo "[5/6] creazione dell'archivio"
tar czf "$OUT" -C "$STAGE" .
sha256sum "$OUT" > "$OUT.sha256"
cp -a "$STAGE/RESTORE.md" "$DEST/RESTORE-pi-harness.md" 2>/dev/null || true

echo "[6/6] pulizia"
rm -rf "$STAGE"

echo
echo "backup pronto:"
ls -lh "$OUT" "$OUT.sha256" | awk '{print "  " $9 "  (" $5 ")"}'
echo "  contenuto: $(tar tzf "$OUT" | wc -l) voci"
echo "  integrità:  sha256sum -c $(basename "$OUT").sha256"
