import type { Lang } from '../settings.js';

/**
 * The mathematics of a building: the facts on its card once it is finished,
 * and the one question of FINISH NOW while it is still a paper frame, both
 * pitched at the player's grade. One tile is 3 m a side and one floor 3 m
 * high, so the same building gives tiles and windows in grade 4, metres and
 * square metres in grade 5, cubic metres and percentages in grade 6.
 */

export const TILE_M = 3;
export const GRADES = [4, 5, 6] as const;
export type Grade = (typeof GRADES)[number];

export interface Shape {
  /** Footprint in tiles as it stands, turned. */
  w: number;
  h: number;
  /** Windows on the front as rows x columns; 0 x 0 when none. */
  windows: [number, number];
  floors: number;
}

/** The page the building stands on: tiles that can be built and tiles built. */
export interface Page {
  free: number;
  used: number;
}

export interface Question {
  kind: QuestionKind;
  prompt: string;
  /** Three different numbers, as shown, in the order shown. */
  choices: string[];
  right: number;
  /** How to work it out, for after a wrong answer. */
  hint: string;
}

export type QuestionKind = 'windows' | 'tiles' | 'sides' | 'area' | 'perimeter' | 'cubes' | 'volume';

const EN = {
  footprint: (w: number, h: number) => `It stands on ${w} by ${h} tiles. Each tile is ${TILE_M} m by ${TILE_M} m.`,
  windows: (r: number, c: number) => `${r} ${r === 1 ? 'row' : 'rows'} of ${c} windows: ${r} × ${c} = ${r * c} windows.`,
  tiles: (w: number, h: number) => `It covers ${w} × ${h} = ${w * h} tiles.`,
  sides: (w: number, h: number) => `All the way around: ${w} + ${h} + ${w} + ${h} = ${2 * (w + h)} tile sides.`,
  area: (a: number, b: number) => `Floor area: ${a} m × ${b} m = ${a * b} m².`,
  perimeter: (a: number, b: number) => `Perimeter: ${a} + ${b} + ${a} + ${b} = ${2 * (a + b)} m.`,
  cubes: (w: number, h: number, f: number) => `${w} × ${h} tiles, ${f} floor${f === 1 ? '' : 's'} high: ${w * h * f} tile cubes.`,
  volume: (a: number, b: number, c: number) => `Volume: ${a} m × ${b} m × ${c} m = ${a * b * c} m³.`,
  pageFraction: (used: number, free: number) => `This land is ${used}/${free} built.`,
  pagePercent: (used: number, free: number, d: string, p: number) => `This land is ${used} of ${free} tiles built: ${d}, about ${p}%.`,
  ask: {
    windows: (r: number, c: number) => `The front has ${r} ${r === 1 ? 'row' : 'rows'} of ${c} windows. How many windows?`,
    tiles: (w: number, h: number) => `It stands on ${w} by ${h} tiles. How many tiles does it cover?`,
    sides: (w: number, h: number) => `It stands on ${w} by ${h} tiles. How many tile sides go all the way around it?`,
    area: (a: number, b: number) => `Its floor is ${a} m by ${b} m. What is its area in m²?`,
    perimeter: (a: number, b: number) => `Its floor is ${a} m by ${b} m. What is its perimeter in m?`,
    cubes: (w: number, h: number, f: number) => `It stands on ${w} by ${h} tiles and is ${f} floor${f === 1 ? '' : 's'} high. How many tile cubes fill it?`,
    volume: (a: number, b: number, c: number) => `It is ${a} m long, ${b} m wide and ${c} m high. What is its volume in m³?`,
  } as Record<QuestionKind, (a: number, b: number, c: number) => string>,
  hint: {
    windows: 'Rows times columns: count one row, then multiply by the number of rows.',
    tiles: 'Area counts the tiles inside: length times width.',
    sides: 'The perimeter goes all the way around: add all four sides.',
    area: 'Area is length times width, in square metres.',
    perimeter: 'The perimeter goes all the way around: add all four sides.',
    cubes: 'Count the tiles of one floor, then multiply by the floors.',
    volume: 'Volume is length times width times height, in cubic metres.',
  } as Record<QuestionKind, string>,
};

