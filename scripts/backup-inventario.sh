#!/usr/bin/env bash
# backup-inventario.sh — rigenera backups/INVENTARIO.md (fotografia leggibile della cartella unica).
#
# Uso:
#   scripts/backup-inventario.sh           # riscrive backups/INVENTARIO.md
#   scripts/backup-inventario.sh --stdout  # stampa soltanto
#
# È idempotente e leggero (nessuna scansione dei contenuti): legge dimensione, numero di file e
# data di modifica di ogni voce. Non modifica né sposta nulla.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
B="$HARNESS_DIR/backups"
OUT="$B/INVENTARIO.md"
DATA="$(date '+%Y-%m-%d %H:%M')"

human() { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "$1 B"; }
riga() { # riga <percorso> <etichetta>
  local p="$1" nome="$2" byte file quando
  [[ -e "$p" ]] || return 0
  byte=$(du -sb "$p" 2>/dev/null | cut -f1)
  file=$(find "$p" -type f 2>/dev/null | wc -l)
  quando=$(date -r "$p" '+%Y-%m-%d' 2>/dev/null)
  printf '| `%s` | %s | %s | %s |\n' "$nome" "$(human "${byte:-0}")" "$file" "$quando"
}

scrivi() {
  echo "# Inventario dei backup — \`/root/pi-harness/backups\`"
  echo
  echo "Generato da \`scripts/backup-inventario.sh\` il **$DATA**. Non modificare a mano: rilancia lo script."
  echo "Le regole della cartella (cosa va dove) stanno in \`LEGGIMI.md\`."
  echo
  echo "## Categorie"
  echo
  echo "| cartella | dimensione | file | ultima modifica |"
  echo "|---|---|---|---|"
  for d in automatici istanza per-funzione configurazione export tester scarti; do
    riga "$B/$d" "$d/"
  done
  echo
  if [[ -d "$B/automatici" ]]; then
    local n primo ultimo
    n=$(find "$B/automatici" -maxdepth 1 -name 'pi-harness-*.tar.gz' | wc -l)
    primo=$(find "$B/automatici" -maxdepth 1 -name 'pi-harness-*.tar.gz' -printf '%f\n' | sort | head -1)
    ultimo=$(find "$B/automatici" -maxdepth 1 -name 'pi-harness-*.tar.gz' -printf '%f\n' | sort | tail -1)
    echo "## Archivio automatico"
    echo
    echo "- archivi presenti: **$n** (retention \`DASH_BACKUP_KEEP_DAYS\`, minimo \`DASH_BACKUP_KEEP_MIN\`)"
    echo "- più vecchio: \`${primo:-—}\`"
    echo "- più recente: \`${ultimo:-—}\`"
    echo "- creati da \`backup.mjs\` (timer \`pi-backup.timer\`, ogni giorno alle 04:15)"
    echo
  fi
  echo "## Backup manuali, per cartella"
  echo
  echo "| cartella | dimensione | file | ultima modifica |"
  echo "|---|---|---|---|"
  for d in "$B"/per-funzione/*/ "$B"/istanza/*/ "$B"/tester/tester*/ "$B"/configurazione/*/ "$B"/export/storico/; do
    [[ -d "$d" ]] || continue
    riga "$d" "${d#"$B"/}"
  done
  echo
  echo "## File singoli in radice"
  echo
  find "$B" -maxdepth 1 -type f ! -name INVENTARIO.md -printf '- `%f` (%s byte, %TY-%Tm-%Td)\n' | sort
}

if [[ "${1:-}" == "--stdout" ]]; then scrivi; else scrivi >"$OUT"; echo "scritto $OUT"; fi
