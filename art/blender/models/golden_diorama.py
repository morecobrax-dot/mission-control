"""golden diorama: an original miniature training and performance facility.

Not a gym chain and not a building anyone owns. The architecture carries the
identity: a two-storey training hall with an oval rooftop running track, a
shallow-vaulted annex joined to it by a glass sky bridge, a stepped
progression podium topped by the beacon, an open-air lifting pergola and a
three-lane sprint strip. No signage, no lettering.

Deck top is z = 1.0, deck is 15.4 across. The camera sits at +x, -y; the key
light comes from -y, so the -y faces are lit and the +x faces are in fill.
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


def tree(B, x, y, s=1.0, dark=False):
    B.get('MC_WOOD_DARK', 0.0, tag='Trunk', sm=True).cyl(x, y, Z, 0.11 * s, 0.75 * s, seg=12)
    leaf = B.get('MC_LEAF_DARK' if dark else 'MC_LEAF', 0.0, tag='Foliage', sm=True)
    leaf.sphere(x, y, Z + 1.05 * s, 0.62 * s, 0.62 * s, 0.56 * s, seg=14, rings=10)
    leaf.sphere(x + 0.3 * s, y - 0.1 * s, Z + 1.34 * s, 0.42 * s, 0.42 * s, 0.4 * s, seg=14, rings=9)
    leaf.sphere(x - 0.26 * s, y + 0.12 * s, Z + 1.24 * s, 0.4 * s, 0.4 * s, 0.38 * s, seg=14, rings=9)


def planter(B, x, y, w=0.9, d=0.5):
    rect(B.get('MC_PAINT_CREAM', 0.03, tag='Planter'), x - w / 2, x + w / 2, y - d / 2, y + d / 2, Z, 0.34)
    B.get('MC_LEAF', 0.0, tag='PlanterLeaf', sm=True).sphere(x, y, Z + 0.55, w * 0.42, d * 0.55, 0.3, seg=12, rings=8)
    B.get('MC_LEAF_DARK', 0.0, tag='PlanterLeaf', sm=True).sphere(x + w * 0.2, y, Z + 0.6, w * 0.24, d * 0.4, 0.22,
                                                                  seg=14, rings=8)


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
    # plinth band, storey string course, blue cornice under the roof
    cream = B.get(C, 0.03, tag='Course')
    cxh, cyh = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    cream.box(cxh, cyh, Z, hx1 - hx0 + 0.16, hy1 - hy0 + 0.16, 0.32)
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
    B.get(NV, 0.02, tag='StairDoor').box(-5.85, 3.05, Z + hh + 0.05, 0.62, 0.08, 1.25)
    B.get(W, 0.02, tag='StairCap').box(-5.85, 2.55, Z + hh + 1.68, 1.15, 1.15, 0.1)
    # roof plant: two fan units, a skylight, floodlight masts
    hv = B.get('MC_METAL', 0.02, tag='RoofPlant')
    rect(hv, -1.5, -0.6, 5.35, 6.05, rz, 0.5)
    rect(hv, -1.5, -0.6, 4.55, 5.15, rz, 0.4)
    fan = B.get('MC_METAL_DARK', 0.0, tag='Fans', sm=True)
    fan.cyl(-1.05, 5.7, rz + 0.5, 0.26, 0.03, seg=20)
    fan.cyl(-1.05, 4.85, rz + 0.4, 0.2, 0.03, seg=20)
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
    wh = B.get(W, 0.03, tag='AnnexTrim')
    acx, acy = (ax0 + ax1) / 2, (ay0 + ay1) / 2
    wh.box(acx, acy, Z, ax1 - ax0 + 0.16, ay1 - ay0 + 0.16, 0.32)
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

    # ----------------------------------------------- PROGRESSION PODIUM
    steps = [(0.9, 0.62), (1.7, 0.62), (2.5, 0.62), (3.3, 0.62), (4.1, 0.62)]
    px0, px1 = 4.55, 6.55
    y = -1.5
    for i, (ht, dep) in enumerate(steps):
        rect(B.get(BL if i < 4 else NV, 0.04, tag='Step%d' % i), px0, px1, y, y + dep + 0.12, Z, ht)
        y += dep
    y = -1.5
    for i, (ht, dep) in enumerate(steps):
        rect(B.get(C, 0.02, tag='StepCap'), px0 - 0.03, px1 + 0.03, y - 0.02, y + dep + 0.14, Z + ht, 0.06)
        # a lit strip on every visible riser: the display, with no numbers to read
        prev = steps[i - 1][0] if i else 0.0
        rect(B.get('MC_GLASS_LIT', 0.0, tag='RiserLight'), px0 + 0.22, px1 - 0.22, y - 0.03, y + 0.005,
             Z + prev + (ht - prev) * 0.45, 0.1)
        y += dep
    mast_x, mast_y = 5.55, -1.5 + 4 * 0.62 + 0.3
    B.get('MC_METAL', 0.02, tag='Mast', sm=True).cyl(mast_x, mast_y, Z + 4.16, 0.06, 1.0, seg=12)
    lamp_ = MB('GD_BeaconLamp', mat('MC_STATUS_LIGHT'), status_coll, bevel=0.0, smooth_=True)
    lamp_.sphere(mast_x, mast_y, Z + 5.4, 0.4, 0.4, 0.4, seg=32, rings=18)
    lo = lamp_.done()
    lo['status_role'] = 'beacon'
    ring = MB('GD_BeaconCage', mat('MC_METAL'), coll, bevel=0.0, smooth_=True)
    ring.cyl(mast_x, mast_y, Z + 4.98, 0.46, 0.05, seg=32)
    ring.cyl(mast_x, mast_y, Z + 5.82, 0.46, 0.05, seg=32)
    ring.done()

    # ----------------------------------------------------------- SPRINT STRIP
    sx0, sx1, sy0, sy1 = -2.6, 4.1, -1.6, 1.2
    slab('GD_SprintBed', sx1 - sx0 + 0.3, sy1 - sy0 + 0.3, 0.3, Z, 0.05, mat('MC_CONCRETE_DK'), coll,
         cx=(sx0 + sx1) / 2, cy=(sy0 + sy1) / 2, bevel=0.015)
    slab('GD_SprintTrack', sx1 - sx0, sy1 - sy0, 0.2, Z + 0.05, 0.05, mat('MC_TRACK'), coll,
         cx=(sx0 + sx1) / 2, cy=(sy0 + sy1) / 2, bevel=0.012)
    ln = B.get('MC_TRACK_LINE', 0.0, tag='Lanes')
    for i in range(4):
        yy = sy0 + (sy1 - sy0) * i / 3
        rect(ln, sx0 + 0.15, sx1 - 0.15, yy - 0.025, yy + 0.025, Z + 0.1, 0.012)
    rect(ln, sx0 + 0.35, sx0 + 0.42, sy0 + 0.05, sy1 - 0.05, Z + 0.1, 0.012)
    rect(ln, sx1 - 0.42, sx1 - 0.35, sy0 + 0.05, sy1 - 0.05, Z + 0.1, 0.012)
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
    for kx, ky in ((lx0 + 0.7, ly1 - 0.7), (lx0 + 1.15, ly1 - 0.8), (lx0 + 1.6, ly1 - 0.7)):
        kb.sphere(kx, ky, Z + 0.17, 0.13, 0.13, 0.12, seg=12, rings=8)
        kb.box(kx, ky, Z + 0.23, 0.14, 0.03, 0.12)
    B.get('MC_WOOD', 0.02, tag='Bench').box(lx1 - 1.0, ly1 - 0.9, Z + 0.4, 1.0, 0.36, 0.08)
    lg = B.get('MC_METAL_DARK', 0.01, tag='BenchLegs')
    lg.box(lx1 - 1.4, ly1 - 0.9, Z + 0.05, 0.06, 0.3, 0.36)
    lg.box(lx1 - 0.6, ly1 - 0.9, Z + 0.05, 0.06, 0.3, 0.36)

    # ------------------------------------------------- PLAZA, LAWN, GREEN
    slab('GD_Lawn', 4.2, 3.4, 0.7, Z, 0.08, mat('MC_GRASS'), coll, cx=0.6, cy=-5.3, bevel=0.03)
    slab('GD_Path', 6.0, 0.7, 0.3, Z, 0.03, mat('MC_CONCRETE'), coll, cx=3.6, cy=-2.35, bevel=0.012)
    tree(B, -0.6, -4.1, 1.0)
    tree(B, 1.9, -6.0, 0.85, dark=True)
    tree(B, -7.0, -6.6, 1.15)
    tree(B, 6.85, 5.2, 0.9, dark=True)
    planter(B, 5.2, -5.0, 1.2, 0.5)
    planter(B, 5.2, -6.1, 1.2, 0.5)
    planter(B, -3.3, 1.25, 0.9, 0.42)
    # low hedge along the front-left edge, rounded by a fat bevel
    for hx_ in (-6.2, -5.4, -4.6, -3.8):
        B.get('MC_LEAF_DARK', 0.0, tag='Shrubs', sm=True).sphere(hx_, -6.95, Z + 0.3, 0.42, 0.4, 0.36, seg=14, rings=9)
    plyo = B.get('MC_WOOD', 0.02, tag='Plyo')
    rect(plyo, 2.8, 3.5, -4.8, -4.1, Z, 0.5)
    rect(plyo, 3.7, 4.4, -4.8, -4.1, Z, 0.75)
    rect(plyo, 3.2, 3.9, -4.0, -3.4, Z, 0.35)
    cn = B.get('MC_COMPOSITE_YELLOW', 0.0, tag='Cones', sm=True)
    for cx_, cy_ in ((2.4, -3.4), (2.4, -2.7), (5.6, -3.4), (5.9, -4.4)):
        cn.cyl(cx_, cy_, Z, 0.13, 0.28, seg=16, radius2=0.03)
    # benches and a drinking fountain fill the front deck
    for bx_, by_, brot in ((2.9, -6.55, 0.0), (-2.4, -6.45, 0.0)):
        B.get('MC_WOOD', 0.02, tag='Bench2').box(bx_, by_, Z + 0.4, 1.3, 0.38, 0.08)
        B.get('MC_WOOD', 0.02, tag='Bench2').box(bx_, by_ + 0.2, Z + 0.62, 1.3, 0.06, 0.34)
        for sx_ in (-0.5, 0.5):
            B.get('MC_METAL_DARK', 0.01, tag='BenchLegs2').box(bx_ + sx_, by_, Z + 0.05, 0.06, 0.32, 0.36)
    B.get(C, 0.03, tag='Fountain').cyl(0.9, -2.7, Z, 0.17, 0.75, seg=20)
    B.get(BL, 0.02, tag='FountainCap', sm=True).cyl(0.9, -2.7, Z + 0.75, 0.24, 0.1, seg=20)
    lamp(B, -0.3, -2.6)
    lamp(B, 7.0, -2.9)
    lamp(B, -7.0, -0.4, 2.2)
    flag(B, 3.0, 1.9, BL)
    flag(B, 0.55, 2.0, 'MC_PAINT_CREAM')
    B.finish()
    return B
