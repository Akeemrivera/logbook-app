'use strict';
/*
  Inspection-table fix for the B-4 tree (v95, build63.css 3517a759…).
  Replaces build63.css and the service worker. build57.js stays
  7aa3f1c8…. The worker cache name becomes v96. The ribbon test is not
  rewritten.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const HERE = __dirname;
const root = path.resolve(process.argv[2] || '.');
const CSS_IN = '3517a759466012ac6fcbbfecc45b83d592790b9a8e0a044f54f13d56424db26a';
const SW_IN = '2a21bc7c6b7296530d805530d58c5fd170c7a7a2f83d37a3c4ceb1ccc71fbb90';
const JS = '7aa3f1c8d5dd0b74bd20d3882c48544f4ca967a9b4b6de5eee34ce595b6054cb';
const RIBBON = 'cc8328381809a1e960b82101753150d186f30117fec1f9069be4a8d28388126c';
const DIRS = ['', 'www', path.join('ios', 'App', 'App', 'public')];
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
const css = fs.readFileSync(path.join(HERE, 'build63.css'));
const sw = fs.readFileSync(path.join(HERE, 'service-worker.js'));
const cssOut = sha(css);
const swOut = sha(sw);
if (cssOut === CSS_IN) throw new Error('build63.css in the patch folder is still the B-4 file');
if (swOut === SW_IN) throw new Error('service-worker.js in the patch folder is still v95');
function writeKnown(name, bytes, input, output) {
  DIRS.forEach((dir) => {
    const rel = path.join(dir, name);
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) throw new Error('missing ' + rel);
    const cur = sha(fs.readFileSync(file));
    if (cur === output) return;
    if (cur !== input) throw new Error(rel + ' is ' + cur + ' instead of the B-4 base ' + input);
    fs.writeFileSync(file, bytes);
  });
}
writeKnown('build63.css', css, CSS_IN, cssOut);
writeKnown('service-worker.js', sw, SW_IN, swOut);
DIRS.forEach((dir) => {
  const rel = path.join(dir, 'build57.js');
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) throw new Error('missing ' + rel);
  const cur = sha(fs.readFileSync(file));
  if (cur !== JS) throw new Error(rel + ' is ' + cur + ' instead of ' + JS);
});
const ribbon = path.join(root, 'scripts', 'b63-tree-ribbon.test.js');
if (fs.existsSync(ribbon) && sha(fs.readFileSync(ribbon)) !== RIBBON) throw new Error('ribbon test is not ' + RIBBON);
const flags = path.join(root, 'scripts', 'b63-tree3-flags.test.js');
if (fs.existsSync(flags)) {
  const text = fs.readFileSync(flags, 'utf8').split(CSS_IN).join(cssOut);
  fs.writeFileSync(flags, text);
}
const testSrc = fs.readFileSync(path.join(HERE, 'b63-inspection-table.test.js'));
const testDst = path.join(root, 'scripts', 'b63-inspection-table.test.js');
fs.mkdirSync(path.dirname(testDst), { recursive: true });
fs.writeFileSync(testDst, testSrc);
console.log(cssOut + '  build63.css');
console.log(swOut + '  service-worker.js');
console.log(JS + '  build57.js unchanged');
console.log(sha(testSrc) + '  b63-inspection-table.test.js');
console.log('PASS inspection patch. Cache v96.');
console.log('Run: node scripts/b63-inspection-table.test.js');
console.log('Then: node scripts/b63-tree-ribbon.test.js');
console.log('Then: node scripts/b63-real-mockup.test.js');
