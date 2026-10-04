# Manuale operativo — Universalis Harness

Guida completa all'uso e alla gestione di un'istanza: comandi, viste, API, sicurezza, backup,
test e note operative. Per la presentazione del prodotto vedi il [README](../README.md).

Il manuale descrive l'istanza di produzione (`/root/pi-harness`, porta 8420) e vale per tutte le
istanze: ognuna ha la sua cartella, la sua `.env` e la sua unit systemd (vedi
[ISTANZE.md](ISTANZE.md)).

---

## Documentazione e strumenti di servizio

| dove | cosa |
|---|---|
| `docs/ISTANZE.md` | le tre istanze in funzione (principale, `tester_01`, sottocliente limitato `tester_07`): porte, utenti, unit, host, limiti |
| `docs/RICOSTRUZIONE.md` | come reinstallare o ripristinare da zero l'harness: prerequisiti, unit systemd, Caddy, disco dedicato e quota, sandbox, variabili d'ambiente, smoke test |
| `docs/SYNC-GITHUB.md` | cosa finisce nel repository pubblico, cosa resta fuori, come pubblicare gli aggiornamenti |
| `scripts/backup-export.sh` | genera il pacchetto di esportazione completo in `backup_export/` (istanze, configurazioni, guide, checksum) |
| `scripts/github-sync.sh` | crea/aggiorna il repository GitHub (`--stato`, `--crea-repo`, `--dry-run`, `--messaggio`) |
| `scripts/sync-fine-lavoro.sh` | **sync in coda alla sessione**: controllo dei file riservati (aborta prima del commit), anteprima, pubblicazione con verifica locale↔remoto |

## 1. Harness da terminale (`harness.mjs`)

```bash
node harness.mjs --model deepseek-flash --think high
```

Comandi: `/think <livello>`, `/think next`, `/model <id>`, `/exit`.

## 2. Dashboard web (`dashboard.mjs`)

In produzione gira dietro **Caddy** (HTTPS automatico) come servizio `pi-dashboard`.

### Accesso

| URL | Note |
|-----|------|
| **https://harness.universalisproduzioni.it** | dominio principale (CNAME → sslip.io) |
| https://pi.universalisproduzioni.it | vecchio indirizzo: record DNS rimosso il 2026-09-18, il blocco Caddy resta attivo |
| https://89-117-59-173.sslip.io | fallback |

Utente `pi`, password in `/root/pi-harness/.env`.

### Avvio manuale (sviluppo)

```bash
node dashboard.mjs --model deepseek-flash --think high --port 8420 --root /root
```

### Architettura

```
Browser --HTTPS--> Caddy (:80/:443, Let's Encrypt) --HTTP--> dashboard (127.0.0.1:8420)
```

La dashboard ascolta sull'indirizzo `DASH_HOST` (default nel codice `0.0.0.0`); in produzione
`.env` imposta **`DASH_HOST=127.0.0.1`**, quindi non è raggiungibile direttamente da internet:
l'unica porta esposta è quella di Caddy.

Config Caddy: `/etc/caddy/Caddyfile` (certificati rinnovati automaticamente).

### Chat
- streaming in tempo reale, anteprima del thinking e chiamate ai tool
- barra statistiche: modello, thinking, contesto (barra/%), token, cache, costo, git, durata
- ottimizzata per mobile (safe-area, input 16px, touch target ≥44px)
- **barra statistiche mostrabile/nascondibile** (pulsante 📊) **anche da desktop**: la scelta è
  ricordata in `localStorage` (`pi.statsHidden`) e resta dopo un ricaricamento. Nascondendola il
  contenuto guadagna tutta l'altezza liberata
- **allegati** (📎): immagini e file. Le immagini vengono inviate al modello (se il modello
  supporta input immagini, es. `deepseek-flash`); gli altri file vengono salvati in
  `.pi-chat-uploads/` e il loro percorso è passato al modello, che può leggerli/modificarli.
