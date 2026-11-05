#!/usr/bin/env bash
# Wrapper per l'API dei goal della dashboard. Legge da solo credenziali e porta dell'istanza.
#
# Perché esiste: l'API richiede autenticazione (DASH_USER/DASH_PASSWORD nel .env) e la porta
# cambia per istanza (8420 principale, 8422 tester07, 8423 tester08). Scrivendo `curl` a mano
# l'agente sbaglia porta o mette la password nella riga di comando, dove `ps` la mostra.
# Qui la password passa da un file di configurazione 0600 che viene cancellato subito.
#
# Uso:
#   goal.sh list                      elenco compatto (id, stato, passi fatti/totali, titolo)
#   goal.sh show <id>                 il goal completo in JSON
#   goal.sh add                       crea: legge il JSON da stdin
#   goal.sh update <id>               aggiorna solo i campi inviati: JSON da stdin
#   goal.sh done-step <id> <n|testo>  segna come fatto il passo n (1-based) o quello che contiene il testo
#   goal.sh done-check <id> <n|testo> segna come fatto il controllo della checklist
#   goal.sh set-status <id> <stato>   active | done | archived
#   goal.sh run <id> [next]           fa eseguire all'agente la catena dei passaggi (next = solo il primo)
#   goal.sh delete <id>               elimina il goal
#
# Esempi:
#   printf '%s' '{"title":"Relazione X","steps":["raccogli i dati","scrivi"],"checklist":["fonte citata"]}' \
#     | skills/obiettivi/scripts/goal.sh add
#   skills/obiettivi/scripts/goal.sh done-step 7419 1
set -euo pipefail

RADICE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$RADICE/.env"

