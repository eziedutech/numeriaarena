import { Entity, Group, Object3D, Vector3 } from '@iwsdk/core';

import { Label } from './art/label.js';
import { makeBadge, makeBot, makePortal, makeStar, type Figure } from './art/models.js';
import type { Emote, RaceState, Recap } from './game/core.js';
import { T } from './text.js';

/**
 * Rival windows sit left and right, outside the balloon lanes as the seated
 * player sees them, so the answers keep the middle of the view.
 */
const WINDOW_POS = [new Vector3(-0.4, 0.2, 0.08), new Vector3(0.4, 0.2, 0.08)];
/** Windows turn to face the seated player. */
const WINDOW_YAW = [0.75, -0.75];
/** Frame colours match the robots: cobalt (a) and teal (b). */
const BOT_COLORS = [0x3469c4, 0x3fb6a0];
const EMOTE_CLIP: Record<Emote, string> = { thumbs_up: 'cheer', clap: 'wave' };
/** Scoreboard rows above the back of the book, clear of the question card. */
const BOARD_TOP = 0.46;
const BOARD_Z = -0.15;
/** The countdown turns red for the last this many ms of a round. */
const CLOCK_WARN_MS = 10000;
/** The countdown sits this far left of the scoreboard's centre. */
const CLOCK_X = -0.2;
const CLOCK_INK = 0x1f4fa3;
const CLOCK_LATE_INK = 0xc62828;
/** A flash label stays up this long (seconds). */
const FLASH_S = 1.6;

/** What the game system lends to this view: entity creation, labels, tweens. */
export interface Stage {
  add(obj: Object3D): Entity;
  remove(e: Entity): void;
  label(text: string, height: number, parent: Object3D, y: number, z?: number, billboard?: boolean): Label;
  tween(obj: Object3D, to: Vector3, dur: number, arc: number, scaleTo: number, done?: () => void): void;
}

interface RivalWindow {
  entity: Entity;
  bot: Figure;
  status: Label;
  work: Label;
  flash: Label;
  flashLeft: number;
}

/**
 * Everything the race adds to the desk: two rival windows with their robots,
 * progress and points, the wave banner, and the results. Rules live in the
 * Rust core; this only draws what the core reports.
 */
export class RaceScene {
  private windows: RivalWindow[] = [];
  private banner?: Label;
  private bannerLeft = 0;
  private recapItems: Entity[] = [];
  /** One row per participant above the book, in place order. */
  private board: Label[] = [];
  private countdown?: Label;
  private countdownLate = false;
  /** Where the viewer's eye is, for turning the countdown to face it. */
  readonly eye = new Vector3();

  constructor(
    private stage: Stage,
    private desk: Object3D,
    botNames: [string, string],
  ) {
    botNames.forEach((name, i) => {
      const frame = makePortal(BOT_COLORS[i]);
      frame.name = `rival-window-${i + 1}`;
      frame.position.copy(WINDOW_POS[i]);
      frame.rotation.y = WINDOW_YAW[i];
      const entity = stage.add(frame);
      const bot = makeBot(i === 0 ? 0 : 1, BOT_COLORS[i]);
      // The robot stands in the lower half of the dark opening.
      bot.root.position.set(0, -0.048, 0.003);
      bot.root.scale.setScalar(0.95);
      frame.add(bot.root);
      stage.label(T.bot(name), 0.026, frame, -0.08, 0.008, false);
      const status = stage.label(T.rival(0, 0), 0.024, frame, 0.08, 0.008, false);
      const work = stage.label(' ', 0.02, frame, 0.036, 0.008, false);
      const flash = stage.label(' ', 0.022, frame, 0.0, 0.03, false);
      flash.mesh.visible = false;
      work.mesh.visible = false;
      this.windows.push({ entity, bot, status, work, flash, flashLeft: 0 });
    });
    for (let i = 0; i < 3; i += 1) {
      this.board.push(stage.label(' ', 0.03, desk, BOARD_TOP - i * 0.036, BOARD_Z));
    }
  }

  showBanner(text: string, seconds = 2.5): void {
    if (!this.banner) {
      this.banner = new Label(text, { height: 0.04 });
      this.banner.mesh.name = 'race-banner';
      this.banner.mesh.position.set(0, BOARD_TOP + 0.12, BOARD_Z);
      this.desk.add(this.banner.mesh);
    }
    this.banner.set(text);
    this.banner.mesh.visible = true;
    this.bannerLeft = seconds;
  }

  flash(desk: number, text: string): void {
    const w = this.windows[desk - 1];
    if (!w) return;
    w.flash.set(text);
    w.flash.mesh.visible = true;
    w.flashLeft = FLASH_S;
  }

