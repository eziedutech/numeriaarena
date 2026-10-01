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

const ELEPHANT: OrigamiDesign = {
  flag: [-0.004, 0.049],
  body: {
    name: 'body',
    pivot: [0, 0],
    tris: [
      [[0.018, 0.051, 0], [-0.024, 0.049, 0], [-0.003, 0.038, 0.016]],
      [[0.018, 0.051, 0], [-0.003, 0.038, 0.016], [0.027, 0.036, 0.008]],
      [[0.027, 0.036, 0.008], [-0.003, 0.038, 0.016], [0.018, 0.022, 0.006]],
      [[-0.024, 0.049, 0], [-0.031, 0.036, 0.008], [-0.003, 0.038, 0.016]],
      [[-0.031, 0.036, 0.008], [-0.022, 0.022, 0.006], [-0.003, 0.038, 0.016]],
      [[-0.003, 0.038, 0.016], [-0.022, 0.022, 0.006], [0.018, 0.022, 0.006]],
    ],
    parts: [
      {
        name: 'head',
        pivot: [0.024, 0.048],
        tris: [
          [[0.016, 0.057, 0], [0.031, 0.06, 0], [0.036, 0.045, 0.011]],
          [[0.031, 0.06, 0], [0.045, 0.051, 0.003], [0.036, 0.045, 0.011]],
          [[0.036, 0.045, 0.011], [0.045, 0.051, 0.003], [0.039, 0.033, 0.005]],
          [[0.016, 0.057, 0], [0.036, 0.045, 0.011], [0.025, 0.03, 0.006]],
          [[0.036, 0.045, 0.011], [0.039, 0.033, 0.005], [0.025, 0.03, 0.006]],
        ],
        eye: { tri: 1, at: [0.2, 0.5, 0.3] },
        parts: [
          {
            name: 'trunk',
            pivot: [0.043, 0.042],
            tris: [
              [[0.045, 0.05, 0.003], [0.039, 0.036, 0.004], [0.054, 0.033, 0.003]],
              [[0.039, 0.036, 0.004], [0.047, 0.027, 0.003], [0.054, 0.033, 0.003]],
              [[0.054, 0.033, 0.003], [0.047, 0.027, 0.003], [0.059, 0.011, 0.0025]],
              [[0.047, 0.027, 0.003], [0.052, 0.011, 0.0025], [0.059, 0.011, 0.0025]],
            ],
          },
          {
            name: 'ears',
            pivot: [0.026, 0.05],
            pair: 0.0125,
            tris: [
              [[0.021, 0.06, 0.001], [0.031, 0.055, 0.001], [0.03, 0.031, 0.001]],
              [[0.021, 0.06, 0.001], [0.03, 0.031, 0.001], [0.013, 0.036, 0.001]],
            ],
          },
        ],
      },
      {
        name: 'tail',
        pivot: [-0.03, 0.042],
        tris: [[[-0.029, 0.043, 0], [-0.036, 0.022, 0.001], [-0.032, 0.022, 0.001]]],
      },
      {
        name: 'legs_front',
        pivot: [0.015, 0.03],
        pair: 0.008,
        tris: [
          [[0.008, 0.031, 0.004], [0.021, 0.031, 0.004], [0.0185, 0, 0.0035]],
          [[0.008, 0.031, 0.004], [0.0185, 0, 0.0035], [0.0105, 0, 0.0035]],
        ],
      },
      {
        name: 'legs_back',
        pivot: [-0.017, 0.03],
        pair: 0.008,
        tris: [
          [[-0.024, 0.031, 0.004], [-0.01, 0.031, 0.004], [-0.0125, 0, 0.0035]],
          [[-0.024, 0.031, 0.004], [-0.0125, 0, 0.0035], [-0.0205, 0, 0.0035]],
        ],
      },
    ],
  },
};

/** Four panels meeting at `mid`, for a leg or flap drawn as a quad (a, b top; c, d foot). */
function quad(a: P, b: P, c: P, d: P): [P, P, P][] {
  return [
    [a, b, c],
    [a, c, d],
  ];
}

/** A pointed head seen from the side: neck top, crown, nose, cheek, jaw, throat. */
function head(nT: P, cr: P, ns: P, ck: P, jw: P, nB: P, chin?: 'paper'): (Tri | [P, P, P])[] {
  return [
    [nT, cr, ck],
    [cr, ns, ck],
    { v: [ck, ns, jw], tone: chin },
    [nT, ck, nB],
    { v: [ck, jw, nB], tone: chin },
  ];
}

