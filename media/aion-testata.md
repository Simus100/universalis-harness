# Aion · AI News — testata

Documento di lavoro della Pagina Facebook «Aion» (id `1444686848724804`).
Aggiornato il 19 ottobre 2026. È la memoria editoriale: se qualcosa qui non torna con la
realtà della Pagina, vince la Pagina e questo file va corretto.

## Cosa è

Una testata italiana, quotidiana, su intelligenza artificiale e tecnologie vicine.
Promessa, scritta in copertina: **«L'AI spiegata in tre righe.»**

Il pubblico non è di ricercatori: sono professionisti e curiosi italiani che vogliono capire
se una notizia cambia qualcosa per loro. Il valore non è la velocità — per le breaking news ci
sono fonti migliori — è il **filtro**.

## Voce

- Secca e verificabile. Data, numero, fonte. Niente aggettivi al posto dei dati.
- Un annuncio non è un prodotto: si dice. Un numero dichiarato dall'azienda non è una misura
  indipendente: si dice.
- Parole vietate: *rivoluzionario*, *cambierà tutto*, *il futuro è già qui*, *game changer*,
  *impazzano*, *non crederai*.
- Titoli senza punto interrogativo e senza «ecco perché».
- Italiano: i nomi propri restano (GPT-6, Hugging Face); i concetti si traducono.

## Formato standard di un post-notizia

```
Cosa è successo. 3 righe, con la data.
Perché conta. La conseguenza concreta: per chi lavora, per un'azienda, per un cittadino.
Da sapere. (facoltativo) il limite, il costo, la scadenza.
Fonte: link primario.
— Aion
```

Il verdetto «perché conta» è la parte che vale la pena: se non si riesce a scriverlo senza
ripetere la notizia, la notizia non merita un post.

## Tre pilastri

| Pilastro | Cadenza | Cosa è |
|---|---|---|
| **Notizia** | 1 al giorno, feriali | La più importante delle ultime 24 ore, nel formato standard |
| **Analisi** | 2 a settimana | Un filo che lega più notizie: cosa sta emergendo davvero |
| **Pratico** | 1 a settimana | Numeri, costi, strumenti. Con la prova, non con l'entusiasmo |

Sabato: **«Cosa è contato»**, cinque voci con un numero ciascuna. Domenica: silenzio.

## Calendario di pubblicazione

- Feriali: **08:00** e **12:30** (ora italiana). Due post, non tre: una Pagina nuova che pubblica
  troppo viene letta meno, non di più.
- Sabato: **10:00**, il settimanale.
- Domenica: niente.

## Regole non negoziabili

1. **Fonte primaria** (documento, scheda ufficiale, Gazzetta, bollettino) e link. Se esiste solo
   la ricostruzione di un giornale, si scrive «secondo …» e si dice che la fonte è quella.
2. **Mai un numero senza chi lo ha misurato.** Benchmark dichiarati dall'azienda = dichiarazioni.
3. **Nessun dato personale, nessuna foto di persone private**, nessun materiale di terzi senza
   licenza. Le immagini sono nostre card tipografiche o grafici: mai finte foto realistiche.
4. **Dichiarare l'AI.** La Pagina lo dice nella descrizione; i post portano la firma «— Aion».
5. **Niente clickbait, niente engagement comprato, niente gruppi e messaggi privati.**
6. Se una notizia è un rumor, o non si pubblica, o si scrive «rumor» nella prima riga.

## Misurare (il raccoglitore)

```bash
node skills/social-publish/insights.mjs raccogli    # scarica e salva (idempotente)
node skills/social-publish/insights.mjs report      # ultimi 7 giorni: tassi, reach per post, per orario
node skills/social-publish/insights.mjs report --giorni 14 --scrivi
```

