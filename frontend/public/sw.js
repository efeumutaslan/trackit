// TrackIt service worker
//
// Strategy:
//   - HTML / JS / CSS: network-first, falling back to cache. This way new
//     deploys are picked up immediately when online; offline still works.
//   - API responses: network-only. We never serve stale workout data.
//   - Static assets in /assets/: stale-while-revalidate (Vite hashes them).
//   - Icons and manifest: cache-first.
const SHELL_CACHE = 'trackit-shell-v2';
const ASSET_CACHE = 'trackit-assets-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API: always go to the network — never serve stale workout data.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Hashed assets: stale-while-revalidate.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req).then((resp) => {
            if (resp && resp.ok) cache.put(req, resp.clone());
            return resp;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // HTML / shell: network-first with cache fallback.
  event.respondWith(
    fetch(req).then((resp) => {
      const copy = resp.clone();
      caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(req).then((c) => c || caches.match('/')))
  );
});
