/* =========================================================
   THE WORLD, WITHOUT A GPU
   ---------------------------------------------------------
   Everything about Mission Control's 3D field that is decided
   rather than drawn: where each project's district stands on
   the island, how the camera frames it, when a touch is a tap
   or a pan and which district it lands on, how each crew state
   poses, what each place is made of and what it does while
   someone watches, and which labels can be read. No Three.js
   and no DOM, so the contracts import this file and test it in
   Node; render3d.js only turns it into pixels.

   Frames, all in world units:
   - WORLD: x across, z toward the viewer, y up. The island's
     grass is y = 0. The camera looks at a point on it from a
     fixed yaw and pitch through a perspective lens, so near
     places are larger than far ones: one world with depth.
   - DISTRICT: each project's street-aligned block frame. The camera's
     yaw shows the buildings' front and side. Its local x runs to the lower
     right and z to the lower left; +x and +z faces are the ones
     seen. Recipes are written in it and drawn TILE.content times
     their written size.
   - FRAME: the camera, { x, z, d }: the ground point it looks at
     and its distance from it. Transient: never stored.
   ========================================================= */

export const WORLD = {
  fov: 30,                       // the lens, vertical, in degrees: gentle perspective, no fisheye
  pitch: 0.7,                    // 40 degrees down: a little more facade, as the Blender camera's 35
  yaw: 0.22,                     // turned about 13 degrees: the only turn at which a phone shows every district (see LIGHT)
  tileTurn: 0,                    // blocks align with the shared street grid
  stepX: 14.8,                     // world units between district centres across
  stepZ: 15.0,                     // and from row to row: a little more, for a cross street or the canal
  islandDepth: 1.05,              // rounded city-diorama slab below the streets
  minDist: 14, maxDist: 900,     // the closest and farthest the camera goes
  focusFill: 0.9,                // a focused district fills this share of the view
  minDistrictPx: 68,             // geometry only: measured labels keep their CSS type size; a larger island pans
  labelPx: 36,                   // a label's room in front of its district, in px, until the labels are measured
  edgePx: 12,                    // breathing room at the viewport's edges, in px
  /* Every camera move is one flight (planFlight): longer for a longer way,
     leaving at the speed the camera already has, a little rise on a long
     hop, at rest on arrival. Instant under Reduce Motion. */
  flight: { minMs: 300, perView: 230, maxMs: 820, arc: 0.16, start: 0.9 },
  /* A horizontal drag in focus goes to the next or previous place
     (swipeVerdict): it must begin clearly sideways (axis), then travel far
     enough (minPx, or a share of the view) or be flicked (flickPxMs over at
     least flickMinPx). Speed is read over the last trailMs of movement, and
     a finger that rested restMs before lifting has none. With nowhere to go
     the world gives at most `edge` of the view and comes back. */
  swipe: { axis: 1.3, minPx: 48, share: 0.2, flickPxMs: 0.35, flickMinPx: 24, trailMs: 100, restMs: 60, edge: 0.12 },
  /* Any other drag pans (panStart): the ground under the finger stays under
     it while the camera is where it may rest, and past that the city gives,
     `give` of the finger at first and less and less, at most `reach` of the
     view's shorter side (minPx..maxPx). Where the whole city is in view, and
     in focus, the camera rests on one frame, so a drag only gives. A flick
     carries a pan on for glideMs of its speed, never past where it may
     rest; let go, it settles there, leaving at `settle` at least. */
  pan: { give: 0.5, reach: 0.14, minPx: 28, maxPx: 96, glideMs: 160, settle: 1.6 },
  labelEase: 0.12,               // seconds: a label easing between on its place and in front of it
  slopPx: 8,                     // movement that turns a touch into a pan
  frameMinMs: 15,                // at most about 60 frames a second, even on a 120 Hz screen
  ambientSeconds: 300,           // life settles after five minutes untouched, until someone touches it again
  maxPixelRatio: 2, minPixelRatio: 1, maxCanvasPixels: 2500000,
  slowFrameMs: 21,               // frames slower than this, for a second, may lower the drawing resolution a step,
  costShare: 0.6                 // but only when a frame's own cost fills this share of the gap between frames
};

/* Budgets reported by render3d.js and checked in the browser QA: at
   overview, with the six registered projects, a frame without the shadow
   pass. Measured (0.8.0): two authored places 133 calls and 180k triangles,
   all six authored 135 and 309k. An authored place is about 20 calls and
   replaces its recipe, so calls stay nearly flat; triangles are six districts
   at their own budget (DISTRICT_BUDGET) plus the streets. */
export const BUDGET = { drawCalls: 200, triangles: 500000, threeGzipBytes: 190000 };

/* What one authored district may cost, from what Mission Control needs: six
   of them at the overview inside the world's budget, a phone downloading
   each over a mobile connection, and a crew that still reads. Checked
   against every exported file (contract 30) and by the export itself
   (art/blender/scripts/export_glb.py holds the same numbers). */
export const DISTRICT_BUDGET = { triangles: 80000, drawCalls: 24, materials: 16, workers: 8, bytes: 2000000, textures: 0 };

/* A district: its pad (a square of half side `pad` in its own frame, so a
   diamond on the island), the scale its recipe is drawn at, and its crew. */
export const TILE = { pad: 5.2, padH: 0.22, content: 1.45, crew: 1.05, reach: 3.35 };
const R2 = Math.SQRT2, EXTENT = TILE.pad * (Math.abs(Math.cos(WORLD.tileTurn)) + Math.abs(Math.sin(WORLD.tileTurn)));          // a pad's half diagonal on the island

/* ---------- the camera, as arithmetic ----------
   The yaw and pitch never change, so the camera's axes are constants. */
const SP = Math.sin(WORLD.pitch), CP = Math.cos(WORLD.pitch), SY = Math.sin(WORLD.yaw), CY = Math.cos(WORLD.yaw);
const TAN = Math.tan(WORLD.fov * Math.PI / 360);
const FWD = [-CP * SY, -SP, -CP * CY];                                  // where the camera looks
const RIGHT = [CY, 0, -SY];                                             // the screen's right, on the ground
const UP = [RIGHT[1] * FWD[2] - RIGHT[2] * FWD[1], RIGHT[2] * FWD[0] - RIGHT[0] * FWD[2], RIGHT[0] * FWD[1] - RIGHT[1] * FWD[0]];
const TOWARD = [SY, 0, CY];                                             // toward the viewer, on the ground
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* Where the camera stands for a frame. */
export function eyeOf(f){ return [f.x - FWD[0] * f.d, -FWD[1] * f.d, f.z - FWD[2] * f.d]; }

/* A world point to px in a W x H view; depth is along the camera's axis. */
export function project(p, f, W, H){
  const e = eyeOf(f), v = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
  const z = dot(v, FWD), k = H / (2 * Math.max(z, 1e-6) * TAN);
  return { x: W / 2 + dot(v, RIGHT) * k, y: H / 2 - dot(v, UP) * k, depth: z };
}

/* px per world unit at the frame's target: how large the world is drawn there. */
export function pxPerUnit(f, H){ return H / (2 * f.d * TAN); }

/* ---------- the island and its districts ---------- */

/* The city between the places (cityPlan): its levels and measures, in world
   units. The road is the island's surface; every block, lane and promenade
   is paving one curb above it; the canal runs below. An authored place is
   built on the Blender master's platform (art/blender/scripts/mc_platform.py),
   whose dark lower plinth is 0.42 of its 16.9 width: sunk below the paving,
   the place stands in its block as a raised terrace rather than on a
   display stand, its identity band a coloured course at the paving and its
   lit status rim the block's inner edge. Placement only: the file is drawn
   as Blender made it. */
export const CITY = {
  walk: 0.16,                    // paving over the road: one curb
  water: -0.34,                  // the canal's surface
  canalWidth: 2.4,               // the water, in place of the cross street between its two rows
  plinth: 5.0,                   // an authored place's half width (ASSETS span / 2)
  side: 0.7,                     // a block's sidewalk round its place
  ring: 2.4,                     // the ring road round the city: a lane for the trucks, a curb to park at
  shore: 1.0,                    // the promenade along the island's edge
  corner: 5.0,                   // the island's corners, in plan: the ring road turns inside them
  sink: 0.42 / 16.9              // the platform's dark lower plinth, over its width: below the paving
};

/* Which gap between rows is water rather than a cross street: the one
   nearest the middle (of two, the nearer the viewer), so one canal parts
   the city once, whatever its size. -1 for a single row. */
export function canalAfter(rows){ return rows >= 2 ? Math.floor((rows - 1) / 2) : -1; }

/* District centres in registry order, a grid with a short last row centred.
   Row 0 is farthest from the viewer, so reading order runs back to front,
   left to right. The city between them (cityPlan) is what keeps it from
   reading as a grid. Adding a project adds a district, never a special case. */
export function layoutDistricts(count, cols){
  const n = Math.max(0, count | 0);
  const c = Math.max(1, Math.min(cols | 0 || 1, Math.max(1, n)));
  const rows = Math.ceil(n / c);
  const out = [];
  for(let i = 0; i < n; i++){
    const r = Math.floor(i / c), inRow = Math.min(c, n - r * c);
    const pos = (i % c) + (c - inRow) / 2;
    out.push({ x: (pos - (c - 1) / 2) * WORLD.stepX, z: (r - (rows - 1) / 2) * WORLD.stepZ, row: r, col: pos });
  }
  return { cols: c, rows: rows, districts: out };
}

/* The rectangle the island covers, and the one the camera may look at: the
   outer places, their sidewalks, the ring road and the promenade. */
const SHORE = CITY.plinth + CITY.side + CITY.ring + CITY.shore;
export function islandOf(districts){
  if(!districts.length) return { minX: -SHORE, maxX: SHORE, minZ: -SHORE, maxZ: SHORE, cx: 0, cz: 0, a: SHORE, b: SHORE, r: CITY.corner,
                                 reach: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  districts.forEach(d => { minX = Math.min(minX, d.x); maxX = Math.max(maxX, d.x); minZ = Math.min(minZ, d.z); maxZ = Math.max(maxZ, d.z); });
  const m = SHORE;
  return { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
           a: (maxX - minX) / 2 + m, b: (maxZ - minZ) / 2 + m, r: CITY.corner, reach: { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ } };
}

/* The island's shore: a rectangle with rounded corners, as points around
   it, `segments` in all. `inset` pulls it in: the promenade's inner edge,
   the ring road's lanes. */
export function islandOutline(island, segments, inset){
  const k = inset || 0, a = island.a - k, b = island.b - k, r = Math.max(0.2, Math.min(island.r - k, a, b));
  const per = Math.max(2, Math.round((segments || 72) / 4)), pts = [];
  [[1, 1], [-1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], q) => {
    const ox = island.cx + sx * (a - r), oz = island.cz + sz * (b - r);
    for(let i = 0; i < per; i++){
      const t = (q + i / (per - 1)) * Math.PI / 2;
      pts.push([ox + r * Math.cos(t), oz + r * Math.sin(t)]);
    }
  });
  return pts;
}
export function onIsland(island, x, z, inset){
  const k = inset || 0, a = island.a - k, b = island.b - k;
  if(!(a > 0 && b > 0)) return false;
  const r = Math.max(0, Math.min(island.r - k, a, b)), dx = Math.abs(x - island.cx), dz = Math.abs(z - island.cz);
  if(dx > a || dz > b) return false;
  const ex = dx - (a - r), ez = dz - (b - r);
  return ex <= 0 || ez <= 0 || ex * ex + ez * ez <= r * r;
}
/* How far the (inset) shore reaches either side of the island's middle at
   a depth z, or null beyond it: the road level is laid in strips from it. */
export function shoreHalfWidth(island, z, inset){
  const k = inset || 0, a = island.a - k, b = island.b - k, r = Math.max(0, Math.min(island.r - k, a, b));
  const dz = Math.abs(z - island.cz);
  if(dz > b + 1e-9) return null;
  const ez = dz - (b - r);
  return ez <= 0 ? a : (a - r) + Math.sqrt(Math.max(0, r * r - ez * ez));
}

/* Inside a district's pad: its diamond on the island. */
export function onPad(d, x, z, grow){ return Math.abs(x - d.x) <= TILE.pad + (grow || 0) && Math.abs(z - d.z) <= TILE.pad + (grow || 0); }

const LABEL_GAP = 4;              // px between a place's front edge and the card in front of it

/* The points that frame a district: its pad at the road, a narrower top at
   its tallest and, given the label's room in px ({ w, h }), the label in
   front of it, where the place in focus shows its card. Without a room
   the label is on the place itself, inside what already frames it. */
export function districtPoints(d, height, room){
  const e = TILE.pad, t = e * 0.66, h = height;
  const pts = [[d.x + e, 0, d.z+e], [d.x - e, 0, d.z+e], [d.x+e, 0, d.z-e], [d.x-e, 0, d.z-e],
               [d.x+t, h, d.z+t], [d.x-t, h, d.z+t], [d.x+t, h, d.z-t], [d.x-t, h, d.z-t]].map(p => ({ p: p }));
  if(room) pts.push({ p: labelAnchor(d), w: room.w / 2, down: room.h + LABEL_GAP });
  return pts;
}
/* A label's anchor: the middle of its place's front edge, at the paving. */
export function labelAnchor(d){ return [d.x, CITY.walk, d.z + CITY.plinth]; }

function spanPx(points, f, W, H){
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for(const q of points){
    const s = project(q.p, f, W, H);
    if(!(s.depth > 0.5)) return null;
    minX = Math.min(minX, s.x - (q.w || 0)); maxX = Math.max(maxX, s.x + (q.w || 0));
    minY = Math.min(minY, s.y - (q.up || 0)); maxY = Math.max(maxY, s.y + (q.down || 0));
  }
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}

/* Shift a frame so a px offset on screen moves under it: dx to the right,
   dy down, measured at the target's depth. */
function shiftPx(f, dx, dy, H){
  const k = pxPerUnit(f, H), gx = dx / k, gz = dy / (k * SP);
  return { x: f.x + RIGHT[0] * gx + TOWARD[0] * gz, z: f.z + RIGHT[2] * gx + TOWARD[2] * gz, d: f.d };
}