errore() { echo "errore: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || errore "manca $ENV_FILE (non so con quali credenziali parlare alla dashboard)"

# Credenziali: lette senza esportarle e senza stamparle.
UTENTE="$(sed -n 's/^DASH_USER=//p' "$ENV_FILE" | head -1 | tr -d '"'"'"'"')"
PASSWORD="$(sed -n 's/^DASH_PASSWORD=//p' "$ENV_FILE" | head -1 | tr -d '"'"'"'"')"
UTENTE="${UTENTE:-pi}"
[[ -n "$PASSWORD" ]] || errore "DASH_PASSWORD assente in $ENV_FILE"

# Porta: dal processo della dashboard di QUESTA istanza (altre istanze hanno altre porte).
PORTA="$(ps -eo args 2>/dev/null | grep -F "$RADICE/dashboard.mjs" | grep -v grep \
  | grep -o -- '--port[ =][0-9]*' | head -1 | grep -o '[0-9]*$' || true)"
[[ -n "$PORTA" ]] || errore "dashboard non in esecuzione per $RADICE (nessun processo con --port): avviala o usa la scheda Goal a mano"

CFG="$(mktemp)"; chmod 600 "$CFG"
trap 'rm -f "$CFG"' EXIT
printf 'user = "%s:%s"\n' "$UTENTE" "$PASSWORD" > "$CFG"

api() { # api <metodo> <percorso> [json]
  local metodo="$1" percorso="$2" corpo="${3:-}"
  if [[ -n "$corpo" ]]; then
    curl -sS --max-time 20 -K "$CFG" -X "$metodo" -H 'Content-Type: application/json' \
      -d "$corpo" "http://127.0.0.1:$PORTA$percorso"
  else
    curl -sS --max-time 20 -K "$CFG" -X "$metodo" "http://127.0.0.1:$PORTA$percorso"
  fi
}

leggi_stdin() { # JSON da stdin, con errore chiaro se vuoto o non JSON
  local dati; dati="$(cat)"
  [[ -n "${dati// }" ]] || errore "nessun JSON in stdin (es. printf '%s' '{...}' | $0 add)"
  printf '%s' "$dati" | jq -e . >/dev/null 2>&1 || errore "il JSON in stdin non è valido"
  printf '%s' "$dati"
}

# Risolve "<n|testo>" in un indice 0-based dentro un array (steps o checklist) del goal.
indice_di() { # indice_di <json-goal> <campo> <n|testo>
  local goal="$1" campo="$2" sel="$3"
  if [[ "$sel" =~ ^[0-9]+$ ]]; then
    local tot; tot="$(jq ".$campo | length" <<<"$goal")"
    (( sel >= 1 && sel <= tot )) || errore "$campo: indice $sel fuori range (1..$tot)"
    echo $(( sel - 1 ))
  else
    local i; i="$(jq -r --arg t "$sel" ".$campo | to_entries | map(select(.value.title // .value.text | tostring | test(\$t; \"i\"))) | .[0].key // empty" <<<"$goal")"
    [[ -n "$i" ]] || errore "$campo: nessun elemento contiene «$sel»"
    echo "$i"
  fi
}

azione="${1:-list}"; shift || true
case "$azione" in
  list)
    api GET /api/goals | jq -r '
      if (.goals | length) == 0 then "nessun goal"
      else .goals[] | "\(.id)  [\(.status // "active")]  \(([.steps[]? | select(.done)] | length))/\((.steps // []) | length) passi  \((.checklist // []) | length) controlli  \(.title)"
      end'
    ;;
  show)
    [[ $# -ge 1 ]] || errore "serve l'id: $0 show <id>"
    api GET /api/goals | jq --arg id "$1" '.goals[] | select(.id | startswith($id))'
    ;;
  add)
    dati="$(leggi_stdin)"
    api POST /api/goals "$dati" | jq -r '"creato: \(.goal.id)  \(.goal.title)"'
    ;;
  update)
    [[ $# -ge 1 ]] || errore "serve l'id: $0 update <id>"
    local_id="$(api GET /api/goals | jq -r --arg id "$1" '.goals[] | select(.id | startswith($id)) | .id' | head -1)"
    [[ -n "$local_id" ]] || errore "goal non trovato: $1"
    dati="$(leggi_stdin)"
    api POST /api/goals "$(jq --arg id "$local_id" '. + {id: $id}' <<<"$dati")" | jq -r '"aggiornato: \(.goal.id)"'
    ;;
  done-step|done-check)
    [[ $# -ge 2 ]] || errore "serve <id> e <n|testo>: $0 $azione <id> <n|testo>"
    goal="$(api GET /api/goals | jq --arg id "$1" '.goals[] | select(.id | startswith($id))')"
    [[ -n "$goal" && "$goal" != "null" ]] || errore "goal non trovato: $1"
    if [[ "$azione" == done-step ]]; then campo=steps; else campo=checklist; fi
    idx="$(indice_di "$goal" "$campo" "${2}")"
    nuovo="$(jq ".${campo}[${idx}].done = true" <<<"$goal")"
    api POST /api/goals "$(jq '{id, steps, checklist} | del(.. | nulls)' <<<"$nuovo")" | jq -r --arg c "$campo" --argjson i "$idx" '"aggiornato: \(.goal.id)  \($c)[\($i)].done=true"'
    ;;
  set-status)
    [[ $# -ge 2 ]] || errore "serve <id> e <stato>: $0 set-status <id> active|done|archived"
    local_id="$(api GET /api/goals | jq -r --arg id "$1" '.goals[] | select(.id | startswith($id)) | .id' | head -1)"
    [[ -n "$local_id" ]] || errore "goal non trovato: $1"
    api POST /api/goals "$(jq -nc --arg id "$local_id" --arg s "$2" '{id:$id, status:$s}')" | jq -r '"stato: \(.goal.status)"'
    ;;
  run)
    [[ $# -ge 1 ]] || errore "serve l'id: $0 run <id> [next]"
    local_id="$(api GET /api/goals | jq -r --arg id "$1" '.goals[] | select(.id | startswith($id)) | .id' | head -1)"
    [[ -n "$local_id" ]] || errore "goal non trovato: $1"
    modo="all"; [[ "${2:-}" == "next" ]] && modo="next"
    api POST /api/goals/execute "$(jq -nc --arg id "$local_id" --arg m "$modo" '{id:$id, mode:$m}')"
    echo "esecuzione avviata (i passi vengono inviati all'agente nella chat)"
    ;;
  delete)
    [[ $# -ge 1 ]] || errore "serve l'id: $0 delete <id>"
    local_id="$(api GET /api/goals | jq -r --arg id "$1" '.goals[] | select(.id | startswith($id)) | .id' | head -1)"
    [[ -n "$local_id" ]] || errore "goal non trovato: $1"
    api POST /api/goals/delete "$(jq -nc --arg id "$local_id" '{id:$id}')" | jq -r '"eliminato"'
    ;;
  *)
    errore "azione sconosciuta «$azione» (list, show, add, update, done-step, done-check, set-status, run, delete)"
    ;;
esac
