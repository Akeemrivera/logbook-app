'use strict';
/*
  Tree visual fix for the B-10 base (v96, build63.css f2c40c6d…,
  build57.js 7aa3f1c8…). Writes build57.js, build63.css, and the
  service worker. The cache name becomes v97. The ribbon test is not
  rewritten.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const root = path.resolve(process.argv[2] || '.');
const IN = {
  'build63.css': 'f2c40c6d036a66681440b646064c4442386739992e35ff3be8216a5275cdad28',
  'build57.js': '7aa3f1c8d5dd0b74bd20d3882c48544f4ca967a9b4b6de5eee34ce595b6054cb',
  'service-worker.js': '4d4ced3d36d72a781d4e778362e91ab2c36dd3a7944bb2bc8dddad487b7918ed',
};
const FILES = ['build63.css', 'build57.js', 'service-worker.js'];
const DIRS = ['', 'www', path.join('ios', 'App', 'App', 'public')];
const RIBBON = 'cc8328381809a1e960b82101753150d186f30117fec1f9069be4a8d28388126c';
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
const next = {};
FILES.forEach((name) => {
  next[name] = fs.readFileSync(path.join(HERE, name));
  if (sha(next[name]) === IN[name]) throw new Error(name + ' in the patch folder is still the B-10 file');
});
FILES.forEach((name) => {
  DIRS.forEach((dir) => {
    const rel = path.join(dir, name);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error('missing ' + rel);
    const cur = sha(fs.readFileSync(file));
    const want = sha(next[name]);
    if (cur === want) return;
    if (cur !== IN[name]) throw new Error(rel + ' is ' + cur + ' instead of the B-10 base ' + IN[name]);
    fs.writeFileSync(file, next[name]);
  });
});
const ribbon = path.join(root, 'scripts', 'b63-tree-ribbon.test.js');
if (fs.existsSync(ribbon) && sha(fs.readFileSync(ribbon)) !== RIBBON) throw new Error('ribbon test is not ' + RIBBON);
const flags = path.join(root, 'scripts', 'b63-tree3-flags.test.js');
if (fs.existsSync(flags)) {
  const text = fs.readFileSync(flags, 'utf8').split(IN['build63.css']).join(sha(next['build63.css']));
  fs.writeFileSync(flags, text);
}
const testSrc = fs.readFileSync(path.join(HERE, 'b63-tree-visual.test.js'));
fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts', 'b63-tree-visual.test.js'), testSrc);
FILES.forEach((name) => console.log(sha(next[name]) + '  ' + name));
console.log(sha(testSrc) + '  b63-tree-visual.test.js');
console.log('PASS tree visual patch. Cache v97.');
console.log('Run: node scripts/b63-tree-visual.test.js');
console.log('Then: node scripts/b63-tree-ribbon.test.js');
console.log('Then: node scripts/b63-real-mockup.test.js');
