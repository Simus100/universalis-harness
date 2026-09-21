> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# Sistema anti-AI e regole dell'italiano

Obiettivo: prosa che sembri **scritta nativamente in italiano** da un autore umano.

**⚠️ Quando aprire questo file: in REVISIONE (Step 5), mai in stesura.** Un elenco di difetti in contesto attivo durante il draft produce scrittura difensiva e rende salienti proprio i tic che vuole evitare. In stesura vale solo `references/carta.md`; questo file è lo strumento della rilettura.

Questo file insegna *giudizio*, non ti dà caselle da spuntare. La scrittura che sembra umana nasce da scelte, non dal superare una checklist: se ti accorgi di scrivere per soddisfare una regola invece che per servire la scena, fermati — quel riflesso è già un tell. Leggilo come la voce di un editor esperto seduto accanto a te, non come un regolamento.

**Regola sovrana (vedi `references/scrittura.md`):** niente di qui dentro vale se costa troppa chiarezza. Togliere i tic dell'AI vuol dire ripulire — non rendere la prosa più complicata o più oscura.

## I due fallimenti opposti

Un testo può "suonare finto" in due modi opposti — le due cunette ai lati della strada:

- **Fallimento A — Genericità / robotismo.** Cliché, ritmo piatto, formule da AI, nessuna voce. È il più comune.
- **Fallimento B — Manierismo / over-polish.** Prosa brillante e lucida a ogni riga, in posa, ogni dettaglio simbolico, ogni battuta perfetta. È il meno comune ma il più insidioso.

## Le firme del manierismo (Fallimento B)

Quattro abitudini che tradiscono la mano che cerca l'applauso. Usa il positive prompting per evitarle:

- **Frase-sentenza a fine paragrafo.** 
  ❌ Chiudere di continuo i paragrafi con un epigramma lucidato o una frase ad effetto.
  ✅ Fai arrivare l'intuizione o la frase forte *dentro* il flusso del paragrafo, non in posa sul finale. Lascia che il paragrafo finisca in modo naturale.
- **Tutti i personaggi ugualmente acuti.** 
  ❌ Far notare a tutti i personaggi il dettaglio rivelatore o farli rispondere sempre con la battuta perfetta.
  ✅ Introduci asimmetria intellettuale: fai dire a qualcuno una cosa stupida, fagli fraintendere la situazione o fagli fare una battuta che cade nel vuoto.
- **Oggetti tutti simbolici.** 
  ❌ Caricare di peso tematico o metaforico ogni singolo oggetto descritto nella stanza.
  ✅ Inserisci oggetti "muti", che servono solo a fare rumore di fondo o a dare concretezza tattile alla scena, senza alcun significato nascosto.
- **Sottotesto che diventa testo.** 
  ❌ Mostrare il gesto e poi spiegarne il significato psicologico subito dopo.
  ✅ Mostra il gesto e poi **taci**. Fidati del fatto che il lettore capirà il significato senza la tua spiegazione didascalica.

## Sottotesto ed Emozioni (Show, Don't Tell Estremo)

Regole valide **esclusivamente per la Narrativa (Fiction)**. La Saggistica/Manualistica (Non-Fiction) è esentata, in quanto richiede chiarezza didattica ed esplicitazione diretta dei concetti.

