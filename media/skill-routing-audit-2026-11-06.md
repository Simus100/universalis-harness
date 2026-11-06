# Audit dell'attivazione delle skill — 2026-11-06

Domanda dell'audit: **la descrizione di ogni skill basta a farle attivare il modello quando serve, e a non farlo sbagliare quando non serve?**

Metodo: lettura del loader reale (`DefaultResourceLoader` di pi, stessa config della dashboard),
misura di cosa finisce davvero nel system prompt, batteria di 28 richieste realistiche in italiano
confrontate con il testo delle descrizioni, verifica dei riferimenti incrociati tra system prompt,
`docs/`, `dashboard.mjs` e skill.

---

## 0. Il meccanismo, per non partire da un'ipotesi sbagliata

Le skill **entrano sempre** nel contesto, ma solo la loro *descrizione*: a ogni turno il system
prompt contiene, per tutte le skill abilitate, `name` + `description` + `location`
(`formatSkillsForSystemPrompt` in pi). Il **corpo** di `SKILL.md` non entra mai da solo: il modello
deve decidere di leggerlo.

Quindi il problema non è «non le vede», è «decide male»:

1. **non la carica** → la descrizione non contiene la parola che l'utente ha usato;
2. **carica quella sbagliata** → due descrizioni si contendono lo stesso intento senza un confine;
3. **si perde il turno** → la descrizione o il prompt la mandano a un percorso che non esiste;
4. **paga troppo** → il blocco è fisso in ogni turno, e una descrizione lunga occupa attenzione
   che serve alle altre.

## 1. Misure

