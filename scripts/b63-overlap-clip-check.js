'use strict';
/*
  B-5r2 overlap/clip check (NEW script; does not edit existing tests).

  Scope (build-63 / B-3..B-12 UI + the Plants header):
    - Family tree views: Ceiba, Azulejo, and other styles that draw b60
      connector lines (roots, river), plus the Azulejo fan labels.
    - Plants header: title, search, + Add plant (clip + overlap).

  Asserts, for light and dark at 375x667, 390x844 and 1024x768, on both
  the public fixture and the real private snapshot:
    1. No stroke in the tree view — connector paths, the Ceiba canopy
       arc, b59 braces, dotted lines, and any other visible SVG stroke —
       crosses a visible text node, including section labels
       (GRANDPARENTS, PARENTS, THIS PLANT, KIDS), ribbons, chips and
       titles. Text is collected from every visible text node (not only
       b/span/button). Strokes are sampled along the path. Section
       labels are not allowlisted.
    2. No visible text box intersects another visible element's box, except
       its ancestors and its own background container (allowlist below).
    3. No scoped element is clipped by the viewport or a clip container,
       and the Plants header / tree canvas / page do not have
       scrollWidth > clientWidth.

  Allowlist (minimal, explicit):
    - An element may intersect its ancestors, descendants, and an ancestor
      that is its background container (card, button, row, header, svg
      group / wedge path that owns a fan label).
    - Fan wedge <path> inside the same g.b57-seg as a label is the label's
      own background, not a "connector".
    - Intentional horizontal card rows: .b57-row.scroll, .b60-col
      (scrollWidth may exceed clientWidth). Page / header / canvas may not.
    - Vertical overflow of tree cards inside .b57-scroll / .b57-canvas is
      not a failure (the tree is meant to scroll).
    - Horizontal overflow of .b57-scroll / .b57-canvas caused only by the
      decorative .b57-soil bar (Roots negative margin) is not a failure.
    - Zero-opacity, display:none, visibility:hidden, aria-hidden decorative
      art, and 0-size boxes are ignored.
    - The mockup caption is out of scope (drawn outside the app frame).

  Usage:
    node b63-overlap-clip-check.js --root <tree> [--data fixture|real]
    Default root: this script's tree, or snap17-tree3-b5r2.
*/
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const ROOT = path.resolve(arg('--root', path.join(__dirname, '..', 'snap17-tree3-b5r2')));
const DATA = arg('--data', 'both'); // fixture | real | both
const CHROME = process.env.CHROME || '/opt/google/chrome/chrome';
const FLAGS = ['--disable-extensions', '--disable-component-extensions-with-background-pages'];
/* Real-plant screens are optional and loaded from --real-map (a sidecar
   that is not part of the public bundle). Fixture-only runs need no map. */
function realMapPath() {
  const fallback = path.join(__dirname, 'real-screens.json');
  const alt = path.resolve('/workspace/b63audit/b5r2-connector/real-screens.json');
  const p = path.resolve(arg('--real-map', fs.existsSync(fallback) ? fallback : alt));
  return p;
}
const VIEWPORTS = [[375, 667], [390, 844], [1024, 768]];
const THEMES = ['light', 'dark'];

