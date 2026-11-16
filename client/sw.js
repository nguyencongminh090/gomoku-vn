'use strict';
// Minimal service worker: makes the site installable (PWA) and shows a friendly offline page for
// failed page navigations. It deliberately caches NOTHING else — games are live (socket.io), and the
// ?v= content-hash scheme + HTTP cache already handle assets. Changing this file re-installs it.
const CACHE = 'play3cr-offline-v1';
const OFFLINE_URL = 'offline.html';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // everything else: plain network
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE_URL)));
});
