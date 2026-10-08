import { Matrix4, Vector3, type Object3D } from '@iwsdk/core';

/**
 * The tracked hands' fingertips for Measure Hunt, read from IWSDK's hand
 * adapters: each adapter fills its joints' poses every frame relative to
 * the hand's grip space, so the grip's world matrix carries them into the
 * scene. A controller has no joints; it is read from its ray instead (see
 * MeasureDesk).
 */

export type Side = 'left' | 'right';

interface HandAdapter {
  jointSpaces: { jointName: string }[];
  jointTransforms?: Float32Array;
  gripSpace?: Object3D;
}

/** What `input.xr.visualAdapters.hand` holds, as far as this file reads it. */
export interface HandAdapters {
  left: HandAdapter;
  right: HandAdapter;
}

/** Thumb and index this close is a pinch; open again past PINCH_OPEN. */
const PINCH_CLOSE = 0.015;
const PINCH_OPEN = 0.03;
/** A pointing finger: the index tip this far from the wrist, the middle tip curled in. */
const POINT_REACH = 0.12;
const POINT_CURL = 0.65;
/** A fingertip moving less than this (m/s, smoothed) is still. */
const STILL_SPEED = 0.03;
const SMOOTH_S = 0.08;

export class Hand {
  readonly tip = new Vector3();
  readonly thumb = new Vector3();
  readonly wrist = new Vector3();
  readonly middle = new Vector3();
  /** The index finger's knuckle (its proximal joint), where the finger bends. */
  readonly knuckle = new Vector3();
  /** Halfway between thumb and index tip. */
  readonly pinchAt = new Vector3();
  /** The pinch point's smoothed velocity, m/s. */
  readonly velocity = new Vector3();
  tracked = false;
  pinching = false;
  pinchStart = false;
  pinchEnd = false;
  private readonly last = new Vector3();
  private readonly step = new Vector3();
  private readonly tipVel = new Vector3();
  private readonly lastTip = new Vector3();
  private had = false;

  /** The index finger out and the others curled in, as when pointing at a corner. */
  pointing(): boolean {
    const reach = this.tip.distanceTo(this.wrist);
    return this.tracked && !this.pinching && reach > POINT_REACH && this.middle.distanceTo(this.wrist) < POINT_CURL * reach;
  }

  /** The fingertip has hardly moved for a moment. */
  still(): boolean {
    return this.tipVel.length() < STILL_SPEED;
  }

  /** @internal */
  read(a: HandAdapter | undefined, delta: number): void {
    this.pinchStart = false;
    this.pinchEnd = false;
    const m = a?.jointTransforms;
    const grip = a?.gripSpace;
    if (!a || !m || !grip || a.jointSpaces.length === 0) {
      if (this.pinching) this.pinchEnd = true;
      this.tracked = false;
      this.pinching = false;
      this.had = false;
      return;
    }
    grip.updateWorldMatrix(true, false);
    const at = (name: string, out: Vector3) => {
      const i = a.jointSpaces.findIndex((j) => j.jointName === name);
      if (i < 0) return false;
      JOINT.fromArray(m, i * 16);
      out.setFromMatrixPosition(JOINT.premultiply(grip.matrixWorld));
      return true;
    };
    const ok = at('index-finger-tip', this.tip) && at('thumb-tip', this.thumb) && at('wrist', this.wrist) && at('middle-finger-tip', this.middle) && at('index-finger-phalanx-proximal', this.knuckle);
    if (!ok) {
      this.tracked = false;
      return;
    }
    this.tracked = true;
    this.pinchAt.copy(this.tip).add(this.thumb).multiplyScalar(0.5);
    const gap = this.tip.distanceTo(this.thumb);
    const was = this.pinching;
    this.pinching = was ? gap < PINCH_OPEN : gap < PINCH_CLOSE;
    this.pinchStart = !was && this.pinching;
    this.pinchEnd = was && !this.pinching;
    const keep = Math.exp(-Math.max(delta, 1e-3) / SMOOTH_S);
    if (this.had && delta > 0) {
      this.step.copy(this.pinchAt).sub(this.last).divideScalar(delta);
      this.velocity.multiplyScalar(keep).addScaledVector(this.step, 1 - keep);
      this.step.copy(this.tip).sub(this.lastTip).divideScalar(delta);
      this.tipVel.multiplyScalar(keep).addScaledVector(this.step, 1 - keep);
    } else {
      this.velocity.set(0, 0, 0);
      this.tipVel.set(0, 0, 0);
    }
    this.last.copy(this.pinchAt);
    this.lastTip.copy(this.tip);
    this.had = true;
  }
}

const JOINT = new Matrix4();

/** Both hands, read once a frame. */
export class Hands {
  readonly left = new Hand();
  readonly right = new Hand();

  constructor(private readonly adapters: () => HandAdapters | undefined) {}

  update(delta: number): void {
    const a = this.adapters();
    this.left.read(a?.left, delta);
    this.right.read(a?.right, delta);
  }

  get(side: Side): Hand {
    return side === 'left' ? this.left : this.right;
  }

  any(): boolean {
    return this.left.tracked || this.right.tracked;
  }
}
