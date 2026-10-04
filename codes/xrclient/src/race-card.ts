import { Box3, CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from '@iwsdk/core';

import type { Species } from './assets.js';
import { drawGlyphs, glyphWidth, whenGlyphsLoad } from './art/glyphs.js';
import { drawCard } from './art/label.js';
import { makeFoldling } from './art/models.js';
import type { GameKind } from './game/core.js';
import { T } from './text.js';

/**
 * The race card standing on the right of the book: the player's place and
 * points on top, then one row per round (three waves and the boss) saying
 * which are done, which is on, and which are still to come. Every animal the
 * player meets in a round stands on its row as a small paper stamp, in its
 * colour when folded and plain white when it got away. The round that is on
 * gently pulses and carries the clock.
 */

const PX_PER_M = 1400;
const CARD_W = 0.25;
const PAD = 0.012;
const HEAD_H = 0.036;
const ROW_H = 0.054;
/** Text heights: the row's name, the game under it, and the player's line. */
const NAME_H = 0.013;
const GAME_H = 0.0095;
const HEAD_TEXT_H = 0.016;
/** Stamps: their height, gap, and the room kept at the row's end for "+N". */
const STAMP_H = 0.0195;
const STAMP_GAP = 0.004;
/** Room kept after the last stamp for "+N". */
const MORE_W = 0.024;
/** The pulse of the round that is on: size and period, like the question card. */
const PULSE = 0.05;
const PULSE_S = 1.1;
/** Shadow room around the card, as in the paper labels. */
const ROOM = 0.2;

const INK = '#3a3f4b';
/** Rounds still to come are drawn faint. */
const LATER_ALPHA = 0.42;
const CREAM = '#fff8ec';
const DONE = '#2f7d32';
const LATE = '#c62828';
/** Round colours: balloons coral, crystals cobalt, the boss its own violet. */
const GAME_COLOR: Record<GameKind, string> = { balloon_burst: '#f2716b', orb_forge: '#3469c4' };
const BOSS_COLOR = '#6d597a';
/** Stone-grey paper for an animal that got away: white would vanish on the card. */
const MISSED_PAPER = 0xb9b2a3;

export interface RoundPlan {
  game: GameKind;
  seconds: number;
  boss: boolean;
}

type Status = 'done' | 'on' | 'next' | 'later';

/** One row of the card as plain data, for a race checkpoint. */
export interface RowSnapshot {
  status: Status;
  gained?: number;
  stamps: { species: Species; color: number; folded: boolean }[];
}

interface Row {
  plan: RoundPlan;
  status: Status;
  /** Points the player made in the round, once it is done. */
  gained?: number;
  stamps: { species: Species; color: number; folded: boolean; obj: Group; width: number; lift: number }[];
  /** Where "+N" goes (card-local x of the last shown stamp's right edge), and N. */
  moreX: number;
  hidden: number;
}

const px = (m: number) => Math.round(m * PX_PER_M);

function canvasMesh(): { canvas: HTMLCanvasElement; texture: CanvasTexture; mesh: Mesh } {
  const canvas = document.createElement('canvas');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide, depthWrite: false }),
  );
  mesh.renderOrder = 10;
  return { canvas, texture, mesh };
}

export class RaceCard {
  readonly root = new Group();
  private rows: Row[] = [];
  private base = canvasMesh();
  /** The round that is on, drawn again on its own so it can pulse. */
  private live = canvasMesh();
  private head = { place: 1, points: 0 };
  private clockText = '';
  private clockLate = false;
  private t = 0;

  /** `me`: the player's name on the card's top line (YOU, or a Class Match's made-up name). */
  constructor(
    plan: RoundPlan[],
    private me?: string,
  ) {
    this.root.name = 'race-card';
    this.rows = plan.map((p) => ({ plan: p, status: 'later', stamps: [], moreX: 0, hidden: 0 }));
    if (this.rows[0]) this.rows[0].status = 'next';
    this.base.mesh.name = 'race-card-paper';
    this.live.mesh.name = 'race-card-live';
    this.live.mesh.position.z = 0.002;
    // Always after the paper: with the same order the two were sorted by distance,
    // and on the tilted card a lower row's band (its clock) fell behind the paper.
    this.live.mesh.renderOrder = 11;
    this.live.mesh.visible = false;
    this.root.add(this.base.mesh, this.live.mesh);
    this.draw();
    whenGlyphsLoad(() => this.draw());
  }

