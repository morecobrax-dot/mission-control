# 3D art bible

The rules every Mission Control diorama obeys. The target is a premium stylized
architectural miniature: a small, calm, beautifully lit object you want to pick
up. It is not low-poly, voxel, flat, toy-like or photoreal.

`references/3d-style/` holds art direction only and is not tracked. Nothing is
copied from it: no shapes, layouts, colours or text. Only qualities are taken:
soft bevels, clean materials, gentle bounce light, one clear subject.

Everything below is enforced by `art/blender/`, not remembered. A rule that is
only in this file will drift; change the script and the number here together.

## Camera

- Three-quarter isometric: azimuth 45 degrees, elevation 35 degrees, camera at
  +x, -y. The left face (-y) is key-lit, the right face (+x) is the fill face.
- Baseline is **orthographic**, scale 25.5, target (0, 0, 2.6). Parallel lines
  stay parallel, which is what the app's flat and 3D fields both assume.
- Variant `MC_Cam_LongLens`: 135 mm on a 36 mm sensor, distance solved to match
  the orthographic framing. Use it for hero stills; the difference is a barely
  visible convergence and a slightly softer foreground.
- Never a wide lens. Never a dutch angle. The camera never turns per project.
- Frame the platform at 85 to 90 percent of the width. Leave the top third of
  the frame quiet: that is where a title or a status chip lands.

## Platform

- One plinth per project, identical for all: base slab, accent band, ledge,
  paver deck, status rim. Deck is 15.4 wide and its top is at z = 1.0.
- Corner radius shrinks with each layer (1.6, 1.5, 1.4, 1.0) so the stack reads
  as turned or milled, never as a stack of boxes.
- The accent band takes the project's identity colour. The status rim is a
  separate mesh that takes the status colour and nothing else.
- Deck paver gets a 1.5 to 2 m joint grid. It gives scale and stops the deck
  reading as one grey plane.

## Scale and proportions

- One unit is one metre in the miniature. A door is 2.1, a storey is 3.0 to 3.4.
- A worker is 1.8 m tall built to 1.35 times that (about 2.4 m): oversized on
  purpose so it survives a 96 px thumbnail. Do not exceed 1.5 times.
- A building fills 35 to 45 percent of the deck footprint. The rest is
  circulation, planting and props. Negative space is a material.
- Chunky masses are the enemy. If a form is wider than it is tall and has no
  step, chamfer, recess or opening, it needs one.

## Bevels

- Every hard edge is bevelled. There are no razor edges anywhere.
- Widths by object size: plinth 0.06 to 0.07, deck and ledge 0.04 to 0.06,
  architecture 0.03, furniture and trim 0.015 to 0.025, tiny props 0.01.
- Two to three segments, angle-limited at 35 degrees, so flat faces stay flat
  and only the edge catches a highlight. Bevels are baked before GLB export.
- Flat faces are flat-shaded, curved parts are smooth. Never gradient-shade a
  box.

## Detail density

- Three scales of read: the silhouette (one glance), the massing (two seconds)
  and the props (linger). Each must be complete on its own.
- Every 3 m of wall carries something: a window bay, a pilaster, a canopy, a
  planter. A blank wall wider than 4 m is a defect.
- Roofs are usable places, not lids: track, equipment, planting, lamps.
- Details are real geometry, at most 0.02 m proud. No decals, no textures.
- Budget: 55k triangles, about 60 draw calls, at most 24 materials per
  diorama. See the asset report.

## Materials

Principled BSDF only, constant colours, no image textures. Roughness is chosen
per material role and carries the whole surface story.

| Role | Roughness | Notes |
| --- | --- | --- |
| Painted architecture | 0.50 to 0.55 | faint coat (0.10 to 0.15, rough 0.3 to 0.4) |
| Plinth | 0.60 to 0.65 | coat 0.12 on the light plinth |
| Track and composite | 0.50 to 0.72 | matte, never shiny |
| Ground and concrete | 0.78 to 0.85 | |
| Glass | 0.08 | coat 0.6, spec 0.8; reflects, never transmits |
| Metal | 0.32 to 0.40 | metallic 0.9 to 1.0 |
| Wood | 0.60 | |
| Foliage and grass | 0.70 to 0.85 | grass carries 0.3 sheen |

- Large planes carry a very narrow procedural roughness variation (about
  plus or minus 0.05) so they do not read as flat plastic. It lives in a node
  called `MC_RoughVar` and is stripped on export, so shipped materials are
  plain constants.
- No grunge, dirt, scratches or noise in colour. This is clean by design.
- Glass windows are dark reflective panes. A small share of panes are warm
  lit panes (`MC_GLASS_LIT`) for life. Never more than a quarter.

## Colour

- Warm neutral base (cream, paver, plinth) with one identity hue and a small
  set of supporting hues. The golden diorama uses blue as identity, terracotta track, green.
- Saturation is moderate: roughly 30 to 55 percent for architecture, up to
  70 percent for one accent per view. Pastel is the ceiling, not the target.
