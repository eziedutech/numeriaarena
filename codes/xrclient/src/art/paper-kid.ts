import { Group } from '@iwsdk/core';

import { Builder, KID_DESK_TOP, chair } from './rooms.js';

/**
 * Folded paper people for the virtual classroom: a seated classmate with
 * its own chair, a sheet and a pencil, or the standing teacher. Each moving
 * part is its own pivot, so a figure is a few draw calls and its poses are
 * only rotations. A figure faces -Z (towards the board) from its origin on
 * the floor: the middle of the chair seat, or between the teacher's feet.
 */
export interface PaperFigure {
  root: Group;
  /** Turns at the neck: x nods (negative looks down), y turns. */
  head: Group;
  /** At the shoulders, the arm hanging along -Y: x swings it forward (positive) and up, z out to the side. */
  armL: Group;
  armR: Group;
  /** The teacher's legs, swinging about the hips while walking. */
  legL?: Group;
  legR?: Group;
}

const SKIN = 0xf6e3c0;
const INK = 0x3a3f4b;
const CHEEK = 0xf2a19c;
const PAPER = 0xfff8ec;
const SHOE = 0x4a4f5c;
const HAIRS = [0x3a3f4b, 0x6b4a3a, 0x8a5a3c, 0x2f3340];

export interface KidLook {
  /** The shirt, folded from coloured paper. */
  shirt: number;
  /** The kid's own chair. */
  chair: number;
  hair: number;
  /** Folded side tufts instead of a short cut. */
  tufts?: boolean;
}

/** A pivot group at x, y, z holding what `draw` adds around its own origin. */
function part(name: string, seed: number, x: number, y: number, z: number, draw: (b: Builder) => void): Group {
  const b = new Builder(seed);
  draw(b);
  const g = b.build(name);
  g.position.set(x, y, z);
  return g;
}

/** A head about `s` m across from the neck up: a folded square face, hair, two eyes and cheeks. */
function drawHead(b: Builder, s: number, hair: number, tufts: boolean): void {
  b.box(SKIN, s * 0.92, s * 0.06, s * 0.6, 0, s * 0.03, 0);
  b.box(SKIN, s, s * 0.9, s * 0.86, 0, s * 0.5, 0);
  // The fold down the middle of the face, a hair proud of it.
  b.box(0xeed6ad, s * 0.02, s * 0.5, s * 0.02, 0, s * 0.42, -s * 0.435);
  b.box(hair, s * 1.06, s * 0.26, s * 0.92, 0, s * 0.92, 0.01, 0, -0.05);
  b.box(hair, s * 1.04, s * 0.6, s * 0.18, 0, s * 0.62, s * 0.38);
  if (tufts) {
    b.box(hair, s * 0.16, s * 0.34, s * 0.3, -s * 0.56, s * 0.7, s * 0.12, 0, 0, 0.35);
    b.box(hair, s * 0.16, s * 0.34, s * 0.3, s * 0.56, s * 0.7, s * 0.12, 0, 0, -0.35);
  } else {
    b.box(hair, s * 0.5, s * 0.14, s * 0.2, -s * 0.2, s * 0.8, -s * 0.38, 0, 0.2, 0.2);
  }
  for (const side of [-1, 1]) {
    b.box(INK, s * 0.09, s * 0.13, s * 0.02, side * s * 0.21, s * 0.5, -s * 0.435);
    b.box(CHEEK, s * 0.13, s * 0.07, s * 0.02, side * s * 0.3, s * 0.34, -s * 0.432);
  }
  b.box(INK, s * 0.14, s * 0.025, s * 0.02, 0, s * 0.25, -s * 0.435);
}

/** An arm of length `len` hanging from its shoulder pivot, its sleeve in the shirt's colour. */
function drawArm(b: Builder, len: number, w: number, shirt: number, pencil: boolean): void {
  b.box(shirt, w * 1.25, len * 0.42, w * 1.25, 0, -len * 0.2, 0);
  b.box(SKIN, w, len * 0.6, w, 0, -len * 0.68, 0);
  b.box(SKIN, w * 1.2, w * 1.1, w * 1.3, 0, -len, 0);
  if (pencil) {
    b.cylinder(0xf9c74f, w * 0.12, len * 0.34, 0, -len * 1.08, -w * 0.4, 0.5, 6);
    b.cylinder(INK, w * 0.08, len * 0.06, 0, -len * 1.23, -w * 0.48, 0.5, 6);
  }
}

/**
 * A classmate sitting at a desk ahead of it (the desk top at KID_DESK_TOP,
 * its near edge 0.13 m ahead), writing on a sheet.
 */
