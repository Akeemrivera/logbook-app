'use strict';
/*
  One unflagged run of the v93 tree. The app files on disk are not modified.
  The test server serves a copy of service-worker.js that records each fetch
  event. Chrome is launched with the original flags, without --disable-extensions
  and without --disable-component-extensions-with-background-pages.

  Decision, fixed before the run:
    OUTSIDE-APP: extension targets are present, and every failing script was
      either never received by the app service worker, or the worker resolved
      a Response and the browser still failed it.
    SW-PATH: the app service worker received a failing script and rejected the
      response or did not return a Response.
    MIXED: both of those happened.
    INCOMPLETE-SW-LOG: the boot failed and the worker log could not be read.
    NO-FAILURE: every viewport booted.
  OUTSIDE-APP means this failure is outside the app and cannot occur in the
  iOS WKWebView production app, which does not load those extension workers.
*/
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const V93 = '5269935d4d8600de6eb486c52ef0ef22a06cdf9014385a5093f6fb917eef7a8b';
const VIEWPORTS = [[390, 844], [1024, 768], [1024, 1366]];
function emit(line) { fs.writeSync(1, line + '\n'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => { const assigned = probe.address().port; probe.close(() => resolve(assigned)); });
  });
}
function decide(failed, extPresent, logRead) {
  if (!failed.length) return 'NO-FAILURE';
  if (!logRead) return 'INCOMPLETE-SW-LOG';
  const outside = failed.filter((row) => !row.swReceived || (row.swResolved && row.swIsResponse));
  const mishandled = failed.filter((row) => row.swReceived && (row.swRejected || (row.swResolved && !row.swIsResponse)));
  if (mishandled.length && outside.length) return 'MIXED';
  if (mishandled.length) return 'SW-PATH';
  if (outside.length === failed.length && extPresent) return 'OUTSIDE-APP';
  return 'INCOMPLETE-SW-LOG';
}
function check(name, ok) { if (!ok) { fs.writeSync(2, 'FAIL ' + name + '\n'); process.exit(1); } }
check('outside when the worker never saw the script', decide([{ swReceived: false }], true, true) === 'OUTSIDE-APP');
check('outside when the worker returned a Response and the browser failed it', decide([{ swReceived: true, swResolved: true, swIsResponse: true }], true, true) === 'OUTSIDE-APP');
check('sw path when the worker rejected', decide([{ swReceived: true, swRejected: true, swResolved: false, swIsResponse: false }], true, true) === 'SW-PATH');
check('mixed is not collapsed', decide([{ swReceived: false }, { swReceived: true, swRejected: true, swResolved: false, swIsResponse: false }], true, true) === 'MIXED');
emit('FETCHLOG rule OUTSIDE-APP if extensions are present and every failing script was unseen by the app worker or returned as a Response');
emit('FETCHLOG rule SW-PATH if the app worker received a failing script and rejected it or returned a non-Response');
emit('FETCHLOG flags=off sw=copy-of-v93');
if (process.argv.includes('--rules')) { emit('PASS fetchlog rules'); process.exit(0); }

function instrument(source) {
  const needle = "self.addEventListener('fetch', (event) => {";
  if (source.split(needle).length !== 2) throw new Error('expected one fetch listener');
  const insert = needle + "\n"
    + "  const __b63log = self.__b63FetchLog || (self.__b63FetchLog = []);\n"
    + "  const __b63url = event.request.url;\n"
    + "  __b63log.push({ t: Date.now(), url: __b63url, phase: 'received', destination: event.request.destination, mode: event.request.mode });\n"
    + "  const __b63respond = event.respondWith.bind(event);\n"
    + "  event.respondWith = function (value) {\n"
    + "    return __b63respond(Promise.resolve(value).then(function (res) {\n"
    + "      __b63log.push({ t: Date.now(), url: __b63url, phase: 'resolved', status: res && res.status, isResponse: !!(typeof Response !== 'undefined' && res instanceof Response) });\n"
    + "      return res;\n"
    + "    }, function (err) {\n"
    + "      __b63log.push({ t: Date.now(), url: __b63url, phase: 'rejected', message: String(err && (err.message || err) || err) });\n"
    + "      return Promise.reject(err);\n"
    + "    }));\n"
    + "  };\n";
  return source.replace(needle, insert);
}

const swPath = path.join(ROOT, 'service-worker.js');
const swBytes = fs.readFileSync(swPath);
const swHash = crypto.createHash('sha256').update(swBytes).digest('hex');
if (swHash !== V93) { fs.writeSync(2, 'FAIL service-worker.js is ' + swHash + ' not v93 ' + V93 + '\n'); process.exit(1); }
const swCopy = instrument(swBytes.toString('utf8'));
emit('FETCHLOG swDisk=' + swHash + ' swServed=instrumented-copy');

