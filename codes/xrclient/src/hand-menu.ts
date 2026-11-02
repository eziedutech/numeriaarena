import { Box3, CylinderGeometry, Matrix4, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector3, type Object3D } from '@iwsdk/core';
import { Hands, type HandAdapters, type Side } from './measure/hands.js';

/**
 * How a tracked hand works every menu, as the headset's own browser does:
 *
 *  - near: the fingertip touches a card (or a balloon, a gate, a weight) and
 *    pushes into it, and that presses it. The card lights while the fingertip
 *    is close; it presses once, and again only after the finger has come back
 *    out, so a hand resting on the desk never presses by itself;
 *  - far: each hand shows a ray and a dot along IWSDK's own pointer ray of
 *    the hand. The dot lights a card, a pinch of thumb and index presses it
 *    (the card the dot was on before the fingers began to close);
 *  - when the two hands' dots are on two different cards, the right hand's
 *    is the one: the left hand's ray lies dim and does nothing.
 *
 * On a real Quest (October 2026) a ray with a dip of the index finger was
 * found to work like a controller and not like the hands of the browser.
 *
 * IWSDK's own ray and touch pointers are told to leave these cards alone while
 * hands are in use (pointerEventsType), so a pinch never presses one twice.
 * Controllers are not touched by any of this.
 */

export interface MenuTarget {
  object: Object3D;
  press: () => void;
  /** The card is not one the game eases itself: it grows here while it is lit. */
  selfGrow?: boolean;
  /** How far a fingertip is from it (metres), where its bounds would mislead (a balloon on its string). */
  distance?: (world: Vector3) => number;
}

export interface HandMenuHost {
  adapters(): HandAdapters | undefined;
  /** A hand's ray space: IWSDK's own pose of its pointer, the one balloons and crystals are pointed at by. */
  ray(side: Side): Object3D;
  /** The headset's own pinch of that hand (its select) began this frame. */
  select(side: Side): boolean;
  /** That hand's pinch is for something it picks up (a crystal), not for a card. */
  holding(side: Side): boolean;
  /** Hands drive the menus now: in the headset, a hand tracked, not controllers alone. */
  active(): boolean;
  targets(): MenuTarget[];
  /** The ray is always shown (in a menu) or only while it is on a card (while playing). */
  alwaysShow(): boolean;
  parent: Object3D;
}

/** The right hand first: where both are on a card, it is the right one's. */
const ORDER: readonly Side[] = ['right', 'left'];

/** The fingertip this near a card (metres, from its surface) lights it and puts the ray away. */
const NEAR_M = 0.07;
/** The fingertip this near, or inside, presses it. */
const PRESS_M = 0.012;
/** After a press the fingertip must come this far back out before it presses again. */
const REARM_M = 0.035;
/** Thumb and index tip this close are closing on a pinch: the card aimed at is kept from here. */
const CLOSING_M = 0.06;
/**
 * The pinch read from the joints: tips this close close it, this far open it again. Wider than
 * the measuring hands' own (1.5 cm), as the joints sit inside a real finger: touching pads leave
 * their centres nearly 2 cm apart. The headset's own pinch (select) is read as well.
 */
const PINCH_SHUT_M = 0.022;
const PINCH_OPEN_M = 0.035;
const PRESS_COOLDOWN_S = 0.3;
const REACH_M = 1.2;
/** A card the dot has left stays lit this long (seconds). */
const HOLD_S = 0.2;
/** A card that is lit grows by this much, as every lit thing in the game does. */
const GROW = 0.12;
const DOT_M = 0.5;
const RAY_COLOR = 0x9fc4ff;
const HOVER_COLOR = 0xffc940;
const DIM_COLOR = 0x8c8c8c;
const DENY = { deny: ['ray', 'touch'] };

interface Aim {
  /** A tracked hand: its ray is up unless the fingertip is at a card. */
  up: boolean;
  /** The card the fingertip is near, and how far from it (metres). */
  near?: MenuTarget;
  nearD: number;
  /** The fingertip has come out since its last press. */
  armed: boolean;
  /** The card the dot is on after the right hand took precedence. */
  target?: MenuTarget;
  dim: boolean;
  cooldown: number;
  /** Where the dot is. */
  point: Vector3;
  /** The ray now (its origin and way), and as it was before the fingers began to close. */
  origin: Vector3;
  aimDir: Vector3;
  lockO: Vector3;
  lockD: Vector3;
  /** Whether IWSDK's own ray was last told to hide. */
  taking?: boolean;
  /** Thumb and index are shut in a pinch (see PINCH_SHUT_M). */
  shut: boolean;
  /** The card the dot has just left, kept lit a moment so a card that grows under the dot does not blink. */
  holdT?: MenuTarget;
  holdUntil: number;
  /** The last card the dot was on before the fingers began to close. */
  lastTarget?: MenuTarget;
  ray: Mesh;
  dot: Mesh;
}

