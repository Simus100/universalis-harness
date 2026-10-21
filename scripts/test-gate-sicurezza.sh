#!/usr/bin/env bash
# test-gate-sicurezza.sh — verifica che il gate del sync e il preflight SIANO IN GRADO DI FALLIRE.
#
# Perché esiste: un gate si rompe in silenzio. Se il pattern dei percorsi riservati smette di
# corrispondere, `sync-fine-lavoro.sh` stampa «nessun file riservato» e pubblica — e la sua uscita
# è indistinguibile da quella di un controllo che ha funzionato. È già successo una volta su
# questa macchina (`git status --porcelain` senza `-uall` presentava una cartella non tracciata
# come una riga sola, e il gate dichiarava pulito un albero che conteneva la memoria intera).
# Un controllo che nessuno ha mai visto scattare non è un controllo: è una speranza.
#
# Come funziona: costruisce un repository di prova con lo STATO DI LAVORO attuale (file versionati
# + modifiche non committate, senza cartelle ignorate) dentro una cartella temporanea, e lancia il
# gate vero con `PI_HARNESS_ROOT` puntato lì. Niente viene committato né pubblicato nel repository
# reale: il gate del test è lo stesso codice, su un'altra radice.
#
# Casi:
#   1. un nome riservato non ignorato               → il sync deve ABORTIRE (uscita 2)
#   2. lo stesso file in una cartella mai tracciata  → il sync deve ABORTIRE (uscita 2)   [il bug del -uall]
#   2b. lo stesso caso con `-uall` tolto             → il sync deve LASCIAR PASSARE (uscita 0)
#       È il test del test: dimostra che il caso [2] non passa per caso, ma grazie a `-uall`.
#   3. un `.env` ignorato                            → il sync deve PROCEDERE (uscita 0)
#       La difesa di `.env` è il `.gitignore`, non il gate: qui si verifica che non ci sia
#       un falso allarme e che la copertura vera sia controllata dal preflight ([2/4]).
#   3b. un file innocuo                              → il sync deve PROCEDERE (uscita 0)
#   4. elenco dei riservati mancante                 → il sync deve ABORTIRE (uscita 3)   [fail-closed]
#   5. un `.env` già committato                      → il preflight deve FALLIRE (uscita 1)
#
# Uso: bash scripts/test-gate-sicurezza.sh
set -uo pipefail

RADICE="${PI_HARNESS_ROOT_TEST:-$(cd "$(dirname "$0")/.." && pwd)}"
T=$(mktemp -d)
REPO="$T/repo"
PASSATI=0
FALLITI=0

pulisci() { rm -rf "$T"; }
trap pulisci EXIT

fallito() { echo "  ✘ $*"; FALLITI=$((FALLITI + 1)); }
passato() { echo "  ✓ $*"; PASSATI=$((PASSATI + 1)); }

# esito_atteso <codice> <descrizione> <comando...>
esito_atteso() {
  local atteso="$1" descr="$2"
  shift 2
  local uscita
  "$@" >"$T/out" 2>&1
  uscita=$?
  if [ "$uscita" -eq "$atteso" ]; then
    passato "$descr (uscita $uscita, come atteso)"
  else
    fallito "$descr: uscita $uscita, attesa $atteso"
    sed 's/^/      | /' "$T/out" | tail -12
  fi
}

sync_test() { PI_HARNESS_ROOT="$REPO" bash "$REPO/scripts/sync-fine-lavoro.sh" --anteprima "test" ; }
preflight_test() { PI_HARNESS_ROOT="$REPO" bash "$REPO/scripts/preflight-sicurezza.sh" ; }

echo "== costruisco il repository di prova =="
mkdir -p "$REPO"
git -C "$RADICE" archive HEAD | tar -C "$REPO" -x || { echo "git archive fallito" >&2; exit 1; }
# lo stato di lavoro non committato (modifiche e file nuovi), senza gli ignorati: è quello che il
# gate deve vedere. Senza questo, il test collauderebbe la versione di ieri degli script.
git -C "$RADICE" ls-files -mo --exclude-standard -z |
  while IFS= read -r -d '' f; do
    [ -e "$RADICE/$f" ] || continue
    mkdir -p "$REPO/$(dirname "$f")"
    cp -p "$RADICE/$f" "$REPO/$f"
  done