const ID: typeof EN = {
  footprint: (w, h) => `Berdiri di atas ${w} kali ${h} petak. Satu petak ${TILE_M} m kali ${TILE_M} m.`,
  windows: (r, c) => `${r} baris berisi ${c} jendela: ${r} × ${c} = ${r * c} jendela.`,
  tiles: (w, h) => `Menutupi ${w} × ${h} = ${w * h} petak.`,
  sides: (w, h) => `Keliling: ${w} + ${h} + ${w} + ${h} = ${2 * (w + h)} sisi petak.`,
  area: (a, b) => `Luas lantai: ${a} m × ${b} m = ${a * b} m².`,
  perimeter: (a, b) => `Keliling: ${a} + ${b} + ${a} + ${b} = ${2 * (a + b)} m.`,
  cubes: (w, h, f) => `${w} × ${h} petak, setinggi ${f} lantai: ${w * h * f} kubus petak.`,
  volume: (a, b, c) => `Volume: ${a} m × ${b} m × ${c} m = ${a * b * c} m³.`,
  pageFraction: (used, free) => `Lahan ini sudah terbangun ${used}/${free}.`,
  pagePercent: (used, free, d, p) => `Lahan ini sudah terbangun ${used} dari ${free} petak: ${d}, kira-kira ${p}%.`,
  ask: {
    windows: (r, c) => `Bagian depannya punya ${r} baris berisi ${c} jendela. Berapa jendelanya?`,
    tiles: (w, h) => `Bangunan ini berdiri di atas ${w} kali ${h} petak. Berapa petak yang ditutupinya?`,
    sides: (w, h) => `Bangunan ini berdiri di atas ${w} kali ${h} petak. Berapa sisi petak kelilingnya?`,
    area: (a, b) => `Lantainya ${a} m kali ${b} m. Berapa luasnya dalam m²?`,
    perimeter: (a, b) => `Lantainya ${a} m kali ${b} m. Berapa kelilingnya dalam m?`,
    cubes: (w, h, f) => `Bangunan ini berdiri di atas ${w} kali ${h} petak dan setinggi ${f} lantai. Berapa kubus petak yang mengisinya?`,
    volume: (a, b, c) => `Panjangnya ${a} m, lebarnya ${b} m, dan tingginya ${c} m. Berapa volumenya dalam m³?`,
  },
  hint: {
    windows: 'Baris kali kolom: hitung satu baris, lalu kalikan dengan banyak barisnya.',
    tiles: 'Luas menghitung petak di dalamnya: panjang kali lebar.',
    sides: 'Keliling mengitari semuanya: jumlahkan keempat sisinya.',
    area: 'Luas adalah panjang kali lebar, dalam meter persegi.',
    perimeter: 'Keliling mengitari semuanya: jumlahkan keempat sisinya.',
    cubes: 'Hitung petak satu lantai, lalu kalikan dengan banyak lantainya.',
    volume: 'Volume adalah panjang kali lebar kali tinggi, dalam meter kubik.',
  },
};

const WORDS: Record<Lang, typeof EN> = { en: EN, id: ID };

function decimal(n: number, lang: Lang): string {
  const s = n.toFixed(2);
  return lang === 'id' ? s.replace('.', ',') : s;
}

