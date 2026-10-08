import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Entity,
  type Material,
  type Object3D,
} from '@iwsdk/core';
import { Label } from '../art/label.js';
import { type PanelLine, softShadow, textPanel, ToolButton, type ToolIcon, type ToolLook } from '../art/tool-icon.js';
import { townMaterial } from '../art/town/kit.js';
import { getLang, getRoom, musicOn, ROOMS, setMusic, setRoom } from '../settings.js';
import { sfx } from '../audio.js';
import { T } from '../text.js';
import { assetOf, footprint, isSmall, LAND_KINDS, quarterAt, spotMiddle, townRulesNow, type Asset, type LandKind, type Placed } from './town-core.js';
import { TownModel } from './town-model.js';
import { SHELF_NAMES } from './town-names.js';
import { loadPieceIndex, loadShelf, pieceInfo } from './town-pieces.js';
import { buildPage, foldUp, Ghost, loadPage, pieceObject, type PageScene } from './town-scene.js';
import { factsOf, finishQuestion, type Question } from './town-facts.js';
import { skillTitle, unmarked } from './town-landmarks.js';
import { gradeOf, hasFacts, pageTiles, RETRY_MS, shapeOf, tries } from './town-maths.js';
import { TOWN_TEXT, waitText } from './town-text.js';

/**
 * MY FOLD TOWN in the headset: the desk is cleared and the town's newest land
 * lies on it alone, the shop's shelf standing on its right like a screen. As
 * with the game's crystals, a controller's grip held on a piece (on the shelf
 * or the land) takes it into the hand, and a hand's pinch does the same; it
 * is carried with its ray over a tile, which shows a green or orange shadow,
 * and let go to place it. Let go off the land, a placed piece is removed and
 * its Folds come back. A piece let go on the land stays chosen, marked under
 * it, with a small row of buttons above it to turn it, remove it or let it be,
 * and its card on the left. The town is saved with every change, so building
 * has no time limit.
 */

export type Side = 'left' | 'right';
export type TownChoice =
  | 'town_turn'
  | 'town_done'
  | 'town_plain'
  | 'town_river'
  | 'town_hills'
  | 'town_beach'
  | 'town_a0'
  | 'town_a1'
  | 'town_a2'
  | 'town_card'
  | 'town_left'
  | 'town_right'
  | 'town_remove'
  | 'town_zoom_in'
  | 'town_zoom_out'
  | 'town_pan'
  | 'town_shelf_big'
  | 'town_shelf_show'
  | 'town_room'
  | 'town_music';

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
  unbillboard(mesh: Mesh): void;
  /** Hides everything else on the desk (the book, the line, the title); returns what shows it again. */
  clearDesk(): () => void;
  /** A paper card on the desk at (x, z), pressed like the menu's. */
  button(choice: TownChoice, title: string, x: number, z: number, color: number): Entity;
  /** The pointer's ray space of a hand or controller. */
  ray(side: Side): Object3D;
  /** What that ray is on, if anything. */
  aimed(side: Side): Object3D | undefined;
  /** This frame's select (pinch or trigger) edges. */
  select(side: Side): { start: boolean; end: boolean };
  /** This frame's grip edges of a controller (never for a hand). */
  squeeze(side: Side): { start: boolean; end: boolean };
  /** Where a controller is held. */
  grip(side: Side): Object3D;
  /** Controllers in the hands, no tracked hand. */
  controllers(): boolean;
  /** A controller's A, B, X or Y button went down this frame: the piece turns. */
  turn(side: Side): boolean;
  /** The emulator's hands: a pinch may take what the other ray is on. */
  emulated(): boolean;
  /** The town is done with; `note` is said on the menu. */
  closed(note?: string): void;
}

const SIDES: readonly Side[] = ['right', 'left'];
/** One tile of the land on the desk, in metres: its 12 columns are 84 cm wide. */
const TILE = 0.07;
/** The middle of the land, front to back on the desk. */
const PAGE_Z = -0.17;
/** A pinch let go sooner than this is a tap: the piece stays on the ray until the next pinch. */
const TAP_MS = 300;
const MESSAGE_S = 2.6;
const FOLD_S = 0.7;
/** A landmark seen for the first time rises slower than a building. */
const RISE_S = 1.6;
/** How far off the page, in tiles, still counts as over it. */
const PAGE_MARGIN = 0.6;
/** A piece in the hand is a little smaller than on the land, and a hand carries it under its ray. */
const CARRY_SCALE = 0.8;
const HAND_CARRY_DROP = 0.05;
/**
 * Zoom steps of the land. Zoomed in, the land shows only through a window the
 * size of the whole land on the desk, and the hand tool drags it about.
 */
const ZOOMS = [1, 1.5, 2, 3];
/** The paper reaches this far past the tiles, so the window shows it whole unzoomed. */
const PAPER = 0.25;
/** The toolbar past the land's front edge on its right: zoom, the hand, the shelf shown or hidden, the room, the music and EXIT. */
const TOOL_W = 0.056;
const TOOL_H = 0.064;
/** The space between two chips. */
const TOOL_GAP = 0.006;
const TOOL_LEAN = -1;
/** The chips' icon line, bolder than a web icon's as the desk menu's are. */
const TOOL_STROKE = 1.9;
/** Each chip's soft shadow: how far it spreads and where it falls, down and to the right as the home page's. */
const TOOL_BLUR = 0.007;
const TOOL_SHADOW = new Vector3(0.0018, -0.0035, -0.001);

/**
 * The shelf stands on the right of the land and leans its face to the
 * player: two rows of tabs at the top, three rows of four pieces each on its
 * own ledge with its price under it, and the page arrows at the bottom.
 */
const SHELF_AT = new Vector3(0.72, 0, -0.08);
const SHELF_TURN = -0.5;
const SHELF_COLS = 4;
const CELL_W = 0.11;
const SHELF_W = SHELF_COLS * CELL_W + 0.02;
const SHELF_H = 0.56;
const TAB_Y = [0.525, 0.478];
/** A tab's name; a name of two parts joined by & is said on two smaller lines so it stays inside its tab. */
const TAB_TEXT = 0.022;
const TAB_TEXT_TWO = 0.016;
const LEDGE_Y = [0.33, 0.215, 0.1];
const PER_PAGE = 12;
const PAGER_Y = 0.035;
/** The shelf's enlarge button, standing on its top right corner; pressed, the shelf stands twice as big about its middle, its left edge where it was. */
const UP = new Vector3(0, 1, 0);
/** The box a shelf piece fits in as it stands turned and leaning, so none reaches past its ledge, its neighbours or the board. */
const FIT_W = CELL_W - 0.016;
const FIT_H = 0.085;
const FIT_D = 0.055;
/** Shelf pieces are turned a little and lean back, so they show a side and their top as well as the front. */
const MINI_TURN = 0.45;
const MINI_TILT = 0.3;
/** The title, the Folds and the hint stand over the land's far edge, large enough to read from the chair. */
const HEADER = new Vector3(0, 0.3, -0.5);
const HEADER_SCALE = 1.5;
/**
 * A building's card is one paper panel in the toolbar's colours standing left
 * of the land, turned towards the player; its answers and its close button
 * are cells along its foot. Its foot's middle, in the desk's frame:
 */
