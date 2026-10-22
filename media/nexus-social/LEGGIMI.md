# Rassegna del giorno — Altair Nexus sulla Pagina Facebook «Aion»

Ogni mattina la Pagina pubblica la **rassegna stampa quotidiana** di
[nexus.universalis.it](https://nexus.universalis.it/site/): che cos'è Altair Nexus, il segnale
dominante della giornata, tre storie raccontate con link canonici, la storia che non ti aspetti,
cosa tenere d'occhio e l'invito a seguire la Pagina. Con una card editoriale come immagine.

Il sito pubblica una nuova edizione **ogni ora**; la Pagina ne pubblica **una al giorno**.

## Com'è fatto il post

| Blocco | Da dove viene |
|---|---|
| Testata `ALTAIR NEXUS · RASSEGNA DEL GIORNO` + data | data dell'edizione (`Last edition update`) |
| Occhiello di apertura | 7 formule in rotazione deterministica per giorno (mai lo stesso due volte di fila) |
| `▸ IL SEGNALE DI OGGI` + tema + due frasi di sintesi | `aion-brief.html`: segnale dominante, tema principale, sintesi di Aion (tagliata prima di «Letti insieme», che elenca i titoli già raccontati sotto) |
| Che cos'è Altair Nexus | metodo editoriale della pagina `about` + conteggio reale di storie e testate |
| `01 ▸ Categoria · Fonte`, titolo, una riga, link | `llms.txt`: le 3 storie più recenti |
| `LA STORIA CHE NON TI ASPETTI` | la prima storia di *Curiosità / Futuro* o *Scienza* fra quelle non già scelte |
| `▸ DA TENERE D'OCCHIO` | «cosa osservare» dell'Aion Brief |
| Invito: edizione completa + **segui la Pagina Aion** | fisso |
| Firma | «Testo composto da Aion, l'IA editoriale di Universalis Produzioni» |

La **card** (`card-rassegna.mjs`) è 1200x630 + `@2x` 2400x1260 nello stesso linguaggio visivo del
sito: sfondo `#09111b`, serif per il segnale, colore per categoria (cyan tecnologia, violet
geopolitica, amber mercati, rosa startup, arancio scienza, teal curiosità), data, tre titoli e
firma del publisher. La si carica come immagine del post: è quella che si vede nel feed.

## Il post di lancio (una volta sola)

Prima della rassegna c'è il **post di lancio**: presenta Altair Nexus come piattaforma e parla in
prima persona come Aion, che sulla piattaforma lavora. Non è un post del giorno: esce **una volta
sola** e sta in `lancio.json` (un secondo giro esce con codice 3).

```bash
node media/nexus-social/post-lancio.mjs --dry-run   # testo + card, nessun invio
node media/nexus-social/post-lancio.mjs             # pubblica
node media/nexus-social/post-lancio.mjs --forza     # nuovo post di lancio (non cancella il vecchio)
```

La sua card è un manifesto (2016x630@2x, `card/lancio@2x.png`): titolo, sottotitolo e tre dati
reali dell'edizione (storie, ritmo di aggiornamento, fonti sempre linkate). Il testo dice il patto
della Pagina: *ogni mattina alle 9:30 la rassegna, qui — non per email*.

## Quando esce

Timer systemd `nexus-post.timer`: **09:30 ora italiana**, con ritentativi alle 10:30 e 11:30
se l'edizione del mattino non è ancora pronta o la rete era giù. La sintesi Aion compare intorno
alle 08:30, quindi alle 09:30 il quadro è assestato.

```bash
systemctl list-timers nexus-post.timer          # prossima esecuzione
systemctl start nexus-post.service              # forzare un giro adesso
journalctl -u nexus-post.service -n 30 -o cat   # cosa è successo
systemctl disable --now nexus-post.timer        # fermare tutto
```

## Guardie

| Situazione | Codice | Cosa fa |
|---|---|---|
| Post di oggi già uscito | `3` | non pubblica |
| L'edizione disponibile non è di oggi | `4` | non pubblica «l'edizione di ieri», riprova al giro dopo |
| Card non generabile | — | pubblica il solo testo e lo annota nel registro |
| Meta rifiuta il post | `5` | scrive l'errore nel registro, **non** segna il giorno come coperto |
| Tutto ok | `0` | pubblica e registra l'id del post |

`--forza` ripubblica anche se oggi è già stato pubblicato (sblocca solo questo caso).
`--anche-se-vecchia` manda un'edizione non aggiornata a oggi: unico modo, solo di proposito.

## Uso a mano

```bash
node media/nexus-social/post-giornaliero.mjs --dry-run       # testo + card, nessun invio
node media/nexus-social/post-giornaliero.mjs                 # pubblica (se non già fatto)
node media/nexus-social/post-giornaliero.mjs --storie 2      # rassegna più corta
node media/nexus-social/post-giornaliero.mjs --senza-card    # solo testo (torna l'anteprima del link)
node media/nexus-social/post-giornaliero.mjs --sorgente /tmp/x.txt --dry-run   # prova su un'edizione finta
node media/nexus-social/card-rassegna.mjs --out /tmp/prova --giorno "oggi" \
     --segnale Tecnologia --tema "Riposizionamento competitivo" --titoli "Uno|Due|Tre"  # solo la card
```

Stato e registro: `pubblicati.json` (un elemento per giorno, con id del post e card) e
`log.jsonl` (una riga per ogni esecuzione, anche quelle a vuoto). Le card del giorno restano in
`card/`.

## Regole di condotta che valgono anche qui

- Il post dichiara che il testo è composto da **Aion** e che le notizie sono delle testate citate.
- Si pubblicano solo link del sito e testate citate nell'edizione: nessun contenuto di terzi,
  nessuna immagine di persone, nessuna automazione di like/commenti/messaggi.
- Un post al giorno, non di più.
- **L'invito del post porta a seguire la Pagina**, non a una newsletter: sul sito non esiste
  ancora un modulo di iscrizione, e non si promette ciò che non c'è.

## Storia

- 22 ottobre 2026 — primo post, formato semplice (solo elenco dei link):
  <https://www.facebook.com/122097481977518432/posts/122099839023518432>
- 22 ottobre 2026 — ristrutturato in **rassegna stampa** con card, introduzione del sito, rubrica
  finale e invito a seguire la Pagina.
