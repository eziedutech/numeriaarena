import { Color, DoubleSide, FrontSide, MeshStandardMaterial } from '@iwsdk/core';

/**
 * Colours follow the origami asset set's palette (its `ROLES`), so procedural
 * props and the imported models read as one set of paper.
 */
export const PAPER = 0xfff8ec;
export const PAPER_SHADE = 0xf6e3c0; // `cream`, the back of the paper
export const INK = 0x3a3f4b;
export const CORRECT = 0x5db85b;
export const TRY_AGAIN = 0xf8961e;
export const GOLD = 0xe8b64c;

export type Mission = 'place_value' | 'multiply_divide' | 'fractions' | 'decimals' | 'measurement';

export const ACCENTS: Record<Mission, number> = {
  place_value: 0xf2716b, // coral
  multiply_divide: 0x3469c4, // cobalt
  fractions: 0x3fb6a0, // teal
  decimals: 0xf9c74f, // sunflower
  measurement: 0xb198ea, // violet
};

/** The side of a fold facing away from the light: about 11% darker and a touch warmer. */
export function shade(color: number): number {
  const r = Math.round(((color >> 16) & 255) * 0.91);
  const g = Math.round(((color >> 8) & 255) * 0.89);
  const b = Math.round((color & 255) * 0.86);
  return (r << 16) | (g << 8) | b;
}

/** Mixes a colour towards white by `k` (0 to 1), for paper catching the light. */
export function tint(color: number, k: number): number {
  const mix = (v: number) => Math.round(v + (255 - v) * k);
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}

const cache = new Map<string, MeshStandardMaterial>();

/** Flat-shaded paper material, shared per colour so meshes stay cheap. */
export function paper(color: number, opts: { doubleSide?: boolean; emissive?: number } = {}): MeshStandardMaterial {
  const key = `${color}:${opts.doubleSide ? 1 : 0}:${opts.emissive ?? 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color),
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      side: opts.doubleSide ? DoubleSide : FrontSide,
      emissive: new Color(opts.emissive ?? 0x000000),
    });
    cache.set(key, m);
  }
  return m;
}

/** Mission for a skill code such as FR.ADD.LIKE. */
export function missionForSkill(skill: string): Mission {
  if (skill.startsWith('PV')) return 'place_value';
  if (skill.startsWith('MD')) return 'multiply_divide';
  if (skill.startsWith('FR')) return 'fractions';
  if (skill.startsWith('DC')) return 'decimals';
  return 'measurement';
}

/** Colour for a skill code such as FR.ADD.LIKE. */
export function accentForSkill(skill: string): number {
  return ACCENTS[missionForSkill(skill)];
}
