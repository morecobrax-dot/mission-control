"""Daily Verse: a reading observatory — a quiet place for study and light.

The place answers what the app is for (a verse a day, read and thought over)
in architecture, never in words or symbols:
  - a limestone reading hall under an indigo roof, its tall arched windows
    warm from inside, a bronze door under a small gable
  - an observatory drum at its end: a gallery round the top, and a bronze
    dome with its slit open and a brass telescope looking out — the curved
    silhouette you find Daily Verse by from the overview
  - a garden court in front: a long reflecting pool on the axis of the door,
    clipped parterres, a sundial, benches facing the water
  - a reading terrace under a timber pergola, with desks and lamps
  - a book cart at the door, book deliveries at the side door, a gated
    entrance from the street
No crosses, no scripture sculpture, no words: study, reflection and light.

Its life (MC_LIFE, 60 s): the dome turns once, the telescope with it. It
plays only while the project is known to be under way.

Deck top is z = 1.0, deck is 15.4 across; the camera sits at +x, -y.
"""
import math
import bpy
from mc_lib import MB, slab, frame, cut, mat, link, DECK_Z
from mc_kit import (Builders, rect, tree, planter, hedge, lamp, window_dressing, paver_joints, bench, beacon,
                    gable, push_life, key, life_object)

ACCENT = 'MC_DV_BRONZE'
Z = DECK_Z
LS, IN, BZ, W = 'MC_DV_LIMESTONE', 'MC_DV_INDIGO', 'MC_DV_BRONZE', 'MC_PAINT_WHITE'
SL = 'MC_DV_SLATE'                                   # the roofs: matte slate, so the city is not three blues in a row
LIFE_FRAMES = 1440                                   # 60 s at 24 frames a second
DOME = (3.3, 4.4)                                    # the observatory's centre
DRUM_R, DRUM_H = 2.0, 4.3

# where (feet), facing (degrees about Z; 180 faces -y, 225 the camera, 270 +x),
# pose, prop, outfit.
WORKERS = [
    ('astronomer', (2.05, 2.42, Z + DRUM_H + 0.12), 210, 'REPAIR', 'wrench', 'dv_crew'),
    ('librarian',  (-1.55, 1.75, 1.0), 250, 'REPAIR', None, 'dv_crew'),
    ('reader',     (3.05, -1.55, 1.12), 160, 'WORKING', 'book', 'dv_study'),
    ('gardener',   (-6.05, -2.3, 1.0), 110, 'REPAIR', None, 'dv_crew'),
    ('keeper',     (-1.7, -6.1, 1.0), 215, 'SIGNAL', None, 'dv_crew'),
]


def arched(B, cx, y, z0, w, h, lit_):
    """An arched window on the -y wall: a recessed pane (cut by the caller), a
    round head in a stone ring, a transom, a sill."""
    r = w / 2
    stone = B.get(LS, 0.02, tag='Arches')
    B.get(LS, 0.0, tag='ArchRings', sm=True).cyl(cx, y + 0.02, z0 + h, r + 0.11, 0.06, seg=28, axis='Y')
    B.get('MC_GLASS_LIT' if lit_ else 'MC_GLASS', 0.0, tag='ArchHeads', sm=True).cyl(cx, y - 0.02, z0 + h, r, 0.06, seg=28,
                                                                                  axis='Y')
    stone.box(cx, y - 0.06, z0 + h - 0.04, w + 0.12, 0.08, 0.07)                         # transom
    stone.box(cx, y - 0.12, z0 - 0.1, w + 0.3, 0.22, 0.09)                               # sill
    B.get(BZ, 0.0, tag='Mullions').box(cx, y - 0.03, z0, 0.04, 0.05, h)


