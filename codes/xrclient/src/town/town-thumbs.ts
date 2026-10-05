import { DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from '@iwsdk/core';
import { pieceObject } from './town-scene.js';
import type { Asset } from './town-core.js';

/**
 * Pictures of the shop's pieces for its shelf, drawn once with a small
 * renderer of their own that is let go as soon as they are done.
 */

const W = 180;
const H = 140;
let made: Map<string, string> | undefined;

export function shelfPictures(catalog: Asset[]): Map<string, string> {
  if (made) return made;
  made = new Map();
  let renderer: WebGLRenderer | undefined;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    const camera = new PerspectiveCamera(30, W / H, 0.05, 50);
    for (const a of catalog) {
      const scene = new Scene();
      scene.add(new HemisphereLight(0xffffff, 0xd8c8a8, 1.6));
      const sun = new DirectionalLight(0xffffff, 1.3);
      sun.position.set(-3, 6, 5);
      scene.add(sun);
      const piece = pieceObject(a.id, 1);
      piece.children[0].position.set(-a.w / 2, 0, -a.h / 2);
      scene.add(piece);
      const size = Math.max(a.w, a.h, a.floors * 0.5 + 0.4);
      const centre = new Vector3(0, Math.min(1.6, a.floors * 0.22 + 0.15), 0);
      camera.position.copy(centre).add(new Vector3(0.75, 0.85, 1.2).multiplyScalar(size * 1.35));
      camera.lookAt(centre);
      renderer.render(scene, camera);
      made.set(a.id, renderer.domElement.toDataURL('image/png'));
    }
  } catch (error) {
    console.warn(`[town] shelf pictures not drawn: ${String(error)}`);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return made;
}
