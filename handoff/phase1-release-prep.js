'use strict';

/*
  Phase 1 production archive prep for the Mac tree
  ~/Documents/Apps/Logbook/Builds/logbook-b61-phase1
  after phase1, incr6b, and the mother-list refresh are already applied.

  Build 61 is the latest Complete upload for App Store Connect app
  6820774919, train 1.0. The reported browser check found no build 62.
  This package uses 62. It does not upload, launch, or call Builds/b61-ship.sh.
*/

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const UPLOADED_BUILD = 61;
const RELEASE_BUILD = '62';
const ASC_APP = '6820774919';
const MARKETING = '1.0';
const PROD_ID = 'com.borikengenetics.logbookapp';
const QA_ID = 'com.borikengenetics.logbookapp.qa';
const TEAM = '2Z94YL957X';
const CACHE = 'boriken-genetics-logbook-app-v80';
const CONTAINER = 'iCloud.com.borikengenetics.logbookapp';
const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const SHOTS_REL = 'b59shots.js';
const SHOTS_SIZE = 120061;
const SHOTS_PREFIX = '1b7735fb296fefd5';
const SHOTS_SHA256 = '1b7735fb296fefd5f5c7427a3e558ad9237b90d7f8479f60b52ad5880533c5fc';
const APP_JS_AT_61 = '3c949b1a8b34d6f20590ac690de430e5aa53384b7c891008a80fd1ae3e97d399';

const EXPECTED = {
  'media-store.js': '484b53d4ba7520165ce81263701045317f36e82e578a7e64934a6cbb5ab45895',
  'styles.css': '2c17ab69692526da8dc4eb89b1de088e4f4b10581b520bf689d7a3f0cbe3aad3',
  'service-worker.js': 'f6825ca93fda9bd109d69b85cb63aeb488c9935b8f0b7cf1207d0e35b0d3f60d',
  'build59.css': '55d57bf28349aff607542b0475331e4698774f285f7cd5f692a829cb82fba1a8',
  'build59.js': '50c829d14ddf07a6f330b29b692c9c77782f3b396742cf30d066f29ee8679043',
  'build13.js': '389d60e770bfe9127465de05c914193afe347e9e6b7ebacb0b4d5648b743dcad',
};

const FORBIDDEN = [
  'This QA build cannot use iCloud.',
  'com.borikengenetics.logbookapp.qa',
  'Borikèn Logbook QA',
  'Boriken Logbook QA',
  'LogbookQAUITests',
  'QA_ISOLATION',
  'phase1-photos-tags.test.js',
  'phase1-release-prep',
  'plant-sheet-scroll.test.js',
  'mf-list-refresh.test.js',
  'QA LandRace',
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function read(p) {
  return fs.readFileSync(p);
}
function fail(msg) {
  const err = new Error(msg);
  err.phase1 = true;
  throw err;
}
function plistString(xml, key) {
  const m = String(xml).match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1] : '';
}

function plistXml(file) {
  const buf = read(file);
  if (buf.slice(0, 6).toString('ascii') !== 'bplist') return buf.toString('utf8');
  const converted = spawnSync('plutil', ['-convert', 'xml1', '-o', '-', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (converted.status === 0 && String(converted.stdout || '').includes('<key>')) return converted.stdout;
  const keys = ['CFBundleIdentifier', 'CFBundleShortVersionString', 'CFBundleVersion', 'CFBundleDisplayName'];
  const rows = [];
  for (const key of keys) {
    const buddy = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file], { encoding: 'utf8' });
    if (buddy.status === 0 && String(buddy.stdout || '').trim()) rows.push([key, buddy.stdout.trim()]);
  }
  if (!rows.length) {
    const detail = `${converted.stderr || converted.error || ''}${converted.stdout || ''}`.trim();
    fail(`Could not read ${file} with plutil or PlistBuddy. ${detail}`);
  }
  return `<plist><dict>${rows.map(([key, value]) => `<key>${key}</key><string>${value}</string>`).join('')}</dict></plist>`;
}
function appBuildOf(text) {
  const m = String(text).match(/const APP_BUILD = '(\d+)';/);
  return m ? m[1] : '';
}
function appJsNormalized(text) {
  return Buffer.from(String(text).replace(/const APP_BUILD = '\d+';/, "const APP_BUILD = '61';"));
}

