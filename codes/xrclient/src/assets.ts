import { AssetType, defineAssets } from '@iwsdk/core';

import { NOT_APPROVED, UI_FILES, UI_FIRST, type UiName } from './art/ui2d.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

/** Origami species that walk out of the book (models/foldlings). */
export const SPECIES = ['fox', 'rabbit', 'crane', 'turtle', 'frog', 'fish', 'cat', 'elephant'] as const;
export type Species = (typeof SPECIES)[number];

const model = (file: string, name: string) => ({
  url: publicAssetUrl(`models/${file}`),
  type: AssetType.GLTF,
  name,
  // All together about 700 KB, and needed before the first creature appears.
  priority: 'critical' as const,
});

/** Paper UI images (public/ui2d), keyed `ui_<name>`; the menu's come first. */
const uiTextures = Object.fromEntries(
  (Object.keys(UI_FILES) as UiName[]).filter((name) => !NOT_APPROVED.has(name)).map((name) => [
    `ui_${name}`,
    {
      url: publicAssetUrl(UI_FILES[name]),
      type: AssetType.Texture,
      name: `UI ${name}`,
      priority: UI_FIRST.includes(name) ? ('critical' as const) : ('background' as const),
    },
  ]),
);

// Models come from the origami asset set (public/models, synced by
// scripts/sync-assets.mjs).
export default defineAssets({
  ...uiTextures,
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Start Panel',
  },
  popup_book: model('book/popup_book.glb', 'Pop-up Book'),
  portal_main: model('game/portal/portal_main.glb', 'Book Portal'),
  paper_bird: model('foldlings/paper_bird.glb', 'Paper Bird'),
  flag_small: model('foldlings/flag_small.glb', 'Number Flag'),
  foldling_fox: model('foldlings/foldling_fox.glb', 'Foldling Fox'),
  foldling_rabbit: model('foldlings/foldling_rabbit.glb', 'Foldling Rabbit'),
  foldling_crane: model('foldlings/foldling_crane.glb', 'Foldling Crane'),
  foldling_turtle: model('foldlings/foldling_turtle.glb', 'Foldling Turtle'),
  foldling_frog: model('foldlings/foldling_frog.glb', 'Foldling Frog'),
  foldling_fish: model('foldlings/foldling_fish.glb', 'Foldling Fish'),
  foldling_cat: model('foldlings/foldling_cat.glb', 'Foldling Cat'),
  foldling_elephant: model('foldlings/foldling_elephant.glb', 'Foldling Elephant'),
  crystal: model('game/orb_forge/crystal.glb', 'Long Paper Gem'),
  crystal_2: model('game/orb_forge/crystal_2.glb', 'Prism Paper Gem'),
  crystal_3: model('game/orb_forge/crystal_3.glb', 'Short Paper Gem'),
  orb: model('game/orb_forge/orb.glb', 'Orb'),
  balloon_round: model('game/balloon/balloon_round.glb', 'Paper Hot-Air Balloon'),
  paper_button: model('ui/paper_button.glb', 'Paper Button'),
  partner_window: model('game/portal/partner_window.glb', 'Partner Window'),
  robot_partner_a: model('characters/robot_partner_a.glb', 'Robot Partner A'),
  robot_partner_b: model('characters/robot_partner_b.glb', 'Robot Partner B'),
  star: model('rewards/star.glb', 'Star'),
  star_empty: model('rewards/star_empty.glb', 'Empty Star'),
  badge_best_save: model('rewards/badge_best_save.glb', 'Best Save Badge'),
  badge_most_improved: model('rewards/badge_most_improved.glb', 'Most Improved Badge'),
  badge_sharpest_aim: model('rewards/badge_sharpest_aim.glb', 'Sharpest Aim Badge'),
  badge_steady_streak: model('rewards/badge_steady_streak.glb', 'Steady Streak Badge'),
  badge_brave_try: model('rewards/badge_brave_try.glb', 'Brave Try Badge'),
});
