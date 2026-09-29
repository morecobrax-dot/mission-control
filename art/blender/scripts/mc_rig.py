"""The ONE studio rig: cameras, lights, world, floor, colour management.

Nothing here is project specific. A diorama is placed at the origin, its deck
top at DECK_Z, and is lit and framed by exactly this.
"""
import bpy
import math
from mathutils import Vector
from mc_lib import mat, link
from mc_materials import srgb

TARGET = Vector((0.0, 0.0, 2.6))
AZIMUTH = -45.0      # degrees; the camera sits at +x, -y
ELEVATION = 35.0     # degrees above the horizon
ORTHO_SCALE = 25.5
LONG_LENS_MM = 135.0


def _aim(obj, target):
    d = target - obj.location
    obj.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def _cam_position(dist, az=AZIMUTH, el=ELEVATION):
    a, e = math.radians(az), math.radians(el)
    return TARGET + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))) * dist


def build_cameras(coll):
    scn = bpy.context.scene
    # baseline: orthographic
    cd = bpy.data.cameras.new('MC_Cam_Ortho')
    cd.type = 'ORTHO'
    cd.ortho_scale = ORTHO_SCALE
    cd.clip_start, cd.clip_end = 1.0, 400.0
    co = bpy.data.objects.new('MC_Cam_Ortho', cd)
    coll.objects.link(co)
    co.location = _cam_position(90.0)
    _aim(co, TARGET)
    # variant: a subtle long-lens perspective. Distance chosen so the framing
    # matches the orthographic baseline; 135 mm keeps parallels near-parallel.
    pd = bpy.data.cameras.new('MC_Cam_LongLens')
    pd.type = 'PERSP'
    pd.lens = LONG_LENS_MM
    pd.sensor_width = 36.0
    pd.clip_start, pd.clip_end = 1.0, 600.0
    cp = bpy.data.objects.new('MC_Cam_LongLens', pd)
    coll.objects.link(cp)
    dist = (ORTHO_SCALE / 2.0) / (18.0 / LONG_LENS_MM)
    cp.location = _cam_position(dist)
    _aim(cp, TARGET)
    scn.camera = co
    return co, cp


def _area(name, coll, loc, size, energy, color, target, shape='DISK', spread=None):
    ld = bpy.data.lights.new(name, 'AREA')
    ld.shape = shape
    ld.size = size
    ld.energy = energy
    ld.color = color
    if spread:
        ld.spread = math.radians(spread)
    o = bpy.data.objects.new(name, ld)
    coll.objects.link(o)
    o.location = loc
    _aim(o, target)
    return o


def build_lights(coll):
    t = Vector((0.0, 0.0, 1.5))
    # KEY: large, soft, high and to the left of the camera's view
    key = _area('MC_Key', coll, (-10.0, -20.0, 25.0), 22.0, 20000.0, (1.0, 0.93, 0.82), t)
    # FILL: weaker and cooler, from the right so the +x faces never go black
    fill = _area('MC_Fill', coll, (26.0, -6.0, 12.0), 26.0, 3000.0, (0.9, 0.87, 1.0), t)
    # RIM: very restrained, from behind, only to peel the silhouette off the backdrop
    rim = _area('MC_Rim', coll, (-4.0, 24.0, 14.0), 14.0, 1100.0, (0.92, 0.95, 1.0), t)
    return key, fill, rim


def build_world():
    w = bpy.data.worlds.new('MC_World')
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    # procedural low, neutral-cool sky: no HDRI, so nothing to license or record
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = srgb('#CDBBAA')   # low: warm-neutral bounce from the floor
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = srgb('#BCCEE6')   # high: cool sky
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.7
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    bpy.context.scene.world = w
    return w


def build_floor(coll):
    me = bpy.data.meshes.new('MC_StudioFloor')
    s = 90.0
    me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
    o = bpy.data.objects.new('MC_StudioFloor', me)
    coll.objects.link(o)
    o.data.materials.append(mat('MC_STUDIO_FLOOR'))
    o.location.z = -0.001
    return o


def colour_management(look='AgX - Punchy', exposure=0.45):
    s = bpy.context.scene
    s.display_settings.display_device = 'sRGB'
    s.view_settings.view_transform = 'AgX'
    try:
        s.view_settings.look = look
    except TypeError:
        pass
    s.view_settings.exposure = exposure
    s.view_settings.gamma = 1.0
    s.sequencer_colorspace_settings.name = 'sRGB'
