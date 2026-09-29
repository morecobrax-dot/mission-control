"""The Mission Control worker base.

One low-detail, stylised crew member, about 1.2 m tall, facing local +Y.
A segmented rigid rig: 13 bones, every part weighted 100% to one bone, so it
exports to glTF as a plain skinned mesh. The helmet band is its own object,
parented to the head bone, and uses the shared MC_STATUS_LIGHT material.

Clips: MC_IDLE, MC_WORKING (clipboard), MC_ACTIVE (a run cycle), MC_SIGNAL
(an arm raised to the beacon) and MC_REPAIR (bent over a job). Every rig
carries all five, so the app can change what a worker is doing without a
new model.

Rotation directions on this rig, measured rather than assumed: the worker
faces local +Y. On an upward bone (spine, head, hips) +X tilts BACK and -X
tilts forward. On a downward bone (arms, legs) +X swings FORWARD. +Z moves a
downward bone's tip toward -X, which is inward for the left (.L, +X) side and
outward for the right.
"""
import bpy
import bmesh
import math
from mathutils import Vector, Matrix
from mc_lib import obj_from_bm, mat, link, add_bevel

BONES = [
    # name, parent, head, tail
    ('hips',        None,        (0, 0, 0.46),       (0, 0, 0.56)),
    ('spine',       'hips',      (0, 0, 0.56),       (0, 0, 0.80)),
    ('head',        'spine',     (0, 0, 0.80),       (0, 0, 1.14)),
    ('upperarm.L',  'spine',     (0.19, 0, 0.83),    (0.19, 0, 0.65)),
    ('forearm.L',   'upperarm.L', (0.19, 0, 0.65),   (0.19, 0, 0.47)),
    ('upperarm.R',  'spine',     (-0.19, 0, 0.83),   (-0.19, 0, 0.65)),
    ('forearm.R',   'upperarm.R', (-0.19, 0, 0.65),  (-0.19, 0, 0.47)),
    ('thigh.L',     'hips',      (0.075, 0, 0.46),   (0.075, 0, 0.26)),
    ('shin.L',      'thigh.L',   (0.075, 0, 0.26),   (0.075, 0, 0.06)),
    ('thigh.R',     'hips',      (-0.075, 0, 0.46),  (-0.075, 0, 0.26)),
    ('shin.R',      'thigh.R',   (-0.075, 0, 0.26),  (-0.075, 0, 0.06)),
]


class Parts:
    """Primitives accumulated into one bmesh, each welded to a bone group."""

    def __init__(self, materials):
        self.bm = bmesh.new()
        self.mats = materials          # list of material names -> slot index
        self.deform = self.bm.verts.layers.deform.verify()

    def add(self, kind, bone, mname, center, size, seg=16, rings=10, tilt=0.0, spin=0.0):
        bm = self.bm
        if kind == 'sphere':
            r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
            verts = r['verts']
            bmesh.ops.scale(bm, vec=size, verts=verts)
        elif kind == 'cyl':      # size = (radius_x, radius_y, height); origin at the centre
            r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                                      radius1=1.0, radius2=1.0, depth=1.0)
            verts = r['verts']
            bmesh.ops.scale(bm, vec=size, verts=verts)
        elif kind == 'box':
            r = bmesh.ops.create_cube(bm, size=1.0)
            verts = r['verts']
            bmesh.ops.scale(bm, vec=size, verts=verts)
        if tilt:
            bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(tilt), 4, 'X'), verts=verts)
        if spin:
            bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(spin), 4, 'Z'), verts=verts)
        bmesh.ops.translate(bm, vec=center, verts=verts)
        idx = self.mats.index(mname)
        faces = {f for v in verts for f in v.link_faces}
        for f in faces:
            f.material_index = idx
            f.smooth = kind != 'box'
        for v in verts:
            v[self.deform][self.bone_index(bone)] = 1.0
        return verts

    def bone_index(self, bone):
        return [b[0] for b in BONES].index(bone)


def _armature(name, coll, s=1.0):
    arm = bpy.data.armatures.new(name)
    obj = bpy.data.objects.new(name, arm)
    coll.objects.link(obj)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n, parent, h, t in BONES:
        b = arm.edit_bones.new(n)
        b.head, b.tail = Vector(h) * s, Vector(t) * s
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        eb[n] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)
    return obj


