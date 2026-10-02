import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

import { drawGlyphs, glyphWidth, hasGlyphs, whenGlyphsLoad } from './glyphs.js';
import { INK } from './palette.js';

export interface LabelOptions {
  /** Height of the label in meters; width follows the text. */
  height?: number;
  ink?: number;
  paper?: number;
  /** Draw a paper card behind the text. */
  card?: boolean;
  /**
   * Which edge stays at the mesh's position when the card grows (a stacked
   * fraction is taller): a tag hanging under something keeps its top.
   */
  anchor?: 'center' | 'top' | 'bottom';
  /**
   * A question card: at least as wide as the asset set's short, medium or
   * long card (`card_question_*`), so questions sit on a few steady widths.
   */
  question?: boolean;
}

const PX_PER_M = 1400;
/** Solid paper (treatment K in the asset set): a touch whiter than the cream letters. */
const K_PAPER = 0xfffdf8;
/** Shadow room around a card, as a share of its height. */
const CARD_SHADOW_ROOM = 0.2;
/**
 * The K card's drop shadow, from `scripts/ui/paper.mjs` in the asset set:
 * the card's own shape moved 0.05 of its height right and down, blurred, and
 * fading in from the left edge over 1.57 heights, so the shadow gathers on
 * the right and along the bottom. Warm rather than grey, as dark as the
 * asset's black at 15%.
 */
const CARD_SHADOW = 'rgba(70, 50, 25, 0.2)';
const CARD_SHADOW_FADE = 1.57;
/** A faint lip along the top edge (black at 4%, nudged up 1% of the height). */
const CARD_LIP = 'rgba(0, 0, 0, 0.04)';
/** The asset set's question cards, face width over face height: short, medium, long. */
const QUESTION_WIDTHS = [480 / 122, 800 / 122, 1120 / 122];
/** Question text keeps this much paper on each side, in card heights. */
const QUESTION_PAD = 0.6;
/** A stacked fraction's card is this much taller, so each digit is as big as a whole number's. */
const FRACTION_TALL = 1.5;

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** Same text, same wobble: a cheap string hash seeds the edge. */
function rng(seed: string): () => number {
  let s = 0;
  for (const c of seed) s = (s * 31 + c.charCodeAt(0)) >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

/**
 * The outline of a cut of paper w by h: square corners, with the long edges
 * wandering half a pixel either way every ~0.18 heights (cut paper is never
 * perfectly straight). Scaled from the asset set's 0.5 px at 122 px.
 */
function cutEdge(w: number, h: number, seed: string): [number, number][] {
  const r = rng(seed);
  const amp = h * (0.5 / 122);
  const step = h * (22 / 122);
  const corners: [number, number][] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const out: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const l = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.round(l / step));
    const nx = -(by - ay) / l;
    const ny = (bx - ax) / l;
    out.push([ax, ay]);
    for (let j = 1; j < n; j++) {
      const t = j / n;
      const d = (r() * 2 - 1) * amp;
      out.push([ax + (bx - ax) * t + nx * d, ay + (by - ay) * t + ny * d]);
    }
  }
  return out;
}

function tracePath(c: CanvasRenderingContext2D, pts: [number, number][], dx = 0, dy = 0): void {
  c.beginPath();
  c.moveTo(pts[0][0] + dx, pts[0][1] + dy);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0] + dx, pts[i][1] + dy);
  c.closePath();
}

/** Scratch canvas for the shadow, which is faded on its own before it joins the card. */
let shadowCanvas: HTMLCanvasElement | undefined;

/** Draws a K card w by h at (0, 0): faded drop shadow, faint top lip, then the paper. */
export function drawCard(c: CanvasRenderingContext2D, w: number, h: number, m: number, paper: string, seed: string): void {
  const edge = cutEdge(w, h, seed);
  const sc = (shadowCanvas ??= document.createElement('canvas'));
  sc.width = c.canvas.width;
  sc.height = c.canvas.height;
  const s = sc.getContext('2d')!;
  s.clearRect(0, 0, sc.width, sc.height);
  s.translate(m, m);
  s.filter = `blur(${h * 0.057}px)`;
  s.fillStyle = CARD_SHADOW;
  tracePath(s, edge, h * 0.05, h * 0.05);
  s.fill();
  s.filter = 'none';
  // The shadow fades in from the card's left edge.
  const fade = s.createLinearGradient(0, 0, h * CARD_SHADOW_FADE, 0);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
  s.globalCompositeOperation = 'destination-in';
  s.fillStyle = fade;
  s.fillRect(-m, -m, sc.width, sc.height);
  s.globalCompositeOperation = 'source-over';
  c.drawImage(sc, -m, -m);
  c.save();
  c.filter = `blur(${h * 0.012}px)`;
  c.fillStyle = CARD_LIP;
  tracePath(c, edge, 0, -h * 0.01);
  c.fill();
  c.restore();
  c.fillStyle = paper;
  tracePath(c, edge);
  c.fill();
}

/**
 * A text card on a plane. Fractions like 3/8 are drawn stacked, the way
 * children read them. Numbers arrive already formatted by the Rust core.
 */
export class Label {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private text = '';
  /** How far the plane is shifted up (in plane units) for its anchor. */
  private shift = 0;
  private baseX = 1;
  private baseY = 1;
  private opts: Required<LabelOptions>;

