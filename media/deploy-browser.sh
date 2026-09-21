#!/usr/bin/env bash
# Deploy per attivare il tool `browser` e le viste progetto/agenda.
#
# Differenza rispetto a verify-and-restart.sh: NON tocca le sessioni.
# Quello script, per verificare modifica/rigenera, fa POST /api/messages/edit e
# /api/messages/regenerate sulla sessione ATTIVA, quindi altererebbe la conversazione
# in corso. Qui si verifica solo che il servizio nuovo sia attivo e risponda.
#
# Va lanciato come unità transitoria systemd (systemd-run) perché il riavvio uccide
# il processo della dashboard e, con esso, la sessione agente che lo ha richiesto.
#
#   systemd-run --on-active=120 --unit=pi-deploy-$(date +%s) --collect /root/pi-harness/media/deploy-browser.sh
#
# Esito in media/deploy-browser.log
set -uo pipefail

APP=/root/pi-harness
LOG=$APP/media/deploy-browser.log
set -a; . "$APP/.env"; set +a
AUTH=(-u "$DASH_USER:$DASH_PASSWORD")
B=http://127.0.0.1:8420

json_field() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null || echo "?"; }

{
  echo "==================== deploy $(date '+%F %T') ===================="
  OLD=$(systemctl show -p MainPID --value pi-dashboard 2>/dev/null)
  echo "pid prima: ${OLD:-?}"

  systemctl restart pi-dashboard
  echo "systemctl restart -> $?"

  # Attendere l'HTTP, non solo is-active: systemd può dichiarare il servizio attivo
  # qualche istante prima che risponda (successo con health HTTP 000 per questo motivo).
  code=""
  for _ in $(seq 1 40); do
    code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$B/api/health")
    [ "$code" = "200" ] && break
    sleep 2
  done
  echo "attesa HTTP: $code"

  NEW=$(systemctl show -p MainPID --value pi-dashboard 2>/dev/null)
  echo "pid dopo: ${NEW:-?} | servizio: $(systemctl is-active pi-dashboard)"

  HEALTH=$(curl -s -m 15 "${AUTH[@]}" "$B/api/health")
  echo "health HTTP: $(curl -s -m 15 -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$B/api/health") (dopo l'attesa: $code)"
  echo "versione servita: $(echo "$HEALTH" | json_field "d.get('version')")"

  echo "campo 'browser' in /api/state: $(curl -s -m 15 "${AUTH[@]}" "$B/api/state" | json_field "'browser' in d")"
  # NON si usa POST /api/browser per verificare: con la nuova logica di accensione quel
  # parametro CAMBIA e SALVA la preferenza su disco (il deploy spegneva il tool).
  echo "GET /api/browser/live: HTTP $(curl -s -m 15 -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$B/api/browser/live")"
  echo "modo del tool (invariato dal deploy): $(curl -s -m 15 "${AUTH[@]}" "$B/api/state" | json_field "d['browser']['mode']")"

  HTML=$(curl -s -m 15 "${AUTH[@]}" "$B/")
  echo "vista progetto servita: $(echo "$HTML" | grep -c 'progettoView') (atteso 1)"
  echo "vista agenda servita: $(echo "$HTML" | grep -c 'agendaView') (atteso 1)"
  echo "vista live servita: $(echo "$HTML" | grep -c 'liveView') (atteso 1)"
  echo "GET /api/browser/live: HTTP $(curl -s -m 15 -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$B/api/browser/live")"
  echo "POST /api/browser/watch (off): HTTP $(curl -s -m 15 -o /dev/null -w '%{http_code}' "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d '{"on":false}' "$B/api/browser/watch")"
  echo "tool browser registrato all'avvio:"
  journalctl -u pi-dashboard -n 40 --no-pager 2>/dev/null | grep -i "\[browser\]" | tail -3

  echo "porte in ascolto (attese: 22/80/443 pubbliche, il resto loopback):"
  ss -tln 2>/dev/null | awk 'NR>1 {print "  " $4}' | sort -u
  echo "==================== fine deploy ===================="
} >> "$LOG" 2>&1
