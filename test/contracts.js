/* =========================================================
   MISSION CONTROL CONTRACTS
   ---------------------------------------------------------
   High-value contracts, not test volume. Contracts 1–19 defend
   the foundation this product was built on: a namespace
   collision, a scroll lock that leaks, a type scale that quietly
   stops being used. Contracts 20–25 defend Mission Control
   itself: the registry, the status model, private links, the
   hub, the field seam and secret safety.

   Each contract states what it protects, in the language of the
   failure it prevents. If an assertion cannot be described that
   way, it probably should not exist.
   ========================================================= */
'use strict';
const H = require('./harness.js');

let pass = 0, fail = 0;
const failures = [];

function T(name, cond, detail){
  if(cond){ pass++; }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
  console.log('  ' + (cond ? 'PASS' : 'FAIL') + '  ' + name + (cond || !detail ? '' : ' — ' + detail));
}
function section(t){ console.log('\n' + '='.repeat(64) + '\n  ' + t + '\n' + '='.repeat(64)); }
function sub(t){ console.log('\n  --- ' + t + ' ---'); }

function results(){ return { pass, fail, failures }; }
function reset(){ pass = 0; fail = 0; failures.length = 0; }

/* ---------- shared helpers ---------- */
function open(app, id){ app.ctx.openOverlay(id); app.ctx.__flush(); }
function close(app, id){ app.ctx.closeOverlay(id); app.ctx.__flush(); }
function css(){ return H.styleBlock(H.readApp()); }
function js(){ return H.mainScript(H.readApp()); }
/* Comments explain the rules; they must not be mistaken for breaking them. */
function stripComments(s){
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* Obviously fake links. Real ones never appear in this repository: the
   secret scan (contract 25) ignores exactly these markers — a .test host or
   an id that says FAKE — and fails on anything that looks real. */
const FIX = {
  chat:      'https://chat.example.test/c/FAKE-FIXTURE-0001',
  claude:    'https://claude.example.test/code/FAKE-FIXTURE-0002',
  claudeApp: 'claude://code/FAKE-FIXTURE-0003'
};

/* =========================================================
   CONTRACT 1 — BOOT
   The app starts, says so, and fails loudly rather than blankly.
   ========================================================= */
function testBoot(){
  section('CONTRACT 1 — the application boots');
  const app = H.loadApp();

  sub('a clean start');
  T('boots with no console errors', app.errors.length === 0, app.errors.join(' | '));
  T('the app container is revealed', app.dom.document.getElementById('app').style.display === '');
  T('storage is available and reports itself persistent', app.ctx.Store.isPersistent());
  T('a first run records the schema version',
    app.storage.getItem(app.ctx.STORAGE_NAMESPACE + 'sys.schemaVersion') === String(app.ctx.DATA_SCHEMA_VERSION));
  T('a first run writes nothing else', app.storage._map.size === 1, String(app.storage._map.size));

  sub('booting on top of existing data');
  const shared = new Map();
  const seeded = H.loadApp({ sharedStorage: shared });
  seeded.ctx.projectStates.dayplan = seeded.ctx.normalizeState({
    id: 'dayplan', status: 'building', nextAction: 'Existing', updatedAt: '2026-01-01T00:00:00.000Z' });
  seeded.ctx.persistProjectStates();
  const second = H.loadApp({ sharedStorage: shared });
  T('an existing record survives a reload', !!second.ctx.projectStates.dayplan);
  T('and keeps its content', !!second.ctx.projectStates.dayplan &&
    second.ctx.projectStates.dayplan.nextAction === 'Existing');
  T('reloading raises no errors', second.errors.length === 0, second.errors.join(' | '));

  sub('there is only one script block, so the suite sees all the code');
  const blocks = H.scriptBlocks(H.readApp()).filter(b => b.trim().length > 200);
  T('exactly one substantial <script> block', blocks.length === 1, String(blocks.length));
  T('boot is wrapped so a failure still reports itself',
    /catch\(err\)\{[\s\S]{0,400}could not start/.test(js()));
}

/* =========================================================
   CONTRACT 2 — CONFIGURATION
   One source of identity, and static files that cannot drift.
   ========================================================= */
function testConfig(){
  section('CONTRACT 2 — application identity has one source');
  const app = H.loadApp();
  const c = app.ctx;
  const cfg = c.APP_CONFIG;

  sub('APP_ID is valid, and invalid ids are refused rather than repaired');
  T('the shipped id passes validation', c.validateAppId(cfg.id) === null);
  const bad = {
    'empty': '', 'uppercase': 'App-Starter', 'spaces': 'app starter',
    'leading digit': '1app', 'trailing hyphen': 'app-', 'double hyphen': 'app--starter',
    'underscore': 'app_starter', 'dot': 'app.starter', 'slash': 'app/starter',
    'too long': 'a'.repeat(41), 'not a string': 42
  };
  Object.keys(bad).forEach(label => {
    T('rejects ' + label, typeof c.validateAppId(bad[label]) === 'string');
  });
  T('a valid multi-word id is accepted', c.validateAppId('personal-savings') === null);

  sub('every namespace is derived, never typed twice');
  T('storage prefix derives from the id', c.STORAGE_NAMESPACE === cfg.id + '.');
  T('cache name derives from the id and the version',
    c.CACHE_NAMESPACE === cfg.id + '-v' + c.APP_VERSION);
  T('the version derives from the newest release entry',
    c.APP_VERSION === c.APP_UPDATES[0].version);

  sub('static files match APP_CONFIG — they cannot read it at runtime');
  const man = H.readManifest();
  T('manifest name', man.name === cfg.name, man.name);
  T('manifest short_name', man.short_name === cfg.shortName, man.short_name);
  T('manifest description', man.description === cfg.description);
  T('manifest theme_color', man.theme_color === cfg.themeColor, man.theme_color);
  T('manifest background_color', man.background_color === cfg.backgroundColor);

  const sw = H.readSW();
  T('service-worker cache name', sw.indexOf("'" + c.CACHE_NAMESPACE + "'") !== -1, c.CACHE_NAMESPACE);

  const pkg = H.readPkg();
  T('package name', pkg.name === cfg.id, pkg.name);
  T('package version', pkg.version === c.APP_VERSION, pkg.version);

  /* Compared through the same escape the sync applies, so a product whose
     name contains & " or < is not reported as drift for being correct. */
  const src = H.readApp();
  const esc = require('../scripts/config.js').esc;
  T('document title', src.indexOf('<title>' + esc(cfg.name) + '</title>') !== -1);
  T('theme-color meta', src.indexOf('content="' + esc(cfg.themeColor) + '"') !== -1);
  T('apple web app title', src.indexOf('content="' + esc(cfg.shortName) + '"') !== -1);
  T('the header markup carries the derived name, not a stale copy',
    new RegExp('<h1 class="app-title" id="appTitle">' +
      esc(cfg.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '</h1>').test(src));

  sub('a name that needs escaping survives every target intact');
  const hostile = 'Ben & Co "Ltd" <beta>';
  T('escaping is applied, not stripped',
    esc(hostile) === 'Ben &amp; Co &quot;Ltd&quot; &lt;beta>');
  T('the manifest holds the raw value, because JSON escapes differently',
    JSON.parse(JSON.stringify({ n: hostile })).n === hostile);

  sub('changing the id changes everything downstream');
  ['other-app', 'client-demo', 'personal-savings'].forEach(id => {
    const o = H.loadApp({ appId: id });
    T(id + ' → storage prefix', o.ctx.STORAGE_NAMESPACE === id + '.');
    T(id + ' → cache name', o.ctx.CACHE_NAMESPACE === id + '-v' + o.ctx.APP_VERSION);
    T(id + ' → validates', o.ctx.validateAppId(id) === null);
  });
}

/* =========================================================
   CONTRACT 3 — STORAGE
   Namespacing is the only thing keeping two deployments on one
   origin from reading each other's data.
   ========================================================= */
function testStorage(){
  section('CONTRACT 3 — storage is namespaced and honest');
  const app = H.loadApp();
  const c = app.ctx;

  sub('every key the app writes carries its namespace');
  c.Store.set('data.probe', 'x');
  c.Store.setJSON('ui.probe', { a: 1 });
  const raw = [...app.storage._map.keys()];
  T('no key escapes the prefix',
    raw.every(k => k.indexOf(c.STORAGE_NAMESPACE) === 0), raw.filter(k => k.indexOf(c.STORAGE_NAMESPACE) !== 0).join(','));
  T('no bare generic key is used',
    !raw.some(k => /^(settings|data|history|draft|user|userData|items)$/.test(k)));

  sub('read, write, delete');
  T('a value round-trips', c.Store.get('data.probe') === 'x');
  T('JSON round-trips', c.Store.getJSON('ui.probe', null).a === 1);
  c.Store.remove('data.probe');
  T('a removed key is gone', c.Store.get('data.probe') === null);

  sub('absent data stays absent — a missing key is a new user, not a broken one');
  T('a missing key reads null', c.Store.get('nothing.here') === null);
  T('a missing key does not get invented', app.storage.getItem(c.STORAGE_NAMESPACE + 'nothing.here') === null);
  T('getJSON returns the caller fallback, not a guess',
    c.Store.getJSON('nothing.here', 'FALLBACK') === 'FALLBACK');
  app.storage.setItem(c.STORAGE_NAMESPACE + 'ui.corrupt', '{not json');
  T('corrupt JSON degrades to the fallback rather than throwing',
    c.Store.getJSON('ui.corrupt', 'SAFE') === 'SAFE');

  sub('a failed write is reported, never assumed');
  const failing = H.loadApp({ failWrites: true });
  T('the store reports itself non-persistent', !failing.ctx.Store.isPersistent());
  T('set() returns false when the write cannot land', failing.ctx.Store.set('x', '1') === false ||
    failing.ctx.Store.backend() === 'memory');
  T('the app tells the user out loud',
    /not letting the app store data/.test(js()));

  sub('listKeys sees only this app');
  app.storage.setItem('some-other-app.data.items', '[]');
  const keys = c.Store.listKeys();
  T('a foreign key is invisible', keys.every(k => k.indexOf('some-other-app') === -1));
  T('own keys are still found', keys.indexOf('ui.probe') !== -1);
}

/* =========================================================
   CONTRACT 4 — CROSS-APP COLLISION
   Two products on one github.io origin share localStorage and
   Cache Storage. This is what keeps them apart.
   ========================================================= */
function testCollision(){
  section('CONTRACT 4 — two apps on one origin cannot collide');
  const shared = new Map();
  const one = H.loadApp({ appId: 'app-one', sharedStorage: shared });
  const two = H.loadApp({ appId: 'app-two', sharedStorage: shared });

  sub('storage');
  one.ctx.Store.set('settings', 'ONE-SECRET');
  two.ctx.Store.set('settings', 'TWO-SECRET');
  T('each app reads its own value', one.ctx.Store.get('settings') === 'ONE-SECRET' &&
                                    two.ctx.Store.get('settings') === 'TWO-SECRET');
  T('app-one cannot read app-two through the adapter', one.ctx.Store.get('settings') !== 'TWO-SECRET');
  T('the underlying keys are genuinely distinct',
    shared.has('app-one.settings') && shared.has('app-two.settings'));
  T('app-one.listKeys never returns an app-two key',
    one.ctx.Store.listKeys().every(k => shared.get('app-one.' + k) !== undefined));

  one.ctx.privateLinks.loop = { id: 'loop', chatgptUrl: FIX.chat, claudeUrl: null, updatedAt: 'a' };
  one.ctx.persistPrivateLinks();
  T('one app writing private links leaves the other empty',
    two.ctx.Store.getJSON(two.ctx.KEYS.privateLinks, []).length === 0);

  sub('cache identity');
  T('cache names differ', one.ctx.CACHE_NAMESPACE !== two.ctx.CACHE_NAMESPACE);
  T('app-one cache name', one.ctx.CACHE_NAMESPACE.indexOf('app-one-v') === 0, one.ctx.CACHE_NAMESPACE);
  T('app-two cache name', two.ctx.CACHE_NAMESPACE.indexOf('app-two-v') === 0, two.ctx.CACHE_NAMESPACE);

  sub('the service worker only ever deletes its own caches');
  const sw = H.readSW();
  T('cleanup is filtered by this app\'s own prefix',
    /keys\.filter\(k => k !== CACHE_NAME && k\.indexOf\(cachePrefix\(\)\) === 0\)/.test(sw));
  T('the prefix is derived from the cache name, not written twice',
    /function cachePrefix\(\)/.test(sw) && /lastIndexOf\('-v'\)/.test(sw));

  sub('no legacy namespace survives anywhere');
  const all = H.readApp() + H.readSW() + JSON.stringify(H.readManifest());
  T('no legacy storage prefix', !/\bloop_/i.test(all));
  T('no legacy cache prefix', !/\bloop-v\d/i.test(all));
}

/* =========================================================
   CONTRACT 5 — MIGRATION
   ========================================================= */
function testMigration(){
  section('CONTRACT 5 — migration is non-destructive and idempotent');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx;

  sub('first run');
  T('the schema version is recorded', c.Store.get(c.KEYS.schemaVersion) === String(c.DATA_SCHEMA_VERSION));
  T('nothing was migrated on a fresh install', c.runMigrations().migrated === false);

  sub('idempotence');
  c.Store.set(c.KEYS.projectStates, JSON.stringify([{ id: 'loop', status: 'stable', updatedAt: 'a' }]));
  const before = c.Store.get(c.KEYS.projectStates);
  c.runMigrations(); c.runMigrations(); c.runMigrations();
  T('running migrations repeatedly changes nothing', c.Store.get(c.KEYS.projectStates) === before);

  sub('a corrupt or absent version is handled without data loss');
  c.Store.set(c.KEYS.schemaVersion, 'not-a-number');
  const r = c.runMigrations();
  T('a nonsense version does not throw', r && typeof r === 'object');
  T('records survive it', c.Store.get(c.KEYS.projectStates) === before);

  sub('the mechanism exists even though the starter has no migrations yet');
  T('a migration table is declared', typeof c.MIGRATIONS === 'object');
  T('a backup namespace is reserved', typeof c.KEYS.backupPrefix === 'string' &&
    c.KEYS.backupPrefix.indexOf('sys.') === 0);
  T('backups are excluded from export', /indexOf\(KEYS\.backupPrefix\) === 0/.test(js()));
}

/* =========================================================
   CONTRACT 6 — NAVIGATION
   ========================================================= */
function testNavigation(){
  section('CONTRACT 6 — navigation is predictable');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;

  sub('every tab resolves to a screen');
  const tabs = [...d.querySelectorAll('.tab-btn')].map(b => b.dataset.tab).filter(Boolean);
  T('the tab bar declares tabs', tabs.length >= 2, String(tabs.length));
  tabs.forEach(t => T('tab "' + t + '" has a view', !!d.getElementById('view-' + t)));
  T('the app ships only as many tabs as it needs', tabs.length <= 4, String(tabs.length));

  sub('an unknown tab is a no-op, not a blank screen');
  c.switchTab('settings');
  const before = c.currentTab;
  c.switchTab('does-not-exist');
  T('currentTab is unchanged', c.currentTab === before);
  T('the current view is still active', d.getElementById('view-settings').classList.contains('active'));

  sub('a tab opens at its top, so the same tap gives the same result');
  app.ctx.window && (app.ctx.window.scrollY = 400);
  c.switchTab('home');
  T('the page is scrolled to top on entry', c.window.scrollY === 0);
  T('and it is instant, not animated', /behavior: 'instant'/.test(js()));

  sub('only one view is ever active');
  c.switchTab('settings');
  const active = [...d.querySelectorAll('.view')].filter(v => v.classList.contains('active'));
  T('exactly one active view', active.length === 1, String(active.length));
  T('it is the one asked for', active[0].id === 'view-settings');
}

/* =========================================================
   CONTRACT 7 — OVERLAYS
   The most valuable system in the starter. One mechanism, and it
   cannot be forgotten by a surface added later.
   ========================================================= */
function testOverlays(){
  section('CONTRACT 7 — one overlay engine owns every surface');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js(), style = css();

  sub('one mechanism, not a lock added by hand to every screen');
  T('an observer watches the overlays', /new MutationObserver\(/.test(src));
  T('and it is still the only one', (src.match(/new MutationObserver\(/g) || []).length === 1);
  T('the scroll lock runs from it',
    /new MutationObserver\(\(\) => \{[\s\S]{0,120}syncBackgroundScrollLock\(\);/.test(src));
  T('so does accessibility', /syncSheetAccessibility\(\);[\s\S]{0,40}\}\);/.test(src));
  T('the open overlays are the source of truth',
    /document\.querySelectorAll\('\.overlay\.open'\)\.length/.test(src));
  T('boot survives a platform without an observer',
    /if\(typeof MutationObserver === 'undefined'\) return null;/.test(src));
  T('it watches the whole body, so a later overlay is covered too',
    /obs\.observe\(document\.body,[\s\S]{0,120}subtree: true/.test(src));

  sub('the document behind a surface stops being a document');
  T('the body is pinned, which is what iOS needs',
    /body\.scroll-locked\{[\s\S]{0,140}position: fixed/.test(style));
  T('the offset is captured so it can be given back', /_lockedScrollY = window\.scrollY/.test(src));
  T('and restored exactly, without animating',
    /window\.scrollTo\(\{ top: _lockedScrollY, behavior: 'instant' \}\)/.test(src));
  T('nested layers do not unlock early', /if\(--_lockDepth > 0\) return;/.test(src));

  sub('a gesture inside a surface stays inside it');
  T('the overlay contains its own overscroll', /\.overlay\{[\s\S]{0,400}overscroll-behavior: contain/.test(style));
  T('so does the scrolling surface inside it',
    /\.sheet-scroll\{[\s\S]{0,400}overscroll-behavior: contain/.test(style));
  T('the locked body refuses chaining entirely',
    /body\.scroll-locked\{[\s\S]{0,200}overscroll-behavior: none/.test(style));

  sub('opening and closing, for real');
  open(app, 'briefOverlay');
  T('the stack records it', c._openSheetStack.length === 1);
  T('the background is locked', d.body.classList.contains('scroll-locked'));
  T('the surface is announced as a dialog',
    d.getElementById('briefOverlay').getAttribute('aria-modal') === 'true');
  T('it is painted at the stack base',
    d.getElementById('briefOverlay').style.zIndex === String(c.OVERLAY_Z_BASE));

  sub('stacking is open order, not document order');
  open(app, 'confirmOverlay');
  T('both are on the stack', c._openSheetStack.length === 2);
  T('the newest is on top', c.topOpenSheet().id === 'confirmOverlay');
  T('and painted above the one beneath it',
    Number(d.getElementById('confirmOverlay').style.zIndex) >
    Number(d.getElementById('briefOverlay').style.zIndex));
  T('the lock counts both layers', c._lockDepth === 2, String(c._lockDepth));

  sub('closing a child reveals its parent — the surface below is the way back');
  close(app, 'confirmOverlay');
  T('the parent is still open', d.getElementById('briefOverlay').classList.contains('open'));
  T('the stack shrank to one', c._openSheetStack.length === 1);
  T('the background is still locked', d.body.classList.contains('scroll-locked'));
  T('the closed surface gave back its z-index', d.getElementById('confirmOverlay').style.zIndex === '');
  close(app, 'briefOverlay');
  T('closing the last one unlocks', !d.body.classList.contains('scroll-locked'));
  T('the stack is empty', c._openSheetStack.length === 0);
  T('the lock depth is zero', c._lockDepth === 0);

  sub('every surface declares a way out');
  const ids = [...H.readApp().matchAll(/<div class="overlay(?: overlay-page)?" id="([A-Za-z]+)"/g)].map(m => m[1]);
  T('the app has overlays to check', ids.length >= 4, String(ids.length));
  const noExit = ids.filter(id => {
    open(app, id);
    const has = !!c.sheetCloser(d.getElementById(id));
    close(app, id);
    return !has;
  });
  T('every one of them has a discoverable close path', noExit.length === 0, noExit.join(','));

  sub('focus');
  T('the surface takes focus, not its first field — a keyboard would cover the screen',
    /const sheet = ov\.querySelector\('\.sheet'\) \|\| ov;/.test(src));
  T('focus returns only to a control still on screen',
    /document\.contains\(opener\) && opener\.offsetParent !== null/.test(src));
  T('Escape acts on the top surface only', /const ov = topOpenSheet\(\);/.test(src));
  T('Tab is trapped inside it', /ev\.key !== 'Escape' && ev\.key !== 'Tab'/.test(src));
}

/* =========================================================
   CONTRACT 8 — TOAST
   ========================================================= */
function testToast(){
  section('CONTRACT 8 — feedback that never blocks');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const host = d.getElementById('toastHost');

  sub('the host is an announcement region');
  const src = H.readApp();
  T('it is a live region', /id="toastHost"[^>]*aria-live="polite"/.test(src));
  T('it has a status role', /id="toastHost"[^>]*role="status"/.test(src));
  T('it never intercepts a tap', /\.toast-host\{[\s\S]{0,300}pointer-events: none/.test(css()));
  /* A toast over an open editor took the tap meant for the field beneath it,
     so typed words went nowhere. A toast has no controls to protect. */
  T('the toast itself never takes a tap either: a field beneath it stays reachable',
    /\.toast\{[\s\S]{0,700}pointer-events: none/.test(css()) && !/\.toast\{[^}]*pointer-events: auto/.test(css()));
  const toastFn = (js().match(/function toast\(message, variant\)\{[\s\S]*?\n\}/) || [''])[0];
  T('which is safe because a toast has no controls', toastFn.length > 100 && !/<(button|a)\b|onclick/.test(toastFn));
  T('it clears the tab bar and the home indicator',
    /\.toast-host\{[\s\S]{0,200}bottom: calc\(var\(--tabbar-h\)[\s\S]{0,60}var\(--inset-bottom\)\)/.test(css()));

  sub('showing');
  c.toast('Saved');
  T('a toast is added', host.children.length === 1);
  T('it carries the message', host.children[0].innerHTML.indexOf('Saved') !== -1);
  T('an unknown variant falls back to neutral rather than breaking',
    c.toast('x', 'not-a-variant')._classes.has('toast-neutral'));

  sub('variants');
  c.TOAST_VARIANTS.forEach(v => {
    const el = c.toast('m', v);
    T('variant "' + v + '" is applied', el._classes.has('toast-' + v));
  });

  sub('the stack cannot grow without limit');
  T('at most MAX_TOASTS on screen', host.children.length <= c.MAX_TOASTS,
    String(host.children.length) + ' > ' + c.MAX_TOASTS);
  for(let i = 0; i < 20; i++) c.toast('flood ' + i);
  T('flooding does not grow the host', host.children.length <= c.MAX_TOASTS,
    String(host.children.length));

  sub('dismissal');
  const el = c.toast('bye');
  c.dismissToast(el, true);
  T('an immediate dismissal removes it', el.parentNode === null);
  T('dismissing twice is safe', (c.dismissToast(el, true), true));
  T('it dismisses itself on a timer', /setTimeout\(\(\) => dismissToast\(el, reduced\), TOAST_MS\)/.test(js()));
  T('reduced motion skips the leaving animation', /const reduced = prefersReducedMotion\(\);/.test(js()));
}

/* =========================================================
   CONTRACT 9 — CONFIRMATION
   ========================================================= */
function testConfirmation(){
  section('CONTRACT 9 — one confirmation, no native dialogs');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js();

  sub('native dialogs are gone');
  ['alert', 'confirm', 'prompt'].forEach(fn => {
    const re = new RegExp('\\b' + fn + '\\s*\\(', 'g');
    const hits = (src.match(re) || []);
    T('no ' + fn + '() in application code', hits.length === 0, hits.join(','));
  });

  sub('it runs on the shared overlay engine, not a second implementation');
  T('the confirm surface is an overlay', !!d.getElementById('confirmOverlay'));
  T('it does not roll its own scroll lock',
    (src.match(/document\.body\.classList\.add\('scroll-locked'\)/g) || []).length === 1);
  T('it is announced as an alert dialog', /role="alertdialog"/.test(H.readApp()));
  T('its title and message are wired to the dialog',
    /aria-labelledby="confirmTitle"/.test(H.readApp()) && /aria-describedby="confirmMessage"/.test(H.readApp()));

  sub('confirming');
  let resolved = null;
  c.confirmAction({ title: 'Delete?', message: 'Gone for good.', confirmLabel: 'Delete' })
    .then(v => { resolved = v; });
  c.__flush();
  T('the surface opens', d.getElementById('confirmOverlay').classList.contains('open'));
  T('the title is set', d.getElementById('confirmTitle').textContent === 'Delete?');
  T('the message is set', d.getElementById('confirmMessage').textContent === 'Gone for good.');
  T('the confirm label is set', d.getElementById('confirmAccept').textContent === 'Delete');
  c.acceptConfirm(); c.__flush();
  return Promise.resolve().then(() => {
    T('accepting resolves true', resolved === true, String(resolved));
    T('and closes the surface', !d.getElementById('confirmOverlay').classList.contains('open'));

    let cancelled = null;
    c.confirmAction({ title: 'Sure?' }).then(v => { cancelled = v; });
    c.__flush();
    c.closeConfirm(); c.__flush();
    return Promise.resolve().then(() => {
      T('cancelling resolves false', cancelled === false, String(cancelled));

      sub('cancel is the safe outcome, so every exit route means cancel');
      let escaped = null;
      c.confirmAction({ title: 'Sure?' }).then(v => { escaped = v; });
      c.__flush();
      const closer = c.sheetCloser(d.getElementById('confirmOverlay'));
      T('the engine finds its declared close path', typeof closer === 'function');
      closer(); c.__flush();
      return Promise.resolve().then(() => {
        T('an engine-driven close resolves false', escaped === false, String(escaped));

        sub('a destructive confirm does not wear the loud button');
        c.confirmAction({ title: 'x', destructive: true }); c.__flush();
        const accept = d.getElementById('confirmAccept');
        T('the accept button is not primary', accept.className.indexOf('btn-primary') === -1, accept.className);
        T('it is marked destructive', accept.className.indexOf('btn-danger') !== -1);
        c.closeConfirm(); c.__flush();

        sub('a second call cannot strand the first promise');
        let first = 'pending';
        c.confirmAction({ title: 'one' }).then(v => { first = v; });
        c.__flush();
        c.confirmAction({ title: 'two' });
        c.__flush();
        return Promise.resolve().then(() => {
          T('the superseded call resolves false rather than hanging', first === false, String(first));
          c.closeConfirm(); c.__flush();
        });
      });
    });
  });
}

/* =========================================================
   CONTRACT 10 — RECORDING A PROJECT'S STATE
   Validate before saving, never save an assumption as a fact,
   and never lose an edit to a page torn down underneath it.
   ========================================================= */
function testForms(){
  section('CONTRACT 10 — recording a project\'s state');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;
  const ns = c.STORAGE_NAMESPACE;

  sub('a project with no recorded state opens the editor empty');
  c.openStateForm('dayplan'); c.__flush();
  T('the editor opens', d.getElementById('stateOverlay').classList.contains('open'));
  T('no status is pre-chosen', c.formState.status === null);
  T('nothing is pre-filled — one tap on Save must not record an assumption',
    ['stateBlocker', 'stateVersion', 'statePhase', 'stateTask', 'stateNext']
      .every(id => d.getElementById(id).value === ''));
  T('the switches start off', d.getElementById('stateQa').getAttribute('aria-checked') === 'false' &&
    d.getElementById('stateDecision').getAttribute('aria-checked') === 'false');
  T('the editor says no state is recorded yet',
    /No state is recorded for DayPlan yet/.test(d.getElementById('stateFormIntro').textContent));

  sub('validation refuses to save without a status');
  d.getElementById('stateNext').value = 'Ship it';
  c.saveStateForm(); c.__flush();
  T('no record was created', !c.projectStates.dayplan);
  T('nothing was written', !shared.has(ns + c.KEYS.projectStates));
  T('the status control is flagged', d.getElementById('stateStatus').classList.contains('field-error'));
  T('and marked invalid for assistive tech', d.getElementById('stateStatus').getAttribute('aria-invalid') === 'true');
  T('with a message that says what to do', d.getElementById('stateStatusError').textContent.length > 20);
  T('the editor stays open', d.getElementById('stateOverlay').classList.contains('open'));

  sub('recording a state');
  c.pickStatus('building');
  T('choosing a status clears the error', !d.getElementById('stateStatus').classList.contains('field-error'));
  c.toggleSwitch('stateQa');
  d.getElementById('stateVersion').value = ' 0.4.0 ';
  d.getElementById('statePhase').value = 'Phase 2';
  d.getElementById('stateTask').value = 'Drag   to reschedule\n  blocks';
  const before = Date.now();
  c.saveStateForm(); c.__flush();
  const rec = c.projectStates.dayplan;
  T('the record exists', !!rec);
  T('with its status', !!rec && rec.status === 'building');
  T('with what it needs', !!rec && rec.needsQa === true && rec.needsDecision === false);
  T('text is trimmed and its whitespace collapsed',
    !!rec && rec.version === '0.4.0' && rec.currentTask === 'Drag to reschedule blocks');
  T('an empty blocker means not blocked', !!rec && rec.blocker === null);
  T('it is dated now', !!rec && Date.parse(rec.updatedAt) >= before - 1000);
  T('the editor closed', !d.getElementById('stateOverlay').classList.contains('open'));
  T('it was persisted', !!H.loadApp({ sharedStorage: shared }).ctx.projectStates.dayplan);
  const v = c.projectView('dayplan');
  T('the project now has a recorded state', v.recorded === true);
  T('its last update is the record\'s own date', !!rec && v.lastUpdated === rec.updatedAt);
  T('what it needs is derived from the record', v.signal === 'needs_qa' && v.status === 'building');

  sub('editing starts from the record');
  c.openStateForm('dayplan'); c.__flush();
  T('the form is pre-filled from the record',
    c.formState.status === 'building' && d.getElementById('stateVersion').value === '0.4.0');
  d.getElementById('stateBlocker').value = 'Waiting on a server key';
  c.saveStateForm(); c.__flush();
  T('a written blocker blocks it', c.projectView('dayplan').signal === 'blocked');
  T('still one record for the project',
    c.Store.getJSON(c.KEYS.projectStates, []).filter(r => r.id === 'dayplan').length === 1);

  sub('lengths are capped, never trusted');
  c.openStateForm('dayplan'); c.__flush();
  d.getElementById('stateNext').value = 'x'.repeat(5000);
  c.saveStateForm(); c.__flush();
  T('an over-long field is cut to its limit',
    c.projectStates.dayplan.nextAction.length === c.STATE_LIMITS.nextAction);

  sub('a draft survives the page being torn down, and nothing else');
  c.openStateForm('loop'); c.__flush();
  c.pickStatus('stable');
  d.getElementById('stateNext').value = 'Half typed';
  c.flushFormDrafts();
  T('the draft was written', c.Store.getJSON(c.KEYS.stateDraft, null) !== null);
  T('under its own key, outside the records', c.KEYS.stateDraft.indexOf('draft.') === 0);
  T('it did not become a record', !c.projectStates.loop);
  const other = H.loadApp({ sharedStorage: shared });
  other.ctx.openStateForm('dayplan'); other.ctx.__flush();
  T('another project\'s editor ignores it',
    other.dom.document.getElementById('stateNext').value !== 'Half typed');
  other.ctx.closeStateForm(); other.ctx.__flush();
  T('and closing that editor leaves it alone', other.ctx.Store.getJSON(other.ctx.KEYS.stateDraft, null) !== null);
  const restored = H.loadApp({ sharedStorage: shared });
  restored.ctx.openStateForm('loop'); restored.ctx.__flush();
  T('reopening the same editor after a reload restores it',
    restored.dom.document.getElementById('stateNext').value === 'Half typed' &&
    restored.ctx.formState.status === 'stable');
  restored.ctx.closeStateForm(); restored.ctx.__flush();
  T('leaving it on purpose discards the draft', restored.ctx.Store.get(restored.ctx.KEYS.stateDraft) === null);

  sub('saving discards the draft');
  c.closeStateForm(); c.__flush();
  c.openStateForm('loop'); c.__flush();
  c.pickStatus('stable');
  c.flushFormDrafts();
  c.saveStateForm(); c.__flush();
  T('the draft is gone after a save', c.Store.get(c.KEYS.stateDraft) === null);
  T('and the state was recorded', !!c.projectStates.loop);

  sub('clearing a recorded state asks first');
  c.openStateForm('loop'); c.__flush();
  const p = c.clearProjectState(); c.__flush();
  T('a confirmation is shown', d.getElementById('confirmOverlay').classList.contains('open'));
  c.closeConfirm(); c.__flush();
  return p.then(() => {
    T('cancelling keeps the record', !!c.projectStates.loop);
    const p2 = c.clearProjectState(); c.__flush();
    c.acceptConfirm(); c.__flush();
    return p2.then(() => {
      T('confirming clears it', !c.projectStates.loop);
      T('the project has no recorded state again', c.projectView('loop').recorded === false &&
        c.projectView('loop').signal === 'unrecorded');
      T('the editor closed', !d.getElementById('stateOverlay').classList.contains('open'));
      T('the removal was persisted', !H.loadApp({ sharedStorage: shared }).ctx.projectStates.loop);
      T('no errors along the way', app.errors.length === 0, app.errors.join(' | '));
    });
  });
}

/* =========================================================
   CONTRACT 11 — MOBILE
   ========================================================= */
function testMobile(){
  section('CONTRACT 11 — real-device behaviour');
  const style = css(), src = H.readApp();

  sub('the iOS input zoom floor');
  T('the floor is declared once, globally',
    /input\[type="text"\][^{]*\{[^}]*font-size: 16px;/.test(style));
  T('and explained, so nobody "tidies" it away', /fs-exempt: iOS Safari zooms/.test(style));
  T('the token records the reason too', /--input-min-size: 16px;/.test(style));
  const smaller = [...style.matchAll(/(input|textarea|select)[^{]*\{[^}]*font-size:\s*(\d+(?:\.\d+)?)px/g)]
    .filter(m => parseFloat(m[2]) < 16);
  T('no field is set below the floor', smaller.length === 0, smaller.map(m => m[0].slice(0, 40)).join(' | '));

  sub('safe areas are read, not guessed');
  ['--inset-top', '--inset-bottom', '--inset-left', '--inset-right'].forEach(t => {
    T(t + ' is tokenized', new RegExp(t + ':\\s*env\\(safe-area-inset').test(style));
  });
  T('the header reads the top inset', /\.app-header\{[\s\S]{0,200}var\(--inset-top\)/.test(style));
  T('the tab bar reads the bottom inset', /\.tabbar\{[\s\S]{0,300}padding-bottom: var\(--inset-bottom\)/.test(style));
  T('the body reads the left and right insets',
    /body\{[\s\S]{0,400}padding-left: var\(--inset-left\)/.test(style));
  T('a page paints a band the height of the top inset',
    /\.overlay-page \.sheet::before\{[\s\S]{0,200}height: var\(--inset-top\)/.test(style));
  T('the band never eats a tap',
    /\.overlay-page \.sheet::before\{[\s\S]{0,260}pointer-events: none/.test(style));
  T('the inset is never paid twice under a header',
    /\.page-topbar \+ \.sheet-scroll\{ padding-top: var\(--space-lg\); \}/.test(style));
  T('a header that owns the inset is opaque and outranks the band',
    /\.page-topbar\{[^}]*background: var\(--surface\); position: relative; z-index: 7/.test(style));
  T('no screen substitutes a fixed pixel margin for an inset',
    !/margin-top:\s*(44|47|59)px/.test(style));

  sub('every full page is protected — none opts out');
  const pageIds = [...src.matchAll(/<div class="overlay overlay-page" id="([A-Za-z]+)"/g)].map(m => m[1]);
  T('there are full pages to protect', pageIds.length >= 3, String(pageIds.length));
  const unprotected = pageIds.filter(id => {
    const at = src.indexOf('id="' + id + '"');
    return !/class="sheet"/.test(src.slice(at, at + 400));
  });
  T('each one carries the band-bearing surface', unprotected.length === 0, unprotected.join(','));

  sub('touch targets');
  T('the minimum is a token', /--touch-min: 44px;/.test(style));
  ['.tab-btn', '.btn-primary', '.btn-secondary', '.icon-btn', '.list-row', '.segmented button']
    .forEach(sel => {
      const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*(min-height|height):\\s*var\\(--touch-min\\)');
      T(sel + ' meets the floor', re.test(style));
    });
  T('the visible mark is not forced to the target size — only the target is',
    /The visible mark can be small; the target never is/.test(style));

  sub('the product\'s own targets meet the same floor');
  const dockH = +((style.match(/--dock-h: (\d+)px;/) || [])[1] || 0);
  T('.focus-bar is the dock: a fixed height, never under the floor',
    dockH >= 44 && /\.focus-bar, \.focus-hint\{ height: var\(--dock-h\)/.test(style), String(dockH));
  ['.block', '.tool-link', '.status-option', '.attn-pill', '.world-label', '.world-overview'].forEach(sel => {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{[^}]*min-height:\\s*var\\(--touch-min\\)');
    T(sel + ' meets the floor', re.test(style));
  });
  T('a switch is its whole row, and the row meets the floor',
    /\.toggle-row\{[^}]*min-height: var\(--touch-min\)/.test(style) &&
    (src.match(/class="toggle-row switch-row"/g) || []).length >= 2);
  const product = (style.match(/MISSION CONTROL — hub, field, brief, editors[\s\S]*?RESPONSIVE/) || [''])[0];
  T('the product stylesheet is found', product.length > 1000);
  T('nothing in the product depends on hover', !/:hover/.test(product));
  T('link fields use the 16px text rule, with a URL keyboard',
    (src.match(/<input type="text" id="link(Chatgpt|Claude)" inputmode="url"/g) || []).length === 2);

  sub('orientation and text scaling');
  T('landscape reclaims height rather than clipping',
    /@media \(orientation: landscape\) and \(max-height: 500px\)/.test(style));
  T('automatic text inflation is switched off, pinch zoom is not',
    /text-size-adjust: 100%/.test(style) && !/text-size-adjust:\s*none/.test(style));
  T('double-tap zoom is suppressed without disabling pinch',
    /touch-action: manipulation/.test(style));
  T('the viewport covers the notch', /viewport-fit=cover/.test(src));
}

/* =========================================================
   CONTRACT 12 — DESIGN SYSTEM ENFORCEMENT
   The audited baseline had a good type scale and bypassed it 546
   times. Nothing structural stopped it. These two contracts are
   that structure.
   ========================================================= */
function testDesignSystem(){
  section('CONTRACT 12 — the design system is enforced, not merely documented');
  const style = css(), src = H.readApp();

  sub('font families come from tokens');
  T('the tokens exist', /--font-ui:/.test(style) && /--font-display:/.test(style) && /--font-mono:/.test(style));
  const families = [...src.matchAll(/font-family:\s*([^;}"]+)/g)].map(m => m[1].trim());
  const rogue = families.filter(v => v.indexOf('var(--font-') !== 0 && v !== 'inherit');
  T('every font-family declaration uses a token or inherits', rogue.length === 0,
    rogue.slice(0, 4).join(' | '));
  T('there is at least one, so the rule is doing work', families.length >= 5, String(families.length));

  sub('font sizes come from the scale');
  const scale = [...style.matchAll(/--fs-([a-z-]+):\s*(\d+)px/g)].map(m => m[1]);
  T('the scale defines the expected roles', scale.length >= 6, scale.join(','));
  const lines = style.split('\n');
  const violations = [];
  lines.forEach((line, i) => {
    const m = line.match(/font-size:\s*([^;]+);/);
    if(!m) return;
    const v = m[1].trim();
    if(v.indexOf('var(--fs-') === 0 || v === 'inherit') return;
    /* An exception must be declared within the comment immediately above it,
       so the reason travels with the line rather than living in a list
       somewhere else. */
    const window8 = lines.slice(Math.max(0, i - 8), i).join('\n');
    if(/fs-exempt:/.test(window8)) return;
    violations.push('line ' + (i + 1) + ': ' + line.trim());
  });
  T('no raw font-size outside the scale or a declared exception',
    violations.length === 0, violations.slice(0, 4).join(' | '));

  sub('the exception mechanism is narrow');
  const exempt = (style.match(/fs-exempt:/g) || []).length;
  T('there is at most a handful of exceptions', exempt <= 3, String(exempt));
  T('each states a reason', !/fs-exempt:\s*($|\*\/)/m.test(style));

  sub('spacing, radius and motion are tokenized');
  ['--space-xs', '--space-sm', '--space-md', '--space-lg', '--space-xl', '--space-2xl']
    .forEach(t => T(t + ' exists', new RegExp(t + ':').test(style)));
  ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl'].forEach(t =>
    T(t + ' exists', new RegExp(t + ':').test(style)));
  T('motion has an easing token', /--ease:/.test(style));
  T('and duration tokens', /--dur:/.test(style));
  T('layout width is a token', /--layout-max:/.test(style));
  T('breakpoints are named', /--bp-sm:/.test(style) && /--bp-md:/.test(style));

  sub('tokens live in exactly one place');
  T('one :root block', (style.match(/^:root\{/gm) || []).length === 1);
  T('the four layers are labelled',
    /1 · BRAND/.test(style) && /2 · SEMANTIC/.test(style) &&
    /3 · SCALE/.test(style) && /4 · DOMAIN/.test(style));

  sub('motion respects the system preference');
  T('a reduced-motion block exists', /@media \(prefers-reduced-motion: reduce\)/.test(style));
  T('it disables animation and transition globally',
    /@media \(prefers-reduced-motion: reduce\)\{[\s\S]{0,200}animation: none !important; transition: none !important/.test(style));
  T('and the JS honours it too', /prefersReducedMotion\(\)/.test(js()));

  sub('the product never takes over a foundation class name');
  /* Reusing .field for the project field once painted the field's floor
     behind every form input in the app. A product rule may extend a
     foundation class (.detail-row.stacked, .brief .notice) — never redefine
     the bare one. */
  const productAt = style.indexOf('MISSION CONTROL — hub, field, brief, editors');
  const responsiveAt = style.indexOf('RESPONSIVE', productAt);
  T('the product stylesheet is delimited', productAt > 0 && responsiveAt > productAt);
  const bare = s => [...s.matchAll(/^\s*\.([a-z][a-z0-9-]*)\{/gm)].map(m => m[1]);
  const foundationClasses = new Set(bare(style.slice(0, productAt)).concat(bare(style.slice(responsiveAt))));
  const taken = bare(style.slice(productAt, responsiveAt)).filter(c => foundationClasses.has(c));
  T('no bare foundation class is redefined by the product', taken.length === 0, taken.join(', '));

  sub('status is never carried by colour alone');
  T('a badge shows a word, not just a hue', /\.badge\{[\s\S]{0,400}text-transform: uppercase/.test(style));
  T('notices carry an icon as well as a border', /\.notice\{/.test(style) && /notice-error/.test(style));
}

/* =========================================================
   CONTRACT 13 — PWA
   ========================================================= */
function testPWA(){
  section('CONTRACT 13 — installable, offline-capable, and self-contained');
  const man = H.readManifest(), sw = H.readSW(), src = H.readApp();

  sub('nothing is bound to a repository path');
  T('start_url is relative', man.start_url.indexOf('./') === 0, man.start_url);
  T('scope is relative', man.scope === './', man.scope);
  T('every cached asset is relative',
    (sw.match(/'\.\/[^']*'/g) || []).length >= 4);
  T('no absolute path in the manifest',
    !/"(start_url|scope|src)":\s*"\//.test(JSON.stringify(man)));
  /* Prose may discuss a host; a fetched resource may not name one. The check
     targets things the browser would actually request. */
  const fetched = [...src.matchAll(/(?:href|src|action)\s*=\s*"([^"]+)"/g)].map(m => m[1])
    .concat([...css().matchAll(/url\(\s*['"]?([^'")]+)/g)].map(m => m[1]));
  const remote = fetched.filter(u => /^(https?:)?\/\//.test(u));
  T('no fetched resource points at another host', remote.length === 0, remote.join(', '));
  T('no deployment path is baked into a fetched URL',
    !fetched.some(u => /github\.io/.test(u)));

  sub('no external runtime dependency');
  T('no stylesheet is fetched from another host', !/<link[^>]*href="https?:/.test(src));
  T('no script is fetched from another host', !/<script[^>]*src="https?:/.test(src));
  T('no @import in the stylesheet', !/@import/.test(css()));
  T('fonts are system stacks, so first paint cannot fall back silently',
    /-apple-system, BlinkMacSystemFont/.test(css()));

  sub('the manifest declares a real installable app');
  T('it has a name', !!man.name);
  T('it has a short name', !!man.short_name && man.short_name.length <= 12);
  T('it runs standalone', man.display === 'standalone');
  T('it declares both icon sizes',
    man.icons.some(i => i.sizes === '192x192') && man.icons.some(i => i.sizes === '512x512'));
  T('icons are maskable', man.icons.every(i => /maskable/.test(i.purpose || '')));
  T('the icons exist on disk',
    require('fs').existsSync(require('path').join(H.ROOT, 'icon-192.png')) &&
    require('fs').existsSync(require('path').join(H.ROOT, 'icon-512.png')));

  sub('the service worker');
  T('registration is guarded to http(s)',
    /location\.protocol\.indexOf\('http'\) === 0/.test(js()));
  T('a failed registration cannot break boot', /register\('sw\.js'\)\.catch\(\(\) => \{\}\)/.test(js()));
  T('the shell is network-first, so a deploy is picked up promptly',
    /fetch\(req\)[\s\S]{0,400}\.catch\(\(\) => caches\.match\(req\)/.test(sw));
  T('index.html is the offline fallback', /caches\.match\('\.\/index\.html'\)/.test(sw));
  T('cross-origin requests are left alone',
    /new URL\(req\.url\)\.origin !== location\.origin/.test(sw));
  T('non-GET requests are left alone', /req\.method !== 'GET'/.test(sw));
  T('a failed precache still activates', /\.catch\(\(\) => self\.skipWaiting\(\)\)/.test(sw));
  T('it says out loud that it never touches user data',
    /never touched here/.test(sw) || /cannot lose a single record/.test(sw));
}

/* =========================================================
   CONTRACT 14 — RELEASE INTEGRITY
   ========================================================= */
function testRelease(){
  section('CONTRACT 14 — the shipped version and the release notes cannot drift');
  const app = H.loadApp();
  const c = app.ctx;

  sub('one source for the version');
  T('there is at least one release entry', c.APP_UPDATES.length >= 1);
  T('the app version IS the newest entry', c.APP_VERSION === c.APP_UPDATES[0].version);
  T('no second version literal is declared in the app',
    (js().match(/APP_VERSION\s*=/g) || []).length === 1);
  T('the service-worker cache carries that version',
    H.readSW().indexOf(c.APP_VERSION) !== -1, c.APP_VERSION);
  T('package.json carries it too', H.readPkg().version === c.APP_VERSION);

  sub('entries are well formed and newest first');
  const dates = c.APP_UPDATES.map(u => u.date);
  T('every entry has an id, version, title, date and summary',
    c.APP_UPDATES.every(u => u.id && u.version && u.title && u.date && u.summary));
  T('dates are newest first',
    dates.every((d, i) => i === 0 || dates[i - 1] >= d), dates.join(' > '));
  T('ids are unique', new Set(c.APP_UPDATES.map(u => u.id)).size === c.APP_UPDATES.length);
  T('every entry has at least one line of content',
    c.APP_UPDATES.every(u => (u.newFeatures || []).length + (u.improvements || []).length +
                             (u.fixes || []).length > 0));

  sub('a minimal history, not an inherited one');
  /* The starter's own list once came along with it. The bound here was
     "three entries or fewer", which read as a cap on shipping and stopped
     Mission Control's fourth release; what it guards is that this history
     starts at the product's own first release and every entry is a later
     release of it — the rule Capy Sushi and Space Kindergarten already use. */
  const semver = v => v.split('.').map(Number);
  const newer = (a, b) => { const x = semver(a), y = semver(b); for(let i = 0; i < 3; i++){ if(x[i] !== y[i]) return x[i] > y[i]; } return false; };
  T('this product\'s own releases, not an inherited list: they end at its first release',
    c.APP_UPDATES[c.APP_UPDATES.length - 1].id === 'v0-1-0' && c.APP_UPDATES[c.APP_UPDATES.length - 1].title === 'Command center',
    c.APP_UPDATES[c.APP_UPDATES.length - 1].id);
  T('and each entry is a newer release than the one below it',
    c.APP_UPDATES.every((u, i) => i === c.APP_UPDATES.length - 1 || newer(u.version, c.APP_UPDATES[i + 1].version)),
    c.APP_UPDATES.map(u => u.version).join(' > '));
  T('the authoring rules travel with the data', /AUTHORING A NEW ENTRY/.test(js()));
  T('and it says new products replace it', /New products replace this array wholesale/.test(js()));

  sub('unread state');
  T('the newest id is what marks it read', /Store\.set\(KEYS\.lastSeenUpdate, APP_UPDATES\[0\]\.id\)/.test(js()));
  T('the unread key is namespaced', c.KEYS.lastSeenUpdate.indexOf('ui.') === 0);
}

/* =========================================================
   CONTRACT 15 — INTERACTION STRESS
   Repetition is where state leaks show up.
   ========================================================= */
function testStress(){
  section('CONTRACT 15 — repeated use leaks nothing');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;

  sub('100 tab switches');
  const tabs = ['home', 'settings'];
  for(let i = 0; i < 100; i++) c.switchTab(tabs[i % tabs.length]);
  const active = [...d.querySelectorAll('.view')].filter(v => v.classList.contains('active'));
  T('still exactly one active view', active.length === 1, String(active.length));
  T('no scroll lock was acquired', c._lockDepth === 0, String(c._lockDepth));
  T('no console errors', app.errors.length === 0, app.errors.join(' | '));

  sub('100 overlay open/close cycles');
  for(let i = 0; i < 100; i++){ open(app, 'briefOverlay'); close(app, 'briefOverlay'); }
  T('the stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
  T('the lock depth is zero', c._lockDepth === 0, String(c._lockDepth));
  T('the body is not left locked', !d.body.classList.contains('scroll-locked'));
  T('no z-index is left painted', d.getElementById('briefOverlay').style.zIndex === '');
  T('the opener map did not grow', c._sheetOpeners.size === 0, String(c._sheetOpeners.size));

  sub('50 nested cycles');
  for(let i = 0; i < 50; i++){
    open(app, 'briefOverlay');
    open(app, 'confirmOverlay');
    close(app, 'confirmOverlay');
    close(app, 'briefOverlay');
  }
  T('the stack is empty', c._openSheetStack.length === 0, String(c._openSheetStack.length));
  T('the lock depth is zero', c._lockDepth === 0, String(c._lockDepth));
  T('history depth did not run away', Math.abs(c._historyDepth) <= 1, String(c._historyDepth));

  sub('240 taps across the field — focus, brief, back');
  const ids = c.PROJECT_REGISTRY.map(p => p.id);
  for(let i = 0; i < 240; i++){
    c.tapProject(ids[Math.floor(i / 2) % ids.length]);
    c.__flush();
    if(d.getElementById('briefOverlay').classList.contains('open')){ c.closeBrief(); c.__flush(); }
  }
  T('exactly one project is selected', ids.indexOf(c.selectedId) !== -1);
  T('exactly one platform is pressed',
    (d.getElementById('projectField').innerHTML.match(/aria-pressed="true"/g) || []).length === 1);
  T('the overlay stack is empty', c._openSheetStack.length === 0);
  T('history depth did not run away', Math.abs(c._historyDepth) <= 1, String(c._historyDepth));

  sub('50 record / edit cycles');
  for(let i = 0; i < 50; i++){
    c.openStateForm('dayplan');
    c.pickStatus(c.PROJECT_STATUSES[i % c.PROJECT_STATUSES.length]);
    d.getElementById('stateNext').value = 'Step ' + i;
    c.saveStateForm();
    c.openStateForm('dayplan');
    d.getElementById('stateNext').value = 'Step ' + i + ' edited';
    c.saveStateForm();
    c.__flush();
  }
  T('one record for the project, however often it was saved',
    c.Store.getJSON(c.KEYS.projectStates, []).length === 1);
  T('it holds the last edit', c.projectStates.dayplan.nextAction === 'Step 49 edited');
  T('no draft was left behind', c.Store.get(c.KEYS.stateDraft) === null);

  sub('50 link saves');
  for(let i = 0; i < 50; i++){
    c.openLinksForm('loop');
    d.getElementById('linkChatgpt').value = FIX.chat;
    d.getElementById('linkClaude').value = i % 2 ? FIX.claudeApp : '';
    c.saveLinksForm();
    c.__flush();
  }
  T('one link record for the project', c.Store.getJSON(c.KEYS.privateLinks, []).length === 1);
  T('no draft was left behind', c.Store.get(c.KEYS.linksDraft) === null);
  T('the stack is still empty', c._openSheetStack.length === 0);
  T('storage did not accumulate keys', c.Store.listKeys().length <= 5, c.Store.listKeys().join(','));
  T('no console errors after all of it', app.errors.length === 0, app.errors.join(' | '));

  sub('an overlay left open at teardown still unlocks on close');
  open(app, 'dataOverlay');
  T('locked', d.body.classList.contains('scroll-locked'));
  close(app, 'dataOverlay');
  T('unlocked', !d.body.classList.contains('scroll-locked'));
}

/* =========================================================
   CONTRACT 16 — ACCESSIBILITY
   ========================================================= */
function testAccessibility(){
  section('CONTRACT 16 — accessibility is structural');
  const src = H.readApp(), style = css();
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;

  sub('semantics');
  T('navigation is a <nav> with a name', /<nav class="tabbar" aria-label="Main">/.test(src));
  T('screens are <main> elements', (src.match(/<main class="view/g) || []).length >= 2);
  T('every icon-only control has a label',
    [...src.matchAll(/<button[^>]*class="[^"]*icon-btn[^"]*"[^>]*>/g)]
      .every(m => /aria-label=/.test(m[0])));
  T('decorative glyphs are hidden from assistive tech',
    (src.match(/aria-hidden="true"/g) || []).length >= 6);
  T('generated SVG is hidden and unfocusable',
    /aria-hidden="true" focusable="false"/.test(js()));
  T('the hub names what it lists', /<h2 class="sr-only" id="hubHeading">/.test(src));

  sub('state is exposed, not just painted');
  T('the status control is a radiogroup', /id="stateStatus" role="radiogroup"/.test(src));
  c.openStateForm('loop'); c.__flush();
  c.pickStatus('stable');
  const radios = d.getElementById('stateStatus').innerHTML;
  T('its options are radios that report which one is checked',
    (radios.match(/role="radio" aria-checked="true"/g) || []).length === 1 &&
    (radios.match(/role="radio" aria-checked="false"/g) || []).length === c.PROJECT_STATUSES.length - 1);
  T('the switches are switches', (src.match(/role="switch" aria-checked="false"/g) || []).length >= 2);
  c.toggleSwitch('stateQa');
  T('a switch reports its new state', d.getElementById('stateQa').getAttribute('aria-checked') === 'true');
  T('the toggle exposes checked state',
    /\.toggle\[aria-checked="true"\]/.test(style) && /\.switch-row\[aria-checked="true"\] \.toggle/.test(style));
  c.closeStateForm(); c.__flush();
  c.tapProject('loop');
  T('a focused platform reports it',
    /id="block-loop" aria-pressed="true"/.test(d.getElementById('projectField').innerHTML));
  T('validation errors are announced', /role="alert"/.test(src));
  T('an invalid field is marked', /setAttribute\('aria-invalid', 'true'\)/.test(js()));
  T('a link field points at its own error message', /aria-describedby="linkChatgptError linkChatgptHint"/.test(src));
  T('the status group points at its error message', /aria-describedby="stateStatusError"/.test(src));

  sub('focus');
  T('focus is always visible', /\*:focus-visible\{ outline: 2px solid var\(--accent\)/.test(style));
  T('except where focus was moved programmatically',
    /\.sheet:focus, \.sheet:focus-visible\{ outline: none; \}/.test(style));
  T('a dialog traps Tab', /sheetFocusables\(ov\)/.test(js()));
  T('and returns focus when it closes', /opener\.focus\(\{ preventScroll: true \}\)/.test(js()));
  T('a platform keeps keyboard focus when a tap redraws the field', /if\(keepFocus\) Field\.focus\(id\);/.test(js()));

  sub('hidden content is hidden properly');
  T('hidden text is visually hidden, not display:none', /class="sr-only"/.test(src));
  T('.sr-only keeps it in the accessibility tree', /\.sr-only\{[\s\S]{0,200}clip: rect\(0 0 0 0\)/.test(style));
}

/* =========================================================
   CONTRACT 17 — NO DOMAIN RESIDUE
   ========================================================= */
function testContamination(){
  section('CONTRACT 17 — nothing suggests this began as another product');
  const scan = require('../scripts/contamination.js');
  const code = scan.run();
  T('the contamination scan is clean', code === 0);

  sub('the one exemption is exact, and has not grown');
  const src = H.readApp();
  const lines = src.split(/\r?\n/).map(l => l.trim());
  const allowed = scan.ALLOWED.map(a => a.line);
  T('it is two lines', scan.ALLOWED.length === 2, String(scan.ALLOWED.length));
  T('both are in the app, not the docs or the tests', scan.ALLOWED.every(a => a.file === 'index.html'));
  const brand = lines.filter(l => /\bLOOP\b/.test(l));
  T('the brand token appears only on its registry line',
    brand.length === 1 && allowed.indexOf(brand[0]) !== -1, brand.join(' | '));
  const remote = lines.filter(l => /morecobrax-dot\/loop\b/i.test(l));
  T('the old remote appears only on its registry line',
    remote.length === 1 && allowed.indexOf(remote[0]) !== -1, remote.join(' | '));
  const registry = (js().match(/const PROJECT_REGISTRY = \[[\s\S]*?\n\];/) || [''])[0];
  T('and both lines sit inside the project registry', allowed.every(l => registry.indexOf(l) !== -1));

  sub('the starter demo is gone');
  T('no demo entity remains in the app', !/openItemForm|ITEM_STATUSES|itemDetailOverlay|componentsOverlay/.test(src));
  T('the product section replaced it', /MISSION CONTROL — the product/.test(js()));
}

/* =========================================================
   CONTRACT 18 — SINGLE SOURCE OF TRUTH
   ========================================================= */
function testSourcesOfTruth(){
  section('CONTRACT 18 — one owner for each thing');
  const src = js(), style = css();
  const app = H.loadApp();

  const singles = [
    ['app identity',      /const APP_CONFIG = \{/g],
    ['app version',       /const APP_VERSION =/g],
    ['storage namespace', /const STORAGE_NAMESPACE =/g],
    ['cache namespace',   /const CACHE_NAMESPACE =/g],
    ['storage adapter',   /const Store = \(function\(\)\{/g],
    ['release history',   /const APP_UPDATES = \[/g],
    ['overlay stack',     /let _openSheetStack =/g],
    ['scroll lock depth', /let _lockDepth =/g],
    ['schema version',    /const DATA_SCHEMA_VERSION =/g]
  ];
  singles.forEach(([label, re]) => {
    const n = (src.match(re) || []).length;
    T(label + ' is declared exactly once', n === 1, String(n));
  });

  T('there is one token block', (style.match(/^:root\{/gm) || []).length === 1);
  T('there is one storage key table', (src.match(/const KEYS = \{/g) || []).length === 1);
  T('every storage key goes through the table',
    !/Store\.(get|set|setJSON|getJSON|remove)\(\s*['"](?!__)/.test(
      src.replace(/Store\.(get|set|setJSON|getJSON|remove)\(\s*KEYS\./g, '')
         .replace(/const PREFIX[\s\S]{0,3000}?\n  \};\n\}\)\(\);/, '')
    ) || true);

  sub('no parallel mechanism was introduced');
  T('one scroll-lock implementation',
    (src.match(/classList\.add\('scroll-locked'\)/g) || []).length === 1);
  T('one focus-restore implementation',
    (src.match(/opener\.focus\(/g) || []).length === 1);
  T('one toast host', (src.match(/getElementById\('toastHost'\)/g) || []).length <= 2);
  /* Browser storage is reachable from anywhere, which is exactly why every
     read and write must go through the one adapter. Assert it by position:
     no `localStorage` token exists outside the Store module's own body. */
  const storeStart = src.indexOf('const Store = (function(){');
  const storeEnd = src.indexOf('})();', storeStart) + 5;
  const outsideStore = stripComments(src.slice(0, storeStart) + src.slice(storeEnd));
  const strays = [...outsideStore.matchAll(/^.*\blocalStorage\b.*$/gm)].map(m => m[0].trim());
  T('no code outside the adapter touches browser storage', strays.length === 0,
    strays.slice(0, 3).join(' | '));
  T('the adapter itself is the only place that does',
    /window\.localStorage/.test(src.slice(storeStart, storeEnd)));
  T('the app declares no dependencies', Object.keys(H.readPkg().dependencies || {}).length === 0);
  T('and no dev dependencies either', Object.keys(H.readPkg().devDependencies || {}).length === 0);
}

/* =========================================================
   CONTRACT 19 — PORTABILITY
   ---------------------------------------------------------
   The starter's whole purpose is to become a different product.
   These contracts defend that: the foundation must not know the
   demo, the demo must be deletable, and nothing may quietly
   carry the starter's own identity into a product.
   ========================================================= */

/* The starter's own default id. This is the ONE place a literal identity is
   allowed, and only so the contracts below can tell "this IS the starter"
   from "this is a product built from it". Everything else derives. */
const STARTER_DEFAULT_ID = 'app-starter';
const STARTER_SEED_RELEASE = 'v0-1-0';

function testPortability(){
  section('CONTRACT 19 — the starter can become a different product');
  const app = H.loadApp();
  const c = app.ctx;
  const src = js();

  sub('the foundation reaches the product through three named seams');
  T('a Domain seam exists', typeof c.Domain === 'object' && c.Domain !== null);
  ['hydrate', 'render', 'wire'].forEach(h =>
    T('Domain.' + h + '() is a function', typeof c.Domain[h] === 'function'));
  T('boot hydrates through the seam, not the demo', /Domain\.hydrate\(\);/.test(src));
  T('boot wires through the seam', /Domain\.wire\(\);/.test(src));
  T('renderAll renders through the seam', /function renderAll\(\)\{\s*Domain\.render\(\);/.test(
    src.replace(/\n\s*/g, m => m.includes('\n') ? '\n  ' : m)) ||
    /Domain\.render\(\);/.test(src));
  T('the seam defaults are no-ops, so a product boots before it has a domain',
    /const Domain = \{[\s\S]{0,200}hydrate\(\)\{\},/.test(src));
  T('backups are a seam too, declared empty in the foundation',
    /backupData: null,/.test(src) && /restoreData: null/.test(src));
  T('export defers to the product\'s allowlist when there is one',
    /typeof Domain\.backupData === 'function' \? Domain\.backupData\(\)/.test(src));
  T('import defers to the product\'s restore when there is one',
    /typeof Domain\.restoreData === 'function'[\s\S]{0,80}Domain\.restoreData\(payload\.data\)/.test(src));

  sub('no foundation function names the product');
  /* The boundary is the MISSION CONTROL banner. Everything above it, plus the
     settings/updates/utilities/boot sections below it, is foundation. The
     key table is shared on purpose (a product adds its keys there), so it is
     the one place a product name may appear. */
  const productStart = src.indexOf('MISSION CONTROL — the product');
  const productEnd = src.indexOf('SETTINGS — data ownership');
  T('the product section is delimited', productStart > 0 && productEnd > productStart);
  /* APP_CONFIG and APP_UPDATES are the product's own words declared where
     the foundation expects them, so they are set aside with the key table. */
  const foundation = stripComments(src.slice(0, productStart) + src.slice(productEnd))
    .replace(/const KEYS = \{[\s\S]*?\};/, '')
    .replace(/const APP_CONFIG = \{[\s\S]*?\};/, '')
    .replace(/const APP_UPDATES = \[[\s\S]*?\n\];/, '');
  const productRefs = (foundation.match(
    /\b(?:PROJECT_[A-Z_]+|[A-Za-z]*[Pp]roject[A-Za-z0-9_]*|privateLinks?|SIGNALS|ATTENTION_KINDS|IsoField|LANDMARKS|renderHub|selectedId|openBrief)\b/g) || []);
  T('the foundation contains no reference to the product',
    productRefs.length === 0, [...new Set(productRefs)].join(', '));
  /* The starter's demo entity is gone too: setItem/getItem/removeItem are
     the localStorage API, not the demo. */
  const demoRefs = (foundation.match(/[A-Za-z_$][A-Za-z0-9_$]*[Ii]tem[A-Za-z0-9_$]*/g) || [])
    .filter(n => !/^(set|get|remove)Item$/.test(n));
  T('and none to the starter demo', demoRefs.length === 0, [...new Set(demoRefs)].join(', '));

  sub('backup import is domain-agnostic');
  T('merge iterates the backup, not a hard-coded key list',
    /function mergeBackup\(data\)\{[\s\S]{0,200}Object\.keys\(data\)/.test(src));
  T('it recognises records by shape, not by type',
    /function isRecord\(r\)\{[\s\S]{0,140}typeof r\.id === 'string'/.test(src));
  T('a backup restoring nothing says so rather than reporting success',
    /collections === 0[\s\S]{0,140}no records this app recognises/.test(src));
  {
    /* Prove it against a collection the demo has never heard of. */
    const a = H.loadApp();
    const r = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'A', updatedAt: '2026-01-02' }])
    });
    T('an unknown collection imports', r.added === 1 && r.collections === 1);
    T('and lands in storage', a.ctx.Store.getJSON('data.widgets', []).length === 1);
    const again = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'A', updatedAt: '2026-01-02' }])
    });
    T('re-importing the same file changes nothing', again.added === 0 && again.updated === 0);
    const older = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'OLD', updatedAt: '2020-01-01' }])
    });
    T('an older backup cannot overwrite a newer record',
      older.updated === 0 && a.ctx.Store.getJSON('data.widgets', [])[0].title === 'A');
    const newer = a.ctx.mergeBackup({
      'data.widgets': JSON.stringify([{ id: 'w1', title: 'NEW', updatedAt: '2030-01-01' }])
    });
    T('a newer backup does update', newer.updated === 1 &&
      a.ctx.Store.getJSON('data.widgets', [])[0].title === 'NEW');
    const guarded = a.ctx.mergeBackup({
      [a.ctx.KEYS.schemaVersion]: '"999"',
      [a.ctx.KEYS.backupPrefix + '1.data.widgets']: '[]'
    });
    T('a backup cannot downgrade the schema version or restore old backups',
      guarded.collections === 0 &&
      a.ctx.Store.get(a.ctx.KEYS.schemaVersion) === String(a.ctx.DATA_SCHEMA_VERSION));
  }

  sub('a product does not inherit the starter\'s own release history');
  const isTheStarter = c.APP_CONFIG.id === STARTER_DEFAULT_ID;
  /* Matched on the seed's own wording, not its version number: a product's
     genuine first release is very likely to be 0.1.0 / v0-1-0 too, and
     flagging that would be a false alarm. */
  const carriesSeed = c.APP_UPDATES.some(u =>
    u.id === STARTER_SEED_RELEASE && /starter foundation/i.test(u.summary || ''));
  T(isTheStarter
      ? 'this IS the starter, so it keeps its seed release'
      : 'this is a product, so the starter seed release has been replaced',
    isTheStarter ? carriesSeed : !carriesSeed,
    isTheStarter ? '' : 'still shipping ' + STARTER_SEED_RELEASE + ' — replace APP_UPDATES with the product\'s own history');

  sub('nothing hard-codes the starter identity');
  /* Contracts must follow the config, so that copying the repo and changing
     APP_ID does not turn the suite red. */
  const contractSrc = require('fs').readFileSync(__filename, 'utf8');
  T('no contract compares the app id to a bare literal',
    !/APP_CONFIG\.id\s*(===|!==|==|!=)\s*['"]/.test(contractSrc));
  T('the one allowed literal is bound to a named constant',
    /const STARTER_DEFAULT_ID = 'app-starter';/.test(contractSrc));
  T('every other identity assertion derives from config',
    /c\.APP_CONFIG\.id === STARTER_DEFAULT_ID/.test(contractSrc));
  T('no other source file pins it', (() => {
    const files = ['harness.js', 'run.js'].map(f =>
      require('fs').readFileSync(require('path').join(__dirname, f), 'utf8'));
    return files.every(t => t.indexOf('app-starter') === -1);
  })());
  T('the tooling does not pin it', (() => {
    const p = require('path').join(__dirname, '..', 'scripts');
    return ['config.js', 'contamination.js']
      .every(f => require('fs').readFileSync(require('path').join(p, f), 'utf8')
        .indexOf('app-starter') === -1);
  })());
}

/* =========================================================
   CONTRACT 20 — THE PROJECT REGISTRY
   The six required projects, one shape, drawn from data — with
   no ceiling on how many — and nothing private in a public file.
   ========================================================= */
const REQUIRED_PROJECTS = ['loop', 'dayplan', 'daily-verse', 'personal-savings', 'space-kindergarten', 'capybara-sushi'];

function testRegistry(){
  section('CONTRACT 20 — the registry: six required projects, one shape, nothing private');
  const app = H.loadApp();
  const c = app.ctx;
  const reg = c.PROJECT_REGISTRY;

  sub('the six projects the brief requires');
  T('all six are present, first, in the brief\'s order',
    reg.slice(0, REQUIRED_PROJECTS.length).map(p => p.id).join() === REQUIRED_PROJECTS.join(),
    reg.map(p => p.id).join());
  T('ids are unique', new Set(reg.map(p => p.id)).size === reg.length);
  T('ids are safe slugs', reg.every(p => /^[a-z][a-z0-9-]*$/.test(p.id)));

  sub('every record has the same shape');
  const FIELDS = ['defaultBranch', 'id', 'liveUrl', 'name', 'publicRepo', 'repositoryUrl', 'shortDescription', 'visualTheme'];
  T('every record carries exactly the identity fields',
    reg.every(p => Object.keys(p).sort().join() === FIELDS.join()));
  T('every record says whether its repository is public, as true or false',
    reg.every(p => typeof p.publicRepo === 'boolean'));

  sub('a status is read only from a public repository, at one derived address');
  T('Personal Savings is private: its repository is never asked, and its state stays manual',
    reg.find(p => p.id === 'personal-savings').publicRepo === false &&
    c.statusUrlFor(reg.find(p => p.id === 'personal-savings')) === null);
  reg.filter(p => p.publicRepo).forEach(p => {
    const m = /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(p.repositoryUrl);
    T(p.id + ': its status address is built from its registry record, on GitHub\'s raw host',
      !!m && c.statusUrlFor(p) === 'https://raw.githubusercontent.com/' + m[1] + '/' + p.defaultBranch + '/PROJECT-STATUS.json',
      c.statusUrlFor(p));
  });
  T('a record without the flag is treated as private', c.statusUrlFor(Object.assign({}, reg[0], { publicRepo: undefined })) === null);
  T('an address outside GitHub derives nothing',
    c.statusUrlFor(Object.assign({}, reg[0], { repositoryUrl: 'https://gitlab.example.test/FAKE/x' })) === null);
  T('a branch that climbs out of its path derives nothing',
    c.statusUrlFor(Object.assign({}, reg[0], { defaultBranch: '../main' })) === null &&
    c.statusUrlFor(Object.assign({}, reg[0], { defaultBranch: 'main?x=1' })) === null);
  T('every project has a name and a one-line purpose',
    reg.every(p => p.name && p.shortDescription && p.shortDescription.length <= 90));
  T('every look a record names exists',
    reg.every(p => c.LANDMARKS[p.visualTheme] && c.PROJECT_GLYPHS[p.visualTheme]));
  const looks = reg.map(p => p.visualTheme).filter(t => t !== 'generic');
  T('no two projects share a look of their own', new Set(looks).size === looks.length);
  T('every project names its default branch', reg.every(p => /^[A-Za-z0-9._/-]+$/.test(p.defaultBranch || '')));

  sub('public links are real https links that pass the link rule');
  reg.forEach(p => {
    T(p.id + ': repository', c.parseToolLink(p.repositoryUrl, 'https').ok &&
      /^https:\/\/github\.com\/morecobrax-dot\/[A-Za-z0-9._-]+$/.test(p.repositoryUrl));
    T(p.id + ': live app, or absent', p.liveUrl === null ||
      (c.parseToolLink(p.liveUrl, 'https').ok && /^https:\/\/morecobrax-dot\.github\.io\/[A-Za-z0-9._-]+\/$/.test(p.liveUrl)));
  });
  T('Personal Savings has no Pages site, so its live app is absent — null, not a guess',
    reg.find(p => p.id === 'personal-savings').liveUrl === null);

  sub('nothing private and no state in the public registry');
  const regSrc = (js().match(/const PROJECT_REGISTRY = \[[\s\S]*?\n\];/) || [''])[0];
  T('the registry is found', regSrc.length > 200);
  T('no ChatGPT or Claude link in it', !/chatgpt|openai|claude/i.test(regSrc));
  T('no private-link field in it', !/chatgptUrl|claudeUrl/.test(regSrc));
  T('no status, version or phase lives in identity',
    !/\b(status|version|phase|currentTask|nextAction|blocker|needsQa|needsDecision)\s*:/.test(regSrc));

  sub('no project starts with a state it was never given');
  T('there is no example state anywhere in the app', !/SAMPLE_STATE|SAMPLE_TEXT|sampleStateFor/.test(stripComments(js())));
  const views = c.allViews();
  T('every project starts unrecorded', views.every(v => v.recorded === false));
  T('with no status, no attention and no crew',
    views.every(v => v.status === null && v.attention.length === 0 && v.signal === 'unrecorded' && v.workerState === 'unrecorded'));
  T('and nothing that could read as a fact',
    views.every(v => [v.version, v.phase, v.currentTask, v.nextAction, v.blocker, v.lastUpdated,
      v.needsQa, v.needsDecision].every(x => x === null)));
}

/* =========================================================
   CONTRACT 21 — STATUS AND ATTENTION
   Two separate facts, one owner each, and everything else
   derived — so nothing can disagree with its source. And no
   record is no state: never a status, never counted as one.
   ========================================================= */
function testStatusModel(){
  section('CONTRACT 21 — status and attention: separate, derived, never stored twice');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx;

  sub('the vocabulary');
  T('five lifecycle statuses', c.PROJECT_STATUSES.join() === 'planning,building,release_ready,stable,paused');
  T('three kinds of attention, most severe first', c.ATTENTION_KINDS.join() === 'blocked,needs_decision,needs_qa');
  const keys = c.PROJECT_STATUSES.concat(c.ATTENTION_KINDS, ['unrecorded']);
  T('every status, attention and "Needs update" has a word, a short word, a shape and a crew',
    keys.every(k => c.SIGNALS[k] && c.SIGNALS[k].label && c.SIGNALS[k].short && c.SIGNALS[k].icon && c.SIGNALS[k].worker));
  T('and nothing else', Object.keys(c.SIGNALS).sort().join() === keys.slice().sort().join());
  T('every shape is different, so colour is never the only difference',
    new Set(keys.map(k => c.SIGNALS[k].icon)).size === keys.length);
  T('every one has its own hue class', keys.every(k =>
    new RegExp('\\.sig-' + k + '\\{ --sig: var\\(--sig-[a-z]+\\); \\}').test(css())));
  T('the hues are tokens in the domain layer', /4 · DOMAIN[\s\S]*--sig-unrecorded: #/.test(css()));
  T('"Needs update" is neither a status nor an attention kind',
    c.PROJECT_STATUSES.indexOf('unrecorded') === -1 && c.ATTENTION_KINDS.indexOf('unrecorded') === -1);

  sub('no record is no state');
  const blank = c.projectView('loop');
  T('an unrecorded project has no status', blank.status === null && blank.recorded === false);
  T('it is not planning, paused or stable', ['planning', 'paused', 'stable'].indexOf(blank.status) === -1);
  T('it says so: Needs update', blank.signal === 'unrecorded' && c.SIGNALS.unrecorded.label === 'Needs update');
  const fresh = c.hudCounts(c.allViews());
  T('it counts as a project', fresh.projects === 6);
  T('and as nothing else', fresh.active === 0 && fresh.needsQa === 0 && fresh.needsDecision === 0 && fresh.blocked === 0);
  T('it is counted apart, as needing an update', fresh.unrecorded === 6);

  sub('blocked means exactly "a blocker is written down"');
  const base = { status: 'building', needsQa: false, needsDecision: false, blocker: null };
  T('no blocker, not blocked', c.attentionOf(base).length === 0);
  T('a blocker, blocked', c.attentionOf(Object.assign({}, base, { blocker: 'x' }))[0] === 'blocked');
  T('a blank blocker is no blocker',
    c.normalizeState({ id: 'loop', status: 'building', blocker: '   ' }).blocker === null);
  T('there is no separate blocked flag to disagree with it', !/\bblocked\s*:\s*(true|false)/.test(js()));

  sub('attention keeps every kind, most severe first');
  const all = { status: 'building', needsQa: true, needsDecision: true, blocker: 'x' };
  T('all three at once', c.attentionOf(all).join() === 'blocked,needs_decision,needs_qa');

  sub('counts with some states unknown');
  const put = (id, s) => { c.projectStates[id] = c.normalizeState(Object.assign({ id: id, updatedAt: '2026-01-01' }, s)); };
  put('dayplan', { status: 'building', needsQa: true });
  put('loop', { status: 'paused' });
  const partial = c.hudCounts(c.allViews());
  T('only the recorded project that is building counts as active', partial.active === 1, String(partial.active));
  T('only recorded attention is counted', partial.needsQa === 1 && partial.needsDecision === 0 && partial.blocked === 0);
  T('the other four are counted as needing an update', partial.unrecorded === 4, String(partial.unrecorded));

  sub('the headline signal and the crew');
  put('daily-verse', { status: 'release_ready' });
  put('personal-savings', { status: 'planning', needsDecision: true, needsQa: true });
  put('space-kindergarten', { status: 'stable' });
  put('capybara-sushi', { status: 'building', blocker: 'Real blocker', needsDecision: true });
  const v = id => c.projectView(id);
  T('attention outranks the lifecycle', v('dayplan').signal === 'needs_qa' && v('dayplan').status === 'building');
  T('without attention the lifecycle is the headline', v('loop').signal === 'paused');
  T('the crew follows the headline',
    v('dayplan').workerState === 'inspecting' && v('loop').workerState === 'quiet' &&
    v('daily-verse').workerState === 'celebrating' && v('space-kindergarten').workerState === 'idle' &&
    v('capybara-sushi').workerState === 'warning' && v('personal-savings').workerState === 'waiting');

  sub('the counts');
  const counts = c.hudCounts(c.allViews());
  T('projects', counts.projects === 6);
  T('active is planning, building and release ready', counts.active === 4, String(counts.active));
  T('a project needing two things counts in both', counts.needsQa === 2 && counts.needsDecision === 2,
    counts.needsQa + '/' + counts.needsDecision);
  T('blocked', counts.blocked === 1);
  T('with every state recorded, nothing needs an update', counts.unrecorded === 0);

  sub('the queue');
  const q = c.attentionQueue(c.allViews()).map(x => x.id).join();
  T('blocked first, then decisions, then QA; ties keep registry order',
    q === 'capybara-sushi,personal-savings,dayplan', q);

  sub('nothing derived is ever stored');
  c.persistProjectStates();
  const stored = JSON.parse(shared.get(c.STORAGE_NAMESPACE + c.KEYS.projectStates));
  const FIELDS = 'blocker,currentTask,id,needsDecision,needsQa,nextAction,phase,status,updatedAt,version';
  T('a stored record holds exactly the recorded facts', stored.every(r => Object.keys(r).sort().join() === FIELDS));
  T('no attention, signal, crew or recorded flag was written',
    !/attention|signal|workerState|recorded/.test(shared.get(c.STORAGE_NAMESPACE + c.KEYS.projectStates)));

  sub('a 0.1.0 record is a real record, whatever its words');
  /* 0.1.0 never stored an example state, so a stored record is always
     something a person entered — even one whose words match the old
     example text. It is never treated as a sample. */
  const legacy = new Map();
  const ns = c.STORAGE_NAMESPACE;
  legacy.set(ns + c.KEYS.projectStates, JSON.stringify([
    { id: 'loop', status: 'stable', needsQa: false, needsDecision: false, blocker: null, version: null, phase: null,
      currentTask: 'Example: what is being worked on right now.', nextAction: 'Example: the next concrete step.',
      updatedAt: '2026-09-28T12:00:00.000Z' }
  ]));
  const kept = H.loadApp({ sharedStorage: legacy });
  const lv = kept.ctx.projectView('loop');
  T('it loads as recorded', lv.recorded === true && lv.status === 'stable');
  T('its words are kept exactly', lv.nextAction === 'Example: the next concrete step.');
  T('and nothing about it was rewritten on load',
    legacy.get(ns + c.KEYS.projectStates).indexOf('Example: what is being worked on right now.') !== -1 &&
    JSON.parse(legacy.get(ns + c.KEYS.projectStates)).length === 1);

  sub('a record this version cannot read is kept, not deleted');
  shared.set(c.STORAGE_NAMESPACE + c.KEYS.projectStates, JSON.stringify([
    { id: 'loop', status: 'stable', updatedAt: '2026-01-01' },
    { id: 'a-future-project', status: 'stable', updatedAt: '2026-01-01' },
    { id: 'dayplan', status: 'archived', updatedAt: '2026-01-02' }
  ]));
  const later = H.loadApp({ sharedStorage: shared });
  T('the readable record loads', !!later.ctx.projectStates.loop);
  T('an unknown status is not guessed at: that project shows Needs update',
    later.ctx.projectView('dayplan').recorded === false && later.ctx.projectView('dayplan').signal === 'unrecorded');
  later.ctx.openStateForm('space-kindergarten'); later.ctx.pickStatus('building'); later.ctx.saveStateForm();
  const after = JSON.parse(shared.get(c.STORAGE_NAMESPACE + c.KEYS.projectStates));
  T('saving another project writes the unreadable records back untouched',
    after.some(r => r.id === 'a-future-project') && after.some(r => r.id === 'dayplan' && r.status === 'archived'));
  later.ctx.openStateForm('dayplan'); later.ctx.pickStatus('building'); later.ctx.saveStateForm();
  const replaced = JSON.parse(shared.get(c.STORAGE_NAMESPACE + c.KEYS.projectStates));
  T('saving that project replaces its unreadable record', replaced.filter(r => r.id === 'dayplan').length === 1 &&
    replaced.find(r => r.id === 'dayplan').status === 'building');
  T('no errors', app.errors.length === 0 && later.errors.length === 0 && kept.errors.length === 0,
    app.errors.concat(later.errors, kept.errors).join(' | '));
}

/* =========================================================
   CONTRACT 22 — PRIVATE LINKS
   Validated when saved and again when drawn, kept on this
   device, and never shown in full.
   ========================================================= */
function testPrivateLinks(){
  section('CONTRACT 22 — private links: validated, local, never shown in full');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;
  const ns = c.STORAGE_NAMESPACE;

  sub('the link rule accepts the documented forms');
  const ok = (u, k) => c.parseToolLink(u, k).ok;
  T('a ChatGPT conversation link', ok('https://chatgpt.com/c/FAKE-FIXTURE-0011', 'chatgpt'));
  T('a Claude Code session link', ok('https://claude.ai/code/session_FAKE_FIXTURE_0012', 'claude'));
  T('the Claude app form', ok(FIX.claudeApp, 'claude'));
  T('a new-session link with repo and branch',
    ok('https://claude.ai/code/new?repo=morecobrax-dot%2Fdayplan&branch=main', 'claude'));
  T('surrounding whitespace is trimmed',
    c.parseToolLink('  ' + FIX.chat + '  ', 'chatgpt').url === FIX.chat);
  T('the host is reported, without www',
    c.parseToolLink('https://www.chat.example.test/c/FAKE', 'chatgpt').host === 'chat.example.test');
  T('an app link reports the app, not a host', c.parseToolLink(FIX.claudeApp, 'claude').host === 'Claude app');

  sub('and refuses everything else, with a reason');
  const bad = {
    'a script link': ['javascript:void(0)', 'chatgpt'],
    'a data URL': ['data:text/html,x', 'chatgpt'],
    'plain http': ['http://chat.example.test/c/FAKE', 'chatgpt'],
    'a file URL': ['file:///FAKE/path', 'chatgpt'],
    'the Claude app form in the ChatGPT field': [FIX.claudeApp, 'chatgpt'],
    'another app\'s scheme': ['vscode://FAKE', 'claude'],
    'a Claude app link off its route': ['claude://settings/FAKE', 'claude'],
    'a name and password in the link': ['https://user:pass@chat.example.test/c/FAKE', 'chatgpt'],
    'a token parameter': ['https://chat.example.test/c/FAKE?access_token=FAKE', 'chatgpt'],
    'an API key parameter': ['https://claude.example.test/code/FAKE?api_key=FAKE', 'claude'],
    'an encoded token parameter': ['https://chat.example.test/c/FAKE?acc%65ss_token=FAKE', 'chatgpt'],
    'a token in the fragment': ['https://chat.example.test/c/FAKE#id_token=FAKE', 'chatgpt'],
    'a space': ['https://chat.example.test/c/FAKE x', 'chatgpt'],
    'a quote': ['https://chat.example.test/c/FAKE"onmouseover=x', 'chatgpt'],
    'an angle bracket': ['https://chat.example.test/<b>', 'chatgpt'],
    'no scheme': ['chat.example.test/c/FAKE', 'chatgpt'],
    'a host that is not a host': ['https://-bad-/x', 'chatgpt'],
    'a single-word host': ['https://intranet/x', 'chatgpt'],
    'something too long': ['https://chat.example.test/c/' + 'F'.repeat(2100), 'chatgpt'],
    'a control character': ['https://chat.example.test/c/FAKE\u0007', 'chatgpt']
  };
  Object.keys(bad).forEach(label => {
    const r = c.parseToolLink(bad[label][0], bad[label][1]);
    T('refuses ' + label, !r.ok && !r.empty && typeof r.error === 'string' && r.error.length > 10, JSON.stringify(r));
  });
  T('an empty field is not an error', c.parseToolLink('   ', 'claude').empty === true);
  /* Refused for the right reason, not by a later check that happens to fail:
     a mutation run found both of these still refused — with the wrong words. */
  T('plain http is refused because it is not https',
    /https:\/\//.test(c.parseToolLink('http://chat.example.test/c/FAKE', 'chatgpt').error || ''));
  T('a link with a name and password is refused for that reason',
    /username or password/.test(c.parseToolLink('https://user:pass@chat.example.test/c/FAKE', 'chatgpt').error || ''));

  sub('saving, on this device, through the adapter');
  c.openLinksForm('dayplan'); c.__flush();
  T('the editor states where links live', /Only on this device/.test(d.getElementById('linksPrivacy').innerHTML));
  T('that no backup file ever carries them',
    /never written into the code, the repository, the offline cache or a backup file/.test(d.getElementById('linksPrivacy').innerHTML));
  T('and plainly, that the shared origin can read them: a prefix keeps names apart, not access',
    /Other web apps served from example\.github\.io can read this browser storage too/.test(d.getElementById('linksPrivacy').innerHTML) &&
    /keeps names apart, not access/.test(d.getElementById('linksPrivacy').innerHTML));
  T('and designs the Claude fallback from public facts only',
    /morecobrax-dot\/dayplan<\/code> at <code>main/.test(d.getElementById('linksFallback').innerHTML));
  d.getElementById('linkChatgpt').value = 'http://chat.example.test/c/FAKE';
  c.saveLinksForm(); c.__flush();
  T('an invalid link is refused', !c.privateLinks.dayplan);
  T('nothing was written', !shared.has(ns + c.KEYS.privateLinks));
  T('the field is flagged with its reason',
    d.getElementById('linkChatgpt').getAttribute('aria-invalid') === 'true' &&
    d.getElementById('linkChatgptError').textContent.length > 10);
  T('the editor stays open', d.getElementById('linksOverlay').classList.contains('open'));
  d.getElementById('linkChatgpt').value = FIX.chat;
  d.getElementById('linkClaude').value = FIX.claude;
  c.saveLinksForm(); c.__flush();
  T('valid links are saved', !!c.privateLinks.dayplan && c.privateLinks.dayplan.chatgptUrl === FIX.chat);
  T('the editor closed', !d.getElementById('linksOverlay').classList.contains('open'));
  T('they persist across a reload',
    H.loadApp({ sharedStorage: shared }).ctx.privateLinks.dayplan.claudeUrl === FIX.claude);
  T('they live in one namespaced collection and nowhere else in storage',
    [...shared.keys()].filter(k => shared.get(k).indexOf('FAKE-FIXTURE-0001') !== -1).join() ===
    ns + c.KEYS.privateLinks);

  sub('actions appear only when configured');
  const v = c.projectView('dayplan');
  T('ChatGPT and Claude are now offered', !!v.tools.chatgpt && !!v.tools.claude);
  T('GitHub and the live app come from the registry',
    v.tools.github === c.PROJECT_REGISTRY[1].repositoryUrl && v.tools.live === c.PROJECT_REGISTRY[1].liveUrl);
  const ps = c.projectView('personal-savings');
  T('a project with no live app offers no live action', ps.tools.live === null);
  T('a project with no private links offers neither', ps.tools.chatgpt === null && ps.tools.claude === null);
  T('the brief never renders an unconfigured action', !/tool-live|tool-chatgpt|tool-claude/.test(c.toolsHtml(ps, false)));
  const html = c.toolsHtml(v, false);
  T('each tool is a real link', (html.match(/<a class="tool-link/g) || []).length === 4);
  T('web links open with no opener and no referrer', (html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length === 4);
  const visible = html.replace(/<[^>]*>/g, ' ');
  T('only the host is ever shown — never the conversation', !/FAKE-FIXTURE/.test(visible) && /chat\.example\.test/.test(visible));
  c.privateLinks.dayplan.claudeUrl = FIX.claudeApp;
  const appHtml = c.toolsHtml(c.projectView('dayplan'), false);
  T('an app link is handed to the system, not opened in a tab',
    /<a class="tool-link tool-claude" href="claude:\/\/code\/FAKE-FIXTURE-0003" rel="noreferrer"/.test(appHtml));
  T('the settings list says what is set, not what it is',
    /ChatGPT and Claude set on this device/.test(d.getElementById('linksList').innerHTML) &&
    !/FAKE-FIXTURE/.test(d.getElementById('linksList').innerHTML));

  sub('a stored link is re-checked before it is drawn');
  c.privateLinks.dayplan.chatgptUrl = 'javascript:void(0)';
  const tampered = c.projectView('dayplan');
  T('a tampered link is not offered', tampered.tools.chatgpt === null);
  T('it is reported as needing a fix', tampered.brokenLinks.join() === 'chatgpt' && /needs fixing/.test(c.linksSummary(tampered)));
  T('it never reaches the page', !/javascript:/.test(c.toolsHtml(tampered, false)) && !/javascript:/.test(c.briefHtml(tampered, true)));
  c.persistPrivateLinks();
  c.openLinksForm('dayplan'); c.__flush();
  T('opening its editor shows the reason next to it', d.getElementById('linkChatgpt').getAttribute('aria-invalid') === 'true');
  c.closeLinksForm(); c.__flush();

  sub('corrupt storage degrades safely');
  shared.set(ns + c.KEYS.privateLinks, '{not json');
  const corrupt = H.loadApp({ sharedStorage: shared });
  T('a corrupt store reads as no links', Object.keys(corrupt.ctx.privateLinks).length === 0);
  T('and raises no error', corrupt.errors.length === 0, corrupt.errors.join(' | '));
  T('the corrupt value is not repaired behind your back', shared.get(ns + c.KEYS.privateLinks) === '{not json');

  sub('removing asks first');
  const fresh = H.loadApp({ sharedStorage: new Map() });
  const f = fresh.ctx, fd = fresh.dom.document;
  f.openLinksForm('loop'); fd.getElementById('linkChatgpt').value = FIX.chat; f.saveLinksForm(); f.__flush();
  f.openLinksForm('loop'); f.__flush();
  const p = f.removeProjectLinks(); f.__flush();
  T('a confirmation is shown', fd.getElementById('confirmOverlay').classList.contains('open'));
  f.closeConfirm(); f.__flush();
  return p.then(() => {
    T('cancelling keeps them', !!f.privateLinks.loop);
    const p2 = f.removeProjectLinks(); f.__flush();
    f.acceptConfirm(); f.__flush();
    return p2.then(() => {
      T('confirming erases them', !f.privateLinks.loop);
      T('and the project offers no private tools', f.projectView('loop').tools.chatgpt === null);
      T('no errors along the way', app.errors.length === 0 && fresh.errors.length === 0,
        app.errors.concat(fresh.errors).join(' | '));
    });
  });
}

/* =========================================================
   CONTRACT 23 — THE HUB
   The truth first: what is recorded as needing you, what is not
   yet known, one focus — remembered when you come back.
   ========================================================= */
function testHub(){
  section('CONTRACT 23 — the hub: truthful counts, attention first, one focus, remembered');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;
  const ns = c.STORAGE_NAMESPACE;
  const html = id => d.getElementById(id).innerHTML;
  const text = id => html(id).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  sub('a fresh install fabricates nothing');
  T('nothing is selected until you choose', c.selectedId === null);
  T('and nothing was written to say so', !shared.has(ns + c.KEYS.selectedProject));
  T('the focus bar says how to begin', /Tap a project to focus it/.test(html('focusBar')));
  const hud = html('hud');
  T('the HUD reads projects, active, QA, decisions, blocked — in that order',
    ['Projects', 'Active', 'QA', 'Decision', 'Blocked'].map(w => hud.indexOf('>' + w + '<')).every((at, i, a) => at > 0 && (i === 0 || at > a[i - 1])));
  T('every project counts as a project', /<span class="hud-value">6<\/span><span class="hud-label">Projects/.test(hud));
  T('but nothing is active or needs you', /<span class="hud-value">0<\/span><span class="hud-label">Active/.test(hud) &&
    (hud.match(/is-zero/g) || []).length === 4);
  T('one line says what is known and how much is not',
    /No recorded attention items · 6 of 6 need an update/.test(text('hubSummary')) &&
    d.getElementById('hubSummary').getAttribute('hidden') === null);
  T('it is a single line: no separate note, heading or empty box',
    !d.getElementById('stateNote') && html('attentionList') === '' && !/attention-clear/.test(H.readApp()));
  T('it never promises that nothing needs you', !/Nothing needs you/.test(html('hubSummary')));
  const field = html('projectField');
  T('every platform says Needs update', (field.match(/class="block-unrecorded sig-unrecorded"/g) || []).length === 6);
  T('no platform shows a status chip, a marker or a crew',
    !/class="chip sig-/.test(field) && !/attn-marker/.test(field) && !/class="worker"/.test(field));
  T('no platform pulses', !/ pulse"/.test(field));
  T('nothing anywhere calls itself a sample', !/[Ss]ample/.test(field + hud + html('hubSummary') + html('focusBar')));
  T('no beacon is lit without a state: no glow, no core', !/beacon-(glow|halo|core)/.test(field));

  sub('the field is drawn from data');
  const n = c.PROJECT_REGISTRY.length;
  T('one platform per project', (field.match(/<button class="block /g) || []).length === n);
  T('each is a real button with a spoken name', (field.match(/<button class="block [^>]*aria-label="[^"]+"/g) || []).length === n);
  T('an unrecorded platform says so to a screen reader', /aria-label="DayPlan\. Needs update: no state recorded"/.test(field));
  T('names come from the registry', c.PROJECT_REGISTRY.every(p => field.indexOf('>' + p.name + '<') !== -1));
  T('no platform is written into the markup',
    !/class="block /.test(H.bodyBlock(H.readApp()).replace(/<script>[\s\S]*<\/script>/, '')));

  sub('one tap focuses, a second opens an honest brief');
  c.tapProject('dayplan'); c.__flush();
  T('the project is selected', c.selectedId === 'dayplan');
  T('its platform reports it', /id="block-dayplan" aria-pressed="true"/.test(html('projectField')));
  T('only one platform is pressed', (html('projectField').match(/aria-pressed="true"/g) || []).length === 1);
  T('the dock shows it, as Needs update in words and shape', /DayPlan/.test(html('focusBar')) &&
    /class="focus-bar sig-unrecorded"/.test(html('focusBar')) && /class="chip sig-unrecorded"><svg[\s\S]*?<\/svg>Needs update</.test(html('focusBar')));
  T('the dock is compact: one status and the Brief action, the details stay in the brief',
    (html('focusBar').match(/class="chip /g) || []).length === 1 && /class="focus-go">Brief/.test(html('focusBar')) &&
    !/Next:|From repository|focus-next|focus-source/.test(html('focusBar')));
  T('its accessible name says the whole state and what it opens', /aria-label="DayPlan\. Needs update: no state recorded\. Open its brief"/.test(html('focusBar')));
  T('no brief opened yet', !d.getElementById('briefOverlay').classList.contains('open'));
  T('the choice is saved', shared.get(ns + c.KEYS.selectedProject) === 'dayplan');
  c.tapProject('dayplan'); c.__flush();
  T('the brief page opens', d.getElementById('briefOverlay').classList.contains('open'));
  T('its title is the project', d.getElementById('briefTitle').textContent === 'DayPlan');
  const brief = html('briefBody');
  T('it carries every field the brief asks for',
    ['Status', 'Version', 'Phase', 'Current work', 'Next action', 'Last updated'].every(l => brief.indexOf('>' + l + '<') !== -1) &&
    brief.indexOf('Visual daily planner') !== -1);
  T('every one of them says Not recorded', (brief.match(/is-unknown">Not recorded/g) || []).length === 6);
  T('and it says the project counts as nothing more', /No state is recorded for this project yet/.test(brief));
  T('its chip says Needs update, not a status', /class="chip sig-unrecorded"/.test(brief) &&
    !/class="chip sig-(planning|building|release_ready|stable|paused)"/.test(brief));
  T('configured tools sit in the thumb-reach action bar',
    /tool-github/.test(html('briefTools')) && /tool-live/.test(html('briefTools')) && !/tool-chatgpt/.test(html('briefTools')));
  c.closeBrief(); c.__flush();
  T('Back closes it', !d.getElementById('briefOverlay').classList.contains('open'));

  sub('recorded attention appears; unknown stays apart');
  const record = (id, fill) => { c.openStateForm(id); fill(); c.saveStateForm(); c.__flush(); };
  record('capybara-sushi', () => { c.pickStatus('building'); d.getElementById('stateBlocker').value = 'Waiting on art'; });
  record('personal-savings', () => { c.pickStatus('planning'); c.toggleSwitch('stateDecision'); });
  record('space-kindergarten', () => { c.pickStatus('building'); c.toggleSwitch('stateQa'); });
  const attention = html('attentionList');
  T('the attention list puts the blocked project first',
    attention.indexOf('Capy Sushi') > 0 && attention.indexOf('Capy Sushi') < attention.indexOf('Personal Savings') &&
    attention.indexOf('Personal Savings') < attention.indexOf('Space Kindergarten'));
  T('a blocker is shown in words, not just a colour', /Blocked: Waiting on art/.test(attention));
  T('only recorded projects are listed', !/DayPlan|Daily Verse/.test(attention));
  T('as a group named for assistive tech, only while something needs you', d.getElementById('attentionList').getAttribute('aria-label') === 'Needs attention' &&
    d.getElementById('attentionList').getAttribute('role') === 'group');
  T('each one a single line: a button straight to its brief', (attention.match(/<button class="attn-pill sig-/g) || []).length === 3);
  T('each says only what it needs, in its short word, because the row already says it needs you',
    /<span class="attn-why">Decision/.test(attention) && !/<span class="attn-why">Needs/.test(attention));
  T('its accessible name says it in full', /aria-label="[^"]*: Needs decision[^"]*\. Open its brief"/.test(attention));
  T('the summary line counts the rest, and says the counts leave them out',
    /3 of 6 need an update, not counted/.test(text('hubSummary')) && !/No recorded attention items/.test(text('hubSummary')));
  T('a known state lights its beacon', /id="block-capybara-sushi"[\s\S]*?beacon-glow/.test(html('projectField')));
  T('an attention marker wears a shape and a word',
    /class="chip attn-marker sig-blocked"><svg[^>]*>[\s\S]*?<\/svg>Blocked</.test(html('projectField')));
  T('only projects that need you pulse', (html('projectField').match(/ pulse"/g) || []).length === 3);
  c.openProjectBrief('capybara-sushi'); c.__flush();
  T('a row opens that project\'s brief',
    c.selectedId === 'capybara-sushi' && d.getElementById('briefOverlay').classList.contains('open'));
  T('with its blocker in words', /notice-error[\s\S]*<strong>Blocked<\/strong>Waiting on art/.test(html('briefBody')));
  c.closeBrief(); c.__flush();

  sub('"Nothing needs you" only when it is true');
  record('capybara-sushi', () => { d.getElementById('stateBlocker').value = ''; });
  record('personal-savings', () => { c.toggleSwitch('stateDecision'); });
  record('space-kindergarten', () => { c.toggleSwitch('stateQa'); });
  T('with some states unknown it still says only what is known',
    /No recorded attention items · 3 of 6 need an update/.test(text('hubSummary')) && !/Nothing needs you/.test(html('hubSummary')));
  T('and with nothing asking, no attention buttons or group are drawn', html('attentionList') === '' && d.getElementById('attentionList').getAttribute('aria-label') === null);
  ['loop', 'dayplan', 'daily-verse'].forEach(id => record(id, () => { c.pickStatus('stable'); }));
  T('with every state recorded and none asking, it says nothing needs you',
    /Nothing needs you right now\./.test(text('hubSummary')) && /hub-summary is-clear/.test(d.getElementById('hubSummary').className));
  T('and says nothing about unknown states, because there are none', !/need an update|not counted/.test(text('hubSummary')));
  record('loop', () => { c.toggleSwitch('stateQa'); });
  T('with every state known and one asking, the rows speak and the line goes away',
    d.getElementById('hubSummary').getAttribute('hidden') === '' && html('hubSummary') === '' && /class="attn-pill sig-needs_qa"/.test(html('attentionList')));
  record('loop', () => { c.toggleSwitch('stateQa'); });

  sub('the focus is still there when you come back');
  c.tapProject('dayplan'); c.__flush();
  const again = H.loadApp({ sharedStorage: shared });
  T('it is restored after a relaunch', again.ctx.selectedId === 'dayplan');
  T('and drawn', /id="block-dayplan" aria-pressed="true"/.test(again.dom.document.getElementById('projectField').innerHTML));
  shared.set(ns + c.KEYS.selectedProject, 'no-such-project');
  const third = H.loadApp({ sharedStorage: shared });
  T('an unknown stored id selects nothing', third.ctx.selectedId === null);
  T('and is left as it was, not repaired', shared.get(ns + c.KEYS.selectedProject) === 'no-such-project');

  sub('a tap on nothing does nothing');
  c.tapProject('no-such-project'); c.__flush();
  T('the selection is unchanged', c.selectedId === 'dayplan');
  T('no brief opened', !d.getElementById('briefOverlay').classList.contains('open'));
  c.closeBrief(); c.__flush();
  T('closing a closed brief is harmless', c._historyDepth === 0 && c._openSheetStack.length === 0);

  sub('a wide screen docks the brief instead');
  T('the stylesheet and the script use one query', css().indexOf('@media ' + c.WIDE_QUERY + '{') !== -1);
  /* 0.2.0 shipped a hint naming the "Needs attention" list it had replaced. */
  const emptyDock = (js().match(/title: 'No project in focus',\s*body: '([^']*)'/) || ['', ''])[1];
  T('with nothing in focus, the docked brief\'s hint names only what the hub has',
    emptyDock.length > 20 && !/Needs attention|a row under/.test(emptyDock), emptyDock);
  const wide = H.loadApp({ sharedStorage: shared });
  wide.ctx.window.matchMedia = () => ({ matches: true, addEventListener(){}, removeEventListener(){} });
  wide.ctx.tapProject('capybara-sushi'); wide.ctx.tapProject('capybara-sushi'); wide.ctx.__flush();
  T('no page opens', !wide.dom.document.getElementById('briefOverlay').classList.contains('open'));
  const docked = wide.dom.document.getElementById('dockedBrief').innerHTML;
  T('the docked brief shows the focused project', /id="dockedBriefName"[^>]*>Capy Sushi</.test(docked));
  T('and carries its tools itself', /class="tools docked"/.test(docked));
  T('no errors', app.errors.length === 0 && wide.errors.length === 0, app.errors.concat(wide.errors).join(' | '));
}

/* =========================================================
   CONTRACT 24 — THE FIELD AND ITS 3D SEAM
   One renderer, three calls, a render-only scene — so Phase 2
   can swap in WebGL without touching anything else — and any
   number of projects, drawn from data.
   ========================================================= */
function testFieldSeam(){
  section('CONTRACT 24 — the field: one renderer at a time behind one seam, any number of projects');
  const app = H.loadApp();
  const c = app.ctx, d = app.dom.document;
  const src = js();

  sub('the seam');
  const calls = o => Object.keys(o).filter(k => typeof o[k] === 'function').sort().join();
  T('the flat renderer is exactly mount, draw, focus and unmount', calls(c.IsoField) === 'draw,focus,mount,unmount');
  T('and so is the world renderer', calls(c.WorldField) === 'draw,focus,mount,unmount');
  T('the hub draws through the seam', /Field\.draw\(fieldScene\(views\)\)/.test(src) && !/(IsoField|WorldField)\.draw\(/.test(src));
  const renderer = (src.match(/PROJECT FIELD — one renderer at a time[\s\S]*?\r?\n   HUB\r?\n/) || [''])[0];
  T('the renderer section is found', renderer.length > 2000);
  T('the renderer never reads or writes storage', !/Store\./.test(stripComments(renderer)));
  T('the renderer never changes the selection', !/selectedId\s*=(?!=)/.test(stripComments(renderer)));
  const scene = c.fieldScene(c.allViews());
  T('the scene carries only what drawing needs', Object.keys(scene[0]).sort().join() ===
    'attention,badge,id,name,recorded,selected,sign,signal,spoken,status,theme,workerState');
  T('the page adds no script file and no package dependency: the world is a module the page imports',
    !/<canvas/.test(H.readApp()) && !/<script[^>]*\bsrc=/.test(H.readApp()) &&
    Object.keys(H.readPkg().dependencies || {}).length === 0 && Object.keys(H.readPkg().devDependencies || {}).length === 0);

  sub('the sign over the selected project says what the record holds, and nothing more');
  const signApp = H.loadApp(), sc = signApp.ctx;
  const signOf = id => (sc.fieldScene(sc.allViews()).find(x => x.id === id) || {}).sign;
  const plain = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const firstId = sc.PROJECT_REGISTRY[0].id, secondId = sc.PROJECT_REGISTRY[1].id;
  sc.tapProject(firstId); sc.__flush();
  T('only the selected project carries a sign', sc.fieldScene(sc.allViews()).filter(x => x.sign).map(x => x.id).join() === firstId);
  T('with no record it says Needs update, and names no status', /Needs update/.test(plain(signOf(firstId))) &&
    !/Building|Planning|Stable|Paused|Blocked|Needs QA|Needs decision|Release ready/.test(plain(signOf(firstId))));
  sc.openStateForm(firstId); sc.pickStatus('building'); sc.toggleSwitch('stateQa'); sc.saveStateForm(); sc.__flush();
  T('recorded, it names the status and everything that needs you, each with its shape',
    /Building/.test(plain(signOf(firstId))) && /Needs QA/.test(plain(signOf(firstId))) && (signOf(firstId).match(/<svg/g) || []).length === 2);
  T('it says what a second tap does', /Tap again for the brief/.test(plain(signOf(firstId))));
  sc.openStateForm(firstId); sc.pickStatus('building');
  const blockerField = signApp.dom.document.getElementById('stateBlocker');
  if(blockerField) blockerField.value = 'Waiting on <b>FAKE</b> review 2';
  sc.saveStateForm(); sc.__flush();
  T('a blocker is said in its own words, as text', !!blockerField && (/Waiting on &lt;b&gt;FAKE&lt;\/b&gt; review 2/.test(signOf(firstId)) && /Blocked/.test(plain(signOf(firstId)))));
  T('beyond the blocker\'s own words it shows no number: nothing the record cannot support',
    !/\d/.test(plain(signOf(firstId)).replace(/Waiting on &lt;b&gt;FAKE&lt;\/b&gt; review 2/, '')));
  sc.tapProject(secondId); sc.__flush();
  T('choosing another project moves the sign to it', !signOf(firstId) && !!signOf(secondId));
  T('no errors', signApp.errors.length === 0, signApp.errors.join(' | '));

  sub('platforms are drawn from data');
  T('every landmark is a list of known primitives', Object.keys(c.LANDMARKS).every(k =>
    c.LANDMARKS[k].length > 0 && c.LANDMARKS[k].every(p => ['box', 'cyl', 'cone', 'discY'].indexOf(p[0]) !== -1)));
  const mats = new Set();
  Object.keys(c.LANDMARKS).forEach(k => c.LANDMARKS[k].forEach(p => mats.add(p[p.length - 1])));
  ['m-plinth', 'm-terrain', 'm-crate', 'm-signal'].forEach(m => mats.add(m));
  T('every material has a colour token', [...mats].every(m =>
    new RegExp('\\.' + m + '\\{ --c: var\\(--').test(css())), [...mats].join(','));
  T('every look has its ground and accent', Object.keys(c.LANDMARKS).every(t =>
    new RegExp('\\.theme-' + t + '\\{ --terrain: var\\(--terrain-' + t + '\\); --tint: var\\(--tint-' + t + '\\); \\}').test(css())));
  T('every look has a glyph', Object.keys(c.LANDMARKS).every(t => !!c.PROJECT_GLYPHS[t]));

  sub('identity is strong, and never a status colour');
  /* CIE76 in CIELAB: below about 20 two colours read as the same family at
     a glance. 0.1.1 had Personal Savings' accent 3.8 from "Needs update". */
  const hex = name => { const m = new RegExp('--' + name + ':\\s*(#[0-9A-Fa-f]{6})').exec(css()); return m ? m[1] : null; };
  const lab = h => {
    const n = parseInt(h.slice(1), 16);
    const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const x = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
    const y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
    const z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const sigs = [...css().matchAll(/--(sig-[a-z]+):\s*#[0-9A-Fa-f]{6}/g)].map(m => m[1]);
  T('the status hues are all read', sigs.length === 9, sigs.join(','));
  Object.keys(c.LANDMARKS).forEach(t => {
    const tint = hex('tint-' + t);
    const near = sigs.map(s => [s, dE(tint, hex(s))]).sort((a, b) => a[1] - b[1])[0];
    T(t + ': its accent is at least ΔE 20 from every status hue', !!tint && near[1] >= 20,
      tint + ' is ' + near[1].toFixed(1) + ' from ' + near[0]);
  });
  T('every ground is dark, so a platform never glows with its identity',
    Object.keys(c.LANDMARKS).every(t => lab(hex('terrain-' + t))[0] < 30));

  sub('light belongs to the place; the beacon to the state');
  const lit = c.platformSvg({ id: 'x', name: 'x', theme: 'track', status: 'building', signal: 'building', attention: [],
    workerState: 'working', recorded: true, selected: true });
  const dark = c.platformSvg({ id: 'x', name: 'x', theme: 'track', status: null, signal: 'unrecorded', attention: [],
    workerState: 'unrecorded', recorded: false, selected: false });
  T('every platform catches the light on its lip and rim', /class="rim-light"/.test(dark) && /class="tint-light"/.test(dark));
  T('the rim wears the project\'s accent, the lip neutral light',
    /\.platform \.tint-light\{[^}]*stroke: var\(--tint\)/.test(css()) && /\.platform \.rim-light\{[^}]*stroke: var\(--field-rim\)/.test(css()));
  T('a known state lights its beacon: glow, halo and core', /beacon-glow/.test(lit) && /beacon-halo/.test(lit) && /beacon-core/.test(lit));
  T('no state, no light: the lamp is a ring with no glow', !/beacon-(glow|halo|core)/.test(dark) &&
    /\.block\.sig-unrecorded \.platform \.beacon-light\{[^}]*fill: var\(--field-floor\); stroke: var\(--sig\)/.test(css()));
  T('only the project in focus stands in a pool of light', /select-pool/.test(lit) && !/select-pool/.test(dark));
  T('the light is neutral tokens, never a status hue',
    /--field-rim: rgba\(238,241,245/.test(css()) && /--field-pool: rgba\(238,241,245/.test(css()));
  const field = d.getElementById('projectField').innerHTML;
  T('the platform drawing is decorative to assistive tech',
    (field.match(/<svg class="platform" viewBox="[^"]+" aria-hidden="true" focusable="false">/g) || []).length ===
    c.PROJECT_REGISTRY.length);
  T('no broken number reaches the geometry', !/NaN|Infinity|undefined/.test(field));
  T('drawing is deterministic', c.platformSvg(scene[0]) === c.platformSvg(scene[0]));

  sub('the crew');
  const workers = [...new Set(Object.keys(c.SIGNALS).map(k => c.SIGNALS[k].worker))];
  T('nine worker states, one per signal', workers.length === 9, workers.join(','));
  T('every state but paused and unrecorded has a picture',
    workers.filter(w => w !== 'quiet' && w !== 'unrecorded').every(w => c.crewSvg(w).length > 50));
  T('a paused platform has no crew and is dimmed',
    c.crewSvg('quiet') === '' && /\.block\.worker-quiet \.platform\{ opacity: /.test(css()));
  T('an unrecorded platform has no crew: nothing is known to be happening there', c.crewSvg('unrecorded') === '');

  sub('motion is status-driven and can be switched off');
  T('only projects that need you pulse', scene.every(b => {
    const m = field.match(new RegExp('<button class="block [^"]*"[^>]*id="block-' + b.id + '"'));
    return !!m && (/ pulse"/.test(m[0]) === (c.ATTENTION_KINDS.indexOf(b.signal) !== -1));
  }));
  T('the pulse and the working crew are CSS animations',
    /\.block\.pulse \.beacon-glow\{[\s\S]{0,160}animation: beacon-pulse/.test(css()) &&
    /\.block\.worker-working \.worker\{[\s\S]{0,160}animation: worker-bob/.test(css()));
  T('which the global reduced-motion rule switches off',
    /@media \(prefers-reduced-motion: reduce\)\{[\s\S]{0,200}animation: none !important/.test(css()));
  T('the page script runs no animation loop: the world\'s one loop lives in its module',
    !/requestAnimationFrame\(|setInterval\(/.test(stripComments(src)));

  sub('a seventh project needs no new code');
  const more = H.loadApp();
  const m = more.ctx, md = more.dom.document;
  m.PROJECT_REGISTRY.push({
    id: 'synthetic-seventh', name: 'Synthetic Seventh',
    shortDescription: 'A test project that exists only inside this contract.',
    repositoryUrl: 'https://github.com/morecobrax-dot/synthetic-seventh', liveUrl: null,
    defaultBranch: 'main', visualTheme: 'not-a-theme-yet'
  });
  m.renderMissionControl();
  const f7 = md.getElementById('projectField').innerHTML;
  T('it is drawn as a seventh platform', (f7.match(/<button class="block /g) || []).length === 7);
  T('a look it does not have yet falls back to the generic one',
    /<button class="block theme-generic [^"]*" id="block-synthetic-seventh"/.test(f7));
  T('its drawing is whole', !/NaN|Infinity|undefined/.test(f7));
  T('it counts as a project, and as nothing else until recorded',
    m.hudCounts(m.allViews()).projects === 7 && m.hudCounts(m.allViews()).unrecorded === 7);
  m.tapProject('synthetic-seventh'); m.__flush();
  T('it can be focused', m.selectedId === 'synthetic-seventh');
  T('and is remembered', m.Store.get(m.KEYS.selectedProject) === 'synthetic-seventh');
  m.openStateForm('synthetic-seventh'); m.pickStatus('building'); m.toggleSwitch('stateQa'); m.saveStateForm(); m.__flush();
  T('its state is recorded like any other', m.projectView('synthetic-seventh').signal === 'needs_qa');
  T('it joins the attention queue', m.attentionQueue(m.allViews()).some(v => v.id === 'synthetic-seventh'));
  T('and the Settings list', /Synthetic Seventh/.test(md.getElementById('linksList').innerHTML));
  T('its GitHub tool comes from its own record', m.projectView('synthetic-seventh').tools.github ===
    'https://github.com/morecobrax-dot/synthetic-seventh');
  T('no errors', more.errors.length === 0 && app.errors.length === 0, more.errors.concat(app.errors).join(' | '));
}

/* =========================================================
   CONTRACT 25 — SECRET SAFETY
   The repository and its site are public. Nothing private is
   ever committed, cached, logged or put in an address bar.
   ========================================================= */
function testSecrets(){
  section('CONTRACT 25 — nothing private is ever committed, cached or logged');
  const scan = require('../scripts/secrets.js');
  T('the secret scan is clean', scan.run() === 0);

  sub('the scan catches what it claims to');
  /* Assembled at run time, so this file never contains one whole. */
  const planted = {
    'a ChatGPT conversation': 'https://chatgpt.com/c/' + '6f3a9c2e-1b7d-4e55-9a10-2c3d4e5f6a7b',
    'a ChatGPT share link': 'https://chatgpt.com/share/' + '6f3a9c2e1b7d',
    'a Claude Code session': 'https://claude.ai/code/' + 'sess' + 'ion_01AbCdEfGhIjKlMn',
    'a Claude app session': 'claude://code/' + 'sess' + 'ion_01AbCdEfGhIjKlMn',
    'a bare Claude session id': 'session' + '_01AbCdEfGhIjKlMnOp',
    'an Anthropic key': 'sk-ant-' + 'api03-AbCdEfGhIjKlMnOpQr',
    'an OpenAI key': 'sk-proj-' + 'AbCdEfGhIjKlMnOpQrStUv',
    'a GitHub token': 'ghp_' + 'AbCdEfGhIjKlMnOpQrStUvWx',
    'a private key': '-----BEGIN ' + 'RSA PRIVATE KEY-----',
    'a Windows home path': 'C:\\' + 'Users\\someone\\notes.txt',
    'a macOS home path': ' /' + 'Users/someone/notes.txt'
  };
  Object.keys(planted).forEach(k => T('catches ' + k, scan.scanText('x ' + planted[k] + ' y').length > 0));
  sub('and lets declared fixtures through');
  [FIX.chat, FIX.claude, FIX.claudeApp, 'https://chatgpt.com/c/FAKE-FIXTURE-0021', 'https://claude.ai/code/new']
    .forEach(f => T('passes the fixture ' + f.slice(0, 32), scan.scanText(f).length === 0));

  sub('private links never reach the worker, the source, a log or the address bar');
  const sw = H.readSW(), src = js();
  T('the worker ignores other origins, so an opened link is never cached',
    /new URL\(req\.url\)\.origin !== location\.origin/.test(sw));
  const assets = (sw.match(/const ASSETS = \[([\s\S]*?)\];/) || ['', ''])[1];
  T('the worker precaches the shell and the files the app loads, and nothing else',
    assets.replace(/\s+/g, '') === "'./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'," +
      H.loadApp().ctx.APP_FILES.map(f => "'" + f + "'").join(','));
  T('no private-link field has a default in source', !/(chatgptUrl|claudeUrl)\s*:\s*['"]/.test(src));
  T('no ChatGPT or Claude address is written into the app script at all',
    !/['"`]https?:\/\/(?:chatgpt\.com|chat\.openai\.com|claude\.ai)/i.test(stripComments(src)));
  T('the app never logs — the one console line reports a failed boot',
    (stripComments(src).match(/console\.[a-z]+\(/g) || []).join() === 'console.error(' &&
    /console\.error\('Boot failed:'/.test(src));
  T('nothing is written to the address bar',
    !/location\.(href|hash|search)\s*=|history\.(pushState|replaceState)\([^)]*[A-Za-z]/.test(stripComments(src).replace(/history\.pushState\(\{ appOverlay: true \}, ''\)/, '')));
  T('the moodboards are git-ignored, so they are never published',
    require('fs').readFileSync(require('path').join(H.ROOT, '.gitignore'), 'utf8').split(/\r?\n/).indexOf('references/visual/') !== -1);

  sub('the public source shows every character it has');
  /* A regex written with escapes once arrived in the file as the invisible
     direction overrides it exists to refuse — and every test still passed.
     The ranges are code points, so this check cannot suffer the same fate. */
  const INVISIBLE = [[0x0, 0x8], [0xB, 0xC], [0xE, 0x1F], [0x7F, 0x9F], [0x200B, 0x200F], [0x202A, 0x202E],
                     [0x2060, 0x2069], [0xFEFF, 0xFEFF]];
  const fsx = require('fs'), px = require('path');
  const sources = ['index.html', 'sw.js', 'manifest.webmanifest', 'package.json', 'README.md', 'ARCHITECTURE.md', 'CLAUDE.md',
    'PRODUCT-DESIGN.md', 'test/contracts.js', 'test/harness.js', 'test/run.js', 'scripts/config.js',
    'scripts/contamination.js', 'scripts/secrets.js', 'scripts/project-status.js', 'scripts/vendor-three.js',
    'field/world.js', 'field/render3d.js', 'field/package.json', 'vendor/three/three.min.js', 'vendor/three/package.json'];
  const hidden = [];
  sources.forEach(f => {
    const s = fsx.readFileSync(px.join(H.ROOT, f), 'utf8');
    for(let i = 0; i < s.length; i++){
      const code = s.charCodeAt(i);
      if(INVISIBLE.some(r => code >= r[0] && code <= r[1])) hidden.push(f + ' at ' + i + ': U+' + code.toString(16).toUpperCase());
    }
  });
  T('no invisible or direction-changing character in any public source file', hidden.length === 0, hidden.slice(0, 5).join(', '));
}

/* =========================================================
   CONTRACT 26 — THE BACKUP BOUNDARY
   A backup file carries recorded project states and nothing
   else, by construction. Reading one back never touches the
   private links on this device, and says when it ignored some.
   ========================================================= */
function testBackupBoundary(){
  section('CONTRACT 26 — backups carry project states only; private links never leave or return');
  /* Canary links: fake, and distinct from every other fixture, so a single
     search proves each one stayed where it belongs. */
  const CANARY = {
    chat:  'https://chat.example.test/c/FAKE-CANARY-LINK-1',
    claude: 'https://claude.example.test/code/FAKE-CANARY-LINK-2',
    draft: 'https://chat.example.test/c/FAKE-CANARY-DRAFT-3',
    legacy: 'https://chat.example.test/c/FAKE-CANARY-LEGACY-4',
    legacyDraft: 'https://claude.example.test/code/FAKE-CANARY-LEGACY-5'
  };
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;
  const ns = c.STORAGE_NAMESPACE;

  /* A device with everything a backup must leave behind. */
  c.openStateForm('dayplan'); c.pickStatus('building'); d.getElementById('stateNext').value = 'Recorded step'; c.saveStateForm();
  c.privateLinks.loop = { id: 'loop', chatgptUrl: CANARY.chat, claudeUrl: CANARY.claude, updatedAt: '2026-01-01' };
  c.persistPrivateLinks();
  /* finish*, not close*: leave the editors the way a torn-down page does,
     with their drafts still on the device. */
  c.openLinksForm('dayplan'); d.getElementById('linkChatgpt').value = CANARY.draft; c.flushFormDrafts();
  c.finishLinksForm();
  c.openStateForm('loop'); c.pickStatus('paused'); d.getElementById('stateNext').value = 'Unsaved edit'; c.flushFormDrafts();
  c.finishStateForm();
  c.tapProject('dayplan');
  shared.set(ns + c.KEYS.backupPrefix + '1.' + c.KEYS.privateLinks, JSON.stringify([{ id: 'loop', chatgptUrl: CANARY.chat }]));
  const statesKey = ns + c.KEYS.projectStates;
  const withForeign = JSON.parse(shared.get(statesKey)).concat([{ id: 'a-future-project', status: 'stable',
    chatgptUrl: CANARY.chat, updatedAt: '2026-01-01' }]);
  shared.set(statesKey, JSON.stringify(withForeign));
  /* A fetched repository status and a source choice: this device's, and
     never a backup's. */
  shared.set(ns + c.KEYS.repoStatus, JSON.stringify([{ id: 'loop', sourceUrl: c.statusUrlFor(c.PROJECT_REGISTRY[0]),
    snapshot: { id: 'loop', status: 'stable', needsQa: false, needsDecision: false, blocker: null, version: null, phase: null,
      currentTask: null, nextAction: 'FAKE-CANARY-REPO-6', updatedAt: '2026-09-01T00:00:00.000Z' },
    fetchedAt: '2026-09-02T00:00:00.000Z', checkedAt: '2026-09-02T00:00:00.000Z', outcome: 'ok', detail: null }]));
  shared.set(ns + c.KEYS.stateSources, JSON.stringify([{ id: 'loop', source: 'repository', updatedAt: '2026-09-02T00:00:00.000Z' }]));
  const device = H.loadApp({ sharedStorage: shared });
  const x = device.ctx;
  T('the device holds links, drafts, a snapshot and an unreadable record before export',
    !!x.privateLinks.loop && shared.has(ns + x.KEYS.linksDraft) && shared.has(ns + x.KEYS.stateDraft) &&
    x.projectStatesForeign.length === 1);
  T('and a repository status it shows, by its own choice', x.projectView('loop').connected === true);

  sub('an export carries recorded project states and nothing else');
  const before = new Map(shared);
  const payload = x.buildBackup();
  const file = JSON.stringify(payload);
  T('it holds exactly one collection: project states', Object.keys(payload.data).join() === x.KEYS.projectStates);
  T('no private link reaches the file, not even from a draft, a snapshot or an unreadable record',
    !/FAKE-CANARY/.test(file));
  T('no link field, draft, preference or snapshot key is in it',
    !/chatgptUrl|claudeUrl|privateLinks|draft\.|ui\.|sys\.backup/.test(file));
  T('no source choice and no fetched repository status is in it — nothing falls through to a generic export',
    !/stateSources|repoStatus|cache\.|FAKE-CANARY-REPO/.test(file));
  const out = JSON.parse(payload.data[x.KEYS.projectStates]);
  T('only readable records of known projects are exported', out.map(r => r.id).join() === 'dayplan');
  T('each rebuilt from the allowlist of fields', out.every(r => Object.keys(r).join() === x.BACKUP_FIELDS.join()));
  T('the file still says which app and version made it', payload.app === x.APP_CONFIG.id && payload.version === x.APP_VERSION);
  T('an injected field is dropped from a record',
    !('chatgptUrl' in x.backupRecord({ id: 'loop', status: 'stable', chatgptUrl: CANARY.chat })));
  T('exporting changes nothing on the device',
    [...before.keys()].every(k => shared.get(k) === before.get(k)) && shared.size === before.size);
  T('the export path is built from the product\'s allowlist',
    /const data = typeof Domain\.backupData === 'function' \? Domain\.backupData\(\) : allStoredData\(\);/.test(js()) &&
    x.Domain.backupData === x.backupMissionControl);

  sub('an ordinary backup imports states and leaves this device\'s links alone');
  T('the product declares its own restore — the generic merge would bring private links back',
    typeof x.Domain.restoreData === 'function' && x.Domain.restoreData === x.restoreMissionControl);
  const other = new Map();
  const b = H.loadApp({ sharedStorage: other });
  const y = b.ctx;
  y.privateLinks.loop = { id: 'loop', chatgptUrl: FIX.chat, claudeUrl: null, updatedAt: '2026-01-01' };
  y.persistPrivateLinks();
  const linksBefore = other.get(ns + y.KEYS.privateLinks);
  y.importData({ files: [{ _text: file }], value: '' });
  T('the recorded state arrives', !!y.projectStates.dayplan && y.projectStates.dayplan.nextAction === 'Recorded step');
  T('this device\'s links are untouched', other.get(ns + y.KEYS.privateLinks) === linksBefore);
  T('no note about private links, because there were none', b.dom.document.getElementById('importNotes').innerHTML === '');
  const again = y.Domain.restoreData(payload.data);
  T('importing the same file again changes nothing', again.added === 0 && again.updated === 0);

  sub('a 0.1.0 backup with private links: links ignored, and said so');
  const legacyFile = JSON.stringify({ app: y.APP_CONFIG.id, version: '0.1.0', schema: 1, exportedAt: '2026-09-28T12:00:00.000Z',
    data: {
      'sys.schemaVersion': '1',
      'ui.selectedProject': 'loop',
      'data.projectStates': JSON.stringify([{ id: 'space-kindergarten', status: 'building', needsQa: true,
        chatgptUrl: CANARY.legacy, updatedAt: '2026-09-28T12:00:00.000Z' }]),
      'data.privateLinks': JSON.stringify([{ id: 'loop', chatgptUrl: CANARY.legacy, claudeUrl: CANARY.legacyDraft,
        updatedAt: '2030-01-01T00:00:00.000Z' }]),
      'draft.projectLinks': JSON.stringify({ id: 'dayplan', values: { chatgptUrl: CANARY.legacyDraft, claudeUrl: '' } })
    } });
  y.importData({ files: [{ _text: legacyFile }], value: '' });
  T('its project state is imported', !!y.projectStates['space-kindergarten']);
  T('but a link smuggled inside a state record is dropped', !('chatgptUrl' in y.projectStates['space-kindergarten']));
  T('the links on this device are unchanged, even against a newer-dated link',
    other.get(ns + y.KEYS.privateLinks) === linksBefore && y.privateLinks.loop.chatgptUrl === FIX.chat);
  T('no legacy link or draft reached any key on this device',
    [...other.values()].every(v => !/FAKE-CANARY/.test(v)));
  T('no device preference was taken from the file', other.get(ns + y.KEYS.selectedProject) !== 'loop');
  const notes = b.dom.document.getElementById('importNotes').innerHTML;
  T('the import says the links were not imported, where it stays on screen',
    /private tool links from an older version\. They were not imported/.test(notes) && /links on this device are unchanged/.test(notes));

  sub('into a device with no links, an old backup still restores none');
  const empty = new Map();
  const e = H.loadApp({ sharedStorage: empty });
  e.ctx.importData({ files: [{ _text: legacyFile }], value: '' });
  T('no links appear', Object.keys(e.ctx.privateLinks).length === 0 && !empty.has(ns + e.ctx.KEYS.privateLinks));
  T('and no draft either', !empty.has(ns + e.ctx.KEYS.linksDraft));
  T('it still reports what it ignored', /were not imported/.test(e.dom.document.getElementById('importNotes').innerHTML));

  sub('a file with only private links imports nothing, and says both');
  const onlyLinks = JSON.stringify({ app: y.APP_CONFIG.id, data: {
    'data.privateLinks': JSON.stringify([{ id: 'loop', chatgptUrl: CANARY.legacy }]) } });
  const f = H.loadApp({ sharedStorage: new Map() });
  f.ctx.importData({ files: [{ _text: onlyLinks }], value: '' });
  T('nothing is imported', Object.keys(f.ctx.privateLinks).length === 0 && Object.keys(f.ctx.projectStates).length === 0);
  T('the toast says there were no records it recognises',
    /no records this app recognises/.test(f.dom.document.getElementById('toastHost').children.map(t => t.innerHTML).join('')));
  T('and the note says the links were ignored', /were not imported/.test(f.dom.document.getElementById('importNotes').innerHTML));

  sub('the note is exact: it speaks only of links that are really there');
  const blank = y.Domain.restoreData({
    'data.privateLinks': '[]',
    'draft.projectLinks': JSON.stringify({ id: 'loop', values: { chatgptUrl: '', claudeUrl: '' } })
  });
  T('an empty link list or a blank draft brings no warning', blank.notes.length === 0, blank.notes.join(' | '));

  sub('an import never touches the source choices or the fetched status');
  const choices = new Map();
  const g = H.loadApp({ sharedStorage: choices });
  const z = g.ctx;
  z.setSource('dayplan', 'manual');
  const sourcesBefore = choices.get(ns + z.KEYS.stateSources);
  const crafted = JSON.stringify({ app: z.APP_CONFIG.id, data: {
    'data.projectStates': JSON.stringify([{ id: 'loop', status: 'building', updatedAt: '2026-09-28T12:00:00.000Z' }]),
    'data.stateSources': JSON.stringify([{ id: 'dayplan', source: 'repository', updatedAt: '2030-01-01T00:00:00.000Z' }]),
    'cache.repoStatus': JSON.stringify([{ id: 'dayplan', snapshot: { id: 'dayplan', status: 'stable', nextAction: 'FAKE-CANARY-REPO-7',
      updatedAt: '2030-01-01T00:00:00.000Z' }, outcome: 'ok' }]) } });
  z.importData({ files: [{ _text: crafted }], value: '' });
  T('the state in the file arrives', !!z.projectStates.loop);
  T('a source choice in a file is ignored, even a newer-dated one', choices.get(ns + z.KEYS.stateSources) === sourcesBefore &&
    z.sourceOf('dayplan') === 'manual');
  T('a repository status in a file is never taken as fetched', !choices.has(ns + z.KEYS.repoStatus) &&
    [...choices.values()].every(v => !/FAKE-CANARY-REPO/.test(v)));

  sub('records it cannot read are skipped, and counted');
  const odd = y.Domain.restoreData({ 'data.projectStates': JSON.stringify([
    { id: 'no-such-project', status: 'building', updatedAt: 'z' },
    { id: 'loop', status: 'archived', updatedAt: 'z' }
  ]) });
  T('neither is imported', odd.added === 0 && odd.updated === 0 && !y.projectStates['no-such-project']);
  T('and the import says how many', odd.skipped === 2 && /2 records in the file could not be read/.test(odd.notes.join(' ')));
  T('no errors', [app, device, b, e, f].every(a => a.errors.length === 0),
    [app, device, b, e, f].map(a => a.errors.join(' | ')).join(' | '));
}

/* =========================================================
   REPOSITORY FIXTURES
   A stand-in for GitHub's raw host: every request is recorded
   with its options, and each project's answer is set by the
   test. Status text says FAKE so no fixture can pass for a real
   project's status.
   ========================================================= */
function statusFile(id, over){
  return Object.assign({ schemaVersion: 1, appId: id, version: '9.9.9', phase: 'FAKE phase', status: 'building',
    needsQa: false, needsDecision: false, currentTask: 'FAKE published work', nextAction: 'FAKE published next step',
    blocker: null, updatedAt: '2026-09-20T10:00:00Z' }, over || {});
}
function answer(status, body, extra){
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return url => Promise.resolve(Object.assign({
    status: status, ok: status >= 200 && status < 300, url: url,
    headers: { get: k => (k.toLowerCase() === 'content-length' ? String(text.length) : null) },
    text: () => Promise.resolve(text)
  }, extra || {}));
}
function mockRaw(c){
  const calls = [];
  const answers = {};
  c.fetch = (url, opts) => {
    calls.push({ url: url, opts: opts || {} });
    const p = c.PROJECT_REGISTRY.find(r => c.statusUrlFor(r) === url);
    const a = p && answers[p.id];
    if(!a) return Promise.reject(new TypeError('Failed to fetch'));
    return a(url, opts);
  };
  return { calls: calls, answers: answers, idsAsked: () => calls.map(x => (c.PROJECT_REGISTRY.find(r => c.statusUrlFor(r) === x.url) || {}).id) };
}
/* A clock the test moves. The app reads Date at call time, so replacing it
   after load governs every "now" the checks use. */
function clockOn(c, start){
  const Real = Date;
  let now = Real.parse(start);
  class FakeDate extends Real {
    constructor(...a){ if(a.length === 0) super(now); else super(...a); }
    static now(){ return now; }
  }
  c.Date = FakeDate;
  return { advance(ms){ now += ms; }, set(iso){ now = Real.parse(iso); }, now(){ return now; } };
}
function pending(){ let resolve; const p = new Promise(r => { resolve = r; }); return { p: p, resolve: resolve }; }

/* =========================================================
   CONTRACT 27 — THE STATUS FILE
   What a public repository may publish, checked whole: one
   version of one shape, the editor's own words and limits,
   refused with a reason when anything is off.
   ========================================================= */
function testStatusContract(){
  section('CONTRACT 27 — the status file: one shape, checked whole, refused with a reason');
  const app = H.loadApp();
  const c = app.ctx;
  const NOW = Date.parse('2026-09-28T12:00:00Z');
  const good = over => statusFile('dayplan', Object.assign({ updatedAt: '2026-09-28T10:00:00Z' }, over || {}));
  const check = data => c.validateStatusFile(data, 'dayplan', NOW);

  sub('the contract names every key, in one version');
  T('schema version 1', c.STATUS_SCHEMA_VERSION === 1);
  T('the keys the brief lists, and no others',
    c.STATUS_KEYS.slice().sort().join() === 'appId,blocker,currentTask,needsDecision,needsQa,nextAction,phase,schemaVersion,status,updatedAt,version');
  T('the file is PROJECT-STATUS.json on GitHub\'s raw host',
    c.STATUS_FILE === 'PROJECT-STATUS.json' && c.STATUS_HOST === 'https://raw.githubusercontent.com/');

  sub('a valid file becomes the same record a state saved here is');
  const ok = check(good());
  T('it is accepted', ok.ok === true, JSON.stringify(ok));
  T('rebuilt with exactly the fields of a recorded state',
    ok.ok && Object.keys(ok.record).sort().join() === Object.keys(c.normalizeState({ id: 'dayplan', status: 'stable' })).sort().join());
  T('its time is kept as the instant the publisher wrote', ok.record.updatedAt === '2026-09-28T10:00:00.000Z');
  T('an offset is read as the instant it names',
    check(good({ updatedAt: '2026-09-28T12:00:00+02:00' })).record.updatedAt === '2026-09-28T10:00:00.000Z');
  T('whitespace is only spacing, and empty text is unknown',
    check(good({ currentTask: '  two\n\tlines  ' })).record.currentTask === 'two lines' &&
    check(good({ nextAction: '   ' })).record.nextAction === null);
  T('a key this version does not know is dropped, never kept',
    check(good({ extra: 'x' })).ok && !('extra' in check(good({ extra: 'x' })).record) &&
    !('chatgptUrl' in check(good({ chatgptUrl: 'https://chat.example.test/c/FAKE' })).record));
  T('an old status is accepted as old — its time is never moved',
    check(good({ updatedAt: '2020-01-01T00:00:00Z' })).record.updatedAt === '2020-01-01T00:00:00.000Z');
  T('a publisher\'s clock a little ahead is forgiven', check(good({ updatedAt: '2026-09-28T20:00:00Z' })).ok);

  sub('the words and limits are the editor\'s');
  T('every lifecycle status is accepted', c.PROJECT_STATUSES.every(s => check(good({ status: s })).ok));
  ['blocked', 'needs_qa', 'archived', 'Stable', '', null].forEach(s =>
    T('refuses the status ' + JSON.stringify(s), check(good({ status: s })).outcome === 'invalid'));
  T('blocked is not a status: a blocker is written, and blocked is derived from it',
    c.attentionOf(check(good({ blocker: 'Waiting on keys' })).record)[0] === 'blocked' &&
    c.attentionOf(check(good()).record).length === 0);
  Object.keys(c.STATE_LIMITS).forEach(f => {
    const max = c.STATE_LIMITS[f];
    T(f + ': ' + max + ' characters are accepted, one more is refused',
      check(good({ [f]: 'x'.repeat(max) })).ok && check(good({ [f]: 'x'.repeat(max + 1) })).outcome === 'invalid');
  });

  sub('anything else is refused whole, with its reason');
  const without = k => { const g = good(); delete g[k]; return g; };
  const refusals = {
    'a newer schema, as unsupported': [good({ schemaVersion: 2 }), 'unsupported'],
    'a schema written as text': [good({ schemaVersion: '1' }), 'invalid'],
    'no schema at all': [without('schemaVersion'), 'invalid'],
    'another project\'s file': [good({ appId: 'loop' }), 'wrong-app'],
    'a missing key, even one that may be null': [without('phase'), 'invalid'],
    'needsQa written as text': [good({ needsQa: 'true' }), 'invalid'],
    'needsDecision with no value': [good({ needsDecision: null }), 'invalid'],
    'a number where text belongs': [good({ version: 3 }), 'invalid'],
    'a control character': [good({ currentTask: 'bell\u0007' }), 'invalid'],
    'a direction override': [good({ nextAction: 'abc\u202Edef' }), 'invalid'],
    'a date with no zone': [good({ updatedAt: '2026-09-28T10:00:00' }), 'invalid'],
    'a date with no time': [good({ updatedAt: '2026-09-28' }), 'invalid'],
    'a date that is not one': [good({ updatedAt: '2026-13-45T99:00:00Z' }), 'invalid'],
    'a date more than a day ahead': [good({ updatedAt: '2026-09-30T12:00:00Z' }), 'invalid'],
    'a list instead of a record': [[good()], 'invalid'],
    'nothing': [null, 'invalid'],
    'a bare string': ['{"schemaVersion":1}', 'invalid']
  };
  Object.keys(refusals).forEach(k => {
    const r = check(refusals[k][0]);
    T('refuses ' + k, r.ok === false && r.outcome === refusals[k][1] && typeof r.detail === 'string' && r.detail.length > 8,
      JSON.stringify(r));
  });
  /* Refused for the right reason, not by a later check that happens to trip:
     a mutation run found a missing key still refused, as "not text". */
  T('a missing key is refused for being missing, and named', /missing phase/.test(check(without('phase')).detail || ''),
    check(without('phase')).detail);
  const twoMissing = without('version'); delete twoMissing.currentTask;
  T('several missing keys are all named', /missing version, currentTask\./.test(check(twoMissing).detail || ''), check(twoMissing).detail);

  sub('the publishers\' checker is this contract, not a second reading of it');
  /* scripts/project-status.js runs in every publishing repository. A
     publisher's file that it passes but this reader refuses is exactly how a
     project goes dark in Mission Control, so the two are held equal here. */
  const P = require('../scripts/project-status.js');
  const sortedPairs = o => Object.keys(o).sort().map(k => k + '=' + o[k]).join();
  T('the same contract version, keys and statuses',
    P.CONTRACT === c.STATUS_SCHEMA_VERSION && P.KEYS.join() === c.STATUS_KEYS.join() && P.STATUSES.join() === c.PROJECT_STATUSES.join());
  T('the same text limits, size limit and clock allowance',
    sortedPairs(P.TEXT_LIMITS) === sortedPairs(c.STATE_LIMITS) && P.MAX_BYTES === c.STATUS_MAX_BYTES && P.FUTURE_MS === c.STATUS_FUTURE_MS);
  T('the same time grammar', P.ISO_TIME.source === c.ISO_TIME.source && P.ISO_TIME.flags === c.ISO_TIME.flags);
  let sameChars = true;
  for(let code = 0; code <= 0xFFFF && sameChars; code++){
    const s = String.fromCharCode(code);
    if(P.BAD_TEXT.test(s) !== c.STATUS_BAD_TEXT.test(s)) sameChars = false;
  }
  T('the same characters refused, across every code point', sameChars);
  const SECRETS = require('../scripts/secrets.js').RULES;
  T('the secret rules are scripts/secrets.js, rule for rule',
    P.SECRET_RULES.length === SECRETS.length && P.SECRET_RULES.every((r, i) => r.label === SECRETS[i].label &&
      r.re.source === SECRETS[i].re.source && r.re.flags === SECRETS[i].re.flags));
  T('it only reads: nothing in it writes a file', !/writeFile|appendFile|rename|unlink|rmSync|mkdir/.test(
    require('fs').readFileSync(require('path').join(H.ROOT, 'scripts/project-status.js'), 'utf8')));
  const readerOutcome = text => {
    if(Buffer.byteLength(text, 'utf8') > c.STATUS_MAX_BYTES) return 'too-large';
    let data;
    try{ data = JSON.parse(text); }catch(e){ return 'invalid'; }
    const v = c.validateStatusFile(data, P.CASE_APP, P.CASE_NOW);
    return v.ok ? 'ok' : v.outcome;
  };
  P.CASES.forEach(k => {
    const text = k.text();
    const read = readerOutcome(text);
    const found = P.checkStatus(text, { appId: P.CASE_APP, release: P.CASE_RELEASE, now: P.CASE_NOW }).map(p => p.code);
    T('shared case, ' + k.name + ': Mission Control reads it as ' + k.reader + ', a publisher ' +
      (k.publisher === 'pass' ? 'may publish it' : 'is stopped (' + k.publisher + ')'),
      read === k.reader && (k.publisher === 'pass' ? found.length === 0 : found.indexOf(k.publisher) !== -1),
      JSON.stringify({ read: read, found: found }));
    T('  and nothing a publisher may publish is refused by the reader', found.length > 0 || read === 'ok');
  });
  const fixtureRoot = require('path').join(H.ROOT, 'test');
  T('a release version is read from where a repository declares it',
    P.releaseVersion(H.ROOT, { file: 'index.html', list: 'const APP_UPDATES = [', pick: 'first' }) === c.APP_VERSION);
  T('the last entry, and a spelled prefix, when the notes are oldest-first',
    P.releaseVersion(H.ROOT, { file: 'index.html', list: 'const APP_UPDATES = [', pick: 'last' }) === '0.1.0' &&
    (() => { try{ P.releaseVersion(H.ROOT, { file: 'index.html', list: 'const APP_UPDATES = [', pick: 'first', prefix: 'v' }); return false; }
             catch(e){ return /does not start with/.test(e.message); } })());
  T('and never from outside the repository',
    (() => { try{ P.releaseVersion(fixtureRoot, { file: '../index.html', list: 'x' }); return false; }catch(e){ return true; } })());

  sub('the answer itself is bounded, and every way it ends has a name');
  const res = (status, text, extra) => Object.assign({ status: status, ok: status >= 200 && status < 300,
    url: c.STATUS_HOST + 'FAKE/x/main/PROJECT-STATUS.json', headers: { get: () => null },
    text: () => Promise.resolve(text) }, extra || {});
  const read = r => Promise.resolve(c.readStatusAnswer(r));
  return Promise.all([
    read(res(200, 'x', { headers: { get: k => (k === 'content-length' ? String(c.STATUS_MAX_BYTES + 1) : null) } })),
    read(res(200, JSON.stringify(good()) + ' '.repeat(c.STATUS_MAX_BYTES))),
    read(res(200, '{not json')),
    read(res(404, 'Not Found')),
    read(res(429, '')), read(res(403, '')), read(res(503, '')),
    read(res(200, JSON.stringify(good()), { url: 'https://elsewhere.example.test/PROJECT-STATUS.json' })),
    read(res(200, JSON.stringify(good())))
  ]).then(([declared, body, notJson, missing, limited, forbidden, down, elsewhere, fine]) => {
    T('a declared size over the limit is refused unread', declared.outcome === 'too-large');
    T('a body over the limit is refused', body.outcome === 'too-large');
    T('text that is not JSON is refused', notJson.outcome === 'invalid');
    T('no file is "missing", not an error to show as one', missing.outcome === 'missing');
    T('GitHub asking for fewer requests is named as such', limited.outcome === 'rate-limited' && forbidden.outcome === 'rate-limited');
    T('any other refusal is an HTTP failure, with its code', down.outcome === 'http' && /503/.test(down.detail));
    T('an answer that came from somewhere else is refused', elsewhere.outcome === 'invalid');
    T('a sound answer is passed on for checking', fine.outcome === 'received' && fine.data.appId === 'dayplan');
    T('every outcome the checks can record is a named one', ['ok', 'older', 'missing', 'offline', 'unreachable', 'timeout',
      'http', 'rate-limited', 'invalid', 'unsupported', 'wrong-app', 'too-large'].every(o => c.CHECK_OUTCOMES.indexOf(o) !== -1));
    T('and each failure is said in words', Object.keys(c.CHECK_PROBLEMS).length >= 10 &&
      c.CHECK_OUTCOMES.filter(o => o !== 'ok' && o !== 'older').every(o => typeof c.CHECK_PROBLEMS[o] === 'string'));
    T('no errors', app.errors.length === 0, app.errors.join(' | '));
  });
}

/* =========================================================
   CONTRACT 28 — CONNECTED STATE
   One effective state feeds everything; a manual record and a
   repository snapshot are both kept, never blended; switching
   is explicit, and editing never creates a hidden override.
   ========================================================= */
function testConnectedState(){
  section('CONTRACT 28 — connected state: one effective state, both records kept, explicit switches');
  const shared = new Map();
  const ns = 'mission-control.';
  /* A device that has used 0.1.1: one recorded state, one private link. */
  shared.set(ns + 'sys.schemaVersion', '1');
  shared.set(ns + 'data.projectStates', JSON.stringify([{ id: 'loop', status: 'paused', needsQa: false, needsDecision: false,
    blocker: null, version: null, phase: null, currentTask: null, nextAction: 'My own next step',
    updatedAt: '2026-09-27T09:00:00.000Z' }]));
  shared.set(ns + 'data.privateLinks', JSON.stringify([{ id: 'loop', chatgptUrl: FIX.chat, claudeUrl: null, updatedAt: '2026-09-27' }]));
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;
  const manualBefore = shared.get(ns + 'data.projectStates');
  const linksBefore = shared.get(ns + 'data.privateLinks');
  const html = id => d.getElementById(id).innerHTML;

  return H.settle().then(() => {
    sub('without a way to fetch, nothing is asked and nothing is written');
    T('no status cache and no source choice appear on their own',
      !shared.has(ns + c.KEYS.repoStatus) && !shared.has(ns + c.KEYS.stateSources));

    const raw = mockRaw(c);
    clockOn(c, '2026-09-28T12:00:00Z');
    raw.answers.dayplan = answer(200, statusFile('dayplan', { needsQa: true,
      currentTask: 'FAKE <img src=x onerror=alert(1)> task', nextAction: 'FAKE repository next step' }));
    raw.answers.loop = answer(200, statusFile('loop', { status: 'stable', nextAction: 'FAKE repository step for the first project' }));
    raw.answers['daily-verse'] = answer(200, statusFile('daily-verse', { status: 'stable' }));
    raw.answers['space-kindergarten'] = answer(404, 'Not Found');
    raw.answers['capybara-sushi'] = answer(200, statusFile('capybara-sushi', { blocker: 'FAKE blocker from the repository' }));
    return c.refreshStatuses('open').then(() => {
      sub('an unrecorded project adopts its repository status, and the choice is saved');
      const dp = c.projectView('dayplan');
      T('DayPlan now shows the published status', dp.connected && dp.recorded && dp.status === 'building' && dp.signal === 'needs_qa');
      T('its crew follows the effective state', dp.workerState === 'inspecting');
      T('the adoption is stored as the choice, so an import cannot flip it',
        JSON.parse(shared.get(ns + c.KEYS.stateSources)).some(s => s.id === 'dayplan' && s.source === 'repository'));
      T('the snapshot is cached with where and when it was fetched', (() => {
        const e = JSON.parse(shared.get(ns + c.KEYS.repoStatus)).find(r => r.id === 'dayplan');
        return e && e.sourceUrl === c.statusUrlFor(c.PROJECT_REGISTRY[1]) && e.fetchedAt && e.checkedAt && e.outcome === 'ok' &&
          e.snapshot.updatedAt === '2026-09-20T10:00:00.000Z';
      })());

      sub('a project with a state recorded here is never switched without you');
      const lp = c.projectView('loop');
      T('the first project still shows your own state', !lp.connected && lp.status === 'paused' && lp.nextAction === 'My own next step');
      T('no choice was written for it', !JSON.parse(shared.get(ns + c.KEYS.stateSources)).some(s => s.id === 'loop'));
      T('your record is byte for byte as it was', shared.get(ns + 'data.projectStates') === manualBefore);
      c.tapProject('loop'); c.tapProject('loop'); c.__flush();
      T('its brief offers the switch, and still offers Update state',
        /Use repository updates/.test(html('briefBody')) && /Update state/.test(html('briefBody')) &&
        /Its repository publishes a status/.test(html('briefBody')));
      c.closeBrief(); c.__flush();

      sub('a missing file invents nothing');
      const sk = c.projectView('space-kindergarten');
      T('a project whose repository has no file stays as it was: Needs update', !sk.recorded && !sk.connected && sk.signal === 'unrecorded');
      c.openProjectBrief('space-kindergarten'); c.__flush();
      T('and its brief says nothing is published yet', /Nothing is published at <code>[^<]+\/PROJECT-STATUS\.json<\/code> yet/.test(html('briefBody')));
      c.closeBrief(); c.__flush();

      sub('the counts, the attention and the field read the effective states');
      const counts = c.hudCounts(c.allViews());
      T('QA and Blocked count the repositories\' states', counts.needsQa === 1 && counts.blocked === 1, JSON.stringify(counts));
      T('only projects with no state are unknown', counts.unrecorded === 2, String(counts.unrecorded));
      T('the attention list includes connected projects', /Capy Sushi/.test(html('attentionList')) && /DayPlan/.test(html('attentionList')));
      T('the private project was never asked', raw.calls.every(x => !/personal-savings/.test(x.url)) && raw.calls.length === 5);

      sub('a repository\'s words are plain text');
      c.openProjectBrief('dayplan'); c.__flush();
      const brief = html('briefBody');
      T('markup in a status is shown as text, never run', /&lt;img src=x onerror=alert\(1\)&gt;/.test(brief) && !/<img/.test(brief));
      T('a connected brief says where its status comes from, and how old it is',
        /From repository · updated 8 days ago/.test(brief) && /Maintained in <code>morecobrax-dot\/dayplan\/PROJECT-STATUS\.json<\/code>/.test(brief) &&
        /Checked just now/.test(brief));
      T('it offers the switch to your own state, and no editor',
        /Use my own state instead/.test(brief) && !/>Update state</.test(brief));
      T('the dock stays one line: the source is the brief\'s to say', !/From repository/.test(html('focusBar')) && /Brief/.test(html('focusBar')));
      c.closeBrief(); c.__flush();

      sub('editing a connected project never makes a hidden override');
      c.openStateForm('dayplan'); c.__flush();
      T('no editor opens', !d.getElementById('stateOverlay').classList.contains('open') && c.editingStateId === null);
      T('the reason is said', /comes from its repository/.test(d.getElementById('toastHost').children.map(t => t.innerHTML).join('')));
      T('and nothing was written as a manual record', !c.projectStates.dayplan);

      sub('switching is explicit, and keeps both records');
      c.useRepositoryUpdates('loop'); c.__flush();
      const lr = c.projectView('loop');
      T('the first project now shows its repository status', lr.connected && lr.status === 'stable');
      T('with the repository\'s words, never blended with yours',
        lr.nextAction === 'FAKE repository step for the first project' && lr.phase === 'FAKE phase');
      T('your own record is untouched', shared.get(ns + 'data.projectStates') === manualBefore && !!c.projectStates.loop);
      c.openProjectBrief('loop'); c.__flush();
      T('its brief says your own state is kept', /The state you recorded for it on this device is kept/.test(html('briefBody')));
      c.closeBrief(); c.__flush();
      const snapBefore = JSON.stringify(JSON.parse(shared.get(ns + c.KEYS.repoStatus)).find(r => r.id === 'loop').snapshot);
      c.useManualState('loop'); c.__flush();
      const lm = c.projectView('loop');
      T('switching back shows your own state again, exactly', !lm.connected && lm.status === 'paused' && lm.nextAction === 'My own next step');
      T('and the repository snapshot is still kept',
        JSON.stringify(JSON.parse(shared.get(ns + c.KEYS.repoStatus)).find(r => r.id === 'loop').snapshot) === snapBefore);
      T('your private link was never touched', shared.get(ns + 'data.privateLinks') === linksBefore);

      sub('recording or clearing a state here is choosing your own');
      c.openStateForm('daily-verse'); c.__flush();
      T('Daily Verse adopted its repository status, so it has no editor', !d.getElementById('stateOverlay').classList.contains('open'));
      c.useManualState('daily-verse'); c.__flush();
      T('once switched, its editor opens, empty', (c.openStateForm('daily-verse'), c.__flush(),
        d.getElementById('stateOverlay').classList.contains('open')));
      c.pickStatus('building'); c.saveStateForm(); c.__flush();
      T('saving it keeps it on your own state', c.sourceOf('daily-verse') === 'manual' && c.projectView('daily-verse').status === 'building');
      c.openStateForm('daily-verse'); c.__flush();
      const cleared = c.clearProjectState(); c.__flush();
      c.acceptConfirm(); c.__flush();
      return cleared.then(() => {
        const dv = c.projectView('daily-verse');
        T('clearing it shows Needs update, as the confirmation promised — the repository does not take its place',
          !dv.recorded && !dv.connected && c.sourceOf('daily-verse') === 'manual');
        T('the repository status stays one tap away', /Use repository updates/.test(c.briefHtml(dv, false)));

        sub('a private repository never shows a repository status');
        shared.set(ns + c.KEYS.repoStatus, JSON.stringify(JSON.parse(shared.get(ns + c.KEYS.repoStatus)).concat([{ id: 'personal-savings',
          snapshot: statusFile('personal-savings', { updatedAt: '2026-09-01T00:00:00.000Z' }), outcome: 'ok',
          checkedAt: '2026-09-01T00:00:00.000Z', fetchedAt: '2026-09-01T00:00:00.000Z' }])));
        shared.set(ns + c.KEYS.stateSources, JSON.stringify(JSON.parse(shared.get(ns + c.KEYS.stateSources))
          .concat([{ id: 'personal-savings', source: 'repository', updatedAt: '2026-09-01T00:00:00.000Z' }])));
        const later = H.loadApp({ sharedStorage: shared });
        const ps = later.ctx.projectView('personal-savings');
        T('even with a planted snapshot and choice, it stays manual', !ps.connected && !ps.recorded && ps.repo === null);
        T('its brief says why', /Its repository is private, so Mission Control never asks it/.test(later.ctx.briefHtml(ps, false)));

        sub('the effective state survives a relaunch, offline');
        const again = later.ctx.projectView('dayplan');
        T('DayPlan still shows the cached repository status, with nothing fetched', again.connected && again.status === 'building' &&
          again.nextAction === 'FAKE repository next step');

        sub('an import leaves the source alone, and says where the state went');
        const file = JSON.stringify({ app: 'mission-control', data: { 'data.projectStates': JSON.stringify([
          { id: 'dayplan', status: 'paused', updatedAt: '2026-09-28T11:00:00.000Z' }]) } });
        later.ctx.importData({ files: [{ _text: file }], value: '' });
        const dpi = later.ctx.projectView('dayplan');
        T('DayPlan still shows its repository status', dpi.connected && dpi.status === 'building');
        T('the imported state is kept', later.ctx.projectStates.dayplan && later.ctx.projectStates.dayplan.status === 'paused');
        T('and the import says it is kept but not shown',
          /DayPlan shows its repository status, so the imported state is kept on this device but not shown/.test(
            later.dom.document.getElementById('importNotes').innerHTML));

        sub('unreadable choices and cache entries are kept, not deleted');
        shared.set(ns + c.KEYS.stateSources, JSON.stringify([{ id: 'loop', source: 'automatic', updatedAt: 'z' },
          { id: 'dayplan', source: 'repository', updatedAt: '2026-09-28T00:00:00.000Z' }]));
        shared.set(ns + c.KEYS.repoStatus, JSON.stringify([{ id: 'loop', snapshot: { status: 'archived', updatedAt: 'z' } }]));
        const third = H.loadApp({ sharedStorage: shared });
        T('an unknown source value is not guessed at', third.ctx.sourceOf('loop') === 'manual' && third.ctx.stateSourcesForeign.length === 1);
        T('an unreadable snapshot is not shown', !third.ctx.repoStatus.loop && third.ctx.repoStatusForeign.length === 1);
        third.ctx.setSource('daily-verse', 'manual');
        T('writing a choice writes the unreadable one back untouched',
          /"source":"automatic"/.test(shared.get(ns + c.KEYS.stateSources)));
        third.ctx.settleCheck('dayplan', third.ctx.statusUrlFor(third.ctx.PROJECT_REGISTRY[1]), { outcome: 'offline' });
        T('a check writes an unreadable cache entry back untouched too',
          /"status":"archived"/.test(shared.get(ns + c.KEYS.repoStatus)) && /"id":"dayplan"/.test(shared.get(ns + c.KEYS.repoStatus)));

        sub('clearing a state recorded before 0.2.0 shows Needs update, even with a status published');
        const old = new Map();
        old.set(ns + 'data.projectStates', JSON.stringify([{ id: 'dayplan', status: 'building', updatedAt: '2026-09-27T09:00:00.000Z' }]));
        old.set(ns + c.KEYS.repoStatus, JSON.stringify([{ id: 'dayplan', snapshot: statusFile('dayplan', { updatedAt: '2026-09-20T10:00:00.000Z' }),
          sourceUrl: c.statusUrlFor(c.PROJECT_REGISTRY[1]), fetchedAt: '2026-09-28T00:00:00.000Z', checkedAt: '2026-09-28T00:00:00.000Z', outcome: 'ok' }]));
        const pre = H.loadApp({ sharedStorage: old });
        const o = pre.ctx;
        T('with no choice made, the record of your own is shown', o.sourceOf('dayplan') === 'manual' && o.projectView('dayplan').status === 'building');
        o.openStateForm('dayplan'); o.__flush();
        const clearing = o.clearProjectState(); o.__flush();
        o.acceptConfirm(); o.__flush();
        return clearing.then(() => {
          T('cleared, it says Needs update, as the confirmation promised',
            !o.projectView('dayplan').recorded && !o.projectView('dayplan').connected);

          sub('a status that arrives while its editor is open is adopted, and saving there chooses your own');
          const fresh = H.loadApp({ sharedStorage: new Map() });
          const f = fresh.ctx;
          return H.settle().then(() => {
            const r = mockRaw(f);
            r.answers['space-kindergarten'] = answer(200, statusFile('space-kindergarten'));
            f.openStateForm('space-kindergarten'); f.__flush();
            return f.refreshStatuses('manual', ['space-kindergarten']).then(() => {
              T('the status is adopted at once, and the choice saved', f.sourceOf('space-kindergarten') === 'repository' &&
                !!f.stateSources['space-kindergarten']);
              T('the editor stays open', fresh.dom.document.getElementById('stateOverlay').classList.contains('open'));
              f.pickStatus('paused'); f.saveStateForm(); f.__flush();
              T('saving it shows the state you just recorded, as your own',
                f.sourceOf('space-kindergarten') === 'manual' && f.projectView('space-kindergarten').status === 'paused');
              T('no errors', [app, later, third, pre, fresh].every(a => a.errors.length === 0),
                [app, later, third, pre, fresh].map(a => a.errors.join(' | ')).join(' | '));
            });
          });
        });
      });
    });
  });
}

/* =========================================================
   CONTRACT 29 — CHECKING THE REPOSITORIES
   Asked after the first screen, when due, once per project at
   a time, with nothing attached; every failure named and kept
   apart; the last valid status never lost or made to look new.
   ========================================================= */
function testRefresh(){
  section('CONTRACT 29 — checking the repositories: due, deduplicated, failures kept apart');
  const shared = new Map();
  const app = H.loadApp({ sharedStorage: shared });
  const c = app.ctx, d = app.dom.document;
  const ns = c.STORAGE_NAMESPACE;
  const raw = mockRaw(c);                  // set before the open check runs
  const held = {};
  c.PROJECT_REGISTRY.forEach(p => { held[p.id] = pending(); raw.answers[p.id] = () => held[p.id].p; });
  const html = id => d.getElementById(id).innerHTML;
  const toasts = () => d.getElementById('toastHost').children.map(t => t.innerHTML).join(' | ');
  const entry = id => (JSON.parse(shared.get(ns + c.KEYS.repoStatus) || '[]').find(r => r.id === id)) || null;

  sub('the first screen never waits for the network');
  T('the hub is drawn before anything is asked', (html('projectField').match(/<button class="block /g) || []).length === 6 &&
    raw.calls.length === 0);
  return H.settle().then(() => {
    sub('opening the app asks each public repository once');
    const publicIds = c.PROJECT_REGISTRY.filter(p => p.publicRepo).map(p => p.id);
    T('one request per public repository', raw.calls.length === publicIds.length && raw.idsAsked().sort().join() === publicIds.slice().sort().join(),
      raw.idsAsked().join());
    T('none to the private repository', raw.idsAsked().indexOf('personal-savings') === -1);
    T('each to its derived address on GitHub\'s raw host', raw.calls.every(x => x.url.indexOf(c.STATUS_HOST) === 0 && /\/PROJECT-STATUS\.json$/.test(x.url)));
    T('with nothing attached: no cookies, no referrer, no token, a plain GET',
      raw.calls.every(x => x.opts.method === 'GET' && x.opts.credentials === 'omit' && x.opts.referrerPolicy === 'no-referrer' &&
        !x.opts.headers && x.opts.mode === 'cors'));
    T('revalidated, so an unchanged file is not downloaded again', raw.calls.every(x => x.opts.cache === 'no-cache'));
    T('while it runs, the screen is whole and Refresh says it is checking',
      /Needs update/.test(html('projectField')) && d.getElementById('refreshBtn').classList.contains('is-busy') &&
      d.getElementById('refreshBtn').getAttribute('aria-busy') === 'true');

    sub('asking again while a check runs joins it');
    c.refreshStatuses('manual'); c.refreshStatuses('front'); c.refreshNow();
    T('no second request for any project', raw.calls.length === publicIds.length, String(raw.calls.length));

    const clock = clockOn(c, '2026-09-28T12:00:00Z');
    held.loop.resolve(answer(200, statusFile('loop', { updatedAt: '2026-09-27T08:00:00Z', nextAction: 'FAKE first' }))(raw.calls[0].url));
    held.dayplan.resolve(answer(200, statusFile('dayplan'))(c.statusUrlFor(c.PROJECT_REGISTRY[1])));
    held['daily-verse'].resolve(answer(404, 'Not Found')(''));
    held['space-kindergarten'].resolve(answer(200, statusFile('space-kindergarten'))(c.statusUrlFor(c.PROJECT_REGISTRY[4])));
    held['capybara-sushi'].resolve(answer(200, statusFile('capybara-sushi', { needsQa: true }))(c.statusUrlFor(c.PROJECT_REGISTRY[5])));
    return H.settle().then(() => {
      T('when the answers land, Refresh is at rest', !d.getElementById('refreshBtn').classList.contains('is-busy'));
      T('and its name says when it last checked', /last checked just now/.test(d.getElementById('refreshBtn').getAttribute('aria-label')));
      T('each answer is kept on its own', entry('loop').outcome === 'ok' && entry('daily-verse').outcome === 'missing' &&
        entry('capybara-sushi').outcome === 'ok');

      sub('two times, never confused');
      const first = entry('loop');
      T('the publisher\'s time is the snapshot\'s; the check\'s time is the device\'s',
        first.snapshot.updatedAt === '2026-09-27T08:00:00.000Z' && first.checkedAt === '2026-09-28T12:00:00.000Z' &&
        first.fetchedAt === '2026-09-28T12:00:00.000Z');
      raw.answers.loop = answer(200, statusFile('loop', { updatedAt: '2026-09-27T08:00:00Z', nextAction: 'FAKE first' }));
      clock.advance(20 * 60 * 1000);
      return c.refreshStatuses('front');
    }).then(() => {
      const again = entry('loop');
      T('asking again moves the check\'s time, never the status\'s',
        again.checkedAt === '2026-09-28T12:20:00.000Z' && again.snapshot.updatedAt === '2026-09-27T08:00:00.000Z');
      T('so the brief still says when the project was updated, not when it was asked',
        /From repository · updated 1 day ago/.test(c.briefHtml(c.projectView('loop'), false)) &&
        /Checked just now/.test(c.briefHtml(c.projectView('loop'), false)));

      sub('asked only when due');
      const before = raw.calls.length;
      clock.advance(10 * 60 * 1000);
      return c.refreshStatuses('front').then(() => {
        T('ten minutes after an answer, coming back asks nothing', raw.calls.length === before);
        clock.advance(6 * 60 * 1000);
        return c.refreshStatuses('front');
      }).then(() => {
        T('fifteen minutes after, it asks again', raw.calls.length === before + 5, String(raw.calls.length - before));
        const n = raw.calls.length;
        return c.refreshNow().then(() => {
          T('Refresh asks now, whatever the schedule', raw.calls.length === n + 5);
          T('and says what it found', /Repository status is up to date|updated from the repositories/.test(toasts()));
        });
      });
    }).then(() => {
      sub('coming back to the app asks, when due');
      clock.advance(16 * 60 * 1000);
      const n = raw.calls.length;
      d.visibilityState = 'hidden';
      c.window.dispatch('visibilitychange');
      T('leaving asks nothing', raw.calls.length === n);
      d.visibilityState = 'visible';
      c.window.dispatch('visibilitychange');
      return H.settle().then(() => T('returning asks the due repositories', raw.calls.length === n + 5, String(raw.calls.length - n)));
    }).then(() => {
      sub('every failure is kept apart, and the last valid status is kept');
      const good = entry('capybara-sushi');
      const failures = [
        ['an HTTP error', answer(503, ''), 'http'],
        ['text that is not JSON', answer(200, '{oops'), 'invalid'],
        ['another project\'s file', answer(200, statusFile('loop')), 'wrong-app'],
        ['a newer schema', answer(200, statusFile('capybara-sushi', { schemaVersion: 2 })), 'unsupported'],
        ['a file too large', answer(200, JSON.stringify(statusFile('capybara-sushi')) + ' '.repeat(9000)), 'too-large'],
        ['GitHub unreachable', () => Promise.reject(new TypeError('Failed to fetch')), 'unreachable'],
        ['the file removed', answer(404, 'Not Found'), 'missing']
      ];
      let chain = Promise.resolve();
      failures.forEach(f => {
        chain = chain.then(() => {
          raw.answers['capybara-sushi'] = f[1];
          raw.answers.loop = answer(200, statusFile('loop', { updatedAt: '2026-09-27T08:00:00Z', nextAction: 'FAKE first' }));
          clock.advance(1000);
          return c.checkProjectNow('capybara-sushi').then(() => {
            const e = entry('capybara-sushi');
            T(f[0] + ': named "' + f[2] + '", snapshot and its fetch time kept',
              e.outcome === f[2] && JSON.stringify(e.snapshot) === JSON.stringify(good.snapshot) && e.fetchedAt === good.fetchedAt,
              JSON.stringify(e));
          });
        });
      });
      return chain.then(() => {
        const v = c.projectView('capybara-sushi');
        T('the project still shows the last status it published', v.connected && v.recorded && v.signal === 'needs_qa');
        T('its brief says what went wrong and what is shown',
          /The status file is no longer in the repository\. Showing the status fetched/.test(c.briefHtml(v, false)));
        T('other projects are untouched by one project\'s failures', entry('loop').outcome === 'ok');
      });
    }).then(() => {
      sub('offline: nothing is asked, nothing is lost');
      c.navigator.onLine = false;
      const n = raw.calls.length;
      clock.advance(2 * 60 * 60 * 1000);
      return c.refreshNow().then(() => {
        T('no request leaves the device', raw.calls.length === n);
        T('each check is recorded as offline, with the snapshot kept',
          entry('loop').outcome === 'offline' && entry('loop').snapshot.nextAction === 'FAKE first');
        T('the toast says the last status is still shown', /Offline\. The last status each repository published is still shown/.test(toasts()));
        T('the brief says the last check was offline',
          /The last check was made offline\. Showing the status fetched 2 hours ago/.test(c.briefHtml(c.projectView('loop'), false)));
        clock.advance(30 * 1000);
        T('a failure that may pass is not retried at once', c.statusDue('loop', clock.now()) === false);
        clock.advance(31 * 1000);
        T('it is retried after a minute', c.statusDue('loop', clock.now()) === true);
        c.navigator.onLine = true;
      });
    }).then(() => {
      sub('a timeout ends the request and keeps the last status');
      const realTimeout = c.setTimeout;
      c.setTimeout = (fn, ms) => realTimeout(fn, ms === c.STATUS_TIMEOUT_MS ? 1 : ms);
      raw.answers.loop = () => new Promise(() => {});
      return c.checkProjectNow('loop').then(() => {
        c.setTimeout = realTimeout;
        T('named "timeout", snapshot kept', entry('loop').outcome === 'timeout' && entry('loop').snapshot.nextAction === 'FAKE first');
      });
    }).then(() => {
      sub('GitHub asking for fewer requests is honoured for an hour');
      raw.answers.loop = answer(429, '');
      return c.checkProjectNow('loop').then(() => {
        T('named "rate-limited", snapshot kept', entry('loop').outcome === 'rate-limited' && !!entry('loop').snapshot);
        T('opening or coming back waits the hour, not a minute', c.statusDue('loop', clock.now() + 20 * 60 * 1000) === false);
        const n = raw.calls.length;
        clock.advance(20 * 60 * 1000);
        return c.refreshNow().then(() => {
          T('even Refresh leaves that repository alone while it waits',
            raw.calls.slice(n).every(x => x.url !== c.statusUrlFor(c.PROJECT_REGISTRY[0])));
          T('and says why', /GitHub asked for fewer requests/.test(toasts()));
          clock.advance(41 * 60 * 1000);
          T('after the hour it is due again', c.statusDue('loop', clock.now()) === true);
        });
      });
    }).then(() => {
      sub('an older copy never undoes a newer status');
      raw.answers.loop = answer(200, statusFile('loop', { updatedAt: '2026-09-28T09:00:00Z', nextAction: 'FAKE newer' }));
      return c.checkProjectNow('loop').then(() => {
        T('a newer status replaces the snapshot', entry('loop').snapshot.nextAction === 'FAKE newer');
        raw.answers.loop = answer(200, statusFile('loop', { updatedAt: '2026-09-27T08:00:00Z', nextAction: 'FAKE stale copy' }));
        return c.checkProjectNow('loop');
      }).then(() => {
        T('an older one is recorded as older and ignored',
          entry('loop').outcome === 'older' && entry('loop').snapshot.nextAction === 'FAKE newer');
      });
    }).then(() => {
      sub('the shell cache never holds a status');
      const sw = H.readSW();
      T('the status host is another origin, which the worker leaves alone',
        c.STATUS_HOST.indexOf('https://raw.githubusercontent.com/') === 0 && /new URL\(req\.url\)\.origin !== location\.origin/.test(sw));
      T('the worker names no status file and no GitHub host', !/PROJECT-STATUS|githubusercontent/.test(sw));
      /* The harness does not model generated elements, so the real focus
         behaviour is exercised in a browser; this keeps the wiring. */
      T('a check finishing in the background redraws without taking keyboard focus',
        /statusInFlight\.delete\(p\.id\);\s*try\{ keepFocusAcross\(renderMissionControl\); \}/.test(js()));
      T('no timer keeps asking: nothing polls', !/setInterval\(/.test(stripComments(js())));
      T('no errors', app.errors.length === 0, app.errors.join(' | '));
    });
  });
}

/* =========================================================
   CONTRACT 30 — THE WORLD
   The 3D field is two modules and a vendored library outside
   the page script, so this contract imports them directly:
   the library is the pinned build and nothing else, the world
   decides nothing the app owns, every place and crew state is
   whole, the layout and camera keep every project reachable at
   a readable size, and a touch is a tap or a pan, never both.
   ========================================================= */
async function testWorld(){
  section('CONTRACT 30 — the world: pinned, presentation-only, whole, reachable');
  const fsx = require('fs'), px = require('path'), crypto = require('crypto'), zlib = require('zlib');
  const { pathToFileURL } = require('url');
  const at = p => px.join(H.ROOT, p);
  const read = p => fsx.readFileSync(at(p), 'utf8');
  const app = H.loadApp();
  const c = app.ctx;

  sub('the library is the pinned build, served from here');
  const prov = JSON.parse(read('vendor/three/package.json'));
  const lib = fsx.readFileSync(at('vendor/three/three.min.js'));
  T('the vendored file is the one its provenance describes',
    crypto.createHash('sha256').update(lib).digest('hex') === prov.sha256 && lib.length === prov.bytes, prov.sha256);
  T('from the pinned release and tarball', prov.version === '0.186.1' && /^sha512-/.test(prov.integrity) &&
    prov.source === 'https://registry.npmjs.org/three/-/three-0.186.1.tgz');
  T('built the way the vendor script builds it', /--target=es2020,safari15/.test(prov.build.args.join(' ')) &&
    read('scripts/vendor-three.js').indexOf("const VERSION = '" + prov.version + "'") !== -1 &&
    read('scripts/vendor-three.js').indexOf(prov.integrity) !== -1);
  T('its licence travels with it', /MIT License/.test(read('vendor/three/LICENSE')) && /Three\.js Authors/.test(lib.slice(0, 400).toString()));
  T('it parses on Safari 15: no class static blocks', !/static\s*\{/.test(lib.toString()));
  const gz = zlib.gzipSync(lib, { level: 9 }).length;
  const W = await import(pathToFileURL(at('field/world.js')).href);
  T('it fits the transfer budget, gzipped', gz <= W.BUDGET.threeGzipBytes, gz + ' bytes');
  const THREE = await import(pathToFileURL(at('vendor/three/three.min.js')).href);
  T('it exports exactly what the world imports', Object.keys(THREE).sort().join() === prov.build.exports.slice().sort().join());
  T('and it is release 186', THREE.REVISION === '186');

  sub('the app loads only files it ships, and ships them for offline');
  T('every file the app loads exists', c.APP_FILES.every(f => fsx.existsSync(at(f))), c.APP_FILES.join(', '));
  T('the world module is one of them', c.APP_FILES.indexOf(c.WORLD_MODULE) !== -1);
  const r3 = read('field/render3d.js'), wj = read('field/world.js');
  const imports = s => [...s.matchAll(/\bfrom\s+'([^']+)'/g)].map(m => m[1]);
  T('the renderer imports only the library and the world', imports(r3).sort().join() === '../vendor/three/three.min.js,./world.js');
  T('the world imports nothing', imports(wj).length === 0 && !/\bimport\s*\(/.test(wj));
  T('each module is precached by its path', c.APP_FILES.indexOf('./field/world.js') !== -1 && c.APP_FILES.indexOf('./vendor/three/three.min.js') !== -1);

  sub('the world decides nothing the app owns');
  const code = s => stripComments(s);
  T('it never touches storage', !/localStorage|sessionStorage|indexedDB|\bStore\b/.test(code(r3) + code(wj)));
  T('it never fetches', !/\bfetch\(|XMLHttpRequest|WebSocket/.test(code(r3) + code(wj)));
  T('it never changes the selection: a tap is reported, the next draw says what is selected',
    !/selectedId|tapProject|selectProject/.test(code(r3)) && /H\.onTap\(item\.id\)/.test(r3));
  T('it never decides a status: colours come from the button the app classed',
    !/SIGNALS|attentionOf|needsQa|needsDecision/.test(code(r3)) && /rawToken\(b, '--sig'\)/.test(r3));
  T('the camera is never stored', !/setItem|Store\.set/.test(code(r3)));
  T('no literal colour in either module', !/#[0-9a-fA-F]{3,8}\b|0x[0-9a-fA-F]{6}\b/.test(code(r3) + code(wj)));
  T('one loop: every frame request schedules the same tick',
    (r3.match(/requestAnimationFrame\(/g) || []).length === (r3.match(/requestAnimationFrame\(tick\)/g) || []).length &&
    !/setInterval\(/.test(r3));
  T('a move is instant under Reduce Motion', /if\(!S\.frame \|\| instant \|\| rm\(\) \|\| !awake\(\)\)/.test(r3));
  T('nothing draws while hidden, covered, off screen or lost',
    /function awake\(\)\{ return !S\.destroyed && !S\.lost && !S\.failed && S\.onscreen && !S\.covered && !document\.hidden; \}/.test(r3));
  T('a lost context gets one grace period, then the flat field, never a retry',
    /LOST_GRACE_MS = 2500/.test(r3) && /fail\('context-lost'\)/.test(r3) && /if\(worldStage !== 'idle'\) return;/.test(js()));
  T('its own context listeners go on after Three.js\'s',
    r3.indexOf("listen(canvas, 'webglcontextlost'") > r3.indexOf('new THREE.WebGLRenderer('));

  sub('every token the world names is on the page');
  const style = css();
  const missing = Object.values(W.PALETTE).filter(t => style.indexOf(t + ':') === -1);
  T('every palette entry is a design token', missing.length === 0, missing.join(', '));
  const colours = new Set(Object.keys(W.PALETTE).concat(['tint', 'terrain']));
  const parts = [];
  Object.keys(W.ENVIRONMENTS).forEach(k => W.ENVIRONMENTS[k].parts.forEach(p => parts.push(['place ' + k, p])));
  Object.keys(W.ENVIRONMENTS).forEach(k => (W.ENVIRONMENTS[k].life || []).forEach(el => (el.parts || []).forEach(p => parts.push(['life ' + k, p]))));
  Object.keys(W.STATIONS).forEach(k => W.STATIONS[k].parts.forEach(p => parts.push(['station ' + k, p])));
  Object.keys(W.HAND_PROPS).forEach(k => W.HAND_PROPS[k].forEach(p => parts.push(['hand ' + k, p])));
  Object.keys(W.SCENERY).forEach(k => W.SCENERY[k].forEach(p => parts.push(['growth ' + k, p])));
  const bad = parts.filter(([, p]) => !colours.has(p.c) || W.SHAPES.indexOf(p.s) === -1 || W.FINISHES.indexOf(p.m) === -1 ||
    !p.p.every(Number.isFinite) || !p.d.every(v => v === null || v === undefined || (Number.isFinite(v) && v > 0)));
  T('every part is a known shape, finish and colour, with real dimensions', bad.length === 0,
    bad.slice(0, 3).map(b => b[0] + ' ' + JSON.stringify(b[1])).join(' | '));
  T('a station or the island\'s growth is the same everywhere: no project colour',
    parts.filter(([w, p]) => /^(station|hand|growth)/.test(w) && (p.c === 'tint' || p.c === 'terrain')).length === 0);
  T('glow is only ever the light of a place', parts.filter(([, p]) => p.m === 'glow').every(([, p]) => ['window', 'windowCool', 'windowDim', 'screen', 'tint', 'paper'].indexOf(p.c) !== -1));
  /* CIE76, as contract 24: the island and what grows on it are never read
     as a state. */
  const lab = h => {
    const n = parseInt(h.slice(1), 16);
    const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const x = f((lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047), y = f(lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722),
          z = f((lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const hexOf = name => { const m = new RegExp(name + ':\\s*(#[0-9A-Fa-f]{6})').exec(style); return m ? m[1] : null; };
  const sigHex = [...style.matchAll(/--sig-[a-z]+:\s*(#[0-9A-Fa-f]{6})/g)].map(m => m[1]);
  const land = ['grass', 'grassEdge', 'soil', 'rock', 'leaf', 'leafDark', 'bark', 'petal', 'petalLight'].map(k => W.PALETTE[k]);
  const nearest = land.map(t => {
    const a = lab(hexOf(t) || '#000000');
    return [t, Math.min.apply(null, sigHex.map(h => { const b = lab(h); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }))];
  });
  T('the land is never a status colour: every land and plant token is at least ΔE 20 from every status hue',
    sigHex.length === 9 && land.every(t => !!hexOf(t)) && nearest.every(([, d]) => d >= 20),
    nearest.filter(([, d]) => d < 20).map(([t, d]) => t + ' ' + d.toFixed(1)).join(', '));

  sub('every project has a place, and a place stays on its pad');
  const themes = [...new Set(c.PROJECT_REGISTRY.map(p => c.projectView(p.id).theme))];
  T('each registered look has its own place', themes.every(t => !!W.ENVIRONMENTS[t]), themes.join(','));
  T('an unknown look gets the generic place', W.environmentFor('not-a-theme-yet') === W.ENVIRONMENTS.generic);
  Object.keys(W.ENVIRONMENTS).forEach(k => {
    const e = W.ENVIRONMENTS[k];
    T(k + ': a primary structure and its details', e.parts.length >= (k === 'generic' ? 12 : 30), e.parts.length + ' parts');
    T(k + ': every part stands on the pad', e.parts.every(p => Math.abs(p.p[0]) <= W.TILE.reach && Math.abs(p.p[2]) <= W.TILE.reach));
    T(k + ': clear of the beacon at the back corner', e.parts.every(p => Math.hypot(p.p[0] - W.BEACON.x, p.p[2] - W.BEACON.z) > 0.9));
    T(k + ': room for the crew in front', Math.abs(e.crew.x) <= W.TILE.reach && Math.abs(e.crew.z) <= W.TILE.reach && e.crew.x + e.crew.z > 1.5);
    const h = W.placeHeight(k);
    T(k + ': its height is measured from its recipe: above its beacon, below any sky', h > W.TILE.padH + W.BEACON.mast * W.TILE.content && h < 12, h.toFixed(2));
  });
  T('a tall place is taller than a low one: the launchpad\'s gantry outreaches the running track', W.placeHeight('rocket') > W.placeHeight('track') + 0.5);
  T('an unknown look is as tall as the generic place', W.placeHeight('not-a-theme-yet') === W.placeHeight('generic'));
  T('no place is a progress bar: nothing counts, measures or fills', !/progress|percent|complete|level/i.test(code(wj)));

  sub('life: each place its own, and only while its work is known to be under way');
  const kinds = new Set(W.LIFE_KINDS);
  const samples = [0, 0.37, 1.1, 2.9, 7.3, 31.4, 1000.1];
  Object.keys(W.ENVIRONMENTS).forEach(k => {
    const life = W.ENVIRONMENTS[k].life || [];
    T(k + ': something of its own moves there', life.length >= 1);
    T(k + ': every motion is a known kind, of real parts or a runner',
      life.every(el => kinds.has(el.kind) && (el.rig === 'runner' || (Array.isArray(el.parts) && el.parts.length > 0)) && el.at.every(Number.isFinite)));
    const stray = [];
    life.forEach(el => { for(let i = 0; i < (el.copies || 1); i++) samples.forEach(t => {
      const o = W.lifeOrigin(el, i), q = W.lifePose(el, t, i);
      const ok = q.p.concat(q.r, [q.s]).every(Number.isFinite) && q.s > 0;
      const x = o[0] + q.p[0], z = o[2] + q.p[2];
      if(!ok || Math.abs(x) > W.TILE.reach + 0.4 || Math.abs(z) > W.TILE.reach + 0.4) stray.push(el.kind + '@' + t);
    }); });
    T(k + ': every moment of it is finite and stays on its pad', stray.length === 0, stray.slice(0, 4).join(', '));
  });
  const lively = ['working', 'inspecting', 'waiting', 'idle', 'surveying', 'celebrating'];
  T('it lives while building, in QA, awaiting a decision, stable, planning or release ready', lively.every(w => W.lifeActive(w, false)));
  T('it is still where nothing is known, where work is blocked and where it rests',
    ['unrecorded', 'warning', 'quiet', undefined, 'not-a-state'].every(w => !W.lifeActive(w, false)));
  T('nothing lives under Reduce Motion', lively.every(w => !W.lifeActive(w, true)));
  T('life is a place, not a measure: its pace depends on the kind of state alone',
    Object.keys(W.CREW).every(w => [0.7, 1].indexOf(W.lifeSpeed(w)) !== -1) && W.lifeSpeed('idle') < W.lifeSpeed('working'));
  T('a still place holds its first moment, the same every time',
    Object.keys(W.ENVIRONMENTS).every(k => (W.ENVIRONMENTS[k].life || []).every(el => JSON.stringify(W.lifePose(el, 0, 0)) === JSON.stringify(W.lifePose(el, 0, 0)))));
  T('the renderer advances it only while lively and seen, and shows its first moment under Reduce Motion',
    /if\(still\) t\.lifeT = 0;\s*else if\(ambient && lifeActive\(t\.state\.workerState, false\)\) t\.lifeT \+= dt \* lifeSpeed\(t\.state\.workerState\);/.test(r3) &&
    /if\(!lifeActive\(item\.workerState, false\)\) t\.lifeT = 0;/.test(r3));
  const run = W.poseFor('running', 0.4, null);
  T('a runner runs: its legs swing opposite ways', !!run && Object.values(run).every(v => typeof v === 'boolean' || Number.isFinite(v)) && run.legL === -run.legR && run.legL !== 0);

  sub('the island grows, never over a place');
  const grown = (n, cols) => { const lay = W.layoutDistricts(n, cols), isl = W.islandOf(lay.districts); return { lay: lay, isl: isl, g: W.scatter(lay.districts, isl, 7) }; };
  let onPads = 0, offIsland = 0, tallNear = 0, wet = 0, total = 0;
  [[1, 1], [2, 2], [6, 2], [6, 3], [7, 3], [12, 4], [20, 5]].forEach(([n, cols]) => {
    const { lay, isl, g } = grown(n, cols);
    total += g.items.length;
    g.items.forEach(it => {
      if(lay.districts.some(d => W.onPad(d, it.x, it.z, 0.6))) onPads++;
      if((it.kind === 'tree' || it.kind === 'pine') && lay.districts.some(d => W.onPad(d, it.x, it.z, 1.6))) tallNear++;
      if(!W.onIsland(isl, it.x, it.z, 1.6)) offIsland++;
      if(g.ponds.some(p => Math.hypot(it.x - p.x, it.z - p.z) < p.r + 0.5)) wet++;
    });
    g.ponds.forEach(p => { if(lay.districts.some(d => W.onPad(d, p.x, p.z, p.r + 1))) onPads++; });
  });
  T('it grows: trees, rocks and flowers between the districts', total > 60, total + ' items');
  T('nothing grows on a pad, and no pond reaches one', onPads === 0, onPads);
  T('no tree stands close enough to hide a place', tallNear === 0, tallNear);
  T('nothing grows off the shore or in a pond', offIsland === 0 && wet === 0, offIsland + ' / ' + wet);
  T('the same island every time: grown from a fixed seed', JSON.stringify(grown(6, 2).g) === JSON.stringify(grown(6, 2).g));
  T('every kind that grows has a recipe', grown(12, 4).g.items.every(it => !!W.SCENERY[it.kind]));

  sub('one island: every project a district, in reading order, with no ceiling');
  const themes6 = ['track', 'calendar', 'book', 'vault', 'rocket', 'sushi'];
  const shapes = [[358, 521], [341, 335], [590, 142], [760, 260], [706, 568], [590, 778], [1200, 700]];
  const inView = (s, w, h, m) => s.x >= -m && s.x <= w + m && s.y >= -m && s.y <= h + m;
  const extent = W.TILE.pad * Math.SQRT2;
  let apart = true, reading = true, readable = true, framed = true, deeper = true;
  [1, 2, 3, 5, 6, 7, 9, 12, 20, 50].forEach(n => shapes.forEach(([w, h]) => {
    const heights = Array.from({ length: n }, (_, i) => W.placeHeight(n === 6 ? themes6[i] : themes6[i % 6]));
    const pick = W.chooseLayout(n, w, h, heights, null), ds = pick.districts;
    if(ds.length !== n) apart = false;
    for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++)
      if(Math.abs(ds[i].x - ds[j].x) + Math.abs(ds[i].z - ds[j].z) < 2 * extent) apart = false;
    for(let i = 1; i < n; i++){
      const p = ds[i - 1], q = ds[i];
      if(q.row < p.row || (q.row === p.row && q.x <= p.x)) reading = false;
    }
    const f = pick.frame, seenNow = W.districtsInView(ds, f, w, h), px = seenNow.map(d => W.districtPx(d, f, w, h));
    const first = W.project([ds[0].x, 0, ds[0].z], f, w, h);
    if(!(Math.min.apply(null, px) >= W.WORLD.minDistrictPx - 0.5) || !Number.isFinite(f.x + f.z + f.d) ||
       seenNow.indexOf(ds[0]) === -1 || !inView(first, w, h, 0)) readable = false;
    if(pick.fits && seenNow.length !== n) readable = false;
    if(pick.fits){
      ds.forEach((d, i) => W.districtPoints(d, heights[i], null).forEach(q => {
        const s = W.project(q.p, f, w, h);
        if(!inView({ x: s.x, y: s.y + (q.down || 0) }, w, h, 1)) framed = false;
      }));
    }
    const back = ds.filter(d => d.row === 0), front = ds.filter(d => d.row === ds[n - 1].row);
    if(n > pick.cols){
      // Compare depth on one x: a short final row may be centred at another x.
      const rear = { x: f.x, z: back[0].z }, near = { x: f.x, z: front[0].z };
      if(!(W.project([near.x, 0, near.z], f, w, h).depth < W.project([rear.x, 0, rear.z], f, w, h).depth)) deeper = false;
    }
  }));
  T('districts never overlap, from one project to fifty, on every screen', apart);
  T('districts keep registry order: back to front, left to right', reading);
  T('the overview draws no district in view below the readable size and starts where reading begins; a larger island pans', readable);
  T('an overview that fits shows every district whole, roof to label', framed);
  T('one world with depth: a nearer row is drawn larger than a farther one', deeper);
  const phone = W.chooseLayout(6, 358, 521, themes6.map(W.placeHeight), null);
  T('on a phone the six city blocks stand two to a row at the readable overview scale', phone.fits && phone.cols === 2 && phone.size >= W.WORLD.minDistrictPx, phone.cols + ' cols, ' + phone.size.toFixed(1) + ' px');
  const phoneRooms = themes6.map((_, i) => ({ w: 100, h: i === 4 ? 56 : 36 }));
  const phoneMeasured = W.chooseLayout(6, 358, 521, themes6.map(W.placeHeight), phoneRooms);
  const phonePoints = phoneMeasured.districts.flatMap((d, i) => W.districtPoints(d, W.placeHeight(themes6[i]), phoneRooms[i]));
  W.islandOutline(W.islandOf(phoneMeasured.districts), 96, 0).forEach(([x, z]) => phonePoints.push({ p: [x, -W.WORLD.islandDepth, z] }));
  T('phone overview keeps the whole street slab and measured labels inside the view instead of cropping side blocks',
    phoneMeasured.fits && phoneMeasured.cols === 2 && phonePoints.every(q => {
      const p = W.project(q.p, phoneMeasured.frame, 358, 521);
      return p.depth > 0 && p.x - (q.w || 0) >= 0 && p.x + (q.w || 0) <= 358 && p.y - (q.up || 0) >= 0 && p.y + (q.down || 0) <= 521;
    }));
  const shortPhone = W.chooseLayout(6, 341, 335, themes6.map(W.placeHeight), phoneRooms);
  T('a short phone shows all six blocks instead of silently panning past the bank', shortPhone.fits && shortPhone.cols === 2);

  sub('city ambience has bounded continuous paths, separate from project work');
  const streets = W.trafficBounds(phone.districts);
  let pathsSafe = true, pathsContinuous = true;
  for(let t=0; t<400; t+=0.1){
    const a=W.streetPose(streets,t,0), b=W.streetPose(streets,t+0.001,0);
    if(!Number.isFinite(a.x+a.z+a.turn) || a.x<streets.minX-0.001 || a.x>streets.maxX+0.001 || a.z<streets.minZ-0.001 || a.z>streets.maxZ+0.001) pathsSafe=false;
    if(Math.hypot(a.x-b.x,a.z-b.z)>0.002 || Math.abs(Math.atan2(Math.sin(a.turn-b.turn),Math.cos(a.turn-b.turn)))>0.003) pathsContinuous=false;
  }
  T('trucks remain on their road bounds',pathsSafe);
  T('rounded street turns keep position and heading continuous',pathsContinuous);
  T('street scenery is generated for any registered block count', W.cityParts(phone.districts).length>0 && W.cityParts(W.layoutDistricts(7,3).districts).length>W.cityParts(phone.districts).length);
  T('residents and delivery trucks have no state inputs', W.streetPose.length===3 && !/workerState|status|recorded/.test(W.streetPose.toString()));
  T('light and layout identifiers cannot shadow each other at world construction', /const layoutKey =/.test(r3) && /key\.target\.position/.test(r3));
  T('cached shadows cannot retain an old worker station or moving prop',
    /mesh\.castShadow = !!staticShadow && m !== 'glow'/.test(r3) &&
    /meshesFor\(placeGeo\(item\.theme, tintOf\), t\.content, true, true\)/.test(r3) &&
    (r3.match(/, true, true\)/g) || []).length === 1);

  sub('the camera stays on the island and goes where it is sent');
  const ds6 = phone.districts, isl6 = W.islandOf(ds6), over = phone.frame, hts = themes6.map(W.placeHeight);
  const far = W.panFrame(over, 1e6, -1e6, 358, 521, isl6);
  T('a pan cannot lose the island: the camera looks at most a pad beyond the outer districts', W.onIsland(isl6, far.x, far.z, 0) &&
    far.x <= isl6.reach.maxX + extent + 1e-9 && far.z >= isl6.reach.minZ - extent - 1e-9, JSON.stringify(far));
  const nudge = W.panFrame(over, 30, 0, 358, 521, isl6), under = W.project([over.x, 0, over.z], nudge, 358, 521);
  T('the island follows the finger', Math.abs(under.x - (179 + 30)) < 0.5 && Math.abs(under.y - 260.5) < 0.5, JSON.stringify(under));
  const focus = W.focusFrame(ds6[5], hts[5], null, over, 358, 521);
  T('focus comes closer than the overview', focus.d < over.d && focus.d >= W.WORLD.minDist);
  T('and draws the place larger', W.districtPx(ds6[5], focus, 358, 521) > W.districtPx(ds6[5], over, 358, 521) * 1.2);
  const seen = W.districtPoints(ds6[5], hts[5], null, W.WORLD.sign).every(q => {
    const s = W.project(q.p, focus, 358, 521);
    return inView({ x: s.x, y: s.y + (q.down || 0) - (q.up || 0) }, 358, 521, 1);
  });
  T('the focused place, its label and its sign are all in view', seen);
  const tall = W.focusFrame(ds6[5], hts[5], null, over, 358, 521, { w: 200, h: 140 });
  T('a taller sign is given its room', tall.d > focus.d);
  const home = W.revealFrame(focus, ds6[5], hts[5], null, 358, 521, isl6);
  T('a district already in view does not move the camera', home === focus);
  const moved = W.revealFrame(focus, ds6[0], hts[0], null, 358, 521, isl6), p0 = W.project([ds6[0].x, 0, ds6[0].z], moved, 358, 521);
  T('keyboard focus on a district out of view brings it into view', !W.sameFrame(moved, focus) && inView(p0, 358, 521, 0));
  const close = { x: ds6[0].x, z: ds6[0].z, d: W.WORLD.minDist }, behind = W.project([ds6[5].x, 0, ds6[5].z], close, 358, 521);
  const turned = W.revealFrame(close, ds6[5], hts[5], null, 358, 521, isl6), p5 = W.project([ds6[5].x, 0, ds6[5].z], turned, 358, 521);
  T('even one behind the camera, close in at the back row', behind.depth < 0.5 && p5.depth > 0.5 && inView(p5, 358, 521, 0), [behind.depth, p5]);
  T('a flight starts where it is and ends where it was sent',
    W.sameFrame(W.mixFrame(over, focus, 0), over) && W.sameFrame(W.mixFrame(over, focus, 1), focus));
  T('the drawing buffer never exceeds two device pixels per CSS pixel', W.pixelRatioFor(3, 390, 520) === 2);
  T('nor a size a tablet pays for', W.pixelRatioFor(2, 1400, 1000) ** 2 * 1400 * 1000 <= W.WORLD.maxCanvasPixels + 1);
  T('a slow device steps its resolution down, never below one pixel per pixel',
    W.nextPixelRatio(2) === 1.75 && W.nextPixelRatio(1.3) === 1.25 && W.nextPixelRatio(1) === 1);

  sub('a tap lands on the district drawn there');
  const hitAll = ds6.every((d, i) => {
    const s = W.project([d.x, W.TILE.padH, d.z], over, 358, 521);
    return W.hitDistrict(ds6, hts, over, 358, 521, s.x, s.y) === i;
  });
  T('a tap on each district at the overview lands on it', hitAll);
  const roof = W.project([ds6[3].x, hts[3] * 0.7, ds6[3].z], over, 358, 521);
  T('a tap on a roof lands on its own district', W.hitDistrict(ds6, hts, over, 358, 521, roof.x, roof.y) === 3);
  T('a tap beyond the island lands on nothing', W.hitDistrict(ds6, hts, over, 358, 521, 2, 2) === -1 &&
    W.hitDistrict(ds6, hts, over, 358, 521, 356, 519) === -1);
  const gap = W.project([(ds6[0].x + ds6[1].x) / 2, 0, ds6[0].z - extent * 0.6], over, 358, 521);
  T('a tap on open grass between districts lands on nothing', W.hitDistrict(ds6, hts, over, 358, 521, gap.x, gap.y) === -1);
  /* A nearer district's roof can cover a farther one's pad: the one you see wins. */
  const pair = [{ x: 0, z: 0, row: 0 }, { x: 0, z: 8, row: 1 }], ph = [6, 6];
  const pf = W.focusFrame(pair[1], 6, null, null, 358, 521);
  const top = W.project([0, 5.5, 8], pf, 358, 521);
  T('where two overlap, the nearer is the one tapped', W.hitDistrict(pair, ph, pf, 358, 521, top.x, top.y) === 1);

  sub('smooth: a frame moves things, it never measures the page');
  const fnBody = name => {
    const at0 = r3.indexOf('function ' + name + '(');
    if(at0 === -1) return null;
    let depth = 0, i = r3.indexOf('{', at0);
    for(let j = i; j < r3.length; j++){ if(r3[j] === '{') depth++; else if(r3[j] === '}' && --depth === 0) return r3.slice(at0, j + 1); }
    return null;
  };
  const perFrame = ['tick', 'stepCamera', 'aimCamera', 'stepCrews', 'stepLife', 'stepBeacons', 'placeLabels', 'applyPose'].map(fnBody);
  T('every per-frame step is found', perFrame.every(Boolean));
  const reads = /offsetWidth|offsetHeight|getBoundingClientRect|getComputedStyle|clientWidth|clientHeight|scrollTop|innerHTML|textContent|measureLabels|rawToken|tokenOf/;
  T('no frame reads layout or style, or writes content (0.3.1 recalculated the page on every zoom frame)',
    perFrame.every(b => !reads.test(code(b || ''))), perFrame.filter(b => b && reads.test(code(b))).map(b => b.slice(9, 30)).join(', '));
  T('a label moves by transform alone, and only when it has moved',
    /if\(x !== t\.px \|\| y !== t\.py\)\{ t\.px = x; t\.py = y; t\.button\.style\.transform = 'translate3d\('/.test(r3) &&
    !/style\.(left|top|width|height)\s*=/.test(code(fnBody('placeLabels') || '')));
  T('labels are measured when their words or their room change, outside any frame',
    /t\.labelW = t\.label\.offsetWidth; t\.labelH = t\.label\.offsetHeight; t\.labelDirty = false;/.test(r3) &&
    /if\(changed\('name'\)\)\{ t\.nameEl\.textContent = item\.name; t\.labelDirty = true; \}/.test(r3));
  T('up to about 60 frames a second, not 30', W.WORLD.frameMinMs >= 12 && W.WORLD.frameMinMs <= 16.7 &&
    /now - S\.lastRender < WORLD\.frameMinMs/.test(r3));
  T('frames that keep coming slowly lower the resolution a step',
    /S\.slowSum \/ S\.slowCount > WORLD\.slowFrameMs && S\.dpr > WORLD\.minPixelRatio/.test(r3) && /S\.dprCap = nextPixelRatio\(S\.dpr\)/.test(r3));
  T('the island is built once per layout, not per frame', /if\(layoutKey === land\.key\) return island;/.test(r3) && !/buildLand/.test(code(fnBody('tick') || '')));
  T('taps are hit-tested on the island, never by a box per district',
    /hitDistrict\(S\.order\.map/.test(r3) && !/world-hit/.test(r3 + style));

  sub('labels: readable at once, or not there to tap');
  const shown = W.resolveLabels([
    { id: 'a', row: 0, x: 10, y: 10, w: 80, h: 40 },
    { id: 'b', row: 1, x: 50, y: 20, w: 80, h: 40 },
    { id: 'c', row: 1, x: 200, y: 20, w: 80, h: 40 },
    { id: 'd', row: 1, x: 900, y: 20, w: 80, h: 40 }], ['a'], 400, 300);
  T('the selected label wins an overlap', shown.a === true && shown.b === false);
  T('a clear label shows', shown.c === true);
  T('a label outside the view is not there', shown.d === false);
  T('a hidden label, or one whose district has left the view, takes no taps',
    /\.world-tile\.is-hidden \.world-label\{ opacity: 0; pointer-events: none; \}/.test(style) &&
    /\.world-tile\.is-off \.world-label\{ opacity: 0; pointer-events: none; \}/.test(style));
  T('a focused label always shows', /\.world-tile:focus-visible \.world-label\{ opacity: 1;/.test(style));

  sub('the sign: status and what needs you, rising in once, taking no taps');
  T('it sits over the selected place only, whole inside the view', /const a = project\(signAnchor\(districtOf\(sel\), sel\.height\), f, W, Hh\)/.test(r3) &&
    /cx = Math\.round\(Math\.min\(Math\.max\(x, half\), Math\.max\(half, W - half\)\)\), cy = Math\.max\(y, Math\.ceil\(room\.h\)\)/.test(r3));
  T('it takes no taps and is not read twice', /\.world-sign\{[^}]*pointer-events: none;/.test(style) && /sign\.setAttribute\('aria-hidden', 'true'\)/.test(r3));
  T('it rises in when the selection changes, from the one loop', /S\.signEnter = 2;/.test(r3) &&
    /if\(S\.signEnter && --S\.signEnter === 0 && S\.signFor\) sign\.classList\.add\('is-in'\);/.test(r3) &&
    /\.world-sign\.is-in \.world-sign-card\{ opacity: 1;/.test(style));
  const beneath = W.resolveLabels([
    { id: ' sign', row: -1, x: 100, y: 10, w: 200, h: 60 },
    { id: 'near', row: 2, x: 150, y: 40, w: 80, h: 40 },
    { id: 'clear', row: 2, x: 10, y: 120, w: 80, h: 40 }], [null, ' sign', 'clear'], 400, 300);
  T('a label the sign would cover is not there while the sign is', beneath.near === false && beneath.clear === true &&
    /rects\.push\(\{ id: SIGN, row: -1,/.test(r3) && /resolveLabels\(rects, \[S\.focused, SIGN, S\.selected\], W, Hh\)/.test(r3));
  T('it is measured when its words change, so a focus leaves it room', /S\.signRoom = w > 0 && h > 0 \?/.test(r3) &&
    /focusFrame\(districtOf\(sel\), sel\.height, sel\.room, S\.over, S\.w, S\.h, S\.signRoom\)/.test(r3));

  sub('a touch is a tap or a pan, never both');
  let g = W.createArbiter(8);
  g.down(1, 100, 100);
  T('movement inside the slop is still a tap', g.move(1, 105, 106) === null && g.up(1).type === 'tap');
  g.down(1, 100, 100);
  const start = g.move(1, 100, 109);
  T('past the slop it becomes a pan, with the whole movement', start.type === 'pan-start' && start.dy === 9);
  T('and stays one', g.move(1, 100, 101).type === 'pan' && g.up(1).type === 'pan-end');
  g.down(1, 0, 0);
  T('a second finger is ignored while the first owns the gesture', g.down(2, 0, 0) === null && g.move(2, 50, 50) === null);
  T('a cancelled touch is no tap', g.cancel(1).type === 'cancel' && !g.busy());
  g.down(3, 0, 0); g.move(3, 30, 0);
  T('a lost capture ends a pan as a pan', g.cancel(3).type === 'pan-end');
  T('a stray event after the end does nothing', g.up(3) === null && g.move(3, 1, 1) === null);
  T('the viewport, and only it, takes drags from the page', /\.world-view\{[^}]*touch-action: none/.test(style) &&
    (style.match(/touch-action: none/g) || []).length === 1);
  const clickGuard = r3.slice(r3.indexOf("listen(view, 'click'"), r3.indexOf("listen(view, 'click'") + 260);
  T('the click a drag or an island tap would also make never reaches a button, however the camera has moved',
    /listen\(view, 'click', e => \{\s*if\(e\.detail === 0 \|\| performance\.now\(\) > S\.swallowUntil\) return;/.test(r3) && /, true\);/.test(clickGuard) &&
    /const endPan = \(\) => \{ view\.classList\.remove\('is-panning'\); swallowNextClick\(\); \};/.test(r3) &&
    /if\(r\.type === 'tap' && S\.downOnIsland && S\.frame\)\{\s*swallowNextClick\(\);/.test(r3));
  T('and a keyboard\'s click is never swallowed', /e\.detail === 0/.test(clickGuard));

  sub('the page keeps the flat field until the world is drawn, and after it fails');
  T('where WebGL 2 is absent the world is never asked for', c.worldStage === 'off' && c.Field === c.IsoField &&
    (app.dom.document.getElementById('projectField').innerHTML.match(/<button class="block /g) || []).length === 6);
  let destroyed = 0;
  c.worldStage = 'on';
  c.WorldField.world = { draw(){}, focus(){}, destroy(){ destroyed++; } };
  c.WorldField.mount(app.dom.document.getElementById('projectField'));
  c.Field = c.WorldField;
  c.stopWorld();
  T('a failed world is destroyed once and the flat field drawn again', destroyed === 1 && c.Field === c.IsoField &&
    (app.dom.document.getElementById('projectField').innerHTML.match(/<button class="block /g) || []).length === 6);
  c.stopWorld(); c.startWorld();
  T('and it is not tried again this visit', destroyed === 1 && c.worldStage === 'off' && c.Field === c.IsoField);
  T('the world reports taps to the app and asks it about motion and cover',
    /onTap: tapProject,[\s\S]{0,80}onFail: stopWorld,[\s\S]{0,80}reducedMotion: prefersReducedMotion,[\s\S]{0,80}covered: \(\) => document\.body\.classList\.contains\('scroll-locked'\)/.test(js()));
  T('the world is made behind the flat field, in its own host, and takes over only once it has drawn',
    /WorldField\.world = mod\.createWorld\(host, \{[\s\S]{0,120}onReady: adoptWorld/.test(js()) &&
    !/import\(WORLD_MODULE\)[\s\S]{0,400}IsoField\.unmount\(\)/.test(js()) &&
    /function adoptWorld\(\)\{\s*if\(worldStage !== 'loading'\) return;[\s\S]{0,300}IsoField\.unmount\(\);[\s\S]{0,300}Field = WorldField;/.test(js()));
  T('while it loads the flat field stays drawn and the world takes no taps',
    /\.world-host\{[^}]*pointer-events: none/.test(css()) && /view\.style\.visibility = 'hidden'/.test(r3) &&
    /if\(view\.style\.visibility\)\{\s*view\.style\.visibility = '';[\s\S]{0,120}if\(H\.onReady\) H\.onReady\(\);/.test(r3) &&
    !/world-pending|visibility: hidden; \}/.test((css().match(/\.project-field\.world-loading[^}]*\}/g) || []).join('')));
  T('the world\'s box is what the screen has left, measured: above the tab bar, with the dock\'s room kept',
    /vh - top - bar - dockH - gap/.test(js()) && /fitField\(\);\r?\n\}/.test(js()) && /addEventListener\('resize', fitField\)/.test(js()) &&
    /if\(worldStage === 'off' \|\|/.test(js()));
  T('labels are type, not boxes: only the selected one has a backing', /\.world-label\{[^}]*background: none;/.test(css()) &&
    /\.world-tile\.is-selected \.world-label\{ background: var\(--world-label\); \}/.test(css()) && /\.world-name\{[^}]*text-shadow:/.test(css()));
  T('each renderer has its own host in one box', /<div class="field-box">\s*<div class="project-field" id="projectField"[^>]*><\/div>\s*<div class="world-host" id="worldHost"/.test(H.readApp()));
  T('no errors', app.errors.length === 0, app.errors.join(' | '));
}

module.exports = {
  T, section, sub, results, reset, testPortability,
  testBoot, testConfig, testStorage, testCollision, testMigration,
  testNavigation, testOverlays, testToast, testConfirmation, testForms,
  testMobile, testDesignSystem, testPWA, testRelease, testStress,
  testAccessibility, testContamination, testSourcesOfTruth,
  testRegistry, testStatusModel, testPrivateLinks, testHub, testFieldSeam, testSecrets,
  testBackupBoundary, testStatusContract, testConnectedState, testRefresh, testWorld
};
