import { Entity, Group, Object3D, Vector3 } from '@iwsdk/core';

import { Label } from './art/label.js';
import { makeBadge, makeBot, makePortal, makeStar, type Figure } from './art/models.js';
import { placeUiImage, uiImage, UI_HEIGHT, type UiName } from './art/ui2d.js';
import type { Emote, Highlight, RaceState, Recap } from './game/core.js';
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
/** Results rows: text height and spacing, larger than the live scoreboard's. */
const RECAP_TEXT = 0.036;
const RECAP_ROW = 0.052;
/** Each highlight's paper ribbon in the results, its size, and its width over height. */
const RIBBON: Record<Highlight, UiName> = {
  best_save: 'badge_label_best_comeback',
  most_improved: 'badge_label_most_improved',
  sharpest_aim: 'badge_label_sharpest_aim',
  steady_streak: 'badge_label_steady_streak',
  brave_try: 'badge_label_brave_try',
};
const RIBBON_SCALE = 1.6;
const RIBBON_ASPECT: Record<string, number> = {
  badge_label_best_comeback: 5.286,
  badge_label_brave_try: 4.071,
  badge_label_most_improved: 5.161,
  badge_label_sharpest_aim: 4.821,
  badge_label_steady_streak: 5.214,
};
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
  frame: Object3D;
  /** Colour of the paper speech bubbles, matching the frame. */
  tone: 'cobalt' | 'teal';
  bot: Figure;
  status: Label;
  work: Label;
  flash: Label;
  /** A paper speech bubble, when one is up instead of the flash text. */
  flashImage?: Object3D;
  flashLeft: number;
}

/** What each robot emote says, as a paper speech bubble. */
const EMOTE_BUBBLE: Record<Emote, 'nice' | 'yay'> = { thumbs_up: 'nice', clap: 'yay' };

/**
 * Everything the race adds to the desk: two rival windows with their robots,
 * progress and points, the wave banner, and the results. Rules live in the
 * Rust core; this only draws what the core reports.
 */
