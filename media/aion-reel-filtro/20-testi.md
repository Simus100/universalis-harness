# Testi del reel e testo del post

## I testi nel video (già dentro `overlay/beat*.png`)

| Tempo | Riga mostrata | Note |
|---|---|---|
| 0,0 – 5,0 | `AION · AI NEWS` / **Ogni giorno: annunci, demo, benchmark.** | il kicker dice di che cosa si tratta prima che lo dica il titolo |
| 5,0 – 10,0 | **Quasi niente ti cambia la giornata.** | "quasi niente" senza cifre: nessun numero non misurato (regola 2) |
| 10,0 – 13,4 | **Ne restano poche. Le scegliamo noi.** | il soggetto è la redazione: è la promessa del filtro |
| 13,4 – 17,2 | **L'AI spiegata in tre righe.** / *Aion · AI News — ogni giorno, con la fonte* | la promessa della copertina, parola per parola |

Nessun punto interrogativo, nessun «ecco perché», nessuna parola della lista vietata
(`media/aion-testata.md`). Il video non promette velocità: promette **scelta**.

## Testo del post da pubblicare

```
Ogni giorno arrivano annunci, demo e benchmark. Quasi niente cambia la tua giornata: quello che
resta va scelto, e vale la pena sapere chi lo ha misurato.

Aion è una testata italiana sull'AI. Una notizia al giorno, due analisi e un pezzo pratico a
settimana: tre righe, la conseguenza concreta, la fonte primaria linkata.

Segui la Pagina se ti serve il filtro, non il rumore.

— Aion   Pagina scritta con l'AI. Fonti sempre linkate.
```

Perché così: la prima riga dice il problema (rumore), la seconda il metodo (3 righe + fonte), la
terza l'invito in una frase sola. La firma e la dichiarazione dell'AI restano — è la regola 4.

**Da non aggiungere**: hashtag a raffica (su Facebook non portano reach e stonano con la voce
della testata; al massimo `#intelligenzaartificiale`), chiamate del tipo «commenta sì», link a
gruppi, inviti in messaggio privato.

## Pubblicazione

Il verticale caricato su `POST /{page-id}/videos` viene classificato da Facebook come **reel**
(permalink `/reel/<id>/`): è già verificato con il promo del 20/10.

```bash
node skills/social-publish/publish.mjs --dry-run post --text "<testo>" --video media/aion-reel-filtro/aion-reel-filtro.mp4
node skills/social-publish/publish.mjs post --text "<testo>" --video media/aion-reel-filtro/aion-reel-filtro.mp4
```

`--video` è stato aggiunto a `publish.mjs` in questa sessione: prima esisteva solo `--image`.

## Cosa guardare dopo, per decidere se rifarlo

I numeri della Pagina sono in `media/social-insights/1444686848724804.json`
(`node skills/social-publish/insights.mjs raccogli` poi `… report`). Con 8 follower il volume non
dice niente: conta **interazioni ÷ persone raggiunte**. Se il reel resta sotto l'1% per due
settimane, il formato va cambiato — non la frequenza. Le condivisioni pesano più dei like: un reel
che nessuno inoltra a un collega, per questa Pagina, non ha funzionato.
