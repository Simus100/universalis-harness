#!/usr/bin/env bash
# Riavvia la dashboard QUANDO NON C'È UN TURNO IN CORSO, poi verifica l'esito.
#
# Perché serve: la sessione agente vive DENTRO il processo della dashboard, quindi un riavvio
# immediato ucciderebbe il turno che ha chiesto il lavoro (e la risposta andrebbe persa).
# Qui si aspetta una finestra di quiete (`streaming: false` per N secondi consecutivi) e solo
# allora si riavvia, delegando la verifica a `media/verify-and-restart.sh`.
#
# Va lanciato come unità systemd transitoria, così il riavvio del servizio non uccide lo script:
#   systemd-run --unit=pi-ask-deploy --collect /bin/bash /root/pi-harness/media/restart-quando-libero.sh
#
# Env: BASE (default 127.0.0.1:8420), SERVICE (pi-dashboard), ENVF, QUIETE_SEC (8), ATTESA_MAX (300)
set -uo pipefail

APP=/root/pi-harness
ENVF=${ENVF:-$APP/.env}
BASE=${BASE:-http://127.0.0.1:8420}
SERVICE=${SERVICE:-pi-dashboard}
QUIETE_SEC=${QUIETE_SEC:-8}
ATTESA_MAX=${ATTESA_MAX:-300}
LOG=$APP/media/restart-quando-libero.log

U=$(grep -oP '^DASH_USER=\K.*' "$ENVF" | tr -d '"')
P=$(grep -oP '^DASH_PASSWORD=\K.*' "$ENVF" | tr -d '"')

{
  echo "[$(date -Is)] attendo una finestra di quiete (${QUIETE_SEC}s senza turno in corso, max ${ATTESA_MAX}s)"
  quieti=0
  for i in $(seq 1 "$ATTESA_MAX"); do
    s=$(curl -s -m 5 -u "$U:$P" "$BASE/api/state" | python3 -c "import json,sys;print(json.load(sys.stdin)['streaming'])" 2>/dev/null)
    if [ "$s" = "False" ]; then
      quieti=$((quieti + 1))
      if [ "$quieti" -ge "$QUIETE_SEC" ]; then
        echo "[$(date -Is)] turno concluso e servizio fermo da ${QUIETE_SEC}s: procedo"
        break
      fi
    else
      [ "$quieti" -gt 0 ] && echo "[$(date -Is)] turno ripreso: riparto ad attendere"
      quieti=0
    fi
    sleep 1
  done
  if [ "$quieti" -lt "$QUIETE_SEC" ]; then
    echo "[$(date -Is)] nessuna finestra di quiete entro ${ATTESA_MAX}s: NON riavvio (riprovare più tardi)"
    exit 1
  fi

  echo "[$(date -Is)] riavvio + verifica ($SERVICE)"
  BASE="$BASE" SERVICE="$SERVICE" ENVF="$ENVF" DO_RESTART=1 bash "$APP/media/verify-and-restart.sh"
  echo "[$(date -Is)] esito: $? (riepilogo in media/restart-verified.txt)"
} >> "$LOG" 2>&1
