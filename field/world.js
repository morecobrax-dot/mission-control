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
  stepZ: 15.4,                     // and from row to row: a little more, for the labels
  margin: 4,                   // island beyond the outer districts
  islandDepth: 1.05,              // rounded city-diorama slab below the streets
  minDist: 14, maxDist: 900,     // the closest and farthest the camera goes
  focusFill: 0.9,                // a focused district fills this share of the view
  minDistrictPx: 68,             // geometry only: measured labels keep their CSS type size; a larger island pans
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

/* Budgets reported by render3d.js and checked in the browser QA: at
   overview, with the six registered projects, one of them authored (a frame
   without the shadow pass measured 178 calls and 137k triangles; the
   authored place is about 70 calls, one per authored material). */
export const BUDGET = { drawCalls: 200, triangles: 160000, threeGzipBytes: 190000 };

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
export function onPad(d, x, z, grow){ return Math.abs(x - d.x) <= TILE.pad + (grow || 0) && Math.abs(z - d.z) <= TILE.pad + (grow || 0); }

/* The points that frame a district: its pad at the grass, a narrower top at
   its tallest, the label's anchor at the pad's nearest corner and, when
   focused, the sign's anchor above its roof. `room` is the label's px
   ({ w, h }); `sign` the sign's ({ w, h }), above. */
