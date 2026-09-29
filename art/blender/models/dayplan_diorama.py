"""DayPlan: an operations and dispatch centre for the day's schedule.

What am I doing now, and what comes next? The place answers in architecture,
not in a phone screen:
  - a graphite dispatch hall: a loading dock with roller-door bays below and
    a long control-room window ribbon above, its mullions ticking like a
    timeline, under a rose canopy
  - a clock tower rising out of its end, with a balcony, two clock faces and
    a rose crown carrying the status beacon: the silhouette you find DayPlan
    by from the overview
  - the timeline walk: a stone strip across the plaza divided into hours,
    carrying rose blocks (fixed events) and softer stone blocks (flexible
    tasks), and a lit Now gate that travels along it
  - a schedule board, parcel lockers, a service shed and a rooftop time-ball
    mast: dispatch, coordination and time
Signage is blank geometry, never words.

Its life (MC_LIFE, one 60 second clip on its own objects): the clocks'
second hands sweep, the Now gate walks the timeline, the time ball rises and
drops. It plays only while the project is known to be under way.

Deck top is z = 1.0, deck is 15.4 across; the camera sits at +x, -y.
"""
import math
import bpy
from mc_lib import MB, slab, frame, cut, mat, link, DECK_Z
from mc_kit import Builders, rect, tree, planter, lamp, window_dressing, cone, cart, totem, paver_joints

ACCENT = 'MC_DP_ROSE'
Z = DECK_Z
G, ST, R, RD, W = 'MC_DP_GRAPHITE', 'MC_DP_STONE', 'MC_DP_ROSE', 'MC_DP_ROSE_DK', 'MC_PAINT_WHITE'
LIFE_FRAMES = 1440                                   # 60 s at 24 frames a second

# where (feet), facing (degrees about Z; 225 faces the camera, 270 faces +x),
# pose, prop, outfit. The courier runs, so it is set 0.075 lower: its leading
# foot, not its hip, meets the paving.
WORKERS = [
    ('dispatcher',  (1.2, -0.4, 1.0), 200, 'WORKING', 'tablet', 'dp_crew'),
    ('signaller',   (5.0, -3.15, 1.0), 210, 'SIGNAL', None, 'dp_crew'),
    ('courier',     (0.35, -3.05, 0.925), 270, 'ACTIVE', None, 'dp_crew'),
    ('tech',        (2.15, 2.86, 5.42), 0, 'REPAIR', 'wrench', 'dp_tech'),
    ('coordinator', (-2.2, 0.5, 1.0), 215, 'IDLE', 'clipboard', 'dp_crew'),
]


# ---------------------------------------------------------------- life
def _push_life(o):
    """The object's keys become its part of the MC_LIFE clip, linear."""
    ad = o.animation_data
    act = ad.action
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    for k in fc.keyframe_points:
                        k.interpolation = 'LINEAR'
    tr = ad.nla_tracks.new()
    tr.name = 'MC_LIFE'
    st = tr.strips.new('MC_LIFE', 1, act)
    st.name = 'MC_LIFE'
    ad.action = None
    o['mc_life'] = True
    return o


def _key(o, prop, frames):
    for f, v in frames:
        setattr(o, prop, v)
        o.keyframe_insert(prop, frame=f)


def _life_object(name, material, coll, build, at, bevel=0.0):
    b = MB(name, mat(material), coll, bevel=bevel, smooth_=bevel == 0.0 and None)
    build(b)
    o = b.done()
    o.location = at
    return o


