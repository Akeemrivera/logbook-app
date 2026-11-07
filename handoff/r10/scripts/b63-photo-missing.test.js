'use strict';
/*
  Existing photo export regression. Synthetic ids only.
  Three referenced photos have no stored bytes. The real backup builder must
  refuse the file. It must not drop those ids, delete stored bytes, or mark
  the backup done. This does not add an incomplete-backup export.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const FAIL = [];
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { FAIL.push(name); console.error('FAIL', name, e && e.stack || e); process.exit(1); }
}

global.FileReader = class {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(buf).toString('base64');
      if (this.onload) this.onload();
    }).catch((error) => { this.error = error; if (this.onerror) this.onerror(); });
  }
};

function fakeIndexedDb() {
  const mem = new Map();
  const api = {
    mem,
    deleted: [],
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
                      request.result = mem.get(id) || null;
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
              dels.forEach((id) => { mem.delete(id); api.deleted.push(id); });
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

function element(id) {
  return {
    id: id || '',
    tagName: 'DIV',
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: true,
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {},
    getAttribute() { return ''; },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

async function main() {
  const idb = fakeIndexedDb();
  global.indexedDB = idb;
  const mediaPath = path.join(ROOT, 'media-store.js');
  delete require.cache[require.resolve(mediaPath)];
  const media = require(mediaPath);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await media.putDataUrl('syn-ok', 'data:image/png;base64,' + png.toString('base64'));
  const byId = {};
  function remember(id) { if (!byId[id]) byId[id] = element(id); return byId[id]; }
  const document = {
    readyState: 'complete',
    body: element('body'),
    documentElement: element('html'),
    addEventListener() {},
    createElement() { return element(''); },
    getElementById(id) { return remember(id); },
    querySelector(sel) { const m = /^#([\w-]+)$/.exec(sel || ''); return m ? remember(m[1]) : null; },
    querySelectorAll() { return []; },
  };
  const calls = [];
  const g = {
    console, document,
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setInterval() { return 0; }, setTimeout() { return 0; }, clearInterval() {}, clearTimeout() {},
    requestAnimationFrame() { return 0; },
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
    MutationObserver: class { observe() {} disconnect() {} },
    navigator: { storage: { persist() { return Promise.resolve(false); } } },
    crypto: { randomUUID: () => 'syn-uuid' },
    URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    Blob, Map, Date, JSON, Math, Number, String, Array, Object, RegExp, Promise, Set,
    location: { hash: '', protocol: 'https:' },
    addEventListener() {},
    BorikenMedia: media,
    markBackupExported() { g.__marked = true; },
    shareFile(name) { calls.push(name); return Promise.resolve('shared'); },
  };
  g.window = g;
  g.globalThis = g;
  vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), g, { filename: 'app.js' });
  g.shareFile = (name) => { calls.push(name); return Promise.resolve('shared'); };
  g.markBackupExported = () => { g.__marked = true; };
  const state = vm.runInContext('state', g);
  state.plants = [{
    id: 'syn-plant', name: 'Synthetic', status: 'active', count: 1, logs: [
      { id: 'log-ok', notes: 'kept note', date: '2026-01-01', photoId: 'syn-ok' },
      { id: 'log-1', notes: 'one', date: '2026-01-02', photoId: 'syn-miss-1' },
      { id: 'log-2', notes: 'two', date: '2026-01-03', photoId: 'syn-miss-2' },
      { id: 'log-3', notes: 'three', date: '2026-01-04', photoId: 'syn-miss-3' },
    ],
  }];
  state.breedingPlants = [];
  state.motherFatherPlants = [];
  state.vlogEntries = [];
  state.cloneRuns = [];
  const before = JSON.stringify(state);
  let caught = null;
  try { await g.buildFullBackupPayload(); }
  catch (error) { caught = error; }
  check('three unreadable photos abort before a file exists', () => {
    if (!caught) throw new Error('payload was returned');
    if (caught.message !== '3 photos could not be read from on-device storage, so the backup was not saved.') throw new Error(caught.message);
    const missing = (caught.missing || []).slice().sort();
    if (JSON.stringify(missing) !== JSON.stringify(['syn-miss-1', 'syn-miss-2', 'syn-miss-3'])) throw new Error(missing.join(','));
  });
  check('the abort keeps the records, the stored photo, and does not delete ids', () => {
    if (JSON.stringify(state) !== before) throw new Error('state changed');
    if (!idb.mem.has('syn-ok') || idb.deleted.length) throw new Error('storage changed ' + idb.deleted.join(','));
  });
  g.__marked = false;
  await g.exportJSON();
  check('Backup JSON shows the abort and does not share or mark success', () => {
    if (calls.length) throw new Error('share called ' + calls.join(','));
    if (g.__marked) throw new Error('marked exported');
    const shown = byId['storage-error'] && byId['storage-error'].textContent;
    if (shown !== '3 photos could not be read from on-device storage, so the backup was not saved.') throw new Error(shown);
  });
  state.plants[0].logs = state.plants[0].logs.filter((log) => log.photoId === 'syn-ok');
  const ok = await g.buildFullBackupPayload();
  check('the same builder saves when every referenced photo can be read', () => {
    if (!ok.photos || ok.photos.length !== 1 || ok.photos[0].id !== 'syn-ok' || !String(ok.photos[0].dataUrl).startsWith('data:image/png;base64,')) throw new Error(JSON.stringify(ok.photos));
    if (ok.photos[0].dataUrl.includes('syn-miss')) throw new Error('missing id leaked');
  });
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  check('revision 5 cache name does not change this export path', () => {
    if (!sw.includes("boriken-genetics-logbook-app-v83")) throw new Error('worker');
    const fn = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    const start = fn.indexOf('async function buildFullBackupPayload');
    const body = fn.slice(start, fn.indexOf('function snapshotCounts'));
    if (!body.includes('exported.missing.length') || body.includes('photoStatus')) throw new Error('export contract changed');
  });
  console.log('b63 photo missing: existing abort held');
}

main().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
