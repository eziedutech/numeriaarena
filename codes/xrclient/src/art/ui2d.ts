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
  title_numeria_arena: 'ui2d/brand/title_numeria_arena.png',
  menu_robot_race: 'ui2d/menu/menu_robot_race.png',
  menu_balloon_burst: 'ui2d/menu/menu_balloon_burst.png',
  menu_orb_forge: 'ui2d/menu/menu_orb_forge.png',
  status_finding_table: 'ui2d/placement/status_finding_table.png',
  status_pinch_to_place: 'ui2d/placement/status_pinch_to_place.png',
  status_ready: 'ui2d/placement/status_ready.png',
  race_wave_1: 'ui2d/race/race_wave_1.png',
  race_wave_2: 'ui2d/race/race_wave_2.png',
  race_wave_3: 'ui2d/race/race_wave_3.png',
  race_boss_round: 'ui2d/race/race_boss_round.png',
  race_double_points: 'ui2d/race/race_double_points.png',
  race_times_up: 'ui2d/race/race_times_up.png',
  race_name_clip: 'ui2d/race/race_name_clip.png',
  race_name_crease: 'ui2d/race/race_name_crease.png',
  robot_nice_cobalt: 'ui2d/race/robot_nice_cobalt.png',
  robot_nice_teal: 'ui2d/race/robot_nice_teal.png',
  robot_yay_cobalt: 'ui2d/race/robot_yay_cobalt.png',
  robot_yay_teal: 'ui2d/race/robot_yay_teal.png',
  robot_got_it_cobalt: 'ui2d/race/robot_got_it_cobalt.png',
  robot_got_it_teal: 'ui2d/race/robot_got_it_teal.png',
  hint_pop_right_answer: 'ui2d/question/hint_pop_right_answer.png',
  feedback_try_again: 'ui2d/question/feedback_try_again.png',
  recap_title: 'ui2d/recap/recap_title.png',
  badge_label_best_comeback: 'ui2d/recap/badge_label_best_comeback.png',
  badge_label_most_improved: 'ui2d/recap/badge_label_most_improved.png',
  badge_label_sharpest_aim: 'ui2d/recap/badge_label_sharpest_aim.png',
  badge_label_steady_streak: 'ui2d/recap/badge_label_steady_streak.png',
  badge_label_brave_try: 'ui2d/recap/badge_label_brave_try.png',
  button_done: 'ui2d/recap/button_done.png',
};


/** Shown on the menu, so loaded before the game starts. */
export const UI_FIRST: readonly UiName[] = ['menu_balloon_burst', 'menu_orb_forge', 'menu_robot_race', 'title_numeria_arena'];

/**
 * A paper UI image on a plane, `scale` times its asset size and never wider
 * than `maxWidth` metres; null while the image has not loaded, so the caller
 * keeps its text card instead.
 */
export function uiImage(name: UiName, scale = 1, maxWidth = Infinity): Mesh | null {
  const shared = AssetManager.getTexture(`ui_${name}`) as Texture | undefined;
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
  AssetManager.loadTextureById(`ui_${name}`)
    .then(() => {
      // The card may have gone meanwhile (the menu closed); then so do we.
      if (stand && !stand.parent) return;
      if (put()) stand?.removeFromParent();
    })
    .catch((error) => console.error(`[ui] ${name} did not load`, error));
  return stand;
}
