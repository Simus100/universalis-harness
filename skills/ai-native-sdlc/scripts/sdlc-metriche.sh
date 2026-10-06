#!/usr/bin/env bash
# Metriche del processo (leading/lagging) lette dalla storia di Git.
# Con una cartella intent/ popolata: latenze fra artefatti e rework dei requisiti.
# Senza intent/: attività per giorno e quota di commit di correzione (indicatore grezzo).
#
# Uso:  bash skills/ai-native-sdlc/scripts/sdlc-metriche.sh [commit] [cartella-intent]
#       bash skills/ai-native-sdlc/scripts/sdlc-metriche.sh 200
set -uo pipefail

n=${1:-500}
dir=${2:-intent}

root=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "Non è un repository Git: nessuna metrica disponibile." >&2; exit 1; }
cd "$root" || exit 1

tot=$(git rev-list --count HEAD 2>/dev/null || echo 0)
[ "$tot" -eq 0 ] && { echo "Repository senza commit: niente da misurare." ; exit 0; }
[ "$n" -gt "$tot" ] && n=$tot

primo() { git log -n "$n" --diff-filter=A --format=%ct -- "$1" 2>/dev/null | tail -1; }
ore() { if [ -n "$1" ] && [ -n "$2" ]; then echo $(( ($2 - $1) / 3600 )); else echo "-"; fi; }

if [ -d "$dir" ] && compgen -G "$dir/*/" >/dev/null 2>&1; then
  echo "Cambiamenti in $dir/ (latenze in ore, '-' = artefatto assente)"
  printf "%-34s %9s %9s %9s %11s\n" "cambiamento" "int→spec" "spec→plan" "plan→fine" "rework-spec"
  for d in "$dir"/*/; do
    d=${d%/}
    i=$(primo "$d/intent.md"); s=$(primo "$d/spec.md"); p=$(primo "$d/plan.md")
    [ -z "$i" ] && i=$(primo "$d")
    u=$(git log -n "$n" --format=%ct -- "$d" | head -1)
    rw="-"
    if [ -n "$p" ]; then
      # quante volte spec.md e' stato riscritto dopo il commit di plan.md
      rw=$(git log -n "$n" --format=%ct -- "$d/spec.md" 2>/dev/null | awk -v p="$p" '$1 > p' | wc -l)
    fi
    printf "%-34s %9s %9s %9s %11s\n" "$(basename "$d")" "$(ore "$i" "$s")" "$(ore "$s" "$p")" "$(ore "$p" "$u")" "$rw"
  done
  echo
  echo "int→spec / spec→plan: ore fra i commit di creazione degli artefatti."
  echo "plan→fine: ore dal piano all'ultimo commit del cambiamento."
  echo "rework-spec: riscritture di spec.md dopo il piano approvato (0 è l'obiettivo)."
else
  echo "Nessuna cartella intent/: metriche di attività sugli ultimi $n commit."
  echo
  echo "Commit per giorno (ultimi 10 giorni attivi):"
  git log -n "$n" --date=short --format=%ad | sort | uniq -c | tail -10 | awk '{printf "  %s  %s\n", $2, $1}'
  echo
  feat=$(git log -n "$n" --format=%s | grep -Eci '^(feat|add|new)' || true)
  # euristica sul messaggio: prefissi fix/hotfix/revert e verbi di correzione in italiano
  fix=$(git log -n "$n" --format=%s | grep -Eci '^(fix|hotfix|revert)|\)?: *fix |correggi|corrett|ripristin|risolv|sistem|ripar' || true)
  altro=$(( n - feat - fix ))
  echo "Tipi di commit (euristica sul messaggio):  nuove funzioni=$feat  correzioni=$fix  altro=$altro"
  if [ "$n" -gt 0 ]; then
    awk -v f="$fix" -v t="$n" 'BEGIN{printf "Quota di correzioni: %.0f%%  (indicatore grezzo di rework)\n", 100*f/t}'
  fi
  echo
  echo "Quando esistono intent/, spec.md e plan.md, qui compaiono le latenze fra gli artefatti."
fi
