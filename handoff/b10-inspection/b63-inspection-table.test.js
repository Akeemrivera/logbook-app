'use strict';
/*
  Public fixture only. The inspection table must not break a heading in the
  middle of a word, clip a cell, or scroll sideways.

  Widths: 390x844, 375x667, 717x900, 1024x768.
  Below 1024 each row is a card. At 1024 the table stays.
  Chrome uses the harness flags from renderer 179ccd72.

  node scripts/b63-inspection-table.test.js
  node scripts/b63-inspection-table.test.js --self
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || '/opt/google/chrome/chrome';
const FLAGS = ['--disable-extensions', '--disable-component-extensions-with-background-pages'];
const WIDTHS = [[390, 844], [375, 667], [717, 900], [1024, 768]];
const state = {
  plants: [1, 2, 3, 4].map((n) => ({
    id: 'fx-' + n,
    name: 'Fixture Plant ' + n,
    status: 'active',
    count: 1,
    complianceStage: n % 2 ? 'immature' : 'mature',
    cultivar: 'Fixture Cultivar ' + n,
    location: 'Indoor tent',
    areaOrRoom: 'Room ' + n,
    internalPlantCode: 'FX-00' + n,
    tagStatus: n === 1 ? 'none' : 'current',
    tagAttached: n !== 1,
    logs: [],
  })),
  breedingPlants: [],
  motherFatherPlants: [],
  breedingProjects: [],
  cloneRuns: [],
};
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cssFile() {
  const candidates = [path.join(__dirname, 'build63.css'), path.join(ROOT, 'build63.css'), path.join(__dirname, '..', 'r19-tree', 'build63.css')];
  const file = candidates.find((item) => fs.existsSync(item));
  if (!file) throw new Error('build63.css not found');
  return fs.readFileSync(file, 'utf8');
}

const MEASURE = `(() => {
  const narrow = window.innerWidth < 1024;
  const panel = document.querySelector('#compliance-panel-inspection');
  const table = panel && panel.querySelector('table.compliance-table');
  const thead = table && table.querySelector('thead');
  const stacked = !!(thead && getComputedStyle(thead).display === 'none');
  function linesOf(el) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) return null;
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    const text = ((node ? node.textContent : el.textContent) || '').replace(/\\s+/g, ' ').trim();
    if (!text) return null;
    const lines = [];
    if (!node) return { text, count: 1, broken: false };
    const raw = node.textContent;
    const range = document.createRange();
    let line = '';
    let top = null;
    for (let i = 0; i < raw.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const box = range.getClientRects()[0];
      if (!box || box.width === 0) { line += raw[i]; continue; }
      if (top !== null && box.top > top + 2) { lines.push(line); line = raw[i]; }
      else line += raw[i];
      top = box.top;
    }
    if (line) lines.push(line);
    const cleaned = lines.map((s) => s.replace(/\\s+/g, ' ').trim()).filter(Boolean);
    const words = text.split(/\\s+/);
    let broken = !/\\s/.test(text) && cleaned.length > 1;
    let at = 0;
    if (!broken) {
      cleaned.forEach((part) => {
        part.split(/\\s+/).filter(Boolean).forEach((word) => {
          if (words[at] !== word) broken = true;
          at += 1;
        });
      });
      if (at !== words.length) broken = true;
    }
    return { text, count: cleaned.length, broken };
  }
  const headers = [...(table ? table.querySelectorAll('thead th') : [])].map(linesOf).filter(Boolean);
  const boundRight = Math.min(panel ? panel.getBoundingClientRect().right : window.innerWidth, window.innerWidth);
  const boundLeft = panel ? panel.getBoundingClientRect().left : 0;
  const cells = [...(panel ? panel.querySelectorAll('th, td') : [])].filter((el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && el.getClientRects().length;
  }).map((el) => {
    const r = el.getBoundingClientRect();
    return { right: r.right, left: r.left, over: r.width > 0 && (r.right > boundRight + 1 || r.left < boundLeft - 1) };
  });
  const de = document.scrollingElement || document.documentElement;
  const wrap = (panel && panel.querySelector('.table-wrap')) || panel;
  const labels = [...(table ? table.querySelectorAll('tbody td') : [])].map((td) => (getComputedStyle(td, '::before').content || '').replace(/^"|"$/g, ''));
  return {
    narrow, stacked, headers, cells,
    rows: table ? table.querySelectorAll('tbody tr').length : 0,
    labels,
    pan: de.scrollWidth > de.clientWidth + 2,
    wrapPan: !!(wrap && wrap.scrollWidth > wrap.clientWidth + 2),
    missing: !table,
  };
})()`;

function judge(row, w) {
  const fails = [];
  if (!row || row.missing) return ['inspection table is missing'];
  const narrow = w < 1024;
  if (narrow && !row.stacked) fails.push('the table did not reflow into cards');
  if (!narrow && row.stacked) fails.push('the wide layout hid the table');
  (row.headers || []).forEach((header) => {
    if (header.broken) fails.push('heading broke a word: ' + JSON.stringify(header));
  });
  if ((row.cells || []).some((cell) => cell.over)) fails.push('a cell extends outside the card');
  if (row.pan) fails.push('the page scrolls sideways');
  if (row.wrapPan) fails.push('the table container scrolls sideways');
  if (!row.rows) fails.push('the table has no rows');
  if (narrow) {
    const wanted = ['Plant code', 'Patient alias', 'Cert ID', 'Cultivar', 'Stage', 'Area', 'Tag status', 'Last updated'];
    const got = (row.labels || []).slice(0, wanted.length);
    if (got.join('|') !== wanted.join('|')) fails.push('card labels changed ' + JSON.stringify(got));
  }
  return fails;
}

const OLD_CSS = `
#compliance-panel-inspection .table-wrap { overflow: hidden; max-width: 100%; }
#compliance-panel-inspection table.compliance-table { min-width: 920px; width: 100%; border-collapse: collapse; }
#compliance-panel-inspection .compliance-table th { word-break: break-all; text-transform: uppercase; font: 700 11px/1.15 sans-serif; letter-spacing: .08em; }`;

function pageHtml(extra) {
  const head = ['Plant code', 'Patient alias', 'Cert ID', 'Cultivar', 'Stage', 'Area', 'Tag status', 'Last updated'];
  const rows = [1, 2, 3].map((n) => '<tr>' + head.map((_, i) => '<td>Fixture value ' + n + '-' + i + '</td>').join('') + '</tr>').join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>
body{margin:0;font:16px/1.3 sans-serif;background:#111;color:#eee}
#compliance-panel-inspection{box-sizing:border-box}
@media (min-width:1024px){body{padding-left:248px}}
${extra || ''}
</style><body><div id="compliance-panel-inspection"><div class="table-wrap"><table class="compliance-table"><thead><tr>${head.map((h) => '<th>' + h + '</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div></div></body>`;
}

async function withChrome(handler, body) {
  if (!fs.existsSync(CHROME)) throw new Error('chrome missing at ' + CHROME);
  const probe = http.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }));
  const debugProbe = http.createServer();
  const debug = await new Promise((resolve) => debugProbe.listen(0, '127.0.0.1', () => { const p = debugProbe.address().port; debugProbe.close(() => resolve(p)); }));
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-inspect-'));
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
  const html = pageHtml(OLD_CSS);
  await withChrome((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }, async ({ port, send, evaluate }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' });
    await sleep(200);
    const before = await evaluate(MEASURE);
    const beforeFails = judge(before, 800);
    if (!beforeFails.length) throw new Error('self check expected the unfixed table to fail ' + JSON.stringify(before));
    console.log('PASS self unfixed 800 fails: ' + beforeFails[0]);
    await evaluate('(() => { const s = document.createElement("style"); s.textContent = ' + JSON.stringify(cssFile()) + '; document.head.appendChild(s); return true; })()');
    for (const scheme of ['light', 'dark']) {
      await evaluate('document.documentElement.style.colorScheme = ' + JSON.stringify(scheme));
      for (const [w, h] of WIDTHS) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
        await sleep(40);
        const row = await evaluate(MEASURE);
        const bad = judge(row, w);
        if (bad.length) throw new Error('self ' + scheme + ' ' + w + 'x' + h + ' ' + bad.join('; ') + ' ' + JSON.stringify(row).slice(0, 500));
        console.log('PASS self ' + scheme + ' ' + w + 'x' + h + (w < 1024 ? ' cards' : ' table'));
      }
    }
  });
  console.log('b63 inspection table self-check passed');
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
      ready = await evaluate('!!(window.__b63Boot && window.__b63Boot.ready && document.getElementById("compliance-subtab-inspection"))');
      if (!ready) await sleep(50);
    }
    if (!ready) throw new Error('app did not boot');
    await evaluate('(() => { switchView("compliance"); document.getElementById("compliance-subtab-inspection").click(); return true; })()');
    await sleep(200);
    for (const scheme of ['light', 'dark']) {
      await evaluate('document.documentElement.style.colorScheme = ' + JSON.stringify(scheme));
      for (const [w, h] of WIDTHS) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
        await evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
        await sleep(80);
        const row = await evaluate(MEASURE);
        const bad = judge(row, w);
        if (bad.length) fails.push(scheme + ' ' + w + 'x' + h + ' ' + bad.join('; '));
        else console.log('PASS inspection ' + scheme + ' ' + w + 'x' + h + (w < 1024 ? ' cards rows=' + row.rows : ' table'));
      }
    }
  });
  if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
  console.log('b63 inspection table: headings stay whole and the card fits');
}

(async () => {
  if (process.argv.includes('--self')) await runSelf();
  else await runApp();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
