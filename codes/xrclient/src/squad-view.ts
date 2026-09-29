import { Entity, Group, Object3D, Vector3 } from '@iwsdk/core';

import { Label } from './art/label.js';
import { makeBadge, makeBot, makeFoldling, makeOrb, makePortal, makeStar, makeTeamCrystal, type Figure } from './art/models.js';
import type { Emote, Recap, SquadState } from './game/core.js';
import { T } from './text.js';

/** Portal windows sit left and right in front of the player, inside a narrow field of view. */
const WINDOW_POS = [new Vector3(-0.3, 0.2, 0.02), new Vector3(0.3, 0.2, 0.02)];
/** Windows turn toward the player's side of the desk. */
const WINDOW_YAW = [0.45, -0.45];
/** Frame colours match the robots: cobalt (a) and teal (b). */
const BOT_COLORS = [0x3469c4, 0x3fb6a0];
const EMOTE_CLIP: Record<Emote, string> = { thumbs_up: 'cheer', clap: 'wave', help: 'help' };
/** On the table just past the book's right edge, clear of the balloon and crystal rows. */
const CRYSTAL_POS = new Vector3(0.22, 0.0, -0.06);
const BOSS_POS = new Vector3(0, 0.0, -0.06);
/** A flash label stays up this long (seconds). */
const FLASH_S = 1.6;

/** What the game system lends to this view: entity creation, labels, tweens. */
export interface Stage {
  add(obj: Object3D): Entity;
  remove(e: Entity): void;
  label(text: string, height: number, parent: Object3D, y: number, z?: number, billboard?: boolean): Label;
  tween(obj: Object3D, to: Vector3, dur: number, arc: number, scaleTo: number, done?: () => void): void;
}

interface BotWindow {
  entity: Entity;
  bot: Figure;
  name: Label;
  status: Label;
  work: Label;
  flash: Label;
  flashLeft: number;
  shownWaiting: number;
}

/**
 * Everything Solo Squad adds to the desk: two partner windows, the team
 * crystal, wave banner, boss, and recap. Game rules live in the Rust core;
 * this only draws what the core reports.
 */
export class SquadScene {
  private windows: BotWindow[] = [];
  private crystal?: Entity;
  private banner?: Label;
  private bannerLeft = 0;
  private boss?: Entity;
  private shields: Object3D[] = [];
  private recapItems: Entity[] = [];
  private tmp = new Vector3();

  constructor(
    private stage: Stage,
    private desk: Object3D,
    botNames: [string, string],
  ) {
    botNames.forEach((name, i) => {
      const frame = makePortal(BOT_COLORS[i]);
      frame.name = `portal-window-${i + 1}`;
      frame.position.copy(WINDOW_POS[i]);
      frame.rotation.y = WINDOW_YAW[i];
      const entity = stage.add(frame);
      const bot = makeBot(i === 0 ? 0 : 1, BOT_COLORS[i]);
      // The robot stands in the lower half of the dark opening.
      bot.root.position.set(0, -0.048, 0.003);
      bot.root.scale.setScalar(0.95);
      frame.add(bot.root);
      const nameLabel = stage.label(T.bot(name), 0.026, frame, -0.08, 0.008, false);
      const status = stage.label(T.waiting(0), 0.022, frame, 0.08, 0.008, false);
      const work = stage.label(' ', 0.02, frame, 0.036, 0.008, false);
      const flash = stage.label(' ', 0.022, frame, 0.0, 0.03, false);
      flash.mesh.visible = false;
      work.mesh.visible = false;
      this.windows.push({ entity, bot, name: nameLabel, status, work, flash, flashLeft: 0, shownWaiting: -1 });
    });
    const crystal = makeTeamCrystal();
    crystal.position.copy(CRYSTAL_POS);
    this.crystal = stage.add(crystal);
  }

  /** World position of desk `d` (1 or 2), for flying creatures and orbs. */
  windowPos(desk: number, out: Vector3): Vector3 {
    return out.copy(WINDOW_POS[desk - 1]);
  }

  crystalPos(out: Vector3): Vector3 {
    return out.copy(CRYSTAL_POS).setY(0.04);
  }