- i **file prodotti o letti dal modello** (tool `read`/`write`/`edit`) compaiono in chat come
  **card** con due azioni: **apri** (nell'editor) e **⬇ scarica** (download diretto). La card
  compare **subito**, appena il tool finisce (prima serviva ricaricare la pagina).
  Le card sono generate anche per i percorsi citati nel testo della risposta, in qualsiasi
  forma siano scritti: `/root/pi-harness/media/rapporto-fix-20260927.md`, `media/rapporto-fix-20260927.md` o `rapporto-fix-20260927.md`.
  La risoluzione al file reale la fa il server (`/api/resolve-files`) e la card si disegna
  **solo** per ciò che esiste davvero: niente più tasti «⬇ scarica» che puntavano a una
  cartella o a un file inesistente. Una cartella citata (es. `media/tema/`) si scarica come
  `.zip`, dal server.
- **catena di pensiero, testo e tool intercalati**: durante un turno agentico il modello alterna
  pensiero, testo e chiamate ai tool (`bash`, `read`, …). Ogni blocco è reso **dentro il messaggio
  in corso**, nell'ordine reale, e ogni card di tool mostra il **riassunto leggibile** della
  chiamata (comando/percorso) e il suo **esito** (✓/✗) quando termina. Prima le card erano
  appese in fondo alla chat, fuori dal messaggio: in un turno con molte chiamate `bash` il
  testo e il pensiero restavano sopra (fuori vista) e in fondo si accumulavano solo righe
  «🔧 bash …», sembrando bloccata; serviva ricaricare la pagina. La ricostruzione dai messaggi
  salvati (`toUiMessage`) conserva lo stesso ordine di blocchi.
- gli eventuali **errori** del provider sono mostrati in chat
- **resilienza dello stream**: se la connessione cade mentre la risposta è in corso (rete mobile,
cambio Wi-Fi, scheda in background, riavvio del proxy) la chat **non si sgancia**. L'evento
nativo di errore di `EventSource` è distinto dall'errore applicativo del provider: il primo non
spegne più lo stato «working» né azzera la bolla in corso — prima testo e thinking sparivano
mentre le card dei tool continuavano ad arrivare, e serviva ricaricare la pagina. In barra di
stato compare **⚠ riconnessione…** finché il flusso non torna. Alla riconnessione il server
rispedisce gli eventi persi (`id:` + `Last-Event-ID`, buffer azzerato all'inizio di ogni turno
per non riesumare quelli del passato) e, se il turno è ancora in corso, manda lo **snapshot a
segmenti** (pensiero/testo/tool nell'ordine reale): il client ricostruisce l'intero messaggio
invece di accodare, quindi il riallineamento è idempotente e la risposta non resta tagliata né
duplicata — nemmeno quando i tool sono in mezzo al testo.
- **⏹ stop**: durante la generazione il pulsante *Invia* diventa **⏹ stop** e interrompe
davvero la risposta (abort lato server). Il testo già arrivato resta visibile in una bolla
marcata *«interrotta»*, anche se pi non lo salva nella sessione.
- **✎ modifica** e **↻ rigenera** sotto i messaggi: la modifica riscrive l'ultimo messaggio
utente e la conversazione riparte da lì, il rigenera rifà l'ultima risposta senza riscrivere
il prompt. In entrambi i casi si torna al punto scelto nell'albero della sessione
(`navigateTree`): il ramo abbandonato resta nel file JSONL, ma non viene più inviato al modello
(quindi non consuma contesto).
- **⧉ copia** su ogni messaggio (negli appunti).
- **nessuna eccezione può spegnere il servizio**: lo stato iniziale della chat si calcola
  **prima** di aprire lo stream SSE, e una risposta di errore non prova mai a riscrivere header
  già inviati (era il guasto che faceva terminare il processo Node: `ERR_HTTP_HEADERS_SENT`
  dentro il `catch`, con `Restart=always` in ciclo). Le statistiche di sessione, se una sessione
  non standard non le rende calcolabili, si mostrano a zero invece di far fallire lo stato.
- **anteprima SVG robusta alle fence**: le aperture indentate fino a 3 spazi (fence dentro un
  elenco) e le chiusure con fine riga CRLF vengono riconosciute; prima la chiusura non veniva
  vista e il testo successivo finiva dentro la card del disegno.
- **rappresentazioni visive**: un blocco Markdown con linguaggio `svg` non viene mostrato come
  codice ma reso come **anteprima grafica nel punto esatto del messaggio** (vista ingrandita,
  «mostra codice», copia, download). Vedi *Rappresentazioni visive* qui sotto.

### Domande interattive all'utente (tool `ask_user`)

Quando una richiesta è **ambigua o incompleta** e l'informazione che manca cambia l'esito del lavoro
(quale bersaglio, quale formato, quale vincolo, un'azione non reversibile) l'agente **non tira a
indovinare**: pone la domanda **in chat**, in modo interattivo, e **attende la risposta**, che gli
torna come dato strutturato.

- **La card sta dentro il messaggio**, dove l'agente ha posto la domanda (stesso principio delle
  card dei tool): non un dialog modale, non una riga in fondo alla chat. Il testo che segue si
  accoda **sotto** la domanda.
- **1–4 domande per chiamata** (una è la norma), ognuna con **2–6 opzioni** con etichetta breve e
  descrizione di *cosa cambia*; la scelta consigliata va per prima con «(consigliata)».
- **Scampatoie sempre presenti**: il campo **«Altro / rispondi a parole tue»** e il pulsante
  **«Salta / decidi tu»**. Il modello *non* deve scrivere un'opzione «Altro»: la aggiunge la UI
  (due scampatoie = risposte ambigue). Ci sono anche `multiSelect` e il conto alla rovescia.
- **Esiti espliciti**: `risposto`, `saltata`, `annullata`, `tempo scaduto`. Dopo un rifiuto o una
  scadenza il modello **prosegue con il proprio miglior giudizio** dichiarando l'assunzione, invece
  di restare appeso o inventare una risposta che nessuno ha dato.
- **Domanda e risposta restano nel transcript**: alla risoluzione la card diventa un riepilogo
  compatto (domanda → risposta) e si rivede anche dopo un reload, ricostruita dai messaggi salvati
  (il risultato del tool è nella sessione, non solo a schermo).
- **Sopravvive a reload e riconnessione**: la domanda pendente vive sul server ed è ripubblicata
  da `GET /api/state` e dal primo evento SSE; lo snapshot del turno la ridisegna **una sola volta**
  (pi salva la chiamata al tool *prima* che il tool finisca: senza deduplica si vedevano due card,
  e una restava «in attesa» per sempre).
- **Mai appesa per sempre**: timeout **900 s** di default (30–3600 s), ⏹ stop annulla le domande
  pendenti, un nuovo turno le chiude, un riavvio del servizio marca le orfane come `scadute` nel log.
- **Niente segreti in un questionario**: password, API key e token non si chiedono in chat (la
  specifica MCP lo vieta in *form mode*). La richiesta viene **rifiutata con spiegazione**, e
  l'agente viene indirizzato a un file/`.env`.
- **Prompting**: la soglia («chiedi solo se cambia l'esito», «prima indaga da solo», «non chiedere
  il permesso di procedere») sta nella descrizione del tool e in una sezione dedicata del system
  prompt, non lasciata al caso.

Log di audit: **`media/ask-log.jsonl`** (domanda, esito, durata, sessione), append-only con
rotazione a 4 MB. Ricerca, fonti e decisioni di progetto: `media/ricerca-domande-interattive-2026-09-20.md`.

L'interruttore **`DASH_ASK=off`** non registra il tool (rimosso dalla lista inviata al modello):
serve alle istanze **non presidiate** — test automatici, servizi — dove un'attesa di 15 minuti
sarebbe solo tempo perso. È spento di default **solo nei test**; in dashboard è sempre acceso.

In alto nella dashboard c'è anche il pulsante **❓ domande ON/OFF** (accanto a *subagent*),
con il comando **`/ask on|off|status`**: è un interruttore a caldo, come quello del browser, e la
scelta è **persistita** in `media/ask-prefs.json` (quindi sopravvive ai riavvii). Spegnendolo il tool
viene **rimosso** dalla lista inviata al modello (meno contesto, nessuna domanda che nessuno
risponderebbe) e le eventuali domande in attesa vengono chiuse con esito esplicito.
API: `POST /api/ask { enabled: true|false }`.

> ℹ️ **Anche l'harness da terminale ha il tool** (`node harness.mjs`): la domanda appare con le
> opzioni numerate e si risponde con il numero, con un'etichetta, con un testo libero o con invio
> (salta). Senza terminale interattivo (stdin non TTY) risponde da sé «salta», così il turno non
> resta mai appeso a un umano che non c'è.
>
> ⚠️ **Estensioni inline: caricarle dal `DefaultResourceLoader`, non da `createAgentSession`.**
> Passare `extensionFactories` direttamente a `createAgentSession` viene **ignorato in silenzio**:
> il tool non compare e sembra che il modello «non voglia» usarlo (verificato: il modello rispondeva
> «non ho quel tool»). Vale per entrambe le interfacce.

API: `GET /api/ask` (pendenti + esiti), `POST /api/ask/respond` `{ id, action:"accept"\|"decline"\|"cancel", answers? }`.
Eventi SSE: `ask_request`, `ask_resolved` — con lo stesso id del `toolCallId`, quindi la card si
aggancia al punto giusto del messaggio. Nei broadcast leggeri lo stato porta solo le domande
pendenti: gli esiti ci sono solo quando si chiede anche la conversazione (stessa lezione del payload
da 1,3 MB).

### Decisore tipizzato locale — feature «rizzo» (Rizzo Flow)

Nel menu **features** c'è un interruttore **rizzo**: accende un **decisore locale**
([Rizzo Flow](https://github.com/Rizzo-AI-Academy/rizzo-flow), Spark-X2.5-4B su llama.cpp,
**CPU**) che risponde a domande tipizzate — sì/no, scelta fra opzioni, punteggio su una rubrica —
con una **distribuzione di probabilità**, senza generare un solo token. È lo stesso modello di
programmazione di una System One API (wire `noul`/`choice`/`score`), servito in locale.

| | Spento (predefinito) | Acceso |
|---|---|---|
| Processo | nessuno | `rizzo serve --device cpu`, porta 8017 |
| RAM | 0 | **~5,7 GB** residenti |
| Tool per l'agente | `rizzo_decide` e `rizzo_service` **rimossi** dalla lista | presenti |
| Costo di una richiesta | — | **~12 s** su stato breve, ~4 min su ~5.000 token |
| Skill `rizzo-flow` | leggibile, ma dichiara che i tool non ci sono | attiva |

Misure reali su questa VPS (6 vCPU Broadwell, 4b Q4_K_M, 6 thread): avvio e caricamento **~20 s**;
una decisione con stato breve e 3 domande **11,8–15,3 s** (prefill 5,6 s, 311 token); uno stato da
4.923 token **236,8 s** (di cui 228 s di prefill, ~21 token/s); accuratezza **0,90** sulla fixture
`smoke-v1` (20 decisioni categoriche).

**Chi accende cosa.** Nessuno accende la feature da solo: l'utente lo fa dal menu features, oppure
l'agente lo *propone* con `ask_user` (una riga sul costo in RAM) e lo accende **solo** con il
consenso. A fine lavoro l'agente è istruito a spegnerlo (`rizzo_service action="stop"`) se non
serve più. La preferenza è persistita in `media/rizzo-prefs.json`: se il servizio era acceso,
torna acceso al riavvio della dashboard (che lo riavvia in background).

**API.** `GET /api/rizzo` (stato completo: preferenza, processo, modello, RAM, coda del log,
`toolsActive`), `POST /api/rizzo` (`{ enabled }`, `{ action: "start"|"stop" }` o una configurazione
`{ port, size, quant, weights, threads }`), `POST /api/rizzo/decide` (prova autenticata: `{ state,
questions }` → risposta del decisore). La risposta di `POST /api/rizzo` arriva **subito** (202) se
il modello sta ancora caricando: lo stato definitivo si legge da `GET /api/rizzo` o dallo stream
SSE, che la UI segue da sola.

**Variabili.** `DASH_RIZZO=off` toglie la feature (nessun tool, nessun processo: è la forma giusta
per i test automatici e le istanze di servizio); `DASH_RIZZO_DIR` (default `/root/rizzo-flow`),
`DASH_RIZZO_PORT` (default 8017), `DASH_RIZZO_READY_MS`.

**Test.** `node media/test-rizzo.mjs` (ciclo completo: accensione, readiness, decisione vera,
spegnimento, nessun processo orfano — su porta 8019 e stato in `/tmp`, non tocca la produzione) e
`node media/test-rizzo-ui.mjs` (rendering della riga nel menu features, nei cinque stati possibili).

### Comandi slash (`/`)
Nella casella di scrittura, digitando **`/`** compare una **palette** con i comandi: si filtra
scrivendo, si scorre con **↑/↓**, si completa con **Tab**, si esegue con **Invio**, si chiude con
**Esc**. I comandi **non vengono inviati al modello**: agiscono sull'harness (o sull'interfaccia),
esattamente come i comandi della TUI di pi. L'esito compare in chat come riga `$ /comando`.

Il catalogo arriva dal server (`GET /api/commands`), quindi i valori proposti sono quelli veri
in quel momento: livelli di thinking supportati dal modello attivo, modelli utilizzabili, goal e
pianificazioni esistenti.

| Comando | Effetto |
|---------|---------|
| `/help [comando]` | elenco dei comandi o dettaglio di uno |
| `/status` | modello, thinking, contesto, token, costo, sessione |
| `/model [id]` | mostra i modelli usabili o cambia modello |
| `/think <livello\|next>` | mostra o cambia il livello di thinking |
| `/subagents <on\|off>`, `/subagents-max <n>` | interruttore e limite dei subagent |
| `/browser <on\|off\|status>` | interruttore del tool browser (naviga siti reali) |
| `/ask <on\|off\|status>` | interruttore delle domande all'utente (tool `ask_user`) |
| `/stop` | interrompe la risposta in corso |
| `/new [titolo]`, `/rename <nome>` | nuova chat, rinomina la chat attiva |
| `/sessions`, `/export` | apre l'elenco delle chat, scarica il Markdown |
| `/compact [istruzioni]` | compatta il contesto |
| `/goals`, `/goal <testo>`, `/goal-run <id>`, `/goal-done <id>` | gestione dei goal |
| `/crons`, `/cron "<expr>" <nome> <prompt>`, `/cron-run <id>`, `/cron-toggle <id>`, `/cron-del <id>` | pianificazioni cron |
| `/tab <chat\|files\|goals\|cron\|skills\|progetto\|agenda\|live>`, `/files [percorso]`, `/clear` | interfaccia |

Gli id si possono abbreviare: basta un prefisso non ambiguo (es. `/goal-done 7419`).
I comandi sono **deliberatamente senza effetti distruttivi**: niente shell arbitraria, niente
riavvio del servizio. La definizione sta in `media/commands.mjs` (un solo posto per server e
browser) e l'esecuzione in `dashboard.mjs` (`POST /api/command`).

### Skill (Agent Skills — Claude Code e OpenAI/Codex)
La dashboard permette di **creare, caricare e usare** skill nel formato aperto **Agent Skills**
(`agentskills.io`): lo stesso standard adottato da Claude Code e OpenAI/Codex. Una skill è una
cartella con un file `SKILL.md` che ha frontmatter YAML con **`name`** e **`description`**
(entrambi obbligatori) seguito dalle istruzioni in Markdown.

- le skill vivono in **`skills/`** (fuori da `media/`): ogni skill è `skills/<nome>/SKILL.md` (oppure un
  file `.md` “piatto” direttamente in `skills/`); i backup stanno in `backups/`;
- all'avvio vengono **caricate nel system prompt** (progressive disclosure: il modello vede nome,
  descrizione e percorso, e legge il file con `read` solo quando il compito corrisponde);
- si possono invocare esplicitamente da chat con **`/skill:nome [istruzioni]`** (il comando nativo
  di pi espande il contenuto della skill) — la palette slash lascia passare `/skill:` senza
  interferire;
- nella vista **🧩 skill** (menu *features*) puoi creare (nome + descrizione + istruzioni),
  **caricare un `.md`** o un **archivio `.zip` con la skill completa** (SKILL.md più `references/`,
  `scripts/`, esempi — il formato in cui vengono distribuite le skill), aprire il `SKILL.md`
  nell'editor e eliminarlo. Le modifiche fatte da lì (o salvando il `SKILL.md` dall'editor file)
  rendono la skill **attiva subito**: la dashboard ricarica la lista e ricostruisce il system
  prompt della sessione senza cambiare chat (`session.reload()`);
