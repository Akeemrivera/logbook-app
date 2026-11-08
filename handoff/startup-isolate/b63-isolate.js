'use strict';
/*
  Lists the targets a fresh harness profile starts.
  It does not open the app, read the real Chrome profile, or change installed extensions.
  Three launches: the harness flags, those flags plus --disable-extensions,
  and those flags plus --disable-component-extensions-with-background-pages.
*/
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const HASHES = {
  'scripts/b63-real-mockup.js': '98d3a0c54fb6852e23c922475d7169039aa7392078d17949f6a15cb7770537ac',
  'scripts/b63-real-mockup.test.js': '2f8280d194adb8a81c729637c199a82e07d0a674df5d0bca7e8b61d7b8eb89d5',
  'service-worker.js': '25a422476c95b2155c51991efc0e4f8e635f4c0a1ca28e5aa640de1027717624',
  'build63.css': '8582bbaa8737fe73cf4833f37088b3032bf6fd19401d4e9f755f7138c3382d71',
};
function emit(line) { fs.writeSync(1, line + '\n'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => { const assigned = probe.address().port; probe.close(() => resolve(assigned)); });
  });
}
Object.keys(HASHES).forEach((rel) => {
  const got = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
  if (got !== HASHES[rel]) { fs.writeSync(2, 'FAIL ' + rel + ' changed\n'); process.exit(1); }
});
emit('PASS original renderer, test, service worker, and css are unchanged');
async function launch(label, extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-isolate-'));
  const debugPort = await freePort();
  const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + dir, '--remote-debugging-port=' + debugPort].concat(extra).concat(['about:blank']);
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let list = [];
  for (let i = 0; i < 40 && !list.length; i++) {
    try { list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json(); }
    catch (e) { await sleep(100); }
  }
  await sleep(600);
  try { list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json(); }
  catch (e) { list = []; }
  emit('ISOLATE ' + label + ' flags=' + (extra.join(' ') || 'harness-default') + ' targets=' + list.length);
  list.forEach((target) => emit('ISOLATE target ' + label + ' ' + target.type + ' ' + (target.url || '') + ' ' + (target.title || '')));
  try { proc.kill('SIGKILL'); } catch (e) { /* already closed */ }
  await sleep(200);
  fs.rmSync(dir, { recursive: true, force: true });
  if (!list.length) throw new Error(label + ' did not open');
}
(async () => {
  await launch('default', []);
  await launch('disable-extensions', ['--disable-extensions']);
  await launch('component-off', ['--disable-component-extensions-with-background-pages']);
  emit('PASS isolate listed three fresh profiles');
})().catch((e) => {
  fs.writeSync(2, 'FAIL ' + (e && e.message ? e.message : e) + '\n');
  process.exit(1);
});
