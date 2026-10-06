# Metriche

Con volumi piccoli (una persona, qualche lavoro a settimana) le metriche non servono a gestire: servono
a **non raccontarsi storie**. Tre o quattro numeri che si guardano ogni tanto bastano; un cruscotto di
venti indicatori su dodici osservazioni è decorazione.

## 1. Leading e lagging

**Leading** — prevedono il tempo di ciclo, si muovono prima del risultato:

- latenza fra un artefatto e il successivo (intent → spec → piano) in ore;
- quota di lavori che si chiudono **al primo passaggio**, senza tornare indietro;
- tempo di attesa al gate (quanto resta un artefatto in `pronto` prima che qualcuno decida);
- rework dei requisiti: commit su `spec.md` dopo l'inizio dell'implementazione.

**Lagging** — misurano il risultato, si muovono dopo:

- difetti arrivati in uso reale (non quelli intercettati prima);
- giri di rework per lavoro;
- incidenti ripetuti della stessa classe;
- andamento del pass rate degli eval (se esiste una suite);
- tempo dal momento in cui una richiesta arriva al momento in cui è pubblicata.

Un leading che non anticipa niente, per due mesi, è una metrica da buttare. Meglio due numeri onesti
che sei ceremonial.

## 2. `scripts/sdlc-metriche.sh`

Legge la storia di Git e produce:

- **con `intent/` presente**: per ogni cambiamento, le ore fra `intent.md`, `spec.md` e `plan.md`, più
  il numero di riscritture di `spec.md` avvenute dopo il piano (rework dei requisiti);
- **senza `intent/`** (situazione normale all'inizio): ore di lavoro per giorno, numero di commit e
  quota di commit di correzione (`fix`) sul totale — un indicatore grezzo di quanto si torna sui
  propri passi.

Uso:

```bash
bash skills/ai-native-sdlc/scripts/sdlc-metriche.sh            # ultimi 500 commit
bash skills/ai-native-sdlc/scripts/sdlc-metriche.sh 100 data/  # finestra e cartella degli intent
```

## 3. Come leggerle

- **Confronta periodi, non assoluti**: «prima 12 ore da intent a piano, ora 3» dice qualcosa; «3 ore»
  da solo non dice niente.
- **Un numero per volta**: se cambiano tre cose insieme non sai cosa ha funzionato.
- **Le soglie si scrivono**: «accettabile» ha senso solo se è dichiarato prima di misurarlo.
- **Il rework non è un peccato**: un piano riscritto due volte è meglio di un piano vago eseguito.
  Va guardato il *tipo* di ritorno: nuova informazione (bene) o requisito che nessuno aveva chiesto
  (male).
- **Se una metrica non cambia nessuna decisione, smetti di misurarla.**

## 4. Da dove vengono i numeri, qui

| Fonte | Cosa se ne ricava |
|---|---|
| `git log` | latenze fra artefatti, rework, commit per giorno, quota di fix |
| `media/test-all.sh` | pass rate e suite fragili (esito nel tempo) |
| `media/goals.json` | lavori aperti, passi completati, tempo di chiusura di un goal |
| memoria (`memoria_cerca`, episodi) | decisioni prese, vicoli ciechi evitati, incidenti |
| `evals/out/` | andamento del pass rate degli eval |
