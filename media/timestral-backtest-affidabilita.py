"""
Backtest d'affidabilità — Timestral (28M) contro i baseline semplici, su 11 serie.

A che domanda risponde: «il sistema di previsioni è affidabile?» — cioè, tre cose separate:
  1. il CENTRO (la mediana) batte il «domani come oggi» e il «periodo scorso»?
  2. la DISTRIBUZIONE (il pinball, la loss probabilistica) batte un naive senza incertezza?
  3. la BANDA dichiarata è onesta? una banda «80%» che contiene il vero il 60% delle volte
     mente all'utente, e questo è il difetto che conta più di tutti.

Metodo, dichiarato per intero (i numeri devono essere ricontrollabili):
  - rolling origin: contesto = `ctx` punti che precedono l'origine, orizzonte h, poi l'origine
    avanza di UN passo. Solo passato: nessuna informazione dal futuro, il modello non ha mai
    visto il punto che deve indovinare.
  - le finestre si sovrappongono (passo 1) quindi gli errori NON sono indipendenti: i conteggi
    «vince N punti su M» servono a ordinare, non a fare un test di significatività forte.
  - baseline: naive (ultimo valore ripetuto), naive stagionale (valore di `stag` passi prima,
    se il periodo entra nel contesto), deriva (pendenza media degli ultimi 14 passi), media
    mobile 7.
  - metriche: MAE e RMSE per punto; MASE = MAE del modello / MAE in-sample del naive sul
    contesto (scala libera: <1 vuol dire «meglio del naive»); pinball medio sui 21 livelli
    del modello contro il pinball di una distribuzione degenere sul naive; copertura empirica
    delle bande 80% e 95%; PIT (dove cade il vero nell'assortimento dei quantili: se il
    modello è calibrato è uniforme, media 0,5).

Uso:  /opt/timestral-venv/bin/python media/timestral-backtest-affidabilita.py [--folds N] [--taglia 28M]
Scrive: media/backtest-affidabilita-<taglia>.json
"""
import argparse
import json
import statistics
import sys
import time
import urllib.request

TOKEN = open("/etc/timestral/token").read().strip()
URL = "http://127.0.0.1:8018"
DATI = "/root/pi-harness/media/previsioni/dati"
DEMO = "/root/pi-harness/media/timestral-demo.json"


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


# (etichetta, valori, [orizzonti], ctx, periodo stagionale o None, tipo)
def casi():
    out = []
    out.append(("cambio USD/EUR (giornaliero, reale)", demo("cambio-usd-eur"), [1, 5, 20], 250, 5, "reale"))
    out.append(("Bitcoin USD (giornaliero, reale)", demo("btc-usd"), [1, 5], 250, 7, "reale"))
    out.append(("cassa giornaliera (sintetica, stag. 7+365)", demo("cassa-giornaliera"), [1, 7], 250, 7, "sintetica"))
    out.append(("carico elettrico (orario, sintetica)", demo("carico-energia"), [1, 24], 336, 24, "sintetica"))
    out.append(("Nasdaq Composite (giornaliero, reale)", csv("nasdaq-composite"), [1, 5], 180, 5, "reale"))
    out.append(("oro COMEX (giornaliero, reale)", csv("oro-comex-usd-toz-giornaliero"), [1, 5], 200, 5, "reale"))
    out.append(("XAU/USD COMEX (giornaliero, reale)", csv("xauusd-comex-giornaliero"), [1, 5], 150, 5, "reale"))
    out.append(("oro COMEX (15 minuti, reale)", csv("oro-comex-usd-toz-15min"), [4, 16], 200, None, "reale"))
    out.append(("oro USD/toz (mensile, reale)", csv("oro-usd-toz"), [1, 3, 12], 60, 12, "reale"))
    out.append(("inflazione area euro (mensile, reale)", csv("inflazione-area-euro"), [3, 12], 60, 12, "reale"))
    out.append(("inflazione Italia IPCA (mensile, reale)", csv("inflazione-italia-ipca"), [3, 12], 48, 12, "reale"))
    return out


LIVELLI = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]


