import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/**
 * Flat toolbar buttons for the headset, drawn as a web app's are: a rounded
 * tile with a line icon and its word under it, on a white rounded tray.
 * The icons are Google's Material Icons paths (Apache 2.0), on a 24 unit grid.
 */
const ICONS = {
  zoomIn:
    'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zm2.5-4h-2v2H9v-2H7V9h2V7h1v2h2v1z',
  zoomOut:
    'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z',
  pan: 'M23 5.5V20c0 2.2-1.8 4-4 4h-7.3c-1.08 0-2.1-.43-2.85-1.19L1 14.83s1.26-1.23 1.3-1.25c.22-.19.49-.29.79-.29.22 0 .42.06.6.16.04.01 4.31 2.46 4.31 2.46V4c0-.83.67-1.5 1.5-1.5S11 3.17 11 4v7h1V1.5c0-.83.67-1.5 1.5-1.5S15 .67 15 1.5V11h1V2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5V11h1V5.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5z',
  reset:
    'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
  exit: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  enlarge: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  shrink: 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z',
  sit: 'M7 11v2h10v-2c0-1.86 1.28-3.41 3-3.86V6c0-1.65-1.35-3-3-3H7C5.35 3 4 4.35 4 6v1.14c1.72.45 3 2 3 3.86zm14-2c-1.1 0-2 .9-2 2v4H5v-4c0-1.1-.9-2-2-2s-2 .9-2 2v5c0 1.1.9 2 2 2v3h2v-3h14v3h2v-3c1.1 0 2-.9 2-2v-5c0-1.1-.9-2-2-2z',
  stand:
    'M20.5 6c-2.61.7-5.67 1-8.5 1s-5.89-.3-8.5-1L3 8c1.86.5 4 .83 6 1v13h2v-6h2v6h2V9c2-.17 4.14-.5 6-1l-.5-2zM12 6c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z',
} as const;
export type ToolIcon = keyof typeof ICONS;

/** plain: white with dark ink; on: a tool that is on; accent: a button that leaves. */
export type ToolLook = 'plain' | 'on' | 'accent';
const LOOKS: Record<ToolLook, { bg: string; edge: string; ink: string; word: string }> = {
  plain: { bg: '#ffffff', edge: '#d5dae1', ink: '#2f3542', word: '#5b6270' },
  on: { bg: '#3fb6a0', edge: '#2f9a86', ink: '#ffffff', word: '#ffffff' },
  accent: { bg: '#3469c4', edge: '#2a56a3', ink: '#ffffff', word: '#ffffff' },
};
const FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
/** Canvas pixels per metre. */
const PX = 5120;

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function plane(w: number, h: number, canvas: HTMLCanvasElement): { mesh: Mesh; texture: CanvasTexture } {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  return { mesh, texture };
}

/** A toolbar button `w` by `h` metres, facing +Z; `set` draws it again with another icon, word or look. */
export class ToolButton {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private texture: CanvasTexture;

  constructor(
    private icon: ToolIcon,
    private word: string,
    w: number,
    h: number,
    private look: ToolLook = 'plain',
  ) {
    this.canvas.width = Math.round(w * PX);
    this.canvas.height = Math.round(h * PX);
    ({ mesh: this.mesh, texture: this.texture } = plane(w, h, this.canvas));
    this.paint();
    // Drawn again once the web font is in, should it not have been yet.
    void document.fonts?.ready.then(() => this.paint());
  }

  set(icon: ToolIcon = this.icon, look: ToolLook = this.look, word: string = this.word): void {
    if (icon === this.icon && look === this.look && word === this.word) return;
    this.icon = icon;
    this.look = look;
    this.word = word;
    this.paint();
  }

  private paint(): void {
    const c = this.canvas.getContext('2d')!;
    const { width: W, height: H } = this.canvas;
    const s = LOOKS[this.look];
    c.clearRect(0, 0, W, H);
    const line = Math.max(2, W * 0.025);
    roundRect(c, line, line, W - 2 * line, H - 2 * line, Math.min(W, H) * 0.2);
    c.fillStyle = s.bg;
    c.fill();
    c.lineWidth = line;
    c.strokeStyle = s.edge;
    c.stroke();
    const worded = this.word !== '';
    const size = Math.min(W, worded ? H * 0.62 : H) * 0.6;
    const cy = worded ? H * 0.4 : H / 2;
    c.save();
    c.translate(W / 2 - size / 2, cy - size / 2);
    c.scale(size / 24, size / 24);
    c.fillStyle = s.ink;
    c.fill(new Path2D(ICONS[this.icon]));
    c.restore();
    if (worded) {
      let px = H * 0.15;
      c.font = `700 ${px}px ${FONT}`;
      // A long word is made smaller to fit the tile.
      const room = W * 0.88;
      const wide = c.measureText(this.word).width;
      if (wide > room) {
        px *= room / wide;
        c.font = `700 ${px}px ${FONT}`;
      }
      c.fillStyle = s.word;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(this.word, W / 2, H * 0.8);
    }
    this.texture.needsUpdate = true;
  }
}

/** The white rounded tray a row of tool buttons sits on, with a soft shadow round it. */
export function toolTray(w: number, h: number): Mesh {
  const canvas = document.createElement('canvas');
  const pad = 0.006;
  canvas.width = Math.round((w + 2 * pad) * PX);
  canvas.height = Math.round((h + 2 * pad) * PX);
  const c = canvas.getContext('2d')!;
  const p = pad * PX;
  c.shadowColor = 'rgba(20, 30, 50, 0.35)';
  c.shadowBlur = p * 0.8;
  c.shadowOffsetY = p * 0.25;
  roundRect(c, p, p, w * PX, h * PX, Math.min(w, h) * PX * 0.18);
  c.fillStyle = '#f7f8fa';
  c.fill();
  return plane(w + 2 * pad, h + 2 * pad, canvas).mesh;
}