const RABBIT: OrigamiDesign = {
  flag: [-0.008, 0.037],
  body: {
    name: 'body',
    pivot: [0, 0],
    tris: [
      [[0.012, 0.042, 0], [-0.012, 0.036, 0], [-0.004, 0.02, 0.015]],
      [[-0.012, 0.036, 0], [-0.024, 0.016, 0.008], [-0.004, 0.02, 0.015]],
      [[-0.024, 0.016, 0.008], [-0.016, 0.002, 0.01], [-0.004, 0.02, 0.015]],
      [[-0.016, 0.002, 0.01], [0.012, 0.002, 0.006], [-0.004, 0.02, 0.015]],
      [[0.012, 0.002, 0.006], [0.018, 0.026, 0.006], [-0.004, 0.02, 0.015]],
      [[0.018, 0.026, 0.006], [0.012, 0.042, 0], [-0.004, 0.02, 0.015]],
    ],
    parts: [
      {
        name: 'head',
        pivot: [0.016, 0.042],
        tris: head(
          [0.009, 0.047, 0],
          [0.022, 0.054, 0],
          [0.037, 0.043, 0.002],
          [0.024, 0.044, 0.009],
          [0.027, 0.034, 0.004],
          [0.014, 0.034, 0.005],
          'paper',
        ),
        eye: { tri: 1, at: [0.35, 0.25, 0.4] },
        parts: [
          {
            name: 'ears',
            pivot: [0.019, 0.053],
            pair: 0.004,
            tris: [
              [[0.015, 0.052, 0.001], [0.024, 0.054, 0.001], [0.009, 0.083, 0]],
              { v: [[0.017, 0.055, 0.0013], [0.021, 0.056, 0.0013], [0.012, 0.076, 0.0008]], tone: 'paper' },
            ],
          },
        ],
      },
      {
        name: 'tail',
        pivot: [-0.024, 0.016],
        tris: [
          { v: [[-0.022, 0.021, 0], [-0.031, 0.018, 0.004], [-0.024, 0.01, 0]], tone: 'paper' },
          { v: [[-0.022, 0.021, 0], [-0.027, 0.025, 0.002], [-0.031, 0.018, 0.004]], tone: 'paper' },
        ],
      },
      {
        name: 'legs_front',
        pivot: [0.014, 0.02],
        pair: 0.005,
        tris: quad([0.01, 0.024, 0.002], [0.018, 0.022, 0.002], [0.021, 0, 0.001], [0.013, 0, 0.001]),
      },
      {
        name: 'legs_back',
        pivot: [-0.01, 0.01],
        pair: 0.012,
        tris: quad([-0.021, 0.012, 0.002], [-0.004, 0.006, 0.002], [0.007, 0, 0.001], [-0.021, 0, 0.001]),
      },
    ],
  },
};

