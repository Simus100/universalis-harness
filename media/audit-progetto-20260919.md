# Audit Universalis Harness — 2026-09-19

Obiettivo: capire se la dashboard è **utilizzabile, completa e stabile** come prima versione
rilasciabile. Metodo: esecuzione reale della suite, ispezione del servizio in produzione,
verifica di configurazione, dipendenze, backup e codice. Nessuna modifica applicata.

## 1. Cosa gira adesso

| Elemento | Stato |
|---|---|
| `pi-dashboard.service` | **active** (dal 2026-09-19 14:37, `Restart=always`, `NRestarts=0`) |
| processo | PID 196530, RSS ~240 MB, CPU 2.7%, uptime ~2h40 |
| runtime servizio | `/home/linuxbrew/.linuxbrew/bin/node` **v26.8.2** |
| runtime test/interattivo | `/usr/bin/node` **v24.21.0** |
| versione codice | `dashboard-2026-09-18.3` (coincide con `/api/health`) |
| Caddy | active, HTTPS + zstd/gzip con `/events` escluso dalla compressione |
| esposizione | dashboard solo su `127.0.0.1:8420`, l'unica porta pubblica è Caddy |
| `pi-backup.timer` | attivo, prossimo giro 2026-09-20 04:16, 6 archivi, retention ok |
| codebase | `dashboard.mjs` 3.068 righe, `dashboard.html` 4.562 righe, **nessun** repo git |

## 2. Suite di test — esito di oggi (tutta verde)

| Test | Esito |
|---|---|
| `media/test-static.mjs` (coerenza HTML↔server) | 134 ok, 0 falliti |
| `media/test-ui.mjs` (logica frontend in `node:vm`) | 89 ok, 0 falliti |
| `media/check-html-js.mjs` (sintassi script inline) | 1/1 blocchi validi |
| `media/check-skills.mjs` (frontmatter skill) | 3 ok, 0 falliti |
| `media/audit.mjs` (endpoint/comandi/viste/id/codice morto/file) | 0 problemi, 1 da valutare |
| `media/test-api.sh` (auth, rate-limit, PWA, ricerca, export) | 38 ok, 0 falliti |
| `media/test-functions.mjs` (goal, cron, skill, browser, subagent, viste) | 76 ok, 0 falliti |
| `media/test-views.mjs` (viste reali su browser + mobile 390×844) | 32 ok, 0 falliti |
| `media/test-chat.sh` (stop, modifica, rigenera, ricerca, export) | 24 ok, 0 falliti |
| **totale** | **~397 verifiche, 0 fallimenti** |

Conclusione: **non ci sono funzionalità rotte**. I problemi trovati sono di *robustezza,
configurazione e processo*, non di funzionamento immediato. È per questo che il piano punta
sulla stabilità e non sul "far funzionare".

## 3. Problemi e rischi (con evidenza)

### P1 — Nessun versionamento del codice (rischio alto)
`git status` → *not a git repository*. Non esiste storia, diff, né rollback selettivo. Il ripristino
passa solo dai tar.gz giornalieri (04:16) o dalle 21 copie `.bak` sparse in `media/`. In una fase di
stabilizzazione questo è il vincolo più limitante: ogni correzione è irreversibile per scelta.
Nota: la barra statistiche mostra le informazioni **git** della root, che qui non hanno nulla da mostrare.

### P2 — Goal letti solo all'avvio (disallineamento memoria/file)
`goals.json` è caricato in memoria una volta sola; al primo salvataggio la dashboard riscrive il file
dall'array in memoria. Modifiche esterne al file vengono perse (rischio già documentato nel README,
già capitato). Verificato ora: `GET /api/goals` → `[]`, file → `[]` (allineati).

### P3 — Bridge della live view: errori WebSocket ricorrenti
Nei log del 19/09: `[browser-live] errore: errore WebSocket` → `[browser-live] connessione chiusa`
ripetuti, con riconnessioni a porte diverse (`:43523`) e cambi di frame rate (3/s → 10/s).
La vista live è funzionante ma la sua connessione **cade** e non risulta documentata una
riconnessione automatica con feedback in interfaccia.

