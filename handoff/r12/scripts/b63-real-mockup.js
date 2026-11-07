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
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const SCREENS = ['tree', 'plants', 'mf', 'compliance', 'inspection'];
const VIEWPORTS = [[390, 844], [1024, 768], [1024, 1366]];
const ALLOWED = {
  plants: ['id', 'name', 'status', 'archived', 'b49Mother', 'b49Father', 'b58Manual', 'b49ProjectId', 'motherId', 'fatherId', 'motherPlantId'],
  breedingPlants: ['id', 'name', 'status', 'archived', 'b49Mother', 'b49Father', 'b58Manual', 'b49ProjectId', 'motherId', 'fatherId', 'motherPlantId'],
  motherFatherPlants: ['id', 'name', 'role', 'status', 'archived', 'b49Mother', 'b49Father', 'b58Manual', 'promotedFrom'],
  breedingProjects: ['id', 'name', 'status', 'motherId', 'fatherId', 'mother', 'father', 'b49Mother', 'b49Father', 'b58Manual'],
  cloneRuns: ['id', 'name', 'srcId', 'srcColl', 'motherPlantId', 'status'],
};
const KEY = { plants: 'pl', breedingPlants: 'bp', motherFatherPlants: 'mf', breedingProjects: 'pr' };
const FORBIDDEN = /note|photo|patient|credential|password|token|medical|address|certif/i;
const EMPTY_REPAIR = '{"repairs":[],"undos":[]}\n';

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

async function runBrowser(opts) {
  const port = 9391;
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
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/b63-repair.json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(repairBody);
      return;
    }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end('no'); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-real-mockup-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--user-data-dir=' + dir, '--remote-debugging-port=9392', 'about:blank',
  ], { stdio: 'ignore' });
  const init = 'localStorage.setItem(\'boriken-genetics-logbook-v1\', ' + JSON.stringify(JSON.stringify(opts.state)) + ');';
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9392/json/list')).json();
        page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch (e) { await sleep(100); }
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
    async function evaluate(expression) {
      const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (out.exceptionDetails) throw new Error('page ' + JSON.stringify(out.exceptionDetails));
      return out.result && out.result.value;
    }
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    for (const [w, h] of opts.viewports) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
      await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html?screen=' + opts.screen });
      let ready = false;
      for (let i = 0; i < 40 && !ready; i++) {
        ready = await evaluate('document.readyState === \'complete\' && typeof switchView === \'function\' && typeof B49 !== \'undefined\'');
        if (!ready) await sleep(50);
      }
      if (!ready) fail('the app did not finish loading');
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
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
      let seen = null;
      for (let i = 0; i < 40 && !seen; i++) {
        await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
        seen = await evaluate(`(() => {
          const screen = ${JSON.stringify(opts.screen)};
          const title = ${JSON.stringify(opts.record ? (opts.record.row.name || '') : '')};
          const id = ${JSON.stringify(opts.record ? opts.record.row.id : '')};
          const list = ${JSON.stringify(opts.record ? opts.record.list : '')};
          const text = document.body.innerText || '';
          const heading = (document.querySelector('h2.b18-h1, #home-heading, #compliance-heading') || {}).textContent || '';
          let identity = false;
          if (screen === 'tree') {
            const h = document.querySelector('#breeding-view h2.b18-h1');
            identity = !!(h && h.textContent === 'Family tree' && title && text.includes(title));
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
          return { identity, readyCss, heading, father, others, hasTitle: !title || text.includes(title) };
        })()`);
        if (!seen || !seen.identity || !seen.readyCss) { seen = null; await sleep(50); }
      }
      if (!seen || !seen.identity) fail('the ' + opts.screen + ' page did not render the requested record at ' + w + 'x' + h);
      if (opts.phase === 'before' && opts.record && opts.record.list === 'plants') {
        if (seen.father !== String(opts.record.row.b49Father || '')) fail('before launch changed the father');
      }
      if (opts.phase === 'after' && opts.record && opts.record.list === 'plants') {
        if (seen.father !== '-') fail('after launch did not clear the configured father');
        const expectedOthers = (opts.state.plants || []).filter((r) => r.id !== opts.record.row.id).map((r) => r.id + ':' + String(r.b49Father || ''));
        if (JSON.stringify(seen.others) !== JSON.stringify(expectedOthers)) fail('after launch changed another plant');
      }
      const caption = 'REAL-RECORD · ' + opts.snapshotDate + ' snapshot · ' + w + 'x' + h + ' · ' + opts.screen + (opts.phase ? ' · ' + opts.phase : '') + ' · BROWSER MOCKUP · NOT CURRENT DEVICE PROOF';
      await evaluate(`(() => { let bar = document.getElementById('real-record-caption'); if (!bar) { bar = document.createElement('div'); bar.id = 'real-record-caption'; document.body.prepend(bar); } bar.textContent = ${JSON.stringify(caption)}; bar.setAttribute('style','position:sticky;top:0;z-index:10000;background:#111;color:#fff;font:600 12px/1.3 sans-serif;padding:8px 12px'); return true; })()`);
      const png = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: true });
      const label = opts.label ? opts.label.replace(/[^A-Za-z0-9._-]+/g, '-') : opts.screen;
      const phase = opts.phase ? '-' + opts.phase : '';
      const file = path.join(opts.outDir, 'REAL-RECORD-' + opts.snapshotDate + '-' + label + phase + '-' + w + 'x' + h + '-NOT-DEVICE.png');
      fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
      console.log('PASS screen ' + opts.screen + ' viewport ' + w + 'x' + h + ' father=' + (seen.father || '') + ' file=' + file);
    }
  } finally {
    proc.kill('SIGKILL');
    server.close();
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
  const checkOnly = process.argv.includes('--check-only');
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
    state, screen, record, snapshotDate, outDir, label, phase,
    repairConfig, viewports: parseViewports(arg('--viewport')),
  });
}
if (require.main === module) {
  Promise.resolve(main()).catch((e) => fail(e && e.message || e));
}
module.exports = { readFixture, ALLOWED, SCREENS, findRecord };
