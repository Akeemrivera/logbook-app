/* Build 14: this web bundle has no @capacitor/core runtime, so on the iPhone window.Capacitor (injected by the native bridge) has
   Plugins/nativePromise/isPluginAvailable but NO registerPlugin. Without this shim every registerPlugin() call threw and the
   iCloud toggle was disabled. Native plugins are exported by the bridge as Capacitor.Plugins[name]. */
(function capacitorShim() {
  const cap = window.Capacitor;
  if (!cap || typeof cap.registerPlugin === 'function') return;
  cap.registerPlugin = function (name) {
    const found = cap.Plugins && cap.Plugins[name];
    if (found) return found;
    return new Proxy({}, { get: (_t, method) => (method === 'then' ? undefined : () => Promise.reject(new Error(`Native plugin ${name} is not installed in this app build (${String(method)}).`))) });
  };
})();
/*
  Borikèn Genetics Logbook
  ------------------------------------------------------------
  This is a local-first browser app. Plant records stay in localStorage.
  Photos and vlog thumbnails stay in IndexedDB (see media-store.js) so a
  picture cannot silently fail when localStorage fills up. Patient and medical
  records stay on the device.
*/

const STORAGE_KEY = 'boriken-genetics-logbook-v1';
const LEGACY_STORAGE_KEY = 'canopy-logbook-v1';
const DRAFT_STORAGE_KEY = 'boriken-genetics-logbook-drafts-v1';
const BACKUP_STORAGE_KEY = 'boriken-genetics-logbook-backups-v1';
const APP_VERSION = '1.0';
const APP_BUILD = '64'; // must equal CURRENT_PROJECT_VERSION in the Xcode project (scripts/build-www.js checks this)
const SCHEMA_VERSION = 2;
const MAX_SNAPSHOTS = 3; // keep only the latest few so history does not crowd live data in localStorage
const DAY_MS = 1000 * 60 * 60 * 24;
// Post-harvest workflow statuses. Declared here (before loadState runs) so
// normalizePlant can reference it during the initial state load.
const BRED_KEYS = { mother: ['vigor', 'structure', 'aroma', 'yield', 'resistance'], male: ['vigor', 'structure', 'nodes', 'stem', 'health', 'pollen'] };
const VLOG_STATUSES = ['Idea', 'Filmed', 'Edited', 'Posted'];
const PLANT_STATUSES = ['active', 'harvest', 'drying', 'curing', 'finished', 'archived'];
// Build 32: used by normalizeState, which runs at load (line ~70), so they must be defined up here.
const GRADE_KEYS = ['vigor', 'structure', 'aroma', 'resin', 'yield', 'pest', 'clone'];
const FEED_TYPES = ['Water', 'Top-dress', 'Tea', 'Amendment', 'Foliar', 'Custom'];
const TASK_KINDS = ['water', 'feed', 'topdress', 'cutting', 'pollen', 'transplant', 'custom'];

// Maine medical caregiver compliance add-on. Declared before loadState so
// normalizePlant/normalizePatient can reference them during the initial load.
// Build 14: no built-in caregiver identity; the label comes from what the user typed in Transaction Log > caregiver info.
function caregiverLabel() { const i = (state && state.medicalTransactionLog && state.medicalTransactionLog.caregiverInfo) || {}; return String(i.dbaOrLlc || i.registeredCaregiverName || '').trim(); }
const COMPLIANCE_STAGES = ['immature', 'mature', 'harvested', 'post-harvest', 'finished'];
const TAG_STATUSES = ['pending', 'printed', 'attached', 'replaced'];
const COMPLIANCE_EVENT_TYPES = [
  'patient assigned',
  'tag generated',
  'tag printed',
  'tag attached',
  'tag replaced',
  'moved area',
  'changed stage',
  'harvested',
  'sent to drying',
  'sent to curing',
  'marked finished',
];
const COMPLIANCE_DISCLAIMER = 'Internal recordkeeping support only — not legal advice. Verify all plant-tagging, patient, and count requirements against current Maine OCP and local rules, your own SOPs, and applicable counsel before relying on these records.';

// Medical Patient Transaction Log add-on. Transactions are retained 7 years and
// use soft-delete (archive) only — never hard-deleted. Declared before loadState
// so normalizeMedicalLog can run during the initial state load.
const TRANSACTION_RETENTION_YEARS = 7;
const MEDICAL_LOG_DISCLAIMER = 'Internal recordkeeping support only — not legal advice. Records are retained for 7 years. Verify current Maine OCP and local requirements, your own SOPs, and applicable counsel before relying on these records.';

let memoryBackup = '';
let pendingRepairJson = ''; // raw stored JSON kept when duplicate ids were found (for the 'pre-repair' snapshot)
let lastRepairCount = 0;
let hasStoredData = false;
let state = loadState();
let selectedPlantId = state.plants[0]?.id || '';
let activeView = 'home';
let activePlantTab = 'active';
let postHarvestTab = 'harvest';
let complianceTab = 'patients';
let patientEditId = '';
let inspectionFilter = 'all';
let complianceLogFilters = { plant: 'all', patient: 'all', eventType: 'all', stage: 'all', date: '' };
let lastContentDraft = '';
let pendingConfirmAction = null;
let autosaveStatusTimer = null;
let mediaUrlCache = new Map();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

document.addEventListener('DOMContentLoaded', async () => {
  // Ask the OS to keep this app's storage (best effort; ignored where unsupported).
  try { navigator.storage?.persist?.().catch(() => {}); } catch (e) { /* ignore */ }
  if (pendingRepairJson) {
    // Duplicate ids were found in the saved data: snapshot the ORIGINAL first, then save the repaired copy.
    try { createSnapshot('pre-repair', JSON.parse(pendingRepairJson)); } catch (e) { console.warn('pre-repair snapshot failed', e); }
    pendingRepairJson = '';
    saveState();
    setTimeout(() => { if (typeof showToast === 'function') showToast(`Repaired ${lastRepairCount} duplicate record id${lastRepairCount === 1 ? '' : 's'}. A backup was saved first.`, null, 9000); }, 600);
  }
  await preparePhotoStorage();
  setTodayDefaults();
  bindEvents();
  renderAll();
  initializeTheme();
  openInitialView();
  setupInstallableApp();
  setupAutosaveDrafts();
  setupPersistenceSafeguards();
  updateStorageStatus();
  restoreBackupFileHandle();
  // Snapshot whatever was loaded so existing data is protected immediately.
  // createSnapshot dedupes against the most recent snapshot, so reopening
  // unchanged data does not pile up duplicate history entries.
  createSnapshot('startup');
});

async function preparePhotoStorage() {
  const media = window.BorikenMedia;
  if (!media) {
    showStorageError('Photo storage did not load. Journal text still saves, but photos cannot be stored in this session.');
    return;
  }
  try {
    const live = await media.migrateInlinePhotos(state);
    const snapshots = loadSnapshots();
    let snapMoved = 0;
    let snapFailed = 0;
    const snapErrors = [];
    for (const snap of snapshots) {
      if (!snap || !snap.state) continue;
      const result = await media.migrateInlinePhotos(snap.state);
      snapMoved += result.moved;
      snapFailed += result.failed;
      if (result.errors && result.errors[0]) snapErrors.push(result.errors[0]);
    }
    if (live.moved) {
      const liveOk = writeStateToStorage();
      if (!liveOk) {
        showStorageError('Photos were copied into on-device storage, but the logbook record could not be updated. Export a full backup before you close the app.');
      }
    }
    if (snapMoved) persistSnapshots(snapshots);
    if (live.failed || snapFailed) {
      const detail = (live.errors && live.errors[0]) || snapErrors[0] || 'Unknown storage error.';
      showStorageError(`Some photos could not be moved into on-device storage (${live.failed + snapFailed}). They were kept in the old save. ${detail}`);
    }
    await hydrateMediaCache();
  } catch (error) {
    showStorageError(`Photo storage failed: ${error.message || error}. Existing notes are still here. Export a backup if you can.`);
  }
}

function setupPersistenceSafeguards() {
  // Belt-and-suspenders: committed data is already saved on every change, but
  // also flush on tab hide/close so nothing is lost if a mutation path is missed.
  const flush = () => {
    if (!isStateEmpty()) {
      saveState();
      // Best-effort: also push the latest state straight to the connected
      // backup file now, since the debounced writer may not fire before unload.
      if (backupFileHandle) writeBackupToFile();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);
}

function offsetDate(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toInputDate(date);
}

function logSeed(daysAgo, type, notes, height, feed) {
  return {
    id: crypto.randomUUID(),
    date: offsetDate(daysAgo),
    type,
    notes,
    height: height || '',
    feed: feed || '',
    photo: '',
  };
}

function setTodayDefaults() {
  const today = toInputDate(new Date());
  $('#log-date').value = today;
  $('#vlog-date').value = today;
  $('#plant-start').value = today;
  $('#plant-veg').value = today;
}

function bindEvents() {
  $$('[data-view-button]').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.viewButton));
  });
  setupPlantTabs();
  setupPostHarvestTabs();
  setupHarvestArchiveControls();
  setupComplianceTabs();
  setupComplianceControls();
  setupMedicalLogControls();
  $('#open-plant-modal').addEventListener('click', () => openPlantModal());
  $('#open-plant-modal-2').addEventListener('click', () => openPlantModal());
  $('#close-plant-modal').addEventListener('click', closePlantModal);
  $('#cancel-plant-form').addEventListener('click', closePlantModal);
  $('#close-confirm-modal').addEventListener('click', closeConfirmModal);
  $('#confirm-cancel').addEventListener('click', closeConfirmModal);
  $('#confirm-accept').addEventListener('click', runConfirmedAction);
  $('#confirm-type')?.addEventListener('input', syncConfirmTyped);
  $('#plant-form').addEventListener('submit', savePlantFromForm);
  if ($('#plant-source')) $('#plant-source').addEventListener('change', syncPlantSourceFields);
  if ($('#plant-mother')) { $('#plant-mother').addEventListener('change', syncPlantSourceFields); $('#plant-mother').addEventListener('input', syncPlantSourceFields); $('#plant-mother').addEventListener('blur', syncPlantSourceFields); }
  $('#log-form').addEventListener('submit', saveLogFromForm);
  bindVlog();
  $('#export-vlog').addEventListener('click', exportVlogCSV);
  $('#journal-filter').addEventListener('change', renderJournal);
  $('#export-csv').addEventListener('click', exportCSV);
  $('#export-json').addEventListener('click', exportJSON);
  $('#print-summary').addEventListener('click', printGrowSummary);
  $('#import-json').addEventListener('change', importJSON);
  $('#clear-all-data').addEventListener('click', clearAllData);
  $('#backup-export-json')?.addEventListener('click', exportJSON);
  $('#download-latest-backup')?.addEventListener('click', downloadLatestSnapshot);
  $('#connect-backup-file')?.addEventListener('click', connectBackupFile);
  $('#disconnect-backup-file')?.addEventListener('click', disconnectBackupFile);
  $('#clear-backup-history')?.addEventListener('click', clearBackupHistory);
  $('#onboarding-add-plant')?.addEventListener('click', () => openPlantModal());
  $('#breeding-form').addEventListener('submit', saveBreedingProject);
  $('#clear-breeding-form')?.addEventListener('click', clearBreedingForm);
  $('#export-breeding').addEventListener('click', exportBreedingCSV);
}

function emptySettings() {
  // Build 13 (additive): topDressDefaultWeeks = global Top dress reminder interval (0 = off); mfHelperDismissed = hide the
  // 'Add your plants' helper in Breeding > Mothers & Fathers.
  return { captionLocation: '', topDressDefaultWeeks: 4, mfHelperDismissed: false, textSize: 'default' };
}

function normalizeSettings(value) {
  const base = emptySettings();
  if (!value || typeof value !== 'object') return base;
  base.captionLocation = typeof value.captionLocation === 'string' ? value.captionLocation : '';
  const tdw = Number(value.topDressDefaultWeeks);
  base.topDressDefaultWeeks = value.topDressDefaultWeeks !== undefined && value.topDressDefaultWeeks !== '' && Number.isFinite(tdw) && tdw >= 0 && tdw <= 52 ? Math.round(tdw) : 4;
  base.mfHelperDismissed = !!value.mfHelperDismissed;
  // Build 40: Text size (small / default / large), Mac + iPhone
  base.textSize = ['small', 'default', 'large'].includes(value.textSize) ? value.textSize : 'default';
  // Build 48: plant-count limits, kept only once the caregiver has saved them (defaults live in build48.js).
  if (value.complianceLimits && typeof value.complianceLimits === 'object') {
    const L = value.complianceLimits; const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n) : d; };
    base.complianceLimits = { mode: L.mode === 'canopy' ? 'canopy' : 'plants', mature: num(L.mature, 30), immature: num(L.immature, 60), canopyMature: num(L.canopyMature, 500), canopyImmature: num(L.canopyImmature, 1000) };
  }
  // Build 49: patient transaction rules (Maine OCP research Oct 30 2026). Kept only once the caregiver saves them; defaults live in build49-sales.js.
  if (value.txnRules && typeof value.txnRules === 'object') {
    const R = value.txnRules; const n = (v, d, lo, hi) => { const x = Number(v); return Number.isFinite(x) && x >= lo && x <= hi ? x : d; }; const s = (v) => (typeof v === 'string' ? v.slice(0, 200) : '');
    base.txnRules = { perSaleOz: n(R.perSaleOz, 2.5, 0.1, 100), visitCapOz: n(R.visitCapOz, 2.5, 0.1, 100), visitWindowDays: Math.round(n(R.visitWindowDays, 15, 1, 365)), expiryWarnDays: Math.round(n(R.expiryWarnDays, 30, 0, 365)),
      keepIdPhotos: R.keepIdPhotos !== false, caregiverName: s(R.caregiverName), caregiverRegistryId: s(R.caregiverRegistryId), departurePlace: s(R.departurePlace), source: s(R.source) };
  }
  // Build 51: trip tickets (OCP Form 004). CRG number, default departure address, saved transfer caregivers. Kept only once set.
  if (value.tripTicket && typeof value.tripTicket === 'object') {
    const T = value.tripTicket; const s = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
    const d = T.dep && typeof T.dep === 'object' ? T.dep : {};
    base.tripTicket = { crg: s(T.crg, 60), dep: { street: s(d.street), city: s(d.city, 80), zip: s(d.zip, 10) }, since: s(T.since, 40),
      caregivers: Array.isArray(T.caregivers) ? T.caregivers.filter((c) => c && typeof c === 'object').map((c) => ({ id: s(c.id, 80) || String(Math.random()).slice(2), name: s(c.name), crg: s(c.crg, 60) })) : [] };
  }
  return base;
}

function emptyState() {
  return { plants: [], reports: [], hiddenPresets: [], breedingProjects: [], breedingPlants: [], breedingLog: [], vlogEntries: [], patients: [], savedPatients: [], complianceLogs: [], medicalTransactionLog: emptyMedicalTransactionLog(), harvests: [], motherFatherPlants: [], groups: [], mixes: [], batches: [], bredEvals: [], cloneRuns: [], plans: [], tasks: [], tripTickets: [], settings: emptySettings() };
}


function emptyMedicalTransactionLog() {
  return {
    caregiverInfo: { registeredCaregiverName: '', dbaOrLlc: '', dispensingAddress: '', city: '' },
    rows: [],
  };
}

function loadState() {
  try {
    const storage = getBrowserStorage();
    const stored = storage?.getItem(STORAGE_KEY) || storage?.getItem(LEGACY_STORAGE_KEY) || memoryBackup;
    if (stored) {
      hasStoredData = true;
      const parsed = JSON.parse(stored);
      const dupes = hasDuplicateIds(parsed);
      const normalized = normalizeState(parsed);
      pendingRepairJson = dupes ? stored : '';
      return normalized;
    }
  } catch (error) {
    console.warn('Storage unavailable; using temporary state.', error);
  }
  // No saved data: start blank. Sample/template data only loads on explicit
  // user action so it can never overwrite real entries after a close/reopen.
  hasStoredData = false;
  return emptyState();
}

function plantCountText(plant) {
  const n = Math.round(Number(plant && plant.count));
  const c = Number.isFinite(n) && n > 0 ? n : 1;
  const sp = plant && plant.seedsPopped !== null && plant.seedsPopped !== undefined && plant.seedsPopped !== '' ? Math.round(Number(plant.seedsPopped)) : null;
  if (isClonePlant(plant)) {
    const ct = plant.clonesTaken !== null && plant.clonesTaken !== undefined && plant.clonesTaken !== '' ? clonesTakenOf(plant) : null;
    return ct !== null ? `${cloneSourceText(plant)} · ${ct} taken · ${c} running` : `${cloneSourceText(plant)} · ${c} plant${c === 1 ? '' : 's'}`;
  }
  if (sp !== null && Number.isFinite(sp) && sp >= 0) return `${sp} popped · ${c} running`;
  return `${c} plant${c === 1 ? '' : 's'}`;
}
// Build 18: "Plants running" is the plant count; "Seeds popped" falls back to it until set (default 1).
function plantsRunning(plant) { const n = Math.round(Number(plant && plant.count)); return Number.isFinite(n) && n > 0 ? n : 1; }
function seedsPoppedOf(plant) { const n = Math.round(Number(plant && plant.seedsPopped)); return plant && plant.seedsPopped !== null && plant.seedsPopped !== undefined && plant.seedsPopped !== '' && Number.isFinite(n) && n >= 0 ? n : plantsRunning(plant); }
function seedCountsText(plant) { return isClonePlant(plant) ? `${clonesTakenOf(plant)} clones taken · ${plantsRunning(plant)} running` : `${seedsPoppedOf(plant)} popped · ${plantsRunning(plant)} running`; }
// Build 19.1: clones. source 'seed' (default, every older plant) or 'clone'; clonesTaken null = same as running; mother = motherPlantId + motherName snapshot.
function isClonePlant(plant) { return !!plant && plant.source === 'clone'; }
function clonesTakenOf(plant) { const n = Math.round(Number(plant && plant.clonesTaken)); return plant && plant.clonesTaken !== null && plant.clonesTaken !== undefined && plant.clonesTaken !== '' && Number.isFinite(n) && n >= 0 ? n : plantsRunning(plant); }
function startCountOf(plant) { return isClonePlant(plant) ? clonesTakenOf(plant) : seedsPoppedOf(plant); }
function startCountLabel(plant) { return isClonePlant(plant) ? 'Clones taken' : 'Seeds popped'; }
function motherNameOf(plant) { if (!isClonePlant(plant)) return ''; const m = plant.motherPlantId && (state.plants || []).find((x) => x.id === plant.motherPlantId); return (m && m.name) || plant.motherName || ''; }
function cloneSourceText(plant) { const m = motherNameOf(plant); return m ? `Clone of ${m}` : 'Clone'; }

function normalizePlant(p) {
  if (!p || typeof p !== 'object') return p;
  { const n = Math.round(Number(p.count)); p.count = Number.isFinite(n) && n > 0 ? n : 1; }
  const str = (value) => (typeof value === 'string' ? value : (value == null ? '' : String(value)));
  // Backfill the workflow status. Older records only had a `completed` boolean
  // (which meant "harvested/completed"); map those to the Finished section so
  // no data is lost and they stay out of the Active list.
  let status = p.status;
  if (!PLANT_STATUSES.includes(status)) {
    status = p.completed ? 'finished' : 'active';
  }
  p.status = status;
  p.isCompleted = status === 'finished';
  // Legacy mirror still read by the dashboard overview styling.
  p.completed = status !== 'active';
  p.harvestDate = str(p.harvestDate);
  p.archivedAt = str(p.archivedAt);
  // --- Lifecycle date model -------------------------------------------------
  // `flowerFlipDate` historically held BOTH the planned flip and the actual
  // flip. A planned future date therefore started the flower clock early and
  // truncated the veg clock (the "Day 20 of veg" bug). Split it in two:
  //   plannedFlipDate  → display/projection only, never starts a counter
  //   flowerStartDate  → the real flip; the only thing that starts flower days
  p.flowerStartDate = str(p.flowerStartDate);
  p.plannedFlipDate = str(p.plannedFlipDate);
  const legacyFlip = str(p.flowerFlipDate);
  if (legacyFlip && !p.flowerStartDate && !p.plannedFlipDate) {
    const todayKey = toInputDate(getToday());
    if (legacyFlip <= todayKey) p.flowerStartDate = legacyFlip;
    else p.plannedFlipDate = legacyFlip;
  }
  // Legacy mirror: old readers/exports keep working, but it now only ever
  // holds the ACTUAL flip so nothing can count flower from a planned date.
  p.flowerFlipDate = p.flowerStartDate;
  p.completedAt = str(p.completedAt);
  p.dryStartDate = str(p.dryStartDate);
  p.dryEndDate = str(p.dryEndDate);
  p.cureStartDate = str(p.cureStartDate);
  p.cureEndDate = str(p.cureEndDate);
  p.finishedDate = str(p.finishedDate);
  p.wetWeight = str(p.wetWeight);
  p.dryWeight = str(p.dryWeight);
  p.dryingTemp = str(p.dryingTemp);
  p.dryingRH = str(p.dryingRH);
  p.dryingMethod = str(p.dryingMethod);
  p.curingContainer = str(p.curingContainer);
  p.curingTargetRH = str(p.curingTargetRH);
  p.burpSchedule = str(p.burpSchedule);
  p.postHarvestNotes = str(p.postHarvestNotes);
  // Seed a finished date for legacy completed records that never had one.
  if (status === 'finished' && !p.finishedDate) p.finishedDate = p.completedAt || p.harvestDate || '';
  // Compliance / plant-tagging add-on fields. Backfilled without touching any
  // existing data so older records keep loading safely.
  p.internalPlantCode = str(p.internalPlantCode);
  p.patientId = str(p.patientId);
  p.patientCertificationId = str(p.patientCertificationId);
  p.cultivar = str(p.cultivar);
  p.growthStage = str(p.growthStage);
  let complianceStage = p.complianceStage;
  if (!COMPLIANCE_STAGES.includes(complianceStage)) {
    // Derive a sensible default from the workflow status so existing records
    // land in a reasonable compliance bucket.
    if (status === 'finished') complianceStage = 'finished';
    else if (status === 'harvest') complianceStage = 'harvested';
    else if (status === 'drying' || status === 'curing') complianceStage = 'post-harvest';
    else complianceStage = 'immature';
  }
  p.complianceStage = complianceStage;
  p.areaOrRoom = str(p.areaOrRoom);
  p.tagStatus = TAG_STATUSES.includes(p.tagStatus) ? p.tagStatus : 'pending';
  p.tagAttached = !!p.tagAttached;
  p.tagPrintedAt = str(p.tagPrintedAt);
  p.tagAttachedAt = str(p.tagAttachedAt);
  p.tagReplacedAt = str(p.tagReplacedAt);
  p.tagTextSnapshot = str(p.tagTextSnapshot);
  p.complianceNotes = str(p.complianceNotes);
  p.movedAt = str(p.movedAt);
  p.harvestedAt = str(p.harvestedAt);
  // Build 18 (additive): seeds popped (null = not set; shown as the plant count), tent/bed group and per-plant light override.
  { const sp = Math.round(Number(p.seedsPopped)); p.seedsPopped = p.seedsPopped !== undefined && p.seedsPopped !== null && p.seedsPopped !== '' && Number.isFinite(sp) && sp >= 0 ? sp : null; }
  p.groupId = str(p.groupId);
  p.lightOverride = str(p.lightOverride);
  // Build 19.1 (additive): clone source. Older plants have no source -> 'seed'.
  p.source = p.source === 'clone' ? 'clone' : 'seed';
  { const ct = Math.round(Number(p.clonesTaken)); p.clonesTaken = p.clonesTaken !== undefined && p.clonesTaken !== null && p.clonesTaken !== '' && Number.isFinite(ct) && ct >= 0 ? ct : null; }
  p.motherPlantId = str(p.motherPlantId);
  p.motherName = str(p.motherName);
  p.motherFatherId = str(p.motherFatherId);
  p.cuttingEntryId = str(p.cuttingEntryId);
  // Build 32 (additive): grade card, and per-plant grades inside a seed run (members).
  if (p.grade !== undefined) p.grade = normalizeGrade(p.grade);
  if (p.members !== undefined) p.members = (Array.isArray(p.members) ? p.members : []).filter((m) => m && typeof m === 'object').map((m) => ({ ...m, num: b18Int(m.num, 1, 9999, 1), pheno: str(m.pheno), grade: normalizeGrade(m.grade), promotedTo: str(m.promotedTo) }));
  return p;
}

function normalizeVlogEntry(entry) {
  if (!VLOG_STATUSES.includes(entry.status)) entry.status = 'Idea';
  return entry;
}

/* Build 11: Harvest log. Weights are stored in GRAMS. Records keep their own strain name so they
   survive the linked plant being archived or deleted. Pound milestones are derived, never stored. */
function normalizeHarvest(h) {
  if (!h || typeof h !== 'object') return null;
  const str = (v) => (typeof v === 'string' ? v : (v == null ? '' : String(v)));
  const num = (v) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
  const createdAt = str(h.createdAt) || new Date().toISOString();
  let date = str(h.date).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = /^\d{4}-\d{2}-\d{2}/.test(createdAt) ? createdAt.slice(0, 10) : toInputDate(new Date());
  return {
    id: str(h.id) || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    date,
    strain: str(h.strain).trim(),
    plantId: str(h.plantId),
    wetGrams: num(h.wetGrams),
    dryGrams: num(h.dryGrams) ?? 0,
    trimGrams: num(h.trimGrams),
    notes: str(h.notes),
    createdAt,
  };
}

