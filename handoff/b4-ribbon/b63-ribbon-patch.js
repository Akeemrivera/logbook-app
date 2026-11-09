'use strict';
/*
  Family-tree ribbon fix for the original tree3 + v93 tree.
  Accepts the original bytes, or the first ribbon patch, and writes one
  result. The worker cache name is v95. Fetch behavior stays the v93 worker.
  build63.css, build57.js, and service-worker.js are replaced only when the
  current bytes are one of the known inputs, or when they are already this
  output.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const root = path.resolve(process.argv[2] || '.');
const KNOWN = {
  'build63.css': [
    '26eb7f883d6da8118529d185483ad72d6a960f7f3c0f0423e3c732c84f9fc58e',
    '8cd60ad7556fecf054d6446d8ebe9cbdd14738c1ffeb453db7700ae949a920e6',
  ],
  'build57.js': [
    '1c4c20c8b884073bf89787b4273b28e3b8d78e68e9c798a7dfb3723cf0a70cc5',
    'ff67e8560571a8f9f0d6564ba92e308b723fd1f97e737715298ce9d30a41398b',
  ],
  'service-worker.js': [
    '5269935d4d8600de6eb486c52ef0ef22a06cdf9014385a5093f6fb917eef7a8b',
    '5296817f43ab1cf2146d73560b2127240058930fbd4c11e0493696e0edd3258a',
  ],
};
const FILES = ['build63.css', 'build57.js', 'service-worker.js'];
const DIRS = ['', 'www', path.join('ios', 'App', 'App', 'public')];
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
const next = {};
FILES.forEach((name) => {
  next[name] = fs.readFileSync(path.join(HERE, name));
  const got = sha(next[name]);
  if (KNOWN[name].indexOf(got) >= 0) throw new Error(name + ' in the patch folder is still an input file');
});
FILES.forEach((name) => {
  DIRS.forEach((dir) => {
    const rel = path.join(dir, name);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error('missing ' + rel);
    const cur = sha(fs.readFileSync(file));
    const want = sha(next[name]);
    if (cur === want) return;
    if (KNOWN[name].indexOf(cur) < 0) throw new Error(rel + ' is ' + cur + ' instead of a tree3 input');
    fs.writeFileSync(file, next[name]);
  });
});
const flags = path.join(root, 'scripts', 'b63-tree3-flags.test.js');
if (fs.existsSync(flags)) {
  let text = fs.readFileSync(flags, 'utf8');
  const css = sha(next['build63.css']);
  KNOWN['build63.css'].forEach((old) => { text = text.split(old).join(css); });
  fs.writeFileSync(flags, text);
}
const testSrc = path.join(HERE, 'b63-tree-ribbon.test.js');
const testDst = path.join(root, 'scripts', 'b63-tree-ribbon.test.js');
fs.mkdirSync(path.dirname(testDst), { recursive: true });
const testBytes = fs.readFileSync(testSrc);
if (sha(testBytes) !== 'cc8328381809a1e960b82101753150d186f30117fec1f9069be4a8d28388126c') throw new Error('ribbon test file changed');
fs.writeFileSync(testDst, testBytes);
FILES.forEach((name) => {
  const hashes = DIRS.map((dir) => sha(fs.readFileSync(path.join(root, dir, name))));
  if (new Set(hashes).size !== 1 || hashes[0] !== sha(next[name])) throw new Error(name + ' copies diverged');
  console.log(hashes[0] + '  ' + name);
});
console.log('PASS ribbon patch. Three copies match. Cache v95.');
console.log('Ribbon test cc8328381809a1e960b82101753150d186f30117fec1f9069be4a8d28388126c');
console.log('Run: node scripts/b63-tree-ribbon.test.js');
console.log('Then: node scripts/b63-real-mockup.test.js');
