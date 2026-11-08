'use strict';
/*
  One capture of the original tree invocation: the same fixture, screen,
  record, phase, and default three viewports as scripts/b63-real-mockup.test.js.
  The acceptance renderer, test, service worker, and CSS are not this file.
  A boot failure exits nonzero after the capture record is flushed.
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
function emit(line) { fs.writeSync(1, line + '\n'); }
function emitErr(line) { fs.writeSync(2, line + '\n'); }
Object.keys(HASHES).forEach((rel) => {
  const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
  if (got !== HASHES[rel]) {
    emitErr('FAIL ' + rel + ' changed ' + got);
    process.exit(1);
  }
});
emit('PASS original renderer, test, service worker, and css are unchanged');
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-capture-'));
const fixtureFile = path.join(dir, 'fixture.json');
fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
const outDir = path.join(dir, 'shots');
const out = spawnSync(process.execPath, ['scripts/b63-capture.js', '--fixture', fixtureFile, '--snapshot-date', '2026-11-06', '--screen', 'tree', '--record-id', 'p-target', '--phase', 'before', '--out', outDir], {
  cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024, timeout: 180000,
});
if (out.stdout) fs.writeSync(1, out.stdout.endsWith('\n') ? out.stdout : out.stdout + '\n');
if (out.stderr) fs.writeSync(2, out.stderr.endsWith('\n') ? out.stderr : out.stderr + '\n');
const text = (out.stderr || '') + (out.stdout || '');
if (!text.includes('CAPTURE summary viewport=390x844') || !text.includes('CAPTURE script ')) {
  emitErr('FAIL capture record missing');
  process.exit(1);
}
if (out.status !== 0) {
  emitErr('FAIL boot status=' + out.status);
  process.exit(out.status || 1);
}
emit('PASS capture booted. This is not a fix.');
