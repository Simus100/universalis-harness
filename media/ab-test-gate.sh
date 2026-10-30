#!/usr/bin/env bash
# A/B del congelamento del gate, DENTRO un turno.
#
# Scenario: un turno che usa 3 tool (bash, read). A metà turno accendo il tool browser.
# Con il codice vecchio `applyToolGate` ricostruisce subito il prefisso: le definizioni dei tool
# stanno in TESTA al contesto, quindi la cache del provider è persa per tutti i passi successivi.
# Con il codice nuovo il cambio resta in attesa fino alla fine del turno (gateDifferito).
#
# Misura: token NON letti da cache nel turno (input dell'API) e token letti da cache.
set -uo pipefail
cd /root/pi-harness

VECCHIO_BK=$(cat /tmp/backup-path.txt)
cp "$VECCHIO_BK/dashboard.mjs" dashboard-vecchio.mjs || exit 1

PROMPT='Usa bash per elencare i file dentro pi-harness/docs, poi usa read sul primo file che trovi, poi dimmi in una frase quante righe ha. Non usare altri tool.'

avvia() { # avvia <file> <porta> <dir>
  mkdir -p "$3/sessions" "$3/media"
  DASH_ASK=off DASH_SESSION_DIR="$3/sessions" DASH_MEDIA_DIR="$3/media" \
  DASH_SESSION_SECRET_FILE="$3/.secret" DASH_TURNI_FILE="$3/turni.jsonl" \
    nohup node "$1" --port "$2" --user pi --password testpass --root /root >"$3/log.txt" 2>&1 &
  echo $! > "$3/pid"
  for i in $(seq 1 60); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' -u pi:testpass "http://127.0.0.1:$2/api/state")" = "200" ] && return 0
    sleep 0.5
  done; return 1
}
numeri() { curl -s -u pi:testpass "$1/api/state" | python3 -c "
import json,sys
d=json.load(sys.stdin); t=d['tokens']; print(t['input'], t['cacheRead'], d.get('counts',{}).get('toolCalls',0))"; }
attendi_fine() { for i in $(seq 1 150); do
    s=$(curl -s -u pi:testpass "$1/api/state" | python3 -c "import json,sys;print(json.load(sys.stdin).get('streaming'))" 2>/dev/null)
    [ "$s" = "False" ] && return 0; sleep 1; done; return 1; }

scenario() { # scenario <nome> <file> <porta> <dir>
  local nome=$1 file=$2 porta=$3 dir=$4 B
  B="http://127.0.0.1:$porta"
  rm -rf "$dir"; avvia "$file" "$porta" "$dir" || { echo "$nome: avvio fallito"; tail -3 "$dir/log.txt"; return 1; }

  # un turno di riscaldamento: porta il prefisso in cache e rende il confronto onesto
  curl -s -u pi:testpass -X POST "$B/api/prompt" -H 'Content-Type: application/json' \
       -d '{"text":"Rispondi con una sola parola: ok"}' >/dev/null
  sleep 1; attendi_fine "$B" >/dev/null
  local i1 c1 t1 i2 c2 t2 di dc dp pct
  read -r i1 c1 t1 <<<"$(numeri "$B")"

  curl -s -u pi:testpass -X POST "$B/api/prompt" -H 'Content-Type: application/json' \
       -d "$(python3 -c "import json,sys;print(json.dumps({'text':sys.argv[1]}))" "$PROMPT")" >/dev/null

  # aspetto che il turno sia partito e abbia fatto almeno una tool call, poi cambio il gate
  for i in $(seq 1 60); do
    read -r _ _ tt <<<"$(numeri "$B")"
    [ "${tt:-0}" -gt "$t1" ] && break; sleep 1
  done
  curl -s -o /dev/null -u pi:testpass -X POST "$B/api/browser" -H 'Content-Type: application/json' -d '{"mode":"on"}'
  attendi_fine "$B" >/dev/null

  read -r i2 c2 t2 <<<"$(numeri "$B")"
  di=$((i2 - i1)); dc=$((c2 - c1)); dp=$((di + dc)); pct=0
  [ "$dp" -gt 0 ] && pct=$((dc * 100 / dp))
  echo "$nome|$di|$dc|$dp|$pct%|$((t2 - t1))"
  kill "$(cat "$dir/pid")" 2>/dev/null
  sleep 1
}

echo "istanza|input_non_cachati|cacheRead|prompt_totale|pct_cache|tool_call"
for r in 1 2; do
  scenario "VECCHIO-r$r" dashboard-vecchio.mjs $((8430 + r)) "/tmp/pi-ab/gate-old-$r"
  scenario "NUOVO-r$r" dashboard.mjs $((8440 + r)) "/tmp/pi-ab/gate-new-$r"
done
rm -f dashboard-vecchio.mjs