const dates = { startDate: '2024-03-01', vegStartDate: '2024-03-20', flowerStartDate: '2024-05-01', plannedFlipDate: '2024-05-01', flowerFlipDate: '2024-05-01' };
const state = {
  plants: [
    { id: 'p-target', name: 'Kept Plant', status: 'active', count: 2, growType: 'Photoperiod', ...dates, b49Mother: 'mf:m-arch', b49Father: 'dx:FixtureFather', b58Manual: { m: true, f: true }, b58DeletedAt: '2024-01-02T00:00:00.000Z' },
    { id: 'p-blank', name: 'Dated Blank', status: 'active', count: 2, ...dates, b49Mother: 'mf:m-arch', b49Father: '-', b58Manual: { m: true, f: true } },
    { id: 'p-proof', name: 'Proof Plant', status: 'active', count: 2, ...dates, b49Mother: 'mf:m1', b49Father: 'dx:Removed Parent', b58Manual: { m: true, f: true }, b58DeletedParents: { f: { key: 'mf:old-father', name: 'Removed Parent', at: '2024-02-02T00:00:00.000Z' } } },
    { id: 'p-open', name: 'Undated Plant', status: 'active', b49Mother: 'mf:m1', b49Father: 'mf:f1' },
  ],
  motherFatherPlants: [
    { id: 'm1', name: 'Kept Mother', role: 'mother', status: 'Active' },
    { id: 'f1', name: 'Kept Father', role: 'father', status: 'Active' },
    { id: 'm-arch', name: 'Archived Mother', role: 'mother', status: 'Active', archived: true, b49Mother: 'mf:m-retired', b49Father: 'mf:f-culled' },
    { id: 'm-retired', name: 'Retired Mother', role: 'mother', status: 'Retired' },
    { id: 'f-culled', name: 'Culled Father', role: 'father', status: 'Culled' },
  ],
  breedingProjects: [{ id: 'pr1', name: 'Kept Cross', status: 'Active', motherId: 'm1', fatherId: 'f1', mother: 'Kept Mother', father: 'Kept Father' }],
  cloneRuns: [{ id: 'c1', name: 'Kept Clone', srcId: 'p-other', srcColl: 'plants', status: 'Active' }],
};

