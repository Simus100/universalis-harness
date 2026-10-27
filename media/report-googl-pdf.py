"""
Report PDF (A4) della previsione GOOGL — Timestral 123M, orizzonte 21 sedute.

Perché uno script e non il pulsante «esporta pdf» della vista: qui il PDF deve esistere come FILE,
non come finestra di stampa. Niente browser: il server non ne ha uno usabile per la stampa
(documentato in docs/TIMESTRAL.md, `chrome --print-to-pdf` non termina su questa VPS) e
`chrome-headless-shell` di /opt appartiene a un'altra istanza. Quindi il documento è composto
direttamente con fpdf2 (installato in media/.lib, non nel venv del servizio).

Dati di partenza, tutti già prodotti e verificati:
  - serie   media/previsioni/dati/google-alphabet-googl-usd.csv   (251 sedute, Yahoo Finance)
  - previsione media/previsioni/2026-10-27-google-alphabet-googl-usd-21p.csv  (Timestral 123M)
  - verifica storica: rolling origin, h=21, ctx=200, 20 finestre, 123M (misurata il 27/10/2026)

Uso: PYTHONPATH=/root/pi-harness/media/.lib python3 media/report-googl-pdf.py
"""
import csv
import datetime
import os

from fpdf import FPDF

MEDIA = "/root/pi-harness/media"
SERIE = f"{MEDIA}/previsioni/dati/google-alphabet-googl-usd.csv"
PREV = f"{MEDIA}/previsioni/2026-10-27-google-alphabet-googl-usd-21p.csv"
OUT = f"{MEDIA}/report-googl-2026-10-27.pdf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

# --- numeri misurati (non ricalcolati qui: sono quelli della previsione 123M e del suo backtest)
ULTIMO, DATA_ULTIMO = 316.80, "26/10/2026"
MEDIANA, B80, B95 = 316.4, (276.5, 354.3), (263.0, 367.2)
P_RIALZO = 49
MAE_MOD, MAE_NAIVE = 7.28, 6.97
COP80, COP95 = 97.6, 99.3
AMP_STORICA = 16.4
FONTE = "Yahoo Finance — GOOGL (Alphabet Inc., Classe A), NasdaqGS"
FONTE_URL = "https://query1.finance.yahoo.com/v8/finance/chart/GOOGL?range=3y&interval=1d"
DATA_ESTRAZIONE = "26/10/2026"

NERO, GRIGIO, CHIARO = (32, 38, 48), (110, 118, 130), (238, 241, 245)
BLU, VERDE, ROSSO = (37, 99, 235), (16, 122, 87), (190, 40, 60)


def n(v, dec=2):
    """Numero all'italiana: virgola decimale (il resto del documento è in italiano)."""
    return f"{v:.{dec}f}".replace(".", ",")


def sedute(dopo, n):
    """Le prossime n sedute feriali (senza festivi: dichiarato nel report)."""
    out, d = [], dopo
    while len(out) < n:
        d += datetime.timedelta(days=1)
        if d.weekday() < 5:
            out.append(d)
    return out


serie = []
with open(SERIE) as f:
    for r in list(csv.DictReader(f)):
        serie.append((datetime.date.fromisoformat(r["data"]), float(r["valore"])))
prev = []
with open(PREV) as f:
    for r in csv.DictReader(f):
        prev.append({k: float(v) for k, v in r.items()})
date_future = sedute(serie[-1][0], len(prev))

# fascia 80% interpolata dai quantili disponibili (q05/q25/mediana/q75/q95): serve solo per
# disegnare il ventaglio, i numeri citati nel testo sono quelli calcolati dal servizio
def q_banda(passo, livello):
    for i, p in enumerate(prev):
        if int(p["passo"]) == passo:
            lo, med, hi, q05, q95 = p["q25"], p["mediana"], p["q75"], p["q05"], p["q95"]
            if livello == 0.05:
                return q05
            if livello == 0.95:
                return q95
            if livello == 0.25:
                return lo
            if livello == 0.75:
                return hi
    return None


def q10(p):
    """q10/q90 approssimati per interpolazione fra q05 e q25 (lineare sul percentile)."""
    return p["q05"] + (p["q25"] - p["q05"]) * 0.25


def q90(p):
    return p["q95"] + (p["q75"] - p["q95"]) * 0.25


