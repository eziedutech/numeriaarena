import type { DeskView, Emote, GameKind, RaceEvent, RaceOffer, RaceState, RaceVerdict, Recap } from './core.js';
import { studentState } from '../home/student.js';

/**
 * A Class Match from the server, seen from one seat, in the shape of the
 * robot race (`Race` in core.ts) so the desk plays it the same way. The
 * server runs the match on its own clock (codes/backrust/core/src/protocol.rs
 * holds the messages): it hands out the creatures, judges the answers, and
 * keeps everyone's points. This seat shows the two rivals after it in seat
 * order at its two rival windows.
 */

/** The server's view of the match (`ClassView` in class_match.rs). */
interface SeatView {
  name: string;
  bot: boolean;
  away: boolean;
  stand_in: boolean;
  points: number;
  folded: number;
  place: number;
}

interface ClassView {
  phase: RaceState['phase'];
  wave?: number;
  next_wave?: number | null;
  until_ms?: number;
  waves: number;
  plan: RaceState['plan'];
  ends_at_ms: number | null;
  seats: SeatView[];
}

type ClassEvent =
  | { type: 'wave_start'; at_ms: number; wave: number; game: GameKind; ends_at_ms: number }
  | { type: 'seat_working'; at_ms: number; seat: number; prompt: { en: string; id: string } }
  | { type: 'seat_answer'; at_ms: number; seat: number; correct: boolean; attempt: number; points: number }
  | { type: 'emote'; at_ms: number; seat: number; emote: Emote }
  | { type: 'time_up'; at_ms: number; wave: number | null }
  | { type: 'boss_start'; at_ms: number; ends_at_ms: number }
  | { type: 'match_end'; at_ms: number }
  | { type: 'seat_away' | 'seat_back' | 'stand_in'; at_ms: number; seat: number };

export interface Lobby {
  seats: number;
  names: string[];
  watch_code: string;
  /**
   * `class`: the teacher starts it; `open`: it starts when everyone is ready;
   * `duel`: FIND A RIVAL, it starts when the rival is in or a robot takes the desk.
   */
  kind: 'class' | 'open' | 'duel';
  /** Each seat's READY, in seat order (open rooms). */
  ready: boolean[];
  /** The countdown is on: the match starts then, on the room's clock. */
  starts_at_ms: number | null;
  /** In a room for a class: the group whose seats sit down (0 is A). */
  turn: { group: number; seats: number[]; next: number | null; groups: number[] } | null;
  /** In a duel waiting for a rival: a robot takes the empty desk then, on the room's clock. */
  rival_by_ms: number | null;
}

interface ClassRecap {
  players: Recap['players'];
  skills: Recap['skills'][];
}

type ServerMsg =
  | { type: 'welcome'; seat: number | null; name: string | null; token: string | null; now_ms: number }
  | ({ type: 'lobby' } & Lobby)
  | ({ type: 'view' } & ClassView)
  | ({ type: 'offer' } & RaceOffer)
  | ({ type: 'verdict' } & RaceVerdict)
  | { type: 'event'; event: ClassEvent }
  | { type: 'cheer'; at_ms: number }
  | ({ type: 'recap' } & ClassRecap)
  | { type: 'match_committed'; match_id: string }
  | { type: 'error'; code: string };

/** Errors that end the join; others are answers to one action. */
const JOIN_ERRORS = ['room_not_found', 'room_full', 'match_started', 'hello_first', 'class_only', 'wrong_class', 'not_your_turn', 'students_only'];
/** After a `wait` (between rounds, the last seconds of one), ask again this much later. */
const ASK_AGAIN_MS = 800;
/** A dropped connection is tried again this often, this many times. */
const RECONNECT_MS = 1500;
const RECONNECT_TRIES = 20;

