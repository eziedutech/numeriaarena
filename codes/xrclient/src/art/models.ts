import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  AssetManager,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LoopOnce,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

import { SPECIES, type Species } from '../assets.js';
import { CORRECT, INK, PAPER, PAPER_SHADE, WRONG, paper, shade, tint } from './palette.js';

// ------------------------------------------------------------ origami models

/** Imported number flag, sized to the procedural Foldling. */
const FLAG_SCALE = 1.25;
/** Origami Foldlings are about 8 cm long; this keeps them readable at arm's length. */
const FOLDLING_SCALE = 1.6;
/** The flag relative to an origami Foldling (already scaled up). */
const FOLDLING_FLAG_SCALE = 0.75;
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
  /** Colours a creature's flag cloth: race checks, red after a miss, green when right. */
  mark?(state: FlagState): void;
}

export type FlagState = 'race' | 'wrong' | 'right';

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
  // Back to rest only if the clip that ended is still the one playing; a
  // newer clip (a hop started as the cheer ends) keeps going.
  if (mixer && rest) {
    mixer.addEventListener('finished', (e) => {
      if (e.action === current) fig.play(rest);
    });
  }
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
export function makeFoldling(color: number, species: Species = 'fox'): Figure {
  const loaded = loadModel(`foldling_${species}`);
  const flagModel = loadModel('flag_small');
  if (!loaded || !flagModel) return proceduralFoldlingFigure(color);
  const root = new Group();
  root.name = 'foldling';
  const model = loaded.scene;
  model.scale.setScalar(FOLDLING_SCALE);
  recolour(model, 'coral', color);
  root.add(model);
  const f = flagModel.scene;
  f.scale.setScalar(FOLDLING_FLAG_SCALE);
  // The cloth trails behind the animal like a carried flag.
  f.rotation.y = Math.PI;
  (model.getObjectByName('flag_anchor') ?? model).add(f);
  // The number floats just above the pole, never on the cloth that could cover it.
  const number = new Group();
  number.name = 'flag-number';
  number.position.set(0, 0.125, 0);
  f.add(number);
  figure(f, f, f, flagModel.animations).play('wave');
  const fig = figure(root, number, model, loaded.animations, 'idle');
  fig.mark = flagCloth(f);
  fig.play('idle');
  return fig;
}

/** The flag's cloth spans x 0 to 5 cm and y -3.5 to 0 cm from its top corner. */
const CLOTH_W = 0.05;
const CLOTH_H = 0.035;
/** Chequered like a race flag: 6 by 4 squares on the cloth. */
const CHECKS_X = 6;
const CHECKS_Y = 4;

let checks: CanvasTexture | undefined;
const clothMaterials = new Map<string, MeshStandardMaterial>();

function checkTexture(): CanvasTexture {
  if (checks) return checks;
  const px = 16;
  const canvas = document.createElement('canvas');
  canvas.width = CHECKS_X * px;
  canvas.height = CHECKS_Y * px;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#fbf8f1';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#2b2d33';
  for (let y = 0; y < CHECKS_Y; y += 1) {
    for (let x = (y % 2); x < CHECKS_X; x += 2) c.fillRect(x * px, y * px, px, px);
  }
  checks = new CanvasTexture(canvas);
  checks.colorSpace = SRGBColorSpace;
  checks.magFilter = NearestFilter;
  return checks;
}

/** One material per flag state and side of the fold, shared by every flag. */
function clothMaterial(base: MeshStandardMaterial, state: FlagState, shaded: boolean): MeshStandardMaterial {
  const key = `${state}:${shaded}`;
  let m = clothMaterials.get(key);
  if (!m) {
    m = base.clone();
    m.name = `flag_${key}`;
    if (state === 'race') {
      m.map = checkTexture();
      m.color.setHex(shaded ? 0xdedede : 0xffffff);
    } else {
      const color = state === 'right' ? CORRECT : WRONG;
      m.map = null;
      m.color.setHex(shaded ? shade(color) : color);
    }
    clothMaterials.set(key, m);
  }
  return m;
}

/**
 * Turns a `flag_small` cloth into a race flag and returns the way to recolour
 * it. The asset has no texture coordinates, so they are made from the cloth's
 * flat shape (shared geometry, done once).
 */
