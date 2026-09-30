import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

import { INK, PAPER } from './palette.js';

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
}

const PX_PER_M = 1400;
/** Shadow room around a card, as a share of its height. */
const CARD_SHADOW_ROOM = 0.18;
/** A warm paper shadow rather than a grey one. */
const CARD_SHADOW = 'rgba(70, 50, 25, 0.32)';
/** A stacked fraction's card is this much taller, so each digit is as big as a whole number's. */
const FRACTION_TALL = 1.5;

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
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
  private opts: Required<LabelOptions>;

  constructor(text: string, opts: LabelOptions = {}) {
    this.opts = { height: 0.05, ink: INK, paper: PAPER, card: true, anchor: 'center', ...opts };
    this.canvas = document.createElement('canvas');
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, depthWrite: false });
    const plane = new PlaneGeometry(1, 1);
    if (this.opts.anchor !== 'center') plane.translate(0, this.opts.anchor === 'top' ? -0.5 : 0.5, 0);
    this.mesh = new Mesh(plane, material);
    this.mesh.renderOrder = 10;
    this.set(text);
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
    let w: number;
    if (fraction) {
      ctx.font = font(h * 0.42);
      w = Math.max(ctx.measureText(fraction[1]).width, ctx.measureText(fraction[2]).width) + h * 0.7;
    } else {
      ctx.font = font(h * 0.62);
      w = ctx.measureText(text).width + h * 0.6;
    }
    const width = Math.max(h, Math.ceil(w));
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
      // A plain cut of paper: square corners, no outline, lifted off the
      // scene by a soft warm shadow down and to the right, like the stickers.
      c.shadowColor = CARD_SHADOW;
      c.shadowBlur = h * 0.12;
      c.shadowOffsetX = h * 0.03;
      c.shadowOffsetY = h * 0.05;
      c.fillStyle = hex(this.opts.paper);
      c.fillRect(0, 0, width, h);
      c.shadowColor = 'transparent';
    }
    c.fillStyle = hex(this.opts.ink);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const cx = width / 2;
    if (fraction) {
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
    // The mesh covers the shadow room too, so the card stays `height` tall.
    this.mesh.scale.set(height * (this.canvas.width / h), height * (this.canvas.height / h), 1);
  }
}
