import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3, type Entity, type Object3D } from '@iwsdk/core';
import { Label } from '../art/label.js';
import { PAGE_TOP } from '../art/models.js';
import { getLang } from '../settings.js';
import { assetOf, footprint, LAND_KINDS, townRulesNow, type Asset, type LandKind, type Placed } from './town-core.js';
import { TownModel } from './town-model.js';
import { buildPage, foldUp, Ghost, pieceObject, type PageScene } from './town-scene.js';
import { TOWN_TEXT } from './town-text.js';

/**
 * MY FOLD TOWN in the headset: the town's newest page lies on the book, the
 * shop's shelf stands beside it, and a piece is pinched from the shelf (or
 * from the page), carried over a tile with its green or orange shadow and
 * let go to place it. Let go off the book, a placed piece is removed and its
 * Folds come back. A building session lasts two minutes; the town is saved
 * with every change.
 */

export type Side = 'left' | 'right';
export type TownChoice = 'town_turn' | 'town_done' | 'town_plain' | 'town_river' | 'town_hills' | 'town_beach';

export function isTownChoice(choice: string): choice is TownChoice {
  return choice.startsWith('town_');
}

/** What the desk game lends the town: its entities, labels, buttons and pointers. */
export interface TownHost {
  /** A desk entity for `obj`; `ray` makes it a target for the pointers. */
  add(obj: Object3D, ray: boolean): Entity;
  remove(e: Entity): void;
  /** Keeps a label turned to the player. */
  billboard(mesh: Mesh): void;
  /** A paper card on the desk at (x, z), pressed like the menu's. */
  button(choice: TownChoice, title: string, x: number, z: number, color: number): Entity;
  /** The pointer's ray space of a hand or controller. */
  ray(side: Side): Object3D;
  /** What that ray is on, if anything. */
  aimed(side: Side): Object3D | undefined;
  /** This frame's select (pinch or trigger) edges. */
  select(side: Side): { start: boolean; end: boolean };
  /** The emulator's hands: a pinch may take what the other ray is on. */
  emulated(): boolean;
  /** The town is done with; `note` is said on the menu. */
  closed(note?: string): void;
}

const SIDES: readonly Side[] = ['right', 'left'];
/** One tile on the book, in metres. */
const TILE = 0.028;
const LIMIT_S = 120;
/** A pinch let go sooner than this is a tap: the piece stays on the ray until the next pinch. */
const TAP_MS = 300;
const MESSAGE_S = 2.6;
const FOLD_S = 0.7;
/** How far off the page, in tiles, still counts as over it. */
const PAGE_MARGIN = 0.6;

const SHELF_X = 0.205;
const SHELF_Z = -0.09;
const SHELF_STEP = 0.06;
const SHELF_COLS = 4;
const SLOT = 0.04;
const HEADER = new Vector3(0, 0.17, -0.14);
const KIND_COLOR: Record<LandKind, number> = { plain: 0x5aa469, river: 0x3469c4, hills: 0x9b6bc2, beach: 0xe0a33c };
const ORANGE = 0xf28c38;
const TEAL = 0x3fb6a0;

const slotGeo = new BoxGeometry(SLOT + 0.012, SLOT + 0.02, SLOT + 0.012);
const slotMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const barGeo = new PlaneGeometry(1, 1);
const barMat = new MeshBasicMaterial({ color: TEAL });

interface Carry {
  side: Side;
  asset: string;
  /** The placed item being moved; "" for a piece from the shelf. */
  placeId: string;
  rot: number;
  at: number;
  tapped: boolean;
  over: boolean;
  x: number;
  y: number;
  fits: string;
}

export class TownDesk {
  private t = TOWN_TEXT[getLang()];
  private root: Entity;
  private holder?: Entity;
  private shelf?: Entity;
  private shelfKey = '';
  private page?: PageScene;
  private ghost = new Ghost();
  private buttons = new Map<TownChoice, Entity>();
  private kindRow: Entity[] = [];
  private kindCaption?: Label;
  private folds: Label;
  private status: Label;
  private bar: Mesh;
  private land = 0;
  private carry?: Carry;
  private rot = 0;
  private left = LIMIT_S;
  private message = '';
  /** What letting go of the carried piece would do, shown again after a message. */
  private note = '';
  private messageLeft = 0;
  private second = 0;
  private readySeen = new Set<string>();
  private folding: { obj: Object3D; t: number }[] = [];
  private unlisten: () => void;
  private gone = false;

  private o = new Vector3();
  private d = new Vector3();
  private p = new Vector3();
  private q = new Quaternion();

  static async open(host: TownHost): Promise<TownDesk> {
    return new TownDesk(host, await TownModel.open());
  }

