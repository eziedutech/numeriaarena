import type { BufferGeometry, Object3D } from '@iwsdk/core';
import { Kit, TOWN } from './kit.js';
import { roadCorner, roadCross, roadStraight } from './roads.js';
import { bench, fountain, hill, lamp, plot, sand, treePine, treeRound, water } from './nature.js';
import { houseBasic, houseCottage, houseHut, houseTwoStorey, shophouse } from './houses.js';
import { officeTower, parkFlower, school, stadium } from './civic.js';
import { clockTower, decimalMarket, fractionBridge, numberHall, timesTower } from './landmarks.js';

/**
 * Every piece Fold Town can draw, by the id the shop and the server use,
 * with its footprint in tiles and the triangles it may spend.
 */

export interface Piece {
  w: number;
  h: number;
  budget: number;
  build: (seed: number) => Kit;
}

const BUILDING = 300;
const SMALL = 60;

const piece = (w: number, h: number, budget: number, build: (seed: number) => Kit): Piece => ({ w, h, budget, build });

export const PIECES: Record<string, Piece> = {
  road_straight: piece(1, 1, SMALL, roadStraight),
  road_corner: piece(1, 1, SMALL, roadCorner),
  road_cross: piece(1, 1, SMALL, roadCross),
  tree_round: piece(1, 1, SMALL, treeRound),
  tree_pine: piece(1, 1, SMALL, treePine),
  bench: piece(1, 1, SMALL, bench),
  lamp: piece(1, 1, SMALL, lamp),
  fountain: piece(1, 1, SMALL, fountain),
  house_hut: piece(1, 1, BUILDING, houseHut),
  house_cottage: piece(1, 1, BUILDING, houseCottage),
  house_basic: piece(1, 1, BUILDING, houseBasic),
  house_two_storey: piece(2, 1, BUILDING, houseTwoStorey),
  park_flower: piece(2, 2, BUILDING, parkFlower),
  shophouse: piece(2, 1, BUILDING, shophouse),
  school: piece(3, 2, BUILDING, school),
  office_tower: piece(2, 2, BUILDING, officeTower),
  stadium: piece(3, 3, BUILDING, stadium),
  landmark_fraction_bridge: piece(1, 1, BUILDING, fractionBridge),
  landmark_times_tower: piece(1, 1, BUILDING, timesTower),
  landmark_number_hall: piece(1, 1, BUILDING, numberHall),
  landmark_decimal_market: piece(1, 1, BUILDING, decimalMarket),
  landmark_clock_tower: piece(1, 1, BUILDING, clockTower),
  land_water: piece(1, 1, SMALL, water),
  land_sand: piece(1, 1, SMALL, sand),
  land_hill: piece(1, 1, SMALL, hill),
  land_plot: piece(1, 1, SMALL, plot),
};

/** Looks a piece may take; a building's seed picks one, so a town shares few geometries. */
export const VARIANTS = 4;

const cache = new Map<string, BufferGeometry>();

/** The geometry of `id` for a seed, built once per look. */
export function pieceGeometry(id: string, seed: number): BufferGeometry {
  const look = (seed >>> 0) % VARIANTS;
  const key = `${id}#${look}`;
  let g = cache.get(key);
  if (!g) {
    const p = PIECES[id];
    if (!p) throw new Error(`unknown town piece ${id}`);
    g = p.build(look * 7919 + 1).geometry();
    cache.set(key, g);
  }
  return g;
}

/** Paper scaffolding over a footprint while a building is still going up. */
export function scaffold(w: number, h: number, height: number): Kit {
  const k = new Kit();
  const t = 0.03;
  const posts: [number, number][] = [];
  for (let x = 0; x <= w; x++) {
    posts.push([Math.min(Math.max(x, 0.12), w - 0.12), 0.12], [Math.min(Math.max(x, 0.12), w - 0.12), h - 0.12]);
  }
  for (const [x, z] of posts) k.box(x - t, 0, z - t, x + t, height, z + t, TOWN.paper, false);
  for (const z of [0.12, h - 0.12]) {
    for (const y of [height * 0.5, height]) k.box(0.12 - t, y - t, z - t, w - 0.12 + t, y + t, z + t, TOWN.sun);
  }
  for (const x of [0.12, w - 0.12]) k.box(x - t, height - t, 0.12, x + t, height + t, h - 0.12, TOWN.sun);
  return k;
}

const scaffolds = new Map<string, BufferGeometry>();

export function scaffoldGeometry(w: number, h: number, height = 0.7): BufferGeometry {
  const key = `${w}x${h}x${height}`;
  let g = scaffolds.get(key);
  if (!g) {
    g = scaffold(w, h, height).geometry();
    scaffolds.set(key, g);
  }
  return g;
}

/**
 * Folds a piece up off the page, `t` from 0 (flat) to 1 (standing). The
 * object's origin must sit on the back edge of its footprint, which is its
 * hinge; it rises with a small bounce at the end.
 */
export function foldUp(obj: Object3D, t: number): void {
  const u = Math.min(1, Math.max(0, t));
  const ease = 1 - Math.pow(1 - u, 3);
  const bounce = Math.sin(u * Math.PI) * 0.12 * u;
  obj.rotation.x = -(Math.PI / 2) * (1 - ease);
  obj.scale.y = Math.max(0.001, ease + bounce);
}
