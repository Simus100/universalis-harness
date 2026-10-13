# Da zero alla prima pubblicazione — guida unica, passo passo

Percorso completo in ordine. Ogni passo dice **cosa fare**, **cosa aspettarsi** e **come
verificarlo**. I testi da copiare sono già scritti e contati nei caratteri: non c'è niente da
inventare.

Tempo: **Parte 1: 5 minuti. Parte 2: 20-30 minuti. Parte 3-4: 2 minuti.**

---

## Parte 0 — cosa hai già in mano

| File | A cosa serve |
|---|---|
| `media/pagina-facebook-harness.md` | testi della Pagina (nome, bio, descrizione, primi 3 post) |
| `media/pagina-facebook-logo.png` | immagine del profilo (1024×1024) |
| `media/pagina-facebook-copertina.png` | copertina (1640×624) |
| `media/pagina-facebook-api.md` | riferimento tecnico dei permessi e del token |
| `skills/social-publish/publish.mjs` | lo strumento che pubblica (già scritto e testato) |

Scarica i due PNG dal file manager della dashboard: servono dal telefono o dal computer.

---

## Parte 1 — Creare la Pagina (5 minuti, dal tuo profilo esistente)

Prerequisito: sei connesso con il **tuo** profilo Facebook (quello che già esiste). Non l'account
nuovo, non un profilo apposta.

1. Vai su **facebook.com/pages/create** (oppure: menu a sinistra → *Pagine* → *Crea Pagina*).
2. Scegli **Pagina pubblica** → *Avanti* → *Inizia*.
3. **Nome**: incolla `Universalis Harness` — 19 caratteri, limite 75.
4. **Categoria**: scrivi `Software` e scegli la voce che compare. Se ne chiede una seconda,
   `Informatica`.
5. **Bio**: incolla
   `Agente AI self-hosted: lavora sui tuoi file, con dashboard, memoria e browser pilotato.`
   (87/100 caratteri)
6. Premi **Crea Pagina**. La Pagina esiste.
7. **Immagine del profilo**: carica `pagina-facebook-logo.png`.
8. **Copertina**: carica `pagina-facebook-copertina.png`.
9. **Impostazioni Pagina → Informazioni → Descrizione**: incolla
   `Pagina ufficiale di Universalis Harness, agente AI self-hosted: legge e scrive i tuoi file, ricorda le decisioni, gestisce obiettivi e pianificazioni e pilota un browser. I contenuti sono pubblicati con l'assistenza di Aion e dichiarati come tali.`
   (247/255 caratteri)
10. Nella stessa sezione, se c'è un campo **Sito web**, metti l'indirizzo del repository:
    `https://github.com/Simus100/universalis-harness`
11. **Non pubblicare ancora i post**: prima si collega l'API (Parte 2). Così i primi post li
    pubblico io e restano tracciati.
12. **Verifica**: apri la Pagina in incognito. Devi vedere nome, logo, copertina, bio e la
    descrizione. Se la copertina appare tagliata male, dimmelo: la rifaccio.

**Nota**: le voci dell'interfaccia Meta cambiano nome ogni tanto. Se non trovi "Pagina pubblica" o
"Informazioni", cerca il concetto equivalente (creare una pagina per un'azienda/progetto e la
sezione con la descrizione lunga). I campi che contano sono: nome, categoria, bio, descrizione,
due immagini.

---

## Parte 2 — App Meta e token di Pagina (20-30 minuti, una volta sola)

Serve un "'lasciapassare" che autorizzi la pubblicazione sulla tua Pagina, senza mai usare la tua
password e senza mai fare login automatico.

1. Vai su **developers.facebook.com** e accedi con lo stesso profilo → in alto a destra
   **My Apps** → **Create App**.
2. Nome dell'app: `Universalis Harness Publisher`. Tipo: **Business** (se chiede altro, "Altro").
   L'app è tua e resta tua.
3. Nella schermata dell'app: **Add Product** → aggiungi **Facebook Login**.
   Serve a ottenere il token con i permessi sulle Pagine.
4. Se l'app parte in **modalità sviluppo**, va benissimo: per pubblicare sulla Pagina di cui sei
   amministratore non serve la revisione di Meta. Le revisioni servono per usare l'app *per conto
   di terzi*, non per te.
