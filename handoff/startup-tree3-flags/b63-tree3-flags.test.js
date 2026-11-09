'use strict';
/*
  Guard for the tree3 harness renderer. It checks the two Chrome flags and
  the saved treeStyle allowlist. It pins build63.css to the tree3 bytes.
  It does not change the 17 acceptance checks.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CSS = '8cd60ad7556fecf054d6446d8ebe9cbdd14738c1ffeb453db7700ae949a920e6';
const CSS_PATHS = ['build63.css', 'www/build63.css', 'ios/App/App/public/build63.css'];
function fail(message) { console.error('FAIL', message); process.exit(1); }
function sha(rel) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
}
const renderer = fs.readFileSync(path.join(ROOT, 'scripts/b63-real-mockup.js'), 'utf8');
const spawnAt = renderer.indexOf('proc = spawn(CHROME');
const spawn = renderer.slice(spawnAt, renderer.indexOf('], { stdio:', spawnAt));
['--disable-extensions', '--disable-component-extensions-with-background-pages'].forEach((flag) => {
  if (spawn.indexOf(flag) < 0) fail('missing ' + flag);
});
if (renderer.indexOf("key === 'treeStyle'") < 0 || renderer.indexOf('treeStyle must be an integer from 1 to 8') < 0) fail('treeStyle allowlist missing');
if (renderer.indexOf("'treeStyle'") < 0) fail('treeStyle field missing');
CSS_PATHS.forEach((rel) => {
  const got = sha(rel);
  if (got !== CSS) fail(rel + ' is ' + got + ' instead of ' + CSS);
});
const test = fs.readFileSync(path.join(ROOT, 'scripts/b63-real-mockup.test.js'), 'utf8');
['the three stylesheets are the same bytes', 'inner=390x844', 'inner=1024x768', 'inner=1024x1366', 'zoom=1.28', 'a missing record fails instead of drawing another page'].forEach((needle) => {
  if (test.indexOf(needle) < 0) fail('acceptance check missing: ' + needle);
});
console.log('PASS tree3 harness flags, treeStyle allowlist, and build63.css ' + CSS);
console.log('CSS-SHA256 ' + CSS);
