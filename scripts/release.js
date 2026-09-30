/* =========================================================
   RELEASE — immutable, verified runtime assets
   ---------------------------------------------------------
   0.7.0 shipped its modules and models at the same address in
   every release (./field/render3d.js, ./art/exports/x.glb). Pages
   and the browser each keep a copy of every file for ten minutes,
   per address, so an update could run new HTML with an old
   renderer, an old layout, or both, and the service worker cached
   whichever mixture it was handed.

   This builds the release the page actually loads: every file the
   world reaches, found by walking the real import graph from the
   entry module and every relative asset address the modules
   name, copied into release/ under a name that carries its own
   content hash, with every reference to it rewritten. A file's
   address therefore changes exactly when its bytes do, and one
   address can never answer with another release's bytes.

   Nothing here is a list to keep in step by hand: the entry is
   the one module the page imports, and everything else is found.
   scripts/config.js writes what this returns into index.html
   (APP_RELEASE, WORLD_MODULE, APP_FILES) and sw.js (the cache
   name, and each file's sha256 for the install to check).

   Bytes: every shipped file is `-text` in .gitattributes, so the
   bytes hashed here are the bytes committed and served.
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = 'release';                        // generated, owned entirely by this script
const ENTRY = 'field/render3d.js';            // the module the page imports
const SHELL = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const ASSET_EXT = /\.(?:m?js|glb|gltf|bin|png|jpe?g|webp|ktx2|hdr|wasm|json)$/i;

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
const read = p => fs.readFileSync(path.join(ROOT, p));

/* A module's source as served: authored modules are git text, so CRLF in a
   Windows checkout is never what Pages serves. */
function moduleText(p){ return read(p).toString('utf8').split('\r\n').join('\n'); }

/* Relative import specifiers, static and dynamic. A dynamic import of anything
   but a string literal cannot be followed, so it is refused. */