/** The WebSocket of the API on this site (`/api/ws`, beside `/play`). */
function wsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/api/ws`;
}

export class ClassRace {
  /** The join a home page made, waiting for the game to take it. */
  static pending?: ClassRace;

  seat: number | null = null;
  name = '';
  lobby?: Lobby;
  /** Called when the lobby changes or the match starts (`view` arrives). */
  onChange?: () => void;
  /** Its teacher closed the room: the match is over for this seat. */
  shut = false;
  /** The room is still open, but the class screen called another group to the desks. */
  turnOver = false;

  private ws?: WebSocket;
  private token: string | null = null;
  private closed = false;
  private tries = 0;
  /** Server time minus `clock()`: the largest seen, since messages only arrive late. */
  private offset = -Infinity;
  private state?: ClassView;
  private events: RaceEvent[] = [];
  private offer?: RaceOffer;
  /** The creature at this desk, until its last answer or the bell. */
  private open?: number;
  private asked = false;
  private askAt = 0;
  private judging?: { resolve: (v: RaceVerdict) => void; reject: (e: Error) => void };
  private recapMsg?: ClassRecap;
  /** A view came since the desk last looked. */
  private fresh = false;
  /** Seats shown at the two rival windows, in order. */
  private rivals: number[] = [];

  private constructor(
    private code: string,
    private clock: () => number,
  ) {}

  /** Takes a seat in the room with play code `code`; rejects with the server's error code. */
  static join(code: string, clock: () => number = Date.now): Promise<ClassRace> {
    const race = new ClassRace(code.toUpperCase(), clock);
    return new Promise((resolve, reject) => {
      race.connect(
        () => resolve(race),
        (code) => reject(new Error(code)),
      );
    });
  }

  get started(): boolean {
    return !!this.state;
  }

  /** Resolves once the match is on (its first view came). */
  whenStarted(): Promise<void> {
    if (this.state || this.shut) return Promise.resolve();
    return new Promise((resolve) => {
      const before = this.onChange;
      this.onChange = () => {
        before?.();
        if (this.state || this.shut) {
          this.onChange = before;
          resolve();
        }
      };
    });
  }

  /** The match runs on the clock the game uses from now on. */
  setClock(clock: () => number): void {
    const shift = this.clock() - clock();
    this.clock = clock;
    this.offset += shift;
  }

  /** In an open room: this seat is ready to start. */
  ready(): void {
    this.send({ type: 'ready' });
  }

  /** Milliseconds until the match starts, while the countdown is on; else null. */
  startsIn(): number | null {
    const at = this.lobby?.starts_at_ms;
    if (at == null || this.state) return null;
    return Math.max(0, this.local(at) - this.clock());
  }

  /** In a duel: milliseconds until a robot takes the empty desk; else null. */
  rivalIn(): number | null {
    const at = this.lobby?.rival_by_ms;
    if (at == null || this.state) return null;
    return Math.max(0, this.local(at) - this.clock());
  }

  private connect(joined?: () => void, failed?: (code: string) => void): void {
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    ws.addEventListener('open', () => {
      // A device signed in to a class seat races under that seat's pseudonym.
      this.send({ type: 'hello', code: this.code, resume: this.token ?? undefined, student: studentState()?.token });
    });
    ws.addEventListener('message', (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (msg.type === 'welcome' && msg.seat === null && failed) {
        // A watch code: no seat here, the Arena Screen is for watching.
        failed('watch_code');
        failed = undefined;
        this.closed = true;
        ws.close();
        return;
      }
      if (msg.type === 'welcome') {
        this.tries = 0;
        joined?.();
        joined = undefined;
        failed = undefined;
      } else if (msg.type === 'error' && JOIN_ERRORS.includes(msg.code) && failed) {
        failed(msg.code);
        failed = undefined;
        this.closed = true;
        ws.close();
        return;
      }
      this.receive(msg);
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.judging?.reject(new Error('disconnected'));
      this.judging = undefined;
      if (failed) {
        failed('offline');
        failed = undefined;
        return;
      }
      // The seat waits on the server; its token takes it back.
      if (!this.closed && this.token && this.tries < RECONNECT_TRIES) {
        this.tries += 1;
        setTimeout(() => {
          if (!this.closed) this.connect();
        }, RECONNECT_MS);
      }
    });
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Server time to the game's clock. */
  private local(serverMs: number): number {
    return serverMs - this.offset;
  }

  private seen(serverMs: number): void {
    this.offset = Math.max(this.offset, serverMs - this.clock());
  }

  private receive(msg: ServerMsg): void {
    switch (msg.type) {
      case 'welcome':
        this.seen(msg.now_ms);
        this.seat = msg.seat;
        this.name = msg.name ?? '';
        this.token = msg.token;
        // Back after a drop: whatever was open went home on the server.
        this.offer = undefined;
        this.open = undefined;
        this.asked = false;
        break;
      case 'lobby':
        this.lobby = {
          seats: msg.seats,
          names: msg.names,
          watch_code: msg.watch_code,
          kind: msg.kind,
          ready: msg.ready,
          starts_at_ms: msg.starts_at_ms,
          turn: msg.turn ?? null,
          rival_by_ms: msg.rival_by_ms ?? null,
        };
        this.onChange?.();
        break;
      case 'view': {
        const first = !this.state;
        this.state = msg;
        this.fresh = true;
        if (first) {
          this.rivals = msg.seats.map((_, i) => i).filter((i) => i !== this.seat).slice(0, 2);
          this.onChange?.();
        }
        break;
      }
      case 'offer':
        this.offer = msg;
        this.open = msg.offer_id;
        this.asked = false;
        break;
      case 'verdict':
        if (!msg.retry_allowed) this.open = undefined;
        this.judging?.resolve(msg);
        this.judging = undefined;
        break;
      case 'event':
        this.seen(msg.event.at_ms);
        this.onEvent(msg.event);
        break;
      case 'recap':
        this.recapMsg = msg;
        break;
      case 'error':
        if (msg.code === 'room_closed' || msg.code === 'turn_over') {
          this.shut = true;
          this.turnOver = msg.code === 'turn_over';
          this.closed = true;
          this.judging?.reject(new Error(msg.code));
          this.judging = undefined;
          this.onChange?.();
        } else if (msg.code === 'wait') {
          this.asked = false;
          this.askAt = this.clock() + ASK_AGAIN_MS;
        } else if (this.judging) {
          this.judging.reject(new Error(msg.code));
          this.judging = undefined;
        } else {
          // Ask again later, within the server's limit of messages a second.
          console.info(`[class] ${msg.code}`);
          this.asked = false;
          this.askAt = this.clock() + ASK_AGAIN_MS;
        }
        break;
    }
  }

  /** Seat to desk: 0 for this seat, 1 and 2 for the rival windows, -1 for anyone else. */
  private desk(seat: number): number {
    if (seat === this.seat) return 0;
    const i = this.rivals.indexOf(seat);
    return i < 0 ? -1 : i + 1;
  }

  private onEvent(ev: ClassEvent): void {
    switch (ev.type) {
      case 'wave_start':
        this.events.push({ ...ev, ends_at_ms: this.local(ev.ends_at_ms) });
        break;
      case 'boss_start':
        this.events.push({ ...ev, ends_at_ms: this.local(ev.ends_at_ms) });
        break;
      case 'match_end':
        this.events.push(ev);
        break;
      case 'time_up':
        // The creature still open at the bell went home unanswered.
        this.events.push({ type: 'time_up', at_ms: ev.at_ms, wave: ev.wave, player_cut: this.open !== undefined });
        this.open = undefined;
        this.offer = undefined;
        this.asked = false;
        break;
      case 'seat_working': {
        const desk = this.desk(ev.seat);
        if (desk > 0) this.events.push({ type: 'bot_working', at_ms: ev.at_ms, desk, prompt: ev.prompt });
        break;
      }
      case 'seat_answer': {
        const desk = this.desk(ev.seat);
        if (desk > 0) {
          this.events.push({ type: 'bot_answer', at_ms: ev.at_ms, desk, correct: ev.correct, attempt: ev.attempt, points: ev.points });
        }
        break;
      }
      case 'emote': {
        const desk = this.desk(ev.seat);
        if (desk > 0) this.events.push({ type: 'emote', at_ms: ev.at_ms, desk, emote: ev.emote });
        break;
      }
      default:
        break;
    }
  }

  /** Whether a view came since the last call: the scores on the desk are behind. */
  takeFresh(): boolean {
    const f = this.fresh;
    this.fresh = false;
    return f;
  }

  /** The rivals at the two windows: their names, and whether each is a bot. */
  rivalSeats(): { name: string; bot: boolean }[] {
    const seats = this.state?.seats ?? [];
    return this.rivals.map((i) => ({ name: seats[i]?.name ?? '', bot: seats[i]?.bot ?? true }));
  }

  // ------------------------------------------------------------ the race's shape

  /** The server started the match; nothing to do here. */
  tick(_now: number): RaceEvent[] {
    return this.events.splice(0);
  }

  /** The next creature once the server sent it; asks for it otherwise. */
  playerNext(): RaceOffer | null {
    if (this.offer) {
      const o = this.offer;
      this.offer = undefined;
      return o;
    }
    if (!this.asked && this.clock() >= this.askAt && this.state && this.ws) {
      this.asked = true;
      this.send({ type: 'next' });
    }
    return null;
  }

  answerBalloon(offerId: number, index: number): Promise<RaceVerdict> {
    return this.judge({ type: 'answer_balloon', offer_id: offerId, index });
  }

  answerOrb(offerId: number, crystals: number[]): Promise<RaceVerdict> {
    return this.judge({ type: 'answer_orb', offer_id: offerId, crystals });
  }

  answerBalance(offerId: number, index: number): Promise<RaceVerdict> {
    return this.judge({ type: 'answer_balance', offer_id: offerId, index });
  }

  answerSort(offerId: number, gate: number): Promise<RaceVerdict> {
    return this.judge({ type: 'answer_sort', offer_id: offerId, gate });
  }

  answerBridge(offerId: number, planks: number[]): Promise<RaceVerdict> {
    return this.judge({ type: 'answer_bridge', offer_id: offerId, planks });
  }

  private judge(msg: object): Promise<RaceVerdict> {
    if (this.judging || !this.ws) return Promise.reject(new Error(this.ws ? 'busy' : 'disconnected'));
    return new Promise((resolve, reject) => {
      this.judging = { resolve, reject };
      this.send(msg);
    });
  }

  private deskView(i: number): DeskView | undefined {
    const s = this.state?.seats[i];
    return s && { name: s.name, bot: s.bot, points: s.points, folded: s.folded, place: s.place };
  }

  view(): RaceState {
    const v = this.state;
    if (!v) return { phase: 'ready', waves: 3, plan: [], ends_at_ms: null, desks: [] };
    const desks = [this.seat ?? 0, ...this.rivals].map((i) => this.deskView(i)).filter((d): d is DeskView => !!d);
    return {
      phase: v.phase,
      wave: v.wave,
      waves: v.waves,
      plan: v.plan,
      ends_at_ms: v.ends_at_ms === null ? null : this.local(v.ends_at_ms),
      desks,
    };
  }

  /** The results with this seat first, then the rivals; everyone else left out. */
  recap(): Recap {
    const r = this.recapMsg;
    const order = [this.seat ?? 0, ...this.rivals];
    if (!r) {
      const players = order
        .map((i) => this.deskView(i))
        .filter((d): d is DeskView => !!d)
        .map((d) => ({ ...d, stars: 0, highlight: null }));
      return { players, skills: [] };
    }
    return {
      players: order.map((i) => r.players[i]).filter((p) => !!p),
      skills: r.skills[this.seat ?? 0] ?? [],
    };
  }

  /** The server keeps the answers; nothing is kept on the device. */
  drainEvents(): unknown[] {
    return [];
  }

  free(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = undefined;
    this.judging?.reject(new Error('closed'));
    this.judging = undefined;
  }
}
