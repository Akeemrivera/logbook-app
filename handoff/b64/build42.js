/* Build 42 (Elio, Oct 27 3:19 PM): Mothers & Fathers get their own full profile under Breeding.
   The state.motherFatherPlants record IS the profile (grade, feeding, medium, notes, health, cuttings / pollen, crosses,
   clone runs); it is shown with the plant-profile layout through a third detail collection, detailColl === 'mf'.
   Before mothers / fathers get looks and a log list, the data is backed up once in a 'pre-b42' snapshot (idempotent,
   deletes nothing). Also: dead taps on the M&F page fixed, the profile background no longer leaks onto other pages. */
(function () {
  'use strict';
  const R = document.documentElement;
  const mfAll = () => state.motherFatherPlants || (state.motherFatherPlants = []);
  const mfById = (id) => mfAll().find((m) => m.id === id) || null;
  const isF = (m) => m && m.role === 'father';
  let detailMfId = '';

  /* ---- migration: 'pre-b42' backup first, then logs[] + a unique look for every mother / father ---- */
  const FLAG = 'boriken-b42-snapshot';
  function snap() {
    if (localStorage.getItem(FLAG)) return true;
    try {
      const has = () => loadSnapshots().some((s) => s && s.reason === 'pre-b42');
      if (!has() && !(typeof isStateEmpty === 'function' && isStateEmpty())) {
        const list = loadSnapshots(); // direct push: never prunes an older backup
        list.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, reason: 'pre-b42', counts: snapshotCounts(state), state: JSON.parse(JSON.stringify(state)) });
        persistSnapshots(list);
        if (!has()) return false;
      }
      localStorage.setItem(FLAG, new Date().toISOString()); return true;
    } catch (e) { console.warn('b42 snapshot', e); return false; }
  }
  function migrate() {
    const need = mfAll().some((m) => !Array.isArray(m.logs) || !m.profileLook);
    if (!need) { window.__b42mf = true; return { skipped: true }; }
    if (!snap()) return { error: 'snapshot' }; // never change data without the backup
    mfAll().forEach((m) => { if (!Array.isArray(m.logs)) m.logs = []; });
    window.__b42mf = true; // build41 now includes mothers / fathers in the look assignment
    try { B41.assign(); } catch (e) { console.warn('b42 looks', e); }
    saveState(); return { migrated: true };
  }

  /* ---- the 'mf' detail collection: plant-shaped views of the stock records (logs array shared, so logs persist) ---- */
  function view(m) {
    if (!Array.isArray(m.logs)) m.logs = [];
    const d = (m.acquiredDate || String(m.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10));
    return { ...m, logs: m.logs, location: isF(m) ? 'Father / pollen donor' : 'Mother plant', growType: m.growMedium === 'bottled' ? 'Bottled nutrients' : 'Living soil', startDate: d, count: 1, status: 'active', __mf: true };
  }
  const _cp = collPlants; collPlants = function () { return detailColl === 'mf' ? mfAll().map(view) : _cp.apply(this, arguments); };
  const _dp = detailPlantId; detailPlantId = function () { return detailColl === 'mf' ? detailMfId : _dp.apply(this, arguments); };
  const _op = openPlantDetail;
  openPlantDetail = function (id, coll) {
    if (coll !== 'mf') return _op.apply(this, arguments);
    detailColl = 'mf'; detailMfId = id; mfDetailId = '';
    renderPlantDetail(); switchView('plant-detail'); window.scrollTo(0, 0);
  };
  const esc = (s) => escapeHtml(String(s == null ? '' : s));
  const role = (m) => (isF(m) ? 'Father' : 'Mother');
  const badge = (m) => `<span class="mfx-role ${isF(m) ? 'f' : 'm'}" aria-label="${role(m)}">${isF(m) ? '♂' : '♀'} ${role(m)}</span>`;
  const tot = (a) => (a || []).reduce((n, e) => n + (Number(e.count) || 0), 0);
  const wide = () => matchMedia('(min-width:1024px)').matches;

  function roleCard(m) {
    const fa = isF(m); const ent = (fa ? m.pollen : m.cuttings) || [];
    const runs = (state.cloneRuns || []).filter((r) => r.srcColl === 'mf' && r.srcId === m.id);
    const clones = (state.plants || []).filter((p) => p.motherFatherId === m.id);
    const projects = typeof mfLinkedProjects === 'function' ? mfLinkedProjects(m) : [];
    const sorted = [...ent].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `<section class="mfx" aria-label="${role(m)} record"><div class="m-h2"><span>${fa ? 'Father role · pollen' : 'Mother role · cuttings'}</span><button type="button" class="br-link" data-mf="log" data-kind="${fa ? 'pollen' : 'cuttings'}" data-id="${esc(m.id)}">+ ${fa ? 'Log pollen' : 'Log cuttings'}</button></div>
    <div class="m-card">
      <div class="m-row"><div class="m-grow"><div class="m-t">${fa ? `${ent.length} pollen lot${ent.length === 1 ? '' : 's'}` : `${tot(ent)} cuttings taken`}</div><div class="m-s">${sorted.length ? sorted.map((e) => esc([e.date, fa ? `${e.count} collected` : `${e.count} cuttings`, e.notes].filter(Boolean).join(' · '))).join('<br>') : (fa ? 'Log a collection date and amount, then use it in a cross.' : 'No cuttings yet.')}</div></div></div>
      ${fa ? '' : `<div class="m-row"><div class="m-grow"><div class="m-t">Clone runs from this mother · ${runs.length}</div><div class="m-s">${runs.length ? runs.map((r) => esc(`Run #${r.num || ''} · ${r.cuts || r.count || 0} cuttings · linked automatically`)).join('<br>') : 'None yet. Clone runs you start here link to her on their own.'}</div></div></div>
      <div class="m-row"><div class="m-grow"><div class="m-t">Clones · ${clones.length}</div><div class="m-s">${clones.length ? '' : 'Clones made from her link here automatically.'}</div>${clones.length ? `<div class="mfx-links">${clones.map((p) => `<button type="button" class="mfx-link" data-b42="plant" data-id="${esc(p.id)}">${esc(p.name)} ›</button>`).join('')}</div>` : ''}</div></div>`}
      <div class="m-row"><div class="m-grow"><div class="m-t">Crosses · ${projects.length}</div><div class="m-s">${projects.length ? projects.map((p) => esc([p.name || 'Untitled', p.status].filter(Boolean).join(' · '))).join('<br>') : (fa ? 'Not used as a father yet' : 'Not used as a mother in a cross yet')}</div></div></div>
      <div class="m-row"><div class="m-grow"><div class="m-t">Health &amp; notes</div><div class="m-s">${esc([m.status, m.growMedium === 'bottled' ? 'Bottled nutrients' : 'Living soil', m.acquiredDate ? `since ${m.acquiredDate}` : '', m.source, m.healthNotes].filter(Boolean).join(' · '))}</div></div><button type="button" class="br-link" data-mf="edit" data-id="${esc(m.id)}">Edit</button></div>
    </div></section>`;
  }
  function bgOf(e) { let c = ''; while (e) { c = getComputedStyle(e).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) break; e = e.parentElement; } const m = (c.match(/[\d.]+/g) || [255, 255, 255]).map(Number); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2] < 128 ? 'dark' : 'light'; }
  function tone(v) { try { const set = (e, k, val) => { if (e.dataset[k] !== val) e.dataset[k] = val; }; set(v, 'b42body', bgOf(v.querySelector('.pd-sheet') || v)); v.querySelectorAll('.m-card, .pd-quick button, .w-chip, .m-h2').forEach((e) => set(e, 'b42t', bgOf(e))); } catch (e) { /* ignore */ } }
  /* Elio 4:51 PM: mother / father profiles show stock info only — no plant growth stages, dates or counts */
  const HIDE_LAB = /^(Seeds popped|Plants running|Progress to harvest|Veg start|Flower start|Planned flip.*|Stage history|Harvest \(projected\)|Days as seedling|Plant age|Start|Flip|Harvest|Veg day.*|Flower day.*)$/i;
  const STAGE = /^(Seedling|Veg|Vegetative|Flower|Flowering|Clone|Harvest|Harvested|Drying|Curing)$/i;
  function stockOnly(v, m) {
    const lab = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const hide = (e) => { if (e && !e.closest('section.mfx') && !e.hidden) { e.hidden = true; e.dataset.b42h = '1'; } };
    v.querySelectorAll('.pd-kv, .w-tile-c, .m-row, .w-kv > div').forEach((r) => { const k = r.querySelector('.k, dt, .m-t, span, div'); const t = k ? lab(k) : ''; if (HIDE_LAB.test(t) || HIDE_LAB.test(lab(r).split(/\s{2,}|\n/)[0])) hide(r); });
    v.querySelectorAll('.w-tile-c').forEach((t) => { if (/^(Days as seedling|Harvest \(projected\)|Plant age|Plants running)/i.test(lab(t))) hide(t); });
    v.querySelectorAll('button, [role=button]').forEach((b) => { if (/flip to flower|^flip$|start flower/i.test(lab(b))) hide(b); });
    v.querySelectorAll('.badge, .m-pill, .pd-stage, span, small').forEach((e) => { if (e.children.length === 0 && STAGE.test(lab(e))) hide(e); });
    // Elio 5:52 PM: no Harvest data (wet / dry weight) card on mother / father profiles
    v.querySelectorAll('.m-h2').forEach((h) => { if (/^harvest data/i.test(lab(h))) { hide(h); let n = h.nextElementSibling; if (n && n.classList.contains('m-card')) hide(n); } });
    // empty cards and their headings go too
    v.querySelectorAll('.m-card').forEach((c) => { if (c.closest('section.mfx')) return; const kids = [...c.children]; if (!kids.length || !kids.some((x) => x.dataset.b42h) || kids.some((x) => !x.hidden)) return; { hide(c); const h = c.previousElementSibling; if (h && h.classList.contains('m-h2')) hide(h); } });
    // one line instead of start date + plant age
    const d = m.acquiredDate || String(m.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const n = Math.max(0, Math.round((Date.now() - new Date(d + 'T12:00:00').getTime()) / 864e5));
    const txt = `Kept since ${typeof formatShort === 'function' ? formatShort(d) : d} · ${n} day${n === 1 ? '' : 's'}`;
    let kl = v.querySelector('.mfx-kept'); const sec = v.querySelector('section.mfx');
    if (!kl && sec) { sec.insertAdjacentHTML('beforebegin', `<p class="mfx-kept" data-b42="kept">${esc(txt)}</p>`); kl = v.querySelector('.mfx-kept'); }
    if (kl && kl.textContent !== txt) kl.textContent = txt;
  }
  function decorate() {
    const v = document.getElementById('plant-detail-view'); if (!v) return; tone(v);
    v.classList.toggle('mfx-profile', detailColl === 'mf');
    document.querySelectorAll('.mfx-crumb').forEach((e) => { if (detailColl !== 'mf') e.remove(); });
    if (detailColl !== 'mf') return;
    const m = mfById(detailMfId); if (!m) return;
    const status = `${role(m)} · ${m.status === 'Retired' ? 'Retired' : 'Active'}`;
    stockOnly(v, m);
    v.querySelectorAll('.pd-stage, .pd-hero .b18-stage').forEach((e) => { e.textContent = status; });
    [...v.querySelectorAll('span,div,b')].filter((e) => e.children.length === 0 && /^(Seedling|Veg|Flower|Harvest)( · .*)?$/.test(e.textContent.trim())).forEach((e) => { e.textContent = status; });
    // plant-only controls do not apply to a stock record
    [...v.querySelectorAll('button')].filter((b) => /Promote to|Flip to flower|^Harvest$|Move to/.test(b.textContent.trim()) || b.dataset.quick === 'move').forEach((b) => { b.hidden = true; b.style.display = 'none'; });
    // B-16: the plant-detail Archive button is the retire control on a mother / father profile
    v.querySelectorAll('[data-detail-action="archive"]').forEach((b) => {
      const retired = m.status === 'Retired' || m.archived;
      b.textContent = retired ? 'Restore' : 'Retire';
      b.dataset.b16 = 'retire';
    });
    v.querySelectorAll('[data-b32="promote"]').forEach((b) => { b.hidden = true; b.style.display = 'none'; });
    // back reads '‹ Mothers & Fathers'
    v.querySelectorAll('button, a').forEach((b) => { if (/^‹\s*(Plants|Breeding)$/.test(b.textContent.trim())) { b.textContent = '‹ Mothers & Fathers'; b.dataset.b42 = 'back'; b.setAttribute('aria-label', 'Back to Mothers & Fathers'); } });
    // ♀/♂ badge: iPhone above the name; Mac next to the back button
    v.querySelectorAll('.mfx-rolewrap').forEach((e) => e.remove());
    const hero = [...v.querySelectorAll('.pd-hero')][0];
    const names = hero && hero.querySelector('.pd-hero-names');
    if (names && !wide()) names.insertAdjacentHTML('afterbegin', `<span class="mfx-rolewrap">${badge(m)}</span>`);
    const body = document.getElementById('plant-detail-body');
    if (wide() && body && !body.querySelector('.mfx-crumb')) body.insertAdjacentHTML('afterbegin', `<div class="mfx-crumb"><button type="button" class="mfx-back" data-b42="back">‹ Mothers &amp; Fathers</button>${badge(m)}</div>`);
    // the record card, before Grade
    v.querySelectorAll('section.mfx').forEach((e) => e.remove());
    // Build 42: plant-only tiles off; on Mac the role card goes above the stat tiles (mockup)
    v.querySelectorAll('.w-tile-c').forEach((t) => { const lab = (t.textContent || '').replace(/\s+/g, ' ').trim(); if (/^(Days as seedling|Harvest \(projected\))/i.test(lab) || /Days as seedling|Harvest \(projected\)/i.test(lab.slice(0, 30))) t.hidden = true; });
    let tiles = null; if (wide()) { const t0 = v.querySelector('.w-tile-c'); tiles = t0 ? t0.parentElement : null; if (tiles && tiles.classList.contains('w-tile-c')) tiles = tiles.parentElement; }
    const g = tiles || [...v.querySelectorAll('.m-h2')].find((e) => /^Grade/i.test(e.textContent.trim()) && e.offsetParent !== null) || v.querySelector('.b32-pd');
    const card = roleCard(m);
    if (g) g.insertAdjacentHTML('beforebegin', card); else { const q = v.querySelector('.pd-quick'); if (q) q.insertAdjacentHTML('afterend', card); }
  }
  const _r = renderPlantDetail;
  renderPlantDetail = function () { const r = _r.apply(this, arguments); try { decorate(); } catch (e) { console.warn('b42 mf profile', e); } return r; };

  function title() { if (detailColl !== 'mf') return; const t = document.getElementById('view-title'); if (t) t.textContent = 'Breeding'; const c = document.querySelector('[data-wide="tcount"]'); if (c) c.hidden = true; }
  /* ---- the profile's look must not leak onto other pages (stale html[data-b39bg] made the M&F page cream) ---- */
  function clearLeak() { if (typeof activeView !== 'undefined' && activeView !== 'plant-detail') { ['b39bg', 'popt', 'pword', 'pal', 'arr', 'look'].forEach((k) => delete R.dataset[k]); } }
  const _sv = switchView;
  switchView = function (v) {
    const r = _sv.apply(this, arguments);
    try { if (v === 'plant-detail') { if (!R.dataset.b39bg) renderPlantDetail(); title(); } else clearLeak(); } catch (e) { /* ignore */ }
    return r;
  };
  const _ra = renderAll;
  renderAll = function () { const r = _ra.apply(this, arguments); try { clearLeak(); } catch (e) { /* ignore */ } return r; };

  /* ---- Mac list next to a mother / father profile: only that group, with the same tabs ---- */
  function listHtml() {
    const m = mfById(detailMfId); const fa = isF(m); const L = mfAll().filter((x) => (window.B63 && typeof B63.showMother === 'function' ? B63.showMother(x) : (x && !x.archived && x.status !== 'Retired')));
    const M = L.filter((x) => !isF(x)), F = L.filter(isF); const show = fa ? F : M;
    return `<div class="mfx-list"><div class="b18-seg mfp-seg" role="tablist"><button type="button" class="${fa ? '' : 'on'}" role="tab" aria-selected="${!fa}" data-b42="tab" data-t="m">Mothers · ${M.length}</button><button type="button" class="${fa ? 'on' : ''}" role="tab" aria-selected="${fa}" data-b42="tab" data-t="f">Fathers · ${F.length}</button></div>
      <div class="m-card">${show.map((x) => `<button type="button" class="w-li mfx-li${x.id === detailMfId ? ' on' : ''}" data-mf="open" data-id="${esc(x.id)}"${x.id === detailMfId ? ' aria-current="true"' : ''}><span class="m-ph mf-ph ${isF(x) ? 'father' : 'mother'}" aria-hidden="true">${isF(x) ? '♂' : '♀'}</span><span class="w-li-t"><b>${esc(x.name)}</b><small>${esc(isF(x) ? `${(x.pollen || []).length} pollen lots` : `${tot(x.cuttings)} cuttings`)}</small></span></button>`).join('')}</div></div>`;
  }

  /* ---- every data-mf action works outside #breeding-mobile (M&F page, profiles, Mac list) ---- */
  document.addEventListener('click', (e) => {
    const b42 = e.target.closest('[data-b42]');
    if (b42) {
      const a = b42.dataset.b42; if (!['back', 'plant', 'tab'].includes(a)) return;
      e.preventDefault(); e.stopPropagation();
      if (a === 'back') { const m = mfById(detailMfId); if (m) B41.mfpTab(isF(m) ? 'f' : 'm'); switchView('breeding'); renderAll(); B41.mfpOpen(); }
      else if (a === 'plant') openPlantDetail(b42.dataset.id, 'plants');
      else if (a === 'tab') { B41.mfpTab(b42.dataset.t); const L = mfAll().filter((x) => (window.B63 && typeof B63.showMother === 'function' ? B63.showMother(x) : (x && !x.archived && x.status !== 'Retired')) && (b42.dataset.t === 'f') === isF(x)); if (L.length) openPlantDetail(L[0].id, 'mf'); else { switchView('breeding'); renderAll(); B41.mfpOpen(); } }
      return;
    }
    const el = e.target.closest('[data-mf]'); if (!el || el.closest('#breeding-mobile')) return; // build13 handles its own box
    const act = el.dataset.mf; const id = el.dataset.id;
    e.preventDefault(); e.stopPropagation();
    if (act === 'open') openPlantDetail(id, 'mf');
    else if (act === 'add') { openMfSheet(''); const r = document.getElementById('mf-role'); if (r && el.dataset.role) r.value = el.dataset.role; }
    else if (act === 'edit') openMfSheet(id || detailMfId);
    else if (act === 'log') openMflSheet(id || detailMfId, el.dataset.kind);
    else if (act === 'archive') mfToggleArchive(id);
    else if (act === 'del-entry') mfDelEntry(detailMfId, el.dataset.kind, el.dataset.entry);
  }, true);
  // the hero Edit chip on a mother / father profile edits the stock record
  document.addEventListener('click', (e) => {
    if (detailColl !== 'mf' || typeof activeView === 'undefined' || activeView !== 'plant-detail') return;
    const b = e.target.closest('#plant-detail-view button'); if (!b || b.dataset.mf || b.dataset.b42 || b.dataset.b39) return;
    if (/^Edit$/.test(b.textContent.trim()) && !b.closest('section.mfx')) { e.preventDefault(); e.stopPropagation(); openMfSheet(detailMfId); }
  }, true);

  try { migrate(); } catch (e) { console.warn('b42 migrate', e); }
  setInterval(() => { try { clearLeak(); if (typeof activeView !== 'undefined' && activeView === 'plant-detail') { title(); const pv = document.getElementById('plant-detail-view'); if (pv) { tone(pv); if (detailColl === 'mf') { const mm = mfById(detailMfId); if (mm) stockOnly(pv, mm); } } } } catch (e) { /* ignore */ } }, 300);
  window.B42 = { migrate, snap, listHtml, open: (id) => openPlantDetail(id, 'mf'), cur: () => detailMfId };
})();
