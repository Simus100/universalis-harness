# Istruzioni per la rilettura critica

Questo file serve quando si rilegge un lavoro — proprio o di una sessione precedente — in un
contesto diverso da quello che l'ha prodotto. Va adattato a ciò che conta qui.

## Passaggi

1. **Difetti**: logica, casi limite, regressioni su ciò che già funzionava.
2. **Sicurezza e privacy**: esposizione di rete, autenticazione, credenziali, dati personali o di
   terzi in file versionati, endpoint raggiungibili senza volerlo.
3. **Aderenza**: il diff corrisponde al `plan.md` e ai criteri di successo della `spec.md`? Ogni
   deviazione è riflessa nel piano?
4. **Prestazioni e costo**: lavoro superfluo nei percorsi caldi, letture ripetute, token spesi male.

## Cosa è «grave» qui

Solo ciò che romperebbe il comportamento, farebbe trapelare dati o renderebbe il servizio
inutilizzabile: logica errata, dati riservati nel diff o nella storia, percorsi non protetti,
configurazioni che impediscono il riavvio. Stile, nomi e preferenze sono al massimo secondari.

## Limite al rumore

Al massimo cinque osservazioni secondarie; il resto in una riga («altre N simili»). Se ci sono solo
osservazioni secondarie, apri con «Nessun problema bloccante».

## Non segnalare

- ciò che i test già controllano (formattazione, sintassi, frontmatter delle skill);
- file generati e `node_modules`;
- preferenze di stile già stabilite.

## Controlla sempre

- ogni modifica ha una prova eseguibile, non una descrizione;
- i test non sono stati modificati per far passare il codice;
- `plan.md` aggiornato se il codice devia;
- nessun file riservato nel diff;
- le decisioni prese sono in memoria (`memoria_episodio`).

## Affermazioni e prove

Ogni affermazione sul comportamento («ora funziona») richiede il comando eseguito e il suo output,
o un riferimento `file:riga`.
