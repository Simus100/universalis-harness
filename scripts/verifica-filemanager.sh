#!/usr/bin/env bash
# verifica-filemanager.sh — controllo di funzionamento del file manager della dashboard.
#
# Nato dal controllo delle modifiche del 2026-11-26 (confine DASH_FS_ROOT, lettura
# limitata, blocchi di sistema, ricerca per nome). Non tocca i dati dell'utente: scrive
# solo dentro una cartella temporanea che rimuove alla fine.
#
# Uso:  bash scripts/verifica-filemanager.sh [porta]     (default 8420)
# Esce con 1 se un controllo fallisce, così si può usare anche in un timer.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PORT="${1:-8420}"
BASE="http://127.0.0.1:${PORT}"
UTENTE="${DASH_USER:-$(grep -m1 '^DASH_USER=' .env 2>/dev/null | cut -d= -f2-)}"
PW="${DASH_PASSWORD:-$(grep -m1 '^DASH_PASSWORD=' .env 2>/dev/null | cut -d= -f2-)}"
if [ -z "${UTENTE:-}" ] || [ -z "${PW:-}" ]; then
  echo "credenziali non trovate in .env (DASH_USER / DASH_PASSWORD)" >&2
  exit 2
fi
CURL=(curl -sS -u "${UTENTE}:${PW}" --max-time 60)
BODY=/tmp/verifica-fm-body.json
# cartella dell'istanza attesa (per provare una copia su un'altra porta si sovrascrive)
ISTANZA="${DASH_ISTANZA:-/root}"

ok=0
ko=0

verde=$'\033[32m'; rosso=$'\033[31m'; grigio=$'\033[90m'; fine=$'\033[0m'
passa()   { printf '  %s✓%s %s%s\n' "$verde" "$fine" "$1" "${2:+ — $2}"; ok=$((ok+1)); }
fallisce(){ printf '  %s✗%s %s%s\n' "$rosso" "$fine" "$1" "${2:+ — $2}"; ko=$((ko+1)); }
nota()    { printf '  %s· %s%s\n' "$grigio" "$1" "$fine"; }

# Valuta un'espressione Python sul JSON scaricato: serve a controllare il CONTENUTO
# della risposta, non solo il codice HTTP.
valuta() {
  python3 - "$1" <<'PY'
import json, sys
try:
    d = json.load(open('/tmp/verifica-fm-body.json'))
except Exception:
    d = {}
try:
    print("1" if eval(sys.argv[1], {"d": d}) else "0")
except Exception:
    print("0")
PY
}

# chk <nome> <codice atteso> <url> [espressione python su d]
chk() {
  local nome="$1" atteso="$2" url="$3" expr="${4:-}"
  local code
  code=$(curl -sS -u "${UTENTE}:${PW}" -o "$BODY" -w '%{http_code}' --max-time 60 "$url")
  if [ "$code" != "$atteso" ]; then
    fallisce "$nome" "HTTP $code (atteso $atteso): $(head -c 120 "$BODY" 2>/dev/null)"
    return
  fi
  if [ -n "$expr" ] && [ "$(valuta "$expr")" != "1" ]; then
    fallisce "$nome" "contenuto inatteso: $(head -c 140 "$BODY" 2>/dev/null)"
    return
  fi
  passa "$nome"
}

# chkpost <nome> <codice atteso> <url> <json> [espressione]
chkpost() {
  local nome="$1" atteso="$2" url="$3" corpo="$4" expr="${5:-}"
  local code
  code=$(curl -sS -u "${UTENTE}:${PW}" -X POST -H 'Content-Type: application/json' \
      -d "$corpo" -o "$BODY" -w '%{http_code}' --max-time 60 "$url")
  if [ "$code" != "$atteso" ]; then
    fallisce "$nome" "HTTP $code (atteso $atteso): $(head -c 120 "$BODY" 2>/dev/null)"
    return
  fi
  if [ -n "$expr" ] && [ "$(valuta "$expr")" != "1" ]; then
    fallisce "$nome" "contenuto inatteso: $(head -c 140 "$BODY" 2>/dev/null)"
    return
  fi
  passa "$nome"
}

echo
echo "verifica file manager — ${BASE}  (porta ${PORT})"

