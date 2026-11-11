'use strict';
/*
  B-5r2 patcher. Installs the connector / Plants-header / section-label
  stroke fix onto an r10 (PR10 a859acd2 / snap17-tree3-b12r10) tree.

  What it changes (all 3 copies: root, www/, ios/App/App/public/):
    - build60.js  — start/end connector paths just outside each card+text
                    box; zoom-safe SVG mapping; nearest-target for Roots
                    crown; Ceiba canopy sits in the gap under GRANDPARENTS;
                    cubics split around intervening section labels.
    - build63.css — wide Plants header so + Add plant stays on the same
                    row; Ceiba .b57-lab margin-bottom so the canopy has a gap.
    - service-worker.js — CACHE_NAME bump v106 -> v107.

  It does not touch build57.js, the cream tone, the Settings highlight,
  or any test file.

  Usage:
    node patch-b5r2.js --root /path/to/r10-tree
    node patch-b5r2.js --root /path/to/r10-tree --dry
*/
const fs = require('fs');
const path = require('path');
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const SRC = __dirname;
const ROOT = path.resolve(arg('--root', ''));
const DRY = process.argv.includes('--dry');
if (!ROOT || !fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('usage: node patch-b5r2.js --root <r10-tree>');
  process.exit(1);
}
const COPIES = ['', 'www', path.join('ios', 'App', 'App', 'public')];
const FILES = ['build60.js', 'build63.css', 'service-worker.js'];
function sha(p) {
  return require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
let n = 0;
for (const rel of COPIES) {
  const destDir = rel ? path.join(ROOT, rel) : ROOT;
  for (const file of FILES) {
    const from = path.join(SRC, rel, file);
    const to = path.join(destDir, file);
    if (!fs.existsSync(from)) throw new Error('bundle missing ' + path.join(rel, file));
    if (!fs.existsSync(to)) throw new Error('target missing ' + path.join(rel, file));
    const same = fs.readFileSync(from).equals(fs.readFileSync(to));
    console.log((same ? 'SKIP' : (DRY ? 'DRY' : 'WRITE')), path.join(rel || '.', file),
      'from=' + sha(from).slice(0, 12), 'to=' + sha(to).slice(0, 12));
    if (!same && !DRY) { fs.copyFileSync(from, to); n++; }
  }
}
console.log(DRY ? 'dry-run done' : ('patched ' + n + ' files in ' + ROOT));