  private constructor(
    private host: TownHost,
    private model: TownModel,
  ) {
    const g = new Group();
    g.name = 'town-desk';
    this.root = host.add(g, false);
    const header = new Group();
    header.position.copy(HEADER);
    g.add(header);
    this.text(this.t.title, 0.026, header, 0.07);
    this.folds = this.text('', 0.02, header, 0.038);
    this.status = this.text('', 0.016, header, 0.008);
    this.bar = new Mesh(barGeo, barMat);
    this.bar.position.set(0, -0.014, 0);
    this.bar.scale.set(0.22, 0.004, 1);
    header.add(this.bar);
    this.buttons.set('town_done', host.button('town_done', this.t.xr.done, -0.355, 0.06, 0x3469c4));
    for (const it of model.view().items) if (it.ready) this.readySeen.add(it.id);
    this.unlisten = model.onChange(() => this.redraw());
    this.redraw();
    if (model.seat) void model.sync();
    console.info(`[town] opened in the headset: ${model.view().lands.length} land(s), ${model.view().balance} Folds`);
  }

  private text(s: string, height: number, parent: Object3D, y: number): Label {
    const l = new Label(s, { height });
    l.mesh.position.set(0, y, 0);
    parent.add(l.mesh);
    this.host.billboard(l.mesh);
    return l;
  }

  // ------------------------------------------------------------ drawing

  private redraw(): void {
    if (this.gone) return;
    const v = this.model.view();
    this.folds.set(this.t.folds(v.balance));
    this.land = Math.max(0, v.lands.length - 1);
    const kind = v.lands[this.land];
    this.showKinds(!kind || v.land_closed === null);
    if (!kind) {
      this.say(this.t.xr.pickLandXr, 0);
      return;
    }
    if (!this.buttons.has('town_turn')) this.buttons.set('town_turn', this.host.button('town_turn', this.t.turn, -0.24, 0.06, 0xe8b64c));
    this.drawPage(kind, v.items);
    const key = `${v.balance}|${v.buildings}`;
    if (key !== this.shelfKey) this.drawShelf(v.balance, v.buildings);
    this.shelfKey = key;
    if (!this.message) this.say(this.t.xr.hint, 0);
  }

  private drawPage(kind: LandKind, items: Placed[]): void {
    if (!this.holder) {
      const r = townRulesNow();
      const h = new Group();
      h.name = 'town-holder';
      h.position.set((-r.cols * TILE) / 2, PAGE_TOP + 0.002, (-r.rows * TILE) / 2);
      h.scale.setScalar(TILE);
      h.add(this.ghost.root);
      this.holder = this.host.add(h, true);
    }
    const h = this.holder.object3D!;
    if (this.page) h.remove(this.page.root);
    this.page = buildPage(kind, this.land, items, this.model.doc.landmarks[this.land]);
    h.add(this.page.root);
    for (const it of items) {
      const obj = this.page.items.get(it.id);
      if (obj && it.id === this.carry?.placeId) obj.visible = false;
      if (!it.ready || this.readySeen.has(it.id)) continue;
      this.readySeen.add(it.id);
      if (obj) {
        this.folding.push({ obj: obj.children[0], t: 0 });
        this.say(this.t.finished(this.name(it.asset)));
      }
    }
  }

  /** The shop's unlocked pieces in a grid beside the book, each with its price. */
  private drawShelf(balance: number, buildings: number): void {
    if (this.shelf) this.host.remove(this.shelf);
    const g = new Group();
    g.name = 'town-shelf';
    this.shelf = this.host.add(g, true);
    const open = townRulesNow().catalog.filter((a) => buildings >= a.unlock_at);
    open.forEach((a, i) => {
      const slot = new Group();
      slot.name = `town-shelf-${a.id}`;
      slot.userData.townShelf = a.id;
      slot.position.set(SHELF_X + (i % SHELF_COLS) * SHELF_STEP, 0, SHELF_Z + Math.floor(i / SHELF_COLS) * SHELF_STEP);
      const hit = new Mesh(slotGeo, slotMat);
      hit.position.y = (SLOT + 0.02) / 2;
      slot.add(hit);
      slot.add(this.miniature(a));
      g.add(slot);
      const price = new Label(this.t.price(a.price), a.price > balance ? { height: 0.011, ink: ORANGE } : { height: 0.011 });
      price.mesh.position.set(0, SLOT + 0.022, 0);
      slot.add(price.mesh);
      this.host.billboard(price.mesh);
    });
  }

  private miniature(a: Asset): Group {
    const piece = pieceObject(a.id, 1);
    piece.children[0].position.set(-a.w / 2, 0, -a.h / 2);
    piece.scale.setScalar(SLOT / Math.max(a.w, a.h));
    return piece;
  }

