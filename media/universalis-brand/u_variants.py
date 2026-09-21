#!/usr/bin/env python3
"""
u_variants.py — favicon con una "U" stilizzata e digitale, disegnata via geometria.

Perche': l'emblema ridotto a 16px resta una macchia (dettaglio troppo fine).
Una forma geometrica disegnata a mano e' invece nitida a ogni dimensione,
perche' non c'e' nessuna fotografia da ridurre.

Disegno su una tela 512x512 e poi riduco con box filter (antialiasing pulito).
Varianti: blocco, chamfer (angoli tagliati), segmenti (stile display digitale),
pixel (a blocchi), gradiente (accent -> accent-2 con scanline).
"""

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import universalis_brand as ub  # noqa: E402
from favicon16_variants import box_down  # noqa: E402

N = 512  # tela di disegno
DARKBG = (10, 14, 21)
LIGHT = (238, 242, 249)
ACCENT = (91, 157, 255)
ACCENT2 = (139, 92, 255)


class Canvas:
    def __init__(self, n=N):
        self.n = n
        self.a = [[0.0] * n for _ in range(n)]

    def poly(self, pts):
        """Riempimento scanline even-odd."""
        n = self.n
        ys = [p[1] for p in pts]
        y0 = max(0, int(math.floor(min(ys))))
        y1 = min(n - 1, int(math.ceil(max(ys))))
        for y in range(y0, y1 + 1):
            yc = y + 0.5
            xs = []
            for i in range(len(pts)):
                xa, ya = pts[i]
                xb, yb = pts[(i + 1) % len(pts)]
                if (ya <= yc < yb) or (yb <= yc < ya):
                    t = (yc - ya) / (yb - ya)
                    xs.append(xa + t * (xb - xa))
            xs.sort()
            row = self.a[y]
            for i in range(0, len(xs) - 1, 2):
                lo = max(0, int(math.ceil(xs[i] - 0.5)))
                hi = min(n - 1, int(math.floor(xs[i + 1] - 0.5)))
                for x in range(lo, hi + 1):
                    row[x] = 1.0
        return self

    def rect(self, x0, y0, x1, y1):
        return self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])

    def down(self, size):
        """0..255, ridotto con box filter."""
        small = box_down([[v * 255.0 for v in row] for row in self.a], size)
        return [[int(round(v)) for v in row] for row in small]


def px(v):
    """Da coordinate normalizzate 0..1 a pixel della tela."""
    return v * N


# --------------------------- varianti ------------------------------------

def v_blocco(c, S=0.16, T=0.14, B=0.86, W=0.18):
    """U geometrica: due montanti + base, spigoli vivi."""
    c.rect(px(S), px(T), px(S + W), px(B))          # montante sinistro
    c.rect(px(1 - S - W), px(T), px(1 - S), px(B))  # montante destro
    c.rect(px(S), px(B - W), px(1 - S), px(B))      # base


def chamfer_points(S=0.16, T=0.14, B=0.86, W=0.18, ch=0.09):
    """Poligono (coordinate normalizzate 0..1) della U con angoli tagliati.

    Fonte unica della forma: la usano sia il disegno su tela sia l'SVG.
    """
    ol, orr = S, 1 - S
    ot, ob = T, B
    il, ir = S + W, 1 - S - W
    ib = B - W
    C = ch
    return [
        (ol, ot + C), (ol + C, ot),          # angolo alto-sinistro tagliato
        (il, ot), (il, ib),
        (ir, ib), (ir, ot),
        (orr - C, ot), (orr, ot + C),        # angolo alto-destro
        (orr, ob - C), (orr - C, ob),        # basso-destro
        (ol + C, ob), (ol, ob - C),          # basso-sinistro
    ]


def v_chamfer(c, S=0.16, T=0.14, B=0.86, W=0.18, ch=0.09):
    """U con angoli esterni tagliati a 45°: estetica tecnica/digitale."""
    c.poly([(px(x), px(y)) for (x, y) in chamfer_points(S, T, B, W, ch)])