(async () => {
  const port = await freePort();
  const debugPort = await freePort();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/service-worker.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.setHeader('Cache-Control', 'no-store');
      res.end(swCopy);
      return;
    }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end('no'); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
    const ext = path.extname(file).toLowerCase();
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pdf': 'application/pdf' }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-fetchlog-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--user-data-dir=' + dir, '--remote-debugging-port=' + debugPort, 'about:blank',
  ], { stdio: 'ignore' });
  const targets = new Map();
  const poll = setInterval(async () => {
    try {
      const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
      list.forEach((target) => targets.set((target.type || '') + ' ' + (target.url || ''), target.type || ''));
    } catch (e) { /* chrome is still starting */ }
  }, 200);
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    try { page = (await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl); }
    catch (e) { await sleep(100); }
  }
  if (!page) throw new Error('chrome did not open');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
  let n = 0;
  const pending = new Map();
  const net = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    const params = msg.params || {};
    if (msg.method === 'Network.requestWillBeSent' && params.requestId) {
      net.set(params.requestId, { url: (params.request && params.request.url) || '', t: Date.now(), done: '', err: '', resp: false, status: 0, sw: null });
    }
    const row = params.requestId ? net.get(params.requestId) : null;
    if (row && msg.method === 'Network.responseReceived') { row.resp = true; row.status = params.response.status || 0; row.sw = !!params.response.fromServiceWorker; }
    if (row && msg.method === 'Network.loadingFinished') row.done = 'ok';
    if (row && msg.method === 'Network.loadingFailed') { row.done = 'fail'; row.err = params.errorText || 'failed'; }
    if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
  });
  function send(method, params, sessionId) {
    const id = ++n;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout ' + method)), 20000);
      pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result || {}); });
      const body = { id, method, params: params || {} };
      if (sessionId) body.sessionId = sessionId;
      ws.send(JSON.stringify(body));
    });
  }
  async function evaluate(expression) {
    const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) throw new Error('page exception');
    return out.result && out.result.value;
  }
  async function readWorkerLog() {
    const version = await (await fetch('http://127.0.0.1:' + debugPort + '/json/version')).json();
    const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
    const worker = list.find((target) => target.type === 'service_worker' && (target.url || '').indexOf('/service-worker.js') >= 0);
    if (!worker) return { error: 'app-worker-not-listed' };
    const browser = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { browser.addEventListener('open', resolve); browser.addEventListener('error', reject); });
    let bn = 0;
    const waiting = new Map();
    browser.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && waiting.has(msg.id)) { const done = waiting.get(msg.id); waiting.delete(msg.id); done(msg); }
    });
    function bsend(method, params, sessionId) {
      const id = ++bn;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout ' + method)), 10000);
        waiting.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result || {}); });
        const body = { id, method, params: params || {} };
        if (sessionId) body.sessionId = sessionId;
        browser.send(JSON.stringify(body));
      });
    }
    const attached = await bsend('Target.attachToTarget', { targetId: worker.id, flatten: true });
    await bsend('Runtime.enable', {}, attached.sessionId);
    const out = await bsend('Runtime.evaluate', { expression: 'self.__b63FetchLog || []', returnByValue: true }, attached.sessionId);
    browser.close();
    return { log: (out.result && out.result.value) || [] };
  }
  const init = 'localStorage.setItem(\'boriken-b63-snapshot\', \'1\'); localStorage.setItem(\'boriken-b63-snapshot-date\', ' + JSON.stringify('2026-11-06') + '); localStorage.setItem(\'boriken-genetics-logbook-v1\', ' + JSON.stringify(JSON.stringify(state)) + ');';
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
  let failedBoot = null;
  for (const [w, h] of VIEWPORTS) {
    const since = Date.now();
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html?screen=tree' });
    let ready = null;
    for (let i = 0; i < 40 && !(ready && ready.ok); i++) {
      ready = await evaluate('(() => { const boot = window.__b63Boot || null; const errors = window.__b63Errors || []; const deps = { switchView: typeof switchView, b18BrPageHtml: typeof b18BrPageHtml, B49: !!(window.B49 && window.B49.openPage), B57: typeof B57 !== "undefined", B63: typeof B63 !== "undefined" }; return { controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller), boot: boot, deps: deps, errors: errors, ok: !!(boot && boot.ready && window.__b63RepairReady === true && deps.switchView === "function" && deps.b18BrPageHtml === "function" && deps.B49 && deps.B57 && deps.B63 && errors.length === 0) }; })()');
      if (!ready || !ready.ok) await sleep(50);
    }
    const scripts = [...net.values()].filter((row) => row.t >= since && /\/[^/]+\.js$/.test(row.url) && row.url.indexOf('service-worker.js') < 0);
    emit('FETCHLOG viewport ' + w + 'x' + h + ' boot=' + (ready && ready.ok ? 'ok' : 'fail') + ' scripts=' + scripts.length + ' failed=' + scripts.filter((row) => row.done === 'fail').length + ' controller=' + !!(ready && ready.controller));
    if (!ready || !ready.ok) { failedBoot = { w: w, h: h, since: since, ready: ready, scripts: scripts }; break; }
  }
  clearInterval(poll);
  if (!failedBoot) {
    [...targets.keys()].filter((key) => key.indexOf('chrome-extension://') >= 0).forEach((key) => emit('FETCHLOG target ' + key));
    emit('FETCHLOG DECISION NO-FAILURE');
    proc.kill('SIGKILL');
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
    return;
  }
  const ext = [...targets.keys()].filter((key) => key.indexOf('chrome-extension://') >= 0);
  ext.forEach((key) => emit('FETCHLOG target ' + key));
  let swLog = [];
  let logRead = false;
  try {
    const read = await readWorkerLog();
    if (read.log) { swLog = read.log; logRead = true; emit('FETCHLOG swEvents=' + swLog.length); }
    else emit('FETCHLOG swlog=' + (read.error || 'empty'));
  } catch (e) { emit('FETCHLOG swlog=unavailable ' + (e && e.message ? e.message : e)); }
  function pathOf(url) { try { return decodeURIComponent(new URL(url).pathname); } catch (e) { return url; } }
  const failed = failedBoot.scripts.filter((row) => row.done === 'fail').map((row) => {
    const events = swLog.filter((entry) => pathOf(entry.url) === pathOf(row.url));
    const resolved = events.filter((entry) => entry.phase === 'resolved').pop();
    const rejected = events.filter((entry) => entry.phase === 'rejected').pop();
    return {
      path: pathOf(row.url), pageSent: true, browser: row.done, error: row.err, response: row.resp ? row.status : 'absent', fromServiceWorker: row.resp ? row.sw : 'absent',
      swReceived: events.some((entry) => entry.phase === 'received'), swResolved: !!resolved, swRejected: !!rejected,
      swIsResponse: !!(resolved && resolved.isResponse), swStatus: resolved ? resolved.status : '', swMessage: rejected ? rejected.message : '',
    };
  });
  failedBoot.scripts.filter((row) => row.done !== 'fail').forEach((row) => emit('FETCHLOG script ok ' + pathOf(row.url) + ' response=' + (row.resp ? row.status : 'absent') + ' fromServiceWorker=' + (row.resp ? row.sw : 'absent')));
  failed.forEach((row) => emit('FETCHLOG script fail ' + row.path + ' pageSent=' + row.pageSent + ' browser=' + row.browser + ' error=' + row.error + ' response=' + row.response + ' fromServiceWorker=' + row.fromServiceWorker + ' swReceived=' + row.swReceived + ' swResolved=' + row.swResolved + ' swStatus=' + row.swStatus + ' swIsResponse=' + row.swIsResponse + ' swRejected=' + row.swRejected + (row.swMessage ? ' swMessage=' + row.swMessage : '')));
  const decision = decide(failed, ext.length > 0, logRead);
  emit('FETCHLOG DECISION ' + decision);
  emit('FETCHLOG boot ' + JSON.stringify(failedBoot.ready));
  proc.kill('SIGKILL');
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(1);
})().catch((e) => { fs.writeSync(2, 'FAIL ' + (e && e.message ? e.message : e) + '\n'); process.exit(1); });
