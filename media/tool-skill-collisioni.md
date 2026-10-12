# Collisioni di nome fra le skill (avvisi nella scheda «Skill»)

Data: **2026-10-12** · Stato: **risolto, con test e strumento di manutenzione**

---

## Il sintomo

La scheda «Skill» mostrava nove avvisi:

```
collision: name "hyperframes" collision — /root/pi-harness/skills/hyperframes/SKILL.md
collision: name "hyperframes-animation" collision — /root/pi-harness/skills/hyperframes-animation/SKILL.md
… (8 skill hyperframes*) …
collision: name "media-use" collision — /root/pi-harness/skills/media-use/SKILL.md
```

## La causa

Le stesse skill esistevano in **due posti**: `skills/` (dentro il codice dell'harness) e
`~/.agents/skills/` (cartella globale, dove pi cerca di default). Nel motore pi, la funzione
`addSkills` fa esattamente questo: la **prima** copia con un certo nome entra nel `skillMap`, la
**seconda** non viene caricata e produce un diagnostico `collision` con `winnerPath`/`loserPath`.

L'ordine di caricamento mette prima le globali e poi `skills/` (che la dashboard passa come
`additionalSkillPaths`): *vinceva la copia globale*, *perdeva* quella dell'harness.

**Non era solo rumore.** `hyperframes-audio` era **diversa** fra le due copie: quella globale
(12/10) aveva correzioni di testo e una sezione in più sul master bus (`data-fx-chain` sulla radice
della composizione) che quella in `skills/` (11/10) non aveva. Con due copie in giro, un
aggiornamento fatto da un lato solo produce un comportamento che dipende dall'ordine di
caricamento: il guasto silenzioso che gli avvisi stavano annunciando. Inoltre `hyperframes-studio`
esisteva **solo** nella copia globale.

## Il vincolo che ha deciso la soluzione

Su questa macchina girano **tre istanze** dell'harness, con cartelle `skills/` diverse:

| Istanza | porzione | skill HyperFrames/HeyGen in locale? |
|---|---|---|
| `pi-harness` (questa) | `--port 8420` | **sì** (10) |
| `tester_01` | `--port 8421` | no |
| `tester08` | `--port 8423` | no |

Le due istanze degli utenti ottengono quelle skill **solo** da `~/.agents/skills`, che è condivisa.
La prima idea — cancellare le copie globali — è stata quindi **scartata**: verificata sul campo,
avrebbe privato `tester_01` e `tester08` di 10 skill.

## La soluzione

**Una sola copia fisica, in `skills/`, e nelle cartelle globali un symlink che la rende
raggiungibile a tutte le istanze.**

Il motivo per cui funziona senza avvisi: pi canonicalizza i percorsi con `realpathSync`, quindi
`skills/hyperframes` e `~/.agents/skills/hyperframes` risultano **lo stesso file reale** e il duplicato
viene saltato in silenzio (nessuna collisione, una sola skill caricata).

Interventi eseguiti:

1. `skills/` è stato **allineato alla versione più recente** (le 10 skill copiate dalla globale) e
   `hyperframes-studio`, che esisteva solo fuori, è entrato nell'harness.
2. Le copie reali in `~/.agents/skills` sono state sostituite da symlink a `skills/`
   (backup in `/root/skills-globali-backup-20261012/`).
3. `~/.claude/skills` **non** è stato toccato: pi non lo legge (non è in `settings.skills`) e non
   produceva avvisi; resta la copia di riserva di Claude Code.
4. La skill **`reverse-engineer-anything`** (di REA) resta volutamente solo in `~/.agents/skills`:
   non ha omonimo in `skills/`, non collide, e copiarla significherebbe pubblicare nel repo codice
   di terzi.

## Verifica

```
node media/test-skill-collisioni.mjs
→ 26 skill caricate, 0 collisioni
  10 raggiunte via symlink (globale → skills), 1 globale (reverse-engineer-anything), 15 dall'harness
tester_01: 19 skill, di cui 10 HyperFrames/HeyGen, collisioni 0
tester08:  18 skill, di cui 10 HyperFrames/HeyGen, collisioni 0
```

Prima dell'intervento gli avvisi erano 9 e `tester_01`/`tester08` non avevano `hyperframes-studio`.

## Manutenzione

`npx hyperframes skills update` (e `init`) **reinstallano nelle cartelle globali** creando copie
reali: la duplicazione può tornare. Dopo un aggiornamento:

```bash
bash scripts/skills-globali-ripulisci.sh            # anteprima: elenca cosa farebbe, non tocca nulla
bash scripts/skills-globali-ripulisci.sh --allinea  # backup, allinea skills/, symlink, verifica
```

`--allinea` assume che la copia globale sia la più nuova (l'hai appena aggiornata col CLI) e per
questo la copia dentro `skills/` **prima** di sostituire il duplicato con il symlink. Le skill
globali senza omonimo in `skills/` non vengono toccate. Il ciclo è stato provato ricreando a mano
una copia reale: l'anteprima la segnala, `--allinea` la sostituisce col symlink e il test conferma
zero collisioni.

`media/test-skill-collisioni.mjs` è anche un guardiano: fallisce (exit 1) su collisioni, su copie
globali divergenti da `skills/`, su copie reali duplicate (identiche) e su symlink rotti o fuori da
`skills/`.
