import { Kit, TOWN, rand } from './kit.js';
import { FLOOR } from './houses.js';

/** The town's larger pieces: a park, the school, an office tower and the stadium. */

export function parkFlower(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  k.flat(0.06, 0.06, 1.94, 1.94, 0.008, TOWN.grass2);
  // Two paths crossing at a round bed.
  k.flat(0.9, 0.06, 1.1, 1.94, 0.012, TOWN.walk).flat(0.06, 0.9, 1.94, 1.1, 0.012, TOWN.walk);
  k.prism(1, 1, 0.26, 0, 0.08, 6, TOWN.walk);
  const petals = [TOWN.coral, TOWN.sunflower, TOWN.violet, TOWN.paper];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.crown(1 + Math.cos(a) * 0.14, 0.12, 1 + Math.sin(a) * 0.14, 0.05, 0.04, petals[i % 4], a);
  }
  // A bed of flowers in each quarter, a tree in two of them.
  for (const [x, z] of [
    [0.45, 0.45],
    [1.55, 0.45],
    [0.45, 1.55],
    [1.55, 1.55],
  ]) {
    for (let i = 0; i < 3; i++) {
      k.crown(x - 0.2 + i * 0.2, 0.07, z + 0.22, 0.05, 0.05, petals[Math.floor(r() * 4)], r());
    }
  }
  for (const [x, z] of [
    [0.45, 0.4],
    [1.55, 1.5],
  ]) {
    k.prism(x, z, 0.05, 0, 0.3, 4, TOWN.trunk, 0.04, Math.PI / 4);
    k.crown(x, 0.5, z, 0.26, 0.24, TOWN.leaf, r());
  }
  k.box(1.38, 0.1, 0.32, 1.72, 0.14, 0.46, TOWN.trunk);
  return k;
}

export function school(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  const top = 2 * FLOOR;
  const wall = r() < 0.5 ? TOWN.sun : TOWN.cream;
  k.flat(0.06, 1.3, 2.94, 1.94, 0.008, TOWN.walk);
  k.box(0.12, 0, 0.3, 2.88, top, 1.3, wall, false);
  k.gable(0.12, 0.3, 2.88, 1.3, top, 0.42, TOWN.coral, wall);
  k.windows(0.16, 2.84, 0.04, top - 0.04, 1.3, 2, 6, TOWN.glass);
  // The bell turret over the middle, and the flag in the yard.
  k.box(1.32, top + 0.2, 0.68, 1.68, top + 0.6, 0.92, TOWN.paper);
  k.pyramid(1.28, 0.64, 1.72, 0.96, top + 0.6, 0.3, TOWN.cobalt);
  k.prism(2.6, 1.7, 0.02, 0, 1.1, 4, TOWN.ink, 0.02, Math.PI / 4);
  k.quad([2.62, 0.84, 1.7], [2.92, 0.84, 1.7], [2.92, 1.06, 1.7], [2.62, 1.06, 1.7], TOWN.coral, [2.77, 0.95, 1.2]);
  return k;
}

export function officeTower(seed: number): Kit {
  const r = rand(seed);
  const k = new Kit();
  const top = 6 * FLOOR;
  const wall = r() < 0.5 ? TOWN.cobalt : TOWN.teal;
  k.box(0.2, 0, 0.2, 1.8, top, 1.8, wall);
  k.windows(0.24, 1.76, 0.06, top - 0.06, 1.8, 6, 4, TOWN.pane);
  // Bands round the other sides, and a plant room on the roof.
  for (let f = 1; f < 6; f++) {
    const y = f * FLOOR;
    k.quad([1.812, y - 0.04, 0.2], [1.812, y - 0.04, 1.8], [1.812, y + 0.04, 1.8], [1.812, y + 0.04, 0.2], TOWN.paper, [1, y, 1]);
    k.quad([0.188, y - 0.04, 0.2], [0.188, y - 0.04, 1.8], [0.188, y + 0.04, 1.8], [0.188, y + 0.04, 0.2], TOWN.paper, [1, y, 1]);
  }
  k.box(0.6, top, 0.6, 1.3, top + 0.28, 1.2, TOWN.paper);
  k.prism(1.55, 1.5, 0.015, top, top + 0.5, 3, TOWN.ink, 0.01);
  return k;
}

/** A round stand of twelve folds round a green field, with four floodlights. */
export function stadium(seed: number): Kit {
  const k = new Kit();
  const c = 1.5;
  const n = 12;
  const outer = 1.38;
  const inner = 1.0;
  const h = 0.55;
  const p = (r: number, y: number, i: number): [number, number, number] => {
    const a = (i / n) * Math.PI * 2 + (seed % 7) * 0.01;
    return [c + Math.cos(a) * r, y, c + Math.sin(a) * r];
  };
  for (let i = 0; i < n; i++) {
    const j = i + 1;
    const colour = i % 2 ? TOWN.coral : TOWN.paper;
    // The outside wall, the rim, and the seats sloping down to the field.
    k.quad(p(outer, 0, i), p(outer, 0, j), p(outer, h, j), p(outer, h, i), TOWN.cream, [c, h / 2, c]);
    k.quad(p(outer, h, i), p(outer, h, j), p(outer - 0.08, h, j), p(outer - 0.08, h, i), TOWN.ink, [c, h - 1, c]);
    k.quad(p(outer - 0.08, h, i), p(outer - 0.08, h, j), p(inner, 0.08, j), p(inner, 0.08, i), colour, [c, -1, c]);
    k.tri([c, 0.012, c], p(inner, 0.012, i), p(inner, 0.012, j), i % 2 ? TOWN.grass : TOWN.grass2, [c, -1, c]);
  }
  k.flat(c - 0.03, c - 0.6, c + 0.03, c + 0.6, 0.016, TOWN.line);
  for (const [x, z] of [
    [0.3, 0.3],
    [2.7, 0.3],
    [0.3, 2.7],
    [2.7, 2.7],
  ]) {
    k.prism(x, z, 0.03, 0, 1.0, 4, TOWN.ink, 0.03, Math.PI / 4);
    k.box(x - 0.1, 1.0, z - 0.04, x + 0.1, 1.12, z + 0.04, TOWN.sunflower);
  }
  return k;
}