echo
echo "1. servizio e stato"
chk "GET /api/state" 200 "$BASE/api/state"
chk "GET /api/health" 200 "$BASE/api/health" || true
chk "GET /api/goals" 200 "$BASE/api/goals"
chk "GET /api/sessions" 200 "$BASE/api/sessions"
chk "GET /api/skills" 200 "$BASE/api/skills"
chk "GET /api/progetto" 200 "$BASE/api/progetto"

echo
echo "2. navigazione (radice dell'istanza e radice del disco)"
chk "elenco di default (radice del file manager)" 200 "$BASE/api/files" "d['path']=='/' and any(e['name']=='srv' for e in d['entries'])"
chk "  indica dov'è la cartella dell'istanza" 200 "$BASE/api/files" "d['istanza']=='${ISTANZA}'"
PYQ=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$ISTANZA" 2>/dev/null || echo "$ISTANZA")
chk "tasto «istanza» (cartella della dashboard)" 200 "$BASE/api/files?path=$PYQ" "d['path']=='${ISTANZA}'"
chk "radice del disco" 200 "$BASE/api/files?path=%2F" "d['path']=='/' and d['parent'] is None"
chk "  e niente /proc nell'elenco" 200 "$BASE/api/files?path=%2F" "not any(e['name']=='proc' for e in d['entries'])"
chk "/root/pi-harness" 200 "$BASE/api/files?path=%2Froot%2Fpi-harness" "d['path']=='/root/pi-harness' and len(d['entries'])>0"
chk "/opt/n8n" 200 "$BASE/api/files?path=%2Fopt%2Fn8n" "len(d['entries'])>0"
chk "/srv/n8n-files" 200 "$BASE/api/files?path=%2Fsrv%2Fn8n-files" "len(d['entries'])>=2"
chk "/etc" 200 "$BASE/api/files?path=%2Fetc" "len(d['entries'])>0"
chk "/var/log" 200 "$BASE/api/files?path=%2Fvar%2Flog" "len(d['entries'])>0"
chk "percorso relativo (media) resta relativo alla root dell'istanza" 200 "$BASE/api/files?path=media" "d['path'].startswith(d['istanza'])"

