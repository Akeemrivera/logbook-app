'use strict';
/*
  One matrix around the original renderer. Not an acceptance test.
  A passing row does not replace node scripts/b63-real-mockup.test.js.

  Every case is scripts/b63-real-mockup.js with the packaged-repair
  arguments: tree, p-target, phase after, viewports 390, 1024x768, and
  1024x1366. The 40x50ms boot gate is unchanged. The service worker and
  Cache-Control: no-store stay on.

  baseline uses --factor none and only adds the same observation the other
  rows use: one registration read immediately before each navigation, and
  the script status list after the boot gate.
  mobile keeps the width and height override and forces mobile false, so
  the 390 viewport does not flip mobile from true to false.
  screenshot skips Page.captureScreenshot only.
  fixture skips the boriken-genetics-logbook-v1 injection only.

  Run once from the app root:
    node scripts/b63-renderer-diff.js
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
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
const repair = { repairs: [{ recordId: 'p-target', collection: 'plants', field: 'b49Father', expect: 'dx:FixtureFather' }], undos: [] };
const cases = [
  ['baseline', 'none'],
  ['mobile', 'mobile'],
  ['screenshot', 'screenshot'],
  ['fixture', 'fixture'],
];

function verdict(text) {
  const lines = text.split(/\n/).filter((line) => line.indexOf('DIFF BEFORE ') === 0 || line.indexOf('DIFF BOOT ') === 0 || line.indexOf('DIFF BOOT-FAIL ') === 0 || line.indexOf('DIFF SCRIPTS ') === 0 || line.indexOf('DIFF SCRIPT-FAIL ') === 0 || line.indexOf('DIFF CONTENT ') === 0 || line.indexOf('DIFF SCREENSHOT ') === 0);
  const bootFail = lines.some((line) => line.indexOf('DIFF BOOT-FAIL ') === 0);
  const boots = lines.filter((line) => line.indexOf('DIFF BOOT ') === 0);
  if (!boots.length && !bootFail) return { code: 'NO-OUTPUT', lines: lines };
  return { code: bootFail ? 'BOOT-FAIL' : 'BOOT-OK', lines: lines };
}

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-renderer-diff-'));
  const fixtureFile = path.join(dir, 'fixture.json');
  const repairFile = path.join(dir, 'repair.json');
  fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
  fs.writeFileSync(repairFile, JSON.stringify(repair));
  console.log('DIFF MATRIX original renderer, phase after, tree p-target. NOT_ACCEPTANCE');
  const summary = [];
  let baselineFail = false;
  cases.forEach(([name, factor]) => {
    const outDir = path.join(dir, name);
    fs.mkdirSync(outDir, { recursive: true });
    const started = Date.now();
    const out = spawnSync(process.execPath, [
      'scripts/b63-real-mockup.js',
      '--fixture', fixtureFile,
      '--repair-config', repairFile,
      '--snapshot-date', '2026-11-06',
      '--out', outDir,
      '--screen', 'tree',
      '--record-id', 'p-target',
      '--phase', 'after',
      '--factor', factor,
    ], { cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const text = (out.stdout || '') + '\n' + (out.stderr || '');
    const row = verdict(text);
    if (name === 'baseline' && (row.code !== 'BOOT-OK' || out.status !== 0 || text.indexOf('DIFF CONTENT ') >= 0)) baselineFail = true;
    summary.push(name + '=' + row.code + ' exit=' + out.status + ' ms=' + (Date.now() - started));
    console.log('DIFF CASE ' + name + ' factor=' + factor + ' ' + row.code + ' exit=' + out.status);
    row.lines.forEach((line) => console.log(line));
    if (row.code === 'NO-OUTPUT') console.log((text || '').slice(-800));
  });
  console.log('DIFF SUMMARY ' + summary.join(' | '));
  console.log('NOT_ACCEPTANCE node scripts/b63-real-mockup.test.js remains the regression');
  fs.rmSync(dir, { recursive: true, force: true });
  if (baselineFail) process.exit(1);
}
main();