export function paperKid(look: KidLook, seed: number): PaperFigure {
  const root = new Group();
  root.name = 'paper-kid';
  const body = part('paper-kid-body', seed, 0, 0, 0, (b) => {
    chair(b, 0, 0.02, 0, look.chair);
    // Seated: shorts over the seat, the legs bent down to the floor, shoes.
    b.box(0x5a6a8a, 0.27, 0.1, 0.34, 0, 0.485, -0.07);
    for (const side of [-1, 1]) {
      b.box(SKIN, 0.075, 0.38, 0.075, side * 0.075, 0.25, -0.22);
      b.box(PAPER, 0.08, 0.06, 0.08, side * 0.075, 0.07, -0.22);
      b.box(SHOE, 0.085, 0.05, 0.14, side * 0.075, 0.025, -0.25);
    }
    // The shirt, a folded paper trapezoid leaning to the desk, and a white collar.
    b.box(look.shirt, 0.28, 0.34, 0.17, 0, 0.71, 0.02, 0, -0.12);
    b.box(look.shirt, 0.24, 0.06, 0.15, 0, 0.88, 0.0, 0, -0.12);
    b.box(PAPER, 0.07, 0.07, 0.01, -0.035, 0.87, -0.075, 0, -0.12, 0.6);
    b.box(PAPER, 0.07, 0.07, 0.01, 0.035, 0.87, -0.075, 0, -0.12, -0.6);
    // The sheet on the desk, a little turned.
    b.box(PAPER, 0.21, 0.003, 0.28, 0.03, KID_DESK_TOP + 0.002, -0.33, 0.12);
  });
  root.add(body);
  const head = part('paper-kid-head', seed + 1, 0, 0.9, -0.02, (b) => drawHead(b, 0.2, look.hair, !!look.tufts));
  const armL = part('paper-kid-arm', seed + 2, -0.165, 0.85, 0, (b) => drawArm(b, 0.34, 0.05, look.shirt, false));
  const armR = part('paper-kid-arm', seed + 3, 0.165, 0.85, 0, (b) => drawArm(b, 0.34, 0.05, look.shirt, true));
  root.add(head, armL, armR);
  return { root, head, armL, armR };
}

/** The teacher: a grown-up of folded paper standing about 1.65 m, in a long cardigan. */
export function paperTeacher(seed: number): PaperFigure {
  const coat = 0xb198ea;
  const root = new Group();
  root.name = 'paper-teacher';
  const body = part('paper-teacher-body', seed, 0, 0, 0, (b) => {
    b.box(0x5a6a8a, 0.34, 0.12, 0.2, 0, 0.88, 0);
    b.box(PAPER, 0.32, 0.4, 0.2, 0, 1.15, 0.0);
    b.box(coat, 0.13, 0.62, 0.22, -0.13, 1.08, 0.0, 0, 0, 0.04);
    b.box(coat, 0.13, 0.62, 0.22, 0.13, 1.08, 0.0, 0, 0, -0.04);
    b.box(coat, 0.36, 0.5, 0.06, 0, 1.12, 0.09);
    b.box(coat, 0.4, 0.08, 0.22, 0, 1.4, 0);
  });
  const legL = part('paper-teacher-leg', seed + 4, -0.08, 0.86, 0, (b) => {
    b.box(0x5a6a8a, 0.1, 0.8, 0.11, 0, -0.42, 0);
    b.box(SHOE, 0.11, 0.07, 0.2, 0, -0.825, -0.04);
  });
  const legR = part('paper-teacher-leg', seed + 5, 0.08, 0.86, 0, (b) => {
    b.box(0x5a6a8a, 0.1, 0.8, 0.11, 0, -0.42, 0);
    b.box(SHOE, 0.11, 0.07, 0.2, 0, -0.825, -0.04);
  });
  const head = part('paper-teacher-head', seed + 1, 0, 1.46, 0, (b) => {
    b.box(SKIN, 0.07, 0.06, 0.07, 0, 0.03, 0);
    drawHead(b, 0.22, HAIRS[1], true);
  });
  const armL = part('paper-teacher-arm', seed + 2, -0.23, 1.4, 0, (b) => drawArm(b, 0.56, 0.065, coat, false));
  const armR = part('paper-teacher-arm', seed + 3, 0.23, 1.4, 0, (b) => drawArm(b, 0.56, 0.065, coat, true));
  root.add(body, legL, legR, head, armL, armR);
  return { root, head, armL, armR, legL, legR };
}

export const KID_HAIRS = HAIRS;
