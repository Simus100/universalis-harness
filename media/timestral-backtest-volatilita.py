"""
La prova decisiva: Timestral contro una banda fatta con la volatilità storica.

A che domanda risponde: «sui prezzi, l'incertezza dichiarata da Timestral vale più di una
formula di tre righe?» — perché il confronto del backtest generale era contro un naive SENZA
incertezza (distribuzione degenere), e battere «nessuna banda» non è un merito.

Modelli messi a confronto, tutti con gli STESSI livelli quantili e lo stesso contesto:
  - timestral      : i quantili del modello (zero-shot, pre-addestrato);
  - vol            : random walk con deriva zero, banda gaussiana con sigma dei rendimenti
                     logaritmici calcolata sul contesto, allargata con sqrt(passo):
                     y * exp(± z * sigma * sqrt(k));
  - vol+deriva     : come sopra, ma il centro porta la deriva media dei rendimenti del contesto;
  - ewma           : come `vol`, ma sigma da EWMA (lambda 0.94, stile RiskMetrics): la volatilità
                     recente pesa di più.
La banda `vol` è la formula che chiunque userebbe senza modelli: se Timestral non la batte, sui
prezzi non aggiunge nulla.

Metriche: pinball medio sugli stessi livelli (loss probabilistica: penalizza sia l'errore del
centro sia la banda sbagliata — larga paga, stretta paga di più), copertura 80% e 95%,
ampiezza media della banda 80 in % del prezzo (per capire se vince solo perché è più larga),
MAE del centro. Rolling origin, passo 1, solo passato.

Serie di controllo: le due sintetiche (stagionalità pulita) — lì Timestral deve stravincere.
Se non stravince nemmeno lì, il banco di prova è rotto.

Uso: /opt/timestral-venv/bin/python media/timestral-backtest-volatilita.py [--folds N] [--taglia 28M]
Scrive: media/backtest-volatilita-<taglia>-<folds>f.json
"""
import argparse
import json
import math
import statistics
import time
import urllib.request
from statistics import NormalDist

TOKEN = open("/etc/timestral/token").read().strip()
URL = "http://127.0.0.1:8018"
DATI = "/root/pi-harness/media/previsioni/dati"
DEMO = "/root/pi-harness/media/timestral-demo.json"
N01 = NormalDist()
# i livelli che il servizio restituisce davvero: il pinball si calcola SOLO su questi, per tutti
# i modelli, senza interpolare (interpolare le code penalizzerebbe Timestral per un artefatto)
LIV7 = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]


