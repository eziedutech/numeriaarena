import { BufferGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from '@iwsdk/core';
import { Kit, TOWN, townMaterial } from '../art/town/kit.js';
import { hill, plot, sand, water } from '../art/town/land.js';
import { foldUp, scaffoldGeometry } from '../art/town/pieces.js';
import { assetOf, footprint, townRulesNow, type Landmark, type LandKind, type Placed } from './town-core.js';
import { loadPieces, pieceGeometry, pieceGeometryAsync, pieceInfo } from './town-pieces.js';

/**
 * A page of the town as a scene: the paper page with its own nature and
 * landmark plot, and every building on it, a paper frame while it is still
 * being built. Shared by the computer and the headset. One tile is one unit;
 * the page lies from (0, 0, 0) to (cols, 0, rows), its rows towards +z.
 *
 * Every piece is a holder at the middle of its footprint, turned there, with
 * one child, its hinge on the back edge of the footprint, which the fold up
 * turns; the model hangs from the hinge.
 */

/** The paper page and its grass, a little larger than its tiles. */
function pageKit(cols: number, rows: number): Kit {
  const k = new Kit();
  const m = 0.25;
  k.box(-m, -0.06, -m, cols + m, 0, rows + m, TOWN.paper);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) k.flat(x, y, x + 1, y + 1, 0.002, (x + y) % 2 ? TOWN.grass : TOWN.grass2);
  }
  return k;
}

let page: Mesh | undefined;
const LOOKS = 4;
const landGeo = new Map<string, BufferGeometry>();

function landGeometry(mark: string, seed: number): BufferGeometry | undefined {
  const look = mark === '*' ? 0 : seed % LOOKS;
  const key = `${mark}${look}`;
  let g = landGeo.get(key);
  if (!g) {
    const s = look * 7919 + 1;
    const k = mark === '~' ? water(s) : mark === '^' ? hill(s) : mark === ':' ? sand(s) : mark === '*' ? plot() : undefined;
    if (!k) return undefined;
    g = k.geometry();
    landGeo.set(key, g);
  }
  return g;
}

/** Puts a piece where a placed item stands, turned about its footprint's middle. */
export function standAt(obj: Object3D, w: number, h: number, x: number, y: number, rot: number): void {
  const [fw, fh] = footprint({ w, h }, rot);
  obj.position.set(x + fw / 2, 0, y + fh / 2);
  obj.rotation.y = -(rot * Math.PI) / 180;
}

/** A holder with its hinge, for a model `w` by `h` tiles. */
function holderOf(name: string, h: number): { holder: Group; hinge: Group } {
  const holder = new Group();
  holder.name = name;
  const hinge = new Group();
  hinge.position.z = -h / 2;
  holder.add(hinge);
  return { holder, hinge };
}

const EMPTY = new BufferGeometry();

/**
 * A piece by its id. Its model is drawn at once if its pack is here, else
 * as soon as the pack arrives.
 */
export function pieceObject(id: string): Group {
  const info = pieceInfo(id);
  const h = info?.h ?? assetOf(id)?.h ?? 1;
  const { holder, hinge } = holderOf(id, h);
  const mesh = new Mesh(pieceGeometry(id) ?? EMPTY, townMaterial());
  mesh.position.z = h / 2;
  hinge.add(mesh);
  if (mesh.geometry === EMPTY) {
    void pieceGeometryAsync(id)
      .then((g) => {
        if (g) mesh.geometry = g;
      })
      .catch((error: unknown) => console.warn(`[town] ${id} not drawn: ${String(error)}`));
  }
  return holder;
}

export interface PageScene {
  root: Group;
  /** Holders of the items by their id, for picking and animating. */
  items: Map<string, Group>;
}

/** The model of a landmark's tier. */
export function landmarkPiece(l: Pick<Landmark, 'landmark' | 'tier'>): string {
  return `${l.landmark}_t${Math.min(3, Math.max(1, l.tier))}`;
}

