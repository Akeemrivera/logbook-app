/* Build 57 (Elio, Nov 2 2026 7:58 PM ET): family tree in 8 approved styles (mockups/2026-11-02_family-tree/v6-styles opt-1..4,
   v7-more-styles opt-5..8). Each record (breeding project, seed run, plant, mother/father) gets ONE random tree style the first
   time it is seen (treeStyle 1-8, saved on the record so it travels with sync and backups) and keeps it forever.
   Lineage uses build49's graph (B49.par / children / gen / cloneData, which reads promotedFrom, srcColl/srcId/srcMem, projects).
   Every generation is shown: this plant, parents, grandparents in the style's own layout, then ALL older generations (F6 and
   beyond) in scrollable rows; tap any plant to select it, then "Walk up this line" re-centres the tree on it. Zoom - / +.
   Circles show the plant's real latest grow photo; with no photo a neutral monogram (never a green ball). */
(function () {
  'use strict';
  if (!window.B49 || typeof b18BrPageHtml !== 'function') return;
  const esc = (v) => escapeHtml(String(v == null ? '' : v));
  const low = (s) => String(s || '').trim().toLowerCase();
  const STYLES = [null,
    { n: 'Walnut rings', lay: 'radial', k: 'walnut' }, { n: 'Ceiba tree', lay: 'stack', k: 'ceiba' }, { n: 'Roots & crown', lay: 'crown', k: 'roots' },
    { n: 'Azulejo fan', lay: 'fan', k: 'azulejo' }, { n: 'Hanging mobile', lay: 'stack', k: 'mobile' }, { n: 'Heritage certificate', lay: 'cert', k: 'cert' },
    { n: 'River delta', lay: 'stack', k: 'river' }, { n: 'Church window', lay: 'window', k: 'window' }];
  const N = 8; const ok = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= N;
  const rnd = (n) => { try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; } catch (e) { return Math.floor(Math.random() * n); } };
  const lists = () => [state.breedingProjects, state.plants, state.breedingPlants, state.motherFatherPlants].map((a) => a || []);
  function assign() { let n = 0; lists().forEach((a) => a.forEach((r) => { if (r && typeof r === 'object' && !ok(r.treeStyle)) { r.treeStyle = 1 + rnd(N); n++; } })); return n; }
  const _save = saveState; let busy = false;
  saveState = function () { try { window.__b57inval && __b57inval(); } catch (e) { /* */ } if (!busy) { busy = true; try { assign(); } catch (e) { console.warn('b57', e); } busy = false; } return _save.apply(this, arguments); };
  try { if (assign()) _save(); } catch (e) { console.warn('b57 assign', e); }

  const COLL = { pl: () => state.plants || [], bp: () => state.breedingPlants || [], mf: () => state.motherFatherPlants || [], pr: () => state.breedingProjects || [] };
  function rec(key) { const [t, ...r] = String(key || '').split(':'); const a = COLL[t]; return a ? a().find((x) => x.id === r.join(':')) || null : null; }
  const name = (k) => B49.nameOf(k) || (/^(tx|dx):/.test(String(k)) ? String(k).slice(3) : '');
  const same = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const as = String(a), bs = String(b);
    const ai = as.split(':').slice(1).join(':'), bi = bs.split(':').slice(1).join(':');
    return as.split(':')[0] === bs.split(':')[0] && !!ai && ai === bi;
  };
  function styleOf(key) { const r = rec(key); if (r && !ok(r.treeStyle)) { r.treeStyle = 1 + rnd(N); try { saveState(); } catch (e) { /* */ } } return r ? Number(r.treeStyle) : 1 + (low(name(key)).split('').reduce((s, c) => s + c.charCodeAt(0), 0) % N); }
  function photo(key, d = 0) {
    const r = rec(key); if (!r || d > 3) return '';
    try { const l = typeof latestPhotoLog === 'function' && latestPhotoLog(r); const s = l && photoSrc(l); if (s) return s; } catch (e) { /* */ }
    const pf = r.promotedFrom; if (pf && pf.id) { const t = { plants: 'pl', breedingPlants: 'bp', motherFatherPlants: 'mf' }[pf.coll] || 'pl'; return photo(`${t}:${pf.id}`, d + 1); }
    if (key.startsWith('pr:') && d === 0) { for (const x of runsOf(key)) { const q = photo(`${x.coll === 'plants' ? 'pl' : 'bp'}:${x.r.id}`, d + 1); if (q) return q; } }
    if (key.startsWith('mf:') && d === 0) { const n = low(r.name); for (const [t, a] of [['bp', state.breedingPlants], ['pl', state.plants]]) { const x = (a || []).find((y) => low(y.name) === n); if (x) { const q = photo(`${t}:${x.id}`, d + 1); if (q) return q; } } }
    return '';
  }
  const mono = (k) => { const w = name(k).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : (w[0] || '').slice(1, 2))).toUpperCase(); };
  const ph = (k, big) => { const s = photo(k); return s ? `<span class="b57-ph${big ? ' big' : ''}" style="background-image:url('${esc(s)}')" data-photo="1"></span>` : `<span class="b57-ph mono${big ? ' big' : ''}" aria-hidden="true">${esc(mono(k))}</span>`; };
  const gen = (k) => { try { return B49.gen(k); } catch (e) { return ''; } };
  /* ---------- lineage (b57 cases: S1, unknown / open pollination, cycles, culled / deleted, bought genetics) ---------- */
  const UNK = /^(unknown|\?+|open[ -]?poll\w*|pollen[ -]?chuck|chuck|mixed( pollen)?|op|n\/a|none)$/i;
  const kbn = (n) => B49.keyByName(n);
  function par2(k) {
    let p = null; try { p = B49.par(k); } catch (e) { p = null; }
    const r = rec(k); if (r && r.b58Manual && (r.b58Manual.m || r.b58Manual.f)) return p;
    if (!p && r && k.startsWith('pr:') && typeof b18ProjParent === 'function') { const m = b18ProjParent(r, 'mother'), f = b18ProjParent(r, 'father'); const mk = m.key || (m.name ? kbn(m.name) : ''), fk = f.key || (f.name ? kbn(f.name) : ''); if (mk || fk) p = [mk || 'tx:Unknown', fk || 'tx:Unknown']; }
    if (!p && r && !k.startsWith('mf:')) { const c = String(r.crossLabel || r.cultivar || '').split(/\s+[×x]\s+/); if (c.length === 2 && (c[0].trim() || c[1].trim())) p = [kbn(c[0].replace(/^.*·\s*/, '')) || 'tx:Unknown', kbn(c[1]) || 'tx:Unknown']; }
    return p;
  }
  const isUnk = (k) => !k || (String(k).startsWith('tx:') && (UNK.test(String(k).slice(3).trim()) || !String(k).slice(3).trim()));
  function recordedDeletion(k) {
    const text = String(k || '');
    if (!text.startsWith('dx:')) return false;
    const name = text.slice(3);
    if (!name) return false;
    /* A timestamp on the child is not proof. Only a side entry that still names this parent and keeps the old record key is. */
    return [state.plants, state.breedingPlants, state.motherFatherPlants, state.breedingProjects].some((a) => (a || []).some((r) => {
      const book = r && r.b58DeletedParents;
      if (!book || typeof book !== 'object') return false;
      return ['m', 'f'].some((side) => {
        const entry = book[side];
        return !!(entry && typeof entry === 'object' && entry.key && entry.name === name);
      });
    }));
  }
  function stat(k) {
    if (isUnk(k)) return { t: 'unknown', l: 'Unknown · open pollination / mixed pollen' };
    if (String(k).startsWith('dx:')) return recordedDeletion(k) ? { t: 'removed', l: 'Deleted plant (name kept)' } : { t: 'nameonly', l: 'Name only · not linked' };
    const r = rec(k); if (String(k).startsWith('tx:')) return { t: 'bought', l: 'Bought genetics · From another breeder', br: '' };
    if (!r) return { t: 'removed', l: 'Deleted plant' };
    if (r.deleted) return { t: 'removed', l: 'Deleted plant (name kept)' };
    if (r.boughtGenetics) return { t: 'bought', l: `Bought genetics · ${r.breeder ? r.breeder : 'From another breeder'}`, br: r.breeder || '' };
    if (/^retired$/i.test(String(r.status || ''))) return { t: 'retired', l: 'Retired' };
    if (/cull/i.test(String(r.status || '')) || (r.grade && r.grade.verdict === 'cull')) return { t: 'culled', l: 'Culled · lineage kept' };
    if (r.archived || /^archived$/i.test(String(r.status || ''))) return { t: 'archived', l: 'Archived' };
    if (!par2(k)) { const src = String(r.breeder || r.source || r.seedSource || '').replace(/^Promoted from.*/i, '').trim(); /* b58: mother/father 'Source / notes' is free text; only call it bought when it says so (bought, breeder, seed bank, seeds, genetics) */
      if (src && !/^(seed|clone)$/i.test(src) && (r.breeder || /\b(bought|purchased?|breeder|seed ?bank|seeds|genetics)\b/i.test(src))) { const br = String(r.breeder || '').trim() || src.replace(/^bought\s*(?:·|-|from)?\s*/i, '').trim(); return { t: 'bought', l: `Bought genetics · ${br || 'From another breeder'}`, br }; } }
    return { t: '', l: '' };
  }
  const nm2 = (k) => (isUnk(k) ? 'Unknown' : name(k));
  /* ---------- lineage ---------- */
  function ancestors(root) {
    const lv = [[{ k: root, role: 'This plant' }]]; const seen = [root];
    for (let g = 1; g <= 40; g++) {
      const row = []; lv[g - 1].forEach((x) => { if (!x.k || x.ref || x.self || isUnk(x.k)) return; const p = par2(x.k); if (!p) return;
        const s1 = p[0] && p[1] && same(p[0], p[1]);
        p.forEach((k, i) => { if (k && window.B63 && B63.explicitKey && B63.explicitKey(k)) return; if (s1 && i === 1) { row.push({ k: '', self: 1, via: x.k, side: 'f', role: `Self-pollinated (S1) · same as ${nm2(p[0])}` }); return; }
          if (!k) { row.push({ k: '', none: 1, via: x.k, side: i ? 'f' : 'm', role: `${rl(g, i)} · not recorded` }); return; }
          if (!isUnk(k) && seen.some((q) => same(q, k))) { if (!row.some((y) => y.ref && same(y.k, k))) row.push({ k, ref: 1, via: x.k, side: i ? 'f' : 'm', role: `${rl(g, i)} · appears again (backcross)` }); return; }
          if (!isUnk(k)) seen.push(k); row.push({ k, via: x.k, side: i ? 'f' : 'm', role: rl(g, i) }); }); });
      if (!row.length) break; lv.push(row);
    }
    return lv;
  }
  function rl(g, i) { const w = i ? 'father' : 'mother'; const W = i ? 'Father' : 'Mother'; if (g === 1) return W; if (g === 2) return 'Grand' + w; if (g === 3) return 'Great-grand' + w; return `${g - 2}× great-grand${w}`; }
  function siblings(k) {
    const p = par2(k); if (!p) return [k];
    const out = []; [p[0], p[1]].forEach((pp) => (B49.children(pp) || []).forEach((c) => { const q = B49.par(c); if (q && same(q[0], p[0]) && same(q[1], p[1]) && !out.some((o) => same(o, c))) out.push(c); }));
    if (!out.some((o) => same(o, k))) out.unshift(k); return out;
  }
  function kids(k) {
    /* b59: seed offspring only. Clones stay on the plant profile and in clone runs, never on the tree. */
    const isCl = (c) => { const r = rec(c); return !!(r && ((typeof isClonePlant === 'function' && isClonePlant(r)) || r.source === 'clone')); };
    return (B49.children(k) || []).filter((c) => !isCl(c)).map((c) => { const lr = c.startsWith('pr:') && B49.linkedRuns ? B49.linkedRuns(c) : []; const t = lr.length === 1 && name(lr[0]) ? name(lr[0]) : name(c);
      return { k: c, t, s: `${gen(c)} · ${c.startsWith('pr:') ? 'cross' : 'plant'}` }; });
  }
  const GK = ['vigor', 'structure', 'aroma', 'resin', 'yield', 'pest', 'clone'];
  const avg = (g) => { const v = GK.map((x) => Number(g && g.scores && g.scores[x])).filter((n) => n > 0); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : ''; };
  const VD = { keep: 'Keep', maybe: 'Maybe', cull: 'Cull' };
  function runsOf(k) {
    const r = rec(k); const isRun = (x) => x && plantsRunning(x) > 1 && !(typeof isClonePlant === 'function' && isClonePlant(x));
    if (r && !k.startsWith('pr:') && !k.startsWith('mf:')) return isRun(r) ? [{ coll: k.startsWith('bp:') ? 'breedingPlants' : 'plants', r }] : [];
    if (!k.startsWith('pr:') || !r) return [];
    const p = par2(k); const out = [];
    [['plants', state.plants], ['breedingPlants', state.breedingPlants]].forEach(([c, a]) => (a || []).forEach((x) => { if (!isRun(x)) return; const q = par2(`${c === 'plants' ? 'pl' : 'bp'}:${x.id}`);
      if (x.b49ProjectId === r.id || (p && q && same(p[0], q[0]) && same(p[1], q[1]))) out.push({ coll: c, r: x }); }));
    return out;
  }
  function candidates(k) {
    const out = []; runsOf(k).forEach(({ coll, r }) => { const n = plantsRunning(r); const multi = runsOf(k).length > 1;
      for (let i = 1; i <= n; i++) { const m = (r.members || []).find((x) => String(x.num) === String(i)) || {}; const g = m.grade || null; const a = avg(g); const v = g && VD[g.verdict];
        const cl = (state.cloneRuns || []).filter((c) => c.srcId === r.id && String(c.srcMem || '') === String(i)); const cuts = cl.reduce((t, c) => t + (Number(c.rooted) || 0), 0);
        const keep = m.promotedTo && (state.motherFatherPlants || []).find((x) => x.id === m.promotedTo);
        const bits = [a ? `${a}` : 'not graded', v || '', cl.length ? `${cuts} backup clone${cuts === 1 ? '' : 's'}` : 'no clones yet'].filter(Boolean).join(' · ');
        out.push({ cand: 1, i, k: keep ? `mf:${keep.id}` : '', t: `${multi ? (r.name || '') + ' ' : ''}#${i}${m.pheno ? ' ' + m.pheno : ''}`, s: keep ? `Keeper · ${keep.name} · ${bits}` : bits, keeper: !!keep, cull: g && g.verdict === 'cull', run: r, coll }); } });
    return out;
  }
  const sub = (k, role) => `${esc(role || '')}${gen(k) ? `${role ? ' · ' : ''}${esc(gen(k))}` : ''}`;
  function node(x, cls = '') {
    if (x.none) return pnode(x, cls);
    if (x.self) return `<div class="b57-n ${cls} self"><span class="b57-ph mono" aria-hidden="true">S1</span><b>Self</b><small>${esc(x.role)}</small></div>`;
    if (!x.k || isUnk(x.k)) return x.via ? `<button type="button" class="b57-n ${cls} unk" data-st="unknown" data-b58="add"${ofA(x)}><span class="b57-ph mono" aria-hidden="true">?</span><b>Unknown</b><small>${esc(x.role ? x.role + ' · ' : '')}open pollination / mixed pollen · tap to change</small></button>` : `<div class="b57-n ${cls} unk" data-st="unknown"><span class="b57-ph mono" aria-hidden="true">?</span><b>Unknown</b><small>${esc(x.role ? x.role + ' · ' : '')}open pollination / mixed pollen</small></div>`;
    const st = stat(x.k); const tag = x.ref ? '<em class="b57-tag ref">↺ also above</em>' : st.t === 'culled' ? '<em class="b57-tag cull">Culled</em>' : st.t === 'archived' ? '<em class="b57-tag arch">Archived</em>' : st.t === 'retired' ? '<em class="b57-tag ret">Retired</em>' : st.t === 'removed' ? '<em class="b57-tag gone">Deleted plant</em>' : st.t === 'nameonly' ? '<em class="b57-tag nameonly">Name only</em>' : st.t === 'bought' ? `<em class="b57-tag bought" data-b58="info" data-k="${esc(x.k)}" role="button" tabindex="0" aria-label="Bought genetics${st.br ? ' from ' + esc(st.br) : ''}. Tap for details">${esc(window.B58 && B58.boughtBadge ? B58.boughtBadge(st.br) : 'Bought')}</em>` : '';
    return `<button type="button" class="b57-n ${cls}${x.ref ? ' ref' : ''}${st.t ? ' st-' + st.t : ''}" data-b57="sel" data-k="${esc(x.k)}"${ofA(x)}${x.sib ? ' data-sib="1"' : ''} data-st="${st.t}">${ph(x.k)}<b>${esc(name(x.k))}</b><small>${sub(x.k, x.role)}${st.l && !x.ref ? ' · ' + esc(st.l) : ''}</small>${tag}</button>`;
  }
  const candNode = (c) => c.k ? `<button type="button" class="b57-n cand keeper" data-b57="sel" data-k="${esc(c.k)}" data-cand="${c.i}">${ph(c.k)}<b>${esc(c.t)}</b><small>${esc(c.s)}</small><em class="b57-tag keep">★ Keeper</em></button>` : `<div class="b57-n cand${c.cull ? ' st-culled' : ''}" data-cand="${c.i}"><span class="b57-ph mono" aria-hidden="true">#${c.i}</span><b>${esc(c.t)}</b><small>${esc(c.s)}</small>${c.cull ? '<em class="b57-tag cull">Cull</em>' : ''}</div>`;
  const kidNode = (x) => x.add ? `<button type="button" class="b57-n kid add b58-only" data-b58="addkid"><span class="b57-ph mono" aria-hidden="true">+</span><b>Add kid</b><small>link a plant as a child</small></button>` : x.k ? `<button type="button" class="b57-n kid" data-b57="sel" data-kid="1" data-k="${esc(x.k)}">${ph(x.k)}<b>${esc(x.t)}</b><small>${esc(x.s)}</small></button>` : `<div class="b57-n kid clone"><span class="b57-ph mono" aria-hidden="true">C</span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div>`;
  const me = (k) => `<div class="b57-me" data-k="${esc(k)}" data-node="${esc(k)}">${ph(k, 1)}<div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div></div>`;
  const crossTxt = (k) => { const p = par2(k); if (!p) return stat(k).l || 'Starting line'; return same(p[0], p[1]) ? `${nm2(p[0])} selfed (S1)` : p.map((q) => (q ? nm2(q) : 'not recorded')).join(' × '); };
  const lab = (t) => `<div class="b57-lab">${esc(t)}</div>`;
  const row = (arr, f, cls = '') => `<div class="b57-row ${cls}">${arr.map(f).join('')}</div>`;
  function parentsRow(lv) { const p = lv[1] || []; const r0 = lv[0][0].k; const m = p.find((x) => x.side === 'm') || { k: '', role: 'Mother · not recorded', none: 1, via: r0, side: 'm' }; const f = p.find((x) => x.side === 'f') || { k: '', role: 'Father · not recorded', none: 1, via: r0, side: 'f' }; return [m, f]; }
  const real = (p) => p && p.k && !p.none && !p.ref && !p.self && !isUnk(p.k);
  const gpFor = (lv, p) => { const g = gpOf(lv, p); if (g.length || !real(p)) return g; return [{ k: '', none: 1, via: p.k, side: 'm', role: `Mother of ${name(p.k)} · not recorded` }, { k: '', none: 1, via: p.k, side: 'f', role: `Father of ${name(p.k)} · not recorded` }]; };
  const gpAll = (lv, m, f) => [...gpFor(lv, m), ...gpFor(lv, f)];
  const ofA = (x) => (x.via && x.side ? ` data-of="${esc(x.via)}" data-side="${x.side}"` : '');
  const pnode = (x, cls) => (x.none && x.via ? `<button type="button" class="b57-n ${cls || ''} none add" data-b58="add"${ofA(x)}><span class="b57-ph mono" aria-hidden="true">+</span><b>Not recorded</b><small>${esc(x.role)} · tap to add</small></button>` : x.none ? `<div class="b57-n ${cls || ''} none"><span class="b57-ph mono" aria-hidden="true">–</span><b>Not recorded</b><small>${esc(x.role)}</small></div>` : node(x, cls));
  const gpOf = (lv, p) => (p && p.k ? (lv[2] || []).filter((x) => x.via === p.k) : []);
  function older(lv, from) {
    if (lv.length <= from) return '';
    return lv.slice(from).map((r, i) => `${lab(`Generation ${from + i} back · ${r.length} plant${r.length > 1 ? 's' : ''}`)}${row(r, (x) => node(x, 'old'), 'scroll')}`).join('');
  }
  /* the population row: pheno-hunt candidates (seed run members, grade + backup clones, keeper) or brothers & sisters */
  function popOf(k) { const c = candidates(k); if (c.length) return { hunt: 1, items: c, keeper: c.find((x) => x.keeper) }; const sb = siblings(k); return { hunt: 0, items: sb.map((x) => ({ k: x, me: same(x, k), role: same(x, k) ? 'this plant' : 'Sibling' })) }; }
  const popNode = (x) => (x.cand ? candNode(x) : node({ k: x.k, role: x.role, sib: !x.me }, x.me ? 'is-me' : 'sib'));
  const popLab = (P, st) => P.hunt ? `Pheno hunt · ${P.items.length} candidate${P.items.length === 1 ? '' : 's'} · ${P.keeper ? 'keeper: ' + (P.keeper.s.split(' · ')[1] || '') : 'no keeper yet'}` : `Brothers & sisters · ${st && st.k === 'roots' ? 'same soil' : 'same seed pop'}`;
  const popRow = (P) => row(P.items, popNode, 'scroll pop');
  function nextBranch(P) { if (!P.keeper) return ''; const kk = kids(P.keeper.k); return `${lab(`Next branch · ${name(P.keeper.k)}`)}${row([{ k: P.keeper.k, role: 'Keeper · now a mother' }, ...kk.filter((x) => x.k).map((x) => ({ k: x.k, role: x.s }))], (x) => node(x, 'branch'), 'scroll')}`; }
  const kidsBlock = (ks) => (ks.length ? row([...ks, { add: 1 }], kidNode, 'scroll') : `<p class="b57-empty">No kids recorded yet.</p>${row([{ add: 1 }], kidNode, 'b58-only')}`);
  /* ---------- b59 partner row: this plant × the plant it was bred with, bracket down to its Kids ---------- */
  function partners(k, ks) {
    const G = []; ks.forEach((x) => { if (!x.k) return; const p = par2(x.k) || []; const i = same(p[0], k) ? 0 : same(p[1], k) ? 1 : -1; if (i < 0) return;
      const o = (i === 0 ? p[1] : p[0]) || ''; if (o && !isUnk(o) && window.B63 && B63.explicitKey && B63.explicitKey(o)) return; const self = !!o && same(o, k); const key = isUnk(o) ? '?' : o; let g = G.find((y) => (key === '?' ? y.key === '?' : y.key !== '?' && same(y.key, key)));
      if (!g) { g = { key, self, side: i === 0 ? 'Father' : 'Mother', kids: [] }; G.push(g); } g.kids.push(x); });
    return G;
  }
  const XB = '<svg class="b59-xb" viewBox="0 0 76 30" aria-hidden="true"><path class="ln" d="M1 15H24M52 15H75"/><circle cx="38" cy="15" r="12.5"/><path class="xx" d="M33.4 10.4l9.2 9.2M42.6 10.4l-9.2 9.2"/></svg>';
  const BRK = (up) => `<svg class="b59-brk${up ? ' up' : ''}" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path d="${up ? 'M150 0V18M64 40V18H236V40' : 'M64 0V22H236V0M150 22V40'}"/></svg>`;
  function pairCard(g, k) {
    if (g.self) return `<div class="b59-pc pt" data-partner="self" data-node="self">${ph(k, 1)}</div>`;
    if (g.key === '?') return `<div class="b59-pc pt" data-partner="?" data-node="?"><span class="b57-ph mono big" aria-hidden="true">?</span></div>`;
    return `<button type="button" class="b59-pc pt" data-b57="sel" data-node="${esc(g.key)}" data-k="${esc(g.key)}" data-partner="${esc(g.key)}" aria-label="${esc(name(g.key))}, bred with this plant">${ph(g.key, 1)}</button>`;
  }
  const pLab = (g) => `<div class="b59-plab"><b>${esc(g.self ? 'Itself' : g.key === '?' ? 'Unknown' : name(g.key))}</b><small>${g.self ? 'Self-pollinated · S1' : `Bred with · ${g.side}`}</small></div>`;
  function fam(k, ks, o = {}) {
    const G = partners(k, ks); const rest = ks.filter((x) => !G.some((g) => g.kids.includes(x)));
    const ban = `<div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>`;
    if (!G.length) return `${o.noMe ? '' : `${lab('This plant')}${me(k)}`}${o.kidL || lab('Kids')}${kidsBlock(ks)}`;
    const grp = (g, i) => { const rows = window.B60 && B60.rows ? B60.rows(k, g, !!o.up) : ''; const top = `${o.up ? '' : rows}<div class="b59-pair" data-b59pair="${esc(g.key)}"><div class="b59-pc me" data-node="${esc(k)}">${ph(k, 1)}</div>${XB}${pairCard(g, k)}</div><div class="b59-labs">${ban}${pLab(g)}</div>${o.up ? rows : ''}`;
      const kidsH = `${o.kidL || lab('Kids')}${row(i === G.length - 1 ? [...g.kids, ...rest, { add: 1 }] : g.kids, kidNode, 'scroll b59-kids')}`;
      return o.up ? `<div class="b59-fam up">${kidsH}${BRK(1)}${top}</div>` : `<div class="b59-fam">${top}${BRK(0)}${kidsH}</div>`; };
    const has60 = !!(window.B60 && B60.rows && G.some((g) => B60.rows(k, g, false)));
    const L = o.noLab || has60 ? '' : lab(G.length > 1 ? `This plant · bred with ${G.length} plants` : 'This plant');
    return o.up ? `${G.map(grp).join('')}${L}` : `${L}${G.map(grp).join('')}`;
  }
  /* ---------- SVG ring / fan ---------- */
  const P_ = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  function seg(cx, cy, r0, r1, a0, a1) { const [x0, y0] = P_(cx, cy, r1, a0), [x1, y1] = P_(cx, cy, r1, a1), [x2, y2] = P_(cx, cy, r0, a1), [x3, y3] = P_(cx, cy, r0, a0); const L = a1 - a0 > Math.PI ? 1 : 0; return `M${x0} ${y0}A${r1} ${r1} 0 ${L} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${L} 0 ${x3} ${y3}Z`; }
  function fit(t, len) { const max = Math.max(3, Math.floor(len / 6.6)); t = String(t || ''); return t.length > max ? t.slice(0, max - 1) + '…' : t; }
  function lbl(t, x, y, arc, boxW, boxH, cls) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const words = t.split(' ');
    const widthOf = (s, size) => Math.max(size, s.length * size * 0.62);
    let fs = 10.5;
    let lines = [t];
    const maxW0 = Math.max(36, (arc || 80) * 0.9);
    while (fs > 6) {
      lines = [];
      let cur = '';
      words.forEach((w) => {
        const next = cur ? cur + ' ' + w : w;
        if (!cur || widthOf(next, fs) <= maxW0) cur = next;
        else { lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      const widest = Math.max.apply(null, lines.map((l) => widthOf(l, fs)));
      if (widest <= maxW0 || fs <= 6.4) break;
      fs -= 0.4;
    }
    const widest = Math.max.apply(null, lines.map((l) => widthOf(l, fs)));
    const half = widest / 2;
    if (boxW) x = Math.max(4 + half, Math.min(boxW - 4 - half, x));
    let y0 = y - (lines.length - 1) * fs * 0.52;
    if (boxH) {
      const bot = y0 + Math.max(0, lines.length - 1) * fs * 1.05 + fs * 0.25;
      if (bot > boxH - 3) y0 -= bot - (boxH - 3);
      if (y0 < fs) y0 = fs;
    }
    const xAt = x.toFixed(1);
    return `<text x="${xAt}" y="${y0.toFixed(1)}" text-anchor="middle" class="${cls || 't1'}" data-full="${esc(t)}" style="font-size:${fs.toFixed(1)}px">${lines.map((l, i) => `<tspan x="${xAt}" dy="${i ? (fs * 1.05).toFixed(1) : 0}">${esc(l)}</tspan>`).join('')}</text>`;
  }
  /* Each fan label is fitted after layout, into the wedge's own arc.
     The strings travel on the segment until that measurement runs. */
  function ring(items, cx, cy, r0, r1, a0, a1, cls, boxW, boxH) {
    if (!items.length) return ''; const step = (a1 - a0) / items.length; let s = '';
    const fan = !!(boxH && boxH <= 220);
    items.forEach((x, i) => { const b0 = a0 + i * step, b1 = b0 + step, m = (b0 + b1) / 2, rm = (r0 + r1) / 2; const [tx, ty] = P_(cx, cy, rm, m); const arc = Math.min(step * rm * 0.92, 120);
      const nm = x.cand ? x.t : x.self ? 'Self (S1)' : x.none ? (x.via ? '+ Not recorded' : 'Not recorded') : x.k ? nm2(x.k) : (x.t || 'Not recorded'); const sb = x.cand ? x.s : x.k ? (x.ref ? 'also above' : (stat(x.k).t === 'culled' ? 'Culled' : stat(x.k).t === 'archived' ? 'Archived' : stat(x.k).t === 'retired' ? 'Retired' : stat(x.k).t === 'removed' ? 'Deleted plant' : stat(x.k).t === 'nameonly' ? 'Name only' : stat(x.k).t === 'bought' ? (window.B58 && B58.boughtBadge ? B58.boughtBadge(stat(x.k).br) : 'Bought') : (x.role || gen(x.k)))) : (x.s || x.role || '');
      const one = step * rm < 34; const tap = x.k && !isUnk(x.k); const add = !tap && x.via && x.side;
      const detail = sb && String(sb) !== String(nm) ? String(sb) : '';
      const aria = detail ? `${nm} · ${detail}` : nm;
      if (fan) {
        s += `<g class="b57-seg ${cls}${tap ? '' : add ? ' none add' : ' none'}${x.keeper ? ' keeper' : ''}${x.me ? ' is-me' : ''}" data-fan="1" data-cx="${cx}" data-cy="${cy}" data-r0="${r0}" data-r1="${r1}" data-a0="${b0}" data-a1="${b1}" data-name="${esc(nm)}" data-detail="${esc(detail)}"${tap ? ` data-b57="sel" data-k="${esc(x.k)}" role="button" tabindex="0" aria-label="${esc(aria)}"` : add ? ` data-b58="add" role="button" tabindex="0" aria-label="${esc(aria)}"` : ` aria-label="${esc(aria)}"`}${ofA(x)}${add ? ' data-add="1"' : ''}${x.cand ? ` data-cand="${x.i}"` : ''}><path d="${seg(cx, cy, r0, r1, b0, b1)}"/></g>`;
      } else {
        s += `<g class="b57-seg ${cls}${tap ? '' : add ? ' none add' : ' none'}${x.keeper ? ' keeper' : ''}${x.me ? ' is-me' : ''}"${tap ? ` data-b57="sel" data-k="${esc(x.k)}" role="button" tabindex="0" aria-label="${esc(nm)}"` : add ? ` data-b58="add" role="button" tabindex="0" aria-label="${esc(aria)}"` : ` aria-label="${esc(aria)}"`}${ofA(x)}${add ? ' data-add="1"' : ''}${x.cand ? ` data-cand="${x.i}"` : ''}><path d="${seg(cx, cy, r0, r1, b0, b1)}"/>${lbl(nm, tx, ty + (one ? 4 : -2), arc, boxW, boxH, 't1')}${one || x.none ? '' : lbl(sb, tx, ty + 11, arc, boxW, boxH, 't2')}</g>`;
      }
    });
    return s;
  }
  let cid = 0;
  function centre(k, cx, cy, r) { const s = photo(k); const id = 'b57c' + (++cid);
    return `<g data-b57="sel" data-k="${esc(k)}" class="b57-ctr" role="button" tabindex="0" aria-label="${esc(name(k))}"><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${r + 3}" class="rim"/>${s ? `<image href="${esc(s)}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" data-photo="1"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" class="mono"/><text x="${cx}" y="${cy + 9}" text-anchor="middle" class="mt">${esc(mono(k))}</text>`}</g>`; }
  function gpItems(lv, m, f) { const out = []; [m, f].forEach((p, i) => { const g = gpOf(lv, p); if (g.length) out.push(...g); else if (real(p)) out.push(...gpFor(lv, p)); else out.push({ none: 1, role: `${i ? "Father's" : "Mother's"} parents` }, { none: 1, role: '' }); }); return out; }
  function radial(k, lv, P, ks) {
    /* b60.1: with a partner the one-sided ring / fan art is replaced by the both-sides tree */
    if (window.B60 && partners(k, ks).length) return `<div class="b60-ring-swap" data-b60swap="radial">${fam(k, ks)}</div>${P.hunt ? `${lab(popLab(P))}${popRow(P)}` : ''}${nextBranch(P)}`;
    const [m, f] = parentsRow(lv); const gp = gpItems(lv, m, f);
    const top = P.items.filter((x) => !x.me); const outer = top.length ? top : [{ t: P.hunt ? 'No candidates' : 'No siblings', s: 'same seed pop' }];
    const kk = ks.length ? ks.map((x) => (x.k ? { k: x.k, role: x.s } : { t: x.t, s: x.s })) : [{ t: 'No kids yet', s: 'kids' }];
    return `<div class="b57-svgw"><svg viewBox="0 0 380 380" class="b57-svg radial" role="group" aria-label="Family tree rings">
<circle cx="190" cy="190" r="187" class="wood"/>${ring(outer, 190, 190, 140, 184, -Math.PI, 0, 'r3', 380, 380)}${ring(kk, 190, 190, 140, 184, 0, Math.PI, 'r3 k', 380, 380)}${ring(gp, 190, 190, 98, 140, -Math.PI / 2, 1.5 * Math.PI, 'r2', 380, 380)}${ring([m, f], 190, 190, 56, 98, Math.PI / 2, 2.5 * Math.PI, 'r1', 380, 380)}${centre(k, 190, 190, 52)}</svg></div>
<div class="b57-ban solo"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>
<p class="b57-key">Centre: this plant · Ring 1: parents · Ring 2: grandparents · Outer ring: ${P.hunt ? 'pheno-hunt candidates' : 'brothers &amp; sisters'} (top), kids (bottom)</p>${fam(k, ks, { noMe: 1 })}${P.hunt ? `${lab(popLab(P))}${popRow(P)}` : ''}${nextBranch(P)}`;
  }
  function fan(k, lv, P, ks) {
    /* b60.1: with a partner the one-sided ring / fan art is replaced by the both-sides tree */
    if (window.B60 && partners(k, ks).length) return `<div class="b60-ring-swap" data-b60swap="fan">${fam(k, ks)}</div>${P.hunt ? `${lab(popLab(P))}${popRow(P)}` : ''}${nextBranch(P)}`;
    const [m, f] = parentsRow(lv); const gp = gpItems(lv, m, f);
    const o0 = P.items.filter((x) => !x.me); const o = o0.length ? o0 : [{ t: P.hunt ? 'No candidates' : 'No siblings', s: 'same seed pop' }];
    return `${lab(P.hunt ? 'Pheno-hunt candidates · outer band' : 'Brothers & sisters · outer band')}<div class="b57-svgw"><svg viewBox="0 0 380 206" class="b57-svg fan" role="group" aria-label="Family tree fan">${ring(o, 190, 198, 150, 190, Math.PI, 2 * Math.PI, 'r3', 380, 206)}${ring(gp, 190, 198, 104, 150, Math.PI, 2 * Math.PI, 'r2', 380, 206)}${ring([m, f], 190, 198, 58, 104, Math.PI, 2 * Math.PI, 'r1', 380, 206)}${centre(k, 190, 198, 52)}</svg></div>
<div class="b57-sides"><span>◀ Mother's side</span><span>Father's side ▶</span></div><div class="b57-ban solo"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>
${P.hunt ? `${lab(popLab(P))}${popRow(P)}` : ''}${nextBranch(P)}${fam(k, ks, { noMe: 1 })}`;
  }
  function cert(k, lv, P, ks) {
    const [m, f] = parentsRow(lv);
    const col = (p, i) => { const g = gpOf(lv, p); return `<div class="b57-cp">${pnode(p)}<div class="b57-cg">${(g.length ? g : real(p) ? gpFor(lv, p) : [{ none: 1, role: `${i ? "Father's" : "Mother's"} parents` }]).map((x) => pnode(x, 'mini')).join('')}</div></div>`; };
    const li = (x) => x.cand ? `<div class="b57-li${x.keeper ? ' keeper' : ''}" data-cand="${x.i}">${x.k ? ph(x.k) : `<span class="b57-ph mono">#${x.i}</span>`}<b>${esc(x.t)}</b><small>${esc(x.s)}</small></div>` : `<button type="button" class="b57-li${x.me ? ' is-me' : ''}" data-b57="sel" data-k="${esc(x.k)}">${ph(x.k)}<b>${esc(name(x.k))}${x.me ? ' · this plant' : ''}</b><small>${esc(gen(x.k))}</small></button>`;
    return `<div class="b57-paper"><h3 class="b57-ct">Certificado de linaje</h3><p class="b57-cs">${esc(crossTxt(k))}</p>
${window.B60 && partners(k, ks).length ? '' : `<div class="b57-ped"><div class="b57-pme">${node({ k, role: 'This plant' }, 'is-me')}</div><div class="b57-pcol">${col(m, 0)}${col(f, 1)}</div></div>`}
${lab(popLab(P))}<div class="b57-list">${P.items.map(li).join('')}</div>${nextBranch(P)}
${fam(k, ks)}<p class="b57-motto">Raíces fuertes · cosechas grandes</p></div>`;
  }
  function stack(k, lv, P, ks, st) {
    const [m, f] = parentsRow(lv); const kidsH = kidsBlock(ks);
    const gA = gpAll(lv, m, f); const gpH = gA.length ? `${lab(st.k === 'river' ? 'Grandparents · the sources' : 'Grandparents')}${row(gA, (x) => node(x), 'gp scroll')}` : `${lab('Grandparents')}<p class="b57-empty">Not recorded. Add the parents first.</p>`;
    const parH = `${lab(st.k === 'roots' ? 'Parents · the roots' : 'Parents')}${row([m, f], (x) => pnode(x), 'par')}`;
    const both = !!(window.B60 && partners(k, ks).length); /* b60: the both-sides tree replaces the one-sided rows */
    const gpH2 = both ? '' : gpH, parH2 = both ? '' : parH;
    const popH = `${lab(popLab(P, st))}${popRow(P)}${nextBranch(P)}`;
    const kidL = lab(st.k === 'river' ? 'Kids · downstream' : st.k === 'roots' ? 'Kids · the crown' : 'Kids');
    const famH = fam(k, ks, { kidL, up: st.lay === 'crown' });
    if (st.lay === 'crown') return `${famH}<div class="b57-soil" aria-hidden="true"></div>${popH}${parH2}${!both && gA.length ? `${lab('Grandparents')}${row(gA, (x) => node(x), 'gp scroll')}` : ''}<p class="b57-motto">Raíces fuertes · cosechas grandes</p>`;
    if (st.lay === 'window') return `<div class="b57-pane top">${lab('This plant')}<div class="b57-rose"><div class="b57-rosew"><svg class="b57-rosedots" viewBox="0 0 200 200" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; const c = ['#b5302a', '#2f8f83', '#2f56a8', '#d9a441'][i % 4]; return `<circle cx="${(100 + 86 * Math.cos(a)).toFixed(1)}" cy="${(100 + 86 * Math.sin(a)).toFixed(1)}" r="7" fill="${c}"/>`; }).join('')}${Array.from({ length: 12 }, (_, i) => { const a = (i + 0.5) * Math.PI / 6; const c = ['#d9a441', '#2f56a8', '#b5302a'][i % 3]; return `<circle cx="${(100 + 70 * Math.cos(a)).toFixed(1)}" cy="${(100 + 70 * Math.sin(a)).toFixed(1)}" r="4.5" fill="${c}"/>`; }).join('')}<circle cx="100" cy="100" r="95" fill="none" stroke="#c79a63" stroke-width="3"/><circle cx="100" cy="100" r="62" fill="none" stroke="#c79a63" stroke-width="2"/></svg>${ph(k, 1)}</div><div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div></div></div>${both ? '' : `<div class="b57-pane two"><div class="b57-pane m">${lab("Mother's window")}${pnode(m)}${row(gpFor(lv, m), (x) => node(x, 'mini'), 'gp')}</div><div class="b57-pane f">${lab("Father's window")}${pnode(f)}${row(gpFor(lv, f), (x) => node(x, 'mini'), 'gp')}</div></div>`}<div class="b57-pane s">${popH}</div><div class="b57-pane k">${fam(k, ks, { kidL, noMe: 1, noLab: 1 })}</div><p class="b57-motto">Raíces fuertes · cosechas grandes</p>`;
    if (st.k === 'mobile') { const B = '<div class="b57-bar fl" aria-hidden="true"><i></i></div>'; return `${B}${gpH2}${B}${parH2}${B}${famH}${B}${popH}${B}<p class="b57-motto">Raíces fuertes · cosechas grandes</p>`; }
    return `${gpH2}<div class="b57-bar" aria-hidden="true"></div>${parH2}<div class="b57-bar" aria-hidden="true"></div>${famH}${popH}${st.k === 'ceiba' || st.k === 'mobile' || st.k === 'river' ? '<p class="b57-motto">Raíces fuertes · cosechas grandes</p>' : ''}`;
  }
  function tree(pg, head) {
    const k = pg.key; const sk = pg.styleKey || k; const sn = ok(pg.forceStyle) ? Number(pg.forceStyle) : styleOf(sk); const st = STYLES[sn];
    const lv = ancestors(k); const P = popOf(k); const ks = kids(k); const depth = lv.length - 1;
    const body = st.lay === 'radial' ? radial(k, lv, P, ks) : st.lay === 'fan' ? fan(k, lv, P, ks) : st.lay === 'cert' ? cert(k, lv, P, ks) : stack(k, lv, P, ks, st);
    const p = par2(k); const subT = [crossTxt(k), P.hunt ? `pheno hunt of ${P.items.length}${P.keeper ? '' : ' · no keeper yet'}` : P.items.length > 1 ? `seed pop of ${P.items.length}` : '', st.n].filter(Boolean).join(' · ');
    const sel = pg.sel ? `<div class="b57-card">${ph(pg.sel)}<div><b>${esc(name(pg.sel))}</b><small>${esc(gen(pg.sel))}</small><div class="b57-acts"><button type="button" class="b57-a" data-b49="open" data-k="${esc(pg.sel)}">Open profile ›</button>${par2(pg.sel) && !same(pg.sel, k) ? `<button type="button" class="b57-a" data-b57="walk" data-k="${esc(pg.sel)}">Walk up this line ›</button>` : ''}</div></div><button type="button" class="b57-x" data-b57="unsel" aria-label="Close">×</button></div>` : '';
    const trail = (pg.trail || []).length ? `<div class="b57-trail">${pg.trail.map((t) => `<button type="button" data-b57="walkto" data-k="${esc(t)}">${esc(name(t))}</button>`).join('<span>›</span>')}<span>›</span><b>${esc(name(k))}</b></div>` : '';
    return `<div class="b57${pg.edit ? ' b58-editing' : ''}" data-b57s="${sn}" data-b57k="${st.k}" data-b57lay="${st.lay}" data-depth="${depth}">${head}<h2 class="b18-h1">Family tree</h2><p class="b57-subt">${esc(subT)}</p>
<div class="b57-tools"><span class="m-s">${depth ? `${depth} generation${depth > 1 ? 's' : ''} recorded` : (stat(k).t === 'bought' ? stat(k).l : 'No parents recorded')}</span><button type="button" class="b58-edit${pg.edit ? ' on' : ''}" data-b58="edit" aria-pressed="${pg.edit ? 'true' : 'false'}">${pg.edit ? 'Done' : 'Edit'}</button><span class="b57-z"><button type="button" data-b57="z-" aria-label="Zoom out">−</button><button type="button" data-b57="z0" aria-label="Reset zoom">Zoom</button><button type="button" data-b57="z+" aria-label="Zoom in">+</button></span></div>${trail}
${pg.edit ? '<div class="b58-banner" role="status">Edit mode · tap any plant to change, add, relink or remove it. Hand edits are kept and never overwritten automatically.</div>' : ''}<div class="b57-scroll"><div class="b57-canvas" style="zoom:${pg.zoom || 1}">${body}${depth > 2 ? `<div class="b57-older">${lab('Older generations · tap a plant to open it, long-press to walk up')}${older(lv, 3)}</div>` : ''}</div></div>${sel}
<p class="m-s b57-note">Tap any plant to open its profile; long-press it to walk up its line. ${p && !k.startsWith('pr:') ? esc(B49.why(k)) + '.' : ''}</p></div>`;
  }
  const _page = b18BrPageHtml;
  b18BrPageHtml = function () {
    const pg = B18.brPage; const h = _page.apply(this, arguments);
    if (!pg || pg.type !== 'b49tree') return h;
    try { const head = (h.match(/^\s*<div class="b18-pagehead">[\s\S]*?<\/div>/) || [''])[0]; return tree(pg, head); } catch (e) { console.warn('b57 tree', e); return h; }
  };
  const rr = () => { renderBreeding(); };
  function walk(k) { const pg = B18.brPage; if (!pg || pg.type !== 'b49tree' || !k) return; pg.trail = [...(pg.trail || []), pg.key]; pg.styleKey = pg.styleKey || pg.key; pg.key = k; pg.sel = ''; rr(); window.scrollTo(0, 0); }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b57]'); if (!b) return; const pg = B18.brPage; if (!pg || pg.type !== 'b49tree') return; const a = b.dataset.b57; e.preventDefault();
    if (a === 'sel') { pg.sel = b.dataset.k; return rr(); }
    if (a === 'unsel') { pg.sel = ''; return rr(); }
    if (a === 'walk') return walk(b.dataset.k);
    if (a === 'walkto') { const i = (pg.trail || []).indexOf(b.dataset.k); pg.trail = pg.trail.slice(0, Math.max(0, i)); pg.key = b.dataset.k; pg.sel = ''; return rr(); }
    if (a === 'z+' || a === 'z-' || a === 'z0') { const z = a === 'z0' ? 1 : Math.min(2, Math.max(0.5, (pg.zoom || 1) + (a === 'z+' ? 0.25 : -0.25))); pg.zoom = z; const c = document.querySelector('.b57-canvas'); if (c) c.style.zoom = z; }
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('g[data-b57]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });

  /* ---------- entry points: Family tree button on every profile + Lineage tab (phone tab bar and wide sidebar) ---------- */
  function lineageList() {
    const out = [];
    (state.breedingProjects || []).filter((p) => p.status !== 'Archived').forEach((p) => out.push({ k: `pr:${p.id}`, kind: 'Breeding project', r: p }));
    [['pl', state.plants], ['bp', state.breedingPlants]].forEach(([t, a]) => (a || []).forEach((x) => { if (plantsRunning(x) > 1 && !(typeof isClonePlant === 'function' && isClonePlant(x)) && !/archiv/i.test(String(x.status || ''))) out.push({ k: `${t}:${x.id}`, kind: `Seed run · ${plantsRunning(x)} plants`, r: x }); }));
    return out.filter((x) => !(window.B63 && B63.explicitId && B63.explicitId(x.r)));
  }
  function linHtml() {
    const L = lineageList();
    const card = (x) => { const sn = styleOf(x.k); const st = STYLES[sn]; const P = popOf(x.k);
      return `<button type="button" class="b57-lc" data-b57s="${sn}" data-b57k="${st.k}" data-b57="tree" data-k="${esc(x.k)}"><span class="b57-lsw" aria-hidden="true"></span>${ph(x.k)}<span class="b57-lt"><b>${esc(name(x.k))}</b><small>${esc(crossTxt(x.k))}</small><small>${esc(x.kind)} · ${esc(st.n)}${P.hunt ? ` · ${P.items.length} candidates${P.keeper ? ' · keeper picked' : ' · no keeper yet'}` : ''}</small></span><i class="b18-chev" aria-hidden="true">›</i></button>`; };
    return `<h2 class="b18-h1">Lineage</h2><p class="b57-subt">Every breeding project and seed run, each in its own family-tree style. Tap one to open its tree.</p>
<div class="b57-lin">${L.length ? L.map(card).join('') : '<div class="m-card"><p class="m-s">No breeding projects or seed runs yet. Add a project on the Breeding tab and its family tree shows up here automatically.</p></div>'}</div>`;
  }
  const _page2 = b18BrPageHtml;
  b18BrPageHtml = function () { const pg = B18.brPage; if (pg && pg.type === 'b57lin') { try { return linHtml(); } catch (e) { console.warn('b57 lin', e); } } return _page2.apply(this, arguments); };
  function openLineage() { if (typeof activeView !== 'undefined' && activeView !== 'breeding') switchView('breeding'); try { mfDetailId = ''; } catch (e) { /* */ } B18.brPage = { type: 'b57lin' }; renderBreeding(); window.scrollTo(0, 0); try { if (typeof wRenderSidebar === 'function') wRenderSidebar(); } catch (e) { /* */ } mark(); }
  const TREE_SVG = '<svg class="ci" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 29V15" stroke="#7a5a30" stroke-width="2.4" stroke-linecap="round"/><path d="M16 21l-6-4M16 18l6-4" stroke="#7a5a30" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="9" r="5.5" fill="#c98a3e"/><circle cx="8.5" cy="15" r="4" fill="#8a6d2a"/><circle cx="23.5" cy="13" r="4" fill="#b07a12"/></svg>';
  function addTab() {
    const bar = document.getElementById('tabbar'); if (!bar || bar.querySelector('[data-tab-view="lineage"]')) return;
    const br = bar.querySelector('[data-tab-view="breeding"]'); if (!br) return;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tab b57-tab'; b.dataset.tabView = 'lineage'; b.setAttribute('aria-label', 'Lineage'); b.innerHTML = `${TREE_SVG}<span>Lineage</span>`; br.after(b);
  }
  function addSide() { try { if (typeof W_NAV !== 'undefined' && !W_NAV.some((x) => x.id === 'lineage')) { const i = W_NAV.findIndex((x) => x.id === 'breeding'); W_NAV.splice(i + 1, 0, { id: 'lineage', label: 'Lineage', ico: '🌳', views: ['b57-lineage'] }); if (typeof wCurrentView === 'function') { const _wc = wCurrentView; wCurrentView = function () { return onLin() ? 'b57-lineage' : _wc.apply(this, arguments); }; } if (typeof wRenderSidebar === 'function') wRenderSidebar(); } } catch (e) { /* */ } }
  const onLin = () => typeof activeView !== 'undefined' && activeView === 'breeding' && B18.brPage && (B18.brPage.type === 'b57lin' || (B18.brPage.type === 'b49tree' && B18.brPage.fromLin));
  function mark() {
    const on = onLin();
    document.querySelectorAll('#tabbar [data-tab-view="lineage"], [data-w-nav="lineage"]').forEach((b) => { b.classList.toggle('active', on); b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (on) document.querySelectorAll('#tabbar [data-tab-view="breeding"], [data-w-nav="breeding"]').forEach((b) => { b.classList.remove('active', 'on'); b.removeAttribute('aria-current'); });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('#tabbar [data-tab-view="lineage"], [data-w-nav="lineage"]'); if (!b) return; e.preventDefault(); e.stopImmediatePropagation(); openLineage(); }, true);
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-b57="tree"]'); if (!b) return; e.preventDefault(); const lin = B18.brPage && B18.brPage.type === 'b57lin'; B49.openPage({ type: 'b49tree', key: resolveKey(b.dataset.k), fromLin: lin }); if (B18.brPage && B18.brPage.type === 'b49tree') B18.brPage.fromLin = !!lin; mark(); });
  if (window.B49 && B49.openPage && !B49.openPage.b63from) {
    const _openPage = B49.openPage;
    B49.openPage = function (pg) {
      const lin = !!(pg && pg.fromLin);
      const out = _openPage.apply(this, arguments);
      try { if (B18.brPage && B18.brPage.type === 'b49tree') B18.brPage.fromLin = lin; mark(); keepTitleGlyph(); } catch (err) { /* */ }
      return out;
    };
    B49.openPage.b63from = 1;
  }
  /* The round title badge stays. Its plant glyph is img.mz-inline. A record
     with no photo, or a dark-theme asset that fails, leaves that circle
     empty. Use a glyph that already loaded, else the light seedling. */
  const GLYPHS = ['mascots/light/seedling.png', 'mascots/cartoon/sprout.png', 'mascots/coqui-flag-icon.png'];
  function glyphUrl(rel) { try { return new URL(rel, document.baseURI).href; } catch (e) { return rel; } }
  function titleGlyphs() {
    const root = document.querySelector('#breeding-view .b57[data-b57k]');
    const h = root && root.querySelector('.b18-h1');
    if (!h) return [];
    const hr = h.getBoundingClientRect();
    return [...root.querySelectorAll('img.mz-inline')].filter((img) => {
      if (img.closest('.b57-canvas, .b57-scroll, .b57-ban, .b57-svgw, #tabbar')) return false;
      if (h.contains(img)) return true;
      const r = img.getBoundingClientRect();
      if (!r.width && !r.height) return h.contains(img) || !!(img.parentElement && h.contains(img.parentElement));
      return r.bottom >= hr.top - 12 && r.top <= hr.bottom + 12;
    });
  }
  function glyphShown(img) {
    if (!img.complete || img.naturalWidth < 1) return false;
    const cs = getComputedStyle(img);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    const r = img.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8;
  }
  function revealGlyph(img) {
    const parent = img.parentElement;
    const pr = parent && parent.getBoundingClientRect();
    const round = pr && pr.width >= 18 && pr.width <= 96 && Math.abs(pr.width - pr.height) < 12;
    const size = round ? Math.max(16, Math.round(pr.width * 0.62)) : 22;
    img.hidden = false;
    img.removeAttribute('hidden');
    img.style.setProperty('display', 'inline-block', 'important');
    img.style.setProperty('visibility', 'visible', 'important');
    img.style.setProperty('opacity', '1', 'important');
    img.style.setProperty('width', size + 'px', 'important');
    img.style.setProperty('height', size + 'px', 'important');
    img.style.setProperty('max-width', 'none', 'important');
    img.style.setProperty('object-fit', 'contain', 'important');
  }
  function keepTitleGlyph() {
    titleGlyphs().forEach((img) => {
      if (glyphShown(img)) {
        const src = img.currentSrc || img.src || '';
        if (/mascots\/|coqui|sprout|seedling/i.test(src)) window.__b63Glyph = src;
        return;
      }
      const cur = img.getAttribute('src') || '';
      if (!img.complete && cur) return;
      if (img.complete && img.naturalWidth > 0) { revealGlyph(img); return; }
      let next = window.__b63Glyph || '';
      if ((!next || next === cur) && cur.indexOf('/dark/') >= 0) next = cur.replace('/dark/', '/light/');
      if (!next || next === cur) {
        const tried = img.dataset.b63try || '';
        next = glyphUrl(GLYPHS[tried === glyphUrl(GLYPHS[0]) ? 1 : tried === glyphUrl(GLYPHS[1]) ? 2 : 0]);
      }
      if (img.dataset.b63try === next) return;
      img.dataset.b63try = next;
      img.addEventListener('error', function onErr() { img.removeEventListener('error', onErr); keepTitleGlyph(); }, { once: true });
      img.src = next;
      revealGlyph(img);
    });
  }
  /* b59: the profile's own key. detailColl is 'plants', 'breedingPlants' or 'mf' (b42 mother / father profiles); b57 sent every
     mf profile as pl:<id>, which has no record, so the tree drew 'Deleted plant'. */
  function detailKey() { if (typeof detailPlantId !== 'function') return ''; const id = detailPlantId(); if (!id) return ''; const c = typeof detailColl !== 'undefined' ? detailColl : 'plants';
    return resolveKey(`${c === 'mf' || c === 'motherFatherPlants' ? 'mf' : c === 'breedingPlants' ? 'bp' : 'pl'}:${id}`); }
  /* look a key up by id: if the prefix has no record but another collection has that id (old / relinked key), use that one */
  function resolveKey(k) { k = String(k || ''); if (!k || rec(k) || !/^(pl|bp|mf|pr):/.test(k)) return k; const id = k.split(':').slice(1).join(':');
    for (const t of ['mf', 'pl', 'bp', 'pr']) if (rec(`${t}:${id}`)) return `${t}:${id}`; return k; }
  function profileBtn() {
    const v = document.getElementById('plant-detail-view');
    const old = v && v.querySelector('.b57-ftbtn'); if (old && old.dataset.k !== detailKey()) old.remove();
    if (v && v.classList.contains('active') && typeof detailPlantId === 'function' && detailPlantId() && !v.querySelector('.b57-ftbtn')) {
      const k = detailKey(); const at = v.querySelector('.pd-quick');
      if (at) at.insertAdjacentHTML('afterend', `<button type="button" class="m-card b57-ftbtn" data-b57="tree" data-k="${esc(k)}">${TREE_SVG}<span><b>Family tree</b><small>${esc(crossTxt(k))}</small></span><i class="b18-chev" aria-hidden="true">›</i></button>`);
    }
    try { const r = typeof mfDetailRecord === 'function' && activeView === 'breeding' && mfDetailRecord(); const bv = document.getElementById('breeding-view');
      const ob = bv && bv.querySelector('.b57-ftbtn'); if (r && ob && ob.dataset.k !== `mf:${r.id}`) ob.remove();
      if (r && bv && !bv.querySelector('.b57-ftbtn')) { const h = bv.querySelector('.b18-h1') || bv.querySelector('h2'); if (h) h.insertAdjacentHTML('afterend', `<button type="button" class="m-card b57-ftbtn" data-b57="tree" data-k="mf:${esc(r.id)}">${TREE_SVG}<span><b>Family tree</b><small>${esc(crossTxt(`mf:${r.id}`))}</small></span><i class="b18-chev" aria-hidden="true">›</i></button>`); } } catch (e) { /* */ }
  }
  addTab(); addSide();
  /* Keep the tree's own block clear of the fixed tab bar, and on a tall
     phone bring the grandparents, parents, plant, and name ribbon above it. */
  let fitting = false;
  /* Fit every Azulejo label inside its own wedge. Horizontal openings are
     measured from the arc; baselines are spaced so tspans never AABB-overlap.
     Empty slots always keep "+ Not" / "recorded" (never a lone "Not"). Role
     lines drop before type goes under 9 CSS px. A final pass drops leftover
     detail lines when two wedges still collide. */

  function fanBisectX(geom, y) {
    const midA = (geom.a0 + geom.a1) / 2;
    const s = Math.sin(midA);
    if (Math.abs(s) < 1e-4) return geom.cx + ((geom.r0 + geom.r1) / 2) * Math.cos(midA);
    return geom.cx + ((y - geom.cy) / s) * Math.cos(midA);
  }
  function fanUnifyX(placements, measure) {
    placements.forEach((P) => {
      const lines = P.placed.lines;
      if (lines.length < 2) return;
      const fs = P.placed.fs, geom = P.geom, cache = {};
      const isNR = fanIsNotRecorded(P.g.dataset.name);
      const inset = 4.0;
      let xLo = -1e9, xHi = 1e9, ok = true;
      lines.forEach((l) => {
        const slot = fanOpen(fanSlot(geom, l.y, fs, cache, inset), fs, geom);
        if (!slot) { ok = false; return; }
        const half = measure(l.text, fs) / 2 + (isNR ? 1.0 : 0);
        xLo = Math.max(xLo, slot.x - slot.w / 2 + half);
        xHi = Math.min(xHi, slot.x + slot.w / 2 - half);
      });
      if (!ok || xHi < xLo - 0.05) {
        /* Empty slots: still force a shared numeric x from the average.
           Named parents: keep per-line x when a shared column cannot clear
           every chord (diagonal wedges); otherwise the AABB gate fails. */
        if (!isNR) return;
        const x = lines.reduce((s, l) => s + l.x, 0) / lines.length;
        lines.forEach((l) => { l.x = x; });
        return;
      }
      const yMid = lines.reduce((s, l) => s + l.y, 0) / lines.length;
      let x = fanBisectX(geom, yMid);
      if (x < xLo) x = xLo;
      if (x > xHi) x = xHi;
      lines.forEach((l) => { l.x = x; });
    });
  }

  function fanIsOuterSideGrand(geom) {
    const mid = (geom.a0 + geom.a1) / 2;
    const span = geom.a1 - geom.a0;
    const thick = geom.r1 - geom.r0;
    return thick < 55 && geom.r0 > 90 && span > 0.4 && span < 1.0 && Math.abs(Math.cos(mid)) > 0.7;
  }
  function fanOuterAddPlace(geom, floor, measure) {
    const CLEAR = 4;
    const midA = (geom.a0 + geom.a1) / 2;
    const fs = Math.max(9, Math.round(Math.max(floor, 10) * 10) / 10);
    const r = (geom.r0 + geom.r1) / 2;
    let x = geom.cx + r * Math.cos(midA);
    let y = geom.cy + r * Math.sin(midA);
    const cache = {};
    const slot = fanOpen(fanSlot(geom, y, fs, cache, CLEAR), fs, geom);
    const half = measure('+ Add', fs) * 1.25 / 2 + 2;
    if (slot) {
      const lo = slot.x - slot.w / 2 + half, hi = slot.x + slot.w / 2 - half;
      if (hi >= lo) { if (x < lo) x = lo; if (x > hi) x = hi; }
    }
    return { fs, shown: '+ Add', lines: [{ text: '+ Add', x, y }], addShort: true };
  }
  /* Nudge empty/sibling labels until approx CLEAR=4 annulus holds; compress line gap if needed. */
  function fanNudgeInBand(P, measure) {
    const CLEAR = 4, geom = P.geom, fs = P.placed.fs;
    const asc = fs * 1.15, desc = fs * 0.35;
    const minGap = fs * 1.45;
    const midA = (geom.a0 + geom.a1) / 2;
    const s = Math.sin(midA);
    for (let n = 0; n < 64; n++) {
      let out = 0, inn = 0;
      P.placed.lines.forEach((l) => {
        const half = measure(l.text, fs) * 1.1 / 2 + 2;
        [[l.x - half, l.y - asc], [l.x + half, l.y - asc], [l.x - half, l.y + desc], [l.x + half, l.y + desc]].forEach((pt) => {
          const r = Math.hypot(pt[0] - geom.cx, pt[1] - geom.cy);
          if (r > geom.r1 - CLEAR) out = Math.max(out, r - (geom.r1 - CLEAR));
          if (r < geom.r0 + CLEAR) inn = Math.max(inn, (geom.r0 + CLEAR) - r);
        });
      });
      if (out < 0.1 && inn < 0.1) break;
      /* Both arcs tight: compress toward the block mid while keeping minGap (AABB-safe). */
      if (inn > 0.1 && out > 0.1 && P.placed.lines.length >= 2) {
        const ys = P.placed.lines.map((l) => l.y).sort((a, b) => a - b);
        const span = ys[ys.length - 1] - ys[0];
        if (span > minGap + 0.5) {
          const mid = (ys[0] + ys[ys.length - 1]) / 2;
          P.placed.lines.forEach((l) => { l.y += (l.y < mid ? 0.5 : -0.5); });
          continue;
        }
        /* Span already minimal — cannot clear both arcs by translating; stop. */
        break;
      }
      /* Upper fan (s<0): decreasing y moves outward (away from parent ring). */
      let dy;
      if (inn >= out) dy = (s < 0 ? -1 : 1) * Math.max(1, Math.ceil(inn));
      else dy = (s < 0 ? 1 : -1) * Math.max(1, Math.ceil(out));
      P.placed.lines.forEach((l) => { l.y += dy; });
      const x = P.placed.lines.reduce((sum, l) => sum + l.x, 0) / P.placed.lines.length;
      P.placed.lines.forEach((l) => { l.x = x; });
    }
  }
  /* Sibling (outer) band: leave exactly as placed — single-line, centred.
     Do not run divider reflow / band nudge on this ring (r7 behaviour). */
  function fanIsSiblingBand(P) {
    const n = String(P.g.dataset.name || '');
    if (/^No siblings$/i.test(n) || /^No candidates$/i.test(n)) return true;
    if (/sibling/i.test(n)) return true;
    const geom = P.geom;
    const thick = geom.r1 - geom.r0;
    const midA = (geom.a0 + geom.a1) / 2;
    return geom.r0 >= 140 && thick <= 55 && Math.sin(midA) < -0.45;
  }

  /* Keep every parent/sibling line ≥ gap from the vertical centre divider (x = cx).
     Never drop words: if a clamp would clip a line, reflow the full source name
     with earlier wraps (e.g. "With A" on its own line) so every word stays. */
  function fanClearCentreDivider(placements, measure) {
    const GAP = 6;
    placements.forEach((P) => {
      if (fanIsNotRecorded(P.g.dataset.name)) return;
      if (P.placed.addShort) return;
      if (fanIsSiblingBand(P)) return;
      const fs = P.placed.fs, geom = P.geom;
      const words = String(P.g.dataset.name || '').split(/\s+/).filter(Boolean);
      if (!words.length) return;
      const joinedNow = P.placed.lines.map((l) => l.text).join(' ').split(/\s+/).filter(Boolean);
      const wordsIntact = joinedNow.join(' ') === words.join(' ');
      const cache = {};
      let needReflow = !wordsIntact;
      P.placed.lines.forEach((l) => {
        const half = measure(l.text, fs) * 1.15 / 2 + 1.5;
        if (l.x <= geom.cx) {
          const maxX = geom.cx - GAP - half;
          if (l.x > maxX) l.x = maxX;
        } else {
          const minX = geom.cx + GAP + half;
          if (l.x < minX) l.x = minX;
        }
        const slot = fanOpen(fanSlot(geom, l.y, fs, cache, 2.0), fs, geom);
        if (!slot) { needReflow = true; return; }
        const lo = slot.x - slot.w / 2, hi = slot.x + slot.w / 2;
        if (l.x - half < lo - 0.5 || l.x + half > hi + 0.5) needReflow = true;
      });
      if (!needReflow) return;
      const reflowed = fanReflowForDivider(words, fs, geom, measure, P.placed.lines);
      if (reflowed && reflowed.length) {
        P.placed.lines = reflowed;
        P.placed.shown = words.join(' ');
      }
    });
  }
  /* Pack every source word onto lines that each clear GAP=6 from cx and fit the chord. */
  function fanReflowForDivider(words, fs, geom, measure, seedLines) {
    const GAP = 6;
    const lineH = fanLineH(fs);
    const midA = (geom.a0 + geom.a1) / 2;
    const s = Math.sin(midA);
    /* Upper fan: subsequent lines go downward (larger y). */
    const yStep = (s < 0 ? 1 : -1) * lineH;
    let y0 = seedLines && seedLines.length ? seedLines[0].y
      : geom.cy + ((geom.r0 + geom.r1) / 2) * s;
    const preferLeft = Math.cos(midA) < 0;
    const cache = {};
    const lines = [];
    let i = 0;
    let y = y0;
    let guard = 0;
    while (i < words.length && guard++ < 40) {
      const slot = fanOpen(fanSlot(geom, y, fs, cache, 2.0), fs, geom);
      if (!slot) { y += yStep; continue; }
      const lo = slot.x - slot.w / 2, hi = slot.x + slot.w / 2;
      let take = 0;
      let bestText = '';
      let bestX = preferLeft ? Math.min(fanBisectX(geom, y), (lo + hi) / 2) : Math.max(fanBisectX(geom, y), (lo + hi) / 2);
      for (let j = i; j < words.length; j++) {
        const cand = words.slice(i, j + 1).join(' ');
        const half = measure(cand, fs) * 1.15 / 2 + 1.5;
        let x = preferLeft ? geom.cx - GAP - half : geom.cx + GAP + half;
        /* Stay on the wedge side of cx; also prefer bisector when it already clears GAP. */
        const bis = fanBisectX(geom, y);
        if (preferLeft) {
          x = Math.min(bis, geom.cx - GAP - half);
          if (x - half < lo - 0.5) break;
          if (x + half > Math.min(hi, geom.cx - GAP) + 0.5) break;
        } else {
          x = Math.max(bis, geom.cx + GAP + half);
          if (x + half > hi + 0.5) break;
          if (x - half < Math.max(lo, geom.cx + GAP) - 0.5) break;
        }
        take = j - i + 1;
        bestText = cand;
        bestX = x;
      }
      if (!take) {
        /* Single word must still be emitted (never drop); clamp into the chord as well as possible. */
        bestText = words[i];
        take = 1;
        const half = measure(bestText, fs) * 1.15 / 2 + 1.5;
        if (preferLeft) {
          bestX = Math.min(fanBisectX(geom, y), geom.cx - GAP - half, hi - half);
          bestX = Math.max(bestX, lo + half);
        } else {
          bestX = Math.max(fanBisectX(geom, y), geom.cx + GAP + half, lo + half);
          bestX = Math.min(bestX, hi - half);
        }
      }
      lines.push({ text: bestText, x: bestX, y: y });
      i += take;
      y += yStep;
    }
    return i >= words.length ? lines : null;
  }

  function fitFanText() {
    const svg = document.querySelector('#breeding-view svg.b57-svg.fan');
    if (!svg) return;
    const vb = (svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) || 380;
    const scale = svg.getBoundingClientRect().width / vb;
    if (!(scale > 0.05)) return;
    const floor = 9 / scale;
    const family = getComputedStyle(svg).fontFamily || 'sans-serif';
    const ctx = document.createElement('canvas').getContext('2d');
    const measure = (text, fs) => { ctx.font = fs + 'px ' + family; return ctx.measureText(String(text)).width; };
    const ns = 'http://www.w3.org/2000/svg';
    const groups = [...svg.querySelectorAll('g.b57-seg[data-fan]')];
    const placements = groups.map((g) => {
      const geom = { cx: +g.dataset.cx, cy: +g.dataset.cy, r0: +g.dataset.r0, r1: +g.dataset.r1, a0: +g.dataset.a0, a1: +g.dataset.a1 };
      return { g, geom, placed: fanPlace(g.dataset.name || '', g.dataset.detail || '', geom, floor, measure) };
    });
    fanResolve(placements, measure);
    fanUnifyX(placements, measure);
    fanTightenEmpty(placements, floor, measure);
    placements.forEach((P) => {
      if (fanIsOuterSideGrand(P.geom) && fanIsNotRecorded(P.g.dataset.name)) {
        P.placed = fanOuterAddPlace(P.geom, floor, measure);
        const detail = P.g.dataset.detail || '';
        const aria = detail ? ('+ Not recorded · ' + detail) : '+ Not recorded';
        P.g.setAttribute('aria-label', aria);
        P.g.setAttribute('title', 'Not recorded');
        return;
      }
      if (fanIsSiblingBand(P)) return;
      if (fanIsNotRecorded(P.g.dataset.name) || (P.geom.r1 - P.geom.r0) > 70) {
        fanNudgeInBand(P, measure);
      }
    });
    /* If an empty two-line block still breaches CLEAR, shrink type and re-seat;
       at floor, fall back to a single mid-band line so both arcs clear CLEAR=4. */
    placements.forEach((P) => {
      if (!fanIsNotRecorded(P.g.dataset.name) || P.placed.addShort) return;
      const geom = P.geom;
      const plus = fanIsEmpty(P.g.dataset.name);
      const radBad = () => {
        const fs = P.placed.fs;
        const asc = fs * 1.15, desc = fs * 0.35;
        let bad = false;
        P.placed.lines.forEach((l) => {
          const half = measure(l.text, fs) * 1.1 / 2 + 2;
          [[l.x - half, l.y - asc], [l.x + half, l.y - asc], [l.x - half, l.y + desc], [l.x + half, l.y + desc]].forEach((pt) => {
            const r = Math.hypot(pt[0] - geom.cx, pt[1] - geom.cy);
            if (r < geom.r0 + 4 - 0.05 || r > geom.r1 - 4 + 0.05) bad = true;
          });
        });
        return bad;
      };
      for (let guard = 0; guard < 6; guard++) {
        if (!radBad()) break;
        if (P.placed.fs <= floor + 0.05) break;
        const next = Math.max(floor, Math.round((P.placed.fs - 0.5) * 10) / 10);
        const hit = fanEmpty(geom, next, measure, plus);
        if (hit) P.placed = hit;
        else { P.placed.fs = next; }
        fanNudgeInBand(P, measure);
      }
      if (radBad()) {
        const fs = Math.max(floor, P.placed.fs);
        const hit = fanEmpty(geom, fs, measure, false);
        if (hit) {
          /* shown must match concatenated tspan text (space-insensitive) for the cut gate. */
          P.placed = hit;
          fanNudgeInBand(P, measure);
        }
      }
      /* Walk empty block along y to maximise min(clearIn, clearOut). */
      if (!P.placed.addShort && P.placed.lines.length) {
        const fs = P.placed.fs;
        const asc = fs * 1.15, desc = fs * 0.35;
        const clearance = () => {
          let cIn = 1e9, cOut = 1e9;
          P.placed.lines.forEach((l) => {
            const half = measure(l.text, fs) * 1.1 / 2 + 2;
            [[l.x - half, l.y - asc], [l.x + half, l.y - asc], [l.x - half, l.y + desc], [l.x + half, l.y + desc]].forEach((pt) => {
              const r = Math.hypot(pt[0] - geom.cx, pt[1] - geom.cy);
              cIn = Math.min(cIn, r - geom.r0);
              cOut = Math.min(cOut, geom.r1 - r);
            });
          });
          return Math.min(cIn, cOut);
        };
        const base = P.placed.lines.map((l) => l.y);
        let best = clearance(), bestDy = 0;
        for (let dy = -14; dy <= 14; dy++) {
          P.placed.lines.forEach((l, i) => { l.y = base[i] + dy; });
          const sc = clearance();
          if (sc > best) { best = sc; bestDy = dy; }
        }
        P.placed.lines.forEach((l, i) => { l.y = base[i] + bestDy; });
      }
    });
        fanClearCentreDivider(placements, measure);
    placements.forEach(({ g, placed }) => {
      const sig = placed.fs.toFixed(2) + '|' + placed.lines.map((l) => l.text + '@' + l.x.toFixed(1) + ',' + l.y.toFixed(1)).join('/');
      if (g.dataset.fit === sig) return;
      [...g.querySelectorAll('text')].forEach((n) => n.remove());
      const text = document.createElementNS(ns, 'text');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 't1');
      text.setAttribute('data-full', placed.shown);
      text.style.fontSize = placed.fs + 'px';
      text.style.fontFamily = family;
      placed.lines.forEach((l) => {
        const sp = document.createElementNS(ns, 'tspan');
        sp.setAttribute('x', l.x.toFixed(1));
        sp.setAttribute('y', l.y.toFixed(1));
        sp.textContent = l.text;
        text.appendChild(sp);
      });
      g.appendChild(text);
      g.dataset.fit = sig;
    });
  }

  /* Shrink empty-slot type until each line's measured width clears the
     CLEAR=4 chord at that baseline (canvas + pad approximates getBBox). */
  function fanTightenEmpty(placements, floor, measure) {
    const CLEAR = 4;
    placements.forEach((P) => {
      if (!fanIsNotRecorded(P.g.dataset.name)) return;
      let guard = 0;
      while (guard++ < 10) {
        const cache = {};
        let ok = true;
        P.placed.lines.forEach((l) => {
          const slot = fanOpen(fanSlot(P.geom, l.y, P.placed.fs, cache, CLEAR), P.placed.fs, P.geom);
          if (!slot) { ok = false; return; }
          const half = measure(l.text, P.placed.fs) * 1.12 / 2 + 1.5;
          if (l.x - half < slot.x - slot.w / 2 - 0.2 || l.x + half > slot.x + slot.w / 2 + 0.2) ok = false;
        });
        if (ok) break;
        if (P.placed.fs <= floor + 0.05) break;
        P.placed.fs = Math.max(floor, Math.round((P.placed.fs - 0.5) * 10) / 10);
      }
    });
  }
  function fanLineH(fs) { return fs * 1.72; }
  function fanIsEmpty(name) { return String(name || '') === '+ Not recorded'; }
  function fanIsNotRecorded(name) {
    const n = String(name || '');
    return n === '+ Not recorded' || n === 'Not recorded';
  }
  function fanPlace(name, detail, geom, floor, measure) {
    const wordsOf = (t) => String(t || '').split(/\s+/).filter(Boolean);
    const sizes = [];
    for (let fs = Math.max(11, Math.ceil(Math.max(floor, 10) * 2) / 2); fs >= floor - 0.05; fs -= 0.5) sizes.push(Math.round(fs * 10) / 10);
    if (!sizes.length || sizes[sizes.length - 1] > floor + 0.05) sizes.push(Math.round(floor * 10) / 10);
    const empty = fanIsEmpty(name);
    const notRec = fanIsNotRecorded(name);
    if (notRec) {
      const plus = empty;
      for (let i = 0; i < sizes.length; i++) {
        const hit = fanEmpty(geom, sizes[i], measure, plus);
        if (hit) return hit;
      }
      return fanEmptyForced(geom, sizes[sizes.length - 1], measure, plus);
    }
    const nameWords = wordsOf(name);
    const detailTries = [];
    const detailWords = wordsOf(detail);
    const role = String(detail || '').split(' · ')[0];
    const roleWords = wordsOf(role);
    if (detailWords.length) detailTries.push(detailWords);
    if (roleWords.length && roleWords.join(' ') !== detailWords.join(' ')) detailTries.push(roleWords);
    detailTries.push([]);
    let found = null;
    sizes.forEach((fs) => {
      if (found) return;
      for (let d = 0; d < detailTries.length; d++) {
        found = fanSearch(nameWords, detailTries[d], fs, geom, measure);
        if (found) return;
      }
    });
    if (found) return found;
    for (let n = nameWords.length - 1; n >= 1; n--) {
      const shortened = nameWords.slice(0, n);
      shortened[shortened.length - 1] = shortened[shortened.length - 1].replace(/…$/, '') + '…';
      found = fanSearch(shortened, [], sizes[sizes.length - 1], geom, measure);
      if (found) { found.shown = shortened.join(' '); return found; }
    }
    const fs = sizes[sizes.length - 1];
    const midA = (geom.a0 + geom.a1) / 2;
    const midR = (geom.r0 + geom.r1) / 2;
    const word = (nameWords[0] || name).replace(/…$/, '') + (nameWords.length > 1 ? '…' : '');
    return { fs, shown: word, lines: [{ text: word, x: geom.cx + midR * Math.cos(midA), y: geom.cy + midR * Math.sin(midA) }] };
  }
  function fanEmpty(geom, fs, measure, plus) {
    plus = plus !== false;
    /* lineH keeps same-label AABBs from overlapping (visual gate); CLEAR=4 on both arcs. */
    const lineH = fs * 1.45;
    const line0 = plus ? '+ Not' : 'Not';
    const line1 = 'recorded';
    const shown = plus ? '+ Not recorded' : 'Not recorded';
    const half0 = measure(line0, fs) * 1.1 / 2 + 2;
    const half1 = measure(line1, fs) * 1.1 / 2 + 2;
    const need = [half0 * 2, half1 * 2];
    const cache = {};
    const CLEAR = 4;
    const asc = fs * 1.15, desc = fs * 0.35;
    const midA = (geom.a0 + geom.a1) / 2;
    const midR = (geom.r0 + geom.r1) / 2;
    const top0 = geom.cy - geom.r1 + fs;
    const top1 = geom.cy - lineH - 4;
    let best = null;
    for (let top = top0; top <= top1; top += 1) {
      const y0 = top;
      const y1 = top + lineH;
      const s0 = fanOpen(fanSlot(geom, y0, fs, cache, CLEAR), fs, geom);
      const s1 = fanOpen(fanSlot(geom, y1, fs, cache, CLEAR), fs, geom);
      if (!s0 || !s1) continue;
      if (s0.w < need[0] + 0.5 || s1.w < need[1] + 0.5) continue;
      const xLo = Math.max(s0.x - s0.w / 2 + half0, s1.x - s1.w / 2 + half1);
      const xHi = Math.min(s0.x + s0.w / 2 - half0, s1.x + s1.w / 2 - half1);
      if (xHi < xLo - 0.05) continue;
      let x = fanBisectX(geom, (y0 + y1) / 2);
      if (x < xLo) x = xLo;
      if (x > xHi) x = xHi;
      const corners = [
        [x - half0, y0 - asc], [x + half0, y0 - asc], [x - half0, y0 + desc], [x + half0, y0 + desc],
        [x - half1, y1 - asc], [x + half1, y1 - asc], [x - half1, y1 + desc], [x + half1, y1 + desc]
      ];
      let radOk = true;
      for (let i = 0; i < corners.length; i++) {
        const r = Math.hypot(corners[i][0] - geom.cx, corners[i][1] - geom.cy);
        if (r < geom.r0 + CLEAR - 0.05 || r > geom.r1 - CLEAR + 0.05) { radOk = false; break; }
      }
      if (!radOk) continue;
      const lines = [{ text: line0, x, y: y0 }, { text: line1, x, y: y1 }];
      if (!fanClear(lines, fs, geom, measure)) continue;
      const yMid = (y0 + y1) / 2;
      const ty = geom.cy + midR * Math.sin(midA);
      const low = (Math.sin(midA) < 0) ? Math.max(0, yMid - ty) : Math.max(0, ty - yMid);
      const score = Math.abs(yMid - ty) + low * 1.25;
      if (!best || score < best.score) best = { score, fs, lines, shown };
    }
    return best;
  }

  function fanEmptyForced(geom, fs, measure, plus) {
    plus = plus !== false;
    const lineH = fs * 1.45;
    const line0 = plus ? '+ Not' : 'Not';
    const shown = plus ? '+ Not recorded' : 'Not recorded';
    const CLEAR = 4;
    const midA = (geom.a0 + geom.a1) / 2;
    const midR = (geom.r0 + geom.r1) / 2;
    /* Prefer mid-band so both arcs have room; nudge will refine. */
    let yMid = geom.cy + midR * Math.sin(midA);
    const y0 = yMid - lineH / 2;
    const y1 = yMid + lineH / 2;
    let x = fanBisectX(geom, yMid);
    const cache = {};
    const s0 = fanOpen(fanSlot(geom, y0, fs, cache, CLEAR), fs, geom);
    const s1 = fanOpen(fanSlot(geom, y1, fs, cache, CLEAR), fs, geom);
    if (s0 && s1) {
      const half0 = measure(line0, fs) * 1.1 / 2 + 2;
      const half1 = measure('recorded', fs) * 1.1 / 2 + 2;
      const xLo = Math.max(s0.x - s0.w / 2 + half0, s1.x - s1.w / 2 + half1);
      const xHi = Math.min(s0.x + s0.w / 2 - half0, s1.x + s1.w / 2 - half1);
      if (xHi >= xLo) { if (x < xLo) x = xLo; if (x > xHi) x = xHi; }
    }
    return {
      fs, shown: shown,
      lines: [
        { text: line0, x, y: y0 },
        { text: 'recorded', x, y: y1 }
      ]
    };
  }


  function fanSearch(primary, secondary, fs, geom, measure) {
    const lineH = fanLineH(fs);
    const maxLines = Math.min(6, primary.length + (secondary.length ? 2 : 0));
    const midA = (geom.a0 + geom.a1) / 2;
    const midR = (geom.r0 + geom.r1) / 2;
    const tx = geom.cx + midR * Math.cos(midA);
    const ty = geom.cy + midR * Math.sin(midA);
    const cache = {};
    let best = null;
    for (let detailLines = 0; detailLines <= (secondary.length ? 2 : 0); detailLines++) {
      for (let nameLines = 1; nameLines <= Math.min(5, primary.length); nameLines++) {
        if (nameLines + detailLines > maxLines) continue;
        const top0 = geom.cy - geom.r1 + fs;
        const top1 = geom.cy - 8;
        for (let top = top0; top <= top1; top += 2) {
          const slots = [];
          let ok = true;
          for (let i = 0; i < nameLines + detailLines; i++) {
            const y = top + i * lineH;
            const slot = fanOpen(fanSlot(geom, y, fs, cache, 2.0), fs, geom);
            if (!slot) { ok = false; break; }
            slots.push(slot);
          }
          if (!ok) continue;
          const nameOut = fanPour(primary, slots.slice(0, nameLines), fs, measure);
          if (!nameOut) continue;
          const detailOut = detailLines ? fanPour(secondary, slots.slice(nameLines), fs, measure) : [];
          if (detailLines && !detailOut) continue;
          const lines = nameOut.concat(detailOut || []);
          if (!fanClear(lines, fs, geom, measure)) continue;
          if (!fanInside(lines, fs, geom, measure, cache)) continue;
          const cyb = lines.reduce((s, l) => s + l.y, 0) / lines.length;
          const cxb = lines.reduce((s, l) => s + l.x, 0) / lines.length;
          const score = Math.hypot(cxb - tx, cyb - ty) + detailLines * 0.01 - nameLines * 0.02;
          if (!best || score < best.score) best = { score, fs, lines, shown: lines.map((l) => l.text).join(' ') };
        }
      }
    }
    return best;
  }
  function fanOpen(slot, fs, geom) {
    if (!slot) return null;
    let L = slot.x - slot.w / 2;
    let R = slot.x + slot.w / 2;
    const top = slot.y - fs * 0.95;
    const bot = slot.y + fs * 0.35;
    const guard = 58;
    if (bot > geom.cy - guard && top < geom.cy + guard) {
      const cL = geom.cx - guard;
      const cR = geom.cx + guard;
      if (L < cR && R > cL) {
        if (slot.x < geom.cx) R = Math.min(R, cL - 3);
        else L = Math.max(L, cR + 3);
      }
    }
    if (R - L < Math.max(10, fs)) return null;
    return { x: (L + R) / 2, y: slot.y, w: R - L };
  }
  function fanClear(lines, fs, geom, measure) {
    const guard = 58;
    const cL = geom.cx - guard, cR = geom.cx + guard, cT = geom.cy - guard, cB = geom.cy + guard;
    return lines.every((l) => {
      const half = measure(l.text, fs) / 2 + 2;
      const top = l.y - fs * 0.95;
      const bot = l.y + fs * 0.35;
      return !(l.x - half < cR && l.x + half > cL && top < cB && bot > cT);
    });
  }
  function fanInside(lines, fs, geom, measure, cache) {
    return lines.every((l) => {
      const slot = fanSlot(geom, l.y, fs, cache, 2.0);
      if (!slot) return false;
      const half = measure(l.text, fs) / 2 + 1.2;
      return (l.x - half) >= (slot.x - slot.w / 2) - 0.8 && (l.x + half) <= (slot.x + slot.w / 2) + 0.8;
    });
  }
  function fanPour(words, slots, fs, measure) {
    if (!words.length || !slots.length) return null;
    const lines = [];
    let i = 0;
    for (let s = 0; s < slots.length && i < words.length; s++) {
      let cur = '';
      while (i < words.length) {
        const next = cur ? cur + ' ' + words[i] : words[i];
        if (measure(next, fs) > slots[s].w - 1) break;
        cur = next; i++;
      }
      if (!cur) return null;
      lines.push({ text: cur, x: slots[s].x, y: slots[s].y });
    }
    return i >= words.length ? lines : null;
  }
  function fanSlot(geom, y, fs, cache, inset) {
    inset = inset == null ? 2.0 : inset;
    const rIn = geom.r0 + inset;
    const rOut = geom.r1 - inset;
    if (rOut <= rIn + 1) return null;
    const ang = inset / Math.max(12, (rIn + rOut) / 2);
    const b0 = geom.a0 + ang;
    const b1 = geom.a1 - ang;
    if (b1 <= b0 + 0.03) return null;
    const ys = [y - fs * 0.95, y, y + fs * 0.3];
    let L = -1e9, R = 1e9;
    for (let k = 0; k < ys.length; k++) {
      const key = inset.toFixed(1) + ':' + (Math.round(ys[k] * 2) / 2);
      if (!Object.prototype.hasOwnProperty.call(cache, key)) cache[key] = fanSlice(geom.cx, geom.cy, rIn, rOut, b0, b1, ys[k]) || 0;
      const span = cache[key];
      if (!span) return null;
      L = Math.max(L, span[0]);
      R = Math.min(R, span[1]);
    }
    if (R - L < 8) return null;
    return { x: (L + R) / 2, y, w: R - L };
  }
  function fanSlice(cx, cy, rIn, rOut, b0, b1, y) {
    let left = null, right = null;
    for (let x = cx - rOut; x <= cx + rOut; x += 0.5) {
      const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy);
      if (r < rIn || r > rOut) continue;
      let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI * 2;
      if (a < b0 - 0.015 || a > b1 + 0.015) continue;
      if (left == null) left = x;
      right = x;
    }
    if (left == null || right - left < 6) return null;
    return [left + 1.2, right - 1.2];
  }
  function fanBoxes(placed, measure) {
    const fs = placed.fs;
    return placed.lines.map((l) => {
      const w = measure(l.text, fs);
      return { l: l.x - w / 2, r: l.x + w / 2, t: l.y - fs * 0.95, b: l.y + fs * 0.35 };
    });
  }
  function fanHits(a, b) {
    return a.l < b.r - 0.8 && a.r > b.l + 0.8 && a.t < b.b - 0.8 && a.b > b.t + 0.8;
  }
  function fanResolve(placements, measure) {
    const isNR = (P) => fanIsNotRecorded(P.g.dataset.name);
    const dropLine = (P) => {
      /* Never drop name words (sibling/parent labels must stay word-intact). */
      if (isNR(P)) return false;
      return false;
    };
    const nudgeUp = (P, dy) => {
      if (!isNR(P)) return false;
      P.placed.lines.forEach((l) => { l.y -= dy; });
      return true;
    };
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let i = 0; i < placements.length; i++) {
        for (let j = i + 1; j < placements.length; j++) {
          const A = placements[i], B = placements[j];
          const boxesA = fanBoxes(A.placed, measure);
          const boxesB = fanBoxes(B.placed, measure);
          let hit = false;
          boxesA.forEach((a) => boxesB.forEach((b) => { if (fanHits(a, b)) hit = true; }));
          if (!hit) continue;
          /* Prefer shortening the longer parent/sibling label; nudge Not-recorded up if needed. */
          const parentish = !isNR(A) ? A : !isNR(B) ? B : null;
          const nr = isNR(A) ? A : isNR(B) ? B : null;
          if (parentish && dropLine(parentish)) { moved = true; continue; }
          if (nr && nudgeUp(nr, fanLineH(nr.placed.fs) * 0.55)) { moved = true; continue; }
          if (dropLine(A) || dropLine(B)) moved = true;
        }
      }
      if (!moved) break;
    }
  }

  function fitTree() {
    if (fitting) return;
    fitting = true;
    try {
      fitTreeNow();
      fitFanText();
    } catch (e) { /* */ } finally {
      setTimeout(() => { fitting = false; }, 0);
    }
  }
  function fitTreeNow() {
    const root = document.querySelector('#breeding-view .b57[data-b57s]');
    document.querySelectorAll('#breeding-view .b57.b63-reserved').forEach((el) => {
      if (el !== root) { el.style.paddingBottom = ''; el.classList.remove('b63-reserved', 'b63-compact', 'b63-squeeze'); }
    });
    if (!root) return;
    const bar = document.getElementById('tabbar');
    const box = bar ? bar.getBoundingClientRect() : null;
    const covers = !!(box && box.height >= 24 && box.bottom >= window.innerHeight - 12 && box.top >= window.innerHeight * 0.5);
    const tabH = covers ? Math.ceil(box.height) : 0;
    root.classList.add('b63-reserved');
    root.classList.toggle('b63-compact', window.innerWidth <= 480);
    root.classList.toggle('b63-squeeze', covers && window.innerWidth <= 480 && window.innerHeight >= 780);
    root.style.setProperty('--b63-tab-h', tabH + 'px');
    root.style.paddingBottom = 'calc(' + tabH + 'px + env(safe-area-inset-bottom))';
    const canvas = root.querySelector('.b57-canvas');
    if (!canvas) return;
    const pg = window.B18 && B18.brPage;
    const userZoom = pg && pg.zoom ? Number(pg.zoom) : 1;
    const squeeze = covers && window.innerWidth <= 480 && window.innerHeight >= 780;
    if (!squeeze) {
      if (canvas.dataset.b63fit) { delete canvas.dataset.b63fit; canvas.style.zoom = String(userZoom); }
      return;
    }
    const tabTop = box.top;
    const fan = root.getAttribute('data-b57k') === 'azulejo';
    const sel = fan ? '.b57-ban small, .b57-ban, .b57-row.gp, .b57-row.par, .b57-me, .b57-ph.big' : '.b57-ban small, .b57-ban, .b57-row.gp, .b57-row.par, .b57-me';
    const floor = fan ? 0.28 : 0.45;
    /* Viewport bottoms plus ancestor scroll, so a scrolled fan is fitted
       for the initial view. At scroll 0 this is the same measurement as before. */
    const restBottom = (el) => {
      let y = el.getBoundingClientRect().bottom; let n = el.parentElement;
      while (n) { y += n.scrollTop || 0; n = n.parentElement; }
      return y;
    };
    let changed = false;
    for (let step = 0; step < 6; step++) {
      const parts = [...root.querySelectorAll(sel)].filter((el) => el.getClientRects().length);
      if (!parts.length) return;
      const lowest = Math.max.apply(null, parts.map(restBottom));
      if (lowest <= tabTop - 2) { canvas.dataset.b63fit = canvas.dataset.b63fit || '1'; break; }
      const cTop = restBottom(canvas) - canvas.getBoundingClientRect().height;
      const need = lowest - cTop;
      const have = tabTop - 2 - cTop;
      if (need <= 8 || have < 120) break;
      const current = Number(canvas.style.zoom) || userZoom;
      const next = Math.max(userZoom * floor, Math.min(current, current * (have / need)));
      const rounded = Math.round(next * 1000) / 1000;
      if (rounded >= current - 0.004) { canvas.dataset.b63fit = String(rounded / userZoom); break; }
      canvas.style.zoom = String(rounded);
      canvas.dataset.b63fit = String(Math.round((rounded / userZoom) * 1000) / 1000);
      changed = true;
    }
    if (changed) window.dispatchEvent(new Event('resize'));
  }
  const treeView = document.getElementById('breeding-view');
  if (treeView) new MutationObserver(() => { try { fitTree(); } catch (e) { /* */ } }).observe(treeView, { childList: true, subtree: true });
  window.addEventListener('resize', () => { try { fitTree(); } catch (e) { /* */ } });
  setInterval(() => { try { addTab(); addSide(); profileBtn(); mark(); keepTitleGlyph(); fitTree(); } catch (e) { console.warn('b57 entry', e); } }, 300);
  window.B57 = { walk, detailKey, resolveKey, partners, rec, name, same, isUnk, ph, mono, rr: () => renderBreeding(), openLineage, lineageList, candidates, par2, stat, popOf, styles: STYLES, styleOf, assign, ancestors, siblings, kids, photo, fitTree };
})();