/** The facts on a finished building's card, simplest first. */
export function factsOf(s: Shape, page: Page, grade: Grade, lang: Lang): string[] {
  const t = WORDS[lang];
  const [r, c] = s.windows;
  const a = s.w * TILE_M;
  const b = s.h * TILE_M;
  const out = [t.footprint(s.w, s.h)];
  if (grade === 4) {
    if (r * c) out.push(t.windows(r, c));
    out.push(t.tiles(s.w, s.h), t.sides(s.w, s.h));
  } else if (grade === 5) {
    out.push(t.area(a, b), t.perimeter(a, b));
    if (s.floors) out.push(t.cubes(s.w, s.h, s.floors));
  } else {
    out.push(t.area(a, b));
    if (s.floors) out.push(t.volume(a, b, s.floors * TILE_M));
  }
  if (page.free > 0 && grade === 5) out.push(t.pageFraction(page.used, page.free));
  if (page.free > 0 && grade === 6) {
    const f = page.used / page.free;
    out.push(t.pagePercent(page.used, page.free, decimal(f, lang), Math.round(f * 100)));
  }
  return out;
}

/** The kinds of question a building can be asked, for a grade. */
export function questionKinds(s: Shape, grade: Grade): QuestionKind[] {
  const [r, c] = s.windows;
  if (grade === 4) return [...(r * c > 1 ? (['windows'] as const) : []), 'sides', ...(s.w * s.h > 1 ? (['tiles'] as const) : [])];
  if (grade === 5) return ['area', 'perimeter', ...(s.floors ? (['cubes'] as const) : [])];
  return [...(s.floors ? (['volume'] as const) : []), 'area', 'perimeter'];
}

/**
 * Question number `attempt` for a building: each attempt takes the next kind
 * the building has, so a second try is not the same sum. The lures are the
 * usual slips, mixing up area and perimeter or adding where it multiplies.
 */
export function finishQuestion(s: Shape, grade: Grade, attempt: number, lang: Lang): Question {
  const t = WORDS[lang];
  const kinds = questionKinds(s, grade);
  const kind = kinds[((attempt % kinds.length) + kinds.length) % kinds.length];
  const [r, c] = s.windows;
  const a = s.w * TILE_M;
  const b = s.h * TILE_M;
  const hgt = s.floors * TILE_M;
  let right: number;
  let slips: number[];
  let prompt: string;
  switch (kind) {
    case 'windows':
      right = r * c;
      slips = [r + c, r * c + c, r * c - r];
      prompt = t.ask.windows(r, c, 0);
      break;
    case 'tiles':
      right = s.w * s.h;
      slips = [2 * (s.w + s.h), s.w + s.h, s.w * s.h + 1];
      prompt = t.ask.tiles(s.w, s.h, 0);
      break;
    case 'sides':
      right = 2 * (s.w + s.h);
      slips = [s.w + s.h, s.w * s.h, 2 * (s.w + s.h) + 2];
      prompt = t.ask.sides(s.w, s.h, 0);
      break;
    case 'area':
      right = a * b;
      slips = [2 * (a + b), a + b, a * b + a];
      prompt = t.ask.area(a, b, 0);
      break;
    case 'perimeter':
      right = 2 * (a + b);
      slips = [a * b, a + b, 2 * (a + b) + TILE_M];
      prompt = t.ask.perimeter(a, b, 0);
      break;
    case 'cubes':
      right = s.w * s.h * s.floors;
      slips = [s.w * s.h + s.floors, s.w * s.h, s.w * s.h * s.floors + s.floors];
      prompt = t.ask.cubes(s.w, s.h, s.floors);
      break;
    case 'volume':
      right = a * b * hgt;
      slips = [a * b, a * b * s.floors, a + b + hgt];
      prompt = t.ask.volume(a, b, hgt);
      break;
  }
  const lures: number[] = [];
  for (const n of [...slips, right + 1, right + 2, right - 1, right + 3]) {
    if (n > 0 && n !== right && !lures.includes(n)) lures.push(n);
    if (lures.length === 2) break;
  }
  const numbers = [right, ...lures];
  // Where the right one sits turns with the attempt, so it is not always first.
  const at = (attempt * 2 + s.w + s.h) % 3;
  [numbers[0], numbers[at]] = [numbers[at], numbers[0]];
  return { kind, prompt, choices: numbers.map(String), right: at, hint: t.hint[kind] };
}
