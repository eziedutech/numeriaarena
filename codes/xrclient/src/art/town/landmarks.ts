import { Kit, TOWN } from './kit.js';

/**
 * The five landmarks, one per mission, each standing on its page's plot
 * and folded in its mission's colour.
 */

/** Fractions: a bridge whose deck is cut in quarters, over the river. */
export function fractionBridge(): Kit {
  const k = new Kit();
  const y = 0.22;
  for (let q = 0; q < 4; q++) {
    k.box(q * 0.25 + 0.005, y, 0.32, q * 0.25 + 0.245, y + 0.05, 0.68, q % 2 ? TOWN.teal : TOWN.paper);
  }
  // An arch under the deck, two towers and their rails.
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI;
    const a1 = ((i + 1) / n) * Math.PI;
    const x0 = 0.5 - Math.cos(a0) * 0.42;
    const x1 = 0.5 - Math.cos(a1) * 0.42;
    const y0 = Math.sin(a0) * 0.2;
    const y1 = Math.sin(a1) * 0.2;
    k.quad([x0, y0, 0.34], [x1, y1, 0.34], [x1, y1, 0.66], [x0, y0, 0.66], TOWN.teal, [0.5, 0.5, 0.5]);
  }
  for (const x of [0.12, 0.88]) {
    k.box(x - 0.06, 0, 0.28, x + 0.06, 0.6, 0.38, TOWN.teal);
    k.box(x - 0.06, 0, 0.62, x + 0.06, 0.6, 0.72, TOWN.teal);
    k.pyramid(x - 0.07, 0.27, x + 0.07, 0.39, 0.6, 0.1, TOWN.paper);
    k.pyramid(x - 0.07, 0.61, x + 0.07, 0.73, 0.6, 0.1, TOWN.paper);
  }
  k.box(0.18, y + 0.05, 0.32, 0.82, y + 0.1, 0.34, TOWN.ink);
  k.box(0.18, y + 0.05, 0.66, 0.82, y + 0.1, 0.68, TOWN.ink);
  return k;
}

/** Multiplication: a tower of blocks, each one smaller, with a times sign on top. */
export function timesTower(): Kit {
  const k = new Kit();
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const r = 0.36 - i * 0.06;
    const h = 0.32 - i * 0.03;
    k.box(0.5 - r, y, 0.5 - r, 0.5 + r, y + h, 0.5 + r, i % 2 ? TOWN.paper : TOWN.cobalt);
    k.windows(0.5 - r + 0.04, 0.5 + r - 0.04, y + 0.04, y + h - 0.04, 0.5 + r, 1, 2, i % 2 ? TOWN.glass : TOWN.pane);
    y += h;
  }
  k.pyramid(0.36, 0.36, 0.64, 0.64, y, 0.22, TOWN.cobalt);
  // The times sign: two crossed bars standing on the point.
  const s = y + 0.36;
  const d = 0.1;
  k.quad([0.5 - d, s - d - 0.02, 0.5], [0.5 - d + 0.03, s - d - 0.02, 0.5], [0.5 + d, s + d, 0.5], [0.5 + d - 0.03, s + d, 0.5], TOWN.sunflower, [0.5, s, 0.4]);
  k.quad([0.5 + d, s - d - 0.02, 0.5], [0.5 + d - 0.03, s - d - 0.02, 0.5], [0.5 - d, s + d, 0.5], [0.5 - d + 0.03, s + d, 0.5], TOWN.sunflower, [0.5, s, 0.4]);
  k.prism(0.5, 0.5, 0.012, y + 0.2, s - 0.1, 3, TOWN.ink);
  return k;
}

/** Place value: a hall of columns, hundreds, tens and ones, under a pediment. */
export function numberHall(): Kit {
  const k = new Kit();
  k.box(0.06, 0, 0.12, 0.94, 0.06, 0.88, TOWN.paper);
  k.box(0.1, 0.06, 0.16, 0.9, 0.1, 0.84, TOWN.paper);
  k.box(0.16, 0.1, 0.2, 0.84, 0.5, 0.62, TOWN.coral);
  k.door(0.5, 0.62, 0.14, 0.24, TOWN.ink);
  for (let i = 0; i < 4; i++) {
    k.prism(0.18 + i * 0.213, 0.76, 0.04, 0.1, 0.5, 6, TOWN.paper);
  }
  k.box(0.1, 0.5, 0.16, 0.9, 0.56, 0.84, TOWN.paper);
  k.gable(0.1, 0.16, 0.9, 0.84, 0.56, 0.2, TOWN.coral, TOWN.paper, true, 0.02);
  return k;
}

/** Decimals: a market of stalls, every awning striped in tenths. */
export function decimalMarket(): Kit {
  const k = new Kit();
  k.flat(0.06, 0.06, 0.94, 0.94, 0.008, TOWN.walk);
  for (const [x0, z0] of [
    [0.1, 0.12],
    [0.52, 0.12],
    [0.31, 0.54],
  ]) {
    const x1 = x0 + 0.38;
    k.box(x0 + 0.02, 0, z0 + 0.06, x1 - 0.02, 0.16, z0 + 0.3, TOWN.paper);
    k.prism(x0 + 0.04, z0 + 0.32, 0.012, 0, 0.32, 3, TOWN.ink);
    k.prism(x1 - 0.04, z0 + 0.32, 0.012, 0, 0.32, 3, TOWN.ink);
    for (let s = 0; s < 10; s++) {
      const a = x0 + (s * 0.38) / 10;
      const b = a + 0.038;
      k.quad([a, 0.38, z0 + 0.04], [b, 0.38, z0 + 0.04], [b, 0.3, z0 + 0.36], [a, 0.3, z0 + 0.36], s % 2 ? TOWN.paper : TOWN.sunflower, [a, 0, z0 + 0.1]);
    }
  }
  return k;
}

/** Measurement: a clock tower whose face has twelve marks and two hands. */
export function clockTower(): Kit {
  const k = new Kit();
  k.box(0.3, 0, 0.3, 0.7, 1.0, 0.7, TOWN.violet);
  k.box(0.26, 1.0, 0.26, 0.74, 1.06, 0.74, TOWN.paper);
  k.pyramid(0.26, 0.26, 0.74, 0.74, 1.06, 0.34, TOWN.ink);
  k.door(0.5, 0.7, 0.12, 0.2, TOWN.ink);
  const cy = 0.78;
  const z = 0.71;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    k.tri([0.5, cy, z], [0.5 + Math.cos(a0) * 0.15, cy + Math.sin(a0) * 0.15, z], [0.5 + Math.cos(a1) * 0.15, cy + Math.sin(a1) * 0.15, z], TOWN.paper, [0.5, cy, 0.5]);
  }
  const zh = z + 0.006;
  // The hands at three o'clock: the hour along x, the minute straight up.
  k.quad([0.5, cy - 0.012, zh], [0.6, cy - 0.012, zh], [0.6, cy + 0.012, zh], [0.5, cy + 0.012, zh], TOWN.ink, [0.5, cy, 0.5]);
  k.quad([0.488, cy, zh], [0.512, cy, zh], [0.512, cy + 0.13, zh], [0.488, cy + 0.13, zh], TOWN.ink, [0.5, cy, 0.5]);
  return k;
}
