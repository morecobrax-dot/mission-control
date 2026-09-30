"""Space Kindergarten: a little launch academy — learning, space, play.

The app teaches children to read on a trip through space. The place is a
school that launches rockets, told in architecture and play, not realism:
  - a white rocket on its pad, periwinkle bands and yellow fins, the tallest
    thing in the city: the silhouette you find Space Kindergarten by
  - its service tower, an open lattice with an access arm reaching the
    capsule where a technician works, the beacon on its top
  - a capsule-shaped classroom: rounded ends, porthole windows, a rooftop
    telescope and an antenna
  - a mission-control booth watching the pad, its dish turning
  - a moon-crater sandpit with a planet mobile orbiting its sun, blank
    learning blocks, a rocket slide, and a path of yellow stars to the door
Premium miniature, never a military launch site: soft forms, warm light.

Its life (MC_LIFE, 60 s): the planets go round their sun; the booth's dish
turns.

Deck top is z = 1.0, deck is 15.4 across; the camera sits at +x, -y.
"""
import math
import bmesh
import bpy
from mc_lib import MB, slab, frame, cut, mat, link, DECK_Z
from mc_kit import (Builders, rect, tree, planter, hedge, lamp, paver_joints, bench, beacon, gable,
                    push_life, key, life_object, life_group)

ACCENT = 'MC_SK_PERIWINKLE'
Z = DECK_Z
PW, IN, YE, W = 'MC_SK_PERIWINKLE', 'MC_SK_INDIGO', 'MC_SK_YELLOW', 'MC_PAINT_WHITE'
LIFE_FRAMES = 1440
PAD = (3.8, 3.7)                                   # the rocket's axis
TOWER = (5.95, 5.35)                               # the service tower's centre
ARM_Z = 5.85                                       # the access arm's floor, over the deck: level with the capsule

WORKERS = [
    ('technician', (4.62, 4.45, Z + ARM_Z + 0.1), 225, 'REPAIR', 'wrench', 'sk_suit'),
    ('teacher',    (-2.2, -3.05, 1.0), 200, 'WORKING', 'tablet', 'sk_crew'),
    ('controller', (2.55, -0.55, 1.0), 25, 'WORKING', 'clipboard', 'sk_crew'),
    ('signaller',  (2.35, 2.05, 1.0), 40, 'SIGNAL', None, 'sk_crew'),
    ('explorer',   (-0.25, -5.1, 0.925), 300, 'ACTIVE', None, 'sk_suit'),
]


def fin(mb, cx, cy, a, r, z0, h, span):
    """A swept fin on the rocket's body at angle a: a right triangle plate
    against the hull, thickness 0.08."""
    bm = mb.bm
    c, s = math.cos(a), math.sin(a)
    px, py = -s * 0.04, c * 0.04                       # half the thickness, across the fin
    pts = [(r, z0), (r, z0 + h), (r + span, z0 - 0.2)]
    front = [bm.verts.new((cx + c * u + px, cy + s * u + py, z)) for u, z in pts]
    back = [bm.verts.new((cx + c * u - px, cy + s * u - py, z)) for u, z in pts]
    bm.faces.new(front)
    bm.faces.new(back[::-1])
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def star(mb, cx, cy, z0, r, h=0.02):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    mb.prism(pts, z0, h)


