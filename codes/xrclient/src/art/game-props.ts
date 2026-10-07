import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, Quaternion, SphereGeometry, TorusGeometry, Vector3 } from '@iwsdk/core';

import { GOLD, PAPER, WRONG, paper, shade, tint } from './palette.js';

/**
 * Paper props for Balance Gate, Factory Sort and Bridge Builder: weights and
 * a balance, gates, planks and the two banks of a gap. Each stands on the
 * desk with its origin at the bottom middle. Stand-ins until the asset set
 * has its own.
 */

const WOOD = 0xd9b98c;
/** The bridge's stone piers and the grass and trees on them. */
const STONE = 0x9fb0c4;
const GRASS = 0x7cc06a;
const LEAF = 0x5aa469;
/** The parcel weighed on the balance's left pan, and its ribbon. */
const KRAFT = 0xd9a066;
const RIBBON = 0xf2716b;

export const WEIGHT_H = 0.045;
export const GATE_W = 0.14;
export const GATE_H = 0.13;
export const PLANK_L = 0.08;
export const PLANK_T = 0.008;
export const BANK_H = 0.04;

function box(w: number, h: number, d: number, color: number): Mesh {
  return new Mesh(new BoxGeometry(w, h, d), paper(color));
}

function cyl(top: number, bottom: number, h: number, sides: number, color: number): Mesh {
  return new Mesh(new CylinderGeometry(top, bottom, h, sides), paper(color));
}

/** A thin paper rod from `a` to `b`. */
function rod(a: Vector3, b: Vector3, t: number, color: number): Mesh {
  const d = new Vector3().subVectors(b, a);
  const m = box(t, d.length(), t, color);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.normalize()));
  return m;
}

/** A paper weight as a shop's scale has them: a round body, a band, and a ring handle. */
export function makeWeight(color: number): Group {
  const root = new Group();
  const bodyH = WEIGHT_H * 0.55;
  const body = cyl(0.019, 0.026, bodyH, 8, color);
  body.position.y = bodyH / 2;
  const band = cyl(0.0266, 0.0266, 0.004, 8, shade(color));
  band.position.y = 0.004;
  const neck = cyl(0.008, 0.011, 0.005, 8, shade(color));
  neck.position.y = bodyH + 0.0025;
  const handle = new Mesh(new TorusGeometry(0.009, 0.0028, 6, 12), paper(shade(color)));
  handle.position.y = bodyH + 0.005 + 0.008;
  // A light patch on its front, where the paper catches the lamp.
  const shine = box(0.006, bodyH * 0.6, 0.002, tint(color, 0.45));
  shine.position.set(-0.007, bodyH * 0.5, 0.0215);
  shine.rotation.x = -0.25;
  root.add(body, band, neck, handle, shine);
  return root;
}

const GATE_PILLAR = 0.02;
const GATE_SLATS = 6;

/**
 * A factory gate: two pillars, a roll-up door striped in the gate's colour
 * filling the whole opening (so all of it takes a touch), the sign the
 * gate's rule is written on, a roof and a chimney with two puffs of smoke.
 */
