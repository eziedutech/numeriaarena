import { Box3, CylinderGeometry, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Raycaster, RingGeometry, SphereGeometry, Vector3, type Object3D } from '@iwsdk/core';
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
 *    (the card the dot was on a moment before the pinch, PINCH_LOOKBACK_S);
 *    a balloon, weight, gate or plank is taken by a ray passing near it;
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
  /**
   * A small thing that moves or stands apart (a balloon, a weight, a gate, a plank): where its middle
   * is (world) and how big round it (metres). A ray passing this near it takes it even off its paper.
   */
  aimAt?: (out: Vector3) => Vector3;
  aimR?: number;
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
/**
 * The index fingertip works a card as a finger works a touch screen (Zia, 4 Nov 2026):
 *  - it is first in front of the card's face, by it (READY_EDGE_M), at least READY_M off it;
 *  - from there it pokes in, at least POKE_M behind the face, within READY_S: the card is down;
 *  - it comes back out through the face, over the card still: that is the press, on the way out.
 * Slid off the card's edge while down, pushed on through it (CANCEL_M), or come in from the side,
 * from behind or across it, it presses nothing. The tip must have moved itself, so a balloon that
 * drifts onto a still finger is not poked. Only the index fingertip counts, of either hand.
 */
const READY_M = 0.012;
const POKE_M = 0.008;
const READY_S = 0.8;
const CANCEL_M = 0.04;
/** Back out this far in front of the face: the press. */
const RELEASE_M = 0.002;
/**
 * The fingertip may be this far past the card's edges (metres) and still be over it; down in it,
 * DOWN_EDGE_M (a finger poking straight on at a card that lies back slides along it as it goes in).
 */
const EDGE_M = 0.004;
const DOWN_EDGE_M = 0.015;
/**
 * Ready, in front of it, it may be this far past them: a finger coming at a card that lies back
 * comes in over its near edge. The poke and the way out are over the card itself (EDGE_M); a hand
 * reaching past a card goes on through it and never comes back out of its face, so it presses nothing.
 */
const READY_EDGE_M = 0.03;
/** On a card or in it: read by the desk, which must not take a card for the table. */
const ON_CARD_M = 0.011;
const PRESS_COOLDOWN_S = 0.3;
/**
 * A card that has just come up takes no fingertip for this long (seconds): the answers that come up
 * when the last pin of Measure Hunt is joined are where the hand passes on its way back.
 */
const NEW_WAIT_S = 0.6;
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
/**
 * A ray that hits no card takes the small thing (aimAt) whose middle it passes nearest, this much
 * outside its size at most (metres): a balloon of 6 cm drifting up is hard to keep exactly under a dot.
 */
const ASSIST_M = 0.035;
/** The small thing the dot is on keeps it while the ray stays this near it (metres): it never flickers off. */
const STICK_M = 0.06;
/**
 * A pinch presses what the dot was on this long before it (seconds), as closing fingers move the
 * ray. Found from the time, not from how open the hand is: a relaxed hand on a real Quest points
 * with thumb and index nearer than 6 cm, and the old rule then kept the card of long before.
 */
const PINCH_LOOKBACK_S = 0.15;
/** How long back the dot's way is remembered (seconds), and in how many frames at most: a dot that
 * slipped off a moving balloon just before the pinch still takes it. */
const HISTORY_S = 0.4;
const HISTORY_N = 64;

interface Past {
  t: number;
  target?: MenuTarget;
  origin: Vector3;
  dir: Vector3;
}

interface Aim {
  /** A tracked hand: its ray is up unless the fingertip is at a card. */
  up: boolean;
  /** The card the fingertip is near, and how far from it (metres). */
  near?: MenuTarget;
  nearD: number;
  /** The fingertip's poke of a card: in front of it (ready), or in it (down). */
  poke?: { obj: Object3D; down: boolean; at: number; tip: Vector3; way: Vector3 };
  /** A ring on the card under the fingertip, smaller the nearer it is, as the headset's browser shows. */
  ring: Mesh;
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
  /** The card the dot has just left, kept lit a moment so a card that grows under the dot does not blink. */
  holdT?: MenuTarget;
  holdUntil: number;
  /** The last card the dot was on before the fingers began to close. */
  lastTarget?: MenuTarget;
  ray: Mesh;
  dot: Mesh;
  /** The dot's last moments, newest at `head`. */
  past: Past[];
  head: number;
}

/** Each hand's fingertip is on a card this frame (at or in it): read by the desk, which must not take a card for the table. */
const onCard: Record<Side, boolean> = { left: false, right: false };