function importsOf(text, file){
  const out = [];
  const statics = /(?:^|[;\n}])\s*(?:import\s*(?:[\w$*{][^;'"`]*?\bfrom\s*)?|export\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"]+)\1/g;
  let m;
  while((m = statics.exec(text))) out.push(m[2]);
  const dyn = /\bimport\s*\(\s*([^)]*?)\s*\)/g;
  while((m = dyn.exec(text))){
    const lit = /^(['"])([^'"]+)\1$/.exec(m[1]);
    if(!lit) throw new Error(file + ': import(' + m[1] + ') is not a literal — the release cannot follow it');
    out.push(lit[2]);
  }
  out.forEach(s => { if(!/^\.{1,2}\//.test(s)) throw new Error(file + ': import of "' + s + '" is not relative — nothing may load from outside the release'); });
  return out;
}

/* Every other relative address a module names: an asset, fetched relative to
   the page. Anything the world loads later — a model, a texture — is one. */
function assetsOf(text, imports){
  const out = [];
  const lit = /(['"])(\.{1,2}\/[^'"\s]+?)\1/g;
  let m;
  while((m = lit.exec(text))) if(ASSET_EXT.test(m[2]) && imports.indexOf(m[2]) === -1) out.push(m[2]);
  return out;
}

/* A model must carry everything inside it: an external buffer or image would
   be one more file with an address of its own. */
function checkModel(p, buf){
  if(buf.readUInt32LE(0) !== 0x46546C67) throw new Error(p + ': not a binary glTF');
  const gl = JSON.parse(buf.subarray(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
  const ext = (gl.buffers || []).concat(gl.images || []).filter(x => x.uri);
  if(ext.length) throw new Error(p + ': names ' + ext.length + ' external file(s); embed them');
}

function releaseName(p, buf){
  const base = path.posix.basename(p), dot = base.indexOf('.');
  const stem = base.slice(0, base.lastIndexOf('.')), ext = base.slice(base.lastIndexOf('.'));
  return (dot === -1 ? base : stem) + '.' + sha256(buf).slice(0, 12) + ext;
}

/* The whole release, in memory: { files: Map(releasePath -> bytes), entry, list } */
function build(){
  const files = new Map();                  // 'release/x.<hash>.js' -> Buffer
  const done = new Map();                   // source path -> release path
  const stack = [];

  function asset(p, from){
    if(done.has(p)) return done.get(p);
    if(!fs.existsSync(path.join(ROOT, p))) throw new Error(from + ': names ' + p + ', which does not exist');
    const buf = read(p);
    if(/\.glb$/i.test(p)) checkModel(p, buf);
    const out = OUT + '/' + releaseName(p, buf);
    files.set(out, buf); done.set(p, out);
    return out;
  }

  function mod(p){
    if(done.has(p)) return done.get(p);
    if(stack.indexOf(p) !== -1) throw new Error('import cycle: ' + stack.concat(p).join(' -> '));
    stack.push(p);
    let text = moduleText(p);
    const imports = importsOf(text, p), assets = assetsOf(text, imports);
    const swap = {};
    imports.forEach(s => { swap[s] = './' + path.posix.basename(mod(path.posix.normalize(path.posix.join(path.posix.dirname(p), s)))); });
    assets.forEach(s => { swap[s] = './' + asset(path.posix.normalize(s), p); });
    /* Rewrite each quoted literal exactly; the result is checked below. */
    text = text.replace(/(['"])(\.{1,2}\/[^'"\s]+?)\1/g, (all, q, s) => swap[s] ? q + swap[s] + q : all);
    const left = assetsOf(text, []).filter(s => !/^\.\/(?:release\/)?[^/]+\.[0-9a-f]{12}\.[a-z0-9]+$/i.test(s));
    if(left.length) throw new Error(p + ': still names ' + left.join(', ') + ' after the rewrite');
    stack.pop();
    const buf = Buffer.from(text, 'utf8');
    const out = OUT + '/' + releaseName(p, buf);
    files.set(out, buf); done.set(p, out);
    return out;
  }

  const entry = mod(ENTRY);
  const list = Array.from(files.keys()).sort();
  return { entry, files, list };
}

/* The page's view of the release, written into index.html. APP_RELEASE names
   this set of files and this version; it is how the page and a worker tell
   whether they belong to the same release. */
function pageBlock(r, version){
  const id = sha256(version + '\n' + r.list.join('\n')).slice(0, 12);
  return { id, text: [
    "const APP_RELEASE = '" + id + "';",
    "const WORLD_MODULE = './" + r.entry + "';",
    'const APP_FILES = [' + r.list.map(f => "'./" + f + "'").join(',\n  ') + '];'
  ].join('\n') };
}

/* The worker's view: every file it must hold, with the sha256 its bytes must
   have. Read after index.html is final, since the page is one of them. */
function workerManifest(r, id, cacheNamespace, readFile){
  const rows = SHELL.map(f => [f, readFile(f)]).concat(r.list.map(f => [f, r.files.get(f)]))
    .map(([f, buf]) => ['./' + f, sha256(buf), buf.length]);
  const cache = cacheNamespace + '-' + sha256(JSON.stringify(rows)).slice(0, 12);
  return { cache, text: 'const RELEASE = {\n  id: \'' + id + '\',\n  files: [\n' +
    rows.map(x => "    ['" + x[0] + "', '" + x[1] + "', " + x[2] + ']').join(',\n') + '\n  ]\n};' };
}

/* release/ on disk against the build: what to write, what to remove. */
function diskDiff(r){
  const dir = path.join(ROOT, OUT);
  const have = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => OUT + '/' + f) : [];
  const write = r.list.filter(f => !have.includes(f) || !read(f).equals(r.files.get(f)));
  const remove = have.filter(f => !r.files.has(f));
  return { write, remove };
}
function writeDisk(r){
  const d = diskDiff(r);
  fs.mkdirSync(path.join(ROOT, OUT), { recursive: true });
  d.write.forEach(f => fs.writeFileSync(path.join(ROOT, f), r.files.get(f)));
  d.remove.forEach(f => fs.unlinkSync(path.join(ROOT, f)));
  return d;
}

module.exports = { build, pageBlock, workerManifest, diskDiff, writeDisk, importsOf, assetsOf, sha256, ENTRY, OUT, SHELL };
