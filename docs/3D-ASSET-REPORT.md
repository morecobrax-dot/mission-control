# Authored districts: asset, export and render report

Produced by the scripts in `art/blender/scripts/` in Blender 5.2 LTS, headless.
Numbers come from `art/exports/<name>.audit.json` and from the rendered files
in `art/renders/`. The golden diorama (the first project's place) came first;
the DayPlan district is the second, and the pipeline's scale test.

## Rebuild

```
blender -b -noaudio -P art/blender/scripts/build_master.py -- [--only golden|dayplan]
blender -b -noaudio art/blender/models/golden-diorama.blend -P art/blender/scripts/render.py -- --preset FINAL --out art/renders/golden-final.png --samples 128
blender -b -noaudio art/blender/models/golden-diorama.blend -P art/blender/scripts/export_glb.py -- --out art/exports/golden-diorama.glb --report art/exports/golden-diorama.audit.json
blender -b -noaudio -P art/blender/scripts/verify_glb.py -- art/exports/golden-diorama.glb
```

Run from the repository root. No script embeds an absolute path. The same
steps with `dayplan-diorama` build, render and export the DayPlan district.
A new district is a module in `art/blender/models/` (its `build`, `ACCENT`
and `WORKERS`, drawing on the shared kit in `mc_kit.py`) and one line in
`DIORAMAS` in `build_master.py`.

## Master file

`art/blender/mission-control-master.blend` holds nine collections and no
project content: CAMERA_RIG (2 cameras), LIGHT_RIG (key and backdrop suns,
fill and rim areas), WORLD, PLATFORM_BASE, MATERIAL_LIBRARY (swatches, hidden
from render), WORKER_BASE, STATUS_LIGHTS, PROJECT_CONTENT (empty) and EXPORT
(empty).

A new project starts by opening the master and adding to PROJECT_CONTENT.

## Export budget, before and after the final art pass

(The export has since been packed: see "Export packing" below.)

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
5. Studio lighting does not travel in the GLB; the app recreates it (0.6.0,
   `LIGHT` in `field/world.js`). In the app the place is seen at the city
   camera's 13 degree yaw, not the renders' 45: at 45 a phone cannot show all
   six blocks at a readable size.

## Export packing: Golden before and after

The final art pass shipped at 67 draws and 25 materials, about three times
what one of six districts can spend. The model was not touched; the export
now packs it (see the art bible's Export section).

| Measure | Approved export | Packed export |
| --- | --- | --- |
| File | 1 794 344 B | 1 581 172 B |
| Triangles (counted from the file) | 68 038 | 68 486 |
| Draw calls (primitives) | 67 | 19 |
| Materials | 25 | 14 |
| Meshes | 37 | 14 |
| Skins, skeletons | 6, 6 | 1, 1 |
| Textures | 0 | 0 |

Where the 67 draws were: 23 static (architecture and props, one per mesh per
material), 2 status lights (rim, beacon), 36 on six separate workers and 6
helmet bands. Where the 19 are: 12 static, 1 status, 5 on the crew and 1 for
its helmet bands.

- Colour families took 16 materials to 4 (`MC_FAM_COATED`, `_MINERAL`,
  `_RUBBER`, `_FOLIAGE`). Glass, lit glass, metal, dark metal, grass, the
  composite, track line, dark wood, skin and the status light keep their
  own: each answers light differently.
- The crew is one skinned mesh and one skeleton; each worker still plays
  its own clip.
- Colours, normals and skin weights are 8-bit: the file shrank 12 percent
  with slightly more geometry in it.
- The extra 448 triangles are the status rim's bevel. The approved export
  dropped that modifier from the rim (224 triangles); Cycles always drew it
  (672). The packed export ships what the render shows.

In the app at overview (dpr 2, a frame without shadows) the city went from
178 to 130 draw calls, the shadow pass from 70 to 28, and a focused Golden
from 82 to 35.

**Visual check.** The packed copy rendered in Cycles with the approved
settings (`--preview`), compared pixel by pixel with the approved final:
mean difference 0.16 percent, 0.13 percent of pixels differ by more than 5
percent, all on one worker's legs, which stand slightly differently (under a
tenth of a metre) because of a leftover in that rig's source pose. No
material, colour or silhouette change:
`art/renders/golden-optimized-vs-approved.png`.

## DayPlan district

An operations and dispatch centre: a graphite dispatch hall with a
control-room window ribbon and three loading bays, a clock tower with a rose
crown and two faces, a schedule board, and a timeline walk laid in the
paving (fixed blocks in rose, flexible blocks in stone, hour posts) along
which a "now" gate walks.

**Concept.** Three silhouettes were built and judged at thumbnail size
(`art/renders/dayplan-concepts.png` and `-thumbnail.png`): A, the hall and
clock tower; B, a sawtooth dispatch hall; C, a rotunda under a dial. A was
chosen: the tower is the one vertical in the city that says "time" at 70 px.
B read as a factory; C read as a mushroom, and its dial vanished at thumbnail
size.

| Per district | Budget | DayPlan |
| --- | --- | --- |
| Draw calls | 24 | 21 |
| Triangles | 80 000 | 51 298 |
| Materials | 16 | 12 |
| Workers | 8 | 5 |
| File | 2 000 000 B | 1 330 208 B |
| Textures | 0 | 0 |

Crew, in rose and graphite: a dispatcher at the board with a tablet
(`WORKING`), a signaller by the tower (`SIGNAL`), a courier on the timeline
walk (`ACTIVE`), a technician on the clock balcony with a wrench (`REPAIR`)
and a coordinator with a clipboard (`IDLE`). Life (`MC_LIFE`, a 60 s loop):
the two second hands, the "now" gate and the time ball. Status lights: the
rim, the lamp atop the tower and the helmet bands, on `MC_STATUS_LIGHT`.

Renders: `dayplan-draft-eevee.png`, `dayplan-final.png` (Cycles, 1800 px,
128 samples), `dayplan-final-transparent.png`; in the app,
`runtime/dayplan-focus-*.png`, `runtime/dayplan-states.png` and
`runtime/dayplan-blender-vs-runtime.png`.

## Two districts in the app

Measured in headless Edge on an integrated Intel GPU that presents at 30 Hz,
at overview, device pixel ratio 2, a frame without the shadow pass. Frame
time is what one frame costs the GPU to finish, not the presentation rate.

| | Golden only | Golden + DayPlan | Six authored (proxy) |
| --- | --- | --- | --- |
| Draw calls | 130 | 133 | 146 |
| Triangles | 137k | 180k | 371k |
| Frame, desktop viewport | 15.9 ms | 18.1 ms | 33.2 ms |
| Frame, phone viewport | 9.5 ms | 9.5 ms | 13.0 ms |
| Frame, tablet viewport | 13.4 ms | 15.3 ms | 26.3 ms |
| Shadow refresh, added | 1.3 to 2.1 ms | 1.4 to 2.3 ms | about 3.1 ms |
| Materials, programs | 37, 21 | 51, 21 | 114, 20 |
| Authored files | 1.54 MB | 2.84 MB | about 8.7 MB, projected |
| Animation per frame | 0.02 ms | 0.04 ms | 0.05 ms |

The six-district proxy alternates the two real files over the six blocks.
Its cost is fill, not geometry or state changes: at one device pixel the
desktop frame is 13.3 ms, programs stay at about 20 because every district
shares the same shader variants, and each authored place adds about 3 draw
calls to the overview. Where the resolution must fall the world lowers it; a
30 Hz screen no longer makes it do so on its own (see ARCHITECTURE.md).

## The complete city (0.8.0)

Four districts joined the first project's and DayPlan's, through the same pipeline and
with no renderer code: each is a module in `art/blender/models/`, one line in
`DIORAMAS`, an export, one line in `ASSETS`, and `npm run config:sync`.

**Concepts.** Twelve massing studies on the shared platform, camera and light
(`art/renders/city-concepts.png` and `-thumbnail.png`), judged at thumbnail
size, for difference from the other five, and for room for workers:

| District | Chosen | Rejected |
| --- | --- | --- |
| Daily Verse | A: reading hall + observatory dome, a garden court | B: one great dome read as a pudding (DayPlan's rotunda failure); C: a cloister and tower read as a monastery, too literal, and its tower competed with DayPlan's |
| Personal Savings | A: a columned portico under a pediment, low wings | B: a round safe house read as a cartoon helmet; C: stepped terraces read as nothing, and edged toward a progress bar |
| Space Kindergarten | A: a rocket on its pad, a service tower, a classroom | B: a planet on stilts read as a flying saucer; C: low domes and tubes had no silhouette |
| Capy Sushi | A: a deep-eaved hip roof over an open counter, a terrace | B: a round pavilion read as a black pudding; C: a row of stalls read as houses |

Concept A of Space Kindergarten also had a dome; the dome went to Daily
Verse alone, and the classroom became a rounded capsule with portholes.

**Audits** (budget 24 draws, 80,000 triangles, 16 materials, 8 workers, 2 MB,
0 textures):

| District | Draws | Triangles | Materials | Workers | File | Life |
| --- | --- | --- | --- | --- | --- | --- |
| Daily Verse | 18 | 49,902 | 12 | 5 | 1.22 MB | the dome and telescope turn |
| Personal Savings | 16 | 43,694 | 12 | 5 | 1.09 MB | the revolving door |
| Space Kindergarten | 19 | 43,692 | 11 | 5 | 1.13 MB | planets, and the booth's dish |
| Capy Sushi | 15 | 39,992 | 10 | 5 | 1.01 MB | plates along the counter |

New paints joined the coated family and roofs the mineral family, so a new
palette cost no draws; brass (`MC_BRASS`, fittings only) is the one new
material. The first project's and DayPlan's files are unchanged; DayPlan rebuilt from its
refactored module exports the same JSON, vertices and triangles (only the
order of triangles within seven index buffers differs).

**Crews** (the shared rig; two shared props added, `book` and `tray`):

- Daily Verse: an astronomer at the telescope on the gallery, a librarian at
  the book cart, a reader at a terrace desk, a gardener, the keeper at the
  gate.
- Personal Savings: a greeter under the portico, an archivist at the open
  vault, a courier unloading the van, a planner with a tablet, a guard.
- Space Kindergarten: a technician on the tower's arm at the capsule, a
  teacher at the crater, a controller at the booth, a signaller at the pad,
  an explorer running across the plaza.
- Capy Sushi: the chef at the counter, a server with a tray, a prep cook at
  the produce crates, a delivery rider at the scooter, a host at the door.

**Found in review and fixed:** a coated roof mirrored the sky and washed a
dark roof pale (roofs are now mineral); large brass faces read black in the
app (metal is for fittings); a steel "ring" at the vault was a solid disc that
hid the vault from the app's frontal camera; three blues in one column (Daily
Verse's roof is slate).

**The six-district city in the app** (headless Edge, integrated Intel GPU,
overview, a frame without the shadow pass):

| | 2 authored | 6 authored |
| --- | --- | --- |
| Draw calls, shadow calls | 133, 46 | 135, 98 |
| Triangles | 180k | 309k |
| Materials, programs | 51, 21 | 104, 20 |
| Frame at 1x, 708x669 | 7.5 ms | 12.2 ms |
| Frame, desktop | 16.5 ms at 1.75x | 50.1 ms at 2x |
| Frame, iPhone viewport, 2x | 7.8 ms | 12.1 ms |
| Frame, iPad viewport, 1.75x | 12.7 ms | 20.6 ms |
| Shadow pass added | 2.3 ms | 3.1 ms |
| Animation per frame | 0.02-0.04 ms | 0.04-0.05 ms |
| Models downloaded | 2.8 MB | 7.2 MB |
| World ready | 0.4-1.1 s | 0.4-1.3 s |

Each new district adds 1.1 to 1.4 ms at 1x, linearly; none is an outlier.
Draws stay flat because an authored place replaces its recipe, and programs
do not grow. The cost is fill: the desktop's 50 ms at 2x is the 1x frame
over four times the pixels, and the world's step-down takes the desktop to
1.25x within five seconds, where it costs about 16 ms. At 30 Hz the iPhone
viewport keeps 2x (each timing check costs 12 to 15 ms against a 35 ms gap).
The phase 3E projection (146 draws, 371k triangles) was pessimistic on
triangles; the real desktop frame at 2x (50 ms) is higher than its proxy
estimate (33 ms), because the new districts' materials fill more of the
view.
