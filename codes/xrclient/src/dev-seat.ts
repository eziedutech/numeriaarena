import { Box3, type Entity, Group, Matrix4, Ray, RayInteractable, Vector3, VisibilityState, createSystem } from '@iwsdk/core';

import { Label } from './art/label.js';
import { Builder, chair } from './art/rooms.js';
import { DeskRoot } from './game-components.js';
import { T } from './text.js';

/**
 * A small card beside HOME, only in the browser's XR emulator (IWER), that
 * seats the emulated headset or stands it up again with one trigger click:
 * the eyes, controllers and hands go down to a seated child's height over
 * the desk, or back to IWER's standing rest. The desk never moves, as a
 * real one does not when a child sits down. A real headset follows the
 * body, so the card never shows there (or in a build).
 */
interface EmulatedPose {
  position: { y: number; set(x: number, y: number, z: number): void };
  quaternion: { set(x: number, y: number, z: number, w: number): void };
}
interface EmulatedDevice extends EmulatedPose {
  /**
   * IWER's panel keeps its own copy of the pose and writes it back every frame
   * while 'manual'; switching to 'programmatic' makes it copy the device's pose.
   */
  controlMode: 'manual' | 'programmatic';
  notifyStateChange(): void;
  controllers: Partial<Record<'left' | 'right', EmulatedPose>>;
  hands: Partial<Record<'left' | 'right', EmulatedPose>>;
}

/** Seated eyes above the desk top (lower than standing, still looking down on the book). */
const SEATED_EYES_ABOVE_DESK_M = 0.3;
/** Seated, leaning in towards the desk (-Z) a little. */
const SEATED_FORWARD_M = 0.15;
/** Standing: IWER's rest. */
const STAND_HEAD_M = 1.6;
/** The hands a little under the eyes, both seated and standing. */
const HANDS_BELOW_EYES_M = 0.1;
/** Eyes lower than this over the desk count as seated, and the card offers to stand. */
const SEATED_BELOW_DESK_M = 0.45;
const HANDS_AHEAD_M = 0.4;
const HANDS_APART_M = 0.25;
/** In the desk's frame: right of HOME (game.ts HOME_CARD_X, ENVELOPE_Z), standing on the desk, small. */
const CARD_AT = new Vector3(0.375, 0.032, 0.11);
const CARD_SCALE = 0.32;
/** The card's face, in its own frame, for the controllers' rays. */
const CARD_BOX = new Box3(new Vector3(-0.15, -0.1, -0.01), new Vector3(0.15, 0.1, 0.02));
/** One click can reach the card both ways (the trigger check and IWSDK's press): the second is dropped. */
const TOGGLE_GAP_MS = 400;

