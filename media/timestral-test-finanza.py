"""
Timestral in finanza: tre strade per renderlo utile, misurate invece che discusse.

Il punto di partenza misurato (media/timestral-backtest-volatilita.py): sul prezzo puntuale il
centro è pari al naive e l'incertezza è 3 % peggiore di una banda da volatilità storica. Qui si
provano le tre cose che potrebbero cambiare quel risultato, una per volta e con lo stesso metro
(pinball sugli stessi 7 livelli, rolling origin, solo passato):

  A. PIÙ CONTESTO — «aumentando la grandezza della serie». Stessa serie, stesso modello, contesto
     da 60 a 480 punti: se l'informazione c'è, un modello di sequenza la trova con più storia.
     Baseline: banda da volatilità calcolata sullo STESSO contesto (vantaggio al baseline, non al
     modello: più contesto aiuta anche la stima di sigma).

  B. PREVISIONE CONGIUNTA (l'unica capacità che la formula non ha) — un pannello di 4 serie legate
     dal dollaro (EUR/USD, BTC, oro COMEX, XAU/USD) allineato sulle date comuni, previsto in
     `mode=joint`: il modello può usare le dipendenze fra le serie. Confronto: joint contro
     separate contro banda da volatilità, sulla stessa origine.

  C. BERSAGLIO DIVERSO — non il livello del prezzo ma (c1) i RENDIMENTI logaritmici e (c2) la
     VOLATILITÀ REALIZZATA (radice della somma dei quadrati dei rendimenti su 5 giorni). Sono i
     due bersagli che in finanza si prevedono davvero: la direzione/magnitudo del movimento e
     quanto sarà agitato il mercato. Baseline: per i rendimenti il naive «zero» con banda da
     volatilità; per la volatilità il naive «come ieri» con banda dalla dispersione storica, e la
     EWMA (λ 0.94) che è lo standard di settore.

Uso: /opt/timestral-venv/bin/python media/timestral-test-finanza.py [--folds N] [--solo A|B|C]
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
N01 = NormalDist()
LIV7 = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]


def chiama(percorso, corpo):
    req = urllib.request.Request(
        URL + percorso,
        data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json", "X-Timestral-Token": TOKEN},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=900) as r:
        return json.load(r)


def demo_punti(ident):
    d = json.load(open("/root/pi-harness/media/timestral-demo.json"))
    for s in d["serie"]:
        if s["id"] == ident:
            return s["punti"]
    raise KeyError(ident)


def csv_punti(nome):
    righe = open(f"{DATI}/{nome}.csv").read().strip().split("\n")[1:]
    return [(r.split(",")[0], float(r.split(",")[1])) for r in righe if r.strip()]


def pinball(qv, y, livelli=LIV7):
    return statistics.mean(max(p * (y - q), (p - 1) * (y - q)) for p, q in zip(livelli, qv))


def qnorm(centro, sigma, livelli=LIV7):
    return [centro + N01.inv_cdf(p) * sigma for p in livelli]


def qlognorm(centro, sigma, livelli=LIV7):
    return [math.exp(math.log(max(centro, 1e-9)) + N01.inv_cdf(p) * sigma) for p in livelli]


def rendimenti(v):
    return [math.log(v[i] / v[i - 1]) for i in range(1, len(v)) if v[i - 1] > 0 and v[i] > 0]


def eval_forecast(s, h):
    """Estrae i 7 quantili comuni dalla risposta del servizio: (h x 7)."""
    chiavi = ("q05", "q10", "q25", "median", "q75", "q90", "q95")
    return [[s[k][i] for k in chiavi] for i in range(h)]


def medie(righe, chiave):
    return round(statistics.mean(r[chiave] for r in righe), 6)


# ---------------------------------------------------------------- A. contesto crescente
def test_A(folds, ctx_list=(60, 120, 250, 480)):
    serie = [
        ("cambio USD/EUR", [v for _, v in demo_punti("cambio-usd-eur")], 5),
        ("Bitcoin USD", [v for _, v in demo_punti("btc-usd")], 5),
        ("oro COMEX (giornaliero)", [v for _, v in csv_punti("oro-comex-usd-toz-giornaliero")], 5),
        ("Nasdaq Composite", [v for _, v in csv_punti("nasdaq-composite")], 5),
    ]
    out = []
    for nome, valori, h in serie:
        for ctx in ctx_list:
            if len(valori) - h - ctx < 15:   # servono almeno 15 origini
                continue
            righe, fold = [], 0
            origine = len(valori) - h
            while origine - ctx > 0 and fold < folds:
                contesto = valori[origine - ctx:origine]
                vero = valori[origine:origine + h]
                s = chiama("/forecast", {"series": [{"name": "s", "values": contesto}],
                                         "prediction_length": h})["series"][0]
                q = eval_forecast(s, h)
                r = rendimenti(contesto)
                sg = statistics.pstdev(r) if len(r) > 1 else 0.0
                for i, y in enumerate(vero):
                    k = i + 1
                    righe.append({"pb_t": pinball(q[i], y),
                                  "pb_vol": pinball(qlognorm(contesto[-1], sg * math.sqrt(k)), y),
                                  "e_t": abs(y - q[i][3]), "e_n": abs(y - contesto[-1])})
                origine -= 1
                fold += 1
            out.append({"serie": nome, "ctx": ctx, "h": h, "fold": fold,
                        "pinball_timestral": medie(righe, "pb_t"),
                        "pinball_vol": medie(righe, "pb_vol"),
                        "guadagno_vs_vol_pct": round(100 * (1 - medie(righe, "pb_t") / medie(righe, "pb_vol")), 1),
                        "mae_centro_vs_naive": round(medie(righe, "e_t") / medie(righe, "e_n"), 3)})
            print(json.dumps(out[-1], ensure_ascii=False))
    return out


# ---------------------------------------------------------------- B. congiunta, 4 serie
def test_B(folds, ctx=120, h=5):
    # pannello allineato sulle DATE comuni (le serie hanno calendari diversi)
    s1 = dict(demo_punti("cambio-usd-eur"))
    s2 = dict(demo_punti("btc-usd"))
    s3 = dict(csv_punti("oro-comex-usd-toz-giornaliero"))
    # oro-comex-usd-toz-giornaliero e xauusd-comex-giornaliero contengono GLI STESSI valori
    # (verificato: differenza media 0.0 su 181 date) -> nel pannello entra una volta sola,
    # altrimenti il "congiunto" conterebbe due volte la stessa variata.
    date = sorted(set(s1) & set(s2) & set(s3))
    pannello = {
        "cambio USD/EUR": [s1[d] for d in date],
        "Bitcoin USD": [s2[d] for d in date],
        "oro COMEX": [s3[d] for d in date],
    }
    print(f"[B] pannello allineato: {len(date)} date comuni, {date[0]} -> {date[-1]}")
    if len(date) - h - ctx < 10:
        return {"errore": "pannello troppo corto", "date_comuni": len(date)}
    nomi = list(pannello)
    righe = []
    origine = len(date) - h
    fold = 0
    while origine - ctx > 0 and fold < folds:
        contesto = {k: v[origine - ctx:origine] for k, v in pannello.items()}
        vero = {k: v[origine:origine + h] for k, v in pannello.items()}
        joint = chiama("/forecast", {"series": [{"name": k, "values": v} for k, v in contesto.items()],
                                     "prediction_length": h, "mode": "joint"})
        sep = {}
        for k, v in contesto.items():
            sep[k] = chiama("/forecast", {"series": [{"name": k, "values": v}],
                                          "prediction_length": h})["series"][0]
        for idx, k in enumerate(nomi):
            qj = eval_forecast(joint["series"][idx], h)
            qs = eval_forecast(sep[k], h)
            r = rendimenti(contesto[k])
            sg = statistics.pstdev(r) if len(r) > 1 else 0.0
            for i, y in enumerate(vero[k]):
                kk = i + 1
                righe.append({"serie": k,
                              "pb_joint": pinball(qj[i], y),
                              "pb_sep": pinball(qs[i], y),
                              "pb_vol": pinball(qlognorm(contesto[k][-1], sg * math.sqrt(kk)), y)})
        origine -= 1
        fold += 1
    out = {"date_comuni": len(date), "dal": date[0], "al": date[-1], "fold": fold, "per_serie": []}
    for k in nomi:
        sel = [r for r in righe if r["serie"] == k]
        pj, ps, pv = medie(sel, "pb_joint"), medie(sel, "pb_sep"), medie(sel, "pb_vol")
        migliore = min(pj, ps, pv)
        out["per_serie"].append({"serie": k, "pinball_joint": pj, "pinball_separate": ps,
                                 "pinball_vol": pv,
                                 "joint_vs_separate_pct": round(100 * (1 - pj / ps), 1),
                                 "joint_vs_migliore_pct": round(100 * (1 - pj / migliore), 1)})
        print(json.dumps(out["per_serie"][-1], ensure_ascii=False))
    return out


# ---------------------------------------------------------------- C. rendimenti e volatilità
def test_C(folds):
    serie = [
        ("cambio USD/EUR", [v for _, v in demo_punti("cambio-usd-eur")]),
        ("Bitcoin USD", [v for _, v in demo_punti("btc-usd")]),
        ("Nasdaq Composite", [v for _, v in csv_punti("nasdaq-composite")]),
        ("oro COMEX", [v for _, v in csv_punti("oro-comex-usd-toz-giornaliero")]),
    ]
    out = {"rendimenti": [], "volatilita": []}

    # C1 — rendimenti logaritmici: il bersaglio è r_t, il naive è «zero»
    for nome, prezzi in serie:
        r_all = rendimenti(prezzi)
        for h in (1, 5):
            righe, fold, origine = [], 0, len(r_all) - h
            while origine - 120 > 0 and fold < folds:
                contesto = r_all[origine - 120:origine]
                vero = r_all[origine:origine + h]
                s = chiama("/forecast", {"series": [{"name": "r", "values": contesto}],
                                         "prediction_length": h})["series"][0]
                q = eval_forecast(s, h)
                sg = statistics.pstdev(contesto)
                for i, y in enumerate(vero):
                    righe.append({"pb_t": pinball(q[i], y),
                                  "pb_zero": pinball(qnorm(0.0, sg), y),
                                  "pb_zero_sigma_vero": None,
                                  "e_t": abs(y - q[i][3]), "e_zero": abs(y)})
                origine -= 1
                fold += 1
            out["rendimenti"].append({
                "serie": nome, "h": h, "fold": fold,
                "pinball_timestral": medie(righe, "pb_t"),
                "pinball_naive_zero": medie(righe, "pb_zero"),
                "guadagno_vs_zero_pct": round(100 * (1 - medie(righe, "pb_t") / medie(righe, "pb_zero")), 1),
                "mae_centro_vs_zero": round(medie(righe, "e_t") / medie(righe, "e_zero"), 3),
            })
            print("[C1]", json.dumps(out["rendimenti"][-1], ensure_ascii=False))

    # C3 — volatilità realizzata, baseline con banda calibrata sui PROPRI residui in-sample:
    # il confronto onesto per un modello che si adatta (la banda fissa di C2 favoriva Timestral)
    for nome, prezzi in serie:
        r_all = rendimenti(prezzi)
        rv = [math.sqrt(sum(x * x for x in r_all[i - 4:i + 1])) for i in range(4, len(r_all))]
        for h in (1, 5):
            righe, fold, origine = [], 0, len(rv) - h
            while origine - 120 > 0 and fold < folds:
                contesto = rv[origine - 120:origine]
                vero = rv[origine:origine + h]
                s_ = chiama("/forecast", {"series": [{"name": "rv", "values": contesto}],
                                          "prediction_length": h})["series"][0]
                q = eval_forecast(s_, h)
                # EWMA ricorsiva DENTRO il contesto, residui uno-passo -> banda empirica
                ew = [contesto[0]]
                for x in contesto[1:]:
                    ew.append(0.94 * ew[-1] + 0.06 * x)
                resid_ew = [contesto[i] - ew[i - 1] for i in range(1, len(contesto))]
                sg_ew = statistics.pstdev(resid_ew)
                dif = [abs(contesto[i] - contesto[i - 1]) for i in range(1, len(contesto))]
                sg_n = statistics.pstdev(dif)
                for i, y in enumerate(vero):
                    k = i + 1
                    righe.append({"pb_t": pinball(q[i], y),
                                  "pb_naive": pinball(qnorm(contesto[-1], sg_n * math.sqrt(k)), y),
                                  "pb_ewma": pinball(qnorm(ew[-1], sg_ew * math.sqrt(k)), y),
                                  "e_t": abs(y - q[i][3]), "e_naive": abs(y - contesto[-1]),
                                  "e_ewma": abs(y - ew[-1])})
                origine -= 1
                fold += 1
            pt, pn, pe = medie(righe, "pb_t"), medie(righe, "pb_naive"), medie(righe, "pb_ewma")
            mig = min(pn, pe)
            out.setdefault("volatilita_banda_calibrata", []).append({
                "serie": nome, "h": h, "fold": fold,
                "pinball_timestral": pt, "pinball_naive": pn, "pinball_ewma": pe,
                "guadagno_vs_migliore_pct": round(100 * (1 - pt / mig), 1),
                "mae_centro_vs_naive": round(medie(righe, "e_t") / medie(righe, "e_naive"), 3),
                "mae_centro_vs_ewma": round(medie(righe, "e_t") / medie(righe, "e_ewma"), 3),
            })
            print("[C3]", json.dumps(out["volatilita_banda_calibrata"][-1], ensure_ascii=False))

    # C4 — volatilità realizzata contro HAR-RV, il benchmark accademico per la volatilità.
    # Formulazione MULTI-ORIZZONTE, che è quella corretta: il bersaglio è la media dei prossimi h
    # valori di rv, i regressori sono rv di ieri e le medie a 5 e 22 giorni, stimati con OLS
    # DENTRO il contesto; la banda viene dalla deviazione standard dei residui a h passi, quindi
    # già scalata sull'orizzonte (niente sqrt(k), che per una media mobile sarebbe sbagliato).
    import numpy as np
    for nome, prezzi in serie:
        r_all = rendimenti(prezzi)
        rv = np.array([math.sqrt(sum(x * x for x in r_all[i - 4:i + 1])) for i in range(4, len(r_all))])
        for h in (1, 5):
            righe, fold, origine = [], 0, len(rv) - h
            while origine - 150 > 0 and fold < folds:
                contesto = rv[origine - 150:origine]
                vero = rv[origine:origine + h]
                s_ = chiama("/forecast", {"series": [{"name": "rv", "values": [float(x) for x in contesto]}],
                                          "prediction_length": h})["series"][0]
                q = eval_forecast(s_, h)
                X, Y = [], []
                for t in range(22, len(contesto) - h):
                    X.append([1.0, contesto[t - 1], contesto[t - 5:t].mean(), contesto[t - 22:t].mean()])
                    Y.append(contesto[t:t + h].mean())
                coef = np.linalg.lstsq(np.array(X), np.array(Y), rcond=None)[0]
                resid = np.array(Y) - np.array(X) @ coef
                sg_har = float(resid.std(ddof=1))
                righe.append({"pb_t": 0.0, "pb_har": 0.0, "e_t": 0.0, "e_har": 0.0})
                for i, y in enumerate(vero):
                    storia = np.concatenate([contesto, np.array(vero[:i])])
                    x_new = np.array([1.0, storia[-1], storia[-5:].mean(), storia[-22:].mean()])
                    p_har = float(x_new @ coef)
                    righe[-1]["pb_t"] += pinball(q[i], y) / h
                    righe[-1]["pb_har"] += pinball(qnorm(p_har, sg_har), y) / h
                    righe[-1]["e_t"] += abs(y - q[i][3]) / h
                    righe[-1]["e_har"] += abs(y - p_har) / h
                origine -= 1
                fold += 1
            pt, ph = medie(righe, "pb_t"), medie(righe, "pb_har")
            out.setdefault("volatilita_vs_har", []).append({
                "serie": nome, "h": h, "fold": fold,
                "pinball_timestral": pt, "pinball_har_rv": ph,
                "guadagno_vs_har_pct": round(100 * (1 - pt / ph), 1),
                "mae_centro_vs_har": round(medie(righe, "e_t") / medie(righe, "e_har"), 3),
            })
            print("[C4]", json.dumps(out["volatilita_vs_har"][-1], ensure_ascii=False))

    # C2 — volatilità realizzata su 5 giorni: sqrt(somma dei quadrati dei rendimenti)
    for nome, prezzi in serie:
        r_all = rendimenti(prezzi)
        rv = [math.sqrt(sum(x * x for x in r_all[i - 4:i + 1])) for i in range(4, len(r_all))]
        for h in (1, 5):
            righe, fold, origine = [], 0, len(rv) - h
            while origine - 120 > 0 and fold < folds:
                contesto = rv[origine - 120:origine]
                vero = rv[origine:origine + h]
                s = chiama("/forecast", {"series": [{"name": "rv", "values": contesto}],
                                         "prediction_length": h})["series"][0]
                q = eval_forecast(s, h)
                # baseline 1: «volatilità come ieri», banda dalla dispersione storica dei rv
                sg = statistics.pstdev(contesto)
                # baseline 2: EWMA dei rv (λ 0.94), lo standard per la volatilità
                var = statistics.variance(contesto[:20])
                for x in contesto[20:]:
                    var = 0.94 * var + 0.06 * x * x
                ew = math.sqrt(var)
                for i, y in enumerate(vero):
                    k = i + 1
                    righe.append({"pb_t": pinball(q[i], y),
                                  "pb_naive": pinball(qnorm(contesto[-1], sg * math.sqrt(k)), y),
                                  "pb_ewma": pinball(qnorm(ew, sg * math.sqrt(k)), y),
                                  "e_t": abs(y - q[i][3]), "e_naive": abs(y - contesto[-1]),
                                  "e_ewma": abs(y - ew)})
                origine -= 1
                fold += 1
            pt, pn, pe = medie(righe, "pb_t"), medie(righe, "pb_naive"), medie(righe, "pb_ewma")
            mig = min(pn, pe)
            out["volatilita"].append({
                "serie": nome, "h": h, "fold": fold,
                "pinball_timestral": pt, "pinball_naive": pn, "pinball_ewma": pe,
                "guadagno_vs_migliore_pct": round(100 * (1 - pt / mig), 1),
                "mae_centro_vs_naive": round(medie(righe, "e_t") / medie(righe, "e_naive"), 3),
                "mae_centro_vs_ewma": round(medie(righe, "e_t") / medie(righe, "e_ewma"), 3),
            })
            print("[C2]", json.dumps(out["volatilita"][-1], ensure_ascii=False))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=30)
    ap.add_argument("--solo", default="ABC")
    a = ap.parse_args()
    t0 = time.time()
    chiama("/model", {"size": "28M"})
    res = {"folds": a.folds, "generato": time.strftime("%Y-%m-%d %H:%M")}
    if "A" in a.solo:
        print("\n=== A. più contesto ===")
        res["A_piu_contesto"] = test_A(a.folds)
    if "B" in a.solo:
        print("\n=== B. previsione congiunta su 4 serie ===")
        res["B_congiunta"] = test_B(a.folds)
    if "C" in a.solo:
        print("\n=== C. rendimenti e volatilità ===")
        res["C_bersaglio"] = test_C(a.folds)
    res["durata_s"] = round(time.time() - t0, 1)
    p = f"/root/pi-harness/media/test-finanza-{a.folds}f.json"
    json.dump(res, open(p, "w"), ensure_ascii=False, indent=1)
    print(f"\n# scritto {p} in {res['durata_s']}s")


if __name__ == "__main__":
    main()