function normalizePatient(pt) {
  if (!pt || typeof pt !== 'object') return null;
  const str = (value) => (typeof value === 'string' ? value : (value == null ? '' : String(value)));
  return {
    id: str(pt.id) || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    alias: str(pt.alias),
    certificationId: str(pt.certificationId),
    issueDate: str(pt.issueDate),
    expirationDate: str(pt.expirationDate),
    designationStart: str(pt.designationStart),
    designationEnd: str(pt.designationEnd),
    active: pt.active === undefined ? true : !!pt.active,
    notes: str(pt.notes),
  };
}

function normalizeComplianceLog(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const str = (value) => (typeof value === 'string' ? value : (value == null ? '' : String(value)));
  return {
    id: str(entry.id) || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    plantId: str(entry.plantId),
    patientId: str(entry.patientId),
    timestamp: str(entry.timestamp) || new Date().toISOString(),
    eventType: str(entry.eventType),
    stage: str(entry.stage),
    oldValue: str(entry.oldValue),
    newValue: str(entry.newValue),
    notes: str(entry.notes),
  };
}

// A transaction-log row mirrors one line of the Maine Form 009 grid. Legacy
// object-based transactions (from earlier versions) are mapped onto the same
// shape here so no historical data is lost; the previously masked license
// reference migrates into the visible License/Photo ID cell.
// Build 8 (additive): saved patients for the transaction log (`patients` is the older compliance list).
function normalizeSavedPatient(p) {
  if (!p || typeof p !== 'object') return null;
  const str = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()));
  const firstName = str(p.firstName);
  const lastName = str(p.lastName);
  const cardNumber = str(p.cardNumber);
  if (!firstName && !lastName && !cardNumber) return null;
  return {
    id: str(p.id) || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    firstName, lastName, cardNumber,
    createdAt: str(p.createdAt) || new Date().toISOString(),
    archived: p.archived === true || p.archived === 'true',
    // Build 49 (additive): visiting flag, DOB, certification expiry, designation, last verification. Only present once set.
    ...(p.b49 && typeof p.b49 === 'object' && !Array.isArray(p.b49) ? { b49: p.b49 } : {}),
    // Build 50 (additive): profile contact, preferences, documents, private notes, photo. Only present once set.
    ...(p.b50 && typeof p.b50 === 'object' && !Array.isArray(p.b50) ? { b50: p.b50 } : {}),
  };
}

function normalizeTransactionRow(r) {
  if (!r || typeof r !== 'object') return null;
  const str = (value) => (typeof value === 'string' ? value : (value == null ? '' : String(value)));
  const createdAt = str(r.createdAt) || new Date().toISOString();
  const date = str(r.date);
  return {
    row_id: str(r.row_id) || str(r.transaction_id) || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    licensePhotoId: str(r.licensePhotoId) || str(r.licensePhotoIdRef),
    patientCertificationRandomId: str(r.patientCertificationRandomId),
    medicineTypeForm: str(r.medicineTypeForm),
    amount: str(r.amount),
    time: str(r.time),
    date,
    createdAt,
    updatedAt: str(r.updatedAt) || createdAt,
    // Build 49 (additive): receipt number, pickup/delivery + trip ticket, batch/plant link, verification and any override. Only present on new sales.
    ...(r.b49 && typeof r.b49 === 'object' && !Array.isArray(r.b49) ? { b49: r.b49 } : {}),
    archivedAt: str(r.archivedAt),
    retentionUntil: str(r.retentionUntil) || computeRetentionUntil(date || createdAt),
  };
}

function normalizeMedicalTransactionLog(value) {
  const base = emptyMedicalTransactionLog();
  if (!value || typeof value !== 'object') return base;
  const info = value.caregiverInfo && typeof value.caregiverInfo === 'object' ? value.caregiverInfo : {};
  const str = (v) => (typeof v === 'string' ? v : (v == null ? '' : String(v)));
  base.caregiverInfo = {
    registeredCaregiverName: str(info.registeredCaregiverName),
    dbaOrLlc: str(info.dbaOrLlc),
    dispensingAddress: str(info.dispensingAddress),
    city: str(info.city),
  };
  const source = Array.isArray(value.rows) ? value.rows
    : (Array.isArray(value.transactions) ? value.transactions : []);
  base.rows = source.map(normalizeTransactionRow).filter(Boolean);
  return base;
}

/* Build 13: Mothers & Fathers (Breeding tab). Every entry is a normal, editable, removable record. */
function normalizeMotherFather(m) {
  if (!m || typeof m !== 'object') return null;
  const str = (v) => (typeof v === 'string' ? v : (v == null ? '' : String(v)));
  const entries = (arr) => {
    const seen = new Set();
    return (Array.isArray(arr) ? arr : []).filter((e) => e && typeof e === 'object').map((e) => {
      let id = str(e.id);
      if (!id || seen.has(id)) id = freshId();
      seen.add(id);
      const n = Math.round(Number(e.count));
      return { ...e, id, date: str(e.date), count: Number.isFinite(n) && n >= 0 ? n : 0, notes: str(e.notes) }; // Build 49: keep newer fields (pollen storage, amount left, use-by)
    });
  };
  return {
    ...m, // Build 32: keep newer fields (grade, feedings, grow medium, promotedFrom) through normalize/restore
    grade: normalizeGrade(m.grade),
    growMedium: m.growMedium === 'bottled' ? 'bottled' : 'living',
    feedings: (Array.isArray(m.feedings) ? m.feedings : []).map(normalizeFeeding).filter(Boolean),
    promotedFrom: m.promotedFrom && typeof m.promotedFrom === 'object' ? { coll: str(m.promotedFrom.coll), id: str(m.promotedFrom.id), mem: str(m.promotedFrom.mem), label: str(m.promotedFrom.label) } : null,
    id: str(m.id) || freshId(),
    name: str(m.name).trim(),
    role: m.role === 'father' ? 'father' : 'mother',
    acquiredDate: str(m.acquiredDate),
    source: str(m.source),
    healthNotes: str(m.healthNotes),
    status: m.status === 'Retired' ? 'Retired' : 'Active',
    archived: !!m.archived,
    cuttings: entries(m.cuttings),
    pollen: entries(m.pollen),
    createdAt: str(m.createdAt) || new Date().toISOString(),
  };
}

/* ---------- Build 18 (additive) record normalizers. They only fill missing fields; nothing is dropped except non-object junk. ---------- */
function b18List(arr, fn) { return Array.isArray(arr) ? arr.map(fn).filter(Boolean) : []; }
function b18Str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
function b18Int(v, min, max, dflt) { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min ? Math.min(max, n) : dflt; }
function b18Num(v) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; }
function normalizeGroup(g) {
  if (!g || typeof g !== 'object') return null;
  return { ...g, id: b18Str(g.id) || freshId(), name: b18Str(g.name).trim() || 'Group', emoji: b18Str(g.emoji) || '⛺', light: b18Str(g.light), lightOn: /^\d{2}:\d{2}$/.test(g.lightOn) ? g.lightOn : '06:00' };
}
function normalizeMix(m) {
  if (!m || typeof m !== 'object') return null;
  return { ...m, id: b18Str(m.id) || freshId(), kind: ['topdress', 'amend', 'tea', 'feed'].includes(m.kind) ? m.kind : 'topdress', name: b18Str(m.name).trim() || 'Mix', recipe: b18Str(m.recipe), amount: b18Str(m.amount), note: b18Str(m.note) };
}
function normalizeBatch(b) {
  if (!b || typeof b !== 'object') return null;
  return {
    ...b, id: b18Str(b.id) || freshId(), name: b18Str(b.name).trim() || 'Batch', plantId: b18Str(b.plantId), startDate: b18Str(b.startDate),
    dryDays: b18Int(b.dryDays, 1, 60, 10), cureDays: b18Int(b.cureDays, 1, 365, 28), remind: !!b.remind, remindTime: /^\d{2}:\d{2}$/.test(b.remindTime) ? b.remindTime : '18:00',
    lastOpened: b18Str(b.lastOpened), done: !!b.done,
    weights: (Array.isArray(b.weights) ? b.weights : []).filter((w) => w && typeof w === 'object').map((w) => ({ id: b18Str(w.id) || freshId(), date: b18Str(w.date), wet: b18Num(w.wet), dry: b18Num(w.dry), note: b18Str(w.note) })),
  };
}
function normalizeBredEval(e) {
  if (!e || typeof e !== 'object') return null;
  const kind = e.kind === 'male' ? 'male' : 'mother';
  const sc = e.scores && typeof e.scores === 'object' ? e.scores : {};
  const scores = {}; BRED_KEYS[kind].forEach((k) => { scores[k] = b18Int(sc[k], 0, 10, 5); });
  const pl = e.pollen && typeof e.pollen === 'object' ? e.pollen : {};
  return { ...e, id: b18Str(e.id) || freshId(), kind, cand: b18Str(e.cand), label: b18Str(e.label), date: b18Str(e.date), scores, notes: b18Str(e.notes), decision: e.decision === 'keep' || e.decision === 'cull' ? e.decision : '',
    pollen: { collected: !!pl.collected, jars: b18Int(pl.jars, 0, 999, 0), date: b18Str(pl.date), code: b18Str(pl.code), storage: b18Str(pl.storage) } };
}
function normalizeCloneRun(r) {
  if (!r || typeof r !== 'object') return null;
  // Build 32 (additive): runs linked to a source plant (srcColl/srcId/srcMem) with cuts, rooted, method, hormone, ease, first-roots date, photos and per-clone outcomes.
  const b32 = r.srcId ? { srcColl: ['plants', 'breedingPlants', 'mf'].includes(r.srcColl) ? r.srcColl : 'plants', srcId: b18Str(r.srcId), srcMem: b18Str(r.srcMem), num: b18Int(r.num, 1, 99999, 1),
    cuts: b18Int(r.cuts, 0, 9999, 0), rooted: b18Int(r.rooted, 0, 9999, 0), method: b18Str(r.method), hormone: b18Str(r.hormone), ease: ['easy', 'medium', 'hard'].includes(r.ease) ? r.ease : '',
    firstRoots: /^\d{4}-\d{2}-\d{2}$/.test(r.firstRoots) ? r.firstRoots : '', done: !!r.done, photoIds: (Array.isArray(r.photoIds) ? r.photoIds : []).map(b18Str).filter(Boolean),
    outcomes: (Array.isArray(r.outcomes) ? r.outcomes : []).filter((o) => o && typeof o === 'object').map((o) => ({ from: b18Int(o.from, 1, 9999, 1), to: b18Int(o.to, 1, 9999, 1), status: ['Rooted', 'Rooting', 'Failed'].includes(o.status) ? o.status : 'Rooted', outcome: b18Str(o.outcome) })) } : {};
  return { ...r, ...b32, id: b18Str(r.id) || freshId(), mother: b18Str(r.mother), label: b18Str(r.label), cutDate: b18Str(r.cutDate), notes: b18Str(r.notes),
    batches: (Array.isArray(r.batches) ? r.batches : []).filter((b) => b && typeof b === 'object').map((b) => ({ id: b18Str(b.id) || freshId(), name: b18Str(b.name), cuts: b18Int(b.cuts, 0, 9999, 0), date: b18Str(b.date), rooted: b18Int(b.rooted, 0, 9999, 0), failed: b18Int(b.failed, 0, 9999, 0), rootedDate: b18Str(b.rootedDate), status: ['Rooting', 'Rooted', 'Check', 'Done'].includes(b.status) ? b.status : 'Rooting', note: b18Str(b.note) })) };
}
/* Build 19 (additive): a planned feeding or top dress. Unknown fields are kept (spread) so a newer build's data survives. */
function normalizePlan(p) {
  if (!p || typeof p !== 'object') return null;
  const ids = (Array.isArray(p.plantIds) ? p.plantIds : []).map(b18Str).filter(Boolean);
  return { ...p, id: b18Str(p.id) || freshId(), kind: p.kind === 'feed' ? 'feed' : 'topdress', plantIds: [...new Set(ids)], groupId: b18Str(p.groupId),
    date: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : '', time: /^\d{2}:\d{2}$/.test(p.time) ? p.time : '09:00', mixId: b18Str(p.mixId), notes: b18Str(p.notes),
    repeatWeeks: b18Int(p.repeatWeeks, 0, 12, 0), remind: p.remind === undefined ? true : !!p.remind, createdAt: b18Str(p.createdAt) };
}

/* Build 32 (additive): grade, feeding and task normalizers. Unknown fields are kept. */
function normalizeGrade(g) {
  if (!g || typeof g !== 'object') return null;
  const sc = g.scores && typeof g.scores === 'object' ? g.scores : {};
  const scores = {}; GRADE_KEYS.forEach((k) => { const n = Math.round(Number(sc[k])); scores[k] = Number.isFinite(n) && n >= 1 ? Math.min(5, n) : 0; });
  return { ...g, verdict: ['keep', 'maybe', 'cull'].includes(g.verdict) ? g.verdict : '', scores, cloneOverride: !!g.cloneOverride, notes: b18Str(g.notes), date: b18Str(g.date),
    history: (Array.isArray(g.history) ? g.history : []).filter((h) => h && typeof h === 'object').slice(-50) };
}
function normalizeFeeding(f) {
  if (!f || typeof f !== 'object') return null;
  return { ...f, id: b18Str(f.id) || freshId(), date: b18Str(f.date), type: FEED_TYPES.includes(f.type) ? f.type : 'Custom', custom: b18Str(f.custom), medium: f.medium === 'bottled' ? 'bottled' : 'living',
    inputs: (Array.isArray(f.inputs) ? f.inputs : []).filter((i) => i && typeof i === 'object' && b18Str(i.name).trim()).map((i) => ({ name: b18Str(i.name).trim(), amount: b18Str(i.amount), unit: b18Str(i.unit) })),
    notes: b18Str(f.notes), ph: b18Num(f.ph), ec: b18Num(f.ec) };
}
function normalizeTask(t) {
  if (!t || typeof t !== 'object') return null;
  return { ...t, id: b18Str(t.id) || freshId(), kind: TASK_KINDS.includes(t.kind) ? t.kind : 'custom', title: b18Str(t.title), notes: b18Str(t.notes),
    date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : '', time: /^\d{2}:\d{2}$/.test(t.time) ? t.time : '', coll: b18Str(t.coll), plantId: b18Str(t.plantId),
    done: !!t.done, doneAt: b18Str(t.doneAt), createdAt: b18Str(t.createdAt) };
}

function normalizeState(value) {
  const out = {
    plants: Array.isArray(value?.plants) ? value.plants.map(normalizePlant) : [],
    reports: Array.isArray(value?.reports) ? value.reports : [],
    hiddenPresets: Array.isArray(value?.hiddenPresets) ? value.hiddenPresets : [],
    breedingProjects: Array.isArray(value?.breedingProjects) ? value.breedingProjects : [],
    // Build 4 (additive): Breeding tab keeps its own plants and log, separate from production `plants`.
    breedingPlants: Array.isArray(value?.breedingPlants) ? value.breedingPlants.map(normalizePlant).filter((p) => p && typeof p === 'object') : [],
    breedingLog: Array.isArray(value?.breedingLog) ? value.breedingLog.filter((e) => e && typeof e === 'object') : [],
    // Build 11 (additive): vlog entries gain a 'status' (Idea/Filmed/Edited/Posted); old entries default to Idea.
    vlogEntries: Array.isArray(value?.vlogEntries) ? value.vlogEntries.filter((e) => e && typeof e === 'object').map(normalizeVlogEntry) : [],
    patients: Array.isArray(value?.patients) ? value.patients.map(normalizePatient).filter(Boolean) : [],
    savedPatients: Array.isArray(value?.savedPatients) ? value.savedPatients.map(normalizeSavedPatient).filter(Boolean) : [],
    complianceLogs: Array.isArray(value?.complianceLogs) ? value.complianceLogs.map(normalizeComplianceLog).filter(Boolean) : [],
    medicalTransactionLog: normalizeMedicalTransactionLog(value?.medicalTransactionLog),
    // The old assistant feature: all code and relay endpoints are gone (Build 11 / Build 18). If an OLD backup or old stored data still
    // carries these keys they are passed through as inert, never-read data so nothing the user once saved is silently deleted. Nothing creates them.
    ...(value && value.askAgent && typeof value.askAgent === 'object' ? { askAgent: value.askAgent } : {}),
    ...(value && value.cultivationAssistant && typeof value.cultivationAssistant === 'object' ? { cultivationAssistant: value.cultivationAssistant } : {}),
    // Build 18 (additive): tents/beds, saved mixes, dry & cure batches, breeding trackers.
    groups: b18List(value?.groups, normalizeGroup),
    mixes: b18List(value?.mixes, normalizeMix),
    batches: b18List(value?.batches, normalizeBatch),
    bredEvals: b18List(value?.bredEvals, normalizeBredEval),
    cloneRuns: b18List(value?.cloneRuns, normalizeCloneRun),
    // Build 19 (additive): planned feedings / top dresses for the calendar. Nothing else in the stored data changes shape.
    plans: b18List(value?.plans, normalizePlan),
    // Build 32 (additive): calendar tasks (planned feedings, cuttings, pollen, custom) that can be ticked off.
    tasks: b18List(value?.tasks, normalizeTask),
    // Build 11 (additive): harvest log.
    harvests: Array.isArray(value?.harvests) ? value.harvests.map(normalizeHarvest).filter(Boolean) : [],
    // Build 13 (additive): Mothers & Fathers list (Breeding tab).
    motherFatherPlants: Array.isArray(value?.motherFatherPlants) ? value.motherFatherPlants.map(normalizeMotherFather).filter(Boolean) : [],
    // Build 51 (additive): trip tickets (OCP Form 004), one per delivery/transfer trip, kept 4 years. Included in backups.
    tripTickets: b18List(value?.tripTickets, (t) => (t && typeof t === 'object' && !Array.isArray(t) && t.id ? t : null)),
    settings: normalizeSettings(value?.settings),
  };
  lastRepairCount = repairDuplicateIds(out);
  return out;
}

/* Build 12: every record that is looked up by id must have a UNIQUE id. Duplicate ids (or the same object
   referenced several times) made delete-by-id remove every copy. This pass is idempotent: it only touches
   records whose id is missing/duplicated or that are the same object as an earlier entry, and it never drops a record. */
function repairKeys() { return [['plants', 'id'], ['tripTickets', 'id'], ['breedingPlants', 'id'], ['savedPatients', 'id'], ['patients', 'id'], ['harvests', 'id'], ['vlogEntries', 'id'], ['breedingProjects', 'id'], ['breedingLog', 'id'], ['motherFatherPlants', 'id'], ['groups', 'id'], ['mixes', 'id'], ['batches', 'id'], ['bredEvals', 'id'], ['cloneRuns', 'id'], ['plans', 'id'], ['tasks', 'id'], ['complianceLogs', 'id'], ['reports', 'id']]; }

function freshId() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function hasDuplicateIds(s) {
  if (!s || typeof s !== 'object') return false;
  const dupIn = (arr, key) => {
    if (!Array.isArray(arr)) return false;
    const seenObj = new Set(); const seen = new Set();
    for (const rec of arr) {
      if (!rec || typeof rec !== 'object') continue;
      if (seenObj.has(rec)) return true;
      seenObj.add(rec);
      const id = rec[key];
      if (!id || seen.has(id)) return true;
      seen.add(id);
    }
    return false;
  };
  if (repairKeys().some(([k, key]) => dupIn(s[k], key))) return true;
  if (dupIn(s.medicalTransactionLog && s.medicalTransactionLog.rows, 'row_id')) return true;
  return [].concat(Array.isArray(s.plants) ? s.plants : [], Array.isArray(s.breedingPlants) ? s.breedingPlants : [])
    .some((p) => p && Array.isArray(p.logs) && dupIn(p.logs, 'id'));
}

function repairDuplicateIds(s) {
  let fixed = 0;
  const fixList = (arr, key, isPlant) => {
    if (!Array.isArray(arr)) return;
    const seenObj = new Set();
    const seenId = new Set();
    const logSigById = new Map();
    for (let i = 0; i < arr.length; i += 1) {
      let rec = arr[i];
      if (!rec || typeof rec !== 'object') continue;
      const sameObject = seenObj.has(rec);
      if (sameObject) { rec = JSON.parse(JSON.stringify(rec)); arr[i] = rec; }
      seenObj.add(rec);
      const oldId = rec[key];
      const idBad = !oldId || seenId.has(oldId);
      if (idBad || sameObject) {
        rec[key] = freshId();
        fixed += 1;
        if (isPlant && oldId) {
          // Logs of duplicate plants cannot be told apart: the first plant keeps them; a copy with identical logs starts empty.
          const sig = JSON.stringify(rec.logs || []);
          if (sameObject || logSigById.get(oldId) === sig) rec.logs = [];
          else if (Array.isArray(rec.logs)) rec.logs = JSON.parse(sig);
        }
      }
      if (oldId && !logSigById.has(oldId)) logSigById.set(oldId, JSON.stringify(rec.logs || []));
      seenId.add(rec[key]);
      if (isPlant && Array.isArray(rec.logs)) {
        const logIds = new Set();
        rec.logs.forEach((log) => {
          if (!log || typeof log !== 'object') return;
          if (!log.id || logIds.has(log.id)) { log.id = freshId(); fixed += 1; }
          logIds.add(log.id);
        });
      }
    }
  };
  repairKeys().forEach(([k, key]) => fixList(s[k], key, k === 'plants' || k === 'breedingPlants'));
  if (s.medicalTransactionLog) fixList(s.medicalTransactionLog.rows, 'row_id', false);
  return fixed;
}

function showStorageError(message) {
  const el = document.getElementById('storage-error');
  if (!el) {
    if (message) console.error(message);
    return;
  }
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function writeStateToStorage() {
  try {
    const serialized = JSON.stringify(state);
    memoryBackup = serialized;
    hasStoredData = true;
    const storage = getBrowserStorage();
    if (!storage) throw new Error('This browser blocked local storage.');
    storage.setItem(STORAGE_KEY, serialized);
    showStorageError('');
    return true;
  } catch (error) {
    const quota = error && (error.name === 'QuotaExceededError' || error.code === 22);
    showStorageError(quota
      ? 'The logbook could not be saved because browser storage is full. Photos are stored separately, but this change did not stick. Back up from Backups & Export.'
      : `The logbook could not be saved: ${error.message || error}`);
    return false;
  }
}

function saveState() {
  const ok = writeStateToStorage();
  if (ok) {
    createSnapshot('auto');
    scheduleFileBackup();
    // Build 28: queue the change for iCloud sync (no-op while sync is off).
    if (window.BorikenSync) window.BorikenSync.onLocalSave();
  }
  updateStorageStatus();
  return ok;
}

function hasPhoto(log) {
  if (!log) return false;
  if (log.photoId) return true;
  return typeof log.photo === 'string' && log.photo.startsWith('data:');
}

function photoSrc(log) {
  if (!log) return '';
  if (log.photoId && mediaUrlCache.has(log.photoId)) return mediaUrlCache.get(log.photoId);
  if (typeof log.photo === 'string' && (log.photo.startsWith('data:') || log.photo.startsWith('blob:'))) return log.photo;
  return '';
}

function thumbSrc(entry) {
  if (!entry) return '';
  if (entry.thumbnailId && mediaUrlCache.has(entry.thumbnailId)) return mediaUrlCache.get(entry.thumbnailId);
  if (typeof entry.thumbnail === 'string' && (entry.thumbnail.startsWith('data:') || entry.thumbnail.startsWith('blob:'))) return entry.thumbnail;
  return '';
}

async function hydrateMediaCache() {
  const media = window.BorikenMedia;
  if (!media) return;
  const ids = media.collectIds(state);
  for (const id of ids) {
    if (mediaUrlCache.has(id)) continue;
    try {
      const url = await media.objectUrl(id);
      if (url) mediaUrlCache.set(id, url);
    } catch (error) {
      console.warn('Could not load a saved photo.', error);
    }
  }
}

function collectReferencedPhotoIds(extraStates = []) {
  const media = window.BorikenMedia;
  if (!media) return [];
  const ids = new Set(media.collectIds(state));
  extraStates.forEach((item) => media.collectIds(item).forEach((id) => ids.add(id)));
  return [...ids];
}

async function pruneUnreferencedPhotos() {
  const media = window.BorikenMedia;
  if (!media) return;
  const keep = new Set(collectReferencedPhotoIds(loadSnapshots().map((snap) => snap.state)));
  const all = await media.allIds();
  await media.deleteIds(all.filter((id) => !keep.has(id)));
}

function renderOnboarding() {
  const card = $('#onboarding-card');
  if (card) card.hidden = !isStateEmpty();
}

function isStateEmpty() {
  return !state.plants.length
    && !(state.breedingProjects || []).length
    && !(state.breedingPlants || []).length
    && !(state.breedingLog || []).length
    && !(state.vlogEntries || []).length
    && !(state.savedPatients || []).length
    && !(state.harvests || []).length
    && !(state.motherFatherPlants || []).length
    && !(state.groups || []).length
    && !(state.mixes || []).length
    && !(state.batches || []).length
    && !(state.bredEvals || []).length
    && !(state.cloneRuns || []).length
    && !(state.plans || []).length
    && !(state.tasks || []).length
    && !(state.reports || []).length;
}

function getBrowserStorage() {
  try {
    const storageName = ['local', 'Storage'].join('');
    return window[storageName];
  } catch (error) {
    return null;
  }
}

/*
  Layered backup protection
  ------------------------------------------------------------
  No browser app can promise zero data loss, so this keeps several independent
  copies of the full logbook:
    1. The live committed data in STORAGE_KEY (saved on every change).
    2. A rolling history of versioned snapshots in BACKUP_STORAGE_KEY, each with
       a timestamp and app/schema metadata, capped at MAX_SNAPSHOTS.
    3. Optional automatic JSON file backups via the File System Access API
       (Chrome/Edge desktop), plus manual one-click export everywhere.
  Snapshots survive even if the live data is cleared or corrupted, so the user
  can roll back from the Emergency recovery list.
*/

let backupMemoryBackup = [];
let backupFileHandle = null;
let fileBackupDebounceTimer = null;

function loadSnapshots() {
  try {
    const storage = getBrowserStorage();
    const stored = storage?.getItem(BACKUP_STORAGE_KEY);
    if (stored) return JSON.parse(stored) || [];
  } catch (error) {
    console.warn('Backup history unavailable; using temporary backups.', error);
  }
  return [...backupMemoryBackup];
}

function persistSnapshots(snapshots) {
  backupMemoryBackup = snapshots;
  try {
    const storage = getBrowserStorage();
    if (!storage) throw new Error('This browser blocked local storage.');
    storage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(snapshots));
    return true;
  } catch (error) {
    const quota = error && (error.name === 'QuotaExceededError' || error.code === 22);
    showStorageError(quota
      ? 'Backup history could not be saved because browser storage is full. Back up from Backups & Export.'
      : `Backup history could not be saved: ${error.message || error}`);
    return false;
  }
}

