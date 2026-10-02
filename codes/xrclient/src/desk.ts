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

/** Seconds to wait for a detected table before offering pinch placement. */
const TABLE_WAIT_S = 3;
/** How far the book sits inside the table edge nearest the player. */
const EDGE_INSET_M = 0.3;
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
/** After this long with the pinch ghost, the book is put in front of the player. */
const PINCH_WAIT_S = 6;
/** Seated desk: this far below the eyes and this far in front. */
const SEATED_DROP_M = 0.45;
const SEATED_REACH_M = 0.45;
/**
 * The curtain's radius sits between the card (0.4 m) and the book (about
 * 0.6 m away), so only the card stays bright. Darker while the player must
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

  init(): void {
    this.root = new Group();
    this.root.name = 'desk-root';
    const book = makeBook();
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
    this.root.visible = placed;
    this.ghost.visible = false;
    // A book placed in XR is announced for a moment; in the browser there is no card.
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
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
    const x = this.head.x + this.forward.x * SEATED_REACH_M;
    const z = this.head.z + this.forward.z * SEATED_REACH_M;
    target.position.set(x, this.head.y - SEATED_DROP_M, z);
    target.rotation.set(0, Math.atan2(this.head.x - x, this.head.z - z), 0);
  }

  private placeInFront(): void {
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
      this.setPlaced(true, 1);
      console.info(`[desk] placed on detected table at y=${this.box.max.y.toFixed(3)}`);
      return true;
    }
    return false;
  }

  update(delta: number): void {
    const e = this.desk();
    if (!e) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.status.visible = false;
      this.curtain.visible = false;
      return;
    }
    if (e.getValue(DeskRoot, 'placed')) {
      if (this.readyLeft > 0) {
        this.readyLeft -= delta;
        // On the book itself, over the front of the pages and under the
        // portal, so it never covers the portal or the title.
        this.root.localToWorld(this.readyAt.copy(READY_ON_BOOK));
        this.showStatus('Ready!', delta, false, 0, this.readyAt, { name: 'status_ready', scale: 0.55 }, 0);
      } else {
        this.status.visible = false;
        this.curtain.visible = false;
        this.curtainMat.opacity = 0;
      }
      return;
    }
    if (this.placeOnTable()) return;
    this.waited += delta;
    if (this.waited < TABLE_WAIT_S) {
      const dots = '.'.repeat(1 + (Math.floor(this.waited * 2) % 3));
      this.showStatus(`Finding your table${dots}`, delta, true, CURTAIN_WAIT, undefined, {
        name: 'status_finding_table',
        scale: 1.2,
      });
      return;
    }
    // No table: a ghost book waits in the middle, in front of the player at
    // seated desk height, turning with the head; a pinch with either hand
    // puts it down there. It is where the book lands anyway when the wait
    // runs out, so the book never jumps from the side to the middle.
    this.ghost.visible = true;
    this.frontOf(this.ghost);
    const left = Math.max(1, Math.ceil(TABLE_WAIT_S + PINCH_WAIT_S - this.waited));
    this.showStatus(`Pinch to place the book, or wait ${left} s`, delta, true, CURTAIN_ACT, this.ghost.position, {
      name: 'status_pinch_to_place',
      scale: 1.2,
      small: `or wait ${left} s`,
    });
    const pads = this.input.xr.gamepads;
    if (pads.right?.getSelectStart() || pads.left?.getSelectStart()) {
      this.root.position.copy(this.ghost.position);
      this.root.rotation.copy(this.ghost.rotation);
      this.setPlaced(true, 2);
      console.info('[desk] placed by pinch');
      return;
    }
    if (this.waited >= TABLE_WAIT_S + PINCH_WAIT_S) this.placeInFront();
  }
}