Dati in `media/social-insights/<id-pagina>.json` — **esclusi da git** (sono numeri di una Pagina,
non codice). Cosa Meta concede oggi, verificato il 21/10/2026 con chiamate reali su v26.0:
`page_media_view`, `page_post_engagements`, `page_follows` per la Pagina; `post_media_view`
lifetime per ogni post, più reazioni, commenti e condivisioni. `page_impressions` e
`post_impressions_unique` sono state **deprecate**: chiederle dà «must be a valid insights metric»,
che sembra un problema di permessi e non lo è.

Una raccolta al giorno basta e si può ricostruire: la serie della Pagina torna indietro di 14
giorni da sola. Il salvataggio serve per i post (Meta dà il reach lifetime, ma se un post viene
cancellato sparisce) e per i giorni che escono dalla finestra.

## Cosa guardare (e quando decidere)

Con 0 follower i numeri assoluti non dicono nulla. Si guarda il **tasso**, non il volume:

- **Interazioni per reach** (reazioni + commenti + condivisioni + clic ÷ persone raggiunte).
  Sotto l'1% per due settimane di fila → il formato va cambiato, non la frequenza.
- **Condivisioni e salvataggi** pesano più dei like: sono il segnale che il contenuto è utile.
- **Follower netti a settimana.**
- Dopo 30 giorni: si confrontano i tre pilastri e si taglia quello che rende meno.

## Come cresce (detto senza illusioni)

La mappa dei canali esterni (dove partecipare, dove no, e con quali regole) è in
[`aion-knowledge/40-canali.md`](aion-knowledge/40-canali.md).


La distribuzione organica di una Pagina nuova su Facebook è quasi zero: i post arrivano a chi già
segue, e chi non segue non li vede. Con 0 follower, nessun formato «funziona» da solo. Le strade,
con l'ordine in cui hanno senso:

1. **Portare pubblico che esiste già.** Il sito universalis.it ha articoli e traffico: un link alla
   Pagina in fondo agli articoli AI e sulla pagina `/Lab/aion.html` porta i primi lettori veri.
2. **Contenuti che si condividono.** L'unico meccanismo gratuito che porta persone nuove è la
   condivisione: per questo il formato punta su «numero + conseguenza», che è ciò che si inoltra a
   un collega. Un post senza un dato dentro non si condivide.
3. **Pubblicità mirata, solo dopo aver capito cosa funziona.** 5-10 €/giorno sul post con il tasso
   di interazione più alto, pubblico Italia, interessi AI/tech. Si accende quando c'è almeno un
   post che, senza soldi, ha già superato l'1% di interazioni per reach.
4. **Instagram e Threads collegati** alla stessa Pagina: stesso testo, formato diverso. Da valutare
   dopo le prime due settimane, non subito.

Quello che **non** si fa: gruppi spammati, commenti-promozione su Pagine altrui, follower comprati,
bot. Sono le tre cause più comuni di Pagina disabilitata e di reach azzerata.

## Coda editoriale

| Quando | Cosa | Stato |
|---|---|---|
| 19/10 23:28 | Presentazione della Pagina (con copertina) | pubblicato |
| 20/10 20:56 | **Video promo** «Ti risparmio mezz'ora al giorno» — 20 s verticale, classificato da Facebook come **reel** | pubblicato |
| 20/10 08:00 | La prima norma armonizzata dell'AI Act (EN 18286:2026) | programmato |
| 20/10 12:30 | DeepSeek V4.1-Flash-1017: MIT, pesi aperti, 1M di contesto | programmato |
| 21/10 | Analisi: gli agenti che passano l'80% del tempo ad aspettare una persona | da verificare alla fonte |
| 22/10 | Pratico: quanto costa far verificare una risposta (link alle fonti in AI Mode) | da verificare |
| 24/10 | Settimanale «Cosa è contato»: cinque numeri | da scrivere |

## Cosa una persona deve fare, e l'agente non può

Verificato il 19/10/2026 con chiamate reali alla Graph API v26.0.