const CAT: OrigamiDesign = {
  flag: [-0.004, 0.04],
  body: {
    name: 'body',
    pivot: [0, 0],
    tris: [
      [[0.016, 0.042, 0], [-0.02, 0.041, 0], [-0.002, 0.033, 0.01]],
      [[0.016, 0.042, 0], [-0.002, 0.033, 0.01], [0.025, 0.033, 0.004]],
      [[0.025, 0.033, 0.004], [-0.002, 0.033, 0.01], [0.018, 0.023, 0.003]],
      [[-0.02, 0.041, 0], [-0.026, 0.033, 0.004], [-0.002, 0.033, 0.01]],
      [[-0.026, 0.033, 0.004], [-0.018, 0.024, 0.003], [-0.002, 0.033, 0.01]],
      [[-0.002, 0.033, 0.01], [-0.018, 0.024, 0.003], [0.018, 0.023, 0.003]],
    ],
    parts: [
      {
        name: 'head',
        pivot: [0.02, 0.044],
        tris: head(
          [0.015, 0.049, 0],
          [0.027, 0.057, 0],
          [0.045, 0.045, 0.002],
          [0.032, 0.047, 0.009],
          [0.035, 0.036, 0.004],
          [0.021, 0.034, 0.004],
          'paper',
        ),
        eye: { tri: 1, at: [0.35, 0.25, 0.4] },
        parts: [
          {
            name: 'ears',
            pivot: [0.026, 0.056],
            pair: 0.005,
            tris: [[[0.021, 0.055, 0.001], [0.031, 0.057, 0.001], [0.022, 0.069, 0]]],
          },
        ],
      },
      {
        name: 'tail',
        pivot: [-0.023, 0.041],
        tris: [
          [[-0.02, 0.044, 0.003], [-0.026, 0.037, 0.003], [-0.037, 0.05, 0.0025]],
          [[-0.02, 0.044, 0.003], [-0.037, 0.05, 0.0025], [-0.03, 0.054, 0.0025]],
          [[-0.03, 0.054, 0.0025], [-0.037, 0.05, 0.0025], [-0.036, 0.066, 0.002]],
          [[-0.03, 0.054, 0.0025], [-0.036, 0.066, 0.002], [-0.029, 0.066, 0.002]],
          [[-0.029, 0.066, 0.002], [-0.036, 0.066, 0.002], [-0.027, 0.075, 0.001]],
        ],
      },
      {
        name: 'legs_front',
        pivot: [0.013, 0.028],
        pair: 0.005,
        tris: quad([0.008, 0.03, 0.0025], [0.019, 0.029, 0.0025], [0.017, 0, 0.0012], [0.012, 0, 0.0012]),
      },
      {
        name: 'legs_back',
        pivot: [-0.015, 0.029],
        pair: 0.005,
        tris: quad([-0.023, 0.033, 0.0025], [-0.01, 0.03, 0.0025], [-0.013, 0, 0.0012], [-0.018, 0, 0.0012]),
      },
    ],
  },
};

const CRANE: OrigamiDesign = {
  flag: [-0.002, 0.026],
  body: {
    name: 'body',
    pivot: [0, 0],
    tris: [
      [[-0.014, 0.026, 0], [0.014, 0.026, 0], [0, 0.017, 0.012]],
      [[0.014, 0.026, 0], [0, 0.003, 0], [0, 0.017, 0.012]],
      [[0, 0.003, 0], [-0.014, 0.026, 0], [0, 0.017, 0.012]],
    ],
    parts: [
      {
        name: 'head',
        pivot: [0.012, 0.024],
        tris: [
          [[0.009, 0.027, 0], [0.016, 0.021, 0.002], [0.043, 0.062, 0]],
          [[0.043, 0.062, 0], [0.041, 0.056, 0.0015], [0.056, 0.053, 0]],
        ],
        eye: { tri: 1, at: [0.45, 0.35, 0.2] },
      },
      {
        name: 'tail',
        pivot: [-0.012, 0.024],
        tris: [[[-0.009, 0.027, 0], [-0.016, 0.021, 0.002], [-0.045, 0.058, 0]]],
      },
      {
        name: 'wings',
        pivot: [0, 0.026],
        tris: [
          [[-0.013, 0.026, 0.002], [0.013, 0.026, 0.002], [-0.003, 0.058, 0.032]],
          { v: [[-0.013, 0.026, 0.002], [-0.003, 0.058, 0.032], [-0.02, 0.05, 0.02]], tone: 'paper' },
        ],
      },
    ],
  },
};

const FISH: OrigamiDesign = {
  flag: [-0.004, 0.038],
  body: {
    name: 'body',
    pivot: [0, 0],
    tris: [
      [[0.035, 0.022, 0], [0.004, 0.04, 0], [0.006, 0.023, 0.011]],
      [[0.004, 0.04, 0], [-0.022, 0.026, 0], [0.006, 0.023, 0.011]],
      [[-0.022, 0.026, 0], [0, 0.006, 0], [0.006, 0.023, 0.011]],
      { v: [[0, 0.006, 0], [0.035, 0.022, 0], [0.006, 0.023, 0.011]], tone: 'paper' },
      [[0.001, 0.039, 0], [-0.011, 0.035, 0], [-0.013, 0.048, 0]],
      [[0.013, 0.017, 0.0115], [0.005, 0.019, 0.0115], [-0.002, 0.009, 0.013]],
    ],
    eye: { tri: 0, at: [0.55, 0.15, 0.3] },
    parts: [
      {
        name: 'tail',
        pivot: [-0.021, 0.024],
        tris: [
          [[-0.02, 0.029, 0.0015], [-0.021, 0.019, 0.0015], [-0.041, 0.043, 0.001]],
          [[-0.02, 0.029, 0.0015], [-0.04, 0.007, 0.001], [-0.021, 0.019, 0.0015]],
        ],
      },
    ],
  },
};