  emote(desk: number, emote: Emote): void {
    this.flash(desk, T.emote[emote]);
    this.windows[desk - 1]?.bot.play(EMOTE_CLIP[emote], true);
  }

  working(desk: number, prompt: string): void {
    const w = this.windows[desk - 1];
    if (!w) return;
    w.work.set(prompt);
    w.work.mesh.visible = true;
  }

  answered(desk: number, correct: boolean): void {
    this.flash(desk, correct ? T.right : T.missed);
    if (correct) this.windows[desk - 1].work.mesh.visible = false;
  }

  /** Time is up: the rivals' questions leave their windows. */
  timeUp(): void {
    for (const w of this.windows) w.work.mesh.visible = false;
  }

  /**
   * The round's countdown above the scoreboard, turning red for the last ten
   * seconds. Hidden between rounds.
   */
  clock(msLeft: number | null): void {
    if (msLeft === null) {
      if (this.countdown) this.countdown.mesh.visible = false;
      return;
    }
    const late = msLeft <= CLOCK_WARN_MS;
    if (!this.countdown || this.countdownLate !== late) {
      this.countdown?.mesh.removeFromParent();
      this.countdown = new Label(T.clock(msLeft), { height: 0.05, ink: late ? CLOCK_LATE_INK : CLOCK_INK });
      this.countdown.mesh.name = 'race-countdown';
      // Left of the scoreboard, at its middle row: inside the seated view.
      this.countdown.mesh.position.set(CLOCK_X, BOARD_TOP - 0.036, BOARD_Z);
      this.desk.add(this.countdown.mesh);
      this.countdownLate = late;
    }
    this.countdown.set(T.clock(msLeft));
    this.countdown.mesh.visible = true;
    this.countdown.mesh.lookAt(this.eye);
  }

  /** The scoreboard for everyone, and progress and points above each rival's window. */
  show(state: RaceState): void {
    this.windows.forEach((w, i) => {
      const d = state.desks[i + 1];
      if (d) w.status.set(T.rival(d.folded, d.points));
    });
    const rows = state.desks
      .map((d, i) => ({ d, i }))
      .sort((a, b) => a.d.place - b.d.place || a.i - b.i);
    rows.forEach(({ d }, r) => {
      const who = d.bot ? T.bot(d.name) : T.you;
      this.board[r]?.set(`${T.place(d.place)}  ${who}: ${d.points}`);
    });
  }

  update(delta: number): void {
    if (this.banner && this.bannerLeft > 0) {
      this.bannerLeft -= delta;
      if (this.bannerLeft <= 0) this.banner.mesh.visible = false;
    }
    for (const w of this.windows) {
      if (w.flashLeft > 0) {
        w.flashLeft -= delta;
        if (w.flashLeft <= 0) w.flash.mesh.visible = false;
      }
    }
  }

  /**
   * The results: the player's own stars on top, then one row per player in
   * finishing order with place, points, and their highlight badge.
   */
  showRecap(recap: Recap, playerName: string): void {
    const card = new Group();
    card.name = 'race-recap';
    card.position.set(0, 0.2, 0.02);
    const e = this.stage.add(card);
    this.recapItems.push(e);
    const own = recap.players.find((p) => !p.bot);
    for (let i = 0; i < 3; i += 1) {
      const star = makeStar(i < (own?.stars ?? 0));
      star.position.set((i - 1) * 0.07, 0.11, 0);
      star.scale.setScalar(1.2);
      card.add(star);
    }
    this.stage.label(T.recapTitle, 0.034, card, 0.06, 0.004, false);
    const rows = [...recap.players].sort((a, b) => a.place - b.place);
    rows.forEach((p, i) => {
      const who = p.bot ? T.bot(p.name) : playerName;
      const what = p.highlight ? `, ${T.highlight[p.highlight]}` : '';
      const y = 0.018 - i * 0.04;
      const row = this.stage.label(`${T.place(p.place)}  ${who}: ${p.points}${what}`, 0.026, card, y, 0.004, false);
      const badge = p.highlight ? makeBadge(p.highlight) : null;
      if (badge) {
        badge.position.set(-row.mesh.scale.x / 2 - 0.02, y + 0.006, 0.004);
        badge.scale.setScalar(0.55);
        card.add(badge);
      }
    });
  }

  /** Removes every object this view created. */
  dispose(): void {
    for (const w of this.windows) this.stage.remove(w.entity);
    this.windows = [];
    for (const l of this.board) l.mesh.removeFromParent();
    this.board = [];
    for (const e of this.recapItems) this.stage.remove(e);
    this.recapItems = [];
    if (this.banner) {
      this.banner.mesh.removeFromParent();
      this.banner = undefined;
    }
    this.countdown?.mesh.removeFromParent();
    this.countdown = undefined;
  }
}
