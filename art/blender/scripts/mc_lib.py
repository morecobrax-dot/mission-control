"""Shared helpers for the Mission Control Blender pipeline.

Run inside Blender:  blender -b -P <script>.py
Units: 1 Blender unit = 1 metre of miniature. A deck is 14 m across, a
worker is about 1.2 m tall, a storey is 2.2 m.
"""
import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.abspath(os.path.join(HERE, '..', '..'))          # art/
BLENDER_DIR = os.path.join(ART, 'blender')
RENDERS = os.path.join(ART, 'renders')
EXPORTS = os.path.join(ART, 'exports')
MASTER = os.path.join(BLENDER_DIR, 'mission-control-master.blend')

# The one deck height every project sits on.
DECK_Z = 1.0

COLLECTIONS = ['CAMERA_RIG', 'LIGHT_RIG', 'WORLD', 'PLATFORM_BASE',
               'MATERIAL_LIBRARY', 'WORKER_BASE', 'STATUS_LIGHTS',
               'PROJECT_CONTENT', 'EXPORT']


def add_paths():
    for sub in ('scripts', 'materials', 'models', 'workers', 'environments'):
        p = os.path.join(BLENDER_DIR, sub)
        if p not in sys.path:
            sys.path.insert(0, p)


def script_args():
    """Arguments after `--` on the blender command line."""
    argv = sys.argv
    return argv[argv.index('--') + 1:] if '--' in argv else []


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def ensure_collections():
    return {n: collection(n) for n in COLLECTIONS}


