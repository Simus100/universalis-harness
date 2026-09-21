#!/usr/bin/env bash
# github-sync.sh — crea/aggiorna il repository GitHub di questo progetto.
#
# La configurazione di accesso si legge da `/root/pi-harness/.github-access`
# (permessi 600). Formati accettati:
#
#     GITHUB_TOKEN=...            # obbligatorio (o GH_TOKEN / GITHUB_PAT)
#     GITHUB_OWNER=...            # opzionale, default: l'utente proprietario del token
#     GITHUB_REPO=...             # opzionale, default: universalis-harness
#     GITHUB_PRIVATE=true|false   # opzionale, default: true
#
# oppure una sola riga con il valore di accesso.
# Il valore NON viene mai scritto su disco, né stampato: al push viene passato
# come header HTTP usa-e-getta (il remote resta senza credenziali).
#
# Uso:
#   scripts/github-sync.sh --stato                 # situazione locale e remota
#   scripts/github-sync.sh --crea-repo             # crea il repo privato se non esiste
#   scripts/github-sync.sh                         # commit di tutto + push
#   scripts/github-sync.sh --messaggio "fix chat"  # commit con messaggio esplicito
#   scripts/github-sync.sh --dry-run               # mostra cosa farebbe, senza fare nulla
set -euo pipefail

REPO_DIR="/root/pi-harness"
ACCESS_FILE="$REPO_DIR/.github-access"
REMOTE_FILE="$REPO_DIR/.github-remote"
BRANCH="main"
DRY=0
CREA=0
STATO=0
MSG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stato) STATO=1; shift ;;
    --crea-repo) CREA=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --messaggio) MSG="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "opzione sconosciuta: $1" >&2; exit 2 ;;
  esac
done

cd "$REPO_DIR"

# ---------------------------------------------------------------- accesso
read_access() {
  local token="" owner="" repo="universalis-harness" priv="true"
  if [[ -f "$ACCESS_FILE" ]]; then
    if grep -q '=' "$ACCESS_FILE" 2>/dev/null; then
      token="$(grep -m1 -E '^(GITHUB_TOKEN|GH_TOKEN|GITHUB_PAT)=' "$ACCESS_FILE" | cut -d= -f2- | tr -d '"' | tr -d "'" | xargs || true)"
      owner="$(grep -m1 -E '^GITHUB_OWNER=' "$ACCESS_FILE" | cut -d= -f2- | xargs || true)"
      repo="$(grep -m1 -E '^GITHUB_REPO=' "$ACCESS_FILE" | cut -d= -f2- | xargs || true)"; [[ -n "$repo" ]] || repo="universalis-harness"
      priv="$(grep -m1 -E '^GITHUB_PRIVATE=' "$ACCESS_FILE" | cut -d= -f2- | xargs || true)"; [[ -n "$priv" ]] || priv="true"
    else
      token="$(tr -d ' \n\r' < "$ACCESS_FILE")"
    fi
  fi
  [[ -z "$token" ]] && token="${GITHUB_TOKEN:-${GH_TOKEN:-${GITHUB_PAT:-}}}"
  printf '%s\n%s\n%s\n%s\n' "$token" "$owner" "$repo" "$priv"
}

# mapfile conserva le righe vuote (con IFS newline i campi vuoti collasserebbero)
mapfile -t -n 4 ACCESS_FIELDS < <(read_access)
TOKEN="$(printf '%s' "${ACCESS_FIELDS[0]:-}" | xargs || true)"
OWNER="$(printf '%s' "${ACCESS_FIELDS[1]:-}" | xargs || true)"
REPO="$(printf '%s' "${ACCESS_FIELDS[2]:-}" | xargs || true)"
PRIV="$(printf '%s' "${ACCESS_FIELDS[3]:-}" | xargs || true)"
[[ -n "$REPO" ]] || REPO="universalis-harness"
[[ -n "$PRIV" ]] || PRIV="true"

git_auth() { # esegue git passando l'header di autorizzazione senza persisterlo
  GIT_TERMINAL_PROMPT=0 git -c "http.extraHeader=Authorization: Basic $(printf 'x-access-token:%s' "$TOKEN" | base64 -w0)" "$@"
}

if [[ -f "$REMOTE_FILE" ]]; then
  REMOTE_URL="$(head -1 "$REMOTE_FILE" | xargs)"
else
  REMOTE_URL=""
fi
[[ -n "$REMOTE_URL" ]] || REMOTE_URL="$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || true)"

api() { # api <metodo> <percorso> [json]
  curl -sS -X "$1" "https://api.github.com$2" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    ${3:+-d "$3"}
}