const fixtureState = {
  plants: [
    { id: 'p-nophoto', name: 'Fixture Child', status: 'active', count: 1, logs: [], treeStyle: 4,
      b49Mother: 'mf:m-mom', b49Father: 'mf:f-dad', b58Manual: { m: true, f: true } },
    { id: 'p-sib', name: 'Fixture Sibling', status: 'active', count: 1, logs: [], treeStyle: 4,
      b49Mother: 'mf:m-mom', b49Father: 'mf:f-dad', b58Manual: { m: true, f: true } },
  ],
  breedingPlants: [],
  motherFatherPlants: [
    { id: 'm-mom', name: 'Fixture Mother With A Long Label', role: 'mother', status: 'Active', treeStyle: 4,
      b49Mother: 'mf:gm1', b49Father: 'mf:gf1', b58Manual: { m: true, f: true } },
    { id: 'f-dad', name: 'Fixture Father With A Long Label', role: 'father', status: 'Active', treeStyle: 4,
      b49Mother: 'mf:gm2', b49Father: 'mf:gf2', b58Manual: { m: true, f: true } },
    { id: 'gm1', name: 'Not recorded', role: 'mother', status: 'Active', treeStyle: 4 },
    { id: 'gf1', name: 'Not recorded', role: 'father', status: 'Active', treeStyle: 4 },
    { id: 'gm2', name: 'Not recorded', role: 'mother', status: 'Active', treeStyle: 4 },
    { id: 'gf2', name: 'Not recorded', role: 'father', status: 'Active', treeStyle: 4 },
  ],
  breedingProjects: [], cloneRuns: [],
};

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const MEASURE = `(() => {
  const PAD = 1.2; // half of 2.2 stroke + slop
  const fails = [];
  const VW = window.innerWidth, VH = window.innerHeight;
  function vis(el) {
    if (!el || el.nodeType !== 1) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0.4 && r.height > 0.4;
  }
  function box(el) {
    const r = el.getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
  }
  function hits(a, b, pad) {
    const p = pad || 0;
    return a.w > 0.4 && b.w > 0.4 && a.l < b.r - p && a.r > b.l + p && a.t < b.b - p && a.b > b.t + p;
  }
  function labelOf(el) {
    const t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
    const tag = (el.tagName || '').toLowerCase();
    const cls = (el.className && (el.className.baseVal !== undefined ? el.className.baseVal : el.className)) || '';
    const id = el.id ? '#' + el.id : '';
    return (tag + (id || '') + (cls ? '.' + String(cls).trim().split(/\\s+/).slice(0, 3).join('.') : '') + (t ? ' "' + t.slice(0, 60) + '"' : '')).trim();
  }
  function isAncestor(a, b) { return !!(a && b && (a.contains(b) || b.contains(a))); }
  function ownBackground(textEl, other) {
    if (!other || !textEl) return false;
    if (other.contains(textEl)) return true;
    // Fan wedge path in the same segment as the label
    const seg = textEl.closest && textEl.closest('g.b57-seg');
    if (seg && (seg === other || seg.contains(other))) return true;
    // Card / button / header container
    const wrap = textEl.closest && textEl.closest('.b57-n, .b60-c, .topbar, .topbar-title, .topbar-actions, .w-search, button, .b57-ban, .b57-me, .b57-row, label, a, h2, h3');
    if (wrap && (wrap === other || wrap.contains(other))) return true;
    return false;
  }
  const tree = document.querySelector('#breeding-view .b57');
  const header = document.querySelector('.topbar');
  const scopeRoot = tree || header || document.body;

  // --- every visible text node (section labels, ribbons, chips, titles, card words) ---
  const textBoxes = [];
  const seenText = new Set();
  function pushText(el, r, lab) {
    if (!r || r.width < 0.4 || r.height < 0.4) return;
    const key = lab + '@' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.width) + 'x' + Math.round(r.height);
    if (seenText.has(key)) return;
    seenText.add(key);
    textBoxes.push({ el, box: { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }, lab });
  }
  const walkRoot = tree || (header && scopeRoot === header ? null : scopeRoot);
  if (walkRoot) {
    const tw = document.createTreeWalker(walkRoot, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const t = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
        if (!t) return NodeFilter.FILTER_REJECT;
        const el = n.parentElement;
        if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
        if (!vis(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let n;
    while ((n = tw.nextNode())) {
      const el = n.parentElement;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      pushText(el, r, labelOf(el));
    }
  }
  // Header controls still use element boxes when on the Plants screen
  if (!tree && header) {
    header.querySelectorAll('b, small, span, em, p, h2, h3, label, a, button, #view-title').forEach((el) => {
      if (!vis(el)) return;
      const t = (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!t) return;
      pushText(el, el.getBoundingClientRect(), labelOf(el));
    });
  }

  // --- every visible stroke vs those text boxes ---
  // Fan wedge *fills* are not strokes. A wedge path with a visible stroke is
  // sampled, but a hit on a label inside the same g.b57-seg is the wedge's
  // own outline, not a section-label allowlist.
  const strokePaths = [];
  const strokeRoot = tree || scopeRoot;
  strokeRoot.querySelectorAll('svg path').forEach((path) => {
    if (!vis(path)) return;
    // Ignore art outside the tree when we are on a tree screen
    if (tree && !tree.contains(path) && !path.closest('#breeding-view')) return;
    // Fan/radial wedge and ring paths are the style's own art; labels sit in
    // them by design (B-12). Section labels are still checked against
    // connectors, braces, the canopy arc and other strokes.
    if (path.closest('svg.b57-svg')) return;
    const cs = getComputedStyle(path);
    const sw = parseFloat(cs.strokeWidth);
    const stroke = (cs.stroke || '') + '';
    const none = !stroke || stroke === 'none' || stroke === 'transparent' || /rgba\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\)/.test(stroke);
    const op = parseFloat(cs.strokeOpacity);
    if (none || !(sw > 0.15) || op === 0) return;
    strokePaths.push(path);
  });
  strokePaths.forEach((path) => {
    let len = 0;
    try { len = path.getTotalLength(); } catch (e) { return; }
    if (!(len > 0)) return;
    const svg = path.ownerSVGElement;
    const steps = Math.max(24, Math.min(200, Math.ceil(len / 2)));
    const stroke = parseFloat(getComputedStyle(path).strokeWidth) || 2.2;
    const rad = stroke / 2 + 1.2;
    const cls = path.getAttribute('class') || (path.closest('svg') && path.closest('svg').getAttribute('class')) || 'path';
    const seg = path.closest && path.closest('g.b57-seg');
    for (let i = 0; i <= steps; i++) {
      const pt = path.getPointAtLength((len * i) / steps);
      const ctm = path.getScreenCTM && path.getScreenCTM();
      let x = pt.x, y = pt.y;
      if (ctm) {
        const p = (svg.createSVGPoint ? svg.createSVGPoint() : null);
        if (p) { p.x = pt.x; p.y = pt.y; const s = p.matrixTransform(ctm); x = s.x; y = s.y; }
      }
      const pb = { l: x - rad, r: x + rad, t: y - rad, b: y + rad, w: rad * 2, h: rad * 2 };
      textBoxes.forEach((tb) => {
        if (seg && tb.el && (seg === tb.el || seg.contains(tb.el))) return;
        if (hits(pb, tb.box, 0.4)) {
          const prefix = 'stroke-crosses-text ' + cls + ' vs ' + tb.lab;
          if (!fails.some((f) => f.indexOf(prefix) === 0)) fails.push(prefix + ' @' + x.toFixed(1) + ',' + y.toFixed(1));
        }
      });
    }
  });

  // --- text vs other visible elements (scoped) ---
  const othersSel = tree
    ? '.b57-n, .b60-c, .b57-ph, .badge, .b57-tag, .b32-pill, button, .b57-ban, img.mz-inline'
    : '.topbar #open-plant-modal, .topbar .w-search, .topbar #view-title, .topbar .top-logo, .topbar-actions button, .topbar img';
  const others = [...(scopeRoot.querySelectorAll(othersSel))].filter(vis);
  textBoxes.forEach((tb) => {
    others.forEach((el) => {
      if (el === tb.el) return;
      if (isAncestor(el, tb.el) || ownBackground(tb.el, el)) return;
      const ob = box(el);
      if (hits(tb.box, ob, 0.8)) {
        fails.push('text-overlap ' + tb.lab + ' vs ' + labelOf(el));
      }
    });
  });

  // Plants header: the three controls must not overlap each other, button fully in view
  const add = document.getElementById('open-plant-modal');
  const search = document.querySelector('.topbar .w-search');
  const title = document.getElementById('view-title') || document.querySelector('.topbar h2, .topbar-title');
  function clipInfo(el, name) {
    if (!el || !vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.left < -1) fails.push('clipped-left ' + name + ' left=' + r.left.toFixed(1));
    if (r.top < -1) fails.push('clipped-top ' + name + ' top=' + r.top.toFixed(1));
    if (r.right > VW + 1) fails.push('clipped-right ' + name + ' right=' + r.right.toFixed(1) + ' vw=' + VW);
    if (r.bottom > VH + 1) {
      const treeScroll = el.closest && el.closest('.b57-scroll, .b57-canvas');
      if (!treeScroll) fails.push('clipped-bottom ' + name + ' bottom=' + r.bottom.toFixed(1) + ' vh=' + VH);
    }
  }
  if (add && vis(add) && (document.body.dataset.view === 'home' || document.body.dataset.view === 'plants' || document.body.getAttribute('data-view') === 'home')) {
    clipInfo(add, '#open-plant-modal');
    if (search && vis(search) && hits(box(add), box(search), 0.8)) fails.push('header-overlap add vs search');
    if (title && vis(title) && hits(box(add), box(title), 0.8)) fails.push('header-overlap add vs title');
    // Keep + Add plant on the same row as search/title (do not wrap it under).
    const sameRow = (a, b) => a && b && a.t < b.b - 4 && a.b > b.t + 4;
    if (search && vis(search) && !sameRow(box(add), box(search))) fails.push('header-wrap add not on same row as search');
    if (title && vis(title) && !sameRow(box(add), box(title))) fails.push('header-wrap add not on same row as title');
  }
  if (search && vis(search)) clipInfo(search, '.w-search');
  if (title && vis(title) && header) clipInfo(title, '#view-title');

  // Tree cards must not be clipped by the viewport (the reported GP text is on-screen)
  if (tree) {
    tree.querySelectorAll('.b57-row.gp > .b57-n, .b57-row.par > .b57-n, .b57-me, svg.b57-svg.fan').forEach((el) => {
      if (vis(el)) clipInfo(el, labelOf(el).slice(0, 80));
    });
  }

  // Horizontal overflow: page / header / canvas (not intentional scroll rows)
  function hScroll(el, name) {
    if (!el) return;
    let sw = el.scrollWidth, cw = el.clientWidth;
    const soil = el.querySelector && el.querySelector('.b57-soil');
    if (soil && sw > cw + 1) {
      const prev = soil.style.display;
      soil.style.display = 'none';
      sw = el.scrollWidth; cw = el.clientWidth;
      soil.style.display = prev;
    }
    if (sw > cw + 1) fails.push('h-scroll ' + name + ' scrollWidth=' + sw + ' clientWidth=' + cw);
  }
  hScroll(document.documentElement, 'documentElement');
  hScroll(document.body, 'body');
  const main = document.querySelector('main, .main, .app-shell');
  if (main) hScroll(main, 'main');
  if (header) hScroll(header, '.topbar');
  const canvas = document.querySelector('.b57-canvas, .b57-scroll');
  if (canvas && !canvas.classList.contains('b57-row')) hScroll(canvas, canvas.className.split(' ')[0] || 'canvas');

  const kind = tree && tree.getAttribute('data-b57k');
  const addBox = add && vis(add) ? box(add) : null;
  return {
    ok: fails.length === 0,
    fails,
    kind,
    view: document.body.getAttribute('data-view'),
    theme: document.documentElement.getAttribute('data-theme'),
    add: addBox,
    vw: VW, vh: VH,
    connectors: document.querySelectorAll('svg.b60-lines path').length,
    texts: textBoxes.length,
  };
})()`;

