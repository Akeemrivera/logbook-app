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
const APP_JS_AT_61 = '3c949b1a8b34d6f20590ac690de430e5aa53384b7c891008a80fd1ae3e97d399';

const EXPECTED = {
  'media-store.js': '484b53d4ba7520165ce81263701045317f36e82e578a7e64934a6cbb5ab45895',
  'styles.css': '2c17ab69692526da8dc4eb89b1de088e4f4b10581b520bf689d7a3f0cbe3aad3',
  'service-worker.js': 'f6825ca93fda9bd109d69b85cb63aeb488c9935b8f0b7cf1207d0e35b0d3f60d',
  'build59.css': '55d57bf28349aff607542b0475331e4698774f285f7cd5f692a829cb82fba1a8',
  'build59.js': '50c829d14ddf07a6f330b29b692c9c77782f3b396742cf30d066f29ee8679043',
  'build13.js': '2d83685eb5703932b5f621ac43a01971c208b8fde6e39f43f75f2715f91676e2',
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
  for (const rel of Object.keys(EXPECTED)) {
    const file = path.join(abs, rel);
    if (!fs.existsSync(file)) fail(`Missing ${rel}`);
    const got = sha256(read(file));
    if (got !== EXPECTED[rel]) fail(`${rel} hash ${got} is not the phase1/incr6b/mother-list file`);
  }
  const sw = fs.readFileSync(path.join(abs, 'service-worker.js'), 'utf8');
  if (!sw.includes(`const CACHE_NAME = '${CACHE}'`)) fail(`service-worker cache must be ${CACHE}`);
  const appPath = path.join(abs, 'app.js');
  const app = fs.readFileSync(appPath, 'utf8');
  if (!app.includes("const APP_VERSION = '1.0';")) fail('APP_VERSION must stay 1.0');
  if (sha256(appJsNormalized(app)) !== APP_JS_AT_61) fail('app.js differs from the shipped build 61 source besides APP_BUILD');
  const build = appBuildOf(app);
  if (!build) fail('APP_BUILD line missing in app.js');
  const pbxPath = path.join(abs, 'ios/App/App.xcodeproj/project.pbxproj');
  const pbx = fs.readFileSync(pbxPath, 'utf8');
  const versions = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]))];
  if (versions.length !== 1) fail(`CURRENT_PROJECT_VERSION is not one value: ${versions.join(', ')}`);
  if (versions[0] !== build) fail(`APP_BUILD ${build} != CURRENT_PROJECT_VERSION ${versions[0]}`);
  const marketing = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim()))];
  if (marketing.length !== 1 || marketing[0] !== MARKETING) fail(`MARKETING_VERSION must stay ${MARKETING}`);
  let appRelease = 0;
  for (const block of pbx.matchAll(/buildSettings = \{([\s\S]*?)\};\s*name = (Debug|Release|QA);/g)) {
    const body = block[1];
    const name = block[2];
    if (name !== 'Release' || !body.includes('INFOPLIST_FILE = App/Info.plist;')) continue;
    appRelease += 1;
    if (!body.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${PROD_ID};`)) fail('App Release bundle id is not the production id');
    if (body.includes(QA_ID)) fail('App Release settings contain the QA bundle id');
    if (!body.includes('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')) fail('App Release entitlements are not App/App.entitlements');
    if (!body.includes('CODE_SIGN_STYLE = Automatic;')) fail('App Release signing is not automatic');
    if (!body.includes(`DEVELOPMENT_TEAM = ${TEAM};`)) fail('App Release team is not 2Z94YL957X');
    if (/QA_ISOLATION/.test(body)) fail('App Release compiles QA_ISOLATION');
  }
  if (appRelease !== 1) fail(`Expected one App Release configuration, found ${appRelease}`);
  const ent = fs.readFileSync(path.join(abs, 'ios/App/App/App.entitlements'), 'utf8');
  if (!ent.includes(CONTAINER)) fail('App.entitlements is missing the production iCloud container');
  if (!ent.includes('CloudKit') || !ent.includes('CloudDocuments')) fail('App.entitlements is missing production iCloud services');
  const cap = JSON.parse(fs.readFileSync(path.join(abs, 'capacitor.config.json'), 'utf8'));
  if (cap.appId !== PROD_ID) fail(`capacitor.config.json appId is ${cap.appId}`);
  const scheme = findReleaseScheme(abs);
  return { root: abs, build, scheme };
}

function findReleaseScheme(root) {
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
  const found = files.map((file) => {
    const xml = fs.readFileSync(file, 'utf8');
    const archive = (xml.match(/<ArchiveAction[\s\S]*?buildConfiguration = "([^"]+)"/) || [])[1] || '';
    return { file, name: path.basename(file, '.xcscheme'), archive, qa: /buildConfiguration = "QA"/.test(xml) };
  }).filter((s) => s.name !== 'App-QA' && s.archive === 'Release');
  if (!found.length) fail('No shared or user scheme archives with Release. Do not archive App-QA.');
  found.sort((a, b) => (a.name === 'App' ? -1 : 1) - (b.name === 'App' ? -1 : 1));
  return found[0];
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.root = argv[++i];
    else if (a === '--build') out.build = argv[++i];
    else if (a === '--confirm-unused') out.confirm = true;
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
  if (extras.length) fail(`ios/App/App/public has files that are not in www/: ${extras.join(', ')}. This script does not delete them.`);
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
  const info = fs.readFileSync(infoPath, 'utf8');
  const id = plistString(info, 'CFBundleIdentifier');
  const marketing = plistString(info, 'CFBundleShortVersionString');
  const build = plistString(info, 'CFBundleVersion');
  const display = plistString(info, 'CFBundleDisplayName');
  if (id !== PROD_ID) fail(`Archived bundle id is ${id || 'missing'}`);
  if (marketing !== MARKETING) fail(`Archived marketing version is ${marketing || 'missing'}`);
  if (display.includes('QA')) fail(`Archived display name is ${display}`);
  let ent = '';
  const xcent = path.join(appDir, 'archived-expanded-entitlements.xcent');
  if (fs.existsSync(xcent)) ent = fs.readFileSync(xcent, 'utf8');
  else {
    const signed = spawnSync('codesign', ['-d', '--entitlements', ':-', appDir], { encoding: 'utf8' });
    if (signed.status === 0) ent = signed.stdout || '';
  }
  if (!ent.includes(CONTAINER)) fail('Archived entitlements do not contain the production iCloud container');
  const hits = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const rel = path.relative(appDir, p);
      hits.push(...forbiddenHits(rel).map((s) => `${rel}: ${s}`));
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

function runXcode(args, root) {
  const r = spawnSync('xcodebuild', args, { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) fail(`xcodebuild failed\n${(r.stdout || '').slice(-2000)}\n${(r.stderr || '').slice(-2000)}`);
}

function prep(opts) {
  const build = requireBuild(opts);
  const tree = assertTree(opts.root);
  bump(tree.root, build);
  assertTree(tree.root);
  rebuildWeb(tree.root);
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
  ], root);
  const app = path.join(archivePath, 'Products/Applications/App.app');
  const info = inspectAppDir(app);
  if (info.build !== built.build) fail(`Archive build is ${info.build}, expected ${built.build}`);
  writeArchiveRecord(root, archivePath);
  return { archivePath, info, plistPath: built.plistPath };
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
  ], root);
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
    console.log(`release scheme ${tree.scheme.name} (${path.basename(tree.scheme.file)})`);
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
    const app = path.join(archivePath, 'Products/Applications/App.app');
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
  assertTree, bump, prep, inspectAppDir, parseArgs, requireBuild, forbiddenHits,
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
