/*
  Mobile shell for the Borikèn Genetics Logbook (iOS / Capacitor).
  Adds the bottom tab bar, the Plants dashboard, plant detail with quick-add,
  the More menu and the optional Face ID app lock. It reads and writes the same
  `state` and log entry shape as app.js; no storage keys are renamed or migrated.
  New keys: LOCK_KEY (on/off flag) and LOCK_PROMPTED_KEY (first-run prompt shown); both kept outside the backups.
*/

const LOCK_KEY = 'boriken-app-lock-v1';
const LOCK_PROMPTED_KEY = 'boriken-app-lock-prompted-v1';
const LOCK_GRACE_MS = 30000;
const STAGE_GROUPS = ['Seedling', 'Veg', 'Flower', 'Harvest', 'Stage not recorded'];
/* Build 13: no water reminder (plants are auto-watered). Top dress is the only care reminder; interval is in weeks. */
const TOP_DRESS_DEFAULT_WEEKS = 4;
const MAIN_TABS = { home: 'home', breeding: 'breeding', harvest: 'harvest', 'plant-detail': 'home', journal: 'journal', more: 'more' };
// Build 4: plant detail can show a production plant (state.plants) or a breeding plant (state.breedingPlants).
let detailColl = 'plants';
let detailBreedingId = '';
function collPlants() { return detailColl === 'breedingPlants' ? (state.breedingPlants || []) : state.plants; }
function detailPlantId() { return detailColl === 'breedingPlants' ? detailBreedingId : selectedPlantId; }

function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/* ---------- navigation chrome ---------- */

function onMobileViewChange(view) {
  document.body.dataset.view = view;
  const tab = view === 'plant-detail' && (detailColl === 'breedingPlants' || detailColl === 'mf') ? 'breeding' : (MAIN_TABS[view] || 'more');
  document.body.dataset.coll = view === 'breeding' || (view === 'plant-detail' && (detailColl === 'breedingPlants' || detailColl === 'mf')) ? 'breeding' : 'plants';
  $$('[data-tab-view]').forEach((b) => {
    const on = b.dataset.tabView === tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (view !== 'plant-detail') detailColl = 'plants';
  const back = $('#back-button');
  if (back) {
    const isRoot = !!MAIN_TABS[view];
    back.hidden = isRoot;
    back.textContent = '‹';
    back.setAttribute('aria-label', 'Back to More');
  }
  window.scrollTo(0, 0);
  if (view === 'more') syncLockToggle();
}

function bindMobileChrome() {
  $$('[data-tab-view]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.tabView;
    if (v === 'home' && activeView === 'plant-detail') { detailColl = 'plants'; switchView('home'); return; }
    if (v === 'breeding' && activeView === 'plant-detail') { switchView('breeding'); return; }
    switchView(v);
  }));
  $('#back-button')?.addEventListener('click', () => switchView('more'));
  $('#quick-close')?.addEventListener('click', () => $('#quick-sheet').close());
  $('#quick-cancel')?.addEventListener('click', () => $('#quick-sheet').close());
  $('#quick-form')?.addEventListener('submit', onQuickSheetSubmit);
  $('#quick-photo')?.addEventListener('change', onQuickPhotoChosen);
  $('#lock-toggle')?.addEventListener('change', onLockToggle);
  $('#lock-unlock')?.addEventListener('click', () => attemptUnlock());
  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-open-plant],[data-quick],[data-detail-action]');
    if (!el) return;
    if (el.dataset.openPlant) { openPlantDetail(el.dataset.openPlant, el.dataset.coll || 'plants'); return; }
    if (el.dataset.quick) { event.stopPropagation(); quickAction(el.dataset.quick, el.dataset.plant || selectedPlantId); return; }
    if (el.dataset.detailAction === 'harvest' && typeof openPlantHarvestSheet === 'function') { openPlantHarvestSheet(selectedPlantId, 'log'); return; }
    if (el.dataset.detailAction === 'hdata' && typeof openPlantHarvestSheet === 'function') { openPlantHarvestSheet(selectedPlantId, 'data'); return; }
    if (el.dataset.detailAction === 'flip' && typeof openFlipSheet === 'function') { openFlipSheet(selectedPlantId, false); return; }
    if (el.dataset.detailAction === 'flipedit' && typeof openFlipSheet === 'function') { openFlipSheet(selectedPlantId, true); return; }
    if (el.dataset.detailAction === 'notes' && typeof openPlantNotesSheet === 'function') { openPlantNotesSheet(detailColl); return; }
    if (el.dataset.detailAction === 'patient' && typeof openPatientPicker === 'function') { openPatientPicker(selectedPlantId); return; }
    if (el.dataset.detailAction === 'gentag' && typeof generateTag === 'function') { generateTag(selectedPlantId); return; }
    if (el.dataset.detailAction === 'archive') {
      // B-16: mother/father profiles use this Archive control, but the record lives in
      // state.motherFatherPlants (and selectedPlantId may be stale because the Build 42
      // openPlantDetail wrapper never sets it). archivePlant only looks in state.plants
      // and otherwise returns silently.
      if (typeof detailColl !== 'undefined' && detailColl === 'mf' && typeof mfRetire === 'function') {
        const mid = (typeof detailPlantId === 'function' ? detailPlantId() : '') || selectedPlantId;
        mfRetire(mid);
        return;
      }
      if (typeof archivePlant === 'function') { archivePlant(selectedPlantId); return; }
    }
    if (el.dataset.detailAction === 'manage') { switchView('plants'); renderAll(); }
    if (el.dataset.detailAction === 'back') switchView(detailColl === 'breedingPlants' ? 'breeding' : 'home');
    if (el.dataset.detailAction === 'bedit' && typeof openBreedingPlantSheet === 'function') openBreedingPlantSheet(detailBreedingId);
    if (el.dataset.detailAction === 'pdelete' && typeof deletePlant === 'function') deletePlant(selectedPlantId);
    if (el.dataset.detailAction === 'bdelete' && typeof deleteBreedingPlant === 'function') deleteBreedingPlant(detailBreedingId);
    if (el.dataset.detailAction === 'edit' && detailColl === 'breedingPlants') { openBreedingPlantSheet(detailBreedingId); return; }
    if (el.dataset.detailAction === 'edit') { const pl = state.plants.find((x) => x.id === selectedPlantId); if (pl) openPlantModal(pl); }
  });
  // Privacy cover: hide the screen when the app is backgrounded / in the app switcher.
  // (iOS also covers the window natively in SceneDelegate.sceneWillResignActive.)
  const cover = (on) => { const el = $('#privacy-cover'); if (el) el.hidden = !on; };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lockHiddenAt = Date.now(); cover(true); return; }
    cover(false);
    if (lockEnabled() && !lockBusy && lockHiddenAt && Date.now() - lockHiddenAt > LOCK_GRACE_MS) showLock();
  });
  window.addEventListener('pagehide', () => cover(true));
  window.addEventListener('pageshow', () => cover(false));
  document.addEventListener('pause', () => cover(true));
  document.addEventListener('resume', () => cover(false));
}

