'use strict';
/*
  R18 read-only startup diagnostic. It does not change the app, the service
  worker, the cache, or the repair, and it does not retry a launch.

  Generic fixture only. No real records.

  From the app tree:
    node scripts/b63-startup-diag.js
  Against the failing snapshot:
    node scripts/b63-startup-diag.js --root /absolute/path/to/app

  The observation window is not the app's ready loop. Each launch is dumped
  at --deadline (default 8000ms) if it has not settled, including the request
  list as it stood at 2000ms. Optional --latency and --cpu are off unless
  passed. Chrome stderr is kept. The process always exits.

  Exit 0: every launch settled within 2000ms.
  Exit 2: a launch was still open at 2000ms or at the deadline. The trace is
  on stdout. That is the evidence, not a failed retry.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  return process.argv[i + 1];
}
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..')));
const CHROME = process.env.CHROME || '/opt/google/chrome/chrome';
const DEADLINE = Math.max(2000, Number(arg('--deadline', '8000')) || 8000);
const LATENCY = Math.max(0, Number(arg('--latency', '0')) || 0);
const CPU = Math.max(0, Number(arg('--cpu', '0')) || 0);
const MARKERS = [
  ['app.js', 'switchView'],
  ['build18.js', 'b18BrPageHtml'],
  ['build32.js', 'B32'],
  ['build35.js', 'B35'],
  ['build40.js', 'B40'],
  ['build41.js', 'B41'],
  ['build46.js', 'B46'],
  ['build48.js', 'B48'],
  ['build49.js', 'B49'],
  ['build53.js', 'B53'],
  ['build57.js', 'B57'],
  ['build58.js', 'B58'],
  ['build59.js', 'B59'],
  ['build60.js', 'B60'],
  ['build63.js', 'B63'],
];
const state = {
  plants: [{ id: 'p-target', name: 'Kept Plant', status: 'active', count: 2, startDate: '2024-03-01', vegStartDate: '2024-03-20', flowerStartDate: '2024-05-01', plannedFlipDate: '2024-05-01', b49Mother: 'mf:m1', b49Father: 'dx:FixtureFather', b58Manual: { m: true, f: true } }],
  motherFatherPlants: [{ id: 'm1', name: 'Kept Mother', role: 'mother', status: 'Active' }],
  breedingPlants: [], breedingProjects: [], cloneRuns: [],
};
const repair = JSON.stringify({ repairs: [{ recordId: 'p-target', collection: 'plants', field: 'b49Father', expect: 'dx:FixtureFather' }], undos: [] });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function stamp() { return Date.now(); }
function pathOf(url) {
  try { return decodeURIComponent(new URL(url).pathname); }
  catch (e) { return String(url || '').slice(0, 180); }
}
function interesting(url) {
  const p = pathOf(url);
  return /\.(js|css|html|json|webmanifest)$/i.test(p) || /\/b63-repair\.json$/.test(p) || p.endsWith('/index.html') || p === '/';
}

function main() {
  if (!fs.existsSync(CHROME)) {
    console.error('DIAG chrome missing at ' + CHROME);
    process.exit(2);
  }
  if (!fs.existsSync(path.join(ROOT, 'index.html')) || !fs.existsSync(path.join(ROOT, 'service-worker.js'))) {
    console.error('DIAG app root is not a logbook tree: ' + ROOT);
    process.exit(2);
  }
  return run().catch((e) => {
    console.error('DIAG crashed ' + (e && e.stack || e));
    process.exit(2);
  });
}

async function run() {
  const serverLog = [];
  const inflight = new Map();
  let serverSeq = 0;
  const probe = http.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }));
  const debugProbe = http.createServer();
  const debug = await new Promise((resolve) => debugProbe.listen(0, '127.0.0.1', () => { const p = debugProbe.address().port; debugProbe.close(() => resolve(p)); }));
  const server = http.createServer((req, res) => {
    const id = ++serverSeq;
    const started = stamp();
    inflight.set(id, { id, method: req.method, url: req.url, started });
    let logged = false;
    const done = () => {
      if (logged) return;
      logged = true;
      inflight.delete(id);
      serverLog.push({ id, method: req.method, url: req.url, status: res.statusCode, ms: stamp() - started, bytes: res.__bytes || 0 });
    };
    res.on('finish', done);
    res.on('close', done);
    const end = res.end;
    res.end = function (chunk, enc, cb) {
      if (chunk) res.__bytes = (res.__bytes || 0) + Buffer.byteLength(chunk);
      return end.call(this, chunk, enc, cb);
    };
    let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (rel === '/b63-repair.json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(repair);
      return;
    }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if ((!file.startsWith(ROOT + path.sep) && file !== ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end('missing');
      return;
    }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pdf': 'application/pdf' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-startup-diag-'));
  const chromeErr = [];
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--user-data-dir=' + dir, '--remote-debugging-port=' + debug, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stdout.on('data', (buf) => { if (chromeErr.length < 40) chromeErr.push(String(buf).slice(0, 500)); });
  proc.stderr.on('data', (buf) => { if (chromeErr.length < 40) chromeErr.push(String(buf).slice(0, 500)); });
  const requests = new Map();
  const pageLogs = [];
  const workerLogs = [];
  const workerSessions = new Set();
  const phases = [];
  let failed = false;
  const watchdog = setTimeout(() => {
    console.error('DIAG hard stop after 120s');
    try { proc.kill('SIGKILL'); } catch (e) {}
    process.exit(2);
  }, 120000);
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:' + debug + '/json/list')).json();
        page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch (e) { await sleep(100); }
    }
    if (!page) throw new Error('chrome did not open');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let n = 0;
    const pending = new Map();
    function noteRequest(session, method, params) {
      const id = params && params.requestId;
      if (!id) return;
      const key = (session || 'page') + ':' + id;
      const row = requests.get(key) || { id, session: session || 'page', url: '', type: '', will: 0, response: 0, finished: 0, failed: '', status: 0, mime: '', fromServiceWorker: false, fromDiskCache: false, servedFromCache: false, protocol: '', encoded: 0 };
      if (params.request && params.request.url) row.url = params.request.url;
      if (params.type) row.type = params.type;
      if (method === 'Network.requestWillBeSent' && !row.will) row.will = stamp();
      if (method === 'Network.responseReceived') {
        row.response = stamp();
        const response = params.response || {};
        row.status = response.status || 0;
        row.mime = response.mimeType || '';
        row.fromServiceWorker = !!response.fromServiceWorker;
        row.fromDiskCache = !!response.fromDiskCache;
        row.protocol = response.protocol || '';
      }
      if (method === 'Network.loadingFinished') { row.finished = stamp(); row.encoded = params.encodedDataLength || 0; }
      if (method === 'Network.loadingFailed') { row.failed = (params.errorText || 'failed') + (params.canceled ? ' canceled' : ''); row.finished = stamp(); }
      if (method === 'Network.requestServedFromCache') row.servedFromCache = true;
      requests.set(key, row);
    }
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const session = msg.sessionId || '';
      if (msg.method === 'Network.requestWillBeSent' || msg.method === 'Network.responseReceived' || msg.method === 'Network.loadingFinished' || msg.method === 'Network.loadingFailed' || msg.method === 'Network.requestServedFromCache') {
        noteRequest(session, msg.method, msg.params || {});
      }
      if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') {
        const text = msg.method === 'Runtime.exceptionThrown'
          ? 'exception ' + ((msg.params.exceptionDetails && (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text)) || '')
          : (msg.params.type + ' ' + (msg.params.args || []).map((a) => a.value || a.description || a.type || '').join(' '));
        const bucket = session && workerSessions.has(session) ? workerLogs : pageLogs;
        if (bucket.length < 80) bucket.push((session ? 'worker ' : 'page ') + text.slice(0, 300));
      }
      if (msg.method === 'Target.attachedToTarget') {
        const info = msg.params && msg.params.targetInfo;
        const sid = msg.params && msg.params.sessionId;
        if (sid && info && (info.type === 'service_worker' || info.type === 'worker')) {
          workerSessions.add(sid);
          if (typeof armWorker === 'function') armWorker(sid);
        }
      }
      if (msg.id && pending.has(msg.id)) {
        const done = pending.get(msg.id);
        pending.delete(msg.id);
        done(msg);
      }
    });
    function send(method, params, sessionId, timeout) {
      const id = ++n;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('timeout ' + method)); }, timeout || 8000);
        pending.set(id, (msg) => {
          clearTimeout(timer);
          if (msg.error) reject(new Error(method + ' ' + JSON.stringify(msg.error).slice(0, 240)));
          else resolve(msg.result || {});
        });
        const body = { id, method, params: params || {} };
        if (sessionId) body.sessionId = sessionId;
        ws.send(JSON.stringify(body));
      });
    }
    async function evaluate(expression, timeout) {
      try {
        const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, '', timeout || 3000);
        if (out.exceptionDetails) return { evaluateError: JSON.stringify(out.exceptionDetails).slice(0, 400) };
        return out.result && out.result.value;
      } catch (e) {
        return { evaluateError: String(e && e.message || e) };
      }
    }
    function armWorker(sessionId) {
      send('Network.enable', {}, sessionId).catch(() => {});
      send('Runtime.enable', {}, sessionId).catch(() => {});
    }
    const init = 'localStorage.setItem("boriken-b63-snapshot","1"); localStorage.setItem("boriken-b63-snapshot-date","2026-11-06"); localStorage.setItem("boriken-genetics-logbook-v1", ' + JSON.stringify(JSON.stringify(state)) + ');';
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await send('Network.enable');
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    if (CPU > 0) await send('Emulation.setCPUThrottlingRate', { rate: CPU }).catch((e) => pageLogs.push('cpu throttle ' + e.message));
    const markerExpr = MARKERS.map((pair) => JSON.stringify(pair[1]) + ': typeof ' + pair[1]).join(',');
    const snapExpr = '(() => { let father = ""; try { father = (state.plants.find((r) => r.id === "p-target") || {}).b49Father || ""; } catch (e) { father = "unread"; } const nav = (performance.getEntriesByType("navigation")[0]) || {}; return { readyState: document.readyState, repair: window.__b63RepairReady === true, detail: window.__b63RepairState || null, boot: window.__b63Boot || null, errors: window.__b63Errors || [], controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller), controllerUrl: (navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL) || "", online: navigator.onLine, father, markers: { ' + markerExpr + ' }, nav: { type: nav.type || "", dcl: Math.round(nav.domContentLoadedEventEnd || 0), load: Math.round(nav.loadEventEnd || 0), dur: Math.round(nav.duration || 0), workerStart: Math.round(nav.workerStart || 0), transfer: nav.transferSize || 0, status: nav.responseStatus || 0 } }; })()';
    const cacheExpr = '(async () => { const names = typeof caches === "undefined" ? [] : await caches.keys(); const cachesOut = []; for (const name of names) { const cache = await caches.open(name); const keys = await cache.keys(); const heads = {}; for (const file of ["app.js","build18.js","build49.js","build57.js","build63.js","service-worker.js","b63-repair.json","index.html"]) { const res = await cache.match("./" + file); if (!res) { heads[file] = null; continue; } const buf = new Uint8Array(await res.clone().arrayBuffer()); let head = ""; for (let i = 0; i < Math.min(buf.length, 48); i++) head += (buf[i] >= 32 && buf[i] < 127) ? String.fromCharCode(buf[i]) : "."; heads[file] = { status: res.status, type: res.headers.get("content-type") || "", bytes: buf.length, head }; } const namesOnly = keys.map((r) => { try { return new URL(r.url).pathname.split("/").pop(); } catch (e) { return ""; } }); const wanted = ["app.js","build18.js","build49.js","build57.js","build63.js","service-worker.js","b63-repair.json","index.html"]; cachesOut.push({ name, count: keys.length, missing: wanted.filter((file) => namesOnly.indexOf(file) < 0), heads }); } let reg = null; try { const r = await navigator.serviceWorker.getRegistration(); reg = r ? { scope: r.scope, active: r.active && r.active.state, installing: r.installing && r.installing.state, waiting: r.waiting && r.waiting.state, script: r.active && r.active.scriptURL } : null; } catch (e) { reg = { error: String(e && e.message || e) }; } return { caches: cachesOut, reg }; })()';
    function copyRequests(since) {
      const rows = [];
      for (const row of requests.values()) {
        if (row.finished && row.will && row.will < since) continue;
        rows.push(row);
      }
      return rows;
    }
    function describe(rows, since) {
      return rows.map((row) => {
        const pendingReq = !row.finished;
        return {
          pending: pendingReq,
          age: row.will ? (row.finished || stamp()) - row.will : 0,
          session: workerSessions.has(row.session) ? 'worker' : 'page',
          type: row.type,
          status: row.status,
          mime: row.mime,
          fromServiceWorker: row.fromServiceWorker,
          fromDiskCache: row.fromDiskCache,
          servedFromCache: row.servedFromCache,
          failed: row.failed,
          encoded: row.encoded,
          path: pathOf(row.url),
        };
      }).filter((row) => row.pending || interesting(row.path));
    }
    async function launch(label, offline) {
      const since = stamp();
      const serverFrom = serverLog.length;
      if (offline) await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      else await send('Network.emulateNetworkConditions', { offline: false, latency: LATENCY, downloadThroughput: -1, uploadThroughput: -1 });
      for (const sid of workerSessions) armWorker(sid);
      await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html?' + label });
      let snap = null;
      let at2 = null;
      let readyAt = 0;
      while (stamp() - since < DEADLINE) {
        snap = await evaluate(snapExpr);
        const elapsed = stamp() - since;
        const ready = snap && snap.repair === true && snap.boot && snap.boot.ready === true && !snap.evaluateError;
        if (ready) { readyAt = elapsed; break; }
        if (!at2 && elapsed >= 2000) at2 = { elapsed, settled: false, snap, requests: describe(copyRequests(since), since), serverInflight: [...inflight.values()].map((row) => row.url) };
        await sleep(200);
      }
      if (readyAt && readyAt < 2000) at2 = { elapsed: readyAt, settled: true, requests: [] };
      else if (!at2) at2 = { elapsed: stamp() - since, settled: false, snap, requests: describe(copyRequests(since), since), serverInflight: [...inflight.values()].map((row) => row.url) };
      const finalSnap = snap;
      const ready = !!(finalSnap && finalSnap.repair === true && finalSnap.boot && finalSnap.boot.ready === true && !finalSnap.evaluateError && readyAt && readyAt < 2000);
      const cache = await evaluate(cacheExpr, 5000);
      for (const sid of workerSessions) armWorker(sid);
      const phase = {
        label,
        offline: !!offline,
        readyWithin2s: ready,
        readyAt,
        deadline: DEADLINE,
        at2,
        finalSnap,
        cache,
        requests: describe(copyRequests(since), since),
        server: serverLog.slice(serverFrom),
        serverInflight: [...inflight.values()].map((row) => ({ url: row.url, age: stamp() - row.started })),
      };
      phases.push(phase);
      printPhase(phase);
      if (!ready) failed = true;
      return phase;
    }
    console.log('DIAG root ' + ROOT);
    console.log('DIAG deadline ' + DEADLINE + 'ms latency ' + LATENCY + ' cpu ' + CPU);
    console.log('DIAG chrome ' + CHROME + ' port ' + port);
    await launch('first', false);
    await launch('second', false);
    const waitStart = stamp();
    let controlled = false;
    let controlSnap = null;
    while (stamp() - waitStart < DEADLINE) {
      controlSnap = await evaluate('!!(navigator.serviceWorker && navigator.serviceWorker.controller)');
      if (controlSnap === true) { controlled = true; break; }
      for (const sid of workerSessions) armWorker(sid);
      await sleep(200);
    }
    console.log('DIAG controller ' + controlled + ' after ' + (stamp() - waitStart) + 'ms workers ' + workerSessions.size);
    await launch('controlled', false);
    await launch('offline', true);
    console.log('DIAG page-log ' + (pageLogs.slice(-8).join(' | ') || '(none)'));
    console.log('DIAG worker-log ' + (workerLogs.slice(-8).join(' | ') || '(none)'));
    console.log('DIAG chrome-stderr ' + (chromeErr.join(' | ').replace(/\s+/g, ' ').slice(0, 500) || '(none)'));
    const open = phases.filter((phase) => !phase.readyWithin2s).map((phase) => phase.label);
    console.log('DIAG result ' + (open.length ? 'NOT-READY ' + open.join(',') : 'all-launches-ready-within-2s'));
  } finally {
    clearTimeout(watchdog);
    try { proc.kill('SIGKILL'); } catch (e) {}
    server.close();
    await sleep(200);
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 }); } catch (e) {}
  }
  process.exit(failed ? 2 : 0);
}

function stoppedAt(markers) {
  if (!markers) return 'no markers';
  let last = 'before app.js';
  for (const pair of MARKERS) {
    const value = markers[pair[1]];
    if (value === 'function' || value === 'object') last = pair[0] + ' ' + pair[1] + '=' + value;
    else return last + ' ; next missing ' + pair[0] + ' ' + pair[1] + '=' + value;
  }
  return last + ' ; all listed markers present';
}

function printPhase(phase) {
  const snap = phase.finalSnap || {};
  const line = (row) => row.age + 'ms ' + row.session + ' ' + (row.type || '?') + ' ' + row.path + (row.status ? ' status=' + row.status + ' mime=' + row.mime + ' sw=' + row.fromServiceWorker : ' no-response') + (row.failed ? ' ' + row.failed : '');
  const pending = (phase.requests || []).filter((row) => row.pending).sort((a, b) => (a.session === b.session ? 0 : a.session === 'page' ? -1 : 1) || b.age - a.age);
  const at2pending = phase.at2 && phase.at2.settled ? [] : ((phase.at2 && phase.at2.requests) || []).filter((row) => row.pending);
  console.log('PHASE ' + phase.label + ' readyWithin2s=' + phase.readyWithin2s + ' readyAt=' + (phase.readyAt || 0) + ' offline=' + phase.offline);
  console.log('  boot ' + JSON.stringify({ repair: snap.repair, boot: snap.boot ? { ready: snap.boot.ready, errors: snap.boot.errors } : null, detail: snap.detail, controller: snap.controller, online: snap.online, father: snap.father, readyState: snap.readyState, errors: snap.errors, nav: snap.nav, evaluateError: snap.evaluateError || '' }));
  console.log('  markers ' + stoppedAt(snap.markers));
  console.log('  pending-now ' + pending.length + ' ' + pending.slice(0, 24).map(line).join(' || '));
  console.log('  pending-at-2s ' + (phase.at2 && phase.at2.settled ? 'settled ' + phase.at2.elapsed + 'ms' : at2pending.length + ' ' + at2pending.slice(0, 24).map(line).join(' || ')));
  const finished = (phase.requests || []).filter((row) => !row.pending && interesting(row.path));
  const focus = finished.filter((row) => /\/(index\.html|app\.js|build18\.js|build48\.js|build49\.js|build51\.js|build57\.js|build58\.js|build63\.js|service-worker\.js|b63-repair\.json)$/.test(row.path) || row.failed || row.age >= 500);
  console.log('  finished-focus ' + focus.map(line).join(' || ') + ' otherFinished=' + Math.max(0, finished.length - focus.length));
  console.log('  server ' + (phase.server || []).filter((row) => interesting(row.url) && /\/(index\.html|app\.js|build18\.js|build49\.js|build57\.js|build63\.js|service-worker\.js|b63-repair\.json)$/.test(row.url.split('?')[0])).map((row) => row.status + ' ' + row.ms + 'ms ' + row.url).join(' || '));
  console.log('  server-inflight ' + JSON.stringify(phase.serverInflight || []));
  console.log('  cache ' + JSON.stringify(phase.cache || null));
}

main();