function assertTree(root) {
  const abs = path.resolve(root);
  const base = path.basename(abs);
  if (base === 'logbook-b61rel' || abs.includes(`${path.sep}logbook-b61rel${path.sep}`)) {
    fail('This tree is logbook-b61rel. Builds/b61-ship.sh points there. Do not ship it.');
  }
  const issues = [];
  const bad = (msg) => issues.push(msg);
  for (const rel of Object.keys(EXPECTED)) {
    const file = path.join(abs, rel);
    if (!fs.existsSync(file)) bad(`Missing ${rel}`);
    else {
      const got = sha256(read(file));
      if (got !== EXPECTED[rel]) bad(`${rel} hash ${got} is not the phase1/incr6b/mother-list file`);
    }
  }
  const swPath = path.join(abs, 'service-worker.js');
  if (fs.existsSync(swPath) && !fs.readFileSync(swPath, 'utf8').includes(`const CACHE_NAME = '${CACHE}'`)) bad(`service-worker cache must be ${CACHE}`);
  const appPath = path.join(abs, 'app.js');
  let build = '';
  if (!fs.existsSync(appPath)) bad('Missing app.js');
  else {
    const app = fs.readFileSync(appPath, 'utf8');
    if (!app.includes("const APP_VERSION = '1.0';")) bad('APP_VERSION must stay 1.0');
    if (sha256(appJsNormalized(app)) !== APP_JS_AT_61) bad('app.js differs from the shipped build 61 source besides APP_BUILD');
    build = appBuildOf(app);
    if (!build) bad('APP_BUILD line missing in app.js');
  }
  const pbxPath = path.join(abs, 'ios/App/App.xcodeproj/project.pbxproj');
  const pbx = fs.existsSync(pbxPath) ? fs.readFileSync(pbxPath, 'utf8') : '';
  if (!pbx) bad('Missing ios/App/App.xcodeproj/project.pbxproj');
  else {
    const versions = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]))];
    if (versions.length !== 1) bad(`CURRENT_PROJECT_VERSION is not one value: ${versions.join(', ') || 'none'}`);
    else if (build && versions[0] !== build) bad(`APP_BUILD ${build} != CURRENT_PROJECT_VERSION ${versions[0]}`);
    const marketing = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim()))];
    if (marketing.length !== 1 || marketing[0] !== MARKETING) bad(`MARKETING_VERSION must stay ${MARKETING}`);
    let appRelease = 0;
    for (const block of pbx.matchAll(/buildSettings = \{([\s\S]*?)\};\s*name = (Debug|Release|QA);/g)) {
      const body = block[1];
      const name = block[2];
      if (name !== 'Release' || !body.includes('INFOPLIST_FILE = App/Info.plist;')) continue;
      appRelease += 1;
      if (!body.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${PROD_ID};`)) bad('App Release bundle id is not the production id');
      if (body.includes(QA_ID)) bad('App Release settings contain the QA bundle id');
      if (!body.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) bad('App Release entitlements are not App/App.entitlements');
      if (!body.includes('CODE_SIGN_STYLE = Automatic;')) bad('App Release signing is not automatic');
      if (!body.includes(`DEVELOPMENT_TEAM = ${TEAM};`)) bad('App Release team is not 2Z94YL957X');
      if (/QA_ISOLATION/.test(body)) bad('App Release compiles QA_ISOLATION');
    }
    if (appRelease !== 1) bad(`Expected one App Release configuration, found ${appRelease}`);
    if (pbx.includes('isa = PBXNativeTarget;') && !pbx.includes('path = App.app;')) bad('App product is not App.app');
  }
  const entPath = path.join(abs, 'ios/App/App/App.entitlements');
  if (!fs.existsSync(entPath)) bad('Missing App/App.entitlements');
  else {
    const ent = fs.readFileSync(entPath, 'utf8');
    if (!ent.includes(CONTAINER)) bad('App.entitlements is missing the production iCloud container');
    if (!ent.includes('CloudKit') || !ent.includes('CloudDocuments')) bad('App.entitlements is missing production iCloud services');
  }
  const capPath = path.join(abs, 'capacitor.config.json');
  if (!fs.existsSync(capPath)) bad('Missing capacitor.config.json');
  else {
    const cap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
    if (cap.appId !== PROD_ID) bad(`capacitor.config.json appId is ${cap.appId}`);
  }
  const infoPath = path.join(abs, 'ios/App/App/Info.plist');
  if (fs.existsSync(infoPath) && fs.readFileSync(infoPath, 'utf8').includes('Borikèn Logbook QA')) bad('App/Info.plist display name is the QA name');
  issues.push(...webTreeIssues(abs));
  let scheme = null;
  try { scheme = findReleaseScheme(abs, pbx); }
  catch (error) { bad(error.message); }
  if (issues.length) fail(issues.join('\n'));
  return { root: abs, build, scheme };
}

function webTreeIssues(root) {
  const script = path.join(root, 'scripts/build-www.js');
  if (!fs.existsSync(script)) return [];
  const src = fs.readFileSync(script, 'utf8');
  const block = src.match(/const files = \[([\s\S]*?)\];/);
  if (!block) return [];
  const files = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const dirs = [...src.matchAll(/copyDir\('([^']+)'\)/g)].map((m) => m[1]);
  const issues = [];
  for (const rel of files) if (!fs.existsSync(path.join(root, rel))) issues.push(`build-www.js lists missing ${rel}`);
  for (const rel of dirs) if (!fs.existsSync(path.join(root, rel))) issues.push(`build-www.js lists missing directory ${rel}`);
  const pub = path.join(root, 'ios/App/App/public');
  if (!fs.existsSync(pub)) return issues;
  const allowed = new Set(files);
  const extras = [];
  const walk = (dir, base) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const rel = path.join(base, name).split(path.sep).join('/');
      if (fs.statSync(p).isDirectory()) {
        if (!dirs.includes(rel)) walk(p, rel);
      } else if (!allowed.has(rel) && !dirs.some((d) => rel.startsWith(`${d}/`))) extras.push(rel);
    }
  };
  walk(pub, '');
  for (const rel of extras) {
    const found = extraClass(path.join(pub, rel), rel);
    if (found.kind === 'bad') issues.push(found.why);
  }
  return issues;
}

function extraClass(absFile, rel) {
  const buf = read(absFile);
  const hash = sha256(buf);
  if (rel === 'cordova.js' || rel === 'cordova_plugins.js') {
    if (buf.length === 0 && hash === EMPTY_SHA256) return { kind: 'cordova', hash };
    return { kind: 'bad', why: `${rel} is ${buf.length} bytes ${hash}, not the empty Capacitor file. It was not replaced.` };
  }
  if (rel === SHOTS_REL) {
    if (buf.length === SHOTS_SIZE && hash === SHOTS_SHA256) return { kind: 'shots', hash };
    return { kind: 'bad', why: `${SHOTS_REL} is ${buf.length} bytes ${hash}, not the Nov 3 screenshot helper. It was left in place.` };
  }
  return { kind: 'bad', why: `ios/App/App/public/${rel} is not copied by build-www.js and is not an allowed exclusion` };
}

function shotsReferenced(root) {
  const hits = [];
  for (const rel of ['index.html', 'service-worker.js']) {
    const file = path.join(root, rel);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(SHOTS_REL)) hits.push(rel);
  }
  return hits;
}

function quarantineShots(root) {
  const src = path.join(root, 'ios/App/App/public', SHOTS_REL);
  if (!fs.existsSync(src)) return '';
  const refs = shotsReferenced(root);
  if (refs.length) fail(`${refs.join(' and ')} reference ${SHOTS_REL}. It was left in public.`);
  const found = extraClass(src, SHOTS_REL);
  if (found.kind !== 'shots') fail(found.why);
  const destDir = path.join(root, 'build/release/quarantine');
  const dest = path.join(destDir, SHOTS_REL);
  fs.mkdirSync(destDir, { recursive: true });
  if (fs.existsSync(dest) && sha256(read(dest)) !== found.hash) {
    fail(`build/release/quarantine/${SHOTS_REL} is a different file. public/${SHOTS_REL} was left in place.`);
  }
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  if (sha256(read(dest)) !== found.hash) fail(`Quarantine copy of ${SHOTS_REL} did not match. public/${SHOTS_REL} was left in place.`);
  fs.writeFileSync(path.join(destDir, 'b59shots-location.txt'), `original ios/App/App/public/${SHOTS_REL}\nsha256 ${found.hash}\nbytes ${SHOTS_SIZE}\n`);
  fs.unlinkSync(src);
  return dest;
}

function schemeFiles(root) {
  const proj = path.join(root, 'ios/App/App.xcodeproj');
  const files = [];
  for (const dir of ['xcshareddata/xcschemes', 'xcuserdata']) {
    const base = path.join(proj, dir);
    if (!fs.existsSync(base)) continue;
    const walk = (d) => {
      for (const name of fs.readdirSync(d)) {
        const p = path.join(d, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.xcscheme')) files.push(p);
      }
    };
    walk(base);
  }
  return files;
}

function schemeArchive(xml) {
  return (xml.match(/<ArchiveAction[\s\S]*?buildConfiguration = "([^"]+)"/) || [])[1] || '';
}

function listReleaseSchemes(root) {
  const found = schemeFiles(root).map((file) => {
    const xml = fs.readFileSync(file, 'utf8');
    return { file, name: path.basename(file, '.xcscheme'), archive: schemeArchive(xml), xml };
  }).filter((s) => s.name !== 'App-QA' && s.archive === 'Release');
  found.sort((a, b) => (a.name === 'App' ? -1 : 1) - (b.name === 'App' ? -1 : 1));
  return found.map((s) => ({ ...s, buildableName: buildableName(s.xml) }));
}

function buildableName(xml) {
  const block = (xml.match(/<BuildableReference\b[^>]*BlueprintName = "App"[^>]*>/) || [])[0] || '';
  return (block.match(/BuildableName = "([^"]+)"/) || [])[1] || 'App.app';
}

function appTargetRef(root) {
  const refs = [];
  for (const file of schemeFiles(root)) {
    const xml = fs.readFileSync(file, 'utf8');
    for (const block of xml.match(/<BuildableReference\b[^>]*>/g) || []) {
      const attr = (name) => (block.match(new RegExp(`${name} = "([^"]*)"`)) || [])[1] || '';
      if (attr('BlueprintName') !== 'App' || !attr('BlueprintIdentifier')) continue;
      refs.push({
        id: attr('BlueprintIdentifier'),
        buildableName: attr('BuildableName') || 'App.app',
        container: attr('ReferencedContainer') || 'container:App.xcodeproj',
        upgrade: (xml.match(/LastUpgradeVersion = "([^"]+)"/) || [])[1] || '',
      });
    }
  }
  const ids = [...new Set(refs.map((r) => r.id))];
  if (ids.length !== 1) return null;
  return refs[0];
}

