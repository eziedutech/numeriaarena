import { AssetManager, Color, DoubleSide, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, SRGBColorSpace, Texture } from '@iwsdk/core';

/**
 * Paper UI from the asset set (batch U1): banners, labels and buttons drawn
 * as folded paper, synced into public/ui2d by scripts/sync-assets.mjs.
 * Heights are the asset set's world sizes in metres, shadow included.
 */
export const UI_HEIGHT = {
  title_numeria_arena: 0.07,
  menu_robot_race: 0.022,
  menu_balloon_burst: 0.022,
  menu_orb_forge: 0.022,
  status_finding_table: 0.035,
  status_pinch_to_place: 0.035,
  status_ready: 0.1258,
  race_wave_1: 0.05,
  race_wave_2: 0.05,
  race_wave_3: 0.05,
  race_boss_round: 0.059,
  race_double_points: 0.035,
  race_times_up: 0.1293,
  race_name_clip: 0.022,
  race_name_crease: 0.022,
  robot_nice_cobalt: 0.0403,
  robot_nice_teal: 0.0403,
  robot_yay_cobalt: 0.039,
  robot_yay_teal: 0.039,
  robot_got_it_cobalt: 0.0513,
  robot_got_it_teal: 0.0513,
  hint_pop_right_answer: 0.022,
  feedback_try_again: 0.035,
  recap_title: 0.059,
  badge_label_best_comeback: 0.0257,
  badge_label_most_improved: 0.0257,
  badge_label_sharpest_aim: 0.0257,
  badge_label_steady_streak: 0.0257,
  badge_label_brave_try: 0.0257,
  button_done: 0.035,
} as const;

export type UiName = keyof typeof UI_HEIGHT;

/** Published files, for the asset manifest. */
export const UI_FILES: Record<UiName, string> = {
  title_numeria_arena: 'ui2d/brand/title_numeria_arena.webp',
  menu_robot_race: 'ui2d/menu/menu_robot_race.webp',
  menu_balloon_burst: 'ui2d/menu/menu_balloon_burst.webp',
  menu_orb_forge: 'ui2d/menu/menu_orb_forge.webp',
  status_finding_table: 'ui2d/placement/status_finding_table.webp',
  status_pinch_to_place: 'ui2d/placement/status_pinch_to_place.webp',
  status_ready: 'ui2d/placement/status_ready.webp',
  race_wave_1: 'ui2d/race/race_wave_1.webp',
  race_wave_2: 'ui2d/race/race_wave_2.webp',
  race_wave_3: 'ui2d/race/race_wave_3.webp',
  race_boss_round: 'ui2d/race/race_boss_round.webp',
  race_double_points: 'ui2d/race/race_double_points.webp',
  race_times_up: 'ui2d/race/race_times_up.webp',
  race_name_clip: 'ui2d/race/race_name_clip.webp',
  race_name_crease: 'ui2d/race/race_name_crease.webp',
  robot_nice_cobalt: 'ui2d/race/robot_nice_cobalt.webp',
  robot_nice_teal: 'ui2d/race/robot_nice_teal.webp',
  robot_yay_cobalt: 'ui2d/race/robot_yay_cobalt.webp',
  robot_yay_teal: 'ui2d/race/robot_yay_teal.webp',
  robot_got_it_cobalt: 'ui2d/race/robot_got_it_cobalt.webp',
  robot_got_it_teal: 'ui2d/race/robot_got_it_teal.webp',
  hint_pop_right_answer: 'ui2d/question/hint_pop_right_answer.webp',
  feedback_try_again: 'ui2d/question/feedback_try_again.webp',
  recap_title: 'ui2d/recap/recap_title.webp',
  badge_label_best_comeback: 'ui2d/recap/badge_label_best_comeback.webp',
  badge_label_most_improved: 'ui2d/recap/badge_label_most_improved.webp',
  badge_label_sharpest_aim: 'ui2d/recap/badge_label_sharpest_aim.webp',
  badge_label_steady_streak: 'ui2d/recap/badge_label_steady_streak.webp',
  badge_label_brave_try: 'ui2d/recap/badge_label_brave_try.webp',
  button_done: 'ui2d/recap/button_done.webp',
};


/**
 * Stickers with an Indonesian version beside them (`<file>_id.webp`, made by
 * scripts/ui-id.py from the English sticker and the asset set's glyphs).
 * Game names, CLIP and CREASE read the same in both languages.
 */
const HAS_ID: ReadonlySet<UiName> = new Set<UiName>([
  'status_finding_table',
  'status_pinch_to_place',
  'status_ready',
  'race_wave_1',
  'race_wave_2',
  'race_wave_3',
  'race_boss_round',
  'race_double_points',
  'race_times_up',
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
]);

/** Asset manifest entries: `ui_<name>` for each sticker, `ui_<name>_id` for its Indonesian version. */
export const UI_TEXTURES: readonly { key: string; name: UiName; file: string }[] = (Object.keys(UI_FILES) as UiName[]).flatMap(
  (name) => {
    const file = UI_FILES[name];
    const own = { key: `ui_${name}`, name, file };
    return HAS_ID.has(name) ? [own, { key: `ui_${name}_id`, name, file: file.replace(/\.webp$/u, '_id.webp') }] : [own];
  },
);

let uiLang: 'en' | 'id' = 'en';

/** The language the stickers are drawn in from now on (the game calls this with every settings change). */
export function useUiLanguage(lang: 'en' | 'id'): void {
  uiLang = lang;
}

