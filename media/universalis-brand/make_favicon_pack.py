#!/usr/bin/env python3
"""
make_favicon_pack.py — pacchetto completo della "U" (il favicon approvato).

Genera in una cartella dedicata:
  png-trasparente/   PNG con canale alpha, 16 → 1024 px
  png-fondo-scuro/   stessi formati, ma composti sul fondo #0a0e15
  svg/               vettoriale (stessa geometria, scalabile a infinito)
  ico/               favicon.ico multi-immagine (16+32+48)
  apple/             apple-touch-icon.png 180x180 pieno
  anteprima.png      foglio con tutte le misure a dimensione reale, su fondo
                     scuro e su fondo chiaro
  inventario.txt     elenco file, misure e byte

Forma e colori sono gli stessi del favicon in produzione: U con angoli
tagliati a 45° riempita col gradiente del tema (accent #5b9dff → accent-2
#8b5cff, a 135°). Geometria presa da u_variants.chamfer_points().
"""

import math
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import universalis_brand as ub  # noqa: E402
from u_variants import ACCENT, ACCENT2, chamfer_points  # noqa: E402

DARKBG = (10, 14, 21)
LIGHTBG = (242, 245, 250)
OUT = os.path.join(HERE, "favicon-u")
ASSETS = "/root/pi-harness/assets"

PNG_SIZES = (16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512, 1024)
ICO_SIZES = (16, 32, 48)
SHEET_SIZES = (16, 24, 32, 48, 64, 96, 128, 192)


class Mono:
    """Tela monocromatica leggera (byte per cella) con riempimento poligoni."""

    def __init__(self, n):
        self.n = n
        self.rows = [bytearray(n) for _ in range(n)]

    def fill(self, pts_norm):
        n = self.n
        pts = [(x * n, y * n) for (x, y) in pts_norm]
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
            row = self.rows[y]
            for i in range(0, len(xs) - 1, 2):
                lo = max(0, int(math.ceil(xs[i] - 0.5)))
                hi = min(n - 1, int(math.floor(xs[i + 1] - 0.5)))
                if hi >= lo:
                    row[lo:hi + 1] = b"\x01" * (hi - lo + 1)

    def down(self, size):
        """0..255, media di area."""
        n = self.n
        out = [[0] * size for _ in range(size)]
        for j in range(size):
            y0 = int(j * n / size)
            y1 = min(n, int((j + 1) * n / size))
            if y1 <= y0:
                y1 = y0 + 1
            for i in range(size):
                x0 = int(i * n / size)
                x1 = min(n, int((i + 1) * n / size))
                if x1 <= x0:
                    x1 = x0 + 1
                tot = cnt = 0
                for yy in range(y0, y1):
                    tot += sum(self.rows[yy][x0:x1])
                    cnt += x1 - x0
                out[j][i] = int(round(255.0 * tot / cnt)) if cnt else 0
        return out


def master_n(size):
    """Risoluzione di disegno: 512 basta fino a 256px, poi il doppio."""
    if size <= 256:
        return 512
    return min(2048, size * 2)


def grad(x, y, size):
    t = ((x + 0.5) + (y + 0.5)) / (2.0 * size)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return tuple(int(round(ACCENT[k] * (1 - t) + ACCENT2[k] * t)) for k in range(3))


def render(size):
    """Ritorna (righe_trasparenti, righe_su_fondo_scuro, copertura_255)."""
    m = Mono(master_n(size))
    m.fill(chamfer_points())
    ink = m.down(size)
    trasp, scuro = [], []
    for y in range(size):
        rt, rs = [], []
        for x in range(size):
            a = ink[y][x] / 255.0
            col = grad(x, y, size)
            rt.append((col[0], col[1], col[2], ink[y][x]))
            rs.append(tuple(int(round(col[k] * a + DARKBG[k] * (1 - a))) for k in range(3)))
        trasp.append(rt)
        scuro.append(rs)
    return trasp, scuro, ink


def svg_text():
    pts = chamfer_points()
    d = "M " + " L ".join("%.2f,%.2f" % (x * 512, y * 512) for (x, y) in pts) + " Z"
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" '
        'width="512" height="512" role="img" aria-label="Universalis Harness">\n'
        "  <title>Universalis Harness</title>\n"
        "  <defs>\n"
        '    <linearGradient id="uh" x1="0" y1="0" x2="1" y2="1">\n'
        '      <stop offset="0" stop-color="#5b9dff"/>\n'
        '      <stop offset="1" stop-color="#8b5cff"/>\n'
        "    </linearGradient>\n"
        "  </defs>\n"
        '  <path fill="url(#uh)" d="%s"/>\n' % d +
        "</svg>\n"
    )