# ---------------------------------------------------------------- parts
def clock_face(B, coll, cx, cy, cz, face):
    """A face on the -y or +x wall: stone ring, rose band, white dial, hour
    marks, hands at ten past ten, and a second hand that is life."""
    ax = 'Y' if face == '-y' else 'X'
    out = -1 if face == '-y' else 1

    def disc(m, r, h, tag):
        if face == '-y':
            B.get(m, 0.0, tag=tag, sm=True).cyl(cx, cy, cz, r, h, seg=40, axis=ax)
        else:
            B.get(m, 0.0, tag=tag, sm=True).cyl(cx, cy, cz, r, h, seg=40, axis=ax)
    disc(ST, 0.86, 0.04, 'ClockRing')
    disc(R, 0.77, 0.06, 'ClockBand')
    disc(W, 0.71, 0.075, 'ClockDial')
    front = 0.085
    mk = B.get('MC_PLINTH_DK', 0.0, tag='ClockMarks')
    for i in range(12):
        a = math.radians(90 - i * 30)
        s = 0.1 if i % 3 == 0 else 0.06
        u, v = 0.58 * math.cos(a), 0.58 * math.sin(a)
        if face == '-y':
            mk.box(cx + u, cy - front, cz + v - s / 2, s, 0.02, s)
        else:
            mk.box(cx + front, cy - u, cz + v - s / 2, 0.02, s, s)
    hands = B.get('MC_METAL_DARK', 0.0, tag='ClockHands')

    def at(u, v, d):
        return (cx + u, cy - d, cz + v) if face == '-y' else (cx + d, cy - u, cz + v)
    for ang, length, w in ((math.radians(90 + 60), 0.38, 0.07), (math.radians(90 - 60), 0.55, 0.05)):
        hands.beam(at(0, 0, front + 0.01), at(length * math.cos(ang), length * math.sin(ang), front + 0.01), w, 0.02)
    B.get('MC_METAL_DARK', 0.0, tag='ClockHands', sm=True).cyl(*at(0, 0, 0), 0.05, front + 0.03, seg=12, axis=ax)

    def second(b):
        b.beam((0, 0, -0.12), (0, 0, 0.62), 0.022, 0.012)
    hand = _life_object('DP_SecondHand_' + ('Front' if face == '-y' else 'Side'), RD, coll, second,
                        at(0, 0, front + 0.035))
    _key(hand, 'rotation_euler', [(1, (0, 0, 0)), (LIFE_FRAMES + 1, (0, 2 * math.pi, 0) if face == '-y' else (-2 * math.pi, 0, 0))])
    return _push_life(hand)


