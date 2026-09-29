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


KEY_AZIMUTH = -140.0   # from camera-left, a touch in front: cast shadows run to screen-right
KEY_ELEVATION = 34.0
KEY_ANGLE = 7.0        # degrees of sun disc: contact shadows crisp, long shadows soften


def _sun(name, coll, az, el, strength, angle, color):
    ld = bpy.data.lights.new(name, 'SUN')
    ld.energy = strength
    ld.angle = math.radians(angle)
    ld.color = color
    o = bpy.data.objects.new(name, ld)
    coll.objects.link(o)
    a, e = math.radians(az), math.radians(el)
    d = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    o.location = TARGET + d * 40.0
    _aim(o, TARGET)
    return o


def build_lights(coll):
    t = Vector((0.0, 0.0, 1.5))
    # KEY: a warm sun with a small disc. One unmistakable direction; the lit
    # (-y) faces and the shadow (+x) faces separate by about 3:1 in value.
    key = _sun('MC_Key', coll, KEY_AZIMUTH, KEY_ELEVATION, 5.0, KEY_ANGLE, (1.0, 0.9, 0.78))
    # FILL: large, cool and low from camera-right, only so the shadow side keeps colour
    fill = _area('MC_Fill', coll, (26.0, -6.0, 12.0), 30.0, 320.0, (0.8, 0.86, 1.0), t)
    # RIM: from behind, peels roof edges and trees off the backdrop
    rim = _area('MC_Rim', coll, (-6.0, 26.0, 18.0), 12.0, 2600.0, (0.95, 0.96, 1.0), t)
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
    ramp.color_ramp.elements[0].color = srgb('#AE9F92')   # low: warm-neutral bounce from the floor
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = srgb('#9DB8E0')   # high: cool sky
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.32
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
    _floor_light(o)
    return o


def _floor_light(floor):
    """Light linking: the crisp key lights the diorama but not the backdrop; a
    twin sun with a wide disc lights only the backdrop. The plinth keeps a
    grounded contact shadow while the tall parts' long shadows melt into soft
    shade instead of printing hard shapes across the background."""
    key = bpy.data.objects.get('MC_Key')
    if not key:
        return
    only = bpy.data.collections.new('MC_LL_Backdrop')
    only.objects.link(floor)
    key.light_linking.receiver_collection = only
    only.collection_objects[0].light_linking.link_state = 'EXCLUDE'
    twin = _sun('MC_BackdropKey', key.users_collection[0], KEY_AZIMUTH, KEY_ELEVATION, key.data.energy, 24.0,
                tuple(key.data.color))
    incl = bpy.data.collections.new('MC_LL_BackdropOnly')
    incl.objects.link(floor)
    twin.light_linking.receiver_collection = incl
    incl.collection_objects[0].light_linking.link_state = 'INCLUDE'


def colour_management(look='AgX - Medium High Contrast', exposure=0.0):
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
