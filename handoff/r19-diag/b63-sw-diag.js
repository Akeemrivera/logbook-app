/* DIAG ONLY. Served in place of /service-worker.js when the original renderer is started with --sw-diag. Fetch decisions match the production worker. Each script or document fetch also POSTs its lookup result to /__swdiag. Not shipped in the app bundle. */
/*
  Borikèn Genetics Logbook service worker
  ------------------------------------------------------------
  Makes the tracker behave like an installable local app by caching the
  app shell and core assets. Data remains in the browser's local storage,
  so users should still export JSON backups for long-term records.
*/

// v92: a controlled reload was aborting scripts after status 200 while the cache
// still held the file. Script, style, and document responses are copied into a
// new body with the length of those bytes before they are returned. Activate
// deletes every older cache.
// iosScheme is https, so this worker registers inside the iOS wrapper (https://localhost).
// Precache requests use cache:'reload' so a cached localhost response cannot refill the new cache.
const CACHE_NAME = 'boriken-genetics-logbook-app-v92';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './media-store.js',
  './mobile.js',
  './build4.js',
  './build11.js',
  './build13.js',
  './build16.js',
  './build18.js',
  './build19.js',
  './build20.js',
  './build28.js',
  './build29.js',
  './build32.js',
  './build35.js',
  './build36.js',
  './build37.js',
  './build38.js',
  './build39.js',
  './build39.css',
  './build39w.js',
  './build40.js',
  './build41.js',
  './build41.css',
  './build41-opts.css',
  './build41-ui.css',
  './build42.js',
  './build42.css',
  './build43.js',
  './build43.css',
  './build44.js',
  './build44.css',
  './build45.js',
  './build45.css',
  './build46.js',
  './build46.css',
  './build46-black.css',
  './build47.css',
  './build48.js',
  './build48.css',
  './build49.js',
  './build49.css',
  './build49-sales.js',
  './build49-sales.css',
  './build50.js',
  './holiday-icons.js',
  './build50.css',
  './build51.js',
  './build51.css',
  './build56.css',
  './build57.js',
  './build57.css',
  './build58.js',
  './build58.css',
  './build59.js',
  './build59.css',
  './build60.js',
  './build60.css',
  './build63.js',
  './build63.css',
  './b63-repair.json',
  './build53.js',
  './build53.css',
  './assets/looks/pr01.jpg',
  './assets/looks/pr07.jpg',
  './assets/fonts/AlegreyaSC-Bold.ttf',
  './assets/fonts/ArchivoNarrow.ttf',
  './assets/looks/pr04.jpg',
  './assets/looks/pr05.jpg',
  './assets/looks/pr06.jpg',
  './assets/looks/pr10.jpg',
  './assets/looks/pr13.jpg',
  './assets/looks/pr14.jpg',
  './assets/looks/pr15.jpg',
  './assets/looks/pr16.jpg',
  './assets/looks/pr17.jpg',
  './assets/looks/pr18.jpg',
  './assets/looks/pr19.jpg',
  './assets/looks/pr20.jpg',
  './assets/looks/pr21.jpg',
  './assets/looks/pr23.jpg',
  './assets/looks/pr24.jpg',
  './vendor/pdf-lib.min.js',
  './assets/ocp-form-004-2022-10-04.pdf',
  './mascots/variants/elder-portrait.png',
  './mascots/coqui-flag-icon.png',
  './mascots/coqui-flag-hero.png',
  './mascots/cartoon/elder.png',
  './mascots/cartoon/hero.png',
  './mascots/cartoon/labtech.png',
  './mascots/cartoon/runner.png',
  './mascots/cartoon/sprout.png',
  './mascots/dark/athletic.png',
  './mascots/dark/elder.png',
  './mascots/dark/guardian.png',
  './mascots/dark/labtech.png',
  './mascots/dark/orb.png',
  './mascots/dark/sage.png',
  './mascots/dark/sentinel.png',
  './mascots/dark/sprout.png',
  './mascots/dark/walker.png',
  './mascots/dark/wisp.png',
  './mascots/light/guardian.png',
  './mascots/light/mini.png',
  './mascots/light/sage.png',
  './mascots/light/seedling.png',
  './mascots/light/strider.png',
  './mascots/variants/athletic-portrait.png',
  './mascots/variants/guardian-portrait.png',
  './mascots/variants/sentinel-portrait.png',
  './build32.css',
  './wide.js',
  './wide.css',
  './help.html',
  './assets/logo.png',
  './assets/logo-crop.png',
  './manifest.webmanifest',
  './assets/boriken-logo.jpg',
  './assets/boriken-mark.jpg',
  './assets/boriken-favicon.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function repairRequest(request) {
  try { return new URL(request.url).pathname.endsWith('/b63-repair.json'); }
  catch (e) { return false; }
}
function remember(request, response) {
  if (!response || !response.ok) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}
