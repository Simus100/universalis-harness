#!/usr/bin/env bash
# Riavvia pi-dashboard e verifica che sia tornato a rispondere.
# Lanciato da un timer systemd transitorio (vedi README) per non uccidere la
# sessione agente che ha chiesto il riavvio. Esito in media/last-restart.log.
set -uo pipefail
LOG=/root/pi-harness/media/last-restart.log
ENVF=/root/pi-harness/.env
{
  echo "[$(date -Is)] riavvio pi-dashboard…"
  systemctl restart pi-dashboard
  sleep 3
  U=$(grep -oP '^DASH_USER=\K.*' "$ENVF" | tr -d '"'); P=$(grep -oP '^DASH_PASSWORD=\K.*' "$ENVF" | tr -d '"')
  for i in $(seq 1 20); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -u "$U:$P" http://127.0.0.1:8420/api/state)
    if [ "$code" = "200" ]; then
      echo "[$(date -Is)] OK: la dashboard risponde (HTTP $code)"
      curl -s -u "$U:$P" http://127.0.0.1:8420/api/state | python3 -c "import json,sys;d=json.load(sys.stdin);print('  sessione ripresa:',d['sessionId'][:8],'| messaggi:',len(d['messages']),'| modello:',d['model']['id'])"
      exit 0
    fi
    sleep 1
  done
  echo "[$(date -Is)] ATTENZIONE: la dashboard non risponde (ultimo codice: ${code:-nessuno})"
  systemctl status pi-dashboard --no-pager | head -20
  exit 1
} >> "$LOG" 2>&1
