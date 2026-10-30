#!/usr/bin/env bash
# Riavvio della dashboard principale DOPO il turno, con ROLLBACK AUTOMATICO.
#
# Perché esiste: chi lavora dentro la dashboard non può riavviarla dal proprio turno (ucciderebbe
# il processo che sta scrivendo la risposta). Questo script si lancia con
#   systemd-run --on-active=180 --unit=riavvio-audit bash media/riavvio-audit.sh
# e fa una cosa in più rispetto a `scripts/riavvio-con-verifica.sh`: se la dashboard non torna su,
# rimette i file del backup e riavvia. Un intervento non è finito finché non si può annullare.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ATTESA=${1:-180}
PORTA=${DASH_PORT:-8420}
B="http://127.0.0.1:$PORTA"
ESITO="media/riavvio-audit-$(date +%Y%m%d-%H%M).md"

U=$(grep -m1 '^DASH_USER=' .env | cut -d= -f2- | tr -d '"' | xargs)
P=$(grep -m1 '^DASH_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | xargs)
# il backup più recente creato prima dell'audit (quello di cui è stato provato il ripristino)
BK=$(ls -d backups/pre-audit-* 2>/dev/null | sort | tail -1)

nota() { printf '%s\n' "$*" >>"$ESITO"; }
salute() { curl -sS -m 5 -o /dev/null -w '%{http_code}' -u "$U:$P" "$B/api/health" 2>/dev/null || echo 000; }

nota "# Riavvio con il codice dell'audit — $(date '+%d/%m/%Y alle %H:%M:%S')"
nota ""
nota "- backup di ripristino: \`${BK:-NESSUNO}\`"
nota "- attesa prima del riavvio: ${ATTESA}s"
sleep "$ATTESA"

nota ""
nota "## Riavvio"
systemctl restart pi-dashboard.service
nota "- \`systemctl restart pi-dashboard\`: inviato"

CODICE=000
for i in $(seq 1 40); do
  CODICE=$(salute)
  [ "$CODICE" = "200" ] && { nota "- ✓ /api/health risponde (dopo ~$((i * 2))s)"; break; }
  sleep 2
done

if [ "$CODICE" != "200" ]; then
  nota "- ✘ /api/health NON risponde (codice $CODICE): ROLLBACK"
  if [ -n "$BK" ] && [ -f "$BK/dashboard.mjs" ]; then
    cp "$BK/dashboard.mjs" dashboard.mjs
    [ -f "$BK/dashboard.html" ] && cp "$BK/dashboard.html" dashboard.html
    nota "- file ripristinati da $BK"
    systemctl restart pi-dashboard.service
    for i in $(seq 1 40); do
      CODICE=$(salute)
      [ "$CODICE" = "200" ] && { nota "- ✓ dopo il rollback la dashboard risponde"; break; }
      sleep 2
    done
    [ "$CODICE" = "200" ] || nota "- ✘ ANCHE IL ROLLBACK NON RISPONDE: guarda \`journalctl -u pi-dashboard -n 120\`"
  else
    nota "- ✘ nessun backup utilizzabile: intervento manuale necessario"
  fi
  exit 1
fi

nota ""
nota "## Il codice nuovo è in esecuzione?"
FPRINT=$(curl -sS -m 5 -u "$U:$P" "$B/api/health" 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('codeHash','?'),d.get('pid','?'))" 2>/dev/null)
nota "- codeHash / pid: \`$FPRINT\`"
CTX=$(curl -sS -m 8 -u "$U:$P" "$B/api/contesto" 2>/dev/null)
if printf '%s' "$CTX" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert 'ledger' in d and 'cache' in d and 'prefisso' in d
L=d['ledger']
print('- ✓ /api/contesto risponde: prefisso', L.get('prefisso',{}).get('impronta'),
      '· sezioni', len(L.get('sezioni') or []),
      '· cache sprecata', d['cache'].get('missedTokens'), 'token')
" 2>/dev/null; then :; else
  nota "- ⚠ /api/contesto non risponde come atteso: il codice nuovo potrebbe non essere attivo"
fi

nota ""
nota "## Cosa guardare adesso"
nota "- la fascia in alto: sotto la cache compare lo spreco (\`−\$\`), se c'è"
nota "- \`curl -u … $B/api/contesto\` per il bilancio delle sezioni"
nota "- \`media/turni.jsonl\`: una riga per turno, con le classi di errore"
nota "- se qualcosa non torna: \`cp $BK/dashboard.mjs . && cp $BK/dashboard.html . && systemctl restart pi-dashboard\`"

printf 'riavvio con rollback: %s\n' "$ESITO"
