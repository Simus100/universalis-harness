#!/usr/bin/env bash
# Test funzionali della dashboard (istanza di prova su :8430).
# Uso: bash media/test-api.sh [start|stop|full]
set -uo pipefail
B=http://127.0.0.1:8430
PIDF=/tmp/pi-test/pid
PASS=0; FAIL=0
ok()   { echo "  ✔ $1"; PASS=$((PASS+1)); }
ko()   { echo "  ✘ $1"; FAIL=$((FAIL+1)); }
check(){ # check <desc> <atteso> <ottenuto>
  if [ "$2" = "$3" ]; then ok "$1 ($3)"; else ko "$1: atteso $2, ottenuto $3"; fi
}
code(){ curl -s -o /dev/null -w "%{http_code}" "$@"; }

# libera la porta 8430: senza questo si rischia di testare un'istanza vecchia
free_port() {
  local pids p
  pids=$(ss -lptnH 'sport = :8430' 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)
  for p in $pids; do kill "$p" 2>/dev/null; done
  [ -n "$pids" ] && sleep 1
  for i in $(seq 1 20); do
    [ -z "$(ss -lptnH 'sport = :8430' 2>/dev/null)" ] && return 0
    sleep 0.5
  done
  return 1
}

start() {
  free_port || { echo "porta 8430 ancora occupata"; return 1; }
  mkdir -p /tmp/pi-test/sessions /tmp/pi-test/media
  rm -f /tmp/pi-test/sessions/*.jsonl
  cd /root/pi-harness
  # DASH_ASK=off: istanza NON presidiata (test automatici) — se il modello decidesse di fare una
  # domanda all'utente, nessuno risponderebbe e il test aspetterebbe il timeout per nulla.
  # DASH_AUTH_BACKOFF corto: la scala progressiva si verifica in secondi invece che in minuti.
  # DASH_SESSION_SECRET_FILE: il segreto di sessione dei test resta in /tmp, non tocca la produzione.
  DASH_ASK=off DASH_SESSION_DIR=/tmp/pi-test/sessions DASH_MEDIA_DIR=/tmp/pi-test/media \
    DASH_SESSION_SECRET_FILE=/tmp/pi-test/.session-secret DASH_AUTH_BACKOFF="3,6,12" \
    nohup node dashboard.mjs --port 8430 --user pi --password testpass --root /root >/tmp/pi-test/log.txt 2>&1 &
  echo $! > "$PIDF"
  for i in $(seq 1 40); do
    if [ "$(code -u pi:testpass $B/api/state)" = "200" ]; then
      local listening
      listening=$(ss -lptnH 'sport = :8430' 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1)
      if [ "$listening" = "$(cat $PIDF)" ]; then
        echo "istanza di prova su :8430 (pid $(cat $PIDF))"
        return 0
      fi
      echo "attenzione: risponde il pid $listening, atteso $(cat $PIDF)"; return 1
    fi
    sleep 0.5
  done
  echo "avvio fallito"; tail -5 /tmp/pi-test/log.txt; return 1
}
stop() { [ -f "$PIDF" ] && kill "$(cat $PIDF)" 2>/dev/null; rm -f "$PIDF"; echo "istanza di prova fermata"; }

tests() {
  echo "== 1. autenticazione / anti brute-force =="
  check "senza credenziali → 401" 401 "$(code $B/api/state)"
  check "password sbagliata → 401" 401 "$(code -u pi:xxx $B/api/state)"
  check "credenziali giuste → 200" 200 "$(code -u pi:testpass $B/api/state)"
  local ip=10.9.9.9
  for i in $(seq 1 8); do code -H "X-Forwarded-For: $ip" -u pi:xxx $B/api/state >/dev/null; done
  local ra; ra=$(curl -s -D- -o /dev/null -H "X-Forwarded-For: $ip" -u pi:testpass $B/api/state | tr -d '\r' | awk 'tolower($1)=="retry-after:"{print $2}')
  check "IP bloccato dopo 8 tentativi → 429" 429 "$(code -H "X-Forwarded-For: $ip" -u pi:testpass $B/api/state)"
  [ -n "$ra" ] && ok "header Retry-After presente ($ra s)" || ko "header Retry-After mancante"
  check "altro IP non bloccato → 200" 200 "$(code -H "X-Forwarded-For: 10.8.8.8" -u pi:testpass $B/api/state)"
  local blocked; blocked=$(curl -s -H "X-Forwarded-For: 10.8.8.8" -u pi:testpass $B/api/state | python3 -c "import json,sys;print(json.load(sys.stdin)['auth']['blockedIps'])")
  check "contatore IP bloccati in /api/state" 1 "$blocked"

  # il contatore dei fallimenti deve azzerarsi al primo login riuscito
  local ip2=10.7.7.7
  for i in 1 2 3; do code -H "X-Forwarded-For: $ip2" -u pi:xxx $B/api/state >/dev/null; done
  check "un login riuscito azzera i tentativi falliti" 200 "$(code -H "X-Forwarded-For: $ip2" -u pi:testpass $B/api/state)"
  for i in 1 2 3 4 5; do code -H "X-Forwarded-For: $ip2" -u pi:xxx $B/api/state >/dev/null; done
  check "dopo il reset 5 tentativi non bloccano l'IP" 200 "$(code -H "X-Forwarded-For: $ip2" -u pi:testpass $B/api/state)"
  check "i contatori non bloccano gli altri IP" 200 "$(code -H "X-Forwarded-For: 10.6.6.6" -u pi:testpass $B/api/state)"

  echo "== 0. health/versione del codice in esecuzione =="
  check "GET /api/health → 200" 200 "$(code -u pi:testpass $B/api/health)"
  # Asserzione utile: la versione SERVITA deve coincidere con quella nel codice
  # (cioè il servizio in esecuzione ha davvero il codice nuovo). Prima era un valore
  # hardcoded che andava fuori sincrono a ogni bump della versione.
  VCODE=$(grep -oP 'const VERSION = "\K[^"]+' /root/pi-harness/dashboard.mjs)
  check "la versione servita coincide con quella nel codice" "$VCODE" "$(curl -s -u pi:testpass $B/api/health | python3 -c "import json,sys;print(json.load(sys.stdin)['version'])")"
  # Non il numero di funzioni (fragile, cresce nel tempo) ma la presenza di quelle chiave.
  FEATS=$(curl -s -u pi:testpass $B/api/health | python3 -c "import json,sys;print(','.join(json.load(sys.stdin)['features']))")
  for f in auth-bruteforce-limit abort goals-planning scheduler-cron slash-commands skills pwa-assets; do
    check "/api/health dichiara la funzione $f" "si" "$(echo "$FEATS" | grep -q "$f" && echo si || echo no)"
  done
  check "/api/health è protetto dall'autenticazione" 401 "$(code $B/api/health)"
  for f in auth-progressive-backoff login-page-session; do
    check "/api/health dichiara la funzione $f" "si" "$(echo "$FEATS" | grep -q "$f" && echo si || echo no)"
  done

  echo "== 2. il caricamento della pagina NON è un tentativo fallito =="
  # Difetto storico: ogni 401 contava come tentativo, quindi UNA sola apertura della pagina
  # (documento + asset PWA + una fetch) faceva scattare il blocco pieno senza che nessuno
  # avesse compilato niente. Qui si verifica che le richieste senza credenziali non contino.
  local ipanon=10.12.0.1
  local before after
  before=$(curl -s -u pi:testpass $B/api/state | python3 -c "import json,sys;print(json.load(sys.stdin)['auth']['blockedTotal'])")
  for p in / /sw.js /manifest.webmanifest /icon-192.png /icon-512.png /apple-touch-icon.png /favicon.ico /api/state /api/commands / /sw.js /icon-192.png /api/state; do
    code -H "X-Forwarded-For: $ipanon" -H "Accept: text/html" "$B$p" >/dev/null
  done
  check "dopo 13 richieste anonime l'IP non è bloccato" 200 "$(code -H "X-Forwarded-For: $ipanon" -u pi:testpass $B/api/state)"
  after=$(curl -s -u pi:testpass $B/api/state | python3 -c "import json,sys;print(json.load(sys.stdin)['auth']['blockedTotal'])")
  check "nessun blocco registrato dalle richieste anonime" "$before" "$after"

  echo "== 3. pagina di login e sessione via cookie =="
  # Il riquadro nativo del browser non è affidabile (app installata in standalone, iOS, dopo
  # qualche "annulla"): la pagina di login servita dall'app deve esserci sempre.
  local cj=/tmp/pi-test/cookies.txt
  rm -f "$cj"
  check "la navigazione senza credenziali rimanda al form" 302 "$(code -H "Accept: text/html" $B/)"
  local loc; loc=$(curl -s -D- -o /dev/null -H "Accept: text/html" $B/ | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')
  check "il redirect punta a /login" "/login" "$loc"
  check "GET /login è pubblico → 200" 200 "$(code $B/login)"
  local form; form=$(curl -s $B/login)
  echo "$form" | grep -q 'name="user"' && ok "il form ha il campo utente" || ko "campo utente mancante"
  echo "$form" | grep -q 'name="password"' && ok "il form ha il campo password" || ko "campo password mancante"
  check "POST /login con dati giusti → 303" 303 "$(code -c "$cj" -d "user=pi&password=testpass" $B/login)"
  check "POST /login con dati sbagliati → 401" 401 "$(code -d "user=pi&password=no" $B/login)"
  check "/api/state col cookie di sessione → 200" 200 "$(code -b "$cj" $B/api/state)"
  check "la dashboard col cookie → 200" 200 "$(code -b "$cj" -H "Accept: text/html" $B/)"
  local ck; ck=$(grep -o 'pi_session[^ ]*' "$cj" | head -1)
  check "cookie manomesso → 401" 401 "$(code -H "Cookie: ${ck}x" $B/api/state)"
  check "cookie inventato → 401" 401 "$(code -H "Cookie: pi_session=xxx.yyy" $B/api/state)"
  local so; so=$(curl -s -D- -o /dev/null -b "$cj" $B/logout | tr -d '\r' | grep -ci "max-age=0")
  check "/logout scade il cookie" 1 "$so"
  # CSRF: una scrittura autenticata dal cookie deve arrivare dalla nostra origine
  check "POST con Origin estranea → 403" 403 "$(code -H "Origin: https://male.example" -b "$cj" -H "Content-Type: application/json" -d '{}' $B/api/prompt)"

  echo "== 4. blocco progressivo (l'attesa cresce a ogni blocco) =="
  local ipp=10.13.0.1
  local raprimo rasecondo
  for i in $(seq 1 8); do code -H "X-Forwarded-For: $ipp" -u pi:xxx $B/api/state >/dev/null; done
  raprimo=$(curl -s -D- -o /dev/null -H "X-Forwarded-For: $ipp" -u pi:testpass $B/api/state | tr -d '\r' | awk 'tolower($1)=="retry-after:"{print $2}')
  check "primo blocco: il gradino è corto (3s, non 15 min)" 3 "$raprimo"
  check "durante il blocco anche il form è sospeso" 429 "$(code -H "X-Forwarded-For: $ipp" -d "user=pi&password=testpass" $B/login)"
  local body; body=$(curl -s -H "X-Forwarded-For: $ipp" $B/login)
  echo "$body" | grep -qi "riprovare tra" && ok "la pagina bloccata mostra il conto alla rovescia" || ko "manca il conto alla rovescia"
  sleep 4
  for i in $(seq 1 8); do code -H "X-Forwarded-For: $ipp" -u pi:xxx $B/api/state >/dev/null; done
  rasecondo=$(curl -s -D- -o /dev/null -H "X-Forwarded-For: $ipp" -u pi:testpass $B/api/state | tr -d '\r' | awk 'tolower($1)=="retry-after:"{print $2}')
  check "secondo blocco: l'attesa è salita (6s)" 6 "$rasecondo"

  echo "== 6. PWA: manifest, service worker, icone =="
  check "GET /manifest.webmanifest"  200 "$(code -u pi:testpass $B/manifest.webmanifest)"
  check "GET /sw.js"                 200 "$(code -u pi:testpass $B/sw.js)"
  check "GET /icon-192.png"          200 "$(code -u pi:testpass $B/icon-192.png)"
  check "GET /icon-512.png"          200 "$(code -u pi:testpass $B/icon-512.png)"
  check "GET /apple-touch-icon.png"  200 "$(code -u pi:testpass $B/apple-touch-icon.png)"
  check "GET /favicon.ico"           200 "$(code -u pi:testpass $B/favicon.ico)"
  local ct; ct=$(curl -s -D- -o /dev/null -u pi:testpass $B/manifest.webmanifest | tr -d '\r' | awk 'tolower($1)=="content-type:"{print $2}')
  check "content-type del manifest" "application/manifest+json;" "$ct"
  local sw; sw=$(curl -s -D- -o /dev/null -u pi:testpass $B/sw.js | tr -d '\r' | awk 'tolower($1)=="service-worker-allowed:"{print $2}')
  check "header Service-Worker-Allowed" "/" "$sw"
  local html; html=$(curl -s -u pi:testpass $B/ | grep -c "manifest.webmanifest")
  [ "$html" -ge 1 ] && ok "dashboard.html collega il manifest" || ko "manifest non collegato in dashboard.html"
  check "manifest è JSON valido" "ok" "$(curl -s -u pi:testpass $B/manifest.webmanifest | python3 -c "import json,sys;json.load(sys.stdin);print('ok')" 2>/dev/null || echo err)"
  local png; png=$(curl -s -u pi:testpass $B/icon-192.png | file - | grep -c "PNG image data, 192 x 192")
  check "l'icona 192 è un PNG valido" 1 "$png"

  echo "== 4/5. ricerca ed export (con una sessione reale) =="
  local sid; sid=$(curl -s -u pi:testpass $B/api/state | python3 -c "import json,sys;print(json.load(sys.stdin)['sessionId'])")
  [ -n "$sid" ] && ok "sessione corrente: ${sid:0:8}" || ko "sessionId mancante"
  local exp; exp=$(curl -s -D/tmp/pi-test/h.txt -u pi:testpass "$B/api/sessions/export"; head -1 /tmp/pi-test/h.txt)
  check "export senza id → 200 + markdown" 200 "$(curl -s -o /dev/null -w '%{http_code}' -u pi:testpass "$B/api/sessions/export")"
  grep -qi "attachment; filename=" /tmp/pi-test/h.txt && ok "Content-Disposition: attachment" || ko "Content-Disposition mancante"
  check "GET /api/sessions/search (q corta) → 200" 200 "$(code -u pi:testpass "$B/api/sessions/search?q=a")"
  check "GET /api/search/files (q corta) → 200" 200 "$(code -u pi:testpass "$B/api/search/files?q=a")"
  check "export di una sessione inesistente → 404" 404 "$(code -u pi:testpass "$B/api/sessions/export?id=non-esiste")"
  check "ricerca file fuori root → 403" 403 "$(code -u pi:testpass "$B/api/search/files?q=root&path=../..")"

  echo
  echo "risultato: $PASS ok, $FAIL falliti"
  [ "$FAIL" = "0" ]
}

case "${1:-full}" in
  start) start ;;
  stop) stop ;;
  tests) tests ;;
  *) start && tests; rc=$?; [ "${KEEP:-0}" = "1" ] || stop; exit $rc ;;
esac