const FROG: OrigamiDesign = {
  flag: [-0.002, 0.034],
  body: {
    name: 'body',
    pivot: [0, 0],
    tris: [
      [[0.029, 0.024, 0], [0.018, 0.034, 0], [0.004, 0.021, 0.016]],
      [[0.018, 0.034, 0], [-0.004, 0.034, 0], [0.004, 0.021, 0.016]],
      [[-0.004, 0.034, 0], [-0.02, 0.016, 0.006], [0.004, 0.021, 0.016]],
      [[-0.02, 0.016, 0.006], [-0.014, 0.004, 0.008], [0.004, 0.021, 0.016]],
      { v: [[-0.014, 0.004, 0.008], [0.022, 0.012, 0.006], [0.004, 0.021, 0.016]], tone: 'paper' },
      { v: [[0.022, 0.012, 0.006], [0.029, 0.024, 0], [0.004, 0.021, 0.016]], tone: 'paper' },
      [[0.013, 0.033, 0.004], [0.021, 0.032, 0.004], [0.016, 0.04, 0.005]],
    ],
    eye: { tri: 6, at: [0.3, 0.3, 0.4] },
    parts: [
      {
        name: 'legs_front',
        pivot: [0.018, 0.012],
        pair: 0.008,
        tris: quad([0.015, 0.013, 0.002], [0.022, 0.012, 0.002], [0.027, 0, 0.001], [0.02, 0, 0.001]),
      },
      {
        name: 'legs_back',
        pivot: [-0.012, 0.014],
        pair: 0.016,
        tris: [
          [[-0.019, 0.021, 0.001], [-0.002, 0.013, 0.001], [-0.021, 0.004, 0.001]],
          [[-0.021, 0.004, 0.001], [-0.004, 0.004, 0.001], [0.007, 0, 0.001]],
        ],
      },
    ],
  },
};

/** Species folded from panels; for Zia's modelled animals (SCANNED) these are only the stand-ins. */
export const ORIGAMI: Record<Exclude<Species, 'chicken'>, OrigamiDesign> = {
  fox: FOX,
  rabbit: RABBIT,
  crane: CRANE,
  frog: FROG,
  fish: FISH,
  cat: CAT,
  elephant: ELEPHANT,
};

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
 * Animals folded from Zia's own paper models. Each model's panels are
 * already sorted into five tones by its material names (`_deep`, `_warm`,
 * the plain one, `_light`, `_pale`), like the light and shaded halves of
 * the portal disc. The game keeps that sorting and repaints the five tones
 * evenly from one paper colour, with no lines between them.
 *
 * Per species: how tall it stands, the quarter turn that puts its head on
 * +X, where its flag goes (shares of its length from the tail, and of its
 * height), and where its eye sits (behind the front of the head and up).
 */
interface Scanned {
  height: number;
  turn: number;
  flag: [number, number];
  eye: [number, number];
}

const SCANNED: Partial<Record<Species, Scanned>> = {
  chicken: { height: 0.075, turn: Math.PI / 2, flag: [0.42, 0.62], eye: [0.12, 0.925] },
  cat: { height: 0.052, turn: Math.PI / 2, flag: [0.45, 0.7], eye: [0.14, 0.8] },
  rabbit: { height: 0.075, turn: Math.PI / 2, flag: [0.4, 0.5], eye: [0.12, 0.62] },
  elephant: { height: 0.055, turn: Math.PI / 2, flag: [0.45, 0.85], eye: [0.16, 0.72] },
};

/** Tone of each material suffix, darkest first. */
const TONE_ORDER = ['_deep', '_warm', '', '_light', '_pale'];

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

/** Which of the five tones a model material stands for. */
function toneOf(name: string): number {
  for (let i = TONE_ORDER.length - 1; i >= 0; i -= 1) {
    if (TONE_ORDER[i] && name.endsWith(TONE_ORDER[i])) return i;
  }
  return 2;
}