function buildBackupPayload(snapshotState = state) {
  return {
    app: 'Borikèn Genetics Logbook',
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state: snapshotState,
    // Build 13: non-sensitive device preferences travel with the backup.
    deviceSettings: { theme: readThemePref(), appLock: typeof lockEnabled === 'function' ? lockEnabled() : false, accent: typeof b18Ui === 'function' ? b18Ui().accent : 'green' },
  };
}

async function buildFullBackupPayload(snapshotState = state) {
  const payload = buildBackupPayload(snapshotState);
  const media = window.BorikenMedia;
  if (!media) {
    payload.photos = [];
    payload.photoWarning = 'Photo storage was not available, so this file has no pictures.';
    return payload;
  }
  const ids = media.collectIds(snapshotState);
  const exported = await media.exportPhotos(ids);
  if (exported.missing.length) {
    const error = new Error(`${exported.missing.length} photo${exported.missing.length === 1 ? '' : 's'} could not be read from on-device storage, so the backup was not saved.`);
    error.missing = exported.missing;
    throw error;
  }
  payload.photos = exported.photos;
  return payload;
}

function snapshotCounts(snapshotState) {
  return {
    plants: (snapshotState.plants || []).length,
    logs: (snapshotState.plants || []).reduce((sum, plant) => sum + (plant.logs?.length || 0), 0),
    vlogEntries: (snapshotState.vlogEntries || []).length,
    breedingProjects: (snapshotState.breedingProjects || []).length,
    breedingPlants: (snapshotState.breedingPlants || []).length,
    savedPatients: (snapshotState.savedPatients || []).length,
    harvests: (snapshotState.harvests || []).length,
    motherFatherPlants: (snapshotState.motherFatherPlants || []).length,
    reports: (snapshotState.reports || []).length,
    groups: (snapshotState.groups || []).length,
    batches: (snapshotState.batches || []).length,
    bredEvals: (snapshotState.bredEvals || []).length,
    cloneRuns: (snapshotState.cloneRuns || []).length,
    plans: (snapshotState.plans || []).length,
    tasks: (snapshotState.tasks || []).length,
  };
}

function createSnapshot(reason = 'auto', source = state) {
  if (source === state && isStateEmpty()) return;
  const signature = JSON.stringify(source);
  const snapshots = loadSnapshots();
  const last = snapshots[snapshots.length - 1];
  // Skip identical, back-to-back snapshots (e.g. repeated lifecycle flushes
  // or an unchanged reload) so history reflects real changes only.
  if (last && JSON.stringify(last.state) === signature) return;
  snapshots.push({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    appVersion: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    reason,
    counts: snapshotCounts(source),
    state: JSON.parse(signature),
  });
  // Build 4: the newest pre-restore / pre-import snapshot is protected from pruning so
  // 'automatic snapshot before restore' survives the next few edits.
  const isPre = (snap) => /^pre-/.test(snap.reason || '');
  const lastPre = [...snapshots].reverse().find(isPre);
  while (snapshots.length > MAX_SNAPSHOTS + (lastPre ? 1 : 0)) {
    const i = snapshots.findIndex((snap) => snap !== lastPre);
    snapshots.splice(i < 0 ? 0 : i, 1);
  }
  persistSnapshots(snapshots);
  renderBackupStatus();
}

function restoreSnapshot(id) {
  const snapshots = loadSnapshots();
  const snapshot = snapshots.find((entry) => entry.id === id);
  if (!snapshot) return;
  const counts = snapshot.counts || snapshotCounts(snapshot.state || {});
  openConfirmModal({
    title: 'Restore this backup?',
    message: `This replaces your current logbook with the snapshot from ${formatTimestamp(snapshot.timestamp)} (${counts.plants} plants, ${counts.logs} logs). Your current data is saved to backup history first, then overwritten.`,
    acceptLabel: 'Restore backup',
    action: async () => {
      createSnapshot('pre-restore');
      state = normalizeState(snapshot.state);
      selectedPlantId = state.plants[0]?.id || '';
      clearAllDrafts();
      if (window.BorikenMedia) await window.BorikenMedia.migrateInlinePhotos(state);
      await hydrateMediaCache();
      const saved = saveState();
      renderAll();
      if (saved) setAutosaveStatus('Backup restored', 'saved');
    },
  });
}

async function downloadLatestSnapshot() {
  const snapshots = loadSnapshots();
  if (!snapshots.length) {
    exportJSON();
    return;
  }
  const latest = snapshots[snapshots.length - 1];
  try {
    const payload = await buildFullBackupPayload(latest.state);
    payload.exportedAt = latest.timestamp;
    payload.appVersion = latest.appVersion || APP_VERSION;
    payload.schemaVersion = latest.schemaVersion || SCHEMA_VERSION;
    const res = await shareFile(`boriken-backup-${fileStamp(latest.timestamp)}.json`, JSON.stringify(payload, null, 2), 'application/json', 'Borikèn Logbook snapshot');
    if (res !== 'cancelled') setAutosaveStatus(res === 'shared' ? 'Snapshot shared' : 'Backup downloaded', 'saved');
  } catch (error) {
    showStorageError(error.message || 'Could not download the snapshot.');
  }
}

function clearBackupHistory() {
  const snapshots = loadSnapshots();
  if (!snapshots.length) {
    setAutosaveStatus('No backups to clear', 'idle');
    return;
  }
  openConfirmModal({
    title: 'Clear backup history?',
    message: `This deletes all ${snapshots.length} local backup snapshot${snapshots.length > 1 ? 's' : ''}. Your current logbook data is NOT affected, but you lose the ability to roll back to earlier versions. Export a JSON backup first if unsure.`,
    acceptLabel: 'Clear backups',
    action: async () => {
      persistSnapshots([]);
      try { await pruneUnreferencedPhotos(); } catch (error) {
        showStorageError(`Backup history was cleared, but some photos could not be removed: ${error.message || error}`);
      }
      renderBackupStatus();
      setAutosaveStatus('Backup history cleared', 'saved');
    },
  });
}

/* Automatic file backup (File System Access API, where supported) */

function supportsFileBackup() {
  return typeof window.showSaveFilePicker === 'function';
}

const FILE_HANDLE_DB = 'boriken-backup-db';
const FILE_HANDLE_STORE = 'handles';
const FILE_HANDLE_KEY = 'backupFileHandle';

function idbOpen() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(FILE_HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(FILE_HANDLE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, 'readwrite');
    tx.objectStore(FILE_HANDLE_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, 'readonly');
    const request = tx.objectStore(FILE_HANDLE_STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbDelete(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_HANDLE_STORE, 'readwrite');
    tx.objectStore(FILE_HANDLE_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function restoreBackupFileHandle() {
  if (!supportsFileBackup()) {
    renderBackupStatus();
    return;
  }
  try {
    const handle = await idbGet(FILE_HANDLE_KEY);
    if (handle) backupFileHandle = handle;
  } catch (error) {
    // No reconnectable handle; user can connect again from Tools.
  }
  renderBackupStatus();
}

async function verifyFilePermission(handle) {
  try {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
  } catch (error) {
    return false;
  }
  return false;
}

async function connectBackupFile() {
  if (!supportsFileBackup()) {
    setBackupFileStatus('This browser cannot write backup files automatically. Use “Back up to Files / iCloud” or “Backup JSON now” to save a file, and restore it later.');
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'boriken-genetics-logbook-backup.json',
      types: [{ description: 'JSON backup', accept: { 'application/json': ['.json'] } }],
    });
    backupFileHandle = handle;
    try { await idbSet(FILE_HANDLE_KEY, handle); } catch (error) { /* session-only handle */ }
    const wrote = await writeBackupToFile();
    renderBackupStatus();
    setBackupFileStatus(wrote
      ? `Connected. Automatic backups are written to “${handle.name}” after each change.`
      : `Connected to “${handle.name}”, but the first write was blocked. Click again to grant write permission.`);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      setBackupFileStatus(`Could not connect a backup file: ${error.message}`);
    }
  }
}

function disconnectBackupFile() {
  openConfirmModal({
    title: 'Disconnect backup file?',
    message: 'Automatic file backups will stop. In-browser snapshots and manual exports keep working, and the file already saved is not deleted.',
    acceptLabel: 'Disconnect',
    action: async () => {
      backupFileHandle = null;
      try { await idbDelete(FILE_HANDLE_KEY); } catch (error) { /* ignore */ }
      renderBackupStatus();
      setBackupFileStatus('Automatic file backup disconnected. In-browser snapshots and manual exports still protect your data.');
    },
  });
}

async function writeBackupToFile() {
  if (!backupFileHandle) return false;
  try {
    if (!(await verifyFilePermission(backupFileHandle))) return false;
    const payload = await buildFullBackupPayload();
    const writable = await backupFileHandle.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
    return true;
  } catch (error) {
    setBackupFileStatus(`Could not write the backup file: ${error.message || error}`);
    return false;
  }
}

function scheduleFileBackup() {
  if (!backupFileHandle) return;
  if (fileBackupDebounceTimer) clearTimeout(fileBackupDebounceTimer);
  // Debounce disk writes so rapid edits do not spam the file system.
  fileBackupDebounceTimer = setTimeout(() => { writeBackupToFile(); }, 2000);
}

/*
  Draft autosave
  ------------------------------------------------------------
  Keeps whatever the user types or selects in form fields so a refresh or
  reopen does not lose unsaved input. Drafts live under their own storage key,
  separate from the committed grow data in STORAGE_KEY, and are cleared when a
  form is submitted or reset. File inputs are intentionally ignored.
*/

let draftMemoryBackup = {};

function isAutosaveField(field) {
  if (!field || !field.id) return false;
  if (field.disabled) return false;
  const tag = field.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const ignored = ['file', 'hidden', 'password', 'button', 'submit', 'reset', 'image'];
  return !ignored.includes(field.type);
}

function getAutosaveFields() {
  return $$('input, textarea, select').filter(isAutosaveField);
}

function loadDrafts() {
  try {
    const storage = getBrowserStorage();
    const stored = storage?.getItem(DRAFT_STORAGE_KEY);
    if (stored) return JSON.parse(stored) || {};
  } catch (error) {
    console.warn('Draft storage unavailable; using temporary drafts.', error);
  }
  return { ...draftMemoryBackup };
}

function persistDrafts(drafts) {
  draftMemoryBackup = drafts;
  try {
    const storage = getBrowserStorage();
    storage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
  } catch (error) {
    console.warn('Could not persist drafts in this browser context.', error);
  }
}

function fieldDraftValue(field) {
  if (field.type === 'checkbox' || field.type === 'radio') return field.checked;
  return field.value;
}

function applyDraftValue(field, value) {
  if (field.type === 'checkbox' || field.type === 'radio') {
    field.checked = Boolean(value);
  } else {
    field.value = value;
  }
}

function setupAutosaveDrafts() {
  restoreDrafts();
  document.addEventListener('input', handleAutosaveEvent);
  document.addEventListener('change', handleAutosaveEvent);
}

function restoreDrafts() {
  const drafts = loadDrafts();
  if (!drafts || typeof drafts !== 'object') return;
  let restoredCount = 0;
  getAutosaveFields().forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(drafts, field.id)) {
      applyDraftValue(field, drafts[field.id]);
      restoredCount += 1;
    }
  });
  if (restoredCount) {
    setAutosaveStatus(`Restored ${restoredCount} saved field${restoredCount > 1 ? 's' : ''}`, 'saved');
  }
}

function handleAutosaveEvent(event) {
  const field = event.target;
  if (!isAutosaveField(field)) return;
  const drafts = loadDrafts();
  drafts[field.id] = fieldDraftValue(field);
  persistDrafts(drafts);
  setAutosaveStatus('Draft saved', 'saved');
}

function clearFormDrafts(formOrField) {
  const fields = formOrField && formOrField.tagName === 'FORM'
    ? Array.from(formOrField.elements).filter(isAutosaveField)
    : [formOrField].filter(isAutosaveField);
  if (!fields.length) return;
  const drafts = loadDrafts();
  let changed = false;
  fields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(drafts, field.id)) {
      delete drafts[field.id];
      changed = true;
    }
  });
  if (changed) persistDrafts(drafts);
}

function clearAllDrafts() {
  persistDrafts({});
}

function setAutosaveStatus(message, state = 'idle') {
  const status = $('#autosave-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
  if (autosaveStatusTimer) clearTimeout(autosaveStatusTimer);
  if (state === 'saved') {
    autosaveStatusTimer = setTimeout(() => {
      status.textContent = 'Auto-saves drafts as you type';
      status.dataset.state = 'idle';
    }, 2500);
  }
}

function switchView(view, autoGenerate = false) {
  activeView = view;
  $$('.view').forEach((section) => section.classList.remove('active'));
  $(`#${view}-view`).classList.add('active');
  $$('[data-view-button]').forEach((button) => button.classList.toggle('active', button.dataset.viewButton === view));
  const titles = { home: 'Plants', more: 'More', 'plant-detail': 'Plant', plants: 'Plant Manager', tools: 'Backups & Export', 'saved-patients': 'Patients', journal: 'Journal', vlog: 'Vlog', compliance: 'Compliance', 'medical-log': 'Patient Transaction Log', harvest: 'Harvest', breeding: 'Breeding', help: 'Help' };
  $('#view-title').textContent = titles[view] || titleCase(view);
  if (view === 'harvest') renderHarvest();
  if (typeof onMobileViewChange === 'function') onMobileViewChange(view);
  if (window.location.hash !== `#${view}`) {
    history.replaceState(null, '', `#${view}`);
  }
}

// Accessible tablist keyboard handling: Left/Right/Home/End move focus and
// activate the tab (roving tabindex), matching the ARIA tabs pattern.
function attachTablistKeys(tabs, activate) {
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (event) => {
      let next = -1;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next === -1) return;
      event.preventDefault();
      const target = tabs[next];
      activate(target.dataset.plantTab || target.dataset.phTab || target.dataset.complianceTab);
      target.focus();
    });
  });
}

