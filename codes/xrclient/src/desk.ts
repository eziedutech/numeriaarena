import {
  BackSide,
  Box3,
  CanvasTexture,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
  XRMesh,
} from '@iwsdk/core';

import { paintBackdropGlyphs } from './art/backdrop-glyphs.js';
import { Label } from './art/label.js';
import { makeBook, makeStar } from './art/models.js';
import { uiImage, type UiName } from './art/ui2d.js';
import { DeskRoot } from './game-components.js';
import { Hands, type HandAdapters, type Side } from './measure/hands.js';
import { T } from './text.js';

/** Seconds to wait for a detected table before offering pinch placement. */
const TABLE_WAIT_S = 3;
/** How far the book sits inside the table edge nearest the player. */
const EDGE_INSET_M = 0.16;
/**
 * The book sits at the back of the play area; creatures walk off it onto
 * the free table in front, where the answers are. Offset along -Z (away
 * from the player) from the play area's centre.
 */
const BOOK_Z = -0.12;
/** A table farther than this (horizontally, from the head) is out of seated reach. */
const TABLE_REACH_M = 1.0;
/** A table must lie within this angle of where the player faces (cos 60 degrees). */
const TABLE_FACING_COS = 0.5;
/** Comfortable table top: this far below the eyes (seated at a desk or on a sofa). */
const TABLE_DROP_MIN_M = 0.2;
const TABLE_DROP_MAX_M = 0.75;
/** After this long with the ghost book (touch or pinch), the book is put in front of the player. */
const PINCH_WAIT_S = 12;
/**
 * The real table's height from a fingertip: one that comes down at least TOUCH_DROP_M
 * and then holds within TOUCH_STILL_M for TOUCH_HOLD_S rests on the table, and the desk
 * top goes there, TOUCH_PAD_M under the tip joint (the finger's pad is below it).
 */
const TOUCH_HOLD_S = 0.8;
const TOUCH_STILL_M = 0.015;
const TOUCH_DROP_M = 0.03;
const TOUCH_PAD_M = 0.008;
/** The fingertip that sets the height is at most this far from the eyes, across. */
const TOUCH_REACH_M = 0.85;
/** How long a higher fingertip is remembered: it must have come down within this. */
const TOUCH_FALL_S = 3;
/** A table touched this near under the eyes still counts (a high table, a low chair). */
const TOUCH_DROP_MIN_M = 0.12;
/**
 * The fingertip must be at least this far in front of the eyes (metres, along the way the head
 * faces): a hand resting in the lap while the child waits held still too, and put the desk under
 * the table (Zia, 4 Nov 2026).
 */
const TOUCH_AHEAD_M = 0.3;
/** One press of HIGHER or LOWER on the desk menu moves the book this much (metres). */
export const DESK_STEP_M = 0.01;

/** After PLACE AGAIN, no fingertip is read this long (seconds): the pressing finger is still there. */
const AGAIN_WAIT_S = 1;
/** Asked from the desk menu: put the book down again by a fingertip (see placeDeskAgain). */
let againAsked = false;
/** The book goes away and waits for a fingertip on the table again, Space Setup's table skipped. */
export function placeDeskAgain(): void {
  againAsked = true;
}
/*
 * A desk that rose by itself to a fingertip resting still over it (v0.4.2) was taken out in
 * v0.4.3: a hand held still in the air after a press looks the same, and raised it too high.
 */
/**
 * Seated desk: this far below the eyes and this far in front. Near enough
 * that a seated child's fingertip reaches the cards without leaning in (on
 * a real Quest the old 0.8 m sent players forward or to the controllers).
 */
export const SEATED_DROP_M = 0.5;
const SEATED_REACH_M = 0.5;
/**
 * Everything on the desk in the headset, this much larger than the browser view. Less than it was
 * (1.32) now the desk is nearer: the score and the robots' windows stay in view and the cards in reach.
 */
const HEADSET_SCALE = 1.15;
/**
 * In the headset everything on the desk sits this much further from the
 * player than where it was placed. None now: the cards are touched with the
 * fingertip, so they stay within the reach of a seated arm.
 */