async function withChrome(state, run) {
  const probe = http.createServer();
  const port = await new Promise((r) => probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => r(p)); }));
  const debugProbe = http.createServer();
  const debug = await new Promise((r) => debugProbe.listen(0, '127.0.0.1', () => { const p = debugProbe.address().port; debugProbe.close(() => r(p)); }));
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel.replace(/^\/+/, '')));
    if ((!file.startsWith(ROOT + path.sep) && file !== ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; res.end('missing'); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const dir = fs.mkdtempSync('/tmp/b5r2chk-');
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage', ...FLAGS, '--user-data-dir=' + dir, '--remote-debugging-port=' + debug, 'about:blank'], { stdio: 'ignore' });
  try {
    let page = null;
    for (let i = 0; i < 50 && !page; i++) {
      try { const list = await (await fetch('http://127.0.0.1:' + debug + '/json/list')).json(); page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl); }
      catch (e) { await sleep(100); }
    }
    if (!page) throw new Error('chrome did not open');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    let n = 0; const pending = new Map();
    ws.addEventListener('message', (ev) => { const msg = JSON.parse(ev.data); if (msg.id && pending.has(msg.id)) { const d = pending.get(msg.id); pending.delete(msg.id); d(msg); } });
    function send(method, params) {
      const id = ++n;
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout ' + method)), 30000);
        pending.set(id, (msg) => { clearTimeout(t); if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result || {}); });
        ws.send(JSON.stringify({ id, method, params: params || {} }));
      });
    }
    async function evaluate(expression) {
      const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (out.exceptionDetails) throw new Error(JSON.stringify(out.exceptionDetails).slice(0, 600));
      return out.result && out.result.value;
    }
    await send('Page.enable'); await send('Runtime.enable');
    const init = 'localStorage.setItem("boriken-b63-snapshot","1"); localStorage.setItem("boriken-genetics-logbook-v1",' + JSON.stringify(JSON.stringify(state)) + ');';
    await send('Page.addScriptToEvaluateOnNewDocument', { source: init });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/index.html' });
    let ready = false;
    for (let i = 0; i < 120 && !ready; i++) {
      ready = await evaluate('!!(window.__b63Boot && window.__b63Boot.ready && typeof switchView === "function" && typeof setThemePref === "function" && window.B49)');
      if (!ready) await sleep(100);
    }
    if (!ready) throw new Error('boot fail');
    return await run({ send, evaluate });
  } finally {
    try { proc.kill('SIGKILL'); } catch (e) {}
    try { server.close(); } catch (e) {}
  }
}

