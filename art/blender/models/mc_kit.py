"""The shared construction kit of every authored district: one builder per
material, and the small made things a place is furnished with (trees, tree
pits, planters, hedges, lamps, windows with frames and sills, cones, a cart,
a water station, a blank wayfinding totem, paver joints). A district that
uses these is built in the same language as every other.
"""
import bpy
import math
from mc_lib import MB, slab, frame, mat, DECK_Z

Z = DECK_Z


class Builders:
    """One MeshBuilder per (material, bevel, tag): parts batch into few objects."""

    def __init__(self, coll, prefix):
        self.coll = coll
        self.prefix = prefix
        self.b = {}

    def get(self, mname, bevel=0.035, seg=2, tag='', sm=False):
        k = (mname, bevel, seg, tag, sm)
        if k not in self.b:
            self.b[k] = MB('%s_%s%s' % (self.prefix, mname[3:].title().replace('_', ''), tag), mat(mname), self.coll,
                           bevel=bevel, seg=seg, smooth_=sm)
        return self.b[k]

    def finish(self):
        return [o for o in (b.done() for b in self.b.values()) if o]


def rect(mb, x0, x1, y0, y1, z0, h, **kw):
    mb.box((x0 + x1) / 2, (y0 + y1) / 2, z0, x1 - x0, y1 - y0, h, **kw)


# canopy clumps: (dx, dy, z, r) in units of the tree size. Lower, outer clumps
# are the dark green, so every canopy carries its own light-to-shadow turn.
CANOPY = [(0.0, 0.0, 1.0, 0.5, 1), (0.34, -0.08, 0.92, 0.36, 1), (-0.3, 0.18, 0.95, 0.38, 1),
          (0.08, 0.3, 0.9, 0.34, 1), (0.12, -0.12, 1.36, 0.4, 0), (-0.18, 0.02, 1.3, 0.34, 0),
          (0.06, 0.1, 1.62, 0.26, 0)]


def tree(B, x, y, s=1.0, pit=True, z=None):
    z = Z if z is None else z
    B.get('MC_WOOD_DARK', 0.0, tag='Trunk', sm=True).cyl(x, y, z, 0.1 * s, 0.95 * s, seg=10, radius2=0.06 * s)
    for dx, dy, zz, r, dark in CANOPY:
        leaf = B.get('MC_LEAF_DARK' if dark else 'MC_LEAF', 0.0, tag='Foliage', sm=True)
        leaf.sphere(x + dx * s, y + dy * s, z + zz * s, r * s, r * s, r * 0.88 * s, seg=12, rings=8)
    if pit:
        # a tree pit: steel grate frame around a soil square, flush with the paving
        rect(B.get('MC_METAL_DARK', 0.008, tag='TreeGrate'), x - 0.5, x + 0.5, y - 0.5, y + 0.5, z, 0.018)
        rect(B.get('MC_SOIL', 0.0, tag='TreeSoil'), x - 0.4, x + 0.4, y - 0.4, y + 0.4, z, 0.024)


def planter(B, x, y, w=0.9, d=0.5):
    rect(B.get('MC_PAINT_CREAM', 0.03, tag='Planter'), x - w / 2, x + w / 2, y - d / 2, y + d / 2, Z, 0.4)
    rect(B.get('MC_SOIL', 0.0, tag='TreeSoil'), x - w / 2 + 0.07, x + w / 2 - 0.07, y - d / 2 + 0.07,
         y + d / 2 - 0.07, Z + 0.3, 0.12)
    n = max(2, int(w / 0.34))
    for i in range(n):
        t = (i + 0.5) / n
        cx = x - w / 2 + 0.12 + (w - 0.24) * t
        r = 0.17 + 0.05 * ((i * 7) % 3) / 2
        B.get('MC_LEAF' if i % 2 else 'MC_LEAF_DARK', 0.0, tag='PlanterLeaf', sm=True).sphere(
            cx, y + 0.03 * (-1) ** i, Z + 0.46 + r * 0.4, r, min(r, d * 0.5), r * 0.85, seg=12, rings=8)


def hedge(B, x0, x1, y, d=0.62):
    """A clipped hedge in a long planter: designed planting, not loose balls."""
    rect(B.get('MC_PAINT_CREAM', 0.03, tag='Planter'), x0, x1, y - d / 2, y + d / 2, Z, 0.36)
    rect(B.get('MC_LEAF_DARK', 0.1, 3, tag='Hedge'), x0 + 0.06, x1 - 0.06, y - d / 2 + 0.06, y + d / 2 - 0.06,
         Z + 0.3, 0.5)