const HEADSET_PUSH_M = 0;
/** Pushed back on a detected table, the book stays at least this far inside its far edge. */
const FAR_EDGE_INSET_M = 0.2;
/**
 * The curtain's radius sits between the card (0.4 m) and the book (about
 * 0.9 m away), so only the card stays bright. Darker while the player must
 * wait, lighter when a pinch is expected.
 */
const CURTAIN_R = 0.5;
const CURTAIN_WAIT = 0.55;
const CURTAIN_ACT = 0.25;
/** The "Ready!" card stays this long after the book lands (seconds). */
const READY_S = 1.2;
/** The placing card floats this far ahead of the eyes and this far below them. */
const STATUS_AHEAD_M = 0.4;
const STATUS_DROP_M = 0.1;
/**
 * Ready! stands here in the book's frame: above the front of the pages, with
 * the card (drawn 5.5 cm under the star) clear of the portal behind.
 */
const READY_ON_BOOK = new Vector3(0, 0.15, 0.06);
/** While the ghost book waits in front of the player, the card rides this far above it. */
const STATUS_ABOVE_GHOST_M = 0.34;
/**
 * Behind the browser preview: a matte warm sand with soft out-of-focus
 * paper shapes, like a blurred desk behind the book, dark enough for cream
 * paper lettering. XR keeps the background clear for passthrough.
 */
const PREVIEW_BASE = '#e0c780';
/** Out-of-focus spots: x, y, radius (fractions of the width) and tone. */
const PREVIEW_SPOTS: [number, number, number, string][] = [
  [0.12, 0.2, 0.28, 'rgba(255,255,255,0.10)'],
  [0.85, 0.15, 0.22, 'rgba(255,255,255,0.08)'],
  [0.7, 0.8, 0.3, 'rgba(0,0,0,0.10)'],
  [0.25, 0.85, 0.24, 'rgba(0,0,0,0.08)'],
  [0.5, 0.45, 0.35, 'rgba(255,255,255,0.05)'],
  [0.95, 0.6, 0.18, 'rgba(0,0,0,0.07)'],
];

/** Where the wall starts easing into the floor, as a fraction of the height (under the book). */
const PREVIEW_FLOOR = 0.66;

let previewBackdrop: CanvasTexture | undefined;

function makePreviewBackdrop(): CanvasTexture {
  if (previewBackdrop) return previewBackdrop;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 576;
  const w = canvas.width;
  const h = canvas.height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = PREVIEW_BASE;
  c.fillRect(0, 0, w, h);
  // A hint of a room: the wall a touch lighter where the book stands and
  // shaded towards the top, easing into a floor under the book that darkens
  // gently towards the viewer, with no hard line between them.
  const room = c.createLinearGradient(0, 0, 0, h);
  room.addColorStop(0, 'rgba(0,0,0,0.06)');
  room.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  room.addColorStop(PREVIEW_FLOOR, 'rgba(255,255,255,0.01)');
  room.addColorStop(PREVIEW_FLOOR + 0.14, 'rgba(0,0,0,0.04)');
  room.addColorStop(1, 'rgba(0,0,0,0.09)');
  c.fillStyle = room;
  c.fillRect(0, 0, w, h);
  for (const [x, y, r, tone] of PREVIEW_SPOTS) {
    const g = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * w);
    g.addColorStop(0, tone);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  paintBackdropGlyphs(c, w, h);
  // Corners fall off softly, like light on a real wall.
  const vignette = c.createRadialGradient(w / 2, h * 0.55, h * 0.35, w / 2, h * 0.55, w * 0.7);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.08)');
  c.fillStyle = vignette;
  c.fillRect(0, 0, w, h);
  // Fine paper grain (the same every time) keeps it matte and hides banding.
  const grain = c.getImageData(0, 0, w, h);
  let seed = 7;
  for (let i = 0; i < grain.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const n = ((seed >>> 24) - 128) / 128 * 4;
    grain.data[i] += n;
    grain.data[i + 1] += n;
    grain.data[i + 2] += n;
  }
  c.putImageData(grain, 0, 0);
  previewBackdrop = new CanvasTexture(canvas);
  previewBackdrop.colorSpace = SRGBColorSpace;
  return previewBackdrop;
}

/**
 * Places the play area. A detected table within seated reach wins; otherwise
 * the player pinches to put the book down, and if they do not, it lands in
 * front of them. The flow never dead-ends on an unknown room.
 */
