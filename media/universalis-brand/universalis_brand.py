#!/usr/bin/env python3
"""
universalis_brand.py — decoder JPEG baseline + encoder PNG in puro Python.

Serve a ricavare dal logo fornito (JPEG nero su bianco, 512x512) una versione
trasparente chiara per tema scuro, il set di icone PWA e un foglio di anteprima.

Nessuna dipendenza esterna: solo zlib/struct/math della stdlib.
Uso:
    python3 universalis_brand.py stats
    python3 universalis_brand.py render
"""

import math
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source.jpg")
OUTDIR = HERE
ICONS = "/root/pi-harness/assets"

ZIGZAG = [
    0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63,
]


class BitReader:
    def __init__(self, data, pos):
        self.d = data
        self.p = pos
        self.buf = 0
        self.n = 0

    def bit(self):
        if self.n == 0:
            if self.p >= len(self.d):
                return 0
            c = self.d[self.p]
            self.p += 1
            if c == 0xFF:
                if self.p < len(self.d) and self.d[self.p] == 0x00:
                    self.p += 1  # byte stuffing
                else:
                    raise ValueError("marker inatteso nello stream entropy")
            self.buf = c
            self.n = 8
        self.n -= 1
        return (self.buf >> self.n) & 1

    def bits(self, k):
        v = 0
        for _ in range(k):
            v = (v << 1) | self.bit()
        return v

    def align(self):
        self.n = 0

    def next_restart(self):
        self.n = 0
        while self.p + 1 < len(self.d):
            if self.d[self.p] == 0xFF and 0xD0 <= self.d[self.p + 1] <= 0xD7:
                self.p += 2
                return True
            self.p += 1
        return False


def build_huff(counts, symbols):
    table = {}
    code = 0
    k = 0
    for length in range(1, 17):
        for _ in range(counts[length - 1]):
            table[(length, code)] = symbols[k]
            k += 1
            code += 1
        code <<= 1
    return table


def huff_decode(br, table):
    code = 0
    for length in range(1, 17):
        code = (code << 1) | br.bit()
        sym = table.get((length, code))
        if sym is not None:
            return sym
    raise ValueError("codice huffman non trovato")


def extend(v, t):
    if t == 0:
        return 0
    if v < (1 << (t - 1)):
        return v - (1 << t) + 1
    return v


