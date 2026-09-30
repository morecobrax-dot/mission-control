/* Service worker — one complete, verified release at a time.
 *
 * 0.7.0 fetched every file network-first, through the browser's HTTP cache,
 * at the same address in every release, and precached whatever came back:
 * an update could run new HTML with an old renderer or an old layout, and
 * cache the mixture for offline. This worker never does:
 *
 * - Every file the page loads besides itself lives in release/ under a name
 *   carrying its content hash (scripts/release.js), and RELEASE below lists
 *   every file of this release with the sha256 its bytes must have.
 * - Install fetches each file past the HTTP cache and checks those bytes. One
 *   wrong, missing, late or partial file fails the install; the release that
 *   is running stays exactly as it was, and the browser tries again later.
 * - The page is served from this release's cache, so a page and the files it
 *   loads are always one release. A newer release waits, verified, until the
 *   page asks for it (Settings > Update ready) or every tab has closed: an
 *   update never reloads a page by itself.
 * - Activation keeps the release before it, so a page still running it can
 *   load a model late; every older copy, and any cache that never finished,
 *   is removed. Only this app's caches are ever touched.
 *
 * CACHE_NAME and RELEASE are DERIVED by `npm run config:sync`, and
 * `npm run config:verify` fails if they drift. Never hand-edit them.
 *
 * This only ever caches application CODE and models. Everything a person
 * creates lives in localStorage under the app's own namespace and is never
 * touched here — clearing these caches cannot lose a single record.
 */

/* APP-CACHE-BEGIN */
const CACHE_NAME = 'mission-control-v0.8.0-f46e7226ac92';
/* APP-CACHE-END */

/* APP-FILES-BEGIN */
const RELEASE = {
  id: 'f351a9039676',
  files: [
    ['./index.html', 'dbeeb36825cbb13ddfdde58e04e234eb9c96a727a797f9e8e4d8253717b2b73c', 238842],
    ['./manifest.webmanifest', '774e9d6751d74a9ae1e205dcfd4c3ff4e602d58bb2ad7ca749d1b9f4328efe42', 583],
    ['./icon-192.png', '0158e8011a048dd9d51da60afed6ccae8a9d66932e9f424b6e2c15e6e2eb00d1', 20289],
    ['./icon-512.png', '04ec5545111e900e3b2bc584c9d7fd33f126f0d2d4a4464c8e627b467048a31d', 86533],
    ['./release/capysushi-diorama.5e636e127ee4.glb', '5e636e127ee4642568ed4ca26a2f0faee3c434cb93ecb25ac698c71a0d21e81e', 1011368],
    ['./release/dailyverse-diorama.97f674076d4d.glb', '97f674076d4d35d758a3f22e96b4c4048dec29f170891aa78d0ec221c5be358a', 1216940],
    ['./release/dayplan-diorama.c60794997357.glb', 'c60794997357d1ebaf75a7d67d6c2673b83a1f6fdf5b199f3806e10ac957cca9', 1330208],
    ['./release/golden-diorama.e0b21a1c4dcc.glb', 'e0b21a1c4dccae20cab54981955546cdd9f250d4d75a98a02caaa9fb9481d52e', 1581172],
    ['./release/render3d.1dddab0564c7.js', '1dddab0564c78a0b4d00a286dbe9136668df4547f5459df716c7e8c539b5d141', 69913],
    ['./release/savings-diorama.9099b2690506.glb', '9099b2690506df593e611c7aa501363747e53f305f20c02ff6f6c72332a82c4e', 1085452],
    ['./release/spacek-diorama.7b9d1f6a6052.glb', '7b9d1f6a60522e0724ec3611dffd44cdac35ed71973154a5ce170ae8c3f8a80e', 1132352],
    ['./release/three.min.0c9283a1079c.js', '0c9283a1079c2dcb73462eea6746a8ccfa791eadb65ccfbb753bdd867a59a5f9', 639129],
    ['./release/world.4f89ecac17ff.js', '4f89ecac17ff914ddc6a21bf27a652b4aec275a4ee0dc3ef84e79a5ae8d03b00', 61145]
  ]
};
/* APP-FILES-END */

/* This app's caches are "<id>-v<version>-<hash>" (0.7.0 and before: no hash).
   A name only has to start with this and a digit to be ours. */
const PREFIX = CACHE_NAME.slice(0, CACHE_NAME.lastIndexOf('-v') + 2);
const ours = name => name.indexOf(PREFIX) === 0 && /^\d/.test(name.slice(PREFIX.length));
/* Written into a cache when its release activates: proof it was complete. */
const MARK = new URL('./__release__', self.location).href;
const HASHED = /\/release\/[^/]+\.([0-9a-f]{12})\.[a-z0-9]+$/i;
const FETCH_MS = 60000;                       // one file that never arrives fails the install, not the device
const SCOPE = new URL('./', self.location).pathname;
const WANT = new Map(RELEASE.files.map(([url, sha, bytes]) => [new URL(url, self.location).pathname, { url, sha, bytes }]));

async function digest(buf){
  const h = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}

/* Is this response exactly the expected bytes? HTTP 200 alone proves nothing. */
async function exact(res, sha, bytes){
  if(!res || !res.ok) return false;
  const buf = await res.clone().arrayBuffer();
  return buf.byteLength === bytes && await digest(buf) === sha;
}