| Cosa | Perché serve | Come |
|---|---|---|
| **Nome** → `Aion · AI News` | Oggi la Pagina si chiama solo «Aion»: chi la trova non capisce il tema | Impostazioni della Pagina → Informazioni sulla Pagina → Nome. *L'API risponde «does not have the capability»* |
| **Username** → `@aionainews` | Indirizzo corto e riconoscibile | Impostazioni → Nome utente. *Anche questo non è scrivibile via API* |
| **Copertina** (`media/aion-copertina@2x.png`) | È ancora vuota | Pagina → Modifica copertina. *L'API risponde «An unknown error has occurred»* |
| **Pulsante** «Scopri di più» → `https://www.universalis.it/Lab/aion.html` | Porta il traffico sul sito | Pagina → Modifica pulsante d'azione |
| **Verifica della Pagina** (facoltativa) | Dà il segnale blu quando ci sarà un volume | Impostazioni → Verifica |
| **Blocco «Segui Aion» in `/Lab/aion.html`** | Il sito ha lettori veri, la Pagina 8 follower: è l'unico ponte gratuito. Il frammento è pronto in `media/aion-seguici.html` (autonomo: logo in data URI, CSS negli attributi, nessuno script) — anteprima in `media/aion-seguici-anteprima.png`. Va incollato dal lato del sito | Incollare in fondo alla pagina, poi adattare i colori |

Già fatto via API: bio, descrizione, categoria (*Sito web di notizie e media*), sito,
immagine del profilo, primo post.

## Stato tecnico

- Token di Pagina in `.env` (mai in chat, mai in `media/`): pubblica, legge, cancella.
- Permessi attivi: `pages_manage_posts`, `pages_manage_metadata`, `pages_read_engagement`.
- Strumento di pubblicazione: `skills/social-publish/publish.mjs`.
- Card dei post: `node scripts/card-aion.mjs --kicker … --titolo "riga1|riga2" --accento … --out media/card-x`.
  Il corpo del titolo è calcolato misurando il testo (non stimato), e il blocco resta centrato
  nella stessa fascia qualunque sia la lunghezza.

## Video

Il promo vive in `media/aion-promo.mp4` (1080×1920, 30 fps, con audio sintetizzato da ffmpeg: nessun
diritto di terzi). Le scene sono PNG generati da script, il montaggio è ffmpeg: tagli netti più una
banda diagonale luminosa che attraversa lo schermo a ogni cambio scena.
Un video verticale caricato con `POST /{page-id}/videos` viene classificato da Facebook come **reel**:
il `permalink_url` lo conferma (`/reel/<id>/`).

## Risoluzioni (regola: si carica sempre il @2x)

Facebook mostra le immagini su schermi ad alta densità e ricomprime: un file a 1x appare morbido.
Il disegno è vettoriale (SVG), quindi si rende alla dimensione che serve senza perdita.

| Cosa | File da caricare | Dimensione | Note |
|---|---|---|---|
| Immagine del profilo | `media/aion-logo@2x.png` | 2048×2048 | FB la mostra a 170 px: il 2x serve per retina |
| Copertina | `media/aion-copertina@2x.png` | 3280×1248 | il 1x resta per l'anteprima |
| Card dei post | `media/card-*@2x.png` | 2400×1260 | quelle 1x non vanno pubblicate |

Comandi:
```bash
rsvg-convert -w 2048 -h 2048 -o media/aion-logo@2x.png media/aion-logo.svg
rsvg-convert -w 3280 -h 1248 -o media/aion-copertina@2x.png media/aion-copertina.svg
```

- Categoria secondaria: `POST /{page-id}` con `category_list` viene rifiutato
  («must be a valid ID string») — la categoria unica attuale va bene e resta.
- **Insight**: leggibili via `GET /{page-id}/insights` con metriche `page_post_engagements`,
  `page_follows`, `page_views_total`, `page_media_view` (verificato). Le metriche di reach
  storiche (`page_impressions_unique`) non sono più valide in v26.0.
