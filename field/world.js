/* =========================================================
   THE WORLD, WITHOUT A GPU
   ---------------------------------------------------------
   Everything about Mission Control's 3D field that is decided
   rather than drawn: where each project's tile stands, how the
   camera frames it, when a touch is a tap or a pan, how each
   crew state poses, what each place is made of and which
   labels can be read. No Three.js and no DOM, so the contracts
   import this file and test it in Node; render3d.js only turns
   it into pixels.

   Two frames, both in world units:
   - the VIEW: x to the right of the screen, y down it. The
     camera never turns, so every screen question (bounds,
     framing, panning, labels) is answered here, in 2D.
   - the TILE: each project stands on a square plinth seen
     corner-on, like the SVG field. Its local x runs to the
     lower right of the screen and z to the lower left, y is up
     and the top surface is y = 0. Recipes are written in it.
   ========================================================= */

export const WORLD = {
  elevation: 0.62,               // the camera's fixed tilt, about 35.5 degrees: an isometric look
  tileTurn: -Math.PI / 4,        // tiles turn 45 degrees so their corners face the camera
  colStep: 13,                   // view units between columns
  rowStep: 27,                   // ground units between rows: room for a label under each plinth
  focusFill: 0.86,               // a focused tile fills this share of the view
  minScale: 7,                   // px per unit below which the overview pans instead of shrinking
  maxScale: 44,                  // the closest the camera comes
  labelPx: 46,                   // a label's room under its plinth, in px, until the real labels are measured
  labelTuck: 10,                 // a label overlaps its plinth's front corner by this much, like a nameplate
  edgePx: 12,                    // breathing room at the viewport's edges, in px
  transitionMs: 380,             // a focus or overview move: interruptible, instant under Reduce Motion
  slopPx: 8,                     // movement that turns a touch into a pan
  ambientFps: 30,                // crews and breathing beacons never ask for more
  ambientSeconds: 60,            // then they settle into their still poses until someone touches the world
  maxPixelRatio: 2,
  maxCanvasPixels: 2500000
};

/* Budgets set before building, reported by render3d.js and checked in the
   browser QA: at overview, with the six registered projects. */
export const BUDGET = { drawCalls: 150, triangles: 60000, threeGzipBytes: 160000 };

/* The plinth, in tile units: a square top of side 2 * half on a wider base.
   A place's recipe is drawn `content` times its written size, and its crew
   `crew` times, so buildings fill their plinth and a worker reads at a
   glance; `tallest` is the highest a scaled place reaches. */
export const TILE = { half: 3.8, baseHalf: 4.1, topDepth: 0.45, seam: 0.1, baseDepth: 1.75, reach: 3.3,
                      content: 1.15, crew: 1.2, tallest: 3.9 };

const SIN = Math.sin(WORLD.elevation), COS = Math.cos(WORLD.elevation), R2 = Math.SQRT2;

/* A tile's silhouette on screen, relative to its centre, in view units:
   the corner-on plinth plus the tallest structure's room above it. */
export const SILHOUETTE = {
  halfW: TILE.baseHalf * R2,
  top: -(TILE.half * R2 * SIN + TILE.tallest * COS),
  plinthBottom: TILE.baseHalf * R2 * SIN + TILE.baseDepth * COS,
  shoulder: TILE.baseDepth * COS
};

/* ---------- layout ---------- */

/* Screen position (view units, y down) of a ground point raised by h. */
export function toView(u, v, h){ return { x: u, y: v * SIN - (h || 0) * COS }; }

/* Tile centres on the ground, in registry order: u across the screen, v
   toward the viewer. Staggered, the odd columns sit half a row lower, so
   the field reads as one archipelago rather than a table; a short last row
   is centred. Adding a project adds a tile, never a special case. */
