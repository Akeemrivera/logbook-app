'use strict';
/*
  Put the family-tree ribbon fix on the tree3 + v93 tree.
  Replaces build63.css, build57.js, and the service worker only when the
  current bytes are the known tree3/v93 files, or when they are already
  this patch. The worker cache name becomes v94 so a cache-first phone
  loads the new stylesheet and script. Fetch behavior is otherwise the
  v93 worker.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const root = path.resolve(process.argv[2] || '.');
const OLD = {
  'build63.css': '26eb7f883d6da8118529d185483ad72d6a960f7f3c0f0423e3c732c84f9fc58e',
  'build57.js': '1c4c20c8b884073bf89787b4273b28e3b8d78e68e9c798a7dfb3723cf0a70cc5',
  'service-worker.js': '5269935d4d8600de6eb486c52ef0ef22a06cdf9014385a5093f6fb917eef7a8b',
};
const FILES = ['build63.css', 'build57.js', 'service-worker.js'];
const DIRS = ['', 'www', path.join('ios', 'App', 'App', 'public')];
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
const next = {};
FILES.forEach((name) => {
  next[name] = fs.readFileSync(path.join(HERE, name));
  const got = sha(next[name]);
  if (got === OLD[name]) throw new Error(name + ' in the patch folder is still the old file');
});
FILES.forEach((name) => {
  DIRS.forEach((dir) => {
    const rel = path.join(dir, name);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error('missing ' + rel);
    const cur = sha(fs.readFileSync(file));
    const want = sha(next[name]);
    if (cur === want) return;
    if (cur !== OLD[name]) throw new Error(rel + ' is ' + cur + ' instead of ' + OLD[name]);
    fs.writeFileSync(file, next[name]);
  });
});
const flags = path.join(root, 'scripts', 'b63-tree3-flags.test.js');
if (fs.existsSync(flags)) {
  const text = fs.readFileSync(flags, 'utf8');
  const css = sha(next['build63.css']);
  if (text.indexOf(OLD['build63.css']) >= 0) fs.writeFileSync(flags, text.replaceAll(OLD['build63.css'], css));
  else if (text.indexOf(css) < 0) console.log('NOTE flags guard does not pin ' + OLD['build63.css']);
}
const testSrc = path.join(HERE, 'b63-tree-ribbon.test.js');
const testDst = path.join(root, 'scripts', 'b63-tree-ribbon.test.js');
fs.mkdirSync(path.dirname(testDst), { recursive: true });
fs.writeFileSync(testDst, fs.readFileSync(testSrc));
FILES.forEach((name) => {
  const hashes = DIRS.map((dir) => sha(fs.readFileSync(path.join(root, dir, name))));
  if (new Set(hashes).size !== 1 || hashes[0] !== sha(next[name])) throw new Error(name + ' copies diverged');
  console.log(hashes[0] + '  ' + name);
});
console.log('PASS ribbon patch. Three copies match.');
console.log('Run: node scripts/b63-tree-ribbon.test.js');
console.log('Then: node scripts/b63-real-mockup.test.js');