  /** The four kinds of land as cards in front of the book, for a first or a new page. */
  private showKinds(on: boolean): void {
    if (on === this.kindRow.length > 0) return;
    for (const e of this.kindRow) this.host.remove(e);
    this.kindRow = [];
    this.kindCaption?.mesh.removeFromParent();
    this.kindCaption = undefined;
    if (!on) return;
    LAND_KINDS.forEach((k, i) => {
      this.kindRow.push(this.host.button(`town_${k}` as TownChoice, this.t.kinds[k][0], -0.18 + i * 0.12, 0.13, KIND_COLOR[k]));
    });
    const caption = new Label(this.model.view().lands.length ? this.t.newLand : this.t.pickLand, { height: 0.016 });
    caption.mesh.position.set(0, 0.1, 0.13);
    this.root.object3D!.add(caption.mesh);
    this.host.billboard(caption.mesh);
    this.kindCaption = caption;
  }

  /** A line under the title; `seconds` 0 keeps it until the next. */
  private say(text: string, seconds = MESSAGE_S): void {
    this.status.set(text);
    this.message = seconds ? text : '';
    this.messageLeft = seconds;
  }

  // ------------------------------------------------------------ input

  press(choice: TownChoice): void {
    if (choice === 'town_done') {
      this.host.closed();
      return;
    }
    if (choice === 'town_turn') {
      if (this.carry) {
        this.carry.rot = (this.carry.rot + 90) % 360;
        this.carry.x = NaN;
      } else this.rot = (this.rot + 90) % 360;
      this.say(`${this.t.turn} ${this.carry?.rot ?? this.rot}°`);
      return;
    }
    const kind = choice.slice('town_'.length) as LandKind;
    void this.model.act({ type: 'town_land', kind }).then((reason) => {
      console.info(`[town] land ${kind}: ${reason || 'opened'}`);
      if (reason) this.say(this.reason(reason));
      else if (this.model.seat) this.say(this.t.xr.mapLater);
    });
  }

  update(delta: number): void {
    if (this.gone) return;
    this.left -= delta;
    this.bar.scale.x = 0.22 * Math.max(0, this.left / LIMIT_S);
    if (this.left <= 0) {
      console.info('[town] building time is over');
      this.host.closed(this.t.xr.timeUp);
      return;
    }
    if (this.message && (this.messageLeft -= delta) <= 0) this.say(this.carry ? this.note : this.t.xr.hint, 0);
    this.folding = this.folding.filter((f) => {
      f.t += delta / FOLD_S;
      foldUp(f.obj, Math.min(1, f.t));
      return f.t < 1;
    });
    if ((this.second += delta) >= 1) {
      this.second = 0;
      // A frame whose time is up is drawn again as the finished building.
      const v = this.model.view();
      if (v.items.some((it) => it.ready && !this.readySeen.has(it.id))) this.redraw();
    }
    if (!this.page) return;
    for (const side of SIDES) {
      const s = this.host.select(side);
      const c = this.carry;
      if (c) {
        if (s.end && side === c.side && !c.tapped && performance.now() - c.at < TAP_MS) c.tapped = true;
        else if ((s.end && side === c.side && !c.tapped) || (s.start && c.tapped && !this.onButton(side))) {
          this.drop();
          return;
        }
      } else if (s.start && this.pick(side)) break;
    }
    if (this.carry) this.track();
  }

  private onButton(side: Side): boolean {
    for (let o = this.host.aimed(side); o; o = o.parent ?? undefined) if (o.name.startsWith('menu-')) return true;
    return false;
  }

  /** Takes up what `side`'s ray is on: a shelf piece or a placed item. */
  private pick(side: Side): boolean {
    const v = this.model.view();
    const sides = this.host.emulated() ? [side, ...SIDES.filter((s) => s !== side)] : [side];
    for (const from of sides) {
      for (let o = this.host.aimed(from); o; o = o.parent ?? undefined) {
        const id = o.userData.townShelf as string | undefined;
        if (id) {
          const a = assetOf(id)!;
          if (a.price > v.balance) {
            this.say(this.reason('not_enough_folds'));
            return true;
          }
          return this.take(from, id, '', this.rot);
        }
        const placeId = o.userData.placeId as string | undefined;
        const it = placeId && v.items.find((i) => i.id === placeId);
        if (it) return this.take(from, it.asset, it.id, it.rot);
        if (o === this.holder?.object3D) {
          // On the page but not on a building's own shape: the tile under the ray.
          if (!this.onPage(from)) return false;
          const x = Math.floor(this.p.x);
          const y = Math.floor(this.p.z);
          const under = v.items.find((i) => {
            if (i.land !== this.land) return false;
            const [w, h] = footprint(assetOf(i.asset)!, i.rot);
            return x >= i.x && x < i.x + w && y >= i.y && y < i.y + h;
          });
          return under ? this.take(from, under.asset, under.id, under.rot) : false;
        }
      }
    }
    return false;
  }

