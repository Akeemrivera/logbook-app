'use strict';
/*
  Runs the acceptance tree invocation itself: node b63-real-mockup-unflagged.js
  with the original fixture, phase before, and the default three viewports.
  That file is renderer 1c807ef6 and has no isolation flags. The service
  worker bytes on disk are served unchanged. No Target.setAutoAttach.

  The only addition is a second DevTools client that enables Network and,
  after a script failure, reads performance resource timing once.

  Decision, fixed before the run:
    OUTSIDE-APP: an extension target is present, and every failing script was
      sent by the page, has workerStart 0, and no service-worker response.
      The app worker never received it. This cannot occur in the iOS
      WKWebView production app, which does not load those extension workers.
    SW-DROPPED: every failing script got a response, including from the
      service worker, and the browser still failed the load.
    SW-INVOLVED: a failing script has workerStart > 0 or fromServiceWorker
      and no response event. The worker was on the path.
    NO-FAILURE: the acceptance invocation booted all three viewports.
*/
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const UNFLAGGED = '1c807ef6e6a4293c499b1c0f8ebe1e32462b91b30c02b60787576af5544ec969';
function emit(line) { fs.writeSync(1, line + '\n'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function decide(failed, extPresent) {
  if (!failed.length) return 'NO-FAILURE';
  if (failed.some((row) => row.swKnown === false)) return 'INCOMPLETE-TIMING';
  const outside = failed.filter((row) => row.pageSent && !row.swReceived && row.response === 'absent');
  const dropped = failed.filter((row) => row.response !== 'absent');
  const involved = failed.filter((row) => row.swReceived && row.response === 'absent');
  if (involved.length) return 'SW-INVOLVED';
  if (dropped.length && dropped.length === failed.length && extPresent) return 'SW-DROPPED';
  if (outside.length === failed.length && extPresent) return 'OUTSIDE-APP';
  return 'INCOMPLETE-NETWORK';
}
function check(name, ok) { if (!ok) { fs.writeSync(2, 'FAIL ' + name + '\n'); process.exit(1); } }
check('unseen script with an extension is outside the app', decide([{ pageSent: true, swReceived: false, response: 'absent' }], true) === 'OUTSIDE-APP');
check('a service-worker response that still fails was dropped', decide([{ pageSent: true, swReceived: true, response: '200' }], true) === 'SW-DROPPED');
check('workerStart without a response is the worker path', decide([{ pageSent: true, swReceived: true, response: 'absent' }], true) === 'SW-INVOLVED');
emit('WATCH rule OUTSIDE-APP: extensions present and every failing script has workerStart 0 and no response');
emit('WATCH rule SW-DROPPED: the worker or network responded and the browser still failed the script');
emit('WATCH rule SW-INVOLVED: workerStart > 0 or fromServiceWorker, and no response event');
if (process.argv.includes('--rules')) { emit('PASS watch rules'); process.exit(0); }

const rendererFlag = process.argv.indexOf('--renderer');
const renderer = rendererFlag >= 0 ? process.argv[rendererFlag + 1] : path.join(__dirname, 'b63-real-mockup-unflagged.js');
const rendererHash = crypto.createHash('sha256').update(fs.readFileSync(renderer)).digest('hex');
if (rendererHash !== UNFLAGGED) { fs.writeSync(2, 'FAIL renderer ' + rendererHash + ' is not unflagged ' + UNFLAGGED + '\n'); process.exit(1); }
emit('WATCH renderer=' + rendererHash + ' flags=off sw=disk');

const dates = { startDate: '2024-03-01', vegStartDate: '2024-03-20', flowerStartDate: '2024-05-01', plannedFlipDate: '2024-05-01', flowerFlipDate: '2024-05-01' };
const fixture = {
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
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-watch-'));
const fixtureFile = path.join(work, 'fixture.json');
fs.writeFileSync(fixtureFile, JSON.stringify(fixture));
const outDir = path.join(work, 'shots');

function debugPort(pid, seen) {
  if (!pid || seen.has(pid)) return 0;
  seen.add(pid);
  let cmd = '';
  try { cmd = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8'); } catch (e) { return 0; }
  const match = /--remote-debugging-port=(\d+)/.exec(cmd);
  if (match) return Number(match[1]);
  let children = '';
  try { children = fs.readFileSync('/proc/' + pid + '/task/' + pid + '/children', 'utf8'); } catch (e) { return 0; }
  for (const child of children.trim().split(/\s+/).filter(Boolean)) {
    const found = debugPort(Number(child), seen);
    if (found) return found;
  }
  return 0;
}
function pathOf(url) { try { return decodeURIComponent(new URL(url).pathname); } catch (e) { return ''; } }

(async () => {
  const child = spawn(process.execPath, [renderer, '--fixture', fixtureFile, '--snapshot-date', '2026-11-06', '--screen', 'tree', '--record-id', 'p-target', '--phase', 'before', '--out', outDir], { cwd: ROOT, env: process.env });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (buf) => { stdout += buf; });
  child.stderr.on('data', (buf) => { stderr += buf; });
  const targets = new Map();
  const net = new Map();
  let wired = false;
  let timing = [];
  let timingRead = false;
  const poll = setInterval(async () => {
    const port = debugPort(child.pid, new Set());
    if (!port) return;
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      list.forEach((target) => targets.set((target.type || '') + ' ' + (target.url || ''), target.type || ''));
      if (wired) return;
      const page = list.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (!page) return;
      wired = true;
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
      let n = 0;
      const pending = new Map();
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        const params = msg.params || {};
        if (msg.method === 'Network.requestWillBeSent' && params.requestId) net.set(params.requestId, { url: (params.request && params.request.url) || '', t: Date.now(), done: '', err: '', resp: false, status: 0, sw: null });
        const row = params.requestId ? net.get(params.requestId) : null;
        if (row && msg.method === 'Network.responseReceived') { row.resp = true; row.status = params.response.status || 0; row.sw = !!params.response.fromServiceWorker; }
        if (row && msg.method === 'Network.loadingFinished') row.done = 'ok';
        if (row && msg.method === 'Network.loadingFailed') { row.done = 'fail'; row.err = params.errorText || 'failed'; if (!timingRead) { timingRead = true; readTiming(); } }
        if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
      });
      function send(method, params) {
        const id = ++n;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout ' + method)), 10000);
          pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error('cdp')); else resolve(msg.result || {}); });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      }
      await send('Network.enable');
      await send('Runtime.enable');
      async function readTiming() {
        try {
          const out = await send('Runtime.evaluate', { expression: 'JSON.stringify((performance.getEntriesByType("resource")||[]).filter((row)=>/\\.js($|\\?)/.test(row.name)).map((row)=>({name:row.name,workerStart:row.workerStart,responseStatus:row.responseStatus,transferSize:row.transferSize,decodedBodySize:row.decodedBodySize,duration:row.duration})))', returnByValue: true });
          timing = JSON.parse((out.result && out.result.value) || '[]');
          emit('WATCH timingEntries=' + timing.length);
        } catch (e) { emit('WATCH timing=unavailable ' + (e && e.message ? e.message : e)); }
      }
    } catch (e) { wired = false; }
  }, 100);
  const status = await new Promise((resolve) => child.on('close', resolve));
  clearInterval(poll);
  await sleep(200);
  const text = stdout + stderr;
  if (text) fs.writeSync(1, text.endsWith('\n') ? text : text + '\n');
  const ext = [...targets.keys()].filter((key) => key.indexOf('chrome-extension://') >= 0);
  ext.forEach((key) => emit('WATCH target ' + key));
  const failed = [...net.values()].filter((row) => row.done === 'fail' && /\/[^/]+\.js$/.test(pathOf(row.url)) && pathOf(row.url).indexOf('service-worker.js') < 0);
  function timingFor(url) {
    const name = pathOf(url).split('/').pop();
    return timing.find((row) => String(row.name || '').indexOf(name) >= 0) || null;
  }
  const rows = failed.map((row) => {
    const mark = timingFor(row.url);
    const swReceived = !!(row.sw === true || (mark && Number(mark.workerStart) > 0));
    return { path: pathOf(row.url), pageSent: true, swReceived, swKnown: !!(row.resp || mark), response: row.resp ? String(row.status) : 'absent', fromServiceWorker: row.resp ? String(row.sw) : 'absent', error: row.err, workerStart: mark ? mark.workerStart : 'unread', responseStatus: mark ? mark.responseStatus : 'unread' };
  });
  rows.forEach((row) => emit('WATCH script fail ' + row.path + ' pageSent=yes browser=fail error=' + row.error + ' response=' + row.response + ' fromServiceWorker=' + row.fromServiceWorker + ' workerStart=' + row.workerStart + ' resourceStatus=' + row.responseStatus));
  const booted = status === 0 && text.includes('inner=1024x768') && text.includes('inner=1024x1366');
  const decision = booted ? 'NO-FAILURE' : decide(rows, ext.length > 0);
  emit('WATCH boot=' + (booted ? 'pass' : 'fail') + ' status=' + status + ' extensionTargets=' + ext.length + ' failedScripts=' + rows.length);
  emit('WATCH DECISION ' + decision);
  fs.rmSync(work, { recursive: true, force: true });
  if (!booted) process.exit(1);
})().catch((e) => { fs.writeSync(2, 'FAIL ' + (e && e.message ? e.message : e) + '\n'); process.exit(1); });
