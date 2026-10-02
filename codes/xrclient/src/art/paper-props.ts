import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { ACCENTS, GOLD, PAPER, TRY_AGAIN, paper, shade, tint } from './palette.js';

/**
 * Flat paper props: stars, badges, the Done card, the rival windows and the
 * orb. Cut from flat sheets, no rims or bevels, each with a soft warm shadow
 * down and to the right like the paper cards.
 */

/** Lit from the upper left and the front, as the folded animals and crystals are. */
const LIGHT = new Vector3(-0.4, 0.7, 0.6).normalize();
const SHADOW_RGBA = 'rgba(70, 50, 25, 0.32)';
const SHADOW_PX_PER_M = 2400;

let facetPaper: MeshStandardMaterial | undefined;

/** One material for every folded prop; the tones live in the vertex colours. */
function facets(): MeshStandardMaterial {
  facetPaper ??= new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    side: DoubleSide,
  });
  return facetPaper;
}

/** Tone of a fold facing `n`: between a darker and a lighter shade of `color`. */
function toneFor(n: Vector3, color: number): Color {
  const lit = Math.min(1, Math.max(0, (n.dot(LIGHT) * 0.5 + 0.5 - 0.35) / 0.55));
  const k = lit * lit * (3 - 2 * lit);
  return new Color(shade(shade(color))).lerp(new Color(tint(color, 0.35)), k);
}

