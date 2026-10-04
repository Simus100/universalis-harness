# Universalis Harness

**Un agente AI che lavora sui tuoi file, non solo in una chat.** Dashboard web self-hosted: chat
con tracciamento completo della spesa, file manager, obiettivi con catena di passaggi,
pianificazioni automatiche, skill riutilizzabili e un browser pilotato dall'agente — con la
possibilità di prendere il controllo quando serve un passaggio umano.

Nato come strumento di lavoro reale e usato ogni giorno in produzione, non come demo.

![Chat con ragionamento, chiamate ai tool, anteprima di un disegno e card dei file](docs/images/chat.png)

---

## Cosa fa

**Chat agentica trasparente.** Ogni turno mostra pensiero, testo e chiamate ai tool *nell'ordine
reale*, con l'esito di ognuna. La barra in alto dice sempre modello, livello di ragionamento,
contesto occupato, token in ingresso/uscita, cache, **costo della sessione**, branch git e durata.
Niente scatole nere: quando una risposta costa più del previsto, si vede.

**File come cittadini di prima classe.** I file prodotti o letti dall'agente compaiono in chat come
card con *apri* e *scarica*; le cartelle si scaricano come `.zip`. Il file manager naviga, modifica,
carica, cerca nel contenuto (con salto alla riga trovata) e si aggiorna da solo quando l'agente
scrive.

**Obiettivi e pianificazioni.** Un obiettivo è una catena di passaggi più una checklist, con
avanzamento e un pulsante che manda all'agente i passaggi rimanenti. Le pianificazioni cron fanno
girare prompt o obiettivi in autonomia, con esito, durata e log consultabili.

**Disegni dentro la risposta.** Se il modello spiega con uno schema, il blocco SVG diventa un
disegno vero nel punto esatto del messaggio — con vista ingrandita, copia e download — dopo il
passaggio in un sanitizzatore che rifiuta script, risorse esterne e riferimenti di rete.

**Un decisore locale, acceso a richiesta.** Dove serve un giudizio ripetibile con una probabilità —
instradare una richiesta, dire se un input è ostile, scegliere fra azioni, dare una priorità —
l'harness può accendere dal menu *features* un decisore tipizzato locale — **Decision_M** (4B su CPU):
risponde a domande sì/no, scelta e punteggio **senza generare un token** e senza mandare nulla
fuori. Si accende quando serve e si spegne quando non serve, perché costa ~5,7 GB di RAM; l'agente
può proporne l'uso e chiederne il consenso, mai deciderlo da solo.

**Skill riutilizzabili** nel formato aperto *Agent Skills* (`SKILL.md`): si creano, si importano da
`.zip` e si usano come procedure stabili, con il modello che le legge solo quando il compito
corrisponde.

**Browser pilotato.** L'agente apre siti reali, legge l'albero di accessibilità, clicca e compila
moduli in un Chrome headless con sandbox verificata. Nella vista *live* lo guardi lavorare e, se
serve un 2FA o un CAPTCHA, prendi il controllo: la chat resta accanto alla pagina.

**Domande all'utente invece di supposizioni.** Quando una richiesta è ambigua, l'agente pone la
domanda *dentro la conversazione*, con opzioni concrete e scadenze esplicite, e aspetta la risposta.

| Obiettivi | Pianificazioni | Skill | File |
|---|---|---|---|
| ![Scheda obiettivi con catena di passaggi e checklist](docs/images/goal.png) | ![Pianificazioni cron con prossima esecuzione e log](docs/images/pianificazioni.png) | ![Skill nel formato Agent Skills](docs/images/skill.png) | ![File manager](docs/images/file.png) |

## Due modi di usarlo

**1. Istanza ospitata** — il cliente usa la dashboard nel browser; l'istanza vive su un server
gestito. Ogni istanza ha cartella, credenziali e configurazione proprie, e può essere **limitata**:
quota disco con avviso *prima* del tetto fisico, modello bloccato, livelli di ragionamento
disabilitabili, sandbox di sistema più stretta per l'utente non privilegiato. È il modo in cui il
prodotto è già usato per un sottocliente.

**2. Installazione on-premise** — su una macchina del cliente, per chi ha vincoli propri (dati in
casa, rete chiusa, integrazioni interne). Tutto sta in una cartella: nessun servizio esterno, nessun
database, nessuna dipendenza cloud.

## Per chi è