def build(coll, status_coll):
    B = Builders(coll, 'DV')
    glass, lit = B.get('MC_GLASS', 0.0, tag='Panes'), B.get('MC_GLASS_LIT', 0.0, tag='Panes')
    paver_joints(B, -7.2, 7.2, -7.2, 7.2, 1.44)
    stone = B.get(LS, 0.03, tag='Stone')

    # ------------------------------------------------------ THE READING HALL
    hx0, hx1, hy0, hy1, hh = -6.6, 0.6, 3.0, 6.4, 3.2
    cxh, cyh = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    body = MB('DV_HallBody', mat(LS), coll, bevel=0.04, seg=2)
    rect(body, hx0, hx1, hy0, hy1, Z + 0.3, hh - 0.3)
    hall = body.done()
    door_x = -3.0
    wins = (-5.55, -4.35, -1.65, -0.45)
    cutters = [(x, hy0 + 0.12, Z + 0.95, 0.72, 0.3, 1.5) for x in wins]
    cutters.append((door_x, hy0 + 0.15, Z + 0.3, 0.92, 0.36, 1.8))
    cut(hall, cutters)
    link(hall, coll)
    stone.box(cxh, cyh, Z, hx1 - hx0 + 0.18, hy1 - hy0 + 0.18, 0.3)                            # plinth course
    stone.box(cxh, cyh, Z + hh - 0.22, hx1 - hx0 + 0.24, hy1 - hy0 + 0.24, 0.22)                # cornice
    B.get(BZ, 0.01, tag='Frieze').box(cxh, hy0 - 0.1, Z + hh - 0.34, hx1 - hx0 + 0.1, 0.04, 0.08)
    for x in (-6.45, -4.95, -3.9, -2.1, -1.05, 0.45):                                        # pilasters
        stone.box(x, hy0 - 0.04, Z + 0.3, 0.26, 0.12, hh - 0.5)
    for i, x in enumerate(wins):
        rect(lit if i in (1, 2) else glass, x - 0.34, x + 0.34, hy0 + 0.18, hy0 + 0.22, Z + 0.95, 1.5)
        arched(B, x, hy0, Z + 0.95, 0.72, 1.5, i in (1, 2))
    # low planting along the hall's front, between the pilasters
    for x0, x1 in ((-6.3, -5.1), (-4.8, -4.05), (-1.95, -1.2), (-0.9, 0.3)):
        rect(B.get(LS, 0.015, tag='BedCurb'), x0, x1, hy0 - 0.6, hy0 - 0.12, Z, 0.16)
        n = max(2, int((x1 - x0) / 0.32))
        for k in range(n):
            r_ = 0.17 + 0.04 * (k % 2)
            B.get('MC_LEAF_DARK' if k % 2 else 'MC_LEAF', 0.0, tag='BedLeaf', sm=True).sphere(
                x0 + 0.16 + (x1 - x0 - 0.32) * k / max(1, n - 1), hy0 - 0.36, Z + 0.22 + r_ * 0.4, r_, r_ * 0.9, r_ * 0.8, seg=12, rings=8)
    # the door: a stone portal, bronze leaves, a round head, a small gable hood, steps and a lantern
    stone.box(door_x, hy0 - 0.12, Z + 0.3, 1.5, 0.26, 2.5)
    B.get(BZ, 0.015, tag='Door').box(door_x, hy0 - 0.02, Z + 0.32, 0.86, 0.06, 1.76)
    B.get('MC_METAL_DARK', 0.0, tag='DoorSplit').box(door_x, hy0 - 0.06, Z + 0.32, 0.03, 0.03, 1.76)
    B.get('MC_GLASS_LIT', 0.0, tag='Fanlight', sm=True).cyl(door_x, hy0 - 0.2, Z + 2.12, 0.34, 0.06, seg=24, axis='Y')
    gable(B.get(SL, 0.02, tag='DoorHood'), door_x - 0.9, door_x + 0.9, hy0 - 0.75, hy0 + 0.05, Z + 2.8, 0.55, ridge='y')
    steps = B.get(LS, 0.015, tag='Steps')
    for i, (w_, d_, h_) in enumerate(((1.9, 0.95, 0.1), (1.6, 0.6, 0.2), (1.4, 0.3, 0.3))):
        steps.box(door_x, hy0 - 0.25 - d_ / 2, Z, w_, d_, h_)
    B.get('MC_METAL_DARK', 0.01, tag='Lantern').box(door_x, hy0 - 0.26, Z + 2.62, 0.08, 0.2, 0.05)
    B.get('MC_GLASS_LIT', 0.0, tag='LanternGlow', sm=True).sphere(door_x, hy0 - 0.36, Z + 2.5, 0.09, 0.09, 0.12, seg=12, rings=8)
    # the roof: an indigo gable with a bronze ridge, three roof lights, rainwater
    gable(B.get(SL, 0.03, tag='Roof'), hx0 - 0.3, hx1 + 0.05, hy0 - 0.35, hy1 + 0.35, Z + hh, 1.45)
    for t in (0.2, 0.4, 0.6, 0.8):                                            # tile courses on the front slope
        yy, zz = hy0 - 0.35 + (cyh - hy0 + 0.35) * t, Z + hh + 1.45 * t
        B.get(SL, 0.0, tag='RoofCourses').box(cxh - 0.12, yy, zz - 0.01, hx1 - hx0 + 0.3, 0.05, 0.05)
    B.get(BZ, 0.0, tag='Ridge').box(cxh - 0.1, (hy0 + hy1) / 2, Z + hh + 1.38, hx1 - hx0 + 0.3, 0.14, 0.1)
    for x in (-5.2, -3.0, -0.8):
        B.get(BZ, 0.01, tag='RoofLightFrames').box(x, hy0 + 0.55, Z + hh + 0.34, 0.8, 0.5, 0.2, rot=0)
        rect(B.get('MC_GLASS_LIT' if x == -3.0 else 'MC_GLASS', 0.0, tag='RoofLights'), x - 0.32, x + 0.32,
             hy0 + 0.35, hy0 + 0.75, Z + hh + 0.5, 0.06)
    dp = B.get('MC_METAL_DARK', 0.0, tag='Downpipes', sm=True)
    for px_ in (hx0 + 0.1, -2.5):
        dp.cyl(px_, hy0 - 0.1, Z + 0.3, 0.05, hh - 0.3, seg=10)
    # the side door on the west end, where books arrive
    B.get(BZ, 0.015, tag='SideDoor').box(hx0 - 0.03, 4.7, Z + 0.3, 0.06, 0.8, 1.6)
    B.get(SL, 0.02, tag='SideHood').box(hx0 - 0.3, 4.7, Z + 2.05, 0.6, 1.2, 0.08)
    crates = B.get('MC_WOOD', 0.02, tag='Parcels')
    for dx, dy, s, z in ((-0.55, 0.0, 0.42, 0), (-0.55, 0.5, 0.36, 0), (-0.55, 0.2, 0.32, 0.42)):
        crates.box(hx0 + dx, 4.0 + dy, Z + z, s, s, s)

    # ------------------------------------------------------- THE OBSERVATORY
    ox, oy = DOME
    B.get(LS, 0.0, tag='Drum', sm=True).cyl(ox, oy, Z + 0.3, DRUM_R, DRUM_H - 0.3, seg=48)
    B.get(LS, 0.0, tag='DrumBase', sm=True).cyl(ox, oy, Z, DRUM_R + 0.14, 0.3, seg=48)
    B.get(BZ, 0.0, tag='DrumBands', sm=True).cyl(ox, oy, Z + 2.05, DRUM_R + 0.04, 0.1, seg=48)
    # tall slit windows round the drum, the lit ones where someone is reading
    for i, a in enumerate((200, 235, 270, 305, 340)):
        r_ = math.radians(a)
        px_, py_ = ox + (DRUM_R + 0.01) * math.cos(r_), oy + (DRUM_R + 0.01) * math.sin(r_)
        g = lit if i in (1, 3) else glass
        g.box(px_, py_, Z + 2.35, 0.3, 0.08, 1.3, rot=a + 90)
        stone.box(px_ + 0.04 * math.cos(r_), py_ + 0.04 * math.sin(r_), Z + 2.26, 0.46, 0.1, 0.1, rot=a + 90)
    B.get(BZ, 0.015, tag='Door').box(ox - 0.35, oy - DRUM_R + 0.05, Z + 0.3, 0.8, 0.1, 1.7, rot=-10)
    # the gallery round the top, its rail, and the dome on a short indigo ring
    gz = Z + DRUM_H
    B.get(LS, 0.0, tag='Gallery', sm=True).cyl(ox, oy, gz - 0.12, DRUM_R + 0.55, 0.12, seg=48)
    frame('DV_GalleryRail', 2 * (DRUM_R + 0.52), 2 * (DRUM_R + 0.52), DRUM_R + 0.51, 2 * (DRUM_R + 0.46),
          2 * (DRUM_R + 0.46), DRUM_R + 0.45, gz + 0.62, 0.05, mat('MC_METAL_DARK'), coll, bevel=0.0, n=10, cx=ox, cy=oy)
    posts = B.get('MC_METAL_DARK', 0.0, tag='RailPosts')
    for i in range(20):
        a = 2 * math.pi * i / 20
        posts.box(ox + (DRUM_R + 0.49) * math.cos(a), oy + (DRUM_R + 0.49) * math.sin(a), gz, 0.04, 0.04, 0.64)
    B.get(IN, 0.0, tag='DomeRing', sm=True).cyl(ox, oy, gz, DRUM_R - 0.05, 0.3, seg=48)
    dz = gz + 0.3

    def dome(b):
        b.sphere(0, 0, 0, DRUM_R - 0.15, DRUM_R - 0.15, DRUM_R - 0.15, seg=40, rings=20)
    dm = life_object('DV_Dome', BZ, coll, dome, (ox, oy, dz))
    # the slit: open from the ring to past the crown, facing -y as the clip begins
    cut(dm, [(ox, oy - 1.05, dz + 0.15, 0.62, 2.1, 2.2)])          # world space: the dome is already in place
    link(dm, coll)
    for p in dm.data.polygons:
        p.use_smooth = True

    def scope(b):
        b.beam((0, 0.1, 0.25), (0, -1.55, 1.25), 0.34)                    # the tube, out through the slit
        b.beam((0, -1.52, 1.23), (0, -1.72, 1.35), 0.4)                   # its dew cap
        b.cyl(0, 0.15, -0.3, 0.16, 0.6, seg=12)                           # the pier
    tel = life_object('DV_Telescope', 'MC_BRASS', coll, scope, (ox, oy, dz))
    for o in (dm, tel):
        key(o, 'rotation_euler', [(1, (0, 0, 0)), (LIFE_FRAMES + 1, (0, 0, 2 * math.pi))])
        push_life(o)
    beacon(B, status_coll, 'DV', ox, oy, dz + DRUM_R - 0.2)

    # ---------------------------------------------------------- THE GARDEN COURT
    # the pool on the axis of the door, with a stone coping
    py0, py1 = -2.9, 0.1
    slab('DV_Pool', 4.2, py1 - py0, 0.2, Z, 0.06, mat('MC_GLASS'), coll, cx=door_x, cy=(py0 + py1) / 2, bevel=0.0)
    frame('DV_PoolCoping', 4.6, py1 - py0 + 0.4, 0.3, 4.2, py1 - py0, 0.2, Z, 0.18, mat(LS), coll, bevel=0.015,
          cx=door_x, cy=(py0 + py1) / 2)
    for dx, dy, r in ((-1.4, -0.6, 0.22), (-1.05, -0.35, 0.16), (1.3, -2.1, 0.2), (1.55, -1.85, 0.14), (0.2, -2.45, 0.17)):
        B.get('MC_LEAF' if r > 0.16 else 'MC_LEAF_DARK', 0.0, tag='LilyPads', sm=True).cyl(door_x + dx, dy, Z + 0.06, r, 0.02, seg=14)
    # the walk: street gate to pool, pool to door
    walk = B.get('MC_CONCRETE', 0.0, tag='Walk')
    rect(walk, door_x - 0.7, door_x + 0.7, -7.1, py0 - 0.25, Z, 0.02)
    rect(walk, door_x - 0.7, door_x + 0.7, py1 + 0.25, hy0 - 1.2, Z, 0.02)
    rect(walk, door_x - 2.6, door_x + 2.6, -4.3, -3.2, Z, 0.02)
    # the sundial where the walks cross: a stone pedestal, a bronze plate and gnomon
    B.get(LS, 0.02, tag='Pedestal').box(door_x, -3.75, Z, 0.46, 0.46, 0.9)
    B.get('MC_BRASS', 0.0, tag='Sundial', sm=True).cyl(door_x, -3.75, Z + 0.9, 0.3, 0.04, seg=24)
    B.get('MC_BRASS', 0.0, tag='Gnomon').prism([(door_x - 0.02, -3.95), (door_x + 0.02, -3.95), (door_x + 0.02, -3.55),
                                                (door_x - 0.02, -3.55)], Z + 0.94, 0.02)
    B.get('MC_BRASS', 0.0, tag='Gnomon').beam((door_x, -3.95, Z + 0.95), (door_x, -3.55, Z + 1.2), 0.03)
    # parterres either side of the pool: lawn in a stone curb, clipped hedges, trees
    for cx_ in (-6.1, 0.1):
        slab('DV_Lawn%d' % (0 if cx_ < 0 else 1), 1.8, 4.4, 0.3, Z, 0.08, mat('MC_GRASS'), coll, cx=cx_, cy=-1.4, bevel=0.02)
        frame('DV_LawnCurb%d' % (0 if cx_ < 0 else 1), 2.04, 4.64, 0.42, 1.8, 4.4, 0.3, Z, 0.14, mat(LS), coll,
              bevel=0.012, cx=cx_, cy=-1.4)
    tree(B, -6.1, -0.2, 0.95, pit=False, z=Z + 0.08)
    tree(B, 0.1, -2.6, 0.8, pit=False, z=Z + 0.08)
    for y in (-3.3, 0.5):
        B.get('MC_LEAF_DARK', 0.08, 3, tag='Topiary', sm=True).cyl(-6.1, y, Z + 0.08, 0.3, 0.9, seg=16, radius2=0.04)
    hedge(B, -6.9, -4.2, 1.95, 0.5)
    hedge(B, -1.8, 1.0, 1.95, 0.5)
    bench(B, -4.9, -1.4, along='y', back=-1)
    bench(B, -1.1, -1.4, along='y', back=1)
    for x, y in ((-4.4, -4.9), (-1.6, -4.9), (-6.7, 2.5), (0.95, 1.4)):
        lamp(B, x, y)

    # ------------------------------------------------------- THE READING TERRACE
    tx0, tx1, ty0, ty1 = 1.6, 6.8, -3.4, 0.6
    slab('DV_Terrace', tx1 - tx0, ty1 - ty0, 0.25, Z, 0.12, mat('MC_WOOD'), coll, cx=(tx0 + tx1) / 2,
         cy=(ty0 + ty1) / 2, bevel=0.015)
    boards = B.get('MC_WOOD_DARK', 0.0, tag='Boards')
    y = ty0 + 0.4
    while y < ty1 - 0.2:
        rect(boards, tx0 + 0.1, tx1 - 0.1, y - 0.01, y + 0.01, Z + 0.12, 0.006)
        y += 0.4
    pg = B.get('MC_WOOD', 0.02, tag='Pergola')
    py_a, py_b = -1.75, ty1 - 0.2                      # it shades the desks; the front of the terrace is open sky
    for x in (tx0 + 0.3, tx1 - 0.3):
        for y_ in (py_a, py_b):
            B.get(LS, 0.02, tag='PergolaPosts').box(x, y_, Z + 0.12, 0.24, 0.24, 2.3)
    for y_ in (py_a, py_b):
        pg.box((tx0 + tx1) / 2, y_, Z + 2.42, tx1 - tx0 - 0.2, 0.14, 0.18)
    for i in range(7):
        x = tx0 + 0.45 + i * (tx1 - tx0 - 0.9) / 6
        pg.box(x, (py_a + py_b) / 2, Z + 2.6, 0.08, py_b - py_a + 0.5, 0.1)
    # climbing green on the pergola's back beam
    for i in range(5):
        B.get('MC_LEAF' if i % 2 else 'MC_LEAF_DARK', 0.0, tag='Vine', sm=True).sphere(
            tx0 + 0.8 + i * 0.95, py_b + 0.05, Z + 2.62, 0.4, 0.26, 0.2, seg=12, rings=8)
    # the open front of the terrace: two planted tubs and a low lavender-green edge
    for x in (tx0 + 0.5, tx1 - 0.5):
        B.get(LS, 0.02, tag='Tubs').box(x, ty0 + 0.45, Z + 0.12, 0.6, 0.6, 0.42)
        B.get('MC_LEAF', 0.0, tag='TubLeaf', sm=True).sphere(x, ty0 + 0.45, Z + 0.72, 0.34, 0.34, 0.28, seg=12, rings=8)
    # reading desks with lamps and chairs
    desk, chair = B.get('MC_WOOD', 0.02, tag='Desks'), B.get(IN, 0.02, tag='Chairs')
    legs = B.get('MC_METAL_DARK', 0.0, tag='DeskLegs')
    for dx in (3.0, 5.4):
        desk.box(dx, -0.9, Z + 0.84, 1.4, 0.7, 0.07)
        for sx in (-0.62, 0.62):
            for sy in (-0.28, 0.28):
                legs.box(dx + sx, -0.9 + sy, Z + 0.12, 0.05, 0.05, 0.72)
        chair.box(dx - 0.2, -1.55, Z + 0.12, 0.44, 0.42, 0.44)
        chair.box(dx - 0.2, -1.78, Z + 0.56, 0.44, 0.06, 0.46)
        B.get('MC_BRASS', 0.0, tag='DeskLamps', sm=True).cyl(dx + 0.45, -0.75, Z + 0.91, 0.02, 0.42, seg=8)
        B.get('MC_GLASS_LIT', 0.0, tag='LampShades', sm=True).cyl(dx + 0.45, -0.75, Z + 1.28, 0.16, 0.14, seg=16, radius2=0.08)
        for k, c in enumerate((BZ, IN, W)):
            B.get(c, 0.0, tag='Books').box(dx - 0.35 + k * 0.03, -0.8, Z + 0.91 + k * 0.05, 0.36, 0.26, 0.05, rot=8 * k)
    planter(B, 6.3, 1.2, 0.9, 0.42)
    planter(B, 2.1, 1.2, 0.9, 0.42)

    # -------------------------------------------------------- THE BOOK CART
    cx_, cy_ = -1.05, 2.1
    cart_ = B.get('MC_WOOD', 0.02, tag='BookCart')
    cart_.box(cx_, cy_, Z + 0.2, 1.0, 0.45, 0.05)
    cart_.box(cx_, cy_, Z + 0.62, 1.0, 0.45, 0.05)
    for sx in (-0.47, 0.47):
        cart_.box(cx_ + sx, cy_, Z + 0.2, 0.05, 0.45, 0.9)
    wh = B.get('MC_METAL_DARK', 0.0, tag='Castors', sm=True)
    for sx in (-0.38, 0.38):
        for sy in (-0.16, 0.16):
            wh.cyl(cx_ + sx, cy_ + sy, Z + 0.07, 0.07, 0.05, seg=10, axis='Y')
    spines = [BZ, IN, W, 'MC_PS_GREEN', BZ, IN, 'MC_CS_CORAL', W]
    for shelf, z in ((0, Z + 0.25), (1, Z + 0.67)):
        x = cx_ - 0.42
        for k in range(7):
            w_ = 0.07 + 0.03 * ((k * 5 + shelf) % 3)
            B.get(spines[(k + shelf * 3) % len(spines)], 0.0, tag='Spines').box(x + w_ / 2, cy_, z, w_, 0.3,
                                                                               0.3 + 0.04 * ((k + shelf) % 2))
            x += w_ + 0.01

    # -------------------------------------------------- THE GATE AND THE STREET
    wall = B.get(LS, 0.02, tag='GardenWall')
    for x0, x1 in ((-7.0, door_x - 0.95), (door_x + 0.95, 1.2)):
        wall.box((x0 + x1) / 2, -6.85, Z, x1 - x0, 0.34, 0.55)
        wall.box((x0 + x1) / 2, -6.85, Z + 0.55, x1 - x0 + 0.08, 0.42, 0.08)
    rail = B.get('MC_METAL_DARK', 0.0, tag='WallRail')
    for x0, x1 in ((-7.0, door_x - 0.95), (door_x + 0.95, 1.2)):
        n = int((x1 - x0) / 0.25)
        for i in range(n + 1):
            rail.box(x0 + (x1 - x0) * i / n, -6.85, Z + 0.63, 0.025, 0.025, 0.42)
        rail.box((x0 + x1) / 2, -6.85, Z + 1.03, x1 - x0, 0.04, 0.04)
    for x in (door_x - 0.95, door_x + 0.95):
        wall.box(x, -6.85, Z, 0.46, 0.46, 1.25)
        B.get(BZ, 0.01, tag='GateCaps').box(x, -6.85, Z + 1.25, 0.54, 0.54, 0.1)
        B.get('MC_GLASS_LIT', 0.0, tag='GateLights', sm=True).sphere(x, -6.85, Z + 1.5, 0.14, 0.14, 0.16, seg=12, rings=8)
    # the gardener's corner behind the drum: a stone shed, a potting bench, a barrow
    B.get(LS, 0.03, tag='Shed').box(6.1, 5.7, Z, 1.5, 1.3, 1.6)
    gable(B.get(SL, 0.02, tag='ShedRoof'), 5.25, 6.95, 4.95, 6.45, Z + 1.6, 0.55)
    B.get(BZ, 0.01, tag='ShedDoor').box(5.34, 5.7, Z, 0.06, 0.62, 1.3)
    B.get('MC_WOOD', 0.02, tag='PottingBench').box(6.0, 4.55, Z + 0.75, 1.2, 0.45, 0.06)
    for sx in (-0.55, 0.55):
        B.get('MC_METAL_DARK', 0.0, tag='BenchLegs').box(6.0 + sx, 4.55, Z, 0.05, 0.4, 0.75)
    for k in range(3):
        B.get(BZ, 0.0, tag='Pots', sm=True).cyl(5.6 + k * 0.38, 4.55, Z + 0.81, 0.11, 0.16, seg=12, radius2=0.14)
        B.get('MC_LEAF', 0.0, tag='PotLeaf', sm=True).sphere(5.6 + k * 0.38, 4.55, Z + 1.05, 0.13, 0.13, 0.11, seg=10, rings=6)
    tree(B, 6.1, 3.1, 0.9)
    tree(B, 5.9, -5.4, 1.0)
    B.get('MC_BRASS', 0.012, tag='ReturnBox').box(-1.9, hy0 - 0.4, Z, 0.5, 0.4, 0.9)
    B.finish()
    return B
