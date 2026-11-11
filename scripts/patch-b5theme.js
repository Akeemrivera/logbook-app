'use strict';
/*
  B-5 theme-match patcher. Lands the approved sidebar theme rules
  (cream/white in light, #111 in dark) into a B-5r2 tree.

  Base: PR10 commit f3b8cb38 (= B-5r2 / snap17-tree3-b5r2 after the
  connector + Plants-header + section-label pass). That state has
  service-worker CACHE_NAME v107 and build63.css without these rules
  (sha 69c9cb44b996ff5cad2fc20a6840e0f1a184a372899ea6b60fcdb5c68064ee82).

  What it changes (all 3 copies: root, www/, ios/App/App/public/):
    - build63.css — appends the exact b5-theme-match.css rules so the
      sidebar follows setThemePref / data-theme. Values are unchanged.
    - service-worker.js — CACHE_NAME bump v107 -> v108.
      build63.css is already in the precache list; no new file is added.

  It does not touch build60.js, build57.js, the cream tone, the Settings
  highlight, card text, tree design, or any test file.

  Usage:
    node patch-b5theme.js --root /path/to/b5r2-tree
    node patch-b5theme.js --root /path/to/b5r2-tree --dry
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const SRC = __dirname;
const ROOT = path.resolve(arg('--root', ''));
const DRY = process.argv.includes('--dry');
if (!ROOT || !fs.existsSync(path.join(ROOT, 'index.html'))) {
  console.error('usage: node patch-b5theme.js --root <b5r2-tree>');
  process.exit(1);
}
const COPIES = ['', 'www', path.join('ios', 'App', 'App', 'public')];
const FILES = ['build63.css', 'service-worker.js'];
const EXPECT = {
  'build63.css': '69c9cb44b996ff5cad2fc20a6840e0f1a184a372899ea6b60fcdb5c68064ee82',
  'service-worker.js': 'bb9b0a0d553c0de5278817be08c697e58f2202fb634ecc89c670137f03a29e0b',
};
function sha(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
for (const rel of COPIES) {
  const destDir = rel ? path.join(ROOT, rel) : ROOT;
  for (const file of FILES) {
    const to = path.join(destDir, file);
    if (!fs.existsSync(to)) throw new Error('target missing ' + path.join(rel, file));
    const got = sha(to);
    const from = path.join(SRC, rel, file);
    const wantNew = sha(from);
    if (got !== EXPECT[file] && got !== wantNew) {
      console.error('refusing: ' + path.join(rel || '.', file) +
        ' is not the B-5r2 / f3b8cb38 (v107) file or this patch.');
      console.error('  have=' + got);
      console.error('  expected b5r2=' + EXPECT[file] + ' or patched=' + wantNew);
      process.exit(2);
    }
  }
}
let n = 0;
for (const rel of COPIES) {
  const destDir = rel ? path.join(ROOT, rel) : ROOT;
  for (const file of FILES) {
    const from = path.join(SRC, rel, file);
    const to = path.join(destDir, file);
    if (!fs.existsSync(from)) throw new Error('bundle missing ' + path.join(rel, file));
    const same = fs.readFileSync(from).equals(fs.readFileSync(to));
    console.log((same ? 'SKIP' : (DRY ? 'DRY' : 'WRITE')), path.join(rel || '.', file),
      'from=' + sha(from).slice(0, 12), 'to=' + sha(to).slice(0, 12));
    if (!same && !DRY) { fs.copyFileSync(from, to); n++; }
  }
}
console.log(DRY ? 'dry-run done' : ('patched ' + n + ' files in ' + ROOT));
