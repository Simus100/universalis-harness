# Sintesi — audit dell'harness `pi-harness`

**La frase.** L'harness fa già le tre cose giuste che contano (memoria a richiesta, guardrail indipendenti dal modello, degradazione dichiarata), ma le fa **senza misurarle**, e sbaglia le tre che costano: il prefisso si ricostruisce a metà turno, le osservazioni entrano intere, gli errori non hanno una classe. Il primo intervento costa mezza giornata e si misura con un dato che l'SDK calcola già.

**Dove sta cosa:** `report.md` (analisi completa, 3 pilastri + SOTA + To-Be), `dashboard.html` (simulatore interattivo attuale vs ottimizzato).

---

## Criticità → soluzione SOTA → impatto atteso

| # | Criticità attuale (con l'evidenza) | Soluzione SOTA (con la fonte) | Impatto atteso | Costo |
|---|---|---|---|---|
| 1 | **`applyToolGate` rimuove i tool** (`dashboard.mjs:1510`) → il prefisso si ricostruisce, la cache KV si perde, i messaggi precedenti citano tool spariti | **«Mask, don't remove»**: tool sempre definiti, scelta mascherata; set congelato per turno (Manus, *Context Engineering*) | −70/−80% token non cachati nel turno con cambio di gate; meno azioni inventate | ½ giornata |
| 2 | **La nota progetto sta nel prefisso e legge il filesystem** (`:1336`, `:1407`) | Prefisso stabile e append-only; il dinamico va **in coda** o diventa un tool (Manus; Anthropic, *context engineering*) | Cache read alta e stabile; latenza del primo token giù | ½ giornata |
| 3 | **Nessun bilancio del contesto**: si conosce solo il totale (`getState`, `:2452`) | **Ledger per sezione** + quota di cache sprecata già calcolata dall'SDK (`computeCacheWaste`) | Rende misurabili i punti 1-2-4: senza, sono opinioni | 1 giorno |
| 4 | **Osservazioni intere, offload assente**; compaction al 95% (riserva 16.384) | **Filesystem come contesto** con compressione **ripristinabile** (Manus); compaction a 70–75% con note strutturate (Anthropic) | Picco di contesto dal ~90% al 30-40%; il costo del turno scende di un ordine di grandezza | 2 giorni |
| 5 | **Nessuna recitation**: l'obiettivo entra solo se l'utente lancia il goal | **Recitation** dell'obiettivo in coda al contesto (Manus) | Meno deriva nei turni da 30+ passi; costo ~200 token per volta | 1 giorno |
| 6 | **Errori senza classe** (`:2632`): sempre «riprova» | **Tassonomia + pattern per classe** (SHIELDA, arXiv 2508.07935; *Failure Makes the Agent Stronger*, 2509.18847) | Recupero dal ~40% all'85% sugli errori di tool; meno retry ciechi | 3 giorni |
| 7 | **Zero valutazioni**: 43 test sull'interfaccia, nessuno sull'agente | **Eval harness** con casi d'oro (`promptfoo` o `inspect_ai`) | Ogni modifica al prompt smette di essere un azzardo: diventa una riga con un delta | 2 giorni |
| 8 | **Telemetria solo cumulativa per sessione**; `pi-observability/history.jsonl` esiste e non viene letto | **Un record per turno**, attributi secondo le Semantic Conventions GenAI di OpenTelemetry (`langfuse` come consumatore) | Costo e affidabilità per turno e per tool; base per l'instradamento | 2 giorni |
| 9 | **Un solo modello, nessun instradamento**; comandi e audit pagano lo stesso percorso | **Router economico** (RouteLLM, arXiv 2406.18665; SLM front-door); per i comandi basta la regola | −20/−40% chiamate al modello grande a qualità invariata (letteratura) | dopo 7-8 |
| 10 | **Due monoliti**: `dashboard.mjs` 6.306 righe, `dashboard.html` 668 KB in un solo `<script>` | Estrazione per dominio + test; moduli caricati a richiesta nel frontend | Riduce l'area di guasto e il costo di ogni intervento successivo | continuo |

## Roadmap ordinata per priorità

**P0 — si misura prima di toccare (1½ giorni)**
`applyToolGate` a maschera con set congelato · nota progetto in coda · `computeCacheWaste` + ledger del contesto esposti in `getState()` e in barra.
*Criterio di riuscita:* cache waste per turno misurabile prima/dopo, non un'impressione.

**P1 — il contesto diventa gestito (5 giorni)**
Offload ripristinabile sopra 8k caratteri (file + hash + prime righe) · compaction a 72% con sezioni «decisioni / errori / file toccati» · recitation ogni 5 passi · **eval harness con 20-30 casi reali presi da `sessions/`**.
*Criterio:* token di picco −50% e nessun aumento dei fallimenti sui casi d'oro.

**P2 — il guasto diventa riparabile (5 giorni)**
Tassonomia degli errori + pattern per classe (timeout, schema, permesso, servizio giù, argomenti) · traccia dell'errore conservata nel contesto · un record JSONL per turno (OTel GenAI).
*Criterio:* tasso di recupero misurato su errori indotti.

**P3 — l'instradamento e la manutenzione (quando P1 ha numeri)**
Decision_M come front-door per la scelta del modello · estrazione dei blocchi da `dashboard.mjs` con test a corredo.
*Criterio:* si adotta solo se l'eval non peggiora oltre la soglia dichiarata prima di provare.

## Le tre cose che il simulatore rende evidenti
1. **Il costo non è uniforme nel turno**: cresce con il quadrato dei passi, perché ogni passo ripaga tutto il contesto accumulato. Un turno due volte più lungo non costa il doppio: costa circa il quadruplo.
2. **Il cambio di gate costa più del tool stesso**: nel passo in cui il prefisso si ricostruisce si paga il prefisso intero a prezzo pieno, non i pochi token del tool aggiunto.
3. **Con osservazioni piccole il divario crolla** (dal ~90% al ~60% di risparmio): l'offload non è una bacchetta magica, è un intervento mirato sui tool che restituiscono molto testo — `read` su file grandi, `browser snapshot`, `fetch_content`, PDF.
