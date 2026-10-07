import { assetOf, Book, type Landmark, type LandKind, type TownEvent } from './town-core.js';

/**
 * A sample town to look at, never to change: three pages of land built the
 * way a town grows over many weeks of play, with a landmark on each and its
 * streets busy with people and cars, for a visitor who has not earned the
 * Folds to see where it can go. Its events are checked by the same core as
 * a real town; any it refuses are dropped.
 */

type Plan = [asset: string, x: number, y: number, rot?: number];

const row = (asset: string, y: number, from: number, to: number, rot = 0): Plan[] =>
  Array.from({ length: to - from + 1 }, (_, i) => [asset, from + i, y, rot]);
const col = (asset: string, x: number, from: number, to: number, rot = 0): Plan[] =>
  Array.from({ length: to - from + 1 }, (_, i) => [asset, x, from + i, rot]);

const PAGES: { kind: LandKind; plan: Plan[] }[] = [
  {
    kind: 'plain',
    plan: [
      ...row('road_straight', 3, 0, 3),
      ['road_cross', 4, 3],
      ...row('road_straight', 3, 5, 9),
      ...col('road_straight', 4, 0, 2, 90),
      ...col('road_straight', 4, 4, 6, 90),
      ['house_hut', 0, 0],
      ['house_cottage', 1, 0],
      ['house_basic', 2, 0],
      ['house_row', 3, 0],
      ['house_two_storey', 0, 1],
      ['house_bungalow', 1, 1],
      ['house_garden', 2, 1],
      ['house_minimalist', 3, 1],
      ['tree_round', 0, 2],
      ['prop_street_lamp', 1, 2],
      ['prop_bench', 2, 2],
      ['plant_flower_bed', 3, 2],
      ['public_school', 5, 0],
      ['public_library', 7, 0],
      ['public_clinic', 9, 0],
      ['tree_pine', 10, 0],
      ['shop_general', 7, 1],
      ['tree_pine', 10, 1],
      ['shop_cafe', 5, 2],
      ['office_shophouse', 6, 2],
      ['prop_fountain', 7, 2],
      ['tree_sakura', 8, 2],
      ['prop_street_lamp', 9, 2],
      ['plant_flower_bush', 10, 2],
      ['sport_stadium', 0, 4],
      ['tree_round', 3, 4],
      ['prop_bench', 3, 5],
      ['prop_mailbox', 3, 6],
      ['office_glass_tower', 5, 4],
      ['shop_bank', 7, 4],
      ['shop_minimarket', 8, 4],
      ['park_flower', 9, 4],
      ['park_fountain', 10, 4],
      ['office_small', 7, 5],
      ['shop_restaurant', 8, 5],
      ['house_apartment', 9, 5],
      ['house_joglo', 5, 6],
      ['house_gadang', 6, 6],
      ['plant_hedge', 7, 6],
      ['house_colonial', 8, 6],
      ['vehicle_sedan', 1, 3, 90],
      ['vehicle_bus', 6, 3, 90],
      ['vehicle_taxi', 8, 3, 270],
      ['people_child', 4, 1],
      ['people_man', 4, 5],
      ['people_student', 2, 3],
    ],
  },
  {
    kind: 'river',
    plan: [
      ...[2, 4].flatMap((y) => [
        ...row('road_straight', y, 0, 1),
        ['road_cross', 2, y] as Plan,
        ...row('road_straight', y, 3, 7),
        ['road_cross', 8, y] as Plan,
        ['road_straight', 9, y] as Plan,
      ]),
      ['bridge_road', 2, 3, 90],
      ['bridge_road', 8, 3, 90],
      ['house_stilt', 0, 0],
      ['house_basic', 1, 0],
      ['house_cottage', 2, 0],
      ['public_mosque', 3, 0],
      ['house_modern_glass', 5, 0],
      ['house_duplex', 6, 0],
      ['shop_hotel', 8, 0],
      ['tree_palm', 10, 0],
      ['house_two_storey', 0, 1],
      ['tree_round', 1, 1],
      ['house_bungalow', 2, 1],
      ['public_post_office', 5, 1],
      ['house_garden', 6, 1],
      ['plant_bamboo', 7, 1],
      ['tree_pine', 10, 1],
      ['shop_market', 0, 5],
      ['house_hut', 2, 5],
      ['prop_bus_stop', 3, 5],
      ['public_train_station', 4, 5],
      ['house_flats', 7, 5],
      ['shop_cinema', 9, 5],
      ['house_cottage', 2, 6],
      ['prop_bench', 3, 6],
      ['house_villa_pool', 9, 6],
      ['vehicle_school_bus', 5, 2, 90],
      ['vehicle_motorcycle', 0, 4, 90],
      ['vehicle_becak', 6, 4, 270],
      ['people_hijab', 3, 2],
      ['animal_bird', 9, 4],
    ],
  },
  {
    kind: 'beach',
    plan: [
      ...row('road_straight', 3, 0, 9),
      ['house_hut', 0, 2],
      ['house_hut', 1, 2],
      ['tree_round', 2, 2],
      ['office_shophouse', 3, 2],
      ['shop_restaurant', 4, 2],
      ['shop_hotel', 5, 1],
      ['house_stilt', 0, 4],
      ['house_cottage', 1, 4],
      ['house_cottage', 2, 4],
      ['tree_palm', 3, 4],
      ['prop_street_lamp', 4, 4],
      ['house_two_storey', 5, 4],
      ['shop_cafe', 6, 4],
      ['tree_coconut', 7, 4],
      ['prop_beach_umbrella', 8, 4],
      ['tree_palm', 9, 4],
      ['tree_coconut', 0, 5],
      ['prop_bench', 1, 5],
      ['people_jogger', 2, 5],
      ['animal_bird', 3, 5],
      ['prop_beach_umbrella', 4, 5],
      ['people_sitting', 5, 5],
      ['plant_flower_pot', 6, 5],
      ['tree_palm', 7, 5],
      ['vehicle_van', 7, 3, 90],
      ['vehicle_bicycle', 1, 3, 90],
    ],
  },
];