def naive_in_sample(ctx):
    d = [abs(ctx[i] - ctx[i - 1]) for i in range(1, len(ctx))]
    return statistics.mean(d) if d else 1.0


def pinball(qv, y, livelli):
    return statistics.mean(max(p * (y - q), (p - 1) * (y - q)) for p, q in zip(livelli, qv))


def interp(qv, livelli, livello):
    """Quantile a un livello qualsiasi, interpolato fra i livelli disponibili."""
    for i in range(len(livelli) - 1):
        a, b = livelli[i], livelli[i + 1]
        if a <= livello <= b:
            t = (livello - a) / (b - a) if b > a else 0
            return qv[i] + t * (qv[i + 1] - qv[i])
    return qv[-1] if livello > livelli[-1] else qv[0]


def backtest(valori, h, ctx, stag, max_folds):
    righe = []
    origine = len(valori) - h
    livelli = None
    fold = 0
    while origine - ctx > 0 and fold < max_folds:
        contesto = valori[origine - ctx:origine]
        vero = valori[origine:origine + h]
        out = chiama("/forecast", {"series": [{"name": "s", "values": contesto}],
                                  "prediction_length": h, "mode": "separate"})
        s = out["series"][0]
        livelli = out["quantile_levels"]
        naive = contesto[-1]
        stagionale = contesto[-stag] if (stag and stag < len(contesto)) else None
        pendenza = (contesto[-1] - contesto[-14]) / 13 if len(contesto) >= 14 else 0.0
        deriva = contesto[-1] + pendenza
        mm = statistics.mean(contesto[-7:])
        den = naive_in_sample(contesto)
        for i, y in enumerate(vero):
            qv = [s[q][i] for q in ("q05", "q10", "q25", "median", "q75", "q90", "q95")]
            qv_full = [interp(qv, [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95], l) for l in livelli]
            righe.append({
                "fold": fold,
                "passo": i + 1,
                "y": y,
                "med": s["median"][i],
                "naive": naive,
                "stag": stagionale,
                "deriva": deriva,
                "mm": mm,
                "e_mod": abs(y - s["median"][i]),
                "e_naive": abs(y - naive),
                "e_stag": abs(y - stagionale) if stagionale is not None else None,
                "e_deriva": abs(y - deriva),
                "e_mm": abs(y - mm),
                "mase_den": den,
                "pb_mod": pinball(qv_full, y, livelli),
                "pb_naive": pinball([naive] * len(livelli), y, livelli),
                "in80": 1 if qv[1] <= y <= qv[5] else 0,
                "in95": 1 if qv[0] <= y <= qv[6] else 0,
                "pit": sum(1 for q in qv_full if q < y) / len(qv_full),
                "amp80": qv[5] - qv[1],
                "segno": y - s["median"][i],
                "dentro": {L: (interp(qv, [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95], 0.5 - L / 2)
                           <= y <=
                           interp(qv, [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95], 0.5 + L / 2)) for L in LIVELLI},
            })
        origine -= 1
        fold += 1
    return righe, livelli


def bootstrap_rapporto(righe, B=2000):
    """Intervallo di confidenza al 90% del rapporto MAE modello/naive, ricampionando le FINESTRE
    intere (non i singoli punti: dentro una finestra gli errori sono dipendenti)."""
    import random
    per_fold = {}
    for r in righe:
        a = per_fold.setdefault(r["fold"], [0.0, 0.0])
        a[0] += r["e_mod"]
        a[1] += r["e_naive"]
    chiavi = list(per_fold)
    if len(chiavi) < 5:
        return None
    rnd = random.Random(20261026)  # seme fisso: il numero non cambia fra due esecuzioni
    rapporti = []
    for _ in range(B):
        campione = [per_fold[rnd.choice(chiavi)] for _ in chiavi]
        m = sum(c[0] for c in campione)
        n = sum(c[1] for c in campione)
        if n:
            rapporti.append(m / n)
    rapporti.sort()
    return [round(rapporti[int(0.05 * len(rapporti))], 3), round(rapporti[int(0.95 * len(rapporti))], 3)]


