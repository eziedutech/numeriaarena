import { Box3, type Entity, Group, Matrix4, Ray, RayInteractable, Vector3, VisibilityState, createSystem } from '@iwsdk/core';

import { ToolButton } from './art/tool-icon.js';
import { DeskRoot } from './game-components.js';
import { T } from './text.js';

/**
 * A small card beside HOME, only in the browser's XR emulator (IWER), that
 * seats the emulated headset or stands it up again with one trigger click:
 * the eyes, controllers and hands go down to a seated child's height over
 * the desk, or back to IWER's standing rest; once left, each goes back to
 * just where it was, controllers' tilt and all. The desk never moves, as a
 * real one does not when a child sits down. A real headset follows the
 * body, so the card never shows there (or in a build).
 */
interface EmulatedPose {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void };
  quaternion: { x: number; y: number; z: number; w: number; set(x: number, y: number, z: number, w: number): void };
}
/** A pose copied out, as [x, y, z] and [x, y, z, w]. */
type Kept = { p: [number, number, number]; q: [number, number, number, number] };
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
/**
 * In the desk's frame: just right of the menu's settings strip (game.ts
 * SETTINGS_AT), floating over the desk at the strip's depth and leaning back
 * a little towards the eyes, so nothing on the desk stands in a ray's way.
 */
const CARD_AT = new Vector3(0.52, 0.1, 0.15);
const CARD_LEAN = -0.35;
/** A flat tile like the town's toolbar buttons: a chair to sit, a standing person to stand. */
const CARD_W = 0.08;
const CARD_H = 0.08;
/** The card's face, in its own frame, for the controllers' rays: a little thick, so a ray that grazes it still counts. */
const CARD_BOX = new Box3(new Vector3(-CARD_W / 2, -CARD_H / 2, -0.02), new Vector3(CARD_W / 2, CARD_H / 2, 0.03));
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
  private button?: ToolButton;
  private shown = '';
  /** Play mode's mouse lock to take back on the next frame, after the pose went to the panel. */
  private relock?: Element;
  private ray = new Ray();
  private inverse = new Matrix4();
  private dir = new Vector3();
  private toggledAt = -Infinity;
  /**
   * The eyes, controllers and hands as they were when last left seated or
   * standing, each keyed by name: going back puts them there again, so the
   * card is in reach just as it was (IWER's standing rest has its
   * controllers lower and tilted, not where the made up pose puts them).
   */
  private kept: Record<'seated' | 'standing', Map<string, Kept> | undefined> = { seated: undefined, standing: undefined };

  /** Made once the emulator and the desk are up, as a child of the desk. */
  private build(desk: Entity): void {
    const group = new Group();
    group.name = 'dev-seat-card';
    this.button = new ToolButton('sit', T.devSit, CARD_W, CARD_H, 'plain', { alone: true, theme: 'home' });
    group.add(this.button.mesh);
    group.position.copy(CARD_AT);
    group.rotation.x = CARD_LEAN;
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
    const seated = this.seated(device, desk);
    const text = seated ? T.devStand : T.devSit;
    if (text !== this.shown) {
      this.shown = text;
      this.button?.set(seated ? 'stand' : 'sit', 'plain', text);
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
    this.kept[sit ? 'standing' : 'seated'] = this.keep(device);
    const back = this.kept[sit ? 'seated' : 'standing'];
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
    if (back) for (const [name, pose] of this.poses(device)) this.put(pose, back.get(name));
    // Hand the new pose to the panel, as the CLI's set-transform does, then give the mouse and keys back.
    const mode = device.controlMode;
    const locked = document.pointerLockElement ?? undefined;
    if (mode === 'programmatic') device.notifyStateChange();
    else {
      device.controlMode = 'programmatic';
      device.controlMode = mode;
    }
    this.relock = locked;
    console.info(`[dev] headset ${sit ? 'seated' : 'standing'}: eyes ${device.position.y.toFixed(2)} m`);
  }

  private poses(device: EmulatedDevice): [string, EmulatedPose | undefined][] {
    return [
      ['head', device],
      ['controller-left', device.controllers.left],
      ['controller-right', device.controllers.right],
      ['hand-left', device.hands.left],
      ['hand-right', device.hands.right],
    ];
  }

  private keep(device: EmulatedDevice): Map<string, Kept> {
    const kept = new Map<string, Kept>();
    for (const [name, pose] of this.poses(device)) {
      if (!pose) continue;
      const { position: p, quaternion: q } = pose;
      kept.set(name, { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] });
    }
    return kept;
  }

  private put(pose: EmulatedPose | undefined, kept: Kept | undefined): void {
    if (!pose || !kept) return;
    pose.position.set(...kept.p);
    pose.quaternion.set(...kept.q);
  }
}
