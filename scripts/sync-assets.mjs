// Copies the game's origami models and paper UI from a local clone of the asset repository
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
  'popup_book',
  'paper_bird',
  'flag_small',
  'robot_partner_a',
  'robot_partner_b',
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

// Paper UI (batch U1): banners, labels and buttons as PNG, and the paper
// glyph atlases the game uses to draw numbers. SVG sources stay in the
// asset repository.
const UI_WANTED = [
  'title_numeria_arena',
  'menu_robot_race',
  'menu_balloon_burst',
  'menu_orb_forge',
  'status_finding_table',
  'status_pinch_to_place',
  'status_ready',
  'race_wave_1',
  'race_wave_2',
  'race_wave_3',
  'race_boss_round',
  'race_double_points',
  'race_times_up',
  'race_name_clip',
  'race_name_crease',
  'robot_nice_cobalt',
  'robot_nice_teal',
  'robot_yay_cobalt',
  'robot_yay_teal',
  'robot_got_it_cobalt',
  'robot_got_it_teal',
  'hint_pop_right_answer',
  'feedback_try_again',
  'recap_title',
  'badge_label_best_comeback',
  'badge_label_most_improved',
  'badge_label_sharpest_aim',
  'badge_label_steady_streak',
  'badge_label_brave_try',
  'button_done',
];
const uiDest = new URL('../codes/xrclient/public/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const uiAll = JSON.parse(readFileSync(join(src, 'ui2d/manifest.json'), 'utf8'));
const uiPicked = [];
for (const name of UI_WANTED) {
  const entry = uiAll.find((a) => a.name === name);
  if (!entry) {
    console.error(`missing in the UI manifest: ${name}`);
    process.exit(1);
  }
  const to = join(uiDest, entry.file);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(src, entry.file), to);
  const { svg: _svg, ...keep } = entry;
  uiPicked.push(keep);
}
const glyphs = JSON.parse(readFileSync(join(src, 'ui2d/font/paper_glyphs.json'), 'utf8'));
for (const atlas of Object.values(glyphs.atlas).filter((v) => typeof v === 'string')) {
  const to = join(uiDest, atlas);
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(join(src, atlas), to);
}
for (const g of Object.values(glyphs.glyphs)) delete g.svg;
writeFileSync(join(uiDest, 'ui2d/font/paper_glyphs.json'), `${JSON.stringify(glyphs)}\n`);
writeFileSync(
  join(uiDest, 'ui2d/manifest.json'),
  `${JSON.stringify({ source: 'https://github.com/sayazia/orimathassets', commit, license: 'CC0-1.0', assets: uiPicked }, null, 2)}\n`,
);
console.log(`copied ${uiPicked.length} UI images and the paper glyphs to ${join(uiDest, 'ui2d')}`);
