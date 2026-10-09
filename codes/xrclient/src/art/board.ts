import {
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type Object3D,
} from '@iwsdk/core';
import { Label } from './label.js';
import { CLASS_BOARD, CLASS_FRONT_Z } from './rooms.js';

/**
 * Writing on the classroom's chalkboard for a game that has its words to
 * say: Measure Hunt sets the lines of its question here when a board is up
 * (the emulator's stand-in for the real room), in large chalk letters, and
 * keeps them on its desk panel when there is none (a real room has no board).
 * While the player holds the magnifier card on the desk (setBoardNear), the
 * writing, with its green backdrop, comes close to the eyes, and it goes back
 * when it is let go.
 */

/** A line of chalk: its words, its size as on the desk (metres) and its desk colour. */
export interface BoardLine {
  text: string;
  size: number;
  ink: string;
}

/** The desk's inks, as the colours of chalk. */
const CHALKS: Record<string, number> = {
  '#3469c4': 0xffe9a8,
  '#3a3f4b': 0xf4f1e6,
  '#c94f49': 0xffb3a8,
  '#2f7d32': 0xa8e6a1,
};
const CHALK = 0xf4f1e6;
/** A desk letter this tall (metres) is drawn this many times taller on the board, up to the highest. */
const SIZE_TO_BOARD = 8;
const HIGHEST = 0.2;
/** The writing keeps to this width and height of the board. */
const MAX_W = 3.0;
const MAX_H = 0.95;
const LINE_GAP = 1.12;
/** Short words are made no larger than this many times their size. */
const MOST = 1.8;
const PULSE = 0.03;
const PULSE_S = 1.1;
/** The backdrop of the writing, and its frame, in metres. */
const BACK_W = 3.2;
const BACK_H = 1.1;
const BACK = 0x2c4a41;
const FRAME = 0xa87a4f;
/** Held close, the board is this wide (metres), this far in front of the eyes. */
const NEAR_W = 1.35;
const NEAR_DIST = 0.85;
const NEAR_RATE = 9;
/** The board is held no lower than this far below level (sine of about 15 degrees). */
const NEAR_LOWEST = 0.26;

let lines: BoardLine[] | undefined;
let version = 0;
let up = false;
let held = false;

/** What the board says now (nothing clears it). */
export function setBoard(next: BoardLine[] | undefined): void {
  lines = next;
  version += 1;
}

/** Whether a board is up in the room round the player. */
export function boardUp(): boolean {
  return up;
}

/** The magnifier card is held: the board comes close. */
export function setBoardNear(on: boolean): void {
  held = on;
}

export class BoardWriter {
  /** The board, in the room's frame. */
  readonly group = new Group();
  /** The backdrop and the writing: what comes close. */
  private board = new Group();
  private text = new Group();
  private labels: Label[] = [];
  private seen = -1;
  private fit = 1;
  private near = 0;
  private back: Mesh;
  private frame: Mesh;
  private home = new Vector3(CLASS_BOARD.x, CLASS_BOARD.y + 0.02, CLASS_FRONT_Z + 0.07);
  private target = new Vector3();
  private local = new Vector3();
  private qTarget = new Quaternion();
  private qParent = new Quaternion();
  private m = new Matrix4();
  private up = new Vector3(0, 1, 0);
  private eye = new Vector3();
  private fwd = new Vector3();

  constructor() {
    this.group.name = 'measure-board';
    this.board.position.copy(this.home);
    this.group.add(this.board);
    // The frame behind the green, the green behind the chalk.
    this.frame = new Mesh(new PlaneGeometry(BACK_W + 0.1, BACK_H + 0.1), new MeshBasicMaterial({ color: FRAME, depthWrite: false }));
    this.frame.position.z = -0.004;
    this.frame.renderOrder = 4;
    this.back = new Mesh(new PlaneGeometry(BACK_W, BACK_H), new MeshBasicMaterial({ color: BACK, depthWrite: false }));
    this.back.position.z = -0.002;
    this.back.renderOrder = 5;
    this.text.position.z = 0.004;
    this.board.add(this.frame, this.back, this.text);
    up = true;
  }