def chiama(percorso, corpo):
    req = urllib.request.Request(
        URL + percorso,
        data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json", "X-Timestral-Token": TOKEN},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=600) as r:
        return json.load(r)


def csv(nome):
    with open(f"{DATI}/{nome}.csv") as f:
        righe = f.read().strip().split("\n")[1:]
    return [float(r.split(",")[1]) for r in righe if r.strip()]


def demo(ident):
    d = json.load(open(DEMO))
    for s in d["serie"]:
        if s["id"] == ident:
            return [v for _, v in s["punti"]]
    raise KeyError(ident)


def casi():
    return [
        ("cambio USD/EUR (giornaliero)", demo("cambio-usd-eur"), [1, 5, 20], 250, "prezzo reale"),
        ("Bitcoin USD (giornaliero)", demo("btc-usd"), [1, 5, 20], 250, "prezzo reale"),
        ("Nasdaq Composite (giornaliero)", csv("nasdaq-composite"), [1, 5, 20], 180, "prezzo reale"),
        ("oro COMEX (giornaliero)", csv("oro-comex-usd-toz-giornaliero"), [1, 5, 20], 200, "prezzo reale"),
        ("XAU/USD COMEX (giornaliero)", csv("xauusd-comex-giornaliero"), [1, 5], 150, "prezzo reale"),
        ("oro COMEX (15 minuti)", csv("oro-comex-usd-toz-15min"), [4, 16], 200, "prezzo reale"),
        ("oro USD/toz (mensile)", csv("oro-usd-toz"), [1, 3, 12], 60, "prezzo reale"),
        ("cassa giornaliera (sintetica, controllo)", demo("cassa-giornaliera"), [1, 7], 250, "controllo"),
        ("carico elettrico (sintetica, controllo)", demo("carico-energia"), [1, 24], 336, "controllo"),
    ]


def rendimenti(contesto):
    return [math.log(contesto[i] / contesto[i - 1]) for i in range(1, len(contesto)) if contesto[i - 1] > 0 and contesto[i] > 0]


def sigma_ewma(r, lam=0.94):
    var = statistics.variance(r[:20]) if len(r) >= 20 else statistics.variance(r)
    for x in r[20:]:
        var = lam * var + (1 - lam) * x * x
    return math.sqrt(var)


def pinball(qv, y, livelli):
    return statistics.mean(max(p * (y - q), (p - 1) * (y - q)) for p, q in zip(livelli, qv))


def quantili_normali(centro, sigma, livelli):
    return [math.exp(math.log(centro) + N01.inv_cdf(p) * sigma) for p in livelli]


def backtest(valori, h, ctx, max_folds):
    righe = []
    origine = len(valori) - h
    fold = 0
    livelli = None
    while origine - ctx > 0 and fold < max_folds:
        contesto = valori[origine - ctx:origine]
        vero = valori[origine:origine + h]
        out = chiama("/forecast", {"series": [{"name": "s", "values": contesto}],
                                  "prediction_length": h, "mode": "separate"})
        s = out["series"][0]
        livelli = out["quantile_levels"]
        r = rendimenti(contesto)
        sg = statistics.pstdev(r) if len(r) > 1 else 0.0
        sg_w = sigma_ewma(r)
        deriva = statistics.mean(r)
        ultimo = contesto[-1]
        for i, y in enumerate(vero):
            k = i + 1
            q_t = [s[q][i] for q in ("q05", "q10", "q25", "median", "q75", "q90", "q95")]
            q_t_full = q_t  # già allineati a LIV7
            q_vol = quantili_normali(ultimo, sg * math.sqrt(k), LIV7)
            q_dr = quantili_normali(ultimo * math.exp(deriva * k), sg * math.sqrt(k), LIV7)
            q_ew = quantili_normali(ultimo, sg_w * math.sqrt(k), LIV7)
            righe.append({
                "fold": fold, "passo": k, "y": y, "prezzo": ultimo,
                "pb_t": pinball(q_t_full, y, LIV7),
                "pb_vol": pinball(q_vol, y, LIV7),
                "pb_dr": pinball(q_dr, y, LIV7),
                "pb_ew": pinball(q_ew, y, LIV7),
                "in80_t": 1 if q_t[1] <= y <= q_t[5] else 0,
                "in95_t": 1 if q_t[0] <= y <= q_t[6] else 0,
                "in80_vol": 1 if q_vol[1] <= y <= q_vol[5] else 0,
                "in95_vol": 1 if q_vol[0] <= y <= q_vol[6] else 0,
                "in80_ew": 1 if q_ew[1] <= y <= q_ew[5] else 0,
                "in80_dr": 1 if q_dr[1] <= y <= q_dr[5] else 0,
                "amp80_t": (q_t[5] - q_t[1]) / ultimo,
                "amp80_vol": (q_vol[5] - q_vol[1]) / ultimo,
                "e_t": abs(y - s["median"][i]),
                "e_vol": abs(y - ultimo),
            })
        origine -= 1
        fold += 1
    return righe


def interp_griglia(qv, livelli_base, livelli_out):
    out = []
    for L in livelli_out:
        if L <= livelli_base[0]:
            out.append(qv[0])
        elif L >= livelli_base[-1]:
            out.append(qv[-1])
        else:
            for i in range(len(livelli_base) - 1):
                a, b = livelli_base[i], livelli_base[i + 1]
                if a <= L <= b:
                    t = (L - a) / (b - a) if b > a else 0
                    out.append(qv[i] + t * (qv[i + 1] - qv[i]))
                    break
    return out


def riassumi(righe):
    def m(k):
        return round(statistics.mean(r[k] for r in righe), 5)

    pb_t, pb_vol, pb_dr, pb_ew = m("pb_t"), m("pb_vol"), m("pb_dr"), m("pb_ew")
    migliore = min(pb_vol, pb_dr, pb_ew)
    return {
        "punti": len(righe),
        "fold": len({r["fold"] for r in righe}),
        "pinball": {"timestral": pb_t, "vol": pb_vol, "vol_deriva": pb_dr, "ewma": pb_ew,
                    "migliore_baseline": migliore,
                    "guadagno_vs_migliore_pct": round(100 * (1 - pb_t / migliore), 1) if migliore else None,
                    "guadagno_vs_vol_pct": round(100 * (1 - pb_t / pb_vol), 1) if pb_vol else None},
        "dentro80": {"timestral": round(100 * statistics.mean(r["in80_t"] for r in righe), 1),
                     "vol": round(100 * statistics.mean(r["in80_vol"] for r in righe), 1),
                     "vol_deriva": round(100 * statistics.mean(r["in80_dr"] for r in righe), 1),
                     "ewma": round(100 * statistics.mean(r["in80_ew"] for r in righe), 1)},
        "dentro95": {"timestral": round(100 * statistics.mean(r["in95_t"] for r in righe), 1),
                     "vol": round(100 * statistics.mean(r["in95_vol"] for r in righe), 1)},
        "ampiezza80_pct": {"timestral": round(100 * statistics.mean(r["amp80_t"] for r in righe), 2),
                           "vol": round(100 * statistics.mean(r["amp80_vol"] for r in righe), 2)},
        "mae_centro": {"timestral": round(statistics.mean(r["e_t"] for r in righe), 2),
                       "naive": round(statistics.mean(r["e_vol"] for r in righe), 2)},
        "vince_punti_pinball_vs_vol_pct": round(100 * statistics.mean(1 if r["pb_t"] < r["pb_vol"] else 0 for r in righe), 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=60)
    ap.add_argument("--taglia", default="28M")
    a = ap.parse_args()
    t0 = time.time()
    chiama("/model", {"size": a.taglia})
    res = {"taglia": a.taglia, "folds": a.folds, "casi": [], "generato": time.strftime("%Y-%m-%d %H:%M")}
    for nome, valori, orizzonti, ctx, tipo in casi():
        for h in orizzonti:
            righe = backtest(valori, h, ctx, a.folds)
            r = {"serie": nome, "tipo": tipo, "h": h, "ctx": ctx, **riassumi(righe)}
            res["casi"].append(r)
            print(json.dumps({k: r[k] for k in ("serie", "h", "pinball", "dentro80",
                                                 "ampiezza80_pct", "vince_punti_pinball_vs_vol_pct")},
                             ensure_ascii=False))
    reali = [c for c in res["casi"] if c["tipo"] == "prezzo reale"]
    ctrl = [c for c in res["casi"] if c["tipo"] == "controllo"]

    def gruppo(sel):
        return {
            "casi": len(sel),
            "pinball_timestral": round(statistics.mean(c["pinball"]["timestral"] for c in sel), 5),
            "pinball_vol": round(statistics.mean(c["pinball"]["vol"] for c in sel), 5),
            "pinball_ewma": round(statistics.mean(c["pinball"]["ewma"] for c in sel), 5),
            "guadagno_vs_migliore_pct": round(statistics.mean(c["pinball"]["guadagno_vs_migliore_pct"] for c in sel), 1),
            "dentro80_timestral": round(statistics.mean(c["dentro80"]["timestral"] for c in sel), 1),
            "dentro80_vol": round(statistics.mean(c["dentro80"]["vol"] for c in sel), 1),
            "dentro80_ewma": round(statistics.mean(c["dentro80"]["ewma"] for c in sel), 1),
            "ampiezza80_timestral": round(statistics.mean(c["ampiezza80_pct"]["timestral"] for c in sel), 2),
            "ampiezza80_vol": round(statistics.mean(c["ampiezza80_pct"]["vol"] for c in sel), 2),
            "casi_vinti_vs_vol": sum(1 for c in sel if c["pinball"]["guadagno_vs_vol_pct"] > 0),
        }

    res["gruppi"] = {"prezzi reali": gruppo(reali), "controllo sintetico": gruppo(ctrl)}
    res["durata_s"] = round(time.time() - t0, 1)
    p = f"/root/pi-harness/media/backtest-volatilita-{a.taglia}-{a.folds}f.json"
    json.dump(res, open(p, "w"), ensure_ascii=False, indent=1)
    print(f"\n# scritto {p} in {res['durata_s']}s")
    print(json.dumps(res["gruppi"], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
