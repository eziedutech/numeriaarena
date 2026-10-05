import { BoxGeometry, CylinderGeometry, Group, Mesh } from '@iwsdk/core';

import { paper, shade, tint } from './palette.js';

/**
 * Paper props for Balance Gate, Factory Sort and Bridge Builder: weights and
 * a balance, gates, planks and the two banks of a gap. Each stands on the
 * desk with its origin at the bottom middle. Stand-ins until the asset set
 * has its own.
 */

const WOOD = 0xd9b98c;

export const WEIGHT_H = 0.045;
export const GATE_W = 0.14;
export const GATE_H = 0.13;
export const PLANK_L = 0.08;
export const PLANK_T = 0.008;
export const BANK_H = 0.04;

function box(w: number, h: number, d: number, color: number): Mesh {
  return new Mesh(new BoxGeometry(w, h, d), paper(color));
}

/** A paper weight: a block with a handle on top. */
export function makeWeight(color: number): Group {
  const root = new Group();
  const body = box(0.05, WEIGHT_H * 0.8, 0.035, color);
  body.position.y = WEIGHT_H * 0.4;
  const handle = box(0.024, WEIGHT_H * 0.2, 0.008, shade(color));
  handle.position.y = WEIGHT_H * 0.9;
  root.add(body, handle);
  return root;
}

/** A gate: two posts and a lintel the gate's rule is written on. */
export function makeGate(color: number): Group {
  const root = new Group();
  for (const side of [-1, 1]) {
    const post = box(0.012, GATE_H, 0.012, shade(color));
    post.position.set((side * (GATE_W - 0.012)) / 2, GATE_H / 2, 0);
    root.add(post);
  }
  const lintel = box(GATE_W, 0.03, 0.014, tint(color, 0.2));
  lintel.position.y = GATE_H + 0.015;
  root.add(lintel);
  return root;
}

/** A plank; its board (`board`) is stretched to the length it stands for once laid. */
export function makePlank(color: number): Group {
  const root = new Group();
  const board = box(PLANK_L, PLANK_T, 0.03, tint(WOOD, 0.1));
  board.name = 'board';
  board.position.y = PLANK_T / 2;
  const stripe = box(PLANK_L, PLANK_T * 0.3, 0.006, color);
  stripe.position.y = PLANK_T / 2 + 0.0012;
  board.add(stripe);
  root.add(board);
  return root;
}

/** One bank of the gap a bridge crosses. */
export function makeBank(): Mesh {
  const bank = box(0.06, BANK_H, 0.06, shade(WOOD));
  bank.geometry.translate(0, BANK_H / 2, 0);
  return bank;
}

export interface Balance {
  root: Group;
  /** Tips with the pans: positive drops the left pan. */
  beam: Group;
  /** Where the left and right pans' cards sit, on the beam. */
  pans: [Group, Group];
}

export const BALANCE_H = 0.14;
const BEAM_W = 0.2;

/** A balance: a post, a beam that tips, and a pan at each end. */
export function makeBalance(): Balance {
  const root = new Group();
  const post = new Mesh(new CylinderGeometry(0.005, 0.008, BALANCE_H, 6), paper(shade(WOOD)));
  post.position.y = BALANCE_H / 2;
  const foot = new Mesh(new CylinderGeometry(0.03, 0.035, 0.008, 8), paper(WOOD));
  foot.position.y = 0.004;
  const beam = new Group();
  beam.position.y = BALANCE_H;
  beam.add(box(BEAM_W, 0.008, 0.01, WOOD));
  const pans: Group[] = [];
  for (const side of [-1, 1]) {
    const pan = new Group();
    pan.position.set((side * BEAM_W) / 2, -0.04, 0);
    const dish = new Mesh(new CylinderGeometry(0.035, 0.028, 0.006, 10), paper(tint(WOOD, 0.15)));
    pan.add(dish);
    const string = box(0.002, 0.04, 0.002, shade(WOOD));
    string.position.y = 0.02;
    pan.add(string);
    beam.add(pan);
    pans.push(pan);
  }
  root.add(post, foot, beam);
  return { root, beam, pans: [pans[0], pans[1]] };
}
