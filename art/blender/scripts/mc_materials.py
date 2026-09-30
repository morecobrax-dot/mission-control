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
    # DayPlan: its Mission Control identity (the rose of --tint-calendar) on
    # the warm graphite of its own app, with light stone and a deeper rose
    'dp_rose':      '#CB7F9E',
    'dp_rose_dk':   '#9E5673',
    'dp_graphite':  '#3A3633',
    'dp_stone':     '#E4D8C6',
    # Daily Verse: warm limestone and the night-sky indigo of its app, trimmed
    # in the bronze of --tint-book
    'dv_limestone': '#E8DDC7',
    'dv_indigo':    '#353C66',
    'dv_bronze':    '#B38258',
    # Personal Savings: pale civic stone (--tint-vault) and a deep bank green
    'ps_stone':     '#E3DBCE',
    'ps_green':     '#2F5A44',
    'ps_green_lt':  '#6E9A7C',
    'ps_brass':     '#C49C5C',
    # Space Kindergarten: the periwinkle of --tint-rocket and a deep-space indigo
    'sk_periwinkle': '#8FA2F2',
    'sk_indigo':    '#2E3673',
    'sk_yellow':    '#F0C24B',
    # Capy Sushi: the coral of --tint-sushi, lime plaster, charcoal roof tiles,
    # salmon, and the capybara's own brown
    'cs_coral':     '#DB8466',
    'cs_plaster':   '#F2E7D3',
    'cs_charcoal':  '#36322F',
    'cs_salmon':    '#F29A74',
    'cs_capy':      '#9C6D47',
    'cs_tile':      '#3B3735',
    'dv_slate':     '#5B5C63',
    'ps_roof':      '#3F6B53',
    # one metal for fittings that should read as brass, not aluminium
    'brass':        '#C9A25E',
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
    lib['MC_DP_ROSE'] = pbr('MC_DP_ROSE', P['dp_rose'], 0.42, coat=0.28, coat_rough=0.2)
    lib['MC_DP_ROSE_DK'] = pbr('MC_DP_ROSE_DK', P['dp_rose_dk'], 0.42, coat=0.28, coat_rough=0.2)
    lib['MC_DP_GRAPHITE'] = pbr('MC_DP_GRAPHITE', P['dp_graphite'], 0.46, coat=0.25, coat_rough=0.22)
    lib['MC_DP_STONE'] = pbr('MC_DP_STONE', P['dp_stone'], 0.48, coat=0.2, coat_rough=0.25)
    for key in ('dv_limestone', 'dv_indigo', 'dv_bronze', 'ps_stone', 'ps_green', 'ps_green_lt', 'ps_brass', 'sk_periwinkle',
                'sk_indigo', 'sk_yellow', 'cs_coral', 'cs_plaster', 'cs_charcoal', 'cs_salmon', 'cs_capy'):
        name = 'MC_' + key.upper()
        lib[name] = pbr(name, P[key], 0.45, coat=0.28, coat_rough=0.22)
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
    # fired roof tile: matte ceramic, so a big tilted roof never mirrors the sky
    lib['MC_CS_TILE'] = pbr('MC_CS_TILE', P['cs_tile'], 0.88, var=0.04, spec=0.32)
    lib['MC_DV_SLATE'] = pbr('MC_DV_SLATE', P['dv_slate'], 0.86, var=0.04, spec=0.35)
    lib['MC_PS_ROOF'] = pbr('MC_PS_ROOF', P['ps_roof'], 0.86, var=0.04, spec=0.35)     # patinated copper, matte
    # display plinth: a lacquered light ledge over a dark satin base
    lib['MC_PLINTH'] = pbr('MC_PLINTH', P['plinth'], 0.5, coat=0.35, coat_rough=0.18)
    lib['MC_PLINTH_DK'] = pbr('MC_PLINTH_DK', P['plinth_dk'], 0.42, coat=0.4, coat_rough=0.2)
    # glass: a dark mirror that picks up the sky; interiors glow warm in some panes
    lib['MC_GLASS'] = pbr('MC_GLASS', P['glass'], 0.04, var=0.0, coat=1.0, coat_rough=0.02, spec=1.0, ior=1.52)
    lib['MC_GLASS_LIT'] = emissive('MC_GLASS_LIT', P['glass_lit'], 2.6)
    # metal: brushed aluminium, and dark powder-coated steel
    lib['MC_METAL'] = pbr('MC_METAL', P['metal'], 0.24, metal=1.0, var=0.04)
    lib['MC_BRASS'] = pbr('MC_BRASS', P['brass'], 0.3, metal=1.0, var=0.03)
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


def fold_sheen_weight(mat_):
    """glTF has no sheen weight: the exporter writes Sheen Tint as the sheen
    colour and drops the weight, so a 0.35 sheen arrives in three.js at full
    strength and matte rubber and grass turn milky. Fold the weight into the
    tint (on the export copy only) so the colour carries it."""
    if not mat_.node_tree:
        return
    b = mat_.node_tree.nodes.get('Principled BSDF')
    if not b or 'Sheen Weight' not in b.inputs:
        return
    w = b.inputs['Sheen Weight'].default_value
    if w <= 0:
        return
    t = b.inputs['Sheen Tint'].default_value
    b.inputs['Sheen Tint'].default_value = (t[0] * w, t[1] * w, t[2] * w, 1.0)
    b.inputs['Sheen Weight'].default_value = 1.0