/** Fetches what a page will draw, so it draws whole at once. */
export function loadPage(land: number, items: Placed[], landmark?: Landmark): Promise<void> {
  const ids = items.filter((i) => i.land === land).map((i) => i.asset);
  if (landmark) ids.push(landmarkPiece(landmark));
  return loadPieces(ids);
}

/**
 * Draws page `land`: `items` are the whole town's, `landmark` the one that
 * stands on this page's plot, if any has been raised for it.
 */
export function buildPage(kind: LandKind, land: number, items: Placed[], landmark?: Landmark): PageScene {
  const rules = townRulesNow();
  const root = new Group();
  root.name = `town-page-${land}`;
  page ??= new Mesh(pageKit(rules.cols, rules.rows).geometry(), townMaterial());
  root.add(page.clone());

  const info = rules.lands.find((l) => l.kind === kind) ?? rules.lands[0];
  info.layout.forEach((row, y) => {
    [...row].forEach((mark, x) => {
      // The plot on a river is on the water.
      const under = mark === '*' && kind === 'river' ? '~' : mark;
      if (under !== '*') addLand(root, under, x * 31 + y * 7 + land, x, y);
    });
  });
  const [px, py] = info.plot;
  if (landmark) {
    const g = pieceObject(landmarkPiece(landmark));
    standAt(g, 2, 1, px, py, 0);
    g.name = 'landmark';
    root.add(g);
  } else {
    addLand(root, '*', 0, px, py);
  }

  const map = new Map<string, Group>();
  for (const it of items) {
    if (it.land !== land) continue;
    const a = assetOf(it.asset);
    if (!a) continue;
    const g = it.ready ? pieceObject(a.id) : frameObject(a.w, a.h, frameHeight(a.id));
    standAt(g, a.w, a.h, it.x, it.y, it.rot);
    g.userData.placeId = it.id;
    root.add(g);
    map.set(it.id, g);
  }
  return { root, items: map };
}

function addLand(root: Group, mark: string, seed: number, x: number, y: number): void {
  const g = landGeometry(mark, seed);
  if (!g) return;
  const m = new Mesh(g, townMaterial());
  m.position.set(x, 0, y);
  root.add(m);
}

/** How tall a frame stands: a little under the building it will be. */
export function frameHeight(id: string): number {
  const top = pieceInfo(id)?.top ?? 0.4;
  return Math.min(0.9, Math.max(0.18, top * 0.85));
}

/** The paper frame of a building still going up. */
export function frameObject(w: number, h: number, height = 0.4): Group {
  const { holder, hinge } = holderOf('frame', h);
  const mesh = new Mesh(scaffoldGeometry(w, h, height), townMaterial());
  mesh.position.x = -w / 2;
  hinge.add(mesh);
  return holder;
}

const ghostOk = new MeshBasicMaterial({ color: 0x3fb6a0, transparent: true, opacity: 0.45, depthWrite: false });
const ghostNo = new MeshBasicMaterial({ color: 0xf28c38, transparent: true, opacity: 0.5, depthWrite: false });
const tileGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * The placing shadow: the footprint in green where it fits, orange where it
 * does not, with the piece itself standing over it.
 */
export class Ghost {
  readonly root = new Group();
  private shadow = new Mesh(tileGeo, ghostOk);
  private piece?: Group;
  private id = '';

  constructor() {
    this.root.name = 'town-ghost';
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);
    this.root.visible = false;
  }

  show(asset: string, x: number, y: number, rot: number, fits: boolean): void {
    const a = assetOf(asset);
    if (!a) return;
    if (asset !== this.id) {
      if (this.piece) this.root.remove(this.piece);
      this.piece = pieceObject(a.id);
      this.root.add(this.piece);
      this.id = asset;
    }
    const [fw, fh] = footprint(a, rot);
    this.shadow.material = fits ? ghostOk : ghostNo;
    this.shadow.scale.set(fw, 1, fh);
    this.shadow.position.set(x + fw / 2, 0.02, y + fh / 2);
    standAt(this.piece!, a.w, a.h, x, y, rot);
    this.piece!.position.y = 0.04;
    this.root.visible = true;
  }

  hide(): void {
    this.root.visible = false;
  }
}

export { foldUp };
