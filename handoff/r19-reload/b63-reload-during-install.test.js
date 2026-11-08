'use strict';
/*
  Box result, both modes, first attempt: 40 scripts, 0 failures, boot true.
  The default reload started at controller false / active null / installing.
  --wait-settle reached controller true / active activated in 107ms and then
  reloaded. Neither reproduces the original renderer failure. This file is
  not a substitute for scripts/b63-real-mockup.test.js.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function pathOf(url) {
  try { return decodeURIComponent(new URL(url).pathname); }
  catch (e) { return ''; }
}

async function main() {
  if (!fs.existsSync(CHROME)) { console.error('FAIL chrome missing'); process.exit(1); }
  const probe = http.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }));
  const debugProbe = http.createServer();
  const debug = await new Promise((resolve) => debugProbe.listen(0, '127.0.0.1', () => { const p = debugProbe.address().port; debugProbe.close(() => resolve(p)); }));
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if ((!file.startsWith(ROOT + path.sep) && file !== ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404; res.end('missing'); return;
    }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pdf': 'application/pdf' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-reload-install-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + dir, '--remote-debugging-port=' + debug, 'about:blank'], { stdio: 'ignore' });
  const requests = new Map();
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try { const list = await (await fetch('http://127.0.0.1:' + debug + '/json/list')).json(); page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); }
      catch (e) { await sleep(100); }
    }
    if (!page) throw new Error('chrome did not open');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let n = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const params = msg.params || {};
      if (msg.method === 'Network.requestWillBeSent' && params.requestId) requests.set(params.requestId, { url: params.request && params.request.url || '', will: Date.now(), status: 0, failed: '', sw: false });
      const row = params.requestId ? requests.get(params.requestId) : null;
      if (row && msg.method === 'Network.responseReceived') { row.status = (params.response && params.response.status) || 0; row.sw = !!(params.response && params.response.fromServiceWorker); }
      if (row && msg.method === 'Network.loadingFinished') row.done = true;
      if (row && msg.method === 'Network.loadingFailed') { row.failed = (params.errorText || 'failed') + (params.canceled ? ' canceled' : ''); row.blocked = params.blockedReason || ''; row.cors = params.corsErrorStatus || null; row.done = true; }
      if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
    });
    function send(method, params) {
      const id = ++n;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout ' + method)), 15000);
        pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result || {}); });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    async function evaluate(expression) {
      const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails).slice(0, 240));
      return out.result && out.result.value;
    }
    await send('Network.enable');
    await send('Page.enable');
    await send('Runtime.enable');
    const init = 'localStorage.setItem("boriken-b63-snapshot","1"); localStorage.setItem("boriken-b63-snapshot-date","2026-11-06");';
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    const origin = 'http://127.0.0.1:' + port;
    async function boot() {
      let ready = null;
      for (let i = 0; i < 40 && !(ready && ready.ok); i++) {
        ready = await evaluate('({ ok: window.__b63RepairReady === true && window.__b63Boot && window.__b63Boot.ready === true, repair: window.__b63RepairReady === true, boot: !!(window.__b63Boot && window.__b63Boot.ready) })');
        if (!ready || !ready.ok) await sleep(50);
      }
      return ready;
    }
    await send('Page.navigate', { url: origin + '/index.html?screen=tree' });
    const first = await boot();
    const registrationExpr = 'navigator.serviceWorker.getRegistration().then((reg) => ({ controller: !!(navigator.serviceWorker.controller), active: reg && reg.active && reg.active.state, installing: reg && reg.installing && reg.installing.state, waiting: reg && reg.waiting && reg.waiting.state }))';
    let beforeReload = await evaluate(registrationExpr);
    const waitSettle = process.argv.includes('--wait-settle');
    if (waitSettle) {
      const started = Date.now();
      let met = false;
      while (Date.now() - started < 20000) {
        beforeReload = await evaluate(registrationExpr);
        met = !!(beforeReload && beforeReload.controller && beforeReload.active === 'activated' && !beforeReload.installing && !beforeReload.waiting);
        if (met) break;
        await sleep(100);
      }
      const at = new Date();
      console.log('SETTLE ' + at.toISOString() + ' epoch=' + at.getTime() + ' elapsedMs=' + (Date.now() - started) + ' met=' + met + ' ' + JSON.stringify(beforeReload) + ' firstBoot=' + !!(first && first.ok));
      if (!met) {
        console.error('FAIL settle condition not met; second reload was not started');
        process.exitCode = 1;
        return;
      }
    }
    const at = new Date();
    console.log('RELOAD-AT ' + at.toISOString() + ' epoch=' + at.getTime() + ' waited=' + waitSettle + ' ' + JSON.stringify(beforeReload) + ' firstBoot=' + !!(first && first.ok));
    requests.clear();
    await send('Page.navigate', { url: origin + '/index.html?screen=tree' });
    const second = await boot();
    const scripts = [...requests.values()].filter((row) => /\.js$/.test(pathOf(row.url)));
    const bad = scripts.filter((row) => row.failed || row.status !== 200);
    console.log('RELOAD scripts=' + scripts.length + ' failed=' + bad.length + ' boot=' + !!(second && second.ok));
    bad.slice(0, 12).forEach((row) => console.log('FAIL script ' + pathOf(row.url) + ' status=' + row.status + ' ' + row.failed + ' blocked=' + (row.blocked || '') + ' sw=' + row.sw));
    if (!second || !second.ok || bad.length) process.exitCode = 1;
    else console.log('b63 reload during install: immediate second navigation finished');
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
    server.close();
    await sleep(200);
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 }); } catch (e) {}
  }
}
main().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
