import { CylinderGeometry, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector3, type Object3D } from '@iwsdk/core';
import { Hands, type HandAdapters, type Side } from './measure/hands.js';

/**
 * How a tracked hand works every menu, without exception:
 *
 *  - each hand shows a ray and a dot, the ray from its index knuckle along the
 *    way the index finger points (held where it was while the finger dips to tap);
 *  - a dot on a menu card only lights it (hover), it never opens it;
 *  - the click is a tap of the index finger (it dips at the knuckle and comes
 *    back), never a pinch;
 *  - a tap takes the card the dot was on before the finger moved;
 *  - when the two hands are on two different cards, the right hand's is the one:
 *    the left hand's ray lies dim and does nothing.
 *
 * IWSDK's own ray and touch pointers are told to leave these cards alone while
 * hands are in use (pointerEventsType), so a pinch or a brush of the finger
 * never presses one. Controllers are not touched by any of this.
 */

export interface MenuTarget {
  object: Object3D;
  press: () => void;
  /** The card is not one the game eases itself: it grows here while the dot is on it. */
  selfGrow?: boolean;
}

export interface HandMenuHost {
  adapters(): HandAdapters | undefined;
  /** Hands drive the menus now: in the headset, a hand tracked, not controllers alone. */
  active(): boolean;
  targets(): MenuTarget[];
  /** The ray is always shown (in a menu) or only while it is on a card (while playing). */
  alwaysShow(): boolean;
  /** The emulator's hands cannot tap: their pinch does. */
  pinchTaps(): boolean;
  parent: Object3D;
}

/** The right hand first: where both are on a card, it is the right one's. */
const ORDER: readonly Side[] = ['right', 'left'];

/** The finger's angle off the palm's line, in degrees: it rises and falls back in a tap. */
const TAP_RISE_DEG = 22;
const TAP_MAX_DEG = 65;
const TAP_ONSET_DEG_S = 120;
const TAP_WINDOW_S = 0.5;
const TAP_COOLDOWN_S = 0.3;
/** A finger shorter than this (knuckle to tip, metres) is a fist; no ray. */
const FINGER_OUT_M = 0.045;
/** The thumb and index tip this close is a pinch: no ray. */
const PINCH_M = 0.03;
/** Thumb and index tip this close are closing on a pinch: the card aimed at is kept from here. */
const CLOSING_M = 0.06;
const REACH_M = 1.2;
/** A card the dot is on grows by this much, as every lit thing in the game does. */
const GROW = 0.12;
const DOT_M = 0.5;
const RAY_COLOR = 0x9fc4ff;
const HOVER_COLOR = 0xffc940;
const DIM_COLOR = 0x8c8c8c;
const DENY = { deny: ['ray', 'touch'] };

interface Aim {
  /** The ray is up: a tracked hand with its index finger out and not pinching. */
  up: boolean;
  /** The card the dot is on after the right hand took precedence. */
  target?: MenuTarget;
  /** The card the dot was on before the finger began to dip. */
  steady?: MenuTarget;
  dim: boolean;
  alpha: number;
  base: number;
  rising: boolean;
  peak: number;
  since: number;
  cooldown: number;
  /** How fast the finger's angle is changing, degrees a second. */
  speed: number;
  /** Where the dot is. */
  point: Vector3;
  /** The ray now (its origin and way), and as it was when the finger last stood steady before a tap. */
  origin: Vector3;
  aimDir: Vector3;
  lockO: Vector3;
  lockD: Vector3;
  /** The way the finger points now, a frame ago, and as it was when a tap began. */
  dir: Vector3;
  prev: Vector3;
  frozen: Vector3;
  /** Whether IWSDK's own ray was last told to hide. */
  taking?: boolean;
  /** When the emulator's pinch began, and where. */
  pinchT: number;
  pinchP: Vector3;
  /** The last card the dot was on, and when. */
  lastTarget?: MenuTarget;
  lastAt: number;
  ray: Mesh;
  dot: Mesh;
}

