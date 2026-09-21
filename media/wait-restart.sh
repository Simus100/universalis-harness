#!/usr/bin/env bash
# Riavvia pi-dashboard SOLO quando non c'è una risposta in corso, così il
# riavvio non interrompe una conversazione.
#
# Va lanciato come unità transitoria systemd (fuori dal cgroup del servizio),
# altrimenti il riavvio ucciderebbe questo stesso script:
#   systemd-run --unit=pi-deploy-idle --collect /bin/bash /root/pi-harness/media/wait-restart.sh
set -uo pipefail
LOG=/root/pi-harness/media/last-restart.log
set -a; . /root/pi-harness/.env 2>/dev/null; set +a
U="${DASH_USER:-pi}:${DASH_PASSWORD:-}"
B="http://127.0.0.1:8420"
IDLE_NEEDED=3   # letture consecutive "streaming:false" (ogni 5s) prima di riavviare
idle=0
i=0
for i in $(seq 1 240); do
  st=$(curl -s -m 5 -u "$U" "$B/api/state" 2>/dev/null)
  if printf '%s' "$st" | grep -q '"streaming":false'; then idle=$((idle + 1)); else idle=0; fi
  [ "$idle" -ge "$IDLE_NEEDED" ] && break
  sleep 5
done
{
  echo "== riavvio $(date '+%Y-%m-%d %H:%M:%S') — inattivo dopo ~$((i * 5))s =="
  systemctl restart pi-dashboard
  for k in $(seq 1 20); do systemctl is-active --quiet pi-dashboard && break; sleep 2; done
  echo "servizio: $(systemctl is-active pi-dashboard)"
} >> "$LOG" 2>&1
bash /root/pi-harness/media/post-restart-check.sh