class Report(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("DejaVu", "", 8)
        self.set_text_color(*GRIGIO)
        self.cell(0, 6, "Alphabet (GOOGL) — previsione a un mese · Timestral 123M", align="L")
        self.ln(8)

    def footer(self):
        self.set_y(-14)
        self.set_font("DejaVu", "", 8)
        self.set_text_color(*GRIGIO)
        self.cell(0, 6, f"Stima probabilistica, non un consiglio finanziario · pagina {self.page_no()}/{{nb}}", align="C")


def titolo(pdf, testo, dim=13, spazio=6):
    pdf.set_font("DejaVu", "B", dim)
    pdf.set_text_color(*NERO)
    pdf.cell(0, 8, testo, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(1.5)
    pdf.set_font("DejaVu", "", 9.5)


def paragrafo(pdf, testo, dim=9.5, colore=NERO, h=5.0):
    pdf.set_font("DejaVu", "", dim)
    pdf.set_text_color(*colore)
    pdf.multi_cell(0, h, testo)
    pdf.ln(1.5)


def tabella(pdf, righe, larghezze, intestazione=True, dim=9, testo_da=1, h=6.2):
    """Tabella a colonne: la x la governa questa funzione, mai il flusso del testo
    (con new_x/new_y di cell() ogni cella finiva su una riga sua)."""
    for i, riga in enumerate(righe):
        testa = intestazione and i == 0
        pdf.set_font("DejaVu", "B" if testa else "", dim)
        pdf.set_text_color(*(GRIGIO if testa else NERO))
        y = pdf.get_y()
        if y + 8 > pdf.h - 20:          # non spezzare una tabella sul bordo pagina
            pdf.add_page()
            y = pdf.get_y()
        x = pdf.l_margin
        for j, cella in enumerate(riga):
            pdf.set_xy(x, y)
            pdf.cell(larghezze[j], h, str(cella), align=("L" if j < testo_da else "R"),
                     border=("B" if testa else ""))
            x += larghezze[j]
        pdf.set_xy(pdf.l_margin, y + h)
    pdf.ln(2)


pdf = Report(format="A4")
pdf.set_auto_page_break(auto=True, margin=18)
pdf.add_font("DejaVu", "", FONT)
pdf.add_font("DejaVu", "B", FONT_B)
pdf.set_margins(18, 18, 18)
pdf.alias_nb_pages()
pdf.add_page()

# ---------------------------------------------------------------- pagina 1
pdf.set_font("DejaVu", "B", 20)
pdf.set_text_color(*NERO)
pdf.cell(0, 10, "Alphabet (GOOGL)", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("DejaVu", "", 12)
pdf.set_text_color(*GRIGIO)
pdf.cell(0, 7, "Previsione del prezzo a un mese — Timestral 123M", new_x="LMARGIN", new_y="NEXT")
pdf.set_font("DejaVu", "", 9)
pdf.cell(0, 6, f"Serie: google-alphabet-googl-usd · 21 sedute di Borsa · {DATA_ULTIMO} → 24/11/2026 · "
               "report generato il 27/10/2026", new_x="LMARGIN", new_y="NEXT")
pdf.ln(4)

# avviso
pdf.set_fill_color(*CHIARO)
pdf.set_draw_color(*CHIARO)
pdf.multi_cell(0, 5, "  Che cosa è questo documento: una stima probabilistica prodotta da un modello "
                     "pre-addestrato (zero-shot) sulla sola forma della serie storica. Non è un fatto, non è "
                     "una previsione certa e non è un consiglio finanziario. Il modello non conosce notizie, "
                     "trimestrali, decisioni antitrust né eventi annunciati.",
               border=0, fill=True)
pdf.ln(6)

titolo(pdf, "I numeri")
tabella(pdf, [
    ["voce", "valore", "in percentuale"],
    ["ultimo prezzo osservato", f"{n(ULTIMO)} USD", DATA_ULTIMO],
    ["stima centrale a 21 sedute", f"{n(MEDIANA, 1)} USD", "−0,11 %"],
    ["fascia probabile 80 %", f"{n(B80[0], 1)} – {n(B80[1], 1)} USD", "−12,7 % / +11,8 %"],
    ["fascia ampia 95 %", f"{n(B95[0], 1)} – {n(B95[1], 1)} USD", "−17,0 % / +15,9 %"],
    ["probabilità di rialzo", f"{P_RIALZO} %", "moneta"],
], [62, 68, 44])

titolo(pdf, "In parole semplici")
paragrafo(pdf,
          "La stima centrale dice una cosa sola: fra un mese Alphabet varrà circa quanto vale oggi. Non è un "
          "giudizio sull'azienda, è la continuazione statistica della serie: guardando solo la forma dei "
          "prezzi, il modello non trova motivo per spostare il centro. Un 316,4 è indistinguibile da un "
          "«316,8, cioè come oggi».")
paragrafo(pdf,
          "La parte che dice qualcosa di utile è la fascia: in un mese il prezzo può ragionevolmente stare fra "
          "276 e 354 dollari. Tradotto, un mese di Borsa su Alphabet vale un'oscillazione normale di circa "
          "±12 %, e negli scenari ampi (95 %) di ±17 %. Se serve dimensionare una posizione, un margine o uno "
          "stop, il numero da guardare è questo, non il 316,4.")

titolo(pdf, "Quanto fidarsi (misurato su questa serie, non a impressione)")
paragrafo(pdf,
          "Verifica storica con origine mobile: stessa configurazione della previsione (orizzonte 21 sedute, "
          f"contesto 200, 20 finestre). Il modello ha sbagliato in media {MAE_MOD:.2f} USD contro {MAE_NAIVE:.2f} "
          "USD del «domani come oggi»: è il 4,5 % peggiore del baseline più semplice, quindi il centro non ha "
          "valore predittivo.")
tabella(pdf, [
    ["misura", "risultato", "come si legge"],
    ["copertura della fascia 80 %", f"{n(COP80, 1)} %", "promette 80, mantiene 98: prudente"],
    ["copertura della fascia 95 %", f"{n(COP95, 1)} %", "idem: non mentirà per eccesso di sicurezza"],
    ["ampiezza media fascia 80 %", f"{n(AMP_STORICA, 1)} % del prezzo", "storicamente stretta così"],
    ["ampiezza fascia 80 % di oggi", "24,6 % del prezzo", "più larga: la volatilità recente è alta"],
], [62, 40, 72], testo_da=2)

# ---------------------------------------------------------------- pagina 2: grafico
pdf.add_page()
titolo(pdf, "Il passato recente e la fascia del prossimo mese")
pdf.set_font("DejaVu", "", 8.5)
pdf.set_text_color(*GRIGIO)
pdf.multi_cell(0, 4.6, "Ultime 90 sedute (linea continua) e 21 sedute previste: mediana tratteggiata, "
                       "banda 50 % e banda 95 %. Le cifre del testo restano quelle della tabella.")
pdf.ln(3)

storia = [v for _, v in serie][-90:]
X0, X1, Y0, Y1 = 24.0, 192.0, 60.0, 172.0
vals = storia + [p["q05"] for p in prev] + [p["q95"] for p in prev]
lo, hi = min(vals), max(vals)
pad = (hi - lo) * 0.06
lo, hi = lo - pad, hi + pad
tot = len(storia) + len(prev)


def px(i):
    return X0 + (X1 - X0) * i / (tot - 1)


def py(v):
    return Y1 - (Y1 - Y0) * (v - lo) / (hi - lo)


# griglia + etichette y
pdf.set_draw_color(*CHIARO)
pdf.set_line_width(0.2)
for k in range(5):
    v = lo + (hi - lo) * k / 4
    y = py(v)
    pdf.line(X0, y, X1, y)
    pdf.set_font("DejaVu", "", 7.5)
    pdf.set_text_color(*GRIGIO)
    pdf.set_xy(2, y - 2)
    pdf.cell(20, 4, n(v, 0), align="R")

# banda 95 %
pdf.set_fill_color(226, 232, 240)
pdf.set_draw_color(226, 232, 240)
pol = [(px(len(storia) + i + 1), py(p["q95"])) for i, p in enumerate(prev)]
pol += [(px(len(storia) + i + 1), py(p["q05"])) for i, p in reversed(list(enumerate(prev)))]
pdf.polygon(pol, style="F")

# banda 50 %
pdf.set_fill_color(203, 213, 225)
pdf.set_draw_color(203, 213, 225)
pol = [(px(len(storia) + i + 1), py(p["q75"])) for i, p in enumerate(prev)]
pol += [(px(len(storia) + i + 1), py(p["q25"])) for i, p in reversed(list(enumerate(prev)))]
pdf.polygon(pol, style="F")

# storia
pdf.set_draw_color(*NERO)
pdf.set_line_width(0.5)
for i in range(1, len(storia)):
    pdf.line(px(i - 1), py(storia[i - 1]), px(i), py(storia[i]))

# mediana futura, tratteggiata
pdf.set_draw_color(*BLU)
pdf.set_line_width(0.55)
prev_pt = (px(len(storia) - 1), py(storia[-1]))
for i, p in enumerate(prev):
    nxt = (px(len(storia) + i), py(p["mediana"]))
    # tratto corto + salto, disegnato a mano (fpdf non ha linee tratteggiate portabili)
    lung = ((nxt[0] - prev_pt[0]) ** 2 + (nxt[1] - prev_pt[1]) ** 2) ** 0.5
    passi = max(1, int(lung / 1.6))
    for s in range(passi):
        if s % 2:
            continue
        a = (prev_pt[0] + (nxt[0] - prev_pt[0]) * s / passi, prev_pt[1] + (nxt[1] - prev_pt[1]) * s / passi)
        b = (prev_pt[0] + (nxt[0] - prev_pt[0]) * (s + 1) / passi, prev_pt[1] + (nxt[1] - prev_pt[1]) * (s + 1) / passi)
        pdf.line(a[0], a[1], b[0], b[1])
    prev_pt = nxt

# separatore "oggi"
pdf.set_draw_color(*GRIGIO)
pdf.set_line_width(0.3)
pdf.line(px(len(storia) - 1), Y0, px(len(storia) - 1), Y1)

# assi
pdf.set_draw_color(*GRIGIO)
pdf.set_line_width(0.25)
pdf.line(X0, Y1, X1, Y1)
pdf.line(X0, Y0, X0, Y1)
pdf.set_draw_color(*NERO)
pdf.set_line_width(0.5)

# etichette x
pdf.set_font("DejaVu", "", 7.5)
pdf.set_text_color(*GRIGIO)
for i, testo in ((0, serie[-90][0].strftime("%d/%m/%y")),
                 (44, serie[-46][0].strftime("%d/%m/%y")),
                 (len(storia) - 1, "oggi"),
                 (tot - 1, date_future[-1].strftime("%d/%m/%y"))):
    pdf.set_xy(px(i) - 11, Y1 + 2)
    pdf.cell(22, 4, testo, align="C")

# legenda
ly = Y1 + 10
pdf.set_draw_color(*NERO)
pdf.set_line_width(0.5)
pdf.line(X0, ly, X0 + 10, ly)
pdf.set_xy(X0 + 12, ly - 2)
pdf.set_text_color(*NERO)
pdf.cell(34, 4, "prezzo osservato")

pdf.set_draw_color(*BLU)
pdf.line(X0 + 52, ly, X0 + 62, ly)
pdf.set_xy(X0 + 64, ly - 2)
pdf.cell(30, 4, "mediana prevista")

pdf.set_fill_color(203, 213, 225)
pdf.set_draw_color(203, 213, 225)
pdf.rect(X0 + 100, ly - 2, 10, 4, style="F")
pdf.set_xy(X0 + 112, ly - 2)
pdf.set_text_color(*NERO)
pdf.cell(30, 4, "banda 50 %")

pdf.set_fill_color(226, 232, 240)
pdf.set_draw_color(226, 232, 240)
pdf.rect(X0 + 145, ly - 2, 10, 4, style="F")
pdf.set_xy(X0 + 157, ly - 2)
pdf.set_text_color(*NERO)
pdf.cell(34, 4, "banda 95 %")

pdf.set_xy(pdf.l_margin, ly + 8)   # la legenda ha lasciato la x a destra: si riparte dal margine
paragrafo(pdf, "Come si legge: la linea nera è il prezzo delle ultime 90 sedute, la verticale grigia è "
               "«oggi». A destra il ventaglio non è un disegno: è la distribuzione dei 21 passi previsti. Le "
               "due bande si allargano con la radice del tempo — è la ragione per cui al passo 21 l'incertezza "
               "è molto più grande che al passo 3 — mentre il centro resta praticamente fermo. Un ventaglio che "
               "si allarga così e un centro piatto dicono la stessa cosa: il modello sa quanto può muoversi il "
               "prezzo, non dove andrà.")

pdf.add_page()
titolo(pdf, "Passo per passo: tutti i 21 passi previsti")
righe = [["seduta", "data", "mediana", "q05", "q25", "q75", "q95"]]
for i, p in enumerate(prev):
    righe.append([str(int(p["passo"])), date_future[i].strftime("%d/%m"),
                  n(p["mediana"], 1), n(p["q05"], 1), n(p["q25"], 1), n(p["q75"], 1), n(p["q95"], 1)])
tabella(pdf, righe, [18, 22, 26, 26, 26, 26, 26], dim=8.6, h=5.6)
pdf.ln(2)
paragrafo(pdf, "Tre letture della stessa tabella. La colonna mediana dice che il centro non si muove: 316,1 al "
               "primo passo, 316,4 al ventunesimo. Le colonne q05 e q95 dicono quanto si allarga l'incertezza: "
               "circa ±3 % al primo passo, circa ±16 % all'ultimo. Le colonne q25 e q75 sono la fascia centrale, "
               "quella che contiene il prezzo una volta su due. La banda 80 % citata nel testo (276,5 – 354,3) "
               "sta fra q05 e q95, e vale per la fine dell'orizzonte.")
paragrafo(pdf, "Perché 21 sedute: un mese di Borsa non sono 30 giorni di calendario. Da lunedì 26 ottobre, 21 "
               "sedute feriali portano a martedì 24 novembre 2026. Festivi di Borsa esclusi: non sono nel "
               "calendario usato qui, quindi la data può slittare di un giorno.")
pdf.ln(1)
pdf.set_font("DejaVu", "", 8)
pdf.set_text_color(*GRIGIO)
pdf.multi_cell(0, 4.4, "Nota tecnica: la previsione è stata calcolata con la taglia 123M del modello (490 MB di "
                       "pesi, circa 840 MB di RAM nel servizio, 0,23 s di calcolo) ed è la taglia a cui il servizio "
                       "resta impostato; si scarica da solo dopo 15 minuti di inattività.")


# ---------------------------------------------------------------- pagina 3
pdf.add_page()
titolo(pdf, "Cosa dicono i dati (calcolato sulla serie, non dal modello)")
tabella(pdf, [
    ["misura", "valore", "che cosa significa"],
    ["tendenza lineare", "R² 0,35", "moderata: il trend spiega un terzo della variabilità"],
    ["pendenza", "+0,24 USD al giorno", "positiva sui 12 mesi, ma non estrapolabile"],
    ["movimento tipico", "1,98 % al giorno", "la misura della fascia, non del centro"],
    ["valori anomali", "24/07/2026 · 04/08/2026", "due scarti bruschi, il modello li ha visti"],
    ["periodo", "251 sedute, +17,65 %", "12 mesi di storia recente"],
], [38, 40, 96], testo_da=2)

titolo(pdf, "La fonte dei dati")
paragrafo(pdf, f"Fonte: {FONTE}. Chiusure ufficiali di seduta, non rettificate per dividendi; "
               "nell'intervallo non ci sono split. Nessun buco di calendario oltre i 5 giorni, nessun "
               f"valore mancante. Unità: USD per azione. Frequenza: 1 giorno. Punti: 251. "
               f"Estrazione: {DATA_ESTRAZIONE}.")
pdf.set_font("DejaVu", "", 8)
pdf.set_text_color(*GRIGIO)
pdf.multi_cell(0, 4.5, FONTE_URL)
pdf.set_text_color(*NERO)
pdf.ln(3)

titolo(pdf, "Che cosa NON dice questo documento")
paragrafo(pdf, "Non dice dove andrà il prezzo. Il centro è, per misura, pari al «domani come oggi»; "
               "l'informazione sta nella fascia. Non sa nulla della prossima trimestrale, delle decisioni "
               "antitrust, dei dividendi o di un annuncio macro: se accade uno di questi eventi, la fascia "
               "non lo contiene e la stima va rifatta. Le probabilità vengono dai quantili del modello e non "
               "sono calibrate come frequenze esatte.")

titolo(pdf, "Glossario")
paragrafo(pdf, "mediana — il centro della distribuzione prevista: metà delle volte il valore dovrebbe "
               "stare sopra, metà sotto.", h=4.6)
paragrafo(pdf, "fascia 80 % — l'intervallo che, secondo il modello, contiene il prezzo 8 volte su 10. "
               "La fascia 95 % è l'intervallo ampio, 19 volte su 20.", h=4.6)
paragrafo(pdf, "backtest (origine mobile) — si finge di essere nel passato: il modello vede solo i dati "
               "fino a quel giorno e si confronta la previsione col valore poi realmente accaduto.", h=4.6)
paragrafo(pdf, "copertura — quante volte la fascia dichiarata ha davvero contenuto il valore vero. "
               "Se una fascia «80 %» copre il 98 % delle volte, è prudente (larga).", h=4.6)

pdf.output(OUT)
print(f"scritto {OUT} — {os.path.getsize(OUT)/1024:.0f} KB, pagine: {pdf.page_no()}")
