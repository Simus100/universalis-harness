#!/usr/bin/env python3
"""
favicon16_variants.py — varianti leggibili del marchio a 16px.

A 16x16 l'emblema completo diventa una macchia. Qui provo ritagli diversi
(dall'emblema intero al solo motivo centrale) e ispessimenti dei tratti.

ATTENZIONE al bug corretto in questa versione: `contrast()` lavora su valori
0..255 (dopo box_down), mentre prima li trattava come 0..1 → binarizzazione e
inversione totale.

Genera un foglio di confronto: per ogni variante il 16px ingrandito x10
accanto al 32px ingrandito x5.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import universalis_brand as ub  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DARKBG = (10, 14, 21)


def dilate(alpha, r):
    """Allarga le zone d'inchiostro di r pixel (max filter, due passate)."""
    if r <= 0:
        return alpha
    h, w = len(alpha), len(alpha[0])
    tmp = [[0] * w for _ in range(h)]
    for y in range(h):
        row, out = alpha[y], tmp[y]
        for x in range(w):
            lo = x - r if x - r > 0 else 0
            hi = x + r + 1 if x + r + 1 < w else w
            m = 0
            for i in range(lo, hi):
                if row[i] > m:
                    m = row[i]
            out[x] = m
    out2 = [[0] * w for _ in range(h)]
    for y in range(h):
        lo = y - r if y - r > 0 else 0
        hi = y + r + 1 if y + r + 1 < h else h
        col = out2[y]
        for x in range(w):
            m = 0
            for i in range(lo, hi):
                if tmp[i][x] > m:
                    m = tmp[i][x]
            col[x] = m
    return out2


def box_down(alpha, size):
    """Riduzione a size x size con media di area. Valori in 0..255."""
    h, w = len(alpha), len(alpha[0])
    out = [[0] * size for _ in range(size)]
    for j in range(size):
        iy0 = int(j * h / size)
        iy1 = min(h, int((j + 1) * h / size))
        if iy1 <= iy0:
            iy1 = iy0 + 1
        for i in range(size):
            ix0 = int(i * w / size)
            ix1 = min(w, int((i + 1) * w / size))
            if ix1 <= ix0:
                ix1 = ix0 + 1
            tot = cnt = 0
            for yy in range(iy0, iy1):
                row = alpha[yy]
                for xx in range(ix0, ix1):
                    tot += row[xx]
                    cnt += 1
            out[j][i] = tot / cnt if cnt else 0.0
    return out


def contrast(a255, thr):
    """a255 in 0..255 → porta sotto soglia a 0 e ricompatta il resto."""
    hi = (1.0 - thr) * 255.0
    out = []
    for row in a255:
        r = []
        for v in row:
            a = (v - thr * 255.0) / hi
            a = 0.0 if a < 0 else (1.0 if a > 1 else a)
            r.append(int(round(a * 255)))
        out.append(r)
    return out


def crop_window(alpha, cx, cy, side):
    h, w = len(alpha), len(alpha[0])
    side = max(8, min(min(w, h), int(side)))
    x0 = max(0, min(w - side, int(cx - side / 2)))
    y0 = max(0, min(h - side, int(cy - side / 2)))
    return [row[x0:x0 + side] for row in alpha[y0:y0 + side]]


def main():
    alpha, w, h, _ = ub.load_alpha()
    x0, y0, x1, y1 = ub.bbox(alpha, w, h)
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    print("bbox %dx%d in (%d,%d)" % (bw, bh, x0, y0))

    # side espresso in frazione della LARGHEZZA del bbox
    windows = [
        ("intero", 0.50, 0.50, bh / bw),        # quadrato alto quanto l'emblema
        ("centro .50", 0.50, 0.45, 0.50),
        ("teste .35", 0.50, 0.43, 0.35),
        ("teste .28", 0.50, 0.41, 0.28),
        ("stella .16", 0.50, 0.44, 0.16),
    ]
    radii = [0, 1, 2]
    thr = 0.30

    S16, S32 = 16, 32
    SC16, SC32 = 10, 5
    GAP = 26
    CELL_W = S16 * SC16 + GAP + S32 * SC32
    CELL_H = S16 * SC16 + 26
    PW = CELL_W * len(windows) + 20
    PH = CELL_H * len(radii) + 20
    sheet = [[DARKBG] * PW for _ in range(PH)]

    def blit(ink, ox, oy, scale):
        """ink: matrice di valori 0..255 (inchiostro = chiaro su fondo scuro)."""
        for yy, row in enumerate(ink):
            for xx, v in enumerate(row):
                c = (v, v, v)
                for dy in range(scale):
                    ty = oy + yy * scale + dy
                    if not (0 <= ty < PH):
                        continue
                    for dx in range(scale):
                        tx = ox + xx * scale + dx
                        if 0 <= tx < PW:
                            sheet[ty][tx] = c

    print("%-12s %-4s %s" % ("variante", "dil", "pixel accesi a 16px"))
    for ri, r in enumerate(radii):
        thick = dilate(alpha, r)
        for wi, (label, fx, fy, fside) in enumerate(windows):
            side = int(round(bw * fside))
            cx, cy = x0 + bw * fx, y0 + bh * fy
            win = crop_window(thick, cx, cy, side)
            i16 = contrast(box_down(win, S16), thr)
            i32 = contrast(box_down(win, S32), thr)
            on = sum(1 for row in i16 for v in row if v > 128)
            print("%-12s %-4d %d/256" % (label, r, on))
            ox = 10 + wi * CELL_W
            oy = 10 + ri * CELL_H
            blit(i16, ox, oy, SC16)
            blit(i32, ox + S16 * SC16 + GAP, oy, SC32)

    out = os.path.join(HERE, "favicon16-varianti.png")
    ub.write_png(out, PW, PH, sheet, alpha=False)
    print("foglio di confronto:", out)


if __name__ == "__main__":
    main()
