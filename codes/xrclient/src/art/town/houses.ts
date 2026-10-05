import { Kit, TOWN, WALLS, rand } from './kit.js';

/**
 * Houses. Each floor is half a tile high, and the front shows exactly the
 * windows the shop lists for it (rows x columns), since the maths cards
 * count them.
 */

export const FLOOR = 0.5;
const ROOFS = [TOWN.coral, TOWN.teal, TOWN.ink, TOWN.cobalt];

function colours(seed: number): { wall: number; roof: number } {
  const r = rand(seed);
  const wall = WALLS[Math.floor(r() * WALLS.length)];
  let roof = ROOFS[Math.floor(r() * ROOFS.length)];
  if (roof === wall) roof = TOWN.ink;
  return { wall, roof };
}

/** A house of `floors` with a pitched roof over x0..x1 by z0..z1. */
function pitched(seed: number, x0: number, z0: number, x1: number, z1: number, floors: number, rows: number, cols: number, rise: number): Kit {
  const { wall, roof } = colours(seed);
  const k = new Kit();
  const top = floors * FLOOR;
  k.box(x0, 0, z0, x1, top, z1, wall, false);
  k.gable(x0, z0, x1, z1, top, rise, roof, wall);
  k.windows(x0 + 0.04, x1 - 0.04, 0.04, top - 0.04, z1, rows, cols, wall === TOWN.cream ? TOWN.glass : TOWN.pane);
  return k;
}

export function houseHut(seed: number): Kit {
  return pitched(seed, 0.18, 0.2, 0.82, 0.8, 1, 1, 2, 0.34);
}

export function houseCottage(seed: number): Kit {
  const k = pitched(seed, 0.12, 0.18, 0.88, 0.82, 1, 1, 3, 0.36);
  k.box(0.66, 0.6, 0.32, 0.76, 0.86, 0.42, TOWN.coral);
  return k;
}

export function houseBasic(seed: number): Kit {
  const { wall, roof } = colours(seed);
  const k = new Kit();
  const top = 2 * FLOOR;
  k.box(0.14, 0, 0.16, 0.86, top, 0.84, wall, false);
  k.pyramid(0.08, 0.1, 0.92, 0.9, top, 0.32, roof);
  k.windows(0.18, 0.82, 0.04, top - 0.04, 0.84, 2, 2, wall === TOWN.cream ? TOWN.glass : TOWN.pane);
  return k;
}

export function houseTwoStorey(seed: number): Kit {
  const k = pitched(seed, 0.12, 0.16, 1.88, 0.84, 2, 2, 4, 0.4);
  k.box(1.5, 1.2, 0.3, 1.62, 1.42, 0.42, TOWN.coral);
  return k;
}

/** Shops below, homes above, a flat roof behind a low wall and an awning. */
export function shophouse(seed: number): Kit {
  const { wall, roof } = colours(seed);
  const k = new Kit();
  const top = 3 * FLOOR;
  k.box(0.08, 0, 0.14, 1.92, top, 0.86, wall);
  k.box(0.08, top, 0.14, 1.92, top + 0.08, 0.2, wall);
  k.box(0.08, top, 0.8, 1.92, top + 0.08, 0.86, wall);
  k.windows(0.12, 1.88, 0.04, top - 0.04, 0.86, 3, 4, wall === TOWN.cream ? TOWN.glass : TOWN.pane);
  // The awning over the shop windows, folded down at the front.
  k.quad([0.08, 0.5, 0.86], [1.92, 0.5, 0.86], [1.92, 0.44, 1.02], [0.08, 0.44, 1.02], roof, [1, 0, 0.86]);
  return k;
}