function selectPlantTab(name) {
  activePlantTab = name;
  const tabs = $$('.plant-tab');
  tabs.forEach((tab) => {
    const selected = tab.dataset.plantTab === name;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  const activePanel = $('#plant-panel-active');
  const phPanel = $('#plant-panel-postharvest');
  if (activePanel) activePanel.hidden = name !== 'active';
  if (phPanel) phPanel.hidden = name !== 'postharvest';
  if (name === 'postharvest') renderPostHarvest();
}

function setupPlantTabs() {
  const tabs = $$('.plant-tab');
  tabs.forEach((tab) => tab.addEventListener('click', () => selectPlantTab(tab.dataset.plantTab)));
  attachTablistKeys(tabs, selectPlantTab);
}

function selectPostHarvestTab(name) {
  postHarvestTab = name;
  $$('.ph-subtab').forEach((tab) => {
    const selected = tab.dataset.phTab === name;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  const section = $('#ph-section');
  if (section) section.setAttribute('aria-labelledby', `ph-subtab-${name}`);
  renderPostHarvest();
}

function setupPostHarvestTabs() {
  const tabs = $$('.ph-subtab');
  tabs.forEach((tab) => tab.addEventListener('click', () => selectPostHarvestTab(tab.dataset.phTab)));
  attachTablistKeys(tabs, selectPostHarvestTab);
}

function openInitialView() {
  const params = new URLSearchParams(window.location.search);
  const requestedView = params.get('view') || window.location.hash.replace('#', '');
  const validViews = new Set(['home', 'more', 'harvest', 'plants', 'journal', 'vlog', 'breeding', 'compliance', 'medical-log', 'tools', 'help', 'dash', 'limits', 'saved-patients']);
  // Build 48: the app opens on the compliance Dashboard.
  switchView(validViews.has(requestedView) ? requestedView : (document.getElementById('dash-view') ? 'dash' : 'home'));
}

function setupInstallableApp() {
  // Offline app shell for the browser/PWA build only (not used inside the iOS wrapper).
  if (!('serviceWorker' in navigator) || !['http:', 'https:'].includes(window.location.protocol)) return;
  navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}

const THEME_PREF_KEY = 'boriken-theme-pref-v1';
let themePref = 'system';

function readThemePref() {
  try { const v = getBrowserStorage()?.getItem(THEME_PREF_KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch (e) { return 'system'; }
}

function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(pref) {
  themePref = pref;
  const theme = resolveTheme(pref);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.themePref = pref;
  root.style.colorScheme = theme;
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f3f5ee');
  // Native status bar: 'DARK' = light text for dark backgrounds, 'LIGHT' = dark text. System = follow the phone.
  try {
    const sb = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
    if (sb && sb.setStyle) sb.setStyle({ style: pref === 'system' ? 'DEFAULT' : (theme === 'dark' ? 'DARK' : 'LIGHT') }).catch(() => {});
  } catch (e) { /* status bar plugin not available (browser) */ }
  document.querySelectorAll('[data-theme-pref]').forEach((b) => b.setAttribute('aria-checked', b.dataset.themePref === pref ? 'true' : 'false'));
  const note = document.getElementById('theme-note');
  if (note) note.textContent = pref === 'system' ? 'System follows your iPhone' : `Always ${pref}`;
}

function setThemePref(pref) {
  if (!['light', 'dark', 'system'].includes(pref)) return;
  try {
    const storage = getBrowserStorage();
    if (pref === 'system') storage?.removeItem(THEME_PREF_KEY); else storage?.setItem(THEME_PREF_KEY, pref);
  } catch (e) { console.warn('Could not save theme preference.', e); }
  applyTheme(pref);
}

function initializeTheme() {
  applyTheme(readThemePref());
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const follow = () => { if (themePref === 'system') applyTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', follow);
  }
  document.querySelectorAll('[data-theme-pref]').forEach((b) => b.addEventListener('click', () => setThemePref(b.dataset.themePref)));
}

function renderAll() {
  if (!selectedPlantId && state.plants.length) selectedPlantId = (activePlants()[0] || state.plants[0]).id;
  renderHarvestArchive();
  renderPlantCards();
  renderProfile();
  renderPostHarvest();
  renderPlantOptions();
  renderJournal();
  renderVlogEntries();
  renderBreedingProjects();
  renderCompliance();
  renderMedicalLog();
  renderHeightChart();
  if (typeof renderBuild4 === 'function') renderBuild4();
  if (typeof renderBuild11 === 'function') renderBuild11();
  renderOnboarding();
  renderBackupStatus();
  if (typeof renderMobile === 'function') renderMobile();
  updateStorageStatus();
}

function renderBackupStatus() {
  const snapshots = loadSnapshots();
  const count = snapshots.length;
  const latest = snapshots[count - 1];

  const countEl = $('#backup-count');
  if (countEl) countEl.textContent = String(count);

  const lastEl = $('#backup-last-time');
  if (lastEl) lastEl.textContent = latest ? formatTimestamp(latest.timestamp) : 'No snapshots yet';

  const healthEl = $('#backup-health');
  if (healthEl) {
    let message;
    let healthState;
    if (!count) {
      message = 'No local snapshots yet. They are created automatically as soon as you add or change data. You can also export a JSON file backup anytime.';
      healthState = 'warn';
    } else if (backupFileHandle) {
      message = `Well protected: ${count} local snapshot${count > 1 ? 's' : ''} in this browser plus an automatic file backup. Keep exporting occasional JSON backups for off-device safety.`;
      healthState = 'good';
    } else {
      message = `${count} local snapshot${count > 1 ? 's' : ''} kept in this browser. No browser app can promise zero loss — for maximum safety, export a JSON file backup or connect an automatic backup file.`;
      healthState = 'ok';
    }
    healthEl.textContent = message;
    healthEl.dataset.state = healthState;
  }

  renderEmergencyRecovery(snapshots);
  updateFileBackupUI();
}

function renderEmergencyRecovery(snapshots) {
  const list = $('#backup-snapshot-list');
  if (!list) return;
  if (!snapshots.length) {
    list.innerHTML = '<li class="backup-empty">No local snapshots yet. As you add and change data, recent versions appear here so you can roll back if anything looks missing.</li>';
    return;
  }
  list.innerHTML = [...snapshots].reverse().map((snapshot) => {
    const counts = snapshot.counts || snapshotCounts(snapshot.state || {});
    return `<li class="backup-snapshot">
      <div class="backup-snapshot-meta">
        <strong>${escapeHtml(formatTimestamp(snapshot.timestamp))}</strong>
        <span>${counts.plants || 0} plants · ${counts.logs || 0} logs · ${counts.vlogEntries || 0} vlog · ${counts.breedingProjects || 0} breeding · ${counts.harvests || 0} harvests</span>
      </div>
      <button class="secondary-button" type="button" data-restore-snapshot="${snapshot.id}">Restore</button>
    </li>`;
  }).join('');
  list.querySelectorAll('[data-restore-snapshot]').forEach((button) => {
    button.addEventListener('click', () => restoreSnapshot(button.dataset.restoreSnapshot));
  });
}

function updateFileBackupUI() {
  const connectBtn = $('#connect-backup-file');
  const disconnectBtn = $('#disconnect-backup-file');
  const statusEl = $('#backup-file-status');
  if (!supportsFileBackup()) {
    if (connectBtn) connectBtn.hidden = true;
    if (disconnectBtn) disconnectBtn.hidden = true;
    if (statusEl) statusEl.textContent = (typeof isNativeApp === 'function' && isNativeApp())
      ? 'Use “Back up to Files / iCloud” at the top to save a backup file. Snapshots in the app also protect you.'
      : 'Automatic file backups need Chrome or Edge on desktop. In this browser, use “Backup JSON” to download a file and re-import it when needed — your in-browser snapshots still protect you.';
    return;
  }
  if (connectBtn) connectBtn.hidden = Boolean(backupFileHandle);
  if (disconnectBtn) disconnectBtn.hidden = !backupFileHandle;
  if (statusEl) {
    statusEl.textContent = backupFileHandle
      ? 'Connected to a backup file. It is updated automatically a couple of seconds after each change and when you close the app.'
      : 'Connect a backup file to also save a JSON backup onto your disk automatically after each change.';
  }
}

function setBackupFileStatus(message) {
  const statusEl = $('#backup-file-status');
  if (statusEl) statusEl.textContent = message;
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function fileStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'backup';
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function getToday() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('boriken-b63-snapshot') === '1') {
      const raw = localStorage.getItem('boriken-b63-snapshot-date') || '';
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      if (match) {
        const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        day.setHours(0, 0, 0, 0);
        return day;
      }
    }
  } catch (e) { /* a normal launch keeps the system date */ }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayDiff(startValue, end = getToday()) {
  const start = parseDate(startValue);
  if (!start) return 0;
  return Math.max(0, Math.floor((end - start) / DAY_MS));
}

function addDays(value, days) {
  const date = parseDate(value) || getToday();
  date.setDate(date.getDate() + Number(days || 0));
  return date;
}

function toInputDate(date) {
  // Local calendar date (not UTC): after 8 PM in New York toISOString() is already "tomorrow".
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(value) {
  const date = value instanceof Date ? value : parseDate(value);
  if (!date) return 'Not set';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Lifecycle day counters
//
// Durations are ELAPSED days (Aug 22 → Aug 26 is 4 days). The "Day N" labels (Veg day,
// Flower day) are inclusive since Build 16: the start date itself is Day 1. Both sides
// are normalized to midnight so time zones and time-of-day cannot cause
// off-by-one drift. A missing date returns null, which renders as
// "not started" rather than silently falling back to another date.
// ---------------------------------------------------------------------------
const MS_PER_DAY = DAY_MS;

function elapsedDaysSince(dateValue, end = getToday()) {
  const startDate = parseDate(dateValue);
  if (!startDate) return null;
  const endDate = end instanceof Date ? new Date(end.getTime()) : parseDate(end);
  if (!endDate) return null;
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY);
}

// Autoflowers have no manual flip — flower begins expectedVegDays after seed.
function getAutoFlowerDate(plant) {
  return addDays(plant.startDate, Number(plant.expectedVegDays || 0));
}

// The date flower ACTUALLY began. Returns '' until the flip really happens, so
// a planned flip date can never start the flower counter.
function getActualFlowerStart(plant) {
  if (plant.growType === 'Autoflower') {
    const auto = toInputDate(getAutoFlowerDate(plant));
    return auto <= toInputDate(getToday()) ? auto : '';
  }
  return plant.flowerStartDate || '';
}

// Planned flip — shown for planning and harvest projection only.
function getPlannedFlipDate(plant) {
  if (plant.growType === 'Autoflower') return toInputDate(getAutoFlowerDate(plant));
  return plant.plannedFlipDate || '';
}

// Counters freeze on the harvest date, so archived records keep the true
// durations they finished with instead of growing forever.
function statsAsOf(plant) {
  return parseDate(plant.harvestDate) || getToday();
}

function getProjectedHarvest(plant) {
  if (plant.growType === 'Autoflower') {
    return addDays(plant.startDate, Number(plant.expectedVegDays || 0) + Number(plant.expectedFlowerDays || 0));
  }
  const flip = getActualFlowerStart(plant) || plant.plannedFlipDate;
  if (flip) return addDays(flip, Number(plant.expectedFlowerDays || 0));
  return addDays(plant.vegStartDate || plant.startDate, Number(plant.expectedVegDays || 0) + Number(plant.expectedFlowerDays || 0));
}

// Plant age — the overall lifecycle clock, always from the seed/start date.
function getPlantAge(plant) {
  if (!plant.startDate) return null;
  const days = elapsedDaysSince(plant.startDate, statsAsOf(plant));
  return days === null ? null : Math.max(0, days);
}

// Days in veg — counted ONLY from vegStartDate, never the seed/start date.
// Freezes at the real flip once flower begins.
function getDaysInVeg(plant) {
  if (!plant.vegStartDate) return null;
  const raw = elapsedDaysSince(plant.vegStartDate);
  if (raw === null || raw < 0) return null; // veg start is empty or still ahead
  const flowerStart = getActualFlowerStart(plant);
  const end = flowerStart ? parseDate(flowerStart) : statsAsOf(plant);
  const days = elapsedDaysSince(plant.vegStartDate, end);
  return days === null ? null : Math.max(0, days);
}

// Days in flower — counted ONLY from the actual flower start. Stays
// "not started" while a flip is merely planned.
function getDaysInFlower(plant) {
  const start = getActualFlowerStart(plant);
  if (!start) return null;
  const days = elapsedDaysSince(start, statsAsOf(plant));
  return days === null ? null : Math.max(0, days);
}

// Inclusive day numbers: the first day of a stage (its start date) is "Day 1".
function dayCountLabel(days, notStartedText) {
  return days === null ? notStartedText : `Day ${days + 1}`;
}

function dayDurationLabel(days, notStartedText) {
  return days === null ? notStartedText : `${days} day${days === 1 ? '' : 's'}`;
}

// Build 18: progress toward harvest = flower days / planned flower days, and ONLY flower days. Veg days are not counted.
//  - Seedling / Veg: no percentage (null). The UI shows day counts only; the percentage starts at the flip.
//  - Flower (photoperiod after Flip to flower, or autoflower once its flower phase starts):
//        days in flower / planned flower days, 0 on the flip date, exactly 100 on the projected harvest date, never above 100.
//  - Harvested / drying / curing / finished: 100. Archived: null (not shown). No planned flower days: null.
// `asOf` is a Date or yyyy-mm-dd string (default today); it exists for tests.
function growProgress(plant, stage, asOf) {
  if (stage === 'Archived') return null;
  if (['Harvest', 'Harvested', 'Drying', 'Curing', 'Finished'].includes(stage)) return 100;
  if (stage !== 'Flower') return null;
  const ef = Math.max(0, Number(plant.expectedFlowerDays || 0));
  if (ef <= 0) return null;
  const today = asOf ? (asOf instanceof Date ? asOf : parseDate(asOf)) : statsAsOf(plant);
  const flip = getActualFlowerStart(plant);
  if (!flip) return null;
  const n = elapsedDaysSince(flip, today);
  if (n === null) return null;
  const pct = Math.max(0, n) / ef;
  if (!Number.isFinite(pct)) return null;
  return Math.max(0, Math.min(100, Math.round(pct * 100)));
}

function getPlantStats(plant) {
  const plantAgeDays = getPlantAge(plant);
  const daysInVeg = getDaysInVeg(plant);
  const flowerDays = getDaysInFlower(plant);
  const flowerStarted = flowerDays !== null;
  const totalDays = plantAgeDays ?? 0;
  const harvestDate = getProjectedHarvest(plant);
  const daysToHarvest = Math.ceil((harvestDate - getToday()) / MS_PER_DAY);
  const storedStage = String(plant.growthStage || '').trim();
  let stage = plant.startDate ? 'Seedling' : (storedStage || 'Stage not recorded');
  if (plant.status === 'archived') stage = 'Archived';
  else if (plant.status === 'finished') stage = 'Finished';
  else if (plant.status === 'curing') stage = 'Curing';
  else if (plant.status === 'drying') stage = 'Drying';
  else if (plant.status === 'harvest') stage = 'Harvest';
  else if (plant.harvestDate) stage = 'Harvested';
  else if (plant.statusOverride === 'Finished') stage = 'Finished';
  else if (flowerStarted) stage = 'Flower';
  else if (daysInVeg !== null) stage = 'Veg';
  // The percent is only a progress bar. At 100% a Flower plant is "Ready to harvest" but never moves
  // by itself: it stays Flower until Log harvest is confirmed on its profile.
  const progress = growProgress(plant, stage);
  const ready = stage === 'Flower' && progress !== null && progress >= 100;
  const plannedFlip = getPlannedFlipDate(plant);
  const isAuto = plant.growType === 'Autoflower';
  // A planned flip date is a reminder only. It never starts flower and never moves the plant.
  const flipPlanned = stage === 'Veg' && !isAuto && !!plannedFlip;
  const flipDue = flipPlanned && plannedFlip <= toInputDate(getToday());
  return {
    ready,
    flipPlanned,
    flipDue,
    canFlip: stage === 'Veg' && !isAuto,
    plantAgeDays,
    totalDays,
    daysInVeg,
    flowerDays,
    harvestDate,
    daysToHarvest,
    progress,
    stage,
    flowerStarted,
    plannedFlipDate: getPlannedFlipDate(plant),
    actualFlowerStart: getActualFlowerStart(plant),
    ageLabel: dayDurationLabel(plantAgeDays, 'No start date'),
    vegLabel: dayCountLabel(daysInVeg, 'Veg not started'),
    flowerLabel: dayCountLabel(flowerDays, 'Flower not started'),
    vegDurationLabel: dayDurationLabel(daysInVeg, 'Veg not started'),
    flowerDurationLabel: dayDurationLabel(flowerDays, 'Flower not started'),
  };
}

function plantDayLabel(plant, stats) {
  if (!plant || !stats) return 'Date not recorded';
  if (stats.flowerStarted) return `Flower day ${stats.flowerDays + 1}`;
  if (stats.daysInVeg !== null) return `Veg day ${stats.daysInVeg + 1}`;
  if (!plant.startDate || stats.plantAgeDays === null) return 'Date not recorded';
  return `Day ${stats.plantAgeDays + 1}`;
}

function getStageClass(stage) {
  return `stage-${stage.toLowerCase().replace(/\s+/g, '-')}`;
}

// ---------------------------------------------------------------------------
// Lifecycle status: Active / Harvested / Archived
//
// A single source of truth for which dashboard section a record belongs to.
// A recorded harvestDate always wins over the old phase, so a record whose
// phase still reads "Flower" can never linger in Active Strains.
// ---------------------------------------------------------------------------
const POST_HARVEST_STATUSES = ['harvest', 'drying', 'curing', 'finished'];

function getPlantStatus(plant) {
  if (!plant) return 'Active';
  if (plant.status === 'archived') return 'Archived';
  if (plant.harvestDate) return 'Harvested';
  if (POST_HARVEST_STATUSES.includes(plant.status)) return 'Harvested';
  return 'Active';
}

function activeStrains() {
  return state.plants.filter((plant) => getPlantStatus(plant) === 'Active' && !plant.harvestDate && !(window.B63 && B63.explicitId && B63.explicitId(plant)));
}

function harvestedStrains() {
  return state.plants.filter((plant) => getPlantStatus(plant) === 'Harvested');
}

function archivedStrains() {
  return state.plants.filter((plant) => getPlantStatus(plant) === 'Archived');
}

function activePlants() {
  return activeStrains();
}

function plantsByStatus(status) {
  return state.plants.filter((plant) => (plant.status || 'active') === status);
}

function sortedPlants() {
  const sort = $('#plant-sort')?.value || 'harvest';
  return [...state.plants].sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
    const sa = getPlantStats(a);
    const sb = getPlantStats(b);
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'stage') return sa.stage.localeCompare(sb.stage);
    if (sort === 'age') return sb.totalDays - sa.totalDays;
    return sa.harvestDate - sb.harvestDate;
  });
}

function sortedActiveStrains() {
  const activeIds = new Set(activeStrains().map((plant) => plant.id));
  return sortedPlants().filter((plant) => activeIds.has(plant.id));
}

// The "Active Strains" dashboard table. Shows currently growing records only:
// seedling, veg, and flower. Harvested and archived records are excluded.
// ---------------------------------------------------------------------------
// Harvest Archive dashboard section
// ---------------------------------------------------------------------------

function harvestSortValue(plant, key) {
  const stats = getPlantStats(plant);
  if (key === 'name') return plant.name || '';
  if (key === 'age') return stats.plantAgeDays ?? -1;
  if (key === 'flower') return stats.flowerDays ?? -1;
  return plant.harvestDate || '';
}

function plantBatchId(plant) {
  return plant.internalPlantCode || (plant.id ? String(plant.id).slice(0, 8).toUpperCase() : '');
}

function filteredHarvestRecords() {
  const search = ($('#harvest-search')?.value || '').trim().toLowerCase();
  const strain = $('#harvest-strain-filter')?.value || 'all';
  const room = $('#harvest-room-filter')?.value || 'all';
  const from = $('#harvest-date-from')?.value || '';
  const to = $('#harvest-date-to')?.value || '';
  const sort = $('#harvest-sort')?.value || 'recent';

  const rows = harvestedStrains().filter((plant) => {
    if (window.B63 && B63.explicitId && B63.explicitId(plant)) return false;
    if (strain !== 'all' && plant.name !== strain) return false;
    const roomValue = plant.areaOrRoom || plant.location || '';
    if (room !== 'all' && roomValue !== room) return false;
    const harvested = plant.harvestDate || '';
    if (from && (!harvested || harvested < from)) return false;
    if (to && (!harvested || harvested > to)) return false;
    if (search) {
      const haystack = [plant.name, plantBatchId(plant), plant.internalPlantCode, plant.cultivar, plant.location, plant.areaOrRoom]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  // Default: most recent harvest first.
  return rows.sort((a, b) => {
    const va = harvestSortValue(a, sort === 'recent' ? 'recent' : sort);
    const vb = harvestSortValue(b, sort === 'recent' ? 'recent' : sort);
    if (sort === 'name') return String(va).localeCompare(String(vb));
    if (sort === 'oldest') return String(a.harvestDate || '').localeCompare(String(b.harvestDate || ''));
    if (sort === 'age' || sort === 'flower') return Number(vb) - Number(va);
    return String(vb).localeCompare(String(va));
  });
}

function populateHarvestFilters() {
  const records = harvestedStrains();
  const fill = (selector, values, allLabel) => {
    const select = $(selector);
    if (!select) return;
    const current = select.value;
    const unique = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="all">${allLabel}</option>`
      + unique.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    select.value = unique.includes(current) ? current : 'all';
  };
  fill('#harvest-strain-filter', records.map((p) => p.name), 'All strains');
  fill('#harvest-room-filter', records.map((p) => p.areaOrRoom || p.location), 'All rooms');
}

function harvestArchiveCard(plant) {
  const stats = getPlantStats(plant);
  const logs = [...(plant.logs || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const photos = logs.filter((log) => hasPhoto(log));
  const yieldValue = plant.dryWeight || plant.wetWeight || '';
  const rows = [
    ['Harvest date', plant.harvestDate ? formatDate(plant.harvestDate) : 'Not recorded'],
    ['Plant / batch ID', plantBatchId(plant) || '—'],
    ['Total plant age', stats.ageLabel],
    ['Veg duration', stats.vegDurationLabel],
    ['Flower duration', stats.flowerDurationLabel],
    ['Wet weight', plant.wetWeight || 'Not entered'],
    ['Dry weight', plant.dryWeight || 'Not entered'],
    ['Yield', yieldValue || 'Not entered'],
    ['Room / location', plant.areaOrRoom || plant.location || '—'],
    ['Lab test results', plant.labResults || 'None on file'],
    ['Phenotype', plant.cultivar || plant.phenotype || '—'],
    ['Workflow stage', POST_HARVEST_STATUSES.includes(plant.status)
      ? (STATUS_LABELS[plant.status] || stats.stage)
      : 'Harvested'],
  ];
  return `
    <article class="panel harvest-card" data-harvest-card="${plant.id}">
      <div class="panel-header">
        <div>
          <p class="eyebrow">${escapeHtml(plant.growType || '')} · ${plantCountText(plant)}</p>
          <h4>${escapeHtml(plant.name)}</h4>
        </div>
        <span class="badge ${getStageClass(stats.stage)}">${stats.stage}</span>
      </div>
      <div class="harvest-metrics">
        ${rows.map(([label, value]) => `<div class="metric-row"><span>${label}</span><strong>${escapeHtml(String(value))}</strong></div>`).join('')}
      </div>
      ${plant.notes || plant.postHarvestNotes ? `<p class="harvest-notes">${escapeHtml(plant.postHarvestNotes || plant.notes)}</p>` : ''}
      ${photos.length ? `<div class="harvest-photos">${photos.slice(0, 4).map((log) => photoImgTag(log, `${escapeHtml(plant.name)} photo`)).join('')}</div>` : ''}
      <div class="harvest-actions">
        <button class="secondary-button" type="button" data-harvest-open="${plant.id}">View full plant record</button>
        <button class="secondary-button" type="button" data-harvest-return="${plant.id}">Return to Active</button>
        <button class="secondary-button" type="button" data-harvest-archive="${plant.id}">Archive</button>
      </div>
    </article>
  `;
}

function renderHarvestArchive() {
  const container = $('#harvest-archive-list');
  if (!container) return;
  populateHarvestFilters();
  const records = filteredHarvestRecords();
  const countEl = $('#harvest-archive-count');
  const total = harvestedStrains().length;
  if (countEl) {
    countEl.textContent = total
      ? `${records.length} of ${total} harvested record${total === 1 ? '' : 's'}`
      : 'No harvested records yet';
  }
  if (!total) {
    container.innerHTML = '<div class="empty-state"><p>No harvested strains yet. When you complete a harvest, the record moves here automatically and leaves Active Strains — with all of its history intact.</p></div>';
  } else if (!records.length) {
    container.innerHTML = '<div class="empty-state"><p>No harvested records match these filters.</p></div>';
  } else {
    container.innerHTML = records.map(harvestArchiveCard).join('');
  }
  bindHarvestArchiveControls();
  renderArchivedStrains();
}

function renderArchivedStrains() {
  const container = $('#archived-strain-list');
  if (!container) return;
  const records = archivedStrains();
  const wrap = $('#archived-strain-panel');
  if (wrap) wrap.hidden = !records.length;
  if (!records.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = records.map((plant) => {
    const stats = getPlantStats(plant);
    return `
      <div class="archived-row">
        <div>
          <strong>${escapeHtml(plant.name)}</strong>
          <span class="eyebrow">${plantBatchId(plant)} · ${plant.harvestDate ? `harvested ${formatDate(plant.harvestDate)}` : 'never harvested'} · ${stats.ageLabel} old</span>
        </div>
        <div class="harvest-actions">
          <button class="secondary-button" type="button" data-harvest-open="${plant.id}">View record</button>
          <button class="secondary-button" type="button" data-harvest-return="${plant.id}">Return to Active</button>
        </div>
      </div>
    `;
  }).join('');
  bindHarvestArchiveControls();
}

function bindHarvestArchiveControls() {
  $$('[data-harvest-open]').forEach((button) => {
    button.onclick = () => {
      selectedPlantId = button.dataset.harvestOpen;
      switchView('plants');
      renderAll();
    };
  });
  $$('[data-harvest-return]').forEach((button) => {
    button.onclick = () => returnToActive(button.dataset.harvestReturn);
  });
  $$('[data-harvest-archive]').forEach((button) => {
    button.onclick = () => archivePlant(button.dataset.harvestArchive, { fromCard: true });
  });
}

function setupHarvestArchiveControls() {
  // Browsers restore typed form values across a reload, which would leave the
  // filter inputs showing a filter the freshly-rendered list has not applied.
  // Reset to the documented default (most recent harvest first, no filters).
  resetHarvestFilterInputs();
  ['#harvest-search', '#harvest-strain-filter', '#harvest-room-filter', '#harvest-date-from', '#harvest-date-to', '#harvest-sort']
    .forEach((selector) => {
      const el = $(selector);
      if (!el) return;
      el.addEventListener('input', renderHarvestArchive);
      el.addEventListener('change', renderHarvestArchive);
    });
  $('#harvest-clear-filters')?.addEventListener('click', () => {
    resetHarvestFilterInputs();
    renderHarvestArchive();
  });
}

function resetHarvestFilterInputs() {
  const search = $('#harvest-search');
  if (search) search.value = '';
  ['#harvest-strain-filter', '#harvest-room-filter'].forEach((s) => { const el = $(s); if (el) el.value = 'all'; });
  ['#harvest-date-from', '#harvest-date-to'].forEach((s) => { const el = $(s); if (el) el.value = ''; });
  const sort = $('#harvest-sort');
  if (sort) sort.value = 'recent';
}

function renderPlantCards() {
  const list = $('#plant-card-list');
  if (!state.plants.length) {
    list.innerHTML = getEmptyStateHtml();
    list.querySelector('button')?.addEventListener('click', () => openPlantModal());
    return;
  }
  const active = sortedActiveStrains();
  if (!active.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">✓</div><h3>No active plants</h3><p>Every plant has moved into the Post-Harvest workflow. Add a new plant, or open the Post-Harvest tab to manage drying, curing, and finished batches.</p></div>';
    return;
  }
  list.innerHTML = active.map((plant) => {
    const stats = getPlantStats(plant);
    return `
      <button class="plant-card ${plant.id === selectedPlantId ? 'active' : ''}" type="button" data-card-plant="${plant.id}">
        <strong>${escapeHtml(plant.name)}</strong>
        <span class="badge ${getStageClass(stats.stage)}">${stats.stage}</span>
        <p>${stats.totalDays} total days · harvest ${formatDate(stats.harvestDate)}</p>
        ${stats.progress === null ? `<p class="small-note">${stats.stage === 'Veg' || stats.stage === 'Seedling' ? 'Veg: days only. % starts at flip.' : ''}</p>` : `<div class="progress-track"><div class="progress-fill" style="width:${stats.progress}%"></div></div>`}
      </button>
    `;
  }).join('');
  $$('[data-card-plant]').forEach((button) => button.addEventListener('click', () => {
    selectedPlantId = button.dataset.cardPlant;
    renderPlantCards();
    renderProfile();
    renderHeightChart();
  }));
}

function renderProfile() {
  const panel = $('#profile-panel');
  const plant = state.plants.find((item) => item.id === selectedPlantId);
  panel.hidden = !state.plants.length;
  if (!plant) {
    // With no plants at all the card list already shows the one empty state.
    panel.innerHTML = state.plants.length ? getEmptyStateHtml() : '';
    panel.querySelector('button')?.addEventListener('click', () => openPlantModal());
    return;
  }
  const stats = getPlantStats(plant);
  const logs = [...(plant.logs || [])].sort((a, b) => b.date.localeCompare(a.date));
  const photos = logs.filter((log) => hasPhoto(log));
  const isActive = getPlantStatus(plant) === 'Active';
  panel.innerHTML = `
    <div class="profile-header ${isActive ? '' : 'profile-completed'}">
      <div>
        <p class="eyebrow">${plant.growType} · ${plant.location}</p>
        <h3>${escapeHtml(plant.name)} ${isActive ? '' : `<span class="badge ${getStageClass(stats.stage)} completed-flag">${stats.stage}</span>`}</h3>
        <p>${plantCountText(plant)}. ${escapeHtml(plant.notes || 'No notes yet.')}</p>
        ${isActive ? '' : `<p class="small-note">In the Post-Harvest workflow (${STATUS_LABELS[plant.status]}). Manage drying, curing, and finished details in the Post-Harvest tab.${plant.harvestDate ? ` Harvest date ${formatDate(plant.harvestDate)}.` : ''}</p>`}
      </div>
      <div class="profile-actions">
        ${isActive ? '<button class="primary-button" type="button" id="mark-harvested-selected">Mark Harvested</button>' : ''}
        <button class="secondary-button" type="button" id="edit-selected">Edit</button>
        ${isActive ? '' : '<button class="secondary-button" type="button" id="return-active-selected">Return to Active</button>'}
        ${plant.status === 'archived' ? '' : '<button class="secondary-button" type="button" id="archive-selected">Archive</button>'}
        <button class="danger-button" type="button" id="delete-selected">Delete plant</button>
      </div>
    </div>
    <div class="kpi-grid">
      ${profileMetric('Stage', `<span class="badge ${getStageClass(stats.stage)}">${stats.stage}</span>`)}
      ${profileMetric('Days in veg', stats.vegLabel)}
      ${profileMetric('Days in flower', stats.flowerLabel)}
      ${profileMetric('Projected harvest', formatDate(stats.harvestDate))}
    </div>
    <div class="metric-row"><span>Plant age (from seed / start)</span><strong>${stats.ageLabel}</strong></div>
    <div class="metric-row"><span>Seed / start date</span><strong>${formatDate(plant.startDate)}</strong></div>
    <div class="metric-row"><span>Veg start</span><strong>${plant.vegStartDate ? formatDate(plant.vegStartDate) : 'Not set — veg not started'}</strong></div>
    <div class="metric-row"><span>Flower start (actual flip)</span><strong>${stats.actualFlowerStart ? formatDate(stats.actualFlowerStart) : 'Not started'}</strong></div>
    <div class="metric-row"><span>Planned flower flip</span><strong>${stats.plannedFlipDate ? `${formatDate(stats.plannedFlipDate)} (planned only)` : 'Not set'}</strong></div>
    ${plant.harvestDate ? `<div class="metric-row"><span>Harvest date</span><strong>${formatDate(plant.harvestDate)}</strong></div>` : ''}
    <div class="metric-row"><span>Progress to harvest</span><strong>${stats.progress === null ? (stats.stage === 'Veg' || stats.stage === 'Seedling' ? 'Starts at flip (days only in veg)' : 'Not enough dates') : stats.progress + '%'}</strong></div>
    ${stats.progress === null ? '' : `<div class="progress-track"><div class="progress-fill" style="width:${stats.progress}%"></div></div>`}
    ${profileComplianceSection(plant)}
    <h3 style="margin-top: var(--space-6)">Recent logs</h3>
    <div class="journal-list">${logs.slice(0, 5).map(logItemHtml).join('') || '<p>No logs yet.</p>'}</div>
    <h3 style="margin-top: var(--space-6)">Photo timeline</h3>
    <div class="timeline-gallery">${photos.map(photoTileHtml).join('') || '<p>No photos yet.</p>'}</div>
  `;
  $('#edit-selected').addEventListener('click', () => openPlantModal(plant));
  $('#delete-selected').addEventListener('click', () => deletePlant(plant.id));
  $('#mark-harvested-selected')?.addEventListener('click', () => markHarvested(plant.id));
  $('#return-active-selected')?.addEventListener('click', () => returnToActive(plant.id));
  $('#archive-selected')?.addEventListener('click', () => archivePlant(plant.id));
  bindProfileComplianceControls(plant);
}

// Compliance + plant-tagging panel shown inside a plant profile. Applies to
// active and post-harvest records so patient link and tag history follow the
// plant through the whole workflow.
function profileComplianceSection(plant) {
  const issues = plantComplianceIssues(plant);
  const ready = isComplianceReady(plant);
  const patientOptions = ['<option value="">— Unassigned —</option>']
    .concat(getTaggablePatients().map((pt) => `<option value="${pt.id}" ${pt.id === plant.patientId ? 'selected' : ''}>${escapeHtml(pt.alias || 'Unnamed')}${pt.active ? '' : ' (inactive)'}</option>`))
    .join('');
  const stageOptions = COMPLIANCE_STAGES
    .map((s) => `<option value="${s}" ${s === plant.complianceStage ? 'selected' : ''}>${titleCase(s)}</option>`)
    .join('');
  const warning = !ready
    ? `<div class="compliance-warning" role="status"><strong>Compliance warning:</strong> ${issues.map(escapeHtml).join(' · ')}</div>`
    : (issues.length
      ? `<div class="compliance-ok" role="status"><strong>Compliance ready</strong> — patient, certification ID, and tag are in place. Remaining: ${issues.map(escapeHtml).join(' · ')}.</div>`
      : '<div class="compliance-ok" role="status"><strong>Compliance ready</strong> — patient, certification ID, and tag are in place.</div>');
  const tagPreview = plant.tagTextSnapshot
    ? `<pre class="tag-preview" aria-label="Generated plant tag">${escapeHtml(plant.tagTextSnapshot)}</pre>`
    : '<p class="small-note">No tag generated yet. Assign a patient and generate a tag to build a printable tag block.</p>';
  return `
    <section class="compliance-panel" aria-label="Compliance and tagging">
      <div class="section-heading compact">
        <h3 style="margin:0">Compliance & tagging</h3>
        <span class="badge ${ready ? 'tag-attached' : 'tag-warn'}">Tag: ${titleCase(plant.tagStatus)}${plant.tagAttached ? ' · attached' : ''}</span>
      </div>
      <p class="small-note">${escapeHtml(COMPLIANCE_DISCLAIMER)}</p>
      ${warning}
      <div class="ph-fields">
        <label class="ph-field"><span>Assigned patient</span>
          <select data-compliance-select="patient">${patientOptions}</select>
        </label>
        <label class="ph-field"><span>Compliance stage</span>
          <select data-compliance-select="stage">${stageOptions}</select>
        </label>
        <label class="ph-field"><span>Plant code</span>
          <input data-compliance-field="internalPlantCode" type="text" value="${escapeHtml(plant.internalPlantCode)}" placeholder="e.g., BG-BLUE-1234" />
        </label>
        <label class="ph-field"><span>Cultivar</span>
          <input data-compliance-field="cultivar" type="text" value="${escapeHtml(plant.cultivar)}" placeholder="Strain / cultivar" />
        </label>
        <label class="ph-field"><span>Area / room</span>
          <input data-compliance-area type="text" value="${escapeHtml(plant.areaOrRoom)}" placeholder="e.g., Flower Room A" />
        </label>
        <label class="ph-field"><span>Certification ID (snapshot)</span>
          <input type="text" value="${escapeHtml(plant.patientCertificationId)}" readonly />
        </label>
        <label class="ph-field ph-field-wide"><span>Compliance notes</span>
          <textarea data-compliance-field="complianceNotes" rows="2" placeholder="Inspection notes, tag placement, count context…">${escapeHtml(plant.complianceNotes)}</textarea>
        </label>
      </div>
      ${tagPreview}
      <div class="button-row ph-actions">
        <button class="primary-button" type="button" data-tag-action="generate">Generate Tag</button>
        <button class="secondary-button" type="button" data-tag-action="copy">Copy Tag Text</button>
        <button class="secondary-button" type="button" data-tag-action="print">Print Tag</button>
        <button class="secondary-button" type="button" data-tag-action="attach">Mark Attached</button>
        <button class="secondary-button" type="button" data-tag-action="replace">Replace Tag</button>
      </div>
    </section>`;
}

function bindProfileComplianceControls(plant) {
  const panel = $('#profile-panel');
  if (!panel) return;
  panel.querySelector('[data-compliance-select="patient"]')?.addEventListener('change', (e) => assignPatientToPlant(plant.id, e.target.value));
  panel.querySelector('[data-compliance-select="stage"]')?.addEventListener('change', (e) => changeComplianceStage(plant.id, e.target.value));
  const areaField = panel.querySelector('[data-compliance-area]');
  areaField?.addEventListener('change', (e) => changePlantArea(plant.id, e.target.value.trim()));
  panel.querySelectorAll('[data-compliance-field]').forEach((el) => {
    el.addEventListener('change', () => saveComplianceField(plant.id, el.dataset.complianceField, el.value));
  });
  const tagActions = {
    generate: generateTag,
    copy: copyTagText,
    print: printTag,
    attach: markTagAttached,
    replace: replaceTag,
  };
  panel.querySelectorAll('[data-tag-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const handler = tagActions[btn.dataset.tagAction];
      if (handler) handler(plant.id);
    });
  });
}

function profileMetric(label, value) {
  return `<article class="panel kpi"><p class="eyebrow">${label}</p><strong>${value}</strong></article>`;
}

// ---------------------------------------------------------------------------
// Post-harvest workflow rendering (Harvest → Drying → Curing → Finished)
// ---------------------------------------------------------------------------

function phInput(plant, field, label, type = 'text', placeholder = '') {
  const value = escapeHtml(String(plant[field] ?? ''));
  return `<label class="ph-field"><span>${label}</span>
    <input data-ph-input data-plant="${plant.id}" data-field="${field}" type="${type}" value="${value}" placeholder="${escapeHtml(placeholder)}" />
  </label>`;
}

function phTextarea(plant, field, label, placeholder = '') {
  return `<label class="ph-field ph-field-wide"><span>${label}</span>
    <textarea data-ph-input data-plant="${plant.id}" data-field="${field}" rows="2" placeholder="${escapeHtml(placeholder)}">${escapeHtml(String(plant[field] ?? ''))}</textarea>
  </label>`;
}

function cureLengthLabel(plant) {
  const start = plant.cureStartDate;
  const end = plant.cureEndDate || plant.finishedDate;
  if (!start || !end) return '—';
  const days = Math.max(0, Math.round((parseDate(end) - parseDate(start)) / DAY_MS));
  return `${days} day${days === 1 ? '' : 's'}`;
}

function phCard(plant, bodyHtml, actionsHtml) {
  return `
    <article class="panel ph-card" data-ph-card="${plant.id}">
      <div class="ph-card-head">
        <div>
          <h4>${escapeHtml(plant.name)}</h4>
          <p class="eyebrow">${escapeHtml(plant.name)} · ${plantCountText(plant)} · ${plant.growType}</p>
        </div>
        <span class="badge ${getStageClass(STATUS_LABELS[plant.status])}">${STATUS_LABELS[plant.status]}</span>
      </div>
      <div class="ph-fields">${bodyHtml}</div>
      <div class="button-row ph-actions">${actionsHtml}</div>
    </article>`;
}

function renderPostHarvest() {
  const container = $('#ph-section');
  if (!container) return;
  const tab = postHarvestTab;
  const plants = plantsByStatus(tab);
  const emptyCopy = {
    harvest: 'No harvested batches yet. Use “Mark Harvested” on an active plant to move it here.',
    drying: 'Nothing drying right now. Move a harvested batch into drying to track temperature and RH.',
    curing: 'Nothing curing right now. Start curing a dried batch to track container, target RH, and burps.',
    finished: 'No finished batches yet. Mark a curing batch finished when it is jarred and done.',
  };
  if (!plants.length) {
    container.innerHTML = `<div class="empty-state ph-empty"><p>${emptyCopy[tab]}</p></div>`;
    return;
  }

  let cards;
  if (tab === 'harvest') {
    cards = plants.map((plant) => phCard(
      plant,
      phInput(plant, 'harvestDate', 'Harvest date', 'date')
        + phInput(plant, 'count', 'Plant count', 'number')
        + phInput(plant, 'wetWeight', 'Wet weight', 'text', 'e.g., 1200 g')
        + phTextarea(plant, 'postHarvestNotes', 'Notes', 'Trim, wet trim vs dry trim, room conditions…'),
      '<button class="primary-button" type="button" data-ph-action="drying" data-plant="' + plant.id + '">Move to Drying</button>'
        + '<button class="secondary-button" type="button" data-ph-action="back-active" data-plant="' + plant.id + '">Back to Active</button>',
    )).join('');
  } else if (tab === 'drying') {
    cards = plants.map((plant) => phCard(
      plant,
      phInput(plant, 'dryStartDate', 'Dry start', 'date')
        + phInput(plant, 'dryEndDate', 'Expected dry end', 'date')
        + phInput(plant, 'dryingTemp', 'Temperature', 'text', 'e.g., 62°F')
        + phInput(plant, 'dryingRH', 'Humidity (RH)', 'text', 'e.g., 58%')
        + phTextarea(plant, 'dryingMethod', 'Airflow / method notes', 'Hang dry, rack, fan placement, airflow…'),
      '<button class="primary-button" type="button" data-ph-action="curing" data-plant="' + plant.id + '">Start Curing</button>'
        + '<button class="secondary-button" type="button" data-ph-action="back-harvest" data-plant="' + plant.id + '">Back to Harvest</button>',
    )).join('');
  } else if (tab === 'curing') {
    cards = plants.map((plant) => phCard(
      plant,
      phInput(plant, 'cureStartDate', 'Cure start', 'date')
        + phInput(plant, 'curingContainer', 'Container type', 'text', 'e.g., glass jars, grove bags')
        + phInput(plant, 'curingTargetRH', 'Target RH', 'text', 'e.g., 62%')
        + phInput(plant, 'burpSchedule', 'Burp schedule', 'text', 'e.g., 2×/day week 1')
        + phTextarea(plant, 'postHarvestNotes', 'Cure notes', 'Aroma, feel, RH readings…'),
      '<button class="primary-button" type="button" data-ph-action="finished" data-plant="' + plant.id + '">Mark Finished</button>'
        + '<button class="secondary-button" type="button" data-ph-action="back-drying" data-plant="' + plant.id + '">Back to Drying</button>',
    )).join('');
  } else {
    cards = [...plants]
      .sort((a, b) => String(b.finishedDate || '').localeCompare(String(a.finishedDate || '')))
      .map((plant) => phCard(
        plant,
        phInput(plant, 'finishedDate', 'Finished date', 'date')
          + phInput(plant, 'dryWeight', 'Final dry weight', 'text', 'e.g., 285 g')
          + `<label class="ph-field"><span>Total cure length</span><input type="text" value="${cureLengthLabel(plant)}" readonly /></label>`
          + phTextarea(plant, 'postHarvestNotes', 'Storage notes', 'Storage location, jar count, boveda size…'),
        '<button class="secondary-button" type="button" data-ph-action="back-curing" data-plant="' + plant.id + '">Back to Curing</button>'
          + '<button class="secondary-button" type="button" data-ph-action="reopen" data-plant="' + plant.id + '">Reopen</button>',
      )).join('');
  }
  container.innerHTML = cards;
  bindPostHarvestControls();
}

function bindPostHarvestControls() {
  $$('#ph-section [data-ph-input]').forEach((el) => {
    el.addEventListener('change', () => {
      const plant = state.plants.find((item) => item.id === el.dataset.plant);
      if (!plant) return;
      const field = el.dataset.field;
      plant[field] = field === 'count' ? Math.max(1, Number(el.value || 1)) : el.value;
      // A harvest date typed in here is the trigger that files the record.
      if (field === 'harvestDate') syncHarvestStatus(plant);
      saveState();
      setAutosaveStatus('Post-harvest details saved', 'saved');
              renderHarvestArchive();
    });
  });
  const actions = {
    drying: moveToDrying,
    curing: startCuring,
    finished: markFinished,
    reopen: reopenPlant,
    'back-active': (id) => movePlantBack(id, 'active'),
    'back-harvest': (id) => movePlantBack(id, 'harvest'),
    'back-drying': (id) => movePlantBack(id, 'drying'),
    'back-curing': (id) => movePlantBack(id, 'curing'),
  };
  $$('#ph-section [data-ph-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const handler = actions[button.dataset.phAction];
      if (handler) handler(button.dataset.plant);
    });
  });
}

// ---------------------------------------------------------------------------
// Compliance view rendering (Patients · Inspection · Log)
// ---------------------------------------------------------------------------

function selectComplianceTab(name) {
  complianceTab = name;
  $$('.compliance-subtab').forEach((tab) => {
    const selected = tab.dataset.complianceTab === name;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', selected ? 'true' : 'false');
    tab.tabIndex = selected ? 0 : -1;
  });
  ['patients', 'inspection', 'log'].forEach((key) => {
    const panel = $(`#compliance-panel-${key}`);
    if (panel) panel.hidden = key !== name;
  });
  renderCompliance();
}

function setupComplianceTabs() {
  const tabs = $$('.compliance-subtab');
  if (!tabs.length) return;
  tabs.forEach((tab) => tab.addEventListener('click', () => selectComplianceTab(tab.dataset.complianceTab)));
  attachTablistKeys(tabs, selectComplianceTab);
}

function renderCompliance() {
  if (!$('#compliance-view')) return;
  renderPatientRegistry();
  renderInspection();
  renderComplianceLog();
}

function renderPatientRegistry() {
  const list = $('#patient-list');
  if (!list) return;
  const patients = getPatients();
  if (!patients.length) {
    list.innerHTML = '<div class="empty-state ph-empty"><p>No patients yet. Add a patient record to assign plants and generate compliant tags.</p></div>';
    return;
  }
  list.innerHTML = patients.map((pt) => {
    const assigned = state.plants.filter((p) => p.patientId === pt.id).length;
    return `
      <article class="panel patient-card" data-patient-card="${pt.id}">
        <div class="ph-card-head">
          <div>
            <h4>${escapeHtml(pt.alias || 'Unnamed patient')}</h4>
            <p class="eyebrow">Cert ID ${escapeHtml(pt.certificationId || '—')} · ${assigned} plant${assigned === 1 ? '' : 's'} assigned</p>
          </div>
          <span class="badge ${pt.active ? 'tag-attached' : 'stage-finished'}">${pt.active ? 'Active' : 'Inactive'}</span>
        </div>
        <div class="patient-meta">
          <span>Cert: ${formatDate(pt.issueDate) || '—'} → ${formatDate(pt.expirationDate) || '—'}</span>
          <span>Designation: ${formatDate(pt.designationStart) || '—'} → ${formatDate(pt.designationEnd) || '—'}</span>
        </div>
        ${pt.notes ? `<p class="small-note">${escapeHtml(pt.notes)}</p>` : ''}
        <div class="button-row ph-actions">
          <button class="secondary-button" type="button" data-patient-action="edit" data-patient="${pt.id}">Edit</button>
          <button class="secondary-button" type="button" data-patient-action="toggle" data-patient="${pt.id}">${pt.active ? 'Deactivate' : 'Activate'}</button>
          <button class="danger-button" type="button" data-patient-action="delete" data-patient="${pt.id}">Delete</button>
        </div>
      </article>`;
  }).join('');
  const actions = { edit: editPatient, toggle: togglePatientActive, delete: deletePatientRecord };
  list.querySelectorAll('[data-patient-action]').forEach((btn) => {
    btn.addEventListener('click', () => actions[btn.dataset.patientAction]?.(btn.dataset.patient));
  });
}

// Inspection-ready view: active immature/mature plants with quick filters and
// clear warnings for anything missing patient, certification, or tag data.
function inspectionPlants() {
  return state.plants.filter((p) => (p.status || 'active') === 'active');
}

function renderInspection() {
  const body = $('#inspection-table-body');
  if (!body) return;
  let plants = inspectionPlants();
  const f = inspectionFilter;
  if (f === 'missing-patient') plants = plants.filter((p) => !p.patientId);
  else if (f === 'missing-cert') plants = plants.filter((p) => !p.patientCertificationId);
  else if (f === 'missing-tag') plants = plants.filter((p) => !p.tagTextSnapshot);
  else if (f === 'tag-not-attached') plants = plants.filter((p) => !p.tagAttached);
  else if (f === 'mature') plants = plants.filter((p) => p.complianceStage === 'mature');
  else if (f === 'immature') plants = plants.filter((p) => p.complianceStage === 'immature');
  if (!plants.length) {
    body.innerHTML = '<tr><td colspan="8">No plants match this filter.</td></tr>';
    return;
  }
  body.innerHTML = plants.map((p) => {
    const issues = plantComplianceIssues(p);
    const alias = patientAliasFor(p);
    const lastUpdated = p.movedAt || p.tagAttachedAt || p.tagPrintedAt || p.harvestedAt || '';
    const warn = (cond) => (cond ? ' class="cell-warn"' : '');
    return `
      <tr class="${issues.length ? 'inspection-row-warn' : ''}">
        <td>${escapeHtml(p.internalPlantCode) || '<span class="cell-warn">—</span>'}</td>
        <td${warn(!alias)}>${escapeHtml(alias) || 'Unassigned'}</td>
        <td${warn(!p.patientCertificationId)}>${escapeHtml(p.patientCertificationId) || 'Missing'}</td>
        <td>${escapeHtml(p.cultivar || p.name)}</td>
        <td><span class="badge stage-${escapeHtml((p.complianceStage || 'immature'))}">${titleCase(p.complianceStage || 'immature')}</span></td>
        <td>${escapeHtml(p.areaOrRoom || p.location || '—')}</td>
        <td${warn(!p.tagTextSnapshot || !p.tagAttached)}>${titleCase(p.tagStatus)}${p.tagAttached ? ' · attached' : (p.tagTextSnapshot ? '' : ' · none')}</td>
        <td>${lastUpdated ? formatTimestamp(lastUpdated) : '—'}</td>
      </tr>`;
  }).join('');
}

function renderComplianceLog() {
  const body = $('#compliance-log-body');
  if (!body) return;
  populateComplianceLogFilters();
  let logs = [...getComplianceLogs()].reverse();
  const f = complianceLogFilters;
  if (f.plant !== 'all') logs = logs.filter((l) => l.plantId === f.plant);
  if (f.patient !== 'all') logs = logs.filter((l) => l.patientId === f.patient);
  if (f.eventType !== 'all') logs = logs.filter((l) => l.eventType === f.eventType);
  if (f.stage !== 'all') logs = logs.filter((l) => l.stage === f.stage);
  if (f.date) logs = logs.filter((l) => (l.timestamp || '').slice(0, 10) === f.date);
  if (!logs.length) {
    body.innerHTML = '<tr><td colspan="7">No compliance events match these filters.</td></tr>';
    return;
  }
  const plantCode = (id) => state.plants.find((p) => p.id === id)?.internalPlantCode || state.plants.find((p) => p.id === id)?.name || '—';
  const patientAlias = (id) => getPatientById(id)?.alias || '—';
  body.innerHTML = logs.map((l) => `
    <tr>
      <td>${formatTimestamp(l.timestamp)}</td>
      <td>${escapeHtml(plantCode(l.plantId))}</td>
      <td>${escapeHtml(patientAlias(l.patientId))}</td>
      <td>${escapeHtml(titleCase(l.eventType))}</td>
      <td>${escapeHtml(l.oldValue || '—')}</td>
      <td>${escapeHtml(l.newValue || '—')}</td>
      <td>${escapeHtml(l.notes || '')}</td>
    </tr>`).join('');
}

function populateComplianceLogFilters() {
  const plantSel = $('#log-filter-plant');
  const patientSel = $('#log-filter-patient');
  const eventSel = $('#log-filter-event');
  const stageSel = $('#log-filter-stage');
  if (plantSel) {
    plantSel.innerHTML = '<option value="all">All plants</option>'
      + state.plants.map((p) => `<option value="${p.id}" ${p.id === complianceLogFilters.plant ? 'selected' : ''}>${escapeHtml(p.internalPlantCode || p.name)}</option>`).join('');
  }
  if (patientSel) {
    patientSel.innerHTML = '<option value="all">All patients</option>'
      + getPatients().map((pt) => `<option value="${pt.id}" ${pt.id === complianceLogFilters.patient ? 'selected' : ''}>${escapeHtml(pt.alias || 'Unnamed')}</option>`).join('');
  }
  if (eventSel && !eventSel.dataset.populated) {
    eventSel.innerHTML = '<option value="all">All events</option>'
      + COMPLIANCE_EVENT_TYPES.map((ev) => `<option value="${ev}">${titleCase(ev)}</option>`).join('');
    eventSel.dataset.populated = 'true';
  }
  if (stageSel && !stageSel.dataset.populated) {
    stageSel.innerHTML = '<option value="all">All stages</option>'
      + COMPLIANCE_STAGES.map((s) => `<option value="${s}">${titleCase(s)}</option>`).join('');
    stageSel.dataset.populated = 'true';
  }
}

function setupComplianceControls() {
  const disclaimer = $('#compliance-disclaimer');
  if (disclaimer) disclaimer.textContent = COMPLIANCE_DISCLAIMER;
  $('#patient-form')?.addEventListener('submit', savePatientFromForm);
  $('#clear-patient-form')?.addEventListener('click', clearPatientForm);
  $('#generate-cert-id')?.addEventListener('click', generatePatientCertId);
  $('#export-compliance-csv')?.addEventListener('click', exportComplianceCSV);
  $$('[data-inspection-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      inspectionFilter = btn.dataset.inspectionFilter;
      $$('[data-inspection-filter]').forEach((b) => b.classList.toggle('active', b === btn));
      renderInspection();
    });
  });
  $('#log-filter-plant')?.addEventListener('change', (e) => { complianceLogFilters.plant = e.target.value; renderComplianceLog(); });
  $('#log-filter-patient')?.addEventListener('change', (e) => { complianceLogFilters.patient = e.target.value; renderComplianceLog(); });
  $('#log-filter-event')?.addEventListener('change', (e) => { complianceLogFilters.eventType = e.target.value; renderComplianceLog(); });
  $('#log-filter-stage')?.addEventListener('change', (e) => { complianceLogFilters.stage = e.target.value; renderComplianceLog(); });
  $('#log-filter-date')?.addEventListener('change', (e) => { complianceLogFilters.date = e.target.value; renderComplianceLog(); });
  $('#log-filter-reset')?.addEventListener('click', () => {
    complianceLogFilters = { plant: 'all', patient: 'all', eventType: 'all', stage: 'all', date: '' };
    ['#log-filter-plant', '#log-filter-patient', '#log-filter-event', '#log-filter-stage'].forEach((sel) => { const el = $(sel); if (el) el.value = 'all'; });
    const dateEl = $('#log-filter-date'); if (dateEl) dateEl.value = '';
    renderComplianceLog();
  });
}

function renderPlantOptions() {
  const options = state.plants.map((plant) => `<option value="${plant.id}">${escapeHtml(plant.name)}</option>`).join('');
  $('#log-plant').innerHTML = options;
  $('#journal-filter').innerHTML = `<option value="all">All plants</option>${options}`;
}

function renderJournal() {
  const filter = $('#journal-filter')?.value || 'all';
  const allLogs = state.plants.flatMap((plant) => (plant.logs || []).map((log) => ({ ...log, plantId: plant.id, plantName: plant.name })));
  const logs = allLogs
    .filter((log) => filter === 'all' || log.plantId === filter)
    .sort((a, b) => b.date.localeCompare(a.date));
  $('#journal-list').innerHTML = logs.map(logItemHtml).join('') || '<p>No journal entries yet.</p>';
}

/* ---------- Vlog (Build 11 redesign) ---------- */
let vlogStatusFilter = 'All';
let vlogQuery = '';
let vlogEditId = '';

function getPlantName(plantId) {
  return state.plants.find((plant) => plant.id === plantId)?.name || '';
}

function vlogStatusOf(entry) {
  return VLOG_STATUSES.includes(entry && entry.status) ? entry.status : 'Idea';
}

function getVlogEntries() {
  const q = vlogQuery.trim().toLowerCase();
  return (state.vlogEntries || [])
    .map((entry, i) => ({ ...entry, plantName: getPlantName(entry.plantId), _i: i, _status: vlogStatusOf(entry) }))
    .filter((entry) => vlogStatusFilter === 'All' || entry._status === vlogStatusFilter)
    .filter((entry) => !q || [entry.hook, entry.type, entry.growth, entry.notes, entry.plantName, entry.mediaName, entry._status].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a._i - b._i);
}

function renderVlogEntries() {
  const list = $('#vlog-list');
  if (!list) return;
  const all = state.vlogEntries || [];
  const chips = $('#vlog-chips');
  if (chips) {
    chips.innerHTML = ['All', ...VLOG_STATUSES].map((st) => `<button type="button" class="txn-chip ${vlogStatusFilter === st ? 'on' : ''}" data-vlog-filter="${st}" aria-pressed="${vlogStatusFilter === st}">${st}${st === 'All' ? ` ${all.length}` : ''}</button>`).join('');
  }
  const entries = getVlogEntries();
  list.innerHTML = entries.length ? entries.map(vlogItemHtml).join('') : `<div class="m-card"><div class="m-row"><div class="m-grow"><div class="m-t">${all.length ? 'No entries match' : 'No vlog entries yet'}</div><div class="m-s vlog-empty-sub">${all.length ? 'Try another search or filter.' : 'Tap + New entry above.'}</div></div></div></div>`;
}

function vlogItemHtml(entry) {
  const thumb = thumbSrc(entry);
  const media = thumb
    ? `<img src="${thumb}" alt="" loading="lazy" />`
    : `<span class="vlog-ph-icon" aria-hidden="true">${entry.mediaKind === 'image' ? '◎' : '▶'}</span>`;
  const sub = [entry.date ? formatShort(entry.date) : '', entry.type].filter(Boolean).join(' · ');
  return `
    <article class="vlog-card" data-vlog-open="${escapeHtml(entry.id)}" role="button" tabindex="0">
      <div class="vlog-media">${media}</div>
      <div class="vlog-body">
        <div class="vlog-top"><h3>${escapeHtml(entry.hook || entry.type || 'Vlog entry')}</h3><span class="vlog-pill s-${entry._status.toLowerCase()}">${entry._status}</span></div>
        <p class="vlog-sub">${escapeHtml(sub)}</p>
        ${entry.plantName ? `<span class="vlog-chip">🌿 ${escapeHtml(entry.plantName)}</span>` : ''}
        ${entry.growth ? `<p class="vlog-growth">${escapeHtml(entry.growth)}</p>` : ''}
      </div>
    </article>`;
}

function vlogPlantOptionsHtml(selected) {
  const opts = state.plants.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p.location ? ` · ${escapeHtml(p.location)}` : ''}</option>`);
  return `<option value="">No plant (general)</option>${opts.join('')}`;
}

function renderVlogPlantChips() {
  const box = $('#vlog-plant-chips');
  if (!box) return;
  const sel = $('#vlog-plant').value;
  const shown = state.plants.slice(0, 3);
  const rest = state.plants.length - shown.length;
  box.innerHTML = shown.map((p) => `<button type="button" class="vlog-chip pick ${sel === p.id ? 'on' : ''}" data-vlog-pick="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`).join('')
    + (rest > 0 ? `<button type="button" class="vlog-chip pick" data-vlog-more>+ ${rest} more</button>` : '');
}

function openVlogSheet(id) {
  const entry = id ? (state.vlogEntries || []).find((e) => e.id === id) : null;
  vlogEditId = entry ? entry.id : '';
  const form = $('#vlog-form');
  form.reset();
  $('#vlog-plant').innerHTML = vlogPlantOptionsHtml();
  $('#vlog-id').value = vlogEditId;
  $('#vlog-sheet-title').textContent = entry ? 'Edit entry' : 'New entry';
  $('#vlog-save').textContent = entry ? 'Save changes' : 'Save vlog entry';
  $('#vlog-delete').hidden = !entry;
  $('#vlog-media-note').textContent = entry && entry.mediaName ? `Current: ${entry.mediaName}. Choose a file only to replace it.` : '';
  $('#vlog-date').value = entry ? (entry.date || toInputDate(new Date())) : toInputDate(new Date());
  $('#vlog-status').value = entry ? vlogStatusOf(entry) : 'Idea';
  if (entry) {
    if (!entry.plantId || state.plants.some((p) => p.id === entry.plantId)) $('#vlog-plant').value = entry.plantId || '';
    const typeSel = $('#vlog-type');
    if (entry.type && ![...typeSel.options].some((o) => o.value === entry.type)) typeSel.add(new Option(entry.type, entry.type));
    typeSel.value = entry.type || typeSel.options[0].value;
    $('#vlog-hook').value = entry.hook || '';
    $('#vlog-growth').value = entry.growth || '';
    $('#vlog-notes').value = entry.notes || '';
    $('#vlog-private').value = entry.privateNotes || '';
  }
  $('#vlog-error').hidden = true;
  renderVlogPlantChips();
  $('#vlog-sheet').showModal();
}

function closeVlogSheet() {
  clearFormDrafts($('#vlog-form'));
  if ($('#vlog-sheet').open) $('#vlog-sheet').close();
}

function bindVlog() {
  $('#vlog-form')?.addEventListener('submit', saveVlogEntry);
  $('#vlog-new')?.addEventListener('click', () => openVlogSheet(''));
  $('#vlog-close')?.addEventListener('click', closeVlogSheet);
  $('#vlog-cancel')?.addEventListener('click', closeVlogSheet);
  $('#vlog-sheet')?.addEventListener('cancel', () => clearFormDrafts($('#vlog-form')));
  $('#vlog-delete')?.addEventListener('click', () => { const id = vlogEditId; closeVlogSheet(); deleteVlogEntry(id); });
  $('#vlog-search')?.addEventListener('input', (e) => { vlogQuery = e.target.value; renderVlogEntries(); });
  $('#vlog-plant')?.addEventListener('change', renderVlogPlantChips);
  $('#vlog-plant-chips')?.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-vlog-pick]');
    if (pick) { $('#vlog-plant').value = $('#vlog-plant').value === pick.dataset.vlogPick ? '' : pick.dataset.vlogPick; renderVlogPlantChips(); return; }
    if (e.target.closest('[data-vlog-more]')) {
      const sel = $('#vlog-plant');
      sel.focus();
      try { if (sel.showPicker) sel.showPicker(); } catch (err) { /* iOS opens the picker on tap */ }
    }
  });
  $('#vlog-chips')?.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-vlog-filter]');
    if (chip) { vlogStatusFilter = chip.dataset.vlogFilter; renderVlogEntries(); }
  });
  const list = $('#vlog-list');
  list?.addEventListener('click', (e) => { const c = e.target.closest('[data-vlog-open]'); if (c) openVlogSheet(c.dataset.vlogOpen); });
  list?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = e.target.closest('[data-vlog-open]');
    if (c) { e.preventDefault(); openVlogSheet(c.dataset.vlogOpen); }
  });
}

