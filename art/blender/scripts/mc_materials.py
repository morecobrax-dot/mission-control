"""Mission Control material library. Clean PBR, no grunge.

Every material is a Principled BSDF with a fixed base colour, a considered
roughness and (for the painted and composite ones) a very narrow procedural
roughness variation so large planes do not read as flat plastic. The variation
lives in a node named MC_RoughVar; the GLB exporter strips it, so the exported
materials are plain constants.
"""
import bpy

STATUS_STATES = {
    # state: (linear-ish sRGB hex, strength). Words and shapes are the app's job;
    # the art only has to be lit differently per state.
    'STABLE':         ('#3FBF7F', 1.4),
    'BUILDING':       ('#4C9BFF', 1.4),
    'NEEDS_QA':       ('#B889FF', 1.4),
    'NEEDS_DECISION': ('#FFB020', 1.5),
    'BLOCKED':        ('#FF4D4D', 1.5),
    'PAUSED':         ('#8A96A6', 1.0),
    'RELEASE_READY':  ('#3CE0D0', 1.6),
}

PALETTE = {
    'paint_white':  '#F6F0E6',
    'paint_cream':  '#F0DEC0',
    'paint_blue':   '#5A94DB',
    'paint_navy':   '#2F4A78',
    'paint_slate':  '#66707F',
    'track':        '#D06A48',
    'track_line':   '#F2EFE8',
    'concrete':     '#C8C0B3',
    'concrete_dk':  '#A29A8E',
    'paver':        '#C9BCA9',
    'road':         '#4A4E55',
    'glass':        '#1C2E42',
    'glass_lit':    '#FFAE5C',
    'metal':        '#B7BDC6',
    'metal_dark':   '#3B4048',
    'wood':         '#C98F57',
    'wood_dark':    '#8B6540',
    'leaf':         '#6FA24F',
    'leaf_dark':    '#3F6E3F',
    'grass':        '#86B25F',
    'soil':         '#7A5C43',
    'skin':         '#E7B993',
    'yellow':       '#F1BE3B',
    'plinth':       '#EBE3D6',
    'plinth_dk':    '#34373E',
}


