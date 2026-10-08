// The game's service worker (sw.js). The build writes VERSION and FILES in
// front of this code (vite.config.ts, offlineWorker): FILES is every file of
// the build as [path relative to this worker, hash of its content], so all
// of the game can be kept.
//
// - Install: wait until the game on an open page is up (it says so, see
//   src/offline.ts), so keeping files never takes the network from the
//   start. Then copy every file whose content is unchanged from the kept
//   copy of an older build, and fetch the rest once, one at a time so a
//   slow school network is not flooded, into a cache named after this build.
//   A file that fails is fetched again when the game asks for it.
// - Activate: drop the caches of older builds, take this page.
// - The page itself: network first (started with the worker, by navigation
//   preload), so an online player always gets the newest build; the kept
//   copy when offline.
// - Everything else of the game: the kept copy first, else the network.
//   A response is handed to the page as it arrives and kept alongside, so the
//   loading screen can count the bytes as they come.
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
/** A file whose fetch broke off (the server being swapped for a new build) is asked again after these waits. */
const RETRY_MS = [500, 2000];
/** How long a new worker waits for an open page to say the game is up. */
const BOOT_WAIT_MS = 60000;
/** Each cache keeps the hashes of its files here, for the next build to compare. */
const HASHES = new URL('__hashes.json', SCOPE).href;
/** Names under assets/ carry a hash of their content: any kept copy is the same file. */
const HASHED = new URL('assets/', SCOPE).href;

let gameUp;
const booted = new Promise((resolve) => (gameUp = resolve));
self.addEventListener('message', (event) => {
  if (event.data === 'numeria-booted') gameUp();
});

/** Resolves once no open page is still loading the game, or after BOOT_WAIT_MS. */
async function quiet() {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (pages.length === 0) return;
  // A page that is already up answers this; one still loading says so when it is up.
  for (const p of pages) p.postMessage('numeria-booted?');
  await Promise.race([booted, new Promise((resolve) => setTimeout(resolve, BOOT_WAIT_MS))]);
}

/** A copy of `url` with content `hash` kept by an older build, if there is one. */
async function older(url, hash, before) {
  for (const { cache, hashes } of before) {
    if (!url.startsWith(HASHED) && (!hash || hashes[url] !== hash)) continue;
    const copy = await cache.match(url);
    if (copy) return copy;
  }
  return undefined;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await quiet();
      const cache = await caches.open(CACHE);
      const before = [];
      for (const name of await caches.keys()) {
        if (!name.startsWith('numeria-play-') || name === CACHE) continue;
        const old = await caches.open(name);
        const list = await old.match(HASHES);
        before.push({ cache: old, hashes: list ? await list.json().catch(() => ({})) : {} });
      }
      const hashes = {};
      let failed = 0;
      let copied = 0;
      for (const [file, hash] of FILES) {
        const url = new URL(file, SCOPE).href;
        if (hash) hashes[url] = hash;
        if (await cache.match(url)) continue;
        const copy = await older(url, hash, before);
        if (copy) {
          await cache.put(url, copy);
          copied++;
          continue;
        }
        try {
          // Hashed names never change content: the browser's own copy will do.
          const res = await fetch(url, { cache: url.startsWith(HASHED) ? 'default' : 'no-cache' });
          if (res.ok) await cache.put(url, res);
          else failed++;
        } catch {
          failed++;
        }
      }
      await cache.put(HASHES, new Response(JSON.stringify(hashes), { headers: { 'Content-Type': 'application/json' } }));
      console.info(`[offline] ${FILES.length - failed} of ${FILES.length} files kept for offline play, ${copied} from the last build (${CACHE})`);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      for (const name of await caches.keys()) {
        if (name.startsWith('numeria-play-') && name !== CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** The page from the network, or after PAGE_WAIT_MS (or offline) the kept copy. */
async function page(event) {
  const cache = await caches.open(CACHE);
  const kept = () => cache.match(PAGE);
  const network = Promise.resolve(event.preloadResponse).then((pre) => pre ?? fetch(event.request));
  event.waitUntil(network.catch(() => undefined));
  try {
    const res = await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), PAGE_WAIT_MS)),
    ]);
    if (res.ok) {
      event.waitUntil(cache.put(PAGE, res.clone()).catch(() => undefined));
      return res;
    }
    return (await kept()) ?? res;
  } catch (error) {
    const copy = await kept();
    if (copy) return copy;
    throw error;
  }
}

/** The network's answer, asked again when the connection broke; an answer such as 404 is never asked again. */
async function fetchAgain(request) {
  for (const wait of RETRY_MS) {
    try {
      return await fetch(request);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return fetch(request);
}

async function file(event) {
  const cache = await caches.open(CACHE);
  const copy = await cache.match(event.request);
  if (copy) return copy;
  const res = await fetchAgain(event.request);
  // Kept while the page reads it: waiting for the whole file here would hold
  // every byte back until the last one came.
  if (res.ok && res.type === 'basic') event.waitUntil(cache.put(event.request, res.clone()).catch(() => undefined));
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.href.startsWith(SCOPE.href)) return;
  const path = url.href.slice(SCOPE.href.length);
  if (NEVER.some((p) => path.startsWith(p))) return;
  event.respondWith(request.mode === 'navigate' ? page(event) : file(event));
});
