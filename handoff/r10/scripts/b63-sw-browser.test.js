'use strict';
/*
  TEST FIXTURE. Not a user mockup and not part of the shipped app.
  Real Chrome service-worker update. Not the Node sandbox.
  One profile is already on v81. Another is already on v82, with stale
  build13.js and build58.js. The server then serves the real worker (v83).
  Chrome must install it, drop the old cache, and serve the on-disk files
  online and offline. If Chrome is missing, this test fails.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const PORT = 9341;
if (!fs.existsSync(CHROME)) {
  console.error('FAIL real Chrome is not installed at ' + CHROME + '. This test does not substitute a Node cache.');
  process.exit(1);
}
function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
const EXPECT = {
  'build13.js': sha(fs.readFileSync(path.join(ROOT, 'build13.js'))),
  'build58.js': sha(fs.readFileSync(path.join(ROOT, 'build58.js'))),
};
function staleWorker(cacheName) {
  return [
    "const CACHE_NAME = '" + cacheName + "';",
    "self.addEventListener('install', (event) => {",
    "  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all([",
    "    cache.put('./build13.js', new Response('STALE-BUILD13', { status: 200, headers: { 'Content-Type': 'application/javascript' } })),",
    "    cache.put('./build58.js', new Response('STALE-BUILD58', { status: 200, headers: { 'Content-Type': 'application/javascript' } }))",
    "  ])).then(() => self.skipWaiting()));",
    '});',
    "self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });",
    "self.addEventListener('fetch', (event) => {",
    "  if (event.request.method !== 'GET') return;",
    "  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));",
    '});',
    '',
  ].join('\n');
}
const PROBE = `<!doctype html><meta charset="utf-8"><title>sw probe</title><script>
navigator.serviceWorker.register('./service-worker.js').catch((e) => { window.__swErr = String(e); });
</script>`;
let swMode = 'old';
let oldCache = '';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  let rel = decodeURIComponent(url.pathname);
  res.setHeader('Cache-Control', 'no-store');
  if (rel === '/service-worker.js') {
    const body = swMode === 'old' ? staleWorker(oldCache) : fs.readFileSync(path.join(ROOT, 'service-worker.js'));
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.end(body);
    return;
  }
  if (rel === '/sw-probe.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(PROBE);
    return;
  }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end('forbidden'); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing ' + rel); return; }
  res.end(fs.readFileSync(file));
});
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
const READ = `(async () => {
  async function one(url) {
    const res = await fetch(url);
    const text = await res.text();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const sum = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return { status: res.status, sum, stale: text.startsWith('STALE-') };
  }
  const keys = await caches.keys();
  const a = await one('./build13.js');
  const b = await one('./build58.js');
  return { keys, build13: a, build58: b, err: window.__swErr || '' };
})()`;

async function chromeCase(cacheName, debugPort) {
  oldCache = cacheName;
  swMode = 'old';
  const dir = '/tmp/b63-sw-chrome-' + cacheName.slice(-3);
  fs.rmSync(dir, { recursive: true, force: true });
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--user-data-dir=' + dir, '--remote-debugging-port=' + debugPort, 'about:blank',
  ], { stdio: 'ignore' });
  const logs = [];
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
        page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch (e) { await sleep(100); }
    }
    if (!page) throw new Error('chrome debugging page did not open');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    const pending = new Map();
    let n = 0;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
      else if (msg.method === 'Runtime.consoleAPICalled') logs.push((msg.params.args || []).map((a) => a.value || a.description || '').join(' '));
      else if (msg.method === 'Runtime.exceptionThrown') logs.push('exception ' + JSON.stringify(msg.params.exceptionDetails && msg.params.exceptionDetails.exception));
    });
    function send(method, params) {
      const id = ++n;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('cdp timeout ' + method)), 20000);
        pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(method + ' ' + JSON.stringify(msg.error))); else resolve(msg.result || {}); });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    await send('Runtime.enable');
    await send('Network.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/sw-probe.html' });
    let seeded = null;
    for (let i = 0; i < 40; i++) {
      const out = await send('Runtime.evaluate', { expression: READ, awaitPromise: true, returnByValue: true });
      seeded = out.result && out.result.value;
      if (seeded && seeded.build13 && seeded.build13.stale && seeded.build58 && seeded.build58.stale && seeded.keys.includes(cacheName)) break;
      await sleep(250);
    }
    if (!seeded || !seeded.build13 || !seeded.build13.stale || !seeded.build58.stale || !seeded.keys.includes(cacheName)) {
      throw new Error(cacheName + ' seed did not control the page ' + JSON.stringify(seeded) + ' ' + logs.join(' | '));
    }
    console.log('PASS real Chrome served stale build13.js and build58.js from ' + cacheName);
    swMode = 'live';
    await send('Runtime.evaluate', { expression: 'navigator.serviceWorker.getRegistration().then((reg) => reg.update())', awaitPromise: true });
    let updated = null;
    for (let i = 0; i < 80; i++) {
      const out = await send('Runtime.evaluate', { expression: READ, awaitPromise: true, returnByValue: true });
      updated = out.result && out.result.value;
      const fresh = updated && updated.build13 && updated.build13.sum === EXPECT['build13.js'] && updated.build58.sum === EXPECT['build58.js'];
      if (fresh && updated.keys.includes('boriken-genetics-logbook-app-v83') && !updated.keys.includes(cacheName)) break;
      await sleep(250);
    }
    if (!updated || updated.build13.sum !== EXPECT['build13.js'] || updated.build58.sum !== EXPECT['build58.js'] || updated.keys.includes(cacheName) || !updated.keys.includes('boriken-genetics-logbook-app-v83')) {
      throw new Error(cacheName + ' did not install v83 ' + JSON.stringify(updated) + ' ' + logs.join(' | '));
    }
    console.log('PASS real Chrome replaced ' + cacheName + ' and served the current build13.js and build58.js');
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    const offline = await send('Runtime.evaluate', { expression: READ, awaitPromise: true, returnByValue: true });
    const off = offline.result && offline.result.value;
    if (!off || off.build13.sum !== EXPECT['build13.js'] || off.build58.sum !== EXPECT['build58.js'] || off.build13.stale || off.build58.stale) {
      throw new Error(cacheName + ' offline was not the v83 shell ' + JSON.stringify(off));
    }
    console.log('PASS real Chrome served the v83 build13.js and build58.js offline after ' + cacheName);
  } finally {
    proc.kill('SIGKILL');
    await sleep(300);
  }
}

async function main() {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  try {
    await chromeCase('boriken-genetics-logbook-app-v81', 9342);
    await chromeCase('boriken-genetics-logbook-app-v82', 9343);
    console.log('b63 sw browser: v81 and v82 update paths passed');
  } finally {
    server.close();
  }
}
main().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
