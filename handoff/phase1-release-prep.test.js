'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const prep = require('./phase1-release-prep.js');

const FAIL = [];
function check(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (error) {
    FAIL.push(name);
    console.error('FAIL', name, error.message);
  }
}
function throws(fn) {
  try { fn(); return ''; } catch (error) { return error.message; }
}

const SRC = {
  'media-store.js': '/tmp/mac-reconcile/patched/media-store.js',
  'styles.css': '/tmp/mac-reconcile/patched/styles.css',
  'service-worker.js': '/tmp/mac-reconcile/patched/service-worker.js',
  'build59.css': '/tmp/rel-hash/build59.css',
  'build59.js': '/tmp/rel-hash/build59.js',
  'build13.js': '/tmp/rel-hash/build13.js',
  'app.js': '/tmp/mac-test-tree/app.js',
};

function tree(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  for (const [rel, from] of Object.entries(SRC)) {
    if (!fs.existsSync(from)) throw new Error(`sample missing: ${from}`);
    fs.copyFileSync(from, path.join(root, rel));
  }
  fs.mkdirSync(path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ios/App/App'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ios/App/App/App.entitlements'), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>com.apple.developer.icloud-container-identifiers</key>
<array><string>iCloud.com.borikengenetics.logbookapp</string></array>
<key>com.apple.developer.icloud-services</key>
<array><string>CloudDocuments</string><string>CloudKit</string></array>
</dict></plist>
`);
  fs.writeFileSync(path.join(root, 'capacitor.config.json'), JSON.stringify({ appId: 'com.borikengenetics.logbookapp', webDir: 'www' }));
  fs.writeFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), `
buildSettings = {
  CODE_SIGN_ENTITLEMENTS = App/App.entitlements;
  CODE_SIGN_STYLE = Automatic;
  CURRENT_PROJECT_VERSION = 61;
  DEVELOPMENT_TEAM = 2Z94YL957X;
  INFOPLIST_FILE = App/Info.plist;
  MARKETING_VERSION = 1.0;
  PRODUCT_BUNDLE_IDENTIFIER = com.borikengenetics.logbookapp;
  SWIFT_ACTIVE_COMPILATION_CONDITIONS = "";
};
name = Release;
buildSettings = {
  CODE_SIGN_STYLE = Automatic;
  CURRENT_PROJECT_VERSION = 61;
  DEVELOPMENT_TEAM = 2Z94YL957X;
  INFOPLIST_FILE = LogbookQAUITests/Info.plist;
  MARKETING_VERSION = 1.0;
  PRODUCT_BUNDLE_IDENTIFIER = com.borikengenetics.logbookapp.qa.uitests;
};
name = Release;
buildSettings = {
  CODE_SIGN_ENTITLEMENTS = App/App.qa.entitlements;
  CURRENT_PROJECT_VERSION = 61;
  INFOPLIST_FILE = App/Info.qa.plist;
  MARKETING_VERSION = 1.0;
  PRODUCT_BUNDLE_IDENTIFIER = com.borikengenetics.logbookapp.qa;
  SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG QA_ISOLATION";
};
name = QA;
`);
  fs.writeFileSync(path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'), `
<ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES"></ArchiveAction>
`);
  fs.writeFileSync(path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes/App-QA.xcscheme'), `
<ArchiveAction buildConfiguration = "QA"></ArchiveAction>
`);
  fs.writeFileSync(path.join(root, 'scripts/build-www.js'), `
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const pbx = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
const builds = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([\\d.]+);/g)].map((m) => m[1]))];
const shown = (/const APP_BUILD = '([\\d.]+)'/.exec(fs.readFileSync(path.join(root, 'app.js'), 'utf8')) || [])[1];
if (builds.length !== 1 || builds[0] !== shown) { console.error('version mismatch ' + shown + ' ' + builds.join(',')); process.exit(1); }
const www = path.join(root, 'www');
fs.rmSync(www, { recursive: true, force: true }); fs.mkdirSync(www);
for (const f of ${JSON.stringify(Object.keys(SRC))}) fs.copyFileSync(path.join(root, f), path.join(www, f));
`);
  return root;
}

const root = tree('phase1-prep-');
check('check leaves build 61 in place', () => {
  prep.assertTree(root);
  if (!fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes("const APP_BUILD = '61';")) throw new Error('build changed');
});
check('build 61 is refused', () => {
  const msg = throws(() => prep.requireBuild({ build: '61', confirm: true }));
  if (!msg.includes('62')) throw new Error(msg || 'no error');
});
check('an unconfirmed build 62 is refused', () => {
  const msg = throws(() => prep.requireBuild({ build: '62', confirm: false }));
  if (!msg.includes('App Store Connect')) throw new Error(msg || 'no error');
});
check('a number other than 62 is refused', () => {
  const msg = throws(() => prep.requireBuild({ build: '70', confirm: true }));
  if (!msg.includes('62')) throw new Error(msg || 'no error');
});
check('upload is not a command', () => {
  const msg = throws(() => prep.parseArgs(['--root', root, 'upload']));
  if (!msg.includes('does not upload')) throw new Error(msg || 'no error');
});
check('prep sets the given build and keeps production ids', () => {
  const result = prep.prep({ root, build: '62', confirm: true });
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const pbx = fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  const pub = fs.readFileSync(path.join(root, 'ios/App/App/public/app.js'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'ios/App/App/public/service-worker.js'), 'utf8');
  if (!app.includes("const APP_BUILD = '62';")) throw new Error('root app.js');
  if (!app.includes("const APP_VERSION = '1.0';")) throw new Error('marketing app version');
  if (!pub.includes("const APP_BUILD = '62';")) throw new Error('public app.js still old');
  if (!sw.includes(prep.CACHE)) throw new Error('cache');
  if (!pbx.includes('CURRENT_PROJECT_VERSION = 62;')) throw new Error('project version');
  if (pbx.includes('CURRENT_PROJECT_VERSION = 61;')) throw new Error('old version remains');
  if (!pbx.includes('PRODUCT_BUNDLE_IDENTIFIER = com.borikengenetics.logbookapp;')) throw new Error('prod id');
  if (!pbx.includes('PRODUCT_BUNDLE_IDENTIFIER = com.borikengenetics.logbookapp.qa;')) throw new Error('qa id removed');
  if (!pbx.includes('MARKETING_VERSION = 1.0;')) throw new Error('marketing');
  if (!result.manifest.includes('6820774919') || !result.manifest.includes('no build 62')) throw new Error('manifest');
  if (!result.manifest.includes('upload: not performed')) throw new Error('manifest upload');
  prep.assertInternalPlist(fs.readFileSync(result.plistPath, 'utf8'));
});
check('the old internal-testing false plist is rejected', () => {
  const msg = throws(() => prep.assertInternalPlist('<key>testFlightInternalTestingOnly</key><false/>'));
  if (!msg.includes('testFlightInternalTestingOnly')) throw new Error(msg || 'no error');
});
check('a QA archive is rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-app-'));
  fs.writeFileSync(path.join(dir, 'Info.plist'), '<key>CFBundleIdentifier</key><string>com.borikengenetics.logbookapp.qa</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>70</string><key>CFBundleDisplayName</key><string>Borikèn Logbook QA</string>');
  fs.writeFileSync(path.join(dir, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string>');
  const msg = throws(() => prep.inspectAppDir(dir));
  if (!msg.includes('com.borikengenetics.logbookapp.qa') && !msg.includes('QA')) throw new Error(msg || 'no error');
});
check('a production archive with a test file is rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-app-'));
  fs.writeFileSync(path.join(dir, 'Info.plist'), '<key>CFBundleIdentifier</key><string>com.borikengenetics.logbookapp</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>70</string><key>CFBundleDisplayName</key><string>Borikèn Logbook</string>');
  fs.writeFileSync(path.join(dir, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string><string>CloudKit</string>');
  fs.writeFileSync(path.join(dir, 'phase1-photos-tags.test.js'), 'fixture');
  const msg = throws(() => prep.inspectAppDir(dir));
  if (!msg.includes('phase1-photos-tags.test.js')) throw new Error(msg || 'no error');
});
check('a clean production app directory passes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-app-'));
  fs.writeFileSync(path.join(dir, 'Info.plist'), '<key>CFBundleIdentifier</key><string>com.borikengenetics.logbookapp</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>62</string><key>CFBundleDisplayName</key><string>Borikèn Logbook</string>');
  fs.writeFileSync(path.join(dir, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string>');
  fs.writeFileSync(path.join(dir, 'app.js'), "const APP_BUILD = '62';");
  const info = prep.inspectAppDir(dir);
  if (info.id !== prep.PROD_ID || info.build !== '62') throw new Error(JSON.stringify(info));
});
check('logbook-b61rel is refused', () => {
  const bad = path.join(os.tmpdir(), 'logbook-b61rel');
  fs.rmSync(bad, { recursive: true, force: true });
  fs.mkdirSync(bad);
  const msg = throws(() => prep.assertTree(bad));
  if (!msg.includes('logbook-b61rel')) throw new Error(msg || 'no error');
});
check('an ipa with the QA display name is rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipa-'));
  const app = path.join(dir, 'Payload/App.app');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'Info.plist'), '<key>CFBundleIdentifier</key><string>com.borikengenetics.logbookapp</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>70</string><key>CFBundleDisplayName</key><string>Borikèn Logbook QA</string>');
  fs.writeFileSync(path.join(app, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string>');
  const ipa = path.join(dir, 'App.ipa');
  const zip = spawnSync('python3', ['-c', `import zipfile; z=zipfile.ZipFile(${JSON.stringify(ipa)},'w'); z.write(${JSON.stringify(path.join(app, 'Info.plist'))}, 'Payload/App.app/Info.plist'); z.write(${JSON.stringify(path.join(app, 'archived-expanded-entitlements.xcent'))}, 'Payload/App.app/archived-expanded-entitlements.xcent'); z.close()`]);
  if (zip.status !== 0) throw new Error(zip.stderr.toString());
  const unpacked = prep.unzipApp ? null : null;
  const dest = path.join(dir, 'out');
  fs.mkdirSync(dest, { recursive: true });
  const unzip = spawnSync('unzip', ['-q', ipa, '-d', dest]);
  if (unzip.status !== 0) throw new Error('unzip');
  const msg = throws(() => prep.inspectAppDir(path.join(dest, 'Payload/App.app')));
  if (!msg.includes('QA')) throw new Error(msg || 'no error');
});

check('a new archive is a timestamped xcarchive in the Xcode Archives date folder', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'archives-home-'));
  const when = new Date(2026, 10, 7, 2, 30, 45);
  const older = path.join(home, 'Library/Developer/Xcode/Archives/2026-11-07/Logbook-phase1-2026-11-06-010101.xcarchive');
  fs.mkdirSync(older, { recursive: true });
  const archivePath = prep.planArchive(home, when);
  const expected = path.join(home, 'Library/Developer/Xcode/Archives/2026-11-07/Logbook-phase1-2026-11-07-023045.xcarchive');
  if (archivePath !== expected) throw new Error(archivePath);
  if (!fs.existsSync(older)) throw new Error('previous archive was removed');
  fs.mkdirSync(archivePath);
  const msg = throws(() => prep.planArchive(home, when));
  if (!msg.includes('Refusing to overwrite')) throw new Error(msg || 'no error');
  if (!fs.existsSync(older) || !fs.existsSync(archivePath)) throw new Error('an archive was removed');
});
check('export and inspect reuse the recorded absolute archive path', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'archives-home-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-root-'));
  const when = new Date(2026, 10, 7, 2, 31, 5);
  const archivePath = prep.planArchive(home, when);
  fs.mkdirSync(path.join(archivePath, 'Products/Applications/App.app'), { recursive: true });
  prep.writeArchiveRecord(root, archivePath);
  if (prep.readArchivePath(root, home) !== archivePath) throw new Error('record was not reused');
  prep.writeArchiveRecord(root, path.join(root, 'build/release/Logbook-phase1.xcarchive'));
  const msg = throws(() => prep.readArchivePath(root, home));
  if (!msg.includes('not an xcarchive')) throw new Error(msg || 'no error');
});
check('the script no longer archives under the project or deletes an xcarchive', () => {
  const src = fs.readFileSync(path.join(__dirname, 'phase1-release-prep.js'), 'utf8');
  if (src.includes('build/release/Logbook-phase1.xcarchive')) throw new Error('project archive path remains');
  if (src.includes('rmSync(archivePath')) throw new Error('archive delete remains');
});

if (FAIL.length) {
  console.error('FAILED', FAIL.length);
  process.exit(1);
}
console.log('phase1 release prep: all checks passed');