function sharedAppSchemePath(root) {
  return path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme');
}

function schemeXml(ref) {
  const upgrade = ref.upgrade ? `\n   LastUpgradeVersion = "${ref.upgrade}"` : '';
  const reference = `               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${ref.id}"
               BuildableName = "${ref.buildableName}"
               BlueprintName = "App"
               ReferencedContainer = "${ref.container}"`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme${upgrade}
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
${reference}>
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
${reference}>
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
${reference}>
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

const SCHEME_QUERY = [
  'No saved scheme archives the App target with Release. App-QA stays on QA and is not the archive.',
  'The App target id was not found in a saved scheme, so none was invented.',
  'Send these from the phase 1 tree:',
  '1. Every BuildableReference in ios/App/App.xcodeproj/xcshareddata/xcschemes/App-QA.xcscheme whose BlueprintName is App.',
  '2. The PBXNativeTarget block in project.pbxproj whose comment is App, including its id.',
  '3. xcodebuild -project ios/App/App.xcodeproj -list',
  '4. The names in xcshareddata/xcschemes and xcuserdata/*/xcschemes.',
].join('\n');

function ensureSharedAppScheme(root, pbx) {
  const dest = sharedAppSchemePath(root);
  if (fs.existsSync(dest) && schemeArchive(fs.readFileSync(dest, 'utf8')) !== 'Release') {
    fail(`Shared App.xcscheme does not archive with Release. It was not overwritten.`);
  }
  const ref = appTargetRef(root);
  if (!ref) fail(SCHEME_QUERY);
  if (pbx && !new RegExp(`${ref.id} /\\* App \\*/ = \\{\\s*isa = PBXNativeTarget;`).test(pbx)) {
    fail(`Scheme App id ${ref.id} is not the App native target in project.pbxproj.\n${SCHEME_QUERY}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const before = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8') : '';
  const next = schemeXml(ref);
  if (before !== next) fs.writeFileSync(dest, next);
  return { file: dest, created: before !== next, buildableName: ref.buildableName };
}

function findReleaseScheme(root, pbx) {
  const saved = listReleaseSchemes(root);
  const app = saved.find((s) => s.name === 'App');
  if (app) return { ...app, created: false };
  const made = ensureSharedAppScheme(root, pbx || '');
  const again = listReleaseSchemes(root).find((s) => s.name === 'App');
  if (!again) fail(SCHEME_QUERY);
  return { ...again, created: made.created, buildableName: made.buildableName || again.buildableName };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.root = argv[++i];
    else if (a === '--build') out.build = argv[++i];
    else if (a === '--confirm-unused') out.confirm = true;
    else if (a === '--archive') out.archive = argv[++i];
    else if (a.startsWith('--')) fail(`Unknown option ${a}`);
    else out._.push(a);
  }
  out.cmd = out._[0] || 'check';
  if (['upload', 'altool', 'launch', 'run'].includes(out.cmd)) fail('This script does not upload or launch.');
  return out;
}

function requireBuild(opts) {
  if (opts.build !== RELEASE_BUILD) fail(`This package uses build ${RELEASE_BUILD}. Build ${UPLOADED_BUILD} is the latest Complete upload for app ${ASC_APP}.`);
  if (!opts.confirm) fail(`Pass --confirm-unused with --build ${RELEASE_BUILD}. The browser check reported no build ${RELEASE_BUILD}; this script does not query App Store Connect.`);
  return RELEASE_BUILD;
}

function bump(root, build) {
  const appPath = path.join(root, 'app.js');
  const app = fs.readFileSync(appPath, 'utf8');
  const current = appBuildOf(app);
  if (current !== build) {
    if (current !== String(UPLOADED_BUILD) && current !== build) fail(`APP_BUILD is ${current}, not 61 or ${build}`);
    fs.writeFileSync(appPath, app.replace(/const APP_BUILD = '\d+';/, `const APP_BUILD = '${build}';`));
  }
  const pbxPath = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');
  let pbx = fs.readFileSync(pbxPath, 'utf8');
  const values = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]))];
  if (values.length === 1 && values[0] === build) return;
  if (!(values.length === 1 && values[0] === String(UPLOADED_BUILD))) fail(`Refusing to rewrite CURRENT_PROJECT_VERSION from ${values.join(', ')}`);
  pbx = pbx.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  if (pbx.includes(QA_ID) && pbx.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${QA_ID};`) !== true) fail('QA bundle id changed while rewriting the version');
  fs.writeFileSync(pbxPath, pbx);
}

function exportPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>destination</key>
	<string>export</string>
	<key>manageAppVersionAndBuildNumber</key>
	<false/>
	<key>method</key>
	<string>app-store-connect</string>
	<key>signingStyle</key>
	<string>automatic</string>
	<key>stripSwiftSymbols</key>
	<true/>
	<key>teamID</key>
	<string>${TEAM}</string>
	<key>testFlightInternalTestingOnly</key>
	<true/>
	<key>uploadSymbols</key>
	<true/>
</dict>
</plist>
`;
}

function assertInternalPlist(text) {
  const at = text.indexOf('<key>testFlightInternalTestingOnly</key>');
  const after = at < 0 ? '' : text.slice(at, at + 90);
  if (!after.includes('<true/>') || after.includes('<false/>')) {
    fail('Export options must set testFlightInternalTestingOnly true. Do not use logbook-b61-ExportOptions.plist.');
  }
  if (text.includes('<string>upload</string>')) fail('Export destination must be export, not upload.');
  if (!text.includes('<string>app-store-connect</string>')) fail('Export method must be app-store-connect.');
}

function rebuildWeb(root) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/build-www.js')], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) fail(`build-www.js failed\n${r.stdout || ''}${r.stderr || ''}`);
}

function copyPublic(root) {
  const www = path.join(root, 'www');
  const pub = path.join(root, 'ios/App/App/public');
  if (!fs.existsSync(www)) fail('www/ was not produced');
  fs.mkdirSync(pub, { recursive: true });
  const extras = [];
  const walk = (dir, base, into) => {
    for (const name of fs.readdirSync(dir)) {
      const from = path.join(dir, name);
      const rel = path.join(base, name);
      if (fs.statSync(from).isDirectory()) walk(from, rel, into);
      else into.push(rel.split(path.sep).join('/'));
    }
  };
  const wwwFiles = [];
  const pubFiles = [];
  walk(www, '', wwwFiles);
  if (fs.existsSync(pub)) walk(pub, '', pubFiles);
  const wwwSet = new Set(wwwFiles);
  for (const rel of pubFiles) if (!wwwSet.has(rel)) extras.push(rel);
  const blocked = [];
  for (const rel of extras) {
    const found = extraClass(path.join(pub, rel), rel);
    if (found.kind === 'cordova') continue;
    if (found.kind === 'shots') blocked.push(`${rel} is still in public. Quarantine it before copying.`);
    else blocked.push(found.why);
  }
  if (blocked.length) fail(blocked.join('\n'));
  for (const rel of wwwFiles) {
    const from = path.join(www, rel);
    const to = path.join(pub, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  for (const rel of Object.keys(EXPECTED)) {
    const got = sha256(read(path.join(pub, rel)));
    if (got !== EXPECTED[rel]) fail(`public/${rel} was not copied from the patched source`);
  }
  const shippedApp = fs.readFileSync(path.join(pub, 'app.js'), 'utf8');
  if (sha256(appJsNormalized(shippedApp)) !== APP_JS_AT_61) fail('public/app.js is not the patched source');
}

function writeManifest(root, build) {
  const dir = path.join(root, 'build/release');
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    `marketing ${MARKETING}`,
    `build ${build}`,
    `bundle ${PROD_ID}`,
    `cache ${CACHE}`,
    `ASC app ${ASC_APP} train ${MARKETING}: latest Complete upload is build ${UPLOADED_BUILD}; no build ${RELEASE_BUILD} was in the reported rows. This script did not query App Store Connect.`,
    'upload: not performed',
  ];
  const pub = path.join(root, 'ios/App/App/public');
  const walk = (dirp, base) => {
    for (const name of fs.readdirSync(dirp)) {
      const p = path.join(dirp, name);
      const rel = path.join(base, name).split(path.sep).join('/');
      if (fs.statSync(p).isDirectory()) walk(p, rel);
      else lines.push(`${sha256(read(p))}  public/${rel}`);
    }
  };
  walk(pub, '');
  const text = `${lines.join('\n')}\n`;
  fs.writeFileSync(path.join(dir, 'content-manifest.txt'), text);
  return text;
}

function forbiddenHits(buf) {
  const text = Buffer.isBuffer(buf) ? buf.toString('latin1') : String(buf);
  return FORBIDDEN.filter((s) => text.includes(s));
}

function inspectAppDir(appDir) {
  const infoPath = path.join(appDir, 'Info.plist');
  if (!fs.existsSync(infoPath)) fail(`No Info.plist in ${appDir}`);
  const info = plistXml(infoPath);
  const id = plistString(info, 'CFBundleIdentifier');
  const marketing = plistString(info, 'CFBundleShortVersionString');
  const build = plistString(info, 'CFBundleVersion');
  const display = plistString(info, 'CFBundleDisplayName');
  if (id !== PROD_ID) fail(`Archived bundle id is ${id || 'missing'}`);
  if (marketing !== MARKETING) fail(`Archived marketing version is ${marketing || 'missing'}`);
  if (!display || display.includes('QA')) fail(`Archived display name is ${display || 'missing'}`);
  const xcent = path.join(appDir, 'archived-expanded-entitlements.xcent');
  let ent = '';
  if (fs.existsSync(xcent)) ent = plistXml(xcent);
  else {
    const signed = spawnSync('codesign', ['-d', '--entitlements', ':-', appDir], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    ent = `${signed.stdout || ''}${signed.stderr || ''}`;
  }
  if (!ent.includes(CONTAINER)) fail('Archived entitlements do not contain the production iCloud container');
  const signed = spawnSync('codesign', ['-d', '--verbose=2', appDir], { encoding: 'utf8' });
  const signing = `${signed.stdout || ''}\n${signed.stderr || ''}`;
  const team = (signing.match(/TeamIdentifier=([A-Z0-9]+)/) || [])[1] || '';
  if (team && team !== TEAM) fail(`Archive team is ${team}, not ${TEAM}`);
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const rel = path.relative(appDir, p);
      hits.push(...forbiddenHits(rel).map((s) => `${rel}: ${s}`));
      if (rel.split(path.sep).pop() === SHOTS_REL) hits.push(`${rel}: ${SHOTS_REL}`);
      if (fs.statSync(p).isDirectory()) walk(p);
      else hits.push(...forbiddenHits(read(p)).map((s) => `${rel}: ${s}`));
    }
  };
  walk(appDir);
  if (hits.length) fail(`Archive contains QA or test material: ${hits.join('; ')}`);
  return { id, marketing, build, display };
}

function unzipApp(ipa, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  const r = spawnSync('unzip', ['-q', ipa, '-d', dest], { encoding: 'utf8' });
  if (r.status !== 0) fail(`Could not unzip ${ipa}`);
  const payload = path.join(dest, 'Payload');
  const apps = fs.readdirSync(payload).filter((n) => n.endsWith('.app'));
  if (apps.length !== 1) fail(`IPA payload has ${apps.length} apps`);
  return path.join(payload, apps[0]);
}

function runXcode(args, root, logName) {
  const r = spawnSync('xcodebuild', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const logPath = path.join(root, 'build/release', logName);
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, `${r.stdout || ''}${r.stderr || ''}`);
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) fail(`xcodebuild could not be started: ${r.error.message}. Full output: ${logPath}`);
  if (r.status !== 0) fail(`xcodebuild exited ${r.status}. Full output: ${logPath}`);
}

function prep(opts) {
  const build = requireBuild(opts);
  const tree = assertTree(opts.root);
  bump(tree.root, build);
  assertTree(tree.root);
  rebuildWeb(tree.root);
  quarantineShots(tree.root);
  copyPublic(tree.root);
  const plist = exportPlist();
  assertInternalPlist(plist);
  const dir = path.join(tree.root, 'build/release');
  fs.mkdirSync(dir, { recursive: true });
  const plistPath = path.join(dir, 'Logbook-Internal-ExportOptions.plist');
  fs.writeFileSync(plistPath, plist);
  const manifest = writeManifest(tree.root, build);
  const shipped = appBuildOf(fs.readFileSync(path.join(tree.root, 'ios/App/App/public/app.js'), 'utf8'));
  if (shipped !== build) fail(`public/app.js APP_BUILD is ${shipped}`);
  scanPublic(tree.root);
  return { build, plistPath, scheme: tree.scheme, manifest };
}

function scanPublic(root) {
  const pub = path.join(root, 'ios/App/App/public');
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const rel = path.relative(pub, p);
      hits.push(...forbiddenHits(rel).map((s) => `${rel}: ${s}`));
      if (fs.statSync(p).isDirectory()) walk(p);
      else hits.push(...forbiddenHits(read(p)).map((s) => `${rel}: ${s}`));
    }
  };
  walk(pub);
  if (hits.length) fail(`www/public contains QA or test material: ${hits.join('; ')}`);
}

function archivesRoot(home) {
  return path.join(home || os.homedir(), 'Library/Developer/Xcode/Archives');
}

function archiveParts(now) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const stamp = `${day}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return { day, stamp };
}

