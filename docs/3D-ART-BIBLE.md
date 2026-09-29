# 3D art bible

The rules every Mission Control diorama obeys. The target is a premium stylized
architectural miniature under professional product-visualization light: a
small, physically present object you want to pick up. It is not low-poly,
voxel, flat, toy-like or photoreal.

`references/3d-style/` holds art direction only and is not tracked. Nothing is
copied from it: no shapes, layouts, colours or text. Only qualities are taken:
one clear light direction, soft bevels, clean but differentiated materials,
gentle bounce light, one clear subject.

Everything below is enforced by `art/blender/`, not remembered. A rule that is
only in this file will drift; change the script and the number here together.

## Camera

- Three-quarter isometric: azimuth 45 degrees, elevation 35 degrees, camera at
  +x, -y. The left face (-y) is key-lit, the right face (+x) is the shadow face.
- Baseline is **orthographic**, scale 25.5, target (0, 0, 2.6). Parallel lines
  stay parallel, which is what the app's flat and 3D fields both assume.
- Variant `MC_Cam_LongLens`: 135 mm on a 36 mm sensor, distance solved to match
  the orthographic framing. Use it for hero stills; the difference is a barely
  visible convergence and a slightly softer foreground.
- Never a wide lens. Never a dutch angle. The camera never turns per project.
- Frame the platform at 85 to 90 percent of the width. Leave the top third of
  the frame quiet: that is where a title or a status chip lands.

## Platform

- One plinth per project, identical for all: a dark lacquered base slab, the
  accent band, a light ledge, the paver deck and the status rim. Deck is 15.4
  wide and its top is at z = 1.0.
- The dark base is the darkest value in the frame. It anchors the object to the
  floor and makes everything above it read lighter.
- Corner radius shrinks with each layer (1.6, 1.5, 1.4, 1.0) so the stack reads
  as turned or milled, never as a stack of boxes.
- The accent band takes the project's identity colour. The status rim is a
  separate mesh that takes the status colour and nothing else.
- Deck paver gets a 1.5 to 2 m joint grid. It gives scale and stops the deck
  reading as one grey plane.

## Scale and proportions

- One unit is one metre of miniature. A storey is 2.2, a door 1.7, a step 0.11,
  a handrail 0.9, a balcony rail 0.5.
- The worker is built at 1.14 and placed at 1.4 times that, so it stands about
  1.6 tall: a person, slightly heroic, never taller than a door. Readability
  comes from colour blocking and pose, not from size.
- A building fills 35 to 45 percent of the deck footprint. The rest is
  circulation, planting and props. Negative space is a material.
- Chunky masses are the enemy. If a form is wider than it is tall and has no
  step, chamfer, recess or opening, it needs one. A stack of plain boxes is
  never a hero object.

## Bevels

- Every hard edge is bevelled. There are no razor edges anywhere.
- Widths by object size: plinth 0.06 to 0.07, deck and ledge 0.04 to 0.06,
  architecture 0.03, furniture and trim 0.015 to 0.025, tiny props 0.01.
  Members under 0.05 thick (rails, braces, ladder rungs) are left square: a
  bevel there costs triangles and cannot be seen.
- Two to three segments, angle-limited at 35 degrees, so flat faces stay flat
  and only the edge catches a highlight. Bevels are baked before GLB export.
- Flat faces are flat-shaded, curved parts are smooth. Never gradient-shade a
  box.

## Detail density

- Three scales of read: the silhouette (one glance), the massing (two seconds)
  and the construction and props (linger). Each must be complete on its own.
- **Detail explains scale or construction, never itself.** The second layer is
  what a real building needs: a dark base course, window recesses with frames
  and sills, entrance steps and handrails where a door sits above grade,
  downpipes with shoes and brackets, cornices and parapets, louvres, service
  panels, kerbs around every surface change, drains, tree pits.
- Every 3 m of wall carries something: a window bay, a pilaster, a canopy, a
  downpipe, a planter. A blank wall wider than 4 m is a defect.
- Roofs are usable places, not lids: track, equipment, access, a person working.
- Details are real geometry. No decals, no textures.
- Budget: about 70k triangles, about 70 draw calls, at most 25 materials per
  diorama. See the asset report.

## Materials

Principled BSDF only, constant colours, no image textures. Every role responds
to light differently. The difference is roughness, specular and coat, never a
visible texture.

