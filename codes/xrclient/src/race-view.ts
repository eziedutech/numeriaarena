import { Entity, Group, Object3D, Vector3 } from '@iwsdk/core';

import type { Species } from './assets.js';
import { Label } from './art/label.js';
import { makeBadge, makeBot, makePortal, makeStar, type Figure } from './art/models.js';
import { placeUiImage, uiImage, UI_HEIGHT, type UiName } from './art/ui2d.js';
import type { Emote, Highlight, RaceState, Recap } from './game/core.js';
import { RaceCard, type RowSnapshot } from './race-card.js';
import { T } from './text.js';

/**
 * Rivals stack on the left and the race card stands on the right, both
 * outside the balloon lanes as the seated player sees them, so the answers
 * keep the middle of the view. A race with more players adds rows to the
 * left column the same way.
 */
const WINDOW_POS = [new Vector3(-0.375, 0.25, 0.07), new Vector3(-0.375, 0.085, 0.11)];
/** Windows turn to face the seated player. */
const WINDOW_YAW = [0.75, 0.75];
const WINDOW_SCALE = 0.78;
/** The race card on the right, turned to the player like the windows. */
const CARD_POS = new Vector3(0.395, 0.19, 0.08);
const CARD_YAW = -0.65;
const CARD_SCALE = 0.85;
/** Frame colours match the robots: cobalt (a) and teal (b). */
const BOT_COLORS = [0x3469c4, 0x3fb6a0];
const EMOTE_CLIP: Record<Emote, string> = { thumbs_up: 'cheer', clap: 'wave' };
/** Banners show above the back of the book, clear of the question card. */
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
/** The clock is marked red for the last this many ms of a round. */
const CLOCK_WARN_MS = 10000;
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
  /** The race card on the right, made once the core sends the plan of rounds. */
  private card?: RaceCard;
  private cardEntity?: Entity;
  /** Where the viewer's eye is. */
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
      frame.scale.setScalar(WINDOW_SCALE);
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
      const status = stage.label(T.rival(0, 0), 0.02, frame, 0.078, 0.008, false);
      const work = stage.label(' ', 0.02, frame, 0.036, 0.008, false);
      const flash = stage.label(' ', 0.022, frame, 0.0, 0.03, false);
      flash.mesh.visible = false;
      work.mesh.visible = false;
      this.windows.push({ entity, frame, tone: i === 0 ? 'cobalt' : 'teal', bot, status, work, flash, flashLeft: 0 });
    });
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

  /** The clock of the round that is on, in its row of the race card; null between rounds. */
  clock(msLeft: number | null): void {
    this.card?.clock(msLeft === null ? null : T.clock(msLeft), msLeft !== null && msLeft <= CLOCK_WARN_MS);
  }

  /**
   * Each rival's place, progress and points above its window, and the
   * player's own on the race card (made here from the core's plan of rounds).
   */
  show(state: RaceState): void {
    this.windows.forEach((w, i) => {
      const d = state.desks[i + 1];
      if (d) w.status.set(`${T.place(d.place)}  ${T.rival(d.folded, d.points)}`);
    });
    if (!this.card && state.plan?.length) {
      this.card = new RaceCard(state.plan);
      this.card.root.position.copy(CARD_POS);
      this.card.root.rotation.y = CARD_YAW;
      this.card.root.scale.setScalar(CARD_SCALE);
      this.cardEntity = this.stage.add(this.card.root);
    }
    const me = state.desks[0];
    if (me) this.card?.player(me.place, me.points);
  }

  /** The race card's rows, to keep with a race checkpoint. */
  cardSnapshot(): RowSnapshot[] {
    return this.card?.snapshot() ?? [];
  }

  /** Puts the race card's rows back after a checkpoint (the card must exist: call `show` first). */
  restoreCard(rows: RowSnapshot[]): void {
    this.card?.restore(rows);
  }

  /** Round `index` (0-based, the boss last) is on. */
  roundOn(index: number): void {
    this.card?.roundOn(index);
  }

  /** Round `index` is over; the player made `gained` points in it. */
  roundDone(index: number, gained: number): void {
    this.card?.roundDone(index, gained);
  }

  /** An animal of round `index` joins its row: coloured when folded, white when it got away. */
  stamp(index: number, species: Species, color: number, folded: boolean): void {
    this.card?.stamp(index, species, color, folded);
  }

  /** Where the next animal of round `index` stands on the card, in the desk's space; null without a card. */
  stampTarget(index: number): Vector3 | null {
    return this.card ? this.card.stampTarget(index, new Vector3()) : null;
  }

  update(delta: number): void {
    this.card?.update(delta);
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
    // The results show the points once, large; the race card stays as the
    // round-by-round summary beside them.
    for (const w of this.windows) w.status.mesh.visible = false;
    this.card?.clock(null, false);
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
    for (const e of this.recapItems) this.stage.remove(e);
    this.recapItems = [];
    this.clearBanner();
    if (this.cardEntity) this.stage.remove(this.cardEntity);
    this.card?.dispose();
    this.card = undefined;
    this.cardEntity = undefined;
  }
}
