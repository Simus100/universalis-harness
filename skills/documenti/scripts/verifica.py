#!/usr/bin/env python3
"""
Apre un documento e ne stampa la struttura reale: serve a VERIFICARE ciò che si è prodotto,
non a fidarsi del fatto che lo script sia terminato senza errori.

Uso:  python3 verifica.py <file.docx|.xlsx|.pptx|.pdf> [...altri]
Esce con codice 1 se un file non si apre o è vuoto.
"""
import sys, os, zipfile

def docx(p):
    from docx import Document
    d = Document(p)
    par = [x for x in d.paragraphs if x.text.strip()]
    titoli = [x.text.strip() for x in d.paragraphs if x.style.name.startswith("Heading") and x.text.strip()]
    righe_tab = sum(len(t.rows) for t in d.tables)
    print(f"  paragrafi con testo: {len(par)} · tabelle: {len(d.tables)} ({righe_tab} righe totali)")
    if titoli:
        print(f"  titoli: {titoli[:6]}{' …' if len(titoli) > 6 else ''}")
    if par:
        print(f"  inizio: {par[0].text[:90]!r}")
    return len(par) + len(d.tables)

def xlsx(p):
    import openpyxl
    wb = openpyxl.load_workbook(p, data_only=False)
    tot = 0
    for ws in wb.worksheets:
        righe = [r for r in ws.iter_rows(values_only=True) if any(c is not None for c in r)]
        formule = sum(1 for r in ws.iter_rows(values_only=True) for c in r if isinstance(c, str) and c.startswith("="))
        tot += len(righe)
        print(f"  foglio {ws.title!r}: {ws.max_row}×{ws.max_column} · {len(righe)} righe non vuote · {formule} formule")
    return tot

def pptx(p):
    from pptx import Presentation
    pr = Presentation(p)
    print(f"  slide: {len(pr.slides)} · formato {pr.slide_width}x{pr.slide_height}")
    tot = 0
    for i, s in enumerate(pr.slides, 1):
        testi = [sh.text_frame.text.strip().split("\n")[0] for sh in s.shapes
                 if getattr(sh, "has_text_frame", False) and sh.text_frame.text.strip()]
        tot += len(testi)
        print(f"  slide {i}: {testi[:2]}")
    return len(pr.slides)

def pdf(p):
    from pypdf import PdfReader
    r = PdfReader(p)
    testo = (r.pages[0].extract_text() or "")[:90].replace("\n", " ")
    print(f"  pagine: {len(r.pages)} · primo estratto: {testo!r}")
    if r.metadata and r.metadata.title:
        print(f"  titolo: {r.metadata.title!r}")
    return len(r.pages)

def main():
    if len(sys.argv) < 2:
        print("uso: verifica.py <file> [...]", file=sys.stderr)
        return 2
    esito = 0
    for p in sys.argv[1:]:
        print(f"{p}")
        if not os.path.exists(p) or os.path.getsize(p) == 0:
            print("  ✘ file assente o vuoto"); esito = 1; continue
        if not zipfile.is_zipfile(p) and not p.lower().endswith(".pdf"):
            print("  ✘ non è un file Office valido né un PDF (zip corrotto?)"); esito = 1; continue
        try:
            ext = os.path.splitext(p)[1].lower()
            n = {".docx": docx, ".xlsx": xlsx, ".pptx": pptx, ".pdf": pdf}.get(ext, lambda _: 0)(p)
            print(f"  ✓ si apre · {os.path.getsize(p) // 1024} KB")
            if not n:
                print("  ⚠ nessun contenuto leggibile: file creato ma vuoto"); esito = 1
        except Exception as e:
            print(f"  ✘ non si apre: {type(e).__name__}: {e}"); esito = 1
    return esito

if __name__ == "__main__":
    sys.exit(main())