export function layoutTiles(count, cols, staggered){
  const n = Math.max(0, count | 0);
  const c = Math.max(1, Math.min(cols | 0 || 1, Math.max(1, n)));
  const rows = Math.ceil(n / c);
  const stagger = staggered !== false && rows > 1 && c > 1;
  const tiles = [];
  for(let i = 0; i < n; i++){
    const r = Math.floor(i / c), inRow = Math.min(c, n - r * c);
    const pos = (i % c) + (c - inRow) / 2;
    const drop = !stagger ? 0 : pos % 1 ? 0.25 : pos % 2 ? 0.5 : 0;
    tiles.push({ u: (pos - (c - 1) / 2) * WORLD.colStep, v: (r + drop) * WORLD.rowStep, row: r, col: pos });
  }
  const mid = rows ? ((rows - 1) + (stagger ? 0.5 : 0)) / 2 * WORLD.rowStep : 0;
  tiles.forEach(t => { t.v -= mid; });
  return { cols: c, rows: rows, stagger: stagger, tiles: tiles };
}

/* The view-space rectangle the tiles occupy, from the tallest roof to the
   bottom of the plinth. Labels are px, so framing adds their room: `room`
   below, the tallest label's height less its tuck. Every framing function
   takes it, measured by the renderer, and falls back to WORLD.labelPx. */
const roomOf = room => room === undefined || room === null ? WORLD.labelPx : room;
export function viewBounds(tiles){
  if(!tiles.length) return { minX: -6, maxX: 6, minY: -6, maxY: 6, w: 12, h: 12 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  tiles.forEach(t => {
    const c = toView(t.u, t.v, 0);
    minX = Math.min(minX, c.x - SILHOUETTE.halfW); maxX = Math.max(maxX, c.x + SILHOUETTE.halfW);
    minY = Math.min(minY, c.y + SILHOUETTE.top); maxY = Math.max(maxY, c.y + SILHOUETTE.plinthBottom);
  });
  return { minX: minX, maxX: maxX, minY: minY, maxY: maxY, w: maxX - minX, h: maxY - minY };
}

/* The largest scale at which these bounds and their labels fit the view. */
export function fitScale(bounds, viewW, viewH, room){
  const w = Math.max(1, viewW - WORLD.edgePx * 2), h = Math.max(1, viewH - WORLD.edgePx * 2 - roomOf(room));
  return Math.min(w / Math.max(bounds.w, 1), h / Math.max(bounds.h, 1));
}

/* The arrangement that suits this view: whichever lets the tiles be
   largest. A near tie goes to fewer columns, which keeps reading order
   simple, and then to the staggered field, which reads as one place. */
export function chooseLayout(count, viewW, viewH, room){
  const n = Math.max(1, count | 0);
  let best = { cols: 1, stagger: false }, bestScale = -1;
  for(let c = 1; c <= Math.min(n, 8); c++){
    [true, false].forEach(st => {
      const s = fitScale(viewBounds(layoutTiles(n, c, st).tiles), viewW, viewH, room);
      if(s > bestScale * 1.04){ best = { cols: c, stagger: st }; bestScale = s; }
    });
  }
  return best;
}

/* The overview: every tile in view, centred, as large as fits. When a
   registry is too large to fit at WORLD.minScale the camera stops shrinking
   and the world pans instead, so tiles and labels never become unreadable. */
export function overviewFrame(bounds, viewW, viewH, room){
  const pad = roomOf(room);
  const scale = Math.max(WORLD.minScale, Math.min(fitScale(bounds, viewW, viewH, pad), WORLD.maxScale));
  const frame = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 + pad / 2 / scale, scale: scale };
  const fitsX = bounds.w * scale + WORLD.edgePx * 2 <= viewW, fitsY = bounds.h * scale + pad + WORLD.edgePx * 2 <= viewH;
  /* Too large to fit: start at the top left, where reading begins. */
  if(!fitsX) frame.x = bounds.minX + (viewW / 2 - WORLD.edgePx) / scale;
  if(!fitsY) frame.y = bounds.minY + (viewH / 2 - WORLD.edgePx) / scale;
  return clampFrame(frame, bounds, pad);
}

/* A focused tile: as close as fills the view, never further than the
   overview, centred with its label in view. */
