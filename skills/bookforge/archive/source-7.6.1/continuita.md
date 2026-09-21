> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# Bibbia di Continuità (collane e sequel)

Strumento **obbligatorio** per qualsiasi serie o sequel. È **sacra**: se durante la scrittura qualcosa la contraddice (un fatto, una regola del mondo, la voce di un personaggio), **fermati e segnala** all'utente prima di procedere. Si compila all'inizio (D-a), retroattivamente dal libro esistente (D-b), o si carica e aggiorna (D-c). Modelli di serializzazione: **episodico** (archi chiusi, status quo che torna), **seriale** (arco di serie dominante, ordine obbligatorio), **ibrido** (trama autoconclusiva + evoluzione lenta).

La Bibbia ha 3 componenti + character bible. Mantienila condensata nel BSR (`references/stato-bsr.md`); i template estesi servono per la consultazione.

## Schema Logico (fatti, regole, eventi)
```
📐 SCHEMA LOGICO — [Serie]
═══ TIMELINE ═══   Volume [N]: [Data/Momento] — [Evento] · note cronologia (lineare/flashback/salti)
═══ FATTI STABILITI ═══   (verità che NON si contraddicono)   1. [Fatto] — Vol.X Cap.Y
═══ REGOLE DEL MONDO ═══   sistema magico/tech: regole, limitazioni, costi · leggi/società · geografia
═══ CATENE CAUSA-EFFETTO ═══   [Evento A] → [Conseguenza B] → [Situazione C]
═══ MISTERI E RIVELAZIONI ═══   | Mistero | 🔒nascosto/🔓rivelato | noto a chi | rivelato in Vol.X Cap.Y |
═══ PROMESSE NARRATIVE APERTE ═══   [Promessa] — creata Vol.N Cap.N — ⏳aperta/✅risolta
═══ STATO ATTUALE DEL MONDO ═══   [situazione corrente]
```

## Schema Relazionale (connessioni)
```
🔗 SCHEMA RELAZIONALE — [Serie]
[A] ←→ [B]: tipo (parentela/amicizia/amore/rivalità/alleanza/mentore-allievo) · stato (attiva/spezzata/segreta/in evoluzione) · evoluzione per volume
  DINAMICA EMOTIVA: trigger reciproco (quale Wound di A attiva B e viceversa) · proiezione · pattern ciclico (es. avvicinamento→ritiro→rabbia→riavvicinamento) · funzione narrativa (cosa B forza A a confrontare)
FAZIONI/GRUPPI: nome · membri · obiettivo · alleanze/conflitti · stato
RELAZIONI personaggio-luogo e personaggio-oggetto: | chi | cosa | tipo di legame | volume |
```
Per la mappa visiva usa **MermaidJS** (vedi `/diagrammi` in `references/stato-bsr.md`).

## Character Bible (per ogni personaggio ricorrente)

Mantieni il voicing coerente tra i volumi. Per ogni personaggio: nome, ruolo, età, aspetto fisico distintivo, **9 assi + Enneagramma** (`references/psicologia.md`: Wound, Lie, Need, Want, Fear, Mask, tipo+wing, meccanismi di difesa), 2-3 reazioni somatiche uniche, tic verbali/intercalari, arco previsto nella serie. Per i secondari basta una versione sintetica (ruolo, funzione, 1-2 tratti).

## Protocollo di aggiornamento

**Pre-capitolo**: consulta Fatti Stabiliti, Regole del Mondo, Promesse Aperte e lo stato delle relazioni rilevanti per la scena.
**Post-capitolo**: aggiorna timeline, nuovi fatti stabiliti, stato di misteri/promesse, evoluzione relazioni. Niente va perso: la Bibbia non si comprime mai (a differenza della prosa).

## Snapshot di fine volume

A chiusura di ogni volume, produci uno snapshot: stato del mondo, archi chiusi vs aperti, promesse risolte vs pendenti, evoluzione di ogni personaggio principale, ganci (hook/foreshadowing) seminati per il volume successivo. Lo snapshot è il punto di partenza del volume seguente.

## Revisione inter-volume

Prima di pubblicare un nuovo volume, verifica contro la Bibbia: nessun fatto contraddetto, regole del mondo coerenti, voci dei personaggi costanti, promesse del volume precedente onorate o consapevolmente rimandate, timeline senza buchi.
