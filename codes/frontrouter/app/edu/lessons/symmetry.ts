import type { Lang } from "../../legal";
import { C, clamp, ease, type Ink, type Lesson, type Pt, type Scene, W, lerp } from "../ink";
import { wrap } from "../parts";

const RAD = Math.PI / 180;

/** Text that shrinks until it fits `max`, never below 18. */
function fit(g: Ink, s: string, x: number, y: number, max: number, size: number, color: string = C.ink, align: CanvasTextAlign = "center", bold = true) {
  let z = size;
  while (z > 18 && g.width(s, z, bold) > max) z -= 1;
  g.text(s, x, y, z, color, align, bold);
}

/** Lines wrapped for bold text, drawn from `y` down. */
function para(g: Ink, s: string, x: number, y: number, width: number, size: number, color: string, align: CanvasTextAlign = "left") {
  wrap(g, s, width - 24, size).forEach((l, i) => g.text(l, x, y + i * (size + 8), size, color, align, true));
}

/** The part of a polygon on one side of the line through `c` with normal `n`. */
function clip(poly: Pt[], c: Pt, n: Pt, sign: 1 | -1) {
  const side = (p: Pt) => sign * ((p.x - c.x) * n.x + (p.y - c.y) * n.y);
  const out: Pt[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const k = sa / (sa - sb);
      out.push({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
    }
  });
  return out;
}

function fill(g: Ink, pts: Pt[], color: string, lift = 1) {
  if (pts.length < 3) return;
  const c = g.c;
  if (lift > 0) {
    c.fillStyle = `rgba(70, 50, 25, ${0.2 * Math.min(lift, 1.5)})`;
    c.beginPath();
    pts.forEach((p, i) => (i ? c.lineTo(p.x + 3 * lift, p.y + 5 * lift) : c.moveTo(p.x + 3 * lift, p.y + 5 * lift)));
    c.fill();
  }
  c.fillStyle = color;
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.fill();
}

/**
 * A paper shape folded along the line through `c` at `deg` degrees: the part on
 * one side turns over as `k` goes 0 to 1 and lies on the other, its back darker.
 */
function folded(g: Ink, poly: Pt[], c: Pt, deg: number, k: number, front: string, back: string) {
  const u = { x: Math.cos(deg * RAD), y: -Math.sin(deg * RAD) };
  const n = { x: -u.y, y: u.x };
  fill(g, clip(poly, c, n, -1), front, 1);
  const cos = Math.cos(Math.PI * k);
  const moved = clip(poly, c, n, 1).map((p) => {
    const a = (p.x - c.x) * u.x + (p.y - c.y) * u.y;
    const b = ((p.x - c.x) * n.x + (p.y - c.y) * n.y) * cos;
    return { x: c.x + a * u.x + b * n.x, y: c.y + a * u.y + b * n.y };
  });
  g.c.globalAlpha = cos < 0 ? 0.8 : 1;
  fill(g, moved, cos < 0 ? back : front, 1 + Math.sin(Math.PI * k));
  if (cos >= 0 && k > 0) {
    g.c.globalAlpha = 0.25 * (1 - cos);
    fill(g, moved, C.ink, 0);
  }
  g.c.globalAlpha = 1;
}

function dashed(g: Ink, c: Pt, deg: number, len: number, color: string, width = 3, dash = true) {
  const u = { x: Math.cos(deg * RAD), y: -Math.sin(deg * RAD) };
  if (dash) g.c.setLineDash([12, 9]);
  g.line(c.x - u.x * len, c.y - u.y * len, c.x + u.x * len, c.y + u.y * len, color, width);
  g.c.setLineDash([]);
}