/** Tiles left free on a full page, filled with trees before the next page opens. */
const FILL: Plan[] = Array.from({ length: 70 }, (_, i) => [i % 2 ? 'tree_pine' : 'tree_round', i % 10, Math.floor(i / 10)]);

const LANDMARKS: Omit<Landmark, 'at_ms'>[] = [
  { mission: 'place_value', landmark: 'landmark_number_hall', tier: 3, skill: 'PV.READ' },
  { mission: 'fractions', landmark: 'landmark_fraction_bridge', tier: 2, skill: 'FR.EQUIV' },
  { mission: 'measurement', landmark: 'landmark_clock_tower', tier: 1, skill: 'ME.AREA' },
];

/** Spare Folds the sample shows beside what it spent. */
const SPARE = 35;
const PLENTY = 1_000_000;

export interface Sample {
  events: TownEvent[];
  landmarks: Landmark[];
  earned: number;
  /** Planned changes the core refused, for the check script. */
  dropped: string[];
}

/** The sample town, built afresh: every event weeks old, so every building stands finished. */
export function sampleTown(now = Date.now()): Sample {
  const start = now - 40 * 86_400_000;
  const book = new Book([], PLENTY);
  const events: TownEvent[] = [];
  const dropped: string[] = [];
  let spent = 0;
  const tryEvent = (ev: TownEvent): string => {
    const reason = book.apply(ev);
    if (!reason) events.push(ev);
    return reason;
  };
  const place = ([asset, x, y, rot = 0]: Plan, land: number, quiet: boolean) => {
    const n = events.length;
    const reason = tryEvent({ type: 'town_place', event_id: `sample-${n}`, at_ms: start + n * 60_000, asset, land, x, y, rot });
    if (!reason) spent += assetOf(asset)?.price ?? 0;
    else if (!quiet) dropped.push(`${asset} at ${land}:${x},${y} ${reason}`);
  };
  PAGES.forEach((page, land) => {
    const open = () => tryEvent({ type: 'town_land', event_id: `sample-${events.length}`, at_ms: start + events.length * 60_000, kind: page.kind });
    let reason = open();
    for (const p of FILL) {
      if (!reason || land === 0) break;
      place(p, land - 1, true);
      reason = open();
    }
    if (reason) dropped.push(`land ${land} ${reason}`);
    // Cheaper pieces first, so the shop has opened each one by its turn.
    const plan = [...page.plan].sort((a, b) => (assetOf(a[0])?.unlock_at ?? 0) - (assetOf(b[0])?.unlock_at ?? 0));
    for (const p of plan) place(p, land, false);
  });
  book.free();
  const landmarks = LANDMARKS.map((l, i) => ({ ...l, at_ms: start + (i + 1) * 7 * 86_400_000 }));
  return { events, landmarks, earned: spent + SPARE, dropped };
}
