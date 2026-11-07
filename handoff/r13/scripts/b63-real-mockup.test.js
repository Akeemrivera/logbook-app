'use strict';
/*
  Generic checks for the private renderer and the packaging script.
  The records here are placeholders for the command shape. They are not a
  user mockup and they are not committed as pictures.
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FAIL = [];
function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { FAIL.push(name); console.error('FAIL', name, e && e.stack || e); process.exit(1); }
}
function run(args, env) {
  return spawnSync(process.execPath, args, { cwd: ROOT, env: Object.assign({}, process.env, env || {}), encoding: 'utf8' });
}
const fixture = {
  plants: [
    { id: 'p-target', name: 'Kept Plant', status: 'active', b49Mother: 'mf:m-arch', b49Father: 'dx:FixtureFather', b58Manual: { m: true, f: true } },
    { id: 'p-dated', name: 'Dated Plant', status: 'active', startDate: '2026-03-01', vegStartDate: '2026-03-20', count: 3, growType: 'Photoperiod', b49Mother: 'mf:m-arch', b49Father: '-', b58Manual: { m: true, f: true } },
    { id: 'p-open', name: 'Undated Plant', status: 'active', b49Mother: 'mf:m1', b49Father: 'mf:f1' },
    { id: 'p-other', name: 'Other Plant', status: 'active', b49Mother: 'mf:m1', b49Father: 'mf:f1' },
    { id: 'p-gone', name: 'History Plant', status: 'active', b49Mother: 'mf:m1', b49Father: 'dx:GenuineHistory', b58DeletedAt: '2026-01-02T00:00:00.000Z', b58Manual: { m: true, f: true } },
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
const repair = {
  repairs: [{ recordId: 'p-target', collection: 'plants', field: 'b49Father', expect: 'dx:FixtureFather' }],
  undos: [],
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-render-test-'));
const fixtureFile = path.join(dir, 'fixture.json');
const repairFile = path.join(dir, 'repair.json');
const secret = 'private-record-id-should-not-print';
fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
fs.writeFileSync(repairFile, JSON.stringify({
  repairs: [{ recordId: secret, collection: 'plants', field: 'b49Father', expect: 'dx:FixtureFather' }],
  undos: [],
}));

check('a missing date is not filled in', () => {
  const api = require('./b63-real-mockup');
  const state = api.readFixture(fixtureFile);
  const open = state.plants.find((plant) => plant.id === 'p-open');
  if (!open || open.startDate || open.vegStartDate || open.growthStage || open.count) throw new Error('the renderer invented a date, stage, or count');
});
check('a required package with no file fails', () => {
  const out = run(['scripts/b63-package-repair.js', '--require', '--root', dir]);
  if (out.status === 0) throw new Error(out.stdout);
});
check('packaging does not print the record id', () => {
  const out = run(['scripts/b63-package-repair.js', '--require', '--file', repairFile, '--root', dir]);
  if (out.status !== 0) throw new Error(out.stderr);
  if ((out.stdout + out.stderr).includes(secret)) throw new Error('id leaked');
  const written = JSON.parse(fs.readFileSync(path.join(dir, 'b63-repair.json'), 'utf8'));
  if (written.repairs[0].recordId !== secret) throw new Error('file was not copied');
  if (!fs.existsSync(path.join(dir, 'www', 'b63-repair.json'))) throw new Error('www missing');
  if (!fs.existsSync(path.join(dir, 'ios', 'App', 'App', 'public', 'b63-repair.json'))) throw new Error('public missing');
});
check('the committed repair file is empty', () => {
  ['b63-repair.json', 'www/b63-repair.json', 'ios/App/App/public/b63-repair.json'].forEach((rel) => {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if ((json.repairs || []).length || (json.undos || []).length) throw new Error(rel + ' is not empty');
  });
});

function shot(extra, allViewports) {
  const outDir = path.join(dir, 'shots-' + extra.filter((x) => !x.startsWith('--')).join('-') + (allViewports ? '-all' : ''));
  const args = ['scripts/b63-real-mockup.js', '--fixture', fixtureFile, '--snapshot-date', '2026-11-06', '--out', outDir];
  if (!allViewports) args.push('--viewport', '390x844');
  const out = run(args.concat(extra));
  return out;
}
check('a tree screen shows the fixture record', () => {
  const out = shot(['--screen', 'tree', '--record-id', 'p-target', '--phase', 'before'], true);
  if (out.status !== 0) throw new Error(out.stderr + out.stdout);
  if (!out.stdout.includes('inner=390x844') || !out.stdout.includes('inner=1024x768') || !out.stdout.includes('inner=1024x1366')) throw new Error(out.stdout);
  if (!out.stdout.includes('zoom=1.28')) throw new Error(out.stdout);
  if (!out.stdout.includes('father=dx:FixtureFather')) throw new Error(out.stdout);
  if (!out.stdout.includes('"nameonly":1') || !out.stdout.includes('"archived":') || !out.stdout.includes('"retired":') || !out.stdout.includes('"culled":')) throw new Error(out.stdout);
  ['nameonly', 'archived', 'retired', 'culled'].forEach((key) => {
    if (out.stdout.includes('"' + key + '":0')) throw new Error(out.stdout);
  });
});
check('a recorded deletion stays labeled deleted', () => {
  const out = shot(['--screen', 'tree', '--record-id', 'p-gone', '--phase', 'before']);
  if (out.status !== 0) throw new Error(out.stderr + out.stdout);
  if (!out.stdout.includes('"deleted":1')) throw new Error(out.stdout);
});
check('the packaged repair clears only that plant father', () => {
  fs.writeFileSync(repairFile, JSON.stringify(repair));
  const out = shot(['--screen', 'tree', '--record-id', 'p-target', '--repair-config', repairFile, '--phase', 'after']);
  if (out.status !== 0) throw new Error(out.stderr + out.stdout);
  if (!out.stdout.includes('father=-')) throw new Error(out.stdout);
});
['plants', 'mf', 'compliance', 'inspection'].forEach((screen) => {
  check(screen + ' renders', () => {
    const extra = ['--screen', screen];
    if (screen === 'plants') extra.push('--record-id', 'p-dated');
    const out = shot(extra);
    if (out.status !== 0) throw new Error(out.stderr + out.stdout);
    if (!out.stdout.includes('PASS screen ' + screen)) throw new Error(out.stdout);
  });
});
check('a missing record fails instead of drawing another page', () => {
  const out = shot(['--screen', 'tree', '--record-id', 'missing-id']);
  if (out.status === 0) throw new Error(out.stdout);
});
fs.rmSync(dir, { recursive: true, force: true });
if (FAIL.length) process.exit(1);
console.log('b63 real mockup: screens and packaging held');
