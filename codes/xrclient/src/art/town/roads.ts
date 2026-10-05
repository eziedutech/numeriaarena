import { Kit, TOWN } from './kit.js';

/**
 * Roads, a paper strip on the page with pavements either side. A straight
 * runs along x; a corner joins the left edge to the front; a cross meets all
 * four edges. Turning is the town's job.
 */

const Y = 0.01;
const LINE = Y + 0.004;
/** The pavement's width. */
const P = 0.14;

function dashes(k: Kit, alongX: boolean, from: number, to: number): void {
  for (let a = from; a + 0.16 <= to; a += 0.34) {
    if (alongX) k.flat(a, 0.47, a + 0.16, 0.53, LINE, TOWN.line);
    else k.flat(0.47, a, 0.53, a + 0.16, LINE, TOWN.line);
  }
}

export function roadStraight(): Kit {
  const k = new Kit();
  k.flat(0, 0, 1, P, Y, TOWN.walk).flat(0, 1 - P, 1, 1, Y, TOWN.walk);
  k.flat(0, P, 1, 1 - P, Y, TOWN.road);
  dashes(k, true, 0.09, 1);
  return k;
}

export function roadCorner(): Kit {
  const k = new Kit();
  // Pavement round the outside of the bend (back and right), a corner stone inside.
  k.flat(0, 0, 1, P, Y, TOWN.walk).flat(1 - P, P, 1, 1, Y, TOWN.walk);
  k.flat(0, 1 - P, P, 1, Y, TOWN.walk);
  k.flat(0, P, 1 - P, 1 - P, Y, TOWN.road).flat(P, 1 - P, 1 - P, 1, Y, TOWN.road);
  k.flat(0.05, 0.47, 0.3, 0.53, LINE, TOWN.line).flat(0.47, 0.7, 0.53, 0.95, LINE, TOWN.line);
  return k;
}

export function roadCross(): Kit {
  const k = new Kit();
  for (const [x, z] of [
    [0, 0],
    [1 - P, 0],
    [0, 1 - P],
    [1 - P, 1 - P],
  ]) {
    k.flat(x, z, x + P, z + P, Y, TOWN.walk);
  }
  k.flat(0, P, 1, 1 - P, Y, TOWN.road).flat(P, 0, 1 - P, P, Y, TOWN.road).flat(P, 1 - P, 1 - P, 1, Y, TOWN.road);
  // A zebra crossing on one arm.
  for (let x = P + 0.05; x + 0.08 <= 1 - P; x += 0.16) k.flat(x, 0.02, x + 0.08, P - 0.02, LINE, TOWN.line);
  return k;
}