/* The closest frame at which every point, with the px each needs around it,
   fits the view with its edges, centred. Distance by bisection, then the
   target moved to centre what is seen; a few rounds settle both. */
export function fitFrame(points, W, H, fill){
  const k = fill || 1, availW = (W - WORLD.edgePx * 2) * k, availH = (H - WORLD.edgePx * 2) * k;
  let x = 0, z = 0, n = 0;
  points.forEach(q => { if(!q.w && !q.up && !q.down){ x += q.p[0]; z += q.p[2]; n++; } });
  let f = { x: n ? x / n : 0, z: n ? z / n : 0, d: WORLD.maxDist };
  for(let round = 0; round < 5; round++){
    let lo = WORLD.minDist, hi = WORLD.maxDist;
    for(let i = 0; i < 32; i++){
      const mid = Math.sqrt(lo * hi), b = spanPx(points, { x: f.x, z: f.z, d: mid }, W, H);
      if(b && b.maxX - b.minX <= availW && b.maxY - b.minY <= availH) hi = mid; else lo = mid;
    }
    f.d = hi;
    const b = spanPx(points, f, W, H);
    if(!b) break;
    f = shiftPx(f, (b.minX + b.maxX) / 2 - W / 2, (b.minY + b.maxY) / 2 - H / 2, H);
  }
  return f;
}

/* How wide a district is drawn from this frame, in px. */
export function districtPx(d, f, W, H){
  const a = project([d.x - EXTENT, 0, d.z], f, W, H), b = project([d.x + EXTENT, 0, d.z], f, W, H);
  return Math.abs(b.x - a.x);
}

/* The districts whose centres are drawn inside the view, in front of the
   camera: the ones a person can see from this frame. */
export function districtsInView(districts, f, W, H){
  return districts.filter(d => {
    const s = project([d.x, 0, d.z], f, W, H);
    return s.depth > 0.5 && s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= H;
  });
}

/* Which arrangement suits this view. One that shows every district beats
   one that pans; among those, whichever draws its smallest district
   largest, and among those that pan, whichever shows the most. A near tie
   goes to fewer columns, which keeps reading order simple. `heights` are
   per district (placeHeight). At the overview a label stands on its own
   place (labelSpot), inside what already frames it. */
export function chooseLayout(count, W, H, heights){
  const n = Math.max(1, count | 0);
  let best = null;
  for(let c = 1; c <= Math.min(n, 8); c++){
    const lay = layoutDistricts(n, c), o = overview(lay.districts, heights, W, H);
    const seen = districtsInView(lay.districts, o.frame, W, H);
    const size = seen.length ? Math.min.apply(null, seen.map(d => districtPx(d, o.frame, W, H))) : 0;
    const pick = { cols: c, size: size, shown: seen.length, fits: o.fits, districts: lay.districts, frame: o.frame };
    if(!best || (pick.fits && !best.fits) ||
       (pick.fits === best.fits && (pick.fits ? size > best.size * 1.04 : pick.shown > best.shown))) best = pick;
  }
  return best;
}

/* The overview: every district and its label in view, as large as fits.
   A registry too large to show at WORLD.minDistrictPx starts at the first
   district, where reading begins, at the size it can be read, and the
   island pans. Row 0 is the farthest back, so every district in front of
   the first is drawn larger than it. */
function overview(districts, heights, W, H){
  const pts = [], island = islandOf(districts);
  districts.forEach((d, i) => pts.push.apply(pts, districtPoints(d, at(heights, i, 3), null)));
  islandOutline(island, 32, 0).forEach(([x,z]) => pts.push({ p:[x,-WORLD.islandDepth,z] }));
  const fit = clampFrame(fitFrame(pts, W, H, 1), island);
  const small = districts.length ? Math.min.apply(null, districts.map(d => districtPx(d, fit, W, H))) : Infinity;
  if(small >= WORLD.minDistrictPx) return { frame: fit, fits: true };
  const first = districts[0];
  const place = dist => {
    let g = { x: first.x, z: first.z, d: dist };
    for(let i = 0; i < 3; i++){
      const s = project([first.x, 0, first.z], g, W, H);
      g = clampFrame(shiftPx(g, s.x - (WORLD.edgePx + districtPx(first, g, W, H) / 2 + 8), s.y - H * 0.3, H), island);
    }
    return g;
  };
  /* The camera's slight turn puts some districts in view farther away than
     the first: every one in view must be readable, not just the first. */
  const readable = g => districtsInView(districts, g, W, H).concat([first]).every(d => districtPx(d, g, W, H) >= WORLD.minDistrictPx);
  let lo = WORLD.minDist, hi = Math.max(WORLD.minDist, fit.d);
  for(let i = 0; i < 32; i++){
    const mid = Math.sqrt(lo * hi);
    if(readable(place(mid))) lo = mid; else hi = mid;
  }
  return { frame: place(lo), fits: false };
}

/* A focused district: close enough to fill the view with it and the card in
   front of it (as measured, when it has been), never farther than the
   overview. */
export function focusFrame(d, height, room, overview, W, H){
  const f = fitFrame(districtPoints(d, height, room || { w: 96, h: WORLD.labelPx }), W, H, WORLD.focusFill);
  return { x: f.x, z: f.z, d: Math.max(WORLD.minDist, Math.min(f.d, overview ? overview.d : f.d)) };
}

/* The camera looks only at the island: its target stays within a pad's
   reach of the districts, and its distance in range. */
export function clampFrame(f, island){
  const r = island.reach, m = EXTENT;
  return { x: Math.min(Math.max(f.x, r.minX - m), r.maxX + m), z: Math.min(Math.max(f.z, r.minZ - m), r.maxZ + m),
           d: Math.min(Math.max(f.d, WORLD.minDist), WORLD.maxDist) };
}

/* ---------- panning ----------
   A drag moves the camera over the ground, never turning it and never
   changing its distance. The ground point a finger went down on stays under
   the finger (groundAt, the inverse of project), so the city follows it
   exactly wherever it is held, not only at the middle of the view. Where
   the camera may rest (panRest) is one frame, or, where the city is larger
   than the view, a range over it; beyond that the city gives under the
   finger, less and less, and never far (WORLD.pan). A drag that starts
   beyond it (a flight caught on its way) starts where the camera is:
   nothing jumps, the finger moves it freely between there and where it may
   rest, and only a drag further out is resisted. Let go, a pan settles
   where it may rest (panEnd). Where it may rest is in the city's own axes,
   as clampFrame keeps the camera on the island; how far it gives is
   measured on the screen's (u across, v toward the viewer), so it gives
   the same up and down as across. */
const clampTo = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

/* The ground point (the road's level) a px in the view looks at. */
export function groundAt(f, W, H, px, py){
  const e = eyeOf(f), s = 2 * TAN / H, a = (px - W / 2) * s, b = (H / 2 - py) * s;
  const dir = [FWD[0] + RIGHT[0] * a + UP[0] * b, FWD[1] + UP[1] * b, FWD[2] + RIGHT[2] * a + UP[2] * b];
  const t = -e[1] / Math.min(dir[1], -1e-6);
  return [e[0] + dir[0] * t, 0, e[2] + dir[2] * t];
}
/* Where a pan may rest: exactly `frame`, or, given the island instead,
   anywhere a pad beyond the outer districts, as clampFrame keeps it. */
export function panRest(frame, island){
  if(frame) return { frame: frame, lo: { x: frame.x, z: frame.z }, hi: { x: frame.x, z: frame.z } };
  const r = island.reach, m = EXTENT;
  return { frame: null, lo: { x: r.minX - m, z: r.minZ - m }, hi: { x: r.maxX + m, z: r.maxZ + m } };
}
/* The most the city gives beyond where it may rest, in px. */
export function panGive(W, H){ const P = WORLD.pan; return Math.min(P.maxPx, Math.max(P.minPx, P.reach * Math.min(W, H))); }
const beyond = (over, most) => Math.sign(over) * most * Math.tanh(WORLD.pan.give * Math.abs(over) / most);

/* A pan from frame f toward `rest` (panRest) in a W x H view. */
export function panStart(f, rest, W, H){
  const k = pxPerUnit(f, H), most = panGive(W, H);
  return { d: f.d, W: W, H: H, k: k, mu: most / k, mv: most / (k * SP), rest: rest, x: f.x, z: f.z,
           lo: { x: Math.min(rest.lo.x, f.x), z: Math.min(rest.lo.z, f.z) }, hi: { x: Math.max(rest.hi.x, f.x), z: Math.max(rest.hi.z, f.z) } };
}
/* The finger went from x0, y0 to x1, y1 (px in the view): the frame to
   draw. A finger far outside the view is held half a view beyond it, where
   the ground is still in sight. */
export function panMove(s, x0, y0, x1, y1){
  const f = { x: s.x, z: s.z, d: s.d }, cx = v => clampTo(v, -s.W / 2, s.W * 1.5), cy = v => clampTo(v, -s.H / 2, s.H * 1.5);
  const a = groundAt(f, s.W, s.H, cx(x0), cy(y0)), b = groundAt(f, s.W, s.H, cx(x1), cy(y1));
  s.x += a[0] - b[0]; s.z += a[2] - b[2];
  return panShown(s);
}
/* Where the pan is drawn: its nearest point where it may go, and past that
   what the city gives, on each of the screen's axes. */
export function panShown(s){
  const qx = clampTo(s.x, s.lo.x, s.hi.x), qz = clampTo(s.z, s.lo.z, s.hi.z), ex = s.x - qx, ez = s.z - qz;
  const u = beyond(ex * RIGHT[0] + ez * RIGHT[2], s.mu), v = beyond(ex * TOWARD[0] + ez * TOWARD[2], s.mv);
  return { x: qx + u * RIGHT[0] + v * TOWARD[0], z: qz + u * RIGHT[2] + v * TOWARD[2], d: s.d };
}
/* Let go with the finger moving at vx, vy (px per ms): where the camera
   comes to rest, carried on by a flick unless `still`, and how fast it was
   going ({ x, z, l } per ms, for the flight that takes it there). */
export function panEnd(s, vx, vy, still){
  const r = s.rest, gu = -(vx || 0) / s.k, gv = -(vy || 0) / (s.k * SP);
  const vel = { x: gu * RIGHT[0] + gv * TOWARD[0], z: gu * RIGHT[2] + gv * TOWARD[2], l: 0 };
  if(r.frame) return { frame: r.frame, vel: vel };
  const t = still ? 0 : WORLD.pan.glideMs, at = panShown(s);
  return { frame: { x: clampTo(at.x + vel.x * t, r.lo.x, r.hi.x), z: clampTo(at.z + vel.z * t, r.lo.z, r.hi.z), d: s.d }, vel: vel };
}

/* Bring a district and its label on screen, moving as little as possible;
   one already in view leaves the camera where it is. */
export function revealFrame(f, d, height, room, W, H, island){
  const b = spanPx(districtPoints(d, height, room), f, W, H), m = WORLD.edgePx;
  /* Close in, a district in front can be behind the camera: look at it. */
  if(!b) return clampFrame({ x: d.x, z: d.z, d: f.d }, island);
  let dx = 0, dy = 0;
  if(b.maxX - b.minX > W - 2 * m) dx = (b.minX + b.maxX) / 2 - W / 2;
  else if(b.minX < m) dx = b.minX - m; else if(b.maxX > W - m) dx = b.maxX - (W - m);
  if(b.maxY - b.minY > H - 2 * m) dy = (b.minY + b.maxY) / 2 - H / 2;
  else if(b.minY < m) dy = b.minY - m; else if(b.maxY > H - m) dy = b.maxY - (H - m);
  if(!dx && !dy) return f;
  return clampFrame(shiftPx(f, dx, dy, H), island);
}

/* ---------- which district a tap lands on ----------
   Each district's hull on screen: its pad and a narrower top at its height.
   Where two overlap, the nearer one is the one you see, so it wins. */
function hull(points){
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  p.forEach(q => { while(lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); });
  p.slice().reverse().forEach(q => { while(upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); });
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function insideHull(h, x, y){
  for(let i = 0; i < h.length; i++){
    const a = h[i], b = h[(i + 1) % h.length];
    if((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) < 0) return false;
  }
  return h.length > 2;
}
export function hitDistrict(districts, heights, f, W, H, px, py){
  let best = -1, near = Infinity;
  districts.forEach((d, i) => {
    const pts = districtPoints(d, at(heights, i, 3)).slice(0, 8).map(q => project(q.p, f, W, H));
    if(pts.some(s => !(s.depth > 0.5))) return;
    if(!insideHull(hull(pts), px, py)) return;
    const depth = project([d.x, 0, d.z], f, W, H).depth;
    if(depth < near){ near = depth; best = i; }
  });
  return best;
}

const at = (list, i, dflt) => list && list[i] !== undefined && list[i] !== null ? list[i] : dflt;

/* ---------- flights ----------
   Every move of the camera, overview to focus, place to place, back to the
   overview or back to where a swipe began, is one flight: the target glides
   along the ground and the distance changes in log space, so a flight in
   never lurches. It takes longer for a longer way (measured in views, so
   the same hop takes the same time on every screen), leaves at the speed
   the camera already has along the new way (so a flight that interrupts
   another, or follows a flick, never stops it dead) and at least at a
   brisk start (so a tap answers at once), and comes to rest exactly on its
   frame. A hop of a view or more rises a little in the middle, so the city
   stays in sight on the way. */
export function sameFrame(a, b){
  return !!a && !!b && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.z - b.z) < 1e-3 && Math.abs(a.d - b.d) / b.d < 1e-3;
}
/* The way from a to b in a view of W x H px, and the speed along it the
   camera leaves with (see flightSpeed); fixed once planned. */