def build(coll, status_coll):
    B = Builders(coll, 'DP')
    glass, lit = B.get('MC_GLASS', 0.0, tag='Panes'), B.get('MC_GLASS_LIT', 0.0, tag='Panes')
    paver_joints(B, -7.2, 7.2, -7.2, 7.2, 1.44)

    # ------------------------------------------------------------ THE HALL
    hx0, hx1, hy0, hy1, hh = -6.6, 1.2, 2.8, 6.6, 3.9
    body = MB('DP_HallBody', mat(G), coll, bevel=0.04, seg=2)
    rect(body, hx0, hx1, hy0, hy1, Z + 0.32, hh - 0.32)
    hall = body.done()
    bays = (-5.2, -3.2, -1.2)
    cutters = [(x, hy0 + 0.2, Z + 0.32, 1.5, 0.45, 1.75) for x in bays]
    rib0, rib1 = hx0 + 0.45, hx1 - 0.45
    cutters.append(((rib0 + rib1) / 2, hy0 + 0.12, Z + 2.45, rib1 - rib0, 0.3, 0.95))       # control-room ribbon
    cutters.append((0.55, hy0 + 0.15, Z + 0.32, 0.8, 0.4, 1.7))                              # the people's door
    cut(hall, cutters)
    link(hall, coll)
    stone = B.get(ST, 0.03, tag='Stone')
    cxh, cyh = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    stone.box(cxh, cyh, Z, hx1 - hx0 + 0.16, hy1 - hy0 + 0.16, 0.32)                          # base course
    stone.box(cxh, cyh, Z + 2.18, hx1 - hx0 + 0.1, hy1 - hy0 + 0.1, 0.12)                     # string course
    stone.box(cxh, cyh, Z + hh - 0.2, hx1 - hx0 + 0.26, hy1 - hy0 + 0.26, 0.22)               # cornice
    for x in (hx0 + 0.2, -4.2, -2.2, -0.2):                                                  # pilasters between the bays
        stone.box(x, hy0 - 0.03, Z + 0.32, 0.3, 0.1, 1.86)
    # the ribbon: a sill, a lintel, stone mullions ticking along it, panes behind
    stone.box((rib0 + rib1) / 2, hy0 - 0.1, Z + 2.33, rib1 - rib0 + 0.3, 0.26, 0.1)
    stone.box((rib0 + rib1) / 2, hy0 - 0.03, Z + 3.42, rib1 - rib0 + 0.2, 0.12, 0.1)
    n = 9
    for i in range(n + 1):
        x = rib0 + (rib1 - rib0) * i / n
        stone.box(x, hy0 + 0.02, Z + 2.43, 0.07, 0.1, 0.99)
    for i in range(n):
        x0, x1 = rib0 + (rib1 - rib0) * i / n, rib0 + (rib1 - rib0) * (i + 1) / n
        rect(lit if i in (2, 3, 6) else glass, x0 + 0.03, x1 - 0.03, hy0 + 0.2, hy0 + 0.24, Z + 2.45, 0.93)
    # the bays: two rose roller doors, and one open on a lit hall of parcels
    door = B.get(R, 0.01, tag='RollerDoor')
    slat = B.get(RD, 0.0, tag='RollerSlats')
    for x in (bays[0], bays[2]):
        door.box(x, hy0 + 0.33, Z + 0.32, 1.46, 0.05, 1.72)
        for k in range(11):
            slat.box(x, hy0 + 0.3, Z + 0.45 + k * 0.145, 1.44, 0.012, 0.022)
    rect(B.get('MC_GLASS_LIT', 0.0, tag='BayGlow'), bays[1] - 0.72, bays[1] + 0.72, hy0 + 0.4, hy0 + 0.43, Z + 0.34, 1.68)
    crates = B.get('MC_WOOD', 0.02, tag='Parcels')
    for dx, dy, s, h in ((-0.35, 0.3, 0.42, 0.42), (0.15, 0.32, 0.38, 0.38), (-0.2, 0.3, 0.34, 0.34)):
        crates.box(bays[1] + dx, hy0 + dy, Z + 0.32 + (0.42 if h == 0.34 else 0), s, s, h)
    B.get('MC_PLINTH_DK', 0.02, tag='Door').box(0.55, hy0 + 0.3, Z + 0.34, 0.66, 0.06, 1.62)
    stone.box(0.55, hy0 - 0.02, Z + 2.02, 1.1, 0.14, 0.12)
    # the loading dock under the canopy, its bumpers, steps at its end
    dock = B.get(ST, 0.025, tag='Dock')
    dock.box((hx0 + 0.3 - 0.2) / 2 + 0.0, hy0 - 0.45, Z, -0.2 - (hx0 + 0.3), 0.9, 0.32)
    bump = B.get('MC_PLINTH_DK', 0.015, tag='Bumpers')
    for x in bays:
        for s in (-0.85, 0.85):
            bump.box(x + s, hy0 - 0.93, Z + 0.06, 0.12, 0.06, 0.2)
    rect(B.get(RD, 0.0, tag='DockEdge'), hx0 + 0.3, -0.2, hy0 - 0.92, hy0 - 0.86, Z + 0.32, 0.012)
    steps = B.get(ST, 0.015, tag='Steps')
    for i, (h_, d_) in enumerate(((0.11, 0.9), (0.22, 0.6))):
        steps.box(-0.2 + d_ / 2, hy0 - 0.45, Z, d_, 0.9, h_)
    rect(B.get('MC_METAL_DARK', 0.0, tag='Drain'), hx0 + 0.3, 0.8, hy0 - 1.12, hy0 - 1.0, Z, 0.012)
    # departure lanes: each bay's lane runs down to the timeline
    rect(B.get('MC_CONCRETE_DK', 0.0, tag='Apron'), hx0 + 0.3, -0.2, -1.3, hy0 - 1.15, Z, 0.01)
    lane = B.get(ST, 0.0, tag='LaneLines')
    for x in bays:
        for s in (-0.78, 0.78):
            rect(lane, x + s - 0.03, x + s + 0.03, -1.28, hy0 - 1.17, Z + 0.01, 0.008)
        for k in range(3):
            y = -0.9 + k * 0.8
            B.get(R, 0.0, tag='LaneArrows').prism([(x - 0.22, y + 0.3), (x + 0.22, y + 0.3), (x, y)], Z + 0.01, 0.01)
    # the canopy, hung from the wall on rods
    canopy = B.get(R, 0.03, tag='Canopy')
    rect(canopy, hx0 + 0.15, 0.1, hy0 - 1.3, hy0, Z + 2.12, 0.12)
    rect(B.get(G, 0.015, tag='CanopyFascia'), hx0 + 0.15, 0.1, hy0 - 1.34, hy0 - 1.26, Z + 2.04, 0.1)
    rods = B.get('MC_METAL_DARK', 0.0, tag='Rods')
    for x in (-6.0, -4.2, -2.2, -0.3):
        rods.beam((x, hy0 - 1.2, Z + 2.24), (x, hy0 - 0.02, Z + 3.2), 0.035)
    # rainwater at the corners
    dp = B.get('MC_METAL_DARK', 0.0, tag='Downpipes', sm=True)
    for px_, py_ in ((hx0 + 0.2, hy0 - 0.08), (hx1 - 0.15, hy1 + 0.02)):
        dp.cyl(px_, py_, Z + 0.34, 0.055, hh - 0.52, seg=10)
        dp.cyl(px_, py_, Z + 0.32, 0.075, 0.1, seg=10)
    # the roof: parapet, slab, plant, a time-ball mast and a time-signal mast
    frame('DP_Parapet', hx1 - hx0 - 0.1, hy1 - hy0 - 0.1, 0.3, hx1 - hx0 - 0.5, hy1 - hy0 - 0.5, 0.15,
          Z + hh, 0.36, mat(ST), coll, bevel=0.03, cx=cxh, cy=cyh)
    slab('DP_RoofFloor', hx1 - hx0 - 0.4, hy1 - hy0 - 0.4, 0.2, Z + hh - 0.02, 0.12, mat(G), coll,
         cx=cxh, cy=cyh, bevel=0.02)
    rz = Z + hh + 0.1
    plant = B.get('MC_METAL', 0.02, tag='RoofPlant')
    rect(plant, -6.0, -4.9, 4.9, 5.9, rz, 0.55)
    B.get('MC_METAL_DARK', 0.0, tag='Fans', sm=True).cyl(-5.45, 5.4, rz + 0.55, 0.3, 0.03, seg=20)
    # six rooflights in a row: the day's blocks again, seen from above
    for i in range(6):
        x0 = -4.35 + i * 0.62
        rect(B.get(R, 0.015, tag='SkylightFrames'), x0, x0 + 0.5, 3.6, 4.5, rz, 0.12)
        rect(B.get('MC_GLASS_LIT' if i == 2 else 'MC_GLASS', 0.0, tag='Skylights'), x0 + 0.06, x0 + 0.44, 3.66, 4.44, rz + 0.12, 0.03)
    mast = B.get('MC_METAL_DARK', 0.01, tag='Mast', sm=True)
    mast.cyl(-0.9, 5.6, rz, 0.05, 2.3, seg=10)
    B.get('MC_METAL_DARK', 0.01, tag='MastArm').box(-0.9, 5.6, rz + 2.28, 0.6, 0.06, 0.06)
    B.get(ST, 0.01, tag='MastFoot').box(-0.9, 5.6, rz, 0.4, 0.4, 0.12)

    def ball(b):
        b.sphere(0, 0, 0, 0.2, 0.2, 0.2, seg=16, rings=10)
    tb = _life_object('DP_TimeBall', R, coll, ball, (-0.9, 5.6, rz + 0.55))
    _key(tb, 'location', [(1, (-0.9, 5.6, rz + 0.55)), (1200, (-0.9, 5.6, rz + 2.0)),
                          (1230, (-0.9, 5.6, rz + 0.55)), (LIFE_FRAMES + 1, (-0.9, 5.6, rz + 0.55))])
    _push_life(tb)
    ant = B.get(W, 0.0, tag='Antenna', sm=True)
    ant.cyl(0.3, 6.0, rz, 0.03, 1.2, seg=8)
    B.get('MC_METAL', 0.0, tag='Dish', sm=True).cyl(0.3, 5.7, rz + 0.6, 0.22, 0.05, seg=16, radius2=0.12, axis='Y')

    # ----------------------------------------------------------- THE TOWER
    tx0, tx1, ty0, ty1 = 1.6, 4.0, 3.2, 5.6
    tcx, tcy = (tx0 + tx1) / 2, (ty0 + ty1) / 2
    shaft = MB('DP_TowerShaft', mat(G), coll, bevel=0.04, seg=2)
    rect(shaft, tx0, tx1, ty0, ty1, Z + 0.32, 4.7)
    tower = shaft.done()
    cut(tower, [(tcx, ty0 + 0.15, Z + 0.32, 0.9, 0.4, 1.75),                 # its door
                (tcx, ty0 + 0.12, Z + 2.3, 0.34, 0.3, 1.3),                  # a slit window
                (tx1 - 0.12, tcy, Z + 1.6, 0.3, 0.34, 1.6)])                 # and one on the side
    link(tower, coll)
    stone.box(tcx, tcy, Z, tx1 - tx0 + 0.16, ty1 - ty0 + 0.16, 0.32)
    for qx, qy in ((tx0, ty0), (tx1, ty0), (tx1, ty1)):                       # quoins at the corners seen
        stone.box(qx, qy, Z + 0.32, 0.16, 0.16, 4.7)
    window_dressing(B, [(tcx, ty0 + 0.21, Z + 2.32, 0.3, 0.05, 1.26, 0), (tx1 - 0.21, tcy, Z + 1.62, 0.05, 0.3, 1.56, 0)],
                    glass, lit, lit_every=2, lit_off=1, frame_mat=ST, sill_mat=ST)
    B.get('MC_PLINTH_DK', 0.02, tag='Door').box(tcx, ty0 + 0.3, Z + 0.34, 0.78, 0.06, 1.62)
    B.get(R, 0.02, tag='DoorHood').box(tcx, ty0 - 0.25, Z + 2.05, 1.2, 0.55, 0.1)
    # the clock stage, its two faces, the cornice and the rose crown
    stone.box(tcx, tcy, Z + 5.02, tx1 - tx0 + 0.2, ty1 - ty0 + 0.2, 1.7)
    stone.box(tcx, tcy, Z + 6.72, tx1 - tx0 + 0.42, ty1 - ty0 + 0.42, 0.18)
    clock_face(B, coll, tcx, ty0 - 0.1, Z + 5.87, '-y')
    clock_face(B, coll, tx1 + 0.1, tcy, Z + 5.87, '+x')
    B.get(R, 0.03, tag='Crown').box(tcx, tcy, Z + 6.9, 2.4, 2.4, 1.25, taper=0.14)
    B.get('MC_METAL', 0.02, tag='Finial', sm=True).cyl(tcx, tcy, Z + 8.05, 0.06, 0.45, seg=12)
    B.get('MC_METAL_DARK', 0.015, tag='BeaconBase', sm=True).cyl(tcx, tcy, Z + 8.45, 0.18, 0.07, seg=20)
    lamp_ = MB('DP_BeaconLamp', mat('MC_STATUS_LIGHT'), status_coll, bevel=0.0, smooth_=True)
    lamp_.sphere(tcx, tcy, Z + 8.8, 0.28, 0.28, 0.28, seg=32, rings=18)
    lamp_.done()['status_role'] = 'beacon'
    cage = B.get('MC_METAL', 0.0, tag='Cage', sm=True)
    cage.cyl(tcx, tcy, Z + 8.52, 0.33, 0.035, seg=32)
    cage.cyl(tcx, tcy, Z + 9.04, 0.33, 0.035, seg=32)
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        cage.box(tcx + 0.33 * math.cos(a), tcy + 0.33 * math.sin(a), Z + 8.52, 0.03, 0.03, 0.55)
    # the balcony under the clock, and the mechanism box the technician serves
    stone.box(tcx, ty0 - 0.35, Z + 4.3, tx1 - tx0 + 0.3, 0.7, 0.12)
    rail = B.get('MC_METAL', 0.0, tag='Railing')
    for i in range(8):
        x = tx0 - 0.1 + (tx1 - tx0 + 0.2) * i / 7
        rail.box(x, ty0 - 0.68, Z + 4.42, 0.035, 0.035, 0.5)
    rail.box(tcx, ty0 - 0.68, Z + 4.9, tx1 - tx0 + 0.24, 0.045, 0.045)
    for x in (tx0 - 0.12, tx1 + 0.12):
        rail.box(x, ty0 - 0.35, Z + 4.42, 0.035, 0.035, 0.5)
        rail.box(x, ty0 - 0.35, Z + 4.9, 0.045, 0.66, 0.045)
    B.get('MC_METAL_DARK', 0.015, tag='Mechanism').box(2.15, ty0 - 0.04, Z + 4.52, 0.46, 0.08, 0.4)

    # ------------------------------------------------ THE SCHEDULE BOARD
    bx, by = 1.75, 0.2
    legs = B.get(G, 0.015, tag='BoardLegs')
    for s in (-1.2, 1.2):
        legs.box(bx + s, by, Z, 0.12, 0.12, 2.15)
    B.get('MC_PLINTH_DK', 0.02, tag='Board').box(bx, by, Z + 0.95, 2.6, 0.12, 1.12)
    B.get(ST, 0.02, tag='BoardCap').box(bx, by, Z + 2.07, 2.75, 0.2, 0.08)
    fixed, flex = B.get(R, 0.0, tag='BoardBlocks'), B.get(ST, 0.0, tag='BoardBlocks')
    rows = [[(0.0, 0.18, 1), (0.22, 0.5, 0), (0.56, 0.72, 1), (0.8, 0.95, 0)],
            [(0.05, 0.3, 0), (0.36, 0.62, 1), (0.7, 0.98, 0)],
            [(0.0, 0.12, 0), (0.18, 0.46, 1), (0.52, 0.66, 0), (0.74, 1.0, 1)]]
    for r, row in enumerate(rows):
        z = Z + 1.8 - r * 0.28
        for a, b_, fx in row:
            (fixed if fx else flex).box(bx - 1.2 + 2.4 * (a + b_) / 2, by - 0.07, z, 2.4 * (b_ - a) - 0.04, 0.02, 0.18)
    rect(B.get('MC_GLASS_LIT', 0.0, tag='BoardNow'), bx + 0.1, bx + 0.14, by - 0.09, by - 0.07, Z + 1.0, 1.02)

    # --------------------------------------------------- THE TIMELINE WALK
    ty = -1.95
    slab('DP_Timeline', 13.2, 1.1, 0.3, Z, 0.12, mat(G), coll, cy=ty, bevel=0.025)
    frame('DP_TimelineKerb', 13.5, 1.4, 0.45, 13.2, 1.1, 0.3, Z, 0.06, mat(ST), coll, bevel=0.012, cy=ty)
    joint = B.get(ST, 0.0, tag='HourJoints')
    posts = B.get(ST, 0.02, tag='HourPosts')
    caps = B.get('MC_GLASS_LIT', 0.0, tag='HourLights', sm=True)
    for i in range(13):
        x = -6.6 + 1.1 * i
        rect(joint, x - 0.02, x + 0.02, ty - 0.55, ty + 0.55, Z + 0.12, 0.012)
        if i % 2 == 0:
            posts.box(x, ty + 0.72, Z, 0.14, 0.14, 0.42)
            caps.sphere(x, ty + 0.72, Z + 0.47, 0.06, 0.06, 0.05, seg=10, rings=6)
    fixed_b = B.get(R, 0.03, tag='TimeBlocks')
    flex_b = B.get(ST, 0.07, 3, tag='TimeBlocksFlex')
    for x0, x1, kind in ((-6.2, -5.0, 1), (-4.6, -3.4, 0), (-2.9, -2.3, 0), (-1.8, -0.2, 1), (0.4, 1.3, 0),
                         (2.0, 3.4, 1), (3.9, 4.6, 0), (5.1, 6.2, 1)):
        if kind:
            rect(fixed_b, x0, x1, ty - 0.34, ty + 0.34, Z + 0.12, 0.22)
        else:
            rect(flex_b, x0, x1, ty - 0.3, ty + 0.3, Z + 0.12, 0.16)

    def gate(b):
        for s in (-0.66, 0.66):
            b.box(0, s, 0, 0.09, 0.09, 1.45)
        b.box(0, 0, 1.43, 0.11, 1.42, 0.11)
    # it starts mid-morning, so a still place shows Now inside the day
    x0, x1, xs = -6.3, 6.3, -0.9
    turn = 1 + int(LIFE_FRAMES * (x1 - xs) / (x1 - x0))
    now = _life_object('DP_NowGate', 'MC_GLASS_LIT', coll, gate, (xs, ty, Z + 0.12))
    _key(now, 'location', [(1, (xs, ty, Z + 0.12)), (turn, (x1, ty, Z + 0.12)), (turn + 1, (x0, ty, Z + 0.12)),
                           (LIFE_FRAMES + 1, (xs, ty, Z + 0.12))])
    _push_life(now)

    # ------------------------------------------ LOCKERS, SHED, YARD
    lk = B.get(G, 0.02, tag='Lockers')
    lk.box(5.6, 0.95, Z, 2.4, 0.55, 1.62)
    B.get(ST, 0.015, tag='LockerCap').box(5.6, 0.9, Z + 1.62, 2.6, 0.75, 0.08)
    doors = B.get(R, 0.008, tag='LockerDoors')
    doors2 = B.get(ST, 0.008, tag='LockerDoors')
    for c in range(4):
        for r in range(3):
            x = 4.7 + 0.6 * c
            if (c, r) == (1, 1):
                rect(B.get('MC_GLASS_LIT', 0.0, tag='LockerScreen'), x - 0.2, x + 0.2, 0.64, 0.66, Z + 0.2 + r * 0.46 + 0.12, 0.2)
                continue
            ((doors if (c + r) % 2 else doors2)).box(x, 0.66, Z + 0.2 + r * 0.46, 0.5, 0.03, 0.4)
    shed = B.get(G, 0.03, tag='Shed')
    rect(shed, 4.8, 6.8, 4.2, 6.5, Z, 1.7)
    B.get(ST, 0.02, tag='ShedRoof').box(5.8, 5.35, Z + 1.7, 2.2, 2.5, 0.1)
    B.get(R, 0.01, tag='RollerDoor').box(6.83, 5.35, Z + 0.05, 0.05, 1.3, 1.25)
    for k in range(8):
        B.get(RD, 0.0, tag='RollerSlats').box(6.86, 5.35, Z + 0.15 + k * 0.14, 0.012, 1.28, 0.02)
    B.get(R, 0.02, tag='ShedAwning').box(7.1, 5.35, Z + 1.45, 0.55, 1.6, 0.08)
    for dy, h in ((-0.9, 0.4), (-0.55, 0.3), (-0.9, 0.3)):
        B.get('MC_WOOD', 0.02, tag='Parcels').box(6.95, 5.35 + dy, Z + (0.4 if h == 0.3 and dy == -0.9 else 0), 0.35, 0.35, h)
    cart(B, -6.1, 0.85)

    # ----------------------------------------- THE GREEN AND THE PLAZA
    slab('DP_Lawn', 4.4, 3.0, 0.6, Z, 0.08, mat('MC_GRASS'), coll, cx=-4.5, cy=-5.2, bevel=0.03)
    frame('DP_LawnCurb', 4.66, 3.26, 0.73, 4.4, 3.0, 0.6, Z, 0.15, mat('MC_CONCRETE'), coll, bevel=0.018,
          cx=-4.5, cy=-5.2)
    tree(B, -5.8, -4.7, 1.0, pit=False)
    tree(B, -3.1, -5.9, 0.85, pit=False)
    tree(B, 6.0, -4.3, 1.0)
    tree(B, 6.3, 2.7, 0.8)
    # a planted bed at the front right, the lawn's partner across the plaza
    slab('DP_Bed', 3.2, 1.9, 0.5, Z, 0.1, mat('MC_GRASS'), coll, cx=3.4, cy=-5.45, bevel=0.03)
    frame('DP_BedCurb', 3.46, 2.16, 0.62, 3.2, 1.9, 0.5, Z, 0.17, mat(ST), coll, bevel=0.018, cx=3.4, cy=-5.45)
    tree(B, 2.55, -5.2, 0.8, pit=False, z=Z + 0.1)
    for sx, sy, s in ((3.6, -5.9, 0.34), (4.3, -5.2, 0.28), (4.5, -5.95, 0.24), (3.2, -4.9, 0.22)):
        B.get('MC_LEAF_DARK' if s > 0.25 else 'MC_LEAF', 0.0, tag='Shrubs', sm=True).sphere(sx, sy, Z + 0.1 + s * 0.6, s, s, s * 0.8, seg=12, rings=8)
    planter(B, -0.8, 1.35, 0.9, 0.42)
    bench = B.get('MC_WOOD', 0.02, tag='Bench')
    legs2 = B.get('MC_METAL_DARK', 0.01, tag='BenchLegs')
    for bx_, by_ in ((-4.5, -3.1), (3.2, -3.75)):
        bench.box(bx_, by_, Z + 0.4, 1.3, 0.38, 0.08)
        bench.box(bx_, by_ + 0.2, Z + 0.62, 1.3, 0.06, 0.34)
        for s in (-0.5, 0.5):
            legs2.box(bx_ + s, by_, Z + 0.05, 0.06, 0.32, 0.36)
    boll = B.get(G, 0.02, tag='Bollards', sm=False)
    for x in (0.9, 1.9, 2.9):
        boll.box(x, -6.95, Z, 0.16, 0.16, 0.55)
    totem(B, -0.2, -6.8)
    for x, y in ((-0.6, -3.4), (6.7, -2.8), (-6.9, -0.7), (1.1, 1.05)):
        lamp(B, x, y)
    for cx_, cy_ in ((4.4, -2.9), (5.6, -2.9)):
        cone(B, cx_, cy_)
    B.finish()
    return B
