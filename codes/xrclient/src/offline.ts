/**
 * Offline play: the service worker that keeps the game on the device
 * (sw.js, built from scripts/offline-worker.js), and whether the network is
 * there. Practice and robot races need no network; answers wait in the
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

/** Whether the browser says it has a network (false means surely offline; true may still fail). */
export function online(): boolean {
  return navigator.onLine !== false;
}

/** Calls `listener` whenever the network comes or goes. */
export function onNetwork(listener: (online: boolean) => void): void {
  window.addEventListener('online', () => listener(true));
  window.addEventListener('offline', () => listener(false));
}