/* The releases that finished and ran here, newest first — never a cache that
   was only partly written, and never one from before verified releases. */
async function completed(){
  const out = [];
  for(const name of await caches.keys()){
    if(!ours(name) || name === CACHE_NAME) continue;
    const r = await caches.match(MARK, { cacheName: name });
    const m = r ? await r.json().catch(() => null) : null;
    if(m && m.activatedAt) out.push({ name, at: m.activatedAt });
  }
  return out.sort((a, b) => b.at - a.at).map(x => x.name);
}

/* ---------- install: all of it, checked, or nothing ---------- */
async function fetchExact(href, sha, bytes){
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), FETCH_MS);
  try{
    const res = await fetch(new Request(href, { cache: 'reload', credentials: 'same-origin', signal: ctl.signal }));
    if(!await exact(res, sha, bytes)) throw new Error(href + ' is not the release\'s bytes');
    return res;
  } finally { clearTimeout(t); }
}

async function install(){
  const cache = await caches.open(CACHE_NAME), before = await completed();
  /* Every file is settled before the install answers, so what was proven is
     kept for the retry; one failure still fails the whole install. */
  const settled = await Promise.allSettled(RELEASE.files.map(async ([url, sha, bytes]) => {
    const href = new URL(url, self.location).href;
    if(await exact(await cache.match(href), sha, bytes)) return;            // a retry keeps what was proven
    for(const name of before){                                              // unchanged since a release that ran here
      const hit = await caches.match(href, { cacheName: name });
      if(await exact(hit, sha, bytes)) return cache.put(href, hit);
    }
    await cache.put(href, await fetchExact(href, sha, bytes));
  }));
  const failed = settled.find(s => s.status === 'rejected');
  if(failed) throw failed.reason;
  /* A cache removed underneath this install (an older release activating at
     that moment) must not become an empty active release. */
  if(!await caches.has(CACHE_NAME)) throw new Error('release cache removed during install');
  for(const [url] of RELEASE.files){
    if(!await cache.match(new URL(url, self.location).href)) throw new Error(url + ' missing after install');
  }
}

/* The worker this replaces predates verified releases when no cache here
   carries a release mark (0.7.0 and before). Its pages cannot show an update
   action and everything it serves may be mixed, so the verified release takes
   control now. Its open pages keep what they have already loaded; nothing is
   reloaded. From then on, updates wait. */
async function replacesLegacy(){
  return !!self.registration.active && (await completed()).length === 0;
}

self.addEventListener('install', event => {
  event.waitUntil(install().then(replacesLegacy).then(legacy => legacy ? self.skipWaiting() : undefined));
});

/* ---------- activate: mark it, keep the one before, remove the rest ---------- */
let readable = null;                          // the caches a request may be answered from, newest first

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(MARK, new Response(JSON.stringify({ id: RELEASE.id, activatedAt: Date.now() }),
      { headers: { 'Content-Type': 'application/json' } }));
    const keep = (await completed()).slice(0, 1);                           // what open pages may still run
    const drop = (await caches.keys()).filter(n => ours(n) && n !== CACHE_NAME && keep.indexOf(n) === -1);
    await Promise.all(drop.map(n => caches.delete(n)));
    readable = null;
  })());
});

async function readableCaches(){
  if(!readable) readable = completed().then(prev => [CACHE_NAME].concat(prev));
  return readable;
}

/* ---------- fetch ---------- */
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin || url.pathname.indexOf(SCOPE) !== 0) return;
  if(req.mode === 'navigate'){
    if(url.pathname === SCOPE || url.pathname === SCOPE + 'index.html') event.respondWith(page(req));
    return;
  }
  if(WANT.has(url.pathname) || HASHED.test(url.pathname)) event.respondWith(asset(req, url));
  /* Anything else (and every other origin, the repositories' status files
     among them) is not this worker's to answer or to keep. */
});

/* The page this release was built with, so everything it loads is this
   release. Only if its copy is gone does the network answer. */
async function page(req){
  const hit = await caches.match(new URL('./index.html', self.location).href, { cacheName: CACHE_NAME });
  if(hit) return hit;
  try{ return await fetch(req); } catch(e){ return Response.error(); }
}

/* A release file: from this release, or the one before it for a page still
   running that; otherwise the network, and only if its bytes are the ones
   its name or this release promises. A failure is a failure — never the page,
   never another file's bytes. */
async function asset(req, url){
  const href = url.origin + url.pathname;
  for(const name of await readableCaches()){
    const hit = await caches.match(href, { cacheName: name });
    if(hit) return hit;
  }
  let res;
  try{ res = await fetch(req); } catch(e){ return Response.error(); }
  if(!res.ok) return res;
  const want = WANT.get(url.pathname), named = HASHED.exec(url.pathname);
  const sha = await digest(await res.clone().arrayBuffer());
  if(want ? sha !== want.sha : named && sha.slice(0, 12) !== named[1]) return Response.error();
  return res;
}

/* ---------- the page asks ---------- */
self.addEventListener('message', event => {
  const m = event.data || {};
  if(m.type === 'MC_RELEASE' && event.ports && event.ports[0]) event.ports[0].postMessage({ id: RELEASE.id, cache: CACHE_NAME });
  else if(m.type === 'MC_ACTIVATE') self.skipWaiting();
});