/** Left halves from the top of the fold line to its bottom, in units of the shape's size. */
const HALVES: { en: string; id: string; half: [number, number][]; color: string }[] = [
  {
    en: "a heart",
    id: "hati",
    color: C.coral,
    half: [
      [0, -0.5],
      [-0.15, -0.8],
      [-0.4, -0.92],
      [-0.68, -0.85],
      [-0.88, -0.6],
      [-0.9, -0.3],
      [-0.75, 0.05],
      [-0.45, 0.42],
      [0, 0.9],
    ],
  },
  {
    en: "a butterfly",
    id: "kupu-kupu",
    color: C.plum,
    half: [
      [0, -0.55],
      [-0.25, -0.9],
      [-0.7, -0.95],
      [-0.92, -0.7],
      [-0.75, -0.25],
      [-0.2, -0.05],
      [-0.6, 0.15],
      [-0.75, 0.55],
      [-0.45, 0.8],
      [-0.12, 0.5],
      [0, 0.6],
    ],
  },
  {
    en: "a house",
    id: "rumah",
    color: C.teal,
    half: [
      [0, -0.95],
      [-0.85, -0.2],
      [-0.62, -0.2],
      [-0.62, 0.9],
      [0, 0.9],
    ],
  },
  {
    en: "the letter T",
    id: "huruf T",
    color: C.cobalt,
    half: [
      [0, -0.9],
      [-0.8, -0.9],
      [-0.8, -0.5],
      [-0.2, -0.5],
      [-0.2, 0.9],
      [0, 0.9],
    ],
  },
  {
    en: "an arrow",
    id: "panah",
    color: "#e0a040",
    half: [
      [0, -0.95],
      [-0.75, -0.1],
      [-0.32, -0.1],
      [-0.32, 0.92],
      [0, 0.92],
    ],
  },
];

/** A shape folded along its middle, by a button or by dragging its right half over: the halves match. */
function foldHalf(lang: Lang): Scene {
  let i = 0;
  let k = 0;
  let anim: { from: number; to: number; start: number } | null = null;
  let held = false;
  let now = 0;
  const cx = 320;
  const cy = 300;
  const s = 200;
  const xr = cx + s * 0.95;
  const shape = () => {
    const h = HALVES[i].half.map(([x, y]) => ({ x: cx + x * s, y: cy + y * s }));
    const mirror = h
      .slice(1, -1)
      .reverse()
      .map((p) => ({ x: 2 * cx - p.x, y: p.y }));
    return [...h, ...mirror];
  };
  const go = (to: number) => (anim = { from: k, to, start: now });
  return {
    press(id) {
      if (id === "fold") go(k > 0.5 ? 0 : 1);
      if (id === "next") {
        i = (i + 1) % HALVES.length;
        k = 0;
        anim = null;
      }
    },
    down(p) {
      if (Math.abs(p.x - cx) < xr - cx + 30 && Math.abs(p.y - cy) < s) {
        held = true;
        anim = null;
        return true;
      }
    },
    move(p) {
      k = clamp((xr - p.x) / (2 * (xr - cx)), 0, 1);
    },
    up() {
      held = false;
      go(k > 0.5 ? 1 : 0);
    },
    draw(g, t) {
      now = t;
      if (anim) {
        k = lerp(anim.from, anim.to, ease(t, anim.start, 0.9));
        if (t - anim.start > 0.9) anim = null;
      }
      const it = HALVES[i];
      folded(g, shape(), { x: cx, y: cy }, 90, k, it.color, "#c9b48a");
      dashed(g, { x: cx, y: cy }, 90, 235, C.ink, 3);

      const px = 610;
      const pw = 360;
      fit(g, lang === "id" ? it.id : it.en, px + pw / 2, 110, pw, 44, C.ink);
      const match = k > 0.97;
      if (match) {
        g.card(px, 170, pw, 150, C.sun, 1);
        para(
          g,
          lang === "id"
            ? "Kedua bagian tepat berimpit. Garis lipatan ini adalah sumbu simetri."
            : "The two halves match exactly. This fold line is a line of symmetry.",
          px + 20,
          205,
          pw - 20,
          26,
          C.ink,
        );
      } else {
        para(
          g,
          lang === "id" ? "Geser bagian kanan ke kiri, atau tekan LIPAT." : "Drag the right half over, or press FOLD.",
          px + 20,
          205,
          pw - 20,
          26,
          held ? C.soft : C.coral,
        );
      }
      g.button("fold", k > 0.5 ? (lang === "id" ? "BUKA" : "UNFOLD") : lang === "id" ? "LIPAT" : "FOLD", 40, 555, 200, 52, C.coral);
      g.button("next", lang === "id" ? "BENTUK LAIN" : "ANOTHER SHAPE", 260, 555, 260, 52, C.cobalt);
    },
  };
}

