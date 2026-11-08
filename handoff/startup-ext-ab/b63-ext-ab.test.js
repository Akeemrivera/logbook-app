'use strict';
/*
  Baseline runs the unchanged renderer. Treatment runs the same viewport
  loop with --disable-extensions and
  --disable-component-extensions-with-background-pages on that Chrome
  process only. Both use the original tree fixture and the default three
  viewports. Targets are read from the debug port the renderer already
  opens. This does not change the service worker or the acceptance test.
*/
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const HASHES = {
  'scripts/b63-real-mockup.js': '98d3a0c54fb6852e23c922475d7169039aa7392078d17949f6a15cb7770537ac',
  'scripts/b63-real-mockup.test.js': '2f8280d194adb8a81c729637c199a82e07d0a674df5d0bca7e8b61d7b8eb89d5',
  'service-worker.js': '25a422476c95b2155c51991efc0e4f8e635f4c0a1ca28e5aa640de1027717624',
  'build63.css': '8582bbaa8737fe73cf4833f37088b3032bf6fd19401d4e9f755f7138c3382d71',
};
function emit(line) { fs.writeSync(1, line + '\n'); }
function emitErr(line) { fs.writeSync(2, line + '\n'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
Object.keys(HASHES).forEach((rel) => {
  const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
  if (got !== HASHES[rel]) { emitErr('FAIL ' + rel + ' changed'); process.exit(1); }
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-ext-ab-'));
const fixtureFile = path.join(dir, 'fixture.json');
fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
function debugPort(pid, seen) {
  if (!pid || seen.has(pid)) return 0;
  seen.add(pid);
  let cmd = '';
  try { cmd = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8'); } catch (e) { return 0; }
  const match = /--remote-debugging-port=(\d+)/.exec(cmd);
  if (match) return Number(match[1]);
  let children = '';
  try { children = fs.readFileSync('/proc/' + pid + '/task/' + pid + '/children', 'utf8'); } catch (e) { return 0; }
  for (const child of children.trim().split(/\s+/).filter(Boolean)) {
    const found = debugPort(Number(child), seen);
    if (found) return found;
  }
  return 0;
}
function bootOf(status, text) {
  const body = String(text || '');
  if (body.includes('the app did not finish loading')) return 'fail';
  if (status === 0 && body.includes('inner=390x844') && body.includes('inner=1024x768') && body.includes('inner=1024x1366')) return 'pass';
  return 'broken';
}
function runArm(name, script) {
  const outDir = path.join(dir, name);
  const args = [script, '--fixture', fixtureFile, '--snapshot-date', '2026-11-06', '--screen', 'tree', '--record-id', 'p-target', '--phase', 'before', '--out', outDir];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env });
    let stdout = '';
    let stderr = '';
    const targets = new Map();
    let lists = 0;
    child.stdout.on('data', (buf) => { stdout += buf; });
    child.stderr.on('data', (buf) => { stderr += buf; });
    const timer = setInterval(async () => {
      const port = debugPort(child.pid, new Set());
      if (!port) return;
      try {
        const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        lists += 1;
        list.forEach((target) => targets.set((target.type || '') + ' ' + (target.url || ''), target.type || ''));
      } catch (e) { /* the port is not open yet */ }
    }, 200);
    child.on('close', (status) => {
      clearInterval(timer);
      resolve({ status, text: stdout + stderr, targets, lists });
    });
  });
}
function extensionsOf(targets) {
  return [...targets.keys()].filter((key) => key.indexOf('chrome-extension://') >= 0);
}
(async () => {
  const baseline = await runArm('baseline', 'scripts/b63-real-mockup.js');
  const treatment = await runArm('treatment', 'scripts/b63-ext-off.js');
  const baseBoot = bootOf(baseline.status, baseline.text);
  const treatBoot = bootOf(treatment.status, treatment.text);
  const baseExt = extensionsOf(baseline.targets);
  const treatExt = extensionsOf(treatment.targets);
  emit('AB baseline boot=' + baseBoot + ' extensionTargets=' + baseExt.length + ' lists=' + baseline.lists);
  baseExt.forEach((key) => emit('AB baseline target ' + key));
  emit('AB treatment boot=' + treatBoot + ' extensionTargets=' + treatExt.length + ' lists=' + treatment.lists);
  treatExt.forEach((key) => emit('AB treatment target ' + key));
  if (baseline.text) fs.writeSync(1, baseline.text.endsWith('\n') ? baseline.text : baseline.text + '\n');
  if (treatment.text) fs.writeSync(1, treatment.text.endsWith('\n') ? treatment.text : treatment.text + '\n');
  if (!baseline.lists || !treatment.lists || baseBoot !== 'pass' || treatBoot !== 'pass' || treatExt.length) {
    emitErr('FAIL baseline=' + baseBoot + ' treatment=' + treatBoot + ' treatmentExtensions=' + treatExt.length + ' lists=' + baseline.lists + ',' + treatment.lists);
    process.exit(1);
  }
  emit('PASS both arms booted and the treatment profile had no extension targets. This is a harness flag comparison, not an application change.');
})().catch((e) => {
  emitErr('FAIL ' + (e && e.message ? e.message : e));
  process.exit(1);
});
