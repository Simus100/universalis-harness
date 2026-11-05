---
name: documenti
description: "Crea, modifica ed estrae contenuti da documenti d'ufficio: Word (.docx), Excel (.xlsx), PowerPoint (.pptx) e PDF. Usa quando l'utente chiede una relazione, un preventivo, un foglio di calcolo con formule, una presentazione, un PDF impaginato o da compilare, oppure di leggere e modificare un documento che ha caricato. Per guardare un PDF o un'immagine basta la skill immagini; per un video servono le skill HyperFrames."
---

# Documenti d'ufficio

Quattro formati, ognuno con la sua libreria. Regola unica che vale per tutti: **il file si
produce, poi si riapre e si verifica** — uno script che esce senza errori può aver scritto un
file vuoto o corrotto.

| Formato | Leggere | Scrivere | Verificare |
|---|---|---|---|
| Word `.docx` | `python-docx` | `python-docx` | `scripts/verifica.py` |
| Excel `.xlsx` | `openpyxl` (o `pandas`) | `openpyxl` | idem |
| PowerPoint `.pptx` | `python-pptx` | `python-pptx` | idem |
| PDF | `pypdf`, `pdfplumber` | `reportlab` (diretto), `soffice` (da docx/pptx) | idem |

Installati e verificati su questa macchina (2026-11): `python-docx` 1.2, `openpyxl` 3.1,
`python-pptx` 1.0, `pypdf` 6.21, `reportlab` 5.1, `pdfplumber` 0.11, LibreOffice 24.2 (`soffice`).
Sono installati a livello di sistema: li vedono tutte le istanze dell'harness, comprese quelle dei
tester, senza occupare spazio nelle loro cartelle.

## Dove finiscono i file

**Sempre in `media/` dell'istanza**: è l'unica cartella che il file manager mostra e da cui si
scarica. Mai `/tmp`: le istanze dei tester girano con `PrivateTmp=true`, quindi un file in `/tmp`
esiste per il processo ma **è invisibile alla dashboard e all'utente** — sembra fatto e non c'è.
Nomi parlanti e senza spazi: `media/preventivo-rossi-2026-11.xlsx`.

## Word

```python
from docx import Document
from docx.shared import Pt, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

d = Document()
d.add_heading("Relazione tecnica", 0)
p = d.add_paragraph("Premessa: ")
p.add_run("in grassetto").bold = True
d.add_paragraph("Testo normale, giustificato.").alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

t = d.add_table(rows=1, cols=3)
t.style = "Light Grid Accent 1"
for i, h in enumerate(["Voce", "Quantità", "Prezzo"]):
    t.rows[0].cells[i].text = h
for voce, q, prezzo in [("Consulenza", "10 h", "500,00 €")]:
    c = t.add_row().cells
    c[0].text, c[1].text, c[2].text = voce, q, prezzo

s = d.sections[0]; s.left_margin = s.right_margin = Cm(2.5)
d.save("media/relazione.docx")
```

Gli stili esistono solo se il documento (o il template) li ha: per un aspetto curato parti da un
`.docx` di esempio dell'utente e riempilo, invece di costruire tutto da zero.

## Excel

```python
import openpyxl
from openpyxl.styles import Font, Alignment
from openpyxl.utils import get_column_letter

wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Preventivo"
ws.append(["Voce", "Quantità", "Prezzo unitario", "Totale"])
for c in ws[1]: c.font = Font(bold=True)
righe = [("Consulenza", 10, 50.0), ("Materiali", 3, 12.5)]
for i, (voce, q, pu) in enumerate(righe, start=2):
    ws[f"A{i}"], ws[f"B{i}"], ws[f"C{i}"] = voce, q, pu
    ws[f"D{i}"] = f"=B{i}*C{i}"
    ws[f"D{i}"].number_format = '#,##0.00 "€"'
ultima = len(righe) + 1
ws[f"C{ultima+1}"] = "Totale"; ws[f"C{ultima+1}"].font = Font(bold=True)
ws[f"D{ultima+1}"] = f"=SUM(D2:D{ultima})"; ws[f"D{ultima+1}"].number_format = '#,##0.00 "€"'
for i, w in enumerate([28, 12, 18, 14], start=1): ws.column_dimensions[get_column_letter(i)].width = w
wb.save("media/preventivo.xlsx")
```

