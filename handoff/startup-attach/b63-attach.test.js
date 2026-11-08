'use strict';
/*
  One variable against the original failing invocation.

  Control runs scripts/b63-real-mockup.js unchanged, with the same fixture,
  screen, record, phase, and default three viewports as the tree check in
  scripts/b63-real-mockup.test.js.

  Treatment runs the same arguments through scripts/b63-attach.js. That file
  is the original renderer plus Target.setAutoAttach on the browser target
  before the viewport loop.

  attach-not-sufficient: both arms stop at "the app did not finish loading".
  attach-sufficient: only the original stops there.
  treatment-boot-fail: the original arm boots and the attach arm does not.
  That result exits 1. It is not an acceptance pass.
  original-did-not-fail: both arms boot the 1024 viewport.
  That result is not a fix. The acceptance test stays
  scripts/b63-real-mockup.test.js.
*/
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HASHES = {
  'scripts/b63-real-mockup.js': '98d3a0c54fb6852e23c922475d7169039aa7392078d17949f6a15cb7770537ac',
  'scripts/b63-real-mockup.test.js': '2f8280d194adb8a81c729637c199a82e07d0a674df5d0bca7e8b61d7b8eb89d5',
  'service-worker.js': '25a422476c95b2155c51991efc0e4f8e635f4c0a1ca28e5aa640de1027717624',
  'build63.css': '8582bbaa8737fe73cf4833f37088b3032bf6fd19401d4e9f755f7138c3382d71',
};

function outcome(status, text) {
  const body = String(text || '');
  if (body.includes('the app did not finish loading')) return 'boot-fail';
  if (status === 0 && body.includes('inner=1024x768')) return 'pass';
  return 'broken';
}
function judge(control, treatment) {
  if (control === 'broken' || treatment === 'broken') return 'incomplete';
  if (treatment === 'boot-fail' && control === 'pass') return 'treatment-boot-fail';
  if (control === 'pass' && treatment === 'pass') return 'original-did-not-fail';
  if (control === 'boot-fail' && treatment === 'boot-fail') return 'attach-not-sufficient';
  if (control === 'boot-fail' && treatment === 'pass') return 'attach-sufficient';
  return 'inconclusive';
}
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e && e.stack || e); process.exit(1); }
}
check('the verdict rules keep the original failure as the control', () => {
  if (judge('boot-fail', 'boot-fail') !== 'attach-not-sufficient') throw new Error('not sufficient');
  if (judge('boot-fail', 'pass') !== 'attach-sufficient') throw new Error('sufficient');
  if (judge('pass', 'pass') !== 'original-did-not-fail') throw new Error('did not fail');
  if (judge('pass', 'boot-fail') !== 'treatment-boot-fail') throw new Error('treatment hidden');
  if (judge('broken', 'pass') !== 'incomplete') throw new Error('incomplete');
});
check('the original renderer, test, service worker, and css are unchanged', () => {
  Object.keys(HASHES).forEach((rel) => {
    const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
    if (got !== HASHES[rel]) throw new Error(rel + ' ' + got);
  });
});

const dates = { startDate: '2024-03-01', vegStartDate: '2024-03-20', flowerStartDate: '2024-05-01', plannedFlipDate: '2024-05-01', flowerFlipDate: '2024-05-01' };
const fixture = {
  plants: [
    { id: 'p-target', name: 'Kept Plant', status: 'active', count: 2, growType: 'Photoperiod', ...dates, b49Mother: 'mf:m-arch', b49Father: 'dx:FixtureFather', b58Manual: { m: true, f: true }, b58DeletedAt: '2024-01-02T00:00:00.000Z' },
    { id: 'p-blank', name: 'Dated Blank', status: 'active', count: 2, ...dates, b49Mother: 'mf:m-arch', b49Father: '-', b58Manual: { m: true, f: true } },
    { id: 'p-proof', name: 'Proof Plant', status: 'active', count: 2, ...dates, b49Mother: 'mf:m1', b49Father: 'dx:Removed Parent', b58Manual: { m: true, f: true }, b58DeletedParents: { f: { key: 'mf:old-father', name: 'Removed Parent', at: '2024-02-02T00:00:00.000Z' } } },
    { id: 'p-open', name: 'Undated Plant', status: 'active', b49Mother: 'mf:m1', b49Father: 'mf:f1' },
  ],
  motherFatherPlants: [
    { id: 'm1', name: 'Kept Mother', role: 'mother', status: 'Active' },
    { id: 'f1', name: 'Kept Father', role: 'father', status: 'Active' },
    { id: 'm-arch', name: 'Archived Mother', role: 'mother', status: 'Active', archived: true, b49Mother: 'mf:m-retired', b49Father: 'mf:f-culled' },
    { id: 'm-retired', name: 'Retired Mother', role: 'mother', status: 'Retired' },
    { id: 'f-culled', name: 'Culled Father', role: 'father', status: 'Culled' },
  ],
  breedingProjects: [
    { id: 'pr1', name: 'Kept Cross', status: 'Active', motherId: 'm1', fatherId: 'f1', mother: 'Kept Mother', father: 'Kept Father' },
  ],
  cloneRuns: [
    { id: 'c1', name: 'Kept Clone', srcId: 'p-other', srcColl: 'plants', status: 'Active' },
  ],
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-attach-'));
const fixtureFile = path.join(dir, 'fixture.json');
fs.writeFileSync(fixtureFile, JSON.stringify(fixture));

function runArm(name, script) {
  const outDir = path.join(dir, name);
  const args = [script, '--fixture', fixtureFile, '--snapshot-date', '2026-11-06', '--screen', 'tree', '--record-id', 'p-target', '--phase', 'before', '--out', outDir];
  console.error('AB run ' + name + ' ' + script);
  const out = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024, timeout: 180000 });
  const text = (out.stderr || '') + (out.stdout || '');
  process.stderr.write(text.endsWith('\n') || !text ? text : text + '\n');
  const result = out.error ? 'broken' : outcome(out.status, text);
  console.error('AB arm ' + name + ' status=' + out.status + ' result=' + result);
  return result;
}

const control = runArm('control', 'scripts/b63-real-mockup.js');
const treatment = runArm('treatment', 'scripts/b63-attach.js');
const verdict = judge(control, treatment);
console.error('AB verdict ' + verdict);
console.log('AB verdict ' + verdict);
if (verdict === 'incomplete' || verdict === 'treatment-boot-fail') {
  console.error('FAIL ' + verdict);
  process.exit(1);
}
console.log('PASS attach experiment recorded ' + verdict);
