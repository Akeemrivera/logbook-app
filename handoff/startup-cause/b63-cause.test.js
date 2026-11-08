'use strict';
/*
  One controlled experiment for the second-viewport startup failure.
  Hypothesis: the failure requires the viewport change that the original
  loop applies immediately before the second Page.navigate.
  Control keeps that change. Hold repeats the first viewport's metrics in
  the same call. No command is inserted between the metrics call and navigation.

  Rejected: the held second viewport still fails its scripts with no response
  event and no server record.
  Supported: the control second viewport fails that way and the held one boots
  with a response for every script.
  Not-reproduced: the control second viewport does not fail that way.
  A not-reproduced result is not a fix. The original acceptance test is
  scripts/b63-real-mockup.test.js and is not changed here.
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

function parseSummary(line) {
  const out = {};
  line.replace(/^CAUSE summary /, '').split(' ').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  });
  return out;
}
function summaries(text) {
  return String(text || '').split(/\n/).filter((line) => line.indexOf('CAUSE summary ') === 0).map(parseSummary);
}
function signature(row) {
  if (!row || row.boot !== 'fail') return false;
  const failed = Number(row.scriptFail);
  return failed > 0 && row.responseAbsent === row.scriptFail && row.serverNone === row.scriptFail;
}
function cleared(row) {
  return !!row && row.boot === 'ok' && Number(row.scriptFail) === 0 && Number(row.scriptSent) > 0 && Number(row.responseAbsent) === 0;
}
function judge(controlText, holdText) {
  const control = summaries(controlText).find((row) => row.viewport === '1024x768');
  const hold = summaries(holdText).find((row) => row.viewport === '1024x768');
  if (!control || !hold) return 'incomplete';
  if (!signature(control)) return 'not-reproduced';
  if (signature(hold)) return 'rejected';
  if (cleared(hold)) return 'supported';
  return 'inconclusive';
}

function check(name, fn) {
  try { fn(); console.log('PASS', name); }
  catch (e) { console.error('FAIL', name, e && e.stack || e); process.exit(1); }
}

check('the verdict rules match the recorded failure shape', () => {
  const fail = 'CAUSE summary arm=control viewport=1024x768 boot=fail scriptSent=40 scriptFail=40 responseAbsent=40 serverNone=40';
  const pass = 'CAUSE summary arm=hold viewport=1024x768 boot=ok scriptSent=40 scriptFail=0 responseAbsent=0 serverNone=0';
  const other = 'CAUSE summary arm=hold viewport=1024x768 boot=fail scriptSent=40 scriptFail=4 responseAbsent=0 serverNone=4';
  if (judge(fail, pass) !== 'supported') throw new Error('supported');
  if (judge(fail, fail) !== 'rejected') throw new Error('rejected');
  if (judge(pass, pass) !== 'not-reproduced') throw new Error('not-reproduced');
  if (judge(fail, other) !== 'inconclusive') throw new Error('inconclusive');
  if (judge(fail, '') !== 'incomplete') throw new Error('incomplete');
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
  ],
  motherFatherPlants: [
    { id: 'm-arch', name: 'Archived Mother', role: 'mother', status: 'Active', archived: true, b49Mother: 'mf:m-retired', b49Father: 'mf:f-culled' },
    { id: 'm-retired', name: 'Retired Mother', role: 'mother', status: 'Retired' },
    { id: 'f-culled', name: 'Culled Father', role: 'father', status: 'Culled' },
  ],
  breedingProjects: [],
  cloneRuns: [],
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-cause-'));
const fixtureFile = path.join(dir, 'fixture.json');
fs.writeFileSync(fixtureFile, JSON.stringify(fixture));

function runArm(name, extra) {
  const outDir = path.join(dir, name);
  const args = ['scripts/b63-cause.js', '--fixture', fixtureFile, '--snapshot-date', '2026-11-06', '--screen', 'tree', '--record-id', 'p-target', '--phase', 'before', '--viewport', '390x844,1024x768', '--out', outDir].concat(extra || []);
  console.error('CAUSE run ' + name);
  const out = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 32 * 1024 * 1024 });
  const text = (out.stderr || '') + (out.stdout || '');
  process.stderr.write(text);
  return { status: out.status, text: text };
}

console.error('CAUSE hypothesis viewport-change-before-navigate');
console.error('CAUSE reject-if hold 1024x768 still has scriptFail>0 responseAbsent=scriptFail serverNone=scriptFail');
console.error('CAUSE support-if control has that shape and hold boots with responseAbsent=0');
console.error('CAUSE clientSeenBeforeScripts is whether any worker version listed this page at or before the first script');
console.error('CAUSE lastClientBeforeScripts is only the latest of those version events');
console.error('CAUSE postLoadController is only the boot poll after the load attempt');
console.error('CAUSE a service-worker.js request time is not a controller observation');
const control = runArm('control');
const hold = runArm('hold', ['--hold-metrics']);
const verdict = judge(control.text, hold.text);
console.error('CAUSE verdict ' + verdict);
console.log('CAUSE verdict ' + verdict);
if (verdict === 'incomplete') {
  console.error('FAIL the experiment did not record both second viewports');
  process.exit(1);
}
console.log('PASS causal experiment recorded ' + verdict);