type Pts = [number, number][];
const SHAPES: { en: string; id: string; pts: Pts; lines: [number, boolean][]; color: string }[] = [
  {
    en: "square",
    id: "persegi",
    color: C.teal,
    pts: [
      [-150, -150],
      [150, -150],
      [150, 150],
      [-150, 150],
    ],
    lines: [
      [90, true],
      [0, true],
      [45, true],
      [135, true],
    ],
  },
  {
    en: "rectangle",
    id: "persegi panjang",
    color: C.cobalt,
    pts: [
      [-200, -100],
      [200, -100],
      [200, 100],
      [-200, 100],
    ],
    lines: [
      [90, true],
      [0, true],
      [Math.atan2(100, 200) / RAD, false],
    ],
  },
  {
    en: "equilateral triangle",
    id: "segitiga sama sisi",
    color: C.coral,
    pts: [
      [0, -190],
      [-164.5, 95],
      [164.5, 95],
    ],
    lines: [
      [90, true],
      [30, true],
      [150, true],
    ],
  },
  {
    en: "letter H",
    id: "huruf H",
    color: C.plum,
    pts: [
      [-120, -150],
      [-50, -150],
      [-50, -30],
      [50, -30],
      [50, -150],
      [120, -150],
      [120, 150],
      [50, 150],
      [50, 30],
      [-50, 30],
      [-50, 150],
      [-120, 150],
    ],
    lines: [
      [90, true],
      [0, true],
      [45, false],
    ],
  },
  {
    en: "parallelogram",
    id: "jajargenjang",
    color: "#e0a040",
    pts: [
      [-200, 100],
      [120, 100],
      [200, -100],
      [-120, -100],
    ],
    lines: [
      [90, false],
      [0, false],
      [Math.atan2(200, 400) / RAD, false],
    ],
  },
];

/** Fold a shape along one line after another: where the halves match, the line stays as a line of symmetry. */
function lines(lang: Lang): Scene {
  let i = 0;
  const tried = new Set<number>();
  let fold: { line: number; start: number } | null = null;
  let last: number | null = null;
  let now = 0;
  const c = { x: 360, y: 300 };
  return {
    press(id) {
      const shape = SHAPES[i];
      if (id === "fold" && !fold) {
        const next = shape.lines.findIndex((_, j) => !tried.has(j));
        if (next >= 0) fold = { line: next, start: now };
      }
      if (id === "next") {
        i = (i + 1) % SHAPES.length;
        tried.clear();
        fold = null;
        last = null;
      }
    },
    draw(g, t) {
      now = t;
      const shape = SHAPES[i];
      const poly = shape.pts.map(([x, y]) => ({ x: c.x + x, y: c.y + y }));
      if (fold && t - fold.start > 3.4) {
        tried.add(fold.line);
        last = fold.line;
        fold = null;
      }
      const k = fold ? ease(t, fold.start, 1.1) - ease(t, fold.start + 2.3, 1.1) : 0;
      if (fold) folded(g, poly, c, shape.lines[fold.line][0], k, shape.color, "#c9b48a");
      else fill(g, poly, shape.color, 1);
      shape.lines.forEach(([deg, match], j) => {
        if (fold?.line === j) dashed(g, c, deg, 235, C.ink, 3);
        else if (tried.has(j)) dashed(g, c, deg, 235, match ? C.ink : "rgba(242, 113, 107, 0.6)", match ? 5 : 3, !match);
      });
      const next = shape.lines.findIndex((_, j) => !tried.has(j));
      if (!fold && next >= 0) dashed(g, c, shape.lines[next][0], 235, "rgba(58, 63, 75, 0.35)", 2);

      const px = 640;
      const pw = 330;
      fit(g, lang === "id" ? shape.id : shape.en, px + pw / 2, 90, pw, 40, C.ink);
      const show = fold && t - fold.start > 1.1 ? fold.line : !fold ? last : null;
      if (show !== null) {
        const match = shape.lines[show][1];
        g.card(px, 140, pw, 130, match ? C.sun : C.field, 1);
        para(
          g,
          match
            ? lang === "id"
              ? "Kedua bagian tepat berimpit: ini sumbu simetri."
              : "The halves match: this is a line of symmetry."
            : lang === "id"
              ? "Kedua bagian tidak berimpit: ini bukan sumbu simetri."
              : "The halves do not match: this is not a line of symmetry.",
          px + 18,
          172,
          pw - 18,
          24,
          C.ink,
        );
      }
      const found = shape.lines.filter(([, m], j) => m && tried.has(j)).length;
      g.text(lang === "id" ? `sumbu simetri: ${found}` : `lines of symmetry: ${found}`, px + pw / 2, 320, 30, C.ink, "center", true);
      if (next < 0 && !fold) {
        const name = lang === "id" ? shape.id[0].toUpperCase() + shape.id.slice(1) : `${/^[aeiou]/u.test(shape.en) ? "An" : "A"} ${shape.en}`;
        const said = lang === "id" ? (found ? `${name} memiliki ${found} sumbu simetri.` : `${name} tidak memiliki sumbu simetri.`) : found ? `${name} has ${found} line${found === 1 ? "" : "s"} of symmetry.` : `${name} has no line of symmetry.`;
        para(g, said, px, 375, pw, 24, C.teal);
      }
      g.button("fold", lang === "id" ? "LIPAT" : "FOLD", 40, 555, 200, 52, C.coral, !fold && next >= 0);
      g.button("next", lang === "id" ? "BENTUK LAIN" : "ANOTHER SHAPE", 260, 555, 260, 52, C.cobalt);
    },
  };
}

