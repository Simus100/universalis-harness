#!/usr/bin/env bash
# preflight-sicurezza.sh — guarda ciò che il gate del sync NON vede, perché è già pubblicato.
#
# Perché esiste, e in che cosa è diverso da `sync-fine-lavoro.sh`:
#   `sync-fine-lavoro.sh`  risponde a «che cosa sto per pubblicare ADESSO?»
#                          (guardando `git status`, quindi anche i file mai committati)
#   questo script          risponde a «che cosa è GIÀ nella storia?» e a «com'è messa la macchina?»
#                          (guardando `git ls-files`, quindi ciò che un git clone porta con sé)
# Sono due domande diverse e servono tutte e due: un segreto committato ieri non compare più in
# `git status`, ma è nel repository, e chi clona lo prende.
#
# Quattro controlli:
#   1. percorsi riservati già tracciati        (l'elenco è `scripts/riservati.pattern`, condiviso col sync)
#   2. .gitignore copre davvero i posti deputati ai segreti
#   3. permessi dei file e delle cartelle locali che contengono segreti
#   4. segreti riconoscibili dentro i file versionati (pattern: `scripts/segreti.pattern`)
#
# COSA NON DICE: un esito verde significa «non è comparso nessuno dei pattern noti», NON «non ci
# sono segreti». Una password, una stringa di connessione, un IBAN non hanno un prefisso
# riconoscibile e passano. Questo script toglie la distrazione, non sostituisce il giudizio.
# Non stampa MAI il testo trovato: solo file, riga e tipo — un controllo che stampa il segreto lo
# sposta nei log della sessione, cioè lo pubblica nel posto sbagliato.
#
# Uso:
#   bash scripts/preflight-sicurezza.sh          # esito 0 = nessun problema, 1 = problemi
#   PI_HARNESS_ROOT=/copia bash scripts/preflight-sicurezza.sh   # su una copia (test)
set -uo pipefail

RADICE="${PI_HARNESS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$RADICE" || { echo "radice non trovata: $RADICE" >&2; exit 1; }
git rev-parse --git-dir >/dev/null 2>&1 || { echo "$RADICE non è un repository git" >&2; exit 1; }

PROBLEMI=0
AVVISI=0
errore() { echo "  ✘ $*"; PROBLEMI=$((PROBLEMI + 1)); }
avviso() { echo "  ! $*"; AVVISI=$((AVVISI + 1)); }

echo "== preflight di sicurezza =="
echo "  radice: $RADICE"

# --- 1. percorsi riservati già tracciati -------------------------------------------------------
echo
echo "[1/4] percorsi riservati già nella storia"
ELENCO_RISERVATI="scripts/riservati.pattern"
if [ ! -s "$ELENCO_RISERVATI" ]; then
  errore "$ELENCO_RISERVATI manca o è vuoto: senza l'elenco questo controllo non può dire nulla"