  showBanner(text: string, seconds = 2.5): void {
    if (!this.banner) {
      this.banner = new Label(text, { height: 0.04 });
      this.banner.mesh.name = 'squad-banner';
      this.banner.mesh.position.set(0, 0.3, 0.05);
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

  /** A small orb flies from one place on the desk to another and vanishes. */
  flyOrb(from: Vector3, to: Vector3, color: number, done?: () => void): void {
    const orb = makeOrb(color);
    orb.position.copy(from);
    orb.scale.setScalar(0.7);
    const e = this.stage.add(orb);
    this.stage.tween(orb, to, 0.8, 0.08, 0.5, () => {
      this.stage.remove(e);
      done?.();
    });
  }

  crystalHit(): void {
    const obj = this.crystal?.object3D;
    if (!obj) return;
    this.stage.tween(obj, obj.position.clone(), 0.4, 0.03, Math.max(0.55, obj.scale.x * 0.85));
  }

  bossStart(): void {
    const { root } = makeFoldling(0x6d597a);
    root.name = 'boss';
    root.rotation.y = -Math.PI / 2;
    root.position.copy(BOSS_POS);
    root.scale.setScalar(0.1);
    this.boss = this.stage.add(root);
    this.stage.tween(root, BOSS_POS, 0.8, 0.05, 0.42);
    this.shields = [];
    for (let i = 0; i < 3; i += 1) {
      const orb = makeOrb(0xf2cc8f);
      const a = (i / 3) * Math.PI * 2;
      // Shields in the boss's own frame; its +X is the player's side after the turn.
      orb.position.set(0.05, 0.12 + 0.05 * Math.sin(a), 0.1 * Math.cos(a));
      orb.scale.setScalar(0.9);
      root.add(orb);
      this.shields.push(orb);
    }
    this.showBanner(T.boss);
  }

  /** A bot's part of the answer knocks one shield off. */
  bossPart(desk: number): void {
    const shield = this.shields.shift();
    const target = this.boss?.object3D;
    if (!target) return;
    const to = target.position.clone().setY(0.1);
    this.flyOrb(this.windowPos(desk, this.tmp).clone(), to, BOT_COLORS[desk - 1], () => shield?.removeFromParent());
  }

  /** The boss steps aside once the player's own creature carries its last shield. */
  bossHandOff(): void {
    for (const s of this.shields) s.removeFromParent();
    this.shields = [];
    if (this.boss) this.stage.remove(this.boss);
    this.boss = undefined;
  }

  update(delta: number, state: SquadState | undefined): void {
    if (this.banner && this.bannerLeft > 0) {
      this.bannerLeft -= delta;
      if (this.bannerLeft <= 0) this.banner.mesh.visible = false;
    }
    this.windows.forEach((w, i) => {
      if (w.flashLeft > 0) {
        w.flashLeft -= delta;
        if (w.flashLeft <= 0) w.flash.mesh.visible = false;
      }
      const waiting = state?.desks[i + 1]?.waiting ?? 0;
      if (waiting !== w.shownWaiting) {
        w.shownWaiting = waiting;
        w.status.set(T.waiting(waiting));
        if (waiting === 0) w.work.mesh.visible = false;
      }
    });
  }

  showRecap(recap: Recap, playerName: string): void {
    const card = new Group();
    card.name = 'squad-recap';
    card.position.set(0, 0.2, 0.02);
    const e = this.stage.add(card);
    this.recapItems.push(e);
    for (let i = 0; i < 3; i += 1) {
      const star = makeStar(i < recap.stars);
      star.position.set((i - 1) * 0.07, 0.11, 0);
      star.scale.setScalar(1.2);
      card.add(star);
    }
    this.stage.label(T.recapTitle, 0.034, card, 0.06, 0.004, false);
    this.stage.label(T.teamPoints(recap.team_points), 0.028, card, 0.022, 0.004, false);
    recap.players.forEach((p, i) => {
      const who = p.bot ? T.bot(p.name) : playerName;
      const what = p.highlight ? T.highlight[p.highlight] : '';
      const y = -0.016 - i * 0.034;
      this.stage.label(`${who}: ${what}`, 0.026, card, y, 0.004, false);
      // The badge is a symbol, so the row still reads without the words.
      const badge = p.highlight ? makeBadge(p.highlight) : null;
      if (badge) {
        badge.position.set(-0.17, y + 0.004, 0.004);
        badge.scale.setScalar(0.45);
        card.add(badge);
      }
    });
  }

  /** Removes every object this view created. */
  dispose(): void {
    for (const w of this.windows) this.stage.remove(w.entity);
    this.windows = [];
    if (this.crystal) this.stage.remove(this.crystal);
    this.crystal = undefined;
    this.bossHandOff();
    for (const e of this.recapItems) this.stage.remove(e);
    this.recapItems = [];
    if (this.banner) {
      this.banner.mesh.removeFromParent();
      this.banner = undefined;
    }
  }
}