const FIGURES: { cells: [number, number][]; mark: number }[] = [
  {
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [0, 3],
    ],
    mark: 2,
  },
  {
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
    ],
    mark: 5,
  },
  {
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
      [1, 3],
      [2, 3],
    ],
    mark: 3,
  },
];

/** A shape on a grid and its image in a mirror line: drag the shape and the image moves the other way. */
function mirror(lang: Lang): Scene {
  const S = 40;
  const cols = 22;
  const rows = 12;
  const x0 = (W - cols * S) / 2;
  const y0 = 30;
  let fig = 0;
  let upright = true;
  let at = { c: 3, r: 4 };
  let grab: { c: number; r: number } | null = null;
  const cellOf = (p: Pt) => ({ c: Math.floor((p.x - x0) / S), r: Math.floor((p.y - y0) / S) });
  const size = () => {
    const cs = FIGURES[fig].cells;
    return { w: Math.max(...cs.map(([c]) => c)) + 1, h: Math.max(...cs.map(([, r]) => r)) + 1 };
  };
  const place = (c: number, r: number) => {
    const { w, h } = size();
    at = upright ? { c: clamp(c, 0, cols / 2 - w), r: clamp(r, 0, rows - h) } : { c: clamp(c, 0, cols - w), r: clamp(r, 0, rows / 2 - h) };
  };
  return {
    press(id) {
      if (id === "turn") upright = !upright;
      if (id === "next") fig = (fig + 1) % FIGURES.length;
      place(at.c, at.r);
    },
    down(p) {
      const q = cellOf(p);
      const hit = FIGURES[fig].cells.some(([c, r]) => c + at.c === q.c && r + at.r === q.r);
      if (hit) {
        grab = { c: q.c - at.c, r: q.r - at.r };
        return true;
      }
    },
    move(p) {
      if (!grab) return;
      const q = cellOf(p);
      place(q.c - grab.c, q.r - grab.r);
    },
    up() {
      grab = null;
    },
    draw(g, t) {
      g.card(x0, y0, cols * S, rows * S, C.paper, 0.6);
      for (let i = 0; i <= cols; i++) g.line(x0 + i * S, y0, x0 + i * S, y0 + rows * S, "rgba(58, 63, 75, 0.12)", 1);
      for (let j = 0; j <= rows; j++) g.line(x0, y0 + j * S, x0 + cols * S, y0 + j * S, "rgba(58, 63, 75, 0.12)", 1);
      const image = (c: number, r: number) => (upright ? { c: cols - 1 - c, r } : { c, r: rows - 1 - r });
      const { cells, mark } = FIGURES[fig];
      const lift = grab ? 1.6 : 1;
      const k = ease(t, 0.3, 0.8);
      cells.forEach(([c, r], i) => {
        const a = { c: c + at.c, r: r + at.r };
        const b = image(a.c, a.r);
        g.card(x0 + a.c * S + 2, y0 + a.r * S + 2 - (grab ? 3 : 0), S - 4, S - 4, i === mark ? C.sun : C.cobalt, lift);
        g.c.globalAlpha = k;
        g.card(x0 + b.c * S + 2, y0 + b.r * S + 2, S - 4, S - 4, i === mark ? C.sun : C.teal, 0.8);
        g.c.globalAlpha = 1;
      });
      // The mirror line, and the marked square's distance on both sides.
      const m = cells[mark];
      const a = { c: m[0] + at.c, r: m[1] + at.r };
      const b = image(a.c, a.r);
      const ax = x0 + a.c * S + S / 2;
      const ay = y0 + a.r * S + S / 2;
      const bx = x0 + b.c * S + S / 2;
      const by = y0 + b.r * S + S / 2;
      g.c.setLineDash([6, 6]);
      g.line(ax, ay, bx, by, C.coral, 3);
      g.c.setLineDash([]);
      const d = upright ? cols / 2 - a.c : rows / 2 - a.r;
      const lx = upright ? x0 + (cols / 2) * S : x0;
      const ly = upright ? y0 : y0 + (rows / 2) * S;
      if (upright) g.line(lx, y0 - 6, lx, y0 + rows * S + 6, C.plum, 6);
      else g.line(x0 - 6, ly, x0 + cols * S + 6, ly, C.plum, 6);
      const midA = { x: upright ? (ax + lx) / 2 : ax, y: upright ? ay : (ay + ly) / 2 };
      const midB = { x: upright ? (bx + lx) / 2 : bx, y: upright ? by : (by + ly) / 2 };
      [midA, midB].forEach((q) => {
        g.card(q.x - 18, q.y - 34 + (upright ? 0 : 16), 36, 30, C.paper, 0.8);
        g.text(String(d), q.x, q.y - 19 + (upright ? 0 : 16), 22, C.coral, "center", true);
      });
      const label = lang === "id" ? "garis cermin" : "mirror line";
      const lw = g.width(label, 20, true) + 20;
      if (upright) {
        g.card(lx + 10, y0 + rows * S - 44, lw, 34, C.plum, 0.6);
        g.text(label, lx + 10 + lw / 2, y0 + rows * S - 27, 20, C.paper, "center", true);
      } else {
        g.card(x0 + cols * S - lw - 10, ly + 10, lw, 34, C.plum, 0.6);
        g.text(label, x0 + cols * S - 10 - lw / 2, ly + 27, 20, C.paper, "center", true);
      }
      fit(g, lang === "id" ? "jaraknya sama dari garis cermin" : "the same distance from the mirror line", 785, 581, 400, 22, C.soft);
      g.button("turn", lang === "id" ? "PUTAR CERMIN" : "TURN THE MIRROR", 40, 555, 260, 52, C.plum);
      g.button("next", lang === "id" ? "BENTUK LAIN" : "ANOTHER SHAPE", 320, 555, 250, 52, C.cobalt);
    },
  };
}

