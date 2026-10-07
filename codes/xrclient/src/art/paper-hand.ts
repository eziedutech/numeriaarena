import { DoubleSide, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector2 } from '@iwsdk/core';

/**
 * The pointing hand that shows a first-time player what to do: a cut of
 * paper in the shape of a hand with the index finger out, the three folded
 * fingers and the thumb a shade deeper (flat tones, lit from the top left,
 * no outlines), and a soft warm shadow down and to the right.
 *
 * It lies flat with its face up and the finger pointing away from the
 * player (-Z); the fingertip sits at `TIP`, where the old box hand had it,
 * so the code that moves the hand aims it the same way.
 */

/** Silhouette in millimetres, finger up (+Y), drawn as the player sees the back of a right hand. */
const OUTLINE: [number, number][] = [
  [-10, 66], [-7, 75], [-1, 75], [2, 66], [2, 40],
  [5, 44], [12, 44], [14, 38], [17, 40], [23, 39], [25, 33], [27, 33], [31, 30], [31, 22],
  [29, 6], [24, 0], [-8, 0], [-12, 10],
  [-22, 22], [-24, 30], [-19, 33], [-12, 26], [-10, 40],
];
/** The folded middle, ring and little fingers. */
const KNUCKLES: [number, number][] = [
  [2, 40], [5, 44], [12, 44], [14, 38], [17, 40], [23, 39], [25, 33], [27, 33], [31, 30], [31, 22], [14, 25], [2, 30],
];
/** The thumb, folded in towards the palm. */
const THUMB: [number, number][] = [[-12, 10], [-22, 22], [-24, 30], [-19, 33], [-12, 26]];
/** The finger's fold, a shade down its right half. */
const FINGER_SIDE: [number, number][] = [[-4, 75], [-1, 75], [2, 66], [2, 40], [-4, 42]];

const MM = 0.00085;
const TIP_MM: [number, number] = [-4, 75];
const TIP = { x: 0.004, y: 0.006, z: -0.042 };

const PAPER = 0xfff8ec;
const SHADE = 0xf3e6c9;
const DEEP = 0xe2d0aa;
const SHADOW = 0x46321a;

function sheet(points: [number, number][], color: number, opacity = 1): Mesh {
  const shape = new Shape(points.map(([x, y]) => new Vector2(x * MM, y * MM)));
  const mat = new MeshBasicMaterial({
    color,
    side: DoubleSide,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });
  return new Mesh(new ShapeGeometry(shape), mat);
}

export function makePaperHand(name: string): Group {
  const hand = new Group();
  hand.name = name;
  // The cut, lying flat: its +Y (the finger) turns to -Z, its face to +Y.
  const cut = new Group();
  cut.rotation.x = -Math.PI / 2;
  cut.position.set(TIP.x - TIP_MM[0] * MM, TIP.y, TIP.z + TIP_MM[1] * MM);
  const shadow = sheet(OUTLINE, SHADOW, 0.22);
  shadow.position.set(2.5 * MM, -3.5 * MM, -0.0012);
  const base = sheet(OUTLINE, PAPER);
  const side = sheet(FINGER_SIDE, SHADE);
  side.position.z = 0.0004;
  const knuckles = sheet(KNUCKLES, SHADE);
  knuckles.position.z = 0.0004;
  const thumb = sheet(THUMB, DEEP);
  thumb.position.z = 0.0006;
  cut.add(shadow, base, side, knuckles, thumb);
  hand.add(cut);
  hand.traverse((o) => {
    o.renderOrder = 11;
  });
  return hand;
}