def _blocchi(righe, n=3):
    """La storia divisa in n blocchi cronologici: fold 0 = la finestra più RECENTE, quindi
    l'ultimo blocco è il passato remoto. Serve a vedere se la qualità è stabile nel tempo."""
    folds = sorted({r["fold"] for r in righe})
    if len(folds) < 6:
        return None
    taglia = len(folds) // n
    out = {}
    for b in range(n):
        sel_f = folds[b * taglia:(b + 1) * taglia] if b < n - 1 else folds[b * taglia:]
        sel = [r for r in righe if r["fold"] in sel_f]
        m = statistics.mean(r["e_mod"] for r in sel)
        nn = statistics.mean(r["e_naive"] for r in sel)
        out[f"blocco{b + 1} ({'piu recente' if b == 0 else 'piu vecchio' if b == n - 1 else 'centrale'})"] = {
            "finestre": len(sel_f),
            "mae_rapporto_naive": round(m / nn, 3) if nn else None,
            "dentro80": round(100 * statistics.mean(r["in80"] for r in sel), 1),
        }
    return out


def riassumi(righe, livelli):
    if not righe:
        return {"errore": "nessuna finestra"}
    n = len(righe)
    mae = {k: statistics.mean(r[k] for r in righe) for k in ("e_mod", "e_naive", "e_deriva", "e_mm")}
    if any(r["e_stag"] is not None for r in righe):
        mae["e_stag"] = statistics.mean(r["e_stag"] for r in righe if r["e_stag"] is not None)
    pb_m = statistics.mean(r["pb_mod"] for r in righe)
    pb_n = statistics.mean(r["pb_naive"] for r in righe)
    amp = statistics.mean(r["amp80"] for r in righe)
    # per orizzonte: la copertura non è la stessa al passo 1 e al passo h
    per_passo = {}
    for p in sorted({r["passo"] for r in righe}):
        sel = [r for r in righe if r["passo"] == p]
        per_passo[p] = {
            "punti": len(sel),
            "mae_mod": round(statistics.mean(r["e_mod"] for r in sel), 4),
            "mae_naive": round(statistics.mean(r["e_naive"] for r in sel), 4),
            "dentro80": round(100 * statistics.mean(r["in80"] for r in sel), 1),
            "dentro95": round(100 * statistics.mean(r["in95"] for r in sel), 1),
        }
    return {
        "punti": n,
        "mae": {k: round(v, 4) for k, v in mae.items()},
        "mae_rapporto_naive": round(mae["e_mod"] / mae["e_naive"], 3) if mae["e_naive"] else None,
        "mase": round(statistics.mean(r["e_mod"] for r in righe) /
                      statistics.mean(r["mase_den"] for r in righe), 3),
        "rmse": {"modello": round(statistics.mean(r["e_mod"] ** 2 for r in righe) ** 0.5, 4),
                 "naive": round(statistics.mean(r["e_naive"] ** 2 for r in righe) ** 0.5, 4)},
        "pinball": {"modello": round(pb_m, 5), "naive": round(pb_n, 5),
                    "guadagno_pct": round(100 * (1 - pb_m / pb_n), 1) if pb_n else None},
        "dentro80": round(100 * statistics.mean(r["in80"] for r in righe), 1),
        "dentro95": round(100 * statistics.mean(r["in95"] for r in righe), 1),
        "ampiezza_media_80": round(amp, 4),
        "ampiezza_su_errore": round(amp / statistics.mean(r["e_mod"] for r in righe), 2) if mae["e_mod"] else None,
        "pit_medio": round(statistics.mean(r["pit"] for r in righe), 3),
        "pit_estremo_pct": round(100 * statistics.mean(1 if (r["pit"] < 0.05 or r["pit"] > 0.95) else 0 for r in righe), 1),
        "vince_punti_naive_pct": round(100 * statistics.mean(1 if r["e_mod"] < r["e_naive"] else 0 for r in righe), 1),
        "vince_punti_deriva_pct": round(100 * statistics.mean(1 if r["e_mod"] < r["e_deriva"] else 0 for r in righe), 1),
        "bias_medio": round(statistics.mean(r["segno"] for r in righe), 4),
        "bias_relativo_pct": round(100 * statistics.mean(r["segno"] for r in righe) /
                                   statistics.mean(abs(r["y"]) for r in righe), 2),
        "copertura_per_livello": {L: round(100 * statistics.mean(1 if r["dentro"][L] else 0 for r in righe), 1)
                                  for L in LIVELLI},
        "fold": len({r["fold"] for r in righe}),
        "per_fold": [{"fold": k,
                      "mae_mod": round(statistics.mean(r["e_mod"] for r in sel), 4),
                      "mae_naive": round(statistics.mean(r["e_naive"] for r in sel), 4),
                      "in80": round(100 * statistics.mean(r["in80"] for r in sel), 1)}
                     for k, sel in sorted({k: [r for r in righe if r["fold"] == k] for k in {r["fold"] for r in righe}}.items())],
        "blocchi": _blocchi(righe),
        "ci90_rapporto_mae": bootstrap_rapporto(righe),
        "per_passo": per_passo,
        "livelli": livelli,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=30, help="finestre per caso (rolling, passo 1)")
    ap.add_argument("--taglia", default="28M")
    a = ap.parse_args()

    t0 = time.time()
    chiama("/model", {"size": a.taglia})
    print(f"# taglia {a.taglia} · finestre max per caso {a.folds}", file=sys.stderr)

    risultato = {"taglia": a.taglia, "folds_max": a.folds, "casi": [], "generato": time.strftime("%Y-%m-%d %H:%M")}
    for nome, valori, orizzonti, ctx, stag, tipo in casi():
        for h in orizzonti:
            t = time.time()
            righe, livelli = backtest(valori, h, ctx, stag, a.folds)
            r = {"serie": nome, "tipo": tipo, "punti_serie": len(valori), "h": h, "ctx": ctx,
                 "stagionale": stag, **riassumi(righe, livelli)}
            risultato["casi"].append(r)
            print(json.dumps({k: r[k] for k in ("serie", "h", "punti", "mae_rapporto_naive", "mase",
                                                 "dentro80", "dentro95", "pinball", "pit_medio",
                                                 "vince_punti_naive_pct")}, ensure_ascii=False), file=sys.stderr)
            print(f"    ({time.time() - t:.1f}s)", file=sys.stderr)

    # medie di gruppo
    def gruppo(sel):
        if not sel:
            return None
        return {
            "casi": len(sel),
            "mae_rapporto_naive": round(statistics.mean(c["mae_rapporto_naive"] for c in sel), 3),
            "dentro80": round(statistics.mean(c["dentro80"] for c in sel), 1),
            "dentro95": round(statistics.mean(c["dentro95"] for c in sel), 1),
            "pinball_guadagno_pct": round(statistics.mean(c["pinball"]["guadagno_pct"] for c in sel), 1),
            "vince_punti_naive_pct": round(statistics.mean(c["vince_punti_naive_pct"] for c in sel), 1),
            "vince_punti_deriva_pct": round(statistics.mean(c["vince_punti_deriva_pct"] for c in sel), 1),
            "copertura_per_livello": {str(L): round(statistics.mean(c["copertura_per_livello"][L] for c in sel), 1)
                                      for L in LIVELLI},
        }

    casi_tutti = risultato["casi"]
    brevi = [c for c in casi_tutti if c["h"] <= 5]
    lunghi = [c for c in casi_tutti if c["h"] > 5]
    risultato["gruppi"] = {
        "breve (h<=5)": gruppo(brevi),
        "lungo (h>5)": gruppo(lunghi),
        "tutti": gruppo(casi_tutti),
        "reali": gruppo([c for c in casi_tutti if c["tipo"] == "reale"]),
        "sintetiche": gruppo([c for c in casi_tutti if c["tipo"] == "sintetica"]),
    }
    risultato["durata_s"] = round(time.time() - t0, 1)
    percorso = f"/root/pi-harness/media/backtest-affidabilita-{a.taglia}-{a.folds}f.json"
    with open(percorso, "w") as f:
        json.dump(risultato, f, ensure_ascii=False, indent=1)
    print(f"\n# scritto {percorso} in {risultato['durata_s']}s", file=sys.stderr)
    print(json.dumps(risultato["gruppi"], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
