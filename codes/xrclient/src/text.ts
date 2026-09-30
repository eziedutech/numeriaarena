/**
 * Player-facing text. English is the default; a second language is added as
 * another table with the same keys.
 */
import type { Highlight } from './game/core.js';

const ORDINAL = ['1st', '2nd', '3rd'];
const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}th`;

export const EN = {
  race: 'Robot Race',
  bot: (name: string) => `${name} (bot)`,
  you: 'You',
  wave: (n: number, total: number) => `Wave ${n} of ${total}`,
  place: ordinal,
  /** A rival's line above its window, for example "3/5, 380". */
  rival: (met: number, of: number, points: number) => `${met}/${of}, ${points}`,
  right: 'Got it!',
  /** Points earned, spelled out so they are never mistaken for an answer. */
  earned: (points: number) => `+${points} points`,
  tryAgain: 'Try again!',
  itWas: (answer: string) => `It was ${answer}`,
  missed: 'Missed',
  finished: 'Finished!',
  bossRound: 'Boss round: double points!',
  emote: { thumbs_up: 'Nice!', clap: 'Yay!' },
  recapTitle: 'Race results',
  highlight: {
    // In a race a won second try is the comeback; the badge is the save symbol.
    best_save: 'Best Comeback',
    most_improved: 'Most Improved',
    sharpest_aim: 'Sharpest Aim',
    steady_streak: 'Steady Streak',
    brave_try: 'Brave Try',
  } satisfies Record<Highlight, string>,
  done: 'Done',
  popHint: 'Pop the right answer',
  orbFirst: (target: string) => `Join 2 crystals to make ${target}`,
  orbTask: (target: string) => `Make ${target}`,
  gameName: { balloon_burst: 'Balloon Burst', orb_forge: 'Orb Forge' },
} as const;

export const T = EN;