else
  RISERVATI=$(grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' "$ELENCO_RISERVATI" | paste -sd'|' -)
  tracciati=$(git ls-files | grep -Ei "$RISERVATI" || true)
  if [ -z "$tracciati" ]; then
    echo "  ✓ nessun percorso riservato fra i $(git ls-files | wc -l) file versionati"
  else
    n=$(printf '%s\n' "$tracciati" | wc -l)
    errore "$n file riservati sono già versionati (un clone li porta con sé):"
    printf '%s\n' "$tracciati" | head -10 | sed 's/^/      /'
    [ "$n" -gt 10 ] && echo "      …"
    echo "    per rimuoverli dalla storia serve riscriverla: prima si toglie il file dal"
    echo "    tracciamento (git rm --cached), poi si ruotano i segreti che conteneva."
  fi
fi

# --- 2. .gitignore copre i posti deputati ------------------------------------------------------
echo
echo "[2/4] .gitignore copre i posti dove i segreti devono stare"
for voce in .env .session-secret .github-access sessions/prova backups/prova \
            social/prova/.env media/uploads/prova media/memoria/indice.json \
            media/memoria/episodi/prova.md media/schedules.json; do
  if git check-ignore -q "$voce"; then
    echo "  ✓ ignorato: $voce"
  elif git ls-files --error-unmatch "$voce" >/dev/null 2>&1; then
    errore "$voce è VERSIONATO: è nella storia, non basta ignorarlo (vedi [1])"
  else
    errore "$voce NON è ignorato da .gitignore: finirebbe in un commit"
  fi
done

# --- 3. permessi locali ------------------------------------------------------------------------
echo
echo "[3/4] permessi dei file e delle cartelle che contengono segreti"
# I primi tre contengono credenziali per costruzione: se sono leggibili da altri è un problema
# adesso. `.github-remote` invece oggi contiene solo l'URL del repository: lo si tiene d'occhio
# (domani qualcuno ci mette `utente:token@`) ma non è un errore, e un errore su una situazione
# normale è il modo più rapido di far ignorare tutto il resto.
for f in .env .session-secret .github-access .github-remote; do
  [ -e "$f" ] || continue
  modo=$(stat -c '%a' "$f")
  if (( (8#$modo & 8#077) == 0 )); then
    echo "  ✓ $f: $modo"
  elif [ "$f" = ".github-remote" ]; then
    avviso "$f è $modo: oggi non ci sono credenziali dentro, ma un URL con token sì (chmod 600)"
  else
    errore "$f è $modo: leggibile o scrivibile da utenti che non sono il tuo (chmod 600 $f)"
  fi
done
for d in sessions backups social backup_export media/memoria; do
  [ -d "$d" ] || continue
  modo=$(stat -c '%a' "$d")
  if (( (8#$modo & 8#077) != 0 )); then
    avviso "$d è $modo: contiene dati personali, altri utenti possono leggerla (chmod 700 $d)"
  else
    echo "  ✓ $d: $modo"
  fi
done

# --- 4. segreti riconoscibili nei file versionati ----------------------------------------------
echo
echo "[4/4] segreti riconoscibili nei file versionati"
if [ ! -s scripts/segreti.pattern ]; then
  errore "scripts/segreti.pattern manca o è vuoto: la ricerca non ha regole"
else
  python3 - "$RADICE" scripts/segreti.pattern <<'PY'
import os, re, subprocess, sys

radice, pattern_file = sys.argv[1], sys.argv[2]

segreti = []
for riga in open(os.path.join(radice, pattern_file), encoding="utf-8"):
    riga = riga.rstrip("\n")
    if not riga.strip() or riga.lstrip().startswith("#"):
        continue
    nome, _, espressione = riga.partition("\t")
    if espressione:
        segreti.append((nome.strip(), re.compile(espressione)))

files = subprocess.run(
    ["git", "-C", radice, "ls-files", "-z"], capture_output=True, check=True
).stdout.decode("utf-8", "replace").split("\0")

trovati = []
letti = 0
for rel in filter(None, files):
    p = os.path.join(radice, rel)
    try:
        if os.path.getsize(p) > 2_000_000:
            continue
        blob = open(p, "rb").read()
        if b"\0" in blob[:4096]:          # binario: non è testo, non si legge
            continue
        testo = blob.decode("utf-8")
    except OSError:
        continue
    letti += 1
    for n, riga in enumerate(testo.splitlines(), 1):
        for nome, pat in segreti:
            m = pat.search(riga)
            if m:
                trovati.append((rel, n, nome, len(m.group(0))))

if not trovati:
    print(f"  ✓ nessuno dei {len(segreti)} tipi noti in {letti} file di testo")
    sys.exit(0)

for rel, n, nome, lunghezza in trovati:
    # il testo del match NON si stampa: finirebbe nei log, cioè in un altro posto sbagliato
    print(f"  ✘ {rel}:{n}  {nome}  ({lunghezza} caratteri)")
print(f"\n  {len(trovati)} riscontri: il valore non è stampato di proposito.")
print("  Se è un esempio in un documento, sostituiscilo con una forma palese (es. «sk-…»);")
print("  se è un segreto vero, ruotalo: è già nella storia del repository.")
sys.exit(1)
PY
  [ $? -ne 0 ] && PROBLEMI=$((PROBLEMI + 1))
fi

# --- esito -------------------------------------------------------------------------------------
echo
if [ "$PROBLEMI" -eq 0 ] && [ "$AVVISI" -eq 0 ]; then
  echo "✓ preflight superato"
elif [ "$PROBLEMI" -eq 0 ]; then
  echo "✓ preflight superato, con $AVVISI avvisi (non bloccanti)"
else
  echo "✘ preflight FALLITO: $PROBLEMI problemi, $AVVISI avvisi"
fi
echo "  Ricorda che cosa NON dice: verde = «nessuno dei pattern noti», non «nessun segreto»."
[ "$PROBLEMI" -eq 0 ] || exit 1
