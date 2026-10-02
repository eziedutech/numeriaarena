/**
 * Player-facing text. English is the default; a second language is added as
 * another table with the same keys.
 */
import type { Highlight } from './game/core.js';

const ORDINAL = ['1ST', '2ND', '3RD'];
const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}TH`;

export const EN = {
  /** The game's name, above the book in the menu. */
  title: 'Numeria Arena',
  race: 'Robot Race',
  bot: (name: string) => `${name.toUpperCase()} (BOT)`,
  you: 'YOU',
  wave: (n: number, total: number) => `Wave ${n} of ${total}`,
  place: ordinal,
  /** A rival's line above its window, for example "4 SOLVED, 380 PTS". */
  rival: (solved: number, points: number) => `${solved} SOLVED, ${points} PTS`,
  /** Countdown, for example "0:42". */
  clock: (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  timeUp: "Time's up!",
  right: 'Got it!',
  /** Points earned, spelled out so they are never mistaken for an answer. */
  earned: (points: number) => `+${points} POINTS`,
  /** The running score above the book. */
  points: (points: number) => `${points} POINTS`,
  tryAgain: 'Try again!',
  itWas: (answer: string) => `It was ${answer}`,
  missed: 'Missed',
  bossRound: 'Boss round: 20 seconds, double points!',
  emote: { thumbs_up: 'Nice!', clap: 'Yay!' },
  recapTitle: 'Race results',
  highlight: {
    // In a race a won second try is the comeback; the badge is the save symbol.
    best_save: 'BEST COMEBACK',
    most_improved: 'MOST IMPROVED',
    sharpest_aim: 'SHARPEST AIM',
    steady_streak: 'STEADY STREAK',
    brave_try: 'BRAVE TRY',
  } satisfies Record<Highlight, string>,
  done: 'Done',
  home: 'HOME',
  popHint: 'Pop the right answer',
  orbFirst: (target: string) => `Join 2 crystals to make ${target}`,
  orbTask: (target: string) => `Make ${target}`,
  gameName: { balloon_burst: 'Balloon Burst', orb_forge: 'Orb Forge' },
} as const;

export const T = EN;
