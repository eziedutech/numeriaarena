/**
 * The Fold Town link on the home page: a small round paper sticker lying
 * on the page, all field green inside a thick white sticker border, with a
 * paper town standing up on it past its edge (roads, houses, towers, trees,
 * a pond). Flat tones only: every block
 * shows a light top, a mid left side and a shaded right side.
 */

const W = 360;
const H = 240;
/** The sticker: an ellipse, as a round sticker lying on a table looks. */
const CX = 180;
const CY = 168;
const RX = 120;
const RY = 64;
/** The sticker's white border, cut wide like a real sticker. */
const BORDER = 11;
/** Isometric step in pixels for one ground unit. */
const K = 8.4;
/** Ground origin on screen (the town's centre). */
const OX = 182;
const OY = 164;

type Pt = [number, number];

const iso = (x: number, y: number, z = 0): Pt => [OX + (x - y) * 0.866 * K, OY + (x + y) * 0.5 * K - z * K];
const pts = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const poly = (p: Pt[], fill: string) => `<polygon points="${pts(p)}" fill="${fill}"/>`;

/** A flat quad on the ground from (x0, y0) to (x1, y1). */
function ground(x0: number, y0: number, x1: number, y1: number, fill: string, z = 0): string {
  return poly([iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)], fill);
}

/** A box: top, the side facing left (+y) and the side facing right (+x). */
function box(x: number, y: number, w: number, d: number, h: number, [top, left, right]: string[], z = 0): string {
  const x1 = x + w;
  const y1 = y + d;
  return (
    poly([iso(x, y1, z), iso(x1, y1, z), iso(x1, y1, z + h), iso(x, y1, z + h)], left) +
    poly([iso(x1, y, z), iso(x1, y1, z), iso(x1, y1, z + h), iso(x1, y, z + h)], right) +
    poly([iso(x, y, z + h), iso(x1, y, z + h), iso(x1, y1, z + h), iso(x, y1, z + h)], top)
  );
}

/**
 * Windows on the two visible sides of a box: rows every `step` up, a pale
 * pane on the lit side and a softer one on the shaded side.
 */
function windows(
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  z = 0,
  step = 1.1,
  [lit, shaded] = ['#fff8ec', '#e3dccb'],
): string {
  let s = '';
  const x1 = x + w;
  const y1 = y + d;
  const pane = 0.42;
  for (let up = z + 0.6; up + 0.55 <= z + h - 0.3; up += step) {
    for (let a = x + 0.35; a + pane <= x1 - 0.2; a += 0.8) {
      s += poly([iso(a, y1, up), iso(a + pane, y1, up), iso(a + pane, y1, up + 0.55), iso(a, y1, up + 0.55)], lit);
    }
    for (let b = y + 0.35; b + pane <= y1 - 0.2; b += 0.8) {
      s += poly([iso(x1, b, up), iso(x1, b + pane, up), iso(x1, b + pane, up + 0.55), iso(x1, b, up + 0.55)], shaded);
    }
  }
  return s;
}

/** A pitched roof along x over a box of size w by d, ridge height r. */
function roof(x: number, y: number, w: number, d: number, z: number, r: number, [light, dark]: string[]): string {
  const x1 = x + w;
  const y1 = y + d;
  const ym = y + d / 2;
  // Seen from above, both slopes show: the back one in the darker tone.
  return (
    poly([iso(x, y, z), iso(x1, y, z), iso(x1, ym, z + r), iso(x, ym, z + r)], dark) +
    poly([iso(x, y1, z), iso(x1, y1, z), iso(x1, ym, z + r), iso(x, ym, z + r)], light) +
    poly([iso(x1, y, z), iso(x1, y1, z), iso(x1, ym, z + r)], dark)
  );
}

/** A paper tree: a cone made of two triangles on a short trunk. */
function tree(x: number, y: number, h = 2.2): string {
  const [bx, by] = iso(x, y, 0);
  const t = h * K;
  return (
    `<rect x="${bx - 1.2}" y="${by - 5}" width="2.4" height="5" fill="#8a6a3e"/>` +
    poly([[bx - 6, by - 4], [bx, by - 4 - t], [bx, by - 2]], '#4fbf8f') +
    poly([[bx, by - 2], [bx, by - 4 - t], [bx + 6, by - 4]], '#3a9c72')
  );
}

const C = {
  grass: '#9fd486',
  grass2: '#8cc874',
  road: '#5d6270',
  line: '#f4f1e8',
  walk: '#e9e2d0',
  cobalt: ['#6a95e0', '#3469c4', '#2a54a0'],
  violet: ['#cdbdf2', '#b198ea', '#8f76c9'],
  coral: ['#f7a39e', '#f2716b', '#c9554f'],
  teal: ['#7fd6c6', '#3fb6a0', '#2f8f7d'],
  sun: ['#f3d27f', '#e8b64c', '#c99a34'],
  cream: ['#fffaf0', '#f3e6c9', '#ddc9a2'],
  ink: ['#5d6270', '#3a3f4b', '#2b2f38'],
};

