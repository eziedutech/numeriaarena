/**
 * Packs the town models of the asset set into what the game loads.
 *
 *   bun scripts/town-pack.ts <asset set folder>
 *
 * The folder is a checkout of the asset set (models/, previews/ and
 * models/manifest.json). Every piece the shop sells (scripts/town-shop.ts)
 * and every landmark tier is read from its GLB, its nodes baked into one
 * mesh, its materials turned into palette colours on the vertices, its
 * vertices shared and its positions kept as 16-bit numbers. Out come:
 *
 *   public/town/<pack>.bin       the geometry of one pack of pieces
 *   public/town/pieces.json      where each piece is, its size, the palette
 *   public/town/thumbs/<id>.webp a small picture for the shop's shelf
 *   src/town/town-names.ts       every piece's name in English and Indonesian
 *   ../backrust/core/src/town_catalog.rs  the shop for the core's rules
 *
 * Windows on a building's front (+z) are counted from its glass panes, in
 * rows and columns, and its floors from those rows or its height.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { ALIASES, FLOORS, LANDMARKS, RESIZE, SHELVES, SHOP, type Group } from './town-shop.ts';

const SRC = resolve(process.argv[2] ?? '');
const ROOT = resolve(import.meta.dir, '..');
const OUT = join(ROOT, 'public', 'town');
/** Positions are kept in 1/Q of a tile. */
const Q = 8192;
const THUMB = 128;
/** No piece stands taller than this many tiles once scaled up. */
const MAX_TOP = 3;
/** A pad lies this far up, and the model on it this much higher. */
const PAD_Y = 0.002;
const LIFT = 0.004;

interface Entry {
  name: string;
  sheet: string;
  file: string;
  footprint: [number, number];
  bounds: { min: number[]; max: number[] };
}

const manifest = JSON.parse(readFileSync(join(SRC, 'models', 'manifest.json'), 'utf8')) as Entry[];
const byName = new Map(manifest.map((e) => [e.name, e]));

// ------------------------------------------------------------ GLB reading

interface Gltf {
  nodes: { name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; matrix?: number[] }[];
  scenes: { nodes: number[] }[];
  scene?: number;
  meshes: { primitives: { attributes: Record<string, number>; indices?: number; material?: number }[] }[];
  materials: { name: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[];
}

function readGlb(path: string): { json: Gltf; bin: Buffer } {
  const b = readFileSync(path);
  const jsonLen = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf;
  const at = 20 + jsonLen;
  const binLen = b.readUInt32LE(at);
  return { json, bin: b.subarray(at + 8, at + 8 + binLen) };
}

const SIZE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

function accessor(g: { json: Gltf; bin: Buffer }, i: number): number[] {
  const a = g.json.accessors[i];
  const v = g.json.bufferViews[a.bufferView];
  const n = SIZE[a.type];
  const bytes = a.componentType === 5126 || a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
  const stride = v.byteStride ?? n * bytes;
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const out: number[] = [];
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < n; c++) {
      const o = base + k * stride + c * bytes;
      const d = g.bin;
      out.push(
        a.componentType === 5126 ? d.readFloatLE(o) : a.componentType === 5125 ? d.readUInt32LE(o) : a.componentType === 5123 ? d.readUInt16LE(o) : d.readUInt8(o),
      );
    }
  }
  return out;
}

