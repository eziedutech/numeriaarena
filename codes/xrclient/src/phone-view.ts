import { MathUtils, Vector3, type PerspectiveCamera } from '@iwsdk/core';

/**
 * Where the browser camera goes outside the headset. The desk menu is framed
 * with room round it; in a game the camera comes in until the part of the
 * desk in use fills the screen, and goes out again where more is in use. A
 * phone held sideways (PHONE_VIEW) also comes in for the menu, under a
 * question brought down; a computer (SCREEN_VIEW) keeps its menu and its
 * question where they were. Nothing of this touches XR.
 */

/** What is kept in view: half the width and half the height of the desk part in use, in metres, and the height looked at. */
export interface View {
  halfW: number;
  halfH: number;
  lookY: number;
}

/** The pose the browser camera is first given (see DeskSystem.placeForBrowser): where it looks, and the way it sits back from there. */
const LOOK_Z = -0.2;
const ALONG = new Vector3(0, 0.3, 0.82);
const FAR = ALONG.length();
const TAN_HALF_FOV = Math.tan(MathUtils.degToRad(25));
const NEAREST = 0.3;
const EASE = 5;

export const PHONE_VIEW = {
  menu: { halfW: 0.56, halfH: 0.27, lookY: 0.9 },
  // Balloons climb the whole height; the other games keep to the lower part, under a question brought down.
  balloons: { halfW: 0.36, halfH: 0.28, lookY: 0.99 },
  play: { halfW: 0.36, halfH: 0.25, lookY: 0.94 },
  // The planks lie in a row at the very front of the desk.
  planks: { halfW: 0.36, halfH: 0.29, lookY: 0.88 },
  race: { halfW: 0.63, halfH: 0.3, lookY: 0.98 },
} satisfies Record<string, View>;

/** A computer or a tablet: the score at the top and the front of the book at the bottom, just inside the screen. */
export const SCREEN_VIEW = {
  // Wider than the desk: the camera stays where DeskSystem.placeForBrowser puts it.
  menu: { halfW: 9, halfH: 9, lookY: 0.98 },
  balloons: { halfW: 0.36, halfH: 0.29, lookY: 1.02 },
  // The crystals, gates, planks and weights stand at the front of the book, down to its edge.
  play: { halfW: 0.36, halfH: 0.325, lookY: 1.0 },
  planks: { halfW: 0.36, halfH: 0.335, lookY: 0.99 },
  // The robots' windows on the left and the race card on the right.
  race: { halfW: 0.7, halfH: 0.3, lookY: 1.0 },
} satisfies Record<keyof typeof PHONE_VIEW, View>;

export class PhoneView {
  private dist = FAR;
  private look = new Vector3(0, 0.98, LOOK_Z);
  private way = ALONG.clone().normalize();

  /** Eases the camera to frame `view` for this screen. */
  update(camera: PerspectiveCamera, delta: number, view: View): void {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const wanted = MathUtils.clamp(Math.max(view.halfH / TAN_HALF_FOV, view.halfW / (TAN_HALF_FOV * aspect)), NEAREST, FAR);
    const k = 1 - Math.exp(-EASE * delta);
    this.dist += (wanted - this.dist) * k;
    this.look.y += (view.lookY - this.look.y) * k;
    camera.position.copy(this.look).addScaledVector(this.way, this.dist);
    camera.lookAt(this.look);
  }
}
