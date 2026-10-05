import init, { instantiateItem } from '../wasm/pkg/foldlings_core.js';
import { bundledTemplates } from '../game/core.js';

/**
 * The questions of a smartboard race: the same list, in the same order, for
 * every column. Each is a template from the bundled bank made concrete with
 * the race's seed, so the race works offline and plays the same again from
 * the same seed. A column sees the choices in its own order, so a player
 * cannot copy where a neighbour pressed.
 */

export type Topic = 'mixed' | 'PV' | 'MD' | 'FR' | 'DC' | 'ME';
export const TOPICS: readonly Topic[] = ['mixed', 'PV', 'MD', 'FR', 'DC', 'ME'];

export interface Question {
  template_id: string;
  skill: string;
  prompt: { en: string; id: string };
  /** The right answer first, then two lures. */
  choices: { text: string; misconception?: string }[];
}

interface Source {
  id: string;
  skill: string;
  grades: number[];
  answer_kind: string;
  raw: string;
}

let sources: Source[] | undefined;

function bank(): Source[] {
  sources ??= bundledTemplates()
    .map((raw) => {
      const t = JSON.parse(raw) as Omit<Source, 'raw'>;
      return { id: t.id, skill: t.skill, grades: t.grades ?? [], answer_kind: t.answer_kind, raw };
    })
    // Questions with one answer to pick; sorting into gates has none.
    .filter((t) => t.answer_kind === 'value');
  return sources;
}

/** Templates for a grade and topic; a topic with few for the grade borrows from the grade below. */
function pool(grade: number, topic: Topic): Source[] {
  const of = (g: number) => bank().filter((t) => t.grades.includes(g) && (topic === 'mixed' || t.skill.startsWith(`${topic}.`)));
  const own = of(grade);
  return own.length >= 4 || grade <= 4 ? own : [...own, ...of(grade - 1).filter((t) => !own.includes(t))];
}

/** A small seeded generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(list: readonly T[], next: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface Made {
  template_id: string;
  skill: string;
  prompt: { en: string; id: string };
  answer: { text: string } | null;
  distractors: { text: string; misconception: string }[];
}

/** `count` questions for a grade and topic from one seed. */
export async function makeQuestions(grade: number, topic: Topic, count: number, seed: number): Promise<Question[]> {
  await init();
  const next = seeded(seed);
  const from = pool(grade, topic);
  const out: Question[] = [];
  if (from.length === 0) return out;
  // Every template once before any comes back, in an order of the seed's.
  let deck: Source[] = [];
  for (let tries = 0; out.length < count && tries < count * 6; tries++) {
    if (deck.length === 0) deck = shuffled(from, next);
    const t = deck.pop()!;
    let item: Made;
    try {
      item = JSON.parse(instantiateItem(t.raw, Math.floor(next() * 2 ** 31))) as Made;
    } catch {
      continue;
    }
    const answer = item.answer?.text;
    if (!answer) continue;
    const seen = new Set([answer]);
    const lures = shuffled(item.distractors, next).filter((d) => !seen.has(d.text) && seen.add(d.text));
    if (lures.length < 2) continue;
    out.push({
      template_id: item.template_id,
      skill: item.skill,
      prompt: item.prompt,
      choices: [{ text: answer }, ...lures.slice(0, 2).map((d) => ({ text: d.text, misconception: d.misconception }))],
    });
  }
  return out;
}
