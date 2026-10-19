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
3. **Caso d'uso "Manage everything on your Page" e personalizzazione dei permessi.**
   Le app create oggi (2025-2026) partono da un *caso d'uso* (use case) che porta con sé solo
   `business_management`, `pages_show_list`, `public_profile`: `pages_manage_posts` e gli altri
   **non sono "non disponibili", sono da aggiungere**. Nel pannello dell'app: **Dashboard →
   casi d'uso → «Gestisci tutto nella tua Pagina» → Personalizza** e premere **+ Aggiungi** su
   `pages_manage_metadata`, `pages_manage_posts`, `pages_read_engagement` (in più
   `pages_manage_engagement`, `pages_read_user_content`, `publish_video` se servono). Se il caso
   d'uso non c'è: **Dashboard → Aggiungi caso d'uso → "Manage everything on your Page"**.
   Dopo l'aggiunta il token va **rigenerato**: quello vecchio non contiene i permessi nuovi.
   Verificato sulla doc *Customize the Pages use case* il 18/10/2026. Non serve né App Review né
   Business verification per pubblicare sulla **propria** Pagina con un'app in modalità Sviluppo.
4. **Generare un token di Pagina**: Graph API Explorer o *Business Settings* → utenti di sistema.
   Il token di Pagina è quello che serve per pubblicare *come* la Pagina.
   Attenzione alla scadenza (verificato sulla doc *Long-Lived Access Tokens*, 18/10/2026):
   - `GET /{user-id}/accounts` con un token utente **breve** restituisce un token di Pagina
     **breve** (scade in ore).
   - con un token utente **long-lived** (≈60 giorni, da
     `GET /oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=…`)
     lo stesso `GET /{user-id}/accounts` restituisce un token di Pagina **senza data di scadenza**
     (si invalida solo se cambia password, si revoca l'app o si rimuove il ruolo sulla Pagina).
     È la strada più semplice per avere un token stabile senza Business Manager.
   - in alternativa, il token di un **utente di sistema** di Business Manager: non scade e non
     dipende da una persona, ma richiede un Business account con l'app rivendicata.
   Per pubblicare serve che chi genera il token possa svolgere il task `CREATE_CONTENT` sulla
   Pagina: il campo `tasks` in `/accounts` lo mostra.
5. **Mettere i valori in `.env`** (ignorato da git, permessi 600). **Mai in chat, mai nel
   repository, mai in un file sotto `media/`** — `media/` è pubblicato:

```
FB_PAGE_ID=<id della pagina>
FB_PAGE_TOKEN=<token di pagina>
FB_API_VERSION=<versione corrente dell'API, vedi nota>
```

Nota sulla versione: la Graph API usa un numero di versione che cambia ogni pochi mesi.
**Verificato il 16/10/2026:** la versione corrente è **`v26.0`** (rilasciata il 29/07/2026, senza
data di scadenza annunciata) — è anche quella provata da `publish.mjs` come default. Le versioni
da `v20.0` in giù sono già scadute o in scadenza, quindi non copiare valori vecchi da esempi in rete:
una versione sbagliata risponde con un errore esplicito, ma è tempo perso.

Nota sui permessi: i tre necessari per **pubblicare** sono `pages_manage_posts`,
`pages_manage_metadata`, `pages_show_list`; per **leggere e moderare** reazioni e commenti servono
in più `pages_read_engagement` (in alcune pagine della doc compare con il nome
`pages_manage_read_engagement`) e `pages_manage_engagement`. Se usi un **utente di sistema**, per
generare e gestire il suo token serve anche `business_management`.

## Cosa potrà fare l'agente, e cosa no

| Azione | Via API | Chi la decide |
|---|---|---|
| Pubblicare un post (testo e immagine) | `POST /{page-id}/feed` / `/photos` | i testi li approva il titolare |
| Leggere le reazioni e i commenti | `GET /{page-id}/posts` | — |
| Rispondere a un commento | `POST /{comment-id}/comments` | firma «Aion», dichiarata come AI |
| Cancellare o modificare un post | `DELETE` / `POST` | solo su richiesta esplicita del titolare |
| Creare la Pagina | non esiste | umano, una volta |

Dettagli degli endpoint, verificati il 18/10/2026 sulla reference v26.0:

- `POST /{page-id}/feed` — servono almeno `message` (testo) oppure `link`; `published` (default
  `true`) e `scheduled_publish_time` (timestamp UNIX, da 10 minuti a 75 giorni) per programmare.
- `POST /{page-id}/photos` — `source` (file) oppure `url` (immagine già online), `caption` per il
  testo, `published=false` per caricarla *senza* pubblicarla: poi si allega al post con
  `attached_media=[{media_fbid: <id foto>}]`. Così una foto non resta orfana se il post fallisce.

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
