/* Build 60 (Elio, Nov 3 2026): full both-sides family tree (mockups/2026-11-03_full-tree/optFull), all 8 styles.
   Left column: this plant's line (its parents, grandparents, ... one row per generation, up to 12 back, rows scroll sideways).
   Right column: the bred-with partner's line, traced up the same way. Both columns meet at the b59 × badge; bracket to Kids.
   Missing parents: one 'Not recorded · Parents of X' slot (opens the add-parent picker). Landrace plants: an Origin card
   ('Landrace · <country>' + region) with a 'Wild ancestors · Not traceable' slot above it (opens the picker).
   Every card opens that plant's profile by id (outside Edit mode). Profile: editable Origin region / country. */
(function () {
  'use strict';
  if (!window.B57 || !window.B49) return;
  const esc = (s) => escapeHtml(String(s == null ? '' : s));
  const B = window.B57; const MAX = 12;
  const COUNTRY = [[/afghan/i, 'Afghanistan'], [/\bthai/i, 'Thailand'], [/colombi/i, 'Colombia'], [/mexic/i, 'Mexico'], [/jamaic/i, 'Jamaica'], [/nepal/i, 'Nepal'], [/pakistan/i, 'Pakistan'], [/hindu ?kush/i, 'Afghanistan / Pakistan'], [/malawi/i, 'Malawi'], [/durban|south africa/i, 'South Africa'], [/lebanes/i, 'Lebanon'], [/morocc/i, 'Morocco'], [/puerto ?ric|borinquen|boric?u?a/i, 'Puerto Rico']];
  const gen = (k) => { try { return B49.gen(k); } catch (e) { return ''; } };
  const real = (k) => !!k && !B.isUnk(k) && !!B.rec(k);
  function shownOrigin(k) {
    const r = B.rec(k) || {};
    const over = window.B63 && typeof B63.originView === 'function' ? B63.originView(r) : null;
    return {
      originRegion: (over && over.originRegion) || r.originRegion || '',
      originCountry: (over && over.originCountry) || r.originCountry || '',
      landrace: over ? !!over.landrace : !!(r.landrace || r.originRegion || r.originCountry),
    };
  }
  function isLand(k) { const r = B.rec(k); if (!r) return false; const o = shownOrigin(k); return !!(o.landrace || o.originRegion || o.originCountry) && !B.par2(k); }
  function country(k) { const r = B.rec(k) || {}; if (r.originCountry) return { c: r.originCountry, inferred: false }; const n = B.name(k); const m = COUNTRY.find(([re]) => re.test(n)); return m ? { c: m[1], inferred: true } : { c: '', inferred: false }; }
  const RL = (g) => (g === 1 ? 'Parents' : g === 2 ? 'Grandparents' : g === 3 ? 'Great-grandparents' : `${g - 2}× great-grandparents${g >= 6 ? ' · F6+ back' : ''}`);
  /* line(root) -> rows[g] (g = 1 parents ...), each a list of cells */
  function line(root) {
    const rows = []; const seen = new Set([root]); let cur = [{ k: root, t: 'plant' }];
    for (let g = 1; g <= MAX && cur.length; g++) {
      const next = [];
      cur.forEach((x) => { if (x.t !== 'plant') return;
        if (!real(x.k)) { next.push({ t: 'none', of: x.k }); return; }
        if (isLand(x.k)) { next.push({ t: 'origin', k: x.k }); return; }
        const p = B.par2(x.k); if (!p || (!p[0] && !p[1])) { next.push({ t: 'none', of: x.k }); return; }
        p.forEach((q, i) => { const side = i ? 'f' : 'm';
          if (!q) next.push({ t: 'none1', of: x.k, side }); else if (B.isUnk(q)) next.push({ t: 'unk', of: x.k, side, k: q });
          else if (seen.has(q)) next.push({ t: 'ref', k: q, of: x.k, side }); else { seen.add(q); next.push({ t: 'plant', k: q, of: x.k, side }); } }); });
      cur.forEach((x) => { if (x.t === 'origin') next.push({ t: 'wild', of: x.k }); });
      if (!next.length) break; rows.push(next); cur = next.filter((x) => x.t === 'plant' || x.t === 'origin');
    }
    return rows;
  }
  const SIDE = { m: 'Mother', f: 'Father' };
  function cell(x) {
    if (x.t === 'none' || x.t === 'none1') return `<button type="button" class="b60-c slot" data-b58="add" data-b60t="none" data-up="${esc(x.of)}" data-of="${esc(x.of)}" data-side="${x.side || 'm'}"><b>Not recorded</b><small>${x.t === 'none' ? `Parents of ${esc(B.name(x.of))}` : `${SIDE[x.side]} of ${esc(B.name(x.of))}`}</small></button>`;
    if (x.t === 'wild') return `<button type="button" class="b60-c slot wild" data-b58="add" data-b60t="wild" data-up="origin:${esc(x.of)}" data-of="${esc(x.of)}" data-side="m"><b>Wild ancestors</b><small>Not traceable · landrace</small></button>`;
    if (x.t === 'unk') return `<button type="button" class="b60-c slot" data-b58="add" data-b60t="unk" data-up="${esc(x.of)}" data-of="${esc(x.of)}" data-side="${x.side}"><b>Unknown</b><small>${SIDE[x.side]} of ${esc(B.name(x.of))} · open pollination</small></button>`;
    if (x.t === 'origin') { const c = country(x.k); const o = shownOrigin(x.k); const ini = (c.c || o.originCountry || 'LR').replace(/[^A-Za-z ]/g, '').slice(0, 2).toUpperCase();
      return `<button type="button" class="b60-c origin" data-b60="open" data-b60t="origin" data-node="origin:${esc(x.k)}" data-up="${esc(x.k)}" data-k="${esc(x.k)}" aria-label="Origin of ${esc(B.name(x.k))}, open profile"><span class="b57-ph mono" aria-hidden="true">${esc(ini)}</span><b>Landrace${(o.originCountry || c.c) ? ` · ${esc(o.originCountry || c.c)}` : ''}</b><small>${esc(o.originRegion || 'Region not recorded')}</small><em class="b57-tag bought">Origin</em></button>`; }
    const st = B.stat(x.k); const tag = st.t === 'bought' ? `<em class="b57-tag bought">${esc(window.B58 && B58.boughtBadge ? B58.boughtBadge(st.br) : 'Bought')}</em>` : st.t === 'culled' ? '<em class="b57-tag cull">Culled</em>' : st.t === 'archived' ? '<em class="b57-tag arch">Archived</em>' : st.t === 'retired' ? '<em class="b57-tag ret">Retired</em>' : st.t === 'removed' ? '<em class="b57-tag gone">Deleted plant</em>' : st.t === 'nameonly' ? '<em class="b57-tag nameonly">Name only</em>' : x.t === 'ref' ? '<em class="b57-tag ref">↺ also above</em>' : '';
    return `<button type="button" class="b60-c${st.t ? ' st-' + st.t : ''}" data-b57="sel" data-b60t="plant" data-node="${esc(x.k)}" data-up="${esc(x.of)}" data-k="${esc(x.k)}" data-of="${esc(x.of)}" data-side="${x.side}">${B.ph(x.k)}<b>${esc(B.name(x.k))}</b><small>${SIDE[x.side]}${gen(x.k) ? ' · ' + esc(gen(x.k)) : ''}${st.l ? ' · ' + esc(st.l) : ''}</small>${tag}</button>`;
  }
  function rows(k, g, up) {
    if (!g || g.self) return '';
    const parents = String(k).startsWith('pr:') ? B.par2(k) : null;
    const splitParents = !!(parents && (parents[0] || parents[1]));
    const L = splitParents ? (parents[0] ? line(parents[0]) : []) : line(k);
    const R = splitParents ? (parents[1] ? line(parents[1]) : []) : (g.key === '?' ? [[{ t: 'unk', of: k, side: g.side === 'Father' ? 'f' : 'm' }]] : line(g.key));
    const n = Math.max(L.length, R.length); if (!n) return '';
    const meLine = splitParents ? "Mother's line" : (g.side === 'Father' ? "Mother's line" : "Father's line");
    const ptLine = splitParents ? "Father's line" : (g.side === 'Father' ? "Father's line" : "Mother's line");
    const order = [...Array(n).keys()].map((i) => i + 1); if (!up) order.reverse();
    const col = (rw, sd) => `<div class="b60-col ${sd}">${(rw || []).map(cell).join('') || '<span class="b60-gap" aria-hidden="true"></span>'}</div>`;
    const body = order.map((gi) => `<div class="b60-gen" data-gen="${gi}"><div class="b57-lab">${esc(RL(gi))}</div><div class="b60-cols">${col(L[gi - 1], 'l')}${col(R[gi - 1], 'r')}</div></div>`).join('');
    return `<div class="b60-full${up ? ' up' : ''}" data-depth="${n}">${!up && n > 2 ? '<p class="b60-hint">▲ Scroll up for older generations</p>' : ''}<div class="b60-heads"><span>${meLine}</span><span>${ptLine}</span></div>${body}</div>`;
  }
  /* ---------- tap a card -> that plant's profile, by id ---------- */
  function openProfile(k) {
    k = B.resolveKey ? B.resolveKey(k) : k; const [t, ...r] = String(k).split(':'); const id = r.join(':'); if (/^(tx|dx)$/.test(t) && !B.isUnk(k)) return stub(k); if (!B.rec(k)) return false;
    try { if (typeof B58 !== 'undefined' && B58.close) B58.close(); } catch (e) { /* */ }
    if (t === 'pl') openPlantDetail(id, 'plants'); else if (t === 'bp') openPlantDetail(id, 'breedingPlants'); else if (t === 'mf') openPlantDetail(id, 'mf');
    else if (t === 'pr') { switchView('breeding'); b18BrGo({ type: 'project', id }); } else return false;
    window.scrollTo(0, 0); return true;
  }
  document.addEventListener('click', (e) => {
    const pg = B18.brPage; if (!pg || pg.type !== 'b49tree' || typeof activeView === 'undefined' || activeView !== 'breeding' || pg.edit) return;
    const c = e.target.closest('#breeding-view .b57 [data-b60="open"][data-k], #breeding-view .b57 [data-b57="sel"][data-k]'); if (!c) return; if (lp.fired) { lp.fired = false; e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (openProfile(c.dataset.k)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  /* b60.1: long-press any tree card = walk up this line (was: tap to select, then 'Walk up this line') */
  const lp = { t: 0, x: 0, y: 0, fired: false };
  document.addEventListener('pointerdown', (e) => { const c = e.target.closest('#breeding-view .b57 [data-b57="sel"][data-k], #breeding-view .b57 [data-b60="open"][data-k]'); clearTimeout(lp.t); lp.fired = false; if (!c) return; const pg = B18.brPage; if (!pg || pg.type !== 'b49tree' || pg.edit) return;
    lp.x = e.clientX; lp.y = e.clientY; lp.t = setTimeout(() => { lp.fired = true; setTimeout(() => { lp.fired = false; }, 700); const k = c.dataset.k; if (B.par2(k) && k !== pg.key && B.walk) B.walk(k); else lp.fired = false; }, 550); }, true);
  ['pointerup', 'pointercancel'].forEach((ev) => document.addEventListener(ev, () => clearTimeout(lp.t), true));
  document.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10) clearTimeout(lp.t); }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('#breeding-view .b57 [data-k]')) e.preventDefault(); }, true);
  /* ---------- read-only profile stub for a typed name with no record (bought genetics) or a recorded deletion ---------- */
  function breederOf(n) { const L = String(n || '').trim().toLowerCase(); let br = '';
    (state.breedingProjects || []).forEach((p) => { ['mother', 'father'].forEach((sd) => { if (!br && String(p[sd] || '').trim().toLowerCase() === L) br = p[sd + 'Breeder'] || p[sd + 'Source'] || ''; }); });
    [state.plants, state.breedingPlants, state.motherFatherPlants].forEach((a) => (a || []).forEach((r) => { const t = r.b60TxBreeders; if (!br && t && t[n]) br = t[n]; }));
    const m = /\(([^)]+)\)\s*$/.exec(String(n)); return br || (m ? m[1] : ''); }
  function stub(k) { const del = String(k).startsWith('dx:'); const n = String(k).slice(3); document.querySelectorAll('.b60-stub').forEach((x) => x.remove());
    const kids = (B49.children(k) || []).map((c) => B.name(c)).filter(Boolean); const br = breederOf(n);
    const d = document.createElement('div'); d.className = 'b58-sheet b60-stub'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', `${n} profile`); d.dataset.k = k;
    const kind = del ? (B.stat(k).t === 'removed' ? 'Deleted plant · the name is kept on the tree' : 'Name only · not linked to a plant record') : 'Bought genetics · from another breeder';
    d.innerHTML = `<div class="b58-back" data-b60="stub-close"></div><div class="b58-card"><div class="b58-h"><b>${esc(n)}</b><button type="button" class="b58-close" data-b60="stub-close" aria-label="Close">×</button></div><p class="m-s">${kind} · read-only (no plant record in the app)</p><dl class="b58-info"><dt>Name</dt><dd>${esc(n)}</dd><dt>Breeder</dt><dd>${esc(br || 'Not recorded')}</dd><dt>Lineage</dt><dd>Parents not recorded</dd>${kids.length ? `<dt>Parent of</dt><dd>${kids.map(esc).join('<br>')}</dd>` : ''}</dl><div class="b58-acts"><button type="button" class="b58-btn" data-b60="stub-close">Close</button></div></div>`;
    document.body.appendChild(d); return true; }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-b60="stub-close"]'); if (!b) return; e.preventDefault(); e.stopPropagation(); document.querySelectorAll('.b60-stub').forEach((x) => x.remove()); }, true);
  /* ---------- connector lines (SVG overlay per tree): each card to the plant it is a parent of ---------- */
  const xs0 = (R, cx) => R.map((r) => Math.round(cx(r)));
  function draw() {
    document.querySelectorAll('#breeding-view .b59-fam').forEach((fam) => { if (!fam.querySelector('.b60-full')) return; let svg = fam.querySelector(':scope > svg.b60-lines');
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'b60-lines'); svg.setAttribute('aria-hidden', 'true'); fam.prepend(svg); }
      const F = fam.getBoundingClientRect(); const z = Number((document.querySelector('.b57-canvas') || {}).style && document.querySelector('.b57-canvas').style.zoom) || 1;
      svg.setAttribute('width', F.width / z); svg.setAttribute('height', F.height / z); svg.setAttribute('viewBox', `0 0 ${F.width} ${F.height}`);
      const groups = new Map(); fam.querySelectorAll('[data-up]').forEach((c) => { const u = c.dataset.up; if (!groups.has(u)) groups.set(u, []); groups.get(u).push(c); });
      let d = ''; const links = [];
      groups.forEach((cells, up) => { const t = [...fam.querySelectorAll('[data-node]')].find((n) => n.dataset.node === up && !cells.includes(n)); if (!t) return; const T = t.getBoundingClientRect();
        const col = cells[0].closest('.b60-col'); const C = col ? col.getBoundingClientRect() : F; const cx = (r) => Math.max(C.left + 6, Math.min(C.right - 6, r.left + r.width / 2)) - F.left;
        const R = cells.map((c) => c.getBoundingClientRect()); const below = R[0].top > T.bottom; const tx = T.left + T.width / 2 - F.left;
        const py = below ? Math.min(...R.map((r) => r.top)) - F.top : Math.max(...R.map((r) => r.bottom)) - F.top; const ty = below ? T.bottom - F.top : T.top - F.top; const my = (py + ty) / 2;
        links.push([up, cells.length, Math.round(tx), Math.round(ty), xs0(R, cx)]);
        const xs = R.map(cx);
        const kind = ((fam.closest('.b57') || {}).getAttribute && fam.closest('.b57').getAttribute('data-b57k')) || '';
        if (kind === 'ceiba' || kind === 'roots' || kind === 'river') {
          R.forEach((r, i) => { const y1 = (below ? r.top : r.bottom) - F.top; d += `M${xs[i]} ${y1}C${xs[i]} ${my} ${tx} ${my} ${tx} ${ty}`; });
        } else {
          R.forEach((r, i) => { d += `M${xs[i]} ${(below ? r.top : r.bottom) - F.top}V${my}`; });
          const lo = Math.min(...xs, tx), hi = Math.max(...xs, tx); if (hi - lo > 0.5) d += `M${lo} ${my}H${hi}`; d += `M${tx} ${my}V${ty}`;
        } });
      let path = svg.querySelector('path'); if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); svg.appendChild(path); } path.setAttribute('d', d); fam.dataset.b60links = JSON.stringify(links); });
  }
  function drawStack() {
    document.querySelectorAll('#breeding-view .b57-canvas').forEach((canvas) => {
      const kind = ((canvas.closest('.b57') || {}).getAttribute && canvas.closest('.b57').getAttribute('data-b57k')) || '';
      const curved = kind === 'ceiba' || kind === 'roots' || kind === 'river';
      const cards = curved ? [...canvas.querySelectorAll('.b57-row [data-of]')].filter((el) => !el.closest('.b59-fam')) : [];
      let svg = canvas.querySelector(':scope > svg.b60-lines');
      if (!cards.length) { if (svg) svg.remove(); return; }
      if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'b60-lines'); svg.setAttribute('aria-hidden', 'true'); canvas.prepend(svg); }
      const F = canvas.getBoundingClientRect(); const z = Number(canvas.style && canvas.style.zoom) || 1;
      svg.setAttribute('width', F.width / z); svg.setAttribute('height', F.height / z); svg.setAttribute('viewBox', `0 0 ${F.width} ${F.height}`);
      const groups = new Map();
      cards.forEach((c) => { const u = c.dataset.of; if (!u) return; if (!groups.has(u)) groups.set(u, []); groups.get(u).push(c); });
      let d = ''; let arc = '';
      const tops = [];
      groups.forEach((cells, up) => {
        const t = [...canvas.querySelectorAll('[data-node], [data-k]')].find((n) => !cells.includes(n) && !n.closest('.b59-fam') && (n.dataset.node === up || n.dataset.k === up));
        if (!t) return;
        const T = t.getBoundingClientRect(); const R = cells.map((c) => c.getBoundingClientRect());
        const cx = (r) => r.left + r.width / 2 - F.left; const below = R[0].top > T.bottom; const tx = cx(T);
        const ty = below ? T.bottom - F.top : T.top - F.top;
        R.forEach((r) => {
          const x1 = cx(r); const y1 = (below ? r.top : r.bottom) - F.top; const my = (y1 + ty) / 2;
          d += `M${x1} ${y1}C${x1} ${my} ${tx} ${my} ${tx} ${ty}`;
          tops.push(r);
        });
      });
      if (kind === 'ceiba' && tops.length) {
        const left = Math.min(...tops.map((r) => r.left)) - F.left; const right = Math.max(...tops.map((r) => r.right)) - F.left;
        const y = Math.min(...tops.map((r) => r.top)) - F.top - 10; const rx = Math.max(12, (right - left) / 2);
        arc = `M${left} ${y}A${rx} 16 0 0 1 ${right} ${y}`;
      }
      let path = svg.querySelector('path.branch'); if (!path) { path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('class', 'branch'); svg.appendChild(path); } path.setAttribute('d', d);
      let arcPath = svg.querySelector('path.arc');
      if (arc) { if (!arcPath) { arcPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); arcPath.setAttribute('class', 'arc'); svg.appendChild(arcPath); } arcPath.setAttribute('d', arc); }
      else if (arcPath) arcPath.remove();
    });
  }
  let dq = 0; const redraw = () => { cancelAnimationFrame(dq); dq = requestAnimationFrame(() => { try { draw(); drawStack(); } catch (e) { console.warn('b60 lines', e); } }); };
  const bv = document.getElementById('breeding-view'); if (bv) new MutationObserver((m) => { if (m.some((x) => [...x.addedNodes].some((n) => n.nodeType === 1 && !(n.matches && n.matches('svg.b60-lines, path'))))) redraw(); }).observe(bv, { childList: true, subtree: true });
  document.addEventListener('scroll', (e) => { if (e.target && e.target.closest && e.target.closest('.b60-col, .b57-scroll')) redraw(); }, true); window.addEventListener('resize', redraw); document.addEventListener('click', () => setTimeout(redraw, 50));
  setInterval(redraw, 1000);
  /* ---------- Origin region on the profile (editable) ---------- */
  function key() { return B.detailKey ? B.detailKey() : ''; }
  function originRow() {
    const v = document.querySelector('#plant-detail-view.active'); if (!v) return; const k = key(); const r = B.rec(k); const old = v.querySelector('.b60-orig');
    if (old && old.dataset.k === k && old.dataset.v === JSON.stringify([r && r.originRegion, r && r.originCountry])) return; if (old) old.remove(); if (!r) return;
    const c = country(k); const at = v.querySelector('.b57-ftbtn') || v.querySelector('.pd-quick'); if (!at) return;
    at.insertAdjacentHTML('afterend', `<button type="button" class="m-card b60-orig" data-b60="origin-edit" data-k="${esc(k)}" data-v="${esc(JSON.stringify([r.originRegion, r.originCountry]))}"><span class="b58-stl">Origin region</span><b>${esc(r.originRegion || 'Not set')}</b><small>${c.c ? `${esc(c.c)}${c.inferred ? ' (from the name)' : ''} · ` : ''}tap to edit</small></button>`);
  }
  function originSheet(k) { const r = B.rec(k); if (!r) return; document.querySelectorAll('.b60-sheet').forEach((e) => e.remove());
    const d = document.createElement('div'); d.className = 'b58-sheet b60-sheet'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Origin region');
    d.innerHTML = `<div class="b58-back" data-b60="origin-close"></div><div class="b58-card"><div class="b58-h"><b>Origin · ${esc(B.name(k))}</b><button type="button" class="b58-close" data-b60="origin-close" aria-label="Close">×</button></div><label class="b58-l">Region / district<input class="b60-or" type="text" value="${esc(r.originRegion || '')}" placeholder="e.g. Arghandab District, Kandahar" /></label><label class="b58-l">Country (optional)<input class="b60-oc" type="text" value="${esc(r.originCountry || '')}" placeholder="${esc(country(k).c || 'e.g. Afghanistan')}" /></label><label class="b58-l"><input class="b60-ol" type="checkbox"${r.landrace ? ' checked' : ''} /> Landrace (wild ancestors not traceable)</label><div class="b58-acts"><button type="button" class="b58-btn pri" data-b60="origin-save" data-k="${esc(k)}">Save</button><button type="button" class="b58-btn" data-b60="origin-close">Cancel</button></div></div>`;
    document.body.appendChild(d); }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-b60^="origin"]'); if (!b) return; e.preventDefault(); e.stopPropagation(); const a = b.dataset.b60;
    if (a === 'origin-edit') return originSheet(b.dataset.k);
    if (a === 'origin-close') return document.querySelectorAll('.b60-sheet').forEach((x) => x.remove());
    if (a === 'origin-save') { const r = B.rec(b.dataset.k); const d = b.closest('.b60-sheet'); if (r && d) { r.originRegion = d.querySelector('.b60-or').value.trim(); r.originCountry = d.querySelector('.b60-oc').value.trim(); r.landrace = d.querySelector('.b60-ol').checked; r.b60EditedAt = new Date().toISOString(); saveState(); } d && d.remove(); originRow(); }
  }, true);
  /* ---------- migration: Elio's afghan landrace origin (only when nothing is recorded; idempotent, synced, logged) ---------- */
  function migrate() { let n = 0; const log = [];
    [['mf', state.motherFatherPlants], ['bp', state.breedingPlants], ['pl', state.plants]].forEach(([t, a]) => (a || []).forEach((r) => { if (!r || r.b60Mig === 1) return; r.b60Mig = 1;
      if (/^afghan land ?race$/i.test(String(r.name || '').trim()) && !r.originRegion) { r.originRegion = 'Arghandab District, Kandahar'; r.landrace = true; log.push(`${r.name}: origin region set to Arghandab District, Kandahar (country not recorded; shown as Afghanistan from the name)`); n++; } }));
    try { const old = JSON.parse(localStorage.getItem('b60-migration-log') || '[]'); localStorage.setItem('b60-migration-log', JSON.stringify([...old, ...log.map((m) => `${new Date().toISOString()} ${m}`)].slice(-400))); } catch (e) { /* */ }
    return n; }
  try { if (migrate()) saveState(); } catch (e) { console.warn('b60 migrate', e); }
  setInterval(() => { try { originRow(); } catch (e) { /* */ } }, 300);
  window.B60 = { draw, stub, rows, line, isLand, country, openProfile, migrate, originSheet };
})();