export function focusFrame(tile, bounds, viewW, viewH, room){
  const pad = roomOf(room);
  const over = overviewFrame(bounds, viewW, viewH, pad);
  const tileW = SILHOUETTE.halfW * 2 + 1, tileH = SILHOUETTE.plinthBottom - SILHOUETTE.top + 0.5;
  const fit = Math.min((viewW - WORLD.edgePx * 2) / tileW, (viewH - WORLD.edgePx * 2 - pad) / tileH) * WORLD.focusFill;
  const scale = Math.min(WORLD.maxScale, Math.max(fit, over.scale));
  const c = toView(tile.u, tile.v, 0);
  const midY = c.y + (SILHOUETTE.top + SILHOUETTE.plinthBottom) / 2;
  return clampFrame({ x: c.x, y: midY + pad / 2 / scale, scale: scale }, bounds, pad);
}

/* The camera's centre never leaves the world's rectangle: a pan can show
   an edge, never lose the world. */
export function clampFrame(frame, bounds, room){
  const pad = roomOf(room) / frame.scale;
  return {
    x: Math.min(Math.max(frame.x, bounds.minX), bounds.maxX),
    y: Math.min(Math.max(frame.y, bounds.minY), bounds.maxY + pad),
    scale: frame.scale
  };
}

/* Pan so a tile and its label are on screen, moving as little as possible;
   an already visible tile leaves the camera where it is. */
export function revealFrame(frame, tile, bounds, viewW, viewH, room){
  const c = toView(tile.u, tile.v, 0), s = frame.scale, m = WORLD.edgePx;
  const left = (c.x - SILHOUETTE.halfW - frame.x) * s + viewW / 2, right = (c.x + SILHOUETTE.halfW - frame.x) * s + viewW / 2;
  const top = (c.y + SILHOUETTE.top - frame.y) * s + viewH / 2, bottom = (c.y + SILHOUETTE.plinthBottom - frame.y) * s + viewH / 2 + roomOf(room);
  let dx = 0, dy = 0;
  if(right - left > viewW - 2 * m) dx = (left + right) / 2 - viewW / 2;
  else if(left < m) dx = left - m; else if(right > viewW - m) dx = right - (viewW - m);
  if(bottom - top > viewH - 2 * m) dy = (top + bottom) / 2 - viewH / 2;
  else if(top < m) dy = top - m; else if(bottom > viewH - m) dy = bottom - (viewH - m);
  if(!dx && !dy) return frame;
  return clampFrame({ x: frame.x + dx / s, y: frame.y + dy / s, scale: s }, bounds, room);
}

/* Two frames are the same place, to the pixel. */
export function sameFrame(a, b){
  return !!a && !!b && Math.abs(a.x - b.x) * b.scale < 0.5 && Math.abs(a.y - b.y) * b.scale < 0.5 &&
    Math.abs(a.scale - b.scale) / b.scale < 0.002;
}

/* Between two frames: position eases out, scale eases in log space, so a
   zoom never looks like a lurch. */
export function easeOut(t){ const k = Math.min(1, Math.max(0, t)); return 1 - Math.pow(1 - k, 3); }
export function mixFrame(a, b, t){
  const k = easeOut(t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k,
           scale: Math.exp(Math.log(a.scale) + (Math.log(b.scale) - Math.log(a.scale)) * k) };
}

/* A view point to px in the viewport, for the DOM layer. */
export function toScreen(frame, x, y, viewW, viewH){
  return { x: (x - frame.x) * frame.scale + viewW / 2, y: (y - frame.y) * frame.scale + viewH / 2 };
}

/* The drawing buffer: sharp on a phone, never more than two device pixels
   per CSS pixel, and never a buffer so large a tablet pays for it. */
export function pixelRatioFor(dpr, w, h){
  const area = Math.max(1, w * h);
  return Math.max(0.5, Math.min(dpr || 1, WORLD.maxPixelRatio, Math.sqrt(WORLD.maxCanvasPixels / area)));
}