  private get height(): number {
    return HEAD_H + this.rows.length * ROW_H + PAD;
  }

  /** The paper's width and height in the card's own units, centred on its origin. */
  get size(): { w: number; h: number } {
    return { w: CARD_W, h: this.height };
  }

  /** Card-local centre of row `i` (the card's origin is its centre). */
  private rowCentreY(i: number): number {
    return this.height / 2 - HEAD_H - (i + 0.5) * ROW_H;
  }

  /** The round with this index is on; the ones before it are done. */
  roundOn(index: number): void {
    this.rows.forEach((r, i) => {
      if (i < index && r.status !== 'done') r.status = 'done';
      if (i === index) r.status = 'on';
      if (i > index) r.status = 'later';
    });
    this.draw();
  }

  /** The round's clock ran out: it is done with `gained` points, and the next one is up next. */
  roundDone(index: number, gained: number): void {
    const r = this.rows[index];
    if (!r) return;
    r.status = 'done';
    r.gained = gained;
    if (this.rows[index + 1]) this.rows[index + 1].status = 'next';
    this.clockText = '';
    this.draw();
  }

  /** The rows as plain data (status, points, stamps), to keep with a race checkpoint. */
  snapshot(): RowSnapshot[] {
    return this.rows.map((r) => ({
      status: r.status,
      gained: r.gained,
      stamps: r.stamps.map(({ species, color, folded }) => ({ species, color, folded })),
    }));
  }

  /** Puts the rows back as `snapshot` left them, stamps included. */
  restore(rows: RowSnapshot[]): void {
    rows.forEach((saved, i) => {
      const r = this.rows[i];
      if (!r) return;
      r.status = saved.status;
      r.gained = saved.gained;
      for (const s of saved.stamps) this.stamp(i, s.species, s.color, s.folded);
    });
    this.draw();
  }

  /** The player's place and points, on the card's top line. */
  player(place: number, points: number): void {
    if (place === this.head.place && points === this.head.points) return;
    this.head = { place, points };
    this.draw();
  }

  /** The clock of the round that is on, or null between rounds. */
  clock(text: string | null, late: boolean): void {
    const t = text ?? '';
    if (t === this.clockText && late === this.clockLate) return;
    this.clockText = t;
    this.clockLate = late;
    this.drawLive();
  }

  /**
   * Where the next stamp of round `index` will stand, in the card's parent's
   * space, so a folded animal can fly straight to it.
   */
  stampTarget(index: number, out: Vector3): Vector3 {
    const r = this.rows[index];
    // Right after the last stamp; on a full row the row slides along, so the end of the row.
    const end = r && r.stamps.length > 0 ? r.moreX + STAMP_GAP : this.stampsLeft(index);
    const x = Math.min(end + STAMP_H * 0.5, this.stampsRight() - STAMP_H * 0.5);
    out.set(x, this.stampBase(index) + STAMP_H * 0.5, 0.012);
    this.root.updateMatrix();
    return out.applyMatrix4(this.root.matrix);
  }

  /** Where row `index`'s stamps begin: after the game's name, which is longer in some languages. */
  private stampsLeft(index: number): number {
    const r = this.rows[index];
    const gameW = r ? glyphWidth(this.gameText(r), px(GAME_H)) / PX_PER_M : 0.05;
    return -CARD_W / 2 + PAD + 0.024 + gameW + 0.01;
  }

  /** Card-local height of the line row `index`'s stamps stand on, inside its block. */
  private stampBase(index: number): number {
    return this.rowCentreY(index) - ROW_H * 0.5 + 0.0115;
  }

  /** The furthest a stamp may reach, leaving room for "+N" inside the card. */
  private stampsRight(): number {
    return CARD_W / 2 - PAD - MORE_W;
  }

