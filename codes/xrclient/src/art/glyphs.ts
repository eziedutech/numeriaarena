/**
 * Paper letters from the asset set's glyph atlas (style K: flat ink cut from
 * paper), for numbers and short capital labels drawn into a canvas. The
 * atlas has capitals, digits and math signs only; text with anything else
 * is left to the font.
 */

interface Glyph {
  cell: [number, number, number, number];
  origin: [number, number];
  advance: number;
}

interface Atlas {
  height: number;
  tabular_advance: number;
  space_advance: number;
  aliases: Record<string, string>;
  glyphs: Record<string, Glyph>;
  kerning: Record<string, number>;
}

const BASE = import.meta.env.BASE_URL;
let atlas: Atlas | undefined;
let sheet: HTMLImageElement | undefined;
const waiting = new Set<() => void>();
/** The atlas recoloured once per ink, so every label of that ink shares it. */
const inked = new Map<string, HTMLCanvasElement>();

void (async () => {
  try {
    const json = (await (await fetch(`${BASE}ui2d/font/paper_glyphs.json`)).json()) as Atlas;
    const image = new Image();
    image.src = `${BASE}ui2d/font/paper_glyphs_K.webp`;
    await image.decode();
    atlas = json;
    sheet = image;
    for (const redraw of waiting) redraw();
    waiting.clear();
  } catch (error) {
    console.error('[art] paper glyphs did not load; labels keep the font', error);
  }
})();

/** Runs `redraw` once the atlas has loaded (labels drawn before then use the font). */
export function whenGlyphsLoad(redraw: () => void): void {
  if (!atlas) waiting.add(redraw);
}

const key = (ch: string) => atlas?.aliases[ch] ?? (ch === '-' ? '−' : ch);

/** True when every character of `text` is in the atlas (spaces allowed). */
export function hasGlyphs(text: string): boolean {
  if (!atlas || text.trim() === '') return false;
  for (const ch of text) if (ch !== ' ' && !atlas.glyphs[key(ch)]) return false;
  return true;
}

/** Width of `text` set `px` tall (capital height plus the atlas's top room). */
export function glyphWidth(text: string, px: number): number {
  if (!atlas) return 0;
  const s = px / atlas.height;
  let w = 0;
  let prev = '';
  for (const raw of text) {
    if (raw === ' ') {
      w += atlas.space_advance * s;
      prev = '';
      continue;
    }
    const ch = key(raw);
    const g = atlas.glyphs[ch];
    // Digits take the same width, so a running clock or score never wobbles.
    w += (/\d/u.test(ch) ? atlas.tabular_advance : g.advance) * s + (atlas.kerning[prev + ch] ?? 0) * s;
    prev = ch;
  }
  return w;
}

function inkedSheet(ink: string): HTMLCanvasElement {
  let c = inked.get(ink);
  if (!c) {
    c = document.createElement('canvas');
    c.width = sheet!.width;
    c.height = sheet!.height;
    const x = c.getContext('2d')!;
    x.drawImage(sheet!, 0, 0);
    // Each pixel keeps its shade relative to the atlas ink (#3A3F4B), so the
    // letters' folded facets stay light and dark in the new ink.
    const data = x.getImageData(0, 0, c.width, c.height);
    const n = parseInt(ink.slice(1), 16);
    const ratio = [((n >> 16) & 255) / 0x3a, ((n >> 8) & 255) / 0x3f, (n & 255) / 0x4b];
    for (let i = 0; i < data.data.length; i += 4) {
      for (let k = 0; k < 3; k += 1) data.data[i + k] = Math.min(255, data.data[i + k] * ratio[k]);
    }
    x.putImageData(data, 0, 0);
    inked.set(ink, c);
  }
  return c;
}

/**
 * Draws `text` with its left edge at `x` and its letters' top at `top`,
 * `px` tall, in `ink` (a CSS colour).
 */
export function drawGlyphs(c: CanvasRenderingContext2D, text: string, x: number, top: number, px: number, ink: string): void {
  if (!atlas || !sheet) return;
  // Flat ink #3A3F4B is the atlas's own colour; other inks are recoloured once.
  const src = ink.toLowerCase() === '#3a3f4b' ? sheet : inkedSheet(ink);
  const s = px / atlas.height;
  let pen = x;
  let prev = '';
  for (const raw of text) {
    if (raw === ' ') {
      pen += atlas.space_advance * s;
      prev = '';
      continue;
    }
    const ch = key(raw);
    const g = atlas.glyphs[ch];
    pen += (atlas.kerning[prev + ch] ?? 0) * s;
    const [cx, cy, cw, ch2] = g.cell;
    const tab = /\d/u.test(ch) ? (atlas.tabular_advance - g.advance) / 2 : 0;
    c.drawImage(src, cx, cy, cw, ch2, pen + (tab - g.origin[0]) * s, top - g.origin[1] * s, cw * s, ch2 * s);
    pen += (tab ? atlas.tabular_advance : g.advance) * s;
    prev = ch;
  }
}