export class RaceScene {
  private windows: RivalWindow[] = [];
  private banner?: Object3D;
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
      const nameplate = `race_name_${name.toLowerCase()}`;
      if (nameplate in UI_HEIGHT) {
        placeUiImage(nameplate as UiName, frame, [0, -0.08, 0.008], {
          scale: 1.15,
          fallback: () => stage.label(T.bot(name), 0.026, frame, -0.08, 0.008, false).mesh,
        });
      } else {
        stage.label(T.bot(name), 0.026, frame, -0.08, 0.008, false);
      }
      const status = stage.label(T.rival(0, 0), 0.024, frame, 0.08, 0.008, false);
      const work = stage.label(' ', 0.02, frame, 0.036, 0.008, false);
      const flash = stage.label(' ', 0.022, frame, 0.0, 0.03, false);
      flash.mesh.visible = false;
      work.mesh.visible = false;
      this.windows.push({ entity, frame, tone: i === 0 ? 'cobalt' : 'teal', bot, status, work, flash, flashLeft: 0 });
    });
    for (let i = 0; i < 3; i += 1) {
      this.board.push(stage.label(' ', 0.03, desk, BOARD_TOP - i * 0.036, BOARD_Z));
    }
  }

  /**
   * A banner over the scoreboard: the paper banners in `images`, stacked top
   * to bottom, or `text` on a card while they have not loaded.
   */
  showBanner(text: string, seconds = 2.5, images: UiName[] = []): void {
    this.clearBanner();
    const group = new Group();
    group.name = 'race-banner';
    group.position.set(0, BOARD_TOP + 0.12, BOARD_Z);
    const parts = images.map((name) => uiImage(name, 0.8));
    if (parts.length > 0 && parts.every((m) => m)) {
      let y = 0;
      for (const m of parts) {
        const h = (m!.geometry as unknown as { parameters: { height: number } }).parameters.height;
        m!.position.y = y - h / 2;
        y -= h * 0.85;
        group.add(m!);
      }
      group.position.y -= y / 2;
    } else {
      group.add(new Label(text, { height: 0.04 }).mesh);
    }
    this.desk.add(group);
    this.banner = group;
    this.bannerLeft = seconds;
  }

  private clearBanner(): void {
    this.banner?.removeFromParent();
    this.banner = undefined;
  }

  /** A short word over a robot's window, as a paper speech bubble when there is one. */
  flash(desk: number, text: string, bubble?: UiName): void {
    const w = this.windows[desk - 1];
    if (!w) return;
    w.flashImage?.removeFromParent();
    w.flashImage = undefined;
    const image = bubble ? uiImage(bubble) : null;
    if (image) {
      image.position.set(0, 0.0, 0.03);
      w.frame.add(image);
      w.flashImage = image;
      w.flash.mesh.visible = false;
    } else {
      w.flash.set(text);
      w.flash.mesh.visible = true;
    }
    w.flashLeft = FLASH_S;
  }

  emote(desk: number, emote: Emote): void {
    const w = this.windows[desk - 1];
    this.flash(desk, T.emote[emote], w && (`robot_${EMOTE_BUBBLE[emote]}_${w.tone}` as UiName));
    w?.bot.play(EMOTE_CLIP[emote], true);
  }

  working(desk: number, prompt: string): void {
    const w = this.windows[desk - 1];
    if (!w) return;
    w.work.set(prompt);
    w.work.mesh.visible = true;
  }

  answered(desk: number, correct: boolean): void {
    const w = this.windows[desk - 1];
    this.flash(desk, correct ? T.right : T.missed, correct && w ? (`robot_got_it_${w.tone}` as UiName) : undefined);
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
      if (this.bannerLeft <= 0) this.clearBanner();
    }
    for (const w of this.windows) {
      if (w.flashLeft > 0) {
        w.flashLeft -= delta;
        if (w.flashLeft <= 0) {
          w.flash.mesh.visible = false;
          w.flashImage?.removeFromParent();
          w.flashImage = undefined;
        }
      }
    }
  }

  /**
   * The results: the player's own stars on top, then one row per player in
   * finishing order with place, points, and their highlight badge.
   */
  showRecap(recap: Recap, playerName: string): void {
    // The results replace the live scoreboard, so the points show once, large.
    for (const l of this.board) l.mesh.visible = false;
    if (this.countdown) this.countdown.mesh.visible = false;
    for (const w of this.windows) w.status.mesh.visible = false;
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
    placeUiImage('recap_title', card, [0, 0.06, 0.004], {
      scale: 0.6,
      fallback: () => this.stage.label(T.recapTitle, 0.034, card, 0.06, 0.004, false).mesh,
    });
    const rows = [...recap.players].sort((a, b) => a.place - b.place);
    rows.forEach((p, i) => {
      const who = p.bot ? T.bot(p.name) : playerName;
      const y = 0.014 - i * RECAP_ROW;
      const row = this.stage.label(`${T.place(p.place)}  ${who}: ${p.points}`, RECAP_TEXT, card, y, 0.004, false);
      if (!p.highlight) return;
      // The highlight is a paper ribbon to the right of the row and its
      // badge to the left; the row shifts so the three stay centred.
      const ribbon = RIBBON[p.highlight];
      const ribbonW = UI_HEIGHT[ribbon] * RIBBON_SCALE * RIBBON_ASPECT[ribbon];
      const rowW = row.mesh.scale.x;
      row.mesh.position.x = -ribbonW / 2 - 0.004;
      placeUiImage(ribbon, card, [rowW / 2 + 0.008, y, 0.005], {
        scale: RIBBON_SCALE,
        fallback: () =>
          this.stage.label(T.highlight[p.highlight!], RECAP_TEXT * 0.8, card, y, 0.005, false).mesh,
      });
      const badge = makeBadge(p.highlight);
      if (badge) {
        badge.position.set(-ribbonW / 2 - rowW / 2 - 0.028, y + 0.008, 0.004);
        badge.scale.setScalar(0.75);
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
    this.clearBanner();
    this.countdown?.mesh.removeFromParent();
    this.countdown = undefined;
  }
}
