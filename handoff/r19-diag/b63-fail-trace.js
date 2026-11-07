'use strict';
/*
  Optional failure trace for the existing startup and renderer harnesses.
  It does nothing unless --trace / B63_TRACE=1 or --cpu / B63_CPU is set.
  It does not change the ready loop, the assertions, or the service worker.
  A CPU rate is the CDP Emulation.setCPUThrottlingRate value. Chrome accepts
  a rate >= 1. The declared adverse rate is 4 (DevTools 4x slowdown).
*/
const MARK = ['app.js', 'build18.js', 'build49.js', 'build57.js', 'build63.js', 'b63-repair.json', 'index.html', 'service-worker.js'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}
function applyArgs() {
  if (process.argv.includes('--trace')) process.env.B63_TRACE = '1';
  if (process.argv.includes('--sw-diag')) process.env.B63_SW_DIAG = '1';
  const cpu = arg('--cpu');
  if (cpu) process.env.B63_CPU = cpu;
}
function active() {
  return process.env.B63_TRACE === '1' || !!process.env.B63_CPU;
}
function cpuRate() {
  const raw = process.env.B63_CPU || '';
  if (!raw) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error('B63_CPU/--cpu must be a CDP Emulation.setCPUThrottlingRate rate >= 1. DevTools slowdown presets are 2, 4, and 6. Got ' + raw);
  }
  return n;
}
function pathOf(url) {
  try { return decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname); }
  catch (e) { return String(url || '').slice(0, 160); }
}

const requests = new Map();
const workerLogs = [];
const swPosts = [];
const chromeErr = [];
const serverLog = [];
const inflight = new Map();
const workers = new Set();
let serverSeq = 0;
let since = 0;
let phase = '';
let pageCache = null;

