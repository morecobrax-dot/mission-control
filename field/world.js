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
   - DISTRICT: each project's own frame, turned 45 degrees so
     its buildings show a corner. Its local x runs to the lower
     right and z to the lower left; +x and +z faces are the ones
     seen. Recipes are written in it and drawn TILE.content times
     their written size.
   - FRAME: the camera, { x, z, d }: the ground point it looks at
     and its distance from it. Transient: never stored.
   ========================================================= */

export const WORLD = {
  fov: 30,                       // the lens, vertical, in degrees: gentle perspective, no fisheye
  pitch: 0.8,                    // about 46 degrees down onto the island
  yaw: -0.3,                     // turned about 17 degrees, so the island reads in depth
  tileTurn: -Math.PI / 4,        // a district's buildings show their corner
  stepX: 16,                     // world units between district centres across
  stepZ: 19,                     // and from row to row: a little more, for the labels
  margin: 6.5,                   // island beyond the outer districts
  islandDepth: 3.4,              // soil and rock under the grass
  minDist: 14, maxDist: 900,     // the closest and farthest the camera goes
  focusFill: 0.9,                // a focused district fills this share of the view
  minDistrictPx: 92,             // the overview never draws a district narrower than this; a larger island pans
  labelPx: 36,                   // a label's room under its district, in px, until the labels are measured
  sign: { w: 200, h: 72 },       // the tap sign's room above a focused district, in px, until it is measured
  edgePx: 12,                    // breathing room at the viewport's edges, in px
  transitionMs: 420,             // a focus or overview flight: interruptible, instant under Reduce Motion
  slopPx: 8,                     // movement that turns a touch into a pan
  frameMinMs: 15,                // at most about 60 frames a second, even on a 120 Hz screen
  ambientSeconds: 300,           // life settles after five minutes untouched, until someone touches it again
  maxPixelRatio: 2, minPixelRatio: 1, maxCanvasPixels: 2500000,
  slowFrameMs: 21                // frames slower than this, for a second, lower the drawing resolution a step
};

/* Budgets set before building, reported by render3d.js and checked in the
   browser QA: at overview, with the six registered projects. */
export const BUDGET = { drawCalls: 140, triangles: 160000, threeGzipBytes: 160000 };

/* A district: its pad (a square of half side `pad` in its own frame, so a
   diamond on the island), the scale its recipe is drawn at, and its crew. */
export const TILE = { pad: 5.2, padH: 0.22, content: 1.45, crew: 1.8, reach: 3.35 };
const R2 = Math.SQRT2, EXTENT = TILE.pad * R2;          // a pad's half diagonal on the island

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

/* District centres in registry order, a grid with a short last row centred.
   Row 0 is farthest from the viewer, so reading order runs back to front,
   left to right. Adding a project adds a district, never a special case. */
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

/* The rectangle the island covers, and the one the camera may look at. */
export function islandOf(districts){
  if(!districts.length) return { minX: -12, maxX: 12, minZ: -12, maxZ: 12, cx: 0, cz: 0, a: 12, b: 12, reach: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  districts.forEach(d => { minX = Math.min(minX, d.x); maxX = Math.max(maxX, d.x); minZ = Math.min(minZ, d.z); maxZ = Math.max(maxZ, d.z); });
  const m = EXTENT + WORLD.margin;
  return { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
           a: (maxX - minX) / 2 + m, b: (maxZ - minZ) / 2 + m, reach: { minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ } };
}

/* The island's shore: a soft-cornered rectangle (a superellipse), as points
   around it. `inset` pulls it in, for what grows on it. */
const SHAPE = 5;
export function islandOutline(island, segments, inset){
  const n = segments || 72, a = island.a - (inset || 0), b = island.b - (inset || 0), pts = [];
  for(let i = 0; i < n; i++){
    const t = i / n * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    pts.push([island.cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / SHAPE), island.cz + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / SHAPE)]);
  }
  return pts;
}
export function onIsland(island, x, z, inset){
  const a = island.a - (inset || 0), b = island.b - (inset || 0);
  return Math.pow(Math.abs((x - island.cx) / a), SHAPE) + Math.pow(Math.abs((z - island.cz) / b), SHAPE) <= 1;
}

/* Inside a district's pad: its diamond on the island. */
export function onPad(d, x, z, grow){ return Math.abs(x - d.x) + Math.abs(z - d.z) <= EXTENT + (grow || 0); }

/* The points that frame a district: its pad at the grass, a narrower top at
   its tallest, the label's anchor at the pad's nearest corner and, when
   focused, the sign's anchor above its roof. `room` is the label's px
   ({ w, h }); `sign` the sign's ({ w, h }), above. */
export function districtPoints(d, height, room, sign){
  const e = EXTENT, t = e * 0.55, h = height;
  const pts = [[d.x + e, 0, d.z], [d.x - e, 0, d.z], [d.x, 0, d.z + e], [d.x, 0, d.z - e],
               [d.x + t, h, d.z], [d.x - t, h, d.z], [d.x, h, d.z + t], [d.x, h, d.z - t]].map(p => ({ p: p }));
  const r = room || { w: 96, h: WORLD.labelPx };
  pts.push({ p: labelAnchor(d), w: r.w / 2, down: r.h });
  if(sign) pts.push({ p: signAnchor(d, height), w: sign.w / 2, up: sign.h });
  return pts;
}
export function labelAnchor(d){ return [d.x + TOWARD[0] * EXTENT * 0.8, TILE.padH, d.z + TOWARD[2] * EXTENT * 0.8]; }
/* Over the back of the pad, where the tallest structures stand, so the sign
   floats above them rather than across them. */