export function planFlight(a, b, W, H, v0){
  const F = WORLD.flight, view = 2 * Math.sqrt(a.d * b.d) * TAN * (W / Math.max(1, H));
  const ground = Math.hypot(b.x - a.x, b.z - a.z) / view, zoom = Math.log(b.d / a.d);
  const len = Math.hypot(ground, zoom);
  return { a: a, b: b, view: view, ms: Math.min(F.maxMs, F.minMs + F.perView * len), arc: F.arc * Math.min(1, ground),
           v0: Math.min(3, Math.max(0, v0 || 0)) };
}
/* How far along the way at u (0..1 of its time): leaving at v0, arriving at rest. */
function along(u, v0){ return v0 * (u * u * u - 2 * u * u + u) + (3 * u * u - 2 * u * u * u); }
/* The frame at u; `linear` follows a finger along the same way, unshaped. */
export function flightFrame(fl, u, linear){
  const k = Math.min(1, Math.max(0, u)), s = linear ? k : along(k, fl.v0);
  const la = Math.log(fl.a.d), lb = Math.log(fl.b.d);
  return { x: fl.a.x + (fl.b.x - fl.a.x) * s, z: fl.a.z + (fl.b.z - fl.a.z) * s,
           d: Math.exp(la + (lb - la) * s + fl.arc * 4 * s * (1 - s)) };
}
/* The speed a camera moving at `vel` ({ x, z, l } per ms: ground units and
   log-distance) has along a flight, in the flight's own terms (the whole
   way per its whole time), never backward and at least the brisk start. */
export function flightSpeed(fl, vel){
  const F = WORLD.flight, v = fl.view;
  const dx = (fl.b.x - fl.a.x) / v, dz = (fl.b.z - fl.a.z) / v, dl = Math.log(fl.b.d / fl.a.d), n = dx * dx + dz * dz + dl * dl;
  if(!(n > 1e-9) || !vel) return F.start;
  const rate = ((vel.x || 0) / v * dx + (vel.z || 0) / v * dz + (vel.l || 0) * dl) / n;
  return Math.min(3, Math.max(F.start, rate * fl.ms));
}

/* ---------- the drawing buffer ----------
   Sharp on a phone, never more than two device pixels per CSS pixel, and
   never a buffer so large a tablet pays for it. When frames run slow for a
   second, the next step down; never back up within a visit. */
export function pixelRatioFor(dpr, w, h){
  const area = Math.max(1, w * h);
  return Math.max(0.5, Math.min(dpr || 1, WORLD.maxPixelRatio, Math.sqrt(WORLD.maxCanvasPixels / area)));
}
/* Whether slow frames are the renderer's fault. A screen or power mode that
   presents at 30 a second (iOS Low Power Mode, a browser saving battery)
   makes every gap about 33 ms however cheap the frame is, and a lower
   resolution buys nothing there. The renderer times one frame, CPU and GPU;
   only when that cost fills most of the gap does the resolution step down. */
export function shouldStepDown(gapMs, costMs, dpr){
  if(!(gapMs > WORLD.slowFrameMs) || !(dpr > WORLD.minPixelRatio)) return false;
  return costMs >= gapMs * WORLD.costShare;
}
export function nextPixelRatio(current){
  const steps = [2, 1.75, 1.5, 1.25, 1];
  const below = steps.filter(s => s < current - 1e-6);
  return below.length ? Math.max(WORLD.minPixelRatio, below[0]) : current;
}

/* ---------- labels ----------
   Every project keeps a real button; this decides where each label stands
   and which can be read at once. One rule for every place, at every size:
   a label stands on its own place, centred over the front of its deck, so
   it names that place and covers no other; the place in focus shows its
   card just in front of it instead, where it hides nothing of the place.
   `under` eases between the two (0 on the place, 1 in front), so a label
   glides rather than jumps while the camera flies. Then, in order: the
   focused and selected labels, what needs you, nearer rows (drawn in
   front), registry order; a label that would overlap one already placed,
   or anything the view keeps clear (the Overview button), is hidden, and a
   hidden or off-screen label takes no taps. */
export function labelSpot(anchor, w, h, under, viewW){
  const k = Math.min(1, Math.max(0, under)), m = WORLD.edgePx;
  const x = Math.min(Math.max(anchor.x - w / 2, m), Math.max(m, viewW - m - w));
  return { x: Math.round(x), y: Math.round(anchor.y + LABEL_GAP * k - (h + LABEL_GAP) * (1 - k)) };
}
/* Each rect is { id, x, y, w, h, row, attn, off } in px (off: its place
   has left the view); `first` the ids that lead; `keep` rects no label may
   cover. */
export function resolveLabels(rects, first, viewW, viewH, keep){
  const lead = [].concat(first).filter(Boolean);
  const rank = r => { const i = lead.indexOf(r.id); return i === -1 ? lead.length : i; };
  const order = rects.slice().sort((a, b) =>
    rank(a) - rank(b) || (b.attn ? 1 : 0) - (a.attn ? 1 : 0) || b.row - a.row || rects.indexOf(a) - rects.indexOf(b));
  const overlap = (r, p) => !(r.x >= p.x + p.w || p.x >= r.x + r.w || r.y >= p.y + p.h || p.y >= r.y + r.h);
  const placed = (keep || []).slice(), shown = {};
  order.forEach(r => {
    const inView = !r.off && r.x >= 0 && r.x + r.w <= viewW && r.y >= 0 && r.y + r.h <= viewH;
    shown[r.id] = inView && !placed.some(p => overlap(r, p));
    if(shown[r.id]) placed.push(r);
  });
  return shown;
}

/* ---------- gestures ----------
   One arbiter for the viewport. The first pointer owns the gesture; others
   are ignored until it ends. Until it has moved WORLD.slopPx it is a tap in
   waiting; past that it is a pan for the rest of its life, and the click it
   would otherwise make is swallowed: a drag never opens a brief. Its axis
   is decided once, as it starts: 'x' only when clearly sideways, 'y' when
   clearly up or down, 'xy' between. A cancel or a lost capture ends it with
   no tap. Times (ms) are optional; given, the end reports the finger's
   speed over its last WORLD.swipe.trailMs, and none if it rested first. */
export function axisOf(dx, dy){
  const k = WORLD.swipe.axis, ax = Math.abs(dx), ay = Math.abs(dy);
  return ax > ay * k ? 'x' : ay > ax * k ? 'y' : 'xy';
}
export function createArbiter(slop){
  const limit = slop === undefined ? WORLD.slopPx : slop;
  let g = null;
  const note = (t, x, y) => {
    if(!Number.isFinite(t)) return;
    g.trail.push([t, x, y]);
    while(g.trail.length > 2 && t - g.trail[0][0] > WORLD.swipe.trailMs) g.trail.shift();
  };
  const speed = t => {
    const tr = g.trail, a = tr[0], b = tr[tr.length - 1];
    if(!a || a === b || !Number.isFinite(t) || t - b[0] > WORLD.swipe.restMs || b[0] - a[0] < 8) return { vx: 0, vy: 0 };
    return { vx: (b[1] - a[1]) / (b[0] - a[0]), vy: (b[2] - a[2]) / (b[0] - a[0]) };
  };
  return {
    down(id, x, y, t){
      if(g) return null;
      g = { id: id, x0: x, y0: y, x: x, y: y, panning: false, axis: null, trail: [] };
      note(t, x, y);
      return { type: 'down' };
    },
    move(id, x, y, t){
      if(!g || g.id !== id) return null;
      note(t, x, y);
      if(!g.panning){
        if(Math.hypot(x - g.x0, y - g.y0) <= limit) return null;
        g.panning = true;
        g.axis = axisOf(x - g.x0, y - g.y0);
        const out = { type: 'pan-start', dx: x - g.x0, dy: y - g.y0, axis: g.axis };
        g.x = x; g.y = y;
        return out;
      }
      const out = { type: 'pan', dx: x - g.x, dy: y - g.y, tx: x - g.x0, ty: y - g.y0, axis: g.axis };
      g.x = x; g.y = y;
      return out;
    },
    up(id, t){
      if(!g || g.id !== id) return null;
      const v = speed(t);
      const out = { type: g.panning ? 'pan-end' : 'tap', x: g.x0, y: g.y0, tx: g.x - g.x0, ty: g.y - g.y0, axis: g.axis, vx: v.vx, vy: v.vy };
      g = null;
      return out;
    },
    cancel(id){
      if(!g || (id !== undefined && g.id !== id)) return null;
      const out = { type: g.panning ? 'pan-end' : 'cancel', cancelled: true, axis: g.axis };
      g = null;
      return out;
    },
    busy(){ return !!g; },
    panning(){ return !!(g && g.panning); }
  };
}

/* ---------- moving between places ----------
   In focus a sideways swipe goes to the next place (finger to the left) or
   the previous (to the right) in reading order, which is the city's own:
   back to front, left to right. There is no wrap: at either end the world
   gives a little and comes back. A swipe that goes neither far enough nor
   fast enough, or is flicked back against itself, goes nowhere. Returns 1,
   -1 or 0. `tx` is how far the finger went, `vx` its speed (px per ms). */
export function swipeVerdict(tx, vx, W){
  const s = WORLD.swipe, far = Math.abs(tx) >= Math.max(s.minPx, W * s.share);
  const fast = Math.abs(vx) >= s.flickPxMs;
  const flick = fast && Math.abs(tx) >= s.flickMinPx && Math.sign(vx) === Math.sign(tx);
  if(fast && Math.sign(vx) === -Math.sign(tx)) return 0;
  if(!far && !flick) return 0;
  return tx < 0 ? 1 : -1;
}
/* The place `step` along from `id` in `order`, or null: never round the end. */
export function neighbourOf(order, id, step){
  const i = order.indexOf(id);
  if(i === -1 || !step) return null;
  const j = i + step;
  return j >= 0 && j < order.length ? order[j] : null;
}
/* Mid-swipe: the camera as far along the flight to the next place as the
   finger has gone, a whole view being the whole way; with nowhere to go it
   gives, less and less, up to WORLD.swipe.edge of the view. */
export function swipeFrame(from, to, tx, W, H, island){
  if(!to){
    const most = WORLD.swipe.edge * W, give = most * Math.tanh(tx / (most * 3));
    return clampFrame(shiftPx(from, -give, 0, H), island);
  }
  return flightFrame(planFlight(from, to, W, H, 0), Math.abs(tx) / Math.max(1, W), true);
}

/* ---------- crews ----------
   The crew's state is the app's (SIGNALS[..].worker); this only says where
   the worker stands and how. Unknown has no crew and no station: nothing is
   known to be happening there. `loops` states move gently while someone can
   see them; the rest hold still. Under Reduce Motion every state keeps its
   informative pose and nothing moves. */
export const CREW = {
  working:     { station: 'bench',     loops: true },   // building
  inspecting:  { station: 'clipboard', loops: true },   // needs QA
  waiting:     { station: 'console',   loops: true },   // needs a decision
  warning:     { station: 'barrier',   loops: false },  // blocked: work has stopped
  idle:        { station: 'valve',     loops: true },   // stable: calm upkeep
  quiet:       { station: 'seat',      loops: false },  // paused: seated, still, dimmed
  surveying:   { station: 'blueprint', loops: true },   // planning
  celebrating: { station: 'flag',      loops: false },  // release ready: one nod, only on the change
  unrecorded:  null
};

/* Joint angles in radians at time t (seconds). `once` is the progress
   (0..1) of a one-shot gesture, or null. t = 0 and once = null is each
   state's informative still: what Reduce Motion shows. Negative arm angles
   raise an arm forward; a positive head angle looks down; a negative leg
   angle swings a leg forward. 'running' is a place's runner, not a crew. */
export function poseFor(state, t, once){
  const s = Math.sin, k = t || 0;
  const p = { armL: -0.1, armR: -0.1, spreadL: 0.1, spreadR: -0.1, head: 0, turn: 0, lean: 0, lift: 0, legL: 0, legR: 0, seated: false };
  switch(state){
    case 'working':     p.armR = -1.35 + 0.5 * s(k * 5.5); p.armL = -0.55; p.lean = 0.14; p.head = 0.3; p.lift = 0.02 * Math.max(0, s(k * 5.5)); break;
    case 'inspecting':  p.armL = -1.2; p.spreadL = 0.3; p.armR = -0.75 + 0.12 * s(k * 2.2); p.head = 0.32 + 0.08 * s(k * 1.1); break;
    case 'waiting':     p.armR = -1.5; p.spreadR = -0.35; p.turn = -0.35 + 0.08 * s(k * 0.9); p.head = 0.05; break;
    case 'warning':     p.armL = 0.02; p.armR = 0.02; p.head = 0.42; p.lean = 0.05; break;
    case 'idle':        p.armR = -1.0 + 0.2 * s(k * 1.4); p.armL = -0.95 - 0.2 * s(k * 1.4); p.lean = 0.12; p.head = 0.25; break;
    case 'quiet':       p.seated = true; p.armL = -0.55; p.armR = -0.55; p.head = 0.35; p.legL = p.legR = -1.45; break;
    case 'surveying':   p.armR = -1.05 + 0.1 * s(k * 1.2); p.armL = -0.6; p.lean = 0.25; p.head = 0.5; p.turn = 0.12 * s(k * 0.5); break;
    case 'celebrating': {
      const w = once === null || once === undefined ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, once)));
      p.armR = -0.3 - 2.4 * w; p.armL = -0.15; p.head = -0.12 * w; break;
    }
    case 'running': {
      const a = s(k * 9);
      p.legL = -0.75 * a; p.legR = 0.75 * a; p.armL = 0.8 * a - 0.2; p.armR = -0.8 * a - 0.2;
      p.lean = 0.18; p.lift = 0.06 * Math.abs(s(k * 9)); break;
    }
    default: return null;
  }
  return p;
}

/* Whether this state moves while seen. Never under Reduce Motion. */
export function crewLoops(state, reducedMotion){
  return !reducedMotion && !!(CREW[state] && CREW[state].loops);
}

/* ---------- a place's life ----------
   Each place does its own thing while its project is known to be under way:
   the runner laps the track, the chef slices, pages turn. Nothing moves
   where nothing is known (no record), where work has stopped (blocked) or
   rests (paused), and nothing moves under Reduce Motion: there the place
   holds its first moment, still. Calm upkeep (stable) moves a little
   slower. Life is a place, never a measure: it does not speed up, grow or
   count with anything. */
