#!/usr/bin/env bash
# Spazio di lavoro delle istanze dei tester: misura, propone, (solo su richiesta) libera.
#
# Politica decisa dall'utente (2026-10-12):
#   - il filesystem della home dei tester (948 MB) È il loro spazio di lavoro e deve bastare;
#   - non si usa la cartella tecnica /var/lib/testerXX/agent per i risultati dei lavori;
#   - quando lo spazio finisce NON si cancella nulla da soli: si avvisa l'utente, che decide
#     cosa cancellare. L'agente libera solo su richiesta esplicita, e solo cose rigenerabili.
#
# Uso:
#   bash scripts/spazio-tester.sh                 # stato + candidati alla cancellazione
#   bash scripts/spazio-tester.sh --istanza tester08
#   bash scripts/spazio-tester.sh --pulisci       # elimina SOLO i rigenerabili elencati
#   bash scripts/spazio-tester.sh --pulisci --istanza tester08
#
# Non vengono MAI considerati cancellabili: skills/, sessions/, backups/, media/ (i file
# dell'utente), dashboard.*, .env, .agents/, .claude/ e in generale i file caricati o creati
# dall'utente. Solo: renders/, node_modules/, .cache/, *.log e cartelle di prova.

set -uo pipefail

ISTANZE=(/home/tester07 /home/tester08)
PULISCI=0
i=0
for a in "$@"; do
  case "$a" in
    --pulisci) PULISCI=1 ;;
    --istanza) ;;
    --istanza=*) ISTANZE=("/home/${a#--istanza=}") ;;
    *) if [[ "${1:-}" == "--istanza" ]]; then ISTANZE=("/home/$a"); fi ;;
  esac
done
# supporto semplice: --istanza <nome>
prev=""
for a in "$@"; do
  if [[ "$prev" == "--istanza" ]]; then ISTANZE=("/home/$a"); fi
  prev="$a"
done

soglia_avviso=85   # % di occupazione sopra cui si avvisa l'utente
rigenerabili() {
  local home="$1"
  find "$home" -maxdepth 3 \( \
      -type d \( -name renders -o -name node_modules -o -name .cache \) -o \
      -type f \( -name "*.log" -o -name "*.mp4" -o -name "*.tmp" \) \
    \) -prune 2>/dev/null |
  while read -r p; do
    case "$p" in
      "$home/skills"*|"$home/sessions"*|"$home/backups"*|"$home/media"*|"$home/.agents"*|"$home/.claude"*) continue ;;
    esac
    printf '%s\n' "$p"
  done
}

for home in "${ISTANZE[@]}"; do
  [ -d "$home" ] || { echo "— $home non esiste, salto"; continue; }
  utente="$(stat -c %U "$home")"
  read -r size usato libero perc < <(df -h "$home" | tail -1 | awk '{print $2, $3, $4, $5}')
  echo "=== $home (utente $utente)"
  echo "    spazio: $size · usato $usato · libero $libero ($perc)"

  echo "    voci più grosse dentro il GB:"
  du -sh "$home"/* "$home"/.[a-z]* 2>/dev/null | sort -rh | head -6 | sed 's/^/      /'

  cand="$(rigenerabili "$home")"
  if [ -n "$cand" ]; then
    echo "    candidati alla cancellazione (rigenerabili, non toccati ora):"
    while read -r p; do
      [ -e "$p" ] || continue
      printf "      %s  %s\n" "$(du -sh "$p" 2>/dev/null | cut -f1)" "${p#$home/}"
    done <<< "$cand"
  else
    echo "    nessun candidato rigenerabile"
  fi

  occ="${perc%\%}"
  if [ "$occ" -ge "$soglia_avviso" ]; then
    echo "    ⚠ ATTENZIONE: occupazione ${perc} ≥ soglia ${soglia_avviso}% — avvisa l'utente e chiedi cosa"
    echo "      cancellare: NON liberare nulla da soli."
  fi

  if [ "$PULISCI" -eq 1 ] && [ -n "$cand" ]; then
    echo "    --pulisci: rimuovo solo i rigenerabili elencati"
    while read -r p; do
      [ -e "$p" ] || continue
      rm -rf "$p" && echo "      rimosso ${p#$home/}"
    done <<< "$cand"
    read -r _ _ libero2 perc2 < <(df -h "$home" | tail -1 | awk '{print $2, $3, $4, $5}')
    echo "    ora: libero $libero2 ($perc2)"
  fi
  echo
done
