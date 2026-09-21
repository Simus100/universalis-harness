> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# BookForge State Registry (BSR) — salva, carica, stato

Le chat lunghe perdono contesto. Il BSR è un dispositivo di **handoff**: `/salva` produce un artefatto compatto che, caricato in una **chat nuova**, ricostruisce lo stato senza rileggere tutta la conversazione.

**Una fonte canonica, viste derivate:**
1. **`bookforge_state.json`** — CANONICO. Unico file da **re-importare** in una chat nuova (denso, pochi token).
2. **`bookforge_state.md`** — vista leggibile **generata dal JSON** per consultazione umana. **Non si re-importa** (raddoppierebbe il costo di contesto).
3. **`bookforge_state_diagrams.md`** — opzionale (`/diagrammi`), mai parte del payload di import.

Il `.md` è una **vista generata dal JSON**: lo rendi tu dallo stesso JSON appena scritto (stessi dati, forma leggibile). Marcalo come "generato — non modificare a mano". Per il bootstrap di una nuova chat si re-importa **solo il JSON**.

## Politica di ritenzione — cosa contiene SEMPRE lo stato

Lo stato è lo **scheletro** del progetto. Sempre presenti, senza eccezioni: Scheda Strategica, StyleDNA, **impronta della voce** (`voice_fingerprint`), NST (incluso il **Ledger PIP**), Bibbia di Continuità con i **Fatti Canonici** (append-only), indice completo (1→N) e i riassunti dei capitoli.

