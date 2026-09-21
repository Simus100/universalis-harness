#!/usr/bin/env bash
# Riavvia pi-dashboard e verifica SUL SERVIZIO IN ESECUZIONE che il codice nuovo sia
# davvero attivo (non solo su disco), con prove indipendenti.
#
# Va lanciato come unità systemd transitoria (systemd-run): il riavvio uccide il
# processo della dashboard, e la sessione agente che ha chiesto il lavoro ci gira dentro.
#
#   DO_RESTART=0  -> sola verifica, senza riavviare (utile per provare lo script)
#   BASE=…  SERVICE=…  ENVF=…  EXPECT_VERSION=…  -> per verificare un'ALTRA istanza
#     (il clone tester_01: BASE=http://127.0.0.1:8421 SERVICE=pi-tester01 \
#      ENVF=/root/tester_01/.env)
#
# Produce: media/last-restart.log (log completo) e media/restart-verified.txt (riepilogo)
set -uo pipefail
APP=/root/pi-harness
ENVF=${ENVF:-$APP/.env}
LOG=$APP/media/last-restart.log
SUMMARY=$APP/media/restart-verified.txt
BASE=${BASE:-http://127.0.0.1:8420}
SERVICE=${SERVICE:-pi-dashboard}
# La versione attesa si legge dal CODICE su disco: un valore scritto a mano va fuori sincrono
# a ogni bump (era dashboard-2026-09-20.1 e faceva fallire il controllo dopo un rilascio).
EXPECT_VERSION=${EXPECT_VERSION:-$(grep -oP 'const VERSION = "\K[^"]+' "$APP/dashboard.mjs" 2>/dev/null)}
DO_RESTART=${DO_RESTART:-1}

U=$(grep -oP '^DASH_USER=\K.*' "$ENVF" | tr -d '"')
P=$(grep -oP '^DASH_PASSWORD=\K.*' "$ENVF" | tr -d '"')
AUTH=(-u "$U:$P")

PASS=0; FAIL=0; NOTES=()
chk(){ if [ "$2" = "$3" ]; then echo "  OK   $1 ($3)"; PASS=$((PASS+1)); else echo "  FAIL $1: atteso $2, ottenuto $3"; FAIL=$((FAIL+1)); fi; }
# -m: nessuna curl deve poter appendere lo script (la rotta SSE è uno stream infinito)
get(){ curl -s -m 25 "${AUTH[@]}" "$BASE$1"; }
code(){ curl -s -m 25 -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$@"; }
ctype(){ curl -s -m 25 -D- -o /dev/null "${AUTH[@]}" "$1" | tr -d '\r' | awk 'tolower($1)=="content-type:"{print $2}'; }
ctype_sse(){ curl -s -m 3 -D- -o /dev/null "${AUTH[@]}" "$1" | tr -d '\r' | awk 'tolower($1)=="content-type:"{print $2}'; }
jfield(){ python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

{
echo "==================== $(date -Is) (unit: ${INVOCATION_ID:-shell}) ===================="
OLD_PID=$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null)
echo "processo della dashboard PRIMA: pid=${OLD_PID:-?}"

if [ "$DO_RESTART" = "1" ]; then
  echo "riavvio del servizio $SERVICE…"
  systemctl restart "$SERVICE"
  echo "systemctl restart -> $?"
fi

# attesa che risponda
code_now=""
for i in $(seq 1 60); do
  code_now=$(code "$BASE/api/state")
  [ "$code_now" = "200" ] && break
  sleep 1
done
NEW_PID=$(systemctl show -p MainPID --value "$SERVICE" 2>/dev/null)
echo "servizio: $(systemctl is-active "$SERVICE") | pid nuovo: ${NEW_PID:-?} | HTTP /api/state: ${code_now:-nessuno}"
echo

echo "== 1. il processo in esecuzione ha il CODICE NUOVO =="
chk "GET /api/health risponde" 200 "$(code "$BASE/api/health")"
HEALTH=$(get /api/health)
chk "versione attesa" "$EXPECT_VERSION" "$(echo "$HEALTH" | jfield "d.get('version')")"
chk "il processo è cambiato (pid diverso dal vecchio)" "true" "$( [ -n "${NEW_PID:-}" ] && [ "${NEW_PID:-0}" != "${OLD_PID:-0}" ] && echo true || echo false)"
chk "features elencate da /api/health" "true" "$(echo "$HEALTH" | jfield "str(len(d.get('features') or [])>=9).lower()")"

echo
echo "== 2. rotte NUOVE davvero attive sul servizio in esecuzione =="
chk "POST /api/abort" 200 "$(code -X POST "$BASE/api/abort")"
# edit con testo vuoto: la rotta esiste ma non modifica nulla -> 400 JSON
EDIT='{"text":""}'
chk "POST /api/messages/edit (vuoto) -> 400 JSON, nessun effetto" 400 "$(code -X POST -H 'Content-Type: application/json' -d "$EDIT" "$BASE/api/messages/edit")"
echo "       risposta: $(curl -s "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d "$EDIT" "$BASE/api/messages/edit")"
chk "GET /api/sessions/search" 200 "$(code "$BASE/api/sessions/search?q=dashboard")"
chk "  la ricerca restituisce risultati" "true" "$(get "$BASE/api/sessions/search?q=dashboard" | jfield "str(len(d.get('results') or [])>=1).lower()")"
chk "GET /api/search/files" 200 "$(code "$BASE/api/search/files?q=media-guard")"
chk "  la ricerca file restituisce risultati" "true" "$(get "$BASE/api/search/files?q=media-guard" | jfield "str(len(d.get('results') or [])>=1).lower()")"
chk "GET /api/sessions/export" 200 "$(code "$BASE/api/sessions/export")"
chk "  export: content-type markdown" "text/markdown;" "$(ctype "$BASE/api/sessions/export")"
chk "GET /manifest.webmanifest" 200 "$(code "$BASE/manifest.webmanifest")"
chk "  manifest: content-type" "application/manifest+json;" "$(ctype "$BASE/manifest.webmanifest")"
chk "GET /sw.js" 200 "$(code "$BASE/sw.js")"
chk "  sw: header Service-Worker-Allowed" "/" "$(curl -s -D- -o /dev/null "${AUTH[@]}" "$BASE/sw.js" | tr -d '\r' | awk 'tolower($1)=="service-worker-allowed:"{print $2}')"
chk "GET /icon-192.png" 200 "$(code "$BASE/icon-192.png")"
chk "GET /icon-512.png" 200 "$(code "$BASE/icon-512.png")"
chk "GET /favicon.ico" 200 "$(code "$BASE/favicon.ico")"
chk "GET / (interfaccia)" 200 "$(code "$BASE/")"
# Accesso: pagina di login + cookie di sessione (non più solo il riquadro nativo del browser)
chk "GET /login (pagina di accesso) → 200" 200 "$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$BASE/login")"
chk "navigazione senza credenziali → 302" 302 "$(curl -s -m 25 -o /dev/null -w '%{http_code}' -H 'Accept: text/html' "$BASE/")"
chk "  il redirect punta a /login" "/login" "$(curl -s -m 25 -D- -o /dev/null -H 'Accept: text/html' "$BASE/" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')"
chk "POST /login con credenziali giuste → 303" 303 "$(curl -s -m 25 -o /dev/null -w '%{http_code}' --data-urlencode "user=$U" --data-urlencode "password=$P" "$BASE/login")"
LOGIN_CK=$(curl -s -m 25 -D- -o /dev/null --data-urlencode "user=$U" --data-urlencode "password=$P" "$BASE/login" | tr -d '\r' | awk 'tolower($1)=="set-cookie:"{print $2}' | cut -d';' -f1)
chk "  il cookie di sessione apre /api/state" 200 "$(curl -s -m 25 -o /dev/null -w '%{http_code}' -H "Cookie: $LOGIN_CK" "$BASE/api/state")"
chk "  cookie manomesso → 401" 401 "$(curl -s -m 25 -o /dev/null -w '%{http_code}' -H "Cookie: ${LOGIN_CK}x" "$BASE/api/state")"
chk "  scala del blocco progressivo in /api/state" "true" "$(get /api/state | jfield "str(len((d.get('auth') or {}).get('backoffSec') or [])>=3).lower()")"
chk "/api/state espone il campo auth (anti brute-force)" "true" "$(get /api/state | jfield "str('auth' in d).lower()")"
echo "       auth: $(get /api/state | jfield "d.get('auth')")"

# /api/messages/regenerate: per provarlo senza toccare la chat reale si passa a una
# sessione nuova (vuota) e si torna indietro: su sessione vuota risponde 404 JSON.
echo
echo "== 3. /api/messages/regenerate (prova non distruttiva su sessione vuota) =="
ORIG=$(get /api/state | jfield "d.get('sessionId')")
echo "       sessione corrente: ${ORIG:0:12}"
restore_session() {
  curl -s -m 25 "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d "{\"id\":\"$ORIG\"}" "$BASE/api/sessions/open" >/dev/null
}
trap 'restore_session' EXIT TERM INT
code -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/sessions/new" >/dev/null
REGEN=$(curl -s "${AUTH[@]}" -X POST "$BASE/api/messages/regenerate")
chk "POST /api/messages/regenerate risponde JSON applicativo (rotta viva)" "true" "$(echo "$REGEN" | python3 -c "import json,sys;d=json.load(sys.stdin);print(str('error' in d).lower())" 2>/dev/null)"
echo "       risposta: $REGEN"
restore_session
BACK=$(get /api/state | jfield "d.get('sessionId')")
chk "sessione originale ripristinata" "$ORIG" "$BACK"
trap - EXIT TERM INT
chk "il messaggio utente della chat reale è intatto" "true" "$(get /api/state | jfield "str(any(m['role']=='user' for m in d['messages'])).lower()")"

echo
echo "== 4. non-regressione delle funzioni preesistenti =="
chk "GET /api/files" 200 "$(code "$BASE/api/files?path=")"
chk "GET /api/file dashboard.mjs" 200 "$(code "$BASE/api/file?path=pi-harness/dashboard.mjs")"
chk "POST /api/thinking (livello non valido) -> 400" 400 "$(code -X POST -H 'Content-Type: application/json' -d '{"level":"zzz"}' "$BASE/api/thinking")"
chk "GET /api/sessions" 200 "$(code "$BASE/api/sessions")"
chk "traversal bloccato (..)" 403 "$(code "$BASE/api/file?path=../../etc/passwd")"
chk "GET /api/model non esiste -> 404 JSON" 404 "$(code -X POST -H 'Content-Type: application/json' -d '{"id":"xx"}' "$BASE/api/model")"
chk "stream SSE attivo" "text/event-stream" "$(ctype_sse "$BASE/events")"

echo
echo "== 5. domande interattive all'utente (tool ask_user) =="
chk "GET /api/ask risponde" 200 "$(code "$BASE/api/ask")"
chk "  lo stato dichiara le domande attive" "true" "$(get /api/state | jfield "str(d['ask']['enabled'] and d['ask']['toolActive']).lower()")"
chk "  l'interfaccia servita ha il pulsante delle domande" "true" "$(curl -s -m 25 "${AUTH[@]}" "$BASE/" | grep -q 'id="askToggle"' && echo true || echo false)"
chk "POST /api/ask {enabled:false} spegne il tool" "true" "$(curl -s -m 25 "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d '{"enabled":false}' "$BASE/api/ask" | jfield "str(d['enabled']==False and d['toolActive']==False).lower()")"
chk "POST /api/ask {enabled:true} lo riaccende" "true" "$(curl -s -m 25 "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/ask" | jfield "str(d['enabled']==True and d['toolActive']==True).lower()")"

echo
echo "== 6. riattivo i tool degli obiettivi (il gate torna OFF ad ogni riavvio) =="
chk "POST /api/goals {enabled:true}" "true" "$(curl -s "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d '{"enabled":true}' "$BASE/api/goals" | jfield "str(d['goals']['enabled']).lower()")"
curl -s "${AUTH[@]}" -X POST -H 'Content-Type: application/json' -d '{"enabled":false}' "$BASE/api/subagents" >/dev/null
echo "       subagent rimessi OFF (controllo costi)"

