'use strict';
/*
  Public fixture only. Measures the family-tree name ribbon, including its
  subtitle, against the fixed tab bar.

  On current tree3 the 390x844 initial view leaves that ribbon under the bar,
  and the tree block has no bottom reserve, so this test fails.
  After the ribbon patch the reserve equals the tab bar plus
  env(safe-area-inset-bottom), the 390x844 ribbon sits fully above the bar
  without scrolling, and 375x667 and 1024x768 neither hide it under the bar
  nor grow wider than the screen.

  Chrome is the harness-flags renderer: --disable-extensions and
  --disable-component-extensions-with-background-pages.
  node scripts/b63-tree-ribbon.test.js
  node scripts/b63-tree-ribbon.test.js --self
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || '/opt/google/chrome/chrome';
const FLAGS = ['--disable-extensions', '--disable-component-extensions-with-background-pages'];
const state = {
  plants: [{ id: 'p-child', name: 'Fixture Child', status: 'active', count: 1, logs: [], treeStyle: 4, b49Mother: 'mf:m-mom', b49Father: 'mf:f-dad', b58Manual: { m: true, f: true } }],
  breedingPlants: [],
  motherFatherPlants: [
    { id: 'm-mom', name: 'Fixture Mother With A Long Label', role: 'mother', status: 'Active', treeStyle: 4 },
    { id: 'f-dad', name: 'Fixture Father With A Long Label', role: 'father', status: 'Active', treeStyle: 4 },
  ],
  breedingProjects: [],
  cloneRuns: [],
};
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function fitSource() {
  const candidates = [path.join(__dirname, 'build57.js'), path.join(ROOT, 'build57.js'), path.join(__dirname, '..', 'r19-tree', 'build57.js')];
  const file = candidates.find((item) => fs.existsSync(item));
  if (!file) throw new Error('build57.js not found');
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('let fitting = false;');
  const end = src.indexOf('const treeView = document.getElementById', start);
  if (start < 0 || end < 0) throw new Error('fitTree is missing from build57.js');
  return src.slice(start, end);
}

const MEASURE = `(() => {
  const mode = __MODE__;
  const root = document.querySelector('#breeding-view .b57');
  const bar = document.getElementById('tabbar');
  const box = bar ? bar.getBoundingClientRect() : null;
  const covers = !!(box && box.height >= 24 && box.bottom >= window.innerHeight - 12 && box.top >= window.innerHeight * 0.5);
  const tabTop = covers ? box.top : window.innerHeight;
  const tabH = covers ? box.height : 0;
  function portOf(el) {
    let n = el && el.parentElement;
    while (n && n !== document.body) {
      const s = getComputedStyle(n);
      if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
      n = n.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }
  function zero() {
    const de = document.scrollingElement || document.documentElement;
    de.scrollTop = 0;
    document.querySelectorAll('#breeding-view, .b57-scroll').forEach((el) => { el.scrollTop = 0; });
  }
  zero();
  if (mode === 'reveal') {
    const bans = [...document.querySelectorAll('#breeding-view .b57-ban')];
    bans.forEach((ban) => {
      const target = ban.querySelector('small') || ban;
      for (let i = 0; i < 8; i++) {
        const r = target.getBoundingClientRect();
        if (r.bottom <= tabTop - 1) break;
        const port = portOf(ban);
        const before = port.scrollTop;
        port.scrollTop = before + (r.bottom - tabTop + 2);
        if (port.scrollTop === before) break;
      }
    });
  }
  const de = document.scrollingElement || document.documentElement;
  const bans = [...document.querySelectorAll('#breeding-view .b57-ban')].map((ban) => {
    const small = ban.querySelector('small');
    const r = (small || ban).getBoundingClientRect();
    return { text: (small ? small.textContent : ban.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80), top: r.top, bottom: r.bottom, height: r.height, left: r.left, right: r.right };
  });
  const rowOf = (sel) => {
    const row = root && root.querySelector(sel);
    const cards = row ? [...row.children].filter((el) => el.classList.contains('b57-n')) : [];
    const tops = cards.map((el) => el.getBoundingClientRect().top);
    const rect = row ? row.getBoundingClientRect() : null;
    return { n: cards.length, one: tops.length > 1 && Math.max.apply(null, tops) - Math.min.apply(null, tops) < 12, bottom: rect ? rect.bottom : 0 };
  };
  const cards = [...document.querySelectorAll('#breeding-view .b57-n, #breeding-view .b57-ban, #breeding-view .b60-c')].filter((el) => el.getClientRects().length).map((el) => el.getBoundingClientRect());
  const wideCard = cards.some((r) => r.right > window.innerWidth + 1 || r.left < -1);
  const path = root && root.querySelector('.b57-canvas > svg.b60-lines path.branch');
  const d = path ? (path.getAttribute('d') || '') : '';
  const pad = root ? parseFloat(getComputedStyle(root).paddingBottom) || 0 : 0;
  return {
    k: root && root.getAttribute('data-b57k'),
    covers, tabTop, tabH, pad,
    reserve: root ? root.style.paddingBottom : '',
    scrollTop: (document.scrollingElement || document.documentElement).scrollTop,
    pan: de.scrollWidth > de.clientWidth + 2,
    wideCard,
    bans,
    gp: rowOf('.b57-row.gp'),
    par: rowOf('.b57-row.par'),
    me: root && root.querySelector('.b57-me') ? root.querySelector('.b57-me').getBoundingClientRect().bottom : 0,
    curved: d.indexOf('C') >= 0,
    arc: !!(root && root.querySelector('.b57-canvas > svg.b60-lines path.arc')),
    text: ((root && root.innerText) || '').replace(/\\s+/g, ' ').slice(0, 400),
  };
})()`;

function judge(row, w, h, mode) {
  const fails = [];
  if (!row || !row.bans || !row.bans.length) fails.push('no ribbon');
  (row.bans || []).forEach((ban, i) => {
    if (ban.height < 4) fails.push('ribbon ' + i + ' has no subtitle');
    if (ban.bottom > row.tabTop - 0.5) fails.push('ribbon ' + i + ' bottom ' + Math.round(ban.bottom) + ' is under the bar ' + Math.round(row.tabTop));
    if (mode === 'initial' && ban.top < -1) fails.push('ribbon ' + i + ' starts above the initial view');
  });
  if (row.covers) {
    if (row.pad + 0.5 < row.tabH) fails.push('bottom reserve ' + row.pad + ' is shorter than the tab bar ' + row.tabH);
    if (!row.reserve || row.reserve.indexOf('env(safe-area-inset-bottom)') < 0) fails.push('reserve does not include env(safe-area-inset-bottom)');
  }
  if (mode === 'initial') {
    if (row.scrollTop > 1) fails.push('the initial view was scrolled');
    ['gp', 'par'].forEach((key) => {
      if (row[key] && row[key].n && row[key].bottom > row.tabTop - 0.5) fails.push(key + ' row is under the bar');
    });
    if (row.me && row.me > row.tabTop - 0.5) fails.push('this-plant circle is under the bar');
    if (row.k === 'ceiba') {
      if (!(row.gp.n === 4 && row.gp.one && row.par.n === 2 && row.par.one)) fails.push('ceiba rows changed ' + JSON.stringify({ gp: row.gp, par: row.par }));
      if (!row.curved || !row.arc) fails.push('ceiba branches changed');
    }
    if ((row.k === 'roots' || row.k === 'river') && !row.curved) fails.push(row.k + ' branches changed');
    if (row.k === 'cert' && row.text.indexOf('Certificado de linaje') < 0) fails.push('certificate title changed');
    if (row.text.indexOf('Raíces fuertes') >= 0 || row.k === 'azulejo' || row.k === 'walnut') {
      /* motto stays where the style already draws it */
    }
  }
  if (row.pan || row.wideCard) fails.push('horizontal overflow');
  if (row.text.indexOf('Fixture Mother With A Long Label') < 0) fails.push('fixture label missing');
  return fails;
}