def parse_jpeg(data):
    p = 2
    qt = {}
    huff_dc = {}
    huff_ac = {}
    frame = None
    restart_interval = 0
    while p < len(data):
        while p < len(data) and data[p] != 0xFF:
            p += 1
        while p < len(data) and data[p] == 0xFF:
            p += 1
        if p >= len(data):
            break
        m = data[p]
        p += 1
        if m == 0xD9:
            break
        if m == 0x01 or 0xD0 <= m <= 0xD7:
            continue
        length = (data[p] << 8) | data[p + 1]
        seg = data[p + 2:p + length]
        if m == 0xDB:
            i = 0
            while i < len(seg):
                pq = seg[i] >> 4
                tq = seg[i] & 15
                i += 1
                tbl = [0] * 64
                for k in range(64):
                    if pq:
                        v = (seg[i] << 8) | seg[i + 1]
                        i += 2
                    else:
                        v = seg[i]
                        i += 1
                    tbl[ZIGZAG[k]] = v
                qt[tq] = tbl
        elif m == 0xC4:
            i = 0
            while i < len(seg):
                tc = seg[i] >> 4
                th = seg[i] & 15
                i += 1
                counts = list(seg[i:i + 16])
                i += 16
                total = sum(counts)
                symbols = list(seg[i:i + total])
                i += total
                tbl = build_huff(counts, symbols)
                (huff_ac if tc else huff_dc)[th] = tbl
        elif m == 0xDD:
            restart_interval = (seg[0] << 8) | seg[1]
        elif m in (0xC0, 0xC1):
            prec = seg[0]
            h = (seg[1] << 8) | seg[2]
            w = (seg[3] << 8) | seg[4]
            nc = seg[5]
            comps = []
            i = 6
            for _ in range(nc):
                cid = seg[i]
                hv = seg[i + 1]
                tq = seg[i + 2]
                comps.append({"id": cid, "h": hv >> 4, "v": hv & 15, "tq": tq})
                i += 3
            frame = {"w": w, "h": h, "prec": prec, "comps": comps}
        elif m in (0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            raise SystemExit("JPEG non baseline (marker 0x%02X): non supportato" % m)
        elif m == 0xDA:
            ns = seg[0]
            sos = []
            i = 1
            for _ in range(ns):
                cs = seg[i]
                td = seg[i + 1] >> 4
                ta = seg[i + 1] & 15
                sos.append({"id": cs, "td": td, "ta": ta})
                i += 2
            ss = seg[i]
            se = seg[i + 1]
            ahal = seg[i + 2]
            if (ss, se, ahal) != (0, 63, 0):
                raise SystemExit("JPEG non baseline (SOS %d/%d/%d)" % (ss, se, ahal))
            return frame, qt, huff_dc, huff_ac, sos, restart_interval, p + length
        p += length
    raise SystemExit("nessun SOS trovato")


def decode_y(data):
    frame, qt, huff_dc, huff_ac, sos, ri, pos = parse_jpeg(data)
    w, h = frame["w"], frame["h"]
    comps = frame["comps"]
    hmax = max(c["h"] for c in comps)
    vmax = max(c["v"] for c in comps)
    mcux = (w + 8 * hmax - 1) // (8 * hmax)
    mcuy = (h + 8 * vmax - 1) // (8 * vmax)
    for c in comps:
        c["dc"] = 0
        c["blocks"] = []
        c["bh"] = c["h"] * 8
        c["bw"] = c["v"] * 8

    sos_by_id = {s["id"]: s for s in sos}
    yplane = [[0] * w for _ in range(h)]

    # tabelle IDCT separabili
    cost = [[math.cos((2 * x + 1) * u * math.pi / 16) for u in range(8)] for x in range(8)]
    cscale = [1 / math.sqrt(2)] + [1.0] * 7

    def idct(block):
        tmp = [[0.0] * 8 for _ in range(8)]
        for v in range(8):
            row = block[v * 8:v * 8 + 8]
            if not any(row):
                continue
            for x in range(8):
                s = 0.0
                for u in range(8):
                    if row[u]:
                        s += cscale[u] * cost[x][u] * row[u]
                tmp[v][x] = s * 0.5
        out = [[0] * 8 for _ in range(8)]
        for x in range(8):
            for y in range(8):
                s = 0.0
                for v in range(8):
                    tv = tmp[v][x]
                    if tv:
                        s += cscale[v] * cost[y][v] * tv
                val = int(s * 0.5 + 128.5)
                out[y][x] = 0 if val < 0 else (255 if val > 255 else val)
        return out

    br = BitReader(data, pos)
    for my in range(mcuy):
        for mx in range(mcux):
            for ci, c in enumerate(comps):
                s = sos_by_id[c["id"]]
                dc_tab = huff_dc[s["td"]]
                ac_tab = huff_ac[s["ta"]]
                q = qt[c["tq"]]
                want = ci == 0  # IDCT solo per la luminanza: basta per il logo
                for by in range(c["v"]):
                    for bx in range(c["h"]):
                        blk = [0] * 64
                        t = huff_decode(br, dc_tab)
                        diff = extend(br.bits(t), t) if t else 0
                        c["dc"] += diff
                        blk[0] = c["dc"] * q[0]
                        k = 1
                        while k < 64:
                            rs = huff_decode(br, ac_tab)
                            r, sz = rs >> 4, rs & 15
                            if sz == 0:
                                if r == 15:
                                    k += 16
                                    continue
                                break
                            k += r
                            if k > 63:
                                break
                            blk[ZIGZAG[k]] = extend(br.bits(sz), sz) * q[ZIGZAG[k]]
                            k += 1
                        if want:
                            px = idct(blk)
                            ox = mx * 8 * hmax + bx * 8
                            oy = my * 8 * vmax + by * 8
                            for yy in range(8):
                                ty = oy + yy
                                if ty >= h:
                                    break
                                rowp = yplane[ty]
                                pr = px[yy]
                                for xx in range(8):
                                    tx = ox + xx
                                    if tx < w:
                                        rowp[tx] = pr[xx]
            if ri and ((my * mcux + mx + 1) % ri == 0) and not (my == mcuy - 1 and mx == mcux - 1):
                br.next_restart()
                for c in comps:
                    c["dc"] = 0
    return yplane, w, h


# ------------------------------- PNG --------------------------------------

def png_chunk(tag, payload):
    return (struct.pack(">I", len(payload)) + tag + payload +
            struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))