function logItemHtml(log) {
  const name = log.plantName ? `<p>${escapeHtml(log.plantName)}</p>` : '';
  return `
    <article class="journal-item">
      <div>
        <strong>${log.type} · ${formatDate(log.date)}</strong>
        ${name}
        <p>${escapeHtml(log.notes || 'No notes.')}</p>
        ${log.height ? `<p>Height: ${log.height}"</p>` : ''}
        ${log.feed ? `<p>Feed: ${escapeHtml(log.feed)}</p>` : ''}
        ${log.id ? `<p class="log-actions"><button type="button" class="link-button" data-log-edit="${escapeHtml(log.id)}">Edit</button><button type="button" class="link-button danger" data-log-del="${escapeHtml(log.id)}">Delete</button></p>` : ''}
      </div>
      ${hasPhoto(log) ? photoImgTag(log, `Photo from ${formatDate(log.date)}`, 'journal-thumb') : ''}
    </article>
  `;
}

function photoImgTag(log, alt, className = '') {
  const src = photoSrc(log);
  if (!src) return `<p class="small-note">This photo is saved on the device but could not be loaded.</p>`;
  const cls = className ? ` class="${className}"` : '';
  return `<img${cls} src="${src}" alt="${alt}" loading="lazy" />`;
}

function photoTileHtml(log) {
  return `
    <figure class="photo-tile">
      ${photoImgTag(log, `${log.type} photo from ${formatDate(log.date)}`)}
      <span>${formatDate(log.date)} · ${log.type}</span>
    </figure>
  `;
}

function renderBreedingProjects() {
  const list = $('#breeding-list');
  if (!list) return;
  const projects = state.breedingProjects || [];
  list.innerHTML = projects.map((project) => `
    <article class="breeding-project">
      <div>
        <strong>${escapeHtml(project.name)}</strong>
        <p>${escapeHtml(project.crop)} · ${escapeHtml(project.generation)} · ${escapeHtml(project.status)}</p>
        <p class="pedigree-line">${escapeHtml(project.mother || 'Unknown mother')} × ${escapeHtml(project.father || 'Unknown father')}</p>
        <p>${escapeHtml(project.traits || 'No target traits recorded.')}</p>
        <p class="eyebrow">Seed lot ${escapeHtml(project.seedLot || 'not assigned')}</p>
      </div>
      <div class="button-row">
        <button class="secondary-button" type="button" data-edit-breeding="${project.id}">Edit</button>
        <button class="danger-button" type="button" data-delete-breeding="${project.id}">Delete</button>
      </div>
    </article>
  `).join('') || `
    <div class="empty-state">
      <div class="empty-icon">⌁</div>
      <h3>No breeding projects yet</h3>
      <p>Add a project to track crosses, parentage, seed lots, and selections.</p>
    </div>
  `;
  $$('[data-edit-breeding]').forEach((button) => button.addEventListener('click', () => editBreedingProject(button.dataset.editBreeding)));
  $$('[data-delete-breeding]').forEach((button) => button.addEventListener('click', () => deleteBreedingProject(button.dataset.deleteBreeding)));
}

function renderHeightChart() {
  const canvas = $('#height-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = getCss('--color-surface-2');
  ctx.fillRect(0, 0, width, height);
  const plant = state.plants.find((item) => item.id === selectedPlantId) || state.plants[0];
  const points = (plant?.logs || [])
    .filter((log) => log.height)
    .sort((a, b) => a.date.localeCompare(b.date));
  ctx.fillStyle = getCss('--color-text');
  ctx.font = '18px -apple-system, system-ui, sans-serif';
  ctx.fillText(plant ? `${plant.name} height over time` : 'Height over time', 24, 32);
  ctx.strokeStyle = getCss('--color-border');
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const y = 64 + i * 48;
    ctx.beginPath();
    ctx.moveTo(56, y);
    ctx.lineTo(width - 24, y);
    ctx.stroke();
  }
  if (points.length < 2) {
    ctx.fillStyle = getCss('--color-text-muted');
    ctx.font = '15px -apple-system, system-ui, sans-serif';
    ctx.fillText('Add two or more height logs to draw a chart.', 24, 82);
    return;
  }
  const maxHeight = Math.max(...points.map((p) => Number(p.height))) || 1;
  const minTime = parseDate(points[0].date).getTime();
  const maxTime = parseDate(points[points.length - 1].date).getTime();
  const span = Math.max(DAY_MS, maxTime - minTime);
  const mapX = (date) => 56 + ((parseDate(date).getTime() - minTime) / span) * (width - 96);
  const mapY = (value) => height - 48 - (Number(value) / maxHeight) * (height - 112);
  ctx.strokeStyle = getCss('--color-primary');
  ctx.lineWidth = 4;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = mapX(point.date);
    const y = mapY(point.height);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  points.forEach((point) => {
    const x = mapX(point.date);
    const y = mapY(point.height);
    ctx.fillStyle = getCss('--color-primary');
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = getCss('--color-text-muted');
    ctx.font = '13px -apple-system, system-ui, sans-serif';
    ctx.fillText(`${point.height}"`, x + 8, y - 8);
  });
}