const CARD = new Vector3(-0.64, 0.07, -0.06);
const CARD_TURN = 0.55;
const CARD_LEAN = -0.12;
/** A line's letters are this many times the height it is written with, in metres, to be read from the chair. */
const CARD_TEXT = 1.85;
const CARD_MAX_W = 0.4;
const CARD_MIN_W = 0.24;
const CARD_PAD = 0.022;
/** The card's soft shadow, as the toolbar's chips cast. */
const CARD_BLUR = 0.012;
const CELL_H = 0.06;
const CELL_GAP = 0.01;
/** The home page's colours: dark ink, a blue heading, coral for what matters, teal and coral buttons. */
const CARD_INK = 0x3a3f4b;
const CARD_HEAD = 0x3469c4;
const CARD_ACCENT = 0xf2716b;
const CELL_MATS = {
  on: new MeshBasicMaterial({ color: 0x3fb6a0, toneMapped: false }),
  accent: new MeshBasicMaterial({ color: 0xf2716b, toneMapped: false }),
};
const cellGeo = new PlaneGeometry(1, 1);
const KIND_COLOR: Record<LandKind, number> = { plain: 0x5aa469, river: 0x3469c4, hills: 0x9b6bc2, beach: 0xe0a33c };
const ORANGE = 0xf28c38;
const TEAL = 0x3fb6a0;

const col = (i: number) => (i - (SHELF_COLS - 1) / 2) * CELL_W;
const slotGeo = new BoxGeometry(CELL_W - 0.006, 0.105, 0.07);
const slotMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const tabGeo = new BoxGeometry(CELL_W - 0.008, 0.04, 0.01);
const stepGeo = new BoxGeometry(0.08, 0.05, 0.02);
const boardGeo = new BoxGeometry(SHELF_W, SHELF_H, 0.012);
const ledgeGeo = new BoxGeometry(CELL_W - 0.012, 0.005, 0.06);
const plateMat = new MeshStandardMaterial({ color: 0xf6ead0, roughness: 1 });
const ledgeMat = new MeshStandardMaterial({ color: 0xe6d3ad, roughness: 1 });
const barGeo = new PlaneGeometry(1, 1);
const barMat = new MeshBasicMaterial({ color: TEAL });
const spareMat = new MeshBasicMaterial();
const markGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const markMat = new MeshBasicMaterial({ color: TEAL, transparent: true, opacity: 0.45, depthWrite: false });
/** The window's four sides in the world; the land's pieces and its mark are cut there, the shelf's are not. */
const clipPlanes = [new Plane(), new Plane(), new Plane(), new Plane()];
const clipMat = townMaterial().clone();
clipMat.clippingPlanes = clipPlanes;
markMat.clippingPlanes = clipPlanes;
/** Materials every page and the shelf share, never freed with one of them. */
const SHARED = new Set<Material>([
  townMaterial(),
  clipMat,
  slotMat,
  plateMat,
  ledgeMat,
  barMat,
  markMat,
  ...Object.values(CELL_MATS),
]);
const fitBox = new Box3();
const fitSize = new Vector3();
const fitMid = new Vector3();

type Line = [text: string, height: number, ink?: number];
/** A cell along a card's foot: what it does, its word and its colour. */
type Cell = [choice: TownChoice, word: string, look: 'on' | 'accent'];

interface Card {
  /** The placed item, or "" for the page's landmark. */
  id: string;
  /** The panel, a ray target for its cells. */
  entity: Entity;
  q?: Question;
  attempt: number;
  answered: boolean;
  /** Whether the item was finished when the card was drawn. */
  ready: boolean;
}

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
  /** The quarter of the tile aimed at, for a small piece. */
  spot?: number;
  fits: string;
  /** Taken by a controller's grip: let go when the grip opens. */
  grip: boolean;
  /** The piece itself, in the hand. */
  model: Group;
}

export class TownDesk {
  private t = TOWN_TEXT[getLang()];
  private root: Entity;
  private holder?: Entity;
  private shelf?: Entity;
  private shelfKey = '';
  /** The shop's part on the shelf, and its page. */
  private shelfOn = SHELF_NAMES[0][0];
  private shelfPage = 0;
  private restoreDesk: () => void;
  private page?: PageScene;
  private ghost = new Ghost();
  private buttons = new Map<TownChoice, Entity>();
  private kindRow: Entity[] = [];
  private kindCaption?: Label;
  private folds: Label;
  private status: Label;
  private land = 0;
  private carry?: Carry;
  private card?: Card;
  private rot = 0;
  /** The placed piece whose card is open, its tiles marked on the land. */
  private selected = '';
  private mark?: Mesh;
  /** The chosen piece's own toolbar, at the land's front left: its name, turn left and right, remove and done. */
  private pieceRow?: Entity;
  private pieceName?: Label;
  private removeButton?: ToolButton;
  /** How near the land is drawn, and the tile at the middle of its window. */
  private zoom = 1;
  private view = { x: 0, z: 0 };
  /** The hand tool: a pinch or grip on the land drags it instead of taking a piece. */
  private panMode = false;
  private panning?: { side: Side; grip: boolean; x: number; z: number };
  private panFrom = new Vector3();
  private viewRow?: Entity;
  private shelfBig = false;
  private bigButton?: ToolButton;
  private panButton?: ToolButton;
  private showButton?: ToolButton;
  private roomButton?: ToolButton;
  private musicButton?: ToolButton;
  private shelfShown = true;
  private message = '';
  /** What letting go of the carried piece would do, shown again after a message. */
  private note = '';
  private messageLeft = 0;
  private second = 0;
  private readySeen = new Set<string>();
  private folding: { obj: Object3D; t: number; s: number }[] = [];
  private unlisten: () => void;
  private gone = false;

  private o = new Vector3();
  private d = new Vector3();
  private p = new Vector3();
  private hold = new Vector3();
  private q = new Quaternion();

  static async open(host: TownHost): Promise<TownDesk> {
    const [model] = await Promise.all([TownModel.open(), loadPieceIndex()]);
    // The newest land is drawn whole at once; the shelf's first part fills in as it arrives.
    const v = model.view();
    const last = Math.max(0, v.lands.length - 1);
    void loadShelf(SHELF_NAMES[0][0]).catch(() => undefined);
    await loadPage(last, v.items, model.doc.landmarks[last]).catch((error: unknown) => console.warn(`[town] pieces: ${String(error)}`));
    return new TownDesk(host, model);
  }

