/*
  Build 13: Top dress reminder settings, Mothers & Fathers (Breeding tab), journal entry edit/delete, Help screen, version footer.
  Loaded after app.js / mobile.js / build4.js / build11.js. Everything here is additive.
*/

/* ---------- version footer ---------- */
function renderVersionFooter() {
  const el = document.getElementById('more-foot');
  if (el) el.textContent = `Borikèn Logbook · v${APP_VERSION} (Build ${APP_BUILD}) · your data stays on this device.`;
}

/* ---------- Top dress interval controls (per plant + global default) ---------- */
const TD_CHOICES = [3, 4, 5, 6];

function tdFillSelect(sel, withDefault) {
  if (!sel) return;
  const def = Number(state.settings && state.settings.topDressDefaultWeeks);
  sel.innerHTML = (withDefault ? `<option value="">Default (${def ? `${def} weeks` : 'off'})</option>` : '')
    + TD_CHOICES.map((n) => `<option value="${n}">Every ${n} weeks</option>`).join('')
    + '<option value="custom">Custom…</option><option value="0">Off</option>';
}

function tdApplyValue(sel, custom, raw) {
  if (!sel) return;
  const has = raw !== undefined && raw !== null && raw !== '' && Number.isFinite(Number(raw)) && Number(raw) >= 0;
  const n = has ? Math.round(Number(raw)) : null;
  custom.hidden = true;
  custom.value = '';
  if (n === null) sel.value = sel.querySelector('option[value=""]') ? '' : '4';
  else if (n === 0) sel.value = '0';
  else if (TD_CHOICES.includes(n)) sel.value = String(n);
  else { sel.value = 'custom'; custom.hidden = false; custom.value = String(n); }
}

function tdReadValue(sel, custom) {
  if (!sel) return '';
  if (sel.value === '') return '';
  if (sel.value === 'custom') {
    const n = Math.round(Number(custom.value));
    return Number.isFinite(n) && n >= 1 && n <= 52 ? n : '';
  }
  return Number(sel.value);
}

function writeTopDressField(prefix, raw) {
  const sel = document.getElementById('plant-td-select');
  const custom = document.getElementById('plant-td-custom');
  tdFillSelect(sel, true);
  tdApplyValue(sel, custom, raw);
}
function readTopDressField() {
  return tdReadValue(document.getElementById('plant-td-select'), document.getElementById('plant-td-custom'));
}

function renderTopDressSettings() {
  const sel = document.getElementById('td-default-select');
  const custom = document.getElementById('td-default-custom');
  if (!sel || !custom || document.activeElement === sel || document.activeElement === custom) return;
  tdFillSelect(sel, false);
  tdApplyValue(sel, custom, state.settings.topDressDefaultWeeks);
  const w = Number(state.settings.topDressDefaultWeeks);
  const note = document.getElementById('td-default-note');
  if (note) note.textContent = w ? `Needs attention after ${w} week${w === 1 ? '' : 's'} without a top dress. Plants can override it.` : 'Off. Plants can still set their own.';
}

function bindTopDress() {
  const sel = document.getElementById('td-default-select');
  const custom = document.getElementById('td-default-custom');
  const commit = () => {
    let v = tdReadValue(sel, custom);
    if (v === '') return; // custom not filled in yet
    state.settings.topDressDefaultWeeks = v;
    saveState();
    renderAll();
  };
  sel?.addEventListener('change', () => { custom.hidden = sel.value !== 'custom'; if (sel.value === 'custom') { custom.focus(); return; } commit(); });
  custom?.addEventListener('change', commit);
  const psel = document.getElementById('plant-td-select');
  const pcustom = document.getElementById('plant-td-custom');
  psel?.addEventListener('change', () => { pcustom.hidden = psel.value !== 'custom'; if (psel.value === 'custom') pcustom.focus(); });
}

/* ---------- Journal / plant log entries: edit + delete (8s undo) ---------- */
const LOG_TYPES = ['Top dress', 'Compost tea', 'Cover crop', 'Mulch', 'Watering', 'Feeding', 'Height', 'Defoliation/Training', 'IPM', 'Move', 'Observation', 'Problem', 'Environment', 'Breeding'];

function findLogRecord(id) {
  for (const key of ['plants', 'breedingPlants']) {
    const list = Array.isArray(state[key]) ? state[key] : [];
    for (const plant of list) {
      const logs = plant && Array.isArray(plant.logs) ? plant.logs : [];
      const at = logs.findIndex((l) => l && l.id === id);
      if (at >= 0) return { plant, log: logs[at], at };
    }
  }
  return null;
}

