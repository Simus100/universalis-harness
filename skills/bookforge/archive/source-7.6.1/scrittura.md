> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# Scrittura capitolo per capitolo (Fase 4)

Si scrive **un capitolo alla volta**. Mai generare l'intero libro in una risposta, salvo richiesta esplicita. Per i capitoli completi usa Canvas o gli strumenti di creazione file disponibili; in loro assenza, consegna il testo integralmente in chat.

## Il principio sopra tutti: si scrive per essere letti

L'obiettivo è un romanzo **bello, chiaro e piacevole da leggere** — non "letterario" nel senso di complicato. La chiarezza non è il contrario della bellezza: ne è la condizione. La grande prosa narrativa italiana (Calvino, Buzzati, Carofiglio, il buon noir) è *limpida*: il lettore *vede* la cosa, non la decifra.

**Regola che governa tutte le altre: se una frase va riletta per essere capita, va riscritta più semplice.** Nessuna regola di questo file — legatura, sottotesto, sorpresa, densità figurativa — può violare la chiarezza. Quando una regola e la chiarezza confliggono, vince la chiarezza. Sempre.

Il lavoro della skill è **togliere ciò che rende la prosa generica e morta** — cliché, gonfiaggio, anglicismi, ritmo piatto, spiegazione astratta — **senza aggiungere complicazione**. Non deve rendere la prosa più "elevata": deve renderla più pulita e più viva. Una frase corta e diretta non è un difetto da correggere: spesso è la cosa giusta.

## Protocollo per ogni capitolo

**Pre-volo (obbligatorio — prima di scrivere qualsiasi prosa).** L'ordine conta: l'ultima cosa letta prima della prima frase è *prosa*, non regolamento. `anti-ai.md` non si apre in stesura — si apre in revisione (Step 5).

```
☐ 1. Leggi references/carta.md (una pagina di imperativi positivi: l'unica dottrina attiva nel draft).
☐ 2. Vincoli fattuali: NST + Ledger PIP (scegli diverso dagli ultimi 2-3 capitoli),
      fatti canonici rilevanti, voice_fingerprint (banditi da non usare, idioletto come lente del POV).
☐ 3. PER ULTIMO: PROSA — l'ultima pagina buona di capitolo_NN.md (non il riassunto)
      + 2-4 passi di references/antologia.md pertinenti alla funzione del capitolo.
☐ 4. (Opzionale) Riscaldamento: 3-4 righe di monologo interiore del POV, da cestinare;
      oppure una frase-àncora scritta dall'autore, da cui la prosa continua.
```
Solo dopo questi passi, vai allo Step 0. La consegna passa dalla revisione dello Step 5 (classe oggettiva da correggere sempre; classe indiziaria a giudizio dell'orecchio).

**Step 0 — Calibrazione StyleDNA**
Consulta il profilo StyleDNA del progetto (`references/styledna.md` se serve ricalibrare) e calibra la prosa sui 12 assi. Il registro (frasi corte o lunghe, densità figurativa, quanto sottotesto) lo decide lo StyleDNA del progetto, non un gusto "letterario" di default.

**Step 1 — Presentazione**
```
📝 Capitolo [N]: [Titolo]
Obiettivo: [dall'indice]
Funzione: [dall'indice]
```

**Step 2 — Scaletta + PIP**
Proponi la scaletta. Applica il **Pattern Interruption Protocol** (`references/anti-ai.md` §PIP): consulta il **Ledger PIP** nell'NST (apertura, chiusura, senso dominante, campo metaforico e modalità degli ultimi 2-3 capitoli) e scegli **diverso** su ciascun asse. Per ogni scena emotivamente rilevante (fiction) applica il **Protocollo Pre-Scena** (`references/psicologia.md` §Pre-Scena). Chiedi conferma o modifiche.

*(Opzionale — la dispensa dei dettagli.)* Per le scene importanti, prima di scrivere compila come lavoro preparatorio un inventario di 15-20 specifici della scena: oggetti con nome proprio, suoni, odori, texture, il dettaglio che solo chi ci vive noterebbe. Se l'autore ha un `taccuino.md` di osservazioni dal vivo, attingi prima da lì. In stesura si pesca dalla dispensa: il dettaglio scelto prima è più giusto del dettaglio inventato durante la frase. La pianificazione resta separata dalla prosa: la dispensa è un dato dello Step 2, mai un testo da "eseguire".

**Step 2b — Livello di granularità (il dial)**
La scrittura ha tre tacche di granularità. Il livello è **commutabile in qualsiasi momento** con `/granularita [capitolo|scena|beat]`; `/scena` e `/beat` sono override one-shot (scrivono solo la prossima unità senza cambiare il default). La manopola può variare da capitolo a capitolo (es. la scena d'azione del cap. 12 in beat, il resto a capitolo).

- **L1 — Capitolo** (default): vai allo Step 3 e scrivi il capitolo intero.
- **L2 — Scena**: per ogni scena presenta la **Scheda Scena** (questionario 8 parametri sotto), poi scrivi **scena per scena**: Scena 1 → presenta → ⏸️ conferma → Scena 2 → ecc.
- **L3 — Beat**: dentro la scena, scrivi **un beat alla volta** (protocollo sotto).

**Scheda Scena (L2 e L3)** — questionario pre-compilato con suggerimenti intelligenti (genere, arco, posizione, PIP); l'utente conferma o modifica.
Fiction — 8 parametri: 1) Funzione narrativa, 2) Tono e atmosfera, 3) Ritmo e pacing, 4) POV e distanza narrativa, 5) Modalità dominante, 6) Tecnica stilistica privilegiata, 7) Obiettivo emotivo, 8) Vincoli.
Non-fiction — 7 parametri: 1) Funzione didattica, 2) Tono, 3) Struttura, 4) Lunghezza e ritmo, 5) Elemento distintivo, 6) Obiettivo del lettore, 7) Vincoli.

