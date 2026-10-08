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
  /** The rivals' seats ahead left and right of the player, or a classmate's. */
  role: 'left' | 'right' | 'class';
  /** The top of the seat's desk; the classmate (or the rival's robot) is lifted to it. */
  top: number;
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

/** The desk top the paper classmates are drawn for; the classroom lifts them to its own desks. */
export const KID_DESK_TOP = 0.72;
/**
 * The classroom's side columns of desks, close to the walls, so the aisles
 * either side of the middle column (the player's) are wide.
 */
const CLASS_COLUMN_X = 2.75;
/**
 * How much lower than the player's the other desks are: a little beside and
 * behind, more ahead, so the desks ahead do not stand up into the view of the board.
 */
const CLASS_DESK_DROP = 0.08;
const CLASS_FRONT_DESK_DROP = 0.2;
/** The classroom's front wall, its chalkboard (centre and size) and its clock. */
export const CLASS_FRONT_Z = -3.4;
export const CLASS_BOARD = { x: 0, y: 1.55, w: 3.28, h: 1.2 };
/** Centred over the board. */
export const CLASS_CLOCK = { x: 0, y: 2.5, r: 0.17 };
/**
 * A whiteboard either side of the board: the race's standings on the left,
 * its rounds on the right (classroom-life.ts writes them).
 */
