# L'AI per chi lavora in logistica

**Guida pratica da zero all'uso quotidiano**
Aggiornata: 23 settembre 2026 · Livello: principiante · Lettura: ~50 minuti, da spezzare in più sessioni

---

## Come usare questa guida

Non leggerla tutta di fila. È costruita per essere letta a pezzi e **usata subito**:

| Parte | Cosa contiene | Quando leggerla |
|-------|---------------|-----------------|
| **1. Come funziona** | Il modello mentale corretto, in 15 minuti, senza matematica | Oggi |
| **2. Il metodo** | Come si parla all'AI per farsi dare roba utilizzabile | Oggi o domani |
| **3. I casi d'uso in logistica** | 20 attività concrete, ordinate per difficoltà | Prima di ogni esperimento |
| **4. Dati e sicurezza** | Cosa non incollare, come anonimizzare | **Prima di usare dati veri** |
| **5. Percorso di 21 giorni** | Mezz'ora al giorno, un compito per giorno | Da domani |
| **6. Restare aggiornati** | Come distinguere strumenti utili da fuffa | Tra un mese |
| **Appendice A** | 10 prompt pronti da copiare | Sempre |
| **Appendice B** | Glossario | Quando trovi un termine |

Le tre cose che valgono più di tutte le altre, se dovessi leggere solo dieci righe:

1. **L'AI non sa niente del tuo lavoro.** Non ha accesso al tuo gestionale, al tuo TMS, alle tue tariffe, alle tue email. Sa parlare bene e ragionare su quello che le metti davanti. Tutto il valore viene da ciò che le dai tu.
2. **Serve sempre un umano che controlla.** Il suo output è una bozza, mai una decisione. In logistica un numero sbagliato diventa un camion fermo o una multa.
3. **Automatizza il compito, tieni la decisione.** Se l'errore lo puoi vedere *prima* che faccia danni, delega tranquillo. Se l'errore esce subito nel mondo (prezzo dato al cliente, ordine confermato al fornitore, documento doganale inviato), la firma resta tua.

---

# Parte 1 — Come funziona davvero (in 15 minuti)

## 1.1 Che cosa è, in una frase

Un modello linguistico di grandi dimensioni (LLM: ChatGPT, Claude, Gemini, Copilot…) è un **programma che indovina la parola più probabile che viene dopo**, dato tutto il testo che ha davanti. Lo fa così bene e così tante volte di fila da risultare una conversazione.

Non "cerca" la risposta in un archivio. Non "pensa" come una persona. **Costruisce** la risposta pezzo per pezzo, come chi completa una frase sentita mille volte. Il risultato è spesso sorprendentemente buono, e proprio per questo il modo in cui sbaglia è subdolo.

Analogia: è un **collega nuovo, bravissimo a scrivere e a ragionare su testi, con tre difetti**:
- non ha mai messo piede nel tuo magazzino e non conosce i tuoi clienti;
- quando non sa una cosa, invece di dire "non lo so" tende a produrre qualcosa di plausibile;
- non ha responsabilità: quello che scrive lo firma la tua azienda.

## 1.2 Le cinque parole che devi conoscere

| Termine | Cosa significa davvero | Perché ti riguarda |
|---------|------------------------|--------------------|
| **Token** | Pezzetti di parola (~4 caratteri). Il modello legge e scrive a token, non a lettere | Determina quanto testo sta nella "memoria di lavoro" e quanto costa |
| **Finestra di contesto** | Lo spazio di memoria di una conversazione (oggi da centinaia di migliaia di token a milioni) | Grande ma non infinita. Un PDF di 200 pagine + 10 file + 3 ore di chat la riempiono: a un certo punto "dimentica" le prime cose |
| **Allucinazione** | Un'affermazione inventata ma plausibile | Il rischio numero uno nel tuo lavoro: numeri, codici, norme |
| **Prompt** | Tutto ciò che dai al modello: istruzioni, dati, esempi | La qualità del prompt è l'80% del risultato |
| **Addestramento** | Come il modello ha imparato, prima che tu lo usassi | Spiega perché sa l'inglese e la fisica ma non conosce la tariffa che hai negoziato ieri |

**Conseguenza pratica della memoria limitata:** in una chat lunga il modello inizia a rispondere "in generale" invece che sui tuoi dati. Rimedio: quando cambi argomento, **apri una conversazione nuova** e riporta solo il contesto che serve. Non è pigrizia, è manutenzione.

## 1.3 Perché sbaglia (e perché lo fa con sicurezza)

Le allucinazioni non sono un bug temporaneo: sono **strutturali**. Il modello è addestrato e valutato per produrre *una* risposta, non per astenersi. Quindi, se gli chiedi il codice doganale di un pezzo in lega leggera, ti darà un codice HS formalmente sensato. Se gli chiedi quanto costa un trasporto Milano–Amburgo, ti darà una cifra credibile ma inventata.

Le zone a rischio nel tuo lavoro, in ordine di frequenza:

1. **Numeri**: prezzi, pesi, volumi, calcoli su più righe, valute, conversioni, percentuali.
2. **Codici e identificativi**: HS/TARIC, codici UN ADR, partite IVA, CAP, MRN, numeri di collo, EORI.
3. **Norme e scadenze**: "quale documento serve per esportare in Turchia", "quanto tempo si ha per il visto uscire", aliquote, soglie.
4. **Nomi propri e ruoli**: nomi di doganalisti, responsabili, ragioni sociali, contatti.
5. **Fatti recenti**: cambi normativi, tariffe di mercato, scioperi, chiusure di valichi.
6. **Dettagli che sembrano ovvi**: "questa email contiene una promessa di risarcimento?" — leggila tu.

Regola d'oro: **per i numeri e i codici l'AI scrive il testo, il controllo è tuo.** Il modello è ottimo per scrivere l'email che accompagna il dato, pessimo come fonte del dato.

## 1.4 Perché invece funziona benissimo

Sui compiti di **linguaggio e struttura** è già oggi molto sopra la media umana come velocità:

