---
name: browser
description: "Naviga siti web reali con il tool `browser` (Chrome headless): apri pagine, leggi il contenuto, clicca, compila moduli, estrai dati, fai screenshot o PDF. Usala quando serve interagire con un sito, compilare un form, estrarre dati da una pagina o provare una web app. Per i casi avanzati (form complessi, attesa dei contenuti, login, più sessioni, errori ricorrenti) leggi la guida aggiornata con `agent-browser skills get core`."
---

# Navigare con il tool `browser`

Il tool `browser` guida un Chrome headless reale. Il ciclo di lavoro è sempre lo stesso:

1. `action="open"` con `url` → apri la pagina
2. `action="snapshot"` → vedi cosa c'è: albero di accessibilità con riferimenti `[ref=e12]`
3. agisci sui ref (`click`, `fill`, `type`, `press`)
4. **rifai lo snapshot** dopo ogni navigazione o cambiamento di pagina
5. `action="close"` quando hai finito

## Prerequisito: il tool deve essere acceso

Il tool è **spento di default**. Se non lo vedi tra i tuoi strumenti disponibili, **non provare a
simulare il browsing con altri mezzi**: chiedi al proprietario di attivarlo con `/browser on`
(oppure `POST /api/browser {"enabled": true}`). Con `/browser status` si vede lo stato.

## I ref: la regola che fa fallire o riuscire il lavoro

- I ref (`@e1`, `@e12`, …) appartengono alla **pagina corrente**.
- Dopo una **navigazione** i ref cambiano: rifai lo snapshot.
- I ref **non ripartono sempre da `e1`**: in una sessione già usata possono essere `e18`, `e19`, …
  Non inventare mai un ref e non assumere che `@e1` esista.
- Se un'azione risponde `Unknown ref`, rifai lo snapshot e usa i ref nuovi: è il caso più comune.
- Tra snapshot della **stessa** pagina i ref restano validi: non serve rifare lo snapshot a ogni click.

## Azioni disponibili

| Azione | Parametri | A cosa serve |
|--------|-----------|--------------|
| `open` | `url` | apri una pagina (solo http/https) |
| `snapshot` | — | albero di accessibilità con ref (**preferiscilo sempre**) |
| `read` | — | testo leggibile della pagina attiva |
| `click` | `ref` | clicca un elemento |
| `fill` / `type` | `ref`, `text` | scrivi in un campo (`fill` svuota prima) |
| `press` | `key` | premi un tasto (`Enter`, `Tab`, …) |
| `scroll` | `direction`, `px` | scorri la pagina |
| `get` | `what`, `ref` | leggi un valore (`text`, `url`, `title`) |
| `screenshot` | `path` | immagine (salvata in `media/`) |
| `pdf` | `path` | PDF della pagina (salvato in `media/`) |
| `eval` | `code` | esegui JavaScript nella pagina |
| `back` | — | torna indietro |
| `close` | — | chiudi il browser |
| `status` | — | verifica che la sandbox sia adeguata |

## Convenienze e limiti

- **Preferisci `snapshot` a `screenshot`**: l'albero di accessibilità costa molto meno contesto
  (~200-400 token per pagina invece di migliaia per un'immagine).
- **Una sessione alla volta**: una sessione headless pesa ~1,7 GB di RAM. Chiudi con `close`
  quando hai finito, invece di lasciarla aperta.
- **Non gestisci tu i privilegi**: il tool invoca la CLI come utente dedicato (`pi-browser`) e
  rifiuta di operare se la sandbox non è adeguata. Se ricevi quel rifiuto, non aggirarlo:
  segnalalo al proprietario.
- **File generati**: `screenshot` e `pdf` finiscono in `media/`, come tutti gli output.

## Quando serve di più

Per i casi avanzati — form complessi, attesa di contenuti caricati dinamicamente, gestione di
autenticazione, più sessioni in parallelo, diagnosi dei fallimenti — leggi la guida ufficiale
**sempre allineata alla versione installata della CLI**:

```bash
agent-browser skills get core --full
```

Altre skill incluse nella CLI (utili in casi specifici): `dogfood` (esplorare una web app per
trovare bug), `derive-client` (ricostruire le API interne di un sito), `slack`, `electron`,
`agentcore`, `vercel-sandbox`, `webmcp-gen`, `protected-vercel-deployments`.
Si elencano con `agent-browser skills list`.
