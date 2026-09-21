#!/usr/bin/env bash
# Smoke test post-riavvio di Universalis Harness.
# Gira come unità transitoria systemd (fuori dal cgroup del servizio), quindi
# sopravvive al riavvio di pi-dashboard. Scrive l'esito in questo file.
set -uo pipefail

OUT=/root/pi-harness/media/post-restart-check.txt
LOG=/root/pi-harness/media/last-restart.log
B=https://harness.universalisproduzioni.it
R="--resolve harness.universalisproduzioni.it:443:127.0.0.1"

{
  echo "== smoke test post-riavvio =="
  echo "quando: $(date '+%Y-%m-%d %H:%M:%S %Z')"

  # 1) il servizio è tornato su E risponde davvero (is-active diventa vero
  #    appena parte il processo, prima che l'app sia in ascolto: aspettiamo l'HTTP)
  for i in $(seq 1 40); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -m 3 $R "$B/api/health" 2>/dev/null || echo 000)
    [ "$code" = "200" ] || [ "$code" = "401" ] && break
    sleep 2
  done
  echo "servizio : $(systemctl is-active pi-dashboard)  ·  avviato: $(systemctl show -p ActiveEnterTimestamp --value pi-dashboard)"
  echo "risposta : /api/health → $code  (dopo ${i} tentativi)"

  set -a; . /root/pi-harness/.env; set +a
  U="$DASH_USER:$DASH_PASSWORD"

  # 2) versione e funzioni caricate
  curl -s -u "$U" $R "$B/api/health" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('versione :', d.get('version'))
print('pid      :', d.get('pid'), '· node', d.get('node'))
want = ['auth-bruteforce-limit','auth-progressive-backoff','login-page-session','abort','messages-edit','messages-regenerate','sessions-search','sessions-export','files-search','pwa-assets','backup-timer','goals-planning','scheduler-cron','slash-commands','skills','stream-replay','stream-snapshot','stream-segments']
have = set(d.get('features') or [])
for f in want:
    print(('  ok  ' if f in have else '  MANCA ') + f)
"

  # 3) pagina e elementi nuovi
  page=$(curl -s -u "$U" $R "$B/")
  printf 'pagina   : %s byte\n' "${#page}"
  for needle in 'class="pill feat-btn"' 'id="compactBtn"' 'id="connTxt"'; do
    case "$page" in
      *"$needle"*) echo "  ok   $needle" ;;
      *)           echo "  MANCA $needle" ;;
    esac
  done

  # 3b) resilienza dello stream in produzione: lo script servito deve saper distinguere il
  #     guasto di trasporto, riallinearsi con lo snapshot e mostrare lo stato di connessione
  for needle in 'stream_snapshot' 'connTxt' 'e.data === undefined'; do
    case "$page" in
      *"$needle"*) echo "  ok   resilienza: $needle" ;;
      *)           echo "  MANCA resilienza: $needle" ;;
    esac
  done
  # 3b-bis) lo streaming dei tool: card DENTRO il messaggio e snapshot a segmenti
  for needle in 'function appendToolCard' 'function renderStreamSegments' 'Array.isArray(d.segments)' 'cur.wrap.appendChild(card)'; do
    case "$page" in
      *"$needle"*) echo "  ok   tool nel messaggio: $needle" ;;
      *)           echo "  MANCA tool nel messaggio: $needle" ;;
    esac
  done
  # il server deve mandare gli id per il replay. L'evento di apertura (lo stato) è per
  # definizione senza id, quindi se ne provoca uno innocuo — si rimette lo stesso livello di
  # thinking — mentre lo stream è aperto.
  LV=$(curl -s -u "$U" $R "$B/api/state" | python3 -c "import json,sys;print(json.load(sys.stdin)['thinking']['level'])" 2>/dev/null)
  sse=$(mktemp)
  curl -s -N -u "$U" -m 4 $R "$B/events" > "$sse" 2>/dev/null &
  sse_pid=$!
  sleep 1
  curl -s -o /dev/null -u "$U" -X POST -H 'Content-Type: application/json' -d "{\"level\":\"$LV\"}" $R "$B/api/thinking"
  sleep 2
  if grep -q '^id: ' "$sse"; then
    echo "  ok   /events assegna id: (replay attivo, $(( $(grep -c '^id: ' "$sse") )) eventi numerati)"
  else
    echo "  MANCA /events assegna id: (replay non attivo)"
  fi
  wait $sse_pid 2>/dev/null
  rm -f "$sse"

  # 3c) la password NON deve finire nei log di sistema
  if journalctl -u pi-dashboard --since "-5 min" --no-pager 2>/dev/null | grep -q "password: $DASH_PASSWORD"; then
    echo "  PROBLEMA: la password compare in chiaro nei log del servizio"
  else
    echo "  ok   la password non compare nei log del servizio"
  fi

  # 4) auth: senza credenziali deve essere 401
  echo "senza credenziali: $(curl -s -o /dev/null -w '%{http_code}' $R "$B/api/state")  (atteso 401)"

  # 5) manifest/icone
  echo "manifest : $(curl -s -u "$U" $R "$B/manifest.webmanifest" | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])' 2>/dev/null)"
  echo "favicon  : $(curl -s -o /dev/null -w '%{http_code} %{size_download}B' -u "$U" $R "$B/favicon.ico")"

  # 6) chi ha ancora le credenziali vecchie / errori recenti
  echo "-- ultime righe del servizio:"
  journalctl -u pi-dashboard --since "-3 min" --no-pager 2>/dev/null | tail -6 | sed 's/^/   /'
  echo "== fine =="
} > "$OUT" 2>&1

# copia anche nel log storico dei riavvii
{ echo; echo "----- $(date '+%Y-%m-%d %H:%M:%S') (smoke test) -----"; cat "$OUT"; } >> "$LOG" 2>/dev/null
