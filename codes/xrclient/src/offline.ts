/**
 * Offline play: the service worker that keeps the game on the device
 * (sw.js, built from scripts/offline-worker.js), and whether the server can
 * be reached. Practice and robot races need no network; answers wait in the
 * device's outbox (storage.ts) until they can be sent.
 */

/** Registers sw.js in a production build; the dev server and its emulator stay as they are. */
export function keepForOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () =>
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => console.info(`[offline] worker ready for ${reg.scope}`))
      .catch((error) => console.warn('[offline] the game is not kept for offline play', error));
  // After the page has loaded, so keeping the files never competes with the start.
  // The loading screen starts this code itself, often after the load event.
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

/**
 * `navigator.onLine` only says whether some network adapter is up: with a
 * VPN or virtual adapter (Tailscale, WSL, Docker) it stays true with the
 * Wi-Fi off. So the server is asked: version.json, never cached (nginx and
 * the worker both leave it alone), on start, every CHECK_MS and whenever the
 * browser reports a change. Any answer, even a 404 from the dev server,
 * means the network is there.
 */
const CHECK_MS = 30_000;
const CHECK_WAIT_MS = 4_000;

let reachable = navigator.onLine !== false;
const listeners = new Set<(online: boolean) => void>();
let checking = false;

function set(next: boolean): void {
  if (next === reachable) return;
  reachable = next;
  console.info(`[offline] network ${next ? 'back' : 'gone'}`);
  for (const l of listeners) l(next);
}

async function check(): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    if (navigator.onLine === false) {
      set(false);
      return;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CHECK_WAIT_MS);
    try {
      await fetch(`${import.meta.env.BASE_URL}version.json?check=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
      set(true);
    } catch {
      set(false);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    checking = false;
  }
}

let started = false;
function start(): void {
  if (started) return;
  started = true;
  void check();
  setInterval(() => void check(), CHECK_MS);
  window.addEventListener('online', () => void check());
  window.addEventListener('offline', () => set(false));
}

/** Whether the server answered last time it was asked (false means offline). */
export function online(): boolean {
  start();
  return reachable;
}

/** Calls `listener` whenever the network comes or goes. */
export function onNetwork(listener: (online: boolean) => void): void {
  start();
  listeners.add(listener);
}