### P4 — Configurazione ambigua tra root e progetto (rischio alto)
`.env`: `DASH_ROOT=/root`. Il progetto vive in `/root/pi-harness`.
Evidenza: `GET /api/files?path=pi-harness/media` → 107 voci; `GET /api/files?path=media` → **0 voci**
(punta a `/root/media`, vuota). Ogni percorso relativo dipende dalla root, non dal progetto:
fonte di errori per l'agente, per i comandi e per le viste. Inoltre root=`/root` espone all'agente
l'intero host.

### P5 — Due runtime Node diversi (rischio medio)
Il servizio gira su **v26.8.2** (linuxbrew), mentre `node` nel PATH è **v24.21.0** (che è il runtime
con cui girano suite di test e `harness.mjs`). I test non girano sul runtime di produzione.

### P6 — Dipendenza non pinnata (rischio medio)
`node_modules/@earendil-works/pi-coding-agent` è un **symlink** al pacchetto globale (0.85.1):
un `npm -g update` cambia il motore della dashboard senza passare da review, e `package.json`
non ha né versioni né lockfile.

### P7 — Nessun monitoraggio attivo (rischio medio)
systemd riavvia il processo solo se *muore*. Un event loop bloccato o un blocco logico (non un crash)
non viene rilevato: nessun healthcheck esterno, nessuna verifica automatica post-riavvio, nessun
allarme. Non c'è nemmeno il test del **ripristino** da backup: il backup è verificato (`tar -tzf`)
ma il restore non è mai stato esercitato.

### P8 — Igiene del repository
21 file `.bak`/`pre-*` in `media/` (1,7 MB), `dashboard.html` e `dashboard.mjs` di 232 KB e 124 KB,
residui inutili: `.tail-fix.tmp`, `nuovo_file.txt`, `tre.txt`, `media/w2.txt`,
`media/prova-scrittura.txt`, `media/uploads/` con file di prova. Nessuna politica di pulizia.

### P9 — Processo come root (rischio accettato, da esplicitare)
`User=root` + `DASH_ROOT=/root` + tool `bash`: raggio d'azione massimo sull'host. Il tool browser è
correttamente isolato (`pi-browser` + sandbox verificata), il resto no. Documentato nel README, ma
non mitigato.

### P10 — Manca il concetto di "versione rilasciata"
`VERSION = "dashboard-2026-09-18.3"` è un'etichetta, non una release: niente changelog, niente
freeze, niente procedura di rollback provata. Le correzioni avvengono direttamente in produzione
con `systemd-run` (che interrompe anche la sessione agente).

## 4. Piano d'azione verso la v1 stabile

Ordinato per rapporto rischio/beneficio; ogni fase è verificabile da sola con la suite esistente.

- **FASE 0 — rete di sicurezza (prerequisito di tutto):** repo git nel progetto con `.gitignore`
  adeguato (escludere `node_modules`, `backups/`, `sessions/`, `media/uploads/`), primo commit dello
  stato attuale + tag `baseline-2026-09-19`, e script di ripristino provato (backup → restore → diff).
- **FASE 1 — una sola verità sulla configurazione:** decidere e documentare `DASH_ROOT` (progetto
  contro host), allineare `MEDIA_DIR` e i percorsi relativi, eliminare l'ambiguità `media/` vs
  `pi-harness/media`; uniformare il runtime Node tra servizio e test (pin in `package.json` +
  `.nvmrc`/`engines`, o symlink esplicito) e pin della versione di pi.
- **FASE 2 — robustezza del runtime:** controllo d'integrità periodico (healthcheck che verifica
  `/api/state` in tempi utili e non solo la porta), watchdog con riavvio su blocco logico, gestione
  esplicita di unhandled rejection, log strutturato con gli errori del bridge live view.
- **FASE 3 — live view solida:** riconnessione automatica del bridge al cambio di porta/riavvio del
  daemon, messaggi chiari in interfaccia per ogni stato (nessun frame, controllo, disconnessione),
  verifica del comportamento su pagina ferma.
- **FASE 4 — coerenza goal/cron:** rimuovere il disallineamento memoria-file (rilettura o watcher su
  `goals.json` e `schedules.json`), con test che modifica il file mentre la dashboard gira.