- Identity never uses a status colour (see the app's tint and signal rule).
  Status colour lives only in `MC_STATUS_LIGHT`.
- Display transform is AgX, look "AgX - Punchy", exposure +0.45. AgX rolls off
  highlights so pastels stay pastel; Punchy restores the contrast AgX loses.

## Status lights

- One shared emission material, `MC_STATUS_LIGHT`, drives every status mesh:
  the platform rim, the beacon and each worker's helmet band. Change the state
  by changing the material; the model is never rebuilt.
- Seven states: STABLE, BUILDING, NEEDS_QA, NEEDS_DECISION, BLOCKED, PAUSED,
  RELEASE_READY. Strength is about 1.0 to 1.6. Above that AgX washes the colour
  to white and the state stops being readable.
- Status is never colour alone in the app. The art only has to be lit
  differently per state; the words and shapes are the app's job.
- Status colour is never baked into a texture or vertex colour.

## Lighting

Three area lights on a procedural gradient world, no HDRI, so nothing to
license and nothing to record.

| Light | Position | Size | Power | Colour |
| --- | --- | --- | --- | --- |
| Key | (-10, -20, 25) | 22 m disk | 20 000 W | warm (1.0, 0.93, 0.82) |
| Fill | (26, -6, 12) | 26 m disk | 3 000 W | cool (0.9, 0.87, 1.0) |
| Rim | (-4, 24, 14) | 14 m disk | 1 100 W | cool (0.92, 0.95, 1.0) |

- Key to fill is about 6.5:1 by power, but the fill is closer and larger, so
  shaded faces read at about 1:2.5 in value. Shadows are never black.
- Rim only peels the silhouette off the backdrop. If you can see it as a light,
  it is too strong.
- World strength 0.7, warm low, cool high. It supplies the bounce.

## Shadow softness and GI

- Shadows are wide-penumbra because the key is 22 m across: contact shadows
  are crisp, cast shadows soften with distance.
- Final renders are Cycles with real GI: 8 total bounces, 4 diffuse. The soft
  colour bleed on the plinth and under overhangs is the cinematic quality.
- The draft (EEVEE) renders form and value truthfully but has no real GI or
  contact shadows. Judge composition on it, never lighting.
- Indirect clamp at 8 removes fireflies at the source.

## Workers and props

- Workers are one shared rig: 11 bones, skinned by bone-named groups, clips
  `MC_IDLE` and `MC_WORKING` (48 frames). About 2.5k triangles each. Scale is
  baked into geometry and bones so nothing needs an object scale.
- Vest takes a hue, helmet band takes status. Pose is data (`worker_pose`),
  never colour.
- No faces. A worker is a silhouette with a tilt of the head and a prop.
- Props are chunky, simple and consistent with the bevel language: benches,
  lamps, cones, boxes, planters, a fountain. Repeats are fine; the same prop
  twice in one view is not, unless it is a row.
- Props never carry text, logos or brand marks.

## Composition

- One subject, one hero mass, two supporting masses, and open floor. The eye
  goes hero, then a worker, then the props.
- The tallest element sits behind and left of centre so the key shadow falls
  toward the viewer and across open ground.
- Keep the view's visual centre of mass close to the plinth's centre.
- Diagonals lead toward the hero: paths, tracks and rows of hurdles.

## Render treatment

- **Draft:** EEVEE, 48 samples, about 900 px, six seconds. For composition.
- **Final:** Cycles on GPU, OpenImageDenoise, adaptive sampling at 0.01,
  clamp 8, 1800 px square. The lowest clean count is 64 samples (about 21 s
  on the reference machine); hero stills use 128 (about 32 s). 32 shows soft
  edges; 256 shows no visible gain over 128.
- **Transparent:** the studio floor becomes a shadow catcher so contact and
  cast shadows survive in alpha. The preview of that file shows black behind
  the object because the shadow is semi-transparent black; it composites
  correctly over any light background.
- Output is 8-bit PNG, sRGB, AgX baked in. No post grade, no vignette, no
  bloom, no depth-of-field. The lighting is the finish.

## Export

- GLB is Y-up, metres, applied transforms, no cameras, no lights, no images.
- Modifiers are baked on static meshes and joined per material. Status meshes
  and skinned workers stay separate. No unused data.
- Animation ships as two named clips, `MC_IDLE` and `MC_WORKING`.
- Ambient occlusion baking was evaluated and rejected for now. Cycles GI is
  already the visual finish for stills, and in the app a bake needs a vertex
  colour or texture path in three.js that the world does not have today, plus
  extra vertex data on every draw. Revisit only if the app adds that path;
  even then, never bake a status colour.

## Review loop

Blockout, draft, inspect twelve things (silhouette, proportion, bevel, density,
material, colour, light, shadow, status, workers, composition, negative space),
compare to the references, name the five largest gaps, fix them, render. At
least three passes before a final. The honest verdict is written down, not
assumed.

## Known limits of the golden diorama

- Less dense and less saturated than the densest references, which are
  interiors with dozens of small props.
- The progression podium is still chunky.
- Status colours are quiet by design at the thumbnail size.
- Worker bone rotation signs were judged from small renders, not a rotoscope.