- riscrivere, riassumere, tradurre, cambiare tono;
- passare da testo disordinato a testo ordinato (email → tabella, appunti → procedura);
- trovare schemi dentro un mucchio di testo (tutte le volte che un vettore ha promesso una data, tutte le eccezioni in un contratto);
- spiegare un concetto con parole più semplici, o a un livello diverso (spiegami l'Incoterm DAP come se avessi 12 anni, oppure come a un commerciale cliente);
- generare varianti (tre versioni di una email: morbida, ferma, ultimativa);
- fare da sparring partner (fammi le domande che mi farà il capo su questo KPI).

E, se usato con i tuoi dati, anche: pulire tabelle sporche, normalizzare formati, calcolare indicatori su un file che gli alleghi.

## 1.5 Tre livelli di uso (e dove sei tu adesso)

| Livello | Descrizione | Cosa ci fai | Rischio |
|---------|-------------|-------------|---------|
| **1. Assistente generalista** | Chat web/app, senza i tuoi dati | Email, traduzioni, riassunti, checklist, spiegazioni | Basso, se non incolli dati riservati |
| **2. Assistente col tuo contesto** | Gli dai i tuoi file e le tue istruzioni fisse | Analisi Excel, procedure aziendali, template, report | Medio: dipende da cosa carichi |
| **3. Automazione nei processi** | L'AI lavora dentro un flusso (gestionale, email, RPA, agenti) | Estrazione dati da documenti, smistamento, risposte automatiche | Alto: serve progetto, controlli, responsabilità |

Questa guida ti porta dal livello 1 al 2 in tre settimane, e ti spiega come valutare il livello 3 senza farti vendere fumo (Parte 3, livello 3, e Parte 6).

**Attenzione a un equivoco comune:** "software AI per la logistica" spesso è *machine learning classico* (previsioni, ottimizzazione percorsi) travestito da AI generativa, oppure è solo un chatbot appoggiato sopra un TMS. Sono cose diverse e si valutano in modo diverso.

---

# Parte 2 — Il metodo: parlare all'AI come a un collega nuovo

## 2.1 La formula in 6 pezzi

Un prompt che funziona contiene quasi sempre questi sei elementi. Non serve scriverli come un modulo, ma se il risultato è scarso, controlla quale manca.

| # | Pezzo | Domanda a cui risponde | Esempio logistico |
|---|-------|------------------------|-------------------|
| 1 | **Ruolo e obiettivo** | Chi deve essere e a che scopo | "Sei un responsabile trasporti. Devo sollecitare un vettore che ha accumulato 3 giorni di ritardo" |
| 2 | **Contesto** | Cosa deve sapere della situazione | "Spedizione groupage, cliente importante, secondo ritardo in un mese, contratto con penale dopo 48h" |
| 3 | **Dati** | Il materiale su cui lavorare | L'email del vettore, la tabella, il testo del contratto |
| 4 | **Formato** | Come vuoi l'output | "Email di max 120 parole, oggetto incluso, tono fermo ma collaborativo, 3 punti elenco con le richieste" |
| 5 | **Vincoli** | Cosa non deve fare | "Non minacciare il recesso. Non promettere risarcimenti. Non inventare date" |
| 6 | **Esempio** | Mostrare lo stile voluto | Incolla una tua email passata: "scrivi in questo stile" |

**Esempio di prompt mediocre:**
> Scrivimi una email al vettore per il ritardo.

**Lo stesso prompt, fatto bene:**
> Sei un responsabile trasporti di un'azienda manifatturiera italiana. Devi scrivere al referente del vettore Bianchi Trasporti perché la spedizione 45231 (Milano → Lione, 6 bancali, consegna prevista lunedì 21, ancora in sosta al deposito di Novara) è in ritardo di 3 giorni e il cliente ha già segnalato il fermo linea.
> Loro hanno risposto così: *«il carico è in attesa di un altro giro, vi aggiorniamo»*.
> Scrivimi l'email: massimo 120 parole, con oggetto, tono fermo ma collaborativo, tre richieste numerate (nuova data certa, nome del referente operativo, conferma dell'avvenuta consegna con POD). Non minacciare recesso, non promettere risarcimenti, non inventare date: dove serve un dato che non ho, metti [DA CONFERMARE].

Nota l'ultima frase: **"[DA CONFERMARE]"** è il trucco più semplice ed efficace per ridurre le allucinazioni. Autorizzi il modello a lasciare un buco invece di riempirlo con un'invenzione.

## 2.2 Le sette tecniche che contano davvero

1. **Dagli esempi (2-3 al massimo).** Mostrare una email scritta da te vale più di dieci aggettivi sul tono.
2. **Fallа ragionare prima di rispondere.** "Prima dimmi quali informazioni ti mancano e il tuo ragionamento in 5 righe, poi dammi il risultato." Riduce gli errori su compiti con più passaggi.
3. **Chiedi l'incertezza esplicita.** "Alla fine, elenca in 3 righe cosa hai assunto e cosa non sai." Ti fa vedere dove guardare.
4. **Itera: la prima risposta è mai quella finale.** "Più corta", "togli il secondo paragrafo", "rendi meno formale", "rifallo assumendo che il cliente sia arrabbiato".
5. **Fai le domande inverse.** "Quali sono le 5 cose che potrebbero andare storte in questo piano di carico?" — l'AI è brava a fare l'avvocato del diavolo.
6. **Usa la ricerca web quando servono fatti attuali** (normative, scioperi, tariffe di mercato) e **pretendi le fonti**. Se la funzione di ricerca non è attiva, considera ogni fatto recente come non verificato.
7. **Fissa il formato una volta e riusalo.** Se ogni settimana produci lo stesso report, scrivi il prompt una volta bene, salvalo e diventa un template. Il tuo valore sta nel template, non nella singola chat.

## 2.3 I sette errori che fanno tutti

1. **Prompt di una riga** e aspettarsi un risultato professionale.
2. **Incollare 40 pagine senza domanda.** Il modello si perde: meglio "ecco il contratto, estraimi solo la tabella delle penali".
3. **Fidarsi dei numeri.** Sempre ricalcolare: il modello sbaglia le somme di colonna che tu faresti a occhio.
4. **Usare la chat come calcolatrice o come agenda.** Per i calcoli allegategli il file o usate Excel; per le date serve sempre un controllo.
5. **Correggere il modello senza dirgli dov'è l'errore.** "Hai inventato il codice 87169090: il codice corretto è nel documento che ti ho allegato, rileggilo e riscrivi la riga."
6. **Aprire dieci chat scollegate** per lo stesso lavoro, e poi ricostruire il contesto a mano.
7. **Incollare dati riservati** perché "tanto è solo una chat" (vedi Parte 4).

