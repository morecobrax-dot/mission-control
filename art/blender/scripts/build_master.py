"""Build the master scene and the authored dioramas.

  blender -b -noaudio -P art/blender/scripts/build_master.py -- [--only <name>] [--no-diorama]

Writes:
  art/blender/mission-control-master.blend     rig + platform + library + worker, no project
  art/blender/models/<name>.blend              the master with one diorama in PROJECT_CONTENT
  art/blender/models/street-life.blend         (--only street) city life's two passers-by, no platform

A diorama is a module in art/blender/models with build(coll, status_coll),
its WORKERS and its ACCENT (the platform band's material): DIORAMAS below.
The passers-by are not a diorama: build_street builds them alone.
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
import mc_worker

DIORAMAS = {
    'golden': dict(module='golden_diorama', file='golden-diorama.blend', prefix='GD'),
    'dayplan': dict(module='dayplan_diorama', file='dayplan-diorama.blend', prefix='DP'),
    'dailyverse': dict(module='dailyverse_diorama', file='dailyverse-diorama.blend', prefix='DV'),
    'savings': dict(module='savings_diorama', file='savings-diorama.blend', prefix='PS'),
    'spacek': dict(module='spacek_diorama', file='spacek-diorama.blend', prefix='SK'),
    'capysushi': dict(module='capysushi_diorama', file='capysushi-diorama.blend', prefix='CS'),
}


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


def build_common(accent='MC_PAINT_BLUE'):
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
    mc_platform.build_platform(C['PLATFORM_BASE'], accent=accent, status_coll=C['STATUS_LIGHTS'])
    mc_worker.build_worker_base(C['WORKER_BASE'], C['STATUS_LIGHTS'])
    return C


def build_diorama(name):
    spec = DIORAMAS[name]
    module = __import__(spec['module'])
    C = build_common(module.ACCENT)
    module.build(C['PROJECT_CONTENT'], C['STATUS_LIGHTS'])
    mc_worker.place_workers(C['PROJECT_CONTENT'], C['STATUS_LIGHTS'], module.WORKERS, spec['prefix'])
    mc_render.apply('DRAFT')
    out = os.path.join(BLENDER_DIR, 'models', spec['file'])
    bpy.context.scene['mc_note'] = name + ' diorama on the shared master rig.'
    save_blend(out)
    print('SAVED', out)


def build_street():
    """City life's passers-by on the master rig: no platform, no project, so
    the export takes the people alone (models/street_life.py)."""
    import street_life
    reset_scene()
    C = ensure_collections()
    mc_materials.build_library()
    mc_materials.build_backdrop_material()
    mc_materials.set_status('STABLE')
    mc_rig.build_cameras(C['CAMERA_RIG'])
    mc_rig.build_lights(C['LIGHT_RIG'])
    mc_rig.build_world()
    mc_rig.build_floor(C['WORLD'])
    mc_rig.colour_management()
    street_life.build(C['PROJECT_CONTENT'])
    mc_render.apply('DRAFT')
    bpy.context.scene['mc_asset'] = 'street'
    bpy.context.scene['mc_note'] = 'City life: two passers-by on the shared master rig. No platform, no project.'
    out = os.path.join(BLENDER_DIR, 'models', 'street-life.blend')
    save_blend(out)
    print('SAVED', out)


def main():
    args = script_args()
    only = args[args.index('--only') + 1] if '--only' in args else None
    if only == 'street':
        build_street()
        return
    if not only:
        build_common()
        mc_render.apply('DRAFT')
        bpy.context.scene['mc_note'] = 'Master: rig, platform, library, worker. No project content.'
        save_blend(MASTER)
        print('SAVED', MASTER)
    if '--no-diorama' in args:
        return
    for name in ([only] if only else list(DIORAMAS)):
        build_diorama(name)


if __name__ == '__main__':
    main()
