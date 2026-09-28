/* =========================================================
   THE 3D FIELD
   ---------------------------------------------------------
   Draws Mission Control's projects as a miniature world with
   Three.js, behind the same seam as the SVG field. It is given
   a scene (ids, names, signals, crews, themes, which one is
   selected) and never reads storage, never fetches status,
   never decides one and never owns the selection: a tap is
   reported to the app, and the app's next draw says what is
   selected.

   One canvas, one scene, one orthographic camera that never
   turns. Geometry is built once per place and shared; a status
   change swaps a material or a visibility, it never rebuilds.
   One requestAnimationFrame loop, running only while something
   moves and someone can see it.

   The camera's frame ({ x, y, scale } in view units, see
   world.js) is transient: it lives here and is never stored.

   Every project keeps a real <button>: its tap target, its
   accessible name and its keyboard stop, projected onto its
   tile each frame.
   ========================================================= */
import * as THREE from '../vendor/three/three.min.js';
import {
  WORLD, TILE, SILHOUETTE, BEACON, layoutTiles, viewBounds, chooseLayout, overviewFrame,
  focusFrame, revealFrame, clampFrame, sameFrame, mixFrame, toView, toScreen, pixelRatioFor,
  resolveLabels, createArbiter, CREW, CREW_FACING, poseFor, crewLoops, PALETTE, environmentFor, STATIONS, HAND_PROPS
} from './world.js';

export const REVISION = THREE.REVISION;

const SIN = Math.sin(WORLD.elevation), COS = Math.cos(WORLD.elevation);
const DIM = 0.55;                // a paused place, lit at this share
const LOST_GRACE_MS = 2500;      // a lost context not back by then falls back to the SVG field
const CELEBRATE_MS = 1400;       // release ready's one acknowledgment
const BREATH_S = 2.6;            // an attention beacon's slow breath
const POSE_EASE_S = 0.12;        // how quickly a worker settles into a new pose

/* A tile's tap area: the plinth and the room above it for its buildings,
   cut from the button's box, so the box's empty corners take no tap meant
   for a neighbour. */
const HIT_SHAPE = (() => {
  const q = SILHOUETTE, w = q.halfW * 2, h = q.plinthBottom - q.top;
  const pt = (x, y) => ((x + q.halfW) / w * 100).toFixed(1) + '% ' + ((y - q.top) / h * 100).toFixed(1) + '%';
  return 'polygon(' + [pt(-q.halfW, 0), pt(-2.2, q.top), pt(2.2, q.top), pt(q.halfW, 0),
    pt(q.halfW, q.shoulder), pt(0, q.plinthBottom), pt(-q.halfW, q.shoulder)].join(', ') + ')';
})();

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
    case 'box':   g = new THREE.BoxGeometry(d[0], d[1], d[2]); break;
    case 'cyl':   g = new THREE.CylinderGeometry(d[0], d[0], d[1], n || 14); break;
    case 'cone':  g = new THREE.ConeGeometry(d[0], d[1], n || 14); break;
    case 'ball':  g = new THREE.SphereGeometry(d[0], n || 10, Math.max(4, Math.round((n || 10) * 0.6))); break;
    case 'ring':  g = new THREE.RingGeometry(d[0], d[1], n || 40); g.rotateX(-Math.PI / 2); break;
    case 'torus': g = new THREE.TorusGeometry(d[0], d[1], 6, n || 20); break;
    default: return null;
  }
  if(part.k) g.scale(part.k[0], part.k[1], part.k[2]);
  if(part.r) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(part.r[0], part.r[1], part.r[2])));
  g.computeBoundingBox();
  g.translate(part.p[0], part.p[1] - g.boundingBox.min.y, part.p[2]);
  if(part.grow) g.scale(part.grow, part.grow, part.grow);
  return g.index ? g.toNonIndexed() : g;
}

/* Parts merged into one geometry per finish, each vertex carrying its
   part's colour: a whole place is three draw calls. */
