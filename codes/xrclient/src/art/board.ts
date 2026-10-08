import { Group, type MeshBasicMaterial } from '@iwsdk/core';
import { Label } from './label.js';
import { CLASS_BOARD, CLASS_FRONT_Z } from './rooms.js';

/**
 * Writing on the classroom's chalkboard for a game that has its words to
 * say: Measure Hunt sets the lines of its question here when a board is up
 * (the emulator's stand-in for the real room), in large chalk letters, and
 * keeps them on its desk panel when there is none (a real room has no board).
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

let lines: BoardLine[] | undefined;
let version = 0;
let up = false;

/** What the board says now (nothing clears it). */
export function setBoard(next: BoardLine[] | undefined): void {
  lines = next;
  version += 1;
}

/** Whether a board is up in the room round the player. */
export function boardUp(): boolean {
  return up;
}

export class BoardWriter {
  readonly group = new Group();
  private labels: Label[] = [];
  private seen = -1;
  private fit = 1;

  constructor() {
    this.group.name = 'measure-board';
    // Just off the chalkboard, as the classroom's own chalk.
    this.group.position.set(CLASS_BOARD.x, CLASS_BOARD.y + 0.02, CLASS_FRONT_Z + 0.07);
    up = true;
  }

  update(): void {
    if (this.seen !== version) {
      this.seen = version;
      this.write();
    }
    const k = 0.5 - 0.5 * Math.cos((performance.now() / 1000 / PULSE_S) * Math.PI * 2);
    this.group.scale.setScalar(this.fit * (1 + PULSE * k));
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
      this.group.add(label.mesh);
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
    this.group.removeFromParent();
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
