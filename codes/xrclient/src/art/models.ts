import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  OctahedronGeometry,
} from '@iwsdk/core';

import { INK, PAPER, PAPER_SHADE, paper } from './palette.js';

/** Builds a flat-shaded mesh from a list of triangles (9 numbers each). */
function folded(tris: number[], color: number): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return new Mesh(g, paper(color, { doubleSide: true }));
}

/**
 * Open pop-up book lying on the table: two covers, page stacks, and a small
 * folded town rising from the gutter. Origin at the table surface, spine
 * along X, reader on +Z.
 */
export function makeBook(): Group {
  const book = new Group();
  book.name = 'popup-book';
  const cover = paper(0x3d5a80);
  const pages = paper(PAPER);
  for (const side of [-1, 1]) {
    const c = new Mesh(new BoxGeometry(0.17, 0.006, 0.22), cover);
    c.position.set(side * 0.088, 0.003, 0);
    const p = new Mesh(new BoxGeometry(0.16, 0.012, 0.205), pages);
    p.position.set(side * 0.086, 0.012, 0);
    book.add(c, p);
  }
  // Fold Town: three paper houses standing up from the pages.
  const houses = [
    [-0.07, 0.035, 0xe07a5f],
    [0.0, 0.05, 0x81b29a],
    [0.07, 0.04, 0xf2cc8f],
  ] as const;
  for (const [x, h, color] of houses) {
    const w = 0.028;
    const tris = [
      // front wall with a pointed roof
      -w, 0, 0, w, 0, 0, w, h, 0,
      -w, 0, 0, w, h, 0, -w, h, 0,
      -w, h, 0, w, h, 0, 0, h + 0.022, 0,
    ];
    const house = folded(tris, color);
    house.position.set(x, 0.018, -0.05 + Math.abs(x) * 0.3);
    house.rotation.x = -0.12;
    book.add(house);
  }
  return book;
}

/**
 * A Foldling: an origami fox-like creature with a number flag on its back.
 * Returns the group and the flag anchor where a label is attached.
 */
export function makeFoldling(color: number): { root: Group; flag: Group } {
  const root = new Group();
  root.name = 'foldling';
  const s = 0.9;
  const body = folded(
    [
      // two slanted body sheets meeting at a ridge
      -0.03, 0, -0.025, 0.035, 0, -0.025, 0.0, 0.045, 0,
      -0.03, 0, 0.025, 0.0, 0.045, 0, 0.035, 0, 0.025,
      -0.03, 0, -0.025, 0.0, 0.045, 0, -0.03, 0, 0.025,
      0.035, 0, -0.025, 0.035, 0, 0.025, 0.0, 0.045, 0,
    ].map((v) => v * s * 1.6),
    color,
  );
  const head = folded(
    [
      0.05, 0.05, -0.022, 0.05, 0.05, 0.022, 0.095, 0.045, 0,
      0.05, 0.05, -0.022, 0.068, 0.095, -0.012, 0.05, 0.05, 0.022,
      0.05, 0.05, 0.022, 0.068, 0.095, 0.012, 0.095, 0.045, 0,
      0.05, 0.05, -0.022, 0.095, 0.045, 0, 0.068, 0.095, -0.012,
    ].map((v) => v * s * 1.3),
    color,
  );
  const tail = folded([-0.045, 0.02, 0, -0.1, 0.07, -0.006, -0.085, 0.03, 0.008], PAPER_SHADE);
  const eye = new Mesh(new OctahedronGeometry(0.004, 0), paper(INK));
  eye.position.set(0.1, 0.085, 0.012);
  const eye2 = eye.clone();
  eye2.position.z = -0.012;
  const pole = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.09, 5), paper(INK));
  pole.position.set(-0.01, 0.1, 0);
  const flag = new Group();
  flag.position.set(-0.01, 0.16, 0);
  root.add(body, head, tail, eye, eye2, pole, flag);
  return { root, flag };
}

/** Paper bird a Foldling folds into when answered. */
export function makeBird(color: number): Group {
  const g = new Group();
  g.name = 'paper-bird';
  const wings = folded(
    [
      0, 0, -0.03, 0, 0, 0.03, 0.05, 0.002, 0,
      0, 0, -0.03, -0.02, 0.03, 0.06, 0, 0, 0.03,
      0, 0, -0.03, 0, 0, 0.03, -0.02, 0.03, -0.06,
    ],
    color,
  );
  g.add(wings);
  return g;
}

/** Balloon with a short string; origin at the string's end. */
export function makeBalloon(color: number): Group {
  const g = new Group();
  g.name = 'balloon';
  const skin = new Mesh(new IcosahedronGeometry(0.03, 1), paper(color));
  skin.scale.set(1, 1.18, 1);
  skin.position.y = 0.075;
  skin.name = 'balloon-skin';
  const string = new Mesh(new CylinderGeometry(0.0008, 0.0008, 0.045, 4), paper(INK));
  string.position.y = 0.022;
  g.add(skin, string);
  return g;
}

/** A number crystal; origin at its centre. */
export function makeCrystal(color: number): Mesh {
  const m = new Mesh(new OctahedronGeometry(0.022, 0), paper(color, { emissive: 0x111111 }));
  m.scale.set(1, 1.35, 1);
  m.name = 'crystal';
  return m;
}

/** An orb made from merged crystals. */
export function makeOrb(color: number): Mesh {
  const m = new Mesh(new IcosahedronGeometry(0.026, 1), paper(color, { emissive: 0x222222 }));
  m.name = 'orb';
  return m;
}

/**
 * An upright paper card that stands on the table, poked from the front.
 * Origin at its centre; the front face is +Z.
 */
export function makeButton(color: number): Mesh {
  const m = new Mesh(new BoxGeometry(0.1, 0.065, 0.012), paper(color));
  m.name = 'button';
  return m;
}
