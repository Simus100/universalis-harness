#!/usr/bin/env python3
"""
mock_brand.py — verifica visiva del branding dentro dashboard.html.

1. estrae il data-URI del logo incorporato nell'HTML
2. lo decodifica e lo rilegge con un decoder PNG minimo (controllo di validita')
3. compone un foglio di prova: barra header a dimensione reale + stato vuoto +
   icona app, usando le stesse immagini che l'app serve davvero
"""

import base64
import os
import re
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import universalis_brand as ub  # noqa: E402  (riusa resize_px/write_png)

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = "/root/pi-harness/dashboard.html"
ASSETS = "/root/pi-harness/assets"


def png_decode(blob):
    """Decoder PNG minimo: 8 bit, color type 2 (RGB) o 6 (RGBA), filtri 0-4."""
    assert blob[:8] == b"\x89PNG\r\n\x1a\n", "non e' un PNG"
    p = 8
    w = h = ct = None
    idat = bytearray()
    while p < len(blob):
        ln = struct.unpack(">I", blob[p:p + 4])[0]
        tag = blob[p + 4:p + 8]
        data = blob[p + 8:p + 8 + ln]
        if tag == b"IHDR":
            w, h, depth, ct = struct.unpack(">IIBB", data[:10])
            assert depth == 8, "profondita' %d non supportata" % depth
            assert ct in (2, 6), "color type %d non supportato" % ct
        elif tag == b"IDAT":
            idat += data
        elif tag == b"IEND":
            break
        p += 12 + ln
    raw = zlib.decompress(bytes(idat))
    ch = 4 if ct == 6 else 3
    stride = w * ch
    rows = []
    prev = bytearray(stride)
    i = 0
    for _ in range(h):
        ft = raw[i]
        i += 1
        line = bytearray(raw[i:i + stride])
        i += stride
        if ft == 1:
            for x in range(ch, stride):
                line[x] = (line[x] + line[x - ch]) & 0xFF
        elif ft == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif ft == 3:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 0xFF
        elif ft == 4:
            for x in range(stride):
                a = line[x - ch] if x >= ch else 0
                b = prev[x]
                c = prev[x - ch] if x >= ch else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xFF
        elif ft != 0:
            raise ValueError("filtro PNG %d sconosciuto" % ft)
        prev = line
        if ch == 4:
            rows.append([tuple(line[x:x + 4]) for x in range(0, stride, 4)])
        else:
            rows.append([tuple(line[x:x + 3]) + (255,) for x in range(0, stride, 3)])
    return rows, w, h


def main():
    html = open(HTML, encoding="utf-8").read()
    m = re.search(r'--brand-logo: url\("data:image/png;base64,([^"]+)"\)', html)
    if not m:
        raise SystemExit("data-URI del logo non trovato in dashboard.html")
    blob = base64.b64decode(m.group(1))
    open(os.path.join(HERE, "logo-inline-decoded.png"), "wb").write(blob)
    rows, w, h = png_decode(blob)
    print("logo inline: %dx%d, aspect %.3f, %d byte, %d byte base64"
          % (w, h, w / h, len(blob), len(m.group(1))))

    icon, iw, ih = png_decode(open(os.path.join(ASSETS, "icon-512.png"), "rb").read())
    print("icon-512.png: %dx%d" % (iw, ih))

    PW, PH = 900, 330
    BG = (10, 14, 21)
    BAR = (13, 18, 27)
    BORDER = (40, 52, 74)
    sheet = [[BG] * PW for _ in range(PH)]

    def rect(x0, y0, x1, y1, col):
        for yy in range(max(0, y0), min(PH, y1)):
            for xx in range(max(0, x0), min(PW, x1)):
                sheet[yy][xx] = col

    def blit(px, ox, oy):
        for yy, row in enumerate(px):
            ty = oy + yy
            if not 0 <= ty < PH:
                continue
            for xx, p in enumerate(row):
                tx = ox + xx
                if not 0 <= tx < PW:
                    continue
                a = p[3] / 255
                if a >= 1:
                    sheet[ty][tx] = (p[0], p[1], p[2])
                elif a > 0:
                    d = sheet[ty][tx]
                    sheet[ty][tx] = (int(p[0] * a + d[0] * (1 - a)),
                                     int(p[1] * a + d[1] * (1 - a)),
                                     int(p[2] * a + d[2] * (1 - a)))

    # a) barra header, logo alto 30px come in CSS (.logo { height: 30px })
    rect(0, 0, PW, 56, BAR)
    rect(0, 55, PW, 56, BORDER)
    blit(ub.resize_px(rows, round(30 * w / h), 30), 14, 13)
    # b) stato vuoto, logo alto 74px (.empty-ico { height: 74px })
    ew = round(74 * w / h)
    blit(ub.resize_px(rows, ew, 74), (PW - ew) // 2, 120)
    # c) icona app 192px
    blit(ub.resize_px(icon, 192, 192), 700, 80)
    # d) logo su fondo pannello (#121827) e su accent
    rect(300, 240, 420, 300, (18, 24, 39))
    blit(ub.resize_px(rows, 100, round(100 * h / w)), 310, 262)

    out = os.path.join(HERE, "mock-header.png")
    ub.write_png(out, PW, PH, sheet, alpha=False)
    print("mock:", out)


if __name__ == "__main__":
    main()