function stamp() { return Date.now(); }
function mark(label) { phase = label; since = stamp(); }
function note(msg) {
  if (!active() || !msg) return;
  const method = msg.method || '';
  if (method === 'Target.attachedToTarget') {
    const info = msg.params && msg.params.targetInfo;
    const sid = msg.params && msg.params.sessionId;
    if (sid && info && (info.type === 'service_worker' || info.type === 'worker')) workers.add(sid);
    return;
  }
  if (method === 'Runtime.consoleAPICalled' || method === 'Runtime.exceptionThrown') {
    const text = method === 'Runtime.exceptionThrown'
      ? 'exception ' + ((msg.params && msg.params.exceptionDetails && (msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description || msg.params.exceptionDetails.text)) || '')
      : ((msg.params && msg.params.args || []).map((a) => a.value || a.description || '').join(' '));
    if ((msg.sessionId && workers.has(msg.sessionId)) || text.indexOf('SWDIAG') >= 0) {
      if (workerLogs.length < 150) workerLogs.push(text.slice(0, 700));
    }
    return;
  }
  if (method !== 'Network.requestWillBeSent' && method !== 'Network.responseReceived' && method !== 'Network.loadingFinished' && method !== 'Network.loadingFailed' && method !== 'Network.requestServedFromCache') return;
  const params = msg.params || {};
  const id = params.requestId;
  if (!id) return;
  const key = (msg.sessionId || 'page') + ':' + id;
  const row = requests.get(key) || { session: msg.sessionId || 'page', url: '', type: '', will: 0, finished: 0, failed: '', status: 0, mime: '', fromServiceWorker: false };
  if (params.request && params.request.url) {
    row.url = params.request.url;
    const headers = params.request.headers || {};
    row.reqHeaders = {};
    Object.keys(headers).forEach((name) => { if (/range|accept|cache|purpose|sec-fetch/i.test(name)) row.reqHeaders[name] = headers[name]; });
  }
  if (params.type) row.type = params.type;
  if (method === 'Network.requestWillBeSent' && !row.will) row.will = stamp();
  if (method === 'Network.responseReceived') {
    const response = params.response || {};
    row.status = response.status || 0;
    row.mime = response.mimeType || '';
    row.fromServiceWorker = !!response.fromServiceWorker;
  }
  if (method === 'Network.loadingFinished') row.finished = stamp();
  if (method === 'Network.loadingFailed') {
    row.failed = (params.errorText || 'failed') + (params.canceled ? ' canceled' : '');
    row.blockedReason = params.blockedReason || '';
    row.cors = params.corsErrorStatus || null;
    row.finished = stamp();
  }
  if (method === 'Network.requestServedFromCache') row.servedFromCache = true;
  requests.set(key, row);
}
function server(req, res) {
  if (!active()) return;
  const id = ++serverSeq;
  const started = stamp();
  inflight.set(id, { url: req.url, started });
  let logged = false;
  const done = () => {
    if (logged) return;
    logged = true;
    inflight.delete(id);
    serverLog.push({ url: req.url, status: res.statusCode, ms: stamp() - started, at: started });
  };
  res.on('finish', done);
  res.on('close', done);
}
async function arm(send) {
  if (!active()) return;
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await send('Network.enable');
}
async function enableWorker(send, sessionId) {
  if (!active() || !sessionId) return;
  workers.add(sessionId);
  await send('Network.enable', {}, sessionId).catch(() => {});
  await send('Runtime.enable', {}, sessionId).catch(() => {});
}
async function applyCpu(send) {
  const rate = cpuRate();
  if (!rate) return;
  await send('Emulation.setCPUThrottlingRate', { rate: rate });
  console.error('TRACE cpu-rate=' + rate + ' accepted Emulation.setCPUThrottlingRate');
}
async function readPage(send) {
  if (!active()) return;
  try {
    const out = await send('Runtime.evaluate', {
      expression: '(async () => { const names = typeof caches === "undefined" ? [] : await caches.keys(); const cachesOut = []; for (const name of names) { const cache = await caches.open(name); const keys = await cache.keys(); const have = keys.map((r) => { try { return new URL(r.url).pathname.split("/").pop(); } catch (e) { return ""; } }); const heads = {}; for (const file of ' + JSON.stringify(MARK) + ') { const res = await cache.match("./" + file); if (!res) { heads[file] = null; continue; } const buf = new Uint8Array(await res.clone().arrayBuffer()); let head = ""; for (let i = 0; i < Math.min(buf.length, 40); i++) head += (buf[i] >= 32 && buf[i] < 127) ? String.fromCharCode(buf[i]) : "."; heads[file] = { status: res.status, type: res.headers.get("content-type") || "", bytes: buf.length, head: head }; } cachesOut.push({ name: name, count: keys.length, missing: ' + JSON.stringify(MARK) + '.filter((file) => have.indexOf(file) < 0), heads: heads }); } const markers = { switchView: typeof switchView, b18BrPageHtml: typeof b18BrPageHtml, B49: typeof B49, B57: typeof B57, B63: typeof B63 }; return { readyState: document.readyState, repair: window.__b63RepairReady === true, boot: window.__b63Boot || null, detail: window.__b63RepairState || null, errors: window.__b63Errors || [], controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller), online: navigator.onLine, markers: markers, caches: cachesOut }; })()',
      awaitPromise: true,
      returnByValue: true,
    }, '', 3000);
    pageCache = out && out.result ? out.result.value : out;
    if (out && out.exceptionDetails) pageCache = { evaluateError: JSON.stringify(out.exceptionDetails).slice(0, 300) };
  } catch (e) {
    pageCache = { evaluateError: String(e && e.message || e) };
  }
}
function line(row) {
  const who = workers.has(row.session) ? 'worker' : 'page';
  const age = row.will ? (row.finished || stamp()) - row.will : 0;
  const extra = row.failed ? ' ' + row.failed + (row.blockedReason ? ' blocked=' + row.blockedReason : '') + (row.cors ? ' cors=' + JSON.stringify(row.cors) : '') + (row.reqHeaders ? ' headers=' + JSON.stringify(row.reqHeaders) : '') + ' url=' + row.url : '';
  return age + 'ms ' + who + ' ' + (row.type || '?') + ' ' + pathOf(row.url) + (row.status ? ' status=' + row.status + ' mime=' + row.mime + ' sw=' + row.fromServiceWorker : ' no-response') + extra;
}
function dump(label) {
  if (!active()) return;
  const rows = [];
  for (const row of requests.values()) {
    if (row.finished && row.will && row.will < since) continue;
    rows.push(row);
  }
  const pending = rows.filter((row) => !row.finished).sort((a, b) => (workers.has(a.session) === workers.has(b.session) ? 0 : workers.has(a.session) ? 1 : -1) || (b.will || 0) - (a.will || 0));
  const focus = rows.filter((row) => row.finished && MARK.some((name) => pathOf(row.url).endsWith('/' + name)));
  const open = [...inflight.values()].filter((row) => row.started >= since).map((row) => ({ url: row.url, age: stamp() - row.started }));
  const served = serverLog.filter((row) => row.at >= since && MARK.some((name) => String(row.url).split('?')[0].endsWith('/' + name)));
  console.error('TRACE-FAIL phase=' + phase + ' ' + label);
  console.error('TRACE pending ' + pending.length + ' ' + pending.slice(0, 20).map(line).join(' || '));
  console.error('TRACE finished-focus ' + focus.map(line).join(' || '));
  console.error('TRACE server-inflight ' + JSON.stringify(open));
  console.error('TRACE server ' + served.map((row) => row.status + ' ' + row.ms + 'ms ' + row.url).join(' || '));
  console.error('TRACE page ' + JSON.stringify(pageCache));
  console.error('TRACE worker ' + (workerLogs.join(' || ') || '(none)'));
  console.error('TRACE sw-post ' + (swPosts.join(' || ') || '(none)'));
  console.error('TRACE chrome-stderr ' + (chromeErr.join(' | ') || '(none)'));
}

function noteSw(body) { if (swPosts.length < 200) swPosts.push(String(body).slice(0, 900)); }
function noteChrome(text) { const line = String(text).replace(/\s+/g, ' ').trim(); if (line && chromeErr.length < 40) chromeErr.push(line.slice(0, 400)); }
function workerTrace() { return workerLogs.slice(); }
module.exports = { applyArgs, active, cpuRate, mark, note, noteSw, noteChrome, server, arm, enableWorker, applyCpu, readPage, dump, workerTrace };