function openLogEdit(id) {
  const rec = findLogRecord(id);
  if (!rec) return;
  const types = LOG_TYPES.includes(rec.log.type) || !rec.log.type ? LOG_TYPES : [rec.log.type, ...LOG_TYPES];
  $('#logedit-type').innerHTML = types.map((t) => `<option>${escapeHtml(t)}</option>`).join('');
  $('#logedit-id').value = id;
  $('#logedit-eyebrow').textContent = rec.plant.name || 'Journal';
  $('#logedit-type').value = rec.log.type || 'Observation';
  $('#logedit-date').value = rec.log.date || toInputDate(new Date());
  $('#logedit-height').value = rec.log.height || '';
  $('#logedit-feed').value = rec.log.feed || '';
  $('#logedit-notes').value = rec.log.notes || '';
  $('#logedit-sheet').showModal();
}

function saveLogEdit(event) {
  event.preventDefault();
  const form = $('#logedit-form');
  const rec = findLogRecord($('#logedit-id').value);
  if (!rec) { $('#logedit-sheet').close(); return; }
  if (!addGuardStart(form)) return;
  const before = { ...rec.log };
  Object.assign(rec.log, {
    type: $('#logedit-type').value,
    date: $('#logedit-date').value || rec.log.date,
    height: $('#logedit-height').value,
    feed: $('#logedit-feed').value.trim(),
    notes: $('#logedit-notes').value.trim(),
  });
  if (!saveState()) { Object.assign(rec.log, before); return; }
  $('#logedit-sheet').close();
  renderAll();
  showToast('Entry updated', () => { Object.assign(rec.log, before); saveState(); renderAll(); }, 8000);
}

function deleteLogEntry(id) {
  const rec = findLogRecord(id);
  if (!rec) return;
  const { plant, log } = rec;
  openConfirmModal({
    title: 'Delete this entry?',
    message: `${log.type || 'Entry'} · ${formatDate(log.date)} on ${plant.name}. You can undo for a few seconds.`,
    acceptLabel: 'Delete entry',
    action: () => {
      const at = plant.logs.indexOf(log);
      if (at < 0) return;
      plant.logs.splice(at, 1);
      saveState();
      renderAll();
      showToast('Entry deleted', () => {
        if (!plant.logs.includes(log)) plant.logs.splice(Math.min(at, plant.logs.length), 0, log);
        saveState();
        renderAll();
      }, 8000);
    },
  });
}

function bindLogEdit() {
  document.addEventListener('click', (e) => {
    const ed = e.target.closest('[data-log-edit]');
    if (ed) { e.preventDefault(); e.stopPropagation(); openLogEdit(ed.dataset.logEdit); return; }
    const del = e.target.closest('[data-log-del]');
    if (del) { e.preventDefault(); e.stopPropagation(); deleteLogEntry(del.dataset.logDel); }
  }, true);
  $('#logedit-form')?.addEventListener('submit', saveLogEdit);
  wireSheetClose('#logedit-sheet', '#logedit-close', '#logedit-cancel');
  $('#logedit-delete')?.addEventListener('click', () => { const id = $('#logedit-id').value; $('#logedit-sheet').close(); deleteLogEntry(id); });
}

/* ---------- Mothers & Fathers ---------- */
let mfDetailId = '';
let mfShowArchived = false;
/* Build 14 removed the built-in starter names. The released app does not read
   window.__BORIKEN_DEV_SEED and does not insert sample mothers or fathers. */
const MF_STARTERS = [];

function mfList() { if (!Array.isArray(state.motherFatherPlants)) state.motherFatherPlants = []; return state.motherFatherPlants; }
function mfById(id) { return mfList().find((m) => m.id === id) || null; }
function mfDetailRecord() {
  if (!mfDetailId) return null;
  const rec = mfById(mfDetailId);
  if (!rec) mfDetailId = '';
  return rec;
}
function mfRoleLabel(m) { return m.role === 'father' ? 'Father' : 'Mother'; }
function mfTotal(arr) { return (arr || []).reduce((n, e) => n + (Number(e.count) || 0), 0); }
function mfDateLabel(d) { return d ? (typeof formatDate === 'function' ? formatDate(parseDate(d) || d) : d) : ''; }

function mfHelperVisible() { return false; }

