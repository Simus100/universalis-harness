---
name: social-publish
description: "Pubblica un post su una Pagina Facebook con la Pages API ufficiale di Meta (testo, oppure testo con immagine), verifica che il token di Pagina funzioni, e prepara l'invio senza inviarlo con --dry-run. Usala quando l'utente chiede di pubblicare, programmare o verificare un post su una Pagina Facebook. Non serve per creare una Pagina (non esiste API: si fa dall'interfaccia, da una persona) né per pubblicare su profili personali, gruppi o Marketplace."
---

# Pubblicare su una Pagina Facebook

La strada è l'API ufficiale, non il browser. Motivi: nessun challenge anti-bot, nessuna sessione
di un profilo personale lasciata sulla macchina, pubblicazione ripetibile e tracciabile.

## Prerequisiti (una volta sola, li fa il titolare)

1. La Pagina esiste (creata dall'interfaccia: vedi `media/pagina-facebook-harness.md`).
2. Un'app Meta con i permessi `pages_manage_posts`, `pages_manage_metadata`, `pages_show_list`
   (in più `pages_read_engagement` e `pages_manage_engagement` per leggere e moderare).
3. Un **token di Pagina** messo in `.env`, che è fuori dal repository: `FB_PAGE_TOKEN`
   (obbligatorio), `FB_PAGE_ID` (facoltativo: si ricava dal token), `FB_API_VERSION`. Mai in chat,
   mai in `media/` (quella cartella è pubblicata su GitHub).
   Per gestire **più Pagine**: `FB_USER_TOKEN` (token utente) abilita `accounts` e `use`; ogni
   Pagina ha il suo token, e `use` scrive in `.env` quello scelto — così non si copia nulla a mano.

Il dettaglio passo-passo è in `media/pagina-facebook-api.md`.

## Uso

```bash
# 0. quali Pagine gestisce il token utente (token mascherati, mai in chiaro)
node skills/social-publish/publish.mjs accounts
node skills/social-publish/publish.mjs use 123456789     # sceglie quella e la scrive in .env

# 1. verifica che il token funzioni (una chiamata, risponde con il nome della Pagina)
node skills/social-publish/publish.mjs check

# 2. prova a vuoto: costruisce la richiesta e mostra cosa invierebbe, senza contattare Meta
node skills/social-publish/publish.mjs --dry-run post --text "..." --image media/foto.png

# 3. pubblica davvero
node skills/social-publish/publish.mjs post --text "..." [--image media/foto.png]
```

L'id della Pagina non è indispensabile: con un token di Pagina `check` lo ricava da `GET /me`.
`use` aggiorna `.env` preservando le altre righe e senza mai stampare il token in chiaro.

Il post con immagine fa due chiamate: carica la foto come *non pubblicata* (`published=false`) e
poi la allega al post. Così, se la seconda fallisce, non resta una foto orfana nel feed.

## Regole di condotta (non negoziabili)

- **Si pubblica solo ciò che il titolare ha approvato.** L'agente propone il testo, la persona dice
  sì; poi lo strumento pubblica. Nessun post "a sorpresa".
- **Dichiarazione**: se il contenuto è scritto dall'AI, il testo stesso lo dichiara (per questa
  Pagina la firma è «Aion»). Non è formalismo: è la cosa che rende la Pagina difendibile.
- **Niente contenuti di terzi** senza diritti, niente dati personali di altre persone, niente
  immagini di persone riconoscibili senza consenso.
- **Niente automazione di interazioni**: like, follow, commenti a pioggia, messaggi privati non
  richiesti. Sono la causa più comune di disabilitazione: non valgono il rischio.
- Dopo la pubblicazione, riportare all'utente l'id e l'indirizzo del post.

## Errori tipici e cosa significano

| Errore | Significato | Cosa fare |
|---|---|---|
| codice 190 | token scaduto o non valido | rigenerare il token di Pagina e aggiornare `.env` |
| codice 200 / subcode 2069030 | endpoint non supportato su questa versione API | controllare `FB_API_VERSION` |
| codice 10, 200 | manca un permesso o il ruolo sulla Pagina | verificare i permessi dell'app e il ruolo del titolare |
| codice 4, 17, 32 | limite di frequenza (rate limit) | attendere; non ritentare in ciclo |

## Cosa questa skill non fa, di proposito

- **Non crea Pagine**: non esiste un'API pubblica per farlo (l'unico edge è riservato a partner
  selezionati). La creazione è un'operazione umana dall'interfaccia.
- **Non fa login** su Facebook: l'accesso automatizzato passa per un controllo anti-bot, e
  aggirarlo non è una cosa che facciamo. Se serve un accesso umano, lo fa una persona.
- **Non pubblica su profili personali, gruppi o Marketplace**: le API per quegli ambiti richiedono
  autorizzazioni diverse, e in gran parte non esistono.
