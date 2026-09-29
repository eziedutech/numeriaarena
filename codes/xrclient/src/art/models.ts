import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  AssetManager,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LoopOnce,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
} from '@iwsdk/core';

import { INK, PAPER, PAPER_SHADE, paper, shade } from './palette.js';

// ------------------------------------------------------------ origami models

/** Imported number flag, sized to the procedural Foldling. */
const FLAG_SCALE = 1.25;
const BIRD_SCALE = 1.5;

/** Mixers of every animated model on the desk; the game advances them each frame. */
export const mixers = new Set<AnimationMixer>();

/** Stops animating a model that is being removed. */
export function forgetMixers(obj: Object3D): void {
  obj.traverse((o) => {
    const m = o.userData.mixer as AnimationMixer | undefined;
    if (m) {
      m.stopAllAction();
      mixers.delete(m);
    }
  });
}

/**
 * A model with its own animation mixer. Clips come from the file (`flap` for
 * the bird, `wave` for the flag, `idle`, `wave`, `cheer`, `help` for robots).
 */
export interface Figure {
  root: Group;
  /** Where the game draws the number. */
  flag: Object3D;
  play(clip: string, once?: boolean): AnimationAction | undefined;
}

/** A clone of a registered model, or null (reported) when it did not load. */
function loadModel(id: string): { scene: Group; animations: AnimationClip[] } | null {
  const gltf = AssetManager.getGLTF(id);
  if (!gltf) {
    console.error(`[art] model ${id} is not loaded; drawing the procedural stand-in`);
    return null;
  }
  return { scene: gltf.scene as Group, animations: gltf.animations };
}

const recoloured = new Map<string, Material>();

/**
 * Paints `color` over one palette key of a model (`from` and `from_shade`).
 * Materials in the asset set are named after palette keys.
 */
function recolour(root: Object3D, from: string, color: number): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    const shaded = mat.name === `${from}_shade`;
    if (mat.name !== from && !shaded) return;
    const key = `${mat.name}:${color}`;
    let m = recoloured.get(key) as MeshStandardMaterial | undefined;
    if (!m) {
      m = mat.clone();
      m.color.setHex(shaded ? shade(color) : color);
      recoloured.set(key, m);
    }
    mesh.material = m;
  });
}

/**
 * Wraps an animated model; the mixer is registered while the model lives.
 * A clip played once returns to `rest` when it ends.
 */
function figure(root: Group, flag: Object3D, model: Object3D, clips: AnimationClip[], rest?: string): Figure {
  const mixer = clips.length > 0 ? new AnimationMixer(model) : undefined;
  let current: AnimationAction | undefined;
  if (mixer) {
    model.userData.mixer = mixer;
    mixers.add(mixer);
  }
  const fig: Figure = {
    root,
    flag,
    play(name, once = false) {
      const clip = clips.find((c) => c.name === name);
      if (!mixer || !clip) return undefined;
      const action = mixer.clipAction(clip);
      action.reset();
      if (once) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      if (current && current !== action) action.crossFadeFrom(current, 0.15, false);
      action.play();
      current = action;
      return action;
    },
  };
  if (mixer && rest) mixer.addEventListener('finished', () => fig.play(rest));
  return fig;
}

/** A static model wrapped in a group, optionally recoloured; null when missing. */
function staticModel(id: string, name: string, from?: string, color?: number): Group | null {
  const loaded = loadModel(id);
  if (!loaded) return null;
  if (from && color !== undefined) recolour(loaded.scene, from, color);
  const g = new Group();
  g.name = name;
  g.add(loaded.scene);
  return g;
}

/**
 * A Foldling in `color` carrying a number flag, head towards +X, origin on
 * the table. The body stays procedural until the origami species are final;
 * the flag is the origami `flag_small`.
 */
export function makeFoldling(color: number): Figure {
  const { root, flag, pole } = proceduralFoldling(color);
  const flagModel = loadModel('flag_small');
  if (!flagModel) return figure(root, flag, root, []);
  pole.removeFromParent();
  flag.removeFromParent();
  const f = flagModel.scene;
  f.scale.setScalar(FLAG_SCALE);
  // Foot of the pole on the back, cloth turned to face the player's side.
  f.position.set(-0.012, 0.05, 0);
  f.rotation.y = Math.PI / 2;
  root.add(f);
  const anchor = f.getObjectByName('label_anchor') ?? f;
  const fig = figure(root, anchor, f, flagModel.animations);
  fig.play('wave');
  return fig;
}

/** The paper bird a Foldling folds into; flies towards +X, wings flapping. */
export function makeBird(color: number): Figure {
  const loaded = loadModel('paper_bird');
  if (!loaded) {
    const g = proceduralBird(color);
    return figure(g, g, g, []);
  }
  const root = new Group();
  root.name = 'paper-bird';
  loaded.scene.scale.setScalar(BIRD_SCALE);
  recolour(loaded.scene, 'coral', color);
  root.add(loaded.scene);
  const fig = figure(root, root, loaded.scene, loaded.animations);
  fig.play('flap');
  return fig;
}

