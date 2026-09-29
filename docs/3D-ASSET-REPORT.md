# golden diorama: asset, export and render report

Produced by the scripts in `art/blender/scripts/` in Blender 5.2 LTS, headless.
Numbers come from `art/exports/golden-diorama.audit.json` and from the
rendered files in `art/renders/`.

## Rebuild

```
blender -b -noaudio -P art/blender/scripts/build_master.py
blender -b -noaudio art/blender/models/golden-diorama.blend -P art/blender/scripts/render.py -- --preset FINAL --out art/renders/golden-final.png --samples 128
blender -b -noaudio art/blender/models/golden-diorama.blend -P art/blender/scripts/export_glb.py -- --out art/exports/golden-diorama.glb --report art/exports/golden-diorama.audit.json
blender -b -noaudio -P art/blender/scripts/verify_glb.py -- art/exports/golden-diorama.glb
```

Run from the repository root. No script embeds an absolute path.

## Master file

`art/blender/mission-control-master.blend` holds nine collections and no
project content: CAMERA_RIG (2 cameras), LIGHT_RIG (3 area lights), WORLD,
PLATFORM_BASE, MATERIAL_LIBRARY (26 swatches, hidden from render), WORKER_BASE,
STATUS_LIGHTS, PROJECT_CONTENT (empty) and EXPORT (empty).

A new project starts by opening the master and adding to PROJECT_CONTENT.

## Export budget

| Measure | Value |
| --- | --- |
| File | `golden-diorama.glb`, 1.37 MB |
| Triangles | 55 042 |
| Vertices | 28 713 |
| Mesh objects | 34 |
| Draw calls (estimate, one per mesh per material) | 60 |
| Materials | 24 |
| Textures | 0 |
| Texture memory | 0 bytes |
| Armatures | 5, one per worker |
| Clips | `MC_IDLE`, `MC_WORKING` (165 channels each) |
| Status meshes | rim, beacon, five helmet bands |
| Non-identity mesh transforms after re-import | none |
| Bounds | 16.9 x 16.9 x 8.3 m |

Where the triangles go: window frames about 6.3k, five workers about 12.5k,
foliage and other spheres a few thousand, architecture the rest. If the web
world needs less, the cheapest levers in order are window frame geometry,
worker segment counts, then foliage segments.

Static meshes are joined per material (24 groups). Status meshes and skinned
worker parts stay separate so the status can be recoloured and the workers
can play clips. Draw calls could fall by joining the five workers' bodies, at
the cost of independent poses.

## Status system

One shared emission material, `MC_STATUS_LIGHT`, on the rim, beacon and
helmet bands. `set_status(state)` recolours it; nothing is rebuilt. All seven
states render distinctly: see `art/renders/golden-status-states.png`. Default is
STABLE. Strengths 1.0 to 1.6, because higher values wash to white under AgX.

## Render settings

| | Draft | Final |
| --- | --- | --- |
| Engine | EEVEE | Cycles, GPU (OptiX), OpenImageDenoise |
| Samples | 48 | 64 minimum clean, 128 hero |
| Size | 1200 px (900 default) | 1800 px |
| Bounces | n/a | 8 total, 4 diffuse, 3 glossy, 4 transmission |
| Clamp | n/a | indirect 8, direct off |
| Adaptive | n/a | threshold 0.01 |
| Colour | AgX, look "AgX - Punchy", exposure +0.45, gamma 1.0 | same |
| Camera | orthographic, scale 25.5 | same, or 135 mm long-lens |
| Output | 8-bit PNG | 8-bit PNG; transparent variant uses a shadow catcher |

Measured on one NVIDIA GPU at 1800 px, including scene load: 64 samples 21 s,
128 samples 32 s, 256 samples 43 s. Draft at 1200 px 6 s. A sample study at
16, 32, 64, 128 and 256 found all of them free of visible noise with the
denoiser, 32 slightly soft, and no visible gain past 128.

## Files

| File | What it is |
| --- | --- |
| `art/renders/golden-draft-eevee.png` | draft, 1200 px |
| `art/renders/golden-final.png` | final, 1800 px, 128 samples |
| `art/renders/golden-final-transparent.png` | final with alpha and shadow catcher |
| `art/renders/golden-final-longlens.png` | final, 135 mm variant |
| `art/renders/golden-status-states.png` | the seven status states |
| `art/exports/golden-diorama.glb` | optimized model |
| `art/exports/golden-diorama.audit.json` | audit numbers |

The reference-versus-diorama contact sheet is built by `scripts/sheet.py` into
`art/renders/local/`, which is git-ignored because it places reference art
beside our renders.

## Reference comparison: same quality class?

Honest answer: **same treatment, not yet the same finish.**

What matches: three-quarter isometric framing, a rounded plinth that reads as a
single object, beveled edges catching soft highlights, clean satin PBR, real
GI with soft contact shadows, warm-and-cool lighting that never goes black,
and a clear hero mass. It reads as a considered architectural miniature, not
as low-poly or toy.

Five largest gaps against the strongest references, in order:

1. **Density.** The references carry dozens of small, specific props per
   square metre. It has the right things but at half the density; wall and
   paver areas stay quiet.
2. **Value and saturation range.** It sits in a narrow, pastel value band.
   The references use one deeper dark and one warm glow to make the light feel
   like a place.
3. **Podium mass.** The progression podium is still the chunkiest form and is
   the first thing a design eye would fix.
4. **Material glossiness.** The paints are satin; references use glossy
   lacquer highlights on small objects that sparkle at 1x.
5. **Life.** No vehicles, people-scale signage or interior glow; workers are
   the only life.

Passes made: four draft passes, six Cycles review passes, a sample study, a
status sheet and a GLB re-import render. Findings drove: warm palette, a real
barrel vault, riser lights on visible faces, flower boxes, shrubs and benches,
lower status strengths, AgX Punchy at +0.45, and baked worker scale.

Gaps 1, 2 and 4 are content and tuning, not pipeline, and are the right next
job for the second diorama rather than a reason to hold the first.
