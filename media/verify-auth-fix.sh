#!/usr/bin/env bash
# Verifica post-riavvio del fix di accesso (pagina di login + blocco progressivo).
# Va lanciato come unità transitoria systemd (systemd-run), così sopravvive al riavvio di
# pi-dashboard: aspetta che il servizio serva il CODICE NUOVO e poi controlla, in produzione,
# che i due difetti segnalati siano davvero risolti. Esito in media/verify-auth-fix.txt.
set -uo pipefail
APP=/root/pi-harness
ENVF=$APP/.env
BASE=${BASE:-http://127.0.0.1:8420}
OUT=$APP/media/verify-auth-fix.txt
set -a; . "$ENVF"; set +a
U="$DASH_USER"; P="$DASH_PASSWORD"
AUTH=(-u "$U:$P")
PASS=0; FAIL=0
ok()  { echo "  OK   $1" >> "$OUT"; PASS=$((PASS+1)); }
ko()  { echo "  FAIL $1" >> "$OUT"; FAIL=$((FAIL+1)); }
chk() { if [ "$2" = "$3" ]; then ok "$1 ($3)"; else ko "$1: atteso $2, ottenuto $3"; fi; }
code(){ curl -s -m 20 -o /dev/null -w '%{http_code}' "$@"; }
head1(){ curl -s -m 20 -D- -o /dev/null "$@"; }

: > "$OUT"
{
  echo "== verifica del fix di accesso — $(date -Is) =="
  echo "atteso: versione $(grep -oP 'const VERSION = "\K[^"]+' "$APP/dashboard.mjs" 2>/dev/null)  ·  pid che cambia"
} >> "$OUT"

# 1) si aspetta che il servizio risponda CON IL CODICE NUOVO (fino a 5 minuti)
WANT=$(grep -oP 'const VERSION = "\K[^"]+' "$APP/dashboard.mjs" 2>/dev/null)
PID_BEFORE=${1:-}
GOT=""
for i in $(seq 1 150); do
  GOT=$(curl -s -m 5 "${AUTH[@]}" "$BASE/api/health" | python3 -c "import json,sys;print(json.load(sys.stdin).get('version',''))" 2>/dev/null)
  [ "$GOT" = "$WANT" ] && break
  sleep 2
done
echo "versione servita: ${GOT:-nessuna} (dopo ${i} tentativi)" >> "$OUT"
chk "il servizio in esecuzione ha il codice nuovo" "$WANT" "$GOT"

echo "" >> "$OUT"
echo "== 1. il form di accesso c'è, sempre ==" >> "$OUT"
chk "GET /login → 200" 200 "$(code "$BASE/login")"
FORM=$(curl -s -m 20 "$BASE/login")
case "$FORM" in *'name="user"'*) ok "il form ha il campo utente";; *) ko "campo utente mancante";; esac
case "$FORM" in *'name="password"'*) ok "il form ha il campo password";; *) ko "campo password mancante";; esac
case "$FORM" in *'class="beta"'*) ok 'il marchio "beta" è accanto al nome';; *) ko "marchio beta mancante";; esac
case "$FORM" in *'Universalis Produzioni'*) ok "il copyright di Universalis Produzioni è presente";; *) ko "copyright mancante";; esac
chk "la navigazione senza credenziali rimanda al form" 302 "$(code -H 'Accept: text/html' "$BASE/")"
chk "  il redirect punta a /login" "/login" "$(head1 -H 'Accept: text/html' "$BASE/" | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')"
chk "le API senza credenziali rispondono 401 JSON (non una pagina)" 401 "$(code "$BASE/api/state")"
# la 401 NON deve portare il challenge Basic: sulle fetch il browser trattiene la risposta
chk "nessun WWW-Authenticate (era quello a bloccare le fetch)" "" "$(head1 "$BASE/api/state" | tr -d '\r' | awk 'tolower($1)=="www-authenticate:"{print $2}')"

