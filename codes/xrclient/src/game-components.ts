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

const Games = { SoloSquad: 'solo_squad', BalloonBurst: 'balloon_burst', OrbForge: 'orb_forge' } as const;

export const MenuButton = createComponent('MenuButton', {
  game: { type: Types.Enum, default: Games.BalloonBurst, enum: Games },
});
