"""Import an exported GLB into a clean scene and check it.

  blender -b -noaudio -P verify_glb.py -- art/exports/x.glb [--render out.png]

Reports mesh objects with a non-identity scale or rotation, the bounding box,
animation names and the status meshes, and can render the imported model
under the shared rig, so the exported file is judged, not the source.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mc_lib
mc_lib.add_paths()
from mathutils import Vector


def main():
    a = mc_lib.script_args()
    path = a[0]
    mc_lib.reset_scene()
    bpy.ops.import_scene.gltf(filepath=path)
    bad = []
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    n_mesh = 0
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            n_mesh += 1
            if any(abs(s - 1) > 1e-4 for s in o.scale) or any(abs(r) > 1e-4 for r in o.rotation_euler):
                bad.append((o.name, tuple(round(s, 3) for s in o.scale)))
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(min(x, y) for x, y in zip(lo, w))
                hi = Vector(max(x, y) for x, y in zip(hi, w))
    print('VERIFY meshes', n_mesh, 'bbox', tuple(round(v, 2) for v in lo), tuple(round(v, 2) for v in hi))
    print('VERIFY nonidentity mesh transforms', bad[:6], len(bad))
    print('VERIFY actions', sorted(x.name for x in bpy.data.actions))
    print('VERIFY armatures', [o.name for o in bpy.context.scene.objects if o.type == 'ARMATURE'])
    if '--render' in a:
        import mc_materials, mc_rig, mc_render
        mc_materials.build_backdrop_material()
        C = mc_lib.ensure_collections()
        mc_rig.build_cameras(C['CAMERA_RIG'])
        mc_rig.build_lights(C['LIGHT_RIG'])
        mc_rig.build_world()
        mc_rig.build_floor(C['WORLD'])
        mc_rig.colour_management()
        mc_render.apply('FINAL', samples=64, res=(900, 900))
        mc_render.render_to(a[a.index('--render') + 1])
        print('VERIFY rendered')


main()
