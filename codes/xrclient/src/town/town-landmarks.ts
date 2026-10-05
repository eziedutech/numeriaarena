import { skillStars } from '../wasm/pkg/foldlings_core.js';
import skills from '../../../content/skills.json';
import type { Lang } from '../settings.js';
import type { LocalStore, StoredEvent } from '../storage.js';
import { loadTownCore, type Landmark } from './town-core.js';

/**
 * The skill landmarks of a town: a guest's worked out on the device from the
 * answers kept here, by the same core that works out a seat's on the server.
 * Each landmark stands on a page's gold star plot; the first time a player
 * sees one it folds up, and the first results screen after it was raised
 * names the skill that raised it.
 */

const SKILLS = new Map(skills.skills.map((s) => [s.code, s.title]));

export function skillTitle(code: string, lang: Lang): string {
  return SKILLS.get(code)?.[lang] ?? code;
}

/** A guest's landmarks from every answer of no seat kept on the device. */
export async function guestLandmarks(store: LocalStore): Promise<Landmark[]> {
  await loadTownCore();
  const rows = await store.answers();
  const answers = rows.filter((r) => !r.seat).map((r: StoredEvent) => ({ ...(r.event as object), at_ms: r.stored_at }));
  if (!answers.length) return [];
  try {
    return (JSON.parse(skillStars(JSON.stringify(answers), 0, Date.now())) as { landmarks: Landmark[] }).landmarks;
  } catch (error) {
    console.warn(`[town] could not work out the landmarks: ${String(error)}`);
    return [];
  }
}

/** Landmarks of `owner` already marked under `what` on this device. */
function marked(what: 'grown' | 'told', owner: string): Set<string> {
  try {
    const list = JSON.parse(localStorage.getItem(`numeria.town.${what}.${owner}`) ?? '[]') as string[];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

/** The landmarks not yet marked under `what`, which are marked now. */
export function unmarked(what: 'grown' | 'told', owner: string, landmarks: Landmark[]): Landmark[] {
  const seen = marked(what, owner);
  const fresh = landmarks.filter((l) => !seen.has(l.landmark));
  if (!fresh.length) return [];
  for (const l of fresh) seen.add(l.landmark);
  try {
    localStorage.setItem(`numeria.town.${what}.${owner}`, JSON.stringify([...seen]));
  } catch {
    // Without storage it is said again next time.
  }
  return fresh;
}