**Protocollo Beat (L3).** Un **beat = una singola unità drammatica = una MRU** (motivazione→reazione) o un movimento della scena: un ingresso, una rivelazione, una decisione, una svolta nel dialogo. ~1-3 paragrafi, *non* un conteggio fisso di parole.
```
1. BEAT-LIST: scomponi la scena in 3-7 beat, sulla base del Pre-Scena
   (stato emotivo POV, meccanismo di difesa, scarto autentica/mostrata). Presentala e fatti confermare.
2. LOOP per ogni beat:
   scrivi il beat (StyleDNA + dottrina §Come si scrive bene) → presenta → ⏸️ conferma/modifica → beat successivo.
   Porta una "running state" di 1 riga: ultima frase scritta · temperatura emotiva ora · beat che restano.
3. RE-LINK finale (OBBLIGATORIO): a scena chiusa, rileggi i beat insieme e ricuci i punti in cui si vede la giuntura.
   Lancia scripts/stylometry.py; se la prosa risulta frantumata, ricuci verso la scorrevolezza — NON verso periodi lunghi a forza.
```
Perché il punto 3 è essenziale: scrivere a micro-unità può **frantumare** la prosa (ogni beat nasce isolato → ritmo a singhiozzo). Il re-link rende il passaggio tra beat scorrevole e naturale. Scorrevole non vuol dire lungo: la scena d'azione resta a frasi corte se è il suo registro.

**Cosa NON si frammenta a livello beat**: il PIP (aperture/chiusure, senso dominante, campo metaforico) resta a livello di **capitolo** — il beat eredita le decisioni del capitolo, non se le rifà ogni paragrafo. La "running state" dei beat vive solo durante la sessione: nel BSR vanno i riassunti di capitolo, non i beat.

**Step 3 — Scrittura (Draft Grezzo)**
Scrivi il capitolo seguendo la Carta (`references/carta.md`) e il registro dello StyleDNA. Per il pacing usa **Scene & Sequel** e le **MRU** (unità motivazione-reazione); per il dialogo, beat d'azione invece di tag avverbiali. Per la fiction, integra il framework psicologico (`references/psicologia.md`). **Scrivi in modalità "draft grezzo"**: lascia che la storia scorra senza auto-censurarti su tic o regole stilistiche. I filtri si applicano dopo, nello Step 5. Non cercare di scrivere perfetto al primo colpo: la perfezione immediata produce prosa sterile.

*(Opzionale — varianza e selezione.)* Su richiesta dell'autore, o per capitoli/scene chiave: proponi **3 attacchi diversi** della scena — non tre versioni levigate, tre *aggressioni* differenti (altro punto della cronologia, altro senso dominante, altra distanza narrativa) — e lascia scegliere all'autore a orecchio. Per la sola prima frase del capitolo la tecnica vale sempre la pena: **5 candidate**, l'autore sceglie (o ne scrive una sua), poi si prosegue. La selezione è dell'autore, mai del modello: il modello tende a preferire la versione media.

