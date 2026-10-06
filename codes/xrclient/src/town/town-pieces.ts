import { BufferAttribute, BufferGeometry } from '@iwsdk/core';

/**
 * The town's models, packed by scripts/town-pack.ts: pieces.json says where
 * each piece is, and its geometry comes from one of a few packs, fetched only
 * when a piece of that pack is first drawn. Positions are 16-bit numbers in
 * 1/q of a tile, each vertex has a palette colour, and every piece shares the
 * one town material. A model stands centred on (0, 0, 0), its front to +z.
 */

export interface PieceInfo {
  id: string;
  pack: string;
  shelf: string;
  v: [number, number];
  i: [number, number];
  w: number;
  h: number;
  top: number;
}

interface Index {
  q: number;
  palette: [number, number, number][];
  packs: Record<string, { bytes: number; vertices: number; indices: number }>;
  pieces: PieceInfo[];
}

const BASE = import.meta.env.BASE_URL;

let index: Index | undefined;
let indexLoad: Promise<Index> | undefined;
const byId = new Map<string, PieceInfo>();
const packs = new Map<string, Promise<ArrayBuffer>>();
const loaded = new Map<string, ArrayBuffer>();
const geometries = new Map<string, BufferGeometry>();

/** Reads where every piece is; cheap, and needed before any piece is drawn. */
export function loadPieceIndex(): Promise<Index> {
  indexLoad ??= fetch(`${BASE}town/pieces.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`town pieces: ${r.status}`);
      return r.json() as Promise<Index>;
    })
    .then((ix) => {
      index = ix;
      for (const p of ix.pieces) byId.set(p.id, p);
      return ix;
    });
  return indexLoad;
}

export function pieceInfo(id: string): PieceInfo | undefined {
  return byId.get(id);
}

function fetchPack(name: string): Promise<ArrayBuffer> {
  let p = packs.get(name);
  if (!p) {
    p = fetch(`${BASE}town/${name}.bin`)
      .then((r) => {
        if (!r.ok) throw new Error(`town pack ${name}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => {
        loaded.set(name, b);
        return b;
      });
    // A failed fetch may be tried again later.
    p.catch(() => packs.delete(name));
    packs.set(name, p);
  }
  return p;
}

/** Fetches the packs these pieces are in, so they draw at once. */
export async function loadPieces(ids: Iterable<string>): Promise<void> {
  await loadPieceIndex();
  const names = new Set<string>();
  for (const id of ids) {
    const p = byId.get(id);
    if (p) names.add(p.pack);
  }
  await Promise.all([...names].map(fetchPack));
}

/** Fetches a whole shelf's pieces. */
export async function loadShelf(shelf: string): Promise<void> {
  const ix = await loadPieceIndex();
  await loadPieces(ix.pieces.filter((p) => p.shelf === shelf).map((p) => p.id));
}

const pad = (n: number) => (n + 3) & ~3;

/** The geometry of a piece if its pack is here, else undefined. */
export function pieceGeometry(id: string): BufferGeometry | undefined {
  const done = geometries.get(id);
  if (done) return done;
  const p = byId.get(id);
  const buf = p && loaded.get(p.pack);
  if (!index || !p || !buf) return undefined;
  const pack = index.packs[p.pack];
  const posAt = 0;
  const idxAt = pad(pack.vertices * 6);
  const colAt = idxAt + pad(pack.indices * 2);
  const [v0, vn] = p.v;
  const [i0, ni] = p.i;
  const raw = new Int16Array(buf, posAt + v0 * 6, vn * 3);
  const pos = new Float32Array(vn * 3);
  for (let k = 0; k < raw.length; k++) pos[k] = raw[k] / index.q;
  const pal = new Uint8Array(buf, colAt + v0, vn);
  const col = new Float32Array(vn * 3);
  for (let k = 0; k < vn; k++) {
    const c = index.palette[pal[k]];
    col[k * 3] = c[0];
    col[k * 3 + 1] = c[1];
    col[k * 3 + 2] = c[2];
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(new Uint16Array(buf.slice(idxAt + i0 * 2, idxAt + (i0 + ni) * 2)), 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  geometries.set(id, g);
  return g;
}

/** The geometry of a piece, fetching its pack first if need be. */
export async function pieceGeometryAsync(id: string): Promise<BufferGeometry | undefined> {
  await loadPieces([id]);
  return pieceGeometry(id);
}
