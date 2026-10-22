# Post giornaliero di Altair Nexus sulla Pagina Facebook «Aion»

Una volta al giorno porta sul feed della Pagina i **link delle notizie dell'edizione** di
[nexus.universalis.it](https://nexus.universalis.it/site/), con titolo, categoria, testata,
una riga di sommario e l'indirizzo canonico della storia. Il sito pubblica una nuova edizione
ogni ora; la Pagina ne pubblica una al giorno.

## Come funziona

1. `post-giornaliero.mjs` legge l'edizione corrente da `https://nexus.universalis.it/llms.txt`
   (la sorgente dati ufficiale del sito: titoli, link canonici, categoria, fonte, orario,
   sommario — non serve interpretare l'HTML, e il sito si idrata via JS).
2. Prende le **3 storie più recenti** e compone il post con un template fisso: nessun testo
   inventato, si citano solo titoli/fonti/link che stanno nell'edizione.
3. Manda il testo a `skills/social-publish/publish.mjs` (Pages API ufficiale di Meta).
4. Scrive nel registro (`log.jsonl`) e nello stato (`pubblicati.json`) che il giorno è coperto.

## Quando esce

Timer systemd `nexus-post.timer`: **09:30 ora italiana**, con due ritentativi alle 10:30 e
alle 11:30 se l'edizione del mattino non era ancora pronta o se la rete era giù.
La sintesi Aion del giorno compare intorno alle 08:30, quindi alle 09:30 il quadro è assestato.

```bash
systemctl list-timers nexus-post.timer      # quando scatta la prossima volta
systemctl start nexus-post.service          # forzare un giro adesso (non ripubblica se già fatto)
journalctl -u nexus-post.service -n 30 -o cat   # cosa è successo
systemctl disable --now nexus-post.timer    # fermare tutto
```

## Guardie (importanti)

| Situazione | Codice | Cosa fa |
|---|---|---|
| Post di oggi già uscito | `3` | non pubblica, esce pulito |
| L'edizione disponibile non è di oggi | `4` | non pubblica «l'edizione di ieri», riprova al giro dopo |
| Meta rifiuta il post | `5` | scrive l'errore nel registro, non segna il giorno come coperto |
| Tutto ok | `0` | pubblica e registra l'id del post |

`--forza` ripubblica anche se oggi è già stato pubblicato (sblocca solo questo caso).
`--anche-se-vecchia` manda un'edizione non aggiornata a oggi: è l'unico modo per farlo, e va
usato solo di proposito.

## Uso a mano

```bash
node media/nexus-social/post-giornaliero.mjs --dry-run            # mostra il post, non invia
node media/nexus-social/post-giornaliero.mjs                      # pubblica (se non già fatto)
node media/nexus-social/post-giornaliero.mjs --storie 2           # post più corto
node media/nexus-social/post-giornaliero.mjs --sorgente /tmp/x.txt  # edizione da un file, per le prove
node media/nexus-social/post-giornaliero.mjs --forza --dry-run    # vede com'è il post del giorno dopo
```

Per controllare cosa è già uscito: `pubblicati.json` (un elemento per giorno, con l'id del post)
e `log.jsonl` (una riga per ogni esecuzione, anche quelle a vuoto).

## Regole di condotta che valgono anche qui

- Il post dichiara che il testo è composto da **Aion**, l'IA editoriale di Universalis Produzioni,
  e che le notizie sono delle testate citate: la selezione e il collegamento sono nostri.
- Si pubblicano solo link del sito e testate citate nell'edizione: niente contenuti di terzi,
  niente immagini di persone, niente automazione di like/commenti/messaggi.
- Un post al giorno, non di più: il ritmo è la cosa che rende sostenibile una Pagina.

## Stato al primo avvio

Primo post pubblicato il **22 ottobre 2026**:
<https://www.facebook.com/122097481977518432/posts/122099839023518432>
(edizione delle 09:02, storie: PHP/BBC, Israele/BBC, Legora/TechCrunch).