const LIVELY = ['working', 'inspecting', 'waiting', 'idle', 'surveying', 'celebrating'];
export function lifeActive(workerState, reducedMotion){ return !reducedMotion && LIVELY.indexOf(workerState) !== -1; }
export function lifeSpeed(workerState){ return workerState === 'idle' ? 0.7 : 1; }

/* Where one copy of a life element is at time t, relative to its anchor:
   { p: [x, y, z], r: [rx, ry, rz], s } in the district's frame and the
   recipe's units. t = 0 is the still moment. */
export function lifePose(el, t, copy){
  const i = copy || 0, ph = (el.phase || 0) + i * (el.spread || 0), w = el.speed || 1, a = t * w + ph;
  const axis = el.axis || 'y', rot = v => axis === 'x' ? [v, 0, 0] : axis === 'z' ? [0, 0, v] : [0, v, 0];
  switch(el.kind){
    case 'orbit': {
      const x = el.rx * Math.cos(a), z = el.rz * Math.sin(a);
      const tx = -el.rx * Math.sin(a), tz = el.rz * Math.cos(a);
      return { p: [x, 0, z], r: [0, el.face ? Math.atan2(tx, tz) : 0, 0], s: 1 };
    }
    case 'spin':  return { p: [0, 0, 0], r: rot(a), s: 1 };
    case 'swing': return { p: [0, 0, 0], r: rot((el.base || 0) + el.amp * Math.sin(a)), s: 1 };
    case 'slide': { const k = el.amp * Math.sin(a); return { p: [el.dir[0] * k, el.dir[1] * k, el.dir[2] * k], r: [0, 0, 0], s: 1 }; }
    case 'pulse': return { p: [0, 0, 0], r: [0, 0, 0], s: 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(a)) };
    case 'rise': {
      const c = ((a / (Math.PI * 2)) % 1 + 1) % 1;
      return { p: [0, el.height * c, 0], r: [0, 0, 0], s: Math.max(0.001, 1 - c) };
    }
    case 'drop': {
      const c = ((a / (Math.PI * 2)) % 1 + 1) % 1, fall = Math.min(1, c / 0.35);
      return { p: [0, el.height * (1 - fall * fall), 0], r: [0, 0, 0], s: c < 0.8 ? 1 : Math.max(0.001, (1 - c) / 0.2) };
    }
    default: return { p: [0, 0, 0], r: [0, 0, 0], s: 1 };
  }
}
export const LIFE_KINDS = ['orbit', 'spin', 'swing', 'slide', 'pulse', 'rise', 'drop'];

/* ---------- materials ----------
   A part names a colour; the colour itself is a design token on the page,
   read once by render3d.js. 'tint' and 'terrain' are the project's own
   identity (--tint-<theme>, --terrain-<theme>); nothing here is a status
   colour, and nothing is a literal colour. */
export const PALETTE = {
  plinth: '--mat-plinth', stone: '--mat-stone', steel: '--mat-metal', ink: '--mat-ink',
  gold: '--mat-coin', rice: '--mat-rice', salmon: '--mat-fish', nori: '--mat-nori', wood: '--mat-crate',
  woodLight: '--mat-wood-light', paper: '--mat-paper', water: '--mat-water', fur: '--mat-fur',
  furDark: '--mat-fur-dark', board: '--mat-board', blueprint: '--mat-blueprint',
  window: '--glow-window', screen: '--glow-screen', suit: '--worker-suit', skin: '--worker-head',
  grass: '--land-grass', grassEdge: '--land-grass-edge', soil: '--land-soil', rock: '--land-rock',
  leaf: '--mat-leaf', leafDark: '--mat-leaf-dark', bark: '--mat-bark', petal: '--mat-petal', petalLight: '--mat-petal-light',
  asphalt: '--city-asphalt', sidewalk: '--city-sidewalk', curb: '--city-curb', facade: '--city-facade',
  facadeWarm: '--city-facade-warm', facadeCool: '--city-facade-cool', windowCool: '--city-window-cool',
  windowDim: '--city-window-dim', roadPaint: '--city-road-paint', cityBase: '--city-base',
  canal: '--city-water', quay: '--city-quay', drop: '--city-drop',
  shade: '--iso-shade', lightKey: '--light-key', lightFill: '--light-fill', lightRim: '--light-rim',
  lightSky: '--light-sky', lightGround: '--light-ground'
};
/* Matte is physically shaded with soft bevel normals; metal adds a restrained highlight; glow is
   light that belongs to the place (windows, seams, screens, lanterns),
   never a status. */
export const FINISHES = ['matte', 'metal', 'glow'];

/* ---------- places ----------
   A part: { s: shape, p: [x, y, z], d: dimensions, m: finish, c: colour,
   r: [rx, ry, rz], n: segments, k: [sx, sy, sz], shade } (the last four
   optional). y is where the part's lowest point sits. Shapes and their d:
     box  [width x, height, depth z]     cyl  [radius, height]
     cone [radius, height]               ball [radius]
     ring [inner, outer], flat           torus [radius, tube]
     rock [radius]  (a low, faceted stone)
   Visible faces are +x (lower right, in shade) and +z (lower left, lit),
   so windows and signs go there. The back corner holds the beacon; the
   front holds the crew; structures keep to the back and the sides.
   Nothing here says how far along a project is: these are places, not
   progress bars. */
const box = (x, y, z, w, h, d, m, c, extra) => Object.assign({ s: 'box', p: [x, y, z], d: [w, h, d], m: m, c: c }, extra);
const cyl = (x, y, z, r, h, m, c, extra) => Object.assign({ s: 'cyl', p: [x, y, z], d: [r, h], m: m, c: c }, extra);
const cone = (x, y, z, r, h, m, c, extra) => Object.assign({ s: 'cone', p: [x, y, z], d: [r, h], m: m, c: c }, extra);
const ball = (x, y, z, r, m, c, extra) => Object.assign({ s: 'ball', p: [x, y, z], d: [r], m: m, c: c }, extra);
const ring = (x, y, z, a, b, m, c, extra) => Object.assign({ s: 'ring', p: [x, y, z], d: [a, b], m: m, c: c }, extra);
const torus = (x, y, z, r, t, m, c, extra) => Object.assign({ s: 'torus', p: [x, y, z], d: [r, t], m: m, c: c }, extra);
const rock = (x, y, z, r, m, c, extra) => Object.assign({ s: 'rock', p: [x, y, z], d: [r], m: m, c: c }, extra);
const LIE_X = { r: [0, 0, Math.PI / 2] }, LIE_Z = { r: [Math.PI / 2, 0, 0] };
/* Turned to face the camera, which looks along -x-z. */
const FACE = { r: [0, Math.PI / 4, 0] };
export const SHAPES = ['box', 'cyl', 'cone', 'ball', 'ring', 'torus', 'rock'];

/* A little kit of common things, so a place can be detailed without being
   long. Each returns parts. */
/* A window on a +z face (a pane in x and y) or a +x face (in z and y): a
   dark frame, a lit pane and a sill. */
function pane(x, y, z, w, h, face, lit){
  const material = lit === false ? 'metal' : 'glow', colour = lit === false ? 'windowDim' : lit === 'cool' ? 'windowCool' : 'window';
  if(face === 'x') return [box(x + 0.012, y - 0.05, z, 0.03, h + 0.1, w + 0.1, 'matte', 'ink'), box(x + 0.03, y, z, 0.02, h, w, material, colour),
                           box(x + 0.06, y - 0.07, z, 0.08, 0.04, w + 0.14, 'matte', 'paper')];
  return [box(x, y - 0.05, z + 0.012, w + 0.1, h + 0.1, 0.03, 'matte', 'ink'), box(x, y, z + 0.03, w, h, 0.02, material, colour),
          box(x, y - 0.07, z + 0.06, w + 0.14, 0.04, 0.08, 'matte', 'paper')];
}
/* A door on a +z or +x face: frame, door and a small light over it. */
function door(x, z, w, h, face, c){
  if(face === 'x') return [box(x + 0.012, 0, z, 0.03, h + 0.08, w + 0.12, 'matte', 'ink'), box(x + 0.03, 0, z, 0.02, h, w, 'matte', c || 'wood'),
                           ball(x + 0.1, h + 0.1, z, 0.06, 'glow', 'window')];
  return [box(x, 0, z + 0.012, w + 0.12, h + 0.08, 0.03, 'matte', 'ink'), box(x, 0, z + 0.03, w, h, 0.02, 'matte', c || 'wood'),
          ball(x, h + 0.1, z + 0.1, 0.06, 'glow', 'window')];
}
function planter(x, z, s){
  const k = s || 1;
  return [box(x, 0, z, 0.42 * k, 0.28 * k, 0.42 * k, 'matte', 'wood'), ball(x, 0.2 * k, z, 0.3 * k, 'matte', 'leaf'),
          ball(x + 0.1 * k, 0.38 * k, z - 0.06 * k, 0.18 * k, 'matte', 'leafDark')];
}
function bench(x, z, turn){
  const r = { r: [0, turn || 0, 0] };
  return [box(x, 0.22, z, 0.8, 0.07, 0.26, 'matte', 'woodLight', r), box(x, 0, z, 0.06, 0.22, 0.22, 'matte', 'ink', r),
          box(x + Math.cos(turn || 0) * 0.34, 0, z - Math.sin(turn || 0) * 0.34, 0.06, 0.22, 0.22, 'matte', 'ink', r),
          box(x - Math.cos(turn || 0) * 0.34, 0, z + Math.sin(turn || 0) * 0.34, 0.06, 0.22, 0.22, 'matte', 'ink', r)];
}
function lamp(x, z, h){
  const k = h || 1.3;
  return [box(x, 0, z, 0.14, 0.08, 0.14, 'metal', 'steel'), cyl(x, 0.08, z, 0.035, k, 'metal', 'steel', { n: 6 }),
          box(x, k + 0.08, z, 0.2, 0.05, 0.2, 'matte', 'ink'), ball(x, k - 0.06, z, 0.1, 'glow', 'window')];
}
function crate(x, z, s, turn){ return [box(x, 0, z, s, s, s, 'matte', 'wood', { r: [0, turn || 0, 0] }), box(x, s, z, s * 0.7, s * 0.06, s * 0.7, 'matte', 'woodLight', { r: [0, turn || 0, 0] })]; }
function shrub(x, z, s){ const k = s || 1; return [ball(x, 0, z, 0.32 * k, 'matte', 'leaf', { k: [1, 0.8, 1] }), ball(x + 0.18 * k, 0, z + 0.1 * k, 0.22 * k, 'matte', 'leafDark', { k: [1, 0.8, 1] })]; }
function flowers(x, z){ return [ball(x, 0, z, 0.16, 'matte', 'leafDark', { k: [1, 0.5, 1] }), ball(x + 0.08, 0.08, z, 0.06, 'matte', 'petal'),
                                ball(x - 0.07, 0.08, z + 0.05, 0.06, 'matte', 'petalLight'), ball(x, 0.1, z - 0.08, 0.05, 'matte', 'petal')]; }

/* A shelf of book spines along a wall's visible face, from `from` to `to`
   along x (a back wall) or z (a side wall), in a fixed pattern: the same
   books every time, never random. */
function spines(from, to, y, atX, along){
  const out = [], colours = ['tint', 'paper', 'ink', 'salmon', 'paper', 'blueprint', 'gold'];
  for(let p = from, i = 0; p < to - 0.12; i++){
    const w = 0.1 + (i * 37 % 5) * 0.022, h = 0.36 + (i * 53 % 4) * 0.04;
    const c = colours[i % colours.length];
    out.push(along === 'x' ? box(p + w / 2, y, atX, w, h, 0.03, 'matte', c) : box(atX, y, p + w / 2, 0.03, h, w, 'matte', c));
    p += w + 0.018;
  }
  return out;
}

/* The beacon: a mast at the district's back-right with a lamp the status
   lights. Only its lamp and halo change with a status; the mast is the
   place's. In recipe units, drawn at TILE.content. */
export const BEACON = { x: 2.9, z: -2.9, mast: 2.2, lamp: 0.2 };

/* Each place: its parts, where its crew stands, and its life. A life
   element: { kind, at: [x, y, z], parts | rig, and its motion }, see
   lifePose; `copies` repeats it, `spread` sets their phase apart. */
/* Architectural kit. Broad masses have a small bevel; windows are recessed
   behind sills, mullions and cornices so light has edges to catch. */
const mass = (x,y,z,w,h,d,c) => box(x,y,z,w,h,d,'matte',c,{ bevel: 0.055 });
function frontage(x,z,w,d,floors,c){
  const p = [mass(x,0,z,w,0.18,d,'curb'), mass(x,0.18,z,w-0.12,floors*1.12+0.22,d-0.12,c)];
  const top = floors*1.12+0.4;
  for(let f=0;f<floors;f++){
    const y=0.42+f*1.12;
    for(let i=0;i<3;i++) p.push(...pane(x-w*.32+i*w*.32,y,z+d/2-0.045,w*.23,.73,null,(i+f)%3!==0));
    for(let i=0;i<2;i++) p.push(...pane(x+w/2-0.045,y,z-d*.26+i*d*.52,d*.32,.73,'x',(i+f)%3===0?false:(i+f)%2?'cool':true));
    for(let i=0;i<3;i++) p.push(box(x-w*.32+i*w*.32,y,z+d/2+.015,.035,.73,.035,'metal','steel'));
    for(let i=0;i<2;i++) p.push(box(x+w/2+.015,y,z-d*.26+i*d*.52,.035,.73,.035,'metal','steel'));
    p.push(mass(x,y+.86,z,w+.12,.11,d+.12,'curb'));
  }
  p.push(mass(x,top,z,w+.28,.16,d+.28,'curb'),mass(x,top+.16,z,w-.12,.07,d-.12,'ink'));
  for(const s of [-1,1]) p.push(mass(x+s*(w/2+.045),top+.16,z,.13,.26,d+.26,'curb'),mass(x,top+.16,z+s*(d/2+.045),w+.26,.26,.13,'curb'));
  p.push(mass(x-.55,top+.23,z-.3,.65,.37,.72,'steel'),mass(x-.55,top+.6,z-.3,.7,.07,.76,'ink'));
  for(let i=0;i<4;i++) p.push(box(x-.55,top+.675,z-.56+i*.17,.52,.012,.045,'metal','steel'));
  return p;
}
function streetFurniture(){
  return [...planter(-2.85,2.6,1.25),...planter(2.75,1.5,.9),...bench(-1.7,2.9,0),...lamp(2.85,2.8,2.1),
    mass(-2.8,0,-2.8,.66,.24,.66,'curb'),cyl(-2.8,.24,-2.8,.075,1.2,'matte','bark'),
    ball(-2.8,1.2,-2.8,.47,'matte','leaf',{n:12,k:[1,1.15,1]})];
}
function canopy(x,z,w,c){
  return [mass(x,1.48,z,w,.18,.78,c),box(x,1.36,z+.34,w,.14,.08,'glow','window'),
    cyl(x-w*.45,0,z+.28,.045,1.45,'metal','steel'),cyl(x+w*.45,0,z+.28,.045,1.45,'metal','steel')];
}
function signBoard(x,y,z,w,c){ return [mass(x,y,z,w,.42,.12,c),box(x,y+.09,z+.075,w*.84,.025,.025,'glow','window'),box(x,y+.29,z+.075,w*.84,.025,.025,'glow','window')]; }

