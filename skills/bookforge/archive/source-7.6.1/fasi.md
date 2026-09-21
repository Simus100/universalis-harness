> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# Fasi: Scheda Strategica (1), Indice (3), Revisione (5)

## Fase 1 — Questionario strategico → Scheda Strategica (`/scheda`)

**Comportamento**: domande a gruppi di 3-4, non meccaniche — commenta, suggerisci, migliora, segnala incoerenze, trasforma il vago in concreto, aiuta col titolo. Raccogli solo i dati essenziali (Progressive UX); la calibrazione StyleDNA a 12 assi avviene in Fase 4.

**Blocco unico — fondamenta del libro** (3 dati): 1) Tipo e genere, 2) Idea di fondo (trama/argomento centrale), 3) Target (età, interessi, livello). Da questi imposti automaticamente un titolo provvisorio, la promessa al lettore e un **preset StyleDNA** coerente col genere (`references/styledna.md`).

**Protocollo "Non so"** (fallback, non insistere sulla stessa domanda):
- *Target* → a) esperti che cercano approfondimento, b) principianti, c) intrattenimento, d) pubblico specifico
- *Tono* → a) amico al bar, b) documentario Netflix, c) manuale universitario elegante, d) TED Talk
- *Promessa* → dopo il libro il lettore: a) sa fare qualcosa, b) ha cambiato idea, c) ha vissuto un'emozione, d) ha un riferimento
- *Struttura* → a) percorso lineare, b) capitoli indipendenti, c) storia con personaggi, d) manuale con esercizi
- *Genere* → proponi 3-4 generi compatibili
- *Riferimenti* → "l'ultimo libro che ti è piaciuto? cosa del suo stile?"

**Output:**
```
📋 SCHEDA STRATEGICA DEL LIBRO (Base)
Titolo provvisorio: [...]
Genere: [...] · Idea di fondo: [...] · Target: [...]
Promessa implicita: [da Idea + Target] · Lingua: [rilevata]

═══ STYLEDNA PRESET ═══
Profilo assegnato: [preset coerente col genere]
(La personalizzazione dei 12 assi verrà proposta prima di scrivere)

═══ BSR ═══
Stato: Inizializzato · Metadata_Vault: [in attesa Fase 2 per keyword/categorie]
```
⏸️ Conferma prima della Fase 2.

## Fase 3 — Creazione indice (`/indice`)

Consulta `references/generi.md` per le convenzioni del genere.

**Includi**: titolo+sottotitolo, introduzione (con obiettivo), capitoli con sottocapitoli, obiettivo e funzione di ogni capitolo, progressione logica, appendici/checklist/CTA (se applicabili), conclusione. Per la **fiction** aggiungi scheda personaggi, timeline, mappa sottotrame.

**Formato per capitolo:**
```
Capitolo [N]: [Titolo]
├── Obiettivo: [cosa il lettore impara/vive]
├── Funzione: [didattica / narrativa / emotiva / di transizione]
├── Sottocapitoli: [N.1] [N.2] [N.3]
└── Progressione: [collegamento col cap. precedente e successivo]
```

**Strutture alternative**: proponi almeno 1 (fino a 3): Commerciale (più vendibile) · Approfondita (più completa) · Breve/pratica (più snella).

**Criteri di qualità** (verifica): completezza, progressione, equilibrio dei capitoli, interesse, coerenza con target/tono/genere, differenziazione dai competitor, mantenimento della promessa.

⏸️ Conferma. Poi chiedi il **livello di granularità della scrittura** (commutabile in qualsiasi momento con `/granularita`):
```
📐 Quanto controllo vuoi nella scrittura?
   L1) Capitolo — scrivo il capitolo intero con scaletta macro (veloce, efficiente)
   L2) Scena    — definiamo e scriviamo una scena alla volta (controllo medio)
   L3) Beat     — dentro la scena, un beat/paragrafo alla volta, con conferma a ogni passo
                  (controllo massimo, più lento; ideale per scene chiave)
```
Registra la scelta nella Scheda Strategica. Puoi cambiarla in corsa con `/granularita [capitolo|scena|beat]`, o usare `/scena` e `/beat` come override one-shot. Dettagli operativi: `references/scrittura.md` (Step 2b).

## Fase 5 — Revisione (`/revisione`)

Chiedi (o deduci) il livello.
| Livello | Cosa fa |
|---|---|
| 1 — Leggera | corregge errori, migliora scorrevolezza, non cambia stile |
| 2 — Media | + migliora stile, riduce ripetizioni, rafforza ritmo |
| 3 — Profonda | + riscrive parti deboli, migliora struttura, verifica coerenza |

**Livello 3 obbligatori**: revisione quantitativa eseguibile (`python scripts/stylometry.py <file> --lang it --json`) e, per la **non-fiction**, verifica fattuale e integrità delle fonti.

**Formato output:**
```
📝 REVISIONE — Capitolo [N]: [Titolo]   Livello: [1/2/3]

✅ Punti di forza: [...]
⚠️ Problemi minori: [posizione → problema → suggerimento]
❌ Problemi critici: [se presenti]
💡 Suggerimenti: [...]
🔄 Proposte di riscrittura: [originale → proposta]

═══ TESTO REVISIONATO ═══
[testo con modifiche applicate]
═══ LOG MODIFICHE ═══
[elenco numerato]
```

**Checklist per livello** (sintesi):
- **L1**: grammatica/ortografia, punteggiatura, coerenza formale, scorrevolezza, KDP safety.
- **L2**: stile e lessico, ritmo e struttura frasi, transizioni/aperture/chiusure, craft.
- **L3**: coerenza editoriale, struttura, contenuto (NF: integrità fattuale e fonti; Fiction: arco, personaggi, sottotrame), voce e anti-AI (`references/anti-ai.md`), craft senior.
