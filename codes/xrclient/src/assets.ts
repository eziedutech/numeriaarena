import { AssetType, defineAssets } from '@iwsdk/core';

import { UI_FILES, UI_FIRST, type UiName } from './art/ui2d.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

/** Origami species that walk out of the book, folded in code (art/origami.ts). */
export const SPECIES = ['dog', 'rabbit', 'bird', 'chicken', 'cow', 'fish', 'cat', 'elephant'] as const;
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
  (Object.keys(UI_FILES) as UiName[]).map((name) => [
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
  paper_bird: model('foldlings/paper_bird.glb', 'Paper Bird'),
  flag_small: model('foldlings/flag_small.glb', 'Number Flag'),
  // Zia's own paper animals: shape and panel tones, painted in code.
  foldling_dog: model('foldlings/foldling_dog.glb', 'Paper Dog'),
  foldling_rabbit: model('foldlings/foldling_rabbit.glb', 'Paper Rabbit'),
  foldling_bird: model('foldlings/foldling_bird.glb', 'Paper Bird'),
  foldling_chicken: model('foldlings/foldling_chicken.glb', 'Paper Chicken'),
  foldling_cow: model('foldlings/foldling_cow.glb', 'Paper Cow'),
  foldling_fish: model('foldlings/foldling_fish.glb', 'Paper Fish'),
  foldling_cat: model('foldlings/foldling_cat.glb', 'Paper Cat'),
  foldling_elephant: model('foldlings/foldling_elephant.glb', 'Paper Elephant'),
  robot_partner_a: model('characters/robot_partner_a.glb', 'Robot Partner A'),
  robot_partner_b: model('characters/robot_partner_b.glb', 'Robot Partner B'),
});
