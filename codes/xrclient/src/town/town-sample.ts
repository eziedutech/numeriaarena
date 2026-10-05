import { assetOf, Book, type Landmark, type LandKind, type TownEvent } from './town-core.js';

/**
 * A sample town to look at, never to change: three pages of land built the
 * way a town grows over many weeks of play, with a landmark on each, for a
 * visitor who has not earned the Folds to see where it can go. Its events
 * are checked by the same core as a real town; any it refuses are dropped.
 */

type Plan = [asset: string, x: number, y: number, rot?: number];

const row = (asset: string, y: number, from: number, to: number, rot = 0): Plan[] =>
  Array.from({ length: to - from + 1 }, (_, i) => [asset, from + i, y, rot]);

const PAGES: { kind: LandKind; plan: Plan[] }[] = [
  {
    kind: 'plain',
    plan: [
      ...row('road_straight', 3, 0, 3),
      ['road_cross', 4, 3],
      ...row('road_straight', 3, 5, 9),
      ['road_straight', 4, 4, 90],
      ['road_straight', 4, 5, 90],
      ['road_straight', 4, 6, 90],
      ['house_hut', 0, 0],
      ['house_cottage', 1, 0],
      ['house_basic', 2, 0],
      ['house_basic', 3, 0],
      ['house_two_storey', 0, 1],
      ['house_two_storey', 2, 1],
      ['tree_round', 0, 2],
      ['tree_round', 1, 2],
      ['lamp', 2, 2],
      ['bench', 3, 2],
      ['tree_pine', 7, 0],
      ['tree_round', 8, 0],
      ['tree_pine', 9, 0],
      ['tree_pine', 7, 1],
      ['tree_pine', 9, 1],
      ['school', 4, 0],
      ['fountain', 4, 2],
      ['shophouse', 5, 2],
      ['shophouse', 7, 2],
      ['lamp', 9, 2],
      ['lamp', 3, 4],
      ['tree_round', 3, 5],
      ['bench', 3, 6],
      ['park_flower', 7, 4],
      ['fountain', 9, 4],
      ['tree_round', 9, 5],
      ['house_two_storey', 5, 6],
      ['house_cottage', 7, 6],
      ['house_hut', 8, 6],
      ['tree_pine', 9, 6],
      ['stadium', 0, 4],
      ['office_tower', 5, 4],
    ],
  },
  {
    kind: 'river',
    plan: [
      ...row('road_straight', 2, 0, 9),
      ...row('road_straight', 4, 0, 9),
      ['house_basic', 0, 0],
      ['house_basic', 1, 0],
      ['house_cottage', 2, 0],
      ['house_basic', 3, 0],
      ['house_two_storey', 0, 1],
      ['house_two_storey', 2, 1],
      ['tree_round', 9, 0],
      ['tree_pine', 9, 1],
      ['house_hut', 7, 5],
      ['house_hut', 8, 5],
      ['house_cottage', 9, 5],
      ['tree_round', 7, 6],
      ['tree_pine', 8, 6],
      ['tree_round', 9, 6],
      ['bench', 4, 6],
      ['school', 4, 0],
      ['park_flower', 0, 5],
      ['shophouse', 2, 5],
      ['shophouse', 2, 6],
      ['fountain', 4, 5],
      ['office_tower', 7, 0],
      ['office_tower', 5, 5],
    ],
  },
  {
    kind: 'beach',
    plan: [
      ...row('road_straight', 4, 0, 9),
      ['house_cottage', 0, 5],
      ['house_cottage', 1, 5],
      ['house_cottage', 2, 5],
      ['tree_pine', 3, 5],
      ['lamp', 4, 5],
      ['house_two_storey', 5, 5],
      ['bench', 7, 5],
      ['tree_round', 9, 5],
      ['house_hut', 0, 3],
      ['house_hut', 1, 3],
      ['tree_round', 2, 3],
      ['shophouse', 3, 3],
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
