import { Box3, Color, createSystem, Group, Vector3, VisibilityState, XRMesh } from '@iwsdk/core';

import { Label } from './art/label.js';
import { makeBook } from './art/models.js';
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
/** Paper cream behind the browser preview; XR keeps the background clear for passthrough. */
const PREVIEW_BACKGROUND = new Color(0xf6e3c0);

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
  private hint!: Label;
  private waited = 0;
  private box = new Box3();
  private corner = new Vector3();
  private head = new Vector3();
  private tip = new Vector3();
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
    this.hint = new Label('Pinch to place the book', { height: 0.03 });
    this.hint.mesh.position.set(0, 0.08, 0);
    this.ghost.add(this.hint.mesh);
    this.world.createTransformEntity(this.ghost);

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
        this.scene.background = now ? null : PREVIEW_BACKGROUND;
        if (!now) this.placeForBrowser();
      }),
    );
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive && immersive === null) {
      immersive = false;
      this.scene.background = PREVIEW_BACKGROUND;
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
  }

  private placeForBrowser(): void {
    this.root.position.set(0, 0.8, -0.2);
    this.root.rotation.set(0, 0, 0);
    // Frame the whole book from the browser camera.
    this.camera.lookAt(0, 0.86, -0.22);
    this.setPlaced(true, 3);
  }

  private placeInFront(): void {
    this.player.head.getWorldPosition(this.head);
    // The head looks down its -Z axis; keep only the horizontal part.
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) this.forward.set(0, 0, -1);
    this.forward.normalize();
    const x = this.head.x + this.forward.x * SEATED_REACH_M;
    const z = this.head.z + this.forward.z * SEATED_REACH_M;
    this.root.position.set(x, this.head.y - SEATED_DROP_M, z);
    this.root.rotation.set(0, Math.atan2(this.head.x - x, this.head.z - z), 0);
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
    if (!e || e.getValue(DeskRoot, 'placed')) return;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    if (this.placeOnTable()) return;
    this.waited += delta;
    if (this.waited < TABLE_WAIT_S) return;

    // No table: a ghost book follows the right index finger; a pinch puts it down.
    this.ghost.visible = true;
    this.player.indexTipSpaces.right.getWorldPosition(this.tip);
    this.player.head.getWorldPosition(this.head);
    this.ghost.position.copy(this.tip);
    this.ghost.rotation.set(0, Math.atan2(this.head.x - this.tip.x, this.head.z - this.tip.z), 0);
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