**Attenzione alle formule.** LibreOffice — che è ciò con cui si converte e si ricalcola qui — non
calcola `XLOOKUP`, `SORT`, `FILTER`, `UNIQUE`, `SEQUENCE`: usa `INDEX`/`MATCH`, e ordina e filtra
in Python prima di scrivere le celle. Con `openpyxl` il valore calcolato non viene salvato: per
vedere i numeri servono le formule, e il ricalcolo avviene quando il file si apre in Excel o passa
da `soffice`. Se l'utente ha bisogno dei valori e non delle formule, calcola in Python e scrivi
il risultato.

## PowerPoint

```python
from pptx import Presentation
from pptx.util import Inches, Pt

pr = Presentation()                      # 16:9 di default nei layout moderni
s = pr.slides.add_slide(pr.slide_layouts[0])
s.shapes.title.text = "Titolo della presentazione"
s.placeholders[1].text = "Sottotitolo"
s2 = pr.slides.add_slide(pr.slide_layouts[5])
s2.shapes.title.text = "Numeri"
righe = [("Voci", "Valore"), ("Ricavi", "120.000 €"), ("Costi", "74.000 €")]
tb = s2.shapes.add_table(len(righe), 2, Inches(1), Inches(1.8), Inches(6), Inches(2)).table
for r, (a, b) in enumerate(righe):
    tb.cell(r, 0).text, tb.cell(r, 1).text = a, b
pr.save("media/presentazione.pptx")
```

I font scritti nel `.pptx` li rende il PowerPoint di chi apre il file, non questa macchina: se il
controllo visivo serve davvero, converti in PDF e guarda il PDF (sapendo che LibreOffice può
sostituire i font mancanti).

## PDF

- **da un documento**: `soffice --headless --norestore -env:UserInstallation=file:///tmp/lo-$$ --convert-to pdf --outdir media media/relazione.docx`
  (la cartella `UserInstallation` evita che due conversioni si pestino i piedi; mettila in `/tmp`
  perché è solo un profilo temporaneo, mentre l'**output** va in `media/`)
- **diretto**, quando serve controllo dell'impaginazione: `reportlab` (`SimpleDocTemplate` +
  `Paragraph`/`Table` da `reportlab.platypus`)
- **leggere**: `pdfplumber` per testo e tabelle pagina per pagina, `pypdf` per unire, dividere,
  ruotare, compilare moduli e leggere i metadati
- **un PDF che deve mantenere un layout già impaginato** (una pagina web, un grafico SVG):
  `browser` sa stampare una pagina in PDF, ed è la via più fedele

## Estrazione e modifica di file esistenti

- `.docx`: `Document(path)` conserva il contenuto; per sostituire un testo mantieni la formattazione
  agendo sui `run`, non riscrivendo il paragrafo
- `.xlsx`: apri con `data_only=True` per leggere i valori calcolati **se il file è già stato aperto
  da Excel/LibreOffice**, altrimenti leggi le formule
- `.pdf`: le tabelle con `pdfplumber` (`page.extract_tables()`); se il PDF è una scansione non c'è
  testo — dillo, e proponi di leggerlo come immagine con la skill `immagini` (l'OCR qui non è
  installato)
- formati vecchi `.doc`, `.xls`, `.ppt`: prima convertili con `soffice --convert-to docx|xlsx|pptx`

## Sempre: verifica prima di consegnare

```bash
python3 skills/documenti/scripts/verifica.py media/preventivo.xlsx media/relazione.docx
```

Stampa fogli/righe/formule, paragrafi/tabelle, slide, pagine: se dice «file vuoto» o «non si apre»,
il documento non è pronto. Per un PDF appena convertito controlla anche che le pagine non siano
azzerate. Poi dillo all'utente con nome del file e percorso.

## Quando manca qualcosa

Se `import docx` o `soffice` non esistono (istanza nuova, macchina diversa): **non improvvisare un
formato diverso** da quello chiesto. Dillo, e in alternativa produci HTML o Markdown (che si aprono
ovunque) oppure un PDF con `reportlab` se c'è. Le istanze dei tester non possono installare
pacchetti (nessun `sudo`): le librerie le installa chi amministra la macchina, una volta, per tutte.

## Nota di licenza

Le skill documenti pubbliche di Anthropic (`docx`, `pptx`, `xlsx`, `pdf`) **non** si possono
copiare in questo harness: sono «all rights reserved» con divieto di estrazione, e `skills/`
finisce in un repository pubblico. Questa skill è scritta qui, sulle librerie libere.