/** The texture for `name` in the current language. */
function key(name: UiName): string {
  return uiLang === 'id' && HAS_ID.has(name) ? `ui_${name}_id` : `ui_${name}`;
}

/** Shown on the menu, so loaded before the game starts. */
export const UI_FIRST: readonly UiName[] = ['menu_balloon_burst', 'menu_orb_forge', 'menu_robot_race', 'title_numeria_arena'];
/** Shown while the book is placed in the headset: loaded in the background right away. */
export const UI_PLACEMENT: readonly UiName[] = ['status_finding_table', 'status_pinch_to_place', 'status_ready'];

const prefetched = new Set<'en' | 'id'>();

/**
 * Fetches the rest (race, robots, results) in the current language one at a
 * time once the home page is up, so on a slow network they do not crowd out
 * what the page needs first and none waits long enough to time out. Called
 * again when the language changes. Anything shown before it arrives keeps
 * its text card until then (see `placeUiImage`).
 */
export async function prefetchUi(): Promise<void> {
  if (prefetched.has(uiLang)) return;
  prefetched.add(uiLang);
  // In Indonesian the placement stickers' own versions come first: the manifest only preloads the English ones.
  const names = Object.keys(UI_FILES) as UiName[];
  const order = [...names.filter((n) => UI_PLACEMENT.includes(n)), ...names.filter((n) => !UI_PLACEMENT.includes(n))];
  for (const name of order) {
    if (UI_FIRST.includes(name) || (UI_PLACEMENT.includes(name) && key(name) === `ui_${name}`)) continue;
    const id = key(name);
    if (AssetManager.getTexture(id)) continue;
    try {
      await AssetManager.loadTextureById(id);
    } catch (error) {
      console.warn(`[ui] ${name} did not prefetch; it loads when shown`, error);
    }
  }
}

/**
 * A paper UI image on a plane, `scale` times its asset size and never wider
 * than `maxWidth` metres; null while the image has not loaded, so the caller
 * keeps its text card instead.
 */
export function uiImage(name: UiName, scale = 1, maxWidth = Infinity): Mesh | null {
  // Only the current language: an English sticker never stands in for an Indonesian text card.
  const shared = AssetManager.getTexture(key(name)) as Texture | undefined;
  const image = shared?.image as { width: number; height: number } | undefined;
  if (!shared || !image?.width) return null;
  // A clone shares the image, and can be disposed with its mesh on its own.
  const map = shared.clone();
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  let h = UI_HEIGHT[name] * scale;
  let w = (h * image.width) / image.height;
  if (w > maxWidth) {
    h *= maxWidth / w;
    w = maxWidth;
  }
  const material = new MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: DoubleSide });
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  mesh.name = `ui-${name}`;
  mesh.renderOrder = 10;
  if (FLOATING.has(name)) {
    // A clear sticker floating in the room gets a sheet of sand paper behind
    // it in the headset, the same colour as the browser backdrop, so its
    // cream letters read against any wall. Hidden outside the headset.
    const back = new Mesh(new PlaneGeometry(w * BACKING_W, h * BACKING_H), backingPaper);
    back.name = 'sticker-backing';
    back.position.set(0, h * BACKING_DROP, -0.0008);
    back.renderOrder = 9;
    back.visible = backingsShown;
    mesh.add(back);
    backings.add(back);
  }
  return mesh;
}

/** Clear stickers that float with nothing behind them. */
const FLOATING = new Set<UiName>([
  'title_numeria_arena',
  'status_finding_table',
  'status_pinch_to_place',
  'race_wave_1',
  'race_wave_2',
  'race_wave_3',
  'hint_pop_right_answer',
  'recap_title',
]);
/** The backing covers the letters, not the image's empty shadow room. */
const BACKING_W = 0.94;
const BACKING_H = 0.78;
const BACKING_DROP = 0.03;
const backingPaper = new MeshBasicMaterial({ color: new Color(0xe0c780), side: DoubleSide });
const backings = new Set<Mesh>();
let backingsShown = false;

/** Shows the sand-paper backings behind floating stickers (in the headset) or hides them. */
export function showStickerBackings(on: boolean): void {
  if (on === backingsShown) return;
  backingsShown = on;
  for (const b of backings) {
    // A sticker that left the scene takes its backing with it.
    if (!b.parent?.parent) backings.delete(b);
    else b.visible = on;
  }
}

/**
 * Puts a paper UI image on `parent` at `(x, y, z)`. Until the image has
 * loaded, `fallback` (a text card) stands in its place and is removed when
 * the image arrives. Returns whatever is showing now.
 */
export function placeUiImage(
  name: UiName,
  parent: Object3D,
  at: [number, number, number],
  opts: { scale?: number; maxWidth?: number; fallback?: () => Object3D | undefined; ready?: (mesh: Mesh) => void } = {},
): Object3D | undefined {
  const put = (): Mesh | null => {
    const mesh = uiImage(name, opts.scale, opts.maxWidth);
    if (!mesh) return null;
    mesh.position.set(...at);
    parent.add(mesh);
    opts.ready?.(mesh);
    return mesh;
  };
  const now = put();
  if (now) return now;
  const stand = opts.fallback?.();
  AssetManager.loadTextureById(key(name))
    .then(() => {
      // The card may have gone meanwhile (the menu closed); then so do we.
      if (stand && !stand.parent) return;
      if (put()) stand?.removeFromParent();
    })
    .catch((error) => console.error(`[ui] ${name} did not load`, error));
  return stand;
}