function openPlantDetail(id, coll = 'plants') {
  detailColl = coll;
  if (coll === 'breedingPlants') detailBreedingId = id; else selectedPlantId = id;
  renderPlantDetail();
  switchView('plant-detail');
}

/* ---------- data helpers ---------- */

function daysSince(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  return Math.floor((getToday() - d) / MS_PER_DAY);
}

function lastLogOfType(plant, type) {
  let best = null;
  (plant.logs || []).forEach((log) => {
    if (log.type !== type || !log.date) return;
    if (!best || log.date >= best.date) best = log;
  });
  return best;
}

function ageText(days) {
  if (days === null) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

/* Interval in weeks for a plant: its own setting if it has one ('' / undefined = use the global default), 0 = off. */
function topDressWeeksFor(plant) {
  const own = plant && plant.topDressWeeks;
  if (own !== undefined && own !== null && own !== '' && Number.isFinite(Number(own)) && Number(own) >= 0) return Math.round(Number(own));
  const g = Number(state.settings && state.settings.topDressDefaultWeeks);
  return Number.isFinite(g) && g >= 0 ? Math.round(g) : TOP_DRESS_DEFAULT_WEEKS;
}

function weeksAgoText(days) {
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  const w = Math.floor(days / 7);
  return `${w} week${w === 1 ? '' : 's'} ago`;
}

/* Returns null when nothing is due, else {days, last, text}. Due when the last 'Top dress' log is at least `weeks` weeks old,
   or (none logged) the plant is in Veg/Flower and was started at least `weeks` weeks ago. Off (0) never reminds. */
function topDressDue(plant, stats) {
  const weeks = topDressWeeksFor(plant);
  if (!weeks) return null;
  const st = stats || getPlantStats(plant);
  if (st.stage !== 'Veg' && st.stage !== 'Flower') return null;
  const last = lastLogOfType(plant, 'Top dress');
  if (last) {
    const d = daysSince(last.date);
    if (d !== null && d >= weeks * 7) return { days: d, last, text: `Top dress due · last ${weeksAgoText(d)}` };
    return null;
  }
  const age = st.plantAgeDays;
  if (age !== null && age !== undefined && age >= weeks * 7) return { days: null, last: null, text: `Top dress due · none logged yet (${weeksAgoText(age)} since start)` };
  return null;
}

function topDressSummary(plant, st) {
  const weeks = topDressWeeksFor(plant);
  const last = lastLogOfType(plant, 'Top dress');
  const lastText = last ? `Last top dress ${weeksAgoText(Math.max(0, daysSince(last.date) || 0))}` : 'No top dress logged yet';
  return `${lastText} · reminder ${weeks ? `every ${weeks} week${weeks === 1 ? '' : 's'}` : 'off'}`;
}

function attentionItems() {
  const items = [];
  const seen = new Set();
  sortedActiveStrains().forEach((plant) => {
    if (seen.has(plant)) return; // each plant at most once
    const stats = getPlantStats(plant);
    if (stats.ready) {
      seen.add(plant);
      items.push({ plant, kind: 'harvest', text: 'Ready to harvest · 100%' });
      return;
    }
    if (stats.flipDue) {
      seen.add(plant);
      items.push({ plant, kind: 'flip', text: `Planned flip ${formatShort(stats.plannedFlipDate)} · reminder only` });
      return;
    }
    const due = topDressDue(plant, stats);
    if (due) { seen.add(plant); items.push({ plant, kind: 'topdress', text: due.text }); }
  });
  return items;
}

function latestPhotoLog(plant) {
  const logs = [...(plant.logs || [])].filter(hasPhoto).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return logs.find((l) => photoSrc(l)) || null;
}

function thumbStyle(plant) {
  const log = latestPhotoLog(plant);
  const src = log && photoSrc(log);
  return src ? `style="background-image:url('${src}')"` : '';
}


/* ---------- plant thumbnails: newest photo, else stage icon / entry-type icon ---------- */
const ICON_PATHS = {
  seedling: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z"/><path d="M12 14c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5z"/>',
  veg: '<path d="M12 21v-8"/><path d="M12 13c-4 0-7-2-7-6 4 0 7 2 7 6z"/><path d="M12 13c4 0 7-2 7-6-4 0-7 2-7 6z"/><path d="M12 9c-2-1-3-3-3-5 2 1 3 3 3 5z"/>',
  flower: '<circle cx="12" cy="10" r="2.2"/><path d="M12 7.8V4M12 12.2V16M9.8 10H6M14.2 10H18M10.4 8.4 7.7 5.7M13.6 11.6l2.7 2.7M13.6 8.4l2.7-2.7M10.4 11.6l-2.7 2.7"/><path d="M12 16v5"/>',
  harvest: '<path d="M4 20h16"/><path d="M6 20c0-6 2-9 6-9s6 3 6 9"/><path d="M12 11V5"/><path d="M9 8c1-2 2-3 3-3s2 1 3 3"/>',
  curing: '<rect x="6" y="9" width="12" height="11" rx="2"/><path d="M8 9V6h8v3"/><path d="M9 14h6"/>',
  note: '<path d="M5 4h14v16H5zM9 9h6M9 13h6"/>',
  photo: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  drop: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"/>',
  ruler: '<path d="M3 15 15 3l6 6L9 21z"/><path d="M7 11l3 3M10 8l2 2M13 5l3 3"/>',
  alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17v.5"/>',
  cut: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 18M8 15.5 20 6"/>',
  env: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  bug: '<ellipse cx="12" cy="13" rx="4" ry="5.5"/><path d="M12 7.5V4M9 5l3 2.5L15 5M8 11H4M16 11h4M8.5 15H5M15.5 15H19M9 18.5l-2 2M15 18.5l2 2"/>',
  pin: '<path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.500-6 10-6 10z"/><circle cx="12" cy="11" r="2.200"/>',
  breed: '<path d="M8 4c0 5 8 5 8 10s-8 5-8 6M16 4c0 5-8 5-8 10s8 5 8 6"/>',
};
function stageIconKey(stage) {
  switch (stage) {
    case 'Seedling': return 'seedling';
    case 'Veg': return 'veg';
    case 'Flower': return 'flower';
    case 'Curing': case 'Drying': case 'Finished': case 'Archived': return 'curing';
    default: return 'harvest';
  }
}
function entryIconKey(type) {
  const t = String(type || '').toLowerCase();
  if (/top dress|mulch|cover crop/.test(t)) return 'seedling';
  if (/tea|water|feed/.test(t)) return 'drop';
  if (/height/.test(t)) return 'ruler';
  if (/defol|train/.test(t)) return 'cut';
  if (/problem/.test(t)) return 'alert';
  if (/ipm|pest/.test(t)) return 'bug';
  if (/^move/.test(t)) return 'pin';
  if (/environ/.test(t)) return 'env';
  if (/breed/.test(t)) return 'breed';
  if (/photo/.test(t)) return 'photo';
  return 'note';
}
function iconSvg(key) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_PATHS[key] || ICON_PATHS.note}</svg>`;
}
function plantThumbHtml(plant, log) {
  const photoLog = latestPhotoLog(plant);
  const src = photoLog && photoSrc(photoLog);
  if (src) return `<div class="m-ph has-photo" style="background-image:url('${src}')"></div>`;
  if (log) return `<div class="m-ph m-ph-entry">${iconSvg(entryIconKey(log.type))}</div>`;
  const st = getPlantStats(plant).stage;
  return `<div class="m-ph m-ph-stage ph-${stageIconKey(st)}">${iconSvg(stageIconKey(st))}</div>`;
}

/* ---------- renderers ---------- */

function renderMobile() {
  renderHome();
  renderPlantDetail();
}

function renderHome() {
  const att = $('#home-attention');
  if (!att) return;
  if (!state.plants.length) {
    att.innerHTML = '';
    // The Welcome card already offers 'Add your first plant'; only show the empty state when it is hidden.
    $('#home-stages').innerHTML = isStateEmpty() ? '' : getEmptyStateHtml();
    $('#home-stages').querySelector('button')?.addEventListener('click', () => openPlantModal());
    return;
  }
  const items = attentionItems();
  att.innerHTML = `<div class="m-h2"><span>Needs attention today</span><em>${items.length}</em></div>
    <div class="m-card">${items.length ? items.map((it) => `
      <div class="m-row" data-open-plant="${it.plant.id}" role="button" tabindex="0">
        ${plantThumbHtml(it.plant)}
        <div class="m-grow"><div class="m-t">${escapeHtml(it.plant.name)}</div><div class="m-s">${escapeHtml(it.text)}</div></div>
        ${it.kind === 'harvest' ? '<span class="m-pill w">Ready</span>' : it.kind === 'flip' ? '<span class="m-pill w">Flip day</span>' : `<button type="button" class="m-pill w m-act" data-quick="${it.kind === 'topdress' ? 'topdress-now' : it.kind}" data-plant="${it.plant.id}">Top dress</button>`}
      </div>`).join('') : '<div class="m-row"><div class="m-grow"><div class="m-t">All caught up</div><div class="m-s">No top dressing due.</div></div><span class="m-pill">✓</span></div>'}</div>`;

  const active = sortedActiveStrains();
  const harvested = sortedPlants().filter((p) => p.status === 'harvest');
  const groups = STAGE_GROUPS.map((stage) => ({ stage, plants: stage === 'Harvest' ? harvested : active.filter((p) => getPlantStats(p).stage === stage) })).filter((g) => g.plants.length);
  $('#home-stages').innerHTML = groups.length ? groups.map((g) => `
    <div class="m-h2"><span>${g.stage}</span><em>${g.plants.length}</em></div>
    <div class="m-card">${g.plants.map((p) => {
      const st = getPlantStats(p);
      const dayLabel = g.stage === 'Harvest' ? (p.harvestDate ? `Harvested ${formatShort(p.harvestDate)}` : 'Harvested') : plantDayLabel(p, st);
      const tag = st.ready ? '<div class="m-tag ready">Ready to harvest</div>' : st.flipPlanned ? `<div class="m-tag${st.flipDue ? ' due' : ''}">Planned flip ${escapeHtml(formatShort(st.plannedFlipDate))} · reminder only</div>` : '';
      const pill = g.stage === 'Harvest' ? (p.dryWeight ? escapeHtml(p.dryWeight) : 'Dry pending') : (st.progress === null ? (g.stage === 'Veg' || g.stage === 'Seedling' || g.stage === 'Flower' ? plantDayLabel(p, st) : '—') : st.ready ? 'Ready' : `${st.progress}%`);
      return `<div class="m-row" data-open-plant="${p.id}" role="button" tabindex="0">
        ${plantThumbHtml(p)}
        <div class="m-grow"><div class="m-t">${escapeHtml(p.name)}</div><div class="m-s">${escapeHtml([dayLabel, p.location, typeof b18RowExtra === 'function' ? b18RowExtra(p) : ''].filter(Boolean).join(' · '))}</div>${tag}</div>
        <span class="m-pill" title="${g.stage === 'Harvest' ? 'Dry weight' : g.stage === 'Flower' ? 'Progress to harvest (flower days)' : 'Day count'}" aria-label="${g.stage === 'Harvest' ? 'Dry weight' : g.stage === 'Flower' ? 'Progress to harvest' : 'Day count'}: ${pill}">${pill}</span></div>`;
    }).join('')}</div>`).join('') : '<div class="m-card"><div class="m-row"><div class="m-grow"><div class="m-t">No active plants</div><div class="m-s">Harvested plants are in More › Plant manager.</div></div></div></div>';
}

function plantLogRowHtml(log) {
  const detail = [log.notes || (log.height || log.feed ? '' : 'No notes'), log.height ? `Height ${log.height}"` : '', log.feed ? `Feed ${log.feed}` : ''].filter(Boolean).join(' · ');
  return `<div class="m-row pd-log">
    <div class="m-ph m-ph-entry">${iconSvg(entryIconKey(log.type))}</div>
    <div class="m-grow"><div class="m-t">${escapeHtml(log.type || 'Entry')} · ${escapeHtml(formatDate(log.date))}</div><div class="m-s">${escapeHtml(detail)}</div>
    ${log.id ? `<p class="log-actions"><button type="button" class="link-button" data-log-edit="${escapeHtml(log.id)}">Edit</button><button type="button" class="link-button danger" data-log-del="${escapeHtml(log.id)}">Delete</button></p>` : ''}</div>
    ${hasPhoto(log) && photoSrc(log) ? `<img class="journal-thumb" src="${photoSrc(log)}" alt="Photo from ${escapeHtml(formatDate(log.date))}" loading="lazy" />` : ''}
  </div>`;
}

