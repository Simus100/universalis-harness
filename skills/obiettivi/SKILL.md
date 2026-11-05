---
name: obiettivi
description: "Crea, aggiorna ed esegue i goal della scheda Goal: obiettivi con passi e checklist salvati in media/goals.json, e la catena di passaggi che l'agente può eseguire. Usa quando l'utente chiede di fissare un obiettivo, trasformare un'intenzione in un piano, vedere o aggiornare i goal, segnare un passo completato, o far partire l'esecuzione di un piano salvato. Non serve per le pianificazioni a orario (scheda Pianificazioni) né per le checklist scritte dentro un messaggio."
---

# Obiettivi (scheda Goal)

Un goal in questa dashboard è un piano **salvato**: titolo, descrizione, una catena di passi in
ordine e una checklist di controlli. È una cosa diversa dalle pianificazioni a orario e dalle
checklist che scrivi in chat: un goal resta, si vede nella scheda Goal e si può far eseguire.

## Regola d'oro: si scrive dall'API, non dal file

`media/goals.json` è la memoria su disco, ma la dashboard tiene i goal **in RAM** e riscrive il
file intero a ogni modifica fatta dalla UI. Se modifichi il file a mano con la dashboard accesa,
la prima azione dalla scheda Goal **cancella la tua modifica in silenzio**.

- **per leggere**: il file va bene, oppure `GET /api/goals`
- **per creare, aggiornare, completare, eliminare**: `POST /api/goals`, sempre

Usa lo script `scripts/goal.sh`, che risolve da solo credenziali e porta dell'istanza (la porta
cambia: 8420 principale, 8422 e 8423 le istanze dei tester) e non lascia la password nella riga
di comando.

```bash
S=skills/obiettivi/scripts/goal.sh
bash $S list                      # elenco: id, stato, passi fatti/totali
bash $S show 7419                 # JSON completo (bastano le prime cifre dell'id)
bash $S done-step 7419 2          # segna il passo 2 (o quello che contiene un testo)
bash $S done-check 7419 "fonte"   # segna il controllo della checklist
bash $S run 7419                  # l'agente esegue i passi rimanenti in chat
bash $S run 7419 next             # solo il primo passo rimanente
bash $S set-status 7419 done      # active | done | archived
```

Creare un goal: JSON da stdin, con `steps` e `checklist` anche come elenco di stringhe.

```bash
printf '%s' '{
  "title": "Sito del cliente: online entro il 20",
  "description": "Dominio, hosting e pagine principali.",
  "steps": ["registrare il dominio", "caricare le pagine", "prova da telefono"],
  "checklist": ["https senza avvisi", "modulo contatti consegna la mail"]
}' | bash $S add
```

L'API accetta anche `curl` diretto, ma serve l'autenticazione: chiave `user` in un file di
configurazione, come fa lo script. Non mettere `DASH_PASSWORD` nella riga di comando.

## Campi e limiti veri

| Campo | Note |
|---|---|
| `title` | obbligatorio, max 200 caratteri: senza titolo l'API risponde 400 |
| `description` | facoltativa, max 4000 caratteri |
| `status` | `active` (default), `done`, `archived` |
| `steps[]` | catena ordinata: `{"title","done"}` oppure una stringa. Max 300 caratteri per titolo. L'ordine è dato dalla posizione |
| `checklist[]` | controlli senza ordine: `{"text","done"}` oppure stringa |
| `id` | generato dal server; negli esempi bastano le prime cifre |

`POST /api/goals` **senza** `id` crea, **con** `id` aggiorna. Nell'aggiornamento un campo
**assente** resta com'era, un campo presente (anche vuoto) lo sostituisce: per questo si possono
mandare solo i passi.

## Cosa rende un goal eseguibile

Un goal eseguibile si riconosce perché un'altra persona saprebbe dire se è finito. Prima di
salvarlo, rispondi a quattro domande: *cosa sarà vero quando è finito*, *come lo si verifica*,
*cosa resta fuori*, *quando l'agente deve fermarsi e chiedere*.

Buono:

> Preventivo per il cliente Rossi entro venerdì: voci con quantità e prezzo, totale con IVA,
> file `.xlsx` e PDF in `media/`. Verifica: i totali tornano con la calcolatrice e il PDF si apre.
> Fuori perimetro: preventivi di altri clienti.

Debole (attività, non esito):

> Sistemare il preventivo di Rossi.

Le stesse regole valgono per i **passi**, che sono la parte che conta davvero: `run` li manda
all'agente uno alla volta, e un passo vago diventa lavoro vago.

- 3–7 passi, ciascuno con un esito osservabile («le pagine sono online e raggiungibili», non «lavorare al sito»)
- un passo = un'azione grande ma unica; se serve «e» per descriverlo, forse sono due passi
- la checklist non ripete i passi: contiene i **controlli di qualità** che si fanno alla fine
  («i totali tornano», «nessun segnaposto nel testo»)

## Dopo aver creato un goal

1. `bash $S list` — conferma che ci sia, con il numero di passi giusto
2. dillo all'utente in una riga, con l'id breve (lo usa per `/goal-run` o per la scheda)
3. chiedi se vuole che parta l'esecuzione adesso: `run` avvia l'agente sul goal e **non** è
   reversibile a metà strada (i passi vengono eseguiti davvero)

## Errori che si vedono spesso

- **Aggiornare senza `id`** → crea un goal doppio invece di modificarlo.
- **Passi in un'unica stringa con gli a capo** → diventano un passo solo: sono un array.
- **Titolo vuoto o solo spazi** → 400 dal server.
- **Scrivere `media/goals.json` a mano** → la modifica sparisce alla prima azione dalla UI.
- **`run` su un goal senza passi** → l'agente riceve solo titolo e checklist: inutile, non farlo.

## Quando l'API non risponde

Se `goal.sh` dice che la dashboard non è in esecuzione, l'API non c'è: in quel caso — e **solo**
in quel caso — puoi leggere o scrivere `media/goals.json` direttamente (il formato è quello della
tabella sopra, con `createdAt`/`updatedAt` in millisecondi). Dillo all'utente: è un intervento
manuale, non la via normale.