## 2.4 Come verificare un risultato in 60 secondi

I quattro controlli, sempre negli stessi ordini:

| Controllo | Cosa guardare | Cosa fare se non torna |
|-----------|---------------|------------------------|
| **Numeri** | Ricalcola a mano almeno i due totali che contano | Rigenera allegando il file, o fai in Excel |
| **Fonti** | Le citazioni esistono? i link funzionano? la pagina dice davvero quello? | Apri il link. Se non c'è link, non è verificato |
| **Identificativi** | Codici, partite IVA, CAP, nomi, indirizzi | Confronto uno a uno con il gestionale |
| **Senso operativo** | Ha senso nel tuo contesto? (giacenze, orari di banchina, vincoli ADR, orari dogana) | Se ti sembra "strano", fidati del tuo istinto: è la tua esperienza che manca al modello |

Se dopo i quattro controlli resta un dubbio, la risposta giusta è: **non usarlo**. Un'ora di lavoro umano in più costa meno di un camion respinto in dogana.

## 2.5 Costruirti un "assistente logistico" stabile

Il salto di qualità non è imparare trucchi, è **smettere di rispiegare ogni volta il contesto**. Strumenti e modi, dal più semplice al più strutturato:

1. **Istruzioni personalizzate** (la voce "personalizza/Custom instructions" nella maggior parte delle app): 5-10 righe permanenti sul tuo ruolo, l'azienda, il tono, le regole ("usa il sistema metrico", "rispondi in italiano", "quando non sai, dillo", "conta i pallet europei 120x80").
2. **Progetti / cartelle con contesto**: un contenitore dove carichi i file stabili (listino vettori, procedure interne, template, glossario prodotti) e ogni chat dentro quel progetto li vede.
3. **Template di prompt salvati** (un file di testo, un documento condiviso, o i "prompt" salvati nella tua suite): riutilizzabili da te e dal collega.
4. **Aiutanti dedicati** ("GPT" personalizzati, Gem, assitenti): quando uno stesso compito si ripete, ci si costruisce l'assistente che ha già istruzioni + file + formato.
5. **Automazioni** (Parte 3, livello 3): quando il compito è stabile, frequente e verificabile.

Un esempio di istruzioni personalizzate per un ruolo logistico:

> Lavoro nella logistica di un'azienda che spedisce in Italia e UE, circa 300 spedizioni/mese su strada, con un po' di export extra-UE. Sono il referente trasporti e magazzino.
> Rispondi sempre in italiano. Scrivi in modo diretto e professionale, senza giri di parole e senza fronzoli.
> Quando ti chiedo un testo per un cliente o un vettore, usa un tono cordiale ma concreto, e metti in fondo le richieste come elenco numerato.
> Non inventare mai numeri, date, codici doganali, tariffe: se non li ho forniti io, scrivi [DA CONFERMARE].
> Sii esplicito sul tuo livello di sicurezza quando affermi qualcosa di normativo.
> Non usare anglicismi se esiste un termine italiano equivalente.

---

# Parte 3 — I casi d'uso reali in logistica

Ordinati per difficoltà: i primi li fai **la prima settimana**, gli ultimi richiedono dati e progetto.

## Livello 1 — Testo e comunicazione (settimana 1)

Non serve alcun dato aziendale. Rischio quasi zero, beneficio immediato. Sono il punto di partenza giusto per prendere mano.

### 1. Email difficili (il caso d'uso numero uno)
Ritardi, danni, porti chiusi, aumenti tariffa, richieste assurde, solleciti che non vuoi scrivere arrabbiato.
**Come:** racconta i fatti in punti (data, numero spedizione, cosa è stato promesso, cosa è successo, cosa vuoi ottenere) + il tono desiderato.
**Guadagno tipico:** l'email "che rimandi a domani" la scrivi in 4 minuti, e la versione "ferma ma non aggressiva" esce meglio di quella che scriveresti a caldo.
**Controllo:** date, numeri di spedizione, importi.

### 2. Traduzioni operative verso autisti e partner esteri
Non traduzioni letterarie: **istruzioni di carico comprensibili da un autista in 30 secondi**. Inglese semplice, francese e tedesco per i principali corridoi, italiano → lingue dell'Est.
**Come:** "Riscrivi queste istruzioni per un autista polacco che non parla italiano, inglese molto semplice, frasi corte, i punti critici in MAIUSCOLO, elenco numerato, aggiungi il numero di telefono di chi apre il cancello".
**Verifica:** fai rileggere da chi parla la lingua, almeno le prime volte.

### 3. Riassunti che producono azioni
Thread email da 30 messaggi, verbali di riunione con il cliente, capitolati di gara.
**Come:** "Da questo scambio estrai: decisioni prese, azioni con responsabile e scadenza, punti aperti, e le 3 domande che dovrei fare io. In una tabella."
**Guadagno tipico:** è il caso in cui si risparmia più tempo in assoluto.

### 4. Procedure e checklist
Istruzioni per l'imballaggio, sequenza di controllo prima della chiusura di un container, gestione resi, apertura/chiusura magazzino, controllo a campione su colli.
**Come:** detta tu i passaggi in modo disordinato, fatti restituire la procedura in passi numerati con "criterio di accettazione" per ogni passo, e poi le domande "cosa manca? quali errori fa la gente di solito qui?".
**Guadagno:** la conoscenza che hai in testa diventa un documento per i colleghi nuovi.

### 5. Prepara e chiudi le riunioni
Prima: "ecco i punti che devo discutere con questo vettore: prepara una scaletta d'ordine, gli obiettivi, e le 5 domande difficili che mi faranno".
Dopo: dagli appunti e fatti il verbale con decisioni e azioni.

### 6. FAQ e risposte ai clienti
"Quanto ci mettete a consegnare?", "dov'è il mio pacco?", "posso cambiare indirizzo?" → standardizza le risposte, poi costruisci la FAQ interna, così chi risponde al telefono non improvvisa.

