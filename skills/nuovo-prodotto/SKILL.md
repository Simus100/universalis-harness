---
name: nuovo-prodotto
description: "Porta un'idea, un'esigenza o un progetto dalla definizione al primo uso reale: chi lo usa e quale problema gli toglie, la prova più piccola che può smentirla, poi la costruzione, il canale, il lancio e i tre numeri che contano, fino alla decisione di continuare, cambiare o chiudere. Usala quando nasce un prodotto o un progetto nuovo, quando un'idea va scritta prima di costruirla, quando bisogna decidere se vale la pena insistere, o quando va preparato il lancio. Per costruire una singola modifica di qualcosa che esiste già la skill è ai-native-sdlc."
---

# Dal progetto al prodotto

Metodologia per portare qualcosa di nuovo — un prodotto, un servizio, uno strumento, un progetto —
dall'idea al momento in cui **qualcuno lo usa davvero**. Vale qualunque sia la natura della cosa e
qualunque sia il «qualcuno»: un cliente, un collega, o te stesso fra sei mesi.

## 0. Il rischio non è costruire male

Costruire è diventato quasi gratis: un agente scrive codice, impagina, corregge, in giorni. Quindi i
due rischi veri si sono spostati altrove:

1. **costruire la cosa sbagliata** — ben fatta, e che non serve a nessuno;
2. **non farla arrivare** — utile, e che nessuno scopre.

Tutto il resto è secondario. Da qui tre regole che non si negoziano:

- **Nessun progetto senza una persona.** Non «gli utenti»: un ruolo preciso, o un nome. Se non sai a
  chi toglie un problema, non stai progettando, stai sperando.
- **Prima la prova più piccola**, non la più piccola cosa costruibile. Si mette alla prova l'ipotesi,
  non la propria capacità di costruire.
- **La condizione di resa si scrive prima di iniziare** («se entro tre settimane non succede X,
  cambio strada»). Decisa dopo, non la si rispetta mai: l'investimento rende ciechi.

### Che rapporto ha con `ai-native-sdlc`

| | `nuovo-prodotto` | `ai-native-sdlc` |
|---|---|---|
| Domanda | **cosa** costruire e come farlo arrivare | **come** costruirlo bene |
| Oggetto | un'idea, un prodotto, un progetto | un cambiamento dentro qualcosa che esiste |
| Incertezza | di mercato: serve? lo trovano? | tecnica: funziona? non rompe? |
| Forma | ciclo: sonda, costruisci, consegna, decidi | catena: intent, spec, piano, prove, rilascio |
| Esito | continua, cambia strada, oppure chiudi | pubblicato, con le prove allegate |

Si usano insieme: la fase *costruisci* di questa metodologia **è** l'altra skill.

## 1. Quando usarla

- nasce un'idea: un prodotto, uno strumento, un servizio, un progetto interno;
- qualcosa che esiste non decolla e non sai se insistere, cambiare o chiudere;
- devi preparare un lancio o cercare i primi utenti;
- stai per investire settimane in qualcosa e la definizione in una pagina non è ancora stata scritta.

**Non usarla** per: una modifica a ciò che esiste già (→ `ai-native-sdlc`); un lavoro già definito
che va solo eseguito; una richiesta una tantum; una domanda.

## 2. Comandi

| Comando | Quando | Dove sta il metodo |
|---|---|---|
| `definisci` | c'è solo un'idea o un'esigenza | `references/definizione.md` |
| `sonda` | c'è la definizione, serve la prova più piccola | `references/prove.md` |
| `costruisci` | la sonda ha dato un segnale | → skill `ai-native-sdlc` |
| `consegna` | esiste qualcosa da far provare o usare | `references/consegna.md` |
| `lancia` | c'è chi lo usa e si vuole andare oltre i primi | `references/consegna.md` §4 |
| `misura` | dopo il lancio, o quando serve capire se sta funzionando | `references/misura.md` |
| `decidi` | serve scegliere: continuare, cambiare, chiudere | `references/misura.md` §3 |
| `stato` | «a che punto è?» | §3 qui sotto |
| `audit` | maturità del progetto: cosa manca per poter dire «esiste» | `references/misura.md` §5 |

Il primo passo è quasi sempre `definisci`: **una pagina**, non un documento. Se dopo un'ora non è
scritta, il problema non è la scrittura.

## 3. Dov'è il progetto (riconoscere lo stato)

| Quello che trovi | Fase | Prossima azione |
|---|---|---|
| solo una descrizione a voce o in chat | definizione | `definisci`: chi, problema, perché tu, come lo scoprono |
| `prodotto.md` c'è, ma nessuna prova fatta | sonda | la prova più piccola che può smentire l'ipotesi (§`references/prove.md`) |
| prova fatta, segnale debole o assente | decisione | `decidi`: cambiare ipotesi o cambiare pubblico, non aggiungere funzioni |
| segnale presente, niente in uso | costruzione | `ai-native-sdlc`: intent, piano, prove |
| esiste e lo usa **una** persona | consegna | la seconda, la terza, la decima — una per una |
| lo usano più persone, arrivate per caso | canale | trovare il canale che funziona **due volte** |
| canale trovato, si vuole crescere | misura | i tre numeri e l'offerta economica |
| non torna nessuno | decisione | `decidi`: chiudere bene è un esito, non un fallimento |

