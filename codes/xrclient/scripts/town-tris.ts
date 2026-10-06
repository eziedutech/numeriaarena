// Counts the triangles of every packed Fold Town piece, checks it stays on
// its footprint, and fails when one is over its budget or a pack is too big.
// Run: bun run scripts/town-tris.ts

const dir = new URL('../public/town/', import.meta.url);
const index = (await Bun.file(new URL('pieces.json', dir)).json()) as {
  q: number;
  packs: Record<string, { bytes: number; vertices: number; indices: number }>;
  pieces: { id: string; pack: string; v: [number, number]; i: [number, number]; w: number; h: number; top: number }[];
};

const SLACK = 0.22; // porches, awnings, wheels and branches may lean a little past the footprint
const BUDGET = 4000; // triangles a piece may have
const PACK_BYTES = 600_000;
const pad = (n: number) => (n + 3) & ~3;
let bad = 0;
let total = 0;
const packs = new Map<string, ArrayBuffer>();

for (const p of index.pieces) {
  let buf = packs.get(p.pack);
  if (!buf) {
    buf = await Bun.file(new URL(`${p.pack}.bin`, dir)).arrayBuffer();
    packs.set(p.pack, buf);
  }
  const tris = p.i[1] / 3;
  total += tris;
  const pos = new Int16Array(buf, p.v[0] * 6, p.v[1] * 3);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < pos.length; k += 3) {
    const x = pos[k] / index.q, y = pos[k + 1] / index.q, z = pos[k + 2] / index.q;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const off = minX < -p.w / 2 - SLACK || maxX > p.w / 2 + SLACK || minZ < -p.h / 2 - SLACK || maxZ > p.h / 2 + SLACK || minY < -0.1; // roots and kerbs may sink a little under the grass
  const idx = new Uint16Array(buf, pad(index.packs[p.pack].vertices * 6) + p.i[0] * 2, p.i[1]);
  const outOfRange = idx.some((n) => n >= p.v[1]);
  if (tris > BUDGET || off || outOfRange) {
    bad++;
    console.error(`${p.id}: ${tris} triangles${off ? `, off its footprint (x ${minX.toFixed(2)}..${maxX.toFixed(2)}, z ${minZ.toFixed(2)}..${maxZ.toFixed(2)}, y ${minY.toFixed(2)})` : ''}${outOfRange ? ', an index past its vertices' : ''}`);
  }
}
for (const [name, info] of Object.entries(index.packs)) {
  if (info.bytes > PACK_BYTES) {
    bad++;
    console.error(`pack ${name}: ${info.bytes} bytes`);
  }
}
const bytes = Object.values(index.packs).reduce((n, p) => n + p.bytes, 0);
console.log(`${index.pieces.length} pieces, ${total} triangles, ${Object.keys(index.packs).length} packs of ${(bytes / 1e6).toFixed(2)} MB${bad ? `, ${bad} over` : ', all within budget'}`);
process.exit(bad ? 1 : 0);