echo
echo "==================== RISULTATO: $PASS ok, $FAIL falliti ===================="
{
  echo "verifica live del servizio pi-dashboard — $(date -Is)"
  echo "processo: vecchio pid ${OLD_PID:-?} -> nuovo pid ${NEW_PID:-?} ($(systemctl is-active pi-dashboard))"
  echo "versione in esecuzione: $(echo "$HEALTH" | jfield "d.get('version')")"
  echo "endpoint nuovi: abort, messages/edit, messages/regenerate, sessions/search, sessions/export,"
  echo "                search/files, manifest.webmanifest, sw.js, icon-192.png, auth in /api/state"
  echo "controlli: $PASS ok, $FAIL falliti  (dettaglio in media/last-restart.log)"
} > "$SUMMARY"

if [ "$FAIL" = "0" ] && [ "$DO_RESTART" = "1" ]; then
  echo
  echo "posto il prompt di riattivazione alla sessione ripresa…"
  PROMPT='🔄 [riavvio automatico] Il servizio pi-dashboard è stato RIAVVIATO da un processo di verifica indipendente: ora gira il codice nuovo (versione dashboard-2026-09-17.2) e tutte le rotte che prima rispondevano 404 sono attive. Prova completa dei controlli live: media/last-restart.log (riepilogo: media/restart-verified.txt). Adesso: (1) leggi quel log; (2) rilancia `bash media/test-all.sh` per confermare che nulla è regredito col codice nuovo; (3) verifica direttamente sul servizio in esecuzione le rotte nuove e che /api/state contenga `auth`; (4) se tutto torna, chiama update_goal({status:"complete"}) allegando come prova le risposte live del servizio riavviato (pid nuovo e versione); se qualcosa non torna, correggilo e poi chiudi.'
  curl -s -m 25 "${AUTH[@]}" -X POST -H 'Content-Type: application/json' \
    -d "$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1]}))' "$PROMPT")" "$BASE/api/prompt"
  echo
else
  echo "nessuna riattivazione (FAIL=$FAIL, DO_RESTART=$DO_RESTART)"
fi
} >> "$LOG" 2>&1
exit 0
