import { Kit, TOWN, rand } from './kit.js';

/**
 * Trees, small things for the street and the land's own nature: water,
 * sand, hills and the plot kept for a landmark.
 */

export function treeRound(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  const h = 0.28 + r() * 0.08;
  k.prism(0.5, 0.5, 0.05, 0, h, 4, TOWN.trunk, 0.04, Math.PI / 4);
  k.crown(0.5, h + 0.18, 0.5, 0.3, 0.26, TOWN.leaf, r() * 1.5);
  k.crown(0.36, h + 0.08, 0.6, 0.16, 0.14, TOWN.leaf2, r() * 1.5);
  return k;
}

export function treePine(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  const turn = r() * 1.2;
  k.prism(0.5, 0.5, 0.045, 0, 0.16, 4, TOWN.trunk, 0.04, Math.PI / 4);
  k.cone(0.5, 0.5, 0.34, 0.12, 0.52, 6, TOWN.leaf2, turn);
  k.cone(0.5, 0.5, 0.27, 0.34, 0.74, 6, TOWN.leaf2, turn + 0.5);
  k.cone(0.5, 0.5, 0.19, 0.56, 0.95 + r() * 0.1, 6, TOWN.leaf2, turn + 1);
  return k;
}

export function bench(): Kit {
  const k = new Kit();
  k.box(0.2, 0.12, 0.42, 0.8, 0.16, 0.6, TOWN.trunk);
  k.box(0.2, 0.16, 0.42, 0.8, 0.32, 0.46, TOWN.trunk);
  k.box(0.24, 0, 0.44, 0.3, 0.12, 0.58, TOWN.ink, false);
  k.box(0.7, 0, 0.44, 0.76, 0.12, 0.58, TOWN.ink, false);
  return k;
}

export function lamp(): Kit {
  const k = new Kit();
  k.box(0.42, 0, 0.42, 0.58, 0.06, 0.58, TOWN.ink);
  k.prism(0.5, 0.5, 0.025, 0.06, 0.78, 4, TOWN.ink, 0.025, Math.PI / 4);
  k.box(0.42, 0.78, 0.42, 0.58, 0.9, 0.58, TOWN.sunflower);
  return k;
}

export function fountain(): Kit {
  const k = new Kit();
  k.prism(0.5, 0.5, 0.42, 0, 0.14, 6, TOWN.walk);
  k.prism(0.5, 0.5, 0.34, 0.14, 0.145, 6, TOWN.water);
  k.prism(0.5, 0.5, 0.05, 0.14, 0.4, 4, TOWN.walk, 0.04, Math.PI / 4);
  k.crown(0.5, 0.44, 0.5, 0.1, 0.08, TOWN.water);
  return k;
}

// ---------------------------------------------------------------- the land

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

/** The plot kept for a landmark: a gold dashed square and a star in the middle. */
export function plot(): Kit {
  const k = new Kit();
  const y = G + 0.002;
  for (let a = 0.08; a < 0.9; a += 0.22) {
    k.flat(a, 0.06, a + 0.12, 0.1, y, 0xe8b64c);
    k.flat(a, 0.9, a + 0.12, 0.94, y, 0xe8b64c);
    k.flat(0.06, a, 0.1, a + 0.12, y, 0xe8b64c);
    k.flat(0.9, a, 0.94, a + 0.12, y, 0xe8b64c);
  }
  k.pyramid(0.4, 0.4, 0.6, 0.6, y, 0.05, 0xe8b64c);
  return k;
}