def lamp(B, x, y, h=2.1):
    B.get('MC_METAL_DARK', 0.012, tag='LampPole', sm=True).cyl(x, y, Z, 0.045, h, seg=12)
    B.get('MC_METAL_DARK', 0.012, tag='LampPole').box(x, y, Z, 0.2, 0.2, 0.1)
    B.get('MC_GLASS_LIT', 0.0, tag='LampGlobe', sm=True).sphere(x, y, Z + h + 0.1, 0.13, 0.13, 0.13, seg=12, rings=8)


def flag(B, x, y, colour='MC_PAINT_BLUE', h=2.3):
    B.get('MC_METAL', 0.01, tag='FlagPole', sm=True).cyl(x, y, Z, 0.035, h, seg=10)
    B.get(colour, 0.012, tag='Flag' + colour[-4:]).box(x + 0.02, y + 0.26, Z + h - 0.6, 0.03, 0.5, 0.55)
    B.get('MC_PAINT_CREAM', 0.01, tag='FlagStripe').box(x + 0.02, y + 0.26, Z + h - 0.4, 0.035, 0.5, 0.1)


def window_dressing(B, panes, glass, lit, lit_every=4, lit_off=2, frame_mat='MC_PAINT_WHITE', sill_mat='MC_PAINT_CREAM'):
    """Glazing plus a frame, cross mullion and sill: every opening is a made object."""
    fr = B.get(frame_mat, 0.012, 1, tag='WinFrames')
    sill = B.get(sill_mat, 0.02, tag='Sills')
    for i, (cx, cy, zb, w, d, h, rot) in enumerate(panes):
        on_y = w > d           # facing -y (else facing +x)
        g = lit if (i % lit_every) == lit_off else glass
        if on_y:
            g.box(cx, cy, zb, w, d, h)
            for xo in (-w / 2, w / 2):
                fr.box(cx + xo, cy - 0.045, zb - 0.02, 0.05, 0.08, h + 0.04)
            fr.box(cx, cy - 0.045, zb - 0.02, w + 0.05, 0.08, 0.05)
            fr.box(cx, cy - 0.045, zb + h - 0.03, w + 0.05, 0.08, 0.05)
            fr.box(cx, cy - 0.04, zb + h * 0.5 - 0.02, w, 0.06, 0.04)
            fr.box(cx, cy - 0.04, zb, 0.04, 0.06, h)
            sill.box(cx, cy - 0.12, zb - 0.09, w + 0.26, 0.2, 0.07)
        else:
            g.box(cx, cy, zb, w, d, h)
            for yo in (-d / 2, d / 2):
                fr.box(cx + 0.045, cy + yo, zb - 0.02, 0.08, 0.05, h + 0.04)
            fr.box(cx + 0.045, cy, zb - 0.02, 0.08, d + 0.05, 0.05)
            fr.box(cx + 0.045, cy, zb + h - 0.03, 0.08, d + 0.05, 0.05)
            fr.box(cx + 0.04, cy, zb + h * 0.5 - 0.02, 0.06, d, 0.04)
            fr.box(cx + 0.04, cy, zb, 0.06, 0.04, h)
            sill.box(cx + 0.12, cy, zb - 0.09, 0.2, d + 0.26, 0.07)


def cone(B, x, y, z=None):
    z = Z if z is None else z
    B.get('MC_COMPOSITE_YELLOW', 0.008, tag='ConeBase').box(x, y, z, 0.26, 0.26, 0.03)
    B.get('MC_COMPOSITE_YELLOW', 0.0, tag='Cones', sm=True).cyl(x, y, z + 0.03, 0.1, 0.3, seg=16, radius2=0.022)


def agility_ladder(B, x0, x1, y, z, rung=0.42, w=0.5):
    lad = B.get('MC_COMPOSITE_YELLOW', 0.0, tag='AgilityLadder')
    for oy in (-w / 2, w / 2):
        rect(lad, x0, x1, y + oy - 0.02, y + oy + 0.02, z, 0.02)
    xx = x0
    while xx <= x1 + 1e-6:
        rect(lad, xx - 0.025, xx + 0.025, y - w / 2, y + w / 2, z, 0.022)
        xx += rung


