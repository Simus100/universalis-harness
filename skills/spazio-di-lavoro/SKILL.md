---
name: spazio-di-lavoro
description: Regola dello spazio di lavoro di questa istanza. Usala prima di produrre file grandi o quando una scrittura fallisce per spazio esaurito. Dice dove si mettono i risultati, quando avvisare l'utente che lo spazio è finito e perché non si cancella mai nulla da soli.
---

# Dove lavorare, e cosa fare quando lo spazio finisce

## Il tuo spazio di lavoro

- **Istanze dei tester** (`tester07`, `tester08`): il tuo spazio è la **tua cartella**
  (`/home/<utente>`, ~950 MB) — è il filesystem su cui gira anche la dashboard, e per te
  **deve bastare**. La cartella tecnica `/var/lib/<utente>/agent` è del motore (cache npm,
  credenziali, binari): **non è un'area di lavoro**, non metterci i risultati.
  **Non usare `/var/tmp` né `/tmp`**: il tuo servizio ha `PrivateTmp`, sono cartelle private ed
  effimere — quello che scrivi lì non lo vede nessuno e non è un posto dove conservare qualcosa.
- **L'istanza principale** (`pi-harness`) scrive i file generati in `media/` e ha a disposizione
  il disco grande: le regole di spazio qui sotto non la riguardano.

## Prima di un lavoro pesante, controlla lo spazio

```bash
df -h .                    # nel tuo spazio di lavoro
bash scripts/spazio-tester.sh            # se sei su pi-harness: stato dei tester e candidati
```

- Sotto l'**85% di occupazione**: procedi.
- Sopra l'**85%**: **fermati e avvisa l'utente in chat** con i numeri (usato/libero) e la lista
  dei candidati alla cancellazione con le loro dimensioni. **Attendi che decida lui.**

## Cosa non si cancella mai da solo

Regola secca: **l'agente non cancella nulla senza una richiesta esplicita dell'utente**, e anche
quando la richiesta arriva si toccano solo le cose rigenerabili:

| Si può proporre/rimuovere su richiesta | Mai toccare |
|---|---|
| `renders/`, `node_modules/`, `.cache/`, `*.log`, cartelle di prova | chat e `sessions/`, `media/`, `backups/`, `skills/`, `dashboard.*`, `.env`, tutto ciò che l'utente ha caricato o creato |

Quando l'utente chiede di liberare spazio: elenca **prima** cosa verrà rimosso e quanto si
recupera, poi procedi (o fai eseguire `bash scripts/spazio-tester.sh --pulisci`, che rimuove
soltanto i rigenerabili).

## Se lo spazio non basta e non si vuole cancellare

Non aggirare il limite spostando il lavoro nella cartella tecnica o in `/var/tmp`. Invece:
proponi di procedere a parti (un blocco per volta, consegnando e liberando), di ridurre la qualità
o la durata del lavoro, oppure di consegnare il risultato all'utente e rimuovere i file
intermedi.