async function main() {
  if (process.argv.includes('--self')) {
    await runSelf();
    return;
  }
  await runApp();
}

async function withChrome(handler, body) {
  if (!fs.existsSync(CHROME)) throw new Error('chrome missing at ' + CHROME);
  const probe = http.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }));
  const debugProbe = http.createServer();
  const debug = await new Promise((resolve) => debugProbe.listen(0, '127.0.0.1', () => { const p = debugProbe.address().port; debugProbe.close(() => resolve(p)); }));
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-ribbon-'));
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', ...FLAGS, '--user-data-dir=' + dir, '--remote-debugging-port=' + debug, 'about:blank'], { stdio: 'ignore' });
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
        const timer = setTimeout(() => reject(new Error('timeout ' + method)), 20000);
        pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result || {}); });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    async function evaluate(expression) {
      const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails).slice(0, 500));
      return out.result && out.result.value;
    }
    await send('Page.enable');
    await send('Runtime.enable');
    await body({ port, send, evaluate });
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
    server.close();
    await sleep(100);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  }
}

async function runSelf() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;font:16px/1.3 sans-serif">
<div id="tabbar" style="position:fixed;left:0;right:0;bottom:0;height:64px;background:#fff;z-index:5;border-top:1px solid #ddd"></div>
<div id="breeding-view">
  <div style="height:56px">You have not backed up this logbook yet.</div>
  <div class="b57" data-b57s="7" data-b57k="river" style="width:100%;box-sizing:border-box">
    <h2 class="b18-h1" style="margin:8px">Family tree</h2>
    <p>Fixture Mother With A Long Label</p>
    <div class="b57-scroll"><div class="b57-canvas" style="zoom:1">
      <div style="height:420px"></div>
      <div class="b57-row gp" style="display:flex"><div class="b57-n" style="height:80px;flex:1">a</div><div class="b57-n" style="height:80px;flex:1">b</div><div class="b57-n" style="height:80px;flex:1">c</div><div class="b57-n" style="height:80px;flex:1">d</div></div>
      <div class="b57-row par" style="display:flex"><div class="b57-n" style="height:70px;flex:1">m</div><div class="b57-n" style="height:70px;flex:1">f</div></div>
      <div class="b57-me" style="height:120px">this plant</div>
      <div class="b57-ban" style="background:#6b4a32;color:#fff;padding:8px 12px"><b>FIXTURE CHILD · F1</b><small style="display:block">Fixture Mother With A Long Label × Fixture Father With A Long Label</small></div>
    </div></div>
  </div>