/** Each hand's fingertip is at something it touches (Measure Hunt's paper): its ray is put away. */
const resting: Record<Side, boolean> = { left: false, right: false };

/** How far the hands' rays reach now (metres), when something limits them (Measure Hunt while measuring). */
let reachNow: number | undefined;

/** Limits how far the hands' rays reach and are drawn, or (undefined) lets them reach as far as ever. */
export function setRayReach(m: number | undefined): void {
  reachNow = m;
}

/** Puts a hand's ray away while its fingertip works near something it touches, or brings it back. */
export function setRayRest(side: Side, on: boolean): void {
  resting[side] = on;
}

/** Whether this hand's fingertip is on one of the desk's cards (or balloons) now. */
export function fingertipOnCard(side: Side): boolean {
  return onCard[side];
}

const rayGeo = new CylinderGeometry(0.0015, 0.0015, 1, 6).translate(0, 0.5, 0);
const dotGeo = new SphereGeometry(0.006, 12, 8);
const ringGeo = new RingGeometry(0.0055, 0.0085, 28);
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
  private best = new Vector3();
  private scale = new Vector3();
  private inverse = new Matrix4();
  private rel = new Matrix4();
  private part = new Box3();
  private map = new Map<Object3D, MenuTarget>();
  /** When each card now up came up (seconds), and the cards up last frame. */
  private upSince = new Map<Object3D, number>();
  private wasUp = new Set<Object3D>();
  private axis = new Vector3();
  private face = { depth: 0, over: false, near: false, at: new Vector3(), normal: new Vector3() };
  private quat = new Quaternion();

  constructor(private host: HandMenuHost) {
    this.hands = new Hands(() => host.adapters());
    const make = (): Aim => {
      const ray = new Mesh(rayGeo, new MeshBasicMaterial({ color: RAY_COLOR, transparent: true, opacity: 0.85, depthWrite: false }));
      const dot = new Mesh(dotGeo, new MeshBasicMaterial({ color: 0xffffff, depthWrite: false }));
      const ring = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, side: DoubleSide }));
      ray.visible = false;
      dot.visible = false;
      ring.visible = false;
      ring.renderOrder = 32;
      ray.renderOrder = 30;
      dot.renderOrder = 31;
      host.parent.add(ray, dot, ring);
      return { up: false, ring, nearD: Infinity, dim: false, cooldown: 0, holdUntil: 0, past: Array.from({ length: HISTORY_N }, () => ({ t: -Infinity, origin: new Vector3(), dir: new Vector3(0, 0, -1) })), head: 0, point: new Vector3(), origin: new Vector3(), aimDir: new Vector3(0, 0, -1), lockO: new Vector3(), lockD: new Vector3(0, 0, -1), ray, dot };
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

  /** Whether this hand's fingertip or dot is on a card now. */
  onCard(side: Side): boolean {
    return this.on && !!this.aim[side].target;
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
    this.wasUp.clear();
    for (const t of targets) {
      if (!this.upSince.has(t.object)) this.upSince.set(t.object, this.now);
      this.wasUp.add(t.object);
    }
    for (const o of this.upSince.keys()) if (!this.wasUp.has(o)) this.upSince.delete(o);
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
      const up = h.tracked && !a.near && !resting[side];
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
        this.raycaster.far = reachNow ?? REACH_M;
        const found = this.raycaster.intersectObjects(objects, true).find((x) => x.object.visible);
        if (found) {
          a.point.copy(found.point);
          for (let o: Object3D | null = found.object; o && !target; o = o.parent) target = this.map.get(o);
        } else {
          a.point.copy(this.origin).addScaledVector(this.rdir, Math.min(DOT_M, reachNow ?? DOT_M));
        }
        if (!target) target = this.assist(targets, a.point, a.target);
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
      this.remember(a);
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

  /** The fingertip near a card, and its poke of it (see READY_M): a press on the way back out. */
  private touch(side: Side, a: Aim, tip: Vector3 | undefined, targets: MenuTarget[]): void {
    a.near = undefined;
    a.nearD = Infinity;
    onCard[side] = false;
    a.ring.visible = false;
    if (!tip) {
      this.endPoke(side, a, 'the hand was lost');
      return;
    }
    for (const t of targets) {
      const d = t.distance ? t.distance(tip) : this.distance(t.object, tip);
      if (d < a.nearD) {
        a.nearD = d;
        a.near = t;
      }
    }
    // A card being poked keeps the fingertip while it is in it, though another be nearer.
    const held = a.poke?.down ? targets.find((t) => t.object === a.poke?.obj) : undefined;
    if (held) a.near = held;
    if (!a.near || (!held && a.nearD > NEAR_M)) {
      a.near = undefined;
      this.endPoke(side, a, 'the fingertip went off it');
      return;
    }
    const t = a.near;
    const f = this.faceOf(t, tip, a.poke?.down ? a.poke.way : undefined);
    onCard[side] = f.over && f.depth <= ON_CARD_M;
    if (a.poke && a.poke.obj !== t.object) this.endPoke(side, a, 'the fingertip went to another');
    this.showRing(a, f);
    if (a.poke?.down) {
      if (!f.over) return this.endPoke(side, a, 'slid off its edge');
      if (!t.distance && f.depth < -CANCEL_M) return this.endPoke(side, a, 'pushed on through it');
      if (f.depth < RELEASE_M) return;
      a.poke = undefined;
      a.cooldown = PRESS_COOLDOWN_S;
      console.info(`[hand-menu] ${side} fingertip presses ${t.object.name || 'a card'}`);
      t.press();
      return;
    }
    if (f.near && f.depth >= READY_M) {
      // In front of it: ready, from here.
      if (!a.poke) a.poke = { obj: t.object, down: false, at: this.now, tip: new Vector3(), way: new Vector3() };
      a.poke.at = this.now;
      a.poke.tip.copy(tip);
      a.poke.way.copy(f.normal);
      return;
    }
    if (f.depth > -POKE_M) return;
    // In it: a poke, if it came from in front of it just now, moving itself, over the card.
    const ready = a.poke;
    a.poke = undefined;
    if (!ready || !f.over || this.now - ready.at > READY_S || a.cooldown > 0) return;
    if (tip.distanceTo(ready.tip) < READY_M + POKE_M - 0.004) return;
    if (this.now - (this.upSince.get(t.object) ?? -Infinity) < NEW_WAIT_S) return;
    a.poke = ready;
    ready.down = true;
    console.info(`[hand-menu] ${side} fingertip pokes into ${t.object.name || 'a card'} (pressed on the way out)`);
  }

  /** Lets go of a poke; one that was down is cancelled, and says why. */
  private endPoke(side: Side, a: Aim, why: string): void {
    if (a.poke?.down) console.info(`[hand-menu] ${side} poke of ${a.poke.obj.name || 'a card'} cancelled: ${why}`);
    a.poke = undefined;
  }

  /**
   * How far the fingertip is in front of a card's face (metres, less than zero behind it), whether it
   * is over the card, and the point under it on the face with the face's way out. A card looks out
   * along the + side of its thinnest side (a plane's +Z); a balloon, weight, gate or plank all round,
   * and the fingertip must come out of one on the side it went in by (`way`).
   */
  private faceOf(t: MenuTarget, tip: Vector3, way: Vector3 | undefined): { depth: number; over: boolean; near: boolean; at: Vector3; normal: Vector3 } {
    const f = this.face;
    if (t.distance) {
      f.depth = t.distance(tip);
      f.over = true;
      f.near = true;
      if (t.aimAt) {
        t.aimAt(f.at);
        f.normal.copy(tip).sub(f.at);
        const n = f.normal.length();
        if (n > 1e-6) f.normal.divideScalar(n);
        else f.normal.set(0, 0, 1);
        f.at.addScaledVector(f.normal, t.aimR ?? 0);
        // Out of it again: on the side it came in by, or through the far side (which is no press).
        if (way && f.depth >= 0 && f.normal.dot(way) < 0.3) f.over = false;
      } else {
        f.at.copy(tip);
        f.normal.set(0, 0, 1);
      }
      return f;
    }
    const obj = t.object;
    const box = this.boxOf(obj);
    if (!box) {
      f.depth = Infinity;
      f.over = false;
      f.near = false;
      return f;
    }
    this.local.copy(tip);
    obj.worldToLocal(this.local);
    obj.getWorldScale(this.scale);
    let thin = obj.userData.touchThin as number | undefined;
    if (thin === undefined) {
      box.getSize(this.axis);
      thin = this.axis.x <= this.axis.y && this.axis.x <= this.axis.z ? 0 : this.axis.y <= this.axis.z ? 1 : 2;
      obj.userData.touchThin = thin;
    }
    const l = [this.local.x, this.local.y, this.local.z];
    const lo = [box.min.x, box.min.y, box.min.z];
    const hi = [box.max.x, box.max.y, box.max.z];
    const k = [Math.abs(this.scale.x), Math.abs(this.scale.y), Math.abs(this.scale.z)];
    f.depth = (l[thin] - hi[thin]) * k[thin];
    f.over = true;
    f.near = true;
    for (let i = 0; i < 3; i += 1) {
      if (i === thin) continue;
      const m = (way ? DOWN_EDGE_M : EDGE_M) / Math.max(k[i], 1e-6);
      if (l[i] < lo[i] - m || l[i] > hi[i] + m) f.over = false;
      const r = READY_EDGE_M / Math.max(k[i], 1e-6);
      if (l[i] < lo[i] - r || l[i] > hi[i] + r) f.near = false;
      l[i] = Math.min(Math.max(l[i], lo[i]), hi[i]);
    }
    l[thin] = hi[thin];
    f.at.set(l[0], l[1], l[2]);
    obj.localToWorld(f.at);
    f.normal.set(thin === 0 ? 1 : 0, thin === 1 ? 1 : 0, thin === 2 ? 1 : 0).applyQuaternion(obj.getWorldQuaternion(this.quat));
    return f;
  }

  /** The ring under the fingertip: white near, yellow ready, green while down in the card. */
  private showRing(a: Aim, f: { depth: number; over: boolean; near: boolean; at: Vector3; normal: Vector3 }): void {
    if (!f.near || f.depth > NEAR_M) return;
    const down = !!a.poke?.down;
    const ready = !!a.poke && !down;
    a.ring.visible = true;
    a.ring.position.copy(f.at).addScaledVector(f.normal, 0.001);
    this.axis.copy(a.ring.position).add(f.normal);
    a.ring.lookAt(this.axis);
    const k = Math.min(1, Math.max(0, f.depth / NEAR_M));
    a.ring.scale.setScalar(down ? 0.8 : 1 + 1.6 * k);
    (a.ring.material as MeshBasicMaterial).color.setHex(down ? 0x2f9d4a : ready ? HOVER_COLOR : 0xffffff);
  }

  /** The small thing a ray passes nearest, if near enough (see ASSIST_M); `point` goes onto it. */
  private assist(targets: MenuTarget[], point: Vector3, was: MenuTarget | undefined): MenuTarget | undefined {
    let best: MenuTarget | undefined;
    let bestD = ASSIST_M;
    const far = reachNow ?? REACH_M;
    for (const t of targets) {
      if (!t.aimAt || !t.object.visible) continue;
      // The one the dot is on already is held to a wider reach.
      const reach = was && was.object === t.object ? STICK_M : ASSIST_M;
      t.aimAt(this.local);
      this.end.copy(this.local).sub(this.origin);
      const along = this.end.dot(this.rdir);
      if (along <= 0 || along > far) continue;
      const off = this.end.addScaledVector(this.rdir, -along).length() - (t.aimR ?? 0) - (reach - ASSIST_M);
      if (off < bestD) {
        bestD = off;
        best = t;
        this.best.copy(this.local);
      }
    }
    if (best) point.copy(this.best);
    return best;
  }

  /** Keeps where the dot is now (its card and ray), and sets what a pinch now would take. */
  private remember(a: Aim): void {
    a.head = (a.head + 1) % HISTORY_N;
    const p = a.past[a.head];
    p.t = this.now;
    p.target = a.up && !a.dim ? a.target : undefined;
    p.origin.copy(a.origin);
    p.dir.copy(a.aimDir);
    // What the dot was on PINCH_LOOKBACK_S ago (before the fingers moved it), or if it was on
    // nothing then, the last card it was on since HISTORY_S ago.
    let back: Past | undefined;
    let any: Past | undefined;
    for (let i = 0; i < HISTORY_N; i += 1) {
      const q = a.past[(a.head - i + HISTORY_N) % HISTORY_N];
      if (this.now - q.t > HISTORY_S) break;
      if (!any && q.target) any = q;
      if (!back && this.now - q.t >= PINCH_LOOKBACK_S) back = q;
      if (back && any) break;
    }
    const take = back?.target ? back : any ?? back ?? p;
    a.lastTarget = take.target ? this.map.get(take.target.object) : undefined;
    a.lockO.copy(take.origin);
    a.lockD.copy(take.dir);
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
    // The headset's own pinch only, as its browser reads it: thumb and index read from the joints
    // closed by themselves on a relaxed or curling hand on a real Quest, and pressed what the ray was on.
    const pinched = this.host.select(side);
    if (!pinched || a.near || resting[side] || !h.tracked || a.cooldown > 0 || this.host.holding(side)) return;
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
      a.ring.visible = false;
      a.poke = undefined;
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
      a.ring.removeFromParent();
      (a.ring.material as MeshBasicMaterial).dispose();
      (a.ray.material as MeshBasicMaterial).dispose();
      (a.dot.material as MeshBasicMaterial).dispose();
    }
  }
}
