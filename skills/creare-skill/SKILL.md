---
name: creare-skill
description: "Scrive, corregge e verifica una skill di questo harness nel formato Agent Skills (cartella con SKILL.md, frontmatter name+description, corpo e scripts). Usa quando l'utente chiede di creare una nuova skill, di far attivare una skill che non si carica mai, di correggere una description, di importare una skill da un repository esterno, o di allineare le skill delle istanze dei tester. Non serve per scrivere un documento o una guida che non sia una skill."
---

# Creare una skill

Una skill è una cartella con un `SKILL.md`. Il modello non legge il corpo: all'inizio della
sessione vede **solo `name` e `description`** di tutte le skill caricate, e apre il corpo quando
decide che quella skill serve. Da qui due conseguenze che governano tutto il resto:

1. la `description` è l'unica cosa che fa attivare la skill — se non dice *quando* usarla, la skill
   non esiste, per quanto sia scritta bene;
2. il corpo si legge solo quando serve, quindi i dettagli possono essere lunghi, ma vanno messi
   dove non costano (vedi *disclosure progressiva*).

## Anatomia minima

```
skills/nome-della-skill/
├── SKILL.md          obbligatorio: frontmatter + istruzioni
├── scripts/          facoltativo: codice eseguibile, invocato dal corpo
├── references/       facoltativo: documenti lunghi, letti on demand
└── assets/           facoltativo: modelli, immagini, file da copiare
```

```markdown
---
name: nome-della-skill
description: "Cosa fa, in una frase, e poi quando usarla: «Usa quando l'utente chiede …». Dì anche quando NON serve, se rischia di attivarsi a sproposito."
---

# Titolo

Istruzioni operative: cosa fare, in che ordine, con quali comandi.
```

## Le regole che il validatore di casa controlla davvero

`node media/check-skills.mjs` è la fonte di verità (usa lo stesso parser YAML di pi). Cosa fa
fallire l'intera suite:

| Regola | Perché |
|---|---|
| `name` minuscolo, solo `[a-z0-9-]`, max 64 caratteri, **uguale al nome della cartella** | è la chiave con cui la skill viene indirizzata |
| `description` presente, max 1024 caratteri | entra nel contesto iniziale |
| niente markup attivo nella description (`<script>`, `on…=`) | la description è testo, non pagina |
| **YAML valido** | un `:` seguito da spazio dentro un valore non quotato rompe il parser: `("Chrome headless): apri pagine")` fa fallire il caricamento. Se il valore contiene `: `, mettilo tra virgolette doppie |

E cosa produce solo un avviso (da non ignorare: sono i difetti che si vedono in esercizio):

- la description non contiene una formula di *quando* (`usa quando`, `usala quando`, `serve a`,
  `quando`, `use when`): è l'avviso numero uno di questo harness
- il corpo supera 400 righe non vuote
- manca un titolo `# …` all'inizio del corpo
- un link markdown relativo punta a un file che non esiste (`[scripts/x.py](scripts/x.py)`) — il
  controllo è reale, quindi crea il file o non linkarlo

## La description: la sola cosa che decide se la skill vive

Struttura che funziona: *cosa fa* + *quando usarla* + *quando non usarla*, con le parole che
l'utente userebbe davvero.

Buona:

> "Crea, modifica ed estrae contenuti da documenti d'ufficio: Word (.docx), Excel (.xlsx),
> PowerPoint (.pptx) e PDF. Usa quando l'utente chiede una relazione, un preventivo, un foglio di
> calcolo con formule, una presentazione o un PDF impaginato. Per guardare un PDF basta la skill
> immagini; per un video servono le skill HyperFrames."

Debole:

> "Strumenti per i documenti."

Scrivi i termini concreti che compariranno nella richiesta (nomi di formato, di strumento, di
prodotto), non le categorie astratte. Se due skill si contendono lo stesso innesco, aggiungi la
frase che le separa — altrimenti si attiva quella caricata per prima, e non è mai una sorpresa
piacevole.

## Disclosure progressiva

Il corpo può essere ricco, purché le cose lunghe stiano fuori:

- `SKILL.md`: procedura e regole, **sotto le 400 righe**; tabelle e comandi sì, trattati no
- `references/`: schemi, specifiche, esempi lunghi — linkati dal corpo, letti solo se servono
- `scripts/`: codice che deve essere eseguito, non riscritto a ogni uso (è la differenza fra una
  skill che funziona e una che viene reinterpretata ogni volta)