def write_png(path, w, h, pixels, alpha=True):
    """pixels: lista di righe; ogni pixel e' (r,g,b) o (r,g,b,a)."""
    ct = 6 if alpha else 2
    raw = bytearray()
    for row in pixels:
        raw.append(0)
        for px in row:
            raw.extend(px if alpha else px[:3])
    data = zlib.compress(bytes(raw), 9)
    out = (b"\x89PNG\r\n\x1a\n" +
           png_chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, ct, 0, 0, 0)) +
           png_chunk(b"IDAT", data) +
           png_chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(out)
    return len(out)


def write_ico(path, pngs):
    """ICO con payload PNG: pngs = [(size, bytes)]"""
    n = len(pngs)
    header = struct.pack("<HHH", 0, 1, n)
    entries = b""
    offset = 6 + 16 * n
    body = b""
    for size, blob in pngs:
        entries += struct.pack("<BBBBHHII", size if size < 256 else 0,
                               size if size < 256 else 0, 0, 0, 1, 32, len(blob), offset)
        offset += len(blob)
        body += blob
    with open(path, "wb") as f:
        f.write(header + entries + body)


# ---------------------------- elaborazione --------------------------------

def load_alpha():
    with open(SRC, "rb") as f:
        data = f.read()
    y, w, h = decode_y(data)
    # alpha = quanto e' scuro il pixel (logo nero su fondo bianco)
    alpha = [[0] * w for _ in range(h)]
    ymin, ymax = 255, 0
    for yy in range(h):
        row = y[yy]
        for xx in range(w):
            v = row[xx]
            if v < ymin:
                ymin = v
            if v > ymax:
                ymax = v
            t = (255.0 - v) / 255.0
            a = (t - 0.06) / 0.82
            a = 0.0 if a < 0 else (1.0 if a > 1 else a)
            alpha[yy][xx] = int(round(a ** 0.92 * 255))
    return alpha, w, h, (ymin, ymax)


def bbox(alpha, w, h, thr=24):
    x0, y0, x1, y1 = w, h, -1, -1
    for yy in range(h):
        row = alpha[yy]
        for xx in range(w):
            if row[xx] > thr:
                if xx < x0:
                    x0 = xx
                if xx > x1:
                    x1 = xx
                if yy < y0:
                    y0 = yy
                if yy > y1:
                    y1 = yy
    return x0, y0, x1, y1


def crop_pad(alpha, w, h, box, pad_ratio=0.04):
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    pad = int(round(max(bw, bh) * pad_ratio))
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(w - 1, x1 + pad)
    y1 = min(h - 1, y1 + pad)
    return [[alpha[yy][xx] for xx in range(x0, x1 + 1)] for yy in range(y0, y1 + 1)]


