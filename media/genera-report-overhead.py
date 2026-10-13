#!/usr/bin/env python3
"""
Genera il report-dashboard HTML «Costo di contesto» dell'harness a partire dal dataset
misurato (media/overhead-contesto-harness.json).

Un solo file di output, autonomo: nessuna risorsa esterna, nessuno script, si apre offline.
Tutti i numeri vengono dal dataset o sono citati con la loro fonte: qui non si inventa nulla.

Uso:  python3 media/genera-report-overhead.py
      (scrive media/report-harness-costo-contesto.html)
"""
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent
D = json.loads((BASE / "overhead-contesto-harness.json").read_text(encoding="utf-8"))
OUT = BASE / "report-harness-costo-contesto.html"

# ---------------------------------------------------------------- numeri -----
ml = D["misuraLocaleToken"]
reale = D["misuraRealeUltimaSessione"]
sv = D["serieStoricaSintesi"]
serie = D["serieStorica"]
confronto = sorted(D["confronto"], key=lambda x: x["tok"])

cache_quota = 97.5          # 12.928 cacheRead su 13.259 token di prefisso (misura del provider)
crescita = round((reale - sv["min"]) / sv["min"] * 100)
nostro = next(c for c in confronto if c["classe"] == "noi")["tok"]
claude_code = next(c for c in confronto if c["harness"].startswith("Claude Code"))["tok"]
motore = next(c for c in confronto if c["classe"] == "motore")["tok"]
spenti = ml["toolEsclusiDalGate"][0]["tok"]
note = ml["dettaglioSystemPrompt"][0]["tok"]
nucleo = ml["dettaglioTool"][0]["tok"]
fattore = round(claude_code / nostro, 1)
pct = lambda v, t=ml["totale"]: round(v / t * 100)

def n(v):
    """Numero con separatore delle migliaia all'italiana (punto)."""
    return f"{v:,}".replace(",", ".")

# ------------------------------------------------------- grafici (SVG) -------
def barre_orizzontali(voci, massimo, w=900, etichetta_w=250, unita="token",
                      altezza_riga=54, titolo_id=""):
    """voci: list of dict(etichetta, valore, colore, nota, forte)."""
    h = altezza_riga * len(voci) + 22
    x0 = etichetta_w + 30
    larghezza_barra = w - x0 - 110
    scale = larghezza_barra / massimo
    out = [
        f'<svg class="graf" viewBox="0 0 {w} {h}" role="img" aria-labelledby="{titolo_id}-t" '
        f'aria-describedby="{titolo_id}-d" preserveAspectRatio="xMidYMid meet">',
        f'<title id="{titolo_id}-t">Confronto in {unita}</title>',
        f'<desc id="{titolo_id}-d">Barre orizzontali, scala da zero a {n(massimo)} {unita}. '
        f'Ogni barra riporta il valore in cifre accanto al nome.</desc>',
    ]
    for i, v in enumerate(voci):
        y = 14 + i * altezza_riga
        bw = max(2, round(v["valore"] * scale))
        colore = v.get("colore", "#8b97ac")
        out.append(f'<text class="g-et" x="{etichetta_w}" y="{y + 22}" text-anchor="end">{v["etichetta"]}</text>')
        out.append(f'<rect x="{x0}" y="{y + 6}" width="{bw}" height="24" rx="4" fill="{colore}"/>')
        if v.get("forte"):
            out.append(f'<rect x="{x0}" y="{y + 6}" width="{bw}" height="24" rx="4" fill="none" '
                       f'stroke="#eef2f9" stroke-width="1.5"/>')
        out.append(f'<text class="g-val" x="{x0 + bw + 10}" y="{y + 23}">{n(v["valore"])}</text>')
        if v.get("nota"):
            out.append(f'<text class="g-nota" x="{x0}" y="{y + 42}">{v["nota"]}</text>')
    out.append("</svg>")
    return "\n".join(out)

# 1) Da dove vengono i token (ricostruzione locale, 12.495 token)
voci_composizione = [
    {"etichetta": "Tool delle estensioni", "valore": 5708, "colore": "#5b9dff",
     "nota": f'web_search · source_check · fetch_content · get_search_content · ask_user · browser · memoria ({pct(5708, ml["totale"])}%)'},
    {"etichetta": "Indice delle 27 skill", "valore": 4430, "colore": "#38bdf8",
     "nota": f'descrizione e percorso di ogni skill, inviate a ogni richiesta ({pct(4430, ml["totale"])}%)'},
    {"etichetta": "Note operative dell'istanza", "valore": 1681, "colore": "#8b5cff",
     "nota": f'lingua, cartelle, memoria, goal, disegni, decisore locale ({pct(1681, ml["totale"])}%)'},
    {"etichetta": "Nucleo di pi (read, bash, edit, write)", "valore": 673, "colore": "#34d399",
     "nota": f'il motore: la parte che non cresce ({pct(673, ml["totale"])}%)'},
]
g_composizione = barre_orizzontali(voci_composizione, 6000, titolo_id="g1")

