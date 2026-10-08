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
  /** Pieces that stand on a quarter of a tile, up to `spots` on one. */
  small: string[];
  spots: number;
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
  | { type: 'town_place'; event_id: string; at_ms: number; asset: string; land: number; x: number; y: number; rot: number; cols?: number; spot?: number }
  | { type: 'town_move'; event_id: string; at_ms: number; place_id: string; land: number; x: number; y: number; rot: number; cols?: number; spot?: number }
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
  /** The quarter of its tile a small piece stands on: 0 and 1 at the back, 2 and 3 at the front. */
  spot?: number;
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

/** Whether a piece stands on a quarter of a tile rather than the whole. */
export function isSmall(id: string): boolean {
  const a = assetOf(id);
  return !!a && townRulesNow().small.includes(a.id);
}

/** The quarter of tile (floor x, floor z) a point on the page is in. */
export function quarterAt(x: number, z: number): number {
  return (x - Math.floor(x) >= 0.5 ? 1 : 0) + (z - Math.floor(z) >= 0.5 ? 2 : 0);
}

/** The middle of quarter `spot` of tile (x, y). */
export function spotMiddle(x: number, y: number, spot: number): [number, number] {
  return [x + 0.25 + (spot % 2) * 0.5, y + 0.25 + Math.floor(spot / 2) * 0.5];
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

  /** "" or why not; `spot` is the quarter asked for a small piece, -1 for the first free. */
  fits(asset: string, land: number, x: number, y: number, rot: number, ignore = '', spot = -1): string {
    return this.book.fits(asset, land, x, y, rot, spot, ignore);
  }

  /** The quarter a small piece would stand on there, -1 when it is not small or does not fit. */
  spotFor(asset: string, land: number, x: number, y: number, rot: number, ignore = '', spot = -1): number {
    return this.book.spotFor(asset, land, x, y, rot, spot, ignore);
  }

  view(nowMs: number): TownView {
    return JSON.parse(this.book.view(nowMs)) as TownView;
  }

  free(): void {
    this.book.free();
  }
}