export const ENVIRONMENTS = {
  track: {
    crew:{x:1.8,z:2.4},
    parts:[...frontage(-.15,-.5,4.5,3.8,2,'facadeCool'),...streetFurniture(),...canopy(-.6,1.65,2.8,'tint'),
      ...signBoard(-.15,1.62,1.43,3.5,'ink'),
      mass(-.15,2.9,-.5,4.55,.12,3.85,'tint'),
      ring(-.15,3.035,-.5,1.13,1.52,'matte','tint',{k:[1.25,1,.8],n:48}),
      ring(-.15,3.045,-.5,1.3,1.33,'matte','paper',{k:[1.25,1,.8],n:48}),
      ring(-.15,3.045,-.5,1.49,1.51,'matte','paper',{k:[1.25,1,.8],n:48}),
      mass(-.15,3.035,-.5,1.2,.06,.55,'leafDark')],
    life:[{kind:'orbit',at:[-.15,3.09,-.5],rx:1.78,rz:1.13,speed:.42,face:true,rig:'runner'}]
  },
  calendar:{
    crew:{x:1.8,z:2.5},
    parts:[...frontage(-.55,-.65,3.55,3.5,4,'facade'),...streetFurniture(),...canopy(-.8,1.25,2.9,'tint'),
      mass(1.7,.18,-.5,.85,4.6,3.2,'facadeCool'),
      box(2.14,.6,-.4,.025,3.8,1.35,'glow','windowCool'),
      ...signBoard(-.55,1.65,1.14,3.3,'tint'),
      cyl(-.55,4.05,1.18,.43,.06,'matte','paper',LIE_Z),torus(-.55,4.05,1.23,.43,.045,'metal','gold',{n:24}),
      box(-.55,4.45,1.27,.04,.04,.04,'matte','ink')],
    life:[{kind:'spin',at:[-.55,4.47,1.29],axis:'z',speed:-.4,parts:[box(.02,-.03,0,.25,.045,.025,'matte','ink')]}]
  },
  book:{
    crew:{x:1.7,z:2.5},
    parts:[...frontage(-.35,-.65,4.5,3.5,2,'facadeWarm'),...streetFurniture(),
      mass(-.35,2.85,-.65,4.75,.2,3.8,'stone'),
      cone(-.35,3.05,-.65,2.75,.8,'matte','tint',{n:4,r:[0,Math.PI/4,0],k:[1,1,.78]}),
      mass(-.35,0,1.35,3.4,.12,.65,'curb'),mass(-.35,.12,1.25,3.0,.12,.65,'curb'),
      ...[-1.8,-.85,.15,1.1].flatMap(x=>[cyl(x,.24,1.24,.11,2.44,'matte','paper',{n:12}),mass(x,2.57,1.24,.35,.14,.38,'curb')]),
      ...signBoard(-.35,1.77,1.3,3.35,'wood'),
      mass(-.35,3.32,1.23,.6,.06,.43,'paper'),mass(-.53,3.38,1.23,.34,.07,.43,'paper'),mass(-.17,3.38,1.23,.34,.07,.43,'paper'),
      ...spines(-1.6,1.0,.5,1.13,'x')],
    life:[{kind:'swing',at:[-.35,3.45,1.23],axis:'z',base:-.1,amp:.6,speed:.6,parts:[box(.14,0,0,.28,.015,.4,'matte','paper')]}]
  },
  vault:{
    crew:{x:1.8,z:2.5},
    parts:[...frontage(-.35,-.6,4.4,3.7,3,'facadeCool'),...streetFurniture(),
      ...signBoard(-.35,1.55,1.3,3.6,'tint'),
      mass(-.35,3.98,-.6,4.75,.22,4.05,'curb'),
      ...[-1.8,1.1].flatMap(x=>[mass(x,0,1.5,.44,1.5,.45,'curb'),mass(x,1.45,1.5,.58,.16,.58,'paper')]),
      cyl(-.35,.38,1.4,.56,.12,'metal','steel',LIE_Z),torus(-.35,.38,1.5,.53,.04,'metal','gold',{n:24}),
      mass(-.35,0,1.78,2.3,.12,.7,'curb')],
    life:[{kind:'spin',at:[-.35,.94,1.59],axis:'z',speed:.28,parts:[box(0,-.025,0,.65,.05,.04,'metal','gold'),box(0,-.32,0,.05,.65,.04,'metal','gold')]}]
  },
  rocket:{
    crew:{x:1.9,z:2.5},
    parts:[...frontage(-.4,-.6,4.3,3.7,3,'facade'),...streetFurniture(),...canopy(-.6,1.55,3.2,'tint'),
      ...signBoard(-.4,1.7,1.3,3.5,'tint'),
      cyl(-.4,4.1,-.6,1.28,.17,'matte','curb',{n:32}),
      ball(-.4,4.15,-.6,1.1,'metal','facadeCool',{n:20,k:[1,.65,1]}),
      cyl(-.4,4.85,-.6,.29,.92,'matte','paper',{n:20}),cyl(-.4,5.08,-.6,.3,.16,'matte','tint',{n:20}),
      cone(-.4,5.77,-.6,.29,.55,'matte','tint',{n:20}),
      box(-.4,4.9,-.16,.07,.44,.4,'matte','tint'),box(.04,4.9,-.6,.4,.44,.07,'matte','tint'),
      cyl(-.4,5.35,-.29,.09,.025,'glow','window',LIE_Z)],
    life:[{kind:'spin',at:[1.13,4.25,-1.4],axis:'y',speed:.35,parts:[cyl(0,0,0,.045,.4,'metal','steel'),cone(0,.4,0,.45,.15,'metal','paper',{n:18,r:[Math.PI+.5,0,0]})]}]
  },
  sushi:{
    crew:{x:1.95,z:2.5},
    parts:[...frontage(-.5,-.7,4.25,3.45,2,'facadeWarm'),...streetFurniture(),
      ...canopy(-.5,1.3,4.45,'salmon'),...signBoard(-.5,1.7,1.12,3.8,'wood'),
      mass(-.5,.12,1.05,3.65,.7,.35,'wood'),mass(-.5,.82,1.13,3.8,.12,.58,'woodLight'),
      ...[-1.7,-.9,-.1,.7].flatMap(x=>[box(x,1.45,1.76,.48,.35,.025,'matte','tint'),ball(x,1.12,1.54,.13,'glow','window')]),
      ...[-1.6,-.6,.4].flatMap(x=>[cyl(x,0,2.05,.06,.38,'metal','steel'),cyl(x,.38,2.05,.23,.09,'matte','woodLight')]),
      ball(.65,.96,.76,.25,'matte','fur',{k:[1,1,.8]}),ball(.65,1.25,.87,.21,'matte','fur'),ball(.65,1.35,1.04,.14,'matte','furDark',{k:[1,.55,.7]}),
      cyl(.65,1.63,.87,.21,.19,'matte','paper'),
      ...[-1.25,-.65,-.05].flatMap(x=>[cyl(x,.95,1.2,.18,.035,'matte','paper'),cyl(x,.985,1.2,.1,.12,'matte','nori'),cyl(x,1.105,1.2,.08,.01,'matte','rice')])],
    life:[{kind:'swing',at:[.27,1.12,1.2],axis:'z',base:-.25,amp:.22,speed:2,parts:[box(0,0,0,.03,.13,.3,'metal','steel')]}]
  },
  generic:{
    crew:{x:1.8,z:2.5},
    parts:[...frontage(-.4,-.6,4.3,3.6,3,'facade'),...streetFurniture(),...canopy(-.5,1.4,2.9,'tint'),...signBoard(-.4,1.6,1.24,3.4,'tint')],
    life:[{kind:'spin',at:[.6,4,-.5],axis:'y',speed:.4,parts:[cyl(0,0,0,.04,.3,'metal','steel'),cone(0,.3,0,.4,.12,'metal','steel',{n:16,r:[Math.PI+.45,0,0]})]}]
  }
};

export function environmentFor(theme){ return ENVIRONMENTS[theme] || ENVIRONMENTS.generic; }

/* ---------- authored places ----------
   A look may have a place authored in Blender (art/blender, and
   docs/3D-ART-BIBLE.md) and exported as a GLB. Blender owns its geometry,
   materials and clips; the app owns its state, its light and every touch.
   The renderer draws it instead of the look's recipe, which remains the
   fallback when the file cannot load. `span` is the width its plinth is
   drawn at, in world units, inside the pad; `rise` its authored height over
   its authored width, measured from the exported file, so framing and
   hit-testing know how tall it stands before it has loaded. */
export const ASSETS = {
  track: { url: './release/golden-diorama.e0b21a1c4dcc.glb', span: 10.0, rise: 0.433 },
  calendar: { url: './release/dayplan-diorama.c60794997357.glb', span: 10.0, rise: 0.596 },
  book: { url: './release/dailyverse-diorama.97f674076d4d.glb', span: 10.0, rise: 0.479 },
  vault: { url: './release/savings-diorama.9099b2690506.glb', span: 10.0, rise: 0.497 },
  rocket: { url: './release/spacek-diorama.7b9d1f6a6052.glb', span: 10.0, rise: 0.571 },
  sushi: { url: './release/capysushi-diorama.5e636e127ee4.glb', span: 10.0, rise: 0.403 }
};
export function assetFor(theme){ return ASSETS[theme] || null; }

/* The clips every authored worker carries, and the material every status
   light in an authored place shares (docs/3D-ASSET-REPORT.md). */
export const ASSET_CLIPS = ['MC_IDLE', 'MC_WORKING', 'MC_ACTIVE', 'MC_SIGNAL', 'MC_REPAIR'];
export const ASSET_STATUS_MATERIAL = 'MC_STATUS_LIGHT';
/* A place's own life, authored as one clip on its own nodes. */
export const ASSET_LIFE_CLIP = 'MC_LIFE';
/* The export joins every worker into one crew; a bone is "<role>__<bone>". */
export const CREW_JOIN = '__';

/* What an authored worker does in each crew state. `authored` is the clip
   it was posed with in Blender (its role: the coach's clipboard, the
   runner's run, the signaller's raised arm, the technician's repair).
   Returns { clip, pace }: pace 1 plays it, 0.7 is calm upkeep, and 0 holds
   its first frame, still. null: the worker is not there, because nothing
   is known. Provisional: it only has to prove that state drives behaviour. */
export function assetCrew(workerState, authored){
  const own = { clip: authored, pace: 1 }, idle = { clip: 'MC_IDLE', pace: 1 }, still = { clip: 'MC_IDLE', pace: 0 };
  switch(workerState){
    case 'working':     return own;                                                          // building: every role at work
    case 'surveying':   return authored === 'MC_WORKING' || authored === 'MC_SIGNAL' ? own : idle;   // planning
    case 'inspecting':  return authored === 'MC_WORKING' || authored === 'MC_SIGNAL' ? own : idle;   // needs QA: the clipboard and the signal
    case 'waiting':     return authored === 'MC_SIGNAL' ? own : idle;                        // needs a decision: one asks, the rest wait
    case 'idle':        return authored === 'MC_REPAIR' || authored === 'MC_ACTIVE' ? { clip: authored, pace: 0.7 } : idle;  // stable: upkeep and an easy run
    case 'celebrating': return authored === 'MC_SIGNAL' ? own : idle;                        // release ready: the signaller waves
    case 'warning':     return still;                                                        // blocked: work has stopped
    case 'quiet':       return still;                                                        // paused: at rest
    default:            return null;                                                         // no record: no worker
  }
}

/* ---------- the light ----------
   One studio rig for the whole world, from the Blender master
   (art/blender/scripts/mc_rig.py): a warm key sun, a weak cool fill from
   camera-right, a rim from behind, and the sky's gradient as ambient light.
   What is kept is the rig's split of the faces, not its angles: the face
   that fills the view is lit, the narrow face to its right is in shade, and
   cast shadows run to screen-right. Blender's camera sees two faces equally
   (45 degrees), so its key sits 95 degrees round from the camera; this
   camera sees the front face nearly square (13 degrees), and at 95 degrees
   the key would graze it and light a face nobody sees, so it sits 55
   degrees round, between the front and the hidden left side. Angles are
   relative to where the camera looks from. Intensities are physical (a sun
   of 5 is Blender's 5); colours are tokens. Since 0.9.0 it is daylight
   rather than blue hour: a stronger, warmer sun and a brighter sky over a
   bright city, the same split of the faces (the lit face still gets over
   three times the shade face's light), softer shadows. */