function mfSectionHtml() {
  const all = mfList();
  const live = all.filter((m) => (window.B63 && typeof B63.showMother === 'function' ? B63.showMother(m) : (m && !m.archived && m.status !== 'Retired')));
  const arch = all.filter((m) => m && (m.archived || m.status === 'Retired'));
  const pill = (t, c = 'c') => `<span class="m-pill ${c}">${escapeHtml(t)}</span>`;
  const card = (m) => `<div class="m-row" data-mf="open" data-id="${escapeHtml(m.id)}" role="button" tabindex="0">
      <div class="m-ph mf-ph ${m.role}">${m.role === 'father' ? '♂' : '♀'}</div>
      <div class="m-grow"><div class="m-t">${escapeHtml(m.name || 'Unnamed')}</div><div class="m-s">${escapeHtml([mfRoleLabel(m), m.status, `${mfTotal(m.cuttings)} cuttings`, `${(m.pollen || []).length} pollen`].join(' · '))}</div></div>
      ${pill(m.status === 'Retired' ? 'Retired' : mfRoleLabel(m), m.status === 'Retired' ? '' : 'c')}</div>`;
  const helper = mfHelperVisible() ? `<div class="m-card mf-helper"><div class="m-t">Add your plants?</div>
      <div class="m-s">Adds ${escapeHtml(MF_STARTERS.map((s) => s.name).join(', '))} as normal entries. You can edit, archive or delete them any time.</div>
      <div class="mf-help-acts"><button type="button" class="primary-button" data-mf="seed">Add your plants</button><button type="button" class="secondary-button" data-mf="dismiss">Dismiss</button></div></div>` : '';
  const body = live.length
    ? `<div class="m-card">${live.map(card).join('')}</div>`
    : (helper ? '' : '<div class="m-card"><div class="m-row"><div class="m-grow"><div class="m-s">No mothers or fathers yet. Tap + Add to keep track of your breeding stock.</div></div></div></div>');
  return `<div class="m-h2"><span>Mothers &amp; Fathers</span><button type="button" class="br-link" data-mf="add">+ Add</button></div>
    ${helper}${body}
    ${arch.length ? `<button type="button" class="br-link mf-arch-toggle" data-mf="toggle-arch">${mfShowArchived ? 'Hide' : 'Show'} retired / archived (${arch.length})</button>` : ''}
    ${mfShowArchived && arch.length ? `<div class="m-card mf-archived">${arch.map(card).join('')}</div>` : ''}`;
}

function mfLinkedProjects(m) {
  const nm = m.name.trim().toLowerCase();
  return (state.breedingProjects || []).filter((p) => p.motherId === m.id || p.fatherId === m.id
    || (nm && ((p.mother || '').trim().toLowerCase() === nm || (p.father || '').trim().toLowerCase() === nm)));
}

function mfDetailHtml() {
  const m = mfDetailRecord();
  if (!m) return '';
  const sorted = (arr) => [...arr].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const entryRows = (kind, arr, unit) => arr.length ? sorted(arr).map((e) => `<div class="m-row mf-entry">
      <div class="m-grow"><div class="m-t">${e.count} ${unit}${e.count === 1 ? '' : 's'}</div><div class="m-s">${escapeHtml([mfDateLabel(e.date), e.notes].filter(Boolean).join(' · '))}</div></div>
      <button type="button" class="link-button danger" data-mf="del-entry" data-kind="${kind}" data-entry="${escapeHtml(e.id)}" aria-label="Remove entry">Remove</button></div>`).join('')
    : `<div class="m-row"><div class="m-grow"><div class="m-s">Nothing logged yet.</div></div></div>`;
  const projects = mfLinkedProjects(m);
  const fact = (k, v) => v ? `<div class="br-fld"><span>${k}</span><b>${escapeHtml(v)}</b></div>` : '';
  return `<button type="button" class="pd-chip" data-mf="back">‹ Breeding</button>
    <div class="m-card pt-head mf-head">
      <h3>${escapeHtml(m.name || 'Unnamed')}</h3>
      <div class="m-s">${escapeHtml([mfRoleLabel(m), m.status, m.archived ? 'Archived' : ''].filter(Boolean).join(' · '))}</div>
      <div class="pt-actions">
        <button type="button" class="secondary-button" data-mf="edit" data-id="${escapeHtml(m.id)}">Edit</button>
        <button type="button" class="secondary-button" data-mf="archive" data-id="${escapeHtml(m.id)}">${m.archived ? 'Unarchive' : 'Archive'}</button>
        <button type="button" class="danger-button" data-mf="delete" data-id="${escapeHtml(m.id)}">Delete</button>
      </div></div>
    <div class="m-card br-project open">
      ${fact('Acquired', mfDateLabel(m.acquiredDate))}${fact('Source / notes', m.source)}${fact('Health notes', m.healthNotes)}
      ${!m.acquiredDate && !m.source && !m.healthNotes ? '<div class="m-s">No details yet. Tap Edit to add them.</div>' : ''}
    </div>
    <div class="m-h2"><span>Cuttings taken · ${mfTotal(m.cuttings)}</span><button type="button" class="br-link" data-mf="log" data-kind="cuttings" data-id="${escapeHtml(m.id)}">+ Log</button></div>
    <div class="m-card">${entryRows('cuttings', m.cuttings, 'cutting')}</div>
    <div class="m-h2"><span>Pollen collected · ${mfTotal(m.pollen)}</span><button type="button" class="br-link" data-mf="log" data-kind="pollen" data-id="${escapeHtml(m.id)}">+ Log</button></div>
    <div class="m-card">${entryRows('pollen', m.pollen, 'collection')}</div>
    <div class="m-h2"><span>Breeding projects</span><em>${projects.length}</em></div>
    <div class="m-card">${projects.length ? projects.map((p) => `<div class="m-row"><div class="m-grow"><div class="m-t">${escapeHtml(p.name || 'Untitled')}</div><div class="m-s">${escapeHtml([p.generation, p.status].filter(Boolean).join(' · '))}</div></div></div>`).join('') : '<div class="m-row"><div class="m-grow"><div class="m-s">Not used in a project yet. Pick it in a project’s Mother / Father field.</div></div></div>'}</div>`;
}

