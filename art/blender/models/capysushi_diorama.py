"""Capy Sushi: a capybara sushi house — warm, tactile, cooking and serving.

The app is a warm little sushi game with a capybara in it. The place is a
tiny working restaurant, told by what is being made and served:
  - a timber-framed plaster house under a deep-eaved charcoal hip roof: the
    one pitched roof in the city, the silhouette you find Capy Sushi by, its
    ridge carrying the beacon
  - an open kitchen alcove on the street where the chef works behind a
    counter, a plate belt carrying sushi along it past the customers' stools
  - coral noren at the door, paper lanterns, a blank timber signboard
  - a timber terrace with round tables and stools under a lantern string
  - the back alley: the kitchen yard, crates of produce, a delivery scooter
  - a garden pond with stepping stones, where a capybara soaks with a yuzu
    on its head
No giant sushi, no stereotypes, no words: a restaurant somebody runs.

Its life (MC_LIFE, 60 s): the plates travel along the counter.

Deck top is z = 1.0, deck is 15.4 across; the camera sits at +x, -y.
"""
import math
import bpy
from mc_lib import MB, slab, frame, cut, mat, link, DECK_Z
from mc_kit import (Builders, rect, tree, planter, lamp, paver_joints, beacon, gable,
                    push_life, key, life_object, life_group)

ACCENT = 'MC_CS_CORAL'
Z = DECK_Z
PL, CO, CH, SA, W = 'MC_CS_PLASTER', 'MC_CS_CORAL', 'MC_CS_CHARCOAL', 'MC_CS_SALMON', 'MC_PAINT_WHITE'
TL = 'MC_CS_TILE'                                    # the roofs: matte fired tile
LIFE_FRAMES = 1440
BELT = (-4.2, -0.4)                                  # the counter belt runs along x between these
BELT_Y, BELT_Z = 1.72, 1.02 + 0.06                   # over the counter top
PITCH = 0.38                                         # one plate every PITCH along the belt
CYCLE = 96                                           # frames to travel one pitch (4 s)

WORKERS = [
    ('chef',      (-2.35, 3.1, Z + 0.3), 180, 'WORKING', None, 'cs_chef'),
    ('server',    (-4.35, -1.75, Z + 0.12), 230, 'IDLE', 'tray', 'cs_crew'),
    ('prep',      (4.55, 2.25, 1.0), 200, 'REPAIR', None, 'cs_crew'),
    ('rider',     (5.9, 0.35, 1.0), 250, 'IDLE', None, 'cs_crew'),
    ('host',      (0.35, 0.6, 1.0), 215, 'SIGNAL', None, 'cs_crew'),
]


def lantern(B, x, y, z, s=1.0):
    """A paper lantern: a glowing barrel between two dark caps."""
    B.get('MC_GLASS_LIT', 0.0, tag='Lanterns', sm=True).sphere(x, y, z, 0.16 * s, 0.16 * s, 0.22 * s, seg=14, rings=8)
    caps = B.get(CH, 0.0, tag='LanternCaps', sm=True)
    caps.cyl(x, y, z + 0.18 * s, 0.09 * s, 0.05 * s, seg=12)
    caps.cyl(x, y, z - 0.23 * s, 0.09 * s, 0.05 * s, seg=12)