def main():
    for sub in ("png-trasparente", "png-fondo-scuro", "svg", "ico", "apple"):
        os.makedirs(os.path.join(OUT, sub), exist_ok=True)

    inv = []
    cache = {}

    for s in PNG_SIZES:
        trasp, scuro, ink = render(s)
        cached = cache.get(s)

        p1 = os.path.join(OUT, "png-trasparente", "u-%d.png" % s)
        p2 = os.path.join(OUT, "png-fondo-scuro", "u-%d.png" % s)
        ub.write_png(p1, s, s, trasp, alpha=True)
        ub.write_png(p2, s, s, scuro, alpha=False)
        inv.append(("png-trasparente/u-%d.png" % s, s, s, os.path.getsize(p1)))
        inv.append(("png-fondo-scuro/u-%d.png" % s, s, s, os.path.getsize(p2)))
        cached = scuro
        cache[s] = cached
        on = sum(1 for r in ink for v in r if v > 128)
        print("%4dpx  copertura %4d%%  trasparente %6dB  fondo scuro %6dB"
              % (s, round(100.0 * on / (s * s)), os.path.getsize(p1), os.path.getsize(p2)))

    # --- SVG vettoriale ---
    p = os.path.join(OUT, "svg", "u-logo.svg")
    with open(p, "w", encoding="utf-8") as f:
        f.write(svg_text())
    inv.append(("svg/u-logo.svg", "vettoriale", "qualsiasi", os.path.getsize(p)))

    # --- ICO multi-immagine ---
    entries = []
    for s in ICO_SIZES:
        tmp = os.path.join(OUT, "_t%d.png" % s)
        ub.write_png(tmp, s, s, cache[s], alpha=False)
        with open(tmp, "rb") as f:
            entries.append((s, f.read()))
        os.remove(tmp)
    p = os.path.join(OUT, "ico", "favicon.ico")
    ub.write_ico(p, entries)
    inv.append(("ico/favicon.ico", "16+32+48", "16x16", os.path.getsize(p)))

    # --- apple-touch-icon 180 pieno ---
    p = os.path.join(OUT, "apple", "apple-touch-icon.png")
    ub.write_png(p, 180, 180, cache[180], alpha=False)
    inv.append(("apple/apple-touch-icon.png", 180, 180, os.path.getsize(p)))

    # --- foglio anteprima: misure reali su fondo scuro e chiaro ---
    SP = 24
    row_w = sum(SHEET_SIZES) + SP * (len(SHEET_SIZES) - 1)
    ROW_H = max(SHEET_SIZES) + 8
    PAD = 20
    PW = PAD + row_w + PAD
    PH = PAD + ROW_H + PAD + ROW_H + PAD
    sheet = [[(20, 24, 33)] * PW for _ in range(PH)]

    def rect(x0, y0, x1, y1, col):
        for yy in range(max(0, y0), min(PH, y1)):
            row = sheet[yy]
            for xx in range(max(0, x0), min(PW, x1)):
                row[xx] = col

    def stampa(rows, ox, oy):
        for yy, row in enumerate(rows):
            ty = oy + yy
            if not (0 <= ty < PH):
                continue
            for xx, col in enumerate(row):
                tx = ox + xx
                if 0 <= tx < PW:
                    sheet[ty][tx] = col[:3]

    rect(0, PAD, PW, PAD + ROW_H, DARKBG)
    rect(0, PAD + ROW_H + PAD, PW, PAD + ROW_H + PAD + ROW_H, LIGHTBG)
    for row_i, bg in ((0, "scuro"), (1, "chiaro")):
        base = PAD + row_i * (ROW_H + PAD) + ROW_H
        x = PAD + 10
        for s in SHEET_SIZES:
            if bg == "scuro":
                rows = cache[s]
            else:
                # stessa U, ma composta su fondo chiaro per il controllo d'uso
                rows = []
                trasp, _sc, _ink = render(s)
                for r in trasp:
                    rr = []
                    for px in r:
                        a = px[3] / 255.0
                        rr.append(tuple(int(round(px[k] * a + LIGHTBG[k] * (1 - a))) for k in range(3)))
                    rows.append(rr)
            stampa(rows, x, base - s)
            x += s + SP

    p = os.path.join(OUT, "anteprima.png")
    ub.write_png(p, PW, PH, sheet, alpha=False)
    print("anteprima:", p)

    # --- inventario ---
    with open(os.path.join(OUT, "inventario.txt"), "w", encoding="utf-8") as f:
        f.write("Universalis Harness — pacchetto favicon \"U\"\n")
        f.write("forma: U con angoli tagliati a 45°, gradiente #5b9dff -> #8b5cff (135°)\n\n")
        f.write("%-34s %-12s %-12s %s\n" % ("file", "larghezza", "altezza", "byte"))
        for name, w, h, size in inv:
            f.write("%-34s %-12s %-12s %d\n" % (name, w, h, size))
        f.write("\nanteprima.png: tutte le misure a dimensione reale, su fondo scuro e chiaro.\n")
        f.write("Nota: nel .ico le immagini sono PNG a 32bpp; il fondo e' #0a0e15.\n")

    # rendo l'anteprima visibile dal browser (il server serve inline solo /icon-<n>.png)
    shutil.copy2(p, os.path.join(ASSETS, "icon-906.png"))
    print("anteprima copiata in %s/icon-906.png" % ASSETS)
    print("file totali:", len([1 for _ in inv]) + 1)
    return OUT


if __name__ == "__main__":
    main()
