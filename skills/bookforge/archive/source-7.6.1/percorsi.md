> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# Percorsi operativi (A / B / C / D / Q)

## Percorso A — Nuovo libro (`/nuovo`)
Flusso completo: Fase 0 → 1 → 2 → 3 → 4 → 5 → 6 (→ 7 opzionale).
- `/scheda` (Fase 1) → `references/fasi.md`
- `/ricerca` (Fase 2) → `references/kdp.md`
- `/indice` (Fase 3) → `references/fasi.md`
- `/scrivi` (Fase 4) → `references/scrittura.md`
- `/revisione` (Fase 5) → `references/fasi.md`
- `/kdp` (Fase 6) → `references/kdp.md`

Regole: mai saltare fasi senza richiesta esplicita; confermare prima di avanzare; output numerati; stato riepilogabile su richiesta (`/stato`).

## Percorso B — Revisione libro esistente (`/revisiona`)

**Step 1 — Intake**: chiedi il testo (completo / capitolo / bozza / indice / sinossi) e l'obiettivo o il problema.

**Step 2 — Classificazione dell'intervento** (conferma con l'utente):
| Tipo | Descrizione |
|---|---|
| Grammaticale | errori, punteggiatura, ortografia |
| Stilistica | stile, ritmo, leggibilità |
| Narrativa | arco, personaggi, tensione |
| Strutturale | riorganizzazione capitoli, progressione |
| Ampliamento / Sintesi | espandere / ridurre |
| Riscrittura | sostanziale |
| Adattamento pubblico | nuovo target/registro |
| Preparazione KDP | formattazione e materiali |
| Controllo coerenza / tono / ripetizioni / promessa | verifiche mirate |

**Step 3 — Contesto** (se serve): target, tono desiderato, genere, promessa, vincoli.
**Step 4 — Livello revisione → esecuzione → iterazione**: vedi `references/fasi.md` (Fase 5, 3 livelli).
**Step 5 — (Opzionale)** Pacchetto KDP → `/kdp`.

## Percorso C — Continuare un libro iniziato (`/continua`)
**Regola madre: CONTINUITÀ, non riscrittura.** Rispetta voce, stile e scelte dell'autore.

1. **Intake**: tutto il testo scritto, appunti/scalette, intenzione narrativa o didattica, obiettivo (solo analisi? o anche completamento?).
2. **Analisi stilistica** (Scheda di Analisi Stilistica): estrai lo StyleDNA dal testo esistente (`/clone` → `references/styledna.md` + `scripts/stylometry.py`) e compila:
```
📐 SCHEDA DI ANALISI STILISTICA — [opera]
StyleDNA rilevato: SL:_ SC:_ RV:_ ... (vettore completo)
Voce dominante · registro · POV e distanza
Tic stilistici e ricorrenze (dallo script: bigrammi/trigrammi ripetuti, flag anglo-tradotto)
Struttura osservata (capitoli, scene, ritmo) · campo metaforico prevalente
Forza e fragilità della voce (cosa preservare assolutamente / cosa è incidentale)
```
3. **Opinione editoriale**: onesta e concreta — punti di forza, criticità, potenziale.
4. **Scheda Strategica ricostruita**: deduci target, promessa, tono, struttura dal testo.
5. **Indice della parte mancante**: proponi come completare, coerente con quanto già scritto.
6. **Scrittura con continuità**: scrivi i capitoli mancanti applicando lo StyleDNA clonato (`references/scrittura.md`).
7. **Revisione di continuità**: verifica che il nuovo si saldi al vecchio (voce, fatti, timeline, personaggi).
8. **(Opzionale)** Revisione completa (Fase 5) + Pacchetto KDP (Fase 6).

## Percorso D — Collana / Sequel (`/collana`, `/sequel`)
La **Bibbia di Continuità è sacra**: se qualcosa la contraddice, **fermati e segnala**. Dettagli e template in `references/continuita.md`.

**Step 1 — Classificazione**:
- **D-a — Nuova collana da zero**: pianifica arco di serie + arco del primo volume, crea la Bibbia, poi procedi come Percorso A per il Vol.1.
- **D-b — Sequel da libro esistente**: l'utente fornisce il libro precedente; estrai e costruisci la Bibbia retroattivamente, poi pianifica il nuovo volume in coerenza.
- **D-c — Nuovo volume di una collana in corso**: carica la Bibbia esistente (o il BSR), aggiorna, scrivi il nuovo volume.

**Step 2 — Questionario di serie**: modello di serializzazione (episodico / seriale / ibrido), numero volumi previsto, arco di serie, cosa si chiude per volume.
**Step 3 — Bibbia di Continuità** → `references/continuita.md`.
**Step 4 — Scrittura con Bibbia** (continuo controllo di coerenza inter-volume).
**Step 5 — Snapshot di fine volume** + revisione inter-volume.

## Percorso Q — Analisi rapida (`/analisi`)
Feedback in **un'unica risposta**, senza fasi intermedie. Onesto, concreto, con esempi dal testo.

```
📊 ANALISI RAPIDA BOOKFORGE

═══ PANORAMICA ═══
Tipo: [fiction / non-fiction / ibrido] · Genere: [...] · Lingua: [...] · ~[N] parole

═══ PUNTI DI FORZA ═══
✅ [punto 1 con esempio dal testo]
✅ [punto 2 con esempio]
✅ [punto 3 con esempio]

═══ AREE DI MIGLIORAMENTO ═══
⚠️ [area 1 — cosa + perché + come migliorare]
⚠️ [area 2]
⚠️ [area 3]

═══ VALUTAZIONE ═══
Qualità complessiva: [N/10] — [motivazione in 1 riga]
Potenziale commerciale: [alto/medio/basso] · Leggibilità: [fluida/buona/da migliorare]

═══ CONSIGLIO #1 PRIORITARIO ═══
💡 [il singolo intervento col maggiore impatto]

═══ VUOI CONTINUARE? ═══
a) Revisione completa (Percorso B)   b) Analisi stilistica + completamento (Percorso C)
c) Pacchetto KDP (Fase 6)            d) Fermati qui
```