def v_segmenti(c, S=0.17, T=0.14, B=0.86, W=0.17, g=0.035):
    """U a segmenti, come su un display a 7 segmenti (5 accesi)."""
    xl, xr = px(S), px(1 - S)
    yt, yb = px(T), px(B)
    xl2, xr2 = px(S + W), px(1 - S - W)
    w = W
    # montante sinistro alto / basso
    c.rect(xl, yt, xl2, px(T + 0.30 - g / 2))
    c.rect(xl, px(0.50 + g / 2), xl2, px(0.72 - g / 2))
    # montante destro alto / basso
    c.rect(xr2, yt, xr, px(T + 0.30 - g / 2))
    c.rect(xr2, px(0.50 + g / 2), xr, px(0.72 - g / 2))
    # base
    c.rect(px(S + 0.02), px(0.74), px(1 - S - 0.02), yb)
    _ = w
    _ = yb
    _ = yt


def v_pixel(c, grid=5, inset=0.03):
    """U a blocchi, stile pixel/retro-digitale."""
    cell = 1.0 / grid
    blocks = []
    for r in range(grid - 1):
        blocks.append((0, r))
        blocks.append((grid - 1, r))
    for col in range(grid):
        blocks.append((col, grid - 1))
    for col, row in blocks:
        x0 = col * cell + inset
        y0 = row * cell + inset
        c.rect(px(x0), px(y0), px(x0 + cell - 2 * inset), px(y0 + cell - 2 * inset))


VARIANTS = [
    ("blocco", v_blocco, "flat"),
    ("chamfer", v_chamfer, "flat"),
    ("segmenti", v_segmenti, "accent"),
    ("pixel", v_pixel, "flat"),
    ("gradiente", v_blocco, "grad"),
]


def colorize(ink, size, mode):
    """ink: matrice 0..255 alla dimensione finale → righe RGB su fondo scuro."""
    rows = []
    for j, row in enumerate(ink):
        out = []
        yn = (j + 0.5) / size
        for v in row:
            a = v / 255.0
            if mode == "accent":
                col = ACCENT
            elif mode == "grad":
                t = yn
                col = tuple(int(round(ACCENT[k] * (1 - t) + ACCENT2[k] * t)) for k in range(3))
                # scanline digitale: una riga su quattro leggermente piu' scura
                if (j % 4) == 3:
                    col = tuple(int(round(c * 0.78)) for c in col)
            else:
                col = LIGHT
            out.append(tuple(int(round(col[k] * a + DARKBG[k] * (1 - a))) for k in range(3)))
        rows.append(out)
    return rows


def main():
    S48, S16 = 48, 16
    SC48, SC16 = 5, 11
    CELL_W = max(S48 * SC48, S16 * SC16) + 34
    CELL_H = S48 * SC48 + S16 * SC16 + 46
    PW = CELL_W * len(VARIANTS) + 20
    PH = CELL_H + 20
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
                            sheet[ty][tx] = col

    report = []
    for i, (name, fn, mode) in enumerate(VARIANTS):
        c = Canvas()
        fn(c)
        ink48 = c.down(S48)
        ink16 = c.down(S16)
        on48 = sum(1 for r in ink48 for v in r if v > 128)
        # copertura a 16px: quanto e' "pieno"
        on16 = sum(1 for r in ink16 for v in r if v > 128)
        report.append((name, on48, on16))
        ox = 10 + i * CELL_W
        blit(colorize(ink48, S48, mode), ox, 16, SC48)
        blit(colorize(ink16, S16, mode), ox, 16 + S48 * SC48 + 8, SC16)

    for name, a48, a16 in report:
        print("%-10s 48px: %4d/2304 accesi   16px: %3d/256 accesi" % (name, a48, a16))

    out = os.path.join(HERE, "u-varianti.png")
    ub.write_png(out, PW, PH, sheet, alpha=False)
    print("foglio varianti:", out)


if __name__ == "__main__":
    main()
