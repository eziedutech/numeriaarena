import { assetOf, footprint, townRulesNow, type Placed } from './town-core.js';
import { GRADES, type Grade, type Page, type Shape } from './town-facts.js';
import type { TownModel } from './town-model.js';

/**
 * What the maths card and FINISH NOW need from a town, the same on the
 * computer and in the headset: the player's grade, a building's shape, the
 * page it stands on, and the tries made at each building's question.
 */

export const GRADE_KEY = 'numeria.town.grade';
const TRIES_KEY = 'numeria.town.tries';
/** After a wrong answer, the next question waits this long. */
export const RETRY_MS = 30_000;

export interface Tried {
  attempt: number;
  next_at: number;
}

/** FINISH NOW tries by building, kept on the device so a reload does not skip the wait. */
export const tries = {
  all(): Record<string, Tried> {
    try {
      return JSON.parse(localStorage.getItem(TRIES_KEY) ?? '{}') as Record<string, Tried>;
    } catch {
      return {};
    }
  },
  get(id: string): Tried | undefined {
    return this.all()[id];
  },
  set(id: string, v: Tried): void {
    const all = this.all();
    all[id] = v;
    // Only the newest few are worth keeping.
    const kept = Object.entries(all).slice(-50);
    try {
      localStorage.setItem(TRIES_KEY, JSON.stringify(Object.fromEntries(kept)));
    } catch {
      // Without storage no wait can be kept; the next question comes at once.
    }
  },
};

/** A seat's grade from its class; a guest picks one, grade 5 at first. */
export function gradeOf(model: TownModel | undefined): Grade {
  const seat = model?.seat;
  let g = seat?.grade;
  if (!seat) {
    try {
      g = Number(localStorage.getItem(GRADE_KEY) ?? localStorage.getItem('numeria.board.grade'));
    } catch {
      g = undefined;
    }
  }
  return (GRADES as readonly number[]).includes(g ?? 0) ? (g as Grade) : 5;
}

export function shapeOf(it: Placed): Shape {
  const a = assetOf(it.asset)!;
  const [w, h] = footprint(a, it.rot);
  return { w, h, windows: a.windows, floors: a.floors };
}

/** Tiles of page `land` that can be built on, and tiles built. */
export function pageTiles(model: TownModel, land: number): Page {
  const v = model.view();
  const layout = townRulesNow().lands.find((l) => l.kind === v.lands[land])?.layout ?? [];
  const free = layout.join('').split('').filter((c) => c === '.').length;
  const used = new Set<string>();
  for (const it of v.items) {
    if (it.land !== land) continue;
    const a = assetOf(it.asset);
    // People and cars stand on a road's tile, a bridge on the water; small pieces share a tile.
    if (!a || a.group === 'decor' || a.id === 'bridge_road') continue;
    const [w, h] = footprint(a, it.rot);
    for (let y = it.y; y < it.y + h; y++) for (let x = it.x; x < it.x + w; x++) used.add(`${x},${y}`);
  }
  return { free, used: used.size };
}

/** Roads, nature, people and cars have no maths card. */
export function hasFacts(asset: string): boolean {
  const a = assetOf(asset);
  return !!a && a.group !== 'road' && a.group !== 'nature' && a.group !== 'decor';
}