- le skill cambiate **fuori** dalla dashboard (shell, `git`, `cp`, un'altra sessione) vengono
  rilevate da un **watcher su `skills/`**: la lista e il system prompt si aggiornano da soli entro
  circa un secondo (debounce 700 ms, regolabile con `DASH_SKILLS_WATCH_MS`), senza riavviare il
  servizio. La ricarica **non parte mai a metà di una risposta**: se l'agente sta lavorando viene
  applicata alla fine del turno, perché `resourceLoader.reload()` azzera la cache delle estensioni
  e invaliderebbe i tool della sessione viva. Come rete di sicurezza c'è anche un **controllo
  periodico** (ogni 60 s, `DASH_SKILLS_POLL_MS`, `0` per spegnerlo) che confronta una firma della
  cartella — percorsi, mtime, dimensioni — e ricarica se trova differenze: copre i casi in cui
  `fs.watch` perde un evento (filesystem di rete, coda degli eventi in overflow);
- per riavviare la dashboard **da dentro** un turno dell'agente c'è **`scripts/restart-dashboard.sh`**:
  `--fra 120` pianifica il riavvio fra due minuti, `--stato` verifica soltanto che il servizio
  risponda, `--log FILE` raccoglie l'esito. Il riavvio viene delegato a un'unità transitoria di
  systemd (`systemd-run`), perché il processo dell'agente vive nel cgroup del servizio e un
  `systemctl restart` diretto ucciderebbe anche chi l'ha chiesto, lasciando l'esito a metà;
- **import da `.zip`** (`media/unzip.mjs`, nessuna dipendenza esterna): estrae la cartella,
  toglie l'eventuale cartella radice unica, richiede `SKILL.md` e **sanifica ogni percorso**
  (rifiuta `..`, percorsi assoluti, `.git`, strutture troppo profonde), con limiti su dimensione
  (8 MB), dimensione singola (3 MB) e numero di file (300). Il **frontmatter viene reso
  tollerante**: una `description` non quotata che contiene `: ` viene quotata d'ufficio, perché
  altrimenti il YAML sarebbe invalido e la skill non si caricherebbe (guasto silenzioso);
- il formato è tollerante: accetta anche frontmatter con `title`/`summary` (varianti OpenAI) e,
  in assenza di `description`, usa la prima riga del corpo.

Comandi: **`/skills`** apre la vista; **`/tab skills`** idem. I nomi skill devono essere
minuscoli, numeri e trattini (max 64 caratteri); la descrizione max 1024 caratteri.

### Rappresentazioni visive (SVG scritto come testo)

Il modello scrive i disegni **come testo** (non serve alcun servizio di generazione immagini):
diagrammi di flusso, timeline, mappe concettuali, schemi illustrati, piantine e piccole
illustrazioni geometriche. La dashboard riconosce il blocco e mostra il **disegno** dove il
modello l'ha messo, al posto del codice.

- **skill `visual-representation`** (`skills/visual-representation/SKILL.md`): è il contratto che
  il modello legge — quando disegnare e quando no, quali forme usare, igiene del codice, paletta,
  onestà del disegno (niente dati/proporzioni inventati; se lo schema non è in scala si dichiara)
  e tre esempi pronti (flusso, timeline, illustrazione geometrica). Gli esempi della skill sono
  **verificati dai test**: devono passare il sanitizzatore, altrimenti la skill insegnerebbe a
  produrre disegni che la chat non può mostrare.
- **contratto del blocco**:

  ```svg
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
    <title>…</title><desc>…</desc>
    <!-- forme, gruppi, testo, gradienti -->
  </svg>
  ```

  documento completo (radice `<svg>`, namespace, `viewBox`), autonomo: niente script, risorse
  esterne, immagini incorporate o dipendenze.
- **cosa fa l'anteprima**: si adatta alla larghezza della chat mantenendo le proporzioni, ha
  un'altezza contenuta (`min(58vh, 520px)`), si apre a schermo intero (⤢ ingrandisci, chiusura
  con Esc o clic sullo sfondo) e offre **‹› mostra codice**, **⧉ copia SVG** e **⬇ scarica SVG**
  (il nome del file viene dal `<title>`). Più disegni nello stesso messaggio sono indipendenti.
