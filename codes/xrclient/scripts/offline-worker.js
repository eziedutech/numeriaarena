// The game's service worker (sw.js). The build writes VERSION and FILES in
// front of this code (vite.config.ts, offlineWorker): FILES is every file of
// the build, relative to this worker, so all of the game can be kept.
//
// - Install: fetch every file once, one at a time so a slow school network is
//   not flooded, into a cache named after this build. A file that fails is
//   fetched again when the game asks for it.
// - Activate: drop the caches of older builds, take this page.
// - The page itself: network first, so an online player always gets the
//   newest build; the kept copy when offline.
// - Everything else of the game: the kept copy first, else the network
//   (and keep it).
// - The API and version.json never come from the cache.
//
// A new build does not take over open tabs (no skipWaiting): a tab running
// the old build may still load its own files, which the new build no longer
// has. It takes over once those tabs are closed.

const CACHE = `numeria-play-${VERSION}`;
const SCOPE = new URL('./', self.location.href);
const PAGE = new URL('./', SCOPE).href;
const NEVER = ['api/', 'version.json', 'sw.js'];
const PAGE_WAIT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let failed = 0;
      for (const file of FILES) {
        const url = new URL(file, SCOPE).href;
        if (await cache.match(url)) continue;
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res.ok) await cache.put(url, res);
          else failed++;
        } catch {
          failed++;
        }
      }
      console.info(`[offline] ${FILES.length - failed} of ${FILES.length} files kept for offline play (${CACHE})`);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('numeria-play-') && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** The page from the network, or after PAGE_WAIT_MS (or offline) the kept copy. */
async function page(request) {
  const cache = await caches.open(CACHE);
  const kept = () => cache.match(PAGE);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), PAGE_WAIT_MS)),
    ]);
    if (res.ok) {
      await cache.put(PAGE, res.clone());
      return res;
    }
    return (await kept()) ?? res;
  } catch (error) {
    const copy = await kept();
    if (copy) return copy;
    throw error;
  }
}

async function file(request) {
  const cache = await caches.open(CACHE);
  const copy = await cache.match(request);
  if (copy) return copy;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.href.startsWith(SCOPE.href)) return;
  const path = url.href.slice(SCOPE.href.length);
  if (NEVER.some((p) => path.startsWith(p))) return;
  event.respondWith(request.mode === 'navigate' ? page(request) : file(request));
});