# ---------------------------------------------------------------- stato
if [[ $STATO -eq 1 ]]; then
  echo "cartella:      $REPO_DIR"
  echo "branch:        $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(nessuno)')"
  echo "ultimo commit: $(git log -1 --pretty='%h %ad %s' --date=short 2>/dev/null || echo '(nessuno)')"
  echo "remote:        ${REMOTE_URL:-(non configurato)}"
  echo "file tracciati: $(git ls-files 2>/dev/null | wc -l)"
  echo "modifiche non registrate: $(git status --porcelain 2>/dev/null | wc -l)"
  if [[ -n "$TOKEN" ]]; then
    echo "accesso:       configurazione presente in $ACCESS_FILE"
    if [[ -z "$OWNER" ]]; then
      OWNER="$(api GET /user | python3 -c 'import json,sys; print(json.load(sys.stdin).get("login",""))' 2>/dev/null || true)"
      echo "utente GitHub: ${OWNER:-(non determinato)}"
    else
      echo "utente GitHub: $OWNER (da configurazione)"
    fi
    if [[ -n "$OWNER" ]]; then
      code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
        "https://api.github.com/repos/$OWNER/$REPO")"
      case "$code" in
        200) echo "repo remoto:   https://github.com/$OWNER/$REPO (esiste)";;
        404) echo "repo remoto:   $OWNER/$REPO non esiste ancora (usa --crea-repo)";;
        401|403) echo "repo remoto:   accesso rifiutato o permessi insufficienti (HTTP $code)";;
        *) echo "repo remoto:   risposta HTTP $code";;
      esac
    fi
  else
    echo "accesso:       NESSUN accesso configurato — crea $ACCESS_FILE (permessi 600)"
  fi
  echo
  echo "Modifiche in attesa:"
  git status --short | head -30
  exit 0
fi

if [[ -z "$TOKEN" && ( $CREA -eq 1 || $DRY -eq 0 ) ]]; then
  echo "Nessuna configurazione di accesso trovata in $ACCESS_FILE" >&2
  echo "Crea il file (permessi 600) con dentro una riga: GITHUB_TOKEN=... " >&2
  echo "Poi rilancia questo script." >&2
  exit 3
fi

# ------------------------------------------------------ creazione del repo
if [[ $CREA -eq 1 ]]; then
  if [[ -z "$OWNER" ]]; then
    OWNER="$(api GET /user | python3 -c 'import json,sys; print(json.load(sys.stdin).get("login",""))')"
  fi
  echo "utente GitHub: $OWNER"
  echo "repo:          $REPO (private=$PRIV)"
  code="$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" \
    "https://api.github.com/repos/$OWNER/$REPO")"
  if [[ "$code" == "200" ]]; then
    echo "il repository esiste già"
  else
    descr="Harness per pi: dashboard web con chat, file manager, goal, skills e pianificazioni"
    out="$(api POST /user/repos "{\"name\":\"$REPO\",\"description\":\"$descr\",\"private\":$PRIV,\"has_issues\":true,\"has_wiki\":false}")"
    echo "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("creato:", d.get("html_url") or d.get("message"))'
  fi
  echo "https://github.com/$OWNER/$REPO" > "$REMOTE_FILE"
  REMOTE_URL="https://github.com/$OWNER/$REPO.git"
fi

# --------------------------------------------------------------- commit
[[ -n "$REMOTE_URL" ]] || REMOTE_URL="https://github.com/${OWNER:-OWNER}/$REPO.git"

if [[ -z "$MSG" ]]; then
  MSG="sync $(date '+%Y-%m-%d %H:%M')"
fi

if [[ $DRY -eq 1 ]]; then
  echo "[dry-run] remote previsto: $REMOTE_URL"
  echo "[dry-run] commit previsto:  $MSG"
  echo "[dry-run] file da registrare:"; git status --short | head -30
  exit 0
fi

git add -A
if git diff --cached --quiet; then
  echo "nessuna modifica da registrare"
else
  git commit -q -m "$MSG" && echo "commit: $(git log -1 --pretty='%h %s')"
fi

git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE_URL"
git remote set-url origin "$REMOTE_URL"

git branch -M "$BRANCH" 2>/dev/null || true
echo "push verso $REMOTE_URL (branch $BRANCH)…"
if git_auth push -u origin "$BRANCH" 2>&1 | sed -E 's#//[^@]*@#//#' ; then
  echo "push completato: $REMOTE_URL"
  echo "verifica: $(git rev-parse HEAD | cut -c1-8) su origin/$BRANCH"
else
  echo "push NON riuscito: controlla che il repository esista (--crea-repo) e che i permessi consentano la scrittura." >&2
  exit 4
fi