- `assets/`: file da copiare o modellare

Niente percorsi assoluti: una skill viaggia fra istanze con `HOME` e radici diverse. Usa percorsi
relativi alla skill, `$HOME`, la radice dell'istanza ricavata da `${BASH_SOURCE[0]}`, e `media/`
per gli output.

## Dichiarare le dipendenze (e non promettere ciò che non c'è)

Una skill che usa `python-docx` deve dire che serve, e cosa fare se manca. In questo harness le
istanze dei tester **non possono installare nulla** (nessun `sudo`, `ProtectSystem=strict`): le
dipendenze di sistema le mette chi amministra, una volta, e valgono per tutte le istanze.

Prima di scrivere «usa `soffice`», verifica che esista: `command -v soffice`. Se non c'è, la skill
deve degradare in modo dichiarato («senza LibreOffice non converto, produco PDF con reportlab»),
non fallire al primo comando.

## Importare una skill da fuori

1. **Licenza per prima.** Il repository di questo harness è pubblico: `skills/` viene pubblicato.
   Apache 2.0 e MIT vanno bene (con attribuzione nel corpo); le skill «all rights reserved» /
   source-available **non si copiano** (per esempio le document skills di Anthropic: vietano
   l'estrazione).
2. **Description riscritta**: in italiano, con la formula del *quando*. Quelle originali spesso non
   si attivano.
3. **Dipendenze controllate**: le skill serie presuppongono sandbox con pacchetti «preinstalled»
   che qui non esistono. Elencale e verificale una per una.
4. **Nome**: niente collisioni con le skill esistenti (`ls skills/`), né copie reali nelle cartelle
   globali (`~/.agents/skills`): lì deve esserci un symlink, altrimenti pi carica una e segnala
   l'altra come collisione.
5. **Potatura**: togli le sezioni specifiche di altri host (Claude.ai, Cowork, plugin marketplace di
   Claude Code) e gli script che invocano binari che qui non esistono.

## Verifica, nell'ordine

```bash
node media/check-skills.mjs          # frontmatter, description, avvisi: deve finire con 0 falliti
node media/test-skill-collisioni.mjs # nessuna copia reale divergente, nessun symlink rotto
ls skills/<nome>/                    # i file linkati esistono davvero
bash skills/<nome>/scripts/<x>.sh --help   # gli script partono, non solo esistono
```

Il watcher della dashboard osserva `skills/` e ricarica **senza riavvio**. Un `dashboard.mjs`
modificato invece richiede il riavvio del servizio.

## Propagare alle istanze dei tester

Le skill sono **per istanza**: non si propagano da sole.

```bash
bash scripts/skills-sync-istanze.sh              # anteprima: cosa manca, cosa diverge
bash scripts/skills-sync-istanze.sh --applica    # copia, chown, sistema i symlink, verifica
```

Lo script salva in `/root/harness-skills-backup-<data>/<istanza>/` ciò che sostituisce, assegna i
file all'utente dell'istanza e si astiene dal copiare nelle istanze che condividono la `HOME` di
root (là le skill sono già raggiungibili via symlink e una copia reale creerebbe collisione).
Dopo, verifica che l'istanza veda la skill con il suo ambiente reale, non il tuo.

## Errori visti succedere qui

- description senza «quando»: la skill si carica ma non si attiva mai (8 casi su 16 in un
  controllo del 2026-11);
- `: ` dentro il valore YAML non quotato: la skill sparisce con un warning facile da perdere;
- due copie reali della stessa skill (una in `skills/`, una in `~/.agents/skills`): vince la prima
  caricata, in silenzio;
- skill che promette comandi di cui nessuno ha verificato l'esistenza;
- corpo di 700 righe con dentro un trattato: costa a ogni lettura e nessuno lo legge fino in fondo.

## Attribuzione

Il metodo di questa skill riprende le idee di `skill-creator` di Anthropic (licenza Apache 2.0:
progressive disclosure, description come innesco, eval delle skill), **riscritte** per il
validatore e le convenzioni di questo harness. Gli script di valutazione originali non sono stati
importati: invocano `claude -p`, che qui non esiste.