/* ---------- labels ----------
   Every project keeps a real button; this only decides which labels can be
   read at once. The focused and selected labels win, then nearer rows (which
   the camera draws in front), then registry order; a label that would overlap one
   already placed is hidden, and a hidden or off-screen label takes no taps.
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
   One arbiter for the viewport and every button on it. The first pointer
   owns the gesture; others are ignored until it ends. Until it has moved
   WORLD.slopPx it is a tap in waiting; past that it is a pan for the rest
   of its life, and the click it would otherwise make is swallowed: a drag
   never opens a brief. A cancel or a lost capture ends it with no tap. */
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
      const out = { type: g.panning ? 'pan-end' : 'tap' };
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
   raise an arm forward; a positive head angle looks down. */
export function poseFor(state, t, once){
  const s = Math.sin, k = t || 0;
  const p = { armL: -0.1, armR: -0.1, spreadL: 0.1, spreadR: -0.1, head: 0, turn: 0, lean: 0, lift: 0, seated: false };
  switch(state){
    case 'working':     p.armR = -1.35 + 0.5 * s(k * 5.5); p.armL = -0.55; p.lean = 0.14; p.head = 0.3; p.lift = 0.02 * Math.max(0, s(k * 5.5)); break;
    case 'inspecting':  p.armL = -1.2; p.spreadL = 0.3; p.armR = -0.75 + 0.12 * s(k * 2.2); p.head = 0.32 + 0.08 * s(k * 1.1); break;
    case 'waiting':     p.armR = -1.5; p.spreadR = -0.35; p.turn = -0.35 + 0.08 * s(k * 0.9); p.head = 0.05; break;
    case 'warning':     p.armL = 0.02; p.armR = 0.02; p.head = 0.42; p.lean = 0.05; break;
    case 'idle':        p.armR = -1.0 + 0.2 * s(k * 1.4); p.armL = -0.95 - 0.2 * s(k * 1.4); p.lean = 0.12; p.head = 0.25; break;
    case 'quiet':       p.seated = true; p.armL = -0.55; p.armR = -0.55; p.head = 0.35; break;
    case 'surveying':   p.armR = -1.05 + 0.1 * s(k * 1.2); p.armL = -0.6; p.lean = 0.25; p.head = 0.5; p.turn = 0.12 * s(k * 0.5); break;
    case 'celebrating': {
      const w = once === null || once === undefined ? 0 : Math.sin(Math.PI * Math.min(1, Math.max(0, once)));
      p.armR = -0.3 - 2.4 * w; p.armL = -0.15; p.head = -0.12 * w; break;
    }
    default: return null;
  }
  return p;
}

/* Whether this state moves while seen. Never under Reduce Motion. */
export function crewLoops(state, reducedMotion){
  return !reducedMotion && !!(CREW[state] && CREW[state].loops);
}

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
  shade: '--iso-shade', lightKey: '--light-key', lightSky: '--light-sky', lightGround: '--light-ground'
};
/* Matte is lit and flat-shaded; metal adds a restrained highlight; glow is
   light that belongs to the place (windows, seams, screens), never a status. */
export const FINISHES = ['matte', 'metal', 'glow'];

/* ---------- places ----------
   A part: { s: shape, p: [x, y, z], d: dimensions, m: finish, c: colour,
   r: [rx, ry, rz], n: segments, k: [sx, sy, sz], shade } (the last four
   optional). y is where the part's lowest point sits. Shapes and their d:
     box  [width x, height, depth z]     cyl  [radius, height]
     cone [radius, height]               ball [radius]
     ring [inner, outer], flat           torus [radius, tube]
   Visible faces are +x (lower right, in shade) and +z (lower left, lit),
   so windows and signs go there. The right corner holds the beacon and the
   front holds the crew, so structures keep to the back and the sides.
   Nothing here says how far along a project is: these are places, not
   progress bars. */
