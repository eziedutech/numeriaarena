import type { Object3D } from '@iwsdk/core';

/**
 * What the race tells the virtual classroom: who sits at the desks ahead,
 * what they are doing, the question on the board, the standings and rounds
 * on the whiteboards, and the clock. The race view and the game write it;
 * the classroom reads it each frame. Neither knows the other.
 */
export type ClassMoment = 'working' | 'right' | 'missed' | 'cheer' | 'clap';

/** One line of the standings: a player's place, name and points. */
export interface ClassStanding {
  place: number;
  name: string;
  points: number;
  me: boolean;
}

export interface ClassEvent {
  /** 1 or 2: the classmate on the left or the right. */
  desk: number;
  moment: ClassMoment;
}

export const classroom = {
  /** A race is on: the two rivals sit at the desks ahead left and right of the player. */
  racing: false,
  /** Each rival's name, and its place and points as on its window. */
  names: ['', ''],
  status: ['', ''],
  /** The race's news: the round that is on, the boss round, time up. Empty: nothing new. */
  board: '',
  /** The player's question as on its card; the board shows it, the news between questions. */
  question: '',
  /** Every player's place and points, the player's own marked. */
  standings: [] as ClassStanding[],
  /**
   * The room has the race's boards (the classroom's whiteboards): the race card
   * on the desk stands aside, and its twin `wallCard` goes up on the right whiteboard.
   */
  boards: false,
  wallCard: null as Object3D | null,
  /** The wall card's paper size, before any scale. */
  wallCardSize: { w: 0, h: 0 },
  /** Ms left in the round that is on, and the round's length; null between rounds. */
  clockMs: null as number | null,
  roundMs: 0,
  /** The race is over and the results are up. */
  recap: false,
  /** Moments not yet shown, oldest first. Only the newest few are kept. */
  events: [] as ClassEvent[],
  /** Each rival's latest paper speech bubble (a UI image name), and a count that goes up with each. */
  bubble: ['', ''],
  bubbleSeq: [0, 0],
  /**
   * The rivals are the game's robots, as in a solo race; a Class Match of
   * classmates sets this false and the classroom seats paper classmates instead.
   */
  robots: true,
  /** The room shows the rivals (the bedroom's posters, the classroom's desks ahead): the rival windows on the desk stand aside. */
  rivalsInRoom: false,
};

export function classEvent(desk: number, moment: ClassMoment): void {
  classroom.events.push({ desk, moment });
  if (classroom.events.length > 8) classroom.events.shift();
}

/** A rival's speech bubble (NICE, YAY, GOT IT), for the room that shows the rivals. */
export function classBubble(desk: number, bubble: string): void {
  classroom.bubble[desk - 1] = bubble;
  classroom.bubbleSeq[desk - 1] += 1;
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
  classroom.question = '';
  classroom.standings = [];
  classroom.clockMs = null;
  classroom.roundMs = 0;
  classroom.recap = false;
  classroom.events.length = 0;
  classroom.bubble[0] = '';
  classroom.bubble[1] = '';
}

export function classClock(msLeft: number | null): void {
  // The round's length is the most left seen since it began (between rounds the clock is null).
  classroom.roundMs = msLeft === null ? 0 : Math.max(classroom.roundMs, msLeft);
  classroom.clockMs = msLeft;
}
