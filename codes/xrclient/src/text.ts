/**
 * Player-facing text for Solo Squad. English is the default; a second
 * language is added as another table with the same keys.
 */
import type { Highlight } from './game/core.js';

export const EN = {
  soloSquad: 'Solo Squad',
  bot: (name: string) => `${name} (bot)`,
  you: 'You',
  wave: (n: number, total: number) => `Wave ${n} of ${total}`,
  team: (points: number) => `Team ${points}`,
  rescue: 'Rescue!',
  helpOrb: 'Help orb!',
  crystalHit: 'Crystal hit!',
  escaped: 'Escaped!',
  right: 'Got it!',
  missed: 'Missed',
  boss: 'Boss!',
  bossFolded: 'Boss folded!',
  bossAway: 'The boss slipped away',
  emote: { thumbs_up: 'Nice!', clap: 'Yay!', help: 'Help!' },
  waiting: (n: number) => (n === 1 ? '1 waiting' : `${n} waiting`),
  recapTitle: 'Squad recap',
  teamPoints: (points: number) => `Team points: ${points}`,
  highlight: {
    best_save: 'Best Save',
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
