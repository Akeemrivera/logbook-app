'use strict';
/*
  Exactly three pairs of the existing extension comparison.
  Every pair is kept. A later pass does not erase an earlier failure.
  Rules, decided before the runs:
    abandon-extension-claim: a treatment with zero extension targets fails to boot.
    harness-candidate: all three baselines fail and all three treatments boot with zero extension targets.
    not-reproduced: all six boots pass.
    inconclusive: any other complete pattern.
  A harness-candidate is not applied here. The service worker stays unchanged.
*/
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function emit(line) { fs.writeSync(1, line + '\n'); }
function emitErr(line) { fs.writeSync(2, line + '\n'); }
function judge(pairs) {
  if (pairs.some((pair) => pair.baseBoot === 'broken' || pair.treatBoot === 'broken' || pair.baseLists === 0 || pair.treatLists === 0)) return 'incomplete';
  if (pairs.some((pair) => pair.treatExt > 0)) return 'isolation-incomplete';
  if (pairs.some((pair) => pair.treatBoot === 'fail')) return 'abandon-extension-claim';
  if (pairs.every((pair) => pair.baseBoot === 'fail' && pair.treatBoot === 'pass' && pair.treatExt === 0)) return 'harness-candidate';
  if (pairs.every((pair) => pair.baseBoot === 'pass' && pair.treatBoot === 'pass')) return 'not-reproduced';
  return 'inconclusive';
}
function check(name, ok) {
  if (!ok) { emitErr('FAIL ' + name); process.exit(1); }
  emit('PASS ' + name);
}
check('three baseline failures and three clean treatment passes are a harness candidate', judge([
  { baseBoot: 'fail', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'fail', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'fail', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
]) === 'harness-candidate');
check('one clean treatment failure abandons the extension claim', judge([
  { baseBoot: 'fail', treatBoot: 'fail', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'fail', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'pass', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
]) === 'abandon-extension-claim');
check('six passes are not reproduced', judge([
  { baseBoot: 'pass', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'pass', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'pass', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
]) === 'not-reproduced');
check('one baseline failure is inconclusive', judge([
  { baseBoot: 'fail', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'pass', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
  { baseBoot: 'pass', treatBoot: 'pass', baseLists: 1, treatLists: 1, treatExt: 0 },
]) === 'inconclusive');
function parse(text) {
  const lines = String(text || '').split(/\n/);
  const baseline = lines.find((line) => line.startsWith('AB baseline boot='));
  const treatment = lines.find((line) => line.startsWith('AB treatment boot='));
  if (!baseline || !treatment) return null;
  const field = (line, name) => {
    const match = new RegExp(name + '=(\\S+)').exec(line);
    return match ? match[1] : '';
  };
  return {
    baseBoot: field(baseline, 'boot'),
    baseExt: Number(field(baseline, 'extensionTargets')),
    baseLists: Number(field(baseline, 'lists')),
    treatBoot: field(treatment, 'boot'),
    treatExt: Number(field(treatment, 'extensionTargets')),
    treatLists: Number(field(treatment, 'lists')),
  };
}
const pairs = [];
for (let i = 1; i <= 3; i++) {
  emit('REPEAT pair ' + i);
  const out = spawnSync(process.execPath, ['scripts/b63-ext-ab.test.js'], { cwd: ROOT, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024, timeout: 180000 });
  const text = (out.stdout || '') + (out.stderr || '');
  fs.writeSync(1, text.endsWith('\n') || !text ? text : text + '\n');
  const pair = parse(text);
  if (!pair) {
    emitErr('FAIL pair ' + i + ' missing AB lines status=' + out.status);
    process.exit(1);
  }
  pairs.push(pair);
  emit('REPEAT pair ' + i + ' baseline=' + pair.baseBoot + ' extensions=' + pair.baseExt + ' treatment=' + pair.treatBoot + ' extensions=' + pair.treatExt);
}
const verdict = judge(pairs);
emit('REPEAT verdict ' + verdict);
emit('REPEAT service-worker-unchanged acceptance=node scripts/b63-real-mockup.test.js');
if (verdict === 'incomplete' || verdict === 'isolation-incomplete') process.exit(1);
if (verdict !== 'not-reproduced') process.exit(1);
emit('PASS three pairs completed. not-reproduced is not a fix.');
