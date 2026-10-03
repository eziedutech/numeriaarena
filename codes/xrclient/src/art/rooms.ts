import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from '@iwsdk/core';

/**
 * Virtual rooms around the desk in the headset, built from flat matte paper
 * boxes: real proportions, a little untidy so they do not look stiff. The
 * colours ride on the vertices, so a room is two draw calls (paper and sky). Stand-ins until the room
 * models are made; the frame is the same.
 *
 * Frame: the origin is on the floor under the point where the book stands,
 * +Y up, +Z towards the seated player. `deskTop` is the height of the real
 * desk top, so the virtual desk lies exactly under the book.
 */
export type VirtualRoom = 'classroom' | 'bedroom';

/** A classmate's seat in the classroom: the chair's spot on the floor, facing -Z turned by ry. */
export interface Seat {
  x: number;
  z: number;
  ry: number;
  /** The rivals' seats beside the player, or a classmate in another row. */
  role: 'left' | 'right' | 'class';
}

/**
 * A poster on the bedroom's front wall that holds a rival (a robot now,
 * a classmate later): its centre on the wall, facing +Z, and its size.
 */
export interface Poster {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  /** 1 or 2: the rival on the left or the right, as at the classroom's desks. */
  desk: number;
}

/** Bedroom posters: either side of the window, beyond the curtains. */
const POSTER_X = 1.3;
const POSTER_W = 0.5;
const POSTER_H = 0.66;
/** Poster colours: the robots' cobalt (left) and teal (right), as on their windows on the desk. */
const POSTER_COLORS = [0x3469c4, 0x3fb6a0];
const POSTER_TINTS = [0xe6edf8, 0xe2f3ee];

/** Classmates' desk tops. */
export const KID_DESK_TOP = 0.72;
/** The classroom's front wall, its chalkboard (centre and size) and its clock. */
export const CLASS_FRONT_Z = -3.4;
export const CLASS_BOARD = { x: 0.2, y: 1.55, w: 3.28, h: 1.2 };
export const CLASS_CLOCK = { x: 2.6, y: 2.45, r: 0.17 };

/** A darker wood than the desks, so the bedroom's study desk stands out from the light floor. */
const DARK_WOOD = 0x9a7350;
/** The grout under both rooms' floor tiles. */
const GROUT = 0xcfcbc2;
/** The home page's own backdrop (index.html, desk.ts PREVIEW_BASE), so the rooms feel like the game. */
const WALL = 0xe0c780;
/** The wall a shade and two shades darker, where two walls or a wall and the ceiling meet. */
const CORNER_SOFT = 0xd8be77;
const CORNER_DARK = 0xc9ad66;
const CEILING = 0xfbf6ec;
const DESK_WOOD = 0xd9b98c;
const METAL = 0x8a8f99;
const SKY = 0xbfe3f5;
const FRAME = 0xfff8ec;

/** Matte paper coloured per vertex, shared by every room and figure. */
const PAPER_MAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
/** The sky behind the windows: unlit, so it reads as daylight. */
const SKY_MAT = new MeshBasicMaterial({ color: SKY });

/**
 * Collects boxes and cylinders with their colours, then merges them into one
 * mesh (and one more for anything sky coloured, which is unlit).
 */
export class Builder {
  private paper: BufferGeometry[] = [];
  private colors: number[] = [];
  private sky: BufferGeometry[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private e = new Euler();
  private one = new Vector3(1, 1, 1);

  constructor(private seed = 1) {}

  /** A small deterministic wobble, so copies of one thing are not lined up exactly. */
  jitter(amount: number): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return ((this.seed / 2147483647) * 2 - 1) * amount;
  }