export const LIGHT = {
  key:  { turn: 55, elevation: 34, intensity: 5.8 },
  fill: { turn: -32, elevation: 24, intensity: 0.4 },
  rim:  { turn: -148, elevation: 34, intensity: 0.9 },
  sky: 0.6,                     // the sky's share, as Blender's world strength
  exposure: 1.05,
  status: 1.3,                  // a known status light's emission, bright enough to read in daylight; attention breathes round it
  shadowRefreshMs: 80,          // an animated worker's shadow follows it at about 12 a second,
  shadowMinPx: 240              // but only while its place is drawn at least this wide
};
/* A unit vector from the ground toward a light, in world axes. */
export function lightDirection(l){
  const cam = Math.atan2(TOWARD[2], TOWARD[0]), a = cam + l.turn * Math.PI / 180, e = l.elevation * Math.PI / 180;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
}
/* Where the camera looks from, on the ground: exported for the light's test. */
export function viewerDirection(){ return TOWARD.slice(); }

/* Where a life element's copy stands, before its motion: pulse and rise
   copies spread along a climb or around a ring. */
export function lifeOrigin(el, copy){
  const i = copy || 0, a = el.at;
  if(el.climb) return [a[0], a[1] + el.climb * i, a[2]];
  if(el.ring) return [a[0] + el.ring * Math.cos(i * 2.1), a[1], a[2] + el.ring * Math.sin(i * 2.1)];
  return a.slice();
}

/* Each station, in the crew's own frame. The worker stands at the origin
   facing +z, which CREW_FACING turns to the screen's left: a worker is seen
   in profile, so a raised or working arm reads at any size. +x is toward
   the camera and -x away, so nothing tall stands at +x, where it would hide
   the worker. Stations are the same everywhere, so they are built once and
   shared; none wears a project's colour. `hand` is what the worker holds. */
export const CREW_FACING = -Math.PI / 4;
export const STATIONS = {
  bench: { hand: 'hammer', parts: [
    box(0, 0, 0.62, 0.95, 0.5, 0.42, 'matte', 'wood'),
    box(0.1, 0.5, 0.62, 0.32, 0.14, 0.22, 'metal', 'steel'),
    box(-0.3, 0.5, 0.62, 0.2, 0.08, 0.18, 'matte', 'woodLight')
  ] },
  clipboard: { hand: 'clipboard', parts: [
    box(-0.55, 0, 0.4, 0.5, 0.45, 0.5, 'matte', 'wood', { r: [0, 0.3, 0] })
  ] },
  console: { hand: null, parts: [
    box(0, 0, 0.66, 0.36, 0.78, 0.3, 'metal', 'steel'),
    box(0, 0.78, 0.64, 0.46, 0.3, 0.05, 'glow', 'screen', { r: [-0.5, 0, 0] })
  ] },
  barrier: { hand: null, parts: [
    box(-0.55, 0, 0.62, 0.08, 0.62, 0.08, 'metal', 'steel'),
    box(0.35, 0, 0.62, 0.08, 0.62, 0.08, 'metal', 'steel'),
    box(-0.4, 0.44, 0.62, 0.3, 0.12, 0.05, 'matte', 'paper'),
    box(-0.1, 0.44, 0.62, 0.3, 0.12, 0.05, 'matte', 'ink'),
    box(0.2, 0.44, 0.62, 0.3, 0.12, 0.05, 'matte', 'paper')
  ] },
  valve: { hand: null, parts: [
    box(0, 0, 0.6, 0.12, 0.62, 0.12, 'metal', 'steel'),
    torus(0, 0.36, 0.6, 0.2, 0.035, 'metal', 'steel', { n: 16 }),
    box(-0.5, 0, 0.3, 0.45, 0.25, 0.26, 'matte', 'salmon', { r: [0, 0.5, 0] })
  ] },
  seat: { hand: null, parts: [
    cyl(0, 0, 0, 0.22, 0.4, 'matte', 'wood', { n: 12 })
  ] },
  blueprint: { hand: null, parts: [
    box(-0.3, 0, 0.62, 0.06, 0.6, 0.06, 'metal', 'steel'),
    box(0.3, 0, 0.62, 0.06, 0.6, 0.06, 'metal', 'steel'),
    box(0, 0.6, 0.55, 0.85, 0.04, 0.55, 'matte', 'blueprint', { r: [0.35, 0, 0] }),
    box(-0.1, 0.72, 0.52, 0.5, 0.01, 0.02, 'glow', 'screen', { r: [0.35, 0, 0] })
  ] },
  flag: { hand: null, parts: [
    cyl(-0.45, 0, 0.45, 0.03, 1.5, 'metal', 'steel', { n: 6 }),
    box(-0.22, 1.2, 0.45, 0.45, 0.28, 0.02, 'matte', 'paper')
  ] }
};

/* What a worker can hold, in the arm's own frame: the shoulder is the
   origin and the arm hangs down -y, so the hand is near y = -0.45. */
export const HAND_PROPS = {
  hammer: [
    box(0, -0.52, 0.1, 0.05, 0.05, 0.34, 'matte', 'wood'),
    box(0, -0.56, 0.27, 0.16, 0.12, 0.08, 'metal', 'steel')
  ],
  clipboard: [
    box(0, -0.62, 0.12, 0.24, 0.32, 0.03, 'matte', 'wood', { r: [-0.6, 0, 0] }),
    box(0, -0.6, 0.135, 0.2, 0.24, 0.01, 'matte', 'paper', { r: [-0.6, 0, 0] })
  ]
};

/* ---------- the island's own growth ----------
   Trees, pines, shrubs, rocks, flowers and grass between and around the
   districts, scattered from a fixed seed so the island is the same every
   time. Nothing grows on a pad or near the shore. Each kind is a small
   recipe drawn at the item's scale and turn. */
export const SCENERY = {
  tree:  [cyl(0, 0, 0, 0.16, 1.0, 'matte', 'bark', { n: 7 }), ball(0, 0.85, 0, 0.75, 'matte', 'leaf', { n: 8 }),
          ball(0.25, 1.45, 0.1, 0.5, 'matte', 'leafDark', { n: 8 })],
  pine:  [cyl(0, 0, 0, 0.12, 0.5, 'matte', 'bark', { n: 6 }), cone(0, 0.4, 0, 0.7, 1.0, 'matte', 'leafDark', { n: 7 }),
          cone(0, 0.95, 0, 0.52, 0.85, 'matte', 'leafDark', { n: 7 }), cone(0, 1.45, 0, 0.34, 0.7, 'matte', 'leaf', { n: 7 })],
  shrub: [ball(0, 0, 0, 0.42, 'matte', 'leaf', { n: 7, k: [1, 0.75, 1] }), ball(0.3, 0, 0.12, 0.3, 'matte', 'leafDark', { n: 7, k: [1, 0.75, 1] })],
  rock:  [rock(0, 0, 0, 0.42, 'matte', 'rock', { k: [1.2, 0.6, 1] }), rock(0.35, 0, 0.2, 0.22, 'matte', 'rock', { k: [1, 0.7, 1] })],
  bloom: [ball(0, 0, 0, 0.2, 'matte', 'leafDark', { n: 6, k: [1, 0.45, 1] }), ball(0.1, 0.06, 0, 0.07, 'matte', 'petal', { n: 5 }),
          ball(-0.08, 0.07, 0.06, 0.07, 'matte', 'petalLight', { n: 5 }), ball(0.02, 0.08, -0.1, 0.06, 'matte', 'petal', { n: 5 })],
  tuft:  [cone(0, 0, 0, 0.1, 0.35, 'matte', 'leaf', { n: 4 }), cone(0.12, 0, 0.05, 0.08, 0.28, 'matte', 'leafDark', { n: 4 })]
};
const KINDS = [['tree', 0.2], ['pine', 0.16], ['shrub', 0.2], ['rock', 0.08], ['bloom', 0.16], ['tuft', 0.12]];