const PAINTS = [C.coral, C.teal, C.cobalt, C.sun];
const BUTTERFLY = ["......b.", ".ccc...b", "cscccc.b", "cssccc.b", ".ccccc.b", "...ttt.b", "..tstt.b", "..tttt.b", "...tt..b", "........"];
const KEY: Record<string, string> = { c: C.coral, t: C.teal, b: C.cobalt, s: C.sun };

/** Paint squares on one side of a line of symmetry: the mirror paints the matching square on the other. */
function paint(lang: Lang): Scene {
  const S = 44;
  const cols = 16;
  const rows = 10;
  const x0 = (W - cols * S) / 2;
  const y0 = 30;
  const cells = new Map<string, { color: string; born: number }>();
  let color = 0;
  let erase = false;
  let now = 0;
  const cellOf = (p: Pt) => ({ c: Math.floor((p.x - x0) / S), r: Math.floor((p.y - y0) / S) });
  const inside = (q: { c: number; r: number }) => q.c >= 0 && q.c < cols && q.r >= 0 && q.r < rows;
  const set = (c: number, r: number) => {
    const key = `${c},${r}`;
    const twin = `${cols - 1 - c},${r}`;
    if (erase) {
      cells.delete(key);
      cells.delete(twin);
      return;
    }
    if (cells.get(key)?.color === PAINTS[color]) return;
    cells.set(key, { color: PAINTS[color], born: now });
    cells.set(twin, { color: PAINTS[color], born: now + 0.2 });
  };
  return {
    press(id) {
      if (id.startsWith("p")) color = Number(id.slice(1));
      if (id === "clear") cells.clear();
      if (id === "example") {
        cells.clear();
        BUTTERFLY.forEach((row, r) =>
          [...row].forEach((ch, c) => {
            if (!KEY[ch]) return;
            cells.set(`${c},${r}`, { color: KEY[ch], born: now + r * 0.08 });
            cells.set(`${cols - 1 - c},${r}`, { color: KEY[ch], born: now + r * 0.08 + 0.4 });
          }),
        );
      }
    },
    down(p) {
      const q = cellOf(p);
      if (!inside(q)) return;
      erase = cells.get(`${q.c},${q.r}`)?.color === PAINTS[color];
      set(q.c, q.r);
      return true;
    },
    move(p) {
      const q = cellOf(p);
      if (inside(q)) set(q.c, q.r);
    },
    draw(g, t) {
      now = t;
      g.card(x0, y0, cols * S, rows * S, C.paper, 0.6);
      for (let i = 0; i <= cols; i++) g.line(x0 + i * S, y0, x0 + i * S, y0 + rows * S, "rgba(58, 63, 75, 0.12)", 1);
      for (let j = 0; j <= rows; j++) g.line(x0, y0 + j * S, x0 + cols * S, y0 + j * S, "rgba(58, 63, 75, 0.12)", 1);
      cells.forEach((v, key) => {
        const k = ease(t, v.born, 0.3);
        if (k <= 0) return;
        const [c, r] = key.split(",").map(Number);
        const s = (S - 4) * lerp(0.4, 1, k);
        g.card(x0 + c * S + S / 2 - s / 2, y0 + r * S + S / 2 - s / 2, s, s, v.color, 0.7);
      });
      const lx = x0 + (cols / 2) * S;
      g.line(lx, y0 - 8, lx, y0 + rows * S + 8, C.plum, 5);
      const label = lang === "id" ? "sumbu simetri" : "line of symmetry";
      g.text(label, lx, y0 + rows * S + 32, 22, C.plum, "center", true);
      PAINTS.forEach((p, i) => {
        g.button(`p${i}`, "", 40 + i * 72, 555, 60, 52, p);
        if (i === color) g.dot(70 + i * 72, 581, 9, C.paper);
      });
      g.button("clear", lang === "id" ? "HAPUS" : "CLEAR", 560, 555, 180, 52, C.soft, cells.size > 0);
      g.button("example", lang === "id" ? "CONTOH" : "EXAMPLE", 760, 555, 200, 52, C.plum);
    },
  };
}