  /** An animal of round `index` is settled: in its colour when folded, white when it got away. */
  stamp(index: number, species: Species, color: number, folded: boolean): void {
    const r = this.rows[index];
    if (!r) return;
    const fig = makeFoldling(folded ? color : MISSED_PAPER, species);
    for (const c of fig.root.getObjectByName('flag_anchor')?.children ?? []) c.visible = false;
    const obj = fig.root;
    obj.name = `race-stamp-${index}-${r.stamps.length}`;
    // Every animal the same small height, standing on the row's lower line, facing out.
    obj.rotation.y = 0;
    obj.updateMatrixWorld(true);
    const box = new Box3().setFromObject(obj);
    const size = box.getSize(new Vector3());
    const k = STAMP_H / Math.max(size.y, 1e-4);
    obj.scale.multiplyScalar(k);
    // Drawn after the card and the pulsing band, so a stamp is never hidden behind them.
    obj.traverse((o) => {
      o.renderOrder = 12;
    });
    r.stamps.push({ species, color, folded, obj, width: size.x * k, lift: -box.min.y * k });
    this.root.add(obj);
    this.placeStamps(index);
    this.draw();
  }

  /**
   * Packs the newest stamps side by side by their own widths, like the line
   * behind the book, as many as fit; the rest count in "+N" right after them.
   */
  private placeStamps(index: number): void {
    const r = this.rows[index];
    const left = this.stampsLeft(index);
    const room = this.stampsRight() - left;
    let used = 0;
    let first = r.stamps.length;
    while (first > 0 && used + r.stamps[first - 1].width + (used > 0 ? STAMP_GAP : 0) <= room) {
      used += r.stamps[first - 1].width + (used > 0 ? STAMP_GAP : 0);
      first -= 1;
    }
    let x = left;
    r.stamps.forEach((s, n) => {
      s.obj.visible = n >= first;
      if (!s.obj.visible) return;
      s.obj.position.set(x + s.width / 2, this.stampBase(index) + s.lift, 0.012);
      x += s.width + STAMP_GAP;
    });
    r.moreX = x - STAMP_GAP;
    r.hidden = first;
  }

  private gameText(r: Row): string {
    return T.gameShort[r.plan.game];
  }

  private rowName(r: Row, i: number): string {
    return r.plan.boss ? T.bossRow : T.roundRow(i + 1);
  }

  private rowColor(r: Row): string {
    return r.plan.boss ? BOSS_COLOR : GAME_COLOR[r.plan.game];
  }

  private draw(): void {
    const { canvas, texture, mesh } = this.base;
    const w = px(CARD_W);
    const h = px(this.height);
    const m = Math.round(h * ROOM * 0.25);
    if (canvas.width !== w + 2 * m || canvas.height !== h + 2 * m) {
      canvas.width = w + 2 * m;
      canvas.height = h + 2 * m;
    }
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    c.translate(m, m);
    drawCard(c, w, h, m, CREAM, 'race-card');
    // The player's line: place and points.
    const you = T.youRow(this.head.place, this.head.points, this.me);
    const room = w - 2 * px(PAD);
    let headPx = px(HEAD_TEXT_H);
    const natural = glyphWidth(you, headPx);
    if (natural > room) headPx = Math.floor((headPx * room) / natural);
    drawGlyphs(c, you, px(PAD), px(HEAD_H / 2) - headPx / 2, headPx, INK);
    c.fillStyle = 'rgba(58, 63, 75, 0.12)';
    c.fillRect(px(PAD), px(HEAD_H) - 2, w - 2 * px(PAD), 2);
    this.rows.forEach((r, i) => this.drawRow(c, r, i, px(HEAD_H + i * ROW_H), false));
    c.restore();
    texture.needsUpdate = true;
    mesh.scale.set(canvas.width / PX_PER_M, canvas.height / PX_PER_M, 1);
    this.drawLive();
  }

