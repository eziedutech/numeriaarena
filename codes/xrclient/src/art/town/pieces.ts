import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { Kit, TOWN } from './kit.js';

/**
 * The paper frame of a building still going up, and the fold that raises a
 * finished piece off the page. The pieces themselves are the town's models
 * (src/town/town-pieces.ts).
 */

/** Paper scaffolding over a footprint while a building is still going up. */
export function scaffold(w: number, h: number, height: number): Kit {
  const k = new Kit();
  const t = 0.03;
  const posts: [number, number][] = [];
  for (let x = 0; x <= w; x++) {
    posts.push([Math.min(Math.max(x, 0.12), w - 0.12), 0.12], [Math.min(Math.max(x, 0.12), w - 0.12), h - 0.12]);
  }
  for (const [x, z] of posts) k.box(x - t, 0, z - t, x + t, height, z + t, TOWN.paper, false);
  for (const z of [0.12, h - 0.12]) {
    for (const y of [height * 0.5, height]) k.box(0.12 - t, y - t, z - t, w - 0.12 + t, y + t, z + t, TOWN.sun);
  }
  for (const x of [0.12, w - 0.12]) k.box(x - t, height - t, 0.12, x + t, height + t, h - 0.12, TOWN.sun);
  return k;
}

const scaffolds = new Map<string, BufferGeometry>();

export function scaffoldGeometry(w: number, h: number, height = 0.7): BufferGeometry {
  const key = `${w}x${h}x${height}`;
  let g = scaffolds.get(key);
  if (!g) {
    g = scaffold(w, h, height).geometry();
    scaffolds.set(key, g);
  }
  return g;
}

/**
 * Folds a piece up off the page, `t` from 0 (flat) to 1 (standing). The
 * object's origin must sit on the back edge of its footprint, which is its
 * hinge; it rises with a small bounce at the end.
 */
export function foldUp(obj: Object3D, t: number): void {
  const u = Math.min(1, Math.max(0, t));
  const ease = 1 - Math.pow(1 - u, 3);
  const bounce = Math.sin(u * Math.PI) * 0.12 * u;
  obj.rotation.x = -(Math.PI / 2) * (1 - ease);
  obj.scale.y = Math.max(0.001, ease + bounce);
}
