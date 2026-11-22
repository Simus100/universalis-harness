#!/usr/bin/env bash
# test-clone.sh — verifica che il repository BASTI A SE STESSO.
#
# Perché esiste (2026-11-22): un clone pubblico non aveva `dependencies` nel package.json, il
# default di `MEDIA_DIR` puntava alla cartella dell'autore e le estensioni (web, subagent) stavano
# fuori dal repository. Chi clonava prendeva `ERR_MODULE_NOT_FOUND`. Questo test rifà il percorso di
# chi clona — file versionati, `npm install`, ambiente VUOTO, primo avvio — e fallisce se qualcosa
# di quel percorso dipende dalla macchina di chi ha scritto il codice.
#
# Uso:   bash media/test-clone.sh            # installa (può richiedere 1-2 minuti)
#        bash media/test-clone.sh --rapido   # npm install dalla cache locale (più veloce, stesso test)
#        bash media/test-clone.sh --tieni    # non cancella la cartella di prova
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
RADICE=$(pwd)
RAPIDO=0; TIENI=0
for a in "$@"; do
  case "$a" in
    --rapido) RAPIDO=1 ;;
    --tieni) TIENI=1 ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
  esac
done

PORTA=${PORTA:-8499}
pkill -f "dashboard.mjs --port $PORTA" 2>/dev/null; sleep 1   # nessun residuo da test precedenti
DIR=$(mktemp -d /tmp/clone-harness-XXXXXX)
FALLITI=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
ko()   { printf '  \033[31m✘\033[0m %s\n' "$*"; FALLITI=$((FALLITI+1)); }
pulisci() {
  # si chiude per PORTA, non per PID: il PID raccolto è quello di una subshell e un node
  # sopravvissuto sulla stessa porta farebbe rispondere il test con l'istanza sbagliata
  # (successo falso o fallimento falso, come è accaduto la prima volta).
  pkill -f "dashboard.mjs --port $PORTA" 2>/dev/null
  [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null
  if [ "$TIENI" = "1" ]; then echo "  cartella di prova: $DIR"; else rm -rf "$DIR"; fi
}
trap pulisci EXIT

echo "clone-harness — il repository basta a se stesso?"
echo

# 1. copia SOLO i file versionati (quello che il mondo riceve davvero)
git ls-files -z | (cd "$RADICE" && xargs -0 cp --parents -t "$DIR") || { ko "copia dei file versionati"; exit 1; }
# i file modificati ma non ancora committati vanno provati come sono: si sovrascrivono
for f in dashboard.mjs dashboard.html harness.mjs package.json; do
  [ -f "$RADICE/$f" ] && cp "$RADICE/$f" "$DIR/$f"
done
[ -f "$RADICE/.env.example" ] && cp "$RADICE/.env.example" "$DIR/.env.example"
ok "file versionati copiati ($(find "$DIR" -type f | wc -l) file)"

# 2. il repository dichiara le sue dipendenze?
python3 - "$DIR/package.json" <<'PY' && ok "package.json dichiara l'SDK e le estensioni" || ko "package.json senza dependencies (npm install non installerebbe nulla)"
import json,sys
d=json.load(open(sys.argv[1]))
dep={**d.get("dependencies",{}), **d.get("optionalDependencies",{})}
assert "@earendil-works/pi-coding-agent" in dep, "manca l'SDK"
assert "pi-web-access" in dep and "pi-subagents" in dep, "mancano le estensioni"
PY
[ -f "$DIR/.env.example" ] && ok ".env.example presente" || ko ".env.example assente"

# 3. npm install (le dipendenze dichiarate, nient'altro)
EXTRA=""
[ "$RAPIDO" = "1" ] && EXTRA="--prefer-offline"
if true; then
  if (cd "$DIR" && timeout 420 npm install --no-audit --no-fund $EXTRA >/tmp/clone-npm.log 2>&1); then
    ok "npm install completato"
  else
    ko "npm install fallito (log: /tmp/clone-npm.log)"; tail -5 /tmp/clone-npm.log
  fi
fi
[ -d "$DIR/node_modules/@earendil-works/pi-coding-agent" ] && ok "SDK presente in node_modules" || ko "SDK assente dopo l'installazione"
if [ -f "$DIR/node_modules/pi-subagents/index.ts" ] || [ -f "$DIR/node_modules/pi-subagents/bundle/index.js" ] || [ -f "$DIR/node_modules/pi-subagents/index.js" ]; then
  ok "estensione subagent in node_modules"
else
  ko "estensione subagent assente"
fi
[ -f "$DIR/node_modules/pi-web-access/index.ts" ] && ok "estensione web in node_modules" || ko "estensione web assente"

# 4. primo avvio con AMBIENTE VUOTO: nessuna variabile erediterà la macchina dell'autore
( cd "$DIR" && env -i PATH="$PATH" HOME="$DIR" TERM=dumb \
    DASH_USER=prova DASH_PASSWORD=prova-clone-123 \
    nohup node dashboard.mjs --port "$PORTA" --host 127.0.0.1 >"$DIR/avvio.log" 2>&1 & echo $! >"$DIR/pid" )
sleep 1; PID=$(cat "$DIR/pid" 2>/dev/null)
for _ in $(seq 1 25); do
  curl -s -m 2 -o /dev/null -u prova:prova-clone-123 "http://127.0.0.1:$PORTA/api/health" && break
  sleep 2
done
if grep -q "EADDRINUSE" "$DIR/avvio.log"; then
  ko "porta $PORTA occupata: il test non è valido (istanza di prova non avviata)"
elif curl -s -m 3 -o /dev/null -u prova:prova-clone-123 "http://127.0.0.1:$PORTA/api/health"; then
  ok "il server risponde su /api/health"
else
  ko "il server NON risponde"; sed -n '1,20p' "$DIR/avvio.log"
fi

# 5. i percorsi generati stanno DENTRO il clone
if grep -q "media (file generati): $DIR/media" "$DIR/avvio.log"; then
  ok "media dentro il progetto ($DIR/media)"
else
  ko "MEDIA_DIR non è dentro il progetto: $(grep -m1 'media (file generati)' "$DIR/avvio.log")"
fi
if grep -q "file root: $DIR" "$DIR/avvio.log"; then ok "root dei file = cartella del progetto"; else ko "root dei file non è il progetto"; fi

# 6. i tool raccontati nel README ci sono davvero?
TOOL=$(curl -s -m 5 -u prova:prova-clone-123 "http://127.0.0.1:$PORTA/api/contesto" \
  | python3 -c "import json,sys; print(' '.join(json.load(sys.stdin)['gate']['attivi']))" 2>/dev/null)
for t in read bash edit write web_search source_check fetch_content get_search_content ask_user memoria_cerca; do
  case " $TOOL " in *" $t "*) ;; *) ko "tool mancante nel clone: $t" ;; esac