**Ritenzione a livelli** (la prosa integrale resta sempre nei file `capitolo_NN.md`, fonte di verità recuperabile):
- **Capitoli recenti** (ultimi ~5, o l'intero volume in corso): riassunto pieno ≤150 parole. È la finestra che porta la continuità viva.
- **Capitoli vecchi**: compressi a 1-2 righe di beat (cosa accade, cosa cambia, promesse aperte/chiuse). Non si cancellano: si stringono.
- **Volumi chiusi** (trilogia): un **rollup d'arco** per volume sostituisce i beat dei suoi capitoli; i capitoli restano recuperabili dai file.

Mai comprimere, mai fondere: **Fatti Canonici, Promesse aperte, Bibbia e impronta della voce**. Sono la continuità non negoziabile. La compressione tocca solo i riassunti dei capitoli lontani dalla penna — così l'handoff resta leggero anche su una trilogia.

## `/salva` e Auto-Save

1. Mostra in chat una tabella di riepilogo rapido del progresso.
2. **Scrittura fisica dello stato**: quando l’ambiente consente di creare file, crea o aggiorna `bookforge_state.json` e restituisci il collegamento. Se non è possibile creare file, mostra il JSON completo in un blocco copiabile e dichiara che il salvataggio fisico non è avvenuto. L’auto-save va tentato alla fine di ogni avanzamento significativo.
3. **Fondi, non rigenerare.** Aggiorna `bookforge_state.json` partendo dallo stato caricato: aggiungi e rifinisci, **mai** ricostruire la bibbia da zero, mai eliminare un riassunto, una promessa aperta o un fatto canonico. Applica la ritenzione a livelli (comprimi solo i capitoli lontani dalla penna).
4. **Aggiorna l’impronta della voce.** Quando è disponibile Python, esegui `python scripts/stylometry.py <ultimo_capitolo_accettato> --lang it --json` e riporta ASL, RHYTHM_VARIATION, TTR e dialogue_ratio nel blocco `stylometry_baseline`. Se Python non è disponibile, lascia i valori numerici invariati o nulli e segnala il limite. Aggiorna `golden_samples` e `idiolect` solo se la voce è cambiata di proposito.
4b. **Antologia della voce.** Se in sessione è stato accettato un capitolo, **proponi** 1 passaggio da promuovere in `references/antologia.md` (con categoria: apertura, azione, dialogo…). Si aggiunge solo su approvazione esplicita dell'autore; oltre ~400 righe si propone una sostituzione, non un accumulo.
5. **Controllo di coerenza del canone.** Confronta i nuovi fatti con `canon_facts_or_didactic`; se trovi una contraddizione, **fermati e segnala** in chat invece di sovrascrivere ciecamente.
6. Compila `session_info` (data ISO 8601, sessione, parole), `resume_cursor` (capitolo/scena/beat, granularità attiva, ultima conferma, prossima azione) e il `written_by` dei capitoli scritti in sessione (il modello corrente).
7. Genera la vista umana `bookforge_state.md` aggiornando il file fisico; diagrammi solo se richiesti (`/diagrammi`).
8. Conferma per iscritto in chat l'avvenuto salvataggio fisico, con la riga di salute dello stato (vedi `/carica`).

### Schema `bookforge_state.json` (canonico)
```json
{
  "bookforge_version": "7.6",
  "session_info": {"saved_at": "ISO8601", "session_number": null, "words_written": null, "total_words_cumulative": null, "last_command": "/salva"},
  "resume_cursor": {"phase": "0-7", "chapter": null, "scene": null, "beat": null, "granularity": "L1|L2|L3", "last_confirmed": "", "next_action": ""},
  "project_meta": {"title": "", "genre": "", "language": "", "volume": "1/3", "current_phase": "0-7"},
  "strategic_board": {"target": "", "promise": "", "goal": "", "tone": "", "complexity_level": "", "narrative_structure": "", "kdp_format": "", "constraints": []},
  "styledna": {"profile": "", "vector": "SL:_|SC:_|RV:_|VR:_|RL:_|FD:_|ST:_|SD:_|DW:_|ET:_|SUB:_|AP:_", "vector_note": ""},
  "voice_fingerprint": {
    "golden_samples": ["2-3 frasi verbatim che definiscono il timbro"],
    "idiolect": {"pov_tics": ["es. Elio archivia, non conclude"], "campi_metaforici_attivi": ["es. contratto/debito", "geometrico"], "banditi": ["es. soot→nerofumo", "display→schermo", "trattino drammatico di default"]},
    "stylometry_baseline": {"ASL": null, "RHYTHM_VARIATION": null, "TTR": null, "dialogue_ratio": null, "generato_da": "scripts/stylometry.py sugli ultimi capitoli accettati"},
    "registro_personaggi": {}
  },
  "narrative_state_tracker": {"plot_position": "", "tension_level": 0, "open_questions": [], "promises_made": [], "promises_kept": [], "open_subplots": {}, "pip_ledger": {"N": {"apertura": "", "chiusura": "", "senso": "", "campo_metaforico": "", "modalita": ""}}},
  "continuity_bible_condensed": {
    "project_type": "fiction|non-fiction",
    "canon_facts_or_didactic": ["append-only e verificati; fiction: fatti canonici (es. cannone = VERTEX PERIMETER RAIL MK.IV) · non-fiction: progressione didattica"],
    "characters_or_glossary": [{"name": "", "role": "", "traits": "età, Wound, Ennea, tic"}],
    "rules_or_concepts": [],
    "timeline_or_references": []
  },
  "index_planned": [{"chapter": 1, "title": "", "objective": "", "function": "", "status": "completato|in corso|pianificato", "written_by": "opzionale: modello che ha scritto il capitolo — serve al controllo della voce tra modelli"}],
  "chapters_summary": {"_policy": "recenti ≤150 parole; vecchi 1-2 righe; volumi chiusi → rollup", "recenti": {"N": "riassunto ≤150 parole"}, "vecchi": {"1": "beat 1-2 righe"}, "rollup_volumi": {}}
}
```

### Vista umana `bookforge_state.md` (generata dal JSON)
Stessi dati, sezioni leggibili: 📊 Metadati + cursore di ripresa · 🎯 Scheda Strategica · 🧬 StyleDNA (profilo + vettore + note) · 🗣️ Impronta della voce (golden samples, idioletto, baseline stilometrica) · 📋 NST (con Ledger PIP) · 🔗 Bibbia condensata + 🔒 Fatti Canonici (fiction: personaggi, fatti, regole, timeline / non-fiction: progressione didattica, glossario, riferimenti) · 📅 Indice (tabella Cap/Titolo/Obiettivo/Funzione/Stato) · 📝 Riassunti capitoli (recenti pieni, vecchi a beat, rollup per volume). Intestazione: `<!-- VISTA GENERATA — non modificare a mano. Per il bootstrap usare SOLO il JSON. -->`.

## `/carica`

Bootstrap **solo da `bookforge_state.json`**. Priorità: 1) file allegato nella conversazione o disponibile nella sessione corrente; 2) JSON incollato in chat. Se manca il JSON ma è presente solo `bookforge_state.md`, usalo esclusivamente come fallback dichiarato.

