'use strict';
/*
  Local renderer for a private plant-only fixture. This file does not contain
  records. A missing fixture, a missing target, or a page that did not render
  stops the script. It does not substitute synthetic records.

  Screens: tree, plants, mf, compliance, inspection.
  tree requires --record-id. The id is looked up in the fixture.

  --repair-config <private-file> is served at the app's normal b63-repair.json
  path for that isolated browser only. Omit it to leave the repair off.
  --phase before serves an empty repair file. --phase after requires the
  private repair file. The script does not edit the page after startup.

  Viewports default to 390x844, 1024x768, and 1024x1366.
  The picture is the viewport, not the scrolled page. Wide shots keep the 1.28 text zoom.

  Plant fields the file may include. Omit a field when the record does not have it.
  The script does not fill a date, a stage, or a count.
  plants[].startDate "2026-03-01"
  plants[].vegStartDate "2026-03-20"
  plants[].flowerStartDate "2026-05-01"
  plants[].plannedFlipDate "2026-05-01"
  plants[].harvestDate "2026-07-01"
  plants[].status "active" | "harvest" | "drying" | "curing" | "finished" | "archived"
  plants[].growthStage only when the record already stores one
  plants[].growType "Photoperiod" or "Autoflower"
  plants[].count 4
  plants[].expectedVegDays 21
  plants[].expectedFlowerDays 56
  plants[].source "seed" or "clone"
  plants[].b58DeletedAt "2026-01-02T00:00:00.000Z" only for a recorded deletion
  plants[].grade { "verdict": "cull" }
  motherFatherPlants[].status "Active" | "Retired" | "Culled"
  motherFatherPlants[].archived true
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const trace = require('./b63-fail-trace');
trace.applyArgs();
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const SCREENS = ['tree', 'plants', 'mf', 'compliance', 'inspection'];
const VIEWPORTS = [[390, 844], [1024, 768], [1024, 1366]];
const DATE_FIELDS = ['startDate', 'vegStartDate', 'flowerStartDate', 'flowerFlipDate', 'plannedFlipDate', 'harvestDate', 'archivedAt', 'dryStartDate', 'dryEndDate', 'cureStartDate', 'cureEndDate', 'finishedDate', 'completedAt'];
const SHORT_FIELDS = ['statusOverride', 'growthStage', 'complianceStage', 'growType', 'location', 'areaOrRoom', 'cultivar', 'crossLabel', 'source', 'b58DeletedAt'];
const NUM_FIELDS = ['count', 'expectedVegDays', 'expectedFlowerDays', 'seedsPopped'];
const PLANT_FIELDS = ['id', 'name', 'status', 'archived', 'deleted', 'b49Mother', 'b49Father', 'b58Manual', 'b58DeletedParents', 'b49ProjectId', 'motherId', 'fatherId', 'motherPlantId', 'grade', 'treeStyle', ...DATE_FIELDS, ...SHORT_FIELDS, ...NUM_FIELDS];
const ALLOWED = {
  plants: PLANT_FIELDS,
  breedingPlants: PLANT_FIELDS,
  motherFatherPlants: ['id', 'name', 'role', 'status', 'archived', 'deleted', 'b49Mother', 'b49Father', 'b58Manual', 'b58DeletedAt', 'b58DeletedParents', 'promotedFrom', 'startDate', 'treeStyle'],
  breedingProjects: ['id', 'name', 'status', 'motherId', 'fatherId', 'mother', 'father', 'b49Mother', 'b49Father', 'b58Manual', 'treeStyle'],
  cloneRuns: ['id', 'name', 'srcId', 'srcColl', 'motherPlantId', 'status'],
};
const KEY = { plants: 'pl', breedingPlants: 'bp', motherFatherPlants: 'mf', breedingProjects: 'pr' };
const FORBIDDEN = /note|photo|patient|credential|password|token|medical|address|certif/i;
const EMPTY_REPAIR = '{"repairs":[],"undos":[]}\n';

function fail(message) {
  if (trace.active()) trace.dump(message);
  const err = new Error(message);
  err.b63fail = true;
  throw err;
}
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}
function checkRecord(row, fields, where) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail(where + ' is not a record');
  if (typeof row.id !== 'string' || !row.id) fail(where + ' has no id');
  Object.keys(row).forEach((key) => {
    if (!fields.includes(key)) fail(where + ' has a field outside the relationship list: ' + key);
    if (FORBIDDEN.test(key)) fail(where + ' has a private field: ' + key);
    const value = row[key];
    if (DATE_FIELDS.includes(key) || SHORT_FIELDS.includes(key) || key === 'b58DeletedAt' || key === 'startDate') {
      if (value != null && (typeof value !== 'string' || value.length > 80)) fail(where + ' ' + key + ' must be a short string. Leave it out when it is unknown.');
    } else if (NUM_FIELDS.includes(key)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) fail(where + ' ' + key + ' must be a number. Leave it out when it is unknown.');
    } else if (key === 'deleted' || key === 'archived') {
      if (typeof value !== 'boolean') fail(where + ' ' + key + ' must be true or false');
    } else if (key === 'b58DeletedParents') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where + ' b58DeletedParents must be an object');
      Object.keys(value).forEach((side) => {
        if (side !== 'm' && side !== 'f') fail(where + ' b58DeletedParents only allows m and f');
        const entry = value[side];
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(where + ' b58DeletedParents.' + side + ' must be an object');
        Object.keys(entry).forEach((ek) => {
          if (ek !== 'key' && ek !== 'name' && ek !== 'at') fail(where + ' b58DeletedParents.' + side + ' only allows key, name, and at');
        });
        if (typeof entry.key !== 'string' || !entry.key || typeof entry.name !== 'string' || !entry.name) fail(where + ' b58DeletedParents.' + side + ' needs the old record key and the name');
      });
    } else if (key === 'treeStyle') {
      if (!Number.isInteger(value) || value < 1 || value > 8) fail(where + ' treeStyle must be an integer from 1 to 8');
    } else if (key === 'grade') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) fail(where + ' grade must be an object');
      Object.keys(value).forEach((gk) => {
        if (gk !== 'verdict' && gk !== 'scores') fail(where + ' grade only allows verdict and scores');
        if (FORBIDDEN.test(gk)) fail(where + ' grade has a private field');
      });
    }
  });
  if (row.promotedFrom && (typeof row.promotedFrom !== 'object' || Array.isArray(row.promotedFrom))) fail(where + ' promotedFrom is not a link');
}
function readFixture(file) {
  if (!file) fail('pass --fixture <private-plant-file>. No fixture is bundled and no synthetic records are used.');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail('fixture file is missing: ' + file);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { fail('fixture is not JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('fixture must be an object');
  Object.keys(parsed).forEach((key) => {
    if (!ALLOWED[key]) fail('fixture has a section that is not a plant relationship list: ' + key);
  });
  const state = { plants: [], breedingPlants: [], motherFatherPlants: [], breedingProjects: [], cloneRuns: [] };
  let count = 0;
  Object.keys(ALLOWED).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(parsed, key)) return;
    if (!Array.isArray(parsed[key])) fail(key + ' must be an array');
    parsed[key].forEach((row, i) => checkRecord(row, ALLOWED[key], key + '[' + i + ']'));
    state[key] = parsed[key];
    count += parsed[key].length;
  });
  if (!count) fail('fixture has no relationship records');
  return state;
}
function findRecord(state, id) {
  if (!id) return null;
  for (const key of Object.keys(KEY)) {
    const row = (state[key] || []).find((r) => r && r.id === id);
    if (row) return { list: key, row, appKey: KEY[key] + ':' + id };
  }
  return null;
}
function parseViewports(text) {
  if (!text) return VIEWPORTS.slice();
  const m = /^(\d+)x(\d+)$/.exec(text);
  if (!m) fail('--viewport must look like 390x844');
  return [[Number(m[1]), Number(m[2])]];
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function freePort() {
  return new Promise((resolve) => {
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const assigned = probe.address().port;
      probe.close(() => resolve(assigned));
    });
  });
}
function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function runBrowser(opts) {
  const port = await freePort();
  const debugPort = await freePort();
  let repairBody = EMPTY_REPAIR;
  if (opts.phase === 'after') {
    if (!opts.repairConfig) fail('--phase after requires --repair-config');
    if (!fs.existsSync(opts.repairConfig)) fail('repair config is missing');
    repairBody = fs.readFileSync(opts.repairConfig, 'utf8');
  } else if (opts.repairConfig && opts.phase !== 'before') {
    if (!fs.existsSync(opts.repairConfig)) fail('repair config is missing');
    repairBody = fs.readFileSync(opts.repairConfig, 'utf8');
  }
  const server = http.createServer((req, res) => {
    if (trace.active()) trace.server(req, res);
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/__swdiag' && req.method === 'POST' && process.env.B63_SW_DIAG === '1') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => { trace.noteSw(Buffer.concat(chunks).toString('utf8')); res.statusCode = 204; res.end(); });
      return;
    }
    if (rel === '/service-worker.js' && process.env.B63_SW_DIAG === '1') rel = '/scripts/b63-sw-diag.js';
    if (rel === '/b63-repair.json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(repairBody);
      return;
    }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end('no'); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      if (rel !== '/favicon.ico') missing.push(rel);
      res.statusCode = 404; res.end('missing'); return;
    }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  const missing = [];
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-real-mockup-'));
  let proc = null;
  try {
  const failLog = process.env.B63_FAIL_LOG === '1';
  const captureBrowser = failLog || process.env.B63_SW_DIAG === '1' || trace.active();
  const chromeErr = [];
  const chromeOut = [];
  // Test Chrome only. These flags keep extension workers out of the throwaway profile.
  // They do not establish that those workers caused the intermittent boot failure.
  proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-extensions', '--disable-component-extensions-with-background-pages',
    '--user-data-dir=' + dir, '--remote-debugging-port=' + debugPort, 'about:blank',
  ], { stdio: captureBrowser ? ['ignore', 'pipe', 'pipe'] : 'ignore' });
  function takePipe(stream, bucket) {
    if (!stream) return;
    stream.on('data', (buf) => {
      if (trace.active() && bucket === chromeErr) trace.noteChrome(buf);
      const line = String(buf).replace(/\s+/g, ' ').trim();
      if (!line) return;
      bucket.push(line.slice(0, 400));
      if (bucket.length > 30) bucket.shift();
    });
  }
  takePipe(proc.stdout, chromeOut);
  takePipe(proc.stderr, chromeErr);
  let init = 'localStorage.setItem(\'boriken-b63-snapshot\', \'1\'); localStorage.setItem(\'boriken-b63-snapshot-date\', ' + JSON.stringify(opts.snapshotDate) + ');';
  if (opts.factor !== 'fixture') init += ' localStorage.setItem(\'boriken-genetics-logbook-v1\', ' + JSON.stringify(JSON.stringify(opts.state)) + ');';
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
        page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch (e) { await sleep(100); }
    }
    if (!page) fail('chrome did not open');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let n = 0;
    const pending = new Map();
    const logs = [];
    const observe = !!opts.factor;
    const net = new Map();
    function pathOf(url) {
      try { return decodeURIComponent(new URL(url).pathname); }
      catch (e) { return ''; }
    }
    function noteNet(msg) {
      if (!observe && !failLog && !trace.active()) return;
      const params = msg.params || {};
      if (msg.method === 'Network.requestWillBeSent' && params.requestId) {
        net.set(params.requestId, { url: (params.request && params.request.url) || '', status: 0, failed: '', blocked: '', sw: false, done: false });
      }
      const row = params.requestId ? net.get(params.requestId) : null;
      if (!row) return;
      if (msg.method === 'Network.responseReceived') {
        row.status = (params.response && params.response.status) || 0;
        row.sw = !!(params.response && params.response.fromServiceWorker);
      }
      if (msg.method === 'Network.loadingFinished') row.done = true;
      if (msg.method === 'Network.loadingFailed') {
        row.failed = (params.errorText || 'failed') + (params.canceled ? ' canceled' : '');
        row.blocked = params.blockedReason || '';
        row.done = true;
      }
    }
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); }
      catch (e) { return; }
      try {
      noteNet(msg);
      if (trace.active()) trace.note(msg);
      if (msg.method === 'Target.attachedToTarget') {
        const sid = msg.params && msg.params.sessionId;
        const info = msg.params && msg.params.targetInfo;
        if (sid && info && (info.type === 'service_worker' || info.type === 'worker')) {
          if (trace.active()) trace.enableWorker(send, sid);
          else if (failLog) send('Runtime.enable', {}, sid).catch(() => {});
        }
      }
      if (msg.method === 'Runtime.consoleAPICalled') logs.push(msg.params.type + ' ' + (msg.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 240));
      if (msg.method === 'Runtime.exceptionThrown') logs.push('exception ' + ((msg.params.exceptionDetails && (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text)) || '').slice(0, 400));
      if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
      } catch (e) { /* a bad event must not drop the session */ }
    });
    function send(method, params, sessionId, timeout) {
      const id = ++n;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout ' + method)), timeout || 20000);
        pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result || {}); });
        const body = { id, method, params: params || {} };
        if (sessionId) body.sessionId = sessionId;
        ws.send(JSON.stringify(body));
      });
    }
    async function evaluate(expression) {
      const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (out.exceptionDetails) throw new Error('page ' + JSON.stringify(out.exceptionDetails));
      return out.result && out.result.value;
    }
    await send('Page.enable');
    await send('Runtime.enable');
    if (observe) await send('Network.enable');
    if (trace.active()) { await trace.arm(send); await trace.applyCpu(send); }
    else if (failLog) {
      await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
      await send('Network.enable');
    }
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    async function readReg() {
      try {
        return await evaluate('(() => { const sw = navigator.serviceWorker; if (!sw || !sw.getRegistration) return { controller: false, active: null, installing: null, waiting: null }; return sw.getRegistration().then((reg) => ({ controller: !!sw.controller, active: reg && reg.active && reg.active.state, installing: reg && reg.installing && reg.installing.state, waiting: reg && reg.waiting && reg.waiting.state })); })()');
      } catch (e) {
        return { error: String(e && e.message || e).slice(0, 160) };
      }
    }
    async function afterFailReport(w, h) {
      if (process.env.B63_AFTER_FAIL !== '1') return;
      const expression = '(async () => {'
        + 'function fileName(url) { try { return decodeURIComponent(new URL(url, location.href).pathname.split("/").pop()); } catch (e) { return String(url || "").split("/").pop(); } }'
        + 'const entries = (performance.getEntriesByType("resource") || []).filter((row) => fileName(row.name).slice(-3) === ".js");'
        + 'const byName = new Map(); entries.forEach((row) => byName.set(fileName(row.name), row));'
        + 'const tags = [...document.scripts].map((el) => fileName(el.src)).filter((name) => name && name.slice(-3) === ".js");'
        + 'function timing(name) { const row = byName.get(name); if (!row) return { name: name, entry: false, workerStart: "unknown", responseStatus: "unknown", transferSize: "unknown", decodedBodySize: "unknown", duration: "unknown", fetchStart: "unknown", responseEnd: "unknown" }; return { name: name, entry: true, workerStart: row.workerStart, responseStatus: row.responseStatus, transferSize: row.transferSize, decodedBodySize: row.decodedBodySize, duration: row.duration, fetchStart: row.fetchStart, responseEnd: row.responseEnd }; }'
        + 'const failed = []; tags.forEach((name) => { const row = byName.get(name); if (row && row.responseStatus === 0) failed.push(name); });'
        + 'byName.forEach((row, name) => { if (row.responseStatus === 0 && failed.indexOf(name) < 0) failed.push(name); });'
        + 'const noEntry = []; if (!failed.length) { let seenOk = false; tags.forEach((name) => { const row = byName.get(name); if (row && row.responseStatus === 200) seenOk = true; else if (seenOk && !row) noEntry.push(name); }); }'
        + 'const firstFailed = failed[0] || noEntry[0] || null;'
        + 'const wanted = ["build39w.js", "build40.js"];'
        + 'if (firstFailed && wanted.indexOf(firstFailed) < 0) wanted.push(firstFailed);'
        + 'failed.concat(noEntry).forEach((name) => { if (wanted.indexOf(name) < 0) wanted.push(name); });'
        + 'async function matchOne(name) { if (typeof caches === "undefined" || !caches.match) return { cacheStatus: null, bytes: null }; const keys = [new URL(name, location.href).href, "./" + name, name]; for (let i = 0; i < keys.length; i++) { try { const res = await caches.match(keys[i]); if (!res) continue; const bytes = (await res.clone().arrayBuffer()).byteLength; return { cacheStatus: res.status, bytes: bytes }; } catch (e) { return { cacheStatus: "error", bytes: null }; } } return { cacheStatus: null, bytes: null }; }'
        + 'const rows = []; for (let i = 0; i < wanted.length; i++) { const cache = await matchOne(wanted[i]); rows.push(Object.assign(timing(wanted[i]), cache)); }'
        + 'return { firstFailed: firstFailed, failedCount: failed.length, noEntryCount: noEntry.length, rows: rows };'
        + '})()';
      let diag = null;
      try { diag = await evaluate(expression); }
      catch (e) { diag = { error: String(e && e.message || e).slice(0, 240) }; }
      console.error('AFTERFAIL viewport ' + w + 'x' + h + ' ' + JSON.stringify({ firstFailed: diag && diag.firstFailed, failedCount: diag && diag.failedCount, noEntryCount: diag && diag.noEntryCount, error: diag && diag.error }));
      (diag && diag.rows || []).forEach((row) => console.error('AFTERFAIL-ROW ' + JSON.stringify(row)));
    }
    function reportScripts(w, h) {
      const rows = [...net.values()].filter((row) => row.url.indexOf('127.0.0.1') >= 0 && /\.js$/.test(pathOf(row.url)));
      const bad = rows.filter((row) => row.failed || (row.done && row.status !== 200));
      const open = rows.filter((row) => !row.done && !row.failed);
      console.log('DIFF SCRIPTS ' + w + 'x' + h + ' total=' + rows.length + ' failed=' + bad.length + ' open=' + open.length);
      bad.slice(0, 8).forEach((row) => console.log('DIFF SCRIPT-FAIL ' + w + 'x' + h + ' ' + pathOf(row.url) + ' status=' + row.status + ' ' + row.failed + ' blocked=' + row.blocked + ' sw=' + row.sw));
    }
    let bootFailed = '';
    for (const [w, h] of opts.viewports) {
      const emulateMobile = opts.factor === 'mobile' ? false : w < 900;
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: emulateMobile });
      if (trace.active()) trace.mark(opts.screen + ' ' + w + 'x' + h);
      if (observe) {
        const reg = await readReg();
        console.log('DIFF BEFORE ' + w + 'x' + h + ' epoch=' + Date.now() + ' mobile=' + emulateMobile + ' ' + JSON.stringify(reg));
        net.clear();
      }
      await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html?screen=' + opts.screen });
      let ready = null;
      for (let i = 0; i < 40 && !(ready && ready.ok); i++) {
        ready = await evaluate('(() => { const boot = window.__b63Boot || null; const errors = window.__b63Errors || []; const deps = { switchView: typeof switchView, b18BrPageHtml: typeof b18BrPageHtml, B49: !!(window.B49 && window.B49.openPage), B57: typeof B57 !== "undefined", B63: typeof B63 !== "undefined" }; return { repair: window.__b63RepairReady === true, detail: window.__b63RepairState || null, controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller), boot: boot, deps: deps, errors: errors, ok: !!(boot && boot.ready && window.__b63RepairReady === true && deps.switchView === "function" && deps.b18BrPageHtml === "function" && deps.B49 && deps.B57 && deps.B63 && errors.length === 0) }; })()');
        if (!ready || !ready.ok) await sleep(50);
      }
      if (observe) {
        reportScripts(w, h);
        console.log('DIFF BOOT ' + w + 'x' + h + ' ' + JSON.stringify(ready && { ok: !!ready.ok, repair: ready.repair, controller: ready.controller, deps: ready.deps, errors: (ready.errors || []).length }));
      }
      if (!ready || !ready.ok) {
        if (trace.active()) { await trace.readPage(send); if (trace.readWorkerMemory) await trace.readWorkerMemory(send); }
        if (failLog) {
          const rows = [...net.values()].filter((row) => row.url.indexOf('127.0.0.1') >= 0 && /\.js$/.test(pathOf(row.url)));
          const bad = rows.filter((row) => row.failed || (row.done && row.status !== 200));
          console.error('FAILLOG viewport ' + w + 'x' + h + ' scripts=' + rows.length + ' failed=' + bad.length);
          bad.slice(0, 8).forEach((row) => console.error('FAILLOG script ' + pathOf(row.url) + ' status=' + row.status + ' ' + row.failed + ' blocked=' + row.blocked + ' sw=' + row.sw));
          console.error('FAILLOG chrome-stderr ' + (chromeErr.join(' | ') || '(none)'));
          console.error('FAILLOG chrome-stdout ' + (chromeOut.join(' | ') || '(none)'));
          console.error('FAILLOG after-failure registration ' + JSON.stringify(await readReg()));
        }
        await afterFailReport(w, h);
        if (observe) {
          console.log('DIFF BOOT-FAIL ' + w + 'x' + h);
          bootFailed = w + 'x' + h;
          break;
        }
        fail('the app did not finish loading ' + JSON.stringify(ready) + ' ' + logs.slice(-6).join(' | '));
      }
      if (process.env.B63_SW_DIAG === '1' && trace.readWorkerMemory) {
        await trace.readWorkerMemory(send);
        console.error('SWMEM ' + (trace.memoryText ? trace.memoryText() : 'unread'));
      }
      const runChecks = async () => {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: emulateMobile });
      const opened = await evaluate(`(() => {
        const screen = ${JSON.stringify(opts.screen)};
        const key = ${JSON.stringify(opts.record ? opts.record.appKey : '')};
        if (screen === 'plants') { switchView('home'); return 'plants'; }
        if (screen === 'mf') { switchView('breeding'); if (!window.B41 || !B41.mfpOpen) return ''; B41.mfpOpen(); return 'mf'; }
        if (screen === 'compliance') { switchView('compliance'); return 'compliance'; }
        if (screen === 'inspection') { switchView('compliance'); const tab = document.getElementById('compliance-subtab-inspection'); if (!tab) return ''; tab.click(); return 'inspection'; }
        if (screen === 'tree') { switchView('breeding'); B49.openPage({ type: 'b49tree', key: key, forceStyle: 2 }); return 'tree'; }
        return '';
      })()`);
      if (opened !== opts.screen) fail('the ' + opts.screen + ' screen did not open');
      const thrown = logs.filter((line) => line.indexOf('exception ') === 0);
      if (thrown.length) fail('uncaught error after the scripts ran ' + thrown.join(' | '));
      let seen = null;
      let lastSeen = null;
      for (let i = 0; i < 40 && !seen; i++) {
        await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
        seen = await evaluate(`(() => {
          const screen = ${JSON.stringify(opts.screen)};
          const title = ${JSON.stringify(opts.record ? (opts.record.row.name || '') : '')};
          const key = ${JSON.stringify(opts.record ? opts.record.appKey : '')};
          const id = ${JSON.stringify(opts.record ? opts.record.row.id : '')};
          const list = ${JSON.stringify(opts.record ? opts.record.list : '')};
          const text = document.body.innerText || '';
          const heading = (document.querySelector('h2.b18-h1, #home-heading, #compliance-heading') || {}).textContent || '';
          let identity = false;
          if (screen === 'tree') {
            const view = document.getElementById('breeding-view');
            const h = view && view.querySelector('h2.b18-h1');
            const treeText = (view && view.innerText) || '';
            identity = !!(view && view.classList.contains('active') && h && h.textContent === 'Family tree' && title && treeText.toLowerCase().includes(String(title).toLowerCase()));
          } else if (screen === 'plants') {
            identity = document.querySelector('#home-view') && document.querySelector('#home-view').classList.contains('active') && (!title || text.includes(title));
          } else if (screen === 'mf') {
            identity = text.includes('Mothers') && text.includes('Fathers');
          } else if (screen === 'compliance') {
            identity = text.includes('Compliance');
          } else if (screen === 'inspection') {
            identity = text.includes('Inspection') && (text.includes('Plant code') || text.includes('Active immature'));
          }
          const card = document.querySelector('#breeding-view .b60-col > .b60-c, #breeding-view .b57');
          const readyCss = screen !== 'tree' || !!(card && getComputedStyle(card).minHeight !== '0px');
          let father = '';
          if (id && list === 'plants') {
            const row = (state.plants || []).find((r) => r.id === id);
            father = row ? String(row.b49Father || '') : '';
          }
          const others = (state.plants || []).filter((r) => r.id !== id).map((r) => r.id + ':' + String(r.b49Father || ''));
          const pageKey = (window.B18 && B18.brPage && B18.brPage.key) || '';
          const treeText = ((document.querySelector('#breeding-view') || {}).innerText || '').replace(/\\s+/g, ' ').slice(0, 240);
          return { identity, readyCss, heading, father, others, hasTitle: !title || text.toLowerCase().includes(String(title).toLowerCase()), pageKey, treeText };
        })()`);
        lastSeen = seen;
        if (!seen || !seen.identity || !seen.readyCss) { seen = null; await sleep(50); }
      }
      if (!seen || !seen.identity) fail('the ' + opts.screen + ' page did not render the requested record at ' + w + 'x' + h + ' ' + JSON.stringify({ heading: lastSeen && lastSeen.heading, pageKey: lastSeen && lastSeen.pageKey, treeText: lastSeen && lastSeen.treeText, readyCss: lastSeen && lastSeen.readyCss }) + ' ' + logs.slice(-4).join(' | '));
      if (opts.phase === 'before' && opts.record && opts.record.list === 'plants') {
        if (seen.father !== String(opts.record.row.b49Father || '')) fail('before launch changed the father');
      }
      if (opts.phase === 'after' && opts.record && opts.record.list === 'plants') {
        if (seen.father !== '-') fail('after launch did not clear the configured father');
        const expectedOthers = (opts.state.plants || []).filter((r) => r.id !== opts.record.row.id).map((r) => r.id + ':' + String(r.b49Father || ''));
        if (JSON.stringify(seen.others) !== JSON.stringify(expectedOthers)) fail('after launch changed another plant');
      }
      if (opts.screen === 'compliance') {
        const clock = await evaluate('(() => { const raw = ' + JSON.stringify(opts.snapshotDate) + '; const m = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(raw); const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); const expected = day.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase(); const text = document.body.innerText || ""; return { expected, ok: text.indexOf(expected) >= 0 }; })()');
        if (!clock || !clock.ok) fail('compliance header is not the snapshot date ' + JSON.stringify(clock));
      }
      const target = opts.screen === 'plants' && opts.record && opts.record.list === 'plants' ? opts.record.row : null;
      const targetFather = target ? String(target.b49Father || '') : '';
      const liveBlank = !!(target && (!targetFather || targetFather === '-' || (opts.phase === 'after' && seen.father === '-')));
      if (liveBlank) {
        let labeled = null;
        for (let i = 0; i < 30 && !(labeled && labeled.ok); i++) {
          labeled = await evaluate('(() => { const id = ' + JSON.stringify(target.id) + '; const rows = [...document.querySelectorAll("#home-view [data-open-plant=\\"" + id + "\\"]")].filter((el) => el.getClientRects().length).map((el) => ({ tag: el.tagName, cls: el.className, text: (el.innerText || "").replace(/\\s+/g, " ").slice(0, 220) })); const ok = rows.length > 0 && rows.every((row) => /not recorded/i.test(row.text) && !/×\\s*$/.test(row.text)); return { ok, rows }; })()');
          if (!labeled || !labeled.ok) await sleep(50);
        }
        if (!labeled || !labeled.ok) fail('plant ' + target.id + ' left the empty father blank ' + JSON.stringify(labeled && labeled.rows) + ' ' + logs.slice(-4).join(' | '));
      }
      const caption = 'REAL-RECORD · ' + opts.snapshotDate + ' snapshot · ' + w + 'x' + h + ' · ' + opts.screen + (opts.phase ? ' · ' + opts.phase : '') + ' · BROWSER MOCKUP · NOT CURRENT DEVICE PROOF';
      await evaluate(`(() => { let bar = document.getElementById('real-record-caption'); if (!bar) { bar = document.createElement('div'); bar.id = 'real-record-caption'; document.body.prepend(bar); } bar.textContent = ${JSON.stringify(caption)}; bar.setAttribute('style','position:sticky;top:0;z-index:10000;background:#111;color:#fff;font:600 12px/1.3 sans-serif;padding:8px 12px'); return true; })()`);
      const layout = await evaluate(`(() => {
        const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        const sideEl = document.querySelector('.w-side');
        const tabEl = document.getElementById('tabbar');
        const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const name = el.querySelector('b'); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, strike: name ? getComputedStyle(name).textDecorationLine.indexOf('line-through') >= 0 : false }; };
        const de = document.scrollingElement || document.documentElement;
        const tree = document.querySelector('#breeding-view .b57');
        return {
          innerWidth: window.innerWidth, innerHeight: window.innerHeight, zoom,
          side: box(sideEl), tab: box(tabEl),
          pageScroll: de.scrollWidth, pageClient: de.clientWidth,
          treeScroll: tree ? tree.scrollWidth : 0, treeClient: tree ? tree.clientWidth : 0,
          backup: (document.body.innerText || '').indexOf('You have not backed up') >= 0,
          wideCards: [...document.querySelectorAll('#breeding-view .b60-col, #breeding-view .b57-row')].map((el) => {
            const cards = [...el.querySelectorAll(':scope > .b60-c, :scope > .b57-n')];
            const parent = el.getBoundingClientRect().width || 1;
            const widths = cards.map((card) => Math.round(card.getBoundingClientRect().width));
            return { count: cards.length, widths, stretched: widths.some((width) => width > parent * 0.7) };
          }).filter((group) => group.count >= 4),
          cards: [...document.querySelectorAll('#breeding-view .b60-c, #breeding-view .b57-n')].map((el) => ({ k: el.getAttribute('data-k') || '', text: el.innerText || '', strike: !!(el.querySelector('b') && getComputedStyle(el.querySelector('b')).textDecorationLine.indexOf('line-through') >= 0) })),
          rows: [...document.querySelectorAll('[data-open-plant]')].map((el) => ({ id: el.getAttribute('data-open-plant') || '', text: el.innerText || '' })),
        };
      })()`);
      if (!layout || layout.innerWidth !== w || layout.innerHeight !== h) fail('viewport is ' + (layout && layout.innerWidth) + 'x' + (layout && layout.innerHeight) + ' instead of ' + w + 'x' + h);
      if (missing.length) fail('missing assets ' + missing.join(' '));
      if (layout.backup) fail('the page claims the logbook has not been backed up');
      if (w >= 1024) {
        if (Math.abs(layout.zoom - 1.28) > 0.02) fail('wide zoom is ' + layout.zoom + ' instead of 1.28');
        if (!layout.side || layout.side.left < -1 || layout.side.right > layout.innerWidth + 1 || layout.side.width < 240 || layout.side.top < -1) fail('sidebar is outside the viewport');
        if (layout.pageScroll > layout.pageClient + 2) fail('the page is wider than the viewport');
        if (opts.screen === 'tree' && layout.treeClient && layout.treeScroll > layout.treeClient + 2) fail('the tree is wider than its pane');
        if (opts.screen === 'tree' && layout.wideCards) {
          layout.wideCards.forEach((group) => {
            if (group.count >= 4 && group.stretched) fail('a grandparent card stretched to the full row at ' + w + 'x' + h + ' ' + JSON.stringify(group));
          });
        }
      } else if (!layout.tab || Math.abs(layout.tab.bottom - h) > 12 || layout.tab.top < h * 0.7) {
        fail('the phone bar is not at the bottom of the viewport');
      }
      if (opts.screen === 'plants') {
        (opts.state.plants || []).forEach((plant) => {
          const text = (layout.rows || []).filter((item) => item.id === plant.id).map((item) => item.text).join('\n');
          if (!text) return;
          if (!plant.startDate && (/\bDay 1\b/.test(text) || text.includes('Seedling'))) fail(plant.id + ' invented Day 1 or Seedling');
          if (plant.id === (opts.record && opts.record.row.id) && plant.flowerStartDate && !text.includes('Flower')) fail(plant.id + ' did not keep the flower stage: ' + text.slice(0, 180));
          else if (plant.id === (opts.record && opts.record.row.id) && !plant.flowerStartDate && plant.vegStartDate && !text.includes('Veg')) fail(plant.id + ' did not keep the veg stage: ' + text.slice(0, 180));
        });
      }
      const labelCounts = { nameonly: 0, archived: 0, retired: 0, culled: 0, deleted: 0 };
      if (opts.screen === 'tree') {
        const deleted = new Set();
        ['plants', 'breedingPlants', 'motherFatherPlants', 'breedingProjects'].forEach((key) => (opts.state[key] || []).forEach((row) => {
          const book = row && row.b58DeletedParents;
          if (!book || typeof book !== 'object') return;
          ['m', 'f'].forEach((side) => { const entry = book[side]; if (entry && entry.key && entry.name) deleted.add('dx:' + entry.name); });
        }));
        (layout.cards || []).forEach((card) => {
          if (String(card.k).startsWith('dx:')) {
            if (deleted.has(card.k)) {
              if (!card.text.includes('Deleted plant')) fail('a recorded deletion did not say Deleted plant');
              labelCounts.deleted += 1;
            } else if (card.text.includes('Deleted plant') || card.strike) fail('a name-only parent was labeled deleted');
            else if (!card.text.includes('Name only')) fail('a name-only parent did not say Name only');
            else labelCounts.nameonly += 1;
          }
          const id = String(card.k).split(':').slice(1).join(':');
          const rec = ['plants', 'breedingPlants', 'motherFatherPlants'].map((key) => (opts.state[key] || []).find((row) => row.id === id)).find(Boolean);
          if (!rec) return;
          const culled = /cull/i.test(String(rec.status || '')) || (rec.grade && rec.grade.verdict === 'cull');
          const retired = /^retired$/i.test(String(rec.status || ''));
          const archived = !culled && !retired && (rec.archived || /^archived$/i.test(String(rec.status || '')));
          if (archived && (card.text.includes('Culled') || card.strike || !card.text.includes('Archived'))) fail('an archived record was not labeled Archived');
          if (archived) labelCounts.archived += 1;
          if (retired && (card.text.includes('Culled') || card.strike || !card.text.includes('Retired'))) fail('a retired record was not labeled Retired');
          if (retired) labelCounts.retired += 1;
          if (culled && !card.text.includes('Culled')) fail('a culled record was not labeled Culled');
          if (culled) labelCounts.culled += 1;
        });
      }
      let file = 'skipped';
      if (opts.factor !== 'screenshot') {
        const png = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
        const label = opts.label ? opts.label.replace(/[^A-Za-z0-9._-]+/g, '-') : opts.screen;
        const phase = opts.phase ? '-' + opts.phase : '';
        file = path.join(opts.outDir, 'REAL-RECORD-' + opts.snapshotDate + '-' + label + phase + '-' + w + 'x' + h + '-NOT-DEVICE.png');
        const bytes = Buffer.from(png.data, 'base64');
        const size = pngSize(bytes);
        if (!size || size.width !== w || size.height !== h) fail('screenshot is ' + (size && size.width) + 'x' + (size && size.height) + ' instead of the viewport ' + w + 'x' + h);
        fs.writeFileSync(file, bytes);
      } else {
        console.log('DIFF SCREENSHOT skipped ' + w + 'x' + h);
      }
      console.log('PASS screen ' + opts.screen + ' viewport ' + w + 'x' + h + ' inner=' + layout.innerWidth + 'x' + layout.innerHeight + ' zoom=' + layout.zoom + ' father=' + (seen.father || '') + (opts.screen === 'tree' ? ' cards=' + JSON.stringify(labelCounts) : '') + ' file=' + file);
      };
      if (observe) {
        try { await runChecks(); }
        catch (e) { console.log('DIFF CONTENT ' + w + 'x' + h + ' ' + String(e && e.message || e).slice(0, 300)); }
      } else {
        await runChecks();
      }
    }
    if (bootFailed) fail('the app did not finish loading at ' + bootFailed);
  } finally {
    if (proc) { try { proc.kill('SIGKILL'); } catch (e) { /* already closed */ } }
    try { server.close(); } catch (e) { /* already closed */ }
    await sleep(200);
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* the picture was already written */ }
  }
}