function openPlantModal(plant = null, preset = null) {
  $('#plant-modal-title').textContent = plant ? 'Edit plant' : 'Add plant';
  $('#plant-id').value = plant?.id || '';
  $('#plant-name').value = plant?.name || preset?.name || '';
  $('#plant-name').dataset.autofill = '';
  $('#plant-count').value = plant?.count || 1;
  if ($('#plant-seeds-popped')) $('#plant-seeds-popped').value = plant && plant.seedsPopped !== null && plant.seedsPopped !== undefined ? plant.seedsPopped : '';
  if ($('#plant-source')) {
    $('#plant-source').value = isClonePlant(plant) ? 'clone' : 'seed';
    $('#plant-clones-taken').value = plant && plant.clonesTaken !== null && plant.clonesTaken !== undefined ? plant.clonesTaken : '';
    const others = (state.plants || []).filter((x) => !plant || x.id !== plant.id);
    // Build 20: mothers from Breeding > Mothers & Fathers come first (value 'mf:<id>').
    const keepMother = plant && plant.motherFatherId;
    const moms = (state.motherFatherPlants || []).filter((m) => {
      if (!m || m.role !== 'mother' || !m.name) return false;
      if (keepMother && m.id === keepMother) return true;
      return window.B63 && typeof B63.showMother === 'function' ? B63.showMother(m) : (!m.archived && m.status !== 'Retired');
    });
    const momGroup = moms.length ? `<option value="" disabled>— My mother plants —</option>${moms.map((m) => `<option value="mf:${escapeHtml(m.id)}">${escapeHtml(m.name)}${m.status === 'Retired' ? ' (retired)' : ''}</option>`).join('')}` : '';
    const plantGroup = others.length ? `<option value="" disabled>— Other plants —</option>${others.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}${x.status && x.status !== 'active' ? ' (archived)' : ''}</option>`).join('')}` : '';
    $('#plant-mother').innerHTML = `<option value="">Not set</option>${momGroup}${plantGroup}<option value="__name">Other (type a name)</option>`;
    const momMatch = plant && !plant.motherPlantId ? (moms.find((m) => plant.motherFatherId && m.id === plant.motherFatherId) || (plant.motherName ? moms.find((m) => m.name === plant.motherName) : null)) : null;
    $('#plant-mother-name').value = plant && plant.motherName && !momMatch && !others.some((x) => x.id === plant.motherPlantId) ? plant.motherName : '';
    $('#plant-mother').value = plant && plant.motherPlantId && others.some((x) => x.id === plant.motherPlantId) ? plant.motherPlantId : (momMatch ? `mf:${momMatch.id}` : (plant && plant.motherName ? '__name' : ''));
    syncPlantSourceFields();
  }
  $('#plant-grow-type').value = plant?.growType || preset?.growType || 'Photoperiod';
  $('#plant-location').value = plant?.location || 'Indoor tent';
  $('#plant-start').value = plant?.startDate || toInputDate(new Date());
  // Build 13: a new plant starts as a Seedling; set a Veg start date when it moves to veg (optional).
  $('#plant-veg').value = plant ? (plant.vegStartDate || '') : '';
  $('#plant-flip').value = plant?.plannedFlipDate || '';
  $('#plant-flower-start').value = plant?.flowerStartDate || '';
  writeTopDressField('plant', plant ? plant.topDressWeeks : '');
  $('#plant-harvest-date').value = plant?.harvestDate || '';
  $('#plant-veg-days').value = plant?.expectedVegDays || preset?.vegDays || 28;
  $('#plant-flower-days').value = plant?.expectedFlowerDays || preset?.flowerDays || 63;
  $('#plant-status').value = plant?.statusOverride || '';
  $('#plant-notes').value = plant?.notes || preset?.note || '';
  $('#plant-modal').showModal();
}

function closePlantModal() {
  clearFormDrafts($('#plant-form'));
  $('#plant-modal').close();
}

function getBreedingFormData() {
  return {
    id: $('#breeding-id').value || crypto.randomUUID(),
    name: $('#breeding-name').value.trim(),
    crop: $('#breeding-crop').value.trim(),
    mother: $('#breeding-mother').value.trim(),
    father: $('#breeding-father').value.trim(),
    // Build 13 (additive): optional links to Mothers & Fathers records; the free-text names above keep working.
    motherId: $('#breeding-mother-id')?.value || '',
    fatherId: $('#breeding-father-id')?.value || '',
    generation: $('#breeding-generation').value,
    method: $('#breeding-method').value,
    startDate: $('#breeding-start').value,
    status: $('#breeding-status').value,
    seedLot: $('#breeding-seed-lot').value.trim(),
    seedCount: $('#breeding-seed-count')?.value || '',
    isolation: $('#breeding-isolation').value.trim(),
    traits: $('#breeding-traits').value.trim(),
    selection: $('#breeding-selection').value.trim(),
    compliance: $('#breeding-compliance').value.trim(),
  };
}

function saveBreedingProject(event) {
  event.preventDefault();
  const project = getBreedingFormData();
  const exists = state.breedingProjects.some((item) => item.id === project.id);
  state.breedingProjects = exists
    ? state.breedingProjects.map((item) => (item.id === project.id ? { ...item, ...project } : item)) // Build 18: keep the tracker fields (cross date, seeds, selections...) the old form does not know
    : [project, ...(state.breedingProjects || [])];
  saveState();
  clearBreedingForm();
  renderBreedingProjects();
  if (typeof showBreedingForm === 'function') showBreedingForm(false);
  if (typeof renderBuild4 === 'function') renderBuild4();
}

function editBreedingProject(id) {
  const project = state.breedingProjects.find((item) => item.id === id);
  if (!project) return;
  $('#breeding-id').value = project.id;
  $('#breeding-name').value = project.name || '';
  $('#breeding-crop').value = project.crop || '';
  $('#breeding-mother').value = project.mother || '';
  $('#breeding-father').value = project.father || '';
  if (typeof mfSetProjectParents === 'function') mfSetProjectParents(project);
  $('#breeding-generation').value = project.generation || 'F1';
  $('#breeding-method').value = project.method || 'Controlled cross';
  $('#breeding-start').value = project.startDate || '';
  $('#breeding-status').value = project.status || 'Planning';
  $('#breeding-seed-lot').value = project.seedLot || '';
  if ($('#breeding-seed-count')) $('#breeding-seed-count').value = project.seedCount || '';
  if (typeof showBreedingForm === 'function') showBreedingForm(true);
  $('#breeding-isolation').value = project.isolation || '';
  $('#breeding-traits').value = project.traits || '';
  $('#breeding-selection').value = project.selection || '';
  $('#breeding-compliance').value = project.compliance || '';
  $('#breeding-name').focus();
}

function clearBreedingForm() {
  clearFormDrafts($('#breeding-form'));
  $('#breeding-form').reset();
  $('#breeding-id').value = '';
  $('#breeding-start').value = toInputDate(new Date());
  if (typeof mfSetProjectParents === 'function') mfSetProjectParents(null);
}

function deleteBreedingProject(id) {
  const project = state.breedingProjects.find((item) => item.id === id);
  if (!project) return;
  openConfirmModal({
    title: `Delete ${project.name}?`,
    message: 'This removes the breeding project record. It does not delete any plant profiles or journal logs. You can undo for a few seconds.',
    acceptLabel: 'Delete project',
    action: () => {
      const at = state.breedingProjects.indexOf(project);
      if (at >= 0) state.breedingProjects.splice(at, 1);
      saveState();
      renderBreedingProjects();
      clearBreedingForm();
      if (typeof renderBuild4 === 'function') renderBuild4();
      showToast(`Deleted ${project.name || 'project'}`, () => {
        if (!state.breedingProjects.includes(project)) state.breedingProjects.splice(Math.min(Math.max(at, 0), state.breedingProjects.length), 0, project);
        saveState();
        renderBreedingProjects();
        if (typeof renderBuild4 === 'function') renderBuild4();
      }, 8000);
    },
  });
}

function openConfirmModal({ title, message, acceptLabel = 'Delete', action, requireText = '' }) {
  pendingConfirmAction = action;
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-accept').textContent = acceptLabel;
  // Build 13: optional type-to-confirm for destructive actions (e.g. Clear all data).
  const wrap = $('#confirm-type-wrap');
  const input = $('#confirm-type');
  confirmRequireText = requireText || '';
  if (wrap && input) {
    wrap.hidden = !requireText;
    input.value = '';
    if (requireText) $('#confirm-type-label').textContent = `Type ${requireText} to confirm`;
    $('#confirm-accept').disabled = !!requireText;
  }
  $('#confirm-modal').showModal();
}
let confirmRequireText = '';
function syncConfirmTyped() {
  const input = $('#confirm-type');
  if (!input || !confirmRequireText) return;
  $('#confirm-accept').disabled = input.value.trim().toUpperCase() !== confirmRequireText.toUpperCase();
}

function closeConfirmModal() {
  pendingConfirmAction = null;
  confirmRequireText = '';
  if ($('#confirm-accept')) $('#confirm-accept').disabled = false;
  $('#confirm-modal').close();
}

function runConfirmedAction() {
  // Take the action and clear it first so a repeat tap (or an error inside the action) can never run it twice.
  const action = pendingConfirmAction;
  pendingConfirmAction = null;
  try {
    if (typeof action === 'function') action();
  } finally {
    closeConfirmModal();
  }
}

function plantMotherStrain() {
  const v = $('#plant-mother') ? $('#plant-mother').value : '';
  if (v && v.startsWith('mf:')) { const m = (state.motherFatherPlants || []).find((x) => x.id === v.slice(3)); return m ? (m.strain || m.name || '') : ''; }
  if (v && v !== '__name') { const m = (state.plants || []).find((x) => x.id === v); return m ? (m.name || '') : ''; }
  return '';
}
function autofillPlantStrain() {
  const nameEl = $('#plant-name'); if (!nameEl) return;
  const clone = $('#plant-source') && $('#plant-source').value === 'clone';
  const strain = clone ? plantMotherStrain() : '';
  const cur = nameEl.value.trim(); const auto = nameEl.dataset.autofill || '';
  if (strain && (!cur || cur === auto)) { nameEl.value = strain; nameEl.dataset.autofill = strain; }
  else if (!strain && auto && cur === auto) { nameEl.value = ''; nameEl.dataset.autofill = ''; }
}
function syncPlantSourceFields() {
  try { autofillPlantStrain(); } catch (e) {}
  const clone = $('#plant-source') && $('#plant-source').value === 'clone';
  $('#plant-seeds-popped-row').hidden = clone; $('#plant-clones-row').hidden = !clone; $('#plant-mother-row').hidden = !clone;
  if ($('#plant-mother-name-row')) $('#plant-mother-name-row').hidden = !clone || $('#plant-mother').value !== '__name';
  $('#plant-start-label').textContent = clone ? 'Cut date' : 'Start date';
  $('#plant-veg-hint').textContent = clone ? 'Clones skip the seedling stage: leave blank and veg starts on the cut date.' : 'Leave blank while it is a seedling. Set it when the plant moves to veg.';
}

function savePlantFromForm(event) {
  event.preventDefault();
  const id = $('#plant-id').value || crypto.randomUUID();
  const existing = state.plants.find((plant) => plant.id === id);
  const plant = {
    ...(existing || {}), // Build 18: keep every stored field the form does not list (groupId, lightOverride, future fields)
    id,
    name: $('#plant-name').value.trim() || (($('#plant-source') && $('#plant-source').value === 'clone') ? plantMotherStrain() : ''),
    count: Number($('#plant-count').value || 1),
    seedsPopped: $('#plant-seeds-popped') && $('#plant-seeds-popped').value !== '' ? Number($('#plant-seeds-popped').value) : (existing ? (existing.seedsPopped ?? null) : null),
    source: $('#plant-source') && $('#plant-source').value === 'clone' ? 'clone' : 'seed',
    clonesTaken: $('#plant-clones-taken') && $('#plant-clones-taken').value !== '' ? Number($('#plant-clones-taken').value) : (existing ? (existing.clonesTaken ?? null) : null),
    motherPlantId: $('#plant-mother') && $('#plant-mother').value && $('#plant-mother').value !== '__name' && !$('#plant-mother').value.startsWith('mf:') ? $('#plant-mother').value : '',
    motherName: (() => { const v = $('#plant-mother') ? $('#plant-mother').value : ''; if (v && v.startsWith('mf:')) { const mm = (state.motherFatherPlants || []).find((x) => x.id === v.slice(3)); return mm ? mm.name : ''; } if (v === '__name') return ($('#plant-mother-name') ? $('#plant-mother-name').value.trim() : '') || existing?.motherName || ''; const m = v && state.plants.find((x) => x.id === v); return m ? m.name : ''; })(),
    growType: $('#plant-grow-type').value,
    location: $('#plant-location').value,
    startDate: $('#plant-start').value,
    // Build 19.1: clones skip the seedling stage; a blank veg date means veg starts on the cut date.
    vegStartDate: $('#plant-veg').value || ($('#plant-source') && $('#plant-source').value === 'clone' ? $('#plant-start').value : ''),
    // Planned flip is informational only; the actual flower start drives the
    // flower counter. Keeping them separate is what fixes the veg/flower bug.
    plannedFlipDate: $('#plant-flip').value,
    flowerStartDate: $('#plant-flower-start').value,
    flowerFlipDate: $('#plant-flower-start').value,
    expectedVegDays: Number($('#plant-veg-days').value || 0),
    expectedFlowerDays: Number($('#plant-flower-days').value || 0),
    notes: $('#plant-notes').value.trim(),
    statusOverride: $('#plant-status').value,
    logs: existing?.logs || [],
    status: existing?.status || 'active',
    isCompleted: !!existing?.isCompleted,
    completed: !!existing?.completed,
    harvestDate: $('#plant-harvest-date') ? $('#plant-harvest-date').value : (existing?.harvestDate || ''),
    archivedAt: existing?.archivedAt || '',
    previousHarvestDate: existing?.previousHarvestDate || '',
    completedAt: existing?.completedAt || '',
    dryStartDate: existing?.dryStartDate || '',
    dryEndDate: existing?.dryEndDate || '',
    cureStartDate: existing?.cureStartDate || '',
    cureEndDate: existing?.cureEndDate || '',
    finishedDate: existing?.finishedDate || '',
    wetWeight: existing?.wetWeight || '',
    dryWeight: existing?.dryWeight || '',
    dryingTemp: existing?.dryingTemp || '',
    dryingRH: existing?.dryingRH || '',
    dryingMethod: existing?.dryingMethod || '',
    curingContainer: existing?.curingContainer || '',
    curingTargetRH: existing?.curingTargetRH || '',
    burpSchedule: existing?.burpSchedule || '',
    postHarvestNotes: existing?.postHarvestNotes || '',
    internalPlantCode: existing?.internalPlantCode || '',
    topDressWeeks: readTopDressField('plant'),
    patientId: existing?.patientId || '',
    patientCertificationId: existing?.patientCertificationId || '',
    cultivar: existing?.cultivar || '',
    growthStage: existing?.growthStage || '',
    complianceStage: existing?.complianceStage || 'immature',
    areaOrRoom: existing?.areaOrRoom || '',
    tagStatus: existing?.tagStatus || 'pending',
    tagAttached: !!existing?.tagAttached,
    tagPrintedAt: existing?.tagPrintedAt || '',
    tagAttachedAt: existing?.tagAttachedAt || '',
    tagReplacedAt: existing?.tagReplacedAt || '',
    tagTextSnapshot: existing?.tagTextSnapshot || '',
    complianceNotes: existing?.complianceNotes || '',
    movedAt: existing?.movedAt || '',
    harvestedAt: existing?.harvestedAt || '',
  };
  // Build 20.1: a clone of a Breeding mother logs its cut on that mother (one cuttings entry per plant, updated on edit).
  plant.motherFatherId = $('#plant-mother') && $('#plant-mother').value.startsWith('mf:') ? $('#plant-mother').value.slice(3) : '';
  (state.motherFatherPlants || []).forEach((m) => { if (plant.cuttingEntryId && (plant.source !== 'clone' || m.id !== plant.motherFatherId)) m.cuttings = (m.cuttings || []).filter((c) => c.id !== plant.cuttingEntryId); });
  if (plant.source === 'clone' && plant.motherFatherId) {
    const mom = (state.motherFatherPlants || []).find((m) => m.id === plant.motherFatherId);
    if (mom) {
      if (!plant.cuttingEntryId) plant.cuttingEntryId = freshId();
      const entry = { id: plant.cuttingEntryId, date: plant.startDate || '', count: Number(plant.clonesTaken ?? plant.count) || 0, notes: `Clones for ${plant.name || 'plant'}` };
      mom.cuttings = mom.cuttings || [];
      const at = mom.cuttings.findIndex((c) => c.id === entry.id);
      if (at >= 0) mom.cuttings[at] = entry; else mom.cuttings.push(entry);
    }
  } else if (plant.source !== 'clone' || !plant.motherFatherId) { if (plant.cuttingEntryId && !(state.motherFatherPlants || []).some((m) => (m.cuttings || []).some((c) => c.id === plant.cuttingEntryId))) plant.cuttingEntryId = ''; }
  // Adding a harvest date by hand must move the record out of Active Strains.
  // Clearing one never auto-reactivates — that needs "Return to Active".
  const autoHarvested = syncHarvestStatus(plant);
  let returnedToActive = false;
  if (!plant.harvestDate && existing?.harvestDate) {
    if (existing.status === 'archived') {
      // Archived records stay archived; only keep the date they carried.
      plant.harvestDate = existing.harvestDate;
      plant.previousHarvestDate = existing.harvestDate;
    } else {
      // Build 13: clearing the harvest date in Edit puts the plant back in Active (the old date is kept as history).
      plant.previousHarvestDate = existing.harvestDate;
      plant.harvestDate = '';
      applyPlantStatus(plant, 'active');
      plant.complianceStage = getActualFlowerStart(plant) ? 'mature' : 'immature';
      logCompliance(plant, 'changed stage', STATUS_LABELS[existing.status] || existing.status || 'Harvested', 'Active', 'Harvest date cleared in Edit; returned to Active.');
      returnedToActive = true;
    }
  }
  const commit = () => {
    if (existing) {
      const at = state.plants.indexOf(existing);
      if (at >= 0) state.plants[at] = plant;
    } else {
      // Never add the same plant twice (e.g. a repeated 'Add anyway' tap or a retry after an error).
      if (state.plants.includes(plant) || state.plants.some((item) => item.id === plant.id)) { addGuardEnd($('#plant-form')); closePlantModal(); return; }
      state.plants.push(plant);
      selectedPlantId = id;
    }
    saveState();
    clearFormDrafts($('#plant-form'));
    closePlantModal();
    renderAll();
    if (returnedToActive) setAutosaveStatus(`${plant.name} → Active`, 'saved');
    if (autoHarvested) {
      setAutosaveStatus(`${plant.name} → Harvested (moved to Harvest Archive)`, 'saved');
    }
  };
  if (!existing) {
    const form = $('#plant-form');
    if (!addGuardStart(form)) return;
    const key = plant.name.trim().toLowerCase();
    if (key && state.plants.some((p) => String(p.name || '').trim().toLowerCase() === key)) {
      addGuardEnd(form);
      openConfirmModal({ title: 'Possible duplicate', message: 'A plant with this name already exists. Add anyway?', acceptLabel: 'Add anyway', action: () => { if (addGuardStart(form)) commit(); } });
      return;
    }
  }
  commit();
}

// Duplicate-add guard: ignore a second submit while one is in flight / within 2s, and disable the submit button.
const addGuardBusy = new Set();
const addGuardTimers = new Map();
function addGuardStart(form) {
  const key = form && form.id;
  if (addGuardBusy.has(key)) return false;
  addGuardBusy.add(key);
  const btn = form && form.querySelector('[type=submit]');
  if (btn) btn.disabled = true;
  clearTimeout(addGuardTimers.get(key));
  addGuardTimers.set(key, setTimeout(() => addGuardEnd(form), 2000));
  return true;
}
function addGuardEnd(form) {
  const key = form && form.id;
  addGuardBusy.delete(key);
  clearTimeout(addGuardTimers.get(key));
  const btn = form && form.querySelector('[type=submit]');
  if (btn) btn.disabled = false;
}

const STATUS_LABELS = { active: 'Active', harvest: 'Harvest', drying: 'Drying', curing: 'Curing', finished: 'Finished', archived: 'Archived' };

// Apply a workflow status change and auto-fill the relevant dates. Forward
// moves seed missing dates with today; backward/reopen moves preserve every
// recorded date so no history is lost.
function applyPlantStatus(plant, toStatus) {
  if (!plant) return false;
  if (toStatus === 'archived') {
    const shown = typeof detailPlantId === 'function' ? detailPlantId() : '';
    const cardOk = typeof archiveCardId === 'string' && archiveCardId && archiveCardId === plant.id;
    if (cardOk) archiveCardId = '';
    else if (window.B63 && typeof B63.allowArchive === 'function' && !B63.allowArchive(shown, plant.id)) return false;
  }
  const today = toInputDate(getToday());
  plant.status = toStatus;
  plant.completed = toStatus !== 'active';
  plant.isCompleted = toStatus === 'finished';
  if (toStatus === 'harvest') {
    if (!plant.harvestDate) plant.harvestDate = today;
    if (!plant.completedAt) plant.completedAt = new Date().toISOString();
    if (!plant.harvestedAt) plant.harvestedAt = new Date().toISOString();
    plant.complianceStage = 'harvested';
  } else if (toStatus === 'drying') {
    if (!plant.harvestDate) plant.harvestDate = today;
    if (!plant.dryStartDate) plant.dryStartDate = today;
    plant.complianceStage = 'post-harvest';
  } else if (toStatus === 'curing') {
    if (!plant.dryEndDate) plant.dryEndDate = today;
    if (!plant.cureStartDate) plant.cureStartDate = today;
    plant.complianceStage = 'post-harvest';
  } else if (toStatus === 'finished') {
    if (!plant.cureEndDate) plant.cureEndDate = today;
    if (!plant.finishedDate) plant.finishedDate = today;
    plant.complianceStage = 'finished';
  } else if (toStatus === 'archived') {
    // Retired genetics: hidden from production views, history untouched.
    if (!plant.archivedAt) plant.archivedAt = new Date().toISOString();
  }
}

// Keep the lifecycle status honest whenever a harvest date is edited by hand.
// Adding a harvest date to an old record moves it straight out of Active
// Strains. Removing one never silently reactivates the record — that requires
// the explicit "Return to Active" action.
function syncHarvestStatus(plant) {
  if (!plant) return false;
  if (plant.harvestDate && (plant.status || 'active') === 'active') {
    applyPlantStatus(plant, 'harvest');
    logCompliance(plant, 'harvested', 'Active', 'Harvest', 'Harvest date recorded — moved out of Active Strains.');
    return true;
  }
  return false;
}

// Compliance events logged when a plant moves between workflow statuses.
const STATUS_TRANSITION_EVENTS = {
  harvest: 'harvested',
  drying: 'sent to drying',
  curing: 'sent to curing',
  finished: 'marked finished',
};

function transitionPlant(id, toStatus, { title, message, acceptLabel }) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant) return;
  const fromStatus = plant.status || 'active';
  openConfirmModal({
    title,
    message,
    acceptLabel,
    action: () => {
      if (applyPlantStatus(plant, toStatus) === false) return;
      // Preserve compliance history through the workflow: log the stage change
      // plus a specific lifecycle event, keeping the patient/tag link intact.
      const eventType = STATUS_TRANSITION_EVENTS[toStatus] || 'changed stage';
      logCompliance(plant, eventType, STATUS_LABELS[fromStatus], STATUS_LABELS[toStatus], 'Workflow stage change.');
      // If the selected profile plant just left the Active list, move the
      // Active selection to the next remaining active plant.
      if (toStatus !== 'active' && selectedPlantId === id) {
        selectedPlantId = activePlants().find((p) => p.id !== id)?.id || '';
      }
      saveState();
      renderAll();
      setAutosaveStatus(`${plant.name} → ${STATUS_LABELS[toStatus]}`, 'saved');
    },
  });
}

function markHarvested(id) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant || plant.status !== 'active') return;
  transitionPlant(id, 'harvest', {
    title: `Mark ${plant.name} harvested?`,
    message: 'Moves this batch to Post-Harvest → Harvest and records the harvest date. All journal entries, photos, and data are kept.',
    acceptLabel: 'Mark harvested',
  });
}

function moveToDrying(id) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant || plant.status !== 'harvest') return;
  transitionPlant(id, 'drying', {
    title: `Move ${plant.name} to drying?`,
    message: 'Moves this batch to Post-Harvest → Drying and records the dry start date.',
    acceptLabel: 'Move to drying',
  });
}

function startCuring(id) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant || plant.status !== 'drying') return;
  transitionPlant(id, 'curing', {
    title: `Start curing ${plant.name}?`,
    message: 'Moves this batch to Post-Harvest → Curing and records the dry end / cure start dates.',
    acceptLabel: 'Start curing',
  });
}

function markFinished(id) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant || plant.status !== 'curing') return;
  transitionPlant(id, 'finished', {
    title: `Mark ${plant.name} finished?`,
    message: 'Moves this batch to Post-Harvest → Finished and records the finished date. You can reopen it later.',
    acceptLabel: 'Mark finished',
  });
}

// Back/reopen transitions. Preserve all recorded dates for history.
function movePlantBack(id, toStatus) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant) return;
  transitionPlant(id, toStatus, {
    title: `Move ${plant.name} back to ${STATUS_LABELS[toStatus]}?`,
    message: 'Moves this batch back a stage. Previously recorded dates and post-harvest details are preserved.',
    acceptLabel: `Move to ${STATUS_LABELS[toStatus]}`,
  });
}

// Manual archive for genetics retired from production.
let archiveCardId = '';
function archivePlant(id, opts) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant || plant.status === 'archived') return;
  const fromCard = !!(opts && opts.fromCard);
  const shown = typeof detailPlantId === 'function' ? detailPlantId() : '';
  archiveCardId = fromCard ? id : '';
  if (!fromCard && window.B63 && typeof B63.allowArchive === 'function' && !B63.allowArchive(shown, id)) return;
  transitionPlant(id, 'archived', {
    title: `Archive ${plant.name}?`,
    message: 'Removes this genetic from Active Strains and the Harvest Archive, and files it under Archived Genetics. Nothing is deleted — every date, note, photo, yield, and test result is preserved, and you can return it to Active anytime.',
    acceptLabel: 'Archive genetic',
  });
}

// Explicit opt-in required to bring a harvested or archived record back.
// A harvest date on its own never flips a record back to Active.
function returnToActive(id) {
  const plant = state.plants.find((item) => item.id === id);
  // Use the lifecycle status, not the raw workflow status: a record can still say
  // 'active' while carrying a harvestDate, and that record must be returnable too.
  if (!plant || getPlantStatus(plant) === 'Active') return;
  const hadHarvest = Boolean(plant.harvestDate);
  openConfirmModal({
    title: `Return ${plant.name} to Active?`,
    message: hadHarvest
      ? 'This puts the record back in Active Strains and clears its harvest date so the active filters stay correct. Veg start, flower start, notes, photos, yield, and test results are all kept, and the change is written to the compliance log.'
      : 'This puts the record back in Active Strains. All recorded history is preserved.',
    acceptLabel: 'Return to Active',
    action: () => {
      const fromStatus = plant.status || 'active';
      // Preserve the harvest date as history before clearing the active flag.
      if (plant.harvestDate) {
        plant.previousHarvestDate = plant.harvestDate;
        plant.harvestDate = '';
      }
      applyPlantStatus(plant, 'active');
      plant.complianceStage = getActualFlowerStart(plant) ? 'mature' : 'immature';
      logCompliance(plant, 'changed stage', STATUS_LABELS[fromStatus] || fromStatus, 'Active', 'Returned to Active production.');
      selectedPlantId = plant.id;
      saveState();
      renderAll();
      setAutosaveStatus(`${plant.name} → Active`, 'saved');
    },
  });
}

function reopenPlant(id) {
  const plant = state.plants.find((item) => item.id === id);
  if (!plant || plant.status === 'active') return;
  transitionPlant(id, 'active', {
    title: `Reopen ${plant.name}?`,
    message: 'Sets this batch back to Active. All recorded harvest, dry, cure, and finished dates are preserved so you keep the history.',
    acceptLabel: 'Reopen plant',
  });
}

// ---------------------------------------------------------------------------
// Maine medical caregiver compliance add-on
// ---------------------------------------------------------------------------

function ensureComplianceState() {
  if (!Array.isArray(state.patients)) state.patients = [];
  if (!Array.isArray(state.complianceLogs)) state.complianceLogs = [];
}

function getPatients() {
  ensureComplianceState();
  return state.patients;
}

function getComplianceLogs() {
  ensureComplianceState();
  return state.complianceLogs;
}

// Build 13: the tagging picker reads the Patients tab store (state.savedPatients) as well as the older compliance list, so a
// patient added in Patients can be assigned to a tag. Saved patients are presented in the same shape (alias = full name,
// certificationId = card number).
function savedPatientAsTagPatient(p) {
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  return { id: p.id, alias: name || 'Unnamed', certificationId: p.cardNumber || '', active: !p.archived, fromSaved: true };
}
function getTaggablePatients() {
  const legacy = getPatients();
  const seen = new Set(legacy.map((p) => p.id));
  const saved = (Array.isArray(state.savedPatients) ? state.savedPatients : []).filter((p) => p && !p.archived && !seen.has(p.id)).map(savedPatientAsTagPatient);
  return legacy.concat(saved);
}
function getPatientById(id) {
  if (!id) return null;
  const legacy = getPatients().find((pt) => pt.id === id);
  if (legacy) return legacy;
  const saved = (Array.isArray(state.savedPatients) ? state.savedPatients : []).find((p) => p && p.id === id);
  return saved ? savedPatientAsTagPatient(saved) : null;
}

function patientAliasFor(plant) {
  const pt = getPatientById(plant.patientId);
  return pt ? pt.alias : '';
}

// Append a timestamped compliance event. Kept append-only so history is never
// lost — even when plants move into the post-harvest workflow.
function logCompliance(plant, eventType, oldValue, newValue, notes = '') {
  ensureComplianceState();
  state.complianceLogs.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
    plantId: plant?.id || '',
    patientId: plant?.patientId || '',
    timestamp: new Date().toISOString(),
    eventType,
    stage: plant?.complianceStage || '',
    oldValue: String(oldValue ?? ''),
    newValue: String(newValue ?? ''),
    notes: String(notes ?? ''),
  });
}

// Compliance-readiness gate. A plant is only "compliance ready" once a patient
// is assigned, that assignment carries a certification id, and a tag has been
// generated (a saved tag text snapshot). Missing items surface as warnings but
// never block general app use.
function plantComplianceIssues(plant) {
  const issues = [];
  if (!plant.patientId) issues.push('No patient assigned');
  if (!plant.patientCertificationId) issues.push('Missing certification ID');
  if (!plant.tagTextSnapshot) issues.push('Tag not generated');
  if (!plant.tagAttached) issues.push('Tag not attached');
  return issues;
}

function isComplianceReady(plant) {
  return !!plant.patientId && !!plant.patientCertificationId && !!plant.tagTextSnapshot;
}

// --- Patient registry CRUD ---

function getPatientFormData() {
  return {
    id: $('#patient-id').value || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random())),
    alias: $('#patient-alias').value.trim(),
    certificationId: $('#patient-cert-id').value.trim(),
    issueDate: $('#patient-issue').value,
    expirationDate: $('#patient-expiration').value,
    designationStart: $('#patient-designation-start').value,
    designationEnd: $('#patient-designation-end').value,
    active: $('#patient-active').value !== 'inactive',
    notes: $('#patient-notes').value.trim(),
  };
}

function savePatientFromForm(event) {
  event.preventDefault();
  ensureComplianceState();
  const data = getPatientFormData();
  if (!data.alias) return;
  const existing = state.patients.find((pt) => pt.id === data.id);
  if (existing) {
    Object.assign(existing, data);
  } else {
    state.patients.push(data);
  }
  patientEditId = '';
  saveState();
  clearPatientForm();
  renderCompliance();
  setAutosaveStatus('Patient saved', 'saved');
}

function editPatient(id) {
  const pt = getPatientById(id);
  if (!pt) return;
  patientEditId = id;
  $('#patient-id').value = pt.id;
  $('#patient-alias').value = pt.alias;
  $('#patient-cert-id').value = pt.certificationId;
  $('#patient-issue').value = pt.issueDate;
  $('#patient-expiration').value = pt.expirationDate;
  $('#patient-designation-start').value = pt.designationStart;
  $('#patient-designation-end').value = pt.designationEnd;
  $('#patient-active').value = pt.active ? 'active' : 'inactive';
  $('#patient-notes').value = pt.notes;
  selectComplianceTab('patients');
  $('#patient-alias').focus();
}

function clearPatientForm() {
  patientEditId = '';
  const form = $('#patient-form');
  if (!form) return;
  form.reset();
  $('#patient-id').value = '';
  $('#patient-active').value = 'active';
}

function generatePatientCertId() {
  // Convenience: fill a random numeric identifier when one is not supplied.
  const field = $('#patient-cert-id');
  if (field) field.value = String(Math.floor(100000000 + Math.random() * 900000000));
}

function togglePatientActive(id) {
  const pt = getPatientById(id);
  if (!pt) return;
  pt.active = !pt.active;
  saveState();
  renderCompliance();
  setAutosaveStatus(`Patient ${pt.active ? 'activated' : 'deactivated'}`, 'saved');
}

function deletePatientRecord(id) {
  const pt = getPatientById(id);
  if (!pt) return;
  const assigned = state.plants.filter((p) => p.patientId === id);
  openConfirmModal({
    title: `Delete patient ${pt.alias || 'record'}?`,
    message: assigned.length
      ? `This permanently removes the patient record. ${assigned.length} plant${assigned.length > 1 ? 's are' : ' is'} currently assigned to this patient; those plants keep their recorded certification snapshot and history, but the patient link is cleared.`
      : 'This permanently removes the patient record from this browser. This cannot be undone.',
    acceptLabel: 'Delete patient',
    action: () => {
      const at = state.patients.indexOf(pt);
      if (at >= 0) state.patients.splice(at, 1);
      // Clear the live link but preserve each plant's certification snapshot
      // and full compliance history so inspection records stay intact.
      state.plants.forEach((p) => { if (p.patientId === id) p.patientId = ''; });
      saveState();
      renderCompliance();
      renderProfile();
      setAutosaveStatus('Patient deleted', 'saved');
    },
  });
}

// --- Patient assignment ---

function assignPatientToPlant(plantId, patientId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  const previous = plant.patientId ? (getPatientById(plant.patientId)?.alias || 'previous') : 'none';
  plant.patientId = patientId;
  const pt = getPatientById(patientId);
  // Snapshot the certification id onto the plant so it survives even if the
  // patient record is later edited or removed.
  if (pt) plant.patientCertificationId = pt.certificationId;
  else if (!patientId) plant.patientCertificationId = '';
  logCompliance(plant, 'patient assigned', previous, pt ? (pt.alias || 'patient') : 'none', 'Patient assignment updated.');
  saveState();
  renderAll();
  setAutosaveStatus('Patient assigned', 'saved');
}

// --- Plant tagging ---

function buildTagText(plant) {
  const pt = getPatientById(plant.patientId);
  const stats = getPlantStats(plant);
  const lines = [
    `Plant Code: ${plant.internalPlantCode || '(unset)'}`,
    `Patient Certification ID: ${plant.patientCertificationId || (pt ? pt.certificationId : '') || '(unset)'}`,
    `Patient Alias: ${pt ? pt.alias : '(unassigned)'}`,
    `Cultivar: ${plant.cultivar || plant.name || '(unset)'}`,
    `Stage: ${titleCase(plant.complianceStage || stats.stage || '')}`,
    `Area: ${plant.areaOrRoom || plant.location || '(unset)'}`,
    `Caregiver: ${caregiverLabel() || '(unset)'}`,
  ];
  return lines.join('\n');
}

function generateTag(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  // Auto-fill a plant code if none was set yet so the tag always has one.
  if (!plant.internalPlantCode) {
    plant.internalPlantCode = `BG-${(plant.name || 'PLANT').replace(/[^a-z0-9]+/gi, '').slice(0, 6).toUpperCase() || 'PLANT'}-${String(Math.floor(1000 + Math.random() * 9000))}`;
  }
  plant.tagTextSnapshot = buildTagText(plant);
  logCompliance(plant, 'tag generated', '', plant.internalPlantCode, 'Tag text generated.');
  saveState();
  renderAll();
  setAutosaveStatus('Tag generated', 'saved');
}

function copyTagText(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  const text = plant.tagTextSnapshot || buildTagText(plant);
  const done = () => setAutosaveStatus('Tag text copied', 'saved');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
}

function fallbackCopy(text, done) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'absolute';
  area.style.left = '-9999px';
  document.body.appendChild(area);
  area.select();
  try { document.execCommand('copy'); } catch (error) { /* no-op */ }
  document.body.removeChild(area);
  if (done) done();
}

function printTag(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  const text = plant.tagTextSnapshot || buildTagText(plant);
  if (typeof isNativeApp === 'function' && isNativeApp()) {
    printOrShare(`Plant Tag ${plant.internalPlantCode || ''}`, `plant-tag-${(plant.internalPlantCode || plant.name || 'tag').replace(/[^a-z0-9-]+/gi, '_')}.html`, `<pre style="border:2px solid #333;padding:16px;border-radius:8px">${escapeHtml(text)}</pre>`, () => {}).then((res) => {
      if (res === 'shared' && plant.tagTextSnapshot) {
        plant.tagStatus = 'printed';
        plant.tagPrintedAt = new Date().toISOString();
        logCompliance(plant, 'tag printed', '', plant.internalPlantCode, 'Tag file shared for printing.');
        saveState();
        renderAll();
      }
    });
    return;
  }
  // Open a minimal print window so the browser print flow targets only the tag.
  const win = window.open('', '_blank', 'width=420,height=360');
  if (!win) {
    setAutosaveStatus('Allow pop-ups to print tags', 'error');
    return;
  }
  win.document.write(`<!doctype html><html><head><title>Plant Tag ${escapeHtml(plant.internalPlantCode || '')}</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;} pre{font-size:14px;line-height:1.5;white-space:pre-wrap;border:2px solid #333;padding:16px;border-radius:8px;}</style>
    </head><body><pre>${escapeHtml(text)}</pre><script>window.onload=function(){window.print();}<\/script></body></html>`);
  win.document.close();
  // Only mark printed if a tag has actually been generated.
  if (plant.tagTextSnapshot) {
    plant.tagStatus = 'printed';
    plant.tagPrintedAt = new Date().toISOString();
    logCompliance(plant, 'tag printed', '', plant.internalPlantCode, 'Tag sent to browser print.');
    saveState();
    renderAll();
  }
}

function markTagAttached(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  plant.tagAttached = true;
  plant.tagStatus = 'attached';
  plant.tagAttachedAt = new Date().toISOString();
  logCompliance(plant, 'tag attached', '', plant.internalPlantCode, 'Tag marked attached to plant.');
  saveState();
  renderAll();
  setAutosaveStatus('Tag marked attached', 'saved');
}

function replaceTag(plantId) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  openConfirmModal({
    title: `Replace tag for ${plant.name}?`,
    message: 'Regenerates the tag text from current details and logs a replacement timestamp. The previous tag history is preserved in the compliance log.',
    acceptLabel: 'Replace tag',
    action: () => {
      plant.tagTextSnapshot = buildTagText(plant);
      plant.tagStatus = 'replaced';
      plant.tagReplacedAt = new Date().toISOString();
      plant.tagAttached = false;
      logCompliance(plant, 'tag replaced', '', plant.internalPlantCode, 'Tag replaced; re-attach and re-print as needed.');
      saveState();
      renderAll();
      setAutosaveStatus('Tag replaced', 'saved');
    },
  });
}

// --- Area / compliance-stage changes on the selected plant profile ---

function changePlantArea(plantId, newArea) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  const oldArea = plant.areaOrRoom || '(unset)';
  if ((newArea || '') === (plant.areaOrRoom || '')) return;
  openConfirmModal({
    title: 'Confirm area / room change',
    message: `Move ${plant.name} to “${newArea || '(unset)'}”? Review and update the plant tag if the location is printed on it. This change is logged for inspection history.`,
    acceptLabel: 'Confirm move',
    action: () => {
      plant.areaOrRoom = newArea;
      plant.movedAt = new Date().toISOString();
      logCompliance(plant, 'moved area', oldArea, newArea || '(unset)', 'Area/room updated — review tag.');
      saveState();
      renderAll();
      setAutosaveStatus('Area updated', 'saved');
    },
  });
}

function changeComplianceStage(plantId, newStage) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant || !COMPLIANCE_STAGES.includes(newStage)) return;
  const oldStage = plant.complianceStage || '';
  if (newStage === oldStage) return;
  openConfirmModal({
    title: 'Confirm compliance stage change',
    message: `Set ${plant.name} compliance stage to “${titleCase(newStage)}”? Review the plant tag if the stage is printed on it. This change is logged.`,
    acceptLabel: 'Confirm stage',
    action: () => {
      plant.complianceStage = newStage;
      logCompliance(plant, 'changed stage', titleCase(oldStage), titleCase(newStage), 'Compliance stage updated — review tag.');
      saveState();
      renderAll();
      setAutosaveStatus('Compliance stage updated', 'saved');
    },
  });
}

// Save inline compliance field edits (plant code, cultivar) from the profile.
function saveComplianceField(plantId, field, value) {
  const plant = state.plants.find((item) => item.id === plantId);
  if (!plant) return;
  plant[field] = value;
  saveState();
  setAutosaveStatus('Compliance details saved', 'saved');
}

// --- Medical Patient Transaction Log ---

// Minimum blank grid rows shown so the digital form looks like the paper Form 009.
const MIN_TXN_ROWS = 11;
let medicalLogExtraRows = 0;
let medicalLogSaveTimer = null;

function ensureMedicalLogState() {
  if (!state.medicalTransactionLog || typeof state.medicalTransactionLog !== 'object') {
    state.medicalTransactionLog = emptyMedicalTransactionLog();
  }
  if (!Array.isArray(state.medicalTransactionLog.rows)) state.medicalTransactionLog.rows = [];
  if (!state.medicalTransactionLog.caregiverInfo || typeof state.medicalTransactionLog.caregiverInfo !== 'object') {
    state.medicalTransactionLog.caregiverInfo = emptyMedicalTransactionLog().caregiverInfo;
  }
  return state.medicalTransactionLog;
}

// Retention: transaction date (or created date) + 7 years, as YYYY-MM-DD.
function computeRetentionUntil(baseValue) {
  const base = baseValue ? new Date(baseValue) : new Date();
  if (Number.isNaN(base.getTime())) return '';
  const d = new Date(base.getTime());
  d.setFullYear(d.getFullYear() + TRANSACTION_RETENTION_YEARS);
  return d.toISOString().slice(0, 10);
}

// Rows the user has typed into (archived rows are retained but hidden from the grid).
function getVisibleRows() {
  return ensureMedicalLogState().rows.filter((r) => !r.archivedAt);
}

function flushMedicalLogSave() {
  if (medicalLogSaveTimer) { clearTimeout(medicalLogSaveTimer); medicalLogSaveTimer = null; }
  saveState();
  setAutosaveStatus('Transaction log saved', 'saved');
}

function scheduleMedicalLogSave() {
  if (medicalLogSaveTimer) clearTimeout(medicalLogSaveTimer);
  medicalLogSaveTimer = setTimeout(flushMedicalLogSave, 300);
}

function setCaregiverField(field, value) {
  const log = ensureMedicalLogState();
  if (field in log.caregiverInfo) log.caregiverInfo[field] = value;
}

function renderCaregiverInfo() {
  const info = ensureMedicalLogState().caregiverInfo;
  $$('[data-caregiver-field]').forEach((el) => {
    const field = el.dataset.caregiverField;
    if (field in info) el.value = info[field];
  });
}

function archiveActionCellHtml(rowId) {
  return `<button class="txn-row-remove" type="button" data-txn-action="archive" data-row-id="${escapeHtml(rowId)}" title="Archive this row" aria-label="Archive this row">×</button>`;
}

function transactionRowHtml(row) {
  const id = row ? row.row_id : '';
  const val = (field) => (row ? escapeHtml(row[field]) : '');
  const cell = (field, type = 'text') => `<td><input class="grid-input" type="${type}" data-field="${field}" value="${val(field)}" aria-label="${field}" /></td>`;
  return `<tr data-row-id="${escapeHtml(id)}">
      ${cell('licensePhotoId')}
      ${cell('patientCertificationRandomId')}
      ${cell('medicineTypeForm')}
      ${cell('amount')}
      ${cell('time', 'time')}
      ${cell('date', 'date')}
      <td class="no-print txn-row-actions">${row ? archiveActionCellHtml(row.row_id) : ''}</td>
    </tr>`;
}

function renderMedicalLog() {
  const disclaimer = $('#medical-log-disclaimer');
  if (disclaimer) disclaimer.textContent = MEDICAL_LOG_DISCLAIMER;
  renderCaregiverInfo();
  const tbody = $('#transaction-table-body');
  if (!tbody) return;
  const rows = getVisibleRows();
  const padCount = Math.max(MIN_TXN_ROWS - rows.length, 0) + medicalLogExtraRows;
  tbody.innerHTML = [
    ...rows.map((r) => transactionRowHtml(r)),
    ...Array.from({ length: padCount }, () => transactionRowHtml(null)),
  ].join('');
  if (typeof renderTxnMobile === 'function') renderTxnMobile();
}

// Update state from a single edited grid cell. Blank pad rows are materialized
// into real rows the moment the user types something into them.
function handleGridEdit(event, immediate) {
  const input = event.target.closest('.grid-input');
  if (!input) return;
  const tr = input.closest('tr');
  if (!tr) return;
  const log = ensureMedicalLogState();
  const field = input.dataset.field;
  const value = input.value;
  let row = tr.dataset.rowId ? log.rows.find((r) => r.row_id === tr.dataset.rowId) : null;
  if (!row) {
    if (value === '') return;
    row = normalizeTransactionRow({ createdAt: new Date().toISOString() });
    log.rows.push(row);
    tr.dataset.rowId = row.row_id;
    const actionsCell = tr.querySelector('.txn-row-actions');
    if (actionsCell) actionsCell.innerHTML = archiveActionCellHtml(row.row_id);
  }
  row[field] = value;
  row.updatedAt = new Date().toISOString();
  if (field === 'date') row.retentionUntil = computeRetentionUntil(value || row.createdAt);
  if (immediate) flushMedicalLogSave();
  else scheduleMedicalLogSave();
}

function addTransactionRow() {
  medicalLogExtraRows += 1;
  renderMedicalLog();
}

// Soft archive only — records are kept for the full 7-year retention period and
// are never hard-deleted.
function archiveTransactionRow(id) {
  const log = ensureMedicalLogState();
  const row = log.rows.find((r) => r.row_id === id);
  if (!row) return;
  openConfirmModal({
    title: 'Archive this row?',
    message: 'Archiving removes the line from the log view but keeps the record for the full 7-year retention period. Rows are never permanently deleted.',
    acceptLabel: 'Archive',
    action: () => {
      row.archivedAt = new Date().toISOString();
      row.updatedAt = row.archivedAt;
      flushMedicalLogSave();
      renderMedicalLog();
      showToast('Sale archived', () => restoreTransactionRow(row.row_id, true), 8000);
    },
  });
}

function setupMedicalLogControls() {
  $('#txn-add-row')?.addEventListener('click', addTransactionRow);
  $('#print-transaction-log')?.addEventListener('click', printTransactionLog);
  $('#export-transaction-csv')?.addEventListener('click', exportTransactionCSV);
  $$('[data-caregiver-field]').forEach((el) => {
    el.addEventListener('input', () => { setCaregiverField(el.dataset.caregiverField, el.value); scheduleMedicalLogSave(); });
    el.addEventListener('change', () => { setCaregiverField(el.dataset.caregiverField, el.value); flushMedicalLogSave(); });
  });
  const tbody = $('#transaction-table-body');
  if (tbody) {
    tbody.addEventListener('input', (event) => handleGridEdit(event, false));
    tbody.addEventListener('change', (event) => handleGridEdit(event, true));
    tbody.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-txn-action="archive"]');
      if (btn) archiveTransactionRow(btn.dataset.rowId);
    });
  }
}

function printTransactionLog() {
  if (activeView !== 'medical-log') switchView('medical-log');
  renderMedicalLog();
  if (typeof isNativeApp === 'function' && isNativeApp()) {
    const paper = $('#medical-log-paper');
    const clone = paper ? paper.cloneNode(true) : null;
    if (clone) {
      clone.querySelectorAll('.no-print,button').forEach((n) => n.remove());
      clone.querySelectorAll('input').forEach((i) => { const t = document.createElement('span'); t.textContent = i.value; i.replaceWith(t); });
    }
    printOrShare('Form 009 · Patient transaction log', `form-009-${todayKey()}.html`, clone ? clone.innerHTML : '<p>No log</p>', () => {});
    return;
  }
  window.print();
}

function exportTransactionCSV() {
  const headers = ['License/Photo ID', 'Patient Certification Random ID Number', 'Medicine Type/Form', 'Amount', 'Amount (g)', 'Amount (oz)', 'Time', 'Date', 'Created At', 'Updated At', 'Archived At', 'Retention Until'];
  const rows = ensureMedicalLogState().rows.map((r) => [
    r.licensePhotoId,
    r.patientCertificationRandomId,
    r.medicineTypeForm,
    r.amount,
    Number(gramsOf(r.amount).toFixed(2)),
    Number(ozOf(r.amount).toFixed(2)),
    r.time,
    r.date,
    r.createdAt,
    r.updatedAt,
    r.archivedAt,
    r.retentionUntil,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  downloadFile('boriken-patient-transaction-log.csv', csv, 'text/csv');
}

async function saveLogFromForm(event) {
  event.preventDefault();
  const plant = state.plants.find((item) => item.id === $('#log-plant').value);
  if (!plant) return;
  const file = $('#log-photo').files[0];
  let photoId = '';
  if (file) {
    const media = window.BorikenMedia;
    if (!media) {
      showStorageError('Photo storage is not available, so this journal entry was not added.');
      return;
    }
    try {
      photoId = crypto.randomUUID();
      await media.putFile(photoId, file);
      const url = await media.objectUrl(photoId);
      if (url) mediaUrlCache.set(photoId, url);
    } catch (error) {
      showStorageError(`Photo was not saved (${error.message || error}). The journal entry was not added.`);
      return;
    }
  }
  plant.logs = plant.logs || [];
  plant.logs.push({
    id: crypto.randomUUID(),
    date: $('#log-date').value,
    type: $('#log-type').value,
    height: $('#log-height').value,
    feed: $('#log-feed').value.trim(),
    notes: $('#log-notes').value.trim(),
    photo: '',
    photoId,
  });
  if (!saveState()) {
    plant.logs.pop();
    return;
  }
  showStorageError('');
  clearFormDrafts($('#log-form'));
  $('#log-form').reset();
  setTodayDefaults();
  selectedPlantId = plant.id;
  renderAll();
}

async function saveVlogEntry(event) {
  event.preventDefault();
  const form = $('#vlog-form');
  if (!addGuardStart(form)) return;
  let ok = false;
  try {
    const existing = vlogEditId ? (state.vlogEntries || []).find((e) => e.id === vlogEditId) : null;
    const file = $('#vlog-media').files[0];
    let thumbnailId = '';
    if (file && file.type.startsWith('image/')) {
      const media = window.BorikenMedia;
      if (!media) {
        showStorageError('Photo storage is not available, so this vlog entry was not saved.');
        return;
      }
      try {
        thumbnailId = crypto.randomUUID();
        await media.putFile(thumbnailId, file);
        const url = await media.objectUrl(thumbnailId);
        if (url) mediaUrlCache.set(thumbnailId, url);
      } catch (error) {
        showStorageError(`The photo was not saved (${error.message || error}). The vlog entry was not saved.`);
        return;
      }
    }
    state.vlogEntries = state.vlogEntries || [];
    const fields = {
      plantId: $('#vlog-plant').value,
      date: $('#vlog-date').value,
      type: $('#vlog-type').value,
      hook: $('#vlog-hook').value.trim(),
      growth: $('#vlog-growth').value.trim(),
      notes: $('#vlog-notes').value.trim(),
      privateNotes: $('#vlog-private').value.trim(),
      status: VLOG_STATUSES.includes($('#vlog-status').value) ? $('#vlog-status').value : 'Idea',
    };
    const mediaFields = file ? {
      mediaName: file.name || '',
      mediaType: file.type || '',
      mediaSize: file.size || 0,
      mediaKind: file.type?.startsWith('video/') ? 'video' : file.type?.startsWith('image/') ? 'image' : '',
      thumbnail: '',
      thumbnailId,
    } : null;
    if (existing) {
      const before = JSON.parse(JSON.stringify(existing));
      Object.assign(existing, fields, mediaFields || {});
      if (!saveState()) { Object.keys(existing).forEach((k) => delete existing[k]); Object.assign(existing, before); return; }
    } else {
      state.vlogEntries.unshift({
        id: crypto.randomUUID(),
        ...fields,
        mediaName: file?.name || '',
        mediaType: file?.type || '',
        mediaSize: file?.size || 0,
        mediaKind: file?.type?.startsWith('video/') ? 'video' : file?.type?.startsWith('image/') ? 'image' : '',
        thumbnail: '',
        thumbnailId,
      });
      if (!saveState()) { state.vlogEntries.shift(); return; }
    }
    ok = true;
    showStorageError('');
    closeVlogSheet();
    vlogEditId = '';
    renderVlogEntries();
  } finally {
    if (!ok) addGuardEnd(form);
  }
}

function deleteVlogEntry(id) {
  const entry = state.vlogEntries.find((item) => item.id === id);
  if (!entry) return;
  openConfirmModal({
    title: `Delete vlog entry?`,
    message: `This removes the saved note and media reference for “${entry.hook || entry.type}.” It does not delete files from your device. You can undo for a few seconds afterwards.`,
    acceptLabel: 'Delete entry',
    action: () => {
      const index = state.vlogEntries.findIndex((item) => item.id === id);
      if (index < 0) return;
      createSnapshot('pre-delete');
      state.vlogEntries.splice(index, 1);
      if (!saveState()) { state.vlogEntries.splice(index, 0, entry); return; }
      renderVlogEntries();
      showToast('Deleted vlog entry', () => {
        if (!state.vlogEntries.includes(entry)) state.vlogEntries.splice(Math.min(index, state.vlogEntries.length), 0, entry);
        saveState();
        renderVlogEntries();
        showToast('Restored vlog entry');
      }, 8000);
    },
  });
}

function printGrowSummary() {
  const rows = state.plants.map((p) => {
    const st = getPlantStats(p);
    return `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(getPlantStatus(p))} · ${escapeHtml(st.stage)}</td><td>${escapeHtml(p.location || '')}</td><td>${escapeHtml(p.startDate || '')}</td><td>${escapeHtml(p.vegStartDate || '')}</td><td>${escapeHtml(p.flowerStartDate || '')}</td><td>${escapeHtml(p.harvestDate || '')}</td><td>${(p.logs || []).length}</td></tr>`;
  }).join('') || '<tr><td colspan="8">No plants</td></tr>';
  const body = `<h1>Grow summary</h1><p class="small">Generated ${escapeHtml(new Date().toLocaleString())}</p><table><tr><th>Plant</th><th>Status</th><th>Location</th><th>Start</th><th>Veg</th><th>Flower</th><th>Harvest</th><th>Logs</th></tr>${rows}</table>`;
  printOrShare('Grow summary', `grow-summary-${todayKey()}.html`, body, () => window.print());
}

function exportCSV() {
  const headers = ['Name', 'Batch Count', 'Grow Type', 'Location', 'Stage', 'Start Date', 'Veg Start', 'Planned Flip', 'Flower Start (Actual)', 'Lifecycle Status', 'Days Veg', 'Days Flower', 'Plant Age (Days)', 'Projected Harvest', 'Workflow Status', 'Completed', 'Harvest Date', 'Wet Weight', 'Dry Start', 'Dry End', 'Drying Temp', 'Drying RH', 'Drying Method', 'Cure Start', 'Cure End', 'Curing Container', 'Curing Target RH', 'Burp Schedule', 'Dry Weight', 'Finished Date', 'Post-Harvest Notes', 'Plant Code', 'Patient Alias', 'Patient Certification ID', 'Compliance Stage', 'Area / Room', 'Tag Status', 'Tag Attached', 'Tag Text Snapshot', 'Compliance Notes', 'Notes'];
  const rows = state.plants.map((plant) => {
    const stats = getPlantStats(plant);
    return [
      plant.name,
      plant.count,
      plant.growType,
      plant.location,
      stats.stage,
      plant.startDate,
      plant.vegStartDate,
      stats.plannedFlipDate,
      stats.actualFlowerStart,
      getPlantStatus(plant),
      stats.daysInVeg ?? 'Veg not started',
      stats.flowerDays ?? 'Flower not started',
      stats.plantAgeDays ?? '',
      toInputDate(stats.harvestDate),
      STATUS_LABELS[plant.status] || 'Active',
      plant.isCompleted ? 'Yes' : 'No',
      plant.harvestDate,
      plant.wetWeight,
      plant.dryStartDate,
      plant.dryEndDate,
      plant.dryingTemp,
      plant.dryingRH,
      plant.dryingMethod,
      plant.cureStartDate,
      plant.cureEndDate,
      plant.curingContainer,
      plant.curingTargetRH,
      plant.burpSchedule,
      plant.dryWeight,
      plant.finishedDate,
      plant.postHarvestNotes,
      plant.internalPlantCode,
      patientAliasFor(plant),
      plant.patientCertificationId,
      titleCase(plant.complianceStage || ''),
      plant.areaOrRoom,
      titleCase(plant.tagStatus || ''),
      plant.tagAttached ? 'Yes' : 'No',
      plant.tagTextSnapshot,
      plant.complianceNotes,
      plant.notes,
      isClonePlant(plant) ? 'Clone' : 'Seed',
      startCountOf(plant),
      motherNameOf(plant),
    ];
  });
  headers.push('Source', 'Seeds popped / clones taken', 'Mother plant');
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  downloadFile('plant-growth-tracker.csv', csv, 'text/csv');
}

function exportComplianceCSV() {
  const headers = ['Timestamp', 'Plant Code', 'Patient Alias', 'Event Type', 'Stage', 'Old Value', 'New Value', 'Notes'];
  const plantCode = (id) => state.plants.find((p) => p.id === id)?.internalPlantCode || state.plants.find((p) => p.id === id)?.name || '';
  const rows = getComplianceLogs().map((l) => [
    l.timestamp,
    plantCode(l.plantId),
    getPatientById(l.patientId)?.alias || '',
    titleCase(l.eventType || ''),
    titleCase(l.stage || ''),
    l.oldValue,
    l.newValue,
    l.notes,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  downloadFile('boriken-compliance-log.csv', csv, 'text/csv');
}

function exportBreedingCSV() {
  const headers = ['Project Name', 'Crop', 'Mother', 'Father', 'Generation', 'Method', 'Start Date', 'Status', 'Seed Lot', 'Isolation', 'Target Traits', 'Selection Notes', 'Compliance Notes'];
  const rows = (state.breedingProjects || []).map((project) => [
    project.name,
    project.crop,
    project.mother,
    project.father,
    project.generation,
    project.method,
    project.startDate,
    project.status,
    project.seedLot,
    project.isolation,
    project.traits,
    project.selection,
    project.compliance,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  downloadFile('breeding-projects.csv', csv, 'text/csv');
}

function exportVlogCSV() {
  const headers = ['Date', 'Plant', 'Entry Type', 'Hook', 'Growth Change', 'Notes', 'Private Notes', 'Media Name', 'Media Type', 'Media Kind', 'Status'];
  const rows = (state.vlogEntries || []).map((entry) => [
    entry.date,
    getPlantName(entry.plantId) || 'Unknown plant',
    entry.type,
    entry.hook,
    entry.growth,
    entry.notes,
    entry.privateNotes,
    entry.mediaName,
    entry.mediaType,
    entry.mediaKind,
    vlogStatusOf(entry),
  ]);
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
  downloadFile('boriken-vlog-growth-journal.csv', csv, 'text/csv').then((res) => {
    if (typeof showToast === 'function') showToast(res === 'failed' ? 'Vlog CSV could not be saved' : res === 'shared' ? 'Vlog CSV shared. Choose Save to Files to keep it.' : `Vlog CSV downloaded (${rows.length} ${rows.length === 1 ? 'entry' : 'entries'})`);
  });
}

async function exportJSON() {
  try {
    const payload = await buildFullBackupPayload();
    const res = await shareFile(`boriken-genetics-logbook-backup-${todayKey()}.json`, JSON.stringify(payload, null, 2), 'application/json', 'Borikèn Logbook backup');
    // Only count the backup as done once the file was actually saved/shared (not when the share sheet was dismissed).
    if (res === 'cancelled') { setAutosaveStatus('Backup not saved (cancelled)', 'idle'); return; }
    if (typeof markBackupExported === 'function') markBackupExported();
    setAutosaveStatus(res === 'shared' ? 'Backup shared. Choose Save to Files to keep it.' : 'Backup downloaded', 'saved');
  } catch (error) {
    showStorageError(error.message || 'Could not create the backup file.');
  }
}

function extractImportedState(parsed) {
  if (parsed && Array.isArray(parsed.plants)) return parsed; // flat/legacy backup
  if (parsed && parsed.state && Array.isArray(parsed.state.plants)) return parsed.state; // metadata-wrapped
  return null;
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (error) {
      alert(`Could not import this file: ${error.message}`);
      event.target.value = '';
      return;
    }
    const importedState = extractImportedState(parsed);
    if (!importedState) {
      alert('Could not import this file: it does not look like a logbook backup (no plants found).');
      event.target.value = '';
      return;
    }
    const replacing = !isStateEmpty();
    openConfirmModal({
      title: 'Import this backup?',
      message: replacing
        ? 'This REPLACES your current logbook with the imported backup file. Your current data is saved to backup history first, then overwritten.'
        : 'This loads the imported backup file into your logbook.',
      acceptLabel: 'Import backup',
      action: async () => {
        const media = window.BorikenMedia;
        if (Array.isArray(parsed.photos) && parsed.photos.length) {
          if (!media) {
            showStorageError('This backup includes photos, but photo storage is not available in this browser. Nothing was imported.');
            return;
          }
          const importedPhotos = await media.importPhotos(parsed.photos);
          if (importedPhotos.failed) {
            showStorageError(`Imported the logbook, but ${importedPhotos.failed} photo${importedPhotos.failed === 1 ? '' : 's'} could not be stored. ${importedPhotos.errors[0] || ''}`);
          }
        }
        createSnapshot('pre-import');
        state = normalizeState(importedState);
        applyDeviceSettings(parsed.deviceSettings);
        if (media) await media.migrateInlinePhotos(state);
        selectedPlantId = state.plants[0]?.id || '';
        clearAllDrafts();
        await hydrateMediaCache();
        const saved = saveState();
        renderAll();
        if (saved) setAutosaveStatus('Backup imported', 'saved');
      },
    });
    event.target.value = '';
  };
  reader.readAsText(file);
}

function applyDeviceSettings(ds) {
  if (!ds || typeof ds !== 'object') return;
  try {
    if (['light', 'dark', 'system'].includes(ds.theme)) setThemePref(ds.theme);
    if (typeof b18SetAccent === 'function' && typeof ds.accent === 'string') b18SetAccent(ds.accent);
    if (typeof setLockEnabled === 'function' && typeof ds.appLock === 'boolean') { setLockEnabled(ds.appLock); if (typeof syncLockToggle === 'function') syncLockToggle(); }
  } catch (e) { console.warn('Could not restore device settings.', e); }
}

function clearAllData() {
  if (isStateEmpty()) {
    setAutosaveStatus('Nothing to clear', 'idle');
    return;
  }
  openConfirmModal({
    title: 'Clear all data?',
    message: 'This permanently removes all plants, logs, vlog entries, breeding projects, and reports from this browser, returning the logbook to blank. Export a JSON backup first if you want to keep your data. This cannot be undone.',
    acceptLabel: 'Clear everything',
    requireText: 'DELETE',
    action: async () => {
      state = emptyState();
      selectedPlantId = '';
      clearAllDrafts();
      saveState();
      try { await pruneUnreferencedPhotos(); } catch (error) {
        showStorageError(`The logbook was cleared, but some photos could not be removed: ${error.message || error}`);
      }
      renderAll();
    },
  });
}

function updateStorageStatus() {
  const message = isStateEmpty()
    ? 'No saved grow data on this device yet. Notes save in this browser. Photos save in on-device storage. Export a full backup (it includes photos) before you rely on a new phone.'
    : 'Notes are saved in this browser. Photos are saved on this device, not in the small browser slot. Back up from Backups & Export — that one file includes the photos.';
  $$('[data-storage-status]').forEach((el) => { el.textContent = message; });
}

/* Build 13: every export goes through here. In the iPhone app the file is written to the cache folder and handed to
   the iOS share sheet (Save to Files, AirDrop, Print, Mail...); in a browser it is downloaded.
   Resolves 'shared' | 'downloaded' | 'cancelled' (user closed the sheet) and rejects if the file could not be produced. */
async function shareFile(filename, content, type, title) {
  const native = typeof isNativeApp === 'function' && isNativeApp();
  if (native) {
    const fsys = window.Capacitor.registerPlugin('Filesystem');
    const share = window.Capacitor.registerPlugin('Share');
    const written = await fsys.writeFile({ path: filename, data: String(content), directory: 'CACHE', encoding: 'utf8' });
    try {
      await share.share({ title: title || filename, files: [written.uri], dialogTitle: title || filename });
      return 'shared';
    } catch (error) {
      if (/cancel/i.test(String(error && (error.message || error)))) return 'cancelled';
      throw error;
    } finally {
      fsys.deleteFile({ path: filename, directory: 'CACHE' }).catch(() => {});
    }
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

async function downloadFile(filename, content, type, title) {
  try {
    return await shareFile(filename, content, type, title);
  } catch (error) {
    showStorageError(`Could not save ${filename}: ${error.message || error}`);
    return 'failed';
  }
}

/* Printing: iOS web views cannot print the page, so on the phone a clean HTML copy is shared instead (open it from
   Files and use Share > Print / Save as PDF). In a browser the normal print dialog is used. */
function printableDoc(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
<style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111;padding:20px;max-width:820px;margin:auto;line-height:1.4}h1{font-size:20px}h2{font-size:16px;margin-top:20px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #888;padding:4px 6px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;font:14px/1.5 inherit}.small{font-size:12px;color:#444}</style></head><body>${bodyHtml}</body></html>`;
}

async function printOrShare(title, filename, bodyHtml, browserPrint) {
  if (typeof isNativeApp === 'function' && isNativeApp()) {
    const res = await downloadFile(filename, printableDoc(title, bodyHtml), 'text/html', title);
    if (res === 'shared') showToast('Open the file, then Share › Print or Save as PDF.');
    return res;
  }
  browserPrint();
  return 'printed';
}

function harvestLabel(days) {
  if (days < 0) return `${Math.abs(days)}d past`;
  if (days === 0) return 'today';
  return `in ${days}d`;
}

function csvEscape(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[char]);
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function titleCase(value) {
  return String(value == null ? '' : value).replace(/\b\w/g, (letter) => letter.toUpperCase()); // b58: no crash on a plant without tagStatus
}

function getCss(variable) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
}

function getEmptyStateHtml() {
  return $('#empty-template').innerHTML;
}
