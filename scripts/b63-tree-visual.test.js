'use strict';
/*
  Public fixture only. Azulejo keeps one plant circle and one ribbon.
  Each fan label stays inside its own wedge, does not overlap another
  label or the centre circle, and is drawn at its natural width.
  Ceiba keeps the title glyph, and opening the tree from Breeding
  leaves the Breeding tab active.

  Widths 390x844, 375x667, 1024x768. Light, then setThemePref('dark').
  Chrome uses the harness flags from renderer 179ccd72.

  node scripts/b63-tree-visual.test.js
  node scripts/b63-tree-visual.test.js --self
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME || '/opt/google/chrome/chrome';
const FLAGS = ['--disable-extensions', '--disable-component-extensions-with-background-pages'];
const WIDTHS = [[390, 844], [375, 667], [1024, 768]];
const state = {
  plants: [
    { id: 'p-nophoto', name: 'Fixture Child', status: 'active', count: 1, logs: [], treeStyle: 4, b49Mother: 'mf:m-mom', b49Father: 'mf:f-dad', b58Manual: { m: true, f: true } },
    { id: 'p-sib', name: 'Fixture Sibling', status: 'active', count: 1, logs: [], treeStyle: 4, b49Mother: 'mf:m-mom', b49Father: 'mf:f-dad', b58Manual: { m: true, f: true } },
  ],
  breedingPlants: [],
  motherFatherPlants: [
    { id: 'm-mom', name: 'Fixture Mother With A Long Label', role: 'mother', status: 'Active', treeStyle: 4 },
    { id: 'f-dad', name: 'Fixture Father With A Long Label', role: 'father', status: 'Active', treeStyle: 4 },
  ],
  breedingProjects: [],
  cloneRuns: [],
};
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const MEASURE = `(() => {
  const root = document.querySelector('#breeding-view .b57');
  const k = root && root.getAttribute('data-b57k');
  /* b64 (check-replacements #2): this plant is counted with the b64 selectors, including the hanging .b59-pc.me circle. */
  const circles = root ? root.querySelectorAll('.b57-ctr, .b57-me, .b59-pc.me, .b57-rose .b57-ph').length : 0;
  const ribbons = root ? root.querySelectorAll('.b57-ban').length : 0;
  /* b64 (#3): the Certificate shows this plant as one card (.b57-pme) or as one joined pair. */
  const certMe = root ? root.querySelectorAll('.b57-pme').length : 0;
  const certPair = root ? root.querySelectorAll('.b59-pair').length : 0;
  const h = root && root.querySelector('.b18-h1');
  const hr = h ? h.getBoundingClientRect() : null;
  const imgs = [...(root ? root.querySelectorAll('img.mz-inline') : [])].filter((img) => {
    if (!h) return false;
    if (img.closest('.b57-canvas, .b57-scroll, .b57-ban, .b57-svgw, #tabbar')) return false;
    if (h.contains(img)) return true;
    const r = img.getBoundingClientRect();
    return r.bottom >= hr.top - 12 && r.top <= hr.bottom + 16;
  });
  const glyph = imgs.some((img) => {
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    return img.complete && img.naturalWidth > 0 && r.width >= 8 && r.height >= 8 && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0;
  });
  const badge = imgs.length > 0 || [...(root ? root.querySelectorAll('span, div, i') : [])].some((el) => {
    if (!hr || el.closest('.b57-canvas, .b57-scroll, .b57-tools, #tabbar')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 18 || r.width > 96 || Math.abs(r.width - r.height) > 10) return false;
    return r.bottom >= hr.top - 8 && r.top <= hr.bottom + 8;
  });
  const labels = [...(root ? root.querySelectorAll('svg.b57-svg text') : [])].map((el) => {
    const r = el.getBoundingClientRect();
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    const full = (el.getAttribute('data-full') || text).replace(/\\s+/g, ' ').trim();
    const cs = getComputedStyle(el);
    return {
      text, full,
      cut: full && text.replace(/\\s/g, '') !== full.replace(/\\s/g, ''),
      ellipsis: /\\u2026|\\.\\.\\./.test(text) || cs.textOverflow === 'ellipsis',
      /* b64 (#7): no label is cut by the page edge sideways, and every label can be reached by scrolling (full-page box, not the first screen). */
      outside: r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1 || r.top + window.scrollY < -1 || r.bottom + window.scrollY > (document.scrollingElement || document.documentElement).scrollHeight + 1),
    };
  });
  function boxOf(el) { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }
  function hits(a, b) { return a.w > 0.4 && b.w > 0.4 && a.l < b.r - 0.6 && a.r > b.l + 0.6 && a.t < b.b - 0.6 && a.b > b.t + 0.6; }
  const fanSvg = root && root.querySelector('svg.b57-svg.fan');
  let fan = null;
  if (fanSvg) {
    const centre = fanSvg.querySelector('.b57-ctr');
    const cr = centre ? boxOf(centre) : null;
    const segs = [...fanSvg.querySelectorAll('g.b57-seg')].map((g) => {
      const path = g.querySelector('path');
      const pb = path ? boxOf(path) : null;
      const bits = [...g.querySelectorAll('text')].flatMap((text) => {
        const spans = [...text.querySelectorAll('tspan')];
        const nodes = spans.length ? spans : [text];
        const full = (text.getAttribute('data-full') || text.textContent || '').replace(/\\s+/g, '');
        const shown = (text.textContent || '').replace(/\\s+/g, '');
        const svg = text.ownerSVGElement;
        const vb = svg && svg.viewBox && svg.viewBox.baseVal;
        const scale = vb && vb.width ? svg.getBoundingClientRect().width / vb.width : 1;
        const fs = (parseFloat(getComputedStyle(text).fontSize) || 0) * (scale || 1);
        const mismatched = text.hasAttribute('textLength') || shown !== full;
        return nodes.map((el) => {
          const b = boxOf(el);
          let intended = 0;
          try {
            const ctx = document.createElement('canvas').getContext('2d');
            ctx.font = getComputedStyle(el).font;
            intended = ctx.measureText(el.textContent || '').width;
          } catch (e) { intended = 0; }
          const crushed = mismatched || (intended > 4 && scale > 0 && b.w + 1.5 < intended * scale * 0.88);
          return { b, fs, crushed };
        });
      });
      return { pb, bits, aria: g.getAttribute('aria-label') || '' };
    });
    /* b64 (#6): lines inside one label sit at 1.0 leading, so they are not compared with each other.
       Two different labels must stay 4 CSS px apart. */
    const near = (a, b, g) => a.w > 0.4 && b.w > 0.4 && a.l < b.r + g && a.r > b.l - g && a.t < b.b + g && a.b > b.t - g;
    let overlap = false;
    for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) segs[i].bits.forEach((a) => segs[j].bits.forEach((b) => { if (near(a.b, b.b, 4)) overlap = true; }));
    const outside = segs.some((seg) => seg.pb && seg.bits.some((bit) => bit.b.w > 0.4 && (bit.b.l < seg.pb.l - 1.5 || bit.b.r > seg.pb.r + 1.5 || bit.b.t < seg.pb.t - 1.5 || bit.b.b > seg.pb.b + 1.5)));
    const centreHit = !!(cr && segs.some((seg) => seg.bits.some((bit) => hits(bit.b, cr))));
    const clipped = segs.some((seg) => seg.bits.some((bit) => bit.crushed));
    const small = segs.some((seg) => seg.bits.some((bit) => bit.fs && bit.fs < (window.innerWidth >= 380 && window.innerWidth <= 430 ? 9 : 8.2)));
    /* b64 (#5): the solver's size bar, every fan label at least 11 CSS px (its 4 px seam/arc/hub clearance is measured on pixels by pixel_verify) */
    const fsMin = Math.min(...segs.flatMap((seg) => seg.bits.map((bit) => bit.fs || 99))); const under11 = fsMin < 11 - 0.05;
    const short = segs.filter((seg) => /\\+ Not recorded/.test(seg.aria)).length;
    /* b64 (#8): an empty grandparent slot reads "Not recorded" (b64 wording "Not recorded · tap to add"), and no missing slot is ever Self (S1). */
    const empty = segs.filter((seg) => /^\\+? ?Not recorded\\b/.test(seg.aria)).length;
    const selfMissing = segs.some((seg) => /Self|\\bS1\\b|same as Not recorded/i.test(seg.aria));
    fan = { segments: segs.length, overlap, outside, centreHit, clipped, small, under11, fsMin, short, empty, selfMissing };
  }
  const de = document.scrollingElement || document.documentElement;
  const breed = document.querySelector('#tabbar [data-tab-view="breeding"]');
  const lin = document.querySelector('#tabbar [data-tab-view="lineage"]');
  const on = (el) => !!(el && (el.classList.contains('active') || el.classList.contains('on') || el.getAttribute('aria-current') === 'page'));
  const activeTabs = [...document.querySelectorAll('#tabbar [data-tab-view]')].filter(on).map((el) => el.getAttribute('data-tab-view'));
  return {
    activeTabs, certMe, certPair,
    k, circles, ribbons, badge, glyph, labels, fan,
    pan: de.scrollWidth > de.clientWidth + 2,
    breed: on(breed), lineage: on(lin),
    notRecorded: labels.some((row) => row.full === 'Not recorded' || row.full === '+ Not recorded'),
  };
})()`;

function judge(row, style) {
  const fails = [];
  if (!row || !row.k) return ['tree did not render'];
  if (row.k === 'cert') {
    if (row.certMe + row.certPair !== 1) fails.push('this-plant card or pair ' + (row.certMe + row.certPair));
    if (row.certPair ? row.ribbons !== 1 : row.ribbons > 1) fails.push('ribbons ' + row.ribbons);
  } else {
    if (row.circles !== 1) fails.push('plant circles ' + row.circles);
    if (row.ribbons !== 1) fails.push('ribbons ' + row.ribbons);
  }
  if (row.pan) fails.push('page scrolls sideways');
  if (row.k === 'azulejo') {
    (row.labels || []).forEach((label) => {
      if (label.cut || label.ellipsis) fails.push('label truncated ' + JSON.stringify(label));
      if (label.outside) fails.push('label outside the screen ' + JSON.stringify(label));
    });
    if (!row.notRecorded) fails.push('outer Not recorded label is missing');
    if (!row.fan || row.fan.segments < 4) fails.push('grandparent wedges missing');
    else {
      if (row.fan.overlap) fails.push('fan labels overlap');
      if (row.fan.outside) fails.push('a fan label leaves its wedge');
      if (row.fan.centreHit) fails.push('a fan label hits the centre circle');
      if (row.fan.clipped) fails.push('a fan label is clipped');
      if (row.fan.small) fails.push('a fan label is under 9px');
      if (row.fan.under11) fails.push('a fan label is under 11 CSS px (' + row.fan.fsMin.toFixed(2) + ')');
      if (row.fan.empty < (row.expectEmpty || 0)) fails.push('an empty slot is not Not recorded (' + row.fan.empty + ' of ' + row.expectEmpty + ')');
      if (row.fan.selfMissing) fails.push('a missing slot is shown as Self (S1)');
    }
  }
  if (!row.badge || !row.glyph) fails.push('title badge glyph is missing');
  /* b64 (#1): exactly one tab is active, and it is Lineage (the approved mockups), wherever the tree was opened from. */
  if (row.from) {
    if ((row.activeTabs || []).length !== 1) fails.push('active tabs ' + JSON.stringify(row.activeTabs));
    else if (row.activeTabs[0] !== 'lineage') fails.push('tab is ' + row.activeTabs[0] + ', expected lineage (opened from ' + row.from + ')');
  }
  return fails;
}

async function withChrome(handler, body) {
  if (!fs.existsSync(CHROME)) throw new Error('chrome missing at ' + CHROME);
  const probe = http.createServer();
  const port = await new Promise((resolve) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => resolve(p)); }));
  const debugProbe = http.createServer();
  const debug = await new Promise((resolve) => debugProbe.listen(0, '127.0.0.1', () => { const p = debugProbe.address().port; debugProbe.close(() => resolve(p)); }));
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'b63-visual-'));
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
      if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails).slice(0, 400));
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

function selfHtml(dup) {
  const extra = dup ? '<div class="b57-me" style="width:90px;height:90px;border-radius:50%"></div><div class="b57-ban"><b>Fixture Child</b><small>Not recorded</small></div>' : '';
  const label = dup ? '+ Not recor' : 'Not recorded';
  return `<!doctype html><meta name="viewport" content="width=device-width"><style>
  body{margin:0} #tabbar{position:fixed;bottom:0;left:0;right:0;height:56px;display:flex}
  .tab{flex:1} .tab.active{background:gold}
  .badge{width:36px;height:36px;border-radius:50%;background:#e6b325;display:inline-block}
  svg{width:300px;height:160px;overflow:visible}
  </style><body>
  <div id="tabbar"><button class="tab" data-tab-view="breeding">Breeding</button><button class="tab active" data-tab-view="lineage" aria-current="page">Lineage</button></div>
  <div id="breeding-view"><div class="b57" data-b57k="azulejo"><h2 class="b18-h1">Family tree ${dup ? '<span class="badge"></span>' : '<span class="badge"><img class="mz-inline" src="/glyph.png" width="22" height="22" alt=""></span>'}</h2>
  <div class="b57-svgw"><svg class="b57-svg fan" viewBox="0 0 380 206"><text class="t1" data-full="Not recorded" x="8" y="20">${label}</text></svg></div>
  <g class="b57-ctr"></g><div class="b57-ban"><b>Fixture Child · F1</b><small>Fixture Mother With A Long Label</small></div>
  ${extra}
  </div></div></body>`;
}

async function runSelf() {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await withChrome((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/glyph.png') { res.setHeader('Content-Type', 'image/png'); res.end(png); return; }
    const dup = url.searchParams.get('dup') === '1';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(selfHtml(dup));
  }, async ({ port, send, evaluate }) => {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dup=1' });
    await sleep(150);
    const before = await evaluate(MEASURE);
    const beforeFails = judge(before, 4);
    if (!beforeFails.some((line) => line.indexOf('circles') >= 0 || line.indexOf('ribbons') >= 0)) throw new Error('self check expected a duplicate ' + JSON.stringify(beforeFails));
    console.log('PASS self unfixed fails: ' + beforeFails[0]);
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/?dup=0' });
    await sleep(150);
    const after = await evaluate(MEASURE);
    const bad = judge(after, 4).filter((line) => line.indexOf('title') < 0 && line.indexOf('Breeding') < 0 && line.indexOf('Not recorded label is missing') < 0);
    if (after.circles !== 1 || after.ribbons !== 1) throw new Error('self fixed still duplicated ' + JSON.stringify(after));
    if ((after.labels || []).some((label) => label.cut || label.outside)) throw new Error('self label still clipped ' + JSON.stringify(after.labels));
    console.log('PASS self single circle and ribbon, Not recorded inside the screen');
    if (bad.length && bad.some((line) => line.indexOf('truncated') >= 0 || line.indexOf('outside') >= 0)) throw new Error(bad.join('; '));
  });
  console.log('b63 tree visual self-check passed');
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
      ready = await evaluate('!!(window.B57 && window.B49 && window.__b63Boot && window.__b63Boot.ready)');
      if (!ready) await sleep(50);
    }
    if (!ready) throw new Error('app did not boot');
    for (const theme of ['light', 'dark']) {
      await evaluate('setThemePref(' + JSON.stringify(theme) + ')');
      await sleep(50);
      for (const [w, h] of WIDTHS) {
        await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
        for (let style = 1; style <= 8; style++) {
          await evaluate('(() => { switchView("breeding"); B49.openPage({ type: "b49tree", key: "pl:p-nophoto", forceStyle: ' + style + ' }); return true; })()');
          await sleep(420);
          const row = await evaluate(MEASURE);
          /* both fixture parents have no recorded parents: one empty grandparent slot per parent side */
          if (row) row.expectEmpty = 2;
          const bad = judge(row, style);
          if (bad.length) fails.push(theme + ' ' + w + 'x' + h + ' style ' + style + ' ' + (row && row.k) + ' ' + bad.join('; '));
          else console.log('PASS visual ' + theme + ' ' + row.k + ' ' + w + 'x' + h);
          if (style === 2) {
            for (const from of ['lineage', 'breeding']) {
              const open = from === 'lineage'
                ? '(() => { document.querySelector("#tabbar [data-tab-view=\\"lineage\\"]").click(); B49.openPage({ type: "b49tree", key: "pl:p-nophoto", forceStyle: 2, fromLin: true }); return true; })()'
                : '(() => { switchView("breeding"); B18.brPage = null; renderBreeding(); B49.openPage({ type: "b49tree", key: "pl:p-nophoto", forceStyle: 2 }); return true; })()';
              await evaluate(open);
              await sleep(420);
              const tr = await evaluate(MEASURE);
              const tb = tr ? [] : ['tree did not render'];
              if (tr && (tr.activeTabs || []).length !== 1) tb.push('active tabs ' + JSON.stringify(tr.activeTabs));
              else if (tr && tr.activeTabs[0] !== 'lineage') tb.push('tab is ' + tr.activeTabs[0] + ', expected lineage (opened from ' + from + ')');
              if (tb.length) fails.push(theme + ' ' + w + 'x' + h + ' tab from ' + from + ' ' + tb.join('; '));
              else console.log('PASS tab ' + theme + ' ' + w + 'x' + h + ' from ' + from);
            }
          }
        }
      }
    }
  });
  if (fails.length) { console.error(fails.join('\n')); process.exit(1); }
  console.log('b63 tree visual: one circle, one ribbon, labels inside, Breeding tab');
}

(async () => {
  if (process.argv.includes('--self')) await runSelf();
  else await runApp();
})().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