def center_crop(mark, wfrac=0.42, ycenter=0.44):
    """Ritaglio quadrato centrale: a 16-32px serve il gruppo delle due teste + stella."""
    mh = len(mark)
    mw = len(mark[0])
    side = max(8, int(round(mw * wfrac)))
    x0 = (mw - side) // 2
    yc = int(round(mh * ycenter))
    y0 = max(0, min(mh - side, yc - side // 2))
    return [row[x0:x0 + side] for row in mark[y0:y0 + side]]


def resize_px(rows, dw, dh):
    """Ridimensiona un canvas RGB(A) gia' composto, con ricampionamento bilineare."""
    sh, sw = len(rows), len(rows[0])
    ch = len(rows[0][0])
    out = []
    for i in range(dh):
        yv = (i + 0.5) * sh / dh - 0.5
        y0 = int(math.floor(yv)); fy = yv - y0
        y0c = min(max(y0, 0), sh - 1); y1c = min(max(y0 + 1, 0), sh - 1)
        row = []
        for j in range(dw):
            xv = (j + 0.5) * sw / dw - 0.5
            x0 = int(math.floor(xv)); fx = xv - x0
            x0c = min(max(x0, 0), sw - 1); x1c = min(max(x0 + 1, 0), sw - 1)
            px = []
            for k in range(ch):
                a = rows[y0c][x0c][k] * (1 - fx) + rows[y0c][x1c][k] * fx
                b = rows[y1c][x0c][k] * (1 - fx) + rows[y1c][x1c][k] * fx
                px.append(int(round(a * (1 - fy) + b * fy)))
            row.append(tuple(px))
        out.append(row)
    return out


def resize_alpha(src, sw, sh, dw, dh):
    if sw == dw and sh == dh:
        return [list(r) for r in src]
    out = []
    xs = [(i + 0.5) * sw / dw - 0.5 for i in range(dw)]
    ys = [(i + 0.5) * sh / dh - 0.5 for i in range(dh)]
    for yv in ys:
        y0 = int(math.floor(yv))
        fy = yv - y0
        y0c = min(max(y0, 0), sh - 1)
        y1c = min(max(y0 + 1, 0), sh - 1)
        r0 = src[y0c]
        r1 = src[y1c]
        row = []
        for xv in xs:
            x0 = int(math.floor(xv))
            fx = xv - x0
            x0c = min(max(x0, 0), sw - 1)
            x1c = min(max(x0 + 1, 0), sw - 1)
            a = r0[x0c] * (1 - fx) + r0[x1c] * fx
            b = r1[x0c] * (1 - fx) + r1[x1c] * fx
            row.append(a * (1 - fy) + b * fy)
        out.append(row)
    return out


def render_mark(mark, color, pad_ratio=0.06):
    """mark: matrice alpha -> righe RGBA con colore dato."""
    rows = []
    for row in mark:
        out = []
        for a in row:
            ai = int(max(0, min(255, round(a))))
            out.append((color[0], color[1], color[2], ai))
        rows.append(out)
    return rows


def square_icon(mark, size, bg, color, ratio, alpha_out=False):
    canvas = []
    sw, sh = len(mark[0]), len(mark)
    dw = max(1, int(round(size * ratio)))
    dh = max(1, int(round(dw * sh / sw)))
    inner = resize_alpha(mark, sw, sh, dw, dh)
    ih = len(inner)
    iw = len(inner[0])
    oy = (size - ih) // 2
    ox = (size - iw) // 2
    for yy in range(size):
        row = []
        for xx in range(size):
            if oy <= yy < oy + ih and ox <= xx < ox + iw:
                a = inner[yy - oy][xx - ox]
            else:
                a = 0.0
            ai = int(max(0, min(255, round(a))))
            if alpha_out:
                row.append((color[0], color[1], color[2], ai))
            else:
                # composito su fondo pieno
                row.append((
                    int(round(color[0] * ai / 255 + bg[0] * (1 - ai / 255))),
                    int(round(color[1] * ai / 255 + bg[1] * (1 - ai / 255))),
                    int(round(color[2] * ai / 255 + bg[2] * (1 - ai / 255))),
                    255,
                ))
        canvas.append(row)
    return canvas, inner


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "stats"
    alpha, w, h, (ymin, ymax) = load_alpha()
    box = bbox(alpha, w, h)
    print("immagine %dx%d  Ymin=%d Ymax=%d" % (w, h, ymin, ymax))
    print("bbox logo:", box, "-> %dx%d" % (box[2] - box[0] + 1, box[3] - box[1] + 1))
    mark = crop_pad(alpha, w, h, box)
    mh = len(mark)
    mw = len(mark[0])
    print("ritaglio %dx%d (aspect %.2f)" % (mw, mh, mw / mh))
    if mode == "stats":
        return

    LIGHT = (238, 242, 249)
    DARKBG = (10, 14, 21)

    # 1. logo trasparente chiaro per il tema scuro
    big = resize_alpha(mark, mw, mh, 360, max(1, round(360 * mh / mw)))
    header = resize_alpha(mark, mw, mh, 132, max(1, round(132 * mh / mw)))
    n1 = write_png(os.path.join(OUTDIR, "logo-light.png"), len(header[0]), len(header), render_mark(header, LIGHT))
    n2 = write_png(os.path.join(OUTDIR, "logo-light@2x.png"), len(big[0]), len(big), render_mark(big, LIGHT))
    print("logo trasparente:", n1, "byte (132px) /", n2, "byte (360px)")

    # 2. icone PWA (fondo scuro pieno, logo chiaro, area sicura per maskable)
    made = {}
    for size, ratio in ((512, 0.66), (192, 0.70), (180, 0.70)):
        canvas, _ = square_icon(mark, size, DARKBG, LIGHT, ratio)
        made[size] = (size, canvas)
    write_png(os.path.join(ICONS, "icon-512.png"), 512, 512, made[512][1], alpha=False)
    write_png(os.path.join(ICONS, "icon-192.png"), 192, 192, made[192][1], alpha=False)
    write_png(os.path.join(ICONS, "apple-touch-icon.png"), 180, 180, made[180][1], alpha=False)

    # 3. favicon.ico (PNG multipli 16/32/48)
    favcrop = center_crop(mark)
    print("favicon: ritaglio %dx%d" % (len(favcrop[0]), len(favcrop)))
    ico_pngs = []
    for size in (16, 32, 48):
        canvas, _ = square_icon(favcrop, size, DARKBG, LIGHT, 0.94)
        tmp = os.path.join(OUTDIR, "ico-%d.png" % size)
        write_png(tmp, size, size, canvas, alpha=False)
        with open(tmp, "rb") as f:
            ico_pngs.append((size, f.read()))
        os.remove(tmp)
    write_ico(os.path.join(ICONS, "favicon.ico"), ico_pngs)
    print("icone PWA scritte in", ICONS)

    # 4. foglio di anteprima per il controllo visivo
    PW, PH = 1180, 520
    sheet = [[(12, 16, 24)] * PW for _ in range(PH)]

    def rect(x0, y0, x1, y1, col):
        for yy in range(max(0, y0), min(PH, y1)):
            row = sheet[yy]
            for xx in range(max(0, x0), min(PW, x1)):
                row[xx] = col

    def blit(rows, ox, oy):
        for yy, row in enumerate(rows):
            ty = oy + yy
            if not (0 <= ty < PH):
                continue
            dstrow = sheet[ty]
            for xx, px in enumerate(row):
                tx = ox + xx
                if not (0 <= tx < PW):
                    continue
                a = (px[3] / 255) if len(px) > 3 else 1.0
                if a >= 1.0:
                    dstrow[tx] = (px[0], px[1], px[2])
                elif a > 0:
                    d = dstrow[tx]
                    dstrow[tx] = (int(round(px[0] * a + d[0] * (1 - a))),
                                  int(round(px[1] * a + d[1] * (1 - a))),
                                  int(round(px[2] * a + d[2] * (1 - a))))

    def mark_at(h, color=LIGHT):
        return render_mark(resize_alpha(mark, mw, mh, max(1, round(h * mw / mh)), h), color)

    def icon(size, ratio=0.70):
        rows, _ = square_icon(mark, size, DARKBG, LIGHT, ratio)
        return rows

    # a) barra header a dimensione reale (logo alto 26px) e ingrandita
    rect(0, 0, PW, 60, (11, 15, 23))
    rect(0, 59, PW, 60, (40, 52, 74))
    blit(mark_at(26), 20, 17)
    rect(0, 80, PW, 140, (11, 15, 23))
    rect(0, 139, PW, 140, (40, 52, 74))
    blit(mark_at(46), 20, 87)

    # b) icone PWA alle dimensioni reali, allineate in basso
    base = 500
    blit(resize_px(icon(512), 256, 256), 30, base - 256)
    blit(icon(192), 340, base - 192)
    blit(icon(180), 560, base - 180)
    blit(icon(64), 780, base - 64)
    blit(resize_px(square_icon(favcrop, 48, DARKBG, LIGHT, 0.94)[0], 32, 32), 870, base - 32)
    blit(resize_px(square_icon(favcrop, 48, DARKBG, LIGHT, 0.94)[0], 16, 16), 920, base - 16)

    # c) logo trasparente su fondo scuro, grande
    blit(mark_at(150), 920, 360)
    path = os.path.join(OUTDIR, "preview-brand.png")
    write_png(path, PW, PH, sheet, alpha=False)
    print("anteprima:", path)


if __name__ == "__main__":
    main()
