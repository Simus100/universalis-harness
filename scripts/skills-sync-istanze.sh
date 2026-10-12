#!/usr/bin/env bash
# Allinea le skill delle altre istanze dell'harness a quelle di pi-harness.
#
# Perché serve. Ogni istanza dell'harness ha la PROPRIA cartella `skills/` e la
# propria `HOME`: le skill globali non sono condivise, quindi una skill creata o
# aggiornata in pi-harness non compare da sola negli altri (è verificato: tester07
# e tester08 girano come utenti con HOME=/home/testerXX e caricavano 7 skill
# contro le 26 di pi-harness).
#
# Cosa fa, senza argomenti (anteprima, non tocca nulla):
#   elenca, per ogni istanza, le skill mancanti e quelle diverse.
#
# Con --applica:
#   1. salva in /root/harness-skills-backup-<data>/<istanza>/ le skill che
#      vengono sostituite (le mancanti non hanno nulla da salvare)
#   2. copia le skill di pi-harness nella cartella dell'istanza
#   3. assegna i file all'utente proprietario dell'istanza (la sua dashboard
#      deve poterli modificare)
#   4. riporta a symlink le copie reali nelle globali dell'istanza
#      (~/.agents/skills, ~/.claude/skills): evita le collisioni di nome che
#      `npx hyperframes init`/`skills update` ricreano in quelle cartelle
#   5. verifica l'istanza col suo ambiente reale:
#      node media/test-skill-collisioni.mjs con HOME/agentDir/DASH_SKILLS_DIR suoi
#
# PRUDENZA — perché le istanze si passano a mano. Copiare le skill in un'istanza
# che condivide la HOME di root (pi-harness, tester_01) NON si fa: quelle istanze
# leggono anche /root/.agents/skills, dove le stesse skill sono già raggiungibili
# via symlink, e una copia reale produrrebbe una collisione di nome. Lo script se
# ne accorge e si astiene.
#
# Uso:  bash scripts/skills-sync-istanze.sh [--applica] [/home/tester07 ...]
#       (senza percorsi usa: /home/tester07 /home/tester08)

set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SORGENTE="$HARNESS_DIR/skills"
BACKUP_ROOT="/root/harness-skills-backup-$(date +%Y%m%d-%H%M%S)"
MODE="anteprima"
args=()
for a in "$@"; do
  if [[ "$a" == "--applica" ]]; then MODE="applica"; else args+=("$a"); fi
