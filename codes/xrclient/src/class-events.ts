/**
 * What the race tells the virtual classroom: who sits beside the player,
 * what they are doing, the round on the board and the clock. The race view
 * writes it; the classroom reads it each frame. Neither knows the other.
 */
export type ClassMoment = 'working' | 'right' | 'missed' | 'cheer' | 'clap';

export interface ClassEvent {
  /** 1 or 2: the classmate on the left or the right. */
  desk: number;
  moment: ClassMoment;
}

export const classroom = {
  /** A race is on: the two rivals sit at the desks beside the player. */
  racing: false,
  /** Each rival's name, and its place and points as on its window. */
  names: ['', ''],
  status: ['', ''],
  /** Written on the board: the round that is on, the boss round, time up. Empty: a clean board. */
  board: '',
  /** Ms left in the round that is on, and the round's length; null between rounds. */
  clockMs: null as number | null,
  roundMs: 0,
  /** The race is over and the results are up. */
  recap: false,
  /** Moments not yet shown, oldest first. Only the newest few are kept. */
  events: [] as ClassEvent[],
};

export function classEvent(desk: number, moment: ClassMoment): void {
  classroom.events.push({ desk, moment });
  if (classroom.events.length > 8) classroom.events.shift();
}

export function classRaceOn(on: boolean): void {
  classroom.racing = on;
  if (!on) {
    classroom.names[0] = '';
    classroom.names[1] = '';
  }
  classroom.status[0] = '';
  classroom.status[1] = '';
  classroom.board = '';
  classroom.clockMs = null;
  classroom.roundMs = 0;
  classroom.recap = false;
  classroom.events.length = 0;
}

export function classClock(msLeft: number | null): void {
  // The round's length is the most left seen since it began (between rounds the clock is null).
  classroom.roundMs = msLeft === null ? 0 : Math.max(classroom.roundMs, msLeft);
  classroom.clockMs = msLeft;
}