function flagCloth(flag: Object3D): (state: FlagState) => void {
  const cloth: Mesh[] = [];
  flag.traverse((o) => {
    const mesh = o as Mesh;
    const name = (mesh.material as Material | undefined)?.name;
    if (!mesh.isMesh || (name !== 'cream' && name !== 'cream_shade')) return;
    const g = mesh.geometry;
    if (!g.getAttribute('uv')) {
      const pos = g.getAttribute('position');
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i += 1) {
        uv[i * 2] = pos.getX(i) / CLOTH_W;
        uv[i * 2 + 1] = 1 + pos.getY(i) / CLOTH_H;
      }
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    }
    mesh.userData.clothBase = mesh.material;
    mesh.userData.clothShaded = name === 'cream_shade';
    cloth.push(mesh);
  });
  const mark = (state: FlagState) => {
    for (const mesh of cloth) {
      mesh.material = clothMaterial(mesh.userData.clothBase, state, mesh.userData.clothShaded);
    }
  };
  mark('race');
  return mark;
}

/** Species for a creature: varied, and stable for one offer. */
export function speciesFor(offerId: number): Species {
  return SPECIES[(offerId * 5) % SPECIES.length];
}

function proceduralFoldlingFigure(color: number): Figure {
  const { root, flag, pole } = proceduralFoldling(color);
  const flagModel = loadModel('flag_small');
  if (!flagModel) return figure(root, flag, root, []);
  pole.removeFromParent();
  flag.removeFromParent();
  const f = flagModel.scene;
  f.scale.setScalar(FLAG_SCALE);
  // Foot of the pole on the back; the cloth trails behind like a carried flag.
  f.position.set(-0.012, 0.05, 0);
  f.rotation.y = Math.PI;
  root.add(f);
  // The number floats just above the pole, never on the cloth that could cover it.
  const anchor = new Group();
  anchor.name = 'flag-number';
  anchor.position.set(0, 0.125, 0);
  f.add(anchor);
  const fig = figure(root, anchor, f, flagModel.animations);
  fig.mark = flagCloth(f);
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
  // Faint maths sketched on both pages, like a well-used exercise book.
  for (const side of [-1, 1]) book.add(pageSketch(side));
  // The portal Foldlings step out of stands on the table just behind the
  // book, a doorway at its back edge rather than a sign stuck on the pages.
  const portal = staticModel('portal_main', 'book-portal');
  if (portal) {
    portal.position.set(0, 0, -PAGE_D / 2 - 0.03);
    portal.scale.setScalar(1.15);
    book.add(portal);
  }
  return book;
}

/** Page area of the open book (metres) and the height of its paper. */
const PAGE_W = 0.15;
const PAGE_D = 0.21;
const PAGE_TOP = 0.0236;

/**
 * Soft pencil maths on one page: sums, fractions, a number line, a shared
 * pie, a dot grid. Drawn faint and slightly blurred so it reads as texture
 * and never competes with the question. `side` is -1 for the left page.
 */
