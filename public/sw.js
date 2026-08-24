/*
 * Sidq service worker: a tombstone.
 *
 * ── What was here ────────────────────────────────────────────────────────────
 * A shell cache and a push handler, both from the day planner this codebase
 * used to be. It cached '/', '/index.html', '/manifest.webmanifest' and the
 * icon, served static assets cache-first, and listened for "morning and evening
 * ritual" pushes that routed to /today. None of those things exist any more.
 *
 * ── Why it was still running ─────────────────────────────────────────────────
 * index.html says "No manifest, deliberately: Sidq ships as a signed .dmg, not
 * an installable site", and /manifest.webmanifest is not in the repo. That
 * should have made `cache.addAll` reject and the worker never install.
 *
 * It installed anyway. Vercel's SPA rewrite answers every unknown path with
 * index.html and a 200, so the missing manifest was fetched successfully as a
 * page of HTML. A live cache-first worker on the marketing site, caching any
 * same-origin response it saw, kept alive by a 404 that was not a 404.
 *
 * ── Why this file is not simply deleted ──────────────────────────────────────
 * Deleting it does not remove it from anybody. A browser that has already
 * registered this worker keeps running its old copy and serving its old cache
 * indefinitely; removing the file just means nothing ever replaces it. The only
 * way out is to ship a worker whose whole job is to undo the previous one.
 *
 * Safe to delete outright once enough time has passed that no live browser is
 * still holding the old registration.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      // Reload every open tab, so a page currently being served out of the old
      // cache is replaced by the network rather than sitting there until the
      // person happens to refresh.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })(),
  );
});

// No fetch handler on purpose. With none registered, the browser goes straight
// to the network, so nothing is served from a cache while this is unwinding.