/** Each hand's fingertip is on a card this frame (at or in it): read by the desk, which must not take a card for the table. */
const onCard: Record<Side, boolean> = { left: false, right: false };

/** Whether this hand's fingertip is on one of the desk's cards (or balloons) now. */
export function fingertipOnCard(side: Side): boolean {
  return onCard[side];
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
  private end = new Vector3();
  private origin = new Vector3();
  private rdir = new Vector3();
  private local = new Vector3();
  private scale = new Vector3();
  private inverse = new Matrix4();
  private rel = new Matrix4();
  private part = new Box3();
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
      return { up: false, shut: false, nearD: Infinity, armed: true, dim: false, cooldown: 0, holdUntil: 0, point: new Vector3(), origin: new Vector3(), aimDir: new Vector3(0, 0, -1), lockO: new Vector3(), lockD: new Vector3(0, 0, -1), ray, dot };
    };
    this.aim = { right: make(), left: make() };
  }

  private sink?: (side: Side, origin: Vector3, dir: Vector3) => void;

  /** Takes the pinches that land on no card (with the ray they were aimed by); none to stop. */
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

  /** Whether this hand's ray is handled here, so IWSDK's own is not drawn over it. */
  takesRay(side: Side): boolean {
    const a = this.aim[side];
    const take = this.on && (a.up || !!a.near);
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
      if (a.cooldown > 0) a.cooldown -= delta;
      this.touch(side, a, h.tracked ? h.tip : undefined, targets);
      const up = h.tracked && !a.near;
      if (up !== a.up) console.info(`[hand-menu] ${side} ray ${up ? 'up' : 'down'}${a.near ? ' (fingertip at a card)' : ''}`);
      a.up = up;
      let target: MenuTarget | undefined = a.near;
      if (up) {
        const rs = this.host.ray(side);
        rs.getWorldPosition(this.origin);
        rs.getWorldDirection(this.rdir).negate();
        a.origin.copy(this.origin);
        a.aimDir.copy(this.rdir);
        this.raycaster.set(this.origin, this.rdir);
        this.raycaster.far = REACH_M;
        const found = this.raycaster.intersectObjects(objects, true).find((x) => x.object.visible);
        if (found) {
          a.point.copy(found.point);
          for (let o: Object3D | null = found.object; o && !target; o = o.parent) target = this.map.get(o);
        } else {
          a.point.copy(this.origin).addScaledVector(this.rdir, DOT_M);
        }
      }
      hits.push(target);
    }
    // A card the dot has just left stays lit for a moment: one that grows under the dot would otherwise
    // lose it at its edge, shrink, win it back, and blink.
    ORDER.forEach((side, i) => {
      const a = this.aim[side];
      if (hits[i]) {
        a.holdT = hits[i];
        a.holdUntil = this.now + HOLD_S;
      } else if (a.holdT && this.now < a.holdUntil && a.up && this.map.has(a.holdT.object)) hits[i] = a.holdT;
    });
    // Two hands on two different cards from afar: the right hand's. A fingertip at a card always has it.
    const [right, left] = hits;
    this.aim.right.dim = false;
    this.aim.left.dim = false;
    if (right && left && right !== left && !this.aim.left.near) {
      hits[1] = undefined;
      this.aim.left.dim = true;
    }
    const nowLit = new Set<Object3D>();
    ORDER.forEach((side, i) => {
      const a = this.aim[side];
      if (hits[i] !== a.target) console.info(`[hand-menu] ${side} ${a.near ? 'fingertip' : 'dot'} ${hits[i] ? `on ${hits[i]?.object.name || 'a card'}` : 'off the cards'}`);
      a.target = hits[i];
      if (a.target) nowLit.add(a.target.object);
      // The card and the ray as they were before the fingers closed (they move the ray as they close).
      const h = this.hands.get(side);
      const closing = h.tracked && h.tip.distanceTo(h.thumb) < CLOSING_M;
      if (!closing && a.up) {
        a.lastTarget = a.target;
        a.lockO.copy(a.origin);
        a.lockD.copy(a.aimDir);
      }
      this.pinch(side, a);
      this.draw(a);
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

  /** The fingertip near a card, and the press when it pushes into it. */
  private touch(side: Side, a: Aim, tip: Vector3 | undefined, targets: MenuTarget[]): void {
    a.near = undefined;
    a.nearD = Infinity;
    onCard[side] = false;
    if (!tip) {
      a.armed = true;
      return;
    }
    for (const t of targets) {
      const d = t.distance ? t.distance(tip) : this.distance(t.object, tip);
      if (d < a.nearD) {
        a.nearD = d;
        a.near = t;
      }
    }
    onCard[side] = a.nearD <= PRESS_M + 0.005;
    if (a.nearD > NEAR_M) a.near = undefined;
    if (a.nearD > REARM_M) a.armed = true;
    if (!a.near || !a.armed || a.cooldown > 0 || a.nearD > PRESS_M) return;
    a.armed = false;
    a.cooldown = PRESS_COOLDOWN_S;
    console.info(`[hand-menu] ${side} fingertip presses ${a.near.object.name || 'a card'}`);
    a.near.press();
  }

  /** How far a point is from a card's paper (metres), zero inside it. */
  private distance(obj: Object3D, world: Vector3): number {
    if (!obj.visible) return Infinity;
    const box = this.boxOf(obj);
    if (!box) return Infinity;
    this.local.copy(world);
    obj.worldToLocal(this.local);
    obj.getWorldScale(this.scale);
    return box.distanceToPoint(this.local) * this.scale.x;
  }

  /** A card's bounds in its own frame, measured once: its meshes, wherever they sit under it. */
  private boxOf(obj: Object3D): Box3 | undefined {
    const kept = obj.userData.touchBox as Box3 | undefined;
    if (kept) return kept;
    obj.updateWorldMatrix(true, true);
    this.inverse.copy(obj.matrixWorld).invert();
    const box = new Box3();
    obj.traverse((o) => {
      const g = (o as Mesh).geometry;
      if (!(o as Mesh).isMesh || !g || !o.visible) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return;
      this.rel.multiplyMatrices(this.inverse, o.matrixWorld);
      box.union(this.part.copy(g.boundingBox).applyMatrix4(this.rel));
    });
    if (box.isEmpty()) return undefined;
    obj.userData.touchBox = box;
    return box;
  }

  /** A pinch from afar presses the card the dot was on before the fingers closed. */
  private pinch(side: Side, a: Aim): void {
    const h = this.hands.get(side);
    const gap = h.tracked ? h.tip.distanceTo(h.thumb) : Infinity;
    const was = a.shut;
    // An untracked hand counts as shut, so one that is found already pinching presses nothing.
    a.shut = !h.tracked || (was ? gap < PINCH_OPEN_M : gap < PINCH_SHUT_M);
    const pinched = (a.shut && !was) || this.host.select(side);
    if (!pinched || a.near || !h.tracked || a.cooldown > 0 || this.host.holding(side)) return;
    a.cooldown = PRESS_COOLDOWN_S;
    const target = a.dim ? undefined : a.lastTarget;
    console.info(`[hand-menu] ${side} pinch on ${target ? (target.object.name || 'a card') : 'nothing'}`);
    if (target) target.press();
    // A pinch on no card goes to whoever works with the hand's ray (Measure Hunt's paper), unless the other hand is on a card.
    else if (!a.dim) this.sink?.(side, a.lockO, a.lockD);
  }

  private draw(a: Aim): void {
    const shown = a.up && (this.host.alwaysShow() || !!a.target);
    a.ray.visible = shown;
    a.dot.visible = shown;
    if (!shown) return;
    // From the hand, along the ray, to the dot.
    this.end.copy(a.point).sub(a.origin);
    const length = this.end.length();
    a.ray.position.copy(a.origin);
    a.ray.scale.set(1, Math.max(length, 1e-3), 1);
    if (length > 1e-4) a.ray.quaternion.setFromUnitVectors(UP, this.end.divideScalar(length));
    a.dot.position.copy(a.point);
    const lit = !!a.target;
    a.dot.scale.setScalar(lit ? 1.7 : 1);
    (a.dot.material as MeshBasicMaterial).color.setHex(a.dim ? DIM_COLOR : lit ? HOVER_COLOR : 0xffffff);
    (a.ray.material as MeshBasicMaterial).color.setHex(a.dim ? DIM_COLOR : RAY_COLOR);
  }

  private hide(): void {
    for (const side of ORDER) {
      const a = this.aim[side];
      onCard[side] = false;
      a.up = false;
      a.near = undefined;
      a.target = undefined;
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
