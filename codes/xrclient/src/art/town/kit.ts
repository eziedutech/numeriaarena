import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import { shade, tint } from '../palette.js';

/**
 * The folding kit every Fold Town piece is cut with. A piece is built in
 * tiles: x along the page, y up, z towards the reader, from the corner of
 * its footprint at (0, 0, 0). Every facet is flat and baked light or dark
 * from one light, as the folded animals are, so one material serves the
 * whole town.
 */

export type V3 = [number, number, number];

/** Colours of the town, as the MY FOLD TOWN sticker draws it. */
export const TOWN = {
  grass: 0x9fd486,
  grass2: 0x8cc874,
  road: 0x5d6270,
  line: 0xf4f1e8,
  walk: 0xe9e2d0,
  water: 0x7cc6e8,
  sand: 0xf0dca0,
  hill: 0xa9c77a,
  rock: 0xb3a07a,
  trunk: 0x9a6b45,
  leaf: 0x5db85b,
  leaf2: 0x3f9a5a,
  pane: 0xfff8ec,
  glass: 0x3469c4,
  cobalt: 0x3469c4,
  violet: 0xb198ea,
  coral: 0xf2716b,
  teal: 0x3fb6a0,
  sun: 0xe8b64c,
  sunflower: 0xf9c74f,
  cream: 0xf3e6c9,
  paper: 0xfff8ec,
  ink: 0x3a3f4b,
};

/** Walls a house may be folded from, picked by its seed. */
export const WALLS = [TOWN.cream, TOWN.coral, TOWN.sun, TOWN.teal, TOWN.violet, TOWN.cobalt];

const LIGHT = new Vector3(-0.4, 0.7, 0.6).normalize();

/** Tone of a fold facing `n`: between a darker and a lighter shade of `color`. */
function toneFor(n: Vector3, color: number): Color {
  const lit = Math.min(1, Math.max(0, (n.dot(LIGHT) * 0.5 + 0.5 - 0.35) / 0.55));
  const k = lit * lit * (3 - 2 * lit);
  return new Color(shade(shade(color))).lerp(new Color(tint(color, 0.35)), k);
}

let townPaper: MeshStandardMaterial | undefined;

/** One material for the whole town; the tones live in the vertex colours. */
export function townMaterial(): MeshStandardMaterial {
  townPaper ??= new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    side: DoubleSide,
  });
  return townPaper;
}

