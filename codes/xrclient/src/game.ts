import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  createSystem,
  DoubleSide,
  SRGBColorSpace,
  Entity,
  GrabSystem,
  Mesh,
  Object3D,
  OneHandGrabbable,
  Hovered,
  PokeInteractable,
  Pressed,
  RayInteractable,
  UIKitMLAsset,
  Grabbed,
  Group,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';

import { Label, type LabelOptions } from './art/label.js';
import {
  type Envelope,
  forgetMixers,
  makeBalloon,
  makeBird,
  makeBadge,
  makeBot,
  makeButton,
  makeCrystal,
  BALLOON_TAG_TOP,
  CRYSTAL_HALF,
  ENVELOPE_FLAP_REST,
  makeEnvelope,
  makeFoldling,
  setOpacity,
  makeOrb,
  makePortal,
  makeStar,
  mixers,
  speciesFor,
  type Figure,
} from './art/models.js';
import { BUTTON_H, BUTTON_W } from './art/paper-props.js';
import { ACCENTS, accentForSkill, CORRECT, INK, paper, TRY_AGAIN } from './art/palette.js';
import { makePaperHand } from './art/paper-hand.js';
import { placeUiImage, prefetchUi, showStickerBackings, uiImage, useUiLanguage, type UiName } from './art/ui2d.js';
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
import { SPECIES, type Species } from './assets.js';
import { Home, type Device, type PlayMode } from './home/home.js';
import { Balloon, Creature, Crystal, DeskRoot, LineTap, MenuButton, Orb, type MenuButtonValue } from './game-components.js';
import { RaceScene, type Stage } from './race-view.js';
import { CHECKPOINT_KEY, clearCheckpoint, readCheckpoint, type RaceCheckpoint } from './race-checkpoint.js';
import { LocalStore } from './storage.js';
import { T, useLanguage } from './text.js';
import { ROOMS, bigText, getLang, getRoom, onSettings, setBigText, setLang, setRoom, textScale } from './settings.js';
import { townSticker } from './home/town-sticker.js';

const WAVE = 6;
/** Presses this soon after balloons appear are ignored (ms). */
const PRESS_GRACE_MS = 300;
/** A crystal merges when it comes this close to another one (meters). */
const MERGE_DIST = 0.05;
/** Space between crystals in the row; wider than the merge distance. */
const CRYSTAL_GAP = 0.095;
// The unseen box a controller's ray clicks a crystal by (see addRayTarget), narrower than the gap.
const CRYSTAL_RAY_BOX = new BoxGeometry(0.08, 0.09, 0.07);
// The grip pulls a crystal under the ray to the controller (see runPull): how fast it follows, how long it flies back.
const SQUEEZE = 'xr-standard-squeeze';
const PULL_RATE = 18;
const PULL_BACK_S = 0.35;
// How near the creature's middle a ray must point to give it a pulled crystal (radians).
const CREATURE_AIM = 0.15;
const CRYSTAL_RAY_PAPER = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
/**
 * Anything the player can act on grows this much while it is pointed at or a
 * fingertip is within `HOVER_REACH` of it, and a rising balloon holds still.
 */
const HOVER_GROW = 0.12;
const HOVER_REACH = 0.07;
/**
 * A balloon holds still only for a fingertip within this distance of the
 * middle of its envelope (which sits `BALLOON_MIDDLE` above its knot), and
 * for at most `BALLOON_HOLD_S` at a time, so a hand resting nearby never
 * keeps it stuck. The poke hover (20 cm) is too wide for this.
 */
const BALLOON_REACH = 0.06;
const BALLOON_MIDDLE = 0.07;
const BALLOON_HOLD_S = 2.5;
/** How quickly the hover grows in and out (per second). */
const HOVER_RATE = 10;
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
/**
 * Rows over the front edge of the book (its pages reach 0.105 m forward), so in
 * the headset they stand ahead of and below the resting hands.
 */
const BALLOON_Z = 0.08;
/** Lane spacing: wider than a balloon (0.063 m), so neighbours never touch. */
const BALLOON_GAP = 0.08;
const CRYSTAL_Z = 0.15;
/** Height of a crystal's price card, and how far it leans back (radians). */
const CRYSTAL_TAG_H = 0.03;
const CRYSTAL_TAG_LEAN = 0.3;
/** One paper colour per answer choice; the colour says nothing about the answer. */
const CRYSTAL_COLORS = [ACCENTS.place_value, ACCENTS.multiply_divide, ACCENTS.fractions, ACCENTS.decimals, ACCENTS.measurement];
/** Balloon Burst question card, above the balloons so nothing hides it. */
const PROMPT_POS = new Vector3(0, 0.3, STAND.z);
/** The portal at the back of the book, where creatures come from and go home to. */
/** Behind the book, where the paper bird of the old stand-in flies to. */
const HOME = new Vector3(0, 0.023, -0.215);
/**
 * The line of animals waiting behind the book: five places across the back
 * of the table, front of the line on the right (they face +X, in profile).
 * They are plain white paper until called, then take the question's colour.
 */
/** The HOME card on the headset menu: right of the envelopes, a little smaller. */
/**
 * The rest of the desk menu: settings cards on the left, the best score
 * above HOME, the Fold Town sticker beside the book, and the hand that shows
 * a first-time player what to do.
 */
/**
 * The two settings cards stand left of the envelopes, the size of HOME on
 * the right and spaced like it, with letters large enough to read from the
 * seat; the best score sits just above HOME.
 */
const SETTINGS_X = [-0.265, -0.385];
const SETTINGS_SCALE = 1.05;
/** The ROOM card floats here in the desk's frame (above LANGUAGE and BIG NUMBERS), tipped back this much. */
const ROOM_CARD_AT = [-0.325, 0.3, 0.01] as const;
const ROOM_CARD_TILT = -0.35;
/** Room names run longer than ON or EN, so they are printed a little smaller. */
const ROOM_VALUE_H = 0.024;
const BEST_AT = new Vector3(0.26, 0.097, 0.11);
const TOWN_AT = new Vector3(-0.29, 0.0, -0.08);
const TOWN_W = 0.19;
const HINT_SEEN = 'numeria.menuHintSeen';
/**
 * First time a game appears on this device the paper hand shows how to play
 * it (`numeria.howto.<game>`), for up to DEMO_S or until the player acts.
 */
const HOWTO_KEY = 'numeria.howto.';
/**
 * A menu that has just appeared ignores touches this long: the finger that
 * pressed Done is still there, and an envelope may appear right under it.
 */
const MENU_GRACE_MS = 800;
/**
 * The choice buttons on a results screen (PRACTICE AGAIN, Done) take a press
 * only once they have been up this long, and only from a fingertip that came
 * in from at least CHOICE_ARM_M away: a hand resting where they appear, or
 * hovering over them, never chooses.
 */
const CHOICE_GRACE_MS = 1200;
const CHOICE_ARM_M = 0.06;
/**
 * A results choice is a paper card cut to its word: 3 cm letters, CHOICE_PAD
 * of paper left and right, CHOICE_H tall, and CHOICE_SPACE between two cards.
 */
const CHOICE_TEXT_H = 0.03;
const CHOICE_H = 0.058;
const CHOICE_PAD = 0.022;
const CHOICE_SPACE = 0.03;
const DEMO_S = 10;
const BEST_KEY = 'numeria.best';
const HOME_CARD_X = 0.26;
/**
 * The QUIT card during a game in the headset: just over the race card on the
 * right, turned to the player like it, away from the balloons and crystals
 * (the same place in a practice). The first press (touch, trigger or click)
 * asks, a second within QUIT_ASK_MS leaves to the desk menu.
 */
const QUIT_POS = new Vector3(0.395, 0.345, 0.08);
const QUIT_YAW = -0.65;
/** A small card for one word: narrower than it is scaled tall, its word kept 2 cm high. */
const QUIT_SCALE = { x: 0.6, y: 0.5 };
const QUIT_TEXT_H = 0.02;
const QUIT_ASK_MS = 4000;
/** IWSDK's RayDisplayMode values: always, or only while hitting a target (its default). */
const RAY_VISIBLE = 1;
const RAY_ON_TARGET = 2;
const SIDES = ['left', 'right'] as const;
/** How far and how long a pressed desk card sinks. */
const PRESS_DIP_M = 0.006;
const PRESS_DIP_MS = 160;
const HOME_CARD_SCALE = 0.95;
/** The first-time hand repeats its press every this many seconds. */
const HINT_LOOP_S = 2.2;
const LINE_SIZE = 5;
const LINE_Z = -0.245;
/** Space between two animals in the line. */
const LINE_SPACE = 0.014;
const LINE_SCALE = 0.85;
const LINE_PAPER = 0xfbf6ec;
/** Where an animal goes after its turn: off the back right of the table. */
const EXIT = new Vector3(0.38, 0.023, LINE_Z);

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
 * Drifting balloons. A seated child's eye is about 0.35 to 0.45 m above the
 * table; the line from there to the bottom of the question card crosses the
 * balloon row at about 0.35 m. A balloon (0.117 m tall) drifts no higher than
 * where its top meets that line, so it never covers the question.
 */
/** Upper bound; the live eye line usually sets a lower one (`balloonCeiling`). */
const RISE_TO = 0.32;
/** Balloon height from its origin (the old basket's foot) to its crown, and the gap kept below the eye line. */
const BALLOON_H = 0.117;
const SIGHT_MARGIN = 0.005;
/** Balloons always rise at least this far, even for an unusual viewpoint. */
const MIN_CEILING = 0.1;
/** The bottom of a balloon's climb, just above the table, its speed, and how fast it grows in and fades out. */
const BOB_LOW = 0.04;
const RISE_SPEED = 0.035;
const RISE_GROW_M = 0.025;
const RISE_FADE_M = 0.035;
/** A fading balloon's top may pass the line of sight to the question by this much. */
const FADE_PAST_M = 0.015;
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
/** The question card breathes while it waits for an answer: this much bigger, once per this many seconds. */
const PROMPT_PULSE = 0.05;
const PROMPT_PULSE_S = 1.1;
/** Where the points are shown: the practice score, or the race scoreboard's middle row. */
const SCORE_AT = new Vector3(0, 0.36, -0.15);
const BOARD_AT = new Vector3(0, 0.424, -0.15);
/** A right answer's creature flies up to the points in this many seconds. */
const TO_SCORE_S = 1.0;
const RIGHT_INK = 0x2f7d32;
/** A clear red for wrong answers; the words stay friendly ("Try again!"). */
const WRONG_INK = 0xc62828;
/** The question in dark blue, so it stands out from every other card. */
const QUESTION_INK = 0x1f4fa3;
/** Menu envelopes lean back this far (radians) from upright. */
const ENVELOPE_TILT = 1.3;
/** Envelopes lie this far in front of the book's front edge (desk frame z). */
const ENVELOPE_Z = 0.11;
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
/** An animal waiting in the line behind the book. */
interface LineAnimal {
  species: Species;
  entity: Entity;
  offerId: number;
  /** Its length across the table at line size. */
  width: number;
}

/** A balloon's lane and drift: its own pace and where in its swing it is. */
interface Drift {
  lane: number;
  wait: number;
  count: number;
  t: number;
  rate: number;
  phase: number;
}