done
case " $TOOL " in *" web_search "*) ok "tool web presenti ($(echo $TOOL | wc -w) attivi)";; esac
# in modalità "auto" i tool dei subagent entrano solo nei turni di ricognizione: qui si verifica
# che l'estensione sia stata CARICATA, non che i due tool siano già nella lista
if grep -q "subagent: disponibile" "$DIR/avvio.log"; then
  ok "estensione subagent caricata (modalità auto: i tool entrano per turno)"
else
  ko "estensione subagent non caricata: $(grep -m1 'subagent:' "$DIR/avvio.log")"
fi

# 7. inserimento delle chiavi: il pannello deve poter salvare, e rifiutare una chiave falsa
CODICE=$(curl -s -m 5 -o /dev/null -w '%{http_code}' -u prova:prova-clone-123 -X POST \
  -H 'content-type: application/json' -d '{"provider":"google","key":"chiave-finta-di-prova-1234567890"}' \
  "http://127.0.0.1:$PORTA/api/providers/key")
case "$CODICE" in
  400) ok "endpoint delle chiavi attivo: rifiuta una chiave non valida (HTTP 400, come deve)";;
  200) ok "endpoint delle chiavi attivo (HTTP 200)";;
  *) ko "endpoint /api/providers/key inatteso (HTTP $CODICE)";;
esac
PRONTI=$(curl -s -m 5 -u prova:prova-clone-123 "http://127.0.0.1:$PORTA/api/providers" | head -c 200)
[ -n "$PRONTI" ] && ok "elenco provider leggibile (per sapere quali chiavi mancano)" || ko "elenco provider non leggibile"

# 8. nessun segreto finito nel clone
if git -C "$RADICE" ls-files | grep -qE '(^|/)\.env$'; then ko ".env è versionato (NON deve esserlo)"; else ok "nessun .env nel repository"; fi

echo
if [ "$FALLITI" = "0" ]; then echo "  ✓ clone autosufficiente: $FALLITI problemi"; else echo "  ✘ $FALLITI problemi da correggere"; fi
exit $([ "$FALLITI" = "0" ] && echo 0 || echo 1)