- **streaming**: il disegno compare solo quando il blocco è **completo** (fence di chiusura
  arrivata); fino a quel momento resta testo. Un blocco mai chiuso, un SVG invalido o un documento
  rifiutato non interrompono la chat: si mostra il codice come testo con il motivo dell'errore.
  La comparsa dell'anteprima **non dipende da come il modello spezza i delta**: anche arrivando un
  carattere per carattere (fence e linguaggio spezzati in mezzo, es. «``» + «`svg») l'anteprima
  compare appena il blocco si chiude, senza ricaricare la pagina (difetto corretto: il cursore di
  scansione saltava oltre i backtick già letti, quindi il blocco restava codice fino al refresh).
- **sicurezza**: l'SVG del modello è **contenuto non attendibile**. Il documento passa da
  `media/svg-sanitize.mjs` (tokenizzatore XML rigoroso, whitelist di elementi/attributi, limiti di
  byte/elementi/profondità/attributi/testo; niente `script`, attributi evento, `foreignObject`,
  `style`/`<style>`, `<image>`, `<use>`, `<marker>`, filtri, animazioni, `href`, DTD/entità,
  riferimenti di rete — i `url(#id)` sono ammessi solo verso gradienti/`clipPath` locali). Il
  risultato, dopo un controllo di benformatezza con `DOMParser`, diventa un **Blob URL mostrato in
  un elemento `<img>`**: mai `innerHTML`, mai SVG nel DOM. Un SVG caricato come immagine non
  esegue script e non scarica risorse esterne: è la seconda barriera, non l'unica. I Blob URL
  vengono **revocati** quando il messaggio viene ridisegnato (e i vecchi non sono più raggiungibili).
  Il modulo è servito al browser dalla rotta `/svg-sanitize.mjs` (un solo file, `nosniff`,
  `no-store`): anteprima e server usano lo **stesso** codice, senza duplicazioni.
- **non-regressione**: gli altri blocchi di codice restano identici (anche la sequenza ```` ```svg ````
  citata dentro un blocco `js` non viene scambiata per un disegno) e i messaggi senza disegni si
  comportano esattamente come prima.

Test: `node media/test-svg-sanitize.mjs` (77 casi: whitelist, XSS, entità, limiti, idempotenza,
esempi della skill) e `node media/test-svg-preview.mjs` (45 verifiche nel browser vero: anteprima
rasterizzata, script bloccati, Blob URL revocati, streaming incompleto, streaming a un carattere
per volta, vista ingrandita, schermo piccolo 390 px). `node media/test-svg-stream.mjs` verifica
senza browser la scansione dei blocchi durante lo streaming (fence spezzate, chiusura con più
backtick, blocco mai chiuso, più disegni di fila) estraendo le funzioni dal codice della dashboard.

Dimostrazione con il modello vero: `node media/svg-demo-eclissi.mjs` manda a un'istanza di prova la
richiesta «Spiegami un'eclissi di Sole con uno schema SVG etichettato in italiano, indicando che
dimensioni e distanze non sono in scala», verifica il blocco prodotto (contratto + sanitizzatore) e
salva disegno e log in `media/eclissi-sole.svg` e `media/eclissi-sole-demo.md`.
`media/svg-demo-produzione.mjs` fa lo stesso sull'istanza di servizio: attende che la chat sia ferma,
riavvia il servizio, manda la richiesta **nella chat reale** e verifica in un browser headless che
l'anteprima sia disegnata davvero (log in `media/svg-demo-produzione.log`); va lanciato come unità
transitoria (`systemd-run --unit=svg-demo --collect …`), perché riavvia il servizio che lo ospita.

### Ricerca
- **nelle chat**: campo di ricerca nel drawer (☰). Scansiona i JSONL in `sessions/` e mostra
  per ogni chat i riscontri con lo **snippet evidenziato**; da lì si apre la chat o si scarica
  direttamente il Markdown.
- **nei file**: pulsante **🔍 cerca** nel tab File. Cerca nel *contenuto* dei file sotto la root,
  saltando `node_modules`, `.git`, binari e file oltre 2 MB. Ogni risultato mostra percorso e
  **riga**; un clic apre il file nell'editor con il cursore (e la vista) sulla riga trovata.
  Limiti: 200 risultati, 4000 file scansionati, 8 s di tempo massimo (indicato come «troncato»).

### Export e copia
- **⬇ md** in alto nel drawer: scarica la chat attiva in **Markdown**
  (intestazioni utente/assistant, elenco dei tool usati, errori, allegati).
- lo stesso pulsante su ogni risultato di ricerca delle chat.
- API: `GET /api/sessions/export?id=` (senza `id` esporta la chat attiva).

### Storico prompt e snippet
- pulsante **🕘** accanto all'input: apre il pannello con i **prompt recenti** (ultimi 50) e gli
  **snippet** salvati. Un clic rimette il testo nell'input.
- **frecce ↑/↓** nell'input (quando il testo è su una riga) scorrono lo storico.
- **★ snippet** salva il testo scritto come snippet riutilizzabile (con etichetta).
- tutto in `localStorage` del browser (`pi.promptHistory`, `pi.promptSnippets`).

### PWA e notifiche
- installabile su mobile (manifest + service worker + icone generate in `assets/`).
  Il service worker mette in cache **solo** icone/manifest (e l'ultima pagina come paracadute
  offline): API e stream SSE non passano mai dalla cache.
- pulsante **notifiche** in fondo al drawer: quando la risposta finisce e la scheda non è in
  primo piano arriva una notifica di sistema con l'inizio della risposta; un clic riporta alla
  dashboard. Il permesso viene chiesto al primo invio (un gesto utente), non a sorpresa.
- icone rigenerabili con `node media/make-icons.mjs` (nessuna dipendenza: PNG scritti a mano).

### Gestione chat (pulsante ☰)

Apre un pannello laterale (drawer) con **tutte le chat salvate**:

- **＋ Nuova chat** → inizia una conversazione da zero
- **tocca una chat** → la riapre con tutta la cronologia
- **✎ rinomina** / **🗑 elimina** per ogni chat
- la chat **attiva** è evidenziata (● attiva)
- le chat **vuote** non vengono mostrate

Le chat sono **persistenti** in `/root/pi-harness/sessions/` (JSONL, formato nativo di pi).
All'avvio la dashboard **riprende l'ultima chat**; il drawer funziona da desktop e mobile
(si chiude con la ✕, col tasto Esc, o toccando fuori).

API: `GET /api/sessions`, `POST /api/sessions/new`, `POST /api/sessions/open {id}`,
`POST /api/sessions/rename {name}`, `POST /api/sessions/delete {id}`,
`GET /api/sessions/search?q=`, `GET /api/sessions/export?id=`.

### Cartella `media` (file generati)

Tutti i file **generati** dall'agente finiscono in **`/root/pi-harness/media/`**
(configurabile con `DASH_MEDIA_DIR`).

Meccanismi:
1. **Istruzione nel system prompt** → l'agente salva lì i suoi output.
2. **Hook `tool_call`** (estensione inline `media-guard`) che riscrive gli argomenti
   **prima dell'esecuzione**:
   - tool `write` verso un file **nuovo** fuori da `media` → reindirizzato in `media`
   - `bash` con `> /path` o `>> /path` verso un file **nuovo** fuori da `media` → reindirizzato
   - i file **esistenti** non vengono toccati (le modifiche restano dove sono)
3. Gli **allegati** della chat vanno in `media/uploads/`.

Nel file manager c'è il pulsante **📁 media** per aprire la cartella al volo.

> Copertura: il redirect copre `write` e i reindirizzamenti assoluti in `bash`.
> Non copre percorsi **relativi**, variabili (`$VAR`), o altri comandi (`cp`, `mv`, `dd`).
> In quei casi vale l'istruzione nel system prompt.

### File manager (tab 📁 File)
- **sfoglia** le cartelle con breadcrumb
- **apri e modifica** file di testo, **salva**
- **crea** file e cartelle, **rinomina**, **cancella** — rinominare su un nome che esiste già
  **chiede conferma**: l'API risponde `409` e la sovrascrittura avviene solo con `overwrite: true`
- **carica** (upload) e **scarica** (download) file
- si **aggiorna** automaticamente quando l'agente modifica file

Tutto è confinato nella **root** (`--root` o `$DASH_ROOT`, default: cwd).
Protezione contro `..` e symlink che escono dalla root — anche nello **zip di una cartella**:
 i link simbolici non vengono seguiti (prima un link verso l'esterno faceva finire nell'archivio
 file fuori dalla root, o faceva sfondare il tetto dei 3000 file su una cartella normale).

### API
| Metodo | Endpoint | Descrizione |
|--------|----------|-------------|
| GET | `/api/health` | versione, **impronta del file di codice in esecuzione** (`codeHash`, `codeMtime`: è ciò che dice se il processo ha davvero il codice nuovo), pid, funzioni dichiarate (utile per verificare un deploy) |
| GET | `/api/state` | stato completo (modello, thinking, contesto, token, costo, git, subagent, browser, auth) |
| GET | `/events` | stream SSE (testo, thinking, tool, stato, goal, pianificazioni, browser live) |
| POST | `/api/prompt` | `{ text, attachments?, clientContext? }` — `clientContext` viene accodato come `[contesto dashboard]` |
| POST | `/api/abort` | interrompe la generazione in corso |
| POST | `/api/messages/edit` | `{ text, attachments? }` riscrive l'ultimo messaggio utente |
| POST | `/api/messages/regenerate` | rifà l'ultima risposta |
| POST | `/api/compact` | `{ instructions? }` compatta il contesto |
| GET | `/api/ask` | domande all'utente pendenti + ultimi esiti (per ricostruire le card); `?` niente, gli esiti ci sono sempre |
| POST | `/api/ask/respond` | `{ id, action: "accept"\|"decline"\|"cancel", answers? }` risponde a una domanda pendente (`id` = toolCallId): risveglia il tool in attesa |
| POST | `/api/ask` | `{ enabled: true\|false }` interruttore delle domande all'utente (persistito) |
| POST | `/api/thinking` | `{ level }` |
| POST | `/api/model` | `{ id }` |
| POST | `/api/subagents` | `{ enabled?, maxSpawns? }` interruttore dei subagent |
| GET | `/api/rizzo` | stato del decisore locale: preferenza, processo, modello, RAM, `toolsActive` |
| POST | `/api/rizzo` | `{ enabled: true\|false }` accende/spegne il decisore; `{ action: "start"\|"stop" }`; `{ port, size, quant, weights, threads }` cambia variante (riavvia se acceso) |
| POST | `/api/rizzo/decide` | `{ state, questions }` → decisioni con probabilità dal decisore locale (503 se è spento) |
| GET/POST | `/api/goals` | elenco / crea-aggiorna un goal |
| POST | `/api/goals/delete` | `{ id }` |
| POST | `/api/goals/execute` | avvia l'esecuzione della catena di passaggi di un goal |
| GET/POST | `/api/schedules` | elenco / crea-aggiorna una pianificazione cron |
| POST | `/api/schedules/validate` | valida un'espressione cron e calcola la prossima esecuzione |
| POST | `/api/schedules/run` | `{ id }` esegue subito una pianificazione |
| POST | `/api/schedules/toggle` | `{ id }` attiva/disattiva |
| POST | `/api/schedules/delete` | `{ id }` |
| GET | `/api/schedules/log?id=` | ultime righe del log di una pianificazione |
| GET | `/api/sessions` | elenco chat |
| POST | `/api/sessions/new` | nuova chat |
| POST | `/api/sessions/open` | `{ id }` apre una chat |
| POST | `/api/sessions/rename` | `{ name }` rinomina |
| POST | `/api/sessions/delete` | `{ id }` elimina |
| GET | `/api/sessions/search?q=` | cerca nelle chat salvate |
| GET | `/api/sessions/export?id=` | esporta la chat in Markdown |
| GET | `/api/commands?q=` | catalogo dei comandi slash (nomi, parametri, valori ammessi) |
| POST | `/api/command` | `{ line: "/think high" }` esegue un comando sull'harness |
| GET | `/api/skills` | elenco skill caricate (nome, descrizione, percorso, diagnostica) |
| POST | `/api/skills` | `{ name, description, content }` crea/aggiorna una skill |
| POST | `/api/skills/upload?name=` | carica un file `.md` (body raw, max 1 MB) |
| POST | `/api/skills/upload-zip?name=` | importa una **skill completa** da `.zip` (body raw binario, max 8 MB): estrae SKILL.md più file di supporto, con percorsi sanificati |
| POST | `/api/skills/delete` | `{ name }` elimina una skill |
| GET | `/api/files?path=` | elenca cartella |
| GET | `/api/file?path=` | leggi file |
| POST | `/api/file` | `{ path, content }` scrivi file |
| POST | `/api/file/mkdir` | `{ path }` crea cartella |
| POST | `/api/file/rename` | `{ from, to }` rinomina |
| POST | `/api/file/delete` | `{ path }` elimina |
| GET | `/api/download?path=` | scarica il file; se il percorso è una **cartella** risponde con un `.zip` costruito al volo (limiti: 3000 file, 128 MB; i link simbolici sono **saltati**) |
| POST | `/api/resolve-files` | `{ paths: [...] }` risolve i percorsi citati (assoluti, relativi alla cartella di lavoro o a `media/`) nel file/cartella reale sotto la root: è ciò che alimenta le card «scarica» in chat |
| POST | `/api/upload?dir=&name=` | carica file (body raw) |
| POST | `/api/chat/upload` | allegati della chat |
| GET | `/api/search/files?q=&path=` | cerca nel contenuto dei file |
| GET | `/api/browser/live` | stato della live view (porta, URL, frame, viewport, controllo) |
| GET | `/api/browser/live/frame` | ultimo frame disponibile (204 se assente: evita una vista vuota su pagina ferma) |
| POST | `/api/browser/watch` | `{ on }` apre/chiude il flusso dei frame |
| POST | `/api/browser/input` | `{ type: input_mouse\|input_keyboard\|input_touch, … }` input remoti (solo se il controllo è dell'utente) |
| POST | `/api/browser/press` | `{ keys: "Control+a" \| "Backspace" \| "ArrowLeft" … }` tasti e scorciatoie (whitelist rigida): lo stream accetta solo `key`+`text`, quindi i tasti speciali passano dalla CLI |
| POST | `/api/browser/control` | `{ mode: "agent"\|"human" }` lock anti-conflitto (in modalità human il frame rate sale a 10/s) |
| POST | `/api/browser/reload` | ricarica la pagina attiva: i frame arrivano solo ai cambi, così una pagina ferma non sembra bloccata |
| POST | `/api/browser/open` | `{ url }` naviga a un URL (barra indirizzi della live view); accetta solo http/https |
| POST | `/api/browser` | `{ mode: auto\|on\|off, idleMinutes? }` accensione del tool (persistita); `enabled` accettato per compatibilità |
| GET | `/manifest.webmanifest`, `/sw.js`, `/icon-*.png` | asset PWA (pubblici solo dopo l'accesso) |
| GET | `/login` | pagina di accesso (modulo utente/password) — pubblica |
| POST | `/login` | verifica le credenziali e imposta il cookie di sessione firmato |
| GET | `/logout` | cancella il cookie di sessione e riporta al modulo |

### Sicurezza
- **HTTPS** grazie a Caddy (certificato Let's Encrypt, rinnovo automatico): credenziali e
  contenuti viaggiano cifrati. La dashboard ascolta **solo su 127.0.0.1** (`DASH_HOST`), quindi
  non è raggiungibile direttamente da internet: l'unica porta aperta è quella di Caddy.
- accesso in **due modi**, accettati su tutte le rotte (asset PWA inclusi):
  1. **pagina di login** (`/login`) servita dall'app + **cookie di sessione firmato** con HMAC
     (HttpOnly, SameSite=Lax, `Secure` quando arriva da HTTPS; durata `DASH_SESSION_TTL_MS`,
     default **30 giorni**). Il segreto sta in `.session-secret` (0600, generato al primo avvio);
     cancellando quel file si invalidano tutte le sessioni attive;
  2. **HTTP Basic** (utente/password in `.env`, confronto a tempo costante): resta per script,
     curl e client API, che mandano l'header `Authorization`.
  La pagina di login esiste perché il riquadro nativo di Basic Auth **non è affidabile**: non
  compare per le richieste del JavaScript della pagina, in un'app installata in modalità
  standalone, e il browser smette di riproporlo dopo qualche «annulla» — lasciando l'utente su
  una riga di testo senza alcun campo da compilare. Con la sessione via cookie il modulo c'è
  sempre, anche su PWA/iOS, e le risposte d'errore sono leggibili (le API rispondono JSON, la
  dashboard mostra una barra con il link al modulo).
- **anti brute-force progressivo**: dopo `DASH_AUTH_MAX_FAILS` (default **8**) tentativi falliti
  lo stesso IP riceve **429 + `Retry-After`** e l'attesa **cresce a ogni blocco**:
  `DASH_AUTH_BACKOFF` (default `15,30,60,120,300,600,900` secondi, l'ultimo è il tetto
  `DASH_AUTH_BLOCK_MS`). Contano **solo** i tentativi che presentano davvero delle credenziali:
  le richieste senza credenziali (un caricamento della pagina vale documento + asset PWA +
  una fetch) non sono tentativi e non bloccano nessuno. Un accesso riuscito azzera contatore e
  scalino; lo scalino si dimentica dopo `DASH_AUTH_FORGET_MS` (default **30 min**) di quiete.
  L'IP viene letto da `X-Forwarded-For` (fidato perché l'app è irraggiungibile se non tramite
  il proxy) e lo stato è visibile in `/api/state → auth` (`backoffSec`, `blockedIps`, …).
- **CSRF**: le scritture con cookie sono accettate solo se l'`Origin` dichiarata è la nostra;
  il cookie è `SameSite=Lax` e `HttpOnly`.
- path confinati nella **root**, blocco di `..` e dei symlink che ne escono.
- la ricerca file salta i binari, i file oltre 2 MB e le cartelle pesanti (`node_modules`, `.git`).
- per lavoro locale puoi sempre usare il tunnel SSH:
  ```bash
  ssh -N -L 8420:127.0.0.1:8420 root@<vps>
  ```
- ⚠️ resta il rischio intrinseco: l'agente ha `bash` e accesso ai file **della root**
  (`DASH_ROOT=/root` → di fatto tutto l'host). Tienilo a mente per il contenuto dei prompt.

### Backup automatico

`backup.mjs` archivia `sessions/` e `media/` in `backups/` (tar.gz verificato) con retention.

```bash
node backup.mjs                 # crea l'archivio e applica la retention
node backup.mjs --dry-run       # mostra cosa farebbe
systemctl start pi-backup.service
journalctl -u pi-backup.service -n 20
systemctl list-timers pi-backup.timer
```

- **timer systemd** `pi-backup.timer`: ogni giorno alle **04:15** (`Persistent=true`, quindi
  recupera anche se la macchina era spenta), ritardo casuale fino a 10 minuti.
- **retention**: `DASH_BACKUP_KEEP_DAYS` (default **14** giorni) con minimo
  `DASH_BACKUP_KEEP_MIN` (default **5**) archivi sempre conservati.
- ogni archivio viene **verificato** (`tar -tzf`) prima di considerarlo buono; se il backup
  fallisce, i file parziali (< 1 KB) vengono rimossi.
- contenuto: `sessions` e `media` con percorsi relativi, quindi ripristinabile con
  `tar -xzf backups/pi-harness-<data>.tar.gz -C /root/pi-harness`.
- backup su un altro disco: `DASH_BACKUP_MIRROR=/mnt/backup node backup.mjs`.

### Servizio systemd
```bash
systemctl status pi-dashboard
journalctl -u pi-dashboard -f
systemctl restart pi-dashboard
```
Config in `/root/pi-harness/.env` (`DASH_USER`, `DASH_PASSWORD`, `DASH_ROOT`, `DASH_HOST`) e per
l'accesso: `DASH_AUTH_MAX_FAILS`, `DASH_AUTH_BACKOFF` (scala delle attese, es. `"15,30,60,120,300,600,900"`),
`DASH_AUTH_BLOCK_MS` (tetto di una singola attesa), `DASH_AUTH_WINDOW_MS`, `DASH_AUTH_FORGET_MS`,
`DASH_SESSION_TTL_MS`, `DASH_SESSION_SECRET_FILE`.

Utente/password si cambiano in `.env` e con `systemctl restart pi-dashboard`: le sessioni già
attive restano valide (il segreto non cambia); per buttarle fuori tutte basta cancellare
`.session-secret` prima del riavvio.

### Test

```bash
node media/test-svg-sanitize.mjs # sanitizzatore SVG: whitelist, XSS, entità, limiti, esempi della skill — nessuna rete
node media/test-svg-preview.mjs  # anteprima SVG in chat nel browser vero: rendering, sicurezza, streaming, vista ingrandita
node media/test-svg-stream.mjs   # scansione dei blocchi svg durante lo streaming (fence spezzate) — nessuna rete
node media/test-static.mjs       # coerenza HTML/server (id, endpoint, cablaggio) — nessuna rete
node media/test-ui.mjs           # logica frontend in node:vm (storico, notifiche, form cron, …)
node media/test-palette.mjs      # comandi slash: filtro, completamento, esecuzione (istanza su :8499)
node media/test-stream-resilience.mjs           # la connessione SSE cade a metà risposta (senza browser né rete)
node media/test-stream-replay.mjs               # replay degli eventi (id: + Last-Event-ID) su un'istanza di prova
node media/test-stream-reconnect-live.mjs       # richiede il modello: caduta a metà risposta, replay + snapshot
node media/test-stream-tools-browser.mjs        # richiede il modello: turno con tool, card nel messaggio e snapshot a segmenti
node media/test-ask.mjs                         # domande all'utente: stati, timeout, validazione, segreti (nessuna rete)
node media/test-rizzo.mjs                       # decisore locale: accensione, readiness, decisione vera, spegnimento, RAM liberata (~90 s, porta 8019)
node media/test-rizzo-ui.mjs                    # interruttore «rizzo» nel menu features: LED, etichette, stati, pulsante disabilitato (nessuna rete)
node media/test-hardening.mjs                   # tenuta: sessione non standard senza uccidere il processo, zip senza symlink fuori root, aggiornamento parziale dei goal, rinomina senza sovrascritture, Content-Disposition, impronta di /api/health
node media/test-browser-tool-output.mjs         # screenshot/pdf del tool browser: il file arriva davvero in media/ (browser vero, ~30 s)
node media/test-ask-live.mjs                    # richiede il modello: l'agente chiede, si risponde via API, il turno riprende
node media/test-ask-browser.mjs                 # richiede il modello: card nel browser vero, reload durante l'attesa, esiti
node media/test-ask-cli.mjs                     # richiede il modello: domande nel terminale (harness.mjs, con pseudo-terminale)
bash media/test-api.sh           # avvia un'istanza di prova su :8430: login/cookie, backoff progressivo, PWA, ricerca, export
bash media/test-chat.sh          # richiede il modello: stop, modifica, rigenera, ricerca, export
bash media/test-api.sh stop      # ferma l'istanza di prova
```

I test girano su un'istanza separata (`DASH_SESSION_DIR=/tmp/pi-test/sessions`,
`DASH_SESSION_SECRET_FILE=/tmp/pi-test/.session-secret`, `DASH_AUTH_BACKOFF="3,6,12"`) per **non
toccare le chat reali**: non serve fermare il servizio in produzione.

## Tool `browser` (navigazione di siti reali)

Un tool **`browser`** permette all'agente di pilotare un Chrome headless reale: aprire pagine,
leggere il contenuto, cliccare, compilare moduli, fare screenshot o PDF.

Implementazione: `media/browser-tool.mjs` (estensione inline, definita **fuori** dal monolite e
registrata in `extensionFactories` accanto a `media-guard`). Usa
[`agent-browser`](https://github.com/vercel-labs/agent-browser) (CLI Rust su Chrome DevTools
Protocol, snapshot dell'albero di accessibilità con ref `@eN`).

**È gestito da una preferenza persistita** (`media/browser-prefs.json`), con tre modi:

| modo | comportamento |
|------|---------------|
| **`auto`** (default) | acceso **quando serve**: live view aperta, controllo passato all'utente, o browser usato negli ultimi N minuti (default 20). Altrimenti spento, così non consuma contesto. |
| `on` | sempre acceso (scelta esplicita, **sopravvive ai riavvii**) |
| `off` | sempre spento |

Si comanda con `/browser auto|on|off|status` o `POST /api/browser {"mode":"auto"}`.
Prima tornava sempre OFF a ogni riavvio e andava riacceso a mano.

> ⚠️ **Nota tecnica importante sul gate dei tool.** L'accensione/spegnimento passa da
> `session.setActiveToolsByName()`, che lavora sul **registry** di pi e ricostruisce il system
> prompt. Scrivere direttamente `session.agent.state.tools` (come si faceva prima) **non cambia
> ciò che il modello riceve**: quella è solo la vista che si legge da `/api/state`, quindi il gate
> sembrava funzionare mentre il tool restava disponibile. La verifica corretta si fa
> sull'evento `before_provider_request` (i tool davvero inviati al provider), non chiedendo
> al modello di elencarli: il modello può ripetere una lista vecchia.

**È spento di default in modo `auto`**: quando nessuna condizione lo richiede, i tool vengono
**rimossi** dalla lista inviata al modello.

### Vincoli di sicurezza (verificati, non dichiarati)

| Vincolo | Come è garantito |
|---------|------------------|
| Mai come root | invoca **sempre** `sudo -n -u pi-browser -H agent-browser` |
| Sandbox adeguata | verifica `chrome://sandbox` prima di operare e **rifiuta** altrimenti |
| Nessuna shell | `execFileSync` con array di argomenti (niente `sh -c`) |
| Ref e URL validati | regex sui ref, solo `http`/`https` sugli URL |
| Output confinati | `screenshot`/`pdf` finiscono in `media/` — la CLI scrive in una cartella di transito dell'utente dedicato (`/tmp/pi-browser-out/pi-browser`) e la dashboard, che è root, sposta il file in `media/` (l'utente dedicato non può scrivere lì) |
| Niente processi appesi | timeout per comando, `close --all`, il check sandbox chiude il browser di servizio |

> ⚠️ **Perché non si può girare come root**: come root la CLI parte e funziona *senza errori* ma con
> la sandbox **disattivata in silenzio** (`chrome://sandbox`: layer `None`, PID/Network namespaces
> `No`, Seccomp-BPF `No`, *“You are NOT adequately sandboxed”*). Su Ubuntu 24.04 la sandbox di
> Chrome richiede un **utente non privilegiato** e il profilo AppArmor
> `/etc/apparmor.d/agent-browser-chrome` (perché `apparmor_restrict_unprivileged_userns=1`).
> Con quella configurazione il browser riporta *“You are adequately sandboxed”*.
> Dettagli e prove: `media/verifica-empirica-browser.md`.

### Uso efficace

- **I ref appartengono alla pagina corrente**: usali dall'ultimo snapshot e rifai lo snapshot dopo
  ogni navigazione. Non partono sempre da `e1` (in una sessione usata possono essere `e18`).
- **Preferisci `snapshot` a `screenshot`**: l'albero di accessibilità costa molto meno contesto.
- **Una sessione alla volta** (~1,7 GB di RAM): chiudi con `action=close` quando hai finito.
- La skill `skills/browser/SKILL.md` mappa le azioni del tool e rimanda al bundle nativo
  della CLI (`agent-browser skills get core`, sempre allineato alla versione installata).

## Viste `progetto` e `agenda`

Due viste raggiungibili dal menu *features* (o `/tab progetto`, `/tab agenda`):

- **📦 progetto** — gli **artefatti** del lavoro: i file di `media/` ordinati per data, con
  dimensione e tempo trascorso, apri nell'editor e scarica; le cartelle si aprono nel file manager.
  È la vista "i file come output principale, la chat come strumento".
- **🗓 agenda** — timeline unica di ciò che l'harness sta facendo e di ciò che aspetta da te:
  pianificazioni cron (prossima esecuzione, ultimo esito, numero di esecuzioni) e goal attivi con
  l'avanzamento di passi e controlli.

Entrambe riusano endpoint esistenti (`/api/files`, `/api/goals`, `/api/schedules`): nessun endpoint
nuovo, nessun privilegio nuovo.

## Live view del browser (vista 🖥 live)

Mostra **cosa sta facendo il browser** mentre l'agente naviga, e permette di **prendere il
controllo** per fare tu ciò che l'agente non può (2FA, CAPTCHA, un passaggio che conosci solo tu).

Come funziona: lo stream di `agent-browser` ascolta su `127.0.0.1` e accetta solo client con origin
`localhost`/`127.0.0.1`/`::1`/`file://`, quindi la dashboard fa da **ponte** — si connette lei allo
stream e ripubblica frame, URL e stato sulla sua SSE. Così la live view **eredita l'autenticazione
esistente**: nessuna porta nuova, nessuna modifica a Caddy, nessun endpoint esposto.

| Comando | Effetto |
|---------|--------|
| `▶ guarda` / `⏸ ferma` | apre/chiude il flusso dei frame (`POST /api/browser/watch`) |
| `🖐 prendi il controllo` / `↩ restituisci` | passa il browser a te (`POST /api/browser/control`) |
| click nell'immagine | inoltra il click al browser, con coordinate scalate sulla dimensione reale del frame |
| `⌨ → browser` | porta i tasti al browser invece che alla chat |
| tastiera completa | caratteri singoli dallo stream (immediato); **Backspace, Tab, frecce, Home/End, F1-F12 e le scorciatoie** (Ctrl+A/C/V/Z…) passano dalla CLI, perché lo stream accetta solo `key`+`text` e senza testo il browser non riceve l'evento |
| `▴ log` | log della chat a tre stati: compatto (88px) → espanso → nascosto |
| **barra indirizzi** | scrivi un **URL** (o un dominio: `wikipedia.org`) e premi **Invio**; se non sembra un indirizzo, **cerca su Google**. Endpoint `POST /api/browser/open`, validato (solo http/https) |
| **↑ / ↓ e rotellina** | scorrono la pagina nel browser (`mouseWheel`) — i pulsanti servono su mobile, dove la rotellina non c'è |
| **chat nella vista** | dai comandi all'agente senza lasciare il browser: il messaggio parte già con il **contesto** "sto scrivendo dalla live view, pagina X, usa il tool browser su quella pagina" |

Il riquadro del browser ha **dimensione garantita**: il log ha altezza fissa e non lo comprime
mai; nascondendo il log il browser guadagna circa il 45% di altezza.

**Il lock anti-conflitto:** quando prendi il controllo, il tool `browser` **rifiuta** di agire e
spiega perché. Così agente e persona non si contendono lo stesso browser. Il controllo torna
all'agente con `↩ restituisci`.

Note operative:
- i frame arrivano **quando la pagina cambia** (delta), non a intervalli fissi: una pagina ferma
  costa quasi nulla;
- il flusso si chiude da sé quando si lascia la vista, e comunque dopo 15 minuti di inattività;
- protocollo: `pacing=ack` + `maxFps` (default 3, `DASH_BROWSER_STREAM_FPS`) per contenere la banda
  su mobile. La misura reale: ~16-39 KB per frame a 1280×720.
- l'input è ristretto a mouse/tastiera/touch: nessun comando arbitrario al browser.

API: `GET /api/browser/live`, `POST /api/browser/watch {on}`, `POST /api/browser/input {…}`,
`POST /api/browser/control {mode:"agent"|"human"}`.
Protocollo completo e prove: `media/browser-live.mjs`, `media/probe-stream.mjs`.

## Prestazioni (misurate, non stimate)

Tre interventi che hanno cambiato l'ordine di grandezza di ciò che viaggia sulla rete:

| | Prima | Dopo |
|---|---|---|
| evento SSE di stato (ogni tool call, ogni cambio) | ~1,3 MB | **1,2 KB** |
| `/api/state` all'apertura della pagina | 1,3 MB | 1,3 MB (i messaggi servono una volta sola) |
| `dashboard.html` trasferito | 218 KB | **71,6 KB** (gzip) |
| `/api/state` durante un comando browser | bloccato (fino a 60 s) | **9 ms** |

**Perché.** (1) La conversazione completa veniva inclusa in *ogni* broadcast di stato (20 punti del
codice): ora si chiede solo al caricamento iniziale (GET `/api/state` e primo evento SSE) e il
client conserva i messaggi che ha già. (2) Caddy non comprimeva: ora `encode @noStream zstd gzip`,
con **`/events` escluso** perché comprimere uno stream SSE introduce buffering e i frame della live
view arriverebbero a scatti. (3) Il tool e il bridge eseguivano la CLI con `execFileSync`, che
**blocca l'event loop** del server per tutta la durata del comando: ora è asincrono.

> ⚠️ Se si tocca l'endpoint `/api/state`, ricordare che `messages` **deve** esserci nella GET iniziale
e nel primo evento SSE (è ciò che popola la chat), ma **non** nei broadcast successivi. Il comando
`/status` e l'export markdown devono chiedere i messaggi esplicitamente
(`getState({ withMessages: true })`): è una regressione già capitata una volta.

### Touch target su mobile

Su schermo piccolo i bersagli sono portati almeno a **44px** (i tab a 56): tab, voci del menu
features, pulsante statistiche, input della chat nella vista live. Il desktop resta invariato.
Verificato con emulazione iPhone 12 (390×844) da `media/test-views.mjs`.

## Note operative sui goal (importante)

`media/goals.json` viene letto dalla dashboard **solo all'avvio**: la lista attiva vive in memoria.
Da qui un rischio reale, già capitato una volta:

- **modificare `goals.json` a mano mentre la dashboard gira disallinea memoria e file.** Al primo
  salvataggio (qualunque modifica dalla UI) la dashboard riscrive il file **dall'array in memoria**,
  cancellando ciò che era stato aggiunto a mano.
- **il modo sicuro è sempre l'API**: `GET /api/goals`, `POST /api/goals` (con `id` per aggiornare,
  senza `id` per creare), `POST /api/goals/delete`. Così memoria e file restano allineati.
- **l'aggiornamento può essere parziale**: `POST /api/goals { id, status }` cambia solo lo stato
  e lascia intatti descrizione, passi e checklist (una chiave **assente** significa «non toccare»,
  una chiave presente — anche vuota — significa «sostituisci»). Prima un payload parziale
  azzerava tutto il resto.
- **se un goal sparisce**, i backup automatici (`backups/pi-harness-<data>.tar.gz`, ogni giorno alle
  04:15) contengono `media/goals.json`: si estrae il goal con
  `tar -xzOf backups/<archivio>.tar.gz media/goals.json` e lo si ricrea via `POST /api/goals`
  (l'id cambia, i contenuti no).
- per creare un goal da script, seguire `media/create-goal-opt.mjs`: legge le credenziali da `.env`
  e usa l'API, senza toccare il file.

## Estensioni installate
| Pacchetto | Cosa aggiunge | Dove è attiva |
|-----------|---------------|---------------|
| `pi-observability` | footer live + `/obs` nella TUI | globale (settings) |
| `pi-web-access` | tool **`web_search`, `fetch_content`, `get_search_content`, `source_check`** — zero-config | globale (settings) |
| `pi-subagents` | tool **`subagent`, `bg_wait`** (delega ad agenti figli) | **solo dashboard**, con interruttore |

Oltre ai pacchetti, la dashboard registra **estensioni inline** dal codice (`extensionFactories` del
`DefaultResourceLoader`): `media/browser-tool.mjs` (tool `browser`), `media/ask-tool.mjs` (tool
`ask_user`) e `media/rizzo-tool.mjs` (tool `rizzo_decide` e `rizzo_service`, dietro l'interruttore
«rizzo»).

## Interruttore dei tool opzionali (controllo costi)

In alto nella dashboard c'è un interruttore **spento di default**:
**🤖 subagent** (con campo **max**).

| Interruttore | OFF | ON |
|--------------|-----|-----|
| 🤖 subagent | tool `subagent`/`bg_wait` rimossi → niente delega | abilita i subagent (max 3 per richiesta, regolabile 1–64) |

Al riavvio torna **OFF**. API: `POST /api/subagents`.

Nel menu **features** c'è anche l'interruttore **rizzo** (decisore tipizzato locale): a differenza
del subagent la scelta è **persistita** (`media/rizzo-prefs.json`), perché è un servizio che si
accende per un lavoro e si spegne quando quel lavoro è finito — non una spunta di sessione.
Dettagli nella sezione «Decisore tipizzato locale».

## Domande all'utente (tool `ask_user`)

`ask_user` è **sempre disponibile** (non ha interruttore) e costa poco contesto: serve a non far
tirare a indovinare l'agente sulle richieste ambigue. Il gate dei tool non lo tocca, quindi resta
anche quando subagent e browser sono spenti. Il comportamento atteso (quando chiedere, quando no)
è nella descrizione del tool e nella sezione `## Domande all'utente` del system prompt.
Controlli: `node media/test-ask.mjs` (unità), `media/test-ask-live.mjs`, `media/test-ask-browser.mjs`
e `media/test-ask-cli.mjs` (con modello, browser e pseudo-terminale veri). Il log di audit è
`media/ask-log.jsonl`. Le istanze dei test automatici partono con `DASH_ASK=off`, così nessun test
resta in attesa di una risposta che non arriverà mai.

## Dettaglio subagent

I subagent **non** sono caricati globalmente (non appaiono nelle sessioni CLI/TUI),
ma solo dalla dashboard, via `additionalExtensionPaths` (`DASH_SUBAGENT_EXT`).

In alto nella dashboard c'è il tasto **🤖 subagent: OFF/ON** e il campo **max**:

- **OFF (default)** → i tool `subagent` e `bg_wait` vengono **rimossi** dalla sessione:
  non vengono inviati all'API, quindi il modello **non può** delegare (costo zero garantito).
- **ON** → i tool vengono aggiunti; il modello può usare subagent (⚠️ aumenta i token).
- **max** (default **3**) → numero **massimo di agenti per richiesta**. Modificabile dalla
  dashboard (1–64). Viene passato all'estensione via `PI_SUBAGENT_MAX_SPAWNS_PER_RUN`,
  che `pi-subagents` rilegge ad ogni run.

Il gate è verificato a livello di richiesta API: da OFF i tool inviati sono solo
`read, bash, edit, write, web_search, source_check, fetch_content, get_search_content`.
Al riavvio la dashboard torna **OFF** e **max 3**.

API: `POST /api/subagents { "enabled": true|false, "maxSpawns": 1..64 }`.

## Note
- Livelli thinking per modello: `deepseek-flash` → low/high/max ; `deepseek-v4-pro` → high/max.
- `node_modules/@earendil-works/...` è un symlink al pacchetto pi globale.
- Sicurezza: l'agente ha `bash` e accesso ai file sotto `DASH_ROOT`, e può contattare URL
  arbitrari. La dashboard è protetta da HTTPS + Basic auth + rate-limit, ma il raggio d'azione
  dell'agente resta ampio: valuta `DASH_ROOT` più stretto (es. una cartella di progetto) e
  promuovi i comandi distruttivi a un gate di approvazione prima di usarla con altri utenti.
- Backup: `pi-backup.timer` gira ogni giorno alle 04:15; verifica ogni tanto con
  `systemctl list-timers pi-backup.timer` e `ls -la backups/`.