- **FASE 5 — igiene e copertura:** pulizia dei residui e delle copie `.bak` con politica unica,
  test di restore del backup, estensione di `test-functions.mjs` alle aree non coperte (restore,
  watcher, bridge riconnessione, PWA offline).
- **FASE 6 — release v1:** congelare la versione, changelog, deploy con `systemd-run` + verifica
  post-riavvio automatica, procedura di rollback documentata e provata.

## 4-bis. Difetto funzionale n.1 — chat che non si aggiorna durante la risposta (diagnosi)

**Segnalazione del proprietario:** «talvolta non vedo la pagina scorrere e devo fare io il refresh;
vedo solo i comandi e non vedo la catena di pensiero né nulla, a meno che non faccia refresh».

**Causa individuata** — `dashboard.html`, riga 1747:

```js
es.addEventListener("error", (e) => { try { $("err").textContent = JSON.parse(e.data).message; } catch {} setStatus(false); });
```

Il listener è registrato con lo **stesso nome dell'evento nativo di errore di `EventSource`**, quindi
si attiva anche quando cade la connessione SSE (non solo per l'evento applicativo `error` inviato
dal server). In quel caso `e.data` è `undefined`, il `try/catch` assorbe l'eccezione — ma
`setStatus(false)` è **fuori dal `try`** ed esegue comunque.

Effetto a catena:
1. la UI torna in *idle* (sparisce il pulsante ⏹, compare Invia) mentre il modello sta ancora generando;
2. `setStatus(false)` esegue `cur.assistant = null; cur.thinking = null;` → **il riferimento alla bolla in corso si perde**;
3. le card dei tool continuano a comparire perché `tool_start` fa `chat.appendChild(...)` e **non dipende** da `cur.assistant` — mentre testo e thinking no: è esattamente il sintomo «vedo solo i comandi»;
4. i delta successivi creano una **bolla nuova**, spezzando la risposta in più pezzi;
5. al refresh la `GET /api/state` ricarica la sessione con la risposta ormai salvata, quindi «si sistema».

**Aggravante — nessun replay.** `/events` scrive solo `retry: 2000` (riga 2410) e non manda `id:`,
né esiste un buffer lato server. I delta emessi nei ~2 s di riconnessione di `EventSource` sono
persi **definitivamente**, e non c'è alcun indicatore in interfaccia che dica che lo stream è caduto.

**Perché la suite non lo ha visto:** nessun test simula la caduta della connessione a metà risposta.
Il service worker non c'entra (per il documento è *network-first*).

**Direzione del fix:** distinguere errore applicativo da errore di trasporto (es. `e.data === undefined`),
non azzerare lo stato della bolla su errori di trasporto, esporre lo stato della connessione in UI,
riallineare la chat alla riconnessione e aggiungere `id:`/Last-Event-ID con replay per non perdere i delta.

## 5. Criterio di accettazione della v1

1. `git log` racconta le modifiche e un rollback è stato eseguito davvero almeno una volta.
2. Suite completa verde **sul runtime di produzione**.
3. Configurazione senza ambiguità: un solo `DASH_ROOT` dichiarato, percorsi coerenti, runtime pinnato.
4. Un blocco logico del servizio viene rilevato e recuperato senza intervento manuale.
5. La live view si riconnette da sola e spiega sempre lo stato in interfaccia.
6. Un ripristino da backup è stato provato end-to-end.
7. Deploy e rollback sono procedure ripetibili, non improvvisazioni.

---

## Round 2 — bug di visualizzazione dei tool durante lo streaming (2026-09-19, sera)

Segnalazione del proprietario: «nella visualizzazione della risposta del modello, ad un certo
punto vedo solo scritte *bash bash bash* ripetute ogni linea, ma non vedo la catena di pensiero,
i file, il testo di intermezzo … si blocca la dashboard; se faccio refresh tutto torna normale».

### Causa individuata (riprodotta in `node:vm` e in browser vero)

`tool_start` faceva `chat.appendChild(...)`: le card dei tool erano **figlie dirette della chat**,
fuori dal messaggio assistant in corso. In un turno con molte chiamate `bash` succedeva che:

