#!/usr/bin/env bash
# Test runtime: stop/abort, modifica e rigenera dell'ultimo messaggio,
# ricerca nelle chat e nei file, export markdown. Istanza di prova su :8430.
set -uo pipefail
B=http://127.0.0.1:8430
AUTH="-u pi:testpass"
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
ko(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($3)"; else ko "$1: atteso $2, ottenuto $3"; fi }
state(){ curl -s $AUTH $B/api/state; }

wait_idle(){ # wait_idle <max_sec>
  for i in $(seq 1 $(( $1 * 2 ))); do
    local s; s=$(state | python3 -c "import json,sys;print(json.load(sys.stdin)['streaming'])")
    [ "$s" = "False" ] && return 0
    sleep 0.5
  done
  return 1
}

echo "== 2. stop durante lo streaming =="
curl -s $AUTH -X POST -H 'Content-Type: application/json' -d '{"text":"Scrivi una lista numerata da 1 a 200 con una parola per riga."}' $B/api/prompt >/dev/null
sleep 3
check "abort accettato → 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' $AUTH -X POST $B/api/abort)"
if wait_idle 30; then ok "streaming fermato entro 15s"; else ko "streaming non fermato"; fi
check "dopo lo stop streaming=false" "False" "$(state | python3 -c "import json,sys;print(json.load(sys.stdin)['streaming'])")"
check "il messaggio utente è rimasto in sessione" "1" "$(state | python3 -c "import json,sys;print(sum(1 for m in json.load(sys.stdin)['messages'] if m['role']=='user'))")"
check "abort a vuoto (già fermo) → 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' $AUTH -X POST $B/api/abort)"
echo "     (dopo l'abort: $(state | python3 -c "import json,sys;d=json.load(sys.stdin);print('utenti=%d, assistant=%d' % (sum(1 for m in d['messages'] if m['role']=='user'), sum(1 for m in d['messages'] if m['role']=='assistant')))"))"

echo "== 3. modifica dell'ultimo messaggio =="
curl -s $AUTH -X POST -H 'Content-Type: application/json' -d '{"text":"Rispondi esattamente con la parola: PRIMO"}' $B/api/prompt >/dev/null
wait_idle 90 || ko "timeout prima risposta"
users_before=$(state | python3 -c "import json,sys;d=json.load(sys.stdin);print(sum(1 for m in d['messages'] if m['role']=='user'))")
asst_before=$(state | python3 -c "import json,sys;d=json.load(sys.stdin);print(sum(1 for m in d['messages'] if m['role']=='assistant'))")
check "esiste una risposta assistant prima della modifica" "true" "$(state | python3 -c "import json,sys;print(str(any(m['role']=='assistant' for m in json.load(sys.stdin)['messages'])).lower())")"
check "edit → 202" 202 "$(curl -s -o /dev/null -w '%{http_code}' $AUTH -X POST -H 'Content-Type: application/json' -d '{"text":"Rispondi esattamente con la parola: SECONDO"}' $B/api/messages/edit)"
wait_idle 90 || ko "timeout dopo la modifica"
last_user=$(state | python3 -c "import json,sys;d=json.load(sys.stdin);print([m['text'] for m in d['messages'] if m['role']=='user'][-1])")
check "l'ultimo messaggio utente è quello modificato" "Rispondi esattamente con la parola: SECONDO" "$last_user"
users_after=$(state | python3 -c "import json,sys;d=json.load(sys.stdin);print(sum(1 for m in d['messages'] if m['role']=='user'))")
check "la modifica non aggiunge messaggi utente (delta 0)" "$users_before" "$users_after"
check "la conversazione riparte: nuova risposta assistant" "true" "$(state | python3 -c "import json,sys;print(str(sum(1 for m in json.load(sys.stdin)['messages'] if m['role']=='assistant')>=1).lower())")"
final_asst=$(state | python3 -c "import json,sys;d=json.load(sys.stdin);msgs=[m['text'] for m in d['messages'] if m['role']=='assistant'];print(msgs[-1][:20])")
echo "     ultima risposta: ${final_asst}…"

echo "== 3b. rigenera l'ultima risposta =="
check "regenerate → 202" 202 "$(curl -s -o /dev/null -w '%{http_code}' $AUTH -X POST $B/api/messages/regenerate)"
wait_idle 90 || ko "timeout dopo rigenera"
check "rigenera non aggiunge messaggi utente (delta 0)" "$users_after" "$(state | python3 -c "import json,sys;print(sum(1 for m in json.load(sys.stdin)['messages'] if m['role']=='user'))")"
check "rigenera produce una nuova risposta" "true" "$(state | python3 -c "import json,sys;print(str(sum(1 for m in json.load(sys.stdin)['messages'] if m['role']=='assistant')>=2).lower())")"
check "esiste una risposta assistant" "1" "$(state | python3 -c "import json,sys;print(1 if any(m['role']=='assistant' for m in json.load(sys.stdin)['messages']) else 0)")"

echo "== 4. ricerca nelle chat =="
sid=$(state | python3 -c "import json,sys;print(json.load(sys.stdin)['sessionId'])")
res=$(curl -s $AUTH "$B/api/sessions/search?q=SECONDO")
check "trovata la chat con 'SECONDO'" "1" "$(echo "$res" | python3 -c "import json,sys;r=json.load(sys.stdin)['results'];print(sum(1 for x in r if x['id']=='$sid'))")"
check "snippet presenti" "1" "$(echo "$res" | python3 -c "import json,sys;r=json.load(sys.stdin)['results'];print(1 if r and r[0]['snippets'] and r[0]['snippets'][0]['match'] else 0)")"


echo "== 4b. ricerca nei file =="
fr=$(curl -s $AUTH "$B/api/search/files?q=media-guard")
check "trovato media-guard in dashboard.mjs" "1" "$(echo "$fr" | python3 -c "import json,sys;r=json.load(sys.stdin)['results'];print(1 if any(x['path']=='pi-harness/dashboard.mjs' and 'media-guard' in x['text'] for x in r) else 0)")"
check "ricerca file con path relativo" "1" "$(curl -s $AUTH "$B/api/search/files?q=MEDIA_GUARD_EXT&path=pi-harness" | python3 -c "import json,sys;print(1 if json.load(sys.stdin)['results'] else 0)")"
NOPE="qqzzxx$(date +%s%N)"
check "ricerca file senza riscontri ($NOPE)" "0" "$(curl -s $AUTH "$B/api/search/files?q=$NOPE" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['results']))")"
check "ricerca chat senza riscontri ($NOPE)" "0" "$(curl -s $AUTH "$B/api/sessions/search?q=$NOPE" | python3 -c "import json,sys;print(len(json.load(sys.stdin)['results']))")"

echo "== 5. export markdown =="
md=$(curl -s $AUTH "$B/api/sessions/export")
echo "$md" | grep -q "SECONDO" && ok "l'export contiene il testo della conversazione" || ko "export senza contenuto"
echo "$md" | grep -q "### 👤 utente" && ok "export con intestazioni utente/assistant" || ko "export malformato"
check "export di una chat specifica → 200" 200 "$(curl -s -o /dev/null -w '%{http_code}' $AUTH "$B/api/sessions/export?id=$sid")"
check "export con id inesistente → 404" 404 "$(curl -s -o /dev/null -w '%{http_code}' $AUTH "$B/api/sessions/export?id=00000000-0000")"

echo
echo "risultato: $PASS ok, $FAIL falliti"
[ "$FAIL" = "0" ]