function mfRefresh() {
  if (typeof renderBreeding === 'function') renderBreeding();
  if (typeof renderAll === 'function') renderAll();
  // The open Mothers & Fathers page replaced #breeding-view, so #breeding-mobile
  // is gone and renderAll leaves the old "Mothers · 0" markup on screen.
  try {
    const v = document.getElementById('breeding-view');
    if (v && v.querySelector('[data-mfp="back"]') && window.B41 && typeof B41.mfpOpen === 'function') B41.mfpOpen();
  } catch (e) { console.warn('mf refresh', e); }
}

function openMfSheet(id) {
  const m = id ? mfById(id) : null;
  $('#mf-form').reset();
  $('#mf-error').hidden = true;
  $('#mf-id').value = m ? m.id : '';
  $('#mf-sheet-title').textContent = m ? 'Edit mother / father' : 'Add mother or father';
  if (m) {
    $('#mf-name').value = m.name; $('#mf-role').value = m.role; $('#mf-status').value = m.status;
    $('#mf-acquired').value = m.acquiredDate; $('#mf-source').value = m.source; $('#mf-health').value = m.healthNotes;
  }
  $('#mf-sheet').showModal();
}

function saveMfFromSheet(event) {
  event.preventDefault();
  const form = $('#mf-form');
  const name = $('#mf-name').value.trim();
  if (!name) { const e = $('#mf-error'); e.textContent = 'Give it a name or strain.'; e.hidden = false; return; }
  if (!addGuardStart(form)) return; // double-tap protection
  const fields = {
    name, role: $('#mf-role').value === 'father' ? 'father' : 'mother', status: $('#mf-status').value === 'Retired' ? 'Retired' : 'Active',
    acquiredDate: $('#mf-acquired').value, source: $('#mf-source').value.trim(), healthNotes: $('#mf-health').value.trim(),
  };
  const id = $('#mf-id').value;
  const existing = id ? mfById(id) : null;
  if (existing) {
    const before = { ...existing };
    Object.assign(existing, fields);
    if (!saveState()) { Object.assign(existing, before); return; }
  } else {
    const rec = normalizeMotherFather({ ...fields, id: freshId(), createdAt: new Date().toISOString() });
    mfList().push(rec);
    if (!saveState()) { mfList().pop(); return; }
  }
  $('#mf-sheet').close();
  mfRefresh();
}

function openMflSheet(id, kind) {
  const m = mfById(id);
  if (!m) return;
  $('#mfl-form').reset();
  $('#mfl-kind').value = `${id}|${kind}`;
  $('#mfl-eyebrow').textContent = m.name;
  $('#mfl-title').textContent = kind === 'pollen' ? 'Log pollen collected' : 'Log cuttings taken';
  $('#mfl-date').value = toInputDate(new Date());
  $('#mfl-count').value = '';
  $('#mfl-sheet').showModal();
}

function saveMflFromSheet(event) {
  event.preventDefault();
  const form = $('#mfl-form');
  const [id, kind] = $('#mfl-kind').value.split('|');
  const m = mfById(id);
  const n = Math.round(Number($('#mfl-count').value));
  if (!m || !(n >= 1) || !$('#mfl-date').value) return;
  if (!addGuardStart(form)) return;
  const entry = { id: freshId(), date: $('#mfl-date').value, count: n, notes: $('#mfl-notes').value.trim() };
  const arr = kind === 'pollen' ? m.pollen : m.cuttings;
  arr.push(entry);
  if (!saveState()) { arr.pop(); return; }
  $('#mfl-sheet').close();
  mfRefresh();
}

function mfDelete(id) {
  const m = mfById(id);
  if (!m) return;
  openConfirmModal({
    title: `Delete ${m.name}?`,
    message: `This removes ${m.name}, its ${m.cuttings.length} cutting and ${m.pollen.length} pollen entries. Breeding projects keep their typed parent names. You can undo for a few seconds. If you only want it out of the way, use Archive.`,
    acceptLabel: 'Delete',
    action: () => {
      const list = mfList();
      const at = list.indexOf(m);
      if (at < 0) return;
      createSnapshot('pre-delete');
      list.splice(at, 1);
      if (mfDetailId === id) mfDetailId = '';
      saveState();
      mfRefresh();
      showToast(`Deleted ${m.name}`, () => {
        if (!mfList().includes(m)) mfList().splice(Math.min(at, mfList().length), 0, m);
        saveState();
        mfRefresh();
      }, 8000);
    },
  });
}

function mfIsRetired(m) {
  return !!(m && (m.status === 'Retired' || m.archived));
}