1. testo e pensiero venivano accodati alla bolla creata all'inizio (che restava **sopra**);
2. ogni tool aggiungeva una riga **sotto**, in fondo alla chat;
3. lo scorrimento automatico seguiva il fondo → si vedevano solo le righe «🔧 bash …»;
4. il testo finale, arrivando dopo i tool, finiva di nuovo nella bolla sopra, fuori vista.

Il refresh ricostruiva tutto leggendo la sessione salvata: da qui l'impressione di «dashboard
bloccata» e di «si sistema ricaricando».

### Correzioni

| # | Intervento | File |
|---|---|---|
| 1 | card dei tool **dentro** il messaggio, in ordine (pensiero, testo, tool, testo…); ogni card mostra **nome + riassunto** (comando/percorso) e **esito ✓/✗** via nuovo evento `tool_end` | `dashboard.html` |
| 2 | snapshot SSE **a segmenti** (`{kind:'thinking'\|'text'\|'tool'}`): alla riconnessione il client ricostruisce l'intero messaggio invece di accodare (idempotente, i tool restano al loro posto) | `dashboard.mjs`, `dashboard.html` |
| 3 | `renderMessages` conserva l'**ordine dei blocchi** anche da sessione salvata: vista in streaming e vista ricaricata coincidono | `dashboard.mjs`, `dashboard.html` |
| 4 | autoscroll **differito a un frame** (`scheduleAutoscroll`): non si legge più il layout a ogni token (efficienza) | `dashboard.html` |
| 5 | buffer di replay **azzerato all'inizio di ogni turno**: non si riesumano eventi dei turni precedenti, memoria limitata | `dashboard.mjs` |
| 6 | `resetCur()`: il reset del messaggio in corso mantiene `wrap`/`tools` (evita un crash in `endToolCard`) | `dashboard.html` |
| 7 | niente pulsanti di azione sul messaggio mentre è ancora in streaming | `dashboard.html` |

### Altri difetti trovati e chiusi in questo round

- **Deploy disallineato**: il servizio in produzione (avviato 17:41) girava un `dashboard.mjs`
  più vecchio di quello su disco (modificato 17:47: fix `turnActive` che spegneva il dot, log
  della password). Rilasciata **`dashboard-2026-09-19.2`**, verificata sul processo in esecuzione.
- **Rinomina della chat sbagliata**: `POST /api/sessions/rename` ignorava `id` e rinominava sempre
  la sessione **attiva**; cliccando «✎ rinomina» su un'altra chat si rinominava quella corrente.
  Ora il client manda l'id e il server rinomina la sessione scelta (apertura del file relativo).
- **Test che fallivano per motivi sbagliati**: verifica dello stop fatta 1,5 s dopo l'invio (una
  risposta breve era già finita), controllo della riga `$ /status` cercato nel `.bubble` ma
  presente nel `.who`, rinomina verificata sulla chat sbagliata. Corretti.

### Test aggiunti

- `media/test-stream-resilience.mjs`: scenari 7–8 — card dentro il messaggio, ordine fedele,
  `tool_end` ✓/✗, snapshot a segmenti idempotente.
- `media/test-stream-tools-browser.mjs` (nuovo): browser vero, turno con più `bash` — nessuna card
  orfana, snapshot a segmenti alla riconnessione, testo finale **dopo** le card.
- `media/test-static.mjs`: 4 nuovi controlli strutturali sul cablaggio dei tool.
- `media/test-all.sh`: aggiunti 7b (`test-stream-tools-browser`) e 7c (`test-funzionalita-browser`).

### Esito suite completa (`bash media/test-all.sh`)

```
test-static 138 · check-html-js 1 · check-skills 3 · test-ui 89 · stream-resilience 27
test-api 38 · stream-replay 12 · test-functions 76 · test-views 32
stream-tools-browser 13 · funzionalita-browser 28 · test-chat 24 · reconnect-live 19 · regression 33
=> 533 verifiche, 0 fallimenti   ✅
```

Servizio in produzione: `dashboard-2026-09-19.2`, smoke test post-riavvio tutto ok
(`media/post-restart-check.txt`), password non presente nei log.