# ---------------------------------------------------------------- families
# Materials that answer light the same way and differ only in colour. At
# export they become one material each, the colour carried per vertex, so a
# district costs one draw per family instead of one per paint colour. A
# material that answers light differently never joins a family: the export
# refuses a family whose members differ by more than FAMILY_TOLERANCE.
FAMILIES = {
    'MC_FAM_COATED': ['MC_PAINT_WHITE', 'MC_PAINT_CREAM', 'MC_PAINT_BLUE', 'MC_PAINT_NAVY',
                      'MC_PLINTH', 'MC_PLINTH_DK', 'MC_WOOD',
                      'MC_DP_ROSE', 'MC_DP_ROSE_DK', 'MC_DP_GRAPHITE', 'MC_DP_STONE',
                      'MC_DV_LIMESTONE', 'MC_DV_INDIGO', 'MC_DV_BRONZE', 'MC_PS_STONE', 'MC_PS_GREEN',
                      'MC_PS_GREEN_LT', 'MC_PS_BRASS', 'MC_SK_PERIWINKLE', 'MC_SK_INDIGO', 'MC_SK_YELLOW', 'MC_CS_CORAL', 'MC_CS_PLASTER',
                      'MC_CS_CHARCOAL', 'MC_CS_SALMON', 'MC_CS_CAPY'],
    'MC_FAM_MINERAL': ['MC_CONCRETE', 'MC_CONCRETE_DK', 'MC_PAVER', 'MC_SOIL', 'MC_ROAD', 'MC_CS_TILE', 'MC_DV_SLATE', 'MC_PS_ROOF'],
    'MC_FAM_RUBBER': ['MC_TRACK', 'MC_PAINT_SLATE'],
    'MC_FAM_FOLIAGE': ['MC_LEAF', 'MC_LEAF_DARK'],
}
# Each family's response is fixed here, not averaged from whoever joins it:
# a new district's paint must never shift an approved district's material.
# The values are the approved golden diorama's members, averaged once.
FAMILY_RESPONSE = {
    'MC_FAM_COATED': {'Roughness': 0.45, 'Coat Weight': 0.307, 'Coat Roughness': 0.221, 'Specular IOR Level': 0.5,
                      'IOR': 1.45},
    'MC_FAM_MINERAL': {'Roughness': 0.902, 'Coat Weight': 0.0, 'Specular IOR Level': 0.29, 'IOR': 1.45},
    'MC_FAM_RUBBER': {'Roughness': 0.9, 'Specular IOR Level': 0.225, 'Sheen Weight': 1.0, 'Sheen Roughness': 0.55,
                      'Sheen Tint': 0.275, 'IOR': 1.45},
    'MC_FAM_FOLIAGE': {'Roughness': 0.61, 'Sheen Weight': 1.0, 'Sheen Roughness': 0.5, 'Sheen Tint': 0.4,
                       'Subsurface Weight': 0.135, 'IOR': 1.45},
}
FAMILY_INPUTS = ['Roughness', 'Metallic', 'Coat Weight', 'Coat Roughness', 'Specular IOR Level', 'IOR',
                 'Sheen Weight', 'Sheen Roughness', 'Subsurface Weight', 'Transmission Weight']
FAMILY_TOLERANCE = {'Roughness': 0.12, 'Metallic': 0.0, 'Coat Weight': 0.22, 'Coat Roughness': 0.2,
                    'Specular IOR Level': 0.25, 'IOR': 0.1, 'Sheen Weight': 0.0, 'Sheen Roughness': 0.15,
                    'Subsurface Weight': 0.1, 'Transmission Weight': 0.0, 'Sheen Tint': 0.2}
COLOUR_ATTRIBUTE = 'MC_Colour'


def family_of(name):
    for fam, members in FAMILIES.items():
        if name in members:
            return fam
    return None


def _bsdf(m):
    return m.node_tree.nodes.get('Principled BSDF') if m and m.node_tree else None


def base_colour(m):
    b = _bsdf(m)
    return tuple(b.inputs['Base Color'].default_value) if b else (1.0, 1.0, 1.0, 1.0)


def build_family(fam):
    """The family's one material: its fixed response, with the base colour read
    from the vertex colour. Raises if a member answers light differently from
    the family by more than FAMILY_TOLERANCE."""
    members = [bpy.data.materials.get(n) for n in FAMILIES[fam]]
    members = [m for m in members if m and _bsdf(m)]
    m, nodes, links, bsdf = _new(fam)
    want = FAMILY_RESPONSE[fam]
    for inp in FAMILY_INPUTS:
        if inp in want:
            bsdf.inputs[inp].default_value = want[inp]
    t = want.get('Sheen Tint', 1.0)
    bsdf.inputs['Sheen Tint'].default_value = (t, t, t, 1.0)
    off = []
    for mm in members:
        b = _bsdf(mm)
        for inp in FAMILY_INPUTS:
            if abs(b.inputs[inp].default_value - bsdf.inputs[inp].default_value) > FAMILY_TOLERANCE[inp] + 1e-6:
                off.append('%s %s %.2f vs %.2f' % (mm.name, inp, b.inputs[inp].default_value, bsdf.inputs[inp].default_value))
        tint = sum(b.inputs['Sheen Tint'].default_value[:3]) / 3
        if b.inputs['Sheen Weight'].default_value > 0 and abs(tint - t) > FAMILY_TOLERANCE['Sheen Tint'] + 1e-6:
            off.append('%s Sheen Tint %.2f vs %.2f' % (mm.name, tint, t))
    if off:
        raise ValueError('%s: members answer light differently: %s' % (fam, '; '.join(off)))
    # glTF writes the unlinked default as baseColorFactor, which three.js
    # multiplies with the vertex colour: it must be white, not Blender's 0.8
    bsdf.inputs['Base Color'].default_value = (1.0, 1.0, 1.0, 1.0)
    col = nodes.new('ShaderNodeVertexColor')
    col.layer_name = COLOUR_ATTRIBUTE
    links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    m.use_fake_user = False
    return m
