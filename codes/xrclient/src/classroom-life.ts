import { type Group, type Mesh, type MeshBasicMaterial } from '@iwsdk/core';

import { Label } from './art/label.js';
import { KID_HAIRS, type PaperFigure, paperKid, paperTeacher } from './art/paper-kid.js';
import { Builder, CLASS_BOARD, CLASS_CLOCK, CLASS_FRONT_Z, type Seat } from './art/rooms.js';
import { type ClassMoment, classroom } from './class-events.js';

/** Where the seated player's head is in the room's frame, for glances and name cards. */
const PLAYER_X = 0;
const PLAYER_Y = 1.15;
const PLAYER_Z = 0.45;
const RIVAL_COLORS = [0x3469c4, 0x3fb6a0];
const CLASS_COLORS = [0xf2716b, 0xf9c74f, 0x5db85b, 0xb198ea, 0xf8961e];
const CHAIRS = [0x3469c4, 0x3fb6a0, 0xf2716b, 0xf9c74f];
/** How long each moment plays on a rival, in seconds. */
const MOMENT_S: Record<ClassMoment, number> = { working: 0, right: 1.6, missed: 1.2, cheer: 1.8, clap: 1.6 };
/** Segments of the race's time around the clock face. */
const CLOCK_SEGMENTS = 24;
/** Box geometry drawn without an index: vertices per segment. */
const BOX_VERTS = 36;
const CLOCK_WARN_MS = 10_000;
const CHALK = 0xf4f1e6;
const TEACHER_Z = -3.0;
const TEACHER_X_MIN = 0.75;
const TEACHER_X_MAX = 2.3;
/** Where the teacher stands to point at what is written on the board. */
const TEACHER_BOARD_X = 1.25;

interface Kid {
  fig: PaperFigure;
  /** 0: a classmate in another row; 1 or 2: the rival on the left or the right. */
  desk: number;
  /** Turn of the head towards the player, from the seat. */
  glanceYaw: number;
  moment: ClassMoment;
  momentLeft: number;
  /** Counts down to the next look up from the sheet, and how long the look lasts. */
  nextLook: number;
  lookLeft: number;
  lookAtPlayer: boolean;
  /** Each part's pose now, eased towards its target. */
  headX: number;
  headY: number;
  aLx: number;
  aLz: number;
  aRx: number;
  aRz: number;
  phase: number;
  name?: Label;
  status?: Label;
}

/** Eases `now` towards `to` at `rate` per second (frame-rate independent). */
function ease(now: number, to: number, rate: number, dt: number): number {
  return now + (to - now) * (1 - Math.exp(-rate * dt));
}

/**
 * Life in the virtual classroom: the two rivals at the desks beside the
 * player while a race is on, classmates at work in the other rows, the
 * teacher walking by the board and pointing at what the race writes on it,
 * and the clock keeping real time with the round's time left on its face.
 * Everything is added to the room's group, so it goes when the room goes.
 */
export class ClassroomLife {
  private kids: Kid[] = [];
  /** The rivals on the left and the right. */
  private rivals: (Kid | undefined)[] = [undefined, undefined];
  /** Minutes the local clock is behind UTC, read once. */
  private tzMin = new Date().getTimezoneOffset();
  private teacher: PaperFigure;
  private tx = 1.6;
  private tyaw = Math.PI;
  private tTarget = 1.6;
  private tPause = 2;
  private tPointLeft = 0;
  private tStep = 0;
  private board: Label;
  private boardText = '';
  private boardAge = 0;
  private hourHand: Group;
  private minuteHand: Group;
  private timeLeft: Mesh;
  private timeWarn: Mesh;
  private labels: Label[] = [];
  private shownStatus = ['', ''];
  private shownName = ['', ''];
  private racing = false;