const box = (x, y, z, w, h, d, m, c, extra) => Object.assign({ s: 'box', p: [x, y, z], d: [w, h, d], m: m, c: c }, extra);
const cyl = (x, y, z, r, h, m, c, extra) => Object.assign({ s: 'cyl', p: [x, y, z], d: [r, h], m: m, c: c }, extra);
const cone = (x, y, z, r, h, m, c, extra) => Object.assign({ s: 'cone', p: [x, y, z], d: [r, h], m: m, c: c }, extra);
const ball = (x, y, z, r, m, c, extra) => Object.assign({ s: 'ball', p: [x, y, z], d: [r], m: m, c: c }, extra);
const ring = (x, y, z, a, b, m, c, extra) => Object.assign({ s: 'ring', p: [x, y, z], d: [a, b], m: m, c: c }, extra);
const torus = (x, y, z, r, t, m, c, extra) => Object.assign({ s: 'torus', p: [x, y, z], d: [r, t], m: m, c: c }, extra);
const LIE_X = { r: [0, 0, Math.PI / 2] }, LIE_Z = { r: [Math.PI / 2, 0, 0] };
/* Turned to face the camera, which looks along -x-z. */
const FACE = { r: [0, Math.PI / 4, 0] };
/* A shelf of book spines along a wall's visible face, from `from` to `to`
   along x (a back wall) or z (a side wall), in a fixed pattern: the same
   books every time, never random. */
function spines(from, to, y, at, along){
  const out = [], colours = ['tint', 'paper', 'ink', 'salmon', 'paper', 'blueprint', 'gold'];
  for(let p = from, i = 0; p < to - 0.12; i++){
    const w = 0.1 + (i * 37 % 5) * 0.022, h = 0.36 + (i * 53 % 4) * 0.04;
    const c = colours[i % colours.length];
    out.push(along === 'x' ? box(p + w / 2, y, at, w, h, 0.03, 'matte', c) : box(at, y, p + w / 2, 0.03, h, w, 'matte', c));
    p += w + 0.018;
  }
  return out;
}
export const SHAPES = ['box', 'cyl', 'cone', 'ball', 'ring', 'torus'];

/* The beacon: a mast at the right corner with a lamp the status lights.
   Only its lamp and halo change with a status; the mast is the place's. */
export const BEACON = { x: 2.75, z: -2.75, mast: 2.3, lamp: 0.24 };