export function mulberry(seed){
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* The island's growth: { kind, x, z, s, turn } items, and a pond or two in
   the widest gaps. Tall things keep a little further from the pads, so no
   tree hides a place. */
export function scatter(districts, island, seed){
  const rng = mulberry(seed || 7), items = [], ponds = [];
  const clearOf = (x, z, grow) => districts.every(d => !onPad(d, x, z, grow));
  const corners = [[island.minX + 5, island.maxZ - 5], [island.maxX - 5, island.minZ + 5]];
  corners.forEach(([x, z]) => { if(onIsland(island, x, z, 3) && clearOf(x, z, 3.2)) ponds.push({ x: x, z: z, r: 1.7 }); });
  const step = 2.3;
  for(let x = island.minX + 1; x < island.maxX; x += step){
    for(let z = island.minZ + 1; z < island.maxZ; z += step){
      const jx = x + (rng() - 0.5) * step * 0.9, jz = z + (rng() - 0.5) * step * 0.9, roll = rng();
      let kind = null, acc = 0;
      for(const [k, w] of KINDS){ acc += w; if(roll < acc){ kind = k; break; } }
      if(!kind || !onIsland(island, jx, jz, 1.6)) continue;
      const tall = kind === 'tree' || kind === 'pine';
      if(!clearOf(jx, jz, tall ? 1.6 : 0.6)) continue;
      if(ponds.some(p => Math.hypot(jx - p.x, jz - p.z) < p.r + (tall ? 1.4 : 0.5))) continue;
      items.push({ kind: kind, x: jx, z: jz, s: 0.8 + rng() * 0.55, turn: rng() * Math.PI * 2 });
    }
  }
  return { items: items, ponds: ponds };
}

/* ---------- the city between the places ----------
   One plan for any layout (rule 42: no ceiling, no special case). Every
   place stands in its own block, paved one curb above the road with a
   sidewalk round it. Rows are parted by a cross street, or once by the
   canal (canalAfter), which the city crosses on footbridges. The gap between
   two places in a row is a street or a planted lane, alternating from row
   to row, so the streets meet at offset corners rather than a grid. A ring
   road runs round the whole city inside a promenade at the shore; a short
   row's spare room is a paved square. Trees, lamps, benches, parked cars,
   crossings (only at street corners) and bollards (where a street ends at
   the water) follow from where those are. It is scenery: it knows
   positions, never a record, and the same layout is the same city every
   time. Everything is in world units; y 0 is the road. */
export function cityPlan(districts){
  const P = CITY.plinth, E = P + CITY.side, island = islandOf(districts);
  const byRow = new Map();
  districts.forEach(d => { if(!byRow.has(d.row)) byRow.set(d.row, []); byRow.get(d.row).push(d); });
  const rows = Array.from(byRow.keys()).sort((a, b) => a - b).map(r => {
    const ds = byRow.get(r).slice().sort((a, b) => a.x - b.x);
    return { r: r, z: ds[0].z, ds: ds, gaps: [] };
  });
  const inner = { minX: island.reach.minX - E, maxX: island.reach.maxX + E, minZ: island.reach.minZ - E, maxZ: island.reach.maxZ + E };
  const plan = { island: island, inner: inner, canal: null, paving: [], dashes: [], zebras: [], trees: [], lamps: [], benches: [],
                 cars: [], bollards: [], bridges: [], parapets: [], rails: [], bays: [], drive: null, walks: [] };
  if(!rows.length) return plan;
  const water = canalAfter(rows.length);
  if(water >= 0 && rows[water + 1]){
    const zc = (rows[water].z + rows[water + 1].z) / 2, w = CITY.canalWidth / 2;
    plan.canal = { minX: inner.minX, maxX: inner.maxX, minZ: zc - w, maxZ: zc + w, z: zc };
  }
  const hash = (a, b) => ((a * 73856093) ^ (b * 19349663)) >>> 0;
  const tree = (x, z, n) => plan.trees.push({ kind: n % 5 === 3 ? 'pine' : 'tree', x: x, z: z, s: 0.62 + (n * 37 % 7) * 0.035, turn: (n * 53 % 12) / 12 * Math.PI * 2 });
  let seq = 0;

  /* Each row: its gaps (a street where row and column are even together, a
     lane otherwise), and its paving, split only where a street runs. */
  rows.forEach((row, i) => {
    for(let k = 0; k + 1 < row.ds.length; k++){
      const a = row.ds[k], b = row.ds[k + 1];
      row.gaps.push({ x0: a.x + E, x1: b.x - E, cx: (a.x + b.x) / 2, lane: (i + Math.round(a.col)) % 2 === 1 });
    }
    let from = inner.minX;
    row.gaps.forEach(g => { if(!g.lane){ plan.paving.push({ minX: from, maxX: g.x0, minZ: row.z - E, maxZ: row.z + E }); from = g.x1; } });
    plan.paving.push({ minX: from, maxX: inner.maxX, minZ: row.z - E, maxZ: row.z + E });
  });
  /* Nothing tall stands in front of a place, where it would hide the place or its card. */
  const clear = (x, z) => !districts.some(d => Math.abs(x - d.x) < P + 0.4 && z > d.z + P - 0.2 && z < d.z + P + 4.2);

  /* Cross streets between rows; the canal where it runs. */
  rows.forEach((row, i) => {
    const next = rows[i + 1];
    if(!next) return;
    if(i === water && plan.canal){
      const c = plan.canal, above = { minX: inner.minX, maxX: inner.maxX, minZ: row.z + E, maxZ: c.minZ },
            below = { minX: inner.minX, maxX: inner.maxX, minZ: c.maxZ, maxZ: next.z - E };
      plan.paving.push(above, below);
      /* Footbridges where the lanes and streets run, or one in the middle. */
      const gaps = (row.gaps.length >= next.gaps.length ? row : next).gaps;
      const xs = gaps.length ? gaps.map(g => g.cx) : [(inner.minX + inner.maxX) / 2];
      xs.forEach(x => plan.bridges.push({ x: x, w: 2.2, minZ: c.minZ - 0.25, maxZ: c.maxZ + 0.25 }));
      /* Low walls along the water, open at each bridge; railings where the ring road passes its ends. */
      [c.minZ - 0.05, c.maxZ + 0.05].forEach(z => {
        let x = inner.minX;
        xs.slice().sort((p, q) => p - q).forEach(bx => { plan.parapets.push({ minX: x, maxX: bx - 1.1, z: z }); x = bx + 1.1; });
        plan.parapets.push({ minX: x, maxX: inner.maxX, z: z });
      });
      plan.rails = [{ x: inner.minX - 0.06, minZ: c.minZ, maxZ: c.maxZ }, { x: inner.maxX + 0.06, minZ: c.minZ, maxZ: c.maxZ }];
      /* A street that reaches the water ends in bollards. */
      row.gaps.filter(g => !g.lane).forEach(g => [-1, 0, 1].forEach(k => plan.bollards.push({ x: g.cx + k * 1.05, z: row.z + E + 0.25 })));
      next.gaps.filter(g => !g.lane).forEach(g => [-1, 0, 1].forEach(k => plan.bollards.push({ x: g.cx + k * 1.05, z: next.z - E - 0.25 })));
      /* The quays: benches facing the water in front of the row above, trees along the one behind the row below. */
      const qa = (above.minZ + above.maxZ) / 2, qb = (below.minZ + below.maxZ) / 2;
      row.ds.forEach(d => { plan.benches.push({ x: d.x - 2.1, z: qa + 0.25, turn: 0 }, { x: d.x + 2.1, z: qa + 0.25, turn: 0 });
                            plan.lamps.push({ x: d.x + P + 0.9, z: qa - 0.2 }); });
      for(let x = inner.minX + 1.4; x < inner.maxX - 1; x += 2.9){
        if(xs.some(bx => Math.abs(x - bx) < 1.9)) continue;
        tree(x, qb, seq++);
      }
      return;
    }
    const z0 = row.z + E, z1 = next.z - E, zc = (z0 + z1) / 2;
    for(let x = inner.minX + 1.7; x < inner.maxX - 1.5; x += 1.7) plan.dashes.push({ x: x, z: zc, len: 0.75, along: 'x' });
    /* Crossings at the street's two ends, where the outer sidewalks cross it. */
    [inner.minX + 0.75, inner.maxX - 0.75].forEach(x => plan.zebras.push({ x: x, z: zc, w: 1.1, len: z1 - z0, along: 'z' }));
    /* Parked cars at both curbs, clear of every street mouth. */
    [[row, z0 + 0.55, 1], [next, z1 - 0.55, -1]].forEach(([r, z, side]) => r.ds.forEach(d => {
      const off = ((hash(r.r + 3, Math.round(d.col * 2) + 5) % 3) - 1) * 2.6;
      const x = d.x + (off || 2.6 * side);
      if(r.gaps.some(g => !g.lane && Math.abs(x - g.cx) < (g.x1 - g.x0) / 2 + 1.4)) return;
      plan.cars.push({ x: x, z: z, turn: side > 0 ? Math.PI / 2 : -Math.PI / 2, n: hash(r.r, Math.round(d.col * 2)) % 5 });
    }));
  });

  /* More at the ring road's inner curb, beside the outer blocks and behind
     the back row (the service truck keeps to the lane outside them); one
     loading bay, with its truck, in the first street between two places. */
  rows.forEach(row => [-1, 1].forEach(s => {
    const off = ((hash(row.r + 11, s + 7) % 3) - 1) * 2.4;
    plan.cars.push({ x: s < 0 ? inner.minX - 0.55 : inner.maxX + 0.55, z: row.z + off, turn: s < 0 ? 0 : Math.PI, n: hash(row.r + 5, s + 3) % 5 });
  }));
  rows[0].ds.forEach(d => { if(hash(Math.round(d.col * 2) + 17, 3) % 2) plan.cars.push({ x: d.x - 1.8, z: inner.minZ - 0.55, turn: Math.PI / 2, n: hash(Math.round(d.col * 2), 9) % 5 }); });
  const street = rows.map(r => r.gaps.filter(g => !g.lane).map(g => ({ g: g, row: r }))).flat()[0];
  if(street) plan.bays.push({ x: street.g.cx - 0.75, z: street.row.z + 0.9, len: 3.0, w: 1.2, along: 'z' });

  /* Each street between two places: a centre line, bollards or crossings at its mouths. */
  rows.forEach((row, i) => row.gaps.forEach(g => {
    if(g.lane){
      /* A lane is planted down its middle. */
      for(let z = row.z - P + 1.4; z <= row.z + P - 1.2; z += 2.35) tree(g.cx, z, seq++);
      return;
    }
    for(let z = row.z - E + 1.9; z < row.z + E - 1.5; z += 1.6) plan.dashes.push({ x: g.cx, z: z, len: 0.75, along: 'z' });
    const top = i === 0 ? true : (i - 1 !== water), bottom = i === rows.length - 1 ? true : i !== water;
    if(top) plan.zebras.push({ x: g.cx, z: row.z - E + 0.75, w: 1.1, len: g.x1 - g.x0, along: 'x' });
    if(bottom) plan.zebras.push({ x: g.cx, z: row.z + E - 0.75, w: 1.1, len: g.x1 - g.x0, along: 'x' });
  }));

  /* Trees at the back corners of every block and along its outer sides;
     lamps where the ring road passes. */
  rows.forEach(row => row.ds.forEach((d, k) => {
    [-1, 1].forEach(s => { const x = d.x + s * (P + CITY.side / 2), z = d.z - P - CITY.side / 2 + 0.1; if(clear(x, z)) tree(x, z, seq++); });
    if(k === 0) plan.lamps.push({ x: inner.minX + 0.3, z: d.z });
    if(k === row.ds.length - 1) plan.lamps.push({ x: inner.maxX - 0.3, z: d.z });
  }));

  /* The promenade at the shore, planted all round but for the fronts of the
     places: never quite evenly, with now and then a gap, the same every time. */
  const walk = insetLoop(island, CITY.shore / 2), around = loopLength(walk);
  for(let s = 1.3, k = 0; s < around - 1; k++){
    const p = streetPose(walk, s / STREET_SPEED, 0), h = hash(k + 101, 37);
    if(h % 7 !== 3 && clear(p.x, p.z)) tree(p.x, p.z, seq++);
    s += 2.2 + (h % 5) * 0.28;
  }

  /* City life's ways: the truck's round the ring road, two people's on quiet sidewalks. */
  plan.drive = Object.assign(insetLoop(island, DRIVE.inset), { r: DRIVE.corner });
  plan.walks = walkWays(rows, P, E);
  return plan;
}
/* The island's outline pulled in by k, as a loop streetPose can follow. */
function insetLoop(island, k){
  return { minX: island.cx - island.a + k, maxX: island.cx + island.a - k, minZ: island.cz - island.b + k, maxZ: island.cz + island.b - k,
           r: Math.max(0.5, island.r - k) };
}
export function loopLength(b){
  const r = loopRadius(b);
  return 2 * (b.maxX - b.minX - 2 * r) + 2 * (b.maxZ - b.minZ - 2 * r) + 2 * Math.PI * r;
}
const loopRadius = b => Math.min(b.r === undefined ? 1.5 : b.r, (b.maxX - b.minX) / 4, (b.maxZ - b.minZ) / 4);

/* The plan as parts, merged by the renderer with the rest of the city. The
   island itself (its road, promenade, shore and canal) and the water are
   drawn from the plan by the renderer. */
export function cityParts(given){
  const plan = Array.isArray(given) ? cityPlan(given) : given, W0 = CITY.walk, out = [];
  plan.paving.forEach(p => {
    const w = p.maxX - p.minX, d = p.maxZ - p.minZ, cx = (p.minX + p.maxX) / 2, cz = (p.minZ + p.maxZ) / 2;
    if(!(w > 0.05 && d > 0.05)) return;
    out.push(box(cx, -0.03, cz, w, W0 + 0.03, d, 'matte', 'sidewalk', { bevel: 0.05 }));
    /* A curb stone along every edge, so the blocks read at any distance. */
    out.push(box(cx, W0, p.minZ + 0.07, w, 0.012, 0.14, 'matte', 'curb'), box(cx, W0, p.maxZ - 0.07, w, 0.012, 0.14, 'matte', 'curb'),
             box(p.minX + 0.07, W0, cz, 0.14, 0.012, d - 0.28, 'matte', 'curb'), box(p.maxX - 0.07, W0, cz, 0.14, 0.012, d - 0.28, 'matte', 'curb'));
  });
  plan.dashes.forEach(m => out.push(m.along === 'x' ? box(m.x, 0.002, m.z, m.len, 0.006, 0.09, 'matte', 'roadPaint')
                                                    : box(m.x, 0.002, m.z, 0.09, 0.006, m.len, 'matte', 'roadPaint')));
  /* A crossing's bars lie along the way people walk. */
  plan.zebras.forEach(c => {
    for(let k = -c.w / 2 + 0.12; k <= c.w / 2 - 0.1; k += 0.3){
      out.push(c.along === 'x' ? box(c.x, 0.002, c.z + k, c.len - 0.2, 0.006, 0.17, 'matte', 'roadPaint')
                               : box(c.x + k, 0.002, c.z, 0.17, 0.006, c.len - 0.2, 'matte', 'roadPaint'));
    }
  });
  /* A loading bay: its outline, and its truck, along the street. */
  plan.bays.forEach(b => {
    const bay = [box(0, 0.002, -b.len / 2, b.w, 0.006, 0.07, 'matte', 'roadPaint'), box(0, 0.002, b.len / 2, b.w, 0.006, 0.07, 'matte', 'roadPaint'),
                 box(-b.w / 2, 0.002, 0, 0.07, 0.006, b.len, 'matte', 'roadPaint'), box(b.w / 2, 0.002, 0, 0.07, 0.006, b.len, 'matte', 'roadPaint')];
    const turn = b.along === 'z' ? 0 : Math.PI / 2;
    out.push(...turned(bay, b.x, 0, b.z, turn, 1), ...turned(TRUCK_PARTS, b.x, 0, b.z, turn, 1));
  });
  plan.trees.forEach(t => out.push(...turned(SCENERY[t.kind], t.x, W0, t.z, t.turn, t.s)));
  plan.lamps.forEach(l => out.push(...lift(lamp(l.x, l.z, 2.2), W0)));
  plan.benches.forEach(b => out.push(...lift(bench(b.x, b.z, b.turn), W0)));
  plan.bollards.forEach(b => out.push(cyl(b.x, W0, b.z, 0.07, 0.32, 'matte', 'ink', { n: 6 })));
  plan.cars.forEach(c => out.push(...turned(CAR_PARTS[c.n % CAR_PARTS.length], c.x, 0, c.z, c.turn, 1)));
  plan.bridges.forEach(b => {
    const len = b.maxZ - b.minZ, cz = (b.minZ + b.maxZ) / 2;
    out.push(box(b.x, W0 - 0.2, cz, b.w, 0.26, len, 'matte', 'sidewalk', { bevel: 0.04 }),
             box(b.x, W0 - 0.32, cz, b.w - 0.3, 0.12, len - 0.3, 'matte', 'stone'));
    [-1, 1].forEach(s => out.push(box(b.x + s * (b.w / 2 - 0.07), W0 + 0.06, cz, 0.14, 0.24, len, 'matte', 'curb', { bevel: 0.03 })));
  });
  plan.parapets.forEach(p => { if(p.maxX - p.minX > 0.3) out.push(box((p.minX + p.maxX) / 2, W0, p.z, p.maxX - p.minX, 0.2, 0.1, 'matte', 'curb')); });
  (plan.rails || []).forEach(r => out.push(box(r.x, 0, (r.minZ + r.maxZ) / 2, 0.08, 0.34, r.maxZ - r.minZ + 0.2, 'metal', 'steel')));
  return out;
}
/* Parts stood somewhere: turned about y by `turn`, scaled by s, set down at
   (x, y, z). A part's own turn about y is kept; parts that lean (an x or z
   turn) are only the round kind, whose turn about y does not show. */
function turned(parts, x, y, z, turn, s){
  const c = Math.cos(turn), sn = Math.sin(turn);
  return parts.map(p => Object.assign({}, p, {
    p: [x + (p.p[0] * c + p.p[2] * sn) * s, y + p.p[1] * s, z + (-p.p[0] * sn + p.p[2] * c) * s],
    d: p.d.map(v => v * s), r: [p.r ? p.r[0] : 0, (p.r ? p.r[1] : 0) + turn, p.r ? p.r[2] : 0]
  }));
}
function lift(parts, y){ return parts.map(p => Object.assign({}, p, { p: [p.p[0], p.p[1] + y, p.p[2]] })); }

/* Parked cars, a few colours of the city's own. Along z, as the trucks. */
const car = (body, roof) => [
  mass(0, 0.14, 0, 0.84, 0.3, 1.78, body), mass(0, 0.42, -0.08, 0.74, 0.3, 0.98, roof),
  box(0, 0.47, 0.42, 0.66, 0.2, 0.02, 'metal', 'windowCool'), box(0, 0.47, -0.58, 0.66, 0.18, 0.02, 'metal', 'windowCool'),
  ...[-1, 1].flatMap(s => [cyl(s * 0.4, 0, -0.55, 0.16, 0.1, 'matte', 'ink', Object.assign({ n: 8 }, LIE_X)),
                           cyl(s * 0.4, 0, 0.55, 0.16, 0.1, 'matte', 'ink', Object.assign({ n: 8 }, LIE_X))])
];
export const CAR_PARTS = [car('paper', 'paper'), car('facadeCool', 'paper'), car('facadeWarm', 'facadeWarm'), car('ink', 'ink'), car('stone', 'paper')];

export const TRUCK_PARTS=[
  mass(0,.28,0,1.02,.16,2.28,'ink'),mass(0,.45,-.32,1.03,.91,1.45,'paper'),
  mass(0,.44,.7,1.01,.77,.66,'facadeCool'),box(0,.86,1.045,.79,.32,.02,'metal','windowCool'),
  box(-.515,.9,.73,.018,.25,.4,'metal','windowCool'),box(.515,.9,.73,.018,.25,.4,'metal','windowCool'),
  box(0,.58,-1.06,.9,.72,.02,'matte','curb'),box(0,.61,-1.075,.025,.63,.015,'matte','steel'),
  ...[-1,1].flatMap(side=>[cyl(side*.5,0,-.66,.23,.1,'matte','ink',LIE_X),cyl(side*.5,0,.7,.23,.1,'matte','ink',LIE_X),
    box(side*.34,.54,1.045,.19,.12,.035,'glow','window'),box(side*.34,.46,-1.1,.14,.09,.025,'glow','windowDim')])
];
/* A rounded rectangle as a way: four sides and four quarter turns,
   clockwise as seen, its corners as round as `b.r` (1.5 when unsaid), and
   the point and direction at distance s along it, continuous at every
   join. The promenade's trees are set out along one; the truck drives one. */
function roundRect(b){
  const r = loopRadius(b), wx = b.maxX - b.minX - 2 * r, wz = b.maxZ - b.minZ - 2 * r, arc = Math.PI * r / 2;
  const lengths = [wx, arc, wz, arc, wx, arc, wz, arc];
  return { r: r, lengths: lengths, total: lengths.reduce((a, c) => a + c, 0) };
}
function roundRectAt(b, rr, at){
  const x0 = b.minX, x1 = b.maxX, z0 = b.minZ, z1 = b.maxZ, r = rr.r, lengths = rr.lengths;
  let s = (at % rr.total + rr.total) % rr.total, i = 0;
  while(i < 7 && s > lengths[i]){ s -= lengths[i]; i++; }
  let x, z, dx, dz;
  if(i === 0){ x = x0 + r + s; z = z0; dx = 1; dz = 0; }
  else if(i === 2){ x = x1; z = z0 + r + s; dx = 0; dz = 1; }
  else if(i === 4){ x = x1 - r - s; z = z1; dx = -1; dz = 0; }
  else if(i === 6){ x = x0; z = z1 - r - s; dx = 0; dz = -1; }
  else {
    const turn = (i - 1) / 2, theta = -Math.PI / 2 + turn * Math.PI / 2 + s / r;
    const cx = turn === 0 || turn === 1 ? x1 - r : x0 + r, cz = turn < 1 || turn === 3 ? z0 + r : z1 - r;
    x = cx + r * Math.cos(theta); z = cz + r * Math.sin(theta); dx = -Math.sin(theta); dz = Math.cos(theta);
  }
  return { x: x, z: z, dx: dx, dz: dz };
}
/* Constant speed round a rounded rectangle; no project or state inputs. */
const STREET_SPEED = 1.1;
export function streetPose(bounds, time, offset){
  const p = roundRectAt(bounds, roundRect(bounds), (time + (offset || 0)) * STREET_SPEED);
  return { x: p.x, z: p.z, turn: Math.atan2(p.dx, p.dz) };
}

/* ---------- city life ----------
   One small service truck and two people: decorative, like the trees. Their
   ways are laid out from the places' positions alone (cityPlan), and where
   each is is a pure function of the world's one clock, the same every time,
   with no project, status or work input: they never stand for a session, a
   delivery, progress or a job. Nothing about them is stored.

   The truck is the city's box truck at DRIVE.scale, on the ring road's free
   lane (DRIVE.inset from the shore), keeping to the right, so it goes round
   the city anticlockwise as seen. Its corners are wider than the island's
   own (DRIVE.corner), so the whole truck, not only its middle, keeps clear
   of the promenade, its trees, the parked cars and every block round every
   turn; it slows for each turn and gathers speed after it, and never
   jitters. */
export const DRIVE = { scale: 0.85, inset: 1.8, corner: 3.6, speed: 1.15, turnSpeed: 0.72, ease: 1.8 };
const driveTables = new WeakMap();
function driveTable(b){
  let tb = driveTables.get(b);
  if(tb) return tb;
  const rr = roundRect(b), arcs = [], ds = 0.02;
  let acc = 0;
  rr.lengths.forEach((len, i) => { if(i % 2) arcs.push([acc, acc + len]); acc += len; });
  /* It sets off in the middle of the side nearest the viewer. */
  const start = rr.lengths.slice(0, 4).reduce((a, c) => a + c, 0) + rr.lengths[4] / 2;
  const toArc = s => arcs.reduce((m, [a0, a1]) => {
    const d = s >= a0 && s <= a1 ? 0 : Math.min(Math.abs(s - a0), Math.abs(s - a1), rr.total - Math.abs(s - a0), rr.total - Math.abs(s - a1));
    return Math.min(m, d);
  }, Infinity);
  const speedAt = s => { const k = Math.min(1, toArc(s) / DRIVE.ease), e = k * k * (3 - 2 * k); return DRIVE.turnSpeed + (DRIVE.speed - DRIVE.turnSpeed) * e; };
  const n = Math.ceil(rr.total / ds), time = new Float64Array(n + 1);
  for(let j = 1; j <= n; j++){
    const mid = ((start - (j - 0.5) * rr.total / n) % rr.total + rr.total) % rr.total;
    time[j] = time[j - 1] + rr.total / n / speedAt(mid);
  }
  tb = { rr: rr, start: start, time: time, n: n, period: time[n], speedAt: speedAt };
  driveTables.set(b, tb);
  return tb;
}
/* Where the truck is at time t (seconds): { x, z, turn, speed }, turn
   about y with 0 facing +z. */
export function driveAt(b, t){
  const tb = driveTable(b), T = tb.period, tt = (t % T + T) % T, time = tb.time;
  let lo = 0, hi = tb.n;
  while(hi - lo > 1){ const m = (lo + hi) >> 1; if(time[m] <= tt) lo = m; else hi = m; }
  const along = (lo + (tt - time[lo]) / (time[hi] - time[lo])) * tb.rr.total / tb.n;
  const s = ((tb.start - along) % tb.rr.total + tb.rr.total) % tb.rr.total, p = roundRectAt(b, tb.rr, s);
  return { x: p.x, z: p.z, turn: Math.atan2(-p.dx, -p.dz), speed: tb.speedAt(s) };
}
export function drivePeriod(b){ return driveTable(b).period; }

/* Two people, each on a straight stretch of quiet sidewalk of their own in
   a different row, never across a road: down a planted lane beside its
   trees, or along the camera's side of a street, on the left-hand block's
   sidewalk; a city of one column walks a place's outer sidewalk, between
   its lamp and its front corner. Each walks there and back at an easy pace
   of their own, easing into and out of every stop, stops now and then on
   the way, and turns round at each end while standing: never in step with
   the other, never a jump. WALK.cycle is the ground one stride pair covers,
   so the feet keep to it. */
export const WALK = { laneSide: 1.15, laneEnd: 0.8, backClear: 0.7, frontClear: 0.4, lampClear: 0.6, cycle: 0.565, ease: 0.45,
                      turnDelay: 0.35, turnTime: 0.9 };
/* The passers-by, authored in Blender from the crew's own figure
   (art/blender/workers/mc_walker.py) and exported like a place: one crew
   with a walk and a pause, and the metres one walk covers (`mc_stride`).
   Drawn at the places' scale: metres to world units as a place's platform
   (16.9 m, mc_platform.py) to its span. Budgeted like a place, smaller
   (the same numbers in export_glb.py); contract 30 checks the file. */
export const STREET = { url: './release/street-life.e0a6f770609c.glb', metre: 2 * CITY.plinth / 16.9, roles: ['walker_a', 'walker_b'] };
export const STREET_BUDGET = { triangles: 8000, drawCalls: 4, materials: 4, workers: 2, bytes: 250000, textures: 0 };
export const WALKERS = [
  { role: 'walker_a', speed: 0.46, endPause: 2.6, stop: 0.55, stopPause: 1.9 },
  { role: 'walker_b', speed: 0.52, endPause: 2.1, stop: 0.38, stopPause: 2.6 }
];
function walkWays(rows, P, E){
  const ways = [];
  rows.forEach(row => row.gaps.forEach(g => { if(g.lane) ways.push({ row: row.r, kind: 'lane', x: g.cx + WALK.laneSide, z0: row.z - E + WALK.laneEnd, z1: row.z + E - WALK.laneEnd }); }));
  rows.forEach(row => row.gaps.forEach(g => { if(!g.lane) ways.push({ row: row.r, kind: 'street', x: g.x0 - CITY.side / 2, z0: row.z - P + WALK.backClear, z1: row.z + P - WALK.frontClear }); }));
  rows.forEach(row => { const d = row.ds[row.ds.length - 1];
    ways.push({ row: row.r, kind: 'side', x: d.x + P + CITY.side / 2, z0: d.z + WALK.lampClear, z1: d.z + P - WALK.frontClear }); });
  const a = ways[0], b = ways.find(w => w.row !== a.row) || ways[1];
  return [a, b].filter(Boolean).map((w, i) => Object.assign({ kind: w.kind, row: w.row, points: [[w.x, w.z0], [w.x, w.z1]] }, WALKERS[i]));
}
/* One walker's day, as phases: a stop, a walk from one distance along its
   way to another, or a turn at an end, over and over. It starts standing at
   its stop, facing on, so a still world shows everyone standing somewhere
   sensible. */
const walkPlans = new WeakMap();
function walkPlan(w){
  let pl = walkPlans.get(w);
  if(pl) return pl;
  const [[ax, az], [bx, bz]] = w.points, L = Math.hypot(bx - ax, bz - az), v = w.speed, r = WALK.ease;
  const dur = d => Math.abs(d) / v + r, mid = L * w.stop;
  const phases = [
    { kind: 'stop', at: mid, dir: 1, secs: w.stopPause },
    { kind: 'walk', from: mid, to: L, secs: dur(L - mid) },
    { kind: 'turn', at: L, from: 1, to: -1, secs: w.endPause },
    { kind: 'walk', from: L, to: 0, secs: dur(L) },
    { kind: 'turn', at: 0, from: -1, to: 1, secs: w.endPause },
    { kind: 'walk', from: 0, to: mid, secs: dur(mid) }
  ];
  let t = 0;
  phases.forEach(p => { p.t0 = t; t += p.secs; });
  pl = { L: L, ux: (bx - ax) / L, uz: (bz - az) / L, ax: ax, az: az, phases: phases, period: t };
  walkPlans.set(w, pl);
  return pl;
}
/* Distance covered t seconds into a walk of D metres at speed v: easing
   from rest over WALK.ease seconds, walking, easing to rest. */
function eased(t, D, v){
  const r = WALK.ease, T = D / v + r, ramp = x => v * r * (x * x * x - x * x * x * x / 2);
  if(t <= 0) return 0;
  if(t >= T) return D;
  if(t < r) return ramp(t / r);
  if(t > T - r) return D - ramp((T - t) / r);
  return v * r / 2 + v * (t - r);
}
/* Where a walker is at time t: { x, z, turn, walking (0 standing .. 1 at
   pace), stride (metres walked since this walk began, for the feet) }. */
export function walkerAt(w, t){
  const pl = walkPlan(w), T = pl.period, tt = (t % T + T) % T;
  let p = pl.phases[0];
  for(const q of pl.phases) if(q.t0 <= tt) p = q;
  const u = tt - p.t0, face = dir => Math.atan2(pl.ux * dir, pl.uz * dir);
  let d, turn, walking = 0, stride = 0;
  if(p.kind === 'walk'){
    const D = Math.abs(p.to - p.from), dir = Math.sign(p.to - p.from) || 1, s = eased(u, D, w.speed);
    const r = WALK.ease, T0 = D / w.speed + r, k = x => Math.min(1, Math.max(0, x)), sm = x => x * x * (3 - 2 * x);
    d = p.from + dir * s; turn = face(dir); stride = s;
    walking = u < r ? sm(k(u / r)) : u > T0 - r ? sm(k((T0 - u) / r)) : 1;
  } else if(p.kind === 'turn'){
    const k = Math.min(1, Math.max(0, (u - WALK.turnDelay) / WALK.turnTime)), e = k * k * (3 - 2 * k);
    d = p.at; turn = face(p.from) + Math.PI * e * (p.from > 0 ? 1 : -1);
  } else { d = p.at; turn = face(p.dir); }
  return { x: pl.ax + pl.ux * d, z: pl.az + pl.uz * d, turn: Math.atan2(Math.sin(turn), Math.cos(turn)), walking: walking, stride: stride };
}
export function walkPeriod(w){ return walkPlan(w).period; }

/* ---------- each place's real height ----------
   How high a place reaches above its pad, in world units: its tallest part,
   the beacon's lamp, the crew and its life. Framing uses it, so a low place
   never pays for the tallest one. Conservative: a part counts as tall as its
   longest side when it is tipped over. */
const partTop = p => {
  const d = p.d, k = p.k || [1, 1, 1];
  const tipped = !!p.r && (Math.abs(p.r[0]) > 0.3 || Math.abs(p.r[2]) > 0.3);
  let h;
  switch(p.s){
    case 'box':   h = tipped ? Math.max(d[0], d[1], d[2]) : d[1] * k[1]; break;
    case 'cyl':   h = tipped ? d[0] * 2 : d[1] * k[1]; break;
    case 'cone':  h = d[1] * k[1]; break;
    case 'ball': case 'rock': h = d[0] * 2 * k[1]; break;
    case 'ring':  h = 0.02; break;
    default:      h = d[0] * 2;
  }
  return p.p[1] + h;
};
const HEIGHTS = {};
export function placeHeight(theme){
  const key = ENVIRONMENTS[theme] ? theme : 'generic';
  if(HEIGHTS[key] !== undefined) return HEIGHTS[key];
  const e = ENVIRONMENTS[key];
  let top = BEACON.mast + BEACON.lamp * 2.5, crew = 1.6 * TILE.crew / TILE.content;
  e.parts.forEach(p => { top = Math.max(top, partTop(p)); });
  (e.life || []).forEach(el => (el.parts || []).forEach(p => {
    const lift = el.kind === 'rise' || el.kind === 'drop' ? el.height : el.climb ? el.climb * ((el.copies || 1) - 1) : 0;
    top = Math.max(top, el.at[1] + lift + partTop(p) + 0.3);
  }));
  HEIGHTS[key] = TILE.padH + Math.max(top, crew) * TILE.content;
  return HEIGHTS[key];
}
/* Where an authored place's lowest point stands: its dark lower plinth
   just under the paving (CITY.sink), so what shows is its identity band,
   its ledge, its status rim and its deck. */
export function assetFloor(span){ return CITY.walk - 0.012 - span * CITY.sink; }
/* An authored place's height: from where it stands, its measured rise. */
export function assetHeight(theme){
  const a = ASSETS[theme];
  return a ? assetFloor(a.span) + a.span * a.rise : null;
}
