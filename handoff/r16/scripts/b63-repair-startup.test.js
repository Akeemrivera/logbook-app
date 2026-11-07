'use strict';
/*
  The packaged repair must settle on a first launch, a service-worker
  controlled reload, and an offline reload. An empty file settles too and
  does not clear a father. This does not retry a failed assertion.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const state = {
  plants: [{ id: 'p-target', name: 'Kept Plant', status: 'active', count: 2, startDate: '2024-03-01', vegStartDate: '2024-03-20', flowerStartDate: '2024-05-01', plannedFlipDate: '2024-05-01', b49Mother: 'mf:m1', b49Father: 'dx:FixtureFather', b58Manual: { m: true, f: true } }],
  motherFatherPlants: [{ id: 'm1', name: 'Kept Mother', role: 'mother', status: 'Active' }],
  breedingPlants: [], breedingProjects: [], cloneRuns: [],
};
const repair = JSON.stringify({ repairs: [{ recordId: 'p-target', collection: 'plants', field: 'b49Father', expect: 'dx:FixtureFather' }], undos: [] });
const empty = '{"repairs":[],"undos":[]}\n';
let repairBody = repair;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function fail(message) { console.error('FAIL ' + message); process.exit(1); }

async function main() {
  const probe = http.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }));
  const debug = port + 1;
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (rel === '/b63-repair.json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(repairBody);
      return;
    }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if (!file.startsWith(ROOT + path.sep) && file !== ROOT) { res.statusCode = 403; res.end('no'); return; }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-repair-startup-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', '--user-data-dir=' + dir, '--remote-debugging-port=' + debug, 'about:blank'], { stdio: 'ignore' });
  const init = 'localStorage.setItem("boriken-b63-snapshot","1"); localStorage.setItem("boriken-b63-snapshot-date","2026-11-06"); localStorage.setItem("boriken-genetics-logbook-v1", ' + JSON.stringify(JSON.stringify(state)) + ');';
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try { const list = await (await fetch('http://127.0.0.1:' + debug + '/json/list')).json(); page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); } catch (e) { await sleep(100); }
    }
    if (!page) fail('chrome did not open');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    let n = 0; const pending = new Map(); const logs = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.method === 'Runtime.consoleAPICalled') logs.push((msg.params.args || []).map((a) => a.value || a.description || '').join(' ').slice(0, 240));
      if (msg.method === 'Runtime.exceptionThrown') logs.push(String((msg.params.exceptionDetails && msg.params.exceptionDetails.exception && msg.params.exceptionDetails.exception.description) || 'exception').slice(0, 400));
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
      const out = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails).slice(0, 400));
      return out.result && out.result.value;
    }
    async function launch(label) {
      await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html?' + label });
      let snap = null;
      for (let i = 0; i < 40 && !(snap && snap.repair); i++) {
        snap = await evaluate('(() => { let father = ""; try { father = (state.plants.find((r) => r.id === "p-target") || {}).b49Father || ""; } catch (e) { father = ""; } return { readyState: document.readyState, repair: window.__b63RepairReady === true, detail: window.__b63RepairState || null, controller: !!(navigator.serviceWorker && navigator.serviceWorker.controller), father }; })()');
        if (!snap || !snap.repair) await sleep(50);
      }
      if (!snap || !snap.repair) fail(label + ' repair did not settle ' + JSON.stringify(snap));
      return snap;
    }
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Network.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    const first = await launch('first');
    if (first.father !== '-') fail('first launch left the father ' + JSON.stringify(first));
    if (first.detail.via !== 'sync' && first.detail.via !== 'fetch') fail('first launch via ' + JSON.stringify(first.detail));
    console.log('PASS first launch settled via ' + first.detail.via + ' controller=' + first.controller);
    const again = await launch('second-viewport');
    if (again.father !== '-') fail('second navigation left ' + JSON.stringify(again));
    console.log('PASS second navigation settled via ' + again.detail.via + ' controller=' + again.controller);
    let controlled = false;
    for (let i = 0; i < 80 && !controlled; i++) {
      controlled = await evaluate('!!(navigator.serviceWorker && navigator.serviceWorker.controller)');
      if (!controlled) await sleep(50);
    }
    if (!controlled) fail('service worker did not take control ' + logs.slice(-6).join(' | '));
    const second = await launch('reload');
    if (second.father !== '-' || !second.controller) fail('controlled reload left ' + JSON.stringify(second));
    if (second.detail.via !== 'fetch') fail('controlled reload did not read the network repair file ' + JSON.stringify(second.detail));
    console.log('PASS controlled reload settled via ' + second.detail.via);
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const offline = await launch('offline');
    if (offline.father !== '-') fail('offline reload left ' + JSON.stringify(offline));
    console.log('PASS offline reload settled via ' + offline.detail.via + ' bytes=' + offline.detail.bytes);
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    repairBody = empty;
    const blank = await launch('empty');
    if (!blank.repair || blank.father !== 'dx:FixtureFather') fail('empty file changed the father ' + JSON.stringify(blank));
    console.log('PASS empty file settled via ' + blank.detail.via + ' and left the father');
    console.log('b63 repair startup: first, controlled, offline, and empty launches settled');
  } finally {
    proc.kill('SIGKILL');
    server.close();
    await sleep(200);
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) {}
  }
}
main().catch((e) => fail(e && e.message || e));