# 2) Confronto fra harness
voci_confronto = []
for c in confronto:
    colore = "#5b9dff" if c["classe"] == "noi" else ("#34d399" if c["classe"] == "motore" else "#8b97ac")
    nome = "Universalis Harness (questo)" if c["classe"] == "noi" else c["harness"]
    voci_confronto.append({"etichetta": nome, "valore": c["tok"], "colore": colore,
                           "nota": c["nota"], "forte": c["classe"] == "noi"})
g_confronto = barre_orizzontali(voci_confronto, 39000, titolo_id="g2")

# 3) Serie storica: overhead reale misurato nelle sessioni del 19/09 - 13/10
W, H = 900, 360
X0, X1, Y0, Y1 = 78, 872, 44, 296       # area del grafico
vmax = 14000
sx = (X1 - X0) / max(1, len(serie) - 1)
sy = (Y1 - Y0) / vmax
pt = [(round(X0 + i * sx, 1), round(Y1 - v["overheadTok"] * sy, 1)) for i, v in enumerate(serie)]
linea = " ".join(f"{'M' if i == 0 else 'L'}{x},{y}" for i, (x, y) in enumerate(pt))
area = linea + f" L{X1},{Y1} L{X0},{Y1} Z"
griglia = []
for v in range(0, vmax + 1, 2000):
    y = round(Y1 - v * sy, 1)
    griglia.append(f'<line x1="{X0}" y1="{y}" x2="{X1}" y2="{y}" stroke="#243149" stroke-width="1"/>')
    griglia.append(f'<text class="g-asse" x="{X0 - 10}" y="{y + 4}" text-anchor="end">{n(v)}</text>')
etichette_x = []
for i in (0, 10, 20, 30, len(serie) - 1):
    if i >= len(serie):
        continue
    x = pt[i][0]
    et = serie[i]["data"][8:10] + "/" + serie[i]["data"][5:7]
    etichette_x.append(f'<text class="g-asse" x="{x}" y="{Y1 + 22}" text-anchor="middle">{et}</text>')
punti = "".join(f'<circle cx="{x}" cy="{y}" r="3" fill="#5b9dff"/>' for x, y in pt)
g_serie = f'''<svg class="graf" viewBox="0 0 {W} {H}" role="img" aria-labelledby="g3-t" aria-describedby="g3-d" preserveAspectRatio="xMidYMid meet">
<title id="g3-t">L'overhead è quasi triplicato in 24 giorni di lavoro</title>
<desc id="g3-d">Spezzata delle {len(serie)} sessioni dal {serie[0]["data"]} al {serie[-1]["data"]}: da {n(sv["min"])} a {n(sv["max"])} token. Asse verticale da zero a 14.000 token.</desc>
{"".join(griglia)}
<path d="{area}" fill="#5b9dff" opacity="0.14"/>
<path d="{linea}" fill="none" stroke="#5b9dff" stroke-width="2.5" stroke-linejoin="round"/>
{punti}
<text class="g-nota" x="{X0 + 6}" y="{pt[0][1] - 12}">{n(sv["min"])} token · 19 settembre</text>
<text class="g-nota" x="{X1 - 6}" y="{pt[-1][1] - 14}" text-anchor="end">{n(sv["max"])} token · 13 ottobre</text>
{"".join(etichette_x)}
<text class="g-asse" x="{X0 - 10}" y="{Y0 - 16}" text-anchor="end">token</text>
</svg>'''

# 4) Che cosa costerebbe accendere tutto
voci_gate = [
    {"etichetta": "Default di oggi (14 tool, 27 skill)", "valore": reale, "colore": "#5b9dff",
     "nota": "misura del provider, sessione del 13/10/2026", "forte": True},
    {"etichetta": "+ subagent e bg_wait, se accesi", "valore": spenti, "colore": "#fbbf24",
     "nota": "oggi restano fuori dal contesto grazie al gate dei tool"},
]
g_gate = barre_orizzontali(voci_gate, 20000, etichetta_w=280, titolo_id="g4")

