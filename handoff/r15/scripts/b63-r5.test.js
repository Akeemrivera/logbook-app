'use strict';
/*
  Revision 5 regressions. These run the real service worker, the real registration
  gate, the real photo store, and the real list / notes / lock functions.
  They do not start Xcode, sign, or upload. Headless Chrome is not required.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const REV4_SW_SHA = 'e0f4d0ad85a743be36a5f37056a5f0575905f25ce3aefa884d00d720a957e051';
const FAIL = [];
function check(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === 'function') {
      throw new Error('check() does not take a promise: ' + name);
    }
    console.log('PASS', name);
  } catch (e) {
    FAIL.push(name);
    console.error('FAIL', name, e && e.stack || e);
    process.exit(1);
  }
}
function sha256(buf) {
  return require('crypto').createHash('sha256').update(buf).digest('hex');
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel)); }

check('service worker copies match and are not the revision 4 script', () => {
  const files = ['service-worker.js', 'www/service-worker.js', 'ios/App/App/public/service-worker.js'];
  const hashes = files.map((rel) => sha256(read(rel)));
  if (new Set(hashes).size !== 1) throw new Error(hashes.join(' '));
  if (hashes[0] === REV4_SW_SHA) throw new Error('script bytes still match revision 4, so an update check would not install a worker');
  const text = read('service-worker.js').toString('utf8');
  if (!text.includes("boriken-genetics-logbook-app-v88")) throw new Error('cache name');
  if (text.includes("boriken-genetics-logbook-app-v87")) throw new Error('v87 cache name still present');
  if (text.includes("boriken-genetics-logbook-app-v86")) throw new Error('v86 cache name still present');
  if (text.includes("boriken-genetics-logbook-app-v85")) throw new Error('v85 cache name still present');
  if (text.includes("boriken-genetics-logbook-app-v84")) throw new Error('v84 cache name still present');
  if (text.includes("boriken-genetics-logbook-app-v83")) throw new Error('v83 cache name still present');
  if (text.includes("boriken-genetics-logbook-app-v82")) throw new Error('v82 cache name still present');
  if (text.includes("boriken-genetics-logbook-app-v81")) throw new Error('old cache name still present');
  if (!text.includes("cache: 'reload'")) throw new Error('precache still uses the default HTTP cache');
});

check('ios scheme is https, so the protocol gate does register inside the wrapper', () => {
  const cfg = JSON.parse(read('capacitor.config.json').toString('utf8'));
  const ios = JSON.parse(read('ios/App/App/capacitor.config.json').toString('utf8'));
  if (cfg.server.iosScheme !== 'https' || ios.server.iosScheme !== 'https') throw new Error(JSON.stringify([cfg.server, ios.server]));
  const src = read('app.js').toString('utf8');
  const start = src.indexOf('function setupInstallableApp()');
  const end = src.indexOf('const THEME_PREF_KEY', start);
  if (start < 0 || end < 0) throw new Error('registration function missing');
    const cases = [
    ['https:', true],
    ['http:', true],
    ['capacitor:', false],
    ['file:', false],
  ];
  for (const [protocol, expectRegister] of cases) {
    const calls = [];
    const context = {
      navigator: { serviceWorker: { register(url) { calls.push(url); return Promise.resolve(); } } },
      location: { protocol },
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(src.slice(start, end) + '\nsetupInstallableApp();', context, { filename: 'setupInstallableApp.js' });
    const registered = calls.includes('./service-worker.js');
    if (registered !== expectRegister) throw new Error(protocol + ' registered=' + registered);
  }
  const bare = { navigator: {}, location: { protocol: 'https:' } };
  bare.window = bare;
  vm.createContext(bare);
  vm.runInContext(src.slice(start, end) + '\nsetupInstallableApp();', bare);
  if (bare.navigator.serviceWorker) throw new Error('invented a registration');
});

function serviceWorkerScope() {
  const listeners = {};
  const stores = new Map();
  function keyOf(req) {
    const raw = typeof req === 'string' ? req : req.url;
    return new URL(raw, 'https://localhost/').href;
  }
  const scope = {
    URL,
    Promise,
    Map,
    Request: class extends Request {
      constructor(input, init) {
        const raw = typeof input === 'string' ? input : input.url;
        super(new URL(raw, 'https://localhost/service-worker.js').href, init);
      }
    },
    Response,
    fetch: async (input) => {
      const cacheMode = typeof input === 'string' ? 'default' : (input.cache || 'default');
      const body = cacheMode === 'reload' ? 'BUNDLE-FRESH' : 'HTTP-STALE';
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/javascript' } });
    },
    skipWaiting() { scope.skipped = true; return Promise.resolve(); },
    clients: { claim() { scope.claimed = true; return Promise.resolve(); } },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  class FakeCache {
    constructor() { this.map = new Map(); }
    async match(req) {
      const hit = this.map.get(keyOf(req));
      return hit ? hit.clone() : undefined;
    }
    async put(req, res) { this.map.set(keyOf(req), res.clone()); }
    async add(req) {
      const res = await scope.fetch(req);
      if (!res.ok) throw new Error('precache failed ' + keyOf(req));
      await this.put(req, res);
    }
  }
  scope.caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return stores.get(name);
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(req) {
      for (const cache of stores.values()) {
        const hit = await cache.match(req);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  scope.self = scope;
  return { scope, listeners, stores };
}

async function fire(listeners, type, extra) {
  let gate = Promise.resolve();
  const event = Object.assign({
    waitUntil(p) { gate = p; },
    respondWith(p) { gate = p.then((res) => { event.response = res; }); },
  }, extra);
  (listeners[type] || []).forEach((fn) => fn(event));
  await gate;
  return event;
}

async function swUpdatePath() {
  const { scope, listeners, stores } = serviceWorkerScope();
  const oldCache = await scope.caches.open('boriken-genetics-logbook-app-v81');
  await oldCache.put('https://localhost/build57.js', new Response('REV2-STALE', { status: 200 }));
  await oldCache.put('https://localhost/build63.css', new Response('REV2-CSS', { status: 200 }));
  const v82 = await scope.caches.open('boriken-genetics-logbook-app-v82');
  await v82.put('https://localhost/build13.js', new Response('V82-STALE-BUILD13', { status: 200 }));
  await v82.put('https://localhost/build58.js', new Response('V82-STALE-BUILD58', { status: 200 }));
  const v83 = await scope.caches.open('boriken-genetics-logbook-app-v83');
  await v83.put('https://localhost/build63.js', new Response('V83-STALE-BUILD63', { status: 200 }));
  const v84 = await scope.caches.open('boriken-genetics-logbook-app-v84');
  await v84.put('https://localhost/b63-repair.json', new Response('V84-STALE-REPAIR', { status: 200 }));
  const v85 = await scope.caches.open('boriken-genetics-logbook-app-v85');
  await v85.put('https://localhost/build49.js', new Response('V85-STALE-BUILD49', { status: 200 }));
  const v86 = await scope.caches.open('boriken-genetics-logbook-app-v86');
  await v86.put('https://localhost/build57.js', new Response('V86-STALE-BUILD57', { status: 200 }));
  const v87 = await scope.caches.open('boriken-genetics-logbook-app-v87');
  await v87.put('https://localhost/build63.js', new Response('V87-STALE-BUILD63', { status: 200 }));

  const held = await scope.caches.match('https://localhost/build57.js');
  if (!held || await held.text() !== 'REV2-STALE') throw new Error('seed failed');

  const context = vm.createContext(scope);
  vm.runInContext(read('service-worker.js').toString('utf8'), context, { filename: 'service-worker.js' });

  const beforeInstall = await scope.caches.match(new Request('https://localhost/build57.js'));
  if (await beforeInstall.text() !== 'REV2-STALE') throw new Error('cache-first changed before install');

  await fire(listeners, 'install');
  if (!scope.skipped) throw new Error('install did not skipWaiting');
  await fire(listeners, 'activate');
  if (!scope.claimed) throw new Error('activate did not claim clients');
  const names = await scope.caches.keys();
  if (names.includes('boriken-genetics-logbook-app-v81')) throw new Error('v81 cache kept ' + names.join(','));
  if (names.includes('boriken-genetics-logbook-app-v82')) throw new Error('v82 cache kept ' + names.join(','));
  if (names.includes('boriken-genetics-logbook-app-v83')) throw new Error('v83 cache kept ' + names.join(','));
  if (names.includes('boriken-genetics-logbook-app-v84')) throw new Error('v84 cache kept ' + names.join(','));
  if (names.includes('boriken-genetics-logbook-app-v85')) throw new Error('v85 cache kept ' + names.join(','));
  if (names.includes('boriken-genetics-logbook-app-v86')) throw new Error('v86 cache kept ' + names.join(','));
  if (names.includes('boriken-genetics-logbook-app-v87')) throw new Error('v87 cache kept ' + names.join(','));
  if (!names.includes('boriken-genetics-logbook-app-v88')) throw new Error('new cache missing ' + names.join(','));

  const precached = await scope.caches.match('https://localhost/build57.js');
  const precachedBody = await precached.text();
  if (precachedBody !== 'BUNDLE-FRESH') throw new Error('precache body ' + precachedBody);
  const css = await (await scope.caches.match('https://localhost/build63.css')).text();
  if (css !== 'BUNDLE-FRESH') throw new Error('css body ' + css);

  scope.fetch = async () => { throw new Error('offline'); };
  const offline = await fire(listeners, 'fetch', { request: new Request('https://localhost/build57.js'), method: 'GET' });
  // fetch handler reads event.request.method
  if (!offline.response) throw new Error('no offline response');
  const offlineBody = await offline.response.text();
  if (offlineBody !== 'BUNDLE-FRESH') throw new Error('offline body ' + offlineBody);
  if (stores.size !== 1) throw new Error('cache count ' + stores.size);
}

swUpdatePath().then(() => {
  console.log('PASS update from the revision 4 cache replaces the shell and still serves it offline');
  return behavior();
}).then(() => {
  if (FAIL.length) process.exit(1);
  console.log('b63 r5: update path and behavior checks passed');
}).catch((e) => {
  console.error('FAIL update or behavior', e && e.stack || e);
  process.exit(1);
});

function element(id) {
  const el = {
    id: id || '',
    tagName: 'DIV',
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    open: false,
    className: '',
    dataset: {},
    style: {},
    children: [],
    parentElement: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { if (k === 'id') el.id = v; },
    getAttribute(k) { return k === 'id' ? el.id : ''; },
    addEventListener() {},
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    appendChild(child) { el.children.push(child); child.parentElement = el; return child; },
    insertBefore(child) { return el.appendChild(child); },
    after(child) { if (el.parentElement) el.parentElement.appendChild(child); },
    insertAdjacentHTML() {},
    closest() { return null; },
    showModal() { el.open = true; },
    close() { el.open = false; },
    focus() {},
    click() {},
    getContext() { return new Proxy({}, { get: () => () => ({ width: 0 }) }); },
  };
  return el;
}

async function behavior() {
  await photos();
  await listsAndNotes();
  await sheetLock();
  await activePickers();
}

function fakeIndexedDb() {
  const mem = new Map();
  const api = {
    mem,
    failRead: '',
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            const puts = [];
            const dels = [];
            const tx = {
              objectStore() {
                return {
                  put(rec) { puts.push(rec); },
                  delete(id) { dels.push(id); },
                  get(id) {
                    const request = {};
                    queueMicrotask(() => {
                      request.result = api.failRead && id === api.failRead ? null : (mem.get(id) || null);
                      if (request.onsuccess) request.onsuccess();
                    });
                    return request;
                  },
                  getAllKeys() {
                    const request = {};
                    queueMicrotask(() => {
                      request.result = [...mem.keys()];
                      if (request.onsuccess) request.onsuccess();
                    });
                    return request;
                  },
                };
              },
            };
            queueMicrotask(() => {
              puts.forEach((rec) => mem.set(rec.id, rec));
              dels.forEach((id) => mem.delete(id));
              if (tx.oncomplete) tx.oncomplete();
            });
            return tx;
          },
        };
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
  };
  return api;
}

async function photos() {
  const idb = fakeIndexedDb();
  global.indexedDB = idb;
  delete require.cache[require.resolve(path.join(ROOT, 'media-store.js'))];
  const media = require(path.join(ROOT, 'media-store.js'));
  const ids = media.collectIds({
    plants: [{ id: 'p1', headerPhotoId: 'grow-head', logs: [{ photoId: 'grow-log' }] }],
    breedingPlants: [],
    motherFatherPlants: [{ id: 'm1', headerPhotoId: 'landrace-head', logs: [{ photoId: 'landrace-log' }] }],
    cloneRuns: [{ photoIds: ['run-photo'] }],
    vlogEntries: [{ thumbnailId: 'thumb' }],
  });
  ['grow-head', 'grow-log', 'landrace-head', 'landrace-log', 'run-photo', 'thumb'].forEach((id) => {
    if (!ids.includes(id)) throw new Error('missing ' + id + ' ' + ids.join(','));
  });
  const file = new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'image/jpeg' });
  file.name = 'leaf.jpg';
  const saved = await media.putFile('photo-ok', file);
  if (saved !== 'photo-ok') throw new Error('putFile return');
  const back = await media.getRecord('photo-ok');
  if (!back || !back.blob || back.blob.size !== 4) throw new Error('readback size');
  const other = new Blob([Uint8Array.from([9])], { type: 'image/jpeg' });
  await media.putFile('photo-keep', other);
  idb.failRead = 'photo-bad';
  let threw = false;
  try { await media.putFile('photo-bad', file); } catch (e) { threw = /read back/.test(e.message); }
  if (!threw) throw new Error('failed readback was treated as saved');
  if (!idb.mem.has('photo-bad') || !idb.mem.has('photo-ok') || !idb.mem.has('photo-keep')) throw new Error('failed read deleted a photo');
  console.log('PASS photo readback, failed read keeps ids, mother photos are collected');
}

function bootApp() {
  const store = new Map();
  const byId = {};
  function remember(id) {
    if (!byId[id]) byId[id] = element(id);
    return byId[id];
  }
  const document = {
    readyState: 'complete',
    body: element('body'),
    documentElement: element('html'),
    addEventListener() {},
    removeEventListener() {},
    createElement(tag) { const el = element(''); el.tagName = String(tag || 'div').toUpperCase(); return el; },
    createDocumentFragment() { return { appendChild() {} }; },
    getElementById(id) { if (id === 'tabbar' || id === 'more-view') return null; return remember(id); },
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(sel || '');
      if (m) return remember(m[1]);
      return null;
    },
    querySelectorAll() { return []; },
  };
  document.body.parentElement = document.documentElement;
  const home = remember('home-view');
  home.parentElement = document.body;
  const localStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
  };
  const g = {
    console, document, localStorage,
    setInterval() { return 0; }, setTimeout() { return 0; }, clearInterval() {}, clearTimeout() {},
    requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle() { return { backgroundColor: 'rgb(255,255,255)', display: 'block', position: 'static', overflowY: 'visible', visibility: 'visible', getPropertyValue() { return ''; } }; },
    navigator: { storage: { persist() { return Promise.resolve(false); } } },
    crypto: { randomUUID: () => 'synthetic-uuid', getRandomValues: (a) => { a[0] = 1; return a; } },
    HTMLDialogElement: { prototype: {} },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    Blob, Map, Date, JSON, Math, Number, String, Array, Object, RegExp, Promise, Set, WeakMap,
    parseDate(v) { return v ? new Date(v + 'T12:00:00') : null; },
    b18FmtShort(v) { return v || ''; },
    b18Today() { return '2026-11-07'; },
    b18EvalFor() { return null; },
    B18: { brPage: null },
    B18_VIEWS: {},
    renderPlantDetail() {},
    switchView() {},
    openPlantDetail() {},
    renderBreeding() {},
    b18RenderView() {},
    wRenderSidebar() {},
    showToast() {},
    scrollTo() {},
    innerWidth: 390,
    innerHeight: 844,
    addEventListener() {},
    removeEventListener() {},
    location: { hash: '', protocol: 'https:' },
    plantsRunning() { return 1; },
    getToday() { return new Date('2026-11-07T12:00:00Z'); },
    escapeHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    createSnapshot() {},
    saveState() {},
    getPlantStats() { return { stage: 'Veg' }; },
    inspectionPlants() { return []; },
    getPatients() { return []; },
    formatDate(v) { return v || ''; },
    b18BatchInfo() { return { phase: '' }; },
    openConfirmModal() {},
    quickAction() {},
    pushQuickLog() {},
    renderJournal() {},
    iconSvg() { return ''; },
    elapsedDaysSince() { return 0; },
    openBreedingPlantSheet() {},
    openMfSheet() {},
    editBreedingProject() {},
    detailPlantId() { return ''; },
    detailColl: 'plants',
    activeView: 'home',
  };
  g.window = g;
  g.globalThis = g;
  vm.createContext(g);
  function load(rel) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), g, { filename: rel });
  }
  load('app.js');
  load('build13.js');
  load('build63.js');
  return { g, byId, remember, load, document };
}

async function listsAndNotes() {
  const { g, byId, remember } = bootApp();
  const state = vm.runInContext('state', g);
  state.motherFatherPlants = [
    { id: 'm-live', name: 'Mother Live', role: 'mother', status: 'Active', archived: false },
    { id: 'm-retired', name: 'Mother Retired', role: 'mother', status: 'Retired', archived: false },
    { id: 'm-hide', name: 'Mother Hide', role: 'mother', status: 'Active', archived: false },
    { id: 'f-retired', name: 'Father Retired', role: 'father', status: 'Retired', archived: false },
  ];
  state.plants = [{ id: 'p-shown', name: 'Shown Plant', status: 'active', count: 1, logs: [{ id: 'log-1', notes: 'kept note', date: '2026-01-01' }], notes: 'old note' }];
  state.breedingProjects = [];
  state.settings = { complianceLimits: {} };
  vm.runInContext('selectedPlantId = "p-shown"', g);
  g.B63.configure({ hideIds: ['m-hide'] });
  const before = state.motherFatherPlants.slice();
  g.openPlantModal(null);
  const options = byId['plant-mother'].innerHTML;
  if (!options.includes('Mother Live') || options.includes('Mother Retired') || options.includes('Mother Hide')) throw new Error(options);
  g.openPlantModal({ id: 'p-link', name: 'Linked', status: 'active', motherFatherId: 'm-retired', logs: [] });
  const kept = byId['plant-mother'].innerHTML;
  if (!kept.includes('Mother Retired') || !kept.includes('mf:m-retired')) throw new Error('current retired link dropped');
  if (kept.includes('Mother Hide')) throw new Error('hidden id offered');
  if (state.motherFatherPlants.length !== before.length) throw new Error('records changed');
  const fields = {
    'plant-id': 'p-shown', 'plant-name': 'Shown Plant', 'plant-count': '1', 'plant-source': 'seed',
    'plant-grow-type': 'Photo', 'plant-location': 'Tent', 'plant-start': '2026-01-01', 'plant-veg': '',
    'plant-flip': '', 'plant-flower-start': '', 'plant-veg-days': '0', 'plant-flower-days': '0',
    'plant-notes': 'saved note', 'plant-status': '', 'plant-mother': '', 'plant-mother-name': '',
  };
  Object.keys(fields).forEach((id) => { remember(id).value = fields[id]; });
  remember('plant-form').querySelector = () => null;
  vm.runInContext('selectedPlantId = "p-shown"', g);
  g.savePlantFromForm({ preventDefault() {} });
  const shown = state.plants.find((p) => p.id === 'p-shown');
  if (shown.notes !== 'saved note' || shown.logs[0].notes !== 'kept note') throw new Error(JSON.stringify(shown));
  const panel = byId['profile-panel'].innerHTML;
  if (!panel.includes('saved note') || !panel.includes('kept note')) throw new Error('profile did not refresh');
  g.archivePlant('missing-other');
  if (shown.status !== 'active') throw new Error('archive moved the shown plant');
  console.log('PASS plant picker, notes refresh, and archive guard');
}

async function sheetLock() {
  const listeners = {};
  const dialog = {
    tagName: 'DIALOG',
    open: false,
    isConnected: true,
    className: 'modal',
    contains(node) { return !!(node && node.inside); },
  };
  const body = { style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } };
  const html = {
    classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, contains(c) { return this.s.has(c); } },
    style: { setProperty() {} },
    scrollTop: 0,
  };
  const document = {
    body,
    documentElement: html,
    readyState: 'complete',
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll(sel) { return String(sel).includes('dialog[open]') && dialog.open ? [dialog] : []; },
    getElementById() { return null; },
    createElement() { return { classList: { add() {} }, dataset: {} }; },
  };
  const scrolled = [];
  const g = {
    console, document, state: { plants: [], breedingPlants: [], breedingProjects: [] },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setInterval() { return 0; }, setTimeout(fn) { fn(); return 0; },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle() { return { position: 'static', overflowY: 'visible' }; },
    HTMLDialogElement: { prototype: { showModal() {}, show() {}, close() {} } },
    visualViewport: null,
    innerHeight: 844,
    scrollY: 40,
    scrollTo(x, y) { scrolled.push(y); },
    addEventListener() {},
    B49: null,
    saveState() {},
  };
  g.window = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'build59.js'), 'utf8'), g, { filename: 'build59.js' });
  dialog.open = true;
  g.B59.sync();
  if (!g.B59.isLocked() || body.style.position !== 'fixed' || !html.classList.contains('b59-locked')) throw new Error('open sheet did not lock ' + JSON.stringify(body.style));
  g.scrollTo(0, 0);
  if (scrolled.length) throw new Error('locked page scrolled');
  if (body.dataset.b59y !== '0') throw new Error('saved scroll ' + body.dataset.b59y);
  const move = { touches: [{ clientY: 12 }], target: { inside: false }, cancelable: true, prevented: false, preventDefault() { move.prevented = true; } };
  (listeners.touchmove || []).forEach((fn) => fn(move));
  if (!move.prevented) throw new Error('touch outside the sheet was not cancelled');
  dialog.open = false;
  g.B59.sync();
  if (g.B59.isLocked() || body.style.position || html.classList.contains('b59-locked')) throw new Error('close did not unlock');
  const css = fs.readFileSync(path.join(ROOT, 'build59.css'), 'utf8');
  if (!/dialog\.modal\[open\]\s*\{[^}]*display:\s*flex/.test(css)) throw new Error('open dialog rule missing');
  if (/^dialog\.modal\s*\{[^}]*display:\s*flex/m.test(css)) throw new Error('closed dialogs forced visible');
  const tags = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  if (!/\.tag-top \.m-t \{[^}]*word-break:\s*normal/.test(tags)) throw new Error('tag wrap rule');
  console.log('PASS sheet lock, closed dialog rule, and tag wrap rule');
}

async function activePickers() {
  const { g, byId, load, document } = bootApp();
  const state = vm.runInContext('state', g);
  state.motherFatherPlants = [
    { id: 'm-live', name: 'Mother Live', role: 'mother', status: 'Active', archived: false },
    { id: 'm-retired', name: 'Mother Retired', role: 'mother', status: 'Retired', archived: false },
    { id: 'f-live', name: 'Father Live', role: 'father', status: 'Active', archived: false },
    { id: 'f-retired', name: 'Father Retired', role: 'father', status: 'Retired', archived: false },
  ];
  state.plants = [];
  state.breedingPlants = [];
  state.breedingProjects = [];
  state.cloneRuns = [];
  state.batches = [];
  state.tasks = [];
  state.plans = [];
  state.bredEvals = [];
  state.settings = {};
  state.medicalTransactionLog = { rows: [] };
  g.B63.configure({ hideIds: [] });
  load('build18.js');
  const cands = g.b18Cands('mother').map((c) => c.key);
  if (!cands.includes('mf:m-live') || cands.includes('mf:m-retired')) throw new Error(cands.join(','));
  load('build48.js');
  g.B48.renderDash();
  const dashEl = document.body.children.find((el) => el.id === 'dash-view');
  const dash = dashEl ? dashEl.innerHTML : '';
  if (!dash.includes('1 mother') || !dash.includes('1 pollen donor')) throw new Error(dash);
  if (dash.includes('2 mother') || dash.includes('2 pollen')) throw new Error(dash);
  load('build32.js');
  vm.runInContext('activeView = "calendar32"', g);
  g.b18RenderView('calendar32');
  const cal = byId['calendar32-view'].innerHTML;
  if (!cal.includes('Mother Live') || cal.includes('Mother Retired') || cal.includes('Father Retired')) throw new Error(cal);
  if (!cal.includes('Father Live')) throw new Error(cal);
  g.B32.runDraft = { srcColl: 'mf', srcId: 'm-live', srcMem: '', cuts: 1, rooted: 0, outcomes: [], cutDate: '2026-11-07' };
  g.b18RenderView('run32');
  const run = byId['run32-view'].innerHTML;
  if (!run.includes('Mother Live') || run.includes('Mother Retired')) throw new Error(run);
  load('build35.js');
  const subjects = g.B35.subjects('mother').map((s) => s.id);
  if (!subjects.includes('m-live') || subjects.includes('m-retired')) throw new Error(subjects.join(','));
  console.log('PASS breeding candidates, dashboard count, calendar filter, clone source, and grade subjects');
}
