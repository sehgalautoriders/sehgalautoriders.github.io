/* Sandbox service worker — does nothing but own scope /sandbox/ (see build.py). */
const HERO_BUILD = 'R142-2026.10.07.1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('message', function (event) {
  if (event.data === 'HERO_SKIP_WAITING') self.skipWaiting();
  if (event.data === 'HERO_BUILD?' && event.source) event.source.postMessage({ heroBuild: HERO_BUILD });
});