  constructor(private room: Group) {
    const seats = (room.userData.seats ?? []) as Seat[];
    let n = 0;
    for (const seat of seats) {
      const desk = seat.role === 'left' ? 1 : seat.role === 'right' ? 2 : 0;
      const shirt = desk ? RIVAL_COLORS[desk - 1] : CLASS_COLORS[n % CLASS_COLORS.length];
      const fig = paperKid(
        { shirt, chair: CHAIRS[(n + desk) % CHAIRS.length], hair: KID_HAIRS[n % KID_HAIRS.length], tufts: n % 2 === 1 },
        31 + n * 7,
      );
      fig.root.position.set(seat.x, 0, seat.z);
      fig.root.rotation.y = seat.ry;
      room.add(fig.root);
      const dx = PLAYER_X - seat.x;
      const dz = PLAYER_Z - seat.z;
      const kid: Kid = {
        fig,
        desk,
        // Most of the way round; the eyes do the rest.
        glanceYaw: Math.max(-1.2, Math.min(1.2, (Math.atan2(-dx, -dz) - seat.ry) * 0.7)),
        moment: 'working',
        momentLeft: 0,
        nextLook: 1 + Math.random() * 4,
        lookLeft: 0,
        lookAtPlayer: false,
        headX: -0.4,
        headY: 0,
        aLx: 1.1,
        aLz: 0.1,
        aRx: 1.2,
        aRz: -0.1,
        phase: Math.random() * 6,
      };
      if (desk) {
        // The rival's name and points over its head, turned to the player.
        kid.name = this.label(' ', 0.055, true);
        kid.status = this.label(' ', 0.04, true);
        const yaw = Math.atan2(PLAYER_X - seat.x, PLAYER_Z - seat.z);
        kid.name.mesh.position.set(seat.x, 1.42, seat.z - 0.05);
        kid.status.mesh.position.set(seat.x, 1.35, seat.z - 0.05);
        kid.name.mesh.rotation.y = yaw;
        kid.status.mesh.rotation.y = yaw;
        fig.root.visible = false;
        kid.name.mesh.visible = false;
        kid.status.mesh.visible = false;
      } else {
        n += 1;
      }
      this.kids.push(kid);
      if (desk) this.rivals[desk - 1] = kid;
    }
    this.teacher = paperTeacher(97);
    this.teacher.root.position.set(this.tx, 0, TEACHER_Z);
    this.teacher.root.rotation.y = this.tyaw;
    room.add(this.teacher.root);
    // Chalk on the board, upper half, clear of the teacher's head.
    this.board = this.label(' ', 0.17, false, CHALK);
    this.board.mesh.position.set(CLASS_BOARD.x, CLASS_BOARD.y + 0.22, CLASS_FRONT_Z + 0.065);
    this.board.mesh.visible = false;
    // The clock's hands at its centre and the round's time as a ring of segments.
    const cz = CLASS_FRONT_Z + 0.05;
    this.hourHand = this.hand('room-clock-hour', 0.075, 0.016, cz);
    this.minuteHand = this.hand('room-clock-minute', 0.12, 0.011, cz + 0.004);
    this.timeLeft = this.ring('room-clock-time', 0x3fb6a0);
    this.timeWarn = this.ring('room-clock-warn', 0xf2716b);
    console.info(`[room] classroom life: ${this.kids.length} classmates and the teacher`);
  }

  private label(text: string, height: number, card: boolean, ink?: number): Label {
    const l = new Label(text, ink === undefined ? { height, card } : { height, card, ink });
    this.room.add(l.mesh);
    this.labels.push(l);
    return l;
  }

  private hand(name: string, len: number, w: number, z: number): Group {
    const b = new Builder(3);
    b.box(0x3a3f4b, w, len, 0.006, 0, len / 2 - 0.015, 0);
    const g = b.build(name);
    g.position.set(CLASS_CLOCK.x, CLASS_CLOCK.y, z);
    this.room.add(g);
    return g;
  }

  /** The face's rim cut in segments clockwise from twelve; how many show is the draw range. */
  private ring(name: string, color: number): Mesh {
    const b = new Builder(5);
    const r = CLASS_CLOCK.r * 0.8;
    for (let i = 0; i < CLOCK_SEGMENTS; i += 1) {
      const a = ((i + 0.5) / CLOCK_SEGMENTS) * Math.PI * 2;
      b.box(color, 0.034, 0.03, 0.004, Math.sin(a) * r, Math.cos(a) * r, 0, 0, 0, -a);
    }
    const g = b.build(name);
    g.position.set(CLASS_CLOCK.x, CLASS_CLOCK.y, CLASS_FRONT_Z + 0.044);
    g.visible = false;
    this.room.add(g);
    return g.children[0] as Mesh;
  }

