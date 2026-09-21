> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# StyleDNA — calibrazione parametrica dello stile

Vettore di **12 dimensioni** (valore 1-10) che definisce quantitativamente la prosa. Funziona come un equalizzatore: ogni asse governa un aspetto. Consultalo **prima di ogni capitolo** come istruzione operativa, non come gabbia: puoi deviare per una scena, ma la *media* del capitolo rispetta i parametri.

**StyleDNA vs. impronta della voce (BSR).** Lo StyleDNA è il pannello di **manopole**: il vettore numerico e i suoi bersagli. Il *timbro vivo* — frasi-campione, idioletto, tic, registro dei dialoghi, campi metaforici — vive invece in `voice_fingerprint` del BSR (`references/stato-bsr.md`), che lo StyleDNA alimenta ma non duplica. Regola: il vettore sta nello StyleDNA, le note qualitative nel `voice_fingerprint`. Una sola fonte per ciascuna cosa.

## I 12 parametri e la semantica dei valori

| # | Parametro | 1 | 5 | 10 |
|---|---|---|---|---|
| 1 | **SENTENCE_LENGTH** | Frasi secche (≤8 parole), Hemingway | Media 15-18 parole | Periodi lunghi (25+), Proust, Saramago |
| 2 | **SYNTAX_COMPLEXITY** | Solo coordinate, punteggiatura minima | Subordinate moderate | Ipotassi profonda, incisi dentro incisi |
| 3 | **RHYTHM_VARIATION** | Frasi tutte uguali | Alternanza prevedibile | Contrasto forte: 3 parole → periodo di 40. Jazz sintattico |
| 4 | **VOCABULARY_RICHNESS** | Lessico <2000 parole base | Medio, qualche termine ricercato | Lessico raro, arcaismi scelti, verbo preciso |
| 5 | **REGISTER_LEVEL** | Parlato, gergale, contrazioni | Professionale, accessibile | Letterario, formale, solenne |
| 6 | **FIGURATIVE_DENSITY** | Zero figure, prosa funzionale | Una metafora ogni 2-3 paragrafi | Ogni frase ha un livello figurativo |
| 7 | **SHOW_VS_TELL** | Dichiarativo ("Era triste") | Mix bilanciato | Tutto incarnato: emozioni nel corpo, concetti in storie |
| 8 | **SENSORY_DEPTH** | Solo visivo basico | Vista + 1-2 sensi | Tutti i sensi: olfatto, tatto, propriocezione |
| 9 | **DIALOGUE_WEIGHT** | Narrazione pura, quasi zero dialogo | 30-40% dialogo | 60%+, avanza per bocca dei personaggi |
| 10 | **EMOTIONAL_TEMP** | Distaccato, analitico, freddo | Emozioni controllate | Viscerale, impatto fisico nel lettore |
| 11 | **SUBTEXT_DENSITY** | Tutto esplicito | Il non-detto esiste ma il detto prevale | Iceberg hemingwayano, leggere tra le righe |
| 12 | **AUTHORIAL_PRESENCE** | Narratore invisibile | Voce discreta | Voce forte, opinioni, digressioni (Ferrante, Franzen) |

Vettore compatto: `SL|SC|RV|VR|RL|FD|ST|SD|DW|ET|SUB|AP`

**Assi alti, attenzione doppia.** Quando spingi in alto FIGURATIVE_DENSITY, AUTHORIAL_PRESENCE o SUBTEXT, cresce il rischio di *purple prose*: è lì che il modello, scegliendo la metafora più probabile, scivola nel manierismo AI. Più questi assi salgono, più contano «la scelta non più probabile» e i controlli sul manierismo (`references/scrittura.md`, `references/anti-ai.md`). Per la **fantascienza letteraria** usa il preset 🚀 FANTASCIENZA e ritocca; per un noir più cupo, parti da 🕵️ NOIR o 🖤 DARK LITERARY (versione sana) senza riportare ST/SUB sopra il tetto.

