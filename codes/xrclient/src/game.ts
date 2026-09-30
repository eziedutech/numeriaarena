import {
  createSystem,
  Entity,
  GrabSystem,
  Mesh,
  Object3D,
  OneHandGrabbable,
  Hovered,
  PokeInteractable,
  Pressed,
  RayInteractable,
  Grabbed,
  Group,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';

import { Label } from './art/label.js';
import {
  type Envelope,
  forgetMixers,
  makeBalloon,
  makeBird,
  makeButton,
  makeCrystal,
  makeEnvelope,
  makeFoldling,
  makeOrb,
  mixers,
  speciesFor,
  type Figure,
} from './art/models.js';
import { accentForSkill, CORRECT, paper, TRY_AGAIN } from './art/palette.js';
import {
  Core,
  Race,
  type GameKind,
  type Offer,
  type RaceEvent,
  type RaceOffer,
  type RaceState,
  type RaceVerdict,
  type Verdict,
} from './game/core.js';
import type { Species } from './assets.js';
import { Balloon, Creature, Crystal, DeskRoot, MenuButton, Orb } from './game-components.js';
import { RaceScene, type Stage } from './race-view.js';
import { T } from './text.js';

const WAVE = 6;
/** Presses this soon after balloons appear are ignored (ms). */
const PRESS_GRACE_MS = 300;
/** A crystal merges when it comes this close to another one (meters). */
const MERGE_DIST = 0.05;
/** Space between crystals in the row; wider than the merge distance. */
const CRYSTAL_GAP = 0.095;
/** Seconds a held crystal must stay beside the same crystal before they merge. */
const MERGE_DWELL_S = 0.4;
/**
 * Letting go of a crystal or orb this close to the creature gives it as the
 * answer. Only a release counts, so carrying one past the creature never does.
 */
const GIVE_DIST = 0.09;
/** The creature grows this much while it is ready to take what the hand holds. */
const READY_SCALE = 1.15;
/** Where the creature stands, in the desk frame (reader on +Z). */
/**
 * On the front edge of the book, well behind the answer rows, so a hand
 * reaching for an answer never passes the creature.
 */
const STAND = new Vector3(0, 0.023, -0.03);
/** Rows in front of the creature, still within seated reach. */
const BALLOON_Z = 0.2;
/** Lane spacing: wider than a balloon (0.063 m), so neighbours never touch. */
const BALLOON_GAP = 0.08;
const CRYSTAL_Z = 0.21;
/** Balloon Burst question card, above the balloons so nothing hides it. */
const PROMPT_POS = new Vector3(0, 0.3, STAND.z);
/** The portal at the back of the book, where creatures come from and go home to. */
const HOME = new Vector3(0, 0.023, -0.18);
/**
 * Foldlings show their side to the player, head to the right and turned a
 * little towards them: origami animals read as animals in profile.
 */
const CREATURE_YAW = -0.45;
/** The race asks the core for news this often (seconds), not every frame. */
const RACE_POLL_S = 0.1;
/** Seconds between the last event of a match and the recap card. */
const RECAP_DELAY_S = 2.0;
const BOT_NAMES: [string, string] = ['Clip', 'Crease'];
/**
 * The speed bonus runs out at the expected answer time (8 s, the core's
 * default); the strip shows it. It never fails an answer.
 */
const TIMER_MS = 8000;
const TIMER_W = 0.2;
/** Creatures per game that also get a how-to line. */
const HINTED = 3;
/** Balloons in the mission-free paper colours: coral, cobalt, teal, sunflower. */
const BALLOON_COLORS = [0xf2716b, 0x3469c4, 0x3fb6a0, 0xf9c74f];
/**
 * Rising balloons. A seated child's eye is about 0.35 to 0.45 m above the
 * table; the line from there to the bottom of the question card crosses the
 * balloon row at about 0.30 m. A balloon (0.117 m tall) therefore vanishes
 * once its basket reaches 0.17 m, so no balloon ever covers the question.
 */
const RISE_FROM = 0.0;
/** Upper bound; the live eye line usually sets a lower one (`balloonCeiling`). */
const RISE_TO = 0.21;
/** Balloon height from basket bottom to crown, and the gap kept below the eye line. */
const BALLOON_H = 0.117;
const SIGHT_MARGIN = 0.005;
/** Balloons always rise at least this far, even for an unusual viewpoint. */
const MIN_CEILING = 0.07;
/** Balloons grow in over their first and shrink away over their last few cm. */
const GROW_M = 0.03;
/** Metres per second; each rise varies from 80% to 130% of it. */
const RISE_SPEED = 0.035;
/** More lanes than balloons, so a balloon always finds a free one. */
const BALLOON_LANES = 6;
/**
 * A balloon poke: the hand moves at 5 cm/s or more, not mostly sideways
 * (a sweep across the row) and mostly forward or down into the balloon
 * (not pulled back). Shares are of the hand's speed.
 */
const POKE_MIN_SPEED = 0.05;
const POKE_SIDEWAYS_SHARE = 0.6;
const POKE_INTO_SHARE = 0.5;
/** Fingertip velocity is averaged over roughly this long (seconds). */
const TIP_SMOOTH_S = 0.1;
/** The T helper picks the target nearest the pointing direction within this angle. */
const TOUCH_CONE = (15 * Math.PI) / 180;
/** Hosts where the emulator runs; the T touch helper exists only there. */
const EMULATOR_HOSTS = ['localhost', '127.0.0.1'];
/** A joined orb flies to the creature in this long (seconds). */
const ORB_FLIGHT_S = 0.45;
/** A crystal clicked with the mouse lifts this much to show it is chosen. */
const SELECT_LIFT = 0.025;
/** Feedback pops rise and fade over this long (seconds). */
const POP_S = 1.8;
const RIGHT_INK = 0x2f7d32;
/** A clear red for wrong answers; the words stay friendly ("Try again!"). */
const WRONG_INK = 0xc62828;
/** The question in dark blue, so it stands out from every other card. */
const QUESTION_INK = 0x1f4fa3;
/** Menu envelopes lean back this far (radians) from upright. */
const ENVELOPE_TILT = 1.15;
/** Opening an envelope: the flap folds back, then the letter slides out (seconds). */
const FLAP_S = 0.45;
const LETTER_S = 0.35;
const LETTER_RISE = 0.045;

interface Tween {
  obj: Object3D;
  from: Vector3;
  to: Vector3;
  t: number;
  dur: number;
  arc: number;
  scaleFrom: number;
  scaleTo: number;
  done?: () => void;
}

type Phase = 'loading' | 'menu' | 'opening' | 'playing' | 'between' | 'recap';
type MenuChoice = GameKind | 'race';

export class GameSystem extends createSystem({
  desks: { required: [DeskRoot] },
  creatures: { required: [Creature] },
  balloons: { required: [Balloon] },
  pressedBalloons: { required: [Balloon, Pressed] },
  pressedCrystals: { required: [Crystal, Pressed] },
  crystals: { required: [Crystal] },
  heldCrystals: { required: [Crystal, Grabbed] },
  orbs: { required: [Orb] },
  heldOrbs: { required: [Orb, Grabbed] },
  buttons: { required: [MenuButton] },
  pressedButtons: { required: [MenuButton, Pressed] },
}) {
  private core?: Core;
  private phase: Phase = 'loading';
  private kind: GameKind = 'balloon_burst';
  private offer?: Offer;
  private shownAt = 0;
  private played = 0;
  private score!: Label;
  private hint?: Label;
  private timerBar!: Mesh;
  private timing = false;
  private seen: Record<GameKind, number> = { balloon_burst: 0, orb_forge: 0 };
  private figure?: Figure;
  /** Feedback words rising from the creature and fading out. */
  private pops: { entity: Entity; mesh: Mesh; t: number }[] = [];
  private species: Species = 'fox';
  /** The held crystal or orb currently close enough to be given. */
  private offering?: Entity;
  private touchQuat = new Quaternion();
  private tipPos = [new Vector3(), new Vector3()];
  private tipVel = [new Vector3(), new Vector3()];
  private tipNow = new Vector3();
  private lastPoke = '';
  private pokeVel = new Vector3();
  private pokeAxis = new Vector3();
  private lastDelta = 1 / 72;
  /** Outside XR: the crystal clicked first, waiting for its partner. */
  private selected?: Entity;
  /** Crystals of the last orb given, to write the finished sum on the card. */
  private lastPicks: number[] = [];
  /** Balloon popped last, to write the chosen answer on the card. */
  private lastBalloon = -1;
  private creatureScale = 1;
  private prompt?: Label;
  private labels = new Set<Mesh>();
  private tweens: Tween[] = [];
  private head = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private creatureWorld = new Vector3();
  private mergeWith?: Entity;
  private mergeHeld = 0;

  // Race against two rival bots
  private race?: Race;
  private raceScene?: RaceScene;
  private raceState?: RaceState;
  private racePoll = 0;
  private recapIn = -1;
  private stage!: Stage;
  private envelopes = new Map<Entity, Envelope>();
  private opening?: { envelope: Envelope; choice: MenuChoice; t: number };

  init(): void {
    this.score = new Label('Foldlings', { height: 0.04 });
    this.score.mesh.position.set(0, 0.36, -0.15);
    this.score.mesh.name = 'score-label';
    this.labels.add(this.score.mesh);
    this.timerBar = new Mesh(new PlaneGeometry(TIMER_W, 0.016), paper(CORRECT, { doubleSide: true }));
    this.timerBar.name = 'answer-timer';
    this.timerBar.visible = false;
    this.labels.add(this.timerBar);
    this.stage = {
      add: (obj) => this.add(obj),
      remove: (e) => this.remove(e),
      label: (text, height, parent, y, z, billboard) => this.label(text, height, parent, y, z, billboard),
      tween: (obj, to, dur, arc, scaleTo, done) => this.tween(obj, to, dur, arc, scaleTo, done),
    };

    if (EMULATOR_HOSTS.includes(window.location.hostname)) {
      const onKey = (ev: KeyboardEvent) => {
        if (ev.code === 'KeyT' && !ev.repeat) this.emulatorTouch();
      };
      // Capture phase, before the emulator's own key handling, and also in the
      // emulator's editor window around this page when it holds the focus.
      const targets: Window[] = [window];
      try {
        if (window.parent !== window && window.parent.location.hostname === window.location.hostname) {
          targets.push(window.parent);
        }
      } catch {
        console.info('[emulator] editor window is not reachable; T works when the game view has focus');
      }
      for (const t of targets) {
        t.addEventListener('keydown', onKey, true);
        this.cleanupFuncs.push(() => t.removeEventListener('keydown', onKey, true));
      }
    }

    Core.start(Date.now() >>> 0)
      .then((core) => {
        this.core = core;
        this.phase = 'menu';
      })
      .catch((error) => console.error('[game] core failed to start', error));

    this.cleanupFuncs.push(
      this.queries.pressedButtons.subscribe('qualify', (e) => this.pressButton(e)),
      // A mouse click outside XR is always deliberate; in XR a touch must be a poke.
      this.queries.pressedBalloons.subscribe('qualify', (e) =>
        this.popBalloon(e, this.world.visibilityState.peek() === VisibilityState.NonImmersive),
      ),
      this.queries.pressedCrystals.subscribe('qualify', (e) => this.clickCrystal(e)),
      // Entering or leaving XR switches mouse play for what is already on the desk.
      this.world.visibilityState.subscribe(() => {
        for (const e of [...this.queries.crystals.entities, ...this.queries.balloons.entities]) {
          if (e.hasComponent(Balloon) && !e.hasComponent(PokeInteractable)) continue;
          if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
            if (!e.hasComponent(RayInteractable)) e.addComponent(RayInteractable);
          } else if (e.hasComponent(RayInteractable)) {
            e.removeComponent(RayInteractable);
          }
        }
      }),
      this.queries.heldCrystals.subscribe('disqualify', (e) => this.released(e)),
      this.queries.heldOrbs.subscribe('disqualify', (e) => this.released(e)),
    );
  }

  private pressButton(e: Entity): void {
    if (this.phase === 'recap') {
      this.endRace();
      return;
    }
    if (this.phase !== 'menu') return;
    const choice = e.getValue(MenuButton, 'game') as MenuChoice;
    const envelope = this.envelopes.get(e);
    if (!envelope) {
      this.start(choice);
      return;
    }
    // The chosen envelope opens before its game starts.
    this.phase = 'opening';
    this.opening = { envelope, choice, t: 0 };
  }

  /**
   * A balloon counts only when a fingertip pushes into it, away from the
   * player's head. A hand swept sideways through the row, or pulled back,
   * brushes balloons without choosing one.
   */
  private pokedForward(e: Entity): boolean {
    const obj = e.object3D;
    if (!obj) return false;
    // The desk's axes: the balloon row runs along its X, the player faces its -Z.
    const desk = this.deskEntity()?.object3D;
    if (!desk) return true;
    desk.getWorldQuaternion(this.touchQuat);
    const along = this.pokeAxis.set(1, 0, 0).applyQuaternion(this.touchQuat);
    const into = this.b.set(0, 0, -1).applyQuaternion(this.touchQuat);
    // The hand nearest the balloon made the touch. The touch can register in
    // the same frame the hand moved, before `trackTips` saw it, so the latest
    // movement is added to the smoothed velocity here.
    obj.getWorldPosition(this.a);
    const i = this.tipPos[1].distanceTo(this.a) < this.tipPos[0].distanceTo(this.a) ? 1 : 0;
    const space = i === 0 ? this.player.raySpaces.right : this.player.raySpaces.left;
    space.getWorldPosition(this.tipNow);
    const v = this.pokeVel
      .copy(this.tipNow)
      .sub(this.tipPos[i])
      .divideScalar(Math.max(this.lastDelta, 1 / 120))
      .add(this.tipVel[i]);
    const speed = v.length();
    const forward = v.dot(into);
    const sideways = Math.abs(v.dot(along));
    const down = -v.y;
    this.lastPoke = `speed ${speed.toFixed(2)}, forward ${forward.toFixed(2)}, sideways ${sideways.toFixed(2)}, down ${down.toFixed(2)}`;
    if (speed < POKE_MIN_SPEED || sideways > POKE_SIDEWAYS_SHARE * speed) return false;
    return forward >= POKE_INTO_SHARE * speed || down >= POKE_INTO_SHARE * speed;
  }

  /**
   * Fingertip velocity per hand (0 right, 1 left), smoothed over about the
   * last 100 ms: a touch is often registered a frame or two after the
   * finger's last movement, and tracked hands move in small jumps.
   */
  private trackTips(delta: number): void {
    if (delta <= 0) return;
    this.lastDelta = delta;
    const keep = Math.exp(-delta / TIP_SMOOTH_S);
    // The hand's ray origin moves with the fingertip in a poke; in the
    // emulator the fingertip and grip spaces do not follow a tracked hand.
    const spaces = [this.player.raySpaces.right, this.player.raySpaces.left];
    spaces.forEach((space, i) => {
      space.getWorldPosition(this.tipNow);
      this.b.copy(this.tipNow).sub(this.tipPos[i]).divideScalar(delta);
      this.tipVel[i].multiplyScalar(keep).addScaledVector(this.b, 1 - keep);
      this.tipPos[i].copy(this.tipNow);
    });
  }

  /**
   * Emulator helper, only on this computer (localhost): T touches whatever
   * a hand highlights or points at, as if the fingertip reached it. Moving an
   * emulated fingertip into a floating balloon by mouse is slow; the public
   * build never listens for the key, so the headset stays hands-only.
   */
  private emulatorTouch(): void {
    // What a hand's ray already highlights comes first; otherwise the object
    // nearest either hand's pointing direction within a cone (balloons are
    // not ray targets in XR, and a moving one is hard to hit exactly).
    let e: Entity | undefined;
    for (const q of [this.queries.balloons, this.queries.crystals, this.queries.buttons]) {
      for (const cand of q.entities) if (!e && cand.hasComponent(Hovered)) e = cand;
    }
    let best = TOUCH_CONE;
    for (const hand of [this.player.raySpaces.right, this.player.raySpaces.left]) {
      if (e) break;
      hand.getWorldPosition(this.a);
      hand.getWorldQuaternion(this.touchQuat);
      this.b.set(0, 0, -1).applyQuaternion(this.touchQuat);
      for (const q of [this.queries.balloons, this.queries.crystals, this.queries.buttons]) {
        for (const cand of q.entities) {
          const obj = cand.object3D;
          if (!obj?.visible || obj.scale.x < 0.5) continue;
          obj.getWorldPosition(this.creatureWorld);
          // A balloon's paper envelope is above its basket, the origin.
          if (cand.hasComponent(Balloon)) this.creatureWorld.y += 0.07 * obj.scale.x;
          const angle = this.b.angleTo(this.creatureWorld.sub(this.a));
          if (angle < best) {
            best = angle;
            e = cand;
          }
        }
      }
      if (e) break;
    }
    console.info(`[emulator] T touch: ${e?.object3D?.name ?? 'nothing'}`);
    if (!e) return;
    if (e.hasComponent(Balloon)) this.popBalloon(e, true);
    else if (e.hasComponent(Crystal)) this.clickCrystal(e);
    else if (e.hasComponent(MenuButton)) this.pressButton(e);
  }

  private deskEntity(): Entity | undefined {
    for (const e of this.queries.desks.entities) return e;
    return undefined;
  }

  private add(obj: Object3D): Entity {
    const desk = this.deskEntity()!;
    return this.world.createTransformEntity(obj, { parent: desk });
  }

  /** Adds a text card. `billboard: false` keeps it flat on its parent's +Z face. */
  private label(text: string, height: number, parent: Object3D, y: number, z = 0, billboard = true): Label {
    const l = new Label(text, { height });
    l.mesh.position.set(0, y, z);
    parent.add(l.mesh);
    if (billboard) this.labels.add(l.mesh);
    return l;
  }

  private remove(e: Entity): void {
    if (e.object3D) forgetMixers(e.object3D);
    e.object3D?.traverse((o) => this.labels.delete(o as Mesh));
    e.dispose();
  }

  private clear(query: { entities: Set<Entity> }): void {
    for (const e of [...query.entities]) this.remove(e);
  }

  // ------------------------------------------------------------ menu

  private showMenu(): void {
    this.phase = 'menu';
    const desk = this.deskEntity()!.object3D!;
    if (!this.score.mesh.parent) desk.add(this.score.mesh);
    const games: [MenuChoice, string, number, number][] = [
      ['race', T.race, -0.135, 0x3fb6a0],
      ['balloon_burst', T.gameName.balloon_burst, 0, 0xf2716b],
      ['orb_forge', T.gameName.orb_forge, 0.135, 0x3469c4],
    ];
    for (const [game, title, x, color] of games) {
      this.addEnvelope(game, title, x, color);
    }
  }

  /**
   * A game on the menu: an origami envelope standing on the desk. Touch it
   * with a fingertip, or point at it and pinch (a mouse click in the browser).
   */
  private addEnvelope(game: MenuChoice, title: string, x: number, color: number): void {
    const envelope = makeEnvelope(color);
    envelope.root.name = `menu-${game}`;
    // Leaning back on the table like envelopes on a stand: low enough that
    // the book behind them stays in view, faces still towards the player.
    envelope.root.scale.setScalar(1.05);
    envelope.root.rotation.x = -ENVELOPE_TILT;
    envelope.root.position.set(x, 0.035 * Math.cos(ENVELOPE_TILT), 0.12);
    const e = this.add(envelope.root);
    e.addComponent(MenuButton, { game });
    e.addComponent(PokeInteractable);
    e.addComponent(RayInteractable);
    // On the bottom pocket, below the flap's tip and seal.
    this.label(title, 0.018, envelope.root, -0.022, 0.0045, false);
    this.envelopes.set(e, envelope);
  }

  private runOpening(delta: number): void {
    const o = this.opening;
    if (!o) return;
    o.t += delta;
    const k = Math.min(1, o.t / FLAP_S);
    // From resting on the pockets to just past upright, so it ends behind the letter.
    o.envelope.flap.rotation.x = 0.12 - (Math.PI + 0.2) * (k * k * (3 - 2 * k));
    const l = Math.min(1, Math.max(0, (o.t - FLAP_S) / LETTER_S));
    o.envelope.letter.visible = l > 0;
    o.envelope.letter.position.y = LETTER_RISE * l;
    if (o.t >= FLAP_S + LETTER_S + 0.15) {
      this.opening = undefined;
      this.start(o.choice);
    }
  }

  private addButton(game: MenuChoice, title: string, x: number, color: number): void {
    const button = makeButton(color);
    button.name = `menu-${game}`;
    button.position.set(x, 0.0325 * 1.3, 0.12);
    button.scale.setScalar(1.3);
    const e = this.add(button);
    e.addComponent(MenuButton, { game });
    e.addComponent(PokeInteractable);
    e.addComponent(RayInteractable);
    this.label(title, 0.022, button, 0, 0.0075, false);
  }

  private start(choice: MenuChoice): void {
    this.clear(this.queries.buttons);
    this.envelopes.clear();
    this.played = 0;
    if (choice === 'race') {
      this.phase = 'loading';
      this.startRace().catch((error) => {
        console.error('[race] could not start', error);
        this.showMenu();
      });
      return;
    }
    this.kind = choice;
    this.phase = 'playing';
    this.spawnPractice();
  }

  // ------------------------------------------------------------ Race

  private async startRace(): Promise<void> {
    const race = await Race.create(Date.now() >>> 0, BOT_NAMES);
    this.race = race;
    this.raceScene = new RaceScene(this.stage, this.deskEntity()!.object3D!, BOT_NAMES);
    this.recapIn = -1;
    race.start(Date.now());
    // The scoreboard takes the place of the single score line during a race.
    this.score.mesh.visible = false;
    this.refreshRace();
    this.phase = 'playing';
  }

  private updateRace(delta: number): void {
    const race = this.race;
    const scene = this.raceScene;
    if (!race || !scene) return;
    scene.update(delta);
    if (this.recapIn > 0) {
      this.recapIn -= delta;
      if (this.recapIn <= 0) this.showRecap();
    }
    this.racePoll -= delta;
    if (this.racePoll > 0 || this.phase === 'recap') return;
    this.racePoll = RACE_POLL_S;
    const events = race.tick(Date.now());
    for (const ev of events) this.onRaceEvent(ev);
    if (events.length > 0) this.refreshRace();
    // The player's desk takes the next creature once the last one is gone.
    if (this.phase === 'playing' && !this.offer && this.queries.creatures.entities.size === 0) {
      const offer = race.playerNext();
      if (offer) {
        this.spawnOffer(offer);
        this.refreshRace();
      }
    }
  }

  private refreshRace(): void {
    if (!this.race) return;
    this.raceState = this.race.view();
    this.raceScene?.show(this.raceState);
  }

  private onRaceEvent(ev: RaceEvent): void {
    const scene = this.raceScene!;
    switch (ev.type) {
      case 'wave_start': {
        const total = this.raceState?.waves ?? 3;
        scene.showBanner(`${T.wave(ev.wave + 1, total)}: ${T.gameName[ev.game]}`);
        break;
      }
      case 'bot_working':
        scene.working(ev.desk, ev.prompt);
        break;
      case 'bot_answer':
        scene.answered(ev.desk, ev.correct);
        break;
      case 'desk_done':
        if (ev.desk > 0) scene.finished(ev.desk);
        break;
      case 'emote':
        scene.emote(ev.desk, ev.emote);
        break;
      case 'boss_start':
        scene.showBanner(T.bossRound, 3);
        break;
      case 'match_end':
        this.recapIn = RECAP_DELAY_S;
        break;
      case 'wave_end':
        break;
    }
  }

  private showRecap(): void {
    if (!this.race || !this.raceScene) return;
    const recap = this.race.recap();
    console.info('[race] recap', JSON.stringify(recap));
    const events = this.race.drainEvents();
    console.info(`[race] ${events.length} answer events for the outbox`);
    this.phase = 'recap';
    this.clearPlay();
    this.raceScene.showRecap(recap, T.you);
    this.addButton('race', T.done, 0, 0x81b29a);
  }

  private endRace(): void {
    this.clear(this.queries.buttons);
    this.clearPlay();
    this.raceScene?.dispose();
    this.raceScene = undefined;
    this.race?.free();
    this.race = undefined;
    this.raceState = undefined;
    this.score.set('Foldlings');
    this.score.mesh.visible = true;
    this.showMenu();
  }

  private clearPlay(): void {
    this.clearPrompt();
    this.clear(this.queries.creatures);
    this.clear(this.queries.balloons);
    this.clear(this.queries.crystals);
    this.clear(this.queries.orbs);
    this.offer = undefined;
  }

  // ------------------------------------------------------------ creatures

  private spawnPractice(): void {
    if (!this.core) return;
    this.spawnOffer(this.core.next(this.kind));
  }

  private spawnOffer(offer: Offer | RaceOffer): void {
    this.offer = offer;
    this.kind = offer.game;
    const boss = 'boss' in offer && offer.boss;
    console.info(
      `[game] offer ${offer.offer_id} ${offer.game} ${offer.prompt.en} | ` +
        (offer.game === 'orb_forge'
          ? `target ${offer.target?.text} crystals ${offer.crystals.map((c) => c.text).join(' ')}`
          : `balloons ${offer.balloons.map((b) => b.text).join(' ')}`) +
        (boss ? ' | boss' : ''),
    );
    const color = boss ? 0x6d597a : accentForSkill(offer.skill);
    this.species = boss ? 'elephant' : speciesFor(offer.offer_id);
    const figure = makeFoldling(color, this.species);
    this.figure = figure;
    const { root } = figure;
    root.rotation.y = CREATURE_YAW;
    root.scale.setScalar(0.2);
    root.position.copy(HOME);
    const e = this.add(root);
    e.addComponent(Creature, { offerId: offer.offer_id });
    // The card above the creature says what to do: the question in Balloon
    // Burst, the number to build in Orb Forge. The first few creatures of a
    // game also get a how-to line.
    this.clearPrompt();
    const seen = this.seen[offer.game]++;
    const target = offer.target?.text ?? '';
    const card =
      offer.game === 'balloon_burst' ? offer.prompt.en : seen < HINTED ? T.orbFirst(target) : T.orbTask(target);
    const desk = this.deskEntity()!.object3D!;
    this.prompt = new Label(card, { height: 0.036, ink: QUESTION_INK });
    this.prompt.mesh.name = 'prompt-label';
    this.prompt.mesh.position.copy(PROMPT_POS);
    desk.add(this.prompt.mesh);
    this.labels.add(this.prompt.mesh);
    if (offer.game === 'balloon_burst' && seen < HINTED) {
      this.hint = new Label(T.popHint, { height: 0.022 });
      this.hint.mesh.name = 'hint-label';
      this.hint.mesh.position.set(PROMPT_POS.x, PROMPT_POS.y - 0.034, PROMPT_POS.z);
      desk.add(this.hint.mesh);
      this.labels.add(this.hint.mesh);
    }
    if (!this.timerBar.parent) desk.add(this.timerBar);
    this.timerBar.position.set(PROMPT_POS.x, PROMPT_POS.y + 0.034, PROMPT_POS.z);
    this.timerBar.visible = false;
    this.creatureScale = boss ? 1.4 : 1;
    this.offering = undefined;
    this.tween(root, STAND, 0.7, 0.03, this.creatureScale, () => {
      if (offer.game === 'balloon_burst') this.showBalloons(offer);
      else this.showCrystals(offer);
      this.shownAt = performance.now();
      this.timing = true;
    });
  }

  private creature(): Entity | undefined {
    for (const e of this.queries.creatures.entities) return e;
    return undefined;
  }

  private showBalloons(offer: Offer): void {
    const n = offer.balloons.length;
    offer.balloons.forEach((b, i) => {
      const g = makeBalloon(BALLOON_COLORS[i % BALLOON_COLORS.length]);
      g.name = `balloon-${i}`;
      g.position.set(0, RISE_FROM, BALLOON_Z);
      g.scale.setScalar(0.001);
      const e = this.add(g);
      e.addComponent(Balloon, { index: i });
      e.addComponent(PokeInteractable);
      this.clickable(e);
      // A tag hanging under the basket, so the balloon never covers the number.
      this.label(b.text, 0.03, g, -0.022, 0.01);
      // The first rise is staggered so the balloons do not all come up together.
      this.launch(g, n, i * 0.6 + Math.random() * 0.4);
    });
  }

  private showCrystals(offer: Offer, keepOrbs = false): void {
    if (!keepOrbs) this.clear(this.queries.orbs);
    this.clear(this.queries.crystals);
    this.selected = undefined;
    const n = offer.crystals.length;
    offer.crystals.forEach((c, i) => {
      const m = makeCrystal(0xb7a3e0, i);
      m.name = `crystal-${i}`;
      m.position.set((i - (n - 1) / 2) * CRYSTAL_GAP, 0.03, CRYSTAL_Z);
      const e = this.add(m);
      e.addComponent(Crystal, { index: i });
      e.addComponent(OneHandGrabbable);
      this.clickable(e);
      this.label(c.text, 0.032, m, 0.045);
    });
  }

  // ------------------------------------------------------------ answers

  private popBalloon(e: Entity, deliberate = false): void {
    if (this.phase !== 'playing' || !this.offer) return;
    // A finger still extended from the last pop must not burst a new balloon.
    if (performance.now() - this.shownAt < PRESS_GRACE_MS) return;
    if (!deliberate && !this.pokedForward(e)) {
      console.info(`[game] ${e.object3D?.name} brushed, not poked: ignored (${this.lastPoke})`);
      return;
    }
    const index = e.getValue(Balloon, 'index') as number;
    this.lastBalloon = index;
    const timeMs = performance.now() - this.shownAt;
    let verdict: Verdict | RaceVerdict;
    if (this.race) {
      verdict = this.race.answerBalloon(this.offer.offer_id, index, timeMs, Date.now());
    } else if (this.core) {
      verdict = this.core.answerBalloon(this.offer.offer_id, index, timeMs);
    } else {
      return;
    }
    console.info(
      `[game] balloon ${index} ${this.offer.balloons[index]?.text}: ${verdict.correct ? 'right' : 'wrong'}, ` +
        `expected ${verdict.expected_text}, +${verdict.points}, total ${verdict.total_points}`,
    );
    const obj = e.object3D!;
    if (verdict.correct) {
      this.tween(obj, obj.position.clone(), 0.15, 0, 1.6, () => this.remove(e));
    } else {
      this.tween(obj, obj.position.clone(), 0.2, 0, 0.01, () => this.remove(e));
    }
    this.afterVerdict(verdict);
  }

  private submitOrb(picks: number[]): void {
    this.lastPicks = picks;
    if (!this.offer) return;
    const timeMs = performance.now() - this.shownAt;
    let verdict: Verdict | RaceVerdict;
    if (this.race) {
      verdict = this.race.answerOrb(this.offer.offer_id, picks, timeMs, Date.now());
    } else if (this.core) {
      verdict = this.core.answerOrb(this.offer.offer_id, picks, timeMs);
    } else {
      return;
    }
    console.info(
      `[game] orb ${verdict.built_text ?? '?'} for ${this.offer.target?.text}: ${verdict.correct ? 'right' : 'wrong'}, ` +
        `attempt ${verdict.attempt}, +${verdict.points}, total ${verdict.total_points}`,
    );
    this.clear(this.queries.orbs);
    this.clear(this.queries.crystals);
    if (!verdict.correct && verdict.retry_allowed) this.showCrystals(this.offer);
    this.afterVerdict(verdict);
  }

  private afterVerdict(v: Verdict | RaceVerdict): void {
    if (!v.correct) this.pop(v.retry_allowed ? T.tryAgain : T.itWas(v.expected_text), WRONG_INK);
    if (v.correct || !v.retry_allowed) {
      this.timing = false;
      this.timerBar.visible = false;
    }
    if (this.race) this.refreshRace();
    else this.score.set(`${v.total_points} points`);
    const creature = this.creature();
    if (!creature) return;
    const obj = creature.object3D!;
    if (v.correct) {
      this.solveCard();
      this.pop(T.earned('race_points' in v ? v.race_points : v.points), RIGHT_INK);
      this.clear(this.queries.balloons);
      this.clear(this.queries.crystals);
      this.clear(this.queries.orbs);
      this.foldHome(creature, this.offer ? accentForSkill(this.offer.skill) : 0xffffff);
      return;
    }
    // Wrong: the creature bounces. With a second try it stays; otherwise it leaves.
    if (!this.figure?.play('bounce', true)) this.tween(obj, obj.position.clone(), 0.25, 0.04, 1);
    if (!v.retry_allowed) {
      this.clear(this.queries.balloons);
      this.clear(this.queries.crystals);
      this.clear(this.queries.orbs);
      this.prompt?.set(this.prompt.value.replace('?', v.expected_text));
      this.phase = 'between';
      // Missed twice: it walks home without points.
      this.tween(obj, HOME, 1.4, 0.02, 0.2, () => {
        this.remove(creature);
        this.next();
      });
    }
  }

  /**
   * A right answer completes the question card in green ("1 + 1 = 2", or the
   * two crystals that made the target), so the player sees their own answer
   * was the one accepted.
   */
  private solveCard(): void {
    if (!this.prompt || !this.offer) return;
    const o = this.offer;
    const text =
      o.game === 'orb_forge'
        ? `${this.lastPicks.map((i) => o.crystals[i]?.text ?? '?').join(' + ')} = ${o.target?.text ?? ''}`
        : this.prompt.value.replace('?', o.balloons.find((_, i) => i === this.lastBalloon)?.text ?? '?');
    const solved = new Label(text, { height: 0.036, ink: RIGHT_INK });
    solved.mesh.name = 'prompt-label';
    solved.mesh.position.copy(this.prompt.mesh.position);
    this.prompt.mesh.parent?.add(solved.mesh);
    this.clearPromptOnly();
    this.prompt = solved;
    this.labels.add(solved.mesh);
  }

  private clearPromptOnly(): void {
    if (!this.prompt) return;
    this.prompt.mesh.removeFromParent();
    this.labels.delete(this.prompt.mesh);
    this.prompt = undefined;
  }

  /**
   * Feedback that rises from the creature and fades: the points of a right
   * answer in green, "Try again!" or the right answer in red.
   */
  private pop(text: string, ink: number): void {
    const label = new Label(text, { height: 0.034, ink });
    label.mesh.name = 'feedback-pop';
    const holder = new Group();
    holder.name = 'feedback-pop';
    holder.position.copy(STAND).add(new Vector3(0, 0.12, 0.02));
    holder.add(label.mesh);
    this.labels.add(label.mesh);
    const entity = this.add(holder);
    this.tween(holder, holder.position.clone().add(new Vector3(0, 0.07, 0)), POP_S, 0, 1);
    this.pops.push({ entity, mesh: label.mesh, t: 0 });
  }

  /**
   * Highest basket height (desk frame) at which a balloon's top stays below
   * the line from the viewer's eye to the bottom of the question card, so no
   * balloon ever covers the question, whatever the viewer's height.
   */
  private balloonCeiling(): number {
    const desk = this.deskEntity()?.object3D;
    if (!desk) return RISE_TO;
    this.camera.getWorldPosition(this.a);
    const eye = desk.worldToLocal(this.a);
    // Bottom edge of the lowest card: the hint line when shown, else the question.
    const bottom = this.hint ? PROMPT_POS.y - 0.034 - 0.011 : PROMPT_POS.y - 0.018;
    const span = eye.z - PROMPT_POS.z;
    if (span <= 0.01) return RISE_TO;
    const t = (eye.z - BALLOON_Z) / span;
    const line = eye.y + (bottom - eye.y) * t;
    return Math.max(MIN_CEILING, Math.min(RISE_TO, line - SIGHT_MARGIN - BALLOON_H));
  }

  /**
   * Sends a balloon up again from the table in a lane no other balloon is
   * using, after `wait` seconds, at its own speed.
   */
  private launch(obj: Object3D, count: number, wait: number): void {
    const taken = new Set<number>();
    for (const e of this.queries.balloons.entities) {
      const lane = e.object3D?.userData.rise?.lane as number | undefined;
      if (e.object3D !== obj && lane !== undefined) taken.add(lane);
    }
    const free = [...Array(BALLOON_LANES).keys()].filter((l) => !taken.has(l));
    const lane = free[Math.floor(Math.random() * free.length)] ?? 0;
    obj.userData.rise = { lane, wait, speed: RISE_SPEED * (0.8 + 0.5 * Math.random()), count };
    obj.position.set((lane - (BALLOON_LANES - 1) / 2) * BALLOON_GAP, RISE_FROM, BALLOON_Z);
    obj.scale.setScalar(0.001);
  }

  /**
   * Balloons rise from the table, grow in, and shrink away before the top of
   * the balloon reaches the line of sight to the question, then come back up
   * in another free lane: the player reaches for a moving answer.
   */
  private floatBalloons(delta: number): void {
    const ceiling = this.balloonCeiling();
    for (const e of this.queries.balloons.entities) {
      const obj = e.object3D;
      const r = obj?.userData.rise as { lane: number; wait: number; speed: number; count: number } | undefined;
      if (!obj || !r || this.tweens.some((t) => t.obj === obj)) continue;
      if (r.wait > 0) {
        r.wait -= delta;
        continue;
      }
      obj.position.y += r.speed * delta;
      const grown = Math.min(1, (obj.position.y - RISE_FROM) / GROW_M);
      const left = Math.min(1, (ceiling - obj.position.y) / GROW_M);
      obj.scale.setScalar(Math.max(0.001, Math.min(grown, left)));
      if (obj.position.y >= ceiling) this.launch(obj, r.count, 0.2 + Math.random() * 0.8);
    }
  }

  private runPops(delta: number): void {
    for (let i = this.pops.length - 1; i >= 0; i -= 1) {
      const p = this.pops[i];
      p.t += delta;
      // Fully visible for the first half, then fades out.
      const k = Math.min(1, Math.max(0, (p.t - POP_S / 2) / (POP_S / 2)));
      (p.mesh.material as MeshBasicMaterial).opacity = 1 - k;
      if (p.t >= POP_S) {
        this.remove(p.entity);
        this.pops.splice(i, 1);
      }
    }
  }

  /**
   * A right answer: the Foldling cheers, turns to the portal and goes home its
   * own way (land animals hop, the fish swims up, the crane glides), shrinking
   * into the portal. Only the procedural stand-in, which has no clips, still
   * folds into a paper bird.
   */
  private foldHome(creature: Entity, color: number): void {
    this.phase = 'between';
    const obj = creature.object3D!;
    const cheer = this.figure?.play('cheer', true);
    if (!cheer) {
      this.fly(creature, color);
      return;
    }
    // A tween that stays in place waits out the cheer.
    this.tween(obj, obj.position.clone(), cheer.getClip().duration, 0, obj.scale.x, () => {
      // Head (+X) towards the portal at the back of the book.
      obj.rotation.y = Math.PI / 2;
      const style =
        this.species === 'fish'
          ? { arc: 0.06, clip: 'idle', dur: 1.3 }
          : this.species === 'crane'
            ? { arc: 0.12, clip: 'idle', dur: 1.1 }
            : { arc: 0.025, clip: 'hop', dur: 1.4 };
      this.figure?.play(style.clip);
      this.tween(obj, HOME, style.dur, style.arc, this.creatureScale * 0.25, () => {
        this.remove(creature);
        this.next();
      });
    });
  }

  private fly(creature: Entity, color: number): void {
    const obj = creature.object3D!;
    const bird = makeBird(color).root;
    bird.position.copy(obj.position).add(new Vector3(0, 0.05, 0));
    // The bird flies towards its +X; turn it to head for the book.
    bird.rotation.y = Math.PI / 2;
    const birdEntity = this.add(bird);
    this.remove(creature);
    this.tween(bird, new Vector3(0, 0.1, HOME.z), 0.9, 0.12, 0.4, () => {
      this.remove(birdEntity);
      this.next();
    });
  }

  private clearPrompt(): void {
    this.timing = false;
    this.timerBar.visible = false;
    for (const l of [this.prompt, this.hint]) {
      if (!l) continue;
      l.mesh.removeFromParent();
      this.labels.delete(l.mesh);
    }
    this.prompt = undefined;
    this.hint = undefined;
  }

  /** The speed-bonus strip shrinks from full to nothing over the expected time. */
  private runTimer(): void {
    if (!this.timing) return;
    const left = 1 - (performance.now() - this.shownAt) / TIMER_MS;
    this.timerBar.visible = left > 0;
    if (left <= 0) return;
    this.timerBar.scale.x = left;
    this.timerBar.material = paper(left > 0.5 ? CORRECT : TRY_AGAIN, { doubleSide: true });
  }

  private next(): void {
    this.clearPrompt();
    this.offer = undefined;
    if (this.race) {
      // The race loop hands out the next creature when the core has one.
      if (this.phase === 'between') this.phase = 'playing';
      return;
    }
    this.played += 1;
    if (this.played >= WAVE) {
      this.score.set(`Wave done! ${this.score.value}`);
      this.showMenu();
      return;
    }
    this.phase = 'playing';
    this.spawnPractice();
  }

  // ------------------------------------------------------------ animation

  private tween(obj: Object3D, to: Vector3, dur: number, arc: number, scaleTo: number, done?: () => void): void {
    this.tweens.push({
      obj,
      from: obj.position.clone(),
      to: to.clone(),
      t: 0,
      dur,
      arc,
      scaleFrom: obj.scale.x,
      scaleTo,
      done,
    });
  }

  private runTweens(delta: number): void {
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const tw = this.tweens[i];
      tw.t = Math.min(1, tw.t + delta / tw.dur);
      const k = tw.t * tw.t * (3 - 2 * tw.t);
      tw.obj.position.lerpVectors(tw.from, tw.to, k);
      tw.obj.position.y += Math.sin(Math.PI * tw.t) * tw.arc;
      const s = tw.scaleFrom + (tw.scaleTo - tw.scaleFrom) * k;
      tw.obj.scale.set(s, s, s);
      if (tw.t >= 1) {
        this.tweens.splice(i, 1);
        tw.done?.();
      }
    }
  }

  // ------------------------------------------------------------ frame

  update(delta: number): void {
    const desk = this.deskEntity();
    const placed = !!desk?.getValue(DeskRoot, 'placed');
    if (this.phase === 'menu' && placed && this.queries.buttons.entities.size === 0 && this.queries.creatures.entities.size === 0) {
      this.showMenu();
    }
    this.trackTips(delta);
    this.runTweens(delta);
    for (const m of mixers) m.update(delta);
    if (this.phase === 'opening') this.runOpening(delta);
    this.runTimer();
    this.runPops(delta);
    this.floatBalloons(delta);
    if (this.race) this.updateRace(delta);

    // Labels always face the camera that renders them (the head in XR,
    // the browser camera outside it).
    this.camera.getWorldPosition(this.head);
    for (const m of this.labels) if (m.parent) m.lookAt(this.head);

    if (this.phase !== 'playing' || this.kind !== 'orb_forge' || !this.offer) return;
    const creature = this.creature();
    if (!creature?.object3D) return;
    creature.object3D.getWorldPosition(this.creatureWorld);
    this.creatureWorld.y += 0.05;

    // A held crystal kept beside another crystal merges into an orb. The
    // dwell stops a crystal dragged across the row from merging with every
    // neighbour it passes.
    let near: Entity | undefined;
    let offering: Entity | undefined;
    for (const held of [...this.queries.heldCrystals.entities, ...this.queries.heldOrbs.entities]) {
      held.object3D!.getWorldPosition(this.a);
      if (this.a.distanceTo(this.creatureWorld) < GIVE_DIST) offering = held;
    }
    this.offering = offering;
    // The creature leans in (grows a little) while it can take the answer.
    const s = this.creatureScale * (offering ? READY_SCALE : 1);
    if (!this.tweens.some((t) => t.obj === creature.object3D)) creature.object3D.scale.setScalar(s);
    for (const held of this.queries.heldCrystals.entities) {
      held.object3D!.getWorldPosition(this.a);
      for (const other of this.queries.crystals.entities) {
        if (other === held || other.hasComponent(Grabbed)) continue;
        other.object3D!.getWorldPosition(this.b);
        if (this.a.distanceTo(this.b) < MERGE_DIST) {
          near = other;
          if (near === this.mergeWith) {
            this.mergeHeld += delta;
            if (this.mergeHeld >= MERGE_DWELL_S) {
              this.mergeWith = undefined;
              this.mergeHeld = 0;
              this.merge(held, other);
              return;
            }
          }
          break;
        }
      }
    }
    if (near !== this.mergeWith) {
      this.mergeWith = near;
      this.mergeHeld = 0;
    }
  }

  /** A crystal or orb left the hand: it is an answer only if it was offered to the creature. */
  private released(e: Entity): void {
    if (e !== this.offering || this.phase !== 'playing' || this.kind !== 'orb_forge' || !this.offer) return;
    this.offering = undefined;
    if (e.hasComponent(Orb)) {
      this.submitOrb([e.getValue(Orb, 'first') as number, e.getValue(Orb, 'second') as number]);
    } else {
      this.submitOrb([e.getValue(Crystal, 'index') as number]);
    }
  }

  /**
   * Two crystals joined are the answer: the orb they make flies to the
   * creature on its own, with no extra carrying step.
   */
  private merge(held: Entity, other: Entity): void {
    const grab = this.world.getSystem(GrabSystem);
    if (held.hasComponent(Grabbed)) grab?.forceRelease(held);
    const i = held.getValue(Crystal, 'index') as number;
    const j = other.getValue(Crystal, 'index') as number;
    const texts = this.offer!.crystals;
    const orb = makeOrb(0xf2cc8f);
    orb.name = 'flying-orb';
    other.object3D!.getWorldPosition(this.a);
    this.deskEntity()!.object3D!.worldToLocal(orb.position.copy(this.a));
    orb.position.y = Math.max(orb.position.y, 0.08);
    const e = this.add(orb);
    this.label(`${texts[i].text} + ${texts[j].text}`, 0.03, orb, 0.05);
    this.selected = undefined;
    this.submitOrb([i, j]);
    this.tween(orb, STAND.clone().setY(STAND.y + 0.06), ORB_FLIGHT_S, 0.06, 0.4, () => this.remove(e));
  }

  /**
   * Outside XR (browser preview), a mouse can play: click a balloon to pop it,
   * click one crystal and then another to join them. In the headset the hands
   * do it (touch, pinch), so the reaching stays part of the game.
   */
  private clickable(e: Entity): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) e.addComponent(RayInteractable);
  }

  private clickCrystal(e: Entity): void {
    if (this.phase !== 'playing' || this.kind !== 'orb_forge' || !this.offer) return;
    const obj = e.object3D!;
    if (!this.selected) {
      this.selected = e;
      obj.position.y += SELECT_LIFT;
      return;
    }
    const first = this.selected;
    if (first === e) {
      obj.position.y -= SELECT_LIFT;
      this.selected = undefined;
      return;
    }
    this.merge(first, e);
  }
}
