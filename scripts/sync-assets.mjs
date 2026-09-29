// Copies the game's origami models from a local clone of the asset repository
// (https://github.com/sayazia/orimathassets, CC0 art) into the headset client.
// Usage: node scripts/sync-assets.mjs <path-to-orimathassets-clone>
// Only base files are copied; colours are applied at runtime from material
// names, so one file per model is enough.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const src = process.argv[2];
if (!src || !existsSync(join(src, 'models/manifest.json'))) {
  console.error('usage: node scripts/sync-assets.mjs <path-to-orimathassets-clone>');
  process.exit(1);
}
const dest = new URL('../codes/xrclient/public/models/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// The assets the game uses today. Add names here when a system starts using them.
// Foldling faces are still being refined in the asset repository; run this
// script again when they land.
const WANTED = [
  'foldling_fox',
  'foldling_rabbit',
  'foldling_crane',
  'foldling_turtle',
  'foldling_frog',
  'foldling_fish',
  'foldling_cat',
  'foldling_elephant',
  'popup_book',
  'portal_main',
  'paper_bird',
  'flag_small',
  'crystal',
  'orb',
  'balloon_round',
  'paper_button',
  'partner_window',
  'robot_partner_a',
  'robot_partner_b',
  'star',
  'star_empty',
  'badge_best_save',
  'badge_most_improved',
  'badge_sharpest_aim',
  'badge_steady_streak',
  'badge_brave_try',
];

const manifest = JSON.parse(readFileSync(join(src, 'models/manifest.json'), 'utf8'));
const all = Array.isArray(manifest) ? manifest : (manifest.assets ?? Object.values(manifest).find(Array.isArray));
const picked = [];
for (const name of WANTED) {
  const entry = all.find((a) => a.name === name);
  if (!entry) {
    console.error(`missing in the asset manifest: ${name}`);
    process.exit(1);
  }
  const { variant_files: _files, variant_colours: _colours, ...keep } = entry;
  const to = join(dest, entry.file);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(src, 'models', entry.file), to);
  picked.push(keep);
}
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync(
  join(dest, 'manifest.json'),
  `${JSON.stringify(
    {
      source: 'https://github.com/sayazia/orimathassets',
      commit,
      license: 'CC0-1.0 (models); same owner as this game',
      assets: picked,
    },
    null,
    2,
  )}\n`,
);
console.log(`copied ${picked.length} models from ${commit.slice(0, 7)} to ${dest}`);