5. **Genera il token di Pagina** — strada rapida, per provare subito:
   - apri **Graph API Explorer** (developer.facebook.com/tools/explorer), seleziona la tua app;
   - in *Permissions* aggiungi: `pages_show_list`, `pages_manage_posts`, `pages_manage_metadata`;
   - **Generate Access Token** e autorizza la Pagina quando richiesto;
   - chiama `GET /me/accounts` → nella risposta trovi la tua Pagina con il campo `access_token`:
     **quello è il token di Pagina** (non quello dell'utente).
   - Copia anche il campo `id` della Pagina: è il `FB_PAGE_ID`.
6. **Token che dura** (consigliato, per non rifarlo ogni due mesi): in **Business Settings →
   Utenti di sistema** crea un utente di sistema, assegnagli la Pagina con ruolo amministratore,
   genera un token con gli stessi tre permessi. Questo token dura molto più a lungo e non dipende
   dalla tua sessione nel browser.
7. **Verifica** che il token sia quello giusto: un token di *Pagina* inizia con una stringa lunga e
   quando lo usi risponde con il nome della Pagina (lo controlliamo nel passo 3 della Parte 4).

**Da sapere**: il token di Pagina è una password operativa per la tua Pagina. Non incollarlo in
chat, non metterlo in un file dentro `media/` (quella cartella finisce su GitHub). Va in `.env`.

---

## Parte 3 — Mettere i valori in `.env` (1 minuto)

Da terminale sulla macchina dell'istanza:

```bash
nano /root/pi-harness/.env
```

Aggiungi in fondo (sostituendo i segnaposto):

```
FB_PAGE_ID=<l'id della Pagina>
FB_PAGE_TOKEN=<il token di Pagina>
FB_API_VERSION=v26.0
```

Salva (`Ctrl+O`, invio, `Ctrl+X`). Il file è già ignorato da git e a permessi `600`.

---

## Parte 4 — Verificare e pubblicare (2 minuti)

```bash
# 1. il token funziona? (una chiamata: risponde con il nome della Pagina)
node skills/social-publish/publish.mjs check

# 2. prova a vuoto: mostra cosa invierebbe, senza contattare Meta
node skills/social-publish/publish.mjs --dry-run post --text "prova" --image media/pagina-facebook-copertina.png

# 3. pubblica il primo post (lo faccio io, su testo che approvi)
node skills/social-publish/publish.mjs post --text "<testo approvato>" --image media/pagina-facebook-copertina.png
```

Esito atteso al passo 1: `autenticato come Pagina: «Universalis Harness» (id …, follower 0)`.
Esito atteso al passo 3: `pubblicato. id del post: …` più l'indirizzo `facebook.com/…` da aprire.

---

## Parte 5 — Cosa fa l'agente da qui in avanti

- Scrive i post partendo dai testi già approvati, li pubblica via API e riporta id e indirizzo.
- Legge reazioni e commenti; prepara le risposte, firmate «Aion», dichiarate come scritte dall'AI.
- Su richiesta: programma un post per una data futura (`scheduled_publish_time`, da 10 minuti a
  30 giorni) — funzione disponibile nell'API, da aggiungere allo strumento quando la vuoi.
- Non pubblica nulla senza approvazione; non manda messaggi privati; non automatizza like, follow
  o commenti. Non crea Pagine e non fa login automatici.

---

## Parte 6 — Se qualcosa non va

| Sintomo | Causa probabile | Rimedio |
|---|---|---|
| `check` → errore codice 190 | token scaduto o copiato male | rigenera il token di Pagina e aggiorna `.env` |
| `check` → errore codice 10 / 200 | manca un permesso o il ruolo sulla Pagina | verifica i tre permessi e di essere admin della Pagina |
| `check` → `configurazione incompleta` | variabili assenti in `.env` | controlla i nomi: `FB_PAGE_ID`, `FB_PAGE_TOKEN` |
| codice 200 subcode 2069030 | `FB_API_VERSION` non più supportata | metti la versione corrente indicata dalla doc Meta |
| Meta chiede la revisione dell'app | stai usando l'app per conto di terzi | per la tua Pagina non serve: resta in modalità sviluppo |
| La Pagina non compare in `/me/accounts` | ruolo mancante sulla Pagina | in Impostazioni Pagina → Ruoli, aggiungiti come amministratore |

---

## Le due cose che restano in mano tua, e contano

1. **Cambiare le due password** (Facebook e dashboard): la vecchia password della dashboard è
   finita nei log dell'istanza (ora mascherata) e quella Facebook è passata in chat.
2. **Non usare come amministratore l'account nuovo** (`service100`): la Pagina deve appoggiarsi al
   tuo profilo esistente, altrimenti rischia di cadere insieme a quello.