git -C "$REPO" init -q
git -C "$REPO" add -A
git -C "$REPO" -c user.name=test -c user.email=test@local commit -qm "base di prova"
echo "  $(git -C "$REPO" ls-files | wc -l) file versionati nella copia"

echo
echo "== casi =="

# Il nome della prova deve essere riconosciuto dal gate E non coperto da .gitignore: `*password*`
# è già ignorato in questo repository, quindi non arriverebbe mai a un commit e il gate non
# avrebbe nulla da fermare. `CU2026` è nell'elenco dei riservati e non nel .gitignore.
echo "[1] un file sensibile NON ignorato"
echo "x" >"$REPO/CU2026-dati.txt"
esito_atteso 2 "un file con un nome riservato ferma la pubblicazione" sync_test
rm -f "$REPO/CU2026-dati.txt"

echo "[2] lo stesso file in una cartella mai tracciata (il bug del -uall)"
mkdir -p "$REPO/media/cartella-nuova"
echo "x" >"$REPO/media/cartella-nuova/CU2026-dati.txt"
esito_atteso 2 "un file riservato dentro una cartella nuova ferma la pubblicazione" sync_test

echo "[2b] il test sa riconoscere il bug: senza -uall il gate NON se ne accorge"
sed 's/git status --porcelain -uall/git status --porcelain/' \
  "$REPO/scripts/sync-fine-lavoro.sh" >"$REPO/scripts/sync-senza-uall.sh"
esito_atteso 0 "senza -uall il gate lascia passare (bug riprodotto: il caso [2] lo vede)" \
  env PI_HARNESS_ROOT="$REPO" bash "$REPO/scripts/sync-senza-uall.sh" --anteprima "test"
rm -rf "$REPO/media/cartella-nuova" "$REPO/scripts/sync-senza-uall.sh"

echo "[3] un .env ignorato: la difesa è .gitignore, e il gate non ha nulla da fermare"
echo "NON-DEVE-ESSERE-PUBBLICATO=1" >"$REPO/.env"
esito_atteso 0 "un .env ignorato non arriva al commit (lo copre .gitignore e il preflight)" sync_test
rm -f "$REPO/.env"

echo "[3b] file innocuo"
mkdir -p "$REPO/media"
echo "note di prova" >"$REPO/media/prova-innocua.txt"
esito_atteso 0 "un file innocuo non fa scattare il gate" sync_test
rm -f "$REPO/media/prova-innocua.txt"

echo "[4] elenco dei riservati mancante (fail-closed)"
mv "$REPO/scripts/riservati.pattern" "$T/riservati.bak"
esito_atteso 3 "senza l'elenco il gate ABORTISCE invece di dire «pulito»" sync_test
mv "$T/riservati.bak" "$REPO/scripts/riservati.pattern"

echo "[5] .env già committato (il preflight guarda la storia)"
echo "NON-DEVE-ESSERE-PUBBLICATO=1" >"$REPO/.env"
git -C "$REPO" add -f .env
git -C "$REPO" -c user.name=test -c user.email=test@local commit -qm "svista"
esito_atteso 1 "un segreto già nella storia fa fallire il preflight" preflight_test
grep -q "\.env" "$T/out" && passato "il preflight nomina il file colpevole" || fallito "il preflight non nomina il file"
grep -qi "NON-DEVE-ESSERE-PUBBLICATO" "$T/out" && fallito "il preflight ha stampato il CONTENUTO del segreto" \
  || passato "il preflight non stampa il contenuto del segreto"

echo
echo "== esito =="
echo "  passati: $PASSATI   falliti: $FALLITI"
if [ "$FALLITI" -gt 0 ]; then
  echo "✘ il gate NON è affidabile: un controllo che non scatta non protegge nulla"
  exit 1
fi
echo "✓ ogni caso si è comportato come atteso"