**Validazione prima di fidarsi** (poi riporta una riga di salute):
- chiavi dei riassunti coerenti con l'indice (nessun capitolo "completato" senza riassunto);
- vettore StyleDNA ben formato (12 assi);
- JSON che chiude tutte le parentesi e nessun marcatore di troncamento (se incollato e tronco → chiedi di reincollare, non indovinare);
- promesse aperte e sottotrame che puntano a elementi esistenti;
- `canon_facts_or_didactic` senza contraddizioni interne.

Poi carica tutto (Scheda, voce, NST + Ledger PIP, Bibbia + Fatti Canonici, StyleDNA, indice, riassunti, cursore) e conferma:
```
📊 BOOKFORGE STATE RESTORED
Progetto: [Titolo] (Vol. [n/N]) · Fase: [es. 4 — Scrittura]
Penna: Cap. [N] · Scena [M] · granularità [L_] — prossima azione: [...]
Salute stato: ✅ coerente   /   ⚠️ [anomalia rilevata]
```
Mostra la tabella di riepilogo e chiedi conferma prima di procedere.

## `/stato`
Mostra la tabella di riepilogo del progetto corrente (metadati, fase, capitoli completati/totali, parole, prossimo passo) senza scrivere file.

## §Canon — audit di coerenza on-demand (`/canon`)

Lo stesso controllo del passo 4 di `/salva`, ma invocabile in qualsiasi momento su un capitolo, una scena o una bozza — utile prima di scrivere una scena che tocca elementi canonici delicati, o quando un dubbio emerge a metà stesura (es. il caso MK.I/MK.IV). Procedura a formato rigido, identica su ogni modello:

```
1. ESTRAZIONE: leggi il testo e compila una tabella delle affermazioni fattuali verificabili —
   | # | Affermazione nel testo | Categoria (oggetto/luogo/persona/regola/timeline) | Posizione |
   Includi anche le implicazioni (se il testo dice "il cannone sparò due colpi in 4 secondi",
   l'implicazione sulla cadenza è un'affermazione).
2. CONFRONTO: per ogni riga, cerca il fatto corrispondente in canon_facts_or_didactic,
   rules_or_concepts e timeline del BSR. Esiti: ✅ coerente · ⚠️ non coperto dal canone
   (proponi se aggiungerlo) · ❌ CONFLITTO (cita fatto canonico e affermazione, fianco a fianco).
3. REPORT: mostra SOLO ⚠️ e ❌. Per ogni ❌ proponi le due risoluzioni possibili (correggere il
   testo / emendare il canone) ma NON applicarne nessuna senza conferma: il canone è append-only
   e si emenda solo per decisione esplicita dell'utente.
```
Limite onesto: l'estrazione può mancare affermazioni implicite — `/canon` riduce il rischio, non lo azzera. Per la trilogia, lancialo come minimo a ogni chiusura di capitolo che tocca Fatti Canonici.

## `/diagrammi` (opzionale)
Genera `bookforge_state_diagrams.md` con MermaidJS dal JSON: mappa delle relazioni (`graph TD`), flusso trame/sottotrame (`graph LR`), progressione capitoli (`graph TD` con stato Completo/In corso/Pianificato). Usa forme diverse per persone, luoghi, oggetti. Mai parte del payload di import.
