import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Plane,
  Quaternion,
  Raycaster,
  SphereGeometry,
  Vector3,
  type Entity,
  type Intersection,
  type Object3D,
} from '@iwsdk/core';
import { Label } from '../art/label.js';
import { textPanel, ToolButton, type PanelLine, type ToolIcon, type ToolLook } from '../art/tool-icon.js';
import { sfx } from '../audio.js';
import { accessOn, getLang, getRoom, setRoom, type Room } from '../settings.js';
import { Hands, type HandAdapters, type Side } from './hands.js';
import { HuntCore, type HuntOffer, type HuntTask, type P3, type Reading } from './measure-core.js';
import { MEASURE_TEXT } from './measure-text.js';
import { paperObject, type PaperObject } from './paper-shapes.js';

/**
 * MEASURE HUNT, game 6, in the headset only: the real room shows (the
 * virtual rooms are put away while it is open) and a child measures a
 * paper shape the game lays on the desk, or something real near them, with
 * their hands. Pointing the index finger at a corner and holding it still
 * drops a pin; pinching a pin pulls a thread from it, let go on another pin
 * to join them or anywhere else to drop a new pin there; a thread let go
 * with a throw takes its pin away. Each thread shows its length in cm. Once
 * the pins and threads make the shape the task needs, the core reads them:
 * a wrong placing is sent back with what is wrong, a right one snaps on and
 * five answers stand on the desk. Points come for the measuring as well as
 * for the answer. A paper solid turns in the hand (a flick spins it and it
 * settles square), turns like a wheel between two hands, and a box pulled
 * apart with both hands unfolds into its net.
 *
 * With controllers each ray points as a laser does (a real thing is touched
 * by the ray's tip): its trigger drops a pin where it points or, on a pin,
 * pulls a thread; its grip turns a paper solid.
 */

export type MeasureChoice =
  | 'me_grade_4'
  | 'me_grade_5'
  | 'me_grade_6'
  | 'me_flat'
  | 'me_solid'
  | 'me_paper'
  | 'me_real'
  | 'me_start'
  | 'me_a0'
  | 'me_a1'
  | 'me_a2'
  | 'me_a3'
  | 'me_a4'
  | 'me_clear'
  | 'me_skip'
  | 'me_again'
  | 'me_done'
  | 'me_back';

export function isMeasureChoice(choice: string): choice is MeasureChoice {
  return choice.startsWith('me_');
}

/** What the desk game lends Measure Hunt. */
export interface MeasureHost {
  /** A desk entity for `obj`. */
  add(obj: Object3D): Entity;
  remove(e: Entity): void;
  /** Keeps a label turned to the player. */
  billboard(mesh: Mesh): void;
  /** Hides everything else on the desk; returns what shows it again. */
  clearDesk(): () => void;
  /**
   * A card leaning on the desk at (x, z) as the desk menu's chips, pressed
   * like them: its icon in `tint` over its word, or (no icon) a number alone.
   */
  button(choice: MeasureChoice, icon: ToolIcon | undefined, word: string, x: number, z: number, look: ToolLook, tint: string): Entity;
  /** A word rising from a place on the desk (desk frame). */
  pop(text: string, ink: number, at: Vector3): void;
  ray(side: Side): Object3D;
  /** This frame's select (trigger) edges of a controller. */
  select(side: Side): { start: boolean; end: boolean };
  /** A controller's A, B, X or Y pressed this frame. */
  turn(side: Side): boolean;
  /** This frame's grip edges of a controller. */
  squeeze(side: Side): { start: boolean; end: boolean };
  grip(side: Side): Object3D;
  /** Controllers in the hands, no tracked hand. */
  controllers(): boolean;
  hands(): HandAdapters | undefined;
  /** A signed-in student's grade; a guest picks one. */
  grade(): number | undefined;
  player(): string;
  /** Keeps the answers judged; `send` at the end of a play. */
  save(events: unknown[], send: boolean): void;
  /** The play is over: its points, right answers and answers. */
  played(points: number, right: number, total: number, ms: number): void;
  closed(note?: string): void;
}

type Step = 'grade' | 'group' | 'source' | 'how' | 'loading' | 'measure' | 'choose' | 'verdict' | 'recap';

interface Pin {
  mesh: Mesh;
}

/** A point the core reads: a pin, or one worked out from the threads (frame metres). */
interface Spot {
  pin?: Pin;
  at: Vector3;
}

interface Thread {
  a: Pin;
  b: Pin;
  mesh: Mesh;
  label: Label;
}

interface Pull {
  side: Side;
  from: Pin;
  mesh: Mesh;
  label: Label;
}

interface Turn {
  side: Side;
  last: number;
}

const SIDES: readonly Side[] = ['right', 'left'];
/** A session's time, unless NO TIMER is on. */
const SESSION_S = 150;
const TICK_FROM_S = 10;
/** A pointing finger held still this long drops a pin. */
const DWELL_S = 0.5;
/** Then it must move this far before it drops another. */
const REARM_M = 0.03;
/** No pin this near another, nor this near a card. */
const PIN_GAP_M = 0.04;
const CARD_GAP_M = 0.07;
/** A pinch or trigger this near a pin takes its thread. */
const GRAB_M = 0.035;
/** A thread let go this near its own pin is no thread. */
const CANCEL_M = 0.02;
/** A thread let go faster than this is thrown, and its pin goes. */
const THROW_SPEED = 1.2;
/** A controller's fingertip is this far along its ray. */
const TIP_M = 0.05;
/** A controller points this far at most. */
const AIM_FAR_M = 2;
/** A controller's pointed spot this near a paper corner goes onto it. */
const MAGNET_M = 0.025;
/** The bin over a pin a tip is near: its size, how high it floats, and how near a tip wakes, keeps and presses it. */
const TRASH_SIZE = 0.03;
const TRASH_LIFT = 0.012;
/** How far outside the pin, along the floor, the bin floats. */
const TRASH_OUT = 0.04;
const ACTIVE_M = 0.05;
const KEEP_M = 0.1;
const TRASH_HIT_M = 0.035;
/** A ray this near the bin is on it, and no pin goes within this of it. */
const BIN_RAY_M = 0.022;
const TRASH_AVOID_M = 0.05;
const TRASH_GRACE_S = 0.8;
/** A box's three threads from a corner go ways this near square to each other (cos of about 70 degrees). */
const SQUARE_COS = 0.35;
/** Where the paper object stands, and how far round it a finger may pin. */
const OBJECT_AT = new Vector3(0, 0, -0.12);
const OBJECT_MARGIN = 0.02;
/** On a paper polygon a pin goes only this near a corner, and onto it; the foot of a triangle's height this near a side. */
const CORNER_REACH_M = 0.06;
const SIDE_REACH_M = 0.025;
/** The real thing may be anywhere this near the desk's middle. */
const REAL_REACH = 1.0;
/** The words over the desk, and the time and points under them. */
const HEADER = new Vector3(0, 0.24, -0.45);
const STATUS = new Vector3(0, 0.205, -0.45);
/** The choices along the front of the desk, the tools on its right. */
const CARD_Z = 0.11;
const CHOICE_STEP = 0.13;
const TOOLS_X = 0.4;
/** After an answer, the next task comes this much later. */
const VERDICT_S = 1.8;
/** A flick spins faster than this, rad/s; it slows at SPIN_DRAG and settles square under SPIN_STOP. */
const FLICK = 2;
const SPIN_DRAG = 2;
const SPIN_STOP = 1;
const SETTLE = 10;
/** Two hands drawn this much further apart unfold a box; this much nearer fold it. */
const UNFOLD_M = 0.08;
const FOLD_M = 0.04;
const UNFOLD_SPEED = 2;