type MenuChoice = GameKind | 'race';
/** A desk button: a game, or HOME (leave the headset for the home page). */
type ButtonChoice = MenuChoice | 'home' | 'lang' | 'bigtext' | 'room' | 'town' | 'again' | 'games' | 'done' | 'quit';
// A choice missing from MenuButton's enum fails only at run time, when the button is made: caught here instead.
const BUTTON_CHOICES_IN_ENUM: ButtonChoice extends MenuButtonValue ? true : never = true;
void BUTTON_CHOICES_IN_ENUM;

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
  pressedLine: { required: [LineTap, Pressed] },
}) {
  private core?: Core;
  /** Device storage; answers judged before it opens wait in `unsaved`. */
  private store?: LocalStore;
  private unsaved: { events: unknown[]; mode: string }[] = [];
  private phase: Phase = 'loading';
  private quitLabel?: Label;
  private quitAskedAt = 0;
  private wasControllers = false;
  private kind: GameKind = 'balloon_burst';
  private offer?: Offer;
  private shownAt = 0;
  private played = 0;
  /** Creatures folded in this practice, and the practice summary cards while they show. */
  private practiceRight = 0;
  /** The practice session's running total when this practice began: its own points count from here. */
  private practiceBase = 0;
  private practiceTotal = 0;
  /** When the desk menu last appeared (performance.now()), for MENU_GRACE_MS. */
  private menuShownAt = 0;
  private practiceCards: Mesh[] = [];
  private score!: Label;
  /** The paper title over the book on the menu (the score line's place). */
  private title?: Mesh;
  private titleAsked = false;
  private hint?: Label;
  private timerBar!: Mesh;
  private timing = false;
  private seen: Record<GameKind, number> = { balloon_burst: 0, orb_forge: 0 };
  private figure?: Figure;
  /** Feedback words rising from the creature and fading out. */
  private pops: { entity: Entity; mesh: Mesh; t: number }[] = [];
  private species: Species = 'dog';
  /** The held crystal or orb currently close enough to be given. */
  private offering?: Entity;
  /** A crystal pulled from afar by a controller's grip (see runPull): where it came from, which hand has it. */
  private pulled?: { e: Entity; side: (typeof SIDES)[number]; home: Vector3 };
  private touchQuat = new Quaternion();
  private tipPos = [new Vector3(), new Vector3()];
  private tipVel = [new Vector3(), new Vector3()];
  private tipNow = new Vector3();
  private lastPoke = '';
  /** The animals waiting their turn behind the book, front of the line first. */
  private line: LineAnimal[] = [];
  private menuOnly: 'all' | 'practice' = 'all';
  private bestCard?: Label;
  private hintHand?: Group;
  private hintLabel?: Label;
  private hintT = 0;
  /** The how-to on a game's first creature: which game, how long it has run, and the hand. */
  private demo?: { game: 'balloon_burst' | 'orb_forge'; t: number; hand: Group };
  /** Running on this computer with the emulator (the public build never is). */
  private onEmulator = EMULATOR_HOSTS.includes(window.location.hostname);
  /** Emulator only: let hand touches pop balloons (Y toggles; T always works). */
  private emulatorPokes = false;
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
  private c = new Vector3();
  private creatureWorld = new Vector3();
  private mergeWith?: Entity;
  private mergeHeld = 0;

  // Race against two rival bots
  private race?: Race;
  private raceScene?: RaceScene;
  private raceState?: RaceState;
  private racePoll = 0;
  /** The race round that is on (0-based, the boss last), and the player's points when it began. */
  private raceRound = 0;
  private roundStartPoints = 0;
  /**
   * Pause while the headset is off or the system menu is open (the session
   * is hidden or blurred): Date.now() when it started, and the paused time
   * so far, which the race clock leaves out.
   */
  private pausedAt?: number;
  private pausedPerf = 0;
  private pausedTotal = 0;
  private welcomeShown?: boolean;
  /** The home page over the browser view; the game shows it while choosing what to play. */
  private home!: Home;
  private wantHome = true;
  /** What to start once the headset session opens, chosen on the home page. */
  private pendingXr?: PlayMode;
  private wasImmersive = false;
  private homeWasShown = false;
  /** The loading screen from index.html has been faded out. */
  private bootGone = false;
  private recapIn = -1;
  private stage!: Stage;
  private envelopes = new Map<Entity, Envelope>();
  private opening?: { envelope: Envelope; choice: MenuChoice; t: number };

  init(): void {
    this.score = new Label(T.title, { height: 0.04 });
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

    if (this.onEmulator) {
      const onKey = (ev: KeyboardEvent) => {
        if (ev.repeat) return;
        if (ev.code === 'KeyT') this.emulatorTouch();
        // 1, 2, 3: open the first, second or third menu envelope, in or out of XR.
        const pick = ['Digit1', 'Digit2', 'Digit3'].indexOf(ev.code);
        // From the home page the keys start a game straight away, in this view.
        if (pick >= 0 && this.home.visible) {
          this.wantHome = false;
          this.start((['race', 'balloon_burst', 'orb_forge'] as MenuChoice[])[pick]);
        } else if (pick >= 0) {
          const e = [...this.queries.buttons.entities][pick];
          if (e) this.pressButton(e);
        }
        // B: as if the headset came off or the system menu opened, and back.
        if (ev.code === 'KeyB') {
          const device = (window as { IWER_DEVICE?: { visibilityState: string; updateVisibilityState(s: string): void } }).IWER_DEVICE;
          device?.updateVisibilityState(device.visibilityState === 'visible' ? 'visible-blurred' : 'visible');
        }
        // Z: every species in a row on the table, to compare the folds.
        if (ev.code === 'KeyZ') this.toggleZoo();
        if (ev.code === 'KeyY') {
          this.emulatorPokes = !this.emulatorPokes;
          console.info(`[emulator] hand touches on balloons ${this.emulatorPokes ? 'on' : 'off'}`);
        }
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

    LocalStore.open().then((store) => {
      this.store = store;
      for (const batch of this.unsaved.splice(0)) void store.record(batch.events, batch.mode);
    });

    this.home = new Home(
      this.world.camera as PerspectiveCamera,
      this.world.xrEnabled,
      (mode, device) => this.homePlay(mode, device),
      () => this.goHome(),
      () => this.otherGame(),
    );
    // The project allows XR; whether this device can open a session is the browser's to say.
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    if (!xr) this.home.setXrAvailable(false);
    else
      Promise.all([xr.isSessionSupported('immersive-ar'), xr.isSessionSupported('immersive-vr')])
        .then(([ar, vr]) => this.home.setXrAvailable(ar || vr))
        .catch(() => this.home.setXrAvailable(false));

    useLanguage(getLang());
    useUiLanguage(getLang());
    // A setting changed on the desk or the home page: new text and stickers
    // from now on, and the desk menu redrawn so its cards show the new choice.
    onSettings(() => {
      useLanguage(getLang());
      useUiLanguage(getLang());
      void prefetchUi();
      if (this.phase === 'menu' && this.queries.buttons.entities.size > 0) {
        this.clearMenu();
        this.showMenu(this.menuOnly);
      }
    });

    Core.start(Date.now() >>> 0)
      .then((core) => {
        this.core = core;
        this.phase = 'menu';
      })
      .catch((error) => console.error('[game] core failed to start', error));

    this.cleanupFuncs.push(
      this.queries.pressedButtons.subscribe('qualify', (e) => this.pressButton(e)),
      this.queries.pressedLine.subscribe('qualify', (e) => this.greet(e)),
      // A mouse click outside XR is always deliberate; in XR a touch must be a poke,
      // and with controllers only a trigger click counts (a ray waved past, or the
      // controller pushed through a balloon, is not a choice).
      this.queries.pressedBalloons.subscribe('qualify', (e) => {
        const browser = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
        // A trigger click goes through clickAimedBalloon, which also takes the clicks IWSDK's press missed.
        if (!browser && this.controllersOnly()) return;
        // In the emulator the hands move with the view and the body, so a
        // "poke" is usually an accident: there, T chooses (Y allows pokes).
        if (!browser && this.onEmulator && !this.emulatorPokes) {
          console.info('[emulator] hand touch ignored: point and press T (Y allows touches)');
          return;
        }
        this.popBalloon(e, browser);
      }),
      this.queries.pressedCrystals.subscribe('qualify', (e) => this.clickCrystal(e)),
      // Entering or leaving XR switches mouse play for what is already on the desk.
      this.world.visibilityState.subscribe(() => {
        this.pauseWhileAway();
        for (const e of [...this.queries.crystals.entities, ...this.queries.balloons.entities]) {
          if (e.hasComponent(Balloon) && !e.hasComponent(PokeInteractable)) continue;
          this.setClickable(e);
        }
      }),
      // Picking up a crystal is the move the how-to shows: it can stop. A crystal
      // chosen by a click before is let go, so a click and a grab do not mix.
      this.queries.heldCrystals.subscribe('qualify', (e) => {
        this.endDemo(true);
        this.unselect(e);
      }),
      this.queries.heldCrystals.subscribe('disqualify', (e) => this.released(e)),
      this.queries.heldOrbs.subscribe('disqualify', (e) => this.released(e)),
    );
  }

  private pressButton(e: Entity, deliberate = false): void {
    console.info(`[menu] pressed ${e.getValue(MenuButton, 'game')} (${e.object3D?.name}) while ${this.phase}`);
    if (!deliberate && !this.pressMeant()) {
      console.info('[menu] brushed by a controller without its trigger: ignored');
      return;
    }
    // Envelopes open with their own move; the paper cards sink.
    if (e.object3D && !this.envelopes.has(e)) this.dip(e.object3D);
    if (e.getValue(MenuButton, 'game') === 'quit') {
      this.pressQuit(e);
      return;
    }
    if (this.phase === 'recap') {
      if (!this.choiceReady(e)) {
        console.info(`[menu] ${e.object3D?.name} not taken: too soon, or the finger did not come in from outside`);
        return;
      }
      const pressed = e.getValue(MenuButton, 'game') as ButtonChoice;
      // A practice can go round again or back to its envelopes; anything else on a results screen is Done.
      if (pressed === 'again' && !this.race) {
        const kind = this.kind;
        this.clearPracticeCards();
        this.clear(this.queries.buttons);
        this.start(kind);
        return;
      }
      if (pressed === 'games' && !this.race) {
        this.otherGame();
        return;
      }
      this.endRace();
      return;
    }
    if (this.phase !== 'menu') return;
    if (performance.now() - this.menuShownAt < MENU_GRACE_MS) {
      console.info('[menu] touch ignored: the menu has only just appeared');
      return;
    }
    const pressed = e.getValue(MenuButton, 'game') as ButtonChoice;
    if (pressed === 'home') {
      this.leaveToHome();
      return;
    }
    if (pressed === 'lang') {
      console.info('[menu] language toggled');
      setLang(getLang() === 'en' ? 'id' : 'en');
      return;
    }
    if (pressed === 'room') {
      const next = ROOMS[(ROOMS.indexOf(getRoom()) + 1) % ROOMS.length];
      console.info(`[menu] room ${next}`);
      setRoom(next);
      return;
    }
    if (pressed === 'bigtext') {
      console.info('[menu] big numbers toggled');
      setBigText(!bigText());
      return;
    }
    if (pressed === 'town') {
      console.info('[menu] fold town (soon)');
      this.pop(T.townSoon, QUESTION_INK, undefined, TOWN_AT.clone().add(new Vector3(0, 0.16, 0.02)), 0.026);
      return;
    }
    // PRACTICE AGAIN and Done belong to results; a late touch from them does nothing here.
    if (pressed === 'again' || pressed === 'games' || pressed === 'done' || pressed === 'quit') return;
    this.hideHint(true);
    const choice: MenuChoice = pressed;
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
  private zoo: Entity[] = [];
  private zooPage = 0;

  /**
   * Emulator only: four species at a time, large and close, without their
   * flags, to compare the folds. Pressing again shows the next four, then none.
   */
  private toggleZoo(): void {
    for (const e of this.zoo) this.remove(e);
    this.zoo = [];
    const page = this.zooPage;
    const animalPages = Math.ceil(SPECIES.length / 4);
    this.zooPage = (this.zooPage + 1) % (animalPages + 2);
    if (page === animalPages) {
      this.showPropsZoo();
      return;
    }
    const shown = SPECIES.slice(page * 4, page * 4 + 4);
    shown.forEach((species, i) => {
      const fig = makeFoldling(accentForSkill(['PV', 'MD', 'FR', 'DC'][i]), species);
      fig.root.name = `zoo-${species}`;
      for (const c of fig.root.getObjectByName('flag_anchor')?.children ?? []) c.visible = false;
      fig.root.scale.setScalar(1.3);
      fig.root.position.set(-0.3 + i * 0.2, 0.06, 0.3);
      this.zoo.push(this.add(fig.root));
    });
  }

  /** Emulator only: the paper props side by side (stars, badges, Done, a rival window, an orb). */
  private showPropsZoo(): void {
    const g = new Group();
    g.name = 'zoo-props';
    g.position.set(0, 0.12, 0.28);
    const place = (o: Object3D, x: number, y: number, scale = 1) => {
      o.position.set(x, y, 0);
      o.scale.setScalar(scale);
      g.add(o);
    };
    place(makeStar(true), -0.3, 0.07, 1.2);
    place(makeStar(false), -0.24, 0.07, 1.2);
    ['best_save', 'most_improved', 'sharpest_aim', 'steady_streak', 'brave_try'].forEach((h, i) => {
      const b = makeBadge(h);
      if (b) place(b, -0.16 + i * 0.07, 0.07);
    });
    const button = makeButton(0x3469c4);
    placeUiImage('button_done', button, [0, 0, 0.002], { scale: 0.9 });
    place(button, -0.26, -0.03);
    const frame = makePortal(0x3469c4);
    const bot = makeBot(0, 0x3469c4);
    bot.root.position.set(0, -0.048, 0.003);
    bot.root.scale.setScalar(0.95);
    frame.add(bot.root);
    place(frame, -0.07, -0.03);
    place(makeOrb(CRYSTAL_COLORS[0], CRYSTAL_COLORS[2]), 0.1, -0.03, 1.4);
    place(makeCrystal(CRYSTAL_COLORS[1], 1), 0.2, -0.04, 1.2);
    this.zoo.push(this.add(g));
  }

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
          if (!obj?.visible || obj.scale.x < 0.5 || ((obj.userData.opacity as number | undefined) ?? 1) < 0.3) continue;
          obj.getWorldPosition(this.creatureWorld);
          // A balloon's paper envelope is well above its origin.
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
    else if (e.hasComponent(MenuButton)) this.pressButton(e, true);
  }

  private deskEntity(): Entity | undefined {
    for (const e of this.queries.desks.entities) return e;
    return undefined;
  }

  private add(obj: Object3D): Entity {
    const desk = this.deskEntity()!;
    return this.world.createTransformEntity(obj, { parent: desk });
  }

  /**
   * Adds a text card. `billboard: false` keeps it flat on its parent's +Z face;
   * `anchor` says which edge sits at `y` when the card grows (stacked fractions).
   */
  private label(
    text: string,
    height: number,
    parent: Object3D,
    y: number,
    z = 0,
    billboard = true,
    anchor: LabelOptions['anchor'] = 'center',
  ): Label {
    const l = new Label(text, { height, anchor });
    l.mesh.position.set(0, y, z);
    parent.add(l.mesh);
    if (billboard) this.labels.add(l.mesh);
    return l;
  }

  private remove(e: Entity): void {
    if (e.object3D) forgetMixers(e.object3D);
    e.object3D?.traverse((o) => this.labels.delete(o as Mesh));
    const rayTarget = e.object3D?.userData.rayTarget as Entity | undefined;
    if (rayTarget?.active) rayTarget.dispose();
    e.dispose();
  }

  private clear(query: { entities: Set<Entity> }): void {
    for (const e of [...query.entities]) this.remove(e);
  }

  // ------------------------------------------------------------ menu

  /** The paper title stands in for the score line while the menu is up. */
  private showTitle(): void {
    const menu = this.phase === 'menu';
    // The score shows during play even when the title never loaded (a game started from the home page).
    this.score.mesh.visible = !this.homeWasShown && !menu && !this.race;
    if (!this.title) return;
    this.title.visible = !this.homeWasShown && menu;
  }

  private showMenu(only: 'all' | 'practice' = 'all'): void {
    this.phase = 'menu';
    this.menuShownAt = performance.now();
    this.menuOnly = only;
    this.syncLine(this.lineFrom);
    const desk = this.deskEntity()!.object3D!;
    if (!this.score.mesh.parent) desk.add(this.score.mesh);
    if (!this.title && !this.titleAsked) {
      this.titleAsked = true;
      const p = this.score.mesh.position;
      placeUiImage('title_numeria_arena', desk, [p.x, p.y, p.z], {
        scale: 0.75,
        ready: (mesh) => {
          this.title = mesh;
          this.labels.add(mesh);
          this.showTitle();
        },
      });
    }
    this.showTitle();
    const games: [MenuChoice, string, number, number][] = [
      ['race', T.race, -0.135, 0x3fb6a0],
      ['balloon_burst', T.gameName.balloon_burst, 0, 0xf2716b],
      ['orb_forge', T.gameName.orb_forge, 0.135, 0x3469c4],
    ];
    for (const [game, title, x, color] of games) {
      if (only === 'practice' && game === 'race') continue;
      this.addEnvelope(game, title, only === 'practice' ? x - 0.0675 : x, color);
    }
    // In the headset the home page cannot show, so a paper HOME card on the
    // desk ends the session and goes back to it.
    if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) {
      this.addButton('home', T.home, HOME_CARD_X, 0xe8b64c, HOME_CARD_SCALE);
      // Settings on the desk, so the headset never has to come off for them.
      this.addSettingCard('lang', T.langCaption, getLang().toUpperCase(), SETTINGS_X[0], 0xfff8ec);
      // Teal while big numbers are on, plain paper while off.
      this.addSettingCard('bigtext', T.bigCaption, T.onOff(bigText()), SETTINGS_X[1], bigText() ? 0x3fb6a0 : 0xfff8ec);
      // The room is not part of the game: its card floats above the desk,
      // tipped towards the seat. Plain paper in the real room, teal in a virtual one.
      const room = this.addSettingCard('room', T.roomCaption, T.roomName[getRoom()], ROOM_CARD_AT[0], getRoom() === 'here' ? 0xfff8ec : 0x3fb6a0, ROOM_VALUE_H);
      room.position.set(ROOM_CARD_AT[0], ROOM_CARD_AT[1], ROOM_CARD_AT[2]);
      room.rotation.x = ROOM_CARD_TILT;
      this.addTownSticker();
      this.showHint();
    }
    this.showBest();
  }

  /** Clears the desk menu: its buttons, envelopes, best card and hint. */
  private clearMenu(): void {
    this.clear(this.queries.buttons);
    this.envelopes.clear();
    this.bestCard?.mesh.removeFromParent();
    this.bestCard = undefined;
    this.hideHint(false);
  }

  /** The best score kept on this device, as a small card above HOME. */
  private showBest(): void {
    this.bestCard?.mesh.removeFromParent();
    this.bestCard = undefined;
    const best = this.readBest();
    if (!best) return;
    const card = new Label(T.best(best.points, best.stars), { height: 0.017 });
    card.mesh.name = 'best-card';
    card.mesh.position.copy(BEST_AT);
    this.deskEntity()?.object3D?.add(card.mesh);
    this.labels.add(card.mesh);
    this.bestCard = card;
  }

  private readBest(): { points: number; stars: number } | undefined {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      return raw ? (JSON.parse(raw) as { points: number; stars: number }) : undefined;
    } catch {
      return undefined;
    }
  }

  /** Keeps the better of this result and the best so far. */
  private saveBest(points: number, stars: number): void {
    const best = this.readBest();
    if (best && (best.stars > stars || (best.stars === stars && best.points >= points))) return;
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify({ points, stars }));
    } catch {
      // Without storage the best score is simply not kept.
    }
  }

  /** The Fold Town sticker standing beside the book, the same one as on the home page. */
  private addTownSticker(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 400;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      tex.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(townSticker(600))}`;
    const h = (TOWN_W * canvas.height) / canvas.width;
    const plane = new Mesh(
      new PlaneGeometry(TOWN_W, h),
      new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }),
    );
    plane.position.y = h / 2;
    const sticker = new Group();
    sticker.name = 'menu-town';
    sticker.add(plane);
    sticker.position.copy(TOWN_AT);
    // Turned a little towards the reader, like a card propped on the desk.
    sticker.rotation.y = 0.35;
    const e = this.add(sticker);
    e.addComponent(MenuButton, { game: 'town' });
    e.addComponent(PokeInteractable);
    e.addComponent(RayInteractable);
  }

  /** First time on the desk menu: a paper hand pokes the race envelope, with three words under it. */
  private showHint(): void {
    try {
      if (localStorage.getItem(HINT_SEEN)) return;
    } catch {
      // Without storage the hint shows each time; it never blocks anything.
    }
    if (this.hintHand) return;
    const hand = this.paperHand('menu-hint-hand');
    this.deskEntity()?.object3D?.add(hand);
    this.hintHand = hand;
    const label = new Label(T.touchHint, { height: 0.02 });
    label.mesh.position.set(-0.135, 0.11, ENVELOPE_Z);
    this.deskEntity()?.object3D?.add(label.mesh);
    this.labels.add(label.mesh);
    this.hintLabel = label;
    this.hintT = 0;
  }

  private hideHint(seen: boolean): void {
    this.hintHand?.removeFromParent();
    this.hintHand = undefined;
    this.hintLabel?.mesh.removeFromParent();
    if (this.hintLabel) this.labels.delete(this.hintLabel.mesh);
    this.hintLabel = undefined;
    if (seen) {
      try {
        localStorage.setItem(HINT_SEEN, '1');
      } catch {
        // Nothing to keep.
      }
    }
  }

  /** A pale paper hand, index finger out along -Z, for showing what to do. */
  private paperHand(name: string): Group {
    return makePaperHand(name);
  }

  /** Starts the how-to for `game` if this device has not seen it. */
  private startDemo(game: 'balloon_burst' | 'orb_forge'): void {
    if (this.demo) return;
    try {
      if (localStorage.getItem(HOWTO_KEY + game)) return;
    } catch {
      // Without storage the how-to shows each time; it never blocks play.
    }
    const desk = this.deskEntity()?.object3D;
    if (!desk) return;
    const hand = this.paperHand('demo-hand');
    hand.visible = false;
    desk.add(hand);
    this.demo = { game, t: 0, hand };
    console.info(`[howto] ${game}`);
  }

  /** Ends the how-to; `seen` keeps it from showing again on this device. */
  private endDemo(seen: boolean): void {
    const d = this.demo;
    if (!d) return;
    d.hand.removeFromParent();
    this.demo = undefined;
    if (!seen) return;
    try {
      localStorage.setItem(HOWTO_KEY + d.game, '1');
    } catch {
      // Nothing to keep.
    }
  }

  /**
   * The hand plays the first move over and over: in Balloon Burst it comes
   * in from the front and pokes the first balloon; in Orb Forge it lifts
   * over the first crystal and carries across to the second. It only shows
   * the move, never the answer.
   */
  private runDemo(delta: number): void {
    const d = this.demo;
    if (!d) return;
    d.t += delta;
    if (d.t > DEMO_S) {
      this.endDemo(true);
      return;
    }
    const desk = this.deskEntity()?.object3D;
    const k = (d.t % HINT_LOOP_S) / HINT_LOOP_S;
    const smooth = (x: number) => {
      const c = Math.min(1, Math.max(0, x));
      return c * c * (3 - 2 * c);
    };
    if (d.game === 'balloon_burst') {
      const b = desk?.getObjectByName('balloon-0');
      d.hand.visible = Boolean(b);
      if (!b) return;
      // In, a short press on the balloon's middle, then back out.
      const reach = smooth(k < 0.45 ? k / 0.45 : k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
      d.hand.position.set(b.position.x, b.position.y + 0.07, b.position.z + 0.035 + 0.1 * (1 - reach));
      d.hand.rotation.set(0, 0, 0);
    } else {
      const a = desk?.getObjectByName('crystal-0');
      const c = desk?.getObjectByName('crystal-1');
      d.hand.visible = Boolean(a && c);
      if (!a || !c) return;
      // Down onto the first, across to the second at a small lift, then up and away.
      const across = smooth((k - 0.2) / 0.5);
      const lift = 0.03 + 0.03 * Math.sin(Math.PI * across) + 0.05 * smooth((k - 0.8) / 0.2) + 0.04 * (1 - smooth(k / 0.2));
      d.hand.position.set(a.position.x + (c.position.x - a.position.x) * across, a.position.y + lift, a.position.z + 0.02);
      d.hand.rotation.set(-0.45, 0, 0);
    }
  }

  /** The hand moves in, presses the envelope's face, and backs out again. */
  private runHint(delta: number): void {
    if (!this.hintHand) return;
    this.hintT = (this.hintT + delta) % HINT_LOOP_S;
    const k = this.hintT / HINT_LOOP_S;
    // In over the first half, a short press, then away.
    const reach = k < 0.45 ? k / 0.45 : k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    const ease = reach * reach * (3 - 2 * reach);
    this.hintHand.position.set(-0.135, 0.05 + 0.05 * (1 - ease), ENVELOPE_Z + 0.03 + 0.09 * (1 - ease));
    this.hintHand.rotation.x = -0.6;
  }

  /** Touching an animal in the line: it hops and its name shows above it. */
  private greet(e: Entity): void {
    if (this.phase !== 'menu') return;
    const a = this.line.find((l) => l.entity === e);
    const obj = e.object3D;
    if (!a || !obj || this.tweens.some((t) => t.obj === obj)) return;
    console.info(`[menu] hello ${a.species}`);
    const at = obj.position.clone();
    this.tween(obj, at, 0.45, 0.03, LINE_SCALE);
    this.pop(T.animal[a.species] ?? a.species.toUpperCase(), INK, undefined, at.clone().add(new Vector3(0, 0.1, 0.02)), 0.022);
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
    // The robot race, the main game, stands a little larger with a gold star.
    envelope.root.scale.setScalar(game === 'race' ? 1.18 : 1.05);
    if (game === 'race') {
      const star = makeStar(true);
      star.scale.setScalar(0.42);
      star.position.set(0.034, 0.02, 0.003);
      envelope.root.add(star);
    }
    envelope.root.rotation.x = -ENVELOPE_TILT;
    envelope.root.position.set(x, 0.035 * Math.cos(ENVELOPE_TILT), ENVELOPE_Z);
    const e = this.add(envelope.root);
    e.addComponent(MenuButton, { game });
    e.addComponent(PokeInteractable);
    e.addComponent(RayInteractable);
    // On the bottom pocket, below the flap's tip and seal: the paper label,
    // with a text card standing in until it has loaded.
    const sticker: UiName = game === 'race' ? 'menu_robot_race' : `menu_${game}`;
    placeUiImage(sticker, envelope.root, [0, -0.022, 0.0016], {
      scale: 0.85,
      maxWidth: 0.09,
      fallback: () => this.label(title, 0.018, envelope.root, -0.022, 0.0016, false).mesh,
    });
    this.envelopes.set(e, envelope);
  }

  private runOpening(delta: number): void {
    const o = this.opening;
    if (!o) return;
    o.t += delta;
    const k = Math.min(1, o.t / FLAP_S);
    // From resting on the pockets to just past upright, so it ends behind the letter.
    o.envelope.flap.rotation.x = ENVELOPE_FLAP_REST - (Math.PI + 0.2) * (k * k * (3 - 2 * k));
    const l = Math.min(1, Math.max(0, (o.t - FLAP_S) / LETTER_S));
    o.envelope.letter.visible = l > 0;
    o.envelope.letter.position.y = LETTER_RISE * l;
    if (o.t >= FLAP_S + LETTER_S + 0.15) {
      this.opening = undefined;
      this.start(o.choice);
    }
  }

  private addButton(game: ButtonChoice, title: string, x: number, color: number, scale = 1.3, labelH = 0.03): Object3D {
    const button = makeButton(color);
    button.name = `menu-${game}`;
    button.position.set(x, 0.0325 * scale, ENVELOPE_Z);
    button.scale.setScalar(scale);
    const e = this.add(button);
    e.addComponent(MenuButton, { game });
    e.addComponent(PokeInteractable);
    e.addComponent(RayInteractable);
    if (title === '') {
      // The caller writes on it (see addSettingCard).
    } else if (title === T.done) {
      placeUiImage('button_done', button, [0, 0, 0.002], {
        scale: 0.9,
        fallback: () => this.label(title, 0.022, button, 0, 0.002, false).mesh,
      });
    } else {
      // On the thin paper card, large enough to read from the seat.
      this.label(title, labelH / (scale / 1.3), button, 0, 0.002, false);
    }
    return button;
  }

  /**
   * A choice on a results screen: a coloured paper card cut to its word in
   * cream paper letters (see CHOICE_H), the letters the same size for every
   * choice. Returns the card and its width.
   */
  private addChoiceButton(choice: ButtonChoice, title: string, x: number, color: number): { button: Object3D; width: number } {
    const button = this.addButton(choice, '', x, color, 1);
    button.userData.choice = true;
    button.userData.shownAt = performance.now();
    button.userData.armed = false;
    const l = new Label(title.toUpperCase(), { height: CHOICE_TEXT_H, card: false, ink: 0xfff8ec });
    // The label's own width already holds a little paper either side of its letters.
    const width = l.mesh.scale.x + 2 * CHOICE_PAD;
    const sx = width / BUTTON_W;
    const sy = CHOICE_H / BUTTON_H;
    button.scale.set(sx, sy, 1);
    button.position.y = CHOICE_H / 2;
    // In a holder that undoes the card's uneven scale, so the letters keep their shape.
    const holder = new Group();
    holder.position.set(0, 0, 0.002);
    holder.scale.set(1 / sx, 1 / sy, 1);
    holder.add(l.mesh);
    button.add(holder);
    return { button, width };
  }

  /** Results choices side by side, centred, CHOICE_SPACE apart. */
  private addChoiceRow(choices: [ButtonChoice, string, number][]): void {
    const made = choices.map(([choice, title, color]) => this.addChoiceButton(choice, title, 0, color));
    const total = made.reduce((sum, m) => sum + m.width, 0) + CHOICE_SPACE * (made.length - 1);
    let left = -total / 2;
    for (const m of made) {
      m.button.position.x = left + m.width / 2;
      left += m.width + CHOICE_SPACE;
    }
  }

  /** A results choice takes a press only once up a while and approached from outside (see CHOICE_GRACE_MS). */
  private choiceReady(e: Entity): boolean {
    const obj = e.object3D;
    if (!obj?.userData.choice) return true;
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (performance.now() - (obj.userData.shownAt as number) < CHOICE_GRACE_MS) return false;
    return !immersive || obj.userData.armed === true;
  }

  /**
   * A settings card on the desk: a small caption on top and its value large
   * below ("LANGUAGE" over "ID"), so the value reads from the seat.
   */
  private addSettingCard(choice: ButtonChoice, caption: string, value: string, x: number, color: number, valueH = 0.034): Object3D {
    const button = this.addButton(choice, '', x, color, SETTINGS_SCALE);
    // Printed straight on the card (no paper of their own), the value about
    // as tall as HOME's letters and the caption as wide as the card allows.
    for (const [text, height, y] of [
      [caption, 0.016, 0.017],
      [value, valueH, -0.008],
    ] as const) {
      const l = new Label(text, { height, card: false });
      l.mesh.position.set(0, y, 0.002);
      button.add(l.mesh);
    }
    return button;
  }

  private start(choice: MenuChoice, resume?: RaceCheckpoint): void {
    this.phase = 'loading';
    // Started from the home page, the 3D menu (which puts the score on the desk) never showed.
    const desk = this.deskEntity()?.object3D;
    if (desk && !this.score.mesh.parent) desk.add(this.score.mesh);
    this.showTitle();
    this.clearMenu();
    this.played = 0;
    this.practiceRight = 0;
    this.practiceBase = this.practiceTotal;
    if (choice === 'race') {
      this.phase = 'loading';
      this.startRace(resume).then(() => this.addQuitCardSafely()).catch((error) => {
        console.error('[race] could not start', error);
        this.showMenu();
      });
      return;
    }
    this.kind = choice;
    this.phase = 'playing';
    // Practice keeps its own running score where the title stood.
    this.score.set(T.points(0));
    this.spawnPractice();
    this.addQuitCardSafely();
  }

  // ------------------------------------------------------------ Race

  /** The game's clock in ms: wall time without the time spent paused. */
  private now(): number {
    return (this.pausedAt ?? Date.now()) - this.pausedTotal;
  }

  /**
   * Stops the game while the player is away (headset off, system menu open)
   * and picks up where it left off: the race clock, the answer timer and
   * everything moving on the desk wait. This suits play against robots on
   * this headset; a race against other students will keep the server's
   * clock, which one player cannot stop for everyone.
   */
  private pauseWhileAway(): void {
    const state = this.world.visibilityState.peek();
    const away = state === VisibilityState.Hidden || state === VisibilityState.VisibleBlurred;
    if (away && this.pausedAt === undefined) {
      this.pausedAt = Date.now();
      this.pausedPerf = performance.now();
      console.info(`[game] paused (${state})`);
    } else if (!away && this.pausedAt !== undefined) {
      const ms = Date.now() - this.pausedAt;
      this.pausedTotal += ms;
      this.shownAt += performance.now() - this.pausedPerf;
      this.pausedAt = undefined;
      console.info(`[game] resumed after ${(ms / 1000).toFixed(1)} s`);
    }
  }

  private async startRace(resume?: RaceCheckpoint): Promise<void> {
    const race = await Race.create(resume ? resume.seed : Date.now() >>> 0, BOT_NAMES);
    this.race = race;
    this.raceScene = new RaceScene(this.stage, this.deskEntity()!.object3D!, BOT_NAMES);
    this.recapIn = -1;
    if (resume) {
      // The same race, rebuilt call by call, with the game clock where it
      // stood: the break before the next round, which then starts as usual.
      race.replay(resume.calls);
      this.pausedAt = undefined;
      this.pausedTotal = Date.now() - resume.now;
      this.raceRound = resume.next - 2;
      this.roundStartPoints = this.racePoints();
      console.info(`[race] picked up again before round ${resume.next}, ${resume.calls.length} calls replayed`);
    } else {
      clearCheckpoint();
      race.start(this.now());
    }
    // The scoreboard takes the place of the single score line during a race.
    this.score.mesh.visible = false;
    this.refreshRace();
    if (resume) this.raceScene.restoreCard(resume.card);
    this.phase = 'playing';
  }

  /** Keeps what this race needs to pick up again from round `next` (1-based). */
  private saveCheckpoint(next: number): void {
    if (!this.race || !this.raceScene) return;
    const cp: RaceCheckpoint = {
      v: 1,
      seed: this.race.seed,
      calls: this.race.calls,
      now: this.now(),
      savedAt: Date.now(),
      next,
      card: this.raceScene.cardSnapshot(),
    };
    try {
      localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
    } catch (error) {
      // Full or blocked storage: the race simply cannot be picked up again.
      console.warn('[race] checkpoint not kept', error);
    }
  }

  private updateRace(delta: number): void {
    const race = this.race;
    const scene = this.raceScene;
    if (!race || !scene) return;
    scene.update(delta);
    const ends = this.raceState?.ends_at_ms ?? null;
    this.camera.getWorldPosition(scene.eye);
    scene.clock(ends === null || this.phase === 'recap' ? null : ends - this.now());
    if (this.recapIn > 0) {
      this.recapIn -= delta;
      if (this.recapIn <= 0) this.showRecap();
    }
    this.racePoll -= delta;
    if (this.racePoll > 0 || this.phase === 'recap') return;
    this.racePoll = RACE_POLL_S;
    const events = race.tick(this.now());
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

  /**
   * An answer that arrives just after the round's clock ran out is refused by
   * the core; the creature has already gone home, so the desk simply clears.
   */
  private raceAnswer(answer: () => RaceVerdict): RaceVerdict | undefined {
    try {
      return answer();
    } catch (error) {
      console.info('[race] answer after time up, not counted:', String(error));
      this.clearPlay();
      if (this.phase === 'between') this.phase = 'playing';
      return undefined;
    }
  }

  private refreshRace(): void {
    if (!this.race) return;
    this.raceState = this.race.view();
    this.raceScene?.show(this.raceState);
  }

  /** The player's race points right now. */
  private racePoints(): number {
    return this.race?.view().desks[0]?.points ?? 0;
  }

  /** A round begins: the race card marks it as on and its points count from here. */
  private beginRound(index: number): void {
    // The card is made from the view, so it exists before its first round is marked.
    this.refreshRace();
    this.raceRound = index;
    this.roundStartPoints = this.racePoints();
    this.raceScene?.roundOn(index);
  }

  /** The animal on the desk got away (time up, or a last wrong answer): a white stamp on the card. */
  private stampMissed(): void {
    if (!this.race || !this.offer) return;
    this.raceScene?.stamp(this.raceRound, this.species, accentForSkill(this.offer.skill), false);
  }

  private onRaceEvent(ev: RaceEvent): void {
    const scene = this.raceScene!;
    switch (ev.type) {
      case 'wave_start': {
        const total = this.raceState?.waves ?? 3;
        // The paper banners read "WAVE n OF 3"; other lengths keep the text card.
        const paper: UiName[] = total === 3 ? [`race_wave_${ev.wave + 1}` as UiName] : [];
        scene.showBanner(`${T.wave(ev.wave + 1, total)}: ${T.gameName[ev.game]}`, 2.5, paper);
        this.beginRound(ev.wave);
        break;
      }
      case 'bot_working':
        scene.working(ev.desk, ev.prompt[getLang()]);
        break;
      case 'bot_answer':
        scene.answered(ev.desk, ev.correct);
        break;
      case 'emote':
        scene.emote(ev.desk, ev.emote);
        break;
      case 'boss_start':
        scene.showBanner(T.bossRound, 3, ['race_boss_round', 'race_double_points']);
        this.beginRound(this.raceState?.waves ?? 3);
        break;
      case 'match_end':
        this.recapIn = RECAP_DELAY_S;
        break;
      case 'time_up':
        scene.timeUp();
        scene.showBanner(T.timeUp, 2, ['race_times_up']);
        // A creature still open when the clock ran out goes home unanswered.
        if (ev.player_cut) {
          this.stampMissed();
          this.clearPlay();
          if (this.phase === 'between') this.phase = 'playing';
        }
        scene.roundDone(this.raceRound, this.racePoints() - this.roundStartPoints);
        // Between rounds the race can be left and picked up again from the next.
        if (this.raceRound + 1 < (this.raceState?.plan?.length ?? 0)) this.saveCheckpoint(this.raceRound + 2);
        break;
    }
  }

  private showRecap(): void {
    if (!this.race || !this.raceScene) return;
    const recap = this.race.recap();
    console.info('[race] recap', JSON.stringify(recap));
    clearCheckpoint();
    this.saveAnswers();
    this.phase = 'recap';
    this.clearPlay();
    this.removeQuitCard();
    this.raceScene.showRecap(recap, T.you);
    const own = recap.players.find((p) => !p.bot);
    if (own) this.saveBest(own.points, own.stars);
    this.addChoiceButton('done', T.done, 0, 0x3469c4);
  }

  private endRace(): void {
    this.clear(this.queries.buttons);
    this.clearPlay();
    this.clearPracticeCards();
    this.raceScene?.dispose();
    this.raceScene = undefined;
    this.race?.free();
    this.race = undefined;
    this.raceState = undefined;
    this.score.set(T.title);
    this.score.mesh.visible = true;
    this.backToMenu();
  }

  /**
   * The end of a practice: what it came to, and two buttons, PRACTICE AGAIN
   * and Done. It waits for the player instead of leaving by itself.
   */
  private showPracticeDone(points: number): void {
    this.phase = 'recap';
    this.removeQuitCard();
    this.saveAnswers();
    console.info(`[game] practice done: ${this.practiceRight} of ${WAVE}, ${points} points`);
    const desk = this.deskEntity()?.object3D;
    if (!desk) {
      this.backToMenu();
      return;
    }
    const title = new Label(T.practiceDone, { height: 0.044 * textScale(), ink: QUESTION_INK, question: true });
    title.mesh.position.set(0, 0.29, 0.02);
    const line = new Label(T.practiceScore(this.practiceRight, WAVE, points), { height: 0.03 * textScale() });
    line.mesh.position.set(0, 0.235, 0.02);
    for (const l of [title, line]) {
      desk.add(l.mesh);
      this.labels.add(l.mesh);
      this.practiceCards.push(l.mesh);
    }
    this.addChoiceRow([
      ['again', T.again, 0x3fb6a0],
      ['games', T.otherGame, 0xe8b64c],
      ['done', T.done, 0x3469c4],
    ]);
  }

  private clearPracticeCards(): void {
    for (const c of this.practiceCards) {
      c.removeFromParent();
      this.labels.delete(c);
    }
    this.practiceCards = [];
  }

  /** After a game: the home page outside the headset, the envelopes in it. */
  private backToMenu(): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.phase = 'menu';
      this.wantHome = true;
    } else {
      this.showMenu();
    }
  }

  /**
   * A pressed card sinks into the desk side a few millimetres and comes back,
   * so a press (touch, trigger or click) shows as one, apart from a hover.
   */
  private dip(obj: Object3D): void {
    if (obj.userData.dipping) return;
    obj.userData.dipping = true;
    // Along the card's own facing, so a card turned to the player sinks straight back.
    obj.translateZ(-PRESS_DIP_M);
    setTimeout(() => {
      obj.translateZ(PRESS_DIP_M);
      obj.userData.dipping = false;
    }, PRESS_DIP_MS);
  }

  /**
   * Whether a press on a desk card was meant. A click outside the headset and
   * a fingertip of a tracked hand always are. With controllers, IWSDK also
   * counts the controller passing through a card as a poke, which a hand
   * swinging past does by accident (and the emulator's controllers move with
   * the mouse): there only a press with a trigger held counts, as a ray click is.
   */
  private pressMeant(): boolean {
    if (!this.controllersOnly()) return true;
    const pads = this.input.xr.gamepads;
    return Boolean(pads.right?.getSelecting() || pads.left?.getSelecting());
  }

  /** A QUIT card over the race card while a game is on in the headset (see QUIT_POS). */
  private addQuitCard(): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    this.removeQuitCard();
    const button = this.addButton('quit', '', 0, 0xfff8ec, 1);
    button.position.copy(QUIT_POS);
    button.rotation.y = QUIT_YAW;
    button.scale.set(QUIT_SCALE.x, QUIT_SCALE.y, 1);
    // Approached from outside and up a while before it takes a press, like the results choices.
    button.userData.choice = true;
    button.userData.shownAt = performance.now();
    button.userData.armed = false;
    this.quitLabel = new Label(T.quit, { height: QUIT_TEXT_H, card: false });
    // In a holder that undoes the card's uneven scale, so the letters keep their shape
    // (the label sizes itself with its own mesh scale).
    const holder = new Group();
    holder.position.set(0, 0, 0.002);
    holder.scale.set(1 / QUIT_SCALE.x, 1 / QUIT_SCALE.y, 1);
    holder.add(this.quitLabel.mesh);
    button.add(holder);
    this.quitAskedAt = 0;
  }

  /** The QUIT card is a convenience: if it cannot be made, the game goes on without it. */
  private addQuitCardSafely(): void {
    try {
      this.addQuitCard();
    } catch (error) {
      console.error('[game] the QUIT card could not be made', error);
      this.removeQuitCard();
    }
  }

  private removeQuitCard(): void {
    for (const e of [...this.queries.buttons.entities]) if (e.getValue(MenuButton, 'game') === 'quit') this.remove(e);
    this.quitLabel = undefined;
  }

  /** First press asks (SURE?), a second within QUIT_ASK_MS leaves the game for the desk menu. */
  private pressQuit(e: Entity): void {
    const playing = this.phase === 'playing' || this.phase === 'between' || this.phase === 'opening' || (this.phase === 'loading' && this.race);
    if (!playing || !this.choiceReady(e)) return;
    const obj = e.object3D;
    if (!obj) return;
    const now = performance.now();
    if (now - this.quitAskedAt > QUIT_ASK_MS) {
      this.quitAskedAt = now;
      // The same finger has to come in again for the second press.
      obj.userData.armed = false;
      this.quitLabel?.set(T.quitSure);
      obj.getWorldPosition(this.a);
      this.pop(T.quitAgain, QUESTION_INK, undefined, this.a.clone().add(new Vector3(0, 0.07, 0)), 0.02);
      const asked = this.quitAskedAt;
      setTimeout(() => {
        if (this.quitAskedAt === asked) this.quitLabel?.set(T.quit);
      }, QUIT_ASK_MS);
      return;
    }
    console.info(`[game] quit from the desk while ${this.phase}`);
    this.quitAskedAt = 0;
    this.removeQuitCard();
    if (this.race) {
      this.endRace();
      return;
    }
    this.opening = undefined;
    this.clearPlay();
    this.score.set(T.title);
    this.showMenu();
  }

  /** The HOME card in the headset: end the session; the home page shows once it has ended. */
  private leaveToHome(): void {
    this.clearMenu();
    this.pendingXr = undefined;
    this.wantHome = true;
    void this.world.exitXR();
  }

  /** A choice on the home page: play here, or open the headset session first. */
  private homePlay(mode: PlayMode, device: Device): void {
    if (this.phase !== 'menu') return;
    this.wantHome = false;
    if (device === 'xr') {
      this.pendingXr = mode;
      Promise.resolve(this.world.launchXR()).catch((error) => {
        console.warn('[xr] the headset session did not start', error);
        this.pendingXr = undefined;
        this.wantHome = true;
        this.home.xrFailed();
      });
      return;
    }
    if (mode === 'race') this.start('race');
    else if (mode === 'resume') this.resumeRace();
    else this.showMenu('practice');
  }

  /** Picks up the race kept on this device, or starts a new one if it has gone stale meanwhile. */
  private resumeRace(): void {
    const cp = readCheckpoint();
    this.start('race', cp ?? undefined);
  }

  /** OTHER GAME over the browser game, or on a practice's results: leave the practice for its envelopes. */
  private otherGame(): void {
    if (this.race) return;
    console.info(`[game] other game chosen while ${this.phase}`);
    this.removeQuitCard();
    this.clearPracticeCards();
    this.clear(this.queries.buttons);
    this.opening = undefined;
    this.clearPlay();
    this.score.set(T.title);
    this.showMenu('practice');
  }

  /** The Home button over the browser game: leave whatever is on and go back. */
  private goHome(): void {
    if (this.race || this.phase === 'recap') {
      this.endRace();
    } else {
      this.clearMenu();
      this.opening = undefined;
      this.clearPlay();
      this.score.set(T.title);
    }
    this.phase = 'menu';
    this.wantHome = true;
  }

  /** Shows the home page while choosing, outside the headset, and keeps the 3D menu off it. */
  private runHome(): void {
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    // Leaving the headset brings the home page back once the game is over.
    if (this.wasImmersive && !immersive && this.phase === 'menu') this.wantHome = true;
    this.wasImmersive = immersive;
    const home = !immersive && this.phase === 'menu' && this.wantHome;
    // The loading screen in index.html goes once there is something to see.
    if (!this.bootGone && (home || immersive || this.phase !== 'loading')) {
      this.bootGone = true;
      (window as unknown as { numeriaBootProgress?: (p: number) => void }).numeriaBootProgress?.(100);
      const boot = document.getElementById('boot');
      boot?.classList.add('gone');
      setTimeout(() => boot?.remove(), 600);
      // The race and results images now, one by one, while the player looks around.
      void prefetchUi();
    }
    if (home) {
      if (this.queries.buttons.entities.size > 0) this.clearMenu();
      this.home.show();
      if (this.line.length === 0 && this.deskEntity()) this.syncLine(this.lineFrom);
    } else {
      this.home.hide(!immersive && this.phase !== 'loading');
    }
    // A practice in the browser can be left for another game (in the headset QUIT does it).
    const practising =
      !this.race && (this.phase === 'playing' || this.phase === 'between' || (this.phase === 'opening' && this.opening?.choice !== 'race'));
    this.home.setOtherGame(practising);
    // The page has its own title; the 3D title and score come back after it.
    if (home !== this.homeWasShown) {
      this.homeWasShown = home;
      if (home) {
        if (this.title) this.title.visible = false;
        this.score.mesh.visible = false;
      } else {
        this.showTitle();
      }
    }
  }

  private clearPlay(): void {
    // Leaving mid-demo (Home, the end of a race) does not count as seen.
    this.endDemo(false);
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

  /** The offer the front of the line is waiting for. */
  private lineFrom = 1;

  /**
   * Places along the line for animals of these widths: front on the right,
   * each one beside the next with a small gap, the whole line centred.
   */
  private linePlaces(widths: number[]): Vector3[] {
    const total = widths.reduce((sum, w) => sum + w, 0) + LINE_SPACE * (widths.length - 1);
    let right = total / 2;
    return widths.map((w) => {
      const at = new Vector3(right - w / 2, 0.023, LINE_Z);
      right -= w + LINE_SPACE;
      return at;
    });
  }

  /**
   * Makes the line show the animals for offers `from` to `from + 4`, as they
   * stand; rebuilt at once only when it does not match.
   */
  private syncLine(from: number): void {
    this.lineFrom = from;
    const want = Array.from({ length: LINE_SIZE }, (_, k) => speciesFor(from + k));
    if (this.line.length === LINE_SIZE && this.line.every((a, k) => a.species === want[k] && a.offerId === from + k)) return;
    for (const a of this.line) this.remove(a.entity);
    this.line = want.map((species, k) => this.lineAnimal(species, from + k));
    const places = this.linePlaces(this.line.map((a) => a.width));
    this.line.forEach((a, k) => a.entity.object3D!.position.copy(places[k]));
  }

  /** A white paper animal for the line, measured so the line can space it. */
  private lineAnimal(species: Species, offerId: number): LineAnimal {
    const fig = makeFoldling(LINE_PAPER, species);
    for (const c of fig.root.getObjectByName('flag_anchor')?.children ?? []) c.visible = false;
    fig.root.name = `line-${species}`;
    fig.root.rotation.y = 0;
    fig.root.scale.setScalar(LINE_SCALE);
    fig.root.updateMatrixWorld(true);
    const size = new Box3().setFromObject(fig.root).getSize(new Vector3());
    const entity = this.add(fig.root);
    entity.addComponent(LineTap);
    entity.addComponent(PokeInteractable);
    entity.addComponent(RayInteractable);
    return { species, entity, offerId, width: size.x };
  }

  /**
   * The front animal leaves the line to bring offer `offerId`; the others
   * step up and a new one joins at the back. Returns where the caller should
   * start the creature.
   */
  private callFromLine(offerId: number): Vector3 {
    this.syncLine(offerId);
    const front = this.line.shift()!;
    const from = front.entity.object3D!.position.clone();
    this.remove(front.entity);
    const next = offerId + LINE_SIZE;
    const joiner = this.lineAnimal(speciesFor(next), next);
    this.line.push(joiner);
    const places = this.linePlaces(this.line.map((a) => a.width));
    const obj = joiner.entity.object3D!;
    obj.position.copy(places[LINE_SIZE - 1]).add(new Vector3(-joiner.width, 0, 0));
    obj.scale.setScalar(0.001);
    this.line.forEach((a, k) => {
      if (a.entity.object3D) this.tween(a.entity.object3D, places[k], 0.6, 0.012, LINE_SCALE);
    });
    this.lineFrom = offerId + 1;
    return from;
  }

  private spawnOffer(offer: Offer | RaceOffer): void {
    this.offer = offer;
    this.kind = offer.game;
    const boss = 'boss' in offer && offer.boss;
    console.info(
      `[game] offer ${offer.offer_id} ${offer.game} ${offer.prompt.en} | ` +
        (offer.game === 'orb_forge'
          ? `target ${offer.target?.text} crystals ${offer.crystals.map((c) => c.text).join(', ')}`
          : `balloons ${offer.balloons.map((b) => b.text).join(', ')}`) +
        (boss ? ' | boss' : ''),
    );
    const color = boss ? 0x6d597a : accentForSkill(offer.skill);
    this.species = boss ? 'elephant' : speciesFor(offer.offer_id);
    const figure = makeFoldling(color, this.species);
    this.figure = figure;
    const { root } = figure;
    // It steps out of the front of the line behind the book.
    const from = this.callFromLine(offer.offer_id);
    root.rotation.y = CREATURE_YAW;
    root.scale.setScalar(LINE_SCALE);
    root.position.copy(from);
    const e = this.add(root);
    e.addComponent(Creature, { offerId: offer.offer_id });
    // The card above the creature says what to do: the question in Balloon
    // Burst, the number to build in Orb Forge. The first few creatures of a
    // game also get a how-to line.
    this.clearPrompt();
    const seen = this.seen[offer.game]++;
    const target = offer.target?.text ?? '';
    const card =
      offer.game === 'balloon_burst' ? offer.prompt[getLang()] : seen < HINTED ? T.orbFirst(target) : T.orbTask(target);
    const desk = this.deskEntity()!.object3D!;
    this.prompt = new Label(card, { height: 0.036 * textScale(), ink: QUESTION_INK, question: true });
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
      // A different game came up while a how-to ran: that one is over.
      if (this.demo && this.demo.game !== offer.game) this.endDemo(true);
      this.startDemo(offer.game);
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
      g.position.set(0, BOB_LOW, BALLOON_Z);
      g.scale.setScalar(0.001);
      const e = this.add(g);
      e.addComponent(Balloon, { index: i });
      g.userData.balloon = e;
      e.addComponent(PokeInteractable);
      this.clickable(e);
      // The answer card hangs on the balloon's string, below it, so the
      // balloon never covers the number; a taller fraction card hangs lower.
      this.label(b.text, 0.034 * textScale(), g, BALLOON_TAG_TOP.y, BALLOON_TAG_TOP.z, true, 'top');
      // The first rise is staggered so the balloons do not all come up together.
      this.launch(g, n, i, 0.2);
    });
  }

  private showCrystals(offer: Offer, keepOrbs = false): void {
    if (!keepOrbs) this.clear(this.queries.orbs);
    this.clear(this.queries.crystals);
    this.selected = undefined;
    const n = offer.crystals.length;
    offer.crystals.forEach((c, i) => {
      const m = makeCrystal(CRYSTAL_COLORS[i % CRYSTAL_COLORS.length], i);
      m.name = `crystal-${i}`;
      m.position.set((i - (n - 1) / 2) * CRYSTAL_GAP, CRYSTAL_HALF, CRYSTAL_Z);
      const e = this.add(m);
      e.addComponent(Crystal, { index: i });
      e.addComponent(OneHandGrabbable);
      this.addRayTarget(e);
      this.clickable(e);
      // A price card standing on the table in front of the cluster, leaning
      // back a little. It does not turn to the head, so its top edge can
      // never swing into the paper; a taller fraction card grows upwards.
      const tag = this.label(c.text, CRYSTAL_TAG_H * textScale(), m, 0.001 - CRYSTAL_HALF, 0, false, 'bottom');
      tag.mesh.rotation.x = -CRYSTAL_TAG_LEAN;
      tag.mesh.position.z = (m.userData.front as number) + 0.004 + CRYSTAL_TAG_H * textScale() * 1.5 * Math.sin(CRYSTAL_TAG_LEAN);
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
    // The player has done it once: the how-to has done its job.
    this.endDemo(true);
    const index = e.getValue(Balloon, 'index') as number;
    this.lastBalloon = index;
    const timeMs = performance.now() - this.shownAt;
    let verdict: Verdict | RaceVerdict;
    if (this.race) {
      const v = this.raceAnswer(() => this.race!.answerBalloon(this.offer!.offer_id, index, timeMs, this.now()));
      if (!v) return;
      verdict = v;
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
    this.endDemo(true);
    const timeMs = performance.now() - this.shownAt;
    let verdict: Verdict | RaceVerdict;
    if (this.race) {
      const v = this.raceAnswer(() => this.race!.answerOrb(this.offer!.offer_id, picks, timeMs, this.now()));
      if (!v) return;
      verdict = v;
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

  /** Writes the answers just judged to the device before anything else happens. */
  private saveAnswers(): void {
    const mode = this.race ? 'race' : 'practice';
    const events = this.race ? this.race.drainEvents() : (this.core?.drainEvents() ?? []);
    if (events.length === 0) return;
    if (this.store) void this.store.record(events, mode);
    else this.unsaved.push({ events, mode });
  }

  private afterVerdict(v: Verdict | RaceVerdict): void {
    this.saveAnswers();
    if (!this.race) this.practiceTotal = v.total_points;
    if (!v.correct) {
      if (v.retry_allowed) this.pop(T.tryAgain, WRONG_INK, 'feedback_try_again');
      else this.pop(T.itWas(v.expected_text), WRONG_INK);
    }
    if (v.correct || !v.retry_allowed) {
      this.timing = false;
      this.timerBar.visible = false;
    }
    // Practice points go up when the creature reaches them (see `foldHome`).
    if (this.race) this.refreshRace();
    else if (!v.correct) this.score.set(T.points(v.total_points - this.practiceBase));
    const creature = this.creature();
    if (!creature) return;
    const obj = creature.object3D!;
    if (v.correct) {
      if (!this.race) this.practiceRight += 1;
      this.figure?.mark?.('right');
      this.solveCard();
      this.clear(this.queries.balloons);
      this.clear(this.queries.crystals);
      this.clear(this.queries.orbs);
      const gained = 'race_points' in v ? v.race_points : v.points;
      this.foldHome(creature, this.offer ? accentForSkill(this.offer.skill) : 0xffffff, gained, v.total_points);
      return;
    }
    // Wrong: the flag turns red and the creature bounces. With a second try
    // it stays; otherwise it leaves.
    this.figure?.mark?.('wrong');
    if (!this.figure?.play('bounce', true)) this.tween(obj, obj.position.clone(), 0.25, 0.04, 1);
    if (!v.retry_allowed) {
      this.clear(this.queries.balloons);
      this.clear(this.queries.crystals);
      this.clear(this.queries.orbs);
      this.prompt?.set(this.prompt.value.replace('?', v.expected_text));
      this.stampMissed();
      this.phase = 'between';
      // Missed twice: it walks home without points.
      this.tween(obj, EXIT, 1.4, 0.02, 0.2, () => {
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
    const solved = new Label(text, { height: 0.036 * textScale(), ink: RIGHT_INK, question: true });
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
   * Feedback that rises beside the creature and fades: the points of a right
   * answer in green, "Try again!" or the right answer in red. It rises on the
   * right, clear of the flag, whose cloth trails to the left of the pole and
   * turns red or green with the answer.
   */
  /** `paper`: a paper banner to show instead of the text card, once loaded. */
  private pop(text: string, ink: number, paper?: UiName, at?: Vector3, height = 0.034): void {
    const mesh = (paper && uiImage(paper, 0.9)) || new Label(text, { height, ink }).mesh;
    mesh.name = 'feedback-pop';
    const holder = new Group();
    holder.name = 'feedback-pop';
    holder.position.copy(at ?? STAND.clone().add(new Vector3(0.11, 0.09, 0.02)));
    holder.add(mesh);
    this.labels.add(mesh);
    const entity = this.add(holder);
    this.tween(holder, holder.position.clone().add(new Vector3(0, 0.07, 0)), POP_S, 0, 1);
    this.pops.push({ entity, mesh, t: 0 });
  }

  /**
   * Highest origin height (desk frame) at which a balloon's top stays below
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
    return Math.max(MIN_CEILING, Math.min(RISE_TO, line - SIGHT_MARGIN - BALLOON_H + FADE_PAST_M));
  }

  /**
   * Puts balloon `index` of `count` in a lane no other balloon is using, at
   * its own height along the climb; after `wait` seconds it starts rising.
   */
  private launch(obj: Object3D, count: number, index: number, wait: number): void {
    const taken = new Set<number>();
    for (const e of this.queries.balloons.entities) {
      const lane = e.object3D?.userData.rise?.lane as number | undefined;
      if (e.object3D !== obj && lane !== undefined) taken.add(lane);
    }
    const free = [...Array(BALLOON_LANES).keys()].filter((l) => !taken.has(l));
    const lane = free[Math.floor(Math.random() * free.length)] ?? 0;
    const drift: Drift = {
      lane,
      wait,
      count,
      t: 0,
      // Metres per second, each balloon at its own pace.
      rate: RISE_SPEED * (0.8 + 0.4 * Math.random()),
      // Spread along the climb, so they never all start over together.
      phase: (index + 0.3 * Math.random()) / count,
    };
    obj.userData.rise = drift;
    obj.position.set((lane - (BALLOON_LANES - 1) / 2) * BALLOON_GAP, BOB_LOW, BALLOON_Z);
    obj.scale.setScalar(0.001);
  }

  /**
   * Marks what the player is about to act on: pointed at (mouse or hand ray)
   * or within reach of a fingertip. Envelopes, the Done card and crystals
   * grow a little; balloons grow and hold still (in `floatBalloons`).
   */
  private hoverTargets(delta: number): void {
    const step = Math.min(1, delta * HOVER_RATE);
    const immersive = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const controllers = this.wasControllers;
    const near = (obj: Object3D) => {
      if (!immersive) return false;
      obj.getWorldPosition(this.a);
      return this.tipPos.some((t) => t.distanceTo(this.a) < HOVER_REACH);
    };
    const nearBalloon = (obj: Object3D) => {
      if (!immersive) return false;
      this.a.set(0, BALLOON_MIDDLE, 0);
      obj.localToWorld(this.a);
      return this.tipPos.some((t) => t.distanceTo(this.a) < BALLOON_REACH);
    };
    const ease = (e: Entity, apply: boolean) => {
      const obj = e.object3D;
      if (!obj) return;
      let on: boolean;
      if (e.hasComponent(Balloon)) {
        if (!immersive || controllers) {
          // Pointed at with the mouse, or with a controller's ray: it waits under the
          // pointer (and grows a little) for as long as it is pointed at, so the
          // cursor stays on it until the click.
          on = e.hasComponent(Hovered);
        } else {
          // A fingertip at the envelope, for a while: a hand resting there must not hold it forever.
          on = nearBalloon(obj);
          const held = on ? ((obj.userData.held as number | undefined) ?? 0) + delta : 0;
          obj.userData.held = held;
          if (held > BALLOON_HOLD_S) on = false;
        }
      } else {
        // A crystal under a controller's ray is hovered through its box (addRayTarget).
        const rayTarget = obj.userData.rayTarget as Entity | undefined;
        on = e.hasComponent(Hovered) || !!rayTarget?.hasComponent(Hovered) || near(obj);
      }
      obj.userData.hovered = on;
      if (obj.userData.choice) {
        // No growing towards the finger: that is what pressed it by itself.
        obj.getWorldPosition(this.a);
        if (this.tipPos.every((t) => t.distanceTo(this.a) > CHOICE_ARM_M)) obj.userData.armed = true;
        return;
      }
      const h = (obj.userData.hover as number | undefined) ?? 0;
      const next = h + ((on ? 1 : 0) - h) * step;
      obj.userData.hover = next;
      if (!apply || this.tweens.some((t) => t.obj === obj)) return;
      obj.userData.hoverBase ??= obj.scale.x;
      obj.scale.setScalar((obj.userData.hoverBase as number) * (1 + HOVER_GROW * next));
    };
    for (const e of this.queries.balloons.entities) ease(e, false);
    for (const e of this.queries.buttons.entities) ease(e, true);
    for (const e of this.queries.crystals.entities) ease(e, !e.hasComponent(Grabbed) && e !== this.pulled?.e);
  }

  /**
   * Balloons rise in their own lanes from just above the table to the line
   * of sight to the question, and on reaching it come up again from the
   * bottom straight away: a quick fade at the top, a quick grow at the
   * bottom. Each starts at a different height, so the others stay in view
   * while one starts over. A balloon held by a pointer or fingertip pauses
   * (see `hoverTargets`).
   */
  private floatBalloons(delta: number): void {
    const ceiling = this.balloonCeiling();
    const top = Math.max(BOB_LOW + 0.05, ceiling - FADE_PAST_M);
    const span = top - BOB_LOW;
    for (const e of this.queries.balloons.entities) {
      const obj = e.object3D;
      const r = obj?.userData.rise as Drift | undefined;
      if (!obj || !r || this.tweens.some((t) => t.obj === obj)) continue;
      if (r.wait > 0) {
        r.wait -= delta;
        continue;
      }
      const hover = (obj.userData.hover as number | undefined) ?? 0;
      if (!obj.userData.hovered) r.t += (delta * r.rate) / span;
      // Where it is in its climb, 0 at the bottom and 1 at the top.
      const k = (r.t + r.phase) % 1;
      obj.position.y = BOB_LOW + span * k;
      const grow = Math.min(1, (k * span) / RISE_GROW_M);
      const fade = Math.min(1, ((1 - k) * span) / RISE_FADE_M);
      if (obj.userData.opacity !== fade) {
        obj.userData.opacity = fade;
        setOpacity(obj, fade);
      }
      obj.scale.setScalar(Math.max(0.001, grow) * (1 + HOVER_GROW * hover));
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
  private foldHome(creature: Entity, color: number, gained: number, total: number): void {
    this.phase = 'between';
    const obj = creature.object3D!;
    const cheer = this.figure?.play('cheer', true);
    if (!cheer) {
      this.fly(creature, color);
      return;
    }
    // A tween that stays in place waits out the cheer, then the creature
    // floats up to the points and the points go up as it arrives.
    // In a race it flies to its own stamp on the race card instead.
    const round = this.raceRound;
    const species = this.species;
    this.tween(obj, obj.position.clone(), cheer.getClip().duration, 0, obj.scale.x, () => {
      const to = (this.race && this.raceScene?.stampTarget(round)) || (this.race ? BOARD_AT : SCORE_AT);
      this.figure?.play('idle');
      this.tween(obj, to, TO_SCORE_S, 0.05, this.creatureScale * 0.2, () => {
        this.remove(creature);
        if (this.race) this.raceScene?.stamp(round, species, color, true);
        if (!this.race) this.score.set(T.points(total - this.practiceBase));
        // A small +N rises beside the points (in a race, just above the stamp it became) and fades.
        const beside = this.race ? new Vector3(0, 0.03, 0.02) : new Vector3(0.11, 0, 0.01);
        this.pop(`+${gained}`, RIGHT_INK, undefined, to.clone().add(beside), this.race ? 0.018 : 0.024);
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
      const points = Number.parseInt(this.score.value, 10) || 0;
      this.saveBest(points, 0);
      this.showPracticeDone(points);
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

  /**
   * In the browser the welcome card sits over the left of the view, where a
   * robot window stands during play; it shows only while choosing a game.
   */
  private showWelcomeInMenuOnly(): void {
    // The home page replaced the welcome card.
    const show = false;
    if (show === this.welcomeShown) return;
    // A screen-space panel is drawn from its own list, whatever its object's
    // visibility, so the card's root element is taken out of the layout.
    const root = this.world.getSceneObject<UIKitMLAsset>('welcome-panel')?.getElementById('welcome-root');
    if (!root) return;
    root.setProperties({ display: show ? 'flex' : 'none' });
    this.welcomeShown = show;
  }

  update(delta: number): void {
    if (this.pausedAt !== undefined) return;
    // Hands put down or picked up mid-game: balloons follow (touch or trigger click).
    const controllers = this.controllersOnly();
    if (controllers !== this.wasControllers) {
      this.wasControllers = controllers;
      for (const b of this.queries.balloons.entities) if (b.hasComponent(PokeInteractable)) this.setClickable(b);
      if (!controllers && this.world.visibilityState.peek() !== VisibilityState.NonImmersive) this.unselect();
      this.pointRays(controllers);
    }
    // IWSDK turns the near touch pointer on again whenever something touchable appears.
    if (controllers) for (const side of SIDES) this.input.xr.multiPointers[side].toggleSubPointer('touch', false);
    this.showWelcomeInMenuOnly();
    showStickerBackings(this.world.visibilityState.peek() !== VisibilityState.NonImmersive);
    const desk = this.deskEntity();
    const placed = !!desk?.getValue(DeskRoot, 'placed');
    this.runHome();
    const onHome = this.home.visible;
    if (this.phase === 'menu' && placed && this.pendingXr && this.world.visibilityState.peek() !== VisibilityState.NonImmersive) {
      const mode = this.pendingXr;
      this.pendingXr = undefined;
      if (mode === 'race') this.start('race');
      else if (mode === 'resume') this.resumeRace();
      else this.showMenu('practice');
    } else if (this.phase === 'menu' && placed && !onHome && this.queries.buttons.entities.size === 0 && this.queries.creatures.entities.size === 0) {
      this.showMenu();
    }
    this.trackTips(delta);
    this.runTweens(delta);
    for (const m of mixers) m.update(delta);
    if (this.phase === 'opening') this.runOpening(delta);
    this.runTimer();
    this.runPops(delta);
    this.runHint(delta);
    this.runDemo(delta);
    this.hoverTargets(delta);
    this.floatBalloons(delta);
    if (this.race) this.updateRace(delta);

    // Labels always face the camera that renders them (the head in XR,
    // the browser camera outside it).
    this.camera.getWorldPosition(this.head);
    for (const m of this.labels) if (m.parent) m.lookAt(this.head);
    // The question breathes while it waits, so the eye finds it.
    if (this.prompt && this.phase === 'playing') {
      const k = 0.5 - 0.5 * Math.cos((performance.now() / 1000 / PROMPT_PULSE_S) * Math.PI * 2);
      this.prompt.pulse(1 + PROMPT_PULSE * k);
    }

    this.clickAimedBalloon();
    this.runPull(delta);
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
    const pulled = this.pulled ? [this.pulled.e] : [];
    for (const held of [...this.queries.heldCrystals.entities, ...this.queries.heldOrbs.entities, ...pulled]) {
      held.object3D!.getWorldPosition(this.a);
      if (this.a.distanceTo(this.creatureWorld) < GIVE_DIST) offering = held;
    }
    // A pulled crystal is also given with the ray on the creature (not on a crystal).
    if (this.pulled && !this.aimedCrystal(this.pulled.side) && this.aimsAtCreature(this.pulled.side)) offering = this.pulled.e;
    this.offering = offering;
    // The creature leans in (grows a little) while it can take the answer.
    const s = this.creatureScale * (offering ? READY_SCALE : 1);
    if (!this.tweens.some((t) => t.obj === creature.object3D)) creature.object3D.scale.setScalar(s);
    for (const held of [...this.queries.heldCrystals.entities, ...pulled]) {
      held.object3D!.getWorldPosition(this.a);
      for (const other of this.queries.crystals.entities) {
        if (other === held || other.hasComponent(Grabbed) || other === this.pulled?.e) continue;
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
    if (held === this.pulled?.e) this.pulled = undefined;
    const i = held.getValue(Crystal, 'index') as number;
    const j = other.getValue(Crystal, 'index') as number;
    const texts = this.offer!.crystals;
    const orb = makeOrb(CRYSTAL_COLORS[i % CRYSTAL_COLORS.length], CRYSTAL_COLORS[j % CRYSTAL_COLORS.length]);
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
    this.setClickable(e);
  }

  /**
   * Mouse clicks outside the headset; in it, balloons also take a trigger
   * click while the player holds controllers (hands touch them instead).
   * Crystals take theirs through a box of their own (addRayTarget).
   */
  private setClickable(e: Entity): void {
    const want =
      this.world.visibilityState.peek() === VisibilityState.NonImmersive || (e.hasComponent(Balloon) && this.controllersOnly());
    if (want && !e.hasComponent(RayInteractable)) e.addComponent(RayInteractable);
    else if (!want && e.hasComponent(RayInteractable)) e.removeComponent(RayInteractable);
  }

  /**
   * With controllers the ray is always drawn, so the player always sees where
   * the controller points, and the near touch pointer is off: by default IWSDK
   * hides the ray when it hits nothing and swaps it for touch when the
   * controller is close to something, so the pointer came and went. Hands get
   * IWSDK's own behaviour back (touch, a ray only on a target).
   */
  private pointRays(controllers: boolean): void {
    for (const side of SIDES) {
      const multi = this.input.xr.multiPointers[side];
      multi.toggleSubPointer('touch', !controllers);
      // The ray's visual is not public; its display mode is (RayDisplayMode).
      const ray = (multi as unknown as { ray?: { visual?: { rayDisplayMode: number } } }).ray?.visual;
      if (ray) ray.rayDisplayMode = controllers ? RAY_VISIBLE : RAY_ON_TARGET;
    }
    console.info(`[input] ${controllers ? 'controllers: ray always shown, no touch' : 'hands: touch, ray on a target'}`);
  }

  /** In the headset with controllers and no tracked hand (hands touch, controllers click). */
  private controllersOnly(): boolean {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return false;
    const sources = this.world.renderer.xr.getSession()?.inputSources;
    if (!sources) return false;
    for (let i = 0; i < sources.length; i++) if (sources[i].hand) return false;
    return true;
  }

  private clickCrystal(e: Entity): void {
    if (this.phase !== 'playing' || this.kind !== 'orb_forge' || !this.offer) return;
    this.endDemo(true);
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

  /**
   * A grabbable crystal turns rays away (IWSDK gives it pointerEventsType deny
   * 'ray', so its handle is only taken by the grip). With controllers the ray
   * clicks crystals as a mouse does, so each crystal carries an unseen box, a
   * little larger than the crystal, that only a controller's ray hits. It is
   * an entity of its own, so the grip on the crystal is not a press, and its
   * press stops there: the grab handle on the crystal never sees the ray.
   */
  private addRayTarget(e: Entity): void {
    const box = new Mesh(CRYSTAL_RAY_BOX, CRYSTAL_RAY_PAPER);
    box.name = 'crystal-ray-target';
    box.userData.crystal = e;
    box.pointerEventsType = (_id: number, type: string) => type === 'ray' && this.controllersOnly() && e !== this.pulled?.e;
    box.addEventListener('pointerdown', (event: { stopPropagation(): void }) => {
      event.stopPropagation();
      // After the press is sent out: a second click joins and removes the
      // crystals, and with them listeners the pointer is still walking through.
      if (this.pressMeant()) queueMicrotask(() => e.active && this.clickCrystal(e));
    });
    const target = this.world.createTransformEntity(box, { parent: e });
    target.addComponent(RayInteractable);
    e.object3D!.userData.rayTarget = target;
  }

  /**
   * IWSDK grabs a crystal only with the controller inside it, which the
   * emulator's resting controllers never are and a seated player has to lean
   * for. So with controllers, the grip held while the ray is on a crystal
   * pulls it to the controller; it is then carried like a grabbed one (to
   * another crystal to join them, to the creature to give it) and let go when
   * the grip opens: given if offered, otherwise back to its place.
   */
  private runPull(delta: number): void {
    const p = this.pulled;
    const playing = this.phase === 'playing' && this.kind === 'orb_forge' && !!this.offer;
    if (p) {
      const pad = this.input.xr.gamepads[p.side];
      const obj = p.e.active ? p.e.object3D : undefined;
      // Taken up close by IWSDK's own grab as well: that one carries it.
      if (!obj || !playing || !this.controllersOnly() || p.e.hasComponent(Grabbed)) {
        this.pulled = undefined;
        return;
      }
      if (!pad?.getButtonPressed(SQUEEZE)) {
        this.pulled = undefined;
        obj.pointerEventsType = { deny: 'ray' };
        // Let go with the ray on another crystal: the two join.
        const other = this.aimedCrystal(p.side);
        const multi = this.input.xr.multiPointers[p.side] as unknown as { shouldHideRay(): boolean };
        const to = other ? `on ${other.object3D!.name}` : p.e === this.offering ? 'to the creature' : 'in the air';
        console.info(`[game] ${obj.name} let go ${to} (ray ${multi.shouldHideRay() ? 'hidden' : 'shown'})`);
        if (other) this.merge(p.e, other);
        else if (p.e === this.offering) this.released(p.e);
        else this.tween(obj, p.home, PULL_BACK_S, 0.03, obj.scale.x);
        return;
      }
      this.player.gripSpaces[p.side].getWorldPosition(this.a);
      obj.parent!.worldToLocal(this.a);
      obj.position.lerp(this.a, 1 - Math.exp(-PULL_RATE * delta));
      return;
    }
    if (!playing || !this.controllersOnly()) return;
    for (const side of SIDES) {
      if (!this.input.xr.gamepads[side]?.getButtonDown(SQUEEZE)) continue;
      const hit = this.input.xr.multiPointers[side].getPointer('ray').getIntersection();
      const e = hit?.object.userData.crystal as Entity | undefined;
      if (!e?.active || e.hasComponent(Grabbed) || this.tweens.some((t) => t.obj === e.object3D)) continue;
      this.unselect();
      this.endDemo(true);
      this.pulled = { e, side, home: e.object3D!.position.clone() };
      // Held at the grip it would take the grip pointer, which IWSDK puts
      // before the ray and so hides it; the ray stays to choose where it goes.
      e.object3D!.pointerEventsType = { deny: ['ray', 'grab'] };
      console.info(`[game] ${e.object3D!.name} pulled by the ${side} grip`);
      return;
    }
  }

  /**
   * A trigger click with a controller's ray on a balloon, where its dot is,
   * pops it. IWSDK's own press on a balloon missed some first clicks while
   * the dot was already on it (it rises and bobs under the ray).
   */
  private clickAimedBalloon(): void {
    if (!this.controllersOnly() || this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    for (const side of SIDES) {
      if (!this.input.xr.gamepads[side]?.getSelectStart()) continue;
      const hit = this.input.xr.multiPointers[side].getPointer('ray').getIntersection();
      for (let o = hit?.object; o; o = o.parent ?? undefined) {
        const e = o.userData.balloon as Entity | undefined;
        if (!e) continue;
        if (e.active && e.hasComponent(Balloon)) this.popBalloon(e, true);
        return;
      }
    }
  }

  /** The crystal a controller's ray is on, other than the one it pulled. */
  private aimedCrystal(side: (typeof SIDES)[number]): Entity | undefined {
    const hit = this.input.xr.multiPointers[side].getPointer('ray').getIntersection();
    const e = hit?.object.userData.crystal as Entity | undefined;
    return e?.active && e !== this.pulled?.e && !e.hasComponent(Grabbed) ? e : undefined;
  }

  /** Whether a controller's ray points at the creature (within CREATURE_AIM of its middle). */
  private aimsAtCreature(side: (typeof SIDES)[number]): boolean {
    const ray = this.player.raySpaces[side];
    ray.getWorldPosition(this.a);
    ray.getWorldQuaternion(this.touchQuat);
    this.b.set(0, 0, -1).applyQuaternion(this.touchQuat);
    return this.b.angleTo(this.c.copy(this.creatureWorld).sub(this.a)) < CREATURE_AIM;
  }

  /** Lets go of the crystal chosen by a click (all but `keep`, which a hand has just taken). */
  private unselect(keep?: Entity): void {
    const first = this.selected;
    if (!first) return;
    this.selected = undefined;
    if (first !== keep && first.object3D) first.object3D.position.y -= SELECT_LIFT;
  }
}
