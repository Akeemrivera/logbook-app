'use strict';
/*
  Generic fixture only. Checks the eight saved family-tree styles still
  draw their existing connectors, keep the record's treeStyle, and fit
  390 and 1024 without a horizontal pan. No pictures are written.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const state = {
  plants: [{ id: 'p-child', name: 'Fixture Child', status: 'active', count: 1, logs: [], treeStyle: 4, b49Mother: 'mf:m-mom', b49Father: 'mf:f-dad', b58Manual: { m: true, f: true } }],
  breedingPlants: [],
  motherFatherPlants: [
    { id: 'm-mom', name: 'Fixture Mother', role: 'mother', status: 'Active', treeStyle: 4, b49Mother: 'mf:m-gm', b49Father: 'mf:f-gf', b58Manual: { m: true, f: true } },
    { id: 'f-dad', name: 'Fixture Father', role: 'father', status: 'Active', treeStyle: 4 },
    { id: 'm-gm', name: 'Fixture Grandmother', role: 'mother', status: 'Active', treeStyle: 4 },
    { id: 'f-gf', name: 'Fixture Grandfather', role: 'father', status: 'Active', treeStyle: 4 },
  ],
  breedingProjects: [],
  cloneRuns: [],
};
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function allowlist() {
  const api = require('./b63-real-mockup');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b63-style-allow-'));
  const file = path.join(dir, 'fixture.json');
  const base = { plants: [{ id: 'p-child', name: 'Fixture Child', status: 'active', count: 1, treeStyle: 4, b49Mother: 'mf:m-mom', b49Father: 'mf:f-dad', b58Manual: { m: true, f: true } }], motherFatherPlants: [{ id: 'm-mom', name: 'Fixture Mother', role: 'mother', status: 'Active', treeStyle: 2 }] };
  fs.writeFileSync(file, JSON.stringify(base));
  const read = api.readFixture(file);
  if (read.plants[0].treeStyle !== 4 || read.motherFatherPlants[0].treeStyle !== 2) throw new Error('treeStyle was not kept ' + JSON.stringify(read));
  [0, 9, 1.5, '4', true].forEach((bad) => {
    const copy = JSON.parse(JSON.stringify(base));
    copy.plants[0].treeStyle = bad;
    fs.writeFileSync(file, JSON.stringify(copy));
    try { api.readFixture(file); throw new Error('accepted treeStyle ' + JSON.stringify(bad)); }
    catch (e) { if (!String(e.message || e).includes('treeStyle must be an integer')) throw e; }
  });
  const extra = JSON.parse(JSON.stringify(base));
  extra.plants[0].treeTheme = 'new';
  fs.writeFileSync(file, JSON.stringify(extra));
  try { api.readFixture(file); throw new Error('accepted an unknown field'); }
  catch (e) { if (!String(e.message || e).includes('outside the relationship list')) throw e; }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('PASS treeStyle 1-8 is kept and other values are rejected');
}
async function main() {
  allowlist();
  if (!fs.existsSync(CHROME)) { console.error('FAIL chrome missing'); process.exit(1); }
  const probe = http.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }));
  const debugProbe = http.createServer();
  const debug = await new Promise((resolve) => debugProbe.listen(0, '127.0.0.1', () => { const p = debugProbe.address().port; debugProbe.close(() => resolve(p)); }));
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if ((!file.startsWith(ROOT + path.sep) && file !== ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-tree-branches-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + dir, '--remote-debugging-port=' + debug, 'about:blank'], { stdio: 'ignore' });
  const fails = [];
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
    ws.addEventListener('message', (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); } });
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
      if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails).slice(0, 300));
      return out.result && out.result.value;
    }
    await send('Page.enable');
    await send('Runtime.enable');
    const init = 'localStorage.setItem("boriken-genetics-logbook-v1", ' + JSON.stringify(JSON.stringify(state)) + ');';
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html' });
    let ready = false;
    for (let i = 0; i < 40 && !ready; i++) {
      ready = await evaluate('!!(window.B57 && window.B49 && window.B60 && window.__b63Boot && window.__b63Boot.ready)');
      if (!ready) await sleep(50);
    }
    if (!ready) throw new Error('app did not boot');
    const saved = await evaluate('(() => { switchView("breeding"); B49.openPage({ type: "b49tree", key: "pl:p-child" }); const root = document.querySelector("#breeding-view .b57"); const child = (state.plants || []).find((r) => r.id === "p-child"); return { shown: root && root.getAttribute("data-b57s"), saved: child && child.treeStyle, text: (root && root.innerText || "").slice(0, 500) }; })()');
    if (!saved || saved.shown !== '4' || saved.saved !== 4) fails.push('saved style changed ' + JSON.stringify(saved));
    if (!saved || saved.text.indexOf('Not recorded') < 0) fails.push('missing truthful unknown ' + JSON.stringify(saved && saved.text));
    const check = '(() => { const root = document.querySelector("#breeding-view .b57"); const k = root && root.getAttribute("data-b57k"); const ring = !!(root && root.querySelector(".b57-svg path")); const cert = !!(root && root.querySelector(".b57-ped, .b57-cg")); const pane = !!(root && root.querySelector(".b57-pane")); const path = root && root.querySelector(".b57-canvas > svg.b60-lines path.branch"); const d = path ? (path.getAttribute("d") || "") : ""; const curved = d.indexOf("C") >= 0; const arc = !!(root && root.querySelector(".b57-canvas > svg.b60-lines path.arc")); const mobile = !!(root && root.querySelector(".b57-bar")); const de = document.documentElement; const text = (root && root.innerText) || ""; return { k, ring, cert, pane, curved, arc, mobile, pan: de.scrollWidth > de.clientWidth + 2, family: text.indexOf("Family tree") >= 0, unknown: /not recorded|unknown/i.test(text), mother: text.indexOf("Fixture Mother") >= 0 }; })()';
    for (const [w, h] of [[390, 844], [1024, 768]]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
      for (let style = 1; style <= 8; style++) {
        await evaluate('(() => { B49.openPage({ type: "b49tree", key: "pl:p-child", forceStyle: ' + style + ' }); return true; })()');
        await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
        await sleep(50);
        const row = await evaluate(check);
        const shape = row && ((row.k === 'walnut' || row.k === 'azulejo') ? row.ring && !row.curved : (row.k === 'ceiba' || row.k === 'roots' || row.k === 'river') ? row.curved && (row.k !== 'ceiba' || row.arc) : row.k === 'mobile' ? row.mobile && !row.curved : row.k === 'cert' ? row.cert && !row.curved : row.k === 'window' ? row.pane && !row.curved : false);
        if (!row || !shape || row.pan || !row.family || !row.unknown || !row.mother) fails.push(w + 'x' + h + ' style ' + style + ' ' + JSON.stringify(row));
        else console.log('PASS style ' + style + ' ' + row.k + ' ' + w + 'x' + h);
      }
    }
    const still = await evaluate('((state.plants || []).find((r) => r.id === "p-child") || {}).treeStyle');
    if (still !== 4) fails.push('treeStyle was rewritten to ' + still);
    if (fails.length) { console.error(fails.join('\n')); process.exitCode = 1; }
    else console.log('b63 tree branches: eight saved styles kept their connectors');
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
    server.close();
    await sleep(200);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}
main().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
