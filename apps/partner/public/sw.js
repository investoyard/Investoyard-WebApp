/*
 * A partner site has no service worker of its own. This file exists to RETIRE
 * one: a partner domain that used to serve investoyard.com installed our app's
 * service worker (/sw.js) in its visitors' browsers, and that worker would go
 * on offering our cached pages and our offline page there. A browser checks
 * /sw.js for updates; this version takes over, clears every cache, unregisters
 * itself and reloads the open pages so they come from the network.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (err) { /* nothing cached */ }
    await self.registration.unregister();
    const open = await self.clients.matchAll({ type: 'window' });
    for (const c of open) { try { c.navigate(c.url); } catch (err) { /* page closed */ } }
  })());
});
