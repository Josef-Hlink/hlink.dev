"""hlink mark generator: writes the brand SVGs next to this file.

Two collinear chain links, upright, interlocked in the middle. Their straight
sides are the legs of an H; the upper link (right leg + bottom hook) also reads
as a J against the h of the rest, so the J gets its own colour.

Geometry lives in a frame where u runs along the chain (up) and v across it
(right). Each link is a stadium whose sides sit on lanes v = +-D; the lower link
turns around u = -S/2, the upper around u = +S/2, so the two turns overlap. The
lower link passes over the upper on the left, under it on the right (180deg
point symmetric). Strokes are flattened to plain paths with skia-pathops.

    LD_LIBRARY_PATH=$(nix build --no-link --print-out-paths nixpkgs#stdenv.cc.cc.lib)/lib \\
      uv run --no-project --with skia-pathops python brand/mark.py
"""
from pathlib import Path

import pathops

SIZE = 512
D = 128  # lane offset from the centre: legs span x 64..192 and 320..448
W = 128  # stroke
S = 86  # spacing of the two turn centres (a nod to x86)
RX = 112  # tile corner radius
GAP = {"": 16, "-small": 32}  # over/under cut; doubled for <= 32px use

BG, H, J = "#1a1b26", "#82aaff", "#7dcfff"  # tokyonight bg / blue / cyan
K = 0.5522847498  # cubic handle for a quarter circle
C = SIZE / 2
U, DIFF, X = pathops.PathOp.UNION, pathops.PathOp.DIFFERENCE, pathops.PathOp.INTERSECTION


def xy(u, v):
    return (C + v, C - u)


def link(sign):
    """centre line of a link; sign -1 = lower, +1 = upper. Runs off the tile."""
    c, k, far = sign * S / 2, -sign * D, sign * SIZE
    p = pathops.Path()
    p.moveTo(*xy(far, -D))
    p.lineTo(*xy(c, -D))
    p.cubicTo(*xy(c + K * k, -D), *xy(c + k, -K * D), *xy(c + k, 0))
    p.cubicTo(*xy(c + k, K * D), *xy(c + K * k, D), *xy(c, D))
    p.lineTo(*xy(far, D))
    return p


def stroked(p, width):
    q = pathops.Path(p)
    q.stroke(width, pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4)
    return q


def poly(*pts):
    p = pathops.Path()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    p.close()
    return p


def outline(shape):
    """tile or circle, from cubics only: pathops turns conic corners into chamfers"""
    p = pathops.Path()
    if shape == "circle":
        r = C
        m = K * r
        p.moveTo(C, 0)
        p.cubicTo(C + m, 0, SIZE, C - m, SIZE, C)
        p.cubicTo(SIZE, C + m, C + m, SIZE, C, SIZE)
        p.cubicTo(C - m, SIZE, 0, C + m, 0, C)
        p.cubicTo(0, C - m, C - m, 0, C, 0)
    else:
        e, m = SIZE, K * RX
        p.moveTo(RX, 0)
        p.lineTo(e - RX, 0)
        p.cubicTo(e - RX + m, 0, e, RX - m, e, RX)
        p.lineTo(e, e - RX)
        p.cubicTo(e, e - RX + m, e - RX + m, e, e - RX, e)
        p.lineTo(RX, e)
        p.cubicTo(RX - m, e, 0, e - RX + m, 0, e - RX)
        p.lineTo(0, RX)
        p.cubicTo(0, RX - m, RX - m, 0, RX, 0)
    p.close()
    return p


def links(gap, shape):
    """(h, j) as filled paths, cut for over/under and clipped to the outline"""
    lo, up = link(-1), link(+1)
    left = poly((-SIZE, -SIZE), (C, -SIZE), (C, 2 * SIZE), (-SIZE, 2 * SIZE))
    right = poly((C, -SIZE), (2 * SIZE, -SIZE), (2 * SIZE, 2 * SIZE), (C, 2 * SIZE))
    lo_cut = pathops.op(stroked(lo, W), pathops.op(stroked(up, W + 2 * gap), right, X), DIFF)
    up_cut = pathops.op(stroked(up, W), pathops.op(stroked(lo, W + 2 * gap), left, X), DIFF)
    # the J is the upper link minus its back stub (top of the left leg), which
    # stays with the h. The stub ends at its leg's inner edge (x 192) and the
    # J's hook never reaches left of x 208, so a cut at 200 separates them.
    x = C - D + W / 2 + 8
    west = poly((-SIZE, -SIZE), (x, -SIZE), (x, 2 * SIZE), (-SIZE, 2 * SIZE))
    h = pathops.op(lo_cut, pathops.op(up_cut, west, X), U)
    j = pathops.op(up_cut, west, DIFF)
    tile = outline(shape)
    out = []
    for p in (h, j):
        p = pathops.op(p, tile, X)
        p.simplify()
        out.append(p)
    return out


def num(n):
    r = round(n, 1)
    return str(int(r)) if r == int(r) else str(r)


def d(p):
    out = []
    for verb, pts in p.segments:
        if verb == "moveTo":
            out.append("M" + " ".join(map(num, pts[0])))
        elif verb == "lineTo":
            out.append("L" + " ".join(map(num, pts[0])))
        elif verb == "curveTo":
            out.append("C" + " ".join(num(c) for pt in pts for c in pt))
        elif verb == "qCurveTo":  # implied on-curve points between off-curves
            *offs, end = pts
            for i, c in enumerate(offs):
                nxt = end if i == len(offs) - 1 else tuple((a + b) / 2 for a, b in zip(c, offs[i + 1]))
                out.append("Q" + " ".join(map(num, (*c, *nxt))))
        elif verb == "closePath":
            out.append("Z")
    return "".join(out)


def fill(name, colour):
    # plain attribute: an inline var() style paints black in non-browser
    # renderers (resvg). Any page CSS beats a presentation attribute, so an
    # inline SVG still retints with `.hlink-h { fill: ... }`.
    return f'class="hlink-{name}" fill="{colour}"'


def svg(shape, gap):
    h, j = links(gap, shape)
    bg = (
        f'<circle cx="{C:g}" cy="{C:g}" r="{C:g}"'
        if shape == "circle"
        else f'<rect width="{SIZE}" height="{SIZE}" rx="{RX}"'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">'
        f'{bg} {fill("bg", BG)}/>'
        f'<path {fill("h", H)} d="{d(h)}"/>'
        f'<path {fill("j", J)} d="{d(j)}"/>'
        "</svg>\n"
    )


if __name__ == "__main__":
    here = Path(__file__).parent
    for shape in ("tile", "circle"):
        for suffix, gap in GAP.items():
            out = here / f"hlink-{shape}{suffix}.svg"
            out.write_text(svg(shape, gap))
            print(out.relative_to(here.parent), out.stat().st_size, "bytes")
    # hlink.dev's own favicon: the small cut, since tabs draw it at 16-32px
    fav = here.parent / "public" / "favicon.svg"
    fav.write_text(svg("tile", GAP["-small"]))
    print(fav.relative_to(here.parent), fav.stat().st_size, "bytes")