/** A mesh from triangles, each facet baked light or dark; `colors` picks a colour per triangle. */
function foldedMesh(tris: Vector3[][], colors: (i: number) => number): Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const n = new Vector3();
  const e = new Vector3();
  tris.forEach(([a, b, c], i) => {
    n.copy(b).sub(a).cross(e.copy(c).sub(a)).normalize();
    const t = toneFor(n, colors(i));
    for (const v of [a, b, c]) {
      pos.push(v.x, v.y, v.z);
      col.push(t.r, t.g, t.b);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new Mesh(g, facets());
}

/**
 * A soft warm shadow of `outline` (meters, around the origin), drawn once on
 * a canvas and laid just behind the paper, down and to the right.
 */
const shadows = new Map<string, Mesh>();

/** The same shadow is drawn once per prop shape and shared after that. */
function shadowOf(outline: Vector2[], name: string): Mesh {
  const known = shadows.get(name);
  if (known) {
    const m = new Mesh(known.geometry, known.material);
    m.name = name;
    m.position.copy(known.position);
    m.renderOrder = -1;
    return m;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const h = maxY - minY;
  const pad = h * 0.25;
  const w = maxX - minX + pad * 2;
  const hh = h + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * SHADOW_PX_PER_M);
  canvas.height = Math.ceil(hh * SHADOW_PX_PER_M);
  const c = canvas.getContext('2d')!;
  const px = (x: number) => (x - minX + pad) * SHADOW_PX_PER_M;
  const py = (y: number) => (maxY + pad - y) * SHADOW_PX_PER_M;
  c.shadowColor = SHADOW_RGBA;
  c.shadowBlur = h * 0.12 * SHADOW_PX_PER_M;
  c.shadowOffsetX = h * 0.03 * SHADOW_PX_PER_M;
  c.shadowOffsetY = h * 0.05 * SHADOW_PX_PER_M;
  // The shape itself is drawn off the canvas; only its shadow lands on it.
  const away = canvas.width * 4;
  c.translate(-away, 0);
  c.shadowOffsetX += away;
  c.beginPath();
  outline.forEach((p, i) => (i === 0 ? c.moveTo(px(p.x), py(p.y)) : c.lineTo(px(p.x), py(p.y))));
  c.closePath();
  c.fill();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(
    new PlaneGeometry(w, hh),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  m.name = name;
  m.position.set((minX + maxX) / 2, (minY + maxY) / 2, -0.0012);
  m.renderOrder = -1;
  shadows.set(name, m);
  return m;
}

/** Outline of a star: `points` tips of `outer` radius, valleys at `inner`, first tip up. */
function starOutline(points: number, outer: number, inner: number): Vector2[] {
  const out: Vector2[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const a = Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    out.push(new Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return out;
}

/** Earned stars are gold; an empty one is pale paper of the same fold. */
const STAR_EMPTY = 0xe9dcc2;
const STAR_R = 0.025;

/**
 * A folded paper star: a ridge from the raised centre to every tip and a
 * valley to every notch, so each point shows a light and a shaded half.
 */
export function paperStar(earned: boolean): Group {
  const g = new Group();
  g.name = 'star';
  const outline = starOutline(5, STAR_R, STAR_R * 0.45);
  const top = new Vector3(0, 0, 0.005);
  const tris: Vector3[][] = [];
  outline.forEach((p, i) => {
    const q = outline[(i + 1) % outline.length];
    tris.push([top, new Vector3(p.x, p.y, 0), new Vector3(q.x, q.y, 0)]);
  });
  g.add(foldedMesh(tris, () => (earned ? GOLD : STAR_EMPTY)));
  g.add(shadowOf(outline, 'star-shadow'));
  return g;
}

/** Symbols cut from white paper for each highlight badge, about 2.4 cm across. */
function badgeSymbol(highlight: string): Shape[] {
  const s = 0.011;
  switch (highlight) {
    case 'best_save': {
      // A heart for a comeback: two lobes and a point, straight cuts only.
      const h = new Shape();
      h.moveTo(0, -s);
      h.lineTo(-s, 0.05 * s);
      h.lineTo(-s, 0.5 * s);
      h.lineTo(-0.55 * s, 0.85 * s);
      h.lineTo(-0.15 * s, 0.7 * s);
      h.lineTo(0, 0.45 * s);
      h.lineTo(0.15 * s, 0.7 * s);
      h.lineTo(0.55 * s, 0.85 * s);
      h.lineTo(s, 0.5 * s);
      h.lineTo(s, 0.05 * s);
      h.closePath();
      return [h];
    }
    case 'most_improved': {
      const a = new Shape();
      a.moveTo(0, s);
      a.lineTo(0.8 * s, 0.1 * s);
      a.lineTo(0.3 * s, 0.1 * s);
      a.lineTo(0.3 * s, -s);
      a.lineTo(-0.3 * s, -s);
      a.lineTo(-0.3 * s, 0.1 * s);
      a.lineTo(-0.8 * s, 0.1 * s);
      a.closePath();
      return [a];
    }
    case 'sharpest_aim': {
      const ring = new Shape();
      const hole = new Shape();
      const dot = new Shape();
      const sides = 20;
      for (let i = 0; i <= sides; i += 1) {
        const t = (i / sides) * Math.PI * 2;
        const o = [Math.cos(t), Math.sin(t)];
        if (i === 0) {
          ring.moveTo(o[0] * s, o[1] * s);
          hole.moveTo(o[0] * s * 0.65, o[1] * s * 0.65);
          dot.moveTo(o[0] * s * 0.32, o[1] * s * 0.32);
        } else {
          ring.lineTo(o[0] * s, o[1] * s);
          hole.lineTo(o[0] * s * 0.65, o[1] * s * 0.65);
          dot.lineTo(o[0] * s * 0.32, o[1] * s * 0.32);
        }
      }
      ring.holes.push(hole);
      return [ring, dot];
    }
    case 'steady_streak': {
      const bolt = new Shape();
      bolt.moveTo(0.25 * s, s);
      bolt.lineTo(-0.6 * s, -0.1 * s);
      bolt.lineTo(-0.05 * s, -0.1 * s);
      bolt.lineTo(-0.3 * s, -s);
      bolt.lineTo(0.6 * s, 0.15 * s);
      bolt.lineTo(0.05 * s, 0.15 * s);
      bolt.closePath();
      return [bolt];
    }
    default: {
      const star = new Shape();
      starOutline(5, s, s * 0.45).forEach((p, i) => (i === 0 ? star.moveTo(p.x, p.y) : star.lineTo(p.x, p.y)));
      star.closePath();
      return [star];
    }
  }
}

const BADGE_COLORS: Record<string, number> = {
  best_save: ACCENTS.place_value,
  most_improved: ACCENTS.fractions,
  sharpest_aim: ACCENTS.multiply_divide,
  steady_streak: ACCENTS.measurement,
  brave_try: TRY_AGAIN,
};

/** Flat shape in one paper colour, `z` above the sheet below it. */
function cut(shapes: Shape | Shape[], color: number, z: number, name: string): Mesh {
  const m = new Mesh(new ShapeGeometry(shapes, 1), paper(color, { doubleSide: true }));
  m.name = name;
  m.position.z = z;
  return m;
}

/**
 * A highlight badge as layered flat paper: two notched ribbon tails, a
 * sawtooth gold rosette, a coloured disc and a white symbol. Origin at the
 * disc centre, facing +Z.
 */
export function paperBadge(highlight: string): Group {
  const g = new Group();
  g.name = `badge-${highlight}`;
  const color = BADGE_COLORS[highlight] ?? ACCENTS.place_value;
  const rosette = starOutline(16, 0.03, 0.026);
  const tail = (side: number) => {
    const t = new Shape();
    t.moveTo(side * 0.004, -0.01);
    t.lineTo(side * 0.02, -0.014);
    t.lineTo(side * 0.024, -0.046);
    t.lineTo(side * 0.016, -0.04);
    t.lineTo(side * 0.009, -0.046);
    t.closePath();
    return t;
  };
  g.add(cut([tail(-1), tail(1)], shade(color), 0, 'badge-ribbon'));
  const ro = new Shape(rosette);
  g.add(cut(ro, GOLD, 0.0006, 'badge-rosette'));
  const disc = new Shape();
  for (let i = 0; i < 24; i += 1) {
    const t = (i / 24) * Math.PI * 2;
    if (i === 0) disc.moveTo(Math.cos(t) * 0.021, Math.sin(t) * 0.021);
    else disc.lineTo(Math.cos(t) * 0.021, Math.sin(t) * 0.021);
  }
  g.add(cut(disc, color, 0.0012, 'badge-disc'));
  g.add(cut(badgeSymbol(highlight), PAPER, 0.0018, 'badge-symbol'));
  g.add(
    shadowOf(
      [...rosette, new Vector2(0.024, -0.046), new Vector2(-0.024, -0.046)].sort(
        (a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x),
      ),
      'badge-shadow',
    ),
  );
  return g;
}

/** The desk card's paper, in metres; a caller may scale it to fit its words. */
export const BUTTON_W = 0.1;
export const BUTTON_H = 0.065;

/** A plain card of paper to poke, origin at its centre, front +Z. */
export function paperButton(color: number): Group {
  const g = new Group();
  g.name = 'button';
  const card = new Mesh(new PlaneGeometry(BUTTON_W, BUTTON_H), paper(color, { doubleSide: true }));
  card.name = 'button-card';
  g.add(card);
  const w = BUTTON_W / 2;
  const h = BUTTON_H / 2;
  g.add(shadowOf([new Vector2(-w, -h), new Vector2(w, -h), new Vector2(w, h), new Vector2(-w, h)], 'button-shadow'));
  return g;
}

const WINDOW_W = 0.18;
const WINDOW_H = 0.12;
const OPENING_W = 0.15;
const OPENING_H = 0.09;
/** The dark opening behind the window, so passthrough does not show through it. */
const WINDOW_DARK = 0x2b3a5c;

/**
 * A rival's window: one cream sheet with a rectangle cut out, a dark backing
 * behind the opening, and four photo corners in the rival's colour. Origin at
 * its centre, facing +Z.
 */
export function paperWindow(color: number): Group {
  const g = new Group();
  g.name = 'portal-window';
  const w = WINDOW_W / 2;
  const h = WINDOW_H / 2;
  const ow = OPENING_W / 2;
  const oh = OPENING_H / 2;
  const sheet = new Shape([new Vector2(-w, -h), new Vector2(w, -h), new Vector2(w, h), new Vector2(-w, h)]);
  sheet.holes.push(new Shape([new Vector2(-ow, -oh), new Vector2(-ow, oh), new Vector2(ow, oh), new Vector2(ow, -oh)]));
  g.add(cut(sheet, PAPER, 0, 'window-sheet'));
  const back = new Mesh(new PlaneGeometry(OPENING_W + 0.004, OPENING_H + 0.004), paper(WINDOW_DARK));
  back.name = 'window-back';
  back.position.z = -0.0006;
  g.add(back);
  const c = 0.016;
  for (const [sx, sy] of [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    // Right angle just outside the opening's corner, legs along its edges.
    const ox = sx * (ow + 0.004);
    const oy = sy * (oh + 0.004);
    const corner = new Shape([new Vector2(ox, oy), new Vector2(ox - sx * c, oy), new Vector2(ox, oy - sy * c)]);
    g.add(cut(corner, color, 0.0006, 'window-corner'));
  }
  g.add(shadowOf([new Vector2(-w, -h), new Vector2(w, -h), new Vector2(w, h), new Vector2(-w, h)], 'window-shadow'));
  return g;
}

/**
 * An orb of folded paper: a twenty-sided ball, its faces taking the two
 * crystals' colours in turn. Origin at its centre.
 */
export function paperOrb(color: number, second = color): Mesh {
  const geo = new IcosahedronGeometry(0.026, 0);
  const p = geo.getAttribute('position');
  const tris: Vector3[][] = [];
  for (let i = 0; i < p.count; i += 3) {
    tris.push([0, 1, 2].map((k) => new Vector3(p.getX(i + k), p.getY(i + k), p.getZ(i + k))));
  }
  geo.dispose();
  const m = foldedMesh(tris, (i) => (i % 2 === 0 ? color : second));
  m.name = 'orb';
  return m;
}