function pageSketch(side: number): Mesh {
  const px = 512;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = Math.round((px * PAGE_D) / PAGE_W);
  const c = canvas.getContext('2d')!;
  c.filter = 'blur(1.2px)';
  c.strokeStyle = c.fillStyle = 'rgba(58, 63, 75, 0.32)';
  c.lineWidth = 3;
  c.lineCap = 'round';
  const text = (s: string, x: number, y: number, size: number, turn: number) => {
    c.save();
    c.translate(x, y);
    c.rotate(turn);
    c.font = `600 ${size}px sans-serif`;
    c.fillText(s, 0, 0);
    c.restore();
  };
  const h = canvas.height;
  if (side < 0) {
    text('7 × 8 = 56', 40, 90, 44, -0.06);
    text('3/4', 330, 150, 52, 0.08);
    text('12 + 9', 60, 250, 40, 0.04);
    // A number line with ticks.
    c.beginPath();
    c.moveTo(40, 360);
    c.lineTo(470, 360);
    for (let i = 0; i <= 10; i += 1) {
      c.moveTo(40 + i * 43, i % 5 === 0 ? 340 : 348);
      c.lineTo(40 + i * 43, 372);
    }
    c.stroke();
    text('0', 32, 405, 26, 0);
    text('1', 460, 405, 26, 0);
    text('0.25', 250, 520, 42, -0.1);
    text('÷ 4', 70, h - 90, 44, 0.05);
  } else {
    // A pie cut into quarters, one shaded.
    c.beginPath();
    c.arc(130, 130, 80, 0, Math.PI * 2);
    c.moveTo(50, 130);
    c.lineTo(210, 130);
    c.moveTo(130, 50);
    c.lineTo(130, 210);
    c.stroke();
    c.beginPath();
    c.moveTo(130, 130);
    c.arc(130, 130, 80, -Math.PI / 2, 0);
    c.closePath();
    c.fill();
    text('1/2 + 1/4', 250, 140, 44, -0.05);
    text('100', 330, 300, 48, 0.1);
    // A small dot grid, like an area model.
    for (let r = 0; r < 4; r += 1) for (let k = 0; k < 6; k += 1) c.fillRect(60 + k * 30, 300 + r * 30, 7, 7);
    text('4 × 6', 60, 470, 40, 0.03);
    text('2.5 cm', 280, 560, 40, -0.08);
    text('9 - 4', 90, h - 90, 44, -0.04);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sheet = new Mesh(
    new PlaneGeometry(PAGE_W, PAGE_D),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  sheet.name = 'page-sketch';
  sheet.rotation.x = -Math.PI / 2;
  sheet.position.set(side * 0.09, PAGE_TOP, 0);
  return sheet;
}

/**
 * A paper-cut hot-air balloon in `color`, origin at the bottom of its basket.
 * Its gores alternate two tones; both are painted from the one colour.
 */
export function makeBalloon(color: number): Group {
  const g = staticModel('balloon_round', 'balloon', 'sky', color);
  if (!g) return proceduralBalloon(color);
  recolour(g, 'blue', shade(shade(color)));
  return g;
}

const GEMS = ['crystal', 'crystal_2', 'crystal_3'];

/** A paper gem crystal; `index` picks one of three shapes. Origin at its centre. */
export function makeCrystal(color: number, index = 0): Object3D {
  return staticModel(GEMS[index % GEMS.length], 'crystal', 'lavender', color) ?? proceduralCrystal(color);
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
  const letter = new Mesh(new PlaneGeometry(ENV_W * 0.8, ENV_H * 0.78), paper(PAPER, { doubleSide: true }));
  letter.name = 'envelope-letter';
  letter.position.z = 0.0008;
  // Hidden until the envelope opens: its white edges would show through the
  // folds as outlines that no folded paper has.
  letter.visible = false;
  // Each folded panel gets its own tone so the creases read under any light:
  // side pockets in shadow, the bottom pocket catching light, the flap between.
  const sides = folded(
    [-w, -h, 0.002, 0, 0, 0.002, -w, h, 0.002, w, -h, 0.002, w, h, 0.002, 0, 0, 0.002],
    shade(shade(color)),
  );
  const bottom = folded([-w, -h, 0.003, w, -h, 0.003, 0, 0.004, 0.003], tint(color, 0.18));
  const flap = new Group();
  flap.name = 'envelope-flap';
  // The flap belongs to the back sheet: its hinge is on the back sheet's top
  // edge and it folds forward over the pockets. Opened, it ends up behind the
  // letter, which then slides out of the gap between back sheet and pockets.
  flap.position.set(0, h, 0);
  // Lifted a little off the pockets, the way a folded flap never lies quite flat.
  flap.rotation.x = 0.12;
  flap.add(folded([-w, 0, 0.004, 0, -h * 0.95, 0.004, w, 0, 0.004], color));
  const seal = new Mesh(new CylinderGeometry(0.007, 0.007, 0.002, 12), paper(0xe8b64c));
  seal.rotation.x = Math.PI / 2;
  seal.position.set(0, -h * 0.85, 0.0052);
  flap.add(seal);
  root.add(back, letter, sides, bottom, flap);
  return { root, flap, letter };
}

/** A highlight badge (symbol only), origin at the disc centre; null when missing. */
export function makeBadge(highlight: string): Object3D | null {
  return staticModel(`badge_${highlight}`, `badge-${highlight}`);
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
