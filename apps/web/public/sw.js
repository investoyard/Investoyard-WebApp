/* Investoyard service worker — app-shell caching + offline fallback.
   Bump CACHE to invalidate after a deploy. */
const CACHE = 'investoyard-v2';
const CORE = ['/', '/offline.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isAsset = url.pathname.startsWith('/_next/') || /\.(css|js|svg|png|jpg|jpeg|webp|woff2?|json|webmanifest|ico)$/.test(url.pathname);

  if (isAsset) {
    // cache-first for hashed/static assets
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached)),
    );
    return;
  }

  // navigations / pages: network-first, fall back to cache then offline page
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then((c) => c || caches.match('/')).then((c) => c || caches.match('/offline.html'))),
  );
});
