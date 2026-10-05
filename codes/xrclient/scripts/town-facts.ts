// Checks the facts and FINISH NOW questions of every Fold Town building in
// both languages and all three grades: the numbers are right, the three
// choices differ, and no text is left with a gap in it.
// Run: bun run scripts/town-facts.ts
import init, { townRules } from '../src/wasm/pkg/foldlings_core.js';
import { factsOf, finishQuestion, GRADES, questionKinds, TILE_M, type Shape } from '../src/town/town-facts.ts';

await init({ module_or_path: await Bun.file(new URL('../src/wasm/pkg/foldlings_core_bg.wasm', import.meta.url)).arrayBuffer() });
const rules = JSON.parse(townRules()) as {
  catalog: { id: string; group: string; w: number; h: number; windows: [number, number]; floors: number }[];
};

let bad = 0;
const fail = (what: string) => {
  bad++;
  console.log(`FAIL ${what}`);
};
const gap = /undefined|NaN|\$\{|null/;

function answer(s: Shape, kind: string): number {
  const a = s.w * TILE_M;
  const b = s.h * TILE_M;
  switch (kind) {
    case 'windows':
      return s.windows[0] * s.windows[1];
    case 'tiles':
      return s.w * s.h;
    case 'sides':
      return 2 * (s.w + s.h);
    case 'area':
      return a * b;
    case 'perimeter':
      return 2 * (a + b);
    case 'cubes':
      return s.w * s.h * s.floors;
    case 'volume':
      return a * b * s.floors * TILE_M;
  }
  return NaN;
}

let questions = 0;
for (const a of rules.catalog) {
  if (a.group === 'road' || a.group === 'nature') continue;
  for (const [w, h] of [
    [a.w, a.h],
    [a.h, a.w],
  ]) {
    const s: Shape = { w, h, windows: a.windows, floors: a.floors };
    for (const grade of GRADES) {
      const kinds = questionKinds(s, grade);
      if (!kinds.length) fail(`${a.id} grade ${grade} has no question`);
      for (const lang of ['en', 'id'] as const) {
        const facts = factsOf(s, { free: 63, used: 12 }, grade, lang);
        if (facts.length < 2) fail(`${a.id} grade ${grade} ${lang}: only ${facts.length} fact`);
        for (const f of facts) if (gap.test(f)) fail(`${a.id} ${lang}: "${f}"`);
        const seen = new Set<string>();
        for (let attempt = 0; attempt < 6; attempt++) {
          const q = finishQuestion(s, grade, attempt, lang);
          questions++;
          seen.add(q.kind);
          const right = Number(q.choices[q.right]);
          if (right !== answer(s, q.kind)) fail(`${a.id} ${q.kind}: ${right}, not ${answer(s, q.kind)}`);
          if (new Set(q.choices).size !== 3) fail(`${a.id} ${q.kind}: choices ${q.choices.join(', ')}`);
          if (q.choices.some((c) => !(Number(c) > 0))) fail(`${a.id} ${q.kind}: choices ${q.choices.join(', ')}`);
          if (gap.test(q.prompt) || gap.test(q.hint)) fail(`${a.id} ${lang}: "${q.prompt}" / "${q.hint}"`);
        }
        if (seen.size !== kinds.length) fail(`${a.id} grade ${grade}: tries do not go through every kind`);
      }
    }
  }
}

// One worked out by hand: a shophouse is 2 by 1 tiles, 3 floors, 3 by 4 windows.
const shop: Shape = { w: 2, h: 1, windows: [3, 4], floors: 3 };
const en = factsOf(shop, { free: 50, used: 10 }, 6, 'en');
if (!en.includes('Volume: 6 m × 3 m × 9 m = 162 m³.')) fail(`shophouse volume: ${en.join(' | ')}`);
if (!en.includes('This land is 10 of 50 tiles built: 0.20, about 20%.')) fail(`page percent: ${en.join(' | ')}`);
const id = factsOf(shop, { free: 50, used: 10 }, 6, 'id');
if (!id.includes('Lahan ini sudah terbangun 10 dari 50 petak: 0,20, kira-kira 20%.')) fail(`persen lahan: ${id.join(' | ')}`);
const g4 = factsOf(shop, { free: 50, used: 10 }, 4, 'en');
if (!g4.includes('3 rows of 4 windows: 3 × 4 = 12 windows.')) fail(`windows: ${g4.join(' | ')}`);

console.log(`${questions} questions checked`);
if (bad) {
  console.log(`${bad} problem(s)`);
  process.exit(1);
}
console.log('ok');
