#!/bin/bash
# Verifica le istanze limitate tester_07 e tester_08: impronte, endpoint, limiti, isolamento, HTTPS.
# Uso: bash media/verifica-istanze-tester.sh   (richiede le credenziali nel .env di ciascuna istanza)
echo "############ VERIFICA FINALE ############"
for pair in "07:8422:/home/tester07" "08:8423:/home/tester08"; do
  n=${pair%%:*}; rest=${pair#*:}; port=${rest%%:*}; home=${rest#*:}
  DU=$(grep -E '^DASH_USER=' $home/.env | cut -d= -f2-); DP=$(grep -E '^DASH_PASSWORD=' $home/.env | cut -d= -f2-)
  echo "===== tester_$n (porta $port) ====="
  H=$(curl -s -m 10 -u "$DU:$DP" http://127.0.0.1:$port/api/health)
  EXEC=$(echo "$H" | python3 -c "import sys,json;print(json.load(sys.stdin)['codeHash'])")
  DISK=$(sha256sum $home/dashboard.mjs | cut -c1-16)
  if [ "$EXEC" = "$DISK" ]; then UGUALE="SI"; else UGUALE="NO ***"; fi
  echo "  codeHash in esecuzione = su disco: $UGUALE  ($EXEC)"
  echo "  impronte: mjs $(sha256sum $home/dashboard.mjs | cut -c1-16) / html $(sha256sum $home/dashboard.html | cut -c1-16)"
  echo "  byte: mjs $(wc -c < $home/dashboard.mjs) / html $(wc -c < $home/dashboard.html)"
  for p in "/" "/login" "/api/state" "/api/memoria" "/memoria" "/svg-sanitize.mjs" "/sw.js" "/manifest.webmanifest"; do
    printf '    %-22s %s\n' "$p" "$(curl -s -m 10 -o /dev/null -w '%{http_code}' -u "$DU:$DP" http://127.0.0.1:$port$p)"
  done
  M=$(curl -s -m 10 -o /dev/null -w '%{http_code}' -u "$DU:$DP" -X POST -H 'Content-Type: application/json' -d '{"model":"gpt-5"}' http://127.0.0.1:$port/api/model)
  echo "    POST /api/model -> $M (deve essere 403)"
  echo "  skill presenti: $(ls $home/skills | wc -l)"
  echo "  differenze skill rispetto alla principale: $(diff -rq $home/skills /root/pi-harness/skills 2>/dev/null | wc -l) (atteso: 1, solo social-publish)"
  curl -s -m 10 -u "$DU:$DP" http://127.0.0.1:$port/api/state | python3 -c "
import sys,json
s=json.load(sys.stdin); q=s['quota']
print('  quota:', q['used'],'/',q['limit'],'| modello:',s['model']['id'],'| locked:',s['locked']['model'],'| thinking off:',s['thinking']['disabled'])
print('  chat: ',len(s.get('messages') or []),'messaggi')"
  echo "  disco: $(df -h $home | tail -1 | awk '{print $3" usati, "$4" liberi"}')"
done
echo
echo "=== isolamento fra le due istanze ==="
if sudo -u tester08 ls /home/tester07 >/dev/null 2>&1; then echo "  *** tester08 LEGGE la home di tester07 ***"; else echo "  ok: tester08 non legge /home/tester07"; fi
if sudo -u tester07 ls /home/tester08 >/dev/null 2>&1; then echo "  *** tester07 LEGGE la home di tester08 ***"; else echo "  ok: tester07 non legge /home/tester08"; fi
echo
echo "=== HTTPS pubblico (401 senza credenziali = corretto) ==="
for u in https://tester07.89-117-59-173.sslip.io https://tester08.89-117-59-173.sslip.io https://htester.universalisproduzioni.it https://harness.universalisproduzioni.it; do
  printf '  %-52s %s\n' "$u" "$(curl -s -m 20 -o /dev/null -w '%{http_code}' $u/api/health)"
done
echo
echo "=== journal: errori negli ultimi 15 minuti ==="
for u in pi-tester07 pi-tester08; do
  n=$(journalctl -u $u --since "-15 min" --no-pager 2>/dev/null | grep -icE "error|EACCES|exception|fatal")
  echo "  $u: $n righe di errore"
done
