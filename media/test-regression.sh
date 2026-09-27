#!/usr/bin/env bash
# Non-regressione sulle funzioni preesistenti: file manager, allegati,
# interruttori subagent/goal, modello/thinking, SSE. Istanza di prova su :8430.
set -uo pipefail
B=http://127.0.0.1:8430
A="-u pi:testpass"
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
ko(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($3)"; else ko "$1: atteso $2, ottenuto $3"; fi }
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }
J='-H Content-Type:application/json'

echo "== file manager =="
check "GET /api/files (root)" 200 "$(code $A "$B/api/files?path=")"
check "GET /api/file dashboard.html" 200 "$(code $A "$B/api/file?path=pi-harness/dashboard.html")"
check "POST /api/file/mkdir" 200 "$(code $A -X POST $J -d '{"path":"pi-harness/media/_test_dir"}' $B/api/file/mkdir)"
check "POST /api/file (scrivi)" 200 "$(code $A -X POST $J -d '{"path":"pi-harness/media/_test_dir/a.txt","content":"ciao"}' $B/api/file)"
check "GET /api/file legge il contenuto" "ciao" "$(curl -s $A "$B/api/file?path=pi-harness/media/_test_dir/a.txt" | python3 -c "import json,sys;print(json.load(sys.stdin)['content'])")"
check "POST /api/file/rename" 200 "$(code $A -X POST $J -d '{"from":"pi-harness/media/_test_dir/a.txt","to":"pi-harness/media/_test_dir/b.txt"}' $B/api/file/rename)"
check "GET /api/download" 200 "$(code $A "$B/api/download?path=pi-harness/media/_test_dir/b.txt")"
check "POST /api/upload (body raw)" 200 "$(code $A -X POST --data-binary 'contenuto-upload' "$B/api/upload?dir=pi-harness/media/_test_dir&name=up.txt")"
check "upload scritto davvero" "contenuto-upload" "$(cat /root/pi-harness/media/_test_dir/up.txt)"
check "traversal bloccato (..)" 403 "$(code $A "$B/api/file?path=../../etc/passwd")"
check "cartella al posto di file → 400" 400 "$(code $A "$B/api/file?path=pi-harness/node_modules")"
ln -sfn /etc/hostname /root/pi-harness/media/_esc_link 2>/dev/null
check "symlink che esce dalla root → 403" 403 "$(code $A "$B/api/file?path=pi-harness/media/_esc_link")"
check "download via symlink esterno → 403" 403 "$(code $A "$B/api/download?path=pi-harness/media/_esc_link")"
rm -f /root/pi-harness/media/_esc_link
check "POST /api/file/delete" 200 "$(code $A -X POST $J -d '{"path":"pi-harness/media/_test_dir"}' $B/api/file/delete)"
[ ! -e /root/pi-harness/media/_test_dir ] && ok "cartella di prova rimossa" || ko "cartella di prova ancora presente"

echo "== allegati chat =="
check "POST /api/chat/upload" 200 "$(code $A -X POST --data-binary 'x' "$B/api/chat/upload?name=prova.txt")"
ATT=$(curl -s $A -X POST --data-binary 'x' "$B/api/chat/upload?name=prova2.txt" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['path'])")
[ -n "$ATT" ] && ok "allegato salvato in media/uploads ($ATT)" || ko "allegato non salvato"
rm -f /root/pi-harness/media/uploads/prova*.txt 2>/dev/null