/** The icon on each card that is not an answer, a grade or QUIT. */
const CARD_ICON: Partial<Record<MeasureChoice, ToolIcon>> = {
  me_flat: 'shapes',
  me_solid: 'box',
  me_paper: 'paper',
  me_real: 'hand',
  me_start: 'next',
  me_back: 'back',
  me_clear: 'trash',
  me_skip: 'skip',
  me_again: 'replay',
  me_done: 'check',
};

const TEAL = 0x3fb6a0;
const CORAL = 0xf2716b;
const BLUE = 0x3469c4;
const PURPLE = 0x9b6bc2;
const YELLOW = 0xe0a33c;
const RIGHT_INK = 0x2f7d32;
const WRONG_INK = 0xc62828;
const INK = '#3a3f4b';
const HEAD = '#3469c4';
const ACCENT = '#c94f49';

const pinGeo = new SphereGeometry(0.006, 16, 12);
const pinMat = new MeshStandardMaterial({ color: CORAL, roughness: 0.6 });
const snapMat = new MeshStandardMaterial({ color: TEAL, roughness: 0.6 });
const threadGeo = new CylinderGeometry(0.0015, 0.0015, 1, 8).translate(0, 0.5, 0);
const threadMat = new MeshStandardMaterial({ color: BLUE, roughness: 0.8 });
const ghostGeo = new SphereGeometry(0.01, 16, 12);
const ghostMat = new MeshBasicMaterial({ color: CORAL, transparent: true, opacity: 0.45, depthWrite: false });
const UP = new Vector3(0, 1, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const X = new Vector3(1, 0, 0);

/** The 24 ways a box can stand square, for a solid let go to settle into. */
const SQUARE: Quaternion[] = (() => {
  const out = [new Quaternion()];
  const steps = [new Vector3(1, 0, 0), Y, Z].map((a) => new Quaternion().setFromAxisAngle(a, Math.PI / 2));
  for (let i = 0; i < out.length; i += 1) {
    for (const s of steps) {
      const q = s.clone().multiply(out[i]);
      if (!out.some((o) => Math.abs(o.dot(q)) > 0.999)) out.push(q);
    }
  }
  return out;
})();

export class MeasureDesk {
  private t = MEASURE_TEXT[getLang()];
  private root: Entity;
  private group: Group;
  /**
   * What is measured, at its true size: the desk is drawn larger in the
   * headset to be read from further away, but a 17 cm paper square must be
   * 17 cm in the room, and a thread on a real book its real length.
   */
  private metric: Group;
  /** The bin that floats over the pin a tip is near; pressed, it takes the pin and its threads away. */
  private trash: Mesh;
  private active?: Pin;
  private activeFor = 0;
  private t1 = new Vector3();
  private k1 = new Vector3();
  private k2 = new Vector3();
  private t2 = new Vector3();
  private o2 = new Vector3();
  private d2 = new Vector3();
  private restoreDesk: () => void;
  private room: Room;
  private hands: Hands;
  private step: Step = 'grade';
  private grade?: number;
  private solid = false;
  private source: 'paper' | 'real' = 'paper';
  private core?: HuntCore;
  private tasks: HuntTask[] = [];
  private lastTemplate = '';
  private offer?: HuntOffer;
  private cards: Entity[] = [];
  private panel?: Mesh;
  private status: Label;
  private paper?: PaperObject;
  private real: Group;
  private pins: Pin[] = [];
  private threads: Thread[] = [];
  private pulls = new Map<Side, Pull>();
  private dwell = { left: 0, right: 0 };
  private dwellAt = { left: new Vector3(), right: new Vector3() };
  private armed = { left: true, right: true };
  private lastPin = { left: new Vector3(), right: new Vector3() };
  private ghosts: Record<Side, Mesh>;
  private triggerHeld = { left: false, right: false };
  private lastTip = { left: new Vector3(), right: new Vector3() };
  private tipVel = { left: new Vector3(), right: new Vector3() };
  /** The hands holding the paper solid, and how it moves on its own. */
  private turns = new Map<Side, Turn>();
  private wheel?: { last: number; apart: number };
  private spinVel = 0;
  private flicking = false;
  private unfoldTo = 0;
  /** Where a button's quarter turn is taking the solid. */
  private turnGoal?: Quaternion;
  private unfolded = 0;
  private hint = '';
  private message = '';
  private messageInk = INK;
  private timeLeft = SESSION_S;
  private timed = true;
  private lastSecond = -1;
  private verdictLeft = 0;
  private points = 0;
  private right = 0;
  private answered = 0;
  private startedAt = 0;
  private gone = false;

  private v = new Vector3();
  private w = new Vector3();
  private u = new Vector3();
  private q = new Quaternion();
  private n = new Vector3();
  private caster = new Raycaster();
  private targets: Object3D[] = [];
  private hits: Intersection[] = [];
  private deskPlane = new Plane();
  /** Where each controller's ray points, and whether it points anywhere a pin may go. */
  private aimed = { left: false, right: false };
  private lastRay = { left: new Vector3(), right: new Vector3() };
  private rayVel = { left: new Vector3(), right: new Vector3() };

  constructor(private host: MeasureHost) {
    this.restoreDesk = host.clearDesk();
    // The real room only: Measure Hunt is played on the real desk.
    this.room = getRoom();
    setRoom('here');
    this.hands = new Hands(() => host.hands());
    this.group = new Group();
    this.group.name = 'measure-desk';
    this.root = host.add(this.group);
    this.metric = new Group();
    this.metric.name = 'measure-true-size';
    this.group.add(this.metric);
    const bin = new ToolButton('trash', '', TRASH_SIZE, TRASH_SIZE, 'accent', { alone: true, bare: true, theme: 'home', stroke: 2.4 });
    this.trash = bin.mesh;
    this.trash.name = 'measure-trash';
    this.trash.userData.trash = true;
    this.trash.visible = false;
    this.metric.add(this.trash);
    host.billboard(this.trash);
    this.real = new Group();
    this.real.name = 'measure-real';
    this.metric.add(this.real);
    this.status = new Label('', { height: 0.022 });
    this.status.mesh.position.copy(STATUS);
    this.group.add(this.status.mesh);
    host.billboard(this.status.mesh);
    const ghost = () => {
      const g = new Mesh(ghostGeo, ghostMat);
      g.visible = false;
      this.metric.add(g);
      return g;
    };
    this.ghosts = { left: ghost(), right: ghost() };
    this.grade = host.grade();
    if (this.grade === undefined) this.showGrades();
    else this.showGroups();
    console.info(`[measure] opened in the headset, grade ${this.grade ?? 'to pick'}`);
  }

  // ------------------------------------------------------------ the steps

  private showGrades(): void {
    this.step = 'grade';
    this.say([[this.t.title, 0.03, HEAD], [this.t.pickGrade, 0.022, INK]]);
    this.clearCards();
    [4, 5, 6].forEach((g, i) => this.card(`me_grade_${g}` as MeasureChoice, this.t.grade(g), (i - 1) * CHOICE_STEP, CARD_Z, [TEAL, BLUE, PURPLE][i]));
    this.card('me_back', this.t.back, TOOLS_X, CARD_Z, CORAL);
  }

  private showGroups(): void {
    this.step = 'group';
    this.say([[this.t.title, 0.03, HEAD], [this.t.pickGroup, 0.022, INK]]);
    this.clearCards();
    this.card('me_flat', this.t.flat, -0.08, CARD_Z, TEAL);
    this.card('me_solid', this.t.solid, 0.08, CARD_Z, BLUE);
    this.card('me_back', this.t.back, TOOLS_X, CARD_Z, CORAL);
  }

  private showSources(): void {
    this.step = 'source';
    this.say([[this.t.title, 0.03, HEAD], [this.t.pickSource, 0.022, INK], [this.t.realNote, 0.016, INK]]);
    this.clearCards();
    this.card('me_paper', this.t.paper, -0.08, CARD_Z, YELLOW);
    this.card('me_real', this.t.real, 0.08, CARD_Z, PURPLE);
    this.card('me_back', this.t.back, TOOLS_X, CARD_Z, CORAL);
  }

  private showHow(): void {
    this.step = 'how';
    const lines: [string, number, string][] = [[this.t.howTitle, 0.026, HEAD]];
    for (const l of this.t.how) lines.push([l, 0.017, INK]);
    if (this.solid && this.source === 'paper') lines.push([this.t.howSolid, 0.017, INK]);
    lines.push([this.t.howController, 0.014, INK]);
    this.say(lines);
    this.clearCards();
    this.card('me_start', this.t.start, 0, CARD_Z, TEAL);
    this.card('me_back', this.t.back, TOOLS_X, CARD_Z, CORAL);
  }

  private async begin(): Promise<void> {
    this.step = 'loading';
    this.clearCards();
    this.core?.dispose();
    this.core = undefined;
    try {
      const seed = Math.floor(Math.random() * 0xffffffff);
      this.core = await HuntCore.start(seed, this.grade, this.host.player());
    } catch (error) {
      console.warn(`[measure] could not start: ${String(error)}`);
      if (!this.gone) this.host.closed(this.t.failed);
      return;
    }
    if (this.gone) return;
    this.tasks = this.core.tasks(this.solid);
    if (this.tasks.length === 0) {
      console.warn(`[measure] no tasks for grade ${this.grade}, ${this.solid ? 'solids' : 'flat shapes'}`);
      this.host.closed(this.t.failed);
      return;
    }
    this.points = 0;
    this.right = 0;
    this.answered = 0;
    this.timed = !accessOn('noTimer');
    this.timeLeft = SESSION_S;
    this.lastSecond = -1;
    this.startedAt = performance.now();
    this.nextTask();
  }

  private nextTask(): void {
    if (!this.core) return;
    this.clearShape();
    const pool = this.tasks.length > 1 ? this.tasks.filter((k) => k.template_id !== this.lastTemplate) : this.tasks;
    const task = pool[Math.floor(Math.random() * pool.length)];
    this.lastTemplate = task.template_id;
    try {
      this.offer = this.core.next(task.template_id, this.solid, this.source);
    } catch (error) {
      console.warn(`[measure] no task from ${task.template_id}: ${String(error)}`);
      this.finish();
      return;
    }
    const o = this.offer;
    console.info(`[measure] task ${o.offer_id}: ${o.template_id} ${o.shape} ${o.task} (${o.source})`, o.size ?? {});
    if (o.source === 'paper') {
      this.paper = paperObject(o.shape, o.size ?? {}, o.keys ?? []);
      this.paper.root.position.copy(OBJECT_AT);
      this.metric.add(this.paper.root);
    }
    this.hint = this.steps(o);
    this.message = '';
    this.step = 'measure';
    this.showTask();
    this.clearCards();
    this.card('me_clear', this.t.clear, TOOLS_X, -0.06, YELLOW);
    this.card('me_skip', this.t.skip, TOOLS_X, 0.025, BLUE);
    this.card('me_back', this.t.quit, TOOLS_X, CARD_Z, CORAL);
    sfx('unfold');
  }

  private steps(o: HuntOffer): string {
    const s = this.t.steps;
    if (o.shape === 'cube' || o.shape === 'cuboid') return s.box;
    if (o.shape === 'triangle' && o.task === 'area') return s.triangleArea;
    return s[o.shape];
  }

  private showTask(): void {
    const o = this.offer;
    if (!o) return;
    const lines: [string, number, string][] = [[o.prompt[getLang()], 0.022, HEAD], [this.hint, 0.016, INK]];
    if (o.source === 'real') lines.push([this.t.realNote, 0.015, INK]);
    if (o.shape === 'circle' || o.shape === 'cylinder' || o.shape === 'sphere') lines.push([this.t.pi, 0.015, INK]);
    if (this.message) lines.push([this.message, 0.018, this.messageInk]);
    this.say(lines);
  }

  private showChoices(r: Reading): void {
    this.step = 'choose';
    this.clearCards();
    const unit = this.t.unit[this.offer?.unit ?? 'cm'] ?? '';
    r.choices.forEach((c, i) => this.card(`me_a${i}` as MeasureChoice, `${c} ${unit}`, (i - 2) * CHOICE_STEP, CARD_Z, BLUE));
    this.card('me_back', this.t.quit, TOOLS_X, -0.06, CORAL);
  }

  private choose(index: number): void {
    const o = this.offer;
    if (!o || !this.core || this.step !== 'choose') return;
    const v = this.core.answer(o.offer_id, index);
    this.points = v.total_points;
    this.right = v.right;
    this.answered = v.answered;
    this.host.save(this.core.drainEvents(), false);
    console.info(`[measure] answer ${index} for ${o.offer_id}: ${v.correct ? 'right' : `wrong (${v.misconception ?? '-'})`}, ${v.points} points`);
    const at = new Vector3((index - 2) * CHOICE_STEP, 0.16, CARD_Z);
    if (v.correct) {
      sfx('right');
      this.host.pop(this.t.right(v.points), RIGHT_INK, at);
    } else {
      sfx('wrong');
      const unit = this.t.unit[o.unit] ?? '';
      this.host.pop(this.t.wrongWas(`${v.expected_text} ${unit}`), WRONG_INK, at);
    }
    this.clearCards();
    this.step = 'verdict';
    this.verdictLeft = VERDICT_S;
  }

  private finish(): void {
    if (this.step === 'recap') return;
    const o = this.offer;
    if (o && this.core && this.step !== 'verdict') this.core.close(o.offer_id);
    this.offer = undefined;
    this.clearShape();
    this.step = 'recap';
    if (this.core) this.host.save(this.core.drainEvents(), true);
    this.host.played(this.points, this.right, this.answered, performance.now() - this.startedAt);
    console.info(`[measure] done: ${this.right} of ${this.answered} right, ${this.points} points`);
    sfx('fanfare');
    this.say([[this.t.recap, 0.03, HEAD], [this.t.recapLine(this.right, this.answered, this.points), 0.022, INK]]);
    this.status.set('');
    this.clearCards();
    this.card('me_again', this.t.again, -0.08, CARD_Z, TEAL);
    this.card('me_done', this.t.done, 0.08, CARD_Z, CORAL);
  }

  press(choice: MeasureChoice): void {
    if (this.gone) return;
    console.info(`[measure] pressed ${choice} while ${this.step}`);
    switch (choice) {
      case 'me_grade_4':
      case 'me_grade_5':
      case 'me_grade_6':
        if (this.step !== 'grade') return;
        this.grade = Number(choice.slice(-1));
        this.showGroups();
        return;
      case 'me_flat':
      case 'me_solid':
        if (this.step !== 'group') return;
        this.solid = choice === 'me_solid';
        this.showSources();
        return;
      case 'me_paper':
      case 'me_real':
        if (this.step !== 'source') return;
        this.source = choice === 'me_paper' ? 'paper' : 'real';
        this.showHow();
        return;
      case 'me_start':
        if (this.step === 'how') void this.begin();
        return;
      case 'me_clear':
        if (this.step !== 'measure') return;
        this.clearPins();
        this.message = '';
        this.showTask();
        sfx('fold');
        return;
      case 'me_skip':
        if (this.step !== 'measure' || !this.offer || !this.core) return;
        this.core.close(this.offer.offer_id);
        this.nextTask();
        return;
      case 'me_again':
        if (this.step === 'recap') void this.begin();
        return;
      case 'me_done':
        if (this.step === 'recap') this.host.closed();
        return;
      case 'me_back':
        if (this.step === 'grade' || this.step === 'recap') this.host.closed();
        else if (this.step === 'group') {
          if (this.host.grade() === undefined) this.showGrades();
          else this.host.closed();
        } else if (this.step === 'source') this.showGroups();
        else if (this.step === 'how') this.showSources();
        else if (this.step === 'measure' || this.step === 'choose' || this.step === 'verdict') this.finish();
        return;
      default: {
        const i = Number(choice.slice(4));
        if (choice.startsWith('me_a') && i >= 0) this.choose(i);
      }
    }
  }

  // ------------------------------------------------------------ each frame

  update(delta: number): void {
    if (this.gone) return;
    this.group.getWorldScale(this.n);
    if (this.n.x > 0) this.metric.scale.setScalar(1 / this.n.x);
    this.hands.update(delta);
    for (const side of SIDES) this.readTip(side, delta);
    if (this.step === 'verdict') {
      this.verdictLeft -= delta;
      if (this.verdictLeft <= 0) this.nextTask();
    }
    if (this.step === 'measure' || this.step === 'choose' || this.step === 'verdict') this.clock(delta);
    if (this.step !== 'measure' && this.step !== 'choose') {
      this.trash.visible = false;
      for (const side of SIDES) this.ghosts[side].visible = false;
      return;
    }
    this.turnSolid(delta);
    if (this.step !== 'measure' || this.unfolded > 0) {
      this.trash.visible = false;
      this.active = undefined;
      for (const side of SIDES) this.ghosts[side].visible = false;
      return;
    }
    this.updateBin(delta);
    for (const side of SIDES) {
      if (this.binPress(side)) continue;
      this.pullThread(side);
      this.dropPin(side, delta);
    }
  }

  /** The bin wakes over the pin a tip is near, stays while a tip is round it or on it, and goes a moment after. */
  private updateBin(delta: number): void {
    let near: Pin | undefined;
    let keep = false;
    for (const side of SIDES) {
      if (this.tip(side, false, this.t1)) {
        const pin = this.nearestPin(this.t1, ACTIVE_M);
        if (pin && !near) near = pin;
        if (this.active && !pin) {
          this.active.mesh.getWorldPosition(this.t2);
          if (this.t1.distanceTo(this.t2) < KEEP_M) keep = true;
        }
      }
      if (this.active && this.overBin(side)) keep = true;
    }
    if (near) {
      this.active = near;
      this.activeFor = 0;
    } else if (this.active) {
      if (keep) this.activeFor = 0;
      else {
        this.activeFor += delta;
        if (this.activeFor > TRASH_GRACE_S) this.active = undefined;
      }
    }
    if (this.active && !this.pins.includes(this.active)) this.active = undefined;
    this.trash.visible = this.active !== undefined;
    if (!this.active) return;
    // Beside the pin, outside the shape: away from the object's middle (for a real thing, from its pins' middle).
    if (this.paper) this.paper.spin.getWorldPosition(this.t1);
    else {
      this.t1.set(0, 0, 0);
      for (const p of this.pins) this.t1.add(p.mesh.getWorldPosition(this.o2));
      this.t1.divideScalar(Math.max(1, this.pins.length));
    }
    this.metric.worldToLocal(this.t1);
    this.active.mesh.getWorldPosition(this.t2);
    this.metric.worldToLocal(this.t2);
    let dx = this.t2.x - this.t1.x;
    let dz = this.t2.z - this.t1.z;
    const len = Math.hypot(dx, dz);
    // A pin at the very middle (a circle's centre) has no outside: the bin goes to its right.
    if (len < 0.01) {
      dx = 1;
      dz = 0;
    } else {
      dx /= len;
      dz /= len;
    }
    this.trash.position.set(this.t2.x + dx * TRASH_OUT, this.t2.y + TRASH_LIFT, this.t2.z + dz * TRASH_OUT);
  }

  /** Whether a controller's ray is on the bin, or a hand's finger or pinch is at it. */
  private overBin(side: Side): boolean {
    if (!this.trash.visible) return false;
    if (this.host.controllers()) {
      const ray = this.host.ray(side);
      ray.getWorldPosition(this.o2);
      ray.getWorldDirection(this.d2).negate();
      return this.nearBin(this.o2, this.d2);
    }
    const h = this.hands.get(side);
    if (!h.tracked) return false;
    this.trash.getWorldPosition(this.t2);
    return h.pinchAt.distanceTo(this.t2) < TRASH_HIT_M || h.tip.distanceTo(this.t2) < TRASH_HIT_M;
  }

  /** Whether a ray passes within reach of the bin: a small bin is hard to hit exactly, so near it is on it. */
  private nearBin(origin: Vector3, dir: Vector3): boolean {
    this.trash.getWorldPosition(this.t2);
    this.u.copy(this.t2).sub(origin);
    const along = Math.max(0, this.u.dot(dir));
    if (this.u.addScaledVector(dir, -along).length() >= BIN_RAY_M) return false;
    // A ray that ends on the paper or a pin before the bin's depth is aimed at that, not at the bin behind it.
    this.targets.length = 0;
    if (this.paper) this.targets.push(this.paper.root);
    for (const pin of this.pins) this.targets.push(pin.mesh);
    this.caster.set(origin, dir);
    this.caster.far = along;
    this.hits.length = 0;
    this.caster.intersectObjects(this.targets, true, this.hits);
    return !this.hits.some((h) => h.distance < along - 0.012);
  }

  /** A press on the bin takes its pin away, and the threads of that pin with it. */
  private binPress(side: Side): boolean {
    const pin = this.active;
    if (!pin || !this.trash.visible || this.pulls.has(side)) return false;
    if (!this.grabEdges(side).start || !this.overBin(side)) return false;
    pin.mesh.getWorldPosition(this.t2);
    this.active = undefined;
    this.trash.visible = false;
    this.removePin(pin);
    sfx('pop', { at: this.t2 });
    this.message = '';
    this.showTask();
    return true;
  }

  private clock(delta: number): void {
    if (!this.timed) {
      this.status.set(`${this.t.noTimer} · ${this.points}`);
      return;
    }
    this.timeLeft = Math.max(0, this.timeLeft - delta);
    const s = Math.ceil(this.timeLeft);
    if (s !== this.lastSecond) {
      this.lastSecond = s;
      this.status.set(`${this.t.time(s)} · ${this.points}`);
      if (s > 0 && s <= TICK_FROM_S) sfx(s <= 3 ? 'tickLast' : 'tick');
    }
    if (this.timeLeft <= 0) {
      sfx('timeUp');
      this.finish();
    }
  }

  /** The fingertip of a hand, or the tip of a controller's ray, and its speed. */
  private readTip(side: Side, delta: number): void {
    if (this.host.controllers()) {
      const ray = this.host.ray(side);
      ray.getWorldPosition(this.v);
      if (delta > 0) this.rayVel[side].copy(this.v).sub(this.lastRay[side]).divideScalar(delta);
      this.lastRay[side].copy(this.v);
      // A ray space looks down its -Z.
      ray.getWorldDirection(this.w).negate();
      this.aimed[side] = this.aim(this.v, this.w);
    } else {
      const h = this.hands.get(side);
      if (!h.tracked) return;
      this.v.copy(h.pinchAt);
    }
    if (delta > 0) this.tipVel[side].copy(this.v).sub(this.lastTip[side]).divideScalar(delta);
    this.lastTip[side].copy(this.v);
  }

  /** Where a side touches: the hand's fingertip (or pinch), the controller's tip. World frame. */
  private tip(side: Side, pinch: boolean, out: Vector3): boolean {
    if (this.host.controllers()) {
      out.copy(this.lastTip[side]);
      return this.aimed[side];
    }
    const h = this.hands.get(side);
    if (!h.tracked) return false;
    out.copy(pinch ? h.pinchAt : h.tip);
    return true;
  }

  /**
   * Where a controller's ray points, into `origin`: on the paper object or
   * the desk it meets, as a laser pointer (the emulator's controllers can
   * point but hardly touch); for a real thing the tip of the ray touches it.
   * False when the ray is on a card: that is a press, not a pin.
   */
  private aim(origin: Vector3, dir: Vector3): boolean {
    // A ray at the bin presses the bin; it drops no pin.
    if (this.trash.visible && this.nearBin(origin, dir)) return false;
    this.caster.set(origin, dir);
    this.caster.far = AIM_FAR_M;
    this.targets.length = 0;
    for (const c of this.cards) if (c.object3D) this.targets.push(c.object3D);
    if (this.paper) this.targets.push(this.paper.root);
    if (this.trash.visible) this.targets.push(this.trash);
    this.hits.length = 0;
    this.caster.intersectObjects(this.targets, true, this.hits);
    // Only the paper and its pins: a thread being pulled, or its length, would catch its own ray.
    const hit = this.hits.find((h) => h.object.visible && (h.object.userData.paper === true || h.object.name === 'measure-pin' || h.object.userData.card === true || h.object.userData.trash === true));
    if (hit) {
      if (hit.object.userData.card === true || hit.object.userData.trash === true) return false;
      origin.copy(hit.point);
      this.magnet(origin);
      return true;
    }
    if (this.source === 'real') {
      origin.addScaledVector(dir, TIP_M);
      return true;
    }
    // The desk's top, under the paper object.
    this.metric.getWorldPosition(this.u);
    this.metric.getWorldQuaternion(this.q);
    this.deskPlane.setFromNormalAndCoplanarPoint(this.n.copy(UP).applyQuaternion(this.q), this.u);
    if (!this.caster.ray.intersectPlane(this.deskPlane, this.u)) return false;
    if (this.u.distanceTo(origin) > AIM_FAR_M) return false;
    origin.copy(this.u);
    return true;
  }

  private grabEdges(side: Side): { start: boolean; end: boolean } {
    if (this.host.controllers()) {
      const s = this.host.select(side);
      if (s.start) this.triggerHeld[side] = true;
      if (s.end) this.triggerHeld[side] = false;
      return s;
    }
    const h = this.hands.get(side);
    return { start: h.pinchStart, end: h.pinchEnd };
  }

  private speed(side: Side): number {
    // A controller throws with its hand: its pointed spot leaps between the paper and the desk.
    return this.host.controllers() ? this.rayVel[side].length() : this.hands.get(side).velocity.length();
  }

  // ------------------------------------------------------------ pins and threads

  /** Where pins go: the paper object's own frame, or the desk's for a real thing. */
  private frame(): Object3D {
    return this.paper?.frame ?? this.real;
  }

  /**
   * A controller's pointed spot this near a corner of the paper object (or
   * its centre) is drawn onto it: a ray from the seat cannot be held as
   * still as a fingertip. Hands are never helped, so their placing is theirs.
   */
  private magnet(world: Vector3): void {
    const keys = this.offer?.keys;
    if (!this.paper || !keys || this.unfolded > 0) return;
    this.n.copy(world);
    this.paper.frame.worldToLocal(this.n);
    let best = -1;
    let bestD = MAGNET_M;
    keys.forEach(([x, y, z], i) => {
      const d = Math.hypot(this.n.x - x / 100, this.n.y - y / 100, this.n.z - z / 100);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) return;
    const [x, y, z] = keys[best];
    world.set(x / 100, y / 100, z / 100);
    this.paper.frame.localToWorld(world);
  }

  /** Whether the paper object is a polygon: its pins sit on its corners (a circle or ball takes a pin anywhere round it). */
  private polygon(): boolean {
    const o = this.offer;
    return !!this.paper && !!o?.keys?.length && ['square', 'rectangle', 'triangle', 'cube', 'cuboid'].includes(o.shape);
  }

  /** The corner of a paper polygon nearest a world point, in `out` (world), if one is within reach. */
  private cornerNear(world: Vector3, out: Vector3): boolean {
    const keys = this.offer?.keys;
    if (!this.paper || !keys || !this.polygon()) return false;
    this.k1.copy(world);
    this.paper.frame.worldToLocal(this.k1);
    let best = -1;
    let bestD = CORNER_REACH_M;
    keys.forEach(([x, y, z], i) => {
      const d = Math.hypot(this.k1.x - x / 100, this.k1.y - y / 100, this.k1.z - z / 100);
      if (d < bestD) {
        best = i;
        bestD = d;
      }
    });
    if (best < 0) return false;
    const [x, y, z] = keys[best];
    out.set(x / 100, y / 100, z / 100);
    this.paper.frame.localToWorld(out);
    return true;
  }

  /** Whether a world point is close to a side of the paper triangle: where the foot of its height may go. */
  private nearSide(world: Vector3): boolean {
    const o = this.offer;
    if (!this.paper || o?.shape !== 'triangle' || o.task !== 'area' || !o.keys) return false;
    this.k1.copy(world);
    this.paper.frame.worldToLocal(this.k1);
    const k = o.keys.slice(0, 3);
    for (let i = 0; i < k.length; i += 1) {
      const a = k[i];
      const b = k[(i + 1) % k.length];
      const abx = (b[0] - a[0]) / 100;
      const abz = (b[2] - a[2]) / 100;
      const len2 = abx * abx + abz * abz;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((this.k1.x - a[0] / 100) * abx + (this.k1.z - a[2] / 100) * abz) / len2)) : 0;
      if (Math.hypot(this.k1.x - (a[0] / 100 + abx * t), this.k1.z - (a[2] / 100 + abz * t)) < SIDE_REACH_M && Math.abs(this.k1.y) < SIDE_REACH_M) return true;
    }
    return false;
  }

  /** A world point near enough to be pinned. */
  private pinnable(world: Vector3): boolean {
    if (this.paper && this.polygon()) {
      // A flat shape or a box is pinned at its corners (and a triangle's height foot on a side): nowhere else near, nor far.
      if (!this.cornerNear(world, this.k2) && !this.nearSide(world)) return false;
    } else if (this.paper) {
      this.paper.spin.getWorldPosition(this.u);
      if (world.distanceTo(this.u) > this.paper.radius + OBJECT_MARGIN) return false;
    } else {
      this.u.copy(world);
      this.metric.worldToLocal(this.u);
      if (this.u.length() > REAL_REACH || this.u.y < -0.05) return false;
    }
    if (this.trash.visible) {
      this.trash.getWorldPosition(this.u);
      if (this.u.distanceTo(world) < TRASH_AVOID_M) return false;
    }
    for (const c of this.cards) {
      c.object3D?.getWorldPosition(this.u);
      if (this.u.distanceTo(world) < CARD_GAP_M) return false;
    }
    return true;
  }

  private nearestPin(world: Vector3, within: number, except?: Pin): Pin | undefined {
    let best: Pin | undefined;
    let bestD = within;
    for (const p of this.pins) {
      if (p === except) continue;
      p.mesh.getWorldPosition(this.u);
      const d = this.u.distanceTo(world);
      if (d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private maxPins(): number {
    const o = this.offer;
    if (!o) return 0;
    switch (o.shape) {
      case 'square':
      case 'rectangle':
        return 4;
      case 'cube':
      case 'cuboid':
        // Its corners, as many as the child pins: face by face, a shared corner pinned once.
        return 8;
      case 'triangle':
        return o.task === 'area' ? 4 : 3;
      default:
        return 2;
    }
  }

  /** A pointing finger held still drops a pin where it points; a controller's trigger drops one at once. */
  private dropPin(side: Side, delta: number): void {
    const ghost = this.ghosts[side];
    ghost.visible = false;
    if (this.pulls.has(side) || this.turns.has(side)) return;
    if (this.host.controllers()) {
      const press = this.grabEdges(side).start;
      if (!this.tip(side, false, this.v)) return;
      const onPin = this.nearestPin(this.v, GRAB_M) !== undefined;
      const free = !onPin && this.pins.length < this.maxPins() && this.pinnable(this.v) && !this.nearestPin(this.v, PIN_GAP_M);
      // The mark shows the corner it will go onto.
      if (free && this.cornerNear(this.v, this.k2)) this.v.copy(this.k2);
      // A small mark where the ray points, so the pin is seen before it drops.
      if (free || onPin) {
        ghost.visible = true;
        ghost.position.copy(this.v);
        this.metric.worldToLocal(ghost.position);
        ghost.scale.setScalar(onPin ? 0.8 : 0.5);
      }
      if (press && free) this.addPin(this.v);
      else if (press && !onPin && this.pins.length >= this.maxPins() && this.pinnable(this.v)) this.tell(this.t.allPins(this.maxPins()));
      else if (press && !onPin && this.pins.length < this.maxPins() && !this.pinnable(this.v)) this.tell(this.t.farPin);
      return;
    }
    const h = this.hands.get(side);
    if (!h.tracked) return;
    const tip = h.tip;
    if (!this.armed[side]) {
      if (tip.distanceTo(this.lastPin[side]) > REARM_M) this.armed[side] = true;
      else return;
    }
    if (this.pins.length >= this.maxPins() && h.pointing() && h.still() && this.pinnable(tip) && !this.nearestPin(tip, PIN_GAP_M)) {
      this.tell(this.t.allPins(this.maxPins()));
    }
    const can = h.pointing() && h.still() && this.pins.length < this.maxPins() && this.pinnable(tip) && !this.nearestPin(tip, PIN_GAP_M);
    if (!can) {
      this.dwell[side] = 0;
      return;
    }
    // The pin falls where the finger rested, not where it twitched last.
    const k = this.dwell[side] === 0 ? 1 : Math.min(1, delta / Math.max(this.dwell[side], delta));
    if (this.dwell[side] === 0) this.dwellAt[side].copy(tip);
    else this.dwellAt[side].lerp(tip, k);
    this.dwell[side] += delta;
    ghost.visible = true;
    ghost.position.copy(this.dwellAt[side]);
    this.metric.worldToLocal(ghost.position);
    ghost.scale.setScalar(0.4 + 0.6 * Math.min(1, this.dwell[side] / DWELL_S));
    if (this.dwell[side] < DWELL_S) return;
    this.dwell[side] = 0;
    this.armed[side] = false;
    this.lastPin[side].copy(this.dwellAt[side]);
    this.addPin(this.dwellAt[side]);
  }

  private addPin(spot: Vector3): Pin {
    // A pin placed near a corner goes onto the corner, or is the pin already there.
    let world = spot;
    if (this.cornerNear(spot, this.k2)) {
      const there = this.nearestPin(this.k2, 0.012);
      if (there) return there;
      world = this.k2.clone();
    }
    const mesh = new Mesh(pinGeo, pinMat);
    mesh.name = 'measure-pin';
    mesh.position.copy(world);
    this.frame().worldToLocal(mesh.position);
    this.frame().add(mesh);
    const pin = { mesh };
    this.pins.push(pin);
    sfx('place', { at: world });
    this.changed();
    return pin;
  }

  private removePin(pin: Pin): void {
    for (const th of this.threads.filter((t) => t.a === pin || t.b === pin)) this.removeThread(th);
    pin.mesh.removeFromParent();
    this.pins = this.pins.filter((p) => p !== pin);
  }

  private removeThread(th: Thread): void {
    th.mesh.removeFromParent();
    dropLabel(th.label);
    this.threads = this.threads.filter((t) => t !== th);
  }

  /** A pinch (or trigger) on a pin pulls a thread from it until let go. */
  private pullThread(side: Side): void {
    const edges = this.grabEdges(side);
    const pull = this.pulls.get(side);
    if (!pull) {
      if (!edges.start || this.turns.has(side)) return;
      if (!this.tip(side, true, this.v)) return;
      const from = this.nearestPin(this.v, GRAB_M);
      if (!from) return;
      const mesh = new Mesh(threadGeo, threadMat);
      const label = new Label('', { height: 0.026 });
      this.frame().add(mesh, label.mesh);
      this.host.billboard(label.mesh);
      this.pulls.set(side, { side, from, mesh, label });
      sfx('grab', { at: this.v });
      return;
    }
    this.tip(side, true, this.v);
    this.w.copy(this.v);
    this.frame().worldToLocal(this.w);
    this.lay(pull.mesh, pull.label, pull.from.mesh.position, this.w);
    if (!edges.end && (this.host.controllers() ? this.triggerHeld[side] : this.hands.get(side).pinching)) return;
    // Let go.
    this.pulls.delete(side);
    pull.mesh.removeFromParent();
    dropLabel(pull.label);
    if (this.speed(side) > THROW_SPEED) {
      this.removePin(pull.from);
      sfx('pop', { at: this.v });
      this.message = '';
      this.changed();
      return;
    }
    pull.from.mesh.getWorldPosition(this.u);
    if (this.u.distanceTo(this.v) < CANCEL_M) return;
    let to = this.nearestPin(this.v, GRAB_M, pull.from);
    if (!to) {
      if (this.pins.length >= this.maxPins() || !this.pinnable(this.v) || this.nearestPin(this.v, PIN_GAP_M)) return;
      to = this.addPin(this.v);
    }
    this.join(pull.from, to);
  }

  private join(a: Pin, b: Pin): void {
    if (this.threads.some((t) => (t.a === a && t.b === b) || (t.a === b && t.b === a))) return;
    const mesh = new Mesh(threadGeo, threadMat);
    const label = new Label('', { height: 0.026 });
    this.frame().add(mesh, label.mesh);
    this.host.billboard(label.mesh);
    const th = { a, b, mesh, label };
    this.threads.push(th);
    this.lay(mesh, label, a.mesh.position, b.mesh.position);
    sfx('join', { at: b.mesh.getWorldPosition(this.u) });
    this.changed();
  }

  /** A thread from a to b (frame-local metres) with its length on it. */
  private lay(mesh: Mesh, label: Label, a: Vector3, b: Vector3): void {
    this.u.copy(b).sub(a);
    const len = this.u.length();
    mesh.position.copy(a);
    mesh.scale.set(1, Math.max(len, 1e-4), 1);
    if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, this.u.divideScalar(len));
    label.set(`${Math.round(len * 100)} cm`);
    label.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    label.mesh.position.y += 0.022;
  }

  private clearPins(): void {
    for (const pull of this.pulls.values()) {
      pull.mesh.removeFromParent();
      dropLabel(pull.label);
    }
    this.pulls.clear();
    for (const th of [...this.threads]) this.removeThread(th);
    for (const p of [...this.pins]) this.removePin(p);
  }

  /** The pins in the order the core reads them, once they make the shape; else nothing. */
  private order(): Pin[] | undefined {
    const o = this.offer;
    if (!o) return undefined;
    const n = this.maxPins();
    if (this.pins.length !== n) return undefined;
    const near = (p: Pin) => this.threads.filter((t) => t.a === p || t.b === p).map((t) => (t.a === p ? t.b : t.a));
    const loop = (ring: Pin[]): Pin[] | undefined => {
      const out = [ring[0]];
      let prev: Pin | undefined;
      let cur = ring[0];
      for (let i = 1; i < ring.length; i += 1) {
        const next = near(cur).find((p) => p !== prev && ring.includes(p) && !out.includes(p));
        if (!next) return undefined;
        out.push(next);
        prev = cur;
        cur = next;
      }
      return near(cur).includes(ring[0]) ? out : undefined;
    };
    switch (o.shape) {
      case 'square':
      case 'rectangle':
        if (this.threads.length !== 4 || this.pins.some((p) => near(p).length !== 2)) return undefined;
        return loop(this.pins);
      case 'triangle': {
        if (o.task !== 'area') {
          if (this.threads.length !== 3) return undefined;
          return loop(this.pins);
        }
        if (this.threads.length !== 4) return undefined;
        const foot = this.pins.find((p) => near(p).length === 1);
        if (!foot) return undefined;
        const ring = loop(this.pins.filter((p) => p !== foot));
        return ring ? [...ring, foot] : undefined;
      }
      case 'cube':
      case 'cuboid':
        // Read from its edges (see fromEdges).
        return undefined;
      default: {
        // The thread's first end is where it was pulled from: the centre, for a circle.
        const th = this.threads[0];
        return this.threads.length === 1 && th ? [th.a, th.b] : undefined;
      }
    }
  }

  /**
   * Squares, rectangles and boxes need only their edges: two threads that meet
   * at a corner, square to each other (along, across), or three that are square
   * to each other, from one corner or end to end (along, across, up). The rest
   * of the shape is worked out from them for the core, so a child may thread
   * face by face, edge by edge, or a path along three edges, as they think of it.
   */
  private fromEdges(): Spot[] | undefined {
    const o = this.offer;
    if (!o) return undefined;
    const box = o.shape === 'cube' || o.shape === 'cuboid';
    const flat = o.shape === 'square' || o.shape === 'rectangle';
    if (!box && !flat) return undefined;
    const ths = this.threads;
    if (ths.length < (box ? 3 : 2)) return undefined;
    const dir = (t: Thread) => t.b.mesh.position.clone().sub(t.a.mesh.position);
    const square = (x: Thread, y: Thread) => {
      const u = dir(x);
      const v = dir(y);
      return u.length() > 1e-4 && v.length() > 1e-4 && Math.abs(u.normalize().dot(v.normalize())) < SQUARE_COS;
    };
    const has = (t: Thread, p: Pin) => t.a === p || t.b === p;
    const other = (t: Thread, p: Pin) => (t.a === p ? t.b : t.a);
    const share = (x: Thread, y: Thread) => [x.a, x.b].find((p) => has(y, p));
    const spot = (p: Pin): Spot => ({ pin: p, at: p.mesh.position.clone() });
    if (flat) {
      for (let i = 0; i < ths.length; i += 1) {
        for (let j = i + 1; j < ths.length; j += 1) {
          const corner = share(ths[i], ths[j]);
          if (!corner || !square(ths[i], ths[j])) continue;
          const a = other(ths[i], corner);
          const c = other(ths[j], corner);
          if (!this.onKeys([a, corner, c])) return undefined;
          // The fourth corner completes the rectangle.
          const d = a.mesh.position.clone().add(c.mesh.position).sub(corner.mesh.position);
          return [spot(a), spot(corner), spot(c), { at: d }];
        }
      }
      return undefined;
    }
    for (let i = 0; i < ths.length; i += 1) {
      for (let j = i + 1; j < ths.length; j += 1) {
        for (let k = j + 1; k < ths.length; k += 1) {
          const t = [ths[i], ths[j], ths[k]];
          if (!square(t[0], t[1]) || !square(t[0], t[2]) || !square(t[1], t[2])) continue;
          // The corner: the pin all three share, else the one a path of three turns on.
          let corner = [t[0].a, t[0].b].find((p) => has(t[1], p) && has(t[2], p));
          if (!corner) {
            const mid = t.find((x) => t.every((y) => y === x || share(x, y)));
            if (!mid) continue;
            const first = t.find((y) => y !== mid)!;
            corner = share(mid, first);
          }
          if (!corner) continue;
          if (!this.onKeys(t.flatMap((x) => [x.a, x.b]))) return undefined;
          const at = corner.mesh.position;
          const spots: Spot[] = [spot(corner)];
          for (const x of t) {
            if (has(x, corner)) {
              spots.push(spot(other(x, corner)));
              continue;
            }
            // An edge elsewhere is the same edge from this corner, towards the box.
            const v = dir(x);
            const up = at.clone().add(v);
            const down = at.clone().sub(v);
            spots.push({ at: this.nearKey(down) < this.nearKey(up) ? down : up });
          }
          return spots;
        }
      }
    }
    if (this.pins.length >= 6 && ths.length >= 5) this.tell(this.t.oneCorner);
    return undefined;
  }

  /** How far a point is from the paper object's nearest corner, frame metres (0 for a real thing). */
  private nearKey(at: Vector3): number {
    const keys = this.offer?.keys;
    if (!keys?.length) return 0;
    return Math.min(...keys.map(([x, y, z]) => Math.hypot(at.x - x / 100, at.y - y / 100, at.z - z / 100)));
  }

  /** Whether every pin of a paper object's edges is on a corner; says so if not. A real thing has none to check. */
  private onKeys(pins: Pin[]): boolean {
    const keys = this.offer?.keys;
    if (!keys?.length) return true;
    const snap = (this.offer?.snap_cm ?? 3) / 100;
    if (pins.every((p) => this.nearKey(p.mesh.position) <= snap)) return true;
    this.tell(this.t.problem.off_corner);
    return false;
  }

  /** A word under the task about what to do now, said once until it changes. */
  private tell(text: string): void {
    if (this.message === text) return;
    this.message = text;
    this.messageInk = ACCENT;
    this.showTask();
    sfx('wrong');
  }

  /** The pins or threads changed: once they make the shape, the core reads them. */
  private changed(): void {
    const o = this.offer;
    if (!o || !this.core || this.step !== 'measure') return;
    const ring = this.order();
    const spots = ring ? ring.map((p): Spot => ({ pin: p, at: p.mesh.position.clone() })) : this.fromEdges();
    if (!spots) return;
    const points = spots.map((sp): P3 => [sp.at.x * 100, sp.at.y * 100, sp.at.z * 100]);
    const r = this.core.measure(o.offer_id, points);
    console.info(`[measure] read ${o.offer_id}: ${r.ok ? `ok, ${r.process_points} points for the measuring` : r.problem}`, points);
    if (!r.ok) {
      sfx('wrong');
      this.message = this.t.problem[r.problem ?? ''] ?? r.problem ?? '';
      this.messageInk = ACCENT;
      this.showTask();
      return;
    }
    // The pins snap onto the corners they meant.
    r.pins.forEach((p, i) => {
      const pin = spots[i]?.pin;
      if (!pin) return;
      pin.mesh.position.set(p[0] / 100, p[1] / 100, p[2] / 100);
      pin.mesh.material = snapMat;
    });
    for (const th of this.threads) this.lay(th.mesh, th.label, th.a.mesh.position, th.b.mesh.position);
    sfx('sparkle');
    this.message = this.t.measured(r.process_points);
    this.messageInk = '#2f7d32';
    this.showTask();
    if (r.choices.length === 0) {
      this.core.close(o.offer_id);
      this.nextTask();
      return;
    }
    this.showChoices(r);
  }

  // ------------------------------------------------------------ turning a paper solid

  private turnSolid(delta: number): void {
    const paper = this.paper;
    if (!paper?.solid) return;
    const spin = paper.spin;
    spin.getWorldPosition(this.v);
    const centre = this.metric.worldToLocal(this.v);
    for (const side of SIDES) {
      const held = this.turns.get(side);
      if (!held) {
        if (this.pulls.has(side) || !this.turnStart(side)) continue;
        if (!this.tip(side, true, this.w) || this.nearestPin(this.w, GRAB_M)) continue;
        paper.spin.getWorldPosition(this.u);
        if (this.w.distanceTo(this.u) > paper.radius + OBJECT_MARGIN) continue;
        this.metric.worldToLocal(this.w);
        this.turnGoal = undefined;
        this.turns.set(side, { side, last: Math.atan2(this.w.x - centre.x, this.w.z - centre.z) });
        this.flicking = false;
        sfx('grab', { at: this.u });
        continue;
      }
      if (this.turnEnd(side)) {
        this.turns.delete(side);
        this.wheel = undefined;
        if (Math.abs(this.spinVel) > FLICK && this.unfoldTo === 0) this.flicking = true;
      }
    }
    const holding = [...this.turns.values()];
    if (holding.length === 2) {
      // Two hands: a wheel turning about the line to the player, and pulled apart a box opens.
      this.tip('left', true, this.w);
      this.tip('right', true, this.u);
      this.metric.worldToLocal(this.w);
      this.metric.worldToLocal(this.u);
      const angle = Math.atan2(this.u.y - this.w.y, this.u.x - this.w.x);
      const apart = this.u.distanceTo(this.w);
      if (!this.wheel) this.wheel = { last: angle, apart };
      const da = wrap(angle - this.wheel.last);
      this.wheel.last = angle;
      if (this.unfoldTo === 0) spin.quaternion.premultiply(this.q.setFromAxisAngle(Z, da));
      if (paper.unfold) {
        if (apart - this.wheel.apart > UNFOLD_M && this.unfoldTo === 0) {
          this.unfoldTo = 1;
          this.wheel.apart = apart;
          sfx('unfold');
        } else if (this.wheel.apart - apart > FOLD_M && this.unfoldTo === 1) {
          this.unfoldTo = 0;
          this.wheel.apart = apart;
          sfx('fold');
        }
      }
      this.spinVel = 0;
    } else if (holding.length === 1 && this.unfoldTo === 0) {
      // One hand: round the desk's up, following the hand about the solid's middle.
      const held = holding[0];
      this.tip(held.side, true, this.w);
      this.metric.worldToLocal(this.w);
      const angle = Math.atan2(this.w.x - centre.x, this.w.z - centre.z);
      const da = wrap(angle - held.last);
      held.last = angle;
      spin.quaternion.premultiply(this.q.setFromAxisAngle(Y, da));
      if (delta > 0) this.spinVel = this.spinVel * 0.6 + (da / delta) * 0.4;
    } else if (this.flicking) {
      spin.quaternion.premultiply(this.q.setFromAxisAngle(Y, this.spinVel * delta));
      this.spinVel *= Math.exp(-SPIN_DRAG * delta);
      if (Math.abs(this.spinVel) < SPIN_STOP) this.flicking = false;
    } else {
      // A controller's buttons turn it a quarter: A or B round the desk's up, X or Y over towards the player.
      for (const side of SIDES) {
        if (this.unfoldTo > 0 || !this.host.turn(side)) continue;
        const from = this.turnGoal ?? nearestSquare(spin.quaternion);
        this.turnGoal = this.q.setFromAxisAngle(side === 'right' ? Y : X, Math.PI / 2).clone().multiply(from);
        sfx('fold');
      }
      if (this.turnGoal && spin.quaternion.angleTo(this.turnGoal) < 0.01) this.turnGoal = undefined;
      // Let go, it settles to stand square; opening, it first comes upright.
      const target = this.unfoldTo > 0 ? SQUARE[0] : (this.turnGoal ?? nearestSquare(spin.quaternion));
      spin.quaternion.slerp(target, 1 - Math.exp(-SETTLE * delta));
      this.spinVel = 0;
    }
    if (this.unfoldTo > 0 && holding.length < 2) spin.quaternion.slerp(SQUARE[0], 1 - Math.exp(-SETTLE * delta));
    if (paper.unfold && this.unfolded !== this.unfoldTo) {
      const step = UNFOLD_SPEED * delta;
      this.unfolded = this.unfoldTo > this.unfolded ? Math.min(this.unfoldTo, this.unfolded + step) : Math.max(this.unfoldTo, this.unfolded - step);
      paper.unfold(this.unfolded);
      // The pins mark the folded box: put away while it is open.
      const shown = this.unfolded === 0;
      for (const p of this.pins) p.mesh.visible = shown;
      for (const th of this.threads) th.mesh.visible = th.label.mesh.visible = shown;
    }
  }

  private turnStart(side: Side): boolean {
    if (this.host.controllers()) return this.host.squeeze(side).start;
    return this.hands.get(side).pinchStart;
  }

  private turnEnd(side: Side): boolean {
    if (this.host.controllers()) return this.host.squeeze(side).end;
    const h = this.hands.get(side);
    return h.pinchEnd || !h.tracked;
  }

  // ------------------------------------------------------------ the desk

  /** A card with its icon and word, as the desk menu's chips; an answer is its number alone. */
  private card(choice: MeasureChoice, word: string, x: number, z: number, color: number): void {
    const answer = /^me_a\d$/.test(choice);
    const icon: ToolIcon | undefined = answer
      ? undefined
      : choice === 'me_back' && word === this.t.quit
        ? 'exit'
        : choice.startsWith('me_grade')
          ? 'school'
          : CARD_ICON[choice];
    const look: ToolLook = choice === 'me_back' || choice === 'me_done' ? 'accent' : choice === 'me_start' || choice === 'me_again' ? 'on' : 'plain';
    this.cards.push(this.host.button(choice, icon, word, x, z, look, `#${color.toString(16).padStart(6, '0')}`));
  }

  private clearCards(): void {
    for (const c of this.cards) if (c.active) this.host.remove(c);
    this.cards = [];
  }

  /** The words over the desk, in a paper panel turned to the player. */
  private say(lines: [string, number, string][]): void {
    this.dropPanel();
    const panel: PanelLine[] = lines.map(([text, size, ink]) => ({ text, size, ink }));
    const { mesh } = textPanel(panel, 0.56, 0.3, 0.02, 0, 0.02, 'home');
    mesh.position.copy(HEADER);
    this.group.add(mesh);
    this.host.billboard(mesh);
    this.panel = mesh;
  }

  private dropPanel(): void {
    const p = this.panel;
    if (!p) return;
    p.removeFromParent();
    const mat = p.material as MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    p.geometry.dispose();
    this.panel = undefined;
  }

  private clearShape(): void {
    this.clearPins();
    this.turns.clear();
    this.wheel = undefined;
    this.flicking = false;
    this.spinVel = 0;
    this.unfoldTo = 0;
    this.unfolded = 0;
    this.paper?.dispose();
    this.paper = undefined;
  }

  dispose(): void {
    if (this.gone) return;
    this.gone = true;
    if (this.offer && this.core && this.step !== 'verdict' && this.step !== 'recap') this.core.close(this.offer.offer_id);
    if (this.core && this.step !== 'recap') this.host.save(this.core.drainEvents(), true);
    this.clearShape();
    this.clearCards();
    this.dropPanel();
    this.core?.dispose();
    if (this.root.active) this.host.remove(this.root);
    this.restoreDesk();
    setRoom(this.room);
  }
}

function dropLabel(l: Label): void {
  l.mesh.removeFromParent();
  const mat = l.mesh.material as MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
  l.mesh.geometry.dispose();
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function nearestSquare(q: Quaternion): Quaternion {
  let best = SQUARE[0];
  let bestDot = -1;
  for (const s of SQUARE) {
    const d = Math.abs(s.dot(q));
    if (d > bestDot) {
      best = s;
      bestDot = d;
    }
  }
  return best;
}

