'use strict';
/*
  TEST FIXTURE. Not a user mockup. Not loaded by index.html and not copied
  into the app bundle. The records below exist only in this script's
  throwaway browser profile. Do not rename them to real plant names.
  Full application, not the stripped layout fixture. Chrome loads index.html,
  the real styles, and the default wide zoom. Names must stay whole words.
  The agreed sidebar is 248px at a real 1024 and 1366 window. Text size stays
  the default. Headings and the Parents label stay. This does not loosen
  the stripped-fixture assertions.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = '/opt/google/chrome/chrome';
const PORT = 9371;
if (!fs.existsSync(CHROME)) {
  console.error('FAIL real Chrome is not installed at ' + CHROME);
  process.exit(1);
}
const SEED = {
  plants: [
    { id: 'syn-grow-long', name: 'SyntheticLongName AlphaBeta', cultivar: 'SyntheticLongName AlphaBeta', status: 'active', count: 1, complianceStage: 'immature', location: 'Tent A', areaOrRoom: 'Tent A', tagStatus: 'current', tagTextSnapshot: 'SYN-TAG-001', tagAttached: true, logs: [], internalPlantCode: 'SYN-001', treeStyle: 2 },
    { id: 'syn-grow-short', name: 'Synthetic Sprout', cultivar: 'Synthetic Sprout', status: 'active', count: 1, complianceStage: 'mature', location: 'Tent B', areaOrRoom: 'Tent B', tagStatus: 'none', logs: [], internalPlantCode: 'SYN-002', treeStyle: 2 },
  ],
  motherFatherPlants: [
    { id: 'syn-gran', name: 'Synthetic Gran', role: 'mother', status: 'Active', archived: false, treeStyle: 2, cuttings: [], pollen: [] },
    { id: 'syn-granf', name: 'Synthetic Grandfather', role: 'father', status: 'Active', archived: false, treeStyle: 2, cuttings: [], pollen: [] },
    { id: 'syn-mother', name: 'Synthetic Mother', role: 'mother', status: 'Active', archived: false, treeStyle: 2, cuttings: [], pollen: [], b49Mother: 'mf:syn-gran', b49Father: 'mf:syn-granf' },
    { id: 'syn-father', name: 'Synthetic Father', role: 'father', status: 'Active', archived: false, treeStyle: 2, cuttings: [], pollen: [] },
    { id: 'syn-sample', name: 'Synthetic Sample', role: 'father', status: 'Active', archived: false, treeStyle: 2, cuttings: [], pollen: [] },
    { id: 'syn-retired', name: 'Synthetic Retired', role: 'mother', status: 'Retired', archived: false, treeStyle: 2, cuttings: [], pollen: [] },
  ],
  breedingProjects: [
    { id: 'syn-cross', name: 'Synthetic Cross', motherId: 'syn-mother', fatherId: 'syn-sample', mother: 'Synthetic Mother', father: 'Synthetic Sample', status: 'Planning', treeStyle: 2 },
    { id: 'syn-kept', name: 'Kept Cross', motherId: 'syn-mother', fatherId: 'syn-father', mother: 'Synthetic Mother', father: 'Synthetic Father', status: 'Planning', treeStyle: 2 },
  ],
  settings: { mfHelperDismissed: true },
};
const INIT = `
localStorage.setItem('boriken-genetics-logbook-v1', ${JSON.stringify(JSON.stringify(SEED))});
localStorage.setItem('boriken-onboard-done', '1');
localStorage.setItem('boriken-theme-pref-v1', 'light');
localStorage.setItem('boriken-b63-view', JSON.stringify({ hideIds: ['syn-sample'] }));
`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ttf': 'font/ttf', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.statusCode = 403; res.end('no'); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(fs.readFileSync(file));
});
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const READ = `(() => {
  function splits(el) {
    const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return [];
    const text = node.textContent;
    const bad = [];
    let top = null;
    for (let i = 0; i < text.length; i++) {
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const box = range.getClientRects()[0];
      if (!box || !box.height) continue;
      if (top == null) top = box.top;
      else if (box.top > top + 1) {
        const prev = text[i - 1] || '';
        if (prev && !/[\\s×·\\-]/.test(prev)) bad.push(text.slice(Math.max(0, i - 14), i) + '|' + text.slice(i, i + 10));
        top = box.top;
      }
    }
    return bad;
  }
  const names = [...document.querySelectorAll('#breeding-view .b60-c b, #breeding-view .b60-c small, #breeding-view .b57-subt, #breeding-view .b57-ban small, #breeding-view .b59-plab b, #breeding-view .b59-plab small')];
  const broken = names.flatMap((el) => splits(el).map((s) => el.textContent.trim() + ' :: ' + s));
  const lab = document.querySelector('#breeding-view .b57-tools .m-s');
  const labCs = lab ? getComputedStyle(lab) : null;
  const card = document.querySelector('#breeding-view .b60-col > .b60-c:not(.slot)');
  const cardCs = card ? getComputedStyle(card) : null;
  const pairs = [...document.querySelectorAll('#breeding-view .b60-cols')].map((row) => {
    const cols = [...row.querySelectorAll(':scope > .b60-col')].map((c) => Math.round(c.getBoundingClientRect().width));
    return cols;
  });
  const side = document.querySelector('.w-side');
  const sideCs = side ? getComputedStyle(side) : null;
  const mother = (state.motherFatherPlants || []).find((m) => m.id === 'syn-mother');
  return {
    view: window.innerWidth,
    height: window.innerHeight,
    doc: document.documentElement.scrollWidth,
    layout: document.documentElement.dataset.layout || '',
    weff: document.documentElement.dataset.weff || '',
    zoom: document.documentElement.style.zoom || '',
    textSize: (state.settings && state.settings.textSize) || 'default',
    who: ((document.querySelector('#breeding-view .b57-ban b') || {}).textContent) || '',
    sub: (document.querySelector('#breeding-view .b57-subt') || {}).textContent || '',
    mother: mother && mother.b49Mother,
    father: mother && mother.b49Father,
    broken,
    gen: lab ? lab.textContent : '',
    genClip: !!(lab && (labCs.whiteSpace === 'nowrap' || labCs.textOverflow === 'ellipsis' || lab.scrollWidth > lab.clientWidth + 2)),
    minH: cardCs && cardCs.minHeight,
    pairs,
    side: sideCs && sideCs.width,
    sidePos: sideCs && sideCs.position,
    sample: document.body.innerText.includes('Synthetic Sample'),
  };
})()`;

async function main() {
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  const dir = '/tmp/b63-r9-fullapp-chrome';
  fs.rmSync(dir, { recursive: true, force: true });
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--user-data-dir=' + dir, '--remote-debugging-port=9372', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:9372/json/list')).json();
        page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      } catch (e) { await sleep(100); }
    }
    if (!page) throw new Error('chrome did not open');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject); });
    const pending = new Map();
    let n = 0;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { const done = pending.get(msg.id); pending.delete(msg.id); done(msg); }
    });
    function send(method, params) {
      const id = ++n;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout ' + method)), 20000);
        pending.set(id, (msg) => { clearTimeout(timer); if (msg.error) reject(new Error(method + ' ' + JSON.stringify(msg.error))); else resolve(msg.result || {}); });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
    const sizes = [[390, 844], [768, 1024], [1024, 768], [1024, 1366], [1366, 1024]];
    for (const [w, h] of sizes) {
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
      await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html?w=' + w + '&h=' + h });
      let ready = false;
      for (let i = 0; i < 40 && !ready; i++) {
        const out = await send('Runtime.evaluate', { expression: `document.readyState === 'complete' && !!document.querySelector('script[src="build63.js"]')`, returnByValue: true });
        ready = out.result && out.result.value;
        if (!ready) await sleep(50);
      }
      if (!ready) throw new Error('page did not load at ' + w);
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
      await send('Runtime.evaluate', { expression: `(() => { switchView('breeding'); B49.openPage({ type: 'b49tree', key: 'mf:syn-mother', forceStyle: 2 }); return true; })()`, returnByValue: true });
      let styled = false;
      for (let i = 0; i < 40 && !styled; i++) {
        const out = await send('Runtime.evaluate', { expression: `(() => { const c = document.querySelector('#breeding-view .b60-col > .b60-c:not(.slot)'); return !!(c && getComputedStyle(c).minHeight === '110px'); })()`, returnByValue: true });
        styled = out.result && out.result.value;
        if (!styled) await sleep(50);
      }
      if (!styled) throw new Error('tree styles were not applied at ' + w + 'x' + h);
      await send('Runtime.evaluate', { expression: `new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))`, awaitPromise: true, returnByValue: true });
      const measured = await send('Runtime.evaluate', { expression: READ, returnByValue: true });
      const d = measured.result && measured.result.value;
      if (!d) throw new Error('no measure ' + w);
      if (d.view !== w || d.doc > w + 1) throw new Error('overflow ' + JSON.stringify(d));
      if (d.minH !== '110px') throw new Error('card min-height ' + JSON.stringify(d));
      if (d.broken.length) throw new Error('name split inside a word at ' + w + 'x' + h + ' ' + JSON.stringify(d.broken));
      if (!d.gen.includes('generation recorded') || d.genClip) throw new Error('generation control ' + JSON.stringify({ gen: d.gen, clip: d.genClip }));
      if (!d.who.includes('Synthetic Mother') || d.mother !== 'mf:syn-gran' || d.father !== 'mf:syn-granf') throw new Error('selected record ' + JSON.stringify(d));
      if (!d.sub.includes('Synthetic Gran') || !d.sub.includes('Synthetic Grandfather') || !d.sub.includes('×')) throw new Error('subtitle is not the selected mother parents ' + d.sub);
      if (d.sample) throw new Error('hidden synthetic id is on the tree');
      d.pairs.forEach((cols) => {
        if (cols.length === 2 && Math.abs(cols[0] - cols[1]) > 2) throw new Error('halves ' + JSON.stringify(cols));
      });
      if (d.textSize !== 'default') throw new Error('text size changed ' + d.textSize);
      if (w >= 1024) {
        if (d.layout !== 'wide' || Math.abs(parseFloat(d.side) - 248) > 0.6 || d.sidePos !== 'fixed') throw new Error('sidebar ' + JSON.stringify(d));
        if (d.zoom !== '1.28') throw new Error('zoom changed ' + JSON.stringify(d));
        if (!d.weff) throw new Error('effective-width flag was cleared ' + JSON.stringify(d));
      } else if (d.layout === 'wide') {
        throw new Error('wide layout below 1024 ' + JSON.stringify(d));
      }
      console.log('PASS full app', w + 'x' + h, JSON.stringify({ side: d.side, zoom: d.zoom || '1', weff: d.weff, doc: d.doc, gen: d.gen, sub: d.sub }));
    }
    console.log('b63 r9: full app layout passed');
  } finally {
    proc.kill('SIGKILL');
    server.close();
  }
}
main().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
