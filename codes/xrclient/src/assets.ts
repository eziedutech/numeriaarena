import { AssetType, defineAssets } from '@iwsdk/core';

import { UI_FIRST, UI_PLACEMENT, UI_TEXTURES, type UiName } from './art/ui2d.js';

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

/**
 * Paper UI images (public/ui2d), keyed `ui_<name>` and `ui_<name>_id` for the
 * Indonesian version: the menu's before the game starts, the book
 * placement's in the background, the rest on demand (fetched one by one in
 * the current language once the home page is up, see `prefetchUi`).
 */
const uiPriority = (key: string, name: UiName) =>
  key.endsWith('_id')
    ? ('lazy' as const)
    : UI_FIRST.includes(name)
      ? ('critical' as const)
      : UI_PLACEMENT.includes(name)
        ? ('background' as const)
        : ('lazy' as const);
const uiTextures = Object.fromEntries(
  UI_TEXTURES.map(({ key, name, file }) => [
    key,
    {
      url: publicAssetUrl(file),
      type: AssetType.Texture,
      name: `UI ${key.slice(3)}`,
      priority: uiPriority(key, name),
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
