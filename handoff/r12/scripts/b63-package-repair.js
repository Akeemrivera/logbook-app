'use strict';
/*
  Copies a private repair file into the app bundle paths. It does not print
  the record id and it does not write localStorage. The public template stays
  empty until this script is run on the private machine, before the native build.
*/
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DEST = ['b63-repair.json', path.join('www', 'b63-repair.json'), path.join('ios', 'App', 'App', 'public', 'b63-repair.json')];
const LISTS = ['plants', 'breedingPlants', 'motherFatherPlants'];
const FIELDS = ['b49Father', 'b49Mother'];

function fail(message) {
  console.error('FAIL ' + message);
  process.exit(1);
}
function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : '';
}
function checkConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('repair file must be an object');
  const repairs = Array.isArray(config.repairs) ? config.repairs : [];
  const undos = Array.isArray(config.undos) ? config.undos : [];
  if (!repairs.length && !undos.length) fail('repair file has no repairs and no undos');
  repairs.forEach((job, i) => {
    if (!job || typeof job.recordId !== 'string' || !job.recordId) fail('repair ' + i + ' needs a recordId');
    if (!LISTS.includes(job.collection)) fail('repair ' + i + ' collection must be plants, breedingPlants, or motherFatherPlants');
    if (!FIELDS.includes(job.field)) fail('repair ' + i + ' field must be b49Father or b49Mother');
    if (typeof job.expect !== 'string' || !job.expect) fail('repair ' + i + ' needs expect');
  });
  undos.forEach((job, i) => {
    if (!job || typeof job.recordId !== 'string' || !job.recordId) fail('undo ' + i + ' needs a recordId');
    if (!LISTS.includes(job.collection)) fail('undo ' + i + ' collection is not supported');
    if (!FIELDS.includes(job.field)) fail('undo ' + i + ' field is not supported');
  });
  return { repairs: repairs.length, undos: undos.length };
}
function main() {
  const required = process.env.B63_REPAIR_REQUIRED === '1' || process.argv.includes('--require');
  const file = arg('--file') || process.env.B63_REPAIR_FILE || '';
  const root = arg('--root') || ROOT;
  if (!file) {
    if (required) fail('private repair was requested but no repair file was given');
    console.log('PASS no private repair requested');
    return;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail('private repair file is missing');
  let config;
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { fail('private repair file is not JSON'); }
  const counts = checkConfig(config);
  const text = JSON.stringify(config);
  DEST.forEach((rel) => {
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text);
  });
  console.log('PASS packaged ' + counts.repairs + ' repairs and ' + counts.undos + ' undos into ' + DEST.length + ' bundle paths');
  console.log('Do not commit b63-repair.json after this. The public template must stay empty.');
}
if (require.main === module) main();
module.exports = { checkConfig };