function mfShowListAfterRetire(m) {
  if (window.B41 && typeof B41.mfpTab === 'function') B41.mfpTab(m && m.role === 'father' ? 'f' : 'm');
  if (typeof switchView === 'function') switchView('breeding');
  if (typeof renderAll === 'function') renderAll();
  if (window.B41 && typeof B41.mfpOpen === 'function') B41.mfpOpen();
}

function mfRetire(id) {
  const m = mfById(id);
  if (!m) return;
  const prevStatus = m.status;
  const prevArchived = !!m.archived;
  if (mfIsRetired(m)) {
    openConfirmModal({
      title: `Restore ${m.name}?`,
      message: 'Moves this plant back to the active Mothers & Fathers list. History and family-tree links stay intact.',
      acceptLabel: 'Restore',
      action: () => {
        m.status = 'Active';
        m.archived = false;
        saveState();
        mfRefresh();
        if (typeof detailColl !== 'undefined' && detailColl === 'mf' && typeof renderPlantDetail === 'function') renderPlantDetail();
        showToast(`${m.name} restored`, () => {
          m.status = prevStatus;
          m.archived = prevArchived;
          saveState();
          mfRefresh();
        }, 8000);
      },
    });
    return;
  }
  openConfirmModal({
    title: `Retire ${m.name}?`,
    message: 'Moves this plant to the Retired / Archived section. History and family-tree links stay intact. Nothing is deleted, and the plant still shows in trees.',
    acceptLabel: 'Retire',
    action: () => {
      m.status = 'Retired';
      m.archived = true;
      saveState();
      mfRefresh();
      mfShowListAfterRetire(m);
      showToast(`${m.name} retired`, () => {
        m.status = prevStatus;
        m.archived = prevArchived;
        saveState();
        mfRefresh();
        if (window.B41 && typeof B41.mfpOpen === 'function') B41.mfpOpen();
      }, 8000);
    },
  });
}

function mfToggleArchive(id) {
  // B-16: Archive on a mother/father is Retire — set status Retired and file under Retired / Archived.
  mfRetire(id);
}

function mfSeedStarters() {
  /* No sample row is created. Records already saved by the user stay put. */
}

function mfDelEntry(id, kind, entryId) {
  const m = mfById(id);
  if (!m) return;
  const arr = kind === 'pollen' ? m.pollen : m.cuttings;
  const at = arr.findIndex((e) => e.id === entryId);
  if (at < 0) return;
  const [entry] = arr.splice(at, 1);
  saveState();
  mfRefresh();
  showToast('Entry removed', () => { if (!arr.includes(entry)) arr.splice(Math.min(at, arr.length), 0, entry); saveState(); mfRefresh(); }, 8000);
}

/* Project form: pick a mother/father from the list (the typed names keep working). */
function mfPickerOptions(role, selectedId) {
  const opts = mfList().filter((m) => m.role === role && (!m.archived || m.id === selectedId));
  return `<option value="">Pick from Mothers &amp; Fathers…</option>${opts.map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === selectedId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}`;
}

function mfSetProjectParents(project) {
  const mId = project && mfById(project.motherId) ? project.motherId : '';
  const fId = project && mfById(project.fatherId) ? project.fatherId : '';
  const mp = $('#breeding-mother-pick'); const fp = $('#breeding-father-pick');
  if (mp) mp.innerHTML = mfPickerOptions('mother', mId);
  if (fp) fp.innerHTML = mfPickerOptions('father', fId);
  if ($('#breeding-mother-id')) $('#breeding-mother-id').value = mId;
  if ($('#breeding-father-id')) $('#breeding-father-id').value = fId;
}