function planArchive(home, now) {
  const { day, stamp } = archiveParts(now || new Date());
  const archivePath = path.join(archivesRoot(home), day, `Logbook-phase1-${stamp}.xcarchive`);
  if (fs.existsSync(archivePath)) fail(`Refusing to overwrite ${archivePath}`);
  return archivePath;
}

function archiveRecordPath(root) {
  return path.join(root, 'build/release/archive-path.txt');
}

function writeArchiveRecord(root, archivePath) {
  const record = archiveRecordPath(root);
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, `${archivePath}\n`);
}

function readArchivePath(root, home) {
  const record = archiveRecordPath(root);
  if (!fs.existsSync(record)) fail('No recorded archive. Archive first.');
  const archivePath = fs.readFileSync(record, 'utf8').trim();
  const resolved = path.resolve(archivePath);
  const rootDir = archivesRoot(home);
  if (!path.isAbsolute(archivePath) || resolved !== archivePath || !resolved.startsWith(rootDir + path.sep) || !resolved.endsWith('.xcarchive')) {
    fail(`Recorded archive is not an xcarchive under ${rootDir}`);
  }
  if (!fs.existsSync(resolved)) fail(`Recorded archive is missing: ${resolved}`);
  return resolved;
}

function archive(opts) {
  const built = prep(opts);
  const root = path.resolve(opts.root);
  const archivePath = planArchive();
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  if (fs.existsSync(archivePath)) fail(`Refusing to overwrite ${archivePath}`);
  runXcode([
    '-project', 'ios/App/App.xcodeproj',
    '-scheme', built.scheme.name,
    '-configuration', 'Release',
    '-destination', 'generic/platform=iOS',
    '-derivedDataPath', 'build/release-derived',
    '-archivePath', archivePath,
    '-allowProvisioningUpdates',
    'archive',
  ], root, 'xcode-archive.log');
  const app = path.join(archivePath, 'Products/Applications', built.scheme.buildableName || 'App.app');
  const info = inspectAppDir(app);
  if (info.build !== built.build) fail(`Archive build is ${info.build}, expected ${built.build}`);
  writeArchiveRecord(root, archivePath);
  return { archivePath, info, plistPath: built.plistPath };
}