  /** A box of size w, h, d with its centre at x, y, z, turned by ry about Y (and rx, rz). */
  box(color: number, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void {
    this.add(color, new BoxGeometry(w, h, d), x, y, z, ry, rx, rz);
  }

  /** A box standing on y (its bottom at y). */
  block(color: number, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0): void {
    this.box(color, w, h, d, x, y + h / 2, z, ry);
  }

  cylinder(color: number, r: number, h: number, x: number, y: number, z: number, rx = 0, sides = 12, rz = 0): void {
    this.add(color, new CylinderGeometry(r, r, h, sides), x, y, z, 0, rx, rz);
  }

  private add(color: number, g: BufferGeometry, x: number, y: number, z: number, ry: number, rx: number, rz: number): void {
    this.q.setFromEuler(this.e.set(rx, ry, rz, 'YXZ'));
    g.applyMatrix4(this.m.compose(new Vector3(x, y, z), this.q, this.one));
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    if (color === SKY) {
      this.sky.push(flat);
      return;
    }
    this.paper.push(flat);
    this.colors.push(color);
  }

  /** Everything added so far as one group of (at most) two meshes. */
  build(name: string): Group {
    const group = new Group();
    group.name = name;
    const paper = merge(this.paper, this.colors);
    if (paper) group.add(named(new Mesh(paper, PAPER_MAT), `${name}-paper`));
    const sky = merge(this.sky);
    if (sky) group.add(named(new Mesh(sky, SKY_MAT), `${name}-sky`));
    this.paper = [];
    this.colors = [];
    this.sky = [];
    return group;
  }
}

function named(mesh: Mesh, name: string): Mesh {
  mesh.name = name;
  return mesh;
}

/** One geometry from many, each coloured `colors[i]` when colours are given. */
function merge(list: BufferGeometry[], colors?: number[]): BufferGeometry | undefined {
  if (list.length === 0) return undefined;
  let count = 0;
  for (const g of list) count += g.getAttribute('position').count;
  const pos = new Float32Array(count * 3);
  const col = colors ? new Float32Array(count * 3) : undefined;
  const c = new Color();
  let at = 0;
  list.forEach((g, i) => {
    const p = g.getAttribute('position').array as Float32Array;
    pos.set(p, at);
    if (col && colors) {
      c.setHex(colors[i]);
      for (let k = at; k < at + p.length; k += 3) {
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
    }
    at += p.length;
    g.dispose();
  });
  const merged = new BufferGeometry();
  merged.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (col) merged.setAttribute('color', new Float32BufferAttribute(col, 3));
  merged.computeVertexNormals();
  return merged;
}

/** White floor tiles over the grout, every other one a shade warmer. */
function tiledFloor(b: Builder, x0: number, x1: number, z0: number, z1: number): void {
  const tile = 0.4;
  for (let x = x0; x < x1 - 0.01; x += tile) {
    for (let z = z0; z < z1 - 0.01; z += tile) {
      const w = Math.min(tile, x1 - x) - 0.008;
      const d = Math.min(tile, z1 - z) - 0.008;
      const odd = (Math.round((x - x0) / tile) + Math.round((z - z0) / tile)) % 2;
      b.box(odd ? 0xf1eee7 : 0xf8f6f1, w, 0.004, d, x + w / 2 + 0.004, 0, z + d / 2 + 0.004);
    }
  }
}

/** Floor, ceiling and four walls of a room spanning x0..x1 and z0..z1. */
function shell(b: Builder, x0: number, x1: number, z0: number, z1: number, height: number, floor: number): void {
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const t = 0.1;
  b.box(floor, w + 2 * t, t, d + 2 * t, cx, -t / 2 - 0.002, cz);
  b.box(CEILING, w + 2 * t, t, d + 2 * t, cx, height + t / 2, cz);
  b.box(WALL, w, height, t, cx, height / 2, z0 - t / 2);
  b.box(WALL, w, height, t, cx, height / 2, z1 + t / 2);
  b.box(WALL, t, height, d, x0 - t / 2, height / 2, cz);
  b.box(WALL, t, height, d, x1 + t / 2, height / 2, cz);
  // Soft shade into each corner and under the ceiling, so one flat colour
  // still reads as walls meeting: a wide light band, a narrow darker one in it.
  const off = 0.025;
  for (const [w0, c] of [
    [CORNER_SOFT, 0.14],
    [CORNER_DARK, 0.045],
  ] as const) {
    const o = w0 === CORNER_DARK ? off + 0.002 : off;
    for (const x of [x0 + c / 2, x1 - c / 2]) {
      b.box(w0, c, height, 0.002, x, height / 2, z0 + o);
      b.box(w0, c, height, 0.002, x, height / 2, z1 - o);
    }
    for (const z of [z0 + c / 2, z1 - c / 2]) {
      b.box(w0, 0.002, height, c, x0 + o, height / 2, z);
      b.box(w0, 0.002, height, c, x1 - o, height / 2, z);
    }
    const y = height - c / 2;
    b.box(w0, w, c, 0.002, cx, y, z0 + o);
    b.box(w0, w, c, 0.002, cx, y, z1 - o);
    b.box(w0, 0.002, c, d, x0 + o, y, cz);
    b.box(w0, 0.002, c, d, x1 - o, y, cz);
  }
}

/**
 * A window on the side wall at x = wallX, `inward` pointing into the room:
 * the sky as a panel just off the wall, a cream frame, a sill and a cross bar.
 */
function windowOnSideWall(b: Builder, wallX: number, inward: 1 | -1, z: number, y: number, w: number, h: number): void {
  b.box(SKY, 0.01, h, w, wallX + inward * 0.03, y, z);
  const f = 0.06;
  const x = wallX + inward * 0.05;
  b.box(FRAME, 0.04, f, w + f, x, y + h / 2, z);
  b.box(FRAME, 0.16, 0.04, w + 2 * f, wallX + inward * 0.09, y - h / 2 - 0.02, z);
  b.box(FRAME, 0.04, h, f, x, y, z - w / 2);
  b.box(FRAME, 0.04, h, f, x, y, z + w / 2);
  b.box(FRAME, 0.03, h, 0.035, x, y, z);
  b.box(FRAME, 0.03, 0.035, w, x, y + h * 0.12, z);
}

/** A window on the wall at z = wallZ facing +Z (into the room). */
function windowOnFrontWall(b: Builder, wallZ: number, x: number, y: number, w: number, h: number): void {
  b.box(SKY, w, h, 0.01, x, y, wallZ + 0.03);
  const f = 0.06;
  const z = wallZ + 0.05;
  b.box(FRAME, w + f, f, 0.04, x, y + h / 2, z);
  b.box(FRAME, w + 2 * f, 0.04, 0.14, x, y - h / 2 - 0.02, wallZ + 0.08);
  b.box(FRAME, f, h, 0.04, x - w / 2, y, z);
  b.box(FRAME, f, h, 0.04, x + w / 2, y, z);
  b.box(FRAME, 0.035, h, 0.03, x, y, z);
}

/** A desk of w x d with its top at `top`, centred on x, z: a top board and four legs. */
function desk(b: Builder, x: number, z: number, w: number, d: number, top: number, ry = 0, wood = DESK_WOOD): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  b.box(wood, w, 0.03, d, x, top - 0.015, z, ry);
  for (const [lx, lz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const px = (lx * (w / 2 - 0.05));
    const pz = (lz * (d / 2 - 0.05));
    b.block(METAL, 0.035, top - 0.03, 0.035, x + px * c + pz * s, 0, z - px * s + pz * c, ry);
  }
}

/** A school chair facing -Z (towards the board), its seat at 0.42 m, turned by ry. */
export function chair(b: Builder, x: number, z: number, ry: number, color: number): void {
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  let [px, pz] = at(0, 0);
  b.box(color, 0.4, 0.025, 0.38, px, 0.42, pz, ry);
  [px, pz] = at(0, 0.18);
  b.box(color, 0.4, 0.26, 0.025, px, 0.68, pz, ry, -0.08);
  for (const [lx, lz] of [
    [-0.17, -0.16],
    [0.17, -0.16],
    [-0.17, 0.16],
    [0.17, 0.16],
  ]) {
    [px, pz] = at(lx, lz);
    b.block(METAL, 0.025, 0.41, 0.025, px, 0, pz, ry);
  }
}

/** A few books leaning on a shelf board at y, from x0 towards +X. */
function books(b: Builder, x0: number, y: number, z: number, depth: number, count: number, colors: number[]): void {
  let x = x0;
  for (let i = 0; i < count; i += 1) {
    const w = 0.025 + Math.abs(b.jitter(0.012));
    const h = 0.18 + b.jitter(0.04);
    const lean = i === count - 1 ? 0.25 : b.jitter(0.03);
    b.box(colors[i % colors.length], w, h, depth, x + w / 2, y + h / 2, z, 0, 0, lean);
    x += w + 0.004;
  }
}

/**
 * A classroom about 7 x 8 m: the player at a desk in the second row, a
 * chalkboard ahead, windows on the left, other desks and chairs around.
 */
function classroom(deskTop: number): Group {
  const b = new Builder(7);
  const x0 = -3.3;
  const x1 = 3.7;
  const z0 = CLASS_FRONT_Z;
  const z1 = 4.4;
  const height = 3.0;
  // The same tiled floor as the bedroom.
  shell(b, x0, x1, z0, z1, height, GROUT);
  tiledFloor(b, x0, x1, z0, z1);
  // A soft green band on the lower walls.
  const band = 0xb5d8cb;
  b.box(band, x1 - x0, 0.9, 0.02, (x0 + x1) / 2, 0.45, z0 + 0.01);
  b.box(band, x1 - x0, 0.9, 0.02, (x0 + x1) / 2, 0.45, z1 - 0.01);
  b.box(band, 0.02, 0.9, z1 - z0, x1 - 0.01, 0.45, (z0 + z1) / 2);
  b.box(band, 0.02, 0.9, z1 - z0, x0 + 0.01, 0.45, (z0 + z1) / 2);
  // Chalkboard ahead, left blank: a wooden frame and a chalk ledge.
  const board = 0x3f6b57;
  b.box(DESK_WOOD, CLASS_BOARD.w + 0.12, CLASS_BOARD.h + 0.12, 0.04, CLASS_BOARD.x, CLASS_BOARD.y, z0 + 0.02);
  b.box(board, CLASS_BOARD.w, CLASS_BOARD.h, 0.03, CLASS_BOARD.x, CLASS_BOARD.y, z0 + 0.045);
  b.box(DESK_WOOD, 3.3, 0.04, 0.09, 0.2, 0.93, z0 + 0.07);
  b.box(FRAME, 0.08, 0.012, 0.012, -0.6, 0.957, z0 + 0.08, 0.3);
  b.box(0xf9c74f, 0.07, 0.012, 0.012, -0.45, 0.957, z0 + 0.08, -0.2);
  // A round clock without numbers above the board, and a corner board with paper shapes.
  // (The classroom life adds its hands and the race's time on its face.)
  b.cylinder(FRAME, CLASS_CLOCK.r, 0.04, CLASS_CLOCK.x, CLASS_CLOCK.y, z0 + 0.02, Math.PI / 2, 20);
  b.cylinder(0x3a3f4b, CLASS_CLOCK.r + 0.015, 0.035, CLASS_CLOCK.x, CLASS_CLOCK.y, z0 + 0.015, Math.PI / 2, 20);
  b.box(0xd9b98c, 1.1, 0.8, 0.03, 2.75, 1.6, z1 - 0.02);
  for (const [px, py, w, h, c, r] of [
    [2.5, 1.75, 0.24, 0.3, 0xf2716b, 0.05],
    [2.85, 1.78, 0.3, 0.22, 0x3469c4, -0.06],
    [3.05, 1.45, 0.22, 0.26, 0xf9c74f, 0.08],
    [2.6, 1.4, 0.28, 0.2, 0x3fb6a0, -0.04],
  ] as const) {
    b.box(c, w, h, 0.01, px, py, z1 - 0.04, 0, 0, r);
  }
  // Windows along the left wall.
  for (const z of [-2.0, 0.2, 2.4]) windowOnSideWall(b, x0, 1, z, 1.7, 1.5, 1.4);
  // A door on the right wall near the front.
  b.block(0xb0835a, 0.05, 2.1, 0.95, x1 - 0.03, 0, -2.4);
  b.box(FRAME, 0.07, 2.18, 0.08, x1 - 0.03, 1.09, -2.92);
  b.box(FRAME, 0.07, 2.18, 0.08, x1 - 0.03, 1.09, -1.88);
  b.cylinder(METAL, 0.025, 0.06, x1 - 0.08, 1.0, -2.05, 0, 8);
  // The teacher's desk, with a few papers and a mug on it.
  desk(b, -0.2, -2.45, 1.4, 0.7, 0.76, 0.06, 0xb0835a);
  b.box(FRAME, 0.3, 0.008, 0.22, -0.5, 0.765, -2.4, 0.2);
  b.box(0xf6e3c0, 0.3, 0.008, 0.22, -0.46, 0.773, -2.43, -0.1);
  b.cylinder(0xf2716b, 0.04, 0.09, 0.25, 0.805, -2.5);
  chair(b, -0.25, -2.95, Math.PI + 0.25, 0x3469c4);
  // The player's desk under the book, at the real desk's height; no chair (they sit on their own).
  desk(b, 0, -0.03, 1.15, 0.66, deskTop - 0.003);
  // The desks beside the player, where the race's rivals sit; their own chairs come with them.
  const seats: Seat[] = [];
  for (const [x, role] of [
    [-1.35, 'left'],
    [1.35, 'right'],
  ] as const) {
    const ry = x < 0 ? 0.06 : -0.06;
    desk(b, x, -0.03, 1.0, 0.6, KID_DESK_TOP, ry);
    seats.push({ x, z: 0.4, ry, role });
  }
  // Classmates' desks in the rows ahead and behind, each a little off line,
  // chairs pushed in or out. Some have a classmate at work, never the desk
  // straight ahead of the player: its chair stays empty, so nobody sits between the player and the board.
  const chairColors = [0x3469c4, 0x3fb6a0, 0xf2716b, 0xf9c74f];
  let n = 0;
  for (const z of [-1.35, 1.4]) {
    for (const x of [-1.85, 0, 1.85]) {
      const ry = b.jitter(0.09);
      desk(b, x + b.jitter(0.08), z + b.jitter(0.06), 1.15, 0.6, KID_DESK_TOP, ry);
      if ((z < 0 && x !== 0) || (z > 0 && x > 0)) seats.push({ x: x + b.jitter(0.05), z: z + 0.43, ry, role: 'class' });
      else chair(b, x + b.jitter(0.15), z + 0.5 + Math.abs(b.jitter(0.14)), ry + b.jitter(0.25), chairColors[n % 4]);
      // Something left on some desks.
      if (n % 3 === 0) b.box(chairColors[(n + 1) % 4], 0.22, 0.02, 0.3, x - 0.25, 0.73, z, b.jitter(0.4));
      if (n % 4 === 1) b.box(FRAME, 0.21, 0.004, 0.29, x + 0.2, 0.722, z + 0.02, b.jitter(0.5));
      n += 1;
    }
  }
  // A school bag on the floor by the next desk.
  b.block(0xf2716b, 0.32, 0.36, 0.16, 0.75, 0, 0.95, 0.5);
  b.block(0xd9564f, 0.24, 0.14, 0.04, 0.75 + 0.07, 0.05, 0.95 + 0.1, 0.5);
  // A low shelf along the back wall with books.
  b.block(DESK_WOOD, 2.4, 0.9, 0.36, -1.6, 0, z1 - 0.2);
  b.box(0xc49f71, 2.36, 0.02, 0.34, -1.6, 0.46, z1 - 0.2);
  books(b, -2.7, 0.47, z1 - 0.2, 0.22, 14, [0x3469c4, 0xf2716b, 0x3fb6a0, 0xf9c74f, 0xb198ea]);
  books(b, -1.4, 0.9, z1 - 0.22, 0.2, 6, [0x3fb6a0, 0xb198ea, 0xf2716b]);
  // Ceiling lights.
  for (const x of [-1.5, 1.5]) for (const z of [-1.8, 0.4, 2.6]) b.box(0xfffdf6, 1.2, 0.05, 0.3, x, height - 0.03, z);
  const group = b.build('room-classroom');
  group.userData.seats = seats;
  return group;
}

/**
 * A child's bedroom about 3.8 x 4 m: the desk under a window ahead, the
 * bed along the left wall behind the player, a wardrobe on the right.
 */
function bedroom(deskTop: number): Group {
  const b = new Builder(11);
  const x0 = -1.9;
  const x1 = 1.9;
  const z0 = -0.62;
  const z1 = 3.4;
  const height = 2.7;
  shell(b, x0, x1, z0, z1, height, GROUT);
  tiledFloor(b, x0, x1, z0, z1);
  // The study desk under the book, against the front wall, with a window above:
  // a darker wood, so it stands out from the light floor.
  desk(b, 0, -0.18, 1.2, 0.8, deskTop - 0.003, 0, DARK_WOOD);
  windowOnFrontWall(b, z0, 0, deskTop + 0.85, 1.3, 1.0);
  // Curtains hang to the sides in soft folds, dark so the window does not dazzle.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const x = side * (0.78 + i * 0.07);
      b.box(i % 2 ? 0x34496b : 0x3d5a80, 0.07, 1.5, 0.03, x, deskTop + 0.75, z0 + 0.06 + (i % 2) * 0.025, 0, 0, b.jitter(0.02));
    }
  }
  b.box(FRAME, 1.9, 0.03, 0.03, 0, deskTop + 1.52, z0 + 0.06);
  // A poster either side of the window for the two rivals (bedroom-life.ts
  // puts a robot in each): a coloured sheet, a cream one on it, a pale panel
  // the robot stands in, and a strip under it for its name. High enough that
  // QUIT and the race card on the desk stand below them in the seated view.
  const posters: Poster[] = [];
  const py = deskTop + 1.0;
  for (const [i, side] of [-1, 1].entries()) {
    const x = side * POSTER_X;
    const tilt = side * 0.012;
    b.box(POSTER_COLORS[i], POSTER_W, POSTER_H, 0.008, x, py, z0 + 0.01, 0, 0, tilt);
    b.box(FRAME, POSTER_W - 0.04, POSTER_H - 0.04, 0.006, x, py, z0 + 0.017, 0, 0, tilt);
    b.box(POSTER_TINTS[i], POSTER_W - 0.08, POSTER_H * 0.62, 0.004, x, py + POSTER_H * 0.1, z0 + 0.021, 0, 0, tilt);
    b.box(POSTER_COLORS[i], POSTER_W - 0.08, 0.012, 0.004, x, py - POSTER_H * 0.21, z0 + 0.022, 0, 0, tilt);
    posters.push({ x, y: py, z: z0 + 0.024, w: POSTER_W, h: POSTER_H, desk: i + 1 });
  }
  // A shelf above the right poster with books and a jar of pencils.
  const shelfY = py + POSTER_H / 2 + 0.12;
  b.box(DESK_WOOD, 0.7, 0.025, 0.22, POSTER_X, shelfY, z0 + 0.11);
  books(b, 1.0, shelfY + 0.013, z0 + 0.11, 0.16, 8, [0xf2716b, 0x3469c4, 0x3fb6a0, 0xb198ea]);
  b.cylinder(0x3fb6a0, 0.035, 0.09, 1.52, shelfY + 0.06, z0 + 0.1);
  // The bed along the left wall behind the player: frame, mattress, blanket and pillow.
  const bx = x0 + 0.5;
  b.block(DESK_WOOD, 0.98, 0.3, 2.0, bx, 0, 2.15);
  b.block(0xfffaf0, 0.92, 0.18, 1.94, bx, 0.3, 2.15);
  b.box(0x3fb6a0, 0.96, 0.04, 1.3, bx + 0.01, 0.5, 2.5, 0, 0.02, b.jitter(0.03));
  b.box(0x3fb6a0, 0.04, 0.3, 1.3, bx + 0.48, 0.36, 2.5);
  b.box(0x34a08c, 0.9, 0.06, 0.3, bx + 0.02, 0.535, 1.85, 0.05, 0.1, 0);
  b.box(FRAME, 0.62, 0.12, 0.36, bx, 0.55, 3.0, 0.08, 0.2, 0);
  b.block(DESK_WOOD, 1.0, 0.85, 0.05, bx, 0, 3.17);
  // A rug and a floor lamp.
  b.box(0xb198ea, 1.5, 0.008, 1.0, 0.5, 0.004, 1.5, 0.12);
  b.box(0xc6b2f0, 1.2, 0.009, 0.7, 0.5, 0.005, 1.5, 0.12);
  b.cylinder(METAL, 0.15, 0.03, x1 - 0.35, 0.015, 0.6);
  b.cylinder(METAL, 0.015, 1.45, x1 - 0.35, 0.74, 0.6, 0, 8);
  b.cylinder(0xfff1d0, 0.17, 0.24, x1 - 0.35, 1.55, 0.6, 0, 14);
  // A wardrobe on the right wall, its doors a hair apart.
  b.block(0xe6cfa6, 0.6, 2.0, 1.1, x1 - 0.3, 0, 2.4);
  b.box(0xd9bf93, 0.01, 1.9, 0.004, x1 - 0.6, 1.0, 2.4);
  b.cylinder(METAL, 0.012, 0.12, x1 - 0.61, 1.05, 2.32, 0, 8);
  b.cylinder(METAL, 0.012, 0.12, x1 - 0.61, 1.05, 2.48, 0, 8);
  // A ball on the floor and a backpack against the bed.
  b.box(0xf2716b, 0.2, 0.2, 0.2, 0.9, 0.1, 2.9, 0.6, 0.6, 0);
  b.block(0x3469c4, 0.3, 0.38, 0.15, bx + 0.6, 0, 1.2, -0.4);
  // A ceiling lamp.
  b.cylinder(0xfffdf6, 0.25, 0.06, 0, height - 0.05, 1.4, 0, 20);
  const group = b.build('room-bedroom');
  group.userData.posters = posters;
  return group;
}

export function buildRoom(room: VirtualRoom, deskTop: number): Group {
  return room === 'classroom' ? classroom(deskTop) : bedroom(deskTop);
}
