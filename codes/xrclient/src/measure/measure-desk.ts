import {
  CylinderGeometry,
  Group,
  DoubleSide,
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
import { boardUp, setBoard, setBoardNear } from '../art/board.js';
import { Label } from '../art/label.js';
import { textPanel, ToolButton, type PanelLine, type ToolIcon, type ToolLook } from '../art/tool-icon.js';
import { sfx } from '../audio.js';
import { accessOn, getLang, getRoom, setRoom, type Room } from '../settings.js';
import { Hands, type HandAdapters, type Side } from './hands.js';
import { HuntCore, type HuntOffer, type HuntTask, type P3, type Reading, type Shape } from './measure-core.js';
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
  | 'me_back'
  | 'me_zoom'
  | 'me_tl'
  | 'me_tr'
  | 'me_tu'
  | 'me_td'
  | 'me_net'
  | 'me_spin'
  | 'me_sh_square'
  | 'me_sh_rectangle'
  | 'me_sh_triangle'
  | 'me_sh_circle'
  | 'me_sh_cube'
  | 'me_sh_cuboid'
  | 'me_sh_paper';

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
  /** The way a controller's thumbstick was pushed over this frame, if it was. */
  stick(side: Side): 'left' | 'right' | 'up' | 'down' | undefined;
  /** This frame's grip edges of a controller. */
  squeeze(side: Side): { start: boolean; end: boolean };
  grip(side: Side): Object3D;
  /** Controllers in the hands, no tracked hand. */
  controllers(): boolean;
  hands(): HandAdapters | undefined;
  /** A tracked hand's aim under the hand menu (its ray); false when it has none. */
  handAim(side: Side, origin: Vector3, dir: Vector3): boolean;
  /** Whether hands work through rays and taps now (the hand menu is on). */
  handsRay(): boolean;
  /** Takes the taps of a hand's index finger that land on no card; call the result to stop. */
  handTaps(sink: (side: Side, origin: Vector3, dir: Vector3) => void): () => void;
  /** A signed-in student's grade; a guest picks one. */
  grade(): number | undefined;
  player(): string;
  /** Keeps the answers judged; `send` at the end of a play. */
  save(events: unknown[], send: boolean): void;
  /** The play is over: its points, right answers and answers. */
  played(points: number, right: number, total: number, ms: number): void;
  closed(note?: string): void;
}

type Step = 'grade' | 'group' | 'source' | 'object' | 'how' | 'loading' | 'measure' | 'choose' | 'verdict' | 'recap';

interface Pin {
  mesh: Mesh;
  /**
   * A pin set on a box's opened net: where the corner it stands for is on the folded box
   * (frame metres, what the core reads) and where it is on the net. Its mesh goes between
   * the two as the box opens and folds.
   */
  cube?: Vector3;
  net?: Vector3;
}

