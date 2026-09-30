"""Personal Savings: a civic savings hall — trustworthy, orderly, quietly well kept.

The app is about money moved on purpose and kept safe. The place says so in
architecture, never in currency symbols, gold or a gauge:
  - a stone hall behind a portico of six columns under a pediment, a green
    standing-seam roof, and a small cupola on the ridge carrying the beacon:
    the civic silhouette you find Personal Savings by
  - a brass revolving door, the one thing that moves
  - the archive wing on the west: its round vault door stands open on a lit
    wall of deposit boxes — reserves, kept in order
  - the planning house on the east: big windows under striped awnings, a
    side door where a secure van is being unloaded — intake, deliberate and
    watched
  - a formal forecourt: a walk on the axis of the door, clipped parterres,
    topiary, urns, and a row of young trees in tubs along the east walk
No numbers, levels or completion: a place, never a progress bar.

Its life (MC_LIFE, 60 s): the revolving door turns.

Deck top is z = 1.0, deck is 15.4 across; the camera sits at +x, -y.
"""
import math
import bpy
from mc_lib import MB, slab, frame, cut, mat, link, DECK_Z
from mc_kit import (Builders, rect, tree, planter, hedge, lamp, window_dressing, paver_joints, bench, beacon,
                    gable, push_life, key, life_object)

ACCENT = 'MC_PS_STONE'
Z = DECK_Z
ST, GR, GL, W = 'MC_PS_STONE', 'MC_PS_GREEN', 'MC_PS_GREEN_LT', 'MC_PAINT_WHITE'
LIFE_FRAMES = 1440
PODIUM = 0.51                                         # three steps up to the portico floor

WORKERS = [
    ('greeter',   (1.35, 0.35, Z + PODIUM), 205, 'IDLE', None, 'ps_crew'),
    ('archivist', (-4.6, 1.45, 1.0), 20, 'WORKING', 'clipboard', 'ps_clerk'),
    ('courier',   (5.45, -1.95, 1.0), 20, 'REPAIR', None, 'ps_crew'),
    ('planner',   (-1.9, -4.35, 1.0), 235, 'WORKING', 'tablet', 'ps_clerk'),
    ('guard',     (2.05, -6.0, 1.0), 215, 'SIGNAL', None, 'ps_crew'),
]


def column(B, x, y, z0, h):
    """A column: square base, a gently tapered shaft, a capital block."""
    stone = B.get(ST, 0.02, tag='ColumnBlocks')
    stone.box(x, y, z0, 0.5, 0.5, 0.14)
    B.get(ST, 0.0, tag='Shafts', sm=True).cyl(x, y, z0 + 0.14, 0.2, h - 0.34, seg=18, radius2=0.175)
    stone.box(x, y, z0 + h - 0.2, 0.46, 0.46, 0.08)
    stone.box(x, y, z0 + h - 0.12, 0.54, 0.54, 0.12)