function bindMotherFather() {
  $('#mf-form')?.addEventListener('submit', saveMfFromSheet);
  $('#mfl-form')?.addEventListener('submit', saveMflFromSheet);
  wireSheetClose('#mf-sheet', '#mf-close', '#mf-cancel');
  wireSheetClose('#mfl-sheet', '#mfl-close', '#mfl-cancel');
  /* B-11: delegated on the document. mfpOpen() moves #breeding-mobile out of
     the breeding tree, and + Add / cards live on that new page. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-mf]');
    if (!a) return;
    const act = a.dataset.mf; const id = a.dataset.id;
    if (act === 'add') openMfSheet('');
    else if (act === 'edit') openMfSheet(id);
    else if (act === 'open') { mfDetailId = id; renderBreeding(); window.scrollTo(0, 0); }
    else if (act === 'back') { mfDetailId = ''; renderBreeding(); window.scrollTo(0, 0); }
    else if (act === 'archive') mfToggleArchive(id);
    else if (act === 'delete') mfDelete(id);
    else if (act === 'seed') { a.disabled = true; mfSeedStarters(); }
    else if (act === 'dismiss') { state.settings.mfHelperDismissed = true; saveState(); renderBreeding(); }
    else if (act === 'toggle-arch') { mfShowArchived = !mfShowArchived; renderBreeding(); }
    else if (act === 'log') openMflSheet(id, a.dataset.kind);
    else if (act === 'del-entry') mfDelEntry(mfDetailId, a.dataset.kind, a.dataset.entry);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const a = e.target.closest('[data-mf="open"]');
    if (a) { e.preventDefault(); mfDetailId = a.dataset.id; renderBreeding(); }
  });
  [['mother', '#breeding-mother', '#breeding-mother-pick', '#breeding-mother-id'], ['father', '#breeding-father', '#breeding-father-pick', '#breeding-father-id']].forEach(([role, txt, pick, idEl]) => {
    $(pick)?.addEventListener('change', () => {
      const m = mfById($(pick).value);
      $(idEl).value = m ? m.id : '';
      if (m) $(txt).value = m.name;
    });
    $(txt)?.addEventListener('input', () => {
      const m = mfById($(idEl).value);
      if (m && $(txt).value.trim() !== m.name) { $(idEl).value = ''; $(pick).value = ''; }
    });
  });
  mfSetProjectParents(null);
}

/* ---------- Help (bundled help.html, works offline) ---------- */
let helpLoaded = false;
async function loadHelp() {
  const body = document.getElementById('help-body');
  if (!body || helpLoaded) return;
  try {
    const res = await fetch('help.html', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body.innerHTML = await res.text();
    helpLoaded = true;
  } catch (error) {
    body.innerHTML = '<div class="m-card"><div class="m-row"><div class="m-grow"><div class="m-t">Help is not available right now</div><div class="m-s">Pull down to refresh, or reopen the app.</div></div></div></div>';
  }
}


/* ---------- Automatic iCloud Drive backup (native app only; plugin: ios/App/App/ICloudBackupPlugin.swift) ---------- */
const ICLOUD_ON_KEY = 'boriken-icloud-auto-v1';
const ICLOUD_STATUS_KEY = 'boriken-icloud-status-v1';
const ICLOUD_PREFIX = 'boriken-logbook-backup-';
const ICLOUD_KEEP = 7;
let icloudDirty = false;
let icloudTimer = null;
let icloudBusy = false;
let icloudLastAttempt = 0;

/* Build 14: in the iPhone app this always returns an object (never null), so the toggle is never dead; whether the native side
   is really there is reported by icloudPluginPresent() and by the Test iCloud line in Settings. */
function icloudPlugin() {
  if (!(typeof isNativeApp === 'function' && isNativeApp())) return null;
  const cap = window.Capacitor;
  try { if (typeof cap.registerPlugin === 'function') { const p = cap.registerPlugin('ICloudBackup'); if (p) return p; } } catch (e) { /* fall through */ }
  try { if (cap.Plugins && cap.Plugins.ICloudBackup) return cap.Plugins.ICloudBackup; } catch (e) { /* fall through */ }
  return new Proxy({}, { get: (_t, m) => (m === 'then' ? undefined : () => Promise.reject(new Error('The iCloud backup plugin is not part of this app build.'))) });
}
function icloudPluginPresent() {
  try {
    const cap = window.Capacitor;
    if (typeof cap.isPluginAvailable === 'function' && cap.isPluginAvailable('ICloudBackup')) return true;
    return !!(cap.Plugins && cap.Plugins.ICloudBackup) || (Array.isArray(cap.PluginHeaders) && cap.PluginHeaders.some((h) => h.name === 'ICloudBackup'));
  } catch (e) { return false; }
}
function icloudDiag(text, bad) {
  const el = $('#icloud-diag'); if (!el) return;
  el.textContent = text; el.classList.toggle('icloud-err', !!bad);
}
function withTimeout(promise, ms, label) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} did not answer within ${Math.round(ms / 1000)} s.`)), ms))]);
}
function icloudEnvInfo() {
  const cap = window.Capacitor;
  const has = !!cap;
  let platform = 'n/a'; try { platform = has && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'n/a'; } catch (e) { platform = 'error'; }
  let native = 'n/a'; try { native = has && typeof cap.isNativePlatform === 'function' ? String(!!cap.isNativePlatform()) : 'n/a'; } catch (e) { native = 'error'; }
  let headers = 'none'; try { if (has && Array.isArray(cap.PluginHeaders)) headers = cap.PluginHeaders.map((h) => h && h.name).filter(Boolean).join(', ') || '(empty)'; } catch (e) { headers = 'error'; }
  let plugins = 'none'; try { if (has && cap.Plugins) plugins = Object.keys(cap.Plugins).join(', ') || '(empty)'; } catch (e) { plugins = 'error'; }
  return `window.Capacitor ${has ? 'YES' : 'NO'} · platform ${platform} · native ${native} · registerPlugin ${has && typeof cap.registerPlugin === 'function' ? 'YES' : 'NO'} · PluginHeaders [${headers}] · Plugins [${plugins}] · build ${typeof APP_BUILD !== 'undefined' ? APP_BUILD : '?'}`;
}
async function testIcloud() {
  const btn = $('#icloud-test'); if (btn) btn.disabled = true;
  try {
    const env = icloudEnvInfo();
    if (!(typeof isNativeApp === 'function' && isNativeApp())) { icloudDiag(`Test iCloud: iPhone app only (this is a browser). ${env}`, false); return; }
    const present = icloudPluginPresent();
    icloudDiag(`Test iCloud: plugin present ${present ? 'YES' : 'NO'} · checking iCloud… ${env}`, !present);
    let st;
    try { st = await withTimeout(icloudPlugin().status(), 8000, 'iCloud status'); } catch (e) { icloudDiag(`Test iCloud: plugin present ${present ? 'YES' : 'NO'} · iCloud signed in: unknown · error: ${String((e && e.message) || e)} · ${env}`, true); return; }
    const signed = st && st.signedIn ? 'YES' : 'NO';
    icloudDiag(`Test iCloud: plugin present YES · iCloud signed in ${signed} · container ${st && st.available ? 'OK' : 'NOT available'}${st && st.message ? ` · ${st.message}` : ''}${st && st.code ? ` [${st.code}]` : ''} · ${env}`, !(st && st.available));
  } catch (e) {
    icloudDiag(`Test iCloud failed: ${String((e && e.message) || e)}`, true);
  } finally { if (btn) btn.disabled = false; }
}
function icloudEnabled() { try { return localStorage.getItem(ICLOUD_ON_KEY) === '1'; } catch (e) { return false; } }
function icloudSetEnabled(on) { try { if (on) localStorage.setItem(ICLOUD_ON_KEY, '1'); else localStorage.removeItem(ICLOUD_ON_KEY); } catch (e) { /* ignore */ } }
function icloudStatus() { try { return JSON.parse(localStorage.getItem(ICLOUD_STATUS_KEY) || '{}') || {}; } catch (e) { return {}; } }
function icloudSaveStatus(patch) { try { localStorage.setItem(ICLOUD_STATUS_KEY, JSON.stringify({ ...icloudStatus(), ...patch })); } catch (e) { /* ignore */ } }
function icloudTiming() { return { debounce: 45000, min: 5 * 60000, ...(window.__icloudTiming || {}) }; }

function renderIcloud() {
  const native = !!icloudPlugin();
  const on = native && icloudEnabled();
  const toggle = $('#icloud-toggle');
  if (toggle) { toggle.checked = on; toggle.disabled = !native; }
  const note = $('#icloud-note');
  if (note) note.textContent = !native ? 'Available in the iPhone app.' : on
    ? 'On. A full backup is saved to your private iCloud Drive (Files › iCloud Drive › Borikèn Logbook). Files contain patient names and card numbers.'
    : 'Off. Saves a full backup to your private iCloud Drive. Backup files contain patient names and card numbers.';
  const s = icloudStatus();
  const state = $('#icloud-state'); const last = $('#icloud-last'); const err = $('#icloud-err'); const now = $('#icloud-now');
  if (!state) return;
  state.textContent = !native ? 'iPhone app only' : icloudBusy ? 'Backing up…' : on ? 'On' : 'Off';
  last.textContent = !native ? 'Automatic iCloud backup works in the iPhone app.'
    : !on ? 'Turn it on in More › Settings. Back up to Files / iCloud above still works any time.'
    : `Last auto-backup: ${s.lastOk ? new Date(s.lastOk).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'none yet'}${s.lastName ? ` · ${s.lastName}` : ''}`;
  err.hidden = !(on && s.error);
  err.textContent = s.error ? `Last attempt failed: ${s.error}` : '';
  if (now) { now.disabled = !on || icloudBusy; now.hidden = !native; }
}

async function runIcloudBackup(opts = {}) {
  const plugin = icloudPlugin();
  if (!plugin || !icloudEnabled() || icloudBusy) return false;
  clearTimeout(icloudTimer); icloudTimer = null;
  icloudBusy = true;
  icloudLastAttempt = Date.now();
  renderIcloud();
  let ok = false;
  try {
    const st = await plugin.status();
    if (!st || !st.available) throw new Error((st && st.message) || 'iCloud is not available. Sign in to iCloud and turn on iCloud Drive in iOS Settings.');
    const payload = await buildFullBackupPayload();
    const name = `${ICLOUD_PREFIX}${todayKey()}.json`;
    const json = JSON.stringify(payload);
    await plugin.writeBackup({ filename: name, data: json });
    try { await plugin.prune({ prefix: ICLOUD_PREFIX, keep: ICLOUD_KEEP }); } catch (e) { console.warn('iCloud prune failed', e); }
    icloudSaveStatus({ lastOk: new Date().toISOString(), lastName: name, bytes: json.length, error: '' });
    icloudDirty = false;
    ok = true;
    if (typeof markBackupExported === 'function') markBackupExported();
    if (opts.manual) showToast('Backed up to iCloud Drive');
  } catch (error) {
    const msg = String((error && error.message) || error);
    icloudSaveStatus({ error: msg, lastErrorAt: new Date().toISOString() });
    if (opts.manual) showToast(`iCloud backup failed: ${msg}`, null, 8000);
  } finally {
    icloudBusy = false;
    renderIcloud();
  }
  return ok;
}

function scheduleIcloud() {
  if (icloudTimer) return;
  const t = icloudTiming();
  const wait = Math.max(t.debounce, t.min - (Date.now() - icloudLastAttempt));
  icloudTimer = setTimeout(() => { icloudTimer = null; runIcloudBackup({}); }, wait);
}

function icloudChanged() {
  if (!icloudEnabled() || !icloudPlugin()) return;
  icloudDirty = true;
  scheduleIcloud();
}

function bindIcloud() {
  const toggle = $('#icloud-toggle');
  $('#icloud-test')?.addEventListener('click', testIcloud);
  toggle?.addEventListener('change', () => {
    try {
      if (!(typeof isNativeApp === 'function' && isNativeApp())) { toggle.checked = false; icloudDiag('Automatic iCloud backup works in the iPhone app.', false); showToast('Automatic iCloud backup works in the iPhone app.'); return; }
      if (!toggle.checked) { icloudSetEnabled(false); clearTimeout(icloudTimer); icloudTimer = null; renderIcloud(); icloudDiag('Automatic iCloud backup is off.', false); showToast('Automatic iCloud backup is off'); return; }
      toggle.checked = false; // only turns on after the person confirms and iCloud is reachable
      icloudDiag('Waiting for your confirmation…', false);
      openConfirmModal({
        title: 'Turn on automatic iCloud backup?',
        message: 'The app will save a complete backup file to its folder in your iCloud Drive (Files › iCloud Drive › Borikèn Logbook). It includes patient names, card numbers and photos. It stays in your private iCloud account and is not shared with anyone. The newest 7 daily files are kept. You can turn this off any time.',
        acceptLabel: 'Turn on',
        action: async () => {
          try {
            icloudDiag('Checking iCloud…', false);
            let st = null;
            try { st = await withTimeout(icloudPlugin().status(), 8000, 'iCloud status'); } catch (e) { st = { available: false, message: String((e && e.message) || e) }; }
            if (!st || !st.available) {
              const msg = (st && st.message) || 'iCloud is not available.';
              icloudSaveStatus({ error: msg });
              renderIcloud();
              icloudDiag(`Not turned on: ${msg}${st && st.code ? ` [${st.code}]` : ''}`, true);
              showToast(`Not turned on: ${msg}`, null, 9000);
              return;
            }
            icloudSetEnabled(true);
            icloudSaveStatus({ error: '' });
            renderIcloud();
            icloudDiag('On. Saving the first backup…', false);
            await runIcloudBackup({ manual: true });
            const e2 = icloudStatus().error;
            if (e2) { icloudSetEnabled(false); renderIcloud(); icloudDiag(`Turned off: ${e2}`, true); }
            else icloudDiag('On. First backup saved to iCloud Drive.', false);
          } catch (e) {
            icloudSetEnabled(false); renderIcloud();
            icloudDiag(`Not turned on: ${String((e && e.message) || e)}`, true);
            showToast(`Not turned on: ${String((e && e.message) || e)}`, null, 9000);
          }
        },
      });
    } catch (e) {
      toggle.checked = false;
      icloudDiag(`Could not start: ${String((e && e.message) || e)}`, true);
      showToast(`iCloud backup: ${String((e && e.message) || e)}`, null, 9000);
    }
  });
  $('#icloud-now')?.addEventListener('click', () => runIcloudBackup({ manual: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && icloudEnabled() && icloudDirty && !icloudBusy) runIcloudBackup({});
  });
  renderIcloud();
  // Catch up shortly after launch if the last good backup is more than a day old.
  setTimeout(() => {
    if (!icloudEnabled() || !icloudPlugin()) return;
    const last = icloudStatus().lastOk;
    if (!last || Date.now() - new Date(last).getTime() > 24 * 3600 * 1000) runIcloudBackup({});
  }, 6000);
}

const _saveState13 = saveState;
saveState = function () {
  const r = _saveState13.apply(this, arguments);
  if (r !== false) { try { icloudChanged(); } catch (e) { console.warn(e); } }
  return r;
};

/* ---------- wiring ---------- */
const _onMobileViewChange13 = typeof onMobileViewChange === 'function' ? onMobileViewChange : null;
onMobileViewChange = function (view) {
  if (_onMobileViewChange13) _onMobileViewChange13(view);
  if (view === 'help') loadHelp();
  if (view === 'breeding' && mfDetailId && !mfById(mfDetailId)) mfDetailId = '';
};

const _renderAll13 = renderAll;
renderAll = function () {
  _renderAll13.apply(this, arguments);
  try { renderVersionFooter(); renderTopDressSettings(); renderIcloud(); } catch (e) { console.warn(e); }
};

document.addEventListener('DOMContentLoaded', () => {
  bindTopDress();
  bindLogEdit();
  bindMotherFather();
  bindIcloud();
  renderVersionFooter();
  renderTopDressSettings();
});
