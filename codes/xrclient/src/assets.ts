import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;

const model = (file: string, name: string) => ({
  url: publicAssetUrl(`models/${file}`),
  type: AssetType.GLTF,
  name,
  // All together about 370 KB, and needed before the first creature appears.
  priority: 'critical' as const,
});

// Models come from the origami asset set (public/models, synced by
// scripts/sync-assets.mjs). Foldling bodies are still procedural (src/art).
export default defineAssets({
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Start Panel',
  },
  popup_book: model('book/popup_book.glb', 'Pop-up Book'),
  portal_main: model('game/portal/portal_main.glb', 'Book Portal'),
  paper_bird: model('foldlings/paper_bird.glb', 'Paper Bird'),
  flag_small: model('foldlings/flag_small.glb', 'Number Flag'),
  crystal: model('game/orb_forge/crystal.glb', 'Number Crystal'),
  orb: model('game/orb_forge/orb.glb', 'Orb'),
  balloon_round: model('game/balloon/balloon_round.glb', 'Balloon'),
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