export function makeGate(color: number): Group {
  const root = new Group();
  const inner = GATE_W - 2 * GATE_PILLAR;
  for (const side of [-1, 1]) {
    const x = (side * (GATE_W - GATE_PILLAR)) / 2;
    const pillar = box(GATE_PILLAR, GATE_H, GATE_PILLAR + 0.004, shade(color));
    pillar.position.set(x, GATE_H / 2, 0);
    const base = box(GATE_PILLAR + 0.008, 0.012, GATE_PILLAR + 0.012, shade(shade(color)));
    base.position.set(x, 0.006, 0);
    root.add(pillar, base);
  }
  // The door: a backing so the gaps take a ray too, and its slats over it.
  const back = box(inner, GATE_H, 0.002, shade(tint(color, 0.3)));
  back.position.set(0, GATE_H / 2, -0.005);
  root.add(back);
  const slat = GATE_H / GATE_SLATS;
  for (let i = 0; i < GATE_SLATS; i += 1) {
    const s = box(inner, slat * 0.9, 0.004, tint(color, i % 2 ? 0.6 : 0.42));
    s.position.set(0, slat * (i + 0.5), -0.002);
    root.add(s);
  }
  // A handle at the door's foot.
  const pull = box(0.03, 0.005, 0.004, shade(color));
  pull.position.set(0, slat * 0.5, 0.001);
  root.add(pull);
  const lintel = box(GATE_W + 0.012, 0.03, 0.016, tint(color, 0.2));
  lintel.position.y = GATE_H + 0.015;
  root.add(lintel);
  // The roof: a ridge along the sign's top, half of it hidden behind the sign.
  const roof = box(GATE_W + 0.02, 0.022, 0.022, shade(color));
  roof.position.set(0, GATE_H + 0.03, -0.004);
  roof.rotation.x = Math.PI / 4;
  const chimney = box(0.014, 0.04, 0.014, shade(shade(color)));
  chimney.position.set(GATE_W * 0.32, GATE_H + 0.045, -0.006);
  root.add(roof, chimney);
  [
    [0.007, 0.072, 0],
    [0.005, 0.088, 0.008],
  ].forEach(([r, y, dx]) => {
    const puff = new Mesh(new SphereGeometry(r, 7, 5), paper(PAPER));
    puff.position.set(GATE_W * 0.32 + dx, GATE_H + y, -0.006);
    root.add(puff);
  });
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

/**
 * One bank of the gap a bridge crosses: a pier of three courses of stone,
 * the middle one in two blocks, grass on top and a small paper tree at its
 * back on the outer side (`side` -1 for the left bank, 1 for the right).
 */
export function makeBank(side: number): Group {
  const root = new Group();
  const course = (BANK_H - 0.004) / 3;
  const low = box(0.066, course, 0.066, shade(STONE));
  low.position.y = course / 2;
  root.add(low);
  for (const k of [-1, 1]) {
    const mid = box(0.0305, course, 0.062, k < 0 ? STONE : tint(STONE, 0.12));
    mid.position.set(k * 0.0158, course * 1.5, 0);
    root.add(mid);
  }
  const top = box(0.064, course, 0.064, tint(STONE, 0.25));
  top.position.y = course * 2.5;
  const grass = box(0.066, 0.004, 0.066, GRASS);
  grass.position.y = BANK_H - 0.002;
  root.add(top, grass);
  const trunk = box(0.004, 0.012, 0.004, shade(WOOD));
  trunk.position.set(side * 0.018, BANK_H + 0.006, -0.018);
  root.add(trunk);
  [
    [0.013, 0.022, 0.019],
    [0.009, 0.018, 0.031],
  ].forEach(([r, h, y], i) => {
    const leaves = new Mesh(new ConeGeometry(r, h, 7), paper(i ? tint(LEAF, 0.15) : LEAF));
    leaves.position.set(side * 0.018, BANK_H + y, -0.018);
    root.add(leaves);
  });
  return root;
}

export interface Balance {
  root: Group;
  /** Tips with the pans: positive drops the left pan. */
  beam: Group;
  /** The two pans, hung from the beam's ends; turned against its tip to hang level. */
  pans: [Group, Group];
}

export const BALANCE_H = 0.14;
const BEAM_W = 0.2;
/** A pan's dish, and how far under the beam it hangs on its three strings. */
const PAN_R = 0.035;
const PAN_HANG = 0.045;
/** The dish's top, where a parcel or a weight stands on a pan. */
export const PAN_TOP = 0.0035;
/** In front of a pan's front strings, where its card is. */
export const PAN_CARD_Z = PAN_R + 0.01;

/**
 * A balance: a stepped foot and post, a beam with brass ends that tips, a
 * red needle over a dial showing when it is level, and at each end a brass
 * dish on three strings.
 */
export function makeBalance(): Balance {
  const root = new Group();
  const foot = cyl(0.04, 0.046, 0.01, 10, shade(WOOD));
  foot.position.y = 0.005;
  const step = cyl(0.026, 0.031, 0.008, 10, tint(WOOD, 0.12));
  step.position.y = 0.014;
  const postH = BALANCE_H - 0.018;
  const post = cyl(0.006, 0.009, postH, 8, shade(WOOD));
  post.position.y = 0.018 + postH / 2;
  // The dial: an arc over the pivot, a tick at its top.
  const dial = new Mesh(new TorusGeometry(0.03, 0.0016, 3, 14, Math.PI / 3), paper(shade(GOLD)));
  dial.position.set(0, BALANCE_H, -0.008);
  dial.rotation.z = Math.PI / 2 - Math.PI / 6;
  const tick = box(0.0024, 0.008, 0.002, shade(GOLD));
  tick.position.set(0, BALANCE_H + 0.03, -0.008);
  const pivot = new Mesh(new SphereGeometry(0.009, 8, 6), paper(GOLD));
  pivot.position.y = BALANCE_H;
  const beam = new Group();
  beam.position.y = BALANCE_H;
  beam.add(box(BEAM_W, 0.008, 0.01, WOOD));
  const needle = box(0.003, 0.026, 0.003, WRONG);
  needle.position.set(0, 0.016, -0.003);
  beam.add(needle);
  const pans: Group[] = [];
  for (const side of [-1, 1]) {
    const end = new Mesh(new SphereGeometry(0.007, 8, 6), paper(GOLD));
    end.position.x = (side * BEAM_W) / 2;
    beam.add(end);
    const pan = new Group();
    pan.position.set((side * BEAM_W) / 2, -PAN_HANG, 0);
    const dish = cyl(PAN_R, PAN_R * 0.75, 0.007, 12, tint(GOLD, 0.35));
    pan.add(dish);
    const hook = new Vector3(0, PAN_HANG, 0);
    // Two strings in front at the sides and one at the back, so none crosses the card.
    for (const a of [Math.PI / 6, (5 * Math.PI) / 6, (3 * Math.PI) / 2]) {
      pan.add(rod(hook, new Vector3(PAN_R * 0.9 * Math.cos(a), PAN_TOP, PAN_R * 0.9 * Math.sin(a)), 0.0015, shade(WOOD)));
    }
    beam.add(pan);
    pans.push(pan);
  }
  root.add(foot, step, post, dial, tick, pivot, beam);
  return { root, beam, pans: [pans[0], pans[1]] };
}

/** What is weighed on the balance's left pan: a paper parcel tied with a ribbon and a bow. */
export function makeParcel(): Group {
  const root = new Group();
  const w = 0.034;
  const h = 0.026;
  const parcel = box(w, h, w * 0.8, KRAFT);
  parcel.position.y = h / 2;
  const across = box(w + 0.001, h + 0.001, 0.005, RIBBON);
  across.position.y = h / 2;
  const along = box(0.005, h + 0.001, w * 0.8 + 0.001, RIBBON);
  along.position.y = h / 2;
  root.add(parcel, across, along);
  for (const side of [-1, 1]) {
    const loop = box(0.012, 0.004, 0.008, RIBBON);
    loop.position.set(side * 0.006, h + 0.003, 0);
    loop.rotation.z = side * 0.5;
    root.add(loop);
  }
  return root;
}