  update(dt: number): void {
    const racing = classroom.racing;
    if (racing !== this.racing) {
      this.racing = racing;
      for (const k of this.kids) {
        if (!k.desk) continue;
        k.fig.root.visible = racing;
        if (k.name) k.name.mesh.visible = racing;
        if (k.status) k.status.mesh.visible = racing;
        k.moment = 'working';
        k.momentLeft = 0;
      }
      console.info(racing ? '[room] the rivals sit down beside the player' : '[room] the rivals leave their desks');
    }
    // Moments from the race, newest last.
    while (classroom.events.length) {
      const e = classroom.events.shift()!;
      for (const k of this.kids) {
        if (k.desk !== e.desk) continue;
        k.moment = e.moment;
        k.momentLeft = MOMENT_S[e.moment];
        if (e.moment === 'working') k.lookLeft = 0;
      }
    }
    for (let i = 0; i < 2; i += 1) {
      const k = this.rivals[i];
      if (!k) continue;
      if (k.name && this.shownName[i] !== classroom.names[i]) {
        this.shownName[i] = classroom.names[i];
        k.name.set(classroom.names[i] || ' ');
      }
      if (k.status && this.shownStatus[i] !== classroom.status[i]) {
        this.shownStatus[i] = classroom.status[i];
        k.status.set(classroom.status[i] || ' ');
      }
    }
    for (const k of this.kids) if (k.fig.root.visible) this.pose(k, dt);
    this.walkTeacher(dt);
    this.writeBoard(dt);
    this.tickClock();
  }

  private pose(k: Kid, dt: number): void {
    k.phase += dt;
    const t = k.phase;
    // At rest: head down to the sheet, the left hand holding it, the right writing.
    let headX = -0.42 + Math.sin(t * 1.3) * 0.03;
    let headY = Math.sin(t * 0.7) * 0.06;
    let aLx = 1.15;
    let aLz = 0.15;
    let aRx = 1.25 + Math.sin(t * 9) * 0.04;
    let aRz = -0.12 + Math.sin(t * 6.5) * 0.06;
    const slow = k.desk ? 1 : 0.6;
    if (k.momentLeft > 0) {
      k.momentLeft -= dt;
      const m = k.moment;
      if (m === 'right') {
        // Hand up, a bounce, looking at the board.
        headX = 0.1;
        aRx = 2.9;
        aRz = -0.2 + Math.sin(t * 8) * 0.08;
      } else if (m === 'missed') {
        // A shake of the head over the sheet, a scratch behind the ear.
        headX = -0.25;
        headY = Math.sin(t * 14) * 0.35 * Math.min(1, k.momentLeft);
        aRx = 2.5;
        aRz = 0.55;
      } else if (m === 'cheer') {
        headX = 0.2;
        aLx = 2.8 + Math.sin(t * 10) * 0.1;
        aLz = 0.5;
        aRx = 2.8 + Math.sin(t * 10 + 1) * 0.1;
        aRz = -0.5;
        headY = k.glanceYaw;
      } else if (m === 'clap') {
        headX = 0.05;
        headY = k.glanceYaw * 0.8;
        const c = Math.abs(Math.sin(t * 9));
        aLx = 1.4;
        aRx = 1.4;
        aLz = -0.25 + c * 0.35;
        aRz = 0.25 - c * 0.35;
      }
    } else if (classroom.recap && k.desk) {
      // The race is over: pencils down, turned to the player.
      headX = 0.05;
      headY = k.glanceYaw;
      aRx = 0.9;
      aLx = 0.9;
    } else {
      k.nextLook -= dt * slow;
      if (k.nextLook <= 0 && k.lookLeft <= 0) {
        k.lookLeft = 0.8 + Math.random() * 1.2;
        k.lookAtPlayer = k.desk > 0 && Math.random() < 0.4;
        k.nextLook = 3 + Math.random() * 5;
      }
      if (k.lookLeft > 0) {
        k.lookLeft -= dt;
        // Up at the board to think, or a quick glance at the player's sheet.
        headX = k.lookAtPlayer ? -0.2 : 0.12;
        headY = k.lookAtPlayer ? k.glanceYaw : Math.sin(t * 0.4) * 0.15;
        aRx = 1.1;
        aRz = -0.05;
      }
    }
    const rate = 9;
    k.headX = ease(k.headX, headX, rate, dt);
    k.headY = ease(k.headY, headY, rate, dt);
    k.aLx = ease(k.aLx, aLx, rate, dt);
    k.aLz = ease(k.aLz, aLz, rate, dt);
    k.aRx = ease(k.aRx, aRx, rate, dt);
    k.aRz = ease(k.aRz, aRz, rate, dt);
    k.fig.head.rotation.set(k.headX, k.headY, 0);
    k.fig.armL.rotation.set(k.aLx, 0, k.aLz);
    k.fig.armR.rotation.set(k.aRx, 0, k.aRz);
  }

