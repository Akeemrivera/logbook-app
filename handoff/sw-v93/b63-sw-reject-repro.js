'use strict';
/*
  Deterministic, extension-free proof of the v92 respondWith rejection.
  A controlled page requests a script that is not in the cache. The first
  network fetch is reset. v92 then rejects respondWith: Chrome reports
  net::ERR_FAILED and no response. v93 fetches the URL again and returns
  that Response, so the script runs. Every run is printed.
*/
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-sw-repro-'));
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => { const assigned = probe.address().port; probe.close(() => resolve(assigned)); });
  });
}
const before = `
const CACHE = 'repro-v92';
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./s1.js'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
function matchUrl(request) { return caches.match(request, { ignoreSearch: true }).catch(() => null); }
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  let networkRequest = event.request;
  try { networkRequest = event.request.clone(); } catch (e) {}
  event.respondWith(matchUrl(event.request).then((found) => {
    if (found) return found;
    return fetch(networkRequest).then((response) => response).catch(() => matchUrl(event.request).then((again) => {
      if (again) return again;
      return Promise.reject(new Error('unavailable'));
    }));
  }));
});
`;
const after = `
const CACHE = 'repro-v93';
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./s1.js'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
function matchUrl(request) { return caches.match(request, { ignoreSearch: true }).catch(() => null); }
function plain(status) { return new Response('', { status: status, headers: { 'Content-Type': 'text/plain' } }); }
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(matchUrl(event.request).then((found) => {
    if (found) return found;
    return fetch(event.request).then((response) => response.ok ? response : fetch(event.request.url + '?fallback=1')).catch(() => fetch(event.request.url + '?fallback=1'));
  }).then((response) => response instanceof Response ? response : plain(504)).catch(() => plain(504)));
});
`;
fs.writeFileSync(path.join(ROOT, 's1.js'), 'window.__n=(window.__n||0)+1;\n');
fs.writeFileSync(path.join(ROOT, 'miss.js'), 'window.__miss=1;\n');
fs.writeFileSync(path.join(ROOT, 'index.html'), '<!doctype html><script>navigator.serviceWorker.register("./sw.js")</script><script src="/s1.js" defer></script><script src="/miss.js" defer></script>');
async function once(label, source) {
  fs.writeFileSync(path.join(ROOT, 'sw.js'), source);
  const port = await freePort();
  const debugPort = await freePort();
  let missHits = 0;
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.join(ROOT, rel.replace(/^\/+/, ''));
    if (rel === '/miss.js' && !req.url.includes('fallback=1')) { res.destroy(); return; }
    if (!fs.existsSync(file)) { res.statusCode = 404; res.end('no'); return; }
    res.setHeader('Content-Type', rel.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-sw-repro-chrome-'));
  const proc = spawn('/opt/google/chrome/chrome', ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--disable-extensions', '--disable-component-extensions-with-background-pages', '--user-data-dir=' + dir, '--remote-debugging-port=' + debugPort, 'about:blank'], { stdio: 'ignore' });
  let page;
  for (let i = 0; i < 40 && !page; i++) {
    try { page = (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); }
    catch (e) { await sleep(80); }
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let n = 0;
  const pending = new Map();
  const rows = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const params = msg.params || {};
    if (msg.method === 'Network.requestWillBeSent' && params.requestId) rows.set(params.requestId, { url: params.request.url, done: '', err: '', resp: false, status: 0 });
    const row = params.requestId ? rows.get(params.requestId) : null;
    if (row && msg.method === 'Network.responseReceived') { row.resp = true; row.status = params.response.status; }
    if (row && msg.method === 'Network.loadingFinished') row.done = 'ok';
    if (row && msg.method === 'Network.loadingFailed') { row.done = 'fail'; row.err = params.errorText || ''; }
    if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
  });
  function send(method, params) {
    const id = ++n;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout ' + method)), 20000);
      pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error('cdp')); else resolve(msg.result || {}); });
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }
  async function evaluate(expression) {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return out.result && out.result.value;
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html' });
  for (let i = 0; i < 40; i++) { if (await evaluate('!!navigator.serviceWorker.controller')) break; await sleep(50); }
  rows.clear();
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html?n=2' });
  await sleep(1200);
  const state = await evaluate('({ n: window.__n || 0, miss: window.__miss || 0 })');
  const miss = [...rows.values()].filter((row) => row.url.includes('miss.js')).pop() || {};
  console.log('REPRO ' + label + ' executedMiss=' + state.miss + ' cached=' + state.n + ' result=' + (miss.done || 'pending') + ' error=' + (miss.err || '') + ' response=' + (miss.resp ? miss.status : 'absent') + ' serverHits=' + missHits + ' rows=' + [...rows.values()].filter((row) => row.url.includes('miss.js')).length);
  proc.kill('SIGKILL');
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  return state.miss === 1 && miss.done === 'ok';
}
(async () => {
  const beforeRuns = [];
  const afterRuns = [];
  for (let i = 1; i <= 3; i++) beforeRuns.push(await once('before ' + i, before));
  for (let i = 1; i <= 3; i++) afterRuns.push(await once('after ' + i, after));
  const beforeFail = beforeRuns.every((ok) => !ok);
  const afterPass = afterRuns.every((ok) => ok);
  console.log('REPRO beforeFailed=' + beforeFail + ' afterPassed=' + afterPass);
  if (!beforeFail || !afterPass) process.exit(1);
  console.log('PASS respondWith rejection reproduced and the URL fallback loads the script');
})().catch((e) => { console.error('FAIL ' + (e && e.message ? e.message : e)); process.exit(1); });
