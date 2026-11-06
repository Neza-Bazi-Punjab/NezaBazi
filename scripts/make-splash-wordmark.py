"""Draws the launch splash's "NEZA BAZI / PUNJAB" as vector shapes.

The installed app's launch splash (src/components/AppSplash.tsx) used to set
the name in live Oswald text. On the very first frames the web font has not
loaded yet, so iPhone drew it in a fallback font and then swapped, and the
name and the logo above it jumped. Drawing the letters as SVG paths, inlined
in the HTML like the logo mark, means the splash looks right from its first
frame with nothing to wait for.

Output: public/brand/splash-wordmark.svg, in CSS pixels, laid out like the
old text: "NEZA BAZI" Oswald Bold 30px on a 36px line with 0.2em letter
spacing, then 6px gap, then "PUNJAB" Oswald SemiBold 14px on a 20px line
with 0.45em letter spacing, both centred. Fill is currentColor ("PUNJAB" at
80%).

Run (needs Python 3 with fontTools: `pip install fonttools`):
    python3 scripts/make-splash-wordmark.py
It downloads Oswald (SIL Open Font License) from Google Fonts into
scripts/fonts/ on first run (git-ignored) and reuses it afterwards.
"""

import os
import urllib.request

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "scripts", "fonts")
OUT = os.path.join(ROOT, "public", "brand", "splash-wordmark.svg")

# Static instances served by Google Fonts' CSS API (css2?family=Oswald:wght@600;700).
FONT_URLS = {
    600: "https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1y9ogUE.ttf",
    700: "https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1xZogUE.ttf",
}


def load_font(weight):
    path = os.path.join(FONTS, f"Oswald-{weight}.ttf")
    if not os.path.exists(path):
        os.makedirs(FONTS, exist_ok=True)
        urllib.request.urlretrieve(FONT_URLS[weight], path)
    return TTFont(path)


def kerning(font):
    """Pair adjustments from the font's GPOS 'kern' feature, as browsers apply."""
    pairs = {}
    classes = []
    gpos = font["GPOS"].table
    lookups = set()
    for rec in gpos.FeatureList.FeatureRecord:
        if rec.FeatureTag == "kern":
            lookups.update(rec.Feature.LookupListIndex)
    for i in sorted(lookups):
        lookup = gpos.LookupList.Lookup[i]
        for sub in lookup.SubTable:
            if lookup.LookupType == 9:
                sub = sub.ExtSubTable
            if getattr(sub, "LookupType", 2) != 2:
                continue
            cov = sub.Coverage.glyphs
            if sub.Format == 1:
                for first, pset in zip(cov, sub.PairSet):
                    for pvr in pset.PairValueRecord:
                        v = getattr(pvr.Value1, "XAdvance", 0) or 0
                        pairs.setdefault((first, pvr.SecondGlyph), v)
            elif sub.Format == 2:
                classes.append((set(cov), sub))
    return pairs, classes


def kern_value(pairs, classes, a, b):
    if (a, b) in pairs:
        return pairs[(a, b)]
    for cov, sub in classes:
        if a not in cov:
            continue
        c1 = sub.ClassDef1.classDefs.get(a, 0)
        c2 = sub.ClassDef2.classDefs.get(b, 0)
        rec = sub.Class1Record[c1].Class2Record[c2]
        return getattr(rec.Value1, "XAdvance", 0) or 0
    return 0


def line(font, text, size, line_height, tracking_em, top):
    """One centred line: returns (path data, width) laid out like CSS text."""
    upm = font["head"].unitsPerEm
    s = size / upm
    asc = font["OS/2"].sTypoAscender
    desc = -font["OS/2"].sTypoDescender
    baseline = top + (line_height - (asc + desc) * s) / 2 + asc * s
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    hmtx = font["hmtx"]
    pairs, classes = kerning(font)
    names = [cmap[ord(ch)] for ch in text]
    placed = []
    x = 0.0
    for i, name in enumerate(names):
        placed.append((name, x))
        x += hmtx[name][0] * s
        if i + 1 < len(names):
            x += kern_value(pairs, classes, name, names[i + 1]) * s + tracking_em * size
    return placed, x, s, baseline, glyphs


def draw(placed, offset, s, baseline, glyphs):
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    for name, x in placed:
        glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, offset + x, baseline)))
    return pen.getCommands()


bold = load_font(700)
semibold = load_font(600)

top1, lh1 = 0, 36
top2, lh2 = lh1 + 6, 20
height = top2 + lh2

l1 = line(bold, "NEZA BAZI", 30, lh1, 0.2, top1)
l2 = line(semibold, "PUNJAB", 14, lh2, 0.45, top2)
width = round(max(l1[1], l2[1]) + 0.5)

d1 = draw(l1[0], (width - l1[1]) / 2, *l1[2:])
d2 = draw(l2[0], (width - l2[1]) / 2, *l2[2:])

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
    f'width="{width}" height="{height}">'
    f'<path fill="currentColor" d="{d1}"/>'
    f'<path fill="currentColor" fill-opacity="0.8" d="{d2}"/>'
    "</svg>\n"
)
with open(OUT, "w") as f:
    f.write(svg)
print(f"wrote {os.path.relpath(OUT, ROOT)}: {width}x{height}, {len(svg)} bytes")
