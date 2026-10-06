#!/usr/bin/env python3
"""Rilevatore deterministico a bande di controllo. Nessun modello coinvolto.

Input  (stdin): righe "timestamp,valore" in ordine cronologico (intestazioni e righe
                sporche vengono ignorate; '#' apre un commento).
Output (stdout): JSON {livello, z, regole, media, dev_std, ultimo, punti}

livello 0 = normale, 1 = 1 sigma, 2 = 2 sigma o deriva, 3 = 3 sigma.

La baseline e' mobile e *esclude* i punti recenti: altrimenti l'anomalia alzerebbe
la soglia che dovrebbe farla scattare.
"""
import argparse
import json
import statistics
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="Bande di controllo su una serie di valori.")
    ap.add_argument("--finestra", type=int, default=30, help="punti della baseline mobile (default 30)")
    ap.add_argument("--recenti", type=int, default=8, help="punti recenti valutati con le regole (default 8)")
    ap.add_argument("--direzione", choices=["alto", "basso", "entrambi"], default="alto",
                    help="quale deviazione e' negativa (es. tasso di errore: alto)")
    a = ap.parse_args()

    vals = []
    for riga in sys.stdin:
        riga = riga.strip()
        if not riga or riga.startswith("#"):
            continue
        try:
            vals.append(float(riga.split(",")[-1]))
        except ValueError:
            continue  # intestazione o riga sporca

    def out(livello, **extra):
        d = {"livello": livello, "punti": len(vals)}
        d.update(extra)
        print(json.dumps(d, ensure_ascii=False))
        return 0

    if len(vals) < a.finestra + a.recenti:
        return out(0, motivo="dati insufficienti",
                   servono=a.finestra + a.recenti)

    recenti = vals[-a.recenti:]
    base = vals[-(a.finestra + a.recenti):-a.recenti]
    mu = statistics.fmean(base)
    sd = statistics.pstdev(base)
    lati = {"alto": (1,), "basso": (-1,), "entrambi": (1, -1)}[a.direzione]

    def deviazione_dalla_media(s):
        return (recenti[-1] - mu) * s

    # Serie perfettamente piatta: qualunque variazione e' degna di nota, ma non
    # si puo' esprimere in sigma (divisione per zero).
    if sd == 0:
        if deviazione_dalla_media(1) == 0:
            return out(0, z=0.0, regole=[], media=round(mu, 6), dev_std=0.0, ultimo=recenti[-1])
        return out(2, z=None, regole=["serie piatta: variazione improvvisa"],
                   media=round(mu, 6), dev_std=0.0, ultimo=recenti[-1])

    z = [(v - mu) / sd for v in recenti]

    regole = []
    for s in lati:
        if z[-1] * s >= 3:
            regole.append("WE1: ultimo punto oltre 3 sigma")
        if sum(1 for x in z[-3:] if x * s >= 2) >= 2:
            regole.append("WE2: 2 punti su 3 oltre 2 sigma dallo stesso lato")
        if sum(1 for x in z[-5:] if x * s >= 1) >= 4:
            regole.append("WE3: 4 punti su 5 oltre 1 sigma dallo stesso lato")
        if len(z) >= 8 and all(x * s > 0 for x in z[-8:]):
            regole.append("WE4: 8 punti consecutivi dallo stesso lato della media")

    zmax = max(z[-1] * s for s in lati)
    livello = 0
    if zmax >= 1:
        livello = 1
    if zmax >= 2 or any(r.startswith(("WE2", "WE3", "WE4")) for r in regole):
        livello = 2  # deriva o anomalia: diagnosi in sola lettura
    if zmax >= 3:
        livello = 3

    return out(livello, z=round(z[-1], 2), regole=regole,
               media=round(mu, 4), dev_std=round(sd, 4), ultimo=recenti[-1])


if __name__ == "__main__":
    sys.exit(main())
