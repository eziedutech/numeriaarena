import type { RaceCall } from './game/core.js';
import type { RowSnapshot } from './race-card.js';

/**
 * A race left before the results (page closed, headset off for good) can
 * pick up again from the start of its next round, for this long.
 */
export const CHECKPOINT_KEY = 'numeria.raceCheckpoint';
const CHECKPOINT_MAX_MS = 10 * 60 * 1000;

/**
 * What a race needs to pick up again: its seed and every call made on it
 * (replayed on a fresh race, see `Race.replay`), the game clock when it was
 * written, which round comes next, and the race card's rows.
 */
export interface RaceCheckpoint {
  v: 1;
  seed: number;
  calls: RaceCall[];
  now: number;
  savedAt: number;
  /** The round that comes next, 1-based for people (round 2 = the second wave). */
  next: number;
  card: RowSnapshot[];
}

/** The race waiting to be picked up again, or null (none, too old, or unreadable). */
export function readCheckpoint(): RaceCheckpoint | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const cp = JSON.parse(raw) as RaceCheckpoint;
    if (cp.v !== 1 || Date.now() - cp.savedAt > CHECKPOINT_MAX_MS) {
      localStorage.removeItem(CHECKPOINT_KEY);
      return null;
    }
    return cp;
  } catch {
    return null;
  }
}

export function clearCheckpoint(): void {
  try {
    localStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    // Nothing kept.
  }
}