| Role | Roughness | Response |
| --- | --- | --- |
| Architectural paint | 0.40 to 0.48 | semi-gloss enamel, coat 0.2 to 0.3 so every bevel catches |
| Plinth | 0.42 to 0.50 | lacquer, coat 0.35 to 0.4 |
| Concrete, pavers | 0.86 to 0.90 | dry mineral, specular 0.3 to 0.35 |
| Track rubber | 0.92 | dead matte, specular 0.2, dusty sheen 0.35 |
| Moulded plastic | 0.28 | glossy, coat 0.4, a tight highlight |
| Wood | 0.50 | oiled and varnished, coat 0.35 |
| Metal | 0.24 | metallic 1.0, brushed aluminium |
| Powder-coated steel | 0.38 | metallic 0.35, coat 0.35 |
| Glass | 0.04 | a dark mirror: base near-black blue, coat 1.0, IOR 1.52 |
| Foliage | 0.60 | sheen 0.4, a little subsurface, two greens per canopy |
| Grass | 0.95 | velvet sheen 0.7 |
| Emissive fixtures | n/a | warm amber interiors and lamps, strength 2.6 |

- Large planes carry a very narrow procedural roughness variation (about
  plus or minus 0.05) so they do not read as flat plastic. It lives in a node
  called `MC_RoughVar` and is stripped on export, so shipped materials are
  plain constants.
- No grunge, dirt, scratches or noise in colour. This is clean by design.
- Glass is dark so it reads as glass against light walls. A share of panes are
  lit amber interiors for life, never more than a quarter.

## Colour and value

- A deliberate value ladder, measured on the final render (display luminance,
  0 to 1): lit hero wall 0.76, deck 0.70, backdrop 0.61, shadow face 0.37,
  plinth base about 0.1. The hero is the brightest large surface; the dark base
  is the darkest.
- Warm neutral base with one identity hue and a small set of supporting hues.
  The golden diorama: blue identity, terracotta rubber, two greens, amber glow,
  graphite for the anchors (plinth base, base courses, work clothes).
- Richness comes from value and material difference, never from raising
  saturation. Architecture stays at 30 to 55 percent saturation; one accent
  per view may reach 70.
