---
name: social-connect
description: "Guida una persona — titolare dell'istanza o utente tester — a collegare i PROPRI account social all'harness, così che l'agente possa pubblicare per suo conto con le API ufficiali, senza mai vedere la password e senza login automatico. Copre la creazione dell'app Meta, i permessi minimi, la generazione del token, il salvataggio nel proprio profilo (`social/<nome>.env`, escluso da git) e la verifica con `publish.mjs`. Usala quando qualcuno chiede «come faccio a far pubblicare i miei post dall'harness?», quando un token è scaduto o un post viene rifiutato con codice 190/200, e quando va collegata una persona nuova. Non serve per pubblicare un post (quella è `social-publish`) né per creare una Pagina Facebook (non esiste API pubblica: si fa dall'interfaccia, a mano)."
---

# Collegare i propri social all'harness

Questa skill è per **la persona**, non per l'agente: si legge insieme, si esegue a tappe, e ogni
tappa ha un controllo che dice se è andata. Alla fine la persona ha un file con le sue
credenziali, e l'agente pubblica sui suoi canali senza mai conoscere la sua password.

## Cosa ottieni, e cosa non ottieni

| Ottieni | Non ottieni |
|---|---|
| L'agente pubblica sulla tua Pagina, con testo e immagini | L'agente che entra su Facebook al posto tuo (login nel browser) |
| Un token revocabile in ogni momento da te | La tua password, mai chiesta e mai letta |
| Una verifica prima di ogni pubblicazione (`check`) | La possibilità di pubblicare senza il tuo sì |
| Un profilo separato per ogni persona (`social/<nome>.env`) | Un unico file con dentro i token di tutti |

**Chi può fare cosa.** Il `(.env)` dell'istanza è il profilo del **titolare**: contiene il token
della sua Pagina e resta esclusivo suo. Ogni **utente tester** lavora invece nel proprio
`social/<nome>.env`, con il token dei propri canali: non vede e non tocca quello del titolare.
L'agente, quando riceve un compito, usa il profilo che gli viene indicato (`--profilo <nome>`).

## Regole non negoziabili

1. **Nessuna credenziale in chat.** Un token si incolla in un file, non in un messaggio: in chat
   resta scritto per sempre e non si può cancellare.
2. **Nessun login automatizzato.** Meta blocca i browser pilotati da un server (IP datacenter,
   headless): non si aggira, e provarci mette a rischio l'account. Si usa l'API ufficiale.
3. **Solo canali tuoi**, su cui sei amministratore. Mai Pagine di altre persone, mai account di
   terzi, mai un account di servizio al posto del tuo profilo personale.
4. **Si pubblica solo ciò che hai approvato**, e i contenuti scritti dall'AI lo dichiarano nel
   testo. Vale anche per le risposte ai commenti.
5. **Minimo privilegio**: i permessi che servono, niente di più; il token utente si toglie quando
   il profilo è configurato.

---

## Tappa 1 — La Pagina esiste? (2 minuti)

Vai su **facebook.com/pages/create** (menu a sinistra → *Pagine* → *Crea Pagina*). Nome,
categoria, bio, immagine del profilo e copertina. **Non esiste un'API per creare Pagine**: questo
passo è per forza manuale, ed è l'unico della catena.

- ✅ *Controllo:* apri la Pagina in incognito. Si vede con nome e immagini?
- Devi risultare **amministratore** della Pagina (Impostazioni → Ruoli della Pagina). Senza quel
  ruolo il token non ottiene `CREATE_CONTENT` e la pubblicazione viene rifiutata.

## Tappa 2 — App Meta e permessi (10 minuti)

1. `developers.facebook.com` → **My Apps → Create App** → nome libero, tipo **Business**.
2. **Dashboard → casi d'uso → «Gestisci tutto nella tua Pagina»**. Se non c'è: **Aggiungi caso
   d'uso** e scegli quello.
