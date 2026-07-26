const CACHE = 'asistencia-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([
    '/', '/asistencia.html', '/manifest.json',
    '/launchericon-192x192.png', '/launchericon-512x512.png',
    'https://fonts.googleapis.com/css2?family=Segoe+UI:wght@400;600;700'
  ])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(e.request).then((r) => r || fetch(e.request))
    )
  );
});