  private constructor(
    private host: TownHost,
    private model: TownModel,
  ) {
    this.restoreDesk = host.clearDesk();
    const g = new Group();
    g.name = 'town-desk';
    this.root = host.add(g, false);
    const header = new Group();
    header.position.copy(HEADER);
    header.scale.setScalar(HEADER_SCALE);
    g.add(header);
    this.text(this.t.title, 0.034, header, 0.092);
    this.folds = this.text('', 0.026, header, 0.05);
    this.status = this.text('', 0.02, header, 0.012);
    for (const it of model.view().items) if (it.ready) this.readySeen.add(it.id);
    this.unlisten = model.onChange(() => this.redraw());
    this.redraw();
    this.fillShelf(this.shelfOn);
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
      h.position.set((-r.cols * TILE) / 2, 0.002, PAGE_Z - (r.rows * TILE) / 2);
      h.scale.setScalar(TILE);
      h.add(this.ghost.root);
      this.holder = this.host.add(h, true);
      this.view = { x: r.cols / 2, z: r.rows / 2 };
      this.viewRow = this.host.add(this.viewButtons(), true);
      this.pieceRow = this.host.add(this.pieceButtons(), true);
    }
    const h = this.holder.object3D!;
    if (this.page) h.remove(this.page.root);
    this.page = buildPage(kind, this.land, items, this.model.doc.landmarks[this.land]);
    this.page.root.traverse(this.toClip);
    h.add(this.page.root);
    for (const it of items) {
      const obj = this.page.items.get(it.id);
      if (obj && it.id === this.carry?.placeId) obj.visible = false;
      if (!it.ready || this.readySeen.has(it.id)) continue;
      this.readySeen.add(it.id);
      if (obj) {
        this.folding.push({ obj: obj.children[0], t: 0, s: FOLD_S });
        this.say(this.t.finished(this.name(it.asset)));
        sfx('sparkle');
      }
    }
    this.refreshView();
    const lm = this.model.doc.landmarks[this.land];
    const raised = this.page.root.getObjectByName('landmark');
    if (lm && raised && unmarked('grown', this.model.owner, [lm]).length) {
      this.folding.push({ obj: raised.children[0], t: 0, s: RISE_S });
      this.say(this.t.landmarkRises(this.name(lm.landmark), skillTitle(lm.skill, getLang())), MESSAGE_S * 2);
      sfx('sparkle');
      console.info(`[town] landmark ${lm.landmark} rises, from ${lm.skill}`);
    }
  }

  /**
   * The shop's shelf standing on the right of the land: its parts as tabs,
   * then one page of that part's pieces, open ones first, each with its price.
   */
  private drawShelf(balance: number, buildings: number): void {
    if (!this.shelf) {
      const g = new Group();
      g.name = 'town-shelf';
      g.position.copy(SHELF_AT);
      g.rotation.y = SHELF_TURN;
      const board = new Mesh(boardGeo, plateMat);
      board.position.set(0, SHELF_H / 2, -0.04);
      g.add(board);
      this.shelf = this.host.add(g, true);
    }
    const g = this.shelf.object3D!;
    for (const c of [...g.children]) if (c.name === 'town-shelf-page') this.drop3D(c);
    const content = new Group();
    content.name = 'town-shelf-page';
    g.add(content);
    const r = townRulesNow();
    const lang = getLang();
    SHELF_NAMES.forEach(([shelf, en, id], i) => {
      const on = shelf === this.shelfOn;
      const tab = new Group();
      tab.name = `town-tab-${shelf}`;
      tab.userData.townTab = shelf;
      tab.position.set(col(i % SHELF_COLS), TAB_Y[Math.floor(i / SHELF_COLS)], -0.028);
      tab.add(new Mesh(tabGeo, slotMat));
      if (on) {
        const mark = new Mesh(barGeo, barMat);
        mark.scale.set(CELL_W - 0.016, 0.004, 1);
        mark.position.set(0, -0.017, 0.006);
        tab.add(mark);
      }
      const name = lang === 'id' ? id : en;
      const parts = name.split(' & ');
      const lines = parts.length > 1 ? [`${parts[0]} &`, parts[1]] : parts;
      const height = lines.length > 1 ? TAB_TEXT_TWO : TAB_TEXT;
      lines.forEach((line, k) => {
        const l = new Label(line, { height, ink: on ? TEAL : 0x6b6f7a });
        l.mesh.position.set(0, ((lines.length - 1) / 2 - k) * height * 1.05, 0.006 + k * 0.001);
        tab.add(l.mesh);
      });
      content.add(tab);
    });
    const here = r.catalog.filter((a) => pieceInfo(a.id)?.shelf === this.shelfOn);
    const sorted = [...here.filter((a) => buildings >= a.unlock_at), ...here.filter((a) => buildings < a.unlock_at)];
    const pages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
    this.shelfPage = Math.min(this.shelfPage, pages - 1);
    sorted.slice(this.shelfPage * PER_PAGE, (this.shelfPage + 1) * PER_PAGE).forEach((a, i) => {
      const locked = buildings < a.unlock_at;
      const slot = new Group();
      slot.name = `town-shelf-${a.id}`;
      slot.userData.townShelf = a.id;
      slot.position.set(col(i % SHELF_COLS), LEDGE_Y[Math.floor(i / SHELF_COLS)], 0);
      const hit = new Mesh(slotGeo, slotMat);
      hit.position.y = 0.03;
      slot.add(hit);
      const ledge = new Mesh(ledgeGeo, ledgeMat);
      ledge.position.y = -0.0025;
      slot.add(ledge);
      const piece = this.miniature(a);
      if (locked) piece.scale.multiplyScalar(0.7);
      slot.add(piece);
      const text = locked ? this.t.xr.lockedShort(a.unlock_at) : this.t.price(a.price);
      const ink = locked ? 0x8a8f9c : a.price > balance ? ORANGE : undefined;
      const price = new Label(text, ink === undefined ? { height: 0.018 } : { height: 0.018, ink });
      price.mesh.position.set(0, -0.017, 0.032);
      slot.add(price.mesh);
      content.add(slot);
    });
    if (pages > 1) {
      for (const step of [-1, 1] as const) {
        const b = new Group();
        b.name = `town-step-${step}`;
        b.userData.townStep = step;
        b.position.set(step * 0.12, PAGER_Y, -0.02);
        b.add(new Mesh(stepGeo, slotMat));
        const l = new Label(step < 0 ? '<' : '>', { height: 0.032 });
        l.mesh.position.z = 0.012;
        b.add(l.mesh);
        content.add(b);
      }
      const n = new Label(this.t.xr.page(this.shelfPage + 1, pages), { height: 0.024, card: false });
      n.mesh.position.set(0, PAGER_Y, -0.02);
      content.add(n.mesh);
    }
  }

  /** Another part of the shop, or another page of it, on the shelf. */
  private turnShelf(shelf: string, page: number): void {
    this.shelfOn = shelf;
    this.shelfPage = Math.max(0, page);
    const v = this.model.view();
    this.drawShelf(v.balance, v.buildings);
    this.shelfKey = `${v.balance}|${v.buildings}`;
    // The part's models come in one pack; they fill the slots as it arrives.
    this.fillShelf(shelf);
  }

  /**
   * A shelf piece is fitted to its slot by its size when drawn, so a part
   * whose models were not here yet is drawn again once they are.
   */
  private fillShelf(shelf: string): void {
    loadShelf(shelf).then(
      () => {
        if (this.gone || shelf !== this.shelfOn) return;
        const v = this.model.view();
        this.drawShelf(v.balance, v.buildings);
      },
      (error: unknown) => console.warn(`[town] shelf ${shelf}: ${String(error)}`),
    );
  }

  /** A shelf piece as a small model on its ledge, its whole size inside one slot. */
  private miniature(a: Asset): Group {
    const piece = pieceObject(a.id);
    piece.rotation.y = MINI_TURN;
    const lean = new Group();
    lean.rotation.x = MINI_TILT;
    lean.add(piece);
    // Measured as it stands turned and leaning, then scaled into the slot and stood on the ledge.
    lean.updateMatrixWorld(true);
    fitBox.setFromObject(lean);
    fitBox.getSize(fitSize);
    fitBox.getCenter(fitMid);
    const k = Math.min(FIT_W / Math.max(fitSize.x, 1e-3), FIT_H / Math.max(fitSize.y, 1e-3), FIT_D / Math.max(fitSize.z, 1e-3));
    lean.scale.setScalar(k);
    lean.position.set(-fitMid.x * k, -fitBox.min.y * k, -fitMid.z * k);
    const slot = new Group();
    slot.add(lean);
    return slot;
  }

  /**
   * Takes `obj` off the desk. The town's models and materials are shared by
   * every page and the shelf, so only a label's own paper is freed.
   */
  private drop3D(obj: Object3D): void {
    obj.removeFromParent();
    obj.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      this.host.unbillboard(m);
      if (!SHARED.has(m.material as Material)) {
        (m.material as MeshBasicMaterial).map?.dispose();
        (m.material as Material).dispose();
        m.geometry.dispose();
      }
    });
  }

  /** Before an entity goes: its shared models and materials are kept for the next time. */
  private spare(obj: Object3D | undefined): void {
    obj?.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && SHARED.has(m.material as Material)) {
        m.geometry = new BufferGeometry();
        m.material = spareMat;
      }
    });
  }

  /** The four kinds of land as cards in front of the land, for a first or a new page. */
  private showKinds(on: boolean): void {
    if (on === this.kindRow.length > 0) return;
    for (const e of this.kindRow) this.host.remove(e);
    this.kindRow = [];
    this.kindCaption?.mesh.removeFromParent();
    this.kindCaption = undefined;
    if (!on) return;
    LAND_KINDS.forEach((k, i) => {
      this.kindRow.push(this.host.button(`town_${k}` as TownChoice, this.t.kinds[k][0], -0.27 + i * 0.18, 0.13, KIND_COLOR[k]));
    });
    const caption = new Label(this.model.view().lands.length ? this.t.newLand : this.t.pickLand, { height: 0.022 });
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
    if (choice === 'town_card') {
      this.closeCard();
      return;
    }
    if (choice === 'town_zoom_in' || choice === 'town_zoom_out') {
      const i = ZOOMS.indexOf(this.zoom) + (choice === 'town_zoom_in' ? 1 : -1);
      if (i < 0 || i >= ZOOMS.length) return;
      this.zoom = ZOOMS[i];
      if (this.zoom === 1) this.setPan(false);
      this.refreshView();
      this.say(this.t.xr.zoomed(this.zoom));
      console.info(`[town] zoom ${this.zoom}x`);
      return;
    }
    if (choice === 'town_room') {
      // The same rooms as the desk menu's ROOM card, in turn.
      const next = ROOMS[(ROOMS.indexOf(getRoom()) + 1) % ROOMS.length];
      console.info(`[town] room ${next}`);
      setRoom(next);
      this.roomButton?.set('room', 'plain', T.roomName[next]);
      return;
    }
    if (choice === 'town_music') {
      // The desk menu's MUSIC, here too: a long build is often wanted quiet.
      setMusic(!musicOn());
      console.info(`[town] music ${musicOn() ? 'on' : 'off'}`);
      this.musicButton?.set(musicOn() ? 'music' : 'musicOff', musicOn() ? 'plain' : 'off');
      return;
    }
    if (choice === 'town_shelf_show') {
      this.showShelf(!this.shelfShown);
      return;
    }
    if (choice === 'town_shelf_big') {
      this.setShelfBig(!this.shelfBig);
      return;
    }
    if (choice === 'town_pan') {
      this.setPan(!this.panMode);
      this.say(this.panMode ? this.t.xr.panOn : this.t.xr.panOff);
      return;
    }
    if (choice === 'town_left' || choice === 'town_right') {
      void this.turnPlaced(choice === 'town_left' ? 270 : 90);
      return;
    }
    if (choice === 'town_remove') {
      void this.removeSelected();
      return;
    }
    if (choice === 'town_a0' || choice === 'town_a1' || choice === 'town_a2') {
      void this.answer(Number(choice.slice('town_a'.length)));
      return;
    }
    if (choice === 'town_turn') {
      if (this.carry) {
        this.carry.rot = (this.carry.rot + 90) % 360;
        this.carry.x = NaN;
        this.carry.model.rotation.y = -(this.carry.rot * Math.PI) / 180;
      } else if (this.selected) {
        void this.turnPlaced(90);
        return;
      } else this.rot = (this.rot + 90) % 360;
      this.say(`${this.t.turn} ${this.carry?.rot ?? this.rot}°`);
      console.info(`[town] turned to ${this.carry?.rot ?? this.rot}°`);
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
    if (this.message && (this.messageLeft -= delta) <= 0) this.say(this.carry ? this.note : this.t.xr.hint, 0);
    this.folding = this.folding.filter((f) => {
      f.t += delta / f.s;
      foldUp(f.obj, Math.min(1, f.t));
      return f.t < 1;
    });
    if ((this.second += delta) >= 1) {
      this.second = 0;
      // A frame whose time is up is drawn again as the finished building.
      const v = this.model.view();
      if (v.items.some((it) => it.ready && !this.readySeen.has(it.id))) this.redraw();
      this.refreshCard();
    }
    if (!this.page) return;
    this.placeClip();
    for (const side of SIDES) if (this.host.turn(side)) this.press('town_turn');
    for (const side of SIDES) {
      const s = this.host.select(side);
      const g = this.host.squeeze(side);
      const pn = this.panning;
      if (pn) {
        if (side === pn.side && (pn.grip ? g.end : s.end)) {
          this.panning = undefined;
          this.refreshView();
        }
        continue;
      }
      const c = this.carry;
      if (c?.grip) {
        if (g.end && side === c.side) {
          this.drop();
          return;
        }
      } else if (c) {
        if (s.end && side === c.side && !c.tapped && performance.now() - c.at < TAP_MS) c.tapped = true;
        else if ((s.end && side === c.side && !c.tapped) || (s.start && c.tapped && !this.onButton(side))) {
          this.drop();
          return;
        }
      } else if ((g.start && this.pick(side, true)) || (s.start && this.pick(side, false))) break;
    }
    if (this.panning) this.panAlong();
    if (this.carry) this.track();
  }

  // ------------------------------------------------------------ zoom and the hand tool

  /** The toolbar: zoom out, zoom in, the hand tool, the shelf shown and enlarged, the room, the music and EXIT, each a tile with its icon and word. */
  private viewButtons(): Group {
    const r = townRulesNow();
    const tools: [TownChoice, ToolIcon, string, ToolLook][] = [
      ['town_zoom_out', 'zoomOut', this.t.xr.zoomOut, 'plain'],
      ['town_zoom_in', 'zoomIn', this.t.xr.zoomIn, 'plain'],
      ['town_pan', 'pan', this.t.xr.pan, 'plain'],
      ['town_shelf_show', 'shown', this.t.xr.shelf, 'on'],
      ['town_shelf_big', 'enlarge', this.t.xr.big, 'plain'],
      ['town_room', 'room', T.roomName[getRoom()], 'plain'],
      ['town_music', musicOn() ? 'music' : 'musicOff', T.musicCaption, musicOn() ? 'plain' : 'off'],
      ['town_done', 'exit', this.t.xr.done, 'accent'],
    ];
    const w = this.rowW(tools.length);
    const row = new Group();
    row.name = 'town-view';
    row.position.set((r.cols / 2 + PAPER) * TILE - w / 2, 0.025, PAGE_Z + (r.rows / 2 + PAPER) * TILE + 0.05);
    row.rotation.x = TOOL_LEAN;
    this.chips(row, 'town-view', tools).forEach((b, i) => {
      const choice = tools[i][0];
      if (choice === 'town_pan') this.panButton = b;
      if (choice === 'town_shelf_show') this.showButton = b;
      if (choice === 'town_shelf_big') this.bigButton = b;
      if (choice === 'town_room') this.roomButton = b;
      if (choice === 'town_music') this.musicButton = b;
    });
    return row;
  }

  /** A toolbar of `n` chips, end to end. */
  private rowW(n: number): number {
    return n * TOOL_W + (n - 1) * TOOL_GAP;
  }

  /**
   * The tools as one line of separate paper chips in the desk menu's colours,
   * each with its icon over its word and a soft shadow under it, centred on `row`.
   */
  private chips(row: Group, prefix: string, tools: [TownChoice, ToolIcon, string, ToolLook][]): ToolButton[] {
    const w = this.rowW(tools.length);
    return tools.map(([choice, icon, word, look], i) => {
      const b = new ToolButton(icon, word, TOOL_W, TOOL_H, look, { alone: true, bare: true, theme: 'home', stroke: TOOL_STROKE });
      b.mesh.name = `${prefix}-${choice}`;
      b.mesh.userData.townOpt = choice;
      b.mesh.position.set(-w / 2 + TOOL_W / 2 + i * (TOOL_W + TOOL_GAP), 0, 0.0015);
      // The shadow rides on its chip, so it dips with it and a ray on it still finds the chip.
      const shade = softShadow(TOOL_W, TOOL_H, TOOL_BLUR);
      shade.position.copy(TOOL_SHADOW);
      b.mesh.add(shade);
      row.add(b.mesh);
      return b;
    });
  }

  /** A pressed icon shrinks a moment and comes back, so one shot shows it was taken. */
  private dip(o: Object3D): void {
    if (o.userData.dipping) return;
    o.userData.dipping = true;
    const was = o.scale.x;
    o.scale.setScalar(was * 0.88);
    setTimeout(() => {
      o.scale.setScalar(was);
      o.userData.dipping = false;
    }, 120);
  }

  /**
   * The chosen piece's toolbar, the same chips as the view's, at the land's
   * front left where a hand reaches it as easily: hidden until a piece is chosen.
   */
  private pieceButtons(): Group {
    const r = townRulesNow();
    const tools: [TownChoice, ToolIcon, string, ToolLook][] = [
      ['town_left', 'turnLeft', this.t.xr.turnLeft, 'plain'],
      ['town_right', 'turnRight', this.t.xr.turnRight, 'plain'],
      ['town_remove', 'trash', this.t.remove, 'plain'],
      ['town_card', 'check', this.t.xr.ok, 'accent'],
    ];
    const w = this.rowW(tools.length);
    const row = new Group();
    row.name = 'town-piece';
    row.position.set(-(r.cols / 2 + PAPER) * TILE + w / 2, 0.025, PAGE_Z + (r.rows / 2 + PAPER) * TILE + 0.05);
    row.rotation.x = TOOL_LEAN;
    this.chips(row, 'town-piece', tools).forEach((b, i) => {
      if (tools[i][0] === 'town_remove') this.removeButton = b;
    });
    this.pieceName = new Label(' ', { height: 0.016 });
    this.pieceName.mesh.position.set(0, TOOL_H / 2 + 0.014, 0.0015);
    // Only the buttons meet the ray.
    (this.pieceName.mesh as Object3D & { pointerEvents?: string }).pointerEvents = 'none';
    row.add(this.pieceName.mesh);
    this.showPieceRow(row, false);
    return row;
  }

  private showPieceRow(row: Object3D | undefined, on: boolean): void {
    if (!row) return;
    row.visible = on;
    (row as Object3D & { pointerEvents?: string }).pointerEvents = on ? undefined : 'none';
  }

  /** The shelf twice as big or back as it was, grown about its middle and to the right so it stays clear of the land and no higher than it must. */
  private setShelfBig(big: boolean): void {
    const g = this.shelf?.object3D;
    if (!g) return;
    this.shelfBig = big;
    const k = big ? 2 : 1;
    g.scale.setScalar(k);
    g.position.copy(SHELF_AT).add(new Vector3(((k - 1) * SHELF_W) / 2, (-(k - 1) * SHELF_H) / 2, 0).applyAxisAngle(UP, SHELF_TURN));
    this.bigButton?.set(big ? 'shrink' : 'enlarge', big ? 'on' : 'plain');
    console.info(`[town] shelf ${big ? 'twice as big' : 'as it was'}`);
  }

  /** The shelf on the desk or out of sight and out of the rays, so the land has the room to itself. */
  private showShelf(on: boolean): void {
    const g = this.shelf?.object3D as (Object3D & { pointerEvents?: string }) | undefined;
    if (!g) return;
    this.shelfShown = on;
    g.visible = on;
    g.pointerEvents = on ? undefined : 'none';
    this.showButton?.set(on ? 'shown' : 'hidden', on ? 'on' : 'plain');
    console.info(`[town] shelf ${on ? 'shown' : 'hidden'}`);
  }

  private setPan(on: boolean): void {
    this.panMode = on;
    this.panButton?.set('pan', on ? 'on' : 'plain');
  }

  /** Half the window, in tiles of the land as it is zoomed. */
  private windowHalf(): [number, number] {
    const r = townRulesNow();
    return [(r.cols / 2 + PAPER) / this.zoom, (r.rows / 2 + PAPER) / this.zoom];
  }

  /** Scales and moves the land so the tile at the middle of the view sits at the middle of the window. */
  private applyView(): void {
    const h = this.holder?.object3D;
    if (!h) return;
    const r = townRulesNow();
    const [hw, hd] = this.windowHalf();
    this.view.x = Math.min(Math.max(this.view.x, hw - PAPER), r.cols + PAPER - hw);
    this.view.z = Math.min(Math.max(this.view.z, hd - PAPER), r.rows + PAPER - hd);
    const k = TILE * this.zoom;
    h.scale.setScalar(k);
    h.position.set(-this.view.x * k, 0.002, PAGE_Z - this.view.z * k);
  }

  /** Whether tiles from (x, y), `w` by `d`, reach into the window. */
  private inView(x: number, y: number, w: number, d: number): boolean {
    const [hw, hd] = this.windowHalf();
    return x + w > this.view.x - hw && x < this.view.x + hw && y + d > this.view.z - hd && y < this.view.z + hd;
  }

  /** The view as it is, and the pieces wholly outside the window hidden and out of the rays. */
  private refreshView(): void {
    this.applyView();
    const page = this.page;
    if (!page) return;
    type Pointed = Object3D & { pointerEvents?: string };
    for (const it of this.model.view().items) {
      const g = page.items.get(it.id) as Pointed | undefined;
      if (!g || it.land !== this.land) continue;
      const [w, d] = footprint(assetOf(it.asset)!, it.rot);
      const seen = this.inView(it.x, it.y, w, d);
      g.visible = seen && it.id !== this.carry?.placeId;
      g.pointerEvents = seen ? undefined : 'none';
    }
    const raised = page.root.getObjectByName('landmark') as Pointed | undefined;
    const plot = townRulesNow().lands.find((l) => l.kind === this.model.view().lands[this.land])?.plot;
    if (raised && plot) {
      const seen = this.inView(plot[0], plot[1], 2, 1);
      raised.visible = seen;
      raised.pointerEvents = seen ? undefined : 'none';
    }
    this.placeMark();
  }

  /** The window's sides, from where the desk stands this frame. */
  private placeClip(): void {
    const r = townRulesNow();
    const hw = (r.cols / 2 + PAPER) * TILE + 0.002;
    const hd = (r.rows / 2 + PAPER) * TILE + 0.002;
    const m = this.root.object3D!.matrixWorld;
    clipPlanes[0].normal.set(1, 0, 0);
    clipPlanes[0].constant = hw;
    clipPlanes[1].normal.set(-1, 0, 0);
    clipPlanes[1].constant = hw;
    clipPlanes[2].normal.set(0, 0, 1);
    clipPlanes[2].constant = hd - PAGE_Z;
    clipPlanes[3].normal.set(0, 0, -1);
    clipPlanes[3].constant = hd + PAGE_Z;
    for (const p of clipPlanes) p.applyMatrix4(m);
  }

  /** The land's own pieces are drawn with the material the window cuts. */
  private toClip = (o: Object3D): void => {
    const m = o as Mesh;
    if (m.isMesh && m.material === townMaterial()) m.material = clipMat;
  };

  /** The hand tool takes hold of the land where `side`'s ray meets it. */
  private startPan(side: Side, grip: boolean): boolean {
    if (!this.hit(side, this.root.object3D!)) return false;
    this.panFrom.copy(this.p);
    this.panning = { side, grip, x: this.view.x, z: this.view.z };
    return true;
  }

  /** The land follows the hand's ray, the tile taken staying under it. */
  private panAlong(): void {
    const pn = this.panning!;
    if (!this.hit(pn.side, this.root.object3D!)) return;
    const k = TILE * this.zoom;
    this.view.x = pn.x - (this.p.x - this.panFrom.x) / k;
    this.view.z = pn.z - (this.p.z - this.panFrom.z) / k;
    this.applyView();
  }

  private onButton(side: Side): boolean {
    for (let o = this.host.aimed(side); o; o = o.parent ?? undefined) if (o.name.startsWith('menu-')) return true;
    return false;
  }

  /** Takes up what `side`'s ray is on: a shelf piece or a placed item; `grip` when the controller's grip took it. */
  private pick(side: Side, grip: boolean): boolean {
    const v = this.model.view();
    const sides = this.host.emulated() && !this.host.controllers() ? [side, ...SIDES.filter((s) => s !== side)] : [side];
    for (const from of sides) {
      if (this.panMode) {
        // A piece's own buttons still take a press with the hand tool on.
        for (let o = this.host.aimed(from); o; o = o.parent ?? undefined) {
          if (o.userData.townOpt) break;
          if (o === this.holder?.object3D) return this.startPan(from, grip);
        }
      }
      for (let o = this.host.aimed(from); o; o = o.parent ?? undefined) {
        const tab = o.userData.townTab as string | undefined;
        if (tab) {
          this.turnShelf(tab, 0);
          return true;
        }
        const step = o.userData.townStep as number | undefined;
        if (step) {
          this.turnShelf(this.shelfOn, this.shelfPage + step);
          return true;
        }
        const id = o.userData.townShelf as string | undefined;
        if (id) {
          const a = assetOf(id)!;
          if (v.buildings < a.unlock_at) {
            this.say(this.reason('locked'));
            return true;
          }
          if (a.price > v.balance) {
            this.say(this.reason('not_enough_folds'));
            console.info(`[town] ${id} costs ${a.price}, ${v.balance} Folds kept`);
            return true;
          }
          return this.take(from, id, '', this.rot, grip);
        }
        const opt = o.userData.townOpt as TownChoice | undefined;
        if (opt) {
          this.dip(o);
          this.press(opt);
          return true;
        }
        const placeId = o.userData.placeId as string | undefined;
        const it = placeId && v.items.find((i) => i.id === placeId);
        if (it) return this.take(from, it.asset, it.id, it.rot, grip);
        if (o.name === 'landmark' && this.model.doc.landmarks[this.land]) {
          this.showLandmark();
          return true;
        }
        if (o === this.holder?.object3D) {
          // On the page but not on a building's own shape: the tile under the ray.
          if (!this.onPage(from)) return false;
          const x = Math.floor(this.p.x);
          const y = Math.floor(this.p.z);
          const q = quarterAt(this.p.x, this.p.z);
          const here = v.items.filter((i) => {
            if (i.land !== this.land) return false;
            const [w, h] = footprint(assetOf(i.asset)!, i.rot);
            return x >= i.x && x < i.x + w && y >= i.y && y < i.y + h;
          });
          // The small piece on that quarter first, then the whole tile's.
          const under = here.find((i) => i.spot === q) ?? here.find((i) => i.spot === undefined) ?? here[0];
          return under ? this.take(from, under.asset, under.id, under.rot, grip) : false;
        }
      }
    }
    return false;
  }

  private take(side: Side, asset: string, placeId: string, rot: number, grip: boolean): boolean {
    this.closeCard();
    const model = new Group();
    model.name = 'town-carried';
    model.add(pieceObject(asset));
    model.scale.setScalar(TILE * CARRY_SCALE);
    model.rotation.y = -(rot * Math.PI) / 180;
    // It goes with the ray and must not stop it.
    (model as Object3D & { pointerEvents?: string }).pointerEvents = 'none';
    this.root.object3D!.add(model);
    this.carry = { side, asset, placeId, rot, at: performance.now(), tapped: false, over: false, x: NaN, y: NaN, fits: '', grip, model };
    sfx('grab');
    this.carryAlong();
    const obj = placeId ? this.page?.items.get(placeId) : undefined;
    if (obj) obj.visible = false;
    console.info(`[town] ${placeId ? `took ${placeId}` : `took ${asset} from the shelf`} with the ${side} ${grip ? 'grip' : 'hand'}`);
    return true;
  }

  /** The carried piece in the hand: at a controller's grip, under a hand's ray. */
  private carryAlong(): void {
    const c = this.carry!;
    const held = c.grip || this.host.controllers();
    (held ? this.host.grip(c.side) : this.host.ray(c.side)).getWorldPosition(this.hold);
    if (!held) this.hold.y -= HAND_CARRY_DROP;
    this.root.object3D!.worldToLocal(this.hold);
    c.model.position.copy(this.hold);
  }

  /** Where `side`'s ray meets the page's plane, in tiles, into `this.p`; false when it does not come down onto it or meets it outside the window. */
  private onPage(side: Side): boolean {
    const h = this.holder?.object3D;
    if (!h || !this.hit(side, h)) return false;
    const r = townRulesNow();
    const [hw, hd] = this.windowHalf();
    const m = PAGE_MARGIN / this.zoom;
    return (
      this.p.x > -PAGE_MARGIN &&
      this.p.x < r.cols + PAGE_MARGIN &&
      this.p.z > -PAGE_MARGIN &&
      this.p.z < r.rows + PAGE_MARGIN &&
      Math.abs(this.p.x - this.view.x) < hw + m &&
      Math.abs(this.p.z - this.view.z) < hd + m
    );
  }

  /** Where `side`'s ray meets the plane y = 0 of `space`, in its own units, into `this.p`; false when it does not come down onto it. */
  private hit(side: Side, space: Object3D): boolean {
    const ray = this.host.ray(side);
    ray.getWorldPosition(this.o);
    ray.getWorldQuaternion(this.q);
    this.d.set(0, 0, -1).applyQuaternion(this.q).add(this.o);
    space.worldToLocal(this.o);
    space.worldToLocal(this.d);
    this.d.sub(this.o);
    if (this.d.y > -1e-6) return false;
    const k = -this.o.y / this.d.y;
    this.p.copy(this.o).addScaledVector(this.d, k);
    return true;
  }

  /** The carried piece follows its ray: a shadow on the page, or a word on what letting go does. */
  private track(): void {
    const c = this.carry!;
    this.carryAlong();
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
    const small = isSmall(c.asset);
    const x = small ? Math.floor(this.p.x) : Math.round(this.p.x - w / 2);
    const y = small ? Math.floor(this.p.z) : Math.round(this.p.z - h / 2);
    const spot = small ? quarterAt(this.p.x, this.p.z) : undefined;
    if (c.over && x === c.x && y === c.y && spot === c.spot) return;
    c.over = true;
    c.x = x;
    c.y = y;
    c.spot = spot;
    c.fits = this.model.fits(c.asset, this.land, x, y, c.rot, c.placeId, spot ?? -1);
    this.ghost.show(c.asset, x, y, c.rot, !c.fits, spot);
    this.ghost.root.traverse(this.toClip);
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
    this.drop3D(c.model);
    this.ghost.hide();
    this.message = '';
    const name = this.name(c.asset);
    const done = (reason: string, said: string) => {
      console.info(`[town] ${c.placeId || c.asset}: ${reason || said}`);
      this.redraw();
      this.say(reason ? this.reason(reason) : said);
      // Set down on the land, or let go off it and taken away.
      if (!reason) sfx(c.over ? 'place' : 'unfold');
      if (reason || !c.over) return;
      // Let go on the land, the piece stays chosen with its card.
      const v = this.model.view().items;
      const it = c.placeId
        ? v.find((i) => i.id === c.placeId)
        : v.filter((i) => i.asset === c.asset && i.land === this.land && i.x === c.x && i.y === c.y).pop();
      if (it) this.showCard(it);
    };
    const was = c.placeId ? this.model.view().items.find((i) => i.id === c.placeId) : undefined;
    if (was && c.over && c.x === was.x && c.y === was.y && c.rot === was.rot && c.spot === was.spot) {
      // Let go where it stood: its card instead of a move.
      this.redraw();
      this.showCard(was);
      return;
    }
    if (c.over && !Number.isNaN(c.x)) {
      if (c.fits) return done(c.fits, '');
      const at = { land: this.land, x: c.x, y: c.y, rot: c.rot, spot: c.spot };
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

  // ------------------------------------------------------------ the card

  /** A building's card: its maths once finished, FINISH NOW while it is a paper frame. */
  private showCard(it: Placed, again = false): void {
    this.closeCard();
    const t = this.t;
    const lang = getLang();
    const lines: Line[] = [[this.name(it.asset).toUpperCase(), 0.02]];
    let q: Question | undefined;
    const tried = tries.get(it.id) ?? { attempt: 0, next_at: 0 };
    if (it.ready) {
      lines.push([t.status.ready, 0.013]);
      if (hasFacts(it.asset)) {
        lines.push([t.maths, 0.014, CARD_ACCENT]);
        for (const f of factsOf(shapeOf(it), pageTiles(this.model, it.land), gradeOf(this.model), lang)) this.wrap(f, lines);
      }
    } else {
      lines.push([t.status.building(waitText(it.ready_at_ms - this.model.now(), lang)), 0.013]);
      const wait = tried.next_at - Date.now();
      if (wait > 0) lines.push([t.nextIn(waitText(wait, lang)), 0.013, ORANGE]);
      else {
        q = finishQuestion(shapeOf(it), gradeOf(this.model), tried.attempt, lang);
        lines.push([t.finishNow, 0.014, CARD_ACCENT]);
        this.wrap(q.prompt, lines);
      }
    }
    const entity = this.cardPanel(lines, q ? q.choices.map((c, i) => [`town_a${i}` as TownChoice, c, 'on'] as Cell) : []);
    this.card = { id: it.id, entity, q, attempt: tried.attempt, answered: false, ready: it.ready };
    this.selected = it.id;
    this.placeMark();
    if (!again) console.info(`[town] card of ${it.asset}: ${q ? `asks ${q.kind}` : it.ready ? (hasFacts(it.asset) ? 'its maths' : 'finished') : 'waits'}`);
  }

  /** The page's landmark: what raised it and how many stars its mission has. */
  private showLandmark(): void {
    const lm = this.model.doc.landmarks[this.land];
    if (!lm) return;
    this.closeCard();
    const t = this.t;
    const lines: Line[] = [[this.name(lm.landmark).toUpperCase(), 0.02]];
    this.wrap(t.landmarkBy(skillTitle(lm.skill, getLang())), lines);
    lines.push([t.landmarkStars(lm.tier), 0.013, CARD_ACCENT]);
    this.wrap(t.landmarkFixed, lines);
    const entity = this.cardPanel(lines, [['town_card', t.close, 'accent']]);
    this.card = { id: '', entity, attempt: 0, answered: true, ready: true };
    console.info(`[town] card of the landmark ${lm.landmark}`);
  }

  /** A line of body text; the panel cuts it to its width. */
  private wrap(text: string, into: Line[], height = 0.012): void {
    into.push([text, height]);
  }

  /** The card's lines on one paper panel, left aligned, with its cells in a row along the foot. */
  private cardPanel(lines: Line[], cells: Cell[]): Entity {
    const g = new Group();
    g.name = 'town-card';
    const ink = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    const rows: PanelLine[] = lines.map(([text, height, color], i) => ({
      text,
      size: height * CARD_TEXT,
      ink: ink(color ?? (i === 0 ? CARD_HEAD : CARD_INK)),
    }));
    const marks = cells.map(([, word]) => new Label(word, { height: 0.034, card: false, ink: 0xffffff }));
    const cellW = marks.map((m) => Math.max(0.08, m.width + 0.024));
    const rowW = cellW.reduce((a, b) => a + b, 0) + CELL_GAP * Math.max(0, cells.length - 1);
    const foot = cells.length ? CELL_H + CARD_PAD : 0;
    const { mesh, w, h } = textPanel(rows, Math.max(CARD_MAX_W, rowW + 2 * CARD_PAD), rowW + 2 * CARD_PAD, CARD_PAD, foot, 0, 'home');
    const shade = softShadow(w, h, CARD_BLUR);
    shade.position.set(0.003, h / 2 - 0.005, -0.002);
    (shade as Object3D & { pointerEvents?: string }).pointerEvents = 'none';
    g.add(shade, mesh);
    let x = -rowW / 2;
    cells.forEach(([choice, , look], i) => {
      const cell = new Mesh(cellGeo, CELL_MATS[look]);
      cell.name = `town-card-${choice}`;
      cell.userData.townOpt = choice;
      cell.scale.set(cellW[i], CELL_H, 1);
      cell.position.set(x + cellW[i] / 2, CARD_PAD + CELL_H / 2, 0.0015);
      cell.renderOrder = 5;
      const m = marks[i];
      m.mesh.position.set(cell.position.x, cell.position.y, 0.003);
      (m.mesh as Object3D & { pointerEvents?: string }).pointerEvents = 'none';
      g.add(cell, m.mesh);
      x += cellW[i] + CELL_GAP;
    });
    g.position.copy(CARD);
    g.rotation.set(CARD_LEAN, CARD_TURN, 0, 'YXZ');
    return this.host.add(g, true);
  }

  private closeCard(): void {
    const e = this.card?.entity;
    this.card = undefined;
    if (e?.active) {
      this.spare(e.object3D);
      this.host.remove(e);
    }
    this.selected = '';
    this.placeMark();
  }

  /** The chosen piece's tiles in teal under it and its toolbar shown, or neither. */
  private placeMark(): void {
    const h = this.holder?.object3D;
    const it = this.selected ? this.model.view().items.find((i) => i.id === this.selected && i.land === this.land) : undefined;
    const chosen = !!h && !!it && it.id !== this.carry?.placeId;
    this.showPieceRow(this.pieceRow?.object3D, chosen);
    if (!h || !it || !chosen) {
      if (this.mark) this.mark.visible = false;
      return;
    }
    this.pieceName?.set(this.name(it.asset).toUpperCase());
    this.removeButton?.set('trash', 'plain', `${this.t.remove} +${it.price}`);
    if (!this.mark) {
      this.mark = new Mesh(markGeo, markMat);
      this.mark.name = 'town-chosen';
      (this.mark as Object3D & { pointerEvents?: string }).pointerEvents = 'none';
    }
    if (this.mark.parent !== h) h.add(this.mark);
    const [w, d] = footprint(assetOf(it.asset)!, it.rot);
    if (it.spot === undefined) {
      this.mark.scale.set(w + 0.15, 1, d + 0.15);
      this.mark.position.set(it.x + w / 2, 0.012, it.y + d / 2);
    } else {
      const [mx, mz] = spotMiddle(it.x, it.y, it.spot);
      this.mark.scale.set(0.6, 1, 0.6);
      this.mark.position.set(mx, 0.012, mz);
    }
    this.mark.visible = true;
  }

  /** Turns the chosen piece where it stands, a quarter round left (270) or right (90); it stays chosen. */
  private async turnPlaced(step: number): Promise<void> {
    const it = this.model.view().items.find((i) => i.id === this.selected);
    if (!it) return;
    const rot = (it.rot + step) % 360;
    const reason = await this.model.act({ type: 'town_move', place_id: it.id, land: it.land, x: it.x, y: it.y, rot, spot: it.spot });
    console.info(`[town] ${it.id} turned to ${rot}°: ${reason || 'done'}`);
    if (reason) return this.say(this.reason(reason));
    this.say(`${this.t.turn} ${rot}°`);
    const now = this.model.view().items.find((i) => i.id === it.id);
    if (now) this.showCard(now, true);
  }

  /** Takes the chosen piece off the land, its Folds back. */
  private async removeSelected(): Promise<void> {
    const it = this.model.view().items.find((i) => i.id === this.selected);
    if (!it) return;
    this.closeCard();
    const reason = await this.model.act({ type: 'town_remove', place_id: it.id });
    console.info(`[town] ${it.id} removed: ${reason || 'done'}`);
    if (!reason) sfx('unfold');
    this.say(reason ? this.reason(reason) : this.t.removed(this.name(it.asset), it.price));
  }

  /** A card drawn again when its building finishes or while it waits, closed when the building is gone. */
  private refreshCard(): void {
    const c = this.card;
    if (!c?.id || (c.q && c.answered)) return;
    const it = this.model.view().items.find((i) => i.id === c.id);
    if (!it) return this.closeCard();
    // A card waiting for its next question counts down each second.
    const waiting = !c.q && !c.ready && !c.answered;
    if (it.ready !== c.ready || waiting) this.showCard(it, true);
  }

  private async answer(i: number): Promise<void> {
    const c = this.card;
    if (!c?.q || c.answered) return;
    c.answered = true;
    const t = this.t;
    const right = i === c.q.right;
    tries.set(c.id, { attempt: c.attempt + 1, next_at: right ? 0 : Date.now() + RETRY_MS });
    const it = this.model.view().items.find((x) => x.id === c.id);
    console.info(`[town] FINISH NOW ${c.q.kind}: ${right ? 'right' : 'wrong'}`);
    sfx(right ? 'right' : 'wrong');
    if (!it) return this.closeCard();
    if (!right) {
      const hint = c.q.hint;
      this.closeCard();
      const lines: Line[] = [[this.name(it.asset).toUpperCase(), 0.02]];
      this.wrap(t.wrong, lines);
      lines.push(['', 0.006]);
      this.wrap(hint, lines);
      const entity = this.cardPanel(lines, [['town_card', t.ok, 'accent']]);
      this.card = { id: it.id, entity, attempt: c.attempt + 1, answered: true, ready: false };
      return;
    }
    const reason = await this.model.act({ type: 'town_finish', place_id: c.id });
    this.closeCard();
    this.say(reason ? this.reason(reason) : t.right(this.name(it.asset)));
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
    this.closeCard();
    this.carry?.model.removeFromParent();
    this.unlisten();
    this.model.dispose();
    this.spare(this.holder?.object3D);
    this.spare(this.shelf?.object3D);
    this.spare(this.viewRow?.object3D);
    this.spare(this.pieceRow?.object3D);
    for (const e of [this.root, this.holder, this.shelf, this.viewRow, this.pieceRow, ...this.kindRow, ...this.buttons.values()]) if (e?.active) this.host.remove(e);
    this.restoreDesk();
  }
}
