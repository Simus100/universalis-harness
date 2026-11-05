# Skill da integrare: ricerca sui cataloghi (novembre 2026)

Ricerca svolta scandagliando i cataloghi pubblici di Agent Skills e mettendo alla prova le
candidate su **questa** istanza (validatore `media/check-skills.mjs` + controllo dipendenze reali).
Nessuna skill è stata installata: qui c'è cosa vale la pena prendere, a quali condizioni.

## 1. Dove ho guardato

| Fonte | Consistenza | Esito |
|---|---|---|
| `anthropics/skills` | ~188k ★, 19 skill | clonato e letto per intero |
| `openai/skills` | ~35 skill "curated" | clonato e letto per intero |
| `VoltAgent/awesome-agent-skills` | 1.497 skill, "hand-picked, not AI-slop" | sezioni ufficiali esaminate |
| `ComposioHQ/awesome-claude-skills` (78k ★), `sickn33/agentic-awesome-skills` (2.9k skill), `Awesome-OmniSkill` (10k), `The Mega Skill Library` (35k), `SkillCenter` (11k) | 1.000–35.000 skill | **scartati**: volume senza filtro di qualità |
| `agentskills/agentskills` | spec ufficiale, 27k ★ | riferimento di formato |

Regola ricavata: **la dimensione di un catalogo è inversamente correlata alla sua utilità.**
I due repository che valgono sono quelli che contengono le skill che i team usano davvero.

## 2. I tre filtri che decidono (e che nessun catalogo dichiara)

### 2.1 Licenza contro repository pubblico
`skills/` finisce in un **repository pubblico** a ogni `scripts/sync-fine-lavoro.sh`. Le quattro
skill documenti di Anthropic — le più consigliate in assoluto — hanno licenza:

> © 2025 Anthropic, PBC. All rights reserved. … ADDITIONAL RESTRICTIONS: users may not:
> Extract these materials …

Sono *source-available*, non open source. **Importarle qui violerebbe la licenza.** Le stesse
capacità per il PDF esistono in `openai/pdf` con licenza **Apache 2.0**.
Sono Apache 2.0 (quindi adottabili con attribuzione): `skill-creator`, `frontend-design`,
`mcp-builder`, `canvas-design`, `theme-factory`, `webapp-testing`, `define-goal`, `pdf`,
`jupyter-notebook`, `screenshot`, `transcribe`, `security-*` (OpenAI).

### 2.2 L'ambiente non è quello per cui sono scritte
Le skill documenti dichiarano «preinstalled» pacchetti che qui **non** esistono:

| Dipendenza | Stato su questa macchina | Serve a |
|---|---|---|
| `python-docx`, `python-pptx`, `openpyxl`, `pypdf`, `pymupdf`, `pandas` | assenti (pip raggiungibile, ~40 MB) | Word, PowerPoint, Excel, PDF |
| `docx`, `pptxgenjs`, `playwright`, `sharp` (npm) | assenti (npm raggiungibile) | idem |
| **LibreOffice (`soffice`), `pandoc`** | **mancanti** (~500 MB via apt) | conversione, lettura `.doc`/`.ppt`, ricalcolo formule |
| `duckdb` (CLI) | mancante | query su CSV/Parquet |
| `pdftotext`, `ffmpeg`, `sqlite3`, Chrome headless (`browser`) | presenti | — |

Senza LibreOffice `docx`/`pptx`/`xlsx` si caricano ma **falliscono al primo comando utile**:
metà delle loro istruzioni è ineseguibile.

### 2.3 Formato di casa
16 candidate copiate in `/tmp/cand` e passate al validatore:
**48 controlli ok, 0 errori, 8 avvisi.** Gli avvisi sono tutti lo stesso: la description non dice
*quando* usarla, che è l'unico aggancio per l'attivazione automatica.
Nessuna collisione di nome con le 29 skill esistenti.

→ Verdetto: **importazione sì, copia-incolla no.** Ogni description va riscritta in italiano con la
formula «Usa quando…», altrimenti la skill resta invisibile.

## 3. Cosa vale la pena, in ordine di rapporto valore/costo

