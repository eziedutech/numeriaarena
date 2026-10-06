import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

/**
 * Flat toolbar buttons for the headset, drawn as a web app's are: a square
 * paper strip in one soft tint, thin lines between its cells, a large line
 * icon in each with its word under it, and the strip's end folded over.
 * The icons are Lucide's (ISC licence), stroked on a 24 unit grid.
 */
const ICONS = {
  zoomIn: ['M19 11a8 8 0 1 0-16 0a8 8 0 1 0 16 0', 'M21 21l-4.35-4.35', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M19 11a8 8 0 1 0-16 0a8 8 0 1 0 16 0', 'M21 21l-4.35-4.35', 'M8 11h6'],
  pan: [
    'M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2',
    'M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2',
    'M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  ],
  shown: ['M2.06 12.35a1 1 0 0 1 0-.7a10.75 10.75 0 0 1 19.88 0a1 1 0 0 1 0 .7a10.75 10.75 0 0 1-19.88 0', 'M15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0'],
  hidden: [
    'M10.73 5.08a10.74 10.74 0 0 1 11.21 6.57a1 1 0 0 1 0 .7a10.75 10.75 0 0 1-1.45 2.49',
    'M14.08 14.16a3 3 0 0 1-4.24-4.24',
    'M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15a1 1 0 0 1 0-.7a10.75 10.75 0 0 1 4.45-5.14',
    'M2 2l20 20',
  ],
  room: [
    'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8',
    'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  ],
  exit: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  enlarge: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  turnLeft: ['M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  turnRight: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  check: ['M20 6L9 17l-5-5'],
  shrink: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
  sit: [
    'M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3',
    'M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z',
    'M5 18v2',
    'M19 18v2',
  ],
  stand: ['M13 5a1 1 0 1 0-2 0a1 1 0 1 0 2 0', 'M9 20l3-6 3 6', 'M6 8l6 2 6-2', 'M12 10v4'],
  envelope: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M22 7l-8.991 5.727a2 2 0 0 1-2.009 0L2 7'],
  language: ['M22 12a10 10 0 1 0-20 0a10 10 0 1 0 20 0', 'M12 2a14.5 14.5 0 0 0 0 20a14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  bigText: ['M21 14h-5', 'M16 16v-3.5a2.5 2.5 0 0 1 5 0V16', 'M4.5 13h6', 'M3 16l4.5-9 4.5 9'],
  sound: ['M11 5L6 9H2v6h4l5 4z', 'M15.54 8.46a5 5 0 0 1 0 7.07', 'M19.07 4.93a10 10 0 0 1 0 14.14'],
  soundOff: ['M11 5L6 9H2v6h4l5 4z', 'M22 9l-6 6', 'M16 9l6 6'],
  music: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 0-6 0a3 3 0 1 0 6 0', 'M21 16a3 3 0 1 0-6 0a3 3 0 1 0 6 0'],
  musicOff: ['M9 18V5l12-2v13', 'M9 18a3 3 0 1 0-6 0a3 3 0 1 0 6 0', 'M21 16a3 3 0 1 0-6 0a3 3 0 1 0 6 0', 'M3 3l18 18'],
  // The home page's accessibility figure, filled, not stroked.
  access: ['M15.2 5a3.2 3.2 0 1 0-6.4 0a3.2 3.2 0 1 0 6.4 0', 'M3 9h18v3h-6v10h-3v-6h0v6H9V12H3z'],
  // The games, one picture each: a race flag, a balloon, an orb on its stand,
  // a factory, an arched bridge and a balance.
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  balloon: ['M12 16c3.3 0 6-3.1 6-7a6 6 0 0 0-12 0c0 3.9 2.7 7 6 7z', 'M11 16l-1 2h4l-1-2z', 'M12 18c0 2-2 2-1 4', 'M9 7.5a3.5 3.5 0 0 1 2-2'],
  orb: ['M19 11a7 7 0 1 0-14 0a7 7 0 1 0 14 0', 'M8.5 9.5a4 4 0 0 1 2.5-3', 'M7 21h10', 'M9 17.2L8 21', 'M15 17.2l1 3.8'],
  factory: [
    'M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z',
    'M17 18h1',
    'M12 18h1',
    'M7 18h1',
  ],
  bridge: ['M2 8h20v12h-3v-2a7 7 0 0 0-14 0v2H2z', 'M2 12h20', 'M7 8v4', 'M12 8v4', 'M17 8v4'],
  balance: [
    'M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z',
    'M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z',
    'M7 21h10',
    'M12 3v18',
    'M3 7h2c2 0 5-1 7-2c2 1 5 2 7 2h2',
  ],
} as const;
export type ToolIcon = keyof typeof ICONS;
/** Icons drawn as filled shapes. */
const FILLED = new Set<ToolIcon>(['access']);

/** plain: on the strip's tint; on: a tool that is on; off: a sound that is off, faded; accent: a button that leaves. */
export type ToolLook = 'plain' | 'on' | 'off' | 'accent';
/**
 * peach: Fold Town's tools. home: the desk menu, in the home page's colours:
 * cream paper, blue icons, teal for what is on, coral for HOME.
 */
export type ToolTheme = 'peach' | 'home';
interface Palette {
  paper: string;
  line: string;
  fold: string;
  title: string;
  looks: Record<ToolLook, { bg: string; ink: string }>;
}
const PALETTES: Record<ToolTheme, Palette> = {
  peach: {
    paper: '#fbe4d7',
    line: '#f0b796',
    fold: '#f5c3a6',
    title: '#c94f17',
    looks: {
      plain: { bg: '', ink: '#e8672b' },
      on: { bg: '#f6c4a7', ink: '#c94f17' },
      off: { bg: '', ink: '#f0b796' },
      accent: { bg: '#e8672b', ink: '#ffffff' },
    },
  },
  home: {
    paper: '#fff8ec',
    line: '#e6d5b8',
    fold: '#efe1c8',
    title: '#3a3f4b',
    looks: {
      plain: { bg: '', ink: '#3469c4' },
      on: { bg: '#3fb6a0', ink: '#fff8ec' },
      off: { bg: '', ink: '#a3b9e0' },
      accent: { bg: '#f2716b', ink: '#ffffff' },
    },
  },
};
const { paper: PAPER, fold: FOLD } = PALETTES.peach;
const FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';
/** Canvas pixels per metre. */
const PX = 5120;
/** The icon's stroke on its 24 unit grid: thin, as a web icon's. */
const STROKE = 1.3;

/**
 * The strip is drawn solid, its folded off corner cut by alphaTest, and the
 * cells over it see through without writing depth: two see-through planes so
 * close are sorted again as the view moves, and the strip would sometimes be
 * drawn after the cells and hidden by their clear parts.
 */
function plane(w: number, h: number, canvas: HTMLCanvasElement, solid: boolean): { mesh: Mesh; texture: CanvasTexture } {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = solid
    ? new MeshBasicMaterial({ map: texture, alphaTest: 0.5, toneMapped: false })
    : new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(w, h), material);
  if (!solid) mesh.renderOrder = 10;
  return { mesh, texture };
}

export interface ToolOptions {
  /** A thin line down its right edge, to the next cell. */
  divider?: boolean;
  /** Standing on its own, not on a strip: it draws its own paper and a thin edge. */
  alone?: boolean;
  /** Alone, but without the thin edge (a chip with a shadow under it). */
  bare?: boolean;
  /** The icon in this colour instead of the look's ink, its first outline filled with a light wash of it. */
  tint?: string;
  /** Its letters this many metres tall, however tall the cell. */
  wordH?: number;
  /** Not a button but a heading: no icon, its lines larger and centred in the cell. */
  title?: boolean;
  /** Its colours; peach unless given. */
  theme?: ToolTheme;
  /** The icon's line on its 24 unit grid, thin unless given. */
  stroke?: number;
  /** Choices written beside the icon, the one at `on` filled in blue, as the home page's language chip. */
  segments?: { labels: string[]; on: number };
}

/** A toolbar cell `w` by `h` metres, facing +Z; `set` draws it again with another icon, look or word. */
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
    private opts: ToolOptions = {},
  ) {
    this.canvas.width = Math.round(w * PX);
    this.canvas.height = Math.round(h * PX);
    ({ mesh: this.mesh, texture: this.texture } = plane(w, h, this.canvas, false));
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
    const p = PALETTES[this.opts.theme ?? 'peach'];
    const s = p.looks[this.look];
    const hair = Math.max(1.5, W * 0.008);
    c.clearRect(0, 0, W, H);
    if (this.opts.alone) {
      c.fillStyle = p.paper;
      c.fillRect(0, 0, W, H);
    }
    if (s.bg) {
      c.fillStyle = s.bg;
      c.fillRect(0, 0, W, H);
    }
    if (this.opts.alone && !this.opts.bare) {
      c.lineWidth = hair;
      c.strokeStyle = p.line;
      c.strokeRect(hair / 2, hair / 2, W - hair, H - hair);
    }
    if (this.opts.divider) {
      c.fillStyle = p.line;
      c.fillRect(W - hair, H * 0.1, hair, H * 0.8);
    }
    // A word with a line break is two lines under a smaller icon: a caption over its value.
    const lines = this.word === '' ? [] : this.word.split('\n');
    if (this.opts.title) {
      this.heading(c, lines, W, H, p.title);
      return;
    }
    const two = lines.length > 1;
    const seg = this.opts.segments;
    const size = two ? Math.min(W * 0.6, H * 0.44) : lines.length ? Math.min(W * 0.66, H * 0.56) : Math.min(W, H) * 0.65;
    const cy = two ? H * 0.31 : lines.length ? H * 0.4 : H / 2;
    // With choices beside it the icon keeps to the left end, a square cell's width.
    const cx = seg ? H / 2 : W / 2;
    const ink = this.opts.tint ?? s.ink;
    c.save();
    c.translate(cx - size / 2, cy - size / 2);
    c.scale(size / 24, size / 24);
    if (this.opts.tint) {
      c.fillStyle = this.opts.tint;
      c.globalAlpha = 0.22;
      c.fill(new Path2D(ICONS[this.icon][0]));
      c.globalAlpha = 1;
    }
    c.strokeStyle = c.fillStyle = ink;
    c.lineWidth = this.opts.stroke ?? (this.opts.tint ? STROKE * 1.4 : STROKE);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const d of ICONS[this.icon]) {
      if (FILLED.has(this.icon)) c.fill(new Path2D(d));
      else c.stroke(new Path2D(d));
    }
    c.restore();
    if (seg) this.segments(c, seg, W, H, p);
    lines.forEach((line, i) => {
      let px = this.opts.wordH ? this.opts.wordH * PX : H * (two ? 0.12 : 0.13);
      c.font = `700 ${px}px ${FONT}`;
      // A long word is made smaller to fit the cell.
      const room = W * 0.86;
      const wide = c.measureText(line).width;
      if (wide > room) {
        px *= room / wide;
        c.font = `700 ${px}px ${FONT}`;
      }
      c.fillStyle = s.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(line, W / 2, two ? H * (0.67 + 0.17 * i) : H * 0.82);
    });
    this.texture.needsUpdate = true;
  }

  private segments(c: CanvasRenderingContext2D, seg: { labels: string[]; on: number }, W: number, H: number, p: Palette): void {
    const x0 = H * 0.92;
    const sw = (W - x0 - H * 0.12) / seg.labels.length;
    c.font = `700 ${H * 0.36}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    seg.labels.forEach((l, i) => {
      const x = x0 + i * sw;
      if (i === seg.on) {
        c.fillStyle = p.looks.plain.ink;
        c.fillRect(x + sw * 0.06, H * 0.2, sw * 0.88, H * 0.6);
      }
      c.fillStyle = i === seg.on ? p.paper : p.title;
      c.fillText(l, x + sw / 2, H / 2);
    });
  }

  private heading(c: CanvasRenderingContext2D, lines: string[], W: number, H: number, ink: string): void {
    const px = (this.opts.wordH ? this.opts.wordH * PX : H * 0.13) * 1.35;
    c.font = `700 ${px}px ${FONT}`;
    const wide = Math.max(...lines.map((l) => c.measureText(l).width));
    const fit = Math.min(1, (W * 0.86) / wide);
    c.font = `700 ${px * fit}px ${FONT}`;
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const step = px * fit * 1.2;
    lines.forEach((l, i) => c.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * step));
    this.texture.needsUpdate = true;
  }
}

/** The square paper strip a row of cells lies on, its right end's top corner folded over by `fold` metres. */
export function toolTray(w: number, h: number, fold: number, theme: ToolTheme = 'peach'): Mesh {
  const p = PALETTES[theme];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PX);
  canvas.height = Math.round(h * PX);
  const c = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const f = fold * PX;
  c.fillStyle = p.paper;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(W - f, 0);
  c.lineTo(W, f);
  c.lineTo(W, H);
  c.lineTo(0, H);
  c.closePath();
  c.fill();
  // The folded corner, lying on the strip.
  c.fillStyle = p.fold;
  c.beginPath();
  c.moveTo(W - f, 0);
  c.lineTo(W, f);
  c.lineTo(W - f, f);
  c.closePath();
  c.fill();
  return plane(w, h, canvas, true).mesh;
}

/** A soft shadow's canvas pixels per metre: it is blurred, so few are needed. */
const SHADOW_PX = 1500;

/**
 * A soft black shadow for a card `w` by `h` metres, as the home page's chips
 * cast: a plane `blur` metres wider all round, drawn before the card and
 * without writing depth, to lie just behind it.
 */
export function softShadow(w: number, h: number, blur: number, alpha = 0.28): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((w + 2 * blur) * SHADOW_PX);
  canvas.height = Math.round((h + 2 * blur) * SHADOW_PX);
  const c = canvas.getContext('2d')!;
  const b = blur * SHADOW_PX;
  c.filter = `blur(${b / 2.5}px)`;
  c.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  c.fillRect(b, b, canvas.width - 2 * b, canvas.height - 2 * b);
  const { mesh } = plane(w + 2 * blur, h + 2 * blur, canvas, false);
  mesh.renderOrder = 9;
  return mesh;
}

/** A text panel's canvas pixels per metre: sharp letters, and light enough to draw again each second. */
const PANEL_PX = 3000;

/** A line of a text panel: its words, its letters' size in metres, its ink. */
export interface PanelLine {
  text: string;
  size: number;
  ink: string;
}

/**
 * A paper panel in the strip's tint with lines of text written on it, left
 * aligned and cut to fit `maxW` metres, sharp at the toolbar's resolution;
 * `foot` metres are left clear under the text for cells laid on it. The panel
 * is no narrower than `minW`. Returns the solid mesh with its origin at the
 * middle of its foot, and its size.
 */
export function textPanel(lines: PanelLine[], maxW: number, minW: number, pad: number, foot: number, fold: number): { mesh: Mesh; w: number; h: number } {
  const c = document.createElement('canvas').getContext('2d')!;
  const font = (size: number) => `700 ${size * PANEL_PX}px ${FONT}`;
  const rows: { text: string; size: number; ink: string }[] = [];
  let wide = 0;
  for (const l of lines) {
    if (!l.text) {
      rows.push({ text: '', size: l.size, ink: l.ink });
      continue;
    }
    c.font = font(l.size);
    const room = (maxW - 2 * pad) * PANEL_PX;
    let line = '';
    for (const word of l.text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > room) {
        rows.push({ text: line, size: l.size, ink: l.ink });
        wide = Math.max(wide, c.measureText(line).width);
        line = word;
      } else line = next;
    }
    rows.push({ text: line, size: l.size, ink: l.ink });
    wide = Math.max(wide, c.measureText(line).width);
  }
  const w = Math.max(minW, Math.min(maxW, wide / PANEL_PX + 2 * pad));
  const textH = rows.reduce((a, r) => a + r.size * 1.3, 0);
  const h = textH + 2 * pad + foot;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PANEL_PX);
  canvas.height = Math.round(h * PANEL_PX);
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const f = fold * PANEL_PX;
  g.fillStyle = PAPER;
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(W - f, 0);
  g.lineTo(W, f);
  g.lineTo(W, canvas.height);
  g.lineTo(0, canvas.height);
  g.closePath();
  g.fill();
  g.fillStyle = FOLD;
  g.beginPath();
  g.moveTo(W - f, 0);
  g.lineTo(W, f);
  g.lineTo(W - f, f);
  g.closePath();
  g.fill();
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  let y = pad * PANEL_PX;
  for (const r of rows) {
    const step = r.size * 1.3 * PANEL_PX;
    if (r.text) {
      g.font = font(r.size);
      g.fillStyle = r.ink;
      g.fillText(r.text, pad * PANEL_PX, y + step / 2);
    }
    y += step;
  }
  const mesh = plane(w, h, canvas, true).mesh;
  mesh.geometry.translate(0, h / 2, 0);
  return { mesh, w, h };
}