def build(coll, status_coll):
    B = Builders(coll, 'PS')
    glass, lit = B.get('MC_GLASS', 0.0, tag='Panes'), B.get('MC_GLASS_LIT', 0.0, tag='Panes')
    paver_joints(B, -7.2, 7.2, -7.2, 7.2, 1.44)
    stone = B.get(ST, 0.03, tag='Stone')

    # ------------------------------------------------------------ THE HALL
    hx0, hx1, hy0, hy1, hh = -3.2, 3.2, 2.4, 6.3, 4.0
    zf = Z + PODIUM
    # the podium and its steps, wider than the hall so the portico stands on it
    steps = B.get(ST, 0.02, tag='Steps')
    for i in range(3):
        steps.box(0, 3.45 - 0.0, Z + i * 0.17, 7.6 - i * 0.3, 6.5 - i * 0.3, 0.17)
    body = MB('PS_HallBody', mat(ST), coll, bevel=0.04, seg=2)
    rect(body, hx0, hx1, hy0, hy1, zf, hh - PODIUM)
    hall = body.done()
    cut(hall, [(0, hy0 + 0.15, zf, 1.3, 0.4, 2.3),
               (-1.75, hy0 + 0.12, zf + 0.55, 0.8, 0.3, 2.0), (1.75, hy0 + 0.12, zf + 0.55, 0.8, 0.3, 2.0)])
    link(hall, coll)
    window_dressing(B, [(-1.75, hy0 + 0.22, zf + 0.57, 0.76, 0.05, 1.96, 0), (1.75, hy0 + 0.22, zf + 0.57, 0.76, 0.05, 1.96, 0)],
                    glass, lit, lit_every=2, lit_off=1, frame_mat=GR, sill_mat=ST)
    # the revolving door: a brass canopy drum and four turning brass leaves
    B.get('MC_PS_BRASS', 0.0, tag='DoorDrum', sm=True).cyl(0, hy0 + 0.1, zf + 2.2, 0.72, 0.16, seg=32)
    B.get('MC_GLASS_LIT', 0.0, tag='DoorGlow').box(0, hy0 + 0.33, zf, 1.24, 0.05, 2.25)

    def leaves(b):
        for i in range(4):
            a = math.pi / 4 + i * math.pi / 2
            b.box(0.3 * math.cos(a), 0.3 * math.sin(a), 0, 0.6, 0.04, 2.15, rot=math.degrees(a))
        b.cyl(0, 0, 0, 0.05, 2.15, seg=10)
    door = life_object('PS_RevolvingDoor', 'MC_BRASS', coll, leaves, (0, hy0 + 0.05, zf + 0.02))
    key(door, 'rotation_euler', [(1, (0, 0, 0)), (LIFE_FRAMES + 1, (0, 0, 4 * math.pi))])
    push_life(door)
    # the portico: six columns, the entablature, a frieze band, the pediment and the roof
    cz = zf
    for i in range(6):
        column(B, -2.75 + i * 1.1, 1.05, cz, 3.1)
    ez = cz + 3.1
    stone.box(0, 1.6, ez, 6.9, 1.6, 0.3)                                       # architrave over the columns
    stone.box(0, (1.0 + hy1) / 2, ez + 0.3, 6.95, hy1 - 0.6, 0.36)            # frieze course, round the whole roof
    B.get(GR, 0.0, tag='FriezeBand').box(0, 0.78, ez + 0.4, 6.9, 0.04, 0.14)
    stone.box(0, (0.9 + hy1) / 2, ez + 0.66, 7.1, hy1 - 0.4, 0.12)             # cornice
    rz = ez + 0.78
    gable(B.get(ST, 0.03, tag='Pediment'), -3.45, 3.45, 0.85, 1.25, rz, 1.25, ridge='y')
    gable(B.get('MC_PS_ROOF', 0.03, tag='Roof'), -3.6, 3.6, 1.15, hy1 + 0.2, rz - 0.02, 1.36, ridge='y')
    B.get('MC_PS_BRASS', 0.0, tag='Medallion', sm=True).cyl(0, 0.82, rz + 0.5, 0.3, 0.06, seg=28, axis='Y')
    seams = B.get(GL, 0.0, tag='Seams')
    for i in range(1, 7):                                                   # standing seams on the roof slopes
        t = i / 7
        for side in (-1, 1):
            x = side * 3.6 * (1 - t)
            seams.box(x, (1.15 + hy1 + 0.2) / 2, rz - 0.02 + 1.36 * t, 0.05, hy1 - 0.95, 0.05)
    # the cupola on the ridge: an arcaded lantern, a green cap, the beacon on top
    kz = rz + 1.2
    stone.box(0, 4.3, kz - 0.4, 1.3, 1.3, 1.0)
    for sx, sy in ((0, 3.64), (0.66, 4.3)):
        g = lit
        if sx:
            g.box(sx, 4.3, kz, 0.05, 0.5, 0.5)
        else:
            g.box(0, sy, kz, 0.5, 0.05, 0.5)
    stone.box(0, 4.3, kz + 0.6, 1.5, 1.5, 0.12)
    B.get(GR, 0.0, tag='CupolaCap', sm=True).sphere(0, 4.3, kz + 0.72, 0.72, 0.72, 0.55, seg=24, rings=12)
    beacon(B, status_coll, 'PS', 0, 4.3, kz + 1.2, r=0.24)

    # ------------------------------------------------ THE ARCHIVE (WEST WING)
    ax0, ax1, ay0, ay1, ah = -6.8, -3.4, 2.7, 6.1, 2.9
    stone.box((ax0 + ax1) / 2, (ay0 + ay1) / 2, Z, ax1 - ax0, ay1 - ay0, 0.35)
    wing = MB('PS_Archive', mat(ST), coll, bevel=0.035, seg=2)
    rect(wing, ax0 + 0.05, ax1 - 0.05, ay0 + 0.05, ay1 - 0.05, Z + 0.35, ah - 0.35)
    ar = wing.done()
    vx, vz, vr = -5.1, Z + 1.45, 0.82
    cut(ar, [(vx, ay0 + 0.2, vz - vr, 2 * vr, 0.6, 2 * vr)])
    link(ar, coll)
    for k in range(4):                                                      # rusticated coursing
        B.get('MC_CONCRETE_DK', 0.0, tag='Rustication').box((ax0 + ax1) / 2, ay0 - 0.005, Z + 0.7 + k * 0.52,
                                                            ax1 - ax0 - 0.1, 0.02, 0.03)
    stone.box((ax0 + ax1) / 2, (ay0 + ay1) / 2, Z + ah, ax1 - ax0 + 0.2, ay1 - ay0 + 0.2, 0.18)
    B.get(GR, 0.01, tag='Coping').box((ax0 + ax1) / 2, (ay0 + ay1) / 2, Z + ah + 0.18, ax1 - ax0 + 0.1, ay1 - ay0 + 0.1, 0.08)
    # the vault: a thick ring, a lit wall of deposit boxes, the great door swung open
    ring = B.get('MC_METAL_DARK', 0.0, tag='VaultRing')                   # a true ring, so the vault shows through it
    for i in range(24):
        a0, a1 = 2 * math.pi * i / 24, 2 * math.pi * (i + 1) / 24
        rr = vr + 0.09
        ring.beam((vx + rr * math.cos(a0), ay0 - 0.05, vz + rr * math.sin(a0)), (vx + rr * math.cos(a1), ay0 - 0.05, vz + rr * math.sin(a1)), 0.2, 0.22)
    rect(B.get('MC_GLASS_LIT', 0.0, tag='VaultGlow'), vx - vr, vx + vr, ay0 + 0.45, ay0 + 0.48, vz - vr, 2 * vr)
    grid = B.get('MC_PS_BRASS', 0.0, tag='Boxes')
    for k in range(5):
        grid.box(vx, ay0 + 0.42, vz - vr + 0.15 + k * 0.33, 2 * vr - 0.1, 0.03, 0.03)
        grid.box(vx - vr + 0.2 + k * 0.36, ay0 + 0.42, vz - vr, 0.03, 0.03, 2 * vr)
    hinge_x = vx + vr + 0.1
    B.get('MC_PS_BRASS', 0.0, tag='VaultDoor', sm=True).cyl(hinge_x + 0.1, ay0 - 0.85, vz, vr, 0.28, seg=40, axis='Y', rot=-78)
    B.get('MC_METAL_DARK', 0.0, tag='VaultHinge', sm=True).cyl(hinge_x, ay0 - 0.12, vz - 0.5, 0.08, 1.0, seg=10)
    wheel = B.get('MC_METAL', 0.0, tag='VaultWheel')
    for a in (0, 60, 120):
        wheel.beam((hinge_x + 0.3, ay0 - 1.0 - 0.35 * math.sin(math.radians(a)), vz - 0.35 * math.cos(math.radians(a))),
                   (hinge_x + 0.3, ay0 - 1.0 + 0.35 * math.sin(math.radians(a)), vz + 0.35 * math.cos(math.radians(a))), 0.04)
    rect(B.get(GR, 0.0, tag='Mat'), vx - 0.9, vx + 0.9, ay0 - 1.3, ay0 - 0.1, Z, 0.012)

    # ------------------------------------------- THE PLANNING HOUSE (EAST WING)
    ex0, ex1, ey0, ey1, eh = 3.4, 6.8, 2.7, 6.1, 2.9
    stone.box((ex0 + ex1) / 2, (ey0 + ey1) / 2, Z, ex1 - ex0, ey1 - ey0, 0.35)
    ew = MB('PS_Planning', mat(ST), coll, bevel=0.035, seg=2)
    rect(ew, ex0 + 0.05, ex1 - 0.05, ey0 + 0.05, ey1 - 0.05, Z + 0.35, eh - 0.35)
    pl = ew.done()
    wxs = (4.25, 5.95)
    cut(pl, [(x, ey0 + 0.12, Z + 0.9, 1.1, 0.3, 1.45) for x in wxs] + [(ex1 - 0.15, 4.4, Z + 0.35, 0.4, 0.9, 1.85)])
    link(pl, coll)
    window_dressing(B, [(x, ey0 + 0.22, Z + 0.92, 1.06, 0.05, 1.41, 0) for x in wxs], glass, lit, lit_every=2, lit_off=0,
                    frame_mat=GR, sill_mat=ST)
    for x in wxs:                                                           # striped awnings
        for k in range(5):
            B.get(GR if k % 2 == 0 else W, 0.0, tag='Awning').box(x - 0.5 + k * 0.25 + 0.125, ey0 - 0.3, Z + 2.45, 0.25, 0.7,
                                                                   0.06, rot=0)
        B.get(GR, 0.0, tag='AwningValance').box(x, ey0 - 0.64, Z + 2.33, 1.28, 0.03, 0.14)
    stone.box((ex0 + ex1) / 2, (ey0 + ey1) / 2, Z + eh, ex1 - ex0 + 0.2, ey1 - ey0 + 0.2, 0.18)
    B.get(GR, 0.01, tag='Coping').box((ex0 + ex1) / 2, (ey0 + ey1) / 2, Z + eh + 0.18, ex1 - ex0 + 0.1, ey1 - ey0 + 0.1, 0.08)
    B.get(GR, 0.015, tag='SideDoor').box(ex1 - 0.02, 4.4, Z + 0.35, 0.05, 0.84, 1.8)
    # plant on the wing roofs: a condenser and a skylight
    B.get('MC_METAL', 0.02, tag='Plant').box(5.9, 5.2, Z + eh + 0.26, 0.9, 0.7, 0.45)
    B.get('MC_METAL_DARK', 0.0, tag='Fans', sm=True).cyl(5.9, 5.2, Z + eh + 0.71, 0.25, 0.03, seg=18)
    rect(B.get('MC_GLASS', 0.0, tag='Skylight'), -5.9, -4.3, 4.2, 5.3, Z + ah + 0.26, 0.08)

    # --------------------------------------------------------- THE SECURE VAN
    vx0, vy0 = 5.45, -0.35                                 # backed up to the planning house, doors open
    van = B.get(GR, 0.04, tag='Van')
    van.box(vx0, vy0, Z + 0.36, 1.3, 2.3, 1.35)
    van.box(vx0, vy0 - 1.45, Z + 0.36, 1.26, 0.7, 0.95)
    B.get('MC_GLASS', 0.0, tag='Windscreen').box(vx0, vy0 - 1.82, Z + 0.92, 1.08, 0.05, 0.36)
    B.get(W, 0.0, tag='VanStripe').box(vx0, vy0, Z + 1.18, 1.32, 2.28, 0.1)
    for sx in (-0.58, 0.58):                                # rear doors swung open
        B.get(GR, 0.02, tag='VanDoors').box(vx0 + sx * 1.2, vy0 + 1.2, Z + 0.4, 0.05, 0.62, 1.25, rot=sx * 60)
    wh = B.get('MC_METAL_DARK', 0.0, tag='Wheels', sm=True)
    for sy in (-1.3, 0.6):
        for sx in (-0.64, 0.64):
            wh.cyl(vx0 + sx, vy0 + sy, Z + 0.34, 0.33, 0.2, seg=18, axis='X')
    B.get('MC_METAL', 0.0, tag='Bumper').box(vx0, vy0 - 1.82, Z + 0.3, 1.3, 0.1, 0.14)
    for sx in (-0.45, 0.45):
        B.get('MC_GLASS_LIT', 0.0, tag='Headlights', sm=True).cyl(vx0 + sx, vy0 - 1.83, Z + 0.62, 0.09, 0.04, seg=12, axis='Y')
    cases = B.get('MC_METAL', 0.012, tag='Cases')
    for dx, dy, h in ((5.0, -2.25, 0.34), (5.3, -2.3, 0.28), (5.1, -2.2, 0.26)):
        cases.box(dx, dy, Z + (0.34 if h == 0.26 else 0), 0.42, 0.3, h)
    trolley = B.get('MC_METAL_DARK', 0.0, tag='Trolley')
    trolley.box(6.3, -1.9, Z + 0.1, 0.5, 0.4, 0.04)
    trolley.beam((6.05, -1.9, Z + 0.1), (6.0, -1.9, Z + 1.1), 0.04)
    for k in range(4):                                     # bollards guarding the bay
        B.get('MC_METAL_DARK', 0.0, tag='Bollards', sm=True).cyl(4.2, -2.6 + k * 0.9, Z, 0.09, 0.7, seg=12)

    # --------------------------------------------------------- THE FORECOURT
    walk = B.get('MC_CONCRETE', 0.0, tag='Walk')
    rect(walk, -0.8, 0.8, -7.1, -0.25, Z, 0.02)
    rect(walk, -3.2, 3.2, -3.1, -2.1, Z, 0.02)
    for cx_ in (-2.35, 2.35):
        pid = 0 if cx_ < 0 else 1
        slab('PS_Parterre%d' % pid, 2.3, 3.2, 0.3, Z, 0.08, mat('MC_GRASS'), coll, cx=cx_ - (0.6 if cx_ < 0 else -0.6),
             cy=-5.0, bevel=0.02)
        frame('PS_ParterreCurb%d' % pid, 2.54, 3.44, 0.42, 2.3, 3.2, 0.3, Z, 0.14, mat(ST), coll, bevel=0.012,
              cx=cx_ - (0.6 if cx_ < 0 else -0.6), cy=-5.0)
        px_ = cx_ - (0.6 if cx_ < 0 else -0.6)
        for sy in (-0.95, 0.95):
            B.get('MC_LEAF_DARK', 0.06, 3, tag='Topiary', sm=True).cyl(px_, -5.0 + sy, Z + 0.08, 0.32, 1.0, seg=16, radius2=0.03)
        B.get('MC_LEAF', 0.08, 3, tag='BoxBall', sm=True).sphere(px_, -5.0, Z + 0.42, 0.36, 0.36, 0.32, seg=14, rings=8)
    hedge(B, -6.9, -3.6, -1.1, 0.5)
    hedge(B, -3.0, -1.2, 0.05, 0.45)
    hedge(B, 1.2, 3.0, 0.05, 0.45)
    # urns either side of the steps
    for x in (-1.3, 1.3):
        B.get(ST, 0.0, tag='Urns', sm=True).cyl(x, -0.55, Z, 0.26, 0.2, seg=20)
        B.get(ST, 0.0, tag='Urns', sm=True).cyl(x, -0.55, Z + 0.2, 0.18, 0.4, seg=20, radius2=0.32)
        B.get('MC_LEAF_DARK', 0.0, tag='UrnLeaf', sm=True).sphere(x, -0.55, Z + 0.72, 0.3, 0.3, 0.24, seg=12, rings=8)
    # young trees in tubs along the east walk, planted a season apart
    for k, (y, s) in enumerate(((-4.7, 0.55), (-3.4, 0.7), (-2.1, 0.85))):
        B.get(GR, 0.02, tag='Tubs').box(3.2, y, Z, 0.7, 0.7, 0.4)
        tree(B, 3.2, y, s, pit=False, z=Z + 0.4)
    bench(B, -2.2, -3.55, along='x', back=-1)
    for x, y in ((-0.95, -6.3), (0.95, -6.3), (-3.4, -1.7), (3.9, -1.0)):
        lamp(B, x, y)
    tree(B, -6.2, -5.9, 1.0)
    tree(B, 6.2, -5.7, 0.95)
    tree(B, -6.3, 0.1, 0.85)
    # the street edge: stone posts and chain, open at the walk
    for x in (-6.9, -5.1, -3.3, -1.1, 1.1, 3.3):
        stone.box(x, -6.95, Z, 0.26, 0.26, 0.7)
    for x0, x1 in ((-6.9, -5.1), (-5.1, -3.3), (-3.3, -1.1), (1.1, 3.3)):
        B.get('MC_METAL_DARK', 0.0, tag='Chain').beam((x0, -6.95, Z + 0.55), (x1, -6.95, Z + 0.55), 0.03)
    B.finish()
    return B