# ------------------------------------------------------------ tabella --------
righe_confronto = "\n".join(
    f'<tr{" class=riga-noi" if c["classe"] == "noi" else ""}><td>{c["harness"]}</td>'
    f'<td class="num">{n(c["tok"])}</td><td class="num">{c["tok"] / nostro:.2f}×</td>'
    f'<td class="nota-cella">{c["nota"]}</td></tr>'
    for c in sorted(confronto, key=lambda x: -x["tok"])
)
righe_serie = "\n".join(
    f'<tr><td>{i + 1}</td><td>{v["data"]}</td><td class="num">{n(v["overheadTok"])}</td></tr>'
    for i, v in enumerate(serie)
)
righe_fonti = "\n".join(f'<li><a href="{f["u"]}">{f["t"]}</a></li>' for f in D["fonti"])
righe_composizione = "\n".join(
    f'<tr><td>{v["etichetta"]}</td><td class="num">{n(v["valore"])}</td>'
    f'<td class="num">{pct(v["valore"])}%</td></tr>' for v in voci_composizione
)
righe_tool = "\n".join(
    f'<tr><td>{t["voce"]}</td><td class="num">{n(t["tok"])}</td></tr>'
    for t in ml["dettaglioTool"] + ml["dettaglioSystemPrompt"] + ml["toolEsclusiDalGate"]
)
tot_detail = ml["dettaglioTool"] + ml["dettaglioSystemPrompt"]