### 7. Spiegare cose tecniche a pubblici diversi
Incoterms a un commerciale, ADR a un cliente, requisiti di imballaggio ad un fornitore estero. Chiedigli **la stessa cosa in tre livelli**: 2 frasi, 10 righe, mezza pagina.
Attenzione: su norme e Incoterms, verifica sempre sulla fonte ufficiale (ICC, ADR ufficiale, dogana).

---

## Livello 2 — Dati, file, numeri (dalle settimane 2-3)

Qui sali di valore ma entri nel territorio dove **il controllo umano è obbligatorio**. Prima leggi la Parte 4 (dati e sicurezza) e anonimizza.

### 8. Analisi di un file Excel di spedizioni
Il caso più richiesto: "non ho un report su questo".
**Come:** allega il file (o l'estratto dal TMS), chiedi prima la **fotografia** dei dati (quante righe, che colonne, che buchi), poi l'analisi.
Prompt di partenza:

> Ti allego un estratto del mio TMS con le spedizioni degli ultimi 3 mesi (colonne: data partenza, vettore, destinazione, colli, peso, data consegna prevista, data consegna effettiva, costo, note).
> Passo 1: dimmi cosa hai capito della struttura, quante righe, quali colonne hanno valori mancanti o formati strani. Non calcolare ancora nulla.
> Passo 2: calcola per vettore: numero spedizioni, ritardo medio in giorni, % spedizioni con ritardo > 1 giorno, costo medio per spedizione.
> Passo 3: mostrami una tabella ordinata dal peggiore al migliore e indicami le 3 anomalie che guarderesti per prime, con la riga di riferimento.
> Regola: non inventare valori mancanti, segnalali come "n/d" e dimmi quante righe sono escluse dai calcoli.

**Verifica obbligatoria:** fai gli stessi conti in Excel su due o tre vettori e confronta. Se i numeri coincidono, il resto è probabilmente affidabile; se non coincidono, scopri perché *prima* di usare il report.

### 9. Pulizia e normalizzazione dei dati
È il lavoro meno visibile e più utile: indirizzi scritti in cinque modi diversi, CAP sbagliati, "S.p.A." scritto "SPA", duplicati, tracking con lettere minuscole/maiuscole, pesi in kg e libbre mescolati.
**Come:** "Elenca i formati diversi che trovi nella colonna indirizzi e proponi una versione normalizzata per riga. Non cambiare nessun dato che non sia palesemente lo stesso valore."
**Utile:** chiedi anche il report dei casi ambigui, quelli dove non si può decidere senza chiamare il cliente.

### 10. Confronto tariffe e simulazione di costi
**Attenzione:** qui il modello tende a inventare. La regola è: **i tuoi numeri li metti tu, i conti li verifica Excel.**
**Come:** dagli una tabella di tariffe reali e chiedi *il ragionamento*: "spiegami quale vettore conviene per queste 10 spedizioni e perché, mostrando la formula che usi". Poi rifai il calcolo in Excel. Il valore sta nel costo totale di proprietà (fuel surcharge, supplementi, fermo, attesa, resi, gestione del reclamo), non nella tariffa nuda — e il modello è bravo a ricordarti le voci che avevi dimenticato.

### 11. Documenti: dall'OCR al controllo incrociato
CMR, DDT, packing list, POD, fattura commerciale, certificato di origine, dichiarazione export.
Due usi molto diversi:
- **Estrazione dati** (livello 2 in su): molti strumenti leggono un PDF e restituiscono i campi. Oggi i sistemi specializzati in logistica arrivano a accuratezze molto alte su documenti standard (nell'ordine del 99% su template noti), ma **calano sui documenti sporchi** (foto storte, timbri manoscritti, fax). Il controllo umano su documenti a valore fiscale o doganale resta d'obbligo.
- **Controllo incrociato** (fattibile in chat, valore alto): "confronta CMR, packing list e fattura: dimmi ogni discrepanza su colli, peso, descrizione, mittente/destinatario, e dove nel documento l'hai vista". Questo è il classico errore che blocca una spedizione, e l'AI è brava a trovarlo.

**Regola:** l'AI non *genera* documenti con valore legale. Li *controlla* e ti *prepara la bozza*, che tu validi.

### 12. Capire una regola senza chiamare il doganalista
Codici HS, Incoterms, documenti per un paese, requisiti di imballaggio, ADR.
**Come:** "spiegami cosa richiede X per Y, e **per ogni affermazione indicami la fonte ufficiale**. Se non hai fonti verificabili, dillo e non affermare nulla." Con la ricerca web attiva, pretendi i link e aprili.
**Perché funziona:** ti fa arrivare alla telefonata con il doganalista con le domande giuste invece che con zero. Non sostituisce la fonte.

### 13. Reportistica periodica e KPI
Report settimanale/mensile: OTIF, lead time medio, fill rate, costo per spedizione, tasso di danno, resi, accuracy di picking, dwell time.
**Come:** definisci **una volta** il formato (una tabella, una pagina, sempre uguale), salvi il prompt, e ogni settimana cambi solo il file allegato. Guadagno: da un'ora a dieci minuti.
**Attenzione alla definizione del KPI:** "OTIF" vuol dire cose diverse in aziende diverse. Scrivi la definizione nel prompt, altrimenti ti costruisce il KPI sbagliato con numeri giusti.

### 14. Turni, pianificazione e comunicazione interna
Non la vera ottimizzazione (quella richiede un motore di calcolo dedicato), ma tutto l'intorno: bozze di pianificazione da validare, avvisi al personale, comunicazioni in caso di straordinari, gestione delle ferie, turni di reperibilità.

---

## Livello 3 — Automazioni e sistemi (2-3 mesi)

Qui non stai più usando una chat: stai **cambiando un processo**. Serve un progetto, un controllo, e qualcuno che risponda degli errori.

### 15. Estrazione dati da documenti in volume
Se ricevi 200 POD/fatture a settimana, il collo di bottiglia è la digitazione. Soluzioni: funzioni OCR/AI dentro il gestionale, servizi dedicati ("intelligenza documentale"), o strumenti low-code.
**Criteri per decidere:** volume, varietà dei template, tolleranza all'errore (fattura = bassa tolleranza), costo per documento, cosa succede quando il documento è illeggibile (regola: deve finire in una coda di revisione umana, non essere indovinato).

### 16. Agenti sul browser e sulle email
Un "agente" è un AI che non solo scrive, ma **fa**: apre il portale del corriere, controlla uno stato, scarica un PDF, aggiorna una riga.
Cosa sanno fare oggi in modo affidabile: compiti brevi e verificabili (controlla 20 tracking, scarica i documenti di un elenco di spedizioni, compila un modulo sempre uguale).
Cosa non sanno fare: catene lunghe e aperte, siti con 2FA e anti-bot, casi ambigui. Serve supervisione e un limite di tentativi. **Non è ancora "fai tutto tu".**

### 17. Previsioni e ottimizzazione (attenzione: qui l'AI generativa è la cosa sbagliata)
Previsione della domanda, scorte di sicurezza, ottimizzazione dei giri, carico dei pallet: sono problemi di **machine learning classico e ricerca operativa**, esistono da decenni, e un LLM non è lo strumento adatto.
L'AI generativa serve **intorno**: preparare i dati, spiegare il risultato a chi non è tecnico, scrivere il report, simulare scenari in linguaggio naturale.

### 18. Integrazioni e flussi automatici
Email che arrivano → estrazione dati → scrittura nel gestionale; nuovo ordine → bozza di documenti di trasporto; tracking aggiornato → notifica al cliente. Strumenti tipici: gli strumenti low-code di automazione (Make, Zapier, n8n), gli EDI classici (DESADV, IFTMIN, INSDES), le API dei vettori e delle piattaforme di visibilità, gli strumenti come l'ambiente che stai già usando in questo momento (dashboard con strumenti, sessioni, pianificazioni).
**Regola d'ingaggio:** un'automazione senza coda di revisione umana è un incidente che aspetta il momento giusto.

### 19. Trattative e procurement
Preparazione di una gara trasporti: costruire il capitolato, la lista delle domande ai vettori, la griglia di valutazione, la simulazione del costo totale con scenari ("se i volumi crescono del 20% e il diesel del 10%, chi vince?"). Ottimo uso, a patto che i numeri siano tuoi.

### 20. Formazione e trasferimento di conoscenza
Il caso più sottovalutato: trasformare in documenti quello che il magazzino sa e nessuno ha mai scritto. Procedure, video-script, quiz per i nuovi, addestramento su ADR e sicurezza, manuali in più lingue.
Se hai un team, questa è l'attività con il miglior rapporto valore/sforzo.

---

# Parte 4 — Dati, riservatezza, responsabilità

Da leggere **prima** di usare dati veri. In logistica il problema è più serio che altrove, perché i dati operativi contengono quasi sempre **dati personali** (nome, indirizzo di consegna, telefono dell'autista, email dei referenti) e **informazioni commerciali riservate** (tariffe, volumi, clienti, marginalità).

## 4.1 Il confine chiaro

| Cosa mettere | Cosa non mettere |
|--------------|------------------|
| Descrizioni di casi **anonimizzati** | Anagrafiche complete di clienti, destinatari e autisti |
| Numeri **funzionali all'esempio** (non reali) | Listini, tariffe negoziate, margini, volumi per cliente |
| Template e procedure già pubblici | Contratti con nomi, allegati commerciali, dati doganali sensibili |
| Documenti **pubblici** (regolamenti, norme) | Documenti dell'azienda di terzi senza autorizzazione |
| Dati aggregati e non riconducibili | Categorie particolari (salute, ecc.): non metterle mai |

E l'ovvietà che molti dimenticano: **quello che incolli in un servizio cloud esce dalla tua azienda**. Le policy dei fornitori cambiano, i piani "aziendali" hanno protezioni diverse da quelli gratuiti. Se usi ChatGPT/Claude/Gemini per lavoro **con dati aziendali, fallo con l'account e il piano approvati dall'azienda**, non con quello personale.

## 4.2 Anonimizzare in tre mosse

1. **Sostituisci i nomi**: `Cliente A`, `Vettore 1`, `Destinatario X`. E anche i riferimenti indiretti ("il nostro cliente più grande in Veneto" → "un cliente del Nord-Est").
2. **Taglia la granularità**: "via Verdi 45, 20121 Milano" → "Milano"; "14.320 kg" → "circa 14 t"; importi esatti → fasce ("tra 800 e 1.000 €").
3. **Togli gli identificativi**: partite IVA, codici EORI, MRN, numeri di tracking, email, telefoni → `[CODICE]`, `[EMAIL]`. Se ti serve come esempio di formato, inventane uno chiaramente falso.

Se stai costruendo un report o un promemoria che deve contenere dati veri, l'ordine giusto è: **l'AI fa la struttura sul caso finto, tu riempi con i dati veri.**

## 4.3 Chi risponde se sbaglia

Tu, e l'azienda. Non c'è modo di scaricare la responsabilità su un modello. Conseguenze pratiche:

- nei documenti che escono (email, DDT, dichiarazioni) la firma resta umana: metti un controllo prima dell'invio;
- se l'errore genera un danno economico, il problema non è "l'AI sbaglia" ma "il processo non prevedeva un controllo";
- l'AI Act europeo introduce obblighi aggiuntivi in base al contesto d'uso, e su dati personali si applica il GDPR con la sua catena di responsabilità; in molti usi professionali servono **trasparenza** e **supervisione umana documentata**. Non serve diventare giuristi: serve che quando usi l'AI su qualcosa che ha effetti su una persona o su un contratto, **ci sia un passaggio umano tracciabile**.

## 4.4 La policy minima (fac-simile in una pagina)

Da proporre al tuo capo, anche se non sei tu il responsabile:

> **Uso degli strumenti di intelligenza artificiale generativa — regole interne**
> 1. Si usano solo gli strumenti aziendali approvati (elenco: …). Vietati account personali con dati aziendali.
> 2. Non si inseriscono dati personali di clienti, destinatari, dipendenti e autisti, né tariffe, listini, margini e contratti.
> 3. Se serve un caso reale, va anonimizzato secondo le regole qui allegate (nomi → codici, indirizzi → città, importi → fasce).
> 4. Ogni testo che esce dall'azienda (email, offerta, documento) è verificato da una persona prima dell'invio. I numeri sono ricalcolati.
> 5. L'AI non genera documenti con valore legale o fiscale: produce bozze e controllo incrociato, la validazione è umana.
> 6. Ogni automazione (livello 3) richiede: descrizione del processo, punto di controllo umano, responsabile, procedura in caso di errore.
> 7. Segnalazione: chi rileva un errore o un uso improprio lo comunica a …

---

# Parte 5 — Percorso pratico di 21 giorni

Mezz'ora al giorno, su lavoro vero. Non è un corso da guardare: è un elenco di compiti. Se un giorno salta, non recuperare: continua dal successivo.

**Prima di iniziare (10 minuti):** apri l'account approvato, compila le istruzioni personalizzate (paragrafo 2.5), crea una cartella `AI-logistica` con dentro i tuoi template e il file anonimizzato di esempio.

| Giorno | Cosa fai (30 min) | Cosa ti resta in mano |
|--------|-------------------|------------------------|
| 1 | Leggi la Parte 1. Poi chiedi all'AI di spiegarti, con parole tue, cosa sono token e finestra di contesto | Il modello mentale |
| 2 | Prendi un'email vera che hai rimandato. Scrivila con la formula in 6 pezzi | Un template di email difficile |
| 3 | Traduci istruzioni di carico in inglese semplice per autista straniero. Confrontale con una tua versione | Template bilingue |
| 4 | Chiedi di sintetizzare un thread lungo in decisioni / azioni / scadenze | Un formato di sintesi riusabile |
| 5 | Detta i passaggi di un'attività del magazzino e fatti scrivere la procedura con criteri di accettazione | Una procedura per i nuovi |
| 6 | Chiedi la stessa spiegazione (es. Incoterm DAP) in 3 livelli di lunghezza | Capacità di adattare il registro |
| 7 | **Revisione**: rileggi la Parte 2. Quanti dei 7 errori hai fatto? | Consapevolezza |
| 8 | Leggi la Parte 4. Scrivi la tua regola di anonimizzazione in 5 righe | Regola personale sui dati |
| 9 | Prendi un file di spedizioni (anonimizzato), fai il "passo 1": struttura e qualità dei dati | Prima fotografia dei dati |
| 10 | Stesso file: calcoli per vettore. Poi **ricalcola 3 righe in Excel** e confronta | Fiducia tarata sul dato |
| 11 | Pulizia: normalizza colonna indirizzi e produci il report dei casi ambigui | Un lavoro noioso fatto una volta |
| 12 | Confronto tariffe: fai spiegare il ragionamento, poi rifai i conti in Excel | Un metodo "AI propone / Excel verifica" |
| 13 | Controllo incrociato: CMR vs packing list vs fattura, elenco discrepanze | Una tecnica ad alto impatto |
| 14 | **Revisione**: confronto settimana 1 vs settimana 2. Cosa è entrato nella tua routine? | Bilancio |
| 15 | Report KPI: definisci formato e definizioni, salva il prompt come template | Un template di report |
| 16 | Definisci un KPI che stai misurando male (es. OTIF). Chiedi 3 definizioni alternative e scegli | Chiarezza sulla misura |
| 17 | Norma/incoterm: fai una ricerca con fonti, apri i link, verifica. Scopri dove l'AI sbaglia | Abitudine alla fonte |
| 18 | Trattativa: fai da sparring partner. Fatti fare le 5 domande difficili del vettore | Preparazione a una negoziazione |
| 19 | Formazione: trasforma una cosa che sai in test per i nuovi (10 domande + risposte) | Materiale per il team |
| 20 | Mappa un compito ripetitivo e decidi: resta umano, si automatizza, o diventa un template? | Un caso d'uso da proporre |
| 21 | Scrivi il tuo **manuale personale**: 1 pagina con istruzioni, i 5 template che usi, le regole sui dati, i 3 casi d'uso già attivi | Il tuo manuale, non questa guida |

**Come misurare che sta funzionando** (misura *prima* e *dopo*, altrimenti resta un'impressione):

- ore/settimana spese su scrittura, reportistica, solleciti e controllo documenti;
- tempo medio di risposta a clienti e vettori;
- errori evitati o presi prima (discrepanze trovate, rendiconti corretti, DDT rifatti);
- quante volte hai dovuto rifare un lavoro perché il risultato non era verificabile (questo numero deve **scendere**).

Se dopo tre settimane i minuti risparmiati sono pochi e le verifiche ti costano più del lavoro che facevi prima, hai scelto i casi d'uso sbagliati. Torna al livello 1.

---

# Parte 6 — Restare aggiornati senza farsi vendere fumo

## 6.1 Cosa sta succedendo davvero nel settore (settembre 2026)

Il quadro, in breve, per non arrivare impreparato a una riunione:

- **Non è più fase pilota.** Nella logistica l'AI è entrata nei processi quotidiani: pianificazione dei trasporti, definizione dei prezzi, procurement, visibilità delle spedizioni. Le indagini di settore (Transporeon Transportation Pulse Report e analoghi) mostrano adozione in crescita ma molto disomogenea: pianificazione e ottimizzazione dei trasporti sono le aree più mature, mentre buona parte delle aziende è ancora in fase iniziale.
- **I grandi operatori l'hanno messa a bilancio.** Kuehne+Nagel, UPS, DHL, DSV, CMA CGM, Geopost dichiarano piani di produttività basati su AI con risparmi misurati. Questo significa che i tuoi clienti e vettori grandi la stanno già usando nei loro processi: le tue tariffe e i tuoi tempi verranno confrontati con macchine.
- **I documenti sono il caso d'uso più concreto.** Estrazione automatica da DDT, CMR, packing list, POD e documenti doganali: il vero valore è **avere il dato affidabile**, non il documento digitale di per sé. Attenzione agli specialisti che promettono accuratezze altissime: le hanno su template noti e documenti puliti, non su tutto.
- **Gli agenti stanno maturando in fretta.** Sistemi che eseguono azioni dentro i portali e nei sistemi aziendali sono passati dalla demo alla produzione. Il limite tipico non è più "non capisce la pagina" ma **2FA, anti-bot, interfacce aziendali sconosciute e task lunghi**. Quindi: deleghei compiti brevi e verificabili, non interi processi.
- **Le piattaforme si comprano ogni cosa.** I grandi vendor del trasporto stanno integrando un agente dentro il proprio sistema operativo (es. i "copilot" e gli agent integrati nei TMS/WMS). Per te la conseguenza è: **prima di comprare un software "AI", guarda cosa ti dà già il tuo gestionale.**

## 6.2 Come valutare un "software AI per la logistica" in 20 minuti

Sei domande, da fare al fornitore senza sconti:

1. **Che problema risolve, in una frase senza la parola AI?** Se non c'è risposta, non c'è problema.
2. **Che dati gli devo dare, in che formato, e dove finiscono?** Server, paese, conservazione, chi li vede, cosa succede se chiedo la cancellazione.
3. **Che succede quando sbaglia?** C'è una coda di revisione umana? Come la vedo? Quanti errori fa su 100 documenti *miei* (non *i suoi* di demo)?
4. **Che accuratezza misurata, su quale campione, definita come?** (una "accuratezza del 99,8%" senza definizione è marketing).
5. **Cosa devo fare io per mantenerlo** quando cambia un template, un vettore, un cliente?
6. **Come esco?** I dati restano miei, esportabili, in formato aperto?

E una prova pratica obbligatoria: **fatti fare un test sui tuoi 20 documenti più brutti**, non sulla demo con i documenti belli.

## 6.3 Dove guardare (e come filtrare)

- **Fonti primarie quando si parla di norme**: dogana, ICC per gli Incoterms, il testo ADR, i regolamenti UE. L'AI ti serve per *capire*, non per *decidere*.
- **Blog e newsletter dei grandi del settore** e delle piattaforme di visibilità: utili per capire dove soffia il vento, ma sono parte interessata.
- **Il tuo gestionale/TMS/WMS**: quasi sempre la novità che ti serve è una funzione che hai già in abbonamento e non usi.
- **Filtro anti-fuffa**, in tre domande: il numero citato ha un campione e un metodo? la fonte guadagna se ci credo? la cosa si può provare su *un mio* caso piccolo, questa settimana?

## 6.4 Le cinque trappole in cui cadono i professionisti

1. **Fidarsi perché la risposta è ben scritta.** La forma fluente non è un certificato di verità.
2. **Delegare i numeri.** Il modello non calcola: compone. Ricalcolo sempre.
3. **Incollare tutto "tanto è lavoro".** Anagrafiche, tariffe e contratti sono esattamente ciò che non va incollato.
4. **Comprare uno strumento prima di avere il processo.** Prima si scrive come deve funzionare (con carta e matita), poi si automatizza.
5. **Credere che il vantaggio sia il software.** Il vantaggio è che *tu* sai quali domande fare, quali dati servono e dove si annida l'errore. Il software lo compra chiunque.

---

# Appendice A — Dieci prompt pronti

Sostituisci i `[...]`. Salvali in un file tuo, non riaprirli da capo ogni volta.

### A1. Sollecito ritardo al vettore
```
Sei un responsabile trasporti. Scrivi un'email al vettore [VETTORE] per la spedizione
[CODICE] da [ORIGINE] a [DESTINAZIONE] ([N] colli, [PESO]), consegna prevista
[DATA PREVISTA], ancora in [STATO ATTUALE] al [LUOGO].
Il cliente ha segnalato: [CONSEGUENZA].
Massimo 120 parole, con oggetto, tono fermo ma collaborativo. Tre richieste numerate:
nuova data certa, referente operativo da contattare, POD entro la consegna.
Non minacciare recesso, non promettere risarcimenti. Dove manca un dato scrivi [DA CONFERMARE].
```

### A2. Reclamo danno con richiesta documenti
```
Scrivi un reclamo per merce danneggiata sulla spedizione [CODICE], consegnata il [DATA].
Danni riscontrati: [DESCRIZIONE]. Colli: [N] su [N totali]. Foto e riserve già inviate: [SI/NO].
Struttura: fatti in 3 righe, richiesta di documentazione (rapporto di consegna con riserve,
verbale del vettore, esito della verifica), termini entro cui rispondere, frase di
apertura a soluzione. Tono: professionale e fermo, senza aggressività.
Numero massimo 180 parole. Non quantificare i danni.
```

### A3. Istruzioni di carico per autista straniero
```
Riscrivi queste istruzioni per un autista [NAZIONALITÀ] che non parla italiano.
Inglese molto semplice, frasi sotto le 12 parole, elenco numerato, i punti critici in
MAIUSCOLO. Includi: orario di arrivo, dove presentarsi, cosa NON può fare, chi chiamare.
Aggiungi la stessa cosa in [LINGUA MADRE DELL'AUTISTA] con l'avvertenza che in caso di
dubbio prevale l'inglese.
Istruzioni: [TESTO]
```

### A4. Sintesi di un thread in azioni
```
Ti incollo uno scambio email. Estrai una tabella con: decisioni prese, azioni
(cosa, chi, entro quando), punti aperti, rischi. Poi, fuori tabella, le 3 domande che
dovrei fare io per chiudere la questione. Non aggiungere informazioni che non ci sono:
se un responsabile o una data non sono indicati, scrivi "da assegnare".
Email: [TESTO]
```

### A5. Procedura operativa da conoscenza informale
```
Ti descrivo come facciamo una cosa in magazzino, in ordine sparso. Trasformalo in una
procedura: passi numerati, per ogni passo il criterio di accettazione, i materiali/attrezzi
necessari, i rischi di sicurezza, i 3 errori più comuni e come accorgersene.
Alla fine elencami le informazioni che ti mancano per completarla.
Descrizione: [TESTO]
```

### A6. Analisi spedizioni (prima la struttura, poi i numeri)
```
Ti allego un file di spedizioni ([PERIODO], colonne: [COLONNE]).
Passo 1: descrivi la struttura del file, quante righe, valori mancanti e formati anomali.
Non calcolare ancora nulla.
Passo 2: calcola per [VETTORE/TRATTA]: numero spedizioni, ritardo medio in giorni,
% con ritardo superiore a [N] giorni, costo medio.
Passo 3: tabella ordinata dal peggiore al migliore + le 3 anomalie che guarderesti per
prime, con il riferimento della riga.
Regole: non inventare valori mancanti (usa "n/d"), dichiara quante righe escludi dai
calcoli, e non trarre conclusioni oltre i dati che hai.
```

### A7. Report KPI settimanale (template fisso)
```
Produci il report settimanale trasporti usando ESATTAMENTE questo formato:
1) Sintesi in 3 punti  2) Tabella KPI (OTIF = [DEFINIZIONE ESATTA], lead time medio,
costo per spedizione, % resi, tasso di danno) con colonna variazione vs settimana
precedente  3) Top 3 problemi  4) Azioni proposte (max 3, con responsabile).
Non commentare ciò che non è nei dati. Dati: [INCOLLA TABELLA]
```

### A8. Controllo incrociato documenti
```
Ti incollo tre documenti della stessa spedizione: CMR, packing list, fattura.
Elenca OGNI discrepanza su: mittente, destinatario, colli, peso lordo/netto, descrizione
merce, riferimenti, data. Per ogni discrepanza indica in quale documento l'hai vista e
cita il testo esatto. Se i tre documenti concordano su un campo, elencalo una volta come
"coerente". Non correggere nulla: segnala soltanto.
```

### A9. Norma o tema tecnico con obbligo di fonti
```
Domanda: [ES. quali documenti servono per una cessione intra-UE di ...]
Rispondi solo se hai fonti ufficiali verificabili. Per ogni affermazione indica la fonte
(nome, ente, link) e la data di riferimento. Alla fine elenca separatamente: (a) ciò che
non hai potuto verificare, (b) le domande che dovrei fare al mio doganalista/spedizioniere,
(c) i casi in cui la regola cambia in base al prodotto o al paese.
```

### A10. Sparring partner per una trattativa
```
Fai il referente del vettore [VETTORE] in una trattativa sul rinnovo tariffe.
Il tuo obiettivo: aumento del [X]% e revisione delle penali. Il mio: [OBIETTIVO].
Fammi le domande più difficili, una alla volta, e dopo ogni mia risposta dimmi come un
negoziatore esperto replicherebbe. Alla fine dammi: le 5 concessioni che posso fare
senza perdere, i 3 punti su cui non cedere, e le informazioni che mi mancano.
Non inventare cifre di mercato: chiedimele.
```

---

# Appendice B — Glossario minimo

**Agente** — AI che non si limita a scrivere ma esegue azioni (apre pagine, compila, scarica). Affidabile su compiti brevi e verificabili.
**ADR** — Accordo per il trasporto di merci pericolose su strada: classi, codici UN, numeri Kemler, documenti.
**Allucinazione** — Informazione inventata ma plausibile. Strutturale, non un bug temporaneo.
**Anonimizzare** — Rendere un dato non riconducibile (nomi→codici, indirizzi→città, importi→fasce) prima di darlo all'AI.
**ASN** — Advance Shipping Notice: preavviso elettronico di spedizione.
**CMR** — Lettera di vettura internazionale su strada; conta ai fini della responsabilità del vettore.
**Contesto (finestra di)** — La memoria di lavoro del modello: grande ma limitata, si esaurisce.
**DDT** — Documento di trasporto; accompagna la merce e ha rilevanza fiscale.
**Demurrage / detention** — Costi per sosta del container in porto / per il contenitore tenuto oltre i termini.
**e-CMR** — Versione digitale della lettera di vettura.
**EDI** — Scambio elettronico di documenti tra sistemi (ordini, DESADV, fatture).
**Fine-tuning** — Ulteriore addestramento di un modello su dati specifici. Raramente serve a un utente business.
**Groupage (LTL)** — Più spedizioni condivise sullo stesso mezzo, contro il carico completo (FTL).
**Hallucination rate / accuratezza** — Misure che vanno sempre chieste con *definizione*, *campione* e *tipo di documento*.
**HS / TARIC** — Nomenclatura doganale (internazionale / UE) per classificare le merci: codice, aliquota, requisiti.
**Incoterms** — Regole ICC che distribuiscono costi, rischi e obblighi documentali tra venditore e compratore (EXW, FCA, CIP, DAP, DDP…).
**LLM** — Large Language Model: il modello che genera testo.
**MRN** — Movement Reference Number, numero del documento doganale.
**OCR / IDP** — Riconoscimento ottico dei caratteri / elaborazione intelligente dei documenti (estrazione dati da PDF e scansioni).
**OTIF** — On Time In Full: percentuale di ordini consegnati puntuali e completi. Va sempre definita.
**POD** — Proof of Delivery: prova di avvenuta consegna.
**Prompt** — Tutto ciò che dai al modello: istruzioni, contesto, dati, formato, esempi.
**RAG** — Recupero di documenti pertinenti e loro inserimento nel contesto, per rispondere su basi documentali aziendali.
**Supervisione umana** — Il passaggio di controllo previsto per legge e per buon senso, prima che l'output produca effetti.
**Token** — Unità minima di testo per il modello (~4 caratteri).
**TMS / WMS** — Sistemi di gestione trasporti / magazzino.

---

## Chiusura: le dieci cose da ricordare

1. L'AI **non conosce** il tuo lavoro: il valore lo porti tu col contesto.
2. Il suo output è **una bozza**, mai una decisione.
3. Su **numeri, codici e norme**: ricalcola, verifica la fonte, o non usarlo.
4. **Parla come a un collega nuovo**: ruolo, contesto, dati, formato, vincoli, esempio.
5. **Chiedi cosa non sa** e autorizza il `[DA CONFERMARE]`: è il freno più efficace alle invenzioni.
6. **Itera**: la prima risposta serve a capire quale era la domanda.
7. **Fissa i template**: il tempo si risparmia alla decima volta, non alla prima.
8. **I dati si anonimizzano** prima, non dopo. E si usano solo strumenti approvati.
9. **Automatizza il compito, tieni la decisione.** Se l'errore è visibile prima, delega; se esce subito nel mondo, no.
10. Il tuo vantaggio non è lo strumento: sono **i tuoi dati, i tuoi vincoli e la tua capacità di accorgerti dell'errore**.

---

*Documento redatto il 23 settembre 2026. Gli strumenti e le funzionalità citate cambiano in fretta: verifica sempre la versione in uso prima di dare per scontata una funzione. Nessuna affermazione di questa guida sostituisce una fonte normativa ufficiale (dogana, ICC, testo ADR, regolamenti UE).*
