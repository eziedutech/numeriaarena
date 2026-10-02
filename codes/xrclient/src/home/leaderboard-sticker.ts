/**
 * The Leaderboard link on the home page, the town sticker's partner: a round
 * paper sticker with a paper podium standing up on it (gold first in the
 * middle, silver second, bronze third), a trophy on top and paper confetti.
 * Flat tones only, lit from the top left like the town.
 */

const W = 360;
const H = 240;
const CX = 180;
const CY = 168;
const RX = 120;
const RY = 64;
const BORDER = 11;
const K = 12.5;
const OX = 184;
const OY = 160;

type Pt = [number, number];

const iso = (x: number, y: number, z = 0): Pt => [OX + (x - y) * 0.866 * K, OY + (x + y) * 0.5 * K - z * K];
const pts = (p: Pt[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const poly = (p: Pt[], fill: string) => `<polygon points="${pts(p)}" fill="${fill}"/>`;

function ground(x0: number, y0: number, x1: number, y1: number, fill: string, z = 0): string {
  return poly([iso(x0, y0, z), iso(x1, y0, z), iso(x1, y1, z), iso(x0, y1, z)], fill);
}

function box(x: number, y: number, w: number, d: number, h: number, [top, left, right]: string[], z = 0): string {
  const x1 = x + w;
  const y1 = y + d;
  return (
    poly([iso(x, y1, z), iso(x1, y1, z), iso(x1, y1, z + h), iso(x, y1, z + h)], left) +
    poly([iso(x1, y, z), iso(x1, y1, z), iso(x1, y1, z + h), iso(x1, y, z + h)], right) +
    poly([iso(x, y, z + h), iso(x1, y, z + h), iso(x1, y1, z + h), iso(x, y1, z + h)], top)
  );
}

/** A place number printed on a step's front (the side facing left), lying in that face. */
function placeNumber(x: number, y1: number, w: number, h: number, n: string, ink: string): string {
  const [px, py] = iso(x + w / 2, y1, h / 2);
  const size = Math.min(h * 0.62, 2.2) * K;
  return `<text transform="matrix(0.866 0.5 0 1 ${px.toFixed(1)} ${py.toFixed(1)})" text-anchor="middle" dominant-baseline="central" font-family="'Atkinson Hyperlegible', 'Segoe UI', sans-serif" font-weight="800" font-size="${size.toFixed(1)}" fill="${ink}">${n}</text>`;
}

const C = {
  field: '#b9cdf0',
  field2: '#a6bfe9',
  carpet: ['#f7a39e', '#f2716b', '#c9554f'],
  gold: ['#f3d27f', '#e8b64c', '#c99a34'],
  silver: ['#e4e8ee', '#b8bec8', '#959ca8'],
  bronze: ['#e5b58f', '#c98a5a', '#a36c42'],
  ink: '#3a3f4b',
  paper: '#fff8ec',
};

/** The ground: a field with soft rings and a carpet up to the podium. */
function groundLayer(): string {
  let s = ground(-7, -3.5, 5, 3.5, C.field2);
  s += ground(-1.9, 1.5, 0.1, 9, C.carpet[1]);
  s += ground(-1.9, 1.5, -1.5, 9, C.carpet[2]);
  return s;
}

/** A paper trophy: a cup of two folds on a stem and a base, with handles. */
function trophy(x: number, y: number, z: number): string {
  const [bx, by] = iso(x, y, z);
  const g = C.gold;
  // Drawn at the town's scale, then grown from its base to suit the bigger podium.
  return (
    `<g transform="translate(${bx} ${by}) scale(1.45) translate(${-bx} ${-by})">` +
    `<rect x="${bx - 9}" y="${by - 6}" width="18" height="6" fill="${g[2]}"/>` +
    `<rect x="${bx - 9}" y="${by - 6}" width="9" height="6" fill="${g[1]}"/>` +
    `<rect x="${bx - 2.5}" y="${by - 15}" width="5" height="9" fill="${g[2]}"/>` +
    poly([[bx - 16, by - 40], [bx, by - 40], [bx, by - 14]], g[0]) +
    poly([[bx, by - 40], [bx + 16, by - 40], [bx, by - 14]], g[1]) +
    poly([[bx - 16, by - 40], [bx - 23, by - 36], [bx - 17, by - 27], [bx - 13, by - 31]], g[2]) +
    poly([[bx + 16, by - 40], [bx + 23, by - 36], [bx + 17, by - 27], [bx + 13, by - 31]], g[2]) +
    // A paper star pressed on the cup.
    poly(
      [
        [bx, by - 35],
        [bx + 2, by - 30],
        [bx + 7, by - 30],
        [bx + 3, by - 27],
        [bx + 4.5, by - 22],
        [bx, by - 25],
        [bx - 4.5, by - 22],
        [bx - 3, by - 27],
        [bx - 7, by - 30],
        [bx - 2, by - 30],
      ],
      C.paper,
    ) +
    '</g>'
  );
}

/** Paper confetti: small squares and strips in the mission colours, tilted. */
function confetti(): string {
  const bits: [number, number, number, string, number, number][] = [
    [112, 62, -20, '#f2716b', 11, 6],
    [134, 34, 30, '#3fb6a0', 8, 8],
    [158, 10, 50, '#e8b64c', 10, 5],
    [214, 8, -12, '#f2716b', 7, 7],
    [238, 30, -35, '#3469c4', 12, 5],
    [258, 58, 15, '#b198ea', 8, 8],
    [100, 98, 40, '#e8b64c', 7, 7],
    [270, 92, -25, '#3fb6a0', 11, 5],
    [186, 22, 20, '#b198ea', 6, 6],
    [124, 84, -40, '#3469c4', 9, 4],
    [246, 78, 35, '#f2716b', 6, 6],
  ];
  return bits
    .map(
      ([x, y, a, fill, w, h]) =>
        `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="${fill}" transform="translate(${x} ${y}) rotate(${a})"/>`,
    )
    .join('');
}

/** The podium, drawn back to front along x: second, first, third. */
function podium(): string {
  const d = 3;
  const y = -1.5;
  const steps: [number, number, string[], string][] = [
    [-5.4, 3.4, C.silver, '2'],
    [-2.4, 5.6, C.gold, '1'],
    [0.6, 2.4, C.bronze, '3'],
  ];
  let s = '';
  for (const [x, h, tones, n] of steps) {
    s += box(x, y, 3, d, h, tones) + placeNumber(x, y + d, 3, h, n, C.paper);
  }
  s += trophy(-0.9, y + d / 2, 5.6);
  return s;
}

/** The sticker as an SVG string, `width` pixels wide. */
export function leaderboardSticker(width = W): string {
  const h = (width * H) / W;
  return `<svg viewBox="0 0 ${W} ${H}" width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="board-inner"><ellipse cx="${CX}" cy="${CY}" rx="${RX - BORDER}" ry="${RY - BORDER * (RY / RX)}"/></clipPath>
    <filter id="board-sh" x="-10%" y="-10%" width="125%" height="135%"><feDropShadow dx="4" dy="7" stdDeviation="6" flood-color="#46321a" flood-opacity="0.32"/></filter>
  </defs>
  <g filter="url(#board-sh)">
    <ellipse cx="${CX}" cy="${CY}" rx="${RX}" ry="${RY}" fill="#fffdf8"/>
    <g clip-path="url(#board-inner)"><rect width="${W}" height="${H}" fill="${C.field}"/>${groundLayer()}</g>
  </g>
  <g filter="url(#board-sh)">${podium()}${confetti()}</g>
</svg>`;
}
