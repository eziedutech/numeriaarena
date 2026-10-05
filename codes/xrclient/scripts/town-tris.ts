// Counts the triangles of every Fold Town piece in each of its looks, checks
// it stays on its footprint, and fails when one is over its budget.
// Run: bun run scripts/town-tris.ts
import { PIECES, VARIANTS, scaffold } from '../src/art/town/pieces.ts';

const SLACK = 0.12; // overhangs and awnings may lean a little past the footprint
let bad = 0;

for (const [id, p] of Object.entries(PIECES)) {
  let most = 0;
  for (let look = 0; look < VARIANTS; look++) {
    const kit = p.build(look * 7919 + 1);
    most = Math.max(most, kit.triangles);
    const box = kit.geometry().boundingBox!;
    const off = box.min.x < -SLACK || box.min.z < -SLACK || box.max.x > p.w + SLACK || box.max.z > p.h + SLACK || box.min.y < -0.001;
    if (off) {
      bad++;
      console.log(`${id} look ${look} leaves its ${p.w}x${p.h} footprint: min ${box.min.toArray().map((v) => v.toFixed(2))} max ${box.max.toArray().map((v) => v.toFixed(2))}`);
    }
  }
  const over = most > p.budget;
  if (over) bad++;
  console.log(`${over ? 'OVER' : 'ok  '} ${id.padEnd(26)} ${String(most).padStart(4)} / ${p.budget}`);
}
for (const [w, h] of [
  [1, 1],
  [2, 1],
  [2, 2],
  [3, 2],
  [3, 3],
]) {
  const n = scaffold(w, h, 0.7).triangles;
  console.log(`${n > 300 ? 'OVER' : 'ok  '} scaffold ${w}x${h}`.padEnd(32) + `${String(n).padStart(4)} / 300`);
  if (n > 300) bad++;
}
if (bad) {
  console.log(`${bad} problem(s)`);
  process.exit(1);
}