3. **Personalizza** il caso d'uso e premi **+ Aggiungi** su:
   `pages_show_list`, `pages_read_engagement`, **`pages_manage_posts`**, `pages_manage_metadata`.
   Se compare **«Ready to test»**, premilo.
4. Ignora App Review, verifica del business e modalità Live: **per pubblicare sulla tua Pagina
   non servono**. L'app resta in modalità Sviluppo.

> Le app recenti partono con soli `pages_show_list` e `business_management`: `pages_manage_posts`
> non è «non disponibile», è da aggiungere — e senza di lui Meta risponde `403 · codice 200`.
>
> ✅ *Controllo:* in **Permissions** del Graph API Explorer `pages_manage_posts` deve comparire
> nell'elenco.

## Tappa 3 — Il token, e la prova che è quello giusto (5 minuti)

1. `developers.facebook.com/tools/explorer` → in alto a destra **Meta App**: la tua app.
2. **`User or Page` → `User Token`** (non un Page Token: servirà dopo, e si ricava da questo).
3. **Permissions**: spunta i quattro permessi della Tappa 2 → **Generate Access Token** →
   autorizza. Nella finestra di Facebook devi vedere la richiesta di *gestire i contenuti della
   Pagina*: se non la vedi, il permesso non è attivo nell'app.
4. Nella barra della query scrivi `me/accounts` → **Submit**. Per ogni Pagina trovi `id`, `tasks`
   e `access_token`. Ti servono solo `id` e i `tasks`: il token di Pagina lo ricava lo strumento.

> **Per un token che non scade**: con il Graph API Explorer, apri il token utente nel **Token
> Debugger** → **Extend Access Token** (≈60 giorni). Con un token utente long-lived, il token di
> Pagina che se ne ricava **non ha data di scadenza**.

## Tappa 4 — Il tuo profilo, in quattro comandi (5 minuti)

Dalla radice dell'istanza. Sostituisci `mario` con il tuo nome (lettere, cifre, `-`, `_`):

```bash
# 1. crea social/mario.env (permessi 600) da modello, con le istruzioni dentro
node skills/social-publish/publish.mjs nuovo mario

# 2. apri quel file (dalla vista File della dashboard: cartella «social») e incolla
#    il token UTENTE della Tappa 3 dopo FB_USER_TOKEN=     ← il token va nel file, non in chat

# 3. quali permessi ha davvero il token (deve elencare pages_manage_posts)
node skills/social-publish/publish.mjs --profilo mario perms

# 4. elenco delle tue Pagine, poi scegli quella su cui pubblicare
node skills/social-publish/publish.mjs --profilo mario accounts
node skills/social-publish/publish.mjs --profilo mario use <id-della-pagina>
node skills/social-publish/publish.mjs --profilo mario check
```

Esito atteso di `check`: `autenticato come Pagina: «…» (id …, follower …)`.
`use` scrive `FB_PAGE_ID` e `FB_PAGE_TOKEN` nel **tuo** file e non stampa il token in chiaro.

Quando `check` risponde, **togli la riga `FB_USER_TOKEN`**: da lì in poi basta il token di Pagina,
e sul disco resta il minimo necessario. (Se un domani cambi Pagina, la rimetti un attimo.)

## Tappa 5 — Prima prova innocua, poi il primo post (2 minuti)

```bash
# post creato ma NON mostrato nel feed: verifica che la scrittura passi
node skills/social-publish/publish.mjs --profilo mario post --unpublished --text "prova tecnica"

# il post vero, solo su testo approvato
node skills/social-publish/publish.mjs --profilo mario post --text "<testo approvato>" [--image media/foto.png]
```

- ✅ *Controllo:* la prima risposta contiene `creato NON pubblicato … id: …`; la seconda
  `pubblicato. id del post: …` con un indirizzo da aprire. Se il post pubblicato non ti piace, si
  cancella con la Graph API (`DELETE /{post-id}`): chiedilo all'agente, che ha il comando pronto.

---

## Quando qualcosa non va