## Profili Preset (assegnali automaticamente in Fase 1 in base al genere)

```
— FICTION —
📖 NARRATIVO CLASSICO    SL:7 SC:6 RV:7 VR:7 RL:6 FD:6 ST:7 SD:7 DW:5 ET:7 SUB:6 AP:6
🚀 FANTASCIENZA          SL:5 SC:5 RV:6 VR:7 RL:6 FD:5 ST:6 SD:8 DW:5 ET:6 SUB:6 AP:5
🕵️ NOIR / HARDBOILED     SL:4 SC:4 RV:6 VR:6 RL:5 FD:5 ST:6 SD:6 DW:6 ET:6 SUB:6 AP:7
⚡ THRILLER/PAGE-TURNER   SL:4 SC:3 RV:6 VR:4 RL:3 FD:3 ST:7 SD:5 DW:7 ET:8 SUB:5 AP:3
👻 HORROR / WEIRD        SL:5 SC:5 RV:7 VR:6 RL:6 FD:6 ST:7 SD:8 DW:4 ET:6 SUB:7 AP:5
🏰 EPIC FANTASY          SL:7 SC:6 RV:7 VR:7 RL:5 FD:7 ST:7 SD:7 DW:5 ET:6 SUB:5 AP:5
🏛️ ROMANZO STORICO       SL:7 SC:6 RV:6 VR:8 RL:7 FD:6 ST:6 SD:7 DW:5 ET:6 SUB:5 AP:6
🖤 DARK LITERARY         SL:6 SC:7 RV:7 VR:8 RL:7 FD:7 ST:7 SD:8 DW:4 ET:8 SUB:6 AP:7
🔮 REALISMO MAGICO       SL:7 SC:7 RV:7 VR:7 RL:6 FD:8 ST:7 SD:8 DW:4 ET:7 SUB:7 AP:7
💕 ROMANCE CONTEMPORANEO SL:4 SC:3 RV:5 VR:4 RL:3 FD:5 ST:7 SD:4 DW:8 ET:8 SUB:5 AP:5
🌟 YOUNG ADULT           SL:4 SC:4 RV:6 VR:5 RL:3 FD:5 ST:7 SD:5 DW:8 ET:8 SUB:4 AP:5
😄 COMMEDIA/UMORISTICO   SL:4 SC:4 RV:7 VR:6 RL:4 FD:5 ST:6 SD:5 DW:7 ET:7 SUB:4 AP:7
👶 BAMBINI/MIDDLE GRADE  SL:3 SC:2 RV:6 VR:3 RL:2 FD:5 ST:7 SD:6 DW:7 ET:7 SUB:2 AP:4
— NON-FICTION —
🧠 SAGGISTICA AUTOREVOLE SL:5 SC:5 RV:6 VR:6 RL:6 FD:4 ST:5 SD:3 DW:2 ET:4 SUB:3 AP:8
💡 SELF-HELP ACCESSIBILE SL:4 SC:3 RV:5 VR:4 RL:3 FD:4 ST:6 SD:2 DW:4 ET:6 SUB:2 AP:7
📚 MANUALE TECNICO       SL:5 SC:4 RV:4 VR:7 RL:7 FD:2 ST:4 SD:1 DW:1 ET:2 SUB:1 AP:5
🎙️ MEMOIR/AUTOBIOGRAFIA  SL:5 SC:5 RV:7 VR:6 RL:4 FD:5 ST:7 SD:6 DW:5 ET:8 SUB:5 AP:9
```