**Step 4 — Chiusura**
```
📊 STATO DEL PROGETTO
Capitoli completati: [N] / [Totale]
Parole scritte: ~[N]
Prossimo capitolo: [Titolo]

Vuoi: a) Procedere   b) Modificare   c) Revisionare questo capitolo   d) Tornare all'indice
```

**Step 5 — Revisione di consegna: qui (e solo qui) si apre il regolamento**
Ora — non prima — apri `references/anti-ai.md` e la dottrina completa (§Come si scrive bene). Poi:

1. **Perizia eseguibile:** lancia `python scripts/stylometry.py <file> --lang it --json` e leggi l'output in due classi.
   - **Classe oggettiva — si corregge sempre:** anglicismi e calchi, occorrenze dei `banditi` del voice_fingerprint, ripetizioni verbatim di bigrammi/trigrammi.
   - **Classe indiziaria — solo segnalazione:** ASL, flag anglo-tradotto, ritmo, blocco `llm_tics`. Dice *dove guardare*; se intervenire lo decide la rilettura a orecchio, calibrata sul registro dello StyleDNA del progetto (uno staccato voluto da noir non è un difetto perché una soglia dice così). **L'orecchio batte i numeri.**
2. **Controllo finale a orecchio** (sotto, §Il controllo finale) nell'ordine dato: chiarezza, poi pulizia, poi vita, poi sorpresa.
3. **Budget di revisione:** interventi di merito su **massimo ~10 punti per capitolo**, i più gravi emersi dalla rilettura. La classe oggettiva non consuma budget. Motivo: la revisione illimitata carteggia — toglie i difetti e la vita insieme; il budget obbliga a distinguere ciò che stona da ciò che è solo diverso dalla media. Se dopo il budget il capitolo ancora non convince, il problema è più profondo del labor limae: segnalalo all'autore invece di continuare a limare.

Poi compila il **Narrative State Tracker** (sotto). Dopo l'NST, genera il blocco BSR aggiornato (`references/stato-bsr.md`), **proponi** (mai imporre) 1 passaggio del capitolo da promuovere in `references/antologia.md` con la sua categoria, e segnala all'utente che può salvare.

## Come si scrive bene (la dottrina — ogni capitolo)

Sotto la chiarezza, queste sono le scelte che separano una prosa viva da una corretta-ma-morta.