/** A corner of an opened net, and the corner of the folded box it is (frame metres). */
interface NetSpot {
  net: Vector3;
  cube: Vector3;
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

/** A ball's circumference being drawn: the turn waits to be pressed, runs, and waits for its start to be tapped. */
interface Spin {
  stage: 'press' | 'turning' | 'close';
  reading: Reading;
  /** The pin the line began at. */
  outer: Pin;
  angle: number;
  /** The ball's turn as it was, the pen's place and the axis the ball turns about (the root's frame). */
  q0: Quaternion;
  rel0: Vector3;
  pen: Vector3;
  axis: Vector3;
  trail: Group;
  last: Vector3;
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
/** On a real object, which can be small, pins may stand this near each other. */
const REAL_PIN_GAP_M = 0.02;
/** A ray this near the vertical line over a base pin takes a point on it (the top of a real box). */
const VERT_REACH_M = 0.035;

/** What stands for a real object in the emulator, which has none: a model of the true size, in cm. */
const MOCK: Record<string, { size: Record<string, number>; keys?: P3[] }> = {
  rectangle: { size: { p: 24, l: 17 } },
  square: { size: { s: 16 } },
  circle: { size: { r: 9 } },
  triangle: { size: { a: 15, b: 20 }, keys: [[-10, 0, 7.5], [10, 0, 7.5], [-10, 0, -7.5]] },
  cube: { size: { s: 10 } },
  cuboid: { size: { p: 20, l: 12, t: 8 } },
};
const VS_O = new Vector3();
const VS_D = new Vector3();
const VS_Q = new Quaternion();
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
/** A pin on an opened net stands this far over the paper (metres). */
const NET_LIFT = 0.003;
/**
 * A controller picks a pin by the cone of its ray, not by where the ray ends:
 * a pin within RAY_PIN_M of the ray, and a little more for each metre along it,
 * is the one pointed at. The nearest to the ray's line wins.
 */
const RAY_PIN_M = 0.02;
const RAY_PIN_SLOPE = 0.05;
/** The bin over a pin a tip is near: its size, how high it floats, and how near a tip wakes, keeps and presses it. */
/** A ray or pinch this near the magnifier card is on it, and where the card stands. */
const MAGNIFIER_REACH_M = 0.05;
const ZOOM_Z = 0.13;
const ZOOM_X = -0.38;
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
const OBJECT_AT = new Vector3(0, 0, -0.1);
/** A paper object is drawn this much larger than its centimetres say, to be seen and reached; its threads still read the centimetres of the question. A real thing is never scaled. */
const PAPER_SCALE = 1.5;
const OBJECT_MARGIN = 0.02;
/** On a paper polygon a pin goes only this near a corner, and onto it; the foot of a triangle's height this near a side. */
const CORNER_REACH_M = 0.06;
const SIDE_REACH_M = 0.025;
/** The real thing may be anywhere this near the desk's middle. */
const REAL_REACH = 1.0;
/** The words over the desk, and the time and points under them. */
const HEADER = new Vector3(0, 0.17, -0.45);
const STATUS = new Vector3(0, 0.135, -0.45);
/** The words breathe this much, once in this many seconds. */
const PANEL_PULSE = 0.05;
const PANEL_PULSE_S = 1.1;
/** The choices along the front of the desk, the tools on its right. */
const CARD_Z = 0.13;
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
  me_zoom: 'zoomIn',
  me_tl: 'turnLeft',
  me_tr: 'turnRight',
  me_tu: 'arrowUp',
  me_td: 'arrowDown',
  me_net: 'box',
  me_spin: 'turnRight',
  me_sh_square: 'square',
  me_sh_rectangle: 'rectangle',
  me_sh_triangle: 'triangle',
  me_sh_circle: 'circle',
  me_sh_cube: 'box',
  me_sh_cuboid: 'cuboid',
  me_sh_paper: 'paper',
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

const pinGeo = new SphereGeometry(0.0055, 16, 12);
// A pin with no thread is red, one with a thread green; the point a controller is about to drop is blue.
const pinMat = new MeshStandardMaterial({ color: 0xe53935, roughness: 0.6 });
const greenMat = new MeshStandardMaterial({ color: 0x2fa84f, roughness: 0.6 });
// The pin a ray points at, to start a thread from or to end one on.
const hoverMat = new MeshStandardMaterial({ color: 0xffc940, roughness: 0.5, emissive: 0x7a5a00 });
const threadGeo = new CylinderGeometry(0.0017, 0.0017, 1, 8).translate(0, 0.5, 0);
// A thread lying on flat paper would sink into it: it is lifted, and wins the paper's depth.
const threadMat = new MeshStandardMaterial({ color: BLUE, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const THREAD_LIFT = 0.004;
// The line a turning ball writes on itself.
const trailMat = new MeshStandardMaterial({ color: 0xf28c28, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
/** The ball makes one turn in this many seconds. */
const SPIN_S = 3.5;
/** The line is drawn in pieces this long (frame metres), a hair over the ball. */
const TRAIL_STEP_M = 0.006;
const TRAIL_LIFT_M = 0.003;
/** On a round paper object a ray this near the centre is drawn onto it; this near the rim, the surface or the foot of the height, onto that. */
const CENTRE_REACH_M = 0.03;
const SURFACE_REACH_M = 0.04;
const FOOT_REACH_M = 0.04;
/** A ball or cylinder is swept with a fingertip: within this of its surface, faster than this, mostly sideways or mostly up and down. */
const SWIPE_NEAR_M = 0.05;
const SWIPE_SPEED = 0.6;
const SWIPE_COOL_S = 0.5;
const ghostGeo = new SphereGeometry(0.009, 16, 12);
const ghostMat = new MeshBasicMaterial({ color: 0x2f6fe0, transparent: true, opacity: 0.65, depthWrite: false });
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
  private rc = new Vector3();
  private rd = new Vector3();
  private rp = new Vector3();
  /** The folded corner the last cornerNear found on an opened net (frame metres), if it found one there. */
  private hitCube?: Vector3;
  private netFor?: HuntOffer;
  private netList: NetSpot[] = [];
  private t2 = new Vector3();
  private o2 = new Vector3();
  private d2 = new Vector3();
  private restoreDesk: () => void;
  private room: Room;
  private hands: Hands;
  private step: Step = 'grade';
  private grade?: number;
  private solid = false;
  /** What a child has of the real kind (a rectangle, a box), and the shapes offered for it. */
  private shape?: Shape;
  private shapesHere: Shape[] = [];
  /** The emulator's stand-in for a real object. */
  private mock?: { object: PaperObject; tint: MeshStandardMaterial };
  private source: 'paper' | 'real' = 'paper';
  private core?: HuntCore;
  private tasks: HuntTask[] = [];
  private lastTemplate = '';
  private offer?: HuntOffer;
  private cards: Entity[] = [];
  private panel?: Mesh;
  /** The controller holding the board's magnifier down: the board is close while it does. */
  private boardHeld?: Side;
  /** A hand's tap waiting to be worked (its ray), and the pin chosen to start a thread from. */
  private tapAim: Record<Side, { origin: Vector3; dir: Vector3 } | undefined> = { left: undefined, right: undefined };
  private selected?: Pin;
  private selectedBy: Side = 'right';
  /** A ball's circumference being drawn, with the card that turns it. */
  private spin?: Spin;
  private spinCard?: Entity;
  private swipeCool = 0;
  private preview?: { mesh: Mesh; label: Label };
  private stopTaps?: () => void;
  /** A hand's tap has brought the board close, and the next tap sends it back. */
  private boardOn = false;
  /** The magnifier card beside the tools: held, it brings the board close. */
  private zoomCard?: Entity;
  private lines: [string, number, string][] = [];
  private onBoard = false;
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
    this.stopTaps = host.handTaps((side, origin, dir) => {
      this.tapAim[side] = { origin: origin.clone(), dir: dir.clone() };
    });
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
    // BACK stands beside the last choice, one step on.
    this.card('me_back', this.t.back, CHOICE_STEP * 2, CARD_Z, CORAL);
  }

  private showGroups(): void {
    this.step = 'group';
    this.say([[this.t.title, 0.03, HEAD], [this.t.pickGroup, 0.022, INK]]);
    this.clearCards();
    this.card('me_flat', this.t.flat, -0.08, CARD_Z, TEAL);
    this.card('me_solid', this.t.solid, 0.08, CARD_Z, BLUE);
    this.card('me_back', this.t.back, 0.08 + CHOICE_STEP, CARD_Z, CORAL);
  }

  private showSources(): void {
    this.step = 'source';
    this.say([[this.t.title, 0.03, HEAD], [this.t.pickSource, 0.022, INK], [this.t.realNote, 0.016, INK]]);
    this.clearCards();
    this.card('me_paper', this.t.paper, -0.08, CARD_Z, YELLOW);
    this.card('me_real', this.t.real, 0.08, CARD_Z, PURPLE);
    this.card('me_back', this.t.back, 0.08 + CHOICE_STEP, CARD_Z, CORAL);
  }

  /** What shapes the child may have of the real kind in this grade, then the cards to choose among them. */
  private async loadObjects(): Promise<void> {
    this.step = 'loading';
    this.clearCards();
    let shapes: Shape[] = [];
    try {
      const core = await HuntCore.start(1, this.grade, this.host.player());
      const have = new Set(core.tasks(this.solid).map((t) => t.shape));
      core.dispose();
      // Boxes only for solids: a cup or a ball needs a depth the web does not give.
      const order: Shape[] = this.solid ? ['cuboid', 'cube'] : ['rectangle', 'square', 'circle', 'triangle'];
      shapes = order.filter((s) => have.has(s));
    } catch (error) {
      console.warn(`[measure] could not list the shapes: ${String(error)}`);
    }
    if (this.gone) return;
    this.shapesHere = shapes;
    this.showObjects();
  }

  private showObjects(): void {
    this.step = 'object';
    this.say([[this.t.title, 0.03, HEAD], [this.t.pickObject, 0.022, INK], [this.t.objectNote, 0.016, INK]]);
    this.clearCards();
    const n = this.shapesHere.length + 1;
    const at = (i: number) => (i - (n - 1) / 2) * 0.105;
    const colours = [TEAL, BLUE, PURPLE, YELLOW];
    this.shapesHere.forEach((s, i) => this.card(`me_sh_${s}` as MeasureChoice, this.t.shapes[s] ?? s, at(i), CARD_Z, colours[i % colours.length]));
    this.card('me_sh_paper', this.t.paper, at(n - 1), CARD_Z, YELLOW);
    this.card('me_back', this.t.back, Math.min(0.38, at(n - 1) + 0.13), CARD_Z, CORAL);
  }

  private showHow(): void {
    this.step = 'how';
    const lines: [string, number, string][] = [[this.t.howTitle, 0.026, HEAD]];
    const hands = !this.host.controllers() && this.host.handsRay();
    for (const l of this.host.controllers() ? this.t.howTrigger : hands ? this.t.howHand : this.t.how) lines.push([l, 0.017, INK]);
    if (this.solid && this.source === 'paper') lines.push([hands ? this.t.howSolidHand : this.t.howSolid, 0.017, INK]);
    this.say(lines);
    this.clearCards();
    this.card('me_start', this.t.start, 0, CARD_Z, TEAL);
    this.card('me_back', this.t.back, CHOICE_STEP, CARD_Z, CORAL);
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
    // Of a real object, only the problems of the shape the child has.
    if (this.source === 'real' && this.shape) {
      const mine = this.tasks.filter((t) => t.shape === this.shape);
      if (mine.length > 0) this.tasks = mine;
    }
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
    if (o.source === 'real') this.showMock(o.shape);
    console.info(`[measure] task ${o.offer_id}: ${o.template_id} ${o.shape} ${o.task} (${o.source})`, o.size ?? {});
    if (o.source === 'paper') {
      this.paper = paperObject(o.shape, o.size ?? {}, o.keys ?? []);
      this.paper.root.position.copy(OBJECT_AT);
      this.paper.root.scale.setScalar(PAPER_SCALE);
      this.metric.add(this.paper.root);
    }
    this.hint = this.steps(o);
    this.message = '';
    this.step = 'measure';
    this.showTask();
    this.clearCards();
    // The tools step back as they stand further off, so each is within reach: CLEAR left of SKIP, READ left of CLEAR.
    this.card('me_clear', this.t.clear, TOOLS_X - 0.07, -0.06, YELLOW);
    this.card('me_skip', this.t.skip, TOOLS_X, 0.025, BLUE);
    this.card('me_back', this.t.back, TOOLS_X, CARD_Z, CORAL);
    // A paper solid turns by arrow cards (the corners behind it come to the front), and opens flat by NET.
    if (o.source === 'paper' && this.paper?.solid) this.addTurnCards();
    sfx('unfold');
  }

  /** The cards that turn a paper solid, standing as a cross: UP over the two turns, DOWN under them, NET below. */
  private addTurnCards(): void {
    this.card('me_tu', this.t.turnUp, -0.36, -0.18, BLUE);
    this.card('me_tl', this.t.turnLeft, -0.415, -0.1, TEAL);
    this.card('me_tr', this.t.turnRight, -0.305, -0.1, TEAL);
    this.card('me_td', this.t.turnDown, -0.36, -0.02, BLUE);
    if (this.paper?.unfold) this.card('me_net', this.t.net, -0.36, 0.06, PURPLE);
  }

  private steps(o: HuntOffer): string {
    const s = this.t.steps;
    if (o.shape === 'cube' || o.shape === 'cuboid') return s.box;
    if (o.shape === 'triangle' && o.task === 'area') return s.triangleArea;
    if (o.shape === 'cylinder' && o.task === 'volume') return s.cylinderVolume;
    if (o.shape === 'sphere' && o.task !== 'perimeter') return s.sphereVolume;
    return s[o.shape];
  }

  private showTask(): void {
    const o = this.offer;
    if (!o) return;
    const lines: [string, number, string][] = [[o.prompt[getLang()], 0.022, HEAD], [this.hint, 0.016, INK]];
    // How a pin and a thread are made, and what the cards at the side are for.
    lines.push([this.host.controllers() ? this.t.tapTrigger : this.t.tapHand, 0.014, INK]);
    if (o.source === 'paper' && this.paper?.solid) lines.push([this.t.toolsNote, 0.014, INK]);
    if (o.source === 'paper' && (o.shape === 'sphere' || o.shape === 'cylinder')) lines.push([this.t.sweepNote, 0.014, INK]);
    if (o.source === 'real') lines.push([this.t.realTask, 0.015, INK]);
    if (o.shape === 'circle' || o.shape === 'cylinder' || o.shape === 'sphere') lines.push([this.t.pi, 0.015, INK]);
    if (this.message) lines.push([this.message, 0.018, this.messageInk]);
    this.say(lines);
  }

  private showChoices(r: Reading): void {
    this.step = 'choose';
    this.clearCards();
    const unit = this.t.unit[this.offer?.unit ?? 'cm'] ?? '';
    r.choices.forEach((c, i) => this.card(`me_a${i}` as MeasureChoice, `${c} ${unit}`, (i - 2) * CHOICE_STEP, CARD_Z, BLUE));
    this.card('me_back', this.t.back, TOOLS_X, -0.06, CORAL);
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
        this.shape = undefined;
        if (this.source === 'real') void this.loadObjects();
        else this.showHow();
        return;
      case 'me_sh_square':
      case 'me_sh_rectangle':
      case 'me_sh_triangle':
      case 'me_sh_circle':
      case 'me_sh_cube':
      case 'me_sh_cuboid':
      case 'me_sh_paper':
        if (this.step !== 'object') return;
        if (choice === 'me_sh_paper') {
          this.source = 'paper';
          this.shape = undefined;
        } else this.shape = choice.slice('me_sh_'.length) as Shape;
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
      case 'me_tl':
      case 'me_tr':
        this.turnBy(Y, choice === 'me_tr' ? 1 : -1);
        return;
      case 'me_tu':
      case 'me_td':
        // Rolled away from the player (UP) or towards them (DOWN).
        this.turnBy(X, choice === 'me_td' ? 1 : -1);
        return;
      case 'me_net':
        if (this.step === 'measure' && this.paper?.unfold) {
          this.unfoldTo = this.unfoldTo > 0 ? 0 : 1;
          sfx(this.unfoldTo > 0 ? 'unfold' : 'fold');
        }
        return;
      case 'me_spin':
        this.startSpin();
        return;
      case 'me_zoom':
        // A controller holds the card down (see magnify); a hand taps it on and taps it off.
        if (!this.host.controllers()) {
          this.boardOn = !this.boardOn;
          setBoardNear(this.boardOn);
        }
        return;
      case 'me_back':
        if (this.step === 'grade' || this.step === 'recap') this.host.closed();
        else if (this.step === 'group') {
          if (this.host.grade() === undefined) this.showGrades();
          else this.host.closed();
        } else if (this.step === 'source') this.showGroups();
        else if (this.step === 'object') this.showSources();
        else if (this.step === 'how') {
          if (this.source === 'real') this.showObjects();
          else this.showSources();
        }
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
    if (this.panel) {
      const k = 0.5 - 0.5 * Math.cos((performance.now() / 1000 / PANEL_PULSE_S) * Math.PI * 2);
      this.panel.scale.setScalar(1 + PANEL_PULSE * k);
    }
    this.hands.update(delta);
    if (boardUp() !== this.onBoard && this.lines.length > 0) this.show();
    for (const side of SIDES) this.readTip(side, delta);
    this.magnify();
    this.workTaps();
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
    if (this.spin?.stage === 'turning') this.runSpin(delta);
    else this.turnSolid(delta);
    this.blinkSpin();
    this.swipes(delta);
    if (this.step !== 'measure' || this.moving()) {
      this.trash.visible = false;
      this.active = undefined;
      for (const side of SIDES) this.ghosts[side].visible = false;
      return;
    }
    this.paintPins();
    this.showPreview();
    this.updateBin(delta);
    // A controller's trigger works as a hand's tap does: the same running line, pin by pin.
    if (this.host.controllers() && !this.boardHeld) {
      for (const side of SIDES) {
        if (this.grabEdges(side).start && this.aimRay(side, this.o2, this.d2)) this.tapAim[side] = { origin: this.o2.clone(), dir: this.d2.clone() };
      }
    }
    if (this.spin) {
      for (const side of SIDES) this.ghosts[side].visible = false;
      return;
    }
    for (const side of SIDES) {
      if (this.boardHeld === side || this.binPress(side)) continue;
      this.pullThread(side);
      this.dropPin(side, delta);
    }
  }

  /** A pin with a thread (or one being pulled from) is green, one without is red. */
  private paintPins(): void {
    const pointed = new Set<Pin>();
    for (const side of SIDES) {
      const pull = this.pulls.get(side);
      const pin = this.pinAtRay(side, pull?.from);
      if (pin) pointed.add(pin);
    }
    for (const p of this.pins) {
      const used = this.threads.some((t) => t.a === p || t.b === p) || [...this.pulls.values()].some((pl) => pl.from === p);
      const calling = this.spin?.stage === 'close' && this.spin.outer === p;
      const hover = pointed.has(p) || p === this.selected || calling;
      const m = hover ? hoverMat : used ? greenMat : pinMat;
      if (p.mesh.material !== m) p.mesh.material = m;
      const k = calling ? 1.8 + 0.5 * (0.5 - 0.5 * Math.cos((performance.now() / 1000 / 0.7) * Math.PI * 2)) : hover ? 1.5 : 1;
      if (p.mesh.scale.x !== k) p.mesh.scale.setScalar(k);
    }
  }

  /** The pin a controller's ray points at (other than `except`), by the cone of the ray. */
  private pinAtRay(side: Side, except?: Pin): Pin | undefined {
    if (!this.rayMode() || this.pins.length === 0) return undefined;
    if (!this.aimRay(side, this.o2, this.d2)) return undefined;
    return this.pinOnRay(this.o2, this.d2, except);
  }

  /** Whether a ray aims this frame: a controller's, or a tracked hand's under the hand menu. */
  private rayMode(): boolean {
    return this.host.controllers() || this.host.handsRay();
  }

  /** How near pins may stand: nearer on a real object, which may be small. */
  private pinGap(): number {
    return this.source === 'real' ? REAL_PIN_GAP_M : PIN_GAP_M;
  }

  /** Hands work by rays and taps (no trigger, no pinch to pull). */
  private handRay(): boolean {
    return !this.host.controllers() && this.host.handsRay();
  }

  /** A side's ray into `origin` and `dir`; false when it has none. */
  private aimRay(side: Side, origin: Vector3, dir: Vector3): boolean {
    if (this.host.controllers()) {
      const ray = this.host.ray(side);
      ray.getWorldPosition(origin);
      // A ray space looks down its -Z.
      ray.getWorldDirection(dir).negate();
      return true;
    }
    return this.host.handAim(side, origin, dir);
  }

  /** The pin nearest the line of a ray, by its cone (other than `except`). */
  private pinOnRay(origin: Vector3, dir: Vector3, except?: Pin): Pin | undefined {
    let best: Pin | undefined;
    let bestScore = 1;
    for (const p of this.pins) {
      if (p === except || !p.mesh.visible) continue;
      p.mesh.getWorldPosition(this.k1).sub(origin);
      const along = this.k1.dot(dir);
      if (along <= 0) continue;
      const score = this.k1.addScaledVector(dir, -along).length() / (RAY_PIN_M + RAY_PIN_SLOPE * along);
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
    return best;
  }

  /**
   * The magnifier card beside the tools (there when a board is up, in the
   * emulator): a trigger pressed with a ray on it, or a pinch on it, brings
   * the board close for as long as it is held; let go, the board goes back.
   */
  private magnify(): void {
    if (!boardUp()) {
      if (this.zoomCard?.active) this.host.remove(this.zoomCard);
      this.zoomCard = undefined;
      if (this.boardHeld) setBoardNear(false);
      this.boardHeld = undefined;
      return;
    }
    if (!this.zoomCard?.active) {
      this.zoomCard = this.host.button('me_zoom', 'zoomIn', this.t.zoom, ZOOM_X, ZOOM_Z, 'plain', HEAD);
    }
    const card = this.zoomCard.object3D;
    if (!card) return;
    card.getWorldPosition(this.t2);
    // Hands tap the card on and off (press); only a controller holds it.
    if (!this.host.controllers()) return;
    for (const side of SIDES) {
      const edges = this.grabEdges(side);
      if (this.boardHeld === side) {
        if (!this.triggerHeld[side]) {
          this.boardHeld = undefined;
          setBoardNear(false);
        }
        continue;
      }
      if (!edges.start || this.boardHeld) continue;
      const ray = this.host.ray(side);
      ray.getWorldPosition(this.o2);
      ray.getWorldDirection(this.d2).negate();
      this.t1.copy(this.t2).sub(this.o2);
      const along = this.t1.dot(this.d2);
      if (along > 0 && this.t1.addScaledVector(this.d2, -along).length() < MAGNIFIER_REACH_M) {
        this.boardHeld = side;
        setBoardNear(true);
        sfx('grab');
      }
    }
  }

  /**
   * A hand's tap that landed on no card, worked by what its ray points at: the bin
   * beside the lit pin takes the pin away; a pin is chosen to start a thread
   * from, or ends the thread from the chosen one; empty paper near a corner
   * takes a pin, which ends the chosen pin's thread too.
   */
  private workTaps(): void {
    for (const side of SIDES) {
      const tap = this.tapAim[side];
      if (!tap) continue;
      this.tapAim[side] = undefined;
      if (this.step !== 'measure' || this.moving() || this.boardHeld) continue;
      this.o2.copy(tap.origin);
      this.d2.copy(tap.dir);
      // While the ball's line is drawn, the only tap is on the pin it began at, when the line is back.
      if (this.spin) {
        if (this.spin.stage === 'close' && this.pinOnRay(this.o2, this.d2) === this.spin.outer) this.finishSpin();
        continue;
      }
      const lit = this.active;
      if (lit && this.trash.visible && this.nearBin(this.o2, this.d2)) {
        lit.mesh.getWorldPosition(this.t2);
        this.active = undefined;
        this.trash.visible = false;
        this.removePin(lit);
        sfx('pop', { at: this.t2 });
        this.message = '';
        this.showTask();
        continue;
      }
      const pin = this.pinOnRay(this.o2, this.d2);
      if (pin) {
        this.choosePin(pin, side);
        continue;
      }
      this.v.copy(this.o2);
      if (!this.aim(this.v, this.d2)) continue;
      if (this.pins.length >= this.maxPins()) {
        if (this.pinnable(this.v)) this.tell(this.t.allPins(this.maxPins()));
        continue;
      }
      if (!this.pinnable(this.v)) {
        this.tell(this.t.farPin);
        continue;
      }
      const made = this.addPin(this.v);
      this.selectedBy = side;
      if (this.selected && made !== this.selected) this.join(this.selected, made);
      // The line goes on from the new pin, until the shape has what it needs and the answers come.
      if (this.step === 'measure') this.selected = made;
    }
  }

  /** A tap on a pin: it is chosen; tapped again it is let go; with another chosen, a thread joins them. */
  private choosePin(pin: Pin, side: Side): void {
    this.selectedBy = side;
    if (!this.selected) {
      this.selected = pin;
      sfx('grab');
      return;
    }
    // The same pin again lets the line go; another fixes the line to it, and the next line starts there.
    if (this.selected === pin) {
      this.clearSelection();
      return;
    }
    this.join(this.selected, pin);
    if (this.step === 'measure') this.selected = pin;
  }

  private clearSelection(): void {
    this.selected = undefined;
    if (!this.preview) return;
    this.preview.mesh.removeFromParent();
    dropLabel(this.preview.label);
    this.preview = undefined;
  }

  /** Whether a world point is in or near the paper object (or, for a real thing, anywhere on the desk). */
  private roundPaper(world: Vector3): boolean {
    if (!this.paper) return true;
    this.paper.spin.getWorldPosition(this.u);
    // An opened net reaches much further than the folded box.
    const reach = this.netOpen() ? this.netReach() : this.paper.radius;
    return world.distanceTo(this.u) < reach * PAPER_SCALE + 0.1;
  }

  /** The box is part-way between folded and open: nothing is placed while it moves. */
  private moving(): boolean {
    return this.unfolded > 0 && this.unfolded < 1;
  }

  /** The box lies open as its net. */
  private netOpen(): boolean {
    return this.unfolded === 1;
  }

  /** The corners of the opened net, each with the corner of the folded box it is (cached for the offer). */
  private netSpots(): NetSpot[] {
    const keys = this.offer?.keys;
    if (this.netFor === this.offer) return this.netList;
    this.netFor = this.offer;
    this.netList = [];
    if (!keys?.length) return this.netList;
    const span = (i: number) => {
      const v = keys.map((k) => k[i]);
      return Math.max(...v) - Math.min(...v);
    };
    // The box as the paper makes it (see boxNet): the bottom on the desk, the sides folded out of it, the top past the back.
    const hw = span(0) / 2;
    const hd = span(2) / 2;
    const h = span(1);
    const add = (nx: number, nz: number, cx: number, cy: number, cz: number) =>
      this.netList.push({ net: new Vector3(nx / 100, NET_LIFT, nz / 100), cube: new Vector3(cx / 100, cy / 100, cz / 100) });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(sx * hw, sz * hd, sx * hw, 0, sz * hd);
        add(sx * (hw + h), sz * hd, sx * hw, h, sz * hd);
      }
      add(sx * hw, hd + h, sx * hw, h, hd);
      add(sx * hw, -hd - h, sx * hw, h, -hd);
      add(sx * hw, -hd - h - 2 * hd, sx * hw, h, hd);
    }
    return this.netList;
  }

  /** How far the opened net reaches from the box's middle, in metres. */
  private netReach(): number {
    const keys = this.offer?.keys;
    if (!keys?.length) return this.paper?.radius ?? 0;
    const span = (i: number) => Math.max(...keys.map((k) => k[i])) - Math.min(...keys.map((k) => k[i]));
    return (2.6 * Math.max(span(0), span(1), span(2))) / 100;
  }

  /** The corner of the opened net nearest a frame point, if one is within `reach`. */
  private nearestNet(local: Vector3, reach: number): NetSpot | undefined {
    let best: NetSpot | undefined;
    let bestD = reach;
    for (const s of this.netSpots()) {
      const d = local.distanceTo(s.net);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    return best;
  }

  /** Where the core reads a pin: its folded corner on an opened net, else where it stands. */
  private at(p: Pin): Vector3 {
    return p.cube ?? p.mesh.position;
  }

  /** The two pins stand at one corner of the box (a corner shows in more than one place on its net). */
  private same(a: Pin, b: Pin): boolean {
    return a === b || this.at(a).distanceTo(this.at(b)) < 1e-4;
  }

  /** A pin of the net shows between its folded and its opened place as the box opens. */
  private seat(p: Pin): void {
    if (p.cube && p.net) p.mesh.position.lerpVectors(p.cube, p.net, this.unfolded);
  }

  /** The thread from the chosen pin follows the ray, with its length on it, as a pulled thread does. */
  private showPreview(): void {
    const from = this.selected;
    if (!from) return;
    if (!this.preview) {
      const mesh = new Mesh(threadGeo, threadMat);
      const label = new Label('', { height: 0.026 });
      this.frame().add(mesh, label.mesh);
      this.host.billboard(label.mesh);
      onTop(label);
      mesh.visible = false;
      label.mesh.visible = false;
      this.preview = { mesh, label };
    }
    const side = this.selectedBy;
    const through = this.pinAtRay(side, from);
    // Without an end to reach it is not shown: a thread not yet laid stands a metre tall at the middle.
    // The line follows the hand while it points in or near the paper; its end rests on a corner it comes near.
    let ended = true;
    if (through) through.mesh.getWorldPosition(this.v);
    else {
      ended = this.tip(side, false, this.v) && this.roundPaper(this.v);
      if (ended && this.cornerNear(this.v, this.k2)) this.v.copy(this.k2);
    }
    this.preview.mesh.visible = ended;
    this.preview.label.mesh.visible = ended;
    if (!ended) return;
    this.w.copy(this.v);
    this.frame().worldToLocal(this.w);
    this.lay(this.preview.mesh, this.preview.label, from.mesh.position, this.w);
  }

  /** The bin wakes over the pin a tip is near, stays while a tip is round it or on it, and goes a moment after. */
  private updateBin(delta: number): void {
    let near: Pin | undefined;
    let keep = false;
    for (const side of SIDES) {
      if (this.tip(side, false, this.t1)) {
        const pin = this.pinAtRay(side) ?? this.nearestPin(this.t1, ACTIVE_M);
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
    if (this.rayMode()) {
      if (!this.aimRay(side, this.o2, this.d2)) return false;
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
    if (this.rayMode()) return false;
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
    if (this.rayMode()) {
      if (!this.aimRay(side, this.v, this.w)) {
        this.aimed[side] = false;
        return;
      }
      if (delta > 0) this.rayVel[side].copy(this.v).sub(this.lastRay[side]).divideScalar(delta);
      this.lastRay[side].copy(this.v);
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
    if (this.rayMode() && !(pinch && this.handRay())) {
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
      this.snapRound(origin);
      return true;
    }
    // A real box: a ray near the vertical line over a pin of its base takes a point on that line (its top).
    if (this.source === 'real') {
      const up = this.verticalSnap(origin, dir);
      if (up) {
        origin.copy(up);
        return true;
      }
    }
    // The desk's top, under the paper object or the real one.

    this.metric.getWorldPosition(this.u);
    this.metric.getWorldQuaternion(this.q);
    this.deskPlane.setFromNormalAndCoplanarPoint(this.n.copy(UP).applyQuaternion(this.q), this.u);
    if (!this.caster.ray.intersectPlane(this.deskPlane, this.u)) return false;
    if (this.u.distanceTo(origin) > AIM_FAR_M) return false;
    origin.copy(this.u);
    this.snapRound(origin);
    return true;
  }

  /**
   * On a paper circle, cylinder or ball the point aimed at is drawn onto what the
   * next pin is for: the centre first (a ball's is seen through its glass: the
   * ray only has to pass near it), then the rim, or the ball's surface, along the
   * way the line is pulled; a cylinder's height ends on the desk under the rim pin.
   * Real objects have no known centre, so nothing is drawn onto them.
   */
  private snapRound(point: Vector3): boolean {
    const o = this.offer;
    const paper = this.paper;
    const keys = o?.keys;
    const radius = o?.size?.r;
    if (!o || !paper || !keys || keys.length < 2 || !radius || this.spin || this.moving()) return false;
    if (o.shape !== 'circle' && o.shape !== 'cylinder' && o.shape !== 'sphere') return false;
    const R = radius / 100;
    const frame = paper.frame;
    frame.updateWorldMatrix(true, false);
    const c = this.rc.set(keys[0][0] / 100, keys[0][1] / 100, keys[0][2] / 100);
    const start = this.selected;
    if (o.shape === 'sphere') {
      // The ray in the ball's frame: its origin in rd, its way in rp.
      const ray = this.caster.ray;
      this.rd.copy(ray.origin);
      frame.worldToLocal(this.rd);
      this.rp.copy(ray.origin).add(ray.direction);
      frame.worldToLocal(this.rp);
      this.rp.sub(this.rd).normalize();
      this.k1.copy(c).sub(this.rd);
      const along = this.k1.dot(this.rp);
      if (along <= 0) return false;
      this.k1.addScaledVector(this.rp, -along);
      const miss = this.k1.length();
      if (!start) {
        if (miss > CENTRE_REACH_M) return false;
        point.copy(c);
        frame.localToWorld(point);
        return true;
      }
      if (miss > R + SURFACE_REACH_M) return false;
      if (miss <= R) {
        // Through the glass: where the ray first meets the ball.
        point.copy(this.rd).addScaledVector(this.rp, along - Math.sqrt(R * R - miss * miss));
      } else {
        // Just past its edge: the nearest point of the surface.
        point.copy(this.rd).addScaledVector(this.rp, along).sub(c).setLength(R).add(c);
      }
      frame.localToWorld(point);
      return true;
    }
    const lift = o.shape === 'circle' ? 0.0015 : 0;
    this.k1.copy(point);
    frame.worldToLocal(this.k1);
    if (!start) {
      // The cylinder's middle is on its lid: a ray on its side or the desk is not at it.
      if (o.shape === 'cylinder' && this.k1.y < c.y * 0.5) return false;
      if (Math.hypot(this.k1.x - c.x, this.k1.z - c.z) > CENTRE_REACH_M) return false;
      point.set(c.x, c.y + lift, c.z);
      frame.localToWorld(point);
      return true;
    }
    const at = start.mesh.position;
    // A cylinder's height: from the rim pin straight down to the desk.
    if (o.shape === 'cylinder' && o.task === 'volume' && this.pins.length >= 2) {
      this.rp.set(at.x, 0, at.z);
      if (this.k1.distanceTo(this.rp) > FOOT_REACH_M) return false;
      point.copy(this.rp);
      frame.localToWorld(point);
      return true;
    }
    // The rim, along the way the line is pulled from the middle.
    this.rp.copy(at);
    if (Math.hypot(at.x - c.x, at.z - c.z) < 0.04) this.rp.set(c.x, at.y, c.z);
    const dx = this.k1.x - this.rp.x;
    const dz = this.k1.z - this.rp.z;
    const reach = Math.hypot(dx, dz);
    if (reach < 1e-3 || Math.abs(reach - R) > SURFACE_REACH_M) return false;
    point.set(this.rp.x + (dx / reach) * R, this.rp.y, this.rp.z + (dz / reach) * R);
    frame.localToWorld(point);
    return true;
  }

  /** The point on the vertical line over a base pin that a ray passes nearest, if it passes near enough. */
  private verticalSnap(origin: Vector3, dir: Vector3): Vector3 | undefined {
    if (!this.solid || this.pins.length === 0) return undefined;
    this.metric.getWorldQuaternion(VS_Q).invert();
    VS_D.copy(dir).applyQuaternion(VS_Q);
    VS_O.copy(origin);
    this.metric.worldToLocal(VS_O);
    let best: { x: number; y: number; z: number } | undefined;
    let bestD = VERT_REACH_M;
    for (const p of this.pins) {
      const bx = p.mesh.position.x;
      const bz = p.mesh.position.z;
      // Base pins only: the ones that stand on the desk.
      if (p.mesh.position.y > 0.02) continue;
      const wx = VS_O.x - bx;
      const wz = VS_O.z - bz;
      const b = VS_D.y;
      const d0 = VS_D.x * wx + VS_D.y * VS_O.y + VS_D.z * wz;
      const denom = 1 - b * b;
      if (denom < 1e-3) continue;
      const t = (b * VS_O.y - d0) / denom;
      const s = (VS_O.y - b * d0) / denom;
      if (t <= 0 || s < 0.03 || s > 0.6) continue;
      const dist = Math.hypot(VS_O.x + VS_D.x * t - bx, VS_O.y + VS_D.y * t - s, VS_O.z + VS_D.z * t - bz);
      if (dist < bestD) {
        bestD = dist;
        best = { x: bx, y: s, z: bz };
      }
    }
    if (!best) return undefined;
    return this.metric.localToWorld(new Vector3(best.x, best.y, best.z));
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
    if (!this.paper || !keys || this.moving()) return;
    this.n.copy(world);
    this.paper.frame.worldToLocal(this.n);
    if (this.netOpen()) {
      const spot = this.nearestNet(this.n, MAGNET_M);
      if (spot) world.copy(this.paper.frame.localToWorld(this.n.copy(spot.net)));
      return;
    }
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
    this.hitCube = undefined;
    if (!this.paper || !keys || !this.polygon()) return false;
    this.k1.copy(world);
    this.paper.frame.worldToLocal(this.k1);
    // Opened flat, a box's corners are where its net has them, each one of the folded box's.
    if (this.moving()) return false;
    if (this.netOpen()) {
      const spot = this.nearestNet(this.k1, CORNER_REACH_M);
      if (!spot) return false;
      this.hitCube = spot.cube;
      out.copy(spot.net);
      this.paper.frame.localToWorld(out);
      return true;
    }
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
      if (world.distanceTo(this.u) > this.paper.radius * PAPER_SCALE + OBJECT_MARGIN) return false;
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
      if (p === except || !p.mesh.visible) continue;
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
      case 'cylinder':
        // The middle of the top, a point of its rim, and the foot of the height.
        return o.task === 'volume' ? 3 : 2;
      default:
        return 2;
    }
  }

  /** A pointing finger held still drops a pin where it points; a controller's trigger drops one at once. */
  private dropPin(side: Side, delta: number): void {
    const ghost = this.ghosts[side];
    ghost.visible = false;
    if (this.pulls.has(side) || this.turns.has(side)) return;
    if (this.rayMode()) {
      if (!this.tip(side, false, this.v)) return;
      const onPin = this.pinAtRay(side) !== undefined || this.nearestPin(this.v, GRAB_M) !== undefined;
      const free = !onPin && this.pins.length < this.maxPins() && this.pinnable(this.v) && !this.nearestPin(this.v, this.pinGap());
      // The mark shows the corner it will go onto.
      if (free && this.cornerNear(this.v, this.k2)) this.v.copy(this.k2);
      // A small mark where the ray points, so the pin is seen before it drops.
      if (free || onPin) {
        ghost.visible = true;
        ghost.position.copy(this.v);
        this.metric.worldToLocal(ghost.position);
        ghost.scale.setScalar(onPin ? 0.8 : 0.5);
      }
      return;
    }
    const h = this.hands.get(side);
    if (!h.tracked) return;
    const tip = h.tip;
    if (!this.armed[side]) {
      if (tip.distanceTo(this.lastPin[side]) > REARM_M) this.armed[side] = true;
      else return;
    }
    if (this.pins.length >= this.maxPins() && h.pointing() && h.still() && this.pinnable(tip) && !this.nearestPin(tip, this.pinGap())) {
      this.tell(this.t.allPins(this.maxPins()));
    }
    const can = h.pointing() && h.still() && this.pins.length < this.maxPins() && this.pinnable(tip) && !this.nearestPin(tip, this.pinGap());
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
    let cube: Vector3 | undefined;
    if (this.cornerNear(spot, this.k2)) {
      const there = this.nearestPin(this.k2, 0.012);
      if (there) return there;
      world = this.k2.clone();
      cube = this.hitCube?.clone();
    }
    const mesh = new Mesh(pinGeo, pinMat);
    mesh.name = 'measure-pin';
    mesh.position.copy(world);
    this.frame().worldToLocal(mesh.position);
    this.frame().add(mesh);
    const pin: Pin = { mesh };
    // A pin on the opened net knows the corner of the folded box it stands for.
    if (cube) {
      pin.cube = cube;
      pin.net = mesh.position.clone();
    }
    this.pins.push(pin);
    console.info(`[measure] pin ${this.pins.length} at ${[mesh.position.x, mesh.position.y, mesh.position.z].map((v) => (v * 100).toFixed(1)).join(', ')} cm`);
    sfx('place', { at: world });
    this.changed();
    return pin;
  }

  private removePin(pin: Pin): void {
    if (this.selected === pin) this.clearSelection();
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
    // A ray, a controller's or a hand's, draws one running line by taps (see workTaps), never by pulling.
    if (this.rayMode()) return;
    const edges = this.grabEdges(side);
    const pull = this.pulls.get(side);
    if (!pull) {
      if (!edges.start || this.turns.has(side)) return;
      const through = this.pinAtRay(side);
      const touched = this.tip(side, true, this.v);
      if (!through && !touched) return;
      if (through) through.mesh.getWorldPosition(this.v);
      const from = through ?? this.nearestPin(this.v, GRAB_M);
      if (!from) return;
      const mesh = new Mesh(threadGeo, threadMat);
      const label = new Label('', { height: 0.026 });
      this.frame().add(mesh, label.mesh);
      this.host.billboard(label.mesh);
      onTop(label);
      this.pulls.set(side, { side, from, mesh, label });
      sfx('grab', { at: this.v });
      return;
    }
    this.tip(side, true, this.v);
    // The thread's end clings to the pin the ray points at, so it is seen to catch before it is let go.
    const catches = this.pinAtRay(side, pull.from);
    if (catches) catches.mesh.getWorldPosition(this.v);
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
      if (this.pins.length >= this.maxPins() || !this.pinnable(this.v) || this.nearestPin(this.v, this.pinGap())) return;
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
    onTop(label);
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
    mesh.position.y += THREAD_LIFT;
    mesh.scale.set(1, Math.max(len, 1e-4), 1);
    if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, this.u.divideScalar(len));
    label.set(`${Math.round(len * 100)} cm`);
    label.mesh.position.copy(a).add(b).multiplyScalar(0.5);
    label.mesh.position.y += 0.022;
  }

  private clearPins(): void {
    this.dropSpin();
    this.clearSelection();
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
      case 'cylinder': {
        if (o.task !== 'volume') return this.threads.length === 1 ? [this.threads[0].a, this.threads[0].b] : undefined;
        if (this.threads.length !== 2) return undefined;
        // The foot is the pin on the desk, the middle the one of the top nearer the axis.
        const foot = this.pins.reduce((a, b) => (b.mesh.position.y < a.mesh.position.y ? b : a));
        const top = this.pins.filter((p) => p !== foot);
        if (top.length !== 2 || foot.mesh.position.y > (o.size?.t ?? 0) / 200) return undefined;
        const off = (p: Pin) => Math.hypot(p.mesh.position.x, p.mesh.position.z);
        const [centre, rim] = off(top[0]) <= off(top[1]) ? top : [top[1], top[0]];
        return [centre, rim, foot];
      }
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
    const dir = (t: Thread) => this.at(t.b).clone().sub(this.at(t.a));
    const square = (x: Thread, y: Thread) => {
      const u = dir(x);
      const v = dir(y);
      return u.length() > 1e-4 && v.length() > 1e-4 && Math.abs(u.normalize().dot(v.normalize())) < SQUARE_COS;
    };
    // Two pins at one corner of the box are that corner (it shows in several places on an opened net).
    const has = (t: Thread, p: Pin) => this.same(t.a, p) || this.same(t.b, p);
    const other = (t: Thread, p: Pin) => (this.same(t.a, p) ? t.b : t.a);
    const share = (x: Thread, y: Thread) => [x.a, x.b].find((p) => has(y, p));
    const spot = (p: Pin): Spot => ({ pin: p, at: this.at(p).clone() });
    if (flat) {
      for (let i = 0; i < ths.length; i += 1) {
        for (let j = i + 1; j < ths.length; j += 1) {
          const corner = share(ths[i], ths[j]);
          if (!corner || !square(ths[i], ths[j])) continue;
          const a = other(ths[i], corner);
          const c = other(ths[j], corner);
          if (!this.onKeys([a, corner, c])) return undefined;
          // The fourth corner completes the rectangle.
          const d = this.at(a).clone().add(this.at(c)).sub(this.at(corner));
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
          const at = this.at(corner);
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
    if (pins.every((p) => this.nearKey(this.at(p)) <= snap)) return true;
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
    if (!o || !this.core || this.step !== 'measure' || this.spin) return;
    const ring = this.order();
    const spots = ring ? ring.map((p): Spot => ({ pin: p, at: this.at(p).clone() })) : this.fromEdges();
    if (!spots) {
      console.info(`[measure] waiting: ${this.pins.length} pins, ${this.threads.length} threads`);
      return;
    }
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
      if (pin.cube) {
        pin.cube.set(p[0] / 100, p[1] / 100, p[2] / 100);
        this.seat(pin);
      } else pin.mesh.position.set(p[0] / 100, p[1] / 100, p[2] / 100);
    });
    for (const th of this.threads) this.lay(th.mesh, th.label, th.a.mesh.position, th.b.mesh.position);
    sfx('sparkle');
    this.message = this.t.measured(r.process_points);
    this.messageInk = '#2f7d32';
    this.showTask();
    // A ball's circumference is seen being drawn before the answers come.
    const outer = spots[1]?.pin;
    if (o.source === 'paper' && o.shape === 'sphere' && o.task === 'perimeter' && outer && r.choices.length > 0) {
      this.holdSpin(r, outer);
      return;
    }
    if (r.choices.length === 0) {
      this.core.close(o.offer_id);
      this.nextTask();
      return;
    }
    this.clearSelection();
    this.showChoices(r);
  }

  // ------------------------------------------------------------ a ball's circumference

  /** The ball is measured from its middle to its surface: TURN blinks, and the answers wait for the line to come round. */
  private holdSpin(r: Reading, outer: Pin): void {
    this.clearSelection();
    const trail = new Group();
    trail.name = 'measure-trail';
    this.paper?.frame.add(trail);
    this.spin = { stage: 'press', reading: r, outer, angle: 0, q0: new Quaternion(), rel0: new Vector3(), pen: new Vector3(), axis: new Vector3(), trail, last: new Vector3() };
    // CLEAR, SKIP and the cards that turn the ball stay; TURN takes the place NET would have.
    this.card('me_spin', this.t.turn, -0.36, 0.06, PURPLE);
    this.spinCard = this.cards[this.cards.length - 1];
    this.message = `${this.t.measured(r.process_points)} ${this.t.spinPress}`;
    this.messageInk = '#2f7d32';
    this.showTask();
  }

  /** TURN is pressed: the ball turns once about an axis square to its radius, a pen at the pin's place writing a great circle on it. */
  private startSpin(): void {
    const s = this.spin;
    const paper = this.paper;
    const radius = this.offer?.size?.r;
    if (!s || s.stage !== 'press' || !paper || !radius) return;
    s.stage = 'turning';
    s.angle = 0;
    this.turnGoal = undefined;
    this.flicking = false;
    this.spinVel = 0;
    this.turns.clear();
    s.q0.copy(paper.spin.quaternion);
    // The pin's place in the ball's own frame about its middle, and where that is in the root's: the pen stays there.
    s.rel0.copy(s.outer.mesh.position);
    s.rel0.y -= radius / 100;
    s.pen.copy(s.rel0).applyQuaternion(s.q0);
    s.axis.copy(s.pen).cross(Y);
    if (s.axis.length() < 0.3 * s.pen.length()) s.axis.copy(s.pen).cross(X);
    s.axis.normalize();
    s.last.copy(s.outer.mesh.position);
    this.removeCard(this.spinCard);
    this.spinCard = undefined;
    this.message = '';
    this.showTask();
    sfx('unfold');
  }

  /** One frame of the turn: the ball moves, and the pen writes a piece of line where it touches. */
  private runSpin(delta: number): void {
    const s = this.spin;
    const paper = this.paper;
    const radius = (this.offer?.size?.r ?? 0) / 100;
    if (!s || s.stage !== 'turning' || !paper || radius <= 0) return;
    const full = Math.PI * 2;
    s.angle = Math.min(full, s.angle + (full / SPIN_S) * delta);
    paper.spin.quaternion.setFromAxisAngle(s.axis, s.angle).multiply(s.q0);
    // The pen's touch in the ball's frame: the pen's place turned back, out of the ball's turn.
    this.n.copy(s.pen).applyAxisAngle(s.axis, -s.angle).applyQuaternion(this.q.copy(s.q0).invert());
    this.n.multiplyScalar(1 + TRAIL_LIFT_M / radius);
    this.n.y += radius;
    const done = s.angle >= full;
    if (done) this.n.copy(s.outer.mesh.position);
    this.u.copy(this.n).sub(s.last);
    const len = this.u.length();
    if (len >= TRAIL_STEP_M || (done && len > 1e-4)) {
      const piece = new Mesh(threadGeo, trailMat);
      piece.position.copy(s.last);
      piece.scale.set(1, len, 1);
      piece.quaternion.setFromUnitVectors(UP, this.u.divideScalar(len));
      s.trail.add(piece);
      s.last.copy(this.n);
    }
    if (!done) return;
    paper.spin.quaternion.copy(s.q0);
    s.stage = 'close';
    sfx('sparkle');
    this.message = this.t.spinClose;
    this.messageInk = '#2f7d32';
    this.showTask();
  }

  /** The line is back at its start and that pin is tapped: the answers come. */
  private finishSpin(): void {
    const s = this.spin;
    if (!s) return;
    this.dropSpin();
    sfx('right');
    this.showChoices(s.reading);
  }

  /** Puts away the ball's turn: its card, its line, and the ball back as it stood. */
  private dropSpin(): void {
    const s = this.spin;
    if (!s) return;
    this.spin = undefined;
    if (s.stage === 'turning' && this.paper) this.paper.spin.quaternion.copy(s.q0);
    for (const piece of [...s.trail.children]) piece.removeFromParent();
    s.trail.removeFromParent();
    this.removeCard(this.spinCard);
    this.spinCard = undefined;
  }

  private removeCard(card?: Entity): void {
    if (!card) return;
    if (card.active) this.host.remove(card);
    this.cards = this.cards.filter((c) => c !== card);
  }

  /**
   * A ball or a cylinder turns a quarter at each sweep of a fingertip over it, left or right,
   * up or down, never slantwise; a controller's thumbstick does the same.
   */
  private swipes(delta: number): void {
    const paper = this.paper;
    const shape = this.offer?.shape;
    if (!paper?.solid || (shape !== 'sphere' && shape !== 'cylinder')) return;
    if (this.step !== 'measure' || this.spin?.stage === 'turning' || this.boardHeld) return;
    this.swipeCool -= delta;
    if (this.host.controllers()) {
      for (const side of SIDES) {
        const way = this.host.stick(side);
        if (way === 'left' || way === 'right') this.turnBy(Y, way === 'right' ? 1 : -1);
        else if (way === 'up' || way === 'down') this.turnBy(X, way === 'down' ? 1 : -1);
      }
      return;
    }
    if (this.swipeCool > 0) return;
    for (const side of SIDES) {
      const h = this.hands.get(side);
      if (!h.tracked) continue;
      this.n.copy(h.tip);
      this.metric.worldToLocal(this.n);
      paper.spin.getWorldPosition(this.u);
      this.metric.worldToLocal(this.u);
      if (this.n.distanceTo(this.u) > paper.radius * PAPER_SCALE + SWIPE_NEAR_M) continue;
      // The finger's speed in the desk's frame: x across, y up.
      this.w.copy(h.velocity).applyQuaternion(this.q.copy(this.metric.getWorldQuaternion(this.q)).invert());
      const across = Math.abs(this.w.x);
      const up = Math.abs(this.w.y);
      if (Math.hypot(across, up) < SWIPE_SPEED) continue;
      if (across > 1.6 * up) this.turnBy(Y, this.w.x > 0 ? 1 : -1);
      else if (up > 1.6 * across) this.turnBy(X, this.w.y > 0 ? -1 : 1);
      else continue;
      this.swipeCool = SWIPE_COOL_S;
      return;
    }
  }

  /** TURN blinks while it waits to be pressed. */
  private blinkSpin(): void {
    const card = this.spinCard;
    if (!card?.active || this.spin?.stage !== 'press') return;
    const face = (card.object3D?.userData.toolButton as { mesh?: Object3D } | undefined)?.mesh;
    if (!face) return;
    const k = 0.5 - 0.5 * Math.cos((performance.now() / 1000 / 0.6) * Math.PI * 2);
    face.scale.setScalar(1 + 0.16 * k);
  }

  // ------------------------------------------------------------ turning a paper solid

  /** A quarter turn of the paper solid about the desk's up (Y) or sideways (X), as the controller's buttons make. */
  private turnBy(axis: Vector3, sign: number): void {
    const spin = this.paper?.spin;
    if (!spin || !this.paper?.solid || this.unfoldTo > 0 || this.step !== 'measure' || this.spin?.stage === 'turning') return;
    const from = this.turnGoal ?? nearestSquare(spin.quaternion);
    this.turnGoal = new Quaternion().setFromAxisAngle(axis, (sign * Math.PI) / 2).multiply(from);
    sfx('fold');
  }

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
        if (this.w.distanceTo(this.u) > paper.radius * PAPER_SCALE + OBJECT_MARGIN) continue;
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
      // The pins set on the folded box are put away while it is open; those set on its net go with it
      // between the two, and so do their threads.
      for (const p of this.pins) {
        p.mesh.visible = this.unfolded === 0 || !!p.net;
        this.seat(p);
      }
      for (const th of this.threads) {
        th.mesh.visible = th.label.mesh.visible = th.a.mesh.visible && th.b.mesh.visible;
        if (th.mesh.visible) this.lay(th.mesh, th.label, th.a.mesh.position, th.b.mesh.position);
      }
    }
  }

  private turnStart(side: Side): boolean {
    if (this.host.controllers()) return this.host.squeeze(side).start;
    // A hand with a ray taps; it turns the solid by the arrow cards, not by pinching it.
    if (this.handRay()) return false;
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
    this.lines = lines;
    this.show();
  }

  /** The words go on the room's chalkboard when it has one, else on a panel over the desk. */
  private show(): void {
    const lines = this.lines;
    this.dropPanel();
    this.onBoard = boardUp();
    if (this.onBoard) {
      setBoard(lines.map(([text, size, ink]) => ({ text, size, ink })));
      return;
    }
    setBoard(undefined);
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
    if (this.mock) {
      this.mock.object.dispose();
      this.mock.tint.dispose();
      this.mock = undefined;
    }
  }

  /** In the emulator, which has no real object, a model of one of the true size stands at the middle of the desk. */
  private showMock(shape: Shape): void {
    if (!import.meta.env.DEV || !(window as unknown as { IWER_DEVICE?: unknown }).IWER_DEVICE) return;
    const spec = MOCK[shape];
    if (!spec) return;
    const object = paperObject(shape, spec.size, spec.keys ?? []);
    object.root.position.copy(OBJECT_AT);
    const tint = new MeshStandardMaterial({ color: 0xcfe3ff, roughness: 1, side: DoubleSide });
    object.root.traverse((o) => {
      if (o instanceof Mesh && o.userData.paper === true) o.material = tint;
    });
    this.metric.add(object.root);
    this.mock = { object, tint };
  }

  dispose(): void {
    if (this.gone) return;
    this.gone = true;
    if (this.offer && this.core && this.step !== 'verdict' && this.step !== 'recap') this.core.close(this.offer.offer_id);
    if (this.core && this.step !== 'recap') this.host.save(this.core.drainEvents(), true);
    this.clearShape();
    this.clearCards();
    this.dropPanel();
    setBoard(undefined);
    setBoardNear(false);
    this.stopTaps?.();
    this.clearSelection();
    this.boardOn = false;
    if (this.zoomCard?.active) this.host.remove(this.zoomCard);
    this.core?.dispose();
    if (this.root.active) this.host.remove(this.root);
    this.restoreDesk();
    setRoom(this.room);
  }
}

/** A thread's length is drawn over the paper object, so no face of a solid hides half of it. */
function onTop(l: Label): void {
  (l.mesh.material as MeshBasicMaterial).depthTest = false;
  l.mesh.renderOrder = 20;
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

