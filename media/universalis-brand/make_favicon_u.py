#!/usr/bin/env python3
"""
make_favicon_u.py — favicon con la "U" smussata e gradiente del tema.

Scelta: forma `chamfer` (angoli tagliati a 45°, estetica tecnica) riempita con
il gradiente a 135° accent -> accent-2, gli stessi colori della dashboard.

Produce:
  - assets/favicon.ico con 16/32/48 tutti con la stessa forma
  - anteprima ingrandita con il confronto "prima (emblema) / adesso (U)"
Rende anche il file visibile nel browser copiandolo come assets/icon-905.png.
"""

import os
import shutil
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import universalis_brand as ub  # noqa: E402
from u_variants import ACCENT, ACCENT2, Canvas, v_chamfer  # noqa: E402
from mock_brand import png_decode  # noqa: E402

ICO = "/root/pi-harness/assets/favicon.ico"
ASSETS = "/root/pi-harness/assets"
DARKBG = (10, 14, 21)
SIZES = (16, 32, 48)


def grad_135(x, y, size):
    """Gradiente diagonale (135°, come la variabile --grad del tema)."""
    t = ((x + 0.5) + (y + 0.5)) / (2.0 * size)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return tuple(int(round(ACCENT[k] * (1 - t) + ACCENT2[k] * t)) for k in range(3))


def u_rows(size):
    """La U chamfer alla dimensione richiesta, su fondo scuro."""
    c = Canvas()
    v_chamfer(c)
    ink = c.down(size)
    rows = []
    for y, row in enumerate(ink):
        out = []
        for x, v in enumerate(row):
            a = v / 255.0
            col = grad_135(x, y, size)
            out.append(tuple(int(round(col[k] * a + DARKBG[k] * (1 - a))) for k in range(3)))
        rows.append(out)
    return rows, ink


def main():
    # --- nuovo favicon ---
    entries = []
    built = {}
    for s in SIZES:
        rows, ink = u_rows(s)
        built[s] = (rows, ink)
        p = os.path.join(HERE, "_u_%d.png" % s)
        ub.write_png(p, s, s, rows, alpha=False)
        with open(p, "rb") as f:
            entries.append((s, f.read()))
        os.remove(p)
        on = sum(1 for r in ink for v in r if v > 128)
        print("%dpx: %d/256 pixel coperti" % (s, on))

    bak = os.path.join(HERE, "favicon.ico.emblema-%s" % time.strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(ICO, bak)
    print("backup del .ico con l'emblema:", bak)
    ub.write_ico(ICO, entries)
    print("scritto %s (%d byte)" % (ICO, os.path.getsize(ICO)))

    # --- anteprima: riga 1 emblema (dal backup), riga 2 U nuova ---
    old = {}
    with open(bak, "rb") as f:
        import struct
        d = f.read()
        n = struct.unpack("<H", d[4:6])[0]
        for i in range(n):
            off = 6 + 16 * i
            iw, ih, _c, _r, _p, _b, sz, doff = struct.unpack("<BBBBHHII", d[off:off + 16])
            old[iw], _, _ = png_decode(d[doff:doff + sz])

    SC = 8
    PAD = 24
    CELL = max(SIZES) * SC + PAD
    PW = CELL * len(SIZES) + PAD
    PH = 2 * (max(SIZES) * SC + PAD + 14) + PAD
    sheet = [[(24, 30, 42)] * PW for _ in range(PH)]

    def blit(rows, ox, oy, scale):
        for yy, row in enumerate(rows):
            for xx, col in enumerate(row):
                for dy in range(scale):
                    ty = oy + yy * scale + dy
                    if not (0 <= ty < PH):
                        continue
                    for dx in range(scale):
                        tx = ox + xx * scale + dx
                        if 0 <= tx < PW:
                            sheet[ty][tx] = col[:3]

    for ri, (label, src) in enumerate((("emblema", old), ("U chamfer", None))):
        oy = PAD // 2 + ri * (max(SIZES) * SC + PAD + 14)
        for ci, s in enumerate(SIZES):
            rows = src[s] if src else built[s][0]
            ox = PAD // 2 + ci * CELL
            blit(rows, ox, oy, SC)

    prev = os.path.join(HERE, "favicon-confronto.png")
    ub.write_png(prev, PW, PH, sheet, alpha=False)
    print("anteprima (riga 1 = emblema precedente, riga 2 = U nuova):", prev)

    # rendo visibile l'anteprima dal browser
    shutil.copy2(prev, os.path.join(ASSETS, "icon-905.png"))


if __name__ == "__main__":
    main()