export const ENVIRONMENTS = {
  /* A training hall inside an oval running track, a hurdle on the near
     straight and a weights rack in the infield. */
  track: {
    crew: { x: 1.5, z: 1.2 },
    parts: [
      ring(0.1, 0.01, 0.1, 2.15, 3.0, 'matte', 'tint', { k: [1.08, 1, 0.8] }),
      ring(0.1, 0.025, 0.1, 2.55, 2.61, 'matte', 'paper', { k: [1.08, 1, 0.8] }),
      box(-0.5, 0, -0.45, 2.3, 1.25, 1.35, 'matte', 'stone'),
      box(-0.5, 1.25, -0.45, 2.5, 0.16, 1.55, 'matte', 'ink'),
      cyl(-0.5, 1.33, -0.45, 0.62, 2.2, 'matte', 'tint', { r: [0, 0, Math.PI / 2], n: 12, k: [1, 1, 0.9] }),
      box(-0.5, 0.42, 0.24, 1.8, 0.34, 0.03, 'glow', 'window'),
      box(0.66, 0.42, -0.45, 0.03, 0.34, 0.9, 'glow', 'window'),
      box(-1.05, 0, 0.24, 0.45, 0.8, 0.04, 'matte', 'ink'),
      box(3.0, 0, -0.1, 0.07, 0.5, 0.07, 'metal', 'steel'),
      box(3.0, 0, 0.55, 0.07, 0.5, 0.07, 'metal', 'steel'),
      box(3.0, 0.42, 0.22, 0.09, 0.12, 0.75, 'matte', 'paper'),
      box(-1.7, 0, 1.3, 0.07, 0.85, 0.07, 'metal', 'steel'),
      box(-1.7, 0, 1.95, 0.07, 0.85, 0.07, 'metal', 'steel'),
      box(-1.7, 0.68, 1.62, 0.05, 0.05, 1.2, 'metal', 'steel'),
      cyl(-1.7, 0.47, 1.12, 0.26, 0.09, 'matte', 'ink', LIE_Z),
      cyl(-1.7, 0.47, 2.12, 0.26, 0.09, 'matte', 'ink', LIE_Z)
    ]
  },
  /* A scheduling studio: a day's timeline across its wall, blocks of time
     in rows with a line for now, a clock, and a planning desk. */
  calendar: {
    crew: { x: 1.4, z: 1.5 },
    parts: [
      box(-0.7, 0, -1.2, 3.0, 2.1, 1.6, 'matte', 'stone'),
      box(-0.7, 2.1, -1.2, 3.2, 0.18, 1.8, 'matte', 'tint'),
      box(-0.7, 0.3, -0.39, 2.7, 1.5, 0.03, 'matte', 'board'),
      box(-1.55, 1.42, -0.36, 0.7, 0.24, 0.03, 'glow', 'window'),
      box(-0.7, 1.42, -0.36, 0.55, 0.24, 0.03, 'glow', 'screen'),
      box(0.12, 1.42, -0.36, 0.6, 0.24, 0.03, 'glow', 'window'),
      box(-1.45, 1.02, -0.36, 0.9, 0.24, 0.03, 'glow', 'screen'),
      box(-0.2, 1.02, -0.36, 0.95, 0.24, 0.03, 'glow', 'window'),
      box(-1.7, 0.62, -0.36, 0.5, 0.24, 0.03, 'glow', 'window'),
      box(-0.95, 0.62, -0.36, 0.7, 0.24, 0.03, 'glow', 'screen'),
      box(0.25, 0.62, -0.36, 0.4, 0.24, 0.03, 'glow', 'window'),
      box(-0.55, 0.34, -0.34, 0.04, 1.44, 0.03, 'matte', 'paper'),
      cyl(0.83, 1.05, -1.2, 0.42, 0.06, 'matte', 'paper', LIE_X),
      box(0.87, 1.44, -1.2, 0.02, 0.03, 0.26, 'matte', 'ink'),
      box(0.87, 1.44, -1.2, 0.02, 0.2, 0.03, 'matte', 'ink'),
      box(2.1, 0, -0.35, 0.55, 0.55, 1.1, 'matte', 'wood'),
      box(2.1, 0.55, -0.35, 0.06, 0.38, 0.62, 'glow', 'screen'),
      box(-2.3, 0, 1.5, 0.5, 0.35, 0.5, 'matte', 'ink'),
      ball(-2.3, 0.35, 1.5, 0.3, 'matte', 'nori')
    ]
  },
  /* A reading pavilion and its library: two walls of shelves meeting at
     the back, open to the camera, a lectern with an open book under a
     reading lamp, and a still pool beside it. */
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
      ...spines(-1.6, 0.45, 0.4, -1.83, 'z'),
      ...spines(-1.6, 0.45, 0.97, -1.83, 'z'),
      cyl(0.62, 0.26, -2.02, 0.13, 1.8, 'matte', 'paper', { n: 10 }),
      cyl(-2.02, 0.26, 0.62, 0.13, 1.8, 'matte', 'paper', { n: 10 }),
      box(-0.6, 0.26, -0.6, 0.34, 0.74, 0.34, 'matte', 'wood'),
      box(-0.74, 1.0, -0.6, 0.3, 0.04, 0.46, 'matte', 'paper', { r: [0, 0, -0.18] }),
      box(-0.46, 1.0, -0.6, 0.3, 0.04, 0.46, 'matte', 'paper', { r: [0, 0, 0.18] }),
      box(-1.25, 0.26, -0.1, 0.05, 1.0, 0.05, 'metal', 'steel'),
      ball(-1.25, 1.2, -0.1, 0.14, 'glow', 'window'),
      cyl(2.0, 0, -1.0, 0.8, 0.05, 'metal', 'water', { n: 20 }),
      cyl(2.0, 0, -1.0, 0.9, 0.035, 'matte', 'stone', { n: 20 })
    ]
  },
  /* A finance workspace: a vault with a round door, stacks of coins and a
     desk with an open ledger under a lamp. */
  vault: {
    crew: { x: 1.4, z: 1.5 },
    parts: [
      box(-0.9, 0, -1.2, 2.7, 2.2, 1.8, 'matte', 'stone'),
      box(-0.9, 2.2, -1.2, 2.9, 0.18, 2.0, 'matte', 'ink'),
      cyl(-0.9, 0.3, -0.21, 0.8, 0.14, 'metal', 'steel', Object.assign({ n: 24 }, LIE_Z)),
      cyl(-0.9, 0.84, -0.12, 0.26, 0.1, 'metal', 'tint', Object.assign({ n: 16 }, LIE_Z)),
      box(-0.9, 1.07, -0.08, 1.1, 0.06, 0.05, 'metal', 'steel'),
      box(-0.9, 0.55, -0.08, 0.06, 1.1, 0.05, 'metal', 'steel'),
      box(-0.9, 1.95, -0.29, 1.6, 0.1, 0.03, 'glow', 'window'),
      cyl(1.7, 0, -1.6, 0.32, 0.55, 'metal', 'gold', { n: 16 }),
      cyl(2.2, 0, -1.0, 0.3, 0.85, 'metal', 'gold', { n: 16 }),
      cyl(1.55, 0, -0.75, 0.28, 0.32, 'metal', 'gold', { n: 16 }),
      box(-1.9, 0, 1.55, 1.2, 0.55, 0.7, 'matte', 'wood'),
      box(-1.9, 0.55, 1.55, 0.85, 0.04, 0.5, 'matte', 'paper'),
      box(-1.9, 0.59, 1.55, 0.02, 0.01, 0.46, 'matte', 'ink'),
      box(-2.4, 0.55, 1.35, 0.06, 0.4, 0.06, 'metal', 'steel'),
      ball(-2.4, 0.9, 1.35, 0.12, 'glow', 'window')
    ]
  },
  /* A learning launchpad: a rocket on its pad beside a gantry, and a stack
     of letter blocks. */
  rocket: {
    crew: { x: 1.6, z: 1.3 },
    parts: [
      cyl(-0.9, 0, -0.9, 1.45, 0.24, 'matte', 'ink', { n: 24 }),
      ring(-0.9, 0.245, -0.9, 1.0, 1.1, 'glow', 'tint'),
      cyl(-0.9, 0.24, -0.9, 0.5, 2.0, 'matte', 'paper', { n: 16 }),
      cyl(-0.9, 1.15, -0.9, 0.52, 0.3, 'matte', 'tint', { n: 16 }),
      cone(-0.9, 2.24, -0.9, 0.5, 1.0, 'matte', 'tint', { n: 16 }),
      cyl(-0.9, 1.62, -0.4, 0.15, 0.05, 'glow', 'window', Object.assign({ n: 12 }, LIE_Z)),
      box(-0.9, 0.24, -0.25, 0.08, 0.7, 0.45, 'matte', 'tint'),
      box(-0.25, 0.24, -0.9, 0.45, 0.7, 0.08, 'matte', 'tint'),
      box(-1.55, 0.24, -0.9, 0.45, 0.7, 0.08, 'matte', 'tint'),
      box(-2.55, 0, -2.55, 0.42, 3.3, 0.42, 'metal', 'steel'),
      box(-2.0, 2.3, -2.0, 0.1, 0.1, 1.1, 'metal', 'steel', { r: [0, Math.PI / 4, 0] }),
      box(-2.55, 1.2, -2.55, 0.5, 0.08, 0.5, 'metal', 'steel'),
      box(-1.7, 0, 1.6, 0.55, 0.55, 0.55, 'matte', 'gold', { r: [0, 0.3, 0] }),
      box(-1.0, 0, 2.0, 0.55, 0.55, 0.55, 'matte', 'salmon', { r: [0, -0.2, 0] }),
      box(-1.35, 0.55, 1.8, 0.55, 0.55, 0.55, 'matte', 'tint', { r: [0, 0.1, 0] })
    ]
  },
  /* A sushi counter: a roll on its board beside the knife, sliced pieces
     on a plate, a noren behind, and the capybara chef who runs it. */
  sushi: {
    crew: { x: 1.8, z: 1.5 },
    parts: [
      box(-0.4, 0, -0.55, 3.4, 0.9, 1.1, 'matte', 'wood'),
      box(-0.4, 0.9, -0.55, 3.6, 0.1, 1.3, 'matte', 'woodLight'),
      box(-1.0, 1.0, -0.45, 1.4, 0.07, 0.75, 'matte', 'woodLight'),
      cyl(-1.1, 1.07, -0.45, 0.27, 0.95, 'matte', 'nori', Object.assign({ n: 14 }, LIE_X)),
      cyl(-0.615, 1.1, -0.45, 0.24, 0.02, 'matte', 'rice', Object.assign({ n: 14 }, LIE_X)),
      cyl(-0.6, 1.23, -0.45, 0.1, 0.02, 'matte', 'salmon', Object.assign({ n: 10 }, LIE_X)),
      box(-0.95, 1.07, -0.05, 0.6, 0.02, 0.09, 'metal', 'steel'),
      box(-1.4, 1.07, -0.05, 0.3, 0.05, 0.09, 'matte', 'ink'),
      cyl(0.55, 1.0, -0.5, 0.45, 0.05, 'matte', 'paper', { n: 20 }),
      cyl(0.4, 1.05, -0.62, 0.16, 0.2, 'matte', 'nori', { n: 12 }),
      cyl(0.72, 1.05, -0.55, 0.16, 0.2, 'matte', 'nori', { n: 12 }),
      cyl(0.5, 1.05, -0.3, 0.16, 0.2, 'matte', 'nori', { n: 12 }),
      cyl(0.4, 1.25, -0.62, 0.13, 0.02, 'matte', 'rice', { n: 12 }),
      cyl(0.72, 1.25, -0.55, 0.13, 0.02, 'matte', 'rice', { n: 12 }),
      cyl(0.5, 1.25, -0.3, 0.13, 0.02, 'matte', 'rice', { n: 12 }),
      box(-2.1, 0, -2.6, 0.12, 2.5, 0.12, 'matte', 'wood'),
      box(1.3, 0, -2.6, 0.12, 2.5, 0.12, 'matte', 'wood'),
      box(-0.4, 2.45, -2.6, 3.6, 0.1, 0.14, 'matte', 'wood'),
      box(-0.4, 1.85, -2.6, 3.3, 0.6, 0.04, 'matte', 'tint'),
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
      ball(-0.78, 0.95, -1.02, 0.13, 'matte', 'furDark', { k: [1, 0.7, 1.2] }),
      ball(-0.02, 0.95, -1.02, 0.13, 'matte', 'furDark', { k: [1, 0.7, 1.2] })
    ]
  },
  /* No miniature of its own yet: a small module with a dish and a crate,
     plainly generic. */
  generic: {
    crew: { x: 1.4, z: 1.4 },
    parts: [
      box(-0.8, 0, -1.0, 2.4, 1.5, 1.8, 'matte', 'stone'),
      box(-0.8, 1.5, -1.0, 2.6, 0.18, 2.0, 'matte', 'tint'),
      box(-0.8, 0.5, -0.09, 1.8, 0.34, 0.03, 'glow', 'window'),
      cyl(0.0, 1.68, -1.4, 0.06, 0.6, 'metal', 'steel', { n: 8 }),
      cone(0.0, 2.18, -1.4, 0.5, 0.28, 'metal', 'steel', { n: 16, r: [Math.PI, 0, 0] }),
      box(-2.1, 0, 1.3, 0.6, 0.6, 0.6, 'matte', 'wood'),
      box(-1.6, 0, 1.9, 0.45, 0.45, 0.45, 'matte', 'wood', { r: [0, 0.4, 0] })
    ]
  }
};

export function environmentFor(theme){ return ENVIRONMENTS[theme] || ENVIRONMENTS.generic; }

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
    box(0.1, 0.5, 0.62, 0.32, 0.14, 0.22, 'metal', 'steel')
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