  private take(side: Side, asset: string, placeId: string, rot: number): boolean {
    this.carry = { side, asset, placeId, rot, at: performance.now(), tapped: false, over: false, x: NaN, y: NaN, fits: '' };
    const obj = placeId ? this.page?.items.get(placeId) : undefined;
    if (obj) obj.visible = false;
    console.info(`[town] ${placeId ? `took ${placeId}` : `took ${asset} from the shelf`} with the ${side} hand`);
    return true;
  }

  /** Where `side`'s ray meets the page's plane, in tiles, into `this.p`; false when it does not come down onto it. */
  private onPage(side: Side): boolean {
    const h = this.holder?.object3D;
    if (!h) return false;
    const ray = this.host.ray(side);
    ray.getWorldPosition(this.o);
    ray.getWorldQuaternion(this.q);
    this.d.set(0, 0, -1).applyQuaternion(this.q).add(this.o);
    h.worldToLocal(this.o);
    h.worldToLocal(this.d);
    this.d.sub(this.o);
    if (this.d.y > -1e-6) return false;
    const k = -this.o.y / this.d.y;
    this.p.copy(this.o).addScaledVector(this.d, k);
    const r = townRulesNow();
    return this.p.x > -PAGE_MARGIN && this.p.x < r.cols + PAGE_MARGIN && this.p.z > -PAGE_MARGIN && this.p.z < r.rows + PAGE_MARGIN;
  }

  /** The carried piece follows its ray: a shadow on the page, or a word on what letting go does. */
  private track(): void {
    const c = this.carry!;
    const a = assetOf(c.asset)!;
    const over = this.onPage(c.side);
    if (!over) {
      if (c.over || Number.isNaN(c.x)) {
        this.ghost.hide();
        this.carryNote(c.placeId ? this.t.xr.dropRemove(this.priceOf(c.placeId)) : this.t.xr.dropBack);
      }
      c.over = false;
      c.x = -1;
      return;
    }
    const [w, h] = footprint(a, c.rot);
    const x = Math.round(this.p.x - w / 2);
    const y = Math.round(this.p.z - h / 2);
    if (c.over && x === c.x && y === c.y) return;
    c.over = true;
    c.x = x;
    c.y = y;
    c.fits = this.model.fits(c.asset, this.land, x, y, c.rot, c.placeId);
    this.ghost.show(c.asset, x, y, c.rot, !c.fits);
    this.carryNote(c.fits ? this.reason(c.fits) : this.t.xr.carry(this.name(c.asset)));
  }

  private carryNote(text: string): void {
    this.note = text;
    if (!this.message) this.say(text, 0);
  }

  private priceOf(placeId: string): number {
    return this.model.view().items.find((i) => i.id === placeId)?.price ?? 0;
  }

  private drop(): void {
    const c = this.carry!;
    this.carry = undefined;
    this.ghost.hide();
    this.message = '';
    const name = this.name(c.asset);
    const done = (reason: string, said: string) => {
      console.info(`[town] ${c.placeId || c.asset}: ${reason || said}`);
      this.redraw();
      this.say(reason ? this.reason(reason) : said);
    };
    if (c.over && !Number.isNaN(c.x)) {
      if (c.fits) return done(c.fits, '');
      const at = { land: this.land, x: c.x, y: c.y, rot: c.rot };
      if (c.placeId) void this.model.act({ type: 'town_move', place_id: c.placeId, ...at }).then((r) => done(r, this.t.moved(name)));
      else void this.model.act({ type: 'town_place', asset: c.asset, ...at }).then((r) => done(r, this.t.placed(name)));
      return;
    }
    if (c.placeId) {
      const price = this.priceOf(c.placeId);
      void this.model.act({ type: 'town_remove', place_id: c.placeId }).then((r) => done(r, this.t.removed(name, price)));
      return;
    }
    this.redraw();
    this.say(this.t.xr.hint, 0);
  }

  // ------------------------------------------------------------ words

  private name(id: string): string {
    return this.t.names[id] ?? id;
  }

  private reason(code: string): string {
    return this.t.reasons[code] ?? this.t.reasons.other;
  }

  dispose(): void {
    if (this.gone) return;
    this.gone = true;
    this.unlisten();
    this.model.dispose();
    for (const e of [this.root, this.holder, this.shelf, ...this.kindRow, ...this.buttons.values()]) if (e?.active) this.host.remove(e);
  }
}