/** The ground: grass, roads and pavements, cut to the sticker. */
function groundLayer(): string {
  let s = '';
  // Grass blocks and the cross of roads.
  s += ground(-14, -1, 14, 1, C.road);
  s += ground(-1, -14, 1, 14, C.road);
  for (let i = -13; i < 13; i += 2) {
    s += ground(i + 0.3, -0.12, i + 1.1, 0.12, C.line);
    s += ground(-0.12, i + 0.3, 0.12, i + 1.1, C.line);
  }
  // A zebra crossing and pavements.
  for (let i = -0.8; i < 0.8; i += 0.4) s += ground(1.3, i, 2.3, i + 0.2, C.line);
  s += ground(-14, -1.6, -1, -1, C.walk) + ground(1, 1, 14, 1.6, C.walk);
  s += ground(-7, -7, -2.5, -3.6, C.grass2);
  s += ground(5.5, 3, 8, 5, '#7cc6e8');
  return s;
}

/** The buildings and trees, drawn back to front; they stand up past the sticker's edge. */
function buildings(): string {
  let s = '';
  // Back left block: houses by a field.
  s += box(-6.2, -5.6, 2.6, 2.2, 2, C.cobalt) + windows(-6.2, -5.6, 2.6, 2.2, 2) + roof(-6.2, -5.6, 2.6, 2.2, 2, 1.3, [C.ink[0], C.ink[2]]);
  s += box(-4.5, -3.6, 2.6, 2, 1.6, C.cream) + windows(-4.5, -3.6, 2.6, 2, 1.6) + roof(-4.5, -3.6, 2.6, 2, 1.6, 1.1, [C.teal[1], C.teal[2]]);
  // Back right block: the tall glass tower and a violet round tower.
  s += box(2.5, -6.5, 3, 3, 9, C.cobalt) + windows(2.5, -6.5, 3, 3, 9);
  s += ground(3.1, -5.9, 4.9, -4.1, C.ink[1], 9);
  s += box(6.2, -5.2, 2, 2, 7, C.violet) + windows(6.2, -5.2, 2, 2, 7);
  s += box(2.4, -3, 2.6, 2.2, 3.6, C.violet) + windows(2.4, -3, 2.6, 2.2, 3.6);
  // Front left block: a park with a playground and a house.
  s += tree(-7.5, 2.4) + tree(-4.6, 6) + tree(-7, 6.2);
  s += box(-4, 2.5, 2.6, 2, 1.8, C.coral) + windows(-4, 2.5, 2.6, 2, 1.8) + roof(-4, 2.5, 2.6, 2, 1.8, 1.2, [C.teal[1], C.teal[2]]);
  s += box(-6.8, 3.6, 2.2, 1.8, 1.4, C.coral) + windows(-6.8, 3.6, 2.2, 1.8, 1.4) + roof(-6.8, 3.6, 2.2, 1.8, 1.4, 1, [C.teal[0], C.teal[2]]);
  // Front right block: a shop and a tall tower by the pond.
  s += box(2, 2.4, 3, 2.4, 1.8, C.sun) + windows(2, 2.4, 3, 2.4, 1.8) + roof(2, 2.4, 3, 2.4, 1.8, 1.4, [C.coral[1], C.coral[2]]);
  s += box(2.4, 5.6, 2.2, 2.2, 7.5, C.cream) + windows(2.4, 5.6, 2.2, 2.2, 7.5, 0, 1.1, ['#3469c4', '#2a54a0']);
  s += poly([iso(2.4, 7.8, 7.5), iso(4.6, 7.8, 7.5), iso(3.5, 6.7, 9.6)], C.sun[1]);
  s += poly([iso(4.6, 5.6, 7.5), iso(4.6, 7.8, 7.5), iso(3.5, 6.7, 9.6)], C.sun[2]);
  s += tree(6.5, 6.5, 1.8) + tree(8, 7.5, 1.6);
  return s;
}

/** The sticker as an SVG string, `width` pixels wide. */
export function townSticker(width = W): string {
  const h = (width * H) / W;
  return `<svg viewBox="0 0 ${W} ${H}" width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="town-inner"><ellipse cx="${CX}" cy="${CY}" rx="${RX - BORDER}" ry="${RY - BORDER * (RY / RX)}"/></clipPath>
    <filter id="town-sh" x="-10%" y="-10%" width="125%" height="135%"><feDropShadow dx="4" dy="7" stdDeviation="6" flood-color="#46321a" flood-opacity="0.32"/></filter>
  </defs>
  <g filter="url(#town-sh)">
    <ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="#fffdf8"/>
    <g clip-path="url(#town-inner)"><rect width="${W}" height="${H}" fill="${C.grass}"/>${groundLayer()}</g>
  </g>
  <g filter="url(#town-sh)">${buildings()}</g>
</svg>`;
}