/**
 * Open pop-up book lying on the table, reader on +Z, origin at the table
 * surface. Falls back to the procedural book when the model is missing.
 */
export function makeBook(): Group {
  const book = staticModel('popup_book', 'popup-book') ?? proceduralBook();
  // The portal Foldlings step out of stands at the back edge of the book.
  const portal = staticModel('portal_main', 'book-portal');
  if (portal) {
    portal.position.set(0, 0.012, -0.1);
    portal.scale.setScalar(0.8);
    book.add(portal);
  }
  return book;
}

/** Balloon with a short string in `color`; origin at the string's end. */
export function makeBalloon(color: number): Group {
  return staticModel('balloon_round', 'balloon', 'sky', color) ?? proceduralBalloon(color);
}

/** A number crystal; origin at its centre. */
export function makeCrystal(color: number): Object3D {
  return staticModel('crystal', 'crystal', 'lavender', color) ?? proceduralCrystal(color);
}

/** An orb made from merged crystals; origin at its centre. */
export function makeOrb(color: number): Object3D {
  return staticModel('orb', 'orb', 'lavender', color) ?? proceduralOrb(color);
}

/**
 * An upright paper card poked from the front. Origin at its centre (the
 * model's origin is its foot), front face +Z.
 */
export function makeButton(color: number): Object3D {
  const model = staticModel('paper_button', 'button', 'sky', color);
  if (!model) return proceduralButton(color);
  model.children[0].position.y = -0.0325;
  return model;
}

/**
 * A partner robot, clearly a machine and never a person. Origin at its base,
 * facing +Z, playing its idle loop. `variant` picks the look.
 */
export function makeBot(variant: 0 | 1, color: number): Figure {
  const loaded = loadModel(variant === 0 ? 'robot_partner_a' : 'robot_partner_b');
  if (!loaded) {
    const g = proceduralBot(color);
    return figure(g, g, g, []);
  }
  const root = new Group();
  root.name = 'bot';
  root.add(loaded.scene);
  const fig = figure(root, root, loaded.scene, loaded.animations, 'idle');
  fig.play('idle');
  return fig;
}

/**
 * A partner's window floating beside the book: the origami frame around a
 * dark opening (so passthrough does not show through). Origin at its centre,
 * facing +Z.
 */
export function makePortal(color: number): Group {
  const frame = staticModel('partner_window', 'portal-window', 'violet', color);
  if (!frame) return proceduralPortal(color);
  const back = new Mesh(new PlaneGeometry(0.16, 0.1), paper(0x2b3a5c));
  back.position.z = -0.002;
  frame.add(back);
  return frame;
}

/** An earned (gold) or empty paper star, facing +Z, origin at its centre. */
export function makeStar(earned: boolean): Object3D {
  return (
    staticModel(earned ? 'star' : 'star_empty', 'star') ?? proceduralStar(earned ? 0xf2c14e : PAPER_SHADE, 0.028)
  );
}

/** A standing origami envelope, one per game on the menu. */
export interface Envelope {
  root: Group;
  /** Hinged at the top edge; rotate about X towards -PI to open. */
  flap: Group;
  /** Slides up out of the envelope once the flap is open. */
  letter: Mesh;
}

const ENV_W = 0.1;
const ENV_H = 0.066;

/**
 * An origami envelope standing upright, front +Z, origin at its centre:
 * back sheet, folded side and bottom pockets, a pointed flap with a seal,
 * and a paper letter inside. Stand-in until the asset set has one.
 */
export function makeEnvelope(color: number): Envelope {
  const root = new Group();
  root.name = 'envelope';
  const w = ENV_W / 2;
  const h = ENV_H / 2;
  const back = new Mesh(new BoxGeometry(ENV_W, ENV_H, 0.003), paper(shade(color)));
  back.position.z = -0.0015;
  const letter = new Mesh(new PlaneGeometry(ENV_W * 0.86, ENV_H * 0.84), paper(PAPER, { doubleSide: true }));
  letter.name = 'envelope-letter';
  letter.position.z = 0.0008;
  // Side pockets meet in the middle; the bottom pocket laps over them.
  const sides = folded([-w, -h, 0.002, 0, 0, 0.002, -w, h, 0.002, w, -h, 0.002, w, h, 0.002, 0, 0, 0.002], color);
  const bottom = folded([-w, -h, 0.003, w, -h, 0.003, 0, 0.004, 0.003], shade(color));
  const flap = new Group();
  flap.name = 'envelope-flap';
  flap.position.set(0, h, 0.004);
  flap.add(folded([-w, 0, 0, 0, -h * 1.15, 0, w, 0, 0], color));
  const seal = new Mesh(new CylinderGeometry(0.007, 0.007, 0.002, 12), paper(0xe8b64c));
  seal.rotation.x = Math.PI / 2;
  seal.position.set(0, -h * 1.05, 0.0012);
  flap.add(seal);
  root.add(back, letter, sides, bottom, flap);
  return { root, flap, letter };
}