Riporta lo stato in una tabella (fase, cosa manca, chi deve agire) e proponi **una sola** azione:
quella più a monte fra quelle mancanti.

## 4. Le quattro righe che definiscono tutto

Una pagina sola (`templates/prodotto.md`). Se una riga non si riesce a scrivere, è quella il lavoro
di oggi.

1. **Per chi** — una persona precisa: un ruolo, un mestiere, una situazione. Non «le aziende», non
   «i giovani».
2. **Quale problema**, e **cosa fa oggi** invece. Se oggi non fa niente, non è un problema: è un
   desiderio, e i desideri non si pagano.
3. **Perché tu** — cosa sai, hai o sai fare che un altro non ha. Vale anche «ci sono già dentro io».
4. **Come lo scoprono e perché si fidano** — la riga che si dimentica sempre, ed è quella che decide
   se il progetto esiste o resta un file sul disco.

## 5. I quattro cancelli

Nessun cancello si passa «perché ormai ci siamo». Il valore di un cancello è che **ferma**.

| | Cancello | Si passa se… | Non si passa se… |
|---|---|---|---|
| **G1** | Vale la pena costruire? | sai dire chi lo userebbe **e** come sapresti di sbagliarti | la risposta è «secondo me sì» |
| **G2** | Serve a qualcuno vero? | **una persona che non ti deve nulla** ottiene il risultato da sola | funziona solo quando lo spieghi o lo aggiusti tu |
| **G3** | Si sostiene? | qualcuno paga, si impegna, o lo usa con costanza **senza che tu insista** | «lo userebbe di sicuro se fosse gratis» |
| **G4** | Si può far arrivare ad altri? | un canale ha funzionato **due volte**, senza conoscenze personali | il primo utente era un amico |

**Variante «lo uso io»** (progetto personale: la maggior parte dei progetti di una persona sola). I
cancelli restano, cambiano le domande: G2 diventa «lo uso davvero, da solo, da più di due
settimane?»; G3 diventa «mi fa risparmiare tempo o denaro **misurato**, non stimato?»; G4 diventa
«un'altra persona lo userebbe senza il mio aiuto?». Un progetto per sé non ha bisogno di G3
economico, ma ha bisogno di G2: gli strumenti che si usano solo mentre li si costruisce sono il
modo più elegante di perdere un mese.

## 6. Il ciclo

```
definisci → sonda → segnale? ─ no → decidi (cambia ipotesi | chiudi)
                     │ sì
                     └→ costruisci → consegna → ascolta ─→ decidi
```

Tre esiti, e **tutti e tre sono buoni** se sono scelti: continuare, cambiare una cosa sola,
chiudere. Chiudere bene — scrivendo cosa si è imparato e cosa si riusa — costa un'ora e libera mesi.

Gira il ciclo **una variabile per volta**: se cambi pubblico, promessa e prezzo insieme, non impari
nulla da nessun risultato.

## 7. Anti-pattern

1. **Costruire prima di aver parlato con una persona.** L'agente rende facile essere produttivi per
   settimane su qualcosa che nessuno vuole.
2. **Rifinire ciò che non ha ancora un utente.** Le ore sull'estetica di qualcosa che nessuno ha
   visto sono ore tolte alla conversazione che direbbe cosa togliere.
3. **Lanciare in silenzio.** «Se lo costruisco bene, verranno» è falso da sempre; e chi costruisce
   cose buone in silenzio arriva al 90% del prodotto e allo 0% degli utenti.
4. **Aggiungere funzioni al posto di cambiare ipotesi.** Quando il segnale non arriva, la reazione
   istintiva è aggiungere: è il modo più costoso di rimandare la decisione.
5. **Una prova che non può fallire.** Se qualunque risposta va bene, non stai misurando: stai
   cercando incoraggiamento.
6. **Misurare tutto.** Con volumi piccoli venti metriche sono rumore: tre numeri e una decisione.

## 8. Quello che non si delega

L'agente costruisce, cerca, riassume, prepara, ma **non può**:

- **parlare con le persone al posto tuo.** Le prime dieci conversazioni sono la raccolta dati più
  importante del progetto, e si fanno di persona;
- **decidere cosa promettere.** Una promessa fatta a qualcuno non è delegabile a una macchina;
- **metterci la faccia**: fiducia, prezzo, rapporto, garanzie.

Il resto sì. La regola è: l'agente arriva fino al confine della relazione umana, e lì si ferma.

## 9. File di questa skill

| File | Contenuto |
|---|---|
| `references/definizione.md` | la pagina che definisce il progetto, con le interviste da fare |
| `references/prove.md` | ipotesi, scala delle prove dal più economico, condizione di resa |
| `references/consegna.md` | canale, primi dieci utenti, fiducia, offerta, lancio, checklist |
| `references/misura.md` | i tre numeri, la decisione continua/cambia/chiudi, l'audit del progetto |
| `templates/prodotto.md` | la pagina di definizione |
| `templates/ipotesi.md` | ipotesi, prova, condizione di resa |
| `templates/lancio.md` | checklist di lancio |
| `templates/decisioni.md` | registro delle decisioni (cosa si è deciso, quando, perché) |
