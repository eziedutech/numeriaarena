import {
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Object3D,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from '@iwsdk/core';
import type { Species } from '../assets.js';
import { makeBalloon, makeCrystal } from '../art/models.js';
import { makeOrigami } from '../art/origami.js';
import { ACCENTS } from '../art/palette.js';

/**
 * The game's own paper animals, balloons and crystals as still pictures for the
 * smartboard, so the board looks like the rest of the game. Each is drawn
 * once, the first time it is needed, by a small renderer that is let go right
 * after; on the board only the pictures move, so it costs no more than any
 * other picture.
 */

/** The animals of the three lanes, walking with their heads to the right. */
export const WALKERS: readonly Species[] = ['elephant', 'cow', 'rabbit'];
/** The animals' paper, as the cream animals of the home page. */
const WALKER_PAPER = 0xfbf6ec;
export const BALLOON_PAPER = [0xf2716b, 0x3469c4, 0x3fb6a0, 0xf9c74f, 0x9b6bd6];

/** Picture sizes in CSS pixels, drawn at twice that for a sharp screen. */
export const WALKER_W = 156;
export const WALKER_H = 110;
export const BALLOON_W = 140;
export const BALLOON_H = 210;
/** Where the middle of a balloon's body is, down from the picture's top. */
export const BALLOON_MIDDLE = 77;
export const CRYSTAL_SIZE = 150;
/** The crystals in the colours and the shapes of the game's own. */
const CRYSTAL_PAPER = Object.values(ACCENTS);

const pictures = new Map<string, string>();

function draw(objects: Object3D[], frame: (o: Object3D) => OrthographicCamera, w: number, h: number): string[] {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(2);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0xd9ccb0, 2.2));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(-0.4, 0.7, 0.6);
    scene.add(sun);
    return objects.map((o) => {
      scene.add(o);
      renderer.render(scene, frame(o));
      scene.remove(o);
      return renderer.domElement.toDataURL('image/png');
    });
  } catch (e) {
    console.error('[board] the paper pictures could not be drawn', e);
    return objects.map(() => '');
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** A camera a little above the side, looking at `centre`, `half` by `half * h / w` around it. */
function camera(centre: Vector3, halfW: number, halfH: number): OrthographicCamera {
  const c = new OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 10);
  c.position.set(centre.x, centre.y + 0.35, centre.z + 1);
  c.lookAt(centre);
  return c;
}

/** The three walkers' pictures, all at one scale so the elephant stays the biggest. */
export function walkers(): string[] {
  if (!pictures.has('walker-0')) {
    const models = WALKERS.map((s) => {
      const g = new Group();
      g.add(makeOrigami(s, WALKER_PAPER).model);
      return g;
    });
    const boxes = models.map((m) => new Box3().setFromObject(m));
    const size = boxes.reduce((v, b) => v.max(b.getSize(new Vector3())), new Vector3());
    const halfW = Math.max(size.x, (size.y * WALKER_W) / WALKER_H) * 0.56;
    const halfH = (halfW * WALKER_H) / WALKER_W;
    const shots = draw(
      models,
      (o) => {
        const box = boxes[models.indexOf(o as Group)];
        // Feet on the picture's bottom, the middle of the animal in the middle.
        const centre = new Vector3((box.min.x + box.max.x) / 2, box.min.y + halfH * 0.94, 0);
        return camera(centre, halfW, halfH);
      },
      WALKER_W,
      WALKER_H,
    );
    shots.forEach((p, i) => pictures.set(`walker-${i}`, p));
  }
  return WALKERS.map((_, i) => pictures.get(`walker-${i}`) ?? '');
}

/** The balloons' pictures, a colour each; the string runs out of the bottom. */
export function balloons(): string[] {
  if (!pictures.has('balloon-0')) {
    const models = BALLOON_PAPER.map((c) => makeBalloon(c));
    // The body is 0.044 to 0.117 high and 0.062 wide; the picture shows a little round it.
    const halfW = 0.035;
    const halfH = (halfW * BALLOON_H) / BALLOON_W;
    const top = 0.119;
    const shots = draw(
      models,
      () => {
        const c = new OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.01, 10);
        c.position.set(0, top - halfH, 1);
        c.lookAt(0, top - halfH, 0);
        return c;
      },
      BALLOON_W,
      BALLOON_H,
    );
    shots.forEach((p, i) => pictures.set(`balloon-${i}`, p));
  }
  return BALLOON_PAPER.map((_, i) => pictures.get(`balloon-${i}`) ?? '');
}

/** The crystals' pictures, a colour and a shape each, standing in the middle. */
export function crystals(): string[] {
  if (!pictures.has('crystal-0')) {
    const models = CRYSTAL_PAPER.map((c, i) => {
      const g = new Group();
      g.add(makeCrystal(c, i));
      return g;
    });
    const shots = draw(
      models,
      (o) => {
        const box = new Box3().setFromObject(o);
        const size = box.getSize(new Vector3());
        const half = Math.max(size.x, size.y) * 0.56;
        return camera(box.getCenter(new Vector3()), half, half);
      },
      CRYSTAL_SIZE,
      CRYSTAL_SIZE,
    );
    shots.forEach((p, i) => pictures.set(`crystal-${i}`, p));
  }
  return CRYSTAL_PAPER.map((_, i) => pictures.get(`crystal-${i}`) ?? '');
}
