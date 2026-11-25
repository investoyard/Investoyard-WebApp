/* Investoyard service worker — app-shell caching + offline fallback.

   Two rules this file must keep (2026-11-25):
   1. ONLY A SUCCESSFUL RESPONSE IS EVER STORED. The first version cached
      whatever came back, so a chunk that answered 404 for a moment during a
      publish was kept as a 404 for ever and served cache-first: every admin
      page that needed it crashed with "Application error" until a hard
      reload bypassed this worker.
   2. RENAME CACHE whenever the caching rules change. Activation deletes every
      other cache, which is the only way to clear what browsers already hold.
      v2 -> v3 clears the poisoned copies from the first version. */
const CACHE = 'investoyard-v3';
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

/** Store a copy only when the response is a complete, successful, same-origin one. */
function keep(req, res) {
  if (res && res.ok && res.status === 200 && res.type === 'basic') {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => { /* quota — skip */ });
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed build output: a file name never changes content, so
  // cache-first is safe — as long as only a good copy was ever stored.
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => keep(req, res))),
    );
    return;
  }

  // Everything else (pages, the RSC payloads, icons, manifest): network first,
  // stored copy only when offline, then the offline page for a navigation.
  e.respondWith(
    fetch(req).then((res) => keep(req, res)).catch(() =>
      caches.match(req).then((c) => c || (req.mode === 'navigate'
        ? caches.match('/').then((h) => h || caches.match('/offline.html'))
        : Response.error())),
    ),
  );
});