def build(coll, status_coll):
    B = Builders(coll, 'SK')
    glass, lit = B.get('MC_GLASS', 0.0, tag='Panes'), B.get('MC_GLASS_LIT', 0.0, tag='Panes')
    paver_joints(B, -7.2, 7.2, -7.2, 7.2, 1.44)

    # ------------------------------------------------------------ THE PAD
    px, py = PAD
    B.get('MC_CONCRETE', 0.0, tag='Pad', sm=True).cyl(px, py, Z, 2.3, 0.22, seg=48)
    B.get(PW, 0.0, tag='PadRing', sm=True).cyl(px, py, Z + 0.22, 2.05, 0.012, seg=48)
    B.get('MC_CONCRETE', 0.0, tag='Pad', sm=True).cyl(px, py, Z + 0.22, 1.9, 0.014, seg=48)
    for i in range(8):                                                    # hazard chevrons round the rim
        a = 2 * math.pi * i / 8
        B.get(YE, 0.0, tag='Chevrons').box(px + 2.15 * math.cos(a), py + 2.15 * math.sin(a), Z + 0.22, 0.28, 0.1, 0.014,
                                           rot=math.degrees(a) + 90)
    B.get('MC_METAL_DARK', 0.0, tag='Trench').box(px, py - 1.35, Z + 0.1, 1.1, 0.8, 0.14)
    for k in range(5):
        B.get('MC_METAL', 0.0, tag='Grate').box(px - 0.44 + k * 0.22, py - 1.35, Z + 0.24, 0.05, 0.78, 0.02)
    # hold-down posts, and the rocket standing on them
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        B.get('MC_METAL_DARK', 0.02, tag='HoldDowns').box(px + 0.85 * math.cos(a), py + 0.85 * math.sin(a), Z + 0.22, 0.22, 0.22, 0.75)
    rz = Z + 0.9
    B.get('MC_METAL_DARK', 0.0, tag='Engine', sm=True).cyl(px, py, rz - 0.55, 0.52, 0.6, seg=32, radius2=0.34)
    body = B.get(W, 0.0, tag='Hull', sm=True)
    body.cyl(px, py, rz, 0.74, 2.6, seg=40)
    B.get(PW, 0.0, tag='HullBands', sm=True).cyl(px, py, rz + 2.6, 0.75, 0.32, seg=40)
    body.cyl(px, py, rz + 2.92, 0.74, 2.0, seg=40)
    B.get(IN, 0.0, tag='Capsule', sm=True).cyl(px, py, rz + 4.92, 0.745, 0.5, seg=40)
    B.get(PW, 0.0, tag='Nose', sm=True).cyl(px, py, rz + 5.42, 0.74, 2.2, seg=40, radius2=0.05)
    B.get(W, 0.0, tag='NoseTip', sm=True).sphere(px, py, rz + 7.63, 0.09, 0.09, 0.12, seg=12, rings=8)
    # portholes down the hull, facing the camera side
    for i, z in enumerate((rz + 3.5, rz + 4.2)):
        for a in (250, 290):
            r_ = math.radians(a + (0 if i == 0 else 20))
            hx, hy = px + 0.74 * math.cos(r_), py + 0.74 * math.sin(r_)
            B.get(PW, 0.0, tag='PortRims', sm=True).cyl(hx, hy, z, 0.19, 0.06, seg=20, axis='X', rot=math.degrees(r_))
            (lit if a == 290 else glass).cyl(hx + 0.03 * math.cos(r_), hy + 0.03 * math.sin(r_), z, 0.13, 0.06, seg=20,
                                             axis='X', rot=math.degrees(r_))
    # the capsule hatch where the arm meets it
    B.get('MC_GLASS_LIT', 0.0, tag='Hatch').box(px + 0.52, py + 0.52, rz + 4.98, 0.36, 0.06, 0.38, rot=45)
    fins = B.get(YE, 0.02, tag='Fins')
    for i in range(4):
        fin(fins, px, py, math.pi / 4 + i * math.pi / 2, 0.7, rz - 0.05, 1.45, 0.75)

    # ------------------------------------------------------ THE SERVICE TOWER
    tx, ty = TOWER
    top = Z + 7.0                                                          # below the rocket's nose: the rocket is the landmark
    posts = B.get('MC_METAL_DARK', 0.0, tag='TowerPosts')
    brace = B.get(IN, 0.0, tag='TowerBraces')
    s = 0.55
    corners = [(tx - s, ty - s), (tx + s, ty - s), (tx + s, ty + s), (tx - s, ty + s)]
    B.get('MC_CONCRETE', 0.02, tag='TowerFoot').box(tx, ty, Z, 1.6, 1.6, 0.22)
    for x, y in corners:
        posts.box(x, y, Z + 0.22, 0.12, 0.12, top - Z - 0.22)
    lv = [Z + 0.22 + k * 1.13 for k in range(7)]
    for k in range(len(lv) - 1):
        z0, z1 = lv[k], lv[k + 1]
        for i in range(4):
            a, b = corners[i], corners[(i + 1) % 4]
            if i in (0, 1):                                                # the faces the camera sees
                brace.beam((a[0], a[1], z0), (b[0], b[1], z1), 0.05)
            posts.box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z1 - 0.03, abs(a[0] - b[0]) + 0.12, abs(a[1] - b[1]) + 0.12, 0.06)
    for z in (Z + 2.6, Z + ARM_Z - 0.08):                                  # platforms
        B.get(YE, 0.01, tag='Platforms').box(tx, ty, z, 1.5, 1.5, 0.08)
    # the access arm to the capsule, its floor and rails
    az = Z + ARM_Z
    ax0, ay0 = tx - 0.6, ty - 0.6
    ax1, ay1 = px + 0.62, py + 0.62
    B.get(YE, 0.01, tag='Arm').beam((ax0, ay0, az + 0.04), (ax1, ay1, az + 0.04), 0.62, 0.08)
    rails = B.get('MC_METAL', 0.0, tag='ArmRails')
    for off in (-0.3, 0.3):
        ox_, oy_ = off * 0.707, -off * 0.707
        rails.beam((ax0 + ox_, ay0 + oy_, az + 0.6), (ax1 + ox_, ay1 + oy_, az + 0.6), 0.035)
        for t in (0.0, 0.5, 1.0):
            x, y = ax0 + (ax1 - ax0) * t + ox_, ay0 + (ay1 - ay0) * t + oy_
            rails.box(x, y, az + 0.08, 0.035, 0.035, 0.52)
    B.get('MC_METAL', 0.02, tag='Umbilical', sm=True).cyl(tx - 0.5, ty - 0.2, Z + 3.4, 0.07, 1.4, seg=10)
    B.get(IN, 0.02, tag='TowerCab').box(tx, ty, top - 0.1, 1.3, 1.3, 0.35)
    beacon(B, status_coll, 'SK', tx, ty, top + 0.25, r=0.26)
    B.get('MC_METAL', 0.0, tag='Aerial', sm=True).cyl(tx + 0.45, ty + 0.45, top + 0.25, 0.025, 1.0, seg=8)

    # ------------------------------------------------------- THE CLASSROOM
    cx0, cx1, cy0, cy1, ch = -6.7, -0.3, 2.9, 6.5, 2.7
    ccx, ccy = (cx0 + cx1) / 2, (cy0 + cy1) / 2
    slab('SK_ClassBase', cx1 - cx0 + 0.3, cy1 - cy0 + 0.3, 1.8, Z, 0.28, mat(IN), coll, cx=ccx, cy=ccy, bevel=0.03)
    cls = slab('SK_Class', cx1 - cx0, cy1 - cy0, 1.7, Z + 0.28, ch - 0.28, mat(W), coll, cx=ccx, cy=ccy, bevel=0.035)
    door_x = -2.2
    cut(cls, [(door_x, cy0 + 0.15, Z + 0.28, 1.0, 0.4, 1.85)])
    link(cls, coll)
    slab('SK_ClassRoof', cx1 - cx0 + 0.4, cy1 - cy0 + 0.4, 1.9, Z + ch, 0.22, mat(PW), coll, cx=ccx, cy=ccy, bevel=0.035)
    slab('SK_ClassDeck', cx1 - cx0 - 0.5, cy1 - cy0 - 0.5, 1.45, Z + ch + 0.22, 0.08, mat(W), coll, cx=ccx, cy=ccy, bevel=0.02)
    # portholes along the front, a lit classroom behind two of them
    for i, x in enumerate((-5.6, -4.45, -3.3, -1.1)):
        B.get(PW, 0.0, tag='PortRims', sm=True).cyl(x, cy0 - 0.02, Z + 1.55, 0.44, 0.08, seg=28, axis='Y')
        (lit if i in (1, 3) else glass).cyl(x, cy0 - 0.06, Z + 1.55, 0.34, 0.08, seg=28, axis='Y')
    B.get(PW, 0.015, tag='Door').box(door_x, cy0 - 0.02, Z + 0.28, 0.9, 0.06, 1.8)
    B.get('MC_GLASS_LIT', 0.0, tag='DoorPort', sm=True).cyl(door_x, cy0 - 0.08, Z + 1.55, 0.18, 0.05, seg=16, axis='Y')
    B.get(PW, 0.0, tag='DoorCanopy').vault(door_x - 0.8, door_x + 0.8, cy0 - 0.55, Z + 2.2, 0.55, 0.35, seg=16)
    # on the roof: the children's telescope on a tripod, an antenna, solar panels
    rtop = Z + ch + 0.3
    tri = B.get('MC_METAL_DARK', 0.0, tag='Tripod')
    for a in (0, 120, 240):
        r_ = math.radians(a)
        tri.beam((-4.9 + 0.35 * math.cos(r_), 4.9 + 0.35 * math.sin(r_), rtop), (-4.9, 4.9, rtop + 0.9), 0.04)
    B.get(W, 0.0, tag='RoofScope').beam((-4.9, 5.15, rtop + 0.78), (-4.9, 4.4, rtop + 1.25), 0.18)
    B.get('MC_METAL', 0.0, tag='Aerial', sm=True).cyl(-1.6, 5.6, rtop, 0.03, 1.6, seg=8)
    B.get('MC_METAL', 0.0, tag='AerialBars').box(-1.6, 5.6, rtop + 1.3, 0.6, 0.03, 0.03)
    for k in range(3):
        B.get('MC_GLASS', 0.01, tag='Solar').box(-3.3 + k * 0.85, 5.4, rtop + 0.12, 0.75, 1.0, 0.05)
        B.get('MC_METAL_DARK', 0.0, tag='SolarLegs').box(-3.3 + k * 0.85, 5.4, rtop, 0.05, 0.6, 0.14)

    # --------------------------------------------------- THE MISSION BOOTH
    bx, by = 1.95, 0.35
    B.get(IN, 0.03, tag='Booth').box(bx, by, Z, 1.8, 1.5, 1.95)
    rect(B.get('MC_GLASS_LIT', 0.0, tag='BoothGlass'), bx - 0.72, bx + 0.72, by + 0.74, by + 0.78, Z + 0.95, 0.75)
    rect(B.get('MC_GLASS', 0.0, tag='BoothFront'), bx - 0.72, bx + 0.72, by - 0.78, by - 0.74, Z + 1.0, 0.7)
    B.get(W, 0.02, tag='BoothRoof').box(bx, by, Z + 1.95, 2.0, 1.7, 0.12)
    B.get(PW, 0.0, tag='BoothBand').box(bx, by - 0.76, Z + 0.55, 1.82, 0.03, 0.14)

    def dish(b):
        b.cyl(0, 0, 0.0, 0.05, 0.4, seg=10)
        b.beam((0, 0, 0.35), (0, 0.18, 0.62), 0.05)
    mast = life_object('SK_DishMast', 'MC_METAL_DARK', coll, dish, (bx + 0.35, by + 0.2, Z + 2.07))

    def dish_bowl(b):
        b.cyl(0, 0.2, 0.62, 0.42, 0.12, seg=24, radius2=0.18, axis='Y')
    bowl = life_object('SK_Dish', 'MC_METAL', coll, dish_bowl, (bx + 0.35, by + 0.2, Z + 2.07))
    for o in (mast, bowl):
        key(o, 'rotation_euler', [(1, (0, 0, 0)), (LIFE_FRAMES + 1, (0, 0, 2 * math.pi))])
        push_life(o)

    # -------------------------------------------------- THE CRATER AND PLAY
    mx, my = -2.8, -2.2
    frame('SK_CraterRim', 4.4, 4.4, 2.2, 3.6, 3.6, 1.8, Z, 0.26, mat('MC_CONCRETE'), coll, bevel=0.04, n=10, cx=mx, cy=my)
    slab('SK_CraterFloor', 3.6, 3.6, 1.8, Z, 0.05, mat('MC_CONCRETE_DK'), coll, cx=mx, cy=my, bevel=0.0, n=10)
    for dx, dy, r in ((-0.9, 0.5, 0.35), (0.8, -0.7, 0.28), (0.9, 0.8, 0.22)):
        frame('SK_Pock', 2 * r + 0.14, 2 * r + 0.14, r + 0.07, 2 * r, 2 * r, r, Z + 0.05, 0.05, mat('MC_CONCRETE'), coll,
              bevel=0.0, n=6, cx=mx + dx, cy=my + dy)
    # the planet mobile: a mast in the crater, its sun, planets on arms going round
    B.get('MC_METAL_DARK', 0.0, tag='MobileMast', sm=True).cyl(mx, my, Z + 0.05, 0.06, 2.1, seg=10)
    B.get(YE, 0.0, tag='Sun', sm=True).sphere(mx, my, Z + 2.3, 0.34, 0.34, 0.34, seg=24, rings=14)
    orbit = []
    for r_, a0, pr, col, zz in ((0.95, 0, 0.16, PW, 2.2), (1.45, 2.2, 0.22, 'MC_CS_CORAL', 2.05), (1.95, 4.1, 0.19, IN, 2.3)):
        def arm(b, r_=r_, a0=a0, zz=zz):
            b.beam((0, 0, zz), (r_ * math.cos(a0), r_ * math.sin(a0), zz), 0.03)
        def planet(b, r_=r_, a0=a0, pr=pr, zz=zz):
            b.sphere(r_ * math.cos(a0), r_ * math.sin(a0), zz, pr, pr, pr, seg=16, rings=10)
        orbit += [(IN, arm), (col, planet)]
    ring = lambda b: b.cyl(1.45 * math.cos(2.2), 1.45 * math.sin(2.2), 2.04, 0.34, 0.02, seg=24)
    orbit.append((YE, ring))
    mob = life_group('SK_Planets', orbit, coll, (mx, my, Z))
    key(mob, 'rotation_euler', [(1, (0, 0, 0)), (LIFE_FRAMES + 1, (0, 0, 2 * math.pi))])
    push_life(mob)
    # learning blocks: blank, stacked, the colours of the place
    for i, (dx, dy, z, c) in enumerate(((0.0, 0.0, 0, PW), (0.5, 0.05, 0, YE), (0.25, 0.02, 0.45, W),
                                        (0.95, -0.4, 0, IN), (-0.2, -0.5, 0, W))):
        B.get(c, 0.03, tag='Blocks').box(0.3 + dx, -3.9 + dy, Z + z, 0.44, 0.44, 0.44, rot=10 * i)
    # the rocket slide: a small tower, a ladder, a curved chute
    sx, sy = -5.9, -1.0
    B.get(W, 0.02, tag='SlideTower', sm=False).box(sx, sy, Z, 0.9, 0.9, 1.4)
    gable(B.get(PW, 0.02, tag='SlideRoof'), sx - 0.55, sx + 0.55, sy - 0.55, sy + 0.55, Z + 1.4, 0.7, ridge='x')
    chute = B.get(YE, 0.01, tag='Chute')
    chute.beam((sx, sy - 0.45, Z + 1.2), (sx, sy - 2.3, Z + 0.25), 0.62, 0.06)
    for off in (-0.33, 0.33):
        chute.beam((sx + off, sy - 0.45, Z + 1.35), (sx + off, sy - 2.3, Z + 0.4), 0.05, 0.2)
    lad = B.get('MC_METAL', 0.0, tag='Ladder')
    for off in (-0.25, 0.25):
        lad.beam((sx + off, sy + 0.9, Z), (sx + off, sy + 0.45, Z + 1.4), 0.04)
    for k in range(4):
        t = (k + 1) / 5
        lad.box(sx, sy + 0.9 - 0.45 * t, Z + 1.4 * t, 0.5, 0.04, 0.04)
    rect(B.get('MC_CONCRETE_DK', 0.0, tag='SoftFloor'), sx - 0.9, sx + 0.9, sy - 2.8, sy + 1.2, Z, 0.02)
    # the star path from the street to the classroom door
    stars = B.get(YE, 0.0, tag='Stars')
    for i, (x, y) in enumerate(((0.9, -6.6), (0.5, -5.6), (0.6, -4.7), (-0.1, -1.3), (-0.9, 0.2), (-1.6, 1.3), (-2.1, 2.2))):
        star(stars, x, y, Z, 0.36 if i % 2 else 0.3)
    # lawn, trees and the street edge
    slab('SK_Lawn', 3.6, 2.2, 0.5, Z, 0.08, mat('MC_GRASS'), coll, cx=4.9, cy=-4.9, bevel=0.02)
    frame('SK_LawnCurb', 3.84, 2.44, 0.62, 3.6, 2.2, 0.5, Z, 0.14, mat(W), coll, bevel=0.012, cx=4.9, cy=-4.9)
    tree(B, 4.2, -4.8, 0.9, pit=False, z=Z + 0.08)
    tree(B, 6.0, -5.2, 0.75, pit=False, z=Z + 0.08)
    tree(B, -6.3, -5.9, 0.9)
    tree(B, 6.4, -1.3, 0.85)
    # a viewing stand for the children, three steps facing the pad
    for k in range(3):
        B.get(W if k % 2 == 0 else PW, 0.02, tag='Stand').box(3.4, -3.0 - k * 0.45, Z, 2.6, 0.45, 0.3 + k * 0.3)
    for x in (2.1, 4.7):
        B.get(IN, 0.02, tag='StandEnds').box(x, -3.45, Z, 0.08, 1.35, 1.0)
    # fuel: two spheres on legs by the tower, piped to the pad
    for k, y in enumerate((1.2, -0.05)):
        B.get(W, 0.0, tag='Tanks', sm=True).sphere(6.45, y, Z + 1.05, 0.52, 0.52, 0.52, seg=24, rings=14)
        B.get(PW, 0.0, tag='TankBands', sm=True).cyl(6.45, y, Z + 1.0, 0.53, 0.1, seg=24)
        for a in (45, 135, 225, 315):
            r_ = math.radians(a)
            B.get('MC_METAL_DARK', 0.0, tag='TankLegs').box(6.45 + 0.34 * math.cos(r_), y + 0.34 * math.sin(r_), Z, 0.07, 0.07, 0.72)
    pipe = B.get('MC_METAL', 0.0, tag='Pipes')
    pipe.beam((6.45, 0.55, Z + 0.12), (4.9, 2.6, Z + 0.12), 0.08)
    pipe.beam((6.45, 0.55, Z + 0.12), (6.45, 1.2, Z + 0.12), 0.08)
    tree(B, 0.6, 4.6, 0.8)
    planter(B, -4.6, 2.35, 0.9, 0.42)
    planter(B, -6.2, 1.8, 0.9, 0.42)
    planter(B, 0.2, 2.2, 0.9, 0.42)
    for x, y in ((-4.8, -5.4), (1.9, -5.9), (6.6, 1.5), (-0.4, -2.3)):
        lamp(B, x, y)
    B.finish()
    return B