echo "" >> "$OUT"
echo "== 2. accesso dalla pagina (cookie di sessione) ==" >> "$OUT"
chk "POST /login → 303" 303 "$(curl -s -m 20 -o /dev/null -w '%{http_code}' --data-urlencode "user=$U" --data-urlencode "password=$P" "$BASE/login")"
CK=$(curl -s -m 20 -D- -o /dev/null --data-urlencode "user=$U" --data-urlencode "password=$P" "$BASE/login" | tr -d '\r' | awk 'tolower($1)=="set-cookie:"{print $2}' | cut -d';' -f1)
chk "  il cookie apre /api/state" 200 "$(code -H "Cookie: $CK" "$BASE/api/state")"
chk "  il cookie apre la dashboard" 200 "$(code -H "Cookie: $CK" -H 'Accept: text/html' "$BASE/")"
chk "  cookie manomesso → 401" 401 "$(code -H "Cookie: ${CK}x" "$BASE/api/state")"
chk "  Basic (script/curl) continua a funzionare" 200 "$(code "${AUTH[@]}" "$BASE/api/state")"

echo "" >> "$OUT"
echo "== 3. un caricamento della pagina NON è più un tentativo fallito ==" >> "$OUT"
IPX=203.0.113.77
BEFORE=$(curl -s -m 20 "${AUTH[@]}" "$BASE/api/state" | python3 -c "import json,sys;print(json.load(sys.stdin)['auth']['blockedTotal'])" 2>/dev/null)
for p in / /sw.js /manifest.webmanifest /icon-192.png /icon-512.png /apple-touch-icon.png /favicon.ico /api/state /api/commands / /sw.js /icon-192.png; do
  code -H "X-Forwarded-For: $IPX" -H 'Accept: text/html' "$BASE$p" >/dev/null
done
chk "dopo 12 richieste anonime l'IP NON è bloccato" 200 "$(code -H "X-Forwarded-For: $IPX" "${AUTH[@]}" "$BASE/api/state")"
AFTER=$(curl -s -m 20 "${AUTH[@]}" "$BASE/api/state" | python3 -c "import json,sys;print(json.load(sys.stdin)['auth']['blockedTotal'])" 2>/dev/null)
chk "nessun blocco registrato" "$BEFORE" "$AFTER"

echo "" >> "$OUT"
echo "== 4. blocco progressivo: il primo gradino è corto, poi cresce ==" >> "$OUT"
IPY=203.0.113.88
for i in $(seq 1 8); do code -H "X-Forwarded-For: $IPY" -H "Authorization: Basic $(printf '%s' "$U:sbagliata" | base64)" "$BASE/api/state" >/dev/null; done
RA1=$(head1 -H "X-Forwarded-For: $IPY" "${AUTH[@]}" "$BASE/api/state" | tr -d '\r' | awk 'tolower($1)=="retry-after:"{print $2}')
chk "primo blocco = primo gradino (15s, non 900s)" 15 "$RA1"
BODY=$(curl -s -m 20 -H "X-Forwarded-For: $IPY" "$BASE/login")
case "$BODY" in *'riprovare tra'*) ok "la pagina bloccata mostra il conto alla rovescia";; *) ko "manca il conto alla rovescia";; esac
case "$BODY" in *'disabled'*) ok "i campi sono disabilitati durante l'attesa";; *) ko "campi non disabilitati";; esac
chk "il POST del form durante il blocco → 429" 429 "$(code -H "X-Forwarded-For: $IPY" --data-urlencode "user=$U" --data-urlencode "password=$P" "$BASE/login")"
sleep 16
for i in $(seq 1 8); do code -H "X-Forwarded-For: $IPY" -H "Authorization: Basic $(printf '%s' "$U:sbagliata" | base64)" "$BASE/api/state" >/dev/null; done
RA2=$(head1 -H "X-Forwarded-For: $IPY" "${AUTH[@]}" "$BASE/api/state" | tr -d '\r' | awk 'tolower($1)=="retry-after:"{print $2}')
chk "secondo blocco: l'attesa è salita (30s)" 30 "$RA2"
chk "un altro IP non è toccato" 200 "$(code -H "X-Forwarded-For: 203.0.113.99" "${AUTH[@]}" "$BASE/api/state")"

echo "" >> "$OUT"
echo "RISULTATO: $PASS ok, $FAIL falliti" >> "$OUT"
