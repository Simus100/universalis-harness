#!/usr/bin/env bash
# Icone vere da Iconify, senza installare niente: solo curl.
# Uso:
#   icone.sh cerca "trash" [--prefix lucide] [--limit 20]
#   icone.sh prendi lucide:trash-2 [--size 24] [--color "#334155"] [-o file.svg]
#   icone.sh set lucide casa ricerca utente ...        # scarica più icone in ./icone/
#   icone.sh collezioni [--cerca testo]                 # elenco collezioni + licenza
#   icone.sh licenza lucide                             # licenza di una collezione
set -uo pipefail
API="https://api.iconify.design"

need() { command -v "$1" >/dev/null || { echo "serve $1" >&2; exit 1; }; }
need curl

cmd=${1:-}; shift || true

case "$cmd" in
  cerca)
    q=${1:?serve una parola da cercare}; shift || true
    prefix=""; limit=20
    while [ $# -gt 0 ]; do case "$1" in
      --prefix) prefix=$2; shift 2;;
      --limit) limit=$2; shift 2;;
      *) shift;;
    esac; done
    url="$API/search?query=$(printf %s "$q" | jq -sRr @uri)&limit=$limit"
    [ -n "$prefix" ] && url="$url&prefix=$prefix"
    curl -sf -m 20 "$url" | jq -r '.icons[]?' || { echo "ricerca fallita (rete?)" >&2; exit 1; }
    ;;
  prendi)
    id=${1:?serve un id tipo lucide:trash-2}; shift || true
    size=24; color=""; out=""
    while [ $# -gt 0 ]; do case "$1" in
      --size) size=$2; shift 2;;
      --color) color=$2; shift 2;;
      -o) out=$2; shift 2;;
      *) shift;;
    esac; done
    pre=${id%%:*}; nome=${id#*:}
    [ "$pre" = "$id" ] && { echo "id non valido: serve prefix:name" >&2; exit 1; }
    url="$API/$pre/$nome.svg?width=$size"
    [ -n "$color" ] && url="$url&color=$(printf %s "$color" | jq -sRr @uri)"
    if [ -n "$out" ]; then curl -sf -m 20 "$url" -o "$out" && echo "scritto $out"; else curl -sf -m 20 "$url"; fi
    ;;
  set)
    fam=${1:?serve la collezione, es. lucide}; shift || true
    [ $# -gt 0 ] || { echo "serve almeno un nome" >&2; exit 1; }
    mkdir -p icone
    for nome in "$@"; do
      if curl -sf -m 20 "$API/$fam/$nome.svg?width=24" -o "icone/$fam-$nome.svg"; then
        echo "ok   icone/$fam-$nome.svg"
      else
        echo "MANCA $fam:$nome (cerca: icone.sh cerca \"$nome\" --prefix $fam)" >&2
      fi
    done
    ;;
  collezioni)
    filtro=""
    if [ "${1:-}" = "--cerca" ]; then filtro=${2:?}; fi
    curl -sf -m 30 "$API/collections" | jq -r --arg f "$filtro" '
      to_entries
      | map(select($f == "" or (.key | test($f; "i")) or (.value.name | test($f; "i"))))
      | sort_by(-.value.total)[]
      | "\(.key)\t\(.value.total)\t\(.value.license.spdx // "?")\t\(.value.name)"' \
      | column -t -s $'\t' 2>/dev/null || true
    ;;
  licenza)
    fam=${1:?serve la collezione, es. lucide}
    curl -sf -m 20 "$API/collections?prefix=$fam" | jq -r --arg f "$fam" '
      .[$f] | "\(.name) — \(.total) icone — licenza \(.license.title) (\(.license.spdx // "?")) \(.license.url // "")"' \
      || echo "collezione $fam non trovata" >&2
    ;;
  *)
    sed -n '2,10p' "$0"; exit 1;;
esac
