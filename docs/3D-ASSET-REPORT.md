# Golden diorama: asset, export and render report

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
project content: CAMERA_RIG (2 cameras), LIGHT_RIG (key and backdrop suns,
fill and rim areas), WORLD, PLATFORM_BASE, MATERIAL_LIBRARY (swatches, hidden
from render), WORKER_BASE, STATUS_LIGHTS, PROJECT_CONTENT (empty) and EXPORT
(empty).

A new project starts by opening the master and adding to PROJECT_CONTENT.

## Export budget, before and after the final art pass

| Measure | Before | After |
| --- | --- | --- |
| File | 1.37 MB | 1.79 MB |
| Triangles | 55 042 | 68 038 |
| Vertices | 28 713 | 35 649 |
| Mesh objects | 34 | 37 |
| Draw calls (estimate, one per mesh per material) | 60 | 67 |
| Materials | 24 | 25 (adds soil) |
| Textures, texture memory | 0, 0 bytes | 0, 0 bytes |
| Armatures | 5 | 6, one per worker |
| Clips | 2 | 5: `MC_IDLE`, `MC_WORKING`, `MC_ACTIVE`, `MC_SIGNAL`, `MC_REPAIR` |
| Status meshes | 7 | 8: rim, beacon, six helmet bands |
| Non-identity mesh transforms after re-import | none | none |
| Bounds | 16.9 x 16.9 x 8.3 m | unchanged |

Animation is 18 KB of the file; the growth is geometry. Where the triangles
go now: window frames about 6.3k, six workers about 15.5k, foliage about 4.7k,
the timing tower about 2k, the rest spread across architecture and props.
Every addition reuses a library material except tree-pit soil. If the web world
needs less, the cheapest levers in order are window-frame geometry, worker
segment counts, foliage segments, then bevels on the smallest props.

Static meshes are joined per material. Status meshes and skinned worker parts
stay separate so the status can be recoloured and the workers can play clips.

## Status system

One shared emission material, `MC_STATUS_LIGHT`, on the rim, the tower beacon
and the helmet bands. `set_status(state)` recolours it; nothing is rebuilt. All
seven states render distinctly: see `art/renders/golden-status-states.png`.
Default is STABLE. Strengths 1.0 to 1.6, because higher values wash to white
under AgX.

## Lighting, before and after

| | Before | After |
| --- | --- | --- |
| Key | 22 m area disk, 20 000 W, about 35 degrees across as seen from the model | sun, 7 degree disc, azimuth -140, elevation 34, strength 5.0, warm |
| Backdrop | lit by the same key | lit only by a twin sun with a 24 degree disc (light linking) |
| Fill | 26 m area, 3 000 W | 30 m area, 320 W, cool |
| Rim | 14 m area, 1 100 W | 12 m area, 2 600 W, higher and further back |
| World | strength 0.7 | strength 0.32, cooler sky |
| Look | AgX Punchy, exposure +0.45 | AgX Medium High Contrast, exposure 0 |

Measured on the rendered images (display luminance, 0 to 1):

| Sample | Before | After |
| --- | --- | --- |
| Ledge, lit face | 0.79 | 0.77 |
| Ledge, shadow face | 0.68 | 0.37 |
| Lit to shadow, same material | 1.16:1 | 2.07:1 (about 4:1 linear) |
| Hero wall, lit | 0.76 | 0.76 |
| Open deck | 0.78 | 0.70 |
| Backdrop | 0.72 | 0.61 |

## Render settings

| | Draft | Final |
| --- | --- | --- |
| Engine | EEVEE | Cycles, GPU (OptiX), OpenImageDenoise |
| Samples | 48 | 64 minimum clean, 128 hero |
| Size | 1200 px (900 default) | 1800 px |
| Bounces | n/a | 8 total, 4 diffuse, 3 glossy, 4 transmission |
| Clamp | n/a | indirect 8, direct off |
| Adaptive | n/a | threshold 0.01 |
| Colour | AgX, "AgX - Medium High Contrast", exposure 0, gamma 1.0 | same |
| Camera | orthographic, scale 25.5 | same, or 135 mm long-lens |
| Output | 8-bit PNG, no metadata stamp | same; transparent variant uses a shadow catcher |

Measured on one NVIDIA GPU at 1800 px, including scene load: 64 samples 21 s,
128 samples 28 s, 128 samples transparent 45 s, long lens 29 s. Draft at
1200 px 8 s.

## Files

| File | What it is |
| --- | --- |
| `art/renders/golden-final.png` | final, 1800 px, 128 samples |
| `art/renders/golden-final-transparent.png` | final with alpha and shadow catcher |
| `art/renders/golden-final-longlens.png` | final, 135 mm variant |
| `art/renders/golden-draft-eevee.png` | draft, 1200 px |
| `art/renders/golden-status-states.png` | the seven status states |
| `art/renders/golden-before-after.png` | the previous final beside this one |
| `art/exports/golden-diorama.glb` | optimized model |
| `art/exports/golden-diorama.audit.json` | audit numbers |

The comparison sheet with the references is built by `scripts/sheet.py` into
`art/renders/local/`, which is git-ignored because it places reference art
beside our renders.

## Final art pass: what changed

Three review passes, each: render, compare to the references, name the five
most obvious gaps, fix, render again.

**Pass 1: light and value.**
- Gaps: no readable light direction, shadow side nearly as bright as lit side,
  deck, plinth and backdrop in one value band, glass read as blue paint, every
  surface the same satin.
- Fixes: sun key and cooler, weaker fill; darker backdrop; a dark lacquered
  plinth base; the material library differentiated by role; dark mirror glass.

**Pass 2: construction and the podium.**
- Gaps: the stepped podium read as stacked blocks, facades had no construction
  layer, ground surfaces had no edges, trees were spheres on sticks, lit panes
  read as cream paint.
- Fixes: the podium replaced by a finish-line timing tower; graphite base
  courses, entrance steps and handrails, downpipes, kerbs around the lawn and
  the sprint track, a linear drain, finish timing posts; multi-clump two-tone
  trees with tree pits, a clipped hedge in a planter, soil-topped planters;
  amber lit interiors.

**Pass 3: life, workers, composition.**
- Gaps: workers pale and posed backwards (a sign error in the rig, found by
  measuring it), no evidence of use, a scattered foreground, long shadows
  printing hard blobs on the backdrop, one roof worker floating 15 cm above the
  roof.
- Fixes: the rig's rotation directions measured and every pose rewritten;
  three new clips; outfits blocked for thumbnails; a runner, a coach, a
  signalling worker at the tower, a technician at an open plant panel, a lifter
  and a worker at the water cooler; an equipment cart, water station, agility
  ladder and slalom, plyo boxes with rubber tops, a wayfinding totem; light
  linking for the backdrop; the deck and backdrop stepped down a value; every
  worker's contact measured.

## Reference comparison: same quality class?

**Lighting and finish: yes, same class.** Light direction is unmistakable but
soft, shadows ground everything, warm and cool separate lit from shade, and the
hero separates by value. Next to the cleanest references (the interior
miniature and the lit display pieces) it holds up.

**Density and richness: still below the densest references.** The city
references carry vehicles, crowds, signage and dozens of props per block, and
more colour variation within each material. That is content, not pipeline.

Remaining gaps, in order:

1. Density against the busiest references.
2. Glass reflects a plain sky, so it reads as dark glass rather than showing
   reflections.
3. Materials are clean constants; a hint of per-object colour variation would
   add richness without noise.
4. The hall's middle string course reads as a plain shelf.
5. Studio lighting does not travel in the GLB; the app's world must recreate it.
