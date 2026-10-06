#!/usr/bin/env bash
# Suite completa della dashboard: statica + API + runtime (modello) + non-regressione.
# Uso: bash media/test-all.sh
set -uo pipefail
cd /root/pi-harness
rc=0

echo "########## 1/10 controlli statici (HTML <-> server) ##########"
node media/test-static.mjs || rc=1
echo

echo "########## 2/10 sintassi del JavaScript dentro dashboard.html ##########"
node media/check-html-js.mjs || rc=1
echo

echo "########## 3/10 frontmatter delle skill (YAML, name, description) ##########"
node media/check-skills.mjs || rc=1
node media/audit.mjs || rc=1
echo

echo "########## 4/10 logica frontend senza browser (notifiche, frecce, snippet) ##########"
node media/test-ui.mjs || rc=1
echo

echo "########## 4b/10 resilienza dello stream: la connessione cade a metà risposta ##########"
node media/test-stream-resilience.mjs || rc=1
echo

echo "########## 4c/10 domande interattive all'utente (unità: stati, timeout, validazione, segreti) ##########"
node media/test-ask.mjs || rc=1
echo

echo "########## 4d/10 interruttore delle domande (pulsante, /ask, persistenza, DASH_ASK=off) ##########"
node media/test-ask-toggle.mjs || rc=1
echo

echo "########## 5/10 istanza di prova, auth/rate-limit/PWA/ricerca/export ##########"
bash media/test-api.sh start >/dev/null || exit 1
bash media/test-api.sh tests || rc=1
echo

echo "########## 5b/10 replay degli eventi SSE (id: + Last-Event-ID) ##########"
node media/test-stream-replay.mjs http://127.0.0.1:8430 pi testpass || rc=1
echo

echo "########## 6/10 funzioni: goal, pianificazioni, skill, browser, contesto ##########"
node media/test-functions.mjs || rc=1
echo

echo "########## 7/10 viste: apertura e ritorno (con browser reale) ##########"
node media/test-views.mjs || rc=1
echo

echo "########## 7b/10 turno con tool in browser vero (card nel messaggio, snapshot a segmenti) ##########"
node media/test-stream-tools-browser.mjs || rc=1
echo

echo "########## 7c/10 matrice funzionale in browser vero (invio, stop, storico, snippet, drawer, file, palette) ##########"
node media/test-funzionalita-browser.mjs || rc=1
echo

echo "########## 8/10 runtime con il modello (stop, modifica, rigenera) ##########"
bash media/test-chat.sh || rc=1
echo

echo "########## 8a/10 domande interattive con il MODELLO vero (chiede, si risponde, il turno riprende) ##########"
node media/test-ask-live.mjs || rc=1
echo

echo "########## 8a-bis/10 domande interattive in BROWSER vero (card, reload, esito, testo libero) ##########"
node media/test-ask-browser.mjs || rc=1
echo

echo "########## 8a-ter/10 domande interattive nell'harness da TERMINALE (harness.mjs) ##########"
node media/test-ask-cli.mjs || rc=1
echo

echo "########## 8b/10 riconnessione a metà risposta, con il modello (replay + snapshot) ##########"
node media/test-stream-reconnect-live.mjs http://127.0.0.1:8430 pi testpass || rc=1
echo

echo "########## 9/10 non-regressione (file manager, allegati, interruttori) ##########"
bash media/test-regression.sh || rc=1

echo "########## 9b/10 documenti PDF (server: pagine, testo, ricerca, degradazione) ##########"
node media/test-pdf.mjs || rc=1
echo

echo "########## 9c/10 documenti PDF (browser vero: card in chat e lettore a pagine) ##########"
node media/test-pdf-ui.mjs || rc=1
echo

bash media/test-api.sh stop >/dev/null 2>&1
echo
echo "########## nota ##########"
echo "Le skill NON si ricaricano mentre la sessione è occupata (reloadSkills salta il reload"
echo "se session.isIdle è falso): per una verifica pulita del frontmatter e del caricamento,"
echo "con la sessione ferma: node media/check-skills-loader.mjs [nome-skill]"
echo
if [ "$rc" = "0" ]; then echo "✅ TUTTI I TEST PASSATI"; else echo "❌ ALCUNI TEST FALLITI"; fi
exit $rc
