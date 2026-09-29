"""Build the master scene and the golden diorama.

  blender -b -noaudio -P art/blender/scripts/build_master.py -- [--no-diorama]

Writes:
  art/blender/mission-control-master.blend        rig + platform + library + worker, no project
  art/blender/models/golden-diorama.blend    the master with the diorama in PROJECT_CONTENT
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mc_lib
from mc_lib import *
mc_lib.add_paths()
import mc_materials
import mc_platform
import mc_rig
import mc_render


def swatches(coll):
    """One sphere per library material, parked out of frame and hidden from
    render, so the library is visible and pickable in the .blend."""
    names = sorted(m.name for m in bpy.data.materials if m.name.startswith('MC_') and m.name != 'MC_STUDIO_FLOOR')
    for i, n in enumerate(names):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, location=(-30 + i * 1.3, -60.0, 0.5),
                                             segments=32, ring_count=16)
        o = bpy.context.active_object
        o.name = 'SWATCH_' + n[3:]
        o.data.materials.append(bpy.data.materials[n])
        o.hide_render = True
        o.data.shade_smooth()
        link(o, coll)


def build_common(with_diorama):
    reset_scene()
    C = ensure_collections()
    mc_materials.build_library()
    mc_materials.build_backdrop_material()
    mc_materials.set_status('STABLE')
    swatches(C['MATERIAL_LIBRARY'])
    mc_rig.build_cameras(C['CAMERA_RIG'])
    mc_rig.build_lights(C['LIGHT_RIG'])
    mc_rig.build_world()
    mc_rig.build_floor(C['WORLD'])
    mc_rig.colour_management()
    mc_platform.build_platform(C['PLATFORM_BASE'], accent='MC_PAINT_BLUE', status_coll=C['STATUS_LIGHTS'])
    try:
        import mc_worker
        mc_worker.build_worker_base(C['WORKER_BASE'], C['STATUS_LIGHTS'])
    except ImportError:
        pass
    return C


def main():
    args = script_args()
    C = build_common(False)
    mc_render.apply('DRAFT')
    bpy.context.scene['mc_note'] = 'Master: rig, platform, library, worker. No project content.'
    bpy.ops.wm.save_as_mainfile(filepath=MASTER)
    print('SAVED', MASTER)
    if '--no-diorama' in args:
        return
    import golden_diorama
    golden_diorama.build(C['PROJECT_CONTENT'], C['STATUS_LIGHTS'])
    try:
        import mc_worker
        mc_worker.place_golden_workers(C['PROJECT_CONTENT'])
    except (ImportError, AttributeError):
        pass
    out = os.path.join(BLENDER_DIR, 'models', 'golden-diorama.blend')
    bpy.context.scene['mc_note'] = 'golden diorama on the shared master rig.'
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print('SAVED', out)


main()
