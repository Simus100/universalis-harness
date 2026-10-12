# Parte 2 — gestire la Pagina dall'API ufficiale (dopo la creazione)

Questa parte si può preparare **prima** che la Pagina esista, ed è la strada con cui l'agente
pubblica e legge senza aprire un browser e senza tenere sessioni personali sul server.

## Perché l'API e non il browser

Verificato il 2026-10-12 sulla documentazione Meta:

- **Creare** una Pagina: non esiste una via pubblica via API. La creazione avviene solo
  dall'interfaccia web, con un login autenticato; l'unico edge che crea Pagine è riservato a
  partner selezionati. È il motivo per cui quel primo clic è umano.
- **Gestire** una Pagina (pubblicare post, leggere engagement, moderare commenti) è invece
  esattamente ciò che le Pages API fanno, con i permessi giusti.

Vantaggi concreti rispetto al browser: nessun challenge anti-bot, nessuna sessione del profilo
personale sul server, pubblicazione ripetibile e tracciabile.

## Passi (da fare una volta, mezz'ora)

1. **Pagina creata** dal profilo personale (vedi `pagina-facebook-harness.md`).
   Serve il suo **ID** (Impostazioni → Informazioni sulla Pagina; oppure dall'URL).
2. **App Meta** su developers.facebook.com → *My Apps* → *Create App* → tipo **Business**.
   L'app la crea il titolare, dal suo account: è una cosa che resta sua.
3. **Aggiungere il prodotto "Facebook Login"** e configurare le richieste di permesso per le Pagine.
   Permessi necessari per pubblicare:
   `pages_manage_posts`, `pages_manage_metadata`, `pages_show_list`
   Per leggere e moderare, in più: `pages_read_engagement`, `pages_manage_engagement`.
4. **Generare un token di Pagina**: Graph API Explorer o *Business Settings* → utenti di sistema.
   Il token di Pagina è quello che serve per pubblicare *come* la Pagina.
   Attenzione alla scadenza: i token da utente durano poche ore, quelli di un utente di sistema
   durano a lungo (consigliati per una gestione continuativa).
5. **Mettere i valori in `.env`** (ignorato da git, permessi 600). **Mai in chat, mai nel
   repository, mai in un file sotto `media/`** — `media/` è pubblicato:

```
FB_PAGE_ID=<id della pagina>
FB_PAGE_TOKEN=<token di pagina>
FB_API_VERSION=<versione corrente dell'API, vedi nota>
```

Nota sulla versione: la Graph API usa un numero di versione che cambia ogni pochi mesi
(es. `v23.0`). Va presa dalla documentazione ufficiale al momento del setup, non copiata da qui:
una versione sbagliata risponde con un errore esplicito, ma è tempo perso.

## Cosa potrà fare l'agente, e cosa no

| Azione | Via API | Chi la decide |
|---|---|---|
| Pubblicare un post (testo e immagine) | `POST /{page-id}/feed` / `/photos` | i testi li approva il titolare |
| Leggere le reazioni e i commenti | `GET /{page-id}/posts` | — |
| Rispondere a un commento | `POST /{comment-id}/comments` | firma «Aion», dichiarata come AI |
| Cancellare o modificare un post | `DELETE` / `POST` | solo su richiesta esplicita del titolare |
| Creare la Pagina | non esiste | umano, una volta |

## Paletti che restano

- Nessun messaggio privato a persone reali per conto della Pagina.
- Nessun contenuto pubblicato senza approvazione: l'agente propone, la persona autorizza.
- Ogni contenuto scritto dall'agente è dichiarato nel post; le risposte ai commenti si firmano
  «Aion» e dichiarano la natura AI.
- Niente engagement comprato, niente Pagine clone, niente automazione di interazioni (like,
  follow). Sono le cause più comuni di disabilitazione e non valgono il rischio.

## Cosa resta bloccato per sempre

Il login automatizzato su Facebook da questo host. Il challenge anti-bot non si aggira: se serve
un accesso umano, lo fa una persona — nella live view (con la sessione che resta sul server) o dal
proprio dispositivo. L'API ufficiale rende questa necessità sempre più rara, non la elimina del tutto.