def build(coll, status_coll):
    B = Builders(coll, 'CS')
    glass, lit = B.get('MC_GLASS', 0.0, tag='Panes'), B.get('MC_GLASS_LIT', 0.0, tag='Panes')
    paver_joints(B, -7.2, 7.2, -7.2, 7.2, 1.44)
    timber = B.get('MC_WOOD_DARK', 0.015, tag='Timbers')

    # ------------------------------------------------------------ THE HOUSE
    hx0, hx1, hy0, hy1, hh = -6.5, 0.9, 2.6, 6.4, 3.1
    cxh, cyh = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    B.get('MC_CONCRETE_DK', 0.02, tag='Base').box(cxh, cyh, Z, hx1 - hx0 + 0.14, hy1 - hy0 + 0.14, 0.3)
    body = MB('CS_HouseBody', mat(PL), coll, bevel=0.03, seg=2)
    rect(body, hx0, hx1, hy0, hy1, Z + 0.3, hh - 0.3)
    house = body.done()
    door_x = -5.45
    alcove = (-4.35, -0.3)                                                     # the open kitchen
    cut(house, [(door_x, hy0 + 0.2, Z + 0.3, 1.0, 0.5, 1.95),
                ((alcove[0] + alcove[1]) / 2, hy0 + 0.75, Z + 0.3, alcove[1] - alcove[0], 1.6, 2.05)])
    link(house, coll)
    # the timber frame over the plaster: posts, a tie beam, a sill beam
    for x in (hx0, door_x - 0.62, door_x + 0.62, alcove[0] - 0.08, alcove[1] + 0.08, hx1):
        timber.box(x, hy0 - 0.03, Z + 0.3, 0.16, 0.12, hh - 0.3)
    timber.box(cxh, hy0 - 0.03, Z + 2.35, hx1 - hx0 + 0.1, 0.12, 0.14)
    timber.box(cxh, hy0 - 0.03, Z + hh - 0.14, hx1 - hx0 + 0.1, 0.12, 0.14)
    for y in (hy0 + 1.3, hy0 + 2.6, hy1):
        timber.box(hx1 + 0.03, y, Z + 0.3, 0.12, 0.16, hh - 0.3)
    timber.box(hx1 + 0.03, cyh, Z + 2.35, 0.12, hy1 - hy0 + 0.1, 0.14)
    # the side window on the +x end
    rect(lit, hx1 + 0.01, hx1 + 0.05, 3.5, 4.4, Z + 1.0, 1.0)
    for k in range(4):
        timber.box(hx1 + 0.06, 3.5 + k * 0.3, Z + 1.0, 0.04, 0.04, 1.0)
    # the kitchen alcove: a lit back wall, shelves, a prep counter, the street counter and the belt
    ax0, ax1 = alcove
    rect(B.get('MC_GLASS_LIT', 0.0, tag='KitchenGlow'), ax0 + 0.1, ax1 - 0.1, hy0 + 1.5, hy0 + 1.54, Z + 0.3, 2.0)
    shelf = B.get('MC_WOOD', 0.01, tag='Shelves')
    for z in (Z + 1.6, Z + 1.95):
        shelf.box((ax0 + ax1) / 2, hy0 + 1.42, z, ax1 - ax0 - 0.3, 0.2, 0.04)
    for k in range(7):
        B.get(W if k % 2 else CO, 0.0, tag='Bowls', sm=True).sphere(ax0 + 0.4 + k * 0.52, hy0 + 1.42, Z + 1.7, 0.08, 0.08, 0.06, seg=10, rings=6)
    B.get('MC_WOOD', 0.02, tag='PrepCounter').box((ax0 + ax1) / 2, hy0 + 1.05, Z + 0.3, ax1 - ax0 - 0.4, 0.5, 0.78)
    B.get('MC_METAL', 0.0, tag='PrepTop').box((ax0 + ax1) / 2, hy0 + 1.05, Z + 1.08, ax1 - ax0 - 0.4, 0.5, 0.03)
    for k, c in enumerate((SA, W, 'MC_LEAF', CO)):                             # what is being prepared
        B.get(c, 0.0, tag='Prep', sm=True).sphere(ax0 + 0.8 + k * 0.7, hy0 + 1.05, Z + 1.15, 0.11, 0.09, 0.05, seg=10, rings=6)
    ctr = B.get('MC_WOOD', 0.02, tag='StreetCounter')
    ctr.box((ax0 + ax1) / 2, BELT_Y, Z + 0.0, ax1 - ax0 + 0.2, 0.62, 1.02)
    B.get('MC_WOOD_DARK', 0.0, tag='CounterFace').box((ax0 + ax1) / 2, BELT_Y - 0.32, Z + 0.1, ax1 - ax0 + 0.16, 0.03, 0.8)
    B.get('MC_METAL_DARK', 0.0, tag='Belt').box((BELT[0] + BELT[1]) / 2, BELT_Y, Z + 1.02, BELT[1] - BELT[0] + 0.3, 0.34, 0.06)
    for x in BELT:                                                           # the hoods at each end the plates pass under
        B.get(PL, 0.02, tag='BeltHoods').box(x + (-0.12 if x == BELT[0] else 0.12), BELT_Y, Z + 1.02, 0.46, 0.5, 0.4)
    stools = B.get(CO, 0.0, tag='Stools', sm=True)
    for k in range(5):
        x = ax0 + 0.45 + k * 0.8
        stools.cyl(x, BELT_Y - 0.72, Z + 0.62, 0.18, 0.08, seg=16)
        B.get('MC_METAL_DARK', 0.0, tag='StoolLegs', sm=True).cyl(x, BELT_Y - 0.72, Z, 0.04, 0.62, seg=8)
    # the plates: one object travelling one pitch and back to the start, over and over
    def plates(col, top):
        def build_(b):
            n = int((BELT[1] - BELT[0]) / PITCH) + 1
            for k in range(n):
                x = BELT[0] + k * PITCH
                if top:
                    kind = k % 3
                    if kind == 0:
                        b.box(x, 0, 0.035, 0.16, 0.08, 0.05)
                    elif kind == 1:
                        b.cyl(x - 0.04, 0, 0.035, 0.05, 0.06, seg=10)
                        b.cyl(x + 0.05, 0, 0.035, 0.05, 0.06, seg=10)
                    else:
                        b.box(x, 0, 0.035, 0.18, 0.09, 0.045)
                else:
                    b.cyl(x, 0, 0.0, 0.13, 0.035, seg=16)
        return build_
    tray = life_group('CS_Plates', [(W, plates(W, False)), (SA, plates(SA, True))], coll, (0, BELT_Y, BELT_Z))
    frames = []
    f = 1
    while f <= LIFE_FRAMES + 1:
        frames += [(f, (0, BELT_Y, BELT_Z)), (min(f + CYCLE - 1, LIFE_FRAMES + 1), (PITCH * (CYCLE - 1) / CYCLE, BELT_Y, BELT_Z))]
        f += CYCLE
    key(tray, 'location', frames)
    push_life(tray)
    # the door and its noren, the signboard, lanterns
    B.get('MC_WOOD_DARK', 0.015, tag='Door').box(door_x, hy0 + 0.4, Z + 0.3, 0.86, 0.06, 1.9)
    timber.box(door_x, hy0 - 0.12, Z + 2.02, 1.3, 0.08, 0.08)
    for k in range(3):
        B.get(CO, 0.0, tag='Noren').box(door_x - 0.34 + k * 0.34, hy0 - 0.14, Z + 1.38, 0.31, 0.03, 0.64)
    B.get('MC_WOOD', 0.02, tag='Signboard').box(-2.3, hy0 - 0.09, Z + 2.52, 2.6, 0.1, 0.44)
    B.get(CO, 0.0, tag='SignBorder').box(-2.3, hy0 - 0.15, Z + 2.56, 2.36, 0.02, 0.06)
    for x in (door_x - 0.75, door_x + 0.75, ax1 + 0.35):
        lantern(B, x, hy0 - 0.35, Z + 2.2)
    # a fabric awning over the counter, and the deep hip roof
    gable(B.get(CO, 0.02, tag='Awning'), ax0 - 0.15, ax1 + 0.15, hy0 - 0.85, hy0 + 0.85, Z + 2.28, 0.3)
    roof = B.get(TL, 0.03, tag='Roof')
    roof.box(cxh, cyh, Z + hh, hx1 - hx0 + 1.5, hy1 - hy0 + 1.5, 1.9, taper=0.34)
    B.get('MC_WOOD', 0.0, tag='Fascia').box(cxh, cyh, Z + hh - 0.08, hx1 - hx0 + 1.56, hy1 - hy0 + 1.56, 0.1)
    B.get(TL, 0.02, tag='Ridge').box(cxh, cyh, Z + hh + 1.9, (hx1 - hx0 + 1.5) * 0.34 + 0.9, 0.3, 0.2)
    for sx in (-1, 1):                                                        # the ridge's upturned ends
        B.get(TL, 0.02, tag='RidgeEnds').box(cxh + sx * ((hx1 - hx0 + 1.5) * 0.17 + 0.45), cyh, Z + hh + 1.95, 0.2, 0.34, 0.3)
    # tile courses on the front slope
    fy0, fy1 = hy0 - 0.75, cyh - (hy1 - hy0 + 1.5) * 0.17
    for t in (0.2, 0.4, 0.6, 0.8):
        y = fy0 + (fy1 - fy0) * t
        w_ = (hx1 - hx0 + 1.5) * (1 - 0.66 * t)
        B.get(TL, 0.0, tag='TileCourses').box(cxh, y, Z + hh + 1.9 * t - 0.01, w_, 0.05, 0.05)
    beacon(B, status_coll, 'CS', cxh, cyh, Z + hh + 2.1, r=0.24)

    # ------------------------------------------------------ THE KITCHEN YARD
    kx0, kx1, ky0, ky1 = 2.4, 6.6, 3.8, 6.4
    B.get(PL, 0.03, tag='Kitchen').box((kx0 + kx1) / 2, (ky0 + ky1) / 2, Z, kx1 - kx0, ky1 - ky0, 2.2)
    B.get(TL, 0.03, tag='KitchenRoof').box((kx0 + kx1) / 2, (ky0 + ky1) / 2, Z + 2.2, kx1 - kx0 + 0.8, ky1 - ky0 + 0.8, 0.9, taper=0.4)
    B.get('MC_WOOD_DARK', 0.015, tag='BackDoor').box(3.4, ky0 - 0.03, Z, 0.8, 0.06, 1.8)
    rect(lit, 4.5, 5.9, ky0 - 0.04, ky0, Z + 1.0, 0.7)
    B.get('MC_METAL', 0.02, tag='Vent').box(5.8, 5.3, Z + 2.6, 0.5, 0.5, 0.7)
    B.get('MC_METAL_DARK', 0.0, tag='VentCap').box(5.8, 5.3, Z + 3.3, 0.7, 0.7, 0.08)
    crate = B.get('MC_WOOD', 0.02, tag='Crates')
    for dx, dy, z in ((4.0, 2.9, 0), (4.5, 2.95, 0), (4.25, 2.95, 0.36), (5.1, 3.05, 0)):
        crate.box(dx, dy, Z + z, 0.44, 0.4, 0.34)
    for k, (dx, c) in enumerate(((4.0, 'MC_LEAF'), (4.5, CO), (5.1, 'MC_SK_YELLOW'))):
        for j in range(3):
            B.get(c, 0.0, tag='Produce', sm=True).sphere(dx - 0.12 + j * 0.12, 2.9 + 0.05 * (j % 2), Z + 0.39, 0.07, 0.07, 0.06, seg=8, rings=6)
    for k in range(2):
        B.get('MC_METAL_DARK', 0.02, tag='Bins').box(6.35, 2.9 + k * 0.6, Z, 0.5, 0.5, 0.75)
    # the delivery scooter, its box on the back
    sx, sy = 5.95, 1.15
    sc = B.get(CO, 0.03, tag='Scooter')
    sc.box(sx, sy, Z + 0.28, 0.36, 1.0, 0.22)
    sc.beam((sx, sy - 0.42, Z + 0.45), (sx, sy - 0.55, Z + 1.0), 0.12)
    B.get('MC_METAL_DARK', 0.0, tag='Bars').box(sx, sy - 0.55, Z + 1.0, 0.6, 0.05, 0.05)
    B.get(W, 0.02, tag='DeliveryBox').box(sx, sy + 0.32, Z + 0.52, 0.5, 0.5, 0.45)
    for dy in (-0.45, 0.42):
        B.get('MC_METAL_DARK', 0.0, tag='Wheels', sm=True).cyl(sx, sy + dy, Z + 0.2, 0.2, 0.1, seg=16, axis='X')

    # ----------------------------------------------------------- THE TERRACE
    tx0, tx1, ty0, ty1 = -6.7, -1.6, -4.3, 0.4
    slab('CS_Terrace', tx1 - tx0, ty1 - ty0, 0.2, Z, 0.12, mat('MC_WOOD'), coll, cx=(tx0 + tx1) / 2, cy=(ty0 + ty1) / 2, bevel=0.015)
    bd = B.get('MC_WOOD_DARK', 0.0, tag='Boards')
    x = tx0 + 0.35
    while x < tx1 - 0.2:
        rect(bd, x - 0.01, x + 0.01, ty0 + 0.1, ty1 - 0.1, Z + 0.12, 0.006)
        x += 0.35
    for cx_, cy_ in ((-5.5, -2.6), (-3.2, -3.1), (-3.0, -0.7)):
        B.get('MC_WOOD', 0.0, tag='Tables', sm=True).cyl(cx_, cy_, Z + 0.82, 0.48, 0.06, seg=24)
        B.get('MC_METAL_DARK', 0.0, tag='TableStems', sm=True).cyl(cx_, cy_, Z + 0.12, 0.05, 0.7, seg=10)
        B.get(W, 0.0, tag='TableSet', sm=True).cyl(cx_ + 0.15, cy_ - 0.1, Z + 0.88, 0.13, 0.03, seg=14)
        B.get(SA, 0.0, tag='TableFood').box(cx_ + 0.15, cy_ - 0.1, Z + 0.91, 0.14, 0.06, 0.04)
        for a in (30, 150, 270):
            r_ = math.radians(a)
            stools.cyl(cx_ + 0.72 * math.cos(r_), cy_ + 0.72 * math.sin(r_), Z + 0.55, 0.17, 0.07, seg=14)
            B.get('MC_METAL_DARK', 0.0, tag='StoolLegs', sm=True).cyl(cx_ + 0.72 * math.cos(r_), cy_ + 0.72 * math.sin(r_),
                                                                     Z + 0.12, 0.035, 0.43, seg=8)
    # the lantern string over the terrace on two posts
    for p0 in ((tx0 + 0.2, ty0 + 0.2), (tx1 - 0.2, ty1 - 0.4)):
        timber.box(p0[0], p0[1], Z + 0.12, 0.14, 0.14, 2.6)
    a0, a1 = (tx0 + 0.2, ty0 + 0.2, Z + 2.66), (tx1 - 0.2, ty1 - 0.4, Z + 2.66)
    B.get('MC_METAL_DARK', 0.0, tag='Wire').beam(a0, a1, 0.02)
    for k in range(1, 6):
        t = k / 6
        lantern(B, a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t, Z + 2.4 - 0.1 * math.sin(math.pi * t), 0.8)
    for x in (tx0 + 0.4, tx1 - 0.35):                                          # bamboo in tubs
        B.get('MC_WOOD_DARK', 0.02, tag='Tubs').box(x, ty1 - 0.3, Z + 0.12, 0.5, 0.5, 0.4)
        for j in range(4):
            B.get('MC_LEAF', 0.0, tag='Bamboo', sm=True).cyl(x - 0.12 + (j % 2) * 0.24, ty1 - 0.42 + (j // 2) * 0.24,
                                                             Z + 0.52, 0.035, 1.4 + 0.3 * (j % 3), seg=8)
            B.get('MC_LEAF_DARK', 0.0, tag='BambooLeaf', sm=True).sphere(x - 0.12 + (j % 2) * 0.24, ty1 - 0.42 + (j // 2) * 0.24,
                                                                         Z + 1.9 + 0.3 * (j % 3), 0.2, 0.2, 0.3, seg=10, rings=6)

    # ------------------------------------------------------ THE GARDEN POND
    gx, gy = 3.4, -3.9
    slab('CS_Pond', 4.0, 2.8, 1.3, Z, 0.05, mat('MC_GLASS'), coll, cx=gx, cy=gy, bevel=0.0, n=8)
    frame('CS_PondRim', 4.4, 3.2, 1.5, 4.0, 2.8, 1.3, Z, 0.16, mat('MC_CONCRETE_DK'), coll, bevel=0.02, n=8, cx=gx, cy=gy)
    for dx, dy, r in ((-2.1, 0.9, 0.24), (-2.3, 1.7, 0.2), (-1.6, 2.4, 0.22), (1.9, -1.4, 0.2)):
        B.get('MC_CONCRETE', 0.0, tag='SteppingStones', sm=True).cyl(gx + dx, gy + dy, Z, r, 0.05, seg=14)
    # the capybara, soaking to the shoulders, a yuzu on its head
    cp = B.get('MC_CS_CAPY', 0.0, tag='Capybara', sm=True)
    cxp, cyp = gx + 0.45, gy + 0.2
    cp.sphere(cxp, cyp, Z + 0.14, 0.55, 0.39, 0.34, seg=18, rings=10)
    cp.sphere(cxp - 0.47, cyp - 0.08, Z + 0.39, 0.26, 0.22, 0.23, seg=16, rings=10)
    cp.box(cxp - 0.68, cyp - 0.14, Z + 0.28, 0.21, 0.26, 0.18)
    for dy in (-0.09, 0.09):
        cp.sphere(cxp - 0.37, cyp - 0.08 + dy * 1.3, Z + 0.6, 0.05, 0.05, 0.04, seg=8, rings=5)
    for dy in (-0.07, 0.07):
        B.get(CH, 0.0, tag='CapyEyes', sm=True).sphere(cxp - 0.62, cyp - 0.08 + dy * 1.3, Z + 0.5, 0.028, 0.028, 0.028, seg=8, rings=5)
    B.get('MC_SK_YELLOW', 0.0, tag='Yuzu', sm=True).sphere(cxp - 0.44, cyp - 0.08, Z + 0.68, 0.1, 0.1, 0.09, seg=12, rings=8)
    # a stone lantern and a low bamboo fence
    stl = B.get('MC_CONCRETE', 0.02, tag='StoneLantern')
    stl.box(gx + 1.95, gy + 1.05, Z, 0.34, 0.34, 0.5)
    stl.box(gx + 1.95, gy + 1.05, Z + 0.5, 0.5, 0.5, 0.25)
    B.get('MC_GLASS_LIT', 0.0, tag='StoneLanternGlow').box(gx + 1.95, gy + 1.05, Z + 0.55, 0.3, 0.3, 0.14)
    stl.box(gx + 1.95, gy + 1.05, Z + 0.75, 0.62, 0.62, 0.12, taper=0.5)
    for k in range(18):
        B.get('MC_WOOD', 0.0, tag='Fence', sm=True).cyl(1.3 + k * 0.32, -6.85, Z, 0.045, 0.72 + 0.08 * (k % 2), seg=8)
    B.get('MC_WOOD_DARK', 0.0, tag='FenceRail').box(4.1, -6.85, Z + 0.5, 5.8, 0.06, 0.05)
    tree(B, 5.6, -2.3, 0.85)
    tree(B, 1.6, -2.6, 0.7)
    # the path from the street to the door, in stepping stones
    for i, (x, y) in enumerate(((-0.6, -6.5), (-0.9, -5.6), (-0.7, -4.7), (-1.0, -3.8), (-0.8, -2.8),
                                (-1.1, -1.8), (-1.6, -0.9), (-2.4, -0.1), (-3.6, 0.5), (-4.7, 1.0))):
        B.get('MC_CONCRETE', 0.0, tag='PathStones', sm=True).cyl(x, y, Z, 0.34 if i % 2 else 0.3, 0.04, seg=16)
    planter(B, 1.6, 1.6, 0.9, 0.42)
    for x, y in ((0.9, -5.2), (6.6, -5.6), (-6.9, 1.2)):
        lamp(B, x, y)
    B.finish()
    return B