| grandezza | valore |
|---|---|
| skill visibili al modello | 33 |
| blocco `<available_skills>` in ogni turno | ~20.570 caratteri (~5.700 token) |
| di cui descrizioni | 16.653 caratteri (~4.600 token) |
| descrizioni in inglese | 15 su 33 |
| descrizioni con una frase di esclusione («non serve per», «don't use for») | 18 su 33 |
| descrizioni sopra i 500 caratteri | 17 su 33 |
| quota del cluster video/media sul budget descrizioni | 8.360 / 16.653 = **50%** |
| collissioni di nome, YAML non validi, name incoerenti | **nessuna** (96 ok, 0 falliti) |

Lo stato di base è sano: frontmatter validi, nomi coerenti con la cartella, symlink delle globali
corretti. I problemi sono tutti di **testo**, non di impianto.

## 2. Problemi trovati, in ordine di gravità

### P1 — Il system prompt manda a una skill che non esiste (`rizzo-flow`)

`dashboard.mjs` (blocco «Decisore tipizzato locale», due occorrenze) scrive:

> «leggi la skill `rizzo-flow` prima di usarli»

La skill si chiama **`decision-m`**. Un modello che obbedisce prova
`read skills/rizzo-flow/SKILL.md`, non trova niente e consuma un turno; nel caso peggiore usa
`decision_m` senza le regole della skill. Costo del fix: una riga.

### P2 — La porta d'ingresso dell'utente e quella tecnica si contendono la stessa richiesta

- `video`: «Usala quando l'utente chiede un video, un filmato, una presentazione animata…»
- `hyperframes`: «Mandatory entry point: read this first for **any** request to make… a video»

Due skill si dichiarano entrambe punto d'ingresso obbligatorio per la stessa frase. Se il modello
carica `hyperframes` per «fammi un video», salta il corpo di `video`, che è dove sta la decisione
che conta (serve un file renderizzato o basta un'animazione? quanto costa?) e che è in italiano.
Nessuna delle due descrizioni dice chi viene prima.

### P3 — 15 descrizioni su 33 sono in inglese, in un harness che parla italiano

Tutto il cluster video è in inglese: `hyperframes`, `hyperframes-*` (9), `media-use`,
`motion-graphics`, `general-video`, `faceless-explainer`, `product-launch-video`,
`reverse-engineer-anything`. L'utente e il system prompt sono in italiano.

Batteria di prova (match lessicale diretto sulla descrizione):

| richiesta reale | esito |
|---|---|
| «questo video è troppo scuro, sistemalo» | `media-use` **0** (ha solo «footage looks dark») |
| «smonta questo binario e dimmi cosa fa» | `reverse-engineer-anything` **0** |
| «show me the trailer» | nessun candidato |
| «fammi un video promo del sito» | `faceless-explainer` 6,8 — `product-launch-video` 3,8 (la promo è sua) |
| «spiega questa cosa in un video» | `faceless-explainer` 4,6 — `video` 3,1 |

Il repo si era già accorto del sintomo: `check-skills.mjs` ha dovuto aggiungere una regex
**bilingue** per gli avvisi, ed esiste la skill `video` in italiano come «porta». Ma la porta copre
solo il video: audio, media, reverse engineering restano senza aggancio in italiano.

### P4 — Metà del budget descrizioni per 15 skill che non fanno routing verso l'utente

Le `hyperframes-*` sono **sotto-skill di un workflow**: si caricano *dopo* l'entry point, quindi la
loro descrizione non deve convincere il modello a sceglierle fra 33, deve solo dire «dentro il
lavoro, quando leggermi». Oggi fanno routing ampio e contendono:

- `hyperframes-animation`: «Use for **any** motion or animation task»
- `hyperframes-cli`: elenca ~40 verbi CLI (`init, add, catalog, capture, lint, check, snapshot,
  compare, grade-compare…`) — è il *cosa* del corpo, non il *se*; 577 caratteri che non aiutano a
  decidere e invecchiano a ogni release;
- `hyperframes-registry` (892 caratteri, la più lunga di tutte): 8 nomi di effetto + 6 comandi.

### P5 — `rea-cli` e `reverse-engineer-anything`: due skill per lo stesso lavoro, che non si parlano

Stesso dominio, una in italiano (`rea-cli`, nel repo) e una in inglese
(`reverse-engineer-anything`, che vive **solo** in `/root/.agents/skills/` come copia reale, fuori
dal repo e senza symlink: per questo il loader vede 33 skill mentre `skills/` ne contiene 32).
Nessuna delle due nomina l'altra: la scelta dipende dalla lingua della richiesta, non dal compito.

### P6 — Il confine PDF tra `immagini` e `documenti` è asimmetrico

`documenti` ha l'esclusione giusta («Per guardare un PDF o un'immagine basta la skill immagini»),
`immagini` no: rivendica «leggere un PDF o cercarci dentro» e anche «come si produce un video con
HyperFrames» (che è territorio di `video`). Su «leggi questo pdf e dimmi cosa c'è scritto» i
candidati sono tre a pochi decimi di distanza (`browser` 7,9 — `documenti` 6,7 — `immagini` 6,7).

Da notare che `browser` («leggi il contenuto… estrai dati») è il tappo di molti intenti e non ha
nessuna esclusione: «leggi questa fattura che ti ho caricato» lo mette davanti a `documenti`.

### P7 — Buchi lessicali: la descrizione descrive il contenuto, non i casi d'uso

Le descrizioni migliori contengono le parole che l'utente pronuncia. Alcune no:

| richiesta | candidati | manca |
|---|---|---|
| «prevedi le vendite del mese prossimo» | nessuno | `timestral` non ha «vendite», «fatturato», «previsione di» |
| «disegnami come funziona il processo» | nessuno | `visual-representation` non ha «disegna», «schema», «fammi vedere» |
| «secondo te conviene procedere?» | nessuno | `decision-m` non ha «conviene», «è meglio», «scegli fra» |
| «ricordati questa decisione» | `memoria` 2,9 | il verbo dell'utente non c'è, c'è solo «registrare una decisione» |

### P8 — `timestral` e `decision-m` duplicano il system prompt

Entrambe ripetono nella descrizione numeri e regole che stanno già nel prompt dell'istanza
(RAM, «non serve chiedere permesso», «mediana e quantili», bande 80/95%): ~1.200 caratteri pagati
due volte, e vince comunque il prompt.

### P9 — Avvisi noti e non chiusi

- `motion-graphics`: nessuna frase «quando usarla» (solo «Longer/narrated → /general-video»);
- `social-connect` e `hyperframes-audio`: la descrizione cita tag `<…>`, che alcuni host mostrano o
  rimuovono;
- `creare-skill`: cita `scripts/x.py` che non esiste (esempio, ma il check lo segnala).

## 3. Cosa funziona già (modello da imitare)

- `social-connect` / `social-publish`: si citano a vicenda e ognuna dice cosa **non** è («Non serve
  per pubblicare un post, quella è `social-publish`»). È il formato che regge meglio;
- `bookforge`, `obiettivi`, `memoria`, `creare-skill`, `giochi`: italiano, verbo dell'utente,
  confine esplicito («Non serve per le pianificazioni a orario»);
- `design-craft` → `report-dataviz` → `visual-representation`: catena dichiarata, nessuna ambiguità;
- il **nome** della skill è spesso più forte della descrizione: per `giochi`, `obiettivi`, `memoria`,
  `documenti` l'attivazione la fa la parola nel nome.

## 4. Correzioni proposte, per rapporto valore/rischio

| # | intervento | file | rischio |
|---|---|---|---|
| A | `rizzo-flow` → `decision-m` (2 punti) | `dashboard.mjs` | nullo |
| B | Riscrivere in italiano le 15 descrizioni inglesi, tenendo i termini tecnici come alias («video, clip, footage») | `skills/*/SKILL.md` | basso, ma le `hyperframes-*` vengono sovrascritte da `npx hyperframes skills update` |
| C | Subordinare esplicitamente: `video` = porta dell'utente; `hyperframes` = contratto tecnico, si legge dopo | 2 descrizioni | nullo |
| D | Sfoltire le `hyperframes-*` a ruolo + quando (≤250 caratteri), elenchi nel corpo | 9 descrizioni | libera ~4.000 caratteri/turno |
| E | Una riga di esclusione per ogni skill che ha una sorella (browser, immagini, rea-cli, video, media-use) | ~6 descrizioni | nullo |
| F | `rea-cli` ↔ `reverse-engineer-anything`: una sola sopravvive, l'altra diventa symlink nel repo o viene assorbita | `skills/`, `~/.agents/skills` | medio (skill fuori repo) |
| G | Aggiungere i verbi dell'utente alle 4 skill con buco lessicale | 4 descrizioni | nullo |

## 5. Come verificare che il routing migliori (non a occhio)

Oggi nessun test misura l'attivazione: `check-skills.mjs` controlla il *formato*, non il *routing*.
Proposta: `media/test-skill-routing.mjs` con una batteria di ~30 richieste in italiano
`{ richiesta, skill_attesa, termini_obbligatori }` che verifica, in modo deterministico, che la
descrizione della skill attesa contenga i termini dell'utente. Non prova che il modello scelga
giusto, ma blocca la regressione che si è già verificata (descrizione riscritta, parola
dell'utente sparita) e costa zero token di runtime.
