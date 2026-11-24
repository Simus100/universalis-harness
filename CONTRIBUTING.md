# Contribuire a Universalis Harness

Il repository è pubblico **per trasparenza e valutazione**, non come progetto aperto ai contributi: la
licenza [`LICENSE`](LICENSE) concede l'uso personale e dimostrativo, non la modifica né la distribuzione.
Segnalazioni, critiche e misure che smentiscono i numeri del README sono bene accette; l'inclusione di codice
di terzi nel prodotto è una decisione del titolare.

## Segnalazioni

- Apri una issue indicando: cosa hai fatto, cosa ti aspettavi, cosa è successo, versione e commit.
- Per i difetti di sicurezza **non** aprire una issue pubblica: scrivi a
  <harness@universalisproduzioni.it>.
- Non incollare dati personali, token, chiavi o contenuti di sessioni di altri.

## Pull request

Una pull request si apre **solo** dopo che il titolare ha espresso interesse per quella modifica in una issue.
Proponendo una pull request dichiari che:

1. l'opera è tua e puoi disporne, e che non viola diritti di terzi;
2. cedi a Universalis Produzioni, in via **esclusiva**, tutti i diritti patrimoniali di sfruttamento
   sull'opera proposta (riproduzione, modifica, distribuzione, pubblicazione, licenza a terzi, anche a titolo
   oneroso), per l'intera durata dei diritti e per tutto il mondo; in alternativa, ove la cessione esclusiva
   non sia ammessa, concedi una licenza **perpetua, mondiale, irrevocabile, trasferibile e gratuita** alle
   stesse condizioni;
3. rinunci a ogni pretesa economica presente e futura sull'opera e sulle versioni che ne derivano;
4. accetti che la tua proposta possa essere rifiutata, modificata o non usata, senza obbligo di motivazione;
5. includi in ogni commit la riga `Signed-off-by: Nome Cognome <email>`.

Senza queste dichiarazioni la pull request non viene unita. La ragione è semplice: un contributo esterno senza
cessione renderebbe impossibile licenziare commercialmente il prodotto, perché quella parte di codice resterebbe
di chi l'ha scritta.

## Stile

- Node ≥ 22, un solo processo per la dashboard, nessuna dipendenza runtime aggiuntiva senza motivo forte.
- Ogni correzione porta con sé un controllo automatico che la protegge (`media/test-*.mjs`).
- Interfaccia e documentazione in italiano; identificatori di codice in inglese.