function renderPlantDetail() {
  const box = $('#plant-detail-body');
  if (!box) return;
  const plant = collPlants().find((p) => p.id === detailPlantId());
  if (!plant) { box.innerHTML = '<div class="m-card"><div class="m-row"><div class="m-grow"><div class="m-t">No plant selected</div></div></div></div>'; return; }
  const isB = detailColl === 'breedingPlants';
  const st = getPlantStats(plant);
  const photo = latestPhotoLog(plant);
  const src = photo && photoSrc(photo);
  const heightLog = [...(plant.logs || [])].filter((l) => l.height).sort((a, b) => b.date.localeCompare(a.date))[0];
  const dayLabel = plantDayLabel(plant, st);
  const order = ['Seedling', 'Veg', 'Flower', 'Harvest'];
  const cur = Math.max(0, order.indexOf(st.stage));
  const postHarvest = !['Seedling', 'Veg', 'Flower'].includes(st.stage);
  const logs = [...(plant.logs || [])].map((l, i) => ({ ...l, plantName: '', _i: i })).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b._i - a._i);
  const photos = logs.filter(hasPhoto);
  const qbtn = (kind, label, icon) => `<button type="button" data-quick="${kind}" data-plant="${plant.id}">${iconSvg(icon)}${label}</button>`;
  const row = (k, v, extra = '') => `<div class="pd-kv"><span class="k">${k}</span><span class="v">${v}${extra}</span></div>`;
  const dash = '—';
  const g = (v) => (v ? escapeHtml(String(v)) : `${dash} g`);
  const stageChip = postHarvest ? escapeHtml(st.stage) : `${escapeHtml(st.stage)} · ${escapeHtml(dayLabel)}`;
  const subline = [plant.cultivar && plant.cultivar !== plant.name ? plant.cultivar : '', plant.location, plant.growType, heightLog ? `${heightLog.height}"` : ''].filter(Boolean).join(' · ');
  const hero = `
    <div class="pd-hero" ${src ? `style="background-image:linear-gradient(transparent 35%,rgba(0,0,0,.65)),url('${src}')"` : ''}>
      <div class="pd-hero-top">
        <button type="button" class="pd-chip" data-detail-action="back">‹ ${isB ? 'Breeding' : 'Plants'}</button>
        <button type="button" class="pd-chip" data-detail-action="edit">Edit</button>
      </div>
      <div class="pd-hero-text">
        <span class="m-pill pd-stage">${stageChip}</span>${st.ready ? ' <span class="m-pill pd-stage pd-ready">Ready to harvest</span>' : ''}
        <div class="pd-hero-id">${src ? '' : `<div class="m-ph m-ph-stage ph-${stageIconKey(st.stage)} pd-hero-ph">${iconSvg(stageIconKey(st.stage))}</div>`}
          <div class="pd-hero-names"><h3>${escapeHtml(plant.name)}</h3><p>${escapeHtml(subline)}</p></div></div>
      </div>
    </div>`;
  const quick = `<div class="pd-quick">
        ${qbtn('topdress', 'Top dress', 'seedling')}${qbtn('note', 'Note', 'note')}${qbtn('photo', 'Photo', 'photo')}${qbtn('height', 'Height', 'ruler')}
        ${qbtn('training', 'Training', 'cut')}${qbtn('ipm', 'IPM', 'bug')}${qbtn('move', 'Move', 'pin')}${qbtn('problem', 'Problem', 'alert')}
      </div>`;
  const logsHtml = `<div class="m-h2"><span>Recent logs</span></div>
      <div class="m-card pd-logs">${logs.slice(0, 8).map(plantLogRowHtml).join('') || '<div class="m-row"><div class="m-grow"><div class="m-s">No entries yet.</div></div></div>'}</div>`;
  const photosHtml = `<div class="m-h2"><span>Photos</span><button type="button" class="m-link" data-quick="photo" data-plant="${plant.id}">+ Add photo</button></div>
      <div class="timeline-gallery">${photos.map(photoTileHtml).join('') || '<p class="m-s">No photos yet. Tap Photo above.</p>'}</div>`;
  const notesHtml = `<div class="m-h2"><span>Notes</span><button type="button" class="m-link" data-detail-action="notes">Edit</button></div>
      <div class="m-card pd-notes"><div class="m-row"><div class="m-grow"><div class="m-s pd-note-text">${plant.notes ? escapeHtml(plant.notes) : 'No notes yet.'}</div></div></div></div>`;

  if (isB) {
    const dates = [plant.startDate ? formatShort(plant.startDate) : '', plant.vegStartDate ? formatShort(plant.vegStartDate) : '', st.actualFlowerStart ? formatShort(st.actualFlowerStart) : (st.plannedFlipDate ? `~${formatShort(st.plannedFlipDate)}` : ''), `~${formatShort(st.harvestDate)}`];
    box.innerHTML = `${hero}
    <div class="pd-sheet">
      ${quick}
      <div class="m-h2"><span>Growth timeline</span></div>
      <div class="m-card pd-timeline">${order.map((name, i) => `
        <div class="pd-step"><div class="pd-rail"><span class="pd-dot ${!postHarvest && i <= cur || postHarvest ? 'done' : ''}"></span><span class="pd-line"></span></div>
        <div class="m-grow m-t">${name}${!postHarvest && i === cur ? ' <small>now</small>' : ''}</div><div class="m-s">${dates[i]}</div></div>`).join('')}</div>
      ${photosHtml}
      ${logsHtml}
      ${notesHtml}
      <div class="button-row pd-manage"><button type="button" class="secondary-button" data-detail-action="bedit">Edit plant</button><button type="button" class="danger-button" data-detail-action="bdelete">Delete plant</button></div>
    </div>`;
    return;
  }

  const harvested = plant.status === 'harvest' || !!plant.harvestDate || ['Drying', 'Curing', 'Finished'].includes(st.stage);
  const flipBtn = st.canFlip ? `<button type="button" class="primary-button pd-flip" data-detail-action="flip">${iconSvg('veg')}<span>Flip to flower</span></button>` : '';
  const readyBtn = st.ready ? `<button type="button" class="primary-button pd-flip" data-detail-action="harvest">${iconSvg('harvest')}<span>Ready to harvest · Log harvest</span></button>` : '';
  const flowerRow = st.actualFlowerStart
    ? row('Flower start', escapeHtml(formatShort(st.actualFlowerStart)), plant.growType === 'Autoflower' ? '' : ' <button type="button" class="m-link" data-detail-action="flipedit">Edit</button>')
    : row('Flower start', `${dash} (not flipped)`);
  const plannedRow = plant.growType === 'Autoflower' ? '' : row('Planned flip (reminder)', plant.plannedFlipDate ? escapeHtml(formatShort(plant.plannedFlipDate)) : 'Not set');
  const harvRow = plant.harvestDate ? row('Harvest', escapeHtml(formatShort(plant.harvestDate))) : row('Harvest (projected)', `~${escapeHtml(formatShort(st.harvestDate))}`);
  const patient = plant.patientId && typeof getPatientById === 'function' ? getPatientById(plant.patientId) : null;
  const tagState = plant.tagTextSnapshot ? `${titleCase(plant.tagStatus || 'pending')}${plant.tagAttached ? ' · attached' : ''}` : 'Not generated';
  box.innerHTML = `${hero}
    <div class="pd-sheet">
      ${flipBtn}${readyBtn}
      ${quick}
      <p class="m-s pd-td">${escapeHtml(topDressSummary(plant, st))}</p>
      <div class="m-h2"><span>Key dates</span></div>
      <div class="m-card pd-kvs">
        ${!isB && !postHarvest ? row('Progress to harvest', st.progress === null ? (st.stage === 'Veg' || st.stage === 'Seedling' ? 'Starts at flip' : dash) : st.ready ? '100% · Ready to harvest' : `${st.progress}% of flower`) : ''}
        ${row('Start', plant.startDate ? escapeHtml(formatShort(plant.startDate)) : dash)}
        ${row('Veg start', plant.vegStartDate ? escapeHtml(formatShort(plant.vegStartDate)) : dash)}
        ${flowerRow}
        ${plannedRow}
        ${harvRow}
      </div>
      ${logsHtml}
      ${photosHtml}
      ${notesHtml}
      <div class="m-h2"><span>Harvest data</span><button type="button" class="m-link" data-detail-action="hdata">Edit</button></div>
      <div class="m-card pd-kvs">
        ${row('Wet weight', g(plant.wetWeight), plant.wetWeight ? '' : '')}
        ${row('Dry weight', g(plant.dryWeight))}
      </div>
      <div class="m-h2"><span>Compliance &amp; tagging</span></div>
      <div class="m-card pd-kvs">
        <button type="button" class="pd-kv pd-kv-btn" data-detail-action="patient" aria-label="Choose patient"><span class="k">Patient</span><span class="v">${patient ? escapeHtml(patient.alias || 'Unnamed') : 'Unassigned'} <i class="pd-chev" aria-hidden="true">›</i></span></button>
        ${row('Plant code', plant.internalPlantCode ? escapeHtml(plant.internalPlantCode) : dash)}
        ${row('Tag', escapeHtml(tagState))}
        <div class="pd-kv-actions"><button type="button" class="secondary-button" data-detail-action="gentag">${plant.tagTextSnapshot ? 'Regenerate tag' : 'Generate tag'}</button></div>
      </div>
      <div class="m-h2"><span>Manage</span></div>
      ${harvested ? '' : '<button type="button" class="primary-button pd-manage pd-harvest-link" data-detail-action="harvest">Log harvest</button>'}
      <div class="button-row pd-manage pd-manage-row"><button type="button" class="secondary-button" data-detail-action="edit">Edit</button><button type="button" class="secondary-button" data-detail-action="archive">Archive</button></div>
      <button type="button" class="danger-button pd-manage pd-delete" data-detail-action="pdelete">Delete plant</button>
      <p class="m-s pd-more"><button type="button" class="m-link" data-detail-action="manage">Open full plant manager page</button></p>
    </div>`;
}

