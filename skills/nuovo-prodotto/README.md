# nuovo-prodotto — note di installazione

Metodologia per portare qualcosa di nuovo (prodotto, servizio, strumento, progetto) dall'idea al
primo uso reale. Nata estraendo il modello di produzione del *AI-Native SDLC Playbook* di Anthropic
(la skill `ai-native-sdlc`, installata il 6 ottobre 2026) e spostando il centro di gravità: dal
«costruire bene» al «costruire la cosa giusta e farla arrivare».

## Perché è una skill a parte, e non un'estensione di `ai-native-sdlc`

Rispondono a due domande diverse:

| | `nuovo-prodotto` | `ai-native-sdlc` |
|---|---|---|
| Domanda | cosa costruire, e come farlo arrivare | come costruirlo bene |
| Incertezza | di mercato: serve? lo trovano? | tecnica: funziona? non rompe? |
| Forma | ciclo con tre esiti (continua, cambia, chiudi) | catena con un esito (pubblicato, con prove) |
| Momento | prima che esista qualcosa, e intorno al lancio | quando c'è da modificare qualcosa che esiste |

Sono complementari: la fase *costruisci* di questa metodologia è l'altra skill. Tenerle separate
significa caricare in contesto solo quella che serve — 1.600 parole per questa, 1.400 per l'altra,
invece di un unico manuale da 3.000.

## Perché è generica, e come si adatta

Non presuppone né un software, né un mercato, né un cliente pagante: funziona per un prodotto, un
servizio, un contenuto, uno strumento interno o un progetto per sé. Le tre varianti sono già dentro
la skill:

- **prodotto o servizio con clienti**: i quattro cancelli valgono così come sono;
- **progetto interno**: l'«utente» è un collega, il canale è l'adozione interna;
- **progetto per sé**: i cancelli cambiano domanda (lo uso davvero? mi fa risparmiare tempo
  **misurato**? lo userebbe un altro senza il mio aiuto?) — §5 di `SKILL.md`.

Si adatta bene anche a contesti non digitali: cambiano le prove (un concierge, un prototipo di carta),
non la logica.

## Cosa contiene

| File | Contenuto |
|---|---|
| `SKILL.md` | i tre principi, i comandi, lo stato del progetto, le quattro righe, i quattro cancelli, il ciclo, gli anti-pattern, ciò che non si delega |
| `references/definizione.md` | come si scrive la pagina di definizione, le cinque conversazioni, le domande che funzionano e quelle che rovinano |
| `references/prove.md` | l'ipotesi in una riga, la scala delle prove dal più economico, segnale o gentilezza, la condizione di resa |
| `references/consegna.md` | canale, primi dieci utenti, fiducia, offerta e prezzo, il lancio come sequenza |
| `references/misura.md` | i tre numeri, i segnali di allarme, la decisione continua/cambia/chiudi, l'audit del progetto |
| `templates/` | `prodotto.md`, `ipotesi.md`, `lancio.md`, `decisioni.md` |

## Verifica

```bash
node media/check-skills.mjs      # frontmatter della skill
ls skills/nuovo-prodotto/references skills/nuovo-prodotto/templates
```

Nota di manutenzione: ogni regola qui è **consultiva** (un promemoria), non un controllo. Dove una
regola può diventare verificabile a macchina, va trasformata in un test o in un controllo di
pubblicazione — vedi la tabella in `skills/ai-native-sdlc/references/gate.md`.
