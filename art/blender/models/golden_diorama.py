"""golden diorama: an original miniature training and performance facility.

Not a chain and not a building anyone owns. The architecture carries the
identity: a two-storey training hall with an oval rooftop running track, a
shallow-vaulted annex joined to it by a glass sky bridge, a finish-line
timing tower carrying the beacon, an open-air lifting pergola, a three-lane
sprint strip and a lawn drill ground. Signage is blank geometry, never words.

Deck top is z = 1.0, deck is 15.4 across. The camera sits at +x, -y; the key
sun comes from camera-left, so the -y faces are lit and the +x faces are in
shadow.
"""
import bpy
import math
from mc_lib import MB, slab, frame, cut, grid_windows, mat, link, DECK_Z

Z = DECK_Z


class Builders:
    """One MeshBuilder per (material, bevel, tag): parts batch into few objects."""

    def __init__(self, coll):
        self.coll = coll
        self.b = {}

    def get(self, mname, bevel=0.035, seg=2, tag='', sm=False):
        k = (mname, bevel, seg, tag, sm)
        if k not in self.b:
            self.b[k] = MB('GD_%s%s' % (mname[3:].title().replace('_', ''), tag), mat(mname), self.coll,
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


def window_dressing(B, panes, glass, lit, lit_every=4, lit_off=2):
    """Glazing plus a white frame, cross mullion and sill: every opening is a made object."""
    fr = B.get('MC_PAINT_WHITE', 0.012, 1, tag='WinFrames')
    sill = B.get('MC_PAINT_CREAM', 0.02, tag='Sills')
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


def build(coll, status_coll):
    B = Builders(coll)
    W, C, BL, NV = 'MC_PAINT_WHITE', 'MC_PAINT_CREAM', 'MC_PAINT_BLUE', 'MC_PAINT_NAVY'
    glass, lit = B.get('MC_GLASS', 0.0, tag='Panes'), B.get('MC_GLASS_LIT', 0.0, tag='Panes')

    paver_joints(B, -7.2, 7.2, -7.2, 7.2, 1.44)

    # ------------------------------------------------------------------ HALL
    hx0, hx1, hy0, hy1, hh = -6.6, 0.2, 1.8, 6.6, 4.4
    body = MB('GD_HallBody', mat(W), coll, bevel=0.04, seg=2)
    rect(body, hx0, hx1, hy0, hy1, Z + 0.32, hh - 0.32)
    hall = body.done()
    cuts, panes = [], []
    for face in ('-y', '+x'):
        n_cols = 6 if face == '-y' else 4
        c, p = grid_windows(face, hx0, hy0, hx1, hy1, Z, 2, n_cols, 0.8, 1.05, 0.66, 2.2,
                            depth=0.3, margin=0.55, skip={(0, 2)} if face == '-y' else set())
        cuts += c
        panes += p
    door_x = hx0 + 0.55 + (hx1 - hx0 - 1.1) * (2.5 / 6)
    cuts.append((door_x, hy0 + 0.15, Z + 0.32, 1.1, 0.5, 1.75, 0))
    cut(hall, cuts)
    link(hall, coll)
    window_dressing(B, panes, glass, lit)
    box_ = B.get(C, 0.02, tag='FlowerBox')
    fl = B.get('MC_LEAF', 0.0, tag='FlowerLeaf', sm=True)
    dots = B.get('MC_TRACK', 0.0, tag='FlowerDots', sm=True)
    for i, (pcx, pcy, pzb, pw, pd, ph, prot) in enumerate(panes):
        if pw > pd and pzb < Z + 1.0 and i % 2 == 0:
            box_.box(pcx, pcy - 0.24, pzb - 0.02, pw * 0.8, 0.2, 0.14)
            for k in range(3):
                ox = (k - 1) * pw * 0.26
                fl.sphere(pcx + ox, pcy - 0.24, pzb + 0.14, 0.13, 0.11, 0.09, seg=12, rings=8)
                dots.sphere(pcx + ox + 0.03, pcy - 0.3, pzb + 0.2, 0.045, 0.045, 0.045, seg=8, rings=6)
    B.get(NV, 0.02, tag='Door').box(door_x, hy0 + 0.2, Z + 0.34, 0.96, 0.08, 1.68)
    B.get(W, 0.015, 1, tag='DoorFrame').box(door_x - 0.52, hy0 - 0.02, Z + 0.32, 0.07, 0.12, 1.78)
    B.get(W, 0.015, 1, tag='DoorFrame').box(door_x + 0.52, hy0 - 0.02, Z + 0.32, 0.07, 0.12, 1.78)
    B.get(BL, 0.03, tag='Canopy').box(door_x, hy0 - 0.4, Z + 2.02, 2.1, 0.9, 0.14)
    B.get(BL, 0.03, tag='Canopy').box(door_x - 0.95, hy0 - 0.3, Z + 1.05, 0.06, 0.06, 1.0)
    B.get(BL, 0.03, tag='Canopy').box(door_x + 0.95, hy0 - 0.3, Z + 1.05, 0.06, 0.06, 1.0)
    # the door sits on the base course: three steps and two handrails reach it
    st = B.get('MC_CONCRETE', 0.015, tag='Steps')
    for i, (h_, d_) in enumerate(((0.11, 0.95), (0.22, 0.65), (0.32, 0.35))):
        st.box(door_x, hy0 - d_ / 2 + 0.05, Z, 1.5, d_, h_)
    hr = B.get('MC_METAL', 0.0, tag='Handrail')
    for sx_ in (-0.68, 0.68):
        hr.beam((door_x + sx_, hy0 - 0.95, Z + 0.72), (door_x + sx_, hy0 - 0.25, Z + 0.95), 0.04)
        hr.box(door_x + sx_, hy0 - 0.93, Z, 0.04, 0.04, 0.74)
        hr.box(door_x + sx_, hy0 - 0.27, Z + 0.3, 0.04, 0.04, 0.66)
    # rainwater: downpipes at the visible corners, with shoes and brackets
    dp = B.get('MC_METAL_DARK', 0.0, tag='Downpipes', sm=True)
    for px_, py_, top_ in ((hx0 + 0.22, hy0 - 0.08, Z + hh - 0.16), (hx1 - 0.2, hy0 - 0.08, Z + hh - 0.16),
                           (hx1 + 0.08, hy1 - 0.25, Z + hh - 0.16), (6.4, 3.32, Z + 2.84)):
        dp.cyl(px_, py_, Z + 0.34, 0.055, top_ - Z - 0.34, seg=10)
        dp.cyl(px_, py_, Z + 0.32, 0.075, 0.1, seg=10)
        for zz_ in (Z + 1.2, Z + 2.4, Z + 3.5):
            if zz_ < top_ - 0.2:
                dp.cyl(px_, py_, zz_, 0.072, 0.05, seg=10)
    # plinth band, storey string course, blue cornice under the roof
    cream = B.get(C, 0.03, tag='Course')
    cxh, cyh = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    B.get('MC_PLINTH_DK', 0.03, tag='BaseCourse').box(cxh, cyh, Z, hx1 - hx0 + 0.16, hy1 - hy0 + 0.16, 0.32)
    cream.box(cxh, cyh, Z + 2.16, hx1 - hx0 + 0.1, hy1 - hy0 + 0.1, 0.1)
    B.get(BL, 0.03, tag='Cornice').box(cxh, cyh, Z + hh - 0.14, hx1 - hx0 + 0.26, hy1 - hy0 + 0.26, 0.2)
    # slim vertical fins on the +x elevation for shadow rhythm
    fins = B.get(C, 0.02, tag='Fins')
    for k in range(5):
        yy = hy0 + 0.35 + (hy1 - hy0 - 0.7) * k / 4
        fins.box(hx1 + 0.05, yy, Z + 0.32, 0.1, 0.1, hh - 0.6)

    # ------------------------------------------------------------ ROOF TRACK
    rz = Z + hh + 0.12
    frame('GD_RoofParapet', hx1 - hx0 - 0.1, hy1 - hy0 - 0.1, 0.35,
          hx1 - hx0 - 0.5, hy1 - hy0 - 0.5, 0.2, rz, 0.4, mat(W), coll, bevel=0.03, cx=cxh, cy=cyh)
    slab('GD_RoofFloor', hx1 - hx0 - 0.4, hy1 - hy0 - 0.4, 0.3, Z + hh, 0.14, mat('MC_CONCRETE'), coll, cx=cxh,
         cy=cyh, bevel=0.02)
    tcx, tcy = -2.85, cyh
    slab('GD_Track', 4.7, 3.0, 1.5, rz, 0.05, mat('MC_TRACK'), coll, cx=tcx, cy=tcy, bevel=0.015, seg=2, n=12)
    frame('GD_TrackLineOuter', 4.7, 3.0, 1.5, 4.63, 2.93, 1.465, rz + 0.05, 0.012, mat('MC_TRACK_LINE'), coll,
          bevel=0, n=12, cx=tcx, cy=tcy)
    frame('GD_TrackLineMid', 3.7, 2.0, 1.0, 3.64, 1.94, 0.97, rz + 0.05, 0.012, mat('MC_TRACK_LINE'), coll,
          bevel=0, n=12, cx=tcx, cy=tcy)
    slab('GD_Infield', 2.9, 1.2, 0.6, rz, 0.09, mat('MC_GRASS'), coll, cx=tcx, cy=tcy, bevel=0.02, seg=2, n=10)
    # stair tower onto the roof
    rect(B.get(BL, 0.04, tag='StairTower'), -6.35, -5.35, 2.05, 3.05, Z + hh, 1.7)
    B.get(NV, 0.02, tag='StairDoor').box(-5.85, 2.03, Z + hh + 0.12, 0.62, 0.08, 1.2)
    B.get(W, 0.02, tag='StairCanopy').box(-5.85, 1.88, Z + hh + 1.4, 0.95, 0.4, 0.07)
    for k_ in range(4):
        B.get('MC_METAL_DARK', 0.0, tag='Louvre').box(-5.33, 2.55, Z + hh + 0.75 + k_ * 0.12, 0.05, 0.55, 0.05)
    B.get(W, 0.02, tag='StairCap').box(-5.85, 2.55, Z + hh + 1.68, 1.15, 1.15, 0.1)
    # roof plant: two fan units, a skylight, floodlight masts
    hv = B.get('MC_METAL', 0.02, tag='RoofPlant')
    rect(hv, -1.5, -0.6, 5.35, 6.05, rz, 0.5)
    rect(hv, -1.5, -0.6, 4.55, 5.15, rz, 0.4)
    fan = B.get('MC_METAL_DARK', 0.0, tag='Fans', sm=True)
    fan.cyl(-1.05, 5.7, rz + 0.5, 0.26, 0.03, seg=20)
    fan.cyl(-1.05, 4.85, rz + 0.4, 0.2, 0.03, seg=20)
    rect(B.get('MC_METAL_DARK', 0.0, tag='ServiceOpening'), -1.3, -0.8, 4.535, 4.56, rz + 0.08, 0.26)
    B.get('MC_METAL', 0.0, tag='ServicePanel').box(-1.385, 4.295, rz + 0.08, 0.5, 0.025, 0.26, rot=-110)
    tb = B.get(NV, 0.015, tag='Toolbox')
    tb.box(-0.72, 3.9, rz + 0.05, 0.42, 0.2, 0.17)
    B.get('MC_METAL', 0.0, tag='ToolboxHandle').box(-0.72, 3.9, rz + 0.22, 0.26, 0.03, 0.05)
    rect(B.get('MC_GLASS', 0.02, tag='Skylight'), -5.1, -4.0, 5.3, 6.0, rz, 0.16)
    for mx, my in ((-5.4, 5.9), (-0.6, 2.3)):
        B.get('MC_METAL_DARK', 0.01, tag='Mast', sm=True).cyl(mx, my, rz, 0.04, 1.6, seg=10)
        B.get('MC_METAL_DARK', 0.015, tag='MastHead').box(mx, my, rz + 1.6, 0.34, 0.12, 0.2)
        B.get('MC_GLASS_LIT', 0.0, tag='MastLamp').box(mx, my - 0.07, rz + 1.63, 0.28, 0.02, 0.14)

    # ----------------------------------------------------------------- ANNEX
    ax0, ax1, ay0, ay1, ah = 1.6, 6.6, 3.4, 6.6, 3.0
    abody = MB('GD_AnnexBody', mat(C), coll, bevel=0.04, seg=2)
    rect(abody, ax0, ax1, ay0, ay1, Z + 0.32, ah - 0.32)
    annex = abody.done()
    ac, ap = [], []
    for face, cols in (('-y', 3), ('+x', 2)):
        c, p = grid_windows(face, ax0, ay0, ax1, ay1, Z, 1, cols, 1.0, 1.3, 0.75, 2.2, depth=0.3, margin=0.6)
        ac += c
        ap += p
    cut(annex, ac)
    link(annex, coll)
    window_dressing(B, ap, glass, lit, lit_every=3, lit_off=1)
    acx, acy = (ax0 + ax1) / 2, (ay0 + ay1) / 2
    B.get('MC_PLINTH_DK', 0.03, tag='BaseCourse').box(acx, acy, Z, ax1 - ax0 + 0.16, ay1 - ay0 + 0.16, 0.32)
    B.get(BL, 0.03, tag='AnnexCornice').box(acx, acy, Z + ah - 0.14, ax1 - ax0 + 0.24, ay1 - ay0 + 0.24, 0.2)
    # shallow vault in cream, ridge in blue, along x
    B.get(C, 0.0, tag='Vault', sm='keep').vault(ax0 - 0.12, ax1 + 0.12, acy, Z + ah - 0.02, (ay1 - ay0) / 2 + 0.06, 0.95, seg=40)
    B.get(BL, 0.02, tag='VaultRibs').box(acx, acy, Z + ah + 0.9, ax1 - ax0 + 0.2, 0.22, 0.05)
    for k in range(6):
        xx = ax0 + 0.05 + (ax1 - ax0 - 0.1) * k / 5
        for j in range(8):
            t = (j + 0.5) / 8
            yy = ay0 - 0.06 + (ay1 - ay0 + 0.12) * t
            hh_ = 0.95 * math.sin(math.pi * t)
            B.get(BL, 0.0, tag='VaultRibs').box(xx, yy, Z + ah + hh_ - 0.02, 0.09, (ay1 - ay0) / 8 + 0.02, 0.05, rot=0.0)
    # sky bridge joining hall to annex
    rect(B.get('MC_GLASS', 0.0, tag='BridgeGlass'), hx1 - 0.05, ax0 + 0.05, 4.35, 5.65, Z + 2.35, 1.1)
    bf = B.get(W, 0.03, tag='BridgeFrame')
    rect(bf, hx1 - 0.05, ax0 + 0.05, 4.25, 5.75, Z + 3.45, 0.14)
    rect(bf, hx1 - 0.05, ax0 + 0.05, 4.25, 5.75, Z + 2.21, 0.14)
    for yy in (4.35, 5.0, 5.65):
        bf.box((hx1 + ax0) / 2, yy, Z + 2.35, 0.06, 0.06, 1.1)
    # awning over the annex -y windows
    for k in range(8):
        B.get(BL if k % 2 == 0 else 'MC_TRACK', 0.02, tag='Awning%d' % (k % 2)).box(
            acx - 2.2 + 0.425 * (k + 0.5) - 0.0, ay0 - 0.35, Z + 2.28, 0.4, 0.7, 0.1)

    # ------------------------------------------------------- TIMING TOWER
    # The finish-line timing tower: a braced steel frame, a glazed timing cabin
    # with a balcony, a ladder, and the beacon on its roof. Slender, so it
    # marks the place without competing with the hall.
    tx, ty = 5.55, -0.85
    slab('GD_TowerFooting', 2.0, 2.0, 0.25, Z, 0.12, mat('MC_CONCRETE'), coll, cx=tx, cy=ty, bevel=0.02)
    col = B.get(NV, 0.02, tag='TowerFrame')
    zc0, zc1 = Z + 0.12, Z + 3.25
    k = 0.62
    for ox in (-k, k):
        for oy in (-k, k):
            col.box(tx + ox, ty + oy, zc0, 0.15, 0.15, zc1 - zc0)
    for zz in (Z + 1.25, Z + 2.3):
        col.box(tx, ty - k, zz, 2 * k + 0.15, 0.1, 0.1)
        col.box(tx, ty + k, zz, 2 * k + 0.15, 0.1, 0.1)
        col.box(tx - k, ty, zz, 0.1, 2 * k, 0.1)
        col.box(tx + k, ty, zz, 0.1, 2 * k, 0.1)
    br = B.get('MC_METAL', 0.0, tag='TowerBrace')
    for z0_, z1_ in ((zc0 + 0.05, Z + 1.25), (Z + 1.35, Z + 2.3)):
        for s_ in (-1, 1):
            br.beam((tx - k * s_, ty - k - 0.02, z0_), (tx + k * s_, ty - k - 0.02, z1_), 0.05)
            br.beam((tx + k + 0.02, ty - k * s_, z0_), (tx + k + 0.02, ty + k * s_, z1_), 0.05)
    # cabin deck with a balcony all round
    B.get(W, 0.03, tag='TowerDeck').box(tx, ty, zc1, 2.15, 2.15, 0.16)
    rail = B.get('MC_METAL', 0.0, tag='Railing')
    zr = zc1 + 0.16
    e = 1.0
    n_ = 6
    for i in range(n_ + 1):
        t_ = -e + 2 * e * i / n_
        for px_, py_ in ((tx + t_, ty - e), (tx + t_, ty + e), (tx - e, ty + t_), (tx + e, ty + t_)):
            rail.box(px_, py_, zr, 0.035, 0.035, 0.5)
    for px_, py_, w_, d_ in ((tx, ty - e, 2 * e + 0.04, 0.045), (tx, ty + e, 2 * e + 0.04, 0.045),
                             (tx - e, ty, 0.045, 2 * e + 0.04), (tx + e, ty, 0.045, 2 * e + 0.04)):
        rail.box(px_, py_, zr + 0.48, w_, d_, 0.045)
        rail.box(px_, py_, zr + 0.25, w_ * 0.999, d_ * 0.8, 0.03)
    # the cabin: a solid lower band, glazing, corner posts, a deep roof
    cz = zr
    cw = 1.36
    B.get(W, 0.025, tag='CabinBase').box(tx, ty, cz, cw, cw, 0.3)
    rect(B.get('MC_GLASS', 0.0, tag='CabinGlass'), tx - cw / 2 + 0.03, tx + cw / 2 - 0.03, ty - cw / 2 + 0.03,
         ty + cw / 2 - 0.03, cz + 0.3, 0.72)
    rect(B.get('MC_GLASS_LIT', 0.0, tag='CabinGlow'), tx - 0.4, tx + 0.4, ty - cw / 2 + 0.01, ty - cw / 2 + 0.05,
         cz + 0.34, 0.3)
    cp = B.get(W, 0.015, tag='CabinPosts')
    for ox in (-cw / 2, cw / 2):
        for oy in (-cw / 2, cw / 2):
            cp.box(tx + ox, ty + oy, cz + 0.3, 0.09, 0.09, 0.72)
    cp.box(tx, ty - cw / 2, cz + 0.3, 0.05, 0.05, 0.72)
    cp.box(tx + cw / 2, ty, cz + 0.3, 0.05, 0.05, 0.72)
    B.get(BL, 0.035, tag='CabinRoof').box(tx, ty, cz + 1.02, 1.85, 1.85, 0.14)
    B.get(NV, 0.015, tag='CabinFascia').box(tx, ty, cz + 0.98, 1.6, 1.6, 0.06)
    # ladder up the +x face (the shaded side, seen by the camera)
    lad = B.get('MC_METAL', 0.0, tag='Ladder')
    lx_ = tx + k + 0.2
    for oy in (-0.2, 0.2):
        lad.box(lx_, ty + oy, zc0, 0.04, 0.04, zc1 - zc0 + 0.7)
    zz = zc0 + 0.25
    while zz < zc1 + 0.1:
        lad.box(lx_, ty, zz, 0.03, 0.4, 0.03)
        zz += 0.28
    # beacon on a short mast from the cabin roof
    bz = cz + 1.16
    B.get('MC_METAL', 0.02, tag='Mast', sm=True).cyl(tx, ty, bz, 0.06, 0.4, seg=12)
    B.get('MC_METAL_DARK', 0.015, tag='BeaconBase', sm=True).cyl(tx, ty, bz + 0.34, 0.2, 0.08, seg=20)
    lamp_ = MB('GD_BeaconLamp', mat('MC_STATUS_LIGHT'), status_coll, bevel=0.0, smooth_=True)
    lamp_.sphere(tx, ty, bz + 0.74, 0.34, 0.34, 0.34, seg=32, rings=18)
    lo = lamp_.done()
    lo['status_role'] = 'beacon'
    ring = MB('GD_BeaconCage', mat('MC_METAL'), coll, bevel=0.0, smooth_=True)
    ring.cyl(tx, ty, bz + 0.42, 0.39, 0.04, seg=32)
    ring.cyl(tx, ty, bz + 1.04, 0.39, 0.04, seg=32)
    for i in range(4):
        a_ = math.pi / 4 + i * math.pi / 2
        ring.box(tx + 0.39 * math.cos(a_), ty + 0.39 * math.sin(a_), bz + 0.42, 0.03, 0.03, 0.66)
    ring.cyl(tx, ty, bz + 1.08, 0.05, 0.08, seg=10)
    ring.done()

    # ----------------------------------------------------------- SPRINT STRIP
    sx0, sx1, sy0, sy1 = -2.6, 4.1, -1.6, 1.2
    slab('GD_SprintBed', sx1 - sx0 + 0.3, sy1 - sy0 + 0.3, 0.3, Z, 0.05, mat('MC_CONCRETE_DK'), coll,
         cx=(sx0 + sx1) / 2, cy=(sy0 + sy1) / 2, bevel=0.015)
    slab('GD_SprintTrack', sx1 - sx0, sy1 - sy0, 0.2, Z + 0.05, 0.05, mat('MC_TRACK'), coll,
         cx=(sx0 + sx1) / 2, cy=(sy0 + sy1) / 2, bevel=0.012)
    bw, bd = sx1 - sx0 + 0.3, sy1 - sy0 + 0.3
    frame('GD_SprintKerb', bw + 0.26, bd + 0.26, 0.43, bw, bd, 0.3, Z, 0.15, mat('MC_CONCRETE'), coll,
          bevel=0.018, cx=(sx0 + sx1) / 2, cy=(sy0 + sy1) / 2)
    rect(B.get('MC_METAL_DARK', 0.0, tag='Drain'), sx0 - 0.1, sx1 + 0.1, sy0 - 0.43, sy0 - 0.31, Z, 0.012)
    ln = B.get('MC_TRACK_LINE', 0.0, tag='Lanes')
    for i in range(4):
        yy = sy0 + (sy1 - sy0) * i / 3
        rect(ln, sx0 + 0.15, sx1 - 0.15, yy - 0.025, yy + 0.025, Z + 0.1, 0.012)
    rect(ln, sx0 + 0.35, sx0 + 0.42, sy0 + 0.05, sy1 - 0.05, Z + 0.1, 0.012)
    rect(ln, sx1 - 0.42, sx1 - 0.35, sy0 + 0.05, sy1 - 0.05, Z + 0.1, 0.012)
    fx = sx1 - 0.385
    for fy, eye in ((sy0 - 0.08, 0.07), (sy1 + 0.08, -0.07)):
        B.get(NV, 0.012, tag='TimingPost').box(fx, fy, Z + 0.15, 0.08, 0.08, 0.95)
        B.get(NV, 0.015, tag='TimingPost').box(fx, fy, Z + 1.02, 0.16, 0.16, 0.16)
        B.get('MC_GLASS_LIT', 0.0, tag='TimingEye').box(fx, fy + eye, Z + 1.06, 0.07, 0.02, 0.07)
    hb = B.get('MC_COMPOSITE_YELLOW', 0.015, tag='Hurdles')
    for hxp in (0.0, 1.0, 2.0, 3.0):
        yy = (sy0 + sy1) / 2
        hb.box(hxp, yy - 0.34, Z + 0.1, 0.06, 0.06, 0.34)
        hb.box(hxp, yy + 0.34, Z + 0.1, 0.06, 0.06, 0.34)
        hb.box(hxp, yy, Z + 0.4, 0.07, 0.72, 0.05)
    gt = B.get(NV, 0.03, tag='Gate')
    gt.box(sx0 + 0.55, sy0 - 0.05, Z + 0.05, 0.12, 0.12, 1.45)
    gt.box(sx0 + 0.55, sy1 + 0.05, Z + 0.05, 0.12, 0.12, 1.45)
    gt.box(sx0 + 0.55, (sy0 + sy1) / 2, Z + 1.42, 0.14, sy1 - sy0 + 0.25, 0.14)

    # ------------------------------------------------- LIFTING PERGOLA
    lx0, lx1, ly0, ly1 = -6.6, -2.9, -5.0, -1.1
    slab('GD_RubberFloor', lx1 - lx0, ly1 - ly0, 0.25, Z, 0.05, mat('MC_PAINT_SLATE'), coll,
         cx=(lx0 + lx1) / 2, cy=(ly0 + ly1) / 2, bevel=0.015)
    wd = B.get('MC_WOOD', 0.025, tag='Pergola')
    for px_ in (lx0 + 0.3, lx1 - 0.3):
        for py_ in (ly0 + 0.3, ly1 - 0.3):
            wd.box(px_, py_, Z + 0.05, 0.16, 0.16, 2.35)
    for i in range(7):
        xx = lx0 + 0.3 + (lx1 - lx0 - 0.6) * i / 6
        wd.box(xx, (ly0 + ly1) / 2, Z + 2.4, 0.11, ly1 - ly0 - 0.1, 0.11)
    wd.box((lx0 + lx1) / 2, ly0 + 0.3, Z + 2.28, lx1 - lx0 - 0.4, 0.14, 0.14)
    wd.box((lx0 + lx1) / 2, ly1 - 0.3, Z + 2.28, lx1 - lx0 - 0.4, 0.14, 0.14)
    mt = B.get('MC_METAL_DARK', 0.015, tag='Rack')
    for rx in (lx0 + 0.9, lx0 + 2.1):
        for ry in (ly0 + 1.1, ly0 + 1.6):
            mt.box(rx, ry, Z + 0.05, 0.08, 0.08, 1.15)
        mt.box(rx, ly0 + 1.35, Z + 1.1, 0.08, 0.6, 0.08)
    B.get('MC_METAL', 0.0, tag='Bar', sm=True).cyl(lx0 + 0.5, ly0 + 1.35, Z + 0.95, 0.03, 2.2, seg=10, axis='X')
    pl = B.get(NV, 0.01, tag='Plates', sm=True)
    for px_ in (lx0 + 0.55, lx0 + 2.5):
        pl.cyl(px_, ly0 + 1.35, Z + 0.95, 0.19, 0.08, seg=24, axis='X')
    kb = B.get('MC_METAL_DARK', 0.0, tag='Kettlebells', sm=True)
    for kx, ky in ((lx0 + 0.5, ly1 - 0.65), (lx0 + 0.9, ly1 - 0.72), (-4.74, -2.34)):
        kb.sphere(kx, ky, Z + 0.17, 0.13, 0.13, 0.12, seg=12, rings=8)
        kb.box(kx, ky, Z + 0.23, 0.14, 0.03, 0.12)
    B.get('MC_WOOD', 0.02, tag='Bench').box(lx1 - 1.0, ly1 - 0.9, Z + 0.4, 1.0, 0.36, 0.08)
    lg = B.get('MC_METAL_DARK', 0.01, tag='BenchLegs')
    lg.box(lx1 - 1.4, ly1 - 0.9, Z + 0.05, 0.06, 0.3, 0.36)
    lg.box(lx1 - 0.6, ly1 - 0.9, Z + 0.05, 0.06, 0.3, 0.36)

    # ------------------------------------------------- PLAZA, LAWN, GREEN
    slab('GD_Lawn', 4.2, 3.4, 0.7, Z, 0.08, mat('MC_GRASS'), coll, cx=0.6, cy=-5.3, bevel=0.03)
    frame('GD_LawnCurb', 4.46, 3.66, 0.83, 4.2, 3.4, 0.7, Z, 0.15, mat('MC_CONCRETE'), coll, bevel=0.018,
          cx=0.6, cy=-5.3)
    slab('GD_Path', 6.0, 0.7, 0.3, Z, 0.03, mat('MC_CONCRETE'), coll, cx=3.6, cy=-2.35, bevel=0.012)
    tree(B, -0.6, -4.1, 1.0, pit=False)
    tree(B, -7.0, -6.6, 1.15)
    tree(B, 6.85, 5.2, 0.9)
    tree(B, 6.2, -6.15, 1.0)
    planter(B, -3.3, 1.25, 0.9, 0.42)
    hedge(B, -6.55, -3.4, -6.85)
    # the lawn is a drill ground: an agility ladder and a slalom of cones
    agility_ladder(B, -0.9, 2.04, -5.95, Z + 0.08)
    for i, cx_ in enumerate((0.3, 0.8, 1.3, 1.8, 2.3)):
        cone(B, cx_, -4.55 if i % 2 else -5.0, Z + 0.08)
    # plyometric boxes with rubber tops
    plyo = B.get('MC_WOOD', 0.02, tag='Plyo')
    top = B.get('MC_PAINT_SLATE', 0.012, tag='PlyoTop')
    for x0_, x1_, y0_, y1_, h_ in ((2.8, 3.5, -4.8, -4.1, 0.5), (3.7, 4.4, -4.8, -4.1, 0.75),
                                   (3.2, 3.9, -4.0, -3.4, 0.35)):
        rect(plyo, x0_, x1_, y0_, y1_, Z, h_)
        rect(top, x0_ + 0.03, x1_ - 0.03, y0_ + 0.03, y1_ - 0.03, Z + h_, 0.03)
    cart(B, 3.6, -5.85)
    water_station(B, 5.3, -3.9)
    totem(B, -2.95, -7.05)
    for cx_, cy_ in ((-2.7, -2.5), (4.7, -1.95)):
        cone(B, cx_, cy_)
    # benches face into the block
    for bx_, by_ in ((-2.4, -6.45), (4.6, -6.55)):
        B.get('MC_WOOD', 0.02, tag='Bench2').box(bx_, by_, Z + 0.4, 1.3, 0.38, 0.08)
        B.get('MC_WOOD', 0.02, tag='Bench2').box(bx_, by_ + 0.2, Z + 0.62, 1.3, 0.06, 0.34)
        for sx_ in (-0.5, 0.5):
            B.get('MC_METAL_DARK', 0.01, tag='BenchLegs2').box(bx_ + sx_, by_, Z + 0.05, 0.06, 0.32, 0.36)
    lamp(B, -0.3, -2.6)
    lamp(B, 7.0, -2.9)
    lamp(B, -7.0, -0.4, 2.2)
    flag(B, 3.0, 1.9, BL)
    flag(B, 0.55, 2.0, 'MC_PAINT_CREAM')
    B.finish()
    return B
