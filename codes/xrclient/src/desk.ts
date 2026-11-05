import {
  BackSide,
  Box3,
  CanvasTexture,
  createSystem,
  Group,
  Matrix4,
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
import { FLAT_JOINTS, notFlat, type P3 } from './flat-hand.js';
import { getRoom } from './settings.js';
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

/**
 * The book goes where a hand is laid flat, all four fingers straight ahead, and held still (Zia,
 * 4 Nov 2026: "the hand decides"). Space Setup's table, a fingertip resting and a pinch all put it
 * at heights the player could not see coming, under or over the real table. With both hands flat,
 * it goes between them.
 */
const FLAT_HOLD_S = 1;
/** Still: the hands' middle moves less than this (metres) while held. */
const FLAT_STILL_M = 0.02;
/** The flat hand must be at least this far in front of the eyes (metres): held out, not in the lap. */
const FLAT_AHEAD_M = 0.2;
/** The desk top goes this far under the lowest fingertip joint (metres): the finger's pad is below it. */
const FLAT_PAD_M = 0.007;
/** With no flat hand this long (seconds), the book is put in front of the player at a guessed height. */
const FLAT_WAIT_S = 25;
const JOINT_M = new Matrix4();
/** A flat hand lost a moment (covered, turned) keeps the ghost book where it was this long (seconds). */
const FLAT_KEEP_S = 2;
/** The waiting book is seen through this much, so it hides no hand. */
const GHOST_OPACITY = 0.3;
/** The placing card stands this far ahead of the eyes and this far over them, out of the way of the hands. */
const PLACING_CARD_AHEAD_M = 0.5;
const PLACING_CARD_UP_M = 0.06;

/** After PLACE AGAIN, no fingertip is read this long (seconds): the pressing finger is still there. */
const AGAIN_WAIT_S = 1;
/** Asked from the desk menu: put the book down again by a fingertip (see placeDeskAgain). */
let againAsked = false;
/** The book goes away and waits for a fingertip on the table again, Space Setup's table skipped. */
export function placeDeskAgain(): void {
  againAsked = true;
}
/**
 * The corners (world) of the boxes Space Setup knows round the player (a table, storage, a bed, a
 * couch...), not the room's walls, floor or ceiling: Measure Hunt pins a real thing's corner onto one
 * a fingertip is near. Refreshed once a second while in XR.
 */
const boxCorners: Vector3[] = [];
const NOT_FURNITURE = new Set(['floor', 'ceiling', 'wall', 'global mesh', 'invisible wall face', 'door frame', 'window frame', 'wall art']);
const CORNERS_EVERY_S = 1;
export function sceneBoxCorners(): readonly Vector3[] {
  return boxCorners;
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
  /** Seconds until Space Setup's box corners are read again. */
  private cornersIn = 0;
  private clock = 0;
  /** Placed again from the menu: Space Setup's table is not taken this time. */
  private skipTable = false;
  /** How the book was last put down (DeskRoot's method), told under Ready!. */
  private method = 0;
  /** No hand is read before this (clock seconds): the finger that pressed PLACE AGAIN is still out. */
  private touchFrom = 0;
  /** The flat hands' middle while held, and since when (clock seconds; -1 when none). */
  private flatAt = new Vector3();
  private flatSince = -1;
  private flatLow = 0;
  private flatNow = new Vector3();
  /** Where a flat hand was last seen in this placing, and when (clock seconds; -Infinity when never). */
  private lastFlat = new Vector3();
  private lastFlatT = -Infinity;
  private cardAt = new Vector3();
  private joints = new Map<string, [number, number, number]>();
  private jointV = new Vector3();
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
    // See-through, so the hand laid flat where it goes stays in sight under it.
    ghostBook.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mat) => {
        const c = mat.clone();
        c.transparent = true;
        c.opacity = GHOST_OPACITY;
        c.depthWrite = false;
        return c;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0];
    });
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
        this.flatSince = -1;
        this.lastFlatT = -Infinity;
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

  /** A hand's joints this frame, by name, in the world; false when it is not tracked. */
  private readJoints(side: Side): boolean {
    this.joints.clear();
    const a = (this.input.xr as unknown as { visualAdapters?: { hand?: HandAdapters } }).visualAdapters?.hand?.[side];
    const m = a?.jointTransforms;
    const grip = a?.gripSpace;
    if (!a || !m || !grip || a.jointSpaces.length === 0) return false;
    grip.updateWorldMatrix(true, false);
    for (const name of FLAT_JOINTS) {
      const k = a.jointSpaces.findIndex((js) => js.jointName === name);
      if (k < 0 || m.length < (k + 1) * 16) return false;
      JOINT_M.fromArray(m, k * 16).premultiply(grip.matrixWorld);
      this.jointV.setFromMatrixPosition(JOINT_M);
      this.joints.set(name, [this.jointV.x, this.jointV.y, this.jointV.z]);
    }
    return true;
  }

  /**
   * Where the flat hands are (their knuckles' middle into `flatNow`, the lowest fingertip's height
   * under it into `flatLow`); false when no hand is flat, held out in front, at a table's height.
   */
  private flatHands(lo: number, hi: number): boolean {
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    const fwd: P3 = [this.forward.x, 0, this.forward.z];
    let n = 0;
    let low = Infinity;
    this.flatNow.set(0, 0, 0);
    for (const side of ['right', 'left'] as const) {
      if (!this.readJoints(side)) continue;
      const why = notFlat((name) => this.joints.get(name), fwd);
      if (why) continue;
      let x = 0;
      let z = 0;
      let tip = Infinity;
      for (const f of ['index', 'middle', 'ring', 'pinky']) {
        const k = this.joints.get(`${f}-finger-phalanx-proximal`)!;
        x += k[0] / 4;
        z += k[2] / 4;
        tip = Math.min(tip, this.joints.get(`${f}-finger-tip`)![1]);
      }
      const across = Math.hypot(x - this.head.x, z - this.head.z);
      const ahead = (x - this.head.x) * this.forward.x + (z - this.head.z) * this.forward.z;
      if (tip < lo || tip > hi || across > TOUCH_REACH_M || ahead < FLAT_AHEAD_M) continue;
      this.flatNow.x += x;
      this.flatNow.z += z;
      n += 1;
      low = Math.min(low, tip);
    }
    if (n === 0) return false;
    this.flatNow.x /= n;
    this.flatNow.z /= n;
    this.flatNow.y = low - FLAT_PAD_M;
    this.flatLow = this.flatNow.y;
    return true;
  }

  /** The book facing the player, its middle at `at`. */
  private faceAt(target: Object3D, at: Vector3): void {
    target.position.copy(at);
    target.rotation.set(0, Math.atan2(this.head.x - at.x, this.head.z - at.z), 0);
  }

  /**
   * In MY ROOM the real hands show through passthrough, so the drawn hand models are put away: drawn
   * over the camera image they showed through the real table, a hand under it seen on top of it
   * (Quest 2 has no depth to hide them). In the classroom and the bedroom, where nothing real shows,
   * they are drawn. The pokes, rings and rays are not the models and stay.
   */
  private refreshCorners(): void {
    let n = 0;
    for (const e of this.queries.meshes.entities) {
      if (!e.getValue(XRMesh, 'isBounded3D')) continue;
      if (NOT_FURNITURE.has(String(e.getValue(XRMesh, 'semanticLabel') ?? '').toLowerCase())) continue;
      const obj = e.object3D;
      if (!obj) continue;
      const min = e.getVectorView(XRMesh, 'min');
      const max = e.getVectorView(XRMesh, 'max');
      obj.updateWorldMatrix(true, false);
      for (let i = 0; i < 8; i += 1) {
        const v = (boxCorners[n] ??= new Vector3());
        v.set(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]).applyMatrix4(obj.matrixWorld);
        n += 1;
      }
    }
    boxCorners.length = n;
  }

  private syncHandModels(): void {
    // Only the model's visibility is set, every frame: toggleVisual also stops the visual's joint
    // updates, and a model shown again without them (after the hand was lost and found) froze stiff.
    const want = getRoom() !== 'here';
    const hands = (this.input.xr as unknown as { visualAdapters?: { hand?: Record<Side, { visual?: { model: Object3D; enabled?: boolean; toggle?(on: boolean): void } } | undefined> } }).visualAdapters?.hand;
    for (const side of ['left', 'right'] as const) {
      const v = hands?.[side]?.visual;
      if (!v) continue;
      if (v.enabled === false) v.toggle?.(true);
      v.model.visible = want;
    }
  }

  update(delta: number): void {
    const e = this.desk();
    if (!e) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.status.visible = false;
      this.curtain.visible = false;
      return;
    }
    this.syncHandModels();
    this.cornersIn -= delta;
    if (this.cornersIn <= 0) {
      this.cornersIn = CORNERS_EVERY_S;
      this.refreshCorners();
    }
    if (againAsked) {
      againAsked = false;
      if (e.getValue(DeskRoot, 'placed')) {
        console.info('[desk] placed again from the menu: waiting for a flat hand');
        this.waited = 0;
        this.flatSince = -1;
        this.lastFlatT = -Infinity;
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
    this.waited += delta;
    this.clock += delta;
    // A ghost book waits in front of the player at a guessed height, turning with the head. A hand laid
    // flat (on the table, fingers straight ahead) and held still brings it there and puts it down.
    this.ghost.visible = true;
    this.ghost.scale.setScalar(HEADSET_SCALE);
    this.frontOf(this.ghost);
    const left = Math.max(1, Math.ceil(FLAT_WAIT_S - this.waited));
    this.player.head.getWorldPosition(this.head);
    const flat = this.clock >= this.touchFrom && this.flatHands(this.head.y - TABLE_DROP_MAX_M, this.head.y - TOUCH_DROP_MIN_M);
    if (!flat || this.flatSince < 0 || this.flatNow.distanceTo(this.flatAt) > FLAT_STILL_M) {
      this.flatAt.copy(this.flatNow);
      this.flatSince = flat ? this.clock : -1;
    }
    if (flat) {
      this.lastFlat.copy(this.flatNow);
      this.lastFlatT = this.clock;
    }
    // Lost a moment (the hand turned, or out of the cameras' sight): the ghost stays where the hand was.
    if (flat || this.clock - this.lastFlatT < FLAT_KEEP_S) this.faceAt(this.ghost, this.lastFlat);
    const held = flat ? Math.min(FLAT_HOLD_S, this.clock - this.flatSince) : 0;
    // The card over the eyes, not over the ghost book: there it stood between the eyes and the hand.
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    this.cardAt.copy(this.head).addScaledVector(this.forward, PLACING_CARD_AHEAD_M);
    this.cardAt.y += PLACING_CARD_UP_M;
    this.showStatus(T.touchTable, delta, true, CURTAIN_ACT, this.cardAt, undefined, 0);
    this.statusSmall.set(flat ? T.flatHolding : T.touchHold(left));
    this.statusSmall.mesh.visible = true;
    if (flat && held >= FLAT_HOLD_S) {
      this.faceAt(this.root, this.flatNow);
      this.flatSince = -1;
      this.setPlaced(true, 6);
      console.info(`[desk] placed by a flat hand at y=${this.flatLow.toFixed(3)} (${(this.head.y - this.flatLow).toFixed(2)} m under the eyes)`);
      return;
    }
    // Controllers only (no hand tracked): the trigger puts it down where the ghost is.
    const pads = this.input.xr.gamepads;
    this.hands.update(delta);
    const hands = this.hands.get('right').tracked || this.hands.get('left').tracked;
    if (!hands && (pads.right?.getSelectStart() || pads.left?.getSelectStart())) {
      this.root.position.copy(this.ghost.position);
      this.root.rotation.copy(this.ghost.rotation);
      this.setPlaced(true, 2);
      console.info('[desk] placed by a trigger');
      return;
    }
    if (this.waited >= FLAT_WAIT_S) {
      // A flat hand was seen: the book goes where it last was, not to a guessed height.
      if (this.lastFlatT > -Infinity) {
        this.faceAt(this.root, this.lastFlat);
        this.setPlaced(true, 6);
        console.info(`[desk] time up: placed where a flat hand last was, y=${this.lastFlat.y.toFixed(3)}`);
        return;
      }
      this.placeInFront();
    }
  }
}