/** A highlight badge (symbol only), origin at the disc centre; null when missing. */
export function makeBadge(highlight: string): Object3D | null {
  return staticModel(`badge_${highlight}`, `badge-${highlight}`);
}

/** The team crystal the squad defends; origin at its base. */
export function makeTeamCrystal(): Group {
  const g = new Group();
  g.name = 'team-crystal';
  const model = staticModel('crystal', 'team-crystal-gem', 'lavender', 0x7cc8f2);
  if (model) {
    model.scale.setScalar(1.6);
    model.position.y = 0.04;
    g.add(model);
    return g;
  }
  const m = new Mesh(new OctahedronGeometry(0.02, 0), paper(0x7fc8d8, { emissive: 0x1a3a44 }));
  m.scale.set(1, 1.8, 1);
  m.position.y = 0.036;
  g.add(m);
  return g;
}

// ------------------------------------------------------------ procedural stand-ins

/** Builds a flat-shaded mesh from a list of triangles (9 numbers each). */
function folded(tris: number[], color: number): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(tris, 3));
  g.computeVertexNormals();
  return new Mesh(g, paper(color, { doubleSide: true }));
}

/** Open book: two covers and page stacks. Origin at the table surface, spine along X, reader on +Z. */
function proceduralBook(): Group {
  const book = new Group();
  book.name = 'popup-book';
  const cover = paper(0x2f4b8a);
  const pages = paper(PAPER);
  for (const side of [-1, 1]) {
    const c = new Mesh(new BoxGeometry(0.17, 0.006, 0.22), cover);
    c.position.set(side * 0.088, 0.003, 0);
    const p = new Mesh(new BoxGeometry(0.16, 0.012, 0.205), pages);
    p.position.set(side * 0.086, 0.012, 0);
    book.add(c, p);
  }
  return book;
}

/**
 * A Foldling: an origami fox-like creature with a number flag on its back.
 * Returns the group, the flag anchor where a label is attached, and the pole.
 */
function proceduralFoldling(color: number): { root: Group; flag: Group; pole: Mesh } {
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
  return { root, flag, pole };
}

/** Paper bird a Foldling folds into when answered. */
function proceduralBird(color: number): Group {
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

function proceduralBalloon(color: number): Group {
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

function proceduralCrystal(color: number): Mesh {
  const m = new Mesh(new OctahedronGeometry(0.022, 0), paper(color, { emissive: 0x111111 }));
  m.scale.set(1, 1.35, 1);
  m.name = 'crystal';
  return m;
}

function proceduralOrb(color: number): Mesh {
  const m = new Mesh(new IcosahedronGeometry(0.026, 1), paper(color, { emissive: 0x222222 }));
  m.name = 'orb';
  return m;
}

function proceduralBot(color: number): Group {
  const g = new Group();
  g.name = 'bot';
  const head = new Mesh(new BoxGeometry(0.05, 0.04, 0.035), paper(color));
  head.position.y = 0.025;
  const face = new Mesh(new BoxGeometry(0.038, 0.022, 0.002), paper(INK));
  face.position.set(0, 0.026, 0.0185);
  const stalk = new Mesh(new CylinderGeometry(0.0012, 0.0012, 0.02, 4), paper(INK));
  stalk.position.y = 0.055;
  g.add(head, face, stalk);
  return g;
}

function proceduralPortal(color: number): Group {
  const g = new Group();
  g.name = 'portal-window';
  const frame = new Mesh(new BoxGeometry(0.18, 0.12, 0.006), paper(color));
  const back = new Mesh(new PlaneGeometry(0.16, 0.1), paper(0x2b3a5c));
  back.position.z = 0.0035;
  g.add(frame, back);
  return g;
}

function proceduralStar(color: number, radius: number): Mesh {
  const tris: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const b = Math.PI / 2 + ((i + 1) / 10) * Math.PI * 2;
    const ra = i % 2 === 0 ? radius : radius * 0.45;
    const rb = i % 2 === 0 ? radius * 0.45 : radius;
    tris.push(0, 0, 0.006, Math.cos(a) * ra, Math.sin(a) * ra, 0, Math.cos(b) * rb, Math.sin(b) * rb, 0);
  }
  return folded(tris, color);
}

function proceduralButton(color: number): Mesh {
  const m = new Mesh(new BoxGeometry(0.1, 0.065, 0.012), paper(color));
  m.name = 'button';
  return m;
}
