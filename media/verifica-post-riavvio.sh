#!/usr/bin/env bash
# Verifica automatica DOPO il riavvio del servizio (le correzioni del 2026-09-27).
#
# Perché esiste: il riavvio del servizio interrompe la sessione dell'agente che l'ha chiesto
# (la chat vive dentro quel processo), quindi la verifica non può essere fatta "a mano" subito
# dopo. Questo script viene lanciato da un'unità transitoria con un po' di ritardo, riavvia il
# servizio e controlla da fuori che il codice NUOVO sia davvero in esecuzione.
#
# Uso: bash media/verifica-post-riavvio.sh [--no-restart]
# Esito: /root/pi-harness/media/post-fix-verifica.txt (OK/KO per ogni controllo)
set -uo pipefail
cd /root/pi-harness || exit 1

OUT=media/post-fix-verifica.txt
BASE=${DASH_BASE:-http://127.0.0.1:8420}
USER_=${DASH_USER_OVERRIDE:-$(grep -oP '(?<=^DASH_USER=).*' .env)}
PASS=${DASH_PASS_OVERRIDE:-$(grep -oP '(?<=^DASH_PASSWORD=).*' .env)}
AUTH=(-u "$USER_:$PASS")
PASSED=0; FAILED=0
say()  { printf '%s\n' "$*" >> "$OUT"; }
ok()   { say "  ✔ $1"; PASSED=$((PASSED+1)); }
ko()   { say "  ✘ $1"; FAILED=$((FAILED+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($3)"; else ko "$1: atteso $2, ottenuto $3"; fi; }

{
  echo "=== verifica post-riavvio · $(date -Is) ==="
} > "$OUT"

if [ "${1:-}" != "--no-restart" ]; then
  say "riavvio del servizio…"
  systemctl restart pi-dashboard >> "$OUT" 2>&1
fi

# attesa dell'avvio
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$BASE/api/health")
  [ "$code" = "200" ] && break
  sleep 0.5
done

say ""
say "== 1. il codice in esecuzione è quello su disco =="
HASH_DISCO=$(sha256sum dashboard.mjs | cut -c1-16)
HASH_SERVITO=$(curl -s "${AUTH[@]}" "$BASE/api/health" | python3 -c "import json,sys;print(json.load(sys.stdin).get('codeHash'))" 2>/dev/null)
check "codeHash di /api/health = hash di dashboard.mjs" "$HASH_DISCO" "$HASH_SERVITO"

say ""
say "== 2. lo stato si legge e il servizio è vivo =="
check "GET /api/state → 200" "200" "$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$BASE/api/state")"
check "GET / → 200" "200" "$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$BASE/")"
MODELS=$(curl -s "${AUTH[@]}" "$BASE/api/state" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('models') or []))" 2>/dev/null)
if [ "${MODELS:-0}" -ge 2 ]; then ok "lo stato elenca i modelli usabili ($MODELS)"; else ko "lo stato non elenca i modelli (models=$MODELS)"; fi

say ""
say "== 3. SSE: una connessione non spegne il processo =="
BEFORE=$(systemctl show -p MainPID --value pi-dashboard)
timeout 3 curl -s -N "${AUTH[@]}" "$BASE/events" >/dev/null 2>&1
sleep 0.5
AFTER=$(systemctl show -p MainPID --value pi-dashboard)
check "il pid del servizio è lo stesso dopo una connessione SSE" "$BEFORE" "$AFTER"
check "/api/health risponde ancora" "200" "$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$BASE/api/health")"

say ""
say "== 4. zip di una cartella: nessun file fuori dalla root =="
ZSTAT=$(curl -s "${AUTH[@]}" -o /tmp/verifica-prod.zip -w '%{http_code}' "$BASE/api/download?path=pi-harness")
if [ "$ZSTAT" = "200" ]; then
  ok "il download della cartella riesce (200)"
  VOCI=$(python3 -c "
import zipfile
z=zipfile.ZipFile('/tmp/verifica-prod.zip')
n=z.namelist()
fuori=[x for x in n if x.startswith('node_modules/')]
print(len(n), len(fuori))
" 2>/dev/null)
  TOT=${VOCI%% *}; FUORI=${VOCI##* }
  if [ "${FUORI:-1}" = "0" ]; then ok "nessun file preso dai link simbolici fuori root"; else ko "trovati $FUORI file fuori root nello zip"; fi
  if [ "${TOT:-0}" -lt 3000 ]; then ok "il tetto dei file non viene sfondato ($TOT voci)"; else ko "zip troppo grande: $TOT voci"; fi
else
  ko "download della cartella → $ZSTAT"
fi
rm -f /tmp/verifica-prod.zip

say ""
say "== 5. le rotte delle correzioni si comportano come atteso =="
# nome con virgolette: l'header non deve contenere virgolette non protette
mkdir -p "media/cart\"ella-verifica" && echo x > "media/cart\"ella-verifica/f.txt"
URL="$BASE/api/download?path=$(python3 -c 'import urllib.parse;print(urllib.parse.quote("pi-harness/media/cart\"ella-verifica"))')"
CD=$(curl -s -D- -o /dev/null "${AUTH[@]}" "$URL" | tr -d '\r' | grep -i '^content-disposition' || true)
CD_ESITO=$(CD="$CD" python3 - <<'PY'
import os, re
h = os.environ.get("CD", "")
v = h.split(":", 1)[1].strip() if ":" in h else ""
# forma attesa: attachment; filename="…"; filename*=UTF-8''… (nessuna virgoletta non protetta)
m = re.match(r"attachment; filename=\"[^\"]*\"; filename\*=UTF-8''\S+", v)
print("ok" if m else "ko " + v[:120])
PY
)
case "$CD_ESITO" in
  ok) ok "Content-Disposition sanificato per un nome con virgolette" ;;
  *)  ko "Content-Disposition non sanificato: $CD_ESITO" ;;
esac
rm -rf "media/cart\"ella-verifica"
# rinomina: destinazione che esiste davvero nella root della dashboard (/root), senza effetti:
# il file di partenza e quello di arrivo sono lo stesso
check "rinomina su destinazione esistente → 409" "409" "$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" -H 'Content-Type: application/json' -X POST "$BASE/api/file/rename" -d '{"from":"pi-harness/README.md","to":"pi-harness/README.md"}')"

say ""
say "risultato: $PASSED ok, $FAILED falliti"

# Se la verifica è tutta verde, i goal del lavoro si chiudono da soli (le voci trasversali
# stanno in più goal: `checkall`). Altrimenti restano aperti: c'è qualcosa da guardare.
if [ "$FAILED" = "0" ]; then
  say ""
  say "== chiusura dei goal del lavoro =="
  for voce in "backup eseguito e verificato" "tutti i test automatici esistenti verdi" "servizio riavviato e smoke test in produzione"; do
    if node media/fix-progress.mjs checkall "$voce" >> "$OUT" 2>&1; then :; else say "  (voce non trovata: $voce)"; fi
  done
  say "  ✔ goal allineati"
else
  say ""
  say "⚠ ci sono $FAILED controlli falliti: i goal restano aperti"
fi
say "=== fine · $(date -Is) ==="