echo "== interruttori e modelli =="
check "POST /api/thinking low" "low" "$(curl -s $A -X POST $J -d '{"level":"low"}' $B/api/thinking | python3 -c "import json,sys;print(json.load(sys.stdin)['thinking']['level'])")"
check "POST /api/thinking livello non valido → 400" 400 "$(code $A -X POST $J -d '{"level":"boh"}' $B/api/thinking)"
check "POST /api/subagents on" "True" "$(curl -s $A -X POST $J -d '{"enabled":true,"maxSpawns":2}' $B/api/subagents | python3 -c "import json,sys;print(json.load(sys.stdin)['subagents']['enabled'])")"
check "maxSpawns applicato" "2" "$(curl -s $A $B/api/state | python3 -c "import json,sys;print(json.load(sys.stdin)['subagents']['maxSpawns'])")"
check "tool subagent presenti quando ON" "True" "$(curl -s $A $B/api/state | python3 -c "import json,sys;print(str('subagent' in json.load(sys.stdin)['subagents']['activeTools']).replace('True','True'))")"
check "POST /api/subagents off" "False" "$(curl -s $A -X POST $J -d '{"enabled":false}' $B/api/subagents | python3 -c "import json,sys;print(json.load(sys.stdin)['subagents']['enabled'])")"
check "tool subagent rimossi quando OFF" "0" "$(curl -s $A $B/api/state | python3 -c "import json,sys;print(len(json.load(sys.stdin)['subagents']['activeTools']))")"
check "POST /api/subagents maxSpawns non valido → 400" 400 "$(code $A -X POST $J -d '{"maxSpawns":999}' $B/api/subagents)"
# L'interruttore dei tool "goal" è stato rimosso dal server il 18/09: /api/goals ora crea e
# aggiorna i goal. Si verifica il contratto attuale senza creare goal di prova (i goal sono
# quelli reali: l'istanza di prova non isola DASH_GOALS_FILE).
check "POST /api/goals senza titolo → 400" 400 "$(code $A -X POST $J -d '{"enabled":true}' $B/api/goals)"
check "GET /api/goals restituisce la lista" "True" "$(curl -s $A $B/api/goals | python3 -c "import json,sys;print(isinstance(json.load(sys.stdin)['goals'],list))")"

check "POST /api/model inesistente → 404" 404 "$(code $A -X POST $J -d '{"id":"non-esiste"}' $B/api/model)"

echo "== sessioni =="
NMSG=$(curl -s $A $B/api/state | python3 -c "import json,sys;print(sum(1 for m in json.load(sys.stdin)['messages'] if m['role']=='assistant'))")
if [ "$NMSG" -ge 1 ]; then
  # sessione con messaggi: il nome viene persistito sul file e riletto dalla lista
  check "POST /api/sessions/rename" 200 "$(code $A -X POST $J -d '{"name":"chat di prova"}' $B/api/sessions/rename)"
  check "GET /api/sessions la mostra" "chat di prova" "$(curl -s $A $B/api/sessions | python3 -c "import json,sys;s=json.load(sys.stdin)['sessions'];print(next((x['name'] for x in s if x['name']),'?'))")"
  check "la ricerca nelle chat la trova per nome" "chat di prova" "$(curl -s $A "$B/api/sessions/search?q=chat%20di%20prova" | python3 -c "import json,sys;r=json.load(sys.stdin)['results'];print(r[0]['name'] if r else '?')")"
else
  echo "  – sessione vuota: pi persiste il nome solo dopo la prima risposta (salto il controllo)"
fi
check "POST /api/sessions/new" 200 "$(code $A -X POST $J -d '{}' $B/api/sessions/new)"
curl -s -m 3 -D /tmp/pi-test/sse.txt -o /dev/null $A "$B/events" || true
check "GET /events è uno stream SSE" "text/event-stream" "$(awk 'tolower($1)=="content-type:"{print $2}' /tmp/pi-test/sse.txt | tr -d '\r')"

echo "== sanitizzatore SVG (anteprima in chat) =="
# La chat carica il modulo del sanitizzatore dalla stessa origine: rotta mirata a un solo
# file, servita al browser perché anteprima e server usino lo STESSO codice.
check "GET /svg-sanitize.mjs" 200 "$(code $A "$B/svg-sanitize.mjs")"
check "content-type del sanitizzatore" "text/javascript;" "$(curl -s -D - -o /dev/null $A "$B/svg-sanitize.mjs" | awk 'tolower($1)=="content-type:"{print $2}' | tr -d '\r')"
check "il modulo esporta sanitizeSvg" "True" "$(curl -s $A "$B/svg-sanitize.mjs" | grep -c 'export function sanitizeSvg' | python3 -c "import sys;print(str(int(sys.stdin.read().strip())>=1))")"
check "header nosniff sul sanitizzatore" "nosniff" "$(curl -s -D - -o /dev/null $A "$B/svg-sanitize.mjs" | awk 'tolower($1)=="x-content-type-options:"{print $2}' | tr -d '\r')"
check "traversal sul sanitizzatore rifiutato" 404 "$(code $A "$B/svg-sanitize.mjs/../../.env")"

echo
echo "risultato: $PASS ok, $FAIL falliti"
[ "$FAIL" = "0" ]