- Identity never uses a status colour (see the app's tint and signal rule).
  Status colour lives only in `MC_STATUS_LIGHT`.
- Display transform is AgX, look "AgX - Medium High Contrast", exposure 0.
  The contrast comes from the light, so the look does not have to add it.

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

A warm sun key, a cool sky, a restrained fill and rim. No HDRI, so nothing to
license and nothing to record. The viewer must know at once where the light
comes from.

| Light | Direction or position | Size | Power | Colour |
| --- | --- | --- | --- | --- |
| Key (sun) | azimuth -140, elevation 34 | 7 degree disc | 5.0 | warm (1.0, 0.9, 0.78) |
| Backdrop key (sun) | same as key | 24 degree disc | 5.0 | same as key |
| Fill (area) | (26, -6, 12) | 30 m disk | 320 W | cool (0.8, 0.86, 1.0) |
| Rim (area) | (-6, 26, 18) | 12 m disk | 2 600 W | cool (0.95, 0.96, 1.0) |
| World | gradient | | 0.32 | warm-grey low, sky blue high |

- The key comes from camera-left and a little in front, so the -y faces are lit,
  the +x faces are in shadow, and cast shadows run across the ground toward
  screen-right where the camera can see them.
- Measured on the same material: lit face to shadow face is about 2:1 in
  display value, about 4:1 in linear light. Shadows keep colour; they are never
  black.
- Warm key, cool sky: the lit faces are warm and the shadows are cool. That
  relationship is most of the cinematic quality.
- **Light linking.** The crisp key does not light the backdrop floor; its twin
  with a wide disc lights only the floor. The plinth keeps a grounded shadow,
  while the long shadows of tall parts melt into soft shade instead of
  printing hard shapes across the background.
- Rim only peels roof edges and trees off the backdrop. If you can see it as a
  light, it is too strong.
- The backdrop falls off from a warm mid-grey to a darker edge, darker than
  the deck, so the object separates by value, not by an outline.

## Shadow softness and GI

- The 7 degree sun gives crisp contact shadows under every bench, cone and
  worker, and soft edges on long cast shadows.
- Final renders are Cycles with real GI: 8 total bounces, 4 diffuse. The warm
  bounce into shadowed recesses and under canopies is part of the finish.
- The draft (EEVEE) renders form and value truthfully but not GI. Judge
  composition on it, never lighting.
- Indirect clamp at 8 removes fireflies at the source.
- Nothing floats. Feet, props and bases meet their surface within about a
  centimetre, measured as the lowest evaluated vertex against the surface
  height, not eyeballed. A mid-stride runner is lowered onto the leading foot.

## Workers

- One shared rig: 11 bones, skinned by bone-named groups, about 2.6k
  triangles. Scale is baked into geometry and bones so nothing needs an object
  scale.
- Five clips on every rig, 48 frames each: `MC_IDLE`, `MC_WORKING` (clipboard),
  `MC_ACTIVE` (run cycle), `MC_SIGNAL` (arm raised toward the beacon) and
  `MC_REPAIR` (bent over a job). A worker changes what it is doing without a
  new model.
- Rotation directions on this rig are measured, and written in `mc_worker.py`:
  +X tilts an upward bone back, and swings a downward bone forward. Every pose
  is checked at 100 percent from the camera, not assumed from the numbers.
- Outfits are colour blocking that survives a thumbnail: a white helmet, a
  saturated mid body, dark legs. Crew wear the identity blue with a white vest
  stripe; technicians wear graphite; the training kit is white and blue.
- Every scene needs at least one worker doing each of: training, maintaining
  and signalling state. A worker is placed where the work is: at the start
  gate, on the track, at the tower, at the plant.
- A raised arm is raised to the side, so it clears the head from this camera.
- No faces beyond two eye dots. A worker is a silhouette, a pose and a prop.

## Life and props

- Every prop implies that people use the place: an equipment cart, a water
  cooler with cups and a bin, cones in a drill pattern, an agility ladder,
  plyo boxes with rubber tops, a toolbox beside an open service panel, a
  timing gate at the finish.
- Props are grouped where the activity is, not scattered to fill space. Cones
  make a slalom or mark a line; they are never random.
- Signage is geometry only: a blank panel, a band, a few bars. Never words,
  logos or brand marks.
- Trees are several clumps in two greens on a tapered trunk, and in paving
  they stand in a tree pit. Planting in beds is clipped and edged. A single
  sphere on a stick is a primitive, not a tree.

## Composition

- One hero mass, two supporting masses, and open floor. The eye goes hero
  building, then the training ground, then the workers, then the secondary
  props.
- A secondary hero (here, the timing tower) is slender. It marks a place with
  its silhouette and never competes with the hero's mass.
- The tallest element sits behind and left of centre so the key shadow falls
  across open ground.
- Negative space is kept on purpose: a band of quiet paving around the edge,
  and clear lanes between activity zones.
- Diagonals lead toward the hero: tracks, lanes, rows of hurdles.

## Render treatment

- **Draft:** EEVEE, 48 samples, 1200 px, about 8 s. For composition.
- **Final:** Cycles on GPU, OpenImageDenoise, adaptive sampling at 0.01,
  clamp 8, 1800 px square. The lowest clean count is 64 samples (about 21 s
  on the reference machine); hero stills use 128 (about 28 s).
- **Transparent:** the studio floor becomes a shadow catcher so contact and
  cast shadows survive in alpha. The preview of that file shows black behind
  the object because the shadow is semi-transparent black; it composites
  correctly over any light background.
- Output is 8-bit PNG, sRGB, AgX baked in, with no metadata stamp (it would
  embed a local path). No post grade, no vignette, no bloom, no depth of field.
  The lighting is the finish.

## Export

- GLB is Y-up, metres, applied transforms, no cameras, no lights, no images.
- Modifiers are baked on static meshes and joined per material. Status meshes
  and skinned workers stay separate. No unused data.
- Animation ships as five named clips, one per pose, built from each rig's
  recorded clip list.
- Ambient occlusion baking was evaluated and rejected for now. Cycles GI is
  the visual finish for stills, and in the app a bake needs a vertex colour or
  texture path in three.js that the world does not have today, plus extra
  vertex data on every draw. Revisit only if the app adds that path; even
  then, never bake a status colour.
- glTF has no sheen weight: Blender's exporter writes the sheen tint as the
  sheen colour and drops the weight, so rubber and grass would arrive at full
  sheen and turn milky. The export folds the weight into the tint
  (`fold_sheen_weight`, on the export copy only).
- Studio lighting (sun, light linking, sky) does not travel in the GLB. The
  app recreates it in `LIGHT` (`field/world.js`): the same warm key, cool
  sky and face split, aimed for the app's camera rather than copied from
  Blender's angles. See ARCHITECTURE.md.

## Review loop

Render, compare to the references, name the five most obvious quality gaps,
fix them, render again. At least three passes. Inspect at 100 percent crops
and at thumbnail size, measure what can be measured (value ladder, contact
gaps, triangle and draw-call cost), and write the honest verdict down.

## Known limits of the golden diorama

- Less dense than the densest references, which carry dozens of small props
  and vehicles per block.
- Glass reflects a plain sky, so it reads as dark glass rather than showing
  reflections.
- Surfaces are clean constants; the references carry slightly more colour
  variation within a material.
- The hall's middle string course reads as a plain shelf.
