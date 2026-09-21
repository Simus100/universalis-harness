> **Materiale di riferimento BookForge v7.6.1.** Le regole di comportamento vincolanti sono nelle Instructions del GPT; questo file fornisce schemi, definizioni, procedure dettagliate e template.

# KDP: ricerca di mercato, SEO, pacchetto, lancio

## Fase 2 — Ricerca di mercato (`/ricerca`)

Usa la ricerca web (solo qui o su richiesta). **Mai inventare dati.** Etichetta ogni dato:
✅ Verificato · ⚠️ Stimato · ❌ Non disponibile · 📊 Parziale (campione limitato).

**9 step**: 1) Competitor Amazon (top 10-20: titolo, prezzo, recensioni, rank, lunghezza). 2) Analisi titoli e sottotitoli. 3) Analisi descrizioni Amazon. 4) Recensioni positive e negative (cosa amano / cosa manca → opportunità). 5) Keyword (principali, secondarie, long-tail; fonti: autocomplete Amazon, also-bought, sottocategorie, recensioni). 6) Categorie KDP. 7) Trend (Google Trends se accessibile). 8) Copertine (pattern del genere). 9) Sintesi strategica (SWOT + saturazione).

**Saturazione**: Bassa→ottima opportunità · Media→serve posizionamento chiaro · Alta→serve angle molto specifico · Molto alta→ripensare o micro-nicchiare.

**Output → Report 22 punti**: 1) idea analizzata, 2) nicchia, 3) ampiezza, 4) saturazione, 5) competitor top 5-10, 6) titoli ricorrenti, 7) promesse commerciali, 8) prezzi medi, 9) lunghezza media, 10) pattern copertine, 11) pattern descrizioni, 12) recensioni positive ricorrenti, 13) negative ricorrenti, 14) vuoti di mercato, 15) keyword principali, 16) secondarie, 17) da evitare, 18) categorie possibili, 19) posizionamento consigliato, 20) rischi, 21) opportunità, 22) verdetto.

**Verdetti**: ✅ procedere · ⚠️ procedere ma restringere il target · 🔄 modificare promessa/posizionamento · 🔀 cambiare nicchia · 🔁 ripetere la ricerca.
⏸️ Conferma prima della Fase 3.

## Amazon SEO (`/seo`)

**7 fattori di ranking**: rilevanza keyword (✅ controllabile), sales velocity (⚠️), n. recensioni (⚠️), rating medio (⚠️), conversion rate (✅ copertina/descrizione/anteprima), categoria (✅), also-bought (❌).

**Titolo**: struttura `Titolo Principale: Sottotitolo con beneficio e keyword`. Keyword principale nel titolo o sottotitolo; chiaro in 2 secondi; titolo 3-8 parole, sottotitolo 5-15; cercabile e unico. ❌ vietati "bestseller", "#1", caratteri speciali, titoli troppo simili ad altri.

**Descrizione (HTML, 4000 caratteri, mobile-first)**:
```html
<b>[HOOK — la prima riga, cattura subito]</b><br><br>
[PAIN POINT — il problema del lettore]<br><br>
[SOLUZIONE — cosa offre il libro]<br><br>
<b>Cosa scoprirai in questo libro:</b><br><br>
✅ [Beneficio 1 specifico]<br>✅ [Beneficio 2]<br>✅ [Beneficio 3]<br>✅ [Beneficio 4]<br>✅ [Beneficio 5]<br><br>
<i>[DIFFERENZIAZIONE]</i><br><br>
[CREDIBILITÀ — chi è l'autore]<br><br>
<b>[CTA — Acquista ora]</b>
```
Benefici > caratteristiche ("Imparerai a…" > "100 pagine su…"). Keyword inserite naturalmente. **Quello sopra è il template per la non-fiction.**

**Per la fiction, struttura diversa (niente bullet di benefici):**
```html
<b>[GANCIO — un'immagine o una frattura, non un riassunto]</b><br><br>
[MONDO + PROTAGONISTA — chi, dove, cosa ha da perdere; 2-3 righe]<br><br>
[CONFLITTO INNESCANTE — l'evento che rompe l'equilibrio]<br><br>
[POSTA IN GIOCO + CLIFFHANGER — la domanda che resta aperta]<br><br>
<i>[Serie: una riga che promette oltre questo volume]</i>
```
Nella fiction si vende la **domanda**, non l'elenco: niente "Cosa scoprirai", niente benefici puntati. Il blurb non rivela il finale.