const rayGeo = new CylinderGeometry(0.0015, 0.0015, 1, 6).translate(0, 0.5, 0);
const dotGeo = new SphereGeometry(0.006, 12, 8);
const UP = new Vector3(0, 1, 0);

export class HandMenu {
  private hands: Hands;
  private raycaster = new Raycaster();
  private aim: Record<Side, Aim>;
  private lit = new Set<Object3D>();
  private on = false;
  private now = 0;
  private knuckle = new Vector3();
  private axis = new Vector3();
  private finger = new Vector3();
  private end = new Vector3();
  private from = new Vector3();
  private map = new Map<Object3D, MenuTarget>();

  constructor(private host: HandMenuHost) {
    this.hands = new Hands(() => host.adapters());
    const make = (): Aim => {
      const ray = new Mesh(rayGeo, new MeshBasicMaterial({ color: RAY_COLOR, transparent: true, opacity: 0.85, depthWrite: false }));
      const dot = new Mesh(dotGeo, new MeshBasicMaterial({ color: 0xffffff, depthWrite: false }));
      ray.visible = false;
      dot.visible = false;
      ray.renderOrder = 30;
      dot.renderOrder = 31;
      host.parent.add(ray, dot);
      return { up: false, dim: false, alpha: 0, base: 0, rising: false, peak: 0, since: 0, cooldown: 0, lastAt: -1, pinchT: -1, pinchP: new Vector3(), speed: 0, point: new Vector3(), origin: new Vector3(), aimDir: new Vector3(0, 0, -1), lockO: new Vector3(), lockD: new Vector3(0, 0, -1), dir: new Vector3(0, 0, -1), prev: new Vector3(0, 0, -1), frozen: new Vector3(0, 0, -1), ray, dot };
    };
    this.aim = { right: make(), left: make() };
  }

  private sink?: (side: Side, origin: Vector3, dir: Vector3) => void;

  /** Takes the taps that land on no card (with the ray they were aimed by); none to stop. */
  setSink(sink: ((side: Side, origin: Vector3, dir: Vector3) => void) | undefined): void {
    this.sink = sink;
  }

  /** A hand's ray this frame, if hands drive the menus and the ray is up. */
  aimOf(side: Side, origin: Vector3, dir: Vector3): boolean {
    const a = this.aim[side];
    if (!this.on || !a.up) return false;
    origin.copy(a.origin);
    dir.copy(a.aimDir);
    return true;
  }

  /** Whether hands drive the menus this frame. */
  isActive(): boolean {
    return this.on;
  }

  /** Whether this hand's ray is drawn here, so IWSDK's own is not drawn over it. */
  takesRay(side: Side): boolean {
    const a = this.aim[side];
    const take = this.on && a.up && (this.host.alwaysShow() || !!a.target);
    if (take !== a.taking) {
      a.taking = take;
      console.info(`[hand-menu] ${side} takes IWSDK's ray: ${take}`);
    }
    return take;
  }