# ------------------------------------------------------------ pagina ---------
HTML = f"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quanto contesto costa l'harness prima che tu scriva — Universalis Harness</title>
<meta name="description" content="Misura del costo di contesto a inizio sessione: 13.184 token, contro i 29.061 di Claude Code. Metodo, dati e confronto.">
<style>
  :root {{
    --bg:#08111f; --panel:#172033; --panel-2:#1d2634; --bordo:#243149;
    --testo:#eef2f9; --testo-2:#c6cfdd; --attenuato:#8b97ac;
    --blu:#5b9dff; --azzurro:#38bdf8; --viola:#8b5cff; --verde:#34d399; --giallo:#fbbf24; --rosso:#fb7185;
    --s1:8px; --s2:16px; --s3:24px; --s4:32px; --s5:48px; --s6:64px;
    --r:10px;
    color-scheme: dark;
  }}
  * {{ box-sizing:border-box; }}
  html {{ -webkit-text-size-adjust:100%; }}
  body {{
    margin:0; background:var(--bg); color:var(--testo);
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;
    font-size:16px; line-height:1.6;
  }}
  .foglio {{ max-width:1080px; margin:0 auto; padding:var(--s6) var(--s3) var(--s6); }}
  header.hero {{ border-bottom:1px solid var(--bordo); padding-bottom:var(--s5); margin-bottom:var(--s5); }}
  .occhiello {{
    font-size:0.8125rem; letter-spacing:.08em; text-transform:uppercase;
    color:var(--azzurro); margin:0 0 var(--s2);
  }}
  h1 {{ font-size:clamp(1.9rem,4.6vw,2.9rem); line-height:1.14; margin:0 0 var(--s2); letter-spacing:-.02em; }}
  h1 .num {{ color:var(--blu); font-variant-numeric:tabular-nums; }}
  .sommario {{ font-size:1.125rem; color:var(--testo-2); max-width:62ch; margin:0; }}
  h2 {{
    font-size:1.5625rem; line-height:1.2; margin:var(--s6) 0 var(--s2); letter-spacing:-.01em;
  }}
  h2:first-of-type {{ margin-top:var(--s5); }}
  h3 {{ font-size:1.0625rem; margin:var(--s4) 0 var(--s1); }}
  p {{ max-width:72ch; }}
  p, li, td {{ color:var(--testo-2); }}
  strong {{ color:var(--testo); font-weight:600; }}
  a {{ color:var(--blu); }}
  a:focus-visible, summary:focus-visible {{ outline:2px solid var(--azzurro); outline-offset:2px; border-radius:4px; }}
  code {{
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:.9em;
    background:var(--panel); border:1px solid var(--bordo); border-radius:5px; padding:1px 5px; color:var(--testo);
  }}
  /* --- indicatori --- */
  .kpi {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:var(--s3); margin:var(--s5) 0; }}
  .kpi .uno {{ background:var(--panel); border:1px solid var(--bordo); border-radius:var(--r); padding:var(--s3); }}
  .kpi .val {{
    font-size:clamp(1.75rem,3.4vw,2.375rem); line-height:1.05; font-weight:700;
    font-variant-numeric:tabular-nums; color:var(--testo); margin:0 0 var(--s1);
  }}
  .kpi .val .u {{ font-size:.5em; font-weight:600; color:var(--attenuato); margin-left:2px; }}
  .kpi .et {{ font-size:.8125rem; letter-spacing:.04em; text-transform:uppercase; color:var(--azzurro); margin:0 0 var(--s1); }}
  .kpi .cf {{ font-size:.875rem; color:var(--testo-2); margin:0; }}
  .kpi .cf .via {{ color:var(--verde); font-weight:600; }}
  /* --- blocchi --- */
  .pannello {{ background:var(--panel); border:1px solid var(--bordo); border-radius:var(--r); padding:var(--s3) var(--s3) var(--s2); margin:var(--s3) 0; }}
  figure {{ margin:var(--s3) 0; }}
  .graf {{ width:100%; height:auto; display:block; background:var(--panel-2); border:1px solid var(--bordo); border-radius:var(--r); padding:10px 12px; }}
  .g-et {{ fill:var(--testo-2); font-size:14px; }}
  .g-val {{ fill:var(--testo); font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; }}
  .g-nota {{ fill:var(--attenuato); font-size:11.5px; }}
  .g-asse {{ fill:var(--attenuato); font-size:11.5px; font-variant-numeric:tabular-nums; }}
  figcaption {{ font-size:.875rem; color:var(--attenuato); margin-top:var(--s1); max-width:76ch; }}
  .claim {{ font-size:1.0625rem; font-weight:600; color:var(--testo); margin:var(--s4) 0 var(--s1); }}
  .sintesi {{ background:linear-gradient(180deg,var(--panel) 0%,var(--panel-2) 100%); border:1px solid var(--bordo); border-left:3px solid var(--blu); border-radius:var(--r); padding:var(--s3) var(--s3) var(--s2); }}
  .sintesi p {{ max-width:74ch; }}
  ul, ol {{ max-width:74ch; padding-left:1.2em; }}
  li {{ margin:var(--s1) 0; }}
  /* --- tabelle --- */
  table {{ width:100%; border-collapse:collapse; margin:var(--s2) 0; font-size:.9375rem; }}
  caption {{ text-align:left; font-size:.875rem; color:var(--attenuato); margin-bottom:var(--s1); }}
  th, td {{ text-align:left; padding:9px 12px; border-bottom:1px solid var(--bordo); vertical-align:top; }}
  th {{ color:var(--testo); font-size:.8125rem; letter-spacing:.03em; text-transform:uppercase; border-bottom:1px solid var(--attenuato); }}
  td.num, th.num {{ text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }}
  .nota-cella {{ color:var(--attenuato); font-size:.875rem; }}
  tr.riga-noi td {{ background:rgba(91,157,255,.10); color:var(--testo); }}
  tr.riga-noi td:first-child::before {{ content:"▪ "; color:var(--blu); }}
  details {{ border:1px solid var(--bordo); border-radius:var(--r); padding:var(--s2) var(--s3); background:var(--panel); margin:var(--s3) 0; }}
  summary {{ cursor:pointer; color:var(--testo); font-weight:600; }}
  .due-col {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:var(--s3); }}
  .mini {{ background:var(--panel-2); border:1px solid var(--bordo); border-radius:var(--r); padding:var(--s2) var(--s3); }}
  .mini h3 {{ margin-top:0; }}
  .mini p {{ margin:0; font-size:.9375rem; }}
  .cta {{ background:var(--panel); border:1px solid var(--blu); border-radius:var(--r); padding:var(--s3); margin:var(--s4) 0 var(--s2); }}
  .cta p {{ margin:0 0 var(--s1); }}
  footer {{ border-top:1px solid var(--bordo); margin-top:var(--s6); padding-top:var(--s3); color:var(--attenuato); font-size:.875rem; }}
  .limite {{ font-size:.9375rem; }}
  @media (max-width:640px) {{
    .foglio {{ padding:var(--s4) var(--s2); }}
    .g-et {{ font-size:16px; }}
    .g-nota {{ display:none; }}
  }}
  @media print {{
    body {{ background:#fff; color:#111; }}
    .pannello, .graf, .kpi .uno, .sintesi, details, .cta, .mini {{ background:#fff; border-color:#bbb; }}
    p, li, td, .g-et, .g-val, .g-nota, .g-asse {{ color:#111; fill:#111; }}
    a {{ color:#000; }}
    h2 {{ break-after:avoid; }}
    figure {{ break-inside:avoid; }}
  }}
</style>
</head>
<body>
<div class="foglio">

<header class="hero">
  <p class="occhiello">Universalis Harness · misura del 13 ottobre 2026 · dati riproducibili</p>
  <h1>Prima che tu scriva una parola, l'harness ha già mandato <span class="num">13.184</span> token.
      Claude Code ne manda <span class="num">29.061</span>.</h1>
  <p class="sommario">Un agente AI paga un pedaggio fisso a ogni richiesta: istruzioni, elenco dei
  tool, indice delle skill. L'abbiamo misurato su questa istanza in due modi indipendenti — la
  contabilità del provider e una ricostruzione locale — e confrontato con gli harness più usati.
  Il risultato: metà di Claude Code, e una leva concreta per abbassarlo ancora.</p>
</header>

<div class="kpi">
  <div class="uno">
    <p class="et">Costo di contesto a riposo</p>
    <p class="val">{n(reale)}<span class="u">token</span></p>
    <p class="cf">Misurato dal provider al primo turno · Claude Code: {n(claude_code)} ({fattore}×)</p>
  </div>
  <div class="uno">
    <p class="et">Prefisso servito dalla cache</p>
    <p class="val">{str(cache_quota).replace(".", ",")}<span class="u">%</span></p>
    <p class="cf"><span class="via">12.928 token su 13.259</span>: la parte ripetuta si ripaga quasi tutta da sola</p>
  </div>
  <div class="uno">
    <p class="et">Solo definizioni dei tool</p>
    <p class="val">{n(ml["toolDefinitions"])}<span class="u">token</span></p>
    <p class="cf">14 tool attivi, dal <code>read</code> a <code>ask_user</code></p>
  </div>
  <div class="uno">
    <p class="et">Tenuto fuori dal gate</p>
    <p class="val">{n(spenti)}<span class="u">token</span></p>
    <p class="cf"><code>subagent</code> e <code>bg_wait</code> restano spenti: si accendono quando servono</p>
  </div>
</div>

<section class="sintesi">
  <h2 style="margin-top:0">In una riga</h2>
  <p><strong>Un harness onesto non nasconde il proprio costo: lo dichiara, lo misura e lo rende
  configurabile.</strong> Questa istanza costa {n(reale)} token di contesto prima della prima
  parola — {fattore} volte meno di Claude Code ({n(claude_code)}) e in linea con Copilot CLI
  (12.956) e Cline (12.465) — e può scendere a circa {n(note + nucleo)} token spegnendo skill e tool
  che non servono a quel lavoro (somma delle voci misurate: note dell'istanza {n(note)} + nucleo di
  pi {n(nucleo)}, non una configurazione provata). Il motore sotto, <code>pi</code>, da solo pesa circa {n(motore)}
  token: <strong>quasi tutto il pedaggio viene da ciò che l'istanza aggiunge, non dalla fabbrica</strong>,
  ed è esattamente la parte che possiamo decidere.</p>
</section>

<h2>La domanda</h2>
<p>Ogni agente che lavora sui file manda al modello, a ogni richiesta, un blocco di istruzioni e
l'elenco dei suoi strumenti. È il pedaggio che si paga anche quando la richiesta è «rinomina questa
cartella». Su una finestra da 128.000 token, {n(reale)} token sono l'{pct(reale, 128000):.0f}% del
budget speso in anticipo; su un abbonamento a consumo è voce di costo fissa per ogni turno.</p>
<p>La domanda di questo report non è «è tanto o poco?» — senza un termine di paragone è una domanda
senza risposta. È: <strong>quanto costa questa istanza, da dove viene ogni token, e come si
confronta con chi usa gli strumenti più diffusi?</strong></p>

<h2>Metodo in breve</h2>
<div class="due-col">
  <div class="mini">
    <h3>Misura 1 — la contabilità del provider</h3>
    <p>Dai log delle sessioni: token di <em>input</em> più <em>cacheRead</em> della prima risposta,
    meno i token del primo messaggio dell'utente. È il numero che il provider fattura davvero. Sul
    campione di <strong>{sv["n"]} sessioni</strong> (19/09 – 13/10) va da {n(sv["min"])} a {n(sv["max"])}
    token, mediana {n(sv["mediana"])}.</p>
  </div>
  <div class="mini">
    <h3>Misura 2 — ricostruzione locale</h3>
    <p>Si ricrea la sessione come la crea la dashboard (stesse estensioni, stesse skill, stessa nota
    di sistema) e si contano i caratteri di ciò che parte: <code>system prompt</code>
    {n(ml["systemPrompt"])} token + definizioni dei tool {n(ml["toolDefinitions"])} token =
    <strong>{n(ml["totale"])}</strong>. Conteggio con tokenizzatore o200k_base.</p>
  </div>
</div>
<p>Le due strade convergono entro il 6% ({n(ml["totale"])} stimati contro {n(reale)} fatturati: la
differenza è il formato dei messaggi e il tokenizzatore del modello). Quando divergono, nel report
vince il numero fatturato; la ricostruzione serve a <em>spiegare</em> la composizione.
Nessun contenuto delle sessioni è stato letto per questo report: solo conteggi.</p>

<h2>Da dove vengono i 13.184 token</h2>
<p class="claim">Il 46% è fatto di tool, il 35% di indice delle skill: il motore è la voce più piccola del conto.</p>
<figure>
  {g_composizione}
  <figcaption>Ricostruzione locale ({n(ml["totale"])} token, 14 tool attivi). Percentuali sul totale
  ricostruito. Le definizioni dei tool si pagano a ogni richiesta anche quando il tool non viene
  chiamato: è il caso di <code>browser</code> (589 token) in una sessione che non naviga nulla.</figcaption>
</figure>
<table>
  <caption>Composizione del contesto a riposo — ricostruzione locale del 13/10/2026</caption>
  <thead><tr><th>Voce</th><th class="num">Token</th><th class="num">Quota</th></tr></thead>
  <tbody>{righe_composizione}<tr><td><strong>Totale ricostruito</strong></td><td class="num"><strong>{n(ml["totale"])}</strong></td><td class="num">100%</td></tr></tbody>
</table>

<h2>Il confronto con gli harness più usati</h2>
<p class="claim">Nella stessa classe di prodotto, questa istanza sta a metà strada: meno della metà di
Claude Code, ma il doppio di Codex CLI.</p>
<figure>
  {g_confronto}
  <figcaption>Token inviati al modello <em>prima</em> del contenuto dell'utente. Misure raccolte da
  fonti pubbliche (vedi <a href="#fonti">fonti</a>) con metodi diversi: vanno lette come ordini di
  grandezza, non al token. Per Cline la cifra copre <em>solo</em> il system prompt: il totale reale è
  più alto. Per Claude Code, in un progetto vero con file di istruzioni la misura sale a 38.805.</figcaption>
</figure>
<table>
  <caption>Overhead di input a inizio sessione, per harness</caption>
  <thead><tr><th>Harness</th><th class="num">Token</th><th class="num">vs noi</th><th>Nota sulla misura</th></tr></thead>
  <tbody>{righe_confronto}</tbody>
</table>
<p><strong>La lettura onesta.</strong> Claude Code paga istruzioni molto più ricche — e le sue
funzioni di ricerca, gestione dei file e sotto-agenti sono più numerose — quindi il confronto non
dice «chi è meglio», dice <strong>quanto margine c'è</strong>. Un harness che lavora su una macchina
del cliente e serve una persona per istanza può permettersi di accendere solo ciò che quella persona
usa: è la stessa ragione per cui questa istanza tiene spenti <code>subagent</code> e
<code>bg_wait</code> ({n(spenti)} token) finché non servono.</p>

<h2>L'overhead cresce con l'istanza, non con il motore</h2>
<p class="claim">{n(sv["min"])} token il 19 settembre, {n(sv["max"])} il 13 ottobre: +{crescita}% in 24 giorni di lavoro reale.</p>
<figure>
  {g_serie}
  <figcaption>Tutte le {sv["n"]} sessioni misurate, in ordine cronologico: token di contesto a inizio
  sessione (input + cacheRead meno il primo messaggio). I gradini corrispondono ai giorni in cui
  l'istanza è cambiata — skill installate, tool di estensione accesi, note operative aggiunte: la
  lettura è coerente con i dati, la causa precisa non è tracciata, quindi non la attribuiamo.</figcaption>
</figure>
<p>Il motore (<code>pi</code>) è la parte stabile: ~{n(motore)} token. Tutto il resto è
<strong>contenuto dell'istanza</strong> — e quindi è una decisione, non un destino. Un'istanza
ospitata per un cliente che usa chat e file manager, senza browser né ricerca web, parte da un
pedaggio molto più basso della stessa istanza con tutto acceso.</p>

<h2>Cosa c'è in cambio: il contesto che resta libero</h2>
<p>Il pedaggio non è un lusso: è <em>ciò che l'agente sa fare</em>. Quelle voci comprano capacità
reali, e il report le mostra per quello che sono — costo e funzione, affiancati.</p>
<table>
  <caption>Ogni voce di costo, e cosa abilita</caption>
  <thead><tr><th>Voce (token)</th><th>Cosa compra</th><th>Si può spegnere?</th></tr></thead>
  <tbody>
    <tr><td>Ricerca web (3.112)</td><td>Cercare sul web, verificare un'affermazione su fonti, scaricare una pagina o un PDF, rileggere un risultato già scaricato</td><td>Sì: su istanze chiuse o offline è la prima da togliere</td></tr>
    <tr><td>Indice delle skill (4.430)</td><td>27 procedure riutilizzabili — report, video, giochi, memoria — lette per intero <em>solo</em> quando il compito corrisponde</td><td>Sì: si tengono le skill dell'uso reale, non il catalogo</td></tr>
    <tr><td>Domande all'utente (943)</td><td>Chiedere invece di indovinare, con opzioni e scadenze, dentro la conversazione</td><td>Sconsigliato: è la voce che evita i lavori sbagliati</td></tr>
    <tr><td>Memoria (1.064)</td><td>Ricordare episodi, decisioni e file toccati a tre prezzi diversi: mappa ~300 token, pagina ~500, frammenti qualche centinaio</td><td>No: è ciò che evita di ripagare il contesto di ieri</td></tr>
    <tr><td>Browser pilotato (589)</td><td>Navigare siti reali, leggere l'albero di accessibilità, compilare moduli, con Chrome in sandbox verificata</td><td>Sì: spento di default</td></tr>
    <tr><td>Note operative dell'istanza (1.681)</td><td>Lingua, cartelle del progetto, regole della memoria, formato dei disegni</td><td>Si accorciano, non si azzerano</td></tr>
    <tr><td>Nucleo di pi (673)</td><td>Leggere, scrivere, modificare file ed eseguire comandi — il mestiere di base</td><td>No</td></tr>
    <tr><td><code>subagent</code> + <code>bg_wait</code> (5.543)</td><td>Lavori paralleli in sotto-agenti e attese in secondo piano</td><td>Spenti di default, esclusi dal contesto dal gate dei tool</td></tr>
  </tbody>
</table>
<figure>
  {g_gate}
  <figcaption>Il gate dei tool in cifre. Le due barre misurano cose diverse e non si sommano: la
  prima è il contesto che si paga oggi, la seconda sono i token che <em>entrerebbero in più</em>
  accendendo <code>subagent</code> e <code>bg_wait</code> — ed è la ragione per cui restano spenti
  finché un lavoro non li richiede davvero.</figcaption>
</figure>

<h2>Che cos'è, in pratica, questa istanza</h2>
<p>Il soggetto della misura non è un esperimento ma uno strumento di lavoro quotidiano: una dashboard
web self-hosted che dà a un agente AI le mani sui file di chi la usa, con la spesa sotto gli occhi.</p>
<div class="due-col">
  <div class="mini">
    <h3>Cosa fa</h3>
    <p>Chat agentica che mostra pensiero, tool e <strong>costo</strong> di ogni turno; file manager
    con ricerca nel contenuto; obiettivi a catena con avanzamento; pianificazioni cron; skill nel
    formato aperto Agent Skills; browser pilotato con presa di controllo umana; lettura di immagini e
    PDF; disegni SVG dentro la risposta; ascolto delle risposte con voce <em>sul server</em>; memoria
    a lungo termine consultabile per grafo, wiki e frammenti.</p>
  </div>
  <div class="mini">
    <h3>Per chi, e come si installa</h3>
    <p>Professionisti e piccole strutture che vogliono un agente che tocchi davvero i propri
    documenti; team tecnici che vogliono un'interfaccia web sopra un agente da riga di comando con
    costi controllati; chi ospita per altri. <strong>Due modi:</strong> istanza ospitata su server
    gestito (una persona per istanza, quote e limiti misurabili) oppure <strong>on-premise</strong>,
    in una cartella, senza servizi esterni, database o dipendenze cloud.</p>
  </div>
</div>
<h3>Quello che non promettiamo</h3>
<ul class="limite">
  <li>L'agente ha accesso a una shell e ai file della root dell'istanza: <strong>il confine di
  sicurezza è la macchina</strong>, non l'applicazione.</li>
  <li>Il modello di accesso è pensato per <strong>una persona per istanza</strong>, non per
  organizzazioni con ruoli e permessi.</li>
  <li>Nella modalità ospitata non c'è fatturazione automatica: è gestita a parte.</li>
  <li>L'overhead di contesto non è zero e non scende a zero: le voci della tabella qui sopra sono
  scelte, e ogni scelta ha un prezzo che questo report dichiara.</li>
</ul>

<div class="cta">
  <h2 style="margin:0 0 var(--s2)">Il pedaggio è una decisione, non un destino</h2>
  <p>Se il vincolo è il costo per richiesta, si accende solo ciò che serve e si misura. Se il vincolo
  è la capacità, si paga il pedaggio e si guarda il valore che restituisce. In entrambi i casi la
  differenza con un harness «tutto acceso» è di decine di migliaia di token al giorno.</p>
  <p><strong>Licenze d'uso commerciale, istanze ospitate e installazioni on-premise su richiesta</strong>
  (software proprietario, tutti i diritti riservati). Il codice è pubblico per trasparenza e
  valutazione: si può leggere, misurare e contestare ogni numero di questo report.</p>
</div>

<h2>Metodo, limiti, e cosa non stiamo dicendo</h2>
<ul>
  <li><strong>Misure eterogenee.</strong> I numeri degli altri harness vengono da fonti pubbliche con
  tokenizzatori, perimetri e versioni diversi (Claude Code conta ~3.000 token in più in un progetto
  reale). Il confronto è utile per l'ordine di grandezza, non per la terza cifra.</li>
  <li><strong>Tokenizer.</strong> La ricostruzione locale usa o200k_base; DeepSeek, il modello di
  questa istanza, ha un vocabolario proprio: la ricostruzione sottostima di circa il 5,5%.</li>
  <li><strong>La cache cambia il costo, non il contesto.</strong> Il {str(cache_quota).replace(".", ",")}%
  di prefisso servito da cache rende il pedaggio economico in soldi, non gratuito in finestra: i token
  occupati restano occupati.</li>
  <li><strong>Serie storica senza cause.</strong> La curva sale mentre l'istanza cresce; non abbiamo
  un registro che leghi ogni gradino a una modifica precisa, quindi non lo affermiamo.</li>
  <li><strong>Nessun dato di terzi.</strong> Dalle sessioni sono stati letti solo i conteggi di token,
  mai i contenuti. Nel dataset pubblicato non c'è testo delle conversazioni.</li>
</ul>

<h2 id="fonti">Dati e fonti</h2>
<table>
  <caption>Dettaglio della ricostruzione locale (token stimati, o200k_base). Le singole voci sono
  arrotondate all'unità: la loro somma può differire di qualche token dal totale misurato.</caption>
  <thead><tr><th>Voce</th><th class="num">Token</th></tr></thead>
  <tbody>
    {righe_tool}
    <tr><td><strong>Totale a riposo (senza subagent/bg_wait)</strong></td><td class="num"><strong>{n(sum(t["tok"] for t in tot_detail))}</strong></td></tr>
  </tbody>
</table>
<details>
  <summary>Serie storica completa — {sv["n"]} sessioni, dal {serie[0]["data"]} al {serie[-1]["data"]}</summary>
  <table>
    <caption>Token di contesto a inizio sessione (input + cacheRead meno il primo messaggio utente)</caption>
    <thead><tr><th>#</th><th>Data</th><th class="num">Token</th></tr></thead>
    <tbody>{righe_serie}</tbody>
  </table>
</details>
<h3>Fonti esterne</h3>
<ul>{righe_fonti}</ul>
<p class="limite">Dataset misurato: <code>media/overhead-contesto-harness.json</code> · questo report è
generato da <code>media/genera-report-overhead.py</code> e si può rigenerare dai dati.</p>

<footer>
  <p>Universalis Harness — report generato il {D["aggiornato"]}. Un solo file HTML, nessuna risorsa
  esterna: si apre offline e si archivia. Licenza del software: proprietaria, tutti i diritti
  riservati.</p>
</footer>

</div>
</body>
</html>
"""

OUT.write_text(HTML, encoding="utf-8")
print(f"scritto {OUT} ({len(HTML)} caratteri)")