/** The eyes: a soft dark, not black, and small. */
const SCANNED_EYE = 0x5b4a3c;
const SCANNED_EYE_R = 0.0017;

let scannedPaper: MeshStandardMaterial | undefined;

const scannedShapes = new Map<string, { geo: BufferGeometry; flag: Vector3; eye: Vector3 }>();

/**
 * An animal from one of Zia's paper models, turned head towards +X, stood
 * on the table and sized like the others, every panel in its tone of
 * `color` (or of the model's own paper colour when `color` is null). Null
 * when the model did not load.
 */
function scannedShape(
  species: Species,
  spec: Scanned,
  color: number | null,
): { geo: BufferGeometry; flag: Vector3; eye: Vector3 } | null {
  const key = `${species}:${color}`;
  const known = scannedShapes.get(key);
  if (known) return known;
  const gltf = AssetManager.getGLTF(`foldling_${species}`);
  if (!gltf) return null;
  const pos: number[] = [];
  const tone: number[] = [];
  let own = 0xffffff;
  gltf.scene.updateMatrixWorld(true);
  // The body runs along Z in the file; a quarter turn puts the head on +X.
  const turn = new Matrix4().makeRotationY(spec.turn);
  gltf.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    const t = toneOf(mat.name ?? '');
    if (t === 2) own = mat.color.getHex();
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const m = new Matrix4().multiplyMatrices(turn, mesh.matrixWorld);
    const p = g.getAttribute('position');
    const v = new Vector3();
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      tone.push(t);
    }
    g.dispose();
  });
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
  const tones = fiveTones(color ?? own);
  const col: number[] = [];
  for (const t of tone) col.push(tones[t].r, tones[t].g, tones[t].b);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const length = (box.max.x - box.min.x) * k;
  const flag = new Vector3(-length / 2 + length * spec.flag[0], spec.height * spec.flag[1], 0);
  // The eye sits on the side of the head: behind its front, at its height,
  // on the paper nearest the viewer there.
  const top = spec.height;
  let headX = -Infinity;
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] > top * (spec.eye[1] - 0.1)) headX = Math.max(headX, pos[i]);
  const eye = new Vector3(headX - top * spec.eye[0], top * spec.eye[1], 0);
  for (let i = 0; i < pos.length; i += 3) {
    if (Math.abs(pos[i] - eye.x) < top * 0.03 && Math.abs(pos[i + 1] - eye.y) < top * 0.03) {
      eye.z = Math.max(eye.z, Math.abs(pos[i + 2]));
    }
  }
  const shape = { geo, flag, eye };
  scannedShapes.set(key, shape);
  return shape;
}

/**
 * Zia's animals keep their own paper colour (orange chicken and cat, brown
 * rabbit, blue elephant) when this is true; otherwise they take the
 * mission colour like the panel-folded animals.
 */
const SCANNED_OWN_COLOURS = true;

/**
 * An origami animal in `color`, head towards +X, feet at y 0, with its
 * clips and the point on its back where the flag goes.
 */
export function makeOrigami(
  species: Species,
  color: number,
): { model: Group; flag: Object3D; animations: AnimationClip[] } {
  const model = new Group();
  model.name = `origami-${species}`;
  const flag = new Object3D();
  flag.name = 'flag_anchor';
  const spec = SCANNED[species];
  const scanned = spec ? scannedShape(species, spec, SCANNED_OWN_COLOURS ? null : color) : null;
  if (spec && !scanned) console.error(`[art] foldling_${species} is not loaded; folding it from panels instead`);
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
    for (const side of [1, -1]) {
      const eye = new Mesh(new CircleGeometry(SCANNED_EYE_R, 10), paper(SCANNED_EYE));
      eye.name = 'eye';
      eye.position.set(scanned.eye.x, scanned.eye.y, side * (scanned.eye.z + 0.0006));
      if (side < 0) eye.rotation.y = Math.PI;
      body.add(eye);
    }
    model.add(body);
    flag.position.copy(scanned.flag);
    body.add(flag);
    return { model, flag, animations: clips(model) };
  }
  const design = species === 'chicken' ? ORIGAMI.fox : ORIGAMI[species];
  const body = build(species, design.body, color, [0, 0]);
  model.add(body);
  flag.position.set(design.flag[0], design.flag[1], 0);
  body.add(flag);
  return { model, flag, animations: clips(model) };
}