export const CLASS_WHITEBOARDS = [
  { x: -2.6, y: 1.55, w: 1.5, h: 1.5 },
  { x: 2.6, y: 1.55, w: 1.5, h: 1.5 },
];

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

  /**
   * Everything added so far as one group of (at most) two meshes. `shade`,
   * when given, scales each vertex's colour by the light at its position.
   */
  build(name: string, shade?: Shade): Group {
    const group = new Group();
    group.name = name;
    const paper = merge(this.paper, this.colors, shade);
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

/** Light baked into the vertex colours: a factor for the colour at x, y, z (1 leaves it be). */
type Shade = (x: number, y: number, z: number) => number;

/** One geometry from many, each coloured `colors[i]` when colours are given. */
function merge(list: BufferGeometry[], colors?: number[], shade?: Shade): BufferGeometry | undefined {
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
        const f = shade ? shade(pos[k], pos[k + 1], pos[k + 2]) : 1;
        col[k] = c.r * f;
        col[k + 1] = c.g * f;
        col[k + 2] = c.b * f;
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

/** Floor tiles over the grout, every other one a shade warmer. */
function tiledFloor(
  b: Builder,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  tile = 0.4,
  colors: readonly [number, number] = [0xf8f6f1, 0xf1eee7],
): void {
  for (let x = x0; x < x1 - 0.01; x += tile) {
    for (let z = z0; z < z1 - 0.01; z += tile) {
      const w = Math.min(tile, x1 - x) - 0.008;
      const d = Math.min(tile, z1 - z) - 0.008;
      const odd = (Math.round((x - x0) / tile) + Math.round((z - z0) / tile)) % 2;
      b.box(colors[odd], w, 0.004, d, x + w / 2 + 0.004, 0, z + d / 2 + 0.004);
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

/** A footprint on the classroom's floor that casts a soft shadow around it. */
interface Footprint {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** The classroom's paper colours: warm tiles, sage panelling, a warmer desk wood and dark steel. */
const CLASS_TILES = [0xf6f1e7, 0xede6d8] as const;
const CLASS_GROUT = 0xcdc4b3;
const PANEL = 0xa9cfc0;
const PANEL_STILE = 0x97c0b0;
const RAIL = 0xfff1d6;
const SKIRTING = DARK_WOOD;
const PANEL_H = 0.75;
/** A shade of the wall behind what hangs on it, offset down and right, so it stands off the wall. */
const WALL_SHADE = 0xcab26f;
const CLASS_WOOD = 0xd2a06a;
const CLASS_WOOD_EDGE = 0xae7b4c;
const STEEL = 0x50565f;
const BOARD_WOOD = 0xa87a4f;
const CURTAIN = [0xf4c7a1, 0xedb98f] as const;
const LEAF = [0x5fae7a, 0x4e9a69] as const;
const BUNTING = [0xf2716b, 0xf9c74f, 0x3fb6a0, 0x3469c4, 0xb198ea];

/**
 * Light baked into the classroom's vertex colours, so it costs nothing to
 * draw: soft shadows on the floor around the furniture and along the walls,
 * patches of sun on the floor under the windows, everything a little darker
 * near the floor and the ceiling a little darker than its lights.
 */
function classroomLight(
  prints: Footprint[],
  sun: Footprint[],
  room: { x0: number; x1: number; z0: number; z1: number; height: number },
): (x: number, y: number, z: number) => number {
  const outside = (r: Footprint, x: number, z: number) =>
    Math.hypot(Math.max(0, Math.abs(x - r.x) - r.w / 2), Math.max(0, Math.abs(z - r.z) - r.d / 2));
  return (x, y, z) => {
    if (y > room.height - 0.02) return 0.97;
    if (y > 0.01) return 0.86 + 0.14 * Math.min(1, y / 1.0);
    let f = 1;
    for (const r of prints) f *= 1 - 0.22 * Math.max(0, 1 - outside(r, x, z) / 0.3);
    const wall = Math.min(x - room.x0, room.x1 - x, z - room.z0, room.z1 - z);
    f *= 1 - 0.14 * Math.max(0, 1 - wall / 0.6);
    for (const r of sun) f *= 1 + 0.09 * Math.max(0, 1 - outside(r, x, z) / 0.25);
    return f;
  };
}

/**
 * A school desk with its top at `top`: a wooden top over a darker edge, a
 * book tray under it, and a dark steel frame with rails low on the sides.
 */
function classDesk(b: Builder, prints: Footprint[], x: number, z: number, w: number, d: number, top: number): void {
  b.box(CLASS_WOOD, w, 0.03, d, x, top - 0.015, z);
  b.box(CLASS_WOOD_EDGE, w - 0.02, 0.012, d - 0.02, x, top - 0.036, z);
  b.box(STEEL, w - 0.1, 0.012, d - 0.16, x, top - 0.14, z - 0.04);
  b.box(STEEL, w - 0.1, 0.06, 0.012, x, top - 0.11, z - d / 2 + 0.12);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.block(STEEL, 0.03, top - 0.042, 0.03, x + sx * (w / 2 - 0.05), 0, z + sz * (d / 2 - 0.05));
    b.box(STEEL, 0.02, 0.02, d - 0.1, x + sx * (w / 2 - 0.05), 0.12, z);
  }
  prints.push({ x, z, w: w + 0.04, d: d + 0.04 });
}

/** Wainscot along a wall from a to b (along X when `alongX`), at the wall's line `at`, `inward` into the room. */
function panelling(b: Builder, alongX: boolean, a: number, c: number, at: number, inward: 1 | -1, skip?: [number, number]): void {
  const len = c - a;
  const mid = (a + c) / 2;
  const put = (color: number, l: number, h: number, depth: number, along: number, y: number) => {
    const off = at + inward * (depth / 2);
    if (alongX) b.box(color, l, h, depth, along, y, off);
    else b.box(color, depth, h, l, off, y, along);
  };
  put(PANEL, len, PANEL_H, 0.02, mid, PANEL_H / 2);
  put(RAIL, len, 0.045, 0.035, mid, PANEL_H);
  put(SKIRTING, len, 0.1, 0.028, mid, 0.05);
  for (let s = a + 0.5; s < c - 0.3; s += 0.7) {
    if (skip && s > skip[0] && s < skip[1]) continue;
    put(PANEL_STILE, 0.03, PANEL_H - 0.2, 0.032, s, PANEL_H / 2 + 0.03);
  }
}

/** A pot plant on the floor, leaves fanned out round it. */
function plant(b: Builder, prints: Footprint[], x: number, z: number, h: number): void {
  b.cylinder(0xd9825b, 0.16, 0.3, x, 0.15, z, 0, 10);
  b.cylinder(0xc9714b, 0.18, 0.05, x, 0.31, z, 0, 10);
  b.cylinder(0x6b4a33, 0.15, 0.01, x, 0.335, z, 0, 10);
  for (let i = 0; i < 9; i += 1) {
    const a = i * 2.4 + b.jitter(0.3);
    const lh = h * (0.7 + Math.abs(b.jitter(0.3)));
    b.box(LEAF[i % 2], 0.1, lh, 0.012, x + Math.sin(a) * 0.07, 0.33 + lh / 2, z + Math.cos(a) * 0.07, a, 0.35 + Math.abs(b.jitter(0.2)));
  }
  prints.push({ x, z, w: 0.34, d: 0.34 });
}

/** Paper flags on a string between x = a and x = c on the front wall, sagging in the middle. */
function bunting(b: Builder, a: number, c: number, y: number, z: number, sag: number): void {
  const n = Math.round((c - a) / 0.24);
  const at = (t: number) => y - sag * 4 * t * (1 - t);
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const xa = a + (c - a) * t0;
    const xb = a + (c - a) * t1;
    const ya = at(t0);
    const yb = at(t1);
    b.box(FRAME, Math.hypot(xb - xa, yb - ya), 0.006, 0.006, (xa + xb) / 2, (ya + yb) / 2, z, 0, 0, Math.atan2(yb - ya, xb - xa));
    const tm = (t0 + t1) / 2;
    b.cylinder(BUNTING[i % BUNTING.length], 0.075, 0.004, a + (c - a) * tm, at(tm) - 0.037, z + 0.004, Math.PI / 2, 3);
  }
}

/** Curtains either side of a window on the left wall, folded in three, on a rod. */
function curtains(b: Builder, wallX: number, z: number, w: number, top: number, bottom: number): void {
  const h = top - bottom;
  b.cylinder(SKIRTING, 0.015, w + 0.8, wallX + 0.12, top + 0.04, z, Math.PI / 2, 8);
  for (const side of [-1, 1]) {
    const cz = z + side * (w / 2 + 0.1);
    for (let k = 0; k < 3; k += 1) {
      b.box(CURTAIN[k % 2], 0.03, h, 0.11, wallX + 0.1 + (k % 2) * 0.025, bottom + h / 2, cz + (k - 1) * 0.09);
    }
  }
}

/**
 * A classroom about 7 x 8 m: the player at a desk in the second row, a
 * chalkboard ahead with a whiteboard either side, windows on the left, other
 * desks and chairs around. Everything stands square to the walls and
 * centred on the player, so nothing reads as crooked. Paper still, with
 * depth: panelled lower walls, boards that stand off the wall, curtains,
 * plants and bunting, and soft light baked into the colours.
 */
function classroom(deskTop: number): Group {
  const b = new Builder(7);
  const x0 = -3.5;
  const x1 = 3.5;
  const z0 = CLASS_FRONT_Z;
  const z1 = 4.4;
  const height = 3.0;
  const prints: Footprint[] = [];
  shell(b, x0, x1, z0, z1, height, CLASS_GROUT);
  tiledFloor(b, x0, x1, z0, z1, 0.3, CLASS_TILES);
  // Panelling round the lower walls; the door's stretch keeps no stiles.
  panelling(b, true, x0, x1, z0, 1);
  panelling(b, true, x0, x1, z1, -1);
  panelling(b, false, z0, z1, x0, 1);
  panelling(b, false, z0, z1, x1, -1, [-3.0, -1.8]);
  // Chalkboard ahead, left blank: a wooden frame and a chalk ledge, its shade on the wall.
  b.box(WALL_SHADE, CLASS_BOARD.w + 0.14, CLASS_BOARD.h + 0.14, 0.004, CLASS_BOARD.x + 0.03, CLASS_BOARD.y - 0.04, z0 + 0.002);
  b.box(BOARD_WOOD, CLASS_BOARD.w + 0.12, CLASS_BOARD.h + 0.12, 0.04, CLASS_BOARD.x, CLASS_BOARD.y, z0 + 0.02);
  b.box(0x3f6b57, CLASS_BOARD.w, CLASS_BOARD.h, 0.03, CLASS_BOARD.x, CLASS_BOARD.y, z0 + 0.045);
  b.box(BOARD_WOOD, 3.3, 0.04, 0.09, CLASS_BOARD.x, 0.93, z0 + 0.07);
  b.box(FRAME, 0.08, 0.012, 0.012, -0.8, 0.957, z0 + 0.08, 0.3);
  b.box(0xf9c74f, 0.07, 0.012, 0.012, -0.65, 0.957, z0 + 0.08, -0.2);
  b.box(0x3a3f4b, 0.12, 0.03, 0.05, 0.9, 0.965, z0 + 0.08);
  b.box(0xfdfdfb, 0.12, 0.012, 0.05, 0.9, 0.986, z0 + 0.08);
  // The whiteboards: a grey aluminium frame, a white face and a marker tray with markers.
  for (const wb of CLASS_WHITEBOARDS) {
    b.box(WALL_SHADE, wb.w + 0.08, wb.h + 0.08, 0.004, wb.x + 0.03, wb.y - 0.04, z0 + 0.002);
    b.box(0xc3c7cd, wb.w + 0.06, wb.h + 0.06, 0.03, wb.x, wb.y, z0 + 0.015);
    b.box(0xfdfdfb, wb.w, wb.h, 0.02, wb.x, wb.y, z0 + 0.035);
    b.box(0xc3c7cd, wb.w * 0.6, 0.025, 0.06, wb.x, wb.y - wb.h / 2 - 0.03, z0 + 0.05);
    for (const [k, c] of [0x3469c4, 0xf2716b, 0x3a3f4b].entries()) {
      b.cylinder(c, 0.009, 0.12, wb.x - 0.2 + k * 0.08, wb.y - wb.h / 2 - 0.008, z0 + 0.055, 0, 6, Math.PI / 2);
    }
  }
  // Paper bunting across the top of the front wall, either side of the clock.
  bunting(b, x0 + 0.2, -0.3, 2.9, z0 + 0.04, 0.14);
  bunting(b, 0.3, x1 - 0.2, 2.9, z0 + 0.04, 0.14);
  // A round clock without numbers over the board, and a board of paper shapes on the back wall.
  // (The classroom life adds its hands and the race's time on its face.)
  b.cylinder(WALL_SHADE, CLASS_CLOCK.r + 0.02, 0.004, CLASS_CLOCK.x + 0.025, CLASS_CLOCK.y - 0.03, z0 + 0.002, Math.PI / 2, 20);
  b.cylinder(FRAME, CLASS_CLOCK.r, 0.04, CLASS_CLOCK.x, CLASS_CLOCK.y, z0 + 0.02, Math.PI / 2, 20);
  b.cylinder(0x3a3f4b, CLASS_CLOCK.r + 0.015, 0.035, CLASS_CLOCK.x, CLASS_CLOCK.y, z0 + 0.015, Math.PI / 2, 20);
  b.box(WALL_SHADE, 1.12, 0.82, 0.004, 2.72, 1.56, z1 - 0.002);
  b.box(0xd9b98c, 1.1, 0.8, 0.03, 2.75, 1.6, z1 - 0.02);
  for (const [px, py, w, h, c, r] of [
    [2.5, 1.75, 0.24, 0.3, 0xf2716b, 0.05],
    [2.85, 1.78, 0.3, 0.22, 0x3469c4, -0.06],
    [3.05, 1.45, 0.22, 0.26, 0xf9c74f, 0.08],
    [2.6, 1.4, 0.28, 0.2, 0x3fb6a0, -0.04],
  ] as const) {
    b.box(c, w, h, 0.01, px, py, z1 - 0.04, 0, 0, r);
  }
  // Windows along the left wall, with curtains; the sun falls in patches on the floor.
  const sun: Footprint[] = [];
  for (const z of [-2.0, 0.2, 2.4]) {
    windowOnSideWall(b, x0, 1, z, 1.7, 1.5, 1.4);
    curtains(b, x0, z, 1.5, 2.6, 0.85);
    sun.push({ x: x0 + 0.85, z: z + 0.35, w: 0.9, d: 1.1 });
  }
  // A door on the right wall near the front.
  b.block(0xb0835a, 0.05, 2.1, 0.95, x1 - 0.03, 0, -2.4);
  b.box(FRAME, 0.07, 2.18, 0.08, x1 - 0.03, 1.09, -2.92);
  b.box(FRAME, 0.07, 2.18, 0.08, x1 - 0.03, 1.09, -1.88);
  b.box(FRAME, 0.07, 0.08, 1.12, x1 - 0.03, 2.16, -2.4);
  b.cylinder(METAL, 0.025, 0.06, x1 - 0.08, 1.0, -2.05, 0, 8);
  // The teacher's desk: a modesty panel to the class, a drawer pedestal, a few papers and a mug.
  const tx = -0.9;
  const tz = -2.45;
  b.box(BOARD_WOOD, 1.4, 0.035, 0.7, tx, 0.76 - 0.0175, tz);
  b.box(CLASS_WOOD_EDGE, 1.36, 0.5, 0.025, tx, 0.47, tz + 0.32);
  b.block(CLASS_WOOD_EDGE, 0.42, 0.72, 0.64, tx + 0.47, 0, tz);
  for (const sx of [-1, 1]) b.block(STEEL, 0.035, 0.725, 0.035, tx - 0.65, 0, tz + sx * 0.3);
  prints.push({ x: tx, z: tz, w: 1.44, d: 0.74 });
  b.box(FRAME, 0.3, 0.008, 0.22, -1.2, 0.765, -2.4, 0.2);
  b.box(0xf6e3c0, 0.3, 0.008, 0.22, -1.16, 0.773, -2.43, -0.1);
  b.cylinder(0xf2716b, 0.04, 0.09, -0.45, 0.805, -2.5);
  chair(b, -0.9, -2.95, Math.PI, 0x3469c4);
  prints.push({ x: -0.9, z: -2.95, w: 0.42, d: 0.4 });
  // The player's desk under the book, at the real desk's height; no chair (they sit on their own).
  // As big as the bedroom's, so the book and the cards on it lie inside the desk, not over its far edge.
  classDesk(b, prints, 0, -0.18, 1.2, 0.8, deskTop - 0.003);
  // Three rows of three desks, a little lower than the player's, the row
  // ahead lower still. Beside the player, a classmate at work at each desk;
  // their own chairs come with them.
  const side = Math.max(KID_DESK_TOP, deskTop - CLASS_DESK_DROP);
  const seats: Seat[] = [];
  for (const x of [-CLASS_COLUMN_X, CLASS_COLUMN_X]) {
    classDesk(b, prints, x, -0.03, 1.0, 0.6, side);
    seats.push({ x, z: 0.4, ry: 0, role: 'class', top: side });
    prints.push({ x, z: 0.42, w: 0.42, d: 0.4 });
  }
  // The rows ahead and behind, in straight lines, chairs pushed in. The race's
  // rivals sit at the desks ahead left and right. Nobody sits at the desk
  // straight ahead: its chair stays empty, so the board is in clear view.
  const chairColors = [0x3469c4, 0x3fb6a0, 0xf2716b, 0xf9c74f];
  let n = 0;
  for (const z of [-1.35, 1.4]) {
    const top = z < 0 ? Math.max(KID_DESK_TOP - 0.06, deskTop - CLASS_FRONT_DESK_DROP) : side;
    for (const x of [-CLASS_COLUMN_X, 0, CLASS_COLUMN_X]) {
      const rival = z < 0 && x !== 0;
      classDesk(b, prints, x, z, x === 0 ? 1.15 : 1.0, 0.6, top);
      if (rival) seats.push({ x, z: z + 0.43, ry: 0, role: x < 0 ? 'left' : 'right', top });
      else if (z > 0 && x > 0) seats.push({ x, z: z + 0.43, ry: 0, role: 'class', top });
      else chair(b, x, z + 0.45, 0, chairColors[n % 4]);
      prints.push({ x, z: z + 0.45, w: 0.42, d: 0.4 });
      // A book or a sheet left on the desks nobody races at (the rivals' stay clear for their robots).
      if (!rival && n % 3 === 0) b.box(chairColors[(n + 1) % 4], 0.22, 0.02, 0.3, x - 0.25, top + 0.01, z, 0.15);
      if (!rival && n % 4 === 1) b.box(FRAME, 0.21, 0.004, 0.29, x + 0.2, top + 0.002, z + 0.02, -0.1);
      n += 1;
    }
  }
  // A school bag on the floor by the next desk.
  b.block(0xf2716b, 0.32, 0.36, 0.16, 2.0, 0, 0.95, 0.5);
  b.block(0xd9564f, 0.24, 0.14, 0.04, 2.0 + 0.07, 0.05, 0.95 + 0.1, 0.5);
  prints.push({ x: 2.0, z: 0.95, w: 0.3, d: 0.25 });
  // A low shelf along the back wall with books, and a plant in each back corner.
  b.block(DESK_WOOD, 2.4, 0.9, 0.36, -1.6, 0, z1 - 0.2);
  b.box(0xc49f71, 2.36, 0.02, 0.34, -1.6, 0.46, z1 - 0.2);
  books(b, -2.7, 0.47, z1 - 0.2, 0.22, 14, [0x3469c4, 0xf2716b, 0x3fb6a0, 0xf9c74f, 0xb198ea]);
  books(b, -1.4, 0.9, z1 - 0.22, 0.2, 6, [0x3fb6a0, 0xb198ea, 0xf2716b]);
  prints.push({ x: -1.6, z: z1 - 0.2, w: 2.4, d: 0.36 });
  plant(b, prints, -3.15, z1 - 0.35, 0.55);
  plant(b, prints, x1 - 0.35, z1 - 0.35, 0.65);
  // Ceiling lights, each in a frame.
  for (const x of [-1.5, 1.5]) {
    for (const z of [-1.8, 0.4, 2.6]) {
      b.box(0xd9d2c4, 1.28, 0.03, 0.38, x, height - 0.015, z);
      b.box(0xfffdf6, 1.2, 0.05, 0.3, x, height - 0.03, z);
    }
  }
  const group = b.build('room-classroom', classroomLight(prints, sun, { x0, x1, z0, z1, height }));
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
