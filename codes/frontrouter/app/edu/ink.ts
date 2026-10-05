import type { Lang } from "../legal";
import type { I18n } from "./catalog";

/**
 * What a lesson is made of, and the paper it is drawn on. A step's scene
 * draws itself into a canvas in sheet units (W by H) every frame and hears
 * the pointer in the same units, so the same scene runs on the page (touch,
 * mouse, a smartboard) and on a paper panel in VR (the controller's ray).
 */

export const W = 1000;
export const H = 625;

export type Pt = { x: number; y: number };

export interface Scene {
  /** `t` is seconds since the step opened. */
  draw(g: Ink, t: number): void;
  /** A paper button drawn with `g.button` was pressed. */
  press?(id: string): void;
  /** Return true to follow the pointer until it is let go. */
  down?(p: Pt): boolean | void;
  move?(p: Pt): void;
  up?(): void;
}

export interface Step {
  /** One or two sentences that guide, shown beside the sheet. */
  say: I18n;
  scene: (lang: Lang) => Scene;
}

export interface Lesson {
  steps: Step[];
}

export const C = {
  sand: "#e0c780",
  paper: "#fffdf8",
  field: "#f1e3c4",
  ink: "#3a3f4b",
  soft: "#5d6270",
  cobalt: "#3469c4",
  coral: "#f2716b",
  teal: "#3fb6a0",
  sun: "#ffd166",
  plum: "#9b6bc4",
  fold: "rgba(58, 63, 75, 0.14)",
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 to 1 over `len` seconds from `start`, eased in and out. */
export const ease = (t: number, start = 0, len = 1) => {
  const k = clamp((t - start) / len, 0, 1);
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
};
/** A gentle swing between 0 and 1, for things that breathe. */
export const pulse = (t: number, period = 1.6) => 0.5 - 0.5 * Math.cos((t / period) * Math.PI * 2);

const FONT = '"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif';

interface Hit {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The canvas with the paper look's own strokes, in sheet units. */
export class Ink {
  hits: Hit[] = [];
  /** Where the pointer is, for hover; null when it is away. */
  pointer: Pt | null = null;
  constructor(public c: CanvasRenderingContext2D) {}

  begin(scale: number) {
    const c = this.c;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    this.hits = [];
    c.fillStyle = C.paper;
    c.fillRect(0, 0, W, H);
  }

  hit(p: Pt) {
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h.id;
    }
    return null;
  }

  over(x: number, y: number, w: number, h: number) {
    const p = this.pointer;
    return Boolean(p && p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h);
  }

  /** A flat paper card lifted by the warm shadow, as on the page. */
  card(x: number, y: number, w: number, h: number, color: string = C.paper, lift = 1) {
    const c = this.c;
    if (lift > 0) {
      c.fillStyle = `rgba(70, 50, 25, ${0.22 * lift})`;
      c.fillRect(x + 3 * lift, y + 5 * lift, w, h);
    }
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }

  /** A crease: a faint line with a lighter one beside it. */
  crease(x1: number, y1: number, x2: number, y2: number) {
    const c = this.c;
    c.lineWidth = 2;
    c.strokeStyle = C.fold;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.strokeStyle = "rgba(255, 255, 255, 0.6)";
    c.beginPath();
    c.moveTo(x1 + 1.5, y1 + 1.5);
    c.lineTo(x2 + 1.5, y2 + 1.5);
    c.stroke();
  }

  text(s: string, x: number, y: number, size = 28, color: string = C.ink, align: CanvasTextAlign = "center", bold = false) {
    const c = this.c;
    c.font = `${bold ? 700 : 400} ${size}px ${FONT}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = "middle";
    c.fillText(s, x, y);
  }

  width(s: string, size = 28, bold = false) {
    this.c.font = `${bold ? 700 : 400} ${size}px ${FONT}`;
    return this.c.measureText(s).width;
  }

  /** A paper button; its press comes to the scene's `press`. */
  button(id: string, label: string, x: number, y: number, w: number, h = 52, color: string = C.cobalt, on = true) {
    const hover = on && this.over(x, y, w, h);
    this.card(x, y - (hover ? 2 : 0), w, h, on ? color : C.field, hover ? 1.4 : 1);
    this.text(label, x + w / 2, y + h / 2 - (hover ? 2 : 0), 24, on ? C.paper : C.soft, "center", true);
    if (on) this.hits.push({ id, x, y, w, h });
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string = C.ink, width = 3) {
    const c = this.c;
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  dot(x: number, y: number, r: number, color: string) {
    const c = this.c;
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  /** A drag handle: a paper tab that lifts when the pointer is near. */
  handle(x: number, y: number, active: boolean) {
    const near = active || this.over(x - 24, y - 24, 48, 48);
    this.dot(x + 2, y + 4, 18, "rgba(70, 50, 25, 0.25)");
    this.dot(x, y - (near ? 2 : 0), near ? 20 : 18, C.coral);
    this.dot(x, y - (near ? 2 : 0), 7, C.paper);
  }

  /**
   * A paper strip that folds in half along its middle as `k` goes 0 to 1:
   * the right half turns over onto the left, its back a shade darker.
   */
  foldStrip(x: number, y: number, w: number, h: number, k: number, front: string, back: string) {
    const half = w / 2;
    this.card(x, y, half, h, front, 1);
    if (k < 0.5) {
      const sw = half * (1 - 2 * k);
      this.card(x + half, y, sw, h, front, 1);
      this.c.fillStyle = `rgba(58, 63, 75, ${0.18 * k * 2})`;
      this.c.fillRect(x + half, y, sw, h);
    } else {
      const sw = half * (2 * k - 1);
      this.card(x + half - sw, y, sw, h, back, 1.3);
    }
  }
}

/** A sentence in both languages, picked by the page's language. */
export const say = (lang: Lang, s: I18n) => s[lang];