done
if [[ ${#args[@]} -gt 0 ]]; then
  ISTANZE=("${args[@]}")
else
  ISTANZE=(/home/tester07 /home/tester08)
fi

[[ -d "$SORGENTE" ]] || { echo "cartella sorgente assente: $SORGENTE" >&2; exit 1; }

# Legge una variabile dall'ambiente del processo dell'istanza, se è attiva.
env_di_istanza() {
  local istanza="$1" chiave="$2"
  local pid
  pid="$(pgrep -f "$istanza/dashboard.mjs" | head -1 || true)"
  [[ -n "$pid" ]] || return 1
  tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n "s/^${chiave}=//p" | head -1
}

echo "modalità: $MODE"
echo "sorgente: $SORGENTE"
echo

tot_mancanti=0
tot_diverse=0
istanze_ok=()

for istanza in "${ISTANZE[@]}"; do
  istanza="${istanza%/}"
  dest="$istanza/skills"
  if [[ ! -d "$dest" ]]; then
    echo "— $istanza: nessuna cartella skills/, salto"
    continue
  fi

  # Prudenza: HOME di root = condivide le globali di root → niente copie reali.
  home_ist="$(env_di_istanza "$istanza" HOME || getent passwd "$(stat -c %U "$dest")" | cut -d: -f6)"
  if [[ "$home_ist" == "/root" ]]; then
    echo "— $istanza: HOME=/root, condivide /root/.agents/skills (symlink già presenti) → astensione"
    continue
  fi

  mancanti=(); diverse=()
  for s in "$SORGENTE"/*/; do
    nome="$(basename "$s")"
    if [[ ! -d "$dest/$nome" ]]; then
      mancanti+=("$nome")
    elif ! diff -rq "$s" "$dest/$nome" >/dev/null 2>&1; then
      diverse+=("$nome")
    fi
  done

  tot_mancanti=$((tot_mancanti + ${#mancanti[@]}))
  tot_diverse=$((tot_diverse + ${#diverse[@]}))
  istanze_ok+=("$istanza")
  echo "• $istanza (HOME=$home_ist, proprietario $(stat -c %U "$dest"))"
  echo "  mancanti: ${#mancanti[@]}  diverse: ${#diverse[@]}"
  [[ ${#mancanti[@]} -gt 0 ]] && echo "    + ${mancanti[*]}"
  [[ ${#diverse[@]} -gt 0 ]] && echo "    ~ ${diverse[*]}"
  echo
done

if [[ "$MODE" != "applica" ]]; then
  echo "totale: $tot_mancanti mancanti, $tot_diverse da aggiornare"
  echo "Per applicare:  bash scripts/skills-sync-istanze.sh --applica"
  exit 0
fi

for istanza in "${istanze_ok[@]}"; do
  dest="$istanza/skills"
  utente="$(stat -c %U "$dest")"
  gruppo="$(stat -c %G "$dest")"
  mkdir -p "$BACKUP_ROOT/$(basename "$istanza")"
  echo "• $istanza"

  for s in "$SORGENTE"/*/; do
    nome="$(basename "$s")"
    if [[ -d "$dest/$nome" ]]; then
      diff -rq "$s" "$dest/$nome" >/dev/null 2>&1 && continue
      cp -a "$dest/$nome" "$BACKUP_ROOT/$(basename "$istanza")/"
      rm -rf "$dest/$nome"
      echo "    aggiornata $nome (backup in $BACKUP_ROOT/$(basename "$istanza")/)"
    else
      echo "    aggiunta   $nome"
    fi
    cp -a "$s" "$dest/$nome"
  done
  chown -R "$utente:$gruppo" "$dest"
  echo "    proprietario: $utente:$gruppo"

  # 4) nelle cartelle globali dell'istanza (~/.agents/skills, ~/.claude/skills) le copie
  #    REALI delle skill che stanno anche in <istanza>/skills diventano symlink: pi carica
  #    la prima copia con un certo nome e segnala l'altra come collisione. Serve perché
  #    `npx hyperframes init`/`skills update` reinstallano le skill in quelle cartelle.
  home_ist="$(env_di_istanza "$istanza" HOME || echo "/home/$(basename "$istanza")")"
  for gdir in "$home_ist/.agents/skills" "$home_ist/.claude/skills"; do
    [[ -d "$gdir" ]] || continue
    for p in "$gdir"/*/; do
      [[ -e "$p" ]] || continue
      nome="$(basename "$p")"
      [[ -L "$gdir/$nome" ]] && continue
      [[ -d "$dest/$nome" ]] || continue
      rm -rf "$gdir/$nome"
      ln -sfn "$dest/$nome" "$gdir/$nome"
      chown -h "$utente:$gruppo" "$gdir/$nome" 2>/dev/null || true
      echo "    relink   $gdir/$nome → skills/$nome"
    done
  done
done

echo "backup: $BACKUP_ROOT"
echo
echo "=== verifica per istanza ==="
for istanza in "${istanze_ok[@]}"; do
  home_ist="$(env_di_istanza "$istanza" HOME || echo "/home/$(basename "$istanza")")"
  agent_ist="$(env_di_istanza "$istanza" PI_CODING_AGENT_DIR || echo "$home_ist/.pi/agent")"
  echo "--- $istanza"
  ( cd "$HARNESS_DIR" && HOME="$home_ist" PI_CODING_AGENT_DIR="$agent_ist" \
      DASH_SKILLS_DIR="$istanza/skills" node media/test-skill-collisioni.mjs | tail -3 )
done