echo
echo "2b. clic sui figli della radice (come li compone la UI: radice + \"/\" + nome)"
FIGLI=$(curl -sS -u "${UTENTE}:${PW}" "$BASE/api/files?path=" --max-time 30 | python3 -c "
import json,sys
d=json.load(sys.stdin)
rad=d.get('path','')
def comp(n): return (rad.rstrip('/')+'/'+n) if rad else n
print('\n'.join(comp(e['name']) for e in d.get('entries',[]) if e.get('type')=='dir'))
" 2>/dev/null)
aprono=0; nonaprono=0
while IFS= read -r p; do
  [ -z "$p" ] && continue
  code=$(curl -sS -u "${UTENTE}:${PW}" -o "$BODY" -w '%{http_code}' --max-time 30 \
        "$BASE/api/files?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$p")")
  if [ "$code" = "200" ]; then
    aprono=$((aprono+1))
  else
    nonaprono=$((nonaprono+1))
    fallisce "figlio della radice «$p»" "HTTP $code: $(head -c 90 "$BODY" 2>/dev/null)"
  fi
done <<<"$FIGLI"
[ "$nonaprono" -eq 0 ] && passa "tutti i $aprono figli della radice si aprono"

echo
echo "3. lettura file"
chk "file di testo fuori dalla root" 200 "$BASE/api/file?path=%2Fopt%2Fn8n%2FREADME.md" \
    "d['path'].startswith('/opt/n8n') and d['size']>0 and not d['truncated']"
chk "file binario (non modificabile)" 200 "$BASE/api/file?path=%2Fbin%2Fls" "d['binary'] is True"
chk "percorso inesistente" 404 "$BASE/api/file?path=%2Fnon-esiste-mai.txt"
chk "/proc rifiutato" 403 "$BASE/api/file?path=%2Fproc%2Fself%2Fcmdline"
chk "/sys rifiutato" 403 "$BASE/api/files?path=%2Fsys"
chk "/dev rifiutato" 403 "$BASE/api/files?path=%2Fdev"
chk "nessun percorso con ../../ nelle risposte" 200 "$BASE/api/files?path=%2Fopt%2Fn8n" \
    "'../' not in d['path'] and all('/../' not in e['name'] for e in d['entries'])"

echo
echo "4. scrittura in una cartella temporanea"
PROVA="/tmp/verifica-fm-$$"
chkpost "crea cartella" 200 "$BASE/api/file/mkdir" "{\"path\":\"${PROVA}\"}" "d['ok'] is True"
chkpost "scrivi file" 200 "$BASE/api/file" "{\"path\":\"${PROVA}/prova.txt\",\"content\":\"ciao verifica\\n\"}" \
    "d['size']==14"
chk "rileggi il file scritto" 200 "$BASE/api/file?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "${PROVA}/prova.txt")" \
    "d['content'].startswith('ciao verifica')"
chkpost "rinomina file" 200 "$BASE/api/file/rename" "{\"from\":\"${PROVA}/prova.txt\",\"to\":\"${PROVA}/rinominato.txt\"}" \
    "d['ok'] is True"
chkpost "cancella file" 200 "$BASE/api/file/delete" "{\"path\":\"${PROVA}/rinominato.txt\"}" "d['ok'] is True"
nota "upload e download si provano a parte (richiedono multipart/stream)"

echo
echo "5. protezioni sulle cartelle di sistema"
chkpost "delete /etc rifiutato" 400 "$BASE/api/file/delete" '{"path":"/etc"}'
chkpost "delete /root rifiutato" 400 "$BASE/api/file/delete" '{"path":"/root"}'
chkpost "rename /srv rifiutato" 400 "$BASE/api/file/rename" '{"from":"/srv","to":"/srv2"}'
chkpost "rename /usr rifiutato" 400 "$BASE/api/file/rename" '{"from":"/usr","to":"/usr2"}'
chkpost "delete radice rifiutato" 400 "$BASE/api/file/delete" '{"path":"/"}'

echo
echo "6. download"
chk "download di un file" 200 "$BASE/api/download?path=%2Fetc%2Fhostname" || true
code=$(curl -sS -u "${UTENTE}:${PW}" -o /tmp/verifica-fm-dl --max-time 60 -w '%{http_code}' \
       "$BASE/api/download?path=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "/srv/n8n-files")")
if [ "$code" = "200" ] && [ "$(head -c 2 /tmp/verifica-fm-dl)" = "PK" ]; then
  passa "download di una cartella come zip"
else
  fallisce "download di una cartella come zip" "HTTP $code, primi byte: $(head -c 8 /tmp/verifica-fm-dl | tr -d '\0')"
fi
rm -f /tmp/verifica-fm-dl

echo
echo "7. ricerca (le tre modalità, due ambiti)"
chk "cartelle 'n8n' in tutto il server" 200 "$BASE/api/search/files?q=n8n&cosa=cartelle&ambito=tutto" \
    "any(r['path']=='/opt/n8n' for r in d['results'])"
chk "  senza troncamento" 200 "$BASE/api/search/files?q=n8n&cosa=cartelle&ambito=tutto" "d['truncated'] is False"
chk "  etichetta di partenza" 200 "$BASE/api/search/files?q=n8n&cosa=cartelle&ambito=tutto" "d['da']=='/'"
chk "file 'esempio' in tutto il server" 200 "$BASE/api/search/files?q=esempio&cosa=file&ambito=tutto" \
    "any(r['name']=='esempio.csv' for r in d['results'])"
chk "contenuto 'DASH_FS_ROOT' nella cartella corrente" 200 "$BASE/api/search/files?q=DASH_FS_ROOT&cosa=contenuto&ambito=qui&path=%2Froot%2Fpi-harness" \
    "len(d['results'])>0 and d['da']=='/root/pi-harness'"
chk "ambito=qui non esce dalla cartella" 200 "$BASE/api/search/files?q=n8n&cosa=cartelle&ambito=qui&path=%2Froot" \
    "d['da']=='/root' and not any(r['path'].startswith('/opt') for r in d['results'])"
chk "query troppo corta non cerca" 200 "$BASE/api/search/files?q=a&cosa=file&ambito=tutto" "d['results']==[]"

echo
echo "8. isolamento (un'istanza senza DASH_FS_ROOT)"
nota "si verifica con: env -u DASH_FS_ROOT node dashboard.mjs --port 8455 --root /tmp/x"
nota "(il test automatico è in docs/MANUALE.md, sezione «Confine allargato»)"

echo
rm -rf "$PROVA"

printf '\n%d controlli superati, %d falliti\n' "$ok" "$ko"
[ "$ko" -eq 0 ]