| Skill | Fonte · licenza | Perché su questa istanza | Costo |
|---|---|---|---|
| `skill-creator` | Anthropic · Apache 2.0 | 29 skill e un validatore, ma nessuna guida su come scriverne una buona né su come far agganciare la description. Chiude il buco più evidente del sistema | 272 KB, zero dipendenze (la parte di ottimizzazione description richiede `claude -p`: assente, si salta) |
| `define-goal` | OpenAI · Apache 2.0 | 99 righe, si innesta sulla scheda Goal e su `media/goals.json`: intenzione vaga → obiettivo misurabile con criteri di successo | minimo; da riadattare ai tool reali dell'harness |
| `pdf` | OpenAI · Apache 2.0 | 67 righe: estrazione tabelle, form, merge, creazione. Oggi `browser` sa solo «stampare la pagina in PDF» | pip ~40 MB, nessun LibreOffice |
| `mcp-builder` | Anthropic · Apache 2.0 | collegare servizi esterni (calendario, note, fatturazione) via MCP | tecnico |
| `security-threat-model` | OpenAI · Apache 2.0 | l'harness è esposto in rete e multi-istanza: modello di minacce su `dashboard.mjs` | basso |

## 4. Cosa **non** prendere

- `webapp-testing` → doppione di `browser`; Playwright qui non c'è.
- `transcribe` → `media-use/scripts/transcribe.mjs` fa già il lavoro.
- `screenshot` → server headless; `browser` fa gli screenshot.
- `doc-coauthoring` → `bookforge` è più adatto e già calibrato sulla voce dell'autore.
- `frontend-design` → sovrapposizione alta con `design-craft`: al massimo si innestano 2-3 tecniche.
- `theme-factory`, `canvas-design`, `algorithmic-art`, `slack-gif-creator`, `brand-guidelines`,
  `internal-comms`, `web-artifacts-builder` → nicchie o sovrapposizioni.
- Blocco dev-ecosistema (Vercel, Supabase, Neon, Terraform, Figma MCP, Expo, Sentry, Cloudflare,
  DuckDB-skill…): richiede account di terzi e non tocca nessun flusso di questa istanza.

## 5. Il buco che nessun catalogo copre

**Documenti d'ufficio.** Oggi questa istanza produce video, libri, grafici, immagini, PDF-di-pagina,
ma per un `.docx`, un `.xlsx` o un `.pptx` non ha nulla. Le skill pronte per farlo sono vietate
dalla licenza (2.1), quindi la strada corretta è **scriverne una nostra** — `documenti` — in
italiano, su `python-docx` + `openpyxl` + `python-pptx` + `pypdf`, con LibreOffice per la
conversione. È l'unica voce di questa lista che aggiunge una capacità che il sistema non ha.

## 6. Comandi pronti (quando si decide di procedere)

```bash
# dipendenze Python dei documenti (nessun privilegio, ~40 MB)
pip3 install --break-system-packages python-docx openpyxl python-pptx pypdf reportlab pdfplumber

# conversione e lettura dei formati legacy (~500 MB: è la voce pesante)
apt-get install -y libreoffice-writer libreoffice-calc libreoffice-impress pandoc

# skill Apache 2.0 pronte (scaricare la cartella, NON le document skills Anthropic)
git clone --depth 1 https://github.com/openai/skills /tmp/openai-skills
git clone --depth 1 https://github.com/anthropics/skills /tmp/anthropic-skills
cp -r /tmp/anthropic-skills/skills/skill-creator /root/pi-harness/skills/
cp -r /tmp/openai-skills/skills/.curated/define-goal /root/pi-harness/skills/
cp -r /tmp/openai-skills/skills/.curated/pdf /root/pi-harness/skills/

# poi, obbligatorio: riscrivere le description e validare
node media/check-skills.mjs
```

Dopo un'importazione va sempre verificato anche `node media/test-skill-collisioni.mjs` (le cartelle
globali `~/.agents/skills` non devono contenere copie reali divergenti).

## 7. Prossimo passo consigliato

1. `skill-creator` (Apache, zero dipendenze) — subito.
2. Skill `documenti` scritta in casa + `pip3 install` delle sei librerie.
3. LibreOffice solo se serve convertire o leggere file `.doc`/`.ppt`/`.xls` vecchi.