export class DeskSystem extends createSystem({
  desks: { required: [DeskRoot] },
  meshes: { required: [XRMesh] },
}) {
  private root!: Group;
  private ghost!: Group;
  /** A small card in front of the eyes while the book is being placed. */
  private status!: Group;
  private statusText!: Label;
  /** A second, smaller line under a paper card (the pinch countdown). */
  private statusSmall!: Label;
  /** Paper cards for each placing step, made once their images load. */
  private statusCards = new Map<UiName, Object3D>();
  private statusStar!: Object3D;
  private curtain!: Mesh;
  private curtainMat!: MeshBasicMaterial;
  /** Seconds the "Ready!" card stays up after the book lands. */
  private readyLeft = 0;
  private readyAt = new Vector3();
  private waited = 0;
  private box = new Box3();
  private corner = new Vector3();
  private head = new Vector3();
  private forward = new Vector3();
  private hands!: Hands;
  private clock = 0;
  /** Placed again from the menu: Space Setup's table is not taken this time. */
  private skipTable = false;
  /** How the book was last put down (DeskRoot's method), told under Ready!. */
  private method = 0;
  /** No fingertip is read before this (clock seconds): the finger that pressed PLACE AGAIN must come down anew. */
  private touchFrom = 0;
  /** The table's height a fingertip is holding still on now, before it is taken; NaN when none. */
  private touching = NaN;
  /** Each hand's fingertip: where it holds still and since when, and the highest it was lately. */
  private touch: Record<Side, { at: Vector3; since: number; hiY: number; hiT: number }> = {
    left: { at: new Vector3(), since: -1, hiY: -Infinity, hiT: 0 },
    right: { at: new Vector3(), since: -1, hiY: -Infinity, hiT: 0 },
  };

  init(): void {
    this.hands = new Hands(() => (this.input.xr as unknown as { visualAdapters?: { hand?: HandAdapters } }).visualAdapters?.hand);
    this.root = new Group();
    this.root.name = 'desk-root';
    const book = makeBook();
    book.name = 'desk-book';
    book.position.z = BOOK_Z;
    this.root.add(book);
    this.root.visible = false;
    this.world.createTransformEntity(this.root).addComponent(DeskRoot);

    this.ghost = new Group();
    const ghostBook = makeBook();
    ghostBook.position.z = BOOK_Z;
    this.ghost.add(ghostBook);
    this.ghost.name = 'desk-ghost';
    this.ghost.visible = false;
    this.world.createTransformEntity(this.ghost);

    this.status = new Group();
    this.status.name = 'placing-status';
    this.status.visible = false;
    this.statusText = new Label(' ', { height: 0.05 });
    this.statusText.mesh.position.set(0, -0.055, 0);
    this.statusStar = makeStar(true);
    this.statusStar.scale.setScalar(1.4);
    this.statusSmall = new Label(' ', { height: 0.03 });
    this.statusSmall.mesh.position.set(0, -0.105, 0);
    this.statusSmall.mesh.visible = false;
    this.status.add(this.statusText.mesh, this.statusSmall.mesh, this.statusStar);
    this.world.createTransformEntity(this.status);

    // A soft grey curtain around the head while the book is not ready: the
    // card sits inside it and stays bright, the room and book behind dim.
    this.curtainMat = new MeshBasicMaterial({ color: 0x1f2433, transparent: true, opacity: 0, side: BackSide, depthWrite: false });
    this.curtain = new Mesh(new SphereGeometry(CURTAIN_R, 24, 16), this.curtainMat);
    this.curtain.name = 'placing-curtain';
    this.curtain.visible = false;
    this.world.createTransformEntity(this.curtain);

    let immersive: boolean | null = null;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        // Only entering or leaving XR changes the room. A blurred session
        // (system menu open) keeps the book where it is.
        const now = state !== VisibilityState.NonImmersive;
        if (now === immersive) return;
        immersive = now;
        this.waited = 0;
        this.setPlaced(false, 0);
        this.scene.background = now ? null : makePreviewBackdrop();
        if (!now) this.placeForBrowser();
      }),
    );
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive && immersive === null) {
      immersive = false;
      this.scene.background = makePreviewBackdrop();
      this.placeForBrowser();
    }
  }

  private desk() {
    for (const e of this.queries.desks.entities) return e;
    return undefined;
  }

  private setPlaced(placed: boolean, method: number): void {
    const e = this.desk();
    if (!e) return;
    e.setValue(DeskRoot, 'placed', placed);
    e.setValue(DeskRoot, 'method', method);
    this.method = method;
    this.root.visible = placed;
    this.ghost.visible = false;
    // A book placed in XR is announced for a moment; in the browser there is no card.
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    this.root.scale.setScalar(placed && immersive ? HEADSET_SCALE : 1);
    this.readyLeft = placed && immersive ? READY_S : 0;
  }

  /**
   * Keeps the placing card about 55 cm in front of the eyes, a little low,
   * facing the player, with its paper star turning while it works.
   */
  /**
   * `paper` shows that paper card instead of `text` once its image has
   * loaded, with `small` as a short line under it.
   */
  private showStatus(
    text: string,
    delta: number,
    spin: boolean,
    dim: number,
    above?: Vector3,
    paper?: { name: UiName; scale: number; small?: string },
    lift = STATUS_ABOVE_GHOST_M,
  ): void {
    this.player.head.getWorldPosition(this.head);
    this.curtain.position.copy(this.head);
    // Ease towards the wanted dimming instead of snapping.
    this.curtainMat.opacity += (dim - this.curtainMat.opacity) * Math.min(1, delta * 4);
    this.curtain.visible = this.curtainMat.opacity > 0.01;
    this.player.head.getWorldDirection(this.forward).negate();
    if (above) {
      // Over the ghost book, so the card moves with the hand and never covers it.
      this.status.position.copy(above);
      this.status.position.y += lift;
    } else {
      this.status.position.copy(this.head).addScaledVector(this.forward, STATUS_AHEAD_M);
      this.status.position.y -= STATUS_DROP_M;
    }
    this.status.lookAt(this.head);
    const card = paper ? this.statusCard(paper.name, paper.scale) : undefined;
    for (const [name, c] of this.statusCards) c.visible = !!card && name === paper?.name;
    this.statusText.mesh.visible = !card;
    this.statusSmall.mesh.visible = !!card && !!paper?.small;
    if (card) {
      if (paper?.small) this.statusSmall.set(paper.small);
    } else {
      this.statusText.set(text);
    }
    if (spin) this.statusStar.rotation.y += delta * 3;
    this.status.visible = true;
  }

  private statusCard(name: UiName, scale: number): Object3D | undefined {
    let card = this.statusCards.get(name);
    if (!card) {
      const image = uiImage(name, scale);
      if (!image) return undefined;
      image.position.set(0, -0.055, 0);
      this.status.add(image);
      this.statusCards.set(name, image);
      card = image;
    }
    return card;
  }

  private placeForBrowser(): void {
    this.root.position.set(0, 0.8, -0.2);
    this.root.rotation.set(0, 0, 0);
    // Frame the whole play area from the browser camera: the scoreboard
    // above the book, both robot windows at the sides, and the balloons.
    this.camera.position.set(0, 1.28, 0.62);
    this.camera.lookAt(0, 0.98, -0.2);
    this.setPlaced(true, 3);
  }

  /** A seated desk in front of the player: where the book goes without a table. */
  private frontOf(target: Object3D): void {
    this.player.head.getWorldPosition(this.head);
    // The head looks down its -Z axis; keep only the horizontal part.
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    const x = this.head.x + this.forward.x * (SEATED_REACH_M + HEADSET_PUSH_M);
    const z = this.head.z + this.forward.z * (SEATED_REACH_M + HEADSET_PUSH_M);
    target.position.set(x, this.head.y - SEATED_DROP_M, z);
    target.rotation.set(0, Math.atan2(this.head.x - x, this.head.z - z), 0);
  }

  private placeInFront(): void {
    this.skipTable = false;
    this.frontOf(this.root);
    this.setPlaced(true, 4);
    console.info('[desk] no reachable table and no pinch: placed in front of the player');
  }

  private placeOnTable(): boolean {
    for (const e of this.queries.meshes.entities) {
      if (!e.getValue(XRMesh, 'isBounded3D') || e.getValue(XRMesh, 'semanticLabel') !== 'table') continue;
      const obj = e.object3D;
      if (!obj) continue;
      const min = e.getVectorView(XRMesh, 'min');
      const max = e.getVectorView(XRMesh, 'max');
      obj.updateWorldMatrix(true, false);
      this.box.makeEmpty();
      for (let i = 0; i < 8; i += 1) {
        this.corner.set(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]);
        this.box.expandByPoint(this.corner.applyMatrix4(obj.matrixWorld));
      }
      this.player.head.getWorldPosition(this.head);
      // Skip tables the seated player cannot reach.
      const nx = Math.min(Math.max(this.head.x, this.box.min.x), this.box.max.x);
      const nz = Math.min(Math.max(this.head.z, this.box.min.z), this.box.max.z);
      const reach = Math.hypot(this.head.x - nx, this.head.z - nz);
      if (reach > TABLE_REACH_M) continue;
      // Skip tables at knee height for a standing player, or above the chest.
      const drop = this.head.y - this.box.max.y;
      if (drop < TABLE_DROP_MIN_M || drop > TABLE_DROP_MAX_M) continue;
      // Skip tables beside or behind the player: the book must appear in view.
      this.player.head.getWorldDirection(this.forward).negate();
      this.forward.y = 0;
      const cx = (this.box.min.x + this.box.max.x) / 2 - this.head.x;
      const cz = (this.box.min.z + this.box.max.z) / 2 - this.head.z;
      const len = Math.hypot(cx, cz) * Math.hypot(this.forward.x, this.forward.z);
      if (len > 1e-6 && (cx * this.forward.x + cz * this.forward.z) / len < TABLE_FACING_COS) continue;
      const inset = (lo: number, hi: number, v: number) =>
        hi - lo > 2 * EDGE_INSET_M ? Math.min(Math.max(v, lo + EDGE_INSET_M), hi - EDGE_INSET_M) : (lo + hi) / 2;
      const x = inset(this.box.min.x, this.box.max.x, this.head.x);
      const z = inset(this.box.min.z, this.box.max.z, this.head.z);
      this.root.position.set(x, this.box.max.y, z);
      this.root.rotation.set(0, Math.atan2(this.head.x - x, this.head.z - z), 0);
      this.root.translateZ(-HEADSET_PUSH_M);
      const keep = (lo: number, hi: number, v: number) =>
        hi - lo > 2 * FAR_EDGE_INSET_M ? Math.min(Math.max(v, lo + FAR_EDGE_INSET_M), hi - FAR_EDGE_INSET_M) : v;
      this.root.position.x = keep(this.box.min.x, this.box.max.x, this.root.position.x);
      this.root.position.z = keep(this.box.min.z, this.box.max.z, this.root.position.z);
      this.setPlaced(true, 1);
      console.info(`[desk] placed on detected table at y=${this.box.max.y.toFixed(3)}`);
      return true;
    }
    return false;
  }

  /**
   * The real table's top, once a fingertip has come down onto it and held still
   * there (between heights `lo` and `hi`, within seated reach); undefined until then.
   */
  private touchedTop(delta: number, lo: number, hi: number): number | undefined {
    this.clock += delta;
    this.hands.update(delta);
    this.touching = NaN;
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    for (const side of ['right', 'left'] as const) {
      const h = this.hands.get(side);
      const t = this.touch[side];
      if (!h.tracked) {
        t.since = -1;
        t.hiY = -Infinity;
        continue;
      }
      const tip = h.tip;
      if (this.clock < this.touchFrom) {
        t.since = -1;
        t.hiY = tip.y;
        t.hiT = this.clock;
        continue;
      }
      if (tip.y > t.hiY || this.clock - t.hiT > TOUCH_FALL_S) {
        t.hiY = tip.y;
        t.hiT = this.clock;
      }
      const across = Math.hypot(tip.x - this.head.x, tip.z - this.head.z);
      const ahead = (tip.x - this.head.x) * this.forward.x + (tip.z - this.head.z) * this.forward.z;
      // A pinching hand holds something (a crystal): its fingertip is not resting on the table.
      const fits = tip.y >= lo && tip.y <= hi && across <= TOUCH_REACH_M && ahead >= TOUCH_AHEAD_M && !h.pinching;
      if (!fits || t.since < 0 || tip.distanceTo(t.at) > TOUCH_STILL_M) {
        t.at.copy(tip);
        t.since = fits ? this.clock : -1;
        continue;
      }
      if (t.hiY - t.at.y < TOUCH_DROP_M) continue;
      // Held still on the table: the ghost book goes down to it, so the child sees where it will land.
      if (Number.isNaN(this.touching) || side === 'right') this.touching = t.at.y - TOUCH_PAD_M;
      if (this.clock - t.since >= TOUCH_HOLD_S) {
        t.since = -1;
        return t.at.y - TOUCH_PAD_M;
      }
    }
    return undefined;
  }

  update(delta: number): void {
    const e = this.desk();
    if (!e) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.status.visible = false;
      this.curtain.visible = false;
      return;
    }
    if (againAsked) {
      againAsked = false;
      if (e.getValue(DeskRoot, 'placed')) {
        console.info('[desk] placed again from the menu: waiting for a fingertip on the table');
        this.skipTable = true;
        this.waited = TABLE_WAIT_S;
        this.touchFrom = this.clock + AGAIN_WAIT_S;
        this.setPlaced(false, 0);
        return;
      }
    }
    if (e.getValue(DeskRoot, 'placed')) {
      if (this.readyLeft > 0) {
        this.readyLeft -= delta;
        // On the book itself, over the front of the pages and under the
        // portal, so it never covers the portal or the title.
        this.root.localToWorld(this.readyAt.copy(READY_ON_BOOK));
        this.showStatus(T.ready, delta, false, 0, this.readyAt, { name: 'status_ready', scale: 0.55, small: T.placedBy[this.method] }, 0);
      } else {
        this.status.visible = false;
        this.curtain.visible = false;
        this.curtainMat.opacity = 0;
      }
      return;
    }
    if (!this.skipTable && this.placeOnTable()) return;
    this.waited += delta;
    if (this.waited < TABLE_WAIT_S) {
      const dots = '.'.repeat(1 + (Math.floor(this.waited * 2) % 3));
      this.showStatus(`${T.findingTable}${dots}`, delta, true, CURTAIN_WAIT, undefined, {
        name: 'status_finding_table',
        scale: 1.2,
      });
      return;
    }
    // No table: a ghost book waits in the middle, in front of the player at
    // seated desk height, turning with the head. A fingertip held on the real
    // table puts it down there at that height; a pinch with either hand puts it
    // down at the guessed height. It is where the book lands anyway when the
    // wait runs out, so the book never jumps from the side to the middle.
    this.ghost.visible = true;
    this.ghost.scale.setScalar(HEADSET_SCALE);
    this.frontOf(this.ghost);
    const left = Math.max(1, Math.ceil(TABLE_WAIT_S + PINCH_WAIT_S - this.waited));
    this.showStatus(T.touchTable, delta, true, CURTAIN_ACT, this.ghost.position);
    this.statusSmall.set(T.touchHold(left));
    this.statusSmall.mesh.visible = true;
    this.player.head.getWorldPosition(this.head);
    const top = this.touchedTop(delta, this.head.y - TABLE_DROP_MAX_M, this.head.y - TOUCH_DROP_MIN_M);
    if (!Number.isNaN(this.touching)) this.ghost.position.y = this.touching;
    if (top !== undefined) {
      this.skipTable = false;
      this.frontOf(this.root);
      this.root.position.y = top;
      this.setPlaced(true, 5);
      console.info(`[desk] placed by a fingertip on the table at y=${top.toFixed(3)} (${(this.head.y - top).toFixed(2)} m under the eyes)`);
      return;
    }
    const pads = this.input.xr.gamepads;
    if (pads.right?.getSelectStart() || pads.left?.getSelectStart()) {
      this.root.position.copy(this.ghost.position);
      this.root.rotation.copy(this.ghost.rotation);
      this.skipTable = false;
      this.setPlaced(true, 2);
      console.info('[desk] placed by pinch');
      return;
    }
    if (this.waited >= TABLE_WAIT_S + PINCH_WAIT_S) this.placeInFront();
  }
}
