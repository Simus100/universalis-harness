#!/usr/bin/env bash
set -uo pipefail
cd /root/pi-harness; set -a; . ./.env; set +a
B=https://harness.universalisproduzioni.it; R="--resolve harness.universalisproduzioni.it:443:127.0.0.1"
{
  echo "== riavvio post-rollback $(date "+%F %T") =="
  systemctl restart pi-dashboard
  for i in $(seq 1 40); do code=$(curl -s -o /dev/null -w "%{http_code}" -m 3 -u "$DASH_USER:$DASH_PASSWORD" $R "$B/api/health" 2>/dev/null || echo 000); [ "$code" = "200" ] && break; sleep 2; done
  echo "servizio: $(systemctl is-active pi-dashboard) · health: $code (dopo $i tentativi)"
  curl -s -u "$DASH_USER:$DASH_PASSWORD" $R "$B/api/health" | python3 -c "import json,sys;d=json.load(sys.stdin);print(\"version:\",d.get(\"version\"),\"· pid\",d.get(\"pid\"))" 2>/dev/null
  echo "pagina: $(curl -s -o /dev/null -w "%{http_code} %{size_download}B" -u "$DASH_USER:$DASH_PASSWORD" $R "$B/")"
  echo "elementi: feat-btn=$(curl -s -u "$DASH_USER:$DASH_PASSWORD" $R "$B/" | grep -c "feat-btn") · uiDlg=$(curl -s -u "$DASH_USER:$DASH_PASSWORD" $R "$B/" | grep -c "uiDlg")"
  echo "errori nel log (ultimo minuto): $(journalctl -u pi-dashboard --since "-1 min" --no-pager 2>/dev/null | grep -ci error)"
} > media/rollback-check.txt 2>&1
