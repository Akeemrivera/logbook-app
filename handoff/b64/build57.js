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
  const same = (a, b) => a === b || (!!a && !!b && low(name(a)) !== '' && low(name(a)) === low(name(b)));
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
  /* b64 (Elio, Nov 10): a parent slot that only says "Not recorded" is missing, not a plant: it never makes an S1 or a backcross. */
  const isPh = (k) => !k || /^(not recorded|unknown|\?+|none|n\/a)$/i.test(String(name(k) || '').trim());
  const isUnk = (k) => !k || (String(k).startsWith('tx:') && (UNK.test(String(k).slice(3).trim()) || !String(k).slice(3).trim()));
  /* b64 (Elio, Nov 10): "Deleted plant (name kept)" only when a deletion of that parent is really on record; otherwise the name was typed in. */
  function recordedDeletion(k) {
    const text = String(k || ''); if (!text.startsWith('dx:')) return false; const nm = text.slice(3); if (!nm) return false;
    return [state.plants, state.breedingPlants, state.motherFatherPlants, state.breedingProjects].some((a) => (a || []).some((r) => {
      const book = r && r.b58DeletedParents; if (!book || typeof book !== 'object') return false;
      return ['m', 'f'].some((side) => { const e = book[side]; return !!(e && typeof e === 'object' && e.key && e.name === nm); });
    }));
  }
  /* b64: a typed-in parent of a plant whose seeds are noted as bought reads "Bought seeds, not linked"; its cross line adds "· bought seeds, not linked". */
  const boughtSeeds = (via) => { const v = String(via || ''); if (!/^(pl|bp):/.test(v)) return false; const r = rec(v); return !!(r && r.source === 'seed' && /\b(bought|purchased?)\b/i.test(String(r.seedSource || ''))); };
  function stat(k, via) {
    if (isUnk(k)) return { t: 'unknown', l: 'Unknown · open pollination / mixed pollen' };
    /* b58: "Deleted plant" only for a recorded deletion (dx:). A typed name with no plant behind it is bought genetics. */
    if (String(k).startsWith('dx:')) return recordedDeletion(k) ? { t: 'removed', l: 'Deleted plant (name kept)' } : boughtSeeds(via) ? { t: 'nameonly', l: 'Bought seeds, not linked', seeds: 1 } : { t: 'nameonly', l: 'Name only · not linked' };
    const r = rec(k); if (String(k).startsWith('tx:')) return { t: 'bought', l: 'Bought genetics · From another breeder', br: '' };
    if (!r) return { t: 'removed', l: 'Deleted plant' };
    if (r.deleted) return { t: 'removed', l: 'Deleted plant (name kept)' };
    if (r.boughtGenetics) return { t: 'bought', l: `Bought genetics · ${r.breeder ? r.breeder : 'From another breeder'}`, br: r.breeder || '' };
    /* b64 (Elio, Nov 10): a mother/father marked Retired says Retired, as b63 did. */
    if (/^retired$/i.test(String(r.status || ''))) return { t: 'retired', l: 'Retired' };
    if (r.archived || /archiv|cull/i.test(String(r.status || '')) || (r.grade && r.grade.verdict === 'cull')) return { t: 'culled', l: 'Culled · lineage kept' };
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
        const s1 = p[0] && p[1] && !isPh(p[0]) && same(p[0], p[1]);
        p.forEach((k, i) => { if (s1 && i === 1) { row.push({ k: '', self: 1, via: x.k, side: 'f', role: `Self-pollinated (S1) · same as ${nm2(p[0])}` }); return; }
          if (!k) { row.push({ k: '', none: 1, via: x.k, side: i ? 'f' : 'm', role: `${rl(g, i)} · not recorded` }); return; }
          if (!isUnk(k) && !isPh(k) && seen.some((q) => same(q, k))) { if (!row.some((y) => y.ref && same(y.k, k))) row.push({ k, ref: 1, via: x.k, side: i ? 'f' : 'm', role: `${rl(g, i)} · appears again (backcross)` }); return; }
          if (!isUnk(k)) seen.push(k); row.push({ k, via: x.k, side: i ? 'f' : 'm', role: rl(g, i) }); }); });
      if (!row.length) break; lv.push(row);
    }
    return lv;
  }
  function rl(g, i) { const w = i ? 'father' : 'mother'; const W = i ? 'Father' : 'Mother'; if (g === 1) return W; if (g === 2) return 'Grand' + w; if (g === 3) return 'Great-grand' + w; return `${g - 2}× great-grand${w}`; }
  function isCloneKey(c) {
    const r = rec(c);
    return !!(r && ((typeof isClonePlant === 'function' && isClonePlant(r)) || r.source === 'clone'));
  }
  /* Render-time only: hide the one false name-only sample partner and kids that
     exist only through that pairing. No record is edited or deleted. The key is
     matched by a one-way hash so the private name is not stored in public code. */
  function idHash(str){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0,ch;i<str.length;i++){ch=str.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}h1=Math.imul(h1^(h1>>>16),2246822507);h1^=Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507);h2^=Math.imul(h1^(h1>>>13),3266489909);return 4294967296*(2097151&h2)+(h1>>>0);}
  const FALSE_SAMPLE_HASH = 7035164769914232;
  const isFalseSampleKey = (x) => idHash(String(x || '').toLowerCase()) === FALSE_SAMPLE_HASH;
  function isFalseSample(k) {
    const key = String(k || '');
    if (isFalseSampleKey(key)) return true;
    const p = par2(key);
    return !!(p && p.some((x) => isFalseSampleKey(x)));
  }
  function siblings(k) {
    /* Exclude self. Dedupe by id (same()). Production clones are not siblings
       of the mother they were cut from — they are production runs. */
    const p = par2(k); if (!p) return [];
    const out = [];
    [p[0], p[1]].forEach((pp) => (B49.children(pp) || []).forEach((c) => {
      if (!c || same(c, k) || isCloneKey(c) || isFalseSample(c)) return;
      const q = B49.par(c);
      if (q && same(q[0], p[0]) && same(q[1], p[1]) && !out.some((o) => same(o, c))) out.push(c);
    }));
    return out;
  }
  function kids(k) {
    /* b59: seed offspring only. Clones stay on the plant profile and in clone runs, never on the tree. */
    const isCl = (c) => isCloneKey(c);
    return (B49.children(k) || []).filter((c) => !isCl(c) && !isFalseSample(c)).map((c) => { const lr = c.startsWith('pr:') && B49.linkedRuns ? B49.linkedRuns(c) : []; const t = lr.length === 1 && name(lr[0]) ? name(lr[0]) : name(c);
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
    if (x.none || x.b62) return pnode(x, cls);
    if (x.self) return `<div class="b57-n ${cls} self"${ofA(x)}><span class="b57-ph mono" aria-hidden="true">S1</span><b>Self</b><small>${esc(x.role)}</small></div>`;
    if (!x.k || isUnk(x.k)) return x.via ? `<button type="button" class="b57-n ${cls} unk" data-st="unknown" data-b58="add"${ofA(x)}><span class="b57-ph mono" aria-hidden="true">?</span><b>Unknown</b><small>${esc(x.role ? x.role + ' · ' : '')}open pollination / mixed pollen · tap to change</small></button>` : `<div class="b57-n ${cls} unk" data-st="unknown"><span class="b57-ph mono" aria-hidden="true">?</span><b>Unknown</b><small>${esc(x.role ? x.role + ' · ' : '')}open pollination / mixed pollen</small></div>`;
    const st = stat(x.k, x.via); const tag = x.ref ? '<em class="b57-tag ref">↺ also above</em>' : st.t === 'culled' ? '<em class="b57-tag cull">Culled</em>' : st.t === 'removed' ? '<em class="b57-tag gone">Deleted plant</em>' : st.t === 'bought' ? `<em class="b57-tag bought" data-b58="info" data-k="${esc(x.k)}" role="button" tabindex="0" aria-label="Bought genetics${st.br ? ' from ' + esc(st.br) : ''}. Tap for details">${esc(window.B58 && B58.boughtBadge ? B58.boughtBadge(st.br) : 'Bought')}</em>` : '';
    return `<button type="button" class="b57-n ${cls}${x.ref ? ' ref' : ''}${st.t ? ' st-' + st.t : ''}" data-b57="sel" data-k="${esc(x.k)}"${ofA(x)}${x.sib ? ' data-sib="1"' : ''} data-st="${st.t}">${ph(x.k)}<b>${esc(name(x.k))}</b><small>${sub(x.k, x.role)}${st.l && !x.ref ? ' · ' + esc(st.l) : ''}</small>${tag}</button>`;
  }
  const candNode = (c) => c.k ? `<button type="button" class="b57-n cand keeper" data-b57="sel" data-k="${esc(c.k)}" data-cand="${c.i}">${ph(c.k)}<b>${esc(c.t)}</b><small>${esc(c.s)}</small><em class="b57-tag keep">★ Keeper</em></button>` : `<div class="b57-n cand${c.cull ? ' st-culled' : ''}" data-cand="${c.i}"><span class="b57-ph mono" aria-hidden="true">#${c.i}</span><b>${esc(c.t)}</b><small>${esc(c.s)}</small>${c.cull ? '<em class="b57-tag cull">Cull</em>' : ''}</div>`;
  const kidNode = (x) => x.add ? `<button type="button" class="b57-n kid add b58-only" data-b58="addkid"><span class="b57-ph mono" aria-hidden="true">+</span><b>Add kid</b><small>link a plant as a child</small></button>` : x.k ? `<button type="button" class="b57-n kid" data-b57="sel" data-kid="1" data-k="${esc(x.k)}">${ph(x.k)}<b>${esc(x.t)}</b><small>${esc(x.s)}</small></button>` : `<div class="b57-n kid clone"><span class="b57-ph mono" aria-hidden="true">C</span><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div>`;
  const me = (k) => `<div class="b57-me" data-k="${esc(k)}" data-node="${esc(k)}">${ph(k, 1)}<div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div></div>`;
  const crossTxt = (k) => { const p = par2(k); if (!p) return stat(k).l || 'Starting line'; return (!isPh(p[0]) && same(p[0], p[1])) ? `${nm2(p[0])} selfed (S1)` : p.map((q) => (q ? nm2(q) : 'not recorded')).join(' × ') + ((p.every((q) => q && String(q).startsWith('dx:') && !recordedDeletion(q)) && boughtSeeds(k)) ? ' · bought seeds, not linked' : ''); };
  const lab = (t) => `<div class="b57-lab">${esc(t)}</div>`;
  const row = (arr, f, cls = '') => `<div class="b57-row ${cls}">${arr.map(f).join('')}</div>`;
  /* b64 (Chief, Nov 10): a plant with no parents recorded gets b62's single card, never an empty Mother / Father pair or
     an empty grandparent row: 'Not recorded · Parents of X' (b60 'none' slot), or for a landrace b62's Origin card with
     'Wild ancestors · Not traceable · landrace' above it. Wording exactly as build60.js cell(). */
  const noPar = (k) => { const p = par2(k); return !p || (!p[0] && !p[1]); };
  const isLandK = (k) => !!(window.B60 && B60.isLand && B60.isLand(k));
  const slot62 = (k) => (isLandK(k) ? { b62: 'origin', k, via: k, side: 'm' } : { b62: 'none', via: k, side: 'm' });
  function b62Card(x, cls) {
    if (x.b62 === 'wild') return `<button type="button" class="b57-n ${cls || ''} none add b64-slot wild" data-b58="add" data-of="${esc(x.via)}" data-side="m"><b>Wild ancestors</b><small>Not traceable · landrace</small></button>`;
    if (x.b62 === 'origin') { const c = (window.B60 && B60.country) ? B60.country(x.k) : { c: '' }; const r = rec(x.k) || {}; const ini = (c.c || 'LR').replace(/[^A-Za-z ]/g, '').slice(0, 2).toUpperCase();
      return `<button type="button" class="b57-n ${cls || ''} b64-origin" data-node="origin:${esc(x.k)}" data-b64origin="${esc(x.k)}" data-of="${esc(x.k)}" data-side="m" aria-label="Origin of ${esc(name(x.k))}, open profile"><span class="b57-ph mono" aria-hidden="true">${esc(ini)}</span><b>Landrace${c.c ? ` · ${esc(c.c)}` : ''}</b><small>${esc(r.originRegion || 'Region not recorded')}</small><em class="b57-tag bought">Origin</em></button>`; }
    return `<button type="button" class="b57-n ${cls || ''} none add b64-slot" data-b58="add" data-of="${esc(x.via)}" data-side="m"><b>Not recorded</b><small>Parents of ${esc(name(x.via))}</small></button>`;
  }
  function parentsRow(lv) { const r00 = lv[0][0].k; if (noPar(r00) && !(lv[1] || []).length) return [slot62(r00), null]; const p = lv[1] || []; const r0 = lv[0][0].k; const m = p.find((x) => x.side === 'm') || { k: '', role: 'Mother · not recorded', none: 1, via: r0, side: 'm' }; const f = p.find((x) => x.side === 'f') || { k: '', role: 'Father · not recorded', none: 1, via: r0, side: 'f' }; return [m, f]; }
  const real = (p) => p && p.k && !p.none && !p.ref && !p.self && !isUnk(p.k);
  const gpFor = (lv, p) => { if (!p) return []; if (p.b62 === 'origin') return [{ b62: 'wild', via: p.k, side: 'm' }]; if (p.b62) return []; const g = gpOf(lv, p); if (g.length || !real(p)) return g; if (noPar(p.k)) return rec(p.k) ? [slot62(p.k)] : []; return [{ k: '', none: 1, via: p.k, side: 'm', role: `Mother of ${name(p.k)} · not recorded` }, { k: '', none: 1, via: p.k, side: 'f', role: `Father of ${name(p.k)} · not recorded` }]; };
  const gpAll = (lv, m, f) => [...gpFor(lv, m), ...gpFor(lv, f)];
  const ofA = (x) => (x.via && x.side ? ` data-of="${esc(x.via)}" data-side="${x.side}"` : '');
  const pnode = (x, cls) => (x && x.b62 ? b62Card(x, cls) : x.none && x.via ? `<button type="button" class="b57-n ${cls || ''} none add" data-b58="add"${ofA(x)}><span class="b57-ph mono" aria-hidden="true">+</span><b>Not recorded</b><small>${esc(x.role)} · tap to add</small></button>` : x.none ? `<div class="b57-n ${cls || ''} none"><span class="b57-ph mono" aria-hidden="true">–</span><b>Not recorded</b><small>${esc(x.role)}</small></div>` : node(x, cls));
  const gpOf = (lv, p) => (p && p.k ? (lv[2] || []).filter((x) => x.via === p.k) : []);
  function older(lv, from) {
    if (lv.length <= from) return '';
    return lv.slice(from).map((r, i) => `${lab(`Generation ${from + i} back · ${r.length} plant${r.length > 1 ? 's' : ''}`)}${row(r, (x) => node(x, 'old'), 'scroll')}`).join('');
  }
  /* the population row: pheno-hunt candidates (seed run members, grade + backup clones, keeper) or brothers & sisters */
  function popOf(k) { const c = candidates(k); if (c.length) return { hunt: 1, items: c, keeper: c.find((x) => x.keeper) }; const sb = siblings(k); return { hunt: 0, items: sb.map((x) => ({ k: x, me: same(x, k), role: same(x, k) ? 'this plant' : 'Sibling' })) }; }
  const popNode = (x) => (x.cand ? candNode(x) : node({ k: x.k, role: x.role, sib: !x.me }, x.me ? 'is-me' : 'sib'));
  const popLab = (P, st) => P.hunt ? `Pheno hunt · ${P.items.length} candidate${P.items.length === 1 ? '' : 's'} · ${P.keeper ? 'keeper: ' + (P.keeper.s.split(' · ')[1] || '') : 'no keeper yet'}` : `Brothers & sisters · ${st && st.k === 'roots' ? 'same soil' : 'same seed pop'}`;
  /* b64: an empty brothers & sisters row shows b62's own 'No siblings' line (b57-empty style), never a blank row. */
  const noSib = '<p class="b57-empty b64-nosib">No siblings</p>';
  const popRow = (P) => { const h = P.items.map(popNode).join(''); return (!P.hunt && !h.trim()) ? noSib : `<div class="b57-row scroll pop">${h}</div>`; };
  function nextBranch(P) { if (!P.keeper) return ''; const kk = kids(P.keeper.k); return `${lab(`Next branch · ${name(P.keeper.k)}`)}${row([{ k: P.keeper.k, role: 'Keeper · now a mother' }, ...kk.filter((x) => x.k).map((x) => ({ k: x.k, role: x.s }))], (x) => node(x, 'branch'), 'scroll')}`; }
  const kidsBlock = (ks) => (ks.length ? row([...ks, { add: 1 }], kidNode, 'scroll') : `<p class="b57-empty">No kids recorded yet.</p>${row([{ add: 1 }], kidNode, 'b58-only')}`);
  /* ---------- b59 partner row: this plant × the plant it was bred with, bracket down to its Kids ---------- */
  function partners(k, ks) {
    const G = []; ks.forEach((x) => { if (!x.k || isFalseSample(x.k)) return; const p = par2(x.k) || []; const i = same(p[0], k) ? 0 : same(p[1], k) ? 1 : -1; if (i < 0) return;
      const o = (i === 0 ? p[1] : p[0]) || ''; if (isFalseSample(o) || isFalseSampleKey(o)) return; const self = !!o && same(o, k); const key = isUnk(o) ? '?' : o; if (isFalseSampleKey(key)) return; let g = G.find((y) => (key === '?' ? y.key === '?' : y.key !== '?' && same(y.key, key)));
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
    /* Keep this style's layout. Never inject B60.rows (the two-sided partner chart). */
    const G = partners(k, ks); const rest = ks.filter((x) => !isFalseSample(x.k) && !G.some((g) => g.kids.includes(x)));
    const ban = `<div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>`;
    const visibleKids = ks.filter((x) => !isFalseSample(x.k));
    const kidsOf = (g, i) => o.noKids ? '' : `${o.kidL || lab('Kids')}${row(i === G.length - 1 ? [...g.kids, ...rest, { add: 1 }] : g.kids, kidNode, 'scroll b59-kids')}`;
    if (o.noPair) {
      if (!G.length) return `${o.noMe ? '' : `${o.noLab ? '' : lab('This plant')}${me(k)}`}${o.noKids ? '' : `${o.kidL || lab('Kids')}${kidsBlock(visibleKids)}`}`;
      return G.map((g, i) => {
        const kidsH = kidsOf(g, i);
        const brk = (o.noKids || o.noBrk) ? '' : (o.up ? BRK(1) : BRK(0));
        return kidsH ? (o.up ? `<div class="b59-fam up">${kidsH}${brk}</div>` : `<div class="b59-fam">${brk}${kidsH}</div>`) : '';
      }).join('');
    }
    /* b64 (Elio, Nov 10): Roots (o.up) keeps its crown on top: with no partner and no kids, the empty Kids heading sits above this plant, so the trunk down to the roots crosses no text. */
    if (!G.length && o.up && !visibleKids.length && !o.noKids && !o.noMe) return `${o.kidL || lab('Kids')}${kidsBlock(visibleKids)}${o.noLab ? '' : lab('This plant')}${me(k)}`;
    if (!G.length) return `${o.noMe ? '' : `${o.noLab ? '' : lab('This plant')}${me(k)}`}${o.noKids ? '' : `${o.kidL || lab('Kids')}${kidsBlock(visibleKids)}`}`;
    const bredAttach = (g) => {
      /* Partner attached to a this-plant already drawn by the style (walnut hub).
         No second this-plant circle, and no dangling × — the × lives in the label. */
      if (g.self) return `<div class="b57-bred no-x" data-b59pair="self"><div class="b59-plab"><b>Self-pollinated · S1</b></div></div>`;
      const who = g.key === '?' ? 'Unknown' : name(g.key);
      return `<div class="b57-bred no-x" data-b59pair="${esc(g.key)}">${pairCard(g, k)}<div class="b59-plab"><b>Bred with × ${esc(who)} · ${esc(g.side)}</b></div></div>`;
    };
    const grp = (g, i) => {
      /* First group: Ceiba-style CA × partner, unless the style already shows this plant (o.noMe).
         Later groups omit this plant and omit the ×, so the plant is never drawn twice and no × dangles. */
      let pair;
      if (o.noMe && i === 0) pair = bredAttach(g);
      else if (i > 0) pair = `<div class="b59-pair partner-only no-x" data-b59pair="${esc(g.key)}">${pairCard(g, k)}</div><div class="b59-labs">${pLab(g)}</div>`;
      else pair = `<div class="b59-pair" data-b59pair="${esc(g.key)}"><div class="b59-pc me" data-node="${esc(k)}" data-k="${esc(k)}">${ph(k, 1)}</div>${XB}${pairCard(g, k)}</div><div class="b59-labs">${ban}${pLab(g)}</div>`;
      const kidsH = kidsOf(g, i);
      const brk = (o.noKids || o.noBrk) ? '' : (o.up ? BRK(1) : BRK(0));
      return o.up ? `<div class="b59-fam up">${kidsH}${brk}${pair}</div>` : `<div class="b59-fam">${pair}${brk}${kidsH}</div>`;
    };
    const L = o.noLab ? '' : lab(G.length > 1 ? `This plant · bred with ${G.length} plants` : 'This plant');
    return o.up ? `${G.map(grp).join('')}${L}` : `${L}${G.map(grp).join('')}`;
  }
  /* ---------- SVG ring / fan ---------- */
  const P_ = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  function seg(cx, cy, r0, r1, a0, a1) { const [x0, y0] = P_(cx, cy, r1, a0), [x1, y1] = P_(cx, cy, r1, a1), [x2, y2] = P_(cx, cy, r0, a1), [x3, y3] = P_(cx, cy, r0, a0); const L = a1 - a0 > Math.PI ? 1 : 0; return `M${x0} ${y0}A${r1} ${r1} 0 ${L} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${L} 0 ${x3} ${y3}Z`; }
  function fit(t, len) { return String(t || ''); }
  function angIn(a, a0, a1) {
    let x = a - a0;
    while (x < 0) x += Math.PI * 2;
    while (x >= Math.PI * 2) x -= Math.PI * 2;
    return x <= (a1 - a0) + 1e-6;
  }
  function spanX(cx, cy, r0, r1, a0, a1, y, pad) {
    const pts = [];
    const xsAt = (r) => {
      const dy = y - cy;
      if (Math.abs(dy) > r + 0.01) return;
      const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
      [cx - dx, cx + dx].forEach((x) => {
        if (angIn(Math.atan2(y - cy, x - cx), a0, a1)) pts.push(x);
      });
    };
    xsAt(r0); xsAt(r1);
    [a0, a1].forEach((a) => {
      const c = Math.cos(a), s = Math.sin(a);
      if (Math.abs(s) < 1e-9) {
        if (Math.abs(y - cy) < 0.75) { pts.push(cx + r0 * c, cx + r1 * c); }
      } else {
        const t = (y - cy) / s;
        if (t >= r0 - 0.05 && t <= r1 + 0.05) pts.push(cx + t * c);
      }
    });
    if (pts.length < 2) return Math.max(16, r1 - r0 - 2 * pad);
    return Math.max(12, Math.max(...pts) - Math.min(...pts) - 2 * pad);
  }
  function chordSeg(cx, cy, r0, r1, a0, a1, y, hubR, pad) {
    const pts = [];
    const xsAt = (r) => {
      const dy = y - cy;
      if (Math.abs(dy) > r + 0.01) return;
      const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
      [cx - dx, cx + dx].forEach((x) => {
        if (angIn(Math.atan2(y - cy, x - cx), a0, a1)) pts.push(x);
      });
    };
    xsAt(r0); xsAt(r1);
    [a0, a1].forEach((a) => {
      const c = Math.cos(a), s = Math.sin(a);
      if (Math.abs(s) < 1e-9) {
        if (Math.abs(y - cy) < 0.75) { pts.push(cx + r0 * c, cx + r1 * c); }
      } else {
        const t = (y - cy) / s;
        if (t >= r0 - 0.05 && t <= r1 + 0.05) pts.push(cx + t * c);
      }
    });
    if (pts.length < 2) return null;
    let lo = Math.min(...pts) + pad, hi = Math.max(...pts) - pad;
    if (hubR > 0) {
      const dy = y - cy;
      if (Math.abs(dy) <= hubR) {
        const dx = Math.sqrt(Math.max(0, hubR * hubR - dy * dy));
        const holeLo = cx - dx, holeHi = cx + dx;
        if (lo < holeHi && hi > holeLo) {
          const leftW = holeLo - lo, rightW = hi - holeHi;
          if (leftW >= rightW && leftW > 4) hi = Math.min(hi, holeLo);
          else if (rightW > 4) lo = Math.max(lo, holeHi);
          else return null;
        }
      }
    }
    if (hi - lo < 8) return null;
    return { lo, hi, w: hi - lo, mid: (lo + hi) / 2 };
  }
  /* ---------- Build 64: measured ring / fan label solver ----------
     Real font metrics (canvas measureText: advance, ink box, font box), every word-boundary line break,
     and a polar search inside each wedge. The placement with the largest minimum ink clearance to the
     wedge's arcs, seams and the CA hub wins. No DOM nudging afterwards (svg[data-solved] is skipped). */
  const RS_CLEAR = 4 * 13 / 11; /* 4 CSS px at the smallest legal scale (13-unit role text = 11 CSS px) */
  const RS_SW = 1.5;            /* stroke allowance: seam/arc stroke 1.5, keeper 3 → half-width 1.5 */
  const RS_CELL = 0.75;         /* the text's font box must also sit inside the wedge fill (beyond the stroke) */
  const RS_CAP = RS_CLEAR + 4;  /* once this clear, prefer fewer lines */
  let rsCtx = null, rsFam = '';
  const rsMCache = new Map(), rsSCache = new Map();
  function rsFamily() {
    if (!rsFam) {
      try { rsFam = getComputedStyle(document.querySelector('#breeding-view') || document.body).fontFamily || ''; } catch (e) { rsFam = ''; }
      if (!rsFam) rsFam = 'system-ui, sans-serif';
    }
    return rsFam;
  }
  function rsMetric(t, bold, fs) {
    const fam = rsFamily();
    const key = (bold ? 'b' : 'n') + fs + '|' + t;
    let m = rsMCache.get(key); if (m) return m;
    if (!rsCtx) rsCtx = document.createElement('canvas').getContext('2d');
    rsCtx.font = `${bold ? 700 : 400} ${fs}px ${fam}`;
    const q = rsCtx.measureText(t);
    m = {
      adv: q.width,
      il: Number.isFinite(q.actualBoundingBoxLeft) ? q.actualBoundingBoxLeft : 0,
      ir: Number.isFinite(q.actualBoundingBoxRight) ? q.actualBoundingBoxRight : q.width,
      ia: Number.isFinite(q.actualBoundingBoxAscent) ? q.actualBoundingBoxAscent : fs * 0.75,
      id: Number.isFinite(q.actualBoundingBoxDescent) ? q.actualBoundingBoxDescent : fs * 0.25,
      fa: Number.isFinite(q.fontBoundingBoxAscent) ? q.fontBoundingBoxAscent : fs * 0.95,
      fd: Number.isFinite(q.fontBoundingBoxDescent) ? q.fontBoundingBoxDescent : fs * 0.25
    };
    rsMCache.set(key, m); return m;
  }
  /* Words; a lone "·" stays glued to both neighbours ("F1 · cross" never breaks at the dot), and "+" to the next word. */
  function rsTokens(s) {
    const out = []; let glue = false;
    String(s || '').split(/\s+/).filter(Boolean).forEach((w) => {
      if (w === '·' && out.length) { out[out.length - 1] += ' ·'; glue = true; }
      else if (w === '+') { out.push('+'); glue = true; } /* "+ Not" never leaves a lone "+" on its own line */
      else if (glue) { out[out.length - 1] += ' ' + w; glue = false; }
      else out.push(w);
    });
    return out;
  }
  function rsBreaks(tokens, maxLines) {
    const n = tokens.length, res = [];
    if (!n) return [[]];
    const rec = (i, acc) => {
      if (i === n) { res.push(acc); return; }
      if (acc.length >= maxLines) return;
      for (let j = i + 1; j <= n; j++) rec(j, acc.concat([tokens.slice(i, j).join(' ')]));
    };
    rec(0, []);
    return res;
  }
  /* Same rhythm as b62 textEl: name 14 (baseline step 14), 1.2 gap, role 13 (step 13). Offsets are relative to (tx, top). */
  function rsLayout(nl, rl) {
    const L = [];
    nl.forEach((t, i) => L.push({ t, cls: 't1', fs: 14, bold: true, bl: 14 * 0.82 + i * 14 }));
    const rTop = nl.length * 14 + (rl.length ? 1.2 : 0);
    rl.forEach((t, j) => L.push({ t, cls: 't2', fs: 13, bold: false, bl: rTop + 13 * 0.82 + j * 13 }));
    let iT = Infinity, iB = -Infinity;
    L.forEach((l) => {
      const m = rsMetric(l.t, l.bold, l.fs), s = -m.adv / 2;
      l.ink = { l: s - m.il, r: s + m.ir, t: l.bl - m.ia, b: l.bl + m.id };
      l.cell = { l: s, r: s + m.adv, t: l.bl - m.fa, b: l.bl + m.fd };
      iT = Math.min(iT, l.ink.t); iB = Math.max(iB, l.ink.b);
    });
    return { L, mid: (iT + iB) / 2, n: L.length };
  }
  function rsPtRect(x, y, R) { const dx = Math.max(R.l - x, 0, x - R.r), dy = Math.max(R.t - y, 0, y - R.b); return Math.hypot(dx, dy); }
  function rsPtSeg(x, y, s) {
    const vx = s.x1 - s.x0, vy = s.y1 - s.y0, L2 = vx * vx + vy * vy;
    const t = L2 ? Math.max(0, Math.min(1, ((x - s.x0) * vx + (y - s.y0) * vy) / L2)) : 0;
    return Math.hypot(x - (s.x0 + t * vx), y - (s.y0 + t * vy));
  }
  function rsSegHits(s, R) { /* Liang–Barsky */
    let t0 = 0, t1 = 1; const dx = s.x1 - s.x0, dy = s.y1 - s.y0;
    const p = [-dx, dx, -dy, dy], q = [s.x0 - R.l, R.r - s.x0, s.y0 - R.t, R.b - s.y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return false; }
      else { const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
    }
    return true;
  }
  function rsSegRect(s, R) {
    if (rsSegHits(s, R)) {
      /* crossing: negative depth = how far the rect reaches past the seam line (only matters for reporting) */
      const nx = -(s.y1 - s.y0), ny = s.x1 - s.x0, L = Math.hypot(nx, ny) || 1;
      const d = [[R.l, R.t], [R.r, R.t], [R.l, R.b], [R.r, R.b]].map(([x, y]) => ((x - s.x0) * nx + (y - s.y0) * ny) / L);
      return -Math.min(Math.max(...d), -Math.min(...d));
    }
    let d = Math.min(rsPtRect(s.x0, s.y0, R), rsPtRect(s.x1, s.y1, R));
    d = Math.min(d, rsPtSeg(R.l, R.t, s), rsPtSeg(R.r, R.t, s), rsPtSeg(R.l, R.b, s), rsPtSeg(R.r, R.b, s));
    return d;
  }
  /* Clearance of one rectangle to the wedge: { edge (arcs + seams, stroke excluded), hub (to the CA rim) } */
  function rsRect(G, R) {
    const x0 = R.l - G.cx, x1 = R.r - G.cx, y0 = R.t - G.cy, y1 = R.b - G.cy;
    const maxD = Math.max(Math.hypot(x0, y0), Math.hypot(x1, y0), Math.hypot(x0, y1), Math.hypot(x1, y1));
    const minD = Math.hypot(Math.max(x0, Math.min(0, x1)), Math.max(y0, Math.min(0, y1)));
    let hubD = minD;
    if (G.hub && (G.hx !== G.cx || G.hy !== G.cy)) {
      const u0 = R.l - G.hx, u1 = R.r - G.hx, v0 = R.t - G.hy, v1 = R.b - G.hy;
      hubD = Math.hypot(Math.max(u0, Math.min(0, u1)), Math.max(v0, Math.min(0, v1)));
    }
    let e = G.r1 - RS_SW - maxD;
    if (G.r0 > 0) e = Math.min(e, minD - G.r0 - RS_SW);
    for (let i = 0; i < G.seams.length; i++) e = Math.min(e, rsSegRect(G.seams[i], R) - RS_SW);
    return { e, h: G.hub ? hubD - G.hub : Infinity };
  }
  function rsAngIn(a, a0, a1) { let x = a - a0; while (x < 0) x += 2 * Math.PI; while (x >= 2 * Math.PI) x -= 2 * Math.PI; return x <= (a1 - a0) + 1e-9; }
  function rsWedge(cx, cy, r0, r1, b0, b1, hub, hx, hy) {
    const seams = [];
    if (b1 - b0 < 2 * Math.PI - 1e-6) [b0, b1].forEach((b) => seams.push({ x0: cx + r0 * Math.cos(b), y0: cy + r0 * Math.sin(b), x1: cx + (r1 + 2) * Math.cos(b), y1: cy + (r1 + 2) * Math.sin(b) }));
    return { cx, cy, r0, r1, b0, b1, hub: hub || 0, hx: hx == null ? cx : hx, hy: hy == null ? cy : hy, seams };
  }
  /* Evaluate a layout at block anchor (px, py). Returns min ink clearance, or -Infinity if the font box leaves the wedge. */
  function rsEval(G, lay, px, py) {
    if (!rsAngIn(Math.atan2(py - G.cy, px - G.cx), G.b0, G.b1)) return null;
    const top = py - lay.mid;
    let ink = Infinity, cellE = Infinity, cellH = Infinity, inkH = Infinity;
    for (let i = 0; i < lay.L.length; i++) {
      const l = lay.L[i];
      const a = rsRect(G, { l: px + l.ink.l, r: px + l.ink.r, t: top + l.ink.t, b: top + l.ink.b });
      const c = rsRect(G, { l: px + l.cell.l, r: px + l.cell.r, t: top + l.cell.t, b: top + l.cell.b });
      ink = Math.min(ink, a.e); inkH = Math.min(inkH, a.h); cellE = Math.min(cellE, c.e); cellH = Math.min(cellH, c.h);
    }
    const clr = Math.min(ink, inkH, cellH); /* ink 4 px from arcs/seams/hub; font box 4 px from the hub too */
    return { clr, ink, inkH, cellE, cellH, top, ok: cellE >= RS_CELL || !!G.soft };
  }
  function rsBetter(a, b) {
    if (!b) return true;
    const pa = Math.min(a.clr, RS_CAP), pb = Math.min(b.clr, RS_CAP);
    if (Math.abs(pa - pb) > 0.05) return pa > pb;
    if (a.n !== b.n) return a.n < b.n;
    return a.clr > b.clr;
  }
  function rsSolve(G, name, role, opt) {
    const o = opt || {};
    const key = [rsFamily(), G.cx, G.cy, G.r0, G.r1, G.b0, G.b1, G.hub, G.hx, G.hy, G.soft ? 1 : 0, name, role, o.na || 0, o.dr || 0, o.seeds || 0].join('|');
    if (rsSCache.has(key)) return rsSCache.get(key);
    const nB = rsBreaks(rsTokens(name), 4), rB = role ? rsBreaks(rsTokens(role), 3) : [[]];
    const NA = o.na || 48, DR = o.dr || 1.5;
    let best = null;
    nB.forEach((nl) => rB.forEach((rl) => {
      const lay = rsLayout(nl, rl);
      const top = [];
      for (let i = 0; i <= NA; i++) {
        const a = G.b0 + (G.b1 - G.b0) * (0.5 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) / NA);
        if (a < G.b0 - 1e-9 || a > G.b1 + 1e-9) continue;
        const ca = Math.cos(a), sa = Math.sin(a);
        for (let r = Math.max(G.r0, G.hub) + 0.5; r <= G.r1 - 0.5; r += DR) {
          const px = G.cx + r * ca, py = G.cy + r * sa;
          const ev = rsEval(G, lay, px, py);
          if (!ev || !ev.ok) continue;
          top.push({ lay, px, py, n: lay.n, ...ev });
        }
      }
      if (!top.length) return;
      top.sort((p, q) => q.clr - p.clr);
      const seeds = [];
      for (let i = 0; i < top.length && seeds.length < (o.seeds || 6); i++) if (seeds.every((q) => Math.hypot(q.px - top[i].px, q.py - top[i].py) > 6)) seeds.push(top[i]);
      let lb = null;
      seeds.forEach((sd) => {
        let cur = sd;
        for (let st = 2; st >= 0.0625; st /= 2) {
          let moved = true, guard = 0;
          while (moved && guard++ < 60) {
            moved = false;
            [[st, 0], [-st, 0], [0, st], [0, -st], [st, st], [-st, -st], [st, -st], [-st, st]].forEach(([dx, dy]) => {
              const ev = rsEval(G, lay, cur.px + dx, cur.py + dy);
              if (!ev || !ev.ok) return;
              if (ev.clr > cur.clr + 1e-4) { cur = { lay, px: cur.px + dx, py: cur.py + dy, n: lay.n, ...ev }; moved = true; }
            });
          }
        }
        if (!lb || cur.clr > lb.clr) lb = cur;
      });
      if (rsBetter(lb, best)) best = lb;
    }));
    rsSCache.set(key, best);
    return best;
  }
  function wrapLines(t, maxW, fs, charW) {
    const words = String(t || '').split(/\s+/).filter(Boolean);
    const widthOf = (s) => s.length * fs * charW;
    const lines = []; let cur = '';
    const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
    words.forEach((w) => {
      const next = cur ? `${cur} ${w}` : w;
      if (!cur || widthOf(next) <= maxW + 0.4) cur = next;
      else { flush(); cur = w; }
    });
    flush();
    return lines.length ? lines : [String(t || '')];
  }
  function packBlock(t, maxW, fs0, maxLines, charW, minFs) {
    const floor = (minFs == null) ? 12 : minFs;
    let fs = Math.max(floor, fs0);
    let L = wrapLines(t, maxW, fs, charW);
    const tooWide = (lines, size) => lines.some((l) => l.length * size * charW > maxW + 0.8);
    while ((L.length > maxLines || tooWide(L, fs)) && fs > floor + 0.05) { fs -= 0.25; L = wrapLines(t, maxW, fs, charW); }
    /* Prefer more short lines over shrinking below readable size or clipping a word. */
    if (tooWide(L, fs) || L.length > maxLines) { fs = floor; L = wrapLines(t, maxW, fs, charW); }
    return { fs, L, h: L.length * fs * 1.0 };
  }
  function textEl(t, x, yTop, pack, cls, maxW) {
    const { fs, L } = pack;
    const mw = (maxW || pack.maxW || 0);
    const mwS = mw.toFixed ? mw.toFixed(1) : mw;
    return L.map((l, i) => {
      const y = yTop + fs * 0.82 + i * fs;
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" class="${cls}" data-full="${esc(l)}" data-maxw="${mwS}" style="font-size:${fs.toFixed(1)}px">${esc(l)}</text>`;
    }).join('');
  }
  function lbl(t, x, y, arc) { /* kept for any leftover callers */
    const pack = packBlock(t, Math.max(16, arc), Math.min(10.5, Math.max(6.4, arc / 8)), 5, 0.72);
    return textEl(t, x, y - pack.h / 2, pack, 't1', Math.max(16, arc));
  }
  function ringIni(x, nm) {
    if (x.k && !isUnk(x.k)) return mono(x.k);
    if (x.none || x.via) return '+';
    const w = String(nm || x.t || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
    return ((w[0] || '·')[0] + (w[1] ? w[1][0] : '')).toUpperCase() || '·';
  }
  function legendList(items) {
    if (!items || !items.length) return '';
    const label = (x) => {
      const ini = String(x.ini || '');
      let nm = String(x.nm || '');
      if (ini && nm && (nm === ini || nm.startsWith(ini + ' ') || nm.startsWith(ini + ini))) {
        const cut = nm.slice(ini.length).replace(/^[+·\s]+/, '').trim();
        if (cut) nm = cut;
      }
      return `<li><b>${esc(x.ini)}</b><span>${esc(nm)}${x.sb ? `<small>${esc(x.sb)}</small>` : ''}</span></li>`;
    };
    return `<ul class="b57-legend">${items.map(label).join('')}</ul>`;
  }
  function ring(items, cx, cy, r0, r1, a0, a1, cls, prefer, hubRim, ex) {
    if (!items.length) return ''; const step = (a1 - a0) / items.length; let s = ''; const X = ex || {};
    const bnd = (X.bounds && X.bounds.length === items.length + 1) ? X.bounds : null;
    /* Parent ring: labels keep 4 CSS px off the CA rim (hubRim = rim radius). */
    const isParentRing = /(?:^|\s)r1(?:\s|$)/.test(cls);
    const hub = isParentRing ? (hubRim != null ? hubRim : 55) : 0;
    items.forEach((x, i) => { const b0 = bnd ? bnd[i] : a0 + i * step, b1 = bnd ? bnd[i + 1] : b0 + step;
      const nm = x.b62 ? (x.b62 === 'wild' ? 'Wild ancestors' : x.b62 === 'origin' ? 'Landrace' : 'Not recorded') : x.cand ? x.t : x.self ? 'Self (S1)' : x.none ? (x.via ? '+ Not recorded' : 'Not recorded') : x.k ? nm2(x.k) : (x.t || 'Not recorded');
      const sb = x.b62 ? (x.b62 === 'wild' ? 'Not traceable · landrace' : x.b62 === 'origin' ? ((rec(x.k) || {}).originRegion || 'Region not recorded') : `Parents of ${name(x.via)}`) : x.cand ? x.s : x.k ? (x.ref ? 'also above' : (stat(x.k).t === 'culled' ? 'Culled' : stat(x.k).t === 'removed' ? 'Deleted plant' : stat(x.k).t === 'bought' ? (window.B58 && B58.boughtBadge ? B58.boughtBadge(stat(x.k).br) : 'Bought') : (x.role || gen(x.k)))) : (x.s || x.role || '');
      const tap = x.k && !isUnk(x.k); const add = !tap && x.via && x.side;
      /* Option C: empty grandparent wedges show just "+ Not recorded", no role line. */
      /* Walnut ring 2 is too thin for 'Parents of X' at 11 px with 4 px clear (b64-solver/opt-wal62.js): title only, as Option C */
      const emptyGp = (x.b62 === 'none' && /(?:^|\s)short(?:\s|$)/.test(cls)) || !!(x.none && !x.b62 && /(?:^|\s)r2(?:\s|$)/.test(cls));
      const roleText = (emptyGp || X.titleOnly) ? '' : sb;
      const G = rsWedge(cx, cy, r0, r1, b0, b1, hub, X.hx, X.hy);
      const best = rsSolve(G, nm, roleText) || rsSolve(Object.assign({}, G, { soft: true }), nm, roleText); /* never drop a word */
      let txt = '', cyTxt = (cy + (r0 + r1) / 2 * Math.sin((b0 + b1) / 2)), clr = -1, maxW = 16;
      if (best) {
        const top = best.top; cyTxt = best.py; clr = best.clr;
        txt = best.lay.L.map((l) => { maxW = Math.max(maxW, rsMetric(l.t, l.bold, l.fs).adv); return `<text x="${best.px.toFixed(2)}" y="${(top + l.bl).toFixed(2)}" text-anchor="middle" class="${l.cls}" data-full="${esc(l.t)}" style="font-size:${l.fs}px">${esc(l.t)}</text>`; }).join('');
      }
      s += `<g class="b57-seg ${cls}${tap ? '' : add ? ' none add' : ' none'}${x.keeper ? ' keeper' : ''}${x.me ? ' is-me' : ''}" data-solved="1" data-clr="${clr.toFixed(2)}" data-geo="${[cx, cy, r0, r1, b0, b1, hub, G.hx, G.hy].map((v) => +(+v).toFixed(5)).join(',')}" data-cy="${cyTxt.toFixed(1)}" data-maxw="${maxW.toFixed(1)}" data-nm="${esc(nm)}" data-role="${esc(roleText || '')}"${tap ? ` data-b57="sel" data-k="${esc(x.k)}" role="button" tabindex="0" aria-label="${esc(nm)}"` : add ? ` data-b58="add" role="button" tabindex="0" aria-label="${esc(nm)} · tap to add"` : ''}${ofA(x)}${add ? ' data-add="1"' : ''}${x.cand ? ` data-cand="${x.i}"` : ''}><path d="${seg(cx, cy, r0, r1, b0, b1)}"/>${txt}</g>`; });
    return s;
  }
  let cid = 0;
  function centre(k, cx, cy, r) { const s = photo(k); const id = 'b57c' + (++cid);
    return `<g data-b57="sel" data-k="${esc(k)}" class="b57-ctr" role="button" tabindex="0" aria-label="${esc(name(k))}"><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath><circle cx="${cx}" cy="${cy}" r="${r + 3}" class="rim"/>${s ? `<image href="${esc(s)}" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" data-photo="1"/>` : `<circle cx="${cx}" cy="${cy}" r="${r}" class="mono"/><text x="${cx}" y="${cy + 9}" text-anchor="middle" class="mt">${esc(mono(k))}</text>`}</g>`; }
  function gpItems(lv, m, f) { const out = []; [m, f].forEach((p, i) => { if (!p) return; if (p.b62) { out.push(...gpFor(lv, p)); return; } const g = gpOf(lv, p); if (g.length) out.push(...g); else if (real(p)) out.push(...gpFor(lv, p)); else out.push({ none: 1, role: `${i ? "Father's" : "Mother's"} parents` }, { none: 1, role: '' }); }); return out; }
  /* Build 64 ring / fan geometry (SVG units). W 451: at the 382 CSS px card width the 13-unit role text renders at 11.0 CSS px.
     Hub r 52 (+3 rim) as b62. Band radii chosen by the clearance solver (b64-solver/opt-radii.js) to maximise the worst label clearance. */
  const WAL = { W: 451, wood: 223.5, R: 221.5, rc: 176, rb: 125.7, ra: 55, hub: 46.5 };   /* solver max-min 4.84 u = 4.10 CSS px; hub r 46.5 (+3 rim = 49.5) sits 4.75 u (4.0 CSS px) clear of the parents ring stroke */
  /* Fan: equal b62 wedges. With CA on the centre the best possible is 1.12 u (< 4 px), so CA sits below the fan's base line:
     hy 62 puts the hub rim (r 55) 7 u (5.9 CSS px) under the wedges, so CA never covers a wedge. */
  const FAN = { W: 451, cy: 225.5, R: 223, rc: 176, rb: 94, ra: 0.5, hy: 62 };   /* b64: rb 94 / rc 176 (b64-solver/opt-fan62.js) so b62's 'Not recorded · Parents of X' wedge keeps 4 px+ (min 5.29 u = 4.48 CSS px) */   /* ra 0.5: the parents meet at the centre point (no notch now CA is below) */
  /* b64 (Elio, Nov 10): an outer band (brothers & sisters, candidates, kids) keeps its second line only while every label clears 4 px.
     Otherwise it shows names only, as the grandparent ring does; the same details stay in the list under the tree. */
  const ringWorst = (h) => Math.min(...[...h.matchAll(/data-clr="(-?[0-9.]+)"/g)].map((q) => +q[1]));
  function outerRing(items, cx, cy, r0, r1, a0, a1, cls) { const h = ring(items, cx, cy, r0, r1, a0, a1, cls); return ringWorst(h) >= RS_CLEAR ? h : ring(items, cx, cy, r0, r1, a0, a1, cls, null, null, { titleOnly: true }); }
  function radial(k, lv, P, ks) {
    const [m, f] = parentsRow(lv); const gp = gpItems(lv, m, f); const c = WAL.W / 2;
    const top = P.items.filter((x) => !x.me); const outer = top.length ? top : [{ t: P.hunt ? 'No candidates' : 'No siblings', s: 'same seed pop' }];
    const kk = ks.length ? ks.map((x) => (x.k ? { k: x.k, role: x.s } : { t: x.t, s: x.s })) : [{ t: 'No kids yet', s: 'kids' }];
    const oR = outerRing(outer, c, c, WAL.rc, WAL.R, -Math.PI, 0, 'r3'), kR = outerRing(kk, c, c, WAL.rc, WAL.R, 0, Math.PI, 'r3 k');
    return `<div class="b57-svgw"><svg viewBox="0 0 ${WAL.W} ${WAL.W}" class="b57-svg radial" data-solved="1" role="group" aria-label="Family tree rings">
<circle cx="${c}" cy="${c}" r="${WAL.wood}" class="wood"/>${oR}${kR}${ring(gp, c, c, WAL.rb, WAL.rc, Math.PI / 2, 2.5 * Math.PI, 'r2 short')}${ring([m, f].filter(Boolean), c, c, WAL.ra, WAL.rb, Math.PI / 2, 2.5 * Math.PI, 'r1', null, WAL.hub + 3)}${centre(k, c, c, WAL.hub)}</svg></div>
<div class="b57-ban solo"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>
<p class="b57-key">Centre: this plant · Ring 1: parents · Ring 2: grandparents · Outer ring: ${P.hunt ? 'pheno-hunt candidates' : 'brothers &amp; sisters'} (top), kids (bottom)</p>${fam(k, ks, { noKids: 1, noLab: 1, noMe: 1 })}${P.hunt ? `${lab(popLab(P))}${popRow(P)}` : ''}${nextBranch(P)}`;
  }
  function fan(k, lv, P, ks) {
    const [m, f] = parentsRow(lv); const gp = gpItems(lv, m, f); const c = FAN.W / 2;
    const o0 = P.items.filter((x) => !x.me); const o = o0.length ? o0 : [{ t: P.hunt ? 'No candidates' : 'No siblings', s: 'same seed pop' }];
    /* b64 (Elio, Nov 10): long names. The approved geometry is kept whenever every label clears 4 px. Otherwise, inside the same fan,
       the grandparent ring shows names only (Option C, as Walnut ring 2), the parents/grandparents boundary moves out and the two
       base wedges get more angle, until every label clears 4 px again. */
    const P2 = [m, f].filter(Boolean), PI = Math.PI;
    const draw = (rb, rc, sk, tOnly) => { const gb = gp.length === 4 ? [PI, PI + PI / 2 * (0.5 + sk), 1.5 * PI, 1.5 * PI + PI / 2 * (0.5 - sk), 2 * PI] : null;
      return outerRing(o, c, FAN.cy, rc, FAN.R, PI, 2 * PI, 'r3') + ring(gp, c, FAN.cy, rb, rc, PI, 2 * PI, 'r2', null, null, { bounds: gb, titleOnly: tOnly }) + ring(P2, c, FAN.cy, FAN.ra, rb, PI, 2 * PI, 'r1', null, 55, { hx: c, hy: FAN.cy + FAN.hy }); };
    const worst = (h) => Math.min(...[...h.matchAll(/data-clr="(-?[0-9.]+)"/g)].map((q) => +q[1]));
    let rings = draw(FAN.rb, FAN.rc, 0, false);
    if (worst(rings) < RS_CLEAR) { let best = null;
      for (let rc = FAN.rc; rc >= FAN.rc - 6 && !(best && best.w >= RS_CLEAR); rc -= 2) for (let rb = FAN.rb; rb <= 130 && !(best && best.w >= RS_CLEAR); rb += 2) for (let sk = 0; sk <= 0.3001 && !(best && best.w >= RS_CLEAR); sk += 0.05) {
        const h = draw(rb, rc, sk, true), w = worst(h); if (!best || w > best.w) best = { w, h }; }
      if (best) rings = best.h; }
    return `${lab(P.hunt ? 'Pheno-hunt candidates · outer band' : 'Brothers & sisters · outer band')}<div class="b57-svgw"><svg viewBox="0 0 ${FAN.W} ${FAN.cy + FAN.hy + 57}" class="b57-svg fan" data-solved="1" role="group" aria-label="Family tree fan">${rings}${centre(k, c, FAN.cy + FAN.hy, 52)}</svg></div>
<div class="b57-sides-row"><span class="b57-sides">◀ Mother's side</span><span class="b57-sides">Father's side ▶</span></div><div class="b57-ban solo"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>
${P.hunt ? `${lab(popLab(P))}${popRow(P)}` : ''}${nextBranch(P)}${fam(k, ks, { noMe: 1, noLab: 1 })}`;
  }
  function joinedPair(k, g) {
    const ban = `<div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>`;
    return `<div class="b59-pair" data-b59pair="${esc(g.key)}"><div class="b59-pc me" data-node="${esc(k)}" data-k="${esc(k)}">${ph(k, 1)}</div>${XB}${pairCard(g, k)}</div><div class="b59-labs">${ban}${pLab(g)}</div>`;
  }
  function roseOf(k) {
    return `<div class="b57-rose"><div class="b57-rosew"><svg class="b57-rosedots" viewBox="0 0 200 200" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; const c = ['#b5302a', '#2f8f83', '#2f56a8', '#d9a441'][i % 4]; return `<circle cx="${(100 + 86 * Math.cos(a)).toFixed(1)}" cy="${(100 + 86 * Math.sin(a)).toFixed(1)}" r="7" fill="${c}"/>`; }).join('')}${Array.from({ length: 12 }, (_, i) => { const a = (i + 0.5) * Math.PI / 6; const c = ['#d9a441', '#2f56a8', '#b5302a'][i % 3]; return `<circle cx="${(100 + 70 * Math.cos(a)).toFixed(1)}" cy="${(100 + 70 * Math.sin(a)).toFixed(1)}" r="4.5" fill="${c}"/>`; }).join('')}<circle cx="100" cy="100" r="95" fill="none" stroke="#c79a63" stroke-width="3"/><circle cx="100" cy="100" r="62" fill="none" stroke="#c79a63" stroke-width="2"/></svg>${ph(k, 1)}</div></div>`;
  }
  /* b64: Certificate and Window draw no Kids bracket. The pair sits at the top, with the pedigree and siblings between it and Kids, so a bracket there could only hang loose. */
  function cert(k, lv, P, ks) {
    const [m, f] = parentsRow(lv);
    const col = (p, i) => { const g = gpFor(lv, p); return `<div class="b57-cp${g.length ? '' : ' no-gp'}">${pnode(p)}${g.length ? `<div class="b57-cg">${g.map((x) => pnode(x, 'mini')).join('')}</div>` : ''}</div>`; };
    const li = (x) => x.cand ? `<div class="b57-li${x.keeper ? ' keeper' : ''}" data-cand="${x.i}">${x.k ? ph(x.k) : `<span class="b57-ph mono">#${x.i}</span>`}<b>${esc(x.t)}</b><small>${esc(x.s)}</small></div>` : `<button type="button" class="b57-li${x.me ? ' is-me' : ''}" data-b57="sel" data-k="${esc(x.k)}">${ph(x.k)}<b>${esc(name(x.k))}${x.me ? ' · this plant' : ''}</b><small>${esc(gen(x.k))}</small></button>`;
    const G = partners(k, ks);
    const pairH = G.length ? `<div class="b57-cert-pair">${joinedPair(k, G[0])}</div>` : '';
    const thisCell = G.length ? '' : `<div class="b57-pme">${node({ k, role: 'This plant' }, 'is-me')}</div>`;
    return `<div class="b57-paper"><h3 class="b57-ct">Certificado de linaje</h3><p class="b57-cs">${esc(crossTxt(k))}</p>
${pairH}<div class="b57-ped${G.length ? ' pair-above' : ''}">${thisCell}<div class="b57-pcol${f ? '' : ' one'}">${col(m, 0)}${f ? col(f, 1) : ''}</div></div>
${lab(popLab(P))}${(() => { const h = P.items.map(li).join(''); return (!P.hunt && !h.trim()) ? noSib : `<div class="b57-list">${h}</div>`; })()}${nextBranch(P)}
${fam(k, ks, { noMe: 1, noLab: 1, noPair: 1, noBrk: 1 })}<p class="b57-motto">Raíces fuertes · cosechas grandes</p></div>`;
  }
  function ceibaTree(k, lv, P, ks) {
    const [m, f] = parentsRow(lv);
    const col = (gps, par) => {
      const gs = gps || [];
      if (!gs.length) return `<div class="b57-tree-col no-gp"><div class="b57-tree-par">${pnode(par)}</div></div>`;
      return `<div class="b57-tree-col"><div class="b57-tree-gps">${gs.map((x) => pnode(x, 'mini')).join('')}</div><div class="b57-tree-limb${gs.length === 1 ? ' one' : ''}" aria-hidden="true"></div><div class="b57-tree-par">${pnode(par)}</div></div>`;
    };
    const popH = `${lab(popLab(P))}${popRow(P)}${nextBranch(P)}`;
    const hasKids = (ks || []).length > 0;
    /* Parents join into CA (the trunk) only. LA meets CA through the existing ×, not through a tree line. */
    return `${gpFor(lv, m).length || gpFor(lv, f).length ? lab('Grandparents') : lab('Parents')}<div class="b57-tree"><div class="b57-tree-canopy${f ? '' : ' one'}${gpFor(lv, m).length || gpFor(lv, f).length ? '' : ' no-gp'}">${col(gpFor(lv, m), m)}${f ? col(gpFor(lv, f), f) : ''}</div><div class="b57-tree-join" aria-hidden="true"></div><div class="b57-bar b57-tree-joinbar" aria-hidden="true"></div>${lab('This plant')}<div class="b57-tree-stem b57-tree-to-me" aria-hidden="true"></div>${fam(k, ks, { noKids: 1, noLab: 1 })}${hasKids ? '<div class="b57-tree-stem b57-tree-to-kids" aria-hidden="true"></div>' : ''}${fam(k, ks, { noMe: 1, noLab: 1, noPair: 1, noBrk: 1, kidL: lab('Kids') })}${popH}</div><p class="b57-motto">Raíces fuertes · cosechas grandes</p>`;
  }
  function mobileHang(k, lv, P, ks) {
    const [m, f] = parentsRow(lv);
    const leaf = (x, mini) => `<div class="b57-mob-leaf"><div class="b57-mob-str" aria-hidden="true"></div>${pnode(x, mini ? 'mini' : '')}</div>`;
    const gpM = gpFor(lv, m); const gpF = gpFor(lv, f);
    const gpLeaves = [...gpM, ...gpF].map((x) => leaf(x, 1)).join('');
    const parLeaves = `${leaf(m, 0)}${f ? leaf(f, 0) : ''}`;
    const G = partners(k, ks);
    const g0 = G[0];
    const caHang = `<div class="b57-mob-leaf"><div class="b57-mob-str" aria-hidden="true"></div><div class="b59-pc me" data-node="${esc(k)}" data-k="${esc(k)}">${ph(k, 1)}</div></div>`;
    const laHang = g0 && !g0.self
      ? `<div class="b57-mob-leaf"><div class="b57-mob-str" aria-hidden="true"></div>${pairCard(g0, k)}</div>`
      : '';
    const pairHang = `<div class="b57-mob-hang row pair">${caHang}${g0 && !g0.self ? XB : ''}${laHang}</div><div class="b59-labs"><div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>${g0 ? pLab(g0) : ''}</div>`;
    const kidItems = (ks || []).filter((x) => !isFalseSample(x.k));
    const kidsHang = kidItems.length
      ? `<div class="b57-bar fl" aria-hidden="true"></div>${lab('Kids')}<div class="b57-mob-hang row kids">${kidItems.map((x) => `<div class="b57-mob-leaf"><div class="b57-mob-str" aria-hidden="true"></div>${kidNode(x)}</div>`).join('')}</div>`
      : `${fam(k, ks, { noMe: 1, noLab: 1, noPair: 1, noBrk: 1, kidL: lab('Kids') })}`;
    const popH = `${lab(popLab(P))}${popRow(P)}${nextBranch(P)}`;
    /* Top to bottom: grandparents on a bar, then parents on a bar, then this plant, then kids. Every card hangs from a bar on a string. */
    return `<div class="b57-mob"><div class="b57-mob-stage">${gpLeaves ? `<div class="b57-bar fl" aria-hidden="true"></div><div class="b57-mob-hang row gps">${gpLeaves}</div>` : ''}<div class="b57-bar fl" aria-hidden="true"></div><div class="b57-mob-hang row pars">${parLeaves}</div><div class="b57-bar fl" aria-hidden="true"></div>${lab('This plant')}${pairHang}${kidsHang}${popH}</div><p class="b57-motto">Raíces fuertes · cosechas grandes</p></div>`;
  }
  function riverFlow(k, lv, P, ks) {
    const [m, f] = parentsRow(lv);
    const unit = (nodeHtml, last) => `<div class="b57-riv-unit${last ? ' last' : ''}">${nodeHtml}${last ? '' : '<span class="b57-riv-tick" aria-hidden="true"></span>'}</div>`;
    const stream = (gps, par) => {
      const gs = gps || [];
      const bits = gs.map((x) => pnode(x, 'mini'));
      bits.push(pnode(par));
      return `<div class="b57-riv-stream">${bits.map((html, i) => unit(html, i === bits.length - 1)).join('')}</div>`;
    };
    const popH = `${lab(popLab(P))}${popRow(P)}${nextBranch(P)}`;
    const hasKids = (ks || []).length > 0;
    /* Two source streams (GPs → parent) join into CA, then one stream flows to the kids. */
    return `${lab(gpFor(lv, m).length || gpFor(lv, f).length ? 'Grandparents · the sources' : 'Parents · the sources')}<div class="b57-riv"><div class="b57-riv-sources">${stream(gpFor(lv, m), m)}${f ? stream(gpFor(lv, f), f) : ''}</div><div class="b57-riv-merge" aria-hidden="true"><span class="b57-riv-tick from-m"></span><span class="b57-riv-tick from-f"></span><span class="b57-riv-tick mid riser"></span><span class="b57-riv-tick jog"></span><span class="b57-riv-tick mid to-me"></span></div><div class="b57-riv-flow">${lab('This plant')}${fam(k, ks, { noKids: 1, noLab: 1 })}${hasKids ? '<span class="b57-riv-tick mid" aria-hidden="true"></span>' : ''}${fam(k, ks, { noMe: 1, noLab: 1, noPair: 1, noBrk: 1, kidL: lab('Kids · downstream') })}${popH}</div></div><p class="b57-motto">Raíces fuertes · cosechas grandes</p>`;
  }
  function stack(k, lv, P, ks, st) {
    const [m, f] = parentsRow(lv); const kidsH = kidsBlock(ks);
    const gA = gpAll(lv, m, f); const gpH = gA.length ? `${lab(st.k === 'river' ? 'Grandparents · the sources' : 'Grandparents')}${row(gA, (x) => node(x), 'gp scroll')}` : '';
    const parH = `${lab(st.k === 'roots' ? 'Parents · the roots' : 'Parents')}${row([m, f].filter(Boolean), (x) => pnode(x), 'par' + (f ? '' : ' one'))}`;
    /* Keep this style's parent / grandparent rows. Do not hide them behind the both-sides chart. */
    const both = false;
    const gpH2 = gpH, parH2 = parH;
    const popH = `${lab(popLab(P, st))}${popRow(P)}${nextBranch(P)}`;
    const kidL = lab(st.k === 'river' ? 'Kids · downstream' : st.k === 'roots' ? 'Kids · the crown' : 'Kids');
    const famH = fam(k, ks, { kidL, up: st.lay === 'crown' });
    if (st.lay === 'crown') return `${famH}<div class="b64-roots">${parH2}${!both && gA.length ? `${lab('Grandparents')}${row(gA, (x) => node(x), 'gp scroll')}` : ''}</div><div class="b57-soil" aria-hidden="true"></div>${popH}<p class="b57-motto">Raíces fuertes · cosechas grandes</p>`;
    if (st.lay === 'window') {
      const G = partners(k, ks);
      const top = G.length
        ? `${lab('This plant')}<div class="b59-pair window-pair" data-b59pair="${esc(G[0].key)}"><div class="b59-pc me" data-node="${esc(k)}" data-k="${esc(k)}">${roseOf(k)}</div>${XB}${pairCard(G[0], k)}</div><div class="b59-labs"><div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>${pLab(G[0])}</div>`
        : `${lab('This plant')}${roseOf(k)}<div class="b57-ban"><b>${esc(name(k))}${gen(k) ? ` · ${esc(gen(k))}` : ''}</b><small>${esc(crossTxt(k))}</small></div>`;
      return `<div class="b57-pane top${G.length ? ' has-pair' : ''}">${top}</div>${both ? '' : `<div class="b57-pane two"><div class="b57-pane m">${lab("Mother's window")}${pnode(m)}${row(gpFor(lv, m), (x) => node(x, 'mini'), 'gp')}</div>${f ? `<div class="b57-pane f">${lab("Father's window")}${pnode(f)}${row(gpFor(lv, f), (x) => node(x, 'mini'), 'gp')}</div>` : ''}</div>`}<div class="b57-pane s">${popH}</div><div class="b57-pane k">${fam(k, ks, { kidL, noMe: 1, noLab: 1, noPair: 1, noBrk: 1 })}</div><p class="b57-motto">Raíces fuertes · cosechas grandes</p>`;
    }
    if (st.k === 'ceiba') return ceibaTree(k, lv, P, ks);
    if (st.k === 'mobile') return mobileHang(k, lv, P, ks);
    if (st.k === 'river') return riverFlow(k, lv, P, ks);
    return `${gpH2}<div class="b57-bar" aria-hidden="true"></div>${parH2}<div class="b57-bar" aria-hidden="true"></div>${famH}${popH}`;
  }
  function tree(pg, head) {
    const k = pg.key; const sk = pg.styleKey || k; const sn = ok(pg.forceStyle) ? Number(pg.forceStyle) : styleOf(sk); const st = STYLES[sn];
    const lv = ancestors(k); const P = popOf(k); const ks = kids(k); const depth = lv.length - 1;
    const body = st.lay === 'radial' ? radial(k, lv, P, ks) : st.lay === 'fan' ? fan(k, lv, P, ks) : st.lay === 'cert' ? cert(k, lv, P, ks) : stack(k, lv, P, ks, st);
    const p = par2(k); const subT = [crossTxt(k), P.hunt ? `pheno hunt of ${P.items.length}${P.keeper ? '' : ' · no keeper yet'}` : (P.items.length ? `seed pop of ${P.items.length}` : ''), st.n].filter(Boolean).join(' · ');
    const momFrom = pg.fromProduction ? linkedMotherKey(pg.fromProduction) : '';
    const momRec = momFrom ? rec(momFrom) : null;
    const cloneMark = momFrom ? `<p class="b57-cloneof" data-b13clone="1">Clone of ${esc(name(momFrom))} (${(momRec && momRec.role === 'father') ? 'father' : 'mother'})</p>` : '';
    const sel = pg.sel ? `<div class="b57-card">${ph(pg.sel)}<div><b>${esc(name(pg.sel))}</b><small>${esc(gen(pg.sel))}</small><div class="b57-acts"><button type="button" class="b57-a" data-b49="open" data-k="${esc(pg.sel)}">Open profile ›</button>${par2(pg.sel) && !same(pg.sel, k) ? `<button type="button" class="b57-a" data-b57="walk" data-k="${esc(pg.sel)}">Walk up this line ›</button>` : ''}</div></div><button type="button" class="b57-x" data-b57="unsel" aria-label="Close">×</button></div>` : '';
    const trail = (pg.trail || []).length ? `<div class="b57-trail">${pg.trail.map((t) => `<button type="button" data-b57="walkto" data-k="${esc(t)}">${esc(name(t))}</button>`).join('<span>›</span>')}<span>›</span><b>${esc(name(k))}</b></div>` : '';
    return `<div class="b57${pg.edit ? ' b58-editing' : ''}" data-b57s="${sn}" data-b57k="${st.k}" data-b57lay="${st.lay}" data-depth="${depth}">${head}<h2 class="b18-h1">Family tree</h2><p class="b57-subt">${esc(subT)}</p>${cloneMark}
<div class="b57-tools"><span class="m-s">${depth ? `${depth} generation${depth > 1 ? 's' : ''} recorded` : (stat(k).t === 'bought' ? stat(k).l : 'No parents recorded')}</span><button type="button" class="b58-edit${pg.edit ? ' on' : ''}" data-b58="edit" aria-pressed="${pg.edit ? 'true' : 'false'}">${pg.edit ? 'Done' : 'Edit'}</button><span class="b57-z"><button type="button" data-b57="z-" aria-label="Zoom out">−</button><button type="button" data-b57="z0" aria-label="Reset zoom">Zoom</button><button type="button" data-b57="z+" aria-label="Zoom in">+</button></span></div>${trail}
${pg.edit ? '<div class="b58-banner" role="status">Edit mode · tap any plant to change, add, relink or remove it. Hand edits are kept and never overwritten automatically.</div>' : ''}<div class="b57-scroll"><div class="b57-canvas" style="zoom:${pg.zoom || 1}">${body}${depth > 2 ? `<div class="b57-older">${lab('Older generations · scroll sideways, tap a plant to open it, long-press to walk up')}${older(lv, 3)}</div>` : ''}</div></div>${sel}
<p class="m-s b57-note">Tap any plant to open its profile; long-press it to walk up its line. ${p && !k.startsWith('pr:') ? esc(B49.why(k)) + '.' : ''}</p></div>`;
  }
  const _page = b18BrPageHtml;
  b18BrPageHtml = function () {
    const pg0 = B18.brPage; const h = _page.apply(this, arguments);
    const pg = pg0;
    if (!pg) return h;
    if (pg.type === 'b57nomother') {
      try { const head = (h.match(/^\s*<div class="b18-pagehead">[\s\S]*?<\/div>/) || [''])[0]; return noMotherPage(pg, head); } catch (e) { console.warn('b57 nomother', e); return noMotherPage(pg, ''); }
    }
    if (pg.type === 'b57connect') {
      try { const head = (h.match(/^\s*<div class="b18-pagehead">[\s\S]*?<\/div>/) || [''])[0]; return connectionPage(pg, head); } catch (e) { console.warn('b57 connect', e); return connectionPage(pg, ''); }
    }
    if (pg.type !== 'b49tree') return h;
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
    return out;
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
  const onLin = () => typeof activeView !== 'undefined' && activeView === 'breeding' && B18.brPage && (B18.brPage.type === 'b57lin' || B18.brPage.type === 'b49tree');
  function mark() {
    const on = onLin();
    document.querySelectorAll('#tabbar [data-tab-view="lineage"], [data-w-nav="lineage"]').forEach((b) => { b.classList.toggle('active', on); b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (on) document.querySelectorAll('#tabbar [data-tab-view="breeding"], [data-w-nav="breeding"]').forEach((b) => { b.classList.remove('active', 'on'); b.removeAttribute('aria-current'); });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('#tabbar [data-tab-view="lineage"], [data-w-nav="lineage"]'); if (!b) return; e.preventDefault(); e.stopImmediatePropagation(); openLineage(); }, true);
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-b57="tree"]'); if (!b) return; e.preventDefault(); const lin = B18.brPage && B18.brPage.type === 'b57lin'; B49.openPage({ type: 'b49tree', key: resolveKey(b.dataset.k), fromLin: lin }); mark(); });
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
      if (at) {
        const tgt = productionTreeTarget(k);
        const hint = tgt.mode === 'connect' ? ((originOf(k).recorded && originOf(k).value === 'clone') ? "Mother plant's tree" : 'Connection to mother and father trees') : crossTxt(k);
        at.insertAdjacentHTML('afterend', `<button type="button" class="m-card b57-ftbtn" data-b57="tree" data-k="${esc(k)}">${TREE_SVG}<span><b>Family tree</b><small>${esc(hint)}</small></span><i class="b18-chev" aria-hidden="true">›</i></button>`);
      }
    }
    try { cloneOfRow(); } catch (e) { /* */ }
    try { const r = typeof mfDetailRecord === 'function' && activeView === 'breeding' && mfDetailRecord(); const bv = document.getElementById('breeding-view');
      const ob = bv && bv.querySelector('.b57-ftbtn'); if (r && ob && ob.dataset.k !== `mf:${r.id}`) ob.remove();
      if (r && bv && !bv.querySelector('.b57-ftbtn')) { const h = bv.querySelector('.b18-h1') || bv.querySelector('h2'); if (h) h.insertAdjacentHTML('afterend', `<button type="button" class="m-card b57-ftbtn" data-b57="tree" data-k="mf:${esc(r.id)}">${TREE_SVG}<span><b>Family tree</b><small>${esc(crossTxt(`mf:${r.id}`))}</small></span><i class="b18-chev" aria-hidden="true">›</i></button>`); } } catch (e) { /* */ }
  }
  addTab(); addSide();
  /* B-13: Plants / production runs do not get their own family tree. A clone
     with an explicit mother link opens that mother's tree. If there is no
     motherPlantId / promotedFrom link, show "No mother linked". */
  function linkedMotherKey(k) {
    const r = rec(k); if (!r || !String(k).startsWith('pl:')) return '';
    const tryKey = (raw) => { if (!raw) return ''; const q = resolveKey(raw); return rec(q) ? q : ''; };
    if (r.motherPlantId) {
      const id = String(r.motherPlantId);
      if (/^(pl|bp|mf|pr):/.test(id)) return tryKey(id);
      return tryKey(`mf:${id}`) || tryKey(`pl:${id}`) || tryKey(id);
    }
    const pf = r.promotedFrom;
    if (pf && pf.id) {
      const typ = { plants: 'pl', breedingPlants: 'bp', motherFatherPlants: 'mf' }[pf.coll] || 'pl';
      return tryKey(`${typ}:${pf.id}`);
    }
    return '';
  }
  /* Origin field for production plants is `source`, with values "seed" or "clone"
     (see #plant-source in index.html and isClonePlant in app.js). Mother/father
     records use .source as free-text "Source / notes", not this origin field.
     Breeding projects have no `source` field in the real snapshot. */
  function originOf(k) {
    const r = rec(k);
    if (!r) return { recorded: false, value: '' };
    if (String(k).startsWith('mf:')) return { recorded: false, value: '', mfNotes: r.source || '' };
    if (!Object.prototype.hasOwnProperty.call(r, 'source') || r.source == null || String(r.source).trim() === '')
      return { recorded: false, value: '' };
    return { recorded: true, value: String(r.source).trim() };
  }
  function ownsOwnTree(k) {
    k = resolveKey(k);
    if (!k || !rec(k)) return false;
    if (String(k).startsWith('mf:')) return true;
    const o = originOf(k);
    return o.recorded && o.value === 'seed';
  }
  function connectionLinks(k) {
    const links = []; const seen = new Set();
    const add = (role, key, extra) => {
      const q = resolveKey(key);
      if (!q || !rec(q) || seen.has(q) || q === resolveKey(k)) return;
      seen.add(q);
      links.push(Object.assign({ role, key: q, name: name(q) }, extra || {}));
    };
    const o = originOf(k);
    const isClone = (o.recorded && o.value === 'clone') || (typeof isClonePlant === 'function' && isClonePlant(rec(k)));
    /* A clone's mother is the plant it was cut from. Its recorded seed-parents
       are grandparents, so do not offer those trees as Mother's / Father's tree. */
    if (isClone) {
      const mom = linkedMotherKey(k);
      if (mom) add("Mother plant's tree", mom, { joined: 1 });
      return links;
    }
    const mom = linkedMotherKey(k);
    if (mom) add('Clone of', mom);
    const p = par2(k);
    if (p && p[0]) add("Mother's tree", p[0]);
    if (p && p[1]) add("Father's tree", p[1]);
    const r = rec(k);
    if (r && String(k).startsWith('pr:')) {
      if (r.motherId) add("Mother's tree", `mf:${r.motherId}`);
      if (r.fatherId) add("Father's tree", `mf:${r.fatherId}`);
    }
    return links;
  }
  function productionTreeTarget(k) {
    k = resolveKey(k);
    if (ownsOwnTree(k)) return { mode: 'open', key: k };
    return { mode: 'connect', key: k };
  }
  function routeTreePage(pg) {
    if (!pg || pg.type !== 'b49tree' || !pg.key) return pg;
    const raw = resolveKey(pg.key);
    const tgt = productionTreeTarget(raw);
    if (tgt.mode === 'connect') return Object.assign({}, pg, { type: 'b57connect', key: raw, fromProduction: raw });
    return pg;
  }
  function connectionPage(pg, head) {
    const k = pg && pg.key || '';
    const nm = name(k) || 'This plant';
    const o = originOf(k);
    const kind = String(k).startsWith('pr:') ? 'breeding project' : (String(k).startsWith('mf:') ? 'mother or father plant' : 'production plant');
    const isClone = (o.recorded && o.value === 'clone') || (typeof isClonePlant === 'function' && isClonePlant(rec(k)));
    const links = connectionLinks(k);
    const cards = links.length
      ? links.map((x) => {
          const title = x.joined ? `${x.role}: ${x.name}` : x.role;
          const sub = x.joined ? '' : `<small>${esc(x.name)}</small>`;
          return `<button type="button" class="m-card b57-ftbtn b57-conn" data-b57="tree" data-k="${esc(x.key)}">${TREE_SVG}<span><b>${esc(title)}</b>${sub}</span><i class="b18-chev" aria-hidden="true">›</i></button>`;
        }).join('')
      : (isClone
        ? '<div class="m-card b57-nomother"><b>No mother plant is linked</b><p class="m-s">This clone has no mother-plant link in the records, so a tree is not opened here.</p></div>'
        : '<div class="m-card b57-nomother"><b>No mother or father tree is linked</b><p class="m-s">There is no mother or father link in the records to open from here.</p></div>');
    const back = head || '<div class="b18-pagehead"><button type="button" class="b18-back br" data-b49="back">‹ Family tree</button></div>';
    return `<div class="b57" data-b57k="connect" data-b57lay="connect" data-b57connect="1">${back}<h2 class="b18-h1">Family tree</h2><p class="b57-subt">${esc(nm)}</p><div class="b57-conns">${cards}</div></div>`;
  }

  function noMotherPage(pg, head) {
    const k = pg && pg.key || '';
    const nm = name(k) || 'This plant';
    const back = head || '<div class="b18-pagehead"><button type="button" class="b18-back br" data-b49="back">‹ Back</button></div>';
    return `${back}<div class="b57" data-b57k="none" data-b57nomother="1"><h2 class="b18-h1">Family tree</h2><p class="b57-subt">${esc(nm)} · production run</p><div class="m-card b57-nomother"><b>No mother linked</b><p class="m-s">This is a production run. Family trees live on the mother plant. This plant has no mother link in the records, so a tree is not opened here.</p></div></div>`;
  }
  if (window.B49 && B49.openPage && !B49.openPage.b13from) {
    const _openPage = B49.openPage;
    B49.openPage = function (pg) {
      if (pg && pg.type === 'b49tree') pg = routeTreePage(pg);
      return _openPage.call(this, pg);
    };
    B49.openPage.b13from = 1;
  }
  function cloneOfOptions(cur) {
    const rows = (state.motherFatherPlants || []).filter((m) => m && m.id && m.name && !m.deleted);
    const opts = ['<option value="">Not linked</option>'];
    rows.forEach((m) => {
      const val = `mf:${m.id}`;
      const bits = [];
      if (m.role === 'father') bits.push('father');
      else if (m.role === 'mother') bits.push('mother');
      if (m.status === 'Retired' || m.archived) bits.push('retired');
      opts.push(`<option value="${esc(val)}"${val === cur ? ' selected' : ''}>${esc(m.name)}${bits.length ? ` (${esc(bits.join(', '))})` : ''}</option>`);
    });
    return { html: opts.join(''), sig: rows.map((m) => m.id).join(',') };
  }
  function cloneOfValue(plant) {
    const mid = String((plant && plant.motherPlantId) || '');
    if (!mid) return '';
    if (/^(pl|bp|mf|pr):/.test(mid)) return mid;
    if ((state.motherFatherPlants || []).some((m) => m.id === mid)) return `mf:${mid}`;
    return mid;
  }
  function setCloneOf(plantId, value) {
    const plant = (state.plants || []).find((p) => p.id === plantId);
    if (!plant || plant.source !== 'clone') return false;
    if (!value) { plant.motherPlantId = ''; plant.motherName = ''; }
    else {
      plant.motherPlantId = value;
      const id = String(value).replace(/^(pl|bp|mf|pr):/, '');
      const mm = (state.motherFatherPlants || []).find((m) => m.id === id);
      if (mm && mm.name) plant.motherName = mm.name;
    }
    if (typeof saveState === 'function' && !saveState()) return false;
    try { profileBtn(); } catch (e) { /* */ }
    try { cloneOfRow(); } catch (e) { /* */ }
    return true;
  }
  function cloneOfRow() {
    const v = document.getElementById('plant-detail-view');
    const old = v && v.querySelector('.b13-cloneof');
    if (!v || !v.classList.contains('active') || typeof detailPlantId !== 'function' || !detailPlantId() || (typeof detailColl !== 'undefined' && detailColl && detailColl !== 'plants')) {
      if (old) old.remove();
      return;
    }
    const plant = (state.plants || []).find((p) => p.id === detailPlantId());
    if (!plant || plant.source !== 'clone') { if (old) old.remove(); return; }
    const cur = cloneOfValue(plant);
    const pack = cloneOfOptions(cur);
    if (old) {
      const sel = old.querySelector('select');
      if (sel && document.activeElement === sel) return;
      if (sel && sel.value === cur && old.dataset.sig === pack.sig) return;
      old.remove();
    }
    const at = v.querySelector('.b57-ftbtn') || v.querySelector('.pd-quick');
    if (!at) return;
    at.insertAdjacentHTML('afterend', `<div class="m-card b13-cloneof" data-b13cloneof="1" data-sig="${esc(pack.sig)}"><label><b>Clone of</b><small>Optional. Links this production run to a Mothers &amp; Fathers plant. The family tree opens that plant's tree.</small><select class="b13-cloneof-sel" aria-label="Clone of" data-plant="${esc(plant.id)}">${pack.html}</select></label></div>`);
  }
  document.addEventListener('change', (e) => {
    const sel = e.target && e.target.closest && e.target.closest('select.b13-cloneof-sel');
    if (!sel) return;
    setCloneOf(sel.dataset.plant, sel.value);
  });
  /* The approved clone and mother record ids are matched by a one-way hash so
     private record ids are not stored in public code. */
  const B13_CLONE_PLANT_HASH = 17572939175159;
  const B13_CLONE_MOTHER_HASH = 4293826021346097;
  const B13_MIG_FLAG = 'boriken-b13-clone-mother-mig-v1';
  const B13_MIG_BACKUP = 'boriken-b13-clone-mother-prebackup-v1';
  function b13Store() { try { return (typeof getBrowserStorage === 'function' && getBrowserStorage()) || localStorage; } catch (e) { return null; } }
  function migrateCloneMother() {
    const store = b13Store();
    try { if (store && store.getItem(B13_MIG_FLAG) === '1') return { status: 'skipped' }; } catch (e) { /* */ }
    const plant = (state.plants || []).find((p) => p && p.id && idHash(String(p.id)) === B13_CLONE_PLANT_HASH);
    const mother = (state.motherFatherPlants || []).find((m) => m && m.id && idHash(String(m.id)) === B13_CLONE_MOTHER_HASH);
    if (!plant || !mother) return { status: 'missing' };
    const B13_MOTHER_ID = String(mother.id);
    const B13_MOTHER_KEY = `mf:${B13_MOTHER_ID}`;
    const cur = String(plant.motherPlantId || '');
    if (cur === B13_MOTHER_KEY || cur === B13_MOTHER_ID) {
      try { if (store) store.setItem(B13_MIG_FLAG, '1'); } catch (e) { /* */ }
      return { status: 'already' };
    }
    if (plant.source !== 'clone') return { status: 'not-clone' };
    if (cur) return { status: 'has-other-link' };
    const before = JSON.parse(JSON.stringify(plant));
    const hadField = Object.prototype.hasOwnProperty.call(plant, 'motherPlantId');
    try {
      if (typeof createSnapshot === 'function') createSnapshot('pre-b13-clone-mother');
      if (!store) throw new Error('no storage for backup');
      store.setItem(B13_MIG_BACKUP, JSON.stringify({ at: new Date().toISOString(), reason: 'pre-b13-clone-mother', plantId: plant.id, before }));
    } catch (e) {
      return { status: 'backup-failed', error: String(e && e.message || e) };
    }
    const restoreRecord = () => {
      Object.keys(plant).forEach((k) => { if (!Object.prototype.hasOwnProperty.call(before, k)) delete plant[k]; });
      Object.assign(plant, JSON.parse(JSON.stringify(before)));
      if (!hadField) delete plant.motherPlantId;
    };
    try {
      plant.motherPlantId = B13_MOTHER_KEY;
      if (plant.motherPlantId !== B13_MOTHER_KEY) throw new Error('write failed');
      if (typeof saveState === 'function' && !saveState()) throw new Error('save failed');
      try { if (store) store.setItem(B13_MIG_FLAG, '1'); } catch (e) { /* */ }
      return { status: 'applied', motherPlantId: plant.motherPlantId };
    } catch (e) {
      try { restoreRecord(); if (typeof saveState === 'function') saveState(); } catch (err) { /* */ }
      return { status: 'rolled-back', error: String(e && e.message || e) };
    }
  }
  const b13Mig = migrateCloneMother();

  function clearEdgeCrossings(svg) {
    const pathOf = (t) => { const g = t.closest('.b57-seg'); return g && g.querySelector('path'); };
    const svgPt = (x, y) => {
      const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
      const m = svg.getScreenCTM(); if (!m) return null;
      return pt.matrixTransform(m.inverse());
    };
    const inPath = (path, x, y) => {
      if (!path || !path.isPointInFill) return true;
      const p = svgPt(x, y); if (!p) return true;
      try { return path.isPointInFill(p); } catch (e) { return true; }
    };
    const countOut = (t, path) => {
      const boxes = [t.getBoundingClientRect()];
      t.querySelectorAll('tspan').forEach((sp) => {
        const b = sp.getBoundingClientRect();
        if (b.width > 0.5 && b.height > 0.5) boxes.push(b);
      });
      let n = 0;
      boxes.forEach((b) => {
        const ox = 0.6, oy = 0.6;
        [
          [b.left - ox, b.top - oy], [b.right + ox, b.top - oy],
          [b.left - ox, b.bottom + oy], [b.right + ox, b.bottom + oy],
          [(b.left + b.right) / 2, b.top - oy], [(b.left + b.right) / 2, b.bottom + oy],
          [b.left - ox, (b.top + b.bottom) / 2], [b.right + ox, (b.top + b.bottom) / 2]
        ].forEach(([x, y]) => { if (!inPath(path, x, y)) n++; });
      });
      return n;
    };
    const nudge = (t, dx, dy) => {
      const x = parseFloat(t.getAttribute('x'));
      const y = parseFloat(t.getAttribute('y'));
      if (Number.isFinite(x) && dx) {
        t.setAttribute('x', (x + dx).toFixed(1));
        t.querySelectorAll('tspan').forEach((s) => { if (s.hasAttribute('x')) s.setAttribute('x', (parseFloat(s.getAttribute('x')) + dx).toFixed(1)); });
      }
      if (Number.isFinite(y) && dy) t.setAttribute('y', (y + dy).toFixed(1));
    };
    const rim = [...svg.querySelectorAll('.b57-ctr circle')].sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0]
      || svg.querySelector('.b57-ctr circle');
    let hub = null;
    if (rim) {
      const cr = rim.getBoundingClientRect();
      hub = { cx: (cr.left + cr.right) / 2, cy: (cr.top + cr.bottom) / 2, clear: Math.min(cr.width, cr.height) / 2 + 4 };
    }
    const countHub = (t) => {
      if (!hub) return 0;
      const boxes = [t.getBoundingClientRect()];
      t.querySelectorAll('tspan').forEach((sp) => {
        const b = sp.getBoundingClientRect();
        if (b.width > 0.5 && b.height > 0.5) boxes.push(b);
      });
      let n = 0;
      boxes.forEach((b) => {
        [
          [b.left, b.top], [b.right, b.top], [b.left, b.bottom], [b.right, b.bottom],
          [(b.left + b.right) / 2, b.top], [(b.left + b.right) / 2, b.bottom],
          [b.left, (b.top + b.bottom) / 2], [b.right, (b.top + b.bottom) / 2]
        ].forEach(([x, y]) => { if (Math.hypot(x - hub.cx, y - hub.cy) < hub.clear) n++; });
      });
      return n;
    };
    const dirs = [];
    for (let s = 0.5; s <= 16; s += 0.5) {
      dirs.push([0, -s], [0, s], [-s, 0], [s, 0]);
      if (s <= 8) dirs.push([-s, -s], [s, s], [-s, s], [s, -s]);
    }
    svg.querySelectorAll('.b57-seg').forEach((g) => {
      const path = g.querySelector('path');
      const texts = [...g.querySelectorAll('text')];
      if (!path || !texts.length) return;
      const countOutAll = () => texts.reduce((n, t) => n + countOut(t, path), 0);
      const countHubAll = () => texts.reduce((n, t) => n + countHub(t), 0);
      const nudgeAll = (dx, dy) => texts.forEach((t) => nudge(t, dx, dy));
      let o = countOutAll();
      let h = countHubAll();
      if (!o && !h) return;
      let best = { n: o, h, dx: 0, dy: 0 };
      dirs.forEach(([dx, dy]) => {
        nudgeAll(dx, dy);
        const n = countOutAll();
        const hh = countHubAll();
        if (hh < best.h || (hh === best.h && n < best.n)) best = { n, h: hh, dx, dy };
        nudgeAll(-dx, -dy);
      });
      if (best.dx || best.dy) nudgeAll(best.dx, best.dy);
    });
  }
    function fitSvgTreeLabels() {
    const root = document.querySelector('#breeding-view .b57'); if (!root) return;
    const vwL = 6, vwR = innerWidth - 6;
    const svgPt = (svg, x, y) => {
      const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
      const m = svg.getScreenCTM(); if (!m) return null;
      return pt.matrixTransform(m.inverse());
    };
    const inPath = (svg, path, x, y) => {
      if (!path || !path.isPointInFill) return true;
      const p = svgPt(svg, x, y); if (!p) return true;
      try { return path.isPointInFill(p); } catch (e) { return true; }
    };
    const measure = (svg, textEl, s) => {
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const cs = getComputedStyle(textEl);
      tmp.setAttribute('x', '-9999');
      tmp.setAttribute('style', `font-size:${cs.fontSize};font-weight:${cs.fontWeight};font-family:${cs.fontFamily};letter-spacing:${cs.letterSpacing}`);
      tmp.textContent = s;
      svg.appendChild(tmp);
      let w = 0;
      try { w = tmp.getComputedTextLength(); } catch (e) { w = s.length * (parseFloat(cs.fontSize) || 10) * 0.62; }
      svg.removeChild(tmp);
      return w;
    };
    const reflowText = (svg, t) => {
      const full = t.getAttribute('data-full'); if (!full) return;
      const g = t.closest('.b57-seg');
      const maxW = parseFloat(t.getAttribute('data-maxw') || (g && g.getAttribute('data-maxw')) || 0);
      if (!(maxW > 8)) return;
      const words = full.split(/\s+/).filter(Boolean);
      const x = parseFloat(t.getAttribute('x')); if (!Number.isFinite(x)) return;
      const pack = (fs) => {
        t.style.fontSize = fs.toFixed(1) + 'px';
        const lines = []; let cur = '';
        words.forEach((w) => {
          const next = cur ? `${cur} ${w}` : w;
          if (!cur || measure(svg, t, next) <= maxW + 0.6) cur = next;
          else { if (cur) lines.push(cur); cur = w; }
        });
        if (cur) lines.push(cur);
        const too = lines.some((l) => measure(svg, t, l) > maxW + 0.6);
        return { lines: lines.length ? lines : [full], too };
      };
      const ctm = svg.getScreenCTM();
      const sc = ctm ? Math.max(0.5, Math.abs(ctm.a)) : 1;
      const minFs = 11 / sc + 0.25;
      let fs = parseFloat(t.style.fontSize) || parseFloat(getComputedStyle(t).fontSize) || 13;
      let { lines, too } = pack(fs);
      while ((too || lines.length > 6) && fs > minFs) {
        fs -= 0.25;
        ({ lines, too } = pack(fs));
      }
      while (too && fs > minFs) {
        fs -= 0.2;
        ({ lines, too } = pack(fs));
      }
      if (fs < minFs) fs = minFs;
      t.style.fontSize = fs.toFixed(1) + 'px';
      const dy = (fs * 1.0).toFixed(1);
      t.textContent = '';
      lines.forEach((l, i) => {
        const s = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        s.setAttribute('x', x.toFixed(1));
        s.setAttribute('dy', i ? dy : '0');
        s.textContent = l;
        t.appendChild(s);
      });
    };
    const recenterSeg = (g) => {
      const cy = parseFloat(g.getAttribute('data-cy'));
      const band = parseFloat(g.getAttribute('data-band'));
      if (!Number.isFinite(cy)) return;
      const texts = [...g.querySelectorAll('text')];
      if (!texts.length) return;
      const boxes = texts.map((t) => t.getBBox());
      const top = Math.min(...boxes.map((b) => b.y));
      const bot = Math.max(...boxes.map((b) => b.y + b.height));
      const midY = (top + bot) / 2;
      let dy = cy - midY;
      if (Math.abs(dy) < 0.4) dy = 0;
      if (Number.isFinite(band) && band > 0) {
        const half = band / 2;
        const newTop = top + dy, newBot = bot + dy;
        if (newTop < cy - half) dy += (cy - half) - newTop;
        if (newBot + dy > cy + half) dy -= (newBot + dy) - (cy + half);
        /* If the block is taller than the band, pin it to the mid and leave clipping to omitted roles. */
        if (bot - top > band) dy = cy - (top + bot) / 2;
      }
      if (Math.abs(dy) < 0.4) return;
      texts.forEach((t) => {
        const y = parseFloat(t.getAttribute('y'));
        if (Number.isFinite(y)) t.setAttribute('y', (y + dy).toFixed(1));
      });
    };
    root.querySelectorAll('svg.b57-svg').forEach((svg) => {
      if (svg.hasAttribute('data-solved')) return; /* b64: measured solver placed these; never nudge / shrink / reflow */
      svg.querySelectorAll('.b57-seg text[data-full]').forEach((t) => reflowText(svg, t));
      svg.querySelectorAll('.b57-seg[data-cy]').forEach(recenterSeg);
      const svgR = svg.getBoundingClientRect();
      const segs = [...svg.querySelectorAll('.b57-seg')];
      const boxes = () => segs.map((g) => ({ g, path: g.querySelector('path'), texts: [...g.querySelectorAll('text')].map((t) => ({ t, r: t.getBoundingClientRect() })) }));
      const hubEl = svg.querySelector('.b57-ctr circle.rim') || svg.querySelector('.b57-ctr circle');
      let hub = null;
      if (hubEl) {
        const hr = hubEl.getBoundingClientRect();
        hub = { x: (hr.left + hr.right) / 2, y: (hr.top + hr.bottom) / 2, r: Math.min(hr.width, hr.height) / 2 + 4 };
      }
      const hitsHub = (r) => {
        if (!hub) return false;
        const pts = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]];
        return pts.some(([x, y]) => Math.hypot(x - hub.x, y - hub.y) < hub.r);
      };
      const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      const ctm0 = svg.getScreenCTM();
      const sc0 = ctm0 ? Math.max(0.5, Math.sqrt(ctm0.a * ctm0.a + ctm0.b * ctm0.b)) : 1;
      const floorFs = 11 / sc0 + 0.25;
      const shrink = (g, factor) => {
        g.querySelectorAll('text').forEach((n) => {
          const fs = parseFloat((n.style && n.style.fontSize) || getComputedStyle(n).fontSize) || 14;
          const next = fs * factor;
          if (next < floorFs - 0.01) return; /* never drop below 11 CSS px */
          n.style.fontSize = next + 'px';
          n.querySelectorAll('tspan').forEach((s) => { s.style.fontSize = ''; });
        });
      };
      const nudge = (t, dx, dy) => {
        const x = parseFloat(t.getAttribute('x'));
        const y = parseFloat(t.getAttribute('y'));
        if (Number.isFinite(x) && dx) {
          t.setAttribute('x', (x + dx).toFixed(1));
          t.querySelectorAll('tspan').forEach((s) => { if (s.hasAttribute('x')) s.setAttribute('x', (parseFloat(s.getAttribute('x')) + dx).toFixed(1)); });
        }
        if (Number.isFinite(y) && dy) t.setAttribute('y', (y + dy).toFixed(1));
      };
      for (let pass = 0; pass < 14; pass++) {
        let moved = false;
        boxes().forEach(({ g, path, texts }) => {
          if (!texts.length) return;
          const nudgeAll = (dx, dy) => texts.forEach(({ t }) => nudge(t, dx, dy));
          const unit = svgR.width / ((svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width) || 380);
          const union = texts.reduce((u, { r }) => ({
            left: Math.min(u.left, r.left), right: Math.max(u.right, r.right),
            top: Math.min(u.top, r.top), bottom: Math.max(u.bottom, r.bottom)
          }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
          if (texts.some(({ r }) => hitsHub(r))) {
            const mx = (union.left + union.right) / 2, my = (union.top + union.bottom) / 2;
            const vx = mx - hub.x, vy = my - hub.y, len = Math.hypot(vx, vy) || 1;
            const need = (hub.r + 2) - Math.min(...texts.map(({ r }) => Math.min(
              Math.hypot(r.left - hub.x, r.top - hub.y),
              Math.hypot(r.right - hub.x, r.top - hub.y),
              Math.hypot(r.left - hub.x, r.bottom - hub.y),
              Math.hypot(r.right - hub.x, r.bottom - hub.y)
            )));
            if (need > 0) {
              nudgeAll((vx / len) * (need / unit), (vy / len) * (need / unit));
              moved = true;
            }
            return;
          }
          if (union.left < Math.max(vwL, svgR.left + 2)) { nudgeAll((Math.max(vwL, svgR.left + 2) - union.left) / unit, 0); moved = true; }
          if (union.right > Math.min(vwR, svgR.right - 2)) { nudgeAll((Math.min(vwR, svgR.right - 2) - union.right) / unit, 0); moved = true; }
          if (path) {
            const countOut = (node) => {
              const boxes = [node.getBoundingClientRect()];
              node.querySelectorAll('tspan').forEach((sp) => {
                const b = sp.getBoundingClientRect();
                if (b.width > 0.5 && b.height > 0.5) boxes.push(b);
              });
              let n = 0;
              boxes.forEach((b) => {
                const ox = 0.6, oy = 0.6;
                [
                  [b.left - ox, b.top - oy], [b.right + ox, b.top - oy],
                  [b.left - ox, b.bottom + oy], [b.right + ox, b.bottom + oy],
                  [(b.left + b.right) / 2, b.top - oy], [(b.left + b.right) / 2, b.bottom + oy],
                  [b.left - ox, (b.top + b.bottom) / 2], [b.right + ox, (b.top + b.bottom) / 2]
                ].forEach(([x, y]) => { if (!inPath(svg, path, x, y)) n++; });
              });
              return n;
            };
            const countOutAll = () => texts.reduce((n, { t }) => n + countOut(t), 0);
            let o = countOutAll();
            if (o) {
              const dirs = [[0,-1],[0,1],[-1,0],[1,0],[0,-2],[0,2],[-2,0],[2,0],[0,-3],[0,3],[-3,0],[3,0],[0,-4],[0,4],[-1,-1],[1,1],[-1,1],[1,-1],[0,-5],[0,5],[-4,0],[4,0],[-2,-2],[2,2],[0,-6],[0,6],[-6,0],[6,0],[0,-8],[0,8],[-8,0],[8,0],[0,-10],[0,10],[-10,0],[10,0],[0,-12],[0,12],[-12,0],[12,0]];
              let best = { n: o, dx: 0, dy: 0 };
              dirs.forEach(([dx, dy]) => {
                nudgeAll(dx, dy);
                const n = countOutAll();
                if (n < best.n) best = { n, dx, dy };
                nudgeAll(-dx, -dy);
              });
              if (best.dx || best.dy) {
                nudgeAll(best.dx, best.dy);
                moved = true;
              } else {
                /* Last resort: a tiny shrink, never below 11 CSS px. */
                shrink(g, 0.96);
                const svg2 = g.ownerSVGElement;
                if (svg2) texts.forEach(({ t }) => reflowText(svg2, t));
                moved = true;
              }
            }
          }
        });
        const B = boxes();
        for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
          B[i].texts.forEach((a) => B[j].texts.forEach((b) => {
            if (overlap(a.r, b.r)) { shrink(B[i].g, 0.92); shrink(B[j].g, 0.92); moved = true; }
          }));
        }
        B.forEach(({ g, texts }) => {
          const t1 = texts.filter((x) => x.t.classList.contains('t1') || !x.t.classList.contains('t2'));
          const t2 = texts.filter((x) => x.t.classList.contains('t2'));
          t2.forEach((b) => t1.forEach((a) => {
            if (a.t !== b.t && overlap(a.r, b.r)) {
              nudge(b.t, 0, 2);
              shrink(g, 0.95);
              moved = true;
            }
          }));
        });
        if (!moved) break;
      }
      /* Do not recenter after edge nudges — that walks labels back onto arcs. */
      clearEdgeCrossings(svg);
    });
  }
  function trimHangingStrings() {

    const root = document.querySelector('#breeding-view .b57'); if (!root) return;
    const texts = [];
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) {
      const node = tw.currentNode; if (!(node.nodeValue || '').trim()) continue;
      const el = node.parentElement; if (!el || el.closest('svg')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
      const rg = document.createRange(); rg.selectNodeContents(node);
      [...rg.getClientRects()].forEach((r) => { if (r.width > 1 && r.height > 1) texts.push(r); });
    }
    const shorten = (host, full) => {
      const r = host.getBoundingClientRect(); if (!(r.width > 0)) return;
      const x = r.left + r.width / 2; const y0 = r.top - full; const y1 = r.top;
      let h = full;
      texts.forEach((t) => {
        if (x <= t.left + 0.5 || x >= t.right - 0.5) return;
        if (Math.min(y1, t.bottom) - Math.max(y0, t.top) > 0.5) {
          const gap = r.top - t.bottom;
          if (gap < h) h = Math.max(0, gap - 1);
        }
      });
      host.style.setProperty('--str-h', h + 'px');
    };
    root.querySelectorAll('.b57-me, .b57-row > *').forEach((el) => shorten(el, 14));
    root.querySelectorAll('.b57-bar.fl').forEach((el) => shorten(el, 14));
    snapStyleConnectors(root);
    snapAzulejoBracket(root);
    snapUpPairBracket(root);
    snapLineCards(root);
  }
  /* Ceiba / Mobile / River only: stretch stems, ticks and strings so each end touches a card or bar. */
  function snapStyleConnectors(root) {
    const k = root.getAttribute('data-b57k');
    if (k !== 'ceiba' && k !== 'mobile' && k !== 'river') return;
    const sel = '.b57-n, .b59-pc, .b59-pair, .b57-ban, .b57-bar, .b57-mob-bar, .b57-bred, .b59-plab';
    const targetRects = (skip) => [...root.querySelectorAll(sel)]
      .filter((n) => !skip || (n !== skip && !skip.contains(n) && !n.contains(skip)))
      .map((n) => n.getBoundingClientRect())
      .filter((r) => r.width > 1 && r.height > 1);
    const searchRect = (x, y0, dir, max, skip, edge = -2) => {
      let best = null, bestD = max + 0.01;
      targetRects(skip).forEach((r) => {
        if (x < r.left + edge || x > r.right - edge) return;
        const d = dir < 0 ? (y0 - r.bottom) : (r.top - y0);
        if (d > 0.2 && d < bestD) { bestD = d; best = r; }
      });
      return best;
    };
    const searchX = (x0, y, dir, max, skip) => {
      let best = null, bestD = max + 0.01;
      targetRects(skip).forEach((r) => {
        if (y < r.top - 2 || y > r.bottom + 2) return;
        const d = dir < 0 ? (x0 - r.right) : (r.left - x0);
        if (d > 0.2 && d < bestD) { bestD = d; best = r; }
      });
      return best;
    };
    const MAX = 56;
    /* Reset first so repeated interval calls stay idempotent and never accumulate. */
    root.querySelectorAll('.b57-tree-stem, .b57-riv-tick.mid, .b57-mob-str, .b57-riv-tick:not(.mid), .b57-tree-limb, .b57-tree-join, .b57-tree-joinbar, .b59-brk, .b57-riv-merge').forEach((el) => {
      el.style.height = '';
      el.style.width = '';
      el.style.flexBasis = '';
      el.style.minHeight = '';
      el.style.marginTop = '';
      el.style.marginBottom = '';
      el.style.marginLeft = '';
      el.style.marginRight = '';
      el.style.alignSelf = '';
      el.style.left = '';
      el.style.top = '';
      el.style.position = '';
      el.style.display = '';
      el.style.flex = '';
    });
    root.querySelectorAll('.b57-tree-stem, .b57-riv-tick.mid, .b57-mob-str').forEach((el) => {
      if (el.classList.contains('mid') && el.classList.contains('b57-mob-str')) return;
      if (el.classList.contains('b57-tree-to-me') || el.classList.contains('b57-tree-to-kids')) return;
      if (el.closest('.b57-riv-merge')) return;
      const r = el.getBoundingClientRect();
      if (!(r.height > 0.5)) return;
      const x = (r.left + r.right) / 2;
      /* b64 (Elio, Nov 10): a parent's string reaches up past its bar only to a card it meets squarely, never to the corner of a neighbour's tag */
      const parStr = el.classList.contains('b57-mob-str') && !!el.closest('.b57-mob-hang.row.pars');
      const up = searchRect(x, r.top, -1, MAX, el, parStr ? 8 : -2);
      const down = searchRect(x, r.bottom, 1, MAX, el);
      const topGap = up ? (r.top - up.bottom) : 0;
      const botGap = down ? (down.top - r.bottom) : 0;
      const growTop = (up && topGap > 0.4 && topGap < MAX) ? topGap + 2 : 0;
      const growBot = (down && botGap > 0.4 && botGap < MAX) ? botGap + 2 : 0;
      if (!growTop && !growBot) return;
      const mt = parseFloat(getComputedStyle(el).marginTop) || 0;
      const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
      el.style.height = (r.height + growTop + growBot) + 'px';
      el.style.flexBasis = (r.height + growTop + growBot) + 'px';
      if (growTop) el.style.marginTop = (mt - growTop) + 'px';
      if (growBot) el.style.marginBottom = (mb - growBot) + 'px';
    });
    root.querySelectorAll('.b57-riv-tick:not(.mid)').forEach((el) => {
      if (el.closest('.b57-riv-merge')) return;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0.5)) return;
      const y = (r.top + r.bottom) / 2;
      const left = searchX(r.left, y, -1, MAX, el);
      const right = searchX(r.right, y, 1, MAX, el);
      const leftGap = left ? (r.left - left.right) : 0;
      const rightGap = right ? (right.left - r.right) : 0;
      const gL = (left && leftGap > 0.4 && leftGap < MAX) ? leftGap + 1 : 0;
      const gR = (right && rightGap > 0.4 && rightGap < MAX) ? rightGap + 1 : 0;
      if (!gL && !gR) return;
      const ml = parseFloat(getComputedStyle(el).marginLeft) || 0;
      const mr = parseFloat(getComputedStyle(el).marginRight) || 0;
      el.style.width = (r.width + gL + gR) + 'px';
      el.style.flexBasis = (r.width + gL + gR) + 'px';
      if (gL) el.style.marginLeft = (ml - gL) + 'px';
      if (gR) el.style.marginRight = (mr - gR) + 'px';
    });
    root.querySelectorAll('.b57-tree-limb, .b57-tree-join, .b59-brk').forEach((el) => {
      if (el.classList.contains('b57-tree-join')) return;
      const r = el.getBoundingClientRect();
      const upL = searchRect(r.left + 1, r.top, -1, MAX, el);
      const upR = searchRect(r.right - 1, r.top, -1, MAX, el);
      const down = searchRect((r.left + r.right) / 2, r.bottom, 1, MAX, el);
      const gapUp = Math.min(upL ? r.top - upL.bottom : 99, upR ? r.top - upR.bottom : 99);
      const gapDn = down ? (down.top - r.bottom) : 0;
      const gU = (gapUp > 0.4 && gapUp < MAX) ? gapUp + 1 : 0;
      const gD = (gapDn > 0.4 && gapDn < MAX) ? gapDn + 1 : 0;
      if (!gU && !gD) return;
      const mt = parseFloat(getComputedStyle(el).marginTop) || 0;
      const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
      el.style.height = (r.height + gU + gD) + 'px';
      if (gU) el.style.marginTop = (mt - gU) + 'px';
      if (gD) el.style.marginBottom = (mb - gD) + 'px';
    });
    /* Mobile CA / LA: a string ends on the circle's outer ring, not inside it */
    root.querySelectorAll('.b57-mob-hang.row.pair .b57-mob-leaf > .b57-mob-str').forEach((el) => {
      const ph = el.parentElement.querySelector('.b57-ph'); if (!ph) return;
      const m = String(getComputedStyle(ph).boxShadow || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g) || [];
      const sp = m.reduce((a, t) => Math.max(a, parseFloat(t.trim().split(/\s+/)[3]) || 0), 0);
      const r = el.getBoundingClientRect(); const want = ph.getBoundingClientRect().top - sp + 1; const d = want - r.bottom;
      if (Math.abs(d) < 0.3) return;
      const mb = parseFloat(getComputedStyle(el).marginBottom) || 0;
      el.style.height = (r.height + d) + 'px'; el.style.flexBasis = (r.height + d) + 'px'; el.style.marginBottom = (mb - d) + 'px';
    });
    snapCeibaTrunk(root);
    snapRiverMerge(root);
  }
  function snapCeibaTrunk(root) {
    if (root.getAttribute('data-b57k') !== 'ceiba') return;
    const tree = root.querySelector('.b57-tree');
    const join = root.querySelector('.b57-tree-join');
    const bar = root.querySelector('.b57-tree-joinbar');
    const pars = [...root.querySelectorAll('.b57-tree-par .b57-n')];
    const me = root.querySelector('.b59-pc.me, .b57-me');
    const toMe = root.querySelector('.b57-tree-to-me');
    const toKids = root.querySelector('.b57-tree-to-kids');
    if (!tree) return;
    /* take both stems out of the flow before measuring, so CA is measured where it really sits */
    [toMe, toKids].forEach((st) => { if (st) { st.style.position = 'absolute'; st.style.margin = '0'; } });
    const tr = tree.getBoundingClientRect();
    if (join && pars.length) {
      const xs = pars.map((n) => {
        const r = n.getBoundingClientRect();
        return (r.left + r.right) / 2 - tr.left;
      });
      const L = Math.min(...xs), R = Math.max(...xs);
      const w = Math.max(8, R - L);
      join.style.position = 'relative';
      join.style.left = L + 'px';
      join.style.marginLeft = '0';
      join.style.marginRight = '0';
      join.style.width = w + 'px';
      const jr = join.getBoundingClientRect();
      const gapUp = jr.top - Math.max(...pars.map((n) => n.getBoundingClientRect().bottom));
      if (gapUp > 0.4 && gapUp < 80) {
        const mt = parseFloat(getComputedStyle(join).marginTop) || 0;
        join.style.height = (jr.height + gapUp + 1) + 'px';
        join.style.marginTop = (mt - gapUp - 1) + 'px';
      }
      if (bar) {
        const jr2 = join.getBoundingClientRect();
        bar.style.position = 'absolute';
        bar.style.left = (jr2.left - tr.left) + 'px';
        bar.style.top = (jr2.bottom - tr.top - 2) + 'px';
        bar.style.width = jr2.width + 'px';
        bar.style.height = '2px';
        bar.style.margin = '0';
      }
    }
    const placeAbs = (stem, x, y0, y1) => {
      if (!stem) return;
      const top = Math.min(y0, y1), h = Math.max(2, Math.abs(y1 - y0));
      stem.style.position = 'absolute';
      stem.style.left = (x - 1) + 'px';
      stem.style.top = top + 'px';
      stem.style.width = '2px';
      stem.style.height = h + 'px';
      stem.style.margin = '0';
      stem.style.flex = 'none';
    };
    const circ = (me && me.querySelector('.b57-ph')) || me;
    const ringOut = (el) => { const m = String(getComputedStyle(el).boxShadow || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g) || []; return m.reduce((a, t) => Math.max(a, parseFloat(t.trim().split(/\s+/)[3]) || 0), 0); };
    if (toMe && me && pars.length === 1 && root.querySelector('.b57-tree-canopy.one')) {
      if (join) join.style.display = 'none'; if (bar) bar.style.display = 'none';
      const mr = circ.getBoundingClientRect(); const sp = ringOut(circ); const pr = pars[0].getBoundingClientRect();
      placeAbs(toMe, (mr.left + mr.right) / 2 - tr.left, pr.bottom - tr.top - 1, mr.top - sp - tr.top + 1);
    } else if (toMe && me && join) {
      const mr = circ.getBoundingClientRect(); const sp = ringOut(circ);
      const jr = (bar || join).getBoundingClientRect();
      placeAbs(toMe, (mr.left + mr.right) / 2 - tr.left, (jr.top + jr.bottom) / 2 - tr.top, mr.top - sp - tr.top + 1);
    }
    if (toKids && me) {
      const kid = root.querySelector('.b59-kids .b57-n, .b57-n.kid, [data-kid="1"]') || (toKids.nextElementSibling && toKids.nextElementSibling.querySelector('.b57-n'));
      if (kid) {
        /* the trunk to the kids starts under CA's banner, so it never runs behind the banner's text */
        const mr = circ.getBoundingClientRect();
        const banEl = root.querySelector('.b57-tree .b59-labs .b57-ban') || me.querySelector('.b57-ban');
        const y0 = banEl ? banEl.getBoundingClientRect().bottom - 1 : mr.bottom + ringOut(circ) - 1;
        const kr = kid.getBoundingClientRect();
        placeAbs(toKids, (mr.left + mr.right) / 2 - tr.left, y0 - tr.top, kr.top - tr.top + 1);
      }
    }
  }
  /* b64 (Chief, Nov 10): no floating cards. Roots: this plant's banner -> its parents -> each parent's grandparents.
     Certificate with one parents card: this plant's banner -> that card. Window: each parent -> its grandparents card(s).
     Lines are one SVG per block, in the style's own line colour; elbows sit just above the lower cards, clear of every heading. */
  function snapLineCards(root) {
    const k = root.getAttribute('data-b57k');
    const ns = 'http://www.w3.org/2000/svg';
    /* b64 (Elio, Nov 10): the tree can sit under CSS zoom (1.28 at 1024 px). Client rects are zoomed, the overlay's own units are not, so measure in the overlay's units. */
    const Z = (root.getBoundingClientRect().width / (root.offsetWidth || 1)) || 1;
    const sc = (r) => (Z === 1 ? r : { left: r.left / Z, right: r.right / Z, top: r.top / Z, bottom: r.bottom / Z, width: r.width / Z, height: r.height / Z });
    const R = (el) => sc(el.getBoundingClientRect());
    const overlay = (host, cls) => { let svg = host.querySelector(`:scope > svg.${cls}`); if (!svg) { svg = document.createElementNS(ns, 'svg'); svg.setAttribute('class', 'b64-lines ' + cls); svg.setAttribute('aria-hidden', 'true'); svg.appendChild(document.createElementNS(ns, 'path')); host.prepend(svg); }
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const H0 = R(host); const H = { left: H0.left + host.clientLeft, top: H0.top + host.clientTop, width: host.clientWidth, height: host.clientHeight }; Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: H.width + 'px', height: H.height + 'px', overflow: 'visible', pointerEvents: 'none' }); svg.setAttribute('viewBox', `0 0 ${H.width} ${H.height}`); return { svg, H }; };
    const f2 = (v) => +v.toFixed(2);
    /* parent (above) -> children (below): straight down when one child sits under it, else a bracket just above the children */
    const link = (H, up, kids, opts = {}) => {
      if (!up || !kids.length) return '';
      const U = R(up); const ux0 = U.left - H.left, ux1 = U.right - H.left; const uy = U.bottom - H.top - (opts.inset || 1);
      const K = kids.map((c) => { const r = R(c); return { x: (r.left + r.right) / 2 - H.left, l: r.left - H.left, r: r.right - H.left, y: r.top - H.top + 1 }; });
      const blocked1 = (opts.block || []).some((b) => b.top > uy && b.bottom < K[0].y);
      if (K.length === 1 && !blocked1) { const c = K[0]; const lo = Math.max(ux0 + 12, c.l + 12), hi = Math.min(ux1 - 12, c.r - 12);
        if (lo <= hi) { const want = Math.min(hi, Math.max(lo, opts.x != null ? opts.x : c.x));
          /* keep 4 px+ off any heading text the stem passes */
          const tx = []; const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (tw.nextNode()) { const n = tw.currentNode; if (!n.nodeValue.trim() || n.parentElement.closest('svg')) continue; const g = document.createRange(); g.selectNodeContents(n); [...g.getClientRects()].map(sc).forEach((b) => { const t = b.top - H.top, bt = b.bottom - H.top; if (b.width && bt > uy + 1 && t < c.y - 1) tx.push([b.left - H.left - 5, b.right - H.left + 5]); }); }
          const free = (x) => !tx.some(([a, b]) => x > a && x < b);
          let x = want; if (!free(x)) { let bestX = null; for (let v = lo; v <= hi; v += 1) if (free(v) && (bestX == null || Math.abs(v - want) < Math.abs(bestX - want))) bestX = v; if (bestX != null) x = bestX; }
          return `M${f2(x)} ${f2(uy)}V${f2(c.y)}`; } }
      let ux = Math.min(ux1 - 12, Math.max(ux0 + 12, opts.x != null ? opts.x : (ux0 + ux1) / 2));
      let my = opts.my != null ? opts.my : Math.min(...K.map((c) => c.y)) - (opts.drop || 9);
      /* b64 (Elio, Nov 10): the trunk keeps 4 px+ off any heading or empty-state text it passes, as the single-child stem already does.
         If it cannot step round a heading, the bracket sits above that heading and its stems pass beside it. */
      const TX = []; { const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (tw.nextNode()) { const n = tw.currentNode; if (!n.nodeValue.trim() || n.parentElement.closest('svg')) continue; const g = document.createRange(); g.selectNodeContents(n); [...g.getClientRects()].map(sc).forEach((b) => { if (b.width) TX.push([b.left - H.left - 5, b.right - H.left + 5, b.top - H.top - 5, b.bottom - H.top + 5]); }); } }
      const freeAt = (x, y0, y1) => !TX.some(([a, b, t, bt]) => x > a && x < b && bt > y0 && t < y1);
      let lifted = false;
      if (!freeAt(ux, uy + 1, my - 1)) { let bestX = null; for (let v = ux0 + 12; v <= ux1 - 12; v += 1) if (freeAt(v, uy + 1, my - 1) && (bestX == null || Math.abs(v - ux) < Math.abs(bestX - ux))) bestX = v;
        if (bestX != null) ux = bestX;
        else if (!opts.block) { const hit = TX.filter(([a, b, t, bt]) => ux > a && ux < b && bt > uy + 1 && t < my - 1); const tt = Math.min(...hit.map((h) => h[2])) + 5; const top = tt - 9 > uy + 6 ? tt - 9 : tt - 6;
          if (top >= uy + 3 && freeAt(ux, uy + 1, top - 1)) { my = top; lifted = true; } } }
      if (lifted) K.forEach((c) => { if (freeAt(c.x, my, c.y)) return; let bx = null; for (let v = c.l + 12; v <= c.r - 12; v += 1) if (freeAt(v, my, c.y) && (bx == null || Math.abs(v - c.x) < Math.abs(bx - c.x))) bx = v; if (bx != null) c.x = bx; });
      /* b64 (Elio, Nov 10): if another card sits between this card and its own cards (a wrapped grandparent row), the line never runs behind it:
         it steps out to the block's side, 8 px clear of the cards, and comes back in above its own row. */
      const blk = (opts.block || []).filter((b) => b.top > uy && b.bottom < my + 1 && ux > b.left - 6 && ux < b.right + 6);
      if (blk.length) { const right = ux > (H.width / 2); const cards = blk;
        const xm = right ? Math.max(...cards.map((b) => b.right)) + 8 : Math.min(...cards.map((b) => b.left)) - 8;
        const yj = Math.min(...blk.map((b) => b.top)) - (opts.drop || 9); const xs = K.map((c) => c.x);
        let d = `M${f2(ux)} ${f2(uy)}V${f2(yj)}H${f2(xm)}V${f2(my)}`; const lo = Math.min(xm, ...xs), hi = Math.max(xm, ...xs); d += `M${f2(lo)} ${f2(my)}H${f2(hi)}`; K.forEach((c) => { d += `M${f2(c.x)} ${f2(my)}V${f2(c.y)}`; }); return d; }
      let d = `M${f2(ux)} ${f2(uy)}V${f2(my)}`; const xs = K.map((c) => c.x); const lo = Math.min(ux, ...xs), hi = Math.max(ux, ...xs); d += `M${f2(lo)} ${f2(my)}H${f2(hi)}`; K.forEach((c) => { d += `M${f2(c.x)} ${f2(my)}V${f2(c.y)}`; }); return d;
    };
    if (k === 'roots') {
      const box = root.querySelector('.b64-roots'); if (!box) return;
      const ban = root.querySelector('.b59-fam .b59-labs .b57-ban') || root.querySelector('.b57-me .b57-ban');
      const pars = [...box.querySelectorAll('.b57-row.par > .b57-n')];
      const { svg, H } = overlay(box, 'roots');
      /* the banner sits above this block: measure it in the block's own frame */
      let d = '';
      /* b64 (Elio, Nov 10): a parent whose grandparent cards wrap below another parent's gets room between the rows for its bracket (gp row-gap), and its line steps round the cards in between. */
      const gpRow = box.querySelector('.b57-row.gp'); const gpAll = gpRow ? [...gpRow.querySelectorAll(':scope > .b57-n')] : [];
      const ofK = (p) => gpAll.filter((g) => g.getAttribute('data-of') === p.getAttribute('data-k'));
      const rel = (el) => { const r = R(el); return { left: r.left - H.left, right: r.right - H.left, top: r.top - H.top, bottom: r.bottom - H.top }; };
      const blockers = (p) => { const own = ofK(p); if (!own.length) return []; const top = Math.min(...own.map((g) => rel(g).top)); const pr = rel(p); return gpAll.filter((g) => !own.includes(g) && rel(g).bottom <= top + 1 && rel(g).top >= pr.bottom && rel(g).left < pr.right && rel(g).right > pr.left).map(rel); };
      const sideOf = (p) => { const r = rel(p); return (r.left + r.right) / 2 > H.width / 2 ? 'r' : 'l'; };
      const bp = pars.filter((p) => blockers(p).length);
      if (gpRow && bp.length) { gpRow.classList.add('b64-gpgap'); bp.forEach((p) => gpRow.classList.add('b64-gpgap-' + sideOf(p))); Object.assign(H, overlay(box, 'roots').H); }
      if (ban && pars.length) { const B = R(ban); const fake = { getBoundingClientRect: () => ban.getBoundingClientRect() }; d += link(H, fake, pars, { x: pars.length === 1 ? undefined : (B.left + B.right) / 2 - H.left }); }
      pars.forEach((p) => { const key = p.getAttribute('data-k'); if (!key) return; const gps = ofK(p); const bl = blockers(p);
        const pr = rel(p); const opts = bl.length ? { block: bl, my: Math.min(...gps.map((g) => rel(g).top)) - 13, x: sideOf(p) === 'r' ? pr.right - 12 : pr.left + 12 } : {}; d += link(H, p, gps, opts); });
      svg.querySelector('path').setAttribute('d', d);
    }
    if (k === 'cert') {
      const pcol = root.querySelector('.b57-pcol.one'); const paper = root.querySelector('.b57-paper');
      const ban = root.querySelector('.b57-cert-pair .b59-labs .b57-ban');
      if (pcol && paper && ban) { const card = pcol.querySelector('.b57-cp > .b57-n'); const { svg, H } = overlay(paper, 'cert'); svg.querySelector('path').setAttribute('d', link(H, ban, card ? [card] : [])); }
    }
    if (k === 'window') {
      root.querySelectorAll('.b57-pane.m, .b57-pane.f').forEach((pane) => { const par = pane.querySelector(':scope > .b57-n'); const gps = [...pane.querySelectorAll(':scope > .b57-row.gp > .b57-n')]; const { svg, H } = overlay(pane, 'win'); svg.querySelector('path').setAttribute('d', link(H, par, gps)); });
    }
  }
  /* Azulejo: the kids bracket's two uprights rise to the partner's circle and to its label card, each at its own centre. */
  function snapAzulejoBracket(root) {
    if (root.getAttribute('data-b57k') !== 'azulejo') return;
    root.querySelectorAll('.b57-bred + .b59-brk').forEach((svg) => {
      const bred = svg.previousElementSibling; const ph = bred.querySelector('.b59-pc .b57-ph'); const lab = bred.querySelector('.b59-plab');
      if (!ph || !lab) return;
      const S = svg.getBoundingClientRect(); if (!S.width || !S.height) return;
      const sh = String(getComputedStyle(ph).boxShadow || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g) || [];
      const sp = sh.reduce((a, t) => Math.max(a, parseFloat(t.trim().split(/\s+/)[3]) || 0), 0);
      const P = ph.getBoundingClientRect(), L = lab.getBoundingClientRect();
      const vx = (x) => ((x - S.left) * 300 / S.width).toFixed(2), vy = (y) => ((y - S.top) * 40 / S.height).toFixed(2);
      const a = vx((P.left + P.right) / 2), b = vx((L.left + L.right) / 2);
      const ya = vy(P.bottom + sp - 1), yb = vy(L.bottom - 1);
      svg.style.overflow = 'visible';
      svg.querySelector('path').setAttribute('d', `M${a} ${ya}V22H${b}V${yb}M150 22V40`);
    });
  }
  /* b64 (Elio, Nov 10): an upward kids bracket over this plant and its partner lands each upright on its circle's centre.
     On a wide screen the stretched bracket otherwise stops beside the circles. Left alone where it already lands on the circle's crown. */
  function snapUpPairBracket(root) {
    root.querySelectorAll('.b59-brk.up').forEach((svg) => {
      const pair = svg.nextElementSibling; if (!pair || !pair.classList.contains('b59-pair')) return;
      const pcs = [...pair.querySelectorAll(':scope > .b59-pc')].map((pc) => pc.querySelector('.b57-ph')).filter(Boolean); if (pcs.length !== 2) return;
      const S = svg.getBoundingClientRect(); if (!S.width || !S.height) return;
      const PR = pcs.map((ph) => ph.getBoundingClientRect()); const cx = PR.map((P) => (P.left + P.right) / 2);
      const at = [S.left + S.width * 64 / 300, S.left + S.width * 236 / 300];
      const spr = (ph) => (String(getComputedStyle(ph).boxShadow || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g) || []).reduce((a, t) => Math.max(a, parseFloat(t.trim().split(/\s+/)[3]) || 0), 0);
      const lands = (P, i) => { const r = P.width / 2 + spr(pcs[i]), dx = Math.abs(cx[i] - at[i]); return dx < r && (r - Math.sqrt(r * r - dx * dx)) <= 2; };
      if (PR.every(lands)) return;
      const vx = (x) => ((x - S.left) * 300 / S.width).toFixed(2);
      svg.style.overflow = 'visible';
      svg.querySelector('path').setAttribute('d', `M150 0V18M${vx(cx[0])} 40V18H${vx(cx[1])}V40`);
    });
  }
  function snapRiverMerge(root) {
    if (root.getAttribute('data-b57k') !== 'river') return;
    const riv = root.querySelector('.b57-riv');
    const merge = root.querySelector('.b57-riv-merge');
    const pc = root.querySelector('.b59-pc.me, .b57-me');
    if (!riv || !merge || !pc) return;
    const me = pc.querySelector('.b57-ph') || pc;
    const streams = [...riv.querySelectorAll('.b57-riv-stream')];
    if (!streams.length) return;
    const lastCard = (s) => {
      const cards = s.querySelectorAll('.b57-riv-unit.last .b57-n, .b57-riv-unit.last .b59-pc');
      return cards[cards.length - 1] || s.querySelector('.b57-n:last-of-type');
    };
    const a = lastCard(streams[0]);
    const b = lastCard(streams[1] || streams[0]);
    { const ff = merge.querySelector('.from-f'); if (ff) ff.style.visibility = streams.length > 1 ? '' : 'hidden'; }
    if (!a || !b) return;
    const rr = riv.getBoundingClientRect();
    const rel = (r) => ({ left: r.left - rr.left, right: r.right - rr.left, top: r.top - rr.top, bottom: r.bottom - rr.top, cx: (r.left + r.right) / 2 - rr.left, cy: (r.top + r.bottom) / 2 - rr.top });
    const A = rel(a.getBoundingClientRect());
    const B = rel(b.getBoundingClientRect());
    const M = rel(me.getBoundingClientRect());
    /* the circle's outer ring (box-shadow) sits outside its box; the line ends on that ring */
    const sh = String(getComputedStyle(me).boxShadow || '').match(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/g) || [];
    const spread = sh.reduce((m, t) => Math.max(m, parseFloat(t.trim().split(/\s+/)[3]) || 0), 0);
    const flow = root.querySelector('.b57-riv-flow');
    const head = flow && flow.querySelector(':scope > .b57-lab');
    const srcBottom = Math.max(...streams.map((s) => rel(s.getBoundingClientRect()).bottom));
    const headTop = head ? rel(head.getBoundingClientRect()).top : M.top - 24;
    const yJ = Math.round((srcBottom + headTop) / 2);
    let xRail = Math.max(A.right, B.right) + 8;
    if (xRail > rr.width - 4) xRail = rr.width - 4;
    const place = (sel, x, y, w, h) => {
      const el = typeof sel === 'string' ? merge.querySelector(sel) : sel;
      if (!el) return;
      Object.assign(el.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', margin: '0', flex: 'none', display: 'block' });
    };
    place('.from-m', A.right, A.cy - 1, Math.max(2, xRail - A.right + 1), 2);
    place('.from-f', B.right, B.cy - 1, Math.max(2, xRail - B.right + 1), 2);
    const yTop = Math.min(A.cy, B.cy) - 1;
    place('.riser', xRail - 1, yTop, 2, Math.max(2, yJ + 1 - yTop));
    place('.jog', M.cx - 1, yJ - 1, Math.max(2, xRail - M.cx + 1), 2);
    const yRing = M.top - spread + 1;
    place('.to-me', M.cx - 1, yJ - 1, 2, Math.max(2, yRing - yJ + 1));
    /* kids: one straight stem at CA's x, from CA's banner down to the kid card (the heading sits beside it) */
    const stem = (flow && flow.querySelector(':scope > .b57-riv-tick.mid')) || merge.querySelector('.b57-riv-tick.kids');
    const ban = root.querySelector('.b59-labs .b57-ban');
    const kid = root.querySelector('.b59-kids .b57-n');
    const fams = flow ? [...flow.querySelectorAll(':scope > .b59-fam')] : [];
    const pairFams = fams.filter((f) => f.querySelector(':scope > .b59-pair'));
    const kidFams = fams.filter((f) => f.querySelector(':scope > .b59-kids'));
    const kid0 = kidFams[0] && kidFams[0].querySelector('.b59-kids .b57-n');
    if (stem && ban && (kid0 || kid)) {
      const kid = kid0 || root.querySelector('.b59-kids .b57-n');
      if (stem.parentElement !== merge) { merge.appendChild(stem); stem.classList.add('kids'); }
      const rr2 = riv.getBoundingClientRect(); const rel2 = (r) => ({ left: r.left - rr2.left, right: r.right - rr2.left, top: r.top - rr2.top, bottom: r.bottom - rr2.top });
      const Bn = rel2(ban.getBoundingClientRect()); const K = rel2(kid.getBoundingClientRect()); const Mx = (me.getBoundingClientRect().left + me.getBoundingClientRect().right) / 2 - rr2.left;
      const x = Math.max(Bn.left + 12, Math.min(Bn.right - 12, Math.max(K.left + 12, Math.min(K.right - 12, Mx))));
      place(stem, x - 1, Bn.bottom - 1, 2, Math.max(2, K.top - Bn.bottom + 2));
    }
    snapRiverPartners(root, riv, merge, me, spread, pairFams, kidFams, place);
  }
  /* b64: River with more than one partner. Each extra partner (e.g. a second cross partner) is linked to this plant's
     circle with River's x link: out of the circle's lower right, down the gap between the banner and the partner card,
     through the x, onto the partner's circle. Its kids get their own stem from the partner card, down the right side
     past the earlier kid cards and onto its kid card. Lines keep 4px+ off text, cards and circles. */
  function snapRiverPartners(root, riv, merge, me, spread, pairFams, kidFams, place) {
    merge.querySelectorAll('.b64-plink, .b64-pk').forEach((e) => { if (+e.getAttribute('data-i') >= pairFams.length) e.remove(); });
    if (pairFams.length < 2) return;
    const rr = riv.getBoundingClientRect();
    const rel = (r) => ({ left: r.left - rr.left, right: r.right - rr.left, top: r.top - rr.top, bottom: r.bottom - rr.top, cx: (r.left + r.right) / 2 - rr.left, cy: (r.top + r.bottom) / 2 - rr.top, w: r.width });
    const L = rel(me.getBoundingClientRect()); const R = L.w / 2 + spread - 1;
    const f0 = pairFams[0];
    const ban0 = f0.querySelector('.b59-labs .b57-ban'); const plab0 = f0.querySelector('.b59-labs .b59-plab');
    if (!ban0 || !plab0) return;
    const Bn = rel(ban0.getBoundingClientRect()); const Pl = rel(plab0.getBoundingClientRect());
    const gx = Math.round((Bn.right + Pl.left) / 2);
    const labTop = Math.min(Bn.top, Pl.top);
    const sy = Math.min(L.cy + R * 0.8, labTop - 10);
    const sx = L.cx + Math.sqrt(Math.max(0, R * R - (sy - L.cy) * (sy - L.cy)));
    const ns = 'http://www.w3.org/2000/svg';
    const k = 64 / 76; const rc = 12.5 * k; const sw = 2.2 * k; const xo = 4.6 * k;
    const textRight = (el) => { let m = -1e9; const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); while (tw.nextNode()) { const n = tw.currentNode; if (!n.nodeValue.trim()) continue; const g = document.createRange(); g.selectNodeContents(n); [...g.getClientRects()].forEach((b) => { if (b.width) m = Math.max(m, b.right - rr.left); }); } return m; };
    for (let i = 1; i < pairFams.length; i++) {
      const f = pairFams[i];
      const ph = f.querySelector('.b59-pc .b57-ph'); if (!ph) continue;
      const P = rel(ph.getBoundingClientRect());
      let svg = merge.querySelector(`svg.b64-plink[data-i="${i}"]`);
      if (!svg) {
        svg = document.createElementNS(ns, 'svg'); svg.setAttribute('class', 'b59-xb b64-plink'); svg.setAttribute('data-i', i); svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = '<path class="ln"/><circle/><path class="xx"/>'; merge.appendChild(svg);
      }
      Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', width: rr.width + 'px', height: rr.height + 'px', margin: '0', overflow: 'visible' });
      svg.setAttribute('viewBox', `0 0 ${rr.width} ${rr.height}`);
      const cy = P.cy; const pl = P.left - spread + 1;
      const f2 = (v) => +v.toFixed(2);
      svg.querySelector('.ln').setAttribute('d', `M${f2(sx)} ${f2(sy)}H${gx}V${f2(cy - rc)}M${f2(gx + rc)} ${f2(cy)}H${f2(pl)}`);
      const c = svg.querySelector('circle'); c.setAttribute('cx', gx); c.setAttribute('cy', f2(cy)); c.setAttribute('r', f2(rc));
      svg.querySelector('.xx').setAttribute('d', `M${f2(gx - xo)} ${f2(cy - xo)}l${f2(2 * xo)} ${f2(2 * xo)}M${f2(gx + xo)} ${f2(cy - xo)}l${f2(-2 * xo)} ${f2(2 * xo)}`);
      svg.querySelectorAll('path, circle').forEach((e) => { e.style.strokeWidth = sw; });
      /* this partner's kids */
      const kf = kidFams[i]; const kidEl = kf && kf.querySelector('.b59-kids .b57-n');
      const plab = f.querySelector('.b59-labs .b59-plab');
      const mk = (cls) => { let e = merge.querySelector(`.b64-pk.${cls}[data-i="${i}"]`); if (!e) { e = document.createElement('span'); e.className = `b57-riv-tick b64-pk ${cls}`; e.setAttribute('data-i', i); e.setAttribute('aria-hidden', 'true'); merge.appendChild(e); } return e; };
      if (!kidEl || !plab) { merge.querySelectorAll(`.b64-pk[data-i="${i}"]`).forEach((e) => e.remove()); continue; }
      const Q = rel(plab.getBoundingClientRect()); const K = rel(kidEl.getBoundingClientRect());
      const prevKids = kidFams.slice(0, i).flatMap((g) => [...g.querySelectorAll('.b59-kids .b57-n')].filter((n) => n.getClientRects().length).map((n) => rel(n.getBoundingClientRect())));
      const prevBottom = prevKids.length ? Math.max(...prevKids.map((b) => b.bottom)) : Q.bottom;
      const prevRight = prevKids.length ? Math.max(...prevKids.map((b) => b.right)) : K.right;
      const xr = Math.round(Math.min(Q.right - 12, (prevRight + rr.width) / 2));
      const head = kf.querySelector(':scope > .b57-lab');
      const Ht = head ? rel(head.getBoundingClientRect()).top : K.top;
      const yJ = Math.round((prevBottom + Ht) / 2);
      const hr = head ? textRight(head) : -1e9;
      const x2 = Math.round(Math.max(hr + 12, Math.min(K.right - 18, xr)));
      place(mk('a'), xr - 1, Q.bottom - 1, 2, Math.max(2, yJ - Q.bottom + 2));
      place(mk('b'), Math.min(x2, xr) - 1, yJ - 1, Math.abs(xr - x2) + 2, 2);
      place(mk('c'), x2 - 1, yJ - 1, 2, Math.max(2, K.top - yJ + 2));
    }
  }
  /* b64: a '·' separator is never left at a line end or start. When a label wraps at a separator, the line breaks there
     and the separator is dropped at the break ("Name" / "F1"). Works on the live layout, so it holds at any width. */
  function fixSeps(root) {
    if (!root) return;
    const w = root.getBoundingClientRect().width;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/\s·\s/.test(n.nodeValue) && !n.parentElement.closest('svg, .b64-sep, script, style') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const todo = []; while (walker.nextNode()) todo.push(walker.currentNode);
    /* '×' keeps its operand: a wrap can come before the '×' ("Mother name" / "× Father name"), never after it */
    const tx = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/ × /.test(n.nodeValue) && !n.parentElement.closest('svg, script, style') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    const xs = []; while (tx.nextNode()) xs.push(tx.currentNode); xs.forEach((n) => { n.nodeValue = n.nodeValue.replace(/ × /g, ' ×\u00a0'); });
    todo.forEach((n) => {
      const parts = n.nodeValue.split(/\s+·\s+/); if (parts.length < 2) return;
      const frag = document.createDocumentFragment();
      parts.forEach((t, i) => { if (i) { const sp = document.createElement('span'); sp.className = 'b64-sep'; sp.textContent = '\u00a0· '; frag.appendChild(sp); } frag.appendChild(document.createTextNode(t)); });
      n.parentNode.replaceChild(frag, n);
    });
    if (root.__b64sepW === w && !todo.length) return;
    root.__b64sepW = w;
    const seps = [...root.querySelectorAll('.b64-sep')];
    seps.forEach((sp) => sp.classList.remove('brk'));
    const charRect = (node, i) => { const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); return r.getBoundingClientRect(); };
    const glyphNear = (sp, dir) => {
      /* first visible glyph after (dir 1) or before (dir -1) the separator, inside the same label block */
      const blk = sp.parentElement.closest('b, small, span:not(.b64-sep), div, p, button') || sp.parentElement;
      const tw = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT);
      const nodes = []; while (tw.nextNode()) nodes.push(tw.currentNode);
      const own = sp.firstChild; const idx = nodes.indexOf(own);
      if (dir > 0) { for (let j = idx + 1; j < nodes.length; j++) { const v = nodes[j].nodeValue; for (let c = 0; c < v.length; c++) if (/\S/.test(v[c]) && v[c] !== '\u00a0') return charRect(nodes[j], c); } }
      else { for (let j = idx - 1; j >= 0; j--) { const v = nodes[j].nodeValue; for (let c = v.length - 1; c >= 0; c--) if (/\S/.test(v[c]) && v[c] !== '\u00a0') return charRect(nodes[j], c); } }
      return null;
    };
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      seps.forEach((sp) => {
        if (sp.classList.contains('brk') || !sp.isConnected || !sp.getClientRects().length) return;
        const d = charRect(sp.firstChild, 1); const nx = glyphNear(sp, 1); const pv = glyphNear(sp, -1);
        const h = Math.max(4, d.height / 2);
        if ((nx && nx.top > d.top + h) || (pv && pv.top < d.top - h)) { sp.classList.add('brk'); changed = true; }
      });
      if (!changed) break;
    }
  }
  document.addEventListener('click', (e) => { const o = e.target.closest && e.target.closest('#breeding-view [data-b64origin]'); if (!o) return; const pg = B18.brPage; if (!pg || pg.edit) return; if (window.B60 && B60.openProfile && B60.openProfile(o.getAttribute('data-b64origin'))) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  const _rr = renderBreeding;
  /* b64 (Elio, Nov 10): the page can sit under CSS zoom on <html> (1.28 on a wide window). Some engines give zoomed client rects while
     style lengths stay unzoomed, so every line-snapping pass measures in unzoomed units. Where rects are already unzoomed this is a no-op. */
  function inUnzoomed(fn) {
    const el = document.querySelector('#breeding-view .b57'); const z = parseFloat(document.documentElement.style.zoom) || 1;
    const ratio = el && el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
    if (!(z !== 1 && Math.abs(ratio - z) < 0.03)) return fn();
    const E = Element.prototype, G = Range.prototype; const eb = E.getBoundingClientRect, ec = E.getClientRects, gb = G.getBoundingClientRect, gc = G.getClientRects;
    const sc = (r) => new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z); const sl = (l) => { const a = [...l].map(sc); a.item = (i) => a[i] || null; return a; };
    E.getBoundingClientRect = function () { return sc(eb.call(this)); }; E.getClientRects = function () { return sl(ec.call(this)); };
    G.getBoundingClientRect = function () { return sc(gb.call(this)); }; G.getClientRects = function () { return sl(gc.call(this)); };
    try { return fn(); } finally { E.getBoundingClientRect = eb; E.getClientRects = ec; G.getBoundingClientRect = gb; G.getClientRects = gc; }
  }
  /* trim after each tree paint */
  const scheduleTrim = () => { requestAnimationFrame(() => { try { inUnzoomed(() => { fixSeps(document.querySelector('#breeding-view .b57')); trimHangingStrings(); fitSvgTreeLabels(); }); } catch (e) { /* */ } }); };
  document.addEventListener('click', () => setTimeout(scheduleTrim, 60), true);
  window.addEventListener('resize', scheduleTrim);
  setTimeout(scheduleTrim, 200);

  setInterval(() => { try { addTab(); addSide(); profileBtn(); mark(); cloneOfRow(); inUnzoomed(() => { fixSeps(document.querySelector('#breeding-view .b57')); trimHangingStrings(); fitSvgTreeLabels(); }); } catch (e) { console.warn('b57 entry', e); } }, 300);
  window.B57 = { fixSeps, walk, detailKey, resolveKey, partners, rec, name, same, isUnk, ph, mono, rr: () => renderBreeding(), openLineage, lineageList, candidates, par2, stat, popOf, styles: STYLES, styleOf, assign, ancestors, siblings, kids, photo, linkedMotherKey, productionTreeTarget, routeTreePage, migrateCloneMother, b13Mig, cloneOfRow, setCloneOf, isFalseSample, ownsOwnTree, originOf, connectionLinks, connectionPage, ringSolver: { solve: rsSolve, wedge: rsWedge, rect: rsRect, metric: rsMetric, CLEAR: RS_CLEAR, geo: () => ({ WAL, FAN }) } };
})();