- **professionisti e piccole strutture** che vogliono un agente che tocchi davvero i propri file e
  documenti, senza montare una piattaforma;
- **team tecnici** che vogliono un'interfaccia web sopra un agente a riga di comando, con costi
  sotto controllo;
- **chi ospita per altri**: una istanza per cliente, isolate, con limiti misurabili.

## Com'è fatto

![Architettura](docs/images/architettura.svg)

Un solo processo Node serve la dashboard (HTML, CSS e JavaScript in un file, senza build) e le API.
Caddy mette HTTPS davanti e non comprime lo stream degli eventi; systemd tiene su il servizio e fa i
backup. L'agente è `pi` con le sue estensioni: accesso web, subagent, browser. Nessun database: chat,
obiettivi, pianificazioni e skill sono file leggibili.

## Sicurezza e limiti dichiarati

| Garantito | Come |
|---|---|
| Accesso protetto | login con cookie firmato (HMAC) **o** Basic Auth; blocco progressivo dopo tentativi falliti; HTTPS obbligatorio in produzione |
| CSRF | le scritture da cookie sono accettate solo dall'origine dell'applicazione |
| Perimetro dei file | percorsi confinati nella root, `..` e link simbolici che ne escono bloccati — anche nello `.zip` di una cartella |
| Contenuto non attendibile | l'SVG del modello passa da un sanitizzatore con whitelist e viene reso come immagine, mai nel DOM |
| Browser | sandbox di Chrome verificata prima di ogni azione, utente di sistema dedicato, nessuna shell |
| Segreti fuori dal codice | credenziali in `.env` con permessi ristretti, segreto di sessione in file separato, esclusi dal versionamento |

**Limiti, detti chiaramente.** L'agente ha accesso a una shell e ai file della root dell'istanza:
il confine di sicurezza è la macchina (o il container) su cui gira, non l'applicazione. Il modello di
accesso è pensato per **una persona per istanza** (utente e password), non per organizzazioni con
ruoli e permessi. Nella modalità ospitata non c'è fatturazione automatica: è gestita a parte.

## Requisiti

- Linux con systemd
- Node.js ≥ 22
- Caddy (o altro reverse proxy) per HTTPS
- Chrome headless *(opzionale)* per il tool browser, con un utente di sistema dedicato

## Documentazione

| dove | cosa |
|---|---|
| [`docs/MANUALE.md`](docs/MANUALE.md) | guida operativa completa: chat, file manager, viste, comandi, API, sicurezza, backup, test |
| [`docs/ISTANZE.md`](docs/ISTANZE.md) | come convivono più istanze sullo stesso server (porte, utenti, limiti, isolamento) |
| [`docs/RICOSTRUZIONE.md`](docs/RICOSTRUZIONE.md) | ripristino da zero: prerequisiti, servizi, quote, sandbox |
| [`docs/SYNC-GITHUB.md`](docs/SYNC-GITHUB.md) | cosa viene pubblicato in questo repository e cosa resta fuori |
| [`docs/INTERFACCIA.md`](docs/INTERFACCIA.md) | sistema visivo della dashboard: token, sfondo nero, contrasti, misure su telefono |
| [`docs/RIPRISTINO-RESTYLING.md`](docs/RIPRISTINO-RESTYLING.md) | come tornare alla dashboard precedente al restyling del 2026-10-04 |

Qualità: oltre **700 controlli automatici** distribuiti in dodici suite, che girano su istanze
isolate — inclusi i test che si aprono in un browser vero (anteprima dei disegni, viste, palette dei
comandi) e quelli che verificano la tenuta del servizio sotto errore.

## Stato del progetto

Prodotto **in uso quotidiano**, in evoluzione attiva. Pronto e stabile: chat, file manager, obiettivi,
pianificazioni, skill, domande all'utente, export, PWA su mobile, multi-istanza con limiti. In
evoluzione: integrazioni con servizi esterni, gestione del ciclo di vita delle istanze ospitate,
affinamento dell'interfaccia.

## Licenza

**Software proprietario — tutti i diritti riservati.** Il codice è pubblicato per trasparenza e
valutazione; non è concesso in uso, copia, modifica o ridistribuzione senza un accordo scritto con il
titolare dei diritti. Vedi [`LICENSE`](LICENSE). Licenze d'uso commerciale, istanze ospitate e
installazioni on-premise sono disponibili su richiesta.
