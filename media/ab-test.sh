#!/usr/bin/env bash
# A/B del prefisso stabile: stesso scenario con il codice VECCHIO e con quello NUOVO.
#
# Scenario: turno 1 → cambio di progetto (aggiungo una cartella) → turno 2.
# Con il codice vecchio la nota del progetto sta nel system prompt, quindi il turno 2 trova
# la cache del provider fredda. Con il codice nuovo la nota viaggia in coda al messaggio e il
# prefisso non cambia.
#
# Misura: token di input e token letti da cache nel SOLO turno 2 (differenza dei cumulativi).
set -uo pipefail
cd /root/pi-harness

VECCHIO_BK=$(cat /tmp/backup-path.txt)
cp "$VECCHIO_BK/dashboard.mjs" dashboard-vecchio.mjs || exit 1

attendi() { # attendi <base> <user:pass>
  for i in $(seq 1 120); do
    s=$(curl -s -u "$2" "$1/api/state" | python3 -c "import json,sys;print(json.load(sys.stdin).get('streaming'))" 2>/dev/null)
    [ "$s" = "False" ] && return 0; sleep 1
  done; return 1
}
avvia() { # avvia <nome> <file> <porta> <dir>
  mkdir -p "$4/sessions" "$4/media"
  DASH_ASK=off DASH_SESSION_DIR="$4/sessions" DASH_MEDIA_DIR="$4/media" \
  DASH_SESSION_SECRET_FILE="$4/.secret" DASH_TURNI_FILE="$4/turni.jsonl" \
    nohup node "$2" --port "$3" --user pi --password testpass --root /root >"$4/log.txt" 2>&1 &
  echo $! > "$4/pid"
  for i in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' -u pi:testpass "http://127.0.0.1:$3/api/state")" = "200" ] && return 0
    sleep 0.5
  done; return 1
}
numeri() { # numeri <base> → "input cacheRead"
  curl -s -u pi:testpass "$1/api/state" | python3 -c "
import json,sys
d=json.load(sys.stdin); t=d['tokens']
print(t['input'], t['cacheRead'])" 2>/dev/null
}
scenario() { # scenario <nome> <file> <porta> <dir>
  local nome=$1 file=$2 porta=$3 dir=$4 B
  B="http://127.0.0.1:$porta"
  rm -rf "$dir"; mkdir -p "$dir"
  avvia "$nome" "$file" "$porta" "$dir" || { echo "$nome: avvio fallito"; tail -3 "$dir/log.txt"; return 1; }

  curl -s -u pi:testpass -X POST "$B/api/prompt" -H 'Content-Type: application/json' \
       -d '{"text":"Rispondi con una sola parola: ok"}' >/dev/null
  sleep 1; attendi "$B" pi:testpass >/dev/null
  local i1 c1 i2 c2
  read -r i1 c1 <<<"$(numeri "$B")"

  curl -s -u pi:testpass -X POST "$B/api/progetto" -H 'Content-Type: application/json' \
       -d '{"azione":"aggiungi","path":"pi-harness/docs"}' >/dev/null

  curl -s -u pi:testpass -X POST "$B/api/prompt" -H 'Content-Type: application/json' \
       -d '{"text":"Rispondi con una sola parola: ok"}' >/dev/null
  sleep 1; attendi "$B" pi:testpass >/dev/null
  read -r i2 c2 <<<"$(numeri "$B")"

  # `input` dell'API = token NON letti da cache; il prompt totale è input + cacheRead
  local di
  local dc
  local dp
  local pct=0
  di=$((i2 - i1))
  dc=$((c2 - c1))
  dp=$((di + dc))
  [ "$dp" -gt 0 ] && pct=$((dc * 100 / dp))
  echo "$nome|$di|$dc|$dp|$pct%"
  kill "$(cat "$dir/pid")" 2>/dev/null
  sleep 1
}

echo "istanza|input_non_cachati|cacheRead|prompt_totale|pct_cache"
scenario NUOVO dashboard.mjs 8431 /tmp/pi-ab/new
scenario VECCHIO dashboard-vecchio.mjs 8432 /tmp/pi-ab/old
rm -f dashboard-vecchio.mjs