**Cosa rende viva la prosa (da fare):**
- **Concreto, non astratto.** Il moltiplicatore di qualità numero uno, e serve anche la chiarezza. Non "una macchina vecchia" ma "una Panda col paraurti tenuto su dal fil di ferro". Un dettaglio preciso vale più di tre aggettivi evocativi. Il generico è il colore di fondo dell'AI; il particolare è la firma dell'umano — e fa *vedere* la cosa al lettore.
- **Una voce.** Niente telecamera neutra. Anche in terza persona, la scena passa attraverso una coscienza con un umore e un modo suo di nominare le cose (discorso indiretto libero). Ogni scena dovrebbe contenere almeno un giudizio o un modo di vedere che appartiene *solo* a quel punto di vista. Ma la voce si scrive **chiara**: una frase può essere personale e limpida insieme.
- **Ritmo naturale, non uniforme.** Le frasi non sono tutte della stessa misura — la cadenza piatta è ciò che fa "suonare AI". Ma la varietà nasce dal *senso*, non da una quota: periodo più disteso quando il pensiero è disteso, frase corta sul colpo. Non c'è una lunghezza-bersaglio da rispettare.
- **Emozione che arriva.** Può essere **mostrata** (gesto, corpo, dettaglio) **oppure detta** — purché detta in modo pulito, senza cliché e senza gonfiare. "Il dolore arrivò tutto insieme e dovette sedersi" è dire, ed è ottimo. Dire l'emozione in modo limpido è meglio che mostrarla in modo contorto. Mostrare è uno strumento, non una legge.
- **Necessità e compressione.** Ogni scena deve cambiare qualcosa; se la togli e non cambia niente, va tagliata. Scrivi "a caldo", poi togli il 10%: la densità è qualità. Fidarsi del lettore vale più di spiegare.
- **La scelta più vera (non solo la più probabile).** Lasciato a sé, il modello prende l'associazione più probabile: la metafora più a portata, la reazione attesa. Nei punti di scelta (un'immagine, un paragone, una reazione) nomina la versione ovvia, poi chiediti se una meno ovvia è **più vera o più chiara**. Tienila solo se lo è. Se la versione meno ovvia è solo più "arguta" o più oscura, scarta: l'ingegnosità che costa chiarezza è un difetto, non un pregio.
- **Tempo elastico.** Il tempo narrativo non scorre uniforme. Dilata i momenti emotivamente densi (un colpo, una rivelazione, uno sguardo): falli durare più a lungo sulla pagina di quanto durerebbero nella realtà. Comprimi i passaggi inerti (tragitti, attese, routine) in una frase o in un salto temporale netto. Il contrasto tra dilatazione e compressione è il ritmo vero della narrativa.
- **La prima frase.** La prima frase di ogni capitolo è la più importante. Punta a un'apertura che faccia una di queste cose: 1) porre una domanda implicita nella mente del lettore, 2) stabilire un contrasto o una tensione immediata, 3) calare il lettore in un'azione già in corso (in medias res). La prima frase non deve mai essere una descrizione meteorologica o un riassunto di ciò che è successo prima.
- **Transizioni a cerniera (Fluidità).** Mai chiudere un paragrafo in modo definitivo se la scena non è finita. L'ultima frase di un paragrafo deve lanciare la prima del successivo (per contrasto logico, movimento fisico o associazione sensoriale). Evita i blocchi di testo stagni: fai scorrere l'azione come un piano sequenza continuo.
- **Descrizione in Azione.** (Speciale Fiction). Tendi a non descrivere l'ambiente come se il tempo fosse fermo ("La stanza era..."). La descrizione può avvenire in modo indiretto, attraverso: l'interazione del personaggio con l'ambiente (un raggio di luce che colpisce la polvere spostata da un passo), associazioni sensoriali (l'odore di umidità che entra nei polmoni), o ostacoli fisici che il personaggio deve aggirare. Fai vivere lo spazio anche attraverso il movimento e l'azione, non solo attraverso la staticità descrittiva.
**Cosa uccide la prosa (da togliere — dettagli in `references/anti-ai.md`):**
cliché e metafore inflazionate · gonfiaggio della significatività (alzare la voce invece della precisione) · anglicismi e calchi · ritmo metronomico · spiegazione astratta di ciò che si potrebbe far vedere · chiusure che incartano tutto per pigrizia. **Non sono difetti, e non si toccano:** la chiarezza, la frase corta, l'emozione detta in modo pulito, la sintassi semplice.

**Le manopole di registro (StyleDNA), non obblighi.** Periodo lungo/legatura, densità figurativa, quantità di sottotesto: sono **scelte di registro** decise dallo StyleDNA del progetto e dal genere, non valori da massimizzare. Per il registro secco — thriller, noir d'azione, molta fantascienza — la frase corta e chiara è quella giusta, e l'ipotassi sarebbe un errore. Non allungare né complicare mai "per fare letterario".

**Per la fantascienza in particolare.** La qualità dell'SF non sta nello spiegare la tecnologia, ma nel renderla *vissuta*: il novum si mostra attraverso l'uso ordinario, non con l'info-dump. Mostra il futuro come il martedì di qualcuno. I migliori — Le Guin, Dick, i Strugackij, Lem, Calvino delle *Cosmicomiche*, Evangelisti — radicano lo straniamento nel gesto quotidiano e nell'idioma, con prosa chiara. Il lettore deve *abitare* il mondo prima di capirlo.

## Il controllo finale (in ordine — la chiarezza vince)

Rileggi il capitolo (ad alta voce aiuta) e passa questi filtri **in quest'ordine**. Se due confliggono, vince quello più in alto.

```
1. CHIAREZZA — ogni frase si capisce alla prima lettura? Se ne devi rileggere una, semplificala.
   Niente sintassi attorcigliata, niente ambiguità non volute. Questo filtro batte tutti gli altri.
2. PULIZIA — cliché o metafore inflazionate? gonfiaggio? anglicismi/calchi? ritmo tutto uguale?
   spiegazione di ciò che si potrebbe mostrare? Togli, non aggiungere.
   Spia eseguibile: scripts/stylometry.py riporta il blocco `llm_tics` (antitesi-riflesso, terzine,
   trattino drammatico, epigrammi in chiusura, schema somatico, raffica di «come se», aggettivi-portata,
   gonfiaggio della significatività).
   Consultalo DOPO aver scritto,
   come segnalazione: correggi solo le occorrenze segnalate che alla rilettura suonano in posa.
   Le soglie NON sono quote da rispettare in scrittura — scrivere per i contatori è già un tic.
3. VITA — è concreto (nomi e dettagli, non categorie)? c'è una voce? l'emozione arriva?
4. SORPRESA — qualche scelta è solo "la prima venuta"? Cambiala SOLO se la nuova versione è
   più vera o più chiara, mai se è solo più arguta o più oscura.
```