type M4 = number[];
const IDENTITY: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a: M4, b: M4): M4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function trs(n: Gltf['nodes'][number]): M4 {
  if (n.matrix) return n.matrix;
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

// ------------------------------------------------------------ palette

const palette: { name: string; rgb: number[] }[] = [];

function paletteIndex(name: string, rgb: number[]): number {
  let i = palette.findIndex((p) => p.name === name);
  if (i < 0) {
    i = palette.length;
    palette.push({ name, rgb: rgb.slice(0, 3).map((c) => Math.round(c * 1000) / 1000) });
  } else if (palette[i].rgb.some((c, k) => Math.abs(c - rgb[k]) > 0.002)) {
    throw new Error(`material ${name} has two colours`);
  }
  return i;
}

// ------------------------------------------------------------ one piece

interface Mesh {
  /** Triangles as corners: [x, y, z, colour] each. */
  tris: [number, number, number, number][];
  glass: number[][];
}

function bake(file: string): Mesh {
  const g = readGlb(join(SRC, 'models', file));
  const out: Mesh = { tris: [], glass: [] };
  const visit = (i: number, parent: M4) => {
    const n = g.json.nodes[i];
    const m = mul(parent, trs(n));
    if (n.mesh !== undefined) {
      for (const p of g.json.meshes[n.mesh].primitives) {
        const mat = g.json.materials[p.material ?? 0];
        const col = paletteIndex(mat.name, mat.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]);
        const pos = accessor(g, p.attributes.POSITION);
        const idx = p.indices !== undefined ? accessor(g, p.indices) : [...Array(pos.length / 3).keys()];
        for (const k of idx) {
          const [x, y, z] = [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
          const corner: [number, number, number, number] = [
            m[0] * x + m[4] * y + m[8] * z + m[12],
            m[1] * x + m[5] * y + m[9] * z + m[13],
            m[2] * x + m[6] * y + m[10] * z + m[14],
            col,
          ];
          out.tris.push(corner);
          if (mat.name === 'glass') out.glass.push(corner);
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  for (const r of g.json.scenes[g.json.scene ?? 0].nodes) visit(r, IDENTITY);
  return out;
}

/** Glass panes facing the front, as [rows, columns], and how many rows of panes there are at all. */
function windowsOf(glass: number[][]): { grid: [number, number]; rows: number } {
  const panes: { y: number; x: number; z: number }[] = [];
  const front: number[][][] = [];
  for (let i = 0; i < glass.length; i += 3) {
    const [a, b, c] = [glass[i], glass[i + 1], glass[i + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(n[0], n[1], n[2]);
    if (len > 1e-9 && n[2] / len > 0.9) front.push([a, b, c]);
  }
  // Triangles sharing a corner are one pane.
  const key = (p: number[]) => p.slice(0, 3).map((c) => Math.round(c * 1000)).join(',');
  const parent = front.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map<string, number>();
  front.forEach((t, i) => {
    for (const p of t) {
      const k = key(p);
      const j = seen.get(k);
      if (j === undefined) seen.set(k, i);
      else parent[find(i)] = find(j);
    }
  });
  const groups = new Map<number, number[][]>();
  front.forEach((t, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), ...t]));
  for (const pts of groups.values()) {
    const ys = pts.map((p) => p[1]);
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[2]);
    // The thin ends of panes in a side wall are not windows of the front.
    if (Math.max(...xs) - Math.min(...xs) < 0.035) continue;
    panes.push({ y: (Math.min(...ys) + Math.max(...ys)) / 2, x: (Math.min(...xs) + Math.max(...xs)) / 2, z: Math.max(...zs) });
  }
  // Only the front wall: panes on the back face in through a far wall.
  const face = Math.max(...panes.map((p) => p.z));
  panes.splice(0, panes.length, ...panes.filter((p) => p.z > face - 0.15));
  // Panes at the same place (both faces of a thin pane) count once.
  const uniq: { y: number; x: number }[] = [];
  for (const p of panes) if (!uniq.some((q) => Math.abs(q.x - p.x) < 0.02 && Math.abs(q.y - p.y) < 0.02)) uniq.push(p);
  if (!uniq.length) return { grid: [0, 0], rows: 0 };
  const rows: number[] = [];
  for (const p of [...uniq].sort((a, b) => a.y - b.y)) if (!rows.some((y) => Math.abs(y - p.y) < 0.05)) rows.push(p.y);
  const perRow = rows.map((y) => uniq.filter((p) => Math.abs(p.y - y) < 0.05).length);
  const cols = Math.max(...perRow);
  // Only an even grid makes a rows-times-columns question.
  return { grid: perRow.every((c) => c === cols) ? [rows.length, cols] : [0, 0], rows: rows.length };
}

interface Packed {
  positions: number[];
  colours: number[];
  indices: number[];
}

function share(m: Mesh): Packed {
  const out: Packed = { positions: [], colours: [], indices: [] };
  const at = new Map<string, number>();
  for (const [x, y, z, c] of m.tris) {
    const q = [x, y, z].map((v) => {
      const n = Math.round(v * Q);
      if (n < -32768 || n > 32767) throw new Error(`position ${v} out of range`);
      return n;
    });
    const k = `${q.join(',')},${c}`;
    let i = at.get(k);
    if (i === undefined) {
      i = out.colours.length;
      at.set(k, i);
      out.positions.push(...q);
      out.colours.push(c);
    }
    out.indices.push(i);
  }
  if (out.colours.length > 65535) throw new Error('too many vertices');
  return out;
}

// ------------------------------------------------------------ the packs

interface PieceInfo {
  id: string;
  pack: string;
  shelf: string;
  /** Offsets in the pack, in vertices and in indices. */
  v: [number, number];
  i: [number, number];
  /** Footprint in tiles, unturned. */
  w: number;
  h: number;
  /** Height in tiles. */
  top: number;
}

const shelfOf = new Map<string, string>();
for (const [shelf, sheets] of SHELVES) for (const s of sheets) shelfOf.set(s, shelf);

/** Which pack a piece goes in: small things together, buildings by shelf. */
function packOf(shelf: string): string {
  return ['roads', 'nature', 'street', 'life'].includes(shelf) ? 'ground' : shelf;
}

const packs = new Map<string, Packed>();
const pieces: PieceInfo[] = [];
const derived = new Map<string, { w: number; h: number; windows: [number, number]; floors: number }>();

/**
 * The model made to fill a footprint from RESIZE: scaled the same on every
 * side until it fits, never taller than MAX_TOP, centred, and with a pad of
 * ground under it where it leaves tiles bare.
 */
function resized(mesh: Mesh, e: Entry, [w, h, ground]: [number, number, string?]): { mesh: Mesh; top: number } {
  const [ow, oh] = e.footprint;
  const s = Math.min(w / ow, h / oh);
  const sy = Math.min(s, Math.max(1, MAX_TOP / e.bounds.max[1]));
  const lift = ground ? LIFT : 0;
  const tris: Mesh['tris'] = mesh.tris.map(([x, y, z, c]) => [x * s, y * sy + lift, z * s, c]);
  const bare = ow * s < w - 1e-6 || oh * s < h - 1e-6;
  if (bare) {
    if (!ground) throw new Error(`${e.name}: ${w}x${h} leaves tiles bare and needs a ground`);
    const c = palette.findIndex((p) => p.name === ground);
    if (c < 0) throw new Error(`${e.name}: no colour ${ground}`);
    const [x0, x1, z0, z1] = [-w / 2, w / 2, -h / 2, h / 2];
    // Two triangles facing up.
    tris.unshift([x0, PAD_Y, z0, c], [x0, PAD_Y, z1, c], [x1, PAD_Y, z1, c], [x0, PAD_Y, z0, c], [x1, PAD_Y, z1, c], [x1, PAD_Y, z0, c]);
  }
  return { mesh: { tris, glass: mesh.glass }, top: Math.round((e.bounds.max[1] * sy + lift) * 100) / 100 };
}

function add(id: string, model: string, shelf: string): Mesh {
  const e = byName.get(model);
  if (!e) throw new Error(`no model ${model} in the asset set`);
  const mesh = bake(e.file);
  const size = RESIZE[id];
  const made = size ? resized(mesh, e, size) : { mesh, top: Math.round(e.bounds.max[1] * 100) / 100 };
  const [w, h] = size ?? e.footprint;
  const p = share(made.mesh);
  const name = packOf(shelf);
  const pack = packs.get(name) ?? { positions: [], colours: [], indices: [] };
  packs.set(name, pack);
  const v0 = pack.colours.length;
  const i0 = pack.indices.length;
  pack.positions.push(...p.positions);
  pack.colours.push(...p.colours);
  pack.indices.push(...p.indices);
  pieces.push({ id, pack: name, shelf, v: [v0, p.colours.length], i: [i0, p.indices.length], w, h, top: made.top });
  return mesh;
}

const BUILDINGS: Group[] = ['small_house', 'medium_house', 'public', 'large'];

for (const [id, group] of SHOP) {
  const e = byName.get(id);
  if (!e) throw new Error(`${id} is not in the asset set`);
  const shelf = shelfOf.get(e.sheet);
  if (!shelf) throw new Error(`${id}: sheet ${e.sheet} has no shelf`);
  const mesh = add(id, id, shelf);
  let windows: [number, number] = [0, 0];
  let floors = 0;
  if (BUILDINGS.includes(group) && !['parks', 'sports', 'zoo'].includes(e.sheet)) {
    const w = windowsOf(mesh.glass);
    windows = w.grid;
    // A low building has a floor for each row of windows; a tower of one sheet of glass, one for each quarter tile.
    const top = e.bounds.max[1];
    floors = top < 0.95 ? Math.max(1, w.rows) : w.rows > 2 ? w.rows : Math.max(2, Math.round((top - 0.04) / 0.25));
    floors = FLOORS[id] ?? floors;
  }
  const [w, h] = RESIZE[id] ?? e.footprint;
  derived.set(id, { w, h, windows, floors });
}
const shopIds = new Set(SHOP.map((r) => r[0]));
const missed = manifest.filter((e) => shelfOf.has(e.sheet) && !shopIds.has(e.name)).map((e) => e.name);
if (missed.length) throw new Error(`not in the shop: ${missed.join(', ')}`);
const stray = Object.keys(RESIZE).filter((id) => !shopIds.has(id));
if (stray.length) throw new Error(`resized but not in the shop: ${stray.join(', ')}`);

for (const [landmark, model] of LANDMARKS) {
  for (const t of [1, 2, 3]) add(`${landmark}_t${t}`, `${model}_t${t}`, 'landmarks');
}

mkdirSync(join(OUT, 'thumbs'), { recursive: true });
const files: Record<string, { bytes: number; vertices: number; indices: number }> = {};
for (const [name, p] of packs) {
  // Positions (int16 x3), then indices (uint16), then colours (uint8), each section 4-byte aligned.
  const pad = (n: number) => (n + 3) & ~3;
  const posBytes = p.positions.length * 2;
  const idxBytes = p.indices.length * 2;
  const buf = Buffer.alloc(pad(posBytes) + pad(idxBytes) + pad(p.colours.length));
  p.positions.forEach((v, k) => buf.writeInt16LE(v, k * 2));
  p.indices.forEach((v, k) => buf.writeUInt16LE(v, pad(posBytes) + k * 2));
  p.colours.forEach((v, k) => buf.writeUInt8(v, pad(posBytes) + pad(idxBytes) + k));
  writeFileSync(join(OUT, `${name}.bin`), buf);
  files[name] = { bytes: buf.length, vertices: p.colours.length, indices: p.indices.length };
}
// A piece's indices count from its own first vertex.
writeFileSync(
  join(OUT, 'pieces.json'),
  `${JSON.stringify({ q: Q, palette: palette.map((p) => p.rgb), packs: files, pieces }, null, 0)}\n`,
);

// ------------------------------------------------------------ shelf pictures

for (const [id] of SHOP) {
  const e = byName.get(id)!;
  const png = join(SRC, 'previews', e.file.split('/')[0], `${id}.png`);
  const img = sharp(png);
  const { width = 512, height = 512 } = await img.metadata();
  const m = Math.round(Math.min(width, height) * 0.1);
  await img
    .extract({ left: m, top: m, width: width - 2 * m, height: height - 2 * m })
    .resize(THUMB, THUMB)
    .webp({ quality: 72, effort: 6 })
    .toFile(join(OUT, 'thumbs', `${id}.webp`));
}

// ------------------------------------------------------------ names and the core's shop

const q = (s: string) => `'${s.replace(/'/g, "\\'")}'`;
const names = (k: 4 | 5, l: 2 | 3) =>
  [...SHOP.map((r) => `  ${r[0]}: ${q(r[k])},`), ...LANDMARKS.map((r) => `  ${r[0]}: ${q(r[l])},`)].join('\n');
writeFileSync(
  join(ROOT, 'src', 'town', 'town-names.ts'),
  `// Written by scripts/town-pack.ts from scripts/town-shop.ts; edit those instead.

/** Every piece of the town by name, in English. */
export const NAMES_EN: Record<string, string> = {
${names(4, 2)}
};

/** Every piece of the town by name, in Indonesian. */
export const NAMES_ID: Record<string, string> = {
${names(5, 3)}
};

/** The shop's shelves in order, with their names. */
export const SHELF_NAMES: [shelf: string, en: string, id: string][] = [
${SHELVES.map(([s, , en, id]) => `  [${q(s)}, ${q(en)}, ${q(id)}],`).join('\n')}
];
`,
);

const RUST_GROUP: Record<Group, string> = {
  road: 'Road',
  nature: 'Nature',
  decor: 'Decor',
  small_house: 'SmallHouse',
  medium_house: 'MediumHouse',
  public: 'Public',
  large: 'Large',
};
const rows = SHOP.map(([id, group, price, unlock]) => {
  const d = derived.get(id)!;
  return `    asset("${id}", ${RUST_GROUP[group]}, ${price}, [${d.w}, ${d.h}], ${unlock}, [${d.windows[0]}, ${d.windows[1]}], ${d.floors}),`;
});
writeFileSync(
  join(ROOT, '..', 'backrust', 'core', 'src', 'town_catalog.rs'),
  `//! The shop of Fold Town. Written by codes/xrclient/scripts/town-pack.ts from
//! its shop table and the models' own sizes, windows and floors; edit those.

use crate::town::{Asset, Group::*, asset};

/// Everything the shop sells, in the order it is shown.
#[rustfmt::skip]
pub const CATALOG: [Asset; ${rows.length}] = [
${rows.join('\n')}
];

/// Ids the town once used, still read in old events.
pub const ALIASES: [(&str, &str); ${ALIASES.length}] = [
${ALIASES.map(([a, b]) => `    ("${a}", "${b}"),`).join('\n')}
];
`,
);

const total = Object.values(files).reduce((s, f) => s + f.bytes, 0);
console.log(`${pieces.length} pieces in ${packs.size} packs, ${(total / 1024).toFixed(0)} KB:`);
for (const [n, f] of Object.entries(files)) console.log(`  ${n}: ${(f.bytes / 1024).toFixed(0)} KB, ${f.vertices} vertices, ${f.indices / 3} triangles`);
console.log(`palette of ${palette.length}: ${palette.map((p) => p.name).join(' ')}`);
for (const [id, d] of derived) if (d.floors) console.log(`  ${id} ${d.w}x${d.h} windows ${d.windows.join('x')} floors ${d.floors}`);
