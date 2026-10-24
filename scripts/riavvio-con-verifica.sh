#!/usr/bin/env bash
# Riavvia la dashboard principale E VERIFICA che sia tornata su, da sola.
#
# Perché esiste: chi lavora dentro la dashboard non può riavviarla dal proprio turno — il
# riavvio ucciderebbe il processo che sta scrivendo la risposta. Questo script si lancia con
#    systemd-run --on-active=150 --unit=riavvio-dashboard bash scripts/riavvio-con-verifica.sh
# così il riavvio avviene DOPO, fuori dal turno, e l'esito viene scritto su un file (e nel
# journal) invece di andare perso. Se qualcosa non torna, lo dice con il comando di ripristino.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ATTESA=${1:-5}
PORTA=${DASH_PORT:-8420}
sleep "$ATTESA"

U=$(grep -m1 '^DASH_USER=' .env | cut -d= -f2- | tr -d '"' | xargs)
P=$(grep -m1 '^DASH_PASSWORD=' .env | cut -d= -f2- | tr -d '"' | xargs)
ESITO="media/riavvio-$(date +%Y%m%d-%H%M).md"
nota() { printf '%s\n' "$*" >>"$ESITO"; }
nota "# Riavvio della dashboard — $(date '+%d/%m/%Y alle %H:%M:%S')"
nota ""

systemctl restart pi-dashboard.service
nota "- \`systemctl restart pi-dashboard\`: inviato"

# attesa della porta (avvio tipico 3-6 s: parte l'agente, carica le skill, apre il server)
for i in $(seq 1 30); do
  if curl -sS -m 2 -o /dev/null -u "$U:$P" "http://127.0.0.1:$PORTA/api/health" 2>/dev/null; then break; fi
  sleep 2
done

SALUTE=$(curl -sS -m 5 -u "$U:$P" "http://127.0.0.1:$PORTA/api/health" 2>/dev/null)
if [ -z "$SALUTE" ]; then
  nota "- ✘ la dashboard NON risponde su 127.0.0.1:$PORTA dopo 60 s"
  nota "- stato: \`$(systemctl is-active pi-dashboard)\`"
  nota "- per ripristinare: \`systemctl restart pi-dashboard\` e guarda \`journalctl -u pi-dashboard -n 80\`"
  printf '%s\n' "$SALUTE" >/dev/null
  exit 1
fi
nota "- ✓ /api/health risponde"
printf '%s' "$SALUTE" | python3 -c "
import json,sys
d=json.load(sys.stdin)
f=[x for x in d.get('features',[]) if 'timestral' in x]
print('- codice in esecuzione: ' + str(d.get('codeHash','?'))[:12])
print('- feature Timestral: ' + (', '.join(f) if f else 'ASSENTI'))
" >>"$ESITO" 2>/dev/null

TIM=$(curl -sS -m 10 -u "$U:$P" "http://127.0.0.1:$PORTA/api/timestral" 2>/dev/null)
printf '%s' "$TIM" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    print('- ✘ /api/timestral non ha risposto con JSON: la funzione non è attiva'); raise SystemExit(0)
print('- servizio Timestral: ' + ('acceso' if d.get('up') else 'NON in ascolto') + ', taglia ' + str(d.get('taglia')))
print('- interruttore: ' + ('acceso' if d.get('enabled') else 'spento') + (' · deciso dall amministratore' if d.get('locked') else ' · libero') + ', tool attivi: ' + ('sì' if d.get('toolActive') else 'no'))
print('- serie disponibili: ' + str(len(d.get('demo') or [])) + ' incluse, ' + str(len(d.get('csv') or [])) + ' CSV')
" >>"$ESITO" 2>/dev/null

nota ""
nota "Ricaricare la pagina (Ctrl+Shift+R): menù **features → Timestral** e **📈 previsioni**."
printf 'riavvio verificato: %s\n' "$ESITO"
