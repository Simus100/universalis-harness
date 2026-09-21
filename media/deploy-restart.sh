#!/usr/bin/env bash
# Deploy di Universalis Harness: riavvia il servizio e verifica l'esito.
# Va eseguito come unità transitoria systemd: così sopravvive al riavvio
# del servizio (che altrimenti lo ucciderebbe, essendo nello stesso cgroup).
set -uo pipefail
{
  echo "== deploy $(date '+%Y-%m-%d %H:%M:%S') =="
  systemctl restart pi-dashboard
  echo "restart inviato (exit $?)"
  for i in $(seq 1 20); do systemctl is-active --quiet pi-dashboard && break; sleep 2; done
  echo "servizio: $(systemctl is-active pi-dashboard)"
} >> /root/pi-harness/media/deploy.log 2>&1
bash /root/pi-harness/media/post-restart-check.sh