### Tetti di salute (lezione imparata su questo progetto)
In ogni preset valgono tre tetti: **ST ≤ 7, SUB ≤ 7, RV ≤ 7**. Motivo: ST a 8-9 significa di fatto «mai nominare un'emozione» e SUB a 8-9 «massimizzare il non-detto ovunque» — è la ricetta della prosa fredda, trattenuta e oscura. Lo StyleDNA originale di questo libro era `ST:9 SUB:8 RV:9` e i capitoli risultavano **«anglo-tradotto»** allo script: prova diretta che il tetto serve. FD alto (8) resta solo dove il genere lo giustifica davvero (realismo magico), e sempre con la guardia del «passo della sorpresa» e della chiarezza. La grande letteratura è **chiara**: un preset «letterario» non deve mai essere più oscuro di uno commerciale.

### Deroga verificata (l'unico modo di superare un tetto)
I tetti sono il default su qualunque modello. Se il progetto vuole spingere un asse oltre, la deroga si *guadagna*, non si dichiara: 1) scrivi una scena-prova rappresentativa (≥600 parole) al valore desiderato; 2) passala da `scripts/stylometry.py`; 3) la deroga è concessa solo se `italian_register.severity` = ok e nessuna spia `llm_tics` è sopra soglia, **e** l'utente, riletta la scena, la conferma chiara e viva. Se concessa, annota nel BSR: valore in deroga nel vettore + riga in `styledna.vector_note` («ST:8 in deroga — scena-prova Cap.X Sc.Y, modello Z»). La deroga vale per il modello che ha superato la prova: se la penna passa a un modello diverso, ri-verifica al primo capitolo. Se la prova fallisce, il tetto resta: è il testo a decidere, non l'etichetta del modello.

## Tre modalità di attivazione

**A) Preset** — L'utente sceglie un profilo, carichi i 12 valori.
**B) Personalizzato** — L'utente modifica singoli assi. Mostra il vettore con barre visive:
```
🎛️ IL TUO STYLEDNA
Lunghezza frasi:     ████████░░  8
Variazione ritmo:    █████████░  9
... (un asse per riga)
```
**C) Clone Style** — Estrazione da un testo campione (vedi sotto).

## Protocollo Clone Style (comando `/clone`)

L'utente carica un testo di riferimento. Analisi in due fasi:

**Fase 1 — Quantitativa (eseguibile).** Lancia lo script canonico:
```
python scripts/stylometry.py <file_campione> --lang it --json
```
Lo script restituisce **già i 5 assi quantitativi calibrati 1-10** in `styledna_quantitative_suggestion` (SL, SC, RV, VR, DW): usali direttamente, niente conversioni a mano. Per riferimento, le bande: SL da ASL (≤8→1-2 · 13-18→5 · ≥25→9-10), DW da % dialogo (35%→4-5 · 60%→8). **Vocabolario**: per `VR` su un singolo campione vale la TTR, ma per confrontare capitoli fra loro (e per la `stylometry_baseline` del BSR) usa la **MATTR** nel blocco `baseline`, che non dipende dalla lunghezza. Su campioni < 300 parole la TTR sovrastima: prendi un brano più lungo.

**Fase 2 — Qualitativa (tu, dopo aver letto il testo).** I 6 assi non misurabili: REGISTER_LEVEL, SHOW_VS_TELL, SENSORY_DEPTH, EMOTIONAL_TEMP, SUBTEXT_DENSITY, AUTHORIAL_PRESENCE.

**Output:**
```
📊 STYLEDNA CLONATO da: [Titolo/Autore]
SL:_ SC:_ RV:_ VR:_ RL:_ FD:_ ST:_ SD:_ DW:_ ET:_ SUB:_ AP:_

📝 NOTE QUALITATIVE:
- Campo metaforico prevalente: [...]
- Tic stilistici: [intercalari, costruzioni ricorrenti]
- Registro dialogo: [...]
- Punteggiatura particolare: [...]
- Ritmo dominante: [...]

⏸️ Vuoi usare questo StyleDNA? Puoi modificare singoli parametri.
```

Salva il vettore finale nello StyleDNA della Scheda Strategica, e versa le **note qualitative** (campo metaforico, tic, registro dialogo, ritmo) nel `voice_fingerprint` del BSR — è lì che vivono, non in una nota parallela.
