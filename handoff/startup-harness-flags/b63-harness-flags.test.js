'use strict';
/*
  The harness Chrome launch keeps extension workers out of its throwaway
  profile. The acceptance assertions, fixture, viewports, boot limit,
  service worker, and CSS stay as they were.
*/
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const UNCHANGED = {
  'scripts/b63-real-mockup.test.js': '2f8280d194adb8a81c729637c199a82e07d0a674df5d0bca7e8b61d7b8eb89d5',
  'service-worker.js': '25a422476c95b2155c51991efc0e4f8e635f4c0a1ca28e5aa640de1027717624',
  'build63.css': '8582bbaa8737fe73cf4833f37088b3032bf6fd19401d4e9f755f7138c3382d71',
};
function fail(message) { console.error('FAIL', message); process.exit(1); }
Object.keys(UNCHANGED).forEach((rel) => {
  const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
  if (got !== UNCHANGED[rel]) fail(rel + ' changed ' + got);
});
const renderer = fs.readFileSync(path.join(ROOT, 'scripts/b63-real-mockup.js'), 'utf8');
const spawnAt = renderer.indexOf('proc = spawn(CHROME');
const spawn = renderer.slice(spawnAt, renderer.indexOf('], { stdio:', spawnAt));
['--disable-extensions', '--disable-component-extensions-with-background-pages'].forEach((flag) => {
  if (spawn.indexOf(flag) < 0) fail('missing ' + flag);
});
if (renderer.indexOf('const VIEWPORTS = [[390, 844], [1024, 768], [1024, 1366]];') < 0) fail('viewports changed');
const bootLoops = renderer.split('for (let i = 0; i < 40 &&').length - 1;
if (bootLoops < 2) fail('boot limit changed');
const test = fs.readFileSync(path.join(ROOT, 'scripts/b63-real-mockup.test.js'), 'utf8');
['inner=390x844', 'inner=1024x768', 'inner=1024x1366', 'zoom=1.28'].forEach((needle) => {
  if (test.indexOf(needle) < 0) fail('acceptance lost ' + needle);
});
console.log('PASS harness flags are present and the acceptance test, service worker, css, viewports, and boot limit are unchanged');