function emulator(): EmulatedDevice | undefined {
  if (!import.meta.env.DEV) return undefined;
  return (window as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE;
}

export class DevSeatSystem extends createSystem({
  desks: { required: [DeskRoot] },
}) {
  private card?: Group;
  private label?: Label;
  private shown = '';
  /** Play mode's mouse lock to take back on the next frame, after the pose went to the panel. */
  private relock?: Element;
  private ray = new Ray();
  private inverse = new Matrix4();
  private dir = new Vector3();
  private toggledAt = -Infinity;

  /** Made once the emulator and the desk are up, as a child of the desk. */
  private build(desk: Entity): void {
    const group = new Group();
    group.name = 'dev-seat-card';
    const b = new Builder(5);
    b.box(0x3fb6a0, 0.3, 0.2, 0.012, 0, 0, 0);
    b.box(0xfff8ec, 0.27, 0.17, 0.004, 0, 0, 0.008);
    group.add(b.build('dev-seat-paper'));
    // A school chair seen from the side, on the left of the word.
    const c = new Builder(6);
    chair(c, 0, 0, Math.PI / 2, 0x3469c4);
    const icon = c.build('dev-seat-chair');
    icon.scale.setScalar(0.17);
    icon.position.set(-0.085, -0.065, 0.012);
    group.add(icon);
    this.label = new Label(T.devSit, { height: 0.045, card: false });
    this.label.mesh.position.set(0.045, 0, 0.012);
    group.add(this.label.mesh);
    group.position.copy(CARD_AT);
    group.scale.setScalar(CARD_SCALE);
    group.visible = false;
    // A hand's ray reaches the card through IWSDK (its pinch presses it); controllers through the check in update.
    group.addEventListener('pointerdown', () => {
      if (group.visible) queueMicrotask(() => this.toggle(desk));
    });
    // The emulator's T (game.ts emulatorTouch) presses it too.
    group.userData.onTouch = () => group.visible && this.toggle(desk);
    this.world.createTransformEntity(group, { parent: desk }).addComponent(RayInteractable);
    this.card = group;
  }

  update(): void {
    const device = emulator();
    if (!device) return;
    let desk: Entity | undefined;
    for (const e of this.queries.desks.entities) desk = e;
    if (!desk) return;
    if (!this.card) this.build(desk);
    const card = this.card;
    if (!card) return;
    const show = this.world.visibilityState.peek() !== VisibilityState.NonImmersive && !!desk.getValue(DeskRoot, 'placed');
    if (show !== card.visible) card.visible = show;
    if (this.relock) {
      if (document.pointerLockElement !== this.relock) void this.relock.requestPointerLock();
      this.relock = undefined;
    }
    if (!show) return;
    card.updateMatrixWorld();
    // A trigger click with a controller's ray on the card, from any distance
    // (IWSDK's ray only took it from close by). Hands pinch through IWSDK's press instead.
    this.inverse.copy(card.matrixWorld).invert();
    for (const side of ['left', 'right'] as const) {
      if (!this.input.xr.gamepads[side]?.getSelectStart()) continue;
      const space = this.player.raySpaces[side];
      space.getWorldPosition(this.ray.origin);
      space.getWorldDirection(this.dir);
      // A ray space looks down its -Z.
      this.ray.direction.copy(this.dir).negate();
      this.ray.applyMatrix4(this.inverse);
      if (this.ray.intersectsBox(CARD_BOX)) {
        this.toggle(desk);
        break;
      }
    }
    // Says what a click does now, also after the arrows moved the headset or the language changed.
    const text = this.seated(device, desk) ? T.devStand : T.devSit;
    if (text !== this.shown) {
      this.shown = text;
      this.label?.set(text);
    }
  }

  private seated(device: EmulatedDevice, desk: Entity): boolean {
    return device.position.y < (desk.object3D?.position.y ?? 0) + SEATED_BELOW_DESK_M;
  }

  private toggle(desk: Entity): void {
    const device = emulator();
    if (!device || performance.now() - this.toggledAt < TOGGLE_GAP_MS) return;
    this.toggledAt = performance.now();
    const sit = !this.seated(device, desk);
    const head = sit ? (desk.object3D?.position.y ?? 0) + SEATED_EYES_ABOVE_DESK_M : STAND_HEAD_M;
    const hands = head - HANDS_BELOW_EYES_M;
    const z = sit ? -SEATED_FORWARD_M : 0;
    device.position.set(0, head, z);
    device.quaternion.set(0, 0, 0, 1);
    for (const [side, x] of [
      ['left', -HANDS_APART_M],
      ['right', HANDS_APART_M],
    ] as const) {
      for (const pose of [device.controllers[side], device.hands[side]]) {
        pose?.position.set(x, hands, z - HANDS_AHEAD_M);
        pose?.quaternion.set(0, 0, 0, 1);
      }
    }
    // Hand the new pose to the panel, as the CLI's set-transform does, then give the mouse and keys back.
    const mode = device.controlMode;
    const locked = document.pointerLockElement ?? undefined;
    if (mode === 'programmatic') device.notifyStateChange();
    else {
      device.controlMode = 'programmatic';
      device.controlMode = mode;
    }
    this.relock = locked;
    console.info(`[dev] headset ${sit ? 'seated' : 'standing'}: eyes ${head.toFixed(2)} m`);
  }
}