def cart(B, x, y):
    """An equipment trolley: steel tray on four castors, a kit bag, stacked cones, poles."""
    fr = B.get('MC_METAL', 0.012, tag='Cart')
    fr.box(x, y, Z + 0.2, 1.0, 0.56, 0.06)
    for oy in (-0.26, 0.26):
        fr.box(x, y + oy, Z + 0.26, 1.0, 0.03, 0.14)
    for ox in (-0.47, 0.47):
        fr.box(x + ox, y, Z + 0.26, 0.03, 0.56, 0.14)
    hdl = B.get('MC_METAL', 0.0, tag='CartHandle')
    for oy in (-0.24, 0.24):
        hdl.beam((x - 0.48, y + oy, Z + 0.26), (x - 0.62, y + oy, Z + 0.95), 0.035)
    hdl.box(x - 0.62, y, Z + 0.93, 0.035, 0.52, 0.035)
    wh = B.get('MC_METAL_DARK', 0.0, tag='Castors', sm=True)
    for ox in (-0.38, 0.38):
        for oy in (-0.2, 0.25):
            wh.cyl(x + ox, y + oy, Z + 0.08, 0.08, 0.05, seg=12, axis='Y')
    B.get('MC_PAINT_NAVY', 0.07, 3, tag='KitBag').box(x - 0.12, y - 0.02, Z + 0.26, 0.55, 0.36, 0.28)
    for i in range(3):
        B.get('MC_COMPOSITE_YELLOW', 0.0, tag='Cones', sm=True).cyl(
            x + 0.3, y + 0.05, Z + 0.26 + i * 0.07, 0.1, 0.3, seg=16, radius2=0.022)
    pol = B.get('MC_PAINT_WHITE', 0.0, tag='Poles', sm=True)
    for i, oy in enumerate((-0.2, -0.12, -0.04)):
        pol.cyl(x - 0.05, y + oy, Z + 0.58 + (i % 2) * 0.03, 0.025, 0.9, seg=8, axis='X')


def water_station(B, x, y):
    """A water cooler with its bottle, a cup stack and a bin, on a drip mat."""
    rect(B.get('MC_PAINT_SLATE', 0.01, tag='DripMat'), x - 0.45, x + 0.45, y - 0.32, y + 0.32, Z, 0.02)
    B.get('MC_PAINT_WHITE', 0.03, tag='Cooler').box(x, y, Z + 0.02, 0.38, 0.36, 0.92)
    B.get('MC_PAINT_NAVY', 0.01, tag='CoolerTap').box(x, y - 0.18, Z + 0.62, 0.24, 0.04, 0.14)
    B.get('MC_METAL_DARK', 0.0, tag='CoolerTray').box(x, y - 0.2, Z + 0.4, 0.22, 0.08, 0.02)
    bt = B.get('MC_PAINT_BLUE', 0.0, tag='Bottle', sm=True)
    bt.cyl(x, y, Z + 0.94, 0.15, 0.26, seg=20)
    bt.sphere(x, y, Z + 1.2, 0.15, 0.15, 0.09, seg=20, rings=10)
    bt.cyl(x, y, Z + 1.26, 0.05, 0.05, seg=12)
    B.get('MC_PAINT_WHITE', 0.0, tag='Cups', sm=True).cyl(x + 0.3, y + 0.05, Z + 0.02, 0.05, 0.22, seg=12,
                                                             radius2=0.06)
    B.get('MC_METAL_DARK', 0.012, tag='Bin', sm=True).cyl(x - 0.33, y + 0.05, Z + 0.02, 0.13, 0.42, seg=16)


def totem(B, x, y):
    """A wayfinding post with a blank panel: signage geometry, never words."""
    B.get('MC_PAINT_NAVY', 0.02, tag='Totem').box(x, y, Z, 0.5, 0.14, 1.5)
    B.get('MC_PAINT_WHITE', 0.012, tag='TotemPanel').box(x, y - 0.075, Z + 0.35, 0.4, 0.02, 0.8)
    B.get('MC_PAINT_BLUE', 0.008, tag='TotemBand').box(x, y - 0.088, Z + 1.0, 0.4, 0.02, 0.12)
    for k in range(3):
        B.get('MC_PAINT_NAVY', 0.0, tag='TotemLines').box(x - 0.04, y - 0.088, Z + 0.55 + k * 0.16, 0.26, 0.012, 0.035)


def paver_joints(B, x0, x1, y0, y1, step=1.5, skip=()):
    j = B.get('MC_CONCRETE_DK', 0.0, tag='PaverJoints')
    x = x0
    while x <= x1 + 1e-6:
        rect(j, x - 0.012, x + 0.012, y0, y1, Z, 0.008)
        x += step
    y = y0
    while y <= y1 + 1e-6:
        rect(j, x0, x1, y - 0.012, y + 0.012, Z, 0.008)
        y += step
