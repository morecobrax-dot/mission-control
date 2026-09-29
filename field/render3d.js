/* =========================================================
   THE 3D FIELD
   ---------------------------------------------------------
   Draws Mission Control's projects as one miniature city
   with Three.js, behind the same seam as the SVG field. It is
   given a scene (ids, names, signals, crews, themes, the words
   a label and a sign say, which one is selected) and never
   reads storage, never fetches status, never decides one and
   never owns the selection: a tap is reported to the app, and
   the app's next draw says what is selected.

   One canvas, one scene, one perspective camera that never
   turns. Each place's geometry is built once per look and
   shared; a status change swaps a material or a visibility,
   never rebuilds. The island and its growth are rebuilt only
   when the layout changes shape (a rotation, a resize).

   One requestAnimationFrame loop, running only while something
   moves and someone can see it, at up to 60 frames a second.
   Nothing in a frame reads layout: labels are measured when
   their words change and only moved, by transform, each frame.

   The camera's frame ({ x, z, d }, see world.js) is transient:
   it lives here and is never stored.

   Every project keeps a real <button>: its accessible name and
   keyboard stop, holding its label. A tap on the island is
   hit-tested against the districts; a label that can be read
   takes a tap too, and a hidden one takes none.
   ========================================================= */
import * as THREE from '../vendor/three/three.min.js';
import {
  WORLD, TILE, BEACON, eyeOf, project, chooseLayout, islandOf, islandOutline, focusFrame,
  clampFrame, panFrame, revealFrame, hitDistrict, labelAnchor, signAnchor, sameFrame, mixFrame,
  pixelRatioFor, nextPixelRatio, districtPx, resolveLabels, resolveWithSign, createArbiter, CREW, CREW_FACING, poseFor, crewLoops,
  lifeActive, lifeSpeed, lifePose, lifeOrigin, PALETTE, environmentFor, STATIONS, HAND_PROPS, SCENERY,
  placeHeight, cityParts, streetLamps, TRUCK_PARTS, RESIDENT_PARTS, streetPose, trafficBounds,
  assetFor, assetHeight, assetCrew, ASSET_STATUS_MATERIAL, LIGHT, lightDirection
} from './world.js';

export const REVISION = THREE.REVISION;

const DIM = 0.55;                // a paused place, lit at this share
const LOST_GRACE_MS = 2500;      // a lost context not back by then falls back to the SVG field
const CELEBRATE_MS = 1400;       // release ready's one acknowledgment
const BREATH_S = 2.6;            // an attention beacon's slow breath
const POSE_EASE_S = 0.12;        // how quickly a worker settles into a new pose
const SIGN = ' sign';             // the sign's place among the labels: never a project id
const CLICK_AFTER_MS = 700;       // how long after a pan or an island tap its own click may still arrive
const ASSET_WAIT_MS = 12000;      // an authored place not loaded by then is drawn from its recipe
const CLIP_FADE_S = 0.45;         // a worker changing what it does blends into it

/* ---------- colour, from the page's tokens ---------- */
function parseColour(raw){
  const s = (raw || '').trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if(m) return { c: new THREE.Color().setStyle('#' + m[1]), a: 1 };
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if(m){
    const v = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    if(v.length < 3 || v.some(isNaN)) return null;
    return { c: new THREE.Color().setRGB(v[0] / 255, v[1] / 255, v[2] / 255, THREE.SRGBColorSpace), a: v.length > 3 ? v[3] : 1 };
  }
  return null;
}
function rawToken(el, name){
  try{ return getComputedStyle(el).getPropertyValue(name).trim(); }catch(e){ return ''; }
}
function tokenOf(el, name){ return parseColour(rawToken(el, name)); }

/* ---------- geometry ---------- */
function partGeometry(part){
  const d = part.d, n = part.n;
  let g;
  switch(part.s){
    case 'box':   g = part.bevel ? new THREE.RoundedBoxGeometry(d[0], d[1], d[2], 2, Math.min(part.bevel, Math.min(...d) / 3)) : new THREE.BoxGeometry(d[0], d[1], d[2]); break;
    case 'cyl':   g = new THREE.CylinderGeometry(d[0], d[0], d[1], n || 14); break;
    case 'cone':  g = new THREE.ConeGeometry(d[0], d[1], n || 14); break;
    case 'ball':  g = new THREE.SphereGeometry(d[0], n || 10, Math.max(4, Math.round((n || 10) * 0.6))); break;
    case 'rock':  g = new THREE.SphereGeometry(d[0], 5, 4); break;
    case 'ring':  g = new THREE.RingGeometry(d[0], d[1], n || 40); g.rotateX(-Math.PI / 2); break;
    case 'torus': g = new THREE.TorusGeometry(d[0], d[1], 6, n || 20); break;
    default: return null;
  }
  if(part.k) g.scale(part.k[0], part.k[1], part.k[2]);
  if(part.r) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(part.r[0], part.r[1], part.r[2])));
  g.computeBoundingBox();
  g.translate(part.p[0], part.p[1] - g.boundingBox.min.y, part.p[2]);
  return g.index ? g.toNonIndexed() : g;
}

/* Parts merged into one geometry per finish, each vertex carrying its
   part's colour: a whole place is three draw calls. `place` is an optional
   { x, z, s, turn } that stands the parts somewhere on the island, for its
   growth; `into` gathers several placings into one set. */
function mergeParts(parts, colourOf, place, into){
  const out = into || {};
  const m = place ? new THREE.Matrix4().makeRotationY(place.turn || 0).scale(new THREE.Vector3(place.s, place.s, place.s))
    .setPosition(place.x, 0, place.z) : null;
  parts.forEach(part => {
    const g = partGeometry(part);
    if(!g) return;
    if(m) g.applyMatrix4(m);
    const col = colourOf(part.c).clone().multiplyScalar(part.shade || 1);
    const bucket = out[part.m] || (out[part.m] = { pos: [], nor: [], col: [] });
    const p = g.attributes.position.array, nr = g.attributes.normal.array;
    for(let i = 0; i < p.length; i += 3){
      bucket.pos.push(p[i], p[i + 1], p[i + 2]);
      bucket.nor.push(nr[i], nr[i + 1], nr[i + 2]);
      bucket.col.push(col.r, col.g, col.b);
    }
    g.dispose();
  });
  return out;
}
function toGeometries(buckets){
  const geos = {};
  Object.keys(buckets).forEach(m => {
    const b = buckets[m], g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.computeBoundingSphere();
    geos[m] = g;
  });
  return geos;
}

/* The pad under every place, in the recipe's units (the content group is
   lifted by TILE.padH and drawn TILE.content times): the project's own
   ground, a seam of its own light round it, and the beacon's mast. */
function padParts(){
  const h = TILE.padH / TILE.content, side = TILE.pad * 2 / TILE.content;
  return [
    { s: 'box', p: [0, -h, 0], d: [side, h, side], m: 'matte', c: 'sidewalk', bevel: 0.08 },
    { s: 'box', p: [BEACON.x, 0, BEACON.z], d: [0.34, 0.12, 0.34], m: 'metal', c: 'steel' },
    { s: 'box', p: [BEACON.x, 0.12, BEACON.z], d: [0.09, BEACON.mast - 0.12, 0.09], m: 'metal', c: 'steel' },
    { s: 'cyl', p: [BEACON.x, BEACON.mast - 0.05, BEACON.z], d: [BEACON.lamp + 0.06, 0.08], n: 12, m: 'metal', c: 'steel' }
  ];
}

/* The city: one rounded architectural slab, asphalt on top and a curb
   reveal at its edge. No random forest separates the project blocks. */