function mergeParts(parts, colourOf){
  const out = {};
  parts.forEach(part => {
    const g = partGeometry(part);
    if(!g) return;
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
  const geos = {};
  Object.keys(out).forEach(m => {
    const b = out[m], g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.computeBoundingSphere();
    geos[m] = g;
  });
  return geos;
}

/* The plinth under every place: a dark base, a seam of the project's own
   light, and a top of its own ground. */
function plinthParts(){
  const t = TILE, box = (y, h, side, m, c) => ({ s: 'box', p: [0, y, 0], d: [side, h, side], m: m, c: c });
  return [
    box(-t.baseDepth, t.baseDepth - t.topDepth - t.seam, t.baseHalf * 2, 'matte', 'plinth'),
    box(-t.topDepth - t.seam, t.seam, t.half * 2 + 0.24, 'glow', 'tint'),
    box(-t.topDepth, t.topDepth, t.half * 2, 'matte', 'terrain'),
    { s: 'box', p: [BEACON.x, 0, BEACON.z], d: [0.36, 0.12, 0.36], m: 'metal', c: 'steel' },
    { s: 'box', p: [BEACON.x, 0.12, BEACON.z], d: [0.09, BEACON.mast - 0.12, 0.09], m: 'metal', c: 'steel' },
    { s: 'cyl', p: [BEACON.x, BEACON.mast - 0.05, BEACON.z], d: [BEACON.lamp + 0.06, 0.08], n: 12, m: 'metal', c: 'steel' }
  ];
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
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

/* ---------- the world ---------- */
export function createWorld(host, hooks){
  const H = hooks || {};
  const root = document.documentElement;
  const rm = () => { try{ return !!(H.reducedMotion && H.reducedMotion()); }catch(e){ return false; } };

  /* DOM: the viewport, its canvas, the button layer and the Overview control. */
  const view = document.createElement('div');
  view.className = 'world-view';
  view.style.visibility = 'hidden';
  const canvas = document.createElement('canvas');
  canvas.className = 'world-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const layer = document.createElement('div');
  layer.className = 'world-layer';
  const overviewBtn = document.createElement('button');
  overviewBtn.type = 'button';
  overviewBtn.className = 'world-overview';
  overviewBtn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">' +
    '<path d="M8 1.8 11 4.8 8 7.8 5 4.8Z"/><path d="M4.2 5.6 7.2 8.6 4.2 11.6 1.2 8.6Z"/><path d="M11.8 5.6 14.8 8.6 11.8 11.6 8.8 8.6Z"/><path d="M8 9.4 11 12.4 8 15.4 5 12.4Z"/></svg>' +
    '<span>Overview</span>';
  overviewBtn.setAttribute('aria-label', 'Overview: show every project');
  view.appendChild(canvas);
  view.appendChild(layer);
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
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);

  const S = {
    w: 0, h: 0, dpr: 1, frame: null, from: null, to: null, t0: 0, mode: 'overview',
    tiles: new Map(), order: [], selected: null, focused: null, first: true,
    bounds: null, cols: 0, raf: 0, lastRender: 0, lastTick: 0, lastWake: 0,
    onscreen: true, covered: false, lost: false, lostTimer: 0, destroyed: false, failed: false,
    frames: 0, cost: 0, swallowClick: false, labelMax: 0, dirty: false, room: WORLD.labelPx, reroom: 0
  };

  /* ---------- shared resources ---------- */
  const palette = {};
  Object.keys(PALETTE).forEach(k => { palette[k] = tokenOf(root, PALETTE[k]); });
  const fallback = palette.stone || { c: new THREE.Color(0.8, 0.8, 0.8), a: 1 };
  const col = name => (palette[name] || fallback).c;

  const light = palette.lightKey ? palette.lightKey.c : col('stone');
  const hemi = new THREE.HemisphereLight(palette.lightSky ? palette.lightSky.c : col('stone'), palette.lightGround ? palette.lightGround.c : col('ink'), 1.35);
  const key = new THREE.DirectionalLight(light, 2.3);
  key.position.set(-5, 10, 6);
  scene.add(hemi, key);

  const dot = dotTexture();
  const mats = {
    matte: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    metal: new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 38 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    suit: new THREE.MeshLambertMaterial({ color: col('suit'), flatShading: true }),
    skin: new THREE.MeshLambertMaterial({ color: col('skin'), flatShading: true }),
    shadow: new THREE.MeshBasicMaterial({ map: dot, color: col('shade'), transparent: true, opacity: 0.55, depthWrite: false }),
    lampOff: new THREE.MeshLambertMaterial({ color: col('ink'), flatShading: true })
  };
  mats.metal.specular.setScalar(0.18);
  /* A paused place is the same place in lower light. */
  mats.matteDim = mats.matte.clone(); mats.matteDim.color.setScalar(DIM);
  mats.metalDim = mats.metal.clone(); mats.metalDim.color.setScalar(DIM);
  mats.glowDim = mats.glow.clone(); mats.glowDim.color.setScalar(DIM);
  mats.suitDim = mats.suit.clone(); mats.suitDim.color.multiplyScalar(DIM);
  mats.skinDim = mats.skin.clone(); mats.skinDim.color.multiplyScalar(DIM);
  const select = tokenOf(root, '--field-select') || { c: col('paper'), a: 0.85 };
  mats.select = new THREE.MeshBasicMaterial({ color: select.c, transparent: true, opacity: select.a, depthWrite: false });

  /* Per-signal lamp and halo materials, shared by every tile in that state. */
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

  const geos = {
    lamp: new THREE.SphereGeometry(BEACON.lamp, 12, 8),
    halo: new THREE.CircleGeometry(1.25, 24),
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
    const grown = env.parts.map(p => Object.assign({ grow: TILE.content }, p));
    g = mergeParts(plinthParts().concat(grown), name =>
      name === 'tint' ? tintOf.tint : name === 'terrain' ? tintOf.terrain : col(name));
    placeGeos.set(theme, g);
    return g;
  }
  const stationGeos = new Map();        // station or hand prop -> { matte, metal, glow }, shared by every tile
  function stationGeo(name, parts){
    let g = stationGeos.get(name);
    if(g) return g;
    g = mergeParts(parts, col);
    stationGeos.set(name, g);
    return g;
  }
  /* The selection: a lit frame around the top of the selected plinth. */
  const frameGeo = mergeParts([
    { s: 'box', p: [0, 0.005, -TILE.half], d: [TILE.half * 2 + 0.12, 0.05, 0.12], m: 'glow', c: 'paper' },
    { s: 'box', p: [0, 0.005, TILE.half], d: [TILE.half * 2 + 0.12, 0.05, 0.12], m: 'glow', c: 'paper' },
    { s: 'box', p: [-TILE.half, 0.005, 0], d: [0.12, 0.05, TILE.half * 2 + 0.12], m: 'glow', c: 'paper' },
    { s: 'box', p: [TILE.half, 0.005, 0], d: [0.12, 0.05, TILE.half * 2 + 0.12], m: 'glow', c: 'paper' }
  ], () => select.c).glow;
  const selectMesh = new THREE.Mesh(frameGeo, mats.select);
  selectMesh.renderOrder = 2;

  function meshesFor(geoSet, parent, dimmable){
    const list = [];
    ['matte', 'metal', 'glow'].forEach(m => {
      if(!geoSet[m]) return;
      const mesh = new THREE.Mesh(geoSet[m], mats[m]);
      mesh.userData.finish = m;
      mesh.userData.dimmable = !!dimmable;
      parent.add(mesh);
      list.push(mesh);
    });
    return list;
  }

  /* ---------- a tile ---------- */
  function makeTile(item){
    const t = { id: item.id, theme: item.theme, state: {}, u: 0, v: 0, row: 0, pose: null, celebrate: 0,
                labelW: 0, labelH: 0, labelDirty: true };
    /* Its button first: the tile's colours are the page's, read from it. */
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'world-tile theme-' + item.theme;
    b.id = 'tile-' + item.id;
    b.setAttribute('data-project', item.id);
    const hit = document.createElement('span');
    hit.className = 'world-hit';
    hit.setAttribute('aria-hidden', 'true');
    hit.style.clipPath = HIT_SHAPE;
    hit.style.webkitClipPath = HIT_SHAPE;
    const label = document.createElement('span');
    label.className = 'world-label';
    const name = document.createElement('span');
    name.className = 'world-name';
    const badge = document.createElement('span');
    badge.className = 'world-badge';
    label.appendChild(name);
    label.appendChild(badge);
    b.appendChild(hit);
    b.appendChild(label);
    b.addEventListener('click', () => { if(H.onTap) H.onTap(item.id); });
    layer.appendChild(b);
    Object.assign(t, { button: b, hit: hit, label: label, nameEl: name, badgeEl: badge });

    const tint = tokenOf(b, '--tint'), terrain = tokenOf(b, '--terrain');
    t.tint = tint ? tint.c : col('stone');
    const tintOf = { tint: t.tint, terrain: terrain ? terrain.c : col('plinth') };

    t.root = new THREE.Group();
    t.content = new THREE.Group();
    t.content.rotation.y = WORLD.tileTurn;
    t.root.add(t.content);
    meshesFor(placeGeo(item.theme, tintOf), t.content, true);

    const ground = new THREE.Mesh(geos.shadow, mats.shadow);
    ground.scale.set(15, 1, 15);
    ground.position.set(0.5, -TILE.baseDepth - 0.02, 0.4);
    t.root.add(ground);

    /* The beacon's lamp sits in the tile's frame; its halo faces the camera. */
    const lampPos = new THREE.Vector3(BEACON.x, BEACON.mast + BEACON.lamp * 0.6, BEACON.z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), WORLD.tileTurn);
    t.lamp = new THREE.Mesh(geos.lamp, mats.lampOff);
    t.lamp.position.copy(lampPos);
    t.halo = new THREE.Mesh(geos.halo, mats.lampOff);
    t.halo.position.copy(lampPos);
    t.halo.rotation.x = -WORLD.elevation;
    t.halo.renderOrder = 3;
    t.halo.visible = false;
    t.root.add(t.lamp, t.halo);

    /* The crew: one worker on a shared rig, and every station built once
       and shown one at a time. */
    const env = environmentFor(item.theme);
    const w = t.worker = new THREE.Group();
    w.position.set(env.crew.x * TILE.content, 0, env.crew.z * TILE.content);
    w.scale.setScalar(TILE.crew);
    w.rotation.y = CREW_FACING;
    t.content.add(w);
    const body = new THREE.Group();
    const legL = new THREE.Mesh(geos.leg, mats.suit), legR = new THREE.Mesh(geos.leg, mats.suit);
    legL.position.set(-0.09, 0.5, 0); legR.position.set(0.09, 0.5, 0);
    const torso = new THREE.Group(); torso.position.y = 0.5;
    const chest = new THREE.Mesh(geos.chest, mats.suit);
    const head = new THREE.Group(); head.position.y = 0.47;
    const skull = new THREE.Mesh(geos.head, mats.skin), helmet = new THREE.Mesh(geos.helmet, mats.lampOff);
    head.add(skull, helmet);
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-0.26, 0.43, 0); armR.position.set(0.26, 0.43, 0);
    armL.add(new THREE.Mesh(geos.arm, mats.suit)); armR.add(new THREE.Mesh(geos.arm, mats.suit));
    torso.add(chest, head, armL, armR);
    body.add(legL, legR, torso);
    const feet = new THREE.Mesh(geos.shadow, mats.shadow);
    feet.scale.set(1.1, 1, 1.1); feet.position.y = 0.012;
    w.add(body, feet);
    t.rig = { body: body, legL: legL, legR: legR, torso: torso, head: head, helmet: helmet, armL: armL, armR: armR,
              suits: [legL, legR, chest, armL.children[0], armR.children[0]], skull: skull };
    t.stations = {};
    Object.keys(STATIONS).forEach(k => {
      const g = new THREE.Group();
      g.visible = false;
      meshesFor(stationGeo(k, STATIONS[k].parts), g, true);
      w.add(g);
      t.stations[k] = g;
    });
    t.hands = {};
    Object.keys(HAND_PROPS).forEach(k => {
      const g = new THREE.Group();
      g.visible = false;
      meshesFor(stationGeo('hand-' + k, HAND_PROPS[k]), g, true);
      (k === 'clipboard' ? armL : armR).add(g);
      t.hands[k] = g;
    });
    scene.add(t.root);
    return t;
  }

  function dropTile(t){
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
    }
    if(item.selected && selectMesh.parent !== t.content) t.content.add(selectMesh);
    t.state = Object.assign({}, item, { attention: (item.attention || []).slice() });
  }

  /* ---------- layout and camera ---------- */
  function relayout(){
    const n = S.order.length;
    const pick = chooseLayout(n, S.w, S.h, S.room);
    S.cols = pick.cols;
    const lay = layoutTiles(n, pick.cols, pick.stagger);
    S.order.forEach((id, i) => {
      const t = S.tiles.get(id), p = lay.tiles[i];
      t.u = p.u; t.v = p.v; t.row = p.row;
      t.root.position.set(p.u, 0, p.v);
    });
    S.bounds = viewBounds(lay.tiles);
  }

  function targetFor(mode){
    const sel = S.selected && S.tiles.get(S.selected);
    if(mode === 'focus' && sel) return focusFrame(sel, S.bounds, S.w, S.h, S.room);
    return overviewFrame(S.bounds, S.w, S.h, S.room);
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
    const f = S.frame, hw = S.w / 2 / f.scale, hh = S.h / 2 / f.scale;
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
    const tz = f.y / SIN;
    camera.position.set(f.x, 100 * SIN, tz + 100 * COS);
    camera.lookAt(f.x, 0, tz);
    camera.updateProjectionMatrix();
  }

  function resize(){
    const r = view.getBoundingClientRect();
    /* A hidden hub (another tab) measures nothing; keep the last shape. */
    if(r.width < 2 || r.height < 2) return;
    const w = Math.round(r.width), h = Math.round(r.height);
    const dpr = pixelRatioFor(window.devicePixelRatio || 1, w, h);
    if(w === S.w && h === S.h && dpr === S.dpr) return;
    S.w = w; S.h = h; S.dpr = dpr; S.reroom = 0;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    if(!S.order.length) return;
    relayout();
    reframe();
  }

  /* The same mode and the same selection in a new shape. A pan keeps its
     centre and is only held inside the world. */
  function reframe(){
    if(S.mode === 'free' && S.frame) goTo(clampFrame(S.to || S.frame, S.bounds, S.room), 'free', true);
    else goTo(targetFor(S.mode), S.mode, true);
  }

  /* ---------- the button layer ---------- */
  function placeButtons(){
    const f = S.frame, s = f.scale, W = S.w, Hh = S.h;
    const bw = SILHOUETTE.halfW * 2 * s, bh = (SILHOUETTE.plinthBottom - SILHOUETTE.top) * s;
    const labelMax = Math.max(88, Math.round(WORLD.colStep * s - 4));
    if(labelMax !== S.labelMax){
      S.labelMax = labelMax;
      layer.style.setProperty('--label-max', labelMax + 'px');
      layer.style.setProperty('--label-tuck', WORLD.labelTuck + 'px');
      S.tiles.forEach(t => { t.labelDirty = true; });
    }
    const measured = [...S.tiles.values()].some(t => t.labelDirty);
    const rects = [];
    S.order.forEach(id => {
      const t = S.tiles.get(id), c = toView(t.u, t.v, 0), p = toScreen(f, c.x, c.y, W, Hh);
      const left = p.x - SILHOUETTE.halfW * s, top = p.y + SILHOUETTE.top * s;
      const st = t.button.style;
      st.width = bw.toFixed(1) + 'px';
      st.height = bh.toFixed(1) + 'px';
      st.transform = 'translate(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px)';
      if(t.labelDirty){ t.labelW = t.label.offsetWidth; t.labelH = t.label.offsetHeight; t.labelDirty = false; }
      t.off = left + bw < 0 || left > W || top + bh < 0 || top > Hh;
      rects.push({ id: id, row: t.row, x: p.x - t.labelW / 2, y: top + bh - WORLD.labelTuck, w: t.labelW, h: t.labelH });
    });
    /* Frame for the labels there really are: a two-line name needs more
       room than one. Settles in a step or two, never more than four. Only
       the overview moves for it: a focused or panned camera stays where it
       is when a label changes, and uses the new room on its next move. */
    if(measured && S.reroom < 4 && !S.to){
      const room = Math.max(24, Math.max.apply(null, rects.map(r => r.h)) - WORLD.labelTuck + 4);
      if(Math.abs(room - S.room) > 2){
        S.room = room;
        if(S.mode === 'overview'){
          S.reroom++;
          relayout();
          reframe();
          S.dirty = true;
          return;
        }
      }
    }
    const shown = resolveLabels(rects, [S.focused, S.selected], W, Hh);
    S.order.forEach(id => {
      const t = S.tiles.get(id);
      const hidden = !shown[id];
      if(hidden !== t.hiddenLabel || t.off !== t.wasOff){
        t.hiddenLabel = hidden; t.wasOff = t.off;
        t.button.classList.toggle('is-hidden', hidden);
        t.button.classList.toggle('is-off', t.off);
      }
    });
    /* Overview is offered whenever the whole world is not in view; at the
       overview it would cover a tile and do nothing. */
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

  /* ---------- crews and beacons ---------- */
  function ambientWanted(now){
    if(rm() || now - S.lastWake > WORLD.ambientSeconds * 1000) return false;
    for(const t of S.tiles.values()){
      if(crewLoops(t.state.workerState, false) || (t.state.attention && t.state.attention.length)) return true;
    }
    return false;
  }

  /* Returns true while a worker is still settling or acknowledging. */
  function stepCrews(now, dt, ambient){
    let busy = false;
    const time = now / 1000;
    S.tiles.forEach(t => {
      const state = t.state.workerState;
      if(!CREW[state]){ return; }
      let once = null;
      if(t.celebrate){
        once = (now - t.celebrate) / CELEBRATE_MS;
        if(once >= 1){ t.celebrate = 0; once = null; } else busy = true;
      }
      const moving = ambient && crewLoops(state, false);
      const target = poseFor(state, moving ? time + t.row * 0.7 + t.u * 0.05 : 0, once);
      if(!t.pose || rm()){ t.pose = Object.assign({}, target); }
      else {
        const k = 1 - Math.exp(-dt / POSE_EASE_S);
        let gap = 0;
        Object.keys(target).forEach(j => {
          if(typeof target[j] !== 'number') { t.pose[j] = target[j]; return; }
          const d = target[j] - t.pose[j];
          t.pose[j] += d * k;
          gap = Math.max(gap, Math.abs(d));
        });
        t.pose.seated = target.seated;
        if(gap > 0.004) busy = true;
      }
      const p = t.pose, r = t.rig;
      r.armL.rotation.set(p.armL, 0, p.spreadL);
      r.armR.rotation.set(p.armR, 0, p.spreadR);
      r.head.rotation.set(p.head, p.turn, 0);
      r.torso.rotation.x = p.lean;
      r.body.position.y = (p.seated ? -0.1 : 0) + p.lift;
      r.legL.rotation.x = r.legR.rotation.x = p.seated ? -1.45 : 0;
    });
    return busy;
  }

  function stepBeacons(now, ambient){
    const breath = ambient ? 0.5 + 0.5 * Math.sin(now / 1000 * Math.PI * 2 / BREATH_S) : 0.5;
    signalMats.forEach(m => { m.halo.opacity = 0.4; });
    S.tiles.forEach(t => {
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
    const moving = stepCamera(now);
    const ambient = ambientWanted(now);
    /* Ambient motion is capped; camera moves and pans are not. */
    if(!moving && ambient && S.lastRender && now - S.lastRender < 1000 / WORLD.ambientFps - 4 && !S.dirty){
      S.raf = requestAnimationFrame(tick);
      return;
    }
    const began = performance.now();
    const dt = Math.min(0.1, S.lastTick ? (now - S.lastTick) / 1000 : 0.016);
    S.lastTick = now;
    const settling = stepCrews(now, dt, ambient);
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
    placeButtons();
    /* The frame's cost on the main thread, averaged, for the QA to read. */
    const spent = performance.now() - began;
    S.cost = S.cost ? S.cost * 0.9 + spent * 0.1 : spent;
    if(view.style.visibility) view.style.visibility = '';
    if(moving || ambient || settling) S.raf = requestAnimationFrame(tick);
    else S.lastTick = 0;
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
    S.frame = clampFrame({ x: S.frame.x - dx / S.frame.scale, y: S.frame.y - dy / S.frame.scale, scale: S.frame.scale }, S.bounds, S.room);
    S.dirty = true;
    wake();
  }
  const on = [];
  function listen(el, type, fn, opts){ el.addEventListener(type, fn, opts); on.push([el, type, fn, opts]); }

  listen(view, 'pointerdown', e => {
    S.swallowClick = false;
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    if(e.target.closest && e.target.closest('.world-overview')) return;
    arb.down(e.pointerId, e.clientX, e.clientY);
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
  const endPan = () => { view.classList.remove('is-panning'); S.swallowClick = true; };
  listen(view, 'pointerup', e => {
    const r = arb.up(e.pointerId);
    if(r && r.type === 'pan-end') endPan();
  });
  const cancel = e => {
    const r = arb.cancel(e.pointerId);
    if(r && r.type === 'pan-end') endPan();
  };
  listen(view, 'pointercancel', cancel);
  listen(view, 'lostpointercapture', cancel);
  /* The click a drag would make never reaches a button. */
  listen(view, 'click', e => {
    if(!S.swallowClick) return;
    S.swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
  listen(overviewBtn, 'click', () => { if(S.bounds) goTo(targetFor('overview'), 'overview'); });
  /* A keyboard stop on a tile brings it into view. */
  listen(layer, 'focusin', e => {
    const b = e.target.closest && e.target.closest('.world-tile');
    S.focused = b ? b.getAttribute('data-project') : null;
    const t = S.focused && S.tiles.get(S.focused);
    if(t && S.frame){
      const f = revealFrame(S.to || S.frame, t, S.bounds, S.w, S.h, S.room);
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
    S.dirty = true;
    wake();
  };
  listen(canvas, 'webglcontextlost', onLost, false);
  listen(canvas, 'webglcontextrestored', onRestored, false);
  listen(document, 'visibilitychange', () => { if(!document.hidden) wake(); });

  let ro = null, io = null, mo = null, mq = null;
  const onMotion = () => { S.tiles.forEach(t => { t.pose = null; t.celebrate = 0; }); if(S.to){ S.frame = S.to; S.from = S.to = null; } S.dirty = true; wake(); };
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
    const sel = (items.find(i => i.selected) || {}).id || null;
    if(!sel && selectMesh.parent) selectMesh.parent.remove(selectMesh);
    items.forEach(item => applyState(S.tiles.get(item.id), item, now));
    if(!S.w) resize();
    if(reshaped && S.w) relayout();
    const was = S.selected;
    S.selected = sel;
    if(S.first || !S.frame){
      /* A first draw, or a reload: the whole world, whatever is selected. */
      goTo(targetFor('overview'), 'overview', true);
    } else if(sel && sel !== was){
      goTo(targetFor('focus'), 'focus');
    } else if(reshaped){
      reframe();
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
    stationGeos.forEach(set => Object.values(set).forEach(x => g.add(x)));
    Object.values(geos).forEach(x => g.add(x));
    g.add(frameGeo);
    Object.values(mats).forEach(x => m.add(x));
    signalMats.forEach(x => { m.add(x.lamp); m.add(x.halo); m.add(x.helmet); });
    g.forEach(x => x.dispose());
    m.forEach(x => x.dispose());
    dot.dispose();
    /* Hand the context back now rather than at garbage collection; one
       already lost has nothing to hand back. */
    let gone = true;
    try{ gone = renderer.getContext().isContextLost(); }catch(e){}
    if(!gone) try{ renderer.forceContextLoss(); }catch(e){}
    renderer.dispose();
    if(view.parentNode) view.parentNode.removeChild(view);
    S.tiles.clear();
  }

  /* What the QA reads: the last frame's cost and what is alive. */
  function stats(){
    const info = renderer.info;
    return {
      revision: THREE.REVISION, drawCalls: info.render.calls, triangles: info.render.triangles,
      geometries: info.memory.geometries, textures: info.memory.textures,
      programs: info.programs ? info.programs.length : null, frames: S.frames, frameMs: Math.round(S.cost * 100) / 100,
      width: S.w, height: S.h, pixelRatio: S.dpr, columns: S.cols, mode: S.mode,
      frame: S.frame ? { x: S.frame.x, y: S.frame.y, scale: S.frame.scale } : null,
      running: !!S.raf, awake: awake(), lost: S.lost, failed: S.failed, tiles: S.tiles.size,
      built: placeGeos.size + stationGeos.size
    };
  }

  return { draw: draw, focus: focus, destroy: destroy, stats: stats };
}