OUTFITS = {
    # colour blocking that survives a thumbnail: a white helmet, a saturated
    # mid body and dark legs, against light paving or terracotta rubber
    'crew':    dict(vest='MC_PAINT_BLUE', shirt='MC_PAINT_NAVY', pants='MC_PLINTH_DK', stripe=True),
    'tech':    dict(vest='MC_PLINTH_DK', shirt='MC_PLINTH_DK', pants='MC_PAINT_NAVY', stripe=True),
    'kit': dict(vest='MC_PAINT_WHITE', shirt='MC_PAINT_BLUE', pants='MC_PAINT_NAVY', stripe=False),
    # DayPlan's crew wears its district's rose on graphite
    'dp_crew': dict(vest='MC_DP_ROSE', shirt='MC_DP_GRAPHITE', pants='MC_PLINTH_DK', stripe=True),
    'dp_tech': dict(vest='MC_DP_GRAPHITE', shirt='MC_DP_GRAPHITE', pants='MC_DP_ROSE_DK', stripe=True),
}


def _body(name, coll, vest, pants, shirt, prop=None, stripe=False):
    order = ['MC_SKIN', vest, pants, shirt, 'MC_PAINT_WHITE', 'MC_METAL_DARK', 'MC_WOOD', 'MC_METAL',
             'MC_GLASS_LIT']
    mats = list(dict.fromkeys(order))
    P = Parts(mats)
    S, V, PA, SH, HELM, DK, WD = 'MC_SKIN', vest, pants, shirt, 'MC_PAINT_WHITE', 'MC_METAL_DARK', 'MC_WOOD'
    # legs
    for side, sx in (('L', 0.075), ('R', -0.075)):
        P.add('cyl', 'thigh.' + side, PA, (sx, 0, 0.36), (0.062, 0.062, 0.22), seg=10)
        P.add('cyl', 'shin.' + side, PA, (sx, 0, 0.16), (0.052, 0.052, 0.2), seg=10)
        P.add('box', 'shin.' + side, DK, (sx, 0.025, 0.035), (0.105, 0.19, 0.07))
    # pelvis and torso
    P.add('sphere', 'hips', PA, (0, 0, 0.5), (0.15, 0.105, 0.1))
    P.add('sphere', 'spine', V, (0, 0, 0.7), (0.175, 0.12, 0.2), seg=14, rings=9)
    P.add('sphere', 'spine', SH, (0, 0, 0.87), (0.17, 0.105, 0.045), seg=12, rings=7)
    if stripe:
        P.add('cyl', 'spine', HELM, (0, 0, 0.64), (0.172, 0.118, 0.028), seg=16)
    # arms: short sleeves, bare forearms, round hands
    for side, sx in (('L', 0.205), ('R', -0.205)):
        P.add('sphere', 'upperarm.' + side, SH, (sx, 0, 0.82), (0.065, 0.065, 0.065))
        P.add('cyl', 'upperarm.' + side, SH, (sx, 0, 0.73), (0.05, 0.05, 0.15), seg=10)
        P.add('cyl', 'forearm.' + side, S, (sx, 0, 0.56), (0.042, 0.042, 0.17), seg=10)
        P.add('sphere', 'forearm.' + side, S, (sx, 0, 0.46), (0.048, 0.048, 0.048), seg=10, rings=7)
    # head, face and hard hat
    P.add('sphere', 'head', S, (0, 0, 0.98), (0.135, 0.125, 0.14), seg=16, rings=10)
    for ex in (0.048, -0.048):
        P.add('sphere', 'head', DK, (ex, 0.115, 0.985), (0.017, 0.012, 0.024), seg=6, rings=4)
    P.add('sphere', 'head', S, (0, 0.13, 0.955), (0.02, 0.018, 0.016), seg=8, rings=6)
    dome = P.add('sphere', 'head', HELM, (0, 0, 1.03), (0.152, 0.145, 0.13), seg=16, rings=10)
    for v in dome:                                # keep the upper dome only
        if v.co.z < 1.03 - 0.005:
            v.co.z = 1.03 - 0.005
    P.add('box', 'head', HELM, (0, 0.135, 1.035), (0.12, 0.07, 0.022))   # short brim
    if prop == 'clipboard':
        P.add('box', 'forearm.L', WD, (0.235, 0.075, 0.5), (0.03, 0.17, 0.21))
        P.add('box', 'forearm.L', 'MC_PAINT_WHITE', (0.235, 0.09, 0.505), (0.022, 0.15, 0.19))
    elif prop == 'tablet':
        P.add('box', 'forearm.L', DK, (0.235, 0.07, 0.49), (0.03, 0.2, 0.15))
        P.add('box', 'forearm.L', 'MC_GLASS_LIT', (0.218, 0.07, 0.49), (0.006, 0.17, 0.12))
    elif prop == 'wrench':
        P.add('box', 'forearm.R', 'MC_METAL', (-0.205, 0.0, 0.36), (0.035, 0.035, 0.2))
        P.add('box', 'forearm.R', 'MC_METAL', (-0.205, 0.0, 0.27), (0.07, 0.035, 0.035))
    me = bpy.data.meshes.new(name)
    P.bm.to_mesh(me)
    P.bm.free()
    for m in mats:
        me.materials.append(mat(m))
    obj = bpy.data.objects.new(name, me)
    coll.objects.link(obj)
    for n, *_ in BONES:
        obj.vertex_groups.new(name=n)
    return obj


