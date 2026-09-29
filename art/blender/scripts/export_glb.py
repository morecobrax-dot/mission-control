"""Optimised GLB export of a diorama, plus an audit.

  blender -b -noaudio <diorama.blend> -P export_glb.py -- --out art/exports/x.glb [--report art/exports/x.json]

What it does to a COPY of the scene (the .blend on disk is never saved):
  - strips the procedural roughness variation so materials export as constants
  - bakes every modifier on static meshes and merges them per material
  - keeps status-light meshes and skinned worker parts separate, so the status
    can be recoloured at runtime and the workers can play their actions
  - drops cameras, lights, studio floor, swatches and the parked worker base
  - exports Y-up, metres, no textures, no cameras, no lights
Then it re-imports nothing: the audit is computed from the scene that was
exported, and the file size is read from disk.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mc_lib
mc_lib.add_paths()
import mc_materials
import mc_worker


def opt(a, n, d=None):
    return a[a.index(n) + 1] if n in a else d


def is_status(o):
    return 'status_role' in o.keys() or any(s.material and s.material.name == 'MC_STATUS_LIGHT' for s in o.material_slots)


def is_skinned(o):
    return any(m.type == 'ARMATURE' for m in o.modifiers)


def main():
    a = mc_lib.script_args()
    out = opt(a, '--out')
    report = opt(a, '--report')
    dg = bpy.context.evaluated_depsgraph_get()

    drop_coll = {'CAMERA_RIG', 'LIGHT_RIG', 'WORLD', 'MATERIAL_LIBRARY', 'EXPORT'}
    keep, static = [], []
    for o in list(bpy.data.objects):
        colls = {c.name for c in o.users_collection}
        if o.type in {'CAMERA', 'LIGHT'} or colls & drop_coll or o.hide_render or o.name.startswith('MC_WorkerBase'):
            bpy.data.objects.remove(o, do_unlink=True)
            continue
        if o.type == 'MESH' and not is_status(o) and not is_skinned(o):
            static.append(o)
        else:
            keep.append(o)

    for m in bpy.data.materials:
        mc_materials.strip_procedural(m)

    # bake modifiers on static meshes, group by material, join
    groups = {}
    for o in static:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=dg)
        o.modifiers.clear()
        old = o.data
        o.data = me
        bpy.data.meshes.remove(old)
        key = o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else 'NONE'
        groups.setdefault(key, []).append(o)
    merged = []
    for key, objs in sorted(groups.items()):
        with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs):
            if len(objs) > 1:
                bpy.ops.object.join()
        j = objs[0]
        j.name = 'GD_' + key[3:].title().replace('_', '') + '_merged'
        j.data.name = j.name
        j.parent = None
        merged.append(j)

    # unused data out
    for _ in range(3):
        bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)

    # each worker's own actions (recorded on the rig as mc_clips) become NLA
    # tracks named by clip, so the GLB holds one clean animation per clip
    for o in keep:
        if o.type != 'ARMATURE' or not o.animation_data or 'mc_clips' not in o.keys():
            continue
        ad = o.animation_data
        for name in o['mc_clips'].split(','):
            clip = name.split('.')[0]
            tr = ad.nla_tracks.new()
            tr.name = clip
            st = tr.strips.new(clip, 1, bpy.data.actions[name])
            st.name = clip
        ad.action = None

    bpy.ops.object.select_all(action='DESELECT')
    export_objs = merged + keep
    for o in export_objs:
        o.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', use_selection=True, export_apply=False, export_yup=True,
        export_cameras=False, export_lights=False, export_animations=True, export_animation_mode='NLA_TRACKS',
        export_force_sampling=True, export_materials='EXPORT', export_image_format='NONE',
        export_texcoords=False, export_normals=True, export_tangents=False, export_attributes=False,
        export_extras=True, export_skins=True, export_def_bones=False)

    # audit of what was exported
    tris = 0
    prims = 0
    mats = set()
    verts = 0
    for o in export_objs:
        if o.type != 'MESH':
            continue
        me = o.data
        me.calc_loop_triangles()
        tris += len(me.loop_triangles)
        verts += len(me.vertices)
        used = {p.material_index for p in me.polygons}
        prims += max(1, len(used))
        for i in used:
            if i < len(o.material_slots) and o.material_slots[i].material:
                mats.add(o.material_slots[i].material.name)
    size = os.path.getsize(out)
    rep = {
        'file': os.path.basename(out),
        'bytes': size,
        'triangles': tris,
        'vertices_blender': verts,
        'mesh_objects': sum(1 for o in export_objs if o.type == 'MESH'),
        'draw_calls_estimate': prims,
        'materials': len(mats),
        'material_names': sorted(mats),
        'textures': 0,
        'texture_memory_bytes': 0,
        'armatures': sum(1 for o in export_objs if o.type == 'ARMATURE'),
        'status_meshes': sorted(o.name for o in export_objs if o.type == 'MESH' and is_status(o)),
        'clips': list(mc_worker.CLIPS),
    }
    print('AUDIT', json.dumps(rep))
    if report:
        with open(report, 'w') as f:
            json.dump(rep, f, indent=2)


main()
