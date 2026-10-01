import {
  AnimationClip,
  AssetManager,
  Box3,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from '@iwsdk/core';
import type { Species } from '../assets.js';
import { INK, PAPER_SHADE, paper, shade, tint } from './palette.js';

/**
 * Origami animals folded from flat paper panels, seen in profile. Each part
 * is drawn as its side view: a point is x (towards the head), y (up) and how
 * far that side of the fold stands out from the middle (half the depth). The
 * far side is its mirror, so a body reads as paper folded over a ridge.
 */
type P = [number, number, number];

interface Tri {
  v: [P, P, P];
  /** `paper` shows the white back of the sheet, as on a fox's chin. */
  tone?: 'paper';
}

interface Part {
  name: string;
  /** The joint the part turns about (x, y); the part's points stay absolute. */
  pivot: [number, number];
  tris: (Tri | [P, P, P])[];
  /** Two flat copies this far either side of the middle (legs, ears) instead of one fold. */
  pair?: number;
  parts?: Part[];
  /** Eyes on this part: a triangle index and where on it (weights of its corners). */
  eye?: { tri: number; at: [number, number, number] };
}

export interface OrigamiDesign {
  body: Part;
  /** Where the flag pole stands on the back. */
  flag: [number, number];
}

/** Lit from the upper left and the front, so folds facing away fall to the lower right. */
const LIGHT = new Vector3(-0.4, 0.7, 0.6).normalize();
const EYE_R = 0.0021;

const FOX: OrigamiDesign = {
  flag: [-0.004, 0.041],
  body: {
    name: 'body',
    pivot: [0, 0],
    tris: [
      [[0.018, 0.043, 0], [-0.022, 0.041, 0], [-0.002, 0.033, 0.011]],
      [[0.018, 0.043, 0], [-0.002, 0.033, 0.011], [0.028, 0.034, 0.004]],
      [[0.028, 0.034, 0.004], [-0.002, 0.033, 0.011], [0.02, 0.023, 0.003]],
      [[-0.022, 0.041, 0], [-0.028, 0.033, 0.004], [-0.002, 0.033, 0.011]],
      [[-0.028, 0.033, 0.004], [-0.02, 0.024, 0.003], [-0.002, 0.033, 0.011]],
      [[-0.002, 0.033, 0.011], [-0.02, 0.024, 0.003], [0.02, 0.023, 0.003]],
    ],
    parts: [
      {
        name: 'head',
        pivot: [0.022, 0.045],
        tris: [
          [[0.017, 0.05, 0], [0.032, 0.057, 0], [0.036, 0.046, 0.009]],
          [[0.032, 0.057, 0], [0.061, 0.041, 0], [0.036, 0.046, 0.009]],
          { v: [[0.036, 0.046, 0.009], [0.061, 0.041, 0], [0.039, 0.035, 0.003]], tone: 'paper' },
          [[0.017, 0.05, 0], [0.036, 0.046, 0.009], [0.024, 0.032, 0.004]],
          { v: [[0.036, 0.046, 0.009], [0.039, 0.035, 0.003], [0.024, 0.032, 0.004]], tone: 'paper' },
        ],
        eye: { tri: 1, at: [0.3, 0.2, 0.5] },
        parts: [
          {
            name: 'ears',
            pivot: [0.03, 0.055],
            pair: 0.004,
            tris: [[[0.026, 0.053, 0.001], [0.036, 0.055, 0.001], [0.029, 0.074, 0]]],
          },
        ],
      },
      {
        name: 'tail',
        pivot: [-0.024, 0.04],
        tris: [
          [[-0.022, 0.043, 0], [-0.04, 0.041, 0.007], [-0.026, 0.034, 0]],
          [[-0.022, 0.043, 0], [-0.059, 0.03, 0], [-0.04, 0.041, 0.007]],
          [[-0.04, 0.041, 0.007], [-0.059, 0.03, 0], [-0.042, 0.027, 0.003]],
          [[-0.026, 0.034, 0], [-0.04, 0.041, 0.007], [-0.042, 0.027, 0.003]],
          { v: [[-0.051, 0.036, 0.003], [-0.059, 0.03, 0], [-0.051, 0.028, 0.002]], tone: 'paper' },
        ],
      },
      {
        name: 'legs_front',
        pivot: [0.014, 0.03],
        pair: 0.006,
        tris: [
          [[0.01, 0.031, 0.002], [0.019, 0.03, 0.002], [0.0145, 0, 0.0008]],
          [[0.01, 0.031, 0.002], [0.0145, 0, 0.0008], [0.0135, 0.001, 0.0008]],
        ],
      },
      {
        name: 'legs_back',
        pivot: [-0.016, 0.03],
        pair: 0.006,
        tris: [
          [[-0.023, 0.033, 0.002], [-0.012, 0.031, 0.002], [-0.0155, 0, 0.0008]],
          [[-0.023, 0.033, 0.002], [-0.0155, 0, 0.0008], [-0.0175, 0.012, 0.0015]],
        ],
      },
    ],
  },
};

/** The folded animal shown when a model did not load. */
const STAND_IN = FOX;

let foldPaper: MeshStandardMaterial | undefined;

/** Builds one part's folded panels, in the part's own frame (pivot at the origin). */
function panels(part: Part, color: number): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const [px, py] = part.pivot;
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  const tones = {
    color: [new Color(shade(shade(shade(color)))), new Color(tint(color, 0.35))],
    paper: [new Color(shade(PAPER_SHADE)), new Color(tint(PAPER_SHADE, 0.6))],
  };
  const face = (p: Vector3, q: Vector3, r: Vector3, tone: 'color' | 'paper') => {
    n.copy(q).sub(p).cross(c.copy(r).sub(p)).normalize();
    // A steep ramp, so neighbouring folds read as light and shade.
    const lit = Math.min(1, Math.max(0, (n.dot(LIGHT) * 0.5 + 0.5 - 0.35) / 0.55));
    const [dark, light] = tones[tone];
    const t = dark.clone().lerp(light, lit * lit * (3 - 2 * lit));
    for (const v of [p, q, r]) {
      pos.push(v.x, v.y, v.z);
      col.push(t.r, t.g, t.b);
    }
  };
  const offsets = part.pair ? [part.pair, -part.pair] : [0];
  for (const t of part.tris) {
    const tri = Array.isArray(t) ? { v: t } : t;
    for (const off of offsets) {
      for (const side of [1, -1]) {
        const [p, q, r] = tri.v.map(([x, y, d]) => new Vector3(x - px, y - py, off + side * d));
        // Each side faces away from the middle of its own fold.
        n.copy(q).sub(p).cross(b.copy(r).sub(p));
        const out = n.z * side >= 0;
        a.copy(out ? q : r);
        face(p, a, out ? r : q, tri.tone ?? 'color');
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** Folded panels per species, part and colour, built once and shared. */
const geometries = new Map<string, BufferGeometry>();

function build(species: Species, part: Part, color: number, parentPivot: [number, number]): Group {
  const g = new Group();
  g.name = part.name;
  g.position.set(part.pivot[0] - parentPivot[0], part.pivot[1] - parentPivot[1], 0);
  foldPaper ??= new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    flatShading: true,
    side: DoubleSide,
  });
  const key = `${species}:${part.name}:${color}`;
  let geo = geometries.get(key);
  if (!geo) {
    geo = panels(part, color);
    geometries.set(key, geo);
  }
  const mesh = new Mesh(geo, foldPaper);
  mesh.name = `${part.name}-paper`;
  g.add(mesh);
  if (part.eye) {
    const tri = part.tris[part.eye.tri];
    const v = (Array.isArray(tri) ? tri : tri.v).map(([x, y, d]) => new Vector3(x, y, d));
    const [w0, w1, w2] = part.eye.at;
    const at = v[0].multiplyScalar(w0).add(v[1].multiplyScalar(w1)).add(v[2].multiplyScalar(w2));
    for (const side of [1, -1]) {
      const eye = new Mesh(new CircleGeometry(EYE_R, 8), paper(INK));
      eye.name = 'eye';
      eye.position.set(at.x - part.pivot[0], at.y - part.pivot[1], side * (at.z + 0.0006));
      if (side < 0) eye.rotation.y = Math.PI;
      g.add(eye);
    }
  }
  for (const child of part.parts ?? []) g.add(build(species, child, color, part.pivot));
  return g;
}

const Z = new Vector3(0, 0, 1);
const Y = new Vector3(0, 1, 0);
const q = new Quaternion();

/** Keyframes turning `name` about `axis` through `angles` (radians) at `times`. */
function turn(name: string, axis: Vector3, times: number[], angles: number[]): QuaternionKeyframeTrack {
  const values: number[] = [];
  for (const a of angles) values.push(...q.setFromAxisAngle(axis, a).toArray());
  return new QuaternionKeyframeTrack(`${name}.quaternion`, times, values);
}

/** Keyframes lifting `name` by `heights` above where it rests. */
function lift(name: string, rest: Vector3, times: number[], heights: number[]): VectorKeyframeTrack {
  const values: number[] = [];
  for (const h of heights) values.push(rest.x, rest.y + h, rest.z);
  return new VectorKeyframeTrack(`${name}.position`, times, values);
}

/** Idle, bounce (a wrong answer), cheer (a right one) and hop (going home), made in code. */
function clips(model: Object3D): AnimationClip[] {
  const rest = (name: string) => model.getObjectByName(name)?.position.clone() ?? new Vector3();
  const body = rest('body');
  const tail = model.getObjectByName('tail') ? 'tail' : undefined;
  const idle = [
    turn('head', Z, [0, 1.2, 2.4], [0, 0.06, 0]),
    lift('body', body, [0, 1.2, 2.4], [0, 0.0008, 0]),
  ];
  if (tail) idle.push(turn(tail, Y, [0, 0.6, 1.8, 2.4], [0, 0.2, -0.2, 0]));
  // A crane's wings fold in and open again.
  const flap = (times: number[], spans: number[]) =>
    new VectorKeyframeTrack('wings.scale', times, spans.flatMap((k) => [1, 1, k]));
  idle.push(flap([0, 1.2, 2.4], [1, 0.55, 1]));
  const bounce = [
    lift('body', body, [0, 0.12, 0.3, 0.45], [0, 0.012, 0, 0]),
    turn('head', Y, [0, 0.1, 0.2, 0.3, 0.45], [0, 0.3, -0.3, 0.2, 0]),
  ];
  const cheer = [
    lift('body', body, [0, 0.18, 0.36, 0.54, 0.72, 1.0], [0, 0.02, 0, 0.02, 0, 0]),
    turn('head', Z, [0, 0.2, 0.8, 1.0], [0, 0.3, 0.3, 0]),
  ];
  if (tail) cheer.push(turn(tail, Y, [0, 0.15, 0.3, 0.45, 0.6, 1.0], [0, 0.35, -0.35, 0.35, -0.35, 0]));
  cheer.push(flap([0, 0.25, 0.5, 0.75, 1.0], [1, 0.3, 1, 0.3, 1]));
  const hop = [
    lift('body', body, [0, 0.2, 0.4], [0, 0.012, 0]),
    turn('legs_front', Z, [0, 0.2, 0.4], [0, -0.3, 0]),
    turn('legs_back', Z, [0, 0.2, 0.4], [0, 0.3, 0]),
  ];
  // Only parts this animal has: a fish has no head of its own, a crane no legs.
  const has = (tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[]) =>
    tracks.filter((t) => model.getObjectByName(t.name.split('.')[0]));
  return [
    new AnimationClip('idle', 2.4, has(idle)),
    new AnimationClip('bounce', 0.45, has(bounce)),
    new AnimationClip('cheer', 1.0, has(cheer)),
    new AnimationClip('hop', 0.4, has(hop)),
  ];
}

/**
 * An origami animal in `color`, head towards +X, feet at y 0, with its
 * clips and the point on its back where the flag goes.
 */
/**
 * Animals from Zia's own paper models. Their panels come in tones of one
 * paper colour, marked one of two ways: by material name (`_deep`, `_dark`,
 * `_warm`, the plain one, `_mid`, `_light`, `_pale`), or by the colour of
 * each panel in a single material. The game keeps that sorting and repaints
 * the tones evenly from the creature's colour, like the light and shaded
 * halves of the portal disc, with no lines between them. Black and white
 * paper (eyes, noses, muzzles, a cow's patches) keeps its own colour.
 *
 * Per species: how tall it stands, the turn about the vertical that puts
 * its head on +X, where its flag goes and, for a model without eyes of its
 * own, where its eye sits: shares of its length from the tail and of its
 * height from the feet (read off a side view of each model).
 */
interface Scanned {
  height: number;
  turn: number;
  flag: [number, number];
  eye?: [number, number];
}

/** Heights rank the animals by size (elephant, cow, dog and chicken, cat and rabbit, bird, fish), not true to life. */
const SCANNED: Record<Species, Scanned> = {
  chicken: { height: 0.062, turn: Math.PI / 2, flag: [0.42, 0.62], eye: [0.8, 0.875] },
  cat: { height: 0.05, turn: Math.PI / 2, flag: [0.45, 0.7], eye: [0.86, 0.6] },
  rabbit: { height: 0.056, turn: Math.PI / 2, flag: [0.4, 0.5], eye: [0.82, 0.58] },
  elephant: { height: 0.085, turn: Math.PI / 2, flag: [0.45, 0.85], eye: [0.9, 0.6] },
  dog: { height: 0.06, turn: Math.PI, flag: [0.4, 0.7] },
  cow: { height: 0.072, turn: 0, flag: [0.45, 0.85] },
  bird: { height: 0.044, turn: Math.PI, flag: [0.4, 0.6] },
  fish: { height: 0.036, turn: Math.PI / 2, flag: [0.45, 0.85] },
};

/** Tone of each material suffix: 0 darkest to 4 palest. */
const SUFFIX_TONE: [string, number][] = [
  ['_deep', 0],
  ['_dark', 0],
  ['_warm', 1],
  ['_beak', 1],
  ['_mid', 2],
  ['_light', 3],
  ['_pale', 4],
];

/**
 * The five paper tones from one colour, evenly apart: two shades darker,
 * the colour itself, and two lighter, as the portal disc's halves differ.
 */
function fiveTones(color: number): Color[] {
  return [
    new Color(shade(shade(shade(color)))),
    new Color(shade(color)),
    new Color(color),
    new Color(tint(color, 0.16)),
    new Color(tint(color, 0.32)),
  ];
}

/** Black, white and grey paper (eyes, noses, a cow's patches) is not recoloured. */
function neutral(c: Color): boolean {
  const max = Math.max(c.r, c.g, c.b);
  return max < 0.06 || (max - Math.min(c.r, c.g, c.b)) / max < 0.2;
}

/** The eyes added to a model without its own: a soft dark, not black, and small. */
const SCANNED_EYE = 0x5b4a3c;
const SCANNED_EYE_R = 0.0017;

let scannedPaper: MeshStandardMaterial | undefined;

interface ScannedShape {
  geo: BufferGeometry;
  flag: Vector3;
  /** Where to add eyes, or null when the model has its own. */
  eye: Vector3 | null;
  front: number;
  back: number;
}

const scannedShapes = new Map<string, ScannedShape>();

/**
 * An animal from one of Zia's paper models, turned head towards +X, stood
 * on the table and sized like the others, every coloured panel in its tone
 * of `color`. Null when the model did not load.
 */
function scannedShape(species: Species, spec: Scanned, color: number): ScannedShape | null {
  const key = `${species}:${color}`;
  const known = scannedShapes.get(key);
  if (known) return known;
  const gltf = AssetManager.getGLTF(`foldling_${species}`);
  if (!gltf) return null;
  const pos: number[] = [];
  // Per triangle: a material tone (0 to 4), -1 to keep `keep`, or -2 to be
  // toned from its own colour's lightness below.
  const tone: number[] = [];
  const keep: Color[] = [];
  const light: number[] = [];
  gltf.scene.updateMatrixWorld(true);
  const turn = new Matrix4().makeRotationY(spec.turn);
  const c = new Color();
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    const name = mat.name ?? '';
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const m = new Matrix4().multiplyMatrices(turn, mesh.matrixWorld);
    const p = g.getAttribute('position');
    const vc = g.getAttribute('color');
    const v = new Vector3();
    const suffix = SUFFIX_TONE.find(([s]) => name.endsWith(s));
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      if (i % 3 !== 0) continue;
      if (vc) c.setRGB(vc.getX(i), vc.getY(i), vc.getZ(i));
      else c.copy(mat.color);
      if (neutral(c)) {
        tone.push(-1);
        keep.push(c.clone());
      } else if (!vc) {
        tone.push(suffix ? suffix[1] : 2);
        keep.push(c.clone());
      } else {
        tone.push(-2);
        keep.push(c.clone());
      }
      light.push(c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722);
    }
    g.dispose();
  });
  // Panels told apart only by their colour: their lightness, ranked, picks
  // one of the five tones, so each model uses all five evenly.
  const ranked = tone.map((t, i) => (t === -2 ? light[i] : NaN)).filter((l) => !Number.isNaN(l));
  ranked.sort((a, b) => a - b);
  const toneOfLight = (l: number) => {
    let below = 0;
    while (below < ranked.length && ranked[below] < l) below += 1;
    return Math.min(4, Math.floor((below / Math.max(1, ranked.length)) * 5));
  };
  const box = new Box3();
  for (let i = 0; i < pos.length; i += 3) box.expandByPoint(new Vector3(pos[i], pos[i + 1], pos[i + 2]));
  const k = spec.height / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - cx) * k;
    pos[i + 1] = (pos[i + 1] - box.min.y) * k;
    pos[i + 2] = (pos[i + 2] - cz) * k;
  }
  const tones = fiveTones(color);
  const col: number[] = [];
  tone.forEach((t, i) => {
    const out = t === -1 ? keep[i] : tones[t === -2 ? toneOfLight(light[i]) : t];
    for (let j = 0; j < 3; j += 1) col.push(out.r, out.g, out.b);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const length = (box.max.x - box.min.x) * k;
  const flag = new Vector3(-length / 2 + length * spec.flag[0], spec.height * spec.flag[1], 0);
  const eye = spec.eye ? new Vector3(-length / 2 + length * spec.eye[0], spec.height * spec.eye[1], 0) : null;
  // How far out the paper is at the eye on each side: the nearest facet
  // that covers that point, seen from the player and from behind.
  let near = -Infinity;
  let far = Infinity;
  if (eye) {
    for (let i = 0; i < pos.length; i += 9) {
      const [ax, ay, az, bx, by, bz, qx, qy, qz] = pos.slice(i, i + 9);
      const det = (by - qy) * (ax - qx) + (qx - bx) * (ay - qy);
      if (Math.abs(det) < 1e-12) continue;
      const u = ((by - qy) * (eye.x - qx) + (qx - bx) * (eye.y - qy)) / det;
      const v = ((qy - ay) * (eye.x - qx) + (ax - qx) * (eye.y - qy)) / det;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const z = u * az + v * bz + (1 - u - v) * qz;
      near = Math.max(near, z);
      far = Math.min(far, z);
    }
  }
  const shape = {
    geo,
    flag,
    eye,
    front: Number.isFinite(near) ? near : 0,
    back: Number.isFinite(far) ? far : 0,
  };
  scannedShapes.set(key, shape);
  return shape;
}

/**
 * An origami animal in `color`, head towards +X, feet at y 0, with its
 * clips and the point on its back where the flag goes. When its model did
 * not load, a fox folded from panels stands in.
 */
export function makeOrigami(
  species: Species,
  color: number,
): { model: Group; flag: Object3D; animations: AnimationClip[] } {
  const model = new Group();
  model.name = `origami-${species}`;
  const flag = new Object3D();
  flag.name = 'flag_anchor';
  const scanned = scannedShape(species, SCANNED[species], color);
  if (scanned) {
    const body = new Group();
    body.name = 'body';
    // Both sides of the paper show: the panels are single sheets.
    scannedPaper ??= new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      side: DoubleSide,
    });
    const mesh = new Mesh(scanned.geo, scannedPaper);
    mesh.name = `${species}-paper`;
    body.add(mesh);
    if (scanned.eye) {
      for (const side of [1, -1]) {
        const eye = new Mesh(new CircleGeometry(SCANNED_EYE_R, 10), paper(SCANNED_EYE));
        eye.name = 'eye';
        eye.position.set(scanned.eye.x, scanned.eye.y, side > 0 ? scanned.front + 0.0006 : scanned.back - 0.0006);
        if (side < 0) eye.rotation.y = Math.PI;
        body.add(eye);
      }
    }
    model.add(body);
    flag.position.copy(scanned.flag);
    body.add(flag);
    return { model, flag, animations: clips(model) };
  }
  console.error(`[art] foldling_${species} is not loaded; folding a paper fox instead`);
  const body = build(species, STAND_IN.body, color, [0, 0]);
  model.add(body);
  flag.position.set(STAND_IN.flag[0], STAND_IN.flag[1], 0);
  body.add(flag);
  return { model, flag, animations: clips(model) };
}