**Filtro anti-AI sui testi di vendita.** Descrizione, sinossi, logline e quarta passano da `references/anti-ai.md`: valgono gli stessi divieti della prosa — niente "In un mondo sempre più…", niente terzine a effetto, niente significatività gonfiata. La copy organizza la voce del libro, non la sostituisce con una formula.

**7 Keyword KDP** (frasi di 2-5 parole, max 50 caratteri ciascuna): 1) principale di nicchia, 2) secondaria/sinonimo, 3) target, 4-5) long-tail (problema specifico), 6) cross-genre, 7) stagionale/trend. ✅ mescola volume e nicchia, pensa come il lettore. ❌ vietate: nomi di autori famosi, "bestseller/free/gratis/sconto", marchi registrati, termini spam.

**Categorie**: max 3, strategiche (sottocategorie meno sature dove rankare più facilmente).

## Fase 6 — Pacchetto KDP (`/kdp`, `/pacchetto`)

Testi **specifici, non generici**, in italiano, coerenti col posizionamento della Fase 2, orientati al lettore target, con pain point e benefici chiari. 12 elementi:

1. **Dati identificativi**: titolo, sottotitolo, autore, lingua, genere.
2. **Testi Amazon**: descrizione breve (max 150 caratteri) + lunga (max 4000, HTML come sopra).
3. **7 Keyword KDP**.
4. **Categorie KDP** (max 3).
5. **Testi promozionali**: sinossi (200-300 parole), logline (1 frase ≤30 parole), pitch commerciale (3-5 frasi), abstract (150-200 parole), quarta di copertina.
6. **Bio autore**: breve (≤100 parole) + lunga (≤250 parole).
7. **Benefici per il lettore** (elenco).
8. **Call to action**: per Amazon, fine libro, pagina autore.
9. **Copertina**: prompt per generazione AI + indicazioni di stile (pattern cromatici per genere).
10. **Prezzo e formato**: eBook / Paperback / Hardcover con logica di pricing.
11. **Disclaimer** (se necessario) — incluso il disclosure AI (sotto).
12. **Checklist pre-pubblicazione**.

**Back matter consigliato** (ordine): nota dell'autore (fiction), ringraziamenti, CTA recensione, anteprima prossimo libro (serie), lista altre opere, chi è l'autore.

**Disclosure AI (KDP)**: se il contenuto è generato con AI, KDP richiede la dichiarazione in fase di pubblicazione. Distingui "AI-generated" (contenuto creato dall'AI) da "AI-assisted" (rifinito da te): KDP chiede di dichiarare il primo. Informane l'utente.

## Fase 7 — Piano di lancio (`/lancio`, opzionale)

Offri dopo la Fase 6. Strategia 30 giorni pre-lancio: costruzione lista ARC (Advance Reader Copy) per le prime recensioni, scelta prezzo di lancio, eventuale KDP Select/KU, calendario promozioni, CTA recensione nel libro. Metriche da monitorare: sales velocity, conversion, recensioni, rank di categoria. Per le serie: leve di read-through (cliffhanger, anteprima, prezzo Vol.1).

## Estensioni (su richiesta)

- **A+ Content** (descrizione arricchita con moduli immagine+testo): proponi 3-5 moduli — hero con beneficio principale, "cosa imparerai/vivrai", bio autore con foto, eventuale serie/altri titoli, recensione/quote. Testi brevi e scansionabili, immagini che mostrano il valore.
- **Audiolibri (ACX/Audible)**: se l'utente punta all'audio, considera la resa orale (frasi non troppo annidate, nomi pronunciabili, niente elementi solo-visivi come tabelle), e prepara una nota di direzione per il narratore (tono, ritmo, voci dei personaggi).

## ⚠️ Dati KDP volatili — verifica, non memorizzare

Royalty (es. fasce 35%/70%), trim size disponibili, margini, soglie di prezzo, requisiti di formato e policy cambiano nel tempo. **Non dichiarare numeri a memoria**: quando servono specifiche tecniche o tariffe correnti, verificale via web (o rimanda l'utente alla documentazione KDP ufficiale) ed etichetta come ✅ verificato. Le strutture e le strategie di questo file, invece, sono stabili.
