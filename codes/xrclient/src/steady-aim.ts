import { Quaternion, Vector3, type Object3D } from '@iwsdk/core';

import { accessOn } from './settings.js';

/**
 * STEADY AIM: a hand that shakes still points where it means to. Each ray
 * space's pose is smoothed with a One Euro filter before its matrix is made,
 * so the ray, its cursor and what it hits all follow the calmer pose: a slow
 * hand is smoothed hard, a quick sweep hardly at all, so the ray never lags
 * a deliberate move.
 */
const MIN_CUTOFF = 1.2;
const BETA = 0.6;
/** Calls closer together than this are the same frame and get the same pose. */
const SAME_FRAME_MS = 2;

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/** Smooths `space`'s pose while STEADY AIM is on. */
export function steadyAim(space: Object3D): void {
  const pos = new Vector3();
  const rot = new Quaternion();
  let last = -1;
  const make = space.updateMatrix.bind(space);
  space.updateMatrix = () => {
    const now = performance.now();
    if (!accessOn('steadyAim')) {
      last = -1;
      make();
      return;
    }
    if (last < 0) {
      pos.copy(space.position);
      rot.copy(space.quaternion);
    } else if (now - last >= SAME_FRAME_MS) {
      const dt = Math.min(0.1, (now - last) / 1000);
      // The hand's speed in metres, plus its turn, in radians, a second.
      const speed = (pos.distanceTo(space.position) + rot.angleTo(space.quaternion) * 0.5) / dt;
      const a = alpha(MIN_CUTOFF + BETA * speed, dt);
      pos.lerp(space.position, a);
      rot.slerp(space.quaternion, a);
    }
    if (last < 0 || now - last >= SAME_FRAME_MS) last = now;
    space.position.copy(pos);
    space.quaternion.copy(rot);
    make();
  };
}