  private walkTeacher(dt: number): void {
    const f = this.teacher;
    let yaw = Math.PI;
    let arm = 0.1;
    const dx = this.tTarget - this.tx;
    if (this.tPointLeft > 0 && Math.abs(dx) < 0.02) {
      // Facing the board, pointing at what is written on it.
      this.tPointLeft -= dt;
      yaw = 0.35;
      arm = 2.3;
      if (this.tPointLeft <= 0) this.tPause = 1.5;
    } else if (Math.abs(dx) > 0.02) {
      const step = Math.sign(dx) * Math.min(Math.abs(dx), 0.55 * dt);
      this.tx += step;
      yaw = dx > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.tStep += dt * 7;
    } else {
      this.tPause -= dt;
      if (this.tPause <= 0) {
        this.tTarget = TEACHER_X_MIN + Math.random() * (TEACHER_X_MAX - TEACHER_X_MIN);
        this.tPause = 2 + Math.random() * 3;
      }
    }
    const walking = Math.abs(dx) > 0.02;
    const swing = walking ? Math.sin(this.tStep) * 0.35 : 0;
    // Turn the short way round.
    let d = yaw - this.tyaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.tyaw += d * (1 - Math.exp(-6 * dt));
    f.root.position.set(this.tx, 0, TEACHER_Z);
    f.root.rotation.y = this.tyaw;
    f.legL?.rotation.set(swing, 0, 0);
    f.legR?.rotation.set(-swing, 0, 0);
    f.armL.rotation.set(-swing * 0.6, 0, 0.08);
    f.armR.rotation.set(ease(f.armR.rotation.x, walking ? swing * 0.6 : arm, 8, dt), 0, -0.08);
    f.head.rotation.set(0, walking ? 0 : Math.sin(this.tStep * 0.1 + this.tx) * 0.2, 0);
  }

  private writeBoard(dt: number): void {
    const text = classroom.racing ? classroom.board : '';
    if (text !== this.boardText) {
      this.boardText = text;
      this.boardAge = 0;
      if (text) {
        this.board.set(text);
        // The teacher goes over to point at it.
        this.tTarget = TEACHER_BOARD_X;
        this.tPointLeft = 2.2;
        console.info(`[room] on the board: ${text}`);
      }
    }
    this.boardAge += dt;
    const mat = this.board.mesh.material as MeshBasicMaterial;
    if (!this.boardText) {
      // Wiped off.
      mat.opacity = Math.max(0, mat.opacity - dt * 3);
      this.board.mesh.visible = mat.opacity > 0;
      return;
    }
    // Written in quickly, a little large, then settling.
    const k = Math.min(1, this.boardAge / 0.5);
    this.board.mesh.visible = true;
    mat.opacity = k;
    this.board.pulse(1 + (1 - k) * 0.15);
  }

  private tickClock(): void {
    const localMin = Date.now() / 60_000 - this.tzMin;
    const min = localMin % 60;
    const hour = (localMin / 60) % 12;
    this.minuteHand.rotation.z = -(min / 60) * Math.PI * 2;
    this.hourHand.rotation.z = -(hour / 12) * Math.PI * 2;
    const ms = classroom.racing ? classroom.clockMs : null;
    const ring = ms !== null && classroom.roundMs > 0 && ms <= CLOCK_WARN_MS ? this.timeWarn : this.timeLeft;
    const other = ring === this.timeWarn ? this.timeLeft : this.timeWarn;
    other.parent!.visible = false;
    if (ms === null || classroom.roundMs <= 0) {
      ring.parent!.visible = false;
      return;
    }
    const left = Math.ceil((CLOCK_SEGMENTS * ms) / classroom.roundMs);
    ring.parent!.visible = left > 0;
    ring.geometry.setDrawRange(0, left * BOX_VERTS);
  }

  /** The labels' canvases and materials; the meshes' geometry goes with the room. */
  dispose(): void {
    for (const l of this.labels) {
      const mat = l.mesh.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.labels.length = 0;
  }
}
