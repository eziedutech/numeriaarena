import {
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  type Material,
} from '@iwsdk/core';
import type { P3, Shape } from './measure-core.js';

/**
 * The paper objects Measure Hunt lays on the desk, cut to the size the core
 * chose: a flat shape lies on the desk, a solid stands on it. Each is built
 * in its own frame as the core counts it (centimetres there, metres here),
 * y up, standing on y = 0 and centred on x and z, so a pin placed in that
 * frame is measured the same whichever way the solid is turned. A box is
 * made of its six faces on hinges, so it can unfold into its net.
 */

export interface PaperObject {
  /** Stands on the desk; its spin turns about the object's middle. */
  readonly root: Group;
  readonly spin: Group;
  /** The object's own frame: pins go here. */
  readonly frame: Group;
  /** How far round its middle reaches, in metres. */
  readonly radius: number;
  readonly solid: boolean;
  /** A box opens to its net (1) and folds up again (0). */
  readonly unfold?: (u: number) => void;
  dispose(): void;
}

const PAPER = 0xfaf3e3;
const INK = 0x3a3f4b;
/** A flat shape lies this far over the desk, so the desk never shows through it. */
const LIFT = 0.0015;

const paperMat = new MeshStandardMaterial({ color: PAPER, roughness: 1, side: DoubleSide });
// A ball is seen through, so its middle can be looked for.
const glassMat = new MeshStandardMaterial({ color: 0xcfe3ff, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false, side: DoubleSide });
const lineMat = new LineBasicMaterial({ color: INK });
// The ring round a ball's middle, where the line is pinned and the ball's circumference is written: light, not black.
const ringMat = new LineBasicMaterial({ color: 0x6f9ee0, transparent: true, opacity: 0.85 });
const dotMat = new MeshStandardMaterial({ color: INK, roughness: 1 });

const m = (cm: number) => cm / 100;

export function paperObject(shape: Shape, size: Record<string, number>, keys: P3[]): PaperObject {
  const g = (k: string) => m(size[k] ?? 0);
  const root = new Group();
  root.name = `measure-paper-${shape}`;
  const spin = new Group();
  const frame = new Group();
  root.add(spin);
  spin.add(frame);
  const owned: { geometry: BufferGeometry }[] = [];
  const add = (parent: Group, geometry: BufferGeometry, mat: Material = paperMat, edges = true) => {
    const mesh = new Mesh(geometry, mat);
    // The paper itself: what a controller's ray points on.
    mesh.userData.paper = true;
    parent.add(mesh);
    owned.push(mesh);
    if (edges) {
      const line = new LineSegments(new EdgesGeometry(geometry, 30), lineMat);
      line.position.copy(mesh.position);
      parent.add(line);
      owned.push(line);
    }
    return mesh;
  };
  const dot = (parent: Group, x: number, y: number, z: number) => {
    const d = add(parent, new SphereGeometry(0.0015, 8, 6), dotMat, false);
    d.position.set(x, y, z);
  };
  let height = 0;
  let reach = 0;
  let unfold: ((u: number) => void) | undefined;
  switch (shape) {
    case 'square':
    case 'rectangle': {
      const w = shape === 'square' ? g('s') : g('p');
      const d = shape === 'square' ? g('s') : g('l');
      add(frame, new PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, LIFT, 0));
      reach = Math.hypot(w, d) / 2;
      break;
    }
    case 'triangle': {
      const tri = new BufferGeometry();
      tri.setAttribute('position', new Float32BufferAttribute(keys.slice(0, 3).flatMap(([x, , z]) => [m(x), LIFT, m(z)]), 3));
      tri.computeVertexNormals();
      add(frame, tri);
      reach = Math.max(...keys.slice(0, 3).map(([x, , z]) => Math.hypot(m(x), m(z))));
      break;
    }
    case 'circle': {
      const r = g('r');
      add(frame, new CircleGeometry(r, 64).rotateX(-Math.PI / 2).translate(0, LIFT, 0));
      // The compass's point left its hole at the middle.
      dot(frame, 0, LIFT, 0);
      reach = r;
      break;
    }
    case 'cylinder': {
      const r = g('r');
      height = g('t');
      add(frame, new CylinderGeometry(r, r, height, 64).translate(0, height / 2, 0));
      dot(frame, 0, height + 0.0005, 0);
      reach = Math.hypot(r, height / 2);
      break;
    }
    case 'sphere': {
      const d = 2 * g('r');
      height = d;
      add(frame, new SphereGeometry(d / 2, 40, 24).translate(0, d / 2, 0), glassMat, false);
      // One line round its middle, so the ball is seen turning.
      const ring = new LineSegments(new EdgesGeometry(new CircleGeometry(d / 2 + 0.0005, 64), 1), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = d / 2;
      frame.add(ring);
      owned.push(ring);
      reach = d / 2;
      break;
    }
    case 'cube':
    case 'cuboid': {
      const w = shape === 'cube' ? g('s') : g('p');
      const d = shape === 'cube' ? g('s') : g('l');
      height = shape === 'cube' ? g('s') : g('t');
      unfold = boxNet(frame, w, d, height, add);
      reach = Math.hypot(w, d, height) / 2;
      break;
    }
  }
  // The solid turns about its middle, its frame standing on the desk when it is not turned.
  spin.position.y = height / 2;
  frame.position.y = -height / 2;
  return {
    root,
    spin,
    frame,
    radius: reach,
    solid: height > 0,
    unfold,
    dispose: () => {
      for (const o of owned) o.geometry.dispose();
      root.removeFromParent();
    },
  };
}

/**
 * A box of six faces: the bottom on the desk, the four sides hinged on its
 * edges and the top hinged on the back's top edge. Unfolding lays the sides
 * flat round the bottom and the top past the back, the cross of its net.
 */
function boxNet(
  frame: Group,
  w: number,
  d: number,
  h: number,
  add: (parent: Group, geometry: BufferGeometry) => Mesh,
): (u: number) => void {
  add(frame, new PlaneGeometry(w, d).rotateX(-Math.PI / 2));
  const hinge = (x: number, z: number) => {
    const p = new Group();
    p.position.set(x, 0, z);
    frame.add(p);
    return p;
  };
  const front = hinge(0, d / 2);
  add(front, new PlaneGeometry(w, h).translate(0, h / 2, 0));
  const back = hinge(0, -d / 2);
  add(back, new PlaneGeometry(w, h).translate(0, h / 2, 0));
  const right = hinge(w / 2, 0);
  add(right, new PlaneGeometry(d, h).rotateY(Math.PI / 2).translate(0, h / 2, 0));
  const left = hinge(-w / 2, 0);
  add(left, new PlaneGeometry(d, h).rotateY(Math.PI / 2).translate(0, h / 2, 0));
  const top = new Group();
  top.position.set(0, h, 0);
  back.add(top);
  add(top, new PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(0, 0, d / 2));
  return (u: number) => {
    const a = (u * Math.PI) / 2;
    front.rotation.x = a;
    back.rotation.x = -a;
    right.rotation.z = -a;
    left.rotation.z = a;
    top.rotation.x = -a;
  };
}
