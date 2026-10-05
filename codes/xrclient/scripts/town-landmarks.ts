// Checks a guest's Fold Town landmarks worked out on the device: five right
// answers in a skill raise its mission's landmark, a seat's answers on the
// same device do not count, the skill names are found in both languages, and
// a landmark is only new once. Run with `bun run scripts/town-landmarks.ts`.

import init from '../src/wasm/pkg/foldlings_core.js';
import type { LocalStore, StoredEvent } from '../src/storage.js';

await init({ module_or_path: await Bun.file(new URL('../src/wasm/pkg/foldlings_core_bg.wasm', import.meta.url)).arrayBuffer() });

const kept = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => kept.get(k) ?? null,
  setItem: (k: string, v: string) => void kept.set(k, v),
};

const { guestLandmarks, skillTitle, unmarked } = await import('../src/town/town-landmarks.js');

let failed = 0;
function check(ok: boolean, what: string): void {
  if (!ok) {
    failed++;
    console.error(`FAIL ${what}`);
  }
}

function row(i: number, skill: string, right: boolean, seat?: string): StoredEvent {
  return {
    event_id: `p-${i}`,
    profile_id: 'p',
    mode: 'practice',
    ...(seat ? { seat } : {}),
    stored_at: 1_760_000_000_000 + i * 1000,
    event: { event_id: `${i}`, at_ms: i * 10.5, skill, game_type: 'balloon_burst', p_final: 0.75, result: right ? 'correct' : 'wrong', assisted: false },
  };
}

const store = (rows: StoredEvent[]) => ({ answers: async () => rows }) as unknown as LocalStore;

check((await guestLandmarks(store([]))).length === 0, 'no answers, no landmark');

const four = [0, 1, 2, 3].map((i) => row(i, 'FR.EQUIV', true));
check((await guestLandmarks(store(four))).length === 0, 'four right answers raise nothing');

const five = [...four, row(4, 'FR.EQUIV', false), row(5, 'FR.EQUIV', true)];
const one = await guestLandmarks(store(five));
check(one.length === 1 && one[0].landmark === 'landmark_fraction_bridge' && one[0].skill === 'FR.EQUIV' && one[0].tier === 1, `five right answers raise the Fraction Bridge: ${JSON.stringify(one)}`);

const seat = [10, 11, 12, 13, 14].map((i) => row(i, 'PV.READ', true, 'class:1'));
const mixed = await guestLandmarks(store([...five, ...seat]));
check(mixed.length === 1, 'a seat answers on the device are not the guest');

const two = await guestLandmarks(store([...five, ...[20, 21, 22, 23, 24].map((i) => row(i, 'MD.FACTS', true))]));
check(two.length === 2 && two[1].landmark === 'landmark_times_tower', `the second landmark comes second: ${two.map((l) => l.landmark)}`);

check(skillTitle('FR.EQUIV', 'en') !== 'FR.EQUIV' && skillTitle('FR.EQUIV', 'id') !== skillTitle('FR.EQUIV', 'en'), 'skill names in both languages');
check(skillTitle('XX.NONE', 'en') === 'XX.NONE', 'an unknown skill keeps its code');

check(unmarked('told', 'guest', two).length === 2, 'both new at first');
check(unmarked('told', 'guest', two).length === 0, 'not new again');
check(unmarked('grown', 'guest', two).length === 2, 'grown is kept apart from told');
check(unmarked('told', 'seat:x', one).length === 1, 'kept apart by owner');

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('town landmarks: all checks passed');
