/**
 * A phone, by the size of its screen (never by which browser or device it is):
 * the short side of the screen under 600 pixels, whichever way it is held.
 * Everything made for phones goes through this, so a laptop, a tablet or a
 * headset never meets it. Phones play held sideways.
 */

const PHONE_SIDE = 600;

export function onPhone(): boolean {
  return Math.min(screen.width, screen.height) < PHONE_SIDE;
}

/** Held upright: the game asks to be turned sideways. */
export function upright(): boolean {
  return window.innerHeight > window.innerWidth;
}