  update(delta: number): void {
    this.now += delta;
    const targets = this.host.targets();
    const on = this.host.active();
    // IWSDK leaves the cards alone while hands drive them, and takes them back with controllers.
    for (const t of targets) {
      if (t.object.userData.handDenied !== on) {
        t.object.userData.handDenied = on;
        t.object.pointerEventsType = on ? DENY : 'all';
      }
    }
    this.on = on;
    if (!on) {
      this.hide();
      return;
    }
    this.hands.update(delta);
    this.map.clear();
    const objects: Object3D[] = [];
    for (const t of targets) {
      this.map.set(t.object, t);
      objects.push(t.object);
    }
    const hits: (MenuTarget | undefined)[] = [];
    for (const side of ORDER) {
      const a = this.aim[side];
      const h = this.hands.get(side);
      const f = this.pose(a, h, delta);
      if (f !== a.up) {
        console.info(`[hand-menu] ${side} ray ${f ? 'up' : 'down'} (tracked ${h.tracked}, finger ${h.tip.distanceTo(h.knuckle).toFixed(3)} m, pinching ${h.tip.distanceTo(h.thumb).toFixed(3)} m)`);
      }
      a.up = f;
      let target: MenuTarget | undefined;
      const point = a.point;
      const dir = a.rising ? a.frozen : a.dir;
      if (f) {
        a.origin.copy(this.knuckle);
        a.aimDir.copy(dir);
        this.raycaster.set(this.knuckle, dir);
        this.raycaster.far = REACH_M;
        const found = this.raycaster.intersectObjects(objects, true).find((x) => x.object.visible);
        if (found) {
          point.copy(found.point);
          for (let o: Object3D | null = found.object; o && !target; o = o.parent) target = this.map.get(o);
        } else {
          point.copy(this.knuckle).addScaledVector(dir, DOT_M);
        }
      }
      hits.push(target);
    }
    // Two hands on two different cards: the right hand's.
    const [right, left] = hits;
    this.aim.right.dim = false;
    this.aim.left.dim = false;
    if (right && left && right !== left) {
      hits[1] = undefined;
      this.aim.left.dim = true;
    }
    const nowLit = new Set<Object3D>();
    ORDER.forEach((side, i) => {
      const a = this.aim[side];
      if (hits[i] !== a.target) console.info(`[hand-menu] ${side} dot ${hits[i] ? `on ${hits[i]?.object.name || 'a card'}` : 'off the cards'}`);
      a.target = hits[i];
      if (a.target) nowLit.add(a.target.object);
      // The card last aimed at before the fingers closed (they move the ray as they close).
      const closing = this.hands.get(side).tracked && this.hands.get(side).tip.distanceTo(this.hands.get(side).thumb) < CLOSING_M;
      if (!closing) {
        a.lastTarget = a.target;
        a.lastAt = this.now;
        if (a.up && !a.rising) {
          a.lockO.copy(a.origin);
          a.lockD.copy(a.aimDir);
        }
      }
      if (!a.rising) a.steady = a.target;
      this.tap(side, a, delta);
      a.prev.copy(a.dir);
      this.draw(side, a);
    });
    for (const o of this.lit) if (!nowLit.has(o)) o.userData.handHover = false;
    for (const o of nowLit) o.userData.handHover = true;
    this.lit = nowLit;
    for (const t of targets) {
      if (!t.selfGrow) continue;
      const o = t.object;
      const h = (o.userData.hover as number | undefined) ?? 0;
      const next = h + ((nowLit.has(o) ? 1 : 0) - h) * Math.min(1, delta * 10);
      o.userData.hover = next;
      o.userData.hoverBase ??= o.scale.x;
      o.scale.setScalar((o.userData.hoverBase as number) * (1 + GROW * next));
    }
  }

  /**
   * Reads the hand: the ray's origin and line (the knuckle, along the palm's
   * way), and how far the finger is bent off that line. False when no ray is up.
   */
  private pose(a: Aim, h: ReturnType<Hands['get']>, delta: number): boolean {
    if (!h.tracked) {
      a.rising = false;
      return false;
    }
    this.knuckle.copy(h.knuckle);
    this.axis.copy(h.knuckle).sub(h.wrist).normalize();
    this.finger.copy(h.tip).sub(h.knuckle);
    const reach = this.finger.length();
    if (reach > 1e-4) a.dir.copy(this.finger).divideScalar(reach);
    const alpha = reach > 1e-4 ? (Math.acos(Math.min(1, Math.max(-1, this.finger.normalize().dot(this.axis)))) * 180) / Math.PI : 0;
    const dt = Math.max(delta, 1e-3);
    const smooth = a.alpha + (alpha - a.alpha) * (1 - Math.exp(-dt / 0.03));
    const speed = (smooth - a.alpha) / dt;
    a.alpha = smooth;
    // The finger's rest angle follows it slowly while it is not moving fast.
    if (!a.rising && Math.abs(speed) < 40) a.base += (smooth - a.base) * (1 - Math.exp(-dt / 0.6));
    a.speed = speed;
    const pinch = h.tip.distanceTo(h.thumb) < PINCH_M;
    return reach > FINGER_OUT_M && !pinch;
  }