export const lesson: Lesson = {
  steps: [
    {
      say: {
        en: "Fold the shape along the line. When the two halves lie exactly on each other, the fold line is a line of symmetry.",
        id: "Lipat bangun itu di sepanjang garis. Bila kedua bagian tepat berimpit, garis lipatan itu adalah sumbu simetri.",
      },
      scene: foldHalf,
    },
    {
      say: {
        en: "Some shapes can be folded to match in more than one way. Fold along each line and count the lines of symmetry.",
        id: "Ada bangun yang bisa dilipat berimpit dengan lebih dari satu cara. Lipat di setiap garis dan hitung sumbu simetrinya.",
      },
      scene: lines,
    },
    {
      say: {
        en: "In a reflection every square of the image is as far from the mirror line as the square it comes from. Drag the blue shape.",
        id: "Pada pencerminan, setiap kotak bayangan sama jauhnya dari garis cermin dengan kotak asalnya. Geser bangun biru itu.",
      },
      scene: mirror,
    },
    {
      say: {
        en: "Paint squares on one side and the mirror paints the other side. The picture you make is symmetrical.",
        id: "Warnai kotak di satu sisi, cermin akan mewarnai sisi lainnya. Gambar yang kamu buat menjadi simetris.",
      },
      scene: paint,
    },
  ],
};
