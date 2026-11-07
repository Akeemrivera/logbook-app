'use strict';
/*
  TEST FIXTURE. Not a user mockup and not a shipped record.
  One configured record id may have its father reference cleared to unknown
  when the current value still matches the expected old value. No row is deleted.
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
function element(id) {
  return {
    id: id || '', innerHTML: '', textContent: '', value: '', hidden: false, dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return ''; }, addEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    getClientRects() { return []; },
  };
}
const byId = {};
function remember(id) { if (!byId[id]) byId[id] = element(id); return byId[id]; }
const document = {
  readyState: 'complete', body: element('body'), documentElement: element('html'),
  addEventListener() {}, createElement() { return element(''); },
  getElementById(id) { return remember(id); },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  elementFromPoint() { return null; },
};
const store = new Map();
const g = {
  console, document,
  localStorage: { getItem(k) { return store.has(k) ? store.get(k) : null; }, setItem(k, v) { store.set(k, String(v)); }, removeItem(k) { store.delete(k); } },
  setInterval() { return 0; }, setTimeout(fn) { if (typeof fn === 'function') fn(); return 0; }, clearInterval() {}, clearTimeout() {},
  requestAnimationFrame() { return 0; },
  matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  MutationObserver: class { observe() {} disconnect() {} },
  navigator: { storage: { persist() { return Promise.resolve(false); } } },
  crypto: { randomUUID: () => 'syn-uuid' },
  getComputedStyle() { return { visibility: 'visible' }; },
  innerWidth: 390,
  URL, Blob, Map, Date, JSON, Math, Number, String, Array, Object, RegExp, Promise, Set,
  location: { hash: '', protocol: 'https:' },
  addEventListener() {},
  b18ProjParent() { return { key: '', name: '' }; },
  b18FmtShort(d) { return d || ''; },
  b18BrPageHtml() { return ''; },
  escapeHtml(s) { return String(s == null ? '' : s); },
};
g.window = g;
g.globalThis = g;
vm.createContext(g);
['app.js', 'build49.js', 'build58.js', 'build13.js', 'build63.js'].forEach((name) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, name), 'utf8'), g, { filename: name });
});

function plant(extra) {
  return Object.assign({
    id: extra.id, name: extra.name, role: extra.role || 'mother', status: 'Active', archived: false,
    cuttings: [], pollen: [], b49Mother: extra.b49Mother || 'mf:kept-mother', b49Father: extra.b49Father,
    source: extra.source || '', crossLabel: extra.crossLabel || '',
  }, extra.manual ? { b58Manual: extra.manual } : {});
}

function readState() { return vm.runInContext('state', g); }
vm.runInContext('state.motherFatherPlants = ' + JSON.stringify([
  plant({ id: 'kept-mother', name: 'Kept Mother', role: 'mother', b49Mother: '', b49Father: '' }),
  plant({ id: 'affected', name: 'Kept Line', b49Father: 'dx:FixtureFather', source: 'Kept Mother × FixtureFather' }),
  plant({ id: 'same-text-other', name: 'Other Line', b49Father: 'dx:FixtureFather' }),
  plant({ id: 'genuine-dx', name: 'History Line', b49Father: 'dx:GenuineHistory' }),
  plant({ id: 'real-father-row', name: 'FixtureFather', role: 'father', b49Father: 'mf:older' }),
  plant({ id: 'changed-father', name: 'Changed Line', b49Father: 'mf:real-father' }),
]) + '; state.breedingProjects = ' + JSON.stringify([
  { id: 'kept-cross', name: 'Kept Cross', motherId: 'kept-mother', fatherId: 'real-father-row', mother: 'Kept Mother', father: 'FixtureFather', status: 'Active' },
]) + '; state.plants = ' + JSON.stringify([
  { id: 'grow-kept', name: 'Kept Grow', status: 'active', count: 2, logs: [], b49Mother: 'mf:kept-mother', b49Father: 'mf:real-father-row' },
]), g);
const beforeOthers = JSON.stringify({
  other: readState().motherFatherPlants.filter((r) => r.id !== 'affected'),
  projects: readState().breedingProjects,
  plants: readState().plants,
});

store.set('boriken-b63-repair', JSON.stringify({
  repairs: [{ recordId: 'affected', collection: 'motherFatherPlants', field: 'b49Father', expect: 'dx:FixtureFather' }],
}));
let out = g.B63.runStoredRepairs();
const affected = () => readState().motherFatherPlants.find((r) => r.id === 'affected');
const parents = () => g.B49.par('mf:affected');

check('the configured record father becomes unknown and the old text is gone', () => {
  if (!out.applied.length) throw new Error(JSON.stringify(out));
  if (affected().b49Father !== '-') throw new Error(affected().b49Father);
  if (affected().b58Manual.f !== true) throw new Error(JSON.stringify(affected().b58Manual));
  if (affected().b49Mother !== 'mf:kept-mother') throw new Error(affected().b49Mother);
  if (affected().source !== 'Kept Mother × FixtureFather') throw new Error('another field changed');
  const shown = parents();
  if (!shown || shown[0] !== 'mf:kept-mother' || shown[1] !== '') throw new Error(JSON.stringify(shown));
  if (String(shown[1]).includes('FixtureFather') || affected().b49Father.includes('FixtureFather')) throw new Error(JSON.stringify(shown));
});

check('other records, the real same-name row, genuine dx history, and the cross stay', () => {
  const now = JSON.stringify({
    other: readState().motherFatherPlants.filter((r) => r.id !== 'affected'),
    projects: readState().breedingProjects,
    plants: readState().plants,
  });
  if (now !== beforeOthers) throw new Error(now);
  const names = readState().motherFatherPlants.map((r) => r.id + ':' + r.name);
  if (!names.includes('real-father-row:FixtureFather')) throw new Error(names.join(','));
  if (readState().motherFatherPlants.find((r) => r.id === 'genuine-dx').b49Father !== 'dx:GenuineHistory') throw new Error('genuine dx');
  if (readState().breedingProjects[0].father !== 'FixtureFather') throw new Error('cross rewritten');
});

check('a different current father is a no-op', () => {
  const rec = readState().motherFatherPlants.find((r) => r.id === 'changed-father');
  const snap = JSON.stringify(rec);
  store.set('boriken-b63-repair', JSON.stringify({
    repairs: [{ recordId: 'changed-father', collection: 'motherFatherPlants', field: 'b49Father', expect: 'dx:FixtureFather' }],
  }));
  const again = g.B63.runStoredRepairs();
  if (again.applied.length || JSON.stringify(rec) !== snap) throw new Error(JSON.stringify(again));
});

check('a second launch does not write again', () => {
  store.set('boriken-b63-repair', JSON.stringify({
    repairs: [{ recordId: 'affected', collection: 'motherFatherPlants', field: 'b49Father', expect: 'dx:FixtureFather' }],
  }));
  const logBefore = store.get('boriken-b63-repair-undo');
  const again = g.B63.runStoredRepairs();
  if (again.applied.length) throw new Error(JSON.stringify(again));
  if (store.get('boriken-b63-repair-undo') !== logBefore) throw new Error('undo log grew');
  if (affected().b49Father !== '-') throw new Error(affected().b49Father);
});

check('migration does not put the old father reference back', () => {
  affected().b58Mig = 0;
  g.B58.migrate();
  if (affected().b49Father !== '-') throw new Error(affected().b49Father);
  if (affected().b49Father.includes('FixtureFather')) throw new Error(affected().b49Father);
  const shown = parents();
  if (!shown || shown[1] !== '') throw new Error(JSON.stringify(shown));
});

check('undo restores only that field and a later father change blocks undo', () => {
  store.set('boriken-b63-repair', JSON.stringify({
    undos: [{ recordId: 'affected', collection: 'motherFatherPlants', field: 'b49Father' }],
  }));
  const undone = g.B63.runStoredRepairs();
  if (!undone.undos.length || affected().b49Father !== 'dx:FixtureFather') throw new Error(JSON.stringify(affected()));
  affected().b49Father = 'mf:real-father';
  const blocked = g.B63.runStoredRepairs();
  if (blocked.undos.length || affected().b49Father !== 'mf:real-father') throw new Error(JSON.stringify(blocked));
});

check('reload does not insert a sample plant', () => {
  const saved = JSON.stringify(readState());
  vm.runInContext('state = normalizeState(JSON.parse(' + JSON.stringify(saved) + '))', g);
  g.mfSeedStarters();
  const reloaded = vm.runInContext('state', g);
  if (reloaded.motherFatherPlants.some((r) => r.id === 'syn-uuid' || r.name === 'Synthetic Sample Mother')) throw new Error('sample inserted');
  if (!reloaded.motherFatherPlants.some((r) => r.id === 'real-father-row' && r.name === 'FixtureFather')) throw new Error('real row missing');
});

if (FAIL.length) process.exit(1);
console.log('b63 father repair: guarded reference clear held');
