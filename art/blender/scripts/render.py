"""Render a .blend with a preset.

  blender -b -noaudio <file.blend> -P render.py -- --preset DRAFT --out out.png
      [--cam ortho|long] [--transparent] [--samples N] [--res N] [--status STATE]
      [--exposure E] [--look NAME]
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import mc_lib
mc_lib.add_paths()
import mc_materials
import mc_render


def opt(args, name, default=None, cast=str):
    if name in args:
        return cast(args[args.index(name) + 1])
    return default


def main():
    a = mc_lib.script_args()
    preset = opt(a, '--preset', 'DRAFT')
    out = opt(a, '--out')
    cam = {'ortho': 'MC_Cam_Ortho', 'long': 'MC_Cam_LongLens'}[opt(a, '--cam', 'ortho')]
    transparent = '--transparent' in a
    res = opt(a, '--res', None, int)
    mc_render.apply(preset, transparent=transparent, samples=opt(a, '--samples', None, int),
                    res=(res, res) if res else None)
    mc_render.set_camera(cam)
    mc_render.set_floor_mode(transparent)
    st = opt(a, '--status')
    if st:
        mc_materials.set_status(st, opt(a, '--status-scale', 1.0, float))
    ex = opt(a, '--exposure', None, float)
    if ex is not None:
        bpy.context.scene.view_settings.exposure = ex
    look = opt(a, '--look')
    if look:
        bpy.context.scene.view_settings.look = look
    mc_render.render_to(out)
    print('RENDERED', out, bpy.context.scene.render.engine, bpy.context.scene.get('mc_device', ''))


main()