function main() {
  if (process.argv.includes('--list-screens')) {
    console.log(SCREENS.join('\n'));
    return;
  }
  const fixture = arg('--fixture');
  const snapshotDate = arg('--snapshot-date');
  const outDir = arg('--out');
  const screen = arg('--screen');
  const recordId = arg('--record-id');
  const repairConfig = arg('--repair-config');
  const phase = arg('--phase');
  const label = arg('--label');
  const factor = arg('--factor');
  const checkOnly = process.argv.includes('--check-only');
  if (factor && !['none', 'mobile', 'screenshot', 'fixture'].includes(factor)) fail('--factor must be none, mobile, screenshot, or fixture');
  if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) fail('pass --snapshot-date YYYY-MM-DD from the parent. The date is not invented here.');
  const state = readFixture(fixture);
  if (checkOnly) {
    console.log('PASS fixture accepted ' + Object.keys(ALLOWED).map((k) => k + '=' + state[k].length).join(' '));
    return;
  }
  if (!SCREENS.includes(screen)) fail('pass --screen ' + SCREENS.join('|'));
  const record = recordId ? findRecord(state, recordId) : null;
  if (screen === 'tree' && !record) fail('--screen tree needs a --record-id that is in the fixture');
  if (recordId && !record) fail('record id is not in the fixture');
  if (phase && phase !== 'before' && phase !== 'after') fail('--phase must be before or after');
  if (phase === 'after' && !repairConfig) fail('--phase after requires --repair-config');
  if (!outDir) fail('pass --out <directory>. Screenshots are not written into the repo by default.');
  if (!fs.existsSync(CHROME)) fail('Chrome is not installed at ' + CHROME);
  fs.mkdirSync(outDir, { recursive: true });
  return runBrowser({
    state, screen, record, snapshotDate, outDir, label, phase, factor,
    repairConfig, viewports: parseViewports(arg('--viewport')),
  });
}
if (require.main === module) {
  Promise.resolve(main()).catch((e) => {
    console.error('FAIL ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}
module.exports = { readFixture, ALLOWED, SCREENS, findRecord };
