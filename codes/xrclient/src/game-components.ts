import { createComponent, Types } from '@iwsdk/core';

/** Root of the play area on the real desk. Every game object is its child. */
export const DeskRoot = createComponent('DeskRoot', {
  placed: { type: Types.Boolean, default: false },
  /** How it was placed: 0 not yet, 1 detected table, 2 pinch, 3 browser preview, 4 in front of the player. */
  method: { type: Types.Int8, default: 0 },
});

export const Creature = createComponent('Creature', {
  offerId: { type: Types.Int32, default: 0 },
});

export const Balloon = createComponent('Balloon', {
  index: { type: Types.Int16, default: 0 },
});

export const Crystal = createComponent('Crystal', {
  index: { type: Types.Int16, default: 0 },
});

export const Orb = createComponent('Orb', {
  first: { type: Types.Int16, default: -1 },
  second: { type: Types.Int16, default: -1 },
});

/** What a desk button does: start a game, leave for the home page, or change a setting. */
const Games = {
  Race: 'race',
  BalloonBurst: 'balloon_burst',
  OrbForge: 'orb_forge',
  Home: 'home',
  Language: 'lang',
  BigText: 'bigtext',
  Town: 'town',
  /** PRACTICE AGAIN, on a practice's results. */
  Again: 'again',
  /** Done, on any results: it only closes them, so a second touch can never start a game. */
  Done: 'done',
  /** QUIT, on the desk during a game in the headset. */
  Quit: 'quit',
} as const;

/** Every value a MenuButton can carry; the game's choices must be among them. */
export type MenuButtonValue = (typeof Games)[keyof typeof Games];

export const MenuButton = createComponent('MenuButton', {
  game: { type: Types.Enum, default: Games.BalloonBurst, enum: Games },
});

/** An animal waiting in the line behind the book; touching it says hello. */
export const LineTap = createComponent('LineTap', {});