function cached(request) {
  return caches.match(request, { ignoreSearch: true }).then((found) => found || caches.match('./b63-repair.json'));
}
function repairResponse(request) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (value) => { if (!done && value) { done = true; resolve(value); } };
    const timer = setTimeout(() => { cached(request).then(finish).catch(() => {}); }, 400);
    fetch(request).then((response) => {
      clearTimeout(timer);
      remember(request, response);
      if (response && response.ok) finish(response);
      else cached(request).then((found) => { if (found) finish(found); else finish(response); }).catch(() => finish(response));
    }).catch(() => {
      clearTimeout(timer);
      cached(request).then((found) => { if (found) finish(found); else reject(new Error('repair unavailable')); }).catch(() => reject(new Error('repair unavailable')));
    });
  });
}
function sameOrigin(request) {
  try {
    if (!self.location || !self.location.origin) return true;
    return new URL(request.url).origin === self.location.origin;
  } catch (e) { return true; }
}
function matchUrl(request) {
  return caches.match(request, { ignoreSearch: true }).catch(() => null).then((found) => {
    if (found) return found;
    return caches.match(request.url).catch(() => null);
  });
}
function copyBody(request) {
  const dest = request.destination;
  if (dest === 'script' || dest === 'document' || dest === 'style' || dest === 'worker') return true;
  try { return /\.(js|css|html|json)$/i.test(new URL(request.url).pathname); }
  catch (e) { return false; }
}
function deliver(response, url) {
  if (!response) return Promise.resolve(response);
  const readable = response.bodyUsed && url ? caches.match(url).catch(() => null) : Promise.resolve(response);
  return readable.then((source) => {
    const body = source || response;
    return body.clone().arrayBuffer().then((bytes) => {
      const headers = new Headers(body.headers);
      headers.set('Content-Length', String(bytes.byteLength));
      return new Response(bytes, { status: body.status, statusText: body.statusText, headers: headers });
    });
  }).catch(() => response);
}
function describeResponse(response) {
  if (!response) return { hit: false };
  let vary = '', typeHeader = '', length = '';
  try { vary = response.headers.get('vary') || ''; typeHeader = response.headers.get('content-type') || ''; length = response.headers.get('content-length') || ''; } catch (e) {}
  return { hit: true, url: response.url, status: response.status, type: response.type, redirected: response.redirected, bodyUsed: response.bodyUsed, locked: !!(response.body && response.body.locked), vary: vary, contentType: typeHeader, contentLength: length };
}
function describeRequest(request) {
  const headers = {};
  try { request.headers.forEach((value, name) => { if (/range|accept|cache|purpose|sec-fetch/i.test(name)) headers[name] = value; }); } catch (e) {}
  return { url: request.url, mode: request.mode, destination: request.destination, cache: request.cache, credentials: request.credentials, redirect: request.redirect, integrity: request.integrity || '', headers: headers };
}
function mem(entry) {
  try {
    const log = self.__b63SwLog || (self.__b63SwLog = []);
    log.push(entry);
    if (log.length > 400) log.shift();
  } catch (e) {}
}
function matchUrlDiag(request, bag) {
  const started = Date.now();
  return caches.match(request, { ignoreSearch: true }).then((found) => {
    bag.requestMatch = Object.assign({ ms: Date.now() - started }, describeResponse(found));
    if (found) return found;
    const urlStarted = Date.now();
    return caches.match(request.url).then((byUrl) => {
      bag.urlMatch = Object.assign({ ms: Date.now() - urlStarted }, describeResponse(byUrl));
      return byUrl;
    }, (error) => { bag.urlMatch = { error: String(error && (error.stack || error.message) || error) }; return null; });
  }, (error) => {
    bag.requestMatch = { error: String(error && (error.stack || error.message) || error), ms: Date.now() - started };
    return caches.match(request.url).then((byUrl) => { bag.urlMatch = describeResponse(byUrl); return byUrl; }, (error2) => { bag.urlMatch = { error: String(error2 && error2.message || error2) }; return null; });
  });
}
self.addEventListener('error', (event) => mem({ phase: 'error', message: String(event.message || (event.error && event.error.stack) || event.error || '') }));
self.addEventListener('unhandledrejection', (event) => mem({ phase: 'unhandledrejection', message: String(event.reason && (event.reason.stack || event.reason.message) || event.reason || '') }));
self.addEventListener('fetch', (event) => {
  mem({ phase: 'event', url: event.request.url, destination: event.request.destination, mode: event.request.mode, cache: event.request.cache });
  if (event.request.method !== 'GET' || !sameOrigin(event.request)) return;
  if (repairRequest(event.request)) {
    event.respondWith(repairResponse(event.request));
    return;
  }
  const bag = describeRequest(event.request);
  const copy = copyBody(event.request);
  let networkRequest = event.request;
  try { networkRequest = event.request.clone(); bag.clone = 'ok'; } catch (e) { networkRequest = event.request; bag.clone = String(e && e.message || e); }
  event.respondWith(matchUrlDiag(event.request, bag).then((found) => {
    if (found) {
      bag.outcome = bag.requestMatch && bag.requestMatch.hit ? 'request-hit' : 'url-hit';
      mem({ phase: 'match', url: bag.url, outcome: bag.outcome, requestMatch: bag.requestMatch, urlMatch: bag.urlMatch });
      if (!copy) return found;
      return deliver(found, event.request.url).then((out) => { mem({ phase: 'deliver', url: bag.url, deliver: describeResponse(out), same: out === found }); return out; }, (error) => { mem({ phase: 'deliver-error', url: bag.url, message: String(error && error.message || error) }); return Promise.reject(error); });
    }
    return fetch(networkRequest).then((response) => {
      bag.fetch = describeResponse(response);
      bag.outcome = 'network';
      remember(event.request, response);
      mem({ phase: 'network', url: bag.url, fetch: bag.fetch });
      if (!copy) return response;
      return deliver(response, event.request.url).then((out) => { mem({ phase: 'deliver', url: bag.url, deliver: describeResponse(out) }); return out; });
    }).catch((error) => matchUrlDiag(event.request, bag).then((again) => {
      bag.fetchError = String(error && (error.stack || error.message) || error);
      if (again) {
        bag.outcome = 'recovered';
        mem({ phase: 'recovered', url: bag.url, fetchError: bag.fetchError });
        if (!copy) return again;
        return deliver(again, event.request.url).then((out) => out);
      }
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html').then((shell) => {
          mem({ phase: shell ? 'navigation-shell' : 'reject', url: bag.url, fetchError: bag.fetchError });
          return shell ? deliver(shell, event.request.url) : Promise.reject(new Error('unavailable'));
        });
      }
      mem({ phase: 'reject', url: bag.url, fetchError: bag.fetchError });
      return Promise.reject(error);
    }));
  }).then((response) => response, (error) => {
    mem({ phase: 'respond-reject', url: bag.url, message: String(error && (error.stack || error.message) || error) });
    return Promise.reject(error);
  }));
});
