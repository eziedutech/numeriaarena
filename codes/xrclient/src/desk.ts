import { Box3, createSystem, Group, Vector3, VisibilityState, XRMesh } from '@iwsdk/core';

import { Label } from './art/label.js';
import { makeBook } from './art/models.js';
import { DeskRoot } from './game-components.js';

/** Seconds to wait for a detected table before offering pinch placement. */
const TABLE_WAIT_S = 3;
/** How far the book sits inside the table edge nearest the player. */
const EDGE_INSET_M = 0.2;

/**
 * Places the play area. A detected real table wins; otherwise the player
 * pinches to put the book down. The flow never dead-ends on an unknown room.
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

  init(): void {
    this.root = new Group();
    this.root.name = 'desk-root';
    this.root.add(makeBook());
    this.root.visible = false;
    this.world.createTransformEntity(this.root).addComponent(DeskRoot);

    this.ghost = makeBook();
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
        if (!now) this.placeForBrowser();
      }),
    );
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive && immersive === null) {
      immersive = false;
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
    this.root.position.set(0, 0.72, -0.35);
    this.root.rotation.set(0, 0, 0);
    this.setPlaced(true, 3);
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
    }
  }
}