| Sintomo | Causa | Rimedio |
|---|---|---|
| `403 · codice 200` «requires both pages_read_engagement and pages_manage_posts» | il token non contiene `pages_manage_posts` (emesso prima del permesso, o caso d'uso non personalizzato) | aggiungi il permesso, **rigenera** il token, verifica con `perms`. Non basta riprovare |
| `codice 190` | token scaduto o revocato | rigenera (Tappa 3) e riscrivi il file; se hai cambiato la password Facebook, tutti i token utente sono decaduti |
| `permessi: …` senza `pages_manage_posts` | hai selezionato meno permessi nell'Explorer | rifai `Generate Access Token` con le quattro spunte |
| `accounts` non elenca la Pagina che cerchi | ruolo mancante o profilo sbagliato | aggiungiti come amministratore della Pagina; controlla di essere loggato col profilo giusto |
| `accounts` risponde «Tried accessing nonexisting field (accounts)» | hai messo un **token di Pagina** dove serve un token **utente** | usa `User Token` per `accounts`/`use`; il token di Pagina va in `FB_PAGE_TOKEN` |
| `perms` dice «non interrogabile» su `FB_PAGE_TOKEN` | è normale: `/me/permissions` esiste solo per i token utente | interroga il token utente, prima di derivarne quello di Pagina |
| `codice 4 / 17 / 32` | limite di frequenza | attendi; non ritentare in ciclo |
| il post esce senza immagine | l'upload è fallito e il post è partito lo stesso | controlla il messaggio dell'upload prima del post: le due chiamate sono separate |

## Manutenzione: chi ha accesso a cosa, e come si revoca

- **Revocare tutto, subito**: `facebook.com/settings → App e siti web → rimuovi l'app`. Muoiono
  tutti i token emessi da quell'app, compresi quelli di Pagina: dopo si rifà la Tappa 3.
- **Scadenze**: token utente breve = ore; token utente long-lived = ~60 giorni; token di Pagina
  derivato da un long-lived = senza scadenza, ma decade se cambi password, revochi l'app o perdi
  il ruolo sulla Pagina.
- **Un profilo per persona**: `publish.mjs --profilo <nome> …`; `publish.mjs profili` mostra chi è
  collegato su questa istanza (Pagine e token mascherati, mai in chiaro).
- **Cosa c'è su disco**: `social/<nome>.env` con permessi `600`, cartella esclusa da git. Non
  finisce mai nel repository, e non va copiata in un backup condivisibile.

## Altri social: cosa è possibile davvero

- **Instagram** (account professionale collegato a una Pagina): si pubblica con le **Instagram
  Graph API**, che si attivano sulla stessa app Meta. Stesso principio, strumento diverso.
- **X, LinkedIn, TikTok, YouTube, Threads**: ognuno ha la propria app, i propri permessi e le
  proprie regole di revisione. Il metodo di questa skill (app ufficiale → permessi minimi → token
  → file di profilo → verifica) si ripete identico, ma **niente di ciò che è scritto qui vale
  come istruzione finché quelle API non vengono configurate e provate**: non improvvisare.
- **Qualunque sito senza API**: l'agente non fa login automatizzati. O c'è un'API ufficiale, o il
  clic lo fa una persona.

## Checklist finale

- [ ] Sono amministratore della Pagina e la Pagina si vede in incognito
- [ ] L'app Meta ha il caso d'uso «Gestisci tutto nella tua Pagina» personalizzato con i 4 permessi
- [ ] `publish.mjs --profilo <nome> perms` elenca `pages_manage_posts`
- [ ] Il token utente è in `social/<nome>.env` (permessi 600) e **non** in chat
- [ ] `use <id>` seguito da `check` risponde con il nome giusto della Pagina
- [ ] La prova `--unpublished` è passata
- [ ] Ho deciso se togliere `FB_USER_TOKEN` dal file (consigliato: sì)
- [ ] So come revocare tutto in dieci secondi (`App e siti web → rimuovi l'app`)
