/**
 * The game's address. On the site nginx serves it at /play/; when run
 * locally it is the game's own dev server, beside this one.
 */
export const GAME = import.meta.env.DEV && typeof window !== "undefined" ? `https://${window.location.hostname}:3322/play/` : "/play/";
