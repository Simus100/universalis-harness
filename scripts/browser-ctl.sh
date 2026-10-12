#!/usr/bin/env bash
# browser-ctl.sh — pilota il tool `browser` della dashboard dalla riga di comando.
#
# A cosa serve: il tool `browser` (Chrome headless) è spento di default e la dashboard
# lo toglie dalla lista dei tool del modello. Questo script è il modo per accenderlo e
# spegnerlo senza passare dalla chat, così l'agente può procurarsi il tool quando serve
# davvero invece di chiedere ogni volta.
#
#   ./scripts/browser-ctl.sh status          stato: modo, tool acceso, processo, RAM
#   ./scripts/browser-ctl.sh on [minuti]     accende e programma il ritorno ad "auto"
#                                           (default 30 min; 0 = nessun ritorno automatico)
#   ./scripts/browser-ctl.sh auto            modo "auto": si spegne da sé dopo N min di inattività
#   ./scripts/browser-ctl.sh off             spegne
#
# Modo corrente e minuti di inattività stanno in media/browser-prefs.json (li scrive la
# dashboard: qui non si tocca quel file).
#
# Nota sul momento dell'effetto: la lista dei tool viene consegnata al modello all'inizio
# di ogni richiesta. Accendere il tool durante un turno NON lo rende disponibile in quel
# turno: serve la richiesta successiva. Quindi lo script va usato un turno prima di
# navigare — oppure, per lavoro immediato, si fa tutto dentro la stessa sessione con la
# CLI agent-browser (utente pi-browser), senza passare dal gate.
#
# Uso tipico: `browser-ctl.sh on 30` quando si prevede di dover navigare; il ritorno ad
# "auto" fa sì che, dopo l'ultima navigazione, il tool si spenga da solo (idleMinutes).
set -uo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
B="${DASH_URL:-http://127.0.0.1:8420}"

# Le credenziali della dashboard stanno in .env: si leggono qui, non si scrivono altrove.
if [ ! -f "$APP/.env" ]; then echo "browser-ctl: manca $APP/.env" >&2; exit 1; fi
set -a; . "$APP/.env"; set +a
AUTH=(-u "$DASH_USER:$DASH_PASSWORD")

json_field() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

post_mode() {
  curl -s -m 15 "${AUTH[@]}" -X POST -H 'Content-Type: application/json' \
    -d "$1" "$B/api/browser" >/dev/null || { echo "browser-ctl: dashboard non raggiungibile su $B" >&2; exit 1; }
}

procs()      { pgrep -u pi-browser -f chromium 2>/dev/null | wc -l; }
ram_mb()     { ps -o rss= -u pi-browser 2>/dev/null | awk '{s+=$1} END {printf "%d", s/1024}'; }

show_status() {
  local st; st=$(curl -s -m 15 "${AUTH[@]}" "$B/api/state") || { echo "browser-ctl: dashboard non raggiungibile su $B" >&2; exit 1; }
  local mode enabled idle last watch
  mode=$(echo "$st"    | json_field "d['browser']['mode']")
  enabled=$(echo "$st" | json_field "'SI' if d['browser']['enabled'] else 'no'")
  idle=$(echo "$st"    | json_field "d['browser']['idleMinutes']")
  last=$(echo "$st"    | json_field "d['browser']['lastActivity'] or 0")
  watch=$(echo "$st"   | json_field "'SI' if d['browser']['live']['watching'] else 'no'")
  echo "modo: $mode | tool nella lista del modello: $enabled | inattività: ${idle} min"
  if [ "$last" != "0" ]; then
    echo "ultima attività: $(date -d "@$((last/1000))" '+%H:%M:%S') ($(( ( $(date +%s%3N) - last ) / 60000 )) min fa)"
  else
    echo "ultima attività: nessuna da quando la dashboard è su"
  fi
  echo "live view: $watch | processi chromium (pi-browser): $(procs) | RAM: $(ram_mb) MB"
  if [ "$mode" = "auto" ] && [ "$enabled" = "no" ]; then
    echo "nota: in modo auto il tool è spento perché non c'è attività recente; non si riaccende"
    echo "      da solo finché non c'è attività — per navigare serve 'on'."
  fi
}

case "${1:-status}" in
  status) show_status ;;

  on)
    MIN=${2:-30}
    post_mode '{"mode":"on"}'
    if [ "$MIN" != "0" ] 2>/dev/null; then
      UNIT="pi-browser-auto-$(date +%s)"
      # Ritorno ad "auto" a tempo: se nel frattempo il tool è stato usato, lo spegnimento
      # avviene idleMinutes dopo l'ultima attività; se non è stato usato, si spegne subito.
      systemd-run --on-active="${MIN}min" --unit="$UNIT" --collect \
        "$APP/scripts/browser-ctl.sh" auto >/dev/null 2>&1 \
        && echo "tool browser: ACCESO (ritorno ad auto fra ${MIN} min: $UNIT)" \
        || echo "tool browser: ACCESO (ma non sono riuscito a programmare il ritorno ad auto)"
    else
      echo "tool browser: ACCESO (nessun ritorno automatico)"
    fi
    show_status ;;

  auto) post_mode '{"mode":"auto"}'; echo "modo -> auto"; show_status ;;
  off)  post_mode '{"mode":"off"}';  echo "modo -> off";  show_status ;;
  *)    echo "uso: $0 {status|on [minuti]|auto|off}" >&2; exit 2 ;;
esac