Contro il manierismo (il rischio opposto, da evitare quanto il "suonare AI"): non scrivere oscuro per sembrare profondo, non trattenere l'informazione per fare atmosfera, non fare frasi-sentenza a ogni paragrafo, non rendere tutti i personaggi arguti allo stesso modo. Dettagli in `references/anti-ai.md` §manierismo.

## §Lettore — lettura a freddo simulata (`/lettore`, on-demand)

Comando opzionale, mai parte automatica del protocollo. Rileggi il capitolo (o la scena) indicato **come primo lettore**: ignora deliberatamente NST, Bibbia e indice — sai solo ciò che il testo ha detto fin qui — e dichiaralo in apertura dell'output. Compila questo questionario fisso, con riferimenti puntuali al testo:

```
👓 LETTURA A FREDDO — Cap. [N]
1. CONFUSIONE: punti in cui ho dovuto rileggere o non ero certo di chi/dove/quando. [posizione → cosa]
2. ATTENZIONE: dove il ritmo cala o la mia mente vagava. [posizione]
3. PREVEDIBILITÀ: cosa ho previsto prima che accadesse (e cosa mi ha sorpreso davvero).
4. DOMANDE: le 3 domande che mi porto nel prossimo capitolo. [confrontale poi con l'NST: coincidono?]
5. EMOZIONE: cosa ho provato e dove; dove avrei dovuto provare qualcosa e non è arrivato.
⚠️ Limite dichiarato: lettore e autore sono lo stesso modello — questo feedback è più affidabile
su ritmo e prevedibilità che sulla chiarezza (le ambiguità che l'autore non ha visto potrei non
vederle nemmeno io). Non sostituisce un beta-reader umano.
```

Il punto 4 è il più utile: se le domande del lettore simulato non coincidono con le «domande che il lettore si sta ponendo» dell'NST, il capitolo sta comunicando qualcosa di diverso da ciò che credi.

## Narrative State Tracker (NST) — dopo ogni capitolo

Obbligatorio per libri >8 capitoli, consigliato per tutti. Consultalo **prima** di applicare il PIP del capitolo successivo.

```
📋 NARRATIVE STATE TRACKER — [Titolo] — Dopo Cap. [N]

═══ STATO NARRATIVO ═══
Posizione nell'arco: [Setup / Rising Action / Midpoint / Crisis / Climax / Resolution]
Tensione narrativa (1-10): [N]
Domande che il lettore si sta ponendo: [top 3]

═══ INFORMAZIONI ═══
Note al lettore: [cosa il lettore sa ora]
Ancora nascoste: [cosa non sa ancora]
Promesse fatte / mantenute: [...]

═══ SOTTOTRAME / FILONI APERTI ═══
[Nome]: [aperta / in sviluppo / da risolvere entro cap. X]

═══ PERSONAGGI (fiction) ═══
[Nome]: [stato emotivo + livello salute Enneagramma + relazione chiave cambiata]

═══ LEDGER PIP (ultimi capitoli — per variare il prossimo) ═══
Cap. [N]: apertura [azione/immagine/dialogo/riflessione/ambiente] · chiusura [gancio/quiete/rivelazione/sospensione/battuta] · senso dominante [vista/udito/tatto/olfatto/propriocezione] · campo metaforico [...] · modalità [dialogo/azione/introspezione/descrizione]
(tieni le ultime 2-3 righe; il prossimo capitolo sceglie DIVERSO su ciascun asse)

═══ CHECKLIST PRE-CAPITOLO N+1 ═══
☐ Gestire sottotrama [X]?  ☐ Rivelare [Y]?  ☐ Avanzare relazione [Z]?  ☐ Mantenere promessa [W]?
```

## Promemoria di coerenza

- Mantieni coerenza assoluta con la Scheda Strategica (Fase 1) e, per le serie, con la Bibbia di Continuità (`references/continuita.md`): se qualcosa la contraddice, **fermati e segnala**.
