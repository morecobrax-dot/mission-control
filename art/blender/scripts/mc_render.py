"""Render presets. DRAFT is for iteration, FINAL is for the record."""
import bpy
import os

PRESETS = {
    # EEVEE with ray-traced GI-ish bounce: fast, honest about form and value
    'DRAFT': dict(engine='BLENDER_EEVEE', samples=48, res=(900, 900), denoise=False),
    # Cycles, real GI, denoised, transparent-capable
    'FINAL': dict(engine='CYCLES', samples=256, res=(1800, 1800), denoise=True),
}


def _gpu():
    cy = bpy.context.preferences.addons['cycles'].preferences
    for kind in ('OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'):
        try:
            cy.compute_device_type = kind
            cy.get_devices()
            devs = [d for d in cy.devices if d.type != 'CPU']
            if devs:
                for d in cy.devices:
                    d.use = d.type != 'CPU'
                return kind
        except Exception:
            continue
    return None


def apply(preset, transparent=False, samples=None, res=None):
    s = bpy.context.scene
    p = PRESETS[preset]
    s.render.engine = p['engine']
    s.render.resolution_x, s.render.resolution_y = res or p['res']
    s.render.resolution_percentage = 100
    s.render.film_transparent = transparent
    s.render.image_settings.file_format = 'PNG'
    s.render.image_settings.color_mode = 'RGBA' if transparent else 'RGB'
    s.render.image_settings.color_depth = '8'
    n = samples or p['samples']
    if p['engine'] == 'CYCLES':
        c = s.cycles
        c.samples = n
        c.use_adaptive_sampling = True
        c.adaptive_threshold = 0.01
        c.use_denoising = p['denoise']
        try:
            c.denoiser = 'OPENIMAGEDENOISE'
        except Exception:
            pass
        c.max_bounces = 8
        c.diffuse_bounces = 4
        c.glossy_bounces = 3
        c.transmission_bounces = 4
        c.transparent_max_bounces = 6
        # clamp fireflies at the source rather than blurring them away later
        c.sample_clamp_indirect = 8.0
        c.sample_clamp_direct = 0.0
        c.filter_width = 1.2
        kind = _gpu()
        c.device = 'GPU' if kind else 'CPU'
        s['mc_device'] = kind or 'CPU'
    else:
        e = s.eevee
        e.taa_render_samples = n
        for attr, val in (('use_raytracing', True), ('use_shadows', True), ('use_gtao', True)):
            if hasattr(e, attr):
                setattr(e, attr, val)
        if hasattr(e, 'ray_tracing_method'):
            e.ray_tracing_method = 'SCREEN'
    for attr in dir(s.render):
        if attr.startswith('use_stamp'):
            setattr(s.render, attr, False)  # metadata would embed the local file path
    s.render.use_high_quality_normals = True
    return s


def set_camera(name):
    s = bpy.context.scene
    s.camera = bpy.data.objects[name]


def set_floor_mode(transparent):
    """Solid backdrop keeps the vignette floor; transparent turns it into a
    shadow catcher so the diorama's contact and cast shadows survive alpha."""
    f = bpy.data.objects.get('MC_StudioFloor')
    if not f:
        return
    f.is_shadow_catcher = bool(transparent)
    f.hide_render = False


def render_to(path):
    s = bpy.context.scene
    path = os.path.abspath(path)
    s.render.filepath = path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    return path