def link(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    return obj


def mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        raise KeyError('material %s is not in the library' % name)
    return m


def smooth(obj):
    if obj.type == 'MESH':
        obj.data.shade_smooth()
    return obj


def add_bevel(obj, width, segments=2, angle=35.0, harden=True):
    """Non-destructive bevel: crisp planar faces, small rounded edge catches."""
    mod = obj.modifiers.new('MC_Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = harden
    mod.use_clamp_overlap = True
    mod.miter_outer = 'MITER_ARC'
    smooth(obj)
    return mod


def bake_modifiers(obj):
    """Apply every modifier without needing an operator context."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def obj_from_bm(name, bm, material, coll):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.update()
    o = bpy.data.objects.new(name, me)
    if material is not None:
        o.data.materials.append(material)
    coll.objects.link(o)
    return o


class MB:
    """Mesh builder: many primitives in one object, one material, one bevel.

    Batching by material keeps the object count and the eventual draw calls
    low, and lets one bevel modifier give every part the same edge language.
    """

    def __init__(self, name, material, coll, bevel=0.03, seg=2, angle=35.0, smooth_=None):
        self.name, self.material, self.coll = name, material, coll
        self.bevel, self.seg, self.angle = bevel, seg, angle
        self.smooth_ = smooth_
        self.bm = bmesh.new()

    def _place(self, verts, cx, cy, cz, rot):
        if rot:
            m = Matrix.Rotation(math.radians(rot), 4, 'Z')
            bmesh.ops.transform(self.bm, matrix=m, verts=verts)
        bmesh.ops.translate(self.bm, vec=(cx, cy, cz), verts=verts)

    def box(self, cx, cy, z0, w, d, h, rot=0.0, taper=None):
        """Box centred on (cx, cy), sitting on z0. `rot` turns it about Z."""
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = r['verts']
        bmesh.ops.scale(self.bm, vec=(w, d, h), verts=verts)
        bmesh.ops.translate(self.bm, vec=(0, 0, h / 2.0), verts=verts)
        if taper is not None:
            for v in verts:
                if v.co.z > h * 0.5:
                    v.co.x *= taper
                    v.co.y *= taper
        self._place(verts, cx, cy, z0, rot)
        return self

    def cyl(self, cx, cy, z0, radius, h, seg=24, rot=0.0, radius2=None, axis='Z', squash=1.0):
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=radius, radius2=radius if radius2 is None else radius2,
                                  depth=h)
        verts = r['verts']
        bmesh.ops.translate(self.bm, vec=(0, 0, h / 2.0), verts=verts)
        if squash != 1.0 and axis == 'X':
            # shallow vault: flatten the profile (local x becomes world z after the turn)
            for v in verts:
                v.co.x *= squash
        if axis == 'X':
            bmesh.ops.transform(self.bm, matrix=Matrix.Rotation(math.radians(90), 4, 'Y'), verts=verts)
        elif axis == 'Y':
            bmesh.ops.transform(self.bm, matrix=Matrix.Rotation(math.radians(90), 4, 'X'), verts=verts)
        self._place(verts, cx, cy, z0, rot)
        return self

    def beam(self, p0, p1, w, d=None):
        """A square member from p0 to p1: braces, ladder rails, leaning props."""
        a, b = Vector(p0), Vector(p1)
        v = b - a
        r = bmesh.ops.create_cube(self.bm, size=1.0)
        verts = r['verts']
        bmesh.ops.scale(self.bm, vec=(w, d if d is not None else w, v.length), verts=verts)
        q = Vector((0, 0, 1)).rotation_difference(v.normalized())
        bmesh.ops.transform(self.bm, matrix=q.to_matrix().to_4x4(), verts=verts)
        bmesh.ops.translate(self.bm, vec=(a + b) / 2, verts=verts)
        return self

    def sphere(self, cx, cy, cz, rx, ry=None, rz=None, seg=16, rings=10):
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=rings, radius=1.0)
        verts = r['verts']
        bmesh.ops.scale(self.bm, vec=(rx, ry if ry is not None else rx, rz if rz is not None else rx), verts=verts)
        self._place(verts, cx, cy, cz, 0)
        return self

    def prism(self, points, z0, h):
        """Extrude a polygon (list of (x, y)) up by h."""
        vs = [self.bm.verts.new((x, y, z0)) for x, y in points]
        f = self.bm.faces.new(vs)
        r = bmesh.ops.extrude_face_region(self.bm, geom=[f])
        top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(self.bm, vec=(0, 0, h), verts=top)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        return self

    def vault(self, x0, x1, cy, z0, half_w, rise, seg=32):
        """A barrel vault along x: arc profile extruded, smooth arc, flat end walls."""
        bm = self.bm
        vs = []
        for i in range(seg + 1):
            a = math.pi * i / seg
            vs.append(bm.verts.new((x0, cy - half_w * math.cos(a), z0 + rise * math.sin(a))))
        f = bm.faces.new(vs)
        res = bmesh.ops.extrude_face_region(bm, geom=[f])
        top = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, vec=(x1 - x0, 0, 0), verts=top)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        for face in bm.faces:
            n = face.normal
            face.smooth = abs(n.x) < 1e-3 and n.z > -0.99
        return self

    def done(self):
        if not self.bm.verts:
            self.bm.free()
            return None
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        o = obj_from_bm(self.name, self.bm, self.material, self.coll)
        if self.bevel:
            add_bevel(o, self.bevel, self.seg, self.angle)
        elif self.smooth_ == 'keep':
            pass               # per-face smooth flags were set by the builder
        elif self.smooth_:
            smooth(o)          # organic forms: foliage, spheres, lamps
        else:
            o.data.shade_flat()  # unbevelled boxes must stay flat, not gradient-shaded
        return o


# ---------------------------------------------------------------- rounded rects
def rr_loop(w, d, r, n=5):
    """Counter-clockwise rounded-rectangle outline, 4*(n+1) points, always
    starting at the same corner so two loops can be bridged."""
    r = min(r, w / 2.0 - 1e-4, d / 2.0 - 1e-4)
    pts = []
    corners = [(w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90),
               (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)]
    for cx, cy, a0 in corners:
        for i in range(n + 1):
            a = math.radians(a0 + 90.0 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def slab(name, w, d, r, z0, h, material, coll, cx=0.0, cy=0.0, bevel=0.05, seg=3, n=6):
    bm = bmesh.new()
    vs = [bm.verts.new((cx + x, cy + y, z0)) for x, y in rr_loop(w, d, r, n)]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = obj_from_bm(name, bm, material, coll)
    if bevel:
        add_bevel(o, bevel, seg)
    else:
        smooth(o)
    return o


def frame(name, w, d, r, iw, idp, ir, z0, h, material, coll, bevel=0.03, seg=2, n=6, cx=0.0, cy=0.0):
    """A rounded rectangular ring: outer w x d, inner iw x idp."""
    bm = bmesh.new()
    outer = [bm.verts.new((cx + x, cy + y, z0)) for x, y in rr_loop(w, d, r, n)]
    inner = [bm.verts.new((cx + x, cy + y, z0)) for x, y in rr_loop(iw, idp, ir, n)]
    n_pts = len(outer)
    faces = []
    for i in range(n_pts):
        j = (i + 1) % n_pts
        faces.append(bm.faces.new((outer[i], outer[j], inner[j], inner[i])))
    res = bmesh.ops.extrude_face_region(bm, geom=faces)
    top = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    o = obj_from_bm(name, bm, material, coll)
    if bevel:
        add_bevel(o, bevel, seg)
    else:
        smooth(o)
    return o


# ---------------------------------------------------------------- facades
def cut(obj, cutters):
    """Boolean-subtract a list of (cx, cy, z0, w, d, h[, rot]) boxes from obj
    and bake the result, so windows and doors are real recesses."""
    bm = bmesh.new()
    for c in cutters:
        cx, cy, z0, w, d, h = c[:6]
        rot = c[6] if len(c) > 6 else 0.0
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(w, d, h), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(0, 0, h / 2.0), verts=r['verts'])
        if rot:
            bmesh.ops.transform(bm, matrix=Matrix.Rotation(math.radians(rot), 4, 'Z'), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(cx, cy, z0), verts=r['verts'])
    me = bpy.data.meshes.new(obj.name + '_cutter')
    bm.to_mesh(me)
    bm.free()
    cutter = bpy.data.objects.new(obj.name + '_cutter', me)
    bpy.context.scene.collection.objects.link(cutter)
    mod = obj.modifiers.new('MC_Cut', 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = 'EXACT'
    mod.object = cutter
    # the boolean must run before the bevel
    obj.modifiers.move(len(obj.modifiers) - 1, 0)
    bake_modifiers_only(obj, 'MC_Cut')
    bpy.data.objects.remove(cutter)
    bpy.data.meshes.remove(me)
    return obj


def bake_modifiers_only(obj, name):
    """Apply just one named modifier (the rest stay live)."""
    keep = [(m.name, m) for m in obj.modifiers if m.name != name]
    saved = {}
    for n, m in keep:
        saved[n] = m.show_viewport
        m.show_viewport = False
        m.show_render = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    mats = list(old.materials)
    obj.modifiers.remove(obj.modifiers[name])
    obj.data = me
    for m in mats:
        if m not in list(me.materials):
            me.materials.append(m)
    for n, m in keep:
        m.show_viewport = saved[n]
        m.show_render = True
    if old.users == 0:
        bpy.data.meshes.remove(old)
    me.shade_smooth()
    return obj


def grid_windows(face, x0, y0, x1, y1, z0, floors, cols, ww, wh, sill, floor_h,
                 depth=0.28, margin=0.0, skip=()):
    """Openings along one facade of a building whose footprint is
    [x0,x1] x [y0,y1] and whose ground is z0. face is one of '-y', '+x',
    '-x', '+y'. Returns (cutters, panes) where each entry is
    (cx, cy, zb, w, d, h, rot) and panes are the glass slabs."""
    cutters, panes = [], []
    if face in ('-y', '+y'):
        span = (x1 - x0) - 2 * margin
        along0 = x0 + margin
    else:
        span = (y1 - y0) - 2 * margin
        along0 = y0 + margin
    for f in range(floors):
        for c in range(cols):
            if (f, c) in skip:
                continue
            t = (c + 0.5) / cols
            a = along0 + span * t
            zb = z0 + f * floor_h + sill
            if face == '-y':
                cutters.append((a, y0 + depth / 2 - 0.01, zb, ww, depth + 0.02, wh, 0))
                panes.append((a, y0 + depth - 0.03, zb, ww - 0.04, 0.05, wh - 0.04, 0))
            elif face == '+y':
                cutters.append((a, y1 - depth / 2 + 0.01, zb, ww, depth + 0.02, wh, 0))
                panes.append((a, y1 - depth + 0.03, zb, ww - 0.04, 0.05, wh - 0.04, 0))
            elif face == '+x':
                cutters.append((x1 - depth / 2 + 0.01, a, zb, depth + 0.02, ww, wh, 0))
                panes.append((x1 - depth + 0.03, a, zb, 0.05, ww - 0.04, wh - 0.04, 0))
            elif face == '-x':
                cutters.append((x0 + depth / 2 - 0.01, a, zb, depth + 0.02, ww, wh, 0))
                panes.append((x0 + depth - 0.03, a, zb, 0.05, ww - 0.04, wh - 0.04, 0))
    return cutters, panes


def set_custom(obj, **kw):
    for k, v in kw.items():
        obj[k] = v


def save_blend(path):
    """Save the open file with nothing of this machine in it. Blender's factory
    screens keep a file browser (the Shading workspace's) opened on the user's
    Documents folder, and a .blend stores it: the first .blend files here
    carried a home path into a public repository. `npm run secrets` reads
    every frame of every .blend and fails on one."""
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    # A fixed-size buffer: bytes past a short value's end are
                    # still written, so fill it all before setting it.
                    space.params.directory = b'_' * 2048
                    space.params.directory = b'//'
    bpy.ops.wm.save_as_mainfile(filepath=path)