function formatShort(value) {
  const d = value instanceof Date ? value : parseDate(value);
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}

/* ---------- quick add (writes the app's existing log entries) ---------- */

const QUICK_UNDO_MS = 8000;
let quickCtx = null;
let toastTimer = null;

function showToast(message, undo, ms = 4500) {
  const t = $('#toast');
  if (!t) return;
  t.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = message;
  t.appendChild(span);
  if (undo) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Undo';
    btn.addEventListener('click', () => { undo(); t.hidden = true; });
    t.appendChild(btn);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

function pushQuickLog(plant, entry) {
  plant.logs = plant.logs || [];
  const log = Object.assign({ id: crypto.randomUUID(), date: toInputDate(new Date()), type: 'Observation', height: '', feed: '', notes: '', photo: '', photoId: '' }, entry);
  plant.logs.push(log);
  if (!saveState()) { plant.logs.pop(); return null; }
  showStorageError('');
  if (detailColl !== 'breedingPlants') selectedPlantId = plant.id;
  renderAll();
  return log;
}

function undoQuickLog(plant, log) {
  const at = (plant.logs || []).indexOf(log);
  if (at >= 0) plant.logs.splice(at, 1);
  saveState();
  renderAll();
}

const QUICK_KINDS = {
  feed: { title: 'Log feeding', type: 'Feeding', ph: 'Optional' },
  topdress: { title: 'Log top dress', type: 'Top dress', ph: 'What did you top dress with? (optional)' },
  note: { title: 'Add note', type: 'Observation', ph: 'Optional', needNotes: true },
  height: { title: 'Log height', type: 'Height', ph: 'Optional' },
  training: { title: 'Log training', type: 'Defoliation/Training', ph: 'Topped, defoliated, tied down… (optional)' },
  ipm: { title: 'Log IPM', type: 'IPM', ph: 'What did you spray or release? (optional)' },
  move: { title: 'Log move', type: 'Move', ph: 'Optional' },
  problem: { title: 'Log problem', type: 'Problem', ph: 'What do you see?', needNotes: true },
};

function quickAction(kind, plantId) {
  const plant = collPlants().find((p) => p.id === plantId);
  if (!plant) return;
  if (kind === 'topdress-now') {
    // One tap from the Needs attention row: log today's top dress immediately (8s undo).
    const log = pushQuickLog(plant, { type: 'Top dress' });
    if (log) showToast(`Top dress logged for ${plant.name}`, () => undoQuickLog(plant, log), QUICK_UNDO_MS);
    return;
  }
  if (kind === 'photo') { quickCtx = { kind, plantId }; const f = $('#quick-photo'); f.value = ''; f.click(); return; }
  quickCtx = { kind, plantId };
  const cfg = QUICK_KINDS[kind] || QUICK_KINDS.note;
  $('#quick-eyebrow').textContent = plant.name;
  $('#quick-title').textContent = cfg.title;
  $('#quick-feed-wrap').hidden = kind !== 'feed';
  $('#quick-height-wrap').hidden = kind !== 'height';
  $('#quick-loc-wrap').hidden = kind !== 'move';
  if ($('#quick-type-wrap')) { $('#quick-type-wrap').hidden = kind !== 'note'; $('#quick-type').value = 'Observation'; }
  $('#quick-notes').placeholder = cfg.ph;
  $('#quick-feed').value = '';
  $('#quick-height').value = '';
  $('#quick-loc').value = plant.location || '';
  $('#quick-notes').value = '';
  $('#quick-sheet').showModal();
}

function onQuickSheetSubmit(event) {
  event.preventDefault();
  if (!quickCtx) return;
  const plant = collPlants().find((p) => p.id === quickCtx.plantId);
  if (!plant) return;
  const notes = $('#quick-notes').value.trim();
  const feed = $('#quick-feed').value.trim();
  const kind = quickCtx.kind;
  const cfg = QUICK_KINDS[kind] || QUICK_KINDS.note;
  const form = $('#quick-form');
  const height = $('#quick-height').value.trim();
  const loc = $('#quick-loc').value.trim();
  if (cfg.needNotes && !notes) { $('#quick-notes').focus(); return; }
  if (kind === 'height' && !(Number(height) > 0)) { $('#quick-height').focus(); return; }
  if (kind === 'move' && !loc) { $('#quick-loc').focus(); return; }
  if (!addGuardStart(form)) return; // double-tap protection: one entry per save
  const type = kind === 'note' ? ($('#quick-type') && !$('#quick-type-wrap').hidden ? $('#quick-type').value : 'Observation') : cfg.type;
  const entry = { type, feed: kind === 'feed' ? feed : '', notes };
  if (kind === 'height') entry.height = String(Number(height));
  const oldLoc = plant.location || '';
  if (kind === 'move') {
    entry.notes = [`Moved ${oldLoc && oldLoc !== loc ? `from ${oldLoc} ` : ''}to ${loc}`, notes].filter(Boolean).join('. ');
    plant.location = loc;
  }
  const log = pushQuickLog(plant, entry);
  if (!log && kind === 'move') plant.location = oldLoc;
  $('#quick-sheet').close();
  const label = type === 'Observation' ? 'Note' : type === 'Defoliation/Training' ? 'Training' : type;
  if (log) showToast(`${label} saved for ${plant.name}`, () => { if (kind === 'move') plant.location = oldLoc; undoQuickLog(plant, log); }, QUICK_UNDO_MS);
}

async function onQuickPhotoChosen() {
  const file = $('#quick-photo').files[0];
  if (!file || !quickCtx) return;
  const plant = collPlants().find((p) => p.id === quickCtx.plantId);
  const media = window.BorikenMedia;
  if (!plant) return;
  if (!media) { showStorageError('Photo storage is not available, so the photo was not added.'); return; }
  try {
    const photoId = crypto.randomUUID();
    await media.putFile(photoId, file);
    const url = await media.objectUrl(photoId);
    if (url) mediaUrlCache.set(photoId, url);
    const log = pushQuickLog(plant, { type: 'Observation', photoId, notes: '' });
    if (log) showToast(`Photo added to ${plant.name}`, () => undoQuickLog(plant, log), QUICK_UNDO_MS);
  } catch (error) {
    showStorageError(`Photo was not saved (${error.message || error}). Nothing was added.`);
  }
}

/* ---------- app lock (Face ID / device passcode) ---------- */

let lockBusy = false;
let lockHiddenAt = 0;

function lockEnabled() {
  try { return localStorage.getItem(LOCK_KEY) === '1'; } catch (e) { return false; }
}
function setLockEnabled(on) {
  try { if (on) localStorage.setItem(LOCK_KEY, '1'); else localStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ }
}
function biometricPlugin() {
  if (!isNativeApp()) return null;
  try { return window.Capacitor.registerPlugin('BiometricAuth'); } catch (e) { return null; }
}

function syncLockToggle() {
  const t = $('#lock-toggle');
  if (!t) return;
  t.checked = lockEnabled();
  const note = $('#lock-setting-note');
  if (note && !isNativeApp()) note.textContent = 'Available in the iPhone app. Uses Face ID, falls back to your device passcode.';
  t.disabled = !isNativeApp();
}

async function runAuth(reason) {
  const bio = biometricPlugin();
  if (!bio) return { ok: false, unavailable: true };
  lockBusy = true;
  try {
    await bio.authenticate({ reason, cancelTitle: 'Cancel', allowDeviceCredential: true, iosFallbackTitle: 'Use Passcode' });
    return { ok: true };
  } catch (error) {
    const code = (error && error.code) || '';
    // Biometrics/passcode not available on this device: never lock the user out.
    const unavailable = ['biometryNotAvailable', 'biometryNotEnrolled', 'passcodeNotSet', 'biometryLockout_unsupported'].includes(code);
    return { ok: false, unavailable, message: (error && error.message) || 'Authentication failed.' };
  } finally {
    setTimeout(() => { lockBusy = false; }, 800);
  }
}

async function onLockToggle(event) {
  const box = event.target;
  if (!box.checked) { setLockEnabled(false); return; }
  // Prove it works before turning it on so the owner cannot get locked out.
  const bio = biometricPlugin();
  if (!bio) { box.checked = false; showToast('App lock works in the iPhone app.'); return; }
  const res = await runAuth('Confirm to turn on app lock');
  if (res.ok) { setLockEnabled(true); showToast('App lock is on'); }
  else if (res.unavailable) { box.checked = false; showToast('Set up Face ID or a device passcode in iOS Settings first.'); }
  else { box.checked = false; showToast('App lock not turned on'); }
}

function showLock() {
  const el = $('#lock-screen');
  if (!el) return;
  el.hidden = false;
  document.body.classList.add('is-locked');
  attemptUnlock();
}

async function attemptUnlock() {
  if (lockBusy) return;
  const msg = $('#lock-msg');
  if (msg) msg.textContent = '';
  const res = await runAuth('Unlock your private logbook');
  if (res.ok || res.unavailable) {
    $('#lock-screen').hidden = true;
    document.body.classList.remove('is-locked');
    lockHiddenAt = 0;
  } else if (msg) {
    msg.textContent = 'Could not unlock. Tap Unlock to try again.';
  }
}

async function lockIsPossible() {
  const bio = biometricPlugin();
  if (!bio) return false;
  try {
    const info = await bio.checkBiometry();
    return !!(info && (info.isAvailable || info.deviceIsSecure));
  } catch (e) { return false; }
}

// One-time first-run prompt. Fresh installs: lock defaults ON (only if the device can authenticate).
// Existing installs that never set it: nothing changes unless the user opts in here.
async function maybeFirstRunLockPrompt() {
  if (!isNativeApp()) return;
  let prompted = false;
  try { prompted = localStorage.getItem(LOCK_PROMPTED_KEY) === '1'; } catch (e) { prompted = true; }
  if (prompted || localStorage.getItem(LOCK_KEY) !== null) return;
  const fresh = isStateEmpty();
  if (!(await lockIsPossible())) return;
  if (fresh) setLockEnabled(true);
  const dlg = $('#lock-prompt');
  if (!dlg) return;
  $('#lock-prompt-text').textContent = fresh
    ? 'Your logbook can hold patient and plant records. App lock is ON: Face ID (or your device passcode) is needed to open it, and the screen is hidden in the app switcher. You can turn it off any time in More > Settings.'
    : 'Your logbook can hold patient and plant records. Turn on App lock to require Face ID (or your device passcode) to open it. The screen is already hidden in the app switcher. You can change this any time in More > Settings.';
  $('#lock-prompt-yes').textContent = fresh ? 'Keep it on' : 'Turn on';
  $('#lock-prompt-no').textContent = fresh ? 'Turn off' : 'Not now';
  const done = async (yes) => {
    try { localStorage.setItem(LOCK_PROMPTED_KEY, '1'); } catch (e) { /* ignore */ }
    if (yes && !fresh) {
      const res = await runAuth('Confirm to turn on app lock');
      if (res.ok) setLockEnabled(true);
    }
    if (!yes && fresh) setLockEnabled(false);
    dlg.close();
    syncLockToggle();
  };
  $('#lock-prompt-yes').onclick = () => done(true);
  $('#lock-prompt-no').onclick = () => done(false);
  dlg.showModal();
}

document.addEventListener('DOMContentLoaded', () => {
  bindMobileChrome();
  onMobileViewChange(activeView);
  if (lockEnabled() && isNativeApp()) showLock();
  else maybeFirstRunLockPrompt();
});

/* Build 14: no zoom at all. Pinch (gesture events), double-tap zoom and ctrl/meta-wheel zoom are blocked; viewport has
   maximum-scale=1, user-scalable=no; CSS touch-action disables double-tap zoom; native pinch is disabled in ViewController.swift. */
(function blockZoom() {
  const stop = (e) => { e.preventDefault(); };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, stop, { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => { const now = Date.now(); if (now - lastTouchEnd < 350 && !(e.target.closest && e.target.closest('input,textarea,select'))) e.preventDefault(); lastTouchEnd = now; }, { passive: false });
  document.addEventListener('wheel', (e) => { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
})();