  /** The tap: the finger dips by 22 to 65 degrees, quickly, and begins to come back. */
  private tap(side: Side, a: Aim, delta: number): void {
    const h = this.hands.get(side);
    const speed = a.speed;
    if (a.cooldown > 0) a.cooldown -= delta;
    let tapped = false;
    // The emulator's pinch closes the fingers and puts the ray down at once: the card it was on a moment ago.
    const lately = this.now - a.lastAt < 0.8 ? a.lastTarget : a.target;
    const closed = this.now - a.lastAt < 0.8;
    if (this.host.pinchTaps()) {
      // The tap, as the pinch closes: the solid is turned by its cards, never by pinching it.
      if (h.pinchStart) {
        a.steady = lately;
        tapped = true;
      }
    } else if (a.up && a.cooldown <= 0) {
      if (!a.rising) {
        if (a.alpha - a.base > 10 && speed > TAP_ONSET_DEG_S) {
          a.rising = true;
          a.frozen.copy(a.prev);
          a.peak = a.alpha;
          a.since = this.now;
        }
      } else {
        a.peak = Math.max(a.peak, a.alpha);
        if (this.now - a.since > TAP_WINDOW_S) a.rising = false;
        else if (a.alpha < a.peak - 4) {
          const depth = a.peak - a.base;
          a.rising = false;
          if (depth >= TAP_RISE_DEG && depth <= TAP_MAX_DEG) tapped = true;
        }
      }
    } else if (!a.up) a.rising = false;
    if (!tapped) return;
    a.cooldown = TAP_COOLDOWN_S;
    const target = a.steady;
    console.info(`[hand-menu] ${side} tap on ${target ? (target.object.name || 'a card') : 'nothing'}`);
    if (target) target.press();
    // A tap on no card goes to whoever works with the hand's ray (Measure Hunt's paper), unless the other hand is on a card.
    else if (!a.dim && (closed || a.up)) this.sink?.(side, a.lockO, a.lockD);
  }

  private draw(side: Side, a: Aim): void {
    const point = a.point;
    const h = this.hands.get(side);
    const shown = a.up && (this.host.alwaysShow() || !!a.target);
    a.ray.visible = shown;
    a.dot.visible = shown;
    if (!shown) return;
    // From the fingertip, along the ray, to the dot.
    this.from.copy(h.tip);
    this.end.copy(point).sub(this.from);
    const length = this.end.length();
    a.ray.position.copy(this.from);
    a.ray.scale.set(1, Math.max(length, 1e-3), 1);
    if (length > 1e-4) a.ray.quaternion.setFromUnitVectors(UP, this.end.divideScalar(length));
    a.dot.position.copy(point);
    const lit = !!a.target;
    a.dot.scale.setScalar(lit ? 1.7 : 1);
    (a.dot.material as MeshBasicMaterial).color.setHex(a.dim ? DIM_COLOR : lit ? HOVER_COLOR : 0xffffff);
    (a.ray.material as MeshBasicMaterial).color.setHex(a.dim ? DIM_COLOR : RAY_COLOR);
  }

  private hide(): void {
    for (const side of ORDER) {
      const a = this.aim[side];
      a.up = false;
      a.target = undefined;
      a.rising = false;
      a.ray.visible = false;
      a.dot.visible = false;
    }
    for (const o of this.lit) o.userData.handHover = false;
    this.lit.clear();
  }

  dispose(): void {
    this.hide();
    for (const side of ORDER) {
      const a = this.aim[side];
      a.ray.removeFromParent();
      a.dot.removeFromParent();
      (a.ray.material as MeshBasicMaterial).dispose();
      (a.dot.material as MeshBasicMaterial).dispose();
    }
  }
}
