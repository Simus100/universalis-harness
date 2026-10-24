"""
Banco di prova Timestral — serve a scegliere la TAGLIA giusta per questa VPS, con numeri
misurati e non stimati.

Misura su hardware reale (6 vCPU Broadwell, nessuna GPU, 11 GB RAM):
  1. tempo di caricamento dei pesi e RAM residente (RSS) dopo il caricamento / un forecast;
  2. latenza di due forecast realistici — giornaliero (contesto 1000, orizzonte 30) e
     multivariato a 15 minuti (contesto 2016, 5 variate, orizzonte 96);
  3. qualità zero-shot per taglia: rolling-origin su serie REALI (USD/EUR giornaliero, BTC)
     con pinball loss medio (la loss di training: proxy del CRPS) e MAE contro il naive.

Uso: /opt/timestral-venv/bin/python media/timestral-bench.py [5M 28M 123M 209M ...]
"""
import json
import resource
import statistics
import sys
import time

import numpy as np

MODELS = sys.argv[1:] or ["5M", "28M"]


def cur_rss_mb():
    with open("/proc/self/status") as f:
        for line in f:
            if line.startswith("VmRSS:"):
                return round(int(line.split()[1]) / 1024, 0)
    return None


def peak_rss_mb():
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 0)


def fx_series():
    d = json.load(open("/tmp/fx.json"))
    rows = sorted(d["rates"].items())
    return np.array([v["EUR"] for _, v in rows], dtype=np.float64)


def btc_series():
    try:
        d = json.load(open("/tmp/btc.json"))
        return np.array([p[1] for p in d["prices"]], dtype=np.float64)
    except Exception:
        return None


def pinball_all(q, y, levels):
    """Pinball loss medio su tutti i quantili: q ha forma (H, Q), y forma (H,)."""
    diff = y[:, None] - q  # (H, Q)
    lv = np.asarray(levels)[None, :]
    return float(np.mean(np.maximum(lv * diff, (lv - 1) * diff)))


def backtest(fc, series, ctx=512, h=30, folds=5):
    """Rolling origin a passi di ctx//2: nessun addestramento, si misura lo zero-shot."""
    ser = np.asarray(series, dtype=np.float64)
    ser = ser[~np.isnan(ser)]
    levels = fc.quantile_levels
    pb_m, pb_n, mae_m, mae_n = [], [], [], []
    origin = len(ser) - h
    for _ in range(folds):
        if origin - ctx < 0:
            break
        y = ser[origin:origin + h]
        context = ser[origin - ctx:origin].reshape(1, 1, -1)
        f = fc.forecast(context, prediction_length=h)
        q = f.quantiles[0, 0].cpu().numpy()
        med = f.median[0, 0].cpu().numpy()
        naive_point = np.full(h, ser[origin - 1])
        naive_q = np.repeat(naive_point[:, None], len(levels), axis=1)
        pb_m.append(pinball_all(q, y, levels))
        pb_n.append(pinball_all(naive_q, y, levels))
        mae_m.append(float(np.mean(np.abs(y - med))))
        mae_n.append(float(np.mean(np.abs(y - naive_point))))
        origin -= ctx // 2
    if not pb_m:
        return None
    return {
        "folds": len(pb_m),
        "pinball_modello": round(statistics.mean(pb_m), 6),
        "pinball_naive": round(statistics.mean(pb_n), 6),
        "guadagno_pinball_pct": round(100 * (1 - statistics.mean(pb_m) / statistics.mean(pb_n)), 2),
        "mae_modello": round(statistics.mean(mae_m), 6),
        "mae_naive": round(statistics.mean(mae_n), 6),
    }


def main():
    series_fx = fx_series()
    series_btc = btc_series()
    for name in MODELS:
        from timestral import TimestralForecaster

        rec = {"taglia": name}
        try:
            t0 = time.time()
            fc = TimestralForecaster.from_pretrained(f"mistralai/Timestral-{name}")
            rec["load_s"] = round(time.time() - t0, 2)
        except Exception as e:  # noqa: BLE001
            rec["errore"] = f"caricamento: {e}"
            print(json.dumps(rec, ensure_ascii=False), flush=True)
            continue
        rec["rss_dopo_load_mb"] = cur_rss_mb()

        ctx = series_fx[-1000:].reshape(1, 1, -1)
        fc.forecast(ctx, prediction_length=30)  # warm-up
        t0 = time.time()
        fc.forecast(ctx, prediction_length=30)
        rec["lat_giornaliero_1000x30_s"] = round(time.time() - t0, 3)
        rec["rss_dopo_forecast_mb"] = cur_rss_mb()

        rng = np.random.default_rng(0)
        mv = np.cumsum(rng.standard_normal((1, 5, 2016)), axis=-1) + 100
        t0 = time.time()
        f2 = fc.forecast(mv, prediction_length=96)
        rec["lat_15min_2016x5x96_s"] = round(time.time() - t0, 3)
        rec["shape_quantili"] = list(f2.quantiles.shape)
        rec["rss_picco_mb"] = peak_rss_mb()

        rec["backtest_usd_eur"] = backtest(fc, series_fx)
        if series_btc is not None:
            rec["backtest_btc"] = backtest(fc, series_btc, ctx=256, h=14, folds=3)
        print(json.dumps(rec, ensure_ascii=False), flush=True)
        del fc


if __name__ == "__main__":
    main()
