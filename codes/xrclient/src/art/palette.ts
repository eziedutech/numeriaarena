import { Color, DoubleSide, FrontSide, MeshStandardMaterial } from '@iwsdk/core';

/** Paper cream and ink navy, plus one accent per mission. */
export const PAPER = 0xf4ecd8;
export const PAPER_SHADE = 0xe2d5b8;
export const INK = 0x1f2a44;

export const ACCENTS = {
  place_value: 0xe07a5f,
  multiply_divide: 0x3d8fb8,
  fractions: 0x81b29a,
  decimals: 0xf2cc8f,
  measurement: 0x9b7bb8,
} as const;

const cache = new Map<string, MeshStandardMaterial>();

/** Flat-shaded paper material, shared per colour so meshes stay cheap. */
export function paper(color: number, opts: { doubleSide?: boolean; emissive?: number } = {}): MeshStandardMaterial {
  const key = `${color}:${opts.doubleSide ? 1 : 0}:${opts.emissive ?? 0}`;
  let m = cache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({
      color: new Color(color),
      roughness: 0.92,
      metalness: 0,
      flatShading: true,
      side: opts.doubleSide ? DoubleSide : FrontSide,
      emissive: new Color(opts.emissive ?? 0x000000),
    });
    cache.set(key, m);
  }
  return m;
}

/** Colour for a skill code such as FR.ADD.LIKE. */
export function accentForSkill(skill: string): number {
  if (skill.startsWith('PV')) return ACCENTS.place_value;
  if (skill.startsWith('MD')) return ACCENTS.multiply_divide;
  if (skill.startsWith('FR')) return ACCENTS.fractions;
  if (skill.startsWith('DC')) return ACCENTS.decimals;
  return ACCENTS.measurement;
}