  update(delta: number, camera: Object3D): void {
    if (this.seen !== version) {
      this.seen = version;
      this.write();
    }
    const k = 0.5 - 0.5 * Math.cos((performance.now() / 1000 / PULSE_S) * Math.PI * 2);
    this.text.scale.setScalar(this.fit * (1 + PULSE * k));
    // Held, the board comes close and faces the eyes; let go, it goes back.
    this.near += ((held ? 1 : 0) - this.near) * (1 - Math.exp(-NEAR_RATE * delta));
    if (this.near < 0.002) {
      this.near = 0;
      this.board.position.copy(this.home);
      this.board.quaternion.identity();
      this.board.scale.setScalar(1);
      return;
    }
    camera.getWorldPosition(this.eye);
    camera.getWorldDirection(this.fwd);
    // Where the eyes face, but no lower than a little under level: looking down at the desk, the board would
    // otherwise come down to the desk with them and lie out of reading.
    const flat = Math.hypot(this.fwd.x, this.fwd.z);
    if (flat > 1e-3 && this.fwd.y < -NEAR_LOWEST) {
      const down = NEAR_LOWEST;
      this.fwd.set((this.fwd.x / flat) * Math.sqrt(1 - down * down), -down, (this.fwd.z / flat) * Math.sqrt(1 - down * down));
    }
    this.target.copy(this.eye).addScaledVector(this.fwd, NEAR_DIST);
    this.group.updateWorldMatrix(true, false);
    this.local.copy(this.target).applyMatrix4(this.m.copy(this.group.matrixWorld).invert());
    // Facing the eyes: its +Z towards them, whichever way the room is turned.
    this.m.lookAt(this.eye, this.target, this.up);
    this.qTarget.setFromRotationMatrix(this.m);
    this.group.getWorldQuaternion(this.qParent).invert();
    this.qTarget.premultiply(this.qParent);
    this.board.position.lerpVectors(this.home, this.local, this.near);
    this.board.quaternion.identity().slerp(this.qTarget, this.near);
    this.board.scale.setScalar(1 + (NEAR_W / BACK_W - 1) * this.near);
  }

  private write(): void {
    this.clear();
    const rows: { text: string; h: number; ink: number }[] = [];
    for (const line of lines ?? []) {
      const h = Math.min(HIGHEST, line.size * SIZE_TO_BOARD);
      // A letter is about a third of its line's height wide: break the lines to fill the board's width.
      const per = Math.max(12, Math.floor(MAX_W / (h * 0.34)));
      for (const text of words(line.text, per)) rows.push({ text, h, ink: CHALKS[line.ink] ?? CHALK });
    }
    const total = rows.reduce((sum, r) => sum + r.h * LINE_GAP, 0);
    let y = total / 2;
    let widest = 0;
    for (const r of rows) {
      const label = new Label(r.text, { height: r.h, card: false, ink: r.ink });
      label.mesh.position.set(0, y - (r.h * LINE_GAP) / 2, 0);
      this.text.add(label.mesh);
      this.labels.push(label);
      widest = Math.max(widest, label.width);
      y -= r.h * LINE_GAP;
    }
    // Written as large as the board allows, in height and in width.
    this.fit = Math.min(MOST, total > 0 ? MAX_H / total : 1, widest > 0 ? MAX_W / widest : 1);
  }

  private clear(): void {
    for (const l of this.labels) {
      l.mesh.removeFromParent();
      const mat = l.mesh.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      l.mesh.geometry.dispose();
    }
    this.labels = [];
  }

  dispose(): void {
    this.clear();
    for (const m of [this.back, this.frame]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
    this.group.removeFromParent();
    held = false;
    up = false;
  }
}

/** The words broken into lines of at most `per` letters, at the spaces. */
function words(text: string, per: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    if (line && line.length + 1 + w.length > per) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) out.push(line);
  return out;
}
