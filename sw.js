/* ============================================================================
   SEHGAL HERO APP — SERVICE WORKER
   Step A (16-Jul-2026). Purpose: stop re-downloading ~2.7 MB on every open.

   MEASURED before this file existed, on every single open of the app:
       index.html                       557 KB
       exceljs.min.js                   925 KB
       xlsx.full.min.js                 861 KB
       jspdf.umd.min.js                 355 KB
       jspdf.plugin.autotable.min.js     38 KB
       ------------------------------------------
       total                          ~2,736 KB   + Google Fonts

   Four of those five files NEVER change. They were being downloaded again and
   again. This worker keeps them on the phone.

   WHAT THIS FILE DOES NOT TOUCH:
     • script.google.com  — the Apps Script backend. Every call still goes to the
       server, live, exactly as today. Nothing is cached, nothing goes stale.
       No estimate, no gate entry, no token is served from an old copy.
     • drive.google.com   — the photos. That is Step B, not this file.

   RULE FOR EVERY DEPLOY FROM NOW ON:
     Upload BOTH index.html AND sw.js to GitHub, together, every time.
     The HERO_BUILD line below must be bumped on every release. That bump is
     what tells the phones a new version exists and shows the update bar.
   ========================================================================== */

const HERO_BUILD = 'set22-2026.07.20-s04';
const SHELL_CACHE = 'hero-shell-' + HERO_BUILD;
const LIB_CACHE   = 'hero-lib-v1';   // versioned CDN URLs; contents never change

/* The app shell — same-origin, changes on every deploy. */
const SHELL_URLS = ['./', './index.html'];

/* The heavy libraries — the URLs carry a version number, so the content behind
   a URL can never change. Safe to keep forever. */
const LIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
];

/* Hosts whose files are safe to keep forever (versioned or font files). */
function isLibHost(url) {
  return url.hostname === 'cdnjs.cloudflare.com'
      || url.hostname === 'cdn.jsdelivr.net'
      || url.hostname === 'fonts.googleapis.com'
      || url.hostname === 'fonts.gstatic.com';
}

/* Hosts we must NEVER cache — live data and photos. */
function isLiveHost(url) {
  return url.hostname.indexOf('script.google.com') > -1
      || url.hostname.indexOf('googleusercontent.com') > -1
      || url.hostname.indexOf('drive.google.com') > -1
      || url.hostname.indexOf('generativelanguage.googleapis.com') > -1
      || url.hostname.indexOf('gstatic.com') > -1 && url.pathname.indexOf('generate_204') > -1;
}

/* ---------------------------------------------------------------- install */
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const shell = await caches.open(SHELL_CACHE);
    // Force a fresh copy from GitHub, not a 10-minute-old browser-cached one.
    await Promise.all(SHELL_URLS.map(async function (u) {
      try {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (res && res.ok) await shell.put(u, res);
      } catch (e) { /* offline during install — runtime fetch will fill it */ }
    }));

    const libs = await caches.open(LIB_CACHE);
    await Promise.all(LIB_URLS.map(async function (u) {
      try {
        if (await libs.match(u)) return;           // already have it, keep it
        const res = await fetch(u, { mode: 'cors' });
        if (res && res.ok) await libs.put(u, res);
      } catch (e) { /* runtime fetch will fill it */ }
    }));
    // Deliberately NOT calling skipWaiting() here. The new version waits until
    // the user taps the update bar. Ravi decides when a build goes live on a
    // phone — a build must never swap itself in halfway through a gate entry.
  })());
});

/* --------------------------------------------------------------- activate */
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.map(function (k) {
      // drop old shells only; the library cache is kept across builds
      if (k !== SHELL_CACHE && k !== LIB_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

/* ------------------------------------------------------------------ fetch */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
  if (isLiveHost(url)) return;                     // backend + photos: never touched

  /* Libraries and fonts: from the phone first. Only hit the network if we have
     never seen the file. This is the ~2.2 MB saving. */
  if (isLibHost(url)) {
    event.respondWith((async function () {
      const cache = await caches.open(LIB_CACHE);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        try { await cache.put(req, res.clone()); } catch (e) {}
      }
      return res;
    })());
    return;
  }

  /* Our own files (index.html): show the phone's copy at once, then quietly
     fetch the latest in the background for next time. This is what makes the
     app open instantly instead of downloading 557 KB first. */
  if (url.origin === self.location.origin) {
    event.respondWith((async function () {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(new Request(req.url, { cache: 'no-store' }))
        .then(function (res) {
          if (res && res.ok) { try { cache.put(req, res.clone()); } catch (e) {} }
          return res;
        })
        .catch(function () { return hit; });
      return hit || fresh;
    })());
  }
});

/* ---------------------------------------------------- update bar handshake */
self.addEventListener('message', function (event) {
  if (event.data === 'HERO_SKIP_WAITING') self.skipWaiting();
  if (event.data === 'HERO_BUILD?') {
    if (event.source) event.source.postMessage({ heroBuild: HERO_BUILD });
  }
});
