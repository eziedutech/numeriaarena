// Checks the sample town: the core takes every planned piece, three pages
// open with a landmark on each, every building stands finished, and its
// Folds cover what it spent. Run with `bun run scripts/town-sample.ts`.

import init from '../src/wasm/pkg/foldlings_core.js';

await init({ module_or_path: await Bun.file(new URL('../src/wasm/pkg/foldlings_core_bg.wasm', import.meta.url)).arrayBuffer() });

const { Book, loadTownCore } = await import('../src/town/town-core.js');
const { sampleTown } = await import('../src/town/town-sample.js');
await loadTownCore();

let failed = 0;
function check(ok: boolean, what: string): void {
  if (!ok) {
    failed++;
    console.error(`FAIL ${what}`);
  }
}

const now = Date.now();
const s = sampleTown(now);
for (const d of s.dropped) console.error(`  dropped ${d}`);
check(s.dropped.length === 0, 'every planned piece is taken');
const book = new Book(s.events, s.earned);
check(book.refused.length === 0, `the sample replays with its own Folds (${book.refused.map((r) => r[1]).join(', ')})`);
const v = book.view(now);
check(v.lands.join() === 'plain,river,beach', `three pages (${v.lands.join()})`);
check(s.landmarks.length === v.lands.length, 'a landmark on each page');
check(v.items.every((i) => i.ready), 'every building finished');
check(v.balance === 35, `35 Folds spare (${v.balance})`);
for (const big of ['school', 'office_tower', 'stadium', 'park_flower', 'shophouse']) check(v.items.some((i) => i.asset === big), `the sample shows a ${big}`);
book.free();
console.log(`${v.items.length} pieces on ${v.lands.length} pages, ${v.value} Folds of buildings${failed ? `, ${failed} failed` : ', all passed'}`);
process.exit(failed ? 1 : 0);
