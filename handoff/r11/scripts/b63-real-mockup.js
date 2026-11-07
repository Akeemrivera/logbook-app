'use strict';
/*
  Local renderer for a private plant-only fixture. This file does not contain
  records. If the fixture path is missing, or the file is not a sanitized
  relationship file, it exits without drawing anything and without substituting
  a synthetic fixture. It does not upload, export, or write the fixture.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const ALLOWED = {
  plants: ['id', 'name', 'status', 'archived', 'b49Mother', 'b49Father', 'b58Manual', 'b49ProjectId', 'motherId', 'fatherId', 'motherPlantId'],
  breedingPlants: ['id', 'name', 'status', 'archived', 'b49Mother', 'b49Father', 'b58Manual', 'b49ProjectId', 'motherId', 'fatherId', 'motherPlantId'],
  motherFatherPlants: ['id', 'name', 'role', 'status', 'archived', 'b49Mother', 'b49Father', 'b58Manual', 'promotedFrom'],
  breedingProjects: ['id', 'name', 'status', 'motherId', 'fatherId', 'mother', 'father', 'b49Mother', 'b49Father', 'b58Manual'],
  cloneRuns: ['id', 'name', 'srcId', 'srcColl', 'motherPlantId', 'status'],
};
const FORBIDDEN = /note|photo|patient|credential|password|token|medical|address|certif/i;

function fail(message) {
  console.error('FAIL ' + message);
  process.exit(1);
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
  });
  if (row.promotedFrom && (typeof row.promotedFrom !== 'object' || Array.isArray(row.promotedFrom))) fail(where + ' promotedFrom is not a link');
}
function readFixture(file) {
  if (!file) fail('pass --fixture <private-plant-file> . No fixture is bundled and no synthetic records are used.');
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

function main() {
  const fixture = arg('--fixture');
  const snapshotDate = arg('--snapshot-date');
  const outDir = arg('--out');
  const checkOnly = process.argv.includes('--check-only');
  if (!snapshotDate || !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) fail('pass --snapshot-date YYYY-MM-DD from the parent. The date is not invented here.');
  const state = readFixture(fixture);
  if (checkOnly) {
    console.log('PASS fixture accepted ' + Object.keys(ALLOWED).map((k) => k + '=' + state[k].length).join(' '));
    return;
  }
  if (!outDir) fail('pass --out <directory> . Screenshots are not written into the repo by default.');
  if (!fs.existsSync(CHROME)) fail('Chrome is not installed at ' + CHROME);
  fs.mkdirSync(outDir, { recursive: true });
  const caption = 'REAL-RECORD · ' + snapshotDate + ' snapshot · BROWSER MOCKUP · NOT CURRENT DEVICE PROOF';
  const port = 9391;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end('no'); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  const init = `
    localStorage.setItem('boriken-genetics-logbook-v1', ${JSON.stringify(JSON.stringify(state))});
    localStorage.setItem('boriken-onboard-done', '1');
    localStorage.setItem('boriken-theme-pref-v1', 'light');
  `;
  server.listen(port, '127.0.0.1', async () => {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-real-mockup-'));
    const proc = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
      '--user-data-dir=' + dir, '--remote-debugging-port=9392', 'about:blank',
    ], { stdio: 'ignore' });
    try {
      let page = null;
      for (let i = 0; i < 50 && !page; i++) {
        try {
          const list = await (await fetch('http://127.0.0.1:9392/json/list')).json();
          page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
      }
      if (!page) fail('chrome did not open');
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
      let n = 0;
      const pending = new Map();
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
      });
      function send(method, params) {
        const id = ++n;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('timeout ' + method)), 20000);
          pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result || {}); });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      }
      await send('Page.enable');
      await send('Runtime.enable');
      await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html' });
      await new Promise((r) => setTimeout(r, 800));
      await send('Runtime.evaluate', { expression: `(() => { const bar = document.createElement('div'); bar.textContent = ${JSON.stringify(caption)}; bar.setAttribute('style', 'position:sticky;top:0;z-index:10000;background:#111;color:#fff;font:600 12px/1.3 sans-serif;padding:8px 12px'); document.body.prepend(bar); return true; })()`, returnByValue: true });
      const png = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const file = path.join(outDir, 'REAL-RECORD-' + snapshotDate + '-BROWSER-MOCKUP-NOT-DEVICE.png');
      fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
      console.log('PASS wrote ' + file);
    } finally {
      proc.kill('SIGKILL');
      server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
if (require.main === module) {
  try { main(); }
  catch (e) { fail(e && e.message || e); }
}
module.exports = { readFixture, ALLOWED };