- **Divieto di Esplicitazione Emotiva.** Quando l'emozione è il fulcro della scena, è sconsigliato nominarla. Costringi il lettore a dedurla dal ritmo del respiro, da un gesto irrazionale, dalla contrazione della sintassi o dal modo in cui il personaggio manipola gli oggetti. L'emozione nominata spesso rende la prosa piatta e poco efficace, limitando l'immersione del lettore. 
- **Frizione nei Dialoghi (La Teoria dell'Iceberg).** È spesso consigliabile non far dire ai personaggi esattamente ciò che pensano. In ogni dialogo dovrebbe esserci una forma di frizione: qualcuno omette, devia l'argomento, mente o usa parole che significano l'opposto della sua postura fisica. Il dialogo non serve solo a trasferire informazioni al lettore, ma a mostrare i rapporti di forza e i conflitti interiori dei personaggi.

## I tic da LLM (Fallimento A) — i più riconoscibili oggi

Questi pattern fanno dire al lettore "l'ha scritto una macchina". Valgono per fiction e non-fiction. Sostituisci il riflesso automatico con una scelta intenzionale:

- **Terzine compulsive (la regola del tre).** 
  ❌ Elencare sempre in gruppi di tre, spesso in climax ("rapido, semplice ed efficace").
  ✅ Rompi il conto: usa un dettaglio singolo o usa coppie secche. Se usi tre, fallo perché serve retoricamente.
- **Antitesi-riflesso.** 
  ❌ Strutturare per forza su "Non si tratta di X, ma di Y" per sembrare profondi.
  ✅ Fai un'affermazione diretta su cos'è la cosa. Concedi l'antitesi solo quando l'opposizione è il vero nucleo del problema.
- **Signposting vuoto.** 
  ❌ Annunciare: "In questo capitolo esploreremo…", "È importante sottolineare che…". 
  ✅ Arriva direttamente al punto e fallo. L'esplorazione deve avvenire, non essere annunciata.
- **Domanda retorica d'apertura.** 
  ❌ Iniziare con: "Ti sei mai chiesto…?", "Cosa significa davvero…?".
  ✅ Apri con un'affermazione precisa o un'immagine vivida che cali subito il lettore nel problema o nella scena.
- **[Non-fiction] Comprensività senza tesi.** 
  ❌ Coprire tutto bilanciando senza rischiare posizioni (es. il riflesso-listicle).
  ✅ Prendi una posizione. Difendi un'idea per cui si potrebbe litigare e rendi la prosa argomentativa.
- **Chiudere tutto in modo netto.** 
  ❌ Risolvere ogni filo e incartare ogni paragrafo con una morale o una conclusione.
  ✅ Lascia questioni irrisolte. In narrativa: fai cadere una battuta nel vuoto, lascia che un personaggio fraintenda. La vita ha spigoli non smussati.
- **Gonfiare il piccolo.** 
  ❌ Alzare il volume per dare importanza ("un momento cruciale", "forza trasformativa" per un gesto ordinario).
  ✅ Abbassa il volume e alza il dettaglio di precisione. Sostituisci un aggettivo di "portata" epica con un nome proprio specifico.
  *Spia eseguibile:* `scripts/stylometry.py` segnala il grappolo di parole-portata dell'enfasi (`llm_tics.gonfiaggio_significativita`) — un singolo termine guadagnato non scatta, solo l'accumulo.
- **L'aggettivo-portata ("atmosferico").** 
  ❌ Dichiarare l'emozione con etichette vaghe (*atmosferico, palpabile, etereo*).
  ✅ Usa un sostantivo che genera l'atmosfera in chi legge. Cosa, *esattamente*, rende "atmosferica" quella stanza? Metti l'oggetto, togli l'aggettivo.
- **Trattino a effetto (—).** 
  ❌ Usare il trattino lungo per inscenare micro-rivelazioni a ogni paragrafo.
  ✅ Usa la virgola o il punto e virgola per legare. Riserva il trattino al massimo 1-2 volte per pagina con funzione drammatica vera.
- **Similitudini a raffica ("come se").** 
  ❌ Tre "come se" di fila che riempiono il vuoto al posto dell'immagine concreta.
  ✅ Tieni quella che fa vedere davvero e taglia le altre. Sostituisci con un'immagine concreta. La spia scatta solo sul grappolo: una "come se" singola e giusta è bella.

## Variare prima di scrivere (Pattern Interruption Protocol, PIP)

Prima di un capitolo, guarda gli ultimi uno o due: come li hai **aperti** e **chiusi**, quale **senso** hai privilegiato, in che **campo metaforico** ti sei mosso, quale **modalità** dominava (dialogo, azione, introspezione, descrizione). Scegli diverso — non per disciplina, ma perché la ripetizione invisibile, capitolo dopo capitolo, è ciò che fa "suonare AI" un libro intero anche quando la singola pagina è buona. Il **Ledger PIP** nell'NST (`references/scrittura.md`) registra per ogni capitolo apertura, chiusura, senso dominante, campo metaforico e modalità: consultalo e scegli diverso su ciascun asse. Ti servono lo sguardo indietro e un attimo di onestà, non un calcolo.

## Il meta-principio (il più sottile)

Anche una tecnica *giusta*, applicata in modo uniforme, diventa un tic. Incarnare l'emozione nel corpo è craft corretto — ma se il personaggio reagisce *sempre* con lo stesso schema (stimolo → sensazione localizzata → contenimento, sempre con lo stesso vocabolario), è una formula riconoscibile. Vale per i gesti-firma, per la struttura del dubbio ("X. O forse Y."), per il modo di gestire il sottotesto. Se una costruzione ti torna sotto le dita molte volte, è un riflesso automatico travestito da stile: a variare non è il *contenuto* della tecnica, ma il suo **vocabolario**.

## Il controllo finale — dopo aver scritto

Una sola verifica, e vale più di dieci checklist. Rileggi la pagina **mentalmente ad alta voce** e chiediti: *questa pagina poteva scriverla solo questo autore, o l'avrebbe scritta qualsiasi macchina?* Cerca, concretamente, almeno: un'opinione non ovvia, un dettaglio che solo un umano noterebbe, un'ambiguità voluta, metafore non inflazionate, un tono con sfumature (non uniformemente ottimista o didattico), dialoghi che suonano come persone vere.

Poi orientati. Se la pagina è competente ma **anonima**, è il Fallimento A: manca voce, aggiungi specifico e opinione. Se è brillante a **ogni** riga e in posa, è il Fallimento B: togli lucidatura, restituisci la scena. Riscrivi solo le parti che falliscono — mai tutto per principio.

## Formule lessicali da evitare

Quando ti escono queste, è il pilota automatico: sostituisci con qualcosa di specifico al tuo testo.

| ❌ Formula | ✅ Direzione |
|---|---|
| "In conclusione" / "In definitiva" a ogni paragrafo | chiusura contestuale, o niente |
| "È importante notare che" / "Va detto che" | arriva al punto |
| "Approfondiamo" / "Esploriamo" | la formulazione specifica del contenuto |
| "Ecco alcuni consigli" | "Tre mosse che funzionano quando…" |
| "La verità è che…" / "La realtà è che…" | dillo e basta, senza preavviso |
| "In un mondo sempre più…" | apertura concreta e situata |

**Metafore esauste** (da *guadagnare* o rinfrescare, non da usare di default): *un viaggio, una chiave, le fondamenta, un faro, un ponte, aprire una porta, una luce in fondo al tunnel.*

## Regole dell'italiano

### La legatura — italiano vs inglese-tradotto

È il sintomo "finto" più frequente e più misurabile. La prosa narrativa italiana **lega**; quella tradotta dall'inglese **frantuma**.

- *Sintomo*: ASL narrativa bassa (~8-10) con tante frasi cortissime, troppi punti, frasi nominali senza verbo a raffica ("Divisa chiusa fino all'ultimo bottone. La suola consumata. Ghiaia e vetro sotto le scarpe."). L'occhio italiano le legge come *appunti*, non come prosa. Una o due danno ritmo; a raffica sono un tic da traduzione.
- *Cura*: il problema da risolvere è la frantumazione **accidentale** — la prosa a singhiozzo che sa di traduzione — non la frase corta in sé. Si cura **ri-legando dove serve**: più virgole, punti e virgola, subordinate, relative; non allungando per principio. **Non *lungo*: *legato e chiaro*.** Non esiste un'ASL-bersaglio universale: la lunghezza giusta la decide il registro dello StyleDNA del progetto — un noir d'azione vive di frasi corte, un romanzo riflessivo di periodi più distesi, e nessuno dei due è "più letterario" dell'altro. Il trattino lungo lega, ma tienilo per ultimo: oggi è il tell visivo più riconoscibile della prosa AI; nel dubbio, scegli la virgola o il punto e virgola. L'italiano secco e moderno (Carofiglio, certo Saviano, un buon noir tradotto bene) respira con periodi che scorrono *e si capiscono al primo colpo*.
- *Esempio*: ❌ "David scende. L'aria sa di pioggia vecchia, plastica calda e disinfettante. Qualcuno ha già spruzzato la scena." → ✅ "David scende, e l'aria gli arriva addosso di colpo — pioggia vecchia, plastica calda, disinfettante spruzzato sulla scena prima ancora di sapere cosa fosse." Stesso contenuto, stessa asciuttezza, ma le frasi *si tengono per mano*.
- *Sfumatura di genere (cruciale)*: **legato nell'osservazione e nella riflessione; spezzato solo nell'azione e sui colpi veri** (climax, rivelazione). In un thriller le frasi corte sono giuste nell'inseguimento, sbagliate quando il personaggio guarda solo una strada. L'obiettivo non è la prosa lunga: è la prosa **legata, chiara e tesa**.

Per la diagnosi quantitativa lancia `scripts/stylometry.py` (riporta ASL, % frasi corte e un flag "anglo-tradotto").

### Sintassi, connettivi, punteggiatura

- **Sintassi**: costruzioni naturali italiane; periodi articolati con subordinate quando serve (non solo frasi corte all'inglese); soggetto omissibile (pro-drop); inversione soggetto-verbo per enfasi; relative con "che" / "il quale".
- **Connettivi**: tuttavia, d'altra parte, in effetti, peraltro, eppure, nondimeno, per di più, di conseguenza, pertanto, dunque. "In primo luogo / in secondo luogo" (non "primo, secondo"). Evita l'abuso di "comunque" e "ma".
- **Punteggiatura**: punto e virgola per coordinate lunghe; due punti per elenchi, spiegazioni, cause; trattino lungo (—) per incisi ed enfasi (ma occhio al tic qui sopra); caporali «» per il discorso diretto (alternativa: "").
- **Registro**: scegli tra "tu" / "voi" / "Lei" / impersonale e mantieni coerenza assoluta. Self-help e guide: "tu". Saggi formali: "noi" o impersonale. Manuali: "si" o "tu".

### Calchi dall'inglese da evitare

"fare senso"→avere senso · "fare una decisione"→prendere · "realizzare" (capire)→rendersi conto · "supportare"→sostenere · "eventualmente" (infine)→alla fine · "attualmente" (in realtà)→in realtà · "assumere" (supporre)→presumere · "performance"→prestazione · "implementare"→attuare/realizzare · "focus"→attenzione/fulcro.
