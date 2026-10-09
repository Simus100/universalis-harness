# Ricerca web: come accenderla

Il tool di ricerca dell'harness (quello che interroga un motore e restituisce risultati con
citazioni) **non ha un provider configurato**: senza chiave resta spento. La rete invece funziona,
e nel frattempo i canali alternativi sono attivi (vedi in fondo).

## Tre passi

### 1. Prendi una chiave gratuita

| Provider | Dove | Piano gratuito | Campo da usare |
|---|---|---|---|
| **Brave Search API** | `api-dashboard.search.brave.com` | ~2.000 query/mese, 1 al secondo | `braveApiKey` |
| **Tavily** | `tavily.com` | ~1.000 crediti/mese, pensato per agenti | `tavilyApiKey` |
| **Exa** | `dashboard.exa.ai` | crediti iniziali gratuiti, ricerca semantica | `exaApiKey` |

Brave di solito chiede una carta per la verifica (non addebita nulla entro il limite gratuito);
Tavily si attiva subito con la sola registrazione. Qualunque dei tre va bene.

### 2. Crea il file di configurazione

```bash
printf '{"braveApiKey": "LA_TUA_CHIAVE"}\n' > /root/.pi/agent/web-search.json
chmod 600 /root/.pi/agent/web-search.json
```

Il file **sta fuori dal repository** (`/root/.pi/agent/`, non `/root/pi-harness/`): così la chiave non
può finire nel repository pubblico. Se un giorno la chiave viene scoperta, si revoca dal pannello del
provider e si aggiorna il file.

Altri campi accettati dal tool, se preferisci un altro provider: `tavilyApiKey`, `exaApiKey`,
`perplexityApiKey`, `kagiApiKey`, `jinaApiKey`, `serperApiKey`, `searxngBaseUrl` (per un SearXNG
self-hostato), `openaiApiKey`, `geminiApiKey`, `bochaApiKey`, `cloudflareApiKey`.

### 3. Verifica che funzioni davvero

```bash
bash media/ricerca-web/verifica-ricerca.sh
```

Lo script (in questa cartella):

- dice se il file c'è e quali permessi ha;
- dice **quale campo** ha trovato e quanti caratteri ha la chiave — **mai il valore**;
- fa una **ricerca vera** e stampa i primi tre titoli con gli URL, oppure l'errore esatto del
  provider («token non valido», «non autorizzato», …);
- non fa passare la chiave dalla riga di comando (niente traccia in `ps`) e cancella i file
  temporanei all'uscita.

Esiti possibili: `0` chiave valida · `1` configurazione assente o senza campi riconosciuti ·
`2` risposta illeggibile · `3` il provider ha rifiutato · `4` nessun risultato.

## Finché non c'è la chiave: cosa funziona lo stesso

| Canale | Come | Nota |
|---|---|---|
| Lettura di URL, PDF, repo, video | tool `fetch_content` | verificato: documentazione Blender letta e riassunta |
| Navigazione con browser vero (JS compreso) | `agent-browser` da riga di comando | DuckDuckGo/Bing/Ecosia bloccano i bot con CAPTCHA, quindi non sostituiscono un motore |
| **API pubbliche senza chiave** | `api.github.com`, `api.stackexchange.com`, `huggingface.co/api`, Wikipedia, PyPI/npm | verificate: GitHub, Stack Overflow e Hugging Face hanno risposto subito |

Per il lavoro tecnico (trovare strumenti, librerie, esempi, modelli) le API pubbliche sono spesso
migliori di un motore generalista: sono strutturate e non hanno pubblicità da scartare.
