/* Build 49 (Elio, Oct 30 9:40 AM ET): breeding features from PLAN-BREEDING.md + mock-breeding-gaps/ (generation labels, tappable
   family tree, seed & pollen inventory with germination %, clone success per mother with C1, C2 names), left-edge swipe-back
   (PLAN-NEXT.md §1), tab bar Dashboard · Plants · Breeding · Journal · More (Patients under More).
   Data: read-only except the user's own "Log germination" (additive fields seedsUp / germDate / germLog on a project). */
(function () {
  const esc = (v) => escapeHtml(String(v == null ? '' : v));
  const low = (s) => String(s || '').trim().toLowerCase();
  const CHEV = '<i class="b18-chev" aria-hidden="true">›</i>';
  const fmt = (d) => { try { return d ? b18FmtShort(d) : ''; } catch (e) { return d || ''; } };

  /* ================= lineage graph ================= */
  const coll = { mf: () => state.motherFatherPlants || [], bp: () => state.breedingPlants || [], pl: () => state.plants || [], pr: () => state.breedingProjects || [] };
  const COLL_KEY = { mf: 'mf', breedingPlants: 'bp', plants: 'pl' };
  function rec(key) { const [t, ...r] = String(key || '').split(':'); const id = r.join(':'); if (t === 'tx' || t === 'dx') return { name: id }; const a = coll[t]; return a ? a().find((x) => x.id === id) || null : null; }
  function nameOf(key) { const r = rec(key); if (!r) return ''; if (key.startsWith('pr:')) { const m = b18ProjParent(r, 'mother'), f = b18ProjParent(r, 'father'); return r.name || [m.name, f.name].filter(Boolean).join(' × ') || 'Cross'; } return r.name || ''; }
  /* b58: one name matcher for every typed parent name. Exact, case-insensitive, after tidying (spaces, a trailing
     generation tag like "F1", a "(father)" note). Tiers: mothers & fathers, then breeding plants, then plants; a tier
     links only when it has exactly ONE match. Ambiguous names stay unlinked (typed name kept) and are logged. */
  const normName = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/\s*\((?:mother|father|pollen donor|male|female)\)\s*$/i, '').replace(/\s+(?:F\d{1,2}|S\d|BX\d?)$/i, '').trim().toLowerCase();
  window.__b58amb = window.__b58amb || {};
  function matchName(name) {
    const n = normName(name); if (!n) return { k: '' };
    for (const [t, a] of [['mf', coll.mf()], ['bp', coll.bp()], ['pl', coll.pl()]]) { let h = a.filter((x) => normName(x.name) === n); if (h.length > 1) { const live = h.filter((x) => !x.archived && !x.deleted); if (live.length === 1) h = live; }
      if (h.length === 1) return { k: `${t}:${h[0].id}` }; if (h.length > 1) { window.__b58amb[n] = h.map((x) => `${t}:${x.id}`); return { k: '', amb: h.length }; } }
    return { k: '' };
  }
  const linkSig = (r) => [r.crossLabel, r.cultivar, r.name, r.source, r.motherId, r.fatherId, r.mother, r.father, r.b49ProjectId, r.motherPlantId].map((v) => String(v || '')).join('|');
  function keyByName(name) {
    const n = String(name || '').trim(); if (!n) return '';
    const m = matchName(n); return m.k || `tx:${n}`;
  }
  const projParents = (p) => { const m = b18ProjParent(p, 'mother'), f = b18ProjParent(p, 'father'); const mk = m.key || (m.name ? keyByName(m.name) : ''), fk = f.key || (f.name ? keyByName(f.name) : ''); return mk && fk ? [mk, fk] : null; };
  const splitCross = (s) => { const m = String(s || '').split(/\s+[×x]\s+/); return m.length === 2 && m[0].trim() && m[1].trim() ? [keyByName(m[0].replace(/^.*·\s*/, '')), keyByName(m[1])] : null; };
  function projFor(r) {
    if (r.b49ProjectId) { const p = coll.pr().find((x) => x.id === r.b49ProjectId); if (p) return p; }
    const names = [r.name, r.crossLabel, r.cultivar].map(low).filter(Boolean); const code = low(String(r.name || '').split('·')[0]);
    return coll.pr().find((p) => { const pn = low(p.name); const pc = low(String(p.name || '').split('·')[0]); return pn && (names.includes(pn) || (pc && pc === code && /\d/.test(pc))); }) || null;
  }
  const PM = new Map(); let PMv = '';
  let b57t = 0, b57v = ''; window.__b57inval = () => { b57t = 0; }; function b57sig() { const now = Date.now(); if (now - b57t < 40 && b57v) return b57v; b57t = now; return (b57v = b57sig0()); }
  function b57sig0() { const pick = (a) => (a || []).map((x) => [x.id, x.name, x.crossLabel, x.cultivar, x.b49ProjectId, x.b49Mother, x.b49Father, x.b58Manual, x.b58Links, x.promotedFrom, x.source, x.motherPlantId, x.status, x.archived]);
    const s = JSON.stringify([state.motherFatherPlants, state.breedingProjects, pick(state.plants), pick(state.breedingPlants)]); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return s.length + ':' + (h >>> 0); }
  function parents(key, seen = new Set()) {
    if (seen.has(key)) return null; seen.add(key);
    const r = rec(key); if (!r || key.startsWith('tx:')) return null;
    /* b58: manual links (tree Edit mode / parent picker) win over everything automatic, per side; '-' = removed by hand */
    const M = r.b58Manual; if (M && (M.m || M.f)) { const a = autoParents(key, r, seen) || ['', '']; const pick = (sd, v, au) => (M[sd] ? (v === '-' ? '' : v || '') : au || '');
      const m = pick('m', r.b49Mother, a[0]), f = pick('f', r.b49Father, a[1]); return m || f ? [m, f] : null; }
    /* b58 repair migration: links it confirmed (ID or a single exact name match) are stored on the record */
    const L = r.b58Links; if (L && (L.m || L.f) && L.sig === linkSig(r)) { const a = autoParents(key, r, seen) || ['', '']; const ok = (k) => k && rec(k) && !String(k).startsWith('tx:'); const m = ok(L.m) ? L.m : a[0], f = ok(L.f) ? L.f : a[1]; return m || f ? [m || '', f || ''] : null; }
    return autoParents(key, r, seen);
  }
  function autoParents(key, r, seen) {
    if (key.startsWith('pr:')) return projParents(r);
    if (key.startsWith('mf:')) {
      if (r.b49Mother && r.b49Father) return [r.b49Mother, r.b49Father];
      const pf = r.promotedFrom; if (pf && pf.id && COLL_KEY[pf.coll]) { const k = `${COLL_KEY[pf.coll]}:${pf.id}`; if (k !== key) { const x = parents(k, seen); if (x) return x; } }
      return splitCross(r.source && /×/.test(r.source) ? r.source.replace(/^Promoted from\s*/i, '') : '');
    }
    if (typeof isClonePlant === 'function' && isClonePlant(r) && r.motherPlantId) return parents(`pl:${r.motherPlantId}`, seen) || null;
    const p = projFor(r); if (p) return projParents(p);
    return splitCross(r.crossLabel) || splitCross(r.cultivar) || splitCross(r.name);
  }
  function par(key) { const v = b57sig(); /* b57: content hash, so editing a parent (same text length) redraws the tree */ if (v !== PMv) { PM.clear(); PMv = v; } if (!PM.has(key)) PM.set(key, parents(key)); return PM.get(key); }
  const same = (a, b) => a === b || (a && b && low(nameOf(a)) === low(nameOf(b)) && low(nameOf(a)) !== '');
  function isAnc(a, x, d = 0) { if (d > 12) return false; const p = par(x); if (!p) return false; return p.some((k) => same(k, a) || isAnc(a, k, d + 1)); }
  // Build 50: a generation picked by hand on the plant form (plant.b50gen) overrides the automatic label; unset = automatic.
  const manualGen = (key) => { if (!String(key).startsWith('pl:')) return ''; const r = rec(key); const m = r && r.b50gen; if (!m) return ''; return m === 'other' ? (String(r.b50genOther || '').trim().slice(0, 8) || 'Other') : m; };
  function gen(key, d = 0) { return manualGen(key) || genAuto(key, d); }
  function genAuto(key, d = 0) {
    if (d > 12) return 'P'; const p = par(key); if (!p) return 'P';
    /* b64 (Elio, Nov 10): parents that only say "Not recorded" are missing, never the same plant: no S1, no backcross. */
    const [m, f] = p; const ph = (k) => !k || /^(not recorded|unknown|\?+|none|n\/a)$/i.test(String(nameOf(k) || (/^(tx|dx):/.test(String(k)) ? String(k).slice(3) : '')).trim());
    if (ph(m) && ph(f)) return 'P';
    if (!ph(m) && same(m, f)) return 'S1';
    if (!ph(m) && !ph(f) && (isAnc(f, m) || isAnc(m, f))) { const kid = isAnc(f, m) ? m : f; const g = gen(kid, d + 1); return g.startsWith('BX') ? 'BX' + (+g.slice(2) + 1) : 'BX1'; }
    const gm = gen(m, d + 1), gf = gen(f, d + 1);
    if (gm === 'P' && gf === 'P') return 'F1';
    const pm = par(m), pf = par(f);
    if (/^F\d/.test(gm) && gm === gf && pm && pf && same(pm[0], pf[0]) && same(pm[1], pf[1])) return 'F' + (+gm.slice(1) + 1);
    return 'F1';
  }
  function why(key) {
    if (manualGen(key)) { const a = genAuto(key); return `Set by hand to ${manualGen(key)}${!par(key) ? ' (no parents recorded)' : a !== manualGen(key) ? ` (worked out from parents: ${a})` : ''}`; }
    const g = gen(key); const p = par(key); if (!p) return 'Starting line (no parents recorded)';
    const [m, f] = p; const shown = (k) => nameOf(k) || 'not recorded'; const mn = shown(m), fn = shown(f);
    if (g === 'S1') return `${mn} pollinated by itself, so S1`;
    if (g.startsWith('BX')) { const kid = isAnc(f, m) ? m : f; const anc = kid === m ? f : m; return `${nameOf(kid)} (${gen(kid)}) crossed back to its ${par(kid) && par(kid).some((k) => same(k, anc)) ? 'parent' : 'ancestor'} ${nameOf(anc)}, so ${g}`; }
    if (g === 'F1') return `Two different lines: ${mn} × ${fn}, so F1`;
    return `Siblings from the same ${gen(m)} cross (${mn} × ${fn}), so ${g}`;
  }
  const gcls = (g) => (g === 'F1' ? 'F1' : /^F/.test(g) ? 'F2' : g === 'S1' ? 'S1' : /^BX/.test(g) ? 'BX' : 'P');
  const badge = (key) => { const g = gen(key); return `<span class="b49-gen g-${gcls(g)}" aria-label="Generation ${g}">${g}</span>`; };
  function nodeId(k) { const s = String(k || ''); const i = s.indexOf(':'); return i < 0 ? '' : s.slice(i + 1); }
  function sameNode(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    return String(a).split(':')[0] === String(b).split(':')[0] && nodeId(a) !== '' && nodeId(a) === nodeId(b);
  }
  function hiddenNode(k) { return !!(window.B63 && typeof B63.explicitKey === 'function' && B63.explicitKey(k)); }
  function children(key) {
    const out = [];
    const add = (k) => {
      if (!k || sameNode(k, key) || hiddenNode(k) || out.some((o) => sameNode(o, k))) return;
      const p = par(k);
      if (p && p.some((x) => sameNode(x, key))) out.push(k);
    };
    coll.pr().filter((p) => p.status !== 'Archived').forEach((p) => add(`pr:${p.id}`));
    coll.pl().filter((p) => p.status !== 'archived').forEach((p) => add(`pl:${p.id}`)); coll.bp().forEach((p) => add(`bp:${p.id}`)); coll.mf().filter((m) => !m.archived).forEach((m) => add(`mf:${m.id}`));
    /* An id stored on the project is a kid even when the name resolver did not return that parent. Names are not links. */
    const id = nodeId(key);
    if (id) coll.pr().filter((p) => p.status !== 'Archived').forEach((p) => {
      const k = `pr:${p.id}`;
      if (sameNode(k, key) || hiddenNode(k) || out.some((o) => sameNode(o, k))) return;
      const refs = [p.motherId, p.fatherId, nodeId(p.b49Mother), nodeId(p.b49Father)];
      if (refs.some((x) => x && x === id)) out.push(k);
    });
    return dedupeKids(out);
  }
  /* b59: a cross (pr) and the plant grown from it are one kid, not two. Same plant = linked by id (b49ProjectId / projFor)
     or, when nothing links them, both parents resolve to the same plants. The plant record is kept; only the extra card goes. */
  const seedOf = (pk, k) => { const r = rec(k); if (!r) return false; const pr = rec(pk); if (!pr) return false;
    if (r.b49ProjectId) return r.b49ProjectId === pr.id; const pf = projFor(r); if (pf) return pf.id === pr.id;
    if (typeof isClonePlant === 'function' && isClonePlant(r)) return false;
    const a = par(k), b = par(pk); return !!(a && b && a[0] && a[1] && same(a[0], b[0]) && same(a[1], b[1])); };
  function dedupeKids(out) { const prs = out.filter((k) => k.startsWith('pr:')); if (!prs.length) return out;
    return out.filter((k) => !(/^(pl|bp):/.test(k) && prs.some((pk) => seedOf(pk, k)))); }
  const linkedRuns = (pk) => [...coll.pl().map((p) => `pl:${p.id}`), ...coll.bp().map((p) => `bp:${p.id}`)].filter((k) => seedOf(pk, k));
  const roleOf = (key) => { const r = rec(key); if (!r) return ''; if (key.startsWith('mf:')) return r.role === 'father' ? 'Pollen donor' : 'Mother'; if (key.startsWith('pr:')) return 'Cross'; if (key.startsWith('tx:')) return 'Line'; return plantsRunning(r) > 1 ? `Seed run · ${plantsRunning(r)} plants` : 'Plant'; };

  function openKey(key) {
    const [t, ...r] = key.split(':'); const id = r.join(':');
    if (t === 'pl') return openPlantDetail(id, 'plants');
    if (t === 'bp') return openPlantDetail(id, 'breedingPlants');
    if (t === 'mf') { switchView('breeding'); B18.brPage = null; mfDetailId = id; renderBreeding(); window.scrollTo(0, 0); return; }
    if (t === 'pr') { switchView('breeding'); b18BrGo({ type: 'project', id }); }
  }
  /* where "‹ Back" on a b49 page returns to */
  let ret = null;
  function remember() {
    const v = typeof activeView !== 'undefined' ? activeView : '';
    if (v === 'plant-detail') ret = { k: `${detailColl === 'mf' ? 'mf' : detailColl === 'breedingPlants' ? 'bp' : 'pl'}:${detailPlantId()}` };
    else if (v === 'breeding' && typeof mfDetailRecord === 'function' && mfDetailRecord()) ret = { k: `mf:${mfDetailRecord().id}` };
    else if (v === 'breeding' && B18.brPage && B18.brPage.type === 'project') ret = { k: `pr:${B18.brPage.id}` };
    else if (v === 'breeding' && B18.brPage && B18.brPage.type && B18.brPage.type.startsWith('b49')) ret = { page: { ...B18.brPage } };
    else ret = null;
  }
  function goBack(fallback) {
    const r = ret; ret = null;
    if (r && r.k) return openKey(r.k);
    if (r && r.page) { B18.brPage = r.page; renderBreeding(); window.scrollTo(0, 0); return; }
    b18BrGo(fallback || null);
  }
  function openPage(page) { remember(); if (activeView !== 'breeding') switchView('breeding'); mfDetailId = ''; B18.brPage = page; renderBreeding(); window.scrollTo(0, 0); }
  const backBtn = (label) => `<div class="b18-pagehead"><button type="button" class="b18-back br" data-b49="back">‹ ${esc(label)}</button></div>`;
  const backLabel = () => (ret && ret.k ? (nameOf(ret.k) || 'Back') : ret && ret.page ? ({ b49tree: 'Family tree', b49inv: 'Seeds & pollen', b49clones: 'Clones', b49mclones: 'Clones' }[ret.page.type] || 'Back') : 'Breeding');

  /* ================= pages ================= */
  function treeHtml(pg) {
    const k = pg.key; const p = par(k);
    const nd = (key, me) => key ? `<button type="button" class="b49-node${me ? ' me' : ''}" ${key.startsWith('tx:') ? 'disabled' : `data-b49="open" data-k="${esc(key)}"`}><b>${esc(nameOf(key))}</b><small>${badge(key)} ${esc(roleOf(key))}</small></button>` : '<div class="b49-node none"><small>Not recorded</small></div>';
    const gp = p ? [par(p[0]), par(p[1])] : [null, null]; const gps = []; gp.filter(Boolean).flat().forEach((x) => { if (!gps.some((y) => same(x, y))) gps.push(x); });
    const kids = children(k);
    return `${backBtn(backLabel())}<h2 class="b18-h1">Family tree</h2>
<div class="m-card b49-tree"><div class="b49-lab">This plant</div>${nd(k, 1)}
${p ? `<div class="b49-wire"></div><div class="b49-lab">Mother · Pollen donor</div><div class="b49-lvl">${nd(p[0])}${nd(p[1])}</div>` : '<p class="m-s b49-c">No parents recorded, so this is a starting line (P).</p>'}
${p && (gp[0] || gp[1]) ? `<div class="b49-wire"></div><div class="b49-lab">Grandparents</div><div class="b49-lvl ${gps.length > 2 ? 'four' : ''}">${gps.map((x) => nd(x)).join('')}</div>` : ''}</div>
<p class="m-s b49-note">Tap any plant to open its page and keep going up its tree.${p ? ` ${esc(why(k))}.` : ''}</p>
<div class="m-h2"><span>Descendants of ${esc(nameOf(k))}</span></div>
<div class="m-card b18-list">${kids.length ? kids.map((x) => `<button type="button" class="m-row b18-row" data-b49="open" data-k="${esc(x)}"><span class="m-grow"><span class="m-t">${esc(nameOf(x))}</span><span class="m-s">${esc(roleOf(x))}</span></span>${badge(x)}${CHEV}</button>`).join('') : '<div class="m-row b18-static"><div class="m-grow"><div class="m-s">No crosses recorded from this plant yet.</div></div></div>'}</div>`;
  }
  const num = (v) => { const n = Number(v); return v === '' || v == null || !Number.isFinite(n) ? null : n; };
  function seedRows() {
    return coll.pr().filter((p) => p.status !== 'Archived').map((p) => { const made = num(p.seedsMade) !== null ? num(p.seedsMade) : num(p.seedCount); const sown = num(p.seedsPopped); const up = num(p.seedsUp); return { p, made, sown, up }; }).filter((r) => r.made !== null || r.sown !== null);
  }
  function invHtml() {
    const rows = seedRows();
    const fathers = coll.mf().filter((m) => !m.archived);
    const jars = []; fathers.forEach((m) => (m.pollen || []).forEach((e, i) => jars.push({ m, e, i })));
    jars.sort((a, b) => String(b.e.date).localeCompare(String(a.e.date)));
    return `${backBtn(backLabel())}<h2 class="b18-h1">Seeds &amp; pollen</h2>
<div class="m-h2"><span>Seeds by cross</span></div><div class="m-card b18-list">${rows.length ? rows.map(({ p, made, sown, up }) => {
      const r = sown && up !== null ? Math.round((up / sown) * 100) : null; const left = made !== null ? Math.max(0, made - (sown || 0)) : null; const k = `pr:${p.id}`;
      const bits = [made !== null ? `${made} collected` : '', sown !== null ? `${sown} sown` : '', up !== null ? `<span class="${r >= 80 ? 'b49-ok' : 'b49-bad'}">${up} up${r !== null ? ` (${r}%)` : ''}</span>` : sown ? 'germination not logged' : '', left !== null ? `${left} left` : ''].filter(Boolean).join(' · ');
      return `<button type="button" class="m-row b18-row b49-seed" data-b49="open" data-k="${esc(k)}"><span class="m-grow"><span class="m-t">${esc(nameOf(k))}</span><span class="m-s">${bits}</span>${r !== null ? `<span class="b49-bar" role="img" aria-label="Germination ${r}%"><i style="width:${Math.min(100, r)}%"></i></span>` : ''}</span>${badge(k)}</button>`; }).join('') : '<div class="m-row b18-static"><div class="m-grow"><div class="m-s">No seeds logged yet. Add seeds made on a breeding project.</div></div></div>'}</div>
<div class="m-h2"><span>Pollen</span></div><div class="m-card b18-list">${jars.length ? jars.map(({ m, e, i }) => {
      const s = [e.date ? `Collected ${fmt(e.date)}` : '', e.storage || e.notes || '', e.left ? `${e.left} left` : e.count ? `${e.count} collected` : '', e.useBy ? `use by ${fmt(e.useBy)}` : ''].filter(Boolean).map(esc).join(' · ');
      return `<div class="m-row b18-static"><span class="b18-tile" aria-hidden="true">🧪</span><div class="m-grow"><div class="m-t">${esc(m.name)} · jar ${(m.pollen || []).length - i}</div><div class="m-s">${s || 'No details'}</div></div></div>`; }).join('') : '<div class="m-row b18-static"><div class="m-grow"><div class="m-s">No pollen logged yet. Log pollen on a father’s page.</div></div></div>'}</div>
<div class="button-row b49-btns"><button type="button" class="primary-button" data-b49="germ">+ Log germination</button></div>`;
  }
  function germSheet() {
    const rows = coll.pr().filter((p) => p.status !== 'Archived'); if (!rows.length) return showToast('Add a breeding project first');
    b18Sheet({ eyebrow: 'Seeds & pollen', title: 'Log germination',
      body: `${b18F.select('pid', 'Cross', rows.map((p) => ({ v: p.id, l: nameOf(`pr:${p.id}`) })), rows[0].id)}<div class="form-grid two">${b18F.num('sown', 'Seeds sown', '', { min: 0, max: 99999 })}${b18F.num('up', 'Sprouted', '', { min: 0, max: 99999 })}</div>${b18F.date('date', 'Date', b18Today())}`,
      onSave: (v) => { const sown = Math.round(Number(v.sown)); const up = Math.round(Number(v.up)); if (!(sown > 0)) return b18Err('Enter how many seeds were sown.'); if (!(up >= 0) || up > sown) return b18Err('Sprouted must be between 0 and the seeds sown.');
        return b18Mutate('Germination logged', () => { const q = b18ById(state.breedingProjects, v.pid); const prev = num(q.seedsPopped) || 0; const prevUp = num(q.seedsUp) || 0;
          q.germLog = Array.isArray(q.germLog) ? q.germLog : []; q.germLog.push({ id: freshId(), date: v.date, sown, up });
          q.seedsPopped = String(prev + sown); q.seedsUp = prevUp + up; q.germDate = v.date; if (!q.poppedDate) q.poppedDate = v.date; }); } });
  }
  /* clones: every run from one mother, numbered C1, C2… across runs in cut-date order */
  function runMother(r) { if (r.srcId) return `${COLL_KEY[r.srcColl] || 'pl'}:${r.srcId}`; return r.mother ? keyByName(r.mother) : ''; }
  function cloneData(key) {
    const runs = (state.cloneRuns || []).filter((r) => { const k = runMother(r); return k && same(k, key); }).sort((a, b) => String(a.cutDate).localeCompare(String(b.cutDate)) || (a.num || 0) - (b.num || 0));
    const cuts = []; let n = 0;
    runs.forEach((r) => {
      const total = r.srcId ? (r.cuts || 0) : (r.batches || []).reduce((s, b) => s + (b.cuts || 0), 0);
      const rooted = r.srcId ? (r.rooted || 0) : (r.batches || []).reduce((s, b) => s + (b.rooted || 0), 0);
      const day = r.firstRoots && r.cutDate ? Math.max(1, Math.round((parseDate(r.firstRoots) - parseDate(r.cutDate)) / 864e5)) : null;
      const age = r.cutDate ? Math.max(0, Math.round((Date.now() - parseDate(r.cutDate)) / 864e5)) : null;
      for (let i = 1; i <= total; i++) {
        const o = (r.outcomes || []).find((x) => i >= x.from && i <= x.to);
        const st = o ? o.status : i <= rooted ? 'Rooted' : r.done ? 'Failed' : 'Rooting';
        cuts.push({ name: `C${++n}`, date: r.cutDate, st, note: o && o.outcome, day, age, run: r });
      }
    });
    const rooted = cuts.filter((c) => c.st === 'Rooted').length; const decided = cuts.filter((c) => c.st !== 'Rooting').length;
    return { runs, cuts, taken: cuts.length, rooted, pct: decided ? Math.round((rooted / decided) * 100) : null, next: `C${n + 1}` };
  }
  function mothersWithClones() {
    const keys = []; (state.cloneRuns || []).forEach((r) => { const k = runMother(r); if (k && !keys.some((x) => same(x, k))) keys.push(k); });
    return keys.map((k) => ({ k, d: cloneData(k) })).filter((x) => x.d.taken).sort((a, b) => (b.d.pct ?? -1) - (a.d.pct ?? -1));
  }
  const pctTxt = (p) => (p === null ? '—' : `${p}%`);
  function clonesHtml() {
    const all = mothersWithClones();
    return `${backBtn(backLabel())}<h2 class="b18-h1">Clone success</h2>
<div class="m-h2"><span>Success by mother</span></div><div class="m-card b18-list">${all.length ? all.map(({ k, d }) => `<button type="button" class="m-row b18-row" data-b49="mclones" data-k="${esc(k)}"><span class="m-grow"><span class="m-t">${esc(nameOf(k))}</span><span class="m-s">${d.rooted} of ${d.taken} rooted · next ${d.next}</span>${d.pct !== null ? `<span class="b49-bar" role="img" aria-label="${d.pct}% rooted"><i style="width:${d.pct}%"></i></span>` : ''}</span><b class="b49-pct">${pctTxt(d.pct)}</b>${CHEV}</button>`).join('') : '<div class="m-row b18-static"><div class="m-grow"><div class="m-s">No clone runs yet. Start one from a mother’s page or the Clone run tracker.</div></div></div>'}</div>`;
  }
  function mClonesHtml(pg) {
    const d = cloneData(pg.key); const nm = nameOf(pg.key);
    const tile = (k, v) => `<div class="b18-stat"><div class="b18-lh-s">${k}</div><b>${v}</b></div>`;
    const st = (c) => (c.st === 'Rooted' ? `<span class="b49-ok">Rooted${c.day ? ` day ${c.day}` : ''}</span>` : c.st === 'Failed' ? `<span class="b49-bad">Failed${c.note ? ` (${esc(c.note)})` : ''}</span>` : `Rooting${c.age !== null ? ` · day ${c.age}` : ''}`);
    return `${backBtn(backLabel())}<h2 class="b18-h1">${esc(nm)} · clones</h2>
<div class="b18-stats three">${tile('Taken', d.taken)}${tile('Rooted', d.rooted)}${tile('Success', pctTxt(d.pct))}</div>
<div class="m-h2"><span>${esc(nm)} · cuttings</span></div><div class="m-card b18-list">${d.cuts.map((c) => `<div class="m-row b18-static"><span class="b18-tile b49-cn" aria-hidden="true">${c.name}</span><div class="m-grow"><div class="m-t">${esc(nm)} ${c.name}</div><div class="m-s">${c.date ? `Cut ${esc(fmt(c.date))} · ` : ''}${st(c)}</div></div></div>`).join('') || '<div class="m-row b18-static"><div class="m-grow"><div class="m-s">No cuttings yet.</div></div></div>'}</div>
<p class="m-s b49-note">Next cutting from ${esc(nm)} is named ${d.next} automatically.</p>`;
  }
  const _page = typeof b18BrPageHtml === 'function' ? b18BrPageHtml : function () { return ''; };
  b18BrPageHtml = function () {
    const pg = B18.brPage;
    if (pg && pg.type === 'b49tree') return treeHtml(pg);
    if (pg && pg.type === 'b49inv') return invHtml();
    if (pg && pg.type === 'b49clones') return clonesHtml();
    if (pg && pg.type === 'b49mclones') return mClonesHtml(pg);
    let h = _page.apply(this, arguments);
    if (pg && pg.type === 'project') h = h.replace(/(<h2 class="b18-h1">[\s\S]*?<\/h2>)/, (m0) => `${m0}${genCard(`pr:${pg.id}`, true)}`);
    return h;
  };
  function genCard(key, keyLegend) {
    const p = par(key); const kids = children(key);
    if (String(key).startsWith('tx:')) return '';
    return `<div class="m-card b49-gcard"><div class="b49-gtop">${badge(key)}<span class="m-s b49-why">${esc(why(key))}</span></div>
<div class="b49-kv b58-pf">${[['m', 'Mother'], ['f', 'Pollen donor']].map(([sd, L], i) => { const q = p && p[i]; const man = rec(key) && rec(key).b58Manual && rec(key).b58Manual[sd];
  return `<span>${L}</span><button type="button" class="b58-pbtn${q ? '' : ' empty'}" data-b58="add" data-of="${esc(key)}" data-side="${sd}" aria-label="${L}: ${q ? esc(nameOf(q)) : 'not recorded'}. Tap to change">${q ? `<b>${esc(nameOf(q) || 'Unknown')}${gen(q) && !/^tx:/.test(q) ? ' · ' + gen(q) : ''}</b>` : '<b class="nr">Not recorded</b>'}<small>${q ? (man ? 'set by hand · tap to change' : 'tap to change') : 'tap to add'}</small></button>`; }).join('')}</div>
<button type="button" class="m-row b18-row b49-treebtn" data-b49="tree" data-k="${esc(key)}"><span class="m-grow"><span class="m-t">Family tree</span><span class="m-s">${p ? 'Parents, grandparents' : 'Parents'}${kids.length ? ` · ${kids.length} descendant${kids.length === 1 ? '' : 's'}` : ''}</span></span>${CHEV}</button>
${keyLegend ? `<p class="m-s b49-key"><span class="b49-gen g-F1">F1</span> two lines · <span class="b49-gen g-F2">F2</span> F1 siblings · <span class="b49-gen g-S1">S1</span> selfed · <span class="b49-gen g-BX">BX1</span> back to a parent</p>` : ''}</div>`;
  }

  /* ================= decorate lists and profiles (idempotent) ================= */
  function decorate() {
    try {
      document.querySelectorAll('[data-open-plant]:not([data-b49g]), #breeding-mobile [data-mf="open"][data-id]:not([data-b49g])').forEach((row) => {
        row.dataset.b49g = '1';
        const key = row.dataset.openPlant ? `${row.dataset.coll === 'breedingPlants' ? 'bp' : 'pl'}:${row.dataset.openPlant}` : `mf:${row.dataset.id}`;
        const stored = rec(key);
        let p = par(key);
        if (!p && stored && (stored.b49Mother || stored.b49Father)) {
          const side = (v) => (v && v !== '-' ? v : '');
          if (stored.b49Mother || stored.b49Father) p = [side(stored.b49Mother), side(stored.b49Father)];
        }
        if (!p && !manualGen(key)) return;
        const t = row.querySelector('.m-t');
        const title = t || row.querySelector('h3, b');
        if (!title) return;
        if (t) t.insertAdjacentHTML('beforeend', ` ${badge(key)}`);
        const grow = (t && t.parentElement) || row.querySelector('.w-pc-id, .w-li-t') || title.parentElement;
        if (p && grow && !grow.querySelector('.b49-par')) { const shown = (k) => nameOf(k) || 'not recorded'; grow.insertAdjacentHTML('beforeend', `<div class="m-s b49-par">${esc(shown(p[0]))} × ${esc(shown(p[1]))}</div>`); }
      });
      const pd = document.querySelector('#plant-detail-view.active .pd-sheet');
      if (pd && !pd.querySelector('.b49-gcard')) { const key = `${detailColl === 'breedingPlants' ? 'bp' : 'pl'}:${detailPlantId()}`; const h = genCard(key); if (h) (pd.querySelector('.pd-quick') || pd.firstElementChild).insertAdjacentHTML('afterend', h); }
      const mh = document.querySelector('#breeding-view.active #breeding-mobile .mf-head');
      if (mh && !mh.parentElement.querySelector('.b49-gcard') && typeof mfDetailRecord === 'function' && mfDetailRecord()) {
        const m = mfDetailRecord(); const key = `mf:${m.id}`; const d = cloneData(key);
        mh.insertAdjacentHTML('afterend', genCard(key) + `<div class="m-card b18-list b49-mfcl"><button type="button" class="m-row b18-row" data-b49="mclones" data-k="${esc(key)}"><span class="b18-tile" aria-hidden="true">✂️</span><span class="m-grow"><span class="m-t">Clones · ${pctTxt(d.pct)} success</span><span class="m-s">${d.rooted} of ${d.taken} rooted · next cutting ${d.next}</span></span>${CHEV}</button></div>`);
      }
      const tools = document.querySelector('#breeding-mobile .b18-tools .b18-list');
      if (tools && !tools.querySelector('[data-b49="inv"]')) {
        const s = seedRows(); const jars = coll.mf().reduce((n, m) => n + ((m.pollen || []).length), 0); const mc = mothersWithClones();
        tools.insertAdjacentHTML('beforeend', `<button type="button" class="m-row b18-row" data-b49="inv"><span class="b18-tile br" aria-hidden="true">🌰</span><span class="m-grow"><span class="m-t">Seeds &amp; pollen</span><span class="m-s">Germination % · pollen jars</span></span><span class="m-pill">${s.length} cross${s.length === 1 ? '' : 'es'} · ${jars} jar${jars === 1 ? '' : 's'}</span>${CHEV}</button><button type="button" class="m-row b18-row" data-b49="clones"><span class="b18-tile br" aria-hidden="true">✂️</span><span class="m-grow"><span class="m-t">Clone success</span><span class="m-s">Per mother · C1, C2…</span></span><span class="m-pill">${mc.length} mother${mc.length === 1 ? '' : 's'}</span>${CHEV}</button>`);
        const em = tools.closest('.b18-tools').querySelector('.m-h2 em'); if (em) em.textContent = `${tools.querySelectorAll('.m-row').length} tools`;
      }
      document.querySelectorAll('article.br-project[data-br-project]:not([data-b49g])').forEach((a) => { a.dataset.b49g = '1'; const h = a.querySelector('h3, .m-t, b'); if (h && par(`pr:${a.dataset.brProject}`)) h.insertAdjacentHTML('beforeend', ` ${badge(`pr:${a.dataset.brProject}`)}`); });
    } catch (e) { console.warn('build49 decorate', e); }
  }
  let q = 0; const mo = new MutationObserver(() => { if (q) return; q = requestAnimationFrame(() => { q = 0; decorate(); }); });
  mo.observe(document.querySelector('main') || document.body, { childList: true, subtree: true });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b49]'); if (!b) return; const k = b.dataset.b49;
    e.preventDefault();
    if (k === 'back') return goBack();
    if (k === 'open') return openKey(b.dataset.k);
    if (k === 'tree') return openPage({ type: 'b49tree', key: b.dataset.k });
    if (k === 'inv') return openPage({ type: 'b49inv' });
    if (k === 'clones') return openPage({ type: 'b49clones' });
    if (k === 'mclones') return openPage({ type: 'b49mclones', key: b.dataset.k });
    if (k === 'germ') return germSheet();
    if (k === 'patients') return switchView('saved-patients');
    if (k === 'harvest') return switchView('harvest');
  });

  /* ================= tab bar: Dashboard · Plants · Breeding · Journal · More ================= */
  const DASH_SVG = '<svg class="ci" viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="5" width="20" height="24" rx="3.5" fill="#c98a3e" stroke="#7a5a30" stroke-width="1.4"/><rect x="9" y="9" width="14" height="17" rx="1.5" fill="#fff"/><rect x="11.5" y="3" width="9" height="5" rx="2" fill="#5a4a40"/><path d="M12 14h8M12 18h8M12 22h5" stroke="#9e6a0a" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const bar = document.getElementById('tabbar');
  if (bar) {
    const by = (v) => bar.querySelector(`[data-tab-view="${v}"]`);
    const dash = by('dash'), pl = by('home'), br = by('breeding'), pt = by('saved-patients'), mo2 = by('more');
    if (dash && pl && br && pt && mo2) {
      const dashSvg = dash.querySelector('svg'); const ptSvg = pt.querySelector('svg');
      // the book button (b48 "Dashboard") becomes Journal again; the jar button (b48 "Patients") becomes Dashboard with its own icon
      dash.dataset.tabView = 'journal'; dash.querySelector('span').textContent = 'Journal'; dash.setAttribute('aria-label', 'Journal');
      pt.dataset.tabView = 'dash'; pt.querySelector('span').textContent = 'Dashboard'; pt.setAttribute('aria-label', 'Dashboard'); if (ptSvg) ptSvg.outerHTML = DASH_SVG;
      bar.prepend(pt); pt.after(pl); pl.after(br); br.after(dash); dash.after(mo2);
      void dashSvg;
    }
  }
  if (typeof MAIN_TABS !== 'undefined') { MAIN_TABS.journal = 'journal'; delete MAIN_TABS['saved-patients']; delete MAIN_TABS.harvest; }
  function moreRows() {
    const list = document.querySelector('#more-view .more-list'); if (!list) return;
    // Journal is a tab again: hide (not remove) b48's row, because b48 re-adds both rows whenever its Journal row is missing.
    const j = list.querySelector('[data-b48="journal"]'); if (j && !j.hidden) j.hidden = true;
    [...list.querySelectorAll('[data-b48="harvest"]')].slice(1).forEach((x) => x.remove());
    if (!list.querySelector('[data-b49="patients"]')) list.insertAdjacentHTML('afterbegin', `<button type="button" data-b49="patients"><span class="mi" aria-hidden="true">🪪</span><span class="mt"><b>Patients</b><small>Saved patients, cards and expiry</small></span></button>`);
  }
  // Keep the Patients row even when More is re-rendered by a path that skips switchView (top back button, renderAll).
  { const mv = document.getElementById('more-view'); if (mv) new MutationObserver(() => { const l = mv.querySelector('.more-list'); if (l && (!l.querySelector('[data-b49="patients"]') || l.querySelector('[data-b48="journal"]:not([hidden])') || l.querySelectorAll('[data-b48="harvest"]').length > 1)) moreRows(); }).observe(mv, { childList: true, subtree: true }); moreRows(); }
  const sw = typeof window.switchView === 'function' ? window.switchView : function () {};
  window.switchView = switchView = function (v, a) { const r = sw.call(this, v, a); if (v === 'more') moreRows(); return r; };

  /* ================= swipe back from the left edge (iPhone; PLAN-NEXT.md §1) ================= */
  const BACK_SEL = ['.b18-back', '[data-detail-action="back"]', '[data-mf="back"]', '[data-mfp="back"]', '[data-b32="back-plant"]', '[data-b32="seedrun"]', '[data-b32="cancel"]', '[data-b49="back"]', '[data-b48="back-dash"]'].join(',');
  const vis = (el) => !!el && el.getClientRects().length > 0 && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden';
  function backTarget() {
    if (document.querySelector('dialog[open]')) return null;
    const v = document.querySelector('main .view.active'); if (!v) return null;
    const own = [...v.querySelectorAll(BACK_SEL)].find(vis); if (own) return own;
    const top = document.getElementById('back-button'); return vis(top) && !top.hidden ? top : null;
  }
  window.b49Back = function () { const t = backTarget(); if (!t) return false; t.click(); return true; };
  const phone = () => !(typeof W19 !== 'undefined' && W19.on);
  let sx = 0, sy = 0, arm = false, moved = 0, vw = null;
  document.addEventListener('touchstart', (e) => {
    arm = false; if (!phone() || e.touches.length !== 1) return; const t = e.touches[0];
    if (t.clientX > 20) return; const el = document.elementFromPoint(t.clientX, t.clientY);
    if (el && el.closest('input[type="range"], dialog, .b49-noswipe')) return;
    if (!backTarget()) return; arm = true; sx = t.clientX; sy = t.clientY; moved = 0; vw = document.querySelector('main .view.active');
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!arm) return; const t = e.touches[0]; const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dy) > 40 && Math.abs(dy) > dx) { arm = false; if (vw) vw.style.transform = ''; return; }
    moved = Math.max(0, dx); if (vw && !matchMedia('(prefers-reduced-motion: reduce)').matches) vw.style.transform = `translateX(${Math.min(moved, innerWidth) * 0.6}px)`;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!arm) return; arm = false; const t = e.changedTouches[0]; const dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    if (vw) vw.style.transform = '';
    if (dx >= 60 && dx > dy * 1.5) b49Back();
  }, { passive: true });
  document.addEventListener('touchcancel', () => { arm = false; if (vw) vw.style.transform = ''; }, { passive: true });

  window.B49 = { linkSig, seedOf, linkedRuns, projFor, autoPar: (k) => { const r = rec(k); return r ? autoParents(k, r, new Set([k])) : null; }, matchName, normName, keyByName, gen, genAuto, why, par, children, cloneData, backTarget, nameOf, openPage, seedRows };
})();
