import { drawGlyphs, glyphWidth, whenGlyphsLoad } from '../art/glyphs.js';

/** Small helpers for the flat paper pages: the home page and the smartboard race. */

/**
 * A canvas of capital text in the paper letters, `px` tall, in `ink`; with
 * `maxWidth`, set smaller when it would be wider than that.
 */
export function paperText(text: string, size: number, ink: string, maxWidth?: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const draw = () => {
    const dpr = 2;
    const full = glyphWidth(text, size) + size * 0.25;
    const px = maxWidth && full > maxWidth ? (size * maxWidth) / full : size;
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

const TIP_CSS = `
.paper-tip { position: fixed; z-index: 1000; pointer-events: none; transform: translate(-50%, 0); max-width: 320px;
  background: #3a3f4b; color: #fff8ec; font: 700 14px/1.3 'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif;
  letter-spacing: 0.02em; padding: 7px 11px; box-shadow: 3px 5px 10px rgba(70, 50, 25, 0.3); opacity: 0;
  transition: opacity 0.12s; }
.paper-tip.on { opacity: 1; }
.paper-tip::before { content: ''; position: absolute; left: 50%; top: -6px; margin-left: -6px;
  border: 6px solid transparent; border-top: 0; border-bottom-color: #3a3f4b; }
`;

/**
 * Paper tooltips for everything under `root` with a `data-tip`, shown on
 * mouse hover and keyboard focus in place of the browser's own title box.
 */
export function hoverTips(root: HTMLElement): void {
  let tip = document.querySelector<HTMLDivElement>('.paper-tip');
  if (!tip) {
    const style = document.createElement('style');
    style.textContent = TIP_CSS;
    document.head.appendChild(style);
    tip = el('div', 'paper-tip', document.body);
    tip.setAttribute('aria-hidden', 'true');
  }
  const box = tip;
  const show = (target: HTMLElement) => {
    box.textContent = target.dataset.tip ?? '';
    const r = target.getBoundingClientRect();
    box.style.left = `${Math.min(Math.max(r.left + r.width / 2, 170), window.innerWidth - 170)}px`;
    box.style.top = `${r.bottom + 10}px`;
    box.classList.add('on');
  };
  const hide = () => box.classList.remove('on');
  const find = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
  root.addEventListener('pointerover', (e) => {
    const t = find(e);
    if (t && e.pointerType !== 'touch') show(t);
  });
  root.addEventListener('pointerout', (e) => {
    const t = find(e);
    if (t && !t.contains(e.relatedTarget as Node | null)) hide();
  });
  root.addEventListener('focusin', (e) => {
    const t = find(e);
    if (t?.matches(':focus-visible')) show(t);
  });
  root.addEventListener('focusout', hide);
  root.addEventListener('pointerdown', hide);
}

/** Sets the paper tooltip of `target` (and its name for screen readers). */
export function tipOn(target: HTMLElement, text: string): void {
  target.dataset.tip = text;
  if (!target.getAttribute('aria-label')) target.setAttribute('aria-label', text);
}
