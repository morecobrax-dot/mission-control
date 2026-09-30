"""Optimised GLB export of a diorama, an audit, and a budget check.

  blender -b -noaudio <diorama.blend> -P export_glb.py -- --out art/exports/x.glb
      [--report art/exports/x.json] [--preview out.png]

What it does to a COPY of the scene (the .blend on disk is never saved), to
the project content, the platform and the status lights only:
  - strips the procedural roughness variation and folds sheen weight into
    its colour, so materials export as the constants three.js can read
  - colour families: materials that answer light the same way and differ
    only in colour (mc_materials.FAMILIES) become one material each, the
    colour carried per vertex; a family whose members differ is refused
  - static meshes: modifiers baked, joined per material
  - status lights: the rim and the beacon joined into one mesh, still on the
    one shared status material the app recolours
  - the crew: every worker joined into one skinned mesh on one skeleton,
    each worker's bones prefixed with its role ("coach__spine") so the app
    can still give each its own clip; each clip is one animation holding
    every worker's channels; the roles and their authored clips travel as
    the rig's `mc_crew` extra ("coach:WORKING,runner:ACTIVE")
  - life: objects marked `mc_life` stay whole and carry the MC_LIFE clip
  - exports Y-up, metres, no textures, no cameras, no lights
The audit counts what was exported and checks it against DISTRICT_BUDGET;
the file size is read from disk. `--preview` renders the prepared copy in
Cycles with the FINAL preset, to compare with the approved render.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mc_lib
mc_lib.add_paths()
import mc_materials
import mc_render
import mc_worker

# The budget every authored district is held to (docs/3D-ART-BIBLE.md). It
# is also in field/world.js as DISTRICT_BUDGET, where contract 30 checks
# every exported file against it; keep the two equal.
DISTRICT_BUDGET = {'triangles': 80000, 'drawCalls': 24, 'materials': 16, 'workers': 8,
                   'bytes': 2000000, 'textures': 0}
# City life's passers-by (models/street_life.py, a scene marked mc_asset =
# 'street'): two people, packed like a district's crew. STREET_BUDGET in
# field/world.js; keep the two equal.
STREET_BUDGET = {'triangles': 8000, 'drawCalls': 4, 'materials': 4, 'workers': 2,
                 'bytes': 250000, 'textures': 0}
BUDGETS = {'district': DISTRICT_BUDGET, 'street': STREET_BUDGET}
CONTENT = {'PROJECT_CONTENT', 'PLATFORM_BASE', 'STATUS_LIGHTS'}
STATUS = 'MC_STATUS_LIGHT'


def opt(a, n, d=None):
    return a[a.index(n) + 1] if n in a else d


def in_content(o):
    return bool({c.name for c in o.users_collection} & CONTENT)


def is_status(o):
    return 'status_role' in o.keys() or any(s.material and s.material.name == STATUS for s in o.material_slots)


def is_skinned(o):
    return any(m.type == 'ARMATURE' for m in o.modifiers)


def role_of(rig):
    if 'mc_role' in rig.keys():
        return rig['mc_role']
    m = re.search(r'_Worker_(.+)_Rig$', rig.name)
    return m.group(1) if m else rig.name


def select_only(objs, active):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def join(objs):
    """Join objects into the first; returns it."""
    if len(objs) > 1:
        select_only(objs, objs[0])
        bpy.ops.object.join()
    return objs[0]


def bake(o, dg):
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
    o.modifiers.clear()
    old = o.data
    o.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)


def keep_world(o):
    m = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = m


# ---------------------------------------------------------------- families
def colour_and_family(o, families):
    """Write each face's material colour into the colour attribute, then give
    family members their family's material. Other faces of the same mesh are
    white; a mesh with no family member gets no colour at all."""
    me = o.data
    if not any(s.material and mc_materials.family_of(s.material.name) for s in o.material_slots):
        return
    attr = me.color_attributes.get(mc_materials.COLOUR_ATTRIBUTE) or \
        me.color_attributes.new(mc_materials.COLOUR_ATTRIBUTE, 'BYTE_COLOR', 'CORNER')
    slot_colour = []
    for s in o.material_slots:
        fam = mc_materials.family_of(s.material.name) if s.material else None
        slot_colour.append(mc_materials.base_colour(s.material) if fam else (1.0, 1.0, 1.0, 1.0))
    for p in me.polygons:
        c = slot_colour[p.material_index] if p.material_index < len(slot_colour) else (1.0, 1.0, 1.0, 1.0)
        for li in p.loop_indices:
            attr.data[li].color = c
    me.color_attributes.active_color = attr
    for s in o.material_slots:
        fam = mc_materials.family_of(s.material.name) if s.material else None
        if fam:
            if fam not in families:
                families[fam] = mc_materials.build_family(fam)
            s.material = families[fam]
    # one slot per material: faces on a duplicate slot move to the first
    first = {}
    remap = []
    for i, s in enumerate(o.material_slots):
        first.setdefault(s.material, i)
        remap.append(first[s.material])
    for p in me.polygons:
        p.material_index = remap[p.material_index]


# ---------------------------------------------------------------- the crew
def channelbag(act):
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                return cb
    return None


def new_action(owner, name):
    act = bpy.data.actions.new(name)
    slot = act.slots.new(id_type='OBJECT', name=owner.name)
    strip = act.layers.new('Layer').strips.new(type='KEYFRAME')
    return act, slot, strip.channelbag(slot, ensure=True)


def bone_path(path, pre):
    """A channel's path onto the prefixed bone. Renaming a bone already
    rewrites the paths of the action its rig is playing, so a path that has
    the prefix keeps it: never "coach__coach__spine"."""
    head = 'pose.bones["'
    if path.startswith(head) and not path.startswith(head + pre):
        return head + pre + path[len(head):]
    return path


def copy_fcurve(src, cb, path):
    fc = cb.fcurves.new(path, index=src.array_index)
    fc.keyframe_points.add(len(src.keyframe_points))
    for k, s in zip(fc.keyframe_points, src.keyframe_points):
        k.co = s.co
        k.interpolation = s.interpolation
        k.handle_left_type, k.handle_right_type = s.handle_left_type, s.handle_right_type
        k.handle_left, k.handle_right = s.handle_left, s.handle_right
    fc.update()


def merge_crew(rigs, families):
    """Every worker into one skinned mesh on one skeleton. Returns the rig.
    The clips are the ones the rigs carry: a district's crew its five, the
    passers-by their walk and pause."""
    crew, meshes, clips, axes = [], [], {}, {}
    stride = next((r['mc_stride'] for r in rigs if 'mc_stride' in r.keys()), None)
    for rig in rigs:
        role = role_of(rig)
        pre = role + '__'
        crew.append('%s:%s' % (role, rig.get('worker_pose', 'IDLE')))
        for b in rig.data.bones:
            b.name = pre + b.name           # renames the rig's vertex groups with it
            # a bone's Z axis in the world: the join recomputes the roll of
            # vertical bones, which turns their rotation axes, so it is put back
            axes[b.name] = (rig.matrix_world.to_3x3() @ b.matrix_local.to_3x3()).col[2].normalized()
        kids = [c for c in bpy.data.objects if c.parent == rig and c.type == 'MESH']
        for c in kids:
            for vg in c.vertex_groups:
                if not vg.name.startswith(pre):
                    vg.name = pre + vg.name
            keep_world(c)
            meshes.append(c)
        for name in rig.get('mc_clips', '').split(','):
            act = bpy.data.actions.get(name)
            if act:
                clips.setdefault(name.split('.')[0], []).append((pre, channelbag(act)))
        if rig.animation_data:
            rig.animation_data.action = None
    merged = join(list(rigs))
    merged.name = merged.data.name = rigs[0].name.split('_Worker_')[0] + '_Crew_Rig'
    for k in ('worker_pose', 'mc_clips', 'mc_role', 'worker_outfit', 'mc_stride'):
        if k in merged.keys():
            del merged[k]
    merged['mc_crew'] = ','.join(crew)
    if stride is not None:
        merged['mc_stride'] = stride        # metres one walk clip covers, measured on the rig (mc_walker)
    to_local = merged.matrix_world.to_3x3().inverted()
    select_only([merged], merged)
    bpy.ops.object.mode_set(mode='EDIT')
    for eb in merged.data.edit_bones:
        eb.align_roll(to_local @ axes[eb.name])
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in merged.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = (0, 0, 0)
    for m in meshes:
        colour_and_family(m, families)
    body = join(meshes)
    body.name = body.data.name = merged.name.replace('_Rig', '')
    for mod in list(body.modifiers):
        body.modifiers.remove(mod)
    mod = body.modifiers.new('MC_Armature', 'ARMATURE')
    mod.object = merged
    body.parent = merged
    body.matrix_parent_inverse = merged.matrix_world.inverted()
    # one animation per clip, holding every worker's channels
    ad = merged.animation_data_create()
    ad.action = None
    for clip, parts in clips.items():
        act, slot, cb = new_action(merged, clip)
        for pre, src in parts:
            for fc in src.fcurves:
                copy_fcurve(fc, cb, bone_path(fc.data_path, pre))
        tr = ad.nla_tracks.new()
        tr.name = clip
        st = tr.strips.new(clip, 1, act)
        st.name = clip
        st.action_slot = slot
    merge_crew.parts = clips
    return merged, body


def pose_authored(rig):
    """For the preview only: each worker in its own authored clip, as the
    source scene shows them (the exported clips each hold every worker)."""
    act, slot, cb = new_action(rig, 'MC_AUTHORED')
    for entry in rig['mc_crew'].split(','):
        role, pose = entry.split(':')
        for pre, src in merge_crew.parts['MC_' + pose]:
            if pre == role + '__':
                for fc in src.fcurves:
                    copy_fcurve(fc, cb, bone_path(fc.data_path, pre))
    for tr in rig.animation_data.nla_tracks:
        tr.mute = True
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
    rig.animation_data.action = act
    rig.animation_data.action_slot = slot
    bpy.context.scene.frame_set(1)


# ---------------------------------------------------------------- the file
def compact(path):
    """Smaller vertex data, the same picture. Blender writes vertex colours
    as 16-bit, normals and skin weights as 32-bit floats. Rewritten in place:
      COLOR_0    8-bit (a family's colour is flat per face: under 4% error on
                 the darkest paint)
      NORMAL     8-bit signed, normalised, padded to 4 bytes
                 (KHR_mesh_quantization, which three.js reads natively)
      WEIGHTS_0  8-bit, normalised, each vertex's sum kept at exactly 255 (a
                 worker is rigid, so every weight is 0 or 1 anyway)"""
    import struct
    import numpy as np
    with open(path, 'rb') as f:
        data = f.read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    gl = json.loads(data[20:20 + jlen])
    bin_ = data[20 + jlen + 8:]
    kind = {}
    for m in gl['meshes']:
        for p in m['primitives']:
            for attr, want in (('COLOR_0', 5123), ('NORMAL', 5126), ('WEIGHTS_0', 5126)):
                i = p['attributes'].get(attr)
                if i is not None and gl['accessors'][i]['componentType'] == want:
                    kind[i] = attr
    users = {}
    for k, a in enumerate(gl['accessors']):
        users.setdefault(a.get('bufferView'), []).append(k)
    view_kind = {}
    for i, attr in kind.items():
        v = gl['accessors'][i]['bufferView']
        if users.get(v) == [i] and 'byteStride' not in gl['bufferViews'][v] or \
                users.get(v) == [i] and gl['bufferViews'][v].get('byteStride') in (8, 12, 16):
            view_kind[v] = (i, attr)
    out = bytearray()
    quantised = False
    for vi, v in enumerate(gl['bufferViews']):
        chunk = bin_[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        if vi in view_kind:
            i, attr = view_kind[vi]
            acc = gl['accessors'][i]
            if attr == 'COLOR_0':
                vals = np.frombuffer(chunk, dtype='<u2').astype(np.float64)
                chunk = np.clip(np.rint(vals * 255.0 / 65535.0), 0, 255).astype(np.uint8).tobytes()
                acc['componentType'] = 5121
                v.pop('byteStride', None)
            elif attr == 'NORMAL':
                n = np.frombuffer(chunk, dtype='<f4').reshape(-1, 3)
                q = np.zeros((len(n), 4), dtype=np.int8)
                q[:, :3] = np.clip(np.rint(n * 127.0), -127, 127).astype(np.int8)
                chunk = q.tobytes()
                acc['componentType'] = 5120
                acc['normalized'] = True
                acc.pop('min', None)
                acc.pop('max', None)
                v['byteStride'] = 4
                quantised = True
            else:
                w = np.frombuffer(chunk, dtype='<f4').reshape(-1, 4).astype(np.float64)
                q = np.rint(w * 255.0).astype(np.int64)
                top = q.argmax(axis=1)
                q[np.arange(len(q)), top] += 255 - q.sum(axis=1)
                chunk = np.clip(q, 0, 255).astype(np.uint8).tobytes()
                acc['componentType'] = 5121
                acc['normalized'] = True
                acc.pop('min', None)
                acc.pop('max', None)
                v.pop('byteStride', None)
        while len(out) % 4:
            out.append(0)
        v['byteOffset'] = len(out)
        v['byteLength'] = len(chunk)
        out += chunk
    if quantised:
        for key in ('extensionsUsed', 'extensionsRequired'):
            gl.setdefault(key, [])
            if 'KHR_mesh_quantization' not in gl[key]:
                gl[key].append('KHR_mesh_quantization')
    while len(out) % 4:
        out.append(0)
    gl['buffers'][0]['byteLength'] = len(out)
    js = json.dumps(gl, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(out), 0x004E4942) + bytes(out))


# ---------------------------------------------------------------- the audit
def audit(objs, out, crew_rig):
    tris = prims = verts = 0
    mats = set()
    for o in objs:
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        verts += len(me.vertices)
        used = {o.material_slots[p.material_index].material for p in me.polygons if p.material_index < len(o.material_slots)}
        prims += max(1, len(used))
        mats |= {m.name for m in used if m}
    workers = len(crew_rig['mc_crew'].split(',')) if crew_rig else 0
    rep = {
        'file': os.path.basename(out),
        'bytes': os.path.getsize(out),
        'triangles': tris,
        'vertices_blender': verts,
        'mesh_objects': sum(1 for o in objs if o.type == 'MESH'),
        'draw_calls': prims,
        'materials': len(mats),
        'material_names': sorted(mats),
        'textures': 0,
        'texture_memory_bytes': 0,
        'workers': workers,
        'crew': crew_rig['mc_crew'] if crew_rig else '',
        'status_meshes': sorted(o.name for o in objs if o.type == 'MESH' and is_status(o)),
        'clips': list(getattr(merge_crew, 'parts', {}).keys()) if crew_rig else [],
    }
    kind = bpy.context.scene.get('mc_asset', 'district')
    budget = BUDGETS[kind]
    rep['asset'] = kind
    measured = {'triangles': tris, 'drawCalls': prims, 'materials': len(mats), 'workers': workers,
                'bytes': rep['bytes'], 'textures': 0}
    rep['budget'] = {k: {'limit': budget[k], 'actual': measured[k], 'ok': measured[k] <= budget[k]}
                     for k in budget}
    rep['within_budget'] = all(v['ok'] for v in rep['budget'].values())
    return rep


def main():
    a = mc_lib.script_args()
    out = opt(a, '--out')
    report = opt(a, '--report')
    preview = opt(a, '--preview')
    dg = bpy.context.evaluated_depsgraph_get()

    objs = [o for o in bpy.data.objects if in_content(o) and not o.hide_render]
    for m in bpy.data.materials:
        mc_materials.strip_procedural(m)
        mc_materials.fold_sheen_weight(m)

    rigs = [o for o in objs if o.type == 'ARMATURE' and 'mc_clips' in o.keys()]
    crew_parts = {c for r in rigs for c in objs if c.parent == r}
    life = [o for o in objs if o.get('mc_life')]
    static = [o for o in objs if o.type == 'MESH' and o not in crew_parts and o not in life and not is_skinned(o)]
    status = [o for o in static if is_status(o)]
    static = [o for o in static if o not in status]

    families = {}
    groups = {}
    for o in static:
        bake(o, dg)
        colour_and_family(o, families)
        key = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else 'NONE'
        groups.setdefault(key, []).append(o)
    prefix = (objs[0].name.split('_')[0] if objs else 'MC') if not rigs else rigs[0].name.split('_Worker_')[0]
    merged = []
    for key, group in sorted(groups.items()):
        j = join(group)
        j.name = j.data.name = prefix + '_' + key[3:].title().replace('_', '') + '_merged'
        keep_world(j)
        merged.append(j)
    if status:
        for o in status:
            bake(o, dg)
        s = join(status)
        s.name = s.data.name = prefix + '_StatusLights'
        s['status_role'] = 'rim+beacon'
        keep_world(s)
        merged.append(s)
    for o in life:
        bake(o, dg)
        colour_and_family(o, families)

    crew_rig = crew_body = None
    if rigs:
        crew_rig, crew_body = merge_crew(rigs, families)

    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

    export_objs = merged + life + ([crew_rig, crew_body] if crew_rig else [])
    select_only(export_objs, export_objs[0])
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    # keep_anim_armature stays on: without it a channel that is constant but
    # posed (the runner's head tilt) is dropped, and the pose with it
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(out), export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
        export_cameras=False, export_lights=False, export_animations=True, export_animation_mode='NLA_TRACKS',
        export_force_sampling=True, export_optimize_animation_size=True,
        export_optimize_animation_keep_anim_armature=True, export_materials='EXPORT', export_image_format='NONE',
        export_texcoords=False, export_normals=True, export_tangents=False, export_attributes=False,
        export_vertex_color='ACTIVE', export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False, export_extras=True, export_skins=True, export_def_bones=False)
    compact(os.path.abspath(out))

    rep = audit(export_objs, out, crew_rig)
    print('AUDIT', json.dumps(rep))
    if report:
        with open(report, 'w') as f:
            json.dump(rep, f, indent=2)
    if not rep['within_budget']:
        print('BUDGET FAIL', json.dumps({k: v for k, v in rep['budget'].items() if not v['ok']}))
    if preview:
        if crew_rig:
            pose_authored(crew_rig)
        mc_render.apply('FINAL', samples=int(opt(a, '--samples', '128')), res=(1800, 1800))
        mc_render.set_camera('MC_Cam_Ortho')
        mc_render.set_floor_mode(False)
        mc_render.render_to(preview)
        print('PREVIEW', preview)
    if not rep['within_budget']:
        sys.exit(1)             # the file and its audit stay for a look; the run still fails


main()
