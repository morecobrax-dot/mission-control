"""The Mission Control worker base.

One low-detail, stylised crew member, about 1.2 m tall, facing local +Y.
A segmented rigid rig: 13 bones, every part weighted 100% to one bone, so it
exports to glTF as a plain skinned mesh. The helmet band is its own object,
parented to the head bone, and uses the shared MC_STATUS_LIGHT material.

Actions: MC_IDLE and MC_WORKING are authored. The bone set already carries
what walk, clipboard/QA, wave, point, blocked/warning and celebrate will need
(both arms and both forearms, hips, spine, head); they are future keyframes,
not future rigging.
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


def _body(name, coll, vest, pants, shirt, prop=None):
    mats = ['MC_SKIN', vest, pants, shirt, 'MC_PAINT_WHITE', 'MC_METAL_DARK', 'MC_WOOD']
    P = Parts(mats)
    S, V, PA, SH, HELM, DK, WD = mats
    # legs
    for side, sx in (('L', 0.075), ('R', -0.075)):
        P.add('cyl', 'thigh.' + side, PA, (sx, 0, 0.36), (0.062, 0.062, 0.22), seg=10)
        P.add('cyl', 'shin.' + side, PA, (sx, 0, 0.16), (0.052, 0.052, 0.2), seg=10)
        P.add('box', 'shin.' + side, DK, (sx, 0.025, 0.035), (0.105, 0.19, 0.07))
    # pelvis and torso
    P.add('sphere', 'hips', PA, (0, 0, 0.5), (0.15, 0.105, 0.1))
    P.add('sphere', 'spine', V, (0, 0, 0.7), (0.175, 0.12, 0.2), seg=14, rings=9)
    P.add('sphere', 'spine', SH, (0, 0, 0.87), (0.17, 0.105, 0.045), seg=12, rings=7)
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
    # IDLE: a slow breath, a small weight shift, arms hanging with a little sway
    idle = {
        'spine':      [(1, (0, 0, 0)), (24, (1.5, 0, 1.0)), (48, (0, 0, 0))],
        'head':       [(1, (0, 0, 0)), (24, (-1.0, 0, -2.0)), (48, (0, 0, 0))],
        'upperarm.L': [(1, (2, 0, -4)), (24, (4, 0, -5)), (48, (2, 0, -4))],
        'upperarm.R': [(1, (2, 0, 4)), (24, (0, 0, 5)), (48, (2, 0, 4))],
        'forearm.L':  [(1, (-6, 0, 0)), (48, (-6, 0, 0))],
        'forearm.R':  [(1, (-6, 0, 0)), (48, (-6, 0, 0))],
    }
    a_idle = _action(arm, 'MC_IDLE', idle, 48)
    # WORKING: clipboard up in the left hand, right hand ticking, head down to the board
    work = {
        'spine':      [(1, (5, 0, 0)), (24, (6, 0, 2)), (48, (5, 0, 0))],
        'head':       [(1, (14, 0, 0)), (24, (10, 0, -8)), (48, (14, 0, 0))],
        'upperarm.L': [(1, (-62, 0, -10)), (48, (-62, 0, -10))],
        'forearm.L':  [(1, (-72, 0, 0)), (48, (-72, 0, 0))],
        'upperarm.R': [(1, (-52, 0, 12)), (12, (-56, 0, 12)), (24, (-52, 0, 12)), (36, (-56, 0, 12)), (48, (-52, 0, 12))],
        'forearm.R':  [(1, (-78, 0, 0)), (12, (-70, 0, 0)), (24, (-78, 0, 0)), (36, (-70, 0, 0)), (48, (-78, 0, 0))],
    }
    a_work = _action(arm, 'MC_WORKING', work, 48)
    return {'IDLE': a_idle, 'WORKING': a_work}


def make_worker(coll, status_coll, name='MC_Worker', loc=(0, 0, 0), rot_z=0.0, pose='IDLE',
                vest='MC_PAINT_BLUE', pants='MC_PAINT_NAVY', shirt='MC_PAINT_CREAM', prop=None, scale=1.0):
    arm = _armature(name + '_Rig', coll, scale)
    body = _body(name, coll, vest, pants, shirt, prop=prop)
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


GD_WORKERS = [
    # where, facing (degrees about Z; 180 faces -y, 225 faces the camera), pose, prop
    ('yard_coach', (-1.55, -2.35, 1.0), 200, 'WORKING', 'clipboard'),
    ('pergola',    (-4.2, -3.9, 1.05), 215, 'IDLE', None),
    ('sprint',     (4.55, -0.9, 1.0), 235, 'IDLE', None),
    ('lawn',       (1.1, -4.4, 1.0), 210, 'IDLE', None),
    ('roof',       (-4.9, 3.0, 5.69), 240, 'IDLE', None),
]


def place_golden_workers(coll, status_coll=None, layout=None):
    status_coll = status_coll or bpy.data.collections['STATUS_LIGHTS']
    out = []
    for tag, loc, rz, pose, prop in (layout or GD_WORKERS):
        out.append(make_worker(coll, status_coll, name='GD_Worker_' + tag, loc=loc, rot_z=rz, pose=pose,
                               prop=prop, vest='MC_PAINT_BLUE', scale=1.35))
    return out