export function signAnchor(d, height){ return [d.x - TOWARD[0] * EXTENT * 0.45, height + 0.8, d.z - TOWARD[2] * EXTENT * 0.45]; }

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
   goes to fewer columns, which keeps reading order simple. `heights` and
   `rooms` are per district (placeHeight, measured labels). */
export function chooseLayout(count, W, H, heights, rooms){
  const n = Math.max(1, count | 0);
  let best = null;
  for(let c = 1; c <= Math.min(n, 8); c++){
    const lay = layoutDistricts(n, c), o = overview(lay.districts, heights, rooms, W, H);
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
function overview(districts, heights, rooms, W, H){
  const pts = [], island = islandOf(districts);
  districts.forEach((d, i) => pts.push.apply(pts, districtPoints(d, at(heights, i, 3), at(rooms, i, null))));
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

/* A focused district: close enough to fill the view with it, its label and
   its sign (as measured, when it has been), never farther than the overview. */
export function focusFrame(d, height, room, overview, W, H, sign){
  const f = fitFrame(districtPoints(d, height, room, sign || WORLD.sign), W, H, WORLD.focusFill);
  return { x: f.x, z: f.z, d: Math.max(WORLD.minDist, Math.min(f.d, overview ? overview.d : f.d)) };
}

/* The camera looks only at the island: its target stays within a pad's
   reach of the districts, and its distance in range. */
export function clampFrame(f, island){
  const r = island.reach, m = EXTENT;
  return { x: Math.min(Math.max(f.x, r.minX - m), r.maxX + m), z: Math.min(Math.max(f.z, r.minZ - m), r.maxZ + m),
           d: Math.min(Math.max(f.d, WORLD.minDist), WORLD.maxDist) };
}

/* A drag of dx, dy px: the island follows the finger, within its bounds. */
export function panFrame(f, dx, dy, W, H, island){ return clampFrame(shiftPx(f, -dx, -dy, H), island); }

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

/* ---------- flights ---------- */
export function sameFrame(a, b){
  return !!a && !!b && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.z - b.z) < 1e-3 && Math.abs(a.d - b.d) / b.d < 1e-3;
}
export function easeInOut(t){ const k = Math.min(1, Math.max(0, t)); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
/* Between two frames: the target glides, the distance changes in log
   space, so a flight in never lurches. */
export function mixFrame(a, b, t){
  const k = easeInOut(t);
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, d: Math.exp(Math.log(a.d) + (Math.log(b.d) - Math.log(a.d)) * k) };
}

/* ---------- the drawing buffer ----------
   Sharp on a phone, never more than two device pixels per CSS pixel, and
   never a buffer so large a tablet pays for it. When frames run slow for a
   second, the next step down; never back up within a visit. */
export function pixelRatioFor(dpr, w, h){
  const area = Math.max(1, w * h);
  return Math.max(0.5, Math.min(dpr || 1, WORLD.maxPixelRatio, Math.sqrt(WORLD.maxCanvasPixels / area)));
}
export function nextPixelRatio(current){
  const steps = [2, 1.75, 1.5, 1.25, 1];
  const below = steps.filter(s => s < current - 1e-6);
  return below.length ? Math.max(WORLD.minPixelRatio, below[0]) : current;
}

/* ---------- labels ----------
   Every project keeps a real button; this only decides which labels can be
   read at once. The focused and selected labels win, then nearer rows (which
   the camera draws in front), then registry order; a label that would overlap
   one already placed is hidden, and a hidden or off-screen label takes no taps.
   Each rect is { id, x, y, w, h, row } in px. */
export function resolveLabels(rects, first, viewW, viewH){
  const lead = [].concat(first).filter(Boolean);
  const rank = r => { const i = lead.indexOf(r.id); return i === -1 ? lead.length : i; };
  const order = rects.slice().sort((a, b) =>
    rank(a) - rank(b) || b.row - a.row || rects.indexOf(a) - rects.indexOf(b));
  const placed = [], shown = {};
  order.forEach(r => {
    const inView = r.x >= 0 && r.x + r.w <= viewW && r.y >= 0 && r.y + r.h <= viewH;
    const clear = placed.every(p => r.x >= p.x + p.w || p.x >= r.x + r.w || r.y >= p.y + p.h || p.y >= r.y + r.h);
    shown[r.id] = inView && clear;
    if(shown[r.id]) placed.push(r);
  });
  return shown;
}

/* ---------- gestures ----------
   One arbiter for the viewport. The first pointer owns the gesture; others
   are ignored until it ends. Until it has moved WORLD.slopPx it is a tap in
   waiting; past that it is a pan for the rest of its life, and the click it
   would otherwise make is swallowed: a drag never opens a brief. A cancel or
   a lost capture ends it with no tap. */
export function createArbiter(slop){
  const limit = slop === undefined ? WORLD.slopPx : slop;
  let g = null;
  return {
    down(id, x, y){
      if(g) return null;
      g = { id: id, x0: x, y0: y, x: x, y: y, panning: false };
      return { type: 'down' };
    },
    move(id, x, y){
      if(!g || g.id !== id) return null;
      if(!g.panning){
        if(Math.hypot(x - g.x0, y - g.y0) <= limit) return null;
        g.panning = true;
        const out = { type: 'pan-start', dx: x - g.x0, dy: y - g.y0 };
        g.x = x; g.y = y;
        return out;
      }
      const out = { type: 'pan', dx: x - g.x, dy: y - g.y };
      g.x = x; g.y = y;
      return out;
    },
    up(id){
      if(!g || g.id !== id) return null;
      const out = { type: g.panning ? 'pan-end' : 'tap', x: g.x0, y: g.y0 };
      g = null;
      return out;
    },
    cancel(id){
      if(!g || (id !== undefined && g.id !== id)) return null;
      const out = { type: g.panning ? 'pan-end' : 'cancel' };
      g = null;
      return out;
    },
    busy(){ return !!g; },
    panning(){ return !!(g && g.panning); }
  };
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
  shade: '--iso-shade', lightKey: '--light-key', lightSky: '--light-sky', lightGround: '--light-ground'
};
/* Matte is lit and flat-shaded; metal adds a restrained highlight; glow is
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
function pane(x, y, z, w, h, face){
  if(face === 'x') return [box(x + 0.012, y - 0.05, z, 0.03, h + 0.1, w + 0.1, 'matte', 'ink'), box(x + 0.03, y, z, 0.02, h, w, 'glow', 'window'),
                           box(x + 0.06, y - 0.07, z, 0.08, 0.04, w + 0.14, 'matte', 'paper')];
  return [box(x, y - 0.05, z + 0.012, w + 0.1, h + 0.1, 0.03, 'matte', 'ink'), box(x, y, z + 0.03, w, h, 0.02, 'glow', 'window'),
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
export const ENVIRONMENTS = {
  /* A training hall with a barrel roof inside an oval running track, where
     a runner laps; a weights rack and water in the infield, bleachers at
     the back, cones at the edge. */
  track: {
    crew: { x: 0.95, z: 0.8 },
    parts: [
      ring(0.1, 0.01, 0.1, 2.15, 3.0, 'matte', 'tint', { k: [1.08, 1, 0.8], n: 56 }),
      ring(0.1, 0.022, 0.1, 2.55, 2.6, 'matte', 'paper', { k: [1.08, 1, 0.8], n: 56 }),
      ring(0.1, 0.022, 0.1, 2.93, 2.97, 'matte', 'paper', { k: [1.08, 1, 0.8], n: 56 }),
      box(3.02, 0.022, 0.1, 0.9, 0.012, 0.07, 'matte', 'paper'),
      box(-0.5, 0, -0.45, 2.5, 0.14, 1.55, 'matte', 'ink'),
      box(-0.5, 0.14, -0.45, 2.3, 1.11, 1.35, 'matte', 'stone'),
      box(-0.5, 1.25, -0.45, 2.5, 0.16, 1.55, 'matte', 'ink'),
      cyl(-0.5, 1.33, -0.45, 0.62, 2.2, 'matte', 'tint', { r: [0, 0, Math.PI / 2], n: 16, k: [1, 1, 0.9] }),
      cyl(-1.45, 1.33, -0.45, 0.64, 0.06, 'matte', 'ink', { r: [0, 0, Math.PI / 2], n: 16, k: [1, 1, 0.92] }),
      cyl(-0.5, 1.33, -0.45, 0.64, 0.06, 'matte', 'ink', { r: [0, 0, Math.PI / 2], n: 16, k: [1, 1, 0.92] }),
      cyl(0.45, 1.33, -0.45, 0.64, 0.06, 'matte', 'ink', { r: [0, 0, Math.PI / 2], n: 16, k: [1, 1, 0.92] }),
      ...door(-1.3, 0.24, 0.42, 0.72, 'z', 'tint'),
      box(-1.3, 0.95, 0.27, 0.5, 0.16, 0.03, 'matte', 'paper'),
      ...pane(-0.55, 0.42, 0.24, 0.5, 0.42),
      ...pane(0.15, 0.42, 0.24, 0.5, 0.42),
      ...pane(0.66, 0.42, -0.45, 0.8, 0.4, 'x'),
      box(0.2, 1.41, -0.95, 0.24, 0.18, 0.24, 'metal', 'steel'),
      box(1.8, 0, -2.45, 1.5, 0.2, 0.95, 'matte', 'wood', { r: [0, 0.35, 0] }),
      box(1.72, 0.2, -2.62, 1.5, 0.2, 0.6, 'matte', 'wood', { r: [0, 0.35, 0] }),
      box(1.66, 0.4, -2.76, 1.5, 0.2, 0.3, 'matte', 'wood', { r: [0, 0.35, 0] }),
      box(-1.25, 0, 1.0, 0.07, 0.85, 0.07, 'metal', 'steel'),
      box(-1.25, 0, 1.6, 0.07, 0.85, 0.07, 'metal', 'steel'),
      box(-1.25, 0.68, 1.3, 0.05, 0.05, 1.15, 'metal', 'steel'),
      cyl(-1.25, 0.47, 0.82, 0.26, 0.09, 'matte', 'ink', LIE_Z),
      cyl(-1.25, 0.47, 1.78, 0.26, 0.09, 'matte', 'ink', LIE_Z),
      cyl(-0.3, 0, 1.45, 0.16, 0.5, 'matte', 'screen', { n: 10 }),
      cyl(-0.3, 0.5, 1.45, 0.1, 0.12, 'matte', 'paper', { n: 10 }),
      cone(3.25, 0, 1.3, 0.12, 0.3, 'matte', 'salmon', { n: 8 }),
      cone(3.25, 0, -1.1, 0.12, 0.3, 'matte', 'salmon', { n: 8 }),
      cone(-3.1, 0, 0.1, 0.12, 0.3, 'matte', 'salmon', { n: 8 }),
      ...planter(-2.2, -1.6, 1)
    ],
    life: [
      { kind: 'orbit', at: [0.1, 0.03, 0.1], rx: 2.78, rz: 2.06, speed: 0.5, copies: 2, spread: Math.PI * 0.9, face: true, rig: 'runner' }
    ]
  },
  /* A scheduling studio: a day's timeline across its wall, blocks of time
     in rows with a line for now that moves across them, a clock whose hand
     turns, an awning over the door, and a planning desk outside. */
  calendar: {
    crew: { x: 1.4, z: 1.5 },
    parts: [
      box(-0.7, 0, -1.2, 3.2, 0.14, 1.8, 'matte', 'ink'),
      box(-0.7, 0.14, -1.2, 3.0, 1.96, 1.6, 'matte', 'stone'),
      box(-0.7, 2.1, -1.2, 3.3, 0.16, 1.9, 'matte', 'tint'),
      box(-0.7, 2.26, -1.2, 3.0, 0.1, 1.6, 'matte', 'ink'),
      box(-1.6, 2.36, -1.6, 0.5, 0.3, 0.4, 'metal', 'steel'),
      box(-0.7, 0.3, -0.39, 2.7, 1.5, 0.03, 'matte', 'board'),
      box(-0.7, 0.26, -0.37, 2.8, 0.06, 0.06, 'matte', 'paper'),
      box(-1.55, 1.42, -0.36, 0.7, 0.24, 0.03, 'glow', 'window'),
      box(-0.7, 1.42, -0.36, 0.55, 0.24, 0.03, 'glow', 'screen'),
      box(0.12, 1.42, -0.36, 0.6, 0.24, 0.03, 'glow', 'window'),
      box(-1.45, 1.02, -0.36, 0.9, 0.24, 0.03, 'glow', 'screen'),
      box(-0.2, 1.02, -0.36, 0.95, 0.24, 0.03, 'glow', 'window'),
      box(-1.7, 0.62, -0.36, 0.5, 0.24, 0.03, 'glow', 'window'),
      box(-0.95, 0.62, -0.36, 0.7, 0.24, 0.03, 'glow', 'screen'),
      box(0.25, 0.62, -0.36, 0.4, 0.24, 0.03, 'glow', 'window'),
      cyl(0.83, 1.05, -1.2, 0.42, 0.06, 'matte', 'paper', LIE_X),
      torus(0.87, 1.05, -1.2, 0.42, 0.04, 'matte', 'ink', { n: 24, r: [0, Math.PI / 2, 0] }),
      ...door(0.8, -1.55, 0.5, 0.8, 'x', 'tint'),
      box(1.02, 0.95, -1.55, 0.4, 0.05, 0.8, 'matte', 'tint'),
      ...pane(0.83, 0.45, -0.55, 0.45, 0.35, 'x'),
      box(2.1, 0, -0.35, 0.55, 0.55, 1.1, 'matte', 'wood'),
      box(2.1, 0.55, -0.35, 0.06, 0.38, 0.62, 'glow', 'screen'),
      box(2.1, 0.55, 0.05, 0.3, 0.04, 0.2, 'matte', 'paper'),
      box(2.55, 0, -0.35, 0.3, 0.42, 0.3, 'matte', 'ink'),
      box(-2.3, 0, 1.5, 0.5, 0.35, 0.5, 'matte', 'ink'),
      ball(-2.3, 0.35, 1.5, 0.3, 'matte', 'nori'),
      ...planter(-2.4, -0.1, 1.1),
      ...bench(-0.6, 1.2, 0.2),
      ...lamp(2.6, 1.3, 1.2)
    ],
    life: [
      { kind: 'slide', at: [-0.7, 0.34, -0.34], dir: [1, 0, 0], amp: 1.15, speed: 0.22, parts: [box(0, 0, 0, 0.04, 1.44, 0.03, 'matte', 'paper')] },
      { kind: 'spin', at: [0.92, 1.47, -1.2], axis: 'x', speed: -0.8, parts: [box(0, 0, 0.1, 0.02, 0.03, 0.26, 'matte', 'ink')] },
      { kind: 'pulse', at: [2.1, 0.75, -0.35], speed: 1.2, parts: [box(0, 0, 0, 0.07, 0.12, 0.12, 'glow', 'screen')] }
    ]
  },
  /* A reading pavilion and its library: two walls of shelves meeting at the
     back, a ladder against them, a rug, a lectern whose open book turns its
     pages, a reading chair and lamp, a globe, stacks of books, and a still
     pool beside it. */
  book: {
    crew: { x: 1.6, z: 1.4 },
    parts: [
      box(-0.8, 0, -0.8, 3.1, 0.14, 3.1, 'matte', 'stone'),
      box(-0.8, 0.14, -0.8, 2.8, 0.12, 2.8, 'matte', 'stone'),
      box(-0.75, 0.26, -2.02, 2.7, 1.8, 0.36, 'matte', 'wood'),
      box(-2.02, 0.26, -0.75, 0.36, 1.8, 2.7, 'matte', 'wood'),
      box(-0.75, 2.06, -2.02, 2.9, 0.16, 0.5, 'matte', 'tint'),
      box(-2.02, 2.06, -0.75, 0.5, 0.16, 2.9, 'matte', 'tint'),
      box(-0.75, 0.9, -1.83, 2.5, 0.05, 0.03, 'matte', 'ink'),
      box(-0.75, 1.5, -1.83, 2.5, 0.05, 0.03, 'matte', 'ink'),
      box(-1.83, 0.9, -0.75, 0.03, 0.05, 2.5, 'matte', 'ink'),
      box(-1.83, 1.5, -0.75, 0.03, 0.05, 2.5, 'matte', 'ink'),
      ...spines(-1.95, 0.45, 0.4, -1.83, 'x'),
      ...spines(-1.95, 0.45, 0.97, -1.83, 'x'),
      ...spines(-1.95, 0.45, 1.56, -1.83, 'x'),
      ...spines(-1.6, 0.45, 0.4, -1.83, 'z'),
      ...spines(-1.6, 0.45, 0.97, -1.83, 'z'),
      cyl(0.62, 0.26, -2.02, 0.13, 1.8, 'matte', 'paper', { n: 10 }),
      cyl(-2.02, 0.26, 0.62, 0.13, 1.8, 'matte', 'paper', { n: 10 }),
      box(0.1, 0.26, -1.75, 0.05, 1.7, 0.05, 'matte', 'woodLight', { r: [0.2, 0, 0] }),
      box(0.4, 0.26, -1.75, 0.05, 1.7, 0.05, 'matte', 'woodLight', { r: [0.2, 0, 0] }),
      box(0.25, 0.6, -1.66, 0.3, 0.03, 0.04, 'matte', 'woodLight'),
      box(0.25, 1.0, -1.74, 0.3, 0.03, 0.04, 'matte', 'woodLight'),
      box(0.25, 1.4, -1.82, 0.3, 0.03, 0.04, 'matte', 'woodLight'),
      box(-0.6, 0.26, -0.6, 1.5, 0.015, 1.1, 'matte', 'tint', { r: [0, 0.2, 0] }),
      box(-0.6, 0.27, -0.6, 0.34, 0.74, 0.34, 'matte', 'wood'),
      box(-0.74, 1.01, -0.6, 0.3, 0.04, 0.46, 'matte', 'paper', { r: [0, 0, -0.18] }),
      box(-0.46, 1.01, -0.6, 0.3, 0.04, 0.46, 'matte', 'paper', { r: [0, 0, 0.18] }),
      box(-1.4, 0.26, 0.3, 0.55, 0.3, 0.55, 'matte', 'salmon'),
      box(-1.62, 0.56, 0.3, 0.12, 0.45, 0.55, 'matte', 'salmon'),
      box(-1.25, 0.26, -0.1, 0.05, 1.0, 0.05, 'metal', 'steel'),
      ball(-1.25, 1.2, -0.1, 0.14, 'glow', 'window'),
      cone(-1.25, 1.24, -0.1, 0.2, 0.16, 'matte', 'ink', { n: 10 }),
      cyl(0.2, 0.26, 0.2, 0.05, 0.5, 'metal', 'steel', { n: 6 }),
      ball(0.2, 0.72, 0.2, 0.2, 'matte', 'water'),
      torus(0.2, 0.72, 0.2, 0.23, 0.02, 'metal', 'gold', { n: 20, r: [0.4, 0, 0] }),
      box(-0.3, 0.27, 0.5, 0.3, 0.1, 0.22, 'matte', 'tint'),
      box(-0.3, 0.37, 0.5, 0.26, 0.08, 0.2, 'matte', 'paper'),
      box(-0.28, 0.45, 0.5, 0.24, 0.09, 0.18, 'matte', 'blueprint'),
      cyl(2.0, 0, -1.0, 0.8, 0.05, 'metal', 'water', { n: 24 }),
      torus(2.0, 0, -1.0, 0.86, 0.07, 'matte', 'stone', { n: 24, k: [1, 1, 1], r: [Math.PI / 2, 0, 0] }),
      cyl(1.8, 0.05, -1.2, 0.14, 0.015, 'matte', 'leaf', { n: 8 }),
      cyl(2.25, 0.05, -0.8, 0.1, 0.015, 'matte', 'leaf', { n: 8 }),
      ...flowers(2.1, 0.3),
      ...flowers(2.9, -1.7),
      ...lamp(-2.7, 1.9, 1.1)
    ],
    life: [
      { kind: 'swing', at: [-0.6, 1.05, -0.6], axis: 'z', base: -Math.PI / 2 + 0.15, amp: Math.PI / 2 - 0.25, speed: 0.9,
        parts: [box(0.15, 0, 0, 0.3, 0.01, 0.42, 'matte', 'paper')] },
      { kind: 'pulse', at: [-1.25, 1.2, -0.1], speed: 0.6, parts: [ball(0, -0.06, 0, 0.08, 'glow', 'window')] }
    ]
  },
  /* A finance workspace: a vault with a round door whose wheel turns,
     pillars and steps, stacks of coins where a coin drops now and then, and
     a desk with an open ledger under a lamp. */
  vault: {
    crew: { x: 1.4, z: 1.5 },
    parts: [
      box(-0.9, 0, -1.2, 3.0, 0.14, 2.1, 'matte', 'ink'),
      box(-0.9, 0.14, -1.2, 2.7, 2.06, 1.8, 'matte', 'stone'),
      box(-0.9, 2.2, -1.2, 2.95, 0.18, 2.05, 'matte', 'ink'),
      cone(-0.9, 2.38, -1.2, 1.9, 0.5, 'matte', 'stone', { n: 4, r: [0, Math.PI / 4, 0], k: [1, 1, 0.72], shade: 0.8 }),
      box(-0.9, 0, -0.1, 1.9, 0.08, 0.5, 'matte', 'stone'),
      box(-0.9, 0.08, -0.14, 1.6, 0.08, 0.4, 'matte', 'stone'),
      cyl(-1.95, 0.14, -0.2, 0.13, 2.06, 'matte', 'paper', { n: 10 }),
      cyl(0.15, 0.14, -0.2, 0.13, 2.06, 'matte', 'paper', { n: 10 }),
      cyl(-0.9, 0.3, -0.21, 0.8, 0.14, 'metal', 'steel', Object.assign({ n: 28 }, LIE_Z)),
      torus(-0.9, 0.3, -0.12, 0.78, 0.04, 'metal', 'gold', { n: 28 }),
      box(-0.9, 1.9, -0.29, 1.6, 0.1, 0.03, 'glow', 'window'),
      ...pane(0.47, 1.1, -1.2, 0.8, 0.5, 'x'),
      cyl(1.7, 0, -1.6, 0.32, 0.55, 'metal', 'gold', { n: 16 }),
      cyl(2.2, 0, -1.0, 0.3, 0.85, 'metal', 'gold', { n: 16 }),
      cyl(1.55, 0, -0.75, 0.28, 0.32, 'metal', 'gold', { n: 16 }),
      cyl(2.3, 0, -1.75, 0.22, 0.2, 'metal', 'gold', { n: 14 }),
      box(-1.9, 0, 1.55, 1.2, 0.55, 0.7, 'matte', 'wood'),
      box(-1.9, 0.55, 1.55, 0.85, 0.04, 0.5, 'matte', 'paper'),
      box(-1.9, 0.59, 1.55, 0.02, 0.01, 0.46, 'matte', 'ink'),
      box(-1.7, 0.59, 1.5, 0.3, 0.005, 0.02, 'matte', 'ink'),
      box(-2.1, 0.59, 1.6, 0.3, 0.005, 0.02, 'matte', 'ink'),
      box(-2.4, 0.55, 1.35, 0.06, 0.4, 0.06, 'metal', 'steel'),
      ball(-2.4, 0.9, 1.35, 0.12, 'glow', 'window'),
      box(-1.9, 0, 2.2, 0.45, 0.4, 0.4, 'matte', 'woodLight'),
      box(-1.9, 0.4, 2.38, 0.45, 0.4, 0.06, 'matte', 'woodLight'),
      ...planter(0.9, 0.5, 1),
      ...planter(-2.6, -0.2, 0.9),
      ...lamp(2.7, 1.1, 1.2)
    ],
    life: [
      { kind: 'spin', at: [-0.9, 1.1, -0.06], axis: 'z', speed: 0.45, parts: [
        cyl(0, -0.26, 0, 0.26, 0.1, 'metal', 'tint', Object.assign({ n: 16 }, LIE_Z)),
        box(0, -0.03, 0.03, 1.1, 0.06, 0.05, 'metal', 'steel'), box(0, -0.55, 0.03, 0.06, 1.1, 0.05, 'metal', 'steel')] },
      { kind: 'drop', at: [2.2, 0.85, -1.0], height: 1.6, speed: 0.9, parts: [cyl(0, 0, 0, 0.3, 0.06, 'metal', 'gold', { n: 16 })] }
    ]
  },
  /* A learning launchpad: a rocket on its pad beside a braced gantry whose
     lights climb, steam at its base, a fuel tank, a small mission hut with a
     turning dish, stacked letter blocks and a little slide. */
  rocket: {
    crew: { x: 1.6, z: 1.3 },
    parts: [
      cyl(-0.9, 0, -0.9, 1.45, 0.24, 'matte', 'ink', { n: 28 }),
      ring(-0.9, 0.245, -0.9, 1.0, 1.1, 'glow', 'tint', { n: 40 }),
      cyl(-0.9, 0.24, -0.9, 0.5, 2.0, 'matte', 'paper', { n: 18 }),
      cyl(-0.9, 1.15, -0.9, 0.52, 0.3, 'matte', 'tint', { n: 18 }),
      cyl(-0.9, 1.9, -0.9, 0.51, 0.08, 'matte', 'ink', { n: 18 }),
      cone(-0.9, 2.24, -0.9, 0.5, 1.0, 'matte', 'tint', { n: 18 }),
      cyl(-0.9, 1.62, -0.4, 0.15, 0.05, 'glow', 'window', Object.assign({ n: 12 }, LIE_Z)),
      torus(-0.9, 1.62, -0.37, 0.15, 0.03, 'metal', 'steel', { n: 16 }),
      box(-0.9, 0.24, -0.25, 0.08, 0.7, 0.45, 'matte', 'tint'),
      box(-0.25, 0.24, -0.9, 0.45, 0.7, 0.08, 'matte', 'tint'),
      box(-1.55, 0.24, -0.9, 0.45, 0.7, 0.08, 'matte', 'tint'),
      cone(-0.9, 0.24, -0.9, 0.38, 0.3, 'metal', 'steel', { n: 14, r: [Math.PI, 0, 0] }),
      box(-2.55, 0, -2.55, 0.42, 3.3, 0.42, 'metal', 'steel'),
      box(-2.55, 0.6, -2.3, 0.05, 0.05, 0.6, 'metal', 'steel', { r: [0.9, 0, 0] }),
      box(-2.55, 1.6, -2.3, 0.05, 0.05, 0.6, 'metal', 'steel', { r: [-0.9, 0, 0] }),
      box(-2.0, 2.3, -2.0, 0.1, 0.1, 1.1, 'metal', 'steel', { r: [0, Math.PI / 4, 0] }),
      box(-2.0, 1.2, -2.0, 0.1, 0.1, 1.1, 'metal', 'steel', { r: [0, Math.PI / 4, 0] }),
      box(-2.55, 1.2, -2.55, 0.5, 0.08, 0.5, 'metal', 'steel'),
      box(-2.55, 3.3, -2.55, 0.55, 0.08, 0.55, 'matte', 'ink'),
      cyl(0.6, 0, -2.3, 0.35, 1.1, 'metal', 'steel', { n: 14 }),
      ball(0.6, 0.92, -2.3, 0.35, 'metal', 'steel', { k: [1, 0.6, 1] }),
      box(0.6, 0.4, -1.95, 0.5, 0.04, 0.04, 'matte', 'tint'),
      box(2.2, 0, 0.2, 0.9, 0.7, 0.8, 'matte', 'stone'),
      box(2.2, 0.7, 0.2, 1.0, 0.08, 0.9, 'matte', 'tint'),
      ...pane(2.65, 0.35, 0.2, 0.45, 0.25, 'x'),
      cyl(2.2, 0.78, 0.2, 0.03, 0.25, 'metal', 'steel', { n: 6 }),
      box(-1.7, 0, 1.6, 0.55, 0.55, 0.55, 'matte', 'gold', { r: [0, 0.3, 0] }),
      box(-1.0, 0, 2.0, 0.55, 0.55, 0.55, 'matte', 'salmon', { r: [0, -0.2, 0] }),
      box(-1.35, 0.55, 1.8, 0.55, 0.55, 0.55, 'matte', 'tint', { r: [0, 0.1, 0] }),
      box(-2.5, 0, 0.4, 0.3, 0.9, 0.3, 'matte', 'woodLight'),
      box(-2.5, 0.9, 0.4, 0.4, 0.06, 0.4, 'matte', 'woodLight'),
      box(-2.5, 0.25, 0.95, 0.34, 0.05, 1.1, 'matte', 'salmon', { r: [-0.72, 0, 0] }),
      ...flowers(0.7, 1.6)
    ],
    life: [
      { kind: 'pulse', at: [-2.3, 0.9, -2.3], speed: 1.6, copies: 3, spread: -1.0, climb: 1.0, parts: [ball(0, 0, 0, 0.1, 'glow', 'window')] },
      { kind: 'rise', at: [-0.9, 0.22, -0.9], height: 0.9, speed: 1.1, copies: 3, spread: 2.1, ring: 0.55,
        parts: [ball(0, 0, 0, 0.26, 'matte', 'paper', { k: [1, 0.8, 1] })] },
      { kind: 'spin', at: [2.2, 1.05, 0.2], axis: 'y', speed: 0.7, parts: [
        cone(0, 0, 0, 0.32, 0.16, 'metal', 'steel', { n: 14, r: [Math.PI + 0.5, 0, 0] })] }
    ]
  },
  /* A sushi counter: a roll on its board where the chef's knife slices, a
     little belt in front where plates go round, stools, lanterns under the
     noren, and the capybara chef who runs it (the game's own premise). */
  sushi: {
    crew: { x: 2.0, z: 1.7 },
    parts: [
      box(-0.4, 0, -0.55, 3.4, 0.9, 1.1, 'matte', 'wood'),
      box(-0.4, 0.9, -0.55, 3.6, 0.1, 1.3, 'matte', 'woodLight'),
      box(-0.4, 0.12, -0.0, 3.3, 0.1, 0.02, 'matte', 'ink'),
      box(-1.0, 1.0, -0.45, 1.4, 0.07, 0.75, 'matte', 'woodLight'),
      cyl(-1.1, 1.07, -0.45, 0.27, 0.95, 'matte', 'nori', Object.assign({ n: 16 }, LIE_X)),
      cyl(-0.615, 1.1, -0.45, 0.24, 0.02, 'matte', 'rice', Object.assign({ n: 16 }, LIE_X)),
      cyl(-0.6, 1.23, -0.45, 0.1, 0.02, 'matte', 'salmon', Object.assign({ n: 10 }, LIE_X)),
      cyl(0.55, 1.0, -0.5, 0.45, 0.05, 'matte', 'paper', { n: 20 }),
      cyl(0.4, 1.05, -0.62, 0.16, 0.2, 'matte', 'nori', { n: 12 }),
      cyl(0.72, 1.05, -0.55, 0.16, 0.2, 'matte', 'nori', { n: 12 }),
      cyl(0.5, 1.05, -0.3, 0.16, 0.2, 'matte', 'nori', { n: 12 }),
      cyl(0.4, 1.25, -0.62, 0.13, 0.02, 'matte', 'rice', { n: 12 }),
      cyl(0.72, 1.25, -0.55, 0.13, 0.02, 'matte', 'rice', { n: 12 }),
      cyl(0.5, 1.25, -0.3, 0.13, 0.02, 'matte', 'rice', { n: 12 }),
      cyl(1.2, 1.0, -0.85, 0.12, 0.2, 'matte', 'paper', { n: 10 }),
      cyl(1.2, 1.2, -0.85, 0.05, 0.08, 'matte', 'paper', { n: 8 }),
      box(-2.1, 0, -2.6, 0.12, 2.5, 0.12, 'matte', 'wood'),
      box(1.3, 0, -2.6, 0.12, 2.5, 0.12, 'matte', 'wood'),
      box(-0.4, 2.45, -2.6, 3.6, 0.1, 0.14, 'matte', 'wood'),
      box(-1.23, 1.85, -2.6, 1.6, 0.6, 0.04, 'matte', 'tint'),
      box(0.43, 1.85, -2.6, 1.6, 0.6, 0.04, 'matte', 'tint'),
      ball(-1.6, 1.95, -2.4, 0.16, 'glow', 'window', { k: [1, 1.3, 1] }),
      ball(0.8, 1.95, -2.4, 0.16, 'glow', 'window', { k: [1, 1.3, 1] }),
      cyl(-1.6, 2.2, -2.4, 0.01, 0.25, 'matte', 'ink', { n: 4 }),
      cyl(0.8, 2.2, -2.4, 0.01, 0.25, 'matte', 'ink', { n: 4 }),
      /* The chef stands behind the counter and looks out at you over it:
         a blunt capybara head turned to the camera, a darker muzzle, small
         ears and eyes, a chef's hat, and its paws on the counter. */
      cyl(-0.4, 0, -1.8, 0.52, 1.35, 'matte', 'fur', { n: 14 }),
      box(-0.4, 1.26, -1.7, 0.8, 0.6, 1.0, 'matte', 'fur', FACE),
      box(-0.04, 1.3, -1.34, 0.6, 0.4, 0.16, 'matte', 'furDark', FACE),
      box(0.02, 1.56, -1.28, 0.22, 0.09, 0.05, 'matte', 'ink', FACE),
      ball(-0.37, 1.8, -2.1, 0.12, 'matte', 'furDark'),
      ball(-0.79, 1.8, -1.68, 0.12, 'matte', 'furDark'),
      box(0.01, 1.62, -1.82, 0.08, 0.08, 0.04, 'matte', 'ink', FACE),
      box(-0.53, 1.62, -1.29, 0.04, 0.08, 0.08, 'matte', 'ink', FACE),
      cyl(-0.45, 1.86, -1.75, 0.28, 0.3, 'matte', 'paper', { n: 12 }),
      ball(-0.45, 2.08, -1.75, 0.35, 'matte', 'paper', { k: [1, 0.7, 1] }),
      ball(-0.02, 0.95, -1.02, 0.13, 'matte', 'furDark', { k: [1, 0.7, 1.2] }),
      box(-0.9, 0, 1.0, 2.6, 0.5, 0.9, 'matte', 'wood'),
      box(-0.9, 0.5, 1.0, 2.7, 0.06, 1.0, 'matte', 'woodLight'),
      torus(-0.9, 0.53, 1.0, 1.0, 0.07, 'metal', 'steel', { n: 32, k: [1.1, 0.34, 1], r: [Math.PI / 2, 0, 0] }),
      cyl(-2.4, 0, 1.9, 0.18, 0.55, 'matte', 'ink', { n: 10 }),
      cyl(-2.4, 0.55, 1.9, 0.26, 0.08, 'matte', 'tint', { n: 12 }),
      cyl(-1.4, 0, 2.2, 0.18, 0.55, 'matte', 'ink', { n: 10 }),
      cyl(-1.4, 0.55, 2.2, 0.26, 0.08, 'matte', 'tint', { n: 12 }),
      cyl(-0.3, 0, 2.2, 0.18, 0.55, 'matte', 'ink', { n: 10 }),
      cyl(-0.3, 0.55, 2.2, 0.26, 0.08, 'matte', 'tint', { n: 12 }),
      ...planter(2.2, -1.9, 1)
    ],
    life: [
      { kind: 'swing', at: [-0.55, 1.08, -0.05], axis: 'z', base: -0.2, amp: 0.25, speed: 4.2, parts: [
        box(-0.3, 0, 0, 0.6, 0.02, 0.09, 'metal', 'steel'), box(-0.72, -0.02, 0, 0.26, 0.05, 0.09, 'matte', 'ink')] },
      { kind: 'orbit', at: [-0.9, 0.6, 1.0], rx: 1.1, rz: 0.34, speed: 0.45, copies: 5, spread: Math.PI * 2 / 5, face: false, parts: [
        cyl(0, 0, 0, 0.15, 0.03, 'matte', 'salmon', { n: 12 }), cyl(0, 0.03, 0, 0.09, 0.07, 'matte', 'rice', { n: 10 }),
        cyl(0, 0.1, 0, 0.09, 0.02, 'matte', 'salmon', { n: 10 })] }
    ]
  },
  /* No miniature of its own yet: a small module with windows, a door, a
     turning dish and a garden, plainly generic. */
  generic: {
    crew: { x: 1.4, z: 1.4 },
    parts: [
      box(-0.8, 0, -1.0, 2.6, 0.12, 2.0, 'matte', 'ink'),
      box(-0.8, 0.12, -1.0, 2.4, 1.38, 1.8, 'matte', 'stone'),
      box(-0.8, 1.5, -1.0, 2.6, 0.18, 2.0, 'matte', 'tint'),
      ...pane(-1.2, 0.55, -0.09, 0.6, 0.35),
      ...pane(-0.4, 0.55, -0.09, 0.6, 0.35),
      ...door(0.43, -1.3, 0.45, 0.8, 'x'),
      cyl(0.0, 1.68, -1.4, 0.06, 0.6, 'metal', 'steel', { n: 8 }),
      box(-2.1, 0, 1.3, 0.6, 0.6, 0.6, 'matte', 'wood'),
      box(-1.6, 0, 1.9, 0.45, 0.45, 0.45, 'matte', 'wood', { r: [0, 0.4, 0] }),
      box(0.8, 0, 0.9, 1.2, 0.14, 0.6, 'matte', 'wood'),
      ...flowers(0.5, 0.9), ...flowers(1.1, 0.9),
      ...lamp(-2.5, -0.2, 1.1)
    ],
    life: [
      { kind: 'spin', at: [0.0, 2.25, -1.4], axis: 'y', speed: 0.5, parts: [
        cone(0, 0, 0, 0.5, 0.28, 'metal', 'steel', { n: 16, r: [Math.PI + 0.45, 0, 0] })] }
    ]
  }
};

export function environmentFor(theme){ return ENVIRONMENTS[theme] || ENVIRONMENTS.generic; }

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