def _band(name, coll, arm):
    bm = bmesh.new()
    r = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=24, radius1=0.158, radius2=0.158, depth=0.035)
    bmesh.ops.translate(bm, vec=(0, 0, 1.02), verts=r['verts'])
    o = obj_from_bm(name, bm, mat('MC_STATUS_LIGHT'), coll)
    o.data.shade_smooth()
    o['status_role'] = 'helmet'
    o.vertex_groups.new(name='head').add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    o.parent = arm
    m = o.modifiers.new('MC_Armature', 'ARMATURE')
    m.object = arm
    return o


def _key(pb, frame, rot=None, loc=None):
    if rot is not None:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = tuple(math.radians(a) for a in rot)
        pb.keyframe_insert('rotation_euler', frame=frame)
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert('location', frame=frame)


def _action(arm, name, keys, length):
    """keys: {bone: [(frame, (rx, ry, rz)), ...]} in degrees."""
    ad = arm.animation_data_create()
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
    for bone, frames in keys.items():
        pb = arm.pose.bones[bone]
        for f, rot in frames:
            _key(pb, f, rot=rot)
    act.frame_range = (1, length)
    return act


def author_actions(arm):
    """Five 48-frame clips. Signs follow the measured directions in the module
    docstring: forward lean is -X on the spine, a forward arm swing is +X."""
    idle = {
        'spine':      [(1, (0, 0, 0)), (24, (-1.5, 0, 1.0)), (48, (0, 0, 0))],
        'head':       [(1, (0, 0, 0)), (24, (1.0, 0, -2.0)), (48, (0, 0, 0))],
        'upperarm.L': [(1, (3, 0, -5)), (24, (5, 0, -6)), (48, (3, 0, -5))],
        'upperarm.R': [(1, (3, 0, 5)), (24, (1, 0, 6)), (48, (3, 0, 5))],
        'forearm.L':  [(1, (10, 0, 0)), (48, (10, 0, 0))],
        'forearm.R':  [(1, (10, 0, 0)), (48, (10, 0, 0))],
    }
    # clipboard up in the left hand, right hand ticking, head down to the board
    work = {
        'spine':      [(1, (-6, 0, 0)), (24, (-7, 0, 2)), (48, (-6, 0, 0))],
        'head':       [(1, (-16, 0, 0)), (24, (-12, 0, -8)), (48, (-16, 0, 0))],
        'upperarm.L': [(1, (38, 0, -4)), (48, (38, 0, -4))],
        'forearm.L':  [(1, (70, 0, 0)), (48, (70, 0, 0))],
        'upperarm.R': [(1, (34, 0, -14)), (12, (38, 0, -14)), (24, (34, 0, -14)), (36, (38, 0, -14)), (48, (34, 0, -14))],
        'forearm.R':  [(1, (74, 0, 0)), (12, (82, 0, 0)), (24, (74, 0, 0)), (36, (82, 0, 0)), (48, (74, 0, 0))],
    }

    # a run cycle, two strides per clip; frame 1 is the readable extreme
    def cyc(a_, b_):
        return [(1, a_), (13, b_), (25, a_), (37, b_), (49, a_)]
    run = {
        'spine':      cyc((-12, 0, 3), (-12, 0, -3)),
        'head':       cyc((8, 0, 0), (8, 0, 0)),
        'thigh.L':    cyc((42, 0, 0), (-30, 0, 0)),
        'shin.L':     cyc((-18, 0, 0), (-75, 0, 0)),
        'thigh.R':    cyc((-30, 0, 0), (42, 0, 0)),
        'shin.R':     cyc((-75, 0, 0), (-18, 0, 0)),
        'upperarm.L': cyc((-40, 0, -6), (48, 0, -6)),
        'upperarm.R': cyc((48, 0, 6), (-40, 0, 6)),
        'forearm.L':  cyc((70, 0, 0), (80, 0, 0)),
        'forearm.R':  cyc((80, 0, 0), (70, 0, 0)),
    }
    # tablet in the left hand, right arm raised out to the side (clear of the
    # head from any view) toward the beacon, a slow wave
    signal = {
        'spine':      [(1, (2, 0, 0)), (48, (2, 0, 0))],
        'head':       [(1, (14, 0, 4)), (24, (16, 0, 2)), (48, (14, 0, 4))],
        'upperarm.L': [(1, (36, 0, -4)), (48, (36, 0, -4))],
        'forearm.L':  [(1, (68, 0, 0)), (48, (68, 0, 0))],
        'upperarm.R': [(1, (15, 0, 145)), (24, (15, 0, 160)), (48, (15, 0, 145))],
        'forearm.R':  [(1, (0, 0, 10)), (48, (0, 0, 10))],
    }
    # bent over a job, both hands in, the right hand turning a tool
    repair = {
        'spine':      [(1, (-34, 0, 0)), (24, (-36, 0, 2)), (48, (-34, 0, 0))],
        'head':       [(1, (-8, 0, 0)), (48, (-8, 0, 0))],
        'thigh.L':    [(1, (8, 0, 0)), (48, (8, 0, 0))],
        'thigh.R':    [(1, (-6, 0, 0)), (48, (-6, 0, 0))],
        'upperarm.L': [(1, (58, 0, -2)), (48, (58, 0, -2))],
        'forearm.L':  [(1, (28, 0, 0)), (48, (28, 0, 0))],
        'upperarm.R': [(1, (62, 0, 6)), (48, (62, 0, 6))],
        'forearm.R':  [(1, (22, 0, 0)), (12, (40, 0, 0)), (24, (22, 0, 0)), (36, (40, 0, 0)), (48, (22, 0, 0))],
    }
    out = {}
    for pose, name, keys in (('IDLE', 'MC_IDLE', idle), ('WORKING', 'MC_WORKING', work),
                             ('ACTIVE', 'MC_ACTIVE', run), ('SIGNAL', 'MC_SIGNAL', signal),
                             ('REPAIR', 'MC_REPAIR', repair)):
        out[pose] = _action(arm, name, keys, 48)
    return out


