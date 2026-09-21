#!/usr/bin/env python3
"""
make_favicon.py — rigenera assets/favicon.ico con il 16px semplificato.

- 16px : variante "intero" (quadrato alto quanto l'emblema) + tratti ispessiti
         di 1px + soglia di contrasto: le due teste e la stella restano leggibili
- 32/48: come prima (ritaglio centrale stretto, ratio 0.94)

Scrive un'anteprima ingrandita per il controllo visivo e fa il backup del .ico
precedente prima di sostituirlo.
"""

import os
import shutil
import struct
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import universalis_brand as ub  # noqa: E402
from favicon16_variants import box_down, contrast, crop_window, dilate  # noqa: E402

ICO = "/root/pi-harness/assets/favicon.ico"
LIGHT = (238, 242, 249)
DARKBG = (10, 14, 21)
THR = 0.30
DILATE_R = 1
MARGIN = 1.06  # respiro attorno al marchio nel 16px


def ink_on_dark(ink, bg=DARKBG, color=LIGHT):
    """ink: matrice 0..255 (255 = inchiostro) → righe RGB su fondo pieno."""
    rows = []
    for row in ink:
        out = []
        for v in row:
            a = v / 255.0
            out.append(tuple(int(round(color[k] * a + bg[k] * (1 - a))) for k in range(3)))
        rows.append(out)
    return rows


def main():
    alpha, w, h, _ = ub.load_alpha()
    x0, y0, x1, y1 = ub.bbox(alpha, w, h)
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    print("bbox %dx%d" % (bw, bh))

    # --- 16px: variante semplificata ---
    thick = dilate(alpha, DILATE_R)
    side = int(round(bh * MARGIN))
    win = crop_window(thick, x0 + bw * 0.5, y0 + bh * 0.5, side)
    ink16 = contrast(box_down(win, 16), THR)
    on16 = sum(1 for r in ink16 for v in r if v > 128)
    print("16px: ritaglio %dpx, dilatazione %d → %d/256 pixel accesi" % (side, DILATE_R, on16))
    png16_rows = ink_on_dark(ink16)

    # --- 32 e 48: come prima ---
    mark = ub.crop_pad(alpha, w, h, (x0, y0, x1, y1))
    favcrop = ub.center_crop(mark)
    rows32 = ub.square_icon(favcrop, 32, DARKBG, LIGHT, 0.94)[0]
    rows48 = ub.square_icon(favcrop, 48, DARKBG, LIGHT, 0.94)[0]

    tmp = os.path.join(HERE, "_new_%d.ico")
    entries = []
    sizes = ((16, png16_rows), (32, rows32), (48, rows48))
    for size, rows in sizes:
        p = tmp % size
        ub.write_png(p, size, size, rows, alpha=False)
        with open(p, "rb") as f:
            entries.append((size, f.read()))
        os.remove(p)

    bak = os.path.join(HERE, "favicon.ico.bak-%s" % time.strftime("%Y%m%d-%H%M%S"))
    shutil.copy2(ICO, bak)
    print("backup .ico precedente:", bak)
    ub.write_ico(ICO, entries)
    print("scritto %s (%d byte)" % (ICO, os.path.getsize(ICO)))

    # --- anteprima ingrandita dei tre formati ---
    S = 10
    PW, PH = 16 * S + 32 * S + 48 * S + 120, 48 * S + 40
    sheet = [[(24, 30, 42)] * PW for _ in range(PH)]
    x = 20
    for size, rows in sizes:
        for yy, row in enumerate(rows):
            for xx, px in enumerate(row):
                for dy in range(S):
                    for dx in range(S):
                        ty, tx = 20 + yy * S + dy, x + xx * S + dx
                        if 0 <= ty < PH and 0 <= tx < PW:
                            sheet[ty][tx] = (px[0], px[1], px[2])
        x += size * S + 40
    out = os.path.join(HERE, "favicon-finale.png")
    ub.write_png(out, PW, PH, sheet, alpha=False)
    print("anteprima:", out)

    # --- controllo del contenitore ICO ---
    d = open(ICO, "rb").read()
    n = struct.unpack("<H", d[4:6])[0]
    for i in range(n):
        off = 6 + 16 * i
        iw, ih, _c, _r, _p, bpp, sz, doff = struct.unpack("<BBBBHHII", d[off:off + 16])
        print("  [%d] %dx%d bpp=%d %dB PNG=%s" % (i, iw, ih, bpp, sz, d[doff:doff + 8] == b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    main()