  constructor(text: string, opts: LabelOptions = {}) {
    this.opts = { height: 0.05, ink: INK, paper: K_PAPER, card: true, anchor: 'center', question: false, ...opts };
    this.canvas = document.createElement('canvas');
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, depthWrite: false });
    // Shifted in `set` so an anchored edge is the paper's edge, not the
    // edge of the shadow room around it.
    const plane = new PlaneGeometry(1, 1);
    this.mesh = new Mesh(plane, material);
    this.mesh.renderOrder = 10;
    this.set(text);
    // Labels drawn before the paper letters loaded are drawn again with them.
    whenGlyphsLoad(() => {
      const t = this.text;
      this.text = '';
      this.set(t);
    });
  }

  get value(): string {
    return this.text;
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const fraction = /^(\d+)\/(\d+)$/u.exec(text);
    const height = this.opts.height * (fraction ? FRACTION_TALL : 1);
    const h = Math.round(height * PX_PER_M);
    const font = (px: number) => `700 ${px}px "Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif`;
    // Numbers and capital labels are cut from the paper letters; anything
    // with small letters (questions, units) keeps the font.
    const paperLetters = hasGlyphs(text);
    const glyphPx = (cap: number) => h * cap;
    let w: number;
    if (paperLetters && fraction) {
      w = Math.max(glyphWidth(fraction[1], glyphPx(0.34)), glyphWidth(fraction[2], glyphPx(0.34))) + h * 0.7;
    } else if (paperLetters) {
      w = glyphWidth(text, glyphPx(0.54)) + h * 0.6;
    } else if (fraction) {
      ctx.font = font(h * 0.42);
      w = Math.max(ctx.measureText(fraction[1]).width, ctx.measureText(fraction[2]).width) + h * 0.7;
    } else {
      ctx.font = font(h * 0.62);
      w = ctx.measureText(text).width + h * 0.6;
    }
    let width = Math.max(h, Math.ceil(w));
    if (this.opts.question) {
      // Generous paper either side, then the next of the three card widths.
      const need = (width - h * 0.6 + h * 2 * QUESTION_PAD) / h;
      width = Math.ceil(h * (QUESTION_WIDTHS.find((k) => k >= need) ?? need));
    }
    // Room around a card for its shadow, so the card itself keeps its size.
    const m = this.opts.card ? Math.round(h * CARD_SHADOW_ROOM) : 0;
    if (width + 2 * m !== this.canvas.width || h + 2 * m !== this.canvas.height) {
      this.canvas.width = width + 2 * m;
      this.canvas.height = h + 2 * m;
      // GPU texture storage is sized once; a resized canvas needs a new texture.
      const material = this.mesh?.material as MeshBasicMaterial | undefined;
      if (material) {
        this.texture.dispose();
        this.texture = new CanvasTexture(this.canvas);
        this.texture.colorSpace = SRGBColorSpace;
        material.map = this.texture;
        material.needsUpdate = true;
      }
    }
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.save();
    c.translate(m, m);
    if (this.opts.card) {
      // A plain cut of solid paper (K): square corners, no outline, lifted off
      // the scene by a soft warm shadow down and to the right.
      drawCard(c, width, h, m, hex(this.opts.paper), text);
    }
    c.fillStyle = hex(this.opts.ink);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const cx = width / 2;
    if (paperLetters && fraction) {
      const ink = hex(this.opts.ink);
      const px = glyphPx(0.34);
      drawGlyphs(c, fraction[1], cx - glyphWidth(fraction[1], px) / 2, h * 0.29 - px / 2, px, ink);
      drawGlyphs(c, fraction[2], cx - glyphWidth(fraction[2], px) / 2, h * 0.73 - px / 2, px, ink);
      c.fillRect(cx - width * 0.32, h * 0.49, width * 0.64, Math.max(2, h * 0.045));
    } else if (paperLetters) {
      const px = glyphPx(0.54);
      drawGlyphs(c, text, cx - glyphWidth(text, px) / 2, h * 0.5 - px / 2, px, hex(this.opts.ink));
    } else if (fraction) {
      c.font = font(h * 0.4);
      c.fillText(fraction[1], cx, h * 0.29);
      c.fillText(fraction[2], cx, h * 0.73);
      c.fillRect(cx - width * 0.32, h * 0.49, width * 0.64, Math.max(2, h * 0.045));
    } else {
      c.font = font(h * 0.6);
      c.fillText(text, cx, h * 0.54);
    }
    c.restore();
    this.texture.needsUpdate = true;
    // An anchored edge sits on the paper itself, so a string or a surface
    // meets the card, not the empty shadow room above or below it.
    const edge = m / this.canvas.height;
    const shift = this.opts.anchor === 'top' ? -0.5 + edge : this.opts.anchor === 'bottom' ? 0.5 - edge : 0;
    if (shift !== this.shift) {
      this.mesh.geometry.translate(0, shift - this.shift, 0);
      this.shift = shift;
    }
    // The mesh covers the shadow room too, so the card stays `height` tall.
    this.baseX = height * (this.canvas.width / h);
    this.baseY = height * (this.canvas.height / h);
    this.mesh.scale.set(this.baseX, this.baseY, 1);
  }

  /** Grows the card by `k` around its anchor (1 is its own size), for a gentle pulse. */
  pulse(k: number): void {
    this.mesh.scale.set(this.baseX * k, this.baseY * k, 1);
  }
}
