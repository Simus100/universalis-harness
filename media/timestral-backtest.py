"""
Backtest di confronto — Timestral contro i baseline più semplici, su serie reali.

Metodo (dichiarato, così i numeri sono ricontrollabili):
  - rolling origin: si prende un contesto di `ctx` punti, si prevede `h`, si confronta con
    il valore vero, poi si sposta l'origine indietro di `h` e si ripete (`folds` volte);
  - il contesto cresce sempre solo col PASSATO (nessuna informazione dal futuro);
  - baseline: naive (ultimo valore ripetuto), media mobile a k punti, deriva (ultimo valore
    più la pendenza media degli ultimi k passi);
  - metriche: MAE e RMSE sulla previsione puntuale (mediana per Timestral), MASE diviso
    l'errore del naive calcolato DENTRO il contesto (scala libera: <1 meglio del naive),
    e per Timestral il pinball medio (la loss di training) con la copertura empirica delle
    bande 80% e 95% (una banda dichiarata 80% che contiene il vero il 40% delle volte è
    troppo stretta, e va detto).

Uso: /opt/timestral-venv/bin/python media/timestral-backtest.py
"""
import json
import statistics
import urllib.request

TOKEN = open("/etc/timestral/token").read().strip()
URL = "http://127.0.0.1:8018"


def chiama(percorso, corpo):
    req = urllib.request.Request(
        URL + percorso,
        data=json.dumps(corpo).encode(),
        headers={"Content-Type": "application/json", "X-Timestral-Token": TOKEN},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def serie(nome):
    with open(f"/root/pi-harness/media/previsioni/dati/{nome}.csv") as f:
        righe = f.read().strip().split("\n")[1:]
    return [float(r.split(",")[1]) for r in righe if r.strip()]


def mase_denominatore(contesto):
    """Errore del naive IN SAMPLE: scala naturale della serie, come nel MASE di Hyndman."""
    d = [abs(contesto[i] - contesto[i - 1]) for i in range(1, len(contesto))]
    return statistics.mean(d) if d else 1.0


def media_mobile(vals, k=7):
    return statistics.mean(vals[-k:])


def deriva(vals, k=14):
    pendenza = (vals[-1] - vals[-k]) / (k - 1)
    return vals[-1] + pendenza


def backtest(valori, h, folds, ctx, taglia=None):
    livelli = None
    righe = []
    origine = len(valori) - h
    for _ in range(folds):
        if origine - ctx <= 0:
            break
        contesto = valori[origine - ctx:origine]
        vero = valori[origine:origine + h]
        out = chiama("/forecast", {"series": [{"name": "s", "values": contesto}], "prediction_length": h, "mode": "separate"})
        s = out["series"][0]
        livelli = out["quantile_levels"]
        med = s["median"]
        q05, q10, q90, q95 = s["q05"], s["q10"], s["q90"], s["q95"]
        naive = [contesto[-1]] * h
        mm = [media_mobile(contesto)] * h
        dr = [deriva(contesto)] * h
        mase_den = mase_denominatore(contesto)
        righe.append({
            "mae": {"modello": statistics.mean(abs(a - b) for a, b in zip(vero, med)),
                    "naive": statistics.mean(abs(a - b) for a, b in zip(vero, naive)),
                    "media_mobile": statistics.mean(abs(a - b) for a, b in zip(vero, mm)),
                    "deriva": statistics.mean(abs(a - b) for a, b in zip(vero, dr))},
            "rmse": {"modello": (statistics.mean((a - b) ** 2 for a, b in zip(vero, med))) ** 0.5,
                     "naive": (statistics.mean((a - b) ** 2 for a, b in zip(vero, naive))) ** 0.5},
            "mase": statistics.mean(abs(a - b) for a, b in zip(vero, med)) / mase_den,
            "pinball": statistics.mean(
                sum(max(p * (t - q), (p - 1) * (t - q)) for p, q in zip(livelli, qv)) / len(livelli)
                for t, qv in zip(vero, [[s["q05"][i], s["q25"][i], s["median"][i], s["q75"][i], s["q95"][i]] for i in range(h)])
            ),
            "dentro80": statistics.mean(1 if q10[i] <= vero[i] <= q90[i] else 0 for i in range(h)),
            "dentro95": statistics.mean(1 if q05[i] <= vero[i] <= q95[i] else 0 for i in range(h)),
        })
        origine -= h

    if not righe:
        return {"folds": 0, "h": h, "ctx": ctx, "errore": "contesto troppo lungo per la serie: nessuna finestra disponibile"}

    def media(chiave, modello):
        return statistics.mean(r[chiave][modello] for r in righe)

    return {
        "folds": len(righe),
        "h": h,
        "ctx": ctx,
        "mae": {m: round(media("mae", m), 2) for m in ("modello", "naive", "media_mobile", "deriva")},
        "rmse": {m: round(media("rmse", m), 2) for m in ("modello", "naive")},
        "mase": round(statistics.mean(r["mase"] for r in righe), 3),
        "pinball": round(statistics.mean(r["pinball"] for r in righe), 4),
        "dentro80": round(100 * statistics.mean(r["dentro80"] for r in righe), 1),
        "dentro95": round(100 * statistics.mean(r["dentro95"] for r in righe), 1),
    }


def main():
    nasdaq = serie("nasdaq-composite")
    cambio = serie("inflazione-area-euro")
    casi = [
        ("nasdaq-composite (giornaliero)", nasdaq, 1, 8, 200),
        ("nasdaq-composite (giornaliero)", nasdaq, 5, 6, 200),
        ("inflazione-area-euro (mensile)", cambio, 3, 6, 60),
        ("inflazione-area-euro (mensile)", cambio, 12, 5, 60),
    ]
    for nome, valori, h, folds, ctx in casi:
        r = backtest(valori, h, folds, ctx)
        print(json.dumps({"serie": nome, **r}, ensure_ascii=False))
        # confronto taglia: la 209M fa meglio della 28M su questa serie?
        if nome.startswith("nasdaq") and h == 5:
            chiama("/model", {"size": "209M"})
            r2 = backtest(valori, h, folds, ctx)
            print(json.dumps({"serie": nome, "variante": "209M", **r2}, ensure_ascii=False))
            chiama("/model", {"size": "28M"})


if __name__ == "__main__":
    main()
