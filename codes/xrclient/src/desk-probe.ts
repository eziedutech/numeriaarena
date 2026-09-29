import {
  Box3,
  BoxGeometry,
  createSystem,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  OneHandGrabbable,
  PokeInteractable,
  Pressed,
  Vector3,
  XRMesh,
} from '@iwsdk/core';

/**
 * Week 0 probe: when a real table is detected, place one pokeable button and
 * one grabbable crystal on its top surface. Proves scene understanding, poke
 * and grab in the emulator before the real game systems exist.
 */
export class DeskProbeSystem extends createSystem({
  meshes: { required: [XRMesh] },
  pressedButtons: { required: [PokeInteractable, Pressed] },
}) {
  private placed = false;
  private presses = 0;
  private box = new Box3();
  private corner = new Vector3();
  private tip = new Vector3();
  private sinceTipLog = 0;

  init(): void {
    this.queries.meshes.subscribe('qualify', (entity) => {
      if (this.placed) return;
      if (!entity.getValue(XRMesh, 'isBounded3D')) return;
      if (entity.getValue(XRMesh, 'semanticLabel') !== 'table') return;
      const object = entity.object3D;
      if (object == null) return;
      this.placeOnTable(object, entity.getVectorView(XRMesh, 'min'), entity.getVectorView(XRMesh, 'max'));
    });

    this.queries.pressedButtons.subscribe('qualify', (entity) => {
      this.presses += 1;
      const material = (entity.object3D as Mesh | undefined)?.material as MeshStandardMaterial | undefined;
      material?.color.setHex(this.presses % 2 === 1 ? 0xe8a33d : 0x2f6fb0);
      console.info(`[desk-probe] poke ${this.presses}`);
    });
  }

  update(delta: number): void {
    if (!this.placed) return;
    this.sinceTipLog += delta;
    if (this.sinceTipLog < 0.5) return;
    this.sinceTipLog = 0;
    this.player.indexTipSpaces.right.getWorldPosition(this.tip);
    console.debug(`[desk-probe] tip ${this.tip.x.toFixed(3)} ${this.tip.y.toFixed(3)} ${this.tip.z.toFixed(3)}`);
  }

  private placeOnTable(object: Object3D, min: ArrayLike<number>, max: ArrayLike<number>): void {
    object.updateWorldMatrix(true, false);
    this.box.makeEmpty();
    for (let i = 0; i < 8; i += 1) {
      this.corner.set(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]);
      this.box.expandByPoint(this.corner.applyMatrix4(object.matrixWorld));
    }
    const top = this.box.max.y;
    const cx = (this.box.min.x + this.box.max.x) / 2;
    const cz = (this.box.min.z + this.box.max.z) / 2;

    const button = this.world.createTransformEntity(
      new Mesh(new BoxGeometry(0.08, 0.03, 0.08), new MeshStandardMaterial({ color: 0x2f6fb0 })),
    );
    button.object3D!.name = 'probe-poke-button';
    button.object3D!.position.set(cx - 0.1, top + 0.015, cz);
    button.addComponent(PokeInteractable);

    const crystal = this.world.createTransformEntity(
      new Mesh(new BoxGeometry(0.05, 0.05, 0.05), new MeshStandardMaterial({ color: 0x7fb069 })),
    );
    crystal.object3D!.name = 'probe-grab-crystal';
    crystal.object3D!.position.set(cx + 0.1, top + 0.025, cz);
    crystal.addComponent(OneHandGrabbable);

    this.placed = true;
    console.info(`[desk-probe] placed on table top y=${top.toFixed(3)} center=(${cx.toFixed(3)}, ${cz.toFixed(3)})`);
  }
}
