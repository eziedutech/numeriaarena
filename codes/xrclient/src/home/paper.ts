import { drawGlyphs, glyphWidth, whenGlyphsLoad } from '../art/glyphs.js';

/** Small helpers for the flat paper pages: the home page and the smartboard race. */

/** A canvas of capital text in the paper letters, `px` tall, in `ink`. */
export function paperText(text: string, px: number, ink: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const draw = () => {
    const dpr = 2;
    const w = Math.max(1, Math.ceil(glyphWidth(text, px) + px * 0.25));
    const h = Math.ceil(px * 1.25);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const c = canvas.getContext('2d')!;
    c.scale(dpr, dpr);
    drawGlyphs(c, text, 0, px * 0.12, px, ink);
  };
  draw();
  whenGlyphsLoad(draw);
  return canvas;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}
