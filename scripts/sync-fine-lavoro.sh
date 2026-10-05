#!/usr/bin/env bash
# Pubblica il lavoro della sessione su GitHub — ultimo passo di una sessione che ha toccato il codice.
#
# Perché esiste: il timer di sincronizzazione (`github-sync.timer`) è **spento** per scelta: la
# pubblicazione resta manuale, ma non deve più dipendere dal fatto che qualcuno si ricordi. Una
# sessione di lavoro si chiude con questo comando. Fa quattro cose, in quest'ordine:
#
#   1. PRIMA DI TUTTO il controllo di sicurezza: se nell'elenco di ciò che verrebbe pubblicato
#      compare qualcosa di riservato (.env, segreti, sessioni, backup, documenti con dati
#      personali), **aborta senza committare**. Un controllo che fallisce deve fermare tutto,
#      non pubblicare a metà: una volta in un commit, un file resta nella storia del repository.
#   2. mostra l'anteprima (quanti file, quanto pesano).
#   3. PRIMA della pubblicazione, il promemoria della memoria: se l'episodio di questa sessione
#      non ha una decisione registrata, lo dice in chiaro. È l'ultimo momento utile per scrivere
#      il perché prima che il contesto sparisca — e la parte che i file non contengono.
#      Avvisa e NON blocca: una decisione è soggettiva, un gate che si aggira per fatica è peggio
#      di un promemoria che si può ignorare.
#   4. registra e pubblica con `scripts/github-sync.sh` (che resta l'unico punto che fa push).
#   5. verifica che locale e remoto coincidano, leggendo il commit da GitHub.
#
# Uso:
#   bash scripts/sync-fine-lavoro.sh "messaggio breve del lavoro"     # pubblica
#   bash scripts/sync-fine-lavoro.sh --anteprima ["messaggio"]        # solo controllo + anteprima
#   bash scripts/sync-fine-lavoro.sh --forza "messaggio"              # salta il controllo di sicurezza (sconsigliato)
set -uo pipefail
cd /root/pi-harness || exit 1

MODO="pubblica"
case "${1:-}" in
  --anteprima|--dry-run) MODO="anteprima"; shift ;;
  --forza) MODO="forza"; shift ;;
esac
MESSAGGIO="${1:-sync $(date '+%Y-%m-%d %H:%M')}"

# Elementi che NON devono mai finire in un commit pubblicato. Il controllo è volutamente
# prudente: meglio un falso allarme (si guarda l'elenco e si decide) che un dato personale
# pubblicato per distrazione.
# `media/memoria/` è elencata per intero: i dati della memoria (indice, grafo, wiki, episodi,
# atlante) non si pubblicano mai — il repository è pubblico e l'indice concentra gli estratti
# di tutto il lavoro in un file solo. Il CODICE della memoria (media/memoria/*.mjs) NON è
# toccato da questo pattern, quindi continua a pubblicarsi normalmente.
RISERVATI='(^|/)\.env$|\.session-secret|\.github-access|\.github-remote|(^|/)sessions/|(^|/)backups/|node_modules/|media/uploads/|password|secret|token|CU2026|out_gemini|media/memoria/(indice|grafo|atlante|stato|dialogo|sorgenti)\\.(json|html|jsonl)|media/memoria/(wiki|episodi)/'

# `-uall` NON è un dettaglio: senza, git presenta una cartella mai tracciata come una voce sola
# (`media/nuova/`) e il controllo di sicurezza guarda il NOME DELLA CARTELLA, non i file dentro.
# Verificato su questa macchina: `media/memoria/` usciva come una riga da 6,3 MB mentre il gate
# dichiarava «nessun file riservato». Un controllo che non può fallire non è un controllo.
elenco=$(git status --porcelain -uall | sed -E 's/^.{2} //')

if [ -z "$elenco" ]; then
  echo "niente da pubblicare: nessuna modifica rispetto all'ultimo commit"
  git status -sb | head -1
  exit 0
fi

sospetti=$(printf '%s\n' "$elenco" | grep -Ei "$RISERVATI" || true)

echo "== anteprima =="
printf '  file interessati: %s\n' "$(printf '%s\n' "$elenco" | wc -l)"
printf '  dimensione: %s\n' "$(printf '%s\n' "$elenco" | xargs -r du -ch 2>/dev/null | tail -1 | cut -f1)"
printf '%s\n' "$elenco" | sed 's/^/    /' | head -40
[ "$(printf '%s\n' "$elenco" | wc -l)" -gt 40 ] && echo "    …"

if [ -n "$sospetti" ]; then
  echo
  echo "✘ CONTROLLO DI SICUREZZA FALLITO: nell'elenco ci sono elementi che non vanno pubblicati:"
  printf '%s\n' "$sospetti" | sed 's/^/    /'
  echo
  echo "  Nulla è stato committato né pubblicato."
  echo "  Se un file è legittimo, escludilo con una riga in .gitignore (col motivo) e riprova;"
  echo "  l'opzione --forza salta questo controllo ed è sconsigliata: una volta in un commit, il contenuto"
  echo "  resta nella storia del repository anche dopo una rimozione."
  exit 2
fi
echo "  ✓ controllo di sicurezza: nessun file riservato nell'elenco"

# Promemoria della memoria: non blocca la pubblicazione, ma non si può non vederlo.
DECISIONE_MANCANTE=0
echo
echo "== memoria =="
if node scripts/memoria-promemoria.mjs 2>/dev/null; then
  :
else
  DECISIONE_MANCANTE=1
fi

if [ "$MODO" = "anteprima" ]; then
  echo
  echo "anteprima soltanto: non ho committato né pubblicato nulla"
  exit 0
fi

echo
echo "== pubblicazione =="
if ! bash scripts/github-sync.sh --messaggio "$MESSAGGIO" 2>&1 | sed 's/^/  /'; then
  echo "✘ la pubblicazione non è riuscita: guarda l'output sopra"
  exit 1
fi

echo
echo "== verifica locale ↔ remoto =="
LOCALE=$(git rev-parse HEAD)
OWNER=$(grep -oP '(?<=^GITHUB_OWNER=).*' .github-access 2>/dev/null | tr -d '"'); OWNER=${OWNER:-Simus100}
REPO=$(grep -oP '(?<=^GITHUB_REPO=).*' .github-access 2>/dev/null | tr -d '"'); REPO=${REPO:-universalis-harness}
TOKEN=$(grep -oP '(?<=^GITHUB_TOKEN=).*' .github-access | tr -d '"')
REMOTO=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/commits/main" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('sha',''))" 2>/dev/null)

printf '  locale: %s\n  remoto: %s\n' "${LOCALE:0:9}" "${REMOTO:0:9}"
if [ -n "$REMOTO" ] && [ "${LOCALE:0:9}" = "${REMOTO:0:9}" ]; then
  echo "  ✓ pubblicato: https://github.com/$OWNER/$REPO"
  if [ "$DECISIONE_MANCANTE" = "1" ]; then
    echo
    echo "  ⚠ resta una cosa: questa sessione non ha una decisione in memoria."
    echo "    Il codice è pubblicato, il PERCHÉ della sessione no: chiama memoria_episodio"
    echo "    con { decisione, perche } — anche dopo il sync, finché la sessione è viva."
  fi
  exit 0
fi
echo "  ✘ locale e remoto NON coincidono: controlla il push (potrebbe esserci un commit non arrivato)"
exit 1