export function districtPoints(d, height, room, sign){
  const e = TILE.pad, t = e * 0.66, h = height;
  const pts = [[d.x + e, 0, d.z+e], [d.x - e, 0, d.z+e], [d.x+e, 0, d.z-e], [d.x-e, 0, d.z-e],
               [d.x+t, h, d.z+t], [d.x-t, h, d.z+t], [d.x+t, h, d.z-t], [d.x-t, h, d.z-t]].map(p => ({ p: p }));
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

/* The sign is a card over the selected place. Where it would hide another
   project's name and the camera is not on that place (`close` is false), the
   sign is the one that goes: the slim bar under the world already says the
   same and no project loses its name. Close on a place, the sign wins as it
   always did. Returns { shown, sign }. */
export function resolveWithSign(rects, signRect, first, viewW, viewH, close){
  if(!signRect) return { shown: resolveLabels(rects, first, viewW, viewH), sign: false };
  const shown = resolveLabels([signRect].concat(rects), first, viewW, viewH);
  if(close) return { shown: shown, sign: true };
  const bare = resolveLabels(rects, first, viewW, viewH);
  return rects.some(r => bare[r.id] && !shown[r.id]) ? { shown: bare, sign: false } : { shown: shown, sign: true };
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
  asphalt: '--city-asphalt', sidewalk: '--city-sidewalk', curb: '--city-curb', facade: '--city-facade',
  facadeWarm: '--city-facade-warm', facadeCool: '--city-facade-cool', windowCool: '--city-window-cool',
  windowDim: '--city-window-dim', roadPaint: '--city-road-paint', cityBase: '--city-base',
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
  track: { url: './art/exports/golden-diorama.glb', span: 10.0, rise: 0.433 }
};
export function assetFor(theme){ return ASSETS[theme] || null; }

/* The clips every authored worker carries, and the material every status
   light in an authored place shares (docs/3D-ASSET-REPORT.md). */
export const ASSET_CLIPS = ['MC_IDLE', 'MC_WORKING', 'MC_ACTIVE', 'MC_SIGNAL', 'MC_REPAIR'];
export const ASSET_STATUS_MATERIAL = 'MC_STATUS_LIGHT';

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
   of 5 is Blender's 5); colours are tokens. */
export const LIGHT = {
  key:  { turn: 55, elevation: 34, intensity: 5.0 },
  fill: { turn: -32, elevation: 24, intensity: 0.35 },
  rim:  { turn: -148, elevation: 34, intensity: 0.9 },
  sky: 0.42,                    // the sky's share, as Blender's world strength
  exposure: 1.0,
  status: 0.9,                  // a known status light's emission; attention breathes round it
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

/* Streets are ambience, not connections between project records. The asphalt
   slab is continuous; every block has a raised sidewalk and marked crossings. */
export function cityParts(districts){
  const out=[];
  districts.forEach(d=>{
    const x=d.x,z=d.z,p=TILE.pad;
    out.push(box(x,.025,z,p*2+.3,.15,p*2+.3,'matte','curb',{bevel:.12}));
    for(const side of [-1,1]){
      /* Pavement seams and curb stones establish scale without textures. */
      for(let a=-p+.7;a<p;a+=1.3){
        out.push(box(x+a,.184,z+side*(p-.4),.025,.006,.65,'matte','windowDim'));
        out.push(box(x+side*(p-.4),.184,z+a,.65,.006,.025,'matte','windowDim'));
      }
      const gapX=WORLD.stepX-2*p,gapZ=WORLD.stepZ-2*p;
      for(let a=-1.15;a<=1.15;a+=.5){
        out.push(box(x+side*(p+gapX/2),.03,z+a,gapX*.66,.01,.22,'matte','roadPaint'));
        out.push(box(x+a,.03,z+side*(p+gapZ/2),.22,.01,gapZ*.66,'matte','roadPaint'));
      }
      for(let a=-3.5;a<=3.5;a+=2.2){
        out.push(box(x+a,.024,z+side*(p+gapZ/2),.8,.01,.045,'matte','roadPaint'));
        out.push(box(x+side*(p+gapX/2),.024,z+a,.045,.01,.8,'matte','roadPaint'));
      }
    }
  });
  streetLamps(districts).forEach(p => out.push(...lamp(p.x, p.z, 3.2)));
  return out;
}

/* A few curbside lamps share merged geometry and painted light pools. They
   are city furniture, independent of the state beacons on the blocks. */
export function streetLamps(districts){
  return districts.slice(0, 4).map(d => ({ x: d.x + TILE.pad + .32, z: d.z + TILE.pad - 1 }));
}

export const TRUCK_PARTS=[
  mass(0,.28,0,1.02,.16,2.28,'ink'),mass(0,.45,-.32,1.03,.91,1.45,'paper'),
  mass(0,.44,.7,1.01,.77,.66,'facadeCool'),box(0,.86,1.045,.79,.32,.02,'metal','windowCool'),
  box(-.515,.9,.73,.018,.25,.4,'metal','windowCool'),box(.515,.9,.73,.018,.25,.4,'metal','windowCool'),
  box(0,.58,-1.06,.9,.72,.02,'matte','curb'),box(0,.61,-1.075,.025,.63,.015,'matte','steel'),
  ...[-1,1].flatMap(side=>[cyl(side*.5,.12,-.66,.23,.1,'matte','ink',LIE_X),cyl(side*.5,.12,.7,.23,.1,'matte','ink',LIE_X),
    box(side*.34,.54,1.045,.19,.12,.035,'glow','window'),box(side*.34,.46,-1.1,.14,.09,.025,'glow','windowDim')])
];
export const RESIDENT_PARTS=[
  mass(-.09,0,0,.12,.38,.15,'ink'),mass(.09,0,0,.12,.38,.15,'ink'),
  mass(0,.37,0,.34,.39,.2,'facadeWarm'),ball(0,.76,0,.145,'matte','skin',{n:12}),
  mass(-.23,.38,0,.1,.33,.11,'facadeWarm'),mass(.23,.38,0,.1,.33,.11,'facadeWarm'),
  mass(.28,.25,.04,.19,.22,.15,'wood')
];

/* Constant-speed rounded rectangle: continuous position and heading at all
   eight joins. This has no project/state inputs and conveys no work progress. */
export function streetPose(bounds,time,offset){
  const x0=bounds.minX,x1=bounds.maxX,z0=bounds.minZ,z1=bounds.maxZ;
  const r=Math.min(1.5,(x1-x0)/4,(z1-z0)/4),wx=x1-x0-2*r,wz=z1-z0-2*r,arc=Math.PI*r/2;
  const lengths=[wx,arc,wz,arc,wx,arc,wz,arc],total=lengths.reduce((a,b)=>a+b,0);
  let s=((time+(offset||0))*1.1%total+total)%total,i=0;
  while(i<7&&s>lengths[i]){s-=lengths[i];i++;}
  let x,z,dx,dz;
  if(i===0){x=x0+r+s;z=z0;dx=1;dz=0;}
  else if(i===2){x=x1;z=z0+r+s;dx=0;dz=1;}
  else if(i===4){x=x1-r-s;z=z1;dx=-1;dz=0;}
  else if(i===6){x=x0;z=z1-r-s;dx=0;dz=-1;}
  else{
    const turn=(i-1)/2,theta=-Math.PI/2+turn*Math.PI/2+s/r;
    const cx=turn===0||turn===1?x1-r:x0+r,cz=turn<1||turn===3?z0+r:z1-r;
    x=cx+r*Math.cos(theta);z=cz+r*Math.sin(theta);dx=-Math.sin(theta);dz=Math.cos(theta);
  }
  return {x:x,z:z,turn:Math.atan2(dx,dz)};
}
export function trafficBounds(districts){
  const island=islandOf(districts),r=island.reach;
  return {minX:r.minX-WORLD.stepX/2,maxX:r.maxX+WORLD.stepX/2,minZ:r.minZ-WORLD.stepZ/2,maxZ:r.maxZ+WORLD.stepZ/2};
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
/* An authored place's height: its pad and its measured rise. */
export function assetHeight(theme){
  const a = ASSETS[theme];
  return a ? TILE.padH + a.span * a.rise : null;
}