function inspectBundledWeb(appDir) {
  const pub = path.join(appDir, 'public');
  if (!fs.existsSync(pub)) fail('Archive app has no public web directory');
  for (const rel of Object.keys(EXPECTED)) {
    const file = path.join(pub, rel);
    if (!fs.existsSync(file)) fail(`Archive is missing public/${rel}`);
    const got = sha256(read(file));
    if (got !== EXPECTED[rel]) fail(`Archive public/${rel} hash ${got}`);
  }
  const appJsPath = path.join(pub, 'app.js');
  if (!fs.existsSync(appJsPath)) fail('Archive is missing public/app.js');
  const appJs = fs.readFileSync(appJsPath, 'utf8');
  if (appBuildOf(appJs) !== RELEASE_BUILD) fail(`Archive public/app.js APP_BUILD is ${appBuildOf(appJs) || 'missing'}`);
  if (sha256(appJsNormalized(appJs)) !== APP_JS_AT_61) fail('Archive public/app.js differs from the build 61 source besides APP_BUILD');
  if (fs.existsSync(path.join(pub, SHOTS_REL))) fail(`Archive public still contains ${SHOTS_REL}`);
}

function adoptArchive(opts) {
  const root = path.resolve(opts.root);
  if (!opts.archive) fail('--archive is required');
  const archivePath = path.resolve(opts.archive);
  const rootDir = archivesRoot(opts.home);
  if (!path.isAbsolute(opts.archive) || !archivePath.startsWith(rootDir + path.sep) || !archivePath.endsWith('.xcarchive') || !fs.existsSync(archivePath)) {
    fail(`--archive must be an existing xcarchive under ${rootDir}`);
  }
  const app = path.join(archivePath, 'Products/Applications/App.app');
  if (!fs.existsSync(app)) fail(`Archive has no ${app}`);
  const info = inspectAppDir(app);
  if (info.build !== RELEASE_BUILD) fail(`Archive build is ${info.build}, expected ${RELEASE_BUILD}`);
  inspectBundledWeb(app);
  const record = archiveRecordPath(root);
  if (fs.existsSync(record)) {
    const current = fs.readFileSync(record, 'utf8').trim();
    if (path.resolve(current) !== archivePath) fail(`archive-path.txt already records ${current}. It was not overwritten.`);
  } else writeArchiveRecord(root, archivePath);
  if (!fs.existsSync(archivePath)) fail('Archive is missing after adopt.');
  return { archivePath, info };
}

