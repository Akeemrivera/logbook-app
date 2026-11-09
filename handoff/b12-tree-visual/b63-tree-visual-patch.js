'use strict';
/*
  Revised tree visual fix. Applies to the B-10 base or to the first B-12
  patch, and writes one result. The round title badge stays; a glyph that
  failed to load is replaced with the light plant glyph. Cache name v98.
  The ribbon test is not rewritten.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const root = path.resolve(process.argv[2] || '.');
const KNOWN = {
  'build63.css': [
    'f2c40c6d036a66681440b646064c4442386739992e35ff3be8216a5275cdad28',
    'a5d3be09a872055377fdf49988d2caa50bf38aa48b43aedaecdb0201e827abbf',
  ],
  'build57.js': [
    '7aa3f1c8d5dd0b74bd20d3882c48544f4ca967a9b4b6de5eee34ce595b6054cb',
    '0698b42265b62e6035adcb465ee53edf99bb5e6e1b06a53706f9e0e060cb89a4',
  ],
  'service-worker.js': [
    '4d4ced3d36d72a781d4e778362e91ab2c36dd3a7944bb2bc8dddad487b7918ed',
    '8c19275b3a6edc95c1ba032a2adfe8ad108c1550d6b2cef3f000ec279b252a92',
  ],
};
const FILES = ['build63.css', 'build57.js', 'service-worker.js'];
const DIRS = ['', 'www', path.join('ios', 'App', 'App', 'public')];
const RIBBON = 'cc8328381809a1e960b82101753150d186f30117fec1f9069be4a8d28388126c';
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
const next = {};
FILES.forEach((name) => { next[name] = fs.readFileSync(path.join(HERE, name)); });
FILES.forEach((name) => {
  DIRS.forEach((dir) => {
    const rel = path.join(dir, name);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error('missing ' + rel);
    const cur = sha(fs.readFileSync(file));
    const want = sha(next[name]);
    if (cur === want) return;
    if (KNOWN[name].indexOf(cur) < 0) throw new Error(rel + ' is ' + cur + ' instead of the B-10 or first B-12 file');
    fs.writeFileSync(file, next[name]);
  });
});
const ribbon = path.join(root, 'scripts', 'b63-tree-ribbon.test.js');
if (fs.existsSync(ribbon) && sha(fs.readFileSync(ribbon)) !== RIBBON) throw new Error('ribbon test is not ' + RIBBON);
const flags = path.join(root, 'scripts', 'b63-tree3-flags.test.js');
if (fs.existsSync(flags)) {
  let text = fs.readFileSync(flags, 'utf8');
  KNOWN['build63.css'].forEach((old) => { text = text.split(old).join(sha(next['build63.css'])); });
  fs.writeFileSync(flags, text);
}
const testSrc = fs.readFileSync(path.join(HERE, 'b63-tree-visual.test.js'));
fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts', 'b63-tree-visual.test.js'), testSrc);
FILES.forEach((name) => console.log(sha(next[name]) + '  ' + name));
console.log(sha(testSrc) + '  b63-tree-visual.test.js');
console.log('PASS tree visual patch. Cache v98. The title badge stays.');
console.log('Run: node scripts/b63-tree-visual.test.js');
console.log('Then: node scripts/b63-tree-ribbon.test.js');
console.log('Then: node scripts/b63-real-mockup.test.js');
