#!/usr/bin/env bash
# Verifica se il reverse proxy Caddy preserva un X-Forwarded-For inviato dal client.
# Se lo preserva, l'anti brute-force della dashboard (che usa il PRIMO valore di XFF)
# è aggirabile ruotando l'header. Esperimento isolato: Caddy su :9999 -> echo su :9988.
# Non tocca la dashboard né la produzione.
set -uo pipefail
cd "$(dirname "$0")/.."
ECHO_PORT=9988
CADDY_PORT=9999
cdir=$(mktemp -d)
CFG=$cdir/Caddyfile

cleanup() {
  [ -n "${ECHO_PID:-}" ] && kill "$ECHO_PID" 2>/dev/null
  [ -n "${CADDY_PID:-}" ] && kill "$CADDY_PID" 2>/dev/null
  rm -rf "$cdir" "$CFG"
}
trap cleanup EXIT

node media/xff-echo.mjs "$ECHO_PORT" >/dev/null 2>&1 &
ECHO_PID=$!
sleep 0.7

cat >"$CFG" <<CFGE
{
	admin off
}

http://xff.test:$CADDY_PORT {
	reverse_proxy 127.0.0.1:$ECHO_PORT
}
CFGE

XDG_DATA_HOME="$cdir/data" XDG_CONFIG_HOME="$cdir/config" \
  caddy run --config "$CFG" >/dev/null 2>&1 &
CADDY_PID=$!
for i in $(seq 1 30); do
  curl -s -m 2 -o /dev/null -H 'Host: xff.test' "http://127.0.0.1:$CADDY_PORT/" && break
  sleep 0.3
done

echo "versione Caddy: $(caddy version)"
echo
echo "--- 1) richiesta con X-Forwarded-For falsificato dal client ---"
curl -s -m 5 -H 'Host: xff.test' -H 'X-Forwarded-For: 6.6.6.6' \
  "http://127.0.0.1:$CADDY_PORT/"
echo
echo "--- 2) stessa cosa, con due IP falsi (client che finge una catena) ---"
curl -s -m 5 -H 'Host: xff.test' -H 'X-Forwarded-For: 6.6.6.6, 7.7.7.7' \
  "http://127.0.0.1:$CADDY_PORT/"
echo
echo "--- 3) header custom non standard (controllo: deve essere preservato) ---"
curl -s -m 5 -H 'Host: xff.test' -H 'X-Spoof-Test: ciao' \
  "http://127.0.0.1:$CADDY_PORT/"
