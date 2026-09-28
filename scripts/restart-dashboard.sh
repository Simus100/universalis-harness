#!/usr/bin/env bash
#
# Riavvia la dashboard anche quando la richiesta arriva da DENTRO la dashboard.
#
# Perché serve: il processo dell'agente (e la sua shell) vive nel cgroup del servizio
# `pi-dashboard`. `systemctl restart` uccide TUTTI i processi del cgroup del servizio
# (KillMode=control-group, predefinito di systemd): chi ha chiesto il riavvio muore a metà
# e non può scrivere l'esito da nessuna parte. Qui il riavvio viene affidato a systemd come
# unità transitoria, quindi avviene fuori dal cgroup del servizio e sopravvive.
#
# Uso:
#   scripts/restart-dashboard.sh                      # riavvio subito (esito nel log)
#   scripts/restart-dashboard.sh --fra 120            # fra 2 minuti (es. a fine turno)
#   scripts/restart-dashboard.sh --log media/restart.log
#   scripts/restart-dashboard.sh --servizio pi-tester01 --porta 8421
#
# Opzioni:
#   --fra SECONDI      ritardo prima del riavvio (default 0)
#   --servizio NOME    unità systemd (default pi-dashboard)
#   --porta N          porta HTTP per la verifica (default 8420)
#   --attesa SECONDI   quanto attendere il ritorno del servizio (default 90)
#   --log FILE         scrive l'esito anche su file (append)
#   --stato            non riavvia: verifica soltanto che il servizio risponda
#   -h, --help         questo testo
#
# Con --fra 0 il comando ritorna subito (il riavvio è delegato a systemd); con un ritardo
# ritorna subito comunque, e l'esito finisce nel log dell'unità transitoria: lo si legge con
# `journalctl -u restart-dashboard-<timestamp>` oppure dal file indicato con --log.
set -euo pipefail

SERVIZIO=pi-dashboard
PORTA=8420
FRA=0
ATTESA=90
LOG=""
MODO=pianifica
SELF="$(readlink -f "$0")"

aiuto() {
  sed -n '3,33p' "$SELF" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --fra) FRA="${2:?secondi mancanti}"; shift 2 ;;
    --servizio) SERVIZIO="${2:?nome mancante}"; shift 2 ;;
    --porta) PORTA="${2:?porta mancante}"; shift 2 ;;
    --attesa) ATTESA="${2:?secondi mancanti}"; shift 2 ;;
    --log) LOG="${2:?file mancante}"; shift 2 ;;
    --stato) MODO=stato; shift ;;
    --esegui-riavvio) MODO=esegui; shift ;;
    -h | --help) aiuto; exit 0 ;;
    *) echo "opzione sconosciuta: $1 (usa --help)" >&2; exit 2 ;;
  esac
done

case "$FRA" in '' | *[!0-9]*) echo "--fra vuole un numero di secondi" >&2; exit 2 ;; esac
case "$ATTESA" in '' | *[!0-9]*) echo "--attesa vuole un numero di secondi" >&2; exit 2 ;; esac

logga() {
  local m
  m="[$(date '+%F %T')] $*"
  echo "$m"
  if [ -n "$LOG" ]; then echo "$m" >>"$LOG"; fi
  return 0
}

risponde() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PORTA}/login" 2>/dev/null || true)"
  [ "$code" = "200" ]
}

# Verifica soltanto: nessun riavvio.
if [ "$MODO" = stato ]; then
  if risponde; then
    logga "$SERVIZIO risponde su :${PORTA} (PID $(systemctl show -p MainPID --value "$SERVIZIO" 2>/dev/null || echo '?'))"
    exit 0
  fi
  logga "$SERVIZIO NON risponde su :${PORTA}"
  exit 1
fi

# Modalità interna: eseguita dentro l'unità transitoria (fuori dal cgroup del servizio).
if [ "$MODO" = esegui ]; then
  logga "riavvio di $SERVIZIO richiesto"
  if ! systemctl restart "$SERVIZIO"; then
    logga "ERRORE: systemctl restart $SERVIZIO non riuscito"
    exit 1
  fi
  logga "systemctl restart inviato"
  for i in $(seq 1 "$ATTESA"); do
    sleep 1
    if risponde; then
      logga "$SERVIZIO attivo dopo ${i}s su http://127.0.0.1:${PORTA}"
      # un attimo di grazia: journalctl può non avere ancora reso disponibili le righe scritte
      # nell'ultimo secondo, e il log di avvio è proprio la parte utile da leggere
      sleep 1
      journalctl -u "$SERVIZIO" --since "-2min" --no-pager 2>/dev/null |
        { grep -E "\[skills\]" || true; } | tail -3 | sed 's/^/    journal: /' || true
      exit 0
    fi
  done
  logga "ATTENZIONE: $SERVIZIO non risponde su :${PORTA} dopo ${ATTESA}s (controlla: journalctl -u $SERVIZIO -n 50)"
  exit 1
fi

# Pianificazione: il riavvio lo esegue systemd, non questa shell.
if [ "$(id -u)" != "0" ]; then
  echo "serve root: il riavvio va delegato a systemd-run per sopravvivere al cgroup del servizio" >&2
  exit 1
fi
if ! command -v systemd-run >/dev/null 2>&1; then
  echo "systemd-run non disponibile: esegui a mano 'systemctl restart $SERVIZIO' fuori da un turno" >&2
  exit 1
fi

UNIT="restart-dashboard-$(date +%s)-$$"
ARGOMENTI=(--esegui-riavvio --servizio "$SERVIZIO" --porta "$PORTA" --attesa "$ATTESA")
if [ -n "$LOG" ]; then ARGOMENTI+=(--log "$LOG"); fi

if [ "$FRA" -gt 0 ]; then
  systemd-run --collect --quiet --unit="$UNIT" --on-active="${FRA}s" "$SELF" "${ARGOMENTI[@]}"
  logga "riavvio di $SERVIZIO pianificato fra ${FRA}s (unità transitoria $UNIT, fuori dal cgroup): esito con 'journalctl -u $UNIT'"
else
  systemd-run --collect --quiet --unit="$UNIT" "$SELF" "${ARGOMENTI[@]}"
  logga "riavvio di $SERVIZIO avviato (unità transitoria $UNIT): esito con 'journalctl -u $UNIT'"
fi
