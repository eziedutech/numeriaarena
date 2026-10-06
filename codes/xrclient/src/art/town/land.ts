import { Kit, TOWN, rand } from './kit.js';

/**
 * The land's own nature under the town: water, sand, hills and the plot
 * kept for a landmark. Each is drawn from the corner of its tiles.
 */

const G = 0.004;

/** A tile of river, with two ripples. */
export function water(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  k.flat(0, 0, 1, 1, G, TOWN.water);
  const a = 0.15 + r() * 0.3;
  k.flat(a, 0.3, a + 0.25, 0.33, G + 0.003, TOWN.paper);
  k.flat(a + 0.3, 0.66, a + 0.5, 0.69, G + 0.003, TOWN.paper);
  return k;
}

export function sand(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  k.flat(0, 0, 1, 1, G, TOWN.sand);
  k.pyramid(0.2 + r() * 0.5, 0.3, 0.28 + r() * 0.5, 0.36, G, 0.03, TOWN.coral);
  return k;
}

/** A folded hill, its top cut flat, with a rock. */
export function hill(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  k.prism(0.5, 0.5, 0.7, 0, 0.32 + r() * 0.12, 4, TOWN.hill, 0.3, Math.PI / 4 + (r() - 0.5) * 0.2);
  k.crown(0.3 + r() * 0.3, 0.1, 0.75, 0.08, 0.06, TOWN.rock, r());
  return k;
}

/** The plot kept for a landmark, two tiles wide: a gold dashed edge and a star in the middle. */
export function plot(): Kit {
  const k = new Kit();
  const y = G + 0.002;
  for (let a = 0.08; a < 1.9; a += 0.22) {
    k.flat(a, 0.06, a + 0.12, 0.1, y, TOWN.sun);
    k.flat(a, 0.9, a + 0.12, 0.94, y, TOWN.sun);
  }
  for (let a = 0.08; a < 0.9; a += 0.22) {
    k.flat(0.06, a, 0.1, a + 0.12, y, TOWN.sun);
    k.flat(1.9, a, 1.94, a + 0.12, y, TOWN.sun);
  }
  k.pyramid(0.9, 0.4, 1.1, 0.6, y, 0.05, TOWN.sun);
  return k;
}