</div></body></html>`;
  await withChrome((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }, async ({ port, send, evaluate }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
    await sleep(200);
    const before = await evaluate(MEASURE.replace('__MODE__', "'initial'"));
    const beforeFails = judge(before, 390, 844, 'initial');
    if (!beforeFails.some((line) => line.indexOf('under the bar') >= 0)) throw new Error('self check expected an overlap, got ' + JSON.stringify(beforeFails) + ' ' + JSON.stringify(before));
    console.log('PASS self unfixed 390x844 fails: ' + beforeFails.filter((line) => line.indexOf('under the bar') >= 0)[0]);
    await evaluate(fitSource() + '\nfitTree();');
    await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    const after = await evaluate(MEASURE.replace('__MODE__', "'initial'"));
    const afterFails = judge(after, 390, 844, 'initial').filter((line) => line.indexOf('ceiba') < 0 && line.indexOf('branches') < 0 && line.indexOf('certificate') < 0);
    if (afterFails.length) throw new Error('self fixed page still fails ' + afterFails.join('; ') + ' ' + JSON.stringify(after));
    console.log('PASS self fixed 390x844 ribbon bottom ' + Math.round(after.bans[0].bottom) + ' tab ' + Math.round(after.tabTop) + ' reserve ' + after.pad);
    await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
    await evaluate('fitTree();');
    await sleep(40);
    const phone = await evaluate(MEASURE.replace('__MODE__', "'reveal'"));
    const phoneFails = judge(phone, 375, 667, 'reveal').filter((line) => line.indexOf('ceiba') < 0 && line.indexOf('branches') < 0 && line.indexOf('certificate') < 0);
    if (phoneFails.length) throw new Error('self 375x667 ' + phoneFails.join('; ') + ' ' + JSON.stringify(phone));
    console.log('PASS self 375x667 ribbon clears the bar, reserve ' + phone.pad);
    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await evaluate('window.dispatchEvent(new Event("resize")); fitTree();');
    const wide = await evaluate(MEASURE.replace('__MODE__', "'reveal'"));
    if (wide.pan || wide.wideCard) throw new Error('self 1024 overflow ' + JSON.stringify(wide));
    console.log('PASS self 1024x768 no horizontal overflow');
  });
  console.log('b63 tree ribbon self-check passed');
}

function appHandler(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
  if ((!file.startsWith(ROOT + path.sep) && file !== ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
  const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.end(fs.readFileSync(file));
}

async function runApp() {
  const fails = [];
  await withChrome(appHandler, async ({ port, send, evaluate }) => {
    const init = 'localStorage.setItem("boriken-genetics-logbook-v1", ' + JSON.stringify(JSON.stringify(state)) + ');';
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html' });
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      ready = await evaluate('!!(window.B57 && window.B49 && window.B60 && window.__b63Boot && window.__b63Boot.ready)');
      if (!ready) await sleep(50);
    }
    if (!ready) throw new Error('app did not boot');
    for (const [w, h, mode] of [[390, 844, 'initial'], [375, 667, 'reveal'], [1024, 768, 'reveal']]) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
      for (let style = 1; style <= 8; style++) {
        await evaluate('(() => { B49.openPage({ type: "b49tree", key: "pl:p-child", forceStyle: ' + style + ' }); return true; })()');
        await evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
        await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
        await sleep(360);
        const row = await evaluate(MEASURE.replace('__MODE__', JSON.stringify(mode)));
        const bad = judge(row, w, h, mode);
        if (bad.length) fails.push(w + 'x' + h + ' style ' + style + ' ' + (row && row.k) + ' ' + bad.join('; '));
        else console.log('PASS ribbon style ' + style + ' ' + row.k + ' ' + w + 'x' + h + (mode === 'initial' ? ' bottom=' + Math.round(row.bans[0].bottom) + ' tab=' + Math.round(row.tabTop) + ' reserve=' + Math.round(row.pad) : ' clear'));
      }
    }
  });
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log('b63 tree ribbon: eight styles stay above the tab bar');
}

main().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
