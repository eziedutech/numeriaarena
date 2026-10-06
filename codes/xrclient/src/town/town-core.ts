import init, { TownBook, townEarnings, townRules } from '../wasm/pkg/foldlings_core.js';

/**
 * Fold Town's rules, from the same Rust core the server judges with: the
 * shop, the pages of land, the Folds earned from plays, and a town replayed
 * from its events.
 */

export type LandKind = 'plain' | 'river' | 'hills' | 'beach';
export const LAND_KINDS: readonly LandKind[] = ['plain', 'river', 'hills', 'beach'];

export type Group = 'road' | 'nature' | 'decor' | 'small_house' | 'medium_house' | 'public' | 'large';

export interface Asset {
  id: string;
  group: Group;
  price: number;
  w: number;
  h: number;
  unlock_at: number;
  windows: [number, number];
  floors: number;
}

export interface Rules {
  catalog: Asset[];
  /** Ids the town once used, with the piece each names now. */
  aliases: [string, string][];
  cols: number;
  rows: number;
  full_tenths: number;
  points_per_fold: number;
  session_bonus: number;
  streak_step: number;
  streak_max: number;
  welcome: number;
  device_daily_cap: number;
  lands: { kind: LandKind; plot: [number, number]; layout: string[] }[];
  map_cols: number;
  map_rows: number;
}

export interface Earnings {
  plays: number;
  streak: number;
  welcome: number;
  held_back: number;
  total: number;
}

export interface Play {
  day: number;
  points: number;
  source: 'device' | 'server';
}

export type TownEvent =
  | { type: 'town_land'; event_id: string; at_ms: number; kind: LandKind }
  | { type: 'town_place'; event_id: string; at_ms: number; asset: string; land: number; x: number; y: number; rot: number; cols?: number }
  | { type: 'town_move'; event_id: string; at_ms: number; place_id: string; land: number; x: number; y: number; rot: number; cols?: number }
  | { type: 'town_remove'; event_id: string; at_ms: number; place_id: string }
  | { type: 'town_finish'; event_id: string; at_ms: number; place_id: string };

export interface Placed {
  id: string;
  asset: string;
  price: number;
  land: number;
  x: number;
  y: number;
  rot: number;
  placed_at_ms: number;
  finished_at_ms: number | null;
  ready_at_ms: number;
  ready: boolean;
}

export interface TownView {
  lands: LandKind[];
  items: Placed[];
  earned: number;
  balance: number;
  buildings: number;
  value: number;
  land_closed: string | null;
}

export interface Landmark {
  mission: string;
  landmark: string;
  tier: number;
  skill: string;
  at_ms: number;
}

let rules: Rules | undefined;

/** Loads the core once; every other call here needs it. */
export async function loadTownCore(): Promise<Rules> {
  await init();
  rules ??= JSON.parse(townRules()) as Rules;
  return rules;
}

export function townRulesNow(): Rules {
  if (!rules) throw new Error('town core not loaded');
  return rules;
}

export function assetOf(id: string): Asset | undefined {
  const r = townRulesNow();
  const now = r.aliases.find(([old]) => old === id)?.[1] ?? id;
  return r.catalog.find((a) => a.id === now);
}

/** Tiles covered when turned by `rot` degrees. */
export function footprint(a: { w: number; h: number }, rot: number): [number, number] {
  return rot % 180 === 90 ? [a.h, a.w] : [a.w, a.h];
}

export function earningsOf(plays: Play[]): Earnings {
  return JSON.parse(townEarnings(JSON.stringify(plays))) as Earnings;
}

/** A town replayed from its events, to try new ones and to draw. */
export class Book {
  private book: TownBook;
  /** Events the replay refused, with the reason. */
  readonly refused: [string, string][];

  constructor(events: TownEvent[], earned: number) {
    this.book = new TownBook(JSON.stringify(events), earned);
    this.refused = JSON.parse(this.book.refused()) as [string, string][];
  }

  /** "" when it was applied, else the reason. */
  apply(ev: TownEvent): string {
    return this.book.apply(JSON.stringify(ev));
  }

  fits(asset: string, land: number, x: number, y: number, rot: number, ignore = ''): string {
    return this.book.fits(asset, land, x, y, rot, ignore);
  }

  view(nowMs: number): TownView {
    return JSON.parse(this.book.view(nowMs)) as TownView;
  }

  free(): void {
    this.book.free();
  }
}