function islandGeometry(island, col){
  const top = islandOutline(island, 96, 0), n = top.length;
  const cx = island.cx, cz = island.cz, D = WORLD.islandDepth;
  const rings = [
    { y: 0, k: 1, c: col('asphalt') }, { y: -0.16, k: 1.001, c: col('curb') },
    { y: -0.28, k: 1, c: col('cityBase') }, { y: -D, k: 0.994, c: col('cityBase') }
  ];
  const pts = rings.map(r => top.map(([x, z]) => [cx + (x - cx) * r.k, r.y, cz + (z - cz) * r.k]));
  const pos = [], colr = [];
  const tri = (a, b, c, ca, cb, cc) => { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); colr.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b); };
  const grass = rings[0].c;
  for(let i = 0; i < n; i++){ const j = (i + 1) % n; tri([cx, 0, cz], pts[0][j], pts[0][i], grass, grass, grass); }
  for(let r = 0; r < rings.length - 1; r++){
    const a = pts[r], b = pts[r + 1], ca = rings[r].c, cb = rings[r + 1].c;
    for(let i = 0; i < n; i++){
      const j = (i + 1) % n;
      tri(a[i], a[j], b[i], ca, ca, cb);
      tri(a[j], b[j], b[i], ca, cb, cb);
    }
  }
  const last = pts[pts.length - 1], rock = rings[rings.length - 1].c;
  for(let i = 0; i < n; i++){ const j = (i + 1) % n; tri([cx, -D, cz], last[i], last[j], rock, rock, rock); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* A soft round dot, for grounding shadows and beacon halos. */
function dotTexture(){
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  /* A white mask's alpha, not a colour: each material that uses it supplies
     the colour from a token. */
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* The sky for reflections: a sphere shaded from the ground colour below
   the horizon to the sky colour above, prefiltered once. */
function skyEnvironment(renderer, skyColour, groundColour){
  const envScene = new THREE.Scene();
  const g = new THREE.SphereGeometry(10, 32, 16);
  const pos = g.attributes.position, cols = [];
  const c = new THREE.Color();
  for(let i = 0; i < pos.count; i++){
    const y = pos.getY(i) / 10, k = Math.min(1, Math.max(0, (y + 0.15) / 0.85));
    c.copy(groundColour).lerp(skyColour, k * k * (3 - 2 * k));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(g, m));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(envScene, 0.02).texture;
  pmrem.dispose(); g.dispose(); m.dispose();
  return tex;
}

/* ---------- the world ---------- */
export function createWorld(host, hooks){
  const H = hooks || {};
  const root = document.documentElement;
  const rm = () => { try{ return !!(H.reducedMotion && H.reducedMotion()); }catch(e){ return false; } };

  /* DOM: the viewport, its canvas, the label layer, the sign and Overview. */
  const view = document.createElement('div');
  view.className = 'world-view';
  view.style.visibility = 'hidden';
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const layer = document.createElement('div');
  layer.className = 'world-layer';
  const sign = document.createElement('div');
  sign.className = 'world-sign';
  sign.setAttribute('aria-hidden', 'true');
  const signCard = document.createElement('div');
  signCard.className = 'world-sign-card';
  const signStem = document.createElement('span');
  signStem.className = 'world-sign-stem';
  sign.appendChild(signStem);
  sign.appendChild(signCard);
  const overviewBtn = document.createElement('button');
  overviewBtn.type = 'button';
  overviewBtn.className = 'world-overview';
  overviewBtn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
    '<path d="M8 1.8 11 4.8 8 7.8 5 4.8Z"/><path d="M4.2 5.6 7.2 8.6 4.2 11.6 1.2 8.6Z"/><path d="M11.8 5.6 14.8 8.6 11.8 11.6 8.8 8.6Z"/><path d="M8 9.4 11 12.4 8 15.4 5 12.4Z"/></svg>' +
    '<span>Overview</span>';
  overviewBtn.setAttribute('aria-label', 'Overview: show every project');
  view.appendChild(canvas);
  view.appendChild(layer);
  view.appendChild(sign);
  view.appendChild(overviewBtn);
  host.appendChild(view);

  /* Three.js. Its own context listeners are attached in this constructor;
     ours go on after, or a restored context stays blank. */
  let renderer;
  try{
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  }catch(e){
    host.removeChild(view);
    throw e;
  }
  renderer.setClearAlpha(0);
  /* Khronos PBR Neutral: highlights roll off without the hue shift ACES gives
     warm light, and authored colours keep their saturation, so pastels stay
     pastel and a status stays its hue (three.js's AgX is the flat base look). */
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = LIGHT.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(WORLD.fov, 1, 0.5, 2000);

  const S = {
    w: 0, h: 0, dpr: 1, dprCap: 2, frame: null, from: null, to: null, t0: 0, mode: 'overview', over: null,
    tiles: new Map(), order: [], selected: null, focused: null, first: true, island: null, cols: 0,
    raf: 0, lastRender: 0, lastTick: 0, lastWake: 0, onscreen: true, covered: false, lost: false, lostTimer: 0,
    destroyed: false, failed: false, frames: 0, cost: 0, swallowUntil: 0, dirty: false, reroom: 0,
    slowSum: 0, slowCount: 0, signFor: null, signHtml: null, signRoom: null, signEnter: 0, labelMax: 0,
    pending: 0, shadowAt: 0, shadowRefreshes: 0
  };

  /* ---------- shared resources ---------- */
  const palette = {};
  Object.keys(PALETTE).forEach(k => { palette[k] = tokenOf(root, PALETTE[k]); });
  const fallback = palette.stone || { c: new THREE.Color(0.8, 0.8, 0.8), a: 1 };
  const col = name => (palette[name] || fallback).c;

  /* The studio rig (world.js LIGHT): a warm key sun that casts, a weak cool
     fill and a rim that do not, and the sky's gradient, from the ground's
     warm grey to a cool blue, as the bounce in every shadow. Nothing else
     lights the world. */
  const lightOf = name => palette[name] ? palette[name].c : col('stone');
  const key = new THREE.DirectionalLight(lightOf('lightKey'), LIGHT.key.intensity);
  const fill = new THREE.DirectionalLight(lightOf('lightFill'), LIGHT.fill.intensity);
  const rim = new THREE.DirectionalLight(lightOf('lightRim'), LIGHT.rim.intensity);
  key.castShadow = true;
  /* 2048 wherever the GPU allows 4096 textures, which is every current
     phone: at 1024 a worker's shadow is a smudge at the island's scale. */
  const shadowPx = renderer.capabilities.maxTextureSize >= 4096 ? 2048 : 1024;
  key.shadow.mapSize.set(shadowPx, shadowPx);
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.035;
  key.shadow.radius = 2.5;
  /* The sky's diffuse light is a hemisphere light: the same gradient, from
     the warm ground below to the cool sky above, at the strength image-based
     light would give it (a radiance L lights a surface with pi L). Sampling
     the prefiltered sky for every asphalt pixel cost more than the whole
     authored place, so only what must reflect it, glass and metal, does. */
  const hemi = new THREE.HemisphereLight(lightOf('lightSky'), lightOf('lightGround'), LIGHT.sky * Math.PI);
  scene.add(key, fill, rim, hemi);
  const sky = skyEnvironment(renderer, lightOf('lightSky'), lightOf('lightGround'));
  const reflects = m => m.metalness > 0.5 || (m.roughness < 0.1 && m.name !== ASSET_STATUS_MATERIAL);

  const dot = dotTexture();
  const mats = {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.03 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.3 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    suit: new THREE.MeshLambertMaterial({ color: col('suit'), flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: col('skin'), roughness: 0.85 }),
    spill: new THREE.MeshBasicMaterial({ map: dot, color: col('window'), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    shadow: new THREE.MeshBasicMaterial({ map: dot, color: col('shade'), transparent: true, opacity: 0.5, depthWrite: false }),
    lampOff: new THREE.MeshLambertMaterial({ color: col('ink'), flatShading: true })
  };
  mats.glow.toneMapped = true;
  /* A paused place is the same place in lower light. */
  mats.matteDim = mats.matte.clone(); mats.matteDim.color.setScalar(DIM);
  mats.metalDim = mats.metal.clone(); mats.metalDim.color.setScalar(DIM);
  mats.glowDim = mats.glow.clone(); mats.glowDim.color.setScalar(DIM);
  mats.suitDim = mats.suit.clone(); mats.suitDim.color.multiplyScalar(DIM);
  mats.skinDim = mats.skin.clone(); mats.skinDim.color.multiplyScalar(DIM);
  const select = tokenOf(root, '--field-select') || { c: col('paper'), a: 0.85 };
  mats.select = new THREE.MeshBasicMaterial({ color: select.c, transparent: true, opacity: select.a, depthWrite: false });

  /* Per-signal lamp, halo and helmet materials, shared by every district in
     that state; per-look shirt materials for runners. */
  const signalMats = new Map();
  function signalMat(hex){
    let m = signalMats.get(hex);
    if(m) return m;
    const c = parseColour(hex);
    m = {
      lamp: new THREE.MeshBasicMaterial({ color: c ? c.c : col('stone') }),
      halo: new THREE.MeshBasicMaterial({ map: dot, color: c ? c.c : col('stone'), transparent: true, opacity: 0.5,
                                          blending: THREE.AdditiveBlending, depthWrite: false }),
      helmet: new THREE.MeshLambertMaterial({ color: c ? c.c : col('stone'), flatShading: true })
    };
    signalMats.set(hex, m);
    return m;
  }
  const shirtMats = new Map();
  function shirtMat(theme, tint){
    let m = shirtMats.get(theme);
    if(!m){ m = new THREE.MeshLambertMaterial({ color: tint, flatShading: true }); shirtMats.set(theme, m); }
    return m;
  }

  const geos = {
    lamp: new THREE.SphereGeometry(BEACON.lamp, 12, 8),
    halo: new THREE.CircleGeometry(1.2, 24),
    shadow: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    leg: new THREE.BoxGeometry(0.13, 0.5, 0.16).translate(0, -0.25, 0),
    chest: new THREE.BoxGeometry(0.4, 0.46, 0.24).translate(0, 0.23, 0),
    head: new THREE.SphereGeometry(0.15, 10, 7).translate(0, 0.16, 0),
    helmet: new THREE.SphereGeometry(0.168, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.19, 0),
    arm: new THREE.BoxGeometry(0.1, 0.44, 0.11).translate(0, -0.22, 0)
  };
  const placeGeos = new Map();          // theme -> { matte, metal, glow }
  function placeGeo(theme, tintOf){
    let g = placeGeos.get(theme);
    if(g) return g;
    const env = environmentFor(theme);
    g = toGeometries(mergeParts(padParts().concat(env.parts), name =>
      name === 'tint' ? tintOf.tint : name === 'terrain' ? tintOf.terrain : col(name)));
    placeGeos.set(theme, g);
    return g;
  }
  const partGeos = new Map();           // station, hand prop or life element -> { matte, metal, glow }
  function partsGeo(key, parts, tint){
    let g = partGeos.get(key);
    if(g) return g;
    g = toGeometries(mergeParts(parts, c => c === 'tint' && tint ? tint : col(c)));
    partGeos.set(key, g);
    return g;
  }
  /* The selection: a lit frame round the selected district's pad. */
  const frameGeo = (() => {
    const s = TILE.pad * 2 / TILE.content, t = 0.1;
    return toGeometries(mergeParts([
      { s: 'box', p: [0, 0.005, -s / 2], d: [s + t, 0.05, t], m: 'glow', c: 'paper' },
      { s: 'box', p: [0, 0.005, s / 2], d: [s + t, 0.05, t], m: 'glow', c: 'paper' },
      { s: 'box', p: [-s / 2, 0.005, 0], d: [t, 0.05, s + t], m: 'glow', c: 'paper' },
      { s: 'box', p: [s / 2, 0.005, 0], d: [t, 0.05, s + t], m: 'glow', c: 'paper' }
    ], () => select.c)).glow;
  })();
  const selectMesh = new THREE.Mesh(frameGeo, mats.select);
  selectMesh.renderOrder = 2;

  /* The island and its growth: rebuilt only when the layout changes shape. */
  const land = { island: null, scenery: [], pools: [], key: '' };
  const landGroup = new THREE.Group();
  scene.add(landGroup);
  function buildLand(districts){
    const island = islandOf(districts);
    const layoutKey = districts.map(d => d.x.toFixed(2) + ',' + d.z.toFixed(2)).join('|');
    if(layoutKey === land.key) return island;
    land.key = layoutKey;
    [land.island].concat(land.scenery).forEach(m => { if(m){ landGroup.remove(m); m.geometry.dispose(); } });
    land.island = new THREE.Mesh(islandGeometry(island, col), mats.matte);
    landGroup.add(land.island);
    land.island.receiveShadow = true;
    const g = toGeometries(mergeParts(cityParts(districts), col));
    land.scenery = Object.keys(g).map(m => { const mesh = new THREE.Mesh(g[m], mats[m]); mesh.receiveShadow = true; landGroup.add(mesh); return mesh; });
    /* Shared pool geometry/material live until destroy, including across a
       layout change: remove the meshes here without disposing their assets. */
    land.pools.forEach(mesh => landGroup.remove(mesh));
    land.pools = streetLamps(districts).map(p => {
      const pool = new THREE.Mesh(geos.shadow, mats.spill);
      pool.position.set(p.x, .045, p.z); pool.scale.set(5.2, 1, 5.2); pool.renderOrder = 1;
      landGroup.add(pool); return pool;
    });
    const radius = Math.max(island.a, island.b) + 4;
    [[key, LIGHT.key], [fill, LIGHT.fill], [rim, LIGHT.rim]].forEach(([l, spec]) => {
      const d = lightDirection(spec);
      l.target.position.set(island.cx, 0, island.cz);
      l.position.set(island.cx + d[0] * radius * 2, d[1] * radius * 2, island.cz + d[2] * radius * 2);
      scene.add(l.target);
    });
    Object.assign(key.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius, near: .5, far: radius*4.5 });
    key.shadow.camera.updateProjectionMatrix();
    renderer.shadowMap.needsUpdate = true;
    buildStreetLife(districts);
    return island;
  }

  function meshesFor(geoSet, parent, dimmable, staticShadow){
    const list = [];
    ['matte', 'metal', 'glow'].forEach(m => {
      if(!geoSet[m]) return;
      const mesh = new THREE.Mesh(geoSet[m], mats[m]);
      /* The cached map contains architecture only. A moving prop or a
         worker's changing station must never leave its old shadow behind. */
      mesh.castShadow = !!staticShadow && m !== 'glow';
      mesh.receiveShadow = m !== 'glow';
      mesh.userData.finish = m;
      mesh.userData.dimmable = !!dimmable;
      parent.add(mesh);
      list.push(mesh);
    });
    return list;
  }

  /* A figure on the shared rig: legs, torso, head, helmet and arms that the
     poses turn. `shirt` dresses a runner in the place's own colour. */
  function makeRig(parent, shirt){
    const body = new THREE.Group();
    const legL = new THREE.Mesh(geos.leg, mats.suit), legR = new THREE.Mesh(geos.leg, mats.suit);
    legL.position.set(-0.09, 0.5, 0); legR.position.set(0.09, 0.5, 0);
    const torso = new THREE.Group(); torso.position.y = 0.5;
    const chest = new THREE.Mesh(geos.chest, shirt || mats.suit);
    const head = new THREE.Group(); head.position.y = 0.47;
    const skull = new THREE.Mesh(geos.head, mats.skin), helmet = new THREE.Mesh(geos.helmet, mats.lampOff);
    head.add(skull);
    if(!shirt) head.add(helmet);
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.26, 0.43, 0); armR.position.set(0.26, 0.43, 0);
    armL.add(new THREE.Mesh(geos.arm, shirt || mats.suit)); armR.add(new THREE.Mesh(geos.arm, shirt || mats.suit));
    torso.add(chest, head, armL, armR);
    body.add(legL, legR, torso);
    const feet = new THREE.Mesh(geos.shadow, mats.shadow);
    feet.scale.set(1.1, 1, 1.1); feet.position.y = 0.012;
    parent.add(body, feet);
    return { body: body, legL: legL, legR: legR, torso: torso, head: head, helmet: helmet, armL: armL, armR: armR,
             suits: shirt ? [legL, legR] : [legL, legR, chest, armL.children[0], armR.children[0]], skull: skull };
  }
  function applyPose(r, p){
    r.armL.rotation.set(p.armL, 0, p.spreadL);
    r.armR.rotation.set(p.armR, 0, p.spreadR);
    r.head.rotation.set(p.head, p.turn, 0);
    r.torso.rotation.x = p.lean;
    r.body.position.y = (p.seated ? -0.1 : 0) + p.lift;
    r.legL.rotation.x = p.legL || 0;
    r.legR.rotation.x = p.legR || 0;
  }

  /* Street residents and trucks are decorative city life. They never read a
     status or stand in for a worker, and share the world's one clock. */
  let streetLife = [], streetTime = 0;
  const streetGroup = new THREE.Group(); scene.add(streetGroup);
  function buildStreetLife(districts){
    streetGroup.clear(); streetLife = [];
    const bounds = trafficBounds(districts);
    for(let i=0;i<3;i++){
      const g = new THREE.Group();
      meshesFor(partsGeo('city-truck',TRUCK_PARTS),g,false).forEach(m=>{m.castShadow=false;});
      const shade = new THREE.Mesh(geos.shadow,mats.shadow); shade.scale.set(1.7,1,3); shade.position.y=.03;g.add(shade);
      streetGroup.add(g); streetLife.push({g:g,bounds:bounds,offset:i*21,resident:false});
    }
    districts.slice(0,10).forEach((d,i)=>{
      const g = new THREE.Group(); meshesFor(partsGeo('city-resident',RESIDENT_PARTS),g,false).forEach(m=>{m.castShadow=false;});
      streetGroup.add(g);
      streetLife.push({g:g,bounds:{minX:d.x-4.65,maxX:d.x+4.65,minZ:d.z-4.65,maxZ:d.z+4.65},offset:i*8,resident:true});
    });
    stepStreetLife(0,false);
  }
  function stepStreetLife(dt,ambient){
    if(rm()) streetTime=0; else if(ambient) streetTime+=dt;
    streetLife.forEach(a=>{
      const p=streetPose(a.bounds,streetTime*(a.resident?.28:1),a.offset);
      a.g.position.set(p.x,a.resident?TILE.padH+.035:0,p.z);a.g.rotation.y=p.turn;
      if(a.resident && ambient) a.g.position.y+=Math.abs(Math.sin(streetTime*4+a.offset))*.025;
    });
  }

  /* ---------- authored places ----------
     A look with an authored GLB (world.js ASSETS) is drawn from it: one file
     per url, loaded once, cloned per district with its skeletons, and given
     its own copies of the materials so one project's state recolours and
     dims its place alone. Its status lights share one material; each worker
     gets its own slice of every clip, so each can do something different. */
  const loader = new THREE.GLTFLoader();
  const assetFiles = new Map();          // url -> Promise of the parsed file and its measured bounds
  function loadAsset(spec){
    let p = assetFiles.get(spec.url);
    if(!p){
      p = new Promise((res, rej) => loader.load(spec.url, gltf => {
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        res({ gltf: gltf, box: box });
      }, undefined, rej));
      assetFiles.set(spec.url, p);
    }
    return p;
  }
  const trackTarget = name => name.slice(0, name.lastIndexOf('.'));
  function buildAsset(t, spec, file){
    const box = file.box, k = spec.span / (box.max.x - box.min.x);
    const inst = THREE.cloneSkinned(file.gltf.scene);
    inst.scale.setScalar(k);
    inst.position.set(-(box.min.x + box.max.x) / 2 * k, TILE.padH - box.min.y * k, -(box.min.z + box.max.z) / 2 * k);
    const copies = new Map();
    let status = null;
    inst.traverse(o => {
      if(!o.isMesh) return;
      let m = copies.get(o.material);
      if(!m){
        m = o.material.clone();
        if(reflects(m)){ m.envMap = sky; m.envMapIntensity = LIGHT.sky; }
        m.userData.base = m.color.clone();
        m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
        copies.set(o.material, m);
        if(m.name === ASSET_STATUS_MATERIAL) status = m;
      }
      o.material = m;
      o.castShadow = m !== status;
      o.receiveShadow = m !== status;
      /* A skinned worker moves outside its bind-pose bounds. */
      if(o.isSkinnedMesh) o.frustumCulled = false;
    });
    const mixer = new THREE.AnimationMixer(inst);
    const crew = [];
    inst.children.forEach(rig => {
      const pose = rig.userData && rig.userData.worker_pose;
      if(!pose) return;
      const names = new Set();
      rig.traverse(o => names.add(o.name));
      const clips = {};
      file.gltf.animations.forEach(c => {
        const tracks = c.tracks.filter(tr => names.has(trackTarget(tr.name)));
        if(tracks.length) clips[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
      });
      crew.push({ rig: rig, authored: 'MC_' + pose, clips: clips, action: null, pace: 0 });
    });
    return { root: inst, mixer: mixer, crew: crew, status: status, materials: Array.from(copies.values()),
             height: TILE.padH + (box.max.y - box.min.y) * k, fading: 0 };
  }
  /* The recipe gives way to the authored place, or comes back if it fails. */
  function showAsset(t, on){
    t.recipe.forEach(o => { o.visible = !on; });
    t.assetPad.forEach(o => { o.visible = on; });
    if(t.asset) t.asset.root.visible = on;
    t.height = on && t.asset ? t.asset.height : placeHeight(t.theme);
    t.assetState = on ? 'on' : 'failed';
    renderer.shadowMap.needsUpdate = true;
  }
  function settleAsset(t){
    if(t.settled) return;
    t.settled = true;
    S.pending = Math.max(0, S.pending - 1);
    if(S.order.length && S.w){ S.reroom = 0; relayout(); reframe(); }
    S.dirty = true;
    wake();
  }
  function startAsset(t, spec){
    t.assetState = 'loading';
    S.pending++;
    const late = setTimeout(() => { if(!t.asset && !S.destroyed){ showAsset(t, false); settleAsset(t); } }, ASSET_WAIT_MS);
    loadAsset(spec).then(file => {
      if(S.destroyed || t.dropped) return;
      t.asset = buildAsset(t, spec, file);
      t.root.add(t.asset.root);
      applyAssetState(t, t.state, true);
      showAsset(t, true);
      /* Programs are compiled before the place is shown, so its first frame
         does not stall; a browser without the async path draws it anyway. */
      return (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).catch(() => {});
    }).catch(() => {
      if(!S.destroyed && !t.dropped) showAsset(t, false);
    }).then(() => { clearTimeout(late); if(!S.destroyed && !t.dropped) settleAsset(t); });
  }

  /* Status lights the rim, the beacon and every helmet, only when known;
     a paused place is the same place in lower light; each worker does what
     its role does in this state (world.js assetCrew). Properties only. */
  function applyAssetState(t, item, snap){
    const a = t.asset;
    if(!a) return;
    const quiet = item.workerState === 'quiet';
    a.materials.forEach(m => {
      if(m === a.status) return;
      m.color.copy(m.userData.base).multiplyScalar(quiet ? DIM : 1);
      if(m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive).multiplyScalar(quiet ? DIM : 1);
    });
    if(a.status){
      const hue = parseColour(rawToken(t.button, '--sig'));
      if(item.recorded && hue){
        a.status.color.copy(hue.c);
        a.status.emissive.copy(hue.c);
        a.status.emissiveIntensity = LIGHT.status * (quiet ? DIM : 1);
      } else {
        a.status.color.copy(col('ink'));
        a.status.emissive.setRGB(0, 0, 0);
      }
    }
    const still = rm();
    a.crew.forEach(w => {
      const plan = assetCrew(item.workerState, w.authored);
      w.rig.visible = !!plan;
      if(!plan) return;
      const clip = w.clips[plan.clip] || w.clips[w.authored];
      if(!clip) return;
      const next = a.mixer.clipAction(clip, a.root);
      w.pace = still ? 0 : plan.pace;
      if(next === w.action){ next.timeScale = w.pace; return; }
      next.enabled = true;
      next.reset();
      next.timeScale = w.pace;
      next.play();
      if(w.action && !snap && !still){
        w.action.crossFadeTo(next, CLIP_FADE_S, false);
        a.fading = performance.now() + CLIP_FADE_S * 1000;
      } else if(w.action) w.action.stop();
      w.action = next;
    });
    /* The new pose is drawn even when nothing is advancing. */
    a.mixer.update(0);
    renderer.shadowMap.needsUpdate = true;
  }

  /* ---------- a district ---------- */
  function makeTile(item){
    const t = { id: item.id, theme: item.theme, state: {}, x: 0, z: 0, row: 0, pose: null, celebrate: 0, lifeT: 0,
                labelW: 0, labelH: 0, labelDirty: true, room: { w: 96, h: WORLD.labelPx }, height: placeHeight(item.theme) };
    /* Its button first: the district's colours are the page's, read from it.
       It is the keyboard's stop and the accessible name; its box takes no
       taps, and its label takes one only while it can be read. */
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'world-tile theme-' + item.theme;
    b.id = 'tile-' + item.id;
    b.setAttribute('data-project', item.id);
    const label = document.createElement('span');
    label.className = 'world-label';
    const name = document.createElement('span');
    name.className = 'world-name';
    const badge = document.createElement('span');
    badge.className = 'world-badge';
    label.appendChild(name);
    label.appendChild(badge);
    b.appendChild(label);
    b.addEventListener('click', () => { if(H.onTap) H.onTap(item.id); });
    layer.appendChild(b);
    Object.assign(t, { button: b, label: label, nameEl: name, badgeEl: badge });

    const tint = tokenOf(b, '--tint'), terrain = tokenOf(b, '--terrain');
    t.tint = tint ? tint.c : col('stone');
    const tintOf = { tint: t.tint, terrain: terrain ? terrain.c : col('plinth') };

    t.root = new THREE.Group();
    t.content = new THREE.Group();
    t.content.rotation.y = WORLD.tileTurn;
    t.content.position.y = TILE.padH;
    t.content.scale.setScalar(TILE.content);
    t.root.add(t.content);
    const recipeMeshes = meshesFor(placeGeo(item.theme, tintOf), t.content, true, true);
    const contact = new THREE.Mesh(geos.shadow, mats.shadow);
    contact.position.set(-.25,.015,-.45); contact.scale.set(6.6,1,5.8); contact.renderOrder=1;
    t.content.add(contact);
    /* Warm light spill is a bounded painted pool, not an expensive light per window. */
    for(const x of [-1.3,1.3]){
      const pool = new THREE.Mesh(geos.shadow, mats.spill);
      pool.position.set(x,.018,2.05); pool.scale.set(3.4,1,2.6); pool.renderOrder=1;
      t.content.add(pool);
    }

    /* The beacon's lamp, and a halo that faces the camera. */
    const lampPos = new THREE.Vector3(BEACON.x, BEACON.mast + BEACON.lamp * 0.6, BEACON.z);
    t.lamp = new THREE.Mesh(geos.lamp, mats.lampOff);
    t.lamp.position.copy(lampPos);
    t.content.add(t.lamp);
    t.halo = new THREE.Mesh(geos.halo, mats.lampOff);
    t.halo.position.copy(lampPos).multiplyScalar(TILE.content).applyAxisAngle(new THREE.Vector3(0, 1, 0), WORLD.tileTurn);
    t.halo.position.y += TILE.padH;
    t.halo.renderOrder = 3;
    t.halo.visible = false;
    t.root.add(t.halo);

    /* The crew: one worker, every station built once and shown one at a time. */
    const env = environmentFor(item.theme);
    const w = t.worker = new THREE.Group();
    w.position.set(env.crew.x, 0, env.crew.z);
    w.scale.setScalar(TILE.crew / TILE.content);
    w.rotation.y = CREW_FACING;
    t.content.add(w);
    t.rig = makeRig(w, null);
    t.stations = {};
    Object.keys(STATIONS).forEach(k => {
      const g = new THREE.Group();
      g.visible = false;
      meshesFor(partsGeo('station-' + k, STATIONS[k].parts), g, true);
      w.add(g);
      t.stations[k] = g;
    });
    t.hands = {};
    Object.keys(HAND_PROPS).forEach(k => {
      const g = new THREE.Group();
      g.visible = false;
      meshesFor(partsGeo('hand-' + k, HAND_PROPS[k]), g, true);
      (k === 'clipboard' ? t.rig.armL : t.rig.armR).add(g);
      t.hands[k] = g;
    });

    /* The place's own life: each element's copies, at rest until its
       project is known to be under way. */
    t.life = [];
    (env.life || []).forEach((el, n) => {
      for(let i = 0; i < (el.copies || 1); i++){
        const g = new THREE.Group(), origin = lifeOrigin(el, i);
        g.position.set(origin[0], origin[1], origin[2]);
        let rig = null;
        if(el.rig === 'runner'){
          const inner = new THREE.Group();
          inner.scale.setScalar(TILE.crew / TILE.content);
          g.add(inner);
          rig = makeRig(inner, shirtMat(item.theme, t.tint));
        } else meshesFor(partsGeo('life-' + item.theme + '-' + n, el.parts, t.tint), g, true);
        t.content.add(g);
        t.life.push({ el: el, i: i, g: g, origin: origin, rig: rig });
      }
    });
    /* An authored place stands on the plain pad; the recipe, its crew, its
       life, its beacon and its painted light are the fallback. */
    t.recipe = recipeMeshes.concat([contact, t.lamp, t.halo, t.worker], t.life.map(L => L.g),
      t.content.children.filter(o => o.isMesh && o.material === mats.spill));
    t.assetPad = [];
    const spec = assetFor(item.theme);
    if(spec){
      t.assetPad = meshesFor(partsGeo('asset-pad', padParts().slice(0, 1)), t.content, true, true);
      t.assetPad.forEach(o => { o.visible = false; });
      t.height = assetHeight(item.theme);
      startAsset(t, spec);
    }
    scene.add(t.root);
    return t;
  }

  function dropTile(t){
    t.dropped = true;
    if(t.assetState === 'loading' && !t.settled){ t.settled = true; S.pending = Math.max(0, S.pending - 1); }
    scene.remove(t.root);
    if(selectMesh.parent === t.content) t.content.remove(selectMesh);
    if(t.button.parentNode) t.button.parentNode.removeChild(t.button);
  }

  /* Properties only: materials, visibility and text. Nothing is rebuilt. */
  function applyState(t, item, now){
    const prev = t.state;
    const changed = k => prev[k] !== item[k];
    const b = t.button;
    if(changed('signal') || changed('selected') || changed('theme')){
      b.className = 'world-tile theme-' + item.theme + ' sig-' + item.signal + (item.selected ? ' is-selected' : '') +
        (t.hiddenLabel ? ' is-hidden' : '') + (t.off ? ' is-off' : '');
    }
    if(changed('selected')) b.setAttribute('aria-pressed', String(!!item.selected));
    if(changed('spoken')) b.setAttribute('aria-label', item.spoken || item.name);
    if(changed('name')){ t.nameEl.textContent = item.name; t.labelDirty = true; }
    if(changed('badge')){ t.badgeEl.innerHTML = item.badge || ''; t.labelDirty = true; }

    const quiet = item.workerState === 'quiet';
    if(changed('workerState') || changed('signal') || changed('recorded')){
      /* Status lights the lamp and the helmet; no record leaves it dark. */
      const hue = rawToken(b, '--sig');
      const sm = parseColour(hue) ? signalMat(hue) : null;
      t.lamp.material = item.recorded && sm ? sm.lamp : mats.lampOff;
      t.halo.material = item.recorded && sm ? sm.halo : mats.lampOff;
      t.halo.visible = !!(item.recorded && sm);
      t.rig.helmet.material = sm ? sm.helmet : mats.lampOff;
      t.content.traverse(o => { if(o.isMesh && o.userData.dimmable) o.material = mats[o.userData.finish + (quiet ? 'Dim' : '')]; });
      t.rig.suits.forEach(m => { m.material = quiet ? mats.suitDim : mats.suit; });
      t.rig.skull.material = quiet ? mats.skinDim : mats.skin;
      const crew = CREW[item.workerState];
      t.worker.visible = !!crew;
      Object.keys(t.stations).forEach(k => { t.stations[k].visible = !!crew && crew.station === k; });
      const hand = crew && STATIONS[crew.station] ? STATIONS[crew.station].hand : null;
      Object.keys(t.hands).forEach(k => { t.hands[k].visible = hand === k; });
      /* Release ready acknowledges once, on the change itself: never on a
         first draw, a refresh or a reload. */
      if(!S.first && prev.workerState && prev.workerState !== 'celebrating' && item.workerState === 'celebrating' && !rm()) t.celebrate = now;
      if(item.workerState !== 'celebrating') t.celebrate = 0;
      if(S.first || rm()) t.pose = null;       // snap, no blend
      /* A place that stops holds its first moment, not wherever it was. */
      if(!lifeActive(item.workerState, false)) t.lifeT = 0;
    }
    if(t.asset && (changed('workerState') || changed('signal') || changed('recorded'))) applyAssetState(t, item, S.first || rm());
    /* The recipe's crew and beacon stay away while the authored place is drawn. */
    if(t.assetState === 'on') t.recipe.forEach(o => { o.visible = false; });
    if(item.selected && selectMesh.parent !== t.content) t.content.add(selectMesh);
    t.state = Object.assign({}, item, { attention: (item.attention || []).slice() });
  }

  /* Labels are measured here, when their words or their width change,
     never in a frame. Returns whether any label's room changed. */
  function measureLabels(){
    let changed = false;
    S.tiles.forEach(t => {
      if(!t.labelDirty) return;
      t.labelW = t.label.offsetWidth; t.labelH = t.label.offsetHeight; t.labelDirty = false;
      const room = { w: Math.max(40, t.labelW), h: Math.max(20, t.labelH + 6) };
      if(Math.abs(room.h - t.room.h) > 2 || Math.abs(room.w - t.room.w) > 6){ t.room = room; changed = true; }
    });
    return changed;
  }

  /* ---------- layout and camera ---------- */
  function relayout(depth){
    const heights = S.order.map(id => S.tiles.get(id).height), rooms = S.order.map(id => S.tiles.get(id).room);
    const pick = chooseLayout(S.order.length, S.w, S.h, heights, rooms);
    S.cols = pick.cols;
    S.order.forEach((id, i) => {
      const t = S.tiles.get(id), d = pick.districts[i];
      t.x = d.x; t.z = d.z; t.row = d.row;
      t.root.position.set(d.x, 0, d.z);
    });
    S.island = buildLand(pick.districts);
    S.over = pick.frame;
    /* A label is never wider than its district is drawn at the overview. */
    const maxW = Math.max(100, Math.round(pick.size * 1.1));
    if(maxW !== S.labelMax){
      S.labelMax = maxW;
      layer.style.setProperty('--label-max', maxW + 'px');
      S.tiles.forEach(t => { t.labelDirty = true; });
      if(measureLabels() && (depth || 0) < 2) relayout((depth || 0) + 1);
    }
  }
  const districtOf = t => ({ x: t.x, z: t.z, row: t.row });

  function targetFor(mode){
    const sel = S.selected && S.tiles.get(S.selected);
    if(mode === 'focus' && sel) return focusFrame(districtOf(sel), sel.height, sel.room, S.over, S.w, S.h, S.signRoom);
    return S.over;
  }

  function goTo(frame, mode, instant){
    S.mode = mode;
    if(!S.frame || instant || rm() || !awake()){
      S.frame = frame; S.from = S.to = null;
    } else if(!sameFrame(S.frame, frame)){
      S.from = S.frame; S.to = frame; S.t0 = performance.now();
    }
    wake();
  }

  function stepCamera(now){
    if(!S.to) return false;
    const k = (now - S.t0) / WORLD.transitionMs;
    if(k >= 1){ S.frame = S.to; S.from = S.to = null; return false; }
    S.frame = mixFrame(S.from, S.to, k);
    return true;
  }

  function aimCamera(){
    const e = eyeOf(S.frame);
    camera.position.set(e[0], e[1], e[2]);
    camera.lookAt(S.frame.x, 0, S.frame.z);
    S.tiles.forEach(t => { t.halo.quaternion.copy(camera.quaternion); });
  }

  function resize(){
    const r = view.getBoundingClientRect();
    /* A hidden hub (another tab) measures nothing; keep the last shape. */
    if(r.width < 2 || r.height < 2) return;
    const w = Math.round(r.width), h = Math.round(r.height);
    const dpr = Math.min(S.dprCap, pixelRatioFor(window.devicePixelRatio || 1, w, h));
    if(w === S.w && h === S.h && dpr === S.dpr) return;
    const shaped = w !== S.w || h !== S.h;
    S.w = w; S.h = h; S.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if(!S.order.length || !shaped) return;
    S.reroom = 0;
    relayout();
    reframe();
  }

  /* The same mode and the same selection in a new shape. A pan keeps its
     target and is only held on the island. */
  function reframe(){
    if(S.mode === 'free' && S.frame) goTo(clampFrame(S.to || S.frame, S.island), 'free', true);
    else goTo(targetFor(S.mode), S.mode, true);
  }

  /* ---------- labels and the sign: transforms only ---------- */
  function placeLabels(){
    const f = S.frame, W = S.w, Hh = S.h, rects = [];
    let signRect = null, inView = false;
    const sel = S.selected && S.tiles.get(S.selected);
    if(sel){
      /* The card stays whole inside the view; its stem still points at the
         roof, unless the card has had to come down over it. */
      const a = project(signAnchor(districtOf(sel), sel.height), f, W, Hh), room = S.signRoom || WORLD.sign;
      const x = Math.round(a.x), y = Math.round(a.y), half = Math.ceil(room.w / 2);
      const cx = Math.round(Math.min(Math.max(x, half), Math.max(half, W - half))), cy = Math.max(y, Math.ceil(room.h));
      inView = x >= 0 && x <= W && y >= 0 && y <= Hh;
      const stem = cy === y ? x - cx : null;
      if(cx !== S.signX || cy !== S.signY){ S.signX = cx; S.signY = cy; sign.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)'; }
      if(stem !== S.signStem){
        S.signStem = stem;
        signStem.style.transform = stem === null ? 'scaleY(0)' : 'translate3d(' + stem + 'px,0,0)';
      }
      /* A label the sign would cover is not there while the sign is, close on a place; from further out the sign gives way. */
      if(inView && S.signFor === S.selected) signRect = { id: SIGN, row: -1, x: cx - half, y: cy - Math.ceil(room.h), w: half * 2, h: Math.ceil(room.h) };
    }
    S.order.forEach(id => {
      const t = S.tiles.get(id), a = project(labelAnchor(districtOf(t)), f, W, Hh);
      const x = Math.round(a.x - t.labelW / 2), y = Math.round(a.y + 2);
      if(x !== t.px || y !== t.py){ t.px = x; t.py = y; t.button.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; }
      const c = project([t.x, 0, t.z], f, W, Hh);
      t.off = c.x < -40 || c.x > W + 40 || c.y < -40 || c.y > Hh + 40;
      rects.push({ id: id, row: t.row, x: x, y: y, w: t.labelW, h: t.labelH });
    });
    const res = resolveWithSign(rects, signRect, [S.focused, SIGN, S.selected], W, Hh, S.mode === 'focus'), shown = res.shown;
    const signOn = inView && (signRect ? res.sign : true);
    if(sel && signOn !== S.signShown){ S.signShown = signOn; sign.classList.toggle('is-away', !signOn); }
    S.order.forEach(id => {
      const t = S.tiles.get(id), hidden = !shown[id];
      if(hidden !== t.hiddenLabel || t.off !== t.wasOff){
        t.hiddenLabel = hidden; t.wasOff = t.off;
        t.button.classList.toggle('is-hidden', hidden);
        t.button.classList.toggle('is-off', t.off);
      }
    });
    /* Overview is offered whenever the whole world is not in view; at the
       overview it would cover a place and do nothing. */
    const atOverview = S.mode === 'overview' && !S.to;
    if(overviewBtn.hidden !== atOverview){
      const had = document.activeElement === overviewBtn;
      overviewBtn.hidden = atOverview;
      if(had && atOverview){
        const t = S.tiles.get(S.selected) || S.tiles.get(S.order[0]);
        if(t) try{ t.button.focus({ preventScroll: true }); }catch(e){}
      }
    }
  }

  /* The sign over the selected place says its status and what needs you,
     and comes in with a short rise when the selection changes. */
  function updateSign(item){
    if(!item){
      if(S.signFor){ S.signFor = null; sign.classList.remove('is-in'); }
      return;
    }
    if(item.sign !== S.signHtml){
      S.signHtml = item.sign; signCard.innerHTML = item.sign || '';
      /* Measured here, when its words change, so a focus leaves it room. */
      const w = signCard.offsetWidth, h = signCard.offsetHeight;
      S.signRoom = w > 0 && h > 0 ? { w: w + 8, h: h + 14 } : null;
    }
    if(item.id !== S.signFor){
      S.signFor = item.id;
      sign.classList.remove('is-in');
      /* The entrance starts two frames on, so the browser has drawn it away
         first; Reduce Motion shows it at once. */
      S.signEnter = 2;
    }
  }

  /* ---------- crews, life and beacons ---------- */
  function ambientWanted(now){
    if(rm() || now - S.lastWake > WORLD.ambientSeconds * 1000) return false;
    if(streetLife.length) return true;
    for(const t of S.tiles.values()){
      if(t.asset && t.asset.root.visible && t.asset.crew.some(w => w.rig.visible && w.pace > 0)) return true;
      if(crewLoops(t.state.workerState, false) || lifeActive(t.state.workerState, false) || (t.state.attention && t.state.attention.length)) return true;
    }
    return false;
  }

  /* Returns true while a worker is still settling or acknowledging. */
  function stepCrews(now, dt, ambient){
    let busy = false;
    const time = now / 1000;
    S.tiles.forEach(t => {
      const state = t.state.workerState;
      if(!CREW[state]) return;
      let once = null;
      if(t.celebrate){
        once = (now - t.celebrate) / CELEBRATE_MS;
        if(once >= 1){ t.celebrate = 0; once = null; } else busy = true;
      }
      const moving = ambient && crewLoops(state, false);
      const target = poseFor(state, moving ? time + t.row * 0.7 + t.x * 0.05 : 0, once);
      if(!t.pose || rm()) t.pose = Object.assign({}, target);
      else {
        const k = 1 - Math.exp(-dt / POSE_EASE_S);
        let gap = 0;
        Object.keys(target).forEach(j => {
          if(typeof target[j] !== 'number'){ t.pose[j] = target[j]; return; }
          const d = target[j] - t.pose[j];
          t.pose[j] += d * k;
          gap = Math.max(gap, Math.abs(d));
        });
        if(gap > 0.004) busy = true;
      }
      applyPose(t.rig, t.pose);
    });
    return busy;
  }

  /* A place's life advances only while its project is under way and the
     world is lively; after five untouched minutes it holds where it is, and
     under Reduce Motion it shows its first moment. */
  function stepLife(dt, ambient){
    const still = rm();
    S.tiles.forEach(t => {
      if(still) t.lifeT = 0;
      else if(ambient && lifeActive(t.state.workerState, false)) t.lifeT += dt * lifeSpeed(t.state.workerState);
      const time = t.lifeT;
      t.life.forEach(L => {
        const p = lifePose(L.el, time, L.i);
        L.g.position.set(L.origin[0] + p.p[0], L.origin[1] + p.p[1], L.origin[2] + p.p[2]);
        L.g.rotation.set(p.r[0], p.r[1], p.r[2]);
        L.g.scale.setScalar(p.s);
        if(L.rig) applyPose(L.rig, poseFor('running', time, null));
      });
    });
  }

  /* Authored workers play while the world is lively; a crossfade finishes
     even when it is not. Returns true while one is still blending. The
     cached shadow map follows them at LIGHT.shadowRefreshMs, only while
     they move. */
  function stepAssets(now, dt, ambient){
    let blending = false, moved = false;
    S.tiles.forEach(t => {
      const a = t.asset;
      if(!a || !a.root.visible) return;
      const fading = a.fading > now;
      if((ambient && !rm()) || fading){
        a.mixer.update(dt);
        /* At the overview a worker is a few pixels tall: its shadow is not
           worth a depth pass of the whole city. */
        if(districtPx(districtOf(t), S.frame, S.w, S.h) >= LIGHT.shadowMinPx) moved = true;
      }
      if(fading) blending = true;
    });
    if(moved && now - S.shadowAt >= LIGHT.shadowRefreshMs){ S.shadowAt = now; S.shadowRefreshes++; renderer.shadowMap.needsUpdate = true; }
    return blending;
  }

  function stepBeacons(now, ambient){
    const breath = ambient ? 0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 / BREATH_S) : 0.5;
    signalMats.forEach(m => { m.halo.opacity = 0.4; });
    S.tiles.forEach(t => {
      const a = t.asset;
      if(a && a.status && a.root.visible && t.state.recorded){
        const attention = t.state.attention && t.state.attention.length;
        a.status.emissiveIntensity = LIGHT.status * (t.state.workerState === 'quiet' ? DIM : attention ? 0.75 + 0.5 * breath : 1);
      }
      if(!t.halo.visible) return;
      const attention = t.state.attention && t.state.attention.length;
      if(attention){ t.halo.material.opacity = 0.35 + 0.4 * breath; t.halo.scale.setScalar(0.9 + 0.2 * breath); }
      else t.halo.scale.setScalar(0.85);
    });
  }

  /* ---------- the one loop ---------- */
  function awake(){ return !S.destroyed && !S.lost && !S.failed && S.onscreen && !S.covered && !document.hidden; }
  function wake(){ S.lastWake = performance.now(); requestFrame(); }
  function requestFrame(){
    if(S.raf || !awake()) return;
    S.raf = requestAnimationFrame(tick);
  }

  function tick(now){
    S.raf = 0;
    if(!awake() || !S.frame) return;
    /* At most about 60 frames a second, even on a 120 Hz screen. */
    if(S.lastRender && now - S.lastRender < WORLD.frameMinMs && !S.dirty){
      S.raf = requestAnimationFrame(tick);
      return;
    }
    const began = performance.now();
    const moving = stepCamera(now);
    const ambient = ambientWanted(now);
    const gapMs = S.lastTick ? now - S.lastTick : 0;
    const dt = Math.min(0.1, gapMs ? gapMs / 1000 : 0.016);
    S.lastTick = now;
    const settling = stepCrews(now, dt, ambient);
    stepLife(dt, ambient);
    stepStreetLife(dt, ambient);
    const blending = stepAssets(now, dt, ambient);
    stepBeacons(now, ambient);
    aimCamera();
    try{
      renderer.render(scene, camera);
    }catch(e){
      fail('render');
      return;
    }
    S.frames++;
    S.lastRender = now;
    S.dirty = false;
    placeLabels();
    if(S.signEnter && --S.signEnter === 0 && S.signFor) sign.classList.add('is-in');
    const spent = performance.now() - began;
    S.cost = S.cost ? S.cost * 0.9 + spent * 0.1 : spent;
    /* The first frame with every authored place settled (drawn, or given back
       to its recipe) is the one that is shown. */
    if(view.style.visibility && !S.pending){
      view.style.visibility = '';
      /* The first frame is on screen: the app may hand the field over. */
      if(H.onReady) H.onReady();
    }
    const again = moving || ambient || settling || blending || S.signEnter > 0;
    /* Frames that keep coming slowly lower the drawing resolution a step. */
    if(again && gapMs > 0 && gapMs < 250){
      S.slowSum += gapMs; S.slowCount++;
      if(S.slowCount >= 45){
        if(S.slowSum / S.slowCount > WORLD.slowFrameMs && S.dpr > WORLD.minPixelRatio){
          S.dprCap = nextPixelRatio(S.dpr);
          S.dpr = 0;
          resize();
        }
        S.slowSum = 0; S.slowCount = 0;
      }
    }
    if(again) S.raf = requestAnimationFrame(tick);
    else { S.lastTick = 0; S.slowSum = 0; S.slowCount = 0; }
  }

  function fail(reason){
    if(S.failed || S.destroyed) return;
    S.failed = true;
    if(S.raf){ cancelAnimationFrame(S.raf); S.raf = 0; }
    /* Out of the current call stack: the app swaps renderers from here. */
    setTimeout(() => { if(H.onFail) H.onFail(reason); }, 0);
  }

  /* ---------- gestures ---------- */
  const arb = createArbiter();
  function panBy(dx, dy){
    if(!S.frame) return;
    S.from = S.to = null;
    S.mode = 'free';
    S.frame = panFrame(S.frame, dx, dy, S.w, S.h, S.island);
    S.dirty = true;
    wake();
  }
  const on = [];
  function listen(el, type, fn, opts){ el.addEventListener(type, fn, opts); on.push([el, type, fn, opts]); }
  const onIsland = e => e.target === canvas || e.target === view || e.target === layer;

  listen(view, 'pointerdown', e => {
    S.swallowUntil = 0;
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    if(e.target.closest && e.target.closest('.world-overview')) return;
    arb.down(e.pointerId, e.clientX, e.clientY);
    S.downOnIsland = onIsland(e);
    wake();
  });
  listen(view, 'pointermove', e => {
    const r = arb.move(e.pointerId, e.clientX, e.clientY);
    if(!r) return;
    if(r.type === 'pan-start'){
      try{ view.setPointerCapture(e.pointerId); }catch(err){}
      view.classList.add('is-panning');
    }
    panBy(r.dx, r.dy);
  });
  const swallowNextClick = () => { S.swallowUntil = performance.now() + CLICK_AFTER_MS; };
  const endPan = () => { view.classList.remove('is-panning'); swallowNextClick(); };
  listen(view, 'pointerup', e => {
    const r = arb.up(e.pointerId);
    if(!r) return;
    if(r.type === 'pan-end'){ endPan(); return; }
    /* A tap on the island lands on the district drawn there. */
    if(r.type === 'tap' && S.downOnIsland && S.frame){
      swallowNextClick();
      const box = view.getBoundingClientRect();
      const heights = S.order.map(id => S.tiles.get(id).height);
      const i = hitDistrict(S.order.map(id => districtOf(S.tiles.get(id))), heights, S.frame, S.w, S.h, r.x - box.left, r.y - box.top);
      if(i !== -1 && H.onTap) H.onTap(S.order[i]);
    }
  });
  const cancel = e => {
    const r = arb.cancel(e.pointerId);
    if(r && r.type === 'pan-end') endPan();
  };
  listen(view, 'pointercancel', cancel);
  listen(view, 'lostpointercapture', cancel);
  /* The click a drag or an island tap would also make never reaches a
     button: by then the camera may have moved a label under the finger,
     and a second tap would open a brief nobody asked for. A keyboard's
     click (detail 0) always goes through. */
  listen(view, 'click', e => {
    if(e.detail === 0 || performance.now() > S.swallowUntil) return;
    S.swallowUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  listen(overviewBtn, 'click', () => { if(S.over) goTo(targetFor('overview'), 'overview'); });
  /* A keyboard stop on a district brings it into view. */
  listen(layer, 'focusin', e => {
    const b = e.target.closest && e.target.closest('.world-tile');
    S.focused = b ? b.getAttribute('data-project') : null;
    const t = S.focused && S.tiles.get(S.focused);
    if(t && S.frame){
      const f = revealFrame(S.to || S.frame, districtOf(t), t.height, t.room, S.w, S.h, S.island);
      if(!sameFrame(f, S.to || S.frame)) goTo(f, 'free');
    }
    S.dirty = true;
    wake();
  });
  listen(layer, 'focusout', () => { S.focused = null; S.dirty = true; wake(); });

  /* ---------- lifecycle ---------- */
  const onLost = e => {
    e.preventDefault();
    S.lost = true;
    if(S.raf){ cancelAnimationFrame(S.raf); S.raf = 0; }
    clearTimeout(S.lostTimer);
    S.lostTimer = setTimeout(() => fail('context-lost'), LOST_GRACE_MS);
  };
  const onRestored = () => {
    clearTimeout(S.lostTimer);
    S.lost = false;
    renderer.shadowMap.needsUpdate = true;
    S.dirty = true;
    wake();
  };
  listen(canvas, 'webglcontextlost', onLost, false);
  listen(canvas, 'webglcontextrestored', onRestored, false);
  listen(document, 'visibilitychange', () => { if(!document.hidden) wake(); });

  let ro = null, io = null, mo = null, mq = null;
  const onMotion = () => {
    S.tiles.forEach(t => { t.pose = null; t.celebrate = 0; if(t.asset){ t.asset.crew.forEach(w => { if(w.action){ w.action.stop(); w.action = null; } }); applyAssetState(t, t.state, true); } });
    if(S.to){ S.frame = S.to; S.from = S.to = null; }
    S.dirty = true; wake();
  };
  try{ ro = new ResizeObserver(() => { resize(); S.dirty = true; wake(); }); ro.observe(view); }catch(e){}
  try{
    io = new IntersectionObserver(entries => {
      S.onscreen = entries[entries.length - 1].isIntersecting;
      if(S.onscreen) wake();
    });
    io.observe(view);
  }catch(e){}
  try{
    mo = new MutationObserver(() => {
      const covered = !!(H.covered && H.covered());
      if(covered !== S.covered){ S.covered = covered; if(!covered) wake(); }
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    S.covered = !!(H.covered && H.covered());
  }catch(e){}
  try{
    mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if(mq.addEventListener) mq.addEventListener('change', onMotion);
  }catch(e){ mq = null; }

  /* ---------- the seam ---------- */
  function draw(scene_){
    if(S.destroyed || S.failed) return;
    const now = performance.now();
    const items = Array.isArray(scene_) ? scene_ : [];
    const ids = items.map(i => i.id);
    let reshaped = ids.join('|') !== S.order.join('|');
    S.tiles.forEach((t, id) => {
      if(ids.indexOf(id) === -1 || t.theme !== (items.find(i => i.id === id) || {}).theme){ dropTile(t); S.tiles.delete(id); reshaped = true; }
    });
    items.forEach(item => { if(!S.tiles.has(item.id)) S.tiles.set(item.id, makeTile(item)); });
    /* Buttons in registry order: the keyboard follows reading order. */
    if(reshaped) ids.forEach(id => layer.appendChild(S.tiles.get(id).button));
    S.order = ids;
    const selItem = items.find(i => i.selected) || null;
    const sel = selItem ? selItem.id : null;
    if(!sel && selectMesh.parent) selectMesh.parent.remove(selectMesh);
    items.forEach(item => applyState(S.tiles.get(item.id), item, now));
    updateSign(selItem);
    if(!S.w) resize();
    const roomed = measureLabels();
    const relaid = (reshaped || (roomed && S.mode === 'overview' && S.reroom++ < 4)) && S.w;
    if(relaid) relayout();
    const was = S.selected;
    S.selected = sel;
    if(S.first || !S.frame){
      /* A first draw, or a reload: the whole world, whatever is selected. */
      goTo(targetFor('overview'), 'overview', true);
    } else if(sel && sel !== was){
      goTo(targetFor('focus'), 'focus');
    } else if(relaid){
      if(S.mode === 'overview') goTo(targetFor('overview'), 'overview', true);
      else reframe();
    }
    S.first = false;
    S.dirty = true;
    wake();
  }

  function focus(id){
    const t = S.tiles.get(id);
    if(t) try{ t.button.focus({ preventScroll: true }); }catch(e){}
  }

  function destroy(){
    if(S.destroyed) return;
    S.destroyed = true;
    if(S.raf) cancelAnimationFrame(S.raf);
    clearTimeout(S.lostTimer);
    on.forEach(([el, type, fn, opts]) => el.removeEventListener(type, fn, opts));
    try{ if(ro) ro.disconnect(); if(io) io.disconnect(); if(mo) mo.disconnect(); }catch(e){}
    try{ if(mq && mq.removeEventListener) mq.removeEventListener('change', onMotion); }catch(e){}
    const g = new Set(), m = new Set();
    scene.traverse(o => { if(o.isMesh){ g.add(o.geometry); m.add(o.material); } });
    placeGeos.forEach(set => Object.values(set).forEach(x => g.add(x)));
    partGeos.forEach(set => Object.values(set).forEach(x => g.add(x)));
    Object.values(geos).forEach(x => g.add(x));
    g.add(frameGeo);
    Object.values(mats).forEach(x => m.add(x));
    signalMats.forEach(x => { m.add(x.lamp); m.add(x.halo); m.add(x.helmet); });
    shirtMats.forEach(x => m.add(x));
    S.tiles.forEach(t => { if(t.asset){ t.asset.mixer.stopAllAction(); t.asset.materials.forEach(x => m.add(x)); } });
    assetFiles.forEach(p => p.then(file => file.gltf.scene.traverse(o => { if(o.isMesh){ o.geometry.dispose(); o.material.dispose(); } })).catch(() => {}));
    g.forEach(x => x.dispose());
    m.forEach(x => x.dispose());
    dot.dispose();
    sky.dispose();
    if(key.shadow.map) key.shadow.map.dispose();
    /* Hand the context back now rather than at garbage collection; one
       already lost has nothing to hand back. */
    let gone = true;
    try{ gone = renderer.getContext().isContextLost(); }catch(e){}
    if(!gone) try{ renderer.forceContextLoss(); }catch(e){}
    renderer.dispose();
    if(view.parentNode) view.parentNode.removeChild(view);
    S.tiles.clear();
  }

  /* What the QA reads: the last frame's cost, what is alive, and where each
     district's centre is drawn (to tap it). */
  function stats(){
    const info = renderer.info;
    const centres = {}, life = {};
    if(S.frame) S.tiles.forEach((t, id) => { const c = project([t.x, TILE.padH, t.z], S.frame, S.w, S.h); centres[id] = { x: Math.round(c.x), y: Math.round(c.y) }; });
    S.tiles.forEach((t, id) => { life[id] = Math.round(t.lifeT * 1000) / 1000; });
    return {
      revision: THREE.REVISION, drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures,
      programs: info.programs ? info.programs.length : null, frames: S.frames, frameMs: Math.round(S.cost * 100) / 100,
      width: S.w, height: S.h, pixelRatio: S.dpr, columns: S.cols, mode: S.mode,
      frame: S.frame ? { x: S.frame.x, z: S.frame.z, d: S.frame.d } : null,
      running: !!S.raf, awake: awake(), lost: S.lost, failed: S.failed, tiles: S.tiles.size,
      built: placeGeos.size + partGeos.size, traffic: streetTime, residents: streetLife.filter(a => a.resident).length, centres: centres, life: life,
      sign: S.signFor ? { id: S.signFor, x: S.signX, y: S.signY, shown: !!S.signShown } : null,
      shadowMap: key.shadow.mapSize.x, shadowRefreshes: S.shadowRefreshes, pending: S.pending,
      assets: Array.from(S.tiles.values()).filter(t => t.assetState).map(t => ({
        id: t.id, state: t.assetState, height: Math.round(t.height * 100) / 100,
        crew: t.asset ? t.asset.crew.map(w => ({ role: w.rig.name, clip: w.action ? w.action.getClip().name : null, pace: w.pace, shown: w.rig.visible })) : [],
        status: t.asset && t.asset.status ? '#' + t.asset.status.emissive.getHexString(THREE.SRGBColorSpace) : null
      }))
    };
  }

  /* What the QA measures: the whole cost of a frame, CPU and GPU, as the
     mean of n synchronous renders each finished by a one-pixel readback,
     with and without the shadow pass. Never called by the app. */
  function measure(n){
    const gl = renderer.getContext(), px = new Uint8Array(4), k = Math.max(1, n | 0);
    const time = shadow => {
      const t0 = performance.now();
      for(let i = 0; i < k; i++){
        renderer.shadowMap.needsUpdate = shadow;
        renderer.render(scene, camera);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      }
      return Math.round((performance.now() - t0) / k * 100) / 100;
    };
    time(false);
    const frameMs = time(false), calls = renderer.info.render.calls, triangles = renderer.info.render.triangles;
    return { frameMs: frameMs, frameWithShadowMs: time(true), calls: calls, triangles: triangles, shadowCalls: renderer.info.render.calls - calls };
  }

  return { draw: draw, focus: focus, destroy: destroy, stats: stats, measure: measure };
}