/** A small steady random from a seed, for variation that stays the same each visit. */
export function rand(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

/** A seed from a building's id. */
export function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

const va = new Vector3();
const vb = new Vector3();
const vc = new Vector3();
const vn = new Vector3();
const vi = new Vector3();

export class Kit {
  private readonly pos: number[] = [];
  private readonly col: number[] = [];

  get triangles(): number {
    return this.pos.length / 9;
  }

  /**
   * One facet. `inside` is a point behind it (inside the solid, or below a
   * flat piece), so the facet faces away from it whatever the corner order.
   */
  tri(a: V3, b: V3, c: V3, color: number, inside: V3): this {
    va.set(...a);
    vb.set(...b);
    vc.set(...c);
    vn.copy(vb).sub(va).cross(vi.copy(vc).sub(va)).normalize();
    vi.set(...inside).sub(va);
    let order = [a, b, c];
    if (vn.dot(vi) > 0) {
      vn.negate();
      order = [a, c, b];
    }
    const t = toneFor(vn, color);
    for (const v of order) {
      this.pos.push(v[0], v[1], v[2]);
      this.col.push(t.r, t.g, t.b);
    }
    return this;
  }

  quad(a: V3, b: V3, c: V3, d: V3, color: number, inside: V3): this {
    return this.tri(a, b, c, color, inside).tri(a, c, d, color, inside);
  }

  /** A flat piece lying on (or just above) the ground. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, color: number): this {
    const under: V3 = [(x0 + x1) / 2, y - 1, (z0 + z1) / 2];
    return this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color, under);
  }

  /** A block with no bottom; `top: false` leaves the top open for a roof. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, top = true): this {
    const m: V3 = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, m);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color, m);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, m);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color, m);
    if (top) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], color, m);
    return this;
  }

  /**
   * A pitched roof over x0..x1 by z0..z1 from height y, its ridge `rise`
   * above, running along x (or z with `alongZ`), with a small overhang.
   */
  gable(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, color: number, ends: number, alongZ = false, over = 0.06): this {
    const m: V3 = [(x0 + x1) / 2, y + rise / 3, (z0 + z1) / 2];
    const top = y + rise;
    if (!alongZ) {
      const zm = (z0 + z1) / 2;
      const [a0, a1] = [x0 - over, x1 + over];
      this.quad([a0, y, z1 + over], [a1, y, z1 + over], [a1, top, zm], [a0, top, zm], color, m);
      this.quad([a0, y, z0 - over], [a1, y, z0 - over], [a1, top, zm], [a0, top, zm], color, m);
      this.tri([x0, y, z0], [x0, y, z1], [x0, top, zm], ends, m);
      this.tri([x1, y, z0], [x1, y, z1], [x1, top, zm], ends, m);
    } else {
      const xm = (x0 + x1) / 2;
      const [b0, b1] = [z0 - over, z1 + over];
      this.quad([x1 + over, y, b0], [x1 + over, y, b1], [xm, top, b1], [xm, top, b0], color, m);
      this.quad([x0 - over, y, b0], [x0 - over, y, b1], [xm, top, b1], [xm, top, b0], color, m);
      this.tri([x0, y, z1], [x1, y, z1], [xm, top, z1], ends, m);
      this.tri([x0, y, z0], [x1, y, z0], [xm, top, z0], ends, m);
    }
    return this;
  }

  /** A four-sided point over a rectangle. */
  pyramid(x0: number, z0: number, x1: number, z1: number, y: number, rise: number, color: number): this {
    const p: V3 = [(x0 + x1) / 2, y + rise, (z0 + z1) / 2];
    const m: V3 = [p[0], y + rise / 4, p[2]];
    this.tri([x0, y, z1], [x1, y, z1], p, color, m);
    this.tri([x1, y, z1], [x1, y, z0], p, color, m);
    this.tri([x1, y, z0], [x0, y, z0], p, color, m);
    this.tri([x0, y, z0], [x0, y, z1], p, color, m);
    return this;
  }

  private ring(cx: number, cz: number, r: number, y: number, sides: number, turn: number): V3[] {
    return Array.from({ length: sides }, (_, i) => {
      const a = turn + (i / sides) * Math.PI * 2;
      return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r] as V3;
    });
  }

  /** An upright prism of `sides` faces, closed on top; `r1` narrows or widens the top. */
  prism(cx: number, cz: number, r: number, y0: number, y1: number, sides: number, color: number, r1 = r, turn = 0): this {
    const lo = this.ring(cx, cz, r, y0, sides, turn);
    const hi = this.ring(cx, cz, r1, y1, sides, turn);
    const m: V3 = [cx, (y0 + y1) / 2, cz];
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      this.quad(lo[i], lo[j], hi[j], hi[i], color, m);
    }
    for (let i = 1; i < sides - 1; i++) this.tri(hi[0], hi[i], hi[i + 1], color, [cx, y1 - 1, cz]);
    return this;
  }

  /** A cone of `sides` faces to a point. */
  cone(cx: number, cz: number, r: number, y0: number, y1: number, sides: number, color: number, turn = 0): this {
    const lo = this.ring(cx, cz, r, y0, sides, turn);
    const p: V3 = [cx, y1, cz];
    const m: V3 = [cx, y0 + (y1 - y0) / 4, cz];
    for (let i = 0; i < sides; i++) this.tri(lo[i], lo[(i + 1) % sides], p, color, m);
    return this;
  }

  /** An eight-faced crown, as a round tree folds it. */
  crown(cx: number, cy: number, cz: number, r: number, h: number, color: number, turn = 0): this {
    const mid = this.ring(cx, cz, r, cy, 4, turn);
    const up: V3 = [cx, cy + h, cz];
    const down: V3 = [cx, cy - h * 0.7, cz];
    const m: V3 = [cx, cy, cz];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.tri(mid[i], mid[j], up, color, m);
      this.tri(mid[i], mid[j], down, color, m);
    }
    return this;
  }

  /**
   * Windows on the front (z = `z`), `rows` x `cols` of them across x0..x1
   * and up y0..y1, each a pane laid just proud of the wall.
   */
  windows(x0: number, x1: number, y0: number, y1: number, z: number, rows: number, cols: number, color: number): this {
    if (rows <= 0 || cols <= 0) return this;
    const cw = (x1 - x0) / cols;
    const rh = (y1 - y0) / rows;
    const pw = cw * 0.52;
    const ph = rh * 0.5;
    const zf = z + 0.012;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = x0 + c * cw + (cw - pw) / 2;
        const py = y0 + r * rh + (rh - ph) / 2;
        this.quad([px, py, zf], [px + pw, py, zf], [px + pw, py + ph, zf], [px, py + ph, zf], color, [px, py, z - 1]);
      }
    }
    return this;
  }

  /** A door on the front, centred on `cx`. */
  door(cx: number, z: number, w: number, h: number, color: number): this {
    const zf = z + 0.012;
    return this.quad([cx - w / 2, 0, zf], [cx + w / 2, 0, zf], [cx + w / 2, h, zf], [cx - w / 2, h, zf], color, [cx, h / 2, z - 1]);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingBox();
    return g;
  }
}
