import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

import { INK, PAPER } from './palette.js';

export interface LabelOptions {
  /** Height of the label in meters; width follows the text. */
  height?: number;
  ink?: number;
  paper?: number;
  /** Draw a paper card behind the text. */
  card?: boolean;
}

const PX_PER_M = 1400;

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
    this.opts = { height: 0.05, ink: INK, paper: PAPER, card: true, ...opts };
    this.canvas = document.createElement('canvas');
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), material);
    this.mesh.renderOrder = 10;
    this.set(text);
  }

  get value(): string {
    return this.text;
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const h = Math.round(this.opts.height * PX_PER_M);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const fraction = /^(\d+)\/(\d+)$/u.exec(text);
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
    if (width !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = width;
      this.canvas.height = h;
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
    c.clearRect(0, 0, this.canvas.width, h);
    if (this.opts.card) {
      const r = h * 0.22;
      c.fillStyle = hex(this.opts.paper);
      c.beginPath();
      c.roundRect(2, 2, this.canvas.width - 4, h - 4, r);
      c.fill();
      c.lineWidth = Math.max(2, h * 0.04);
      c.strokeStyle = hex(this.opts.ink);
      c.stroke();
    }
    c.fillStyle = hex(this.opts.ink);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const cx = this.canvas.width / 2;
    if (fraction) {
      c.font = font(h * 0.4);
      c.fillText(fraction[1], cx, h * 0.29);
      c.fillText(fraction[2], cx, h * 0.73);
      c.fillRect(cx - (this.canvas.width * 0.32), h * 0.49, this.canvas.width * 0.64, Math.max(2, h * 0.045));
    } else {
      c.font = font(h * 0.6);
      c.fillText(text, cx, h * 0.54);
    }
    this.texture.needsUpdate = true;
    this.mesh.scale.set(this.opts.height * (this.canvas.width / h), this.opts.height, 1);
  }
}
