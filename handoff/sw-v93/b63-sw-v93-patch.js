'use strict';
/*
  Patch the three tree3 service-worker.js copies from v92 to v93.
  A cache miss whose Request fetch fails must still be able to fetch the
  URL. respondWith must receive a Response, including the repair path.
  The precache list is not edited.
*/
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..', '..');
const FILES = ['service-worker.js', 'www/service-worker.js', 'ios/App/App/public/service-worker.js'];
function patch(text) {
  if (!text.includes('boriken-genetics-logbook-app-v92')) throw new Error('expected cache v92');
  let out = text.replace(/boriken-genetics-logbook-app-v92/g, 'boriken-genetics-logbook-app-v93');
  const deliverCatch = '.catch(() => response);';
  const deliverNext = ".catch(() => fetch(url).then((net) => (net && net.type !== 'error' ? net : new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } }))).catch(() => new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } })));";
  if (!out.includes(deliverCatch)) throw new Error('deliver catch not found');
  out = out.replace(deliverCatch, deliverNext);
  const rejected = "return Promise.reject(new Error('unavailable'));";
  const settled = "return fetch(event.request.url).then((net) => (net ? net : new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } }))).catch(() => new Response('', { status: 504, headers: { 'Content-Type': 'text/plain' } }));";
  if (!out.includes(rejected)) throw new Error('unavailable rejection not found');
  out = out.replace(rejected, settled);
  const shellReject = "Promise.reject(new Error('unavailable'))";
  const shellPage = "new Response('<!doctype html><title>Offline</title><p>The logbook shell is not available offline.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } })";
  if (!out.includes(shellReject)) throw new Error('navigation shell rejection not found');
  out = out.split(shellReject).join(shellPage);
  const repairReject = "reject(new Error('repair unavailable'))";
  const repairResolve = "resolve(new Response('{\"repairs\":[],\"undos\":[]}', { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }))";
  if (!out.includes(repairReject)) throw new Error('repair rejection not found');
  out = out.split(repairReject).join(repairResolve);
  if (out.includes('Promise.reject') || out.includes('reject(new Error')) throw new Error('a respondWith rejection remains');
  if (!out.includes("key === 'treeStyle'") && !out.includes('APP_SHELL')) throw new Error('shell missing');
  return out;
}
const samples = [];
const written = FILES.map((rel) => {
  const file = path.join(ROOT, rel);
  const after = patch(fs.readFileSync(file, 'utf8'));
  return { rel, file, after };
});
written.forEach((item) => {
  fs.writeFileSync(item.file, item.after);
  const sha = require('crypto').createHash('sha256').update(item.after).digest('hex');
  samples.push(item.rel + ' ' + sha);
  console.log('PATCHED ' + item.rel + ' ' + sha);
});
if (new Set(samples.map((line) => line.split(' ')[1])).size !== 1) {
  console.error('FAIL the three copies differ');
  process.exit(1);
}
console.log('PASS service worker v93 copies match');