  /** One row at `top` (canvas pixels): status mark, name, value, and the game's name under it. */
  private drawRow(c: CanvasRenderingContext2D, r: Row, i: number, top: number, live: boolean): void {
    const w = px(CARD_W);
    const rowH = px(ROW_H);
    const on = r.status === 'on';
    const color = this.rowColor(r);
    if (on) {
      // A band in the round's colour, the same plain paper cut as the card.
      c.fillStyle = color;
      c.fillRect(px(PAD * 0.5), top + 3, w - px(PAD), rowH - 6);
    }
    const ink = on ? CREAM : INK;
    c.save();
    if (r.status === 'later') c.globalAlpha = LATER_ALPHA;
    const nameH = px(NAME_H);
    const lineY = top + rowH * 0.3;
    // Status mark: a tick when done, a pointer when on, a ring still to come.
    const mx = px(PAD) + px(0.009);
    c.save();
    if (r.status === 'done') {
      c.strokeStyle = DONE;
      c.lineWidth = px(0.0028);
      c.beginPath();
      c.moveTo(mx - px(0.006), lineY);
      c.lineTo(mx - px(0.001), lineY + px(0.005));
      c.lineTo(mx + px(0.008), lineY - px(0.006));
      c.stroke();
    } else if (on) {
      c.fillStyle = CREAM;
      c.beginPath();
      c.moveTo(mx - px(0.005), lineY - px(0.007));
      c.lineTo(mx + px(0.007), lineY);
      c.lineTo(mx - px(0.005), lineY + px(0.007));
      c.closePath();
      c.fill();
    } else {
      c.strokeStyle = r.status === 'next' ? color : INK;
      c.lineWidth = px(0.002);
      c.beginPath();
      c.arc(mx, lineY, px(0.005), 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    const textX = px(PAD + 0.024);
    drawGlyphs(c, this.rowName(r, i), textX, lineY - nameH / 2, nameH, ink);
    // The value on the right: the clock while on, the points once done, NEXT between rounds.
    let value = '';
    let valueInk = ink;
    if (on && live) {
      value = this.clockText;
      valueInk = CREAM;
    } else if (r.status === 'done' && r.gained !== undefined) {
      value = `+${r.gained}`;
      valueInk = DONE;
    }
    if (value) {
      const vw = glyphWidth(value, nameH);
      drawGlyphs(c, value, w - px(PAD) - vw, lineY - nameH / 2, nameH, valueInk);
      if (on && live && this.clockLate) {
        // The last ten seconds: a red underline under the clock.
        c.fillStyle = LATE;
        c.fillRect(w - px(PAD) - vw, lineY + nameH / 2 + 2, vw, px(0.0022));
      }
    }
    const gameH = px(GAME_H);
    drawGlyphs(c, this.gameText(r), textX, top + rowH * 0.72 - gameH / 2, gameH, on ? CREAM : INK);
    if (r.hidden > 0) {
      // Right behind the last stamp shown.
      const t = `+${r.hidden}`;
      const x = px(r.moreX + CARD_W / 2) + px(STAMP_GAP);
      drawGlyphs(c, t, x, top + rowH * 0.72 - gameH / 2, gameH, on ? CREAM : INK);
    }
    if (r.status === 'next') {
      // Between rounds the coming one says so on its second line, where its stamps will stand.
      const next = T.nextRound;
      drawGlyphs(c, next, w - px(PAD) - glyphWidth(next, gameH), top + rowH * 0.72 - gameH / 2, gameH, color);
    }
    c.restore();
  }

  /** The pulsing copy of the round that is on, with its clock. */
  private drawLive(): void {
    const i = this.rows.findIndex((r) => r.status === 'on');
    const { canvas, texture, mesh } = this.live;
    if (i < 0) {
      mesh.visible = false;
      return;
    }
    const w = px(CARD_W);
    const h = px(ROW_H);
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext('2d')!;
    c.clearRect(0, 0, w, h);
    this.drawRow(c, this.rows[i], i, 0, true);
    texture.needsUpdate = true;
    mesh.scale.set(CARD_W, ROW_H, 1);
    mesh.position.y = this.rowCentreY(i);
    mesh.visible = true;
  }

  update(delta: number): void {
    const mesh = this.live.mesh;
    if (!mesh.visible) return;
    this.t += delta;
    const k = 1 + PULSE * (0.5 - 0.5 * Math.cos((this.t / PULSE_S) * Math.PI * 2));
    mesh.scale.set(CARD_W * k, ROW_H * k, 1);
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of [this.base, this.live]) {
      m.texture.dispose();
      (m.mesh.material as MeshBasicMaterial).dispose();
      m.mesh.geometry.dispose();
    }
  }
}