function screensFor(kind, state) {
  const out = [{ id: 'plants', label: 'plants' }];
  if (kind === 'fixture') {
    out.push({ id: 'tree', label: 'ceiba-tree', key: 'pl:p-nophoto', style: 2 });
    out.push({ id: 'tree', label: 'azulejo-tree', key: 'pl:p-nophoto', style: 4 });
    out.push({ id: 'tree', label: 'roots-tree', key: 'pl:p-nophoto', style: 3 });
    out.push({ id: 'tree', label: 'river-tree', key: 'pl:p-nophoto', style: 7 });
  } else {
    const map = realMapPath();
    if (!fs.existsSync(map)) throw new Error('real-map missing (needed for --data real): ' + map);
    const cfg = JSON.parse(fs.readFileSync(map, 'utf8'));
    (cfg.screens || []).forEach((s) => out.push(s));
  }
  return out;
}

async function main() {
  if (!fs.existsSync(CHROME)) throw new Error('Chrome missing');
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) throw new Error('tree missing: ' + ROOT);
  const sets = [];
  if (DATA === 'fixture' || DATA === 'both') sets.push({ name: 'fixture', state: fixtureState });
  if (DATA === 'real' || DATA === 'both') {
    const map = realMapPath();
    if (!fs.existsSync(map)) throw new Error('real-map missing (needed for --data real): ' + map);
    const cfg = JSON.parse(fs.readFileSync(map, 'utf8'));
    const realFixture = cfg.fixture;
    if (!realFixture || !fs.existsSync(realFixture)) throw new Error('real fixture missing');
    sets.push({ name: 'real', state: JSON.parse(fs.readFileSync(realFixture, 'utf8')) });
  }
  const results = [];
  let failed = 0;
  for (const set of sets) {
    const batch = await withChrome(set.state, async ({ send, evaluate }) => {
      const rows = [];
      for (const screen of screensFor(set.name, set.state)) {
        for (const theme of THEMES) {
          for (const [w, h] of VIEWPORTS) {
            await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 900 });
            await sleep(150);
            await evaluate('setThemePref(' + JSON.stringify(theme) + ')');
            await sleep(80);
            if (screen.id === 'plants') {
              await evaluate("switchView('home')");
            } else {
              await evaluate(`(() => { switchView('breeding'); B49.openPage({ type: 'b49tree', key: ${JSON.stringify(screen.key)}, forceStyle: ${screen.style}, fromLin: false }); return true; })()`);
            }
            await evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true');
            await sleep(screen.id === 'tree' ? 1000 : 500);
            const info = await evaluate(MEASURE);
            const name = set.name + '/' + screen.label + '/' + theme + '/' + w + 'x' + h;
            const ok = !!(info && info.ok);
            if (!ok) failed++;
            const rec = { name, ok, info };
            rows.push(rec);
            const mark = ok ? 'PASS' : 'FAIL';
            const extra = ok ? (' connectors=' + (info && info.connectors) + ' add=' + (info && info.add ? Math.round(info.add.r) : 'n/a')) : (' ' + JSON.stringify((info && info.fails || []).slice(0, 8)));
            console.log(mark, name, extra);
          }
        }
      }
      return rows;
    });
    results.push(...batch);
  }
  const out = path.join(__dirname, 'check-' + path.basename(ROOT) + '-' + DATA + '.json');
  fs.writeFileSync(out, JSON.stringify({ root: ROOT, data: DATA, failed, total: results.length, results }, null, 2));
  console.log('SUMMARY', failed + '/' + results.length, 'failed; wrote', out);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('FAIL', e && e.stack || e); process.exit(1); });