def srgb(hex_):
    h = hex_.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    lin = [(v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return (lin[0], lin[1], lin[2], 1.0)


def _new(name):
    m = bpy.data.materials.get(name)
    if m:
        bpy.data.materials.remove(m)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_fake_user = True
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes['Principled BSDF']


def pbr(name, hex_, rough=0.5, metal=0.0, var=0.05, coat=0.0, coat_rough=0.15,
        spec=0.5, alpha=None, transmission=0.0, ior=1.45, sheen=0.0, sheen_rough=0.5, sss=0.0):
    m, nodes, links, bsdf = _new(name)
    bsdf.inputs['Base Color'].default_value = srgb(hex_)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['IOR'].default_value = ior
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = spec
    if coat:
        bsdf.inputs['Coat Weight'].default_value = coat
        bsdf.inputs['Coat Roughness'].default_value = coat_rough
    if transmission:
        bsdf.inputs['Transmission Weight'].default_value = transmission
    if sheen:
        bsdf.inputs['Sheen Weight'].default_value = sheen
        bsdf.inputs['Sheen Roughness'].default_value = sheen_rough
    if sss:
        bsdf.inputs['Subsurface Weight'].default_value = sss
        bsdf.inputs['Subsurface Radius'].default_value = (0.08, 0.12, 0.05)
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
    if var:
        tc = nodes.new('ShaderNodeTexCoord')
        noise = nodes.new('ShaderNodeTexNoise')
        noise.name = 'MC_RoughVar'
        noise.inputs['Scale'].default_value = 3.5
        noise.inputs['Detail'].default_value = 2.0
        noise.inputs['Roughness'].default_value = 0.5
        rng = nodes.new('ShaderNodeMapRange')
        rng.inputs['To Min'].default_value = max(0.0, rough - var)
        rng.inputs['To Max'].default_value = min(1.0, rough + var)
        links.new(tc.outputs['Object'], noise.inputs['Vector'])
        links.new(noise.outputs['Fac'], rng.inputs['Value'])
        links.new(rng.outputs['Result'], bsdf.inputs['Roughness'])
    return m


def emissive(name, hex_, strength):
    m, nodes, links, bsdf = _new(name)
    bsdf.inputs['Base Color'].default_value = srgb(hex_)
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Emission Color'].default_value = srgb(hex_)
    bsdf.inputs['Emission Strength'].default_value = strength
    return m


def set_status(state, strength_scale=1.0):
    """Recolour the ONE shared status material. The model is never rebuilt."""
    hex_, s = STATUS_STATES[state]
    m = bpy.data.materials['MC_STATUS_LIGHT']
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hex_)
    b.inputs['Emission Color'].default_value = srgb(hex_)
    b.inputs['Emission Strength'].default_value = s * strength_scale
    m['status'] = state
    return m


def build_library():
    """Each role has its own response. The difference is roughness, specular
    and coat, never a visible texture: paint is semi-gloss, concrete and
    pavers are dry, rubber is dead matte with a dusty sheen, wood is varnished,
    metal is metal, glass is a dark mirror, plastic is glossy, foliage is soft."""
    P = PALETTE
    lib = {}
    # painted architecture: semi-gloss enamel, the coat gives every bevel a catch
    lib['MC_PAINT_WHITE'] = pbr('MC_PAINT_WHITE', P['paint_white'], 0.45, coat=0.25, coat_rough=0.22)
    lib['MC_PAINT_CREAM'] = pbr('MC_PAINT_CREAM', P['paint_cream'], 0.48, coat=0.2, coat_rough=0.25)
    lib['MC_PAINT_BLUE'] = pbr('MC_PAINT_BLUE', P['paint_blue'], 0.4, coat=0.3, coat_rough=0.2)
    lib['MC_PAINT_NAVY'] = pbr('MC_PAINT_NAVY', P['paint_navy'], 0.4, coat=0.3, coat_rough=0.2)
    lib['MC_PAINT_SLATE'] = pbr('MC_PAINT_SLATE', P['paint_slate'], 0.88, spec=0.25, sheen=0.2)   # rubber floor
    # rubber: dead matte, low specular, a dusty sheen at grazing angles
    lib['MC_TRACK'] = pbr('MC_TRACK', P['track'], 0.92, var=0.04, spec=0.2, sheen=0.35, sheen_rough=0.6)
    lib['MC_TRACK_LINE'] = pbr('MC_TRACK_LINE', P['track_line'], 0.7, var=0.03, spec=0.35)
    # moulded plastic: glossy, tight highlight
    lib['MC_COMPOSITE_YELLOW'] = pbr('MC_COMPOSITE_YELLOW', P['yellow'], 0.28, var=0.0, coat=0.4, coat_rough=0.1)
    # mineral ground: dry, almost no specular
    lib['MC_CONCRETE'] = pbr('MC_CONCRETE', P['concrete'], 0.9, var=0.05, spec=0.3)
    lib['MC_CONCRETE_DK'] = pbr('MC_CONCRETE_DK', P['concrete_dk'], 0.9, var=0.05, spec=0.3)
    lib['MC_PAVER'] = pbr('MC_PAVER', P['paver'], 0.86, var=0.05, spec=0.35)
    lib['MC_ROAD'] = pbr('MC_ROAD', P['road'], 0.9, var=0.04, spec=0.3)
    # display plinth: a lacquered light ledge over a dark satin base
    lib['MC_PLINTH'] = pbr('MC_PLINTH', P['plinth'], 0.5, coat=0.35, coat_rough=0.18)
    lib['MC_PLINTH_DK'] = pbr('MC_PLINTH_DK', P['plinth_dk'], 0.42, coat=0.4, coat_rough=0.2)
    # glass: a dark mirror that picks up the sky; interiors glow warm in some panes
    lib['MC_GLASS'] = pbr('MC_GLASS', P['glass'], 0.04, var=0.0, coat=1.0, coat_rough=0.02, spec=1.0, ior=1.52)
    lib['MC_GLASS_LIT'] = emissive('MC_GLASS_LIT', P['glass_lit'], 2.6)
    # metal: brushed aluminium, and dark powder-coated steel
    lib['MC_METAL'] = pbr('MC_METAL', P['metal'], 0.24, metal=1.0, var=0.04)
    lib['MC_METAL_DARK'] = pbr('MC_METAL_DARK', P['metal_dark'], 0.38, metal=0.35, var=0.0, coat=0.35, coat_rough=0.3)
    # wood: oiled and varnished, warmer and glossier than anything mineral
    lib['MC_WOOD'] = pbr('MC_WOOD', P['wood'], 0.5, var=0.06, coat=0.35, coat_rough=0.3)
    lib['MC_WOOD_DARK'] = pbr('MC_WOOD_DARK', P['wood_dark'], 0.6, var=0.05)
    # foliage: soft, a little light through the leaves, velvet grass
    lib['MC_LEAF'] = pbr('MC_LEAF', P['leaf'], 0.6, var=0.05, sheen=0.4, sss=0.15)
    lib['MC_LEAF_DARK'] = pbr('MC_LEAF_DARK', P['leaf_dark'], 0.62, var=0.05, sheen=0.4, sss=0.12)
    lib['MC_GRASS'] = pbr('MC_GRASS', P['grass'], 0.95, var=0.04, spec=0.25, sheen=0.7, sheen_rough=0.4)
    lib['MC_SOIL'] = pbr('MC_SOIL', P['soil'], 0.95, var=0.04, spec=0.2)
    lib['MC_SKIN'] = pbr('MC_SKIN', P['skin'], 0.5, var=0.0, sss=0.2)
    # the single status material
    lib['MC_STATUS_LIGHT'] = emissive('MC_STATUS_LIGHT', '#3FBF7F', 1.4)
    return lib


def build_backdrop_material():
    """Studio floor: a quiet neutral that fades to the world colour so the
    diorama is separated from the background by value, not by an outline."""
    m, nodes, links, bsdf = _new('MC_STUDIO_FLOOR')
    for n in list(nodes):
        if n.name not in ('Principled BSDF', 'Material Output'):
            nodes.remove(n)
    tc = nodes.new('ShaderNodeTexCoord')
    sep = nodes.new('ShaderNodeVectorMath')
    sep.operation = 'LENGTH'
    rng = nodes.new('ShaderNodeMapRange')
    rng.inputs['From Min'].default_value = 8.0
    rng.inputs['From Max'].default_value = 48.0
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = srgb('#A3978D')
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = srgb('#7B7069')
    links.new(tc.outputs['Object'], sep.inputs[0])
    links.new(sep.outputs['Value'], rng.inputs['Value'])
    links.new(rng.outputs['Result'], ramp.inputs['Fac'])
    links.new(ramp.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.15
    return m


def strip_procedural(mat_):
    """Remove the roughness variation so the material exports as constants."""
    nt = mat_.node_tree
    b = nt.nodes.get('Principled BSDF')
    node = nt.nodes.get('MC_RoughVar')
    if not node or not b:
        return
    link = b.inputs['Roughness'].links
    if link:
        rng = link[0].from_node
        mid = 0.5 * (rng.inputs['To Min'].default_value + rng.inputs['To Max'].default_value)
        nt.links.remove(link[0])
        b.inputs['Roughness'].default_value = mid
