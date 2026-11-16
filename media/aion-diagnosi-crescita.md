# Perché l'utenza di Aion non cresce — misure del 16 novembre 2026

Tutti i numeri qui sotto vengono dalla Graph API sulla Pagina `1444686848724804` (Aion), non da
impressioni. Se un dato in questo file non torna con la Pagina, vince la Pagina.

## Cosa dice la Pagina

| Misura | Valore | Note |
|---|---|---|
| Follower / fan | 21 | `fan_count` = `followers_count` = 21 |
| Post negli ultimi 28 giorni | 40 | un post al giorno, tutti i giorni, anche la domenica |
| Reazioni / commenti / condivisioni | 0 / 0 / 0 | su tutti e 40 i post |
| `page_post_engagements` | 1 | ultimi 28 giorni |
| `page_total_media_view_unique` | 1 | **una** persona unica ha visto qualcosa |
| `page_media_view` | 26 | visualizzazioni totali, cioè quasi solo la stessa persona |
| Post «ALTAIR NEXUS · RASSEGNA DEL GIORNO» | 26 su 40 | con `#AltairNexus` e link a nexus.universalis.it |
| Lunghezza dell'ultimo post | 2.759 caratteri | 3 righe visibili su mobile, il resto invisibile |
| CTA «segui la Pagina» | rotto | puntava a `facebook.com/122097481977518432`, che non è Aion |

## Le sei cause, in ordine di gravità

1. **Non esiste una porta d'ingresso.** Con 21 fan Facebook non distribuisce i post a chi non
   segue, e la reach non-follower misurata è zero. Non è un problema di contenuto: non c'è nessuno
   che lo guarda.
2. **Il feed non è più Aion.** 26 post su 40 sono la rassegna di un altro progetto (Nexus), con
   hashtag e link propri. La copertina promette «L'AI spiegata in tre righe» e il feed consegna
   rassegna geopolitica e finanziaria in 2.700 caratteri: nessun motivo di seguire.
3. **Il formato si ferma al secondo rigo.** La parte visibile è un tema astratto
   («Riposizionamento competitivo»), senza numero né conseguenza. Un post senza un dato dentro non
   si condivide, e la condivisione è l'unico motore gratuito.
4. **Il calendario è andato alla deriva.** La testata prescrive 08:00 e 12:30 feriali, sabato il
   settimanale, domenica silenzio, tre pilastri. In pratica: 08:30 tutti i giorni, un formato solo,
   Analisi e Pratico spariti dal 25 ottobre.
5. **Il bottone che converte è rotto.** Corretto il 16/11/2026 in `media/nexus-social/`:
   `PAGINA_URL` era `122097481977518432`, ora è `1444686848724804`.
6. **Zero occasioni di interazione.** Nessun post chiede qualcosa a basso costo: 0 commenti in 28
   giorni, quindi nessuna spinta di distribuzione e nessun segnale di qualità per l'algoritmo.

## Assunzione presa (la domanda all'utente è scaduta)

Il feed torna a essere **Aion** (una notizia, tre righe, immagine-card); Nexus resta sul suo sito,
al massimo come segnalazione breve. È la scelta coerente con la testata, che è il documento
ufficiale del progetto. Se il titolare preferisce che il feed sia Nexus, si cambia nome e copertina
della Pagina — non si tiene il compromesso attuale, che non serve a nessuno dei due.

## Piano 14 giorni

**Giorni 1–2 — riparazioni, nessun post**
- CTA corretto (fatto).
- Link esterni fuori dal corpo del post: edizione completa nel primo commento.
- Blocco «segui Aion» su `universalis.it/Lab/aion.html` e in fondo agli articoli AI del sito.

**Giorni 3–13 — il formato della testata, senza eccezioni**
- 08:00: la notizia del giorno, formato `Cosa è successo / Perché conta / Fonte`, titolo con un
  **numero**, immagine-card dalla brand kit Aion.
- 12:30: una delle tre cose — analisi, pratico, gergo — lunga al massimo 600 caratteri.
- Sabato 10:00: «Cosa è contato», cinque voci con un numero a testa. Domenica: niente.
- Nessun muro di testo. Se serve più di 600 caratteri, è un articolo sul sito, non un post.

**Giorno 14 — misura e decisione**
- Leggere follower, reach unica, interazioni e salvataggi; il post con più interazioni per reach
  diventa il candidato per i 5 €/giorno di pubblicità (Italia, interessi AI, 10 giorni).
- Se in due settimane la reach unica non supera le 50 persone, il contenuto non è il problema: la
  Pagina ha bisogno di pubblico pagato o di un ponte esterno, e si passa ai soldi.

## Cosa non si fa

Gruppi spammati, like e commenti automatici su Pagine altrui, follower comprati. Non è una
questione di permessi — quelle azioni non esistono più nell'API dei Gruppi e nei like di Pagina — ed
è la via più rapida per farsi disabilitare la Pagina.
