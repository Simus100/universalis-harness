#!/usr/bin/env bash
# verifica-ricerca.sh — dice se la ricerca web è configurata, e se la chiave FUNZIONA davvero.
#
#   bash media/ricerca-web/verifica-ricerca.sh
#   WEB_SEARCH_CONFIG=/percorso/altro.json bash media/ricerca-web/verifica-ricerca.sh
#
# Non stampa MAI la chiave: la legge dal file di configurazione e la passa a curl via stdin o
# file descriptor, così non compare nemmeno nell'elenco dei processi.
set -uo pipefail

# I file temporanei (risposta del provider) si cancellano sempre, anche in caso di uscita anticipata.
TMP_ATTIVI=()
pulisci() { for f in "${TMP_ATTIVI[@]:-}"; do [[ -n "$f" ]] && rm -f "$f"; done; }
trap pulisci EXIT

CONFIG="${WEB_SEARCH_CONFIG:-/root/.pi/agent/web-search.json}"
MODELLO_RICHIESTA="blender headless sprite sheet come si fa"

if [[ ! -f "$CONFIG" ]]; then
  echo "✘ configurazione assente: $CONFIG"
  echo
  echo "  Per attivarla (una riga, con la TUA chiave):"
  echo "    printf '{\"braveApiKey\": \"LA_TUA_CHIAVE\"}\\n' > $CONFIG && chmod 600 $CONFIG"
  echo "  (oppure \"tavilyApiKey\", \"exaApiKey\", ... — vedi il README accanto a questo script)"
  exit 1
fi

chmod 600 "$CONFIG" 2>/dev/null || true
echo "✔ file presente: $CONFIG ($(stat -c%s "$CONFIG") byte, permessi $(stat -c%a "$CONFIG"))"

# ---------------------------------------------------------------- estrazione
# Stampa su due righe: NOME DEL CAMPO, poi il valore. Non usa argomenti (la chiave non passa
# dalla riga di comando, quindi non finisce in `ps`).
LETTURA=$(python3 - "$CONFIG" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
except Exception as e:
    print("ERRORE", e); sys.exit(0)
for k in ("braveApiKey", "tavilyApiKey", "exaApiKey", "perplexityApiKey", "serperApiKey",
          "kagiApiKey", "jinaApiKey", "openaiApiKey", "geminiApiKey"):
    v = d.get(k)
    if isinstance(v, str) and v.strip():
        print(k); print(v); sys.exit(0)
print("NESSUNO", "")
PY
)
CAMPO=$(printf '%s' "$LETTURA" | sed -n 1p)
CHIAVE=$(printf '%s' "$LETTURA" | sed -n 2p)

case "$CAMPO" in
  ERRORE)  echo "✘ il file non è JSON valido: $CHIAVE"; exit 1;;
  NESSUNO) echo "✘ nessuna chiave riconosciuta nel file (campi ammessi: braveApiKey, tavilyApiKey, exaApiKey, …)"; exit 1;;
esac
echo "✔ chiave trovata: campo «$CAMPO» (valore non mostrato, ${#CHIAVE} caratteri)"

# ---------------------------------------------------------------- prova vera
echo "→ prova di ricerca: «$MODELLO_RICHIESTA»"
case "$CAMPO" in
  braveApiKey)
    RISPOSTA=$(curl -sS --max-time 20 --config <(
      printf 'header = "X-Subscription-Token: %s"\n' "$CHIAVE"
      printf 'header = "Accept: application/json"\n'
    ) "https://api.search.brave.com/res/v1/web/search?q=$(printf '%s' "$MODELLO_RICHIESTA" | sed 's/ /%20/g')&count=3" 2>&1)
    ;;
  tavilyApiKey)
    RISPOSTA=$(printf '{"api_key":"%s","query":"%s","max_results":3}' "$CHIAVE" "$MODELLO_RICHIESTA" \
      | curl -sS --max-time 20 -X POST "https://api.tavily.com/search" -H "Content-Type: application/json" -d @- 2>&1)
    ;;
  exaApiKey)
    printf '{"query":"%s","numResults":3}' "$MODELLO_RICHIESTA" \
      | curl -sS --max-time 20 -X POST "https://api.exa.ai/search" -H "Content-Type: application/json" \
        -H "x-api-key: $CHIAVE" -d @- 2>&1 | head -c 4000 > /tmp/exa-risposta.json
    RISPOSTA=$(cat /tmp/exa-risposta.json 2>/dev/null); rm -f /tmp/exa-risposta.json
    ;;
  *)
    echo "… provider «$CAMPO» non provato da questo script: la ricerca passerà dal tool, una volta configurato."
    exit 0
    ;;
esac

# La risposta passa da un FILE, non da una pipe: con `python3 - <<'PY'` lo stdin è già occupato
# dallo script, quindi `printf … | python3` verrebbe ignorato (era il difetto: corpo vuoto).
RISPOSTA_FILE=$(mktemp); chmod 600 "$RISPOSTA_FILE"; TMP_ATTIVI+=("$RISPOSTA_FILE")
printf '%s' "$RISPOSTA" > "$RISPOSTA_FILE"
python3 - "$RISPOSTA_FILE" <<'PY'
import json, sys
try:
    testo = open(sys.argv[1]).read()
    d = json.loads(testo)
except Exception:
    print("✘ risposta non leggibile (primi 200 caratteri):"); print(testo[:200]); sys.exit(2)
# errori dei provider
for chiave_errore in ("error", "detail", "message", "errors"):
    e = d.get(chiave_errore)
    if e and not d.get("web") and not d.get("results"):
        if isinstance(e, dict): e = e.get("message") or e.get("detail") or e
        if isinstance(e, list) and e: e = e[0]
        print(f"✘ il provider ha rifiutato la richiesta: {str(e)[:180]}")
        sys.exit(3)
voci = []
for gruppo in (d.get("web"), d.get("results"), d.get("data")):
    if isinstance(gruppo, dict): gruppo = gruppo.get("results") or gruppo.get("value")
    if isinstance(gruppo, list):
        for v in gruppo:
            voci.append((v.get("title") or v.get("name") or "", v.get("url") or ""))
        break
if not voci:
    print("✘ nessun risultato nella risposta (chiave valida ma query vuota?)")
    sys.exit(4)
print(f"✔ la chiave FUNZIONA: {len(voci)} risultati")
for titolo, url in voci[:3]:
    print(f"   · {titolo[:70]}")
    print(f"     {url[:100]}")
PY
ESITO=$?
rm -f "$RISPOSTA_FILE"
if [[ $ESITO -eq 0 ]]; then
  echo
  echo "Conclusione: la configurazione è valida. Il tool di ricerca dell'harness la usa al prossimo turno."
fi
exit $ESITO
