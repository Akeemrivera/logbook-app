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
    console.error('FAILED', FAIL.length);
    process.exit(1);
  }
}
function fixtureAppAt61(text) {
  const found = String(text).match(/const APP_BUILD = '(\d+)';/);
  if (!found) throw new Error('sample app.js has no APP_BUILD line');
  if (found[1] !== '61' && found[1] !== '62') throw new Error(`sample APP_BUILD ${found[1]} is not 61 or 62`);
  return String(text).replace(/const APP_BUILD = '\d+';/, "const APP_BUILD = '61';");
}
function throws(fn) {
  try { fn(); return ''; } catch (error) { return error.message; }
}

const SAMPLE_FILES = ['media-store.js', 'styles.css', 'service-worker.js', 'build59.css', 'build59.js', 'build13.js', 'app.js'];
const SAMPLE_ROOT = process.env.PHASE1_SAMPLE_ROOT;

function tree(name) {
  if (!SAMPLE_ROOT) throw new Error('PHASE1_SAMPLE_ROOT is not set');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  for (const rel of SAMPLE_FILES) {
    const from = path.join(SAMPLE_ROOT, rel);
    if (!fs.existsSync(from)) throw new Error(`PHASE1_SAMPLE_ROOT is missing ${rel} (${SAMPLE_ROOT})`);
    fs.copyFileSync(from, path.join(root, rel));
  }
  const copiedApp = path.join(root, 'app.js');
  fs.writeFileSync(copiedApp, fixtureAppAt61(fs.readFileSync(copiedApp, 'utf8')));
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
for (const f of ${JSON.stringify(SAMPLE_FILES)}) fs.copyFileSync(path.join(root, f), path.join(www, f));
`);
  return root;
}

if (!SAMPLE_ROOT) {
  console.log('SAMPLE NOT RUN. Set PHASE1_SAMPLE_ROOT to the phase 1 directory that contains app.js and build13.js, then rerun.');
  console.log('Example: PHASE1_SAMPLE_ROOT="$HOME/Documents/Apps/Logbook/Builds/logbook-b61-phase1" node phase1-release-prep.test.js');
} else {
const sampleAppPath = path.join(SAMPLE_ROOT, 'app.js');
const samplePbxPath = path.join(SAMPLE_ROOT, 'ios/App/App.xcodeproj/project.pbxproj');
const sampleAppBefore = fs.readFileSync(sampleAppPath);
const samplePbxBefore = fs.existsSync(samplePbxPath) ? fs.readFileSync(samplePbxPath) : null;
const root = tree('phase1-prep-');
check('check leaves build 61 in place', () => {
  prep.assertTree(root);
  if (!fs.readFileSync(path.join(root, 'app.js'), 'utf8').includes("const APP_BUILD = '61';")) throw new Error('fixture app.js was not normalized to 61');
  if (!fs.readFileSync(path.join(root, 'ios/App/App.xcodeproj/project.pbxproj'), 'utf8').includes('CURRENT_PROJECT_VERSION = 61;')) throw new Error('fixture project was not 61');
  if (!fs.readFileSync(sampleAppPath).equals(sampleAppBefore)) throw new Error('real sample app.js changed');
  if (samplePbxBefore && !fs.readFileSync(samplePbxPath).equals(samplePbxBefore)) throw new Error('real sample project changed');
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
  if (!fs.readFileSync(sampleAppPath).equals(sampleAppBefore)) throw new Error('real sample app.js changed');
  if (samplePbxBefore && !fs.readFileSync(samplePbxPath).equals(samplePbxBefore)) throw new Error('real sample project changed');
});
}
check('a copied build 62 app.js becomes fixture build 61', () => {
  const text = "const APP_VERSION = '1.0';\nconst APP_BUILD = '62';\n";
  const normalized = fixtureAppAt61(text);
  if (text !== "const APP_VERSION = '1.0';\nconst APP_BUILD = '62';\n") throw new Error('source text changed');
  if (!normalized.includes("const APP_BUILD = '61';")) throw new Error(normalized);
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
  const msg = throws(() => prep.parseArgs(['--root', 'phase1', 'upload']));
  if (!msg.includes('does not upload')) throw new Error(msg || 'no error');
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

check('a shared App scheme is created from the App target id already saved in App-QA', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scheme-'));
  const dir = path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes');
  fs.mkdirSync(dir, { recursive: true });
  const id = '504EC3031FED79650016851F';
  const qaPath = path.join(dir, 'App-QA.xcscheme');
  fs.writeFileSync(qaPath, `<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "1600" version = "1.7">
   <BuildAction><BuildActionEntries><BuildActionEntry buildForArchiving = "NO">
      <BuildableReference BuildableIdentifier = "primary" BlueprintIdentifier = "${id}" BuildableName = "App.app" BlueprintName = "App" ReferencedContainer = "container:App.xcodeproj">
      </BuildableReference>
   </BuildActionEntry></BuildActionEntries></BuildAction>
   <ArchiveAction buildConfiguration = "QA" revealArchiveInOrganizer = "YES"></ArchiveAction>
</Scheme>
`);
  const qa = fs.readFileSync(qaPath, 'utf8');
  const pbx = `${id} /* App */ = {\n\t\t\tisa = PBXNativeTarget;\n`;
  const scheme = prep.findReleaseScheme(root, pbx);
  const written = fs.readFileSync(path.join(dir, 'App.xcscheme'), 'utf8');
  if (scheme.name !== 'App' || scheme.archive !== 'Release') throw new Error(JSON.stringify(scheme));
  if (!written.includes(`BlueprintIdentifier = "${id}"`) || !written.includes('buildForArchiving = "YES"')) throw new Error(written);
  if (!written.includes('<ArchiveAction\n      buildConfiguration = "Release"')) throw new Error('archive config');
  if (fs.readFileSync(qaPath, 'utf8') !== qa) throw new Error('App-QA changed');
});
check('no App scheme is written when the saved schemes have no App target id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scheme-missing-'));
  const dir = path.join(root, 'ios/App/App.xcodeproj/xcshareddata/xcschemes');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'App-QA.xcscheme'), '<ArchiveAction buildConfiguration = "QA"></ArchiveAction>');
  const msg = throws(() => prep.findReleaseScheme(root, ''));
  if (!msg.includes('none was invented')) throw new Error(msg || 'no error');
  if (fs.existsSync(path.join(dir, 'App.xcscheme'))) throw new Error('scheme was invented');
});
check('empty Cordova stubs are allowed and any other extra is not', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cordova-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/build-www.js'), "const files = ['app.js'];\n");
  fs.writeFileSync(path.join(root, 'app.js'), 'app');
  const pub = path.join(root, 'ios/App/App/public');
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'cordova.js'), '');
  fs.writeFileSync(path.join(pub, 'cordova_plugins.js'), '');
  fs.writeFileSync(path.join(pub, 'b59shots.js'), 'not-the-helper');
  fs.writeFileSync(path.join(pub, 'other.js'), 'x');
  const issues = prep.webTreeIssues(root);
  if (issues.some((s) => s.includes('cordova.js') || s.includes('cordova_plugins.js'))) throw new Error(issues.join(' | '));
  if (!issues.some((s) => s.includes('not the Nov 3 screenshot helper'))) throw new Error(issues.join(' | '));
  if (!issues.some((s) => s.includes('other.js'))) throw new Error(issues.join(' | '));
  fs.writeFileSync(path.join(pub, 'cordova.js'), 'plugin');
  const nonempty = prep.webTreeIssues(root);
  if (!nonempty.some((s) => s.includes('not the empty Capacitor file'))) throw new Error(nonempty.join(' | '));
  if (prep.EMPTY_SHA256 !== 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855') throw new Error('empty hash');
  if (prep.SHOTS_SIZE !== 120061 || prep.SHOTS_SHA256 !== '1b7735fb296fefd5f5c7427a3e558ad9237b90d7f8479f60b52ad5880533c5fc' || !prep.SHOTS_SHA256.startsWith(prep.SHOTS_PREFIX)) throw new Error('shots identity');
});
check('the screenshot helper is quarantined only when it matches and is unreferenced', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
  const pub = path.join(root, 'ios/App/App/public');
  fs.mkdirSync(pub, { recursive: true });
  const src = path.join(pub, 'b59shots.js');
  fs.writeFileSync(src, 'placeholder');
  fs.writeFileSync(path.join(root, 'index.html'), '<script src="b59shots.js"></script>');
  const referenced = throws(() => prep.quarantineShots(root));
  if (!referenced.includes('left in public') || !fs.existsSync(src)) throw new Error(referenced || 'referenced file moved');
  fs.writeFileSync(path.join(root, 'index.html'), '<script src="app.js"></script>');
  const wrong = throws(() => prep.quarantineShots(root));
  if (!wrong.includes('left in place') || !fs.existsSync(src)) throw new Error(wrong || 'wrong helper moved');
});
check('an archived screenshot helper is rejected', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-app-'));
  fs.writeFileSync(path.join(dir, 'Info.plist'), '<key>CFBundleIdentifier</key><string>com.borikengenetics.logbookapp</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>62</string><key>CFBundleDisplayName</key><string>Borikèn Logbook</string>');
  fs.writeFileSync(path.join(dir, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string>');
  fs.writeFileSync(path.join(dir, 'b59shots.js'), 'x');
  const msg = throws(() => prep.inspectAppDir(dir));
  if (!msg.includes('b59shots.js')) throw new Error(msg || 'no error');
});
check('a binary Info.plist is not read as text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bplist-'));
  fs.writeFileSync(path.join(dir, 'Info.plist'), Buffer.concat([Buffer.from('bplist00'), Buffer.from('CFBundleIdentifier')]));
  fs.writeFileSync(path.join(dir, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string>');
  const msg = throws(() => prep.inspectAppDir(dir));
  if (msg.includes('Archived bundle id is missing')) throw new Error(msg);
  if (!msg.includes('plutil') && !msg.includes('PlistBuddy')) throw new Error(msg || 'no error');
  if (!fs.existsSync(path.join(dir, 'Info.plist'))) throw new Error('plist removed');
});
check('adopt records an existing archive and does not delete it', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-home-'));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-root-'));
  const archivePath = path.join(home, 'Library/Developer/Xcode/Archives/2026-11-06/Logbook-phase1-2026-11-06-214738.xcarchive');
  const app = path.join(archivePath, 'Products/Applications/App.app');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'Info.plist'), '<plist><dict><key>CFBundleIdentifier</key><string>com.example.no</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>62</string><key>CFBundleDisplayName</key><string>Borikèn Logbook</string></dict></plist>');
  fs.writeFileSync(path.join(app, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string>');
  const msg = throws(() => prep.adoptArchive({ root, archive: archivePath, home }));
  if (!fs.existsSync(path.join(app, 'Info.plist'))) throw new Error('archive was deleted');
  if (fs.existsSync(path.join(root, 'build/release/archive-path.txt'))) throw new Error('failed adopt was recorded');
  if (!msg.includes('com.example.no')) throw new Error(msg || 'no error');
});
check('public files outside build-www are reported and kept', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-extra-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scripts/build-www.js'), "const files = ['app.js'];\ncopyDir('assets');\n");
  fs.writeFileSync(path.join(root, 'app.js'), 'app');
  fs.mkdirSync(path.join(root, 'assets'));
  const extra = path.join(root, 'ios/App/App/public/stray.txt');
  fs.mkdirSync(path.dirname(extra), { recursive: true });
  fs.writeFileSync(extra, 'x');
  const issues = prep.webTreeIssues(root);
  if (!issues.some((s) => s.includes('stray.txt'))) throw new Error(issues.join(' | ') || 'no issue');
  if (!fs.existsSync(extra)) throw new Error('extra file was deleted');
});

if (SAMPLE_ROOT) {
  check('adopt records the prepared archive without deleting it', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-ok-home-'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'adopt-ok-root-'));
    const archivePath = path.join(home, 'Library/Developer/Xcode/Archives/2026-11-06/Logbook-phase1-2026-11-06-214738.xcarchive');
    const appDir = path.join(archivePath, 'Products/Applications/App.app');
    const pub = path.join(appDir, 'public');
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(appDir, 'Info.plist'), '<plist><dict><key>CFBundleIdentifier</key><string>com.borikengenetics.logbookapp</string><key>CFBundleShortVersionString</key><string>1.0</string><key>CFBundleVersion</key><string>62</string><key>CFBundleDisplayName</key><string>Borikèn Logbook</string></dict></plist>');
    fs.writeFileSync(path.join(appDir, 'archived-expanded-entitlements.xcent'), '<string>iCloud.com.borikengenetics.logbookapp</string>');
    for (const rel of ['media-store.js', 'styles.css', 'service-worker.js', 'build59.css', 'build59.js', 'build13.js']) {
      fs.copyFileSync(path.join(SAMPLE_ROOT, rel), path.join(pub, rel));
    }
    const appJs = fixtureAppAt61(fs.readFileSync(path.join(SAMPLE_ROOT, 'app.js'), 'utf8')).replace("const APP_BUILD = '61';", "const APP_BUILD = '62';");
    fs.writeFileSync(path.join(pub, 'app.js'), appJs);
    const result = prep.adoptArchive({ root, archive: archivePath, home });
    const record = path.join(root, 'build/release/archive-path.txt');
    if (result.info.build !== '62' || fs.readFileSync(record, 'utf8').trim() !== archivePath) throw new Error('not recorded');
    if (!fs.existsSync(path.join(appDir, 'Info.plist'))) throw new Error('archive deleted');
    prep.adoptArchive({ root, archive: archivePath, home });
    if (fs.readFileSync(record, 'utf8').trim() !== archivePath) throw new Error('record changed');
  });
}

if (FAIL.length) {
  console.error('FAILED', FAIL.length);
  process.exit(1);
}
console.log('phase1 release prep: all checks passed');