function exportIpa(opts) {
  const root = path.resolve(opts.root);
  const archivePath = readArchivePath(root);
  const plistPath = path.join(root, 'build/release/Logbook-Internal-ExportOptions.plist');
  assertInternalPlist(fs.readFileSync(plistPath, 'utf8'));
  const exportDir = path.join(root, 'build/release/export');
  fs.rmSync(exportDir, { recursive: true, force: true });
  runXcode([
    '-exportArchive',
    '-archivePath', archivePath,
    '-exportPath', 'build/release/export',
    '-exportOptionsPlist', 'build/release/Logbook-Internal-ExportOptions.plist',
    '-allowProvisioningUpdates',
  ], root, 'xcode-export.log');
  const ipas = fs.readdirSync(exportDir).filter((n) => n.endsWith('.ipa'));
  if (ipas.length !== 1) fail(`Export produced ${ipas.length} ipa files`);
  const ipa = path.join(exportDir, ipas[0]);
  const app = unzipApp(ipa, path.join(exportDir, 'unpacked'));
  const info = inspectAppDir(app);
  return { ipa, info };
}

function main(argv) {
  const opts = parseArgs(argv);
  if (!opts.root) fail('--root is required');
  if (opts.cmd === 'check') {
    const tree = assertTree(opts.root);
    console.log(`check ok: ${tree.root}`);
    console.log(`current build ${tree.build}; release build ${RELEASE_BUILD}; uploaded build ${UPLOADED_BUILD}; marketing ${MARKETING}`);
    console.log(`release scheme ${tree.scheme.name} (${path.basename(tree.scheme.file)})${tree.scheme.created ? ' shared scheme written' : ''}`);
    console.log('No version was changed. No archive was made.');
    return;
  }
  if (opts.cmd === 'prep') {
    const r = prep(opts);
    console.log(`prep ok: build ${r.build}, scheme ${r.scheme.name}`);
    console.log(r.plistPath);
    return;
  }
  if (opts.cmd === 'archive') {
    const r = archive(opts);
    console.log(`archive ok: ${r.info.id} ${r.info.marketing} (${r.info.build})`);
    console.log(r.archivePath);
    return;
  }
  if (opts.cmd === 'adopt') {
    const r = adoptArchive(opts);
    console.log(`adopt ok: ${r.info.id} ${r.info.marketing} (${r.info.build}) ${r.info.display}`);
    console.log(r.archivePath);
    console.log('Recorded. The archive was not overwritten or deleted. Not exported or uploaded.');
    return;
  }
  if (opts.cmd === 'export') {
    requireBuild(opts);
    const r = exportIpa(opts);
    console.log(`export ok: ${r.info.id} ${r.info.marketing} (${r.info.build})`);
    console.log(r.ipa);
    console.log('Not uploaded. Internal TestFlight only. Do not launch the app.');
    return;
  }
  if (opts.cmd === 'inspect') {
    const root = path.resolve(opts.root);
    const archivePath = readArchivePath(root);
    const scheme = listReleaseSchemes(root).find((s) => s.name === 'App');
    const app = path.join(archivePath, 'Products/Applications', scheme && scheme.buildableName ? scheme.buildableName : 'App.app');
    const info = inspectAppDir(app);
    console.log(`archive ${archivePath}`);
    console.log(`archive ${info.id} ${info.marketing} (${info.build}) ${info.display}`);
    const exportDir = path.join(root, 'build/release/export');
    if (fs.existsSync(exportDir)) {
      const ipas = fs.readdirSync(exportDir).filter((n) => n.endsWith('.ipa'));
      for (const name of ipas) {
        const unpacked = unzipApp(path.join(exportDir, name), path.join(exportDir, 'unpacked'));
        const info = inspectAppDir(unpacked);
        console.log(`ipa ${name} ${info.id} ${info.marketing} (${info.build})`);
      }
    }
    return;
  }
  fail(`Unknown command ${opts.cmd}`);
}

module.exports = {
  EXPECTED, UPLOADED_BUILD, RELEASE_BUILD, ASC_APP, CACHE, PROD_ID, CONTAINER, exportPlist, assertInternalPlist,
  assertTree, bump, prep, inspectAppDir, parseArgs, requireBuild, forbiddenHits, findReleaseScheme, webTreeIssues,
  extraClass, quarantineShots, copyPublic, adoptArchive, plistXml, EMPTY_SHA256, SHOTS_REL, SHOTS_SIZE, SHOTS_PREFIX, SHOTS_SHA256,
  archivesRoot, planArchive, writeArchiveRecord, readArchivePath,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