CLIPS = ('MC_IDLE', 'MC_WORKING', 'MC_ACTIVE', 'MC_SIGNAL', 'MC_REPAIR')


def make_worker(coll, status_coll, name='MC_Worker', loc=(0, 0, 0), rot_z=0.0, pose='IDLE',
                outfit='crew', prop=None, scale=1.0):
    arm = _armature(name + '_Rig', coll, scale)
    body = _body(name, coll, prop=prop, **OUTFITS[outfit])
    body.data.transform(Matrix.Scale(scale, 4))
    body.parent = arm
    mod = body.modifiers.new('MC_Armature', 'ARMATURE')
    mod.object = arm
    band = _band(name + '_HelmetBand', status_coll, arm)
    band.data.transform(Matrix.Scale(scale, 4))
    acts = author_actions(arm)
    arm.animation_data.action = acts[pose]
    arm.location = loc
    arm.rotation_euler.z = math.radians(rot_z)
    arm['worker_pose'] = pose
    arm['worker_outfit'] = outfit
    arm['mc_clips'] = ','.join(a.name for a in acts.values())
    bpy.context.scene.frame_set(1)
    return arm, body


def build_worker_base(coll, status_coll):
    """The reference worker, parked out of frame and hidden from render."""
    arm, body = make_worker(coll, status_coll, name='MC_WorkerBase', loc=(-16, -60, 0), pose='WORKING', prop='clipboard')
    for o in (arm, body):
        o.hide_render = True
    for o in bpy.data.objects:
        if o.name.startswith('MC_WorkerBase') and o.type == 'MESH':
            o.hide_render = True
    return arm, body


# where (x, y, z of the feet), facing (degrees about Z; 180 faces -y, 225 faces
# the camera, 270 faces +x), pose, prop, outfit. Heights are the surface the
# feet stand on: deck 1.0, path 1.03, rubber floor 1.05, track 1.10, roof track 5.57.
# The runner is set 0.075 lower so the leading foot, not the hip, meets the track.
GD_WORKERS = [
    ('coach',  (-2.05, -2.25, 1.0), 250, 'WORKING', 'clipboard', 'crew'),
    ('runner', (0.7, -1.13, 1.025), 270, 'ACTIVE', None, 'kit'),
    ('signal', (4.25, -2.4, 1.03), 205, 'SIGNAL', 'tablet', 'crew'),
    ('tech',   (-1.05, 3.98, 5.57), 0, 'REPAIR', 'wrench', 'tech'),
    ('lifter', (-5.0, -1.95, 1.05), 215, 'REPAIR', None, 'kit'),
    ('rest',   (5.55, -3.35, 1.0), 150, 'IDLE', None, 'crew'),
]


def place_workers(coll, status_coll, layout, prefix):
    """A district's crew from its layout: (role, feet, facing, pose, prop, outfit)."""
    out = []
    for tag, loc, rz, pose, prop, outfit in layout:
        arm, body = make_worker(coll, status_coll, name=prefix + '_Worker_' + tag, loc=loc, rot_z=rz, pose=pose,
                                prop=prop, outfit=outfit, scale=1.4)
        arm['mc_role'] = tag
        out.append((arm, body))
    return out
