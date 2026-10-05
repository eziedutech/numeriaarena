import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from '@iwsdk/core';
import { Kit, TOWN, seedOf, townMaterial } from '../art/town/kit.js';
import { PIECES, foldUp, pieceGeometry, scaffoldGeometry } from '../art/town/pieces.js';
import { assetOf, footprint, townRulesNow, type Landmark, type LandKind, type Placed } from './town-core.js';

/**
 * A page of the town as a scene: the paper page with its own nature and
 * landmark plot, and every building on it, a paper frame while it is still
 * being built. Shared by the computer and the headset. One tile is one unit;
 * the page lies from (0, 0, 0) to (cols, 0, rows), its rows towards +z.
 */

const LAND_TILE: Record<string, string> = { '~': 'land_water', '^': 'land_hill', ':': 'land_sand', '*': 'land_plot' };

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

/** Puts a piece built on its own footprint where a placed item stands, turned. */
export function standAt(obj: Object3D, w: number, h: number, x: number, y: number, rot: number): void {
  const [fw, fh] = footprint({ w, h }, rot);
  const child = obj.children[0];
  obj.position.set(x + fw / 2, 0, y + fh / 2);
  obj.rotation.y = -(rot * Math.PI) / 180;
  child?.position.set(-w / 2, 0, -h / 2);
}

/** A piece in a holder that turns it about its footprint's middle. */
export function pieceObject(id: string, seed: number): Group {
  const holder = new Group();
  const mesh = new Mesh(pieceGeometry(id, seed), townMaterial());
  mesh.castShadow = false;
  holder.add(mesh);
  holder.name = id;
  return holder;
}

export interface PageScene {
  root: Group;
  /** Holders of the items by their id, for picking and animating. */
  items: Map<string, Group>;
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
      const id = LAND_TILE[mark];
      if (!id) return;
      const seed = x * 31 + y * 7 + land;
      if (mark !== '*') return void addAt(root, id, seed, x, y);
      // The plot on a river is on the water; the landmark stands there once raised.
      if (kind === 'river') addAt(root, 'land_water', seed, x, y);
      if (landmark && PIECES[landmark.landmark]) addAt(root, landmark.landmark, 1, x, y).name = 'landmark';
      else addAt(root, id, seed, x, y);
    });
  });

  const map = new Map<string, Group>();
  for (const it of items) {
    if (it.land !== land) continue;
    const a = assetOf(it.asset);
    if (!a) continue;
    const g = it.ready ? pieceObject(it.asset, seedOf(it.id)) : frameObject(a.w, a.h);
    standAt(g, a.w, a.h, it.x, it.y, it.rot);
    g.userData.placeId = it.id;
    root.add(g);
    map.set(it.id, g);
  }
  return { root, items: map };
}

function addAt(root: Group, id: string, seed: number, x: number, y: number): Group {
  const g = pieceObject(id, seed);
  g.position.set(x + 0.5, 0, y + 0.5);
  g.children[0].position.set(-0.5, 0, -0.5);
  root.add(g);
  return g;
}

/** The paper frame of a building still going up. */
export function frameObject(w: number, h: number): Group {
  const holder = new Group();
  holder.add(new Mesh(scaffoldGeometry(w, h), townMaterial()));
  holder.name = 'frame';
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
      this.piece = pieceObject(asset, 1);
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
